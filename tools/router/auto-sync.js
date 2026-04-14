#!/usr/bin/env node
/**
 * auto-sync.js — sync silencioso de métricas para o dashboard
 *
 * Chamado pelo gsd-turn-end.js no fim de cada turn.
 * Fire-and-forget: nunca bloqueia, nunca falha visivelmente.
 *
 * Rate limit: máximo 1 sync a cada 5 minutos por device.
 * Sem token válido: sai sem erro.
 * Sem tracker local: sai sem erro.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const FRUGAL_DIR = path.join(os.homedir(), '.frugal');
const LAST_SYNC_PATH = path.join(FRUGAL_DIR, '.last-sync');
const TOKEN_PATH = path.join(FRUGAL_DIR, 'auth.token');
const DEVICE_ID_PATH = path.join(FRUGAL_DIR, 'device.id');
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const LANDING_URL = process.env.MOOTER_LANDING_URL
  || process.env.FRUGAL_LANDING_URL
  || 'https://mooter.ai';

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
}

function safeJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp < Math.floor(Date.now() / 1000) + 60; // 60s buffer
  } catch { return true; }
}

function shouldSync() {
  try {
    const ts = parseInt(fs.readFileSync(LAST_SYNC_PATH, 'utf8').trim(), 10);
    if (Date.now() - ts < SYNC_COOLDOWN_MS) return false;
  } catch { /* no file = never synced */ }
  return true;
}

function markSynced() {
  try {
    fs.mkdirSync(FRUGAL_DIR, { recursive: true });
    fs.writeFileSync(LAST_SYNC_PATH, String(Date.now()));
  } catch { /* non-fatal */ }
}

function fetchMetrics() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:7821/metrics', { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function postSync(token, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url = new URL(LANDING_URL + '/api/install-complete');
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'frugal-auto-sync/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); } });
    });
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, timeout: true }); });
    req.on('error', () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Rate limit
  if (!shouldSync()) process.exit(0);

  // 2. Token check
  const token = safeRead(TOKEN_PATH);
  if (!token || isTokenExpired(token)) process.exit(0);

  // 3. Local metrics
  const metrics = await fetchMetrics();
  if (!metrics) process.exit(0);

  // 4. Device info
  const deviceId = safeRead(DEVICE_ID_PATH);
  const hwCap = safeJson(path.join(ROUTER_DIR, 'hw-capability.json'));
  const subProfile = safeJson(path.join(ROUTER_DIR, 'subscription-profile.json'));
  const versionFile = safeJson(path.join(ROUTER_DIR, 'version.json'));

  const payload = {
    device_id: deviceId || undefined,
    device_name: `${os.hostname()} (auto-sync)`,
    hw_tier: hwCap?.hw_tier || 'cpu-only',
    gpu_name: hwCap?.name_short || hwCap?.name || null,
    gpu_vram_mb: hwCap?.vramMB || null,
    has_anthropic_key: !!(subProfile?.keys?.anthropic),
    has_openai_key: !!(subProfile?.keys?.openai),
    has_gemini_key: !!(subProfile?.keys?.gemini),
    has_ollama: !!(metrics.has_ollama || subProfile?.integrations?.ollama),
    ollama_models: metrics.ollama_models || [],
    ollama_has_qwen3b: !!(metrics.ollama_models || []).some(m => m.includes('qwen3')),
    ollama_has_qwen30b: !!(metrics.ollama_models || []).some(m => m.includes('qwen3:30')),
    frugal_version: versionFile?.version || '0.0.0',
    os_type: process.platform,
    arch: process.arch,
    decisions_count: metrics.prompts || metrics.total_prompts || 0,
    savings_usd: metrics.saved || metrics.advisory_saved || 0,
    guaranteed_saved_usd: metrics.guaranteed_saved || 0,
  };

  // 5. Sync
  await postSync(token, payload);
  markSynced();
}

main().catch(() => process.exit(0)); // nunca falha visivelmente
