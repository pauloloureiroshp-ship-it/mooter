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
    const hasMax = await prompt('Do you have Claude Max (unlimited Opus)?');
    const hasApi = hasMax ? false : await prompt('Do you have an Anthropic API key (pay-per-token)?');
    const hasOpenAI = await prompt('Do you have an OpenAI API key?');
    const hasGemini = await prompt('Do you have Gemini API access?');

    const profile = {
      updated_at: new Date().toISOString(),
      profiles: {
        anthropic: hasMax ? 'max' : hasApi ? 'api-paid' : 'none',
        openai: hasOpenAI ? 'api-paid' : 'none',
        gemini: hasGemini ? 'api-paid' : 'none',
      },
      budget_strategy: 'auto',
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
