#!/usr/bin/env node
'use strict';

// FRENTE C · PM Adapters — human operations CLI.
//
// The terminal-first surface the human uses to opt in, scope a token, and GRANT the
// first-write consent (DC-12). Frente B's UI can shell out to the same commands.
//
//   node adapters/cli.js status [--json]
//   node adapters/cli.js enable  <tool> [--db <id>|--team <id>|--channel <c>|--webhook <url>]
//   node adapters/cli.js disable <tool>
//   node adapters/cli.js set-token <tool>        # token from STDIN or $MOOTER_ADAPTER_TOKEN
//   node adapters/cli.js revoke-token <tool>
//   node adapters/cli.js grant   <tool>          # <-- the human write-back gate
//   node adapters/cli.js revoke-consent <tool>
//   node adapters/cli.js reset   <tool>          # clear a tripped kill-switch
//   node adapters/cli.js --self-test
//
// Tokens are NEVER passed as argv (they'd leak into shell history / ps). Read from a pipe
// (`echo $TOK | node cli.js set-token notion`) or the env var.

const fs = require('fs');
const mgr = require('./index.js');
const config = require('./config.js');

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true; }
  }
  return flags;
}

function readTokenFromStdinOrEnv() {
  if (process.env.MOOTER_ADAPTER_TOKEN) return process.env.MOOTER_ADAPTER_TOKEN.trim();
  try { return fs.readFileSync(0, 'utf8').trim() || null; } catch { return null; }
}

function optsForEnable(tool, flags) {
  const o = {};
  if (tool === 'notion' && flags.db) o.database_id = flags.db;
  if (tool === 'linear' && flags.team) o.team_id = flags.team;
  if (tool === 'slack' && flags.channel) o.channel = flags.channel;
  if (tool === 'slack' && flags.webhook) o.webhook_url = flags.webhook;
  return o;
}

function printStatus(json) {
  const s = mgr.status();
  if (json) { process.stdout.write(JSON.stringify(s, null, 2) + '\n'); return; }
  process.stdout.write('🐮 Mooter PM Adapters — zero-by-default, unidirectional\n\n');
  for (const [tool, t] of Object.entries(s.tools)) {
    const on = t.enabled ? 'on ' : 'off';
    const bits = [
      `${on}`, `(${t.direction})`,
      t.direction === 'outbound' ? `token:${t.has_token ? t.token_hint : '—'}` : '',
      t.direction === 'outbound' ? `consent:${t.consent ? 'yes' : 'no'}` : '',
      t.killswitch_tripped ? 'KILLSWITCH-TRIPPED' : '',
      t.pending ? `pending:${t.pending}` : '',
    ].filter(Boolean).join('  ');
    process.stdout.write(`  ${tool.padEnd(7)} ${bits}\n`);
    process.stdout.write(`          scope: ${t.min_scope}\n`);
  }
}

function selfTest() {
  const os = require('os'), path = require('path'), assert = require('assert');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmadapt-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = tmp;
  let pass = 0, fail = 0;
  const check = (name, fn) => { try { fn(); pass++; process.stdout.write(`  ✓ ${name}\n`); } catch (e) { fail++; process.stdout.write(`  ✗ ${name} — ${e.message}\n`); } };
  try {
    const fresh = () => { for (const m of ['./config.js', './index.js', './stamp.js', './debounce.js', './gate.js', './broker.js']) delete require.cache[require.resolve(m)]; return require('./index.js'); };
    check('zero-by-default: every tool disabled', () => { const m = fresh(); for (const t of config.TOOLS) assert.strictEqual(m.status().tools[t].enabled, false); });
    check('emit with nothing enabled is a no-op', () => { const m = fresh(); assert.deepStrictEqual(m.emit({ kind: 'outcome', ts: 1 }), []); });
    check('outbound stamped with ledger_event_id + source', () => { const s = require('./stamp.js'); const p = s.stampOutbound({ kind: 'outcome', ts: 1, idem_key: 'k' }, { tool: 'notion' }); assert.ok(s.isStamped(p)); assert.ok(!('input' in p) && !('output' in p)); });
    check('write blocked without human consent', async () => { const m = fresh(); m.enable('notion', { database_id: 'db' }); m.setToken('notion', 'tok'); m.emit({ kind: 'outcome', ts: 1, idem_key: 'a' }); const r = await m.flush('notion', { force: true }); assert.strictEqual(r.blocked, 'consent_required'); });
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  process.stdout.write(`\n${fail === 0 ? '✅' : '❌'} self-test: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();
  const [cmd, tool] = argv;
  const flags = parseFlags(argv.slice(1));
  const known = (t) => config.TOOLS.includes(t);

  switch (cmd) {
    case undefined:
    case 'status': return printStatus(!!flags.json);
    case 'enable': if (!known(tool)) return bail(`unknown tool: ${tool}`); mgr.enable(tool, optsForEnable(tool, flags)); return printStatus(false);
    case 'disable': if (!known(tool)) return bail(`unknown tool: ${tool}`); mgr.disable(tool); return printStatus(false);
    case 'set-token': {
      if (!known(tool)) return bail(`unknown tool: ${tool}`);
      const t = readTokenFromStdinOrEnv();
      if (!t) return bail('no token on stdin or $MOOTER_ADAPTER_TOKEN');
      const ok = mgr.setToken(tool, t);
      process.stdout.write(ok ? `stored token for ${tool} (scoped)\n` : `failed to store token for ${tool}\n`);
      return;
    }
    case 'revoke-token': if (!known(tool)) return bail(`unknown tool: ${tool}`); mgr.revokeToken(tool); return printStatus(false);
    case 'grant': if (!known(tool)) return bail(`unknown tool: ${tool}`); mgr.grantConsent(tool, { by: 'cli' }); process.stdout.write(`✋ write-back consent granted for ${tool}\n`); return;
    case 'revoke-consent': if (!known(tool)) return bail(`unknown tool: ${tool}`); mgr.revokeConsent(tool); return printStatus(false);
    case 'reset': if (!known(tool)) return bail(`unknown tool: ${tool}`); mgr.resetKillswitch(tool); process.stdout.write(`kill-switch reset for ${tool}\n`); return;
    default: return bail(`unknown command: ${cmd}`);
  }
}

function bail(msg) { process.stderr.write(`error: ${msg}\n`); process.exitCode = 1; }

if (require.main === module) main();
module.exports = { parseFlags };
