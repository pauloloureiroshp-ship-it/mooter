'use strict';
/**
 * gpu-probe.test.js — o probe nao tinha testes nenhuns ate 2026-08-29.
 * Foi assim que um tecto de 9216 MB cravado para TODO o Apple sobreviveu:
 * nada o contradizia, e o proprio probe devolvia `vramMB: null`, portanto
 * nao havia numero com que o comparar.
 */
const test = require('node:test');
const assert = require('node:assert');
const { buildHwCapability, classifyHwTier, MODEL_VRAM_REQ } = require('./gpu-probe');

const apple = (vramMB) => ({ vendor: 'apple', name_short: 'Apple M4 Pro', vramMB, platform: 'darwin' });

test('o tecto de 9216 MB para Apple morreu — a memoria medida e que manda', () => {
  // MEDIDO 2026-08-29 num M4 Pro de 24 GB: um modelo com 16,0 GB carregados
  // correu a 100% GPU. Com o tecto antigo (`req <= 9216`) tudo acima de 9 GB
  // era declarado impossivel. Este teste morre se o tecto voltar.
  const cap = buildHwCapability(apple(16220));
  const gptoss = cap.t0_models_available.find((m) => m.model === 'gpt-oss:20b');
  assert.ok(gptoss, 'gpt-oss:20b tem de estar no catalogo');
  assert.equal(gptoss.vram_req_mb, 12288, 'o requisito e o tamanho MEDIDO carregado');
  assert.equal(gptoss.can_run, true, 'com 16220 MB, um modelo de 12288 MB CABE — o tecto de 9216 dizia que nao');
});

test('menos memoria continua a excluir — a regra e comparar, nao deixar passar tudo', () => {
  const cap = buildHwCapability(apple(8192));
  const gptoss = cap.t0_models_available.find((m) => m.model === 'gpt-oss:20b');
  assert.equal(gptoss.can_run, false, 'com 8 GB, um modelo de 12 GB nao cabe');
});

test('o catalogo tem os modelos de 2026 com o tamanho medido carregado', () => {
  for (const [m, req] of [['granite4.2:3b', 8294], ['granite4.2:8b', 16384], ['gemma4:12b', 8294], ['gpt-oss:20b', 12288], ['qwen2.5-coder:14b', 15360]]) {
    assert.equal(MODEL_VRAM_REQ[m], req, `${m} tem de trazer o valor medido`);
  }
});

test('a ordem de preferencia lidera com o que o bench mediu, nao com um modelo ausente', () => {
  // Ate 2026-08-29 liderava com `qwen3:30b`, que nao esta instalado neste device.
  const cap = buildHwCapability(apple(16220));
  assert.equal(cap.recommended_t0, 'qwen2.5-coder:14b',
    'B1 100% no MooterBench de 2026-08-29 contra 0% dos Granite no prompt actual do pilar');
});

test('o tier de nvidia nao mudou', () => {
  assert.equal(classifyHwTier({ vendor: 'nvidia', vramMB: 24576 }), 'gpu-high');
  assert.equal(classifyHwTier({ vendor: 'nvidia', vramMB: 8192 }), 'gpu-mid');
  assert.equal(classifyHwTier({ vendor: 'apple', vramMB: 16220 }), 'apple-silicon');
  assert.equal(classifyHwTier(null), 'cpu-only');
});

test('sem probe nao ha capacidade inventada', () => {
  assert.equal(buildHwCapability(null), null);
  assert.equal(buildHwCapability({ vendor: 'cpu' }), null);
});
