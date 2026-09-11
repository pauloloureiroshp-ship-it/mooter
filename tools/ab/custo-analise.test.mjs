/**
 * custo-analise.test.mjs — a analise congelada, testada contra a forma REAL.
 *
 * A fixture `custo-fixture-sonda.json` e a saida integral de um `claude -p`
 * (result e session_id removidos). Nao e escrita a mao: uma fixture a mao mente,
 * e ja mentiu nesta casa — 28 testes verdes contra uma forma que o ficheiro
 * real nao tinha.
 *
 * Cada caso-limite abaixo foi nomeado pelo adversario ao pre-registo (CUSTO-06,
 * 07, 10, 11, 17) ou por um dos dois revisores pre-push que deram NO-SHIP.
 * Nao sao hipoteses minhas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analisar, lerLedger, tokensOpusDaTentativa, reconciliar, valorizar, arrancouDaTentativa } from './custo-analise.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SONDA = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-fixture-sonda.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-prereg.json'), 'utf8'));
const PRECOS = PREREG.metricas.yardstick_custo;

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
    duration_ms: SONDA.duration_ms, tecto_do_orcamento: 'null=sem tecto', estado_vivo_sha: 'ev-1', sentinela_presente: true, ...over,
  };
}

/** Um passo local, com a forma que o ledger escreve para o router-execute (campos do CLI a null). */
function passoLocal(task_id, over = {}) {
  return tentativa(task_id, 'B', { tentativa: 1, executor: 'router-execute', aceite: false, arrancou: true, modelUsage: null, usage: null, total_cost_usd: null,
    tokens_locais: 900, modelo_reportado: 'qwen2.5:3b@sha256:abc', texto_local_sha256: 'deadbeef', duration_ms: 3000, tier_classificado: 'T0', ...over });
}

const preVoo = (task_id, over = {}) => ({ evento: 'pre_voo', task_id, exit_code: 1, falhou: true, ...over });

/** analisar() com pre_voo falhado para todas as tarefas que aparecem — o caminho normal. */
function correr(p, ev, opts) {
  const ids = new Set([...p.corpus.tarefas.map((t) => t.task_id), ...ev.filter((e) => e.evento === 'tentativa_fim').map((e) => e.task_id)]);
  const jaTem = new Set(ev.filter((e) => e.evento === 'pre_voo').map((e) => e.task_id));
  return analisar(p, [...[...ids].filter((id) => !jaTem.has(id)).map((id) => preVoo(id)), ...ev], opts);
}

const OPUS_TOTAL = 2 + 4 + 58964 + 0;   // input + output + cache_creation + cache_read, da sonda
const USD_SONDA = SONDA.modelUsage['claude-opus-5'].costUSD;   // 0.58975
const perto = (a, b, tol, msg) => assert.ok(a !== null && Math.abs(a - b) < tol, `${msg || ''} ${a} vs ${b}`);

// ── extraccao de tokens ────────────────────────────────────────────────────

test('tokens · le SO as chaves claude-opus* do modelUsage, com a forma real', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A'));
  assert.equal(t.input, 2); assert.equal(t.output, 4);
  assert.equal(t.cache_creation, 58964); assert.equal(t.cache_read, 0);
  assert.equal(t.total, OPUS_TOTAL);
  assert.deepEqual(t.modelos, ['claude-opus-5']);
  assert.equal(t.reparticao_cache, 'toda 1h');
  assert.equal(t.cache_creation_1h, 58964); assert.equal(t.cache_creation_5m, 0);
  assert.equal(t.fonte, 'json');
});

test('tokens · um subagente Haiku na mesma invocacao NAO conta como Opus', () => {
  const mu = { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 } };
  const usage = { ...SONDA.usage, input_tokens: 1002, output_tokens: 504 };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu, usage }));
  assert.equal(t.total, OPUS_TOTAL, 'os 1500 do Haiku ficaram de fora');
  assert.deepEqual(t.modelos, ['claude-opus-5']);
});

test('tokens · arrancou sem modelUsage e consumo DESCONHECIDO (null); nao arrancou e ZERO por construcao (interpretacao 3)', () => {
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: undefined })), null);
  const z = tokensOpusDaTentativa({ arrancou: false });
  assert.equal(z.total, 0); assert.equal(z.fonte, 'nao arrancou');
});

test('tokens · arrancou sem JSON mas com tokens_transcript: o transcript e a fonte, categorias null', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: undefined, usage: undefined, tokens_transcript: 123456 }));
  assert.equal(t.total, 123456); assert.equal(t.fonte, 'transcript');
  assert.equal(t.input, null); assert.equal(t.cache_creation_1h, null);
  assert.equal(valorizar(t, PRECOS), null, 'sem categorias nao se valoriza');
});

test('tokens · passo local e ZERO por construcao, mesmo com campos a null (interpretacao 1)', () => {
  const t = tokensOpusDaTentativa(passoLocal('t1'));
  assert.equal(t.total, 0); assert.equal(t.fonte, 'local'); assert.deepEqual(t.modelos, []);
});

