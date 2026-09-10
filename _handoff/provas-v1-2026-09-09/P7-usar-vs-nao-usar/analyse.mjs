#!/usr/bin/env node
// analyse.mjs — P7: le o ledger do R-24 (copiado para results/ledger.jsonl) e re-deriva, de forma independente do
// controlador, X, p (binomial exacta unilateral, cauda superior, p0 = 0,5) e o veredicto pelo limiar pre-registado.
// O numero que conta e o do controlador (--analisar, no log); este ficheiro so confirma ou desmente a partir do bruto.
//   node analyse.mjs            -> results/analysis.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { binomTailUpper, wilson } = await import('file:///' + path.join(HERE, '..', 'lib', 'stats.mjs').split('\\').join('/'));
const prereg = JSON.parse(fs.readFileSync(path.join(HERE, 'r24-prereg.json'), 'utf8'));
const LEDGER = path.join(HERE, 'results', 'ledger.jsonl');
if (!fs.existsSync(LEDGER)) {
  const alt = fs.readdirSync(path.join(HERE, 'results')).filter((f) => f.startsWith('ledger-') && f.endsWith('.jsonl'));
  console.error(`falta ${LEDGER}`);
  console.error('Este leitor nao escolhe corrida nenhuma por ti: copia para esse nome o ledger da corrida que queres re-derivar.');
  console.error(alt.length ? `Corridas preservadas nesta pasta: ${alt.join(', ')}` : 'Nao ha nenhum ledger preservado nesta pasta.');
  process.exit(2);
}
const ledger = fs.readFileSync(LEDGER, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.tipo === 'braco');
const ratio = prereg.metrica_Z.ratio; const n = prereg.estatistica.n; const limiar = prereg.estatistica.limiar_X; const alfa = prereg.estatistica.alfa;
const primeiro = Object.fromEntries((prereg.atribuicao.pares || []).map((p) => [p.id, p.primeiro]));
const byTask = {};
for (const r of ledger) { byTask[r.task_id] = byTask[r.task_id] || {}; byTask[r.task_id][r.braco] = r; }
const tasks = Object.keys(byTask).sort();
const rows = tasks.map((t) => {
  const on = byTask[t].ON, off = byTask[t].OFF;
  const valid = !!(on && off && !on.invalido && !off.invalido);
  const z = valid ? (on.aceite && on.tva_s <= ratio * off.tva_s ? 1 : 0) : null;
  return { task: t, primeiro: primeiro[t] || 'n/d', tva_on: on ? on.tva_s : null, tva_off: off ? off.tva_s : null, aceite_on: on ? on.aceite : null, aceite_off: off ? off.aceite : null, invalido: !valid, motivo: (on && on.motivo) || (off && off.motivo) || null, ratio_on_off: (on && off && off.tva_s) ? on.tva_s / off.tva_s : null, Z: z, hook_on: on ? on.hook_disparou : null, hook_off: off ? off.hook_disparou : null, hint_tier_on: on ? on.hint_tier : null, order_ts: on && off ? (new Date(on.ts) < new Date(off.ts) ? 'ON-primeiro' : 'OFF-primeiro') : null };
});
const validRows = rows.filter((r) => !r.invalido);
const X = validRows.filter((r) => r.Z === 1).length;
const p = binomTailUpper(n, X, 0.5); // assinatura de lib/stats.mjs: (n, k, p) — P(K >= X | n, 0,5)
const verdict = validRows.length < n ? 'INCOMPLETA (pares validos < n)' : (X >= limiar ? 'GANHOU' : 'PERDEU');
const byOrder = {};
for (const o of ['ON-primeiro', 'OFF-primeiro']) { const rs = validRows.filter((r) => r.order_ts === o); byOrder[o] = { n: rs.length, Z1: rs.filter((r) => r.Z === 1).length, median_ratio: rs.length ? [...rs.map((r) => r.ratio_on_off)].sort((a, b) => a - b)[Math.floor(rs.length / 2)] : null }; }
const out = {
  at: new Date().toISOString(), experiment_id: prereg.experiment_id, n, limiar_X: limiar, alfa, ratio,
  arms_in_ledger: ledger.length, tasks_in_ledger: tasks.length, valid_pairs: validRows.length, invalid_pairs: rows.filter((r) => r.invalido).length,
  X, p_exact_upper_tail: p, verdict_rederived: verdict,
  aceite_on: validRows.filter((r) => r.aceite_on).length, aceite_off: validRows.filter((r) => r.aceite_off).length,
  faster_on: validRows.filter((r) => r.ratio_on_off !== null && r.ratio_on_off < 1).length,
  median_ratio_on_off: validRows.length ? [...validRows.map((r) => r.ratio_on_off)].sort((a, b) => a - b)[Math.floor(validRows.length / 2)] : null,
  wilson_Z: wilson(X, validRows.length || 1),
  hook_disparou_on: validRows.filter((r) => r.hook_on).length, hook_disparou_off: validRows.filter((r) => r.hook_off).length,
  hint_tiers_on: validRows.reduce((m, r) => (m[r.hint_tier_on || 'null'] = (m[r.hint_tier_on || 'null'] || 0) + 1, m), {}),
  order_effect_exploratory: { note: 'exploratorio, nao pre-registado: Z e mediana do racio por ordem de execucao (a cache de prompt do fornecedor e partilhada entre bracos; a ordem foi contrabalancada no pre-registo)', ...byOrder },
  rows,
};
fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', 'analysis.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
console.log(rows.map((r) => `${r.task} ${r.primeiro}/${r.order_ts} ON ${r.tva_on && r.tva_on.toFixed(1)} OFF ${r.tva_off && r.tva_off.toFixed(1)} r=${r.ratio_on_off && r.ratio_on_off.toFixed(2)} Z=${r.Z} ${r.invalido ? 'INVALIDO ' + r.motivo : ''}`).join('\n'));
