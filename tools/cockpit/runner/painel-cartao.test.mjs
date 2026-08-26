/**
 * painel-cartao.test.mjs — o painel julgado pelo que RENDERIZA, nao pelo que diz.
 *
 * Os testes de UI deste repo (`cockpit-ux.test.mjs`) afirmam sobre o TEXTO do
 * `<script>`: provam a forma do codigo e sao baratos. Nao chegam para os tres
 * defeitos de 2026-08-25, porque nenhum deles e uma linha errada — os tres sao
 * o comportamento certo aplicado ao caso errado:
 *
 *   1. o rodape carimbava a hora do RENDER, e render() corre de 3 em 3 s: o
 *      carimbo avancava durante as 5 h em que o corpo mostrou as 12:09;
 *   2. o nome do device encolhia a 8px de largura por 233px de altura;
 *   3. um beacon MORTO ha 3592 s aparecia laranja, a dizer `holding`, sem idade.
 *
 * Um regex sobre o codigo nao apanha nenhum. Por isso este ficheiro CORRE o
 * script real do painel — o mesmo `<script>` que o browser corre, sem copia —
 * num contexto `vm` com um DOM minimo, e olha para a arvore que sai. O
 * `Date.now` e injectado para se poder envelhecer o painel sem esperar 5 h.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHELL = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html'), 'utf8');
const SCRIPT = /<script>([\s\S]*)<\/script>/.exec(SHELL)[1];

// ── DOM minimo ──────────────────────────────────────────────────────────────
// So o que o painel usa. Um DOM a fingir que e completo seria mais uma coisa a
// manter; este quebra RUIDOSAMENTE se o painel comecar a usar outra coisa.

function noh(tag = 'div') {
  return {
    tag, className: '', title: '', hidden: false, style: {}, attrs: {}, children: [], _text: '',
    set textContent(v) { this._text = String(v); this.children = []; },
    get textContent() {
      return this.children.length
        ? this.children.map((c) => c.textContent).join('')
        : this._text;
    },
    appendChild(c) { this.children.push(c); return c; },
    append(...cs) { this.children.push(...cs); },
    replaceChildren(...cs) { this.children = cs; },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {},
    classList: { toggle() {}, add() {}, remove() {} },
    get dataset() { return this.attrs; },
    // O arco de GPU e um <path> SVG e o painel mede-o. Um numero fixo chega:
    // o que este ficheiro julga e o cartao da frota e o rodape, nao o arco.
    getTotalLength: () => 248,
    /** O painel varre os proprios filhos para animar as barras. */
    querySelectorAll(sel) {
      const cls = String(sel).replace(/^\./, '');
      return porClasse(this, cls);
    },
  };
}

/** Todos os nos com esta classe, em profundidade. */
function porClasse(no, cls, out = []) {
  if (no && typeof no.className === 'string' && no.className.split(/\s+/).includes(cls)) out.push(no);
  for (const c of (no && no.children) || []) porClasse(c, cls, out);
  return out;
}

/**
 * Levanta o painel real. Devolve os nos por id + o relogio controlavel.
 *
 * O IIFE e retirado de proposito: sem isso as funcoes do painel ficam fechadas
 * no closure e nao ha nada a testar senao o texto delas — que e precisamente o
 * que ja falhou em apanhar estes tres.
 */
