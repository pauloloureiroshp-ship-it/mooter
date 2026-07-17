#!/usr/bin/env node
'use strict';

/**
 * Live Preview TRUST HARNESS — runner.
 *
 * Spec: _handoff/MOOTER_20_H2_TRUST_HARNESS.md
 *
 * The Live Preview never had a code problem — it had a CI problem: no workflow ran the
 * extension's tests on a pull_request, so a PR could break them and CI stayed green. This
 * runner is the gate that closes it, and the gate is deliberately NOT "the tests are green":
 * it is "the proof still EXISTS". Deleting lp-lease-host.test.js makes the plain suite
 * greener; here it fails as proof-unbacked.
 *
 * It orchestrates the tests that already exist and asserts ABOUT them. It reads no test
 * file and rewrites none. The only new assertion surface is tools/lp-trust-proofs.json.
 *
 * Usage:
 *   node tools/lp-trust-runner.js                 full run + receipt
 *   node tools/lp-trust-runner.js --json          machine-readable result on stdout
 *   node tools/lp-trust-runner.js --proof=P3      diagnostic subset (never writes a receipt)
 *   node tools/lp-trust-runner.js --no-receipt    run the gate, write nothing
 *   node tools/lp-trust-runner.js --no-install    reuse node_modules (default when present)
 *
 * Node >= 22. No new dependencies.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'tools', 'lp-trust-proofs.json');

/* ────────────────────────────── S3 · JUnit parsing ───────────────────────────── */

/**
 * Node's junit reporter escapes `&`, `<` and `"` (and newlines) in attributes, but leaves
 * `'` and `>` literal. Unescape `&amp;` LAST so an escaped literal like `&amp;quot;` does
 * not decode into a quote.
 */
function unescapeXml(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#9;/g, '\t')
    .replace(/&amp;/g, '&');
}

/**
 * Parse the `node --test --test-reporter=junit` document into flat test records.
 *
 * Only <testcase> elements are tests; suite rollups are not emitted as testcases by this
 * reporter, so there is nothing to filter out. A real `"` inside a name is always &quot;,
 * which is why matching name="([^"]*)" is sound.
 *
 * @returns {{name:string,file:string,status:'pass'|'fail'|'skip',durationMs:number}[]}
 */
function parseJUnit(xml) {
  const out = [];
  // Match both self-closing <testcase .../> and <testcase ...>…</testcase>.
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const body = m[3] || '';
    const name = /\bname="([^"]*)"/.exec(attrs);
    if (!name) continue;
    const file = /\bfile="([^"]*)"/.exec(attrs);
    const time = /\btime="([^"]*)"/.exec(attrs);

    let status = 'pass';
    // <skipped/> covers skip and todo; <failure>/<error> are real failures.
    if (/<skipped\b/.test(body)) status = 'skip';
    if (/<failure\b/.test(body) || /<error\b/.test(body)) status = 'fail';

    out.push({
      name: unescapeXml(name[1]),
      file: file ? unescapeXml(file[1]) : '',
      status,
      durationMs: time ? Math.round(parseFloat(time[1]) * 1000 * 1000) / 1000 : 0,
    });
  }
  return out;
}

/* ─────────────────────────── manifest + path helpers ─────────────────────────── */

function loadManifest(p = MANIFEST_PATH) {
  const raw = fs.readFileSync(p, 'utf8');
  const manifest = JSON.parse(raw);
  validateManifest(manifest);
  return manifest;
}

