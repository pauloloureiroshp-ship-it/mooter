#!/usr/bin/env node
// 12-analyse-mp6.mjs — MP6 passo 5: tabela final (14b v0 · 14b TTA · 27b · 30b · 14b TTA+selectivo@70 %) por corpus,
// veredicto por hipótese pela regra pré-registada (protocol.json#mp6), e a ordenação do candidato (b) do mp4 pela
// regra do step7 — fixada em 40+57 (exploração), só REPORTADA no 60c (validação). Não corre modelo; não ajusta nada.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, ece, wilson } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
const mp6 = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp6;
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? 'n/d' : x.toFixed(d));
const p50 = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const CORPORA = [['40', 'corpus-40-unredacted.json.json'], ['57', 'corpus-60b.json.json'], ['60c', 'corpus-60c.json.json']];
const ROWS = [['14b v0', 'D-qwen2.5-coder_14b-'], ['14b TTA', 'D-qwen2.5-coder_14b-tta4-'], ['27b v0', 'D-qwen3.6_27b-'], ['30b v0', 'D-qwen3_30b-']];
const sel = J('11-selective.json'); const cal = J('13-calibration-154.json');
const stats = {};
for (const [label, prefix] of ROWS) {
  stats[label] = {};
  for (const [ck, cf] of CORPORA) {
    const f = path.join(RES, prefix + cf); if (!fs.existsSync(f)) { stats[label][ck] = null; continue; }
    const D = J(prefix + cf); const rows = D.rows; const n = rows.length; const k = rows.filter((r) => r.correct).length;
    // round 6 A10: rótulos completos e ids únicos, ou nada se calcula
    const seen = new Set(); for (const r of rows) { if (!['T0', 'T1', 'T2', 'T3'].includes(r.expected)) throw new Error(`${prefix + cf}: ${r.id} sem rótulo válido`); if (seen.has(r.id)) throw new Error(`${prefix + cf}: id duplicado ${r.id}`); seen.add(r.id); }
    const answered = rows.filter((r) => r.p_max != null);
    stats[label][ck] = { n, k, acc: k / n, ci: wilson(k, n), acc_answered: answered.length ? answered.filter((r) => r.correct).length / answered.length : null, no_letter: n - answered.length, ece: ece(rows).ece, bins: ece(rows).bins, p50_ms: p50(rows.map((r) => r.ms)), p50_tier_ms: p50(rows.map((r) => r.ms_tier_only)), at: D.at, file: path.basename(f) };
  }
}
const S = (l, c) => stats[l]?.[c];
// ── veredictos por hipótese (regra pré-registada: exploração = 40 e 57) ──
const v0 = { '40': S('14b v0', '40'), '57': S('14b v0', '57') }, tta = { '40': S('14b TTA', '40'), '57': S('14b TTA', '57') };
const accOK = (a, b) => a.acc >= b.acc - 0.05 - 1e-9;
const C1 = (() => {
  const eceDown = ['40', '57'].map((c) => tta[c].ece < v0[c].ece), accHold = ['40', '57'].map((c) => accOK(tta[c], v0[c]));
  if (eceDown.every(Boolean) && accHold.every(Boolean)) return 'CONFIRMADA';
  if (eceDown.every((x) => !x) || accHold.some((x) => !x)) return 'REFUTADA';
  return 'ENTRE';
})();
// round 6 A9: C2 implementada por inteiro como pré-registada (confirmed_if / refuted_if / ENTRE), por modelo
const C2 = (() => {
  const out = {};
  for (const m of ['27b v0', '30b v0']) {
    const st = ['40', '57'].map((c) => S(m, c)); if (st.some((x) => !x)) { out[m] = 'n/d'; continue; }
    const nl = st.map((x) => x.no_letter / x.n);
    if (nl.some((x) => x > 0.10)) { out[m] = `REFUTADA (no-letter ${nl.map((x) => (x * 100).toFixed(0) + ' %').join(' / ')})`; continue; }
    const accBelow = ['40', '57'].some((c, i) => st[i].acc < v0[c].acc - 0.05 - 1e-9);
    if (accBelow) { out[m] = 'REFUTADA (acc < v0 − 5 pp)'; continue; }
    const confirmed = ['40', '57'].every((c, i) => nl[i] <= 0.10 && st[i].acc >= v0[c].acc && st[i].ece != null && st[i].ece < v0[c].ece);
    out[m] = confirmed ? 'CONFIRMADA' : 'ENTRE';
  }
  return out;
})();
const C3 = sel.C3_verdict_exploration.verdict;
// ── ordenação do step7 (candidato (b) do mp4) — fixada em 40+57 ──
const cands = [];
cands.push({ name: 'iso', desc: 'v0 + isotónica por classe (ajuste nos 154 canónicos, out-of-sample no 40/57)', ece40: cal.variants.v0.eval['40'].ece_after_b, ece57: cal.variants.v0.eval['57'].ece_after_b, acc40: v0['40'].acc, acc57: v0['57'].acc, ece60c: cal.variants.v0.eval['60c'].ece_after_b, acc60c: S('14b v0', '60c').acc, pieces: 1 });
cands.push({ name: 'tta', desc: 'TTA (média das 4 rotações), sem calibração', ece40: tta['40'].ece, ece57: tta['57'].ece, acc40: tta['40'].acc, acc57: tta['57'].acc, ece60c: S('14b TTA', '60c').ece, acc60c: S('14b TTA', '60c').acc, pieces: 2 });
cands.push({ name: 'tta_iso', desc: 'TTA + isotónica por classe (ajuste nas saídas TTA dos 154 canónicos)', ece40: cal.variants.tta.eval['40'].ece_after_b, ece57: cal.variants.tta.eval['57'].ece_after_b, acc40: tta['40'].acc, acc57: tta['57'].acc, ece60c: cal.variants.tta.eval['60c'].ece_after_b, acc60c: S('14b TTA', '60c').acc, pieces: 3 });
// round 6 A9: elegibilidade do 27b POR CORPUS (letra ≥ 90 % em cada um; p50 ≤ 250 ms em cada um), sem agregar
const m27 = S('27b v0', '40'), m27b = S('27b v0', '57');
const letter27 = m27 && m27b ? [m27, m27b].map((x) => 1 - x.no_letter / x.n) : null;
const excl27 = !letter27 ? 'n/d' : letter27.some((x) => x < 0.9) ? `fora da lista: letra em ${letter27.map((x) => (x * 100).toFixed(0) + ' %').join(' / ')} (< 90 %)` : [m27, m27b].some((x) => x.p50_ms > 250) ? `fora da lista: p50 ${[m27, m27b].map((x) => fmt(x.p50_ms, 0)).join(' / ')} ms (> 250)` : null;
cands.push({ name: '27b', desc: 'qwen3.6:27b v0', ece40: m27?.ece ?? null, ece57: m27b?.ece ?? null, acc40: m27?.acc ?? null, acc57: m27b?.acc ?? null, ece60c: S('27b v0', '60c')?.ece ?? null, acc60c: S('27b v0', '60c')?.acc ?? null, pieces: 4, excluded: excl27 });
for (const c of cands) {
  c.eligible = !c.excluded && c.ece40 != null && c.ece57 != null && c.acc40 >= v0['40'].acc - 0.05 - 1e-9 && c.acc57 >= v0['57'].acc - 0.05 - 1e-9;
  c.score = c.ece40 != null && c.ece57 != null ? (c.ece40 + c.ece57) / 2 : null;
  c.acc_edge = c.eligible && (Math.abs(c.acc40 - (v0['40'].acc - 0.05)) < 1e-6 || Math.abs(c.acc57 - (v0['57'].acc - 0.05)) < 1e-6);
}
const eligible = cands.filter((c) => c.eligible).sort((a, b) => (a.score - b.score) || (a.pieces - b.pieces));
// round 6 A8: grupo de empate = TODOS os elegíveis a < 0,005 do mínimo; ganha o de menos peças entre eles
let winner = null;
if (eligible.length) { const min = eligible[0].score; const tie = eligible.filter((c) => c.score - min < 0.005); winner = tie.sort((a, b) => a.pieces - b.pieces)[0]; }
const v0score = (v0['40'].ece + v0['57'].ece) / 2;
// ── tabela final ──
const at = new Date().toISOString();
const lines = [`# decisor-shadow — análise MP6 · calibração sem aprender · ${at}`, '',
  `Pré-registo: \`protocol.json#mp6\` (\`_registered_at\` ${mp6._registered_at}; conta o %cI do commit \`defb9c26\`). Regra: exploração em **40 e 57** (separados), validação **só reportada** no 60c, zero ajuste nos três. Referência = D v0 no 14b (ficheiros já existentes, não re-corridos). Sonda antes do pré-registo: os dois qwen3 pensam antes da letra e \`think:false\` é ignorado no \`/v1\` (Ollama 0.34.2) — previsão declarada: C2 refutada por no-letter.`, '',
  '| linha | acc 40 | acc 57 | **acc 60c** | ECE 40 | ECE 57 | **ECE 60c** | p50 ms (4 perg.) | cobertura | veredicto |', '|---|---|---|---|---|---|---|---|---|---|'];
