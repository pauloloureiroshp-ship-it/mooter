'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');

const sync = require('./agent-sync-ledger.js');

function write(root, rel, text) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, text);
  return fp;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-'));
  write(root, 'AGENTS.md', '# Agents\n');
  const classify = write(root, 'tools/router/classify.js', 'module.exports = {}\n');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(classify)).digest('hex');
  return { root, sha };
}

function vaultFixture() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-vault-'));
  write(vault, 'AGENTS.md', '# Vault\n');
  fs.mkdirSync(path.join(vault, '00-core'), { recursive: true });
  fs.mkdirSync(path.join(vault, '10-projects'), { recursive: true });
  write(vault, '00-core/agent-sync-protocol.md', '# Agent sync protocol\n');
  return vault;
}

function completeEvent(root, overrides) {
  return sync.normalizeEvent({
    id: 'event-complete-1',
    agent: 'codex',
    recorded_by: 'codex',
    provider: 'openai',
    model: 'gpt-5',
    channel: 'subscription',
    kind: 'outcome',
    cadence: 'checkpoint',
    status: 'done',
    summary: 'validated cross-device receipt flow',
    next: 'review the remote branch',
    evidence: 'code,test,git',
    started_at: '2026-07-29T12:00:00.000Z',
    ended_at: '2026-07-29T12:00:02.500Z',
    device_id: 'device-test-1',
    device_name: 'Mac mini test',
    device_platform: 'darwin',
    device_arch: 'arm64',
    source: 'unit-test',
    ...overrides,
  }, { root, git: false, classify: false, now: '2026-07-29T12:00:02.500Z' });
}

