// TESTES DE MORDIDA — o recibo tem de recusar-se a inventar.
//
// Os dois defeitos que este ficheiro existe para impedir, ambos já cometidos
// neste repositório:
//
//  1 · ATRIBUIR POR CO-RESIDÊNCIA. A primeira versão do plano juntava tokens ao
//      `decisions.log` por `session_id`. Medido: 387 prompts → 9.692 chamadas,
//      25 por prompt. É o defeito que matou o `0%` deste projecto («o
//      denominador eram chamadas Bash, não prompts (26 por prompt)»).
//
//  2 · SOMAR O QUE NÃO SE SABE. Um modelo fora da tabela de preços tem de
//      aparecer como buraco, não diluído num total que parece completo.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const os       = require('node:os');
const path     = require('node:path');

const R = require('./recibo.js');

/** Um transcript sintético com a forma REAL do Claude Code. */
function escreverTranscript(dir, nome, registos) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${nome}.jsonl`);
  fs.writeFileSync(f, registos.map(r => JSON.stringify(r)).join('\n') + '\n');
  return f;
}

const usage = (o = {}) => ({
  input_tokens: o.i || 0,
  output_tokens: o.o || 0,
  cache_read_input_tokens: o.cr || 0,
  cache_creation_input_tokens: o.cw || 0,
  ...(o.cc ? { cache_creation: o.cc } : {}),
});

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'moo-rec-')); }
function limpar(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }

// ── A atribuição ────────────────────────────────────────────────────────────

test('MORDIDA · um tool_result NÃO é um turno humano', () => {
  // Se o fosse, cada prompt partia-se em dezenas de turnos e o recibo diria que
  // um prompt custou um trigésimo do que custou. É a linha que faz a diferença
  // entre 24 chamadas por turno e 1.
  assert.equal(R.ehTurnoHumano({
    type: 'user', message: { content: 'muda a cor do botão' },
  }), true);

  assert.equal(R.ehTurnoHumano({
    type: 'user',
    message: { content: [{ type: 'tool_result', content: 'ok' }] },
  }), false, 'um tool_result foi contado como prompt do utilizador');

  assert.equal(R.ehTurnoHumano({
    type: 'user', toolUseResult: { stdout: '' }, message: { content: 'x' },
  }), false, 'um registo com toolUseResult é resultado de ferramenta, não turno');

  assert.equal(R.ehTurnoHumano({ type: 'assistant', message: { content: 'olá' } }), false);
});

test('MORDIDA · toda a cadeia sobe ao turno humano — zero órfãs', () => {
  const d = tmp();
  try {
    // Um turno humano → assistant → tool_result → assistant → tool_result →
    // assistant. Três chamadas, UM turno. É a forma real de um loop de
    // ferramentas no Claude Code.
    const f = escreverTranscript(d, 'sessao-a', [
      { uuid: 'u1', parentUuid: null, type: 'user',      timestamp: '2026-08-28T10:00:00Z', message: { content: 'faz uma coisa' } },
      { uuid: 'a1', parentUuid: 'u1', type: 'assistant', timestamp: '2026-08-28T10:00:01Z', message: { model: 'claude-opus-5', usage: usage({ o: 100 }) } },
      { uuid: 't1', parentUuid: 'a1', type: 'user',      timestamp: '2026-08-28T10:00:02Z', toolUseResult: {}, message: { content: [{ type: 'tool_result' }] } },
      { uuid: 'a2', parentUuid: 't1', type: 'assistant', timestamp: '2026-08-28T10:00:03Z', message: { model: 'claude-opus-5', usage: usage({ o: 200 }) } },
      { uuid: 't2', parentUuid: 'a2', type: 'user',      timestamp: '2026-08-28T10:00:04Z', toolUseResult: {}, message: { content: [{ type: 'tool_result' }] } },
      { uuid: 'a3', parentUuid: 't2', type: 'assistant', timestamp: '2026-08-28T10:00:05Z', message: { model: 'claude-opus-5', usage: usage({ o: 300 }) } },
    ]);
    const { turnos, orfas } = R.lerTranscript(f);
    assert.equal(orfas, 0, 'nenhuma chamada pode ficar sem turno');
    assert.equal(turnos.length, 1, 'três chamadas de um só prompt são UM turno');
    assert.equal(turnos[0].chamadas, 3);
    assert.equal(turnos[0].tokens.output, 600);
  } finally { limpar(d); }
});

test('MORDIDA · dois prompts humanos são dois turnos, não um', () => {
  const d = tmp();
  try {
    const f = escreverTranscript(d, 'sessao-b', [
      { uuid: 'u1', parentUuid: null, type: 'user',      timestamp: '2026-08-28T10:00:00Z', message: { content: 'primeiro' } },
      { uuid: 'a1', parentUuid: 'u1', type: 'assistant', timestamp: '2026-08-28T10:00:01Z', message: { model: 'claude-opus-5', usage: usage({ o: 100 }) } },
      { uuid: 'u2', parentUuid: 'a1', type: 'user',      timestamp: '2026-08-28T10:01:00Z', message: { content: 'segundo' } },
      { uuid: 'a2', parentUuid: 'u2', type: 'assistant', timestamp: '2026-08-28T10:01:01Z', message: { model: 'claude-opus-5', usage: usage({ o: 900 }) } },
    ]);
    const { turnos } = R.lerTranscript(f);
    assert.equal(turnos.length, 2);
    assert.equal(turnos[0].tokens.output, 100);
    assert.equal(turnos[1].tokens.output, 900, 'o custo do 2.º prompt caiu no 1.º');
  } finally { limpar(d); }
});

// ── O preço ─────────────────────────────────────────────────────────────────

test('o cache é contado, e com o multiplicador de cada tipo', () => {
  // Sem isto o recibo ignorava 7,5 mil milhões de tokens — o maior condutor de
  // custo que aqui existe.
  const c = R.custoDe('claude-opus-5', usage({
    i: 1_000_000, o: 0, cr: 1_000_000,
    cc: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
  }));
  assert.ok(c, 'opus-5 tem de estar na tabela');
  const inputM = 5;                              // $/M de input, de pricing.js
  assert.equal(Math.round(c.input * 100) / 100,     inputM);
  assert.equal(Math.round(c.cacheLer * 100) / 100,  inputM * 0.1);
  // 1M a 1,25x + 1M a 2,0x
  assert.equal(Math.round(c.cacheEscr * 100) / 100, inputM * 1.25 + inputM * 2.0);
});

test('MORDIDA · um modelo sem preço devolve null — nunca zero', () => {
  // Somar zero em silêncio faria o recibo parecer mais barato do que é, que é
  // a forma mais fácil de mentir com um total.
  assert.equal(R.custoDe('modelo-que-nao-existe', usage({ o: 1000 })), null);
  assert.equal(R.custoDe(null, usage({ o: 1000 })), null);
  assert.equal(R.custoDe('claude-opus-5', null), null);
});

test('MORDIDA · uma chamada sem preço é CONTADA como buraco, e não somada', () => {
  const d = tmp();
  try {
    const f = escreverTranscript(d, 'sessao-c', [
      { uuid: 'u1', parentUuid: null, type: 'user',      timestamp: '2026-08-28T10:00:00Z', message: { content: 'x' } },
      { uuid: 'a1', parentUuid: 'u1', type: 'assistant', timestamp: '2026-08-28T10:00:01Z', message: { model: 'claude-opus-5', usage: usage({ o: 1_000_000 }) } },
      { uuid: 'a2', parentUuid: 'a1', type: 'assistant', timestamp: '2026-08-28T10:00:02Z', message: { model: 'motor-desconhecido', usage: usage({ o: 9_999_999 }) } },
    ]);
    const { turnos } = R.lerTranscript(f);
    assert.equal(turnos[0].chamadas, 2, 'a chamada sem preço tem de ser contada');
    assert.equal(turnos[0].semPreco, 1, 'e tem de aparecer como buraco declarado');
    // O custo é só o da chamada que se sabe precificar: 1M de output opus = $25.
    assert.equal(Math.round(turnos[0].custo * 100) / 100, 25);
  } finally { limpar(d); }
});

// ── A junção com a recomendação ─────────────────────────────────────────────

test('MORDIDA · uma decisão POSTERIOR ao turno nunca lhe é atribuída', () => {
  // O hook classifica ANTES do modelo ver o prompt. Uma decisão que chega
  // depois pertence ao turno seguinte; casá-la para trás inventaria uma
  // recomendação que nunca existiu para aquele trabalho.
  const t = Date.parse('2026-08-28T10:00:00Z');
  const [r] = R.casar(
    [{ ts: t, custo: 1 }],
    [{ ts: t + 1000, tier: 'T0' }],   // 1s DEPOIS do turno
  );
  assert.equal(r.decisao, null);
});

test('MORDIDA · fora da janela não casa, e diz null em vez de adivinhar', () => {
  const t = Date.parse('2026-08-28T10:00:00Z');
  const dentro = R.casar([{ ts: t }], [{ ts: t - (R.JANELA_MS - 1000), tier: 'T0' }])[0];
  assert.equal(dentro.decisao.tier, 'T0');

  const fora = R.casar([{ ts: t }], [{ ts: t - (R.JANELA_MS + 1000), tier: 'T0' }])[0];
  assert.equal(fora.decisao, null, 'uma decisão velha demais foi casada à força');
});

test('entre duas decisões válidas, ganha a mais recente antes do turno', () => {
  const t = Date.parse('2026-08-28T10:00:00Z');
  const [r] = R.casar([{ ts: t }], [
    { ts: t - 20000, tier: 'T3' },
    { ts: t - 2000,  tier: 'T0' },
  ]);
  assert.equal(r.decisao.tier, 'T0');
});

// ── O recibo inteiro ────────────────────────────────────────────────────────

test('o recibo é somente-leitura e sobrevive a uma árvore vazia', () => {
  const d = tmp();
  try {
    const r = R.recibo({ home: d });
    assert.equal(r.transcriptsTotais, 0);
    assert.equal(r.turnos, 0);
    assert.equal(r.custoTotal, 0);
    // E imprime sem lançar, dizendo n/d onde não sabe.
    const txt = R.imprimir(r);
    assert.match(txt, /n\/d/);
    assert.doesNotMatch(txt, /NaN|undefined/);
  } finally { limpar(d); }
});

test('MORDIDA · o impresso NUNCA usa a palavra "custo" para o preço de tabela', () => {
  // A primeira versão dizia «CUSTO MEDIDO $5701». É verdade que os tokens
  // valem isso a preço público, e seria uma mentira grave publicá-lo como
  // despesa: correram dentro de uma subscrição de valor fixo. A regra não é
  // «não exagerar a nosso favor» — é não afirmar o que não se mediu, em
  // direcção nenhuma.
  const d = tmp();
  try {
    const f = escreverTranscript(path.join(d, '.claude', 'projects', 'p'), 'sessao-d', [
      { uuid: 'u1', parentUuid: null, type: 'user',      timestamp: '2026-08-28T10:00:00Z', message: { content: 'x' } },
      { uuid: 'a1', parentUuid: 'u1', type: 'assistant', timestamp: '2026-08-28T10:00:01Z', message: { model: 'claude-opus-5', usage: usage({ o: 1_000_000 }) } },
    ]);
    assert.ok(fs.existsSync(f));
    const txt = R.imprimir(R.recibo({ home: d }));
    assert.match(txt, /EQUIVALENTE A PREÇO DE TABELA/);
    assert.doesNotMatch(txt, /CUSTO MEDIDO/);
    assert.match(txt, /NÃO é despesa/);
    // E em lado nenhum uma percentagem de poupança.
    assert.doesNotMatch(txt, /\d+%\s*(saved|poupan|savings)/i);
  } finally { limpar(d); }
});