const cell = (s, what) => !s ? 'n/d' : what === 'acc' ? `${fmt(s.acc)} (${s.k}/${s.n})${s.no_letter ? ` · ${s.no_letter} no-letter` : ''}` : what === 'ece' ? fmt(s.ece) : fmt(s.p50_ms, 0);
const verd = { '14b v0': 'referência', '14b TTA': `C1 ${C1}`, '27b v0': `C2 ${C2['27b v0']}`, '30b v0': `C2 ${C2['30b v0']}` };
for (const [label] of ROWS) lines.push(`| ${label} | ${cell(S(label, '40'), 'acc')} | ${cell(S(label, '57'), 'acc')} | ${cell(S(label, '60c'), 'acc')} | ${cell(S(label, '40'), 'ece')} | ${cell(S(label, '57'), 'ece')} | ${cell(S(label, '60c'), 'ece')} | ${['40', '57', '60c'].map((c) => cell(S(label, c), 'p50')).join(' / ')} | 100 % | ${verd[label]} |`);
const s70 = (ck) => sel.by_corpus[ck]?.['14b TTA']?.curve.find((c) => c.coverage === 0.7);
const s70v = (ck) => sel.by_corpus[ck]?.['14b v0']?.curve.find((c) => c.coverage === 0.7);
const selCell = (c) => c ? `${fmt(c.acc_covered)} cob. · ${fmt(c.acc_combined_rule)} comb.` : 'n/d';
lines.push(`| 14b TTA + selectivo@70 % | ${selCell(s70('40'))} | ${selCell(s70('57'))} | ${selCell(s70('60c'))} | ${fmt(s70('40')?.ece_covered)} cob. | ${fmt(s70('57')?.ece_covered)} cob. | ${fmt(s70('60c')?.ece_covered)} cob. | como 14b TTA | 70 % (resto → regra) | (d) C1+C3: ${C1 === 'REFUTADA' || C3 === 'REFUTADA' ? 'REFUTADA' : 'ENTRE'} |`);
lines.push(`| 14b v0 + selectivo@70 % (informativo) | ${selCell(s70v('40'))} | ${selCell(s70v('57'))} | ${selCell(s70v('60c'))} | ${fmt(s70v('40')?.ece_covered)} cob. | ${fmt(s70v('57')?.ece_covered)} cob. | ${fmt(s70v('60c')?.ece_covered)} cob. | como 14b v0 | 70 % (resto → regra) | C3 ${C3} |`);
lines.push('', '`cob.` = acc/ECE nos 70 % mais confiantes; `comb.` = acc combinada (D nos cobertos + regra nos não cobertos). Curvas completas (50–100 %) em `11-selective.md`.', '');
lines.push('## Veredictos por hipótese (regra pré-registada, decidida em 40 e 57)', '',
  `- **C1 · TTA por permutação de letras: ${C1}.** ECE 40 ${fmt(v0['40'].ece)} → ${fmt(tta['40'].ece)}; ECE 57 ${fmt(v0['57'].ece)} → ${fmt(tta['57'].ece)} (sobe nos dois). Acc 40 ${fmt(v0['40'].acc)} → ${fmt(tta['40'].acc)} (${tta['40'].acc >= v0['40'].acc - 0.05 - 1e-9 ? 'dentro' : 'fora'} dos 5 pp${Math.abs(tta['40'].acc - (v0['40'].acc - 0.05)) < 1e-6 ? ', exactamente na fronteira' : ''}); acc 57 ${fmt(v0['57'].acc)} → ${fmt(tta['57'].acc)}. No 60c (só reportado): acc ${fmt(S('14b v0', '60c').acc)} → ${fmt(S('14b TTA', '60c').acc)}, ECE ${fmt(S('14b v0', '60c').ece)} → ${fmt(S('14b TTA', '60c').ece)}. A média das 4 rotações não corrige onde a sobre-confiança está: os bins do meio (0,5–0,7) continuam a acertar 29–63 % com confiança 0,55–0,76 (bins abaixo), e o bin 0,9 já estava bem calibrado no v0 (82–91 %). Esta intervenção não corrigiu a calibração; não prova que o viés de letra não exista (4 rotações cíclicas não são as 24 permutações, e o viés pode coexistir com outros efeitos — round 6 A11).`,
  `- **C2 · modelo maior: REFUTADA por no-letter, nos dois** — ${['27b v0', '30b v0'].map((m) => `${m}: ${['40', '57', '60c'].map((c) => `${S(m, c).no_letter}/${S(m, c).n}`).join(' · ')} itens sem letra (100 %, nas 4 perguntas; 1.º token ${m === '27b v0' ? '«The»/«Here»' : '«We»'}), p50 ${['40', '57', '60c'].map((c) => fmt(S(m, c).p50_ms, 0)).join('/')} ms`).join('; ')}. Nenhuma previsão existe, logo acc = 0 por construção e ECE n/d. O 27b, mesmo que respondesse, está acima do tecto (p50 ≈ 1 000 ms nas 4 perguntas; 250–270 ms só no tier); o 30b (MoE a3b) seria rápido (p50 ≈ 150 ms). Não se correu variante que force a letra (pré-registado: seria outro harness).`,
  `- **C3 · risco selectivo: ${C3}.** Em nenhum dos dois corpora de exploração existe cobertura ≥ 60 % com acc ≥ 0,75 e ECE ≤ 0,10, nem para o v0 nem para a TTA. A confiança do 14b separa pouco: no 57, os 50 % mais confiantes do v0 acertam ${fmt(sel.by_corpus['57']['14b v0'].curve[0].acc_covered)} (todos: ${fmt(v0['57'].acc)}); no 40, ${fmt(sel.by_corpus['40']['14b v0'].curve[0].acc_covered)} (todos: ${fmt(v0['40'].acc)}). A ECE nos cobertos é MAIOR que a global (os mais confiantes são os sobre-confiantes). O gate alternativo fica pré-registado para o 60d na mesma — avalia-se lá, e a previsão honesta é que chumba.`,
  `- **(d) C1+C3:** ${C1 === 'REFUTADA' || C3 === 'REFUTADA' ? 'REFUTADA (C1 e C3 refutadas separadamente)' : 'ENTRE'}.`, '');
