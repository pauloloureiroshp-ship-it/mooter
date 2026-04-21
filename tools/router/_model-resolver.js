// Shared model-resolution helpers — loaded by both PostToolUse.js and
// exec-logger.js so the emoji (user-facing) and execution.log (audit)
// always agree on what model did what.
//
// Extracted in AUDIT-MOOTER-2026-04-19 F3.2 to remove ~100 lines of
// duplicated code. Keep this file lean: no I/O, no globals. Both hooks
// require it synchronously inside PostToolUse — a slow require here
// becomes latency on every Bash call.
//
// Runtime location: ~/.claude/hooks/_model-resolver.js (wired by
// settings.json hooks that require it). This frugal copy is the
// versioned mirror — see .claude/rules/router-logic.md canonical table.

'use strict';

function subagentTypeToModel(subagentType) {
  if (!subagentType) return null;
  const t = String(subagentType).toLowerCase();
  if (t === 'local-summarizer' || t === 'local-transformer') return 'qwen3:30b';
  if (t === 'cheap-triage') return 'claude-haiku-4-5-20251001';
  if (t === 'model-reasoner') return 'claude-sonnet-4-6';
  if (t === 'model-architect' || t === 'final-reviewer') return 'claude-opus-4-6';
  if (t === 'explore' || t === 'plan' || t === 'general-purpose') return 'claude-sonnet-4-6';
  if (t.startsWith('gsd-')) return 'claude-sonnet-4-6';
  return null;
}

function detectExternalModel(command) {
  if (!command) return null;
  const cmd = String(command);
  if (cmd.includes('ollama_call.sh')) return 'qwen3:30b';
  const ollamaRun = cmd.match(/\bollama\s+run\s+(\S+)/);
  if (ollamaRun) return ollamaRun[1];
  if (/\bcodex\b/.test(cmd)) {
    const m = cmd.match(/--model[= ](\S+)/);
    return m ? m[1] : 'gpt-5-codex';
  }
  if (/\bgemini(-cli)?\b/.test(cmd)) {
    const m = cmd.match(/--model[= ](\S+)/);
    return m ? m[1] : 'gemini-2.5-flash';
  }
  if (/\baider\b/.test(cmd)) {
    const m = cmd.match(/--model[= ](\S+)/);
    return m ? m[1] : 'gpt-5';
  }
  return null;
}

function getRole(model) {
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

module.exports = {
  subagentTypeToModel,
  detectExternalModel,
  getRole,
};
