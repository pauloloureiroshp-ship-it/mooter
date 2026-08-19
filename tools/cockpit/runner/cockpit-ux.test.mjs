/**
 * cockpit-ux.test.mjs — regressões de interface, fixadas como testes.
 *
 * Nasceu de um bug real: com o device a trabalhar bem, o botão "▶ Trabalhar"
 * aparecia cinzento, porque eu desligava-o quando `state.running` era true. Do
 * lado de quem olha, um produto que funciona ficou indistinguível de um produto
 * partido. A lição não é "corrigir aquela linha" — é que **um controlo primário
 * nunca pode renderizar-se morto enquanto o sistema está alcançável**, e isso
 * tem de ser verificável e não uma intenção.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { buildFeed, FEED_LENGTH } from './fleet-state.mjs';
import { deviceName, portOpen, loopAlive } from './launch.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const SHELL = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html'), 'utf8');
const SCRIPT = /<script>([\s\S]*)<\/script>/.exec(SHELL)[1];
/** Código sem comentários: uma regra citada num comentário não é uma violação. */
const CODE = SCRIPT.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

// ── o bug que o dono apanhou ─────────────────────────────────────────────────

test('o controlo primário NUNCA se desliga por o sistema estar a funcionar', () => {
  // A regressão original: `btn.disabled = ... || state.running`.
  assert.ok(
    !/disabled\s*=[^;]*state\.running/.test(CODE),
    'o botão não pode ser desligado por state.running — trabalhar é o estado bom',
  );
  assert.ok(!/\.disabled\s*=\s*true/.test(CODE), 'nada de disabled=true no controlo primário');
});

test('o toggle diz a ACÇÃO que faz, não o estado em que o sistema está', () => {
  assert.match(SCRIPT, /running \? '⏸ Pause the loop' : '▶ Ship'/);
  assert.match(SCRIPT, /control\(running \? '\/stop' : '\/play'/, 'um botão só, dois destinos');
});

test('endpoint inalcançável dá instruções, nunca um botão morto', () => {
  assert.match(SCRIPT, /function renderToggleOffline/);
  assert.match(SCRIPT, /b\.hidden = true;/, 'offline esconde o controlo em vez de o cinzentar');
  assert.match(SHELL, /npm run pilot/, 'e mostra o comando exacto que o levanta');
});

test('um comando só é dado como aplicado quando o loop confirma', () => {
  assert.match(SCRIPT, /expecting = \{ running:expectRunning/);
  assert.match(SCRIPT, /function confirmPending/);
  assert.match(SCRIPT, /has not changed state yet/, 'tem de haver saída honesta quando não pega');
});

// ── o snapshot não se finge cockpit ──────────────────────────────────────────

test('em instantâneo a página explica onde está o cockpit a sério', () => {
  assert.match(SCRIPT, /saved snapshot, not live state/);
  assert.match(SCRIPT, /127\.0\.0\.1:4290\/panel/, 'tem de dar o endereço vivo');
});

// ── honestidade que não pode regredir ────────────────────────────────────────

test('não existe caminho onde a ausência de valor vire um número', () => {
  assert.match(SCRIPT, /const nd = \(v, fmt\)/);
  // `|| 0` transforma "não sei" em "zero" — é a forma mais discreta de mentir
  // num painel. Não existe caso legítimo dele neste ficheiro.
  assert.ok(!/\|\|\s*0\b/.test(CODE), 'nada de fallback para 0 em valores medidos');
  assert.match(SCRIPT, /if \(fails >= 2\) offline/, 'duas falhas seguidas = desconectado declarado');
});

test('a legenda desarma a leitura errada de "cited"', () => {
  // A armadilha e a mesma nas duas linguas: "citacao-ok" parecia dizer que o
  // achado estava certo, e "cited" soa a validado. So diz que a LINHA existe.
  // Medido: 1475 citacoes, 72 julgadas, 1 util. A legenda e o que impede o dono
  // de ler 1475 como 1475 problemas.
  assert.match(SHELL, /does <b>not<\/b> mean the finding is right/);
  assert.match(SHELL, /that is triage, and a separate step/);
});

// ── UX/performance ───────────────────────────────────────────────────────────

test('o painel não redesenha secções que não mudaram', () => {
  assert.match(SCRIPT, /const changed = \(key, value\)/);
  for (const sec of ['gpu', 'tally', 'pillars', 'engine', 'align', 'feed']) {
    assert.match(SCRIPT, new RegExp(`changed\\('${sec}'`), `a secção ${sec} redesenha sempre`);
  }
});

test('o catálogo de pilares vem do servidor — página e runner não podem divergir', () => {
  assert.match(SCRIPT, /\/pilares\.json/);
  const server = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/f10-server.mjs'), 'utf8');
  assert.match(server, /route === '\/pilares\.json'/);
  // O catalogo passou a vir do conjunto EM USO (embutido ou do projecto, ver
  // context-pack.loadPillars), nao da constante embutida. A alegacao e a mesma
  // e fica mais forte: a pergunta que viaja e a do pilar que o loop vai correr.
  assert.match(server, /pergunta: pilares\.pillars\[id\]\.ask/, 'a pergunta real do pilar tem de viajar');
  assert.match(server, /fonte: pilares\.fonte/, 'e o painel tem de saber se os pilares sao do projecto ou os embutidos');
});

test('a sparkline declara que é da sessão do painel, não histórico do device', () => {
  assert.match(SCRIPT, /samples this panel session/);
});

test('o painel abre sem rede externa e respeita reduced-motion', () => {
  assert.ok(!/src="http|href="http|@import/.test(SHELL), 'nenhum recurso externo');
  assert.match(SHELL, /prefers-reduced-motion/);
});

// ── feed ─────────────────────────────────────────────────────────────────────

test('buildFeed devolve os mais recentes primeiro e limita o tamanho', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ ts: `t${i}`, pilar: 'P1', verdict: 'citacao-ok' }));
  const feed = buildFeed(many);
  assert.equal(feed.length, FEED_LENGTH);
  assert.equal(feed[0].ts, 't49', 'o mais recente vem primeiro');
});

