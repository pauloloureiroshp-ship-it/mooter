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
 * parece rigor. Por isso estes testes cobrem os dois lados.
 *
 * ⚠️ Este parágrafo dizia "metade... e a outra metade", e era falso — apanhado
 * pelo G4 #4. A contagem real, de dez testes:
 *   DEIXA PASSAR (integrado) : K4, K7, K8
 *   RECUSA (integrado)       : K10          <- só existiu a partir de 2026-08-16
 *   RECUSA (unitário)        : K5, K6        (chamam o helper, não o dispatch)
 *   o matcher, isolado       : K1, K2, K3
 *   preparação               : K9
 * A recusa integrada para o `kimi` — o outro motor de `ENGINES_SEM_FICHEIROS` —
 * vive em `seamless.test.js:217`, e já existia. O que faltava era o `moo`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

/**
 * ⚠️ SANDBOX — TUDO ANTES DO `require('./seamless.js')` (2026-08-16)
 *
 * Este ficheiro era o ÚNICO do pacote que despachava sem isolamento nenhum, e
 * isso custou caro de três maneiras, todas medidas:
 *
 *  1. Escrevia no ledger REAL do dono — centenas de eventos, dezenas de jobs,
 *     incluindo o CLI pago lançado por K8 a sério.
 *     Os números NÃO ficam aqui: `bash _handoff/contrato-sandbox/contar.sh`.
 *     Este comentário já pinou duas contagens diferentes e ambas apodreceram —
 *     o ledger é vivo, e um número sem data não é um facto, é uma memória.
 *     (Uma delas trocava EVENTOS por JOBS. O `contar.sh` calcula o rácio real
 *      entre os dois; nunca o afirma. G4 #1, #3 e #4.)
 *  2. PENDURAVA a suite completa. `toolDispatch` devolve imediatamente
 *     (`seamless.js:2586`), mas o socket do Ollama e os processos-filho ficam
 *     ref'd no event loop; com `--test-timeout=0` e o watchdog de 30 min
 *     `unref()`-ado, nada desiste. Medido: 9 minutos sem escrever um byte.
 *  3. Ficava VERDE SEM EXERCER NADA — ver o comentário em K4.
 *
 * O ficheiro já sabia disto e resolveu-o só a meio: o comentário de K5/K6
 * explica que não passam por `toolDispatch` porque o `guardCheck` "tornaria o
 * teste dependente de haver ou não um job a correr na máquina — falharia às
 * terças e passaria às quartas". K4/K7/K8 ficaram de fora dessa protecção.
 */
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-contrato-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(WT, { recursive: true });
// ⚠️ O `-C WT` NÃO protege: `GIT_DIR` no ambiente prevalece sobre ele. Medido em
// 2026-08-16 — com GIT_DIR apontado para outra pasta, `git -C A init` criou o
// repositório em B, não em A. Estas variáveis estão unset nesta máquina, mas um
// sandbox que depende de uma variável estar por definir não é um sandbox.
// O `guardCheck` EXIGE uma worktree git, portanto isto não é opcional: se o init
// falhar, os testes que passam pelo dispatch são recusados pelo guard — e o
// `exerceuMesmo` grita em vez de os deixar passar a verde vazio. Apanhado pelo G4 #4.
// ⚠️ POR PREFIXO, não por lista. A primeira versão enumerava oito variáveis e
// deixava passar `GIT_TRACE*`/`GIT_TRACE2*` — medido em 2026-08-16:
// `GIT_TRACE2_EVENT=<fora>` fez o `git init` escrever 2036 bytes FORA do repo,
// e `GIT_TRACE` outros 176. Uma denylist enumerada é uma corrida contra a
// documentação do git que se perde sempre que ele ganha uma variável nova.
// Para um `git init` local nenhuma variável `GIT_*` é necessária, portanto
// removem-se TODAS e neutraliza-se a config, que também pode definir
// `trace2.*Target` e redireccionar escrita por essa via. Apanhado pelo G4 #5.
const GIT_ENV_LIMPO = {};
for (const [k, v] of Object.entries(process.env)) {
  if (!/^GIT_/i.test(k)) GIT_ENV_LIMPO[k] = v;
}
GIT_ENV_LIMPO.GIT_CONFIG_NOSYSTEM = '1';
GIT_ENV_LIMPO.GIT_CONFIG_GLOBAL = path.join(HOME, 'gitconfig-inexistente');
//
// ⚠️ ATÉ ONDE ISTO CHEGA, e nem um passo além — medido, não assumido.
// Este env limpo cobre o `git` que ESTE FICHEIRO invoca. Não cobre o git que o
// próprio motor invoca: `seamless.js:628` corre `git rev-parse` sem env próprio,
// e `seamless.js:1704` usa `childEnvFor('git')`. Com `GIT_TRACE2_EVENT` no
// ambiente, esses continuam a escrever o trace fora do sandbox.
// Medido com o ambiente sujo de propósito (GIT_DIR + GIT_TRACE + GIT_TRACE2_EVENT):
//   GIT_DIR roubado pelo nosso init? não  ← esta linha resolve isso
//   trace escrito fora?               sim ← vem do git do motor, não do nosso
//   e a suite: 6 pass / 4 fail            ← FALHA ruidosamente, não corrompe
// Fechar o resto exige passar env limpo aos `git` de produção, o que é mudança
// no motor e não cabe numa frente sobre isolar um ficheiro de teste. Fica
// declarado aqui em vez de implícito.
try {
  require('node:child_process').execFileSync('git', ['-C', WT, 'init', '-q'],
    { stdio: 'ignore', env: GIT_ENV_LIMPO });
} catch { /* o guard recusará, e o exerceuMesmo torna isso visível */ }
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;
// porta morta: apagar a variável não isola nada — o código cai para
// 127.0.0.1:11434, que na máquina do dono TEM um daemon a responder.
process.env.OLLAMA_HOST = '127.0.0.1:1';
// ⚠️ `MOOTER_HOME` NÃO cobre tudo: `escreverSinalDeQualidade` (seamless.js:434)
// escreve em `os.homedir()/.claude/tools/router/decisions.log`, o log real do
// router, e tem override PRÓPRIO. Os K actuais não alcançam esse ramo (é
// read-only), mas dizer "sandbox" sem fechar isto seria falso — e a afirmação
// tem de valer para quem acrescentar um teste de escrita amanhã. Apanhado pelo G4.
process.env.MOOTER_DECISIONS_LOG = path.join(HOME, 'decisions.log');
// ⚠️ `MOOTER_BUNDLE_DIR` (seamless.js:79) é uma FONTE DE CÓDIGO externa: como o
// repo temp não tem `tools/router/classify.js`, uma variável herdada do ambiente
// podia fazer o teste carregar um bundle de fora do sandbox. Estava unset nesta
// máquina — logo nunca escapou — mas um sandbox que depende de uma variável
// estar por definir não é um sandbox. Apanhado pelo G4 #3.
process.env.MOOTER_BUNDLE_DIR = path.join(HOME, 'bundle-inexistente');

