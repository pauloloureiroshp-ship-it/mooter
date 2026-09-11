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
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { analisar, lerLedger, tokensOpusDaTentativa, reconciliar, valorizar, arrancouDaTentativa, aceiteContraditorio, problemasDoModelUsage, violacoesDeTipo, evidenciaDeArranque, pecasDeEvidencia, pecasDeEvidenciaBruta, naoArrancouPuro, foiCurta, motivoSpawnPuro, problemasDoPreVoo, tsCanonico, TRANSCRIPT_MINIMO, consumoNoJson, SONDA_TOTAL_OPUS, SONDA_CACHE_OPUS, SHA256_VAZIO, localSemSaida, localComSaida, ehModeloCloud, SUPLENTES_ESPERADOS, CURTO_S, PREREG_SHA256_ESPERADO, EVENTOS_DO_PREREG, CHAVES_OBRIGATORIAS, TIPOS_OBRIGATORIOS, PROVAS_DA_ACEITACAO } from './custo-analise.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SONDA = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-fixture-sonda.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'custo-prereg.json'), 'utf8'));
const PRECOS = PREREG.metricas.yardstick_custo;

// ── bancada ────────────────────────────────────────────────────────────────

/** Um pre-registo minimo com N tarefas, para os testes nao dependerem das 20 reais. */
function preregDe(ids, tiers = {}, suplentes = ['s1', 's2', 's3'], ordens = {}) {
  // por omissao A primeiro ('B-depois-A'), que e a ordem em que a bancada cria as linhas; a I2 passa ordens explicitas
  return {
    ...PREREG,
    corpus: { ...PREREG.corpus, suplentes, tarefas: ids.map((id) => ({ task_id: id, tier_classificado: tiers[id] || 'T3', ordem_dos_bracos: ordens[id] || 'B-depois-A' })) },
  };
}

/** Uma tentativa claude-p com a forma real da sonda e TODAS as chaves do ledger. `session_id` unico por tentativa, como o CLI o da. */
let nSessao = 0;
function tentativa(task_id, braco, over = {}) {
  const n = ++nSessao;
  const t0 = Date.parse('2026-09-10T00:00:00Z') + n * 10000;
  return {
    evento: 'tentativa_fim', ts_inicio: new Date(t0).toISOString(), ts_fim: new Date(t0 + 5000).toISOString(), task_id, braco, tentativa: 1, e_escalacao: false,
    tier_classificado: 'T3', executor: 'claude-p', modelo_pedido: 'claude-opus-5', modelo_reportado: 'claude-opus-5',
    arrancou: true, motivo_se_nao: null,
    aceite: true, exit_code: 0, tests_corridos: 10, tests_passados: 10, skips: 0, test_file_sha_antes: 'tf', test_file_sha_depois: 'tf',
    usage: SONDA.usage, modelUsage: SONDA.modelUsage, total_cost_usd: SONDA.total_cost_usd, duration_ms: SONDA.duration_ms + n, session_id: `sess-${n}`,   // duration varia por linha (32: envelope clonado)
    tokens_locais: null, texto_local_sha256: null,
    estado_vivo_sha: 'ev-1', tecto_do_orcamento: 'null=sem tecto', sentinela_presente: true,
    worktree_listagem_sha_antes: 'wl', worktree_listagem_sha_depois: 'wl',
    ...over,
  };
}

/** Um passo local, com a forma que o ledger escreve para o router-execute (campos do CLI a null). NUNCA aceite: e impossivel por construcao. */
function passoLocal(task_id, over = {}) {
  return tentativa(task_id, 'B', { tentativa: 1, executor: 'router-execute', modelo_pedido: 'qwen2.5:3b', modelo_reportado: 'qwen2.5:3b@sha256:abc',   // pedido = reportado sem digest (20.o)
    aceite: false, exit_code: 1, tests_passados: 3, arrancou: true, usage: null, modelUsage: null, total_cost_usd: null, session_id: null,
    tokens_locais: 900, texto_local_sha256: 'deadbeef', duration_ms: 3000, tier_classificado: 'T0', ...over });
}

/** Uma tentativa claude-p que NAO arrancou como o pre-registo define: spawn falhou, sem JSON, sem session_id, sem prova. */
const naoArrancou = (task_id, braco, over = {}) => tentativa(task_id, braco, { arrancou: false, motivo_se_nao: 'spawn:ENOENT', aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, skips: null,
  test_file_sha_antes: null, test_file_sha_depois: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: 50, session_id: null, ...over });

/** Escalacao para Opus depois do passo local. */
const escalacao = (task_id, over = {}) => tentativa(task_id, 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', ...over });

const preVoo = (task_id, over = {}) => ({ evento: 'pre_voo', task_id, ts: '2026-09-10T00:00:00Z', exit_code: 1, falhou: true, tests_corridos: 10, tests_passados: 9, skips: 0, ...over });   // ts antes de qualquer tentativa da bancada (51)

/** analisar() com pre_voo falhado para todas as tarefas que aparecem — o caminho normal. */
function correr(p, ev, opts) {
  const ids = new Set([...p.corpus.tarefas.map((t) => t.task_id), ...ev.filter((e) => e.evento === 'tentativa_fim').map((e) => e.task_id)]);
  const jaTem = new Set(ev.filter((e) => e.evento === 'pre_voo' || e.evento === 'tarefa_excluida').map((e) => e.task_id));
  return analisar(p, [...[...ids].filter((id) => !jaTem.has(id)).map((id) => preVoo(id)), ...ev], opts);
}

/** Um par completo para uma tarefa do PREREG REAL, com a forma que o tier exige (T0: local + escalacao). */
function parReal(t, { aceiteB = true } = {}) {
  const h = t.tests_total_historico;
  const prova = (aceite) => (aceite ? { tests_corridos: h, tests_passados: h, exit_code: 0 } : { tests_corridos: h, tests_passados: h - 1, exit_code: 1 });
  const ev = [preVoo(t.task_id, { tests_corridos: h, tests_passados: h - 1 }), tentativa(t.task_id, 'A', { tier_classificado: t.tier_classificado, ...prova(true) })];   // o pre-voo corre a mesma suite: corridos = h (20.o)
  if (t.tier_classificado === 'T0' || t.tier_classificado === 'T1') ev.push(passoLocal(t.task_id, { tier_classificado: t.tier_classificado }), escalacao(t.task_id, { tier_classificado: t.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  else ev.push(tentativa(t.task_id, 'B', { tier_classificado: t.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  return ev;
}

/** Para o prereg REAL: reatribui os ts das linhas A/B de cada tarefa pela `ordem_dos_bracos`, preservando (ts_fim - ts_inicio) de cada linha. */
function ordenar(ev, prereg = PREREG) {
  const porTarefa = new Map();
  for (const e of ev) if (e.evento === 'tentativa_fim' && (e.braco === 'A' || e.braco === 'B')) porTarefa.set(e.task_id, [...(porTarefa.get(e.task_id) || []), e]);
  let k = 0;
  for (const [id, linhas] of porTarefa) {
    const meta = prereg.corpus.tarefas.find((x) => x.task_id === id);
    const primeiro = meta && meta.ordem_dos_bracos === 'A-depois-B' ? 'B' : 'A';
    const base = Date.parse('2026-09-10T00:00:00Z') + k++ * 4 * 3600 * 1000;
    for (const b of [primeiro, primeiro === 'A' ? 'B' : 'A']) {
      const xs = linhas.filter((e) => e.braco === b).sort((p, q) => (p.tentativa ?? 0) - (q.tentativa ?? 0));
      xs.forEach((e, j) => {
        if (typeof e.ts_inicio !== 'string' || typeof e.ts_fim !== 'string') return;
        const diff = Math.max(0, Date.parse(e.ts_fim) - Date.parse(e.ts_inicio));
        const ini = base + (b === primeiro ? 0 : 2 * 3600 * 1000) + j * 20 * 60 * 1000;
        e.ts_inicio = new Date(ini).toISOString(); e.ts_fim = new Date(ini + diff).toISOString();
      });
    }
  }
  return ev;
}
const analisarReal = (ev) => analisar(PREREG, ordenar(ev));

/** Um par completo para um SUPLENTE do PREREG REAL, com a meta pinada (32): tier do classify congelado, historico do manifesto. */
function parSuplente(id, { aceiteB = true } = {}) {
  const m = SUPLENTES_ESPERADOS[id];
  const h = m.tests_total_historico;
  const prova = (aceite) => (aceite ? { tests_corridos: h, tests_passados: h, exit_code: 0 } : { tests_corridos: h, tests_passados: h - 1, exit_code: 1 });
  const ev = [preVoo(id, { tests_corridos: h, tests_passados: h - 1 }), tentativa(id, 'A', { tier_classificado: m.tier_classificado, ...prova(true) })];
  if (m.tier_classificado === 'T0' || m.tier_classificado === 'T1') ev.push(passoLocal(id, { tier_classificado: m.tier_classificado, tests_corridos: h, tests_passados: h - 1 }), escalacao(id, { tier_classificado: m.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  else ev.push(tentativa(id, 'B', { tier_classificado: m.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  return ev;
}

/** Um par completo para um suplente da BANCADA (sem meta pinada: tier do ledger, unanime). */
const parSuplenteBench = (id) => [tentativa(id, 'A', { tier_classificado: 'T3' }), tentativa(id, 'B', { tier_classificado: 'T3' })];

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
  // 8.o revisor (iii): «spawn:ETIMEDOUT» e um tecto do spawn, nao um spawn que nao arrancou — o consumo e desconhecido, nao zero
  assert.ok(!naoArrancouPuro(naoArrancou('t1', 'A', { motivo_se_nao: 'spawn:ETIMEDOUT' })));
  assert.equal(tokensOpusDaTentativa(naoArrancou('t1', 'A', { motivo_se_nao: 'spawn:ETIMEDOUT' })), null);
  assert.ok(!naoArrancouPuro(naoArrancou('t1', 'A', { motivo_se_nao: 'spawn:timeout' })));
  // M202: um spawn:* LONGO nao e puro — consumo desconhecido, nao zero (28)
  assert.ok(!naoArrancouPuro(naoArrancou('t1', 'A', { duration_ms: 600000 })));
  assert.equal(tokensOpusDaTentativa(naoArrancou('t1', 'A', { duration_ms: 600000 })), null);
  assert.ok(!naoArrancouPuro(naoArrancou('t1', 'A', { duration_ms: null })));
  // e na analise, um ETIMEDOUT CURTO (50 ms, sem evidencia) e fora da definicao na mesma — o motivo decide, nao a duracao
  const pE = preregDe(['t1', 't2']);
  const rE = correr(pE, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B', { motivo_se_nao: 'spawn:ETIMEDOUT', duration_ms: 50 })]);
  assert.equal(rE.corrida_valida, false);
  assert.ok(rE.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && /spawn:ETIMEDOUT/.test(m.motivo) && /o motivo nao e spawn:\* \(sem timeout\)/.test(m.motivo)));
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
  // 31: a divisao do usage (toda a invocacao) tem de cobrir a criacao do modelUsage (58964): 70000/30000 cobre; 7000/3000 nao cobria e passa a n/d
  const usage = { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 70000, ephemeral_5m_input_tokens: 30000 } };
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { usage }));
  assert.equal(t.reparticao_cache, 'proporcional');
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { usage: { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 7000, ephemeral_5m_input_tokens: 3000 } } })).reparticao_cache, 'n/d (usage.cache_creation abaixo do modelUsage)');
  // g1/g2 do 12.o: {0,0} com criacao > 0 nao e «sem criacao» (valorizava a cache a zero); negativos nao se aceitam
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { usage: { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } })).reparticao_cache, 'n/d (usage.cache_creation abaixo do modelUsage)');
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { usage: { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: -1, ephemeral_5m_input_tokens: 60000 } } })).reparticao_cache, 'n/d');
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { usage: { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 58964, ephemeral_5m_input_tokens: -58964 } } })).reparticao_cache, 'n/d');
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
  const t = tokensOpusDaTentativa(tentativa('t1', 'A', { modelUsage: mu, usage: { ...SONDA.usage, cache_read_input_tokens: 100000 } }));   // 35: o usage tem de dizer o mesmo
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
  const dB = (i) => ev[i].duration_ms;   // as duracoes das linhas de B (variam por linha)

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
  assert.equal(r.velocidade.B.tempo_total_ms, dB(1) + dB(3) + 3000 + dB(6));
  const v3 = r.velocidade.por_tarefa[2];
  assert.deepEqual(v3.B_duracoes_ms, [3000, dB(6)]);
  assert.equal(v3.B_ate_verde_ms, 3000 + dB(6), 'ate verde inclui o passo local que falhou');
  assert.equal(v3.A_ate_verde_ms, ev[4].duration_ms);
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
  const r = analisarReal(parReal(t0));
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
  const r = analisarReal(parReal(t0));
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.match(r.primaria.veredicto_ausente_porque, /nao fechou/);
  assert.match(r.primaria.AVISO, /DESCRITIVO DO QUE CORREU/);
  assert.deepEqual(r.primaria.tabela_2x2.ambos, [t0.task_id], 'o descritivo do prefixo continua publicado');
  assert.ok(r.primaria.wilson_A && r.primaria.ic95_tango, 'Wilson e Tango descrevem o prefixo');
  const r2 = analisarReal([...parReal(t0, { aceiteB: false }), ...parReal(t1, { aceiteB: false })]);
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
  const r = analisarReal(ev);
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
  assert.deepEqual(r2.validade_nd_porque, ['tentativas sem estado_vivo_sha — um null nao prova que o estado vivo nao mudou (30)']);
  // 30 (B4b do 11.o): UM null com outro presente tambem e n/d — um null nao e uma mudanca, mas tambem nao prova que nao houve
  const r3 = correr(p, [tentativa('t1', 'A', { estado_vivo_sha: null }), tentativa('t1', 'B')]);
  assert.equal(r3.corrida_valida, null, 'antes: «um null nao e uma mudanca» — e era por ai que um sha mudado a meio, com null em 46/47 linhas, dava «cumprido»');
  assert.ok(r3.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'estado_vivo_sha'));
  // B4b: o sha muda a meio (INVALIDA) — e com null em todas menos uma, n/d, nunca true
  const p20 = preregDe(['t1', 't2', 't3']);
  const b4a = correr(p20, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A', { estado_vivo_sha: 'ev-MUDOU' }), tentativa('t3', 'B', { estado_vivo_sha: 'ev-MUDOU' })]);
  assert.equal(b4a.corrida_valida, false);
  const b4b = correr(p20, [tentativa('t1', 'A', { estado_vivo_sha: null }), tentativa('t1', 'B', { estado_vivo_sha: null }), tentativa('t2', 'A', { estado_vivo_sha: null }), tentativa('t2', 'B', { estado_vivo_sha: null }), tentativa('t3', 'A', { estado_vivo_sha: null }), tentativa('t3', 'B', { estado_vivo_sha: 'ev-MUDOU' })]);
  assert.equal(b4b.corrida_valida, null);
  assert.equal(b4b.primaria.limiar_descritivo_cumprido, null);
  // e o modelo local a null num passo local: n/d pelo mesmo motivo (C2 do 11.o)
  const pL = preregDe(['t1'], { t1: 'T0' });
  const c2 = correr(pL, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1', { modelo_reportado: null }), escalacao('t1')]);
  assert.equal(c2.corrida_valida, null);
  assert.ok(c2.validade_nd_porque.some((x) => /modelo_reportado/.test(x)));
});

test('analise · 3.o NO-SHIP (MUT-R2): tentativas orfas contam para a validade da corrida', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('orfa', 'A', { estado_vivo_sha: 'MUDOU', sentinela_presente: false })]);
  assert.equal(r.corrida_valida, false);
  assert.equal(r.corrida_invalida_por.length, 3, 'estado_vivo, sentinela — e a propria orfa (34)');
  assert.ok(r.corrida_invalida_por.some((x) => /tentativa orfa/.test(x.motivo)));
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
});

test('analise · 3.o NO-SHIP (L7): braco fora de {A,B} e orfa — consumo visivel, marca, nunca descartada', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t1', 'a')]);
  assert.equal(r.primaria.n_pares_validos, 0, '34: a orfa na tarefa em jogo e (c) no par — a corrida e INVALIDA por ela');
  assert.equal(r.corrida_valida, false);
  assert.ok(r.fiabilidade.pares_invalidos.some((x) => x.task_id === 't1' && /retoma escondida.*CORRIDA INVALIDA/.test(x.motivo)));
  assert.equal(r.fiabilidade.tentativas_orfas.length, 1);
  assert.equal(r.fiabilidade.tentativas_orfas[0].braco, 'a');
  assert.equal(r.fiabilidade.tentativas_orfas[0].tokens_opus, OPUS_TOTAL);
  const m = r.marcas.find((x) => x.tipo === 'tentativa_orfa');
  assert.match(m.motivo, /braco "a" fora de \{A,B\}/);
  assert.equal(r.secundaria.global.A.tokens_opus_total, null, '0 pares validos: n/d');
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL, 'o consumo do par (c) continua visivel');
  assert.equal(r.secundaria.global.A.tokens_opus_total_todas_as_tentativas, OPUS_TOTAL, 'a orfa tem braco "a", nao "A": nao entra em A');
});

test('analise · 3.o NO-SHIP (chaves omitidas): ledger.regra — chave omitida marca chave_omitida com a lista', () => {
  const p = preregDe(['t1']);
  const semChaves = tentativa('t1', 'A');
  delete semChaves.modelo_pedido; delete semChaves.worktree_listagem_sha_antes; delete semChaves.tokens_locais;
  const r = correr(p, [semChaves, tentativa('t1', 'B')]);
  const m = r.marcas.find((x) => x.tipo === 'chave_omitida');
  assert.ok(m && m.braco === 'A');
  assert.equal(m.motivo, 'modelo_pedido, tokens_locais, worktree_listagem_sha_antes');
  // 31 (c2 do 12.o): omissao = null — o par sai por (c) e a corrida e invalida (omitir era mais barato do que null)
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.corrida_valida, false);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /chave obrigatoria omitida.*CORRIDA INVALIDA/);
  // skips passou a prova da aceitacao (29): omitido numa aceite=true e prova em falta -> 27c
  const semSkips = tentativa('t1', 'A'); delete semSkips.skips;
  assert.equal(correr(p, [semSkips, tentativa('t1', 'B')]).corrida_valida, false);
  // uma PROVA omitida e outra coisa: par invalido (interpretacao 12)
  const semProva = tentativa('t1', 'A'); delete semProva.tests_corridos;
  const r2 = correr(p, [semProva, tentativa('t1', 'B')]);
  assert.equal(r2.primaria.n_pares_validos, 0);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /chave obrigatoria omitida.*CORRIDA INVALIDA/, '31: a omissao vem primeiro na escada');
  assert.ok(r2.corrida_invalida_por.some((x) => /aceite=true sem prova completa/.test(x.motivo) && /tests_corridos/.test(x.valores.join())), 'e a prova em falta tambem esta la (12)');
  assert.equal(r2.corrida_valida, false, '27c: aceite=true sem prova invalida a corrida');
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
  assert.match(motivos[1], /B com 2 tentativas claude-p/);
  assert.match(motivos[2], /B em T0 sem passo local/);
  assert.match(motivos[3], /B em T3 com 2 tentativas e 1 passo/);
  assert.equal(r.marcas.filter((m) => m.tipo === 'tentativas_fora_do_protocolo').length, 4);
  assert.equal(r.fiabilidade.pares_invalidos[0].consumo_A_tokens, 2 * OPUS_TOTAL, 'o consumo das duas tentativas de A fica visivel');
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, false, '27c (8.o revisor, classe i): o tratamento nao foi aplicado como pre-registado — corrida INVALIDA');
  assert.ok(r.corrida_invalida_por.some((x) => /fora do protocolo/.test(x.motivo)));
  // B com 3: `tentativa: 3` ja e tipo invalido (valores {1,2}) — apanhado ANTES do protocolo, e e a corrida que nao fica valida por causa de aceite/arrancou? nao: so `tentativa`. Par invalido, corrida valida.
  const r2 = correr(preregDe(['t1'], { t1: 'T0' }), [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1'), escalacao('t1', { aceite: false }), escalacao('t1', { tentativa: 3 })]);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /tipo invalido/);
  assert.ok(r2.marcas.some((m) => m.tipo === 'tipo_invalido' && /tentativa: 3 fora de/.test(m.motivo)));
  assert.ok(r2.marcas.some((m) => m.tipo === 'tentativas_fora_do_protocolo' && /B com 3 tentativas/.test(m.motivo)), 'a marca de protocolo existe na mesma');
  assert.equal(r2.corrida_valida, false);
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

test('analise · tarefa com tentativa so no braco A (morreu entre A e B): com paragem e par invalido com consumo, corrida nao fechou; SEM paragem e omissao do controlador (28)', () => {
  const p = preregDe(['t1', 't2']);
  const paragem = { evento: 'paragem', ts: '2026-09-11T02:00:00Z', motivo: 'morreu entre A e B', ultima_tarefa: 't2' };
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), paragem]);
  assert.equal(r.corrida_fechou_os_pares, false);
  assert.equal(r.corrida_valida, true);
  assert.equal(r.primaria.n_pares_validos, 1);
  const inv = r.fiabilidade.pares_invalidos;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].braco_que_nao_arrancou, 'B');
  assert.equal(inv[0].motivo, 'sem tentativa registada no braco B (corrida parada)');
  // sem evento paragem, um braco sem linha numa tarefa que correu e uma omissao: a linha e obrigatoria mesmo quando o spawn falha
  const rSem = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A')]);
  assert.equal(rSem.corrida_valida, false, '28: retirar o par sem prova favorece um braco');
  assert.ok(rSem.marcas.some((m) => m.tipo === 'braco_sem_linha' && m.task_id === 't2' && m.braco === 'B'));
  assert.match(rSem.fiabilidade.pares_invalidos[0].motivo, /sem tentativa registada no braco B numa corrida sem paragem.*CORRIDA INVALIDA/);
  assert.equal(inv[0].consumo_A_tokens, OPUS_TOTAL, 'o gasto de A em t2 fica visivel');
  assert.equal(inv[0].consumo_B_tokens, null);
  perto(inv[0].valorizacao_A_usd, 0.58975, 1e-4, 'valorizacao do invalido');
  perto(inv[0].custo_cli_total_A_usd, SONDA.total_cost_usd, 1e-4);
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  assert.equal(r.secundaria.global.A.tokens_opus_total, OPUS_TOTAL);
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, 2 * OPUS_TOTAL);
  assert.equal(r.secundaria.global.B.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL);
});

test('analise · par_invalido SEM a linha do braco nomeado e ilegitimo (28): o evento fecha o par, mas nao e "nao corrida" nem uma saida (a)', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true, 'o evento fecha o par');
  assert.deepEqual(r.fiabilidade.nao_corridas, []);
  assert.equal(r.fiabilidade.pares_invalidos.length, 1);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /par_invalido ilegitimo: sem linha tentativa_fim do braco B.*CORRIDA INVALIDA/);
  assert.equal(r.fiabilidade.pares_invalidos[0].braco_que_nao_arrancou, 'B');
  assert.equal(r.fiabilidade.pares_invalidos[0].consumo_A_tokens, null);
  assert.equal(r.prefixo_executado.tarefas_com_alguma_tentativa, 1);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.marcas.some((m) => m.tipo === 'par_invalido_ilegitimo' && m.task_id === 't2'));
  // a forma legitima: A correu, a linha de B e um nao-arrancou PURO e curto, e o evento copia o motivo
  const rOk = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(rOk.corrida_valida, true);
  assert.equal(rOk.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT');
  assert.equal(rOk.marcas.filter((m) => m.tipo === 'par_invalido_ilegitimo').length, 0);
  // com a linha pura de B mas SEM a linha de A (o 1.o braco pela ordem): o outro braco sem linha e omissao (28)
  const rSemA = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(rSemA.corrida_valida, false);
  assert.ok(rSemA.marcas.some((m) => m.tipo === 'braco_sem_linha' && m.braco === 'A'));
});

test('analise · 3.o NO-SHIP (MUT-R1): pre_voo ausente E par_invalido na mesma tarefa — a marca de pre-voo e emitida na mesma', () => {
  const p = preregDe(['t1', 't2']);
  const r = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.ok(r.marcas.some((m) => m.tipo === 'pre_voo_ausente' && m.task_id === 't2'));
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT', 'o motivo do evento tem precedencia no par');
  assert.equal(r.corrida_valida, false, 'e a corrida e invalida na mesma pelo pre-voo ausente (27c)');
  // e a tarefa que SO tem par_invalido (spawn falhou no 1.o braco) tambem devia ter tido pre-voo
  const r2 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'pre_voo_ausente' && m.task_id === 't2'), 'pre-voo antes de qualquer braco, mesmo do que falhou no spawn');
});

test('analise · par_invalido com evento e tentativa em A: fecha o par, motivo do evento, veredicto sobre os validos', () => {
  const p = preregDe(['t1', 't2']);
  const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }];
  const r = correr(p, ev);
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.fiabilidade.pares_invalidos[0].motivo, 'spawn:ENOENT');
  assert.equal(r.corrida_valida, true);
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
  assert.match(inv.motivo, /^pre-voo ausente — CORRIDA INVALIDA/);
  assert.equal(inv.consumo_A_tokens, OPUS_TOTAL);
  assert.equal(r.por_tarefa[1].pre_voo_falhou, null);
  assert.equal(r.corrida_valida, false, '27c: retirar o par favorece um braco');
});

test('analise · pre_voo que NAO falhou (tarefa ja verde) mas correu: marca e par invalido; `falhou: true` OU exit_code != 0 e falhado (61); fica o PRIMEIRO', () => {
  const p = preregDe(['t1']);
  const r = analisar(p, [preVoo('t1', { exit_code: 0, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.ok(r.marcas.some((m) => m.tipo === 'pre_voo_nao_falhou'));
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /ja verde/);
  assert.equal(r.por_tarefa[0].pre_voo_falhou, false);
  assert.equal(r.corrida_valida, false, '27c: uma tarefa ja verde que correu — o par nao pode sair por isto');
  assert.ok(r.corrida_invalida_por.some((x) => /pre-voo nao falhou/.test(x.motivo)));
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 1, falhou: undefined }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 1, 'so exit_code != 0');
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 0, falhou: undefined }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 0, 'so exit_code 0');
  // 61: a flag NAO manda sobre o exit — falhou:false com exit_code 1 e um pre-voo que FALHOU e uma contradicao: pre_voo_incoerente, corrida INVALIDA, (c) no par (antes «falhou:false vence exit_code 1» e a X1 contornava-se com a flag)
  const r61 = analisar(p, [preVoo('t1', { exit_code: 1, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r61.por_tarefa[0].pre_voo_falhou, true, '61: o exit manda');
  assert.ok(!r61.marcas.some((m) => m.tipo === 'pre_voo_nao_falhou'), '61: nao e «ja verde»');
  assert.ok(r61.marcas.some((m) => m.tipo === 'pre_voo_incoerente' && /falhou=false e exit_code=1/.test(m.motivo)));
  assert.equal(r61.corrida_valida, false);
  assert.ok(r61.corrida_invalida_por.some((x) => /falhou=false e exit_code=1.*interpretacoes 25, 30, 61/.test(x.motivo)));
  assert.equal(r61.primaria.n_pares_validos, 0, '(c) no par');
  assert.match(r61.fiabilidade.pares_invalidos[0].motivo, /pre_voo contraditorio.*CORRIDA INVALIDA/);
  // 29 (V1 do 10.o): pre_voo repetido — o PRIMEIRO decide e a corrida e invalida (a tarefa foi preparada duas vezes; repetir ate vermelho e seleccao)
  const rV = analisar(p, [preVoo('t1', { exit_code: 0, falhou: false }), preVoo('t1', { exit_code: 1, falhou: true }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(rV.primaria.n_pares_validos, 0, 'o primeiro pre_voo (verde) decide');
  assert.equal(rV.corrida_valida, false);
  assert.ok(rV.marcas.some((m) => m.tipo === 'pre_voo_repetido' && /2 eventos/.test(m.motivo)));
  // pre_voo sem skips: a base da condicao 3 falta -> marca campo_em_falta e invalida quando a tarefa correu em claude-p
  const rS = analisar(p, [preVoo('t1', { skips: null }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.ok(rS.marcas.some((m) => m.tipo === 'campo_em_falta' && /pre_voo.skips/.test(m.motivo)));
  assert.equal(rS.corrida_valida, false);
  // pre_voo com skips >= historico: so marca (pode ter falhado por skip)
  const p2 = preregDe(['t1']); p2.corpus.tarefas[0].tests_total_historico = 10;
  const rG = analisar(p2, [preVoo('t1', { skips: 10 }), tentativa('t1', 'A', { skips: 10 }), tentativa('t1', 'B', { skips: 10 })]);
  assert.ok(rG.marcas.some((m) => m.tipo === 'pre_voo_sem_vermelho'));
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
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /^nao arrancou \(spawn puro: spawn:EAGAIN\) sem evento par_invalido$/);
  // e com a escalacao a arrancou:null (nao pura): fora da definicao — (c) pela 22, antes de qualquer (a)
  const rN = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1'), naoArrancou('t1', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', arrancou: null })]);
  assert.equal(rN.corrida_valida, false);
  assert.match(rN.fiabilidade.pares_invalidos[0].motivo, /^nao-arrancou fora da definicao.*CORRIDA INVALIDA/);
  // dois passos locais, o ultimo sem arrancar: o motivo (c) fala da ULTIMA (false), nao da primeira (true) — e um local nunca e «puro»
  const rL = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1'), passoLocal('t1', { tentativa: 2, e_escalacao: true, arrancou: false, motivo_se_nao: 'ollama:down' })]);
  assert.equal(rL.corrida_valida, false);
  assert.match(rL.fiabilidade.pares_invalidos[0].motivo, /arrancou=false que nao e um nao-arrancou puro.*CORRIDA INVALIDA/);
  assert.doesNotMatch(rL.fiabilidade.pares_invalidos[0].motivo, /arrancou=true/);
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
    tentativa('t2', 'A', { modelUsage: { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], cacheCreationInputTokens: 0 } }, aceite: false, exit_code: 1, tests_passados: 9 }),   // nao reconcilia (35): consumo desconhecido, par valido (um tecto sem transcript seria INVALIDA pela 58)
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
  const r = correr(p, [tentativa('t1', 'A', { modelUsage: null, usage: null, total_cost_usd: null, aceite: false, tokens_transcript: 123456 }), tentativa('t1', 'B')]);   // 58: sem JSON nao ha total_cost_usd
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
    tentativa('s1', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:15Z' }), passoLocal('s1', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:03Z' }), escalacao('s1', { ts_inicio: '2026-09-11T00:00:05Z', ts_fim: '2026-09-11T00:00:09Z' }),   // 97: o local tambem tem tempo coerente
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
  assert.deepEqual(r.marcas.map((m) => m.tipo), ['tarefa_substituida'], JSON.stringify(r.marcas));
  assert.match(r.primaria.AVISO_SUPLENTES, /inclui 1 suplente\(s\) \(s1\) no lugar de tarefas do corpus \(t2\)/, '«cumprido · marcas 0» com corpus trocado nao pode acontecer (X2 do 10.o)');
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
  // a ORDEM NO LEDGER e outra (escalacao escrita antes do local), mas os ts dizem a verdade: local primeiro, escalacao depois (32)
  const ev = [tentativa('t1', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), escalacao('t1', { duration_ms: 4000, ts_inicio: '2026-09-11T00:10:00Z', ts_fim: '2026-09-11T00:10:04Z' }), passoLocal('t1', { duration_ms: 3000, ts_inicio: '2026-09-11T00:05:00Z', ts_fim: '2026-09-11T00:05:03Z' })];
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
  // 30 (E1/E2 do 11.o): um passo local com evidencia de CLI (modelUsage, usage, session_id, custo > 0) correu em claude-p rotulado router-execute
  const r2 = correr(p, [A, passoLocal('t1', { modelUsage: SONDA.modelUsage }), escalacao('t1')]);
  assert.ok(r2.marcas.some((x) => x.tipo === 'local_com_evidencia_de_cli' && /modelUsage/.test(x.motivo)));
  assert.equal(r2.por_tarefa[0].B.tokens_opus, null, 'o consumo do «local» e desconhecido, nao zero — antes somava zero e B ficava com o total honesto');
  assert.equal(r2.corrida_valida, false, 'executor mal rotulado = tratamento nao aplicado');
  for (const over of [{ session_id: 'sess-x' }, { usage: SONDA.usage }, { total_cost_usd: 0.5 }]) {
    const rX = correr(p, [A, passoLocal('t1', over), escalacao('t1')]);
    assert.equal(rX.corrida_valida, false, JSON.stringify(over));
    assert.ok(rX.marcas.some((x) => x.tipo === 'local_com_evidencia_de_cli'), JSON.stringify(over));
  }
  assert.equal(tokensOpusDaTentativa(passoLocal('t1', { total_cost_usd: 0.5 })), null);
  assert.equal(tokensOpusDaTentativa(passoLocal('t1')).total, 0);
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
    tentativa('t3', 'A', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 1001, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t3', 'B'),   // tecto sem JSON, nao aceite: total A = 2*58970 + 1001 = 118941; 2 aceites -> 59470.5
  ]);
  assert.equal(r.primaria.n_pares_validos, 3, JSON.stringify(r.marcas));
  const quatroCasas = (x) => Math.round(x * 1e4) / 1e4 === x;
  assert.ok(quatroCasas(r.valorizacao.B.valorizacao_teorica_usd), `${r.valorizacao.B.valorizacao_teorica_usd} nao tem 4 casas`);
  assert.ok(quatroCasas(r.valorizacao.B.custo_cli_opus_usd));
  assert.ok(quatroCasas(r.valorizacao.B.custo_cli_total_usd));
  assert.equal(r.secundaria.global.A.tokens_opus_total, 2 * OPUS_TOTAL + 1001);
  assert.equal(r.secundaria.global.A.por_aceite, 59471, 'razao de tokens inteira: 118941/2 = 59470.5 -> 59471');
  assert.equal(r.secundaria.global.A.por_tarefa_atribuida, 39647, '118941/3 = 39647');
  // 31 (e3 do 12.o): um transcript abaixo do piso nao e consumo — e desconhecido
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 1 })), null);
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 999 })), null);
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 1000 })).total, 1000);
  assert.equal(r.secundaria.global.A.so_aceites_por_ambos.por_tarefa, 58970);
  assert.deepEqual(r.secundaria.global.A.fontes, { json: 2, transcript: 1, local: 0, nao_arrancou: 0, desconhecido: 0 }, 'o titulo diz de onde vem');
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
  assert.equal(rD.corrida_valida, false, '27c: tipo invalido em QUALQUER chave invalida a corrida — o par nao pode sair por isto');
  assert.ok(rD.corrida_invalida_por.some((x) => /tipo invalido numa chave obrigatoria/.test(x.motivo)));
  assert.equal(rD.primaria.n_pares_validos, 1);
  assert.match(rD.fiabilidade.pares_invalidos[0].motivo, /tipo invalido/);
  // P7A: aceite null numa claude-p que chegou tambem invalida a corrida
  assert.equal(rA.corrida_valida, false);
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
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /sem Opus no modelUsage/, 'o motivo do par e a 20');
  // com aceite:false o par tambem e invalido pela 20 (nao ha 19 a apanhar antes)
  const rF = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: semOpus, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(rF.primaria.n_pares_validos, 1);
  assert.match(rF.fiabilidade.pares_invalidos[0].motivo, /sem Opus no modelUsage/);
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
  // (a) exige um nao-arrancou PURO — um passo local em A com arrancou:false nunca o e: o motivo do par e (c), nao (a)
  const rAL = correr(preregDe(['t1']), [passoLocal('t1', { braco: 'A', tier_classificado: 'T3', arrancou: false, motivo_se_nao: 'ollama:down' }), tentativa('t1', 'B')]);
  assert.equal(rAL.corrida_valida, false);
  assert.match(rAL.fiabilidade.pares_invalidos[0].motivo, /que nao e um nao-arrancou puro.*CORRIDA INVALIDA/);
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
  assert.ok(r.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /DEPOIS de um braco ter sido lancado/.test(m.motivo)));
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
});

