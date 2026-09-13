'use strict';
/**
 * engine-adapter.js — the ONLY bridge between the eval harness and the product.
 *
 * It `require()`s the real, frozen $0 edit engine
 * (`packages/vscode-extension/src/live-edit-ast.js`) READ-ONLY and never mutates it. Every op is
 * dispatched to a real engine function and wrapped so the harness records a `toolCall` descriptor
 * (which engine primitive ran + the single file path it is allowed to write). This is what the
 * `tool_calls` grader inspects to prove least-privilege (D2): only allowlisted primitives ran, and
 * the write — if any — was physically bounded to the sandbox file.
 *
 * The engine functions are PURE (they return { ok, code } and never touch the disk). The harness,
 * not the engine, performs the single sandboxed write in run.js. That separation is deliberate:
 * `state_check` then reads the FILE back from disk, grading the real final state, not the engine's
 * return value ("grade the outcome, not the claim").
 */

const path = require('path');

// Read-only require of the frozen engine. Resolution of its internal `@babel/parser` is relative to
// the engine's own directory (packages/vscode-extension/node_modules), so it works from anywhere.
const ENGINE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'packages',
  'vscode-extension',
  'src',
  'live-edit-ast.js',
);
const engine = require(ENGINE_PATH);

// The allowlist. Any op the harness can drive must map to exactly one of these engine primitives.
// If a task ever asked for a primitive outside this set, the tool_calls grader would flag it.
const ALLOWLISTED = new Set([
  'applyDeterministicEdit',
  'deleteNode',
  'locateRange',
  'spliceNodeRange',
  'insertImports',
  'isInsideExpression',
]);

function parserAvailable() {
  // The engine degrades to { reason: 'parse-error' } with detail 'parser-unavailable' when
  // @babel/parser is missing. Probe once so the harness can report honestly instead of silently
  // scoring every task as a refusal.
  const r = engine.applyDeterministicEdit('<div>x</div>', { line: 1, tag: 'div' }, { kind: 'text', value: 'y' });
  return !(r && r.reason === 'parse-error' && r.detail === 'parser-unavailable');
}

/**
 * Run one op against `source`. Returns { result, aux, toolCalls }.
 *  - result: the engine's own return ({ ok, code?, reason? }) — the "claim".
 *  - aux: optional side facts a grader needs (e.g. isInsideExpression for scope-honesty tasks).
 *  - toolCalls: [{ primitive, writePath, wrote }] — recorded for the tool_calls grader. `wrote` is
 *    set by run.js after it performs the single sandbox write, so it reflects the REAL disk effect.
 */
function runOp(task, source, writePath) {
  const target = task.target || {};
  const toolCalls = [];
  const record = (primitive) => {
    if (!ALLOWLISTED.has(primitive)) {
      // Defence in depth: the harness itself must not invoke a non-allowlisted primitive.
      throw new Error('non-allowlisted primitive requested: ' + primitive);
    }
    const tc = { primitive, writePath, wrote: false };
    toolCalls.push(tc);
    return tc;
  };

  let result;
  const aux = {};

  switch (task.op) {
    case 'edit': {
      record('applyDeterministicEdit');
      result = engine.applyDeterministicEdit(source, target, task.edit || {});
      break;
    }
    case 'delete': {
      // Scope honesty (P1-5): a delete inside {…}/.map() affects EVERY rendered item. Record it so
      // state_check can assert the honest warning signal is available for the panel.
      aux.isInsideExpression = engine.isInsideExpression(source, target);
      record('isInsideExpression');
      record('deleteNode');
      result = engine.deleteNode(source, target);
      break;
    }
    case 'splice': {
      record('locateRange');
      const loc = engine.locateRange(source, target);
      if (!loc.ok) { result = loc; break; }
      // rangeDelta lets a red-team task fabricate an off-by-one range that is NOT a real node span.
      const delta = task.splice && Number.isInteger(task.splice.rangeDelta) ? task.splice.rangeDelta : 0;
      const range = { start: loc.start + delta, end: loc.end };
      record('spliceNodeRange');
      result = engine.spliceNodeRange(source, range, task.splice ? task.splice.replacement : '');
      break;
    }
    case 'imports': {
      record('insertImports');
      result = engine.insertImports(source, task.imports || []);
      break;
    }
    default:
      result = { ok: false, reason: 'unsupported-op', detail: String(task.op) };
  }

  return { result, aux, toolCalls };
}

module.exports = { runOp, parserAvailable, ENGINE_PATH, ALLOWLISTED };
