// 16-gate-f2.test.mjs — mordidas do gate de F2 (round 7 A1/A4/A5/A6/A7): routedD, mcnemar com valores conhecidos,
// referência da regra ausente NÃO conta como erro, denominador zero → n/d, constantes todas.
import test from 'node:test'; import assert from 'node:assert/strict';
import { routedD, gateF2, highRiskHint, ABSTAIN_BELOW } from './16-gate-f2.mjs';
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
  const g = gateF2(items).gates['1_acc_gt_rule'];
  assert.equal(g.n_compared, 10); assert.equal(g.n_missing_rule, 10); assert.equal(g.acc_rule, 1); assert.equal(g.pass, false);
});
test('gateF2: denominador T2/T3 = 0 → sub-rota n/d → não passa; constantes: todas têm de passar', () => {
  const items = mk(12, (i) => ({ expected: 'T1', tier_D: 'T1', tier_regra: 'T0' }));
  const g = gateF2(items).gates;
  assert.equal(g['3_under_routing_T2T3_to_T0'].rate_D, null); assert.equal(g['3_under_routing_T2T3_to_T0'].pass, false);
  assert.equal(g['2_acc_gt_every_constant'].constants.T1.pass, false); // D = «T1 sempre» → não supera essa constante
  assert.equal(g['2_acc_gt_every_constant'].pass, false);
});
test('gateF2: HIGH_RISK é invariante do sistema — pós-routing 0 mesmo com o decisor cru a despromover', () => {
  const items = mk(10, (i) => ({ expected: 'T3', tier_D: 'T0', tier_regra: 'T3', high_risk: true }));
  const g4 = gateF2(items).gates['4_high_risk_invariant'];
  assert.equal(g4.raw_violations_tier_D_below_rule, 10); assert.equal(g4.guard_interventions, 10); assert.equal(g4.violations_after_routing, 0); assert.equal(g4.pass, true); assert.equal(g4.decisor_knows_high_risk, false);
});
test('highRiskHint: lê o predicado de produção e autentica a linha', () => {
  const h = highRiskHint(); assert.equal(h.regex.test('faz deploy disto'), true); assert.equal(h.regex.test('muda a cor do botão'), false); assert.match(h.source_sha12, /^[0-9a-f]{12}$/);
});
