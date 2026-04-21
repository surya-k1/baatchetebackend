// ============================================================
//  BaatChete — aiEngine.js  (FINAL PRODUCTION v11)
//
//  Groq llama-3.3-70b | Hindi+English | Per-message language
//
//  EXACT FLOW (from screenshots):
//
//  NORMAL:
//  1. User chats → AI listens, assesses, empathizes
//  2. User says "connect" → AI asks "Kya aap connect karna chahenge?"
//  3. User confirms → Payment link sent (Razorpay)
//  4. Payment done → match.js + session.js → Daily.co audio link
//
//  CRISIS:
//  1. Crisis keyword detected → warm message immediately
//  2. Payment link sent (same flow, just faster — no extra confirmation)
//  3. Payment done → audio link immediately
//
//  LANGUAGE:
//  - Detected from EVERY message independently
//  - User can switch Hindi ↔ English mid-conversation freely
//  - Crisis in any language works correctly
// ============================================================

require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ──────────────────────────────────────────────
//  TIERS (matches dashboard screenshot exactly)
// ──────────────────────────────────────────────
const TIERS = {
  TIER_1: { label: 'Peer Listener',      tag: 'Green',  price: 99  },
  TIER_2: { label: 'Psychologist',       tag: 'Yellow', price: 199 },
  TIER_3: { label: 'Clinical Counselor', tag: 'Red',    price: 299 },
};

// ──────────────────────────────────────────────
//  CRISIS KEYWORDS — Hindi + English + Hinglish
// ──────────────────────────────────────────────
const CRISIS_KEYWORDS = [
  // English
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die',
  'wanna die', 'self harm', 'hurt myself', 'cut myself', 'overdose',
  'no reason to live', 'end it all', 'dying thoughts', 'not worth living',
  'don\'t want to live', 'give up on life', 'take my life',
  // Hindi / Hinglish
  'marna chahta', 'marna chahti', 'khatam karna chahta', 'khatam kar loon',
  'khatam kar lunga', 'khatam kar lungi', 'jaan dena chahta',
  'jeena nahi chahta', 'jeena nahi chahti', 'mar jaana chahta',
  'mar jaana chahti', 'khud ko hurt', 'khud ko nuksan',
  'nahi rehna chahta', 'nahi rehna chahti', 'suicide karna chahta',
  'main suicide', 'sucidal', 'sucidial', 'khud ko khatam',
];

function detectCrisis(text) {
  const lower = (text || '').toLowerCase();
  return CRISIS_KEYWORDS.some(kw => lower.includes(kw));
}

// ──────────────────────────────────────────────
//  CONNECT INTENT
// ──────────────────────────────────────────────
function detectConnectIntent(text) {
  const lower = (text || '').toLowerCase();
  return [
    'connect', 'connect me', 'therapist', 'psychologist', 'counselor',
    'help chahiye', 'kisi se milna', 'professional', 'session', 'listener',
    'haan connect', 'yes connect', 'ha connect', 'jod do', 'jodo',
    'kisi se baat', 'doctor', 'expert', 'yes', 'haan', 'ha', 'okay', 'ok',
    'theek hai', 'please', 'zaroor', 'bilkul',
  ].some(w => lower.includes(w));
}

