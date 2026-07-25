'use strict';
/**
 * moo.js — mooter-bridge v1.2 · CW2/CW5: the local tier finally works.
 *
 * Until v1.1 the router mapped T0 → `moo` and then admitted, in its own
 * routing_note, that "T0/moo não é dispatchável na v0". The 4090 sat there with
 * a model resident and ZERO jobs while every single task went to Opus. Measured
 * 2026-07-25: 6 of 6 sessions on claude-opus-4-8, savedUsd negative in all six.
 * A local-first router that never routes locally is a slogan, not a moat.
 *
 * This adapter runs a job on Ollama and writes the SAME NDJSON shape the cloud
 * agents write, so telemetry.js, the ledger and the panel need no special case:
 * one pipeline, three vendors, one honest set of numbers.
 *
 * Cost: 0, and that is a MEASURED zero, not an unknown. Ollama bills nothing.
 * Tokens are the real thing Ollama reports (prompt_eval_count / eval_count) and
 * tok/s is computed from eval_duration, which Ollama returns in NANOSECONDS.
 *
 * Zero dependencies, zero writes outside the job dir. If the daemon is down we
 * fail loudly and immediately instead of pretending a job is running.
 */

const http = require('http');
const fs = require('fs');
const { EventEmitter } = require('events');

function hostPort(hostStr) {
  const [h, p] = String(hostStr || '127.0.0.1:11434').replace(/^https?:\/\//, '').split(':');
  return { host: h || '127.0.0.1', port: Number(p) || 11434 };
}

/** GET /api/tags — which models this machine can actually run. */
function listModels(hostStr, timeoutMs) {
  const { host, port } = hostPort(hostStr);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let req;
    try {
      req = http.get({ host, port, path: '/api/tags', timeout: timeoutMs || 1500 }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { body += d; if (body.length > 500000) req.destroy(); });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            finish((j && j.models || []).map((m) => ({
              model: m.model || m.name || null,
              size_bytes: m.size != null ? m.size : null,
              parameter_size: (m.details && m.details.parameter_size) || null,
              quantization: (m.details && m.details.quantization_level) || null,
            })).filter((m) => m.model));
          } catch { finish(null); }
        });
      });
    } catch { return finish(null); }
    req.on('timeout', () => { try { req.destroy(); } catch { /* */ } finish(null); });
    req.on('error', () => finish(null));
  });
}

/**
 * Pick a model without ever inventing one.
 * Order: explicit arg → MOOTER_MOO_MODEL → resident on the GPU → smallest installed.
 * Returns null when the machine genuinely has nothing — the caller must fail.
 */
/**
 * ⚠️ v1.3.3 — um modelo de EMBEDDINGS não gera texto.
 *
 * A v1.3.2 escolhia "o primeiro residente, senão o menor instalado". Nenhuma das
 * duas perguntava se o modelo sabe gerar. Um job real recebeu
 * `nomic-embed-text:latest` e morreu em 102 ms com só a linha de init.
 *
 * E não foi azar — é enviesamento duplo:
 *   1. embedders são quase sempre os MENORES instalados → ganhavam o sort;
 *   2. o RAG do vault mantém o embedder RESIDENTE → ganhava o primeiro lugar.
 * Quanto melhor o RAG funcionava, mais garantido era escolher o modelo errado.
 *
 * Agora: filtrar por capacidade primeiro, e preferir o MAIOR que cabe na VRAM
 * livre — porque um modelo maior dá um briefing melhor, e a folga já é medida.
 */
const EMBED_RE = /(embed|bge|gte|minilm|e5-|nomic|mxbai|arctic-embed|all-minilm)/i;

function isGenerative(m) {
  if (!m || !m.model) return false;
  if (EMBED_RE.test(String(m.model))) return false;
  const fam = String((m.details && m.details.family) || m.family || '');
  if (EMBED_RE.test(fam)) return false;
  return true;
}

async function pickModel(explicit, hostStr, residentList, opts) {
  if (explicit) return String(explicit);
  const env = process.env.MOOTER_MOO_MODEL;
  if (env && env.indexOf('${') < 0 && env.trim()) return env.trim();

  const freeMb = opts && opts.free_mb != null ? Number(opts.free_mb) : null;
  const fits = (m) => (freeMb == null || m.size_bytes == null) ? true : (m.size_bytes / 1048576) <= freeMb * 0.9;

  // 1. já residente E capaz de gerar: é o mais rápido a arrancar
  const resident = (Array.isArray(residentList) ? residentList : []).filter(isGenerative);
  if (resident.length && resident[0].model) return resident[0].model;

  // 2. instalados: o MAIOR que cabe, porque prepara melhor
  const all = await listModels(hostStr, 1500);
  if (!all || !all.length) return null;
  const gen = all.filter(isGenerative);
  if (!gen.length) return null;                    // só há embedders → n/d, nunca improvisar
  const sized = gen.filter((m) => m.size_bytes != null && fits(m));
  if (sized.length) { sized.sort((a, b) => b.size_bytes - a.size_bytes); return sized[0].model; }
  const anySized = gen.filter((m) => m.size_bytes != null);
  if (anySized.length) { anySized.sort((a, b) => a.size_bytes - b.size_bytes); return anySized[0].model; }
  return gen[0].model;
}

