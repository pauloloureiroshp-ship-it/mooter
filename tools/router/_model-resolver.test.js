/**
 * _model-resolver.test.js — o ficheiro que fabricava 96% das execucoes de motor.
 *
 * MEDIDO a 2026-08-23 no `execution.log` vivo: 279 linhas com
 * `model=gpt-5-codex`, das quais 12 eram invocacoes reais. **267 fabricadas.**
 * Entre elas `which codex`, `where codex` e um `git add`.
 *
 * Nao era um erro de contagem. O `exec-logger.js` nao ANOTA o modelo,
 * SUBSTITUI-O, e o `bucketFor()` manda essas linhas para baldes baratos: cada
 * mencao da palavra "codex" num comando qualquer INFLACIONAVA a poupanca
 * declarada. A propria sessao de auditoria que encontrou isto fabricou ~10
 * execucoes ao pesquisar pelo nome.
 *
 * Por isso os casos negativos aqui em baixo valem mais que os positivos: sao
 * comandos verdadeiros, copiados do log, que NAO podem contar como motor.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectExternalModel, executavel, ehInvocacao } = require('./_model-resolver.js');

// ─────────────────────────────────────────── os que fabricavam (o que importa)

test('MENCIONAR um motor nao e INVOCA-LO', () => {
  const fabricados = [
    'which codex 2>/dev/null',
    'where codex 2>&1; echo "---EXIT: $?"',
    // Copiado do log real; o caminho pessoal foi trocado por um generico —
    // o ratchet do repo publico conta ficheiros com caminhos de casa, e apanhou
    // este. Segunda vez que me apanha a mesma coisa.
    'cd "/repo" && git add tools/router/',
    'grep -rn "codex" execution.log',
    'echo "nao uses gemini nem codex"',
    'ls ~/.claude/agents | grep codex',
    'cat notas-sobre-o-aider.md',
    'git commit -m "fix(codex): o adaptador"',
  ];
  for (const cmd of fabricados) {
    assert.equal(detectExternalModel(cmd), null,
      `"${cmd}" nao invoca motor nenhum e foi contado como um`);
  }
});

test('um comando composto so conta o segmento que E a invocacao', () => {
  // `cd X && codex ...` conta. `cd X && git add` nao, mesmo que a palavra apareca.
  assert.equal(detectExternalModel('cd /repo && codex exec "x"'), 'gpt-5-codex');
  assert.equal(detectExternalModel('cd /repo/codex-notes && git status'), null);
  assert.equal(detectExternalModel('echo codex | wc -l'), null);
});

// ──────────────────────────────────────────────── os que tem de continuar a contar

test('as invocacoes reais continuam a ser detectadas', () => {
  assert.equal(detectExternalModel('codex exec "revê isto"'), 'gpt-5-codex');
  assert.equal(detectExternalModel('codex --model gpt-5.6-codex exec x'), 'gpt-5.6-codex');
  assert.equal(detectExternalModel('gemini --model gemini-3-pro "x"'), 'gemini-3-pro');
  assert.equal(detectExternalModel('aider --model gpt-5 file.py'), 'gpt-5');
  assert.equal(detectExternalModel('ollama run qwen2.5-coder:14b'), 'qwen2.5-coder:14b');
});

test('um script corrido por um interprete conta pelo SCRIPT, nao pelo interprete', () => {
  // `bash .../ollama_call.sh` era detectado por substring; agora e por executavel.
  assert.equal(detectExternalModel('bash ~/.claude/tools/router/ollama_call.sh --text "oi"'), 'qwen3:30b');
  assert.equal(detectExternalModel('sh ./ollama_call.sh --text x'), 'qwen3:30b');
  // Mas um script QUALQUER que apenas mencione o nome nao conta.
  assert.equal(detectExternalModel('node tools/router/classify.js "usa o codex"'), null);
});

test('prefixos e variaveis de ambiente nao escondem o executavel', () => {
  assert.equal(detectExternalModel('FOO=1 codex exec x'), 'gpt-5-codex');
  assert.equal(detectExternalModel('env BAR=2 codex exec x'), 'gpt-5-codex');
  assert.equal(detectExternalModel('nice codex exec x'), 'gpt-5-codex');
});

test('caminho completo e extensao do Windows contam na mesma', () => {
  assert.equal(executavel('C:/Users/p/bin/codex.exe exec x'), 'codex');
  assert.equal(detectExternalModel('"C:\\bin\\codex.cmd" exec x'), 'gpt-5-codex');
});

// ─────────────────────────────────────────────────────── entradas absurdas

test('entradas absurdas devolvem null em vez de rebentar', () => {
  for (const x of [null, undefined, '', 0, {}, [], '   ', '&&', '||']) {
    assert.doesNotThrow(() => detectExternalModel(x));
    assert.equal(detectExternalModel(x) || null, null);
  }
  assert.equal(ehInvocacao('', 'codex'), false);
  assert.equal(executavel(''), null);
});
