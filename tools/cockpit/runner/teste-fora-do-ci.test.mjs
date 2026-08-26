/**
 * Testes da catraca dos testes fora do CI.
 *
 * O teste que importa e o de MORDIDA: um guarda que nunca falhou e
 * indistinguivel de um guarda partido. A primeira versao deste guarda deu
 * VERDE quando lhe pusemos um ficheiro de teste novo a frente — `git ls-files`
 * so ve o que ja esta no indice do git, e o ficheiro ainda nao estava
 * commitado. Foi um teste de mordida que apanhou isso, nao uma revisao.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { comparar, verificar, escreverLinhaBase, lerLinhaBase } from './teste-fora-do-ci.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const GUARDA = path.join(AQUI, 'teste-fora-do-ci.mjs');

// ── a comparacao ────────────────────────────────────────────────────────────

test('a catraca aperta nos DOIS sentidos', () => {
  const r = comparar(['a.test.js', 'novo.test.js'], ['a.test.js', 'ja-resolvido.test.js']);
  assert.deepEqual(r.novos, ['novo.test.js'], 'um orfao novo e uma regressao a acontecer agora');
  assert.deepEqual(r.resolvidos, ['ja-resolvido.test.js'], 'um orfao que passou a coberto e trabalho que a linha de base ainda nao reconheceu');
});

test('sem mudanca nenhuma, nao ha nem novos nem resolvidos', () => {
  const r = comparar(['a.test.js'], ['a.test.js']);
  assert.deepEqual(r.novos, []);
  assert.deepEqual(r.resolvidos, []);
});

// ── o veredicto ─────────────────────────────────────────────────────────────

function gateadosFalso({ num, den, orfaos }) {
  return () => ({ id: 'testes_gateados', peso: 2, num, den, valor: num / den, pontos: 0, orfaos });
}

test('um orfao NOVO faz falhar com codigo 1 e nomeia o ficheiro', () => {
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 1, den: 2, orfaos: ['a.test.js', 'novo.test.js'] }),
    linhaBaseImpl: () => ({ presente: true, orfaos: ['a.test.js'] }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 1);
  assert.deepEqual(r.novos, ['novo.test.js']);
});

test('um orfao RESOLVIDO tambem faz falhar — a catraca tem de apertar', () => {
  // Sem isto, a linha de base ficava eternamente no numero mais alto que
  // alguma vez teve, e passava a proteger o numero em vez do repositorio.
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 2, den: 2, orfaos: [] }),
    linhaBaseImpl: () => ({ presente: true, orfaos: ['a.test.js'] }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 1);
  assert.deepEqual(r.resolvidos, ['a.test.js']);
});

test('SEM linha de base o guarda NAO passa em silencio', () => {
  // Passar seria dizer "esta tudo bem" sobre uma pergunta que nunca foi feita.
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 1, den: 2, orfaos: ['a.test.js'] }),
    linhaBaseImpl: () => ({ presente: false, orfaos: [] }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 2);
  assert.match(r.porque, /sem linha de base/);
});

test('se a MEDICAO falhar, o guarda devolve 2 — nunca um verde por nao ter conseguido olhar', () => {
  const r = verificar({
    gateadosImpl: () => ({ id: 'testes_gateados', valor: null, porque: 'git ls-files falhou: not a repo' }),
  });
  assert.equal(r.codigo, 2);
  assert.match(r.porque, /nao foi possivel medir/);
});

test('o guarda pede a lista com os ficheiros NAO versionados incluidos', () => {
  // Sem isto morde tarde: so depois do commit, quando corrigir ja custa mais.
  let opts = null;
  verificar({
    gateadosImpl: (o) => { opts = o; return { valor: 1, num: 1, den: 1, orfaos: [] }; },
    linhaBaseImpl: () => ({ presente: true, orfaos: [] }),
  });
  assert.equal(opts.incluirNaoVersionados, true);
});

// ── a linha de base ─────────────────────────────────────────────────────────

test('a linha de base grava-se ORDENADA e leva o aviso de que regravar mata a catraca', () => {
  let escrito = null;
  const j = escreverLinhaBase({ total: 3, orfaos: ['z.test.js', 'a.test.js'] }, { writeImpl: (_p, c) => { escrito = c; } });
  assert.deepEqual(j.orfaos, ['a.test.js', 'z.test.js']);
  assert.match(escrito, /Regravar isto para calar um vermelho/);
});

test('linha de base ilegivel = ausente, e ausente nao passa', () => {
  const r = lerLinhaBase({ readImpl: () => '{ nao e json' });
  assert.equal(r.presente, false);
});

// ── MORDIDA: o guarda a serio, contra o repositorio a serio ─────────────────

test('MORDIDA: um ficheiro de teste novo na arvore faz o guarda falhar com codigo 1', () => {
  const alvo = path.join(AQUI, 'zz-prova-da-mordida.test.mjs');
  // Nome com `zz-` para nao colidir com nada, e apagado no `finally` mesmo que
  // o assert rebente — um teste que deixa lixo na arvore parte o proximo.
  try {
    fs.writeFileSync(alvo, "import test from 'node:test';\ntest('so existe para a catraca morder', () => {});\n");
    let codigo = 0;
    try {
      execFileSync(process.execPath, [GUARDA], { encoding: 'utf8', windowsHide: true });
    } catch (e) {
      codigo = e.status;
    }
    assert.equal(codigo, 1, 'o guarda TEM de falhar com um teste orfao novo na arvore');
  } finally {
    try { fs.rmSync(alvo, { force: true }); } catch { /* o SO que trate */ }
  }
});

test('MORDIDA ao contrario: com a arvore limpa, o guarda passa', () => {
  // O par do teste acima. Um guarda que falha SEMPRE tambem nao serve de nada,
  // e seria indistinguivel de um guarda que morde por acidente.
  const r = execFileSync(process.execPath, [GUARDA], { encoding: 'utf8', windowsHide: true });
  assert.match(r, /a catraca aguenta/);
});