/**
 * Run a prompt on Ollama, streaming.
 *
 * Returns an EventEmitter shaped like a ChildProcess on purpose: `spawn`,
 * `close`, `.kill()`. seamless.js then treats local and cloud identically —
 * same ledger events, same registry, same cancel path, same watchdog.
 */
function runLocal({ hostStr, model, prompt, outStream, errStream, options }) {
  const { host, port } = hostPort(hostStr);
  const em = new EventEmitter();
  const t0 = Date.now();
  let killed = false;
  let req = null;

  const write = (obj) => { try { outStream.write(JSON.stringify(obj) + '\n'); } catch { /* */ } };
  const werr = (s) => { try { errStream.write(s + '\n'); } catch { /* */ } };

  // Mirror the cloud agents' first event so telemetry.js needs no special case.
  write({ type: 'system', subtype: 'init', model, session_id: 'moo-' + t0.toString(36), local: true, host: hostStr });

  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    options: Object.assign({ temperature: 0.2 }, options || {}),
  });

  setImmediate(() => em.emit('spawn'));

  try {
    req = http.request(
      { host, port, path: '/api/chat', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
      (res) => {
        let buf = '';
        let text = '';
        let lastEmit = 0;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buf += chunk;
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let j;
            try { j = JSON.parse(line); } catch { continue; }
            if (j.message && j.message.content) text += j.message.content;

            // throttle: one assistant frame per ~400ms keeps out.log small while
            // still letting the panel show live progress at its 3s cadence
            const now = Date.now();
            if (!j.done && now - lastEmit > 400) {
              lastEmit = now;
              write({
                type: 'assistant', local: true,
                message: { model, content: [{ type: 'text', text: text.slice(-400) }], usage: { output_tokens_partial: text.length } },
              });
            }

            if (j.done) {
              const evalCount = j.eval_count != null ? j.eval_count : null;
              const promptCount = j.prompt_eval_count != null ? j.prompt_eval_count : null;
              const evalNs = j.eval_duration != null ? j.eval_duration : null;
              const tok_s = (evalCount != null && evalNs) ? Math.round(evalCount / (evalNs / 1e9)) : null;
              write({
                type: 'assistant', local: true,
                message: { model, content: [{ type: 'text', text }], usage: { input_tokens: promptCount, output_tokens: evalCount } },
              });
              write({
                type: 'result', subtype: 'success', local: true, model,
                result: text,
                // Zero API cost — measured, not unknown: Ollama bills nothing.
                // NOT zero real cost: electricity and wear exist. We report what
                // we can measure and name it precisely instead of saying "free".
                total_cost_usd: 0,
                cost_note: 'custo de API = 0 (inferência local). Energia e desgaste não estão medidos — não são zero.',
                num_turns: 1,
                usage: { input_tokens: promptCount, output_tokens: evalCount },
                ollama: {
                  eval_count: evalCount,
                  prompt_eval_count: promptCount,
                  eval_duration_ns: evalNs,
                  prompt_eval_duration_ns: j.prompt_eval_duration != null ? j.prompt_eval_duration : null,
                  total_duration_ns: j.total_duration != null ? j.total_duration : null,
                  load_duration_ns: j.load_duration != null ? j.load_duration : null,
                  tok_s,
                },
              });
            }
          }
        });
        res.on('end', () => { try { outStream.end(); } catch { /* */ } em.emit('close', killed ? 137 : 0); });
        res.on('error', (e) => { werr('stream error: ' + ((e && e.message) || e)); em.emit('close', 1); });
      }
    );
    req.on('error', (e) => {
      werr('ollama inalcançável em ' + hostStr + ': ' + ((e && e.message) || e));
      write({ type: 'result', subtype: 'error', local: true, model, result: 'ollama inalcançável: ' + ((e && e.message) || e) });
      try { outStream.end(); } catch { /* */ }
      em.emit('close', 1);
    });
    req.write(payload);
    req.end();
  } catch (e) {
    werr('falha ao iniciar: ' + ((e && e.message) || e));
    setImmediate(() => em.emit('close', 1));
  }

  em.kill = () => { killed = true; try { req && req.destroy(); } catch { /* */ } };
  em.stdout = { pipe() { /* we write to outStream ourselves */ } };
  em.stderr = { pipe() { /* idem */ } };
  return em;
}

module.exports = { runLocal, listModels, pickModel, hostPort, isGenerative, EMBED_RE };
