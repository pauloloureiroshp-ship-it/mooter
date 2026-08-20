#!/usr/bin/env node
// fable-observe-posttool.js — Wave Mega 50-51 Phase 5 (Fable 5 observation loop).
//
// PostToolUse hook: when a Claude Code session (Fable 5 orchestrator) spawns a
// subagent via the Agent/Task tool, append a minimal FEATURE-LEVEL observation
// to ~/.mooter/fable-observations/. NO prompt text is ever written by this hook
// (hash only), regardless of the store_prompts setting — auto-capture stays at
// the strictest privacy level.
//
// NOT WIRED AUTOMATICALLY. Manual wiring only — add to ~/.claude/settings.json:
//
//   "hooks": {
//     "PostToolUse": [
//       {
//         "matcher": "Task",
//         "hooks": [
//           { "type": "command", "command": "node ~/.claude/hooks/fable-observe-posttool.js" }
//         ]
//       }
//     ]
//   }
//
// (Install copy lives at ~/.claude/hooks/fable-observe-posttool.js; the repo
//  copy at tools/router/hooks/ is the canonical, tested source.)
//
// Gates (all must hold, otherwise silent no-op):
//   1. ~/.mooter/fable-observe.json has enabled: true
//   2. the payload is an Agent/Task tool call (tool_name Task/Agent or
//      tool_input.subagent_type present)
//
// Degrades silently on ANY error and ALWAYS exits 0 — a hook must never break
// a session.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function sha16(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex').slice(0, 16);
}

(function main() {
  try {
    // Gate 1 — opt-in config.
    // `MOOTER_HOME` ganha ao `homedir()`, como em todo o resto do repo. Sem
    // isto o hook escreve observacoes na casa VERDADEIRA de quem o corre mesmo
    // quando o chamador redireccionou o home — e no Windows o `os.homedir()` le
    // o `USERPROFILE` e ignora o `HOME`, portanto nem exportar `HOME` bastava.
    const mooterDir = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
    let cfg = null;
    try {
      cfg = JSON.parse(fs.readFileSync(path.join(mooterDir, 'fable-observe.json'), 'utf8'));
    } catch (e) { /* missing/corrupt → disabled */ }
    if (!cfg || cfg.enabled !== true) process.exit(0);

    // Gate 2 — only Agent/Task subagent spawns.
    const raw = readStdin();
    if (!raw) process.exit(0);
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { process.exit(0); }
    const toolName = String(payload.tool_name || payload.toolName || '');
    const ti = payload.tool_input || payload.toolInput || {};
    const subagentType = ti.subagent_type || ti.subagentType || null;
    const isSpawn = toolName === 'Task' || toolName === 'Agent' || !!subagentType;
    if (!isSpawn) process.exit(0);

    const tsMs = Date.now();
    const promptish = typeof ti.prompt === 'string' ? ti.prompt : null;
    // Hash source: subagent prompt when present, else description, else a
    // session/time salt — task_hash must always be 16 hex.
    const hashSource = promptish || ti.description || `${payload.session_id || ''}:${tsMs}`;

    const obs = {
      schema: 1,
      ts: new Date(tsMs).toISOString(),
      ts_ms: tsMs,
      session_id: payload.session_id || payload.sessionId || null,
      orchestrator_model: 'claude-fable-5',
      task_hash: sha16(hashSource),
      task_type: 'orchestration',
      prompt_len: promptish ? promptish.length : null,
      // NO prompt_text — auto-capture never stores text, even with store_prompts on.
      fable_decision: {
        action: 'spawn_subagent',
        subagent_type: subagentType || null,
        model_chosen: typeof ti.model === 'string' ? ti.model : null,
        parallel_count: null,
        rationale: null,
      },
      router_baseline: null, // hook stays fast + silent; baseline comes from explicit `log`
      pattern_gap: null,
      outcome: { completed: null, tests_pass: null },
      pastor_training_value: 'medium',
    };

    const dir = path.join(mooterDir, 'fable-observations');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${obs.ts_ms}_${obs.task_hash}.json`),
      JSON.stringify(obs, null, 2) + '\n',
      'utf8'
    );
  } catch (e) {
    /* silent — never break a session */
  }
  process.exit(0);
})();