function levantarPainel({ agora = Date.parse('2026-08-25T20:00:00Z') } = {}) {
  const corpo = SCRIPT.replace(/^\s*\(\(\)\s*=>\s*\{/, '').replace(/\}\)\(\);?\s*$/, '');
  const relogio = { agora };
  const nos = new Map();
  const doc = {
    getElementById: (id) => { if (!nos.has(id)) nos.set(id, noh()); return nos.get(id); },
    createElement: (t) => noh(t),
    createTextNode: (t) => ({ textContent: String(t), children: [] }),
    addEventListener() {}, querySelectorAll: () => [], hidden: false, body: noh('body'),
  };
  const RelogioDate = new Proxy(Date, {
    get(alvo, chave) { return chave === 'now' ? () => relogio.agora : Reflect.get(alvo, chave); },
  });
  const ctx = {
    document: doc, location: { protocol: 'http:' },
    fetch: () => new Promise(() => {}),          // o poll nunca resolve: quem manda e o teste
    setInterval: () => 0, setTimeout: () => 0, clearInterval() {},
    // O painel anima as barras de rendimento num frame seguinte. Aqui corre-se
    // logo: o que se julga e o TEXTO, e adiar so o esconderia do teste.
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    AbortSignal: { timeout: () => null },
    Date: RelogioDate, console, JSON, Math, Number, String, Object, Array, Boolean, isNaN,
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  new vm.Script(corpo, { filename: 'moo-pilot-shell.html <script>' }).runInContext(ctx);
  return { ctx, nos, doc, relogio, no: (id) => doc.getElementById(id) };
}

const DEVICE = (extra = {}) => Object.assign({
  device: 'mac-mini-de-paulo', ts: '2026-08-25T19:59:00Z', running: true,
  frescura: { estado: 'vivo', idade_s: 10, motivo: null },
  self: true, gpu_pct: 40, recibos: null, usd: 0,
}, extra);

const FROTA = (devices) => ({ device: 'mac-mini-de-paulo', frota: { frota: devices, aviso: null } });

// ── BUG 2 · o nome do device rendia vertical ────────────────────────────────
// Medido: span 8px de largura por 233px de altura, dentro de um cartao de 233px.
// A causa e `overflow-wrap:anywhere`, que poe o min-content do texto a UM
// caracter e autoriza um item flex encolhivel a descer ate la.

test('BUG2 · o nome do device corta numa linha e o nome INTEIRO fica legivel no title', () => {
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({ device: 'desktop-j26409q', self: false, frescura: { estado: 'vivo', idade_s: 30 } })]));
  const [nome] = porClasse(p.no('fleet'), 'nm');
  assert.ok(nome, 'nao ha no com a classe .nm — o cartao mudou de forma');
  assert.equal(nome.textContent, 'desktop-j26409q');
  assert.equal(nome.title, 'desktop-j26409q',
    'cortar sem dar como ler o resto e esconder — e o nome e o que distingue duas maquinas');
});

test('BUG2 · o self tambem leva o sufixo no title, nao so no texto', () => {
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({ device: 'mac-mini-de-paulo', self: true })]));
  const [nome] = porClasse(p.no('fleet'), 'nm');
  assert.match(nome.title, /mac-mini-de-paulo/);
  assert.equal(nome.title, nome.textContent, 'o title tem de ser o nome INTEIRO que se ve cortado');
});

test('BUG2 · as tres propriedades do CSS estao la, e as tres sao precisas', () => {
  const css = /\.dev \.nm\{([^}]*)\}/.exec(SHELL.replace(/\n\s+/g, ''));
  assert.ok(css, 'a regra .dev .nm desapareceu');
  const regra = css[1];
  assert.match(regra, /min-width:\s*5em/, 'o piso que o overflow-wrap destruiu');
  assert.match(regra, /white-space:\s*nowrap/, 'sem isto continua a partir em N linhas');
  assert.match(regra, /text-overflow:\s*ellipsis/, 'uma linha cortada, nao oito');
  assert.ok(!/overflow-wrap:\s*anywhere/.test(regra),
    'o `overflow-wrap:anywhere` e a causa: um caracter de min-content autoriza os 8px');
});

// ── BUG 3 · um beacon morto aparecia laranja a dizer "holding" ──────────────
// Medido: o PC com 3592 s de beacon, pill `holding · <razao>`, sem idade
// nenhuma. `pausa.activa` e uma afirmacao sobre o INSTANTE do beacon: num
// beacon de ha uma hora ela quer dizer "ha uma hora estava em pausa".

test('BUG3 · beacon MORTO manda no cartao: a idade e a manchete, a pausa e contexto', () => {
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({
    device: 'desktop-j26409q', self: false, running: false,
    frescura: { estado: 'morto', idade_s: 3592, motivo: 'sem sinal ha 3592s' },
    pausa: { activa: true, razao: 'human queue full (524/6)' },
  })]));
  const [chip] = porClasse(p.no('fleet'), 'chip');
  assert.match(chip.textContent, /no signal for/, 'a idade tem de vir primeiro');
  assert.match(chip.textContent, /60 min/, 'e tem de ser a idade REAL medida, nao um estado sem numero');
  assert.match(chip.className, /\bdead\b/, 'um sinal morto nao pode pintar-se de laranja');
  assert.match(chip.textContent, /was holding/, 'o que estava a fazer nao se apaga — desce a contexto');
  const [cartao] = porClasse(p.no('fleet'), 'dev');
  assert.match(cartao.className, /\bmorto\b/,
    'o cartao inteiro tem de esmorecer — um device em pausa com o sinal morto ficava a cores');
});