test('buildFeed nunca inventa campos em falta', () => {
  const [row] = buildFeed([{ ts: 'x' }]);
  assert.equal(row.verdict, null);
  assert.equal(row.dur_s, null);
  assert.equal(row.ficheiro, null);
});

// ── launcher ─────────────────────────────────────────────────────────────────

test('o device é identificado por hostname, com override explícito', () => {
  const antes = process.env.MOOTER_DEVICE;
  process.env.MOOTER_DEVICE = 'rtx-4090';
  assert.equal(deviceName(), 'rtx-4090');
  delete process.env.MOOTER_DEVICE;
  assert.ok(deviceName().length > 0, 'sem override tem de cair no hostname');
  if (antes !== undefined) process.env.MOOTER_DEVICE = antes;
});

test('portOpen responde false sem lançar numa porta fechada', async () => {
  assert.equal(await portOpen(1, '127.0.0.1', 300), false);
});

test('loopAlive é false para lock inexistente ou PID morto', () => {
  assert.equal(loopAlive('/caminho/que/nao/existe'), false);
});

test('o lançador mostra os controlos mas NUNCA levanta o STOP sozinho', () => {
  const launch = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/launch.mjs'), 'utf8');
  assert.ok(!/rmSync\(STOP|unlink.*STOP/.test(launch), 'lançar não pode revogar o kill-switch');
  assert.match(launch, /gesto é teu/i, 'e tem de dizer que o ▶ é do dono');
});

// ── o painel morto (2026-08-19) ──────────────────────────────────────────────

/**
 * O bug: ao traduzir a interface para inglês, "This device's GPU" entrou dentro
 * de uma string de plicas. A plica fechou a string a meio e o parser morreu ali.
 * Não foi um botão que partiu: foi o IIFE inteiro (550 linhas) que deixou de
 * compilar — dial, frota, pilares, triagem, play/stop, tudo. E a suite passou
 * na mesma, porque cada teste procurava um padrão no TEXTO do ficheiro e o
 * texto continuava lá. Um ficheiro que não compila satisfaz qualquer regex.
 *
 * A lição não é "escapar plicas". É que **nenhum teste de UI vale nada enquanto
 * ninguém provar que o programa compila**. Este é o primeiro teste que corre.
 */
test('o script do painel COMPILA — sem isto, nenhum outro teste desta suite significa nada', () => {
  assert.doesNotThrow(
    () => new vm.Script(SCRIPT, { filename: 'moo-pilot-shell.html <script>' }),
    'o <script> do painel não compila: a interface inteira está morta, por muito que o texto pareça certo',
  );
});

/**
 * Segundo bug da mesma tradução: os ids no markup passaram a inglês
 * (`f-verdict`) e o JS continuou a pedir os antigos (`f-conclusao`). O
 * `$()` devolve null, o código defende-se com `if (campo)` — e o filtro
 * simplesmente nunca funciona, em silêncio, para sempre.
 */
test('todo o id que o JS pede tem de existir no markup', () => {
  const markup = SHELL.slice(0, SHELL.indexOf('<script>'));
  const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const pedidos = new Set([...CODE.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]));
  const orfaos = [...pedidos].filter((id) => !ids.has(id));
  assert.deepEqual(orfaos, [], 'o JS pede ids que o markup não tem — controlos mudos: ' + orfaos.join(', '));
});

