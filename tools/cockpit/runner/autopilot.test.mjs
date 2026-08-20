/**
 * autopilot.test.mjs — o autopilot tem de se recusar a si proprio.
 *
 * Um nivel de autonomia que sobe porque o dono confia e um autopilot sem freio.
 * Estes testes existem para trancar a propriedade inversa: cada portao abre com
 * um NUMERO MEDIDO e volta a fechar sozinho quando o numero piora, sem estado de
 * confianca acumulado pelo meio.
 *
 * Dois blocos. O primeiro e puro (zero I/O, zero rede, zero modelo) e prova as
 * regras. O segundo levanta o F10 numa porta efemera e prova que o servidor as
 * respeita — incluindo a que mais custa: pedir 3 com o portao 1 fechado nao da
 * 3, da o que os numeros permitem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-autopilot-home-'));
process.env.MOOTER_HOME = HOME_TMP;

const {
  severidade, suporteDaCitacao, snippetDaEvidencia,
  portoes, tectoPermitido, efectivo,
  normalizar, lerEstado, curar,
  NIVEIS, ORCAMENTOS, ORCAMENTO_OMISSAO, orcamento, ESTADO_OMISSAO,
  TETO_REFUTADO_PCT, MIN_TRIADOS, MIN_PRECISAO_PCT, MIN_PATCHES_LIMPOS,
} = await import('./autopilot.mjs');
const { createServer } = await import('./f10-server.mjs');

const REPO = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/** Um achado com a forma que o ledger lhe da, para nao repetir o molde. */
const achado = (o = {}) => ({
  chave: 'k1', pilar: 'P1', ficheiro: 'landing/app/page.tsx', janela: '10-20',
  resultado_resumo: '', evidencia: '', ts: '2026-08-20T10:00:00Z', ...o,
});

/* ══════════════════════ 1 · severidade — lida dos dados ══════════════════════ */

test('uma constante exportada com nome JA e a correccao, nao o defeito', () => {
  const s = severidade(achado({
    resultado_resumo: 'hardcoded 47%',
    evidencia: 'landing/lib/m.ts:4 => export const SAVED_PCT = 47;',
  }));
  assert.equal(s.k, 'low');
  assert.equal(s.motivo, 'nao-e-um-problema');
});

test('estilo e layout nao sao afirmacoes — nao prometem nada a ninguem', () => {
  const s = severidade(achado({
    resultado_resumo: 'hardcoded 14',
    evidencia: 'landing/components/Card.tsx:8 => borderRadius: 14,',
  }));
  assert.equal(s.k, 'low');
  assert.equal(s.motivo, 'trivial');
});

test('numero com unidade em codigo que o cliente le, e a citacao suporta-o: high', () => {
  const s = severidade(achado({
    resultado_resumo: 'hardcoded 47% saving',
    evidencia: 'landing/app/page.tsx:12 => <b>47% cheaper</b>',
  }));
  assert.equal(s.k, 'high');
  assert.equal(s.n, 3);
  assert.equal(s.motivo, null, 'um high NUNCA se fecha sozinho — a decisao e do dono');
  assert.equal(s.suporte, true);
});

/**
 * O caso HandoffStory, medido a 2026-08-20: o achado dizia "$0 hardcoded" e
 * citava a linha 28, que e `title: 'The time back',` — sem `$0` nenhum. O `$0`
 * existe MESMO no ficheiro, noutras linhas. Achado certo, citacao errada.
 * Passava como `citacao-ok` e chegava a fila do dono marcado HIGH.
 */
test('achado certo com citacao errada desce a med — e NAO se descarta', () => {
  const s = severidade(achado({
    ficheiro: 'landing/components/HandoffStory.tsx',
    resultado_resumo: 'hardcoded $0 in customer copy',
    evidencia: "landing/components/HandoffStory.tsx:28 => title: 'The time back',",
  }));
  assert.equal(s.k, 'med');
  assert.equal(s.suporte, false);
  assert.equal(s.motivo, null, 'sem motivo tipado o L1 nao lhe pode tocar');
  assert.match(s.porque, /does NOT contain the number/);
});

