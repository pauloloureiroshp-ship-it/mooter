'use strict';
/**
 * A recusa tem de dizer o motivo NO CANAL QUE O CHAMADOR LÊ.
 *
 * Retro-prova (2026-08-06): três dispatches recusados às cegas, cada um a mudar
 * uma variável por adivinhação, porque o único texto que chegava era
 * `⛔ não despachei o job · em <pasta>`. O motivo existia — `seamless.js:3540`
 * assina o `error`, o `reasons` e o `faz_assim` por cima do objecto — mas
 * `humanLine` devolvia o `resumo` antes de sequer olhar para o `error`, e
 * `mooter_work` traz sempre `resumo`. Código morto no caminho que mais importa.
 *
 * A mesma classe já tinha sido paga em 2026-08-01 (auditoria E2E, `seamless.js:573`):
 * escreveu-se o `faz_assim` e ninguém verificou que ele chegava ao ecrã.
 * Este ficheiro é essa verificação.
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.MOOTER_LIB = '1';   // não arrancar o servidor ao importar

/**
 * ⚠️ ARMADILHA MEDIDA (2026-08-06), e é por isto que este ficheiro quase não
 * existiu: `server-apps.js:38-40` substitui `console.log/info/warn/error/...`
 * por um escritor de diário, à força, no topo do módulo. É correcto em produção
 * — em stdio MCP o stdout só pode levar JSON-RPC, e um `console.log` de qualquer
 * dependência parte o fluxo. Mas num processo de TESTE isso sequestra o reporter:
 * a primeira versão deste ficheiro deu «1 test, 1 pass» sem correr um único
 * assert, e `node recusa-legivel.test.js` não imprimia nada.
 *
 * Guardar e restaurar em volta do require é o preço de admissão para testar
 * qualquer coisa neste módulo. Sem isto, um teste verde não prova nada.
 */
const _console = {};
for (const m of ['log', 'info', 'warn', 'debug', 'trace', 'dir', 'error']) _console[m] = console[m];
const apps = require('./server-apps.js');
for (const m of Object.keys(_console)) console[m] = _console[m];

const { humanLine } = apps;

test('recusa de mooter_work mostra o motivo, não só o resumo', () => {
  const linha = humanLine('mooter_work', {
    resumo: '⛔ não despachei o job · em frugal-regua',
    error: '❌ guard recusou o dispatch',
    reasons: ['worktree fora da raiz permitida'],
    faz_assim: ['preenche "Repositório mooter" (repo_path) nas definições do conector'],
  });
  assert.match(linha, /não despachei o job/);        // o resumo continua lá
  assert.match(linha, /guard recusou o dispatch/);   // ⬅️ o que faltava
  assert.match(linha, /fora da raiz permitida/);     // ⬅️ a razão concreta
  assert.match(linha, /faz assim: preenche/);        // ⬅️ o passo accionável
});

test('erro sem reasons nem faz_assim continua legível', () => {
  const linha = humanLine('mooter_work', {
    resumo: '⛔ não despachei o job',
    error: 'spawn falhou: EPERM',
  });
  assert.match(linha, /spawn falhou: EPERM/);
  assert.doesNotMatch(linha, /undefined|\[object/);
});

test('sucesso não é contaminado: sem error, o resumo manda', () => {
  const linha = humanLine('mooter_work', {
    resumo: '🐮 codex a trabalhar em "x" · só leitura · job job-1',
    job_id: 'job-1',
  });
  assert.strictEqual(linha, '🐮 codex a trabalhar em "x" · só leitura · job job-1');
});

test('tools que não são work/check mantêm o prefixo de aviso', () => {
  const linha = humanLine('mooter_plan', { error: 'plano inexistente' });
  assert.strictEqual(linha, '⚠ plano inexistente');
});

test('o diário do servidor tem o pid no nome do ficheiro', () => {
  const f = apps.LOGFILE_PATH();
  // Num ambiente sem nenhum candidato escrevível, LOGFILE fica null — e aí não
  // há nada a afirmar. Onde há ficheiro, ele TEM de ser atribuível.
  if (f) assert.match(f, new RegExp('mooter-mcp-boot\\.' + process.pid + '\\.log$'));
});