// ──────────────────────────────────────────────
//  LANGUAGE DETECTION — per message (free switch)
//  This is the core fix: detects EVERY message independently
// ──────────────────────────────────────────────
function detectLanguage(text) {
  if (!text || text === '__welcome__') return 'en';

  // Devanagari script = definitely Hindi
  if (/[\u0900-\u097F]/.test(text)) return 'hi';

  // Comprehensive Roman Hindi / Hinglish word list
  const hindiWords = new Set([
    'main','mujhe','mera','meri','mere','aap','kya','nahi','nahin',
    'hoon','hun','hai','tha','thi','the','bahut','accha','thoda',
    'kuch','kaise','kyun','kyunki','lekin','aur','bhi','yahan',
    'lagta','lagti','raha','rahi','rahe','hota','hoti','hote',
    'chahta','chahti','chahte','dil','ghar','yaar','bhai','behen',
    'dost','toh','to','pe','par','mein','me','se','ko','ka','ki',
    'akela','akeli','dard','mushkil','pareshaan','samajh','theek',
    'zyada','sirf','bilkul','phir','fir','abhi','sab','koi','ek',
    'jo','wo','woh','yeh','ye','batao','bata','dekho','suno',
    'rona','gussa','dara','stress','tension','neend','khana',
    'haan','nahi','matlab','pata','tha','thi','ho','kar','karo',
    'kal','aaj','kal','din','raat','ghar','school','college',
    'exam','paper','result','marks','padhai','family','ghar wale',
    'papa','mama','bhai','behen','dost','yaar','sir','madam',
    'accha','bura','theek','sahi','galat','naya','purana',
    'bahut','thoda','zyada','kam','jyada','bilkul','sirf',
    'kabhi','hamesha','aaj','kal','parso','pehle','baad',
    'seedha','seedhi','ulta','neeche','upar','andar','bahar',
  ]);

  const words = text.toLowerCase().trim().split(/\s+/);
  const hindiCount = words.filter(w => hindiWords.has(w)).length;

  // Strong signal: even 1 Hindi word in short message
  if (hindiCount >= 1 && words.length <= 5) return 'hi';
  // Multiple Hindi words = Hindi
  if (hindiCount >= 2) return 'hi';
  // Ratio check for longer messages
  if (words.length > 5 && hindiCount / words.length >= 0.2) return 'hi';

  return 'en';
}

// ──────────────────────────────────────────────
//  SEVERITY SCORING
// ──────────────────────────────────────────────
function calculateSeverityScore(history) {
  const text = history
    .filter(m => m.role === 'user')
    .map(m => m.content).join(' ').toLowerCase();

  let score = 0;
  [
    // High severity (+3)
    ['suicide','marna','hopeless','numb','trapped','worthless',
     'hate myself','khatam','jeena nahi','hurt myself','dying','self harm'],
    // Medium severity (+2)
    ['anxious','anxiety','panic','depressed','depression','cry','rona',
     'scared','stressed','neend nahi','akela','alone','lonely',
     'overwhelmed','no appetite','grief','loss','trauma','hopeless',
     'empty','hollow','nothing matters','pointless'],
    // Low severity (+1)
    ['sad','unhappy','worried','tension','problem','dukhi','pareshaan',
     'takleef','mushkil','stress','tired','thaka','pressure','low',
     'down','off','bad','rough'],
  ].forEach((keywords, i) => {
    const points = [3, 2, 1][i];
    keywords.forEach(kw => { if (text.includes(kw)) score += points; });
  });
  return Math.min(score, 10);
}

function getTierFromScore(score) {
  if (score <= 3) return TIERS.TIER_1;
  if (score <= 6) return TIERS.TIER_2;
  return TIERS.TIER_3;
}

function extractIndicators(history) {
  const text = history
    .filter(m => m.role === 'user')
    .map(m => m.content).join(' ').toLowerCase();

  const checks = [
    ['stress','Stress'], ['exam','Academic Pressure'], ['sleep','Sleep Issues'],
    ['neend','Sleep Issues'], ['alone','Loneliness'], ['akela','Loneliness'],
    ['lonely','Loneliness'], ['family','Family Issues'], ['relation','Relationship Issues'],
    ['job','Work Stress'], ['office','Work Stress'], ['boss','Work Stress'],
    ['anxiety','Anxiety'], ['depress','Low Mood'], ['grief','Grief/Loss'],
    ['panic','Panic'], ['trauma','Trauma'], ['hopeless','Hopelessness'],
    ['empty','Emptiness'], ['rona','Emotional Distress'], ['worthless','Self-Worth Issues'],
    ['burden','Self-Worth Issues'], ['pressure','Academic Pressure'],
    ['break up','Relationship Issues'], ['breakup','Relationship Issues'],
    ['lonely','Loneliness'], ['friend','Social Issues'], ['lonely','Loneliness'],
  ];
  const found = [];
  checks.forEach(([kw, label]) => {
    if (text.includes(kw) && !found.includes(label)) found.push(label);
  });
  return found.slice(0, 4);
}

