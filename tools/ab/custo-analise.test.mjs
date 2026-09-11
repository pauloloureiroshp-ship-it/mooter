/**
 * custo-analise.test.mjs — a analise congelada, testada contra a forma REAL.
 *
 * A fixture `custo-fixture-sonda.json` e a saida integral de um `claude -p`
 * (result e session_id removidos). Nao e escrita a mao: uma fixture a mao mente,
 * e ja mentiu nesta casa — 28 testes verdes contra uma forma que o ficheiro
 * real nao tinha.
 *
 * Cada caso-limite abaixo foi nomeado pelo adversario ao pre-registo (CUSTO-06,
 * 07, 10, 11, 17) ou por um dos tres revisores pre-push que deram NO-SHIP.
 * Nao sao hipoteses minhas. A bancada constroi tentativas com TODAS as chaves
 * que o ledger obriga — porque um passo local `aceite:true` esteve aqui como
 * caso normal ate o 3.o revisor mostrar que era a manchete «o router poupa».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analisar, lerLedger, tokensOpusDaTentativa, reconciliar, valorizar, arrancouDaTentativa, aceiteContraditorio, problemasDoModelUsage, violacoesDeTipo, evidenciaDeArranque, naoArrancouPuro, CHAVES_OBRIGATORIAS, TIPOS_OBRIGATORIOS, PROVAS_DA_ACEITACAO } from './custo-analise.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SONDA = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-fixture-sonda.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-prereg.json'), 'utf8'));
const PRECOS = PREREG.metricas.yardstick_custo;

// ── bancada ────────────────────────────────────────────────────────────────

/** Um pre-registo minimo com N tarefas, para os testes nao dependerem das 20 reais. */
function preregDe(ids, tiers = {}, suplentes = ['s1', 's2', 's3']) {
  return {
    ...PREREG,
    corpus: { ...PREREG.corpus, suplentes, tarefas: ids.map((id, i) => ({ task_id: id, tier_classificado: tiers[id] || 'T3', ordem_dos_bracos: i % 2 ? 'B-depois-A' : 'A-depois-B' })) },
  };
}

/** Uma tentativa claude-p com a forma real da sonda e TODAS as chaves do ledger. `session_id` unico por tentativa, como o CLI o da. */
let nSessao = 0;
function tentativa(task_id, braco, over = {}) {
  return {
    evento: 'tentativa_fim', ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z', task_id, braco, tentativa: 1, e_escalacao: false,
    tier_classificado: 'T3', executor: 'claude-p', modelo_pedido: 'claude-opus-5', modelo_reportado: 'claude-opus-5',
    arrancou: true, motivo_se_nao: null,
    aceite: true, exit_code: 0, tests_corridos: 10, tests_passados: 10, skips: 0, test_file_sha_antes: 'tf', test_file_sha_depois: 'tf',
    usage: SONDA.usage, modelUsage: SONDA.modelUsage, total_cost_usd: SONDA.total_cost_usd, duration_ms: SONDA.duration_ms, session_id: `sess-${++nSessao}`,
    tokens_locais: null, texto_local_sha256: null,
    estado_vivo_sha: 'ev-1', tecto_do_orcamento: 'null=sem tecto', sentinela_presente: true,
    worktree_listagem_sha_antes: 'wa', worktree_listagem_sha_depois: 'wd',
    ...over,
  };
}

/** Um passo local, com a forma que o ledger escreve para o router-execute (campos do CLI a null). NUNCA aceite: e impossivel por construcao. */
function passoLocal(task_id, over = {}) {
  return tentativa(task_id, 'B', { tentativa: 1, executor: 'router-execute', modelo_pedido: 'ollama', modelo_reportado: 'qwen2.5:3b@sha256:abc',
    aceite: false, exit_code: 1, tests_passados: 3, arrancou: true, usage: null, modelUsage: null, total_cost_usd: null, session_id: null,
    tokens_locais: 900, texto_local_sha256: 'deadbeef', duration_ms: 3000, tier_classificado: 'T0', ...over });
}

/** Uma tentativa claude-p que NAO arrancou como o pre-registo define: spawn falhou, sem JSON, sem session_id, sem prova. */
const naoArrancou = (task_id, braco, over = {}) => tentativa(task_id, braco, { arrancou: false, motivo_se_nao: 'spawn:ENOENT', aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, skips: null,
  test_file_sha_antes: null, test_file_sha_depois: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: 50, session_id: null, ...over });

/** Escalacao para Opus depois do passo local. */
const escalacao = (task_id, over = {}) => tentativa(task_id, 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', ...over });

const preVoo = (task_id, over = {}) => ({ evento: 'pre_voo', task_id, exit_code: 1, falhou: true, ...over });

/** analisar() com pre_voo falhado para todas as tarefas que aparecem — o caminho normal. */
function correr(p, ev, opts) {
  const ids = new Set([...p.corpus.tarefas.map((t) => t.task_id), ...ev.filter((e) => e.evento === 'tentativa_fim').map((e) => e.task_id)]);
  const jaTem = new Set(ev.filter((e) => e.evento === 'pre_voo').map((e) => e.task_id));
  return analisar(p, [...[...ids].filter((id) => !jaTem.has(id)).map((id) => preVoo(id)), ...ev], opts);
}

/** Um par completo para uma tarefa do PREREG REAL, com a forma que o tier exige (T0: local + escalacao). */
function parReal(t, { aceiteB = true } = {}) {
  const h = t.tests_total_historico;
  const prova = (aceite) => (aceite ? { tests_corridos: h, tests_passados: h, exit_code: 0 } : { tests_corridos: h, tests_passados: h - 1, exit_code: 1 });
  const ev = [preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: t.tier_classificado, ...prova(true) })];
  if (t.tier_classificado === 'T0' || t.tier_classificado === 'T1') ev.push(passoLocal(t.task_id, { tier_classificado: t.tier_classificado }), escalacao(t.task_id, { tier_classificado: t.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  else ev.push(tentativa(t.task_id, 'B', { tier_classificado: t.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  return ev;
}

const OPUS_TOTAL = 2 + 4 + 58964 + 0;   // input + output + cache_creation + cache_read, da sonda
const USD_SONDA = SONDA.modelUsage['claude-opus-5'].costUSD;   // 0.58975
const perto = (a, b, tol, msg) => assert.ok(a !== null && Math.abs(a - b) < tol, `${msg || ''} ${a} vs ${b}`);
const tipos = (r) => r.marcas.map((m) => m.tipo);

// ── bancada: a propria bancada cumpre o contrato do ledger ─────────────────

test('bancada · tentativa() e passoLocal() trazem TODAS as chaves obrigatorias do ledger', () => {
  for (const t of [tentativa('t1', 'A'), passoLocal('t1'), escalacao('t1')]) {
    const faltam = CHAVES_OBRIGATORIAS.filter((c) => !(c in t));
    assert.deepEqual(faltam, [], `faltam ${faltam}`);
  }
  assert.equal(CHAVES_OBRIGATORIAS.length, 31);
});

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
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: null })), null);
  const z = tokensOpusDaTentativa(naoArrancou('t1', 'A'));
  assert.equal(z.total, 0); assert.equal(z.fonte, 'nao arrancou');
  assert.ok(naoArrancouPuro(naoArrancou('t1', 'A')));
  // interpretacao 3 (5.o revisor R5-2): nao-arrancou que NAO e spawn:* nao se zera — e desconhecido
  assert.equal(tokensOpusDaTentativa(naoArrancou('t1', 'A', { motivo_se_nao: 'cli_is_error:Reached max turns' })), null);
  assert.equal(tokensOpusDaTentativa(naoArrancou('t1', 'A', { motivo_se_nao: null })), null);
  assert.equal(tokensOpusDaTentativa(naoArrancou('t1', 'A', { session_id: 'abc' })), null, 'com session_id nao e nao-arrancou puro');
});

test('tokens · arrancou sem JSON mas com tokens_transcript > 0: o transcript e a fonte, categorias null; 0 e "nao encontrado"', () => {
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: null, usage: null, tokens_transcript: 123456 }));
  assert.equal(t.total, 123456); assert.equal(t.fonte, 'transcript');
  assert.equal(t.input, null); assert.equal(t.cache_creation_1h, null);
  assert.equal(valorizar(t, PRECOS), null, 'sem categorias nao se valoriza');
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: null, usage: null, tokens_transcript: 0 })), null, 'transcript 0 numa invocacao que arrancou nao e zero, e desconhecido');
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