test('analise · 4.o NO-SHIP (P7H): aceite:true com prova contraditoria (exit 1, sha mudou, passados > corridos, < historico) — corrida INVALIDA', () => {
  assert.equal(aceiteContraditorio(tentativa('t1', 'A'), 10), null);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { exit_code: 1 }), 10), /exit_code 1 com tests_passados 10 \+ skips 0 == tests_corridos 10/, '55: exit 1 com nada a falhar e impossivel antes de ser «aceite=true com exit 1»');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { exit_code: 1, tests_passados: 9 }), 10), /exit_code=1/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { test_file_sha_depois: 'OUTRO' }), 10), /test_file_sha antes!=depois/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { tests_passados: 99 }), 10), /tests_passados 99 > tests_corridos 10/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A'), 55), /tests_corridos 10 < historico 55/);
  assert.equal(aceiteContraditorio(tentativa('t1', 'A'), null), null, 'sem historico (suplente) nao se compara ao historico');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { exit_code: null, test_file_sha_antes: null, tests_passados: null }), 10), null, 'null nao contradiz');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { aceite: false }), 10, 0), /aceite=false com exit_code 0/);
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false }), 10), null, 'sem base de skips nao se pode dizer que a rejeicao e contraditoria');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, skips: null }), 10, 0), null, 'sem skips na linha a prova nao esta completa');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, exit_code: 1, tests_passados: 9 }), 10, 0), null);   // 55: exit 1 pede uma falha real
  // 29 (E3/E4/E5 do 10.o): a segunda metade da condicao 3 — skips nao aumentou face ao pre-voo; e passados + skips <= corridos
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, skips: 1, tests_corridos: 11 }), 10, 0), null, 'E3: rejeicao legitima por skip a mais — NAO e contraditoria (a fixture antiga tinha 10 + 1 > 10: aritmetica impossivel, 41)');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, skips: 1 }), 10, 0), /sumario de testes impossivel/, '41: passados 10 + skips 1 > corridos 10 numa rejeicao');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { aceite: true, skips: 1, tests_corridos: 11 }), 10, 0), /skips 1 > 0 do pre-voo/, 'E4: aceite com skip a mais e contraditorio');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { aceite: true, skips: 3 }), 10, 0), /tests_passados 10 \+ skips 3 > tests_corridos 10/, 'E5: aritmetica do sumario');
  assert.equal(aceiteContraditorio(passoLocal('t1', { aceite: false, exit_code: 0 }), 10), null, 'passo local nao se avalia aqui');
  const p = preregDe(['t1', 't2']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { test_file_sha_depois: 'OUTRO' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.marcas.some((m) => m.tipo === 'aceite_contraditorio' && m.braco === 'B'));
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /aceite contraditorio/);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  // com o prereg real: historico 55 e testes a 10 -> contraditorio
  const t0 = PREREG.corpus.tarefas.find((t) => t.tier_classificado === 'T3');
  const rr = analisarReal([preVoo(t0.task_id), tentativa(t0.task_id, 'A', { tier_classificado: 'T3' }), tentativa(t0.task_id, 'B', { tier_classificado: 'T3' })]);
  assert.ok(rr.marcas.some((m) => m.tipo === 'aceite_contraditorio' && /historico/.test(m.motivo)));
});

test('analise · 4.o NO-SHIP (P7K): T0 com passo local nao aceite e SEM escalacao — escalacao_em_falta, par invalido', () => {
  const p = preregDe(['t1'], { t1: 'T0' });
  const r = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1')]);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /escalacao_em_falta/);
  assert.equal(r.corrida_valida, false, '8.o revisor (classe i): por construcao o local nunca aceita, logo cada par retirado e (A ok, B nao) — favorece B');
});

test('analise · 4.o NO-SHIP (MUT-A): corrida fechada e valida com 0 pares validos — veredicto null, nao true', () => {
  const p = preregDe(['t1']);
  // a unica saida (a) que deixa a corrida valida com 0 pares: B nao arrancou (spawn puro) com evento par_invalido
  const r = correr(p, [tentativa('t1', 'A'), naoArrancou('t1', 'B'), { evento: 'par_invalido', task_id: 't1', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(r.corrida_fechou_os_pares, true);
  assert.equal(r.corrida_valida, true);
  assert.equal(r.primaria.n_pares_validos, 0);
  assert.equal(r.primaria.limiar_descritivo_cumprido, null);
  assert.equal(r.primaria.veredicto_ausente_porque, 'sem pares validos');
  assert.equal(r.secundaria.global.A.tokens_opus_total, null, 'sem validos, o total e null');
  assert.equal(r.secundaria.global.A.tokens_opus_total_incluindo_pares_invalidos, OPUS_TOTAL, 'mas o consumo do invalido esta na 2.a leitura');
  assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null);
});

test('analise · 4.o NO-SHIP (MUT-B): claude-p com arrancou null, sem JSON, sem motivo, curta — consumo DESCONHECIDO (null), nao zero; marca campo_em_falta; par invalido (residual declarado)', () => {
  assert.equal(tokensOpusDaTentativa(tentativa('t1', 'A', { arrancou: null, modelUsage: null, usage: null, session_id: null })), null);
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { arrancou: null, motivo_se_nao: null, modelUsage: null, usage: null, total_cost_usd: null, session_id: null, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 50 }), tentativa('t1', 'B')]);
  assert.equal(r.por_tarefa[0].A.tokens_opus, null);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'arrancou'));
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_nao_arrancou'));
  assert.equal(r.primaria.n_pares_validos, 0);
  // 28/29 (R1 do 10.o): o «residual» (arrancou null, sem motivo, curto) nao prova nada — deixou de ser saida (a); o brief obriga motivo_se_nao sempre preenchido
  assert.equal(r.corrida_valida, false, 'o residual e 27c: retirar o par sem prova favorece um braco');
  assert.ok(r.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && /arrancou=null nao e false/.test(m.motivo)));
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /nao-arrancou fora da definicao.*CORRIDA INVALIDA/);
});

test('analise · 7.o NO-SHIP (B2): timeout escrito com arrancou:null — fora da definicao, corrida INVALIDA; a falha de B NAO sai do denominador', () => {
  // A 4/4; B: 1 aceite, 2 falhas honestas, 1 timeout. O veredicto certo e «NAO cumprido» (1 >= 4-2 e falso).
  // Com o timeout a virar par invalido: 3 pares, A 3 B 1, 1 >= 1 -> «cumprido». E a direccao que o 7.o revisor mostrou.
  const p = preregDe(['t1', 't2', 't3', 't4']);
  const falha = { aceite: false, exit_code: 1, tests_passados: 9 };
  const timeout = (over) => tentativa('t4', 'B', { session_id: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:15:05Z', ...falha, ...over });
  const base = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', falha), tentativa('t3', 'A'), tentativa('t3', 'B', falha), tentativa('t4', 'A')];
  // N: arrancou null + motivo 'timeout'
  const rN = correr(p, [...base, timeout({ arrancou: null, motivo_se_nao: 'timeout' })]);
  assert.equal(rN.corrida_valida, false);
  assert.ok(rN.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && /arrancou=null/.test(m.motivo)));
  assert.equal(rN.primaria.limiar_descritivo_cumprido, null);
  // N2: arrancou null + motivo null, mas durou 905 s: um spawn falhado nao demora 900 s
  const rN2 = correr(p, [...base, timeout({ arrancou: null, motivo_se_nao: null })]);
  assert.equal(rN2.corrida_valida, false);
  assert.ok(rN2.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && />= tecto/.test(m.motivo)));
  assert.ok(rN2.marcas.some((m) => m.tipo === 'tecto_aparente' && /aceite=false/.test(m.motivo)), 'tecto_aparente independente de aceite');
  // F: arrancou false + 'timeout' — ja apanhado (R5-2)
  const rF = correr(p, [...base, timeout({ arrancou: false, motivo_se_nao: 'timeout' })]);
  assert.equal(rF.corrida_valida, false);
  // T (o brief): arrancou true com session_id do --session-id, aceite:false -> o timeout conta CONTRA B
  const rT = correr(p, [...base, timeout({ arrancou: true, motivo_se_nao: null, session_id: 'sess-timeout', tokens_transcript: 123456 })]);   // 58: o session_id (pre-gerado, brief 98) nao prova — o transcript encontrado sim
  assert.equal(rT.corrida_valida, true);
  assert.equal(rT.primaria.n_pares_validos, 4);
  assert.equal(rT.primaria.aceites_B, 1);
  assert.equal(rT.primaria.limiar_descritivo_cumprido, false, 'NAO cumprido: 1 < 4-2');
  // o contra-factual que o B2 produzia: se o timeout saisse do denominador, 3 pares A 3 B 1 -> 1 >= 1 -> cumprido
  const rContra = correr(preregDe(['t1', 't2', 't3']), [...base.slice(0, 6)]);   // o mesmo ledger sem t4, num prereg de 3
  assert.equal(rContra.primaria.limiar_descritivo_cumprido, true, 'e por isto que o par NAO pode sair');
  assert.ok(rT.marcas.some((m) => m.tipo === 'consumo_do_transcript'), '58: com o transcript encontrado o consumo vem do transcript, nao e desconhecido');
  assert.ok(rT.marcas.some((m) => m.tipo === 'tecto_aparente'));
  // e um spawn:* verdadeiro (50 ms, sem JSON) com arrancou null continua a ser par invalido sem invalidar a corrida
  const rS = correr(p, [...base, timeout({ arrancou: false, motivo_se_nao: 'spawn:ENOENT', ts_fim: '2026-09-11T00:00:01Z', duration_ms: 50, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null, skips: null })]);
  assert.equal(rS.corrida_valida, true);
  assert.equal(rS.primaria.n_pares_validos, 3);
  // e o mesmo com arrancou:null NAO e puro (28/29): 27c
  const rNulo = correr(p, [...base, timeout({ arrancou: null, motivo_se_nao: 'spawn:ENOENT', ts_fim: '2026-09-11T00:00:01Z', duration_ms: 50, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null, skips: null })]);
  assert.equal(rNulo.corrida_valida, false, 'N10 do 10.o: puro exige arrancou === false');
  // 9.o revisor (α/β): «curto» tem limite — o mesmo spawn:ENOENT com 600 s de ts, ou com duration_ms 899000, ou sem duration_ms, nao e um nao-arrancou (28)
  for (const over of [{ ts_fim: '2026-09-11T00:10:00Z', duration_ms: 50 }, { ts_fim: '2026-09-11T00:00:01Z', duration_ms: 899000 }, { ts_fim: '2026-09-11T00:00:01Z', duration_ms: null }, { ts_fim: '2026-09-11T00:00:01Z', duration_ms: 50, total_cost_usd: 0.9 }, { ts_fim: '2026-09-11T00:00:01Z', duration_ms: 50, usage: { input_tokens: 5, output_tokens: 7 } }]) {
    const rL = correr(p, [...base, timeout({ arrancou: false, motivo_se_nao: 'spawn:ENOENT', exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null, ...over })]);
    assert.equal(rL.corrida_valida, false, JSON.stringify(over));
    assert.equal(rL.primaria.limiar_descritivo_cumprido, null, JSON.stringify(over));
  }
  // e o residual declarado (arrancou null, sem motivo) tambem so e (a) se for curto
  const rR = correr(p, [...base, timeout({ arrancou: null, motivo_se_nao: null, ts_fim: '2026-09-11T00:10:00Z', duration_ms: 600000, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null })]);
  assert.equal(rR.corrida_valida, false, 'a3 do 9.o: 600 s nao e curto');
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
  assert.ok(!evidenciaDeArranque(tentativa('x', 'A', { session_id: null, modelUsage: null, usage: null, total_cost_usd: null })));
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { session_id: null, modelUsage: null, total_cost_usd: null })), 'so usage chega (9.o, γ2)');
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { session_id: null, modelUsage: null, usage: null })), 'so total_cost_usd > 0 chega (9.o, a5)');
  assert.ok(!evidenciaDeArranque(tentativa('x', 'A', { session_id: null, modelUsage: null, usage: null, total_cost_usd: 0 })), 'custo 0 nao e evidencia');
  assert.deepEqual(pecasDeEvidencia(tentativa('x', 'A')), ['session_id', 'modelUsage', 'usage', 'total_cost_usd>0']);
  const semNada = { session_id: null, modelUsage: null, usage: null, total_cost_usd: null };
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { ...semNada, modelUsage: SONDA.modelUsage })), 'so modelUsage chega');
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { ...semNada, session_id: 'abc' })), 'so session_id chega');
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { ...semNada, usage: SONDA.usage })), 'so usage chega');
  assert.ok(evidenciaDeArranque(tentativa('x', 'A', { ...semNada, total_cost_usd: 0.01 })), 'so custo chega');
  assert.ok(!evidenciaDeArranque(passoLocal('x')), 'o passo local nao entra aqui');
  // e cada sinal sozinho e apanhado na analise
  const r3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3', { session_id: null })]);
  assert.ok(r3.marcas.some((x) => x.tipo === 'arrancou_contraditorio' && /tem modelUsage\+usage\+total_cost_usd>0:/.test(x.motivo)));
  // «chegou» e por evidencia: as provas sao exigidas e o aceite null invalida por si, mesmo com arrancou:false
  const r5 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3', { tests_corridos: null })]);
  assert.ok(r5.marcas.some((x) => x.tipo === 'campo_em_falta' && /provas da aceitacao: tests_corridos/.test(x.motivo)), 'a prova e exigida numa linha que chegou por evidencia');
  const r6 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3', { aceite: null })]);
  assert.ok(r6.corrida_invalida_por.some((x) => /aceite null numa claude-p/.test(x.motivo)), 'aceite null invalida por si numa linha que chegou por evidencia');
  const r4 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), falhaB('t3', { modelUsage: null, usage: null })]);
  assert.ok(r4.marcas.some((x) => x.tipo === 'arrancou_contraditorio' && /tem session_id\+total_cost_usd>0:/.test(x.motivo)));
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

