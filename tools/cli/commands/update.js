/**
 * mooter update — actualiza o payload pelo canal do entitlement.
 *
 * O QUE ISTO DEIXOU DE FAZER, e porque nao era um detalhe. Ate 2026-09-10 este
 * comando fazia UMA coisa: `curl -fsSL https://mooter.ai/install.sh | bash`.
 * Tres defeitos, todos medidos:
 *
 *  1. **O canal evaporava-se.** O `install.sh` aceita `--channel=`, guarda-o em
 *     `CHANNEL` (linha 23) e a unica coisa que faz com ele e IMPRIMI-LO (linha
 *     101). Re-executar o instalador voltava sempre ao valor por omissao. Quem
 *     escolheu `beta` ficava em `friends-beta` a partir do primeiro update, sem
 *     erro nenhum e sem maneira de o notar.
 *  2. **Nao havia verificacao.** Quem controlasse a origem entregava um script
 *     e ele corria com os privilegios de quem o correu. O adversario disse o
 *     mesmo do updater do bridge: «verifica presenca/sintaxe, nao assinatura».
 *  3. **Nao havia volta.** Um update que corresse mal deixava a maquina como
 *     ficasse. Sem `cli.prev`, "rollback" era reinstalar e esperar.
 *
 * Este ficheiro so imprime. A decisao vive em `../lib/update-core.js`, que e
 * testado sem rede e sem disco.
 *
 * Uso:
 *   mooter update              procura, verifica e aplica
 *   mooter update --check      procura e verifica; nunca descarrega nem escreve
 *   mooter update --rollback   volta ao payload anterior (estado B14)
 */

'use strict';

const { color, say, ok, warn, fail, info } = require('../lib/ui');
const { readVersion } = require('../lib/paths');
const { correr } = require('../lib/update-core');
const { reverter } = require('../lib/payload-troca');

/** Um passo do recibo, impresso como o utilizador o consegue ler. */
function passo(p) {
  const marca = p.ok ? color.green('✓') : color.red('✗');
  const nome = String(p.passo).padEnd(11);
  console.log(`    ${marca} ${color.dim(nome)} ${p.porque || p.codigo || ''}`);
}

async function run(args = []) {
  const soVer = args.includes('--check');
  const rollback = args.includes('--rollback');
  const actual = readVersion();

  console.log('');
  console.log(`  ${color.magenta('mooter update')} ${color.dim('current: v' + actual.version)}`);
  console.log('');

  if (rollback) {
    const r = reverter();
    if (r.ok) ok(r.porque);
    else fail(r.porque);
    console.log('');
    process.exit(r.ok ? 0 : 1);
  }

  const r = await correr({
    aplicar: !soVer,
    versaoInstalada: actual.version,
    // O descarregador real ainda nao existe, e isso esta impresso em vez de
    // escondido: sem chave de release publicada nao ha manifesto assinado para
    // descarregar, e escrever um descarregador que nunca correu contra um
    // artefacto real seria codigo por provar a fingir que esta provado.
    // `correr()` recusa-se a aplicar sem ele (`codigo: 'sem-descarregador'`).
    descarregarImpl: null,
  });

  for (const p of r.passos || []) passo(p);
  console.log('');

  if (r.ok && r.codigo === 'ja-tens') {
    ok(`Already on latest: v${actual.version} (canal ${r.canal})`);
  } else if (r.ok && r.codigo === 'ha-nova') {
    say(`Ha v${r.version} no canal ${r.canal}. Corre \`mooter update\` sem \`--check\` para aplicar.`);
  } else if (r.ok && r.codigo === 'actualizado') {
    ok(r.porque);
    info('Se algo correr mal: `mooter update --rollback`');
  } else if (r.codigo === 'sem-rede') {
    warn(r.porque);
  } else if (r.codigo === 'sem-ancora') {
    fail(r.porque);
    info('Nenhuma actualizacao e aplicada sem assinatura verificada. Isto e deliberado.');
  } else {
    fail(r.porque);
    if (r.revertido) info('Actualizacao revertida — voltaste ao payload anterior.');
  }
  console.log('');

  process.exit(r.ok ? 0 : 1);
}

module.exports = { run };
