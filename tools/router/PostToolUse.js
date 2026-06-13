#!/usr/bin/env node
// Mooter model indicator — fires AFTER each Bash tool call.
// Renders as: ⎿ PostToolUse says: 🔴 claude-opus-4-6
// Source: transcript JSONL last assistant message.model (accurate per-call).
// Fallback: decisions.log router recommendation.
// Never blocks. Silent on any error.

const fs = require('fs');
const path = require('path');
const os = require('os');

// AUDIT-MOOTER-2026-04-19 F3.2: shared helpers so the per-call emoji and
// execution.log agree on which model handled any given Bash / Agent call.
const { subagentTypeToModel, detectExternalModel } = require('./_model-resolver');

function getModelEmoji(model) {
  if (!model) return '❓';
  const m = String(model).toLowerCase();
  if (m.includes('opus')) return '🔴';
  if (m.includes('sonnet')) return '🟡';
  if (m.includes('haiku')) return '⚡';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return '🦙';
  if (m.includes('codex') || m.includes('openai') || m.includes('gpt')) return '🟩';
  if (m.includes('gemini') || m.includes('google')) return '💎';
  return '❓';
}

function getModelRole(model) {
  if (!model) return 'unknown';
  const m = String(model).toLowerCase();
  if (m.includes('opus')) return 'architect';
  if (m.includes('sonnet')) return 'reasoning';
  if (m.includes('haiku')) return 'reflex';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local';
  if (m.includes('codex') || m.includes('openai') || m.includes('gpt')) return 'generalist';
  if (m.includes('gemini') || m.includes('google')) return 'multimodal';
  return 'unknown';
}

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

// Bulletproof model lookup: find the exact assistant message whose tool_use
// block matches this hook's tool_use_id. For sub-agent Bash calls the tool_use_id
// lives in a sibling transcript (sub-agent runs its own JSONL), so Pass 1.5
// scans sibling .jsonl files modified in the last 30 s — bounded I/O, 1-3 files.
function getModelFromTranscript(transcriptPath, toolUseId) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  try {
    // Pass 1 — exact match in provided (parent) transcript
    if (toolUseId) {
      const hit = scanJsonlForToolUse(transcriptPath, toolUseId);
      if (hit) return hit;
    }

    // Pass 1.5 — sub-agent transcripts live at <parentDir>/<session>/subagents/*.jsonl
    // Bounded I/O: filter by mtime < 30 s → usually 1-3 files.
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

    // Pass 2 — fallback: most recent assistant message with a model field
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

function findDecision(sessionId) {
  const logPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
  if (!fs.existsSync(logPath)) return null;
  try {
    const lines = tailLines(logPath, 65536);
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
      if (obj.event !== 'classified') continue;
      if (sessionId && obj.session_id && obj.session_id !== sessionId) continue;
      return obj;
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try { obj = JSON.parse(lines[i]); } catch (e) { continue; }
      if (obj.event === 'classified') return obj;
    }
  } catch (e) {}
  return null;
}

(function main() {
  let sessionId = null;
  let transcriptPath = null;
  let toolUseId = null;
  let command = null;
  let subagentType = null;
  try {
    const raw = readStdin();
    if (raw) {
      const payload = JSON.parse(raw);
      sessionId = payload.session_id || payload.sessionId || null;
      transcriptPath = payload.transcript_path || payload.transcriptPath || null;
      toolUseId = payload.tool_use_id || payload.toolUseId || null;
      const ti = payload.tool_input || payload.toolInput || {};
      command = ti.command || ti.cmd || null;
      subagentType = ti.subagent_type || ti.subagentType || null;
    }
  } catch (e) {}

  let model = null;
  try { model = getModelFromTranscript(transcriptPath, toolUseId); } catch (e) {}
  if (!model) {
    try {
      const decision = findDecision(sessionId);
      model = decision ? (decision.recommended_model || decision.model) : null;
    } catch (e) {}
  }

  // Pass 3 — last-subagent state file written by inject_context.js.
  // If a subagent was spawned in the last 30s, use its model instead of the
  // parent session model (which is always Opus). This fixes the statusline
  // showing Opus for Bash calls that ran inside a Haiku/Sonnet/Ollama subagent.
  if (!subagentType) {
    try {
      const lsPath = path.join(os.homedir(), '.claude', 'tools', 'router', 'last-subagent.json');
      const ls = JSON.parse(fs.readFileSync(lsPath, 'utf8'));
      if (ls && ls.model && (Date.now() - ls.ts) < 30000) {
        model = ls.model;
      }
    } catch (e) {}
  }

  // External LLM CLI detection: codex/gemini/aider/ollama → show the real worker.
  const externalModel = detectExternalModel(command);
  if (externalModel) model = externalModel;

  // v0.12: Agent/Task subagent spawn → show the subagent's effective model
  // instead of the parent Opus orchestrator. This is critical for the user
  // to see when delegation actually happens.
  const subagentModel = subagentTypeToModel(subagentType);
  if (subagentModel) model = subagentModel;

  const emoji = getModelEmoji(model);
  const role = getModelRole(model);
  const suffix = subagentType ? ` · agent:${subagentType}` : '';
  const label = model ? `${emoji} ${model} · ${role}${suffix}` : `${emoji} · ${role}`;

  process.stdout.write(JSON.stringify({
    continue: true,
    suppressOutput: false,
    systemMessage: label
  }));
  process.exit(0);
})();
