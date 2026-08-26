// Wave 2.6 Day 2 — 2-line rich statusline + truncate-safe 1-line fallback.
//
// node:test + assert (matches statusline-multi.test.js). The repo has no jest
// snapshot harness, so these are structural assertions on the rendered frame
// rather than serialized snapshots.

const { test, after } = require('node:test');
const assert   = require('node:assert/strict');
const os       = require('node:os');
const fs       = require('node:fs');
const path     = require('node:path');

const { render, renderTwoLine, truncateChip } = require('./statusline-multi.js');

// Wave 55 (Phase H) — hermetic HOME: an empty temp dir with no
// .mooter/preferences.json, so a dev's pinned statusline_mode/layout can't leak
// in and force line-3, breaking the adaptive-layout assertions below. render()
// reads its mode/layout pins from this HOME instead of the real ~/.mooter.
const CLEAN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sl-two-line-'));
after(() => { try { fs.rmSync(CLEAN_HOME, { recursive: true, force: true }); } catch { /* best-effort */ } });

// A healthy, fully-populated context so line 2 carries every operational chip.
const healthyState = {
  counts: { T0: 6, T1: 2, T2: 2, T3: 0, codex: 0 }, total: 10,
  last:    { tier: 'T2', confidence: 0.84, suggested_providers: ['sonnet'] },
  recent:  Array(10).fill({ tier: 'T2', confidence: 0.82 }),
  anthRem: 100, codexRem: 90, codexLeft: 140,
  savedUsd: 0.27, savedPct: 89, todayCost: 0.04,
  ctxPercent: 23, lastTurnCost: 0.012, alltimeCost: 4.21,
  lastPack: { pack_id: 'diagram-systems' },
  adapter: { status: 'idle' },
  dataMissing: false,
  // Wave 21 (C4) — the 🏠 chip is token_tracker-driven; give the fixture a session
  // so the chip-asserting test below can seed a real token cache for it.
  sessionId: 'w21-twoline-fixture',
};

// Wave 21 (C4) — seed a token cache matching the fixture's 6/10 local-by-calls so
// renderTwoLine's single-source 🏠 chip renders the same "6/10 calls (60%)" it used
// to derive from ctx.counts. Returns a cleanup fn.
function seedHomeChipTokens() {
  const tt = require('./token_tracker.js');
  const sid = healthyState.sessionId;
  for (let i = 0; i < 6; i++) tt.trackCall('T0', 'qwen3:30b', 100, 50, { sessionId: sid });
  for (let i = 0; i < 2; i++) tt.trackCall('T1', 'haiku', 100, 50, { sessionId: sid });
  for (let i = 0; i < 2; i++) tt.trackCall('T2', 'sonnet', 100, 50, { sessionId: sid });
  return () => { try { require('fs').rmSync(tt.cachePath(sid), { force: true }); } catch { /* best-effort */ } };
}

function withColumns(cols, fn) {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = String(cols);
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev;
  }
}

