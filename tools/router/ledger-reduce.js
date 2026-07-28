#!/usr/bin/env node
// ledger-reduce.js — Moo Ledger Spine L1: the SINGLE reducer.
//
// The journal is the truth; Markdown is a PROJECTION of it. This kills direct,
// concurrent writes to a shared MD: N moos EMIT `kind:handoff` events into the
// per-session journal, and this one reducer materializes `_handoff/guardian/
// <sid>.md` from the LAST such event — atomically (tmp+rename).
//
// DETERMINISTIC REPLAY: the same sequence of events always yields the same MD,
// because the projection is a pure function of the last handoff event's payload.
// (MOO_LEDGER_AND_ORCHESTRATION.md — replay determinístico, fork barato, lineage.)
//
// Never throws (best-effort doctrine, like the rest of the spine).

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const journal = require('./handoff-journal.js');

const REDUCER_PROTOCOL_VERSION = 'mooter-ledger-reducer.v1';
const LOCK_SCHEMA_VERSION = 'mooter-ledger-lock.v1';
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_WAIT_MS = 30_000;

function runtimeId(opts = {}) {
  return opts.runtime || `${process.platform}:${process.arch}`;
}

function nonce(opts = {}) {
  return opts.nonce || crypto.randomBytes(12).toString('hex');
}

function fsyncDirSync(dir, opts = {}) {
  const open = opts.openSync || fs.openSync;
  const fsync = opts.fsyncSync || fs.fsyncSync;
  const close = opts.closeSync || fs.closeSync;
  let fd;
  try {
    fd = open(dir, 'r');
    fsync(fd);
    return true;
  } catch (err) {
    // Node on Windows cannot fsync directory handles (EPERM). The call is still
    // attempted; file fsync + atomic rename remain the strongest native Node
    // durability primitive there. Other failures are real transaction errors.
    if (process.platform === 'win32' && err && (err.code === 'EPERM' || err.code === 'EINVAL')) return false;
    throw err;
  } finally {
    if (fd != null) {
      try { close(fd); } catch { /* best effort close */ }
    }
  }
}

function atomicWriteFileSync(file, data, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${nonce(opts)}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, file);
    fsyncDirSync(path.dirname(file), opts);
  } catch (err) {
    if (fd != null) {
      try { fs.closeSync(fd); } catch { /* best effort close */ }
    }
    try { fs.unlinkSync(tmp); } catch { /* absent or already renamed */ }
    throw err;
  }
}

function appendFileDurablySync(file, data, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existed = fs.existsSync(file);
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (!existed) fsyncDirSync(path.dirname(file), opts);
}

function lockOwner(opts = {}) {
  const now = opts.now == null ? Date.now() : Number(opts.now);
  const leaseMs = opts.leaseMs == null ? DEFAULT_LEASE_MS : Number(opts.leaseMs);
  return {
    schema_version: LOCK_SCHEMA_VERSION,
    owner: {
      pid: opts.pid == null ? process.pid : Number(opts.pid),
      host: opts.host || os.hostname(),
      runtime: runtimeId(opts),
      nonce: nonce(opts),
    },
    acquired_at_ms: now,
    lease_expires_at_ms: now + leaseMs,
  };
}

function readLock(lockPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return parsed && parsed.owner ? parsed : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    return null;
  }
}

function createLock(lockPath, owner, opts = {}) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(owner, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fsyncDirSync(path.dirname(lockPath), opts);
    return { ok: true, lockPath, metadata: owner, recovered: null };
  } catch (err) {
    if (fd != null) {
      try { fs.closeSync(fd); } catch { /* best effort close */ }
    }
    if (err && err.code === 'EEXIST') return { ok: false, reason: 'lock-exists' };
    throw err;
  }
}