test('analise · 5.o NO-SHIP (R5-4/R5-4b): aceite:true sem prova (tudo null, ou so as contagens null) — campo_em_falta, corrida INVALIDA (27c)', () => {
  const p = preregDe(['t1', 't2']);
  const semNada = { exit_code: null, test_file_sha_antes: null, test_file_sha_depois: null, tests_corridos: null, tests_passados: null };
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', semNada), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r.primaria.n_pares_validos, 1);
  assert.match(r.fiabilidade.pares_invalidos[0].motivo, /aceite=true sem prova completa: exit_code, test_file_sha_antes/);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && /provas da aceitacao/.test(m.motivo)));
  assert.equal(r.corrida_valida, false);
  // R5-4b: correrAceitacao() do R-24 devolve {aceite,status,sinal} e nada mais — as contagens exigem codigo novo
  const r2 = correr(p, [tentativa('t1', 'A', { tests_corridos: null, tests_passados: null, skips: null }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r2.primaria.n_pares_validos, 1);
  assert.match(r2.fiabilidade.pares_invalidos[0].motivo, /tests_corridos, tests_passados/);
  assert.equal(r2.corrida_valida, false, '27c: um aceite=true que nao se verifica nao pode ficar nem sair — invalida a corrida');
  assert.ok(r2.corrida_invalida_por.some((x) => /aceite=true sem prova completa/.test(x.motivo)));
  // uma prova com o TIPO errado ('10' em vez de 10) conta como em falta, nao como presente
  const rTipo = correr(p, [tentativa('t1', 'A', { tests_corridos: '10' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(rTipo.corrida_invalida_por.some((x) => /aceite=true sem prova completa/.test(x.motivo) && /tests_corridos/.test(x.valores.join())), 'a prova com tipo errado conta como em falta, nao como presente');
  assert.ok(rTipo.marcas.some((m) => m.tipo === 'campo_em_falta' && /provas da aceitacao: tests_corridos/.test(m.motivo)));
  assert.equal(rTipo.corrida_valida, false);
  // numa tentativa que NAO chegou, as provas a null nao marcam
  const r3 = correr(p, [tentativa('t1', 'A'), naoArrancou('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r3.marcas.filter((m) => /provas da aceitacao/.test(m.motivo)).length, 0);
  assert.equal(PROVAS_DA_ACEITACAO.length, 6);
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
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: zeros, usage: { ...SONDA.usage, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })]);
  assert.equal(r.por_tarefa[0].B.tokens_opus, null);
  assert.ok(r.marcas.some((m) => m.tipo === 'tokens_zero_com_arrancou' && m.braco === 'B'));
  assert.ok(!r.marcas.some((m) => m.tipo === 'reconciliacao'), 'zero nos dois lados reconcilia — a marca certa e tokens_zero');
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
  assert.equal(r.corrida_valida, false, '31 (b1 do 12.o): numa linha que chegou, um tempo impossivel e (c) — a testemunha contradiz-se');
  assert.ok(r.corrida_invalida_por.some((x) => /tempo incoerente numa linha que chegou/.test(x.motivo) && x.valores.length === 2));
  // e por INSTANTE (m1 do 12.o): ts_fim 30 min antes por instante, mas lexicamente depois
  const m1 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ts_inicio: '2026-09-11T08:00:00.000Z', ts_fim: '2026-09-11T07:30:00.000Z' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(m1.marcas.some((x) => x.tipo === 'tempo_incoerente' && /antes de ts_inicio/.test(x.motivo)));
  // numa linha que NAO chegou (spawn puro), so marca — e (a) continua
  const rNao = correr(p, [tentativa('t1', 'A'), naoArrancou('t1', 'B', { ts_inicio: '2026-09-11T00:00:09Z', ts_fim: '2026-09-11T00:00:01Z' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(rNao.marcas.filter((m) => m.tipo === 'tempo_incoerente').length, 0, 'sem chegar, o tempo nao se julga; a curteza sim');
  // M274: ts_fim === ts_inicio numa linha que chegou, SEM duration_ms — nenhuma chamada ao CLI dura 0 ms
  const r0 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ts_inicio: '2026-09-11T08:00:00.000Z', ts_fim: '2026-09-11T08:00:00.000Z', duration_ms: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(r0.marcas.some((x) => x.tipo === 'tempo_incoerente' && /dura 0 ms/.test(x.motivo)));
  assert.equal(r0.corrida_valida, false);
  // M275: por instante, nao por string — «08:00:00.500Z» (inicio) vs «08:00:00Z» (fim): lexicamente o fim vem depois, por instante vem 500 ms antes
  const r5 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ts_inicio: '2026-09-11T08:00:00.500Z', ts_fim: '2026-09-11T08:00:00Z' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(r5.marcas.some((x) => x.tipo === 'tempo_incoerente' && /antes de ts_inicio/.test(x.motivo)), '500 ms antes por instante');
  // duration_ms a horas do intervalo dos ts: so marca (velocidade)
  const rD = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { duration_ms: 5000, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:02:00Z' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(rD.marcas.some((m) => m.tipo === 'duracao_incoerente'));
  assert.equal(rD.corrida_valida, true);
  const r2 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree nao reconstruiu', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'exclusao_com_pre_voo_falhado' && m.task_id === 't2'));
  assert.equal(r2.corrida_valida, false, '29 (X1 do 10.o): o pre-voo correu no worktree e falhou — nenhuma das duas saidas do prereg se aplica');
  assert.ok(r2.corrida_invalida_por.some((x) => /excluida com pre-voo falhado/.test(x.motivo)));
  const r3 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2', { exit_code: 0, falhou: false }), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'pre-voo passou', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.equal(r3.marcas.filter((m) => m.tipo === 'exclusao_com_pre_voo_falhado').length, 0, 'pre-voo que passou justifica a exclusao');
});

// ── 6.o NO-SHIP: tecto com aceite:true, tentativa_inicio, ordem observada, tier null, coerencias baratas ──

test('analise · 6.o NO-SHIP (B1): claude-p que chegou SEM JSON com aceite:true — «estourar o tecto = nao aceite»; contraditorio, corrida INVALIDA', () => {
  // E1b: timeout, sem session_id, sem JSON, ts_fim = ts_inicio + 905 s, aceite:true com prova coerente — o correr-r24 corre a aceitacao DEPOIS do timeout
  const tecto = (id, b, over = {}) => tentativa(id, b, { arrancou: true, motivo_se_nao: null, session_id: `sess-tecto-${id}-${b}`, tokens_transcript: 250000, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null,   // 56/58: um tecto sem JSON prova-se pelo transcript (tokens_transcript), nao pelo session_id
    ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:15:05Z', aceite: true, ...over });
  assert.match(aceiteContraditorio(tecto('x', 'B'), null), /sem JSON/);
  assert.match(aceiteContraditorio(tecto('x', 'B', { session_id: 'sess-z', tokens_transcript: 41000 }), null), /sem JSON/, 'E1a: com transcript continua sem resultado');
  assert.match(aceiteContraditorio(tecto('x', 'B', { arrancou: null, session_id: 'sess-z' }), null), /sem JSON/, 'chegou por session_id, sem flag');
  assert.equal(aceiteContraditorio(tecto('x', 'B', { modelUsage: { 'claude-sonnet-4-5': SONDA.modelUsage['claude-opus-5'] } }), null), null, 'JSON sem Opus e a interpretacao 20, nao esta');
  assert.equal(aceiteContraditorio(tecto('x', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }), null), null, 'tecto com aceite:false e o esperado');
  const p = preregDe(['t1', 't2', 't3']);
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), tecto('t3', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /aceite contraditorio/.test(x.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'aceite_contraditorio' && /estourar o tecto/.test(m.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'tecto_aparente' && m.task_id === 't3'), 'ts_fim - ts_inicio >= 900 s com aceite:true marca');
  assert.equal(r.primaria.limiar_descritivo_cumprido, null, 'antes: A 3 B 3, cumprido');
  // o mesmo tecto com aceite:false: par valido (B nao aceite), corrida valida, sem tecto_aparente
  const r2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t3', 'A'), tecto('t3', 'B', { aceite: false, exit_code: 1, tests_passados: 9 })]);
  assert.equal(r2.corrida_valida, true);
  assert.equal(r2.primaria.n_pares_validos, 3);
  assert.equal(r2.por_tarefa[2].B.aceite, false);
  assert.equal(r2.marcas.filter((m) => m.tipo === 'tecto_aparente').length, 1, 'tecto_aparente marca independentemente de aceite (7.o revisor)');
  assert.ok(r2.marcas.some((m) => m.tipo === 'consumo_do_transcript'), '58: o tecto honesto tem transcript — o consumo vem de la');
});

test('analise · 6.o NO-SHIP (I1): tentativa_inicio — reinicio da mesma tentativa invalida a corrida; inicio sem fim marca; sem inicios nao se verifica', () => {
  const p = preregDe(['t1']);
  const ini = (id, b, tentativa = 1) => ({ evento: 'tentativa_inicio', task_id: id, braco: b, tentativa, ts: 'x' });
  const r = correr(p, [ini('t1', 'A'), tentativa('t1', 'A'), ini('t1', 'B'), ini('t1', 'B'), tentativa('t1', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /tentativa reiniciada/.test(x.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_reiniciada' && m.braco === 'B'));
  const r2 = correr(p, [ini('t1', 'A'), tentativa('t1', 'A'), ini('t1', 'B'), tentativa('t1', 'B'), ini('t1', 'B', 2)]);
  assert.equal(r2.corrida_valida, false, '37: um inicio sem fim numa corrida sem paragem e um braco lancado a mais');
  assert.ok(r2.corrida_invalida_por.some((x) => /interpretacao 37/.test(x.motivo)));
  assert.ok(r2.marcas.some((m) => m.tipo === 'tentativa_sem_fim' && m.braco === 'B' && m.tentativa === 2));
  assert.ok(r2.fiabilidade.pares_invalidos.some((x) => x.task_id === 't1' && /retoma escondida/.test(x.motivo)), '(c) no par');
  // com paragem, o ULTIMO inicio do ledger pode ficar sem fim (morte a meio): so marca
  const r2p = correr(p, [ini('t1', 'A'), tentativa('t1', 'A'), ini('t1', 'B'), tentativa('t1', 'B'), ini('t1', 'B', 2), { evento: 'paragem', motivo: 'morreu a meio', n: 1 }]);
  assert.ok(!r2p.corrida_invalida_por.some((x) => /interpretacao 37/.test(x.motivo)), 'ultimo inicio antes da paragem: legitimo');
  assert.ok(r2p.marcas.some((m) => m.tipo === 'tentativa_sem_fim' && /morte a meio/.test(m.motivo)));
  const r3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r3.marcas.length, 0, 'sem inicios, nada a verificar');
});

test('analise · 6.o NO-SHIP (I2): ordem dos bracos OBSERVADA por ts_inicio; divergente do prereg marca; timestamps iguais nao carregam ordem', () => {
  const p = preregDe(['t1', 't2'], {}, undefined, { t1: 'A-depois-B', t2: 'B-depois-A' });   // t1: B primeiro; t2: A primeiro
  const ok = correr(p, [
    tentativa('t1', 'A', { ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:15Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }),
    tentativa('t2', 'A', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), tentativa('t2', 'B', { ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:15Z' }),
  ]);
  assert.equal(ok.marcas.length, 0, JSON.stringify(ok.marcas));
  assert.equal(ok.por_tarefa[0].ordem_observada, 'A-depois-B');
  assert.equal(ok.por_tarefa[1].ordem_observada, 'B-depois-A');
  // o loop ingenuo «A; B» em tudo
  const mau = correr(p, [
    tentativa('t1', 'A', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:15Z' }),
    tentativa('t2', 'A', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), tentativa('t2', 'B', { ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:15Z' }),
  ]);
  const m = mau.marcas.filter((x) => x.tipo === 'ordem_divergente');
  assert.equal(m.length, 1); assert.equal(m[0].task_id, 't1');
  assert.equal(mau.corrida_valida, false, '29 (S1b do 10.o): o contrabalanco e protocolo — trocar o rotulo A<->B em T3 e indetectavel de outra forma');
  assert.match(mau.fiabilidade.pares_invalidos[0].motivo, /ordem dos bracos divergente.*CORRIDA INVALIDA/);
  assert.equal(mau.por_tarefa[0].ordem_dos_bracos, 'A-depois-B', 'o prereg continua publicado');
  assert.equal(mau.por_tarefa[0].ordem_observada, 'B-depois-A', 'e o observado ao lado');
  // timestamps iguais: ordem n/d; marca ts_iguais_entre_bracos (29: dois spawns sequenciais nao partilham o instante) — so marca
  const ts0 = { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' };
  const igual = correr(p, [tentativa('t1', 'A', ts0), tentativa('t1', 'B', ts0), tentativa('t2', 'A', ts0), tentativa('t2', 'B', ts0)]);
  assert.equal(igual.por_tarefa[0].ordem_observada, null);
  assert.deepEqual(igual.marcas.map((m) => m.tipo), ['ts_iguais_entre_bracos', 'bracos_intercalados', 'ts_iguais_entre_bracos', 'bracos_intercalados']);
  assert.equal(igual.corrida_valida, false, '30: intervalos iguais sobrepoem-se — os bracos correm um inteiro antes do outro');
  // 30 (K1b/K2b do 11.o): a ordem e por INSTANTE — um offset «-03:00» ou «.500Z» vs «Z» nao a troca
  const pK = preregDe(['t1'], {}, undefined, { t1: 'A-depois-B' });   // B primeiro
  const k1 = correr(pK, [tentativa('t1', 'A', { ts_inicio: '2026-09-11T08:00:00.000Z', ts_fim: '2026-09-11T08:00:05.000Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T07:00:00.000-03:00', ts_fim: '2026-09-11T07:00:05.000-03:00' })]);
  assert.equal(k1.por_tarefa[0].ordem_observada, 'B-depois-A', 'B a 07:00-03:00 = 10:00Z, DEPOIS de A as 08:00Z');
  assert.equal(k1.corrida_valida, false);
  const k2 = correr(pK, [tentativa('t1', 'A', { ts_inicio: '2026-09-11T08:00:00Z', ts_fim: '2026-09-11T08:00:05Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T08:00:00.500Z', ts_fim: '2026-09-11T08:00:05.500Z' })]);
  assert.equal(k2.por_tarefa[0].ordem_observada, 'B-depois-A', '.500Z e 500 ms DEPOIS');
  assert.equal(k2.corrida_valida, false);
  // K3: a escalacao de B a correr DEPOIS de A numa tarefa em que B vem primeiro — intervalos sobrepostos
  const pK3 = preregDe(['t1'], { t1: 'T0' }, undefined, { t1: 'A-depois-B' });
  const k3 = correr(pK3, [passoLocal('t1', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:03Z' }), tentativa('t1', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:20:00Z', ts_fim: '2026-09-11T00:20:05Z' }), escalacao('t1', { ts_inicio: '2026-09-11T02:00:00Z', ts_fim: '2026-09-11T02:00:05Z' })]);
  assert.equal(k3.por_tarefa[0].ordem_observada, 'A-depois-B', 'pelo primeiro ts, B vem primeiro — e e por isso que so a ordem nao chega');
  assert.ok(k3.marcas.some((m) => m.tipo === 'bracos_intercalados'));
  assert.equal(k3.corrida_valida, false);
  assert.match(k3.fiabilidade.pares_invalidos[0].motivo, /bracos intercalados.*CORRIDA INVALIDA/);
  // fronteira: B a comecar EXACTAMENTE quando A acaba e sequencial, nao intercalado
  const toque = correr(preregDe(['t1']), [tentativa('t1', 'A', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T00:00:05Z', ts_fim: '2026-09-11T00:00:10Z' })]);
  assert.equal(toque.marcas.filter((m) => m.tipo === 'bracos_intercalados').length, 0);
  assert.equal(toque.corrida_valida, true);
  const umMs = correr(preregDe(['t1']), [tentativa('t1', 'A', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05.001Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T00:00:05Z', ts_fim: '2026-09-11T00:00:10Z' })]);
  assert.equal(umMs.marcas.filter((m) => m.tipo === 'bracos_intercalados').length, 1, '1 ms de sobreposicao ja e intercalado');
});

test('analise · 6.o NO-SHIP (I3 e N1): tier null no corpus marca; pre_voo incoerente; e_escalacao incoerente; motivo com arrancou; tentativa 2 sem 1', () => {
  const p = preregDe(['t1']);
  const r = correr(p, [tentativa('t1', 'A', { tier_classificado: null }), tentativa('t1', 'B')]);
  assert.ok(r.marcas.some((m) => m.tipo === 'campo_em_falta' && /tier_classificado/.test(m.motivo)));
  assert.equal(r.primaria.n_pares_validos, 1, 'so marca');
  const r2 = analisar(p, [preVoo('t1', { falhou: true, exit_code: 0 }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'pre_voo_incoerente'));
  const r3 = correr(p, [tentativa('t1', 'A', { e_escalacao: true }), tentativa('t1', 'B')]);
  assert.ok(r3.marcas.some((m) => m.tipo === 'escalacao_incoerente' && m.braco === 'A'));
  const r4 = correr(p, [tentativa('t1', 'A', { motivo_se_nao: 'timeout' }), tentativa('t1', 'B')]);
  assert.ok(r4.marcas.some((m) => m.tipo === 'motivo_com_arrancou' && m.braco === 'A'));
  const r5 = correr(preregDe(['t1'], { t1: 'T0' }), [tentativa('t1', 'A', { tier_classificado: 'T0' }), escalacao('t1')]);   // tentativa 2 sem tentativa 1
  assert.match(r5.fiabilidade.pares_invalidos[0].motivo, /B com tentativa 2 sem tentativa 1/);
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
    // 6.o revisor
    E1b: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { session_id: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null, ts_fim: '2026-09-11T00:15:05Z' })],
    E1a: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null, tokens_transcript: 41000, ts_fim: '2026-09-11T00:15:05Z' })],
    E4: [...parOk('t1', 'T3'), { evento: 'tentativa_inicio', task_id: 't2', braco: 'B', tentativa: 2 }, { evento: 'tentativa_inicio', task_id: 't2', braco: 'B', tentativa: 2 }, tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2')],
    // 7.o revisor: timeout com arrancou:null
    E2: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { arrancou: null, motivo_se_nao: 'timeout', session_id: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null, ts_fim: '2026-09-11T00:15:05Z', aceite: false, exit_code: 1 })],
    E2b: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { arrancou: null, motivo_se_nao: null, session_id: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null, ts_fim: '2026-09-11T00:15:05Z', aceite: false, exit_code: 1 })],
    // 8.o revisor: (ii) rejeicao sem prova completa CONTA; (i) escalacao em falta invalida; (iii) spawn:ETIMEDOUT com ts iguais; tipo invalido noutra chave
    Q7ii: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { aceite: false, exit_code: null, tests_corridos: null, tests_passados: null })],
    Q7i: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2')],
    Q7iii: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), naoArrancou('t2', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', motivo_se_nao: 'spawn:ETIMEDOUT', duration_ms: 900000, ts_inicio: '2026-09-11T00:15:05Z', ts_fim: '2026-09-11T00:15:05Z' })],
    Q7tipo: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { aceite: false, exit_code: 1, tests_passados: 9, duration_ms: '4471' })],
    // 9.o revisor: a saida (a) verificavel (28); 27b so para B; «curto»; evidencia alargada; aceite=true sem arranque
    R9nu: [tentativa('t1', 'B'), { evento: 'par_invalido', task_id: 't1', braco: 'A', motivo: null }, ...parOk('t2', 'T0')],
    R9i1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'timeout apos 900 s' }],
    R9i6: [tentativa('t1', 'A'), { evento: 'par_invalido', task_id: 't1', braco: 'A', motivo: 'spawn:ENOENT' }, ...parOk('t2', 'T0')],
    R9semLinha: [tentativa('t1', 'A'), ...parOk('t2', 'T0')],
    R9delta: [tentativa('t1', 'A', { aceite: false, exit_code: 0, tests_corridos: null, tests_passados: null }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R9a3: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { arrancou: null, motivo_se_nao: null, session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, duration_ms: 600000, ts_fim: '2026-09-11T00:10:00Z' })],
    R9b1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), naoArrancou('t2', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', duration_ms: 50, ts_fim: '2026-09-11T00:14:59Z' })],
    R9g2: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), naoArrancou('t2', 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', usage: { input_tokens: 5, output_tokens: 7 } }), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }],
    R9k1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { arrancou: false, motivo_se_nao: 'spawn:ENOENT', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: true, duration_ms: 50 })],
    // 10.o revisor (29)
    R10x1: [preVoo('t2'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree', suplente_usado: 's1' }, ...parOk('t1', 'T3'), preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')],
    R10x3: [{ evento: 'tentativa_inicio', task_id: 't2', braco: 'B', tentativa: 1 }, { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree', suplente_usado: 's1' }, ...parOk('t1', 'T3'), preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')],
    R10e4: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { skips: 5, tests_corridos: 15 })],
    R10e6: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { skips: null, tests_corridos: 15 })],
    R10y1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { test_file_sha_antes: 'OUTRO', test_file_sha_depois: 'OUTRO' })],
    R10s1b: [tentativa('t1', 'B'), tentativa('t1', 'A'), ...parOk('t2', 'T0')],
    R10v1: [preVoo('t1', { exit_code: 0, falhou: false }), preVoo('t1'), ...parOk('t1', 'T3'), ...parOk('t2', 'T0')],
    R10res: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { arrancou: null, motivo_se_nao: null, session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, skips: null, duration_ms: 50 })],
    // 11.o revisor (30)
    R11k1b: [tentativa('t1', 'A', { ts_inicio: '2026-09-11T08:00:00.000Z', ts_fim: '2026-09-11T08:00:05.000Z' }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T09:00:00.000+03:00', ts_fim: '2026-09-11T09:00:05.000+03:00' }), ...parOk('t2', 'T0')],   // B «09:00+03:00» = 06:00Z, ANTES de A — lexicamente parece depois
    R11k4b: [{ evento: 'pre_voo', task_id: 't1', falhou: true, skips: 0 }, ...parOk('t1', 'T3'), ...parOk('t2', 'T0')],
    R11k4: [preVoo('t1', { exit_code: 0 }), ...parOk('t1', 'T3'), ...parOk('t2', 'T0')],
    R11b4b: [tentativa('t1', 'A', { estado_vivo_sha: null }), tentativa('t1', 'B', { estado_vivo_sha: null }), tentativa('t2', 'A', { tier_classificado: 'T0', estado_vivo_sha: null }), passoLocal('t2', { estado_vivo_sha: null }), escalacao('t2', { estado_vivo_sha: 'ev-MUDOU' })],
    R11e1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { modelUsage: SONDA.modelUsage, usage: SONDA.usage, total_cost_usd: SONDA.total_cost_usd, session_id: 'sess-local' }), escalacao('t2')],
    R11j1: [tentativa('t1', 'A', { tecto_do_orcamento: 0.1, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R11k8: [naoArrancou('t1', 'A'), tentativa('t1', 'B'), { evento: 'par_invalido', task_id: 't1', braco: 'A', motivo: 'spawn:ENOENT' }, { evento: 'par_invalido', task_id: 't1', braco: 'B', motivo: 'timeout' }, ...parOk('t2', 'T0')],
    R11k3: [passoLocal('t2', { ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:03Z' }), tentativa('t2', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:20:00Z', ts_fim: '2026-09-11T00:20:05Z' }), escalacao('t2', { ts_inicio: '2026-09-11T02:00:00Z', ts_fim: '2026-09-11T02:00:05Z' }), ...parOk('t1', 'T3')],
    // 12.o revisor (31)
    R12a1: [tentativa('t1', 'B'), tentativa('t1', 'A', { ts_inicio: '2026-09-11T08:00:00.000Z ', ts_fim: '2026-09-11T08:00:05.000Z ' }), ...parOk('t2', 'T0')],
    R12a3: [tentativa('t1', 'B'), tentativa('t1', 'A', { ts_inicio: '2026-09-11T08:00:00', ts_fim: '2026-09-11T08:00:05' }), ...parOk('t2', 'T0')],
    R12l1: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { aceite: null }), escalacao('t2', { aceite: false, exit_code: 1, tests_passados: 9 })],
    R12c2: (() => { const a = tentativa('t1', 'A'); delete a.ts_inicio; return [tentativa('t1', 'B'), a, ...parOk('t2', 'T0')]; })(),
    R12b1: [tentativa('t1', 'A'), tentativa('t1', 'B', { ts_inicio: '2026-09-11T08:00:00Z', ts_fim: '2026-09-11T07:59:00Z' }), ...parOk('t2', 'T0')],
    R12g1: [...parOk('t1', 'T3', { usage: { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } }), ...parOk('t2', 'T0')],
    // 13.o revisor (32)
    R13s1: [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B', { tentativa: 2, e_escalacao: true }), ...parOk('t2', 'T0')],
    R13s3: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), passoLocal('t2', { ts_inicio: '2026-09-11T00:10:00Z', ts_fim: '2026-09-11T00:10:30Z' }), escalacao('t2', { ts_inicio: '2026-09-11T00:10:10Z', ts_fim: '2026-09-11T00:10:20Z' })],
    R13a08: [...parOk('t1', 'T3'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2', { e_escalacao: false })],
    // 14.o revisor (33)
    R14f1b: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelo_pedido: 'claude-opus-4-1', modelo_reportado: 'claude-opus-4-1', modelUsage: { 'claude-opus-4-1': SONDA.modelUsage['claude-opus-5'] } }), ...parOk('t2', 'T0')],
    R14f4: [tentativa('t1', 'A', { modelo_pedido: null }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    // 15.o revisor (34-36)
    R15x1b: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t1', 'X', { aceite: false, exit_code: 1, tests_passados: 9, session_id: 'x-1' }), ...parOk('t2', 'T0')],
    R15x2: [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tentativa_fim_descartada', task_id: 't1', braco: 'B', aceite: false }, ...parOk('t2', 'T0')],
    R15xi: [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tentativa_inicio', task_id: 't1', braco: 'X', tentativa: 1, ts_inicio: '2026-09-10T00:00:00Z' }, ...parOk('t2', 'T0')],
    R15x3: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], cacheCreationInputTokens: 0 } } }), ...parOk('t2', 'T0')],
    R15x6: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: null, tokens_transcript: 1000, aceite: false, exit_code: 1, tests_passados: 9 }), ...parOk('t2', 'T0')],
    R15x5: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0001 } }, usage: { ...SONDA.usage, input_tokens: 2, output_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }), ...parOk('t2', 'T0')],
    R15x4: [tentativa('t1', 'A', { modelUsage: { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0001 }, 'claude-sonnet-5': { inputTokens: 300000, outputTokens: 10000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 1 } }, usage: { ...SONDA.usage, input_tokens: 300002, output_tokens: 10004, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    // 16.o revisor (37-40)
    R16y1: [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tentativa_inicio', task_id: 't1', braco: 'B', tentativa: 2, ts_inicio: '2026-09-10T00:00:00Z' }, ...parOk('t2', 'T0')],
    R16y21: [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tentativa_inicio', task_id: 't1', braco: 'B', tentativa: 9, ts_inicio: '2026-09-10T00:00:00Z' }, ...parOk('t2', 'T0')],
    R16y2: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], cacheReadInputTokens: -900 } }, usage: { ...SONDA.usage, cache_read_input_tokens: -900 } }), ...parOk('t2', 'T0')],
    R16y2c: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], outputTokens: -50000 } }, usage: { ...SONDA.usage, output_tokens: -50000 } }), ...parOk('t2', 'T0')],
    R16y2s: [tentativa('t1', 'A'), tentativa('t1', 'B', { usage: { ...SONDA.usage, cache_creation_input_tokens: '58964' } }), ...parOk('t2', 'T0')],
    // 17.o revisor (41-45)
    R17z8: [tentativa('t1', 'A', { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 11 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R17z8b: [tentativa('t1', 'A', { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 10, skips: 5 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R17z9: [tentativa('t1', 'A', { aceite: false, exit_code: 1.5 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R17z9b: [tentativa('t1', 'A', { aceite: false, exit_code: 1, tests_corridos: 9.5, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R17z13: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { arrancou: false, motivo_se_nao: 'spawn:ECONNREFUSED', tokens_locais: null, texto_local_sha256: null }), escalacao('t2')],
    // 18.o revisor (46-51)
    R18w2: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { arrancou: null, tokens_locais: 0, texto_local_sha256: SHA256_VAZIO }), escalacao('t2')],
    R18w3: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { modelo_pedido: 'claude-opus-5', modelo_reportado: 'claude-opus-5' }), escalacao('t2')],
    R18w17: [tentativa('t1', 'A', { duration_ms: 1000000 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R18w47: [tentativa('t1', 'A', { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 8, skips: 0 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R18w9: [preVoo('t1', { ts: '2026-09-11T00:00:00Z' }), tentativa('t1', 'A'), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    // 19.o revisor (52-55)
    R19y2b: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { arrancou: true, texto_local_sha256: null }), escalacao('t2')],
    R19y2c: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { arrancou: true, tokens_locais: null }), escalacao('t2')],
    R19y3: [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { modelo_pedido: 'gpt-5', modelo_reportado: 'gpt-5' }), escalacao('t2')],
    R19y4: [tentativa('t1', 'A'), tentativa('t1', 'B', { duration_ms: null, ts_fim: '2026-09-11T00:20:00Z' }), ...parOk('t2', 'T0')],
    R19y14: [tentativa('t1', 'A', { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 10, skips: 0 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R19y7: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'Claude-Opus-5': SONDA.modelUsage['claude-opus-5'] }, modelo_reportado: 'Claude-Opus-5' }), ...parOk('t2', 'T0')],
    // 20.o revisor (56/57)
    R20a1: [tentativa('t1', 'A', { arrancou: true, session_id: null, usage: null, modelUsage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    // 21.o revisor (58)
    R21a1: [tentativa('t1', 'A', { arrancou: true, session_id: 'sess-pre-gerado', usage: null, modelUsage: null, total_cost_usd: null, tokens_transcript: 0, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 900000 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R21a1b: [tentativa('t1', 'A', { arrancou: true, session_id: 'sess-pre-gerado', usage: null, modelUsage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 180000 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R21a1c: [tentativa('t1', 'A', { arrancou: true, session_id: null, usage: null, modelUsage: null, total_cost_usd: 0.01, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R21a9: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: '300000', outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.3 } } }), ...parOk('t2', 'T0')],
    // 22.o revisor (60, 61)
    R22a1: [tentativa('t1', 'A', { usage: {}, modelUsage: null, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R22a2: [tentativa('t1', 'A', { usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } }, total_cost_usd: 0, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R22a2b: [tentativa('t1', 'A', { usage: { input_tokens: 500, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 500, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0028 } }, total_cost_usd: 0.0028, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B'), ...parOk('t2', 'T0')],
    R22a25: [tentativa('t1', 'A'), tentativa('t1', 'B', { usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } }, total_cost_usd: 0 }), ...parOk('t2', 'T0')],
    R22a5b: [preVoo('t1', { exit_code: 1, falhou: false }), { evento: 'tarefa_excluida', task_id: 't1', motivo: 'ja verde', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B'), ...parOk('t2', 'T0')],
    R20a2: [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], inputTokens: 55000, outputTokens: 4000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.375 } }, usage: { ...SONDA.usage, input_tokens: 55000, output_tokens: 4000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } }, total_cost_usd: 0.375 }), ...parOk('t2', 'T0')],
  };
  // O que cada ataque tem de produzir. 'corrida' = corrida INVALIDA (veredicto null por arrasto);
  // 'veredicto' = sem veredicto; 'par' = esse par invalido (o par limpo ao lado DA veredicto, e isso e legitimo);
  // 'tokens' = consumo n/d (a aceitacao nao e afectada).
  const esperado = {
    P7A: { veredicto: null }, P7B: { corrida: false }, P7C: { veredicto: null },
    P7D: { corrida: false }, P7E: { veredicto: null }, P7F: { corrida: false }, P7G: { corrida: false },
    P7H: { corrida: false }, P7I: { tokens: null }, P7J: { corrida: false }, P7K: { corrida: false }, L1: { corrida: false },
    R51: { corrida: false }, R52: { corrida: false }, R53: { corrida: false }, R54: { corrida: false }, R54b: { corrida: false }, R56: { corrida: false }, R57: { tokens: null }, R58: { corrida: false },
    Q7ii: { direccao: true }, Q7i: { corrida: false }, Q7iii: { corrida: false }, Q7tipo: { corrida: false },
    R9nu: { corrida: false }, R9i1: { corrida: false }, R9i6: { corrida: false }, R9semLinha: { corrida: false }, R9delta: { corrida: false }, R9a3: { corrida: false }, R9b1: { corrida: false }, R9g2: { corrida: false }, R9k1: { corrida: false },
    R10x1: { corrida: false }, R10x3: { corrida: false }, R10e4: { corrida: false }, R10e6: { corrida: false }, R10y1: { corrida: false }, R10s1b: { corrida: false }, R10v1: { corrida: false }, R10res: { corrida: false },
    R11k1b: { corrida: false }, R11k4b: { corrida: false }, R11k4: { corrida: false }, R11b4b: { veredicto: null }, R11e1: { corrida: false }, R11j1: { corrida: false }, R11k8: { corrida: false }, R11k3: { corrida: false },
    R12a1: { corrida: false }, R12a3: { corrida: false }, R12l1: { corrida: false }, R12c2: { corrida: false }, R12b1: { corrida: false }, R12g1: { valorizacao: null },
    R13s1: { corrida: false }, R13s3: { corrida: false }, R13a08: { corrida: false },
    R14f1b: { corrida: false }, R14f4: { corrida: false },
    R15x1b: { corrida: false, par: 't1' }, R15x2: { corrida: false, par: 't1' }, R15xi: { corrida: false, par: 't1' }, R15x3: { tokensB: null }, R15x6: { tokensB: null }, R15x5: { corrida: false, par: 't1' } /* 60: 6 tokens nos dois lados */, R15x4: { corrida: false, par: 't1' },
    R16y1: { corrida: false, par: 't1' }, R16y21: { corrida: false, par: 't1' }, R16y2: { corrida: false, par: 't1' }, R16y2c: { corrida: false, par: 't1' }, R16y2s: { corrida: false, par: 't1' },
    R17z8: { corrida: false, par: 't1' }, R17z8b: { corrida: false, par: 't1' }, R17z9: { corrida: false, par: 't1' }, R17z9b: { corrida: false, par: 't1' }, R17z13: { corrida: false },
    R18w2: { corrida: false }, R18w3: { corrida: false, par: 't2' }, R18w17: { corrida: false, par: 't1' }, R18w47: { corrida: false, par: 't1' }, R18w9: { corrida: false, par: 't1' },
    R19y2b: { corrida: false }, R19y2c: { corrida: false }, R19y3: { corrida: false, par: 't2' }, R19y4: { corrida: false, par: 't1' }, R19y14: { corrida: false, par: 't1' }, R19y7: { corrida: false, par: 't1' },
    R20a1: { corrida: false, par: 't1' }, R20a2: { marca: 'abaixo_da_sonda' },
    R21a1: { corrida: false, par: 't1' }, R21a1b: { corrida: false, par: 't1' }, R21a1c: { corrida: false, par: 't1' }, R21a9: { corrida: false, par: 't1' },
    R22a1: { corrida: false, par: 't1' }, R22a2: { corrida: false, par: 't1' }, R22a2b: { corrida: false, par: 't1' }, R22a25: { corrida: false, par: 't1' }, R22a5b: { corrida: false },
    E1b: { corrida: false }, E1a: { corrida: false }, E4: { corrida: false }, E2: { corrida: false }, E2b: { corrida: false },
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
    if ('tokensB' in e) { assert.equal(r.secundaria.global.B.tokens_opus_total, null, `${nome}: tokens B n/d (35/36)`); assert.notEqual(r.secundaria.global.A.tokens_opus_total, null, `${nome}: A nao e tocado`); assert.equal(r.corrida_valida, true, `${nome}: nao toca a primaria`); }
    if ('marca' in e) { assert.ok(r.marcas.some((m) => m.tipo === e.marca), `${nome}: devia marcar ${e.marca}`); assert.equal(r.corrida_valida, true, `${nome}: so marca`); }
    if ('valorizacao' in e) { assert.equal(r.valorizacao.A.valorizacao_teorica_usd, null, `${nome}: a valorizacao com reparticao n/d e null, nunca zero`); assert.ok(r.corrida_valida === true, `${nome}: nao toca a primaria`); }
    if ('direccao' in e) { assert.equal(r.corrida_valida, true, `${nome}: e uma saida (b), a corrida fica valida`); assert.equal(r.primaria.n_pares_validos, 2, `${nome}: o par CONTA`); assert.equal(r.primaria.aceites_B, 1, `${nome}: a falha de B conta contra B`); }
    // CONTROLO DE DIRECCAO (27): o ledger honesto deste desenho (t1 ok, t2 com B a falhar) da A 2 B 1 -> 1 >= 0 -> «cumprido» por vacuidade com n=2; com n=4 abaixo testa-se a direccao a serio
  }
  // Direccao com n suficiente: 4 tarefas, A 4/4, B 1 aceite + 3 falhas -> honesto «NAO cumprido» (1 < 2). Cada ataque aplicado as 3 falhas de B NUNCA pode dar «cumprido».
  {
    const p4 = preregDe(['t1', 't2', 't3', 't4']);
    const falha = { aceite: false, exit_code: 1, tests_passados: 9 };
    const honesto = correr(p4, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', falha), tentativa('t3', 'A'), tentativa('t3', 'B', falha), tentativa('t4', 'A'), tentativa('t4', 'B', falha)]);
    assert.equal(honesto.primaria.limiar_descritivo_cumprido, false, 'o ledger honesto da NAO cumprido');
    const ataquesB = {
      'sem prova (ii)': { ...falha, exit_code: null, tests_corridos: null, tests_passados: null },
      'aceite null': { aceite: null },
      'tipo invalido': { ...falha, duration_ms: '4471' },
      'arrancou null timeout': { ...falha, arrancou: null, motivo_se_nao: 'timeout', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, duration_ms: null, ts_fim: '2026-09-11T00:15:05Z' },
      'arrancou false com json': { ...falha, arrancou: false, motivo_se_nao: 'cli_is_error:x' },
      'sem pre_voo': { ...falha, __semPreVoo: true },
      'sem opus': { ...falha, modelUsage: { 'claude-sonnet-4-5': SONDA.modelUsage['claude-opus-5'] } },
      'aceite com skips a mais (E4)': { aceite: true, skips: 5, tests_corridos: 15 },
      'aceite com skips null (E6)': { aceite: true, skips: null, tests_corridos: 15 },
      'aceite com sha de outro ficheiro (Y1)': { aceite: true, test_file_sha_antes: 'OUTRO', test_file_sha_depois: 'OUTRO' },
      'aceite noutro Opus (f1b)': { aceite: true, modelo_pedido: 'claude-opus-4-1', modelo_reportado: 'claude-opus-4-1', modelUsage: { 'claude-opus-4-1': SONDA.modelUsage['claude-opus-5'] } },
      'residual (arrancou null sem motivo)': { ...falha, arrancou: null, motivo_se_nao: null, session_id: null, modelUsage: null, usage: null, total_cost_usd: null, exit_code: null, tests_corridos: null, tests_passados: null, skips: null, duration_ms: 50 },
      'aceite com pre_voo sem contrato (K4b)': { aceite: true, __preVoo: { falhou: true, skips: 0 } },
      'aceite com estado_vivo null (B4b)': { aceite: true, estado_vivo_sha: null },
      'aceite com JSON todo a zero (R22-A25)': { aceite: true, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } }, total_cost_usd: 0 },
      'aceite com usage {} (R22-A25b)': { aceite: true, usage: {}, modelUsage: null, total_cost_usd: null },
      'excluida «ja verde» com pre_voo falhou:false e exit 1 (R22-A5b)': { __excluirComPv: { exit_code: 1, falhou: false } },
    };
    for (const [nome, over] of Object.entries(ataquesB)) {
      const semPreVoo = over.__semPreVoo; const pvAtaque = over.__preVoo; const excluirComPv = over.__excluirComPv; const o = { ...over }; delete o.__semPreVoo; delete o.__preVoo; delete o.__excluirComPv;
      const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', o), tentativa('t3', 'A'), tentativa('t3', 'B', o), tentativa('t4', 'A'), tentativa('t4', 'B', o)];
      // 61: as 3 falhas de B excluidas «ja verde» com o pre-voo a dizer exit 1 e falhou:false, suplentes s1..s3 ambos aceites
      const evEx = excluirComPv ? [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), ...['t2', 't3', 't4'].flatMap((id, k) => [preVoo(id, excluirComPv), { evento: 'tarefa_excluida', task_id: id, motivo: 'ja verde', suplente_usado: `s${k + 1}` }, preVoo(`s${k + 1}`), tentativa(`s${k + 1}`, 'A'), tentativa(`s${k + 1}`, 'B')])] : null;
      const r = excluirComPv ? analisar(p4, evEx) : semPreVoo ? analisar(p4, [preVoo('t1'), ...ev]) : pvAtaque ? analisar(p4, [preVoo('t1'), ...['t2', 't3', 't4'].map((id) => ({ evento: 'pre_voo', task_id: id, ...pvAtaque })), ...ev]) : correr(p4, ev);
      assert.notEqual(r.primaria.limiar_descritivo_cumprido, true, `DIRECCAO ${nome}: o ataque as falhas de B deu «cumprido»`);
      assert.ok(r.corrida_valida !== true || r.primaria.limiar_descritivo_cumprido === false, `DIRECCAO ${nome}: ou conta contra B, ou a corrida nao e valida (false ou n/d)`);
    }
    // ESPELHO (9.o, δ): os mesmos ataques ao SUCESSO de A em t1 (onde B aceitou). Honesto A 4 B 1 -> NAO; baixar A para 3 -> 1 >= 1 -> «cumprido». Nenhum pode dar «cumprido».
    const ataquesA = {
      'A aceite=false sem prova (δ)': { aceite: false, exit_code: null, tests_corridos: null, tests_passados: null },
      'A aceite=false exit 0 sem contagens': { aceite: false, exit_code: 0, tests_corridos: null, tests_passados: null },
      'A aceite=false sentinela -1': { aceite: false, exit_code: -1, tests_corridos: null, tests_passados: null },
      'A aceite null': { aceite: null },
      'A tipo invalido': { duration_ms: '4471' },
      'A arrancou null timeout': { aceite: false, exit_code: 1, tests_passados: 9, arrancou: null, motivo_se_nao: 'timeout', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, duration_ms: null, ts_fim: '2026-09-11T00:15:05Z' },
      'A sem linha': { __semLinha: true },
      'A par_invalido motivo null sem linha (ν)': { __semLinha: true, __evento: { evento: 'par_invalido', task_id: 't1', braco: 'A', motivo: null } },
      'A par_invalido spawn sem linha': { __semLinha: true, __evento: { evento: 'par_invalido', task_id: 't1', braco: 'A', motivo: 'spawn:ENOENT' } },
      'A spawn puro mas longo': { arrancou: false, motivo_se_nao: 'spawn:ENOENT', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null, duration_ms: 600000 },
      'A spawn puro com custo': { arrancou: false, motivo_se_nao: 'spawn:ENOENT', session_id: null, modelUsage: null, usage: null, total_cost_usd: 0.5, aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null, duration_ms: 50 },
      'A rotulo trocado (S1b)': { __trocar: true },
      'A excluido com pre-voo falhado (X1)': { __excluir: true },
      'A com tecto 0.1 e rejeitado (J1)': { aceite: false, exit_code: 1, tests_passados: 9, tecto_do_orcamento: 0.1 },
      'A com ts sem zona (a3)': { ts_inicio: '2026-09-11T08:00:00', ts_fim: '2026-09-11T08:00:05' },
      'A com ts com espaco (a1)': { ts_inicio: '2026-09-11T08:00:00.000Z ', ts_fim: '2026-09-11T08:00:05.000Z ' },
      'A com ts_fim antes do inicio (b1)': { ts_inicio: '2026-09-11T08:00:00Z', ts_fim: '2026-09-11T07:59:00Z' },
      'A noutro Opus rejeitado (f5b)': { aceite: false, exit_code: 1, tests_passados: 9, modelo_pedido: 'claude-opus-4-1', modelo_reportado: 'claude-opus-4-1', modelUsage: { 'claude-opus-4-1': SONDA.modelUsage['claude-opus-5'] } },
      'A local rotulado router-execute (E1)': { executor: 'router-execute', modelo_pedido: 'ollama', tokens_locais: 900, texto_local_sha256: 'x', aceite: false, exit_code: 1, tests_passados: 9 },
      'A rejeitada com passados > corridos (Z8)': { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 11 },
      'A rejeitada com passados + skips > corridos (Z8b)': { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 10, skips: 5 },
      'A rejeitada com exit_code 1.5 (Z9)': { aceite: false, exit_code: 1.5 },
      'A rejeitada com corridos 9.5 (Z9b)': { aceite: false, exit_code: 1, tests_corridos: 9.5, tests_passados: 9 },
      'A rejeitada com exit 0 e passados + skips < corridos (W47)': { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 8, skips: 0 },
      'A rejeitada com exit 1 e tudo verde (Y14)': { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 10, skips: 0 },
      'A aceite sem duration_ms com ts a 1000 s (Y4b)': { duration_ms: null, ts_fim: '2026-09-11T00:20:00Z' },
      'A rejeitada com arrancou:true sem evidencia nenhuma (R20-A1)': { arrancou: true, session_id: null, usage: null, modelUsage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9 },
      'A rejeitada com session_id pre-gerado e transcript 0 (R21-A1)': { arrancou: true, session_id: 'sess-pre-gerado', usage: null, modelUsage: null, total_cost_usd: null, tokens_transcript: 0, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 900000 },
      'A rejeitada so com total_cost_usd sem JSON (R21-A1c)': { arrancou: true, session_id: null, usage: null, modelUsage: null, total_cost_usd: 0.01, aceite: false, exit_code: 1, tests_passados: 9 },
      'A rejeitada com usage {} e modelUsage null (R22-A1)': { usage: {}, modelUsage: null, aceite: false, exit_code: 1, tests_passados: 9 },
      'A rejeitada com JSON todo a zero (R22-A2)': { usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } }, total_cost_usd: 0, aceite: false, exit_code: 1, tests_passados: 9 },
      'A rejeitada com 510 tokens nos dois lados (R22-A2b)': { usage: { input_tokens: 500, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 500, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0028 } }, total_cost_usd: 0.0028, aceite: false, exit_code: 1, tests_passados: 9 },
      'A rejeitada com zeros e transcript 250k (R22-A28)': { usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, modelUsage: { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } }, total_cost_usd: 0, tokens_transcript: 250000, aceite: false, exit_code: 1, tests_passados: 9 },
    };
    const evA = (o, semLinha, evento, trocar = false, excluir = false) => [
      ...(excluir ? [preVoo('t1'), { evento: 'tarefa_excluida', task_id: 't1', motivo: 'worktree', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B', falha)] : trocar ? [tentativa('t1', 'B'), tentativa('t1', 'A')] : [...(semLinha ? [] : [tentativa('t1', 'A', o)]), tentativa('t1', 'B')]),
      ...(evento ? [evento] : []), tentativa('t2', 'A'), tentativa('t2', 'B', falha), tentativa('t3', 'A'), tentativa('t3', 'B', falha), tentativa('t4', 'A'), tentativa('t4', 'B', falha)];
    for (const [nome, over] of Object.entries(ataquesA)) {
      const o = { ...over }; const semLinha = o.__semLinha; const evento = o.__evento; const trocar = o.__trocar; const excluir = o.__excluir; delete o.__semLinha; delete o.__evento; delete o.__trocar; delete o.__excluir;
      const r = correr(p4, evA(o, semLinha, evento, trocar, excluir));
      assert.notEqual(r.primaria.limiar_descritivo_cumprido, true, `ESPELHO ${nome}: o ataque ao sucesso de A deu «cumprido»`);
      assert.equal(r.corrida_valida, false, `ESPELHO ${nome}: em A nao ha 27b — so 27c`);
    }
    // 15.o (34): a retoma escondida nas 3 falhas de B — como braco "X" ou como evento fora dos 6 — nunca «cumprido», nunca valida
    for (const [nome, extra] of Object.entries({
      'retoma em braco X (X1b)': (id) => tentativa(id, 'X', { ...falha, session_id: `x-${id}` }),
      'retoma em evento desconhecido (X2)': (id) => ({ evento: 'tentativa_fim_descartada', task_id: id, braco: 'B', ...falha }),
      'retoma em tentativa_inicio orfao': (id) => ({ evento: 'tentativa_inicio', task_id: id, braco: 'X', tentativa: 1, ts_inicio: '2026-09-10T00:00:00Z' }),
    })) {
      const r = correr(p4, [tentativa('t1', 'A'), tentativa('t1', 'B'), ...['t2', 't3', 't4'].flatMap((id) => [tentativa(id, 'A'), tentativa(id, 'B'), extra(id)])]);
      assert.notEqual(r.primaria.limiar_descritivo_cumprido, true, `DIRECCAO ${nome}: deu «cumprido»`);
      assert.equal(r.corrida_valida, false, `DIRECCAO ${nome}: a corrida tem de ser INVALIDA`);
    }
    // 16.o (37): um tentativa_inicio B t2 (T3, sem local) ou t9 sem fim nas 3 falhas — a retoma do 16.o — nunca «cumprido», nunca valida
    for (const [nome, extra] of Object.entries({
      'inicio B t2 sem fim (Y1)': (id) => ({ evento: 'tentativa_inicio', task_id: id, braco: 'B', tentativa: 2, ts_inicio: '2026-09-10T00:00:00Z' }),
      'inicio B t9 sem fim (Y21)': (id) => ({ evento: 'tentativa_inicio', task_id: id, braco: 'B', tentativa: 9, ts_inicio: '2026-09-10T00:00:00Z' }),
    })) {
      const r = correr(p4, [tentativa('t1', 'A'), tentativa('t1', 'B'), ...['t2', 't3', 't4'].flatMap((id) => [tentativa(id, 'A'), tentativa(id, 'B'), extra(id)])]);
      assert.notEqual(r.primaria.limiar_descritivo_cumprido, true, `DIRECCAO ${nome}: deu «cumprido»`);
      assert.equal(r.corrida_valida, false, `DIRECCAO ${nome}: a corrida tem de ser INVALIDA`);
    }
    // espelho (37): A t2 sem fim (Y1b)
    {
      const rA = correr(p4, [tentativa('t1', 'A', falha), { evento: 'tentativa_inicio', task_id: 't1', braco: 'A', tentativa: 2, ts_inicio: '2026-09-10T00:00:00Z' }, tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', falha), tentativa('t3', 'A'), tentativa('t3', 'B', falha), tentativa('t4', 'A'), tentativa('t4', 'B', falha)]);
      assert.equal(rA.corrida_valida, false, 'ESPELHO Y1b: o braco A so tem a tentativa 1');
      assert.ok(rA.marcas.some((m) => m.tipo === 'inicio_fora_do_protocolo' && /so tem a tentativa 1/.test(m.motivo)));
    }
    // espelho (34): A com as falhas escondidas em "A_" — honesto A 2 B 1 -> cumprido; o ataque daria A 4 B 1 -> «NAO» valida. Tem de ser INVALIDA.
    {
      const honestoA = correr(p4, [tentativa('t1', 'A', falha), tentativa('t1', 'B'), tentativa('t2', 'A', falha), tentativa('t2', 'B', falha), tentativa('t3', 'A'), tentativa('t3', 'B', falha), tentativa('t4', 'A'), tentativa('t4', 'B', falha)]);
      assert.equal(honestoA.primaria.limiar_descritivo_cumprido, true, 'honesto: A 2 B 1 -> cumprido');
      const rA = correr(p4, [tentativa('t1', 'A'), tentativa('t1', 'A_', { ...falha, session_id: 'a1' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'A_', { ...falha, session_id: 'a2' }), tentativa('t2', 'B', falha), tentativa('t3', 'A'), tentativa('t3', 'B', falha), tentativa('t4', 'A'), tentativa('t4', 'B', falha)]);
      assert.equal(rA.corrida_valida, false, 'ESPELHO X1c: A retomada em "A_" nunca da «NAO cumprido · valida»');
      assert.equal(rA.primaria.limiar_descritivo_cumprido, null);
    }
    // A UNICA saida (a) em A: nao-arrancou puro, curto, sem evidencia. O par (A?, B✓) sai — e com ele o unico aceite de B: 3 pares, A 3 B 0 -> «NAO».
    // Retirar um par em que B aceitou e CONTRA B; a direccao favoravel a B e retirar (A?, B✗) — o que o 8.o NO-SHIP mostra a n=20 e so a saida (a) verificavel permite.
    const rPuroA = correr(p4, evA({ arrancou: false, motivo_se_nao: 'spawn:ENOENT', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null, duration_ms: 50 }, false, null));
    assert.equal(rPuroA.corrida_valida, true); assert.equal(rPuroA.primaria.n_pares_validos, 3); assert.equal(rPuroA.primaria.aceites_B, 0); assert.equal(rPuroA.primaria.limiar_descritivo_cumprido, false); assert.ok(rPuroA.primaria.AVISO_N, 'e diz que a primaria e sobre 3 dos 4');
  }
  // controlo positivo: o par limpo com a mesma bancada DA veredicto
  const limpo = correr(p, [...parOk('t1', 'T3'), ...parOk('t2', 'T0')]);
  assert.equal(limpo.primaria.limiar_descritivo_cumprido, true);
  assert.equal(limpo.corrida_valida, true);
  assert.equal(limpo.marcas.length, 0, JSON.stringify(limpo.marcas));
});

// ── 8.o revisor: a escada (interpretacao 27), contra o prereg REAL a n=20 ─────

test('analise · 8.o NO-SHIP (a escada, 27): um par que chegou ao CLI nunca sai do denominador — conta contra B (27b) ou a corrida e INVALIDA (27c)', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;   // 15/20 aceites em B -> honesto «NAO cumprido» (15 < 20-2)
  const indicesFalha = T.map((_, i) => i).filter((i) => !falhaB(i));
  assert.equal(indicesFalha.length, 5);
  const honesto = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) })));
  assert.equal(honesto.corrida_valida, true); assert.equal(honesto.marcas.length, 0, JSON.stringify(honesto.marcas));
  assert.equal(honesto.primaria.n_pares_validos, 20); assert.equal(honesto.primaria.aceites_B, 15);
  assert.equal(honesto.primaria.limiar_descritivo_cumprido, false, 'o ledger honesto da NAO cumprido');

  // A DIRECCAO: se as 5 falhas de B saissem do denominador pela unica saida legitima (spawn puro + par_invalido),
  // ficam 15 pares, A 15 B 15 -> «cumprido». E por isto que TODAS as outras saidas tem de ser (b) ou (c).
  const comoNaoArrancou = (t, over = {}) => [preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: t.tier_classificado, tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico }),
    ...(t.tier_classificado === 'T0' || t.tier_classificado === 'T1'
      ? [passoLocal(t.task_id, { tier_classificado: t.tier_classificado }), naoArrancou(t.task_id, 'B', { tentativa: 2, e_escalacao: true, tier_classificado: t.tier_classificado, ...over })]
      : [naoArrancou(t.task_id, 'B', { tier_classificado: t.tier_classificado, ...over })]),
    { evento: 'par_invalido', task_id: t.task_id, braco: 'B', motivo: over.motivo_se_nao || 'spawn:ENOENT' }];
  const legitimo = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : comoNaoArrancou(t))));
  assert.equal(legitimo.corrida_valida, true, 'spawn puro com par_invalido e a saida (a) — legitima por prereg');
  assert.equal(legitimo.primaria.n_pares_validos, 15);
  assert.equal(legitimo.primaria.limiar_descritivo_cumprido, true, 'a direccao: retirar os pares (A ok, B nao) da «cumprido»');
  assert.equal(legitimo.fiabilidade.pares_invalidos.length, 5);

  // (ii) rejeicao sem prova completa: aceite=false com exit_code/contagens null -> CONTA contra B, marca campo_em_falta, corrida valida
  const semProva = { exit_code: null, tests_corridos: null, tests_passados: null };
  const ii = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t, { aceiteB: false }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...semProva } : e)))));
  assert.equal(ii.corrida_valida, true, '27b: aceite=false sem prova completa nao invalida');
  assert.equal(ii.primaria.n_pares_validos, 20, 'o par CONTA');
  assert.equal(ii.primaria.aceites_B, 15);
  assert.equal(ii.primaria.limiar_descritivo_cumprido, false, '27b: NAO cumprido, como o honesto');
  assert.equal(ii.marcas.filter((m) => m.tipo === 'campo_em_falta' && /provas da aceitacao/.test(m.motivo)).length, 5);
  assert.equal(ii.fiabilidade.pares_invalidos.length, 0);

  // (i) as 7 T0 sem escalacao (A ok, so o passo local): por construcao o local nunca aceita -> cada par retirado seria (A ok, B nao) -> corrida INVALIDA
  const i7 = analisarReal(T.flatMap((t) => (t.tier_classificado === 'T0'
    ? [preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: 'T0', tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico }), passoLocal(t.task_id)]
    : parReal(t))));
  assert.equal(i7.corrida_fechou_os_pares, true);
  assert.equal(i7.corrida_valida, false, '27c');
  assert.equal(i7.primaria.limiar_descritivo_cumprido, null);
  assert.ok(i7.corrida_invalida_por.some((x) => /fora do protocolo/.test(x.motivo) && x.valores.length === 7), JSON.stringify(i7.corrida_invalida_por));
  assert.equal(i7.fiabilidade.pares_invalidos.filter((x) => /escalacao_em_falta/.test(x.motivo)).length, 7);

  // (iii) «spawn:ETIMEDOUT» com ts_fim === ts_inicio e duration_ms = tecto, e par_invalido escrito pelo controlador: durou como o tecto -> chegou -> nao e spawn puro -> INVALIDA
  const iii = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : comoNaoArrancou(t, { motivo_se_nao: 'spawn:ETIMEDOUT', duration_ms: 900000, ts_inicio: '2026-09-11T00:15:05Z', ts_fim: '2026-09-11T00:15:05Z' }))));
  assert.equal(iii.corrida_valida, false, '27c: o par_invalido do controlador nao chega — a evidencia contradiz o «nao arrancou»');
  assert.equal(iii.primaria.limiar_descritivo_cumprido, null);
  assert.ok(iii.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao'), tipos(iii).join(','));
  assert.ok(iii.marcas.some((m) => m.tipo === 'tempo_incoerente'), tipos(iii).join(','));
  assert.equal(iii.marcas.filter((m) => m.tipo === 'nao_arrancou_fora_da_definicao').length, 5);
  // e a variante so com ts iguais e duration_ms null (sem duracao medida) tambem nao passa por spawn puro: ETIMEDOUT nao e um spawn puro
  const iiib = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : comoNaoArrancou(t, { motivo_se_nao: 'spawn:ETIMEDOUT', duration_ms: null }))));
  assert.equal(iiib.corrida_valida, false, 'ETIMEDOUT e um tecto, nao um spawn que nao arrancou');
  assert.equal(iiib.primaria.limiar_descritivo_cumprido, null);
  // e um «spawn:ENOENT» (motivo puro) com ts iguais mas duration_ms = tecto: a duracao medida denuncia — durou como o tecto, logo chegou
  const iiic = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : comoNaoArrancou(t, { duration_ms: 900000, ts_inicio: '2026-09-11T00:15:05Z', ts_fim: '2026-09-11T00:15:05Z' }))));
  assert.equal(iiic.corrida_valida, false, 'duration_ms >= tecto conta como durou o tecto mesmo com ts iguais');
  assert.equal(iiic.marcas.filter((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && /900000|>= tecto/.test(m.motivo)).length, 5, tipos(iiic).join(','));
  assert.equal(iiic.marcas.filter((m) => m.tipo === 'tecto_aparente').length, 5);
  // controlo: o mesmo ENOENT com duration_ms 50 e ts iguais e um spawn puro — sai pela (a), corrida valida
  const iiid = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : comoNaoArrancou(t, { duration_ms: 50, ts_inicio: '2026-09-11T00:15:05Z', ts_fim: '2026-09-11T00:15:05Z' }))));
  assert.equal(iiid.corrida_valida, true);
  assert.equal(iiid.marcas.filter((m) => m.tipo === 'nao_arrancou_fora_da_definicao').length, 0);
});