test('render: 2-line layout when COLUMNS >= 120', () => {
  const cleanup = seedHomeChipTokens();
  let out, lines;
  try {
    out = withColumns(140, () => render(healthyState, { home: CLEAN_HOME }));
    lines = out.split('\n');
  assert.equal(lines.length, 2, 'wide terminal renders exactly two lines');
  assert.match(lines[0], /🐮/, 'line 1 carries the mood glyph');
  // PR-I line-1 qualifiers + de-branding
  assert.match(lines[0], /saved \$0\.27 all-time·local \(89% vs all-Opus\)/, 'B3: saved carries all-time·local + baseline qualifiers');
  assert.doesNotMatch(lines[0], /mooter saved/, 'PR-I: redundant "mooter" word dropped (🐮 already brands)');
  assert.match(lines[0], /T2 sonnet · conf 0\.84/, 'PR-I: tier shows model family + conf qualifier');
  // PR-I sparkline sits between the saved outcome and the tier label
  assert.match(lines[0], /last 10 {2}· {2}T2 sonnet/, 'PR-I: tier label trails the sparkline');
  // line 2 operational chips
  assert.match(lines[1], /^🏠 6\/10 calls \(60%\)/, 'Wave 20 20.D: line 2 leads with N/M calls + local %');
  assert.doesNotMatch(lines[1], /local ×6/, 'PR-I: old ×N local count is gone');
  assert.match(lines[1], /ctx \S+ 23%/, 'line 2 shows ctx as a visual bar (W19 ▰▱ evolution bar)');
  assert.match(lines[1], /☁ Claude Max \[▓+\] 100% left · 5h reset/, 'W48 1.8: quota carries usage bar + "left" label');
  assert.doesNotMatch(lines[1], /\b100% 5h\b/, 'PR-I: bare "100% 5h" replaced by labelled quota');
  assert.match(lines[1], /🧬 baseline/, 'W19 19.B-4: adapter chip evolved to 🧬 baseline');
  assert.doesNotMatch(lines[1], /forge install <gguf>/, 'PR-I: verbose <gguf> CTA trimmed');
  assert.match(lines[1], /pack: diagram-systems/, 'line 2 shows pack');
  // VRAM, when the host exposes a GPU chip, must read as a % — never the old "GB / GB" pair
  if (/🎮/.test(lines[1])) {
    assert.match(lines[1], /🎮[^·]*\d+% VRAM/, 'PR-I: VRAM shown as % when a GPU is present');
    assert.doesNotMatch(lines[1], /GB \/ /, 'PR-I: raw GB pair removed from the chip');
  }
  } finally {
    cleanup();
  }
});

test('render: falls back to single line when COLUMNS < 120', () => {
  const out = withColumns(100, () => render(healthyState, { home: CLEAN_HOME }));
  assert.ok(!out.includes('\n'), 'narrow terminal renders a single line');
  assert.match(out, /🐮/);
  assert.match(out, /│/, 'single line keeps the headline │ proof separator');
  // PR-I: the de-branded "today" headline and the tier badge survive on the narrow line
  assert.match(out, /saved \$0\.27 all-time/, 'B3: narrow line carries the all-time qualifier');
  assert.doesNotMatch(out, /mooter saved/, 'PR-I: narrow line drops the redundant "mooter" word');
  assert.match(out, /T2 sonnet · conf 0\.84/, 'PR-I: narrow line keeps the tier badge (folded back onto the headline)');
});

test('render: missing COLUMNS assumes narrow (1-line)', () => {
  const prev = process.env.COLUMNS;
  delete process.env.COLUMNS;
  try {
    const out = render(healthyState, { home: CLEAN_HOME });
    assert.ok(!out.includes('\n'), 'no COLUMNS → conservative single line');
  } finally {
    if (prev !== undefined) process.env.COLUMNS = prev;
  }
});

test('renderTwoLine: oversized chip is truncated, structure preserved', () => {
  const longPack = { ...healthyState, lastPack: { pack_id: 'very-long-pack-name-that-exceeds-thirty-characters' } };
  // HOME isolado: estes dois testes falam do CONTEUDO da linha 2 (truncagem e
  // chips ausentes) e nao de quantas linhas o dono opta por ver. Sem o `home`,
  // liam o `~/.mooter/preferences.json` real e um dono com `statusline_line3`
  // ligado via-os a afirmar 2 linhas contra 3 — falha na maquina dele, verde no CI.
  const out = renderTwoLine(longPack, { home: CLEAN_HOME });
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!lines[1].includes('very-long-pack-name-that-exceeds-thirty'), 'full oversized pack id is cut');
  assert.match(lines[1], /pack: very-long-pack-name-tha…/, 'truncated chip keeps a recognizable prefix + ellipsis');
});

