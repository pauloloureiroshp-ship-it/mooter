#!/usr/bin/env node
'use strict';

// Deterministic information-architecture doctor for Mooter handoffs.
//
// Default mode is intentionally warn-first: it reports drift but exits non-zero
// only for hard invariant violations (currently the frozen classifier SHA).
// `--strict` promotes warnings to a failing gate once the existing backlog has
// been triaged. The doctor is read-only and uses Node builtins only.

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const FROZEN_CLASSIFY_SHA = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';
const DEFAULTS = Object.freeze({ maxSyncLines: 220, maxActivePackets: 12, maxFindingFiles: 30 });
const STATUS_RE = /(?:^|\n)\s*(?:>|[-*]\s*)?(?:#{1,6}\s*)?(?:status|state|estado)\s*(?::|—|-|$)/im;
const OPERATIONAL_EXT_RE = /\.(?:bat|cmd|html?|js|json|log|ps1|txt)$/i;

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch { return []; }
}

function lineCount(text) {
  if (text == null || text === '') return 0;
  const source = String(text);
  const lines = source.split(/\r?\n/).length;
  return /\r?\n$/.test(source) ? lines - 1 : lines;
}

function sha256(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
  catch { return null; }
}

function gitLines(root, args) {
  try {
    return childProcess.execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch { return null; }
}

function finding(severity, code, message, files = [], evidence = {}) {
  return { severity, code, message, files, evidence };
}

function extractHandoffRefs(text) {
  const refs = new Set();
  const source = String(text || '');
  const re = /_handoff\/[A-Za-z0-9_./-]+\.(?:bat|cmd|js|json|md|mjs|ps1)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const ref = match[0].replace(/[.)\]}>,'";:]+$/g, '');
    if (!/[<*>]/.test(ref)) refs.add(ref);
  }
  return [...refs].sort();
}

