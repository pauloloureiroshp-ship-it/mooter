/**
 * comandante.test.mjs — sinteticos, nunca o ledger real.
 *
 * O caso que mais importa nao e escolher bem: e PARAR. Um escalonador que nunca
 * diz "chega" e um round-robin com passos extra.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { estatisticasDosLoops, filaHumana, decidir, DEFAULT_CAPS } from './comandante.mjs';

/** Um recibo que o `ehAchado` reconhece. */
const achado = (pilar, chave, ts = '2026-08-23T10:00:00Z') => ({
  pilar, chave, ts, conclusao: 'achado', verdict: 'citacao-ok', ficheiro: 'f.js',
});
const ronda = (pilar, ts) => ({ pilar, ts, conclusao: 'sem-achado', verdict: 'sem-achado' });

test('conta abertos por pilar, e so `aceite` conta como vitoria', () => {
  const regs = [achado('PA', 'k1'), achado('PA', 'k2'), achado('PB', 'k3')];
  const dec = new Map([
    ['k1', { decisao: 'aceite' }],
    ['k2', { decisao: 'descartado' }],
  ]);
  const [a, b] = estatisticasDosLoops(regs, dec, ['PA', 'PB']);
  assert.equal(a.openProposals, 0, 'os dois de PA tem decisao');
  assert.equal(a.measuredWins, 1);
  assert.equal(a.measuredTotal, 2, 'o descarte conta no denominador — e assim que se afunda');
  assert.equal(b.openProposals, 1);
  assert.equal(b.measuredTotal, 0);
});

test('uma ronda SEM achado mexe no lastRunAt — o pilar correu na mesma', () => {
  const regs = [ronda('PA', '2026-08-23T09:00:00Z'), achado('PA', 'k', '2026-08-23T11:00:00Z')];
  const [a] = estatisticasDosLoops(regs, new Map(), ['PA']);
  assert.equal(a.lastRunAt, Date.parse('2026-08-23T11:00:00Z'), 'fica o mais recente');
});

test('a mesma chave repetida conta uma vez', () => {
  const regs = [achado('PA', 'k'), achado('PA', 'k'), achado('PA', 'k')];
  const [a] = estatisticasDosLoops(regs, new Map(), ['PA']);
  assert.equal(a.openProposals, 1);
});

test('um pilar sem rondas nenhumas entra na lista, a zeros', () => {
  // Senao um pilar novo nunca seria escolhido por nao existir no ledger.
  const [a] = estatisticasDosLoops([], new Map(), ['PZ']);
  assert.equal(a.id, 'PZ');
  assert.equal(a.openProposals, 0);
  assert.equal(a.lastRunAt, 0);
});

test('PAUSA quando a fila humana enche — o caso que motiva tudo isto', () => {
  // Medido a 2026-08-23 ao ligar: 215 abertos. Na maquina do dono o tecto em
  // vigor era 50 (`preferences.json`); este teste usa o DEFAULT_CAPS de 6 porque
  // e sintetico. Pausava nos dois valores — 215 > 50 > 6.
  const regs = Array.from({ length: 10 }, (_, i) => achado('PA', 'k' + i));
  const d = decidir({ registos: regs, decisoes: new Map(), ids: ['PA'] });
  assert.equal(d.pausa, true);
  assert.equal(d.pilar, null);
  assert.match(d.razao, /human queue full/);
  assert.equal(d.fila, 10);
});

test('PAUSA absoluta se o dono estiver na GPU, mesmo com a fila vazia', () => {
  const d = decidir({ registos: [], decisoes: new Map(), ids: ['PA'], gpu: { foregroundBusy: true } });
  assert.equal(d.pausa, true);
  assert.match(d.razao, /foreground-preemption/);
});