test('tokens · sub-campo de tokens em falta ou null numa entrada Opus: consumo DESCONHECIDO (nao 0) e marca campo_em_falta (interpretacoes 12 e 20)', () => {
  const mu = { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, costUSD: 0.1 } };   // sem cacheCreation/cacheRead
  assert.deepEqual(problemasDoModelUsage(mu).campos, ['claude-opus-5.cacheCreationInputTokens', 'claude-opus-5.cacheReadInputTokens']);
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu })), null, 'nao se soma o que falta');
  const r = correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: mu, usage: { ...SONDA.usage } }), tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'campo_em_falta' && x.braco === 'A');
  assert.ok(m && m.task_id === 't1');
  assert.match(m.motivo, /cacheCreationInputTokens/);
  assert.ok(r.marcas.some((x) => x.tipo === 'consumo_desconhecido' && x.braco === 'A'));
  assert.equal(r.por_tarefa[0].A.tokens_opus, null);
  // P7I do 4.o revisor: sub-campos presentes mas null
  const muNull = { 'claude-opus-5': { inputTokens: null, outputTokens: null, cacheCreationInputTokens: null, cacheReadInputTokens: null, costUSD: 0 } };
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: muNull })), null);
  assert.equal(problemasDoModelUsage(muNull).campos.length, 4);
});

test('arrancou · passo local: true, ou null/omitido com texto_local_sha256; nunca pela definicao do CLI', () => {
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: true })), true);
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: null })), true, 'null + texto = arrancou');
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: undefined })), true);
  assert.equal(arrancouDaTentativa(passoLocal('t1', { arrancou: null, texto_local_sha256: null })), false);
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
    tentativa('t3', 'A', { tier_classificado: 'T0' }),
    passoLocal('t3'),
    escalacao('t3'),
  ];
  const r = correr(p, ev, { agora: '2026-09-11T00:00:00Z' });
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, true);
  assert.deepEqual(r.corrida_invalida_por, []);
  assert.deepEqual(r.validade_nd_porque, []);
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
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 3 * OPUS_TOTAL, 'sem invalidos, as leituras coincidem');
  assert.equal(r.secundaria.global.A.tokens_opus_total_todas_as_tentativas, 3 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.escalacoes, 1);
  assert.equal(r.secundaria.global.B.tokens_locais_a_parte, 900, 'so o router-execute conta; os 5000 perdidos em t1 nao');
  assert.equal(r.secundaria.global.A.por_aceite, OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.por_aceite, Math.round(3 * OPUS_TOTAL / 2));
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida_sobre_prereg, OPUS_TOTAL, 'a 3/3 coincidem');
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
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 3, de: 3, de_prereg: 3 });
  // sem ruido
  assert.equal(r.marcas.length, 0, JSON.stringify(r.marcas));
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  assert.deepEqual(r.fiabilidade.tentativas_orfas, []);
  assert.deepEqual(r.fiabilidade.tentativas_duplicadas, []);
  assert.deepEqual(r.fiabilidade.estado_vivo_shas_vistos, ['ev-1']);
  assert.deepEqual(r.fiabilidade.modelos_locais_vistos, ['qwen2.5:3b@sha256:abc']);
});

// ── prefixo, fecho, validade (os tres NO-SHIP) ─────────────────────────────

test('analise · 1.o NO-SHIP: 1 tarefa em 20 sem paragem NAO e corrida fechada', () => {
  const t0 = PREREG.corpus.tarefas[0];
  const r = analisar(PREREG, parReal(t0));
  assert.equal(r.marcas.length, 0, JSON.stringify(r.marcas));
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.fiabilidade.nao_corridas.length, 19, 'as 19 nao corridas nao sao pares invalidos');
  assert.equal(r.fiabilidade.pares_invalidos.length, 0);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 20, de_prereg: 20 });
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida_sobre_prereg, Math.round(OPUS_TOTAL / 20), 'a leitura /20 do prereg');
});

test('analise · 2.o NO-SHIP: sem corrida fechada NAO ha veredicto — limiar null, descritivo publicado com AVISO', () => {
  const [t0, t1] = PREREG.corpus.tarefas;
  const r = analisar(PREREG, parReal(t0));
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.match(r.primaria.veredicto_ausente_porque, /nao fechou/);
  assert.match(r.primaria.AVISO, /DESCRITIVO DO QUE CORREU/);
  assert.deepEqual(r.primaria.tabela_2x2.ambos, [t0.task_id], 'o descritivo do prefixo continua publicado');
  assert.ok(r.primaria.wilson_A && r.primaria.ic95_tango, 'Wilson e Tango descrevem o prefixo');
  const r2 = analisar(PREREG, [...parReal(t0, { aceiteB: false }), ...parReal(t1, { aceiteB: false })]);
  assert.equal(r2.primaria.aceites_A, 2); assert.equal(r2.primaria.aceites_B, 0);
  assert.equal(r2.primaria.limiar_descritivo_cumprido, null);
  for (const t of Object.values(r2.secundaria.por_tier)) assert.equal(t.primaria.limiar_descritivo_cumprido, null);
});

test('analise · 3.o NO-SHIP (L1): passo local ACEITE nas 7 T0 do prereg real — par invalido, corrida INVALIDA, sem veredicto', () => {
  // Antes: «corrida FECHADA · 20 validos · limiar cumprido · T0 7/7 com 0 tokens de Opus».
  // E a manchete «o router poupa» que a DECLARACAO_DE_DEGENERESCENCIA diz ser impossivel.
  const ev = [];
  for (const t of PREREG.corpus.tarefas) {
    if (t.tier_classificado === 'T0') ev.push(preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: 'T0', tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico }), passoLocal(t.task_id, { aceite: true }));
    else ev.push(...parReal(t));
  }
  const r = analisar(PREREG, ev);
  assert.equal(r.corrida_fechou_os_pares, true, 'fechou, sim — mas');
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /passo local aceite/.test(x.motivo)));
  assert.equal(r.corrida_invalida_por.find((x) => /passo local aceite/.test(x.motivo)).valores.length, 7);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.equal(r.primaria.n_pares_validos, 13, 'os 7 T0 sao invalidos');
  assert.equal(r.fiabilidade.pares_invalidos.length, 7);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /impossivel por construcao/);
  assert.equal(r.marcas.filter((m) => m.tipo === 'local_aceite').length, 7);
  assert.equal(r.secundaria.por_tier.T0.n, 0);
  assert.equal(r.secundaria.por_tier.T0.primaria.limiar_descritivo_cumprido, null);
});

test('analise · 3.o NO-SHIP (L4): suplente fora da lista, id do corpus, ou usado 2x — corrida INVALIDA, ids em jogo sem repetidos', () => {
  const p = preregDe(['t1', 't2', 't3']);
  // suplente = id do corpus (t1): 19 tarefas a fechar como 20/20
  const r1 = correr(p, [{ evento: 'tarefa_excluida', task_id: 't3', motivo: 'x', suplente_usado: 't1' }, tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r1.corrida_valida, false);
  assert.ok(r1.corrida_invalida_por.some((x) => /suplente fora do protocolo/.test(x.motivo)));
  assert.ok(r1.corrida_invalida_por.some((x) => /repetidas/.test(x.motivo)));
  assert.deepEqual(r1.por_tarefa.map((t) => t.task_id), ['t1', 't2'], 'sem repetidos');
  assert.equal(r1.primaria.n_pares_validos, 2, 't1 nao conta a dobrar');
  assert.equal(r1.prefixo_executado.de, 2); assert.equal(r1.prefixo_executado.de_prereg, 3);
  assert.equal(r1.primaria.limiar_descritivo_cumprido, null);
  assert.ok(r1.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /e id do corpus/.test(m.motivo)));
  // suplente fora da lista
  const r2 = correr(p, [{ evento: 'tarefa_excluida', task_id: 't3', motivo: 'x', suplente_usado: 'zzz' }, tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('zzz', 'A'), tentativa('zzz', 'B')]);
  assert.equal(r2.corrida_valida, false);
  assert.ok(r2.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /nao esta em corpus.suplentes/.test(m.motivo)));
  // o mesmo suplente para duas excluidas
  const r3 = correr(p, [{ evento: 'tarefa_excluida', task_id: 't2', motivo: 'x', suplente_usado: 's1' }, { evento: 'tarefa_excluida', task_id: 't3', motivo: 'y', suplente_usado: 's1' }, tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.equal(r3.corrida_valida, false);
  assert.ok(r3.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /usado mais de uma vez/.test(m.motivo)));
  assert.deepEqual(r3.por_tarefa.map((t) => t.task_id), ['t1', 's1']);
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
  const A = (id) => tentativa(id, 'A', { tier_classificado: 'T0' });
  const r = correr(p, [A('t1'), passoLocal('t1'), escalacao('t1'), A('t2'), passoLocal('t2', { modelo_reportado: 'qwen2.5:3b@sha256:OUTRO' }), escalacao('t2')]);
  assert.equal(r.corrida_valida, false);
  assert.match(r.corrida_invalida_por[0].motivo, /modelo local/);
  const r2 = correr(p, [A('t1'), passoLocal('t1', { sentinela_presente: false }), escalacao('t1'), A('t2'), passoLocal('t2'), escalacao('t2')]);
  assert.equal(r2.corrida_valida, false);
  assert.match(r2.corrida_invalida_por[0].motivo, /sentinela/);
  assert.deepEqual(r2.corrida_invalida_por[0].valores, ['t1/B/1']);
});

