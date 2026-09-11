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
import { analisar, lerLedger, tokensOpusDaTentativa, reconciliar, valorizar, arrancouDaTentativa, aceiteContraditorio, problemasDoModelUsage, violacoesDeTipo, evidenciaDeArranque, pecasDeEvidencia, pecasDeEvidenciaBruta, naoArrancouPuro, foiCurta, motivoSpawnPuro, problemasDoPreVoo, tsCanonico, TRANSCRIPT_MINIMO, SUPLENTES_ESPERADOS, CURTO_S, PREREG_SHA256_ESPERADO, EVENTOS_DO_PREREG, CHAVES_OBRIGATORIAS, TIPOS_OBRIGATORIOS, PROVAS_DA_ACEITACAO } from './custo-analise.mjs';

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
  return tentativa(task_id, 'B', { tentativa: 1, executor: 'router-execute', modelo_pedido: 'ollama', modelo_reportado: 'qwen2.5:3b@sha256:abc',
    aceite: false, exit_code: 1, tests_passados: 3, arrancou: true, usage: null, modelUsage: null, total_cost_usd: null, session_id: null,
    tokens_locais: 900, texto_local_sha256: 'deadbeef', duration_ms: 3000, tier_classificado: 'T0', ...over });
}

/** Uma tentativa claude-p que NAO arrancou como o pre-registo define: spawn falhou, sem JSON, sem session_id, sem prova. */
const naoArrancou = (task_id, braco, over = {}) => tentativa(task_id, braco, { arrancou: false, motivo_se_nao: 'spawn:ENOENT', aceite: false, exit_code: null, tests_corridos: null, tests_passados: null, skips: null,
  test_file_sha_antes: null, test_file_sha_depois: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: 50, session_id: null, ...over });

/** Escalacao para Opus depois do passo local. */
const escalacao = (task_id, over = {}) => tentativa(task_id, 'B', { tentativa: 2, e_escalacao: true, tier_classificado: 'T0', ...over });

const preVoo = (task_id, over = {}) => ({ evento: 'pre_voo', task_id, exit_code: 1, falhou: true, tests_corridos: 10, tests_passados: 9, skips: 0, ...over });

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
  const ev = [preVoo(t.task_id), tentativa(t.task_id, 'A', { tier_classificado: t.tier_classificado, ...prova(true) })];
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
  const ev = [preVoo(id), tentativa(id, 'A', { tier_classificado: m.tier_classificado, ...prova(true) })];
  if (m.tier_classificado === 'T0' || m.tier_classificado === 'T1') ev.push(passoLocal(id, { tier_classificado: m.tier_classificado, tests_corridos: h, tests_passados: h - 1 }), escalacao(id, { tier_classificado: m.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
  else ev.push(tentativa(id, 'B', { tier_classificado: m.tier_classificado, aceite: aceiteB, ...prova(aceiteB) }));
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

test('analise · pre_voo que NAO falhou (tarefa ja verde) mas correu: marca e par invalido; `falhou` booleano manda, senao exit_code; fica o ULTIMO', () => {
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
  assert.equal(analisar(p, [preVoo('t1', { exit_code: 1, falhou: false }), tentativa('t1', 'A'), tentativa('t1', 'B')]).primaria.n_pares_validos, 0, 'falhou:false vence exit_code 1');
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
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { exit_code: 1 }), 10), /exit_code=1/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { test_file_sha_depois: 'OUTRO' }), 10), /test_file_sha antes!=depois/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { tests_passados: 99 }), 10), /tests_passados 99 > tests_corridos 10/);
  assert.match(aceiteContraditorio(tentativa('t1', 'A'), 55), /tests_corridos 10 < historico 55/);
  assert.equal(aceiteContraditorio(tentativa('t1', 'A'), null), null, 'sem historico (suplente) nao se compara ao historico');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { exit_code: null, test_file_sha_antes: null, tests_passados: null }), 10), null, 'null nao contradiz');
  assert.match(aceiteContraditorio(tentativa('t1', 'A', { aceite: false }), 10, 0), /aceite=false com exit_code 0/);
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false }), 10), null, 'sem base de skips nao se pode dizer que a rejeicao e contraditoria');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, skips: null }), 10, 0), null, 'sem skips na linha a prova nao esta completa');
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, exit_code: 1 }), 10, 0), null);
  // 29 (E3/E4/E5 do 10.o): a segunda metade da condicao 3 — skips nao aumentou face ao pre-voo; e passados + skips <= corridos
  assert.equal(aceiteContraditorio(tentativa('t1', 'A', { aceite: false, skips: 1 }), 10, 0), null, 'E3: rejeicao legitima por skip a mais — NAO e contraditoria');
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
  const rT = correr(p, [...base, timeout({ arrancou: true, motivo_se_nao: null, session_id: 'sess-timeout' })]);
  assert.equal(rT.corrida_valida, true);
  assert.equal(rT.primaria.n_pares_validos, 4);
  assert.equal(rT.primaria.aceites_B, 1);
  assert.equal(rT.primaria.limiar_descritivo_cumprido, false, 'NAO cumprido: 1 < 4-2');
  // o contra-factual que o B2 produzia: se o timeout saisse do denominador, 3 pares A 3 B 1 -> 1 >= 1 -> cumprido
  const rContra = correr(preregDe(['t1', 't2', 't3']), [...base.slice(0, 6)]);   // o mesmo ledger sem t4, num prereg de 3
  assert.equal(rContra.primaria.limiar_descritivo_cumprido, true, 'e por isto que o par NAO pode sair');
  assert.ok(rT.marcas.some((m) => m.tipo === 'consumo_desconhecido'));
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
  const tecto = (id, b, over = {}) => tentativa(id, b, { arrancou: true, motivo_se_nao: null, session_id: null, usage: null, modelUsage: null, total_cost_usd: null, duration_ms: null,
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
  assert.ok(r2.marcas.some((m) => m.tipo === 'consumo_desconhecido'));
});