/** Fail loudly at load time rather than silently matching nothing at assert time. */
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest: not an object');
  if (!Array.isArray(manifest.proofs) || manifest.proofs.length === 0) {
    throw new Error('manifest: proofs must be a non-empty array');
  }
  const seen = new Set();
  for (const p of manifest.proofs) {
    if (!p.id) throw new Error('manifest: a proof is missing an id');
    if (seen.has(p.id)) throw new Error(`manifest: duplicate proof id ${p.id}`);
    seen.add(p.id);
    if (!Array.isArray(p.files) || p.files.length === 0) {
      throw new Error(`manifest: ${p.id} declares no files`);
    }
    if (!Array.isArray(p.match) || p.match.length === 0) {
      throw new Error(`manifest: ${p.id} declares no match clauses`);
    }
    for (const c of p.match) {
      if (typeof c.pattern !== 'string' || !c.pattern) {
        throw new Error(`manifest: ${p.id} has a clause without a pattern`);
      }
      if (!Number.isInteger(c.minCount) || c.minCount < 1) {
        // A clause with minCount 0 asserts nothing — exactly the rot this harness exists to stop.
        throw new Error(`manifest: ${p.id} clause "${c.pattern}" needs an integer minCount >= 1`);
      }
      try {
        new RegExp(c.pattern);
      } catch {
        throw new Error(`manifest: ${p.id} clause "${c.pattern}" is not a valid regex`);
      }
      if (c.file && !p.files.includes(c.file)) {
        throw new Error(`manifest: ${p.id} clause file "${c.file}" is not in that proof's files`);
      }
    }
  }
  return true;
}

/** Every distinct test file the proof set depends on, in manifest order. */
function proofFiles(manifest, proofIds = null) {
  const files = [];
  for (const p of manifest.proofs) {
    if (proofIds && !proofIds.includes(p.id)) continue;
    for (const f of p.files) if (!files.includes(f)) files.push(f);
  }
  return files;
}

/** Compare a manifest-relative test path against the absolute path junit reports. */
function sameFile(manifestFile, reportedFile) {
  if (!reportedFile) return false;
  const norm = (s) => s.replace(/\\/g, '/').toLowerCase();
  return norm(reportedFile).endsWith(norm(manifestFile));
}

/* ──────────────────────── S4/S5 · the anti-rot assertions ─────────────────────── */

/**
 * Assert each proof against the observed tests.
 *
 * A proof is green only when every clause meets its minCount AND no matched test failed.
 * Missing tests are reported as `proof-unbacked` — that is the whole point of the harness.
 */
function evaluateProofs(manifest, tests, proofIds = null) {
  const detail = [];
  for (const proof of manifest.proofs) {
    if (proofIds && !proofIds.includes(proof.id)) continue;

    const scoped = tests.filter((t) => proof.files.some((f) => sameFile(f, t.file)));
    const clauses = [];
    const matchedNames = new Set();
    const reasons = [];

    for (const clause of proof.match) {
      const re = new RegExp(clause.pattern);
      const pool = clause.file ? scoped.filter((t) => sameFile(clause.file, t.file)) : scoped;
      const hits = pool.filter((t) => re.test(t.name));
      const failed = hits.filter((t) => t.status === 'fail');
      const skipped = hits.filter((t) => t.status === 'skip');
      // Skips do not count as backing: a skipped test proves nothing.
      const backing = hits.filter((t) => t.status === 'pass');

      for (const h of hits) matchedNames.add(`${h.file}\u0000${h.name}`);

      const unbacked = backing.length < clause.minCount;
      if (unbacked) {
        reasons.push(
          `proof-unbacked: /${clause.pattern}/${clause.file ? ` in ${clause.file}` : ''} ` +
            `matched ${backing.length} passing test(s), manifest requires ${clause.minCount}`
        );
      }
      for (const f of failed) reasons.push(`test-failed: ${f.name}`);

      clauses.push({
        pattern: clause.pattern,
        file: clause.file || null,
        minCount: clause.minCount,
        matched: hits.length,
        passing: backing.length,
        failed: failed.length,
        skipped: skipped.length,
        status: unbacked || failed.length > 0 ? 'red' : 'green',
      });
    }

    detail.push({
      id: proof.id,
      name: proof.name,
      backing: proof.backing,
      anchor: proof.anchor,
      status: reasons.length === 0 ? 'green' : 'red',
      reasons,
      clauses,
      tests: [...matchedNames].map((k) => k.split('\u0000')[1]).sort(),
    });
  }
  return detail;
}