// ──────────────────────────────────────────────
//  SYSTEM PROMPT — The heart of the AI
//  Uses the training data style (50 EN + 50 HI conversations)
// ──────────────────────────────────────────────
function buildSystemPrompt(lang, tier, messageCount) {
  const hi    = lang === 'hi';
  const price = tier?.price || 99;
  const name  = tier?.label || 'Peer Listener';

  // Training data style — short, warm, varied, no clinical labels
  return hi ? `
Aap "BaatChete" hain — India ke logon ke liye ek warm, empathetic AI mental wellness companion.

LANGUAGE: Har message mein user ki language detect karo aur usi mein reply karo.
User Hindi/Hinglish mein likhe → sirf Roman Hindi mein reply karo.
User English mein likhe → sirf English mein reply karo.
Mid-conversation switch bhi follow karo. Kabhi apni taraf se language mat badlo.

STYLE (training data se):
- 1-3 chhote sentences max. Yeh WhatsApp hai.
- Warm, human, dost jaisa. Clinical nahi.
- Har message vary karo — same opening repeat nahi.
- Ek sawaal at a time.
- Helpline numbers KABHI nahi dena.
- "Main samajhta/samajhti hoon" mat bolna — hollow lagta hai.

FLOW:
1. Pehle sunno aur validate karo
2. Dheere dheere samjho — kya ho raha hai, kitne time se, kaise affect kar raha hai
3. PHQ-2/GAD-2 naturally daalein: "Kya cheezein enjoy karna mushkil laga lately?" / "Kya hopeless feel hua kabhi?"
4. Coping suggest karo proactively — breathing, grounding
5. Jab ready lagey: "${name}" recommend karo warmly
6. Connect poochho: "Kya aap ${name} se connect karna chahenge?"
7. Haan bolne par: payment message auto aayega

CRISIS (suicide/self-harm):
Warmly respond karo: "Aapne jo share kiya — dil se shukriya. 💙 Main aapko abhi ek trained counselor se connect kar raha/rahi hoon. Aap akele nahi hain. 🙏"
Payment link turant bhejenge — uske baad audio room link aayega.
` : `
You are "BaatChete" — a warm, empathetic AI mental wellness companion built for India.

LANGUAGE: Detect language from EVERY message and reply in that language.
User writes English → reply ONLY in English.
User writes Hindi/Hinglish → reply ONLY in Hindi/Hinglish.
Follow mid-conversation language switches immediately.

STYLE (from training data):
- 1-3 short sentences max. This is WhatsApp.
- Warm, human, like a caring friend. Never clinical.
- Vary every message — never repeat the same opening.
- One question at a time.
- NEVER give helpline numbers.
- Never say "I understand how you feel" — hollow.

FLOW:
1. Listen first, validate warmly
2. Gently explore — what's going on, how long, how it's affecting them
3. PHQ-2/GAD-2 naturally: "Have you found it hard to enjoy things lately?" / "Felt down or hopeless?"
4. Proactively suggest coping — breathing, grounding
5. When ready: recommend "${name}" warmly
6. Ask to connect: "Would you like to connect with a ${name}?"
7. On yes: payment message auto-sends

CRISIS (suicide/self-harm):
Respond warmly: "Thank you for trusting me with this. 💙 I'm connecting you to a trained Clinical Counselor right now — no judgment. You are not alone. 🙏"
Payment link sends immediately — then audio room link follows.
`;
}

// ──────────────────────────────────────────────
//  PAYMENT MESSAGE — matches screenshot exactly
// ──────────────────────────────────────────────
function buildPaymentMessage(tier, lang, paymentUrl) {
  const hi    = lang === 'hi';
  const price = tier?.price || 99;
  const name  = tier?.label || 'Listener';
  const url   = paymentUrl  || `https://rzp.io/l/baatchete`;

  return hi
    ? `✅ *${name} available hai aapke liye!*\n\n💳 *Session fee: ₹${price}*\nPayment karein: ${url}\n\nPayment confirm hone ke baad audio session link turant aayega. 🙏`
    : `✅ *${name} available!*\n\n💳 *Session fee: ₹${price}*\nPay here: ${url}\n\nAudio link arrives after payment. 🙏`;
}

// ──────────────────────────────────────────────
//  WELCOME MESSAGE
// ──────────────────────────────────────────────
function getWelcomeMessage(lang) {
  return lang === 'hi'
    ? `Namaste 🙏 Main BaatChete hoon — ek safe jagah baat karne ke liye.\n\nYahan koi judgment nahi, koi sign-up nahi. Sab kuch completely anonymous hai. 🔒\n\nAaj kaisa feel kar rahe hain? Jo dil mein hai, woh kehiye. 💙`
    : `Namaste 🙏 I'm BaatChete — a safe space to talk, no judgment.\n\nNo sign-up. Completely anonymous. 🔒\n\nWhat's been going on for you? Just say it however it comes. 💙`;
}