test('analise · 6.o NO-SHIP (I1): tentativa_inicio — reinicio da mesma tentativa invalida a corrida; inicio sem fim marca; sem inicios nao se verifica', () => {
  const p = preregDe(['t1']);
  const ini = (id, b, tentativa = 1) => ({ evento: 'tentativa_inicio', task_id: id, braco: b, tentativa, ts: 'x' });
  const r = correr(p, [ini('t1', 'A'), tentativa('t1', 'A'), ini('t1', 'B'), ini('t1', 'B'), tentativa('t1', 'B')]);
  assert.equal(r.corrida_valida, false);
  assert.ok(r.corrida_invalida_por.some((x) => /tentativa reiniciada/.test(x.motivo)));
  assert.ok(r.marcas.some((m) => m.tipo === 'tentativa_reiniciada' && m.braco === 'B'));
  const r2 = correr(p, [ini('t1', 'A'), tentativa('t1', 'A'), ini('t1', 'B'), tentativa('t1', 'B'), ini('t1', 'B', 2)]);
  assert.equal(r2.corrida_valida, true);
  assert.ok(r2.marcas.some((m) => m.tipo === 'tentativa_sem_fim' && m.braco === 'B' && m.tentativa === 2));
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
    };
    for (const [nome, over] of Object.entries(ataquesB)) {
      const semPreVoo = over.__semPreVoo; const pvAtaque = over.__preVoo; const o = { ...over }; delete o.__semPreVoo; delete o.__preVoo;
      const ev = [tentativa('t1', 'A'), tentativa('t1', 'B'), tentativa('t2', 'A'), tentativa('t2', 'B', o), tentativa('t3', 'A'), tentativa('t3', 'B', o), tentativa('t4', 'A'), tentativa('t4', 'B', o)];
      const r = semPreVoo ? analisar(p4, [preVoo('t1'), ...ev]) : pvAtaque ? analisar(p4, [preVoo('t1'), ...['t2', 't3', 't4'].map((id) => ({ evento: 'pre_voo', task_id: id, ...pvAtaque })), ...ev]) : correr(p4, ev);
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
  const r = analisar(p, [preVoo('t1', { skips: 0 }), tentativa('t1', 'A', { skips: 1, aceite: false, exit_code: 1 }), tentativa('t1', 'B'), preVoo('t2', { skips: 2 }), tentativa('t2', 'A', { skips: 2, tests_corridos: 12 }), tentativa('t2', 'B', { skips: 1, tests_corridos: 11 })]);
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
  assert.equal(n14.corrida_valida, false); assert.equal(n14.marcas.filter((m) => m.tipo === 'aceite_contraditorio' && /tests_passados \d+ < historico/.test(m.motivo)).length, 5);
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
  assert.equal(r.corrida_valida, true, 'so marca — mas nunca «marcas 0»');
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
  assert.deepEqual(soIguais.marcas.map((m) => m.tipo).sort(), ['ordem_das_tarefas_divergente', 'tempo_incoerente', 'tentativa_nao_arrancou', 'ts_iguais_entre_bracos'], 'o tempo_incoerente (ts iguais com duration 50) e so marca porque a linha nao chegou; t1 com ts explicitos de 09-11 comeca depois de t2 (09-10) — a ordem das tarefas marca (32)');
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
  // S9: modelUsage com Opus 2 tokens e Sonnet 25000 -> marca
  const s9 = correr(preregDe(['t1']), [tentativa('t1', 'A'), tentativa('t1', 'B', { modelUsage: { 'claude-opus-5': { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.001 }, 'claude-sonnet-4-5': { inputTokens: 25000, outputTokens: 100, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUSD: 0.1 } }, usage: { ...SONDA.usage, input_tokens: 25001, output_tokens: 101 } })]);
  assert.ok(s9.marcas.some((m) => m.tipo === 'modelo_nao_opus_dominante' && m.braco === 'B'));
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

test('lerLedger · linhas invalidas sao contadas, nao engolidas', () => {
  const { eventos, linhasInvalidas } = lerLedger('{"evento":"x"}\nisto nao e json\n\n{"evento":"y"}\n');
  assert.equal(eventos.length, 2);
  assert.deepEqual(linhasInvalidas.map((l) => l.linha), [2]);
});