test('global ledger override remains isolated per real repo/worktree root', () => {
  const a = fixture();
  const b = fixture();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-global-'));
  const previous = process.env.MOOTER_AGENT_SYNC_DIR;
  try {
    process.env.MOOTER_AGENT_SYNC_DIR = parent;
    const dirA = sync.defaultDir(a.root);
    const dirB = sync.defaultDir(b.root);
    assert.strictEqual(path.dirname(dirA), parent);
    assert.strictEqual(path.dirname(dirB), parent);
    assert.notStrictEqual(dirA, dirB, 'two roots never co-mingle into one global ledger');
    assert.strictEqual(sync.defaultDir(a.root), dirA, 'the per-root key is stable');
  } finally {
    if (previous == null) delete process.env.MOOTER_AGENT_SYNC_DIR;
    else process.env.MOOTER_AGENT_SYNC_DIR = previous;
    fs.rmSync(a.root, { recursive: true, force: true });
    fs.rmSync(b.root, { recursive: true, force: true });
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('normalizeEvent clamps and normalizes agent/cadence/status', () => {
  const { root } = fixture();
  try {
    const ev = sync.normalizeEvent({
      agent: 'roo',
      cadence: 'prompt',
      status: 'ready',
      summary: '  hello   world  ',
      files: 'a.js,b.js',
      device_id: 'device-test-1',
      device_name: 'Mac mini test',
      device_platform: 'darwin',
      device_arch: 'arm64',
    }, { root, git: false, classify: false, now: '2026-07-09T00:00:00.000Z' });
    assert.equal(ev.agent, 'gemini-roo');
    assert.equal(ev.cadence, 'prompt');
    assert.equal(ev.status, 'ready');
    assert.equal(ev.kind, 'sync');
    assert.equal(ev.summary, 'hello world');
    assert.deepEqual(ev.files, ['a.js', 'b.js']);
    assert.deepEqual(ev.device, {
      id: 'device-test-1',
      name: 'Mac mini test',
      platform: 'darwin',
      arch: 'arm64',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizeEvent captures typed brief contract', () => {
  const { root } = fixture();
  try {
    const ev = sync.normalizeEvent({
      agent: 'cc',
      kind: 'brief',
      status: 'ready',
      to: 'codex,roo,moo',
      task: 'review the sync protocol',
      context: 'use the same ledger snapshot',
      deliverable: 'return compact evidence',
      evidence: 'doc,handoff,unknown-kind',
      confidence: 'high',
      acceptance: 'no fabricated connector access',
      guard: 'do not edit classify.js',
    }, { root, git: false, classify: false, now: '2026-07-09T00:00:00.000Z' });
    assert.equal(ev.agent, 'claude-code');
    assert.equal(ev.kind, 'brief');
    assert.deepEqual(ev.target_agents, ['codex', 'gemini-roo', 'ollama']);
    assert.deepEqual(ev.evidence, ['doc', 'handoff']);
    assert.equal(ev.confidence, 'high');
    assert.equal(ev.brief.task, 'review the sync protocol');
    assert.deepEqual(ev.acceptance, ['no fabricated connector access']);
    assert.deepEqual(ev.guard, ['do not edit classify.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('help is read-only even when attached to a mutating command', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const out = sync.command(['record', '--help', '--root', root, '--dir', dir]);
    assert.match(out, /Help is read-only/);
    assert.equal(fs.existsSync(path.join(dir, 'events.jsonl')), false);

    const globalHelp = sync.command(['help', '--root', root, '--dir', dir]);
    assert.match(globalHelp, /Usage:/);
    assert.equal(fs.existsSync(path.join(dir, 'events.jsonl')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizeEvent records an honest execution window and derives duration', () => {
  const { root } = fixture();
  try {
    const ev = completeEvent(root);
    assert.equal(ev.started_at, '2026-07-29T12:00:00.000Z');
    assert.equal(ev.ended_at, '2026-07-29T12:00:02.500Z');
    assert.equal(ev.duration_ms, 2500);
    assert.equal(ev.timing_basis, 'wall_clock');
    assert.equal(ev.recorded_by, 'codex');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('device lookup is read-only and never triggers legacy credential migration', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-home-'));
  try {
    write(home, '.frugal/auth.token', 'placeholder-not-a-real-secret\n');
    write(home, '.frugal/device.id', 'legacy-device-test\n');
    const script = [
      `const sync=require(${JSON.stringify(path.join(__dirname, 'agent-sync-ledger.js'))});`,
      'process.stdout.write(JSON.stringify(sync.deviceSnapshot({}, {})));',
    ].join('');
    const run = childProcess.spawnSync(process.execPath, ['-e', script], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0);
    assert.equal(JSON.parse(run.stdout).id, 'legacy-device-test');
    assert.equal(fs.existsSync(path.join(home, '.frugal', 'auth.token')), true);
    assert.equal(fs.existsSync(path.join(home, '.mooter', 'auth.token')), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('audit separates invalid identity from completeness warnings', () => {
  const { root } = fixture();
  try {
    const valid = completeEvent(root);
    const invalid = sync.normalizeEvent({
      id: 'event-invalid-1',
      agent: 'ollama',
      summary: 'local run returned safely',
      status: 'done',
      source: 'host-orchestrator',
      device_id: 'device-test-1',
      device_name: 'Mac mini test',
      device_platform: 'darwin',
      device_arch: 'arm64',
    }, { root, git: false, classify: false, now: '2026-07-29T12:00:03.000Z' });
    const audit = sync.auditEvents([valid, invalid]);
    assert.equal(audit.ok, false);
    assert.equal(audit.valid_count, 1);
    assert.ok(audit.rows[1].errors.includes('provider_missing'));
    assert.ok(audit.rows[1].errors.includes('model_missing'));
    assert.ok(audit.rows[1].errors.includes('execution_channel_unknown'));
    assert.ok(audit.rows[1].errors.includes('local_model_recorder_missing'));
    assert.ok(audit.rows[0].warnings.includes('git_snapshot_missing'));
    assert.match(sync.renderAuditReport(audit), /EVENT_AUDIT=fail/);
    assert.match(sync.renderAuditReport(audit), /FLEET_COVERAGE=not_checked/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('secret detector fails closed before a vault receipt is published', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  try {
    const event = completeEvent(root, { summary: 'token=super-secret-value-123456' });
    const result = sync.publishVault(root, [event], { vault, project: 'mooter' });
    assert.equal(result.ok, false);
    assert.equal(result.published.length, 0);
    assert.ok(result.skipped[0].errors.includes('possible_secret'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('vault receipts are immutable, idempotent and aggregatable by device', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  try {
    const event = completeEvent(root);
    const first = sync.publishVault(root, [event], { vault, project: 'mooter' });
    assert.equal(first.ok, true);
    assert.equal(first.published.length, 1);
    assert.match(first.published[0], /30-learnings\/agent-sync\/mooter\/device-test-1/);
    const text = fs.readFileSync(first.published[0], 'utf8');
    assert.match(text, /validated cross-device receipt flow/);
    assert.equal(sync.parseVaultReceipt(text).duration_ms, 2500);
    assert.match(sync.parseVaultReceipt(text).integrity_sha256, /^[a-f0-9]{64}$/);

    const second = sync.publishVault(root, [event], { vault, project: 'mooter' });
    assert.equal(second.published.length, 0);
    assert.equal(second.unchanged.length, 1);

    const status = sync.buildVaultStatus(vault, 'mooter');
    assert.equal(status.receipt_count, 1);
    assert.equal(status.latest_by_device['device-test-1'].receipt.event_id, 'event-complete-1');
    assert.match(sync.renderVaultStatus(status), /review the remote branch/);

    fs.appendFileSync(first.published[0], '\nchanged\n');
    assert.throws(
      () => sync.publishVault(root, [event], { vault, project: 'mooter' }),
      /receipt collision/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('vault receipt integrity rejects edited machine data', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  try {
    const event = completeEvent(root);
    const result = sync.publishVault(root, [event], { vault, project: 'mooter' });
    const original = fs.readFileSync(result.published[0], 'utf8');
    const tampered = original.replace('"summary":"validated cross-device receipt flow"', '"summary":"tampered"');
    const verified = sync.verifyVaultReceipt(tampered);
    assert.equal(verified.ok, false);
    assert.deepEqual(verified.errors, ['receipt_integrity_mismatch']);
    assert.equal(sync.parseVaultReceipt(tampered), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('vault resolver rejects an unrelated repository with only AGENTS.md', () => {
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'not-paulo-vault-'));
  try {
    write(unrelated, 'AGENTS.md', '# unrelated\n');
    assert.equal(sync.resolveVaultPath(unrelated), null);
  } finally {
    fs.rmSync(unrelated, { recursive: true, force: true });
  }
});

test('vault resolver rejects a lookalike vault without the canonical sync protocol', () => {
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'not-paulo-vault-'));
  try {
    write(unrelated, 'AGENTS.md', '# unrelated\n');
    fs.mkdirSync(path.join(unrelated, '00-core'), { recursive: true });
    fs.mkdirSync(path.join(unrelated, '10-projects'), { recursive: true });
    assert.equal(sync.resolveVaultPath(unrelated), null);
  } finally {
    fs.rmSync(unrelated, { recursive: true, force: true });
  }
});

test('vault receipt scan fails closed instead of silently truncating readiness', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  try {
    for (let i = 0; i < 3; i++) {
      sync.publishVault(root, [completeEvent(root, { id: `event-scan-${i}` })], { vault, project: 'mooter' });
    }
    assert.throws(
      () => sync.readVaultReceipts(vault, 'mooter', { maxFiles: 2 }),
      /scan limit exceeded.*refusing partial readiness/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('agent-sync doctor is read-only and fails closed until runtime, hook, vault and auto-publish exist', () => {
  const { root } = fixture();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agent-sync-doctor-'));
  const vault = vaultFixture();
  try {
    write(home, '.mooter/device.id', 'doctor-device\n');
    const before = fs.readdirSync(home, { recursive: true }).sort();
    const failed = sync.agentSyncDoctor(root, { home, vault });
    assert.equal(failed.ok, false);
    assert.ok(failed.checks.some((row) => row.id === 'runtime_installed' && !row.ok));
    assert.deepEqual(fs.readdirSync(home, { recursive: true }).sort(), before, 'doctor writes nothing');

    const runtimeContent = `// ${sync.RECEIPT_SCHEMA_VERSION}\n`;
    const hookContent = 'function accumulateAgentSync(){} // agent-sync-ledger\n';
    write(root, 'tools/router/agent-sync-ledger.js', runtimeContent);
    write(root, 'tools/router/gsd-turn-end.js', hookContent);
    write(home, '.claude/tools/router/agent-sync-ledger.js', runtimeContent);
    write(home, '.claude/hooks/gsd-turn-end.js', hookContent);
    write(home, '.claude/settings.json', JSON.stringify({
      hooks: { Stop: [{ hooks: [{ command: `"${process.execPath}" ~/.claude/hooks/gsd-turn-end.js` }] }] },
    }));
    write(vault, '00-core/agent-sync-registry.json', JSON.stringify({ project: 'mooter', devices: [] }));
    const previous = process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH;
    process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH = '1';
    try {
      const ready = sync.agentSyncDoctor(root, { home, vault });
      assert.equal(ready.ok, false, 'fixture classifier is intentionally not the frozen production SHA');
      assert.deepEqual(
        ready.checks.filter((row) => row.id !== 'classifier_frozen').map((row) => [row.id, row.ok]),
        ready.checks.filter((row) => row.id !== 'classifier_frozen').map((row) => [row.id, true])
      );
    } finally {
      if (previous == null) delete process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH;
      else process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH = previous;
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('cross-device readiness fails closed for pending, missing and stale devices', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  try {
    const event = completeEvent(root);
    sync.publishVault(root, [event], { vault, project: 'mooter' });
    const status = sync.buildVaultStatus(vault, 'mooter');
    const registryPath = write(vault, '00-core/agent-sync-registry.json', JSON.stringify({
      project: 'mooter',
      max_age_hours: 24,
      devices: [
        {
          label: 'mac-mini',
          status: 'active',
          device_id: 'device-test-1',
          hostname: 'Mac mini test',
          platform: 'darwin',
          arch: 'arm64',
          required_agents: ['codex'],
          required_providers: ['openai'],
          required_channels: ['subscription'],
        },
        {
          label: 'windows-rtx4090',
          status: 'pending',
          device_id: null,
          required_agents: [],
        },
      ],
    }));
    const pending = sync.auditFleet(status, sync.loadSyncRegistry(vault, registryPath), '2026-07-29T13:00:00.000Z');
    assert.equal(pending.ok, false);
    assert.ok(pending.errors.includes('windows-rtx4090:device_not_enrolled'));
    assert.ok(pending.errors.includes('windows-rtx4090:device_id_missing'));

    const stale = sync.auditFleet(status, {
      file: registryPath,
      registry: {
        project: 'mooter',
        max_age_hours: 1,
        devices: [{
          label: 'mac-mini',
          status: 'active',
          device_id: 'device-test-1',
          required_agents: ['codex'],
          required_providers: ['openai'],
        }],
      },
    }, '2026-07-30T13:00:00.000Z');
    assert.equal(stale.ok, false);
    assert.ok(stale.errors.includes('mac-mini:device_receipt_stale'));
    assert.ok(stale.errors.includes('mac-mini:provider_receipt_stale:openai'));

    const wrongProvider = sync.auditFleet(status, {
      file: registryPath,
      registry: {
        project: 'mooter',
        max_age_hours: 24,
        devices: [{
          label: 'mac-mini',
          status: 'active',
          device_id: 'device-test-1',
          required_agents: ['codex'],
          required_providers: ['anthropic'],
          required_channels: ['local'],
        }],
      },
    }, '2026-07-29T13:00:00.000Z');
    assert.equal(wrongProvider.ok, false);
    assert.ok(wrongProvider.errors.includes('mac-mini:provider_receipt_missing:anthropic'));
    assert.ok(wrongProvider.errors.includes('mac-mini:channel_receipt_missing:local'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('opt-in auto publish remains fail-soft and writes the same immutable receipt', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  const previous = {
    auto: process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH,
    vault: process.env.VAULT_PATH,
    project: process.env.MOOTER_AGENT_SYNC_PROJECT,
  };
  try {
    process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH = '1';
    process.env.VAULT_PATH = vault;
    process.env.MOOTER_AGENT_SYNC_PROJECT = 'mooter';
    sync.appendEvent(root, completeEvent(root), dir, { git: false, classify: false });
    assert.equal(sync.readVaultReceipts(vault, 'mooter').length, 1);
    assert.match(fs.readFileSync(path.join(dir, 'vault-projection.jsonl'), 'utf8'), /vault_local_published/);
    assert.match(fs.readFileSync(path.join(dir, 'vault-projection.jsonl'), 'utf8'), /"vault_remote":"pending"/);
  } finally {
    if (previous.auto == null) delete process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH;
    else process.env.MOOTER_AGENT_SYNC_VAULT_AUTO_PUBLISH = previous.auto;
    if (previous.vault == null) delete process.env.VAULT_PATH;
    else process.env.VAULT_PATH = previous.vault;
    if (previous.project == null) delete process.env.MOOTER_AGENT_SYNC_PROJECT;
    else process.env.MOOTER_AGENT_SYNC_PROJECT = previous.project;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('vault publish keeps prompt and turn telemetry local by default', () => {
  const { root } = fixture();
  const vault = vaultFixture();
  try {
    const event = completeEvent(root, { kind: 'turn', cadence: 'turn' });
    const result = sync.publishVault(root, [event], { vault, project: 'mooter' });
    assert.equal(result.ok, true);
    assert.equal(result.published.length, 0);
    assert.equal(result.filtered.length, 1);
    assert.equal(sync.readVaultReceipts(vault, 'mooter').length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('appendEvent writes events, snapshot, latest and prompts', () => {
  const { root, sha } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const ev = sync.normalizeEvent({
      agent: 'codex',
      cadence: 'checkpoint',
      status: 'in_progress',
      summary: 'implemented sync ledger',
      next: 'run tests',
      device_id: 'device-test-1',
      device_name: 'Mac mini test',
      device_platform: 'darwin',
      device_arch: 'arm64',
    }, { root, git: false, now: '2026-07-09T00:00:00.000Z' });
    ev.classify = { path: 'tools/router/classify.js', sha256: sha, intact: false };
    const snap = sync.appendEvent(root, ev, dir);
    assert.equal(snap.event_count, 1);
    assert.ok(fs.existsSync(path.join(dir, 'events.jsonl')));
    assert.ok(fs.existsSync(path.join(dir, 'snapshot.json')));
    assert.ok(fs.existsSync(path.join(dir, 'latest.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'gemini-roo.md')));
    assert.match(fs.readFileSync(path.join(dir, 'latest.md'), 'utf8'), /implemented sync ledger/);
    assert.equal(snap.latest_by_device['device-test-1'].agent, 'codex');
    assert.match(fs.readFileSync(path.join(dir, 'latest.md'), 'utf8'), /Latest By Device/);
    assert.match(fs.readFileSync(path.join(dir, 'latest.md'), 'utf8'), /Mac mini test/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ledger is append-only beyond the 400-event projection window', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    for (let i = 0; i < 405; i++) {
      const event = completeEvent(root, { id: `event-${i}` });
      sync.appendEvent(root, event, dir, { git: false, classify: false });
    }
    assert.equal(sync.readEvents(root, dir).length, 405);
    const snapshot = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8'));
    assert.equal(snapshot.event_count, 400);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('concurrent writers preserve every event and atomic projections', async () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const runs = Array.from({ length: 12 }, (_, index) => new Promise((resolve) => {
      const script = [
        `const s=require(${JSON.stringify(path.join(__dirname, 'agent-sync-ledger.js'))});`,
        `const root=${JSON.stringify(root)},dir=${JSON.stringify(dir)};`,
        `const event=s.normalizeEvent({id:"concurrent-${index}",agent:"codex",recorded_by:"codex",provider:"openai",model:"gpt-5",channel:"subscription",kind:"outcome",cadence:"checkpoint",status:"done",summary:"concurrent event ${index}",device_id:"device-test-1",device_name:"Mac mini test",device_platform:"darwin",device_arch:"arm64",source:"unit-test"},{root,git:false,classify:false,now:"2026-07-29T12:00:02.500Z"});`,
        's.appendEvent(root,event,dir,{git:false,classify:false});',
      ].join('');
      const child = childProcess.spawn(process.execPath, ['-e', script], {
        env: { ...process.env, HOME: root },
        stdio: 'ignore',
      });
      child.on('exit', (code) => resolve(code));
    }));
    assert.deepEqual(await Promise.all(runs), Array(12).fill(0));
    assert.equal(sync.readEvents(root, dir).length, 12);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8')));
    assert.equal(fs.readdirSync(dir).some((name) => name.endsWith('.tmp')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('malformed ledger lines fail visibly instead of being discarded', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    write(root, '_handoff/agent-sync/events.jsonl', '{malformed json}\n');
    assert.throws(() => sync.readEvents(root, dir), /malformed JSON/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('command brief writes targeted brief prompts', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const out = sync.command([
      'brief', '--root', root, '--dir', dir, '--from', 'claude-code',
      '--to', 'codex,ollama', '--task', 'verify handoff state',
      '--context', 'same ledger for every agent',
      '--acceptance', 'report evidence',
      '--guard', 'do not edit classify.js',
      '--git', 'false',
    ], { now: '2026-07-09T00:00:00.000Z' });
    assert.match(out, /Brief prompts:/);
    const events = sync.readEvents(root, dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'brief');
    assert.deepEqual(events[0].target_agents, ['codex', 'ollama']);
    const files = fs.readdirSync(path.join(dir, 'briefs')).sort();
    assert.equal(files.length, 2);
    assert.match(files[0], /codex\.md$/);
    assert.match(files[1], /ollama\.md$/);
    const prompt = fs.readFileSync(path.join(dir, 'briefs', files[1]), 'utf8');
    assert.match(prompt, /You are stateless/);
    assert.match(prompt, /verify handoff state/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('command prompt renders stateless warning for ollama', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    sync.command([
      'record', '--root', root, '--dir', dir, '--agent', 'claude',
      '--summary', 'handoff ready', '--status', 'ready',
    ], { now: '2026-07-09T00:00:00.000Z' });
    const prompt = sync.command(['prompt', '--root', root, '--dir', dir, '--agent', 'ollama']);
    assert.match(prompt, /stateless local model/);
    assert.match(prompt, /handoff ready/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('hook mode writes only inside a Mooter root', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync');
  try {
    const out = sync.command(['hook', '--dir', dir], {
      root,
      now: '2026-07-09T00:00:00.000Z',
      stdin: JSON.stringify({ cwd: root, session_id: 's1', session_title: 'MEO control tower', model: 'claude-opus-4-8' }),
    });
    assert.equal(out, '');
    const events = sync.readEvents(root, dir);
    assert.equal(events.length, 1);
    assert.equal(events[0].agent, 'claude-code');
    assert.equal(events[0].kind, 'turn');
    assert.equal(events[0].provider, 'anthropic');
    assert.equal(events[0].model, 'claude-opus-4-8');
    assert.equal(events[0].execution_channel, 'subscription');
    assert.equal(events[0].session_title, 'MEO control tower');
    assert.equal(events[0].source, 'claude-code-hook');
    assert.equal(events[0].git, null, 'automatic Stop capture must not spawn git');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('normalizeEvent preserves executive session, delivery and mirror references', () => {
  const { root } = fixture();
  try {
    const ev = sync.normalizeEvent({
      agent: 'codex', session_id: 'codex-1', session_title: 'MEO max effort',
      channel: 'subscription',
      wave: 'wave/meo-cto', pr: '#247', notion_ref: 'notion://mooter/meo',
      obsidian_ref: 'Mooter/meo.md', summary: 'implemented the control tower',
    }, { root, git: false, classify: false, now: '2026-07-12T00:00:00.000Z' });
    assert.equal(ev.session_title, 'MEO max effort');
    assert.equal(ev.execution_channel, 'subscription');
    assert.equal(ev.wave, 'wave/meo-cto');
    assert.equal(ev.pr, '#247');
    assert.equal(ev.notion_ref, 'notion://mooter/meo');
    assert.equal(ev.obsidian_ref, 'Mooter/meo.md');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('simulateConversation writes one shared flow for all sync agents', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync-sim');
  try {
    const result = sync.simulateConversation(root, dir, {
      now: '2026-07-09T00:00:00.000Z',
      git: false,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.agents, ['claude-code', 'codex', 'gemini-roo', 'ollama']);
    assert.equal(result.missingAgents.length, 0);
    assert.equal(result.missingPrompts.length, 0);
    assert.equal(result.missingBriefs.length, 0);
    assert.ok(fs.existsSync(path.join(dir, 'latest.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'claude-code.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'codex.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'gemini-roo.md')));
    assert.ok(fs.existsSync(path.join(dir, 'prompts', 'ollama.md')));
    assert.ok(fs.existsSync(path.join(result.briefsDir)));
    const latest = fs.readFileSync(path.join(dir, 'latest.md'), 'utf8');
    assert.match(latest, /Claude Code prepared a typed handoff/);
    assert.match(latest, /Brief all agents from the same ledger snapshot/);
    assert.match(latest, /Codex read the handoff state/);
    assert.match(latest, /Roo\/Gemini reviewed the same snapshot/);
    assert.match(latest, /Local Moo summarized explicit sync context/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('command simulate reports pass and writes to requested dir', () => {
  const { root } = fixture();
  const dir = path.join(root, '_handoff', 'agent-sync-sim');
  try {
    const out = sync.command(['simulate', '--root', root, '--dir', dir, '--git', 'false'], {
      now: '2026-07-09T00:00:00.000Z',
    });
    assert.match(out, /SIMULATION=pass/);
    assert.match(out, /claude-code, codex, gemini-roo, ollama/);
    assert.match(out, /missing_briefs: 0/);
    assert.ok(fs.existsSync(path.join(dir, 'events.jsonl')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