const seam = require('./seamless.js');

// K8 itera ['cc','codex'] e, sem isto, `realSpawnJob` lança os binários a sério.
seam.setJobSpawner((cmd, cwd, out) => {
  const em = new EventEmitter();
  setImmediate(() => {
    out.write('{"type":"result","subtype":"success","result":"feito","total_cost_usd":0}\n');
    out.end();
    em.emit('spawn');
    setTimeout(() => em.emit('close', 0), 20);
  });
  em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
  return em;
});

/**
 * Espera pelo FACTO (a worktree ficar livre), com tecto — nunca por tempo fixo.
 * Sem isto, K4/K7/K8 disputam o WIP guard entre si e o segundo é recusado.
 */
async function livre(ondeE, maxMs) {
  const fim = Date.now() + (maxMs || 8000);
  for (;;) {
    let n = 0;
    try { n = (seam.activeJobsByWorktree(WT) || []).length; } catch { n = 0; }
    if (!n) return;
    // ⚠️ Estourar o tecto FALHA o teste, não devolve `false` em silêncio.
    // A primeira versão devolvia um booleano que nenhum chamador lia: se o
    // último `close` não chegasse, o job ficava vivo, o teste seguinte era
    // recusado pelo WIP guard — e ficava verde a vazio, que é exactamente o
    // defeito que este ficheiro veio corrigir. Apanhado pelo G4.
    assert.ok(Date.now() <= fim,
      'a worktree não ficou livre em ' + (maxMs || 8000) + 'ms antes de ' + ondeE
      + ' — há um job que não drenou, e o próximo dispatch seria recusado pelo guard');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * ⚠️ A GUARDA QUE FALTAVA, e sem a qual o sandbox acima não vale nada.
 *
 * `guardCheck` recusado devolve `{ error: '❌ guard recusou o dispatch' }` —
 * chave INGLESA (`seamless.js:1987`). Os asserts deste ficheiro liam `r.erro` —
 * chave PORTUGUESA, que só `recusaContratoDeLeitura` escreve (`seamless.js:1392`).
 * São chaves diferentes: quando o guard recusava, `r.erro` era `undefined` e
 * `assert.notEqual(undefined, 'capacidade_incompativel')` passava trivialmente.
 *
 * Medido em 2026-08-16, com o mesmo ficheiro e dois ledgers:
 *     ledger limpo            -> 3 dispatches reais -> 9 verdes
 *     ledger com job activo   -> 0 dispatches       -> 9 verdes
 * O mesmo resultado com e sem exercer o contrato.
 */
function exerceuMesmo(r, ondeE) {
  // O marcador é ESTRUTURAL, não uma string: `reasons` é devolvido num único
  // sítio de todo o seamless.js — `:1987`, a recusa do guard. Confirmado por
  // grep. Distinguir isto de qualquer `error` importa: `no-local-model` também
  // é um erro, mas chega DEPOIS de o contrato ter sido avaliado (é o Ollama
  // morto que este sandbox impõe de propósito), e nesse caso o teste exerceu
  // mesmo o que diz exercer. Só a recusa do guard salta o contrato por inteiro.
  assert.ok(!(r && Array.isArray(r.reasons)),
    'o guard recusou antes do contrato e ' + ondeE + ' não exerceu nada — este verde '
    + 'seria vazio: ' + JSON.stringify(r && r.reasons));

  // ⚠️ `reasons` não cobre TODOS os retornos pré-contrato. Cargo ou actor
  // inválidos saem em `seamless.js:1959` só com `error` — sem `reasons` e sem
  // `exit_code`. Os defaults deste ficheiro são válidos, portanto era um gap
  // latente e não um falso verde; mas a função afirmava cobrir a classe inteira,
  // e uma guarda que promete mais do que verifica é o defeito que esta frente
  // veio corrigir. Apanhado pelo G4 #5.
  //
  // Três formas de `error`, e só uma é o defeito:
  //   · o CONTRATO recusou      → tem `erro:'capacidade_incompativel'` (:1392).
  //                                É o que o K10 quer. NÃO é pré-contrato.
  //   · o dispatch falhou depois → tem `exit_code` (`no-local-model`, :2213).
  //                                O contrato já correu.
  //   · saiu ANTES do contrato   → só `error`, sem `erro` e sem `exit_code`
  //                                (cargo/actor inválidos, :1959). É este o gap.
  //
  // A primeira versão desta verificação não tinha o `!r.erro` e fazia o K10
  // falhar — o próprio teste da recusa foi acusado de não exercer a recusa.
  // Ficou aqui porque o erro é instrutivo: uma guarda demasiado larga acusa o
  // caso certo, e a diferença entre "não exerceu" e "exerceu e recusou" é uma
  // chave que os dois primeiros G4 desta frente já tinham mostrado importar.
  if (r && r.error && !r.exit_code && !r.erro) {
    assert.fail(ondeE + ' recebeu um erro pré-contrato (sem `erro` nem `exit_code`) — '
      + 'não chegou a exercer o que diz exercer: ' + JSON.stringify(r.error).slice(0, 160));
  }
}

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
    worktree: WT,           // sandbox, não process.cwd() — ver o preâmbulo
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
  await livre('K4');
  const r = await seam.toolDispatch(dispatchArgs({
    __goal: 'Resume em duas frases a ideia principal',
  }));
  exerceuMesmo(r, 'K4');
  assert.notEqual(r && r.erro, 'capacidade_incompativel',
    'REGRESSÃO: o contrato voltou a avaliar o masterprompt em vez do goal — '
    + 'isto bloqueia TODO o trabalho local, que é o diferencial do produto');
  await livre('fim de K4');
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
  await livre('K7');
  const r = await seam.toolDispatch(dispatchArgs({
    __goal: 'Lê packages/mooter-bridge/worktrees.js e diz se valida frescura',
    masterprompt: MP_REAL + '\n## FICHEIROS REAIS (lidos do disco pelo Mooter, não inventados)\n<conteúdo>',
  }));
  exerceuMesmo(r, 'K7');
  assert.notEqual(r && r.erro, 'capacidade_incompativel',
    'se o conector já injectou os ficheiros, o motor tem olhos e o contrato não tem nada a dizer');
  await livre('fim de K7');
});

