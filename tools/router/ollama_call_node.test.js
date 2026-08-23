/**
 * ollama_call_node.test.js — o prazo tem de DERIVAR, nunca ser um segundo numero.
 *
 * O DEFEITO, medido a 2026-08-23: este ficheiro tinha `req.setTimeout(3500)`
 * com um comentario a dizer "outer spawn has a 4s ceiling". O de fora ja ia em
 * 8000. Tres numeros, tres valores diferentes, nenhum a par dos outros.
 *
 * Consequencia real: com o router a recomendar `qwen3:30b` (18 GB) em 123 de
 * 127 prompts T0, TODA a chamada morria aos 3636 ms — `status=1`, stderr vazio,
 * registado como `option_a_miss` sem motivo. Em tres dias: 3 acertos.
 *
 * O que estes testes guardam nao e o valor 8000 — e a PROPRIEDADE de haver um
 * so numero. Fixar 8000 aqui recriaria o defeito noutro sitio.
 *
 * O que NAO esta aqui, e porque: os tres modos de falha (`timeout_*`,
 * `modelo_ausente`, `resposta_vazia`) precisam de um Ollama vivo, e um teste que
 * dependa de um daemon local ou e flaky ou e mockado ao ponto de nao provar
 * nada. Foram verificados a mao e o resultado esta no PR — 6619 ms/timeout,
 * 111 ms/ausente, 4154 ms/resposta. Prefiro dize-lo do que fingir cobertura.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { prazoMs, MARGEM_MS, PRAZO_OMISSAO_MS } = require('./ollama_call_node.js');

test('o prazo deriva do orcamento de quem chama, menos a margem', () => {
  assert.equal(prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '8000' }), 8000 - MARGEM_MS);
  assert.equal(prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '12000' }), 12000 - MARGEM_MS);
  // Subir o orcamento de fora TEM de subir o prazo de dentro. E esta a
  // propriedade que faltava, e por isso ela e que se testa.
  const a = prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '5000' });
  const b = prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '9000' });
  assert.ok(b > a, 'um orcamento maior tem de dar um prazo maior');
});

test('a margem existe para o filho conseguir escrever a resposta', () => {
  // Sem margem, o pai mata o filho a meio da escrita e o resultado e o mesmo
  // silencio de antes, so que noutro sitio.
  assert.ok(MARGEM_MS > 0);
  assert.ok(prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '8000' }) < 8000);
});

test('sem orcamento declarado, cai no valor historico', () => {
  // Quem chamar este script a mao (ou uma versao antiga do hook) nao pode
  // rebentar — fica com o comportamento de antes.
  assert.equal(prazoMs({}), PRAZO_OMISSAO_MS);
  assert.equal(prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '' }), PRAZO_OMISSAO_MS);
});

test('um orcamento absurdo nao vira um prazo absurdo', () => {
  for (const v of ['lixo', '-5', '0', 'NaN', 'Infinity']) {
    const r = prazoMs({ MOOTER_OPTION_A_BUDGET_MS: v });
    assert.ok(Number.isFinite(r) && r > 0, `orcamento ${JSON.stringify(v)} deu ${r}`);
  }
  // E um orcamento minusculo nao vira um prazo que falha sempre e parece avaria.
  assert.ok(prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '1200' }) >= 1000);
  assert.ok(prazoMs({ MOOTER_OPTION_A_BUDGET_MS: '100' }) >= 1000);
});

test('o modulo carrega sem correr nada — senao um require fazia uma chamada HTTP', () => {
  // O `require.main === module` que envolve o `main()` e o que permite este
  // ficheiro de teste existir. Sem ele, importar o modulo disparava o pedido.
  const m = require('./ollama_call_node.js');
  assert.equal(typeof m.prazoMs, 'function');
});
