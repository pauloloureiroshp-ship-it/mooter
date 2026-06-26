#!/usr/bin/env node
// handoff-anchor.js — Live Context Accumulator (PASSO 6, additive & opt-in).
//
// Re-uses the SAME rolling summary built in the background (handoff-rollup.js)
// to keep the Claude Code context fresh & light at two moments:
//
//   • PreCompact   → inject the local rolling summary as an ANCHOR block so the
//                    compaction PRESERVES the distilled thread instead of
//                    re-summarising from scratch (lighter, more faithful, fewer
//                    input tokens on the next calls).
//   • SessionStart → on startup/resume, inject the summary so the host resumes
//                    state for a few tokens, without re-reading the whole
//                    transcript.
//
// HARD RULE: qwen ANCHORS, it does NOT replace Claude's compaction. A 3B model
// summarising the host's working context alone risks dropping detail. The local
// summary supplies "what mattered"; Claude compacts the rest. Best-effort: if no
// summary exists, this prints nothing and normal compaction/startup proceeds.
//
// NOT auto-wired (touches shared settings.json). To enable, add to
// ~/.claude/settings.json hooks:
//   "PreCompact":   [{ "hooks": [{ "type": "command", "command": "node ~/.claude/tools/router/handoff-anchor.js" }] }]
//   "SessionStart": [{ "hooks": [{ "type": "command", "command": "node ~/.claude/tools/router/handoff-anchor.js" }] }]

'use strict';

const ANCHOR_MAX = 600;

// PURE (testable): build the anchor additionalContext from a rolling summary.
// null/empty summary → null (no injection). Never throws.
function buildAnchor(summary, opts) {
  opts = opts || {};
  const s = String(summary || '').trim();
  if (!s) return null;
  const body = s.slice(0, ANCHOR_MAX);
  const label = opts.event === 'SessionStart'
    ? 'Running context (local rolling summary — resume point):'
    : 'Running context (local rolling summary — preserve this thread across compaction):';
  return label + '\n' + body;
}

// PURE: the hook stdout object for an event + anchor. additionalContext is the
// documented injection field; systemMessage makes it visible / survives hosts
// that ignore additionalContext for an event. Never throws.
function buildHookOutput(event, anchor) {
  if (!anchor) return null;
  return {
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: { hookEventName: event || 'SessionStart', additionalContext: anchor },
    systemMessage: '🐮 anchored running context (local) — ' + (event || 'session'),
  };
}

module.exports = { buildAnchor, buildHookOutput, ANCHOR_MAX };

if (require.main === module) {
  (async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      let raw = '';
      try { raw = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }
      let payload = {}; try { payload = JSON.parse(raw) || {}; } catch { payload = {}; }
      const sid = payload.session_id || (payload.session && payload.session.id) || payload.sessionId || null;
      const event = payload.hook_event_name || payload.hookEventName || 'SessionStart';
      if (!sid) process.exit(0);
      let journal; try { journal = require(path.join(__dirname, 'handoff-journal.js')); } catch { process.exit(0); }
      const summary = journal.readSummary(sid);
      const out = buildHookOutput(event, buildAnchor(summary, { event }));
      if (out) { try { process.stdout.write(JSON.stringify(out)); } catch { /* best-effort */ } }
    } catch { /* never block */ }
    process.exit(0);
  })();
}