lines.push('## Ordenação para o candidato (b) do mp4 (regra `mp6.step7_candidate_rule`, fixada em 40+57)', '',
  '| candidato | ECE 40 | ECE 57 | score (média) | acc 40 / 57 | elegível | **60c (só reportado)** ECE · acc |', '|---|---|---|---|---|---|---|');
for (const c of cands) lines.push(`| \`${c.name}\` — ${c.desc} | ${fmt(c.ece40)} | ${fmt(c.ece57)} | ${fmt(c.score)} | ${fmt(c.acc40)} / ${fmt(c.acc57)} | ${c.excluded ? c.excluded : c.eligible ? `sim${c.acc_edge ? ' (acc na fronteira dos 5 pp)' : ''}` : 'não (acc < v0 − 5 pp)'} | ${fmt(c.ece60c)} · ${fmt(c.acc60c)} |`);
lines.push(`| *(a) v0 sem calibração — referência, não é candidato do step7* | ${fmt(v0['40'].ece)} | ${fmt(v0['57'].ece)} | ${fmt(v0score)} | ${fmt(v0['40'].acc)} / ${fmt(v0['57'].acc)} | — | ${fmt(S('14b v0', '60c').ece)} · ${fmt(S('14b v0', '60c').acc)} |`);
lines.push(`| *(b)-251 do mp4 (isotónica ajustada nos 251, que incluem o 40 e o 57) — IN-SAMPLE, não comparável* | ${fmt(cal.reference_b_251['40'].ece_after_b_251)} | ${fmt(cal.reference_b_251['57'].ece_after_b_251)} | — | idem v0 | — | ${fmt(cal.reference_b_251['60c'].ece_after_b_251)} · ${fmt(S('14b v0', '60c').acc)} |`);
lines.push('', `**Vencedor pela regra: \`${winner ? winner.name : 'nenhum'}\`** (score ${winner ? fmt(winner.score) : 'n/d'}${winner ? `; o seguinte é \`${eligible[1]?.name ?? '—'}\` a ${fmt(eligible[1]?.score)}` : ''}). **Leitura honesta, dita antes do 60d:** nenhum candidato do step7 bate o **v0 sem calibração** na exploração (score ${fmt(v0score)}) — a TTA sobe a ECE, a isotónica ajustada em prompts canónicos (154) **piora muito** nos reais (0,110 → 0,311 no 40; 0,124 → 0,320 no 57: os canónicos são mais fáceis para o modelo, a curva aprendida lá é sobre-confiante cá), e a (b)-251 do mp4 só parecia servir porque era in-sample no 40 e no 57 (e mesmo assim dá 0,161 no 40, pior que o v0). A emenda mp4-1 aplica a regra tal como foi pré-registada; a decisão de retirar a calibração do mp4 (fazer (b) = (a)) não está na regra e é do dono.`, '');
lines.push('## Latência', '', `- 14b TTA: p50 ${['40', '57', '60c'].map((c) => fmt(S('14b TTA', c).p50_ms, 0)).join(' / ')} ms nas 7 chamadas (tier 4× = ${['40', '57', '60c'].map((c) => fmt(S('14b TTA', c).p50_tier_ms, 0)).join(' / ')} ms) — vs v0 ${['40', '57', '60c'].map((c) => fmt(S('14b v0', c).p50_ms, 0)).join(' / ')} ms. Acima do tecto de 250 ms no 40 (${fmt(S('14b TTA', '40').p50_ms, 0)}); abaixo por pouco no 57 e no 60c.`, `- 27b: p50 ${['40', '57', '60c'].map((c) => fmt(S('27b v0', c).p50_ms, 0)).join(' / ')} ms (VRAM 16 GB) · 30b: ${['40', '57', '60c'].map((c) => fmt(S('30b v0', c).p50_ms, 0)).join(' / ')} ms (VRAM 18 GB). Um de cada vez; o 14b foi parado antes e re-aquecido (keep_alive −1) depois.`, '');
lines.push('## Bins da TTA (sub-confiança)', '');
for (const [ck] of CORPORA) lines.push(`- ${ck} · v0: ${S('14b v0', ck).bins.map((b) => `${b.bin}:${b.n}/${(b.acc * 100).toFixed(0)}%/${b.conf.toFixed(2)}`).join(' · ')}`, `- ${ck} · TTA: ${S('14b TTA', ck).bins.map((b) => `${b.bin}:${b.n}/${(b.acc * 100).toFixed(0)}%/${b.conf.toFixed(2)}`).join(' · ')}`);
lines.push('', '⚠️ Nada aqui é decisão: o adversário (codex, round 6) pergunta se a média foi feita no espaço certo, se houve ajuste no 60c e se a curva selectiva usa o mesmo `p_max` do gate.', '');
fs.writeFileSync(path.join(RES, '12-analysis-mp6.md'), lines.join('\n'));
fs.writeFileSync(path.join(RES, '12-analysis-mp6.json'), JSON.stringify({ at, stats, verdicts: { C1, C2, C3, d: C1 === 'REFUTADA' || C3 === 'REFUTADA' ? 'REFUTADA' : 'ENTRE' }, step7: { candidates: cands, winner: winner?.name ?? null, v0_reference_score: v0score } }, null, 1));
console.log(lines.join('\n'));
