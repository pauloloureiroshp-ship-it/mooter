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
import { PILLARS } from './context-pack.mjs';
import { SEM_ACHADO_RE } from './evidence-verifier.mjs';

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
    P6: [/89% do trabalho fora da nuvem/],
    P11: [/acima de 100/, /FILA_GRANDE = 200/],
    P7: [/total: recibos\.length/, /todas\.slice\(-MAX_LINHAS\)/],
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
      for (const palavra of ['semead', 'defeito', 'ensaio', 'fixture', 'controlo']) {
        assert.ok(!new RegExp(palavra, 'i').test(t), `'${palavra}' aparece no ${papel} do ${id}`);
      }
      // Os IDs de pilar precisam de limite de palavra: `p95Ms` — um nome de
      // metrica perfeitamente normal — continha "P9" e fazia este teste
      // acusar um controlo que estava limpo.
      for (const pid of ['P6', 'P7', 'P8', 'P9', 'P10', 'P11']) {
        assert.doesNotMatch(t, new RegExp(`\\b${pid}\\b`), `'${pid}' aparece no ${papel} do ${id}`);
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
  const esperado = {
    P8: /\.mjs$/, P9: /\.mjs$/, P10: /docs\/.*\.md$/, P6: /landing\/components\/.*\.tsx$/,
    P7: /tools\/cockpit\/runner\/.*\.mjs$/,
    P11: /packages\/mooter-bridge\/.*\.js$/,
  };
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
  assert.notEqual(v.estado, 'funciona', 'achar outra coisa nao e achar o defeito');
  // `erra-o-alvo` e nao `partido`: ele NAO se calou no semeado, produziu — so
  // que a coisa errada. Sao dois defeitos diferentes e pedem trabalho diferente.
  assert.equal(v.estado, 'erra-o-alvo');
});

test('VEREDICTO · acusar tambem o controlo = dispara por reflexo', () => {
  const v = veredicto({ pilar: 'P8', respostaSemeado: 'tempo_estimado_s', respostaControlo: 'WRITTEN LINE 30: total' });
  assert.equal(v.estado, 'dispara-por-reflexo');
});

test('o par do P6 tem numeros nos DOIS — a diferenca e a origem, nao a ausencia', () => {
  // Um controlo sem numero nenhum tambem daria NO FINDING, mas pela razao
  // errada: o pilar procura numeros SEM origem, nao a ausencia de numeros.
  const { semeado, controlo } = PARES.P6;
  assert.match(controlo.texto, /\{formatPct\(localPct\)\}/, 'o controlo tem de MOSTRAR numeros');
  assert.match(controlo.texto, /TARGET_LOCAL_PCT/, 'e ao menos um vindo de constante importada');
  assert.match(semeado.texto, /\{formatUsd\(savedUsd\)\}/,
    'o semeado tambem tem numeros COM origem — senao o defeito era o unico numero e nao um agulha no palheiro');
  // E o defeito e exactamente um.
  assert.equal((semeado.texto.match(/89%/g) || []).length, 1);
  assert.ok(!controlo.texto.includes('89%'));
});

test('o par do P7 tem slice nos DOIS — a diferenca e o NOME, nao o corte', () => {
  // O pilar procura um nome que promete mais do que entrega. Se o controlo nao
  // tivesse `slice`, um pilar que funcionasse acertava por acidente — bastava
  // procurar a palavra `slice` em vez de comparar nome com producao.
  const { semeado, controlo } = PARES.P7;
  assert.match(semeado.texto, /slice\(-MAX_LINHAS\)/);
  assert.match(controlo.texto, /slice\(-MAX_LINHAS\)/, 'o controlo TEM de ter o mesmo corte');
  // No semeado o nome mente; no controlo os nomes dizem o que sao.
  assert.match(semeado.texto, /total: recibos\.length/);
  assert.match(controlo.texto, /total_no_ficheiro: todos\.length/, 'aqui o total vem da lista INTEIRA');
  assert.match(controlo.texto, /lidos_nesta_janela: recentes\.length/, 'e o cortado diz que e da janela');
  assert.ok(!/\btotal: /.test(controlo.texto), 'o controlo nao pode ter um `total:` nu');
});

// ── o vocabulario das saidas, e os seis estados (2026-08-21) ────────────────