test('tokens · reparticao proporcional com 1h e 5m ambos > 0 (mutacao M2 do 1.o revisor)', () => {
  // 7000 em 1h e 3000 em 5m ao nivel da invocacao -> f = 0.7 do cache_creation do Opus.
  // 58964 * 0.7 = 41274.8: round e floor DIFEREM aqui (com 0.75 dava inteiro e a
  // mutacao do revisor sobrevivia — o numero do teste tem de distinguir).
  const usage = { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 7000, ephemeral_5m_input_tokens: 3000 } };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { usage }));
  assert.equal(t.reparticao_cache, 'proporcional');
  assert.equal(t.cache_creation_1h, 41275);
  assert.equal(t.cache_creation_5m, 58964 - 41275);   // 17689
  assert.equal(t.cache_creation_1h + t.cache_creation_5m, 58964, 'nada se perde na reparticao');
  const usd = valorizar(t, PRECOS);
  const esperado = (2 * 5 + 4 * 25 + 41275 * 5 * 2.0 + 17689 * 5 * 1.25) / 1e6;
  assert.ok(Math.abs(usd - esperado) < 1e-12, `usd=${usd} esperado=${esperado}`);
});

test('tokens · campo de tokens em falta numa entrada Opus conta 0 MAS marca o par (interpretacao 12)', () => {
  const mu = { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, costUSD: 0.1 } };   // sem cacheCreation/cacheRead
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu }));
  assert.deepEqual(t.campos_em_falta, ['claude-opus-5.cacheCreationInputTokens', 'claude-opus-5.cacheReadInputTokens']);
  const r = correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: mu, usage: { ...SONDA.usage } }), tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'campo_em_falta' && x.braco === 'A');
  assert.ok(m && m.task_id === 't1');
  assert.match(m.motivo, /cacheCreationInputTokens/);
});

test('arrancou · passo local: true, ou null/omitido com texto_local_sha256; nunca pela definicao do CLI', () => {
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: true })), true);
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: null })), true, 'null + texto = arrancou');
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: undefined })), true);
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: null, texto_local_sha256: undefined })), false);
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: false })), false);
  assert.equal(arrancouDaTentativa(tentativa('t1', 'A', { arrancou: null, texto_local_sha256: 'x' })), false, 'claude-p precisa de arrancou===true');
});

// ── reconciliacao ──────────────────────────────────────────────────────────

test('reconciliar · passo local NUNCA se reconcilia, mesmo que traga usage/modelUsage (interpretacao 1)', () => {
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
  const usd = valorizar(t, PRECOS);
  // 2*5 + 4*25 + 58964*5*2.0 = 10 + 100 + 589640 = 589750 / 1e6 = 0.58975
  assert.ok(Math.abs(usd - 0.58975) < 1e-9, `usd=${usd}`);
  assert.ok(Math.abs(usd - USD_SONDA) < 1e-6, 'se o nosso yardstick nao bate com o numero da Anthropic na sonda, o multiplicador esta errado');
});

test('valorizar · cache_read entra a 0.1x do input (a sonda tem 0, por isso afirma-se a parte)', () => {
  const mu = { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], cacheReadInputTokens: 100000 } };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu }));
  assert.equal(t.cache_read, 100000);
  const usd = valorizar(t, PRECOS);
  assert.ok(Math.abs(usd - 0.63975) < 1e-9, `usd=${usd}`);   // 0.58975 + 100000 * 5 * 0.1 / 1e6
});

test('valorizar · sem reparticao de cache nao se valoriza (null), nao se adivinha', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { usage: { ...SONDA.usage, cache_creation: undefined } }));
  assert.equal(t.cache_creation_1h, null);
  assert.equal(valorizar(t, PRECOS), null);
});

// ── a analise inteira: caso limpo ──────────────────────────────────────────