// ── 9.o revisor: a saida (a) tem de ser VERIFICAVEL (interpretacao 28), a 27b so para B, «curto», evidencia alargada ──

test('analise · 9.o NO-SHIP (ν/ι, 28): par_invalido com motivo null, motivo fora da definicao, braco fora de {A,B}, sem linha, com evidencia no braco nomeado, ou com tentativa_inicio orfao — ilegitimo, corrida INVALIDA', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const honesto = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) })));
  assert.equal(honesto.primaria.limiar_descritivo_cumprido, false); assert.equal(honesto.marcas.length, 0);
  const idsB = T.filter((t, i) => falhaB(i)).slice(0, 3).map((t) => t.task_id);   // 3 tarefas em que B aceitou
  // ν: evento com motivo null em A, SEM linha de A -> antes: par VALIDO com A a contar como ✗ (A 17 B 15 -> cumprido)
  const nu = analisarReal(T.flatMap((t, i) => (idsB.includes(t.task_id)
    ? [preVoo(t.task_id), ...parReal(t).filter((e) => !(e.evento === 'tentativa_fim' && e.braco === 'A')).filter((e) => e.evento !== 'pre_voo'), { evento: 'par_invalido', task_id: t.task_id, braco: 'A', motivo: null }]
    : parReal(t, { aceiteB: falhaB(i) }))));
  assert.equal(nu.corrida_valida, false, 'ν: motivo null nao e o sentinela de par valido');
  assert.equal(nu.primaria.limiar_descritivo_cumprido, null);
  assert.equal(nu.marcas.filter((m) => m.tipo === 'par_invalido_ilegitimo').length, 3);
  assert.ok(nu.marcas.some((m) => m.tipo === 'par_invalido_ilegitimo' && /motivo null nao e uma string/.test(m.motivo) && /sem linha tentativa_fim do braco A/.test(m.motivo)));
  for (const id of idsB) assert.equal(nu.por_tarefa.find((x) => x.task_id === id).par_valido, false, `${id}: o par nao pode ser valido com A sem linha`);
  // ι1-ι3: evento em B com motivo fora da definicao e sem linha de B, nas 5 falhas -> antes: cumprido sobre 15 com marcas 0
  for (const motivo of ['timeout apos 900 s', 'cli_is_error:Reached max turns', 'aceitacao falhou']) {
    const iota = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: t.tier_classificado, tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico }), ...(t.tier_classificado === 'T0' ? [passoLocal(t.task_id)] : []), { evento: 'par_invalido', task_id: t.task_id, braco: 'B', motivo }])));
    assert.equal(iota.corrida_valida, false, motivo);
    assert.equal(iota.primaria.limiar_descritivo_cumprido, null, motivo);
    assert.ok(iota.marcas.some((m) => m.tipo === 'par_invalido_ilegitimo' && /fora da definicao/.test(m.motivo) && /sem linha tentativa_fim do braco B/.test(m.motivo)), motivo);
  }
  // ι6: evento nomeia A, A tem session_id+modelUsage, B sem linha -> a 21 exigia B.tentativas > 0; agora a evidencia do braco nomeado chega
  const p2 = preregDe(['t1', 't2']);
  const i6 = correr(p2, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), { evento: 'par_invalido', task_id: 't2', braco: 'A', motivo: 'spawn:ENOENT' }]);
  assert.equal(i6.corrida_valida, false);
  assert.ok(i6.marcas.some((m) => m.tipo === 'par_invalido_ilegitimo' && /nao e um nao-arrancou puro/.test(m.motivo) && /evidencia=true/.test(m.motivo)));
  // ι4: tentativa_inicio de B sem tentativa_fim + evento (o braco ARRANCOU a tentar) — mesmo com a linha pura de B por baixo, o inicio orfao e de outra tentativa
  const i4 = correr(p2, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), { evento: 'tentativa_inicio', task_id: 't2', braco: 'B', tentativa: 2 }, naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(i4.corrida_valida, false);
  assert.ok(i4.marcas.some((m) => m.tipo === 'par_invalido_ilegitimo' && /tentativa_inicio do braco B sem tentativa_fim/.test(m.motivo)));
  // braco fora de {A,B}
  const iX = correr(p2, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'C', motivo: 'spawn:ENOENT' }]);
  assert.equal(iX.corrida_valida, false);
  assert.ok(iX.marcas.some((m) => m.tipo === 'par_invalido_ilegitimo' && /braco "C" fora de/.test(m.motivo)));
  // o controlo: a forma legitima nas 5 falhas — corrida valida, «cumprido» sobre 15 COM AVISO_N (a unica saida (a), e verificavel)
  const legit = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: t.tier_classificado, tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico }), ...(t.tier_classificado === 'T0' ? [passoLocal(t.task_id), naoArrancou(t.task_id, 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0' })] : [naoArrancou(t.task_id, 'B', { tier_classificado: t.tier_classificado })]), { evento: 'par_invalido', task_id: t.task_id, braco: 'B', motivo: 'spawn:ENOENT' }])));
  assert.equal(legit.corrida_valida, true); assert.equal(legit.primaria.n_pares_validos, 15); assert.ok(legit.primaria.AVISO_N);
  assert.equal(legit.marcas.filter((m) => m.tipo === 'par_invalido_ilegitimo').length, 0);
});

test('analise · 9.o NO-SHIP (δ): 27b e so para B — aceite=false em A sem prova completa baixa A e favorece B; e 27c', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const idsB = T.filter((t, i) => falhaB(i)).slice(0, 3).map((t) => t.task_id);
  const formas = {
    d1: { aceite: false, exit_code: null, test_file_sha_antes: null, test_file_sha_depois: null, tests_corridos: null, tests_passados: null },
    d2: { aceite: false, exit_code: -1, tests_corridos: null, tests_passados: null },
    d3: { aceite: false, exit_code: 0, tests_corridos: null, tests_passados: null },
    d4: { aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, skips: null, test_file_sha_antes: null, test_file_sha_depois: null },
  };
  for (const [nome, over] of Object.entries(formas)) {
    const r = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && idsB.includes(e.task_id) ? { ...e, ...over } : e))));
    assert.equal(r.corrida_valida, false, `${nome}: antes dava A 17 B 15 -> cumprido`);
    assert.equal(r.primaria.limiar_descritivo_cumprido, null, nome);
    assert.equal(r.marcas.filter((m) => m.tipo === 'campo_em_falta' && /aceite=false em A sem prova/.test(m.motivo)).length, 3, nome);
    assert.ok(r.corrida_invalida_por.some((x) => /aceite=false em A sem prova completa/.test(x.motivo)), nome);
  }
  // e a mesma forma em B continua a contar (27b): 20 pares, NAO cumprido, corrida valida
  const rB = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t, { aceiteB: false }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...formas.d3 } : e)))));
  assert.equal(rB.corrida_valida, true); assert.equal(rB.primaria.n_pares_validos, 20); assert.equal(rB.primaria.limiar_descritivo_cumprido, false);
  assert.equal(rB.marcas.filter((m) => m.tipo === 'campo_em_falta' && /aceite=false em B conta como registado \(27b\)/.test(m.motivo)).length, 5);
});

test('analise · 9.o NO-SHIP (κ, 19): aceite=true numa linha que nao arrancou e sem evidencia e contraditorio — com pre-voo falhado e impossivel', () => {
  const p = preregDe(['t1', 't2']);
  for (const over of [{ arrancou: false, motivo_se_nao: 'spawn:ENOENT' }, { arrancou: null, motivo_se_nao: null }, { arrancou: false, motivo_se_nao: 'timeout' }]) {
    const k = tentativa('t1', 'B', { ...over, session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: true, duration_ms: 50 });
    assert.match(aceiteContraditorio(k, 10), /aceite=true numa tentativa que nao arrancou/);
    const r = correr(p, [tentativa('t1', 'A'), k, tentativa('t2', 'A'), tentativa('t2', 'B')]);
    assert.equal(r.corrida_valida, false, JSON.stringify(over));
    assert.ok(r.marcas.some((m) => m.tipo === 'aceite_contraditorio' && /nao arrancou/.test(m.motivo)));
  }
});

test('analise · 9.o (ε/η): skips acima do pre-voo marca; suplente fora da ordem da lista e fora do protocolo', () => {
  const p = preregDe(['t1', 't2']);
  const r = analisar(p, [preVoo('t1', { skips: 0 }), tentativa('t1', 'A', { skips: 1, tests_corridos: 11, aceite: false, exit_code: 0 /* 55: a rejeicao por skip a mais tem exit 0 */ }), tentativa('t1', 'B'), preVoo('t2', { skips: 2 }), tentativa('t2', 'A', { skips: 2, tests_corridos: 12 }), tentativa('t2', 'B', { skips: 1, tests_corridos: 11 })]);   // corridos 11: a aritmetica tem de bater (41)
  assert.equal(r.marcas.filter((m) => m.tipo === 'skips_acima_do_pre_voo').length, 1);
  assert.ok(r.marcas.some((m) => m.tipo === 'skips_acima_do_pre_voo' && m.task_id === 't1' && m.braco === 'A' && /skips 1 > 0/.test(m.motivo)));
  assert.equal(r.corrida_valida, true, 'so marca numa rejeicao — a analise nao sabe se o skip e do sujeito ou do ambiente; numa aceite=true e contraditorio (29)');
  assert.equal(analisar(p, [preVoo('t1', { skips: 0 }), tentativa('t1', 'A', { skips: 1 }), tentativa('t1', 'B'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]).corrida_valida, false, 'E4 do 10.o');
  // η: s3 usado com s1 e s2 livres
  const h3 = analisar(p, [{ evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree nao reconstruiu', suplente_usado: 's3' }, preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('s3'), tentativa('s3', 'A'), tentativa('s3', 'B')]);
  assert.equal(h3.corrida_valida, false);
  assert.ok(h3.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /fora de ordem: o primeiro disponivel era s1/.test(m.motivo)));
  // um salto registado (s1 excluido) torna s2 o primeiro disponivel
  const hOk = analisar(p, [{ evento: 'tarefa_excluida', task_id: 's1', motivo: 'worktree do suplente nao reconstruiu' }, { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree nao reconstruiu', suplente_usado: 's2' }, preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('s2'), tentativa('s2', 'A'), tentativa('s2', 'B')]);
  assert.equal(hOk.marcas.filter((m) => m.tipo === 'suplente_fora_do_protocolo').length, 0);
  assert.equal(hOk.corrida_valida, true);
});

test('analise · 9.o (N12): a fronteira do tecto e >= — 900 s exactos nos ts, ou 900000 ms exactos, contam como tecto', () => {
  const p = preregDe(['t1']);
  const base = { arrancou: false, motivo_se_nao: 'spawn:ENOENT', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, test_file_sha_antes: null, test_file_sha_depois: null };
  const r1 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...base, duration_ms: 50, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:15:00Z' })]);
  assert.ok(r1.marcas.some((m) => m.tipo === 'tecto_aparente'), 'ts a 900 s exactos');
  assert.ok(r1.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && />= tecto 900s/.test(m.motivo)));
  const r2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...base, duration_ms: 900000, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:00Z' })]);
  assert.ok(r2.marcas.some((m) => m.tipo === 'tecto_aparente'), 'duration_ms a 900000 exactos');
  const r3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...base, duration_ms: 899999, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:14:59Z' })]);
  assert.equal(r3.marcas.filter((m) => m.tipo === 'tecto_aparente').length, 0, 'abaixo do tecto nao e tecto — mas nao e curto (28)');
  assert.ok(r3.marcas.some((m) => m.tipo === 'nao_arrancou_fora_da_definicao' && /nao foi curta/.test(m.motivo)));
  // «curto»: a fronteira e CURTO_S nas duas medidas
  assert.equal(CURTO_S, 30);
  assert.ok(foiCurta(tentativa('x', 'B', { duration_ms: 29999, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:29Z' })));
  assert.ok(!foiCurta(tentativa('x', 'B', { duration_ms: 30000, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:29Z' })));
  assert.ok(!foiCurta(tentativa('x', 'B', { duration_ms: 50, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:30Z' })));
  assert.ok(!foiCurta(tentativa('x', 'B', { duration_ms: null })));
  assert.ok(foiCurta(tentativa('x', 'B', { duration_ms: 50, ts_inicio: null, ts_fim: null })), 'sem ts, a duracao decide');
  assert.ok(motivoSpawnPuro('spawn:ENOENT') && !motivoSpawnPuro('spawn:ETIMEDOUT') && !motivoSpawnPuro('timeout') && !motivoSpawnPuro(null));
});

test('analise · 9.o (N06/N10/N11): os rotulos das saidas — (a) nunca leva o rotulo 27c; 27b esta no motivo da marca; fora-da-definicao liga o contraditorio do par', () => {
  const p = preregDe(['t1', 't2']);
  // (a) spawn puro em B sem evento: motivo do par sem «CORRIDA INVALIDA» (o residual deixou de ser (a) — 29)
  const rA = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B')]);
  assert.equal(rA.corrida_valida, true);
  assert.match(rA.fiabilidade.pares_invalidos[0].motivo, /^nao arrancou \(spawn puro: spawn:ENOENT\) sem evento par_invalido$/);
  assert.doesNotMatch(rA.fiabilidade.pares_invalidos[0].motivo, /CORRIDA INVALIDA/);
  // 27b: o rotulo esta na marca
  const rB = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', { aceite: false, exit_code: null, tests_corridos: null, tests_passados: null })]);
  assert.ok(rB.marcas.some((m) => m.tipo === 'campo_em_falta' && /\(27b\)$/.test(m.motivo)));
  // fora da definicao: o motivo do PAR e o contraditorio (c), nao o (a)
  const rC = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', { arrancou: false, motivo_se_nao: 'timeout', session_id: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 50 })]);
  assert.match(rC.fiabilidade.pares_invalidos[0].motivo, /^nao-arrancou fora da definicao.*CORRIDA INVALIDA por isto \(27c\)$/);
  assert.equal(rC.por_tarefa[1].B.arrancou_contraditorio, undefined, 'campo interno nao exposto');
});

// ── 10.o revisor: exclusoes, skips, sha unanime, ordem, pre_voo unico (interpretacao 29) ──

test('analise · 10.o NO-SHIP (X1/X3/X2, 29): tarefa_excluida com pre-voo falhado, ou depois de um tentativa_inicio, e fora do protocolo; sem pre-voo e (a) mas nunca «marcas 0»', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const idsFalha = T.filter((t, i) => !falhaB(i)).map((t) => t.task_id);   // as 5 em que B falharia
  const S = PREREG.corpus.suplentes;
  const sup = (s) => parSuplente(s);
  // X1: as 5 excluidas COM pre_voo falhado, substituidas por s1..s5 onde B aceita -> antes: «cumprido · A 20 B 20 · marcas 5»
  const x1 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [preVoo(t.task_id), { evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree nao reconstruiu', suplente_usado: S[idsFalha.indexOf(t.task_id)] }, ...sup(S[idsFalha.indexOf(t.task_id)])])));
  assert.equal(x1.corrida_valida, false, 'X1: o pre-voo correu no worktree e falhou — nenhuma das duas saidas do prereg se aplica');
  assert.equal(x1.marcas.filter((m) => m.tipo === 'exclusao_com_pre_voo_falhado').length, 5);
  // a exclusao le o PRIMEIRO pre_voo (falhado), mesmo que um segundo (verde) apareca por cima
  const p1 = preregDe(['t1', 't2']);
  const x1b = analisar(p1, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), preVoo('t2', { exit_code: 0, falhou: false }), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'ja verde', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.ok(x1b.marcas.some((m) => m.tipo === 'exclusao_com_pre_voo_falhado' && m.task_id === 't2'));
  assert.equal(x1.primaria.limiar_descritivo_cumprido, null);
  // X3: excluida DEPOIS de um tentativa_inicio de B (um braco lancado e retirado) -> antes: «cumprido · valida»
  const x3 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [{ evento: 'tentativa_inicio', task_id: t.task_id, braco: 'B', tentativa: 1 }, { evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree nao reconstruiu', suplente_usado: S[idsFalha.indexOf(t.task_id)] }, ...sup(S[idsFalha.indexOf(t.task_id)])])));
  assert.equal(x3.corrida_valida, false, 'X3: substituicao por resultado');
  assert.equal(x3.marcas.filter((m) => m.tipo === 'suplente_fora_do_protocolo' && /DEPOIS de um braco ter sido lancado/.test(m.motivo)).length, 5);
  // X2: excluida SEM pre_voo (worktree nao reconstruiu) — a saida (a) do prereg, inverificavel aqui: corrida valida, mas com marca e AVISO na primaria; nunca «marcas 0»
  const x2 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [{ evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree nao reconstruiu', suplente_usado: S[idsFalha.indexOf(t.task_id)] }, ...sup(S[idsFalha.indexOf(t.task_id)])])));
  assert.equal(x2.corrida_valida, true);
  assert.equal(x2.primaria.n_pares_validos, 20);
  assert.equal(x2.marcas.filter((m) => m.tipo === 'tarefa_substituida').length, 5, 'X2: 25% do corpus trocado nunca da «marcas 0»');
  assert.match(x2.primaria.AVISO_SUPLENTES, /inclui 5 suplente\(s\)/);
  // N16: excluida depois de uma tentativa_fim so de B
  const p2 = preregDe(['t1', 't2']);
  const n16 = correr(p2, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'B'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'x', suplente_usado: 's1' }, tentativa('s1', 'A'), tentativa('s1', 'B')]);
  assert.equal(n16.corrida_valida, false);
  assert.ok(n16.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && m.task_id === 't2'));
});

test('analise · 10.o NO-SHIP (E4/E6/E3, 29): skips e prova da aceitacao — aceite=true com skips acima do pre-voo ou skips null e 27c; a rejeicao por skip e legitima', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const comB = (over) => (e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...over } : e);
  // E4: as 5 falhas de B escritas como aceites com skips 5 (h+5 corridos, h passados) -> antes: «cumprido · marcas 5»
  const e4 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map(comB({ aceite: true, skips: 5, tests_corridos: t.tests_total_historico + 5, tests_passados: t.tests_total_historico })))));
  assert.equal(e4.corrida_valida, false, 'E4: aceite=true com skips > pre-voo e contraditorio');
  assert.equal(e4.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /skips 5 > 0 do pre-voo/.test(m.motivo)).length, 5);
  // E6: idem com skips null -> antes: «cumprido · marcas 0»
  const e6 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map(comB({ aceite: true, skips: null, tests_corridos: t.tests_total_historico + 5, tests_passados: t.tests_total_historico })))));
  assert.equal(e6.corrida_valida, false, 'E6: skips null numa aceite=true e prova em falta');
  assert.equal(e6.marcas.filter((m) => m.tipo === 'campo_em_falta' && /provas da aceitacao: skips/.test(m.motivo)).length, 5);
  // E3: rejeicao LEGITIMA por skip a mais (exit 0, sha ok, h+1/h, skips 1): conta contra B, corrida valida, «NAO cumprido»
  const e3 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map(comB({ aceite: false, exit_code: 0, skips: 1, tests_corridos: t.tests_total_historico + 1, tests_passados: t.tests_total_historico })))));
  assert.equal(e3.corrida_valida, true, 'E3: antes era um falso positivo (aceite_contraditorio)');
  assert.equal(e3.primaria.limiar_descritivo_cumprido, false);
  assert.equal(e3.marcas.filter((m) => m.tipo === 'aceite_contraditorio').length, 0);
  assert.equal(e3.marcas.filter((m) => m.tipo === 'skips_acima_do_pre_voo').length, 5);
  // N14/N17: a fronteira da condicao 3 — passados = h-1 com aceite=true e contraditorio; corridos = h-1 idem
  const n14 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map(comB({ aceite: true, tests_passados: t.tests_total_historico - 1 })))));
  assert.equal(n14.corrida_valida, false); assert.equal(n14.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /exit_code 0 com tests_passados \d+ \+ skips 0 != tests_corridos/.test(m.motivo)).length, 5, '49: exit 0 com passados h-1 e skips 0 e impossivel antes de ser < historico');
  const n17 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map(comB({ aceite: true, tests_corridos: t.tests_total_historico - 1, tests_passados: t.tests_total_historico - 1 })))));
  assert.equal(n17.corrida_valida, false); assert.ok(n17.marcas.some((m) => m.tipo === 'aceite_contraditorio' && /tests_corridos \d+ < historico/.test(m.motivo)));
  // e exactamente h/h e aceite (o controlo)
  assert.equal(analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }))).corrida_valida, true);
});

test('analise · 10.o NO-SHIP (Y1/S1b/S1, 29): test_file_sha_antes divergente entre bracos invalida; ordem dos bracos divergente invalida; ts iguais entre bracos marca', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  // Y1: B com sha "OUTRO" (antes=depois) nas 5 falhas escritas como aceites -> antes: «cumprido · marcas 0» — os bracos nao viram o mesmo ficheiro
  const y1 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, test_file_sha_antes: 'OUTRO', test_file_sha_depois: 'OUTRO' } : e)))));
  assert.equal(y1.corrida_valida, false);
  assert.equal(y1.marcas.filter((m) => m.tipo === 'test_file_sha_divergente').length, 5);
  assert.equal(y1.primaria.limiar_descritivo_cumprido, null);
  assert.equal(y1.fiabilidade.pares_invalidos.length, 5);
  for (const inv of y1.fiabilidade.pares_invalidos) assert.match(inv.motivo, /^test_file_sha_antes divergente entre os bracos.*CORRIDA INVALIDA/);
  // o passo local tambem viu o ficheiro congelado: um sha diferente no local diverge na mesma
  const pL = preregDe(['t1', 't2'], { t2: 'T0' });
  const yL = correr(pL, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { test_file_sha_antes: 'OUTRO', test_file_sha_depois: 'OUTRO' }), escalacao('t2')]);
  assert.equal(yL.corrida_valida, false);
  assert.ok(yL.marcas.some((m) => m.tipo === 'test_file_sha_divergente' && m.task_id === 't2'));
  // S1b: rotulo A<->B trocado nas 5 tarefas T3 em que B falhou (ts honestos ficam) -> antes: «cumprido · A 15 B 20 · marcas 5 (ordem_divergente)»
  const t3s = new Set(T.filter((t, i) => !falhaB(i) && t.tier_classificado === 'T3').map((t) => t.task_id));
  assert.ok(t3s.size >= 2, 'ha T3 entre as falhas');
  const s1b = analisar(PREREG, ordenar(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }))).map((e) => (e.evento === 'tentativa_fim' && t3s.has(e.task_id) ? { ...e, braco: e.braco === 'A' ? 'B' : 'A' } : e)));
  assert.equal(s1b.corrida_valida, false, 'S1b: o contrabalanco e protocolo');
  assert.equal(s1b.marcas.filter((m) => m.tipo === 'ordem_divergente').length, t3s.size);
  assert.equal(s1b.primaria.limiar_descritivo_cumprido, null);
  // S1: ts_inicio iguais entre A e B — marca (dois spawns sequenciais nao partilham o instante)
  const s1 = analisar(PREREG, ordenar(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }))).map((e) => (e.evento === 'tentativa_fim' && t3s.has(e.task_id) ? { ...e, ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' } : e)));
  assert.equal(s1.marcas.filter((m) => m.tipo === 'ts_iguais_entre_bracos').length, t3s.size);
});

test('analise · 10.o (F2/G1/H1/W1, 29): marcas baratas — custo zero com tokens; pre-voo sem vermelho; rasto do passo local; fim sem inicio', () => {
  const p = preregDe(['t1', 't2'], { t2: 'T0' });
  const mu0 = { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], costUSD: 0 } };
  const r = analisar(p, [
    preVoo('t1'), tentativa('t1', 'A', { modelUsage: mu0 }), tentativa('t1', 'B'),
    preVoo('t2'), { evento: 'tentativa_inicio', task_id: 't2', braco: 'A', tentativa: 1 }, tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { worktree_listagem_sha_antes: 'wa', worktree_listagem_sha_depois: 'wd' }), escalacao('t2'),
  ]);
  assert.ok(r.marcas.some((m) => m.tipo === 'custo_zero_com_tokens' && m.task_id === 't1' && m.braco === 'A'));
  assert.ok(r.marcas.some((m) => m.tipo === 'rasto_do_passo_local' && m.task_id === 't2'));
  assert.equal(r.fiabilidade.rastos_do_passo_local.length, 1);
  assert.equal(r.marcas.filter((m) => m.tipo === 'tentativa_sem_inicio').length, 4, 'o ledger regista inicios: os 4 fins sem inicio (t1 A/B, t2 local/escalacao) marcam');
  assert.equal(r.corrida_valida, true, 'tudo marca, nada invalida');
  // sem nenhum tentativa_inicio no ledger, nao se verifica
  assert.equal(correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2')]).marcas.filter((m) => m.tipo === 'tentativa_sem_inicio').length, 0);
});

test('analise · 10.o (N03/N09/N10): fronteiras do «puro» — ts_fim < ts_inicio nao e curto; a regex do timeout ignora maiusculas; puro exige arrancou === false', () => {
  assert.ok(!foiCurta(tentativa('x', 'B', { duration_ms: 50, ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:00Z' })), 'N03');
  assert.ok(!motivoSpawnPuro('spawn:Timeout') && !motivoSpawnPuro('spawn:etimedout'), 'N09');
  assert.ok(!naoArrancouPuro(naoArrancou('x', 'B', { arrancou: null })), 'N10');
  const p = preregDe(['t1', 't2']);
  for (const over of [{ ts_inicio: '2026-09-11T00:00:10Z', ts_fim: '2026-09-11T00:00:00Z' }, { motivo_se_nao: 'spawn:Timeout' }, { arrancou: null }]) {
    const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B', over), { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'spawn:ENOENT' }]);
    assert.equal(r.corrida_valida, false, JSON.stringify(over));
  }
});

// ── 11.o revisor: instantes, contrato do pre_voo, o que a linha nao diz (interpretacao 30) ──

test('analise · 11.o NO-SHIP (K4/K4b/K4c, 30): o pre_voo tem contrato — sem exit_code/contagens invalida; falhou=true com exit 0 invalida; falhou com 0 testes corridos marca', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const semContrato = (e) => (e.evento === 'pre_voo' ? { evento: 'pre_voo', task_id: e.task_id, falhou: true, skips: 0 } : e);
  // K4b: pre_voo so com falhou:true nas 5 tarefas em que B falharia, B aceite -> antes: «cumprido · A 20 B 20 · marcas 0»
  const k4b = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map(semContrato))));
  assert.equal(k4b.corrida_valida, false);
  assert.equal(k4b.marcas.filter((m) => m.tipo === 'pre_voo_incompleto').length, 5);
  assert.deepEqual(problemasDoPreVoo({ falhou: true, skips: 0 }), ['exit_code null nao e numero', 'tests_corridos null nao e numero', 'tests_passados null nao e numero']);
  assert.deepEqual(problemasDoPreVoo(preVoo('x')), []);
  // K4: falhou:true com exit_code 0 -> antes so marca (25); e a classe do aceite_contraditorio: invalida
  const k4 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map((e) => (e.evento === 'pre_voo' ? { ...e, exit_code: 0 } : e)))));
  assert.equal(k4.corrida_valida, false);
  assert.ok(k4.corrida_invalida_por.some((x) => /falhou=true e exit_code=0/.test(x.motivo) && x.valores.length === 5));
  assert.equal(k4.marcas.filter((m) => m.tipo === 'pre_voo_incoerente').length, 5, 'a marca da 25 continua');
  // K4c: exit_code 1 com 0 testes corridos (runner morto) -> marca pre_voo_sem_vermelho; e tests_passados === tests_corridos idem
  const k4c = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'pre_voo' ? { ...e, tests_corridos: 0, tests_passados: 0 } : e))));
  assert.equal(k4c.marcas.filter((m) => m.tipo === 'pre_voo_sem_vermelho').length, 20);
  assert.equal(k4c.corrida_valida, true, 'so marca — o prereg define a falha pelo exit code');
  const k4d = correr(preregDe(['t1']), [preVoo('t1', { tests_corridos: 10, tests_passados: 10 }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.ok(k4d.marcas.some((m) => m.tipo === 'pre_voo_sem_vermelho' && /tests_passados 10/.test(m.motivo)));
  // o passo local sozinho (T0 sem escalacao) tambem exige o contrato? so quando a tarefa correu em claude-p — o local nao usa a condicao 3
  const pL = preregDe(['t1'], { t1: 'T0' });
  const soLocal = analisar(pL, [{ evento: 'pre_voo', task_id: 't1', falhou: true, skips: 0 }, passoLocal('t1')]);
  assert.equal(soLocal.marcas.filter((m) => m.tipo === 'pre_voo_incompleto').length, 0);
});

test('analise · 11.o NO-SHIP (J1/K6, 30): tecto_do_orcamento divergente entre tentativas claude-p invalida — tratamento desigual', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  // J1: tecto 0.1 so em A (custo da sonda 0.59) com A aceite=false coerente nas 5 -> antes: «cumprido · A 15 B 15 · marcas 0»
  const j1 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' ? { ...e, tecto_do_orcamento: 0.1, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 } : e)))));
  assert.equal(j1.corrida_valida, false);
  assert.ok(j1.corrida_invalida_por.some((x) => /tecto_do_orcamento divergente/.test(x.motivo)));
  assert.equal(j1.primaria.limiar_descritivo_cumprido, null);
  // o passo local nao entra (nao tem tecto de Opus); e o mesmo tecto em todas as claude-p e valido
  const p = preregDe(['t1', 't2'], { t2: 'T0' });
  const ok = correr(p, [tentativa('t1', 'A', { tecto_do_orcamento: 2 }), tentativa('t1', 'B', { tecto_do_orcamento: 2 }), tentativa('t2', 'A', { tier_classificado: 'T0', tecto_do_orcamento: 2 }), passoLocal('t2', { tecto_do_orcamento: null }), escalacao('t2', { tecto_do_orcamento: 2 })]);
  assert.equal(ok.corrida_valida, true, JSON.stringify(ok.corrida_invalida_por));
});

test('analise · 11.o NO-SHIP (K8, 30): dois par_invalido na mesma tarefa — o segundo nao e invisivel; todos verificados', () => {
  const p = preregDe(['t1', 't2']);
  // 1.o legitimo (A spawn puro), 2.o ilegitimo (B, timeout) -> antes: so o 1.o era lido, «cumprido · valida»
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), naoArrancou('t2', 'A'), tentativa('t2', 'B'), { evento: 'par_invalido', task_id: 't2', braco: 'A', motivo: 'spawn:ENOENT' }, { evento: 'par_invalido', task_id: 't2', braco: 'B', motivo: 'timeout' }]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.marcas.some((m) => m.tipo === 'par_invalido_repetido' && /2 eventos/.test(m.motivo)));
  assert.ok(r.corrida_invalida_por.some((x) => /par_invalido repetido/.test(x.motivo)));
});

test('analise · 11.o (h/a/f, 30): eventos desconhecidos e linhas nao-objecto sao contados, nunca engolidos nem rebentam; paragem com tudo fechado marca; AVISO_N tambem com n > prereg', () => {
  const { eventos, linhasInvalidas } = lerLedger('{"evento":"pre_voo","task_id":"t1","exit_code":1,"falhou":true,"tests_corridos":10,"tests_passados":9,"skips":0}\nnull\n42\n"string"\n[1,2]\n{"evento":"nota","task_id":"t1"}\n{"task_id":"t1"}\n');
  assert.equal(eventos.length, 3, 'o pre_voo, a nota e o objecto sem evento');
  assert.equal(linhasInvalidas.length, 4, 'null, 42, "string" e o array');
  assert.match(linhasInvalidas[0].erro, /nao e um objecto \(null\)/);
  const p = preregDe(['t1']);
  const r = analisar(p, [...eventos, tentativa('t1', 'A'), tentativa('t1', 'B'), null, 42]);   // e mesmo que alguem passe nao-objectos a analisar(), nao rebenta
  assert.equal(r.fiabilidade.eventos_desconhecidos.length, 2);
  assert.deepEqual(r.fiabilidade.eventos_desconhecidos, [{ evento: 'nota', task_id: 't1' }, { evento: null, task_id: 't1' }]);
  assert.equal(r.marcas.filter((m) => m.tipo === 'evento_desconhecido').length, 2);
  assert.equal(r.corrida_valida, false, '34: um evento fora dos 6 invalida — a 30 so o contava');
  assert.ok(r.corrida_invalida_por.some((x) => /evento fora dos 6/.test(x.motivo)));
  assert.ok(r.fiabilidade.pares_invalidos.some((x) => x.task_id === 't1' && /retoma escondida/.test(x.motivo)), 'o task_id e de uma tarefa em jogo: (c) no par');
  assert.deepEqual(EVENTOS_DO_PREREG, ['pre_voo', 'tentativa_inicio', 'tentativa_fim', 'par_invalido', 'tarefa_excluida', 'paragem']);
  // (a) A1: paragem «corrida terminou» com todos os pares fechados — continua «nao fechou» (conservador), e marca a contradicao
  const a1 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'paragem', ts: '2026-09-11T02:00:00Z', motivo: 'corrida terminou', ultima_tarefa: 't1' }]);
  assert.equal(a1.corrida_fechou_os_pares, false);
  assert.equal(a1.primaria.limiar_descritivo_cumprido, null);
  assert.ok(a1.marcas.some((m) => m.tipo === 'paragem_contraditoria'));
  // (f) F2: um suplente T0 no lugar de uma T3 poe o estrato T0 acima do prereg — AVISO_N dispara tambem para n > nPrereg
  const p2 = preregDe(['t1', 't2'], { t1: 'T3', t2: 'T3' });
  const f2 = analisar(p2, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2', { exit_code: 0, falhou: false }), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'ja verde', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A', { tier_classificado: 'T0' }), passoLocal('s1'), escalacao('s1')]);
  assert.equal(f2.secundaria.por_tier.T0.n, 1);
  assert.match(f2.secundaria.por_tier.T0.primaria.AVISO_N, /sobre 1 pares validos, nao sobre os 0 do pre-registo/);
  assert.match(f2.secundaria.por_tier.T3.primaria.AVISO_N, /sobre 1 pares validos, nao sobre os 2/);
});

