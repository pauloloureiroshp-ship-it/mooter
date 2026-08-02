// user-override-guard.test.js — P0 "USER_OVERRIDE fantasma" (PRIME-0, 2026-08-01)
//
// BUG MEDIDO: o router emitiu `USER_OVERRIDE: honored — pinned qwen2.5:3b` sem o
// utilizador ter pinado modelo nenhum. Causa-raiz em classify.js (FROZEN):
// POSITIVE_INTENT_RE aceita as preposições NUAS `com|with|via` antes de
// qualquer chave de USER_OVERRIDE_MODELS, e `local`/`claude` são palavras
// correntes. O estrago vai nos dois sentidos — trabalho a sério despachado a um
// 3B, ou Opus queimado sem ninguém pedir.
//
// G10: o grupo do guard foi escrito e corrido VERMELHO antes de o módulo
// existir. O grupo 1 é a testemunha viva do defeito congelado.
//
// G4: um cross-check em motor diferente (codex) devolveu NO-GO à primeira
// versão do guard e apanhou 9 problemas. Cada contra-exemplo dele está aqui
// como caso de teste — é o que impede a mesma correcção-a-martelo de voltar.

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLASSIFY = path.join(__dirname, 'classify.js');
const { applyOverrideGuard, MODEL_KEYS, CONFIANCA_APOS_VETO } = require('./user-override-guard.js');

/** Corre o classificador congelado como o hook o corre (subprocesso). */
function classify(prompt) {
  const out = execFileSync(process.execPath, [CLASSIFY, prompt], { encoding: 'utf8', timeout: 10000 });
  return JSON.parse(out);
}

const guard = (d, p) => applyOverrideGuard(d, p, { t0Model: 'qwen3:30b' });

// ── Frases inocentes: nenhuma exprime escolha de motor ───────────────────────
const FANTASMAS = [
  // os originais medidos
  'compara a nuvem com local',
  'a fatia local vem por tokens, mede com local e com nuvem',
  'sessao fresca com claude code',
  'faz o diff com claude',
  'guarda com local storage',
  'usa o local storage do browser',
  'via local host',
  // contra-exemplos do G4 (codex) — falsos positivos que a v1 do guard deixava passar
  'Use a haiku structure for this poem',
  'Use a sonnet form for this poem',
  'usa o local da reuniao indicado no convite',
];

// ── Pins genuínos: o guard não pode matar nenhum ─────────────────────────────
const PINS_GENUINOS = [
  { prompt: 'usa o opus para isto', tier: 'T3' },
  { prompt: '@sonnet reve este ficheiro', tier: 'T2' },
  { prompt: 'model: haiku', tier: 'T1' },
  { prompt: 'forca ollama nesta tarefa', tier: 'T0' },
  { prompt: '@fable escreve o texto', tier: 'T5' },
  // FRONTEIRA: `rodar com` / `run with` / `run on` sao locucoes verbais de USO.
  { prompt: 'quero rodar com local', tier: 'T0' },
  // ── contra-exemplos do G4 (codex): a v1 do guard APAGAVA estes ─────────────
  { prompt: 'responde com sonnet', tier: 'T2' },
  { prompt: 'with sonnet review this file', tier: 'T2' },
  { prompt: 'run via gemini', tier: 'T0' },
  { prompt: 'forca-me o opus', tier: 'T3' },
  { prompt: 'use local only', tier: 'T0' },
  // duas ocorrencias: a 1a e substantivo, a 2a e pin. Basta uma valer.
  { prompt: 'usa o local storage e depois usa local para responder', tier: 'T0' },
];

// ── Grupo 1 · testemunha do defeito no ficheiro congelado ────────────────────
test('classify.js (FROZEN) produz o override fantasma — testemunha do defeito', () => {
  const afectadas = FANTASMAS.filter((p) => {
    const d = classify(p);
    return Boolean(d.user_override && d.user_override.honored);
  });
  assert.ok(afectadas.length > 0, 'se falhar, classify.js mudou e o guard pode ser reavaliado');
});

// ── Grupo 2 · o guard veta o fantasma ────────────────────────────────────────
test('o guard veta o fantasma e repoe o tier original', async (t) => {
  for (const prompt of FANTASMAS) {
    await t.test(`veta: "${prompt}"`, () => {
      const d = classify(prompt);
      const antes = d.user_override ? { ...d.user_override } : null;
      const r = guard(d, prompt);

      assert.equal(d.user_override, undefined, 'o bloco USER_OVERRIDE tem de desaparecer');
      if (antes && antes.honored && antes.original_tier) {
        assert.ok(r.vetoed, 'o guard tem de declarar o veto para telemetria');
        assert.equal(d.tier, antes.original_tier, `tier tinha de voltar a ${antes.original_tier}`);
      }
    });
  }
});