test('BUG3 · o bom caso NAO regrediu: pausa com beacon FRESCO continua laranja e a dizer holding', () => {
  // Este e o teste que impede a correccao de trocar um defeito por outro. O ramo
  // da pausa existe para nao pintar de vermelho um device obediente.
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({
    device: 'desktop-j26409q', self: false, running: false,
    frescura: { estado: 'vivo', idade_s: 20, motivo: null },
    pausa: { activa: true, razao: 'human queue full (524/6)' },
  })]));
  const [chip] = porClasse(p.no('fleet'), 'chip');
  assert.match(chip.className, /\bwarn\b/, 'obedecer ao escalonador nao e estar avariado');
  const [cartao] = porClasse(p.no('fleet'), 'dev');
  assert.ok(!/\bmorto\b/.test(cartao.className));
});

test('BUG3 · sem timestamp diz-se isso, nao se inventa uma idade', () => {
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({
    device: 'jetson', self: false,
    frescura: { estado: 'morto', idade_s: null, motivo: 'sem timestamp' },
  })]));
  const [chip] = porClasse(p.no('fleet'), 'chip');
  assert.match(chip.textContent, /no signal — sem timestamp/);
  assert.ok(!/NaN|undefined|null/.test(chip.textContent), 'ausencia nunca vira numero');
});

// ── BUG 1 · o rodape carimbava o RENDER, nao os DADOS ───────────────────────
// Medido: tab aberta 5 h, corpo do painel com o estado das 12:09, rotulo
// `source live`, e o carimbo do rodape a avancar. render() corre de 3 em 3 s,
// portanto `new Date().toLocaleTimeString()` avanca SEMPRE — inclusive quando
// nenhum fetch chega ha horas. Um carimbo que nunca envelhece nao e um carimbo.

/** Faz o painel aceitar UM payload como se tivesse vindo do endpoint, no instante `quando`. */
async function alimentar(p, payload, quando) {
  p.relogio.agora = quando;
  p.ctx.fetch = async () => ({ ok: true, json: async () => payload });
  await p.ctx.poll();
}

const PAYLOAD = {
  device: 'mac-mini-de-paulo', running: true, recibos: { total: 10, citacao_ok: 9 },
  usd: 0, conector: '1.49.4', owner_tz: 'America/Sao_Paulo',
  frescura: { estado: 'vivo', idade_s: 5, motivo: null },
  frota: { frota: [], aviso: null },
};
const T0 = Date.parse('2026-08-25T15:09:00Z');

test('BUG1 · dados frescos: o rodape diz a idade em segundos e pode dizer live', async () => {
  const p = levantarPainel();
  await alimentar(p, PAYLOAD, T0);
  const pe = p.no('foot').textContent;
  assert.match(pe, /source live/);
  assert.match(pe, /data \d+s old/, 'a idade dos DADOS, nao a hora do render');
  assert.ok(!/STALE/.test(pe));
});

test('BUG1 · cinco horas depois, sem fetch novo, o rodape DEIXA de dizer live e diz a idade', async () => {
  const p = levantarPainel();
  await alimentar(p, PAYLOAD, T0);

  // A tab fica aberta cinco horas. O endpoint deixa de responder, mas o painel
  // nao chega a marcar `offline` — e a reproducao exacta do que o dono viu.
  p.relogio.agora = T0 + 5 * 3600 * 1000;
  p.ctx.render();

  const pe = p.no('foot').textContent;
  assert.match(pe, /STALE data/,
    'com dados de ha 5 h o rodape nao pode afirmar `live` — era essa a mentira');
  assert.match(pe, /data is 5 h old/, 'tem de dizer QUANTO, nao so que esta velho');
  assert.match(pe, /arrived at/, 'e a que horas chegaram — o dono viu 12:09 e nao teve como saber');
});

