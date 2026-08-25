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
  naAmostraDeAuditoria, anomaliaDeDreno, AUDITORIA_1_EM, ANOMALIA_FACTOR, ANOMALIA_MIN, reservarParaODono,
} = await import('./autopilot.mjs');
const { createServer } = await import('./f10-server.mjs');
const { AUTORES } = await import('./triagem.mjs');

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
    triagem: {
      aceite: 0, descartado: 26, issue: 0,
      por_autor: { agente: 26 },
      do_dono: { aceite: 0, descartado: 0, issue: 0 },
    },
  })[1];
  assert.equal(p2.medido, 0, 'triados pelo dono: zero');
  assert.equal(p2.aberto, false);
  assert.match(p2.base, /do not count here/);
});

/**
 * A regressao de 2026-08-24, em forma de teste.
 *
 * O portao lia os TOTAIS e subtraia `por_autor.agente` — uma lista negra. As
 * 1448 decisoes que existiam no device real estavam assinadas `claude`, que a
 * lista negra nao apanhava: o painel dizia ao dono que ele mantinha 0% do que o
 * loop encontra, sobre 1448 decisoes que nao eram dele e zero que fossem.
 *
 * A lista branca inverte o default: o que nao esta provado como do dono nao
 * conta. Um autor novo (`claude`, ou qualquer outro que venha a existir) fica
 * de fora por construcao, sem ninguem se lembrar de o acrescentar a lista.
 */
test('LISTA BRANCA: um autor nao-humano NOVO nao entra no denominador do L2', () => {
  const p2 = portoes({
    triagem: {
      aceite: 0, descartado: 1448, issue: 0,
      por_autor: { claude: 1448 },
      do_dono: { aceite: 0, descartado: 0, issue: 0 },
    },
  })[1];
  assert.equal(p2.medido, 0, 'nenhuma das 1448 e do dono');
  assert.equal(p2.aberto, false);
  assert.equal(p2.medido_ha_dados, false);
  assert.match(p2.base, /no data yet/, 'denominador zero diz NO DATA, nunca 0%');
  assert.doesNotMatch(p2.base, /\b0%/, 'nunca fabricar uma percentagem sem denominador');
  assert.match(p2.porque_fechado, /no data yet/);
  assert.match(p2.porque_fechado, /the 1448 not signed by you/, 'nomeia-as, para o dono saber que existem');
  assert.doesNotMatch(p2.porque_fechado, /you keep/, 'nao acusar o dono de um juizo que ele nao fez');
});

test('do_dono ausente => portao 2 FECHADO, nunca aberto por omissao', () => {
  const p2 = portoes({ triagem: { aceite: 99, descartado: 0, issue: 0 } })[1];
  assert.equal(p2.medido, 0, 'sem a lista branca nao ha denominador');
  assert.equal(p2.aberto, false);
  assert.equal(p2.medido_ha_dados, false);
});

test('portao 2 abre com decisoes do dono a chegar a barra', () => {
  const p2 = portoes({ triagem: { do_dono: { aceite: 14, descartado: 6, issue: 0 } } })[1];
  assert.equal(p2.medido, MIN_TRIADOS);
  assert.equal(p2.medido_ha_dados, true);
  assert.equal(p2.aberto, true, `14 de 20 = 70%, e a barra e ${MIN_PRECISAO_PCT}%`);
});

test('portao 2 fecha quando o dono deita fora o que o loop encontra', () => {
  const p2 = portoes({ triagem: { do_dono: { aceite: 12, descartado: 8, issue: 0 } } })[1];
  assert.equal(p2.aberto, false);
  assert.match(p2.porque_fechado, /you keep 60%/);
});

