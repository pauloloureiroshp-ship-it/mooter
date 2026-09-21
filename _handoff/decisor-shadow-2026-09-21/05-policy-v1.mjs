#!/usr/bin/env node
// 05-policy-v1.mjs — MP2 passo 2: politica sobre as 4 respostas tipadas do braco D (node puro, zero deps, seed fixa).
//
//   node 05-policy-v1.mjs                       treina (gold-84 + valset, 150 unicos), 5-fold CV, escolhe, aplica aos 40
//   node 05-policy-v1.mjs --apply <D.json> --labels <labels.json> --out <out.json>   aplica os pesos ja gravados a outro corpus
//
// Regra que governa: os 40 (e os 60b) sao TESTE. Nada aqui e ajustado olhando para eles — a seleccao
// acontece e e impressa ANTES de o script ler o ficheiro dos 40. Hiperparametros: protocol.json#mp2.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, ROOT, P1, TIERS, opt, args, wilson, ece, mcnemar } from './lib-common.mjs';
const RES = path.join(HERE, 'results');
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp2;
const SEED = 20260921, K = 5, ITERS = 2000, LR = 0.1, LAMBDAS = [0.01, 0.1, 1];
const T_GRID = Array.from({ length: 95 }, (_, i) => +(0.30 + i * 0.05).toFixed(2));
const EPS = 1e-12;

// ── PRNG deterministico (mulberry32) ────────────────────────────────────────
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ── features (todas ja no JSON do braco D; o modelo NAO se re-corre) ────────
export const FEATURES = ['p_T0', 'p_T1', 'p_T2', 'p_T3', 'E_complexity', 'p_complexity_2', 'p_high_stakes', 'p_needs_repo', 'mass_on_letters_tier'];
function featuresOf(a) {
  const pt = a.tier.probs, pc = a.complexity.probs;
  return [pt.T0, pt.T1, pt.T2, pt.T3, 0 * (pc['0'] || 0) + 1 * (pc['1'] || 0) + 2 * (pc['2'] || 0), pc['2'] || 0, a.high_stakes.probs['true'], a.needs_repo.probs['true'], a.tier.mass_on_letters];
}
function rowsOf(file, labels) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.rows.map((r) => ({ id: r.id, y: TIERS.indexOf(labels ? labels[r.id] : r.expected), x: featuresOf(r.answers), pt: TIERS.map((t) => r.answers.tier.probs[t]), ms: r.ms })).filter((r) => r.y >= 0);
}

