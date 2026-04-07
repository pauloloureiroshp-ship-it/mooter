#!/usr/bin/env node
/**
 * fx.js — USD foreign exchange cache for frugal.
 *
 * Used by savings-tracker.js to expose cost in BRL (or any supported
 * currency) alongside USD. Cache is refreshed at most once per 24h and
 * lives at ~/.claude/tools/router/.fx-cache.json.
 *
 * On network failure, falls back to a conservative hard-coded rate so
 * the statusline never shows "—". The fallback is intentionally stale
 * (updated manually every few months) and marked as such in the cache.
 *
 * Provider: exchangerate.host (no API key, free, rate-limited but fine
 * for 1 req/day). If it disappears, swap the URL in fetchRatesSync.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CACHE_PATH = path.join(
  os.homedir(),
  '.claude',
  'tools',
  'router',
  '.fx-cache.json'
);

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Fallback rates (update manually every few months). Used only when
// network + cache both fail. Last reviewed: 2026-04-07.
const FALLBACK_RATES = {
  base: 'USD',
  rates: {
    BRL: 5.42,
    EUR: 0.93,
    GBP: 0.79,
  },
  stale: true,
  source: 'hard-coded fallback',
  ts: 0,
};

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (j && j.rates && j.ts && Date.now() - j.ts < CACHE_TTL_MS) {
      return j;
    }
  } catch { /* miss */ }
  return null;
}

function writeCache(data) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data), 'utf8');
  } catch { /* best-effort */ }
}

/**
 * Synchronously fetch USD→{BRL,EUR,GBP} rates. Uses a subprocess with
 * a 2.5s hard timeout so we never block the hook. Returns null on any
 * failure.
 */
function fetchRatesSync() {
  const script = `
    const https = require('https');
    const req = https.get(
      'https://api.exchangerate.host/latest?base=USD&symbols=BRL,EUR,GBP',
      (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => process.stdout.write(body));
      }
    );
    req.on('error', () => process.exit(1));
    req.setTimeout(2000, () => { req.destroy(); process.exit(2); });
  `;
  const r = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 2500,
    windowsHide: true,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    if (!parsed || !parsed.rates || typeof parsed.rates !== 'object') return null;
    return {
      base: parsed.base || 'USD',
      rates: parsed.rates,
      stale: false,
      source: 'exchangerate.host',
      ts: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * getRates() → {base, rates: {BRL, EUR, GBP}, stale, source, ts}
 * Never throws. Always returns an object.
 */
function getRates() {
  const cached = readCache();
  if (cached) return cached;

  const fresh = fetchRatesSync();
  if (fresh) {
    writeCache(fresh);
    return fresh;
  }

  // Last resort: return the stale fallback. Don't write to cache so
  // we retry on the next call.
  return { ...FALLBACK_RATES, ts: Date.now() };
}

/**
 * convert(usdAmount, targetCurrency) → number
 * Returns the same USD amount if the target is USD or unknown.
 */
function convert(usdAmount, targetCurrency) {
  const n = Number(usdAmount) || 0;
  const tgt = (targetCurrency || 'USD').toUpperCase();
  if (tgt === 'USD') return n;
  const rates = getRates().rates || {};
  const rate = rates[tgt];
  if (!rate || !Number.isFinite(rate)) return n;
  return n * rate;
}

/**
 * format(amount, currency) → "R$5.42" | "$1.00" | "€0.93"
 * Opinionated, matches statusline expectations.
 */
function format(amount, currency) {
  const n = Number(amount) || 0;
  const sym = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' }[currency] || '$';
  return `${sym}${n.toFixed(2)}`;
}

module.exports = {
  getRates,
  convert,
  format,
  FALLBACK_RATES,
  CACHE_PATH,
  CACHE_TTL_MS,
};
