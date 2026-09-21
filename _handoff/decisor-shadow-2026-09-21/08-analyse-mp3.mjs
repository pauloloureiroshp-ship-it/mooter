#!/usr/bin/env node
// 08-analyse-mp3.mjs — MP3 A4: tabela SO 60c (regra · «T2 sempre» · «T3 sempre» · v0 · v0+T · v0-guard), gates no v0,
// sensibilidade so-unanimes e sem-despachados. Nao corre modelo nenhum; so junta ficheiros.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, TIERS, ece, wilson, mcnemar } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
const mp3 = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp3; const G = mp3.frente_A.gate_on_60c_only;
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? 'n/d' : x.toFixed(d));
const corpus = J('corpus-60c.json'), lab = J('labels-60c.json'), A = J('A-60c.json'), D = J('D-qwen2.5-coder_14b-corpus-60c.json.json'), P = J('policy-60c.json');
const labels = Object.fromEntries(lab.labels.map((l) => [l.id, l.tier])); const ids = corpus.items.map((i) => i.id);
const unanimous = new Set(lab.labels.filter((l) => l.rule === 'unanime').map((l) => l.id)); const dispatched = new Set(corpus.items.filter((i) => i._dispatched).map((i) => i.id));
const msD = Object.fromEntries(D.rows.map((r) => [r.id, r.ms]));
const preds = {
  regra: Object.fromEntries(A.rows.map((r) => [r.id, { tier: r.tier, ms: r.ms }])),
  always_T2: Object.fromEntries(ids.map((id) => [id, { tier: 'T2' }])), always_T3: Object.fromEntries(ids.map((id) => [id, { tier: 'T3' }])),
  v0: Object.fromEntries(P.candidates.v0.rows.map((r) => [r.id, { tier: r.tier, p_max: r.p_max, ms: msD[r.id] }])),
  'v0+T': Object.fromEntries(P.candidates['v0+T'].rows.map((r) => [r.id, { tier: r.tier, p_max: r.p_max, ms: msD[r.id] }])),
  'v0-guard': Object.fromEntries(P.candidates['v0-guard'].rows.map((r) => [r.id, { tier: r.tier, p_max: r.p_max, ms: msD[r.id] }])),
};
const labelOf = { regra: 'regra classify.js (nokey)', always_T2: '«T2 sempre» (referência pré-registada)', always_T3: '«T3 sempre» (constante mais forte nos 37)', v0: '**D v0 argmax — primário, conta para o gate**', 'v0+T': 'D v0+T (T=1,55 herdado)', 'v0-guard': 'D v0-guard (limiar 0,5)' };
const score = (name, subset) => { const rows = subset.filter((id) => preds[name][id]).map((id) => ({ id, expected: labels[id], tier: preds[name][id].tier, p_max: preds[name][id].p_max, ms: preds[name][id].ms, correct: preds[name][id].tier === labels[id] })); const k = rows.filter((r) => r.correct).length; return { rows, k, n: rows.length, acc: rows.length ? k / rows.length : null, ci: wilson(k, rows.length) }; };
const p50 = (rows) => { const l = rows.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b); return l.length ? l[Math.floor(l.length / 2)] : null; };
const refs = (subset) => ({ T2: Object.fromEntries(subset.map((id) => [id, 'T2'])), T3: Object.fromEntries(subset.map((id) => [id, 'T3'])), regra: Object.fromEntries(subset.map((id) => [id, preds.regra[id].tier])) });
function block(subset, title) {
  const R = refs(subset); const lines = [`| Braço | acc (n=${subset.length}) [IC95] | ECE | p50 ms | McNemar vs «T2 sempre» | vs «T3 sempre» | vs regra |`, '|---|---|---|---|---|---|---|']; const out = {};
  for (const name of Object.keys(preds)) {
    const s = score(name, subset); const hasP = s.rows.some((r) => Number.isFinite(r.p_max)); const e = hasP ? ece(s.rows) : null;
    const m = { T2: name === 'always_T2' ? null : mcnemar(s.rows, R.T2), T3: name === 'always_T3' ? null : mcnemar(s.rows, R.T3), regra: name === 'regra' ? null : mcnemar(s.rows, R.regra) };
    const conf = {}, pred = {}; for (const r of s.rows) { conf[`${r.expected}->${r.tier}`] = (conf[`${r.expected}->${r.tier}`] || 0) + 1; pred[r.tier] = (pred[r.tier] || 0) + 1; }
    out[name] = { acc: s.acc, k: s.k, n: s.n, ci: s.ci, ece: e?.ece ?? null, bins: e?.bins ?? null, p50_ms: p50(s.rows), mcnemar: m, confusion: conf, pred_dist: pred };
    const mm = (x) => (x ? `${x.b}/${x.c}, p=${fmt(x.p, 4)}` : '—');
    lines.push(`| ${labelOf[name]} | ${fmt(s.acc)} (${s.k}/${s.n}) [${s.ci.map((x) => fmt(x, 2)).join('–')}] | ${e ? fmt(e.ece) : 'n/d'} | ${name === 'regra' ? fmt(p50(s.rows), 2) + ' in-proc' : name.startsWith('v0') ? fmt(p50(s.rows), 0) : '—'} | ${mm(m.T2)} | ${mm(m.T3)} | ${mm(m.regra)} |`);
  }
  return { md: `### ${title}\n\n${lines.join('\n')}\n`, out };
}
const full = block(ids, `Corpus 60c completo — n=${ids.length}, ${new Set(corpus.items.map((i) => i._session_sha8)).size} sessões (1/sessão estrito: pares independentes por construção)`);
const unan = block(ids.filter((id) => unanimous.has(id)), `Sensibilidade — só itens UNÂNIMES entre os 3 rotuladores (n=${unanimous.size}; o tecto do rótulo)`);
const nodisp = block(ids.filter((id) => !dispatched.has(id)), `Sensibilidade — sem os ${dispatched.size} prompts despachados por runner (n=${ids.length - dispatched.size})`);
// egress
let egress = { found: false }; try { const lines = fs.readFileSync(path.join(RES, 'nettap-D-60c.jsonl'), 'utf8').split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)); const conns = lines.filter((l) => l.phase === 'open'); const hosts = {}; for (const c of conns) hosts[`${c.host}:${c.port}`] = (hosts[`${c.host}:${c.port}`] || 0) + 1; const ext = Object.keys(hosts).filter((h) => !/^(127\.|::1|localhost|0\.0\.0\.0)/.test(h)); const bytes = lines.filter((l) => l.phase === 'close' || l.phase === 'exit').reduce((a, l) => ({ out: a.out + (l.bytes_out || 0), in: a.in + (l.bytes_in || 0) }), { out: 0, in: 0 }); egress = { found: true, tap_loaded: lines.some((l) => l.event === 'tap-loaded'), connections: conns.length, hosts, external_hosts: ext, bytes }; } catch {}
const W = full.out.v0; const T2 = full.out.always_T2;
const gates = { acc_gt_T2: { pass: W.acc > T2.acc && W.mcnemar.T2.p < 0.05, value: `acc ${fmt(W.acc)} vs ${fmt(T2.acc)}; b/c ${W.mcnemar.T2.b}/${W.mcnemar.T2.c}; p=${fmt(W.mcnemar.T2.p, 4)}` }, ece: { pass: W.ece != null && W.ece <= G.ece_max, value: fmt(W.ece) }, p50: { pass: W.p50_ms <= G.p50_ms_max_warm, value: `${fmt(W.p50_ms, 0)} ms` }, egress: { pass: egress.found && egress.external_hosts.length === 0 && egress.connections > 0, value: egress.found ? `${egress.connections} ligações, hosts ${JSON.stringify(egress.hosts)}, externos ${egress.external_hosts.length}, bytes out ${egress.bytes.out} / in ${egress.bytes.in}` : 'n/d' } };
const allPass = Object.values(gates).every((g) => g.pass); const belowT2 = W.acc < T2.acc;
const verdict = allPass ? 'GATE VERDE (60c) → F2 PODE ABRIR (arbiter trocável, default haiku)' : belowT2 ? '❄️ ABAIXO DE T2 SEMPRE → parar' : 'ENTRE → shadow acumula; re-testar com 60d';
const md = `# decisor-shadow — análise MP3 (Frente A) · ${new Date().toISOString()}

Pré-registo: \`protocol.json#mp3\` (commit \`32e65ac6\`), AMENDMENT mp3-1 (\`3ce8d61b\`, n=37 antes de rotular). Candidato que conta: **v0 argmax** (fixo antes de qualquer dado). Rótulo = maioria de 3 (Codex · Sonnet · Kimi k3), κ Fleiss ${fmt(lab._kappa_fleiss)}, unânimes ${lab._unanimous}/${lab._n}. Distribuição dos rótulos: ${TIERS.map((t) => `${t} ${lab._distribution[t] || 0}`).join(' · ')}.

${full.md}
${unan.md}
${nodisp.md}
## Gates do pré-registo, no v0, só 60c

| Gate | Alvo | Valor | |
|---|---|---|---|
| acc > «T2 sempre», McNemar unilateral | p < 0,05 | ${gates.acc_gt_T2.value} | ${gates.acc_gt_T2.pass ? '✅' : '❌'} |
| ECE 10 bins (n=${ids.length}) | ≤ 0,10 | **${gates.ece.value}** | ${gates.ece.pass ? '✅' : '❌'} |
| p50 quente, 4 perguntas | ≤ 250 ms | **${gates.p50.value}** | ${gates.p50.pass ? '✅' : '❌'} |
| egress (net-tap no cliente D) | 0 hosts externos | ${gates.egress.value} | ${gates.egress.pass ? '✅' : '❌'} |

v0 nos 37: previsões ${JSON.stringify(W.pred_dist)} · confusão ${JSON.stringify(W.confusion)} · bins ${JSON.stringify(W.bins?.map((b) => [b.bin, b.n, +b.acc.toFixed(2), +b.conf.toFixed(2)]))}
v0-guard disparou **${P.candidates['v0-guard'].guard_fired}×** em 37 (idêntico ao v0 quando 0). v0+T: ECE ${fmt(full.out['v0+T'].ece)} — a temperatura herdada do MP2 **${full.out['v0+T'].ece > W.ece ? 'piora' : 'melhora'}** a calibração neste corpus.

⚠️ Nada aqui é decisão: o adversário (codex, round 3) ataca esta tabela + o diff da Frente B.

VEREDICTO (08-analyse): ${verdict}
`;
fs.writeFileSync(path.join(RES, '08-analysis-mp3.md'), md); fs.writeFileSync(path.join(RES, '08-analysis-mp3.json'), JSON.stringify({ at: new Date().toISOString(), n: ids.length, full: full.out, unanimous: unan.out, no_dispatched: nodisp.out, egress, gates, verdict }, null, 1));
console.log(md);
