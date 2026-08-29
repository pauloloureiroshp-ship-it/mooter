'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('./capacidades-modelo');

/** Um catálogo de mentira, para os testes não dependerem do ficheiro real. */
const intel = (locais) => ({ models: { local: locais } });
const medido = (b3, chamou, b6 = 100) => ({
  capabilities: ['completion', 'tools'],
  capabilities_medidas: {
    tool_calling: { b3_pct: b3, chamou_quando_devia: chamou, medido_em: '2026-08-29' },
    json_schema: { b6_schema_pct: b6, medido_em: '2026-08-29' },
  },
});

test('medido vence declarado: declarar tools e nunca chamar é NÃO CUMPRE', () => {
  // Este é o caso real do `qwen2.5-coder:14b` a 2026-08-29: o catálogo dizia
  // `capabilities: ['completion','tools']` e ele chamou 0 em 20.
  const opts = { intel: intel({ mentiroso: medido(20, '0/20') }) };
  const r = c.podeExecutar('mentiroso', { tools: true }, opts);
  assert.equal(r.ok, false);
  assert.equal(r.incerto, false, 'não é incerteza — é medição a desmentir');
  assert.match(r.porque, /nunca chamou uma ferramenta/);
});

test('ausência de medição é n/d, NUNCA false', () => {
  const opts = { intel: intel({ mudo: { capabilities: ['completion', 'tools'] } }) };
  const r = c.podeExecutar('mudo', { tools: true }, opts);
  assert.equal(r.ok, false, 'sem recibo não se autoriza');
  assert.equal(r.incerto, true, 'mas também não se declara incapaz');
  assert.match(r.porque, /declaração não é recibo/);
});

test('a nota sozinha não chega: quem nunca chama acerta a irrelevância', () => {
  // 80% de B3 com 0 chamadas quando devia = o modelo passou só na tarefa de
  // não-chamar. Sem a segunda condição, isto passava o portão.
  const opts = { intel: intel({ enganador: medido(80, '0/20') }) };
  assert.equal(c.podeExecutar('enganador', { tools: true }, opts).ok, false);
});

test('cumprir exige as DUAS condições', () => {
  const opts = { intel: intel({ bom: medido(100, '20/20') }) };
  const r = c.podeExecutar('bom', { tools: true }, opts);
  assert.equal(r.ok, true);
  assert.equal(r.incerto, false);
});

test('abaixo da barra reprova mesmo tendo chamado alguma vez', () => {
  const opts = { intel: intel({ meio: medido(60, '12/20') }) };
  const r = c.podeExecutar('meio', { tools: true }, opts);
  assert.equal(r.ok, false);
  assert.match(r.porque, /abaixo da barra/);
});

test('json_schema tem barra própria', () => {
  const opts = { intel: intel({ a: medido(100, '20/20', 100), b: medido(100, '20/20', 40) }) };
  assert.equal(c.podeExecutar('a', { json_schema: true }, opts).ok, true);
  assert.equal(c.podeExecutar('b', { json_schema: true }, opts).ok, false);
});

test('sem exigências, qualquer modelo serve — o guarda não inventa requisitos', () => {
  const opts = { intel: intel({ mentiroso: medido(20, '0/20') }) };
  assert.equal(c.podeExecutar('mentiroso', {}, opts).ok, true);
});

test('candidatosPara separa os três estados e nunca mistura', () => {
  const opts = { intel: intel({
    bom: medido(100, '20/20'),
    mau: medido(20, '0/20'),
    mudo: { capabilities: ['tools'] },
  }) };
  const r = c.candidatosPara(['bom', 'mau', 'mudo'], { tools: true }, opts);
  assert.deepEqual(r.servem, ['bom']);
  assert.deepEqual(r.incertos, ['mudo']);
  assert.deepEqual(r.recusados.map((x) => x.modelo), ['mau']);
});

test('declaracoesDesmentidas aponta o dedo ao catálogo, com o recibo', () => {
  const opts = { intel: intel({ bom: medido(100, '20/20'), mau: medido(20, '0/20') }) };
  const d = c.declaracoesDesmentidas(opts);
  assert.equal(d.length, 1);
  assert.equal(d[0].modelo, 'mau');
  assert.equal(d[0].declara, 'tools');
  assert.equal(d[0].medido_em, '2026-08-29');
});

test('um modelo que nem declara tools não entra na lista de desmentidos', () => {
  const opts = { intel: intel({ so_texto: { capabilities: ['completion'] } }) };
  assert.deepEqual(c.declaracoesDesmentidas(opts), []);
});

// ── contra o catálogo REAL: o que hoje está medido tem de continuar a bater ──

test('no catálogo real, o qwen2.5-coder:14b é recusado para trabalho com ferramentas', () => {
  const r = c.podeExecutar('qwen2.5-coder:14b', { tools: true });
  assert.equal(r.ok, false, 'medido a 2026-08-29: 0 chamadas em 20 tarefas que exigiam');
});

test('no catálogo real, os dois Granite servem para ferramentas', () => {
  for (const m of ['granite4.2:3b', 'granite4.2:8b']) {
    assert.equal(c.podeExecutar(m, { tools: true }).ok, true, `${m} mediu 20/20`);
  }
});

test('o catálogo real ainda tem uma declaração desmentida — e diz qual', () => {
  const d = c.declaracoesDesmentidas();
  assert.ok(d.some((x) => x.modelo === 'qwen2.5-coder:14b'),
    'enquanto o catálogo declarar tools para quem não chama, isto tem de aparecer');
});
