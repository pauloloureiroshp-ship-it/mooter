/**
 * triagem.test.mjs — o ciclo de valor, fechado.
 *
 * Ate 2026-08-18 o motor produzia recibos e mais nada acontecia. Um achado que
 * ninguem aceita nem descarta nao e trabalho: e ruido com carimbo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  DECISOES, AUTORES, MOTIVOS, chaveDoRecibo, ehAchado, lerTriagem, registarTriagem,
  porTriar, contarTriagem, custoEstimado, menuDeMotores,
} from './triagem.mjs';

const require = createRequire(import.meta.url);

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-tri-')), 'triagem.jsonl');
const achado = (n, chave) => ({
  ts: `2026-08-18T10:0${n}:00Z`, pilar: 'P4', chave,
  ficheiro: 'a.mjs', janela: '10-20', verdict: 'citacao-ok', conclusao: 'achado',
  evidencia: 'a.mjs:12 => if (x)', resultado_resumo: 'ACHADO: ...',
});

test('a chave prefere o conteudo a posicao', () => {
  assert.equal(chaveDoRecibo({ chave: 'a.mjs:1-9:abc', ficheiro: 'a.mjs' }), 'a.mjs:1-9:abc');
  assert.equal(chaveDoRecibo({ ficheiro: 'a.mjs', janela: '1-9', ts: 'T' }), 'a.mjs:1-9@T',
    'recibos antigos nao tem chave: cai para o melhor que permitem');
  assert.equal(chaveDoRecibo({ evento: 'engine:down' }), null);
});

test('so conta como achado o que foi AFIRMADO e cuja citacao resolveu', () => {
  assert.equal(ehAchado(achado(1, 'k1')), true);
  assert.equal(ehAchado({ ...achado(1, 'k'), conclusao: 'sem-achado' }), false);
  assert.equal(ehAchado({ ...achado(1, 'k'), verdict: 'refutado' }), false, 'alucinacao nao vai a triagem');
  assert.equal(ehAchado({ evento: 'engine:up' }), false);
});

test('ACEITACAO: os tres botoes escrevem, e a ultima decisao e a que vale', () => {
  const f = tmp();
  // O descarte leva motivo; os outros dois nao precisam — assimetria deliberada.
  for (const d of DECISOES) {
    registarTriagem(f, {
      chave: `k-${d}`, decisao: d, recibo: achado(1, `k-${d}`),
      ...(d === 'descartado' ? { motivo: 'trivial' } : {}),
    });
  }
  let { decisoes, partidas } = lerTriagem(f);
  assert.equal(decisoes.size, 3);
  assert.equal(partidas, 0);
  assert.equal(decisoes.get('k-aceite').ficheiro, 'a.mjs', 'a decisao guarda o que se estava a ver');

  // Mudar de ideias e legitimo; apagar o rasto nao.
  registarTriagem(f, { chave: 'k-aceite', decisao: 'descartado', motivo: 'ja-sabido' });
  ({ decisoes } = lerTriagem(f));
  assert.equal(decisoes.get('k-aceite').decisao, 'descartado');
  assert.equal(fs.readFileSync(f, 'utf8').trim().split('\n').length, 4, 'append-only: nada e reescrito');
});

test('uma decisao invalida ou sem chave e recusada, nao normalizada', () => {
  const f = tmp();
  assert.throws(() => registarTriagem(f, { chave: 'k', decisao: 'talvez' }), /decisao desconhecida/);
  assert.throws(() => registarTriagem(f, { decisao: 'aceite' }), /sem chave/);
  assert.equal(fs.existsSync(f), false, 'e nao deixa rasto de uma escrita que nao aconteceu');
});

test('linhas partidas sao CONTADAS, nao engolidas', () => {
  const f = tmp();
  fs.writeFileSync(f, `{"chave":"k1","decisao":"aceite"}\n{isto nao e json\n{"chave":"k2","decisao":"nao-existe"}\n`);
  const r = lerTriagem(f);
  assert.equal(r.decisoes.size, 1);
  assert.equal(r.partidas, 2, 'engolir metade do registo seria dizer que ninguem triou nada');
  assert.deepEqual(lerTriagem('/nao/existe').decisoes.size, 0);
});

test('a fila mostra so o que espera decisao, do mais recente para tras', () => {
  const f = tmp();
  const rec = [achado(1, 'k1'), achado(2, 'k2'), { ...achado(3, 'k3'), conclusao: 'sem-achado' }];
  registarTriagem(f, { chave: 'k1', decisao: 'aceite' });
  const { decisoes } = lerTriagem(f);
  const fila = porTriar(rec, decisoes);
  assert.deepEqual(fila.map((x) => x.chave), ['k2'], 'k1 ja foi decidido, k3 nao e achado');

  const c = contarTriagem(rec, decisoes);
  assert.deepEqual(c, { aceite: 1, descartado: 0, issue: 0, por_triar: 1, achados: 2, por_autor: { dono: 1 }, por_motivo: {}, sem_motivo: 0 });
});

test('ACEITACAO: o custo vem da tabela REAL, e o desconhecido diz n/d', () => {
  // Um custo inventado num botao seria a mentira mais cara que este painel
  // podia contar — e exactamente a tese do Mooter que ele afirma.
  const menu = menuDeMotores();
  assert.equal(menu.find((m) => m.id === 'moo').usd, 0, 'a GPU do dono custa zero, e isso e estrutural');
  const opus = menu.find((m) => m.id === 'claude-opus-5');
  assert.equal(opus.fonte, 'tools/router/pricing.js', 'nunca uma constante escrita aqui');
  assert.ok(opus.usd > 0);
  const sonnet = menu.find((m) => m.id === 'claude-sonnet-5');
  assert.ok(opus.usd > sonnet.usd, 'a escada de precos tem de estar pela ordem certa');

  const fora = custoEstimado('modelo-que-nao-existe');
  assert.equal(fora.usd, null);
  assert.equal(fora.fonte, 'n/a');
});

test('ACEITACAO: a decisao e ASSINADA, e as contagens separam quem decidiu', () => {
  // 20 aceites do dono e 20 aceites de um agente nao sao o mesmo dado. Uma
  // contagem que os funde nao serve para decidir — e decidir e a razao de o
  // numero existir.
  const f = tmp();
  registarTriagem(f, { chave: 'k1', decisao: 'aceite', por: 'dono' });
  registarTriagem(f, { chave: 'k2', decisao: 'aceite', por: 'claude' });
  const { decisoes } = lerTriagem(f);
  assert.equal(decisoes.get('k1').por, 'dono');
  assert.equal(decisoes.get('k2').por, 'claude');

  const rec = [achado(1, 'k1'), achado(2, 'k2'), achado(3, 'k3')];
  const c = contarTriagem(rec, decisoes);
  assert.deepEqual(c.por_autor, { dono: 1, claude: 1 });
  assert.equal(c.aceite, 2);
  assert.equal(c.por_triar, 1);
});

test('ACEITACAO: o menu segue a escada actual, e Fable nunca aparece por tier', () => {
  // T5/Fable e opt-in exclusivamente via `@fable` — um menu que oferece
  // Fable por escolha de tier estaria a violar a doutrina do projecto, nao
  // so a mostrar um preco a mais.
  const menu = menuDeMotores();
  assert.deepEqual(menu.map((m) => m.id), ['moo', 'claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'],
    'a escada tem de ser a actual: T0 local, T1 Haiku, T2 Sonnet 5, T3 Opus 5');
  assert.ok(!menu.some((m) => m.id.includes('fable')), 'claude-fable-5 nao pode aparecer no menu de escalacao');

  const { PRICES } = require('../../router/pricing.js');
  for (const m of menu) {
    if (m.id === 'moo') continue; // local, fora da tabela de precos por desenho
    assert.ok(PRICES[m.id], `o menu mostra $ para ${m.id} mas a tabela nao o tem entrada — seria preco emprestado`);
  }
});

test('um autor desconhecido e recusado — decisao anonima nao entra', () => {
  const f = tmp();
  assert.throws(() => registarTriagem(f, { chave: 'k', decisao: 'aceite', por: 'alguem' }), /autor desconhecido/);
  assert.deepEqual(AUTORES, ['dono', 'claude', 'agente']);
});


// ── Fase A · a razao do descarte (2026-08-19) ────────────────────────────────

/**
 * Medido: 74 decisoes de triagem, 72 DESCARTES. Uma taxa de 97% que nao ensina
 * nada, porque a `nota` era texto livre e estava quase sempre vazia. A lista
 * fechada de motivos e o unico dado que distingue os dois futuros possiveis:
 * se dominar `nao-e-um-problema`, o defeito esta na PERGUNTA; se dominar
 * `fora-do-que-estou-a-fazer`, esta na RELEVANCIA. Sao trabalhos opostos.
 */
