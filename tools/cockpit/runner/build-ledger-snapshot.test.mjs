/**
 * build-ledger-snapshot.test.mjs — o Ledger nao pode inventar, nem calar.
 *
 * Duas metades, e as duas sao necessarias:
 *
 *  1. O PAYLOAD. Que ele parseia, que traz todos os campos que a casca le, e
 *     que um campo sem medicao sai `null` em vez de um numero de cabeca.
 *  2. A CASCA. Que ela NAO tem numeros proprios — e esta e a razao de o teste
 *     existir. A v4 nasceu com o instantaneo cravado no HTML: 2094 citacoes,
 *     384 descartes, $24.29 de padrao. Numeros verdadeiros no dia em que foram
 *     escritos e mentiras silenciosas no dia seguinte, porque a pagina continua
 *     a parecer certa depois de deixar de o ser.
 *
 * A segunda metade CORRE a casca contra um DOM de bolso. Comparar strings do
 * ficheiro nao chegava: `S.counters.cited` (campo que nao existe) passa numa
 * grep e imprime `undefined` no ecra do dono.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  buildLedgerSnapshot, renderLedgerHtml, injectPayload, stripPayload, scriptSafeJson,
  contarVeredictos, porDia, agregarNoite, ehNoite, tallyPorModelo, listarWorktrees,
  elencoDeMotores, versaoInstalada, lerRoadmap, lerEtaIndex,
  CAMPOS_OBRIGATORIOS, MAX_RECIBOS, SHELL_VERSION, BEGIN, END,
} from './build-ledger-snapshot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SHELL = path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html');
const CASCA = fs.readFileSync(SHELL, 'utf8');

// ── um device de mentira, para o teste nao depender da bancada de ninguem ────

const RECIBOS = [
  // 03:00 São Paulo (06:00Z) — dentro da noite
  { ts: '2026-08-22T06:00:00Z', pilar: 'P2', verdict: 'citacao-ok', modelo: 'qwen2.5-coder:14b',
    ficheiro: 'a.js', janela: '1-10', chave: 'P2|a.js:1-10:aa', engine: 'ollama-local',
    dur_s: 4, tokens_out: 20, usd: 0, resultado_resumo: 'PROOF: a.js:3', conclusao: 'achado' },
  { ts: '2026-08-22T07:00:00Z', pilar: 'P3', verdict: 'sem-achado', modelo: 'qwen2.5-coder:14b',
    ficheiro: 'b.js', engine: 'ollama-local', dur_s: 2, tokens_out: 5, usd: 0 },
  // 14:00 São Paulo (17:00Z) — fora da noite
  { ts: '2026-08-22T17:00:00Z', pilar: 'P2', verdict: 'refutado', modelo: 'qwen2.5-coder:14b',
    ficheiro: 'c.js', engine: 'ollama-local', dur_s: 3, tokens_out: 9, usd: 0 },
  { ts: '2026-08-23T17:30:00Z', pilar: 'P2', verdict: 'nada-por-rever', modelo: 'qwen2.5-coder:14b' },
  { ts: '2026-08-23T18:00:00Z', pilar: 'P2', verdict: 'sem-citacao', modelo: null },
  { ts: '2026-08-23T18:30:00Z', pilar: 'P2' },   // anterior ao verificador: inconclusive
];

function bancada() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-ledger-'));
  fs.writeFileSync(path.join(dir, 'runner-ledger.jsonl'),
                   RECIBOS.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'runner-state.json'), JSON.stringify({
    modelo: 'qwen2.5-coder:14b',
    pausa: { activa: true, razao: 'a rotacao esta vazia', desde: '2026-08-30T21:20:21Z' },
  }));
  fs.writeFileSync(path.join(dir, 'eta-index.json'), JSON.stringify({
    chaves: { 'moo|other|<4k': { p50: 12, n: 7 }, 'cc|other|<4k': { p50: null, n: 4 } },
  }));
  return dir;
}

const semGpu = async () => null;
// Os nomes sao neutros de proposito. O ratchet do rebranding conta FICHEIROS que
// mencionam o nome antigo do repo, e uma fixture de worktrees nao precisa de o
// repetir para medir o que mede. (Custou um CI vermelho: 216 > 215.)
const gitFalso = () => [
  'worktree /r/projecto', 'HEAD abc', 'branch refs/heads/main', '',
  'worktree /r/projecto-x', 'HEAD def', 'detached', '',
].join('\n');

const construir = (dir, extra = {}) => buildLedgerSnapshot({
  repoRoot: REPO, mooDir: dir, now: Date.parse('2026-09-01T12:00:00Z'),
  device: 'bancada', gpuImpl: semGpu, runGitImpl: gitFalso,
  homeImpl: path.join(dir, 'sem-home'), vaultPath: path.join(dir, 'sem-vault'), ...extra,
});

// ── 1 · o payload ────────────────────────────────────────────────────────────

test('o payload traz TODOS os campos que a casca le', async () => {
  const s = await construir(bancada());
  for (const k of CAMPOS_OBRIGATORIOS) {
    assert.ok(k in s, `falta o campo ${k} — a casca leria undefined`);
  }
  assert.equal(s.device, 'bancada');
  assert.equal(s.owner_tz, 'America/Sao_Paulo');
});

test('o payload gerado parseia depois de embutido, e o embutir e idempotente', async () => {
  const dir = bancada();
  const s = await construir(dir);
  const html1 = injectPayload(CASCA, { snapshot: s, roadmap: [], shell: { version: SHELL_VERSION } });
  const html2 = injectPayload(html1, { snapshot: s, roadmap: [], shell: { version: SHELL_VERSION } });
  assert.equal((html2.match(new RegExp(BEGIN, 'g')) || []).length, 1, 'correr duas vezes empilhou copias');
  assert.equal((html2.match(new RegExp(END, 'g')) || []).length, 1);
  const bruto = /window\.__SNAPSHOT__=(\{[\s\S]*?\});window\.__ROADMAP__=/.exec(html2);
  assert.ok(bruto, 'nao encontrei o payload embutido');
  assert.deepEqual(JSON.parse(bruto[1]).counters, s.counters);
  assert.equal(/__SNAPSHOT__\s*=\s*\{/.test(stripPayload(html2)), false, 'o strip deixou payload para tras');
});

test('um payload nao pode fechar o <script> nem abrir um comentario', () => {
  const veneno = { x: '</script><script>alert(1)</script>', y: '<!-- ' };
  const j = scriptSafeJson(veneno);
  assert.equal(/<\/script/i.test(j), false);
  assert.equal(j.includes('<!--'), false);
});

test('campo sem medicao sai null — nunca um numero de cabeca', async () => {
  const s = await construir(bancada());
  // O `ioreg` nao reporta VRAM total e nenhum beacon a publica.
  assert.equal(s.engine.vram_total_gb, null);
  // Sem sonda de GPU, nao ha percentagem nenhuma para mostrar.
  assert.equal(s.engine.gpu_pct, null);
  assert.equal(s.engine.vram_gb, null);
  for (const d of s.fleet) assert.equal(d.vram_total_gb, null);
});

test('os veredictos contam-se pelos nomes que o verificador emite', () => {
  const c = contarVeredictos(RECIBOS);
  assert.deepEqual(c, {
    cited_verified: 1, refuted: 1, uncited: 1, no_finding: 1, queue_empty: 1, inconclusive: 1,
  });
});

test('a janela nocturna e 00:00-08:00 na hora do DONO, nao em UTC', () => {
  // 06:00Z = 03:00 em São Paulo → noite. 17:00Z = 14:00 → dia.
  assert.equal(ehNoite(Date.parse('2026-08-22T06:00:00Z')), true);
  assert.equal(ehNoite(Date.parse('2026-08-22T17:00:00Z')), false);
  // 02:00Z = 23:00 do dia ANTERIOR em São Paulo → fora da noite, e este e
  // exactamente o caso que um filtro em UTC classificaria ao contrario.
  assert.equal(ehNoite(Date.parse('2026-08-22T02:00:00Z')), false);

  const n = agregarNoite(RECIBOS);
  assert.equal(n.rounds, 2);
  assert.equal(n.cited, 1);
  assert.equal(n.refuted, 0, 'o refutado das 14:00 nao pode entrar na noite');
  assert.equal(n.tokens_out, 25);
  assert.equal(n.nights, 1);
  assert.match(n.window_label, /São Paulo/);
});

test('sem recibos nocturnos, o rotulo da janela e null e nao uma janela inventada', () => {
  const n = agregarNoite([{ ts: '2026-08-22T17:00:00Z', verdict: 'sem-achado' }]);
  assert.equal(n.rounds, 0);
  assert.equal(n.window_label, null);
});

test('os dias sao os dias do dono, e vem por ordem', () => {
  const d = porDia(RECIBOS);
  assert.deepEqual(d.map((x) => x.date), ['2026-08-22', '2026-08-23']);
  assert.equal(d[0].rounds, 3);
  assert.equal(d[0].cited, 1);
});

test('um recibo sem modelo cai no balde n/d, e nao desaparece da conta', () => {
  const t = tallyPorModelo(RECIBOS);
  assert.equal(t['qwen2.5-coder:14b'], 4);
  assert.equal(t['n/d'], 2);
  assert.equal(Object.values(t).reduce((a, b) => a + b, 0), RECIBOS.length);
});

test('o elenco de motores cita o tally medido, e nunca um zero por um n/d', () => {
  const elenco = elencoDeMotores({ 'qwen2.5-coder:14b': 4, 'n/d': 2 });
  const leitor = elenco.find((e) => e.name === 'qwen2.5-coder:14b');
  assert.equal(leitor.n, 4);
  const cc = elenco.find((e) => e.name === 'Claude Code');
  assert.equal(cc.n, null, 'os writes vivem no git, nao neste ledger — null, nao 0');
  assert.ok(elenco.some((e) => e.name === 'n/d'), 'o balde sem modelo tem de aparecer');
});

test('sem tally, o elenco nao inventa um leitor', () => {
  const elenco = elencoDeMotores({});
  assert.equal(elenco.some((e) => e.unit === 'receipts in window'), false);
});

test('`free` conta worktrees ELEGIVEIS, e o criterio viaja no payload', async () => {
  const w = listarWorktrees('/r', { runImpl: gitFalso });
  assert.equal(w.total, 2);
  assert.equal(w.free, 1, 'a detached nao e elegivel');
  const s = await construir(bancada());
  assert.match(s.worktrees.criterion, /not detached/);
});

test('git ausente da n/d, nunca zero', () => {
  const w = listarWorktrees('/r', { runImpl: () => { throw new Error('sem git'); } });
  assert.equal(w.total, null);
  assert.equal(w.free, null);
});

test('os portoes vem do motor, com regra, medida e porque — nao de uma constante', async () => {
  const s = await construir(bancada());
  for (const k of ['L1', 'L2', 'L3']) {
    assert.ok(s.gates[k], `falta o portao ${k}`);
    assert.ok(typeof s.gates[k].rule === 'string' && s.gates[k].rule.length > 5);
    assert.equal(typeof s.gates[k].open, 'boolean');
  }
  // 1 refutado em 6 rondas = 16.7%, muito acima do tecto de 2%: FECHADO.
  assert.equal(s.gates.L1.open, false);
  assert.ok(s.gates.L1.why_closed, 'um portao fechado tem de dizer porque');
});

test('a pausa do runner vira `hold`; sem pausa, `hold` e null', async () => {
  const dir = bancada();
  const s = await construir(dir);
  assert.equal(s.hold.since, '2026-08-30T21:20:21Z');
  fs.writeFileSync(path.join(dir, 'runner-state.json'), JSON.stringify({ modelo: 'x' }));
  const s2 = await construir(dir);
  assert.equal(s2.hold, null);
});

test('os recibos viajam cortados, e o corte e o declarado', async () => {
  const dir = bancada();
  const muitos = Array.from({ length: MAX_RECIBOS + 20 }, (_, i) =>
    JSON.stringify({ ts: `2026-08-22T06:${String(i % 60).padStart(2, '0')}:00Z`, verdict: 'sem-achado' }));
  fs.writeFileSync(path.join(dir, 'runner-ledger.jsonl'), muitos.join('\n') + '\n');
  const s = await construir(dir);
  assert.equal(s.receipts.length, MAX_RECIBOS);
  assert.equal(s.window.window, MAX_RECIBOS + 20, 'a janela conta tudo, mesmo o que nao viaja');
});

test('a versao instalada e a do Claude Desktop, e null quando nao ha nenhuma', () => {
  assert.equal(versaoInstalada({ home: '/nao/existe', existsImpl: () => false }), null);
  assert.equal(versaoInstalada({
    home: '/h', existsImpl: () => true, readImpl: () => JSON.stringify({ version: '1.2.3' }),
  }), '1.2.3');
  assert.equal(versaoInstalada({
    home: '/h', existsImpl: () => true, readImpl: () => 'nao e json',
  }), null, 'um manifest ilegivel e uma versao desconhecida, nao uma versao');
});

test('o roadmap e o eta-index degradam-se para vazio/null, nunca para inventado', () => {
  assert.deepEqual(lerRoadmap('/nao/existe.json'), []);
  assert.equal(lerEtaIndex('/nao/existe.json'), null);
  assert.deepEqual(lerEtaIndex(path.join(bancada(), 'eta-index.json')),
                   { 'moo|other|<4k': { p50: 12, n: 7 }, 'cc|other|<4k': { p50: null, n: 4 } });
});

test('o roadmap do repo existe e tem a forma que a casca le', () => {
  const rm = lerRoadmap();
  assert.ok(rm.length > 0, 'tools/cockpit/roadmap.json tem de existir e nao ser vazio');
  for (const g of rm) {
    assert.match(String(g.id), /^G\d+$/);
    assert.ok(g.title && g.status, 'um gate sem titulo ou estado nao se pode mostrar');
  }
});

// ── 2 · a casca ──────────────────────────────────────────────────────────────

test('a casca nao traz payload cravado — so a ancora e os marcadores', () => {
  assert.equal(/window\.__SNAPSHOT__\s*=\s*\{/.test(CASCA), false,
               'a casca voltou a nascer com um instantaneo dentro');
  assert.ok(CASCA.includes('<div id="toast" role="status"></div>'), 'falta a ancora do payload');
});

/**
 * O DOM de bolso. So o que a casca toca — e se ela passar a tocar noutra coisa,
 * o teste rebenta, que e o que se quer.
 */