test('analise · 11.o (30): o sha do pre-registo esta pinado — a analise so e a pre-registada se leu o ficheiro congelado', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(HERE, 'custo-prereg.json'))).digest('hex');
  assert.equal(sha, PREREG_SHA256_ESPERADO, 'o custo-prereg.json commitado e o esperado; se mudar, esta constante tem de mudar com uma AMENDMENT');
  const p = { ...preregDe(['t1']), __sha256: 'deadbeef' };
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /pre-registo lido nao e o congelado/.test(x.motivo)));
  assert.equal(r.prereg_sha256, 'deadbeef');
  const ok = correr({ ...preregDe(['t1']), __sha256: PREREG_SHA256_ESPERADO }, [tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(ok.corrida_valida, true);
});

test('analise · 11.o (R11-04/05/06/07/09): mutantes sobreviventes do 11.o — AVISO_SUPLENTES so com suplente valido; pre_voo repetido fica o primeiro (nao o vermelho); 27b nunca em A de suplente; skipsBase 0 vs null; (a) nomeia o braco certo', () => {
  const p = preregDe(['t1', 't2']);
  // R11-04: suplente em par INVALIDO nao entra no AVISO (a primaria nao o inclui)
  const r4 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A'), naoArrancou('s1', 'B'), { evento: 'par_invalido', task_id: 's1', braco: 'B', motivo: 'spawn:ENOENT' }]);
  assert.equal(r4.primaria.AVISO_SUPLENTES, null);
  assert.equal(r4.primaria.n_pares_validos, 1);
  // R11-05: pre_voo repetido — fica o PRIMEIRO (vermelho), nao o verde por cima; corrida invalida na mesma
  const r5 = analisar(p, [preVoo('t1'), preVoo('t1', { exit_code: 0, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(r5.por_tarefa[0].pre_voo_falhou, true);
  assert.equal(r5.marcas.filter((m) => m.tipo === 'pre_voo_nao_falhou').length, 0);
  assert.equal(r5.corrida_valida, false);
  // R11-06: 27b nunca em A, nem num suplente
  const r6 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A', { aceite: false, exit_code: 0, tests_corridos: null, tests_passados: null }), tentativa('s1', 'B')]);
  assert.equal(r6.corrida_valida, false);
  assert.ok(r6.corrida_invalida_por.some((x) => /aceite=false em A sem prova completa/.test(x.motivo)));
  // R11-07: skipsBase 0 (presente) vs null (ausente): com 0, aceite=false completo e coerente e contraditorio; com null e prova em falta -> os dois invalidam, por motivos distintos
  const pH = preregDe(['t1', 't2']); for (const x of pH.corpus.tarefas) x.tests_total_historico = 10;
  const s0 = correr(pH, [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(s0.corrida_invalida_por.some((x) => /aceite contraditorio/.test(x.motivo)));
  const sN = analisar(pH, [preVoo('t1', { skips: null }), tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false }), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(sN.corrida_invalida_por.some((x) => /pre_voo sem skips/.test(x.motivo)));
  assert.ok(!sN.corrida_invalida_por.some((x) => /aceite contraditorio/.test(x.motivo)), 'sem base nao se pode dizer contraditorio');
  // R11-09: o (a) nomeia o braco que nao arrancou
  const r9 = correr(p, [naoArrancou('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), naoArrancou('t2', 'B')]);
  assert.equal(r9.fiabilidade.pares_invalidos.find((x) => x.task_id === 't1').braco_que_nao_arrancou, 'A');
  assert.equal(r9.fiabilidade.pares_invalidos.find((x) => x.task_id === 't2').braco_que_nao_arrancou, 'B');
});

// ── 12.o revisor: a forma dos timestamps, omissao = null, o local com aceite null, tempo por instante (interpretacao 31) ──

test('analise · 12.o NO-SHIP (a1-a5, 31): um timestamp que o Date.parse nao le, ou sem zona, saltava a ordem em silencio — agora e tipo_invalido, corrida INVALIDA', () => {
  assert.ok(tsCanonico('2026-09-11T08:00:00.000Z') && tsCanonico('2026-09-11T08:00:00Z') && tsCanonico('2026-09-11T08:00:00.5Z'));
  for (const mau of ['2026-09-11T08:00:00Z ', '2026-09-11T08:00:00ZZ', '2026-09-11T08:00:00,000Z', '2026-09-11T08:00:00', '2026-09-11 08:00:00', '2026-09-11T08:00:00.000+00:00', '2026-09-11T08:00:00.000-03:00', '2026-13-45T08:00:00Z', '', 'ontem']) assert.ok(!tsCanonico(mau), mau);
  assert.deepEqual(violacoesDeTipo(tentativa('x', 'A', { ts_inicio: '2026-09-11T08:00:00' })), ['ts_inicio: "2026-09-11T08:00:00" nao e um timestamp canonico (YYYY-MM-DDTHH:MM:SS[.mmm]Z)']);
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const t3s = new Set(T.filter((t, i) => !falhaB(i) && t.tier_classificado === 'T3').map((t) => t.task_id));
  const trocado = () => ordenar(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }))).map((e) => (e.evento === 'tentativa_fim' && t3s.has(e.task_id) ? { ...e, braco: e.braco === 'A' ? 'B' : 'A' } : e));
  // a1: rotulo trocado + um espaco no ts_inicio de A -> antes: Date.parse NaN, bloco de ordem saltado, «cumprido · A 15 B 20 · marcas 0»
  for (const [nome, f] of Object.entries({ a1: (s) => s + ' ', a2: (s) => s + 'Z', a3: (s) => s.replace(/\.\d{3}Z$/, ''), a4: (s) => s.replace('T', ' ').replace(/\.\d{3}Z$/, ''), a5: (s) => s.replace('Z', '+00:00') })) {
    const r = analisar(PREREG, trocado().map((e) => (e.evento === 'tentativa_fim' && t3s.has(e.task_id) && e.braco === 'A' ? { ...e, ts_inicio: f(e.ts_inicio), ts_fim: f(e.ts_fim) } : e)));
    assert.equal(r.corrida_valida, false, nome);
    assert.equal(r.primaria.limiar_descritivo_cumprido, null, nome);
    assert.ok(r.marcas.some((m) => m.tipo === 'tipo_invalido' && /timestamp canonico/.test(m.motivo)), nome);
    assert.ok(r.corrida_invalida_por.some((x) => /timestamp ilegivel ou fora da forma canonica/.test(x.motivo)), nome);
  }
  // e o motivo (c) do par diz-o
  const r1 = correr(preregDe(['t1']), [tentativa('t1', 'A', { ts_inicio: '2026-09-11T08:00:00' }), tentativa('t1', 'B')]);
  assert.ok(r1.fiabilidade.pares_invalidos[0].motivo.includes('CORRIDA INVALIDA'));
  // o controlo honesto continua «NAO cumprido · marcas 0»
  const h = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) })));
  assert.equal(h.primaria.limiar_descritivo_cumprido, false); assert.equal(h.marcas.length, 0);
});

test('analise · 12.o NO-SHIP (L1/c2/s1, 31): passo local com aceite null tirava o par sem invalidar; chave omitida valia menos do que null; intervalo de comprimento zero a tocar B', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  // L1: 5 passos locais com aceite null nas T0 -> antes: «cumprido · n=15 · valida=true»
  const l1 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' && !falhaB(i) ? { ...e, aceite: null } : e))));
  assert.equal(l1.corrida_valida, false, 'L1');
  assert.ok(l1.corrida_invalida_por.some((x) => /aceite null num passo local/.test(x.motivo)));
  assert.equal(l1.primaria.limiar_descritivo_cumprido, null);
  // c2: chave ts_inicio OMITIDA (nao null) na linha de A com o rotulo trocado -> antes: so marca, bloco de ordem saltado, «cumprido»
  const t3s = new Set(T.filter((t, i) => !falhaB(i) && t.tier_classificado === 'T3').map((t) => t.task_id));
  const c2 = analisar(PREREG, ordenar(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }))).map((e) => { if (e.evento === 'tentativa_fim' && t3s.has(e.task_id)) { const x = { ...e, braco: e.braco === 'A' ? 'B' : 'A' }; if (x.braco === 'A') delete x.ts_inicio; return x; } return e; }));
  assert.equal(c2.corrida_valida, false, 'c2');
  assert.ok(c2.corrida_invalida_por.some((x) => /chave obrigatoria omitida/.test(x.motivo)));
  assert.ok(c2.fiabilidade.pares_invalidos.some((x) => /chave obrigatoria omitida.*CORRIDA INVALIDA/.test(x.motivo)), 'o par fica marcado invalido para contabilidade (27c)');
  // s1: A com intervalo [t,t] a tocar B [t,t+5s] no rotulo trocado -> antes: ts_iguais so marca + «tocar-se e sequencial» -> «cumprido»
  const s1 = analisar(PREREG, ordenar(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }))).map((e) => { if (e.evento === 'tentativa_fim' && t3s.has(e.task_id)) { const x = { ...e, braco: e.braco === 'A' ? 'B' : 'A' }; return x; } return e; }).map((e, _, all) => {
    if (e.evento !== 'tentativa_fim' || !t3s.has(e.task_id) || e.braco !== 'A') return e;
    const b = all.find((y) => y.evento === 'tentativa_fim' && y.task_id === e.task_id && y.braco === 'B');
    return { ...e, ts_inicio: b.ts_inicio, ts_fim: b.ts_inicio, duration_ms: null, modelUsage: null, usage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9 };
  }));
  assert.equal(s1.corrida_valida, false, 's1');
  assert.ok(s1.corrida_invalida_por.some((x) => /ts_inicio no mesmo instante em A e B numa tarefa do corpus/.test(x.motivo)) || s1.corrida_invalida_por.some((x) => /tempo incoerente/.test(x.motivo)));
  // so ts iguais, sem mais nada: A spawn puro em [t,t] (nao chegou, curto) e B a comecar em t — nem intercalados (tocam-se) nem tempo incoerente (nao chegou); invalida na mesma
  const p2 = preregDe(['t1', 't2']);
  const soIguais = correr(p2, [naoArrancou('t1', 'A', { ts_inicio: '2026-09-11T08:00:00.000Z', ts_fim: '2026-09-11T08:00:00.000Z', duration_ms: 50 }), tentativa('t1', 'B', { ts_inicio: '2026-09-11T08:00:00.000Z', ts_fim: '2026-09-11T08:00:05.000Z' }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.deepEqual(soIguais.marcas.map((m) => m.tipo).sort(), ['ordem_das_tarefas_divergente', 'par_invalido_com_resultado_no_outro_braco', 'tempo_incoerente', 'tentativa_nao_arrancou', 'ts_iguais_entre_bracos'], 'o tempo_incoerente (ts iguais com duration 50) e so marca porque a linha nao chegou; t1 com ts explicitos de 09-11 comeca depois de t2 (09-10) — a ordem das tarefas marca (32); a saida (a) em A com B aceite diz o sentido (16.o)');
  assert.ok(soIguais.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && m.sentido === 'favorece A'), '(A?, B aceite) retirado esconde um aceite de B: favorece A');
  assert.ok(!soIguais.corrida_invalida_por.some((x) => /tempo incoerente/.test(x.motivo)));
  assert.equal(soIguais.corrida_valida, false, 'M277: numa tarefa do corpus a ordem nao e verificavel');
  assert.ok(soIguais.corrida_invalida_por.some((x) => /mesmo instante em A e B numa tarefa do corpus/.test(x.motivo)));
});

test('analise · 12.o (e3/j1/N07/N10/N14, 31): transcript abaixo do piso e desconhecido; e_escalacao incoerente invalida; NaN nunca e curto; falhou string nao e contrato; tecto null conta como valor', () => {
  const p = preregDe(['t1', 't2']);
  // e3: B sem JSON com tokens_transcript 1 -> antes consumo 1 token; agora desconhecido
  const e3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 1, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(e3.por_tarefa[0].B.tokens_opus, null);
  assert.ok(e3.marcas.some((m) => m.tipo === 'consumo_desconhecido' && m.task_id === 't1'));
  assert.equal(TRANSCRIPT_MINIMO, 1000);
  // e1: tokens_transcript com tipo errado e tipo_invalido
  assert.ok(violacoesDeTipo(tentativa('x', 'A', { tokens_transcript: 'abc' })).some((v) => /tokens_transcript/.test(v)));
  assert.ok(violacoesDeTipo(tentativa('x', 'A', { tokens_transcript: -5 })).some((v) => /tokens_transcript/.test(v)));
  assert.equal(violacoesDeTipo(tentativa('x', 'A', { tokens_transcript: null })).length, 0);
  // j1: e_escalacao true na tentativa 1 -> (c)
  const j1 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { e_escalacao: true }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(j1.corrida_valida, false);
  assert.ok(j1.corrida_invalida_por.some((x) => /e_escalacao incoerente/.test(x.motivo)));
  // N07: NaN nunca e curto (o original ja o fazia; fica pinado)
  assert.ok(!foiCurta(tentativa('x', 'B', { duration_ms: 50, ts_inicio: 'ontem', ts_fim: 'hoje' })));
  // N10: falhou como string nao cumpre o contrato do pre_voo
  assert.ok(problemasDoPreVoo({ exit_code: 1, falhou: 'true', tests_corridos: 10, tests_passados: 9, skips: 0 }).some((x) => /falhou/.test(x)));
  const n10 = analisar(p, [preVoo('t1', { falhou: 'true' }), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(n10.corrida_valida, false);
  // N14: tecto null numa linha e "null=sem tecto" noutra sao valores distintos -> divergente
  const n14 = correr(p, [tentativa('t1', 'A', { tecto_do_orcamento: null }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(n14.corrida_invalida_por.some((x) => /tecto_do_orcamento divergente/.test(x.motivo)));
  // f1: usage muito acima do modelUsage e reconciliacao falhada nos dois sentidos
  assert.equal(reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, input_tokens: 5000000 } })).ok, false);
  assert.equal(reconciliar(tentativa('x', 'A')).ok, true);
});

// ── 13.o revisor: o protocolo de B independente do tier, os suplentes pinados, o que so marca (interpretacao 32) ──

test('analise · 13.o NO-SHIP (S1/S1d, 32): com tier null (suplente sem tier, ou tier inconsistente) B com 2 tentativas claude-p passava — o protocolo de B nao depende do tier', () => {
  const T = PREREG.corpus.tarefas;
  const S = PREREG.corpus.suplentes;
  const falhaB = (i) => i % 4 !== 0;
  const idsF = T.filter((t, i) => !falhaB(i)).map((t) => t.task_id);
  const t3sF = T.filter((t, i) => !falhaB(i) && t.tier_classificado === 'T3').slice(0, 3).map((t) => t.task_id);
  const sups = S.slice(0, 3);
  // S1: 3 T3 onde B falharia excluidas antes do pre-voo (X2), 3 suplentes com tier null em TODAS as linhas, B = 2 claude-p (t1 falha, t2 e_escalacao aceite)
  const s1 = analisarReal(T.flatMap((t, i) => (t3sF.includes(t.task_id)
    ? (() => { const s = sups[t3sF.indexOf(t.task_id)]; const h = SUPLENTES_ESPERADOS[s].tests_total_historico; return [{ evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree', suplente_usado: s }, preVoo(s), tentativa(s, 'A', { tier_classificado: null, tests_corridos: h, tests_passados: h }), tentativa(s, 'B', { tier_classificado: null, aceite: false, exit_code: 1, tests_corridos: h, tests_passados: h - 1 }), tentativa(s, 'B', { tentativa: 2, e_escalacao: true, tier_classificado: null, tests_corridos: h, tests_passados: h })]; })()
    : parReal(t, { aceiteB: falhaB(i) }))));
  assert.equal(s1.corrida_valida, false, 'S1: antes «cumprido · n=20 · A=20 · B=18 · valida»');
  assert.equal(s1.primaria.limiar_descritivo_cumprido, null);
  assert.ok(s1.marcas.some((m) => m.tipo === 'tentativas_fora_do_protocolo' && /2 tentativas claude-p/.test(m.motivo)));
  // com a meta pinada, o tier null nas linhas e campo_em_falta e o protocolo aplica-se na mesma (T3: 1 tentativa, sem local)
  assert.ok(s1.marcas.some((m) => m.tipo === 'campo_em_falta' && /tier_classificado/.test(m.motivo)));
  // S1d: tier inconsistente (local T0, escalacao T3) num suplente -> invalida
  const p2 = preregDe(['t1', 't2'], {}, ['s1', 's2', 's3']);
  const s1d = analisar(p2, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A', { tier_classificado: 'T0' }), passoLocal('s1', { tier_classificado: 'T0' }), escalacao('s1', { tier_classificado: 'T3' })]);
  assert.equal(s1d.corrida_valida, false);
  assert.ok(s1d.corrida_invalida_por.some((x) => /tier inconsistente/.test(x.motivo)));
  // e um suplente FORA da tabela pinada (s1 do preregDe) sem tier em nenhuma linha: invalida (o protocolo de B nao e verificavel)
  const sNull = analisar(p2, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tarefa_excluida', task_id: 't2', motivo: 'worktree', suplente_usado: 's1' }, preVoo('s1'), tentativa('s1', 'A', { tier_classificado: null }), tentativa('s1', 'B', { tier_classificado: null })]);
  assert.equal(sNull.corrida_valida, false);
  assert.ok(sNull.corrida_invalida_por.some((x) => /sem tier_classificado em nenhuma linha/.test(x.motivo)));
  // independente do tier, no corpus: T3 com 2 claude-p em B (t2 e_escalacao sem local) -> fora do protocolo
  const p3 = preregDe(['t1']);
  const r3 = correr(p3, [tentativa('t1', 'A'), tentativa('t1', 'B', { aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B', { tentativa: 2, e_escalacao: true })]);
  assert.ok(r3.marcas.some((m) => m.tipo === 'tentativas_fora_do_protocolo' && /2 tentativas claude-p/.test(m.motivo)));
  assert.equal(r3.corrida_valida, false);
});

test('analise · 13.o (S1e/S1g, 32): os 5 suplentes estao pinados — tier do classify congelado e historico do manifesto; escrito com outro tier ou aceite com 1 teste invalida', () => {
  assert.deepEqual(Object.keys(SUPLENTES_ESPERADOS).sort(), [...PREREG.corpus.suplentes].sort(), 'os 5 ids do prereg');
  assert.deepEqual(SUPLENTES_ESPERADOS['t13-ddb0cf50e1'], { tier_classificado: 'T0', tests_total_historico: 15 });
  // a tabela bate com o manifesto do R-24 (historico) — a fonte esta no repo
  const manifesto = JSON.parse(fs.readFileSync(path.join(HERE, 'r24-manifest.json'), 'utf8'));
  const tarefas = Object.values(manifesto).find(Array.isArray);
  for (const [id, m] of Object.entries(SUPLENTES_ESPERADOS)) assert.equal(tarefas.find((x) => x.task_id === id).proof.passes_at_child.tests_total, m.tests_total_historico, id);
  for (const t of PREREG.corpus.tarefas) assert.equal(tarefas.find((x) => x.task_id === t.task_id).proof.passes_at_child.tests_total, t.tests_total_historico, `corpus ${t.task_id}`);
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const t3sF = T.filter((t, i) => !falhaB(i) && t.tier_classificado === 'T3').slice(0, 3).map((t) => t.task_id);
  const sups = ['t02-7bb45751d8', 't09-07bdf37783', 't16-057bfc121a'];   // os 3 T3 pinados
  // S1e: suplente T3 escrito como T0 com local + escalacao -> tier_divergente, INVALIDA (antes: cumprido · marcas 3)
  const s1e = analisarReal(T.flatMap((t, i) => (t3sF.includes(t.task_id)
    ? (() => { const s = sups[t3sF.indexOf(t.task_id)]; const h = SUPLENTES_ESPERADOS[s].tests_total_historico; return [{ evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree', suplente_usado: s }, preVoo(s), tentativa(s, 'A', { tier_classificado: 'T0', tests_corridos: h, tests_passados: h }), passoLocal(s, { tests_corridos: h, tests_passados: h - 1 }), escalacao(s, { tests_corridos: h, tests_passados: h })]; })()
    : parReal(t, { aceiteB: falhaB(i) }))));
  assert.equal(s1e.corrida_valida, false);
  assert.equal(t3sF.length, 2, 'ha 2 T3 entre as 5 falhas de B (t06, t23)');
  assert.equal(s1e.marcas.filter((m) => m.tipo === 'tier_divergente').length, t3sF.length);
  // S1g: suplente T3 correcto, B aceite com tests_corridos 1 -> aceite_contraditorio (antes: cumprido · marcas 3)
  const s1g = analisarReal(T.flatMap((t, i) => (t3sF.includes(t.task_id)
    ? [{ evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree', suplente_usado: sups[t3sF.indexOf(t.task_id)] }, ...parSuplente(sups[t3sF.indexOf(t.task_id)]).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' ? { ...e, tests_corridos: 1, tests_passados: 1 } : e))]
    : parReal(t, { aceiteB: falhaB(i) }))));
  assert.equal(s1g.corrida_valida, false);
  assert.equal(s1g.marcas.filter((m) => m.tipo === 'aceite_contraditorio').length, t3sF.length);
  // e a forma honesta com os 3 suplentes pinados: valida, «cumprido» sobre 20 com AVISO_SUPLENTES (X2), marcas so tarefa_substituida
  const ok = analisarReal(T.flatMap((t, i) => (t3sF.includes(t.task_id)
    ? [{ evento: 'tarefa_excluida', task_id: t.task_id, motivo: 'worktree', suplente_usado: sups[t3sF.indexOf(t.task_id)] }, ...parSuplente(sups[t3sF.indexOf(t.task_id)])]
    : parReal(t, { aceiteB: falhaB(i) }))));
  assert.equal(ok.corrida_valida, true, JSON.stringify(ok.corrida_invalida_por));
  assert.deepEqual([...new Set(ok.marcas.map((m) => m.tipo))], ['tarefa_substituida']);
  assert.equal(ok.por_tarefa.find((x) => x.task_id === 't02-7bb45751d8').suplente, true);
  assert.equal(ok.por_tarefa.find((x) => x.task_id === 't02-7bb45751d8').tier, 'T3');
  // e o t13 (T0 pinado) com local + escalacao e o seu historico
  const S = PREREG.corpus.suplentes;   // pela ordem da lista: t02, t09, t16, t13 — o t13 (T0) so entra em 4.o
  const p13 = analisarReal([...parReal(T[0]), ...[1, 2, 3, 4].flatMap((k) => [{ evento: 'tarefa_excluida', task_id: T[k].task_id, motivo: 'worktree', suplente_usado: S[k - 1] }, ...parSuplente(S[k - 1])])]);
  assert.equal(p13.marcas.filter((m) => m.tipo !== 'tarefa_substituida').length, 0, JSON.stringify(p13.marcas));
  assert.equal(p13.por_tarefa.find((x) => x.task_id === 't13-ddb0cf50e1').tier, 'T0');
  assert.equal(p13.por_tarefa.find((x) => x.task_id === 't13-ddb0cf50e1').B.escalou, true);
});

test('analise · 13.o (S3/S2/S4/S9, 32): escalacao antes de o local acabar invalida; ordem das tarefas marca; envelope clonado entre bracos marca; modelo nao-opus dominante marca', () => {
  const p = preregDe(['t1', 't2'], { t2: 'T0' });
  // S3: a escalacao (t2) comeca antes de o passo local (t1) acabar
  const s3 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), passoLocal('t2', { ts_inicio: '2026-09-11T00:10:00Z', ts_fim: '2026-09-11T00:10:30Z' }), escalacao('t2', { ts_inicio: '2026-09-11T00:10:10Z', ts_fim: '2026-09-11T00:10:20Z' })]);
  assert.equal(s3.corrida_valida, false);
  assert.ok(s3.marcas.some((m) => m.tipo === 'tentativas_fora_do_protocolo' && /escalacao a comecar/.test(m.motivo)));
  // fronteira: a escalacao a comecar EXACTAMENTE quando o local acaba e sequencial
  const s3b = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0', ts_inicio: '2026-09-11T00:00:00Z', ts_fim: '2026-09-11T00:00:05Z' }), passoLocal('t2', { ts_inicio: '2026-09-11T00:10:00Z', ts_fim: '2026-09-11T00:10:30Z' }), escalacao('t2', { ts_inicio: '2026-09-11T00:10:30Z', ts_fim: '2026-09-11T00:10:40Z' })]);
  assert.equal(s3b.marcas.filter((m) => m.tipo === 'tentativas_fora_do_protocolo').length, 0);
  assert.equal(s3b.corrida_valida, true);
  // S2: t2 (ordem 2) a comecar antes de t1 (ordem 1) — so marca
  const s2 = correr(preregDe(['t1', 't2']), [tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.ok(s2.marcas.some((m) => m.tipo === 'ordem_das_tarefas_divergente' && m.task_id === 't2'));
  assert.equal(s2.corrida_valida, true);
  // S4: B com o envelope de A (usage, modelUsage e duration_ms iguais ao ms) e session_id novo — marca; a bancada honesta varia o duration_ms por linha
  const a = tentativa('t1', 'A');
  const s4 = correr(preregDe(['t1', 't2']), [a, tentativa('t1', 'B', { duration_ms: a.duration_ms }), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(s4.marcas.filter((m) => m.tipo === 'envelope_clonado_entre_bracos').length, 1);
  assert.equal(s4.corrida_valida, true, 'so marca — a fabricacao coerente so o worktree a refuta (17)');
  assert.equal(correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B')]).marcas.length, 0, 'sem clone, sem marca');
  // S9: modelUsage com Opus acima do piso (36) e Sonnet 25000 -> so marca; abaixo do piso e a 36 (outro_modelo_fez_o_trabalho)
  const s9 = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { inputTokens: 1000, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.005 }, 'claude-sonnet-4-5': { inputTokens: 25000, outputTokens: 100, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.1 } }, usage: { ...SONDA.usage, input_tokens: 26000, output_tokens: 101, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } })]);
  assert.ok(s9.marcas.some((m) => m.tipo === 'modelo_nao_opus_dominante' && m.braco === 'B'));
  assert.equal(s9.corrida_valida, true);
});

test('analise · 13.o (R13-A01/A02/A05/A08): fronteiras — tsCanonico com 4+ digitos de ms ou sem segundos; a folga da reconciliacao; e_escalacao:false na tentativa 2', () => {
  assert.ok(!tsCanonico('2026-09-11T08:00:00.1234Z'), 'A01: 4 digitos de ms nao e toISOString()');
  assert.ok(!tsCanonico('2026-09-11T08:00Z'), 'A02: sem segundos');
  assert.ok(tsCanonico('2026-09-11T08:00:00.123Z'));
  // A05: a folga e 1% + 10
  assert.equal(reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, output_tokens: 14 } })).ok, true, '4 + 10 = 14 dentro');
  assert.equal(reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, output_tokens: 16 } })).ok, false, '16 > 4*1.01 + 10 fora');
  // A08: e_escalacao:false na tentativa 2 invalida
  const p = preregDe(['t1'], { t1: 'T0' });
  const r = correr(p, [tentativa('t1', 'A', { tier_classificado: 'T0' }), passoLocal('t1'), escalacao('t1', { e_escalacao: false })]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /e_escalacao incoerente/.test(x.motivo)));
});

test('analise · 13.o (e4/e5/e6): o main — exit 2 sem ledger, --out sem valor e erro, linhas invalidas no resumo, --out escreve o resultado', (tctx) => {
  const cli = path.join(HERE, 'custo-analise.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custo-cli-'));
  const defaultOut = path.join(HERE, 'custo-analysis.json');
  const defaultExistia = fs.existsSync(defaultOut);   // um mutante que caia no default escreve aqui: limpa-se SEMPRE, mesmo que uma asserção falhe
  tctx.after(() => { fs.rmSync(dir, { recursive: true, force: true }); if (!defaultExistia && fs.existsSync(defaultOut)) fs.rmSync(defaultOut); });
  const semLedger = spawnSync(process.execPath, [cli, '--ledger', path.join(dir, 'nao-existe.jsonl'), '--out', path.join(dir, 'o.json')], { encoding: 'utf8' });
  assert.equal(semLedger.status, 2);
  assert.match(semLedger.stderr, /falta o ledger/);
  assert.ok(!fs.existsSync(path.join(dir, 'o.json')), 'sem ledger nao ha resultado');
  const ledger = path.join(dir, 'l.jsonl');
  fs.writeFileSync(ledger, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B')].map((e) => JSON.stringify(e)).join('\n') + '\n{lixo\nnull\n');
  const semValor = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out'], { encoding: 'utf8' });
  assert.equal(semValor.status, 2, 'e6: --out sem valor nunca cai no default em silencio');
  assert.match(semValor.stderr, /--out sem valor/);
  const igual = spawnSync(process.execPath, [cli, `--ledger=${ledger}`, '--out', path.join(dir, 'x.json')], { encoding: 'utf8' });
  assert.equal(igual.status, 2, '33: --flag=valor e erro, nunca o default');
  const typo = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', path.join(dir, 'x.json'), '--typo', 'v'], { encoding: 'utf8' });
  assert.equal(typo.status, 2, '33: flag desconhecida e erro (mesmo com ledger e out validos)');
  const solto = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', path.join(dir, 'x.json'), 'solto'], { encoding: 'utf8' });
  assert.equal(solto.status, 2, '33: argumento solto e erro');
  const outLedger = spawnSync(process.execPath, [cli, '--out', '--ledger', ledger], { encoding: 'utf8' });
  assert.equal(outLedger.status, 2, 'N13: --out sem valor seguido de outro flag');
  assert.ok(!fs.existsSync(path.join(dir, 'x.json')) && !fs.existsSync('--ledger'));
  // 34 (CLI, d4 do 15.o): --out igual ao ledger ou ao prereg e exit 2 e NAO toca na entrada (sobrescrever o ledger destruia a unica prova da corrida)
  const shaLedger = crypto.createHash('sha256').update(fs.readFileSync(ledger)).digest('hex');
  const outLedgerMesmo = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', ledger], { encoding: 'utf8' });
  assert.equal(outLedgerMesmo.status, 2); assert.match(outLedgerMesmo.stderr, /destruiria a entrada/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(ledger)).digest('hex'), shaLedger, 'o ledger ficou intacto');
  const preregCopia = path.join(dir, 'p.json'); fs.copyFileSync(path.join(HERE, 'custo-prereg.json'), preregCopia);
  const outPreregMesmo = spawnSync(process.execPath, [cli, '--prereg', preregCopia, '--ledger', ledger, '--out', preregCopia], { encoding: 'utf8' });
  assert.equal(outPreregMesmo.status, 2);
  assert.equal(fs.readFileSync(preregCopia, 'utf8'), fs.readFileSync(path.join(HERE, 'custo-prereg.json'), 'utf8'), 'o prereg ficou intacto');
  // 16.o (5): o guarda compara o caminho REAL — maiusculas trocadas, junction e nome curto 8.3 sao o mesmo ficheiro
  const ledgerCase = path.join(path.dirname(ledger), path.basename(ledger).toUpperCase());
  if (process.platform === 'win32') {
    const outCase = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', ledgerCase], { encoding: 'utf8' });
    assert.equal(outCase.status, 2, 'win32: L.JSONL e l.jsonl sao o mesmo ficheiro');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(ledger)).digest('hex'), shaLedger);
  }
  const dirJ = path.join(os.tmpdir(), `custo-cli-j-${process.pid}`);
  try { fs.symlinkSync(dir, dirJ, 'junction'); } catch { /* sem junction possivel: salta este ramo */ }
  if (fs.existsSync(dirJ)) {
    tctx.after(() => { try { fs.rmSync(dirJ, { recursive: false, force: true }); } catch {} });
    const outJ = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', path.join(dirJ, path.basename(ledger))], { encoding: 'utf8' });
    assert.equal(outJ.status, 2, 'junction: outro caminho, o mesmo ficheiro');
    assert.match(outJ.stderr, /destruiria a entrada/);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(ledger)).digest('hex'), shaLedger, 'o ledger ficou intacto atraves da junction');
  }
  if (process.platform === 'win32') {
    const curto = spawnSync('cmd', ['/c', `for %I in ("${ledger}") do @echo %~sI`], { encoding: 'utf8' }).stdout.trim();
    if (curto && curto.toLowerCase() !== ledger.toLowerCase() && fs.existsSync(curto)) {
      const outCurto = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', curto], { encoding: 'utf8' });
      assert.equal(outCurto.status, 2, `nome curto 8.3 (${curto}) e o mesmo ficheiro`);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(ledger)).digest('hex'), shaLedger, 'o ledger ficou intacto atraves do nome curto');
    }
  }
  // pre-registo que nao e JSON ou sem forma: exit 2 com mensagem, nunca stack trace
  fs.writeFileSync(path.join(dir, 'lixo.json'), '{lixo');
  const naoJson = spawnSync(process.execPath, [cli, '--prereg', path.join(dir, 'lixo.json'), '--ledger', ledger, '--out', path.join(dir, 'y.json')], { encoding: 'utf8' });
  assert.equal(naoJson.status, 2); assert.match(naoJson.stderr, /nao e JSON/); assert.doesNotMatch(naoJson.stderr, /TypeError|\n\s+at /);
  fs.writeFileSync(path.join(dir, 'semforma.json'), '{"corpus":{"tarefas":[]}}');
  const semForma = spawnSync(process.execPath, [cli, '--prereg', path.join(dir, 'semforma.json'), '--ledger', ledger, '--out', path.join(dir, 'y.json')], { encoding: 'utf8' });
  assert.equal(semForma.status, 2); assert.match(semForma.stderr, /sem a forma esperada/); assert.doesNotMatch(semForma.stderr, /TypeError/);
  assert.ok(!fs.existsSync(path.join(dir, 'y.json')));
  const out = path.join(dir, 'r.json');
  const ok = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', out], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /linhas de ledger invalidas 2/, 'e4: as linhas invalidas aparecem no resumo');
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(r.linhas_de_ledger_invalidas.length, 2);
  assert.equal(r.prereg_sha256, PREREG_SHA256_ESPERADO);
  assert.equal(r.corrida_fechou_os_pares, false, 't1 e uma das 20 do prereg real? nao — e orfa; o prefixo e 0/20');
});

// ── 14.o revisor: o modelo e tratamento (interpretacao 33) ──