test('analise · caso limpo: 3 pares fechados e validos — tudo afirmado, nada so presente', () => {
  const p = preregDe(['t1', 't2', 't3'], { t3: 'T0' });
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B', { tokens_locais: 5000 }),   // campo perdido numa tentativa claude-p: ignora-se, atribuicao e por executor
    tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false }),
    // t3 e T0: B faz passo local (router-execute) que falha, depois escala
    tentativa('t3', 'A'),
    passoLocal('t3'),
    tentativa('t3', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0' }),
  ];
  const r = correr(p, ev, { agora: '2026-09-11T00:00:00Z' });
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, true);
  assert.deepEqual(r.corrida_invalida_por, []);
  assert.equal(r.primaria.n_pares_validos, 3);
  assert.equal(r.primaria.aceites_A, 3);
  assert.equal(r.primaria.aceites_B, 2);
  assert.deepEqual(r.primaria.tabela_2x2, { ambos: ['t1', 't3'], so_A: ['t2'], so_B: [], nenhum: [] });
  assert.equal(r.primaria.limiar_descritivo_cumprido, true, '2 >= 3-2');
  assert.equal(r.primaria.veredicto_ausente_porque, null);
  assert.equal(r.primaria.diferenca_emparelhada_A_menos_B, 0.333);
  assert.ok(r.primaria.ic95_tango.lo < 0.333 && r.primaria.ic95_tango.hi > 0.333);
  assert.equal(r.primaria.wilson_A.p, 1);
  assert.equal(r.primaria.wilson_B.p, 0.667);
  // tokens: A = 3 invocacoes de Opus; B = 2 (t1, t2) + escalacao de t3 = 3; o passo local nao conta
  assert.equal(r.secundaria.global.A.tokens_opus_total, 3 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.tokens_opus_total, 3 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 3 * OPUS_TOTAL, 'sem invalidos, as duas leituras coincidem');
  assert.equal(r.secundaria.global.B.escalacoes, 1);
  assert.equal(r.secundaria.global.B.tokens_locais_a_parte, 900, 'so o router-execute conta; os 5000 perdidos em t1 nao');
  assert.equal(r.secundaria.global.A.por_aceite, OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.por_aceite, Math.round(3 * OPUS_TOTAL / 2));
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.por_categoria.cache_creation_1h, 3 * 58964);
  assert.equal(r.secundaria.global.A.por_categoria.output, 3 * 4);
  assert.deepEqual(r.secundaria.global.B.so_aceites_por_ambos, { n: 2, tokens_total: 2 * OPUS_TOTAL, por_tarefa: OPUS_TOTAL });
  assert.deepEqual(r.secundaria.global.A.modelos_opus_vistos, ['claude-opus-5']);
  // estratificado: vistas E primaria por tier
  assert.deepEqual(Object.keys(r.secundaria.por_tier).sort(), ['T0', 'T3']);
  assert.equal(r.secundaria.por_tier.T0.n, 1);
  assert.deepEqual(r.secundaria.por_tier.T0.primaria.tabela_2x2, { ambos: ['t3'], so_A: [], so_B: [], nenhum: [] });
  assert.deepEqual(r.secundaria.por_tier.T3.primaria.tabela_2x2, { ambos: ['t1'], so_A: ['t2'], so_B: [], nenhum: [] });
  assert.equal(r.secundaria.por_tier.T3.primaria.diferenca_emparelhada_A_menos_B, 0.5);
  assert.equal(r.secundaria.por_tier.T3.primaria.limiar_descritivo_cumprido, true);
  // valorizacao (4 casas a saida)
  perto(r.valorizacao.A.valorizacao_teorica_usd, 3 * 0.58975, 1e-4, 'valorizacao A');
  perto(r.valorizacao.B.valorizacao_teorica_usd, 3 * 0.58975, 1e-4, 'valorizacao B');
  perto(r.valorizacao.A.custo_cli_opus_usd, 3 * USD_SONDA, 1e-4);
  perto(r.valorizacao.A.custo_cli_total_usd, 3 * SONDA.total_cost_usd, 1e-4);
  perto(r.valorizacao.B.custo_cli_total_usd, 3 * SONDA.total_cost_usd, 1e-4, 'o passo local entra a 0');
  assert.deepEqual(r.valorizacao.precos_de_lista.cache_multiplicadores, PRECOS.cache_multiplicadores);
  assert.equal(r.valorizacao.ROTULO_OBRIGATORIO, PRECOS.rotulo_obrigatorio_em_qualquer_visualizacao);
  // velocidade: duration por tentativa e tempo-ate-verde
  assert.equal(r.velocidade.B.tempo_total_ms, 3 * SONDA.duration_ms + 3000);
  const v3 = r.velocidade.por_tarefa[2];
  assert.deepEqual(v3.B_duracoes_ms, [3000, SONDA.duration_ms]);
  assert.equal(v3.B_ate_verde_ms, 3000 + SONDA.duration_ms, 'ate verde inclui o passo local que falhou');
  assert.equal(v3.A_ate_verde_ms, SONDA.duration_ms);
  assert.equal(r.velocidade.por_tarefa[1].B_ate_verde_ms, null, 't2 B nunca ficou verde');
  // por tarefa
  assert.deepEqual(r.por_tarefa[2].B.modelo_local, ['qwen2.5:3b@sha256:abc']);
  assert.deepEqual(r.por_tarefa[2].B.modelos_opus, ['claude-opus-5']);
  assert.deepEqual(r.por_tarefa[2].B.fontes, ['local', 'json']);
  assert.equal(r.por_tarefa[2].pre_voo_falhou, true);
  assert.equal(r.por_tarefa[2].suplente, false);
  // sem ruido
  assert.equal(r.marcas.length, 0, JSON.stringify(r.marcas));
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  assert.deepEqual(r.fiabilidade.tentativas_orfas, []);
  assert.deepEqual(r.fiabilidade.tentativas_duplicadas, []);
  assert.deepEqual(r.fiabilidade.estado_vivo_shas_vistos, ['ev-1']);
  assert.deepEqual(r.fiabilidade.modelos_locais_vistos, ['qwen2.5:3b@sha256:abc']);
});

// ── prefixo, fecho, validade (os dois NO-SHIP) ─────────────────────────────

test('analise · 1.o NO-SHIP: 1 tarefa em 20 sem paragem NAO e corrida fechada', () => {
  // Um controlador morto a meio nao escreve o proprio `paragem`. Antes da
  // correccao, validos+invalidos era uma identidade e o CLI imprimia
  // «corrida FECHADA · invalidos 19».
  const id = PREREG.corpus.tarefas[0].task_id;
  const r = analisar(PREREG, [preVoo(id), tentativa(id, 'A'), tentativa(id, 'B')]);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.fiabilidade.nao_corridas.length, 19, 'as 19 nao corridas nao sao pares invalidos');
  assert.equal(r.fiabilidade.pares_invalidos.length, 0);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 20 });
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
});

