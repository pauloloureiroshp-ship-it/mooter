#!/usr/bin/env node
// 06-analyse-mp2.mjs — MP2 passo 5: tabela final nos 40 + 60b (=57) + juntos, gates do pre-registo (protocol.json#mp2).
// Linhas: regra · «T2 sempre» · «T3 sempre» (extra) · juiz (so 40) · D v0 · D v0+T · D v1. Nada aqui corre modelo nenhum.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, P1, TIERS, ece, wilson, mcnemar } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const proto = J(path.join(HERE, 'protocol.json')); const mp2 = proto.mp2; const G = mp2.gate_final_on_100;
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? 'n/d' : x.toFixed(d));

// ── rotulos ─────────────────────────────────────────────────────────────────
const L40 = Object.fromEntries(J(path.join(P1, 'labels-63.json')).labels.filter((l) => l.id.startsWith('n')).map((l) => [l.id, l.tier]));
const lab60 = J(path.join(RES, 'labels-60b.json')); const L60 = Object.fromEntries(lab60.labels.map((l) => [l.id, l.tier]));
const corpus60 = J(path.join(RES, 'corpus-60b.json'));
const LALL = { ...L40, ...L60 }; const ids40 = Object.keys(L40), ids60 = Object.keys(L60), idsAll = [...ids40, ...ids60];

// ── predicoes por item: {id -> {tier, p_max?, ms?}} ─────────────────────────
const preds = {};
preds.regra = {}; for (const r of J(path.join(P1, 'results', 'A-nokey.json')).rows) if (r.run === 1 && L40[r.id]) preds.regra[r.id] = { tier: r.tier, ms: r.ms };
for (const r of J(path.join(RES, 'A-60b.json')).rows) preds.regra[r.id] = { tier: r.tier, ms: r.ms };
preds.always_T2 = Object.fromEntries(idsAll.map((id) => [id, { tier: 'T2' }]));
preds.always_T3 = Object.fromEntries(idsAll.map((id) => [id, { tier: 'T3' }]));
preds.juiz = {}; for (const r of J(path.join(P1, 'results', 'B.json')).rows) if (r.run === 1 && L40[r.id]) preds.juiz[r.id] = { tier: r.tier, ms: r.wall_ms };
const D40 = J(path.join(RES, 'D-qwen2.5-coder_14b-corpus-40-unredacted.json.json')); const D60 = J(path.join(RES, 'D-qwen2.5-coder_14b-corpus-60b.json.json'));
const msD = {}; for (const r of [...D40.rows, ...D60.rows]) msD[r.id] = r.ms;
const P40 = J(path.join(RES, 'policy-v1-40.json')), P60 = J(path.join(RES, 'policy-v1-60b.json'));
for (const [name, key] of [['D_v0', 'v0'], ['D_v0T', 'v0+T'], ['D_v1', 'v1']]) { preds[name] = {}; for (const src of [P40, P60]) for (const r of src.candidates[key].rows) preds[name][r.id] = { tier: r.tier, p_max: r.p_max, ms: msD[r.id] }; }
const WINNER = P40.winner_key === 'v1' ? 'D_v1' : P40.winner_key === 'v0+T' ? 'D_v0T' : 'D_v0';

