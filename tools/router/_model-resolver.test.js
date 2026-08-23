/**
 * _model-resolver.test.js — o ficheiro que fabricava 95% das execucoes de motor.
 *
 * MEDIDO a 2026-08-23 no `execution.log` vivo: 282 linhas com
 * `model=gpt-5-codex`, das quais 14 eram invocacoes reais. **268 fabricadas —
 * 95,0%.** Entre elas `which codex`, `where codex` e um `git add`.
 *
 * Nao era um erro de contagem. O `exec-logger.js` nao ANOTA o modelo,
 * SUBSTITUI-O, e o `bucketFor()` manda essas linhas para baldes baratos: cada
 * mencao da palavra "codex" num comando qualquer INFLACIONAVA a poupanca
 * declarada. A propria sessao de auditoria que encontrou isto fabricou ~10
 * execucoes ao pesquisar pelo nome.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * E DEPOIS A MINHA PRIMEIRA CORRECCAO FOI BLOQUEADA, com razao.
 *
 * A revisao adversarial encontrou nela uma fabricacao NOVA, na direcao que
 * favorece a poupanca: `ollama list`, `ollama ps` e `ollama pull` passavam a
 * contar como execucoes locais. Ou seja, eu ia inflacionar a quota de $0 no
 * proprio PR que existe para deixar de inflacionar numeros.
 *
 * Por isso os testes abaixo estao ordenados por DIRECAO DO ERRO, nao por
 * funcionalidade. Os que fabricam vem primeiro, porque sao os que este ficheiro
 * existe para impedir — e porque um teste que so cobre as invocacoes reais
 * passa a verde com o codigo antigo E com a minha primeira correccao.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectExternalModel, segmentar, nomeBase } = require('./_model-resolver.js');

// ═══════════════════════════ ERROS QUE FABRICAM (inflacionam a poupanca) ═════

test('MENCIONAR um motor nao e INVOCA-LO', () => {
  const fabricados = [
    'which codex 2>/dev/null',
    'where codex 2>&1; echo "---EXIT: $?"',
    'cd "/repo" && git add tools/router/',
    'grep -rn "codex" execution.log',
    'echo "nao uses gemini nem codex"',
    'ls ~/.claude/agents | grep codex',
    'cat notas-sobre-o-aider.md',
    'git commit -m "fix(codex): o adaptador"',
  ];
  for (const cmd of fabricados) {
    assert.equal(detectExternalModel(cmd), null, `"${cmd}" nao invoca motor nenhum`);
  }
});

test('subcomandos do ollama NAO sao execucoes — o bloqueante da revisao', () => {
  // A minha primeira correccao devolvia 'qwen3:30b' para QUALQUER subcomando, e
  // o `bucketFor` conta local como trabalho GRATIS. `onboarding.js:145`,
  // `mooter-doctor.js:264` e `hardware-matcher.js:106` imprimem `ollama pull`
  // para o dono colar no terminal: nao era caso de fronteira, era o normal.
  for (const cmd of ['ollama list', 'ollama ps', 'ollama pull qwen3:30b', 'ollama rm x', 'ollama serve', 'ollama --version']) {
    assert.equal(detectExternalModel(cmd), null, `"${cmd}" nao corre modelo nenhum`);
  }
  // E `run` sem modelo tambem nao: melhor `null` que adivinhar qual.
  assert.equal(detectExternalModel('ollama run'), null);
  assert.equal(detectExternalModel('ollama run --verbose'), null);
});

test('um separador DENTRO de aspas nao cria um segmento fantasma', () => {
  // `echo "a; codex exec b"` partia em dois e o segundo virava codex.
  assert.equal(detectExternalModel('echo "a; codex exec b"'), null);
  assert.equal(detectExternalModel("echo 'x && codex exec y'"), null);
  assert.equal(detectExternalModel('git commit -m "wip | codex exec"'), null);
});

test('um motor nao rouba a flag --model de outro na mesma linha', () => {
  // Lida do comando inteiro, a flag do gemini era colada a chamada do codex.
  assert.equal(detectExternalModel('codex exec "a" ; gemini --model gemini-3-pro "b"'), 'gpt-5-codex');
  assert.equal(detectExternalModel('codex exec "x" && echo --model=falso'), 'gpt-5-codex');
});

// ═══════════════════════ ERROS QUE PERDEM (sub-registam invocacoes reais) ════

test('caminho com ESPACOS continua a ser uma invocacao', () => {
  // `split(/\s+/)` partia `"C:\Program Files\..."` e devolvia null. Espacos em
  // caminhos do Windows sao a norma na maquina do dono, e os meus dois testes
  // de caminho usavam so caminhos sem espaco — davam garantia falsa
  // exactamente no caso que rebentava.
  assert.equal(detectExternalModel('"C:\\Program Files\\codex\\codex.exe" exec x'), 'gpt-5-codex');
  assert.equal(detectExternalModel("'/opt/my tools/codex' exec x"), 'gpt-5-codex');
  assert.equal(nomeBase('C:\\Program Files\\codex\\codex.exe'), 'codex');
});

test('`bash -c "..."` olha para DENTRO do script inline', () => {
  // Shims de CI e scripts encadeados embrulham tudo em `-c`. Cair no
  // interpretador apagava a invocacao do registo.
  assert.equal(detectExternalModel('bash -c "codex exec x"'), 'gpt-5-codex');
  assert.equal(detectExternalModel('sh -c "cd /repo && codex exec x"'), 'gpt-5-codex');
  assert.equal(detectExternalModel('bash -c "echo ola"'), null, 'e nao inventa quando la dentro nao ha motor');
});

test('a flag --model ENTRE ASPAS e lida', () => {
  // `[^\s"']+` rejeitava-a e caia no default cravado — escrevia um id de modelo
  // ESPECIFICO e ERRADO no registo, que e pior que nao escrever nada.
  assert.equal(detectExternalModel('gemini --model "gemini-3-pro" x'), 'gemini-3-pro');
  assert.equal(detectExternalModel('codex --model="gpt-5.6-codex" exec x'), 'gpt-5.6-codex');
});

// ═════════════════════════════════ o que TEM de continuar a contar ═══════════

test('as invocacoes reais continuam a ser detectadas', () => {
  assert.equal(detectExternalModel('codex exec "revê isto"'), 'gpt-5-codex');
  assert.equal(detectExternalModel('codex --model gpt-5.6-codex exec x'), 'gpt-5.6-codex');
  assert.equal(detectExternalModel('gemini --model gemini-3-pro "x"'), 'gemini-3-pro');
  assert.equal(detectExternalModel('aider --model gpt-5 file.py'), 'gpt-5');
  assert.equal(detectExternalModel('ollama run qwen2.5-coder:14b'), 'qwen2.5-coder:14b');
  assert.equal(detectExternalModel('cd /repo && codex exec "x"'), 'gpt-5-codex');
});

test('um script corrido por um interprete conta pelo SCRIPT', () => {
  assert.equal(detectExternalModel('bash ~/.claude/tools/router/ollama_call.sh --text "oi"'), 'qwen3:30b');
  assert.equal(detectExternalModel('sh ./ollama_call.sh --text x'), 'qwen3:30b');
  assert.equal(detectExternalModel('node tools/router/classify.js "usa o codex"'), null);
});

test('prefixos e variaveis de ambiente nao escondem o executavel', () => {
  assert.equal(detectExternalModel('FOO=1 codex exec x'), 'gpt-5-codex');
  assert.equal(detectExternalModel('env BAR=2 codex exec x'), 'gpt-5-codex');
  assert.equal(detectExternalModel('nice codex exec x'), 'gpt-5-codex');
  assert.equal(detectExternalModel('timeout 30 codex exec x'), 'gpt-5-codex');
});

// ════════════════════════════════════════════════════ o tokenizador ══════════

test('segmentar respeita aspas e devolve tokens sem elas', () => {
  assert.deepEqual(segmentar('a b && c'), [['a', 'b'], ['c']]);
  assert.deepEqual(segmentar('echo "a; b"'), [['echo', 'a; b']]);
  assert.deepEqual(segmentar('"/x y/z" arg'), [['/x y/z', 'arg']]);
  assert.deepEqual(segmentar(''), []);
  assert.deepEqual(segmentar(null), []);
});

test('entradas absurdas devolvem exactamente null', () => {
  // `|| null` mascarava um retorno '' ou 0 ou NaN. Sem o `||`, testa mesmo.
  for (const x of [null, undefined, '', 0, {}, [], '   ', '&&', '||', ';;;']) {
    assert.doesNotThrow(() => detectExternalModel(x));
    assert.equal(detectExternalModel(x), null, `entrada ${JSON.stringify(x)}`);
  }
});
