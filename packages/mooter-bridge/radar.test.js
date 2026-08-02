'use strict';

/**
 * radar.test.js — o Setup Radar.
 *
 * O teste que interessa é o primeiro: **não escreveu nada**. Tudo o resto é conforto; essa é a
 * promessa que se faz a um estranho quando se lhe pede para apontar isto ao repositório dele.
 * A prova não é a leitura do código — é uma impressão digital da árvore (caminho + tamanho +
 * mtime + inode) antes e depois, comparada byte a byte.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { radar } = require('./radar.js');

/** Cria um repo de mentira, com o que se lhe mandar. Devolve a raiz. */
function repoFalso(nome, ficheiros) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-' + nome + '-'));
  for (const [rel, conteudo] of Object.entries(ficheiros || {})) {
    const p = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (conteudo === '<dir>') fs.mkdirSync(p, { recursive: true });
    else fs.writeFileSync(p, conteudo, 'utf8');
  }
  return raiz;
}

/** Impressão digital recursiva: caminho + tamanho + mtime + inode. */
function impressao(raiz) {
  const out = [];
  (function anda(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const st = fs.statSync(p);
      out.push([path.relative(raiz, p), st.size, st.mtimeMs, st.ino].join('|'));
      if (e.isDirectory()) anda(p);
    }
  })(raiz);
  return out.join('\n');
}

test('radar · NÃO escreve nada no repositório-alvo — a promessa que se faz ao estranho', () => {
  const raiz = repoFalso('sem-escrita', {
    'AGENTS.md': '# instruções\n'.repeat(40),
    'README.md': '# projecto',
    '.gitignore': 'node_modules\n.env\n',
    '.env': 'SEGREDO=nao-me-leias',
    'src/index.js': 'module.exports = 1;',
    'src/index.test.js': 'require("node:test");',
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/config': '[remote "origin"]\n\turl = git@exemplo:x/y.git\n',
    '.claude/skills/uma/SKILL.md': '# skill',
    'MEMORY.md': '# decisões',
    '.github/workflows/ci.yml': 'name: ci',
  });
  const antes = impressao(raiz);
  const r = radar(raiz);
  const depois = impressao(raiz);
  assert.strictEqual(depois, antes, 'o radar mexeu na árvore do repositório-alvo');
  assert.strictEqual(r.escreveu, false, 'o relatório tem de declarar que não escreveu');
  assert.strictEqual(r.ok, true);
});

test('radar · o .env é detectado sem NUNCA ser lido', () => {
  const SEGREDO = 'CHAVE_MUITO_SECRETA=abc123xyz789';
  const raiz = repoFalso('env', {
    '.env': SEGREDO,
    '.gitignore': 'node_modules\n',   // .env NÃO coberto — tem de dar aviso
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/config': '',
  });
  const r = radar(raiz);
  const serializado = JSON.stringify(r);
  assert.ok(!serializado.includes('abc123xyz789'), 'o valor do .env vazou para o relatório');
  assert.ok(!serializado.includes('CHAVE_MUITO_SECRETA'), 'o nome da variável do .env vazou');
  const git = r.pilares.find((p) => p.pilar === 'Git');
  assert.ok(git.achados.some((a) => a.item === 'ficheiros .env'), 'o .env não foi sequer detectado');
  assert.ok(git.notas.some((n) => /gitignore/.test(n)), '.env fora do .gitignore tinha de gerar aviso');
});

test('radar · .env coberto pelo .gitignore não gera alarme falso', () => {
  const raiz = repoFalso('env-ok', {
    '.env': 'X=1',
    '.gitignore': '.env\nnode_modules\n',
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/config': '',
  });
  const git = radar(raiz).pilares.find((p) => p.pilar === 'Git');
  assert.strictEqual(git.notas.length, 0, 'não devia haver aviso com o .env já ignorado: ' + git.notas.join(' / '));
});