test('analise · 3.o NO-SHIP (L5): sentinela_presente null/omitido ou estado_vivo_sha em nenhuma tentativa — validade n/d, nao true; sem veredicto', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { sentinela_presente: null }), tentativa('t1', 'B')]);
  assert.equal(r.corrida_valida, null);
  assert.deepEqual(r.validade_nd_porque, ['tentativas sem sentinela_presente === true']);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.match(r.primaria.veredicto_ausente_porque, /validade da corrida n\/d/);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'sentinela_presente' && m.braco === 'A'));
  const r2 = correr(p, [tentativa('t1', 'A', { estado_vivo_sha: null }), tentativa('t1', 'B', { estado_vivo_sha: null })]);
  assert.equal(r2.corrida_valida, null);
  assert.deepEqual(r2.validade_nd_porque, ['nenhuma tentativa traz estado_vivo_sha']);
  // um so null, com outro presente: marca, mas validade true (um null nao e uma mudanca)
  const r3 = correr(p, [tentativa('t1', 'A', { estado_vivo_sha: null }), tentativa('t1', 'B')]);
  assert.equal(r3.corrida_valida, true);
  assert.ok(r3.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'estado_vivo_sha'));
});

test('analise · 3.o NO-SHIP (MUT-R2): tentativas orfas contam para a validade da corrida', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('orfa', 'A', { estado_vivo_sha: 'MUDOU', sentinela_presente: false })]);
  assert.equal(r.corrida_valida, false);
  assert.equal(r.corrida_invalida_por.length, 2);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
});

test('analise · 3.o NO-SHIP (L7): braco fora de {A,B} e orfa — consumo visivel, marca, nunca descartada', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t1', 'a')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
  assert.equal(r.fiabilidade.tentativas_orfas[0].braco, 'a');
  assert.equal(r.fiabilidade.tentativas_orfas[0].tokens_opus, OPUS_TOTAL);
  const m = r.marcas.find((x) => x.tipo === 'tentativa_orfa');
  assert.match(m.motivo, /braco "a" fora de \{A,B\}/);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_todas_as_tentativas, OPUS_TOTAL, 'a orfa tem braco "a", nao "A": nao entra em A');
});

test('analise · 3.o NO-SHIP (chaves omitidas): ledger.regra — chave omitida marca chave_omitida com a lista', () => {
  const p = preregDe(['t1']);
  const semChaves = tentativa('t1', 'A');
  delete semChaves.modelo_pedido; delete semChaves.worktree_listagem_sha_antes; delete semChaves.skips;
  const r = correr(p, [semChaves, tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'chave_omitida');
  assert.ok(m && m.braco === 'A');
  assert.equal(m.motivo, 'modelo_pedido, skips, worktree_listagem_sha_antes');
  assert.equal(r.primaria.n_pares_validos, 1, 'marca, nao invalida (nenhuma e prova da aceitacao)');
  // uma PROVA omitida e outra coisa: par invalido (interpretacao 12)
  const semProva = tentativa('t1', 'A'); delete semProva.tests_corridos;
  const r2 = correr(p, [semProva, tentativa('t1', 'B')]);
  assert.equal(r2.primaria.n_pares_validos, 0);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /aceite sem prova completa: tests_corridos/);
});

test('analise · 3.o NO-SHIP (protocolo de tentativas): A com 2, B com 3, B em T0 sem local, B em T3 com local — marca e par invalido', () => {
  const p = preregDe(['t1', 't2', 't3', 't4'], { t3: 'T0' });
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'A', { tentativa: 2, aceite: true }), tentativa('t1', 'B', { aceite: false }),         // A com 2: segunda oportunidade proibida
    tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t2', 'B', { tentativa: 2 }),                                          // B em T3 com 2
    tentativa('t3', 'A', { tier_classificado: 'T0' }), tentativa('t3', 'B', { tier_classificado: 'T0' }),                         // B em T0 sem passo local
    tentativa('t4', 'A'), passoLocal('t4', { tier_classificado: 'T3' }), escalacao('t4', { tier_classificado: 'T3' }),           // B em T3 com passo local
  ];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 0);
  const motivos = r.fiabilidade.pares_invalidos.map((x) => x.motivo);
  assert.match(motivos[0], /A com 2 tentativas/);
  assert.match(motivos[1], /B em T3 com 2 tentativas/);
  assert.match(motivos[2], /B em T0 sem passo local/);
  assert.match(motivos[3], /B em T3 com 2 tentativas e 1 passo/);
  assert.equal(r.marcas.filter((m) => m.tipo === 'tentativas_fora_do_protocolo').length, 4);
  assert.equal(r.fiabilidade.pares_invalidos[0].consumo_A_tokens, 2 * OPUS_TOTAL, 'o consumo das duas tentativas de A fica visivel');
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, true, 'protocolo de tentativas invalida o PAR, nao a corrida');
  // B com 3: `tentativa: 3` ja e tipo invalido (valores {1,2}) — apanhado ANTES do protocolo, e e a corrida que nao fica valida por causa de aceite/arrancou? nao: so `tentativa`. Par invalido, corrida valida.
  const r2 = correr(preregDe(['t1'], { t1: 'T0' }), [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1'), escalacao('t1', { aceite: false }), escalacao('t1', { tentativa: 3 })]);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /tipo invalido/);
  assert.ok(r2.marcas.some((m) => m.tipo === 'tipo_invalido' && /tentativa: 3 fora de/.test(m.motivo)));
  assert.ok(r2.marcas.some((m) => m.tipo === 'tentativas_fora_do_protocolo' && /B com 3 tentativas/.test(m.motivo)), 'a marca de protocolo existe na mesma');
  assert.equal(r2.corrida_valida, true);
});

test('analise · tier no ledger diferente do prereg marca tier_divergente (mesmo classify.js, mesmo prompt)', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'tier_divergente');
  assert.ok(m); assert.equal(m.motivo, 'prereg T3, ledger T0, T3');
  assert.equal(r.por_tarefa[0].tier, 'T3', 'o tier do prereg manda para as tarefas do corpus');
  assert.equal(r.corrida_valida, false, '5.o revisor R5-9: classify.js e o template estao congelados; divergir e tratamento diferente do pre-registado');
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
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
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
});

test('analise · par_invalido SEM nenhuma tentativa (spawn falhou no 1.o braco): e par invalido com o motivo do evento, nao "nao corrida"', () => {
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

test('analise · 3.o NO-SHIP (MUT-R1): pre_voo ausente E par_invalido na mesma tarefa — a marca de pre-voo e emitida na mesma', () => {
  const p = preregDe(['t1', 't2']);
  const r = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.ok(r.marcas.some((m) => m.tipo === 'pre_voo_ausente' && m.task_id === 't2'));
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT', 'o motivo do evento tem precedencia no par');
  // e a tarefa que SO tem par_invalido (spawn falhou no 1.o braco) tambem devia ter tido pre-voo
  const r2 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'pre_voo_ausente' && m.task_id === 't2'), 'pre-voo antes de qualquer braco, mesmo do que falhou no spawn');
});

test('analise · par_invalido com evento e tentativa em A: fecha o par, motivo do evento, veredicto sobre os validos', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT');
  assert.equal(r.primaria.limiar_descritivo_cumprido, true);
});

