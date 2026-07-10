'use strict';
/**
 * lp-skills.js — LP-4.8 §3 · element-scoped /skills with per-skill routing.
 *
 * A skill is a template + tier floor anchored to the SELECTED node. Picking one seeds the one-box
 * with the skill's template and pins the chip to the skill's tier floor — the routing decision is
 * surfaced, never hidden (Mooter's honest-routing ethos). Execution then rides the EXISTING fenced
 * paths (deterministic class edit / local moo rewrite / anchored agent), so /skills adds ZERO new
 * write surface: every change still goes through diff → hash-guard → confirm, never auto-applied.
 *
 * Vendored defaults ship in the vsix (assets/skills/*.md); a workspace overrides/extends under
 * .mooter/skills/ — the SAME resolution-order convention as live-edit-assets.js. Never throws;
 * a broken/missing file just falls back to the bundled set, and finally to DEFAULT_SKILLS.
 *
 * No vscode import — fs/dir are injectable so the loader is unit-testable and the pure renderer
 * serialises into the webview via fn.toString() like the other view helpers.
 */

const fs = require('fs');
const path = require('path');

// Tier floors a skill may declare. 'local' = the $0 fenced/moo path; 'auto' = the anchored agent
// (subscription via the SDK bridge). A skill NEVER declares a cloud tier as its floor — cloud is
// always a manual bump, never a skill default.
const VALID_FLOORS = { local: 1, auto: 1 };
const VALID_KINDS = { asset: 1, text: 1, class: 1, review: 1, agent: 1 };

// The last-resort registry if no .md is readable at all (defensive: the panel still offers skills).
const DEFAULT_SKILLS = [
  { id: 'icon', label: '/icon', glyph: '🎨', tierFloor: 'local', kind: 'asset', hint: 'ícone da whitelist — $0', template: 'insere um ícone da whitelist (lucide / Simple Icons) neste elemento — qual: ' },
  { id: 'copy', label: '/copy', glyph: '✍️', tierFloor: 'local', kind: 'text', hint: 'reescreve o texto — moo local, cercado', template: 'reescreve o texto deste elemento — mantém o sentido, muda o tom para: ' },
  { id: 'restyle', label: '/restyle', glyph: '🎛️', tierFloor: 'local', kind: 'class', hint: 'ajusta o estilo Tailwind', template: 'ajusta o estilo (Tailwind) deste elemento: ' },
  { id: 'a11y', label: '/a11y', glyph: '♿', tierFloor: 'local', kind: 'review', hint: 'checklist a11y do nó + correções cercadas', template: 'revê a acessibilidade deste elemento (alt, aria, contraste, role) e propõe correções cercadas' },
  { id: 'section', label: '/section', glyph: '🧩', tierFloor: 'auto', kind: 'agent', hint: 'tarefa de agente ancorada — fenced, diff antes de manter', template: 'trata esta secção como uma tarefa ancorada — descreve a mudança estrutural: ' },
];

function bundledSkillsDir() { return path.join(__dirname, '..', 'assets', 'skills'); }

// Resolution order: the workspace's .mooter/skills (project overrides) wins over the vsix bundle.
function skillRoots(opts) {
  const o = opts || {};
  const roots = [];
  if (o.wsRoot) roots.push(path.join(o.wsRoot, '.mooter', 'skills'));
  roots.push(o.bundledDir || bundledSkillsDir());
  return roots;
}

// Parse a skill .md: a leading --- frontmatter block of key: value lines, then human docs (few-shot)
// we do NOT execute. Values may be single- or double-quoted (templates carry trailing spaces we must
// preserve). Returns a normalised skill object, or null if the frontmatter lacks a usable id.
function parseSkillMd(text) {
  const s = String(text == null ? '' : text);
  const m = s.match(/^﻿?---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
        (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'")) {
      val = val.slice(1, -1);
    }
    if (key) fm[key] = val;
  }
  return normalizeSkill(fm);
}

