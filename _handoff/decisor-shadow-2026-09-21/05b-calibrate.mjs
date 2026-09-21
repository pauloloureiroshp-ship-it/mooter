#!/usr/bin/env node
// 05b-calibrate.mjs — MP4 (pré-registado em protocol.json#mp4.calibration): calibração isotónica POR CLASSE
// (one-vs-rest, pool-adjacent-violators) sobre p(tier=c) do braço D no 14b. Ajusta SÓ nos 251 rotulados antigos
// (gold-84 + valset-70 + corpus-40 + corpus-60b), valida no 60c (ECE antes/depois — validação, NÃO gate), grava
// results/calibration-weights.json. Node puro, sem modelo. NUNCA corre no 60d: não há flag para isso.
//   node 05b-calibrate.mjs
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { HERE, TIERS, ece } from './lib-common.mjs';
const RES = path.join(HERE, 'results');
if (process.argv.slice(2).some((a) => /60d/i.test(a))) { console.error('RECUSADO: este script não corre sobre o 60d (pré-registo mp4).'); process.exit(3); }
const PROTO = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp4.calibration;
const FIT_FILES = ['D-qwen2.5-coder_14b-gold-84.json', 'D-qwen2.5-coder_14b-valset.json', 'D-qwen2.5-coder_14b-corpus-40-unredacted.json.json', 'D-qwen2.5-coder_14b-corpus-60b.json.json'];
const VAL_FILE = 'D-qwen2.5-coder_14b-corpus-60c.json.json';
const J = (f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
// linhas: {id, expected, tier, probs:{T0..T3}, p_needs_repo, p_high_stakes, ms}
const rowsOf = (D, tag) => D.rows.map((r) => ({ id: `${tag}:${r.id}`, expected: r.expected, tier: r.tier, probs: r.answers.tier.probs, p_needs_repo: r.answers.needs_repo.probs['true'] ?? 0, p_high_stakes: r.answers.high_stakes.probs['true'] ?? 0, ms: r.ms }));

// ── PAV: pares (x, y∈{0,1}) → blocos monótonos [x_lo, x_hi, y_média]; x iguais partilham bloco ──
export function pav(pairs) {
  const s = pairs.slice().sort((a, b) => a.x - b.x);
  const blocks = [];
  for (const p of s) {
    const last = blocks[blocks.length - 1];
    if (last && last.x_hi === p.x) { last.sum += p.y; last.n += 1; } else blocks.push({ x_lo: p.x, x_hi: p.x, sum: p.y, n: 1 });
    while (blocks.length >= 2) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.sum / a.n <= b.sum / b.n) break;
      blocks.splice(blocks.length - 2, 2, { x_lo: a.x_lo, x_hi: b.x_hi, sum: a.sum + b.sum, n: a.n + b.n });
    }
  }
  return blocks.map((b) => ({ x_lo: +b.x_lo.toFixed(6), x_hi: +b.x_hi.toFixed(6), y: +(b.sum / b.n).toFixed(6), n: b.n }));
}
// ── aplicar: dentro de um bloco → y; entre blocos → interpolação linear; fora → clamp ──
export function applyIso(nodes, p) {
  if (!nodes.length || !Number.isFinite(p)) return p;
  if (p <= nodes[0].x_lo) return nodes[0].y;
  if (p >= nodes[nodes.length - 1].x_hi) return nodes[nodes.length - 1].y;
  for (let i = 0; i < nodes.length; i++) {
    const b = nodes[i]; if (p >= b.x_lo && p <= b.x_hi) return b.y;
    const nx = nodes[i + 1]; if (nx && p > b.x_hi && p < nx.x_lo) { const t = (p - b.x_hi) / (nx.x_lo - b.x_hi); return b.y + t * (nx.y - b.y); }
  }
  return p;
}
export function fit(rows) {
  const classes = {};
  for (const c of TIERS) classes[c] = { n_pos: rows.filter((r) => r.expected === c).length, nodes: pav(rows.map((r) => ({ x: r.probs[c] ?? 0, y: r.expected === c ? 1 : 0 }))) };
  return classes;
}
// candidatos (b) e (c) e o diagnóstico b′ — como o pré-registo os define
export function candidates(rows, classes) {
  const b = rows.map((r) => ({ ...r, p_max: applyIso(classes[r.tier].nodes, r.probs[r.tier] ?? 0), correct: r.tier === r.expected }));
  const c = rows.map((r) => { const fired = r.tier === 'T0' && (r.p_needs_repo >= 0.5 || r.p_high_stakes >= 0.5); const tier = fired ? 'T2' : r.tier; return { ...r, tier, guard_fired: fired, p_max: applyIso(classes[tier].nodes, r.probs[tier] ?? 0), correct: tier === r.expected }; });
  const bp = rows.map((r) => { const q = {}; let s = 0; for (const t of TIERS) { q[t] = applyIso(classes[t].nodes, r.probs[t] ?? 0); s += q[t]; } for (const t of TIERS) q[t] = s > 0 ? q[t] / s : 0.25; const tier = TIERS.reduce((a, t) => (q[t] > q[a] ? t : a), 'T0'); return { ...r, tier, p_max: q[tier], correct: tier === r.expected, changed: tier !== r.tier }; });
  return { b, c, bp };
}
const acc = (rows) => rows.filter((r) => r.correct).length / rows.length;
const fmt = (x) => (x == null ? 'n/d' : x.toFixed(3));

