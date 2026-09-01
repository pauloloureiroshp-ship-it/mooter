/**
 * enrich.test.mjs — o enriquecedor tem de ser util E tem de nao julgar.
 *
 * Os dois testes que mais interessam aqui sao negativos: (1) o pacote nunca
 * traz um veredicto, nem um score, nem uma pista de juizo (M2 — o instrumento
 * nunca se auto-avalia); (2) sem `ast-grep` instalado, o pacote DIZ que nao
 * fez analise sintatica, em vez de apresentar uma varredura por regex com o
 * nome de outra coisa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  enriquecer, snippet, trace, simboloDaLinha, vizinhosDoSimbolo,
  ferramentaDisponivel, CONTEXTO, MAX_REFS, MAX_CALLERS, REPO,
} = await import('./enrich.mjs');

const SEM_AST = { nome: 'regex', versao: 'interno', ast: false };
const COM_AST = { nome: 'ast-grep', versao: '0.0.0-teste', ast: true };

function bancada(conteudo, nome = 'a.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enr-'));
  fs.writeFileSync(path.join(dir, nome), conteudo);
  return dir;
}

// ── o snippet leva NUMEROS ──────────────────────────────────────────────────

test('o snippet numera as linhas — o alvo directo do balde `linha-errada`', () => {
  const s = snippet('um\ndois\ntres\nquatro\ncinco', 3, { contexto: 1 });
  assert.equal(s.de, 2); assert.equal(s.ate, 4);
  assert.match(s.texto, /^\s+2\s+\| dois$/m);
  assert.match(s.texto, /^\s+3 >\| tres$/m, 'a linha do alvo tem de estar marcada');
});

test('o snippet nao sai do ficheiro nas pontas', () => {
  const s = snippet('um\ndois', 1, { contexto: 50 });
  assert.equal(s.de, 1); assert.equal(s.ate, 2);
  assert.equal(s.total_do_ficheiro, 2);
});

test('o contexto por omissao e generoso mas finito', () => {
  assert.equal(CONTEXTO, 12);
});

// ── o trace ─────────────────────────────────────────────────────────────────

test('o trace sobe pela indentacao ate ao topo', () => {
  const src = ['function fora() {', '  if (x) {', '    const alvo = 1;', '  }', '}'].join('\n');
  const t = trace(src, 3);
  assert.deepEqual(t.map((x) => x.linha), [1, 2]);
  assert.match(t[0].texto, /function fora/);
});

test('o trace ignora fechos e comentarios — nao sao contexto', () => {
  const src = ['function fora() {', '  }', '  // nota', '  const alvo = 1;'].join('\n');
  assert.deepEqual(trace(src, 4).map((x) => x.linha), [1]);
});

// ── o simbolo ───────────────────────────────────────────────────────────────

test('o simbolo nunca e uma palavra da linguagem', () => {
  // `hw` tem 2 caracteres e o limiar sao 3 — um nome de duas letras nao
  // identifica nada num repo com 200 mil linhas. Fica o nome da funcao, que e
  // o que tem defs e callers para ir buscar.
  assert.equal(simboloDaLinha('const hw = readHardware();'), 'readHardware');
  assert.equal(simboloDaLinha('  return null;'), null);
  assert.equal(simboloDaLinha('function runNvidiaSmi() {'), 'runNvidiaSmi');
});

// ── DEGRADACAO DECLARADA ────────────────────────────────────────────────────

test('sem ast-grep, o pacote DIZ que nao houve analise sintatica', () => {
  const v = vizinhosDoSimbolo('foo', { ferramenta: SEM_AST });
  assert.deepEqual(v.defs, []);
  assert.deepEqual(v.callers, []);
  assert.match(v.via, /regex/);
  assert.match(v.via, /nao foi feito/i);
  assert.match(v.aviso, /npm i -g @ast-grep\/cli/, 'tem de dizer como se resolve');
});

test('com ast-grep, o pacote nomeia a ferramenta E a versao', () => {
  const v = vizinhosDoSimbolo('foo', {
    ferramenta: COM_AST,
    execImpl: () => JSON.stringify([{ file: 'a.js', range: { start: { line: 4 } }, lines: 'function foo() {' }]),
  });
  assert.match(v.via, /ast-grep 0\.0\.0-teste/);
  assert.equal(v.defs[0].linha, 5, 'ast-grep conta de 0; aqui conta-se de 1');
});

test('sem simbolo nao se inventa vizinhanca nenhuma', () => {
  const v = vizinhosDoSimbolo(null, { ferramenta: COM_AST, execImpl: () => { throw new Error('nunca'); } });
  assert.deepEqual(v.defs, []); assert.deepEqual(v.refs, []);
});

test('ast-grep a rebentar nao rebenta o pacote — devolve vazio', () => {
  const v = vizinhosDoSimbolo('foo', { ferramenta: COM_AST, execImpl: () => { throw new Error('boom'); } });
  assert.deepEqual(v.defs, []);
});

test('a ferramenta e MEDIDA, nao assumida', () => {
  assert.equal(ferramentaDisponivel({ execImpl: () => { throw new Error('nao ha'); } }).ast, false);
  const f = ferramentaDisponivel({ execImpl: () => 'ast-grep 9.9.9\n' });
  assert.equal(f.ast, true);
  assert.equal(f.versao, '9.9.9', 'o nome nao se repete dentro da versao');
});

// ── o pacote inteiro ────────────────────────────────────────────────────────

test('o pacote traz achado, alvo, snippet e trace', () => {
  const dir = bancada(['function f() {', '  const hw = lerHardware();', '}'].join('\n'));
  const p = enriquecer({ ficheiro: 'a.js', linha: 2, chave: 'X' }, { raiz: dir, ferramenta: SEM_AST });
  assert.equal(p.achado.chave, 'X', 'o achado entra tal e qual, sem reescrita');
  assert.equal(p.alvo.simbolo, 'lerHardware');
  assert.match(p.snippet.texto, /2 >\|/);
  assert.equal(p.trace[0].linha, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('NAO JULGA: nenhum campo do pacote e um veredicto (M2)', () => {
  const dir = bancada('const hw = lerHardware();');
  const p = enriquecer({ ficheiro: 'a.js', linha: 1 }, { raiz: dir, ferramenta: SEM_AST });
  const proibidos = ['veredicto', 'verdict', 'score', 'severidade', 'gravidade', 'bug', 'juizo', 'confianca'];
  const chaves = JSON.stringify(Object.keys(p)).toLowerCase();
  for (const c of proibidos) {
    assert.ok(!chaves.includes(c), `o pacote traz \`${c}\` — deixou de ser so contexto`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('um alvo sem ficheiro:linha diz porque, em vez de adivinhar', () => {
  const p = enriquecer({ ficheiro: null, linha: null }, { ferramenta: SEM_AST });
  assert.equal(p.alvo, null);
  assert.match(p.porque, /nao aponta ficheiro:linha/);
});

test('uma linha para la do fim do ficheiro nao produz snippet inventado', () => {
  const dir = bancada('uma linha');
  const p = enriquecer({ ficheiro: 'a.js', linha: 900 }, { raiz: dir, ferramenta: SEM_AST });
  assert.equal(p.snippet, undefined);
  assert.match(p.porque, /nao existe/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('um caminho que sai do repo nunca chega ao disco', () => {
  const p = enriquecer({ ficheiro: '../../etc/passwd', linha: 1 }, { raiz: '/repo', ferramenta: SEM_AST });
  assert.equal(p.alvo, null);
  assert.match(p.porque, /fora do repo/);
});

test('os tectos existem — um pacote que nao cabe numa janela nao serve', () => {
  assert.ok(MAX_REFS <= 30 && MAX_CALLERS <= 20);
  const muitos = Array.from({ length: 99 }, (_, i) => ({ file: 'a.js', range: { start: { line: i } }, lines: 'x' }));
  const v = vizinhosDoSimbolo('foo', { ferramenta: COM_AST, execImpl: () => JSON.stringify(muitos) });
  assert.equal(v.refs.length, MAX_REFS);
  assert.equal(v.callers.length, MAX_CALLERS);
});

test('contra o repo real: enriquecer um alvo verdadeiro produz contexto verdadeiro', () => {
  const p = enriquecer({ ficheiro: 'tools/cockpit/runner/enrich.mjs', linha: 1 }, { raiz: REPO });
  assert.ok(p.snippet, p.porque);
  assert.match(p.snippet.texto, /1 >\|/);
});
