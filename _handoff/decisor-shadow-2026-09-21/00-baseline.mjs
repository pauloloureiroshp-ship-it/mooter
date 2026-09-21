#!/usr/bin/env node
// 00-baseline.mjs — congela o baseline do decisor ANTES de qualquer braco novo.
// Nao re-mede o P1 (sha igual => numeros validos). Acrescenta: acc no gold-84 e no
// validation-set (TREINO), ECE do decisions.log vivo, latencia in-process da regra.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);
const R = (p) => path.join(ROOT, 'tools', 'router', p);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8'));
const out = { at: new Date().toISOString(), node: process.version, host: os.hostname() };

// 1. sha da regra vs protocolo
out.classify_sha256 = sha(R('classify.js'));
out.sha_matches_protocol = out.classify_sha256 === proto.classifier_sha256_expected;
if (!out.sha_matches_protocol) out.WARN = 'classify.js mudou desde o P1: os 35 %/22,2 % NAO sao mais o baseline; re-correr P1/run.mjs --arm A';

// 2. regra em processo: gold-84 + validation-set (ambos TREINO)
const { classify } = require(R('classify.js'));
function acc(items, key) {
  let k = 0, n = 0; const conf = {}; const lat = [];
  for (const it of items) {
    const t0 = process.hrtime.bigint();
    let d; try { d = classify(it.prompt); } catch (e) { d = { tier: 'ERR', confidence: 0 }; }
    lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const exp = it[key]; n++; if (d.tier === exp) k++;
    const c = `${exp}->${d.tier}`; conf[c] = (conf[c] || 0) + 1;
  }
  lat.sort((a, b) => a - b);
  return { k, n, p: n ? k / n : null, confusion: conf, lat_ms_p50: lat[Math.floor(lat.length / 2)] ?? null };
}
try {
  const g = JSON.parse(fs.readFileSync(R('gold-labels.json'), 'utf8'));
  const items = Array.isArray(g) ? g : (g.labels || g.items || Object.values(g));
  out.gold84_TREINO = acc(items, 'expected_tier');
} catch (e) { out.gold84_TREINO = { error: String(e.message) }; }
try {
  const v = JSON.parse(fs.readFileSync(R('validation-set.json'), 'utf8'));
  const items = []; for (const sec of ['canonical', 'adversarial', 'historical']) for (const a of (v[sec] || [])) items.push(a);
  out.validation_set_TREINO = acc(items, 'expected_tier');
} catch (e) { out.validation_set_TREINO = { error: String(e.message) }; }

// 3. ECE do decisions.log vivo (event=executed, outcome ok/nao) — mesma binagem do backtest.js
const LOG = process.env.MOOTER_DECISIONS_LOG || path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
try {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
  const bins = [[0, .2], [.2, .4], [.4, .6], [.6, .8], [.8, 1.001]].map(([lo, hi]) => ({ lo, hi, mid: (lo + Math.min(hi, 1)) / 2, n: 0, ok: 0 }));
  let total = 0, executed = 0, byTier = {};
  let null_lines = 0;
  for (const l of lines) { let e; try { e = JSON.parse(l); } catch { continue; }
    // o decisions.log vivo tem linhas literais "null" (JSON.parse passa, devolve null).
    // Sem esta guarda o e.tier atira e a ECE proxy INTEIRA cai por causa de 14 linhas em 4467.
    if (e === null || typeof e !== 'object') { null_lines++; continue; }
    if (e.tier) byTier[e.tier] = (byTier[e.tier] || 0) + 1;
    if (e.event !== 'executed') continue; executed++;
    const c = Number(e.confidence); if (!Number.isFinite(c)) continue;
    const b = bins.find((b) => c >= b.lo && c < b.hi); if (!b) continue; b.n++; total++; if (e.outcome === 'ok') b.ok++; }
  let ece = 0; for (const b of bins) if (b.n) ece += (b.n / total) * Math.abs(b.ok / b.n - b.mid);
  out.decisions_log = { path: LOG, lines: lines.length, null_lines, executed, in_bins: total, ece: total ? ece : null,
    bins: bins.map((b) => ({ bin: `${b.lo}-${Math.min(b.hi, 1)}`, n: b.n, acc: b.n ? b.ok / b.n : null })), tiers_all_events: byTier,
    _nota: 'outcome=ok NAO e verdade-terreno (e ausencia de escalacao/override); ECE aqui e proxy — a ECE que conta e a dos bracos contra labels-63' };
} catch (e) { out.decisions_log = { error: String(e.message), path: LOG }; }

// 4. referencia P1 (copiada, nao re-medida)
try {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, '_handoff', 'provas-v1-2026-09-09', 'P1-decidir-custa-zero', 'results', 'analysis.json'), 'utf8'));
  const pick = (arm) => arm && { acc40: arm.acc40?.p, acc63: arm.acc63?.p, acc23: arm.acc23?.p, confusion40: arm.acc40?.confusion };
  out.P1_reference = { A_key: pick(a.arms['A-key']), A_nokey: pick(a.arms['A-nokey']), B_juiz: pick(a.arms['B']), at: a.at };
} catch (e) { out.P1_reference = { error: String(e.message) }; }

fs.writeFileSync(path.join(HERE, 'results', '00-baseline.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ sha_ok: out.sha_matches_protocol, gold84: out.gold84_TREINO?.p, valset: out.validation_set_TREINO?.p, ece_log: out.decisions_log?.ece, P1_acc40: out.P1_reference?.A_key?.acc40 }, null, 1));