test('ficheiro do cliente mas sem afirmacao nenhuma: med, nunca high', () => {
  const s = severidade(achado({ resultado_resumo: 'hardcoded 3', evidencia: 'landing/app/page.tsx:9 => retries = 3' }));
  assert.equal(s.k, 'med', 'o cliente le o ficheiro, mas um 3 nu nao promete nada');
  assert.equal(s.motivo, null, 'med nunca traz motivo tipado — o L1 nao lhe toca');
});

test('ferramenta interna nunca chega a um utilizador: low com motivo', () => {
  const s = severidade(achado({
    ficheiro: 'tools/router/x.js',
    resultado_resumo: 'hardcoded 90%',
    evidencia: 'tools/router/x.js:3 => const alvo = 90; // 90% target',
  }));
  assert.equal(s.k, 'low');
  assert.equal(s.motivo, 'trivial');
});

test('afirmacao com numero em codigo enviado mas nao publico: med', () => {
  const s = severidade(achado({
    ficheiro: 'packages/cli/src/report.ts',
    resultado_resumo: 'says 40% faster',
    evidencia: 'packages/cli/src/report.ts:5 => banner("40% faster")',
  }));
  assert.equal(s.k, 'med');
});

test('sem afirmacao e fora do que o cliente ve: low', () => {
  const s = severidade(achado({ ficheiro: 'packages/cli/src/x.ts', resultado_resumo: 'value 8', evidencia: 'packages/cli/src/x.ts:2 => retries = 8' }));
  assert.equal(s.k, 'low');
  assert.equal(s.motivo, 'trivial');
});

test('um numero dentro de TEXTO que alguem le nao e um valor de estilo', () => {
  const s = severidade(achado({
    resultado_resumo: 'copy claims 47%',
    evidencia: "landing/app/page.tsx:12 => label: 'save 47% today', gap: 4",
  }));
  assert.notEqual(s.k, 'low', 'a excepcao de estilo nao pode engolir texto visivel');
});

/* ═══════════ 2 · suporte da citacao — "existe" nao e "diz o que afirmas" ═══════════ */

test('snippetDaEvidencia devolve o que vem DEPOIS de " => "', () => {
  assert.equal(snippetDaEvidencia('a/b.ts:3 => const x = 1'), 'const x = 1');
  assert.equal(snippetDaEvidencia('sem separador'), '');
  assert.equal(snippetDaEvidencia(null), '');
});

test('sem snippet nao ha veredicto — fingir um seria o mesmo defeito noutro sitio', () => {
  assert.equal(suporteDaCitacao(achado({ resultado_resumo: 'claims 47%', evidencia: '' })).ok, null);
});

test('achado que nao afirma numero nenhum: nada para confrontar', () => {
  const r = suporteDaCitacao(achado({ resultado_resumo: 'this name is confusing', evidencia: 'a.ts:1 => const foo = bar' }));
  assert.equal(r.ok, null);
  assert.match(r.porque, /claims no number/);
});

test('o numero afirmado esta na linha citada, com moeda e percentagem', () => {
  assert.equal(suporteDaCitacao(achado({ resultado_resumo: 'hardcoded $0', evidencia: "a.tsx:8 => price: '$0'" })).ok, true);
  assert.equal(suporteDaCitacao(achado({ resultado_resumo: 'claims 47%', evidencia: 'a.tsx:8 => <b>47%</b>' })).ok, true);
});

test('o numero afirmado NAO esta na linha citada', () => {
  assert.equal(suporteDaCitacao(achado({ resultado_resumo: 'claims 47%', evidencia: "a.tsx:8 => title: 'The time back'" })).ok, false);
});