test('descartar SEM motivo deixa de ser possivel', () => {
  const f = tmp();
  assert.throws(() => registarTriagem(f, { chave: 'k', decisao: 'descartado' }),
    /exige um motivo/, 'um descarte anonimo custa o mesmo a escrever e nao ensina nada');
  assert.throws(() => registarTriagem(f, { chave: 'k', decisao: 'descartado', motivo: 'porque-sim' }),
    /motivo desconhecido/, 'a lista e fechada: texto livre foi exactamente o que falhou');
});

test('aceitar e abrir issue NAO exigem motivo', () => {
  const f = tmp();
  // A assimetria e deliberada: o valor esta em saber porque se DEITA FORA.
  assert.equal(registarTriagem(f, { chave: 'a', decisao: 'aceite' }).decisao, 'aceite');
  assert.equal(registarTriagem(f, { chave: 'b', decisao: 'issue' }).decisao, 'issue');
});

test('o motivo fica gravado e volta a ser lido', () => {
  const f = tmp();
  for (const m of MOTIVOS) registarTriagem(f, { chave: 'k-' + m, decisao: 'descartado', motivo: m });
  const lidas = lerTriagem(f).decisoes;
  for (const m of MOTIVOS) assert.equal(lidas.get('k-' + m).motivo, m);
});

test('os descartes antigos contam como sem_motivo — nao se disfarcam de dado', () => {
  const f = tmp();
  // Escrito a mao como os 72 antigos estao no disco: sem campo `motivo`.
  fs.appendFileSync(f, JSON.stringify({ ts: '2026-08-01T00:00:00Z', chave: 'velho', decisao: 'descartado', por: 'dono' }) + '\n');
  registarTriagem(f, { chave: 'novo', decisao: 'descartado', motivo: 'trivial' });
  const { decisoes } = lerTriagem(f);
  const recibos = [
    { pilar: 'P1', ficheiro: 'a.js', janela: '1-10', verdict: 'citacao-ok', resultado_resumo: 'ACHADO: x', chave: 'velho' },
    { pilar: 'P1', ficheiro: 'b.js', janela: '1-10', verdict: 'citacao-ok', resultado_resumo: 'ACHADO: y', chave: 'novo' },
  ];
  const c = contarTriagem(recibos, decisoes);
  assert.equal(c.sem_motivo + Object.values(c.por_motivo).reduce((n, x) => n + x, 0), c.descartado,
    'todo o descarte tem de cair num dos dois lados: com motivo, ou declaradamente sem');
});
