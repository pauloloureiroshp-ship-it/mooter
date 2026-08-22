/**
 * classes-da-fila.test.mjs — a Onda 2c.
 *
 * O GATE do MP: "relatorio de classes com contagens que BATEM com a fila."
 * O que se tranca aqui e a palavra "batem": um relatorio que fecha a conta
 * sozinho nao esta a contar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { assinatura, lerLedger, relatorio } from './classes-da-fila.mjs';

const rec = (o) => ({ conclusao: 'achado', verdict: 'citacao-ok', pilar: 'P5', ficheiro: 'a.js', ...o });

test('a assinatura vem do TEXTO da afirmacao, nao do pilar', () => {
  // De proposito: se um dia duas perguntas diferentes produzirem a mesma forma,
  // o relatorio tem de o mostrar em vez de o esconder atras do pilar.
  assert.equal(assinatura({ resultado_resumo: 'SAME SHAPE: lines 1, 2' }), 'forma-repetida');
  assert.equal(assinatura({ resultado_resumo: 'BROKEN: falta fechar' }), 'texto-cortado');
  assert.equal(assinatura({ resultado_resumo: 'THEY DIVERGE: x vs y' }), 'comentario-diverge-do-codigo');
  assert.equal(assinatura({ resultado_resumo: 'REPEATED: LINE 3 and LINE 9' }), 'linha-repetida');
  assert.equal(assinatura({ resultado_resumo: 'LINE 12: const x = 1;' }), 'extraccao-de-linhas');
  assert.equal(assinatura({ resultado_resumo: 'ACHADO: QUANDO x ENTAO y' }), 'defeito-narrado');
  assert.equal(assinatura({ resultado_resumo: 'qualquer coisa nova' }), 'outra');
  assert.equal(assinatura(null), 'outra', 'um recibo vazio nao rebenta o relatorio');
});

test('GATE · a soma das classes bate com os achados — desvio 0', () => {
  const r = relatorio([
    rec({ resultado_resumo: 'SAME SHAPE: lines 1, 2' }),
    rec({ resultado_resumo: 'SAME SHAPE: lines 3, 4' }),
    rec({ pilar: 'P1', resultado_resumo: 'REPEATED: LINE 1 and LINE 2' }),
    rec({ pilar: 'P7', resultado_resumo: 'ACHADO: algo' }),
  ]);
  assert.equal(r.achados, 4);
  assert.equal(r.soma, 4);
  assert.equal(r.desvio, 0, 'toda a fila tem de cair numa classe');
});

test('GATE · o que NAO e achado nao entra na conta', () => {
  // Uma ronda vazia contada como trabalho e exactamente a mentira que o painel
  // deste projecto existe para nao contar.
  const r = relatorio([
    rec({ resultado_resumo: 'SAME SHAPE: lines 1, 2' }),
    { conclusao: 'sem-achado', verdict: 'sem-achado', pilar: 'P8' },
    { evento: 'arranque', pilar: 'P1' },
    rec({ verdict: 'refutado', resultado_resumo: 'SAME SHAPE: lines 5, 6' }),
  ]);
  assert.equal(r.achados, 1);
  assert.equal(r.desvio, 0);
});

test('o P4 sai por omissao, e volta com --com-p4', () => {
  const recibos = [
    rec({ resultado_resumo: 'SAME SHAPE: lines 1, 2' }),
    rec({ pilar: 'P4', resultado_resumo: 'BROKEN: x' }),
  ];
  assert.equal(relatorio(recibos).achados, 1, 'P4 esta desligado — nao conta para a fila viva');
  assert.equal(relatorio(recibos, { semP4: false }).achados, 2);
});

// ⚠️ Estes dois testes usam um pilar SINTETICO (`PZ`), nao um real, e isso e
// deliberado. A primeira versao usava o P8; quando o P8 foi desligado, o teste
// partiu. A segunda usava o P6; quando o P6 foi desligado, partiu outra vez.
// O que se quer testar e o COMPORTAMENTO do alarme, nao quais pilares estao
// ligados hoje — e hoje, depois de desligar os quatro mudos, nao ha nenhum
// pilar real activo e mudo com que o testar.

test('PILARES MUDOS · um pilar ACTIVO que corre e nunca acha tem de aparecer', () => {
  // Sem este alarme, centenas de rondas de GPU a produzir nada sao
  // indistinguiveis de centenas de rondas a produzir "esta tudo bem".
  const recibos = [];
  for (let i = 0; i < 60; i += 1) recibos.push({ pilar: 'PZ', conclusao: 'sem-achado', verdict: 'sem-achado' });
  recibos.push(rec({ resultado_resumo: 'SAME SHAPE: lines 1, 2' }));
  const r = relatorio(recibos);
  const mudo = r.mudos.find((m) => m.pilar === 'PZ');
  assert.ok(mudo, 'um pilar mudo e activo tem de ser nomeado');
  assert.equal(mudo.rondas, 60);
  assert.equal(mudo.semAchado, 60);
  assert.ok(!r.mudos.some((m) => m.pilar === 'P5'), 'um pilar que acha nao e mudo');
});

test('PILARES MUDOS · um pilar JA DESLIGADO sai do alarme, mas nao do registo', () => {
  // Os quatro desligados ficam no ledger com centenas de rondas mudas para
  // sempre. Mante-los no mesmo alarme enterraria qualquer mudo NOVO que
  // aparecesse — e um alarme que grita sobre o que ja foi tratado ensina o dono
  // a ignora-lo.
  const recibos = [];
  for (let i = 0; i < 60; i += 1) recibos.push({ pilar: 'P8', conclusao: 'sem-achado', verdict: 'sem-achado' });
  for (let i = 0; i < 60; i += 1) recibos.push({ pilar: 'PZ', conclusao: 'sem-achado', verdict: 'sem-achado' });
  const r = relatorio(recibos);
  assert.ok(!r.mudos.some((m) => m.pilar === 'P8'), 'um desligado nao pede accao');
  assert.ok(r.mudos.some((m) => m.pilar === 'PZ'), 'um activo pede');
  const hist = r.mudosDesligados.find((m) => m.pilar === 'P8');
  assert.ok(hist, 'mas o numero do desligado nao pode desaparecer do registo');
  assert.equal(hist.rondas, 60);
});

test('PILARES MUDOS · poucas rondas nao bastam para acusar um pilar', () => {
  // Um pilar com 3 rondas e 0 achados pode so ter tido azar. O alarme so dispara
  // com amostra — acusar cedo demais ensina o dono a ignorar o alarme.
  const recibos = [];
  for (let i = 0; i < 5; i += 1) recibos.push({ pilar: 'P9', conclusao: 'sem-achado', verdict: 'sem-achado' });
  assert.equal(relatorio(recibos).mudos.length, 0);
});

test('uma linha partida do ledger e CONTADA, nunca engolida', () => {
  const { recibos, partidas } = lerLedger('x', {
    readImpl: () => '{"pilar":"P1","conclusao":"achado","verdict":"citacao-ok"}\n{{{ partida\n',
  });
  assert.equal(recibos.length, 1);
  assert.equal(partidas, 1, 'engolir metade do ledger seria dizer que a fila e menor do que e');
});

test('ledger ausente nao rebenta — diz que nao existe', () => {
  const r = lerLedger('/nao/existe', { readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.existe, false);
  assert.deepEqual(r.recibos, []);
});
