'use strict';
/**
 * telemetry.js — mooter-bridge v1.2 · CW3 "tempo real"
 *
 * Reads the NDJSON a headless agent writes to out.log while it works, and turns
 * it into the four things the panel could never show:
 *
 *   1. the REAL model, taken from the job's own stream — not guessed from cwd
 *   2. tokens in/out as they accumulate
 *   3. tokens per second, measured
 *   4. what the agent is doing RIGHT NOW, in plain words ("a ler fleet.js")
 *
 * WHY THIS FILE EXISTS (the bug it kills):
 *   fleet.js#attachModels matched job.worktree against session.cwd and copied
 *   the model of whatever session shared that folder. On 2026-07-25 a job
 *   inherited `claude-opus-4-8` from a session that was 18 HOURS old. The panel
 *   was confident and wrong — worse than `n/d`. The stream is the only source
 *   that cannot lie: it is the job talking about itself.
 *
 * Contract: parse defensively, never throw, and NEVER invent. No stream, or a
 * stream we do not recognise → every field null. `n/d` beats a plausible lie.
 *
 * Tail-only by design: out.log grows unbounded and the panel polls every 3s, so
 * we read at most TAIL_BYTES from the end and drop the first (probably partial)
 * line. Cost is O(tail), not O(file).
 */

const fs = require('fs');

const TAIL_BYTES = 256 * 1024;

/** Read the last `bytes` of a file without loading the whole thing. */
function readTail(file, bytes) {
  let fd = null;
  try {
    const st = fs.statSync(file);
    if (!st.size) return '';
    const len = Math.min(bytes, st.size);
    const buf = Buffer.allocUnsafe(len);
    fd = fs.openSync(file, 'r');
    // Honour the BYTES ACTUALLY READ. If the file is rotated or truncated
    // between statSync and readSync, the tail of an allocUnsafe buffer is
    // uninitialised memory — decoding it as UTF-8 leaks garbage into the panel.
    const read = fs.readSync(fd, buf, 0, len, st.size - len);
    const s = buf.toString('utf8', 0, read);
    // a partial first line would only produce garbage — drop it
    return st.size > len ? s.slice(s.indexOf('\n') + 1) : s;
  } catch {
    return null;
  } finally {
    if (fd != null) { try { fs.closeSync(fd); } catch { /* */ } }
  }
}

function parseLines(text) {
  const out = [];
  if (!text) return out;
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    try { out.push(JSON.parse(s)); } catch { /* partial/garbage line — skip, never guess */ }
  }
  // Fallback: `--output-format json` (and any pretty-printed log) is ONE object
  // spread over many lines, so the line parser finds nothing. Older bundles and
  // future CLI changes must not silently produce zero telemetry.
  if (!out.length) {
    const i = text.indexOf('{');
    if (i >= 0) {
      try {
        const j = JSON.parse(text.slice(i));
        if (j && typeof j === 'object') { j.type = j.type || 'result'; out.push(j); }
      } catch { /* genuinely not JSON */ }
    }
  }
  return out;
}

/** Human sentence for a tool_use block. Portuguese, because the panel is his. */
function describeToolUse(name, input) {
  const n = String(name || '');
  const i = input || {};
  const file = i.file_path || i.path || i.notebook_path || null;
  const base = file ? String(file).split(/[\\/]/).pop() : null;
  switch (n) {
    case 'Read': return base ? 'a ler ' + base : 'a ler um ficheiro';
    case 'Write': return base ? 'a escrever ' + base : 'a escrever um ficheiro';
    case 'Edit':
    case 'NotebookEdit': return base ? 'a editar ' + base : 'a editar um ficheiro';
    case 'Bash': {
      const c = String(i.command || '').trim().split('\n')[0];
      return c ? 'a correr `' + (c.length > 48 ? c.slice(0, 48) + '…' : c) + '`' : 'a correr um comando';
    }
    case 'Glob': return i.pattern ? 'a procurar ficheiros `' + i.pattern + '`' : 'a procurar ficheiros';
    case 'Grep': return i.pattern ? 'a procurar `' + String(i.pattern).slice(0, 40) + '`' : 'a procurar no código';
    case 'Task':
    case 'Agent': return 'a delegar num subagente';
    case 'WebSearch': return i.query ? 'a pesquisar "' + String(i.query).slice(0, 40) + '"' : 'a pesquisar na web';
    case 'WebFetch': return 'a ler uma página';
    case 'TodoWrite': return 'a organizar as tarefas';
    default: return n ? 'a usar ' + n : null;
  }
}

