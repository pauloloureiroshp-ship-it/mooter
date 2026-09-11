/**
 * custo-analise.test.mjs — a analise congelada, testada contra a forma REAL.
 *
 * A fixture `custo-fixture-sonda.json` e a saida integral de um `claude -p`
 * (result e session_id removidos). Nao e escrita a mao: uma fixture a mao mente,
 * e ja mentiu nesta casa — 28 testes verdes contra uma forma que o ficheiro
 * real nao tinha.
 *
 * Cada caso-limite abaixo foi nomeado pelo adversario ao pre-registo (CUSTO-06,
 * 07, 10, 17). Nao sao hipoteses minhas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analisar, lerLedger, tokensOpusDaTentativa, reconciliar, valorizar } from './custo-analise.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SONDA = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-fixture-sonda.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-prereg.json'), 'utf8'));

// ── bancada ────────────────────────────────────────────────────────────────

/** Um pre-registo minimo com N tarefas, para os testes nao dependerem das 20 reais. */
function preregDe(ids, tiers = {}) {
  return {
    ...PREREG,
    corpus: { ...PREREG.corpus, tarefas: ids.map((id, i) => ({ task_id: id, tier_classificado: tiers[id] || 'T3', ordem_dos_bracos: i % 2 ? 'B-depois-A' : 'A-depois-B' })) },
  };
}

/** Uma tentativa com a forma real da sonda, e os campos do ledger. */
function tentativa(task_id, braco, over = {}) {
  return {
    evento: 'tentativa_fim', task_id, braco, tentativa: 1, e_escalacao: false,
    tier_classificado: 'T3', executor: 'claude-p', arrancou: true, aceite: true,
    usage: SONDA.usage, modelUsage: SONDA.modelUsage, total_cost_usd: SONDA.total_cost_usd,
    duration_ms: SONDA.duration_ms, tecto_do_orcamento: 'null=sem tecto', ...over,
  };
}

const OPUS_TOTAL = 2 + 4 + 58964 + 0;   // input + output + cache_creation + cache_read, da sonda

// ── extraccao de tokens ────────────────────────────────────────────────────

test('tokens · le SO as chaves claude-opus* do modelUsage, com a forma real', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A'));
  assert.equal(t.input, 2); assert.equal(t.output, 4);
  assert.equal(t.cache_creation, 58964); assert.equal(t.cache_read, 0);
  assert.equal(t.total, OPUS_TOTAL);
  assert.deepEqual(t.modelos, ['claude-opus-5']);
  assert.equal(t.reparticao_cache, 'toda 1h');
  assert.equal(t.cache_creation_1h, 58964); assert.equal(t.cache_creation_5m, 0);
});

test('tokens · um subagente Haiku na mesma invocacao NAO conta como Opus', () => {
  const mu = { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 } };
  const usage = { ...SONDA.usage, input_tokens: 1002, output_tokens: 504 };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu, usage }));
  assert.equal(t.total, OPUS_TOTAL, 'os 1500 do Haiku ficaram de fora');
  assert.deepEqual(t.modelos, ['claude-opus-5']);
});

test('tokens · sem modelUsage e consumo DESCONHECIDO (null), nunca zero', () => {
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: undefined })), null);
  assert.equal(tokensOpusDaTentativa({ arrancou: false }), null);
});

test('reconciliar · passo local NUNCA se reconcilia, mesmo que traga usage/modelUsage (interpretacao 1)', () => {
  // se o controlador um dia escrever usage num passo local, isso nao pode virar marca de reconciliacao
  const r = reconciliar({ executor: 'router-execute', modelUsage: { 'x': { outputTokens: 5 } }, usage: { output_tokens: 0 } });
  assert.equal(r.ok, null);
  assert.match(r.motivo, /passo local/);
});

test('reconciliar · usage < soma de modelUsage e erro de extraccao', () => {
  assert.equal(reconciliar(tentativa('t1', 'A')).ok, true);
  const mau = tentativa('t1', 'A', { usage: { ...SONDA.usage, output_tokens: 1 } });
  const r = reconciliar(mau);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /usage\.output 1 < soma modelUsage 4/);
});

// ── valorizacao: o multiplicador 2.0x e o numero da Anthropic ──────────────

