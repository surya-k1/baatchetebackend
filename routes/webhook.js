// ============================================================
//  BaatChete — routes/webhook.js  (FINAL)
//
//  FLOW:
//  Normal: AI reply → user confirms connect → payment link
//          → payment webhook → match.js → session.js → audio link
//
//  Crisis: warm reply sent immediately
//          + payment link sent right after (no wait)
//          → payment webhook → match.js → session.js → audio link
// ============================================================

const router = require('express').Router();
const twilio = require('twilio');
const { handleMessage } = require('../aiEngine');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ──────────────────────────────────────────────
//  CREATE RAZORPAY PAYMENT LINK
// ──────────────────────────────────────────────
async function createRazorpayLink(sessionId, price) {
  if (!process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID.includes('xxxx')) {
    // Demo mode — return placeholder link
    return `https://rzp.io/l/baatchete-${sessionId.slice(0, 8)}`;
  }

  try {
    const creds = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${creds}` },
      body: JSON.stringify({
        amount:      price * 100,
        currency:    'INR',
        description: 'BaatChete — Mental Wellness Session',
        reference_id: sessionId,
        options: { checkout: { name: 'BaatChete', prefill: { contact: '' } } },
        expire_by: Math.floor(Date.now() / 1000) + 86400,
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.short_url;
  } catch (err) {
    console.error('[Webhook] Razorpay error:', err.message);
    return `https://rzp.io/l/baatchete-${sessionId.slice(0, 8)}`;
  }
}

// ──────────────────────────────────────────────
//  GET LISTENER NAME FROM FIREBASE
// ──────────────────────────────────────────────
async function getListenerName(db, phone) {
  if (!db) return null;
  try {
    const snap = await db.collection('sessions').doc(phone.replace(/\W/g, '')).get();
    if (!snap.exists) return null;
    const lid = snap.data()?.matchedListenerId;
    if (!lid) return null;
    const lSnap = await db.collection('listeners').doc(lid).get();
    return lSnap.exists ? (lSnap.data()?.name || null) : null;
  } catch (err) {
    console.error('[Webhook] getListenerName error:', err.message);
    return null;
  }
}

// ──────────────────────────────────────────────
//  MAIN WEBHOOK HANDLER
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  const userMessage = req.body.Body?.trim();
  const userPhone   = req.body.From;

  if (!userMessage || !userPhone) return res.sendStatus(400);
  console.log(`[Webhook] ${userPhone}: "${userMessage}"`);

  try {
    const db           = req.app.locals.db;
    const listenerName = await getListenerName(db, userPhone);

    // Generate session ID for payment tracking
    const sessionId  = `sess-${userPhone.replace(/\W/g, '')}-${Date.now()}`;
    const price      = 199; // Will be overridden by tier price from result

    // Create payment URL (real or demo)
    const paymentUrl = await createRazorpayLink(sessionId, price);

    const result = await handleMessage(db, userPhone, userMessage, listenerName, paymentUrl);

    // ── Send primary reply ────────────────────────────────────
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to:   userPhone,
      body: result.reply,
    });

    // ── Crisis: also send payment message immediately after ───
    if (result.isCrisis && result.paymentMessage) {
      // Small delay so messages arrive in order
      setTimeout(async () => {
        try {
          await twilioClient.messages.create({
            from: process.env.TWILIO_WHATSAPP_FROM,
            to:   userPhone,
            body: result.paymentMessage,
          });
          console.log(`[Webhook] Crisis payment message sent to ${userPhone}`);
        } catch (err) {
          console.error('[Webhook] Crisis payment msg error:', err.message);
        }
      }, 1500);
    }

    // ── Trigger matchmaking when truly ready ─────────────────
    // For crisis: trigger immediately after payment message sends
    // For normal: trigger after payment confirmed (Razorpay webhook)
    if (result.action === 'match_counselor' && result.isCrisis) {
      // Crisis: trigger match after short delay
      setTimeout(() => {
        triggerMatchmaking(req, userPhone, result);
      }, 3000);
    } else if (result.action && result.action !== 'continue' && result.action !== 'payment_pending') {
      triggerMatchmaking(req, userPhone, result);
    }

    res.sendStatus(200);

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    try {
      await twilioClient.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to:   userPhone,
        body: 'Ek second ruk jaiye... main yahan hoon. 🙏',
      });
    } catch (_) {}
    res.sendStatus(500);
  }
});

// ──────────────────────────────────────────────
//  RAZORPAY PAYMENT WEBHOOK
//  Fires when user completes payment
//  → triggers match.js → session.js → audio link
// ──────────────────────────────────────────────
router.post('/payment-webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('[Webhook] Razorpay event:', event.event);

    if (event.event === 'payment_link.paid') {
      const phone      = event.payload?.payment_link?.entity?.reference_id?.split('-')[1];
      const sessionId  = event.payload?.payment_link?.entity?.reference_id;

      if (phone) {
        const formattedPhone = `whatsapp:+${phone}`;
        console.log(`[Webhook] Payment confirmed for ${formattedPhone}`);

        // Trigger matchmaking now that payment is confirmed
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        await fetch(`${baseUrl}/match`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone:    formattedPhone,
            sessionId,
            paymentConfirmed: true,
          }),
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Webhook] Payment webhook error:', err.message);
    res.sendStatus(500);
  }
});

// ──────────────────────────────────────────────
//  TRIGGER MATCH → match.js
// ──────────────────────────────────────────────
function triggerMatchmaking(req, userPhone, result) {
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  fetch(`${baseUrl}/match`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone:    userPhone,
      issue:    result.triage?.category     || 'unclear',
      severity: result.triage?.severity     || 1,
      tier:     result.triage?.listenerTier || 'peer',
      tierTag:  result.triage?.tierTag      || 'Green',
      price:    result.triage?.price        || 99,
      brief:    result.brief                || '',
    }),
  }).catch(err => console.error('[Webhook] Match error:', err.message));
}

module.exports = router;