// ── Grupo 3 · pins genuínos sobrevivem (falso negativo é regressão) ──────────
test('o guard NAO mexe em pins genuinos', async (t) => {
  for (const { prompt, tier } of PINS_GENUINOS) {
    await t.test(`preserva: "${prompt}" -> ${tier}`, () => {
      const d = classify(prompt);
      assert.ok(d.user_override && d.user_override.honored,
        'pre-condicao: o classificador tem de reconhecer este pin');
      const r = guard(d, prompt);
      assert.equal(r.vetoed, false, 'pin explicito nao pode ser vetado');
      assert.ok(d.user_override, 'o bloco USER_OVERRIDE tem de sobreviver');
      assert.equal(d.tier, tier, `o tier pinado tem de continuar ${tier}`);
    });
  }
});

// ── Grupo 4 · cobertura de TODAS as chaves (o espelho não pode divergir) ─────
// G4 nº7: os pins genuinos so cobriam 5 das 13 chaves. Um alias novo em
// classify.js passava sem ninguem dar por isso.
test('todas as chaves de MODEL_KEYS tem um pin explicito honrado', async (t) => {
  for (const key of MODEL_KEYS) {
    await t.test(`@${key}`, () => {
      const prompt = `@${key} trata disto`;
      const d = classify(prompt);
      assert.ok(d.user_override, `classify nao reconheceu @${key} — espelho divergiu`);
      const tierPinado = d.tier;
      const r = guard(d, prompt);
      assert.equal(r.vetoed, false, `@${key} e explicito, nao pode ser vetado`);
      assert.equal(d.tier, tierPinado, 'o tier nao pode mudar num pin explicito');
    });
  }
});

// ── Grupo 5 · a confiança inflada tem de baixar (G4 nº4, crítico) ────────────
// classify poe confidence a 0.99 POR CAUSA do override. Deixa-la la depois do
// veto nao e neutro: o arbiter exige < 0.75 para correr e a Option A fica
// elegivel — o numero inflado MUDA a execucao.
test('vetar repoe a confianca, nao so o tier', () => {
  const prompt = 'compara a nuvem com local';
  const d = classify(prompt);
  assert.ok(d.user_override && d.user_override.honored, 'pre-condicao');
  assert.equal(d.confidence, 0.99, 'classify inflaciona a confianca por causa do override');

  const r = guard(d, prompt);
  assert.ok(r.vetoed);
  assert.equal(d.confidence, CONFIANCA_APOS_VETO, 'a confianca tem de deixar de dizer 0.99');
  assert.ok(d.confidence < 0.75, 'tem de ficar abaixo do corte do arbiter');
  assert.equal(d.override_vetoed.confidence_antes, 0.99, 'o valor original fica declarado');
});

// ── Grupo 5b · o veto tem de repor TAMBÉM os providers (G4 de fecho) ────────
// router-execute.js §6.1 começa a cadeia de despacho por
// `classification.suggested_providers` VERBATIM. Repor tier/model/backend e
// deixar a lista velha corrigia o texto do hint e continuava a despachar para o
// motor errado — o P0 sobrevivia por outra porta.
test('vetar repoe suggested_providers, nao so tier/model/backend', async (t) => {
  const CASOS = [
    { prompt: 'faz o diff com claude', providers: ['ollama'] },      // T3/opus -> T0
    { prompt: 'sessao fresca com claude code', providers: ['ollama'] },
    { prompt: 'compara a nuvem com local', providers: ['ollama'] },
  ];
  for (const { prompt } of CASOS) {
    await t.test(`"${prompt}"`, () => {
      const d = classify(prompt);
      if (!(d.user_override && d.user_override.honored)) return; // nada a vetar
      const r = guard(d, prompt);
      assert.ok(r.vetoed);
      const esperado = { T0: ['ollama'], T1: ['haiku'], T2: ['sonnet'], T3: ['opus'], T5: ['fable'] }[d.tier];
      assert.deepEqual(d.suggested_providers, esperado,
        `tier ${d.tier} com providers ${JSON.stringify(d.suggested_providers)} — o despacho ia para o motor errado`);
    });
  }
});

// ── Grupo 6 · inócuo quando não há override ─────────────────────────────────
test('o guard e inocuo quando nao ha override nenhum', () => {
  const prompt = 'explica este erro: TypeError x is not a function';
  const d = classify(prompt);
  const tierAntes = d.tier;
  const confAntes = d.confidence;
  const r = guard(d, prompt);
  assert.equal(r.vetoed, false);
  assert.equal(d.tier, tierAntes);
  assert.equal(d.confidence, confAntes);
});