/** Decisoes do dono MISTURADAS com as de agentes: so as dele contam. */
test('LISTA BRANCA: o dono e os agentes no mesmo ledger — so o dono conta', () => {
  const p2 = portoes({
    triagem: {
      aceite: 15, descartado: 1451, issue: 2,
      por_autor: { dono: 20, claude: 1448 },
      do_dono: { aceite: 15, descartado: 3, issue: 2 },
    },
  })[1];
  assert.equal(p2.medido, 20, 'os 1448 do `claude` nao inflacionam nem diluem');
  assert.equal(p2.aberto, true, '17 mantidos de 20 = 85%');
  assert.match(p2.base, /85% kept \(17 of 20 decided by you\)/);
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
  // `auditoria: false` porque este teste e sobre a REGRA DE SEVERIDADE. Com a
  // amostra ligada, 'a' ou 'c' podiam cair nela e o teste passaria a medir duas
  // coisas ao mesmo tempo — a amostra tem os seus testes, mais abaixo.
  const actos = curar(fila, { auditoria: false });
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

/* ═══════ 8 · o payload leva a severidade e o suporte — o painel nao os calcula ═══════ */

/**
 * Ponta a ponta, com o caso real: o HandoffStory afirma `$0` e cita uma linha
 * que nao tem `$0` nenhum. Antes, isto chegava a fila do dono marcado HIGH,
 * porque `citacao-ok` so responde a "a linha existe no disco".
 */
test('/fleet.json marca o achado mal citado — med, com o porque, sem o descartar', async () => {
  const recibo = {
    ts: '2026-08-20T09:00:00Z',
    pilar: 'P6',
    conclusao: 'achado',
    verdict: 'citacao-ok',
    ficheiro: 'landing/components/HandoffStory.tsx',
    janela: '20-40',
    resultado_resumo: 'hardcoded $0 in customer-facing copy',
    evidencia: "landing/components/HandoffStory.tsx:28 => title: 'The time back',",
  };
  const ledger = path.join(HOME_TMP, 'runner-ledger.jsonl');
  fs.writeFileSync(ledger, JSON.stringify(recibo) + '\n');

  const { base, fechar } = await servidorEfemero();
  try {
    const body = await (await fetch(`${base}/fleet.json`)).json();
    const alvo = (body.por_triar || []).find((a) => a.ficheiro === recibo.ficheiro);
    assert.ok(alvo, 'o achado tem de chegar a fila de triagem');

    assert.ok(alvo.sev, 'a severidade tem de viajar JA CALCULADA — o painel nao a recalcula');
    assert.equal(alvo.sev.k, 'med', 'sem suporte na citacao nao pode ser high: nao esta provado onde esta o defeito');
    assert.ok(alvo.sev.porque, 'e tem de trazer o porque, senao nao se corrige a regra');

    assert.equal(alvo.suporte, false);
    assert.match(alvo.suporte_porque, /does NOT contain the number/);
  } finally {
    fs.rmSync(ledger, { force: true });
    await fechar();
  }
});

test('um achado bem citado continua high — o aviso nao pode marcar toda a gente', async () => {
  const ledger = path.join(HOME_TMP, 'runner-ledger.jsonl');
  fs.writeFileSync(ledger, JSON.stringify({
    ts: '2026-08-20T09:05:00Z', pilar: 'P6', conclusao: 'achado', verdict: 'citacao-ok',
    ficheiro: 'landing/app/page.tsx', janela: '1-20',
    resultado_resumo: 'hardcoded 47% saving on screen',
    evidencia: 'landing/app/page.tsx:12 => <b>47% cheaper</b>',
  }) + '\n');

  const { base, fechar } = await servidorEfemero();
  try {
    const body = await (await fetch(`${base}/fleet.json`)).json();
    const alvo = (body.por_triar || []).find((a) => a.ficheiro === 'landing/app/page.tsx');
    assert.equal(alvo.sev.k, 'high');
    assert.equal(alvo.suporte, true);
  } finally {
    fs.rmSync(ledger, { force: true });
    await fechar();
  }
});

/* ══════════════ 9 · o enunciado do P6 — o que produziu 16 dos 17 refutado ══════════════ */

/**
 * A causa foi medida, nao suposta: em 1.645 rondas houve 17 `refutado`
 * (citacoes para linhas que nao existem) e DEZASSEIS vieram do P6. Era o unico
 * enunciado que mandava o modelo navegar entre linhas — "look on the same line
 * OR THE LINE NEXT TO IT" — e o unico sem ancora final de prova. A um 14B a
 * quem se pede aritmetica de numeros de linha, o numero inventa-se.
 */
test('o P6 nao volta a mandar o modelo navegar entre linhas', async () => {
  const { PILLARS } = await import('./context-pack.mjs');
  const ask = PILLARS.P6.ask;
  assert.doesNotMatch(ask, /line next\s+to it/i, 'foi isto que produziu 16 dos 17 refutado');
  assert.match(ask, /VISIBLE ON THAT SAME\s+LINE/, 'a origem tem de estar na PROPRIA linha copiada');
  assert.match(ask, /PROOF: <file>:/, 'a ancora de prova que o P1..P5 ja tinham e o P6 nao');
  assert.match(ask, /NO FINDING/, '"nao ha" tem de ser uma resposta certa, e legivel pelo verificador');
});

test('o sentinela do P6 e um que o repo sabe mesmo ler', async () => {
  const { PILLARS } = await import('./context-pack.mjs');
  const verifier = fs.readFileSync(fileURLToPath(new URL('./evidence-verifier.mjs', import.meta.url)), 'utf8');
  assert.match(verifier, /NO FINDING/, 'o verificador tem de conhecer a saida que o pilar pede');
  // O `EVERY NUMBER HAS AN ORIGIN` do #312 nao era lido por nada: um sentinela
  // que so o proprio enunciado conhece nao e uma saida, e um beco.
  assert.doesNotMatch(PILLARS.P6.ask, /EVERY NUMBER HAS AN ORIGIN/);
});

/* ─────── o portao nao pode abrir com lixo (adversario da FASE 1) ─────── */

/**
 * `Number(x) || 0` aceitava strings, floats e negativos. O adversario abriu o
 * portao 2 com `{aceite:100, descartado:-80}` e arrancou-lhe a frase
 * "500% kept (100 of 20)". Um portao documentado como fail-closed nao pode
 * depender de o chamador ser bem-comportado.
 */
test('LIXO: strings nao abrem o portao 2', () => {
  const p2 = portoes({ triagem: { do_dono: { aceite: '14', descartado: '6', issue: '0' } } })[1];
  assert.equal(p2.medido, 0);
  assert.equal(p2.aberto, false);
});

test('LIXO: floats nao abrem o portao 2', () => {
  const p2 = portoes({ triagem: { do_dono: { aceite: 14.5, descartado: 5.5, issue: 0 } } })[1];
  assert.equal(p2.medido, 0);
  assert.equal(p2.aberto, false);
});

test('LIXO: negativos nao fabricam uma percentagem impossivel', () => {
  const p2 = portoes({ triagem: { do_dono: { aceite: 100, descartado: -80, issue: 0 } } })[1];
  assert.equal(p2.medido, 100, 'o -80 vale zero; o 100 e um inteiro valido');
  assert.doesNotMatch(p2.base, /500%/, 'nunca uma percentagem acima de 100');
  const dentro = /(\d+)% kept/.exec(p2.base);
  assert.ok(dentro && Number(dentro[1]) <= 100, `percentagem fora de [0,100]: ${p2.base}`);
});

test('LIXO: NaN, Infinity e objectos valem zero', () => {
  for (const mau of [NaN, Infinity, -Infinity, {}, [], 'vinte', null, undefined]) {
    const p2 = portoes({ triagem: { do_dono: { aceite: mau, descartado: mau, issue: mau } } })[1];
    assert.equal(p2.medido, 0, `${String(mau)} nao pode virar contagem`);
    assert.equal(p2.aberto, false);
  }
});

/* ─────── a copia nao pode afirmar mais do que os dados provam ─────── */

/**
 * A ultima decisao por chave e a que vale. O dono pode ter decidido e um agente
 * ter sobreposto depois — dizer-lhe "you have not decided on any finding" e
 * falso, e ele sabe que e falso, o que e pior do que ser so impreciso.
 */
test('COPIA: sem decisoes VIGENTES do dono nao se diz que ele nunca decidiu', () => {
  const p2 = portoes({
    triagem: { do_dono: { aceite: 0, descartado: 0, issue: 0 }, por_autor: { agente: 1, dono: 0 } },
  })[1];
  assert.match(p2.base, /no current decisions signed by you/);
  assert.doesNotMatch(p2.base, /have not decided/, 'ele pode ter decidido e sido sobreposto');
});

/**
 * `n-d` e autores desconhecidos NAO sao agentes. Chamar-lhes agentes e mentir
 * por arredondamento: a unica coisa que se sabe deles e que nao sao do dono.
 */
test('COPIA: linhas sem assinatura nao sao promovidas a "agentes"', () => {
  const p2 = portoes({
    triagem: {
      do_dono: { aceite: 0, descartado: 0, issue: 0 },
      por_autor: { 'n-d': 1, 'script-desconhecido': 1, claude: 1 },
    },
  })[1];
  assert.match(p2.porque_fechado, /the 3 not signed by you/);
  assert.doesNotMatch(p2.porque_fechado, /signed by agents/, 'so uma das tres e um agente conhecido');
  assert.doesNotMatch(p2.base, /closed by agents/);
});

/* ─────── o canal: um curl local nao pode assinar como o dono ─────── */

/**
 * O adversario da FASE 1 fez isto e passou:
 *
 *   POST /triagem  {chave, decisao}   sem Origin, sem `por`
 *   -> 200, e o ledger ficou com  {"por":"dono","via":"painel"}
 *
 * Qualquer processo local escrevia uma decisao em nome do dono, na contagem
 * que abre o nivel 2. `Origin` nao e uma credencial, mas e o unico sinal que
 * existe sem introduzir uma — e um browser mandado pelo painel envia-o sempre
 * num POST, enquanto um `curl` nao envia nenhum.
 */
test('CANAL: sem Origin e sem `por`, a escrita e RECUSADA', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/triagem`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'curl-spoof', decisao: 'aceite' }),
    });
    assert.equal(res.status, 400, 'um cliente sem Origin tem de se identificar');
    const body = await res.json();
    assert.match(body.erro, /tem de se identificar/);
    assert.deepEqual(body.aceites, AUTORES);
  } finally { await fechar(); }
});

test('CANAL: sem Origin MAS com `por` explicito, escreve — e o `via` diz o que se viu', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/triagem`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave: 'cli-honesto', decisao: 'aceite', por: 'agente' }),
    });
    assert.equal(res.status, 200);
    const { registado } = await res.json();
    assert.equal(registado.por, 'agente');
    assert.equal(registado.via, 'cliente-local', 'nao se carimba `painel` no que nao veio do painel');
  } finally { await fechar(); }
});

