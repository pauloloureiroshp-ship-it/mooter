/**
 * recibos-por-hora.test.mjs — a metrica que tirou a % de GPU da manchete.
 *
 * O que se defende aqui e a diferenca entre TRES coisas que um painel
 * preguicoso pinta de igual: «nunca correu» (n/d), «correu e nao entregou»
 * (zero, verdadeiro) e «entregou» (um numero). Confundi-las e o defeito, nao
 * a raridade de qualquer uma delas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..', '..');
const { recibosPorHora, JANELA_H, DIAS_DA_SERIE } = await import('./recibos-por-hora.mjs');

const H = 3600_000;
const AGORA = Date.parse('2026-09-02T15:00:00Z');   // 12:00 em São Paulo
const r = (hAtras, verdict) => ({ ts: new Date(AGORA - hAtras * H).toISOString(), verdict });

test('conta so os que PASSAM o check — volume nao e resultado', () => {
  const m = recibosPorHora([
    r(1, 'citacao-ok'), r(2, 'citacao-ok'), r(3, 'refutado'), r(4, 'sem-citacao'), r(5, 'sem-achado'),
  ], { agora: AGORA });
  assert.equal(m.passam_24h, 2);
  assert.equal(m.rondas_24h, 5);
  assert.equal(m.por_hora, Number((2 / 24).toFixed(2)));
});

test('sem UM recibo no ledger e `n/d` — nao ha janela para dividir', () => {
  const m = recibosPorHora([], { agora: AGORA });
  assert.equal(m.por_hora, null);
  assert.equal(m.ultimo_ts, null);
  assert.match(m.porque, /n\/d/);
});

test('zero nas ultimas 24h e ZERO, nao n/d — e diz que e real', () => {
  const m = recibosPorHora([r(200, 'citacao-ok')], { agora: AGORA });
  assert.equal(m.por_hora, 0, 'uma paragem decidida nao pode aparecer como falha de medicao');
  assert.equal(m.idade_h, 200);
  assert.match(m.porque, /o número é real/);
});

test('a janela e mesmo 24 h — um recibo de ha 25 h nao entra', () => {
  const m = recibosPorHora([r(23.9, 'citacao-ok'), r(24.1, 'citacao-ok')], { agora: AGORA });
  assert.equal(m.passam_24h, 1);
});

test('um recibo do FUTURO nao conta — um relogio torto nao inflaciona a metrica', () => {
  const m = recibosPorHora([r(-5, 'citacao-ok'), r(1, 'citacao-ok')], { agora: AGORA });
  assert.equal(m.passam_24h, 1);
});

test('a serie tem no maximo 7 dias e vem por ordem cronologica', () => {
  const recibos = [];
  for (let d = 0; d < 12; d += 1) recibos.push(r(d * 24 + 1, 'citacao-ok'));
  const m = recibosPorHora(recibos, { agora: AGORA });
  assert.equal(m.serie.length, DIAS_DA_SERIE);
  const datas = m.serie.map((x) => x.date);
  assert.deepEqual([...datas].sort(), datas, 'a serie saiu fora de ordem');
});

test('a serie separa rondas de passam — senao voltava a medir volume', () => {
  const m = recibosPorHora([r(1, 'citacao-ok'), r(2, 'refutado'), r(3, 'refutado')], { agora: AGORA });
  const hoje = m.serie[m.serie.length - 1];
  assert.equal(hoje.rounds, 3);
  assert.equal(hoje.passam, 1);
});

test('recibos sem data sao ignorados, nao contados como zero', () => {
  const m = recibosPorHora([{ verdict: 'citacao-ok' }, r(1, 'citacao-ok')], { agora: AGORA });
  assert.equal(m.passam_24h, 1);
  assert.equal(m.serie.length, 1);
});

test('a fonte viaja com o numero — um numero sem fonte nao se publica', () => {
  const m = recibosPorHora([r(1, 'citacao-ok')], { agora: AGORA });
  assert.match(m.fonte, /runner-ledger\.jsonl/);
  assert.match(m.fonte, /citacao-ok/);
  assert.equal(m.janela_h, JANELA_H);
});

/* ── a doutrina: a % de GPU sai de cima da dobra ──────────────────────────── */

const PAINEL = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html'), 'utf8');
/**
 * Tudo do cabecalho ate ao primeiro cartao que ja nao cabe no primeiro ecra.
 *
 * A casca nao tem `<body>` (e um fragmento servido pelo F10), por isso a
 * ancora de inicio e o `<header>` — e um `indexOf` que devolvesse -1 daria um
 * `slice(-1, N)` vazio e o teste passava sem olhar para nada. Por isso as duas
 * ancoras sao conferidas primeiro.
 */
const INICIO = PAINEL.indexOf('<header');
const FIM = PAINEL.indexOf('id="onboard-card"');
if (INICIO < 0 || FIM < 0 || FIM <= INICIO) {
  throw new Error(`ancoras da dobra nao encontradas (header=${INICIO}, onboard=${FIM})`);
}
const ACIMA_DA_DOBRA = PAINEL.slice(INICIO, FIM);

test('a % de GPU ja nao esta acima da dobra', () => {
  assert.ok(!/This device's GPU<\/h2>/.test(ACIMA_DA_DOBRA),
    'o cartao da GPU voltou para cima da dobra — mede esforco, nao resultado');
  assert.ok(!/id="gpu-val"/.test(ACIMA_DA_DOBRA), 'o mostrador da percentagem voltou para cima');
});

test('a metrica nova ESTA acima da dobra, e com a fonte', () => {
  assert.match(ACIMA_DA_DOBRA, /Receipts that pass the check/);
  assert.match(ACIMA_DA_DOBRA, /id="rph-val"/);
  assert.match(ACIMA_DA_DOBRA, /id="rph-serie"/);
});

test('a GPU nao foi apagada — desceu, e continua a ser medida', () => {
  assert.match(PAINEL, /id="gpu-card"/, 'apagar a medicao nao era o pedido');
  assert.match(PAINEL, /id="gpu-val"/);
  assert.match(PAINEL, /function renderGpu/, 'o renderizador da GPU tem de continuar a existir');
});

test('o grafico escreve HTML a partir de dados — logo escapa-os', () => {
  assert.match(PAINEL, /const esc = /, 'a casca escreve innerHTML com dados sem ter escape');
  assert.match(PAINEL, /esc\(d\.date\)/, 'a data do ledger entra no SVG sem escape');
});

test('o eixo do grafico comeca em zero — um eixo truncado mente com dados certos', () => {
  assert.match(PAINEL, /\(d\.passam \/ max\) \* 42/, 'a altura da barra deixou de ser proporcional ao valor');
});

test('o /fleet.json publica a metrica, e um ledger ilegivel nao o derruba', () => {
  const srv = fs.readFileSync(path.join(AQUI, 'f10-server.mjs'), 'utf8');
  assert.match(srv, /estado\.recibos_por_hora = recibosPorHora\(receipts\)/);
  const bloco = srv.slice(srv.indexOf('estado.recibos_por_hora = recibosPorHora'));
  assert.match(bloco.slice(0, 800), /catch \(e\)/, 'sem catch, um ledger corrompido derruba o painel inteiro');
});