function acquireFileLock(lockPath, opts = {}) {
  const owner = lockOwner(opts);
  const first = createLock(lockPath, owner, opts);
  if (first.ok) return first;

  const holder = readLock(lockPath);
  if (!holder) return { ok: false, reason: 'lock-invalid-human-audit', holder: null };
  const now = opts.now == null ? Date.now() : Number(opts.now);
  if (!(Number(holder.lease_expires_at_ms) < now)) {
    return { ok: false, reason: 'lock-held', holder };
  }
  if (holder.owner.host !== owner.owner.host || holder.owner.runtime !== owner.owner.runtime) {
    return { ok: false, reason: 'human-audit-required', holder };
  }
  const aliveProbe = typeof opts.isProcessAlive === 'function' ? opts.isProcessAlive : isProcessAlive;
  if (aliveProbe(holder.owner.pid) !== false) {
    return { ok: false, reason: 'lock-owner-not-proven-dead', holder };
  }

  const audit = `${lockPath}.expired.${holder.owner.nonce || 'unknown'}.${owner.owner.nonce}.json`;
  try {
    fs.renameSync(lockPath, audit);
    fsyncDirSync(path.dirname(lockPath), opts);
  } catch (err) {
    if (err && err.code === 'ENOENT') return acquireFileLock(lockPath, opts);
    throw err;
  }
  const recovered = createLock(lockPath, owner, opts);
  if (!recovered.ok) return { ...recovered, holder };
  recovered.recovered = audit;
  return recovered;
}

function releaseFileLock(handle, opts = {}) {
  if (!handle || !handle.ok || !handle.metadata) return false;
  const current = readLock(handle.lockPath);
  if (!current || current.owner.nonce !== handle.metadata.owner.nonce) return false;
  fs.unlinkSync(handle.lockPath);
  fsyncDirSync(path.dirname(handle.lockPath), opts);
  return true;
}

function sleepSync(ms) {
  if (ms <= 0) return;
  const gate = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(gate, 0, 0, ms);
}

function withFileLock(lockPath, fn, opts = {}) {
  const waitMs = opts.waitMs == null ? DEFAULT_WAIT_MS : Number(opts.waitMs);
  const started = Date.now();
  let handle;
  while (true) {
    handle = acquireFileLock(lockPath, opts);
    if (handle.ok) break;
    // A concurrent O_EXCL creator may be between file creation and the fsynced
    // metadata write. Re-read that boundedly; never delete/recover an invalid
    // lock. A persistently invalid lock still ends at the human-audit error.
    const retryable = handle.reason === 'lock-held' ||
      handle.reason === 'lock-owner-not-proven-dead' ||
      handle.reason === 'lock-invalid-human-audit';
    if (!retryable || Date.now() - started >= waitMs) {
      const err = new Error(`ledger lock unavailable: ${handle.reason}`);
      err.code = 'MOOTER_LEDGER_LOCKED';
      err.lock = handle;
      throw err;
    }
    sleepSync(Math.min(20, Math.max(1, waitMs - (Date.now() - started))));
  }
  try {
    return fn(handle);
  } finally {
    releaseFileLock(handle, opts);
  }
}

function _safeId(id) { return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }

function materializeProjectionFile(file, data, opts = {}) {
  atomicWriteFileSync(file, data, opts);
  return { ok: true, file, bytes: Buffer.byteLength(String(data), 'utf8') };
}

function materializeProjectionFiles(entries, opts = {}) {
  const written = [];
  for (const entry of (Array.isArray(entries) ? entries : [])) {
    if (!entry || !entry.file) continue;
    written.push(materializeProjectionFile(entry.file, entry.data == null ? '' : entry.data, opts));
  }
  return written;
}

function _reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// PURE: stable handoff projection used by every producer, including the VSIX.
function projectSyncHandoff(base, payload = {}) {
  const sid = String(payload.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!sid) return null;
  const name = String(payload.name || sid).replace(/[\r\n]+/g, ' ').slice(0, 60);
  const timestamp = String(payload.timestamp || '').replace(/[\r\n]+/g, ' ').slice(0, 32);
  const start = `<!-- mooter-handoff:${sid} -->`;
  const end = `<!-- /mooter-handoff:${sid} -->`;
  const block = `${start}\n### ⇄ Handoff · ${name} · ${timestamp}\n\n\`\`\`\n${String(payload.text || '')}\n\`\`\`\n${end}`;
  let source = String(base || '');
  const re = new RegExp(_reEsc(start) + '[\\s\\S]*?' + _reEsc(end));
  if (re.test(source)) return source.replace(re, block);
  if (!source.trim()) source = '# Mooter — Sync Snapshot\n';
  return source.replace(/\s*$/, '') + '\n\n' + block + '\n';
}

