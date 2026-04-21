// ============================================================
//  BaatChete — testLocal.js  (FINAL)
//  Run:       node testLocal.js
//  Auto demo: node testLocal.js --demo
// ============================================================

require('dotenv').config();

// Firebase mock
const Module = require('module');
const orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'firebase-admin' ? req : orig(req, ...args);
require.cache['firebase-admin'] = {
  id: 'firebase-admin', filename: 'firebase-admin', loaded: true,
  exports: {
    initializeApp: () => {}, credential: { cert: () => {} },
    firestore: () => ({
      collection: () => ({
        doc: () => ({ set: async () => {}, update: async () => {} }),
        add: async () => ({ id: 'mock' }),
        where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }),
      }),
      FieldValue: { serverTimestamp: () => new Date() }
    }),
  }
};

const { processMessage, getWelcomeMessage, detectLanguage } = require('./aiEngine');
const readline = require('readline');

const bold  = t => `\x1b[1m${t}\x1b[0m`;
const cyan  = t => `\x1b[36m${t}\x1b[0m`;
const green = t => `\x1b[32m${t}\x1b[0m`;
const blue  = t => `\x1b[34m${t}\x1b[0m`;
const gray  = t => `\x1b[90m${t}\x1b[0m`;
const red   = t => `\x1b[31m${t}\x1b[0m`;
const line  = () => console.log(gray('─'.repeat(60)));

if (!process.env.GROQ_API_KEY) {
  console.log('\n' + red('  GROQ_API_KEY nahi mila!'));
  console.log(cyan('  .env: GROQ_API_KEY=gsk_...\n'));
  process.exit(1);
}

// Demo payment URL for testing
const DEMO_PAYMENT_URL = 'https://rzp.io/l/baatchete-demo';

// ──────────────────────────────────────────────
//  DEMO SCENARIOS
// ──────────────────────────────────────────────
const DEMOS = [
  {
    title: 'English → Payment Flow',
    lang:  'en',
    msgs:  [
      'hi',
      "feeling very stressed about exams",
      "also lonely and hopeless, been like this 2 months",
      "hard to enjoy anything",
      "yes connect me to a psychologist please",
    ],
  },
  {
    title: 'Hindi + Mid-conversation English switch',
    lang:  'hi',
    msgs:  [
      'hi',
      'bahut stress ho raha hai exam ki wajah se',
      'haan akela bhi feel ho raha hai, koi nahi samajhta',
      'I am also feeling very hopeless',           // switches to English
      'yes please connect me',
    ],
  },
  {
    title: 'Crisis — Hindi mid-switch',
    lang:  'en',
    msgs:  [
      'hi',
      "i don't feel good at all",
      "main suicide karna chahta hun",              // Hindi crisis mid-English
    ],
  },
];

async function runDemo() {
  for (const demo of DEMOS) {
    console.clear();
    console.log(cyan(bold(`\n  DEMO: ${demo.title}\n`)));
    line();

    let sd = {
      history: [], language: demo.lang, severityScore: 0,
      messageCount: 0, paymentSent: false, awaitingConnectConfirm: false,
      sessionId: `demo-${Date.now()}`,
    };

    console.log(green(bold('\n  BaatChete:\n')));
    console.log('  ' + getWelcomeMessage(demo.lang).replace(/\n/g, '\n  '));
    console.log();

    for (const msg of demo.msgs) {
      await new Promise(r => setTimeout(r, 900));
      line();

      const detectedLang = detectLanguage(msg);
      console.log(cyan(bold(`\n  User [${detectedLang.toUpperCase()}]: ${msg}`)));
      process.stdout.write(gray('\n  thinking...\r'));

      try {
        const result = await processMessage(msg, sd, DEMO_PAYMENT_URL);
        process.stdout.write('              \r');

        // Show crisis reply + payment message
        if (result.isCrisis && result.paymentMessage) {
          console.log(red(bold('\n  BaatChete (CRISIS):\n')));
          console.log('  ' + result.reply.replace(/\n/g, '\n  '));
          console.log();
          console.log(blue(bold('\n  BaatChete (Payment — auto sent):\n')));
          console.log('  ' + result.paymentMessage.replace(/\n/g, '\n  '));
          console.log(red(`\n  🚨 Crisis detected | match_counselor triggered | NO payment wait`));
        } else {
          console.log(green(bold('\n  BaatChete:\n')));
          console.log('  ' + result.reply.replace(/\n/g, '\n  '));
          if (result.isPaymentMessage) {
            console.log(blue(`\n  💳 Payment message sent → listener connects after payment`));
          }
        }

        console.log();
        const ind = result.indicators?.join(' · ') || '—';
        console.log(gray(
          `  Lang:${result.language} | Score:${result.severityScore}/10 | ` +
          `Tier:${result.tier?.label}(${result.tier?.tag}) | Msg#${result.messageCount}`
        ));
        console.log(gray(`  Detected: ${ind}`));
        console.log();

        sd = result.sessionData;
        if (result.isCrisis) break;
      } catch (err) {
        process.stdout.write('              \r');
        console.log(red(`  Error: ${err.message}`));
      }
    }

    console.log(gray('\n  Press Enter for next demo...'));
    await new Promise(res => {
      const r = readline.createInterface({ input: process.stdin });
      r.once('line', () => { r.close(); res(); });
    });
  }

  console.clear();
  console.log(green(bold('\n  All demos done!\n')));
  console.log(gray('  Interactive: node testLocal.js\n'));
  process.exit(0);
}

