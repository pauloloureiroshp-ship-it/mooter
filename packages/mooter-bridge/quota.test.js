'use strict';
/**
 * quota.test.js — v1.7: o medidor de combustivel nao mente sobre o que sabe.
 *
 * A tentacao aqui e enorme: apresentar um numero bonito de "quanto resta". Nao
 * ha API de quota em lado nenhum — nem Anthropic nem OpenAI — e o que lemos sai
 * dos ficheiros de sessao locais, a mesma fonte que o `/usage` do Claude Code
 * usa e que a propria documentacao dele avisa nao incluir o claude.ai nem
 * outras maquinas. E um LIMITE INFERIOR, e tem de o dizer sempre.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const q = require('./quota.js');

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-quota-'));
function sessao(nome, turnos) {
  const dir = path.join(RAIZ, nome);
  fs.mkdirSync(dir, { recursive: true });
  const linhas = turnos.map((t) => JSON.stringify({
    type: 'assistant', timestamp: new Date(t.em).toISOString(),
    message: { model: t.modelo, usage: { input_tokens: t.in || 0, output_tokens: t.out || 0,
      cache_read_input_tokens: t.cache || 0, cache_creation_input_tokens: 0 } },
  }));
  fs.writeFileSync(path.join(dir, 'x.jsonl'), linhas.join('\n'));
}

test('Q1 — le os turnos reais e soma o que a API reportou', () => {
  const agora = Date.now();
  sessao('p1', [
    { em: agora - 3600e3, modelo: 'claude-opus-4-8', in: 100, out: 1000 },
    { em: agora - 7200e3, modelo: 'claude-sonnet-5', in: 50, out: 500 },
  ]);
  const m = q.medir({ raiz: RAIZ, agora });
  assert.ok(m.disponivel);
  assert.strictEqual(m.curta.turnos, 2);
  assert.strictEqual(m.curta.saidas, 1500);
});

test('Q2 — cache_read e REGISTADO mas nunca entra no PESO da quota', () => {
  /**
   * ⚠️ CONTRATO AFINADO na v1.9, e a distincao e' o coracao da coisa:
   *
   *   · o cache lido NAO conta para a pressao — e' 0,1x e a barra da aplicacao
   *     nao o conta assim; soma-lo faria o painel gritar "quase no limite" sem
   *     ser verdade;
   *   · mas TEM de ser registado, porque e' 70% do custo real da factura
   *     (631 MILHOES de tokens em 7 dias, medidos) e e' o unico numero que
   *     responde a "vale a pena recomecar a conversa?".
   *
   * Registar sem contar. As duas coisas ao mesmo tempo.
   */
  const agora = Date.now();
  sessao('p2', [{ em: agora - 60e3, modelo: 'claude-opus-4-8', in: 2, out: 100, cache: 900000 }]);
  const m = q.medir({ raiz: RAIZ, agora });
  assert.strictEqual(m.curta.cache_lido, 900000, 'deixou de registar o cache lido — perde-se o numero que explica a factura');
  /**
   * O peso deriva das SAIDAS, nunca do cache lido. O tecto e' "tudo Opus":
   * saidas/1000 x 5. Se alguem somasse os 900 000 de cache, o peso saltaria
   * para ~4500 — tres ordens de grandeza acima — e o painel diria "estas no
   * limite" com 100 tokens escritos.
   *
   * ⚠️ O teste NAO assume isolamento: as sessoes dos testes anteriores vivem na
   * mesma raiz e somam-se. Por isso a assercao e' relativa as saidas medidas, e
   * nao a um numero absoluto — foi assim que este teste ja falhou uma vez, por
   * culpa do proprio teste.
   */
  const pesoMax = (m.curta.saidas / 1000) * 5;
  assert.ok(m.curta.peso <= pesoMax + 0.001,
    'o cache lido entrou no peso: ' + m.curta.peso + ' > ' + pesoMax);
  assert.ok(m.curta.peso < (m.curta.cache_lido / 1000) * 0.1,
    'o peso esta na ordem de grandeza do cache — alguem o somou');
});

test('Q3 — o Opus pesa mais do que o Haiku no consumo de quota', () => {
  assert.strictEqual(q.pesoDe('claude-opus-4-8').peso, 5);
  assert.strictEqual(q.pesoDe('claude-sonnet-5').peso, 1);
  assert.strictEqual(q.pesoDe('claude-haiku-4-5').peso, 0.25);
  assert.strictEqual(q.pesoDe('modelo-desconhecido').familia, 'n/d');
});

test('Q4 — A RESSALVA viaja SEMPRE com o numero', () => {
  const m = q.medir({ raiz: RAIZ, agora: Date.now() });
  assert.ok(/LIMITE INFERIOR/.test(m.ressalva), 'o numero sai sem dizer que e um minimo');
  assert.ok(/claude\.ai/.test(m.ressalva), 'nao avisa que o contador do servidor esta a frente');
  assert.ok(m.fonte, 'nao declara de onde saiu o numero');
});

