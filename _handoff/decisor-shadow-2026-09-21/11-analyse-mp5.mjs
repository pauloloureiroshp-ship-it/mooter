#!/usr/bin/env node
// 11-analyse-mp5.mjs — MP5 Parte 1: tabela modelo × corpus (7b · 3b · 14b de referência), SEPARADOS, emparelhados por id.
// Regra pré-registada (protocol.json#mp5.parte_1_mac_7b.decision_rule): serve / não serve / entre, sobre o ponto.
// Não corre modelo nenhum; só junta os ficheiros D-*.json. Saída sem texto de prompt (só contagens e ids agregados).
import fs from 'node:fs'; import path from 'node:path';
import { HERE, TIERS, wilson, ece } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
const mp5 = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp5;
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? 'n/d' : x.toFixed(d));
const CORPORA = [['40', 'corpus-40-unredacted.json.json', 'corpus-40 (P1, reuso)'], ['60b', 'corpus-60b.json.json', 'corpus-60b (MP2)'], ['60c', 'corpus-60c.json.json', 'corpus-60c (MP3, 1/sessão)']];
const MODELS = [['14b', 'qwen2.5-coder_14b', '**qwen2.5-coder:14b (referência, já medido)**'], ['7b', 'qwen2.5-coder_7b', 'qwen2.5-coder:7b (candidato)'], ['3b', 'qwen2.5_3b', 'qwen2.5:3b (candidato, já medido no 40)']];
const p50 = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
// McNemar exacto BILATERAL (binomial), emparelhado por id: b = ref certo & cand errado; c = cand certo & ref errado.
function mcnemar2(cand, ref) {
  let b = 0, c = 0; for (const r of cand) { const q = ref[r.id]; if (!q) continue; if (q.correct && !r.correct) b++; if (!q.correct && r.correct) c++; }
  const n = b + c; if (!n) return { b, c, p: null }; const k = Math.min(b, c); let cum = 0; for (let x = 0; x <= k; x++) { let comb = 1; for (let i = 1; i <= x; i++) comb = comb * (n - x + i) / i; cum += comb / 2 ** n; } return { b, c, p: Math.min(1, 2 * cum) };
}
const table = {}; const lines = ['| Corpus | Modelo | acc (k/n) [IC95] | Δ vs 14b | McNemar 7b/3b vs 14b (b/c, p bilateral) | ECE | p50 ms (4 perg.) | abstém | confusão expected→pred |', '|---|---|---|---|---|---|---|---|---|'];
for (const [ck, cf, clabel] of CORPORA) {
  const rowsBy = {};
  for (const [mk, mf] of MODELS) { const f = `D-${mf}-${cf}`; try { const D = J(f); rowsBy[mk] = { file: f, rows: D.rows, at: D.at }; } catch { rowsBy[mk] = null; } }
  const ref = rowsBy['14b'] ? Object.fromEntries(rowsBy['14b'].rows.map((r) => [r.id, r])) : {};
  for (const [mk, , mlabel] of MODELS) {
    const R = rowsBy[mk]; if (!R) { lines.push(`| ${clabel} | ${mlabel} | n/d | | | | | | |`); continue; }
    const rows = R.rows; const k = rows.filter((r) => r.correct).length, n = rows.length; const acc = k / n; const ci = wilson(k, n); const e = ece(rows);
    const conf = {}; for (const r of rows) conf[`${r.expected}→${r.tier}`] = (conf[`${r.expected}→${r.tier}`] || 0) + 1;
    const refAcc = rowsBy['14b'] ? rowsBy['14b'].rows.filter((r) => r.correct).length / rowsBy['14b'].rows.length : null;
    const m = mk === '14b' ? null : mcnemar2(rows, ref);
    table[ck] = table[ck] || {}; table[ck][mk] = { file: R.file, at: R.at, n, k, acc, ci, ece: e.ece, bins: e.bins, p50_ms: p50(rows.map((r) => r.ms)), abstain: rows.filter((r) => r.abstain).length, delta_vs_14b: refAcc == null || mk === '14b' ? null : acc - refAcc, mcnemar_vs_14b: m, confusion: conf };
    const confS = Object.entries(conf).sort().map(([a, b]) => `${a} ${b}`).join(', ');
    lines.push(`| ${clabel} | ${mlabel} | ${fmt(acc)} (${k}/${n}) [${ci.map((x) => fmt(x, 2)).join('–')}] | ${mk === '14b' ? '—' : (acc - refAcc >= 0 ? '+' : '') + fmt((acc - refAcc) * 100, 1) + ' pp'} | ${m ? `${m.b}/${m.c}, p=${fmt(m.p, 3)}` : '—'} | ${fmt(e.ece)} | ${fmt(table[ck][mk].p50_ms, 0)} | ${table[ck][mk].abstain} | ${confS} |`);
  }
}
// Regra pré-registada, sobre o ponto, para o 7b (e informativa para o 3b)
const verdictFor = (mk) => { const fails = CORPORA.filter(([ck]) => table[ck]?.[mk] && table[ck][mk].delta_vs_14b < -0.05).map(([ck]) => ck); const missing = CORPORA.filter(([ck]) => !table[ck]?.[mk]).length; if (missing) return { verdict: 'n/d', fails }; return { verdict: fails.length === 0 ? 'SERVE' : fails.length >= 2 ? 'NÃO SERVE' : 'ENTRE', fails }; };
const v7 = verdictFor('7b'), v3 = verdictFor('3b');
const md = `# decisor-shadow — análise MP5 · Parte 1 (7b no lugar do 14b?) · ${new Date().toISOString()}

Pré-registo: \`protocol.json#mp5\` (\`_registered_at\` ${mp5._registered_at}; conta o %cI do commit que o introduz). Regra fixada antes de ver um número: **serve** se acc_7b ≥ acc_14b − 0,05 em CADA corpus; **não serve** se falha em ≥ 2; **entre** se falha em exactamente 1. Sobre o ponto, não sobre o IC (declarado no pré-registo). Corpora **separados** — nunca somados. Referência = D v0 no 14b, ficheiros já existentes, **não re-corridos**. Candidatos: 7b (uma corrida por corpus), 3b (o 40 é o do MP1; 60b e 60c corridos agora, uma vez cada). Mesmo harness (\`02-arm-D-logit.mjs\`, 4 perguntas, rubrica sha \`f95958dd…\`, v0 argmax), só muda \`--model\`. Egress: net-tap no cliente, todos os hosts \`127.0.0.1:11434\`.

${lines.join('\n')}

## Regra pré-registada

- **qwen2.5-coder:7b: ${v7.verdict}** — abaixo de 14b − 5 pp em ${v7.fails.length} corpus/corpora (${v7.fails.join(', ') || 'nenhum'}).
- qwen2.5:3b (informativo, não era a pergunta): **${v3.verdict}** — falha em ${v3.fails.length} (${v3.fails.join(', ') || 'nenhum'}).

## O que isto implica para o Mac (M4, 16 GB)

- Latência no Mac: **n/d** — nada foi medido num Mac nesta sessão. Os p50 acima são da RTX 4090 com o modelo quente (o 7b responde às 4 perguntas em ~100 ms; o 3b em ~85 ms; o 14b em ~140–165 ms).
- \`ESTUDO_LLMS_LOCAIS_MAC_MINI\`: **não existe no vault** (procurado por nome e por «mac mini / 16 GB» em \`~/paulo-vault\`; o que há é a decisão de 2026-08-15 a registar um job \`gpt-oss:20b\` no Mac mini, sem memória declarada). Se o 14b (9,1 GB em VRAM/RAM unificada, contexto 4096) cabe ao lado de outro modelo em 16 GB fica **n/d** aqui — não se inventa.
- O que se pode dizer com o que se mediu: o candidato que caberia folgado (7b, 4,7 GB) **perde 13–15 pp** para o 14b em dois dos três corpora, e o 3b perde mais e chumba a ECE por larga margem (0,41 / 0,55). Se o Mac só puder correr o 7b, o decisor que lá corre **não é o que o MP3 mediu** — os números do 60c (0,622) não se transferem.

⚠️ Nada aqui é decisão: o adversário (codex, round 5) pergunta se o 7b foi avaliado nos mesmos corpora sem ajuste.
`;
fs.writeFileSync(path.join(RES, '11-analysis-mp5.md'), md);
fs.writeFileSync(path.join(RES, '11-analysis-mp5.json'), JSON.stringify({ at: new Date().toISOString(), rule: mp5.parte_1_mac_7b.decision_rule, table, verdict_7b: v7, verdict_3b: v3 }, null, 1));
console.log(md);