test('analise · 2.o NO-SHIP: sem corrida fechada NAO ha veredicto — limiar null, descritivo publicado com AVISO', () => {
  const id = PREREG.corpus.tarefas[0].task_id;
  const r = analisar(PREREG, [preVoo(id), tentativa(id, 'A'), tentativa(id, 'B')]);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.match(r.primaria.veredicto_ausente_porque, /nao fechou/);
  assert.match(r.primaria.AVISO, /DESCRITIVO DO QUE CORREU/);
  assert.deepEqual(r.primaria.tabela_2x2.ambos, [id], 'o descritivo do prefixo continua publicado');
  assert.ok(r.primaria.wilson_A && r.primaria.ic95_tango, 'Wilson e Tango descrevem o prefixo');
  // e o caso que era constante true: 2/20 com B=0 -> null, nao true
  const id2 = PREREG.corpus.tarefas[1].task_id;
  const r2 = analisar(PREREG, [preVoo(id), preVoo(id2), tentativa(id, 'A'), tentativa(id, 'B', { aceite: false }), tentativa(id2, 'A'), tentativa(id2, 'B', { aceite: false })]);
  assert.equal(r2.primaria.aceites_A, 2); assert.equal(r2.primaria.aceites_B, 0);
  assert.equal(r2.primaria.limiar_descritivo_cumprido, null);
  // por tier tambem
  for (const t of Object.values(r2.secundaria.por_tier)) assert.equal(t.primaria.limiar_descritivo_cumprido, null);
});

test('analise · corrida INVALIDA (estado_vivo mudou): sem veredicto, motivo publicado, dados descritivos ficam', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { estado_vivo_sha: 'ev-2' }), tentativa('t2', 'B')];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, false);
  assert.equal(r.corrida_invalida_por.length, 1);
  assert.match(r.corrida_invalida_por[0].motivo, /estado_vivo_sha mudou/);
  assert.deepEqual(r.corrida_invalida_por[0].valores.sort(), ['ev-1', 'ev-2']);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.match(r.primaria.veredicto_ausente_porque, /INVALIDA/);
  assert.equal(r.primaria.n_pares_validos, 2, 'os pares continuam contados');
});

test('analise · corrida INVALIDA: digest do modelo local mudou; sentinela D15 ausente', () => {
  const p = preregDe(['t1', 't2'], { t1: 'T0', t2: 'T0' });
  const ev = [
    tentativa('t1', 'A'), passoLocal('t1', { aceite: true }),
    tentativa('t2', 'A'), passoLocal('t2', { aceite: true, modelo_reportado: 'qwen2.5:3b@sha256:OUTRO' }),
  ];
  const r = correr(p, ev);
  assert.equal(r.corrida_valida, false);
  assert.match(r.corrida_invalida_por[0].motivo, /modelo local/);
  const r2 = correr(p, [tentativa('t1', 'A', { sentinela_presente: false }), passoLocal('t1', { aceite: true }), tentativa('t2', 'A'), passoLocal('t2', { aceite: true })]);
  assert.equal(r2.corrida_valida, false);
  assert.match(r2.corrida_invalida_por[0].motivo, /sentinela/);
  assert.deepEqual(r2.corrida_invalida_por[0].valores, ['t1/A/1']);
});

test('analise · tarefa com tentativa so no braco A (morreu entre A e B): par invalido com consumo, corrida nao fechou', () => {
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A')]);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.primaria.n_pares_validos, 1);
  const inv = r.fiabilidade.pares_invalidos;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].braco_que_nao_arrancou, 'B');
  assert.equal(inv[0].motivo, 'sem tentativa registada no braco B');
  assert.equal(inv[0].consumo_A_tokens, OPUS_TOTAL, 'o gasto de A em t2 fica visivel');
  assert.equal(inv[0].consumo_B_tokens, null);
  perto(inv[0].valorizacao_A_usd, 0.58975, 1e-4, 'valorizacao do invalido');
  perto(inv[0].custo_cli_total_A_usd, SONDA.total_cost_usd, 1e-4);
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  // interpretacao 9: as duas leituras do total
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
});

test('analise · par_invalido SEM nenhuma tentativa (spawn falhou no 1.o braco): e par invalido com o motivo do evento, nao "nao corrida"', () => {
  // 11/20 tarefas sao A-depois-B: B corre primeiro; se B falha a arrancar e o
  // controlador salta A, o ledger e exactamente isto. O motivo nao pode sumir.
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true, 'o evento fecha o par');
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  assert.equal(r.fiabilidade.pares_invalidos.length, 1);
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT');
  assert.equal(r.fiabilidade.pares_invalidos[0].braco_que_nao_arrancou, 'B');
  assert.equal(r.fiabilidade.pares_invalidos[0].consumo_A_tokens, null);
  assert.equal(r.prefixo_executado.tarefas_com_alguma_tentativa, 1);
});

test('analise · par_invalido com evento e tentativa em A: fecha o par, motivo do evento', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT');
  assert.equal(r.primaria.limiar_descritivo_cumprido, true, 'com o par fechado por evento, o veredicto existe sobre o valido');
});

test('analise · CUSTO-11 — corrida que nao fechou publica o prefixo, o motivo, e nenhum veredicto', () => {
  const p = preregDe(['t1', 't2', 't3']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'paragem', ts: '2026-09-11T02:00:00Z', motivo: 'limite de sessao do fornecedor', ultima_tarefa: 't1' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 3 });
  assert.equal(r.motivo_de_paragem.motivo, 'limite de sessao do fornecedor');
  assert.equal(r.primaria.n_pares_validos, 1, 'o que correu conta; o que nao correu nao e inventado');
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.deepEqual(r.fiabilidade.nao_corridas, ['t2', 't3']);
});

