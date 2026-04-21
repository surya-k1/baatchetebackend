// ============================================================
//  BaatChete — index.js  (main server)
//  Run with: node index.js
//  Dev mode: nodemon index.js
// ============================================================

require('dotenv').config();
const express = require('express');
const app     = express();

// ── Parse incoming requests ──────────────────────────────────
app.use(express.urlencoded({ extended: false }));  // Twilio sends URL-encoded
app.use(express.json());

// ── ENV Validation — warn early so Railway logs are clear ────
const REQUIRED_ENV = {
  TWILIO_ACCOUNT_SID:    process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN:     process.env.TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM:  process.env.TWILIO_WHATSAPP_FROM,
  GROQ_API_KEY:          process.env.GROQ_API_KEY,
};

const MISSING = Object.entries(REQUIRED_ENV)
  .filter(([, v]) => !v || v.includes('xxxx') || v === 'undefined')
  .map(([k]) => k);

if (MISSING.length > 0) {
  console.warn(`\n⚠️  Missing env variables: ${MISSING.join(', ')}`);
  console.warn('   WhatsApp messages will NOT send until these are set in Railway Variables.\n');
} else {
  console.log('✅ All required env variables present');
}

// Validate Twilio WhatsApp from number format
if (process.env.TWILIO_WHATSAPP_FROM && !process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')) {
  console.warn(`⚠️  TWILIO_WHATSAPP_FROM should start with "whatsapp:" — auto-fixing...`);
  process.env.TWILIO_WHATSAPP_FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;
}

// ── Firebase init ────────────────────────────────────────────
const admin = require('firebase-admin');

let db;
try {
  // Support both: path to service account JSON OR inline JSON string in env
  let serviceAccount;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Railway: paste the entire serviceAccount.json contents as env variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log('✅ Firebase: loading from FIREBASE_SERVICE_ACCOUNT_JSON env');
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Local: path to file
    serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Firebase: loading from file path');
  } else {
    throw new Error('No Firebase credentials provided — set FIREBASE_SERVICE_ACCOUNT_JSON in Railway Variables');
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log('✅ Firebase connected');

} catch (err) {
  console.warn('⚠️  Firebase not connected (demo mode ON):', err.message);
  console.warn('   To connect Firebase on Railway: add FIREBASE_SERVICE_ACCOUNT_JSON variable');
  // App still runs in demo mode — all routes have fallbacks
}

// Make db available to all routes
app.locals.db = db;

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    service: 'BaatChete Backend',
    status:  'running',
    mode:    db ? 'production' : 'demo',
    time:    new Date().toISOString(),
    env: {
      twilio:   MISSING.includes('TWILIO_ACCOUNT_SID') ? '❌ missing' : '✅ set',
      groq:     MISSING.includes('GROQ_API_KEY')       ? '❌ missing' : '✅ set',
      firebase: db ? '✅ connected' : '⚠️ demo mode',
      whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ? '✅ set' : '❌ missing',
    },
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/webhook', require('./routes/webhook'));   // Twilio → AI engine
app.use('/match',   require('./routes/match'));     // Matchmaking
app.use('/session', require('./routes/session'));   // Audio room + notifications
app.use('/listener',require('./routes/listener')); // Listener status updates
app.use('/payment', require('./routes/payment'));   // Razorpay payment link

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 BaatChete backend running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/`);
  console.log(`   Webhook URL:  http://localhost:${PORT}/webhook`);
  console.log(`   Mode: ${db ? '🔥 Firebase connected' : '🔵 Demo mode (no Firebase)'}\n`);
});