/**
 * The verdict. Pure, so the gate's own logic is testable without running the suite.
 *
 * The proof set is the UNION OF THE MANIFEST'S FILES (spec :81), not merely the tests a
 * clause happens to match, and the spec is explicit that green means "zero tests failing in
 * the proof set" (:88). So EVERY failing test in those files is fatal — including one no
 * clause matches. Scoring only clause hits would run ~110 tests, ignore the ~54 unmatched
 * ones, and hand back a green receipt while a real LP regression test was broken — the exact
 * false green this harness exists to abolish.
 */
function computeProblems({ proofDetail, tests, badSkips = [], runStatus = 0 }) {
  const problems = [];

  // proof-unbacked is per-proof; test-failed is reported once below, for the whole set.
  for (const p of proofDetail) {
    for (const r of p.reasons) {
      if (!r.startsWith('test-failed:')) problems.push(`${p.id} ${r}`);
    }
  }

  for (const t of tests) {
    if (t.status === 'fail') {
      const where = t.file ? ` (${t.file.replace(/\\/g, '/').split('/').pop()})` : '';
      problems.push(`test-failed: ${t.name}${where}`);
    }
  }

  for (const s of badSkips) problems.push(`skip-not-allowlisted: ${s.name}`);

  // Belt-and-braces: a subprocess killed mid-run can emit a well-formed report that parses
  // to zero failures. `node --test` exits non-zero whenever a test failed, so a non-zero
  // exit with a clean report means we cannot trust the report — fail closed.
  if (runStatus !== 0 && !tests.some((t) => t.status === 'fail')) {
    problems.push(
      `test-runner-exit: node --test exited ${runStatus} but the report shows no failing test — ` +
        `the report cannot be trusted, refusing to call that green`
    );
  }

  return problems;
}

/** S5 — a skip inside the proof set is a hole unless the manifest allowlists it. */
function evaluateSkips(manifest, tests, platform = process.platform) {
  const allow = manifest.skipAllowlist || [];
  const offenders = [];
  for (const t of tests) {
    if (t.status !== 'skip') continue;
    const ok = allow.some(
      (a) =>
        sameFile(a.file, t.file) &&
        new RegExp(a.namePattern).test(t.name) &&
        (!a.platform || a.platform === platform)
    );
    if (!ok) offenders.push({ name: t.name, file: t.file });
  }
  return offenders;
}

/* ───────────────────────────────── git helpers ───────────────────────────────── */

function git(args, cwd = REPO_ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

/**
 * The receipt is a projection, never a source of truth. A committed receipt is a stale
 * claim, so we refuse to write one anywhere git would track it. "Cannot determine" is
 * treated as not-ignored: fail-closed, same lesson as D6's "no scan".
 */
function isGitIgnored(relPath) {
  const r = git(['check-ignore', '-q', '--', relPath]);
  if (r.code === 0) return { ignored: true };
  if (r.code === 1) return { ignored: false, reason: 'path is not covered by .gitignore' };
  return { ignored: false, reason: `git check-ignore failed (exit ${r.code}): ${r.err || 'unknown'}` };
}

/* ────────────────────────────── S0 · classify freeze ─────────────────────────── */

function checkClassifyFreeze(manifest) {
  const cfg = manifest.classifyFreeze;
  if (!cfg) return { ok: true, skipped: true };
  const target = path.join(REPO_ROOT, cfg.file);
  const shaFile = path.join(REPO_ROOT, cfg.shaFile);
  if (!fs.existsSync(target)) return { ok: false, reason: `missing ${cfg.file}` };
  if (!fs.existsSync(shaFile)) return { ok: false, reason: `missing ${cfg.shaFile}` };
  const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  const expected = fs.readFileSync(shaFile, 'utf8').trim().split(/\s+/)[0];
  return actual === expected
    ? { ok: true, sha: actual }
    : { ok: false, reason: `classify.js sha mismatch`, expected, actual };
}

/* ───────────────────────────────── main pipeline ─────────────────────────────── */

function parseArgs(argv) {
  const args = { json: false, receipt: true, install: null, proofs: null };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a === '--no-receipt') args.receipt = false;
    else if (a === '--no-install') args.install = false;
    else if (a === '--install') args.install = true;
    else if (a.startsWith('--proof=')) {
      args.proofs = a
        .slice('--proof='.length)
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
  }
  return args;
}

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

