#!/usr/bin/env node
/**
 * ollama-warmup.js — keeps qwen2.5:3b resident in Ollama memory so the
 * hook's Option A path and T0-general routing don't pay cold-start.
 *
 * Spawned (detached) by inject_context.js at hook startup when the tracker
 * pid file is stale (≥1h). Sends ONE lightweight generate request with
 * `keep_alive: -1` — Ollama interprets that as "hold the model until I
 * explicitly unload it". Returns immediately after the POST is acked.
 *
 * Gotcha: Ollama's VRAM scheduler may still evict the model when another
 * larger model is loaded. The daemon is meant to be called periodically
 * (via the tracker auto-start cadence) rather than once and forgotten.
 *
 * Zero external deps. Silent on success. Non-zero exit on failure is fine
 * because the caller is `execFile` with stdio ignored.
 */

'use strict';

const http = require('http');
const https = require('https');

const HOST_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';
const MODELS = (process.env.FRUGAL_WARMUP_MODELS || 'qwen2.5:3b')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function warmupOne(model) {
  return new Promise((resolve) => {
    const url = new URL('/api/generate', HOST_URL);
    const lib = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({
      model,
      prompt: '.',
      stream: false,
      keep_alive: -1,
      options: { num_predict: 1, temperature: 0 },
    });
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode === 200));
      }
    );
    req.on('error', () => resolve(false));
    // 15s is generous — cold model load on RTX 4090 is 8-10s for 3b, much
    // less on warm. We're in a detached child so a longer timeout is fine.
    req.setTimeout(15000, () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const model of MODELS) {
    await warmupOne(model);
  }
  process.exit(0);
})();
