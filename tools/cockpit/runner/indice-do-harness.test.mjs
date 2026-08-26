/**
 * Testes do indice do arnes.
 *
 * O que estes testes protegem nao e a aritmetica — e a HONESTIDADE do numero.
 * Um indice destes falha de duas maneiras, e as duas produzem um relatorio de
 * aspecto normal:
 *
 *   · uma parcela que nao se conseguiu medir vale 100% por omissao — o indice
 *     sobe por ausencia de dados, que e o contrario do que devia acontecer;
 *   · o denominador esconde alguma coisa — um limiar que nao esta no registo,
 *     um pacote que nao esta na lista — e a percentagem sobe sem nada melhorar.
 *
 * Quase todos os testes aqui sao sobre isso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parcela, indice, PESOS, TOTAL_PESOS,
  testesGateados, recibosDeCenso, veredictosPublicados, devicesNoMesmoSha,
  coberturaDeTelemetria, higieneDePrs, limiaresMedidos, limiaresNoCodigo,
  escreverInstantaneo, lerInstantaneo, IDADE_MAX_S, SUFIXOS_DE_LIMIAR, calcular,
} from './indice-do-harness.mjs';

// ── a regra-mae ─────────────────────────────────────────────────────────────

test('uma parcela que NAO se consegue medir vale zero, nunca 100% por omissao', () => {
  const p = parcela('testes_gateados', { porque: 'git nao respondeu' });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /git/);
});

test('denominador zero nao e divisao por zero nem 100% — e nao medido', () => {
  const p = parcela('higiene_de_prs', { num: 0, den: 0, porque: 'zero PRs abertos' });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
});

test('o indice diz quanto PESO ficou por medir — um 10/10 com metade por medir nao existe', () => {
  const r = indice([
    parcela('testes_gateados', { num: 10, den: 10 }),
    parcela('recibos_de_censo', { porque: 'sem registo' }),
    parcela('vereditos_publicados', { porque: 'sem rede' }),
  ]);
  assert.equal(r.pontos, 2);
  assert.deepEqual(r.nao_medidas.sort(), ['recibos_de_censo', 'vereditos_publicados']);
  assert.equal(r.peso_nao_medido, PESOS.recibos_de_censo + PESOS.vereditos_publicados);
});

test('os pesos somam 10 — se alguem mexer num, o total tem de deixar de bater', () => {
  assert.equal(TOTAL_PESOS, 10);
});

// ── C1 · testes gateados ────────────────────────────────────────────────────

function ambienteC1({ ficheiros, workflows, pkgs = {} }) {
  return {
    raiz: '/repo',
    runImpl: (_c, args) => {
      // `git ls-files -z <padroes>`
      const padroes = args.slice(2);
      if (padroes.some((p) => p.includes('package.json'))) return Object.keys(pkgs).join('\0');
      return ficheiros.join('\0');
    },
    readdirImpl: () => Object.keys(workflows),
    readImpl: (p) => {
      const s = String(p).split(/[\\/]/);
      const nome = s[s.length - 1];
      if (workflows[nome] !== undefined) return workflows[nome];
      const rel = String(p).replace(/\\/g, '/').replace('/repo/', '');
      if (pkgs[rel] !== undefined) return JSON.stringify({ scripts: pkgs[rel] });
      throw new Error('ENOENT ' + p);
    },
  };
}

test('C1: um teste nomeado num `node --test` do workflow conta como coberto', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['tools/a.test.mjs', 'tools/b.test.mjs'],
    workflows: { 'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        run: node --test tools/a.test.mjs\n' },
  }));
  assert.equal(p.num, 1);
  assert.equal(p.den, 2);
  assert.deepEqual(p.orfaos, ['tools/b.test.mjs']);
});

test('C1: um runner que DESCOBRE sozinho cobre o directorio — senao um pacote inteiro daria zero', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['packages/x/a.test.js', 'packages/x/sub/b.test.js', 'fora/c.test.js'],
    workflows: {
      'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        working-directory: packages/x\n        run: npm test\n',
    },
    pkgs: { 'packages/x/package.json': { test: 'node --test' } },
  }));
  assert.equal(p.num, 2, 'os dois de packages/x contam');
  assert.deepEqual(p.orfaos, ['fora/c.test.js']);
});

test('C1: o `working-directory` do JOB vale para todos os passos', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['packages/ext/src/a.test.js'],
    workflows: {
      'ci.yml': 'jobs:\n  x:\n    defaults:\n      run:\n        working-directory: packages/ext\n    steps:\n      - name: t\n        run: node --test src/*.test.js\n',
    },
  }));
  assert.equal(p.num, 1, 'sem o default do job, este ficheiro aparecia como orfao');
});

test('C1: um script com o MESMO NOME noutro pacote nao cobre este', () => {
  // A primeira versao procurava a string `npm run test` em qualquer sitio do
  // YAML e dava por coberto o `test` de um pacote que o CI nunca invoca.
  const p = testesGateados(ambienteC1({
    ficheiros: ['packages/nunca-corrido/a.test.js'],
    workflows: {
      'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        working-directory: packages/outro\n        run: npm test\n',
    },
    pkgs: {
      'packages/outro/package.json': { test: 'node --test' },
      'packages/nunca-corrido/package.json': { test: 'node --test' },
    },
  }));
  assert.equal(p.num, 0);
  assert.deepEqual(p.orfaos, ['packages/nunca-corrido/a.test.js']);
});

test('C1: `node --test` na RAIZ nao cobre o repositorio inteiro', () => {
  // Assumi-lo daria 100% a parcela mais pesada sem ninguem correr um teste.
  const p = testesGateados(ambienteC1({
    ficheiros: ['a/x.test.js', 'b/y.test.js'],
    workflows: { 'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        run: node --test\n' },
  }));
  assert.equal(p.num, 0);
});

test('C1: git a falhar da uma parcela NAO MEDIDA, nao um zero de cobertura', () => {
  const p = testesGateados({
    raiz: '/repo',
    runImpl: () => { throw new Error('fatal: not a git repository'); },
  });
  assert.equal(p.valor, null);
  assert.match(p.porque, /git ls-files/);
});

// ── C2 · recibos ────────────────────────────────────────────────────────────

test('C2: as rondas SEM afirmacao ficam fora das duas pontas', () => {
  const linhas = [
    { verdict: 'citacao-ok' }, { verdict: 'citacao-ok' },
    { verdict: 'refutado' },
    { verdict: 'nada-por-rever' }, { verdict: 'nada-por-rever' }, { verdict: 'nada-por-rever' },
  ].map((x) => JSON.stringify(x)).join('\n');
  const p = recibosDeCenso({ readImpl: () => linhas });
  assert.equal(p.num, 2);
  assert.equal(p.den, 3, 'as 3 rondas `nada-por-rever` nao sao afirmacoes — nem boas nem mas');
  assert.match(p.porque, /3 rondas sem afirmacao/);
});

test('C2: sem registo de recibos e NAO MEDIDO, nao zero', () => {
  const p = recibosDeCenso({ readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(p.valor, null);
  assert.match(p.porque, /nunca correu/);
});

// ── C3 e C6 · o que depende da rede ─────────────────────────────────────────

test('C3: sem rede a parcela vale ZERO com o porque — nunca 100% por nao haver contra-prova', () => {
  const p = veredictosPublicados({ prs: null });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /sem acesso ao GitHub/);
});

test('C3: conta os PRs com um veredicto publicado em comentario', () => {
  const p = veredictosPublicados({
    prs: [
      { numero: 1, comentarios: ['blá blá\nVEREDICTO: BLOQUEIA'] },
      { numero: 2, comentarios: ['obrigado!'] },
      { numero: 3, comentarios: [] },
    ],
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 3);
});

test('C6: saudavel = nao-draft e com menos de 14 dias', () => {
  const agora = Date.parse('2026-08-26T12:00:00Z');
  const dias = (n) => new Date(agora - n * 86400000).toISOString();
  const p = higieneDePrs({
    agora,
    prs: [
      { numero: 1, draft: false, criado: dias(1) },
      { numero: 2, draft: true, criado: dias(1) },
      { numero: 3, draft: false, criado: dias(40) },
    ],
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 3);
});

// ── C4 · devices ────────────────────────────────────────────────────────────

test('C4: compara o sha CARREGADO, nao o do disco — o que decide e o codigo em memoria', () => {
  const p = devicesNoMesmoSha({
    shaAlvo: '97ad846b40d7e1939e0',
    frota: [
      { device: 'a', codigo: { sha_carregado: '97ad846b40d7', sha_disco: '97ad846b40d7' } },
      // O disco esta certo e o carregado nao: este device AINDA corre o velho.
      { device: 'b', codigo: { sha_carregado: '0e4f40471de4', sha_disco: '97ad846b40d7' } },
    ],
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 2);
  assert.match(p.porque, /b@0e4f4047/);
});

test('C4: sem beacons ou sem sha de referencia e NAO MEDIDO', () => {
  assert.equal(devicesNoMesmoSha({ frota: null, shaAlvo: 'x' }).valor, null);
  assert.equal(devicesNoMesmoSha({ frota: [{ device: 'a' }], shaAlvo: null }).valor, null);
});

// ── C5 · telemetria ─────────────────────────────────────────────────────────

test('C5: uma decisao com o campo a ZERO nao conta como instrumentada', () => {
  // E o caso real deste repo: 4 830 decisoes, o campo existe em todas, e vale
  // 0 em todas. Contar a presenca da CHAVE daria 100% a uma metrica cega.
  const linhas = [
    { tokens_in: 0, tokens_out: 0 },
    { tokens_in: 10, tokens_out: 5 },
  ].map((x) => JSON.stringify(x)).join('\n');
  const p = coberturaDeTelemetria({ readImpl: () => linhas });
  assert.equal(p.num, 1);
  assert.equal(p.den, 2);
});

// ── C7 · limiares ───────────────────────────────────────────────────────────

test('C7: o denominador vem do CODIGO — esconder um limiar do registo nao o faz desaparecer', () => {
  const noCodigo = [{ id: 'a.mjs:X_S', ficheiro: 'a.mjs', linha: 1, nome: 'X_S' }, { id: 'a.mjs:Y_MS', ficheiro: 'a.mjs', linha: 2, nome: 'Y_MS' }];
  const p = limiaresMedidos({
    scanImpl: () => noCodigo,
    readImpl: () => JSON.stringify({ limiares: { 'a.mjs:X_S': { medicao: { onde: 'medido a 2026-01-01 em 40 corridas' } } } }),
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 2, 'o limiar que nao esta no registo conta como NAO medido, nao desaparece');
  assert.match(p.porque, /1 nem sequer estao no registo/);
});

test('C7: uma `medicao` sem `onde` escrito nao conta', () => {
  const p = limiaresMedidos({
    scanImpl: () => [{ id: 'a.mjs:X_S' }],
    readImpl: () => JSON.stringify({ limiares: { 'a.mjs:X_S': { medicao: { onde: 'sim' } } } }),
  });
  assert.equal(p.num, 0, 'um `onde` de tres letras nao e proveniencia');
});

test('C7: registo ilegivel faz TODOS contarem como nao medidos', () => {
  const p = limiaresMedidos({
    scanImpl: () => [{ id: 'a.mjs:X_S' }],
    readImpl: () => { throw new Error('ENOENT'); },
  });
  assert.equal(p.num, 0);
  assert.equal(p.den, 1);
  assert.match(p.porque, /ilegivel/);
});

test('C7: o scanner apanha `LIMIARES` — o nome que a primeira regex comia', () => {
  // A primeira versao era `^export const ([A-Z][A-Z0-9_]*(?:LIMIAR|LIMIARES|...))`
  // e o `[A-Z]` comia o `L`: o alvo mais importante do repo era o unico que o
  // scanner nao via. Um denominador por regex falha primeiro no caso que mais
  // interessa.
  assert.ok(SUFIXOS_DE_LIMIAR.test('LIMIARES'));
  assert.ok(SUFIXOS_DE_LIMIAR.test('STALE_AFTER_S'));
  assert.ok(SUFIXOS_DE_LIMIAR.test('MIN_PRECISAO_PCT'));
  assert.ok(!SUFIXOS_DE_LIMIAR.test('DIFF_SYSTEM_PROMPT'), 'uma string com nome acabado em _PROMPT nao e um limiar');
});

test('C7: o scanner corre mesmo sobre o repositorio e encontra o portao', () => {
  const l = limiaresNoCodigo({});
  assert.ok(l.length > 10, `esperava dezenas de limiares, vi ${l.length}`);
  assert.ok(l.some((x) => x.nome === 'LIMIARES' && x.ficheiro.endsWith('portao.mjs')));
});

// ── publicacao ──────────────────────────────────────────────────────────────

test('o instantaneo leva o carimbo, e sem carimbo nao se publica', () => {
  let escrito = null;
  const r = indice([parcela('testes_gateados', { num: 1, den: 2 })]);
  escreverInstantaneo(r, { agoraIso: '2026-08-26T12:00:00.000Z', writeImpl: (_p, c) => { escrito = c; } });
  assert.match(escrito, /"ts": "2026-08-26T12:00:00.000Z"/);

  const semTs = lerInstantaneo({ readImpl: () => JSON.stringify({ pontos: 9 }) });
  assert.equal(semTs.presente, false);
  assert.match(semTs.porque, /carimbo/);
});

test('um instantaneo VELHO publica-se com a idade a vista, nunca em silencio', () => {
  const agora = Date.parse('2026-08-26T12:00:00Z');
  const ts = new Date(agora - (IDADE_MAX_S + 3600) * 1000).toISOString();
  const r = lerInstantaneo({ agora, readImpl: () => JSON.stringify({ ts, pontos: 3.2, total: 10, pct: 32 }) });
  assert.equal(r.presente, true);
  assert.equal(r.fresco, false, 'velho e velho, e o painel tem de o poder dizer');
  assert.ok(r.idade_s > IDADE_MAX_S);
  assert.equal(r.pontos, 3.2, 'velho nao vira zero — vira velho');
});

test('sem instantaneo nenhum, `presente: false` com o porque — nao um zero', () => {
  const r = lerInstantaneo({ readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.presente, false);
  assert.match(r.porque, /nunca calculado/);
});

test('o resultado leva SEMPRE o carimbo de quando foi medido e o sha', async () => {
  // Sem isto, o "3,20/10" do titulo de um PR e uma afirmacao sem data: as sete
  // parcelas leem estado vivo e mexem-se sozinhas. Medido a 2026-08-26, com ~90
  // minutos entre duas corridas e ZERO linhas de codigo alteradas: cinco das
  // sete parcelas derivaram e o total foi de 3,20 para 3,24. Foi um adversario
  // que apanhou; quem corresse o comando concluiria que o PR mentia.
  const r = await calcular({ semRede: true, agora: Date.parse('2026-08-26T12:00:00Z') });
  assert.equal(r.medido_em, '2026-08-26T12:00:00.000Z');
  assert.ok(typeof r.sha === 'string' || r.sha === null);
  assert.ok(Number.isFinite(r.pontos));
});

test('o instantaneo herda o carimbo do resultado quando ninguem lho da', () => {
  let escrito = null;
  escreverInstantaneo(
    { pontos: 3.2, total: 10, pct: 32, peso_nao_medido: 0, nao_medidas: [], parcelas: [], medido_em: '2026-08-26T12:00:00.000Z', sha: 'abcdef123456' },
    { writeImpl: (_p, c) => { escrito = c; } },
  );
  const j = JSON.parse(escrito);
  assert.equal(j.ts, '2026-08-26T12:00:00.000Z');
  assert.equal(j.sha, 'abcdef123456');
});