test('analise · paragem registada depois de todos os pares fechados: a corrida NAO se declara fechada', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'paragem', ts: 'x', motivo: 'R9' }]);
  assert.equal(r.corrida_fechou_os_pares, false);
});

test('analise · tarefa excluida SEM suplente fica em jogo e nao corrida: denominador e sempre o do prereg', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [{ evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree nao reconstruiu; suplentes esgotados' }, tentativa('t1', 'A'), tentativa('t1', 'B')];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 2 });
  assert.deepEqual(r.fiabilidade.nao_corridas, ['t2']);
  assert.equal(r.fiabilidade.tarefas_excluidas_antes_de_correr[0].suplente_usado, null);
});

// ── pre-voo (interpretacao 7) ──────────────────────────────────────────────

test('analise · tarefa que correu SEM pre_voo: marca e par invalido, consumo visivel', () => {
  const p = preregDe(['t1', 't2']);
  const r = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.ok(r.marcas.some((m) => m.tipo === 'pre_voo_ausente' && m.task_id === 't2'));
  const inv = r.fiabilidade.pares_invalidos.find((x) => x.task_id === 't2');
  assert.equal(inv.motivo, 'pre-voo ausente');
  assert.equal(inv.consumo_A_tokens, OPUS_TOTAL);
  assert.equal(r.por_tarefa[1].pre_voo_falhou, null);
});

test('analise · pre_voo que NAO falhou (tarefa ja verde) mas correu: marca e par invalido', () => {
  const p = preregDe(['t1']);
  const r = analisar(p, [preVoo('t1', { exit_code: 0, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.ok(r.marcas.some((m) => m.tipo === 'pre_voo_nao_falhou'));
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /ja verde/);
  assert.equal(r.por_tarefa[0].pre_voo_falhou, false);
  // so exit_code, sem `falhou`: exit != 0 conta como falhou
  const r2 = analisar(p, [preVoo('t1', { exit_code: 1, falhou: undefined }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r2.primaria.n_pares_validos, 1);
  const r3 = analisar(p, [preVoo('t1', { exit_code: 0, falhou: undefined }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r3.primaria.n_pares_validos, 0);
});

// ── arrancou (interpretacao 2) ─────────────────────────────────────────────

test('analise · passo local que nao arrancou e foi escalado: marca local_nao_arrancou, par VALIDO (a ultima tentativa arrancou)', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const ev = [tentativa('t1', 'A'), passoLocal('t1', { arrancou: false, motivo_se_nao: 'ollama: ECONNREFUSED', texto_local_sha256: undefined }), tentativa('t1', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0' })];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 1, 'os 7 pares T0 nao podem cair todos por o Ollama nao ter arrancado');
  const m = r.marcas.find((x) => x.tipo === 'local_nao_arrancou');
  assert.ok(m && m.task_id === 't1');
  assert.match(m.motivo, /arrancou=false · ollama: ECONNREFUSED/);
  assert.equal(r.por_tarefa[0].B.arrancou, true);
});

test('analise · passo local com arrancou null/omitido e texto_local_sha256: arrancou; sem texto: nao — e o motivo diz null, nao false', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const r = correr(p, [tentativa('t1', 'A'), passoLocal('t1', { arrancou: null, aceite: true })]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.marcas.filter((m) => m.tipo === 'local_nao_arrancou').length, 0);
  const r2 = correr(p, [tentativa('t1', 'A'), passoLocal('t1', { arrancou: null, texto_local_sha256: undefined })]);
  assert.equal(r2.primaria.n_pares_validos, 0);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /arrancou=null/);
  assert.doesNotMatch(r2.fiabilidade.pares_invalidos[0].motivo, /arrancou=false/);
});

test('analise · tentativa claude-p que nao arrancou seguida de escalacao que arrancou: par valido, marca tentativa_nao_arrancou', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B', { arrancou: false, aceite: false, modelUsage: undefined, usage: undefined, motivo_se_nao: 'spawn:EAGAIN' }), tentativa('t1', 'B', { tentativa: 2, e_escalacao: true })];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_nao_arrancou' && m.braco === 'B' && /EAGAIN/.test(m.motivo)));
  assert.equal(r.por_tarefa[0].B.tokens_opus, OPUS_TOTAL, 'a que nao arrancou vale 0, a escalacao vale a sonda');
  assert.deepEqual(r.por_tarefa[0].B.fontes, ['nao arrancou', 'json']);
});

test('analise · CUSTO-10 — par invalido sai da primaria mas o consumo do outro braco FICA; nao-arrancou = 0 (nao null)', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A'),                                                        // A correu e gastou
    tentativa('t2', 'B', { arrancou: false, aceite: false, modelUsage: undefined, usage: undefined, motivo_se_nao: 'spawn:ENOENT' }),
    { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' },
  ];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL, 'so t1 na primaria');
  const inv = r.fiabilidade.pares_invalidos;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].task_id, 't2');
  assert.equal(inv[0].braco_que_nao_arrancou, 'B');
  assert.equal(inv[0].consumo_A_tokens, OPUS_TOTAL, 'o gasto de A em t2 NAO desapareceu');
  assert.equal(inv[0].consumo_B_tokens, 0, 'nao arrancou = zero por construcao (interpretacao 3)');
  perto(inv[0].custo_cli_A_usd, SONDA.total_cost_usd, 1e-4);
  // MUT-4 do 2.o revisor: a segunda leitura de B nao pode ficar n/d por causa de um nao-arrancou
  assert.equal(r.secundaria.global.B.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL);
});