test('renderTwoLine: drops absent chips instead of printing empty fields', () => {
  const sparse = {
    counts: { T0: 0, T1: 0, T2: 0, T3: 0 }, total: 3,
    last: { tier: 'T2', confidence: 0.7, suggested_providers: ['sonnet'] },
    recent: [{ tier: 'T2', confidence: 0.7 }],
    anthRem: 80, savedUsd: 0.1, savedPct: 50, todayCost: 0.02, dataMissing: false,
  };
  const out = renderTwoLine(sparse, { home: CLEAN_HOME });
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!lines[1].includes('🏠 local ×0'), 'zero local count chip is omitted');
  assert.ok(!lines[1].includes('ctx'), 'absent ctx chip is omitted');
  assert.ok(!lines[1].includes('pack:'), 'absent pack chip is omitted');
  assert.ok(!/· *·/.test(lines[1]), 'no empty chip slots (double separators)');
});

test('renderTwoLine: setup state degrades to the single line', () => {
  const setup = { counts: { T0: 0, T1: 0, T2: 0, T3: 0 }, total: 0, last: null, recent: [], dataMissing: true };
  const out = renderTwoLine(setup);
  assert.ok(!out.includes('\n'), 'fresh install never prints a half-empty second line');
  assert.match(out, /🛠/, 'setup glyph');
});

test('truncateChip: leaves short strings untouched, cuts long ones to max', () => {
  assert.equal(truncateChip('short', 30), 'short');
  const cut = truncateChip('x'.repeat(40), 30);
  assert.equal(cut.length, 30);
  assert.ok(cut.endsWith('…'));
});

// ── HOME injectado: a regressao que faltava ─────────────────────────────────
//
// Medido 2026-08-25, `mac/sistema-sync-2026-08-25`: a suite do tools/router
// falhava 3 testes na maquina do dono e passava no CI. Nao era flakiness — era
// `renderResolved` a chamar `renderTwoLine(ctx)` SEM `opts`, portanto o `home`
// injectado morria ali e `buildLine3` caia no `os.homedir()` real. O dono tem
// `~/.mooter/preferences.json` = {"statusline_line3":true} (esta no CLAUDE.md,
// e uma preferencia suportada), logo o layout largo dava 3 linhas onde o teste
// descreve 2.
//
// O comentario da Wave 55 (statusline-multi.js) ja PROMETIA esta hermeticidade;
// o que faltava era o codigo a cumpri-la. Estes dois testes provam-na nos dois
// sentidos — sem eles, alguem volta a tirar o `opts` e so descobre na maquina
// de quem tem a preferencia ligada.
test('render: HOME injectado sem preferencias → 2 linhas (nao le o ~/.mooter real)', () => {
  const cleanup = seedHomeChipTokens();
  try {
    const out = withColumns(140, () => render(healthyState, { home: CLEAN_HOME }));
    assert.equal(out.split('\n').length, 2,
      'um HOME vazio nao pode herdar o statusline_line3 da maquina que corre a suite');
  } finally { cleanup(); }
});

test('render: HOME injectado COM statusline_line3 → 3 linhas (o opts.home e mesmo lido)', () => {
  const homeLine3 = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-sl-line3-'));
  fs.mkdirSync(path.join(homeLine3, '.mooter'), { recursive: true });
  fs.writeFileSync(path.join(homeLine3, '.mooter', 'preferences.json'),
    JSON.stringify({ statusline_line3: true }));
  const cleanup = seedHomeChipTokens();
  try {
    const out = withColumns(140, () => render(healthyState, { home: homeLine3 }));
    // A afirmacao que importa e o PAR: se este devolvesse 2, o teste anterior
    // passaria por o `home` ser ignorado em vez de por ser respeitado.
    assert.equal(out.split('\n').length, 3,
      'a preferencia do HOME injectado tem de valer — senao o isolamento e so silencio');
  } finally {
    cleanup();
    try { fs.rmSync(homeLine3, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});
