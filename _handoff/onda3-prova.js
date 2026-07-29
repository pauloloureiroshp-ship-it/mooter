'use strict';
// A prova da Onda 3: o loop lê o ledger REAL desta máquina e diz o que aprendeu.
// Se não houver dados suficientes, tem de dizer n/d — nunca inventar.
const path = require('path');
const pkg = path.join(__dirname, '..', 'packages', 'mooter-bridge');
const aprender = require(path.join(pkg, 'aprender.js'));
const seam = require(path.join(pkg, 'seamless.js'));

const ledger = seam.ledgerRead();
console.log('eventos no ledger real: ' + ledger.length);

console.log('\n--- BLOCO "O QUE APRENDI" (ledger real) ---');
console.log(aprender.resumoDeAprendizagem({ ledger }));

console.log('\n--- O LOOP FECHA? recomendarAgente com o histórico real ---');
for (const goal of ['resume o ficheiro fleet.js', 'corrige o bug na funcao parse', 'compara os dois modulos']) {
  const r = aprender.recomendarAgente({ goal, tier: 'T2', escrita: false, ledger });
  console.log('  "' + goal + '" -> ' + (r ? (r.agente + ' (' + r.confianca + ') porque ' + r.porque) : 'null — poucas observações, mantém o comportamento actual'));
}
