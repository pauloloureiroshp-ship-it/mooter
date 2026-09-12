/**
 * enter-submete.test.mjs — Enter num campo de texto nao pode ser tecla morta.
 *
 * Medido ao vivo pelo dono a 2026-09-01: o "Ask the Moo" do Ledger funcionava
 * de ponta a ponta (qwen2.5-coder:14b, 7,3s, $0, recibo na resposta) e a unica
 * forma de o disparar era acertar no botao. Enter dentro do textarea nao fazia
 * NADA. Do lado de quem olha, isso nao se le como "falta um atalho": le-se
 * como avaria — e a pergunta que ele ja tinha escrito ficava la, intacta.
 *
 * Este ficheiro CORRE os dois `<script>` reais (Ledger e painel) num DOM de
 * bolso e dispara teclas. Um regex sobre o codigo nao servia: `e.key === 'Enter'`
 * escrito num handler que ninguem registou passa na grep e continua morto no
 * browser. E a regra tem tres metades, nao uma —
 *
 *   Enter        submete
 *   Shift+Enter  NAO submete (e a quebra de linha)
 *   IME          NAO submete (o Enter que fecha um acento num teclado PT)
 *
 * — e so a primeira e obvia. As outras duas sao as que partem a escrita de
 * quem escreve portugues.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { renderLedgerHtml } from './build-ledger-snapshot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const PAINEL = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html'), 'utf8');

/** So o que as duas cascas usam. Quebra ruidosamente se passarem a usar mais. */
function noh(id = '') {
  return {
    id, tag: 'div', value: '', className: '', title: '', hidden: false, disabled: false,
    style: {}, attrs: {}, children: [], _text: '', innerHTML: '', ouvintes: {},
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    replaceChildren(...cs) { this.children = cs; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, fn) { (this.ouvintes[t] ||= []).push(fn); },
    classList: { toggle() {}, add() {}, remove() {} },
    get dataset() { return this.attrs; },
    getTotalLength: () => 248,
    closest() { return null; },
    querySelectorAll: () => [],
    focus() {},
  };
}

/** Uma tecla como o browser a entrega: com alvo, e com as duas guardas. */
const tecla = (alvo, { key = 'Enter', shiftKey = false, isComposing = false } = {}) => {
  let travado = false;
  return {
    key, shiftKey, isComposing, target: alvo,
    preventDefault() { travado = true; },
    get defaultPrevented() { return travado; },
  };
};

// ── o Ledger: "Ask the Moo" ─────────────────────────────────────────────────

function bancadaLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-enter-'));
  fs.writeFileSync(path.join(dir, 'runner-ledger.jsonl'), `${JSON.stringify({
    ts: '2026-08-22T06:00:00Z', pilar: 'P2', verdict: 'citacao-ok', modelo: 'qwen2.5-coder:14b',
    ficheiro: 'a.js', janela: '1-10', chave: 'P2|a.js:1-10:aa', engine: 'ollama-local',
    dur_s: 4, tokens_out: 20, usd: 0, resultado_resumo: 'PROOF: a.js:3', conclusao: 'achado',
  })}\n`);
  return dir;
}

/**
 * Levanta o Ledger real, com o payload real, ligado a um F10 de mentira.
 * `viva: false` faz o `/fleet.json` do boot falhar — e a pagina cai
 * honestamente em `snapshot`, que e o modo em que nada pode escrever.
 */
async function levantarLedger({ viva = true } = {}) {
  const dir = bancadaLedger();
  const { html } = await renderLedgerHtml({
    repoRoot: REPO, mooDir: dir, now: Date.parse('2026-09-01T12:00:00Z'),
    device: 'bancada', gpuImpl: async () => null,
    runGitImpl: () => 'worktree /r/projecto\nHEAD abc\nbranch refs/heads/main\n',
    homeImpl: path.join(dir, 'sem-home'), vaultPath: path.join(dir, 'sem-vault'),
  });

  const nos = new Map();
  const ouvintes = {};
  const pedidos = [];
  const doc = {
    getElementById: (id) => { if (!nos.has(id)) nos.set(id, noh(id)); return nos.get(id); },
    createElement: () => noh(),
    addEventListener(t, fn) { (ouvintes[t] ||= []).push(fn); },
    querySelectorAll: () => [],
    body: noh('body'),
    hidden: false,
  };
  const ctx = {
    document: doc,
    location: { protocol: 'http:', origin: 'http://127.0.0.1:4290' },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch: async (url, opts) => {
      pedidos.push({ url: String(url), opts });
      if (!viva) throw new Error('sem endpoint');
      if (String(url).includes('/fleet.json')) {
        return { ok: true, status: 200, json: async () => ({ recibos: [] }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, texto: 'ola', modelo: 'qwen2.5-coder:14b', dur_s: 1, tokens_out: 3 }) };
    },
    AbortSignal: { timeout: () => null },
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    setInterval: () => 0, setTimeout: () => 0, clearTimeout() {}, clearInterval() {},
    console,
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    // O boot renderiza a pagina inteira; se um render tropecar no DOM de bolso
    // isso NAO e o que este ficheiro julga, e nao pode mascarar o resultado.
    try { vm.runInContext(m[1], ctx, { timeout: 5000 }); } catch { /* DOM magro */ }
  }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  fs.rmSync(dir, { recursive: true, force: true });
  return { ctx, doc, nos, ouvintes, pedidos, no: (id) => doc.getElementById(id) };
}