test('K8 — motores COM ferramentas nunca são travados por este contrato', async () => {
  for (const agent of ['cc', 'codex']) {
    await livre('K8/' + agent);
    const r = await seam.toolDispatch(dispatchArgs({
      agent,
      __goal: 'Lê packages/mooter-bridge/worktrees.js e diz se valida frescura',
      read_files: false,
    }));
    exerceuMesmo(r, 'K8/' + agent);
    assert.notEqual(r && r.erro, 'capacidade_incompativel',
      agent + ' tem ferramentas de leitura próprias — travá-lo seria um falso positivo');
    await livre('fim de K8/' + agent);
  }
});

test.after(async () => {
  // ⚠️ Uma tentativa única engolia EPERM em silêncio e deixava a pasta temp a
  // acumular a cada corrida — no Windows o handle do último `close` pode ainda
  // não ter caído aos 250ms. Tenta algumas vezes com recuo; se mesmo assim não
  // sair, DIZ (o `warn` é a diferença entre lixo conhecido e lixo invisível).
  // Não falha o teste: a suite não deve ficar vermelha por um handle do SO.
  for (const espera of [250, 500, 1000, 2000]) {
    await new Promise((r) => setTimeout(r, espera));
    try { fs.rmSync(HOME, { recursive: true, force: true }); return; } catch { /* tenta outra vez */ }
  }
  // ⚠️ o comando nomeia ESTA pasta, não um glob `mooter-contrato-*`: uma suite a
  // correr em paralelo tem a sua própria, e apagá-la a meio seria pior que o lixo.
  console.warn('[contrato.test.js] não consegui remover ' + HOME
    + ' — provável handle ainda aberto. Limpa quando a suite terminar: rm -rf "' + HOME + '"');
});

