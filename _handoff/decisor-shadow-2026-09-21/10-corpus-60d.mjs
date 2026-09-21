#!/usr/bin/env node
// 10-corpus-60d.mjs — MP4 (pré-registado em protocol.json#mp4.corpus_60d): o corpus 60d nasce dos eventos
// `decisor_shadow` do decisions.log (só prompt_sha12 + prompt_len) e recupera o TEXTO das transcrições do
// Claude Code por sha256[0..12] do texto cru. Mesmas exclusões do 60c, 1/sessão ESTRITO, seed do pré-registo.
//   node 10-corpus-60d.mjs [--log <decisions.log>] [--transcripts <~/.claude/projects>] [--since <iso>]
//                          [--out <results/corpus-60d.json>] [--dry] [--predictions]
// --predictions escreve results/D-shadow-corpus-60d.json (as previsões DO EVENTO, que são as que contam) e
// RECUSA se results/labels-60d.json não existir — a cegueira dos rotuladores vem primeiro.
// Saídas NUNCA commitadas (.gitignore do pacote). Nada aqui corre modelo nenhum.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HERE, P1, opt, args } from './lib-common.mjs';

const PROTO = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp4;
const C = PROTO.corpus_60d;
const LOG = opt('--log', path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log'));
const TX = opt('--transcripts', path.join(os.homedir(), '.claude', 'projects'));
const SINCE = Date.parse(opt('--since', C.since_utc));
const OUT = opt('--out', path.join(HERE, 'results', 'corpus-60d.json'));
const N = C.n_target, SEED = C.seed, CAP = C.cap_per_session;
const HOME = os.homedir(); const OWNER = path.basename(HOME);
export const sha12 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 12);