// ── numerica ────────────────────────────────────────────────────────────────
const softmax = (z) => { const m = Math.max(...z); const e = z.map((v) => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };
const argmax = (p) => p.reduce((b, v, i) => (v > p[b] ? i : b), 0);
const logloss = (P, Y) => -P.reduce((s, p, i) => s + Math.log(Math.max(p[Y[i]], EPS)), 0) / P.length;
const acc = (P, Y) => P.filter((p, i) => argmax(p) === Y[i]).length / P.length;
const withT = (logits, T) => logits.map((z) => softmax(z.map((v) => v / T)));
function fitT(logits, Y) { let best = { T: 1, ll: Infinity }; for (const T of T_GRID) { const ll = logloss(withT(logits, T), Y); if (ll < best.ll - 1e-12) best = { T, ll }; } return best; }
const logOf = (p) => p.map((v) => Math.log(Math.max(v, EPS)));

function scaler(X) { const d = X[0].length; const mu = Array(d).fill(0), sd = Array(d).fill(0); for (const x of X) x.forEach((v, j) => (mu[j] += v / X.length)); for (const x of X) x.forEach((v, j) => (sd[j] += (v - mu[j]) ** 2 / X.length)); return { mu, sd: sd.map((v) => Math.sqrt(v) || 1) }; }
const zs = (x, s) => [...x.map((v, j) => (v - s.mu[j]) / s.sd[j]), 1]; // + bias
function trainSoftmax(X, Y, lambda) {
  const n = X.length, d = X[0].length, C = 4; const W = Array.from({ length: d }, () => Array(C).fill(0));
  for (let it = 0; it < ITERS; it++) {
    const G = Array.from({ length: d }, () => Array(C).fill(0));
    for (let i = 0; i < n; i++) { const p = softmax(Array.from({ length: C }, (_, c) => X[i].reduce((s, v, j) => s + v * W[j][c], 0))); for (let c = 0; c < C; c++) { const g = (p[c] - (Y[i] === c ? 1 : 0)) / n; for (let j = 0; j < d; j++) G[j][c] += g * X[i][j]; } }
    for (let j = 0; j < d; j++) for (let c = 0; c < C; c++) W[j][c] -= LR * (G[j][c] + (j < d - 1 ? lambda * W[j][c] : 0));
  }
  return W;
}
const logitsW = (Xz, W) => Xz.map((x) => Array.from({ length: 4 }, (_, c) => x.reduce((s, v, j) => s + v * W[j][c], 0)));

// ── folds estratificados ────────────────────────────────────────────────────
function folds(Y, rnd, k = K) { const f = Array(Y.length).fill(0); for (let c = 0; c < 4; c++) { const idx = shuffle(Y.map((y, i) => (y === c ? i : -1)).filter((i) => i >= 0), rnd); idx.forEach((i, r) => (f[i] = r % k)); } return f; }

// v1 num conjunto de treino: scaler + W + T (T em OOF interno). Devolve funcao de predicao.
function fitV1(rows, lambda, rnd) {
  const s = scaler(rows.map((r) => r.x)); const Xz = rows.map((r) => zs(r.x, s)); const Y = rows.map((r) => r.y);
  const W = trainSoftmax(Xz, Y, lambda);
  const inner = folds(Y, rnd); const oofL = Array(rows.length), oofY = Array(rows.length);
  for (let k = 0; k < K; k++) { const tr = rows.map((_, i) => i).filter((i) => inner[i] !== k), te = rows.map((_, i) => i).filter((i) => inner[i] === k); if (!te.length) continue; const Wk = trainSoftmax(tr.map((i) => Xz[i]), tr.map((i) => Y[i]), lambda); const L = logitsW(te.map((i) => Xz[i]), Wk); te.forEach((i, q) => { oofL[i] = L[q]; oofY[i] = Y[i]; }); }
  const T = fitT(oofL.filter(Boolean), oofY.filter((_, i) => oofL[i])).T;
  return { scaler: s, W, T, lambda, predict: (rs) => withT(logitsW(rs.map((r) => zs(r.x, s)), W), T), predictNoT: (rs) => withT(logitsW(rs.map((r) => zs(r.x, s)), W), 1) };
}
function fitV0T(rows) { const T = fitT(rows.map((r) => logOf(r.pt)), rows.map((r) => r.y)).T; return { T, predict: (rs) => withT(rs.map((r) => logOf(r.pt)), T) }; }
const v0 = { predict: (rs) => rs.map((r) => r.pt) };

// ── avaliacao completa de um conjunto de predicoes ──────────────────────────
function evaluate(rows, P, refs = {}) {
  const scored = rows.map((r, i) => ({ id: r.id, expected: TIERS[r.y], tier: TIERS[argmax(P[i])], p_max: Math.max(...P[i]), probs: Object.fromEntries(TIERS.map((t, c) => [t, P[i][c]])), correct: argmax(P[i]) === r.y, abstain: Math.max(...P[i]) < 0.4, ms: r.ms }));
  const k = scored.filter((r) => r.correct).length, n = scored.length;
  const conf = {}; for (const r of scored) { const c = `${r.expected}->${r.tier}`; conf[c] = (conf[c] || 0) + 1; }
  const pred = {}; for (const r of scored) pred[r.tier] = (pred[r.tier] || 0) + 1;
  const mc = {}; for (const [name, ref] of Object.entries(refs)) mc[name] = mcnemar(scored, ref);
  const lat = scored.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b);
  return { k, n, acc: k / n, ci95: wilson(k, n), logloss: logloss(P, rows.map((r) => r.y)), ece: ece(scored), confusion: conf, pred_dist: pred, abstain: scored.filter((r) => r.abstain).length, p50_ms: lat.length ? lat[Math.floor(lat.length / 2)] : null, mcnemar: mc, rows: scored };
}
export function refsFor(ids) {
  const refs = { always_T2: Object.fromEntries(ids.map((id) => [id, 'T2'])) };
  try { const A = JSON.parse(fs.readFileSync(path.join(P1, 'results', 'A-nokey.json'), 'utf8')); refs.rule_A_nokey = {}; for (const r of A.rows) if (r.run === 1) refs.rule_A_nokey[r.id] = r.tier; } catch {}
  try { const B = JSON.parse(fs.readFileSync(path.join(P1, 'results', 'B.json'), 'utf8')); refs.judge_B = {}; for (const r of B.rows) if (r.run === 1) refs.judge_B[r.id] = r.tier; } catch {}
  return refs;
}
const fmt = (x, d = 3) => (x == null ? 'n/d' : x.toFixed(d));