const isMain = /05b-calibrate.mjs$/.test(process.argv[1] || '');
if (isMain) {
  const fitRows = []; const sources = [];
  for (const f of FIT_FILES) { const D = J(f); const rows = rowsOf(D, f.replace(/^D-qwen2\.5-coder_14b-/, '').replace(/\.json.*$/, '')); fitRows.push(...rows); sources.push({ file: f, n: rows.length, at: D.at, model: D.model }); }
  if (fitRows.length !== 251) { console.error(`esperava 251 linhas de ajuste, tenho ${fitRows.length}`); process.exit(2); }
  const classes = fit(fitRows);
  const v0Fit = fitRows.map((r) => ({ ...r, p_max: r.probs[r.tier], correct: r.tier === r.expected }));
  const inSample = { v0_ece: ece(v0Fit).ece, b_ece: ece(candidates(fitRows, classes).b).ece, acc: acc(v0Fit) };
  // validação no 60c
  const V = J(VAL_FILE); const valRows = rowsOf(V, '60c');
  const v0 = valRows.map((r) => ({ ...r, p_max: r.probs[r.tier], correct: r.tier === r.expected }));
  const guard0 = valRows.map((r) => { const fired = r.tier === 'T0' && (r.p_needs_repo >= 0.5 || r.p_high_stakes >= 0.5); const tier = fired ? 'T2' : r.tier; return { ...r, tier, p_max: r.probs[tier], correct: tier === r.expected }; });
  const { b, c, bp } = candidates(valRows, classes);
  const val = {
    n: valRows.length,
    a_v0: { acc: acc(v0), ece: ece(v0).ece, bins: ece(v0).bins },
    b_v0_calibrated: { acc: acc(b), ece: ece(b).ece, bins: ece(b).bins, ece_le_010: ece(b).ece <= 0.10 },
    c_guard: { acc_before: acc(guard0), ece_before: ece(guard0).ece, acc: acc(c), ece: ece(c).ece, guard_fired: c.filter((r) => r.guard_fired).length },
    b_prime_diagnostic: { acc: acc(bp), ece: ece(bp).ece, decisions_changed: bp.filter((r) => r.changed).length },
  };
  const scriptSha = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
  const weights = { _schema: 'decisor-shadow/calibration-weights-v1', _fitted_at: new Date().toISOString(), _method: PROTO.method, _fitted_on: sources, _n: fitRows.length, _model: 'qwen2.5-coder:14b', _script: '05b-calibrate.mjs', _script_sha256: scriptSha, _in_sample_251: inSample, _validation_60c: { n: val.n, v0_ece_before: val.a_v0.ece, b_ece_after: val.b_v0_calibrated.ece }, classes };
  fs.writeFileSync(path.join(RES, 'calibration-weights.json'), JSON.stringify(weights, null, 1));
  fs.writeFileSync(path.join(RES, 'calibration-validation-60c.json'), JSON.stringify({ at: weights._fitted_at, in_sample_251: inSample, validation_60c: val }, null, 1));
  console.log(`ajuste em ${fitRows.length} (${sources.map((s) => `${s.n}`).join('+')}): ECE v0 in-sample ${fmt(inSample.v0_ece)} → calibrado ${fmt(inSample.b_ece)}; nós por classe ${TIERS.map((t) => `${t}:${classes[t].nodes.length}`).join(' ')}`);
  console.log(`60c (n=${val.n}, validação): v0 acc ${fmt(val.a_v0.acc)} ECE ${fmt(val.a_v0.ece)} → (b) ECE ${fmt(val.b_v0_calibrated.ece)} ${val.b_v0_calibrated.ece_le_010 ? '≤ 0,10 ✅' : '> 0,10 ❌'} · (c) guard acc ${fmt(val.c_guard.acc)} ECE ${fmt(val.c_guard.ece_before)} → ${fmt(val.c_guard.ece)} (disparou ${val.c_guard.guard_fired}×) · b′ acc ${fmt(val.b_prime_diagnostic.acc)} ECE ${fmt(val.b_prime_diagnostic.ece)}, mudaria ${val.b_prime_diagnostic.decisions_changed} decisões`);
  console.log(`→ results/calibration-weights.json (sha do script ${scriptSha.slice(0, 12)})`);
}
