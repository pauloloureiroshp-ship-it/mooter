'use strict';

/**
 * CONTRATO DE CAPACIDADES — o guarda protege sem amputar (2026-07-31)
 *
 * ⚠️ O BUG QUE ESTES TESTES IMPEDEM DE VOLTAR
 *
 * A Wave J-2 introduziu um contrato entre o que a tarefa exige e o que o motor
 * consegue: se a tarefa precisa de ler ficheiros e o motor corre via API de
 * chat sem ferramentas, o job é recusado ANTES de gastar tokens. Correcto — foi
 * medido a 2026-07-31 um job que queimou 24 s e 376 tokens numa tarefa
 * impossível por construção.
 *
 * Só que a primeira implementação avaliava o MASTERPROMPT em vez do PEDIDO:
 *
 *     const leituraExigida = pedeLeituraDeFicheiro(masterprompt);   // ERRADO
 *
 * O masterprompt carrega sempre o bootstrap e o mapa do projecto, e esses
 * mencionam caminhos — `tools/router/classify.js` é o marcador do repo. O
 * resultado, medido: o goal «Resume em duas frases a ideia principal» — que o
 * matcher isolado classifica como `null` — era recusado com
 * `requisito.ficheiro = "tools/router/classify.js"`.
 *
 * Na prática **todo** o trabalho para `moo` e `kimi` seria bloqueado. O guarda
 * teria desligado o tier local — o próprio diferencial do produto — em silêncio,
 * e com a aparência de estar a proteger o utilizador.
 *
 * A LIÇÃO: um guarda tem duas maneiras de falhar. Deixar passar o que devia
 * travar, e travar o que devia passar. A segunda é mais difícil de ver, porque
 * parece rigor. Por isso metade destes testes verifica que o contrato RECUSA, e
 * a outra metade que ele DEIXA PASSAR.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const seam = require('./seamless.js');

// ─────────────────────────────── o matcher: o que conta como pedir leitura ──

test('K1 — um goal genérico NÃO pede leitura de ficheiros', () => {
  assert.equal(seam.pedeLeituraDeFicheiro('Resume em duas frases a ideia principal'), null,
    'este goal foi o contra-exemplo real: era recusado por causa do masterprompt');
  assert.equal(seam.pedeLeituraDeFicheiro('Explica o que é um router determinístico'), null);
  assert.equal(seam.pedeLeituraDeFicheiro('Escreve três bullets sobre custo por token'), null);
});

test('K2 — um goal que cita um caminho PEDE leitura', () => {
  const r = seam.pedeLeituraDeFicheiro('Lê packages/mooter-bridge/worktrees.js e diz o que faz');
  assert.ok(r, 'um caminho explícito é prova suficiente');
  assert.match(String(r.path), /worktrees\.js/);
});

test('K3 — um verbo de leitura sem caminho não chega para bloquear', () => {
  /**
   * Verificado contra o comportamento real, não contra a intuição: o matcher
   * exige um CAMINHO. Um verbo, mesmo com objecto genérico, não basta — e é
   * assim que deve ser, porque bloquear um dispatch por causa da palavra "lê"
   * seria o mesmo falso positivo que o bug do masterprompt, à escala do goal.
   */
  assert.equal(seam.pedeLeituraDeFicheiro('lê isto e resume'), null);
  assert.equal(seam.pedeLeituraDeFicheiro('lê o ficheiro e resume'), null,
    'sem caminho não há prova de que ficheiro é — travar seria adivinhar');
});

// ────────────────────── o contrato: recusa o impossível, deixa passar o resto ──

/**
 * O `guardCheck` corre antes do contrato e exige o cabeçalho ⇄ de routing.
 * O masterprompt inclui `tools/router/classify.js` DE PROPÓSITO: é assim que
 * ele é na vida real, e é essa menção que fazia o contrato disparar a torto.
 */
const MP_REAL = '⇄ ROUTING\nDE: teste\nPARA: moo\n\n'
  + 'BOOTSTRAP: o repo é o frugal, marcado por tools/router/classify.js.\n'
  + 'MAPA COMPACTO DO PROJECTO: stack=node, tests=node --test\n';

function dispatchArgs(extra) {
  return Object.assign({
    agent: 'moo',
    worktree: process.cwd(),
    masterprompt: MP_REAL,
    wave: 'contrato-test',
  }, extra || {});
}