test('BUG1 · o carimbo do rodape NAO pode ser a hora do render', () => {
  // A regressao original, fixada como texto: qualquer `new Date()` sem argumento
  // no rodape volta a carimbar o relogio do render em vez da idade dos dados.
  const codigo = SCRIPT.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const rodape = /\$\('foot'\)\.textContent[\s\S]*?;/.exec(codigo);
  assert.ok(rodape, 'o rodape mudou de forma');
  assert.ok(!/new Date\(\)/.test(rodape[0]),
    'o rodape voltou a carimbar `new Date()` — a hora do render, que avanca de 3 em 3 s');
  assert.match(rodape[0], /lastFetchAt/, 'tem de ser ancorado no ultimo fetch BEM SUCEDIDO');
});

test('BUG1 · antes de qualquer fetch o rodape diz isso, e nao uma idade de zero', async () => {
  const p = levantarPainel();
  // Estado injectado sem nunca ter havido fetch: `lastFetchAt` fica a 0.
  p.ctx.fetch = async () => { throw new Error('sem endpoint'); };
  await p.ctx.poll();
  await p.ctx.poll();          // duas falhas = offline declarado
  const pe = p.no('foot').textContent;
  if (pe) {
    assert.ok(!/data 0s old/.test(pe), 'nunca houve fetch — "0s" seria a mentira mais discreta');
  }
});

// ── item 4 · "beacon sem pilar" nao e o mesmo que "device em pausa" ─────────
// O kickoff pedia para "alinhar o schema do beacon win32 com o do mac". Medido
// nos beacons REAIS do vault a 2026-08-25: o schema e identico. O PC (`win32`)
// e o `paulo-desktop` (`linux`) trazem `pilar_atual:null` porque estao mesmo em
// pausa (`razao: "no eligible loop (all capped / paused / suspended)"`). O
// defeito e o ROTULO, que mandava procurar uma lacuna de telemetria inexistente.

test('ITEM4 · um device em pausa diz porque nao esta a cacar, nao "beacon sem pilar"', () => {
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({
    device: 'desktop-j26409q', self: false, running: true, pilar_atual: null,
    frescura: { estado: 'vivo', idade_s: 30 },
    pausa: { activa: true, razao: 'no eligible loop (all capped / paused / suspended)' },
  })]));
  const [caca] = porClasse(p.no('fleet'), 'hunt');
  assert.match(caca.textContent, /not hunting/);
  assert.match(caca.textContent, /no eligible loop/, 'a razao real tem de aparecer');
  assert.ok(!/no pillar reported/.test(caca.textContent),
    'isso mandava procurar um defeito de telemetria que nao existe');
});

test('ITEM4 · sem pausa E sem pilar, continua a ser uma lacuna do beacon — e diz-se', () => {
  const p = levantarPainel();
  p.ctx.renderFleet(FROTA([DEVICE({
    device: 'jetson', self: false, running: true, pilar_atual: null,
    frescura: { estado: 'vivo', idade_s: 30 },
  })]));
  const [caca] = porClasse(p.no('fleet'), 'hunt');
  assert.match(caca.textContent, /no pillar reported in this beacon/,
    'este caso e mesmo uma lacuna, e apaga-lo seria trocar um rotulo errado por outro');
});

// ── item 7 · os contadores sao de uma JANELA, e isso tem de estar escrito ──
// O achado mandava procurar um defeito de escrita no `triagem.json`. Medido: nao
// ha. `contarTriagem` cruza as decisoes com os recibos da janela do ledger (5000
// linhas); nesta maquina o `runner-ledger.jsonl` tem 5492, portanto ha 492
// recibos fora dela. Decidir sobre um deles nao mexe no total — o contador
// estava certo, o rotulo e que nao dizia sobre o que contava.

test('ITEM7 · com o ledger truncado, o funil DIZ que conta sobre uma janela', () => {
  const p = levantarPainel();
  p.ctx.renderYield({
    recibos: { total: 5000, citacao_ok: 4000 },
    ledger: { linhas: 5492, janela: 5000, truncado: true },
    triagem: { achados: 828, aceite: 3, descartado: 11, issue: 0 },
    pilares: { P1: { total: 3000, citacao_ok: 2500 }, P2: { total: 2000, citacao_ok: 1500 } },
  });
  const texto = p.no('yield-head').textContent;
  assert.match(texto, /counted over the last 5000 ledger lines of 5492/);
  assert.match(texto, /492 older receipt\(s\) are outside this window/,
    'o dono tem de saber QUANTOS ficaram de fora — foi essa a pergunta que ele fez');
});