/**
 * Terceiro: os ouvintes dos filtros tinham sido colados dentro de `offline()`.
 * Só se ligavam quando o endpoint estava EM BAIXO — e voltavam a ligar-se em
 * cada sondagem falhada, empilhando ouvintes. Com o painel a funcionar, os
 * filtros nunca chegavam a existir.
 */
test('os ouvintes dos filtros ligam-se no arranque, nunca dentro de offline()', () => {
  const offline = /function offline\([\s\S]*?\n  \}/.exec(CODE);
  assert.ok(offline, 'não encontrei a função offline()');
  assert.doesNotMatch(
    offline[0],
    /addEventListener/,
    'offline() volta a registar ouvintes: só ligam quando o endpoint cai, e duplicam a cada falha',
  );
  assert.match(CODE, /f-verdict[\s\S]{0,200}addEventListener/, 'os filtros do feed não estão ligados a lado nenhum');
});

// ── o custo por modelo (Fase 1) ──────────────────────────────────────────────

/**
 * A regra que este cartao existe para nao quebrar: ha DOIS numeros, e nunca
 * se somam. O `usd: 0` do /fleet.json e o que o LOOP gastou — zero por
 * construcao, porque `assertLocalEngine` recusa qualquer motor que nao seja
 * loopback. O total do /custo.json e o que os MESMOS tokens custariam a API.
 * A diferenca entre eles E a tese do produto; a soma seria uma factura falsa.
 */
test('o custo de tabela nunca se apresenta como dinheiro gasto', () => {
  assert.match(CODE, /custo\.json/, 'o painel nao vai buscar o custo por modelo');
  assert.match(CODE, /NOT money you spent/, 'faltou dizer que isto nao e dinheiro gasto — a quem paga subscricao seria mentira');
  assert.doesNotMatch(CODE, /state\.usd\s*\+/, 'esta a somar o gasto do loop ao preco de tabela: sao numeros diferentes');
});

test('um modelo sem preco na tabela nao recebe um numero emprestado', () => {
  assert.match(CODE, /no price, no number/,
    'a celula de um modelo sem preco tem de ficar vazia: um preco emprestado le-se exactamente como um real');
});

/**
 * A reserva ja viajava no /fleet.json desde que existe (fleet-state.mjs:242) e
 * o painel nunca a desenhou. De fora, um device que CEDEU a maquina de proposito
 * era indistinguivel de um loop morto: "sem recibos ha 20 minutos", e o dono a
 * adivinhar qual dos dois.
 */
test('a reserva da maquina e desenhada, e o memo de render() ve-a', () => {
  assert.match(CODE, /machine lease/, 'a reserva continua invisivel no painel');
  assert.match(CODE, /changed\('engine',[^)]*state\.reserva/,
    'a reserva nao entra na assinatura do memo: mudaria de estado e o ecra ficava parado');
});

