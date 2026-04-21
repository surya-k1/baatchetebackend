// ============================================================
//  BaatChete — routes/webhook.js  (FIXED v2)
//
//  FLOW — ALL tiers same:
//  User message → AI reply → payment link → payment done
//  → match.js → session.js → audio link
//
//  Crisis = Red tier (₹299) — same flow, no skip
//  Green  = ₹99  | Yellow = ₹199 | Red/Crisis = ₹299
// ============================================================

const router = require('express').Router();
const twilio = require('twilio');
const { handleMessage } = require('../aiEngine');

let twilioClient = null;
let TWILIO_FROM  = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    console.warn('[Webhook] Twilio not configured — messages will NOT send');
    return null;
  }
  TWILIO_FROM  = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  twilioClient = twilio(sid, token);
  return twilioClient;
}

async function sendWhatsApp(to, body) {
  const client = getTwilioClient();
  if (!client || !TWILIO_FROM) {
    console.log(`[Webhook] DEMO — Would send to ${to}:\n${body}\n`);
    return;
  }
  await client.messages.create({ from: TWILIO_FROM, to, body });
}

async function createRazorpayLink(sessionId, price) {
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('xxxx')) {
    return `https://rzp.io/l/baatchete-${sessionId.slice(0, 8)}`;
  }
  try {
    const creds = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${creds}` },
      body: JSON.stringify({
        amount: price * 100, currency: 'INR',
        description: 'BaatChete — Mental Wellness Session',
        reference_id: sessionId,
        options: { checkout: { name: 'BaatChete', prefill: { contact: '' } } },
        expire_by: Math.floor(Date.now() / 1000) + 86400,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).short_url;
  } catch (err) {
    console.error('[Webhook] Razorpay error:', err.message);
    return `https://rzp.io/l/baatchete-${sessionId.slice(0, 8)}`;
  }
}

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
//  MAIN WEBHOOK
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  const userMessage = req.body.Body?.trim();
  const userPhone   = req.body.From;
  if (!userMessage || !userPhone) return res.sendStatus(400);
  console.log(`[Webhook] ${userPhone}: "${userMessage}"`);

  try {
    const db           = req.app.locals.db;
    const listenerName = await getListenerName(db, userPhone);
    const sessionId    = `sess-${userPhone.replace(/\W/g, '')}-${Date.now()}`;
    const paymentUrl   = await createRazorpayLink(sessionId, 199);
    const result       = await handleMessage(db, userPhone, userMessage, listenerName, paymentUrl);

    // 1. Send AI reply
    await sendWhatsApp(userPhone, result.reply);

    // 2. Send payment message — ALL tiers same (Green ₹99 / Yellow ₹199 / Red+Crisis ₹299)
    //    Crisis: warm reply first → payment link 1.5s later
    //    Normal: payment link after user confirms connect
    if (result.paymentMessage) {
      setTimeout(async () => {
        try {
          await sendWhatsApp(userPhone, result.paymentMessage);
          const tag = result.isCrisis ? 'CRISIS Red ₹299' : `${result.triage?.tierTag} ₹${result.triage?.price}`;
          console.log(`[Webhook] Payment sent → ${userPhone} | ${tag}`);
        } catch (err) {
          console.error('[Webhook] Payment msg error:', err.message);
        }
      }, 1500);
    }

    // 3. Matchmaking triggered by Razorpay payment-webhook below (not here)
    res.sendStatus(200);

  } catch (err) {
    console.error('[Webhook] Error:', err.message);
    try { await sendWhatsApp(userPhone, 'Ek second ruk jaiye... main yahan hoon. 🙏'); } catch (_) {}
    res.sendStatus(500);
  }
});

// ──────────────────────────────────────────────
//  RAZORPAY PAYMENT WEBHOOK
//  Payment done → trigger match → session → audio link
// ──────────────────────────────────────────────
router.post('/payment-webhook', async (req, res) => {
  try {
    const event = req.body;
    console.log('[Webhook] Razorpay event:', event.event);

    if (event.event === 'payment_link.paid') {
      const refId = event.payload?.payment_link?.entity?.reference_id;
      const phoneMatch = refId?.match(/sess-(whatsapp\d+)-/);
      const phone = phoneMatch ? `whatsapp:+${phoneMatch[1].replace('whatsapp', '')}` : null;

      if (phone) {
        console.log(`[Webhook] Payment confirmed → ${phone}`);
        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        await fetch(`${baseUrl}/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, sessionId: refId, paymentConfirmed: true }),
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
//  TRIGGER MATCH
// ──────────────────────────────────────────────
function triggerMatchmaking(req, userPhone, result) {
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  fetch(`${baseUrl}/match`, {
    method: 'POST',
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
