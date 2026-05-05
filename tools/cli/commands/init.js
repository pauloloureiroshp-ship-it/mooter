const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');
const { color, say, ok, warn, info } = require('../lib/ui');
const { paths, which } = require('../lib/paths');

function prompt(q, def = 'n') {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const defLabel = def === 'y' ? 'Y/n' : 'y/N';
    rl.question(`  ${q} [${defLabel}]: `, (ans) => {
      rl.close();
      const a = (ans || '').trim().toLowerCase();
      if (!a) return resolve(def === 'y');
      resolve(['y', 'yes', 's', 'sim'].includes(a));
    });
  });
}

async function run() {
  console.log('');
  console.log(`  ${color.magenta('mooter init')} ${color.dim('— first-run setup wizard')}`);
  console.log('');

  if (!fs.existsSync(paths.frugal)) fs.mkdirSync(paths.frugal, { recursive: true });
  if (!fs.existsSync(paths.mooter)) fs.mkdirSync(paths.mooter, { recursive: true });

  if (!fs.existsSync(paths.deviceId)) {
    fs.writeFileSync(paths.deviceId, crypto.randomUUID() + '\n');
    ok('Device ID generated');
  } else {
    ok('Device ID already set');
  }

  const subFile = path.join(paths.router, 'subscription-profile.json');
  if (!fs.existsSync(subFile)) {
    say("Let's configure your subscription profile.");

    // 2026-05-05 (deepdive #38 follow-up): probe env for API keys before
    // asking. If the user has already exported a key, default the answer
    // to 'y' so they can just press Enter — and surface the detection so
    // they understand why. Claude Max has no env signal, stays a question.
    const detectedAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const detectedOpenAI    = !!process.env.OPENAI_API_KEY;
    const detectedGemini    = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

    const detectedSummary = [
      detectedAnthropic && 'ANTHROPIC_API_KEY',
      detectedOpenAI    && 'OPENAI_API_KEY',
      detectedGemini    && (process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : 'GOOGLE_API_KEY'),
    ].filter(Boolean);
    if (detectedSummary.length) {
      info(`Detected in environment: ${detectedSummary.join(', ')} — pre-filled below.`);
    }

    const hasMax    = await prompt('Do you have Claude Max (unlimited Opus)?');
    const hasApi    = hasMax ? false : await prompt(
      detectedAnthropic
        ? 'Anthropic API key detected — confirm pay-per-token plan?'
        : 'Do you have an Anthropic API key (pay-per-token)?',
      detectedAnthropic ? 'y' : 'n',
    );
    const hasOpenAI = await prompt(
      detectedOpenAI
        ? 'OpenAI API key detected — confirm?'
        : 'Do you have an OpenAI API key?',
      detectedOpenAI ? 'y' : 'n',
    );
    const hasGemini = await prompt(
      detectedGemini
        ? 'Gemini / Google API key detected — confirm?'
        : 'Do you have Gemini API access?',
      detectedGemini ? 'y' : 'n',
    );

    const profile = {
      updated_at: new Date().toISOString(),
      profiles: {
        anthropic: hasMax ? 'max' : hasApi ? 'api-paid' : 'none',
        openai: hasOpenAI ? 'api-paid' : 'none',
        gemini: hasGemini ? 'api-paid' : 'none',
      },
      budget_strategy: 'auto',
      detection: {
        anthropic_env: detectedAnthropic,
        openai_env:    detectedOpenAI,
        gemini_env:    detectedGemini,
      },
      notes: 'Configured via mooter init',
    };
    fs.mkdirSync(paths.router, { recursive: true });
    fs.writeFileSync(subFile, JSON.stringify(profile, null, 2));
    ok(`Subscription profile saved (anthropic: ${profile.profiles.anthropic})`);
  } else {
    ok('Subscription profile already configured');
  }

  const ollamaBin = which('ollama');
  if (!ollamaBin) {
    console.log('');
    warn('Ollama not installed. T0 tier (local, free) will be disabled.');
    console.log('');
    console.log('  Options:');
    console.log(`    [1] I'll install Ollama now: ${color.bold('https://ollama.com/download')}`);
    console.log(`    [2] Skip — continue cloud-only (T1+ still works)`);
    console.log('');
    info('After installing Ollama, run: mooter doctor');
  } else {
    say('Ollama detected. Checking required models...');
    let list = '';
    try {
      list = execSync('ollama list').toString();
    } catch {
      warn('Ollama installed but daemon not running. Start the Ollama app or: ollama serve');
    }
    if (list) {
      const needsTerse = !/qwen2\.5:3b/.test(list);
      const needsEmbed = !/nomic-embed-text/.test(list);
      if (needsTerse) {
        say('Pulling qwen2.5:3b (~1.9 GB) in the foreground...');
        try {
          execSync('ollama pull qwen2.5:3b', { stdio: 'inherit' });
          ok('qwen2.5:3b ready');
        } catch {
          warn('Pull failed — you can retry later: ollama pull qwen2.5:3b');
        }
      } else {
        ok('qwen2.5:3b already pulled');
      }
      if (needsEmbed) {
        say('Pulling nomic-embed-text (~274 MB) for KNN similarity...');
        try {
          execSync('ollama pull nomic-embed-text', { stdio: 'inherit' });
          ok('nomic-embed-text ready');
        } catch {
          warn('nomic-embed-text pull failed — KNN will fall back');
        }
      } else {
        ok('nomic-embed-text already pulled');
      }
    }
  }

  console.log('');
  ok('mooter init complete.');
  console.log('');
  console.log('  Next steps:');
  console.log(`    1. ${color.bold('mooter doctor')}   ${color.dim('— verify everything')}`);
  console.log(`    2. ${color.bold('mooter')}           ${color.dim('— launch Claude Code with routing')}`);
  console.log('');
}

module.exports = { run };
