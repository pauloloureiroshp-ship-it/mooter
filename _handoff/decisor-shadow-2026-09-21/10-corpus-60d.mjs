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
import { fileURLToPath } from 'node:url'; import { spawnSync } from 'node:child_process';
import { HERE, ROOT, P1, opt, args } from './lib-common.mjs';

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
  // A10 do round 5: uma fonte em falta não pode falhar em silêncio — fica no meta e o CLI recusa fechar o corpus sem as 4.
  const known = new Set(); known.sources = {};
  try {
    const raw = fs.readFileSync(path.join(P1, 'corpus-63.json'), 'utf8');
    let n = 0; for (const m of raw.matchAll(/sha256:([0-9a-f]{12})/g)) { known.add(m[1]); n++; }
    // r01-r23: não redigidos no P1 (buraco A7 do round 3) — entram pelo texto
    let r = 0; try { for (const it of (JSON.parse(raw).items || [])) if (it.prompt && !/^\[\[redigido/.test(it.prompt)) { known.add(sha12(it.prompt)); r++; } } catch { /* corpus-63 sem items */ }
    known.sources['P1/corpus-63.json'] = { ok: true, markers: n, clear_text: r };
  } catch (e) { known.sources['P1/corpus-63.json'] = { ok: false, error: e.code || String(e.message).slice(0, 60) }; }
  for (const f of ['corpus-40-unredacted.json', 'corpus-60b.json', 'corpus-60c.json']) {
    try { let n = 0; for (const it of JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8')).items) { known.add(sha12(it.prompt)); if (it._sha256_12) known.add(it._sha256_12); n++; } known.sources[f] = { ok: true, items: n }; } catch (e) { known.sources[f] = { ok: false, error: e.code || String(e.message).slice(0, 60) }; }
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
        const key = sha12(text); const rec = { text, proj, sess: f.replace(/\.jsonl$/, ''), ts: j.timestamp || null, toolResult, sidechain: !!j.isSidechain, meta: !!j.isMeta };
        if (!idx.has(key)) idx.set(key, [rec]); else idx.get(key).push(rec); // A10: todas as ocorrências; a sessão do evento escolhe
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

// A9 do round 5: só escalares numéricos/tier — nada do evento passa por cópia de objecto.
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null); const tierOf = (v) => (/^T[0-3]$/.test(String(v)) ? String(v) : null);
export function predictionOf(e, id) {
  const P = e.probs_D || {}, A = e.aux_D || {};
  return { id, tier: tierOf(e.tier_D), p_max: num(e.p_max_D), probs: { T0: num(P.T0), T1: num(P.T1), T2: num(P.T2), T3: num(P.T3) }, aux: { p_needs_repo: num(A.p_needs_repo), p_high_stakes: num(A.p_high_stakes), e_complexity: num(A.e_complexity) }, ms: num(e.ms_D), abstain: e.abstained_D === true, tier_regra: tierOf(e.tier_regra), confidence_regra: num(e.confidence_regra), high_risk_hint: typeof e.high_risk_hint === 'boolean' ? e.high_risk_hint : null, risk_level_regra: ['minimal', 'low', 'medium', 'high'].includes(e.risk_level_regra) ? e.risk_level_regra : null, event_sha12: /^[0-9a-f]{12}$/.test(String(e.prompt_sha12)) ? e.prompt_sha12 : null };
}
// A7 do round 5: um caminho de saída dentro do repo tem de estar gitignorado; fora do repo (tmp dos testes) é livre.
export function assertSafeOut(p, root = ROOT) {
  const abs = path.resolve(p); const inRepo = abs.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep);
  if (!inRepo) return abs;
  const r = spawnSync('git', ['check-ignore', '-q', abs], { cwd: root, stdio: 'ignore' });
  if (r.status !== 0) throw new Error(`RECUSADO: ${abs} está dentro do repo e NÃO está gitignorado — o texto dos prompts nunca pode chegar ao git.`);
  return abs;
}

function mulberry32(x) { return function () { x |= 0; x = x + 0x6D2B79F5 | 0; let t = Math.imul(x ^ x >>> 15, 1 | x); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function buildCorpus({ events, idx, known, n = N, cap = CAP, seed = SEED }) {
  const why = {}; const drop = (k) => { why[k] = (why[k] || 0) + 1; };
  const elig = [];
  let notOk = 0, unrecovered = 0;
  for (const e of events) {
    if (e.outcome !== 'ok') { notOk++; drop('evento_' + e.outcome); continue; }
    const recs = idx.get(e.prompt_sha12) || [];
    if (!recs.length) { unrecovered++; drop('sem_texto_na_transcricao'); continue; }
    // o nome do ficheiro da transcrição É o session_id: exige-se a mesma sessão; sem session_id no evento, só serve se a ocorrência for única
    const rec = e.session_id ? recs.find((r) => r.sess === e.session_id) : (recs.length === 1 ? recs[0] : null);
    if (!rec) { drop(e.session_id ? 'sessao_diferente' : 'ambiguo_sem_sessao'); continue; }
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
  const predictions = picked.map((x, i) => predictionOf(x.e, `d${String(i + 1).padStart(2, '0')}`));
  const okEvents = events.length - notOk;
  const meta = { _schema: 'decisor-shadow/corpus-60d', _block: 'mp4', _built_at: new Date().toISOString(), _since_utc: new Date(SINCE).toISOString(), _seed: seed, _cap_per_session: cap, _n_target: n, _events: events.length, _events_ok: okEvents, _events_not_ok: notOk, _not_ok_rate: events.length ? +(notOk / events.length).toFixed(3) : null, _unrecovered: unrecovered, _unrecovered_rate: okEvents ? +(unrecovered / okEvents).toFixed(3) : null, _known_sources: known.sources || null, _eligible: elig.length, _eligible_sessions: new Set(elig.map((x) => x.sess)).size, _dropped: why, _excluded_known_sha_count: known.size, _picked: items.length, _picked_sessions: Object.keys(perSess).length, _picked_dispatched: items.filter((i) => i._dispatched).length, _anonymised: 'caminhos do home -> ~, dono -> <owner>, emails -> <email>', _target_reached: items.length >= n };
  return { meta, items, predictions };
}

const isMain = path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (isMain) {
  const outAbs = assertSafeOut(OUT); // A7: dentro do repo só se gitignorado
  const events = readShadowEvents(LOG, SINCE);
  const known = knownShas();
  if (args.includes('--predictions')) {
    // A8 do round 5: as previsões ligam-se ao corpus CONGELADO (o ficheiro já escrito) e aos rótulos que o cobrem —
    // nunca a uma re-amostragem de um log mutável. Cada item é procurado pelo seu event_sha12 + sessão.
    const labelsPath = path.join(path.dirname(outAbs), 'labels-60d.json');
    if (!fs.existsSync(outAbs)) { console.error('RECUSADO: não há corpus-60d.json congelado.'); process.exit(3); }
    let corpus, labels; try { corpus = JSON.parse(fs.readFileSync(outAbs, 'utf8')); labels = JSON.parse(fs.readFileSync(labelsPath, 'utf8')); } catch { console.error('RECUSADO: --predictions só com results/labels-60d.json legível (cegueira dos rotuladores).'); process.exit(3); }
    const labelled = new Set((labels.labels || []).filter((l) => /^T[0-3]$/.test(l.tier)).map((l) => l.id));
    const missing = (corpus.items || []).map((it) => it.id).filter((id) => !labelled.has(id));
    if (!corpus.items?.length || missing.length) { console.error(`RECUSADO: rótulos não cobrem o corpus (${missing.length} em falta: ${missing.slice(0, 5).join(',')}…).`); process.exit(3); }
    if (!corpus._target_reached) { console.error('RECUSADO: o corpus congelado não atingiu n_target — o pré-registo manda esperar.'); process.exit(3); }
    const bySha = new Map(); for (const e of events) if (e.outcome === 'ok') { const k = e.prompt_sha12; if (!bySha.has(k)) bySha.set(k, []); bySha.get(k).push(e); }
    const sha8 = (x) => crypto.createHash('sha256').update(String(x)).digest('hex').slice(0, 8);
    const rows = []; const lost = [];
    for (const it of corpus.items) { const cands = (bySha.get(it._event_sha12) || []).filter((e) => sha8(e.session_id || '') === it._session_sha8); if (cands.length !== 1) { lost.push(it.id); continue; } rows.push(predictionOf(cands[0], it.id)); }
    if (lost.length) { console.error(`RECUSADO: ${lost.length} itens do corpus sem evento único correspondente (${lost.slice(0, 5).join(',')}) — o log mudou?`); process.exit(3); }
    const pf = path.join(path.dirname(outAbs), 'D-shadow-corpus-60d.json');
    fs.writeFileSync(pf, JSON.stringify({ arm: 'D-shadow (eventos vivos)', _from: path.basename(LOG), _corpus_sha256: crypto.createHash('sha256').update(fs.readFileSync(outAbs)).digest('hex'), _labels_sha256: crypto.createHash('sha256').update(fs.readFileSync(labelsPath)).digest('hex'), at: new Date().toISOString(), rows }, null, 1));
    console.log(`→ ${pf} (${rows.length} previsões do evento, ligadas ao corpus e aos rótulos por sha)`);
    process.exit(0);
  }
  const { idx, lines } = indexTranscripts(TX);
  const { meta, items } = buildCorpus({ events, idx, known });
  console.log(JSON.stringify({ ...meta, _transcript_user_lines: lines }, null, 1));
  if (args.includes('--dry')) process.exit(0);
  // A10/A11 do round 5: sem as 4 fontes de exclusão, sem n_target, ou com taxas acima de 10 %, o corpus NÃO se fecha.
  const problems = [];
  for (const [src, st] of Object.entries(meta._known_sources || {})) if (!st.ok) problems.push(`fonte de exclusão em falta: ${src}`);
  if (meta._not_ok_rate != null && meta._not_ok_rate > 0.10) problems.push(`eventos não-ok ${(meta._not_ok_rate * 100).toFixed(1)} % > 10 % (disponibilidade)`);
  if (meta._unrecovered_rate != null && meta._unrecovered_rate > 0.10) problems.push(`sem texto recuperável ${(meta._unrecovered_rate * 100).toFixed(1)} % > 10 % (recuperação por sha insuficiente)`);
  if (!meta._target_reached) problems.push(`${items.length}/${N} — o pré-registo manda ESPERAR, não baixar n`);
  if (problems.length && !args.includes('--partial')) { console.error('NÃO FECHADO:\n  - ' + problems.join('\n  - ') + '\n(--partial escreve na mesma, marcado _partial:true, só para inspecção; nunca serve para rotular)'); process.exit(5); }
  fs.writeFileSync(outAbs, JSON.stringify({ ...meta, _partial: problems.length > 0, _problems: problems, items }, null, 1));
  console.log(`→ ${outAbs} (${items.length} itens, sem previsões${problems.length ? ', PARCIAL' : ''})`);
}
