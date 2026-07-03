'use strict';

// FRENTE C · PM Adapters — GitHub, READ-ONLY (repo:status).
//
// This is the ONE inbound path in the whole subsystem, and it is DISPLAY-ONLY. It reads
// PR + CI status so Frente B can paint the operational chips (PR/CI/merged) — the same
// real git/PR truth the Perfect Handoff shows. It output is tagged `_kind:'presentation'`
// and MUST NEVER be merged into forecast.json's probabilistic fields (DC-11): letting an
// external tool's state feed the forecast would make GitHub a 2nd source of truth.
//
// Transport preference: the `gh` CLI first (already authed on the dev's machine, $0, no
// token to store), executed with shell:false (matches the SECURITY-2 execFile precedent);
// else read-only REST with a broker token scoped to `repo:status`. Both injectable.

const { execFile } = require('child_process');

const DIRECTION = 'read-only';

/** Run `gh` with args, shell:false. Resolves { ok, stdout } — never throws. */
function ghRunner(args) {
  return new Promise((resolve) => {
    try {
      execFile('gh', args, { timeout: 8000, windowsHide: true }, (err, stdout) => {
        if (err) return resolve({ ok: false, stdout: '' });
        resolve({ ok: true, stdout: String(stdout || '') });
      });
    } catch {
      resolve({ ok: false, stdout: '' });
    }
  });
}

async function restStatus({ owner, repo, ref }, token, fetchImpl) {
  if (!token || typeof fetchImpl !== 'function') return null;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/commits/${ref}/status`, {
      method: 'GET',
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mooter' },
    });
    if (!res || !res.ok) return null;
    const j = await res.json();
    return { state: j && j.state, total: j && j.total_count };
  } catch {
    return null;
  }
}

/**
 * Read PR + CI presentation data for a ref/PR. Returns a presentation-tagged object or
 * null. NEVER returns forecast-shaped fields; NEVER writes anything.
 * @param {object} ctx { owner, repo, ref, prNumber }
 * @param {object} deps { token, runner=ghRunner, fetchImpl=fetch } — injectable for tests
 */
async function enrich(ctx = {}, deps = {}) {
  const { owner, repo, ref, prNumber } = ctx;
  const runner = deps.runner || ghRunner;
  const fetchImpl = deps.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const out = { _kind: 'presentation', source: 'github', pr: null, ci: null };

  // Prefer gh CLI (no stored token needed).
  if (prNumber != null) {
    const r = await runner(['pr', 'view', String(prNumber), '--json', 'number,state,url,mergeStateStatus']);
    if (r.ok) { try { out.pr = JSON.parse(r.stdout); } catch { /* leave null */ } }
  }
  if (owner && repo && ref) {
    const r = await runner(['api', `repos/${owner}/${repo}/commits/${ref}/status`, '--jq', '{state:.state,total:.total_count}']);
    if (r.ok) { try { out.ci = JSON.parse(r.stdout); } catch { /* leave null */ } }
  }

  // Fallback to read-only REST only if gh yielded nothing and a token exists.
  if (!out.ci && deps.token) {
    const st = await restStatus({ owner, repo, ref }, deps.token, fetchImpl);
    if (st) out.ci = st;
  }

  if (!out.pr && !out.ci) return null;
  return out;
}

module.exports = { DIRECTION, enrich, ghRunner };
