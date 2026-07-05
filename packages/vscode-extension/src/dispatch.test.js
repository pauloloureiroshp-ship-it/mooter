'use strict';
// dispatch.test.js — ⇄ Moo Dispatch F0. Prova, sem vscode e sem I/O real:
//   • parser front-matter (canónico) → regex (fallback MP5) → needsInput (nunca adivinha)
//   • sanitização de nome (traversal/separadores rejeitados)
//   • encodeProjectDir determinístico + samePath robusto em Windows
//   • ocupação 1w=1s sobre fixtures de mtime (viva vs livre)
//   • escada de plano A→B→C + bloqueio por ocupação
//   • bootstrap CONSTANTE (sem conteúdo do MP) + deep-link
//   • orchestrateLaunch com seams injectados: prefill SÓ após detectar .jsonl novo; timeout
//     NÃO digita nada; ocupada re-checada no clique bloqueia; git worktree add só quando falta
//   • renderDispatch concat-only, XSS-safe, e serializável (sem backticks)

const { test } = require('node:test');
const assert = require('node:assert');

const D = require('./dispatch.js');

// ── parseMasterprompt ──────────────────────────────────────────────────────────────────
test('parse: front-matter canónico é preferido', () => {
  const txt = '---\ndispatch: { worktree: frugal-mp3, base: main, model: sonnet, mode: fresh }\n---\nWorktree ../outra from dev.\n';
  const p = D.parseMasterprompt(txt);
  assert.equal(p.source, 'front-matter');
  assert.equal(p.worktree, 'frugal-mp3'); // front-matter ganha ao regex
  assert.equal(p.base, 'main');
  assert.equal(p.model, 'sonnet');
  assert.equal(p.mode, 'fresh');
  assert.equal(p.needsInput, false);
});

test('parse: regex fallback (cabeçalho real MP5, incl. sufixo)', () => {
  const p = D.parseMasterprompt('# MP3 — algo\nWorktree ../frugal-mp3 from main (depois de MP3).\n');
  assert.equal(p.source, 'regex');
  assert.equal(p.worktree, 'frugal-mp3');
  assert.equal(p.base, 'main');
  assert.equal(p.model, null); // regex não declara modelo → honest null
  assert.equal(p.needsInput, false);
});

test('parse: base com barra (feat/x) é capturada', () => {
  const p = D.parseMasterprompt('Worktree ../wt from feat/live-edit.\n');
  assert.equal(p.worktree, 'wt');
  assert.equal(p.base, 'feat/live-edit');
});

test('parse: sem worktree/base → needsInput, nunca adivinha', () => {
  const p = D.parseMasterprompt('# só um título\nblá blá sem dispatch.');
  assert.equal(p.needsInput, true);
  assert.equal(p.worktree, null);
  assert.equal(p.base, null);
});

test('parse: front-matter parcial (só model) ainda pede input', () => {
  const p = D.parseMasterprompt('---\ndispatch: { model: opus }\n---\ntexto');
  assert.equal(p.needsInput, true);
  assert.equal(p.model, 'opus'); // preserva o que soube
});

test('parse: título é a primeira heading fora do front-matter', () => {
  const p = D.parseMasterprompt('---\ndispatch: { worktree: w, base: main }\n---\n# O Título\ncorpo');
  assert.equal(p.title, 'O Título');
});

// ── sanitizeWorktreeName ───────────────────────────────────────────────────────────────
test('sanitize: aceita nome válido igual', () => {
  const r = D.sanitizeWorktreeName('frugal-mp3.v2_1');
  assert.equal(r.ok, true);
  assert.equal(r.name, 'frugal-mp3.v2_1');
});

test('sanitize: rejeita traversal e separadores', () => {
  assert.equal(D.sanitizeWorktreeName('../etc').ok, false);
  assert.equal(D.sanitizeWorktreeName('a/b').ok, false);
  assert.equal(D.sanitizeWorktreeName('a\\b').ok, false);
  assert.equal(D.sanitizeWorktreeName('').ok, false);
  assert.equal(D.sanitizeWorktreeName('has space').ok, false);
  assert.equal(D.sanitizeWorktreeName('x'.repeat(65)).ok, false);
});

// ── encodeProjectDir + samePath ──────────────────────────────────────────────────────────
test('encodeProjectDir: [\\/:. espaço] → -', () => {
  assert.equal(D.encodeProjectDir('C:\\Users\\Paulo Loureiro\\frugal'), 'C--Users-Paulo-Loureiro-frugal');
});

