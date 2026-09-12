/**
 * E2E da varredura do historico — o git a serio, num repositorio a serio.
 *
 * PORQUE E QUE OS TESTES UNITARIOS NAO CHEGAM, E QUEM O DISSE.
 *
 * Os testes de `varredura-historico.test.mjs` injectam o enumerador e o leitor.
 * Isso e o que os torna rapidos e deterministas — e tambem quer dizer que
 * `git rev-list`, `git cat-file --batch`, o `parseBatch` e o CLI **nunca correm
 * juntos**. Um adversario (`codex-cli`, 2026-08-26) apontou-o como a objeccao
 * mais afiada do lote: *"os testes passariam com o git partido"*.
 *
 * Este ficheiro fecha isso pelo unico caminho que fecha mesmo: cria um
 * repositorio git de verdade, commita um segredo, **apaga-o**, e corre o
 * BINARIO como o CI o correria. Se a ferramenta devolver `0`, falha.
 *
 * ── O SEGREDO E MONTADO EM TEMPO DE EXECUCAO, DE PROPOSITO ──────────────────
 *
 * Se o literal `AKIA...` estivesse escrito aqui, este ficheiro passava a ser um
 * sitio onde ha uma chave com forma valida — e a proxima corrida da varredura
 * sobre ESTE repo apanhava-o como HIGH. O teste que prova que o detector
 * funciona nao pode ser a razao pela qual o detector grita.
 *
 * Aconteceu exactamente isso na corrida de 2026-08-26 com um placeholder citado
 * num relatorio: a varredura, mal passou a ler mensagens de commit, apanhou
 * quatro copias novas dele — no relatorio, na allowlist, e na mensagem do commit
 * que fazia as duas coisas. Um documento sobre segredos que cita o segredo passa
 * a ser um sitio onde o segredo esta.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FERRAMENTA = path.join(AQUI, 'varredura-historico.mjs');

/** Montado por pedacos: o literal completo nunca existe neste ficheiro. */
const AKIA_FALSO = 'AKIA' + 'Q7' + 'XZ' + 'M4' + 'RT' + 'K9' + 'PL' + '2W' + 'B6' + 'YN';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

function repoTemporario() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varredura-e2e-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'e2e@exemplo.invalid');
  git(dir, 'config', 'user.name', 'e2e');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