test('analise · par invalido em que o braco que correu ARRANCOU mas ficou sem JSON: a 2.a leitura e null (desconhecido), nao 0', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { modelUsage: undefined, usage: undefined, aceite: false }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, null, 'um desconhecido no somatorio da desconhecido');
});

// ── consumo desconhecido / transcript ──────────────────────────────────────

test('analise · CUSTO-07 — consumo desconhecido propaga null ate a valorizacao e marca, nao zera', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A', { modelUsage: undefined, usage: undefined, aceite: false, duration_ms: 900000, tokens_transcript: undefined }),   // estourou o tecto, sem JSON, sem transcript
    tentativa('t2', 'B'),
  ];
  const r = correr(p, ev);
  assert.equal(r.secundaria.global.A.tokens_opus_total, null, 'um null no somatorio da null');
  assert.equal(r.secundaria.global.A.por_aceite, null);
  assert.equal(r.secundaria.global.B.tokens_opus_total, 2 * OPUS_TOTAL, 'o braco B nao e afectado');
  const m = r.marcas.find((x) => x.tipo === 'consumo_desconhecido');
  assert.ok(m && m.task_id === 't2' && m.braco === 'A');
  assert.equal(m.transcript, null);
  assert.equal(r.por_tarefa[1].A.tokens_opus, null);
  assert.deepEqual(r.por_tarefa[1].A.fontes, ['desconhecido']);
  assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null);
  assert.equal(r.valorizacao.A.custo_cli_opus_usd, null);
  perto(r.valorizacao.B.valorizacao_teorica_usd, 2 * 0.58975, 1e-4);
});

test('analise · tecto sem JSON mas com tokens_transcript: o transcript e a fonte do total, marca consumo_do_transcript, valorizacao null', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { modelUsage: undefined, usage: undefined, aceite: false, tokens_transcript: 123456 }), tentativa('t1', 'B')]);
  assert.equal(r.por_tarefa[0].A.tokens_opus, 123456);
  assert.deepEqual(r.por_tarefa[0].A.fontes, ['transcript']);
  assert.equal(r.secundaria.global.A.tokens_opus_total, 123456);
  assert.equal(r.secundaria.global.A.por_categoria.cache_creation_1h, null, 'sem categorias');
  assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null);
  const m = r.marcas.find((x) => x.tipo === 'consumo_do_transcript');
  assert.ok(m && m.transcript === 123456);
  assert.equal(r.marcas.filter((x) => x.tipo === 'consumo_desconhecido').length, 0);
});

test('analise · divergencia JSON vs transcript > 1% e marcada com as duas fontes; o JSON prevalece', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { tokens_transcript: Math.round(OPUS_TOTAL * 1.05) }), tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'divergencia_json_vs_transcript');
  assert.ok(m, 'tem de marcar');
  assert.equal(m.json, OPUS_TOTAL);
  assert.equal(m.transcript, Math.round(OPUS_TOTAL * 1.05));
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL, 'o JSON prevalece para a metrica, como o prereg diz');
});

test('analise · reconciliacao falhada marca o par', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { usage: { ...SONDA.usage, output_tokens: 0 } }), tentativa('t1', 'B')]);
  assert.ok(r.marcas.some((x) => x.tipo === 'reconciliacao' && x.task_id === 't1' && x.braco === 'A'));
});

// ── CUSTO-06 e a fronteira do limiar ───────────────────────────────────────

test('analise · CUSTO-06 — zero aceites da INDEFINIDO, nunca zero nem infinito', () => {
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false }), tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false })]);
  assert.equal(r.secundaria.global.B.aceites, 0);
  assert.equal(r.secundaria.global.B.por_aceite, 'INDEFINIDO');
  assert.equal(r.secundaria.global.B.tokens_opus_total, 2 * OPUS_TOTAL, 'o total continua a existir — so a razao e indefinida');
  assert.equal(r.primaria.limiar_descritivo_cumprido, true, 'A=2/B=0 PASSA o limiar — e isso que o prereg diz que ele deixa passar');
});

test('analise · a fronteira do limiar e EXACTAMENTE -2: A-B=2 passa, A-B=3 nao', () => {
  const p = preregDe(['t1', 't2', 't3']);
  const tres = (bAceites) => [
    tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: bAceites >= 1 }),
    tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: bAceites >= 2 }),
    tentativa('t3', 'A'), tentativa('t3', 'B', { aceite: bAceites >= 3 }),
  ];
  assert.equal(correr(p, tres(1)).primaria.limiar_descritivo_cumprido, true, 'A=3 B=1: 1 >= 3-2');
  assert.equal(correr(p, tres(0)).primaria.limiar_descritivo_cumprido, false, 'A=3 B=0: 0 < 3-2');
});