test('analise · 14.o NO-SHIP (f1b/f5b/f3/f4, 33): modelo_pedido e modelUsage com outro Opus — outro tratamento, corrida INVALIDA; null e campo em falta', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const outroOpus = { 'claude-opus-4-1': SONDA.modelUsage['claude-opus-5'] };
  // f1b: B nas 5 falhas em claude-opus-4-1 (pedido e modelUsage), aceite com prova coerente -> antes: «cumprido · A 20 B 20 · marcas 0»
  const f1b = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, modelo_pedido: 'claude-opus-4-1', modelo_reportado: 'claude-opus-4-1', modelUsage: outroOpus } : e)))));
  assert.equal(f1b.corrida_valida, false);
  assert.equal(f1b.primaria.limiar_descritivo_cumprido, null);
  assert.equal(f1b.marcas.filter((m) => m.tipo === 'modelo_pedido_divergente').length, 5);
  assert.equal(f1b.marcas.filter((m) => m.tipo === 'opus_fora_do_pedido').length, 5);
  assert.ok(f1b.fiabilidade.pares_invalidos.some((x) => /modelo pedido ou Opus diferente do pre-registado.*CORRIDA INVALIDA/.test(x.motivo)));
  // f5b (espelho): A noutro Opus rejeitado em 3 tarefas do controlo 18/20 -> antes: «A 17 B 18 · valida · marcas 0»
  const idsA = T.filter((t, i) => falhaB(i)).slice(0, 3).map((t) => t.task_id);
  const f5b = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: i !== 3 && i !== 7 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && idsA.includes(e.task_id) ? { ...e, modelo_pedido: 'claude-opus-4-1', modelo_reportado: 'claude-opus-4-1', modelUsage: outroOpus, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 } : e))));
  assert.equal(f5b.corrida_valida, false);
  // f3: modelo_pedido haiku com modelUsage opus-5 -> divergente; f4: modelo_pedido null em A -> campo_em_falta e invalida
  const p = preregDe(['t1', 't2']);
  const f3 = correr(p, [tentativa('t1', 'A', { modelo_pedido: 'claude-haiku-4' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(f3.corrida_valida, false);
  assert.ok(f3.marcas.some((m) => m.tipo === 'modelo_pedido_divergente' && /claude-haiku-4/.test(m.motivo)));
  const f4 = correr(p, [tentativa('t1', 'A', { modelo_pedido: null }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(f4.corrida_valida, false);
  assert.ok(f4.marcas.some((m) => m.tipo === 'campo_em_falta' && m.motivo === 'modelo_pedido'));
  // M304: modelo_pedido certo mas o modelUsage noutro Opus -> opus_fora_do_pedido invalida por si
  const fo = correr(p, [tentativa('t1', 'A', { modelUsage: outroOpus, modelo_reportado: 'claude-opus-4-1' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(fo.corrida_valida, false);
  assert.ok(fo.corrida_invalida_por.some((x) => /modelUsage com um Opus diferente do pre-registado/.test(x.motivo)));
  assert.equal(fo.marcas.filter((m) => m.tipo === 'modelo_pedido_divergente').length, 0);
  // M305: o modelo pre-registado le-se do prereg, nao esta cravado — com «--model claude-opus-6» no executor de A, o claude-opus-5 da bancada e divergente
  const p6 = { ...p, bracos: { ...p.bracos, A: { ...p.bracos.A, executor: p.bracos.A.executor.replace('--model claude-opus-5', '--model claude-opus-6') } } };
  const f6 = correr(p6, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(f6.corrida_valida, false);
  assert.ok(f6.marcas.some((m) => m.tipo === 'modelo_pedido_divergente' && /!= claude-opus-6/.test(m.motivo)));
  // modelo_reportado que nao e chave do modelUsage: so marca
  const fr = correr(p, [tentativa('t1', 'A', { modelo_reportado: 'claude-opus-5-20260901' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(fr.marcas.some((m) => m.tipo === 'modelo_reportado_divergente'));
  assert.equal(fr.corrida_valida, true);
  // o passo local nao entra (modelo_pedido 'ollama'); e uma segunda chave opus-5 nao existe — o Sonnet ao lado e a S9, nao a 33
  const pL = preregDe(['t1', 't2'], { t2: 'T0' });
  assert.equal(correr(pL, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2')]).marcas.length, 0);
  // d3: tarefa_excluida com id fora do corpus e da lista de suplentes consome um suplente sem registo -> INVALIDA
  const d3 = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tarefa_excluida', task_id: 'tXX-desconhecida', motivo: 'x', suplente_usado: 's1' }, preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(d3.corrida_valida, false);
  assert.ok(d3.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /fora do corpus e da lista de suplentes/.test(m.motivo)));
});

test('analise · 14.o (N15/N16/N17, 32): a coluna tier_classificado de SUPLENTES_ESPERADOS e das 20 do corpus bate com o classify.js congelado sobre os prompts do manifesto, sem ANTHROPIC_API_KEY', (tctx) => {
  const routerDir = path.join(HERE, '..', 'router');
  if (fs.existsSync(path.join(routerDir, 'tuning-state.json'))) { tctx.skip('tuning-state.json vivo nesta maquina — o classify nao e o dos defaults commitados'); return; }
  const require = createRequire(import.meta.url);
  const chave = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  try {
    const { classify } = require(path.join(routerDir, 'classify.js'));
    const manifesto = JSON.parse(fs.readFileSync(path.join(HERE, 'r24-manifest.json'), 'utf8'));
    const tarefas = Object.values(manifesto).find(Array.isArray);
    for (const [id, m] of Object.entries(SUPLENTES_ESPERADOS)) assert.equal(classify(tarefas.find((x) => x.task_id === id).prompt).tier, m.tier_classificado, `suplente ${id}`);
    for (const t of PREREG.corpus.tarefas) assert.equal(classify(tarefas.find((x) => x.task_id === t.task_id).prompt).tier, t.tier_classificado, `corpus ${t.task_id}`);
  } finally { if (chave !== undefined) process.env.ANTHROPIC_API_KEY = chave; }
});

// ── 15.o revisor: fora do protocolo e retoma (34); a cache reconcilia-se (35); piso no JSON (36) ──

test('analise · 15.o NO-SHIP (X1b/X2/X1c, 34): a tentativa falhada de B escondida em braco "X" ou num evento fora dos 6 — corrida INVALIDA, (c) no par; em espelho, A retomada; inicio orfao', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const falha = (t) => ({ aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 });
  const cliB = (ev) => ev.find((e) => e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p');
  // X1b: nas 5 falhas de B a tentativa falhada vai para braco "X" e a 2.a corrida (aceite) e o B «oficial» -> antes: «cumprido · A 20 B 20 · valida · orfas 5»
  const x1b = analisarReal(T.flatMap((t, i) => { const ev = parReal(t); return falhaB(i) ? ev : [...ev, { ...cliB(ev), braco: 'X', ...falha(t), session_id: `x-${i}` }]; }));
  assert.equal(x1b.corrida_valida, false);
  assert.equal(x1b.primaria.limiar_descritivo_cumprido, null);
  assert.equal(x1b.marcas.filter((m) => m.tipo === 'tentativa_orfa').length, 5);
  assert.equal(x1b.fiabilidade.tentativas_orfas.length, 5, 'continuam visiveis, com consumo');
  assert.ok(x1b.corrida_invalida_por.some((x) => /tentativa orfa.*retoma escondida/.test(x.motivo)));
  assert.equal(x1b.fiabilidade.pares_invalidos.filter((x) => /retoma escondida.*CORRIDA INVALIDA/.test(x.motivo)).length, 5, '(c) nos 5 pares');
  assert.equal(x1b.primaria.n_pares_validos, 15);
  // X2: o mesmo como evento `tentativa_fim_descartada` -> antes: «cumprido · A 20 B 20 · eventos desconhecidos 5»
  const x2 = analisarReal(T.flatMap((t, i) => { const ev = parReal(t); return falhaB(i) ? ev : [...ev, { ...cliB(ev), evento: 'tentativa_fim_descartada', ...falha(t), session_id: `x-${i}` }]; }));
  assert.equal(x2.corrida_valida, false);
  assert.equal(x2.primaria.limiar_descritivo_cumprido, null);
  assert.equal(x2.fiabilidade.eventos_desconhecidos.length, 5);
  assert.equal(x2.fiabilidade.pares_invalidos.filter((x) => /retoma escondida/.test(x.motivo)).length, 5);
  // X1c (espelho): A retomada 3x como "A_" onde o honesto da «cumprido · A 17 B 17» e o ataque dava «NAO cumprido · A 20 B 17 · valida»
  const idsA = T.filter((t, i) => falhaB(i)).slice(0, 3).map((t) => t.task_id);
  const honesto = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: !idsA.includes(t.task_id) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && idsA.includes(e.task_id) ? { ...e, ...falha(t) } : e))));
  assert.equal(honesto.primaria.limiar_descritivo_cumprido, true, 'honesto: A 17 B 17');
  assert.equal(honesto.marcas.length, 0);
  const x1c = analisarReal(T.flatMap((t, i) => { const ev = parReal(t, { aceiteB: !idsA.includes(t.task_id) }); return idsA.includes(t.task_id) ? [...ev, { ...ev.find((e) => e.evento === 'tentativa_fim' && e.braco === 'A'), braco: 'A_', ...falha(t), session_id: `a-${i}` }] : ev; }));
  assert.equal(x1c.corrida_valida, false, 'espelho: nunca «NAO cumprido · valida»');
  assert.equal(x1c.primaria.limiar_descritivo_cumprido, null);
  // tentativa_inicio orfao: um braco lancado fora do protocolo (a retoma morta antes do fim)
  const p = preregDe(['t1', 't2']);
  const xi = analisar(p, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), { evento: 'tentativa_inicio', task_id: 't1', braco: 'X', tentativa: 1, ts_inicio: '2026-09-10T00:00:00Z' }, preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(xi.corrida_valida, false);
  assert.ok(xi.marcas.some((m) => m.tipo === 'inicio_orfao' && /braco "X"/.test(m.motivo)));
  assert.deepEqual(xi.fiabilidade.inicios_orfaos, [{ task_id: 't1', braco: 'X', tentativa: 1 }]);
  assert.ok(xi.fiabilidade.pares_invalidos.some((x) => x.task_id === 't1' && /retoma escondida/.test(x.motivo)));
  assert.ok(xi.por_tarefa.find((x) => x.task_id === 't2').par_valido, 't2 nao e tocada');
  // orfa com task_id FORA do jogo: invalida a corrida, sem (c) em nenhum par (nao ha par a que se ligue)
  const xf = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), tentativa('t9-fora', 'A')]);
  assert.equal(xf.corrida_valida, false);
  assert.equal(xf.primaria.n_pares_validos, 2);
  assert.ok(!xf.fiabilidade.pares_invalidos.length);
  // evento desconhecido sem task_id: invalida, sem (c)
  const xn = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), { evento: 'nota', texto: 'x' }]);
  assert.equal(xn.corrida_valida, false);
  assert.equal(xn.primaria.n_pares_validos, 2);
});

test('analise · 15.o NO-SHIP (X3/X30/X6, 35): a cache reconcilia-se nos dois sentidos; nao reconciliar e consumo desconhecido; JSON parcial nunca cai no transcript', () => {
  const opus = SONDA.modelUsage['claude-opus-5'];
  assert.equal(reconciliar(tentativa('x', 'A')).ok, true, 'a sonda reconcilia nas 4 categorias');
  const semCache = { 'claude-opus-5': { ...opus, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } };
  const r1 = reconciliar(tentativa('x', 'A', { modelUsage: semCache }));   // usage diz 58 964 de criacao, modelUsage 0
  assert.equal(r1.ok, false); assert.match(r1.motivo, /usage\.cache_creation 58964 > soma modelUsage 0/);
  const r2 = reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, cache_creation_input_tokens: 0 } }));   // usage 0 < modelUsage 58 964
  assert.equal(r2.ok, false); assert.match(r2.motivo, /usage\.cache_creation 0 < soma modelUsage 58964/);
  const r3 = reconciliar(tentativa('x', 'A', { modelUsage: { 'claude-opus-5': { ...opus, cacheReadInputTokens: 5000000 } } }));
  assert.equal(r3.ok, false); assert.match(r3.motivo, /usage\.cache_read 0 < soma modelUsage 5000000/);
  const r4 = reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, cache_read_input_tokens: 250000 } }));
  assert.equal(r4.ok, false); assert.match(r4.motivo, /usage\.cache_read 250000 > soma modelUsage 0/);
  // a folga e a mesma (1 % + 10): 58 964 * 1.01 + 10 = 59 563.64
  assert.equal(reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, cache_creation_input_tokens: 59563 } })).ok, true);
  assert.equal(reconciliar(tentativa('x', 'A', { usage: { ...SONDA.usage, cache_creation_input_tokens: 59564 } })).ok, false);
  // nao reconciliar = consumo desconhecido (null), nunca uma das fontes
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: semCache })), null);
  // um campo em falta que RECONCILIA (cacheRead ausente, usage.cache_read 0) continua desconhecido — a reconciliacao nao substitui o contrato do modelUsage (M122)
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, cacheCreationInputTokens: 58964, costUSD: 0.5 } } })), null);
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { usage: { ...SONDA.usage, output_tokens: 1 } })), null);
  // X3 contra o prereg real: B com cache zero no modelUsage e o usage a dizer 58 964 -> antes «B 92 000 tokens · marcas 0»
  const T = PREREG.corpus.tarefas;
  const emB = (over) => T.flatMap((t, i) => parReal(t, { aceiteB: i % 4 === 0 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...over } : e)));
  const x3 = analisarReal(emB({ modelUsage: semCache }));
  assert.equal(x3.corrida_valida, true, '35 nao toca a primaria');
  assert.equal(x3.primaria.limiar_descritivo_cumprido, false, 'A 20 B 5');
  assert.equal(x3.secundaria.global.B.tokens_opus_total, null, 'B: n/d, nao 92 000');
  assert.notEqual(x3.secundaria.global.A.tokens_opus_total, null);
  assert.equal(x3.marcas.filter((m) => m.tipo === 'reconciliacao' && m.braco === 'B').length, 20);
  assert.ok(x3.marcas.every((m) => m.tipo !== 'tokens_zero_com_arrancou' && m.tipo !== 'tokens_implausiveis'), 'a marca certa e reconciliacao, nao zero');
  assert.ok(x3.marcas.some((m) => m.tipo === 'consumo_desconhecido' && /nao reconciliam/.test(m.motivo)));
  // X30 (espelho): A com 5 M de cache_read so no modelUsage -> A n/d, nunca 101 M
  const x30 = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' ? { ...e, modelUsage: { 'claude-opus-5': { ...opus, cacheReadInputTokens: 5000000 } } } : e))));
  assert.equal(x30.secundaria.global.A.tokens_opus_total, null);
  assert.equal(x30.corrida_valida, true);
  // X6: usage presente e modelUsage null com tokens_transcript 1000 -> JSON parcial; NAO e o transcript (antes: B a 1 000 numa linha cujo usage tem 300 k)
  const emFalhasDeB = (over) => T.flatMap((t, i) => parReal(t, { aceiteB: i % 4 === 0 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' && e.aceite === false ? { ...e, ...over } : e)));
  const x6 = analisarReal(emFalhasDeB({ modelUsage: null, tokens_transcript: 1000 }));
  assert.equal(x6.secundaria.global.B.tokens_opus_total, null);
  assert.equal(x6.marcas.filter((m) => m.tipo === 'json_parcial' && m.braco === 'B').length, 15);
  assert.equal(x6.marcas.filter((m) => m.tipo === 'consumo_do_transcript').length, 0, 'o transcript nao substitui um JSON que chegou');
  assert.equal(x6.corrida_valida, true);
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: null, tokens_transcript: 500000 })), null, 'usage presente: parcial, nao transcript');
  // o inverso (modelUsage sem usage) tambem e parcial
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { usage: null })), null);
  const inv = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { usage: null })]);
  assert.ok(inv.marcas.some((m) => m.tipo === 'json_parcial' && /usage ausente/.test(m.motivo)));
  assert.equal(inv.por_tarefa[0].B.tokens_opus, null);
  // sem JSON NENHUM (timeout) o transcript continua a ser a fonte (regressao da 3)
  const tr = tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 123456 }));
  assert.equal(tr.fonte, 'transcript'); assert.equal(tr.total, 123456);
  const rt = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: null, usage: null, total_cost_usd: null, tokens_transcript: 123456, aceite: false, exit_code: 1, tests_passados: 9 })]);
  assert.ok(!rt.marcas.some((m) => m.tipo === 'json_parcial'));
  assert.ok(rt.marcas.some((m) => m.tipo === 'consumo_do_transcript'));
});

test('analise · 15.o NO-SHIP (X5/X4, 36): piso de plausibilidade no JSON; Opus abaixo do piso com outro modelo dominante e outro tratamento, (c) no par', () => {
  const seis = { 'claude-opus-5': { inputTokens: 2, outputTokens: 4, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0001 } };
  const usageSeis = { ...SONDA.usage, input_tokens: 2, output_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } };
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: seis, usage: usageSeis })), null, '6 tokens abaixo do piso');
  const mil = { 'claude-opus-5': { ...seis['claude-opus-5'], inputTokens: 996 } };
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: mil, usage: { ...usageSeis, input_tokens: 996 } })).total, TRANSCRIPT_MINIMO, 'no piso conta');
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: { 'claude-opus-5': { ...seis['claude-opus-5'], inputTokens: 995 } }, usage: { ...usageSeis, input_tokens: 995 } })), null, 'abaixo do piso nao');
  // X5 contra o prereg real: B com 6 tokens por linha -> antes «B 120 · 8 por aceite · 0,0022 USD · marcas 0»
  const T = PREREG.corpus.tarefas;
  const x5 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: i % 4 === 0 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, modelUsage: seis, usage: usageSeis, total_cost_usd: 0.0001 } : e))));
  assert.equal(x5.corrida_valida, false, '60: 6 tokens nos dois lados nao provam que o modelo correu (ate ao 21.o «36 so por si nao toca a primaria»)');
  assert.equal(x5.primaria.limiar_descritivo_cumprido, null);
  assert.equal(x5.secundaria.global.B.tokens_opus_total, null, 'B: n/d, nao 120');
  assert.equal(x5.marcas.filter((m) => m.tipo === 'tokens_implausiveis' && m.braco === 'B').length, 20, 'a marca da 36 continua');
  assert.equal(x5.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'B' && /\(60\)/.test(m.motivo)).length, 20);
  assert.equal(x5.marcas.filter((m) => m.tipo === 'tokens_zero_com_arrancou').length, 0);
  // X4: A rejeitada em 5 com Opus a 6 tokens e Sonnet com 310 k -> antes «cumprido · A 15 B 20 · valida · marcas 5»
  const sonnet = { ...seis, 'claude-sonnet-5': { inputTokens: 300000, outputTokens: 10000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 1.05 } };
  const usageSonnet = { ...usageSeis, input_tokens: 300002, output_tokens: 10004 };
  const x4 = analisarReal(T.flatMap((t, i) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && i % 4 === 1 ? { ...e, modelUsage: sonnet, usage: usageSonnet, total_cost_usd: 1.0501, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 } : e))));
  assert.equal(x4.corrida_valida, false);
  assert.equal(x4.primaria.limiar_descritivo_cumprido, null);
  assert.equal(x4.marcas.filter((m) => m.tipo === 'outro_modelo_fez_o_trabalho' && m.braco === 'A').length, 5);
  assert.equal(x4.fiabilidade.pares_invalidos.filter((x) => /outro modelo fez o trabalho.*CORRIDA INVALIDA/.test(x.motivo)).length, 5);
  assert.ok(x4.corrida_invalida_por.some((x) => /interpretacao 36/.test(x.motivo)));
  // acima do piso, outro modelo dominante so marca (subagentes noutro modelo sao plausiveis num run honesto)
  const acima = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': SONDA.modelUsage['claude-opus-5'], 'claude-sonnet-5': sonnet['claude-sonnet-5'] }, usage: { ...SONDA.usage, input_tokens: 300002, output_tokens: 10004 } })]);
  assert.ok(acima.marcas.some((m) => m.tipo === 'modelo_nao_opus_dominante' && m.braco === 'B'));
  assert.equal(acima.marcas.filter((m) => m.tipo === 'outro_modelo_fez_o_trabalho').length, 0);
  assert.equal(acima.corrida_valida, true);
  assert.equal(acima.por_tarefa[0].B.tokens_opus, OPUS_TOTAL, 'o Opus conta; o Sonnet fica de fora (declarado na marca)');
  // Opus a ZERO com Sonnet a consumir: tambem e outro modelo (nao so tokens_zero)
  const zero = { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 }, 'claude-sonnet-5': sonnet['claude-sonnet-5'] };
  const z = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: zero, usage: { ...usageSeis, input_tokens: 300000, output_tokens: 10000 } })]);
  assert.equal(z.corrida_valida, false);
  assert.ok(z.marcas.some((m) => m.tipo === 'outro_modelo_fez_o_trabalho' && /contra 0 de Opus/.test(m.motivo)));
  // um Opus a 6 sem outro modelo: tokens_implausiveis (36) E, desde o 22.o, arrancou_sem_evidencia (60) — 6 tokens nos dois lados nao provam corrida; INVALIDA
  const so6 = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: seis, usage: usageSeis })]);
  assert.equal(so6.corrida_valida, false, '60');
  assert.ok(so6.marcas.some((m) => m.tipo === 'tokens_implausiveis'));
  assert.ok(so6.marcas.some((m) => m.tipo === 'arrancou_sem_evidencia' && /usage 6 · Opus 6/.test(m.motivo)));
});

// ── 16.o revisor: um inicio a mais e retoma (37); negativos no JSON (38); custo do CLI nunca zero por omissao (39); session_id (40); a saida (a) diz o sentido ──

test('analise · 16.o NO-SHIP (Y1/Y21/Y1b, 37): tentativa_inicio a mais sem fim — fora de {1,2}, A t2, ou sem fim numa corrida sem paragem — INVALIDA, (c) no par; o ultimo inicio antes da paragem e legitimo', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const ini = (id, b, n) => ({ evento: 'tentativa_inicio', task_id: id, braco: b, tentativa: n, ts_inicio: '2026-09-10T00:00:00Z' });
  // Y1: nas 5 falhas de B, um inicio B t3 (T0) / t2 (T3) sem fim ao lado do B aceite -> antes «cumprido · A 20 B 20 · marcas 5 (tentativa_sem_fim)»
  const y1 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [...parReal(t), ini(t.task_id, 'B', t.tier_classificado === 'T0' || t.tier_classificado === 'T1' ? 3 : 2)])));
  assert.equal(y1.corrida_valida, false);
  assert.equal(y1.primaria.limiar_descritivo_cumprido, null);
  assert.ok(y1.corrida_invalida_por.some((x) => /interpretacao 37/.test(x.motivo)));
  assert.equal(y1.fiabilidade.pares_invalidos.filter((x) => /retoma escondida/.test(x.motivo)).length, 5, '(c) nos 5 pares');
  // Y21: tentativa 9
  const y21 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : [...parReal(t), ini(t.task_id, 'B', 9)])));
  assert.equal(y21.corrida_valida, false);
  assert.equal(y21.marcas.filter((m) => m.tipo === 'inicio_fora_do_protocolo' && /fora de \{1,2\}/.test(m.motivo)).length, 5);
  // Y1b (espelho): A t2 sem fim
  const idsA = T.filter((t, i) => falhaB(i)).slice(0, 3).map((t) => t.task_id);
  const y1b = analisarReal(T.flatMap((t) => (idsA.includes(t.task_id) ? [...parReal(t), ini(t.task_id, 'A', 2)] : parReal(t))));
  assert.equal(y1b.corrida_valida, false);
  assert.equal(y1b.marcas.filter((m) => m.tipo === 'inicio_fora_do_protocolo' && /so tem a tentativa 1/.test(m.motivo)).length, 3);
  // contrato: tentativa string, task_id null, braco null
  const p = preregDe(['t1', 't2']);
  const c1 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), { evento: 'tentativa_inicio', task_id: 't1', braco: 'B', tentativa: '1' }]);
  assert.equal(c1.corrida_valida, false);
  assert.ok(c1.marcas.some((m) => m.tipo === 'inicio_fora_do_protocolo' && /tentativa "1" fora/.test(m.motivo)));
  const c2 = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B'), { evento: 'tentativa_inicio', braco: 'B' }]);
  assert.equal(c2.corrida_valida, false);
  assert.ok(c2.marcas.some((m) => m.tipo === 'inicio_fora_do_protocolo' && /task_id null nao e string/.test(m.motivo)));
  // com paragem: o ULTIMO inicio sem fim e morte a meio (marca); um inicio sem fim ANTES do ultimo continua a invalidar
  const morte = analisar(p, [preVoo('t1'), ini('t1', 'A', 1), tentativa('t1', 'A'), ini('t1', 'B', 1), tentativa('t1', 'B'), preVoo('t2'), ini('t2', 'A', 1), tentativa('t2', 'A'), ini('t2', 'B', 1), { evento: 'paragem', motivo: 'crash', n: 2 }]);
  assert.ok(!morte.corrida_invalida_por.some((x) => /interpretacao 37/.test(x.motivo)), 'o ultimo inicio antes da paragem e legitimo');
  assert.ok(morte.marcas.some((m) => m.tipo === 'tentativa_sem_fim' && m.task_id === 't2' && /morte a meio/.test(m.motivo)));
  const antes = analisar(p, [preVoo('t1'), ini('t1', 'A', 1), tentativa('t1', 'A'), ini('t1', 'B', 1), ini('t1', 'B', 2), tentativa('t1', 'B'), preVoo('t2'), ini('t2', 'A', 1), tentativa('t2', 'A'), ini('t2', 'B', 1), { evento: 'paragem', motivo: 'crash', n: 2 }]);
  assert.ok(antes.corrida_invalida_por.some((x) => /interpretacao 37/.test(x.motivo)), 'o inicio B t1 sem fim nao e o ultimo: braco lancado a mais');
  // e o ultimo inicio antes da paragem com tentativa 3: a morte a meio nao legitima uma tentativa que o protocolo nao tem (M345)
  const t3 = analisar(p, [preVoo('t1'), ini('t1', 'A', 1), tentativa('t1', 'A'), ini('t1', 'B', 1), tentativa('t1', 'B'), preVoo('t2'), ini('t2', 'A', 1), tentativa('t2', 'A'), ini('t2', 'B', 3), { evento: 'paragem', motivo: 'crash', n: 2 }]);
  assert.equal(t3.corrida_valida, false);
  assert.ok(t3.marcas.some((m) => m.tipo === 'inicio_fora_do_protocolo' && m.task_id === 't2' && /tentativa 3 fora/.test(m.motivo)));
  // honesto com inicios em todas as linhas (incl. o passo local): marcas 0
  const h = analisarReal(T.flatMap((t) => parReal(t).flatMap((e) => (e.evento === 'tentativa_fim' ? [{ evento: 'tentativa_inicio', task_id: e.task_id, braco: e.braco, tentativa: e.tentativa, ts_inicio: e.ts_inicio }, e] : [e]))));
  assert.equal(h.marcas.length, 0, 'o honesto com inicios da marcas 0');
  assert.equal(h.corrida_valida, true);
});

test('analise · 16.o NO-SHIP (Y2/Y2c/Y2b, 38): negativos coerentes em usage E modelUsage sao tipo_invalido; string no usage idem; abaixo da sonda marca; SONDA_TOTAL_OPUS bate com a fixture', () => {
  const s = SONDA.modelUsage['claude-opus-5'];
  assert.equal(SONDA_TOTAL_OPUS, s.inputTokens + s.outputTokens + s.cacheCreationInputTokens + s.cacheReadInputTokens, 'a constante pinada e a soma da sonda real');
  assert.equal(SONDA_TOTAL_OPUS, 58970);
  // violacoesDeTipo apanha negativos em qualquer chave do modelUsage (nao so Opus), nas 4 categorias do usage e na divisao 1h/5m; e strings nas categorias do usage
  const v = (over) => violacoesDeTipo(tentativa('x', 'A', over));
  assert.deepEqual(v({}), []);
  assert.ok(v({ modelUsage: { 'claude-opus-5': { ...s, cacheReadInputTokens: -900 } } }).some((x) => /modelUsage\.claude-opus-5\.cacheReadInputTokens: negativo \(-900\)/.test(x)));
  assert.ok(v({ modelUsage: { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: -1, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } } }).some((x) => /claude-haiku-4-5\.inputTokens: negativo/.test(x)));
  assert.ok(v({ modelUsage: { 'claude-opus-5': { ...s, costUSD: -0.5 } } }).some((x) => /costUSD: negativo/.test(x)));
  assert.ok(v({ usage: { ...SONDA.usage, cache_read_input_tokens: -900 } }).some((x) => /usage\.cache_read_input_tokens: -900 nao e um numero >= 0/.test(x)));
  assert.ok(v({ usage: { ...SONDA.usage, cache_creation: { ephemeral_1h_input_tokens: -1, ephemeral_5m_input_tokens: 58965 } } }).some((x) => /usage\.cache_creation\.ephemeral_1h_input_tokens: negativo/.test(x)));
  assert.ok(v({ usage: { ...SONDA.usage, cache_creation_input_tokens: '58964' } }).some((x) => /usage\.cache_creation_input_tokens: "58964" nao e um numero/.test(x)), 'uma string reconcilia por coercao — e tipo invalido');
  // Y2 contra o prereg real: B com cache_read -900 nos dois lados -> antes «B 74 000 · marcas 0 · cache_read -18 000»
  const T = PREREG.corpus.tarefas;
  const emB = (over) => T.flatMap((t, i) => parReal(t, { aceiteB: i % 4 === 0 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...over } : e)));
  const y2 = analisarReal(emB({ modelUsage: { 'claude-opus-5': { ...s, cacheReadInputTokens: -900 } }, usage: { ...SONDA.usage, cache_read_input_tokens: -900 } }));
  assert.equal(y2.corrida_valida, false);
  assert.equal(y2.primaria.limiar_descritivo_cumprido, null);
  assert.equal(y2.marcas.filter((m) => m.tipo === 'tipo_invalido' && m.braco === 'B').length, 20);
  assert.equal(y2.secundaria.global.B.tokens_opus_total, null);
  // Y2b: a forja COERENTE com cache zero nos dois lados — nao se invalida (classe «mente de forma coerente», 30) mas marca abaixo_da_sonda, nunca «marcas 0»
  const y2b = analisarReal(emB({ modelUsage: { 'claude-opus-5': { ...s, inputTokens: 4000, outputTokens: 600, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 } }, usage: { ...SONDA.usage, input_tokens: 4000, output_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } }));
  assert.equal(y2b.corrida_valida, true);
  assert.equal(y2b.marcas.filter((m) => m.tipo === 'abaixo_da_sonda' && m.braco === 'B').length, 20);
  assert.equal(y2b.secundaria.global.B.tokens_opus_total, 20 * 4600, 'coerente: conta, mas com 20 marcas');
  // a fronteira: exactamente a sonda (a escalacao com a cache LIDA: 2 + 4 + 0 + 58 964) nao marca
  const lida = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, cacheCreationInputTokens: 0, cacheReadInputTokens: 58964, costUSD: 0.029592 } }, total_cost_usd: 0.029592, usage: { ...SONDA.usage, cache_creation_input_tokens: 0, cache_read_input_tokens: 58964, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } })]);
  assert.equal(lida.marcas.length, 0, 'a escalacao com a cache lida e honesta: marcas 0');
  const menos1 = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, cacheCreationInputTokens: 0, cacheReadInputTokens: 58963, costUSD: 0.0295915 } }, total_cost_usd: 0.0295915, usage: { ...SONDA.usage, cache_creation_input_tokens: 0, cache_read_input_tokens: 58963, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } })]);
  assert.ok(menos1.marcas.some((m) => m.tipo === 'abaixo_da_sonda'), '58 969 marca');
});

test('analise · 16.o NO-SHIP (Y3/Y3b/Y4, 39/40): costUSD omitido ou null e campo em falta com custo null (nunca 0); total_cost_usd 0/null/abaixo da soma e incoerente (null); session_id null marca', () => {
  const s = SONDA.modelUsage['claude-opus-5'];
  const { costUSD, ...semCusto } = s;
  const T = PREREG.corpus.tarefas;
  const emB = (over) => T.flatMap((t, i) => parReal(t, { aceiteB: i % 4 === 0 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...over } : e)));
  // Y3: costUSD omitido em B -> antes custo_cli_opus_usd 0 · marcas 0
  const y3 = analisarReal(emB({ modelUsage: { 'claude-opus-5': semCusto } }));
  assert.equal(y3.corrida_valida, true, '39 nao toca a primaria');
  assert.equal(y3.valorizacao.B.custo_cli_opus_usd, null, 'nunca 0');
  assert.notEqual(y3.valorizacao.A.custo_cli_opus_usd, null);
  assert.equal(y3.marcas.filter((m) => m.tipo === 'campo_em_falta' && /costUSD/.test(m.motivo) && m.braco === 'B').length, 20);
  assert.notEqual(y3.secundaria.global.B.tokens_opus_total, null);
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A', { modelUsage: { 'claude-opus-5': { ...s, costUSD: null } } })).custo_cli_usd, null);
  assert.equal(tokensOpusDaTentativa(tentativa('x', 'A')).custo_cli_usd, costUSD);
  // Y3b: costUSD null e total_cost_usd 0 -> antes {0, 0} · marcas 0
  const y3b = analisarReal(emB({ modelUsage: { 'claude-opus-5': { ...s, costUSD: null } }, total_cost_usd: 0 }));
  assert.equal(y3b.valorizacao.B.custo_cli_opus_usd, null);
  assert.equal(y3b.valorizacao.B.custo_cli_total_usd, null);
  assert.equal(y3b.marcas.filter((m) => m.tipo === 'custo_cli_incoerente' && m.braco === 'B').length, 20);
  assert.equal(y3b.corrida_valida, true);
  // total_cost_usd abaixo da soma dos costUSD (um subagente Haiku que o total nao inclui): incoerente
  const abaixo = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 50, outputTokens: 900, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.06 } }, usage: { ...SONDA.usage, input_tokens: 52, output_tokens: 904 }, total_cost_usd: costUSD })]);
  assert.ok(abaixo.marcas.some((m) => m.tipo === 'custo_cli_incoerente' && /soma dos costUSD/.test(m.motivo)));
  assert.equal(abaixo.por_tarefa[0].B.custo_cli_total_usd, null);
  perto(abaixo.por_tarefa[0].B.custo_cli_usd, USD_SONDA, 1e-4);   // o custo Opus do CLI continua (o costUSD do Opus esta la)
  // e o total igual a soma (o CLI real) nao marca; com folga de arredondamento
  const igual = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: 50, outputTokens: 900, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.06 } }, usage: { ...SONDA.usage, input_tokens: 52, output_tokens: 904 }, total_cost_usd: costUSD + 0.06 - 1e-9 })]);
  assert.ok(!igual.marcas.some((m) => m.tipo === 'custo_cli_incoerente'));
  perto(igual.por_tarefa[0].B.custo_cli_total_usd, costUSD + 0.06, 1e-4);   // arred.usd a 4 casas
  // Y4: session_id null em todas as claude-p -> antes marcas 0 (e a 22 cega)
  const y4 = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'claude-p' ? { ...e, session_id: null } : e))));
  assert.equal(y4.marcas.filter((m) => m.tipo === 'campo_em_falta' && /session_id/.test(m.motivo)).length, 40);
  assert.equal(y4.corrida_valida, true, 'so marca');
  // um timeout sem JSON nenhum (nao chegou) nao leva a marca de session_id
  const to = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { session_id: null, usage: null, modelUsage: null, total_cost_usd: null, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 900000 })]);
  assert.ok(!to.marcas.some((m) => m.tipo === 'campo_em_falta' && /session_id/.test(m.motivo)));
});