test('com fila curta, escolhe e diz porque', () => {
  const agora = Date.parse('2026-08-23T12:00:00Z');
  const regs = [
    ronda('PA', '2026-08-23T11:59:00Z'),   // correu agora mesmo
    ronda('PB', '2026-08-20T12:00:00Z'),   // parado ha 3 dias
  ];
  const d = decidir({ registos: regs, decisoes: new Map(), ids: ['PA', 'PB'], agora });
  assert.equal(d.pausa, false);
  assert.equal(d.pilar, 'PB', 'ganha quem esta mais parado, a igualdade de hit-rate');
  assert.match(d.razao, /staleness/);
});

test('o tecto POR LOOP tira da rotacao quem ja tem 3 abertos', () => {
  // PA tem de ser o MAIS PARADO, senao o teste passa por staleness e fica verde
  // mesmo com o tecto por-loop apagado. A versao anterior tinha esse defeito:
  // PB ganhava de qualquer maneira, e o teste nao discriminava nada.
  const agora = Date.parse('2026-08-23T12:00:00Z');
  const regs = [
    ...Array.from({ length: 3 }, (_, i) => achado('PA', 'a' + i, '2026-08-01T00:00:00Z')),
    ronda('PB', '2026-08-23T11:59:00Z'),
  ];
  const d = decidir({ registos: regs, decisoes: new Map(), ids: ['PA', 'PB'], agora, caps: { perLoopOpen: 3, globalHumanQueue: 99 } });
  assert.equal(d.pilar, 'PB', 'PA esta parado ha 3 semanas e ganharia por staleness — perde SO por estar cheio');
});

test('`issue` conta como vitoria, nao como derrota', () => {
  // O ab-report.mjs:118 e o autopilot.mjs:186 ja contavam assim. O comandante
  // contradizia os dois: afundava um pilar por o dono ter aberto uma issue em
  // vez de aceitar o patch — ou seja, por ele ter ACERTADO.
  const regs = [achado('PA', 'k1'), achado('PA', 'k2')];
  const dec = new Map([['k1', { decisao: 'issue' }], ['k2', { decisao: 'descartado' }]]);
  const [a] = estatisticasDosLoops(regs, dec, ['PA']);
  assert.equal(a.measuredWins, 1);
  assert.equal(a.measuredTotal, 2);
});

test('o que o `agente` decidiu sai do denominador INTEIRO', () => {
  // Um agente a julgar o resultado do proprio pilar nao e prova: e acreditar em
  // quem se devia auditar. Mesma regra do autopilot.mjs:185.
  const regs = [achado('PA', 'k1'), achado('PA', 'k2'), achado('PA', 'k3')];
  const dec = new Map([
    ['k1', { decisao: 'aceite', por: 'agente' }],
    ['k2', { decisao: 'descartado', por: 'agente' }],
    ['k3', { decisao: 'aceite', por: 'dono' }],
  ]);
  const [a] = estatisticasDosLoops(regs, dec, ['PA']);
  assert.equal(a.measuredTotal, 1, 'so a decisao do dono conta');
  assert.equal(a.measuredWins, 1);
  assert.equal(a.openProposals, 0, 'decididas por alguem continuam a nao estar abertas');
});

test('as decisoes do `claude` FICAM no denominador', () => {
  // Sao refutacoes mecanicas derivadas da regra do proprio pilar — a melhor
  // prova que ha de que ele produziu ruido. Excluir isto apagava a razao pela
  // qual nove pilares foram desligados.
  const regs = [achado('PA', 'k1')];
  const dec = new Map([['k1', { decisao: 'descartado', por: 'claude' }]]);
  const [a] = estatisticasDosLoops(regs, dec, ['PA']);
  assert.equal(a.measuredTotal, 1);
  assert.equal(a.measuredWins, 0);
});

test('todos cheios -> pausa com razao propria, nao um pick ao acaso', () => {
  const regs = ['PA', 'PB'].flatMap((p) => Array.from({ length: 3 }, (_, i) => achado(p, p + i)));
  const d = decidir({ registos: regs, decisoes: new Map(), ids: ['PA', 'PB'], caps: { perLoopOpen: 3, globalHumanQueue: 99 } });
  assert.equal(d.pausa, true);
  assert.match(d.razao, /no eligible loop/);
});