test('analise · so_aceites_por_ambos com n=0 e null, nao zero (mutacao M3 do 1.o revisor)', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false })]);
  assert.deepEqual(r.secundaria.global.A.so_aceites_por_ambos, { n: 0, tokens_total: null, por_tarefa: null });
  assert.deepEqual(r.secundaria.global.B.so_aceites_por_ambos, { n: 0, tokens_total: null, por_tarefa: null });
});

// ── suplentes, orfas, duplicadas, ordem ────────────────────────────────────

test('analise · tarefa excluida no pre-voo e substituida pelo suplente; o tier do suplente vem do ledger', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou (ja verde)', suplente_usado: 's1' },
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('s1', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:10Z' }), tentativa('s1', 'B', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:00Z' }),
  ];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 2);
  assert.deepEqual(r.por_tarefa.map((t) => t.task_id), ['t1', 's1']);
  assert.equal(r.fiabilidade.tarefas_excluidas_antes_de_correr[0].suplente_usado, 's1');
  assert.equal(r.por_tarefa[1].suplente, true);
  assert.equal(r.por_tarefa[1].tier, 'T0', 'o tier do suplente nao esta no prereg; vem do ledger');
  assert.equal(r.por_tarefa[1].ordem_dos_bracos, 'A-depois-B', 'B arrancou primeiro');
  assert.equal(r.secundaria.por_tier.T0.n, 1, 'o suplente NAO desaparece do estrato');
  assert.equal(r.marcas.length, 0);
});

test('analise · suplente com tiers inconsistentes no ledger: marca, estrato n/d', () => {
  const p = preregDe(['t1']);
  const ev = [{ evento: 'tarefa_excluida', task_id: 't1', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A', { tier_classificado: 'T0' }), tentativa('s1', 'B', { tier_classificado: 'T3' })];
  const r = correr(p, ev);
  assert.ok(r.marcas.some((m) => m.tipo === 'tier_inconsistente' && m.task_id === 's1'));
  assert.equal(r.por_tarefa[0].tier, null);
  assert.equal(r.secundaria.por_tier['n/d'].n, 1);
});

test('analise · suplente em cadeia (t2 -> s1 -> s2): a tarefa em jogo e s2, e o consumo de s2 conta', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou', suplente_usado: 's1' },
    { evento: 'tarefa_excluida', task_id: 's1', motivo: 'worktree nao reconstruiu', suplente_usado: 's2' },
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('s2', 'A'), tentativa('s2', 'B'),
  ];
  const r = correr(p, ev);
  assert.deepEqual(r.por_tarefa.map((t) => t.task_id), ['t1', 's2']);
  assert.equal(r.primaria.n_pares_validos, 2);
  assert.equal(r.secundaria.global.A.tokens_opus_total, 2 * OPUS_TOTAL);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 0);
});

test('analise · suplente em ciclo (a -> b -> a) nao pendura a analise', () => {
  const p = preregDe(['a']);
  const r = analisar(p, [{ evento: 'tarefa_excluida', task_id: 'a', motivo: 'x', suplente_usado: 'b' }, { evento: 'tarefa_excluida', task_id: 'b', motivo: 'y', suplente_usado: 'a' }]);
  assert.ok(Array.isArray(r.por_tarefa));
});

test('analise · tentativa orfa (task_id fora do jogo) nao e descartada: consumo visivel e marca', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t1-typo', 'A')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
  assert.equal(r.fiabilidade.tentativas_orfas[0].task_id, 't1-typo');
  assert.equal(r.fiabilidade.tentativas_orfas[0].tokens_opus, OPUS_TOTAL);
  perto(r.fiabilidade.tentativas_orfas[0].custo_cli_usd, USD_SONDA, 1e-4);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_orfa' && m.task_id === 't1-typo'));
});

test('analise · tentativa_fim duplicada (mesmo task/braco/tentativa): fica a ULTIMA, a anterior vai para fiabilidade, marca', () => {
  const p = preregDe(['t1']);
  const ev = [tentativa('t1', 'A', { aceite: false }), tentativa('t1', 'B'), tentativa('t1', 'A', { aceite: true, duration_ms: 99 })];
  const r = correr(p, ev);
  assert.equal(r.por_tarefa[0].A.tentativas, 1, 'nao conta duas vezes');
  assert.equal(r.por_tarefa[0].A.aceite, true, 'fica a ultima');
  assert.equal(r.por_tarefa[0].A.duration_ms, 99);
  assert.equal(r.por_tarefa[0].A.tokens_opus, OPUS_TOTAL, 'tokens nao dobrados');
  assert.equal(r.fiabilidade.tentativas_duplicadas.length, 1);
  assert.equal(r.fiabilidade.tentativas_duplicadas[0].tokens_opus, OPUS_TOTAL);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_duplicada'));
});

test('analise · tentativas fora de ordem no ledger sao ordenadas por `tentativa` (MUT-1 do 2.o revisor)', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  // a escalacao (tentativa 2) escrita ANTES do passo local (tentativa 1)
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B', { tentativa: 2, e_escalacao: true, duration_ms: 4000 }), passoLocal('t1', { duration_ms: 3000 })];
  const r = correr(p, ev);
  const v = r.velocidade.por_tarefa[0];
  assert.deepEqual(v.B_duracoes_ms, [3000, 4000]);
  assert.equal(v.B_ate_verde_ms, 7000);
  assert.deepEqual(r.por_tarefa[0].B.fontes, ['local', 'json']);
});