function domDeBolso() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      els.set(id, {
        id, textContent: '', innerHTML: '', className: '', dataset: {}, style: {},
        _attrs: {},
        setAttribute(k, v) { this._attrs[k] = v; },
        getAttribute(k) { return this._attrs[k]; },
        classList: { add() {}, remove() {} },
        closest() { return null; },
      });
    }
    return els.get(id);
  };
  const body = el('body');
  const doc = {
    body,
    getElementById: el,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  return { doc, els, el };
}

async function correrCasca(html) {
  const { doc, el } = domDeBolso();
  const sandbox = {
    document: doc,
    window: { matchMedia: () => ({ matches: false }) },
    navigator: { clipboard: { writeText: async () => {} } },
    // O boot tenta o F10 primeiro; sem ele, cai honestamente em `snapshot`.
    fetch: async () => { throw new Error('sem endpoint'); },
    AbortSignal: { timeout: () => null },
    requestAnimationFrame: (fn) => fn(),
    setInterval: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  };
  sandbox.window.document = doc;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  // O payload e o corpo do script, pela mesma ordem em que o browser os corre.
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    vm.runInContext(m[1], sandbox, { timeout: 5000 });
  }
  // O boot e assincrono (tenta o fetch); deixa-o assentar.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return { el, texto: () => [...Object.values(el)].join('') };
}

