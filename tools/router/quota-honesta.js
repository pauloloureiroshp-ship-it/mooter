#!/usr/bin/env node
'use strict';
/**
 * quota-honesta.js — P1-E da wave "pista limpa": separar DUAS perguntas que o
 * router andava a responder com o mesmo número.
 *
 *   1. `engine_health`        — o motor responde?      (prova: um pong)
 *   2. `quota_remaining_pct`  — quanta quota resta?     (prova: fonte oficial)
 *
 * Um pong prova saúde. NÃO prova percentagem. E um contador local de orçamento
 * não prova quota nenhuma — prova quanto ESTE computador gastou.
 *
 * O DEFEITO QUE ISTO MATA (medido, não teorizado)
 * A 2026-08-06T20:13Z o `<router-hint>` desta própria sessão anunciou
 * `codex_quota: 0% remaining (5h window)`. Quinze minutos depois um job codex
 * (job-mshys18a-bffe) correu 30+ passos sem falhar um único pedido. O "0%" não
 * vinha da OpenAI: vinha de `quota-tracker.js:319`, que deriva
 * `codex_remaining_pct` de `getQuotaRemaining('openai_codex_cli')` — um
 * orçamento LOCAL alimentado por `recordUsage()`. Orçamento local esgotado foi
 * publicado como quota do fornecedor esgotada. Quem lesse o hint desviava
 * trabalho de um motor perfeitamente vivo.
 *
 * A fonte oficial que EXISTE é uma só: o Claude Code (≥2.1.x) entrega
 * `rate_limits` no payload que injecta na statusline; `quota-live.js` captura-o
 * e grava com `source: 'cc-statusline-stdin'`. Isso alimenta APENAS
 * `anthropic_quota`. Para o Codex não existe fonte oficial local — logo
 * `codex_quota` é `n/d`, e `n/d` é um resultado, não uma falha.
 *
 * O contador local não é lixo: continua a servir de aviso de ORÇAMENTO
 * (`budget_local_pct`), com esse nome, para quem o quiser usar. O que deixa de
 * acontecer é ser publicado como se fosse a quota do fornecedor.
 */

const OFICIAL_ANTHROPIC = 'cc-statusline-stdin';

/**
 * @param {object} deps
 * @param {function} [deps.readQuotaLive] — quota-live.readQuotaLive
 * @param {function} [deps.trackerSummary] — quota-tracker.summary
 * @param {object}   [deps.health] — { <motor>: { pong: bool, at: iso, porque } }
 */