test('analise · CUSTO-11 — corrida que nao fechou publica o prefixo, o motivo, e nenhum veredicto', () => {
  const p = preregDe(['t1', 't2', 't3']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'paragem', ts: '2026-09-11T02:00:00Z', motivo: 'limite de sessao do fornecedor', ultima_tarefa: 't1' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 3, de_prereg: 3 });
  assert.equal(r.motivo_de_paragem.motivo, 'limite de sessao do fornecedor');
  assert.equal(r.primaria.n_pares_validos, 1);
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
  assert.deepEqual(r.prefixo_executado, { tarefas_com_alguma_tentativa: 1, de: 2, de_prereg: 2 });
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

test('analise · pre_voo que NAO falhou (tarefa ja verde) mas correu: marca e par invalido; `falhou` booleano manda, senao exit_code; fica o ULTIMO', () => {
  const p = preregDe(['t1']);
  const r = analisar(p, [preVoo('t1', { exit_code: 0, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.ok(r.marcas.some((m) => m.tipo === 'pre_voo_nao_falhou'));
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /ja verde/);
  assert.equal(r.por_tarefa[0].pre_voo_falhou, false);
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 1, falhou: undefined }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 1, 'so exit_code != 0');
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 0, falhou: undefined }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 0, 'so exit_code 0');
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 1, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 0, 'falhou:false vence exit_code 1');
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 0, falhou: false }), preVoo('t1', { exit_code: 1, falhou: true }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 1, 'o ultimo pre_voo vence (retoma)');
});

// ── arrancou (interpretacao 2) ─────────────────────────────────────────────

test('analise · passo local que nao arrancou e foi escalado: marca local_nao_arrancou, par VALIDO (a ultima tentativa arrancou)', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const ev = [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1', { arrancou: false, motivo_se_nao: 'ollama: ECONNREFUSED', texto_local_sha256: null }), escalacao('t1')];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 1, 'os 7 pares T0 nao podem cair todos por o Ollama nao ter arrancado');
  const m = r.marcas.find((x) => x.tipo === 'local_nao_arrancou');
  assert.ok(m && m.task_id === 't1');
  assert.match(m.motivo, /arrancou=false · ollama: ECONNREFUSED/);
  assert.equal(r.por_tarefa[0].B.arrancou, true);
});

test('analise · passo local com arrancou null/omitido e texto_local_sha256: arrancou; sem texto e sem escalacao: par invalido, motivo diz null', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const A = tentativa('t1', 'A', { tier_classificado: 'T0' });
  const r = correr(p, [A, passoLocal('t1', { arrancou: null }), escalacao('t1')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.marcas.filter((m) => m.tipo === 'local_nao_arrancou').length, 0);
  const r2 = correr(p, [A, passoLocal('t1', { arrancou: null, texto_local_sha256: null })]);
  assert.equal(r2.primaria.n_pares_validos, 0);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /arrancou=null/);
  assert.doesNotMatch(r2.fiabilidade.pares_invalidos[0].motivo, /arrancou=false/);
});

test('analise · 3.o NO-SHIP (MUT-R3): local arrancou + escalacao que NAO arrancou — o motivo fala da ULTIMA (arrancou=false), nao da primeira', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const r = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1'), naoArrancou('t1', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', motivo_se_nao: 'spawn:EAGAIN' })]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.fiabilidade.pares_invalidos[0].braco_que_nao_arrancou, 'B');
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /arrancou=false sem evento par_invalido · spawn:EAGAIN/);
  assert.equal(r.por_tarefa[0].B.arrancou, false);
});

test('analise · tentativa claude-p que nao arrancou seguida de escalacao que arrancou (T0, depois do local): par valido, marca tentativa_nao_arrancou', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  // T0: local, depois Opus que nao arrancou... o protocolo so permite 2 tentativas em B; este e o caso "escalacao nao arrancou" coberto acima.
  // Aqui: T3, A nao arrancou na unica tentativa -> par invalido; a marca existe.
  const r = correr(preregDe(['t1']), [naoArrancou('t1', 'A', { motivo_se_nao: 'spawn:EAGAIN' }), tentativa('t1', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_nao_arrancou' && m.braco === 'A' && /EAGAIN/.test(m.motivo)));
  assert.equal(r.por_tarefa[0].A.tokens_opus, 0, 'nao arrancou = zero');
  assert.deepEqual(r.por_tarefa[0].A.fontes, ['nao arrancou']);
  assert.ok(p, 'p usado acima');
});

test('analise · CUSTO-10 — par invalido sai da primaria mas o consumo do outro braco FICA; nao-arrancou = 0 (nao null)', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A'),
    naoArrancou('t2', 'B'),
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
  assert.equal(r.secundaria.global.B.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL);
});

test('analise · par invalido em que o braco que correu ARRANCOU mas ficou sem JSON: a 2.a leitura e null (desconhecido), nao 0', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { modelUsage: null, usage: null, aceite: false }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, null, 'um desconhecido no somatorio da desconhecido');
});

// ── consumo desconhecido / transcript ──────────────────────────────────────

test('analise · CUSTO-07 — consumo desconhecido propaga null ate a valorizacao e marca, nao zera', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A', { modelUsage: null, usage: null, aceite: false, duration_ms: 900000 }),   // estourou o tecto, sem JSON, sem transcript
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
  const r = correr(p, [tentativa('t1', 'A', { modelUsage: null, usage: null, aceite: false, tokens_transcript: 123456 }), tentativa('t1', 'B')]);
  assert.equal(r.por_tarefa[0].A.tokens_opus, 123456);
  assert.deepEqual(r.por_tarefa[0].A.fontes, ['transcript']);
  assert.equal(r.secundaria.global.A.tokens_opus_total, 123456);
  assert.equal(r.secundaria.global.A.por_categoria.cache_creation_1h, null, 'sem categorias');
  assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null);
  const m = r.marcas.find((x) => x.tipo === 'consumo_do_transcript');
  assert.ok(m && m.transcript === 123456);
  assert.equal(r.marcas.filter((x) => x.tipo === 'consumo_desconhecido').length, 0);
  // transcript 0: desconhecido, com o 0 ao lado
  const r2 = correr(p, [tentativa('t1', 'A', { modelUsage: null, usage: null, aceite: false, tokens_transcript: 0 }), tentativa('t1', 'B')]);
  const m2 = r2.marcas.find((x) => x.tipo === 'consumo_desconhecido');
  assert.ok(m2 && m2.transcript === 0);
  assert.equal(r2.por_tarefa[0].A.tokens_opus, null);
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

