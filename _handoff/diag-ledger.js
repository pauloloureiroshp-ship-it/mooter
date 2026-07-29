'use strict';
// Diagnostico do MEO: porque falham 1 em cada 4 jobs, e porque so 35% vai para local.
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = path.join(process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'ledger.jsonl');
const ev = [];
for (const l of fs.readFileSync(L, 'utf8').split('\n')) {
  if (!l.trim()) continue;
  try { ev.push(JSON.parse(l)); } catch { /* */ }
}
console.log('eventos: ' + ev.length);

const porExit = new Map();
const porAgente = new Map();
for (const e of ev) {
  if (e.event !== 'failed' && e.event !== 'prep_timeout' && e.event !== 'prep_failed_fallback') continue;
  const k = String(e.exit_code == null ? '(sem exit_code)' : e.exit_code);
  porExit.set(k, (porExit.get(k) || 0) + 1);
  const a = e.agent || 'n/d';
  porAgente.set(a, (porAgente.get(a) || 0) + 1);
}
console.log('\n=== PORQUE FALHAM (evento terminal nao-done) ===');
for (const [k, n] of [...porExit].sort((a, b) => b[1] - a[1])) console.log('  ' + n + 'x  exit=' + k);
console.log('\n=== FALHAS POR AGENTE ===');
for (const [k, n] of [...porAgente].sort((a, b) => b[1] - a[1])) console.log('  ' + n + 'x  ' + k);

console.log('\n=== DESPACHOS POR AGENTE (todos) ===');
const disp = new Map();
for (const e of ev) if (e.event === 'dispatched') disp.set(e.agent || 'n/d', (disp.get(e.agent || 'n/d') || 0) + 1);
for (const [k, n] of [...disp].sort((a, b) => b[1] - a[1])) console.log('  ' + n + 'x  ' + k);

console.log('\n=== PORQUE O LOCAL FOI RECUSADO (escolha_local / modelo_porque) ===');
const rec = new Map();
for (const e of ev) {
  const p = e.local_porque || e.escolha_local_porque || (e.escolha_local && e.escolha_local.porque);
  if (p) rec.set(String(p).slice(0, 90), (rec.get(String(p).slice(0, 90)) || 0) + 1);
}
if (!rec.size) console.log('  n/d — o ledger nao regista a razao da decisao local-first no evento dispatched');
for (const [k, n] of [...rec].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log('  ' + n + 'x  ' + k);

console.log('\n=== CAMPOS QUE O SCORECARD PROCURA E NAO EXISTEM ===');
const campos = ['first_token', 'first_token_at', 'ttft_ms', 'files_touched', 'keep_rate'];
for (const c of campos) {
  const n = ev.filter((e) => e[c] != null).length;
  console.log('  ' + c + ': ' + n + ' evento(s)' + (n ? '' : '  <- por isso a metrica e n/d'));
}