test('valorizar · reproduz o costUSD do CLI ao centimo com cache 1h a 2.0x', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A'));
  const usd = valorizar(t, PREREG.metricas.yardstick_custo);
  // 2*5 + 4*25 + 58964*5*2.0 = 10 + 100 + 589640 = 589750 / 1e6 = 0.58975
  assert.ok(Math.abs(usd - 0.58975) < 1e-9, `usd=${usd}`);
  assert.ok(Math.abs(usd - SONDA.modelUsage['claude-opus-5'].costUSD) < 1e-6,
    'se o nosso yardstick nao bate com o numero da Anthropic na sonda, o multiplicador esta errado');
});

test('valorizar · cache_read entra a 0.1x do input (a sonda tem 0, por isso afirma-se a parte)', () => {
  const mu = { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], cacheReadInputTokens: 100000 } };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu }));
  assert.equal(t.cache_read, 100000);
  const usd = valorizar(t, PREREG.metricas.yardstick_custo);
  // 0.58975 + 100000 * 5 * 0.1 / 1e6 = 0.58975 + 0.05
  assert.ok(Math.abs(usd - 0.63975) < 1e-9, `usd=${usd}`);
});

test('valorizar · sem reparticao de cache nao se valoriza (null), nao se adivinha', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { usage: { ...SONDA.usage, cache_creation: undefined } }));
  assert.equal(t.cache_creation_1h, null);
  assert.equal(valorizar(t, PREREG.metricas.yardstick_custo), null);
});

// ── a analise inteira ──────────────────────────────────────────────────────