test('samePath: case-insensitive, ignora barra final', () => {
  assert.equal(D.samePath('C:\\a\\b', 'c:/a/b/'), true);
  assert.equal(D.samePath('C:\\a\\b', 'C:\\a\\c'), false);
  assert.equal(D.samePath('', 'x'), false);
});

// ── isWorktreeOccupied ─────────────────────────────────────────────────────────────────
test('ocupação: .jsonl recente na worktree → ocupada', () => {
  const now = 1_000_000_000;
  const files = [
    { file: 'a.jsonl', cwd: 'C:\\wt\\target', mtime: now - 5 * 60 * 1000 },
    { file: 'b.jsonl', cwd: 'C:\\wt\\other', mtime: now - 1000 },
  ];
  const r = D.isWorktreeOccupied({ files, targetCwd: 'C:/wt/target', now });
  assert.equal(r.occupied, true);
  assert.equal(r.file, 'a.jsonl');
});

test('ocupação: .jsonl velho (>30min) → livre', () => {
  const now = 1_000_000_000;
  const files = [{ file: 'a.jsonl', cwd: 'C:\\wt\\target', mtime: now - 31 * 60 * 1000 }];
  assert.equal(D.isWorktreeOccupied({ files, targetCwd: 'C:\\wt\\target', now }).occupied, false);
});

test('ocupação: worktree sem sessões → livre', () => {
  assert.equal(D.isWorktreeOccupied({ files: [], targetCwd: 'C:\\wt\\x', now: 1 }).occupied, false);
});

// ── planLaunch ─────────────────────────────────────────────────────────────────────────
test('plano: ocupada → bloqueado (null)', () => {
  const p = D.planLaunch({ occupied: true, claudeOnPath: true });
  assert.equal(p.blocked, true);
  assert.equal(p.plan, null);
});

test('plano: claude no PATH → A', () => {
  assert.equal(D.planLaunch({ claudeOnPath: true }).plan, 'A');
});

test('plano: sem PATH mas com deep-link → B', () => {
  assert.equal(D.planLaunch({ claudeOnPath: false, deepLinkAvailable: true }).plan, 'B');
});

test('plano: sem PATH e sem deep-link → C', () => {
  assert.equal(D.planLaunch({ claudeOnPath: false, deepLinkAvailable: false }).plan, 'C');
});

// ── buildBootstrap / buildDeepLink ─────────────────────────────────────────────────────
test('bootstrap: constante, com o GUARD, sem conteúdo do MP', () => {
  const b = D.buildBootstrap();
  assert.match(b, /_dispatch\/MASTERPROMPT\.md/);
  assert.match(b, /classify\.js FROZEN/);
  assert.match(b, /selective add/);
  // é constante — não depende de nenhum argumento
  assert.equal(D.buildBootstrap(), b);
});

test('deep-link: cwd e q url-encoded', () => {
  const url = D.buildDeepLink('C:\\a b\\wt', 'olá & tchau');
  assert.match(url, /^claude-cli:\/\/open\?cwd=/);
  assert.match(url, /q=ol%C3%A1%20%26%20tchau/);
  assert.ok(url.indexOf(' ') < 0); // tudo encoded
});

// ── buildPreflight ─────────────────────────────────────────────────────────────────────
test('preflight: cartão honesto worktree nova + Plano A + aviso npm install', () => {
  const parsed = D.parseMasterprompt('---\ndispatch: { worktree: frugal-mp3, base: main, model: sonnet }\n---\n# MP3');
  const card = D.buildPreflight(parsed, { worktreeExists: false, occupied: false, claudeOnPath: true });
  assert.equal(card.plan, 'A');
  assert.equal(card.worktreeExists, false);
  assert.ok(card.warnings.some((w) => /npm install/.test(w)));
  assert.equal(card.modelLabel, 'sonnet');
  assert.equal(card.blocked, false);
});

test('preflight: ocupada → blocked', () => {
  const parsed = D.parseMasterprompt('---\ndispatch: { worktree: w, base: main }\n---\nx');
  const card = D.buildPreflight(parsed, { worktreeExists: true, occupied: true, occupiedAgeMs: 6 * 60000, claudeOnPath: true });
  assert.equal(card.blocked, true);
  assert.equal(card.occupiedAgeMin, 6);
});

test('preflight: worktree existente livre → reusa (aviso)', () => {
  const parsed = D.parseMasterprompt('---\ndispatch: { worktree: w, base: main }\n---\nx');
  const card = D.buildPreflight(parsed, { worktreeExists: true, occupied: false, claudeOnPath: true });
  assert.ok(card.warnings.some((w) => /REUSADA/.test(w)));
});

