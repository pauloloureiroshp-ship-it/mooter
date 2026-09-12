'use strict';
/**
 * state_check — grade the FINAL file state read back from disk, NEVER the engine's "✓ written" claim
 * (Demystifying-evals: "grade the outcome, not the claim"; audit finding P0-1 is exactly a claim that
 * didn't match the true state). run.js has already performed the single sandboxed write (only when the
 * engine returned ok); this grader re-reads the file and checks it against the task's expectation.
 *
 * Assertions (task.expect.assert[]):
 *   contains / absent          — substring is / isn't in the final file
 *   line_absent / line_present — an exact line string
 *   outside_unchanged          — every byte outside ONE contiguous region is byte-identical to before
 *   is_inside_expression       — aux signal (scope-honesty warning for .map()/{…} deletes)
 * For expect.outcome==='refuse' the file MUST be byte-identical to before (a refusal never writes)
 * and the engine's reason MUST match.
 */

function commonPrefix(a, b) { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a[i] === b[i]) i++; return i; }
function commonSuffix(a, b, cap) { let i = 0; const n = Math.min(a.length, b.length) - cap; while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; }

function checkAssertion(as, ctx) {
  const { after, before, aux } = ctx;
  switch (as.type) {
    case 'contains':
      return { ok: after.includes(as.value), why: `contains ${JSON.stringify(as.value)}` };
    case 'absent':
      return { ok: !after.includes(as.value), why: `absent ${JSON.stringify(as.value)}` };
    case 'line_absent':
      return { ok: !after.split('\n').some((l) => l === as.value), why: `line absent ${JSON.stringify(as.value)}` };
    case 'line_present':
      return { ok: after.split('\n').some((l) => l === as.value), why: `line present ${JSON.stringify(as.value)}` };
    case 'is_inside_expression':
      return { ok: !!(aux && aux.isInsideExpression) === !!as.value, why: `isInsideExpression==${as.value}` };
    case 'crlf_preserved': {
      // No bare LF may have leaked (every \n is part of a \r\n) AND the CR count is unchanged from
      // the original — proves the byte-splice did not normalize line endings.
      const noBareLF = !after.replace(/\r\n/g, '').includes('\n');
      const crBefore = (before.match(/\r/g) || []).length;
      const crAfter = (after.match(/\r/g) || []).length;
      return { ok: noBareLF && crBefore === crAfter, why: `crlf_preserved (CR ${crBefore}→${crAfter}, bareLF=${!noBareLF})` };
    }
    case 'outside_unchanged': {
      // The engine only ever produces ONE contiguous splice. Prove the untouched prefix and suffix
      // are byte-identical to the original: the change is localized, no collateral bytes moved.
      const p = commonPrefix(before, after);
      const s = commonSuffix(before, after, p);
      const changedBefore = before.slice(p, before.length - s);
      const changedAfter = after.slice(p, after.length - s);
      // A localized edit: exactly one region differs, and both endpoints are shared byte-for-byte.
      const localized = before.slice(0, p) === after.slice(0, p)
        && before.slice(before.length - s) === after.slice(after.length - s);
      return { ok: localized, why: `outside_unchanged (Δ ${changedBefore.length}→${changedAfter.length}B, prefix ${p}B, suffix ${s}B)` };
    }
    default:
      return { ok: false, why: `unknown assertion ${as.type}` };
  }
}

function grade(ctx) {
  const { task, before, after, engineResult } = ctx;
  const exp = task.expect;

  if (exp.outcome === 'blocked') return { name: 'state_check', status: 'blocked', detail: task.blocked && task.blocked.reason };

  if (exp.outcome === 'refuse') {
    const wroteNothing = after === before;
    const reasonOk = engineResult && engineResult.ok === false && engineResult.reason === exp.reason;
    const ok = wroteNothing && reasonOk;
    return {
      name: 'state_check',
      status: ok ? 'pass' : 'fail',
      detail: `refuse: file_unchanged=${wroteNothing} reason=${engineResult && engineResult.reason} (want ${exp.reason})`,
    };
  }

  // outcome === 'apply'
  if (!engineResult || engineResult.ok !== true) {
    return { name: 'state_check', status: 'fail', detail: `expected apply but engine returned ${engineResult && engineResult.reason}` };
  }
  const wrote = after !== before;
  const asserts = (exp.assert || []).map((a) => ({ a, r: checkAssertion(a, ctx) }));
  const failed = asserts.filter((x) => !x.r.ok);
  const ok = wrote && failed.length === 0;
  return {
    name: 'state_check',
    status: ok ? 'pass' : 'fail',
    detail: ok
      ? `apply: wrote, ${asserts.length} assertions ok`
      : `apply: wrote=${wrote}; failed [${failed.map((x) => x.r.why).join('; ')}]`,
  };
}

module.exports = { grade };