test('a razao NUNCA vem vazia — um loop que pausa em silencio parece morto', () => {
  for (const ctx of [
    { registos: [], decisoes: new Map(), ids: [] },
    { registos: [], decisoes: new Map(), ids: ['PA'], gpu: { foregroundBusy: true } },
  ]) {
    const d = decidir(ctx);
    assert.ok(d.razao && d.razao.length > 8, 'a pausa tem de se explicar');
  }
});

test('filaHumana soma os abertos de todos os loops', () => {
  assert.equal(filaHumana([{ openProposals: 3 }, { openProposals: 4 }, {}]), 7);
  assert.equal(filaHumana(null), 0);
});

test('os tectos por omissao sao os do scheduler, nao inventados aqui', () => {
  assert.equal(DEFAULT_CAPS.globalHumanQueue, 6);
  assert.equal(DEFAULT_CAPS.perLoopOpen, 3);
});

/**
 * O IMPASSE DA JANELA — 2026-08-25, e a terceira vez que esta CLASSE aparece.
 *
 * `decidirRonda` lia o ledger com o seu proprio `readFileSync`, sem janela,
 * enquanto o `readLedger` (painel e tique do nivel 1) usa `maxLines = 5000`.
 * Duas leituras do mesmo ficheiro, com fronteiras diferentes, a responder a
 * mesma pergunta. Medido no dia em que o L1 foi ligado:
 *
 *   L1 e painel viam   fila  20   (janela)
 *   o runner contava   fila 101   (ficheiro inteiro)
 *
 * O runner pausa acima de 50 => pausava PARA SEMPRE, porque o L1 nao consegue
 * fechar o que a janela dele nao mostra. Nao era espera; era impasse.
 *
 * As outras duas da mesma classe, no mesmo dia: `porTriar` vs `contarTriagem`
 * (232 contra 219) e `jaDoDono` do ficheiro contra o do portao. Corrigir a
 * instancia nunca fechou a classe — o que a fecha e TODOS lerem pela mesma
 * porta, e e isso que este teste tranca.
 */
test('IMPASSE DA JANELA: o runner conta a fila na MESMA janela que o L1', async () => {
  const { readLedger } = await import('./fleet-state.mjs');
  const { porTriar } = await import('./triagem.mjs');

  // 6000 achados: mais do que a janela de 5000, para as duas leituras diferirem
  // se alguem voltar a ler o ficheiro inteiro.
  const linhas = Array.from({ length: 6000 }, (_, i) => JSON.stringify({
    ts: '2026-08-20T12:00:00Z', pilar: 'P2', chave: `k${i}`,
    ficheiro: 'tools/x.js', janela: '1-9', verdict: 'citacao-ok', conclusao: 'achado',
    evidencia: 'tools/x.js:1 => n = 5', resultado_resumo: 'ACHADO: x',
  })).join('\n');
  const readImpl = () => linhas;

  const { receipts } = readLedger('/qualquer', { readImpl });
  assert.equal(receipts.length, 5000, 'a janela e 5000 — se isto mudar, o teste tem de mudar com ela');

  const decisoes = new Map();
  const filaDoL1 = porTriar(receipts, decisoes, Number.MAX_SAFE_INTEGER).length;
  const filaDoRunner = filaHumana(estatisticasDosLoops(receipts, decisoes, ['P2']));

  assert.equal(filaDoRunner, filaDoL1,
    `o runner conta ${filaDoRunner} e o L1 ${filaDoL1} — duas contagens do mesmo numero e o impasse de volta`);

  // E a prova de que a janela importa: ler o ficheiro inteiro daria outro numero.
  const inteiro = readLedger('/qualquer', { readImpl, maxLines: Number.MAX_SAFE_INTEGER }).receipts;
  assert.equal(inteiro.length, 6000);
  assert.notEqual(
    filaHumana(estatisticasDosLoops(inteiro, decisoes, ['P2'])), filaDoL1,
    'se ler o ficheiro inteiro desse o mesmo, este teste nao provava nada',
  );
});
