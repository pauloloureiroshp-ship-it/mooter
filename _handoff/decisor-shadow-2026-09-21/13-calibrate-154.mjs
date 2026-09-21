#!/usr/bin/env node
// 13-calibrate-154.mjs — MP6 step7 (protocol.json#mp6.step7_candidate_rule.fairness): isotónica por classe ajustada
// SÓ nos 154 canónicos (gold-84 + valset-70), para as variantes `iso` (v0) e `tta_iso` (TTA), avaliada OUT-OF-SAMPLE
// nos 3 corpora reais (40 · 57 · 60c). Importa pav/fit/applyIso/candidates de 05b-calibrate.mjs SEM o alterar.
// Os pesos do mp4 (251) não se tocam. NUNCA corre no 60d. Não escolhe nada — a ordenação é do 12-analyse-mp6.mjs.
//   node 13-calibrate-154.mjs [--refit-declared]
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { HERE, TIERS, ece } from './lib-common.mjs';
import { fit, candidates, applyIso } from './05b-calibrate.mjs';
const RES = path.join(HERE, 'results');
if (process.argv.slice(2).some((a) => /60d/i.test(a))) { console.error('RECUSADO: este script não corre sobre o 60d.'); process.exit(3); }
const J = (f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
const shaOf = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(RES, f))).digest('hex');
const rowsOf = (D, tag) => D.rows.map((r) => ({ id: `${tag}:${r.id}`, expected: r.expected, tier: r.tier, probs: r.answers.tier.probs, p_needs_repo: r.answers.needs_repo.probs['true'] ?? 0, p_high_stakes: r.answers.high_stakes.probs['true'] ?? 0, ms: r.ms }));
const acc = (rows) => rows.filter((r) => r.correct).length / rows.length;
const fmt = (x) => (x == null ? 'n/d' : x.toFixed(3));
const VARIANTS = {
  v0:  { fit: ['D-qwen2.5-coder_14b-gold-84.json', 'D-qwen2.5-coder_14b-valset.json'], eval: { '40': 'D-qwen2.5-coder_14b-corpus-40-unredacted.json.json', '57': 'D-qwen2.5-coder_14b-corpus-60b.json.json', '60c': 'D-qwen2.5-coder_14b-corpus-60c.json.json' } },
  tta: { fit: ['D-qwen2.5-coder_14b-tta4-gold-84.json', 'D-qwen2.5-coder_14b-tta4-valset.json'], eval: { '40': 'D-qwen2.5-coder_14b-tta4-corpus-40-unredacted.json.json', '57': 'D-qwen2.5-coder_14b-tta4-corpus-60b.json.json', '60c': 'D-qwen2.5-coder_14b-tta4-corpus-60c.json.json' } },
};
const scriptSha = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
const summary = { at: new Date().toISOString(), script_sha256: scriptSha, variants: {} };
for (const [name, V] of Object.entries(VARIANTS)) {
  const OUT = path.join(RES, `calibration-weights-154-${name}.json`);
  if (fs.existsSync(OUT) && !process.argv.includes('--refit-declared')) { console.error(`RECUSADO: ${OUT} já existe. Um re-ajuste é uma emenda: apaga à mão e corre com --refit-declared, e escreve a razão no PROGRESSO.`); process.exit(4); }
  const fitRows = []; const sources = [];
  for (const f of V.fit) { const D = J(f); const rows = rowsOf(D, f.replace(/^D-qwen2\.5-coder_14b-(tta4-)?/, '').replace(/\.json.*$/, '')); fitRows.push(...rows); sources.push({ file: f, n: rows.length, at: D.at, model: D.model, tta_letters: D.tta_letters || 0, sha256: shaOf(f) }); }
  if (fitRows.length !== 154) { console.error(`${name}: esperava 154 linhas de ajuste, tenho ${fitRows.length}`); process.exit(2); }
  const classes = fit(fitRows);
  const raw = fitRows.map((r) => ({ ...r, p_max: r.probs[r.tier], correct: r.tier === r.expected }));
  const inSample = { acc: acc(raw), ece_before: ece(raw).ece, ece_after_b: ece(candidates(fitRows, classes).b).ece };
  const evalOut = {};
  for (const [ck, f] of Object.entries(V.eval)) {
    const D = J(f); const rows = rowsOf(D, ck);
    const before = rows.map((r) => ({ ...r, p_max: r.probs[r.tier], correct: r.tier === r.expected }));
    const { b, bp } = candidates(rows, classes);
    evalOut[ck] = { file: f, sha256: shaOf(f), n: rows.length, acc: acc(before), ece_before: ece(before).ece, ece_after_b: ece(b).ece, bins_after_b: ece(b).bins, b_prime_diag: { acc: acc(bp), ece: ece(bp).ece, decisions_changed: bp.filter((r) => r.changed).length } };
  }
  const weights = { _schema: 'decisor-shadow/calibration-weights-154-v1', _variant: name, _fitted_at: summary.at, _method: 'isotónica por classe, one-vs-rest, PAV (05b-calibrate.mjs#fit, importado sem alterar)', _fitted_on: sources, _n: fitRows.length, _model: 'qwen2.5-coder:14b', _script: '13-calibrate-154.mjs', _script_sha256: scriptSha, _in_sample_154: inSample, _out_of_sample: Object.fromEntries(Object.entries(evalOut).map(([k, v]) => [k, { file: v.file, sha256: v.sha256, n: v.n, acc: v.acc, ece_before: v.ece_before, ece_after_b: v.ece_after_b }])), classes };
  fs.writeFileSync(OUT, JSON.stringify(weights, null, 1));
  summary.variants[name] = { weights_file: path.basename(OUT), in_sample_154: inSample, nodes: Object.fromEntries(TIERS.map((t) => [t, classes[t].nodes.length])), eval: evalOut };
  console.log(`${name}: ajuste em 154 (${sources.map((s) => s.n).join('+')}) ECE in-sample ${fmt(inSample.ece_before)} → ${fmt(inSample.ece_after_b)}; nós ${TIERS.map((t) => `${t}:${classes[t].nodes.length}`).join(' ')}`);
  for (const [ck, e] of Object.entries(evalOut)) console.log(`   ${ck}: acc ${fmt(e.acc)} · ECE ${fmt(e.ece_before)} → (b-154) ${fmt(e.ece_after_b)} · b′ mudaria ${e.b_prime_diag.decisions_changed} (acc ${fmt(e.b_prime_diag.acc)}, ECE ${fmt(e.b_prime_diag.ece)})`);
}
// referência: os pesos do mp4 (251) aplicados ao v0 — in-sample no 40 e no 57 (declarado), validação no 60c
const W251 = J('calibration-weights.json');
summary.reference_b_251 = {};
for (const [ck, f] of Object.entries(VARIANTS.v0.eval)) {
  const rows = rowsOf(J(f), ck); const b = rows.map((r) => ({ ...r, p_max: applyIso(W251.classes[r.tier].nodes, r.probs[r.tier] ?? 0), correct: r.tier === r.expected }));
  summary.reference_b_251[ck] = { ece_after_b_251: ece(b).ece, in_sample: ck !== '60c' };
  console.log(`(b)-251 no ${ck}: ECE ${fmt(ece(b).ece)}${ck !== '60c' ? ' (IN-SAMPLE — não comparável)' : ' (validação)'}`);
}
fs.writeFileSync(path.join(RES, '13-calibration-154.json'), JSON.stringify(summary, null, 1));