function correr(dir, ...args) {
  try {
    const out = execFileSync(process.execPath, [FERRAMENTA, '--repo', dir, ...args], {
      encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

function limpar(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* o SO que trate */ }
}

test('E2E: um segredo commitado e DEPOIS APAGADO continua a ser encontrado, e o exit e 1', () => {
  const dir = repoTemporario();
  try {
    // commit 1 — o segredo entra
    fs.writeFileSync(path.join(dir, 'config.js'), `const key = '${AKIA_FALSO}';\nmodule.exports = { key };\n`);
    git(dir, 'add', 'config.js');
    git(dir, 'commit', '-q', '-m', 'entra o config');

    // commit 2 — o segredo sai da arvore
    fs.writeFileSync(path.join(dir, 'config.js'), 'const key = process.env.AWS_KEY;\nmodule.exports = { key };\n');
    git(dir, 'add', 'config.js');
    git(dir, 'commit', '-q', '-m', 'tira a chave do codigo');

    // A arvore de HEAD esta limpa — e este e o ponto todo.
    const emHead = fs.readFileSync(path.join(dir, 'config.js'), 'utf8');
    assert.ok(!emHead.includes(AKIA_FALSO), 'pre-condicao: HEAD nao pode ter o segredo');

    const r = correr(dir, '--refs', 'all');
    assert.equal(r.code, 1, `esperava exit 1, veio ${r.code}. Saida:\n${r.out.slice(0, 800)}`);
    assert.match(r.out, /\[HIGH\]/);
    assert.match(r.out, /aws-access-key/);
  } finally {
    limpar(dir);
  }
});

test('E2E: um segredo numa MENSAGEM DE COMMIT e encontrado — o ficheiro nunca o teve', () => {
  const dir = repoTemporario();
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'nada de especial\n');
    git(dir, 'add', 'a.txt');
    git(dir, 'commit', '-q', '-m', `usei ${AKIA_FALSO} para o upload, corrigir depois`);

    const r = correr(dir, '--refs', 'all');
    assert.equal(r.code, 1, `esperava exit 1, veio ${r.code}. Saida:\n${r.out.slice(0, 800)}`);
    assert.match(r.out, /mensagem de commit/);
  } finally {
    limpar(dir);
  }
});

test('E2E: um repositorio mesmo limpo devolve exit 0 — o guarda nao grita por tudo', () => {
  const dir = repoTemporario();
  try {
    fs.writeFileSync(path.join(dir, 'a.js'), 'export const x = 1;\n');
    git(dir, 'add', 'a.js');
    git(dir, 'commit', '-q', '-m', 'primeiro commit, sem nada la dentro');

    const r = correr(dir, '--refs', 'all');
    assert.equal(r.code, 0, `esperava exit 0, veio ${r.code}. Saida:\n${r.out.slice(0, 800)}`);
    assert.match(r.out, /HIGH 0/);
  } finally {
    limpar(dir);
  }
});

test('E2E: um clone SHALLOW nao devolve "limpo" — devolve erro', () => {
  const origem = repoTemporario();
  let clone = null;
  try {
    fs.writeFileSync(path.join(origem, 'config.js'), `const key = '${AKIA_FALSO}';\n`);
    git(origem, 'add', 'config.js');
    git(origem, 'commit', '-q', '-m', 'um');
    fs.writeFileSync(path.join(origem, 'config.js'), 'const key = process.env.AWS_KEY;\n');
    git(origem, 'add', 'config.js');
    git(origem, 'commit', '-q', '-m', 'dois');

    clone = fs.mkdtempSync(path.join(os.tmpdir(), 'varredura-e2e-shallow-'));
    fs.rmSync(clone, { recursive: true, force: true });
    execFileSync('git', ['clone', '-q', '--depth', '1', 'file://' + origem.replace(/\\/g, '/'), clone], {
      encoding: 'utf8', windowsHide: true,
    });

    const r = correr(clone, '--refs', 'all');
    assert.equal(r.code, 2, `um shallow tem de FALHAR, nao devolver limpo. veio ${r.code}:\n${r.out.slice(0, 500)}`);
    assert.match(r.out, /SHALLOW/);
    // Cuidado: a propria mensagem de erro CONTEM a frase 'HIGH 0' (a citar o que
    // seria a mentira). O que nao pode aparecer e a LINHA DE RESUMO da varredura.
    const LINHA_DE_RESUMO = /^HIGH \d+ · LOW/m;
    // O regex tem de ser provado antes de ser confiado: uma versao anterior
    // perdeu a barra do `\d` e passou a ser `/^HIGH d+ · LOW/`, que nunca casa
    // com nada. O teste continuou verde — pela razao errada, que e a unica
    // maneira de um teste ser pior do que teste nenhum.
    assert.ok(LINHA_DE_RESUMO.test('HIGH 0 · LOW 3 · INFO 1'), 'o regex tem de casar com um resumo a serio');
    assert.ok(!LINHA_DE_RESUMO.test(r.out), 'um shallow nunca pode imprimir a linha de resumo');
  } finally {
    limpar(origem);
    if (clone) limpar(clone);
  }
});

test('E2E: `--refs origin` num repositorio SEM remoto nao devolve "limpo" — devolve erro', () => {
  const dir = repoTemporario();
  try {
    fs.writeFileSync(path.join(dir, 'config.js'), `const key = '${AKIA_FALSO}';\n`);
    git(dir, 'add', 'config.js');
    git(dir, 'commit', '-q', '-m', 'um');

    const r = correr(dir, '--refs', 'origin');
    assert.equal(r.code, 2, `sem remoto, "origin" nao tem nada — e isso nao e limpo. veio ${r.code}`);
    assert.match(r.out, /nao havia historico para ler|nenhum objecto alcancavel/);
  } finally {
    limpar(dir);
  }
});

test('E2E: `--refs todos` ve um segredo que ficou SOLTO por um reset', () => {
  const dir = repoTemporario();
  try {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'inicial\n');
    git(dir, 'add', 'a.txt');
    git(dir, 'commit', '-q', '-m', 'base');

    // O segredo entra e o commit e reescrito: o blob fica solto, alcancavel por
    // ninguem — e `--all` deixa de o ver.
    fs.writeFileSync(path.join(dir, 'segredo.js'), `const k = '${AKIA_FALSO}';\n`);
    git(dir, 'add', 'segredo.js');
    git(dir, 'commit', '-q', '-m', 'ups');
    // `reset --hard` sobre um repositorio TEMPORARIO: e o gesto que torna o
    // commit e o blob inalcancaveis sem os apagar da base de objectos, que e
    // exactamente o estado que `--refs todos` existe para ver.
    git(dir, 'reset', '--hard', '-q', 'HEAD~1');

    const all = correr(dir, '--refs', 'all');
    const todos = correr(dir, '--refs', 'todos');
    assert.equal(all.code, 0, '`all` nao alcanca o objecto solto — e essa e a diferenca que interessa');
    assert.equal(todos.code, 1, `\`todos\` tem de ver o objecto solto. veio ${todos.code}:\n${todos.out.slice(0, 500)}`);
  } finally {
    limpar(dir);
  }
});