function reduceSyncHandoff(root, payload, opts = {}) {
  if (!root || typeof root !== 'string') return { ok: false, reason: 'no-root' };
  if (!payload || !String(payload.sid || '').replace(/[^a-zA-Z0-9._-]/g, '')) {
    return { ok: false, reason: 'no-sid' };
  }
  const file = path.join(root, 'SYNC.md');
  const lockPath = opts.lockPath || path.join(root, '_handoff', 'agent-sync', '.writer.lock');
  try {
    return withFileLock(lockPath, () => {
      let base = '';
      let created = false;
      try { base = fs.readFileSync(file, 'utf8'); } catch { created = true; }
      const projected = projectSyncHandoff(base, payload);
      materializeProjectionFile(file, projected, opts);
      return { ok: true, path: file, created, bytes: Buffer.byteLength(projected, 'utf8') };
    }, opts.lock || {});
  } catch (err) {
    return { ok: false, reason: err && err.code === 'MOOTER_LEDGER_LOCKED' ? 'locked' : 'write-failed' };
  }
}

// PURE: replace the current snapshot metadata/truth as one deterministic projection.
function projectSyncSnapshot(base, payload = {}) {
  let source = String(base || '');
  if (!source.trim()) source = '# Mooter — Sync Snapshot\n';
  const metadata = String(payload.metadata || '').trim();
  if (metadata) {
    const metadataRe = /\*\*Atualizado:\*\*[\s\S]*?(?=\n\n## Verdade atual)/;
    source = metadataRe.test(source)
      ? source.replace(metadataRe, metadata)
      : source.replace(/^(# [^\n]+\n)/, `$1\n${metadata}\n`);
  }
  if (Array.isArray(payload.truth)) {
    const truth = payload.truth.map((line) => `- ${String(line).trim()}`).join('\n');
    const section = `## Verdade atual\n\n${truth}\n`;
    const sectionRe = /## Verdade atual\n[\s\S]*?(?=\n## |$)/;
    source = sectionRe.test(source)
      ? source.replace(sectionRe, section)
      : source.replace(/\s*$/, '') + `\n\n${section}`;
  }
  return source;
}

function reduceSyncSnapshot(root, payload, opts = {}) {
  if (!root || typeof root !== 'string') return { ok: false, reason: 'no-root' };
  const file = path.join(root, 'SYNC.md');
  const lockPath = opts.lockPath || path.join(root, '_handoff', 'agent-sync', '.writer.lock');
  try {
    return withFileLock(lockPath, () => {
      let base = '';
      try { base = fs.readFileSync(file, 'utf8'); } catch { /* new snapshot */ }
      const projected = projectSyncSnapshot(base, payload);
      materializeProjectionFile(file, projected, opts);
      return { ok: true, path: file, bytes: Buffer.byteLength(projected, 'utf8') };
    }, opts.lock || {});
  } catch (err) {
    return { ok: false, reason: err && err.code === 'MOOTER_LEDGER_LOCKED' ? 'locked' : 'write-failed' };
  }
}

function handleProtocolRequest(request) {
  if (!request || request.protocol_version !== REDUCER_PROTOCOL_VERSION) {
    return { ok: false, reason: 'incompatible-protocol', protocol_version: REDUCER_PROTOCOL_VERSION };
  }
  if (request.operation === 'sync-handoff-upsert') {
    return reduceSyncHandoff(request.root, request.payload || {}, request.options || {});
  }
  if (request.operation === 'sync-snapshot-refresh') {
    return reduceSyncSnapshot(request.root, request.payload || {}, request.options || {});
  }
  return { ok: false, reason: 'unknown-operation', protocol_version: REDUCER_PROTOCOL_VERSION };
}

// Where the reducer writes projections. Env-overridable for tests/sandbox;
// default is the repo's `_handoff/guardian/` (this file lives at tools/router/,
// so repo root is two levels up — matches the Guardian's existing convention).
function defaultOutDir() {
  if (process.env.MOOTER_HANDOFF_OUT_DIR && process.env.MOOTER_HANDOFF_OUT_DIR.length > 0) {
    return process.env.MOOTER_HANDOFF_OUT_DIR;
  }
  return path.resolve(__dirname, '..', '..', '_handoff', 'guardian');
}

// PURE: the Markdown body for a single `kind:handoff` event. The journal is the
// truth, so the body lives in the event's `output` payload. Accepts a raw string,
// or an object carrying { markdown } / { body } (the structured shape moos emit).
// Returns null when there is no renderable body (caller skips — never fabricates).
function projectHandoffMarkdown(ev) {
  if (!ev) return null;
  const out = ev.output;
  if (typeof out === 'string') return out;
  if (out && typeof out === 'object') {
    if (typeof out.markdown === 'string') return out.markdown;
    if (typeof out.body === 'string') return out.body;
  }
  return null;
}

// PURE: given an ordered event list, project the body of the LAST handoff event.
// Deterministic — same events in → same body out. null when none/empty.
function projectFromEvents(events) {
  let last = null;
  for (const e of (Array.isArray(events) ? events : [])) {
    if (e && e.kind === 'handoff') last = e;
  }
  return projectHandoffMarkdown(last);
}

// Reduce a session's journal → `<sid>.md`, atomically. Reads the last
// `kind:handoff` event and writes its projected body. Returns a result object;
// never throws. Skips (ok:false) when there is no handoff event or no body —
// it never writes an empty/fabricated file.
function reduceSession(sid, opts = {}) {
  try {
    if (!sid) return { ok: false, reason: 'no-sid' };
    const ev = journal.lastEventOfKind(sid, 'handoff');
    if (!ev) return { ok: false, reason: 'no-handoff-event' };
    const md = projectHandoffMarkdown(ev);
    if (md == null) return { ok: false, reason: 'no-body' };

    const outDir = opts.outDir || defaultOutDir();
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, _safeId(sid) + '.md');
    atomicWriteFileSync(file, md, opts);
    return { ok: true, file, bytes: Buffer.byteLength(md, 'utf8') };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

module.exports = {
  REDUCER_PROTOCOL_VERSION,
  LOCK_SCHEMA_VERSION,
  atomicWriteFileSync,
  appendFileDurablySync,
  acquireFileLock,
  releaseFileLock,
  withFileLock,
  fsyncDirSync,
  isProcessAlive,
  materializeProjectionFile,
  materializeProjectionFiles,
  projectSyncHandoff,
  reduceSyncHandoff,
  projectSyncSnapshot,
  reduceSyncSnapshot,
  handleProtocolRequest,
  reduceSession,
  projectHandoffMarkdown,
  projectFromEvents,
  defaultOutDir,
};

// CLI: `node ledger-reduce.js <sid> [outDir]` — one-shot projection. Best-effort.
if (require.main === module) {
  if (process.argv[2] === '--protocol-version') {
    process.stdout.write(REDUCER_PROTOCOL_VERSION + '\n');
    process.exit(0);
  }
  if (process.argv[2] === '--request') {
    let r;
    try { r = handleProtocolRequest(JSON.parse(fs.readFileSync(0, 'utf8'))); }
    catch { r = { ok: false, reason: 'invalid-request', protocol_version: REDUCER_PROTOCOL_VERSION }; }
    try { process.stdout.write(JSON.stringify(r) + '\n'); } catch { /* ignore */ }
    process.exit(r.ok ? 0 : 1);
  }
  const sid = process.argv[2];
  const outDir = process.argv[3];
  const r = reduceSession(sid, outDir ? { outDir } : {});
  try { process.stdout.write(JSON.stringify(r) + '\n'); } catch { /* ignore */ }
  process.exit(r.ok ? 0 : 1);
}