test('a ancora PROOF nao conta como afirmacao — e a prova, nao a alegacao', () => {
  const r = suporteDaCitacao(achado({
    resultado_resumo: 'no finding\nPROOF: landing/app/page.tsx:12',
    evidencia: "landing/app/page.tsx:12 => title: 'hello'",
  }));
  assert.equal(r.ok, null, 'o 12 do PROOF nao pode virar um numero afirmado');
});

/* ═════════════════════ 3 · portoes — abrir e fechar por numero ═════════════════════ */

test('sem rondas nenhumas o portao 1 esta FECHADO, nunca aberto por omissao', () => {
  const p1 = portoes({})[0];
  assert.equal(p1.aberto, false);
  assert.equal(p1.medido, null);
  assert.match(p1.porque_fechado, /no rounds yet/);
});

test('citacao inventada abaixo do tecto abre o portao 1', () => {
  const p1 = portoes({ recibos: { total: 1000, refutado: 10 } })[0];
  assert.equal(p1.medido, 1);
  assert.equal(p1.aberto, true, `1% tem de estar abaixo de ${TETO_REFUTADO_PCT}%`);
});

test('citacao inventada acima do tecto fecha o portao 1 e diz o numero', () => {
  const p1 = portoes({ recibos: { total: 1000, refutado: 30 } })[0];
  assert.equal(p1.aberto, false);
  assert.match(p1.porque_fechado, /3% of rounds/);
});

/**
 * O defeito medido a 2026-08-20: o proprio L1 assina as decisoes dele como
 * `agente`. Conta-las na precisao punha o autopilot a validar-se a si proprio —
 * ao fim de 26 descartes automaticos o portao 2 dizia "you keep 0% of what it
 * finds" e ficava fechado para sempre, pela razao errada.
 */
test('as decisoes do PROPRIO autopilot nao contam para o portao que o promove', () => {
  const p2 = portoes({
    triagem: { aceite: 0, descartado: 26, issue: 0, por_autor: { agente: 26 } },
  })[1];
  assert.equal(p2.medido, 0, 'triados pelo dono: zero');
  assert.equal(p2.aberto, false);
  assert.match(p2.base, /do not count here/);
});

test('portao 2 abre com decisoes do dono a chegar a barra', () => {
  const p2 = portoes({ triagem: { aceite: 14, descartado: 6, issue: 0 } })[1];
  assert.equal(p2.medido, MIN_TRIADOS);
  assert.equal(p2.aberto, true, `14 de 20 = 70%, e a barra e ${MIN_PRECISAO_PCT}%`);
});

test('portao 2 fecha quando o dono deita fora o que o loop encontra', () => {
  const p2 = portoes({ triagem: { aceite: 12, descartado: 8, issue: 0 } })[1];
  assert.equal(p2.aberto, false);
  assert.match(p2.porque_fechado, /you keep 60%/);
});

test('portao 3 conta patches limpos, e comeca fechado', () => {
  assert.equal(portoes({})[2].aberto, false);
  assert.equal(portoes({ patches: { aceites_sem_rollback: MIN_PATCHES_LIMPOS } })[2].aberto, true);
});

/* ═══════════════ 4 · tecto e efectivo — a coragem nao levanta niveis ═══════════════ */

test('o tecto para no primeiro portao fechado — nao salta por cima', () => {
  const ps = [{ nivel: 1, aberto: false }, { nivel: 2, aberto: true }, { nivel: 3, aberto: true }];
  assert.equal(tectoPermitido(ps), 0, 'o 2 aberto nao vale nada com o 1 fechado');
});

test('pedir 3 com so o portao 1 aberto da 1, e nao 3', () => {
  const ps = portoes({ recibos: { total: 1000, refutado: 10 } });
  assert.equal(efectivo(3, ps), 1);
});

