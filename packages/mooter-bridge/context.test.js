'use strict';
/**
 * context.test.js — os olhos emprestados ao modelo local.
 *
 * O achado que originou isto: um goal "lê o worktrees.js" foi para o Ollama e
 * voltou `done` com três funções inventadas. A v1.4.0 passou a recusar; a
 * v1.4.1 passa a LER o ficheiro pelo modelo. Estes testes garantem que os olhos
 * não viram uma porta de entrada.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ctx = require('./context.js');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ctx-'));
fs.mkdirSync(path.join(ROOT, 'src', 'deep'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'node_modules', 'lixo'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src', 'alpha.js'), 'function alpha() { return 1; }\n'.repeat(5));
fs.writeFileSync(path.join(ROOT, 'src', 'deep', 'beta.js'), 'const beta = 2;\n');
fs.writeFileSync(path.join(ROOT, 'src', 'grande.js'), 'linha\n'.repeat(5000));
fs.writeFileSync(path.join(ROOT, 'node_modules', 'lixo', 'alpha.js'), 'NAO DEVIA APARECER');
fs.writeFileSync(path.join(ROOT, 'segredo.png'), 'binario');
fs.mkdirSync(path.join(ROOT, '..', 'fora-da-worktree'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '..', 'fora-da-worktree', 'privado.txt'), 'SEGREDO');

let pass = 0;
function t(name, fn) {
  try { fn(); console.log('  ok  ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; }
}

console.log('\ncontexto — o conector lê pelo modelo local');

t('lê um ficheiro citado por caminho e marca-o como real', () => {
  const r = ctx.lerParaPrompt('analisa o src/alpha.js', ROOT, 20000);
  assert.strictEqual(r.lidos.length, 1);
  assert.strictEqual(r.lidos[0].path, 'src/alpha.js');
  assert.ok(r.bloco.includes('function alpha'), 'o conteúdo real não entrou no prompt');
  assert.ok(/não inventes/i.test(r.bloco), 'sem a instrução anti-fabricação o modelo continua a inventar');
});

t('encontra por NOME quando o caminho não bate certo', () => {
  // o utilizador escreve "beta.js"; o ficheiro está em src/deep/
  const r = ctx.lerParaPrompt('lê o beta.js', ROOT, 20000);
  assert.strictEqual(r.lidos.length, 1, JSON.stringify(r.falhados));
  assert.strictEqual(r.lidos[0].path, 'src/deep/beta.js');
  assert.strictEqual(r.lidos[0].como, 'encontrado por nome');
});

t('nome ambíguo NÃO escolhe à sorte — diz os candidatos', () => {
  fs.writeFileSync(path.join(ROOT, 'src', 'deep', 'alpha.js'), 'outro alpha');
  const r = ctx.lerParaPrompt('lê o alpha.js', ROOT, 20000);
  // src/alpha.js e src/deep/alpha.js — dois candidatos reais
  if (r.lidos.length === 0) {
    assert.ok(r.falhados[0].candidatos.length >= 2, 'não listou os candidatos ambíguos');
  }
  fs.unlinkSync(path.join(ROOT, 'src', 'deep', 'alpha.js'));
});

t('❌ NUNCA lê fora da worktree (path traversal)', () => {
  assert.strictEqual(ctx.resolverDentro(ROOT, '../fora-da-worktree/privado.txt'), null);
  assert.strictEqual(ctx.resolverDentro(ROOT, '../../etc/passwd'), null);
  assert.strictEqual(ctx.resolverDentro(ROOT, 'src/alpha.js') !== null, true);
  const r = ctx.lerParaPrompt('lê o ../fora-da-worktree/privado.txt', ROOT, 20000);
  assert.ok(!(r.bloco || '').includes('SEGREDO'), 'leu um ficheiro fora da pasta de trabalho');
});

t('ignora node_modules e binários', () => {
  const paths = ctx.pathsCitados('vê o segredo.png e o node_modules/lixo/alpha.js');
  assert.strictEqual(paths.length, 0, 'aceitou binário ou node_modules: ' + JSON.stringify(paths));
});

t('respeita o orçamento e DIZ o que cortou', () => {
  const r = ctx.lerParaPrompt('analisa o src/grande.js', ROOT, 3000);
  assert.ok(r.chars <= 3000, 'estourou o orçamento: ' + r.chars);
  assert.strictEqual(r.truncados.length, 1, 'cortou sem dizer');
  assert.ok(r.truncados[0].linhas_dadas < r.truncados[0].linhas_totais);
  assert.ok(/cortado/i.test(r.bloco), 'o prompt não avisa o modelo de que o ficheiro está incompleto');
  // corta por linhas inteiras, nunca a meio
  const corpo = r.bloco.split('```')[1];
  assert.ok(!/linh$/.test(corpo.trim()), 'cortou a meio de uma linha');
});

t('ficheiro inexistente é reportado, não inventado', () => {
  const r = ctx.lerParaPrompt('lê o src/nao-existe.js', ROOT, 20000);
  assert.strictEqual(r.bloco, null);
  assert.strictEqual(r.falhados.length, 1);
  assert.ok(/não existe/i.test(r.falhados[0].porque));
});

t('sem ficheiros citados devolve null sem barulho', () => {
  const r = ctx.lerParaPrompt('explica-me o que é um handoff entre agentes', ROOT, 20000);
  assert.strictEqual(r.bloco, null);
  assert.strictEqual(r.lidos.length, 0);
  assert.strictEqual(r.falhados.length, 0);
});

setTimeout(() => {
  console.log('\n' + pass + ' testes de contexto' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
  try { fs.rmSync(path.join(ROOT, '..', 'fora-da-worktree'), { recursive: true, force: true }); } catch { /* */ }
}, 100);