// ────────────────────────────────────── prepare separado em duas decisões ──

/**
 * ⚠️ K10 — O TESTE QUE FALTAVA, e a razão pela qual faltava.
 *
 * O cabeçalho deste ficheiro promete que "metade destes testes verifica que o
 * contrato RECUSA". Não era verdade quando integrado: K5/K6 chamam
 * `_recusaContratoDeLeitura` DIRECTAMENTE — testam o construtor da mensagem, não
 * o enforcement — e K4/K7/K8 só afirmam `notEqual(..., 'capacidade_incompativel')`,
 * ou seja, só cobrem caminhos que devem PASSAR.
 *
 * Consequência, medida pelo G4 #3 em 2026-08-16 e reproduzida pelo autor:
 * substituir `const leituraExigida = ...` por `null` em seamless.js:2011 — matar
 * o enforcement por completo — deixava os NOVE K verdes.
 *
 * K10 é o inverso exacto de K7: mesmo goal, mesmo motor, mas SEM o contexto
 * injectado no masterprompt. Se o contrato estiver vivo, recusa. Se alguém o
 * desligar, este teste é o único que grita.
 */
test('K10 — INTEGRADO: sem contexto injectado, o dispatch RECUSA mesmo', async () => {
  await livre('K10');
  const r = await seam.toolDispatch(dispatchArgs({
    __goal: 'Lê packages/mooter-bridge/worktrees.js e diz se valida frescura',
    // repare-se no que NÃO está aqui: o bloco "## FICHEIROS REAIS" que o K7 põe.
    // Sem ele o `moo` não tem olhos, e é precisamente isso que o contrato existe
    // para travar antes de gastar tokens.
  }));
  exerceuMesmo(r, 'K10');
  assert.equal(r.erro, 'capacidade_incompativel',
    'o contrato deixou de recusar quando integrado — despachou leitura para um '
    + 'motor sem ferramentas. É este o buraco que os outros K não viam.');
  assert.ok(r.requisito && r.requisito.ficheiro, 'a recusa integrada tem de nomear o ficheiro');
  assert.ok(Array.isArray(r.faz_assim) && r.faz_assim.length, 'e tem de dar saída');
  await livre('fim de K10');
});

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
