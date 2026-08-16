/**
 * runner-core.mjs — one bounded round of the $0 autopilot.
 *
 * Three guarantees are mechanical here, not promised in prose:
 *  1. `$0 duro` — `assertLocalEngine()` refuses any endpoint that is not the
 *     local Ollama loopback, so the delivered runner cannot reach a paid API
 *     even if someone edits the config.
 *  2. `fail-closed` — the STOP flag is read twice: once before the round is
 *     built and again in the last instruction before dispatch, which closes the
 *     check-then-act race.
 *  3. `evidencia ou n/d` — every receipt carries a verdict produced by
 *     `evidence-verifier.mjs` against real files, never a hardcoded label.
 *
 * All I/O is injected so the round is testable without a GPU or a network.
 */

import fs from 'node:fs';
import { buildContextPack, PILLAR_IDS } from './context-pack.mjs';
import { verifyEvidence, VERDICT } from './evidence-verifier.mjs';

export const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:14b';
export const DEFAULT_TIMEOUT_MS = 90_000;
export const NUM_PREDICT = 700;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const OLLAMA_PORT = '11434';

/**
 * The single chokepoint that makes "$0 hard" checkable. Anything that is not the
 * local Ollama port throws — a delivered runner that spends a subscription token
 * is a bug, so make it impossible to express.
 */
export function assertLocalEngine(endpoint) {
  let url;
  try {
    url = new URL(String(endpoint));
  } catch {
    throw new Error(`motor invalido: ${endpoint}`);
  }
  if (url.protocol !== 'http:') {
    throw new Error(`motor tem de ser http loopback, veio ${url.protocol}`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`motor tem de ser local (loopback), veio ${url.hostname}`);
  }
  if (url.port !== OLLAMA_PORT) {
    throw new Error(`motor tem de ser Ollama :${OLLAMA_PORT}, veio :${url.port || '(vazio)'}`);
  }
  return `${url.protocol}//${url.hostname}:${url.port}`;
}

/**
 * Fail-closed for real.
 *
 * The first version wrapped `fs.existsSync` in a try/catch and called itself
 * fail-closed. It was not: `existsSync` swallows EACCES/EPERM internally and
 * returns `false`, so a STOP flag the process could not read looked exactly
 * like a STOP flag that was not there — and the runner dispatched. The catch
 * never fired because nothing ever threw.
 *
 * `statSync` throws, which lets us tell the two apart: only ENOENT is proof of
 * absence. Every other error is doubt, and doubt means stop.
 */
export function isStopped(stopFile, statImpl = fs.statSync) {
  if (!stopFile) return true;
  try {
    statImpl(stopFile);
    return true;
  } catch (err) {
    return !(err && err.code === 'ENOENT');
  }
}

/** Builds the Ollama payload. `keep_alive` holds the model resident between rounds. */
export function buildPayload({ model, pack, numPredict = NUM_PREDICT }) {
  return {
    model,
    prompt: pack.prompt,
    system: pack.system,
    stream: false,
    keep_alive: '10m',
    options: { num_predict: numPredict, temperature: 0.2 },
  };
}