test('preflight: needsInput → sem plano, pergunta', () => {
  const card = D.buildPreflight(D.parseMasterprompt('sem nada'), { claudeOnPath: true });
  assert.equal(card.needsInput, true);
  assert.equal(card.plan, null);
});

test('preflight: nome inválido → blocked com razão', () => {
  const parsed = { worktree: '../x', base: 'main', model: null, mode: null, source: 'regex', needsInput: false, title: 't' };
  const card = D.buildPreflight(parsed, { claudeOnPath: true });
  assert.equal(card.blocked, true);
  assert.match(card.sanitizeReason, /traversal/);
});

// ── orchestrateLaunch — Plano A feliz: prefill SÓ após o .jsonl novo ────────────────────
function fakeTerminal() {
  const calls = [];
  return { calls, show() { calls.push(['show']); }, sendText(t, nl) { calls.push(['sendText', t, nl]); } };
}

test('launch A: cria worktree, grava MP, poll detecta sessão → prefill sem newline', async () => {
  let t = 0; // relógio virtual
  // uma sessão VELHA (>30min → não ocupa) já aponta para a worktree; entra no `before` para não
  // ser confundida com a nova. mtime bem no passado para o re-check de ocupação a considerar livre.
  let sessions = [{ file: 'old.jsonl', cwd: 'C:\\wt\\target', mtime: -10_000_000 }];
  const term = fakeTerminal();
  let added = null, wrote = false;
  const recs = [];
  const res = await D.orchestrateLaunch(
    { title: 'MP3', worktree: 'target', base: 'main', file: 'C:\\repo\\_handoff\\dispatch\\mp3.md', needsInput: false },
    {
      worktreeAbs: 'C:\\wt\\target', base: 'main', worktreeExists: false, claudeOnPath: true,
      listSessionCwds: () => sessions,
      worktreeAdd: async (n, b) => { added = [n, b]; return { ok: true }; },
      writeMasterprompt: async () => { wrote = true; return { ok: true }; },
      createTerminal: () => term,
      record: (e) => recs.push(e),
      status: () => {},
      now: () => t,
      sleep: async () => {
        t += 700;
        // à 2ª iteração aparece o .jsonl NOVO da sessão
        if (t >= 1400 && sessions.length === 1) sessions = sessions.concat([{ file: 'new.jsonl', cwd: 'C:\\wt\\target', mtime: t }]);
      },
      timeoutMs: 15000, pollMs: 700,
    }
  );
  assert.equal(res.ok, true);
  assert.equal(res.plan, 'A');
  assert.equal(res.prefilled, true);
  assert.deepEqual(added, ['target', 'main']);
  assert.equal(wrote, true);
  // primeiro sendText = 'claude' COM newline (undefined → newline); depois bootstrap SEM newline
  const sent = term.calls.filter((c) => c[0] === 'sendText');
  assert.equal(sent[0][1], 'claude');
  assert.equal(sent[1][1], D.buildBootstrap());
  assert.equal(sent[1][2], false); // prefill sem newline — o Enter é do Paulo
  assert.ok(recs.some((r) => r.prefilled === true));
});

test('launch A: timeout → NÃO digita o bootstrap (nunca às cegas)', async () => {
  let t = 0;
  const term = fakeTerminal();
  const res = await D.orchestrateLaunch(
    { title: 'x', worktree: 'target', base: 'main', file: 'f.md', needsInput: false },
    {
      worktreeAbs: 'C:\\wt\\target', base: 'main', worktreeExists: true, claudeOnPath: true,
      listSessionCwds: () => [], // a sessão NUNCA aparece
      worktreeAdd: async () => { throw new Error('não devia ser chamado (worktree existe)'); },
      writeMasterprompt: async () => ({ ok: true }),
      createTerminal: () => term,
      record: () => {}, status: () => {},
      now: () => t, sleep: async () => { t += 700; },
      timeoutMs: 3000, pollMs: 700,
    }
  );
  assert.equal(res.timedOut, true);
  assert.equal(res.prefilled, false);
  const sent = term.calls.filter((c) => c[0] === 'sendText');
  assert.equal(sent.length, 1);           // só 'claude'
  assert.equal(sent[0][1], 'claude');
  assert.ok(!sent.some((c) => c[1] === D.buildBootstrap())); // bootstrap NUNCA digitado
});