test('a casca RENDERIZA o payload: todo o numero no ecra saiu da medicao', async () => {
  const dir = bancada();
  const { html, snapshot } = await renderLedgerHtml({
    repoRoot: REPO, mooDir: dir, now: Date.parse('2026-09-01T12:00:00Z'),
    device: 'bancada', gpuImpl: semGpu, runGitImpl: gitFalso,
    homeImpl: path.join(dir, 'sem-home'), vaultPath: path.join(dir, 'sem-vault'), shellPath: SHELL,
  });
  const { el } = await correrCasca(html);

  assert.equal(el('act-now-n').textContent, String(snapshot.counters.cited_verified));
  assert.equal(el('act-was-n').textContent, String(snapshot.window.lines));
  assert.equal(el('case-cited').textContent, String(snapshot.counters.cited_verified));
  assert.equal(el('case-ref').textContent, String(snapshot.counters.refuted));
  assert.equal(el('case-tokens').textContent, String(snapshot.night.tokens_out));
  assert.match(el('hd-dev').textContent, /bancada/);
  assert.match(el('hd-dev').textContent, new RegExp(SHELL_VERSION.replace(/\./g, '\\.')));
  // Nenhum campo pode chegar ao ecra como `undefined` ou `[object Object]`.
  const ids = ['hd-dev', 'hd-ver', 'hd-mode', 'story-meta', 'act-hold', 'night-period',
               'night-lines', 'night-foot', 'herdlist', 'journeynote', 'tasks-meta',
               'storylist', 'enginelist', 'fieldbox', 'case-yard', 'colophon-src'];
  for (const id of ids) {
    const t = el(id).textContent + el(id).innerHTML;
    assert.ok(t.length > 0, `${id} ficou vazio — a casca nao o encheu`);
    assert.equal(/undefined|\[object Object\]|NaN/.test(t), false, `${id} renderizou lixo: ${t.slice(0, 120)}`);
  }
});