function firstWords(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/**
 * Fold a stream of NDJSON events into one honest snapshot.
 * Accepts both `--output-format stream-json` (many lines) and the single-object
 * `--output-format json` (one line) — the second simply yields the final numbers.
 */
function foldEvents(events) {
  const t = {
    model: null,            // the REAL model, from the job's own mouth
    session_id: null,
    tokens_in: null,
    tokens_out: null,
    cache_read: null,
    cache_write: null,
    tok_s: null,
    activity: null,         // what it is doing right now, in words
    steps_done: 0,          // how many tool calls it has made
    tools_used: [],         // distinct tool names, in order of first use
    // v1.3 — "o que foi lido, editado, o que falta fazer". The stream names
    // every file the agent touches; separating read from written is the
    // difference between "an agent is running" and "an agent changed THIS".
    files_read: [],
    files_written: [],
    commands: [],           // shell commands actually run
    cost_usd: null,
    num_turns: null,
    finished: false,
    first_ts: null,
    last_ts: null,
    source: 'stream',
  };
  if (!events.length) return null;

  const seen = new Set();
  let lastText = null;
  let lastToolUse = null;
  let lastToolName = null;
  const turns = { in: null, out: null, cr: null, cw: null };   // per-message usage
  const final = { in: null, out: null, cr: null, cw: null };   // the `result` total

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const msg = e.message && typeof e.message === 'object' ? e.message : null;

    // model: system/init first, then any assistant message that carries it
    const model = e.model || (msg && msg.model) || null;
    if (model && typeof model === 'string') t.model = model;
    if (e.session_id) t.session_id = e.session_id;

    // Usage arrives twice: per-turn on each assistant message, and again as a
    // TOTAL on the final `result` event. Summing both double-counts — the fake
    // Ollama run reported 51 prompt tokens and telemetry said 102. So: collect
    // both separately and prefer the authoritative total at the end.
    const u = (msg && msg.usage) || e.usage || null;
    if (u && typeof u === 'object') {
      const isFinal = (e.type === 'result');
      const bucket = isFinal ? final : turns;
      // OUTPUT accumulates: each turn generates new tokens.
      // INPUT does NOT: a multi-turn agent re-sends the whole conversation every
      // turn, so summing input_tokens counts the same context N times. v1.2 did
      // exactly that and inflated `in` on any job with more than one turn.
      // Per-turn input is therefore a MAX (the largest context seen), and the
      // `result` total overrides it when the job ends.
      if (u.input_tokens != null) {
        const v = Number(u.input_tokens);
        bucket.in = isFinal ? ((bucket.in || 0) + v) : Math.max(bucket.in || 0, v);
      }
      if (u.output_tokens != null) bucket.out = (bucket.out || 0) + Number(u.output_tokens);
      if (u.cache_read_input_tokens != null) {
        const v = Number(u.cache_read_input_tokens);
        bucket.cr = isFinal ? ((bucket.cr || 0) + v) : Math.max(bucket.cr || 0, v);
      }
      if (u.cache_creation_input_tokens != null) bucket.cw = (bucket.cw || 0) + Number(u.cache_creation_input_tokens);
    }

    // what it is doing: last tool_use wins, else last text block
    const content = (msg && Array.isArray(msg.content)) ? msg.content
      : (Array.isArray(e.content) ? e.content : null);
    if (content) {
      for (const b of content) {
        if (!b || typeof b !== 'object') continue;
        if (b.type === 'tool_use') {
          t.steps_done++;
          lastToolName = b.name || null;
          lastToolUse = describeToolUse(b.name, b.input);
          if (b.name && !seen.has(b.name)) { seen.add(b.name); t.tools_used.push(b.name); }
          const inp = b.input || {};
          const f = inp.file_path || inp.path || inp.notebook_path || null;
          if (f) {
            const base = String(f).split(/[\\/]/).pop();
            const list = (b.name === 'Write' || b.name === 'Edit' || b.name === 'NotebookEdit') ? t.files_written : t.files_read;
            if (base && !list.includes(base)) list.push(base);
          }
          if (b.name === 'Bash' && inp.command) {
            const c = String(inp.command).trim().split('\n')[0].slice(0, 70);
            if (c && !t.commands.includes(c)) t.commands.push(c);
          }
        } else if (b.type === 'text' && b.text) {
          lastText = b.text;
        }
      }
    }

    if (e.total_cost_usd != null) t.cost_usd = Number(e.total_cost_usd);
    if (e.num_turns != null) t.num_turns = Number(e.num_turns);
    // `--output-format json` emits one object with no `type`; a total_cost_usd
    // is just as good a signal that this is the final word on the job.
    if (e.type === 'result' || e.total_cost_usd != null) { t.finished = true; if (e.result) lastText = e.result; }

    const ts = e.timestamp || e.ts || null;
    if (ts) { if (!t.first_ts) t.first_ts = ts; t.last_ts = ts; }
  }

  // the final total wins when it exists; otherwise the per-turn sum
  t.tokens_in = final.in != null ? final.in : turns.in;
  t.tokens_out = final.out != null ? final.out : turns.out;
  t.cache_read = final.cr != null ? final.cr : turns.cr;
  t.cache_write = final.cw != null ? final.cw : turns.cw;

  t.activity = t.finished
    ? (firstWords(lastText, 90) || 'concluído')
    : (lastToolUse || firstWords(lastText, 90) || (t.model ? 'a pensar' : null));
  t.last_tool = lastToolName;
  // Something is worth reporting if the job told us ANY of: which model it is,
  // how many tokens it used, what it cost, or which session it is. Only when we
  // know none of those do we say null — because that is the honest answer.
  const knowsSomething = t.model != null || t.tokens_in != null || t.tokens_out != null
    || t.cost_usd != null || t.session_id != null;
  return knowsSomething ? t : null;
}

