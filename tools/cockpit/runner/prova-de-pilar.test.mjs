/**
 * prova-de-pilar.test.mjs — o metodo #312 aplicado ao P8.
 *
 * O que se tranca aqui NAO e o resultado (esse esta no ledger e no commit); e o
 * METODO: um fixture que se denuncia ensina a resposta, e um veredicto que
 * confunde "achou o defeito" com "achou alguma coisa" nao prova nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PARES, escreverPar, veredicto } from './prova-de-pilar.mjs';

test('o par do P8 tem UM defeito semeado, e ele nao se repete', () => {
  const { semeado, controlo } = PARES.P8;
  const campo = semeado.marcas[0];
  const n = (semeado.texto.match(new RegExp(campo, 'g')) || []).length;
  assert.equal(n, 1, `${campo} tem de aparecer exactamente 1x — 2x seria lido e nao seria defeito`);
  assert.ok(!controlo.texto.includes(campo), 'o controlo nao pode ter o campo semeado');
});

test('TODO par declara o que procura e como se reconhece a resposta', () => {
  for (const [id, par] of Object.entries(PARES)) {
    assert.ok(par.procura, `${id} nao diz o que procura`);
    assert.ok(par.semeado.defeito, `${id} nao descreve o defeito semeado`);
    const n = (par.semeado.marcas || []).length + (par.semeado.linhas || []).length;
    assert.ok(n > 0, `${id} nao tem marca nenhuma — nada distinguiria acertar de falhar`);
  }
});

test('as LINHAS marcadas apontam mesmo para o defeito, em TODO par', () => {
  // Se o fixture crescer uma linha e a marca ficar para tras, o ensaio passa a
  // medir a linha errada e ninguem da por isso.
  const esperado = {
    P9: [/if \(!nome \|\|/, /if \(!rotulo \|\|/],
    P10: [/Confirma no painel da Vercel/],
  };
  for (const [id, padroes] of Object.entries(esperado)) {
    const linhas = PARES[id].semeado.texto.split('\n');
    PARES[id].semeado.linhas.forEach((n, i) => {
      assert.match(linhas[n - 1], padroes[i], `${id}: a linha ${n} nao e o defeito que a marca promete`);
    });
  }
});

test('NENHUM ficheiro de NENHUM par se denuncia como fixture', () => {
  // Um comentario a dizer "aqui esta o defeito" ensina a resposta ao modelo e
  // invalida a prova a favor de quem a corre. O primeiro par teve de ser
  // reescrito por causa disto, e a palavra "ensaio" teve de sair de um controlo.
  for (const [id, par] of Object.entries(PARES)) {
    for (const papel of ['semeado', 'controlo']) {
      const t = par[papel].texto;
      for (const palavra of ['semead', 'defeito', 'ensaio', 'fixture', 'controlo', 'P8', 'P9', 'P10']) {
        assert.ok(!new RegExp(palavra, 'i').test(t), `'${palavra}' aparece no ${papel} do ${id}`);
      }
    }
  }
});

test('no CONTROLO todos os campos escritos sao lidos', () => {
  // Se o controlo tivesse um campo morto, um pilar que funcionasse acusaria os
  // dois ficheiros e o ensaio nao distinguiria nada.
  const t = PARES.P8.controlo.texto;
  for (const campo of ['total', 'soma_util', 'maximo', 'janela_s', 'criado_em']) {
    const n = (t.match(new RegExp(campo, 'g')) || []).length;
    assert.ok(n >= 2, `${campo} aparece ${n}x no controlo — tem de ser escrito E lido`);
  }
});

test('o par cabe numa janela de 70 linhas', () => {
  // O pilar ve UM excerto. Um defeito fora da janela nao e um teste ao pilar,
  // e um teste a sorte da rotacao.
  for (const [id, par] of Object.entries(PARES)) {
    for (const papel of ['semeado', 'controlo']) {
      const n = par[papel].texto.split('\n').length;
      assert.ok(n <= 70, `${id}/${papel} tem ${n} linhas — nao cabe numa janela`);
    }
  }
});

test('escreverPar poe cada par onde AQUELE pilar procura', () => {
  // O P8/P9 procuram em `tools/cockpit/runner/*.mjs`; o P10 procura em
  // `docs/**/*.md`. Escrever o par do P10 num `.mjs` seria um ensaio que o
  // pilar nunca chegaria a ver — e daria "calado" por motivo nenhum.
  const esperado = { P8: /\.mjs$/, P9: /\.mjs$/, P10: /docs\/.*\.md$/ };
  for (const [id, padrao] of Object.entries(esperado)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-'));
    const out = escreverPar(id, dir);
    for (const papel of ['semeado', 'controlo']) {
      assert.match(out[papel].split(path.sep).join('/'), padrao, `${id}/${papel} fora do alcance do pilar`);
    }
  }
});

test('escreverPar poe os dois ficheiros onde o pilar os procura', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prova-'));
  const out = escreverPar('P8', dir);
  for (const papel of ['semeado', 'controlo']) {
    assert.ok(fs.existsSync(out[papel]), `${papel} nao foi escrito`);
    // P8 procura em `tools/cockpit/runner/*.mjs` — fora dai nunca seria visto.
    assert.match(out[papel].split(path.sep).join('/'), /tools\/cockpit\/runner\/.*\.mjs$/);
  }
  assert.equal(fs.readFileSync(out.semeado, 'utf8'), PARES.P8.semeado.texto);
});

test('escreverPar recusa um pilar sem par, em vez de escrever nada em silencio', () => {
  assert.throws(() => escreverPar('P99', os.tmpdir()), /sem par de prova para P99/);
});

test('VEREDICTO · achar o campo semeado e ficar calado no controlo = funciona', () => {
  const v = veredicto({ pilar: 'P8', respostaSemeado: 'tempo_estimado_s na linha 32', respostaControlo: 'NO FINDING' });
  assert.equal(v.estado, 'funciona');
});

test('VEREDICTO · a MESMA resposta nos dois = partido, seja ela qual for', () => {
  // Foi este o resultado real: "NO FINDING" / 4 tokens nos dois ficheiros.
  const v = veredicto({ pilar: 'P8', respostaSemeado: 'NO FINDING', respostaControlo: 'NO FINDING' });
  assert.equal(v.estado, 'partido');
  assert.match(v.porque, /nao discrimina/);
});

test('VEREDICTO · achar OUTRA coisa no semeado nao conta como encontrar', () => {
  // A distincao que salva o metodo: um pilar que acusa ruido no ficheiro
  // semeado nao encontrou o defeito — e sem isto passaria por funcional.
  const v = veredicto({
    pilar: 'P8',
    respostaSemeado: 'WRITTEN LINE 12: VRAM_TOTAL_GB — parece suspeito',
    respostaControlo: 'NO FINDING',
  });
  assert.equal(v.estado, 'partido', 'achar outra coisa nao e achar o defeito');
});

test('VEREDICTO · acusar tambem o controlo = dispara por reflexo', () => {
  const v = veredicto({ pilar: 'P8', respostaSemeado: 'tempo_estimado_s', respostaControlo: 'WRITTEN LINE 30: total' });
  assert.equal(v.estado, 'dispara-por-reflexo');
});