test('analise · tarefa excluida no pre-voo e substituida pelo suplente; o tier do suplente vem do ledger; a ordem de ts_inicio', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [
    preVoo('t2', { exit_code: 0, falhou: false }),   // o pre-voo PASSOU: e por isso que t2 e excluida
    { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou (ja verde)', suplente_usado: 's1' },
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('s1', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:15Z' }), passoLocal('s1', { ts_inicio: '2026-09-11T00:00:00Z' }), escalacao('s1', { ts_inicio: '2026-09-11T00:00:05Z', ts_fim: '2026-09-11T00:00:09Z' }),
  ];
  const r = correr(p, ev);
  assert.equal(r.primaria.n_pares_validos, 2);
  assert.deepEqual(r.por_tarefa.map((t) => t.task_id), ['t1', 's1']);
  assert.equal(r.fiabilidade.tarefas_excluidas_antes_de_correr[0].suplente_usado, 's1');
  assert.equal(r.por_tarefa[1].suplente, true);
  assert.equal(r.por_tarefa[1].tier, 'T0', 'o tier do suplente nao esta no prereg; vem do ledger');
  assert.equal(r.por_tarefa[1].ordem_dos_bracos, 'A-depois-B', 'B arrancou primeiro');
  assert.equal(r.secundaria.por_tier.T0.n, 1, 'o suplente NAO desaparece do estrato');
  assert.equal(r.corrida_valida, true);
  assert.equal(r.marcas.length, 0, JSON.stringify(r.marcas));
});

test('analise · suplente com tiers inconsistentes no ledger: marca, estrato n/d; sem tier nenhum: tier_desconhecido', () => {
  const p = preregDe(['t1']);
  const ev = [{ evento: 'tarefa_excluida', task_id: 't1', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A', { tier_classificado: 'T0' }), tentativa('s1', 'B', { tier_classificado: 'T3' })];
  const r = correr(p, ev);
  assert.ok(r.marcas.some((m) => m.tipo === 'tier_inconsistente' && m.task_id === 's1'));
  assert.equal(r.por_tarefa[0].tier, null);
  assert.equal(r.secundaria.por_tier['n/d'].n, 1);
  const r2 = correr(p, [{ evento: 'tarefa_excluida', task_id: 't1', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A', { tier_classificado: null }), tentativa('s1', 'B', { tier_classificado: null })]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'tier_desconhecido'));
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
  assert.equal(r.corrida_valida, true);
});

test('analise · suplente em ciclo (a -> b -> a) nao pendura a analise', () => {
  const p = preregDe(['a'], {}, ['b']);
  const r = analisar(p, [{ evento: 'tarefa_excluida', task_id: 'a', motivo: 'x', suplente_usado: 'b' }, { evento: 'tarefa_excluida', task_id: 'b', motivo: 'y', suplente_usado: 'a' }]);
  assert.ok(Array.isArray(r.por_tarefa));
});

test('analise · tentativa orfa (task_id fora do jogo) nao e descartada: consumo visivel e marca; entra em todas_as_tentativas', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t1-typo', 'A')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
  assert.equal(r.fiabilidade.tentativas_orfas[0].task_id, 't1-typo');
  assert.equal(r.fiabilidade.tentativas_orfas[0].tokens_opus, OPUS_TOTAL);
  perto(r.fiabilidade.tentativas_orfas[0].custo_cli_usd, USD_SONDA, 1e-4);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_orfa' && m.task_id === 't1-typo'));
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_todas_as_tentativas, 2 * OPUS_TOTAL, 'a orfa entra na leitura "todas as tentativas"');
});

test('analise · tentativa_fim duplicada: replica byte-identica fica uma e marca; conteudo DIFERENTE e retoma-ate-verde (5.o revisor R5-3) — par invalido, corrida INVALIDA', () => {
  const p = preregDe(['t1']);
  // replica identica (o ledger foi escrito 2x pela mesma linha): benigno
  const a = tentativa('t1', 'A');
  const r = correr(p, [a, tentativa('t1', 'B'), { ...a }]);
  assert.equal(r.por_tarefa[0].A.tentativas, 1, 'nao conta duas vezes');
  assert.equal(r.fiabilidade.tentativas_duplicadas.length, 1);
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_duplicada'));
  assert.equal(r.corrida_valida, true);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.secundaria.global.A.tokens_opus_total_todas_as_tentativas, 2 * OPUS_TOTAL, 'os 58970 da replica nao desaparecem desta leitura');
  // conteudo diferente: B falhou, controlador reiniciado reescreve (task, B, 1) com aceite:true — vira o «NAO cumprido» em «cumprido»
  const r2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B', { aceite: true, duration_ms: 99 })]);
  assert.equal(r2.corrida_valida, false);
  assert.ok(r2.corrida_invalida_por.some((x) => /tentativa repetida por cima/.test(x.motivo)));
  assert.ok(r2.marcas.some((m) => m.tipo === 'tentativa_repetida'));
  assert.equal(r2.primaria.n_pares_validos, 0);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /tentativa repetida/);
  assert.equal(r2.primaria.limiar_descritivo_cumprido, null);
  assert.equal(r2.por_tarefa[0].B.aceite, true, 'fica a ultima para contabilidade — mas o par nao vale');
  assert.equal(r2.fiabilidade.tentativas_duplicadas[0].tokens_opus, OPUS_TOTAL, 'a anterior fica em fiabilidade');
});

test('analise · tentativas fora de ordem no ledger sao ordenadas por `tentativa` (MUT-1 do 2.o revisor)', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const ev = [tentativa('t1', 'A', { tier_classificado: 'T0' }), escalacao('t1', { duration_ms: 4000 }), passoLocal('t1', { duration_ms: 3000 })];
  const r = correr(p, ev);
  const v = r.velocidade.por_tarefa[0];
  assert.deepEqual(v.B_duracoes_ms, [3000, 4000]);
  assert.equal(v.B_ate_verde_ms, 7000);
  assert.deepEqual(r.por_tarefa[0].B.fontes, ['local', 'json']);
  assert.equal(r.primaria.n_pares_validos, 1, 'ordenado, o protocolo esta cumprido');
});

// ── campos em falta no passo local ─────────────────────────────────────────

test('analise · passo local sem tokens_locais / modelo_reportado marca campo_em_falta; com modelUsage marca local_com_modelUsage', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const A = tentativa('t1', 'A', { tier_classificado: 'T0' });
  const r = correr(p, [A, passoLocal('t1', { tokens_locais: null, modelo_reportado: null }), escalacao('t1')]);
  const m = r.marcas.find((x) => x.tipo === 'campo_em_falta' && x.braco === 'B');
  assert.ok(m); assert.equal(m.motivo, 'tokens_locais, modelo_reportado');
  const r2 = correr(p, [A, passoLocal('t1', { modelUsage: SONDA.modelUsage }), escalacao('t1')]);
  assert.ok(r2.marcas.some((x) => x.tipo === 'local_com_modelUsage'));
  assert.equal(r2.por_tarefa[0].B.tokens_opus, OPUS_TOTAL, 'so a escalacao; o local continua zero por construcao');
});

// ── custo do CLI, tecto, arredondamento, campos obrigatorios ───────────────

test('analise · custo_cli_opus_usd e custo_cli_total_usd divergem quando ha subagente (interpretacao 10)', () => {
  const mu = { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 } };
  const usage = { ...SONDA.usage, input_tokens: 1002, output_tokens: 504 };
  const r = correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: mu, usage, total_cost_usd: 0.59975 }), tentativa('t1', 'B')]);
  assert.equal(r.valorizacao.A.custo_cli_opus_usd, 0.5898, 'so o Opus, 4 casas');
  assert.equal(r.valorizacao.A.custo_cli_total_usd, 0.5998, 'a invocacao inteira, 4 casas');
});

test('analise · arredondamento SO a saida (interpretacao 13): USD 4 casas, razoes de tokens inteiras, Wilson 3 casas', () => {
  const p = preregDe(['t1', 't2', 't3']);
  const r = correr(p, [
    tentativa('t1', 'A'), tentativa('t1', 'B'),
    tentativa('t2', 'A'), tentativa('t2', 'B'),
    tentativa('t3', 'A', { modelUsage: null, usage: null, tokens_transcript: 1 }), tentativa('t3', 'B'),   // total A = 2*58970 + 1, 3 aceites -> 39313.67
  ]);
  const quatroCasas = (x) => Math.round(x * 1e4) / 1e4 === x;
  assert.ok(quatroCasas(r.valorizacao.B.valorizacao_teorica_usd), `${r.valorizacao.B.valorizacao_teorica_usd} nao tem 4 casas`);
  assert.ok(quatroCasas(r.valorizacao.B.custo_cli_opus_usd));
  assert.ok(quatroCasas(r.valorizacao.B.custo_cli_total_usd));
  assert.equal(r.secundaria.global.A.tokens_opus_total, 2 * OPUS_TOTAL + 1);
  assert.equal(r.secundaria.global.A.por_aceite, 39314, 'razao de tokens inteira');
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida, 39314);
  assert.equal(r.secundaria.global.A.so_aceites_por_ambos.por_tarefa, 39314);
  assert.equal(r.primaria.wilson_A.lo, Math.round(r.primaria.wilson_A.lo * 1000) / 1000);
});

test('analise · o tecto do orcamento de cada tentativa FICA no resultado', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { tecto_do_orcamento: 'null=sem tecto' }), tentativa('t1', 'B', { tecto_do_orcamento: 'T2' })]);
  assert.deepEqual(r.por_tarefa[0].A.tecto_do_orcamento, ['null=sem tecto']);
  assert.deepEqual(r.por_tarefa[0].B.tecto_do_orcamento, ['T2']);
});

test('analise · TODOS os campos obrigatorios do pre-registo existem, mesmo com ledger vazio', () => {
  const r = analisar(preregDe(['t1']), []);
  for (const k of ['primaria', 'secundaria', 'valorizacao', 'velocidade', 'fiabilidade', 'por_tarefa', 'marcas', 'motivo_de_paragem', 'prefixo_executado', 'corrida_valida', 'corrida_invalida_por', 'validade_nd_porque', 'O_QUE_ISTO_NAO_CONCLUI']) {
    assert.ok(k in r, `falta ${k}`);
  }
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null, 'sem pares nao ha veredicto');
  assert.equal(r.primaria.ic95_tango, null);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.corrida_valida, null, 'sem tentativas a validade e n/d, nao true');
  assert.deepEqual(r.fiabilidade.nao_corridas, ['t1']);
  assert.equal(r.valorizacao.ROTULO_OBRIGATORIO, PRECOS.rotulo_obrigatorio_em_qualquer_visualizacao);
  assert.ok(Array.isArray(tipos(r)));
});

