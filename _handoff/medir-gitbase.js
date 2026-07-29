'use strict';
// Quanto custa captureGitBase no caminho quente do dispatch, no Windows real?
// A licao da Onda 2: nada sincrono e caro no caminho de um job.
const path = require('path');
const aprender = require(path.join(__dirname, '..', 'packages', 'mooter-bridge', 'aprender.js'));
const wt = path.join(__dirname, '..');
const amostras = [];
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  const base = aprender.captureGitBase(wt);
  amostras.push(Date.now() - t0);
  if (i === 0) console.log('base: ' + JSON.stringify(base));
}
amostras.sort((a, b) => a - b);
console.log('captureGitBase (5 amostras, ms): ' + amostras.join(', ') + '  | mediana ' + amostras[2] + 'ms');
console.log(amostras[2] > 150
  ? 'VEREDICTO: CARO — bloqueia o event loop no dispatch de escrita, corrigir'
  : 'VEREDICTO: aceitavel');
