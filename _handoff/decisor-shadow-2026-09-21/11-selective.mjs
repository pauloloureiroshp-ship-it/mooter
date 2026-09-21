#!/usr/bin/env node
// 11-selective.mjs — MP6 C3: risco selectivo em vez de ECE global (protocol.json#mp6.hypotheses.C3_selective_risk).
// Para cada ficheiro D (14b v0 · 14b TTA · 27b · 30b) e corpus (40 · 60b · 60c): ordena por p_max desc (a MESMA
// confiança do gate), cobre os X % mais confiantes com D e manda o resto para a regra (A-*.json por item) ou para
// «T2 sempre». Reporta acc e ECE nos cobertos, acc da regra/T2 nos não cobertos, acc combinada. Não corre modelo
// nenhum; não ajusta nada; não escolhe nada (a escolha para o MP4 é a regra do step7, em 12-analyse-mp6.mjs).
// Gate alternativo pré-registado para o 60d (avaliado LÁ): existe X ≥ 60 % com acc_cob ≥ 0,75 E ECE_cob ≤ 0,10.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, P1, ece, wilson } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const mp6 = J(path.join(HERE, 'protocol.json')).mp6;
const COVERAGES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? 'n/d' : x.toFixed(d));
const CORPORA = [
  ['40', 'corpus-40-unredacted.json.json', () => { const o = {}; for (const r of J(path.join(P1, 'results', 'A-nokey.json')).rows) if (r.run === 1 || r.run === undefined) o[r.id] = r.tier; return o; }],
  ['57', 'corpus-60b.json.json', () => { const o = {}; for (const r of J(path.join(RES, 'A-60b.json')).rows) if (r.run === 1 || r.run === undefined) o[r.id] = r.tier; return o; }],
  ['60c', 'corpus-60c.json.json', () => { const o = {}; for (const r of J(path.join(RES, 'A-60c.json')).rows) if (r.run === 1 || r.run === undefined) o[r.id] = r.tier; return o; }],
];
const FILES = [['14b v0', 'D-qwen2.5-coder_14b-'], ['14b TTA', 'D-qwen2.5-coder_14b-tta4-'], ['27b v0', 'D-qwen3.6_27b-'], ['30b v0', 'D-qwen3_30b-']];

export function selectiveCurve(rows, ruleByItem, coverages = COVERAGES) {
  // p_max null (no-letter) vai para o fim; empates por id (ordem estável)
  const sorted = [...rows].sort((a, b) => { const pa = a.p_max == null ? -1 : a.p_max, pb = b.p_max == null ? -1 : b.p_max; return pb - pa || String(a.id).localeCompare(String(b.id)); });
  const n = sorted.length; const out = [];
  for (const X of coverages) {
    const k = Math.round(X * n); const cov = sorted.slice(0, k), unc = sorted.slice(k);
    const covOK = cov.filter((r) => r.correct).length;
    const ruleOK = unc.filter((r) => ruleByItem[r.id] != null && ruleByItem[r.id] === r.expected).length;
    const ruleKnown = unc.filter((r) => ruleByItem[r.id] != null).length;
    const t2OK = unc.filter((r) => r.expected === 'T2').length;
    const e = k ? ece(cov) : { ece: null };
    const covNoLetter = cov.filter((r) => r.p_max == null).length;
    out.push({ coverage: X, n_covered: k, n_uncovered: n - k, p_max_cut: k ? cov[k - 1].p_max : null, acc_covered: k ? covOK / k : null, ci95_covered: k ? wilson(covOK, k) : null, ece_covered: e.ece, covered_no_letter: covNoLetter,
      acc_rule_uncovered: n - k ? ruleOK / (n - k) : null, rule_known_uncovered: ruleKnown, acc_t2_uncovered: n - k ? t2OK / (n - k) : null,
      acc_combined_rule: (covOK + ruleOK) / n, acc_combined_t2: (covOK + t2OK) / n });
  }
  return out;
}
export function altGate(curve, { minCoverage = 0.6, minAcc = 0.75, maxEce = 0.10 } = {}) {
  const hits = curve.filter((c) => c.coverage >= minCoverage && c.acc_covered != null && c.acc_covered >= minAcc && c.ece_covered != null && c.ece_covered <= maxEce && c.covered_no_letter === 0);
  return { pass: hits.length > 0, coverages: hits.map((c) => c.coverage) };
}