// ── 4.o NO-SHIP: contrato de tipo, coerencia da aceitacao, modelUsage sem Opus, par_invalido/excluida contraditorios ──

test('tipos · violacoesDeTipo: string em bool, negativo, fora de {T0..T3}, tentativa 3, array em object', () => {
  assert.deepEqual(violacoesDeTipo(tentativa('t1', 'A')), []);
  assert.deepEqual(violacoesDeTipo(passoLocal('t1')), []);
  const v = violacoesDeTipo(tentativa('t1', 'A', { aceite: 'true', arrancou: 1, tentativa: '1', duration_ms: -5, tier_classificado: 'T9', executor: 'bash', usage: [] }));
  assert.ok(v.some((x) => x.startsWith('aceite: string')));
  assert.ok(v.some((x) => x.startsWith('arrancou: number')));
  assert.ok(v.some((x) => x.startsWith('tentativa: string')));
  assert.ok(v.some((x) => /duration_ms: negativo/.test(x)));
  assert.ok(v.some((x) => /tier_classificado: "T9" fora de/.test(x)));
  assert.ok(v.some((x) => /executor: "bash" fora de/.test(x)));
  assert.ok(v.some((x) => x.startsWith('usage: array')));
  assert.equal(Object.keys(TIPOS_OBRIGATORIOS).length, CHAVES_OBRIGATORIAS.length, 'cada chave obrigatoria tem contrato de tipo');
  assert.deepEqual(violacoesDeTipo(tentativa('t1', 'A', { task_id: null })), ['task_id: null nao permitido']);
});

test('analise · 4.o NO-SHIP (P7A/B/C): aceite null ou "true" em todas — par invalido, corrida INVALIDA em tipo, sem veredicto', () => {
  const p = preregDe(['t1', 't2']);
  const todos = (over) => [tentativa('t1', 'A', over), tentativa('t1', 'B', over), tentativa('t2', 'A', over), tentativa('t2', 'B', over)];
  // P7A: aceite null (controlador morreu na aceitacao e escreveu null como ledger.regra manda)
  const rA = correr(p, todos({ aceite: null }));
  assert.equal(rA.primaria.n_pares_validos, 0);
  assert.equal(rA.primaria.limiar_descritivo_cumprido, null);
  assert.equal(rA.marcas.filter((m) => m.tipo === 'campo_em_falta' && m.motivo === 'aceite').length, 4);
  assert.match(rA.fiabilidade.pares_invalidos[0].motivo, /aceite null/);
  assert.equal(rA.corrida_fechou_os_pares, true);
  // P7C: so A com aceite null (morte assimetrica que favorece B)
  const rC = correr(p, [tentativa('t1', 'A', { aceite: null }), tentativa('t1', 'B'), tentativa('t2', 'A', { aceite: null }), tentativa('t2', 'B')]);
  assert.equal(rC.primaria.n_pares_validos, 0);
  assert.equal(rC.primaria.limiar_descritivo_cumprido, null);
  // P7B: aceite "true" (string) — tipo invalido em aceite -> corrida INVALIDA
  const rB = correr(p, todos({ aceite: 'true' }));
  assert.equal(rB.corrida_valida, false);
  assert.ok(rB.corrida_invalida_por.some((x) => /tipo invalido em aceite\/arrancou/.test(x.motivo)));
  assert.equal(rB.primaria.limiar_descritivo_cumprido, null);
  assert.equal(rB.marcas.filter((m) => m.tipo === 'tipo_invalido').length, 4);
  assert.equal(rB.por_tarefa[0].A.aceite, false, 'a string "true" NAO e aceite');
  assert.equal(rB.primaria.aceites_A, 0);
  // tipo invalido noutra chave: par invalido, corrida valida
  const rD = correr(p, [tentativa('t1', 'A', { duration_ms: '4471' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(rD.corrida_valida, true);
  assert.equal(rD.primaria.n_pares_validos, 1);
  assert.match(rD.fiabilidade.pares_invalidos[0].motivo, /tipo invalido/);
});

test('analise · 4.o NO-SHIP (P7D/P7J): claude-p com modelUsage sem Opus (outro modelo, ou {}) — consumo desconhecido, par invalido, corrida INVALIDA', () => {
  const p = preregDe(['t1', 't2']);
  const semOpus = { 'claude-sonnet-4-5': { inputTokens: 2, outputTokens: 4, cacheCreationInputTokens: 58964, cacheReadInputTokens: 0, costUSD: 0.1 } };
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: semOpus }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /sem Opus no modelUsage/.test(x.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'sem_opus_no_modelUsage' && /claude-sonnet-4-5/.test(m.motivo)));
  assert.equal(r.por_tarefa[0].B.tokens_opus, null, 'desconhecido, nao zero');
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  // P7J: modelUsage {} com arrancou true
  const rJ = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: {} }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(rJ.corrida_valida, false);
  assert.equal(rJ.por_tarefa[0].B.tokens_opus, null);
  assert.ok(rJ.marcas.some((m) => m.tipo === 'consumo_desconhecido' && m.braco === 'B'));
});

test('analise · 4.o NO-SHIP (P7E): braco A com executor router-execute — fora do protocolo, par invalido', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [passoLocal('t1', { braco: 'A', tier_classificado: 'T3', aceite: false }), tentativa('t1', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /A com executor "router-execute"/);
});

test('analise · 4.o NO-SHIP (P7F): par_invalido numa tarefa em que os dois bracos arrancaram — contraditorio, corrida INVALIDA', () => {
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'inventado' }]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /par_invalido contraditorio/.test(x.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'par_invalido_contraditorio' && m.task_id === 't2'));
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  // e o par_invalido legitimo (B nao arrancou) continua a nao invalidar a corrida
  const r2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(r2.corrida_valida, true);
});

test('analise · 4.o NO-SHIP (P7G): tarefa_excluida DEPOIS de ter tentativas (substituicao por resultado) — corrida INVALIDA', () => {
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }),
    { evento: 'tarefa_excluida', task_id: 't2', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /DEPOIS de ter tentativas/.test(m.motivo)));
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
});

test('analise · 4.o NO-SHIP (P7H): aceite:true com prova contraditoria (exit 1, sha mudou, passados > corridos, < historico) — corrida INVALIDA', () => {
  assert.equal(aceiteContraditorio(tentativa('t1', 'A'), 10), null);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { exit_code: 1 }), 10), /exit_code=1/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { test_file_sha_depois: 'OUTRO' }), 10), /test_file_sha antes!=depois/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { tests_passados: 99 }), 10), /tests_passados 99 > tests_corridos 10/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A'), 55), /tests_corridos 10 < historico 55/);
  assert.equal(aceiteContraditorio(tentativa('t1', 'A'), null), null, 'sem historico (suplente) nao se compara ao historico');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { exit_code: null, test_file_sha_antes: null, tests_passados: null }), 10), null, 'null nao contradiz');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { aceite: false }), 10), /aceite=false com exit_code 0/);
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, exit_code: 1 }), 10), null);
  assert.equal(aceiteContraditorio(passoLocal('t1', { aceite: false, exit_code: 0 }), 10), null, 'passo local nao se avalia aqui');
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { test_file_sha_depois: 'OUTRO' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.marcas.some((m) => m.tipo === 'aceite_contraditorio' && m.braco === 'B'));
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /aceite contraditorio/);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  // com o prereg real: historico 55 e testes a 10 -> contraditorio
  const t0 = PREREG.corpus.tarefas.find((t) => t.tier_classificado === 'T3');
  const rr = analisar(PREREG, [preVoo(t0.task_id), tentativa(t0.task_id, 'A', { tier_classificado: 'T3' }), tentativa(t0.task_id, 'B', { tier_classificado: 'T3' })]);
  assert.ok(rr.marcas.some((m) => m.tipo === 'aceite_contraditorio' && /historico/.test(m.motivo)));
});