test('analise · caso limpo: 3 pares, tabela 2x2 com task_ids, limiar, tokens', () => {
  const p = preregDe(['t1', 't2', 't3'], { t3: 'T0' });
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B', { tokens_locais: 5000 }),   // campo perdido numa tentativa claude-p: ignora-se, atribuicao e por executor
    tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false }),
    // t3 e T0: B faz passo local (router-execute) que falha, depois escala
    tentativa('t3', 'A'),
    // o ledger escreve null nos campos que nao existem no passo local — e isso NAO marca (interpretacao 1 do cabecalho)
    tentativa('t3', 'B', { tentativa: 1, executor: 'router-execute', aceite: false, modelUsage: null, usage: null, total_cost_usd: null, tokens_locais: 900, modelo_reportado: 'qwen2.5:3b@sha256:abc', duration_ms: 3000, tier_classificado: 'T0' }),
    tentativa('t3', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0' }),
  ];
  const r = analisar(p, ev, { agora: '2026-09-11T00:00:00Z' });
  assert.equal(r.primaria.n_pares_validos, 3);
  assert.equal(r.primaria.aceites_A, 3);
  assert.equal(r.primaria.aceites_B, 2);
  assert.deepEqual(r.primaria.tabela_2x2, { ambos: ['t1', 't3'], so_A: ['t2'], so_B: [], nenhum: [] });
  assert.equal(r.primaria.limiar_descritivo_cumprido, true, '2 >= 3-2');
  assert.equal(r.primaria.diferenca_emparelhada_A_menos_B, 0.333);
  assert.ok(r.primaria.ic95_tango.lo < 0.333 && r.primaria.ic95_tango.hi > 0.333);
  // tokens: A = 3 invocacoes de Opus; B = 2 (t1, t2) + escalacao de t3 = 3; o passo local nao conta
  assert.equal(r.secundaria.global.A.tokens_opus_total, 3 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.tokens_opus_total, 3 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.escalacoes, 1);
  assert.equal(r.secundaria.global.B.tokens_locais_a_parte, 900, 'so o router-execute conta; os 5000 perdidos em t1 nao');
  assert.equal(r.secundaria.global.A.por_aceite, OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.por_aceite, 3 * OPUS_TOTAL / 2);
  // estratificado
  assert.deepEqual(Object.keys(r.secundaria.por_tier).sort(), ['T0', 'T3']);
  assert.equal(r.secundaria.por_tier.T0.n, 1);
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.marcas.length, 0);
  assert.equal(r.velocidade.B.tempo_total_ms, 3 * SONDA.duration_ms + 3000);
  assert.deepEqual(r.por_tarefa[2].B.modelo_local, ['qwen2.5:3b@sha256:abc']);
  // wilson por braco, categorias, "so aceites por ambos", valorizacao — cada um afirmado, nao so presente
  assert.equal(r.primaria.wilson_A.p, 1);
  assert.ok(Math.abs(r.primaria.wilson_B.p - 2 / 3) < 1e-12);
  assert.equal(r.secundaria.global.A.por_categoria.cache_creation_1h, 3 * 58964);
  assert.equal(r.secundaria.global.A.por_categoria.output, 3 * 4);
  assert.deepEqual(r.secundaria.global.B.so_aceites_por_ambos, { n: 2, tokens_total: 2 * OPUS_TOTAL, por_tarefa: OPUS_TOTAL });
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida, OPUS_TOTAL);
  assert.ok(Math.abs(r.valorizacao.A.valorizacao_teorica_usd - 3 * 0.58975) < 1e-9);
  assert.ok(Math.abs(r.valorizacao.B.valorizacao_teorica_usd - 3 * 0.58975) < 1e-9);
  assert.ok(Math.abs(r.valorizacao.A.custo_cli_opus_usd - 3 * SONDA.modelUsage['claude-opus-5'].costUSD) < 1e-9);
  assert.deepEqual(r.valorizacao.precos_de_lista.cache_multiplicadores, PREREG.metricas.yardstick_custo.cache_multiplicadores);
  // por tier: a PRIMARIA estratificada existe e e a do estrato, nao a global
  assert.deepEqual(r.secundaria.por_tier.T0.primaria.tabela_2x2, { ambos: ['t3'], so_A: [], so_B: [], nenhum: [] });
  assert.equal(r.secundaria.por_tier.T0.primaria.n_pares_validos, 1);
  assert.deepEqual(r.secundaria.por_tier.T3.primaria.tabela_2x2, { ambos: ['t1'], so_A: ['t2'], so_B: [], nenhum: [] });
  assert.equal(r.secundaria.por_tier.T3.primaria.diferenca_emparelhada_A_menos_B, 0.5);
  assert.ok(r.secundaria.por_tier.T3.primaria.ic95_tango.lo < 0.5 && r.secundaria.por_tier.T3.primaria.ic95_tango.hi >= 0.5);
  // aliases Opus vistos, listados (prereg: "e listada")
  assert.deepEqual(r.secundaria.global.A.modelos_opus_vistos, ['claude-opus-5']);
  assert.deepEqual(r.por_tarefa[2].B.modelos_opus, ['claude-opus-5']);
  // velocidade: duration por tentativa e tempo-ate-verde
  const v3 = r.velocidade.por_tarefa[2];
  assert.deepEqual(v3.B_duracoes_ms, [3000, SONDA.duration_ms]);
  assert.equal(v3.B_ate_verde_ms, 3000 + SONDA.duration_ms, 'ate verde inclui o passo local que falhou');
  assert.equal(v3.A_ate_verde_ms, SONDA.duration_ms);
  assert.equal(r.velocidade.por_tarefa[1].B_ate_verde_ms, null, 't2 B nunca ficou verde');
  // custo do CLI: opus e total da invocacao, os dois
  assert.ok(Math.abs(r.valorizacao.A.custo_cli_total_usd - 3 * SONDA.total_cost_usd) < 1e-9);
  assert.ok(Math.abs(r.valorizacao.B.custo_cli_total_usd - 3 * SONDA.total_cost_usd) < 1e-9, 'o passo local entra a 0');
  // o passo local com modelUsage null NAO marca consumo desconhecido
  assert.equal(r.marcas.filter((m) => m.tipo === 'consumo_desconhecido').length, 0);
  assert.equal(r.fiabilidade.nao_corridas.length, 0);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 0);
});

test('analise · BLOQUEANTE do revisor: 1 tarefa em 20 sem paragem NAO e corrida fechada', () => {
  // Um controlador morto a meio nao escreve o proprio `paragem`. Antes desta
  // correccao, validos+invalidos era uma identidade e o CLI imprimia
  // «corrida FECHADA · invalidos 19».
  const ev = [tentativa(PREREG.corpus.tarefas[0].task_id, 'A'), tentativa(PREREG.corpus.tarefas[0].task_id, 'B')];
  const r = analisar(PREREG, ev);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.fiabilidade.nao_corridas.length, 19, 'as 19 nao corridas nao sao pares invalidos');
  assert.equal(r.fiabilidade.pares_invalidos.length, 0);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 20 });
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
});

test('analise · tarefa com tentativa so no braco A (morreu entre A e B): par invalido com consumo, corrida nao fechou', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A')];
  const r = analisar(p, ev);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.primaria.n_pares_validos, 1);
  const inv = r.fiabilidade.pares_invalidos;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].braco_que_nao_arrancou, 'B');
  assert.equal(inv[0].motivo, 'sem tentativa registada no braco B');
  assert.equal(inv[0].consumo_A_tokens, OPUS_TOTAL, 'o gasto de A em t2 fica visivel');
  assert.equal(inv[0].consumo_B_tokens, null);
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  // interpretacao 3: as duas leituras do total
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
});

