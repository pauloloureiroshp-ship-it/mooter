// lp-skills.test.js — LP-4.8 §3. Element-scoped /skills: a template + tier floor per skill, loaded
// from vendored defaults (assets/skills/*.md) with a workspace override (.mooter/skills/). These
// tests pin the frontmatter parse, the resolution order, the bundled-vs-registry agreement (so the
// .md files can never drift from behaviour), and the menu's routing transparency + safety.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LSK = require('./lp-skills.js');

test('parseSkillMd: reads frontmatter, preserves a template with a trailing space', () => {
  const sk = LSK.parseSkillMd('---\nid: copy\nlabel: /copy\nglyph: ✍️\ntier_floor: local\nkind: text\ntemplate: "reescreve isto: "\n---\n\ndocs');
  assert.strictEqual(sk.id, 'copy');
  assert.strictEqual(sk.tierFloor, 'local');
  assert.strictEqual(sk.kind, 'text');
  assert.strictEqual(sk.template, 'reescreve isto: ', 'quoted template keeps its trailing space');
});

test('parseSkillMd: null on missing/invalid id (never a nameless routing key)', () => {
  assert.strictEqual(LSK.parseSkillMd('no frontmatter here'), null);
  assert.strictEqual(LSK.parseSkillMd('---\nlabel: x\n---'), null);
  assert.strictEqual(LSK.parseSkillMd('---\nid: Bad Id!\n---'), null);
});

test('normalizeSkill: clamps an unknown tier_floor/kind to safe defaults', () => {
  const sk = LSK.normalizeSkill({ id: 'x', tier_floor: 'opus', kind: 'delete-everything' });
  assert.strictEqual(sk.tierFloor, 'local', 'unknown floor → local (never an unexpected cloud tier)');
  assert.strictEqual(sk.kind, 'text', 'unknown kind → text');
});

test('loadSkills: the vendored bundle yields the 5 v1 skills in order', () => {
  const skills = LSK.loadSkills({}); // no wsRoot → bundled assets/skills
  const ids = skills.map((s) => s.id);
  assert.deepStrictEqual(ids, ['icon', 'copy', 'restyle', 'a11y', 'section'], 'bundled order icon→section');
  const section = skills.find((s) => s.id === 'section');
  assert.strictEqual(section.tierFloor, 'auto', '/section floors to the agent');
  assert.ok(skills.filter((s) => s.tierFloor === 'local').length === 4, 'the other four are local $0');
});

test('bundled assets/skills/*.md agree with the DEFAULT_SKILLS fallback (no drift)', () => {
  const loaded = LSK.loadSkills({});
  for (const def of LSK.DEFAULT_SKILLS) {
    const got = loaded.find((s) => s.id === def.id);
    assert.ok(got, 'bundled .md present for ' + def.id);
    assert.strictEqual(got.tierFloor, def.tierFloor, 'tier floor matches for ' + def.id);
    assert.strictEqual(got.kind, def.kind, 'kind matches for ' + def.id);
  }
});

test('loadSkills: a workspace .mooter/skills override wins over the bundle', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lpsk-'));
  const dir = path.join(tmp, '.mooter', 'skills');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'copy.md'), '---\nid: copy\nlabel: /copy\nglyph: ✍️\ntier_floor: auto\nkind: text\ntemplate: "override "\n---\n', 'utf8');
  const skills = LSK.loadSkills({ wsRoot: tmp });
  const copy = skills.find((s) => s.id === 'copy');
  assert.ok(copy, 'override skill loaded');
  assert.strictEqual(copy.tierFloor, 'auto', 'override tier floor applied');
  assert.strictEqual(copy.template, 'override ', 'override template applied');
  // The override root fully replaces the bundle (it is the first root that yields skills).
  assert.deepStrictEqual(skills.map((s) => s.id), ['copy'], 'only the override skill is present');
});

test('renderSkillsMenuHTML: each item surfaces its tier + carries template/skill data, no scripts', () => {
  const html = LSK.renderSkillsMenuHTML(LSK.loadSkills({}));
  assert.ok(html.includes('data-skill="icon"') && html.includes('data-skill="section"'), 'skills rendered');
  assert.ok(html.includes('data-tier="local"') && html.includes('data-tier="auto"'), 'tier surfaced per item');
  assert.ok(html.includes('local · $0') && html.includes('agente · subscrição'), 'honest tier labels');
  assert.ok(!/<script|onclick|javascript:/i.test(html), 'no inline scripts/handlers in the menu');
});

test('renderSkillsMenuHTML: a hostile template/label is HTML-escaped (no injection via a skill file)', () => {
  const html = LSK.renderSkillsMenuHTML([{ id: 'evil', label: '/evil', glyph: '💀', tierFloor: 'local', kind: 'text', hint: '<img src=x onerror=alert(1)>', template: '"><script>alert(1)</script>' }]);
  assert.ok(!html.includes('<script>alert(1)'), 'template script tag escaped');
  assert.ok(!html.includes('<img src=x'), 'hint img tag escaped');
  assert.ok(html.includes('&lt;script&gt;') || html.includes('&lt;script'), 'escaped entities present');
});
