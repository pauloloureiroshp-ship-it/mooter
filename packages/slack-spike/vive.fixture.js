'use strict';
/**
 * Filho do teste `o daemon NAO morre entre o socket cair e a religacao`.
 *
 * Vive num ficheiro proprio porque a propriedade em causa — «o processo continua
 * vivo» — nao e observavel de dentro do processo que a testa. Um teste em memoria
 * ve o `a_religar` no log e da-se por satisfeito; foi exactamente isso que deixou
 * passar um daemon que fazia exit 0 no meio da religacao.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('./transporte.js');
const gate = require('./gate.js');

const sync = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vive-')), 'SYNC.md');
fs.writeFileSync(sync, '# SYNC\n\n' + gate.LINHA_DESTRAVE + '\n');

const socket = { cbs: {} };
for (const k of ['aoAbrir', 'aoMensagem', 'aoFechar', 'aoErro']) socket[k] = (f) => { socket.cbs[k] = f; };
socket.enviar = () => {};
socket.fechar = () => {};

t.criarTransporte({
  canal: 'C', syncPath: sync, dryRun: true,
  // sem rede e sem `agendar` injectado: e o caminho de temporizador REAL, o unico
  // onde o processo pode morrer — e o unico que o daemon usa a serio
  fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, url: 'wss://x' }) }),
  abrirSocket: () => socket,
  registar: () => {},
}).correr({}).then(() => {
  socket.cbs.aoFechar();            // a queda
  process.stdout.write('caiu\n');   // o pai comeca a contar aqui
});
