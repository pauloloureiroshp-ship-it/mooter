#!/usr/bin/env node
// corpus-60b.mjs — MP2 passo 3: segundo corpus de teste, amostrado das transcricoes do Claude Code.
// Elegibilidade e seed: protocol.json#mp2.corpus_60b. Saida: results/corpus-60b.json (NAO commitar).
//   node corpus-60b.mjs [--cap-per-session N] [--dry]
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { HERE, P1, opt, args } from './lib-common.mjs';
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp2.corpus_60b;
const [W0, W1] = proto.window_utc.map((s) => Date.parse(s));
const N = proto.n, SEED = proto.seed, CAP = Number(opt('--cap-per-session', 1));
const ROOT_TX = path.join(os.homedir(), '.claude', 'projects');
const HOME = os.homedir(); const OWNER = path.basename(HOME); // 'Paulo Loureiro'
const sha12 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 12);

// ── exclusao por sha: corpus-63 do P1 (marcadores) + corpus-40-unredacted (cru) ──
const known = new Set();
for (const m of fs.readFileSync(path.join(P1, 'corpus-63.json'), 'utf8').matchAll(/sha256:([0-9a-f]{12})/g)) known.add(m[1]);
try { for (const it of JSON.parse(fs.readFileSync(path.join(HERE, 'results', 'corpus-40-unredacted.json'), 'utf8')).items) { known.add(sha12(it.prompt)); if (it._sha256_12) known.add(it._sha256_12); } } catch {}

// ── anonimizacao como o P1: caminhos do home -> ~, dono -> <owner>, emails -> <email> ──
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const homeForms = [HOME, HOME.replace(/\\/g, '/'), HOME.replace(/\\/g, '\\\\'), '/c/Users/' + OWNER, 'C:\\Users\\PAULOL~1', 'C:/Users/PAULOL~1'];
const ownerForms = [OWNER, OWNER.split(' ')[0], OWNER.split(' ').at(-1)].filter(Boolean);
export function anonymise(t) {
  let s = t;
  for (const h of homeForms) s = s.replace(new RegExp(esc(h), 'gi'), '~');
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>');
  for (const o of ownerForms) s = s.replace(new RegExp(`\\b${esc(o)}\\b`, 'gi'), '<owner>');
  return s;
}
const clean = (s) => s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/^Shell cwd was reset to .*$/gm, '').trim();

// ── varrer ──────────────────────────────────────────────────────────────────
const why = {}; const drop = (k) => { why[k] = (why[k] || 0) + 1; };
let pool = 0; const elig = [];
for (const proj of fs.readdirSync(ROOT_TX)) {
  const d = path.join(ROOT_TX, proj); if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.jsonl')) continue; // so sessoes de topo; subagentes vivem em subpastas e ficam de fora
    for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
      if (!l.startsWith('{')) continue; let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.type !== 'user') continue;
      const ts = Date.parse(j.timestamp || ''); if (!(ts >= W0 && ts <= W1)) continue;
      const c = j.message?.content; let text = null;
      if (typeof c === 'string') text = c; else if (Array.isArray(c)) { if (c.some((b) => b.type === 'tool_result')) { drop('tool_result'); continue; } text = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n'); }
      if (!text) { drop('sem_texto'); continue; }
      pool++;
      if (/AppData-Local-Temp/i.test(proj)) { drop('scratchpad_Temp'); continue; }
      if (j.isSidechain) { drop('isSidechain'); continue; } if (j.isMeta) { drop('isMeta'); continue; }
      const t = clean(text);
      const tag = t.match(/^<([a-z-]+)/); if (tag) { drop('tag_' + tag[1]); continue; }
      if (/<pasted_content/.test(t)) { drop('colagem'); continue; }
      if (/^\//.test(t)) { drop('comando_/'); continue; }
      if (t.length < 20) { drop('lt20'); continue; } if (t.length > 500) { drop('gt500'); continue; }
      const a = anonymise(t);
      if (known.has(sha12(t)) || known.has(sha12(a))) { drop('sha_no_P1'); continue; }
      elig.push({ proj, sess: f.replace(/\.jsonl$/, ''), ts: j.timestamp, prompt: a, dispatched: /^\[[^\]]+·\s*S\d/.test(t) });
    }
  }
}
// ── amostrar: PRNG mulberry32(seed), ordem embaralhada, cap por sessao ──────
function mulberry32(x) { return function () { x |= 0; x = x + 0x6D2B79F5 | 0; let t = Math.imul(x ^ x >>> 15, 1 | x); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
elig.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.sess.localeCompare(b.sess))); // ordem estavel antes do shuffle
for (let i = elig.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [elig[i], elig[k]] = [elig[k], elig[i]]; }
const perSess = {}; const picked = [];
for (const e of elig) { if (picked.length >= N) break; if ((perSess[e.sess] || 0) >= CAP) continue; perSess[e.sess] = (perSess[e.sess] || 0) + 1; picked.push(e); }
picked.sort((a, b) => (a.ts < b.ts ? -1 : 1));
const items = picked.map((e, i) => ({ id: `b${String(i + 1).padStart(2, '0')}`, source: 'cc-transcripts-2026-09-10..21', prompt: e.prompt, _sha256_12: sha12(e.prompt), _chars: e.prompt.length, _session_sha8: crypto.createHash('sha256').update(e.sess).digest('hex').slice(0, 8), _project_sha8: crypto.createHash('sha256').update(e.proj).digest('hex').slice(0, 8), _day: e.ts.slice(0, 10), _dispatched: e.dispatched }));
const sessions = new Set(elig.map((e) => e.sess)), projects = {};
for (const e of elig) { const k = crypto.createHash('sha256').update(e.proj).digest('hex').slice(0, 8); projects[k] = (projects[k] || 0) + 1; }
const pickedSess = {}; for (const it of items) pickedSess[it._session_sha8] = (pickedSess[it._session_sha8] || 0) + 1;
const meta = { _schema: 'decisor-shadow/corpus-60b', _sampled_at: new Date().toISOString(), _window_utc: proto.window_utc, _seed: SEED, _cap_per_session: CAP, _pool_user_text_in_window: pool, _eligible: elig.length, _eligible_sessions: sessions.size, _eligible_dispatched: elig.filter((e) => e.dispatched).length, _dropped: why, _projects_eligible_sha8: projects, _picked: items.length, _picked_sessions: Object.keys(pickedSess).length, _picked_per_session: pickedSess, _picked_dispatched: items.filter((i) => i._dispatched).length, _picked_days: items.reduce((a, i) => ((a[i._day] = (a[i._day] || 0) + 1), a), {}), _anonymised: 'caminhos do home -> ~, dono -> <owner>, emails -> <email>' };
console.log(JSON.stringify(meta, null, 1));
if (!args.includes('--dry')) { fs.writeFileSync(path.join(HERE, 'results', 'corpus-60b.json'), JSON.stringify({ ...meta, items }, null, 1)); console.log(`→ results/corpus-60b.json (${items.length} itens)`); }
