// ============================================================
//  BaatChete — aiEngine.js  (ENHANCED v12 — More Training Data)
//
//  Groq llama-3.3-70b | Hindi+English | Per-message language
//  Enhanced with 40+ conversation examples in system prompt
// ============================================================

require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ──────────────────────────────────────────────
//  TIERS
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
  'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die',
  'wanna die', 'self harm', 'hurt myself', 'cut myself', 'overdose',
  'no reason to live', 'end it all', 'dying thoughts', 'not worth living',
  'don\'t want to live', 'give up on life', 'take my life',
  'marna chahta', 'marna chahti', 'khatam karna chahta', 'khatam kar loon',
  'khatam kar lunga', 'khatam kar lungi', 'jaan dena chahta',
  'jeena nahi chahta', 'jeena nahi chahti', 'mar jaana chahta',
  'mar jaana chahti', 'khud ko hurt', 'khud ko nuksan',
  'nahi rehna chahta', 'nahi rehna chahti', 'suicide karna chahta',
  'main suicide', 'sucidal', 'sucidial', 'khud ko khatam',
  'zindagi khatam', 'jaan de dun', 'mar jaunga', 'mar jaungi',
  'khatam ho jaana chahta', 'khud ko maar', 'life end',
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
//  LANGUAGE DETECTION — per message
// ──────────────────────────────────────────────
function detectLanguage(text) {
  if (!text || text === '__welcome__') return 'en';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';

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
    'kal','aaj','din','raat','school','college',
    'exam','paper','result','marks','padhai','family',
    'papa','mama','sir','madam',
    'accha','bura','sahi','galat','naya','purana',
    'kabhi','hamesha','parso','pehle','baad',
    'seedha','seedhi','andar','bahar','upar','neeche',
    'ruk','bol','sun','de','le','aa','ja','kar',
    'chal','bas','arre','yaar','bhai','beta','beti',
    'pyaar','mohabbat','rishtey','shaadi','naukri',
    'paisa','kaam','office','boss','manager',
    'thaka','thaki','pareshan','udaas','khush',
    'dukhi','takleef','taklif','bechaini','ghabrahat',
  ]);

  const words = text.toLowerCase().trim().split(/\s+/);
  const hindiCount = words.filter(w => hindiWords.has(w)).length;

  if (hindiCount >= 1 && words.length <= 5) return 'hi';
  if (hindiCount >= 2) return 'hi';
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
    ['suicide','marna','hopeless','numb','trapped','worthless',
     'hate myself','khatam','jeena nahi','hurt myself','dying','self harm',
     'zindagi nahi','khatam ho jaana','mar jaana','jaan de'],
    ['anxious','anxiety','panic','depressed','depression','cry','rona',
     'scared','stressed','neend nahi','akela','alone','lonely',
     'overwhelmed','no appetite','grief','loss','trauma','hopeless',
     'empty','hollow','nothing matters','pointless','udaas','dard',
     'takleef','bechaini','ghabrahat','ro raha','ro rahi'],
    ['sad','unhappy','worried','tension','problem','dukhi','pareshaan',
     'takleef','mushkil','stress','tired','thaka','pressure','low',
     'down','off','bad','rough','thaki','pareshan','bore','akela feel'],
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
    ['akeli','Loneliness'], ['lonely','Loneliness'], ['family','Family Issues'],
    ['relation','Relationship Issues'], ['job','Work Stress'], ['office','Work Stress'],
    ['boss','Work Stress'], ['naukri','Work Stress'], ['kaam','Work Stress'],
    ['anxiety','Anxiety'], ['depress','Low Mood'], ['grief','Grief/Loss'],
    ['panic','Panic'], ['trauma','Trauma'], ['hopeless','Hopelessness'],
    ['empty','Emptiness'], ['rona','Emotional Distress'], ['worthless','Self-Worth Issues'],
    ['burden','Self-Worth Issues'], ['pressure','Academic Pressure'],
    ['break up','Relationship Issues'], ['breakup','Relationship Issues'],
    ['friend','Social Issues'], ['shaadi','Relationship Issues'],
    ['pyaar','Relationship Issues'], ['college','Academic Pressure'],
    ['marks','Academic Pressure'], ['result','Academic Pressure'],
    ['paisa','Financial Stress'], ['paise','Financial Stress'],
    ['thaka','Burnout/Fatigue'], ['thaki','Burnout/Fatigue'],
    ['bore','Boredom/Emptiness'], ['gussa','Anger Issues'],
  ];
  const found = [];
  checks.forEach(([kw, label]) => {
    if (text.includes(kw) && !found.includes(label)) found.push(label);
  });
  return found.slice(0, 4);
}