test('quando o numero piora, o nivel efectivo desce sozinho — sem ninguem clicar', () => {
  const bons = portoes({ recibos: { total: 1000, refutado: 10 } });
  const maus = portoes({ recibos: { total: 1000, refutado: 40 } });
  assert.equal(efectivo(1, bons), 1);
  assert.equal(efectivo(1, maus), 0, 'e isto e a caracteristica, nao o defeito');
});

/* ═══════════════════ 5 · estado em disco — fail-closed, sempre ═══════════════════ */

test('nivel fora do dominio cai para 0', () => {
  assert.equal(normalizar({ nivel: 9 }).nivel, 0);
  assert.equal(normalizar({ nivel: -1 }).nivel, 0);
  assert.equal(normalizar({ nivel: 2.5 }).nivel, 0, 'um nivel fraccionario nao existe');
  assert.equal(normalizar({ nivel: '2' }).nivel, 2, 'mas o numero em texto e legivel');
});

test('orcamento desconhecido cai para o de omissao', () => {
  assert.equal(normalizar({ orcamento: 'turbo' }).orcamento, ORCAMENTO_OMISSAO);
  assert.equal(normalizar({ orcamento: 'alto' }).orcamento, 'alto');
  assert.equal(orcamento('turbo'), ORCAMENTOS[ORCAMENTO_OMISSAO]);
});

test('ficheiro ilegivel ou ausente da o estado de omissao, nunca um nivel alto', () => {
  assert.deepEqual(lerEstado('/nao/existe', () => { throw new Error('ENOENT'); }), ESTADO_OMISSAO);
  assert.deepEqual(lerEstado('/x', () => 'isto nao e json'), ESTADO_OMISSAO);
  assert.deepEqual(lerEstado('/x', () => '{"nivel":2,"orcamento":"alto"}'), { nivel: 2, orcamento: 'alto' });
});

