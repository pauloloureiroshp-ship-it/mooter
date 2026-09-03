'use strict';
/**
 * static_analysis — eslint + tsc hooks for JS/TS (Demystifying-evals grader stack §2).
 *
 * HONEST SCOPE (Fase A): the golden fixtures are ISOLATED .tsx snippets with no surrounding
 * tsconfig/eslintrc/React types, so a project-aware `tsc --noEmit` or `eslint` run would report noise
 * (missing module 'react', no JSX runtime) that says nothing about the EDIT. Therefore:
 *   - Always-on ($0): a syntactic parse of the final file with the engine's own parser options — the
 *     meaningful, project-independent "does it still typecheck as syntax" signal for an isolated edit.
 *   - Pluggable hook: we DETECT whether eslint/tsc binaries are reachable and expose the wiring point,
 *     but report `wired:false (isolated fixture)` rather than pretend to run a project lint. When the
 *     harness is later pointed at a real package (Fase F CI, full landing tree), flip `projectRoot`
 *     and this grader runs the real tools. Nothing here is faked green.
 */

const { execFileSync } = require('child_process');
const { parses } = require('./deterministic-tests');

function binAvailable(bin, args) {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true; }
  catch (e) { return e.code !== 'ENOENT'; } // present but non-zero exit still counts as "available"
}

let _caps = null;
function capabilities() {
  if (_caps) return _caps;
  _caps = {
    eslint: binAvailable('npx', ['--no-install', 'eslint', '--version']),
    tsc: binAvailable('npx', ['--no-install', 'tsc', '--version']),
  };
  return _caps;
}

function grade(ctx) {
  const { task, after } = ctx;
  if (task.expect.outcome === 'blocked') return { name: 'static_analysis', status: 'blocked' };
  const syn = parses(after);
  const caps = capabilities();
  return {
    name: 'static_analysis',
    status: syn.ok ? 'pass' : 'fail',
    detail: syn.ok
      ? `syntactic OK · eslint:${caps.eslint ? 'available' : 'absent'} tsc:${caps.tsc ? 'available' : 'absent'} (project lint wired:false — isolated fixture)`
      : `syntactic FAIL: ${syn.err}`,
  };
}

module.exports = { grade, capabilities };