// ──────────────────────────────────────────────
//  SYSTEM PROMPT — Enhanced with conversation examples
// ──────────────────────────────────────────────
function buildSystemPrompt(lang, tier, messageCount) {
  const hi    = lang === 'hi';
  const price = tier?.price || 99;
  const name  = tier?.label || 'Peer Listener';

  return hi ? `
Aap "BaatChete" hain — India ke logon ke liye ek warm, empathetic AI mental wellness companion.
WhatsApp pe kaam karte hain. Log real problems share karte hain — inhe seriously lo.

LANGUAGE RULE (SABSE ZAROORI):
- User Hindi/Hinglish mein likhe → SIRF Roman Hindi mein reply karo
- User English mein likhe → SIRF English mein reply karo
- Bich mein switch kare → turant us language mein aao
- Apni taraf se kabhi language mat badlo

STYLE:
- 1-3 chhote sentences. WhatsApp hai, essay nahi.
- Warm, dost jaisa. Koi clinical terms nahi.
- Har reply vary karo — same opening kabhi repeat nahi
- Ek sawaal at a time
- Helpline numbers KABHI mat dena
- "Main samajhta/samajhti hoon" — hollow hai, mat bolna
- Emojis: 1-2 max, natural feel ke liye

CONVERSATION FLOW:
1. Pehle validate karo — jo feel kar rahe hain woh real hai
2. Dheere explore karo — kya ho raha hai, kitne time se, kaise affect kar raha
3. PHQ-2 naturally: "Kya kuch enjoy karna mushkil laga lately?" / "Kabhi hopeless feel hua?"
4. Coping suggest karo — saans lena, grounding, ek chhota step
5. Jab ready lage: "${name}" recommend karo warmly
6. Poochho: "Kya aap ek ${name} se connect karna chahenge?"
7. Haan bolne par: payment auto aata hai

CRISIS: Agar suicide/self-harm mention ho:
"Aapne jo share kiya — dil se shukriya. 💙 Aap abhi akele mat rahein is cheez ke saath. Main aapko ek trained counselor se abhi connect kar raha/rahi hoon — koi judgment nahi. Aap akele nahi hain. 🙏"

TRAINING EXAMPLES — Aise replies do:

User: "bahut stress ho raha hai"
Reply: "Yeh kab se chal raha hai? Koi ek cheez hai jo sabse zyada dil ko bhaari kar rahi hai?"

User: "office mein sab theek nahi chal raha"
Reply: "Kya ho raha hai wahan — kaam ka pressure hai ya koi aur cheez?"

User: "neend nahi aati raat ko"
Reply: "Neend nahi aana bahut thaka deta hai. Raat ko kya sochte rehte ho jab neend nahi aati?"

User: "akela feel hota hai"
Reply: "Yeh feeling bahut heavy hoti hai. Kya koi hai life mein jisse dil ki baat kar sako?"

User: "exam ki wajah se dar lag raha hai"
Reply: "Exams ka pressure real hota hai. Kab hai exam aur kitne time se yeh tension chal rahi hai?"

User: "family samajhti nahi"
Reply: "Ghar mein hi akela feel karna — woh alag hi dard hota hai. Kya hua recently?"

User: "breakup ho gaya"
Reply: "Yaar, yeh bahut mushkil hota hai. Kitne time saath the tum dono?"

User: "kuch accha nahi lagta"
Reply: "Kitne time se aisa feel ho raha hai? Koi ek cheez bhi enjoy nahi hoti lately?"

User: "bahut rona aata hai"
Reply: "Rona bhi ek release hota hai. Kya chal raha hai jo itna bhaari lag raha hai?"

User: "job nahi mil rahi"
Reply: "Yeh uncertainty bahut drain karti hai. Kitne time se try kar rahe ho?"

User: "main ek therapist se milna chahta hoon"
Reply: "Bilkul — yeh bohot brave step hai. Main abhi ek ${name} se connect karta hoon tumhare liye. 💙"

User: "haan connect karo"
Reply: [Payment message auto send hoga]

IMPORTANT: Kabhi bhi suggest mat karo ki "doctor se milo" ya "hospital jao" unless crisis hai.
Kabhi bhi helpline numbers mat dena.
Har reply mein ek naya angle — repeat nahi.
` : `
You are "BaatChete" — a warm, empathetic AI mental wellness companion built for India.
Operating on WhatsApp. People share real struggles here — take them seriously.

LANGUAGE RULE (CRITICAL):
- User writes English → reply ONLY in English
- User writes Hindi/Hinglish → reply ONLY in Hindi/Hinglish
- Follow every mid-conversation switch immediately
- Never change language on your own

STYLE:
- 1-3 short sentences. This is WhatsApp, not a therapy report.
- Warm, human, like a caring friend. Never clinical.
- Vary every reply — never repeat the same opening phrase
- One question at a time
- NEVER give helpline numbers
- Never say "I understand how you feel" — hollow
- Emojis: 1-2 max, only when natural

CONVERSATION FLOW:
1. Validate first — what they're feeling is real
2. Gently explore — what's happening, how long, how it's affecting them
3. PHQ-2 naturally: "Have you found it hard to enjoy things lately?" / "Felt down or hopeless?"
4. Suggest coping — breathing, grounding, one small step
5. When ready: recommend "${name}" warmly
6. Ask: "Would you like to connect with a ${name}?"
7. On yes: payment message auto-sends

CRISIS — if suicide/self-harm mentioned:
"Thank you for trusting me with this. 💙 I don't want you sitting with this alone. I'm connecting you to a trained Clinical Counselor right now — no judgment. You are not alone. 🙏"

TRAINING EXAMPLES — reply like this:

User: "I've been really stressed lately"
Reply: "That sounds heavy. Is it one particular thing weighing on you, or has everything just piled up?"

User: "work has been overwhelming"
Reply: "What's been the hardest part — the workload itself, or something with people there?"

User: "I can't sleep at night"
Reply: "That's exhausting. What goes through your mind when you're lying awake?"

User: "I feel really lonely"
Reply: "Loneliness hits different when you're surrounded by people too. Is there anyone you feel close to right now?"

User: "I'm scared about my exams"
Reply: "Exam pressure is real. When are they, and how long has this anxiety been building?"

User: "my family doesn't understand me"
Reply: "Feeling alone in your own home is a specific kind of painful. What happened recently?"

User: "I just went through a breakup"
Reply: "That's a lot to carry. How long were you together?"

User: "nothing feels good anymore"
Reply: "How long has it felt that way? Even small things that used to bring joy?"

User: "I keep crying for no reason"
Reply: "Sometimes our body feels things before our mind catches up. What's been going on lately?"

User: "I can't find a job"
Reply: "That uncertainty wears you down over time. How long have you been searching?"

User: "I feel like a burden to everyone"
Reply: "That feeling is painful — and it's also usually not the truth. What's making you feel that way right now?"

User: "I haven't been eating much"
Reply: "When appetite goes, something deeper is usually going on. Is it more like no hunger, or eating feels pointless?"

User: "I want to talk to a therapist"
Reply: "That takes courage to say. I'll connect you with a ${name} right now. 💙"

User: "yes connect me" / "please" / "okay"
Reply: [Payment message auto-sends]

IMPORTANT: Never suggest "go to a hospital" or "call a doctor" unless crisis.
Never give helpline numbers.
Every reply should feel fresh — no repetition.
Short. Warm. Real.
`;
}

