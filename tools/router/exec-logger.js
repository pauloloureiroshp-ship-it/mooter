#!/usr/bin/env node
// Execution logger — fires AFTER each Bash tool call (in parallel with PostToolUse.js).
// Writes one canonical line to ~/.claude/hooks/execution.log per Bash call:
//   [<ISO>] session=<id> model=<model> role=<role> cmd=<first 60 chars>
//
// Model resolution:
//   Mode "transcript_scan" (default): Pass 1 exact match in provided transcript,
//     Pass 1.5 scans sibling .jsonl files with mtime < 30 s (bounded I/O for
//     sub-agent transcripts), Pass 2 fallback to last assistant model.
//   Mode "decisions_log" (degraded): read ~/.claude/tools/router/decisions.log
//     and use the recommended_model for the current session.
//
// Perf self-tuning: each call records resolution duration in perf.json (rolling
// 20 samples). When rolling avg > 200 ms, mode flips to "decisions_log".
//
// Never blocks. Silent on any error. Does not emit systemMessage (visual hook is separate).

const fs = require('fs');
const path = require('path');
const os = require('os');

// AUDIT-MOOTER-2026-04-19 F3.2: shared helpers so exec-logger and PostToolUse
// always agree on which model is attached to a given Bash / Agent call.
// Runtime wires this hook from ~/.claude/hooks/; this frugal copy mirrors
// that behaviour so /mooter-update doesn't reintroduce the old duplication.
const { subagentTypeToModel, detectExternalModel, getRole } = require('./_model-resolver');

const PERF_PATH = path.join(os.homedir(), '.claude', 'hooks', 'exec-logger-perf.json');
const LOG_PATH = path.join(os.homedir(), '.claude', 'hooks', 'execution.log');
const DECISIONS_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
const PERF_THRESHOLD_MS = 200;
const PERF_WINDOW = 20;

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function tailLines(filePath, maxBytes = 131072) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const start = Math.max(0, size - maxBytes);
  const fd = fs.openSync(filePath, 'r');
  const len = size - start;
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, start);
  fs.closeSync(fd);
  return buf.toString('utf8').split('\n').filter(Boolean);
}

function scanJsonlForToolUse(filePath, toolUseId) {
  try {
    const lines = tailLines(filePath);
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
      const msg = obj && obj.message;
      if (!msg || msg.role !== 'assistant' || !msg.model) continue;
      const content = Array.isArray(msg.content) ? msg.content : null;
      if (!content) continue;
      for (const block of content) {
        if (block && block.type === 'tool_use' && block.id === toolUseId) {
          return msg.model;
        }
      }
    }
  } catch (e) {}
  return null;
}

function getModelFromTranscript(transcriptPath, toolUseId) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    if (toolUseId) {
      const hit = scanJsonlForToolUse(transcriptPath, toolUseId);
      if (hit) return hit;
    }
    if (toolUseId) {
      try {
        const parentDir = path.dirname(transcriptPath);
        const base = path.basename(transcriptPath, '.jsonl');
        const subDir = path.join(parentDir, base, 'subagents');
        if (fs.existsSync(subDir)) {
          const now = Date.now();
          const files = fs.readdirSync(subDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => path.join(subDir, f))
            .filter(p => {
              try { return (now - fs.statSync(p).mtimeMs) < 30000; }
              catch (e) { return false; }
            });
          for (const p of files) {
            const hit = scanJsonlForToolUse(p, toolUseId);
            if (hit) return hit;
          }
        }
      } catch (e) {}
    }
    const lines = tailLines(transcriptPath);
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
      const msg = obj && obj.message;
      if (msg && msg.role === 'assistant' && msg.model) return msg.model;
    }
  } catch (e) {}
  return null;
}

function getModelFromDecisions(sessionId) {
  try {
    if (!fs.existsSync(DECISIONS_PATH)) return null;
    const lines = tailLines(DECISIONS_PATH, 65536);
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
      if (obj.event !== 'classified') continue;
      if (sessionId && obj.session_id && obj.session_id !== sessionId) continue;
      return obj.recommended_model || obj.model || null;
    }
  } catch (e) {}
  return null;
}