test('analise · 16.o (Y5/Y19, 6): a saida (a) do pre-registo com resultado no outro braco nao invalida — marca o sentido da remocao, conta em fiabilidade, e o CLI imprime-a', (tctx) => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const puro = (id, b) => naoArrancou(id, b);
  // Y5: A spawn puro exactamente nas 5 tarefas em que B falhou -> «cumprido» sobre 15 (a saida pre-registada) — mas 5 marcas «favorece B»
  const y5 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t, { aceiteB: false }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' ? { ...puro(t.task_id, 'A'), tier_classificado: t.tier_classificado } : e)))));
  assert.equal(y5.corrida_valida, true, 'a saida (a) e a do pre-registo; o ledger nao a refuta');
  assert.equal(y5.primaria.n_pares_validos, 15);
  assert.ok(y5.primaria.AVISO_N);
  assert.deepEqual(y5.fiabilidade.saidas_a_com_resultado_no_outro_braco, { favorece_A: 0, favorece_B: 5 });
  assert.equal(y5.marcas.filter((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && m.sentido === 'favorece B' && /braco B rejeitado/.test(m.motivo)).length, 5);
  // Y19: B spawn puro nas 5 falhas (A aceite) -> favorece B tambem; e o braco B era o SEGUNDO da ordem quando B-depois-A
  const y19 = analisarReal(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...puro(t.task_id, 'B'), tentativa: e.tentativa, e_escalacao: e.e_escalacao, tier_classificado: t.tier_classificado } : e)))));
  assert.equal(y19.corrida_valida, true);
  assert.equal(y19.fiabilidade.saidas_a_com_resultado_no_outro_braco.favorece_B, 5);
  const segundos = T.filter((t, i) => !falhaB(i) && t.ordem_dos_bracos === 'B-depois-A').length;
  assert.equal(y19.marcas.filter((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && /SEGUNDO da ordem/.test(m.motivo)).length, segundos, 'diz quando o braco que nao arrancou era o segundo');
  // os outros dois sentidos: (A?, B aceite) e (A rejeitado, B?) favorecem A
  const p = preregDe(['t1', 't2']);
  const fa1 = correr(p, [puro('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(fa1.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && m.sentido === 'favorece A' && /braco B aceite/.test(m.motivo)));
  const fa2 = correr(p, [tentativa('t1', 'A', { aceite: false, exit_code: 1, tests_passados: 9 }), puro('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(fa2.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco' && m.sentido === 'favorece A' && /braco A rejeitado/.test(m.motivo)));
  // um (c) nunca leva esta marca (nao e saida (a)); um par_invalido sem linha no outro braco tambem nao
  const c = correr(p, [tentativa('t1', 'A', { aceite: null }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(!c.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco'));
  const cBraco = correr(p, [naoArrancou('t1', 'A', { motivo_se_nao: 'cli_is_error:x' }), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);   // (c): nao e saida (a)
  assert.equal(cBraco.corrida_valida, false);
  assert.ok(!cBraco.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco'), 'um (c) nao e saida (a): sem marca de sentido');
  const semLinha = correr(p, [tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);   // braco A sem linha numa corrida sem paragem: (c) COM o braco nomeado (28)
  assert.equal(semLinha.corrida_valida, false);
  assert.ok(semLinha.fiabilidade.pares_invalidos.some((x) => x.task_id === 't1' && x.braco_que_nao_arrancou === 'A' && /27c/.test(x.motivo)));
  assert.ok(!semLinha.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco'), 'um (c) com braco nomeado nao e saida (a): sem marca de sentido (M363)');
  const semOutro = analisar(p, [preVoo('t1'), { evento: 'par_invalido', task_id: 't1', braco: 'A', motivo: 'spawn:ENOENT' }, puro('t1', 'A'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B'), { evento: 'paragem', motivo: 'x', n: 2 }]);
  assert.ok(!semOutro.marcas.some((m) => m.tipo === 'par_invalido_com_resultado_no_outro_braco'));
  // o CLI imprime a contagem
  const cli = path.join(HERE, 'custo-analise.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custo-cli-6-'));
  tctx.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ledger = path.join(dir, 'l.jsonl');
  fs.writeFileSync(ledger, ordenar(T.flatMap((t, i) => (falhaB(i) ? parReal(t) : parReal(t, { aceiteB: false }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' ? { ...puro(t.task_id, 'A'), tier_classificado: t.tier_classificado } : e))))).map((e) => JSON.stringify(e)).join('\n') + '\n');
  const r = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', path.join(dir, 'r.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /saidas \(a\) com resultado no outro braco: favorece A 0, favorece B 5/);
});

// ── 17.o revisor: a aritmetica do sumario (41); inteiros (42); total acima da soma (43); costUSD vs lista (44); B nunca aplicado (45); marcas por tipo ──

test('analise · 17.o NO-SHIP (Z8/Z8b/Z8c/Z8e/Z15, 41): sumario de testes impossivel numa rejeicao — passados > corridos ou passados + skips > corridos — e contraditorio seja qual for aceite; INVALIDA, (c)', () => {
  // unidade: a aritmetica vale com aceite=false (antes so no ramo aceite=true)
  assert.match(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 11 }), 10, 0), /sumario de testes impossivel: tests_passados 11 > tests_corridos 10/);
  assert.match(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 0, tests_corridos: 10, tests_passados: 10, skips: 5 }), 10, 0), /tests_passados 10 \+ skips 5 > tests_corridos 10/);
  assert.match(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 9, skips: 2 }), 10, 0), /9 \+ skips 2 > tests_corridos 10/, 'Z15: passados 9 + skips 2 = 11 > 10');
  assert.equal(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 9, skips: 0 }), 10, 0), null, 'Z8d (controlo): a rejeicao coerente (1 falha) continua legitima');
  assert.match(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 9, skips: 1 }), 10, 0), /nada falhou e o runner saiu != 0 \(55\)/, '55: exit 1 com 9 + 1 == 10 nao tem falha nenhuma');
  assert.equal(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: -1073741819, tests_corridos: 0, tests_passados: 0, skips: 0 }), 10, 0), null, 'Z16 (controlo): crash NTSTATUS com 0 testes e uma rejeicao honesta');
  // Z8 contra o prereg real: A rejeitada com exit 0, sha intacto, passados = historico + 1 > corridos nas 5 tarefas em que B falha -> antes «cumprido · A 15 B 15 · marcas 0»
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const emA = (f) => T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, ...f(t) } : e)));
  const z8 = analisarReal(emA((t) => ({ aceite: false, exit_code: 0, tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico + 1 })));
  assert.equal(z8.corrida_valida, false);
  assert.equal(z8.primaria.limiar_descritivo_cumprido, null);
  assert.equal(z8.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && m.braco === 'A' && /impossivel/.test(m.motivo)).length, 5);
  assert.equal(z8.fiabilidade.pares_invalidos.filter((x) => /aceite contraditorio.*CORRIDA INVALIDA/.test(x.motivo)).length, 5);
  const z8b = analisarReal(emA((t) => ({ aceite: false, exit_code: 0, tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico, skips: t.tests_total_historico + 5 })));
  assert.equal(z8b.corrida_valida, false);
  // Z8c (espelho em B): a mesma testemunha a contradizer-se em B tambem invalida (conservador na direccao, mas e a 31)
  const z8c = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' && !falhaB(i) ? { ...e, tests_passados: t.tests_total_historico + 1 } : e))));
  assert.equal(z8c.corrida_valida, false);
  // Z8d (controlo): a rejeicao coerente de A nas 5 -> «cumprido · A 15 B 15 · marcas 0» (e a saida do prereg; o ledger nao a refuta)
  const z8d = analisarReal(emA((t) => ({ aceite: false, exit_code: 1, tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico - 1 })));
  assert.equal(z8d.corrida_valida, true);
  assert.equal(z8d.primaria.limiar_descritivo_cumprido, true);
  assert.equal(z8d.marcas.length, 0);
});

test('analise · 17.o NO-SHIP (Z9/Z9b, 42): exit_code, tests_corridos, tests_passados, skips, tentativa e tokens_locais sao inteiros — 1.5 e tipo_invalido, INVALIDA, (c); sem range (NTSTATUS negativos sao honestos)', () => {
  const v = (over) => violacoesDeTipo(tentativa('x', 'A', over));
  assert.deepEqual(v({ exit_code: 1.5 }), ['exit_code: 1.5 nao e inteiro']);
  assert.deepEqual(v({ tests_corridos: 9.5 }), ['tests_corridos: 9.5 nao e inteiro']);
  assert.deepEqual(v({ tests_passados: 0.1 }), ['tests_passados: 0.1 nao e inteiro']);
  assert.deepEqual(v({ skips: 1.25 }), ['skips: 1.25 nao e inteiro']);
  assert.deepEqual(v({ tokens_locais: 1.5 }), ['tokens_locais: 1.5 nao e inteiro']);
  assert.deepEqual(v({ exit_code: -1073741819 }), [], 'Z16: um crash do runner em Windows e um inteiro negativo — honesto');
  assert.deepEqual(v({ exit_code: 0 }), []);
  assert.deepEqual(v({ duration_ms: 4471.5 }), [], 'duration_ms nao esta no contrato de inteiro');
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const z9 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, aceite: false, exit_code: 1.5 } : e))));
  assert.equal(z9.corrida_valida, false);
  assert.equal(z9.primaria.limiar_descritivo_cumprido, null);
  assert.equal(z9.marcas.filter((m) => m.tipo === 'tipo_invalido' && /exit_code: 1.5/.test(m.motivo)).length, 5);
  // Z16 (controlo): A rejeitada com NTSTATUS e 0 testes nas 5 -> «cumprido · A 15 B 15 · valida»
  const z16 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, aceite: false, exit_code: -1073741819, tests_corridos: 0, tests_passados: 0 } : e))));
  assert.equal(z16.corrida_valida, true);
  assert.equal(z16.marcas.filter((m) => m.tipo === 'rejeicao_sem_testes' && m.braco === 'A').length, 5, '50: a rejeicao com zero testes e legitima mas marca');
  assert.equal(z16.marcas.length, 5);
});

test('analise · 17.o NO-SHIP (Z6/Z7, 43/44): total_cost_usd acima da soma dos costUSD e incoerente (null); costUSD a mais de 5 % da lista marca custo_cli_diverge_da_lista', () => {
  const s = SONDA.modelUsage['claude-opus-5'];
  const T = PREREG.corpus.tarefas;
  const emA = (over) => T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' ? { ...e, ...over } : e)));
  // Z6: total_cost_usd 100 por linha de A -> antes custo_cli_total_usd 2000 · marcas 0
  const z6 = analisarReal(emA({ total_cost_usd: 100 }));
  assert.equal(z6.corrida_valida, true, '43 nao toca a primaria');
  assert.equal(z6.valorizacao.A.custo_cli_total_usd, null);
  assert.notEqual(z6.valorizacao.B.custo_cli_total_usd, null);
  assert.equal(z6.marcas.filter((m) => m.tipo === 'custo_cli_incoerente' && m.braco === 'A').length, 20);
  // a folga de 1 % + 1e-6: total = soma * 1.01 passa; * 1.02 nao
  const um = correr(preregDe(['t1']), [tentativa('t1', 'A', { total_cost_usd: s.costUSD * 1.01 }), tentativa('t1', 'B')]);
  assert.ok(!um.marcas.some((m) => m.tipo === 'custo_cli_incoerente'));
  const dois = correr(preregDe(['t1']), [tentativa('t1', 'A', { total_cost_usd: s.costUSD * 1.02 }), tentativa('t1', 'B')]);
  assert.ok(dois.marcas.some((m) => m.tipo === 'custo_cli_incoerente' && m.braco === 'A'));
  // com um costUSD em falta nao se avalia o «acima» (a soma esta incompleta): so campo_em_falta
  const { costUSD, ...semCusto } = s;
  const falta = correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: { 'claude-opus-5': semCusto }, total_cost_usd: 0.6 }), tentativa('t1', 'B')]);
  assert.ok(falta.marcas.some((m) => m.tipo === 'campo_em_falta' && /costUSD/.test(m.motivo)));
  assert.ok(!falta.marcas.some((m) => m.tipo === 'custo_cli_incoerente'), 'sem todos os costUSD o total nao e comparavel por cima');
  // Z7: costUSD fabricado (A 50, B 0.0001) com ~59 k tokens -> antes marcas 0; a sonda coincide exactamente com a lista
  perto(s.costUSD, valorizar(tokensOpusDaTentativa(tentativa('x', 'A')), PRECOS), 1e-12);   // a sonda: costUSD == valorizacao a preco de lista (a 1e-16 de virgula flutuante)
  const z7 = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'claude-p' ? { ...e, modelUsage: { 'claude-opus-5': { ...s, costUSD: e.braco === 'A' ? 50 : 0.0001 } }, total_cost_usd: e.braco === 'A' ? 50 : 0.0001 } : e))));
  assert.equal(z7.corrida_valida, true, 'so marca — uma tabela de precos diferente no CLI e plausivel');
  assert.equal(z7.marcas.filter((m) => m.tipo === 'custo_cli_diverge_da_lista').length, 40);
  assert.ok(z7.marcas.some((m) => m.tipo === 'custo_cli_diverge_da_lista' && m.braco === 'A' && /costUSD 50 vs 0\.5898/.test(m.motivo)));
  assert.equal(z7.valorizacao.A.custo_cli_opus_usd, 1000, 'o numero publicado continua, com a marca ao lado');
  // 5 % e a fronteira: 4.9 % nao marca, 5.1 % marca
  const q = (f) => correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: { 'claude-opus-5': { ...s, costUSD: s.costUSD * f } }, total_cost_usd: s.costUSD * f }), tentativa('t1', 'B')]);
  assert.ok(!q(1.049).marcas.some((m) => m.tipo === 'custo_cli_diverge_da_lista'));
  assert.ok(q(1.051).marcas.some((m) => m.tipo === 'custo_cli_diverge_da_lista'));
  assert.ok(q(0.949).marcas.some((m) => m.tipo === 'custo_cli_diverge_da_lista'), 'e para baixo tambem');
  // sem reparticao de cache (valorizacao null) nao se compara
  const nd = correr(preregDe(['t1']), [tentativa('t1', 'A', { modelUsage: { 'claude-opus-5': { ...s, costUSD: 50 } }, total_cost_usd: 50, usage: { ...SONDA.usage, cache_creation: undefined } }), tentativa('t1', 'B')]);
  assert.ok(!nd.marcas.some((m) => m.tipo === 'custo_cli_diverge_da_lista'));
  assert.ok(nd.marcas.some((m) => m.tipo === 'reparticao_cache_nd'));
});

test('analise · 17.o NO-SHIP (Z13, 45): nenhum passo local arrancou em toda a corrida — o tratamento B nunca foi aplicado, INVALIDA; um transitorio continua a ser so marca (2)', () => {
  const T = PREREG.corpus.tarefas;
  const morto = { arrancou: false, motivo_se_nao: 'spawn:ECONNREFUSED 127.0.0.1:11434', tokens_locais: null, texto_local_sha256: null, duration_ms: 20 };
  // Z13: as 7 T0 com o Ollama em baixo -> B escala directo e «B ≡ A»: antes «cumprido · A 20 B 20 · marcas 7»
  const z13 = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' ? { ...e, ...morto } : e))));
  assert.equal(z13.corrida_valida, false);
  assert.equal(z13.primaria.limiar_descritivo_cumprido, null);
  assert.ok(z13.corrida_invalida_por.some((x) => /nenhum passo local arrancou/.test(x.motivo)));
  assert.equal(z13.marcas.filter((m) => m.tipo === 'local_nao_arrancou').length, 7);
  // um so passo local morto entre 7: transitorio, marca, valida (2)
  let k = 0;
  const um = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' && k++ === 0 ? { ...e, ...morto } : e))));
  assert.equal(um.corrida_valida, true);
  assert.equal(um.marcas.filter((m) => m.tipo === 'local_nao_arrancou').length, 1);
  // sem nenhum passo local (corpus so T2/T3) a 45 nao se aplica
  const p = preregDe(['t1', 't2']);
  assert.equal(correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]).corrida_valida, true);
  // e um unico passo local, morto, tambem e «todos» (n >= 1)
  const so1 = correr(preregDe(['t1', 't2'], { t2: 'T0' }), [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', morto), escalacao('t2')]);
  assert.equal(so1.corrida_valida, false);
});

test('analise · 17.o (6): o resumo do CLI imprime as marcas por tipo — «marcas 20» sem tipo era indistinguivel de «marcas 20 e mais nada»', (tctx) => {
  const cli = path.join(HERE, 'custo-analise.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custo-cli-17-'));
  tctx.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = SONDA.modelUsage['claude-opus-5'];
  const T = PREREG.corpus.tarefas;
  // Z4: B com cache zero coerente em todas as linhas -> B 92 000 com 20 abaixo_da_sonda
  const zero = { modelUsage: { 'claude-opus-5': { ...s, inputTokens: 4000, outputTokens: 600, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.035 } }, usage: { ...SONDA.usage, input_tokens: 4000, output_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } }, total_cost_usd: 0.035 };
  const ledger = path.join(dir, 'l.jsonl');
  fs.writeFileSync(ledger, ordenar(T.flatMap((t, i) => parReal(t, { aceiteB: i % 4 === 0 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...zero } : e)))).map((e) => JSON.stringify(e)).join('\n') + '\n');
  const r = spawnSync(process.execPath, [cli, '--ledger', ledger, '--out', path.join(dir, 'r.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /B 92000 · marcas 20/);
  assert.match(r.stdout, /marcas por tipo: abaixo_da_sonda 20/);
  // e sem marcas diz «nenhuma»
  const limpo = path.join(dir, 'h.jsonl');
  fs.writeFileSync(limpo, ordenar(T.flatMap((t) => parReal(t))).map((e) => JSON.stringify(e)).join('\n') + '\n');
  const h = spawnSync(process.execPath, [cli, '--ledger', limpo, '--out', path.join(dir, 'h.json')], { encoding: 'utf8' });
  assert.match(h.stdout, /marcas 0 /);
  assert.match(h.stdout, /marcas por tipo: nenhuma/);
});

// ── 18.o revisor: local sem saida (46); modelo do local (47); tecto no duration_ms (48); exit 0 com a soma errada (49); rejeicao sem testes (50); pre_voo antes dos bracos (51) ──

test('analise · 18.o NO-SHIP (W2/W2b/W2c/W3, 46/47): um passo local sem saida nao arrancou (a 45 nao se contorna); o modelo do local e tratamento — router-execute em claude-* e INVALIDA, (c)', () => {
  assert.equal(SHA256_VAZIO, crypto.createHash('sha256').update('').digest('hex'), 'a constante e o sha256 de ""');
  assert.ok(localSemSaida(passoLocal('x', { tokens_locais: 0 })));
  assert.ok(localSemSaida(passoLocal('x', { texto_local_sha256: SHA256_VAZIO })));
  assert.ok(!localSemSaida(passoLocal('x')));
  assert.ok(!localSemSaida(tentativa('x', 'A', { tokens_locais: 0 })), 'so no local');
  // arrancou: null so vale com saida
  assert.ok(!arrancouDaTentativa(passoLocal('x', { arrancou: null, texto_local_sha256: SHA256_VAZIO, tokens_locais: 0 })));
  assert.ok(!arrancouDaTentativa(passoLocal('x', { arrancou: null, texto_local_sha256: 'abc', tokens_locais: 0 })));
  assert.ok(!arrancouDaTentativa(passoLocal('x', { arrancou: null, texto_local_sha256: 'abc', tokens_locais: null })), 'sem tokens nao se sabe');
  assert.ok(arrancouDaTentativa(passoLocal('x', { arrancou: null, texto_local_sha256: 'abc', tokens_locais: 5 })));
  assert.ok(arrancouDaTentativa(passoLocal('x', { arrancou: true, tokens_locais: 0 })), 'arrancou:true explicito continua a ser arrancou (mas sem saida)');
  const T = PREREG.corpus.tarefas;
  const emLocal = (over) => T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' ? { ...e, ...over } : e)));
  // W2: 7 locais com arrancou null, sha de "" e tokens 0 -> antes «cumprido · A 20 B 20 · marcas 0»
  const w2 = analisarReal(emLocal({ arrancou: null, texto_local_sha256: SHA256_VAZIO, tokens_locais: 0 }));
  assert.equal(w2.corrida_valida, false);
  assert.equal(w2.primaria.limiar_descritivo_cumprido, null);
  assert.ok(w2.corrida_invalida_por.some((x) => /nenhum passo local arrancou COM SAIDA/.test(x.motivo)));
  assert.equal(w2.marcas.filter((m) => m.tipo === 'local_sem_saida').length, 0, '52: arrancou:null sem saida provada e «nao arrancou», nao «sem saida»');
  assert.equal(w2.marcas.filter((m) => m.tipo === 'local_nao_arrancou').length, 7);
  // W2b: arrancou:true com sha de "" e tokens 0 -> tambem e «sem saida» em todos
  const w2b = analisarReal(emLocal({ arrancou: true, texto_local_sha256: SHA256_VAZIO, tokens_locais: 0 }));
  assert.equal(w2b.corrida_valida, false);
  assert.equal(w2b.marcas.filter((m) => m.tipo === 'local_sem_saida').length, 7);
  assert.equal(w2b.marcas.filter((m) => m.tipo === 'local_nao_arrancou').length, 0, 'arrancou:true explicito nao e «nao arrancou» — e sem saida');
  // W2c: so tokens_locais 0
  assert.equal(analisarReal(emLocal({ tokens_locais: 0 })).corrida_valida, false);
  // um so local sem saida entre 7: transitorio, marca, valida
  let k = 0;
  const um = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' && k++ === 0 ? { ...e, tokens_locais: 0 } : e))));
  assert.equal(um.corrida_valida, true);
  assert.equal(um.marcas.filter((m) => m.tipo === 'local_sem_saida').length, 1);
  // W3: o passo local em claude-opus-5 -> antes «cumprido · A 20 B 20 · marcas 0 · modelos_locais_vistos [claude-opus-5]»
  const w3 = analisarReal(emLocal({ modelo_pedido: 'claude-opus-5', modelo_reportado: 'claude-opus-5' }));
  assert.equal(w3.corrida_valida, false);
  assert.equal(w3.primaria.limiar_descritivo_cumprido, null);
  assert.equal(w3.marcas.filter((m) => m.tipo === 'local_em_modelo_cloud').length, 7);
  assert.equal(w3.fiabilidade.pares_invalidos.filter((x) => /modelo cloud.*CORRIDA INVALIDA/.test(x.motivo)).length, 7, '(c) nos 7 pares');
  // so o modelo_pedido em claude-* tambem; e um haiku tambem e cloud
  assert.equal(analisarReal(emLocal({ modelo_pedido: 'claude-haiku-4-5' })).corrida_valida, false);
  // modelo_reportado sem @sha256: marca E validade n/d (53: sem digest o modelo local nao e verificavel)
  const semDigest = analisarReal(emLocal({ modelo_reportado: 'qwen2.5:3b' }));
  assert.equal(semDigest.corrida_valida, null);
  assert.ok(semDigest.validade_nd_porque.some((x) => /sem «@sha256:»/.test(x)));
  assert.equal(semDigest.marcas.filter((m) => m.tipo === 'modelo_local_sem_digest').length, 7);
  assert.equal(analisarReal(T.flatMap((t) => parReal(t))).marcas.length, 0, 'o honesto (qwen2.5:3b@sha256:abc) continua marcas 0');
});

test('analise · 18.o NO-SHIP (W17/W47/W1/W9, 48-51): duration_ms >= tecto com aceite=true e contraditorio; exit 0 com passados + skips != corridos e impossivel; rejeicao sem testes marca; pre_voo depois de um braco invalida', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  // W17: 20 A aceites com duration_ms 1 000 000 (tecto 900 s) -> antes «NAO cumprido · valida · tecto_aparente 20» (a aceitacao contava)
  const w17 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' ? { ...e, duration_ms: 1000000 } : e))));
  assert.equal(w17.corrida_valida, false);
  assert.equal(w17.primaria.limiar_descritivo_cumprido, null);
  assert.equal(w17.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /duration_ms 1000000 >= tecto 900s/.test(m.motivo)).length, 20);
  // a fronteira: 900 000 exactos e >= tecto; 899 999 nao; e uma REJEICAO com 1 000 000 e legitima (tecto = nao aceite)
  assert.ok(correr(preregDe(['t1']), [tentativa('t1', 'A', { duration_ms: 900000 }), tentativa('t1', 'B')]).marcas.some((m) => m.tipo === 'aceite_contraditorio'));
  assert.ok(!correr(preregDe(['t1']), [tentativa('t1', 'A', { duration_ms: 899999 }), tentativa('t1', 'B')]).marcas.some((m) => m.tipo === 'aceite_contraditorio'));
  assert.ok(!correr(preregDe(['t1']), [tentativa('t1', 'A', { duration_ms: 1000000, aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B')]).marcas.some((m) => m.tipo === 'aceite_contraditorio'));
  // W47: A rejeitada com exit 0 e passados + skips < corridos nas 5 -> antes «cumprido · A 15 B 15 · marcas 0»
  const w47 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, aceite: false, exit_code: 0, tests_passados: t.tests_total_historico - 1, skips: 0 } : e))));
  assert.equal(w47.corrida_valida, false);
  assert.equal(w47.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /exit_code 0 com tests_passados .* != tests_corridos .* \(49\)/.test(m.motivo)).length, 5);
  // exit 0 com passados + skips == corridos e coerente; exit 1 com a soma diferente e uma falha real (nao impossivel)
  assert.equal(aceiteContraditorio(tentativa('x', 'A', { aceite: true, exit_code: 0, tests_corridos: 12, tests_passados: 10, skips: 2 }), 10, 2), null);
  assert.equal(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 8, skips: 0 }), 10, 0), null, 'exit 1 com 2 falhas: coerente');
  // W1: A rejeitada com tests_corridos 0 (exit 1) nas 5 -> legitima (Z16) mas marca rejeicao_sem_testes com o braco
  const w1 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, aceite: false, exit_code: 1, tests_corridos: 0, tests_passados: 0 } : e))));
  assert.equal(w1.corrida_valida, true);
  assert.equal(w1.primaria.limiar_descritivo_cumprido, true, 'A 15 B 15: a saida honesta');
  assert.equal(w1.marcas.filter((m) => m.tipo === 'rejeicao_sem_testes' && m.braco === 'A' && /baixa o braco A/.test(m.motivo)).length, 5);
  assert.equal(w1.marcas.length, 5);
  // W9: pre_voo com ts DEPOIS dos bracos -> antes «NAO cumprido · valida · marcas 0»
  const w9 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'pre_voo' ? { ...e, ts: '2027-01-01T00:00:00Z' } : e))));   // depois de TODAS as tentativas da bancada
  assert.equal(w9.corrida_valida, false);
  assert.equal(w9.marcas.filter((m) => m.tipo === 'pre_voo_fora_de_ordem').length, 20);
  assert.equal(w9.fiabilidade.pares_invalidos.filter((x) => /pre_voo depois de um braco.*CORRIDA INVALIDA/.test(x.motivo)).length, 20);
  // pre_voo sem ts: so marca (o contrato do prereg nao o exige); ts ilegivel numa tarefa que correu invalida; ts igual ao primeiro inicio e «antes»
  const p = preregDe(['t1', 't2']);
  const semTs = analisar(p, [{ evento: 'pre_voo', task_id: 't1', exit_code: 1, falhou: true, tests_corridos: 10, tests_passados: 9, skips: 0 }, tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(semTs.corrida_valida, true);
  assert.equal(semTs.marcas.filter((m) => m.tipo === 'pre_voo_sem_ts').length, 1);
  const ilegivel = correr(p, [preVoo('t1', { ts: '2026-09-10 00:00' }), tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(ilegivel.corrida_valida, false);
  assert.ok(ilegivel.marcas.some((m) => m.tipo === 'pre_voo_fora_de_ordem' && /nao e um timestamp canonico/.test(m.motivo)));
  const a = tentativa('t1', 'A');
  const igual = correr(p, [preVoo('t1', { ts: a.ts_inicio }), a, tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(igual.corrida_valida, true);
  assert.ok(!igual.marcas.some((m) => /pre_voo/.test(m.tipo)));
  // e o tentativa_inicio conta como «primeiro inicio» (um pre_voo entre o inicio e o fim de A e depois)
  const entre = correr(p, [{ evento: 'tentativa_inicio', task_id: 't1', braco: 'A', tentativa: 1, ts_inicio: '2026-09-09T23:00:00Z' }, preVoo('t1', { ts: '2026-09-09T23:30:00Z' }), tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.ok(entre.marcas.some((m) => m.tipo === 'pre_voo_fora_de_ordem'));
  // a tarefa excluida no pre-voo (sem bracos) nao tem «primeiro inicio»: sem marca de ordem
  const excl = analisar(preregDe(['t1'], {}, ['s1']), [preVoo('t1', { ts: '2026-09-12T00:00:00Z' }), { evento: 'tarefa_excluida', task_id: 't1', motivo: 'worktree', suplente_usado: 's1' }, preVoo('s1'), ...parSuplenteBench('s1')]);
  assert.ok(!excl.marcas.some((m) => m.tipo === 'pre_voo_fora_de_ordem'));
});

// ── 19.o revisor: saida provada (52); cloud e cloud (53); duration_ms null com JSON (54); o inverso da 49 (55); baratos 95-97 ──

test('analise · 19.o NO-SHIP (Y2/Y2b/Y2c, 52): a saida do passo local prova-se (sha != "" E tokens > 0), independentemente da flag; sha null e campo em falta; a 45 conta so a saida provada', () => {
  assert.ok(localComSaida(passoLocal('x')));
  assert.ok(!localComSaida(passoLocal('x', { texto_local_sha256: null })));
  assert.ok(!localComSaida(passoLocal('x', { tokens_locais: null })));
  assert.ok(!localComSaida(passoLocal('x', { tokens_locais: 0 })));
  assert.ok(!localComSaida(passoLocal('x', { texto_local_sha256: SHA256_VAZIO })));
  assert.ok(localSemSaida(passoLocal('x', { arrancou: true, texto_local_sha256: null })), 'arrancou:true sem sha e «sem saida provada»');
  assert.ok(!localSemSaida(passoLocal('x', { arrancou: false, texto_local_sha256: null, tokens_locais: null })), 'nao arrancou nao e «sem saida» (e local_nao_arrancou)');
  const T = PREREG.corpus.tarefas;
  const emLocal = (over) => T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' ? { ...e, ...over } : e)));
  // Y2b: arrancou:true, sha null, tokens 850 nos 7 -> antes «cumprido · A 20 B 20 · marcas 0»
  const y2b = analisarReal(emLocal({ arrancou: true, texto_local_sha256: null }));
  assert.equal(y2b.corrida_valida, false);
  assert.equal(y2b.primaria.limiar_descritivo_cumprido, null);
  assert.ok(y2b.corrida_invalida_por.some((x) => /nenhum passo local arrancou COM SAIDA/.test(x.motivo)));
  assert.equal(y2b.marcas.filter((m) => m.tipo === 'local_sem_saida').length, 7);
  assert.equal(y2b.marcas.filter((m) => m.tipo === 'campo_em_falta' && /texto_local_sha256/.test(m.motivo)).length, 7);
  // Y2c: so tokens null; Y2: ambos null
  assert.equal(analisarReal(emLocal({ arrancou: true, tokens_locais: null })).corrida_valida, false);
  assert.equal(analisarReal(emLocal({ arrancou: true, tokens_locais: null, texto_local_sha256: null })).corrida_valida, false);
  // Y1 (declarado, brief 92): 1 token com o sha de «x» e saida — a semantica da saida minima nao esta pre-registada
  const y1 = analisarReal(emLocal({ tokens_locais: 1, texto_local_sha256: crypto.createHash('sha256').update('x').digest('hex') }));
  assert.equal(y1.corrida_valida, true);
  assert.equal(y1.marcas.length, 0);
});

test('analise · 19.o NO-SHIP (Y3/Y3b/Y3c/Y3d, 53): cloud e cloud — gpt/gemini/anthropic-opus/Opus maiusculo no passo local invalidam; sem digest a validade e n/d', () => {
  for (const m of ['gpt-5', 'gemini-2.5-pro', 'anthropic/claude-opus-5', 'opus', 'Claude-Opus-5', 'claude-haiku-4-5', 'openai/o3', 'google/gemma-cloud']) assert.ok(ehModeloCloud(m), m);
  for (const m of ['qwen2.5:3b@sha256:abc', 'llama3.1:8b', 'deepseek-r1:7b@sha256:x', 'gemma3:12b@sha256:y']) assert.ok(!ehModeloCloud(m), m);
  const T = PREREG.corpus.tarefas;
  const emLocal = (over) => T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.executor === 'router-execute' ? { ...e, ...over } : e)));
  for (const [nome, over] of Object.entries({ Y3: { modelo_pedido: 'gpt-5', modelo_reportado: 'gpt-5' }, Y3b: { modelo_pedido: 'gemini-2.5-pro', modelo_reportado: 'gemini-2.5-pro@sha256:x' }, Y3c: { modelo_pedido: 'anthropic/claude-opus-5', modelo_reportado: 'anthropic/claude-opus-5@sha256:x' }, Y3d: { modelo_pedido: 'opus', modelo_reportado: 'Claude-Opus-5@sha256:x' } })) {
    const r = analisarReal(emLocal(over));
    assert.equal(r.corrida_valida, false, `${nome}: cloud rotulado local`);
    assert.equal(r.marcas.filter((m) => m.tipo === 'local_em_modelo_cloud').length, 7, nome);
    assert.equal(r.fiabilidade.pares_invalidos.filter((x) => /modelo cloud.*CORRIDA INVALIDA/.test(x.motivo)).length, 7, `${nome}: (c) nos 7`);
  }
  // gemma3 (ollama) com digest e honesto
  assert.equal(analisarReal(emLocal({ modelo_pedido: 'gemma3:12b', modelo_reportado: 'gemma3:12b@sha256:abc' })).marcas.length, 0);
});

test('analise · 19.o NO-SHIP (Y4/Y4b/Y14/Y7, 54/55/96): duration_ms null com JSON e campo em falta e, com aceite=true, contraditorio; exit != 0 com tudo verde e impossivel; Claude-Opus-5 e Opus', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  // Y4: 5 B claude-p aceites com duration_ms null e ts a 1000 s -> antes «cumprido · marcas 5 (tecto_aparente)»
  const y4 = analisarReal(T.flatMap((t, i) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' && !falhaB(i) ? { ...e, duration_ms: null, ts_fim: new Date(Date.parse(e.ts_inicio) + 1000000).toISOString() } : e))));
  assert.equal(y4.corrida_valida, false);
  assert.equal(y4.primaria.limiar_descritivo_cumprido, null);
  assert.equal(y4.marcas.filter((m) => m.tipo === 'campo_em_falta' && /duration_ms/.test(m.motivo)).length, 5);
  assert.equal(y4.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /sem duration_ms/.test(m.motivo)).length, 5);
  // duration_ms null numa REJEICAO de B com JSON: campo em falta (marca) e 27b — conta contra B, valida
  const rej = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { duration_ms: null, aceite: false, exit_code: 1, tests_passados: 9 })]);
  assert.equal(rej.corrida_valida, true);
  assert.ok(rej.marcas.some((m) => m.tipo === 'campo_em_falta' && /duration_ms/.test(m.motivo)));
  // duration_ms null SEM JSON (tecto, morte): nao e campo em falta
  const to = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { duration_ms: null, usage: null, modelUsage: null, total_cost_usd: null, session_id: null, aceite: false, exit_code: 1, tests_passados: 9 })]);
  assert.ok(!to.marcas.some((m) => m.tipo === 'campo_em_falta' && /duration_ms/.test(m.motivo)));
  // Y14: A rejeitada com exit 1 e passados + skips == corridos nas 5 -> antes «cumprido · A 15 B 20 · marcas 0»
  const y14 = analisarReal(T.flatMap((t, i) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, aceite: false, exit_code: 1 } : e))));
  assert.equal(y14.corrida_valida, false);
  assert.equal(y14.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /nada falhou e o runner saiu != 0 \(55\)/.test(m.motivo)).length, 5);
  assert.match(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 3, tests_corridos: 12, tests_passados: 10, skips: 2 }), 10, 2), /exit_code 3 com .* == tests_corridos 12/);
  assert.equal(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: -1073741819, tests_corridos: 0, tests_passados: 0, skips: 0 }), 10, 0), null, 'Z16: corridos 0 fica fora da 55');
  assert.equal(aceiteContraditorio(tentativa('x', 'A', { aceite: false, exit_code: 1, tests_corridos: 10, tests_passados: 9, skips: 0 }), 10, 0), null, 'uma falha real: coerente');
  // Y7: uma chave `Claude-Opus-5` e Opus (96) — e nao e o literal pre-registado: 33
  const y7 = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'Claude-Opus-5': SONDA.modelUsage['claude-opus-5'] }, modelo_reportado: 'Claude-Opus-5' })]);
  assert.equal(y7.corrida_valida, false);
  assert.ok(y7.marcas.some((m) => m.tipo === 'opus_fora_do_pedido' && /Claude-Opus-5/.test(m.motivo)));
  assert.ok(!y7.marcas.some((m) => m.tipo === 'sem_opus_no_modelUsage'));
});

