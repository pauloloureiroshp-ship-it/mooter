#!/usr/bin/env node
// 07-guard.mjs — MP3 A3: v0-guard sobre as MESMAS respostas do braco D (zero corridas), juntando v0 e v0+T
// (estes vem do 05-policy-v1.mjs --apply, T=1,55 fixado no MP2). Regra pre-registada (protocol.json#mp3):
//   se argmax == T0 e (p_needs_repo >= 0,5 ou p_high_stakes >= 0,5) -> T2; senao argmax. p_max do guardado = p(T2).
//   node 07-guard.mjs --d results/D-<...>-corpus-60c.json.json --labels results/labels-60c.json --applied <05 --apply out> --out results/policy-60c.json
import fs from 'node:fs'; import path from 'node:path';
import { TIERS, opt, wilson, ece, mcnemar } from './lib-common.mjs';
const D = JSON.parse(fs.readFileSync(opt('--d'), 'utf8')); const L = JSON.parse(fs.readFileSync(opt('--labels'), 'utf8'));
const labels = Object.fromEntries(L.labels.map((l) => [l.id, l.tier])); const applied = JSON.parse(fs.readFileSync(opt('--applied'), 'utf8'));
const THR = 0.5;
const rows = D.rows.map((r) => {
  const a = r.answers; const pt = a.tier.probs; const arg = TIERS.reduce((b, t) => (pt[t] > pt[b] ? t : b), 'T0');
  const fired = arg === 'T0' && ((a.needs_repo.probs['true'] ?? 0) >= THR || (a.high_stakes.probs['true'] ?? 0) >= THR);
  const tier = fired ? 'T2' : arg; const p_max = fired ? pt.T2 : pt[arg];
  return { id: r.id, expected: labels[r.id], tier, p_max, guard_fired: fired, correct: tier === labels[r.id], abstain: p_max < 0.4, ms: r.ms };
});
const refs = { always_T2: Object.fromEntries(rows.map((r) => [r.id, 'T2'])), always_T3: Object.fromEntries(rows.map((r) => [r.id, 'T3'])) };
const ruleFile = opt('--rule', null); if (ruleFile) refs.rule_A_nokey = Object.fromEntries(JSON.parse(fs.readFileSync(ruleFile, 'utf8')).rows.map((r) => [r.id, r.tier]));
const k = rows.filter((r) => r.correct).length, n = rows.length; const conf = {}, pred = {};
for (const r of rows) { conf[`${r.expected}->${r.tier}`] = (conf[`${r.expected}->${r.tier}`] || 0) + 1; pred[r.tier] = (pred[r.tier] || 0) + 1; }
const lat = rows.map((r) => r.ms).sort((a, b) => a - b);
const guard = { k, n, acc: k / n, ci95: wilson(k, n), ece: ece(rows), confusion: conf, pred_dist: pred, abstain: rows.filter((r) => r.abstain).length, guard_fired: rows.filter((r) => r.guard_fired).length, p50_ms: lat[Math.floor(n / 2)], mcnemar: Object.fromEntries(Object.entries(refs).map(([nm, ref]) => [nm, mcnemar(rows, ref)])), rows };
const out = { at: new Date().toISOString(), source: path.basename(opt('--d')), labels: opt('--labels'), n, threshold: THR, primary: 'v0', candidates: { v0: applied.candidates.v0, 'v0+T': applied.candidates['v0+T'], 'v0-guard': guard } };
fs.writeFileSync(opt('--out'), JSON.stringify(out, null, 1));
for (const [nm, c] of Object.entries(out.candidates)) console.log(`${nm.padEnd(9)} acc=${c.acc.toFixed(3)} (${c.k}/${c.n}) ECE=${c.ece.ece.toFixed(3)} ` + Object.entries(c.mcnemar).map(([r, m]) => `vs ${r}: ${m.b}/${m.c} p=${m.p?.toFixed(4)}`).join(' · ') + (c.guard_fired != null ? ` · guard disparou ${c.guard_fired}×` : ''));