test('radar · repo vazio dá 0/6 e diz o que fazer primeiro — sem inventar nota', () => {
  const raiz = repoFalso('vazio', { 'a.txt': 'nada' });
  const r = radar(raiz);
  assert.strictEqual(r.pontuacao.presentes, 0, 'repo vazio não pode ter pilares presentes');
  assert.strictEqual(r.pontuacao.total_pilares, 6);
  assert.ok(r.proximos_passos.length > 0 && r.proximos_passos.length <= 3, 'tem de propor entre 1 e 3 passos');
  for (const p of r.proximos_passos) assert.ok(p.o_que && p.o_que.length > 10, 'passo vago: ' + JSON.stringify(p));
  assert.match(r.pontuacao.denominador, /presença/, 'o denominador tem de declarar que não é nota de qualidade');
});

test('radar · repo bem montado reconhece os pilares e para de propor passos', () => {
  const raiz = repoFalso('completo', {
    'AGENTS.md': '# instruções\n'.repeat(40),
    'CLAUDE.md': '# claude\n'.repeat(40),
    'MEMORY.md': '# decisões',
    'LOOP.md': '# loop',
    'README.md': '# r',
    '.gitignore': 'node_modules',
    'src/a.test.js': 'x',
    '.claude/skills/uma/SKILL.md': '# s',
    '.claude/commands/cmd.md': '# c',
    '.github/workflows/ci.yml': 'name: ci',
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/config': '[remote "origin"]\n\turl = x\n',
  });
  const r = radar(raiz);
  assert.strictEqual(r.pontuacao.presentes, 6, 'repo completo devia ter os 6 pilares: '
    + r.pilares.map((p) => p.pilar + '=' + p.estado).join(', '));
  assert.strictEqual(r.proximos_passos.length, 0, 'não há nada a propor a um repo completo');
});

test('radar · a qualidade das instruções sai n/d — o radar não julga conteúdo', () => {
  const raiz = repoFalso('qualidade', { 'AGENTS.md': 'x'.repeat(5000) });
  const inst = radar(raiz).pilares.find((p) => p.pilar === 'Instruções para agentes');
  assert.match(inst.qualidade, /n\/d/, 'o radar não pode fingir que avalia o conteúdo');
});

test('radar · instruções-placeholder são apanhadas pelo tamanho, não por opinião', () => {
  const raiz = repoFalso('placeholder', { 'CLAUDE.md': '# TODO' });
  const inst = radar(raiz).pilares.find((p) => p.pilar === 'Instruções para agentes');
  assert.strictEqual(inst.estado, 'presente', 'existe, portanto está presente');
  assert.ok(inst.notas.some((n) => /placeholder/.test(n)), 'um ficheiro de 6 bytes tinha de levantar a nota');
});

test('radar · sem git avisa que não há rede de segurança', () => {
  const raiz = repoFalso('sem-git', { 'README.md': '# r' });
  const git = radar(raiz).pilares.find((p) => p.pilar === 'Git');
  assert.strictEqual(git.estado, 'ausente');
  assert.match(git.proximo_passo, /git init/);
});

test('radar · git sem remoto é dito sem dramatizar', () => {
  const raiz = repoFalso('sem-remoto', { '.git/HEAD': 'ref: refs/heads/main\n', '.git/config': '[core]\n' });
  const git = radar(raiz).pilares.find((p) => p.pilar === 'Git');
  assert.strictEqual(git.estado, 'presente');
  assert.ok(git.achados.some((a) => a.item === 'remoto' && /nenhum/.test(a.valor)));
  assert.match(git.proximo_passo, /remoto/);
});

test('radar · a execução dos loops sai n/d — o disco não sabe se o CI correu', () => {
  const raiz = repoFalso('loops', { '.github/workflows/ci.yml': 'name: ci' });
  const loops = radar(raiz).pilares.find((p) => p.pilar === 'Loops automáticos');
  assert.strictEqual(loops.estado, 'presente');
  assert.match(loops.execucao, /n\/d/, 'saber se o loop CORREU exige o histórico do CI — não se finge');
});

