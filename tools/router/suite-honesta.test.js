/**
 * suite-honesta.test.js — a suite não pode voltar a mentir sobre si própria.
 *
 * ── O QUE ACONTECEU, MEDIDO A 2026-09-10 ────────────────────────────────────
 * O script `test` corria `node --test --test-force-exit …`. Essa flag mata o
 * processo quando a fase síncrona acaba, e os testes ASSÍNCRONOS que ainda
 * estavam a correr desaparecem — sem aviso, e **sem mudar o código de saída**.
 *
 *     com a flag:   1110 testes, 1109 pass, 0 fail   <- o que o CI publicava
 *     sem a flag:   1316 testes, 1309 pass, 6 fail
 *
 * Por ficheiro: `ledger-turn-io` 7 -> 16, `provider-health` 7 -> 14,
 * `ollama-host` 9 -> 11, `recibo` 10 -> 11, `backtest` 52 -> 97.
 *
 * Uma das falhas escondidas era a guarda de cobertura do `OLLAMA_HOST` — a que
 * existe porque, sem ela, o motor $0 falha MUDO e o trabalho cai para um motor
 * pago. Estava a ser silenciada pela flag.
 *
 * ── PORQUE E QUE A FLAG LA ESTAVA ───────────────────────────────────────────
 * Um único ficheiro faz a suite pendurar: `pin-timeout.test.js`, que exercita
 * `executePinned` contra o `codex exec` — um loop agêntico, com um caso medido
 * de 283 s e `timeoutMs: 600000`. Medido: com ele fora, a suite termina; com
 * ele dentro, não termina.
 *
 * **O `backtest.test.js` NÃO era culpado.** Parecia, porque aparecia sempre na
 * lista de processos vivos ao lado do outro. Com o `pin-timeout` fora e o
 * `backtest` dentro, a suite fecha em 1293 testes. Movê-lo teria custado ~94
 * testes de cobertura por uma suposição que a medição desfez.
 *
 * A correcção, portanto, não foi «tirar a flag»: foi separar o ficheiro que
 * justificava a flag (`npm run test:integration`, opt-in, precisa de motores
 * reais) e tirá-la a seguir.
 *
 * ── O QUE ESTE FICHEIRO GUARDA ──────────────────────────────────────────────
 * Um número que ninguém vigia volta a mudar. Este teste vigia-o.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

/**
 * Chão do número de ficheiros no script `test`. Sobe quando alguém acrescenta;
 * descer é que tem de doer, porque descer em silêncio foi o defeito.
 */
const CHAO_DE_FICHEIROS = 95;

test('o script `test` NAO pode voltar a usar --test-force-exit', () => {
  assert.ok(
    !pkg.scripts.test.includes('--test-force-exit'),
    'a flag voltou: ela mata testes assincronos e a suite sai verde a mentir ' +
      '(medido 2026-09-10: 1110 com ela, 1316 sem ela, 6 falhas escondidas)',
  );
});

test('nenhum outro script de teste a usa pelas costas', () => {
  for (const [nome, cmd] of Object.entries(pkg.scripts)) {
    if (!/^test/.test(nome)) continue;
    assert.ok(!String(cmd).includes('--test-force-exit'), `${nome} usa --test-force-exit`);
  }
});

test('o ficheiro que pendura a suite esta FORA dela, e tem casa propria', () => {
  // Se voltar para o `test`, a suite deixa de terminar — e a proxima pessoa
  // volta a "resolver" isso com a flag.
  assert.ok(!pkg.scripts.test.includes('pin-timeout.test.js'), 'pin-timeout voltou para a suite normal');
  assert.ok(pkg.scripts['test:integration'], 'sem `test:integration` o ficheiro deixa de correr em lado nenhum');
  assert.ok(pkg.scripts['test:integration'].includes('pin-timeout.test.js'));
});

test('o backtest CONTINUA na suite normal — a medicao ilibou-o', () => {
  assert.ok(
    pkg.scripts.test.includes('backtest.test.js'),
    'backtest saiu da suite: sao ~94 testes de cobertura perdidos, e ele nao e o que pendura',
  );
});

test('a lista de ficheiros nao encolhe em silencio', () => {
  const n = pkg.scripts.test.split(/\s+/).filter((f) => f.endsWith('.test.js')).length;
  assert.ok(
    n >= CHAO_DE_FICHEIROS,
    `a suite tem ${n} ficheiros e o chao e ${CHAO_DE_FICHEIROS}. ` +
      'Se a remocao foi deliberada, sobe o chao no mesmo commit e diz porque.',
  );
});

test('todos os ficheiros do script existem mesmo', () => {
  // Um ficheiro renomeado sem actualizar o script nao da erro: o `node --test`
  // ignora-o. Deixa de correr, e ninguem repara.
  const em_falta = pkg.scripts.test
    .split(/\s+/)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !fs.existsSync(path.join(__dirname, f)));
  assert.deepEqual(em_falta, [], 'ficheiros no script `test` que nao existem no disco');
});