test('ITEM7 · sem truncagem nao se acrescenta ruido nenhum', () => {
  const p = levantarPainel();
  p.ctx.renderYield({
    recibos: { total: 300, citacao_ok: 250 },
    ledger: { linhas: 300, janela: 300, truncado: false },
    triagem: { achados: 40, aceite: 3, descartado: 11, issue: 0 },
    pilares: { P1: { total: 300, citacao_ok: 250 } },
  });
  assert.ok(!/outside this window/.test(p.no('yield-head').textContent),
    'um aviso por um estado normal e ruido de rotina — o erro que este painel ja corrigiu noutros sitios');
});

// ── AS DUAS VIAS · o rotulo servido contra o recurso do painel ──────────────
//
// Nascido a 2026-08-26, ao fundir o #396 (que moveu o rotulo para
// `rotulos-da-frota.mjs`, onde ha testes) com o `main` (que trazia a regra do
// beacon morto do #401). O painel passou a preferir `d.rotulo` — o facto que o
// servidor ja calculou — e a derivar localmente so quando ele falta, para um
// endpoint de uma versao anterior.
//
// Um recurso que DIVERGE do rotulo servido e pior do que recurso nenhum: mostra
// uma coisa quando o servidor esta desactualizado e outra quando esta em dia,
// sem dizer ao dono qual das duas esta a ver. Este ficheiro corre o script real
// do painel; o `rotulos-da-frota.mjs` e o modulo real. Confronta-se um contra o
// outro em vez de se confiar no comentario de nenhum dos dois.

test('as duas vias concordam: o recurso do painel diz o mesmo que o rotulo servido', async () => {
  const { rotuloDeDevice } = await import('./rotulos-da-frota.mjs');

  const casos = [
    { nome: 'vivo a trabalhar',
      d: { running: true, via: 'disco', frescura: { estado: 'vivo', idade_s: 12, motivo: null } } },
    { nome: 'vivo mas parado',
      d: { running: false, via: 'disco', frescura: { estado: 'vivo', idade_s: 4, motivo: null } } },
    { nome: 'pausa com beacon fresco',
      d: { running: false, via: 'disco', frescura: { estado: 'stale', idade_s: 90, motivo: 'sem sinal ha 90s' },
           pausa: { activa: true, razao: 'human queue full (6/6)' } } },
    { nome: 'pausa com beacon MORTO — o defeito do #401',
      d: { running: false, via: 'remoto', frescura: { estado: 'morto', idade_s: 3592, motivo: 'sem sinal ha 3592s' },
           pausa: { activa: true, razao: 'human queue full (6/6)' } } },
    { nome: 'pausa obsoleta e beacon morto',
      d: { running: false, via: 'disco', frescura: { estado: 'morto', idade_s: 300000, motivo: 'sem sinal' },
           pausa: { activa: false, obsoleta: true, idade_s: 300000, razao: 'queue full' } } },
    { nome: 'morto sem pausa nenhuma',
      d: { running: false, via: 'remoto', frescura: { estado: 'morto', idade_s: 172800, motivo: 'sem sinal ha 172800s' } } },
    { nome: 'morto sem idade — nunca inventar um numero',
      d: { running: false, via: 'remoto', frescura: { estado: 'morto', idade_s: null, motivo: 'no receipt' } } },
    { nome: 'stale e aviso, nao morte',
      d: { running: true, via: 'disco', frescura: { estado: 'stale', idade_s: 400, motivo: 'sem sinal ha 400s' } } },
  ];

  for (const { nome, d } of casos) {
    const servido = rotuloDeDevice({ ...d, self: false });

    // via A — o painel RENDERIZA o rotulo que o servidor calculou.
    const pa = levantarPainel();
    pa.ctx.renderFleet(FROTA([DEVICE({ ...d, self: false, rotulo: servido })]));
    const [chipA] = porClasse(pa.no('fleet'), 'chip');

    // via B — o mesmo device SEM `rotulo`: o painel cai no recurso local.
    const pb = levantarPainel();
    pb.ctx.renderFleet(FROTA([DEVICE({ ...d, self: false, rotulo: undefined })]));
    const [chipB] = porClasse(pb.no('fleet'), 'chip');

    assert.equal(chipB.textContent, chipA.textContent,
      `${nome}: o recurso do painel diz outra coisa que o rotulo servido`);
    assert.equal(chipB.className, chipA.className,
      `${nome}: o recurso do painel pinta outra cor que o rotulo servido`);
  }
});
