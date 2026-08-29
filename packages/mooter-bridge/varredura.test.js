/**
 * A6 · varredura pedida a um motor SEM FERRAMENTAS.
 *
 * O defeito que este ficheiro fixa é medido, não imaginado. Job
 * `job-mtea5wou-f2b3` (2026-08-29, 64 s, $0, qwen2.5-coder:14b): o recibo
 * declarou, ANTES de o job responder,
 *
 *   permissoes_pedidas:  ["Read","Glob","Grep"]
 *   permissoes_efectivas: []            ← "o moo corre via /api/chat"
 *   permissoes_diferenca.diferem: true
 *   contexto_truncado:   router-execute.js — 304 de 1131 linhas
 *   aviso_fabricacao:    null           ← O DEFEITO
 *
 * e o modelo respondeu «0 chamadores em TODO o repo — CONFIRMADO-ORFAO».
 * O conector tinha na mão os três factos que provavam que a pergunta era
 * impossível de responder e não acusou nenhum.
 *
 * O guard A4 (`veredictoSemEvidencia`) não o apanhava por construção: exige
 * evidência ZERO, e aqui houve 304 linhas injectadas. Mas 304 de 1131 linhas
 * de UM ficheiro não é uma varredura do repo — é uma amostra. A pergunta era
 * sobre o universo; a evidência era sobre uma fatia.
 */
const test = require('node:test');
const assert = require('node:assert');
const seamless = require('./seamless.js');

/** O recibo do job real, campo a campo. */
function metaDoJobReal(extra) {
  return Object.assign({
    agent: 'moo',
    goal: 'confirma se applyQuotaDefcon tem chamadores em todo o repo',
    permissoes_pedidas: { valor: ['Read', 'Glob', 'Grep'], read_only: true },
    permissoes_efectivas: {
      valor: [], read_only: true,
      porque: 'o moo corre via /api/chat e não recebe ferramentas',
    },
    permissoes_diferenca: {
      diferem: true,
      porque: 'a lista pedida não coincide com as ferramentas que o comando prova como disponíveis',
    },
    evidencia: {
      ficheiros_lidos: ['tools/router/router-execute.js'],
      comandos_corridos: [], comandos_recusados: [], chars: 12000,
      truncados: [{ path: 'tools/router/router-execute.js', linhas_dadas: 304, linhas_totais: 1131 }],
    },
  }, extra || {});
}

const RESPOSTA_DO_MOO = '0 chamadores em TODO o repo — CONFIRMADO-ORFAO';

test('A6.1 — o quantificador de varredura é reconhecido no goal real', () => {
  assert.strictEqual(
    seamless.quantificadorDeVarredura('confirma se applyQuotaDefcon tem chamadores em todo o repo'),
    'todo o repo');
  assert.strictEqual(seamless.quantificadorDeVarredura('quantos chamadores tem isto?'), 'quantos');
  assert.strictEqual(seamless.quantificadorDeVarredura('não aparece em lado nenhum?'), 'em lado nenhum');
  assert.strictEqual(seamless.quantificadorDeVarredura('search the whole tree for it'), 'search the whole');
  // e NÃO dispara sobre um goal que não afirma nada sobre o universo
  assert.strictEqual(seamless.quantificadorDeVarredura('explica esta função'), null);
});

test('A6.2 — o job real é marcado sem_ferramentas (é o defeito que falhava)', () => {
  const v = seamless.varreduraSemFerramentas(metaDoJobReal());
  assert.ok(v, 'o job job-mtea5wou-f2b3 tem de ser marcado — tinha os três factos na mão');
  assert.strictEqual(v.quantificador, 'todo o repo');
  assert.match(v.aviso, /não é publicável como facto/i,
    'o aviso tem de dizer que o resultado NÃO é publicável como facto');
  assert.ok(v.porque.some((p) => /304 de 1131/.test(p)),
    'a truncagem medida entra na razão, porque foi um dos factos ignorados');
  assert.ok(v.porque.some((p) => /vazia/i.test(p)), 'permissões efectivas vazias entram na razão');
});

test('A6.3 — permissões efectivas vazias bastam, mesmo sem `diferem`', () => {
  const v = seamless.varreduraSemFerramentas(metaDoJobReal({
    permissoes_diferenca: { diferem: false, porque: 'coincidem' },
  }));
  assert.ok(v, 'lista efectiva vazia + quantificador basta: não há ferramentas para varrer');
});

test('A6.4 — `diferem:true` basta, mesmo com ferramentas efectivas', () => {
  const v = seamless.varreduraSemFerramentas(metaDoJobReal({
    permissoes_efectivas: { valor: ['Read'], read_only: true },
  }));
  assert.ok(v, 'a capacidade efectiva não coincide com a pedida — a varredura não está provada');
});

test('A6.5 — sem quantificador NÃO dispara (um aviso que dispara sempre é ruído)', () => {
  assert.strictEqual(
    seamless.varreduraSemFerramentas(metaDoJobReal({ goal: 'explica o que faz applyQuotaDefcon' })),
    null);
});

test('A6.6 — com ferramentas provadas e sem diferença NÃO dispara', () => {
  assert.strictEqual(seamless.varreduraSemFerramentas(metaDoJobReal({
    agent: 'cc',
    permissoes_efectivas: { valor: ['Read', 'Glob', 'Grep'], read_only: true },
    permissoes_diferenca: { diferem: false, porque: 'coincidem' },
  })), null);
});

test('A6.7 — o guard de saída degrada a resposta do job real', () => {
  const r = seamless.veredictoSemEvidencia(metaDoJobReal(), RESPOSTA_DO_MOO);
  assert.strictEqual(r.degradado, true,
    'o A4 sozinho deixava passar (houve 304 linhas de evidência) — é essa a fuga');
  assert.match(r.texto, /NÃO PUBLICÁVEL COMO FACTO/,
    'a mesma mecânica do A4: o aviso prefixa o corpo, não o substitui');
  assert.ok(r.texto.endsWith(RESPOSTA_DO_MOO), 'a resposta original é preservada, inteira');
  assert.ok(r.sem_ferramentas, 'o veredicto transporta a marca, para o recibo a poder publicar');
});

test('A6.8 — o A4 original continua intacto (nenhuma taxonomia nova o substitui)', () => {
  const semNada = {
    agent: 'moo', goal: 'verifica o build',
    evidencia: { ficheiros_lidos: [], comandos_corridos: [], comandos_recusados: [] },
  };
  const r = seamless.veredictoSemEvidencia(semNada, 'PASS — está tudo ok');
  assert.strictEqual(r.degradado, true);
  assert.match(r.texto, /VEREDICTO NÃO VERIFICADO/, 'o guard A4 mantém o seu próprio rótulo');
});