test('CANAL: com Origin de loopback, o painel continua a assinar como dono sem dizer `por`', async () => {
  const { base, fechar } = await servidorEfemero();
  try {
    const res = await fetch(`${base}/triagem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:9999' },
      body: JSON.stringify({ chave: 'do-painel', decisao: 'aceite' }),
    });
    assert.equal(res.status, 200, 'o botao do painel nao pode ter partido');
    const { registado } = await res.json();
    assert.equal(registado.por, 'dono');
    assert.equal(registado.via, 'painel');
  } finally { await fechar(); }
});

/* ───────────── auditoria ao dreno: a rede que impede a cegueira ───────────── */

/**
 * Ligar o nivel 1 resolve um problema e cria outro. Ele drena a fila — e uma
 * fila vazia nao e a mesma coisa que um loop saudavel: se um pilar activo
 * regredir e passar a despejar lixo `low`-com-motivo, o dreno absorve-o em
 * silencio e o painel fica sem denominador para o revelar.
 */
test('AUDITORIA: a amostra e ESTAVEL — a mesma chave da sempre o mesmo veredicto', () => {
  for (const k of ['P2.abc|a.js:1-9:deadbeef', 'P3.zzz|b.mjs:10-20:cafe', '', 'x']) {
    const primeiro = naAmostraDeAuditoria(k);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(naAmostraDeAuditoria(k), primeiro,
        'uma fila que muda sozinha entre dois olhares e uma fila em que ninguem confia');
    }
  }
});

test('AUDITORIA: a taxa fica perto de 1 em N, sem fabricar precisao', () => {
  const chaves = Array.from({ length: 4000 }, (_, i) => `P2.${i}|f${i}.js:1-9:sha${i}`);
  const n = chaves.filter((k) => naAmostraDeAuditoria(k)).length;
  const esperado = 4000 / AUDITORIA_1_EM;
  // Banda larga de proposito: um hash nao e um gerador uniforme e prometer
  // "exactamente 5%" seria inventar uma precisao que isto nao tem.
  assert.ok(n > esperado * 0.5 && n < esperado * 1.6,
    `esperado ~${esperado}, medido ${n} — fora de qualquer banda razoavel`);
  assert.ok(n > 0, 'uma amostra vazia nao e amostra');
});

test('AUDITORIA: chave vazia nunca entra na amostra', () => {
  assert.equal(naAmostraDeAuditoria(''), false);
  assert.equal(naAmostraDeAuditoria(null), false);
  assert.equal(naAmostraDeAuditoria(undefined), false);
});

test('AUDITORIA: umEm=1 reserva tudo — o dreno pode ser desligado sem o apagar', () => {
  assert.equal(naAmostraDeAuditoria('qualquer', { umEm: 1 }), true);
  const fila = Array.from({ length: 30 }, (_, i) => achado({ chave: `k${i}`, evidencia: 'landing/x.tsx:1 => gap: 4' }));
  assert.equal(curar(fila, { umEm: 1 }).length, 0, 'com 1-em-1 nada e fechado pelo agente');
});

test('AUDITORIA: curar reserva uma parte da fila para o dono', () => {
  const fila = Array.from({ length: 400 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}`, evidencia: 'landing/x.tsx:1 => gap: 4' }));
  // `jaDoDono` acima do alvo => a reserva e SO a amostra por hash, sem complemento.
  const comAmostra = curar(fila, { cap: Number.MAX_SAFE_INTEGER, jaDoDono: MIN_TRIADOS });
  const semAmostra = curar(fila, { cap: Number.MAX_SAFE_INTEGER, auditoria: false });
  assert.equal(semAmostra.length, 400, 'sem amostra, o dreno leva tudo');
  assert.ok(comAmostra.length < semAmostra.length, 'com amostra, alguma coisa fica para o dono');
  const reservados = semAmostra.length - comAmostra.length;
  assert.ok(reservados > 0, `nada foi reservado — a rede nao existe (${reservados})`);
  const previstos = fila.filter((a) => naAmostraDeAuditoria(a.chave)).length;
  assert.equal(reservados, previstos, 'o que curar reserva tem de bater com o predicado, senao sao duas verdades');
});

/* ── o estado absorvente que o adversario da FASE 2 encontrou (DEFEITO HIGH) ── */

/**
 * A versao anterior reservava 1-em-20 e mais nada. O runtime le uma JANELA de
 * 5000 linhas do ledger, nao o ficheiro todo: onde eu media 219 na fila e 12
 * reservados, o tique via 138 e reservava 5. A fila estabilizava vazia com 5
 * decisoes do dono, e o portao 2 exige 20 — nunca abria. A tese da FASE 2
 * ("a amostra e a torneira do L2") era falsa como estava escrita.
 */