// ═══════════════════════════════════════════════════════════════════════════
if (args.includes('--apply')) {
  // aplica pesos gravados (passo 4). Zero ajuste.
  const Wf = JSON.parse(fs.readFileSync(path.join(RES, 'policy-v1-weights.json'), 'utf8'));
  const L = JSON.parse(fs.readFileSync(opt('--labels'), 'utf8')); const labels = Object.fromEntries((L.labels || L).map((l) => [l.id, l.tier]));
  const rows = rowsOf(opt('--apply'), labels); const ids = rows.map((r) => r.id); const refs = refsFor(ids);
  const ruleFile = opt('--rule', null); if (ruleFile) { const A = JSON.parse(fs.readFileSync(ruleFile, 'utf8')); refs.rule_A_nokey = Object.fromEntries(A.rows.map((r) => [r.id, r.tier])); } else delete refs.rule_A_nokey;
  delete refs.judge_B; // o juiz nao correu neste corpus
  const s = Wf.v1.scaler, W = Wf.v1.W;
  const cands = { v0: v0.predict(rows), 'v0+T': withT(rows.map((r) => logOf(r.pt)), Wf['v0+T'].T), v1: withT(logitsW(rows.map((r) => zs(r.x, s)), W), Wf.v1.T) };
  const out = { at: new Date().toISOString(), source: path.basename(opt('--apply')), labels: opt('--labels'), n: rows.length, winner: Wf.winner, candidates: {} };
  for (const [name, P] of Object.entries(cands)) { const e = evaluate(rows, P, refs); out.candidates[name] = e; console.log(`${name.padEnd(5)} acc=${fmt(e.acc)} [${e.ci95.map((x) => fmt(x, 2)).join(',')}] ll=${fmt(e.logloss)} ECE=${fmt(e.ece.ece)} p50=${fmt(e.p50_ms, 0)} ` + Object.entries(e.mcnemar).map(([k, m]) => `${k}: ${m.b}/${m.c} p=${fmt(m.p, 4)}`).join(' · ')); }
  fs.writeFileSync(opt('--out'), JSON.stringify(out, null, 1)); console.log(`→ ${opt('--out')}`); process.exit(0);
}

// ── TREINO: gold-84 + valset, 150 unicos (4 duplicados byte-iguais declarados no pre-registo) ──
const goldF = path.join(RES, 'D-qwen2.5-coder_14b-gold-84.json'), valF = path.join(RES, 'D-qwen2.5-coder_14b-valset.json');
const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'router', 'gold-labels.json'), 'utf8')); const gItems = Array.isArray(g) ? g : (g.labels || g.items || Object.values(g));
const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'router', 'validation-set.json'), 'utf8'));
const promptOf = {}; for (const x of gItems) promptOf[x.id] = x.prompt; for (const sec of ['canonical', 'adversarial', 'historical']) (v[sec] || []).forEach((x, i) => (promptOf[`${sec}-${String(i + 1).padStart(2, '0')}`] = x.prompt));
const goldPrompts = new Set(gItems.map((x) => x.prompt));
const trainGold = rowsOf(goldF).map((r) => ({ ...r, src: 'gold' }));
const trainVal = rowsOf(valF).map((r) => ({ ...r, src: 'valset' })).filter((r) => !goldPrompts.has(promptOf[r.id]));
const train = [...trainGold, ...trainVal]; const Y = train.map((r) => r.y);
const dist = TIERS.map((t, c) => `${t}:${Y.filter((y) => y === c).length}`).join(' ');
console.log(`TREINO: gold ${trainGold.length} + valset ${trainVal.length} (de 70; ${70 - trainVal.length} duplicados removidos) = ${train.length} · ${dist}`);
if (train.length !== 150) console.warn(`AVISO: esperava 150 no treino, tenho ${train.length}`);

