#!/usr/bin/env node
// ledger-decision.js — Moo Ledger Spine L0: MECHANICAL decision capture.
//
// The most valuable memory the Mooter was losing: the WHY behind a choice. When
// the context clears, the next session re-litigates decisions already made
// (decision-level delirium). The antidote is a Decision Record (ADR-style):
// immutable, attributed, replayable. (MOO_LEDGER_AND_ORCHESTRATION.md, EU AI Act
// "decision traces": input + decision + rationale + who approved + what context.)
//
// This module is PURE: it DERIVES decisions from the transcript the host already
// wrote — an `AskUserQuestion` tool_use paired with the following tool_result —
// and NEVER invents them. The turn-end hook feeds it the transcript tail and
// emits one `kind:decision` event per answered question (a moo later adds the
// 1-line rationale and passes the groundedness gate). No AskUserQuestion in the
// tail ⇒ zero decisions. Never throws.

'use strict';

const QUESTION_MAX = 300;
const OPTION_MAX = 200;
const CHOSEN_MAX = 200;

// PURE: derive every answered decision from a transcript JSONL tail (array of
// raw lines OR parsed objects). Returns [] when nothing is answered. Shape:
//   { question, options:[label…], chosen, answered_by, tool_use_id }
// Pairing is by tool_use_id — an AskUserQuestion block whose result has not yet
// arrived is skipped (honest: an unanswered prompt is not a decision).
function deriveDecisions(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const askBlocks = [];        // { id, questions:[{question, header, options[]}] }
  const resultsById = {};      // tool_use_id → { map } | { text }

  for (const ln of arr) {
    const d = _parse(ln);
    const msg = d && d.message;
    if (!msg) continue;
    const content = Array.isArray(msg.content) ? msg.content : null;
    if (!content) continue;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_use' && b.name === 'AskUserQuestion') {
        const qs = (b.input && Array.isArray(b.input.questions)) ? b.input.questions : [];
        askBlocks.push({
          id: b.id || null,
          questions: qs.map((q) => ({
            question: String((q && q.question) || '').slice(0, QUESTION_MAX),
            header: String((q && q.header) || ''),
            options: Array.isArray(q && q.options)
              ? q.options.map((o) => String((o && o.label) || '').slice(0, OPTION_MAX)).filter(Boolean)
              : [],
          })),
        });
      } else if (b.type === 'tool_result' && b.tool_use_id && !_isToolError(b)) {
        const ans = _extractAnswers(b);
        if (ans) resultsById[b.tool_use_id] = ans;
      }
    }
  }

  const out = [];
  for (const ab of askBlocks) {
    const ans = (ab.id && resultsById[ab.id]) || null;
    if (!ans) continue; // unanswered → not a decision
    for (const q of ab.questions) {
      const chosen = _pickChosen(ans, q);
      if (chosen == null || chosen === '') continue;
      out.push({
        question: q.question || q.header,
        options: q.options,
        chosen: String(chosen).slice(0, CHOSEN_MAX),
        // The answer lives in a user-role tool_result → a human picked it. Honest,
        // mechanically true, not invented. (A moo may later refine attribution.)
        answered_by: 'human',
        tool_use_id: ab.id,
      });
    }
  }
  return out;
}

// A failed AskUserQuestion invocation is a tool result, but never a human
// decision. Claude Code versions may expose the failure via `is_error`, a
// structured error field, or the textual <tool_use_error>/InputValidationError
// payload. Reject all three before answer extraction so an error cannot be
// projected as `answered_by: human`.
function _isToolError(block) {
  if (!block || typeof block !== 'object') return false;
  if (block.is_error === true || block.error != null) return true;
  let text = '';
  if (typeof block.content === 'string') text = block.content;
  else if (Array.isArray(block.content)) {
    text = block.content.map((item) => {
      if (typeof item === 'string') return item;
      return item && typeof item.text === 'string' ? item.text : '';
    }).join(' ');
  }
  return /<tool_use_error>|InputValidationError|ToolUseError/i.test(text);
}

function _parse(ln) {
  if (ln && typeof ln === 'object') return ln;            // already parsed
  try { return JSON.parse(String(ln)); } catch { return null; }
}

// Pull an answer payload out of a tool_result block. The host serializes the
// AskUserQuestion result a few ways across versions; tolerate all:
//   • content string or [{type:'text', text}] blocks
//   • a JSON body, preferably { answers: { <question>: <label> } }
// Returns { map } (structured) | { text } (freeform) | null.
function _extractAnswers(b) {
  let text = '';
  const c = b.content;
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    for (const x of c) {
      if (typeof x === 'string') text += x;
      else if (x && typeof x.text === 'string') text += x.text;
    }
  }
  text = String(text).trim();
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object') {
      if (j.answers && typeof j.answers === 'object') return { map: j.answers };
      return { map: j };
    }
  } catch { /* not JSON — fall through to freeform */ }
  return { text };
}

// Pick the chosen label for one question from an answer payload. For a map,
// key by the exact question text or header; a single-entry map collapses to its
// one value. For freeform text, prefer an exact option match, else the raw text.
function _pickChosen(ans, q) {
  if (!ans) return null;
  if (ans.map) {
    const m = ans.map;
    if (q.question && m[q.question] != null) return _coerce(m[q.question]);
    if (q.header && m[q.header] != null) return _coerce(m[q.header]);
    const vals = Object.values(m);
    if (vals.length === 1) return _coerce(vals[0]);
    return null;
  }
  if (ans.text) {
    const hit = q.options.find((o) => o && ans.text.includes(o));
    return hit || ans.text;
  }
  return null;
}

// A map value may be a bare label, an array of labels, or { label }.
function _coerce(v) {
  if (Array.isArray(v)) return v.map(_coerce).filter(Boolean).join(', ');
  if (v && typeof v === 'object') return String(v.label || v.value || '');
  return String(v);
}

module.exports = { deriveDecisions, _isToolError };