function normalizedDigest(text) {
  const normalized = String(text || '')
    .replace(/^#.*$/m, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function inspectRepo(root, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const repo = path.resolve(root || path.join(__dirname, '..'));
  const handoffDir = path.join(repo, '_handoff');
  const findings = [];

  const classifier = path.join(repo, 'tools', 'router', 'classify.js');
  const classifierSha = sha256(classifier);
  if (classifierSha == null) {
    findings.push(finding('error', 'CLASSIFIER_MISSING', 'Frozen classifier could not be read.', ['tools/router/classify.js']));
  } else if (classifierSha !== (opts.expectedClassifierSha || FROZEN_CLASSIFY_SHA)) {
    findings.push(finding('error', 'CLASSIFIER_SHA_CHANGED', 'Frozen classifier SHA does not match the repository invariant.', ['tools/router/classify.js'], { actual: classifierSha, expected: opts.expectedClassifierSha || FROZEN_CLASSIFY_SHA }));
  }

  const syncFile = path.join(repo, 'SYNC.md');
  const syncText = readText(syncFile);
  const syncLines = lineCount(syncText);
  if (syncText == null) {
    findings.push(finding('error', 'SYNC_MISSING', 'SYNC.md is missing or unreadable.', ['SYNC.md']));
  } else if (syncLines > opts.maxSyncLines) {
    findings.push(finding('warn', 'SYNC_TOO_LONG', `SYNC.md has ${syncLines} lines; the canonical snapshot budget is about ${opts.maxSyncLines}.`, ['SYNC.md'], { lines: syncLines, max: opts.maxSyncLines }));
  }

  const topFiles = listFiles(handoffDir);
  const packets = topFiles.filter((name) => name.endsWith('.md'));
  const readGitLines = typeof opts.gitLines === 'function' ? opts.gitLines : gitLines;
  const untracked = readGitLines(repo, ['ls-files', '--others', '--exclude-standard', '--', '_handoff/*.md']);
  const untrackedTopPackets = untracked == null ? null : untracked.filter((rel) => path.posix.dirname(rel) === '_handoff');
  if (packets.length > opts.maxActivePackets) {
    findings.push(finding('warn', 'HANDOFF_QUEUE_CROWDED', `_handoff/ has ${packets.length} top-level Markdown packets; active work is no longer glanceable.`, packets.slice(0, opts.maxFindingFiles).map((name) => `_handoff/${name}`), { count: packets.length, max: opts.maxActivePackets, omitted: Math.max(0, packets.length - opts.maxFindingFiles) }));
  }
  if (untrackedTopPackets && untrackedTopPackets.length) {
    findings.push(finding('warn', 'HANDOFF_PACKETS_UNTRACKED', `${untrackedTopPackets.length} active packets are untracked and can be lost outside any commit/handoff.`, untrackedTopPackets.slice(0, opts.maxFindingFiles), { count: untrackedTopPackets.length, omitted: Math.max(0, untrackedTopPackets.length - opts.maxFindingFiles) }));
  }

  const missingStatus = [];
  const brokenRefs = [];
  const digestToFiles = new Map();
  for (const name of packets) {
    const rel = `_handoff/${name}`;
    const text = readText(path.join(handoffDir, name));
    if (text == null) continue;
    const head = text.split(/\r?\n/).slice(0, 40).join('\n');
    if (!STATUS_RE.test(head)) missingStatus.push(rel);
    for (const ref of extractHandoffRefs(text)) {
      if (!fs.existsSync(path.join(repo, ref))) brokenRefs.push({ from: rel, ref });
    }
    const digest = normalizedDigest(text);
    if (digest) {
      const same = digestToFiles.get(digest) || [];
      same.push(rel);
      digestToFiles.set(digest, same);
    }
  }
  if (missingStatus.length) {
    findings.push(finding('warn', 'HANDOFF_STATUS_MISSING', `${missingStatus.length} active packets do not declare STATUS/STATE/ESTADO in their first 40 lines.`, missingStatus.slice(0, opts.maxFindingFiles), { count: missingStatus.length, omitted: Math.max(0, missingStatus.length - opts.maxFindingFiles) }));
  }
  if (brokenRefs.length) {
    findings.push(finding('warn', 'HANDOFF_BROKEN_REFS', `${brokenRefs.length} references from active packets point to missing paths.`, brokenRefs.slice(0, opts.maxFindingFiles).map((item) => `${item.from} -> ${item.ref}`), { count: brokenRefs.length, omitted: Math.max(0, brokenRefs.length - opts.maxFindingFiles) }));
  }

  const duplicateGroups = [...digestToFiles.values()].filter((files) => files.length > 1);
  if (duplicateGroups.length) {
    findings.push(finding('warn', 'HANDOFF_EXACT_DUPLICATES', `${duplicateGroups.length} normalized duplicate packet group(s) exist in the active queue.`, duplicateGroups.flat().slice(0, opts.maxFindingFiles), { groups: duplicateGroups.slice(0, 10) }));
  }

  const operational = topFiles.filter((name) => OPERATIONAL_EXT_RE.test(name) && !name.endsWith('.md'));
  if (operational.length) {
    findings.push(finding('warn', 'HANDOFF_ROOT_OPERATIONAL_FILES', `${operational.length} logs/scripts/generated artifacts live beside active packets; move them to a scoped run directory or archive after human review.`, operational.slice(0, opts.maxFindingFiles).map((name) => `_handoff/${name}`), { count: operational.length, omitted: Math.max(0, operational.length - opts.maxFindingFiles) }));
  }

  const deletionBuckets = ['_handoff/_to_delete', '_to_delete'];
  const nonEmptyDeletionBuckets = deletionBuckets.filter((rel) => {
    try { return fs.readdirSync(path.join(repo, rel)).length > 0; } catch { return false; }
  });
  if (nonEmptyDeletionBuckets.length) {
    findings.push(finding('warn', 'PENDING_DELETION_BUCKETS', 'Deletion buckets are non-empty; they are neither an archive nor an explicit active queue.', nonEmptyDeletionBuckets));
  }

  const severityCounts = { error: 0, warn: 0, info: 0 };
  for (const item of findings) severityCounts[item.severity] = (severityCounts[item.severity] || 0) + 1;
  return {
    version: 1,
    root: repo,
    ok: severityCounts.error === 0,
    summary: {
      active_packets: packets.length,
      untracked_active_packets: untrackedTopPackets == null ? null : untrackedTopPackets.length,
      top_level_handoff_files: topFiles.length,
      sync_lines: syncLines,
      classifier_sha: classifierSha,
      findings: severityCounts,
    },
    findings,
  };
}

function exitCode(report, strict) {
  if ((report.summary.findings.error || 0) > 0) return 2;
  if (strict && (report.summary.findings.warn || 0) > 0) return 2;
  return 0;
}

function renderHuman(report) {
  const s = report.summary;
  const untracked = s.untracked_active_packets == null ? 'git n/d' : `${s.untracked_active_packets} untracked`;
  const lines = [
    `handoff hygiene: ${s.active_packets} active packets (${untracked}) · ${s.top_level_handoff_files} top-level files · SYNC ${s.sync_lines} lines`,
    `classifier sha: ${s.classifier_sha || 'unavailable'}`,
  ];
  if (!report.findings.length) lines.push('PASS: no drift detected.');
  for (const item of report.findings) {
    lines.push(`${item.severity.toUpperCase()} ${item.code}: ${item.message}`);
    for (const file of item.files.slice(0, 8)) lines.push(`  - ${file}`);
    if (item.files.length > 8) lines.push(`  - ... ${item.files.length - 8} more`);
  }
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const out = { root: path.join(__dirname, '..'), json: false, strict: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--strict') out.strict = true;
    else if (arg === '--root' && argv[i + 1]) out.root = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); }
  catch (error) { process.stderr.write(`${error.message}\n`); return 2; }
  if (args.help) {
    process.stdout.write('Usage: node tools/docs-hygiene.js [--json] [--strict] [--root PATH]\n');
    return 0;
  }
  const report = inspectRepo(args.root);
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : renderHuman(report));
  return exitCode(report, args.strict);
}

module.exports = {
  DEFAULTS,
  FROZEN_CLASSIFY_SHA,
  STATUS_RE,
  exitCode,
  extractHandoffRefs,
  inspectRepo,
  gitLines,
  lineCount,
  normalizedDigest,
  parseArgs,
  renderHuman,
  main,
};

if (require.main === module) process.exit(main());
