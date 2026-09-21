#!/usr/bin/env node
// 16-gate-f2.mjs — A implementação ÚNICA do gate de F2 do 60d (AMENDMENT mp4-3 + correcções do round 7).
// Usada pela pré-visualização nos corpora já rotulados (--preview) e, quando houver rótulos, pelo 60d — o mesmo
// código, para o preview não avaliar «outro candidato» (round 7 A1). Funções puras, exportadas e testadas
// (16-gate-f2.test.mjs). Não corre modelo; não escreve texto; nunca lê rótulos do 60d (não há flag para isso).
//   node 16-gate-f2.mjs --preview      # 40 · 57 · 60c com D v0 do 14b, regra por item, texto só para o predicado HIGH_RISK
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { HERE, ROOT, P1, TIERS, ece, wilson, mcnemar } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const RANK = { T0: 0, T1: 1, T2: 2, T3: 3 };
export const ABSTAIN_BELOW = 0.4; // = DECISOR_ABSTAIN_BELOW em tools/router/arbiter.js (e o limiar do harness desde o MP1)
export const P50_MAX_MS = 250; export const ALPHA = 0.05;

// O predicado HIGH_RISK que a PRODUÇÃO usa para recusar despromoções do arbiter (inject_context.js: isDowngrade &&
// isHighRiskPrompt). Lido do ficheiro em vez de importado (o módulo é um hook e corre ao ser requerido); a linha fica
// autenticada por sha12 para o relatório dizer QUAL regex foi usada.
export function highRiskHint() {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'router', 'inject_context.js'), 'utf8');
  const m = src.match(/^const HIGH_RISK_HINT = (\/.*\/i);\s*$/m); if (!m) throw new Error('HIGH_RISK_HINT não encontrado em inject_context.js');
  const body = m[1]; const re = new RegExp(body.slice(1, body.lastIndexOf('/')), body.slice(body.lastIndexOf('/') + 1));
  return { regex: re, source_sha12: crypto.createHash('sha256').update(m[0]).digest('hex').slice(0, 12), source: body.slice(0, 80) + '…' };
}
// HIGH_RISK por item (MP8): o campo do EVENTO quando existe (calculado pelo hook sobre o prompt cru); o texto recuperado
// (anonimizado) so como fallback, e o item diz qual foi a fonte. Nunca se mistura em silencio.
export function highRiskForItem(pred, text, HR) {
  if (pred && typeof pred.high_risk_hint === 'boolean') return { high_risk: pred.high_risk_hint, high_risk_source: 'event' };
  if (typeof text === 'string') return { high_risk: HR.regex.test(text), high_risk_source: 'text_fallback' };
  return { high_risk: false, high_risk_source: 'none' };
}
// routed_D: t = abstained ? T2 : tier_D; se HIGH_RISK e rank(t) < rank(tier_regra) → tier_regra (o guardrail de produção).
export function routedD({ tier_D, p_max_D, abstained_D, tier_regra, high_risk }) {
  if (tier_D == null) return { tier: null, abstained: false, guard_fired: false, raw_violation: false };
  const abstained = abstained_D != null ? !!abstained_D : (p_max_D != null && p_max_D < ABSTAIN_BELOW);
  let t = abstained ? 'T2' : tier_D; let guard_fired = false;
  const raw_violation = !!(high_risk && tier_regra && RANK[tier_D] < RANK[tier_regra]);
  if (high_risk && tier_regra && RANK[t] < RANK[tier_regra]) { t = tier_regra; guard_fired = true; }
  return { tier: t, abstained, guard_fired, raw_violation };
}
const acc = (rows, key) => rows.length ? rows.filter((r) => r[key] === r.expected).length / rows.length : null;
const conf = (rows, key) => { const m = {}; for (const r of rows) { const k = `${r.expected}→${r[key] ?? 'null'}`; m[k] = (m[k] || 0) + 1; } return m; };
// items: {id, expected, tier_D, p_max_D, abstained_D, tier_regra|null, high_risk (hint), high_risk_classify|null, ms}
export function gateF2(items, { egress_external_hosts = 0, not_ok_events = 0 } = {}) {
  for (const it of items) if (!TIERS.includes(it.expected)) throw new Error(`${it.id}: rótulo inválido`);
  const rows = items.map((it) => ({ ...it, ...routedD(it), raw: it.tier_D }));
  const n = rows.length;
  // 1 · vs regra — só itens com referência da regra (ausência NÃO conta como erro da regra: round 7 A4)
  const withRule = rows.filter((r) => r.tier_regra != null);
  const mcRule = mcnemar(withRule.map((r) => ({ id: r.id, expected: r.expected, correct: r.tier === r.expected })), Object.fromEntries(withRule.map((r) => [r.id, r.tier_regra])));
  const g1 = { n_compared: withRule.length, n_missing_rule: n - withRule.length, acc_D: acc(withRule, 'tier'), acc_rule: acc(withRule, 'tier_regra'), ci_D: wilson(withRule.filter((r) => r.tier === r.expected).length, withRule.length), ci_rule: wilson(withRule.filter((r) => r.tier_regra === r.expected).length, withRule.length), mcnemar: mcRule, pass: withRule.length > 0 && mcRule.p != null && mcRule.p < ALPHA && acc(withRule, 'tier') > acc(withRule, 'tier_regra') };
  // 2 · vs CADA constante (round 7 A6): todas têm de passar
  const scoredD = rows.map((r) => ({ id: r.id, expected: r.expected, correct: r.tier === r.expected }));
  const consts = {}; for (const c of TIERS) { const m = mcnemar(scoredD, Object.fromEntries(rows.map((r) => [r.id, c]))); const a = rows.filter((r) => r.expected === c).length / n; consts[c] = { acc_const: a, mcnemar: m, pass: m.p != null && m.p < ALPHA && acc(rows, 'tier') > a }; }
  const best = TIERS.reduce((a, b) => (consts[a].acc_const >= consts[b].acc_const ? a : b));
  const g2 = { acc_D: acc(rows, 'tier'), constants: consts, best_constant: best, pass: TIERS.every((c) => consts[c].pass) };
  // 3 · sub-rota T2/T3 → T0 (denominador 0 → n/d → não passa)
  const hi = rows.filter((r) => r.expected === 'T2' || r.expected === 'T3'); const hiRule = hi.filter((r) => r.tier_regra != null);
  const g3 = { n_T2T3: hi.length, D_to_T0: hi.filter((r) => r.tier === 'T0').length, rule_to_T0: hiRule.filter((r) => r.tier_regra === 'T0').length, n_T2T3_with_rule: hiRule.length, rate_D: hi.length ? hi.filter((r) => r.tier === 'T0').length / hi.length : null, rate_rule: hiRule.length ? hiRule.filter((r) => r.tier_regra === 'T0').length / hiRule.length : null, also_T3_to_T0_or_T1: rows.filter((r) => r.expected === 'T3' && RANK[r.tier] <= 1).length, also_T2_to_T1: rows.filter((r) => r.expected === 'T2' && r.tier === 'T1').length };
  g3.pass = g3.rate_D != null && g3.rate_rule != null && g3.rate_D <= g3.rate_rule;
  // 4 · HIGH_RISK — invariante do SISTEMA (guardrail), não competência do decisor (round 7 A2): imprime-se o cru
  const hr = rows.filter((r) => r.high_risk);
  const g4 = { n_high_risk_hint: hr.length, high_risk_source_counts: rows.reduce((m, r) => { const k = r.high_risk_source || 'unspecified'; m[k] = (m[k] || 0) + 1; return m; }, {}), n_high_risk_classify: rows.filter((r) => r.high_risk_classify === true).length, hint_vs_classify_disagree: rows.filter((r) => r.high_risk_classify != null && (!!r.high_risk) !== r.high_risk_classify).length, raw_violations_tier_D_below_rule: hr.filter((r) => r.raw_violation).length, guard_interventions: hr.filter((r) => r.guard_fired).length, violations_after_routing: hr.filter((r) => r.tier_regra && RANK[r.tier] < RANK[r.tier_regra]).length, raw_rate: hr.length ? hr.filter((r) => r.raw_violation).length / hr.length : null };
  g4.pass = g4.violations_after_routing === 0; g4.decisor_knows_high_risk = g4.raw_rate == null ? null : g4.raw_rate <= 0.5;
  // 5 · abstenção → T2 (parte da política composta)
  const abst = rows.filter((r) => r.abstained);
  const g5 = { n_abstained: abst.length, acc_if_kept_argmax: acc(abst, 'raw'), acc_as_T2: acc(abst, 'tier') };
  // 6 · latência · 7 · egress
  const ms = rows.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b); const p50 = ms.length ? (ms.length % 2 ? ms[ms.length >> 1] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2) : null;
  const g6 = { p50_ms: p50, pass: p50 != null && p50 <= P50_MAX_MS, not_ok_events };
  const g7 = { external_hosts: egress_external_hosts, pass: egress_external_hosts === 0 };
  // ablações (round 7 A7) + matriz completa (A8) + ECE só do argmax cru (A18)
  const abl = { raw_argmax: acc(rows, 'raw'), plus_abstention: acc(rows.map((r) => ({ ...r, x: r.abstained ? 'T2' : r.raw })), 'x'), plus_abstention_plus_guard: acc(rows, 'tier') };
  const e = ece(rows.filter((r) => r.p_max_D != null).map((r) => ({ p_max: r.p_max_D, correct: r.raw === r.expected })));
  const all = g1.pass && g2.pass && g3.pass && g4.pass && g6.pass && g7.pass;
  return { n, policy: 'composta: v0 argmax + abstenção(<0,4)→T2 + guardrail HIGH_RISK (produção)', gates: { '1_acc_gt_rule': g1, '2_acc_gt_every_constant': g2, '3_under_routing_T2T3_to_T0': g3, '4_high_risk_invariant': g4, '5_abstention': g5, '6_latency': g6, '7_egress': g7 }, all_pass: all, ablations: abl, confusion_expected_to_routed: conf(rows, 'tier'), confusion_expected_to_rule: conf(withRule, 'tier_regra'), ece_raw_argmax_informative: e.ece, bins_raw: e.bins };
}
// ── pré-visualização nos corpora já rotulados ──
const isMain = /16-gate-f2\.mjs$/.test(process.argv[1] || '');
if (isMain && process.argv.includes('--preview')) {
  if (process.argv.some((a) => /60d/i.test(a))) { console.error('RECUSADO: sem 60d aqui'); process.exit(3); }
  const HR = highRiskHint();
  const CORPORA = [
    ['40', 'D-qwen2.5-coder_14b-corpus-40-unredacted.json.json', 'corpus-40-unredacted.json', path.join(P1, 'results', 'A-nokey.json')],
    ['57', 'D-qwen2.5-coder_14b-corpus-60b.json.json', 'corpus-60b.json', path.join(RES, 'A-60b.json')],
    ['60c', 'D-qwen2.5-coder_14b-corpus-60c.json.json', 'corpus-60c.json', path.join(RES, 'A-60c.json')],
  ];
  const out = { at: new Date().toISOString(), version: 2, note: 'round 7 A1: o preview corre a MESMA gateF2() do 60d (routed = abstenção + guardrail); v1 (scratch) não aplicava o guardrail. HIGH_RISK = HIGH_RISK_HINT de produção (inject_context.js, sha12 ' + HR.source_sha12 + ') sobre o texto; classify risk_level reportado ao lado. Informativo; não é o 60d.', high_risk_hint: { source_sha12: HR.source_sha12, source: HR.source }, by_corpus: {} };
  const fmt = (x, d = 3) => (x == null ? 'n/d' : x.toFixed(d));
  const md = [`# pré-visualização do gate F2 (mp4-3, v2 pós-round 7) nos corpora já rotulados · ${out.at}`, '', `Implementação única \`16-gate-f2.mjs#gateF2\`. Política composta: v0 argmax + abstenção (<0,4) → T2 + guardrail HIGH_RISK (\`HIGH_RISK_HINT\` de produção, sha12 \`${HR.source_sha12}\`). Regra por item = A-*.json run 1 (\`risk_level\` da regra reportado ao lado do hint). **Informativo — não é o 60d.**`, '', '| corpus | n | acc raw / +abst / +guard | vs regra (acc, b/c, p) | vs constantes (best, p do best; todas?) | sub-rota D vs regra | HIGH_RISK hint/classify · cru · guard · pós | p50 | ECE raw | TODOS |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [ck, df, cf, af] of CORPORA) {
    const D = J(path.join(RES, df)); const C = J(path.join(RES, cf)); const text = Object.fromEntries((C.items || C).map((x) => [x.id, x.prompt]));
    const A = {}; for (const r of J(af).rows) if (r.run === 1 || r.run === undefined) A[r.id] = r;
    // nos corpora antigos nao ha evento -> fallback ao texto, declarado por item (high_risk_source: text_fallback)
    const items = D.rows.map((r) => ({ id: r.id, expected: r.expected, tier_D: r.tier, p_max_D: r.p_max, abstained_D: r.abstain, tier_regra: A[r.id]?.tier ?? null, ...highRiskForItem(null, text[r.id] || '', HR), high_risk_classify: A[r.id] ? A[r.id].risk_level === 'high' : null, ms: r.ms }));
    const g = gateF2(items); out.by_corpus[ck] = g; const G = g.gates;
    md.push(`| ${ck} | ${g.n} | ${fmt(g.ablations.raw_argmax)} / ${fmt(g.ablations.plus_abstention)} / ${fmt(g.ablations.plus_abstention_plus_guard)} | ${fmt(G['1_acc_gt_rule'].acc_rule)}, ${G['1_acc_gt_rule'].mcnemar.b}/${G['1_acc_gt_rule'].mcnemar.c}, p=${fmt(G['1_acc_gt_rule'].mcnemar.p, 4)} ${G['1_acc_gt_rule'].pass ? '✅' : '❌'} | ${G['2_acc_gt_every_constant'].best_constant} ${fmt(G['2_acc_gt_every_constant'].constants[G['2_acc_gt_every_constant'].best_constant].acc_const)}, p=${fmt(G['2_acc_gt_every_constant'].constants[G['2_acc_gt_every_constant'].best_constant].mcnemar.p, 4)}; ${G['2_acc_gt_every_constant'].pass ? '✅' : '❌'} | ${G['3_under_routing_T2T3_to_T0'].D_to_T0}/${G['3_under_routing_T2T3_to_T0'].n_T2T3} vs ${G['3_under_routing_T2T3_to_T0'].rule_to_T0}/${G['3_under_routing_T2T3_to_T0'].n_T2T3_with_rule} ${G['3_under_routing_T2T3_to_T0'].pass ? '✅' : '❌'} | ${G['4_high_risk_invariant'].n_high_risk_hint}/${G['4_high_risk_invariant'].n_high_risk_classify} (fonte: ${Object.entries(G['4_high_risk_invariant'].high_risk_source_counts).map(([k, v]) => `${k} ${v}`).join(', ')}) · cru ${G['4_high_risk_invariant'].raw_violations_tier_D_below_rule} · guard ${G['4_high_risk_invariant'].guard_interventions} · pós ${G['4_high_risk_invariant'].violations_after_routing} ${G['4_high_risk_invariant'].pass ? '✅' : '❌'} | ${fmt(G['6_latency'].p50_ms, 0)} ${G['6_latency'].pass ? '✅' : '❌'} | ${fmt(g.ece_raw_argmax_informative)} | ${g.all_pass ? '**PASSA**' : 'não'} |`);
  }
  md.push('', '`+abst` = abstenção→T2; `+guard` = e guardrail HIGH_RISK (a política que conta). «vs constantes» exige superioridade (McNemar unilateral p<0,05) contra CADA uma das 4; imprime-se a mais forte. Sub-rota = expected∈{T2,T3} → routed T0. HIGH_RISK: n pelo hint de produção / n pelo `risk_level` da regra; «cru» = tier_D abaixo da regra; «pós» tem de ser 0 (invariante do sistema).', '');
  fs.writeFileSync(path.join(RES, 'preview-gate-mp4-3.json'), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(RES, 'preview-gate-mp4-3.md'), md.join('\n'));
  console.log(md.join('\n'));
}
