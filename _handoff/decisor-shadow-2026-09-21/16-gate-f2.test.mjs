// 16-gate-f2.test.mjs — mordidas do gate de F2 (round 7 A1/A4/A5/A6/A7): routedD, mcnemar com valores conhecidos,
// referência da regra ausente NÃO conta como erro, denominador zero → n/d, constantes todas.
import test from 'node:test'; import assert from 'node:assert/strict';
import { routedD, gateF2, highRiskHint, ABSTAIN_BELOW, load60dArtifacts } from './16-gate-f2.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
import { HERE } from './lib-common.mjs';
import { mcnemar } from './lib-common.mjs';

test('mcnemar unilateral exacto: valores conhecidos', () => {
  const sc = (pairs) => pairs.map(([dOK, rOK], i) => ({ id: String(i), expected: 'T1', correct: dOK, _r: rOK }));
  const ref = (rows) => Object.fromEntries(rows.map((r) => [r.id, r._r ? 'T1' : 'T0']));
  let rows = sc(Array.from({ length: 10 }, () => [true, false])); // b=10, c=0 → p = 2^-10
  assert.deepEqual(mcnemar(rows, ref(rows)), { b: 10, c: 0, p: 1 / 1024 });
  rows = sc([[true, false], [true, false], [true, false], [false, true], [false, true], [false, true]]); // b=3,c=3 → P(X>=3|6) = 42/64
  assert.equal(mcnemar(rows, ref(rows)).p, 42 / 64);
  rows = sc([[true, true], [false, false]]); // sem discordantes → p null
  assert.equal(mcnemar(rows, ref(rows)).p, null);
});
test('routedD: abstenção → T2; guardrail sobe até à regra em HIGH_RISK; nunca desce; sem HIGH_RISK não toca', () => {
  assert.equal(routedD({ tier_D: 'T0', p_max_D: 0.3, tier_regra: 'T1', high_risk: false }).tier, 'T2');
  assert.equal(routedD({ tier_D: 'T0', p_max_D: 0.9, tier_regra: 'T3', high_risk: true }).tier, 'T3');
  const g = routedD({ tier_D: 'T0', p_max_D: 0.9, tier_regra: 'T3', high_risk: true }); assert.equal(g.guard_fired, true); assert.equal(g.raw_violation, true);
  assert.equal(routedD({ tier_D: 'T3', p_max_D: 0.9, tier_regra: 'T1', high_risk: true }).tier, 'T3'); // não desce
  assert.equal(routedD({ tier_D: 'T0', p_max_D: 0.9, tier_regra: 'T3', high_risk: false }).tier, 'T0'); // sem HR, sem guard
  assert.equal(routedD({ tier_D: 'T0', p_max_D: 0.3, tier_regra: 'T3', high_risk: true }).tier, 'T3'); // abstenção e depois guard
  assert.equal(routedD({ tier_D: 'T1', p_max_D: ABSTAIN_BELOW, tier_regra: null, high_risk: false }).abstained, false); // limiar estrito
  assert.equal(routedD({ tier_D: null, p_max_D: null, tier_regra: 'T1', high_risk: false }).tier, null);
});
const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, ms: 100, p_max_D: 0.9, abstained_D: false, high_risk: false, high_risk_classify: null, ...f(i) }));
test('gateF2: referência da regra ausente fica FORA da comparação (não vira erro da regra)', () => {
  const items = mk(20, (i) => ({ expected: 'T1', tier_D: 'T1', tier_regra: i < 10 ? 'T1' : null }));
  const g = gateF2(items, { preview: "sintetico" }).gates['1_acc_gt_rule'];
  assert.equal(g.n_compared, 10); assert.equal(g.n_missing_rule, 10); assert.equal(g.acc_rule, 1); assert.equal(g.pass, false);
});
test('gateF2: denominador T2/T3 = 0 → sub-rota n/d → não passa; constantes: todas têm de passar', () => {
  const items = mk(12, (i) => ({ expected: 'T1', tier_D: 'T1', tier_regra: 'T0' }));
  const g = gateF2(items, { preview: "sintetico" }).gates;
  assert.equal(g['3_under_routing_T2T3_to_T0'].rate_D, null); assert.equal(g['3_under_routing_T2T3_to_T0'].pass, false);
  assert.equal(g['2_acc_gt_every_constant'].constants.T1.pass, false); // D = «T1 sempre» → não supera essa constante
  assert.equal(g['2_acc_gt_every_constant'].pass, false);
});
test('gateF2: HIGH_RISK é invariante do sistema — pós-routing 0 mesmo com o decisor cru a despromover', () => {
  const items = mk(10, (i) => ({ expected: 'T3', tier_D: 'T0', tier_regra: 'T3', high_risk: true }));
  const g4 = gateF2(items, { preview: "sintetico" }).gates['4_high_risk_invariant'];
  assert.equal(g4.raw_violations_tier_D_below_rule, 10); assert.equal(g4.guard_interventions, 10); assert.equal(g4.violations_after_routing, 0); assert.equal(g4.pass, true); assert.equal(g4.decisor_knows_high_risk, false);
});
test('highRiskHint: lê o predicado de produção e autentica a linha', () => {
  const h = highRiskHint(); assert.equal(h.regex.test('faz deploy disto'), true); assert.equal(h.regex.test('muda a cor do botão'), false); assert.match(h.source_sha12, /^[0-9a-f]{12}$/);
});const fz = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { for (const v of Object.values(o)) fz(v); Object.freeze(o); } return o; };
test('MP9 · o gate só corre o 60d sobre os artefactos congelados, dentro da janela A10, completos e ligados por sha (round 8/8b)', () => {
  const T = (s) => new Date(Date.parse('2026-09-22T00:00:00Z') + s * 1000).toISOString();
  const N = 60; const id = (i) => 'd' + String(i + 1).padStart(2, '0');
  const baseCorpus = { _schema: 'decisor-shadow/corpus-60d', _since_utc: '2026-09-21T14:25:20.000Z', _since_confirmatory: '2026-09-21T14:25:20Z', _n_target: N, _target_reached: true, _partial: false, items: Array.from({ length: N }, (_, i) => ({ id: id(i), _t_utc: T(i) })) };
  const labels = { labels: Array.from({ length: N }, (_, i) => ({ id: id(i), tier: i % 2 ? 'T3' : 'T2' })) };
  const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const write = (corpus, { lab = labels, tamper, dupRow = false } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-60d-')); const c = JSON.stringify(corpus), l = JSON.stringify({ _corpus_sha256: h(c), ...lab });
    const rows = corpus.items.map((it, i) => ({ id: it.id, tier: i % 2 ? 'T3' : 'T2', p_max: 0.9, tier_regra: 'T0', ms: 100, abstain: false, high_risk_hint: i === 5 ? true : null }));
    if (dupRow) rows.push(rows[0]);
    const p = { _corpus_sha256: h(c), _labels_sha256: h(l), rows, ...(tamper || {}) };
    fs.writeFileSync(path.join(dir, 'corpus-60d.json'), c); fs.writeFileSync(path.join(dir, 'labels-60d.json'), l); fs.writeFileSync(path.join(dir, 'D-shadow-corpus-60d.json'), JSON.stringify(p));
    return dir;
  };
  const itemsFor = (A) => A.predictions.rows.map((r) => ({ id: r.id, expected: A.labels.labels.find((x) => x.id === r.id).tier, tier_D: r.tier, p_max_D: r.p_max, abstained_D: r.abstain, tier_regra: r.tier_regra, ...(typeof r.high_risk_hint === 'boolean' ? { high_risk: r.high_risk_hint, high_risk_source: 'event' } : { high_risk: false, high_risk_source: 'text_fallback' }), high_risk_classify: null, ms: r.ms }));
  const A = load60dArtifacts(write(baseCorpus)); const items = itemsFor(A);
  const g = gateF2(items, { artifacts: A }); assert.equal(g.n, N); assert.equal(g.window, 'confirmatory:2026-09-21T14:25:20.000Z');
  const refuse = (corpus, re, msg, o) => { const B = load60dArtifacts(write(corpus, o)); assert.throws(() => gateF2(itemsFor(B), { artifacts: B }), re, msg); };
  refuse({ ...baseCorpus, _since_utc: '2026-09-21T12:00:00.000Z' }, /RECUSADO.*anterior/, 'since antigo');
  refuse({ ...baseCorpus, _since_utc: '2026-09-21T14:25:19.999Z' }, /RECUSADO/, '1 ms antes');
  refuse({ ...baseCorpus, _since_confirmatory: undefined }, /RECUSADO.*_since_confirmatory/, 'corpus de um 10-corpus-60d anterior ao MP9');
  refuse({ ...baseCorpus, items: baseCorpus.items.map((it, i) => (i === 3 ? { ...it, _t_utc: '2026-09-21T14:25:19.000Z' } : it)) }, /RECUSADO.*d04/, 'A1: item diagnóstico escondido');
  refuse({ ...baseCorpus, items: baseCorpus.items.map(({ id: x }) => ({ id: x })) }, /RECUSADO.*_t_utc/, 'itens sem hora');
  // 8b A7: parcial / abaixo de n_target não corre (12 itens «perfeitos» passariam todos os gates)
  refuse({ ...baseCorpus, items: baseCorpus.items.slice(0, 12) }, /RECUSADO.*n_target/, '12 itens', { lab: { labels: labels.labels.slice(0, 12) } });
  refuse({ ...baseCorpus, _partial: true }, /RECUSADO.*parcial/);
  refuse({ ...baseCorpus, _target_reached: false }, /RECUSADO.*n_target/);
  // 8b A1: previsões de OUTRO corpus/rótulos com os mesmos ids d01…d60 — o sha não bate
  refuse(baseCorpus, /RECUSADO.*sha256/, 'previsões ligadas a outro corpus', { tamper: { _corpus_sha256: 'f'.repeat(64) } });
  refuse(baseCorpus, /RECUSADO.*sha256/, 'previsões ligadas a outros rótulos', { tamper: { _labels_sha256: 'f'.repeat(64) } });
  // itens que não correspondem, valor a valor, ao rótulo e à previsão do evento
  assert.throws(() => gateF2(items.map((it, i) => (i === 7 ? { ...it, tier_D: 'T0' } : it)), { artifacts: A }), /RECUSADO.*d08/);
  assert.throws(() => gateF2(items.map((it, i) => (i === 8 ? { ...it, expected: 'T0' } : it)), { artifacts: A }), /RECUSADO.*d09/);
  assert.throws(() => gateF2(items.slice(1), { artifacts: A }), /RECUSADO.*não são os do corpus/, 'item em falta');
  assert.throws(() => gateF2(items.map((it, i) => ({ ...it, id: 'n' + i })), { artifacts: A }), /RECUSADO.*não são os do corpus/, 'ids de outro corpus');
  // round 8c: campos consumidos adulterados (regra, latência, abstenção, HIGH_RISK do evento) — recusa
  for (const [k, v, who] of [['tier_regra', 'T3', 'd01'], ['ms', 900, 'd02'], ['abstained_D', true, 'd03'], ['high_risk', false, 'd06'], ['high_risk_source', 'event', 'd07']]) { const j = Number(who.slice(1)) - 1; assert.throws(() => gateF2(items.map((it, i) => (i === j ? { ...it, [k]: v } : it)), { artifacts: A }), new RegExp('RECUSADO.*' + who), k); }
  // round 8c: hashes ausentes num artifacts montado à mão; duplicados escondidos por Map; rótulos de outro corpus
  refuse(baseCorpus, /RECUSADO.*sha256 válidos/, 'hashes ausentes nas previsões', { tamper: { _corpus_sha256: undefined, _labels_sha256: undefined } });
  refuse(baseCorpus, /RECUSADO.*sha256 válidos/, 'rótulos sem _corpus_sha256', { lab: { ...labels, _corpus_sha256: undefined } });
  refuse(baseCorpus, /RECUSADO.*repetidos/, 'rótulo duplicado', { lab: { labels: [...labels.labels, { id: 'd01', tier: 'T0' }] } });
  refuse(baseCorpus, /RECUSADO.*repetidos/, 'previsão duplicada', { dupRow: true });
  refuse(baseCorpus, /RECUSADO.*rótulos não estão ligados/, 'rótulos de outro corpus', { lab: { ...labels, _corpus_sha256: 'e'.repeat(64) } });
  // round 8d/8e: os artefactos carregados são imutáveis e só o objecto do loader serve (nem cópia, nem clone recongelado)
  assert.throws(() => { A.labels.labels[0].tier = 'T0'; }, TypeError, 'mutar um rótulo depois de carregar atira');
  assert.equal(A.labels.labels[0].tier, 'T2');
  assert.throws(() => gateF2(items, { artifacts: { ...A } }), /RECUSADO.*não carregados/);
  assert.throws(() => gateF2(items, { artifacts: Object.freeze({ ...A, labels: JSON.parse(JSON.stringify(A.labels)) }) }), /RECUSADO.*não carregados/, 'um filho mutável também');
  const B = structuredClone(A); B.labels.labels[0].tier = 'T3'; fz(B);
  assert.throws(() => gateF2(items.map((it, i) => (i === 0 ? { ...it, expected: 'T3' } : it)), { artifacts: B }), /RECUSADO.*não carregados/, 'round 8e: clone adulterado e recongelado');
  // A2: sem declaração recusa, seja qual for o id
  assert.throws(() => gateF2(items.map((it, i) => ({ ...it, id: 'x' + i }))), /RECUSADO.*exige/);
  assert.throws(() => gateF2(items), /RECUSADO.*exige/);
  assert.throws(() => gateF2(items, { artifacts: A, preview: '40' }), /RECUSADO.*escolhe um/);
  assert.equal(gateF2(items, { preview: 'sintetico' }).window, 'preview:sintetico', 'o preview declara-se; nunca é confirmatório');
  // CLI --check-corpus: exit 3 com since antigo / item diagnóstico / inexistente; 0 com a janela
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-60d-cli-')); const w = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p; };
  const run = (p) => { try { execFileSync(process.execPath, [path.join(HERE, '16-gate-f2.mjs'), '--check-corpus', p], { stdio: 'ignore' }); return 0; } catch (e) { return e.status; } };
  assert.equal(run(w('old.json', { ...baseCorpus, _since_utc: '2026-09-21T12:00:00.000Z' })), 3);
  assert.equal(run(w('diag.json', { ...baseCorpus, items: baseCorpus.items.map((it, i) => (i === 0 ? { ...it, _t_utc: '2026-09-21T14:00:00.000Z' } : it)) })), 3);
  assert.equal(run(w('ok.json', baseCorpus)), 0); assert.equal(run(path.join(dir, 'nao-existe.json')), 3);
});