// ── exclusão por sha: P1 corpus-63 (marcadores + os r01-r23 em claro), 40, 60b, 60c ──
export function knownShas(resDir = path.join(HERE, 'results')) {
  const known = new Set();
  try {
    const raw = fs.readFileSync(path.join(P1, 'corpus-63.json'), 'utf8');
    for (const m of raw.matchAll(/sha256:([0-9a-f]{12})/g)) known.add(m[1]);
    // r01-r23: não redigidos no P1 (buraco A7 do round 3) — entram pelo texto
    try { for (const it of (JSON.parse(raw).items || [])) if (it.prompt && !/^\[\[redigido/.test(it.prompt)) known.add(sha12(it.prompt)); } catch { /* corpus-63 sem items */ }
  } catch { /* P1 ausente nesta máquina: a exclusão fica parcial e é declarada no meta */ }
  for (const f of ['corpus-40-unredacted.json', 'corpus-60b.json', 'corpus-60c.json']) {
    try { for (const it of JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8')).items) { known.add(sha12(it.prompt)); if (it._sha256_12) known.add(it._sha256_12); } } catch { /* ausente */ }
  }
  return known;
}

// ── anonimização como o 60b/60c ──
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

// ── 1. eventos do shadow ──
export function readShadowEvents(logPath, sinceMs) {
  const out = [];
  if (!fs.existsSync(logPath)) return out;
  for (const l of fs.readFileSync(logPath, 'utf8').split('\n')) {
    if (!l.startsWith('{') || !l.includes('"decisor_shadow"')) continue;
    let e; try { e = JSON.parse(l); } catch { continue; }
    if (e.event !== 'decisor_shadow') continue;
    const t = Number.isFinite(e.hook_ts_ms) ? e.hook_ts_ms : Date.parse(e.ts || '');
    if (!(t >= sinceMs)) continue;
    out.push(e);
  }
  return out;
}

// ── 2. índice das transcrições: sha12(texto cru) -> {texto, projecto, sessão, timestamp, flags} ──
export function indexTranscripts(root) {
  const idx = new Map(); let lines = 0;
  if (!fs.existsSync(root)) return { idx, lines };
  for (const proj of fs.readdirSync(root)) {
    const d = path.join(root, proj); if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.jsonl')) continue; // só sessões de topo; subagentes vivem em subpastas
      for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n')) {
        if (!l.startsWith('{')) continue; let j; try { j = JSON.parse(l); } catch { continue; }
        if (j.type !== 'user') continue;
        const c = j.message?.content; let text = null; let toolResult = false;
        if (typeof c === 'string') text = c; else if (Array.isArray(c)) { toolResult = c.some((b) => b.type === 'tool_result'); text = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n'); }
        if (!text) continue;
        lines++;
        const key = sha12(text);
        if (!idx.has(key)) idx.set(key, { text, proj, sess: f.replace(/\.jsonl$/, ''), ts: j.timestamp || null, toolResult, sidechain: !!j.isSidechain, meta: !!j.isMeta });
      }
    }
  }
  return { idx, lines };
}

// ── 3. elegibilidade sobre o texto recuperado (as mesmas do 60c) ──
export function eligible(rec, known) {
  if (rec.toolResult) return 'tool_result';
  if (/AppData-Local-Temp/i.test(rec.proj)) return 'scratchpad_Temp';
  if (rec.sidechain) return 'isSidechain'; if (rec.meta) return 'isMeta';
  const t = clean(rec.text);
  const tag = t.match(/^<([a-z-]+)/); if (tag) return 'tag_' + tag[1];
  if (/<pasted_content/.test(t)) return 'colagem';
  if (/^\//.test(t)) return 'comando_/';
  if (t.length < 20) return 'lt20'; if (t.length > 500) return 'gt500';
  const a = anonymise(t);
  if (known.has(sha12(t)) || known.has(sha12(a)) || known.has(sha12(rec.text))) return 'sha_conhecido';
  return null;
}

function mulberry32(x) { return function () { x |= 0; x = x + 0x6D2B79F5 | 0; let t = Math.imul(x ^ x >>> 15, 1 | x); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function buildCorpus({ events, idx, known, n = N, cap = CAP, seed = SEED }) {
  const why = {}; const drop = (k) => { why[k] = (why[k] || 0) + 1; };
  const elig = [];
  let notOk = 0, unrecovered = 0;
  for (const e of events) {
    if (e.outcome !== 'ok') { notOk++; drop('evento_' + e.outcome); continue; }
    const rec = idx.get(e.prompt_sha12);
    if (!rec) { unrecovered++; drop('sem_texto_na_transcricao'); continue; }
    if (rec.text.length !== e.prompt_len) { drop('len_diferente'); continue; } // sha igual e comprimento diferente: não deve acontecer; se acontecer, fora
    const r = eligible(rec, known); if (r) { drop(r); continue; }
    const sess = e.session_id || rec.sess;
    elig.push({ e, rec, sess, t: Number.isFinite(e.hook_ts_ms) ? e.hook_ts_ms : Date.parse(e.ts), prompt: anonymise(clean(rec.text)) });
  }
  const rnd = mulberry32(seed);
  elig.sort((a, b) => a.t - b.t || String(a.sess).localeCompare(String(b.sess)));
  for (let i = elig.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [elig[i], elig[k]] = [elig[k], elig[i]]; }
  const perSess = {}; const picked = [];
  for (const x of elig) { if (picked.length >= n) break; if ((perSess[x.sess] || 0) >= cap) continue; perSess[x.sess] = (perSess[x.sess] || 0) + 1; picked.push(x); }
  picked.sort((a, b) => a.t - b.t);
  const sha8 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
  const items = picked.map((x, i) => ({ id: `d${String(i + 1).padStart(2, '0')}`, source: 'decisor_shadow-events+cc-transcripts', prompt: x.prompt, _sha256_12: sha12(x.prompt), _event_sha12: x.e.prompt_sha12, _chars: x.prompt.length, _session_sha8: sha8(x.sess), _project_sha8: sha8(x.rec.proj), _day: (x.e.ts || '').slice(0, 10), _dispatched: /^\[[^\]]+·\s*S\d/.test(x.rec.text) }));
  // previsões DO EVENTO — ficheiro separado, só com --predictions e só depois dos rótulos
  const predictions = picked.map((x, i) => ({ id: `d${String(i + 1).padStart(2, '0')}`, tier: x.e.tier_D, p_max: x.e.p_max_D, probs: x.e.probs_D, aux: x.e.aux_D, ms: x.e.ms_D, abstain: x.e.abstained_D, tier_regra: x.e.tier_regra, confidence_regra: x.e.confidence_regra, ts: x.e.ts }));
  const meta = { _schema: 'decisor-shadow/corpus-60d', _block: 'mp4', _built_at: new Date().toISOString(), _since_utc: new Date(SINCE).toISOString(), _seed: seed, _cap_per_session: cap, _n_target: n, _events: events.length, _events_not_ok: notOk, _unrecovered: unrecovered, _eligible: elig.length, _eligible_sessions: new Set(elig.map((x) => x.sess)).size, _dropped: why, _excluded_known_sha_count: known.size, _picked: items.length, _picked_sessions: Object.keys(perSess).length, _picked_dispatched: items.filter((i) => i._dispatched).length, _anonymised: 'caminhos do home -> ~, dono -> <owner>, emails -> <email>', _target_reached: items.length >= n };
  return { meta, items, predictions };
}

const isMain = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (isMain) {
  const events = readShadowEvents(LOG, SINCE);
  const { idx, lines } = indexTranscripts(TX);
  const known = knownShas();
  const { meta, items, predictions } = buildCorpus({ events, idx, known });
  console.log(JSON.stringify({ ...meta, _transcript_user_lines: lines }, null, 1));
  if (args.includes('--dry')) process.exit(0);
  if (args.includes('--predictions')) {
    const labels = path.join(path.dirname(OUT), 'labels-60d.json');
    if (!fs.existsSync(labels)) { console.error('RECUSADO: --predictions só depois de results/labels-60d.json existir (cegueira dos rotuladores).'); process.exit(3); }
    const pf = path.join(path.dirname(OUT), 'D-shadow-corpus-60d.json');
    fs.writeFileSync(pf, JSON.stringify({ arm: 'D-shadow (eventos vivos)', _from: path.basename(LOG), at: new Date().toISOString(), rows: predictions }, null, 1));
    console.log(`→ ${pf} (${predictions.length} previsões do evento)`);
  } else {
    if (!meta._target_reached) console.error(`AVISO: ${items.length}/${N} — o pré-registo manda ESPERAR, não baixar n. Ficheiro escrito na mesma para inspecção.`);
    fs.writeFileSync(OUT, JSON.stringify({ ...meta, items }, null, 1));
    console.log(`→ ${OUT} (${items.length} itens, sem previsões)`);
  }
}