test('radar · caminho inexistente devolve erro legível, não excepção', () => {
  const r = radar(path.join(os.tmpdir(), 'nao-existe-mesmo-' + process.pid));
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /não existe/);
});

test('radar · um ficheiro em vez de uma pasta devolve erro legível', () => {
  const f = path.join(os.tmpdir(), 'radar-ficheiro-' + process.pid + '.txt');
  fs.writeFileSync(f, 'x', 'utf8');
  try {
    const r = radar(f);
    assert.strictEqual(r.ok, false);
    assert.match(r.erro, /não é uma pasta/);
  } finally { try { fs.unlinkSync(f); } catch { /* */ } }
});

test('radar · node_modules não entra na contagem — senão o número não diz nada', () => {
  const raiz = repoFalso('nm', { 'src/a.js': 'x' });
  fs.mkdirSync(path.join(raiz, 'node_modules', 'pacote'), { recursive: true });
  for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(raiz, 'node_modules', 'pacote', 'f' + i + '.js'), 'x', 'utf8');
  const r = radar(raiz);
  assert.ok(r.varrimento.ficheiros < 10, 'node_modules entrou na contagem: ' + r.varrimento.ficheiros);
});

test('radar · repo grande trunca e DIZ que truncou', () => {
  const raiz = repoFalso('grande', {});
  fs.mkdirSync(path.join(raiz, 'muitos'), { recursive: true });
  for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(raiz, 'muitos', 'f' + i + '.js'), 'x', 'utf8');
  const r = radar(raiz, { maxFicheiros: 10 });
  assert.strictEqual(r.varrimento.truncado, true, 'com tecto de 10 ficheiros tinha de truncar');
  const est = r.pilares.find((p) => p.pilar === 'Estrutura');
  assert.ok(est.notas.some((n) => /trunc/i.test(n)), 'truncar sem dizer é publicar um número que finge ser total');
});

test('radar · não pede testes a um repositório que não tem código', () => {
  // Apanhado a correr contra um vault Obsidian real: exigir testes a um repo de notas é
  // conselho absurdo, e o conselho absurdo é o que queima a credibilidade ao primeiro estranho.
  const notas = repoFalso('vault', {
    'nota-1.md': '# a', 'nota-2.md': '# b', 'nota-3.md': '# c',
    '.git/HEAD': 'ref: refs/heads/main\n', '.git/config': '',
  });
  const est = radar(notas).pilares.find((p) => p.pilar === 'Estrutura');
  const testes = est.achados.find((a) => a.item === 'testes');
  assert.strictEqual(testes.presente, null, 'testes num repo de notas tem de ser n/d, não vermelho');
  assert.match(testes.detalhe, /n\/d/);
  assert.strictEqual(est.proximo_passo, null, 'não se propõe testes a quem não tem código');
  assert.strictEqual(est.parece_codigo, false);
});

test('radar · pede testes a um repositório que TEM código e não os tem', () => {
  const codigo = repoFalso('codigo', {
    'src/a.js': 'x', 'src/b.js': 'y', 'src/c.ts': 'z', 'src/d.py': 'w',
    'README.md': '# r', '.gitignore': 'node_modules',
  });
  const est = radar(codigo).pilares.find((p) => p.pilar === 'Estrutura');
  const testes = est.achados.find((a) => a.item === 'testes');
  assert.strictEqual(est.parece_codigo, true, 'quatro ficheiros de código deviam bastar');
  assert.strictEqual(testes.presente, false);
  assert.match(est.proximo_passo, /teste/);
});

test('radar · o resumo declara em texto que não escreveu', () => {
  const raiz = repoFalso('resumo', { 'README.md': '# r' });
  assert.match(radar(raiz).resumo, /só leitura/, 'quem lê o resumo tem de ver a promessa, não só quem lê o JSON');
});