// ──────────────────────────────────────────────
//  SESSION STORE
// ──────────────────────────────────────────────
const sessions = {};

function getSession(phone) {
  if (!sessions[phone]) {
    sessions[phone] = {
      history: [],
      severityScore: 0,
      messageCount: 0,
      paymentSent: false,
      awaitingConnectConfirm: false,
      sessionId: `sess-${Date.now()}`,
    };
  }
  return sessions[phone];
}

// ──────────────────────────────────────────────
//  CORE: processMessage()
// ──────────────────────────────────────────────
async function processMessage(userMessage, sessionData, paymentUrl) {
  const isWelcome = userMessage === '__welcome__';

  // Language detected from THIS message (core fix for mid-chat switching)
  const lang = isWelcome
    ? (sessionData.language || 'en')
    : detectLanguage(userMessage);

  // ── CRISIS — intercept before Groq ──────────────────────────
  if (!isWelcome && detectCrisis(userMessage)) {
    const hi = lang === 'hi';

    // Crisis warm message
    const crisisReply = hi
      ? `Aapne jo share kiya — dil se shukriya. 💙\n\nAap abhi akele mat rahein is cheez ke saath.\nMain aapko ek trained Clinical Counselor se abhi connect kar raha/rahi hoon — koi judgment nahi.\n\nAap akele nahi hain. 🙏`
      : `Thank you for trusting me with this. 💙\n\nI don't want you sitting with this alone.\nI'm connecting you to a trained Clinical Counselor right now — no judgment.\n\nYou are not alone. 🙏`;

    // Immediately send payment link for crisis (no extra confirmation needed)
    const payMsg = buildPaymentMessage(TIERS.TIER_3, lang, paymentUrl);

    const history = [...(sessionData.history || [])];
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: crisisReply });

    const newSD = {
      ...sessionData, history, language: lang,
      severityScore: 10, tier: TIERS.TIER_3,
      messageCount: (sessionData.messageCount || 0) + 1,
      paymentSent: false, isCrisis: true,
    };

    return {
      reply: crisisReply,
      paymentMessage: payMsg,  // Send both: crisis reply + payment link
      language: lang,
      isCrisis: true,
      severityScore: 10,
      tier: TIERS.TIER_3,
      messageCount: newSD.messageCount,
      isPaymentMessage: false,
      action: 'match_counselor',
      sessionData: newSD,
    };
  }

  // ── History ──────────────────────────────────────────────────
  const history = [...(sessionData.history || [])];
  if (!isWelcome) history.push({ role: 'user', content: userMessage });
  const messageCount = isWelcome
    ? (sessionData.messageCount || 0)
    : (sessionData.messageCount || 0) + 1;

  const severityScore = calculateSeverityScore(history);
  const tier          = getTierFromScore(severityScore);
  const indicators    = extractIndicators(history);

  // ── Connect intent — ask confirmation first, then payment ────
  const wantsConnect = !isWelcome && (
    detectConnectIntent(userMessage) ||
    sessionData.awaitingConnectConfirm
  );

  // User confirmed connect after being asked
  if (wantsConnect && !sessionData.paymentSent) {
    const payMsg = buildPaymentMessage(tier, lang, paymentUrl);
    history.push({ role: 'assistant', content: payMsg });

    const newSD = {
      ...sessionData, history, language: lang,
      severityScore, tier, messageCount,
      paymentSent: true, awaitingConnectConfirm: false, indicators,
    };
    return {
      reply: payMsg,
      language: lang,
      isCrisis: false,
      severityScore, tier, messageCount,
      isPaymentMessage: true,
      indicators,
      action: 'payment_pending',
      sessionData: newSD,
    };
  }

  // ── Groq call ────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(lang, tier, messageCount);
  const msgs = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-14).filter(m => m.content !== '__welcome__'),
  ];

  if (isWelcome) {
    msgs.push({
      role: 'user',
      content: lang === 'hi'
        ? '(User ne chat khola. Warm welcome do.)'
        : '(User just opened the chat. Give your warm welcome.)',
    });
  }

  let aiReply = '';
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL, messages: msgs,
      temperature: 0.85, max_tokens: 250, top_p: 0.9,
    });
    aiReply = completion.choices[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[BaatChete] Groq error:', err.message);
    aiReply = lang === 'hi'
      ? 'Maafi chahiye, thodi technical problem hai. Phir try karein. 🙏'
      : "Sorry, small technical issue. Please try again. I'm here. 🙏";
  }

  if (!isWelcome) history.push({ role: 'assistant', content: aiReply });

  // Check if AI reply suggests connecting (to set await flag for next message)
  const replyLower = aiReply.toLowerCase();
  const aiSuggestsConnect = [
    'connect', 'would you like', 'kya aap', 'chahenge', 'psychologist',
    'peer listener', 'counselor', 'session', '₹', 'rs.', 'available',
  ].some(w => replyLower.includes(w));

  const newSD = {
    ...sessionData, history, language: lang,
    severityScore, tier, messageCount, indicators,
    awaitingConnectConfirm: aiSuggestsConnect && !sessionData.paymentSent,
  };

  return {
    reply: aiReply,
    language: lang,
    isCrisis: false,
    severityScore, tier, messageCount,
    isPaymentMessage: false,
    indicators,
    action: 'continue',
    sessionData: newSD,
  };
}