test('analise · par_invalido com evento fecha o par: 2 tarefas, uma invalida por evento, sem paragem = corrida fechada', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A'),
    { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' },
  ];
  const r = analisar(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true, 'o evento par_invalido e o fecho legitimo desse par');
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT');
});

test('analise · suplente em cadeia (t2 -> s1 -> s2): a tarefa em jogo e s2, e o consumo de s2 conta', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou', suplente_usado: 's1' },
    { evento: 'tarefa_excluida', task_id: 's1', motivo: 'worktree nao reconstruiu', suplente_usado: 's2' },
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('s2', 'A'), tentativa('s2', 'B'),
  ];
  const r = analisar(p, ev);
  assert.deepEqual(r.por_tarefa.map((t) => t.task_id), ['t1', 's2']);
  assert.equal(r.primaria.n_pares_validos, 2);
  assert.equal(r.secundaria.global.A.tokens_opus_total, 2 * OPUS_TOTAL);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 0);
});

test('analise · suplente em ciclo (a -> b -> a) nao pendura a analise', () => {
  const p = preregDe(['a']);
  const ev = [
    { evento: 'tarefa_excluida', task_id: 'a', motivo: 'x', suplente_usado: 'b' },
    { evento: 'tarefa_excluida', task_id: 'b', motivo: 'y', suplente_usado: 'a' },
  ];
  const r = analisar(p, ev);
  assert.ok(Array.isArray(r.por_tarefa));
});

test('analise · tentativa orfa (task_id fora do jogo) nao e descartada: consumo visivel e marca', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t1-typo', 'A')];
  const r = analisar(p, ev);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
  assert.equal(r.fiabilidade.tentativas_orfas[0].task_id, 't1-typo');
  assert.equal(r.fiabilidade.tentativas_orfas[0].tokens_opus, OPUS_TOTAL);
  assert.ok(Math.abs(r.fiabilidade.tentativas_orfas[0].custo_cli_usd - SONDA.modelUsage['claude-opus-5'].costUSD) < 1e-9);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_orfa' && m.task_id === 't1-typo'));
});

test('analise · so_aceites_por_ambos com n=0 e null, nao zero (mutacao M3 do revisor)', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false })];
  const r = analisar(p, ev);
  assert.deepEqual(r.secundaria.global.A.so_aceites_por_ambos, { n: 0, tokens_total: null, por_tarefa: null });
  assert.deepEqual(r.secundaria.global.B.so_aceites_por_ambos, { n: 0, tokens_total: null, por_tarefa: null });
});

test('tokens · reparticao proporcional com 1h e 5m ambos > 0 (mutacao M2 do revisor)', () => {
  // 7000 em 1h e 3000 em 5m ao nivel da invocacao -> f = 0.7 do cache_creation do Opus.
  // 58964 * 0.7 = 41274.8: round e floor DIFEREM aqui (com 0.75 dava inteiro e a
  // mutacao do revisor sobrevivia — o numero do teste tem de distinguir).
  const usage = { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 7000, ephemeral_5m_input_tokens: 3000 } };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { usage }));
  assert.equal(t.reparticao_cache, 'proporcional');
  assert.equal(t.cache_creation_1h, 41275);
  assert.equal(t.cache_creation_5m, 58964 - 41275);   // 17689
  assert.equal(t.cache_creation_1h + t.cache_creation_5m, 58964, 'nada se perde na reparticao');
  // e a valorizacao usa os dois multiplicadores
  const usd = valorizar(t, PREREG.metricas.yardstick_custo);
  const esperado = (2 * 5 + 4 * 25 + 41275 * 5 * 2.0 + 17689 * 5 * 1.25) / 1e6;
  assert.ok(Math.abs(usd - esperado) < 1e-12, `usd=${usd} esperado=${esperado}`);
});

test('tokens · campo de tokens em falta numa entrada Opus conta 0 MAS marca o par (interpretacao 6)', () => {
  const mu = { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, costUSD: 0.1 } };   // sem cacheCreation/cacheRead
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu }));
  assert.deepEqual(t.campos_em_falta, ['claude-opus-5.cacheCreationInputTokens', 'claude-opus-5.cacheReadInputTokens']);
  const p = preregDe(['t1']);
  const r = analisar(p, [tentativa('t1', 'A', { modelUsage: mu, usage: { ...SONDA.usage } }), tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'campo_em_falta');
  assert.ok(m && m.task_id === 't1' && m.braco === 'A');
  assert.match(m.motivo, /cacheCreationInputTokens/);
});