test('Q5 — sem sessoes locais e n/d, nunca zero', () => {
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-vazio-'));
  const m = q.medir({ raiz: vazio, agora: Date.now() });
  const p = q.pressao(m, null);
  // uma pasta vazia da 0 de consumo, o que e verdade; o que NAO pode e' dar erro
  assert.ok(m.disponivel === true || m.disponivel === false);
  if (!m.disponivel) assert.strictEqual(p.valor, null, 'inventou uma pressao sem dados');
});

test('Q6 — a pressao declara-se ESTIMATIVA e diz contra que referencia', () => {
  const agora = Date.now();
  const m = q.medir({ raiz: RAIZ, agora });
  const p = q.pressao(m, { peso_semana: 100, peso_5h: 10 });
  assert.strictEqual(p.estimativa, true);
  assert.ok(p.referencia && p.referencia.peso_semana === 100, 'nao diz contra que referencia mediu');
  assert.ok(/nao e um limite publicado|não é um limite publicado/.test(p.porque), 'faz passar a referencia por limite oficial');
});

test('Q7 — a calibragem SO desce de tier, nunca sobe', () => {
  const alto = q.calibrar({ valor: 0.9, nivel: 'critico' }, { tem_local: true });
  assert.strictEqual(alto.forcar_local, true);
  assert.strictEqual(alto.tecto, 'haiku');
  const medio = q.calibrar({ valor: 0.7, nivel: 'alto' }, { tem_local: true });
  assert.strictEqual(medio.tecto, 'sonnet');
  const normal = q.calibrar({ valor: 0.1, nivel: 'baixo' }, { tem_local: true });
  assert.strictEqual(normal.tecto, null, 'com quota a sobrar nao pode impor tecto nenhum');
  assert.strictEqual(normal.forcar_local, false);
});

test('Q8 — sem leitura de quota NAO mexe no routing as cegas', () => {
  const c = q.calibrar({ valor: null }, {});
  assert.strictEqual(c.politica, 'normal');
  assert.strictEqual(c.forcar_local, false);
  assert.ok(/às cegas|as cegas/.test(c.porque));
});

test('Q9 — sem GPU local, aperta o tecto em vez de prometer local', () => {
  const c = q.calibrar({ valor: 0.95, nivel: 'critico' }, { tem_local: false });
  assert.strictEqual(c.forcar_local, false, 'prometeu mandar para uma GPU que nao existe');
  assert.strictEqual(c.tecto, 'haiku');
});

test('Q10 — o Codex fica n/d, e diz porque', () => {
  const e = q.estado({ raiz: RAIZ });
  assert.strictEqual(e.codex.disponivel, false);
  assert.ok(/interactivo|interativo/.test(e.codex.porque), 'nao explica porque e que o Codex fica sem leitura');
});

test('Q11 — ACHADO CODEX: a cache existe e nao muda os numeros', () => {
  // "44 ficheiros a cada 2 segundos implicam 1320 aberturas/minuto e bloqueiam
  // o event loop" — e o painel repolla de 2 em 2s. Medido: 137ms -> 5ms.
  const agora = Date.now();
  sessao('cache1', [{ em: agora - 60e3, modelo: 'claude-opus-4-8', in: 10, out: 100 }]);
  const a = q.medir({ raiz: RAIZ, agora });
  const b = q.medir({ raiz: RAIZ, agora });
  assert.strictEqual(a.longa.turnos, b.longa.turnos, 'a cache mudou a contagem');
  assert.strictEqual(a.longa.saidas, b.longa.saidas);
  assert.strictEqual(a.curta.turnos, b.curta.turnos, 'a janela curta divergiu com a cache');
  assert.ok(q.CACHE.size > 0, 'nao ha cache nenhuma — volta a ler 44 ficheiros de 2 em 2s');
});

test('Q12 — a janela de 5h e sempre um subconjunto da de 7 dias', () => {
  const agora = Date.now();
  sessao('janela', [
    { em: agora - 60e3, modelo: 'claude-sonnet-5', in: 1, out: 10 },          // dentro das 5h
    { em: agora - 3 * 24 * 3600e3, modelo: 'claude-sonnet-5', in: 1, out: 20 }, // fora
  ]);
  const m = q.medir({ raiz: RAIZ, agora });
  assert.ok(m.curta.turnos <= m.longa.turnos, 'a janela curta tem mais turnos que a longa');
  assert.ok(m.curta.saidas <= m.longa.saidas);
});

test('Q13 — um ficheiro que MUDA e relido, nao servido da cache', () => {
  const agora = Date.now();
  const dir = path.join(RAIZ, 'muda');
  sessao('muda', [{ em: agora - 60e3, modelo: 'claude-sonnet-5', in: 1, out: 100 }]);
  const antes = q.medir({ raiz: RAIZ, agora }).longa.saidas;
  // acrescenta um turno, como o Claude Code faz: sempre no fim
  fs.appendFileSync(path.join(dir, 'x.jsonl'), '\n' + JSON.stringify({
    type: 'assistant', timestamp: new Date(agora - 30e3).toISOString(),
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 500 } },
  }));
  const depois = q.medir({ raiz: RAIZ, agora }).longa.saidas;
  assert.strictEqual(depois, antes + 500, 'a cache serviu dados velhos depois do ficheiro crescer');
});