function estado(deps) {
  const d = deps || {};
  let live = null;
  try { live = d.readQuotaLive ? d.readQuotaLive() : require('./quota-live').readQuotaLive(); }
  catch { live = null; }
  let snap = null;
  try { snap = d.trackerSummary ? d.trackerSummary() : require('./quota-tracker').summary(); }
  catch { snap = null; }

  const motores = {};

  // ── Anthropic: única com fonte oficial local ────────────────────────────
  // ⚠️ `five_hour_pct`/`seven_day_pct` do quota-live são percentagem USADA —
  // `windowPct()` lê `used_percentage` (quota-live.js:97). Publicá-las como
  // "remaining" inverte o sinal: 62% gasto sairia como 62% disponível, e o
  // router relaxaria exactamente quando devia apertar. A conversão é aqui,
  // uma só vez, com o nome do campo a dizer o que é.
  const liveOk = !!live && live.source === OFICIAL_ANTHROPIC && live.fresh === true;
  const usada = liveOk ? primeiroNumero([live.five_hour_pct, live.seven_day_pct]) : null;
  const pct = usada == null ? null : Math.max(0, Math.min(100, 100 - usada));
  motores.anthropic = {
    quota_remaining_pct: pct,
    quota_usada_pct: usada,
    quota_fonte: liveOk ? OFICIAL_ANTHROPIC : null,
    quota_porque: liveOk
      ? `rate_limits oficial do Claude Code, ${Math.round((live.age_ms || 0) / 1000)}s de idade`
      : (live
        ? `quota-live presente mas ${live.source !== OFICIAL_ANTHROPIC ? `de fonte não oficial (${live.source})` : 'obsoleto'} — n/d`
        : 'sem quota-live: o Claude Code ainda não renderizou a statusline nesta janela — n/d'),
    budget_local_pct: snap && typeof snap.anthropic_remaining_pct === 'number' ? snap.anthropic_remaining_pct : null,
    budget_porque: 'contador LOCAL de orçamento (quota-tracker) — mede o que esta máquina gastou, nunca a quota do fornecedor',
  };

  // ── Codex: sem fonte oficial. n/d, e n/d é um resultado. ────────────────
  motores.codex = {
    quota_remaining_pct: null,
    quota_fonte: null,
    quota_porque: 'não existe fonte oficial de quota do Codex nesta máquina — o antigo codex_quota vinha de um orçamento local (quota-tracker.js:319) e já se provou errado (hint dizia 0%, o motor correu)',
    budget_local_pct: snap && typeof snap.codex_remaining_pct === 'number' ? snap.codex_remaining_pct : null,
    budget_porque: 'contador LOCAL de orçamento — aviso de gasto próprio, nunca quota do fornecedor',
  };

  for (const [motor, m] of Object.entries(motores)) {
    Object.assign(m, saude((d.health || {})[motor]));
  }
  for (const [motor, h] of Object.entries(d.health || {})) {
    if (!motores[motor]) {
      motores[motor] = {
        quota_remaining_pct: null, quota_fonte: null,
        quota_porque: 'sem fonte oficial de quota para este motor — n/d',
        budget_local_pct: null, budget_porque: 'sem contador local para este motor',
        ...saude(h),
      };
    }
  }
  return motores;
}

/** Saúde vem de uma prova (pong), com quando. Sem prova: n/d, nunca "ok". */
function saude(h) {
  if (!h || typeof h.pong !== 'boolean') {
    return {
      engine_health: null,
      engine_health_porque: 'sem prova de saúde nesta janela — n/d (ausência de prova não é prova de avaria, nem de saúde)',
      engine_health_at: (h && h.at) || null,
    };
  }
  return {
    engine_health: h.pong ? 'vivo' : 'sem-resposta',
    engine_health_porque: h.porque || (h.pong ? 'pong recebido' : 'sonda sem resposta'),
    engine_health_at: h.at || null,
  };
}

function primeiroNumero(vals) {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/**
 * As linhas do `<router-hint>`. Um motor sem fonte oficial escreve `n/d` com o
 * porquê — nunca um número que só parece medido.
 */
function linhasDoHint(motores) {
  const linhas = [];
  for (const [motor, m] of Object.entries(motores || {})) {
    const q = typeof m.quota_remaining_pct === 'number'
      ? `${m.quota_remaining_pct}% remaining (fonte: ${m.quota_fonte})`
      : `n/d (${m.quota_porque})`;
    linhas.push(`${motor}_quota: ${q}`);
    if (m.engine_health) linhas.push(`${motor}_health: ${m.engine_health} (${m.engine_health_porque})`);
  }
  return linhas;
}

/**
 * Um dispatch para motor provadamente sem resposta falha DEPRESSA e com motivo.
 * Saúde n/d nunca bloqueia: não medir não é o mesmo que estar avariado.
 */
function podeDespachar(motores, motor) {
  const m = (motores || {})[motor];
  if (!m) return { pode: true, porque: `motor ${motor} não está no roster de saúde — sem prova de avaria, segue` };
  if (m.engine_health === 'sem-resposta') {
    return { pode: false, porque: `${motor} sem resposta na última sonda (${m.engine_health_at || 'sem timestamp'}): ${m.engine_health_porque}` };
  }
  return { pode: true, porque: m.engine_health === 'vivo' ? `${motor} respondeu ao pong` : `saúde de ${motor} é n/d — não medir não é avaria` };
}

module.exports = { estado, saude, linhasDoHint, podeDespachar, OFICIAL_ANTHROPIC };