/** tok/s over a known elapsed window. Never divides by zero, never guesses. */
/**
 * ⚠️ v1.3.2 — a rate that decays every time you read it is a lie.
 *
 * v1.3.1 divided tokens by wall-clock-since-spawn, and the caller kept passing
 * "now minus started_at" even for finished jobs. The same job read four times
 * reported 116 → 33 → 8 → 3 → 2 tok/s. Nothing changed except the clock.
 *
 * Rules now:
 *   · finished job → freeze on the job's own duration, and only once
 *   · live job     → still an estimate, and marked as such
 *   · no duration  → no number. `tok_s` stays null rather than drifting.
 */
function withRate(t, elapsedSeconds, opts) {
  if (!t) return t;
  const o = opts || {};
  const finished = t.finished || o.finished === true;
  const secs = (finished && o.duration_s != null) ? Number(o.duration_s) : elapsedSeconds;
  if (t.tokens_out != null && secs != null && secs > 0) {
    t.tok_s = Math.round(t.tokens_out / secs);
    t.tok_s_basis = finished ? 'duração final do job' : 'estimativa, job a correr';
  } else {
    t.tok_s = null;
    t.tok_s_basis = null;
  }
  return t;
}

/**
 * Public entry: read a job's out.log and describe the job honestly.
 * @returns {object|null} null when there is nothing trustworthy to say.
 */
function readJobTelemetry(outLogPath, elapsedSeconds, opts) {
  const text = readTail(outLogPath, TAIL_BYTES);
  if (text == null) return null;
  const t = foldEvents(parseLines(text));
  return withRate(t, elapsedSeconds, opts);
}

module.exports = {
  readJobTelemetry, foldEvents, parseLines, readTail, describeToolUse, withRate, TAIL_BYTES,
};