// Shape + clamp a raw frontmatter object into a trusted skill. Unknown floors/kinds fall back to
// safe defaults (local/text) so a typo in an override can never route somewhere unexpected.
function normalizeSkill(fm) {
  const o = fm || {};
  const id = String(o.id || '').trim();
  if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) return null; // id is the routing key — keep it tame
  const floor = VALID_FLOORS[o.tier_floor] ? o.tier_floor : 'local';
  const kind = VALID_KINDS[o.kind] ? o.kind : 'text';
  return {
    id: id,
    label: String(o.label || ('/' + id)).slice(0, 24),
    glyph: String(o.glyph || '•').slice(0, 4),
    tierFloor: floor,
    kind: kind,
    hint: String(o.hint || '').slice(0, 160),
    template: String(o.template == null ? '' : o.template).slice(0, 400),
  };
}

// Load the skill registry. Reads *.md from the first root that yields any valid skill; a workspace
// override root that exists but is empty/broken falls through to the bundle, then to DEFAULT_SKILLS.
// Deterministic order: the DEFAULT_SKILLS order first (icon→section), then any extra ids sorted.
function loadSkills(opts) {
  for (const root of skillRoots(opts)) {
    try {
      const files = fs.readdirSync(root).filter((f) => /\.md$/i.test(f));
      const byId = {};
      for (const f of files) {
        try {
          const sk = parseSkillMd(fs.readFileSync(path.join(root, f), 'utf8'));
          if (sk && !byId[sk.id]) byId[sk.id] = sk;
        } catch { /* skip an unreadable file, keep the rest */ }
      }
      const ids = Object.keys(byId);
      if (ids.length) return orderSkills(byId);
    } catch { /* next root */ }
  }
  return DEFAULT_SKILLS.slice();
}

function orderSkills(byId) {
  const out = [];
  const seen = {};
  for (const d of DEFAULT_SKILLS) { if (byId[d.id]) { out.push(byId[d.id]); seen[d.id] = 1; } }
  const extra = Object.keys(byId).filter((id) => !seen[id]).sort();
  for (const id of extra) out.push(byId[id]);
  return out;
}

// Honest one-liner for the chip: what tier this skill runs on. Kept here so the webview and any
// future host telemetry describe a skill's routing identically.
function floorLabel(floor) {
  return floor === 'auto' ? 'agente · subscrição' : 'local · $0';
}

// Pure menu renderer, serialised into the webview. `skills` is the JSON registry embedded at build;
// `esc` is the webview's HTML escaper (passed in so this is dependency-free after serialisation).
function renderSkillsMenuHTML(skills, esc) {
  const e = (typeof esc === 'function') ? esc : function (x) {
    return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  const list = Array.isArray(skills) ? skills : [];
  let h = '';
  for (let i = 0; i < list.length; i++) {
    const s = list[i] || {};
    const floor = (s.tierFloor === 'auto') ? 'auto' : 'local';
    const tierTxt = (floor === 'auto') ? 'agente · subscrição' : 'local · $0';
    h += '<button type="button" class="lp-sk-item" role="menuitem"'
      + ' data-skill="' + e(s.id || '') + '"'
      + ' data-tier="' + e(floor) + '"'
      + ' data-template="' + e(s.template || '') + '" title="selecciona a skill ' + e(s.label || s.id || 'n/d') + ' e preenche o prompt ancorado; não executa até enviares">'
      + '<span class="lp-sk-g">' + e(s.glyph || '•') + '</span>'
      + '<span class="lp-sk-lb">' + e(s.label || ('/' + (s.id || ''))) + '</span>'
      + '<span class="lp-sk-tier lp-sk-tier-' + e(floor) + '">' + e(tierTxt) + '</span>'
      + (s.hint ? ('<span class="lp-sk-hint">' + e(s.hint) + '</span>') : '')
      + '</button>';
  }
  return h;
}

module.exports = {
  DEFAULT_SKILLS: DEFAULT_SKILLS,
  parseSkillMd: parseSkillMd,
  normalizeSkill: normalizeSkill,
  loadSkills: loadSkills,
  floorLabel: floorLabel,
  renderSkillsMenuHTML: renderSkillsMenuHTML,
};