const assistiu = (pedidos) => pedidos.filter((p) => p.url.includes('/assist')).length;

test('LEDGER: o handler de teclas foi mesmo REGISTADO (nao escrito e esquecido)', async () => {
  const l = await levantarLedger();
  assert.ok((l.ouvintes.keydown || []).length >= 1,
    'nenhum keydown registado no documento — o atalho nao existe no browser');
});

test('LEDGER: Enter submete a pergunta', async () => {
  const l = await levantarLedger();
  l.no('moo-q').value = 'o que quer dizer refuted?';
  const antes = assistiu(l.pedidos);
  const e = tecla(l.no('moo-q'));
  for (const fn of l.ouvintes.keydown) fn(e);
  await new Promise((r) => setImmediate(r));
  assert.ok(e.defaultPrevented, 'Enter tem de travar a quebra de linha antes de submeter');
  assert.equal(assistiu(l.pedidos), antes + 1, 'Enter nao chamou o motor local');
});

test('LEDGER: Shift+Enter NAO submete — e a quebra de linha', async () => {
  const l = await levantarLedger();
  l.no('moo-q').value = 'primeira linha';
  const antes = assistiu(l.pedidos);
  const e = tecla(l.no('moo-q'), { shiftKey: true });
  for (const fn of l.ouvintes.keydown) fn(e);
  await new Promise((r) => setImmediate(r));
  assert.equal(e.defaultPrevented, false, 'Shift+Enter tem de chegar ao textarea');
  assert.equal(assistiu(l.pedidos), antes, 'Shift+Enter submeteu — parte a escrita multi-linha');
});

test('LEDGER: o Enter que FECHA UM ACENTO nao submete (IME)', async () => {
  const l = await levantarLedger();
  l.no('moo-q').value = 'porque e que';
  const antes = assistiu(l.pedidos);
  const e = tecla(l.no('moo-q'), { isComposing: true });
  for (const fn of l.ouvintes.keydown) fn(e);
  await new Promise((r) => setImmediate(r));
  assert.equal(assistiu(l.pedidos), antes,
    'submeteu a meio de uma composicao — num teclado PT isso parte a palavra');
});

test('LEDGER: Enter noutro campo qualquer nao dispara o Ask', async () => {
  const l = await levantarLedger();
  const antes = assistiu(l.pedidos);
  const e = tecla(l.no('outro-campo-qualquer'));
  for (const fn of l.ouvintes.keydown) fn(e);
  await new Promise((r) => setImmediate(r));
  assert.equal(assistiu(l.pedidos), antes);
});

test('LEDGER: no snapshot carimbado, Enter nao escreve em device nenhum', async () => {
  const l = await levantarLedger({ viva: false });
  l.no('moo-q').value = 'ola';
  const antes = assistiu(l.pedidos);
  const e = tecla(l.no('moo-q'));
  for (const fn of l.ouvintes.keydown) fn(e);
  await new Promise((r) => setImmediate(r));
  assert.equal(assistiu(l.pedidos), antes,
    'a pagina carimbada nao tem device — Enter nao pode fingir que tem');
});

// ── o painel: o filtro de ficheiro ──────────────────────────────────────────

function levantarPainel() {
  const corpo = /<script>([\s\S]*)<\/script>/.exec(PAINEL)[1]
    .replace(/^\s*\(\(\)\s*=>\s*\{/, '').replace(/\}\)\(\);?\s*$/, '');
  const nos = new Map();
  const doc = {
    getElementById: (id) => { if (!nos.has(id)) nos.set(id, noh(id)); return nos.get(id); },
    createElement: () => noh(), createTextNode: (t) => ({ textContent: String(t), children: [] }),
    addEventListener() {}, querySelectorAll: () => [], hidden: false, body: noh('body'),
  };
  const ctx = {
    document: doc, location: { protocol: 'http:' },
    fetch: () => new Promise(() => {}),
    setInterval: () => 0, setTimeout: () => 0, clearInterval() {},
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    AbortSignal: { timeout: () => null },
    console, JSON, Math, Number, String, Object, Array, Boolean, isNaN, Date,
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  new vm.Script(corpo, { filename: 'moo-pilot-shell.html <script>' }).runInContext(ctx);
  return { ctx, no: (id) => doc.getElementById(id) };
}

test('PAINEL: o campo de ficheiro escuta Enter — nao e tecla morta', () => {
  const p = levantarPainel();
  const campo = p.no('f-file');
  assert.ok((campo.ouvintes.keydown || []).length >= 1, 'o filtro nao escuta teclas');
  assert.ok((campo.ouvintes.input || []).length >= 1, 'o filtro deixou de aplicar a cada letra');
});

test('PAINEL: Enter aplica o filtro e trava o comportamento por omissao', () => {
  const p = levantarPainel();
  const campo = p.no('f-file');
  campo.value = 'tools/router';
  const e = tecla(campo);
  for (const fn of campo.ouvintes.keydown) fn(e);
  assert.ok(e.defaultPrevented, 'Enter tem de travar a submissao implicita do browser');
});

test('PAINEL: o Enter de uma composicao nao mexe no filtro', () => {
  const p = levantarPainel();
  const campo = p.no('f-file');
  const e = tecla(campo, { isComposing: true });
  for (const fn of campo.ouvintes.keydown) fn(e);
  assert.equal(e.defaultPrevented, false);
});
