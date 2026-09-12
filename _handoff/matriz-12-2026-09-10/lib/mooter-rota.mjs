// @ts-check
/**
 * mooter-rota.mjs — o braco B: a rota que o classify() decide, EXECUTADA.
 *
 * Duas coisas separadas, de proposito:
 *
 *   1. QUEM DECIDE  — `tools/router/classify.js`, congelado
 *      (sha 427d8c0b...), corrido como o hook real o corre: mesma env
 *      FRUGAL_HW_RECOMMENDED_T0 vinda de ~/.claude/tools/router/hw-capability.json.
 *      O braco le `recommended_model` do JSON de saida. NAO existe campo
 *      `t0_model` no output -- quem o procurasse leria undefined e cairia num
 *      default sem dar por isso.
 *
 *   2. QUEM EXECUTA — degrau -> motor:
 *        T0 -> Ollama local, via `router-execute.js --pin-provider=ollama`
 *              (o executor real do produto, nao um fetch escrito para a ocasiao)
 *        T1 -> Haiku 4.5    T2 -> Sonnet 5    T3 -> Opus 5
 *
 * Porque a GERACAO ACTUAL e nao o id que o classify escreve: o classify esta
 * congelado desde antes da familia 5 e nomeia `claude-opus-4-6`/`claude-sonnet-4-6`.
 * O braco A e Opus 5. Se o braco B corresse Opus 4.6 no mesmo degrau, uma
 * derrota do Mooter poderia ser so a diferenca de geracao -- a experiencia
 * mediria a idade do id, nao a rota. O que o classify decide e o DEGRAU; o
 * degrau resolve para o modelo actual desse degrau.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chamarClaude } from './claude-call.mjs';

const HW_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');

/** @returns {string|null} */
export function hwRecommendedT0() {
  try { return JSON.parse(fs.readFileSync(HW_PATH, 'utf8')).recommended_t0 || null; } catch { return null; }
}

/** Degrau -> modelo executado. Alterar isto e alterar o protocolo: fica no prereg. */
export const DEGRAU_PARA_MOTOR = {
  T0: { backend: 'ollama', modelo: '<classification.recommended_model>' },
  T1: { backend: 'claude', modelo: 'claude-haiku-4-5-20251001' },
  T2: { backend: 'claude', modelo: 'claude-sonnet-5' },
  T3: { backend: 'claude', modelo: 'claude-opus-5' },
  T5: { backend: 'recusa', modelo: 'n/d — T5 e opt-in por @fable e nunca e auto-rotado' },
};

/**
 * @param {string} prompt
 * @param {string} repo
 */
export function classificar(prompt, repo) {
  const env = { ...process.env };
  const t0 = hwRecommendedT0();
  if (t0) env.FRUGAL_HW_RECOMMENDED_T0 = t0;
  const inicio = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [path.join(repo, 'tools/router/classify.js'), prompt],
    { encoding: 'utf8', timeout: 20000, input: '', env });
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  let j = null; try { j = JSON.parse(r.stdout); } catch { /* null */ }
  return { classificacao: j, classify_ms: +ms.toFixed(1), hw_t0_injectado: t0 };
}

/**
 * Corre o braco B de ponta a ponta: classifica e despacha para onde a
 * classificacao mandar.
 *
 * `modeloT0Forcado` NAO muda a rota — muda so o motor local em que o degrau T0
 * corre. Existe porque o dono pediu as duas colunas: o modelo que a maquina
 * recomenda hoje (qwen2.5-coder:14b, medido pelo probe) e o que o MP supunha
 * (qwen3:30b, 1.o na ordem de preferencia ate 2026-08-29). Nos degraus de nuvem
 * e ignorado — duplicar Opus nao acrescenta nada.
 *
 * @param {{prompt:string, repo:string, arena:string, maxTokensLocal?:number, timeoutMs?:number, modeloT0Forcado?:string|null}} o
 */
export function correrMooter({ prompt, repo, arena, maxTokensLocal = 2048, timeoutMs = 300000, modeloT0Forcado = null }) {
  const { classificacao: c, classify_ms, hw_t0_injectado } = classificar(prompt, repo);
  if (!c) return { ok: false, motivo: 'classify_nao_devolveu_json' };

  const tier = c.tier;
  const rota = {
    tier,
    task_category: c.task_category,
    risk_level: c.risk_level,
    confidence: c.confidence,
    recommended_backend: c.recommended_backend,
    recommended_model_do_classify: c.recommended_model,
    suggested_subagent: c.suggested_subagent,
    max_tier: c.max_tier,
    classify_ms,
    hw_t0_injectado,
    porque: `${c.task_category} / risco ${c.risk_level} / confianca ${c.confidence}`,
  };

  if (tier === 'T0') {
    const modelo = modeloT0Forcado || c.recommended_model;
    if (modeloT0Forcado) rota.modelo_t0_forcado = modeloT0Forcado;
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [
      path.join(repo, 'tools/router/router-execute.js'), prompt,
      '--pin-provider=ollama', `--pin-model=${modelo}`,
    ], {
      encoding: 'utf8', timeout: timeoutMs, input: '', cwd: repo, maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, MOOTER_LOCAL_PIN_MAX_TOKENS: String(maxTokensLocal) },
    });
    const decorrido_ms = Number(process.hrtime.bigint() - t0) / 1e6;
    let j = null; try { j = JSON.parse(r.stdout || 'null'); } catch { /* null */ }
    if (!j || !j.ok) {
      return { ok: false, motivo: (j && j.error && j.error.code) || 'router_execute_sem_json', rota, modelo, decorrido_ms, stderr: String(r.stderr || '').slice(0, 300) };
    }
    return {
      ok: true, rota, backend: 'ollama', modelo,
      texto: j.result_text || j.text || null,
      tokens_in: j.tokens_in ?? null, tokens_out: j.tokens_out ?? null,
      cache_creation: 0, cache_read: 0,
      decorrido_ms, duration_api_ms: j.duration_ms ?? null,
      tecto_tokens: maxTokensLocal,
      truncou: j.tokens_out === maxTokensLocal,
    };
  }

  const alvo = DEGRAU_PARA_MOTOR[tier];
  if (!alvo || alvo.backend !== 'claude') {
    return { ok: false, motivo: `degrau sem motor executavel: ${tier}`, rota };
  }
  const r = chamarClaude({ prompt, model: alvo.modelo, cwd: arena, timeoutMs });
  return {
    ok: r.ok, motivo: r.motivo, rota, backend: 'claude', modelo: alvo.modelo,
    modelo_reportado: r.model_reportado,
    texto: r.texto, tokens_in: r.tokens_in, tokens_out: r.tokens_out,
    cache_creation: r.cache_creation, cache_read: r.cache_read,
    decorrido_ms: r.decorrido_ms, duration_api_ms: r.duration_api_ms,
    custo_reportado_pelo_cli_usd: r.custo_reportado_usd,
  };
}