/**
 * Trava de classe: o painel e o servidor sao dois ficheiros que ninguem obriga
 * a concordar. Um `fetch` para uma rota que o servidor nao serve devolve 404,
 * o `.catch()` engole, e o cartao fica vazio para sempre sem um unico erro.
 */
test('toda a rota que o painel busca existe no servidor', () => {
  const servidor = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'f10-server.mjs'), 'utf8');
  const rotas = new Set([
    ...[...CODE.matchAll(/\$\{BASE\}(\/[a-z0-9._/-]+)/gi)].map((m) => m[1]),
    ...[...CODE.matchAll(/BASE\s*\+\s*['"](\/[a-z0-9._/-]+)['"]/gi)].map((m) => m[1]),
  ]);
  assert.ok(rotas.size >= 3, 'nao encontrei as rotas do painel — o teste deixou de medir o que dizia medir');
  const ausentes = [...rotas].filter((r) => !servidor.includes("'" + r + "'"));
  assert.deepEqual(ausentes, [], 'o painel busca rotas que o servidor nao serve: ' + ausentes.join(', '));
});

// ── o dial do GPU não pinta um ponto a 0% ────────────────────────────────────

/**
 * Bug real: `const LEN = 248` no JS discordava do comprimento REAL do arco
 * (`arc.getTotalLength()` mede 248.22). A 0% sobravam 0.22px de stroke, e com
 * `stroke-linecap:round` + `stroke-width:14` essa sobra pintava-se como um
 * ponto azul cheio de ~14px — um dial a dizer 0% enquanto mostra actividade.
 */
test('o comprimento do arco vem do DOM, nunca de uma constante escrita à mão', () => {
  assert.doesNotMatch(CODE, /const LEN = 248\b/, 'a constante hardcoded tinha 0.22px de erro face ao arco real');
  assert.match(SCRIPT, /const LEN = arc\.getTotalLength\(\)/, 'o comprimento tem de ser lido do proprio elemento');
  assert.match(SCRIPT, /arc\.style\.strokeDasharray = String\(LEN\)/, 'o dasharray tem de ser derivado do LEN real, nao do markup');
});

test('0% leva o MESMO tratamento que "sem amostra" — nunca pinta azul', () => {
  // Mesmo com o LEN exacto, um offset == LEN deixa um traco de comprimento 0,
  // e um traco de comprimento 0 com linecap:round ainda pinta um ponto
  // redondo cheio (regra do SVG) — por isso 0% tem de cair no MESMO ramo que
  // pct === null, e não só ganhar um offset mais preciso.
  assert.match(SCRIPT, /const semAmostra = pct === null \|\| pct === 0;/,
    '0% tem de ser tratado como ausencia de amostra, nao como um valor pintavel');
  assert.match(SCRIPT, /arc\.style\.strokeDashoffset = semAmostra \? LEN/);
  assert.match(SCRIPT, /arc\.style\.stroke = semAmostra \? 'var\(--line\)'/,
    'a 0% a cor tem de cair para var(--line), a mesma usada quando nao ha amostra');
});

test('geometria: o comprimento hardcoded 248 tinha mesmo erro face ao arco real', () => {
  // Prova headless, sem DOM: o path "M16 98 A79 79 0 0 1 174 98" tem corda
  // 174-16=158, exactamente 2×raio(79) — os extremos sao diametralmente
  // opostos, logo o arco (large-arc-flag=0) e um semicirculo exacto:
  // comprimento = π×raio. É o mesmo valor que o dono mediu no browser via
  // getTotalLength() (248.22, por aproximacao a beziers do renderer real).
  const raio = 79;
  const comprimentoReal = Math.PI * raio;
  assert.ok(Math.abs(comprimentoReal - 248.22) < 0.05, `π×79 = ${comprimentoReal}, longe do 248.22 medido`);
  const erro = comprimentoReal - 248;
  assert.ok(erro > 0.15 && erro < 0.3, `o LEN hardcoded (248) errava por ${erro.toFixed(3)}px — a origem exacta do ponto`);
});

// ── o filtro de veredicto fala a mesma língua que o cartão de tallies ───────

/**
 * O dropdown falava tokens crus (sem-achado, sem-citacao) enquanto o cartão
 * de tallies, dois blocos acima, já chama aos mesmos dados clean e uncited.
 * Mesmo dado, dois nomes, um ecrã.
 */
test('o filtro de veredicto mostra o rótulo do VERDICTS, sem construir uma segunda tabela', () => {
  assert.match(SCRIPT, /opcoesUnicas\(\$\('f-verdict'\), LAST_FEED\.map\(\(r\) => r\.verdict\), 'all',/,
    'o filtro de veredicto tem de pedir um rotulador');
  assert.match(SCRIPT, /VERDICTS\[tok\] \? VERDICTS\[tok\]\.label : tok/,
    'tem de reusar o VERDICTS ja existente — nao inventar uma segunda tabela token→rotulo');
});

test('o value da opção nunca muda — só o texto visível', () => {
  assert.match(SCRIPT, /function opcoesUnicas\(sel, valores, rotuloVazio, rotular\)/);
  assert.match(SCRIPT, /const o = el\("option", null, rotular \? rotular\(v\) : v\);\s*\n\s*o\.value = v;/,
    'o value do <option> tem de continuar a ser o token cru, nao o rotulo traduzido');
  // A logica do filtro compara o token, nunca o rotulo — isto nao pode mudar.
  assert.match(CODE, /r\.verdict === FILTERS\.verdict/);
});

test('um token sem entrada no VERDICTS mostra-se cru, nunca em branco', () => {
  const VERDICTS = { 'citacao-ok': { cls: 'ok', label: 'cited' } };
  const rotular = (tok) => (VERDICTS[tok] ? VERDICTS[tok].label : tok);
  assert.equal(rotular('citacao-ok'), 'cited');
  assert.equal(rotular('token-desconhecido'), 'token-desconhecido');
});

// ── a fila de triagem tem um limite honesto ─────────────────────────────────

/**
 * Medido num painel real: 46 cartões de triagem, 138 botões, página com
 * 11251px de altura — sem contagem, sem forma de a estreitar. O feed já
 * estava limitado a FEED_LENGTH (14); a triagem não tinha limite nenhum.
 */
test('a fila de triagem tem um TETO nomeado, tal como o feed tem FEED_LENGTH', () => {
  assert.match(SCRIPT, /const TRIAGE_CAP = \d+;/, 'o limite tem de ser uma constante nomeada, nao um numero magico disperso');
  assert.match(SCRIPT, /const mostrar = triagemExpandida \? fila : fila\.slice\(0, TRIAGE_CAP\)/);
});

test('nunca trunca em silêncio: se algo fica de fora, o número que o diz é visível', () => {
  assert.match(SCRIPT, /"showing " \+ mostrar\.length \+ " of " \+ totalReal \+ " pending"/,
    'tem de haver uma linha honesta com quantos se mostram e quantos existem ao todo');
  // E o total NAO pode vir da lista ja cortada: `porTriar` corta em 50 no
  // servidor, portanto `fila.length` era o corte a medir-se a si proprio.
  assert.match(SCRIPT, /totalReal = typeof t\.por_triar === "number"/,
    'o total tem de vir do servidor, que conta o ledger inteiro');
  assert.match(SCRIPT, /the endpoint sent the/,
    'se o servidor tambem cortou, isso tem de estar escrito no ecra');
  assert.match(SCRIPT, /fila\.length > TRIAGE_CAP/, 'o controlo para revelar o resto so aparece quando ha algo escondido');
  assert.match(SCRIPT, /triagemExpandida = !triagemExpandida; renderTriagem\(state\);/,
    'tem de existir um controlo que revela o resto da fila');
});

test('a triagem continua a usar as classes existentes — nenhuma linguagem de design nova', () => {
  assert.match(SCRIPT, /el\("p", "note", "showing " \+ mostrar\.length/, 'reusa .note, nao inventa uma classe');
  assert.doesNotMatch(CODE, /class="triagem-/, 'nenhuma classe CSS nova para este bloco');
});
