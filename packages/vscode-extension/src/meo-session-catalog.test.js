'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const extra = require('./host-extra.js');

test('sessionSummaries joins real transcript identity with explicit mirror stamps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meo-sessions-'));
  try {
    const sid = '11111111-2222-3333-4444-555555555555';
    const file = path.join(dir, sid + '.jsonl');
    const rows = [
      { type: 'user', cwd: 'C:\\work\\mooter', message: { role: 'user', content: 'Build the MEO CTO view\nwith proof' } },
      { type: 'assistant', cwd: 'C:\\work\\mooter', message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 10, output_tokens: 20 }, content: [{ type: 'text', text: 'done' }] } },
    ];
    fs.writeFileSync(file, rows.map(JSON.stringify).join('\n') + '\n');
    const out = extra.sessionSummaries(5, {
      files: [{ file, mtime: 1234 }], names: {},
      decorate: (row) => Object.assign(row, {
        coworkTitle: 'MEO Control Tower', notionPageId: 'notion-page',
        notionSyncedAt: '2026-07-12T12:00:00Z', obsidianPath: 'Mooter/meo.md',
      }),
    });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].fullId, sid);
    assert.strictEqual(out[0].title, 'MEO Control Tower');
    assert.strictEqual(out[0].promptTitle, 'Build the MEO CTO view');
    assert.strictEqual(out[0].model, 'claude-opus-4-8');
    assert.strictEqual(out[0].cwd, 'C:\\work\\mooter');
    assert.strictEqual(out[0].notionPageId, 'notion-page');
    assert.strictEqual(out[0].obsidianPath, 'Mooter/meo.md');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sessionSummaries keeps unknown model and mirrors honest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meo-sessions-'));
  try {
    const sid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const file = path.join(dir, sid + '.jsonl');
    fs.writeFileSync(file, JSON.stringify({ type: 'user', cwd: '/repo', message: { role: 'user', content: 'Only a prompt' } }) + '\n');
    const out = extra.sessionSummaries(5, { files: [{ file, mtime: 1 }], names: {}, decorate: (row) => row });
    assert.strictEqual(out[0].model, null);
    assert.strictEqual(out[0].notionSyncedAt, null);
    assert.strictEqual(out[0].obsidianSyncedAt, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