// ── campos em falta no passo local ─────────────────────────────────────────

test('analise · passo local sem tokens_locais / modelo_reportado marca campo_em_falta; com modelUsage marca local_com_modelUsage', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const r = correr(p, [tentativa('t1', 'A'), passoLocal('t1', { aceite: true, tokens_locais: undefined, modelo_reportado: undefined })]);
  const m = r.marcas.find((x) => x.tipo === 'campo_em_falta' && x.braco === 'B');
  assert.ok(m); assert.equal(m.motivo, 'tokens_locais, modelo_reportado');
  const r2 = correr(p, [tentativa('t1', 'A'), passoLocal('t1', { aceite: true, modelUsage: SONDA.modelUsage })]);
  assert.ok(r2.marcas.some((x) => x.tipo === 'local_com_modelUsage'));
  assert.equal(r2.por_tarefa[0].B.tokens_opus, 0, 'continua zero por construcao');
});

test('analise · estado_vivo_sha null numa tentativa marca campo_em_falta', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { estado_vivo_sha: null }), tentativa('t1', 'B')]);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'estado_vivo_sha'));
  assert.equal(r.corrida_valida, true, 'um null nao e uma mudanca');
});

// ── custo do CLI, tecto, campos obrigatorios ───────────────────────────────

test('analise · custo_cli_opus_usd e custo_cli_total_usd divergem quando ha subagente (interpretacao 10)', () => {
  const mu = { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 } };
  const usage = { ...SONDA.usage, input_tokens: 1002, output_tokens: 504 };
  const r = correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: mu, usage, total_cost_usd: 0.59975 }), tentativa('t1', 'B')]);
  assert.equal(r.valorizacao.A.custo_cli_opus_usd, 0.5898, 'so o Opus, 4 casas');
  assert.equal(r.valorizacao.A.custo_cli_total_usd, 0.5998, 'a invocacao inteira, 4 casas');
});

test('analise · arredondamento SO a saida (interpretacao 13): USD 4 casas, razoes de tokens inteiras, Wilson 3 casas', () => {
  // 3 x 0.58975 = 1.76925 em bruto: se sair assim, nao foi arredondado
  const p = preregDe(['t1', 't2', 't3']);
  const r = correr(p, [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A'), tentativa('t2', 'B'),
    tentativa('t3', 'A', { modelUsage: undefined, usage: undefined, tokens_transcript: 1 }), tentativa('t3', 'B'),   // total A = 2*58970 + 1, 3 aceites -> 39313.67
  ]);
  const quatroCasas = (x) => Math.round(x * 1e4) / 1e4 === x;
  assert.ok(quatroCasas(r.valorizacao.B.valorizacao_teorica_usd), `${r.valorizacao.B.valorizacao_teorica_usd} nao tem 4 casas`);
  assert.ok(quatroCasas(r.valorizacao.B.custo_cli_opus_usd));
  assert.ok(quatroCasas(r.valorizacao.B.custo_cli_total_usd));
  assert.equal(r.secundaria.global.A.tokens_opus_total, 2 * OPUS_TOTAL + 1);
  assert.equal(r.secundaria.global.A.por_aceite, 39314, 'razao de tokens inteira');
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida, 39314);
  assert.equal(r.secundaria.global.A.so_aceites_por_ambos.por_tarefa, 39314);
  assert.ok(Number.isInteger(r.secundaria.global.A.por_aceite));
  assert.equal(r.primaria.wilson_A.lo, Math.round(r.primaria.wilson_A.lo * 1000) / 1000);
});

test('analise · o tecto do orcamento de cada tentativa FICA no resultado', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { tecto_do_orcamento: 'null=sem tecto' }), tentativa('t1', 'B', { tecto_do_orcamento: 'T2' })]);
  assert.deepEqual(r.por_tarefa[0].A.tecto_do_orcamento, ['null=sem tecto']);
  assert.deepEqual(r.por_tarefa[0].B.tecto_do_orcamento, ['T2']);
});

test('analise · TODOS os campos obrigatorios do pre-registo existem, mesmo com ledger vazio', () => {
  // CUSTO-17: publicar sempre, independentemente da direccao — inclusive sem dados
  const r = analisar(preregDe(['t1']), []);
  for (const k of ['primaria', 'secundaria', 'valorizacao', 'velocidade', 'fiabilidade', 'por_tarefa', 'marcas', 'motivo_de_paragem', 'prefixo_executado', 'corrida_valida', 'corrida_invalida_por', 'O_QUE_ISTO_NAO_CONCLUI']) {
    assert.ok(k in r, `falta ${k}`);
  }
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null, 'sem pares nao ha veredicto');
  assert.equal(r.primaria.ic95_tango, null);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.deepEqual(r.fiabilidade.nao_corridas, ['t1']);
  assert.equal(r.valorizacao.ROTULO_OBRIGATORIO, PRECOS.rotulo_obrigatorio_em_qualquer_visualizacao);
});

test('lerLedger · linhas invalidas sao contadas, nao engolidas', () => {
  const { eventos, linhasInvalidas } = lerLedger('{"evento":"x"}\nisto nao e json\n\n{"evento":"y"}\n');
  assert.equal(eventos.length, 2);
  assert.deepEqual(linhasInvalidas.map((l) => l.linha), [2]);
});