test('VEREDICTO · reconhece a saida HONESTA de cada pilar, nao so NO FINDING', () => {
  // A primeira versao so conhecia `NO FINDING` e por isso reprovou o P3 e o P2 —
  // os dois UNICOS pilares saos de nove — porque eles respondem `THEY MATCH` e
  // `NO SEED EXITS`. Um metodo que nao conhece o vocabulario reprova quem
  // funciona. O `SEM_ACHADO_RE` do evidence-verifier ja enumera todas.
  const v3 = veredicto({
    pilar: 'P3',
    respostaSemeado: 'COMMENT LINE 7 CODE LINE 8 THEY DIVERGE: comment says 30, code does 90',
    respostaControlo: 'COMMENT LINE 7 CODE LINE 8 THEY MATCH',
  });
  assert.equal(v3.estado, 'funciona', '`THEY MATCH` no controlo e a resposta CERTA do P3');

  const v2 = veredicto({
    pilar: 'P2',
    respostaSemeado: 'LINE 28: custo = 0 EXITS AT LINE 31 SEED VISIBLE: LINE 28 -> LINE 31',
    respostaControlo: 'NO SEED EXITS.',
  });
  assert.equal(v2.estado, 'funciona', '`NO SEED EXITS` no controlo e a resposta CERTA do P2');
});

test('VEREDICTO · produzir nos DOIS sem acertar em nenhum tem nome proprio', () => {
  // O pior estado, e o menos obvio: passa por vivo em qualquer contagem de
  // rondas, enche a fila, e o defeito que devia apanhar continua la. Foi o que
  // o P1 e o P5 fizeram — e a versao anterior chamava-lhe "incoerente, rever o
  // fixture", mandando depurar um fixture que estava bom.
  const v = veredicto({
    pilar: 'P1',
    respostaSemeado: 'REPEATED: LINE 13 and LINE 28',      // nao e o repeat semeado (21/28)
    respostaControlo: 'REPEATED: LINE 14 and LINE 29',     // e acusa o controlo limpo
  });
  assert.equal(v.estado, 'falso-em-ambos');
  assert.match(v.porque, /semeado E no controlo/);
});

test('VEREDICTO · acertar no semeado e acusar o controlo continua a ser reflexo', () => {
  const v = veredicto({
    pilar: 'P3',
    respostaSemeado: 'COMMENT LINE 7 CODE LINE 8 THEY DIVERGE',
    respostaControlo: 'COMMENT LINE 3 CODE LINE 9 THEY DIVERGE: inventado',
  });
  assert.equal(v.estado, 'dispara-por-reflexo');
});

test('VEREDICTO · calar-se no controlo mas errar o alvo no semeado nao e "funciona"', () => {
  const v = veredicto({
    pilar: 'P1',
    respostaSemeado: 'REPEATED: LINE 13 and LINE 28',
    respostaControlo: 'EVERY CALL ONCE',
  });
  assert.equal(v.estado, 'erra-o-alvo');
});

test('o par do P11 tem um ENGODO que bate, para o acerto nao ser de borla', () => {
  // O semeado tem DOIS pares mensagem-constante: um que diverge (linha 23 diz
  // 100, linha 6 vale 200) e um que BATE (linha 26 diz 48, linha 7 vale 48).
  // Sem o engodo, o pilar acertava marcando qualquer mensagem com numero.
  const { semeado, controlo } = PARES.P11;
  assert.match(semeado.texto, /acima de 100/);
  assert.match(semeado.texto, /FILA_GRANDE = 200/);
  assert.match(semeado.texto, /mais de 48 horas/, 'o engodo tem de estar la');
  assert.match(semeado.texto, /ESPERA_LONGA_H = 48/, 'e tem de BATER com a mensagem');
  // No controlo, os dois pares batem.
  assert.match(controlo.texto, /acima de 8/);
  assert.match(controlo.texto, /VAZIAS_SEGUIDAS = 8/);
  assert.match(controlo.texto, /dos 35 segundos/);
  assert.match(controlo.texto, /LENTA_S = 35/);
});

test('P11 herda a FORMA do P3, que e a unica que se provou funcionar', () => {
  // Dos nove pilares semeados so o P2 e o P3 passaram, e ambos pedem dois
  // artefactos CONCRETOS visiveis na pagina e comparam valores LITERAIS. O P11
  // foi desenhado por copia dessa forma, nao por intuicao — e passou a primeira.
  const ask = PILLARS.P11.ask;
  assert.match(ask, /^STEP 1 — copy/, 'copiar primeiro, como todos');
  assert.match(ask, /this excerpt/i, 'ancorado no excerto');
  assert.match(ask, /THEY MATCH/, 'a saida honesta tem de ser uma que o verificador conhece');
  assert.match(ask, /THEY DIVERGE/, 'e o achado tem de ter forma fixa');
  assert.ok(SEM_ACHADO_RE.test(ask), 'o `SEM_ACHADO_RE` tem de reconhecer a saida');
});