function main(argv = process.argv.slice(2)) {
  const started = Date.now();
  const args = parseArgs(argv);
  const manifest = loadManifest();
  const extDir = path.join(REPO_ROOT, manifest.extensionDir);

  if (args.proofs) {
    const known = manifest.proofs.map((p) => p.id);
    const unknown = args.proofs.filter((p) => !known.includes(p));
    if (unknown.length) {
      log(`✖ unknown proof id(s): ${unknown.join(', ')} — known: ${known.join(', ')}`);
      return 1;
    }
  }

  // ── S0 · frozen classifier ────────────────────────────────────────────────────
  const freeze = checkClassifyFreeze(manifest);
  if (!freeze.ok) {
    log(`✖ S0 classify.js freeze: ${freeze.reason}`);
    if (freeze.expected) log(`  expected: ${freeze.expected}\n  actual:   ${freeze.actual}`);
    return 1;
  }
  log(`✓ S0 classify.js frozen (${String(freeze.sha).slice(0, 8)}…)`);

  // ── S1 · deps ─────────────────────────────────────────────────────────────────
  const hasModules = fs.existsSync(path.join(extDir, 'node_modules'));
  const shouldInstall = args.install === null ? !hasModules || !!process.env.CI : args.install;
  if (shouldInstall) {
    log(`… S1 npm ci in ${manifest.extensionDir}`);
    const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {
      cwd: extDir,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      log('✖ S1 npm ci failed');
      return 1;
    }
  } else {
    log('· S1 npm ci skipped (node_modules present; --install to force)');
  }

  // ── S2 · run the union of manifest files (explicit list, never a glob) ────────
  const files = proofFiles(manifest, args.proofs);
  for (const f of files) {
    if (!fs.existsSync(path.join(extDir, f))) {
      // A proof whose file vanished must fail here, not silently match zero tests.
      log(`✖ S2 proof file missing: ${f} (proof-unbacked)`);
      return 1;
    }
  }
  log(`… S2 node --test over ${files.length} proof file(s)`);

  // One spawn PER FILE, so each test is attributed to the file we KNOW we ran, rather than
  // to the reporter's `file` attribute. That attribute is not emitted by every Node the CI
  // may use (it is absent on the workflow's Node 22 but present on Node 24), and when it is
  // missing every proof matches zero tests — the harness correctly fail-closes to RED, but
  // for a reason that has nothing to do with the Live Preview. Attribution is ours to make.
  // Cost is 6 extra process starts (~1s); node --test already isolates per file anyway.
  const tests = [];
  let runStatus = 0;
  for (const f of files) {
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=junit', f], {
      cwd: extDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (run.error) {
      log(`✖ S2 test runner failed to start for ${f}: ${run.error.message}`);
      return 1;
    }
    if (run.status !== 0) runStatus = run.status;

    let parsed;
    try {
      parsed = parseJUnit(run.stdout || '');
    } catch (e) {
      log(`✖ S3 could not parse the junit report for ${f}: ${e.message}`);
      return 1;
    }
    if (parsed.length === 0) {
      // A proof file that yields no tests cannot back anything. Never silently green.
      log(`✖ S3 ${f} reported zero tests — refusing to call that green`);
      if (run.stderr) log(run.stderr.slice(0, 2000));
      return 1;
    }
    // `file` is authoritative here: it is the path we passed to the runner.
    for (const t of parsed) tests.push({ ...t, file: f });
  }
  const totals = {
    total: tests.length,
    pass: tests.filter((t) => t.status === 'pass').length,
    fail: tests.filter((t) => t.status === 'fail').length,
    skipped: tests.filter((t) => t.status === 'skip').length,
  };
  log(`✓ S3 parsed ${totals.total} tests (${totals.pass} pass · ${totals.fail} fail · ${totals.skipped} skip)`);

  // ── S4 · anti-rot ─────────────────────────────────────────────────────────────
  const proofDetail = evaluateProofs(manifest, tests, args.proofs);
  const greenProofs = proofDetail.filter((p) => p.status === 'green').length;

  // ── S5 · skip policy ──────────────────────────────────────────────────────────
  const badSkips = evaluateSkips(manifest, tests);

  const problems = computeProblems({ proofDetail, tests, badSkips, runStatus });

  const status = problems.length === 0 ? 'green' : 'red';

  // ── S6 · receipt (projection; a run we cannot record earns no trust) ──────────
  const partial = !!args.proofs;
  let receiptPath = null;
  if (args.receipt && !partial) {
    const rel = manifest.receipt.path;
    if (manifest.receipt.mustBeGitIgnored) {
      const ig = isGitIgnored(rel);
      if (!ig.ignored) {
        log(`✖ S6 receipt path is not git-ignored: ${rel} — ${ig.reason}`);
        log('  A committed receipt is a stale claim. Add it to .gitignore, then re-run.');
        return 1;
      }
    }
    const abs = path.join(REPO_ROOT, rel);
    const receipt = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      commit: git(['rev-parse', 'HEAD']).out || null,
      dirty: git(['status', '--porcelain']).out.length > 0,
      extensionVersion: readExtensionVersion(extDir),
      status,
      proofs: { total: proofDetail.length, green: greenProofs },
      tests: totals,
      durationMs: Date.now() - started,
      problems,
      proofDetail: proofDetail.map((p) => ({
        id: p.id,
        name: p.name,
        backing: p.backing,
        anchor: p.anchor,
        status: p.status,
        tests: p.tests,
      })),
    };
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, `${JSON.stringify(receipt, null, 2)}\n`);
      receiptPath = rel;
    } catch (e) {
      // Spec: a receipt that cannot be written = no trust ⇒ fatal.
      log(`✖ S6 could not write the receipt (${rel}): ${e.message}`);
      return 1;
    }
    log(`✓ S6 receipt written → ${rel}${receipt.dirty ? ' (tree dirty)' : ''}`);
  } else if (partial) {
    log('· S6 receipt skipped — a --proof subset must never be recorded as a full 7/7 run');
  } else {
    log('· S6 receipt skipped (--no-receipt)');
  }

  // ── S7 · report + exit ────────────────────────────────────────────────────────
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        { status, proofs: { total: proofDetail.length, green: greenProofs }, tests: totals, problems, receiptPath, proofDetail },
        null,
        2
      )}\n`
    );
  } else {
    process.stdout.write('\n');
    for (const p of proofDetail) {
      const mark = p.status === 'green' ? '✓' : '✖';
      const anchor = p.anchor === 'finding-id' ? 'ID' : 'regex';
      const n = p.clauses.reduce((a, c) => a + c.passing, 0);
      process.stdout.write(`${mark} ${p.id} ${p.name}  [${anchor} · ${n} tests]\n`);
      for (const r of p.reasons) process.stdout.write(`    ↳ ${r}\n`);
    }
    process.stdout.write(
      `\n${status === 'green' ? '✓ TRUST GREEN' : '✖ TRUST RED'} — ` +
        `${greenProofs}/${proofDetail.length} proofs · ${totals.pass}/${totals.total} tests · ` +
        `${((Date.now() - started) / 1000).toFixed(1)}s\n`
    );
    if (problems.length) {
      process.stdout.write('\nProblems:\n');
      for (const p of problems) process.stdout.write(`  · ${p}\n`);
    }
  }

  return status === 'green' ? 0 : 1;
}

function readExtensionVersion(extDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
}

module.exports = {
  parseJUnit,
  unescapeXml,
  loadManifest,
  validateManifest,
  proofFiles,
  sameFile,
  evaluateProofs,
  evaluateSkips,
  computeProblems,
  checkClassifyFreeze,
  parseArgs,
  main,
  MANIFEST_PATH,
  REPO_ROOT,
};

if (require.main === module) {
  process.exitCode = main();
}
