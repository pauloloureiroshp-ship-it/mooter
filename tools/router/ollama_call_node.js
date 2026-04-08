#!/usr/bin/env node
/**
 * ollama_call_node.js — portable Node.js Ollama caller for Windows hooks.
 *
 * Used by inject_context.js (Option A) — invoked via spawnSync so it must
 * complete and exit. Prints plain-text response to stdout, exit 0 on success.
 *
 * Usage: node ollama_call_node.js "prompt text here"
 * Env:   OLLAMA_HOST            (default: http://localhost:11434)
 *        OLLAMA_OPTION_A_MODEL  (default: qwen2.5:3b)
 */

'use strict';

const http  = require('http');
const https = require('https');

const SYSTEM = [
  'És um assistente de software engineering conciso.',
  'Respondes em PT-PT (Portugal). Código e identificadores em inglês.',
  'Respostas curtas e directas — nunca mais de 3 frases para perguntas simples.',
  'Não uses preâmbulo. Não repitas o que o user perguntou.',
].join('\n');

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) process.exit(1);

  const hostUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model   = process.env.OLLAMA_OPTION_A_MODEL || 'qwen2.5:3b';

  const body = JSON.stringify({
    model,
    system: SYSTEM,
    prompt,
    stream: false,
    keep_alive: -1, // v0.7: hold model in VRAM between calls (pairs with ollama-warmup.js)
    options: { temperature: 0.2, num_predict: 256 },
  });

  const url = new URL('/api/generate', hostUrl);
  const lib = url.protocol === 'https:' ? https : http;

  await new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const text = (JSON.parse(data).response || '').trim();
            if (text) process.stdout.write(text);
            resolve();
          } catch {
            reject(new Error('parse failed'));
          }
        });
      }
    );
    req.on('error', reject);
    // v0.7: timeout reduced 7s → 3.5s. With keep_alive warmup, qwen2.5:3b
    // answers short prompts in <2s. Outer spawn in inject_context.js has a
    // 4s ceiling so anything above that is wasted wall-clock.
    req.setTimeout(3500, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