test('sem payload, a casca DIZ-O em vez de renderizar meia pagina de travessoes', async () => {
  const { el } = await correrCasca(CASCA);
  assert.match(el('body').innerHTML, /no payload/i);
  assert.match(el('body').innerHTML, /build-ledger-snapshot\.mjs/);
});

test('uma medicao ausente pinta n/d, e nunca zero', async () => {
  const dir = bancada();
  // Sem `spend-by-model` utilizavel e sem beacons, `yardstick` e a frota somem.
  const { html } = await renderLedgerHtml({
    repoRoot: REPO, mooDir: dir, now: Date.parse('2026-09-01T12:00:00Z'),
    device: 'bancada', gpuImpl: semGpu,
    runGitImpl: () => { throw new Error('sem git'); },
    homeImpl: path.join(dir, 'sem-home'), vaultPath: path.join(dir, 'sem-vault'), shellPath: SHELL,
  });
  const { el } = await correrCasca(html);
  assert.match(el('fieldbox').innerHTML, /n\/d of n\/d eligible/,
               'sem git, as worktrees tem de sair n/d — nao 0 de 0');
  assert.match(el('herdlist').innerHTML, /n\/d/, 'sem beacons, a pastagem diz n/d');
});

test('a casca mostra os beacons RECUSADOS — um device apagado em silencio nao existe', async () => {
  const dir = bancada();
  const { html } = await renderLedgerHtml({
    repoRoot: REPO, mooDir: dir, now: Date.parse('2026-09-01T12:00:00Z'),
    device: 'bancada', gpuImpl: semGpu, runGitImpl: gitFalso,
    homeImpl: path.join(dir, 'sem-home'), vaultPath: path.join(dir, 'sem-vault'), shellPath: SHELL,
  });
  // A funcao existe e e chamada mesmo quando a lista vem vazia.
  assert.match(html, /function rejeitados\(\)/);
  assert.match(html, /\}\)\.join\(''\) \+ rejeitados\(\);/);
  const { el } = await correrCasca(html);
  assert.equal(/Not shown above/.test(el('herdlist').innerHTML), false,
               'sem recusados, nao se anuncia uma lista vazia');
});