function loadPerf() {
  try {
    if (!fs.existsSync(PERF_PATH)) return { samples: [], mode: 'transcript_scan' };
    return JSON.parse(fs.readFileSync(PERF_PATH, 'utf8'));
  } catch (e) { return { samples: [], mode: 'transcript_scan' }; }
}

function savePerf(perf) {
  try { fs.writeFileSync(PERF_PATH, JSON.stringify(perf)); } catch (e) {}
}

(function main() {
  let sessionId = null;
  let transcriptPath = null;
  let toolUseId = null;
  let command = null;
  let subagentType = null;
  let toolName = null;
  try {
    const raw = readStdin();
    if (raw) {
      const payload = JSON.parse(raw);
      sessionId = payload.session_id || payload.sessionId || null;
      transcriptPath = payload.transcript_path || payload.transcriptPath || null;
      toolUseId = payload.tool_use_id || payload.toolUseId || null;
      toolName = payload.tool_name || payload.toolName || null;
      const ti = payload.tool_input || payload.toolInput || {};
      command = ti.command || ti.cmd || null;
      // Agent / Task tool calls carry subagent_type instead of a command.
      subagentType = ti.subagent_type || ti.subagentType || null;
    }
  } catch (e) {}

  const perf = loadPerf();
  const mode = perf.mode || 'transcript_scan';

  const t0 = Date.now();
  let model = null;
  try {
    if (mode === 'decisions_log') {
      model = getModelFromDecisions(sessionId);
    } else {
      model = getModelFromTranscript(transcriptPath, toolUseId);
    }
  } catch (e) {}
  const durMs = Date.now() - t0;

  // External LLM CLI detection: if the Bash command shells out to codex, gemini,
  // aider, or ollama (run/_call.sh), override the resolved model so execution.log
  // records the actual worker, not the Claude orchestrator that spawned the call.
  const externalModel = detectExternalModel(command);
  if (externalModel) model = externalModel;

  // v0.12: Agent/Task subagent spawn — override the resolved model with the
  // effective model of the spawned subagent. Without this override, every
  // Agent call gets logged as the parent's model (usually Opus), making
  // delegation invisible to the compliance tracker.
  const subagentModel = subagentTypeToModel(subagentType);
  if (subagentModel) model = subagentModel;

  try {
    perf.samples = Array.isArray(perf.samples) ? perf.samples : [];
    perf.samples.push(durMs);
    if (perf.samples.length > PERF_WINDOW) perf.samples = perf.samples.slice(-PERF_WINDOW);
    if (perf.samples.length >= 5) {
      const avg = perf.samples.reduce((a, b) => a + b, 0) / perf.samples.length;
      if (avg > PERF_THRESHOLD_MS && perf.mode !== 'decisions_log') {
        perf.mode = 'decisions_log';
        perf.flipped_at = new Date().toISOString();
        perf.flipped_reason = `rolling_avg=${avg.toFixed(1)}ms > ${PERF_THRESHOLD_MS}ms`;
      }
    }
    savePerf(perf);
  } catch (e) {}

  try {
    const ts = new Date().toISOString();
    const sid = sessionId || 'unknown';
    const mdl = model || 'unknown';
    const role = getRole(model);
    // For subagent spawns the "command" field is replaced with an "agent:<type>"
    // marker so downstream filters (statusline, inject_context compliance) can
    // distinguish delegated work from inline Bash.
    let cmdField;
    if (subagentType) {
      cmdField = `agent:${subagentType}`;
    } else {
      cmdField = command ? String(command).replace(/\s+/g, ' ').slice(0, 60) : '';
    }
    const line = `[${ts}] session=${sid} model=${mdl} role=${role} cmd=${cmdField} resolve_ms=${durMs} mode=${mode}\n`;
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {}

  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
})();