// ──────────────────────────────────────────────
//  INTERACTIVE MODE
// ──────────────────────────────────────────────
async function runInteractive(initLang) {
  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));

  let sd = {
    history: [], language: initLang, severityScore: 0,
    messageCount: 0, paymentSent: false, awaitingConnectConfirm: false,
    sessionId: `test-${Date.now()}`,
  };

  line();
  console.log(green(bold('\n  BaatChete:\n')));
  console.log('  ' + getWelcomeMessage(initLang).replace(/\n/g, '\n  '));
  console.log();

  while (true) {
    line();
    const raw   = await ask(cyan(bold('\n  You: ')));
    const input = raw.trim();
    if (!input) continue;

    if (['quit','exit','q','bye'].includes(input.toLowerCase())) {
      console.log('\n' + green('  BaatChete: Take care. 💙\n'));
      rl.close(); break;
    }

    if (input.toLowerCase() === 'reset') {
      sd = {
        history: [], language: initLang, severityScore: 0,
        messageCount: 0, paymentSent: false, awaitingConnectConfirm: false,
        sessionId: `test-${Date.now()}`,
      };
      console.log(gray('\n  Reset.\n'));
      line();
      console.log(green(bold('\n  BaatChete:\n')));
      console.log('  ' + getWelcomeMessage(initLang).replace(/\n/g, '\n  '));
      console.log(); continue;
    }

    const detectedLang = detectLanguage(input);
    process.stdout.write(gray(`\n  [lang: ${detectedLang}] thinking...\r`));

    try {
      const result = await processMessage(input, sd, DEMO_PAYMENT_URL);
      process.stdout.write('                              \r');

      line();

      // Crisis: show both messages
      if (result.isCrisis && result.paymentMessage) {
        console.log(red(bold('\n  BaatChete (CRISIS):\n')));
        console.log('  ' + result.reply.replace(/\n/g, '\n  '));
        console.log();
        console.log(blue(bold('\n  BaatChete (Payment):\n')));
        console.log('  ' + result.paymentMessage.replace(/\n/g, '\n  '));
        console.log(red(`\n  🚨 Crisis | Counselor match triggered | No payment wait`));
      } else {
        console.log(green(bold('\n  BaatChete:\n')));
        console.log('  ' + result.reply.replace(/\n/g, '\n  '));
        if (result.isPaymentMessage) {
          console.log(blue(`\n  💳 Payment sent → audio link after payment`));
        }
      }

      console.log();
      const ind = result.indicators?.join(' · ') || '—';
      console.log(gray(
        `  Lang:${result.language} | Score:${result.severityScore}/10 | ` +
        `Tier:${result.tier?.label} | Msg#${result.messageCount}`
      ));
      console.log(gray(`  Detected: ${ind}`));
      console.log();

      sd = result.sessionData;
    } catch (err) {
      process.stdout.write('                              \r');
      console.log(red(`\n  Error: ${err.message}\n`));
    }
  }
}

// ──────────────────────────────────────────────
//  MAIN
// ──────────────────────────────────────────────
async function main() {
  console.clear();
  console.log(cyan(bold('\n  BaatChete — Local Test')));
  console.log(gray('  Language auto-detects per message (Hindi ↔ English freely)'));
  console.log(gray('  "reset" = naya  |  "quit" = band'));
  console.log(gray('  node testLocal.js --demo  = 3 auto scenarios\n'));

  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));
  const c   = await ask(cyan('  Language? (1=English, 2=Hindi): '));
  const lang = c.trim() === '2' ? 'hi' : 'en';
  rl.close();

  if (process.argv.includes('--demo')) await runDemo();
  else await runInteractive(lang);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