test('analise · 4.o NO-SHIP (P7K): T0 com passo local nao aceite e SEM escalacao — escalacao_em_falta, par invalido', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const r = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /escalacao_em_falta/);
  assert.equal(r.corrida_valida, true);
});

test('analise · 4.o NO-SHIP (MUT-A): corrida fechada e valida com 0 pares validos — veredicto null, nao true', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'A', { tentativa: 2 }), tentativa('t1', 'B')]);   // A com 2: par invalido
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, true);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.equal(r.primaria.veredicto_ausente_porque, 'sem pares validos');
  assert.equal(r.secundaria.global.A.tokens_opus_total, null, 'sem validos, o total e null');
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL, 'mas o consumo do invalido esta na 2.a leitura');
  assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null);
});

test('analise · 4.o NO-SHIP (MUT-B): claude-p com arrancou null e sem JSON — consumo DESCONHECIDO (null), nao zero; marca campo_em_falta', () => {
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { arrancou: null, modelUsage: null, usage: null, session_id: null })), null);
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { arrancou: null, modelUsage: null, usage: null, session_id: null, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B')]);
  assert.equal(r.por_tarefa[0].A.tokens_opus, null);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'arrancou'));
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_nao_arrancou'));
  assert.equal(r.primaria.n_pares_validos, 0);
});

// ── 5.o NO-SHIP: arrancou por evidencia, prova obrigatoria, repetida, session_id, tokens zero, vacuo ──

test('analise · 5.o NO-SHIP (R5-1): arrancou:false com session_id/modelUsage na mesma linha — a invocacao CHEGOU; contraditorio, corrida INVALIDA', () => {
  // E o que sai de reutilizar validarCorrida() do R-24: is_error:true (max turns) -> invalido -> arrancou:false, com o JSON inteiro ao lado.
  const p = preregDe(['t1', 't2', 't3']);
  const falhaB = (id, over = {}) => tentativa(id, 'B', { arrancou: false, motivo_se_nao: 'cli_is_error:Reached max turns', aceite: false, exit_code: 1, tests_passados: 9, ...over });
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /arrancou contradiz a evidencia/.test(x.motivo)));
  const m = r.marcas.find((x) => x.tipo === 'arrancou_contraditorio');
  assert.ok(m && m.task_id === 't3' && m.braco === 'B');
  assert.match(m.motivo, /session_id\+modelUsage/);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null, 'antes: 2 validos, A 2 B 2, cumprido — a falha de B saia da primaria');
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /contradiz a evidencia/, 'o motivo do par diz a contradicao, nao «nao arrancou»');
  assert.equal(r.por_tarefa[2].B.tokens_opus, OPUS_TOTAL, 'o consumo da invocacao que chegou conta');
  assert.ok(evidenciaDeArranque(falhaB('x')));
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { session_id: null })), 'so modelUsage chega');
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { modelUsage: null })), 'so session_id chega');
  assert.ok(!evidenciaDeArranque(tentativa('x', 'A', { session_id: null, modelUsage: null })));
  assert.ok(!evidenciaDeArranque(passoLocal('x')), 'o passo local nao entra aqui');
  // e cada sinal sozinho e apanhado na analise
  const r3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3', { session_id: null })]);
  assert.ok(r3.marcas.some((x) => x.tipo === 'arrancou_contraditorio' && /tem modelUsage:/.test(x.motivo)));
  const r4 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3', { modelUsage: null, usage: null })]);
  assert.ok(r4.marcas.some((x) => x.tipo === 'arrancou_contraditorio' && /tem session_id:/.test(x.motivo)));
  // e com evento par_invalido por cima: contraditorio na mesma (21 por evidencia)
  const r2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3'), { evento: 'par_invalido', task_id: 't3', braco: 'B', motivo: 'cli_is_error' }]);
  assert.equal(r2.corrida_valida, false);
  assert.ok(r2.marcas.some((x) => x.tipo === 'par_invalido_contraditorio'));
});

test('analise · 5.o NO-SHIP (R5-2): arrancou:false com campos null e motivo fora de spawn:* — fora da definicao, consumo desconhecido, corrida INVALIDA', () => {
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B', { motivo_se_nao: 'cli_is_error:Reached max turns' }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'cli_is_error' }]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /fora da definicao/.test(x.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && m.task_id === 't2'));
  assert.equal(r.por_tarefa[1].B.tokens_opus, null, 'nao se zera o que nao e spawn:*');
  assert.ok(r.marcas.some((m) => m.tipo === 'consumo_desconhecido' && /nao se zera/.test(m.motivo)));
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  // o nao-arrancou LEGITIMO (spawn:*) continua a nao invalidar a corrida
  const r2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(r2.corrida_valida, true);
  assert.equal(r2.por_tarefa[1].B.tokens_opus, 0);
  // timeout tambem nao e nao-arrancou (tem transcript)
  const r3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B', { motivo_se_nao: 'timeout' })]);
  assert.equal(r3.corrida_valida, false);
});

test('analise · 5.o NO-SHIP (R5-4/R5-4b): aceite:true sem prova (tudo null, ou so as contagens null) — campo_em_falta e par invalido', () => {
  const p = preregDe(['t1', 't2']);
  const semNada = { exit_code: null, test_file_sha_antes: null, test_file_sha_depois: null, tests_corridos: null, tests_passados: null };
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', semNada), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /aceite sem prova completa: exit_code, test_file_sha_antes/);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && /provas da aceitacao/.test(m.motivo)));
  // R5-4b: correrAceitacao() do R-24 devolve {aceite,status,sinal} e nada mais — as contagens exigem codigo novo
  const r2 = correr(p, [tentativa('t1', 'A', { tests_corridos: null, tests_passados: null, skips: null }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r2.primaria.n_pares_validos, 1);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /tests_corridos, tests_passados/);
  assert.equal(r2.corrida_valida, true, 'prova em falta invalida o PAR, nao a corrida');
  // numa tentativa que NAO chegou, as provas a null nao marcam
  const r3 = correr(p, [tentativa('t1', 'A'), naoArrancou('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r3.marcas.filter((m) => /provas da aceitacao/.test(m.motivo)).length, 0);
  assert.equal(PROVAS_DA_ACEITACAO.length, 5);
});

test('analise · 5.o NO-SHIP (R5-5): veredicto VACUO quando aceites_A - 2 <= 0 — flag e AVISO, o CLI diz', () => {
  const p = preregDe(['t1', 't2', 't3', 't4']);
  // B partido em 2 de 4 (spawn legitimo) -> 2 validos, A 2 B 0 -> cumprido por aritmetica
  const r = correr(p, [
    tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }),
    tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }),
    tentativa('t3', 'A'), naoArrancou('t3', 'B'), { evento: 'par_invalido', task_id: 't3', braco: 'B', motivo: 'spawn:ENOENT' },
    tentativa('t4', 'A'), naoArrancou('t4', 'B'), { evento: 'par_invalido', task_id: 't4', braco: 'B', motivo: 'spawn:ENOENT' },
  ]);
  assert.equal(r.primaria.limiar_descritivo_cumprido, true, 'o prereg admite: A=2/B=0 passa');
  assert.equal(r.primaria.veredicto_vacuo, true);
  assert.match(r.primaria.AVISO_VACUO, /verdadeiro por aritmetica/);
  assert.match(r.primaria.AVISO_N, /2 pares validos, nao sobre os 4/);
  // com A=3 nao e vacuo
  const r2 = correr(preregDe(['t1', 't2', 't3']), [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), tentativa('t3', 'B')]);
  assert.equal(r2.primaria.veredicto_vacuo, false);
  assert.equal(r2.primaria.AVISO_VACUO, null);
  assert.equal(r2.primaria.AVISO_N, null);
});

test('analise · 5.o NO-SHIP (R5-6): session_id repetido entre tentativas — a mesma invocacao contada 2x, corrida INVALIDA', () => {
  const p = preregDe(['t1']);
  const a = tentativa('t1', 'A');
  const r = correr(p, [a, tentativa('t1', 'B', { session_id: a.session_id })]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /session_id repetido/.test(x.motivo)));
  assert.equal(r.marcas.filter((m) => m.tipo === 'session_id_repetido').length, 2);
});

