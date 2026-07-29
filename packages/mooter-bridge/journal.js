'use strict';
/**
 * journal.js — mooter-bridge v1.2 · CW6: the vault stops being a rumour.
 *
 * "Não sei quando está sendo registrado no vault" — because nothing ever wrote
 * there, and the panel had no way to say so. Worse, the vault path itself was
 * disputed: memory said `~/paulo-vault`, live sessions showed
 * `~/Documents/paulo-vault`. So we DETECT instead of assuming, and when we
 * cannot find it we say `n/d` and write nothing. Writing a note into a guessed
 * folder is how you scatter someone's second brain across a disk.
 *
 * Detection = a directory that contains `.obsidian/`. That is the only marker
 * Obsidian itself trusts.
 *
 * Safety: the guard in seamless.js FORBIDS worktrees inside the vault, and that
 * stays. This module is the single, narrow, audited exception — it appends a
 * note under a learnings/decisions folder and touches nothing else. It never
 * deletes, never overwrites an existing file (it suffixes), never runs git.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * ⚠️ MOOTER_VAULT is AUTHORITATIVE, not a hint.
 *
 * v1.2 treated it as the first candidate and then fell through to hardcoded
 * paths. The audit of 2026-07-25 caught the consequence live: a test pointed
 * MOOTER_VAULT at a temp folder with no `.obsidian`, detection fell through,
 * and the suite wrote a note into the REAL vault. An env var that says "write
 * here" must never mean "write somewhere else instead".
 */
function candidates() {
  const home = os.homedir();
  const env = process.env.MOOTER_VAULT;
  if (env && env.indexOf('${') < 0 && env.trim()) return [env.trim()];   // authoritative: no fallback
  return [
    path.join(home, 'Documents', 'paulo-vault'),
    path.join(home, 'paulo-vault'),
    path.join(home, 'Documents', 'vault'),
    path.join(home, 'obsidian'),
    path.join(home, 'Documents', 'Obsidian'),
  ];
}

/** @returns {{root:string|null, source:string, checked:string[]}} */
function detectVault() {
  const checked = [];
  for (const c of candidates()) {
    checked.push(c);
    try {
      if (fs.existsSync(path.join(c, '.obsidian'))) {
        return { root: c, source: process.env.MOOTER_VAULT === c ? 'env' : 'auto', checked };
      }
    } catch { /* next */ }
  }
  // a vault directory that exists but has no .obsidian is reported, never used
  for (const c of candidates()) {
    try { if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return { root: null, source: 'sem-.obsidian', checked, near: c }; }
    catch { /* */ }
  }
  return { root: null, source: 'não-encontrado', checked };
}

const FOLDERS = {
  learning: '30-learnings',
  decision: '20-decisions',
  project: '10-projects',
};

function slug(s) {
  return String(s || 'nota')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'nota';
}
function today() { return new Date().toISOString().slice(0, 10); }

function frontmatter(o) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    if (Array.isArray(v)) lines.push(k + ': [' + v.map((x) => JSON.stringify(String(x))).join(', ') + ']');
    else lines.push(k + ': ' + (typeof v === 'number' || typeof v === 'boolean' ? v : JSON.stringify(String(v))));
  }
  lines.push('---', '');
  return lines.join('\n');
}

/**
 * Write one note. Never overwrites: an existing name gets -2, -3, …
 * @returns {{ok:boolean, file?:string, root?:string, error?:string, checked?:string[]}}
 */
function writeNote({ title, body, kind, wave, tags, jobs, cost_usd, subfolder }) {
  const v = detectVault();
  if (!v.root) {
    return {
      ok: false,
      error: 'vault não encontrado (nenhum candidato tem .obsidian/) — nada foi escrito',
      checked: v.checked,
      hint: 'define MOOTER_VAULT com o caminho do vault',
    };
  }
  // ⚠️ `subfolder` comes from the MODEL. `slug()` neutralises `../` in the
  // title, but v1.2 joined the subfolder raw — `subfolder: "../../.ssh"` would
  // have written outside the vault. Resolve, then refuse anything that escapes.
  const folder = subfolder ? String(subfolder).split(/[\\/]/).map(slug).filter(Boolean).join('/') : (FOLDERS[kind] || FOLDERS.learning);
  const dir = path.resolve(v.root, folder || FOLDERS.learning);
  if (!dir.startsWith(path.resolve(v.root) + path.sep) && dir !== path.resolve(v.root)) {
    return { ok: false, error: 'destino fora do vault — recusado (' + folder + ')' };
  }
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { return { ok: false, error: 'não consegui criar ' + dir + ': ' + ((e && e.message) || e) }; }

  const base = today() + '-' + slug(title);
  let file = path.join(dir, base + '.md');
  let n = 2;
  while (fs.existsSync(file)) { file = path.join(dir, base + '-' + n + '.md'); n++; }

  const fm = frontmatter({
    title: title || 'Nota Mooter',
    date: today(),
    source: 'mooter-bridge',
    wave: wave || null,
    jobs: Array.isArray(jobs) && jobs.length ? jobs : null,
    cost_usd: cost_usd != null ? cost_usd : null,
    tags: Array.isArray(tags) && tags.length ? tags : ['mooter'],
  });
  try {
    fs.writeFileSync(file, fm + String(body || '').trim() + '\n', 'utf8');
    return { ok: true, file, root: v.root, folder, source: v.source };
  } catch (e) {
    return { ok: false, error: 'escrita falhou: ' + ((e && e.message) || e), file };
  }
}

/** Cheap status for the panel chip: never blocks, never writes. */
function vaultStatus() {
  const v = detectVault();
  if (!v.root) return { available: false, root: null, reason: v.source, checked: v.checked.length };
  let last = null;
  try {
    const dir = path.join(v.root, FOLDERS.learning);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    let best = 0;
    for (const f of files) {
      const st = fs.statSync(path.join(dir, f));
      if (st.mtimeMs > best) { best = st.mtimeMs; last = { file: f, at: new Date(st.mtimeMs).toISOString() }; }
    }
  } catch { /* folder may not exist yet — that is not an error */ }
  return { available: true, root: v.root, source: v.source, last_note: last };
}

module.exports = { detectVault, writeNote, vaultStatus, FOLDERS, slug };