// ──────────────────────────────────────────────
//  handleMessage() — for webhook.js
// ──────────────────────────────────────────────
async function handleMessage(db, phone, userMessage, listenerName, paymentUrl) {
  const sessionData = getSession(phone);
  const result      = await processMessage(userMessage, sessionData, paymentUrl);
  sessions[phone]   = result.sessionData;

  const indicators = result.indicators || [];

  // Build triage object for match.js and dashboard
  const triage = {
    severity:     result.severityScore >= 7 ? 5 : result.severityScore >= 4 ? 3 : 1,
    intensity:    result.severityScore,
    duration:     'unknown',
    category:     indicators[0]?.toLowerCase().replace(/[\/ ]/g, '_') || 'unclear',
    crisisFlag:   result.isCrisis || false,
    readyForSession: result.isCrisis || result.action === 'match_counselor' ||
                     (result.isPaymentMessage === false && result.action !== 'continue' && result.action !== 'payment_pending'),
    listenerTier: result.isCrisis ? 'counselor'
                : result.tier?.label === 'Clinical Counselor' ? 'counselor'
                : result.tier?.label === 'Psychologist'       ? 'experienced_peer'
                : 'peer',
    tierTag:  result.tier?.tag   || 'Green',
    price:    result.tier?.price || 99,
    isPaymentMessage: result.isPaymentMessage || false,
    // Dashboard card brief (matches screenshot)
    brief: [
      `${indicators.length ? indicators.join(', ') : 'General distress'}.`,
      `Severity: ${result.severityScore}/10 | Tier: ${result.tier?.label} (${result.tier?.tag})`,
      `Language: ${result.language === 'hi' ? 'Hindi/Hinglish' : 'English'} | Approach warmly.`,
    ].join('\n'),
  };

  if (db) {
    try {
      await db.collection('triage_logs')
        .doc(phone.replace(/\W/g, ''))
        .set({ triage, phone,
               updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp() },
             { merge: true });
    } catch (_) {}
  }

  // For crisis: return both the crisis reply AND payment message
  if (result.isCrisis && result.paymentMessage) {
    return {
      reply: result.reply,
      paymentMessage: result.paymentMessage,
      action: 'match_counselor',
      triage,
      brief: triage.brief,
      isPaymentMessage: false,
      isCrisis: true,
    };
  }

  return {
    reply: result.reply,
    action: result.action || 'continue',
    triage,
    brief: triage.brief,
    isPaymentMessage: result.isPaymentMessage,
    isCrisis: false,
  };
}

function clearConversation(phone) {
  delete sessions[phone];
}

// ──────────────────────────────────────────────
//  EXPORTS
// ──────────────────────────────────────────────
module.exports = {
  processMessage,
  getWelcomeMessage,
  buildPaymentMessage,
  detectLanguage,
  detectCrisis,
  detectConnectIntent,
  calculateSeverityScore,
  getTierFromScore,
  extractIndicators,
  TIERS,
  handleMessage,
  clearConversation,
};