test('analise · 5.o NO-SHIP (R5-7): modelUsage Opus com tokens todos a zero numa claude-p — consumo desconhecido, marca tokens_zero_com_arrancou', () => {
  const zeros = { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } };
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: zeros })), null);
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: zeros, usage: { ...SONDA.usage, input_tokens: 0, output_tokens: 0 } })]);
  assert.equal(r.por_tarefa[0].B.tokens_opus, null);
  assert.ok(r.marcas.some((m) => m.tipo === 'tokens_zero_com_arrancou' && m.braco === 'B'));
  assert.equal(r.secundaria.global.B.tokens_opus_total, null, 'o numero-titulo nao pode ser 0 por defeito');
});

test('analise · 5.o NO-SHIP (R5-8): aceite:true com tests_corridos 0 e contraditorio SEMPRE, mesmo sem historico (suplente)', () => {
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { tests_corridos: 0, tests_passados: 0 }), null), /zero testes/);
  const p = preregDe(['t1']);
  const r = correr(p, [{ evento: 'tarefa_excluida', task_id: 't1', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A', { tests_corridos: 0, tests_passados: 0 }), tentativa('s1', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.marcas.some((m) => m.tipo === 'aceite_contraditorio' && /zero testes/.test(m.motivo)));
});

test('analise · 5.o NO-SHIP (R5-10/R5-11): tempo incoerente marca; exclusao com pre-voo FALHADO marca', () => {
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A', { duration_ms: 0 }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T00:00:09Z', ts_fim: '2026-09-11T00:00:01Z' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.marcas.filter((m) => m.tipo === 'tempo_incoerente').length, 2);
  assert.equal(r.corrida_valida, true, 'so afecta velocidade, fora do criterio');
  const r2 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree nao reconstruiu', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'exclusao_com_pre_voo_falhado' && m.task_id === 't2'));
  assert.equal(r2.corrida_valida, true, 'marca, nao invalida: o worktree nao e verificavel aqui');
  const r3 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2', { exit_code: 0, falhou: false }), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.equal(r3.marcas.filter((m) => m.tipo === 'exclusao_com_pre_voo_falhado').length, 0, 'pre-voo que passou justifica a exclusao');
});

test('analise · CONTRATO — nenhum dos ledgers P7A..P7K do 4.o revisor sai com veredicto favoravel nem corrida valida indevida', () => {
  // Cada um contra um prereg de 2 tarefas (t1 T3, t2 T0): a forma dos ataques e a mesma; se um dia um passar, este teste e o alarme.
  const p = preregDe(['t1', 't2'], { t2: 'T0' });
  const parOk = (id, tier, over = {}) => (tier === 'T0'
    ? [tentativa(id, 'A', { tier_classificado: 'T0', ...over }), passoLocal(id), escalacao(id, over)]
    : [tentativa(id, 'A', over), tentativa(id, 'B', over)]);
  const ataques = {
    P7A: [...parOk('t1', 'T3', { aceite: null }), ...parOk('t2', 'T0', { aceite: null })],
    P7B: [...parOk('t1', 'T3', { aceite: 'true' }), ...parOk('t2', 'T0', { aceite: 'true' })],
    P7C: [tentativa('t1', 'A', { aceite: null }), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0', aceite: null }), passoLocal('t2'), escalacao('t2')],
    P7D: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-sonnet-4-5': SONDA.modelUsage['claude-opus-5'] } }), ...parOk('t2', 'T0')],
    P7E: [passoLocal('t1', { braco: 'A', tier_classificado: 'T3' }), tentativa('t1', 'B'), passoLocal('t2', { braco: 'A' }), passoLocal('t2'), escalacao('t2')],
    P7F: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { aceite: false, exit_code: 1, tests_passados: 9 }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'x' }],
    P7G: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { aceite: false, exit_code: 1, tests_passados: 9 }), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A'), tentativa('s1', 'B')],
    P7H: [...parOk('t1', 'T3', { test_file_sha_depois: 'OUTRO' }), ...parOk('t2', 'T0')],
    P7I: [...parOk('t1', 'T3', { modelUsage: { 'claude-opus-5': { inputTokens: null, outputTokens: null, cacheCreationInputTokens: null, cacheReadInputTokens: null, costUSD: 0 } } }), ...parOk('t2', 'T0')],
    P7J: [...parOk('t1', 'T3', { modelUsage: {} }), ...parOk('t2', 'T0')],
    P7K: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2')],
    L1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { aceite: true })],
    // 5.o revisor
    R51: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { arrancou: false, motivo_se_nao: 'cli_is_error:Reached max turns', aceite: false, exit_code: 1, tests_passados: 9 })],
    R52: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), naoArrancou('t2', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', motivo_se_nao: 'cli_is_error:Reached max turns' }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'cli_is_error' }],
    R53: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { aceite: false, exit_code: 1, tests_passados: 9 }), escalacao('t2', { aceite: true })],
    R54: [...parOk('t1', 'T3', { exit_code: null, test_file_sha_antes: null, test_file_sha_depois: null, tests_corridos: null, tests_passados: null }), ...parOk('t2', 'T0')],
    R54b: [...parOk('t1', 'T3', { tests_corridos: null, tests_passados: null, skips: null }), ...parOk('t2', 'T0')],
    R56: (() => { const a = tentativa('t1', 'A'); return [a, tentativa('t1', 'B', { session_id: a.session_id, usage: a.usage, modelUsage: a.modelUsage }), ...parOk('t2', 'T0')]; })(),
    R57: [...parOk('t1', 'T3', { modelUsage: { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } } }), ...parOk('t2', 'T0')],
    R58: [...parOk('t1', 'T3', { tests_corridos: 0, tests_passados: 0 }), ...parOk('t2', 'T0')],
  };
  // O que cada ataque tem de produzir. 'corrida' = corrida INVALIDA (veredicto null por arrasto);
  // 'veredicto' = sem veredicto; 'par' = esse par invalido (o par limpo ao lado DA veredicto, e isso e legitimo);
  // 'tokens' = consumo n/d (a aceitacao nao e afectada).
  const esperado = {
    P7A: { veredicto: null }, P7B: { corrida: false }, P7C: { veredicto: null },
    P7D: { corrida: false }, P7E: { veredicto: null }, P7F: { corrida: false }, P7G: { corrida: false },
    P7H: { corrida: false }, P7I: { tokens: null }, P7J: { corrida: false }, P7K: { par: 't2' }, L1: { corrida: false },
    R51: { corrida: false }, R52: { corrida: false }, R53: { corrida: false }, R54: { par: 't1' }, R54b: { par: 't1' }, R56: { corrida: false }, R57: { tokens: null }, R58: { corrida: false },
  };
  for (const [nome, ev] of Object.entries(ataques)) {
    const r = correr(p, ev);
    const e = esperado[nome];
    assert.ok(e, `${nome}: sem expectativa declarada`);
    assert.ok(r.marcas.length > 0, `${nome}: zero marcas`);
    if ('corrida' in e) { assert.equal(r.corrida_valida, false, `${nome}: corrida devia ser INVALIDA`); assert.equal(r.primaria.limiar_descritivo_cumprido, null, `${nome}: veredicto`); }
    if ('veredicto' in e) assert.equal(r.primaria.limiar_descritivo_cumprido, null, `${nome}: veredicto favoravel indevido`);
    if ('par' in e) { assert.ok(r.fiabilidade.pares_invalidos.some((x) => x.task_id === e.par), `${nome}: par ${e.par} devia ser invalido`); assert.ok(!r.por_tarefa.find((t) => t.task_id === e.par).par_valido); }
    if ('tokens' in e) { assert.equal(r.secundaria.global.A.tokens_opus_total, null, `${nome}: tokens A n/d`); assert.equal(r.secundaria.global.B.tokens_opus_total, null, `${nome}: tokens B n/d`); }
  }
  // controlo positivo: o par limpo com a mesma bancada DA veredicto
  const limpo = correr(p, [...parOk('t1', 'T3'), ...parOk('t2', 'T0')]);
  assert.equal(limpo.primaria.limiar_descritivo_cumprido, true);
  assert.equal(limpo.corrida_valida, true);
  assert.equal(limpo.marcas.length, 0, JSON.stringify(limpo.marcas));
});

test('lerLedger · linhas invalidas sao contadas, nao engolidas', () => {
  const { eventos, linhasInvalidas } = lerLedger('{"evento":"x"}\nisto nao e json\n\n{"evento":"y"}\n');
  assert.equal(eventos.length, 2);
  assert.deepEqual(linhasInvalidas.map((l) => l.linha), [2]);
});