// ── 5-fold CV estratificada, seed fixa ──────────────────────────────────────
const rnd = mulberry32(SEED); const F = folds(Y, rnd);
const cvNames = ['v0', 'v0+T', ...LAMBDAS.map((l) => `v1 λ=${l}`), ...LAMBDAS.map((l) => `v1 λ=${l} (sem T)`)];
const oof = Object.fromEntries(cvNames.map((n) => [n, Array(train.length)]));
const perFold = Object.fromEntries(cvNames.map((n) => [n, []]));
for (let k = 0; k < K; k++) {
  const tr = train.filter((_, i) => F[i] !== k), teIdx = train.map((_, i) => i).filter((i) => F[i] === k), te = teIdx.map((i) => train[i]);
  const put = (name, P) => { teIdx.forEach((i, q) => (oof[name][i] = P[q])); perFold[name].push({ fold: k, n: te.length, logloss: logloss(P, te.map((r) => r.y)), acc: acc(P, te.map((r) => r.y)) }); };
  put('v0', v0.predict(te));
  const m0 = fitV0T(tr); put('v0+T', m0.predict(te)); perFold['v0+T'].at(-1).T = m0.T;
  for (const l of LAMBDAS) { const m = fitV1(tr, l, rnd); put(`v1 λ=${l}`, m.predict(te)); perFold[`v1 λ=${l}`].at(-1).T = m.T; put(`v1 λ=${l} (sem T)`, m.predictNoT(te)); }
}
const cv = cvNames.map((name) => ({ name, logloss: logloss(oof[name], Y), acc: acc(oof[name], Y), ece: ece(train.map((r, i) => ({ p_max: Math.max(...oof[name][i]), correct: argmax(oof[name][i]) === r.y }))).ece, folds: perFold[name] }));
const eligible = cv.filter((c) => !/sem T/.test(c.name)); // os «sem T» sao so diagnostico
const winner = eligible.slice().sort((a, b) => (a.logloss - b.logloss) || (b.acc - a.acc))[0];
console.log('\nCV 5-fold no TREINO (out-of-fold, pooled) — seleccao por log-loss, desempate acc:');
console.log('| candidato | log-loss OOF | acc OOF | ECE OOF | T por fold |'); console.log('|---|---|---|---|---|');
for (const c of cv) console.log(`| ${c.name}${c === winner ? ' **← vencedor**' : ''} | ${fmt(c.logloss)} | ${fmt(c.acc)} | ${fmt(c.ece)} | ${c.folds.map((f) => f.T == null ? '—' : f.T.toFixed(2)).join(' ')} |`);
console.log(`\nVENCEDOR DA CV (fixado ANTES de ler os 40): ${winner.name}`);