test('os quatro niveis dizem o que fazem, e o 3 nomeia o que nunca toca', () => {
  assert.equal(NIVEIS.length, 4);
  assert.match(NIVEIS[2].faz, /Never merges/);
  assert.match(NIVEIS[3].faz, /Never packages\//);
});

/* ═══════════════════════ 6 · curar — o que o L1 pode fechar ═══════════════════════ */

test('curar so toca em low COM motivo tipado — high e med ficam para o dono', () => {
  const fila = [
    achado({ chave: 'a', evidencia: 'landing/x.tsx:1 => gap: 4' }),
    achado({ chave: 'b', resultado_resumo: 'claims 47%', evidencia: 'landing/x.tsx:2 => <b>47%</b>' }),
    achado({ chave: 'c', ficheiro: 'tools/x.js', evidencia: 'tools/x.js:3 => n = 5' }),
  ];
  const actos = curar(fila);
  assert.deepEqual(actos.map((x) => x.chave), ['a', 'c']);
  assert.ok(actos.every((x) => x.decisao === 'descartado' && x.por === 'agente'),
    'cada decisao tem de vir assinada — trabalho sem dono visivel e trabalho que ninguem audita');
  assert.ok(actos.every((x) => x.motivo && x.nota.startsWith('autopilot L1:')));
});

test('curar tem tecto: 200 decisoes de uma vez sao indistinguiveis de um acidente', () => {
  const fila = Array.from({ length: 200 }, (_, i) => achado({ chave: `k${i}`, evidencia: 'landing/x.tsx:1 => gap: 4' }));
  assert.equal(curar(fila).length, 25);
  assert.equal(curar(fila, { cap: 3 }).length, 3);
});

test('curar DEVOLVE o que ha para fazer — nao escreve nada em lado nenhum', () => {
  const antes = fs.readdirSync(HOME_TMP);
  curar([achado({ evidencia: 'landing/x.tsx:1 => gap: 4' })]);
  assert.deepEqual(fs.readdirSync(HOME_TMP), antes);
});

test('fila vazia ou ausente nao rebenta', () => {
  assert.deepEqual(curar([]), []);
  assert.deepEqual(curar(null), []);
});

/* ═════════════════════════ 7 · integracao: o F10 respeita ═════════════════════════ */

async function servidorEfemero() {
  const srv = createServer({
    repoRoot: REPO,
    mooDir: HOME_TMP,
    device: 'autopilot-device',
    fetchImpl: async () => ({ ok: false, json: async () => ({}) }),
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  return { srv, base: `http://127.0.0.1:${port}`, fechar: () => new Promise((r) => srv.close(r)) };
}

test('/fleet.json publica os portoes JA MEDIDOS — o painel nunca os calcula', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const body = await (await fetch(`${base}/fleet.json`)).json();
    assert.ok(body.autopilot, 'o payload tem de trazer o autopilot');
    assert.equal(body.autopilot.portoes.length, 3);
    for (const p of body.autopilot.portoes) {
      assert.ok('medido' in p && 'alvo' in p && 'porque_fechado' in p,
        'cada portao viaja com o numero que o abre E o numero que ha');
    }
    assert.equal(body.autopilot.niveis.length, 4);
    assert.ok(body.autopilot.orcamento_diz, 'o orcamento tem de dizer o que faz, em palavras');
  } finally { await fechar(); }
});

test('POST /autopilot guarda o PEDIDO, e o efectivo continua cortado pelos numeros', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const r = await fetch(`${base}/autopilot`, { method: 'POST', body: JSON.stringify({ nivel: 3, orcamento: 'alto' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, nivel: 3, orcamento: 'alto' });

    const body = await (await fetch(`${base}/fleet.json`)).json();
    assert.equal(body.autopilot.pedido, 3, 'o pedido do dono guarda-se tal e qual');
    assert.ok(body.autopilot.efectivo <= body.autopilot.tecto,
      'o efectivo nunca pode passar o tecto que os numeros permitem');
    assert.equal(body.autopilot.orcamento, 'alto');
  } finally { await fechar(); }
});

test('POST /autopilot recusa um nivel que nao existe, e diz o que aceita', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const mau = await fetch(`${base}/autopilot`, { method: 'POST', body: JSON.stringify({ nivel: 'muito' }) });
    assert.equal(mau.status, 400);

    const orc = await fetch(`${base}/autopilot`, { method: 'POST', body: JSON.stringify({ orcamento: 'turbo' }) });
    assert.equal(orc.status, 400);
    assert.deepEqual((await orc.json()).aceites, Object.keys(ORCAMENTOS));
  } finally { await fechar(); }
});

test('POST /autopilot de fora do loopback e recusado — como o /play e o /stop', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const r = await fetch(`${base}/autopilot`, {
      method: 'POST', headers: { Origin: 'https://exemplo.invalido' }, body: JSON.stringify({ nivel: 1 }),
    });
    assert.equal(r.status, 403);
  } finally { await fechar(); }
});

test('o tique nao faz nada ao nivel 0 — observar quer dizer observar', async () => {
  const { srv, base, fechar } = await servidorEfemero();
  try {
    await fetch(`${base}/autopilot`, { method: 'POST', body: JSON.stringify({ nivel: 0 }) });
    assert.equal(srv.tiqueCurar(() => {}), 0);
  } finally { await fechar(); }
});

test('com o portao 1 fechado o tique SUSPENDE-SE e diz porque — nao cura na mesma', async () => {
  const { srv, base, fechar } = await servidorEfemero();
  try {
    await fetch(`${base}/autopilot`, { method: 'POST', body: JSON.stringify({ nivel: 1 }) });
    let dito = '';
    const feitos = srv.tiqueCurar((s) => { dito += s; });
    assert.equal(feitos, 0);
    assert.match(dito, /SUSPENSO/, 'a suspensao tem de deixar rasto — silencio nao e um recibo');
  } finally { await fechar(); }
});

test('fechar o servidor larga o tique — nada fica a correr depois do close', async () => {
  const { srv, fechar } = await servidorEfemero();
  await fechar();
  assert.equal(srv.listening, false);
});