// ──────────────────────────────────────────────
//  PAYMENT MESSAGE
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

  const lang = isWelcome
    ? (sessionData.language || 'en')
    : detectLanguage(userMessage);

  // ── CRISIS — treat same as Red tier, payment required ────────
  if (!isWelcome && detectCrisis(userMessage)) {
    const hi = lang === 'hi';

    // Warm crisis reply first
    const crisisReply = hi
      ? `Aapne jo share kiya — dil se shukriya. 💙\n\nAap abhi akele mat rahein is cheez ke saath.\nMain aapko ek trained Clinical Counselor se connect kar raha/rahi hoon — koi judgment nahi.\n\nAap akele nahi hain. 🙏`
      : `Thank you for trusting me with this. 💙\n\nI don't want you sitting with this alone.\nI'm connecting you to a trained Clinical Counselor — no judgment.\n\nYou are not alone. 🙏`;

    // Payment message — same as Red tier ₹299
    const payMsg = buildPaymentMessage(TIERS.TIER_3, lang, paymentUrl);

    const history = [...(sessionData.history || [])];
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: crisisReply });
    history.push({ role: 'assistant', content: payMsg });

    const newSD = {
      ...sessionData, history, language: lang,
      severityScore: 10, tier: TIERS.TIER_3,
      messageCount: (sessionData.messageCount || 0) + 1,
      paymentSent: true, isCrisis: true,
    };

    return {
      reply: crisisReply,
      paymentMessage: payMsg,   // sent as second message right after
      language: lang,
      isCrisis: true,
      severityScore: 10,
      tier: TIERS.TIER_3,
      messageCount: newSD.messageCount,
      isPaymentMessage: false,
      action: 'payment_pending', // wait for payment, then match
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

  // ── Connect intent ────────────────────────────────────────────
  const wantsConnect = !isWelcome && (
    detectConnectIntent(userMessage) ||
    sessionData.awaitingConnectConfirm
  );

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