test('SEM FOME: com a fila pequena, a reserva garante o que o portao 2 exige', () => {
  const fila = Array.from({ length: 138 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}`, evidencia: 'landing/x.tsx:1 => gap: 4' }));
  const soAmostra = fila.filter((a) => naAmostraDeAuditoria(a.chave)).length;
  assert.ok(soAmostra < MIN_TRIADOS, `o cenario so vale se a amostra sozinha nao chegar (${soAmostra})`);

  const reservadas = reservarParaODono(fila, { jaDoDono: 0 });
  // A escada e aninhada, por isso um degrau da >= o que falta, nao exactamente.
  // Reservar a mais custa dreno; reservar a menos custa o portao fechado para
  // sempre. A troca esta feita do lado que nao cria prisoes.
  assert.ok(reservadas.size >= MIN_TRIADOS, `reserva pelo menos o que falta (${reservadas.size})`);
  const actos = curar(fila, { cap: Number.MAX_SAFE_INTEGER, jaDoDono: 0 });
  assert.equal(actos.length, 138 - reservadas.size, 'o dreno leva exactamente o resto');
});

test('SEM FOME: a amostra por hash entra SEMPRE — o complemento e so o que falta', () => {
  const fila = Array.from({ length: 138 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  const porHash = fila.filter((a) => naAmostraDeAuditoria(a.chave)).map((a) => a.chave);
  const reservadas = reservarParaODono(fila, { jaDoDono: 0 });
  for (const k of porHash) assert.ok(reservadas.has(k), `a amostra representativa nao pode ser trocada pelo complemento: ${k}`);
});

test('SEM FOME: com o alvo ja cumprido, volta a ser so 1-em-20 — vigilancia continua', () => {
  const fila = Array.from({ length: 400 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  const reservadas = reservarParaODono(fila, { jaDoDono: MIN_TRIADOS });
  const porHash = fila.filter((a) => naAmostraDeAuditoria(a.chave)).length;
  assert.equal(reservadas.size, porHash, 'nada de complemento quando o portao ja tem material');
  assert.ok(reservadas.size > 0, 'mas a vigilancia nao para — 1-em-20 para sempre');
});

test('SEM FOME: com o dono a meio, reserva o maior entre a amostra e o que falta', () => {
  const fila = Array.from({ length: 138 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  const porHash = fila.filter((a) => naAmostraDeAuditoria(a.chave)).length;
  // A amostra por hash NUNCA encolhe — ela e a parte representativa, e e o que
  // vigia o dreno. O complemento so aparece quando ela sozinha nao chega.
  assert.ok(reservarParaODono(fila, { jaDoDono: 15 }).size >= Math.max(porHash, MIN_TRIADOS - 15));
  assert.ok(reservarParaODono(fila, { jaDoDono: 0 }).size >= Math.max(porHash, MIN_TRIADOS));
  assert.equal(reservarParaODono(fila, { jaDoDono: 100 }).size, porHash, 'acima do alvo, so a amostra');
});

test('SEM FOME: uma fila mais curta do que o alvo reserva-se inteira, sem rebentar', () => {
  const fila = Array.from({ length: 3 }, (_, i) => achado({ chave: `k${i}` }));
  const reservadas = reservarParaODono(fila, { jaDoDono: 0 });
  assert.equal(reservadas.size, 3, 'nao se inventam achados que nao existem');
  assert.equal(curar(fila, { cap: Number.MAX_SAFE_INTEGER, jaDoDono: 0 }).length, 0);
});

/* ───────────── anomalia de dreno: quando o dreno muda de tamanho ───────────── */

// 12:00Z = 09:00 na hora do dono (UTC-3): a mesma data nos dois fusos. Horas
// baixas (00-02Z) cairiam no dia ANTERIOR dele — que e precisamente o defeito
// que o agrupamento por `ownerDay` veio corrigir.
const dia = (d, n) => Array.from({ length: n }, (_, i) => ({ ts: `${d}T12:${String(i % 60).padStart(2, '0')}:00Z`, chave: `k${d}${i}` }));

test('ANOMALIA: sem historico nao ha linha de base — e nao se inventa uma', () => {
  assert.equal(anomaliaDeDreno([]).base, null);
  assert.equal(anomaliaDeDreno([]).anomalia, false);
  assert.match(anomaliaDeDreno([]).porque, /nada a comparar/);
  const so1 = anomaliaDeDreno(dia('2026-08-20', 50));
  assert.equal(so1.base, null, 'um unico dia nao e uma linha de base');
  assert.equal(so1.anomalia, false);
  assert.match(so1.porque, /ainda nao ha linha de base/);
});

test('ANOMALIA: um dia dentro do normal nao dispara', () => {
  const r = anomaliaDeDreno([...dia('2026-08-20', 20), ...dia('2026-08-21', 22), ...dia('2026-08-22', 25)]);
  assert.equal(r.base, 21, 'mediana de [20, 22] com numero par de dias = a media dos dois do meio');
  assert.equal(r.hoje, 25);
  assert.equal(r.anomalia, false);
  assert.match(r.porque, /dentro do normal/);
});

test('ANOMALIA: um pilar a regredir dispara — 3x a mediana', () => {
  const r = anomaliaDeDreno([...dia('2026-08-20', 20), ...dia('2026-08-21', 20), ...dia('2026-08-22', 200)]);
  assert.equal(r.base, 20);
  assert.equal(r.hoje, 200);
  assert.equal(r.anomalia, true, `200 contra mediana 20 sao 10x, e a fasquia e ${ANOMALIA_FACTOR}x`);
  assert.match(r.porque, /pode ter regredido/);
});

/**
 * Mediana e nao media, e a razao e esta: com media, o proprio dia mau levanta a
 * fasquia que devia dispara-lo, e um segundo dia igual ja passa despercebido.
 */
test('ANOMALIA: um dia mau nao levanta a fasquia para o dia seguinte', () => {
  const historia = [...dia('2026-08-18', 10), ...dia('2026-08-19', 10), ...dia('2026-08-20', 10), ...dia('2026-08-21', 300)];
  assert.equal(anomaliaDeDreno(historia).anomalia, true);
  const outraVez = [...historia, ...dia('2026-08-22', 300)];
  const r = outraVez.length && anomaliaDeDreno(outraVez);
  assert.equal(r.base, 10, 'a mediana ignora o outlier; uma media daria 82,5 e calava o alarme');
  assert.equal(r.anomalia, true, 'o segundo dia mau continua a ser um dia mau');
});

test('ANOMALIA: volume pequeno nao merece alarme — nao ensinar o dono a ignora-lo', () => {
  const r = anomaliaDeDreno([...dia('2026-08-20', 1), ...dia('2026-08-21', 1), ...dia('2026-08-22', 9)]);
  assert.equal(r.anomalia, false, `9 e 9x a mediana, mas esta abaixo do minimo de ${ANOMALIA_MIN}`);
  assert.match(r.porque, /abaixo do minimo/);
});

test('ANOMALIA: actos sem data sao ignorados, nao contados como hoje', () => {
  const r = anomaliaDeDreno([...dia('2026-08-20', 20), ...dia('2026-08-21', 20), { chave: 'sem-ts' }, { ts: 'lixo' }]);
  assert.equal(r.ultimo, '2026-08-21');
  assert.equal(Object.keys(r.por_dia).length, 2, 'uma data ilegivel nao inventa um dia');
});

/* ── as tres cegueiras do detector (adversario da FASE 2) ── */

/**
 * `ts.slice(0,10)` agrupava em UTC. O dono e `America/Sao_Paulo` (UTC-3) e o
 * canon do projecto diz que a apresentacao e SEMPRE convertida — 30 actos da
 * mesma noite dele apareciam como 15+15 em dois dias, e o alarme calava-se.
 */
test('CEGUEIRA 1 — fuso: um dia do dono nao se parte ao meio', () => {
  const actos = [];
  for (let i = 0; i < 15; i += 1) actos.push({ ts: `2026-08-20T22:${String(i).padStart(2, '0')}:00Z`, chave: `a${i}` }); // 19h local, dia 20
  for (let i = 0; i < 15; i += 1) actos.push({ ts: `2026-08-21T01:${String(i).padStart(2, '0')}:00Z`, chave: `b${i}` }); // 22h local, dia 20
  const r = anomaliaDeDreno(actos);
  assert.deepEqual(Object.keys(r.por_dia), ['2026-08-20'], 'os 30 actos sao do MESMO dia do dono');
  assert.equal(r.por_dia['2026-08-20'], 30);
});

/**
 * O detector so olhava para cima. `100,100,100 -> 3` — a queda mais brutal
 * possivel — passava como "abaixo do minimo", ou seja, como sossego. Um pilar
 * que morre e tao grave como um pilar que rebenta, e a fila fica igualmente
 * vazia nos dois casos.
 */
test('CEGUEIRA 2 — queda: um pilar que MORRE dispara o alarme', () => {
  const r = anomaliaDeDreno([...dia('2026-08-18', 100), ...dia('2026-08-19', 100), ...dia('2026-08-20', 100), ...dia('2026-08-21', 3)]);
  assert.equal(r.anomalia, true, '100 -> 3 nao pode ser sossego');
  assert.equal(r.direccao, 'caiu');
  assert.match(r.porque, /CAIU/);
  assert.match(r.porque, /pode ter morrido/);
});

test('CEGUEIRA 2b: subir continua a disparar, e diz que subiu', () => {
  const r = anomaliaDeDreno([...dia('2026-08-20', 20), ...dia('2026-08-21', 20), ...dia('2026-08-22', 200)]);
  assert.equal(r.anomalia, true);
  assert.equal(r.direccao, 'subiu');
  assert.match(r.porque, /pode ter regredido/);
});

/**
 * Medido pelo adversario: P2 1->101 e P3 99->99 da um agregado 100->200, que
 * nao chega a 3x e nao dispara. P2 sozinho e 101x. O agregado nao chega.
 */
test('CEGUEIRA 3 — diluicao: um pilar a rebentar nao se esconde atras de outro', () => {
  const comPilar = (d, p, n) => Array.from({ length: n }, (_, i) => ({ ts: `${d}T12:00:00Z`, pilar: p, chave: `${p}-${d}-${i}` }));
  const actos = [
    ...comPilar('2026-08-19', 'P2', 1), ...comPilar('2026-08-19', 'P3', 99),
    ...comPilar('2026-08-20', 'P2', 1), ...comPilar('2026-08-20', 'P3', 99),
    ...comPilar('2026-08-21', 'P2', 101), ...comPilar('2026-08-21', 'P3', 99),
  ];
  const r = anomaliaDeDreno(actos);
  assert.equal(r.hoje, 200);
  assert.ok(r.hoje < r.base * ANOMALIA_FACTOR, 'o agregado sozinho NAO dispararia');
  assert.equal(r.anomalia, true, 'mas o pilar sozinho dispara, e isso basta');
  assert.ok(r.suspeitos.some((s) => s.pilar === 'P2' && s.direccao === 'subiu'), JSON.stringify(r.suspeitos));
  assert.match(r.porque, /Por pilar: P2/);
});

test('sem pilar nos actos, o detector agregado continua a funcionar', () => {
  const r = anomaliaDeDreno([...dia('2026-08-20', 20), ...dia('2026-08-21', 200)]);
  assert.equal(r.anomalia, true);
  assert.deepEqual(r.suspeitos, [], 'sem pilar nao se inventam suspeitos');
});

/**
 * A FOME PELA PORTA DO LADO — 2.a ronda adversarial da FASE 2.
 *
 * A correccao da fome fez o tique passar `jaDoDono` a reserva. Mas o tique
 * contava as decisoes do dono no FICHEIRO INTEIRO, e o portao 2 conta so as que
 * ainda casam com um achado dentro da JANELA de 5000 linhas do ledger.
 *
 * Com o ledger a crescer, as decisoes antigas do dono saem da janela: o tique
 * continuava a ver `jaDoDono = 20` e PARAVA de reservar, enquanto o portao
 * passava a ver 0 e ficava fechado para sempre. Duas contagens da mesma coisa —
 * exactamente o defeito que o `porTriar`/`contarTriagem` teve ate hoje.
 *
 * Este teste tranca a propriedade: a reserva tem de ler o MESMO numero que o
 * portao le.
 */
test('SEM FOME PELA PORTA DO LADO: a reserva conta como o portao conta', async () => {
  const { contarTriagem } = await import('./triagem.mjs');

  // 30 achados na janela; o dono decidiu 20 achados que JA NAO estao nela.
  const naJanela = Array.from({ length: 30 }, (_, i) => ({
    chave: `novo${i}`, pilar: 'P2', ficheiro: 'tools/x.js', janela: '1-9',
    verdict: 'citacao-ok', conclusao: 'achado', evidencia: 'tools/x.js:1 => n = 5',
    resultado_resumo: 'ACHADO: x', ts: '2026-08-21T12:00:00Z',
  }));
  const decisoes = new Map();
  for (let i = 0; i < 20; i += 1) decisoes.set(`velho${i}`, { decisao: 'aceite', por: 'dono' });

  const noFicheiro = [...decisoes.values()].filter((d) => d.por === 'dono').length;
  const c = contarTriagem(naJanela, decisoes).do_dono;
  const noPortao = c.aceite + c.descartado + c.issue;

  assert.equal(noFicheiro, 20, 'o ficheiro tem 20 decisoes do dono');
  assert.equal(noPortao, 0, 'mas nenhuma casa com um achado da janela — o portao ve 0');

  // Com a contagem ERRADA (a do ficheiro), a reserva pararia:
  assert.equal(reservarParaODono(naJanela, { jaDoDono: noFicheiro }).size,
    naJanela.filter((a) => naAmostraDeAuditoria(a.chave)).length,
    'contando o ficheiro, a reserva volta a 1-em-20 e o portao nunca reune as 20');

  // Com a contagem CERTA (a do portao), a reserva continua a guardar:
  assert.ok(reservarParaODono(naJanela, { jaDoDono: noPortao }).size >= MIN_TRIADOS,
    'contando como o portao conta, a reserva guarda o que ele ainda exige');
});

/* ═══ 2.a ronda adversarial: os defeitos que a 1.a correccao criou ═══ */

/**
 * O SEGUNDO ESTADO ABSORVENTE. Basta um agente sobrepor UMA das 20 decisoes do
 * dono: a chave continua decidida, o `porTriar` exclui-a, a fila fica vazia, e
 * o portao 2 fica em 19 de 20 para sempre. Uma unica escrita constroi a prisao.
 *
 * A regra "uma triagem do dono NAO se sobrepoe" estava escrita em prosa no
 * `voidar-fila.mjs` e em lado nenhum no codigo.
 */
test('ABSORVENTE 2: um agente NAO sobrepoe uma decisao do dono', async () => {
  const { registarTriagem: reg, lerTriagem: ler } = await import('./triagem.mjs');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sobrepor-')), 'triagem.jsonl');

  reg(f, { chave: 'k1', decisao: 'aceite', por: 'dono' });
  for (const quem of ['agente', 'claude']) {
    assert.throws(
      () => reg(f, { chave: 'k1', decisao: 'descartado', motivo: 'trivial', por: quem }),
      /nao sobrepoe uma decisao do dono/,
      `${quem} nao pode mudar de ideias pelo dono`,
    );
  }
  assert.equal(ler(f).decisoes.get('k1').decisao, 'aceite', 'a decisao dele fica intacta');

  // E o dono continua a poder mudar de ideias sobre o que e dele.
  reg(f, { chave: 'k1', decisao: 'descartado', motivo: 'ja-sabido', por: 'dono' });
  assert.equal(ler(f).decisoes.get('k1').decisao, 'descartado');
  // Depois disso, um agente tambem nao pode sobrepor a NOVA decisao dele.
  assert.throws(() => reg(f, { chave: 'k1', decisao: 'aceite', por: 'agente' }), /nao sobrepoe/);
});

test('SOBREPOSICAO: um agente sobrepoe outro agente sem problema', async () => {
  const { registarTriagem: reg, lerTriagem: ler } = await import('./triagem.mjs');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-sobrepor2-')), 'triagem.jsonl');
  reg(f, { chave: 'k1', decisao: 'descartado', motivo: 'trivial', por: 'claude' });
  reg(f, { chave: 'k1', decisao: 'descartado', motivo: 'ja-sabido', por: 'agente' });
  assert.equal(ler(f).decisoes.get('k1').motivo, 'ja-sabido', 'entre agentes, a ultima vence');
});

/**
 * O COMPLEMENTO INSTAVEL. O adversario inseriu UM achado novo no topo da fila
 * e mediu um cartao a sair da reserva. Um achado reservado que volta ao dreno
 * antes de o dono lhe tocar e exactamente a instabilidade que o hash existe
 * para evitar — metade da funcao era estavel e a outra metade nao.
 */
/**
 * O CHURN, MEDIDO — e limitado a UM por chegada.
 *
 * A 3.a ronda mediu a escada de degraus inteiros a expulsar 41 cartoes numa
 * unica insercao (`fila 93→94`, degrau 2→5). Trocar uma instabilidade pequena
 * por um precipicio nao e corrigir. Por ordem de hash, um achado novo com hash
 * mais baixo empurra EXACTAMENTE UM para fora.
 *
 * Nenhuma das duas e estabilidade absoluta — isso exigiria persistir a reserva,
 * uma segunda fonte de verdade ao lado do ledger. Entre um churn de 1 e um de
 * dezenas, escolhe-se o de 1, e MEDE-SE.
 */
test('CHURN LIMITADO: cada achado novo expulsa no maximo UM reservado', () => {
  const fila = Array.from({ length: 60 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  let pior = 0;
  for (let n = 0; n < 40; n += 1) {
    const antes = reservarParaODono(fila, { jaDoDono: 0 });
    fila.unshift(achado({ chave: `P2.novo${n}|n${n}.js:1-9:z${n}` }));
    const depois = reservarParaODono(fila, { jaDoDono: 0 });
    const sairam = [...antes].filter((k) => !depois.has(k)).length;
    pior = Math.max(pior, sairam);
  }
  assert.ok(pior <= 1, `o pior churn em 40 chegadas foi ${pior}, e tem de ser <= 1`);
});

test('CHURN: sem chegadas novas, a reserva nao mexe', () => {
  const fila = Array.from({ length: 60 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  const a = [...reservarParaODono(fila, { jaDoDono: 0 })].sort();
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual([...reservarParaODono(fila, { jaDoDono: 0 })].sort(), a);
  }
});

/**
 * O RESIDUO, escrito em vez de escondido.
 *
 * A escada e aninhada, por isso nao ha troca de cartoes DENTRO de um degrau.
 * Mas se a fila crescer o suficiente para um degrau mais grosso chegar, as
 * chaves que so pertenciam ao degrau fino saem da reserva. Estabilidade
 * absoluta exigiria PERSISTIR a reserva — uma segunda fonte de verdade ao lado
 * do `triagem.jsonl`, que e exactamente o que este projecto recusa.
 *
 * Este teste existe para o residuo ser conhecido e nao redescoberto por um
 * adversario daqui a duas semanas.
 */
test('RESIDUO CONHECIDO: a amostra por hash sobrevive a qualquer tamanho de fila', () => {
  const curta = Array.from({ length: 12 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  const longa = Array.from({ length: 600 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  // A amostra 1-em-20 e a parte REPRESENTATIVA e nunca sai — nem quando a fila
  // cresce 50x. O que pode sair e o complemento, um por chegada.
  const amostraCurta = curta.filter((a) => naAmostraDeAuditoria(a.chave)).map((a) => a.chave);
  const reservaLonga = reservarParaODono(longa, { jaDoDono: 0 });
  for (const k of amostraCurta) assert.ok(reservaLonga.has(k), `a amostra nunca sai: ${k}`);
  assert.ok(reservarParaODono(longa, { jaDoDono: 0 }).size >= MIN_TRIADOS);
});

test('COMPLEMENTO ESTAVEL: a ordem da fila nao muda a reserva', () => {
  const fila = Array.from({ length: 60 }, (_, i) => achado({ chave: `P2.${i}|f${i}.js:1-9:s${i}` }));
  const a = reservarParaODono(fila, { jaDoDono: 0 });
  const b = reservarParaODono([...fila].reverse(), { jaDoDono: 0 });
  assert.deepEqual([...a].sort(), [...b].sort(), 'a mesma fila por outra ordem tem de dar a mesma reserva');
});

/**
 * A PARAGEM TOTAL. `100,100,100` seguido de ZERO actos reportava
 * `ultimo=2026-08-22, hoje=100, anomalia=false`: o detector so olhava para dias
 * que tinham trabalho, e o pior caso — o pilar que morre de vez — era invisivel
 * por construcao. A deteccao de queda que eu tinha acabado de acrescentar tinha
 * um buraco com a forma exacta do pior caso.
 */
test('PARAGEM TOTAL: zero actos hoje dispara o alarme, com `agora`', () => {
  const historia = [...dia('2026-08-20', 100), ...dia('2026-08-21', 100), ...dia('2026-08-22', 100)];
  const semAgora = anomaliaDeDreno(historia);
  assert.equal(semAgora.ultimo, '2026-08-22');
  assert.equal(semAgora.anomalia, false, 'sem `agora`, a funcao continua pura e nao inventa hoje');

  const comAgora = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-24T15:00:00Z') });
  assert.equal(comAgora.ultimo, '2026-08-24');
  assert.equal(comAgora.hoje, 0, 'o dia de hoje existe mesmo sem actos');
  assert.equal(comAgora.anomalia, true, 'uma paragem TOTAL nao pode ser sossego');
  assert.equal(comAgora.direccao, 'caiu');
});

test('PARAGEM TOTAL: com actos hoje, `agora` nao inventa nem duplica nada', () => {
  const historia = [...dia('2026-08-20', 20), ...dia('2026-08-21', 20), ...dia('2026-08-22', 22)];
  const r = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-22T15:00:00Z') });
  assert.equal(r.ultimo, '2026-08-22');
  assert.equal(r.hoje, 22, 'nao se sobrepoe ao que ja la estava');
  assert.equal(r.anomalia, false);
});

/* ═══ 3.a ronda adversarial ═══ */

/**
 * ESCRITA EM MASSA NAO PARA A MEIO. O guard do dono e uma excepcao, e uma
 * excepcao no meio de um `for` deixava `k1` escrita, `k2` a rebentar e `k3`
 * nunca tentada — com o log a dizer que a fila ficara intacta.
 */
test('ESCRITA PARCIAL: uma colisao nao impede as chaves seguintes', async () => {
  const { registarTriagem: reg, registarVarias, lerTriagem: ler } = await import('./triagem.mjs');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-massa-')), 'triagem.jsonl');
  reg(f, { chave: 'k2', decisao: 'aceite', por: 'dono' });

  const r = registarVarias(f, [
    { chave: 'k1', decisao: 'descartado', motivo: 'trivial', por: 'agente' },
    { chave: 'k2', decisao: 'descartado', motivo: 'trivial', por: 'agente' },
    { chave: 'k3', decisao: 'descartado', motivo: 'trivial', por: 'agente' },
  ]);
  assert.deepEqual(r.escritas.map((e) => e.chave), ['k1', 'k3'], 'k3 tem de ser tentada apesar do k2');
  assert.equal(r.recusadas.length, 1);
  assert.equal(r.recusadas[0].chave, 'k2');
  assert.equal(r.erros.length, 0, 'uma colisao esperada nao e um erro');
  assert.equal(ler(f).decisoes.get('k2').por, 'dono', 'a decisao dele fica');
});

test('ESCRITA PARCIAL: erros REAIS separam-se das colisoes esperadas', async () => {
  const { registarVarias } = await import('./triagem.mjs');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'moo-massa2-')), 'triagem.jsonl');
  const r = registarVarias(f, [
    { chave: 'ok', decisao: 'descartado', motivo: 'trivial', por: 'agente' },
    { chave: 'mau', decisao: 'inventada', por: 'agente' },
  ]);
  assert.equal(r.escritas.length, 1);
  assert.equal(r.recusadas.length, 0, '"decisao desconhecida" NAO e uma colisao com o dono');
  assert.equal(r.erros.length, 1, 'e um defeito, e conta-se a parte');
});

/**
 * `registarVarias` compacta as recusadas. Emparelhar `escritas[i]` com
 * `actos[i]` fazia a escrita seguinte herdar o pilar da chave recusada: o
 * alarme dizia que P2 drenou uma decisao que era de P3. Para tornar a corrida
 * deterministica, a decisao do dono entra logo depois da primeira escrita.
 */
test('F5/2: uma recusa a meio nao desloca o pilar das escritas seguintes', async () => {
  const ledger = path.join(HOME_TMP, 'runner-ledger.jsonl');
  const triagem = path.join(HOME_TMP, 'triagem.jsonl');
  const autopilot = path.join(HOME_TMP, 'autopilot.json');
  for (const f of [ledger, triagem, autopilot]) fs.rmSync(f, { force: true });

  const agora = Date.now();
  const historico = [];
  for (let diasAtras = 3; diasAtras >= 1; diasAtras -= 1) {
    const ts = new Date(agora - diasAtras * 86_400_000).toISOString();
    for (let i = 0; i < 30; i += 1) historico.push({
      ts, chave: `hist-${diasAtras}-${i}`, decisao: 'descartado', motivo: 'trivial',
      por: 'agente', via: 'autopilot-l1', pilar: 'P2',
    });
  }
  fs.writeFileSync(triagem, historico.map((x) => JSON.stringify(x)).join('\n') + '\n');

  const recibos = Array.from({ length: 80 }, (_, i) => ({
    ...achado({
      chave: `novo-${i}`, pilar: 'P9', ficheiro: 'tools/x.js',
      evidencia: 'tools/x.js:1 => gap: 4', resultado_resumo: 'ACHADO: gap repetido',
      conclusao: 'achado', verdict: 'citacao-ok',
    }),
  }));
  const { porTriar } = await import('./triagem.mjs');
  const seleccionados = curar(porTriar(recibos, new Map(), Number.MAX_SAFE_INTEGER), { jaDoDono: 0 });
  assert.ok(seleccionados.length >= 3, 'o fixture precisa de tres actos para criar a colisao ao meio');
  for (const [i, pilar] of ['P1', 'P2', 'P3'].entries()) {
    recibos.find((r) => r.chave === seleccionados[i].chave).pilar = pilar;
  }
  fs.writeFileSync(ledger, recibos.map((x) => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(autopilot, JSON.stringify({ nivel: 1, orcamento: ORCAMENTO_OMISSAO }));

  const { srv, fechar } = await servidorEfemero();
  const appendOriginal = fs.appendFileSync;
  let injectou = false;
  fs.appendFileSync = function appendComColisao(caminho, dados, ...resto) {
    const resultado = appendOriginal.call(this, caminho, dados, ...resto);
    let entrada = null;
    try { entrada = JSON.parse(String(dados).trim()); } catch { /* nao e a linha do teste */ }
    if (!injectou && path.resolve(String(caminho)) === path.resolve(triagem) && entrada && entrada.por === 'agente') {
      injectou = true;
      appendOriginal.call(this, caminho, `${JSON.stringify({
        ts: new Date().toISOString(), chave: seleccionados[1].chave, decisao: 'aceite', por: 'dono',
      })}\n`);
    }
    return resultado;
  };

  let dito = '';
  try {
    srv.tiqueCurar((s) => { dito += s; });
  } finally {
    fs.appendFileSync = appendOriginal;
    await fechar();
    for (const f of [ledger, triagem, autopilot]) fs.rmSync(f, { force: true });
  }
  assert.equal(injectou, true, 'o fixture tem de ter criado a colisao');
  assert.match(dito, /P2 30→0 \(caiu\)/,
    `P2 nao recebeu escrita hoje; se aparecer 30→1, herdou a escrita de P3: ${dito}`);
});

/**
 * `ownerDay(NaN)` atira `RangeError`. Um alarme que mata o tique porque o
 * relogio veio estranho e pior do que um alarme que se cala.
 */
test('RELOGIO: `agora` invalido nao rebenta e nao materializa nada', () => {
  const historia = [...dia('2026-08-20', 20), ...dia('2026-08-21', 20)];
  for (const mau of [NaN, 'lixo', {}, [], Infinity, -Infinity]) {
    const r = anomaliaDeDreno(historia, { agora: mau });
    assert.equal(r.ultimo, '2026-08-21', `${String(mau)} nao pode inventar um dia`);
  }
  assert.equal(anomaliaDeDreno(historia, { agora: null }).ultimo, '2026-08-21');
});

/**
 * Comparar um dia A COMECAR com dias completos dava alarme de queda todas as
 * manhas: a 3.a ronda mediu `12,12,12 + hoje 0 -> anomalia=true` as 00:23.
 */
test('DIA INCOMPLETO: de madrugada nao ha alarme de queda; ao fim do dia ha', () => {
  const historia = [...dia('2026-08-20', 12), ...dia('2026-08-21', 12), ...dia('2026-08-22', 12)];
  // As horas sao as DELE. `04:00Z` = 01:00 em Sao Paulo — o dia mal comecou.
  // (Este teste ja apanhou o autor a usar 00:23Z a pensar que era madrugada,
  //  quando sao 21:23 para o dono e o dia esta quase no fim.)
  const cedo = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-24T04:00:00Z') });
  assert.equal(cedo.hoje, 0);
  assert.equal(cedo.anomalia, false, 'um dia com uma hora nao se compara com dias inteiros');

  // `02:00Z` do dia seguinte = 23:00 do dia dele. Agora sim.
  const tarde = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-25T02:00:00Z') });
  assert.equal(tarde.hoje, 0);
  assert.equal(tarde.anomalia, true, 'ao fim do dia dele, zero actos e mesmo uma paragem');
  assert.equal(tarde.direccao, 'caiu');
});

/**
 * O agregado ja comparava uma manha com a fraccao de dia decorrida, mas cada
 * pilar comparava a mesma manha com um dia inteiro. Assim "P2 esta normal as
 * 09:00" era indistinguivel de "P2 caiu", apesar de os mesmos actos absolverem
 * o agregado. A fraccao tem de chegar aos dois testes.
 */
test('F5/3: a fraccao do dia tambem escala a queda por pilar', () => {
  const porPilar = (d, n) => Array.from({ length: n }, (_, i) => ({
    ts: `${d}T10:${String(i % 60).padStart(2, '0')}:00Z`, chave: `${d}-${i}`, pilar: 'P2',
  }));
  const historia = [
    ...porPilar('2026-08-21', 24), ...porPilar('2026-08-22', 24),
    ...porPilar('2026-08-23', 24), ...porPilar('2026-08-24', 3),
  ];
  // 12:00Z = 09:00 do dono: 24/dia projecta 9 ate agora, abaixo do minimo 10.
  const r = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-24T12:00:00Z') });
  assert.equal(r.anomalia, false, 'o pilar e o agregado têm de comparar a mesma fraccao de dia');
  assert.deepEqual(r.suspeitos, []);
});

/**
 * Um acto com `ts` no FUTURO fazia `ultimo` saltar para o dia futuro, e o dia
 * real nem chegava a ser olhado — a paragem de hoje ficava escondida.
 */
test('FUTURO: um acto com data futura nao esconde a paragem de hoje', () => {
  const historia = [
    ...dia('2026-08-20', 12), ...dia('2026-08-21', 12), ...dia('2026-08-22', 12),
    { ts: '2026-08-25T12:00:00Z', chave: 'futuro' },
  ];
  const r = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-24T23:30:00Z') });
  assert.equal(r.ultimo, '2026-08-24', 'o dia de amanha nao e hoje');
  assert.equal(r.hoje, 0);
  assert.equal(r.anomalia, true, 'a paragem continua visivel');
});

/**
 * Remover apenas dias posteriores nao chega: `02:00Z` de amanha ainda e 23:00
 * no dia do dono. Esses actos futuros ficavam no balde de hoje e "ja aconteceu"
 * era indistinguivel de "ainda vai acontecer", escondendo uma paragem real.
 */
test('F5/4: instantes futuros dentro do dia do dono nao contam como feitos', () => {
  const futurosNoMesmoDia = Array.from({ length: 12 }, (_, i) => ({
    ts: `2026-08-25T02:${String(i).padStart(2, '0')}:00Z`, chave: `futuro-hoje-${i}`,
  }));
  const historia = [
    ...dia('2026-08-21', 24), ...dia('2026-08-22', 24), ...dia('2026-08-23', 24),
    ...futurosNoMesmoDia,
  ];
  // 15:00Z = 12:00 do dono em 24/08; 02:xxZ de 25/08 = 23:xx do MESMO dia.
  const r = anomaliaDeDreno(historia, { agora: Date.parse('2026-08-24T15:00:00Z') });
  assert.equal(r.hoje, 0, 'um instante posterior a `agora` nunca e trabalho ja feito');
  assert.equal(r.anomalia, true, 'sem os actos do futuro, a paragem de hoje fica visivel');
});