// ── 4 · G6 · os campos que tiram as historias da heuristica ──────────────────

/** A mesma bancada, mais decisoes de triagem sobre os recibos dela. */
function bancadaComTriagem() {
  const dir = bancada();
  fs.writeFileSync(path.join(dir, 'triagem.jsonl'), [
    // sobre o recibo com `chave` — este junta-se ao ledger
    { chave: 'P2|a.js:1-10:aa', decisao: 'issue', por: 'dono', via: 'painel',
      ts: '2026-08-24T10:00:00Z' },
    // sobre um apontamento do detector — nunca passou pelo ledger de rondas
    { chave: 'det|z.js:9:ff', decisao: 'descartado', por: 'agente', motivo: 'trivial',
      via: 'autopilot-l1', ts: '2026-08-25T10:00:00Z', nota: 'ferramenta interna' },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  return dir;
}

test('G6 · `triage.items[]` traz as DECISOES, nao so as contagens delas', async () => {
  const s = await construir(bancadaComTriagem());
  assert.ok(Array.isArray(s.triage.items), 'sem items, a pagina volta a inventar historias');
  assert.equal(s.triage.items.length, 2);
  // As ultimas primeiro.
  assert.equal(s.triage.items[0].decided_at, '2026-08-25T10:00:00Z');
  const comRecibo = s.triage.items.find((i) => i.chave === 'P2|a.js:1-10:aa');
  assert.equal(comRecibo.decision, 'issue');
  assert.equal(comRecibo.ficheiro, 'a.js');
  assert.equal(comRecibo.pilar, 'P2');
  assert.equal(comRecibo.route, 'C2');
  assert.equal(comRecibo.by, 'dono');
  assert.equal(comRecibo.via, 'painel');
});

test('G6 · uma decisao sem recibo no ledger leva null — nunca um recibo emprestado', async () => {
  const s = await construir(bancadaComTriagem());
  const semRecibo = s.triage.items.find((i) => i.chave === 'det|z.js:9:ff');
  assert.equal(semRecibo.finding_id, null);
  assert.equal(semRecibo.ficheiro, null);
  assert.equal(semRecibo.route, null, 'sem recibo nao se sabe que motor correu');
  assert.equal(semRecibo.reason, 'trivial', 'o que a decisao SABE continua a viajar');
});

test('G6 · a lista de motivos vem FECHADA do motor — a pagina nao a pode inventar', async () => {
  const s = await construir(bancada());
  const { MOTIVOS } = await import('./triagem.mjs');
  assert.deepEqual(s.triage.reasons, MOTIVOS);
  assert.ok(s.triage.reasons.length > 0);
});

test('G6 · `finding_id` e estavel: a mesma chave da o mesmo id, sempre', async () => {
  const a = await construir(bancadaComTriagem());
  const b = await construir(bancadaComTriagem());
  const id = (s) => s.needs_you[0].finding_id;
  assert.equal(id(a), id(b));
  assert.match(id(a), /^f[0-9a-f]{12}$/);
  // E nao carrega o caminho do disco do dono para dentro do HTML.
  assert.equal(/a\.js/.test(id(a)), false);
});

test('G6 · um recibo sem chave de conteudo diz que o id NAO e estavel', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-ledger-legado-'));
  fs.writeFileSync(path.join(dir, 'runner-ledger.jsonl'), JSON.stringify({
    ts: '2026-08-22T06:00:00Z', pilar: 'P2', verdict: 'citacao-ok', ficheiro: 'v.js',
    janela: '1-9', conclusao: 'achado', modelo: 'm', resultado_resumo: 'PROOF: v.js:2',
  }) + '\n');
  fs.writeFileSync(path.join(dir, 'triagem.jsonl'), JSON.stringify({
    chave: 'v.js:1-9@2026-08-22T06:00:00Z', decisao: 'issue', por: 'dono', ts: '2026-08-24T10:00:00Z',
  }) + '\n');
  const s = await construir(dir);
  assert.equal(s.needs_you.length, 1);
  assert.equal(s.needs_you[0].finding_id_estavel, false,
               'um id derivado de um instante nao sobrevive a proxima ronda');
});

test('G6 · `route` viaja como TABELA, e cada classe cita quem a impoe', async () => {
  const s = await construir(bancada());
  assert.ok(Array.isArray(s.route.classes) && s.route.classes.length);
  assert.equal(s.route.fonte, 'tools/cockpit/runner/rota.mjs');
  for (const c of s.route.classes) assert.ok(c.prova, `${c.id} sem prova`);
  // O achado por decidir diz quem o achou E quem o corrigiria.
  const s2 = await construir(bancadaComTriagem());
  assert.equal(s2.needs_you[0].route, 'C2');
  assert.equal(s2.needs_you[0].route_next, 'C4');
});

test('G6 · `publish` responde "a frota ve-me?" pelo git, e n/d quando nao mediu', async () => {
  const s = await construir(bancada());
  assert.ok('publish' in s);
  // Sem vault montado na bancada, a resposta honesta e nenhuma medicao.
  assert.equal(s.publish.ultima_publicacao, null);
  assert.ok(s.publish.porque, 'um n/d sem motivo nao serve de nada');
});

test('G6 · `feed[].device` diz quem produziu a linha, sem a pagina adivinhar', async () => {
  const { buildFeed } = await import('./fleet-state.mjs');
  const feed = buildFeed(RECIBOS, 3, { device: 'bancada' });
  assert.equal(feed.length, 3);
  for (const f of feed) assert.equal(f.device, 'bancada');
  // O device escrito NA LINHA ganha ao do chamador: um ledger que um dia junte
  // duas frotas nao pode ser recarimbado com o nome de quem o esta a ler.
  assert.equal(buildFeed([{ ts: 'x', device: 'outro' }], 1, { device: 'bancada' })[0].device, 'outro');
  // Sem nenhum dos dois, `null` — nunca o hostname de quem corre o teste.
  assert.equal(buildFeed([{ ts: 'x' }], 1)[0].device, null);
});