const isMain = /11-selective\.mjs$/.test(process.argv[1] || '');
if (isMain) {
  const result = { at: new Date().toISOString(), rule: mp6.hypotheses.C3_selective_risk, coverages: COVERAGES, by_corpus: {} };
  const md = [`# decisor-shadow — MP6 C3 · risco selectivo (acc@cobertura) · ${result.at}`, '',
    `Pré-registo: \`protocol.json#mp6.hypotheses.C3_selective_risk\` (\`_registered_at\` ${mp6._registered_at}). Ordena por \`p_max\` (a mesma confiança do gate) desc, empates por id, \`no-letter\` no fim; cobre os X % mais confiantes com D, o resto vai para a **regra** (\`A-*.json\` por item, run 1) ou para «T2 sempre». ECE nos cobertos = 10 bins sobre \`p_max\`. Nada é ajustado; nada é escolhido aqui. **Gate alternativo (avaliado só no 60d):** existe X ≥ 60 % com acc_cob ≥ 0,75 E ECE_cob ≤ 0,10.`, ''];
  for (const [ck, cf, loadRule] of CORPORA) {
    const ruleByItem = loadRule(); result.by_corpus[ck] = {};
    md.push(`## corpus ${ck}`, '', '| ficheiro | X | n_cob | p_max no corte | acc_cob [IC95] | ECE_cob | regra nos não-cob | T2 nos não-cob | acc comb. (D+regra) | acc comb. (D+T2) |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const [label, prefix] of FILES) {
      const f = path.join(RES, prefix + cf); if (!fs.existsSync(f)) { result.by_corpus[ck][label] = null; md.push(`| ${label} | n/d | | | | | | | | |`); continue; }
      const D = J(f); const rows = D.rows.map((r) => ({ id: r.id, tier: r.tier, p_max: r.p_max, expected: r.expected, correct: r.correct }));
      const missingRule = rows.filter((r) => ruleByItem[r.id] == null).length;
      const curve = selectiveCurve(rows, ruleByItem); const gate = altGate(curve);
      result.by_corpus[ck][label] = { file: path.basename(f), at: D.at, n: rows.length, rule_missing_items: missingRule, no_letter_items: rows.filter((r) => r.p_max == null).length, curve, alt_gate_60d_rule_applied_here: gate };
      for (const c of curve) md.push(`| ${label} | ${(c.coverage * 100).toFixed(0)} % | ${c.n_covered} | ${fmt(c.p_max_cut, 2)} | ${fmt(c.acc_covered)} [${c.ci95_covered ? c.ci95_covered.map((x) => fmt(x, 2)).join('–') : 'n/d'}]${c.covered_no_letter ? ` (${c.covered_no_letter} no-letter)` : ''} | ${fmt(c.ece_covered)} | ${fmt(c.acc_rule_uncovered)}${missingRule ? ` (${missingRule} sem regra)` : ''} | ${fmt(c.acc_t2_uncovered)} | ${fmt(c.acc_combined_rule)} | ${fmt(c.acc_combined_t2)} |`);
      md.push(`| ${label} | **gate alt.** | | | | | | | ${gate.pass ? `**existe** X ∈ {${gate.coverages.map((x) => (x * 100).toFixed(0) + ' %').join(', ')}}` : 'não existe X ≥ 60 % com acc ≥ 0,75 e ECE ≤ 0,10'} | |`);
    }
    md.push('');
  }
  // veredicto C3 (regra pré-registada: exploração = 40 e 57; 14b v0 ou 14b TTA)
  const pass = (ck, label) => result.by_corpus[ck]?.[label]?.alt_gate_60d_rule_applied_here?.pass === true;
  const c3 = { v0: pass('40', '14b v0') && pass('57', '14b v0'), tta: pass('40', '14b TTA') && pass('57', '14b TTA') };
  c3.verdict = c3.v0 || c3.tta ? 'CONFIRMADA' : (!pass('40', '14b v0') && !pass('57', '14b v0') && !pass('40', '14b TTA') && !pass('57', '14b TTA') ? 'REFUTADA' : 'ENTRE');
  result.C3_verdict_exploration = c3;
  md.push(`## C3 (regra pré-registada, só 40 e 57)`, '', `- 14b v0: 40 ${pass('40', '14b v0') ? '✅' : '❌'} · 57 ${pass('57', '14b v0') ? '✅' : '❌'} · 14b TTA: 40 ${pass('40', '14b TTA') ? '✅' : '❌'} · 57 ${pass('57', '14b TTA') ? '✅' : '❌'} → **${c3.verdict}**`, `- 60c (validação, reporta-se): 14b v0 ${pass('60c', '14b v0') ? '✅' : '❌'} · 14b TTA ${pass('60c', '14b TTA') ? '✅' : '❌'}`, '');
  fs.writeFileSync(path.join(RES, '11-selective.md'), md.join('\n'));
  fs.writeFileSync(path.join(RES, '11-selective.json'), JSON.stringify(result, null, 1));
  console.log(md.join('\n'));
}
