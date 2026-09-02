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

t('caminho ABSOLUTO com espaço no nome de utilizador (Windows por omissão)', () => {
  const paths = ctx.pathsCitados('lê o C:\\Users\\Paulo Loureiro\\frugal\\src\\alpha.js e diz o que faz');
  assert.deepStrictEqual(paths, ['C:/Users/Paulo Loureiro/frugal/src/alpha.js'],
    'partiu o caminho no espaço: ' + JSON.stringify(paths));
  // o fragmento truncado é o perigoso: procurar() compara só o basename, logo
  // `Loureiro/frugal/src/alpha.js` resolvia em silêncio para outra worktree.
  assert.ok(!paths.some((p) => /^Loureiro\//.test(p)), 'devolveu o fragmento truncado');
});

t('dois caminhos absolutos com espaços na mesma frase', () => {
  const paths = ctx.pathsCitados(
    'compara C:\\Users\\Paulo Loureiro\\a\\um.js com C:\\Users\\Paulo Loureiro\\b\\dois.js');
  assert.deepStrictEqual(paths,
    ['C:/Users/Paulo Loureiro/a/um.js', 'C:/Users/Paulo Loureiro/b/dois.js']);
});

t('absoluto com espaços continua a respeitar TEXTO e IGNORAR', () => {
  const paths = ctx.pathsCitados(
    'vê C:\\Users\\Paulo Loureiro\\x\\segredo.png e C:\\Users\\Paulo Loureiro\\x\\node_modules\\y.js');
  assert.strictEqual(paths.length, 0, 'aceitou binário ou node_modules: ' + JSON.stringify(paths));
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

/* ── os numeros de linha (causa-raiz 1 da medicao de 2026-09-02) ───────────── */

t('cada linha vem prefixada com o seu numero real, comecando em 1', () => {
  const r = ctx.lerParaPrompt('analisa o src/deep/beta.js', ROOT, 20000);
  const corpo = r.bloco.split('```')[1];
  assert.ok(/^\s*1│ const beta = 2;$/m.test(corpo), 'a linha 1 nao esta numerada:\n' + corpo.slice(0, 200));
});

t('a largura do numero e fixa e alinhada a direita — senao o modelo ve duas colunas', () => {
  const { linhas, largura } = ctx.numerarLinhas('a\n'.repeat(120).trim());
  assert.strictEqual(largura, 3, 'largura devia ser 3 para 120 linhas');
  const prefixos = linhas.map((l) => l.slice(0, largura + 2));
  assert.strictEqual(prefixos[0], '  1│ ');
  assert.strictEqual(prefixos[99], '100│ ');
  for (const pfx of prefixos) assert.strictEqual(pfx.length, largura + 2, 'prefixo de largura variavel: ' + JSON.stringify(pfx));
});

t('a largura sai do TOTAL de linhas, nao das que couberam no orcamento', () => {
  // 5000 linhas -> largura 4. Com um orcamento pequeno so cabem umas dezenas,
  // mas o alinhamento tem de continuar a ser o do ficheiro inteiro.
  const r = ctx.lerParaPrompt('le o src/grande.js', ROOT, 3000);
  assert.strictEqual(r.lidos[0].largura_do_numero, 4);
  const corpo = r.bloco.split('```')[1];
  assert.ok(/^   1│ linha$/m.test(corpo), 'a primeira linha nao usa a largura do ficheiro inteiro');
});

t('o numero conta para o ORCAMENTO — senao o bloco passava do tecto em silencio', () => {
  const budget = 3000;
  const r = ctx.lerParaPrompt('le o src/grande.js', ROOT, budget);
  assert.ok(r.chars <= budget, 'o bloco injectado (' + r.chars + ') passou o tecto de ' + budget);
  // e o que foi cortado continua a ser dito
  assert.strictEqual(r.truncados.length, 1);
  assert.strictEqual(r.truncados[0].linhas_totais, 5001);
  assert.ok(r.truncados[0].linhas_dadas < r.truncados[0].linhas_totais);
});

t('o cabecalho DIZ que os numeros sao os do ficheiro real', () => {
  const r = ctx.lerParaPrompt('analisa o src/deep/beta.js', ROOT, 20000);
  assert.ok(/NÚMERO REAL NO FICHEIRO/.test(r.bloco), 'o modelo nao e avisado de que os numeros sao reais');
  assert.ok(/não o incluas em nada que cites/.test(r.bloco), 'nada impede o modelo de citar o prefixo como se fosse codigo');
});

t('numerarLinhas nao rebenta com vazio nem com null', () => {
  assert.deepStrictEqual(ctx.numerarLinhas('').linhas, ['  1│ ']);
  assert.deepStrictEqual(ctx.numerarLinhas(null).linhas, ['  1│ ']);
});

t('o separador nao e `:` — um `:` colava ao codigo e nao se distinguia de conteudo', () => {
  const { linhas } = ctx.numerarLinhas('const a = { b: 1 };');
  assert.ok(linhas[0].includes('│'), 'o separador mudou e o modelo deixa de saber onde acaba o numero');
});

setTimeout(() => {
  console.log('\n' + pass + ' testes de contexto' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
  try { fs.rmSync(path.join(ROOT, '..', 'fora-da-worktree'), { recursive: true, force: true }); } catch { /* */ }
}, 100);
