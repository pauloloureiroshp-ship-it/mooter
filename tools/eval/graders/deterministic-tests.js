'use strict';
/**
 * deterministic_tests — two layers of "the code still compiles and nothing regressed":
 *
 *  1. Per-task (this grade()): re-parse the FINAL file with the SAME @babel/parser options the engine
 *     uses. For an applied edit the result must parse (fail-to-pass: the fix landed AND compiles).
 *     For a refusal the file is unchanged, so it still parses (pass-to-pass). A file that no longer
 *     parses after an "ok" write is the worst outcome — this catches it.
 *
 *  2. Suite-level (runEngineSuite): shell the REAL engine unit suite
 *     (`node --test packages/vscode-extension/src/live-edit-ast.test.js`). This is REUSE, not
 *     duplication — that suite is the product's own regression gate; a green run is our "landing/
 *     engine stays green" pre-condition. run.js calls this once and reports the counts.
 */

const path = require('path');
const { execFileSync } = require('child_process');

let babel = null;
let babelErr = null;
try {
  babel = require(path.resolve(__dirname, '..', '..', '..', 'packages', 'vscode-extension', 'node_modules', '@babel', 'parser'));
} catch (e) { babelErr = e.message; }

const PARSE_OPTS = {
  sourceType: 'module',
  allowReturnOutsideFunction: true,
  plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait'],
};

function parses(src) {
  if (!babel) return { ok: false, err: 'parser-unavailable: ' + babelErr };
  try { babel.parse(src, PARSE_OPTS); return { ok: true }; }
  catch (e) { return { ok: false, err: String(e.message).slice(0, 160) }; }
}

function grade(ctx) {
  const { task, after } = ctx;
  if (task.expect.outcome === 'blocked') return { name: 'deterministic_tests', status: 'blocked' };
  const r = parses(after);
  return {
    name: 'deterministic_tests',
    status: r.ok ? 'pass' : 'fail',
    detail: r.ok ? 'final file parses (compile-clean)' : `final file does NOT parse: ${r.err}`,
  };
}

// Suite-level regression gate — the product's own engine tests. Returns parsed counts + raw tail.
function runEngineSuite() {
  const ext = path.resolve(__dirname, '..', '..', '..', 'packages', 'vscode-extension');
  const testFile = path.join('src', 'live-edit-ast.test.js');
  try {
    const out = execFileSync('node', ['--test', testFile], { cwd: ext, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseTap(out, true);
  } catch (e) {
    // node --test exits non-zero on any failure; stdout still carries the summary.
    const out = (e.stdout || '') + (e.stderr || '');
    return parseTap(out, false);
  }
}

function parseTap(out, exitOk) {
  const num = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
  return {
    tests: num(/# tests (\d+)/) ?? num(/tests (\d+)/),
    pass: num(/# pass (\d+)/) ?? num(/pass (\d+)/),
    fail: num(/# fail (\d+)/) ?? num(/fail (\d+)/),
    exitOk,
    green: exitOk && (num(/# fail (\d+)/) ?? num(/fail (\d+)/)) === 0,
  };
}

module.exports = { grade, runEngineSuite, parses, PARSE_OPTS };