test('analise · custo_cli_opus_usd e custo_cli_total_usd divergem quando ha subagente (interpretacao 4)', () => {
  const mu = { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 } };
  const usage = { ...SONDA.usage, input_tokens: 1002, output_tokens: 504 };
  const p = preregDe(['t1']);
  const r = analisar(p, [tentativa('t1', 'A', { modelUsage: mu, usage, total_cost_usd: 0.59975 }), tentativa('t1', 'B')]);
  assert.ok(Math.abs(r.valorizacao.A.custo_cli_opus_usd - 0.58975) < 1e-9, 'so o Opus');
  assert.ok(Math.abs(r.valorizacao.A.custo_cli_total_usd - 0.59975) < 1e-9, 'a invocacao inteira');
});

test('analise · a fronteira do limiar e EXACTAMENTE -2: A-B=2 passa, A-B=3 nao', () => {
  const p = preregDe(['t1', 't2', 't3']);
  const tres = (bAceites) => [
    tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: bAceites >= 1 }),
    tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: bAceites >= 2 }),
    tentativa('t3', 'A'), tentativa('t3', 'B', { aceite: bAceites >= 3 }),
  ];
  assert.equal(analisar(p, tres(1)).primaria.limiar_descritivo_cumprido, true, 'A=3 B=1: 1 >= 3-2');
  assert.equal(analisar(p, tres(0)).primaria.limiar_descritivo_cumprido, false, 'A=3 B=0: 0 < 3-2');
});

test('analise · par sem evento par_invalido mas com braco que nao arrancou tambem NAO e valido', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B', { arrancou: false, aceite: false, modelUsage: undefined, usage: undefined })];
  const r = analisar(p, ev);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.fiabilidade.pares_invalidos[0].braco_que_nao_arrancou, 'B');
});

test('analise · paragem registada depois de todos os pares fechados: a corrida NAO se declara fechada', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'paragem', ts: 'x', motivo: 'R9' }];
  assert.equal(analisar(p, ev).corrida_fechou_os_pares, false);
});

test('analise · CUSTO-06 — zero aceites da INDEFINIDO, nunca zero nem infinito', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false }), tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false })];
  const r = analisar(p, ev);
  assert.equal(r.secundaria.global.B.aceites, 0);
  assert.equal(r.secundaria.global.B.por_aceite, 'INDEFINIDO');
  assert.equal(r.secundaria.global.B.tokens_opus_total, 2 * OPUS_TOTAL, 'o total continua a existir — so a razao e indefinida');
  assert.equal(r.primaria.limiar_descritivo_cumprido, true, 'A=2/B=0 PASSA o limiar — e isso que o prereg diz que ele deixa passar');
});

test('analise · CUSTO-07 — consumo desconhecido propaga null e marca, nao zera', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A', { modelUsage: undefined, usage: undefined, aceite: false, duration_ms: 900000 }),   // estourou o tecto, sem JSON
    tentativa('t2', 'B'),
  ];
  const r = analisar(p, ev);
  assert.equal(r.secundaria.global.A.tokens_opus_total, null, 'um null no somatorio da null');
  assert.equal(r.secundaria.global.A.por_aceite, null);
  assert.equal(r.secundaria.global.B.tokens_opus_total, 2 * OPUS_TOTAL, 'o braco B nao e afectado');
  const m = r.marcas.find((x) => x.tipo === 'consumo_desconhecido');
  assert.ok(m && m.task_id === 't2' && m.braco === 'A');
  assert.equal(r.por_tarefa[1].A.tokens_opus, null);
  // e a valorizacao do braco A tambem e desconhecida — nao "o que se sabe"
  assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null);
  assert.equal(r.valorizacao.A.custo_cli_opus_usd, null);
  assert.ok(Math.abs(r.valorizacao.B.valorizacao_teorica_usd - 2 * 0.58975) < 1e-9);
});

