#!/usr/bin/env node
/**
 * setup-profile.js — interactive subscription profile setup for frugal.
 *
 * Asks the user about their AI subscriptions and writes
 * ~/.claude/tools/router/subscription-profile.json so the router can
 * adjust budget caps and fallback strategies accordingly.
 *
 * Run once: node ~/.claude/tools/router/setup-profile.js
 * Re-run any time subscriptions change.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const PROFILE_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'subscription-profile.json');

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

function isYes(answer) {
  return answer === 'y' || answer === 'yes' || answer === 's' || answer === 'sim';
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log('frugal — subscription profile setup');
  console.log('');

  const profiles = {
    anthropic: 'none',
    openai: 'none',
    gemini: 'none',
  };

  // Anthropic
  const hasMax = await ask(rl, 'Do you have Claude Max (unlimited)? [y/N]: ');
  if (isYes(hasMax)) {
    profiles.anthropic = 'max';
    console.log('  → budget_cap disabled for anthropic');
  } else {
    const hasApiKey = await ask(rl, 'Do you have an Anthropic API key (pay-per-token)? [y/N]: ');
    if (isYes(hasApiKey)) {
      profiles.anthropic = 'api-paid';
      console.log('  → anthropic: api-paid, budget cap active');
    } else {
      profiles.anthropic = 'api-free';
      console.log('  → anthropic: api-free, aggressive budget cap');
    }
  }

  // OpenAI
  const hasOpenai = await ask(rl, 'Do you have an OpenAI API key? [y/N]: ');
  if (isYes(hasOpenai)) {
    profiles.openai = 'api-paid';
    console.log('  → openai: api-paid, GPT-4o available as T2 fallback');
  }

  // Gemini
  const hasGemini = await ask(rl, 'Do you have Gemini API access? [y/N]: ');
  if (isYes(hasGemini)) {
    profiles.gemini = 'api-paid';
    console.log('  → gemini: api-paid');
  }

  const profile = {
    updated_at: new Date().toISOString(),
    profiles,
    budget_strategy: 'auto',
  };

  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + '\n');

  console.log('');
  console.log(`Profile saved to ${PROFILE_PATH}`);
  console.log('frugal is now aware of your subscriptions.');
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error('setup-profile error:', err.message);
  process.exit(1);
});
