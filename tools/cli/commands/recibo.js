// `mooter recibo` — o que se fez, em tokens medidos.
//
// Existe porque durante meses este projecto disse «no tokens are logged» e o
// Claude Code estava a escrever `message.usage` completo em cada linha de
// `~/.claude/projects/**/*.jsonl` desde sempre. A telemetria do Mooter não
// registava; a máquina registava.
//
// O motor vive em `tools/router/recibo.js` — este ficheiro é só a porta.

'use strict';

const path = require('path');

function run(args = []) {
  const todos = args.includes('--todos') || args.includes('--all');
  let R;
  try {
    R = require(path.join(__dirname, '..', '..', 'router', 'recibo.js'));
  } catch {
    // Runtime instalado: o router vive ao lado, em ~/.claude/tools/router.
    try { R = require('../../router/recibo.js'); }
    catch {
      process.stderr.write('mooter: recibo.js não encontrado neste runtime. Corre /mooter-update.\n');
      process.exitCode = 1;
      return;
    }
  }
  // Sem `--todos`, lê os 40 transcripts mais recentes: é rápido e cobre o mês.
  // O total lido aparece SEMPRE no cabeçalho, para que ninguém confunda uma
  // amostra com o histórico completo.
  process.stdout.write(R.imprimir(R.recibo({ limite: todos ? undefined : 40 })) + '\n');
}

module.exports = { run };