test('analise · CUSTO-10 — par invalido sai da primaria mas o consumo do outro braco FICA', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A'),                                                        // A correu e gastou
    tentativa('t2', 'B', { arrancou: false, aceite: false, modelUsage: undefined, usage: undefined, motivo_se_nao: 'spawn:ENOENT' }),
    { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' },
  ];
  const r = analisar(p, ev);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL, 'so t1 na primaria');
  const inv = r.fiabilidade.pares_invalidos;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].task_id, 't2');
  assert.equal(inv[0].braco_que_nao_arrancou, 'B');
  assert.equal(inv[0].consumo_A_tokens, OPUS_TOTAL, 'o gasto de A em t2 NAO desapareceu');
  assert.ok(Math.abs(inv[0].custo_cli_A_usd - SONDA.total_cost_usd) < 1e-9);
});

test('analise · CUSTO-11 — corrida que nao fechou publica o prefixo e o motivo', () => {
  const p = preregDe(['t1', 't2', 't3']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    { evento: 'paragem', ts: '2026-09-11T02:00:00Z', motivo: 'limite de sessao do fornecedor', ultima_tarefa: 't1' },
  ];
  const r = analisar(p, ev);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 3 });
  assert.equal(r.motivo_de_paragem.motivo, 'limite de sessao do fornecedor');
  assert.equal(r.primaria.n_pares_validos, 1, 'o que correu conta; o que nao correu nao e inventado');
});

test('analise · divergencia JSON vs transcript > 1% e marcada com as duas fontes', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A', { tokens_transcript: Math.round(OPUS_TOTAL * 1.05) }), tentativa('t1', 'B')];
  const r = analisar(p, ev);
  const m = r.marcas.find((x) => x.tipo === 'divergencia_json_vs_transcript');
  assert.ok(m, 'tem de marcar');
  assert.equal(m.json, OPUS_TOTAL);
  assert.equal(m.transcript, Math.round(OPUS_TOTAL * 1.05));
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL, 'o JSON prevalece para a metrica, como o prereg diz');
});

test('analise · reconciliacao falhada marca o par', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A', { usage: { ...SONDA.usage, output_tokens: 0 } }), tentativa('t1', 'B')];
  const r = analisar(p, ev);
  assert.ok(r.marcas.some((x) => x.tipo === 'reconciliacao' && x.task_id === 't1' && x.braco === 'A'));
});

test('analise · tarefa excluida no pre-voo e substituida pelo suplente', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou (ja verde)', suplente_usado: 's1' },
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('s1', 'A'), tentativa('s1', 'B'),
  ];
  const r = analisar(p, ev);
  assert.equal(r.primaria.n_pares_validos, 2);
  assert.deepEqual(r.por_tarefa.map((t) => t.task_id), ['t1', 's1']);
  assert.equal(r.fiabilidade.tarefas_excluidas_antes_de_correr[0].suplente_usado, 's1');
});

test('analise · o tecto do orcamento de cada tentativa FICA no resultado', () => {
  // "sem tecto" tem de ser visivel na prova — foi a ressalva do revisor do D15
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A', { tecto_do_orcamento: 'null=sem tecto' }), tentativa('t1', 'B', { tecto_do_orcamento: 'T2' })];
  const r = analisar(p, ev);
  assert.deepEqual(r.por_tarefa[0].A.tecto_do_orcamento, ['null=sem tecto']);
  assert.deepEqual(r.por_tarefa[0].B.tecto_do_orcamento, ['T2']);
});

test('analise · TODOS os campos obrigatorios do pre-registo existem, mesmo com ledger vazio', () => {
  // CUSTO-17: publicar sempre, independentemente da direccao — inclusive sem dados
  const r = analisar(preregDe(['t1']), []);
  for (const k of ['primaria', 'secundaria', 'valorizacao', 'velocidade', 'fiabilidade', 'por_tarefa', 'marcas', 'motivo_de_paragem', 'prefixo_executado', 'O_QUE_ISTO_NAO_CONCLUI']) {
    assert.ok(k in r, `falta ${k}`);
  }
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null, 'sem pares nao ha veredicto');
  assert.equal(r.primaria.ic95_tango, null);
  assert.equal(r.valorizacao.ROTULO_OBRIGATORIO, PREREG.metricas.yardstick_custo.rotulo_obrigatorio_em_qualquer_visualizacao);
});

test('lerLedger · linhas invalidas sao contadas, nao engolidas', () => {
  const { eventos, linhasInvalidas } = lerLedger('{"evento":"x"}\nisto nao e json\n\n{"evento":"y"}\n');
  assert.equal(eventos.length, 2);
  assert.deepEqual(linhasInvalidas.map((l) => l.linha), [2]);
});