test('launch: ocupada no clique → bloqueia, não abre terminal', async () => {
  let created = false;
  const res = await D.orchestrateLaunch(
    { title: 'x', worktree: 'target', base: 'main', file: 'f.md', needsInput: false },
    {
      worktreeAbs: 'C:\\wt\\target', claudeOnPath: true,
      listSessionCwds: () => [{ file: 'live.jsonl', cwd: 'C:\\wt\\target', mtime: 500 }],
      createTerminal: () => { created = true; return fakeTerminal(); },
      worktreeAdd: async () => ({ ok: true }), writeMasterprompt: async () => ({ ok: true }),
      record: () => {}, status: () => {}, now: () => 1000, sleep: async () => {},
    }
  );
  assert.equal(res.blocked, true);
  assert.equal(created, false);
});

test('launch B: sem PATH mas deep-link → openExternal, sem terminal', async () => {
  let opened = null, created = false;
  const res = await D.orchestrateLaunch(
    { title: 'x', worktree: 'target', base: 'main', file: 'f.md', needsInput: false },
    {
      worktreeAbs: 'C:\\wt\\target', claudeOnPath: false, deepLinkAvailable: true,
      listSessionCwds: () => [],
      openExternal: (u) => { opened = u; },
      createTerminal: () => { created = true; return fakeTerminal(); },
      record: () => {}, status: () => {}, now: () => 1, sleep: async () => {},
    }
  );
  assert.equal(res.plan, 'B');
  assert.match(opened, /^claude-cli:\/\/open/);
  assert.equal(created, false);
});

test('launch C: sem PATH e sem deep-link → planC, nunca falha', async () => {
  let planC = false;
  const res = await D.orchestrateLaunch(
    { title: 'x', worktree: 'target', base: 'main', file: 'f.md', needsInput: false },
    {
      worktreeAbs: 'C:\\wt\\target', claudeOnPath: false, deepLinkAvailable: false,
      listSessionCwds: () => [], planC: async () => { planC = true; },
      record: () => {}, status: () => {}, now: () => 1, sleep: async () => {},
    }
  );
  assert.equal(res.plan, 'C');
  assert.equal(planC, true);
});

test('launch: nome inválido nunca lança', async () => {
  const res = await D.orchestrateLaunch(
    { title: 'x', worktree: '../evil', base: 'main', file: 'f.md', needsInput: false },
    { worktreeAbs: 'C:\\wt\\x', claudeOnPath: true, listSessionCwds: () => [], now: () => 1, sleep: async () => {}, record: () => {}, status: () => {} }
  );
  assert.equal(res.ok, false);
  assert.match(res.reason, /invalid-name/);
});

// ── renderDispatch ─────────────────────────────────────────────────────────────────────
test('render: vazio → empty state honesto', () => {
  const html = D.renderDispatch({ cards: [], claudeOnPath: true });
  assert.match(html, /_handoff\/dispatch\//);
  assert.match(html, /Importar de _handoff/);
});

test('render: aviso quando claude fora do PATH', () => {
  const html = D.renderDispatch({ cards: [], claudeOnPath: false });
  assert.match(html, /Plano C/);
});

test('render: cartão com plano + XSS-safe', () => {
  const card = D.buildPreflight(D.parseMasterprompt('---\ndispatch: { worktree: mp3, base: main, model: sonnet }\n---\n# <script>x'), { worktreeExists: false, claudeOnPath: true });
  card.file = 'C:\\repo\\d\\mp3.md';
  const html = D.renderDispatch({ cards: [card], claudeOnPath: true });
  assert.match(html, /Plano A/);
  assert.match(html, /data-dcmd="run"/);
  assert.ok(html.indexOf('<script>x') < 0);   // título escapado
  assert.match(html, /&lt;script&gt;/);
});

test('render: concat-only — sem backticks (serializável no template do getHtml)', () => {
  const src = D.renderDispatch.toString() + require('./dispatch.js').renderDispatch.toString();
  assert.ok(src.indexOf('`') < 0, 'renderDispatch não pode conter backticks');
});

test('render: needsInput → botão de indicar worktree', () => {
  const card = D.buildPreflight(D.parseMasterprompt('sem dispatch'), { claudeOnPath: true });
  card.file = 'f.md';
  const html = D.renderDispatch({ cards: [card] });
  assert.match(html, /data-dcmd="ask"/);
});

// ── buildRegistryEntry ─────────────────────────────────────────────────────────────────
test('registry: entrada honesta com status e prefilled', () => {
  const e = D.buildRegistryEntry({ now: 42, title: 't', worktree: 'w', base: 'main', plan: 'A', prefilled: true, promptFile: 'f.md' });
  assert.equal(e.ts, 42);
  assert.equal(e.status, 'dispatched');
  assert.equal(e.prefilled, true);
  assert.equal(e.worktree, 'w');
});