test('analise · 19.o (95/97): marcas_por_tipo no JSON; tempo incoerente e motivo_com_arrancou tambem no passo local (so marca)', () => {
  const p = preregDe(['t1', 't2'], { t2: 'T0' });
  const a2 = tentativa('t2', 'A', { tier_classificado: 'T0' });
  const iso = (ms) => new Date(ms).toISOString();
  const t0 = Date.parse(a2.ts_fim) + 10000;   // B depois de A; escalacao depois do local; so o local tem o tempo invertido
  const r = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), a2, passoLocal('t2', { ts_inicio: iso(t0 + 10000), ts_fim: iso(t0), motivo_se_nao: 'x' }), escalacao('t2', { ts_inicio: iso(t0 + 60000), ts_fim: iso(t0 + 65000) })]);   // t1 criado depois de a2: a ordem das tarefas marca (32) — e so marca
  assert.equal(r.corrida_valida, true, 'so marca: nao e direccional');
  assert.ok(r.marcas.some((m) => m.tipo === 'tempo_incoerente' && /passo local/.test(m.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'motivo_com_arrancou' && /passo local/.test(m.motivo)));
  assert.deepEqual(r.marcas_por_tipo, { motivo_com_arrancou: 1, ordem_das_tarefas_divergente: 1, tempo_incoerente: 1 }, 'ordenado por contagem e nome');
  assert.deepEqual(correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B')]).marcas_por_tipo, {});
});

// ── 20.o revisor: o inverso da 22 (56); a sonda pela cache (57); marcas baratas; M426 ──

test('analise · 20.o NO-SHIP (A1/A1b/A16, 56): arrancou:true numa claude-p sem evidencia nenhuma e sem transcript e afirmacao sem prova — INVALIDA, (c); com session_id (transcript) ou tokens_transcript e um tecto legitimo', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const semNada = { arrancou: true, motivo_se_nao: null, session_id: null, usage: null, modelUsage: null, total_cost_usd: null };
  // A1: A «rejeitada» com arrancou:true e zero evidencia nas 5 tarefas em que B falha -> antes «cumprido · A 15 B 15 · valida · consumo_desconhecido 5»
  const a1 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, ...semNada, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 } : e))));
  assert.equal(a1.corrida_valida, false);
  assert.equal(a1.primaria.limiar_descritivo_cumprido, null);
  assert.equal(a1.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'A').length, 5);
  assert.equal(a1.fiabilidade.pares_invalidos.filter((x) => /arrancou=true sem JSON nem transcript.*CORRIDA INVALIDA/.test(x.motivo)).length, 5, '(c) nos 5');
  // A1b: o mesmo em 5 ms
  assert.equal(analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, ...semNada, duration_ms: 5, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 } : e)))).corrida_valida, false);
  // A16 (espelho em B): tambem invalida — a mesma afirmacao sem prova
  const a16 = analisarReal(T.flatMap((t, i) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' && !falhaB(i) ? { ...e, ...semNada, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1 } : e))));
  assert.equal(a16.corrida_valida, false);
  // o tecto LEGITIMO: sem JSON mas com o transcript ENCONTRADO (tokens_transcript >= piso) -> 27b, valida. Um session_id sozinho NAO prova (58: pode ser pre-gerado, brief 98)
  const p = preregDe(['t1']);
  const soSessao = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...semNada, session_id: 'sess-pre-gerado', tokens_transcript: 0, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 900000 })]);
  assert.equal(soSessao.corrida_valida, false, '58: session_id string com tokens_transcript 0 («procurado, nao encontrado») nao e evidencia');
  assert.ok(soSessao.marcas.some((m) => m.tipo === 'arrancou_sem_evidencia' && /nao prova: pode ser pre-gerado/.test(m.motivo)));
  assert.equal(correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...semNada, session_id: 'sess-pre-gerado', aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 180000 })]).corrida_valida, false, 'A1b: crash com session_id e sem a chave tokens_transcript');
  const comTranscript = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...semNada, tokens_transcript: 123456, aceite: false, exit_code: 1, tests_passados: 9, duration_ms: 900000 })]);
  assert.equal(comTranscript.corrida_valida, true);
  assert.ok(!comTranscript.marcas.some((m) => m.tipo === 'arrancou_sem_evidencia'));
  assert.ok(correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...semNada, tokens_transcript: 999, aceite: false, exit_code: 1, tests_passados: 9 })]).marcas.some((m) => m.tipo === 'arrancou_sem_evidencia'), 'abaixo do piso do transcript nao e evidencia');
  // arrancou:false sem evidencia continua a ser a 22/28 (nao a 56)
  assert.ok(!correr(p, [tentativa('t1', 'A'), naoArrancou('t1', 'B')]).marcas.some((m) => m.tipo === 'arrancou_sem_evidencia'));
  // 58: o custo e um campo do JSON — total_cost_usd sem usage/modelUsage e uma linha que se contradiz (A1c do 21.o)
  const soCusto = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...semNada, total_cost_usd: 0.01, aceite: false, exit_code: 1, tests_passados: 9 })]);
  assert.equal(soCusto.corrida_valida, false);
  assert.ok(soCusto.marcas.some((m) => m.tipo === 'custo_sem_json'));
  assert.ok(soCusto.marcas.some((m) => m.tipo === 'arrancou_sem_evidencia'), 'e sem JSON nem transcript continua sem evidencia');
  // o total_cost_usd 0 (nao null) sem JSON nao e «custo»: so a 56/58
  assert.ok(!correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B', { ...semNada, total_cost_usd: 0, tokens_transcript: 123456, aceite: false, exit_code: 1, tests_passados: 9 })]).marcas.some((m) => m.tipo === 'custo_sem_json'));
  // com JSON, total_cost_usd e coerente (nao e a 58)
  assert.ok(!correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B')]).marcas.some((m) => m.tipo === 'custo_sem_json'));
});

test('analise · 20.o NO-SHIP (A2, 57): a sonda pina-se tambem pela cache — cache_creation + cache_read < 58 964 marca abaixo_da_sonda mesmo acima do total; SONDA_CACHE_OPUS bate com a fixture', () => {
  const s = SONDA.modelUsage['claude-opus-5'];
  assert.equal(SONDA_CACHE_OPUS, s.cacheCreationInputTokens + s.cacheReadInputTokens);
  assert.equal(SONDA_CACHE_OPUS, 58964);
  const T = PREREG.corpus.tarefas;
  // A2: B com 55 000 + 4 000 e cache 0/0 (total 59 000 > 58 970), costUSD a lista -> antes «cumprido · marcas 0 · B 1 180 000»
  const zero = { modelUsage: { 'claude-opus-5': { ...s, inputTokens: 55000, outputTokens: 4000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.375 } }, usage: { ...SONDA.usage, input_tokens: 55000, output_tokens: 4000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } }, total_cost_usd: 0.375 };
  const a2 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: i !== 3 && i !== 7 }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, ...zero } : e))));
  assert.equal(a2.corrida_valida, true, 'so marca, como a 38');
  assert.equal(a2.marcas.filter((m) => m.tipo === 'abaixo_da_sonda' && m.braco === 'B' && /cache_creation 0 \+ cache_read 0/.test(m.motivo)).length, 20);
  assert.equal(a2.secundaria.global.B.tokens_opus_total, 20 * 59000, 'o numero continua, com 20 marcas ao lado');
  // a cache LIDA (escalacao) e a cache CRIADA (1.a invocacao) chegam as duas; 58 963 marca
  const lida = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, cacheCreationInputTokens: 0, cacheReadInputTokens: 58964, costUSD: 0.029592 } }, total_cost_usd: 0.029592, usage: { ...SONDA.usage, cache_creation_input_tokens: 0, cache_read_input_tokens: 58964, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } })]);
  assert.equal(lida.marcas.length, 0);
  const meio = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, inputTokens: 10, cacheCreationInputTokens: 30000, cacheReadInputTokens: 28963, costUSD: 0.3146315 } }, total_cost_usd: 0.3146315, usage: { ...SONDA.usage, input_tokens: 10, cache_creation_input_tokens: 30000, cache_read_input_tokens: 28963, cache_creation: { ephemeral_1h_input_tokens: 30000, ephemeral_5m_input_tokens: 0 } } })]);   // total 58 977 >= 58 970 (a 38 nao dispara); cache 58 963 < 58 964
  assert.ok(meio.marcas.some((m) => m.tipo === 'abaixo_da_sonda' && /cache_creation 30000 \+ cache_read 28963/.test(m.motivo)), '58 963 de cache marca');
  // a 38 (total) tem prioridade na mensagem quando as duas falham
  const seis = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, inputTokens: 1000, outputTokens: 4, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0051 } }, total_cost_usd: 0.0051, usage: { ...SONDA.usage, input_tokens: 1000, output_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } } })]);
  assert.equal(seis.marcas.filter((m) => m.tipo === 'abaixo_da_sonda').length, 1);
  assert.ok(seis.marcas.some((m) => m.tipo === 'abaixo_da_sonda' && /Opus com 1004 tokens/.test(m.motivo)));
  // M426: a 36 na fronteira — opus 500 (abaixo do piso) com outros 800 (1x < outros < 10x): outro modelo fez o trabalho
  const m426 = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { inputTokens: 500, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0025 }, 'claude-sonnet-5': { inputTokens: 800, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0024 } }, usage: { ...SONDA.usage, input_tokens: 1300, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, total_cost_usd: 0.0049 })]);
  assert.equal(m426.corrida_valida, false);
  assert.ok(m426.marcas.some((m) => m.tipo === 'outro_modelo_fez_o_trabalho' && /800 tokens fora de claude-opus\* contra 500/.test(m.motivo)));
});

test('analise · 20.o (3-8): marcas baratas — pre_voo verde sem testes, corridos abaixo do pre-voo numa linha aceite, modelo local divergente do pedido, velocidade do local implausivel, aceite sem output, paragem incoerente', () => {
  const s = SONDA.modelUsage['claude-opus-5'];
  const p = preregDe(['t1', 't2'], { t2: 'T0' }, ['s1']);
  // (3) pre-voo «nao falhou» com tests_corridos 0: a saida (b) para suplente apoia-se num runner morto
  const pv0 = analisar(p, [preVoo('t1', { exit_code: 0, falhou: false, tests_corridos: 0, tests_passados: 0 }), { evento: 'tarefa_excluida', task_id: 't1', motivo: 'ja verde', suplente_usado: 's1' }, preVoo('s1'), ...parSuplenteBench('s1'), preVoo('t2'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2')]);
  assert.ok(pv0.marcas.some((m) => m.tipo === 'pre_voo_verde_sem_testes' && m.task_id === 't1'));
  assert.equal(pv0.corrida_valida, true);
  // e numa tarefa que CORREU com esse pre-voo: a 7 invalida (pre-voo nao falhou) e a marca diz que nem «verde» era (M428)
  const correuVerde = analisar(preregDe(['t1']), [preVoo('t1', { exit_code: 0, falhou: false, tests_corridos: 0, tests_passados: 0 }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(correuVerde.corrida_valida, false);
  assert.ok(correuVerde.marcas.some((m) => m.tipo === 'pre_voo_verde_sem_testes' && m.task_id === 't1' && /runner morto/.test(m.motivo)));
  // (4) 10 testes desapareceram entre o pre-voo e uma linha aceite
  const menos = correr(preregDe(['t1']), [preVoo('t1', { tests_corridos: 20, tests_passados: 19 }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.equal(menos.marcas.filter((m) => m.tipo === 'corridos_abaixo_do_pre_voo' && /10 teste\(s\) desapareceram/.test(m.motivo)).length, 2);
  assert.equal(menos.corrida_valida, true);
  assert.ok(!correr(preregDe(['t1']), [preVoo('t1', { tests_corridos: 20, tests_passados: 19 }), tentativa('t1', 'A', { aceite: false, exit_code: 1, tests_passados: 9 }), tentativa('t1', 'B', { aceite: false, exit_code: 1, tests_passados: 9 })]).marcas.some((m) => m.tipo === 'corridos_abaixo_do_pre_voo'), 'so numa linha ACEITE');
  // (5) o router trocou de modelo
  const troca = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { modelo_reportado: 'llama3.1:8b@sha256:zzz' }), escalacao('t2')]);
  assert.ok(troca.marcas.some((m) => m.tipo === 'modelo_local_divergente_do_pedido' && /llama3.1:8b/.test(m.motivo)));
  assert.equal(troca.corrida_valida, true);
  // (6) 1e9 tokens em 1 ms
  const rapido = correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { tokens_locais: 1e9, duration_ms: 1 }), escalacao('t2')]);
  assert.ok(rapido.marcas.some((m) => m.tipo === 'local_velocidade_implausivel'));
  assert.ok(!correr(p, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { tokens_locais: 900, duration_ms: 3000 }), escalacao('t2')]).marcas.some((m) => m.tipo === 'local_velocidade_implausivel'), '300 tok/s e um 3b normal');
  // (7) Opus aceite com outputTokens 0
  const semOut = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, outputTokens: 0, costUSD: 0.58965 } }, total_cost_usd: 0.58965, usage: { ...SONDA.usage, output_tokens: 0 } })]);
  assert.ok(semOut.marcas.some((m) => m.tipo === 'aceite_sem_output' && m.braco === 'B'));
  assert.ok(!correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { ...s, outputTokens: 0, costUSD: 0.58965 } }, total_cost_usd: 0.58965, usage: { ...SONDA.usage, output_tokens: 0 }, aceite: false, exit_code: 1, tests_passados: 9 })]).marcas.some((m) => m.tipo === 'aceite_sem_output'), 'so numa linha aceite');
  // (8) paragem com ultima_tarefa/n errados
  const par4 = preregDe(['t1', 't2', 't3', 't4']);
  const parou = analisar(par4, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B'), { evento: 'paragem', motivo: 'tecto', ultima_tarefa: 't4', n: 4 }]);
  assert.equal(parou.marcas.filter((m) => m.tipo === 'paragem_incoerente').length, 2);
  assert.ok(parou.marcas.some((m) => /ultima_tarefa "t4" != ultima tarefa com tentativa "t2"/.test(m.motivo)));
  assert.ok(parou.marcas.some((m) => /paragem.n 4 != 2/.test(m.motivo)));
  const coerente = analisar(par4, [preVoo('t1'), tentativa('t1', 'A'), tentativa('t1', 'B'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B'), { evento: 'paragem', motivo: 'tecto', ultima_tarefa: 't2', n: 2 }]);
  assert.ok(!coerente.marcas.some((m) => m.tipo === 'paragem_incoerente'));
});

// ── 21.o revisor: sem JSON a unica evidencia e o transcript (58); um so turno (59); marcas baratas ──

test('analise · 21.o NO-SHIP (A1/A1b/A1c, 58): sem JSON, session_id string e total_cost_usd nao provam — so o transcript; o controlo honesto com transcript continua valido', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const semJson = { arrancou: true, motivo_se_nao: null, usage: null, modelUsage: null, total_cost_usd: null };
  const emA = (over) => T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, ...semJson, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1, ...over, ...(over.session_id ? { session_id: `${over.session_id}-${t.task_id}` } : {}), ...(over.duration_ms ? { ts_fim: new Date(Date.parse(e.ts_inicio) + over.duration_ms).toISOString() } : {}) } : e)));   // session_id por tarefa (22); ts coerentes com a duracao
  // A1: tecto de 900 s com session_id pre-gerado e tokens_transcript 0 («procurado, nao encontrado») nas 5 falhas de B -> antes «cumprido · A 15 B 15 · valida»
  const a1 = analisarReal(emA({ session_id: 'sess-pre-gerado', tokens_transcript: 0, duration_ms: 900000 }));
  assert.equal(a1.corrida_valida, false);
  assert.equal(a1.primaria.limiar_descritivo_cumprido, null);
  assert.equal(a1.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'A').length, 5);
  assert.equal(a1.fiabilidade.pares_invalidos.filter((x) => /sem JSON nem transcript.*CORRIDA INVALIDA/.test(x.motivo)).length, 5);
  // A1b: crash aos 180 s, sem a chave tokens_transcript
  assert.equal(analisarReal(emA({ session_id: 'sess-pre-gerado', duration_ms: 180000 })).corrida_valida, false);
  // A1c: a unica «evidencia» e um total_cost_usd 0.01 sem JSON
  const a1c = analisarReal(emA({ session_id: null, total_cost_usd: 0.01 }));
  assert.equal(a1c.corrida_valida, false);
  assert.equal(a1c.marcas.filter((m) => m.tipo === 'custo_sem_json' && m.braco === 'A').length, 5);
  assert.ok(a1c.corrida_invalida_por.some((x) => /total_cost_usd numa claude-p sem usage nem modelUsage/.test(x.motivo)));
  // controlo honesto: o mesmo tecto COM o transcript encontrado (250 k tokens) -> «cumprido · A 15 B 15 · valida» com consumo_do_transcript + tecto_aparente
  const honesto = analisarReal(emA({ session_id: 'sess-pre-gerado', tokens_transcript: 250000, duration_ms: 900000 }));
  assert.equal(honesto.corrida_valida, true);
  assert.equal(honesto.primaria.limiar_descritivo_cumprido, true);
  assert.deepEqual(honesto.marcas_por_tipo, { consumo_do_transcript: 5, tecto_aparente: 5 });
  // a 22 nao muda: um session_id numa linha arrancou:false continua a torna-la contraditoria (brief 102: null num spawn falhado)
  const c1 = correr(preregDe(['t1']), [tentativa('t1', 'A'), naoArrancou('t1', 'B', { session_id: 'uuid-pre-gerado' })]);
  assert.equal(c1.corrida_valida, false);
  assert.ok(c1.marcas.some((m) => m.tipo === 'arrancou_contraditorio' || m.tipo === 'nao_arrancou_fora_da_definicao'));
});

test('analise · 21.o (59, 3-7): num_turns 1 aceite marca; output > 1 tok/ms marca; local verde rejeitado marca; pre-voo exit 1 com nada a falhar marca; tarefa excluida duas vezes invalida; token em string em qualquer chave e tipo_invalido', () => {
  const s = SONDA.modelUsage['claude-opus-5'];
  const p1 = preregDe(['t1']);
  // 59: so com num_turns registado (brief 106); sem a chave nao se ve
  assert.ok(correr(p1, [tentativa('t1', 'A'), tentativa('t1', 'B', { num_turns: 1 })]).marcas.some((m) => m.tipo === 'aceite_num_so_turno' && m.braco === 'B'));
  assert.ok(!correr(p1, [tentativa('t1', 'A'), tentativa('t1', 'B', { num_turns: 7 })]).marcas.some((m) => m.tipo === 'aceite_num_so_turno'));
  assert.ok(!correr(p1, [tentativa('t1', 'A'), tentativa('t1', 'B', { num_turns: 1, aceite: false, exit_code: 1, tests_passados: 9 })]).marcas.some((m) => m.tipo === 'aceite_num_so_turno'), 'so numa linha aceite');
  assert.ok(!correr(p1, [tentativa('t1', 'A'), tentativa('t1', 'B')]).marcas.some((m) => m.tipo === 'aceite_num_so_turno'), 'sem num_turns: declarado, nao verificado');
  // (3) 5 M de output em 180 s
  const veloz = correr(p1, [tentativa('t1', 'A', { modelUsage: { 'claude-opus-5': { ...s, outputTokens: 5000000, costUSD: 125.58965 } }, usage: { ...SONDA.usage, output_tokens: 5000000 }, total_cost_usd: 125.58965, duration_ms: 180000 }), tentativa('t1', 'B')]);
  assert.ok(veloz.marcas.some((m) => m.tipo === 'output_velocidade_implausivel' && /27778 tok\/s/.test(m.motivo)));
  assert.equal(veloz.corrida_valida, true, 'so marca');
  assert.ok(!correr(p1, [tentativa('t1', 'A', { modelUsage: { 'claude-opus-5': { ...s, outputTokens: 4000, costUSD: 0.68965 } }, usage: { ...SONDA.usage, output_tokens: 4000 }, total_cost_usd: 0.68965, duration_ms: 60000 }), tentativa('t1', 'B')]).marcas.some((m) => m.tipo === 'output_velocidade_implausivel'), '67 tok/s e normal');
  // (4) local com aceitacao verde e aceite:false
  const p2 = preregDe(['t1', 't2'], { t2: 'T0' });
  const verde = correr(p2, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2', { exit_code: 0, tests_passados: 10, tests_corridos: 10 }), escalacao('t2')]);
  assert.ok(verde.marcas.some((m) => m.tipo === 'local_verde_rejeitado' && /10\/10 passados/.test(m.motivo)));
  assert.equal(verde.corrida_valida, true);
  assert.ok(!correr(p2, [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A', { tier_classificado: 'T0' }), passoLocal('t2'), escalacao('t2')]).marcas.some((m) => m.tipo === 'local_verde_rejeitado'));
  // (5) pre-voo exit 1 com passados + skips == corridos
  const pv55 = correr(p1, [preVoo('t1', { exit_code: 1, falhou: true, tests_corridos: 10, tests_passados: 10, skips: 0 }), tentativa('t1', 'A'), tentativa('t1', 'B')]);
  assert.ok(pv55.marcas.some((m) => m.tipo === 'pre_voo_sem_vermelho' && /nada falhou e o runner saiu != 0/.test(m.motivo)));
  assert.equal(pv55.corrida_valida, true, 'so marca — o pre-voo nao e alavanca da primaria');
  // (6) a mesma tarefa excluida duas vezes consome dois suplentes
  const p3 = preregDe(['t1', 't2'], {}, ['s1', 's2']);
  const dupla = analisar(p3, [preVoo('t1', { exit_code: 0, falhou: false }), { evento: 'tarefa_excluida', task_id: 't1', motivo: 'ja verde', suplente_usado: 's1' }, { evento: 'tarefa_excluida', task_id: 't1', motivo: 'ja verde', suplente_usado: 's2' }, preVoo('s2'), ...parSuplenteBench('s2'), preVoo('t2'), tentativa('t2', 'A'), tentativa('t2', 'B')]);
  assert.equal(dupla.corrida_valida, false);
  assert.ok(dupla.marcas.some((m) => m.tipo === 'suplente_fora_do_protocolo' && /excluida.*repetida|tarefa_excluida repetida/.test(m.motivo)));
  // (7) tokens em string numa chave Haiku: tipo_invalido (antes: coagia na reconciliacao e escapava ao modelo_nao_opus_dominante)
  const str = correr(p1, [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { ...SONDA.modelUsage, 'claude-haiku-4-5': { inputTokens: '300000', outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.3 } } })]);
  assert.equal(str.corrida_valida, false);
  assert.ok(str.marcas.some((m) => m.tipo === 'tipo_invalido' && /modelUsage\.claude-haiku-4-5\.inputTokens: "300000" nao e um numero/.test(m.motivo)));
  assert.deepEqual(violacoesDeTipo(tentativa('x', 'A', { modelUsage: { 'claude-opus-5': { ...s, cacheReadInputTokens: null } } })), [], 'null fica para o campo_em_falta');
  assert.ok(violacoesDeTipo(tentativa('x', 'A', { modelUsage: { 'claude-opus-5': { ...s, cacheReadInputTokens: NaN } } })).some((x) => /nao e um numero/.test(x)));
});

// ── 22.o revisor: sem consumo plausivel nao ha evidencia (60); a flag nao manda sobre o exit (61) ──

test('analise · 22.o NO-SHIP (A1/A1b/A2/A2b/A25/A28, 60): usage {} + modelUsage null, JSON a zeros, ou abaixo do piso nos dois lados nao provam que o modelo correu — INVALIDA nos dois bracos; consumo plausivel num so lado fica valido (declarado)', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const emA = (over) => T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'A' && !falhaB(i) ? { ...e, aceite: false, exit_code: 1, tests_passados: t.tests_total_historico - 1, ...over } : e)));
  const zerosU = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const zerosM = { 'claude-opus-5': { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 } };
  // A1: A «rejeitada» nas 5 falhas de B com usage {} e modelUsage null -> antes «pares validos 20 · A 15 B 15 · cumprido · valida · consumo_desconhecido 5 · json_parcial 5»
  const a1 = analisarReal(emA({ usage: {}, modelUsage: null }));
  assert.equal(a1.corrida_valida, false);
  assert.equal(a1.primaria.limiar_descritivo_cumprido, null);
  assert.equal(a1.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'A' && /usage 0 · Opus 0.*rejeicao sem prova baixa o braco \(60\)/.test(m.motivo)).length, 5);
  assert.equal(a1.fiabilidade.pares_invalidos.filter((x) => /JSON sem consumo plausivel.*CORRIDA INVALIDA/.test(x.motivo)).length, 5);
  assert.equal(a1.marcas.filter((m) => m.tipo === 'json_parcial').length, 5, 'a marca da 35 continua');
  // A1b: usage de zeros com modelUsage null
  assert.equal(analisarReal(emA({ usage: zerosU, modelUsage: null })).corrida_valida, false);
  // A2: JSON todo a zero (usage e modelUsage) e total_cost_usd 0 -> antes «cumprido · valida · tokens_zero_com_arrancou 5»
  const a2 = analisarReal(emA({ usage: zerosU, modelUsage: zerosM, total_cost_usd: 0 }));
  assert.equal(a2.corrida_valida, false);
  assert.equal(a2.marcas.filter((m) => m.tipo === 'tokens_zero_com_arrancou').length, 5, 'a marca da 20 continua');
  assert.equal(a2.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'A').length, 5);
  // A2b: 510 tokens nos dois lados, costUSD a preco de lista, reconcilia -> antes «cumprido · valida · tokens_implausiveis 5»
  const u510 = { input_tokens: 500, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const m510 = { 'claude-opus-5': { inputTokens: 500, outputTokens: 10, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.0028 } };
  const a2b = analisarReal(emA({ usage: u510, modelUsage: m510, total_cost_usd: 0.0028 }));
  assert.equal(a2b.corrida_valida, false);
  assert.equal(a2b.marcas.filter((m) => m.tipo === 'tokens_implausiveis').length, 5);
  assert.equal(a2b.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && /usage 510 · Opus 510; piso 1000/.test(m.motivo)).length, 5);
  // A28: zeros COM tokens_transcript 250 k — o transcript nao resgata um JSON de zeros (35: o JSON e a fonte; a linha contradiz-se)
  const a28 = analisarReal(emA({ usage: zerosU, modelUsage: zerosM, total_cost_usd: 0, tokens_transcript: 250000 }));
  assert.equal(a28.corrida_valida, false);
  assert.equal(a28.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'A').length, 5);
  assert.equal(a28.marcas.filter((m) => m.tipo === 'consumo_do_transcript').length, 0, 'o JSON presente e a fonte — nao se cai no transcript');
  // A25 (direccao B): B aceite nas 20 com JSON de zeros -> antes «A 20 B 20 · cumprido · valida» (aceite_sem_output exigia fonte json; zeros davam toks null)
  const a25 = analisarReal(T.flatMap((t) => parReal(t).map((e) => (e.evento === 'tentativa_fim' && e.braco === 'B' && e.executor === 'claude-p' ? { ...e, usage: zerosU, modelUsage: zerosM, total_cost_usd: 0 } : e))));
  assert.equal(a25.corrida_valida, false);
  assert.equal(a25.primaria.limiar_descritivo_cumprido, null);
  assert.equal(a25.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia' && m.braco === 'B' && /aceitacao sem corrida \(60\)/.test(m.motivo)).length, 20);
  // fronteira DECLARADA: consumo plausivel num SO lado e evidencia de corrida — usage 313 k com modelUsage null (A24) e json_parcial, valida; usage plausivel que nao reconcilia (A2c = CUSTO-07) e consumo_desconhecido, valida
  const a24 = analisarReal(emA({ usage: { input_tokens: 3000, output_tokens: 10000, cache_creation_input_tokens: 300000, cache_read_input_tokens: 0 }, modelUsage: null }));
  assert.equal(a24.corrida_valida, true, 'A24: usage plausivel sem modelUsage e json_parcial (35), consumo desconhecido, valida — declarado');
  assert.equal(a24.primaria.limiar_descritivo_cumprido, true);
  assert.equal(a24.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia').length, 0);
  assert.equal(a24.secundaria.global.A.tokens_opus_total, null, 'consumo de A n/d, nunca 0');
  const a2c = analisarReal(emA({ modelUsage: { 'claude-opus-5': { ...SONDA.modelUsage['claude-opus-5'], cacheCreationInputTokens: 0 } } }));
  assert.equal(a2c.corrida_valida, true, 'A2c/CUSTO-07: usage 58 970 que nao reconcilia com um modelUsage de 6 — consumo contestado, valida');
  assert.equal(a2c.marcas.filter((m) => m.tipo === 'arrancou_sem_evidencia').length, 0);
  assert.equal(a2c.marcas.filter((m) => m.tipo === 'reconciliacao').length, 5);
  // os honestos: a sonda (58 970) e o transcript sem JSON (58) nao mexem
  const h = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) })));
  assert.equal(h.corrida_valida, true); assert.equal(h.marcas.length, 0); assert.equal(h.primaria.limiar_descritivo_cumprido, false, 'honesto: A 20 B 15 -> NAO cumprido');
  // consumoNoJson: exportado e exacto
  assert.deepEqual(consumoNoJson({ usage: {}, modelUsage: null }), { usage: 0, opus: 0, plausivel: false });
  assert.deepEqual(consumoNoJson(tentativa('x', 'A')), { usage: OPUS_TOTAL, opus: OPUS_TOTAL, plausivel: true });
  assert.equal(consumoNoJson({ usage: { input_tokens: 999 }, modelUsage: null }).plausivel, false, 'abaixo do piso');
  assert.equal(consumoNoJson({ usage: { input_tokens: 1000 }, modelUsage: null }).plausivel, true, 'no piso');
  assert.equal(consumoNoJson({ usage: null, modelUsage: { 'claude-opus-5': { inputTokens: 1000 } } }).plausivel, true, 'so o modelUsage');
  assert.equal(consumoNoJson({ usage: null, modelUsage: { 'claude-haiku-4-5': { inputTokens: 1000000 } } }).plausivel, false, 'o total do modelUsage e o do Opus');
  assert.equal(consumoNoJson({ usage: { input_tokens: 'x', output_tokens: 1000 }, modelUsage: null }).plausivel, true, 'string nao soma (tipo_invalido apanha-a)');
});

test('analise · 22.o NO-SHIP (A5b, 61): tarefas excluidas «ja verde» com pre_voo falhou:false e exit_code 1 — a flag nao manda sobre o exit; X1, pre_voo_incoerente, INVALIDA; os controlos A5c (falhou:true) e A5d (sem pre-voo) nao mudam', () => {
  const T = PREREG.corpus.tarefas;
  const falhaB = (i) => i % 4 !== 0;
  const idsFalha = T.filter((t, i) => !falhaB(i)).map((t) => t.task_id);
  const S = PREREG.corpus.suplentes;
  const excluidas = (pvOver) => T.flatMap((t, i) => {
    const k = idsFalha.indexOf(t.task_id);
    if (k < 0 || k >= 3) return parReal(t, { aceiteB: falhaB(i) });
    return [...(pvOver === null ? [] : [preVoo(t.task_id, { tests_corridos: t.tests_total_historico, tests_passados: t.tests_total_historico - 1, ...pvOver })]), { evento: 'tarefa_excluida', task_id: t.task_id, motivo: pvOver === null ? 'worktree nao reconstruiu' : 'ja verde', suplente_usado: S[k] }, ...parSuplente(S[k])];
  });
  // A5b: falhou:false com exit_code 1 nas 3 excluidas -> antes «aceites A 20 B 18 · cumprido · valida · tarefa_substituida 3»
  const a5b = analisarReal(excluidas({ exit_code: 1, falhou: false }));
  assert.equal(a5b.corrida_valida, false);
  assert.equal(a5b.primaria.limiar_descritivo_cumprido, null);
  assert.equal(a5b.marcas.filter((m) => m.tipo === 'exclusao_com_pre_voo_falhado').length, 3, 'X1: o exit manda — o pre-voo FALHOU');
  assert.equal(a5b.marcas.filter((m) => m.tipo === 'pre_voo_incoerente' && /falhou=false e exit_code=1.*excluida/.test(m.motivo)).length, 3);
  // A5c: o controlo com falhou:true — X1 como sempre
  const a5c = analisarReal(excluidas({ exit_code: 1, falhou: true }));
  assert.equal(a5c.corrida_valida, false);
  assert.equal(a5c.marcas.filter((m) => m.tipo === 'exclusao_com_pre_voo_falhado').length, 3);
  assert.equal(a5c.marcas.filter((m) => m.tipo === 'pre_voo_incoerente').length, 0);
  // A5d: sem pre-voo e a saida (a) do prereg («worktree nao reconstruiu») — valida, tarefa_substituida 3, declarado (X2 do 10.o)
  const a5d = analisarReal(excluidas(null));
  assert.equal(a5d.corrida_valida, true);
  assert.equal(a5d.marcas.filter((m) => m.tipo === 'tarefa_substituida').length, 3);
  assert.equal(a5d.marcas.filter((m) => m.tipo === 'pre_voo_incoerente' || m.tipo === 'exclusao_com_pre_voo_falhado').length, 0);
  // em jogo: falhou:false com exit 1 numa tarefa que correu — pre_voo_incoerente + INVALIDA + (c) (A12 ja era INVALIDA por «nao falhou»; agora e pela contradicao)
  const a12 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'pre_voo' && !falhaB(i) ? { ...e, falhou: false } : e))));
  assert.equal(a12.corrida_valida, false);
  assert.equal(a12.marcas.filter((m) => m.tipo === 'pre_voo_incoerente').length, 5);
  assert.equal(a12.marcas.filter((m) => m.tipo === 'pre_voo_nao_falhou').length, 0, '61: exit 1 e falhado, nao «ja verde»');
  assert.ok(a12.corrida_invalida_por.some((x) => /falhou=false e exit_code=1/.test(x.motivo) && x.valores.length === 5));
  assert.equal(a12.fiabilidade.pares_invalidos.filter((x) => /pre_voo contraditorio.*CORRIDA INVALIDA/.test(x.motivo)).length, 5);
  // e o inverso (25/30) continua a ir pela mesma escada
  const k4 = analisarReal(T.flatMap((t, i) => parReal(t, { aceiteB: falhaB(i) }).map((e) => (e.evento === 'pre_voo' && !falhaB(i) ? { ...e, exit_code: 0 } : e))));
  assert.equal(k4.fiabilidade.pares_invalidos.filter((x) => /pre_voo contraditorio: falhou=true com exit_code=0/.test(x.motivo)).length, 5);
});

test('lerLedger · linhas invalidas sao contadas, nao engolidas', () => {
  const { eventos, linhasInvalidas } = lerLedger('{"evento":"x"}\nisto nao e json\n\n{"evento":"y"}\n');
  assert.equal(eventos.length, 2);
  assert.deepEqual(linhasInvalidas.map((l) => l.linha), [2]);
});