test('K4 — REGRESSÃO: o contrato lê o PEDIDO, não o masterprompt', async () => {
  /**
   * O masterprompt menciona `tools/router/classify.js` de propósito — é assim
   * que ele é na vida real. O goal não pede leitura nenhuma. Se o contrato
   * recusar isto, voltou a analisar o texto errado.
   */
  const r = await seam.toolDispatch(dispatchArgs({
    __goal: 'Resume em duas frases a ideia principal',
  }));
  assert.notEqual(r && r.erro, 'capacidade_incompativel',
    'REGRESSÃO: o contrato voltou a avaliar o masterprompt em vez do goal — '
    + 'isto bloqueia TODO o trabalho local, que é o diferencial do produto');
});

/**
 * K5 e K6 exercitam a RECUSA. Não passam por `toolDispatch` de propósito: o
 * `guardCheck` corre antes do contrato e recusa por motivos de ambiente (WIP
 * guard, posse da worktree), o que tornaria o teste dependente de haver ou não
 * um job a correr na máquina — falharia às terças e passaria às quartas.
 * Testamos a decisão, não a orquestração à volta dela.
 */
test('K5 — a recusa diz o que falta E como resolver (recusar sem saída é hostil)', () => {
  const leitura = seam.pedeLeituraDeFicheiro('Lê packages/mooter-bridge/worktrees.js e diz se valida frescura');
  assert.ok(leitura, 'o pedido tem mesmo de exigir leitura');

  const r = seam._recusaContratoDeLeitura
    ? seam._recusaContratoDeLeitura('moo', leitura, seam.effectivePermissions('moo'))
    : null;
  assert.ok(r, 'a construtora da recusa tem de estar exposta para poder ser testada');
  assert.equal(r.erro, 'capacidade_incompativel');
  assert.ok(r.falta, 'a recusa tem de dizer o que falta');
  assert.ok(Array.isArray(r.faz_assim) && r.faz_assim.length,
    'e tem de dizer como resolver — recusar sem saída é hostil');
});

test('K6 — a recusa nomeia o ficheiro pedido e a capacidade real do motor', () => {
  const leitura = seam.pedeLeituraDeFicheiro('Lê packages/mooter-bridge/moo.js e explica o num_ctx');
  const r = seam._recusaContratoDeLeitura('moo', leitura, seam.effectivePermissions('moo'));
  assert.match(String(r.requisito.ficheiro), /moo\.js/, 'o ficheiro pedido tem de ser nomeado');
  assert.ok(r.capacidade_efectiva, 'a capacidade efectiva tem de vir na recusa');
});

test('K7 — com contexto já injectado, o mesmo pedido PASSA', async () => {
  const r = await seam.toolDispatch(dispatchArgs({
    __goal: 'Lê packages/mooter-bridge/worktrees.js e diz se valida frescura',
    masterprompt: MP_REAL + '\n## FICHEIROS REAIS (lidos do disco pelo Mooter, não inventados)\n<conteúdo>',
  }));
  assert.notEqual(r && r.erro, 'capacidade_incompativel',
    'se o conector já injectou os ficheiros, o motor tem olhos e o contrato não tem nada a dizer');
});

test('K8 — motores COM ferramentas nunca são travados por este contrato', async () => {
  for (const agent of ['cc', 'codex']) {
    const r = await seam.toolDispatch(dispatchArgs({
      agent,
      __goal: 'Lê packages/mooter-bridge/worktrees.js e diz se valida frescura',
      read_files: false,
    }));
    assert.notEqual(r && r.erro, 'capacidade_incompativel',
      agent + ' tem ferramentas de leitura próprias — travá-lo seria um falso positivo');
  }
});

// ────────────────────────────────────── prepare separado em duas decisões ──

test('K9 — read_files e pre_digest são independentes, e prepare continua a valer', () => {
  const r = seam.resolverPreparacao;
  assert.equal(r({}).read_files, true, 'ler ficheiros é o comportamento por omissão');
  assert.equal(r({}).pre_digest, true, 'pré-digerir também');

  assert.equal(r({ prepare: false }).pre_digest, false, 'prepare:false continua a desligar o pré-digest');
  assert.equal(r({ prepare: false }).read_files, true,
    'REGRESSÃO: prepare:false voltou a tirar os olhos ao motor — foi este o bug de 31/07, '
    + 'em que o kimi recebeu uma tarefa de leitura sem ficheiro nenhum');

  assert.equal(r({ read_files: false }).read_files, false, 'read_files pode ser desligado sozinho');
  assert.equal(r({ read_files: false }).pre_digest, true, 'sem afectar o pré-digest');
});
