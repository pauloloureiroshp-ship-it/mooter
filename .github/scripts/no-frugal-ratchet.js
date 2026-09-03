#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

const LIVE_CODE_SCOPES = ['tools', 'packages', 'hub', 'landing', 'scripts'];
const ZERO_SHA = /^0+$/;

const fs = require('node:fs');
const path = require('node:path');
const EXEMPT_FILE = path.join(__dirname, '..', 'no-frugal-exempt.json');

/**
 * Not every 'frugal' is rebrand debt. Some are live identifiers the product
 * still depends on — legacy env vars the code reads as a fallback, the
 * Cloudflare account subdomain inside the production hub URL, captured real
 * paths. A file counts against the ratchet only when it holds at least one
 * occurrence that NONE of the exempt patterns explains. Without this the gate
 * blocks a PR for naming a hostname we serve traffic on, and a gate that
 * punishes the truth teaches people to route around it.
 */
function loadExemptions(file = EXEMPT_FILE) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return []; // absent file → no exemptions, i.e. the strict original behaviour
  }
  return (JSON.parse(raw).exempt || []).map((e) => new RegExp(e.pattern, 'gi'));
}

/** True when every 'frugal' on this line is explained by an exemption. */
function lineIsExplained(line, exemptions) {
  let rest = line;
  for (const re of exemptions) {
    re.lastIndex = 0;
    rest = rest.replace(re, '');
  }
  return !/frugal/i.test(rest);
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd,
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return result;
}

function commitExists(ref, cwd) {
  return runGit(['cat-file', '-e', `${ref}^{commit}`], { cwd }).status === 0;
}

function resolveBaseRef(baseRef, headRef, cwd) {
  // `github.event.before` names a commit that no longer exists after a
  // force-push. Without this check the gate throws instead of judging — a
  // guard that errors is not a guard, so fall back to the parent commit.
  if (baseRef && !ZERO_SHA.test(baseRef) && commitExists(baseRef, cwd)) return baseRef;
  const parent = runGit(['rev-parse', `${headRef}^`], { cwd });
  if (parent.status !== 0) {
    throw new Error(`cannot resolve a comparison base for ${headRef}: ${parent.stderr.trim()}`);
  }
  return parent.stdout.trim();
}

function mergeBase(baseRef, headRef, cwd) {
  const resolvedBase = resolveBaseRef(baseRef, headRef, cwd);
  const result = runGit(['merge-base', resolvedBase, headRef], { cwd });
  if (result.status !== 0) {
    throw new Error(`git merge-base ${resolvedBase} ${headRef} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function matchingFiles(ref, cwd, exemptions) {
  const exempt = exemptions === undefined ? loadExemptions() : exemptions;
  // -n so we can read each matching LINE: a file is debt only when at least one
  // of its matches is not an exempt identifier.
  const result = runGit(
    ['grep', '-Iin', '--full-name', '-e', 'frugal', ref, '--', ...LIVE_CODE_SCOPES],
    { cwd, encoding: null }
  );
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(`git grep failed for ${ref}: ${result.stderr.toString('utf8').trim()}`);
  }
  const prefix = `${ref}:`;
  const debt = new Set();
  for (const rawLine of result.stdout.toString('utf8').split(String.fromCharCode(10))) {
    if (!rawLine) continue;
    const body = rawLine.startsWith(prefix) ? rawLine.slice(prefix.length) : rawLine;
    const m = /^(.*?):([0-9]+):([\s\S]*)$/.exec(body);
    if (!m) continue;
    if (lineIsExplained(m[3], exempt)) continue;
    debt.add(m[1]);
  }
  return [...debt];
}

function evaluateRatchet({ baseRef, headRef = 'HEAD', cwd = process.cwd() }) {
  const base = mergeBase(baseRef, headRef, cwd);
  const baseFiles = matchingFiles(base, cwd);
  const headFiles = matchingFiles(headRef, cwd);
  return {
    base,
    head: runGit(['rev-parse', headRef], { cwd }).stdout.trim(),
    baseCount: baseFiles.length,
    headCount: headFiles.length,
    addedFiles: headFiles.filter((file) => !baseFiles.includes(file)),
  };
}

function parseArgs(argv) {
  const parsed = { headRef: 'HEAD' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') parsed.baseRef = argv[++i];
    else if (argv[i] === '--head') parsed.headRef = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return parsed;
}

function main() {
  const result = evaluateRatchet(parseArgs(process.argv.slice(2)));
  console.log(`live-code files containing 'frugal': ${result.baseCount} (merge-base ${result.base.slice(0, 12)}) -> ${result.headCount} (head ${result.head.slice(0, 12)})`);
  if (result.headCount > result.baseCount) {
    console.error(`::error::frugal references INCREASED (${result.headCount} > ${result.baseCount}). Added matching files: ${result.addedFiles.join(', ') || 'n/d'}`);
    process.exitCode = 1;
  } else if (result.headCount < result.baseCount) {
    console.log(`::notice::frugal references decreased (${result.baseCount} -> ${result.headCount}); the ratchet tightened automatically.`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`::error::no-frugal ratchet could not run: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = {
  loadExemptions,
  lineIsExplained, evaluateRatchet, matchingFiles, mergeBase };