// ── metricas ────────────────────────────────────────────────────────────────
function score(name, ids) { const rows = ids.filter((id) => preds[name][id]).map((id) => ({ id, expected: LALL[id], tier: preds[name][id].tier, p_max: preds[name][id].p_max, ms: preds[name][id].ms, correct: preds[name][id].tier === LALL[id] })); const k = rows.filter((r) => r.correct).length; return { rows, k, n: rows.length, acc: rows.length ? k / rows.length : null, ci: wilson(k, rows.length) }; }
const p50 = (rows) => { const l = rows.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b); return l.length ? l[Math.floor(l.length / 2)] : null; };
const refT2 = Object.fromEntries(idsAll.map((id) => [id, 'T2'])), refRule = Object.fromEntries(Object.entries(preds.regra).map(([id, p]) => [id, p.tier]));
const arms = [['regra', 'regra classify.js (nokey)'], ['always_T2', '«T2 sempre» (referência pré-registada)'], ['always_T3', '«T3 sempre» (extra: maioritária nos 57)'], ['juiz', 'juiz B qwen2.5-coder:14b (só 40)'], ['D_v0', 'D v0 argmax'], ['D_v0T', 'D v0+T (T=1,55)'], ['D_v1', `D v1 λ=${J(path.join(RES, 'policy-v1-weights.json')).v1.lambda} (vencedor CV)`]];
const table = []; const out = { at: new Date().toISOString(), n40: ids40.length, n60b: ids60.length, n_pooled: idsAll.length, winner: WINNER, arms: {} };
for (const [name, label] of arms) {
  const s40 = score(name, ids40), s60 = score(name, ids60), sAll = score(name, idsAll);
  const hasP = sAll.rows.some((r) => Number.isFinite(r.p_max));
  const e100 = hasP ? ece(sAll.rows) : null, e40 = hasP ? ece(s40.rows) : null, e60 = hasP ? ece(s60.rows) : null;
  const mT2 = name === 'always_T2' ? null : mcnemar(sAll.rows, refT2), mR = name === 'regra' ? null : mcnemar(sAll.rows, refRule);
  const conf = {}; for (const r of sAll.rows) conf[`${r.expected}->${r.tier}`] = (conf[`${r.expected}->${r.tier}`] || 0) + 1;
  const pred = {}; for (const r of sAll.rows) pred[r.tier] = (pred[r.tier] || 0) + 1;
  out.arms[name] = { label, acc40: s40.acc, acc60b: s60.acc, acc100: sAll.acc, ci100: sAll.ci, k100: sAll.k, n100: sAll.n, ece40: e40?.ece ?? null, ece60b: e60?.ece ?? null, ece100: e100?.ece ?? null, bins100: e100?.bins ?? null, p50_ms: p50(sAll.rows), mcnemar_vs_T2_100: mT2, mcnemar_vs_regra_100: mR, confusion100: conf, pred_dist100: pred };
  table.push(`| ${label}${name === WINNER ? ' **← conta para o gate**' : ''} | ${fmt(s40.acc)} | ${s60.n ? fmt(s60.acc) : 'n/d'} | ${s60.n ? `**${fmt(sAll.acc)}** (${sAll.k}/${sAll.n}) [${sAll.ci.map((x) => fmt(x, 2)).join('–')}]` : `n/d (só 40: ${fmt(s40.acc)})`} | ${e100 ? fmt(e100.ece) : 'n/d'} | ${name === 'regra' ? fmt(p50(sAll.rows), 3) + ' in-proc' : name.startsWith('D_') ? fmt(p50(sAll.rows), 0) : name === 'juiz' ? fmt(p50(sAll.rows), 0) + ' (40)' : '—'} | ${mT2 ? `${mT2.b}/${mT2.c}, p=${fmt(mT2.p, 4)}` : '—'} | ${mR ? `${mR.b}/${mR.c}, p=${fmt(mR.p, 4)}` : '—'} |`);
}
// ── egress (nettap do braco D nos 60b) ──────────────────────────────────────
let egress = { file: 'results/nettap-D-60b.jsonl', found: false };
try { const lines = fs.readFileSync(path.join(RES, 'nettap-D-60b.jsonl'), 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)); const conns = lines.filter((l) => l.phase === 'open'); const hosts = {}; for (const c of conns) hosts[`${c.host}:${c.port}`] = (hosts[`${c.host}:${c.port}`] || 0) + 1; const ext = Object.keys(hosts).filter((h) => !/^(127\.|::1|localhost|0\.0\.0\.0)/.test(h)); const bytes = lines.filter((l) => l.phase === 'close' || l.phase === 'exit').reduce((a, l) => ({ out: a.out + (l.bytes_out || 0), in: a.in + (l.bytes_in || 0) }), { out: 0, in: 0 }); egress = { ...egress, found: true, tap_loaded: lines.some((l) => l.event === 'tap-loaded'), connections: conns.length, hosts, external_hosts: ext, bytes }; } catch {}
// ── sensibilidade: 1 prompt por sessao (estrito, como pre-registado) ────────
const firstPerSess = {}; for (const it of corpus60.items) if (!firstPerSess[it._session_sha8]) firstPerSess[it._session_sha8] = it.id;
const idsStrict = [...ids40, ...Object.values(firstPerSess)]; const strict = {};
for (const name of ['regra', 'always_T2', 'D_v0', 'D_v0T', 'D_v1']) { const s = score(name, idsStrict); strict[name] = { acc: s.acc, k: s.k, n: s.n, mcnemar_vs_T2: name === 'always_T2' ? null : mcnemar(s.rows, refT2) }; }
// ── gates (no vencedor da CV, nos 97) ───────────────────────────────────────
const W = out.arms[WINNER]; const gates = { acc_gt_T2_p: { value: W.mcnemar_vs_T2_100?.p, pass: W.mcnemar_vs_T2_100?.p != null && W.mcnemar_vs_T2_100.p < 0.05 && W.acc100 > out.arms.always_T2.acc100 }, ece: { value: W.ece100, pass: W.ece100 != null && W.ece100 <= G.ece_max }, p50: { value: W.p50_ms, pass: W.p50_ms != null && W.p50_ms <= G.p50_ms_max_warm }, egress: { value: egress.found ? egress.external_hosts : 'n/d', pass: egress.found && egress.external_hosts.length === 0 && egress.connections > 0 } };
const allPass = Object.values(gates).every((g) => g.pass);
const belowT2 = W.acc100 != null && W.acc100 < out.arms.always_T2.acc100;
const verdict = allPass ? 'GATE VERDE (100: >T2 p<0,05 ∧ ECE≤0,10 ∧ p50≤250 ∧ egress 0) → F2 PODE ABRIR' : belowT2 ? '❄️ ABAIXO DE T2 SEMPRE → parar' : 'ENTRE → F6 (Laya fine-tune nos 214 rotulados) OU mais rótulos';
out.strict_one_per_session = { n: idsStrict.length, arms: strict }; out.egress = egress; out.gates = gates; out.verdict = verdict;
const best = Object.entries(out.arms).filter(([k]) => k.startsWith('D_')).sort((a, b) => b[1].acc100 - a[1].acc100)[0];
const md = `# decisor-shadow — análise MP2 · ${out.at}

Pré-registo: \`protocol.json#mp2\` (commit \`14c205c5\`). Candidato que conta para o gate: **${WINNER}** (vencedor da CV no treino, fixado antes dos 40). n = 40 (P1) + **${ids60.length}** (60b real; o pool deu 57 com tecto 10/sessão) = **${idsAll.length}**, não 100.

| Braço | acc40 | acc60b (n=${ids60.length}) | **acc${idsAll.length}** [IC95] | ECE${idsAll.length} | p50 ms | McNemar vs «T2 sempre» nos ${idsAll.length} (b/c, p) | McNemar vs regra nos ${idsAll.length} |
|---|---|---|---|---|---|---|---|
${table.join('\n')}

Rótulos: 40 do P1 (Codex, cego, 2026-09-09) + ${ids60.length} do 60b (Codex, cego, ${lab60._labeled_at}); distribuição 60b **${Object.entries(lab60._distribution).map(([k, v]) => `${k} ${v}`).join(' · ')}**. «T2 sempre» nos ${idsAll.length}: ${out.arms.always_T2.k100}/${idsAll.length} = ${fmt(out.arms.always_T2.acc100)}; «T3 sempre»: ${out.arms.always_T3.k100}/${idsAll.length} = ${fmt(out.arms.always_T3.acc100)}.

## Gates do pré-registo, avaliados no vencedor da CV (${WINNER}) nos ${idsAll.length}

| Gate | Alvo | Valor | |
|---|---|---|---|
| acc > «T2 sempre», McNemar unilateral | p < 0,05 | acc ${fmt(W.acc100)} vs ${fmt(out.arms.always_T2.acc100)}; b/c ${W.mcnemar_vs_T2_100?.b}/${W.mcnemar_vs_T2_100?.c}, **p=${fmt(W.mcnemar_vs_T2_100?.p, 4)}** | ${gates.acc_gt_T2_p.pass ? '✅' : '❌'} |
| ECE (10 bins, n=${idsAll.length}) | ≤ 0,10 | **${fmt(W.ece100)}** | ${gates.ece.pass ? '✅' : '❌'} |
| p50 quente (4 perguntas) | ≤ 250 ms | **${fmt(W.p50_ms, 0)} ms** | ${gates.p50.pass ? '✅' : '❌'} |
| egress (nettap no braço D, 60b) | 0 hosts externos | ${egress.found ? `${egress.connections} ligações · hosts ${JSON.stringify(egress.hosts)} · externos **${egress.external_hosts.length}** · bytes out ${egress.bytes.out} / in ${egress.bytes.in}` : 'n/d (sem tap)'} | ${gates.egress.pass ? '✅' : '❌'} |

Melhor braço D por acc${idsAll.length} (transparência, **não** é o que conta): ${best[1].label} = ${fmt(best[1].acc100)}${best[0] !== WINNER ? ' — **diferente do vencedor da CV; não se troca**' : ''}.

## Sensibilidade — 1 prompt por sessão (a regra pré-registada, estrita): 40 + ${Object.keys(firstPerSess).length} = ${idsStrict.length}

| Braço | acc | McNemar vs «T2 sempre» |
|---|---|---|
${Object.entries(strict).map(([k, v]) => `| ${out.arms[k].label} | ${fmt(v.acc)} (${v.k}/${v.n}) | ${v.mcnemar_vs_T2 ? `${v.mcnemar_vs_T2.b}/${v.mcnemar_vs_T2.c}, p=${fmt(v.mcnemar_vs_T2.p, 4)}` : '—'} |`).join('\n')}

## Confusão e previsões nos ${idsAll.length} (vencedor ${WINNER})

previsões ${JSON.stringify(W.pred_dist100)} · confusão ${JSON.stringify(W.confusion100)}
bins ECE: ${JSON.stringify(W.bins100?.map((b) => [b.bin, b.n, +b.acc.toFixed(2), +b.conf.toFixed(2)]))}

⚠️ Nada aqui é decisão: o adversário (codex, round 2) ataca esta tabela antes de qualquer PR.

VEREDICTO (06-analyse): ${verdict}
`;
fs.writeFileSync(path.join(RES, '06-analysis-mp2.md'), md); fs.writeFileSync(path.join(RES, '06-analysis-mp2.json'), JSON.stringify(out, null, 1));
console.log(md);
