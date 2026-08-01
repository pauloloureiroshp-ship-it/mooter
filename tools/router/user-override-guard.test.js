// user-override-guard.test.js — P0 "USER_OVERRIDE fantasma" (PRIME-0, 2026-08-01)
//
// BUG MEDIDO: o router emitiu `USER_OVERRIDE: honored — pinned qwen2.5:3b` sem o
// utilizador ter pinado modelo nenhum. Causa-raiz encontrada em classify.js:
//
//   POSITIVE_INTENT_RE = /\b(?:usa|use|usar|usando|com|with|via|...)\s+(?:o|a|the|um|uma)?\s*(KEYS)\b/i
//   USER_OVERRIDE_MODELS tem as chaves `local`, `claude`, `qwen`, `ollama`, `gpt`, `gemini`.
//
// As preposições NUAS `com` / `with` / `via` combinadas com `local` e `claude` —
// duas das palavras mais frequentes em PT-BR e neste repo — fazem uma frase
// perfeitamente normal virar um pin de modelo. O estrago vai nos DOIS sentidos:
//   "compara a nuvem com local"     → T0, pinned qwen2.5:3b   (trabalho a sério num 3B)
//   "sessao fresca com claude code" → T3, pinned opus         (queima dinheiro)
//
// classify.js é FROZEN (sha256 CI-enforced 427d8c0b…), por isso o fix NÃO pode
// viver lá. Vive em user-override-guard.js, aplicado por inject_context.js logo
// a seguir ao classify.
//
// G10 (critério de refutação primeiro): o grupo 2 deste ficheiro foi escrito e
// corrido VERMELHO antes de o guard existir. O grupo 1 é a testemunha viva do
// defeito congelado — se algum dia ficar verde sozinho, o classify.js mudou.

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLASSIFY = path.join(__dirname, 'classify.js');

/** Corre o classificador congelado como o hook o corre (subprocesso). */
function classify(prompt) {
  const out = execFileSync(process.execPath, [CLASSIFY, prompt], {
    encoding: 'utf8',
    timeout: 10000,
  });
  return JSON.parse(out);
}

// Frases normais que NUNCA deviam pinar modelo. Cada uma é português/inglês
// corrente — nenhuma exprime intenção de escolher motor.
const FRASES_INOCENTES = [
  'compara a nuvem com local',
  'a fatia local vem por tokens, mede com local e com nuvem',
  'sessao fresca com claude code',
  'faz o diff com claude',
  'guarda com local storage',
  'usa o local storage do browser',
  'via local host',
  'trabalha com gemini na pasta',
];

// Pins genuínos — o guard não pode matar estes (falso negativo é regressão).
const PINS_GENUINOS = [
  { prompt: 'usa o opus para isto', tier: 'T3' },
  { prompt: '@sonnet revê este ficheiro', tier: 'T2' },
  { prompt: 'model: haiku', tier: 'T1' },
  { prompt: 'força ollama nesta tarefa', tier: 'T0' },
  { prompt: '@fable escreve o texto', tier: 'T5' },
  // FRONTEIRA (decisão consciente, candidata a G4): `rodar com` / `run with` /
  // `run on` são locuções verbais de USO — contam como pin. O P0 é a preposição
  // NUA (`com` / `with` / `via`) sozinha antes da chave, não estas.
  // "rodar com local storage" continua vetado pelo COMMON_NOUN_FOLLOW.
  { prompt: 'quero rodar com local', tier: 'T0' },
];

// ── Grupo 1 · testemunha do defeito no ficheiro congelado ────────────────────
// Documenta o bug tal como ele existe HOJE em classify.js. Não é o fix.
test('classify.js (FROZEN) produz o override fantasma — testemunha do defeito', () => {
  const afectadas = FRASES_INOCENTES.filter((p) => {
    const d = classify(p);
    return Boolean(d.user_override && d.user_override.honored);
  });
  assert.ok(
    afectadas.length > 0,
    'se isto falhar, classify.js deixou de ter o bug e o guard pode ser reavaliado',
  );
});

// ── Grupo 2 · o guard (o fix) ────────────────────────────────────────────────
// ESCRITO E CORRIDO VERMELHO ANTES DE user-override-guard.js EXISTIR.
test('o guard veta o override fantasma e repõe o tier original', async (t) => {
  let applyOverrideGuard;
  try {
    ({ applyOverrideGuard } = require('./user-override-guard.js'));
  } catch (e) {
    assert.fail(`user-override-guard.js não existe / não carrega: ${e.message}`);
  }

  for (const prompt of FRASES_INOCENTES) {
    await t.test(`veta: "${prompt}"`, () => {
      const d = classify(prompt);
      const antes = d.user_override ? { ...d.user_override } : null;
      const originalTier = antes && antes.original_tier;

      const r = applyOverrideGuard(d, prompt, { t0Model: 'qwen3:30b' });

      assert.equal(
        d.user_override,
        undefined,
        'o bloco USER_OVERRIDE tem de desaparecer da decisão',
      );
      if (antes && antes.honored && originalTier) {
        assert.equal(
          d.tier,
          originalTier,
          `o tier tem de voltar a ${originalTier} (estava pinado em ${antes.requested})`,
        );
        assert.ok(r.vetoed, 'o guard tem de declarar o veto para telemetria');
      }
    });
  }
});

test('o guard NÃO mexe em pins genuínos', async (t) => {
  const { applyOverrideGuard } = require('./user-override-guard.js');

  for (const { prompt, tier } of PINS_GENUINOS) {
    await t.test(`preserva: "${prompt}" → ${tier}`, () => {
      const d = classify(prompt);
      assert.ok(
        d.user_override && d.user_override.honored,
        'pré-condição: o classificador tem de reconhecer este pin',
      );
      const r = applyOverrideGuard(d, prompt, { t0Model: 'qwen3:30b' });

      assert.equal(r.vetoed, false, 'pin explícito não pode ser vetado');
      assert.ok(d.user_override, 'o bloco USER_OVERRIDE tem de sobreviver');
      assert.equal(d.tier, tier, `o tier pinado tem de continuar ${tier}`);
    });
  }
});

test('o guard é inócuo quando não há override nenhum', () => {
  const { applyOverrideGuard } = require('./user-override-guard.js');
  const d = classify('explica este erro: TypeError x is not a function');
  const tierAntes = d.tier;
  const r = applyOverrideGuard(d, 'explica este erro: TypeError x is not a function', {
    t0Model: 'qwen3:30b',
  });
  assert.equal(r.vetoed, false);
  assert.equal(d.tier, tierAntes);
});
