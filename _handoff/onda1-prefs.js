'use strict';
/**
 * onda1-prefs.js — calibra a referencia da quota com o dado REAL do Paulo:
 * a barra de /usage marcava 75% com peso medido de 8971 (dedup, entradas+saidas).
 * referencia = 8971 / 0.75 = 11961 (semana); 5h escalada 10:1 como antes = 1196.
 * Depois VERIFICA que o quota.js le a calibragem e imprime a pressao resultante.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const f = path.join(os.homedir(), '.mooter', 'preferences.json');
let p = {};
try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* ficheiro novo */ }
p.quota_referencia = {
  peso_semana: 11961,
  peso_5h: 1196,
  calibrado_em: '2026-07-26',
  base: 'barra /usage da app a 75% com peso medido 8971 (regime novo: dedup + entradas+saidas)',
};
fs.mkdirSync(path.dirname(f), { recursive: true });
fs.writeFileSync(f, JSON.stringify(p, null, 2));
console.log('prefs gravadas: ' + f);

const q = require(path.join(__dirname, '..', 'packages', 'mooter-bridge', 'quota.js'));
const r = q.lerReferencia();
if (!r || r.peso_semana !== 11961) { console.error('FAIL: lerReferencia nao devolveu a calibragem'); process.exit(1); }
const e = q.estado({});
console.log('pressao agora: ' + e.pressao.valor + ' -> nivel ' + e.pressao.nivel
  + ' (ref ' + e.pressao.referencia.peso_semana + ', origem: ' + e.pressao.referencia.origem + ')');
if (e.pressao.nivel === 'critico') {
  console.log('AVISO: continua critico mesmo calibrado - verificar antes de confiar');
}