function nowIso(clock) {
  return new Date(clock()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Runs one round end to end and returns the receipt that will be appended to the
 * ledger. Never throws for an expected failure — an unreachable engine or a
 * refused answer produces an honest receipt instead of a gap in the record.
 *
 * @returns {{receipt: object, dispatched: boolean}}
 */
export async function runRound({
  repoRoot,
  pillar,
  cursor = 0,
  model = DEFAULT_MODEL,
  endpoint = DEFAULT_OLLAMA,
  stopFile,
  fetchImpl = fetch,
  statImpl = fs.statSync,
  clock = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stopPollMs = 1000,
}) {
  const base = assertLocalEngine(endpoint);
  const started = clock();

  const receiptBase = () => ({
    ts: nowIso(clock),
    device: process.env.MOOTER_DEVICE || 'mac-mini',
    pilar: pillar,
    modelo: model,
    usd: 0,
    engine: 'ollama-local',
  });

  if (isStopped(stopFile, statImpl)) {
    return {
      dispatched: false,
      receipt: {
        ...receiptBase(),
        dur_s: 0,
        tokens_out: 0,
        verdict: VERDICT.NO_FINDING,
        resultado_resumo: 'STOP presente — nao despachou',
        evidencia: 'kill-switch: fail-closed antes de construir a ronda',
      },
    };
  }

  const pack = buildContextPack({ repoRoot, pillar, cursor });
  if (!pack.ok) {
    return {
      dispatched: false,
      receipt: {
        ...receiptBase(),
        dur_s: 0,
        tokens_out: 0,
        verdict: VERDICT.UNCITED,
        resultado_resumo: `sem contexto: ${pack.reason}`,
        evidencia: 'n/d',
      },
    };
  }

  // Last instruction before the wire: closes the check-then-act race, so a STOP
  // that lands during the (filesystem-bound) pack build still stops this round.
  if (isStopped(stopFile, statImpl)) {
    return {
      dispatched: false,
      receipt: {
        ...receiptBase(),
        dur_s: 0,
        tokens_out: 0,
        verdict: VERDICT.NO_FINDING,
        resultado_resumo: 'STOP chegou antes do despacho — race fechado',
        evidencia: `kill-switch: fail-closed com pacote pronto (${pack.file})`,
      },
    };
  }

  let body;
  let httpOk = false;
  let abortedByStop = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A STOP that lands mid-generation used to be ignored for up to 90s while the
  // round finished, and the work was still delivered and counted. The flag now
  // aborts the in-flight request too, so pressing stop stops.
  const stopWatch = setInterval(() => {
    if (isStopped(stopFile, statImpl)) {
      abortedByStop = true;
      controller.abort();
    }
  }, stopPollMs);
  if (typeof stopWatch.unref === 'function') stopWatch.unref();
  try {
    const res = await fetchImpl(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload({ model, pack })),
      signal: controller.signal,
      // Without this, `assertLocalEngine` only guards the FIRST hop: fetch
      // follows a 307 anywhere, method and body intact, so anything answering
      // on :11434 could bounce the prompt to a paid API and the "$0 hard"
      // guarantee would be a URL check that proves nothing.
      redirect: 'error',
    });
    // Belt and braces: if a fetch implementation ignores `redirect`, the final
    // URL still has to be the loopback engine we vetted.
    if (res && res.url) assertLocalEngine(new URL(res.url).origin);
    httpOk = Boolean(res && res.ok);
    body = httpOk ? await res.json() : null;
    if (!httpOk) {
      return {
        dispatched: true,
        receipt: {
          ...receiptBase(),
          dur_s: Math.round((clock() - started) / 1000),
          tokens_out: 0,
          ficheiro: pack.file,
          verdict: VERDICT.UNCITED,
          resultado_resumo: `motor local respondeu HTTP ${res && res.status}`,
          evidencia: 'n/d',
        },
      };
    }
  } catch (err) {
    return {
      dispatched: true,
      receipt: {
        ...receiptBase(),
        dur_s: Math.round((clock() - started) / 1000),
        tokens_out: 0,
        ficheiro: pack.file,
        verdict: VERDICT.NO_FINDING,
        resultado_resumo: abortedByStop
          ? 'STOP durante a geracao — ronda abortada, trabalho descartado'
          : `motor local indisponivel: ${String(err && err.message).slice(0, 120)}`,
        evidencia: abortedByStop ? 'kill-switch: abortou a ronda em voo' : 'n/d',
      },
    };
  } finally {
    clearTimeout(timer);
    clearInterval(stopWatch);
  }

  const text = String((body && (body.response || body.thinking)) || '').trim();
  const tokens = Number((body && body.eval_count) || 0);
  const check = verifyEvidence({
    repoRoot,
    text,
    allowedFiles: pack.allowedFiles,
    // The window the model was actually shown. Without it, a citation to a real
    // line the model never saw is indistinguishable from one it read.
    window: { file: pack.file, startLine: pack.startLine, endLine: pack.endLine },
  });

  return {
    dispatched: true,
    receipt: {
      ...receiptBase(),
      dur_s: Math.round((clock() - started) / 1000),
      tokens_out: Number.isFinite(tokens) ? tokens : 0,
      pilar_label: pack.label,
      ficheiro: pack.file,
      janela: `${pack.startLine}-${pack.endLine}`,
      verdict: check.verdict,
      citacoes: check.citations.map((c) => ({
        ref: `${c.file}:${c.line}`,
        ok: c.ok,
        motivo: c.reason,
        // Surfaced, not just computed: this is the only signal separating
        // "cited what it was shown" from "cited some file at random".
        fora_da_janela: Boolean(c.off_window),
      })),
      fora_da_janela: check.offWindow,
      resultado_resumo: (text.replace(/\s+/g, ' ').slice(0, 280) || 'resposta_vazia'),
      evidencia: check.evidence,
    },
  };
}

/** Rotation over the pillars, kept pure so the loop stays trivial to reason about. */
export function nextPillar(index, pillars = PILLAR_IDS) {
  return pillars[Math.abs(index) % pillars.length];
}
