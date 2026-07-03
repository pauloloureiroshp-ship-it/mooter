'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./config.js');

function withHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmadapt-cfg-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try { return fn(dir); }
  finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

test('zero-by-default: every known tool reads as disabled with no config', () => {
  withHome(() => {
    const cfg = config.readConfig();
    for (const t of config.TOOLS) assert.equal(cfg[t].enabled, false, `${t} must default off`);
    for (const t of config.TOOLS) assert.equal(config.isEnabled(t), false);
  });
});

test('unknown tool is never enabled', () => {
  withHome(() => {
    assert.equal(config.isEnabled('bogus'), false);
    assert.equal(config.setEnabled('bogus', true), false);
  });
});

test('only literal true enables — truthy junk stays off', () => {
  withHome((dir) => {
    fs.writeFileSync(path.join(dir, 'preferences.json'), JSON.stringify({ pm_adapters: { notion: { enabled: 'yes' } } }));
    assert.equal(config.isEnabled('notion'), false);
  });
});

test('enable persists + carries opts, disable flips back, other keys preserved', () => {
  withHome(() => {
    assert.equal(config.setEnabled('notion', true, { database_id: 'db123' }), true);
    assert.equal(config.isEnabled('notion'), true);
    assert.equal(config.readConfig().notion.database_id, 'db123');
    // enabling notion must not enable slack
    assert.equal(config.isEnabled('slack'), false);
    config.setEnabled('slack', true, { channel: '#eng' });
    assert.equal(config.readConfig().notion.database_id, 'db123', 'notion opts survive slack write');
    config.setEnabled('notion', false);
    assert.equal(config.isEnabled('notion'), false);
    assert.equal(config.readConfig().notion.database_id, 'db123', 'opts survive disable');
  });
});

test('direction is fixed by design, not config', () => {
  assert.equal(config.direction('github'), 'read-only');
  assert.equal(config.direction('notion'), 'outbound');
  assert.equal(config.direction('slack'), 'outbound');
  assert.equal(config.direction('linear'), 'outbound');
});