// ── modelos finais no treino todo (T do v1 em OOF externo) ──────────────────
const finalV0T = fitV0T(train);
// lambda do v1 final: o do vencedor se for v1; senao o melhor v1 pela mesma regra (so para transparencia — nao e o vencedor)
const bestV1 = cv.filter((c) => /^v1 λ=[\d.]+$/.test(c.name)).sort((a, b) => (a.logloss - b.logloss) || (b.acc - a.acc))[0];
const lambdaStar = Number((/v1/.test(winner.name) ? winner : bestV1).name.match(/λ=([\d.]+)/)[1]);
const sFull = scaler(train.map((r) => r.x)); const XzFull = train.map((r) => zs(r.x, sFull)); const WFull = trainSoftmax(XzFull, Y, lambdaStar);
// T do v1 final: ajustada nas predicoes OOF do fold externo com o mesmo lambda (nunca nos 40)
const oofLogits = []; const oofY = [];
for (let k = 0; k < K; k++) { const trI = train.map((_, i) => i).filter((i) => F[i] !== k), teI = train.map((_, i) => i).filter((i) => F[i] === k); const sk = scaler(trI.map((i) => train[i].x)); const Wk = trainSoftmax(trI.map((i) => zs(train[i].x, sk)), trI.map((i) => Y[i]), lambdaStar); logitsW(teI.map((i) => zs(train[i].x, sk)), Wk).forEach((l, q) => { oofLogits.push(l); oofY.push(Y[teI[q]]); }); }
const TFull = fitT(oofLogits, oofY).T;
const weights = { _schema: 'decisor-shadow/policy-v1-weights', at: new Date().toISOString(), seed: SEED, train: { n: train.length, gold: trainGold.length, valset: trainVal.length, dist, source_files: [path.basename(goldF), path.basename(valF)] }, features: FEATURES, hyper: { iters: ITERS, lr: LR, lambdas: LAMBDAS, T_grid: [T_GRID[0], T_GRID.at(-1), 0.05], k_folds: K }, cv, winner: winner.name, 'v0+T': { T: finalV0T.T }, v1: { lambda: lambdaStar, scaler: sFull, W: WFull, T: TFull, T_fit_on: 'OOF externo 5-fold no treino (150)' } };
fs.writeFileSync(path.join(RES, 'policy-v1-weights.json'), JSON.stringify(weights, null, 1));
console.log(`pesos gravados: policy-v1-weights.json · v0+T T=${finalV0T.T} · v1 λ=${lambdaStar} T=${TFull}`);

// ── SO AGORA: os 40 reais (TESTE). Aplica os 3, sem ajuste. ──────────────────
const c40 = JSON.parse(fs.readFileSync(path.join(P1, 'labels-63.json'), 'utf8')); const labels40 = Object.fromEntries(c40.labels.map((l) => [l.id, l.tier]));
const rows40 = rowsOf(path.join(RES, 'D-qwen2.5-coder_14b-corpus-40-unredacted.json.json'), labels40);
const refs = refsFor(rows40.map((r) => r.id));
const cands = { v0: v0.predict(rows40), 'v0+T': finalV0T.predict(rows40), v1: withT(logitsW(rows40.map((r) => zs(r.x, sFull)), WFull), TFull) };
const out40 = { at: new Date().toISOString(), n: rows40.length, winner: winner.name, winner_key: /v1/.test(winner.name) ? 'v1' : winner.name, candidates: {} };
console.log('\nNOS 40 REAIS (teste; nada foi ajustado aqui):');
for (const [name, P] of Object.entries(cands)) { const e = evaluate(rows40, P, refs); out40.candidates[name] = e; console.log(`${name.padEnd(5)} acc=${fmt(e.acc)} (${e.k}/${e.n}) [${e.ci95.map((x) => fmt(x, 2)).join(',')}] ll=${fmt(e.logloss)} ECE=${fmt(e.ece.ece)} abst=${e.abstain} · ` + Object.entries(e.mcnemar).map(([k, m]) => `vs ${k}: ${m.b}/${m.c} p=${fmt(m.p, 4)}`).join(' · ')); console.log(`      pred ${JSON.stringify(e.pred_dist)} conf ${JSON.stringify(e.confusion)}`); }
const wk = out40.winner_key; const wv = out40.candidates[wk], v0e = out40.candidates.v0;
out40.honesty = wv.acc < v0e.acc ? `O VENCEDOR DA CV (${winner.name}) PERDE PARA v0 NOS 40 (${fmt(wv.acc)} < ${fmt(v0e.acc)}). Imprime-se. NAO se troca de candidato.` : `vencedor da CV (${winner.name}) nos 40: acc ${fmt(wv.acc)} vs v0 ${fmt(v0e.acc)}; ECE ${fmt(wv.ece.ece)} vs ${fmt(v0e.ece.ece)}.`;
console.log('\n' + out40.honesty);
fs.writeFileSync(path.join(RES, 'policy-v1-40.json'), JSON.stringify(out40, null, 1)); console.log('→ results/policy-v1-40.json');
