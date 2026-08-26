/**
 * frescura-por-camada.test.mjs
 *
 * O teste que interessa e o SINTETICO: pega num relogio parado, envelhece cada
 * fonte a mao, e exige que o alarme dispare no tecto declarado. Sem isso, um
 * alarme de frescura so se prova quando ja e tarde.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POLITICA, OK, AVISO, MAU, ND,
  idadeSegundos, emPalavras, verCamada, frescuraPorCamada,
  naTuaMaoFrescura, frescuraDoNotion,
} from './frescura-por-camada.mjs';

const AGORA = Date.parse('2026-08-25T19:00:00Z');
const haSegundos = (s) => new Date(AGORA - s * 1000).toISOString();

// ── idade ───────────────────────────────────────────────────────────────────

test('idadeSegundos aceita ISO, ms e Date', () => {
  assert.equal(idadeSegundos(haSegundos(120), AGORA), 120);
  assert.equal(idadeSegundos(AGORA - 5000, AGORA), 5);
  assert.equal(idadeSegundos(new Date(AGORA - 60000), AGORA), 60);
});

test('uma fonte datada no FUTURO nao e fresca — e um relogio errado', () => {
  assert.equal(idadeSegundos(new Date(AGORA + 60000).toISOString(), AGORA), null);
});

test('folga de 5 s para desvio de relogio entre maquinas', () => {
  assert.equal(idadeSegundos(new Date(AGORA + 3000).toISOString(), AGORA), 0);
});

test('data ilegivel e null, nunca zero', () => {
  assert.equal(idadeSegundos('ontem a tarde', AGORA), null);
  assert.equal(idadeSegundos(null, AGORA), null);
});

test('emPalavras leva sempre unidade', () => {
  assert.equal(emPalavras(30), '30 s');
  assert.equal(emPalavras(600), '10 min');
  assert.equal(emPalavras(7200), '2 h');
  assert.equal(emPalavras(3 * 86400), '3 d');
  assert.equal(emPalavras(null), 'n/d');
});

// ── o alarme dispara no tecto (o teste sintetico do gate) ───────────────────

test('beacon: dentro do ciclo = ok; passado o tecto de aviso = aviso; passado o de mau = mau', () => {
  const t = POLITICA.beacon;
  assert.equal(verCamada('beacon', { quando: haSegundos(60) }, { agora: AGORA }).estado, OK);
  assert.equal(verCamada('beacon', { quando: haSegundos(t.aviso) }, { agora: AGORA }).estado, AVISO);
  assert.equal(verCamada('beacon', { quando: haSegundos(t.aviso - 1) }, { agora: AGORA }).estado, OK);
  assert.equal(verCamada('beacon', { quando: haSegundos(t.mau) }, { agora: AGORA }).estado, MAU);
  assert.equal(verCamada('beacon', { quando: haSegundos(t.mau - 1) }, { agora: AGORA }).estado, AVISO);
});

test('vault: 20 commits atras ha mais de 2 h dispara aviso, como o masterprompt pediu', () => {
  const r = verCamada('vault', { quando: haSegundos(2 * 3600 + 1), detalhe: '20 commits atras' },
    { agora: AGORA });
  assert.equal(r.estado, AVISO);
  assert.match(r.porque, /20 commits atras/);
});

test('cada camada tem o SEU tecto — a mesma idade da estados diferentes', () => {
  const oitoDias = haSegundos(8 * 86400);
  assert.equal(verCamada('beacon', { quando: oitoDias }, { agora: AGORA }).estado, MAU);
  assert.equal(verCamada('vault', { quando: oitoDias }, { agora: AGORA }).estado, MAU);
  assert.equal(verCamada('notion', { quando: oitoDias }, { agora: AGORA }).estado, AVISO);
  assert.equal(verCamada('pitch', { quando: oitoDias }, { agora: AGORA }).estado, OK);
});

test('o CANAL viaja sempre, fresco ou velho — foi a metade que faltava no painel', () => {
  const fresco = verCamada('beacon', { quando: haSegundos(10) }, { agora: AGORA });
  const velho = verCamada('beacon', { quando: haSegundos(99999) }, { agora: AGORA });
  assert.equal(fresco.canal, 'via vault · ciclo ~10 min');
  assert.equal(velho.canal, 'via vault · ciclo ~10 min');
});

test('sem data: n/d com motivo, NUNCA ok', () => {
  const r = verCamada('notion', { quando: null, porqueNd: 'manifesto ilegivel' }, { agora: AGORA });
  assert.equal(r.estado, ND);
  assert.equal(r.porque, 'manifesto ilegivel');
  assert.equal(r.idade_s, null);
});

test('uma fonte sem tecto declarado nao se julga — sai n/d', () => {
  const r = verCamada('inventada', { quando: haSegundos(10) }, { agora: AGORA });
  assert.equal(r.estado, ND);
  assert.match(r.porque, /sem tecto declarado/);
});

// ── o conjunto ──────────────────────────────────────────────────────────────

test('uma fonte AUSENTE nao se cala — sai n/d a dizer que ninguem a mediu', () => {
  const r = frescuraPorCamada({ beacon: { quando: haSegundos(10) } }, { agora: AGORA });
  assert.equal(r.itens.length, Object.keys(POLITICA).length);
  const notion = r.itens.find((i) => i.fonte === 'notion');
  assert.equal(notion.estado, ND);
  assert.match(notion.porque, /nao foi medida/);
});

test('o pior estado manda, e mau ganha a aviso', () => {
  const r = frescuraPorCamada({
    beacon: { quando: haSegundos(10) },
    vault: { quando: haSegundos(3 * 3600) },        // aviso
    notion: { quando: haSegundos(60 * 86400) },     // mau
    pitch: { quando: haSegundos(10) },
  }, { agora: AGORA });
  assert.equal(r.pior, MAU);
  assert.equal(r.conta.mau, 1);
  assert.equal(r.conta.aviso, 1);
  assert.equal(r.conta.ok, 2);
});

test('tudo fresco = ok e nada pede a mao do dono', () => {
  const factos = Object.fromEntries(Object.keys(POLITICA).map((k) => [k, { quando: haSegundos(5) }]));
  const r = frescuraPorCamada(factos, { agora: AGORA });
  assert.equal(r.pior, OK);
  assert.deepEqual(naTuaMaoFrescura(r), []);
});

test('naTuaMaoFrescura leva o canal e o comando, nunca so a queixa', () => {
  const r = frescuraPorCamada({
    notion: { quando: haSegundos(60 * 86400), resolver: 'correr a skill `notion-to-vault`' },
  }, { agora: AGORA });
  const item = naTuaMaoFrescura(r).find((i) => i.id === 'frescura:notion');
  assert.equal(item.estado, MAU);
  assert.equal(item.comando, 'correr a skill `notion-to-vault`');
  assert.match(item.accao, /notion-to-vault/);
});

test('n/d ENTRA na lista da mao do dono — nao saber e trabalho por fazer', () => {
  const r = frescuraPorCamada({}, { agora: AGORA });
  assert.equal(naTuaMaoFrescura(r).length, Object.keys(POLITICA).length);
});

// ── o manifesto do Notion ───────────────────────────────────────────────────

test('frescuraDoNotion conta a pagina MAIS ATRASADA, nao a corrida mais recente', () => {
  const m = {
    last_incremental_sync: '2026-07-25T10:45:49+00:00',
    pages: {
      a: { synced_at: '2026-06-17T17:54:04+00:00', status: 'synced' },
      b: { synced_at: '2026-07-22T08:02:23-03:00', status: 'stale' },
    },
  };
  const f = frescuraDoNotion(m);
  assert.equal(f.quando, Date.parse('2026-06-17T17:54:04+00:00'),
    'a frescura de um espelho e a da pagina mais atrasada que ele serve');
  assert.match(f.detalhe, /2 paginas, 1 marcadas stale/);
});

test('o manifesto REAL de 2026-08-25 esta no VERMELHO — e a razao de isto existir', () => {
  // Copiado a letra do `80-notion-mirror/_sync/manifest.json` do vault, lido a
  // 2026-08-25. Nao e uma fixture inventada: e o estado real no dia em que este
  // modulo foi escrito, e por isso o teste vale por si — se alguem sincronizar
  // o Notion, este teste continua a passar (a data no manifesto e fixa aqui).
  const m = { last_incremental_sync: '2026-07-25T10:45:49+00:00', last_full_sync: null, pages: {} };
  const r = verCamada('notion', frescuraDoNotion(m), { agora: AGORA });
  assert.equal(r.estado, MAU,
    '31 dias passa o tecto de MAU (30 d) — o espelho deixou de descrever o presente');
  assert.ok(r.idade_s > 30 * 86400, `esperado >30 d, deu ${emPalavras(r.idade_s)}`);
});

test('manifesto vazio/ilegivel e n/d com motivo', () => {
  assert.equal(frescuraDoNotion({}).quando, null);
  assert.match(frescuraDoNotion({}).porqueNd, /sem `last_\*_sync`/);
  assert.equal(frescuraDoNotion(null).quando, null);
});
