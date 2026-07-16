#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * handoff-preflight.js — zero-LLM scaffold for the Perfect Handoff.
 *
 * WHY THIS EXISTS (2026-07-16, learned the expensive way)
 * ------------------------------------------------------
 * In the Mooter 2.0 cycle a handoff was written three times before it was
 * right. The failure was never intelligence — it was the absence of a
 * checklist. `docs/strategy/PERFECT_HANDOFF_SPEC.md` defines the exact
 * fields the Cowork needs, and nothing in the flow forced anyone to read it.
 * An agent that does not know a field exists cannot fill it, and a missing
 * field reads as "there was nothing to say".
 *
 * THE INSIGHT: the Perfect Handoff is ~90% MECHANICAL.
 * WORKTREE, WORK, GATE, UNPUSHED, BOARD, TIME and STATE all fall out of git
 * and the filesystem. They need no model at all. The spec itself already
 * demotes the only genuinely generative field to "~narrativa (qwen,
 * best-effort) — claramente opcional, nunca load-bearing".
 *
 * So this tool is deterministic, free, and cannot hallucinate:
 *   1. It PARSES the spec for the required field list (anti-drift: if the
 *      spec grows a field, this tool fails instead of silently omitting it).
 *   2. It fills every mechanical field from git/fs — measured, never guessed.
 *   3. It leaves judgement fields as loud <<TODO>> markers, so an omission
 *      is impossible to mistake for an empty truth.
 *   4. Anything it cannot verify becomes `n/d`, per the spec's golden rule:
 *      "Nunca dizer 'limpo/0 unpushed/✅' sem ser verdade. Quando incerto →
 *      'n/d', nunca palpite." (PERFECT_HANDOFF_SPEC.md:95)
 *
 * The local moo (Ollama) fills only the narrative garnish, in parallel, for
 * free. The cloud model fills only judgement. Cost of the 90%: $0.
 *
 * Usage:
 *   node tools/handoff-preflight.js                 # render skeleton to stdout
 *   node tools/handoff-preflight.js --json          # machine-readable facts
 *   node tools/handoff-preflight.js --check         # exit 1 if spec drifted
 *   node tools/handoff-preflight.js --out FILE      # write skeleton to FILE
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const SPEC = path.join(REPO, 'docs', 'strategy', 'PERFECT_HANDOFF_SPEC.md');

/** The fields this tool knows how to emit. Checked against the spec at runtime. */
const KNOWN_FIELDS = [
  'STATE', 'WORKTREE', 'GATE', 'WORK', 'DECISIONS', 'PENDING', 'NEXT',
  'BOARD', 'RISK', 'UNPUSHED', 'NEXT FOR COWORK', 'ATENÇÃO',
];

/** Fields no tool can derive — they need a human or a judgement call. */
const JUDGEMENT_FIELDS = {
  GOAL: 'o objectivo macro que liga as fases',
  INTENT: 'o objectivo original do masterprompt (path + 1 linha)',
  'A ÚNICA COISA': 'a acção de maior alavanca agora — corta o overwhelm numa linha',
  DECISIONS: 'Q verbatim + escolha + porquê (o journal só guarda hashes — ver nota)',
  PENDING: 'Q INTEIRA + TODAS as opções (nunca truncar — buraco nº2 do spec)',
  RISK: 'só divergência REAL, não artefacto de tree partilhado',
  'NEXT FOR COWORK': 'só se genuinamente limpo',
};

function sh(cmd, args, cwd = REPO) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null; // caller turns null into n/d — never into a guess
  }
}

/**
 * Parse the spec's code fences for FIELD: lines. This is the anti-drift gate:
 * the spec is the source of truth for what a handoff must carry, so if it
 * grows a field this tool does not know, we fail loudly rather than ship a
 * handoff with a silent hole — which is exactly the bug this file exists for.
 */
function specFields() {
  if (!fs.existsSync(SPEC)) return { ok: false, fields: [], err: `spec ausente: ${SPEC}` };
  const text = fs.readFileSync(SPEC, 'utf8');
  const fields = new Set();
  for (const m of text.matchAll(/^([A-ZÇÃÕÉ][A-ZÇÃÕÉ ]{2,}):/gm)) {
    fields.add(m[1].trim());
  }
  return { ok: true, fields: [...fields].sort(), err: null };
}

function checkSpecDrift() {
  const { ok, fields, err } = specFields();
  if (!ok) return { drifted: true, unknown: [], err };
  const unknown = fields.filter((f) => !KNOWN_FIELDS.includes(f));
  return { drifted: unknown.length > 0, unknown, err: null };
}

/** Mechanical git truth. Every value is measured; failures become null → n/d. */
function gitFacts() {
  const branch = sh('git', ['branch', '--show-current']);
  const head = sh('git', ['rev-parse', '--short', 'HEAD']);
  const upstream = sh('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) || 'origin/main';
  const counts = sh('git', ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]);
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  const statusRaw = sh('git', ['status', '--short']) || '';
  const lines = statusRaw ? statusRaw.split('\n') : [];
  const dirty = lines.filter((l) => !l.startsWith('??')).length;
  const untracked = lines.filter((l) => l.startsWith('??')).length;
  const stat = sh('git', ['diff', '--shortstat', `${upstream}..HEAD`]);
  const commits = (sh('git', ['log', '--format=%h %s', `${upstream}..HEAD`]) || '')
    .split('\n').filter(Boolean);
  const lastTs = sh('git', ['log', '-1', '--format=%aI']);

  // STATE is DERIVED, never asserted: the spec's most important field.
  let state = 'in-progress';
  if (ahead > 0 && dirty === 0) state = 'parked (precisa push)';
  else if (ahead === 0 && dirty === 0) state = 'landed';
  else if (dirty > 0) state = 'in-progress (dirty)';

  return { branch, head, upstream, ahead, behind, dirty, untracked, stat, commits, lastTs, state };
}

/** Every worktree, so UNPUSHED is the sum across all of them and not a lie. */
function worktrees() {
  const raw = sh('git', ['worktree', 'list', '--porcelain']);
  if (!raw) return [];
  const out = [];
  let cur = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9) };
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5, 12);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === '') { if (cur.path) out.push(cur); cur = {}; }
  }
  if (cur.path) out.push(cur);
  return out;
}

/** The GATE must be mechanical. Anything not actually run stays n/d. */
function gateFacts() {
  const shaFile = path.join(REPO, 'tools', 'router', 'classify.js.sha256');
  const target = path.join(REPO, 'tools', 'router', 'classify.js');
  let classifySha = 'n/d';
  if (fs.existsSync(shaFile) && fs.existsSync(target)) {
    const expected = fs.readFileSync(shaFile, 'utf8').trim();
    const actual = require('node:crypto')
      .createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    classifySha = expected === actual ? '✓ intacto' : `✗ DIVERGE (${actual.slice(0, 8)}…)`;
  }
  return {
    classifySha,
    // Never claimed green from a file listing — only an actual run may fill this.
    tests: 'n/d (não executado neste preflight)',
  };
}

/**
 * Vault + Notion freshness. This does NOT read the vault's meaning — it only
 * answers "is the thing I need to sign a footer actually reachable?". If it
 * is not, the footer must say n/d instead of inventing a score, which is the
 * precise failure this cycle hit with `council 8/8`.
 */
function canonChecks() {
  const home = os.homedir();
  const vault = [path.join(home, 'paulo-vault'), path.join(home, 'Documents', 'paulo-vault')]
    .find((p) => fs.existsSync(p)) || null;
  const proto = vault ? path.join(vault, '00-core', 'reasoning-protocol.md') : null;
  const protoExists = proto ? fs.existsSync(proto) : false;

  // The 8 pre-dispatch red-team questions: the protocol references them but
  // they live in a Cowork memory. If they are not in the vault, no agent can
  // honestly sign `council 8/8` — so we surface that instead of guessing.
  let council = 'n/d — 8 perguntas não encontradas no vault';
  if (protoExists) {
    const t = fs.readFileSync(proto, 'utf8');
    const hasList = /pre-dispatch[\s\S]{0,400}?1\.\s.*\n\s*2\.\s/.test(t);
    council = hasList ? '✓ 8 perguntas resolvíveis no vault' : 'n/d — protocolo remete p/ memória do Cowork';
  }

  // CCA-F: the `CCA: n/5` footer needs a definition of the 5 criteria.
  const ccaDoc = [path.join(REPO, 'AUDIT_CCA.md'), path.join(REPO, 'docs', 'AUDIT_CCA.md')]
    .find((p) => fs.existsSync(p)) || null;

  const mirror = vault ? path.join(vault, '80-notion-mirror') : null;
  let notion = 'n/d';
  if (mirror && fs.existsSync(mirror)) {
    const newest = fs.readdirSync(mirror, { recursive: true })
      .map((f) => path.join(mirror, String(f)))
      .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } })
      .reduce((a, f) => Math.max(a, fs.statSync(f).mtimeMs), 0);
    const days = newest ? Math.floor((Date.now() - newest) / 86400000) : null;
    notion = days === null ? 'n/d' : `${days}d${days > 3 ? ' ⚠️ stale (>3d)' : ' ✓'}`;
  }

  return {
    vault: vault || 'n/d',
    council,
    cca: ccaDoc ? `✓ ${path.relative(REPO, ccaDoc)}` : 'os 5 critérios do CCA-F não estão definidos no repo',
    notion,
  };
}

/**
 * Extract the session's Q&A VERBATIM from the Claude Code transcript.
 *
 * This is the field that hurt most. The spec's hole nº2 is "PENDING truncado —
 * preciso da pergunta COMPLETA + TODAS as opções, não 300c", and the Live
 * Context Accumulator cannot help: it emits kind:decision carrying only
 * output_hash/idem_key — a sha256, never the question. So the 2026-07-16 cycle
 * hand-transcribed nine questions through a cloud model.
 *
 * It never needed a model at all. The transcript holds every AskUserQuestion
 * tool_use (question + every option + descriptions) and the tool_result with
 * the chosen answers. Recovering them is JSON.parse — deterministic, free, and
 * verbatim by construction, which is exactly what the spec demands.
 */
function extractQA(sid) {
  const projects = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projects)) return { ok: false, err: 'sem ~/.claude/projects', rounds: [] };

  /** @type {string[]} */
  const candidates = [];
  for (const dir of fs.readdirSync(projects)) {
    const full = path.join(projects, dir);
    let entries;
    try { entries = fs.readdirSync(full); } catch { continue; }
    for (const f of entries) {
      if (!f.endsWith('.jsonl')) continue;
      if (sid && !f.startsWith(sid)) continue;
      candidates.push(path.join(full, f));
    }
  }
  if (!candidates.length) return { ok: false, err: sid ? `sem transcript para sid ${sid}` : 'sem transcripts', rounds: [] };

  // Newest wins when no sid is pinned — and we report which file we read, so
  // the caller can catch a wrong-session pick instead of trusting it blindly.
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const file = candidates[0];

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  /** @type {{id:string,questions:any[]}[]} */
  const asks = [];
  /** @type {Map<string,string>} */
  const answers = new Map();

  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = e && e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b.type === 'tool_use' && b.name === 'AskUserQuestion' && b.input && Array.isArray(b.input.questions)) {
        asks.push({ id: b.id, questions: b.input.questions });
      }
      if (b.type === 'tool_result' && b.tool_use_id && typeof b.content === 'string') {
        answers.set(b.tool_use_id, b.content);
      }
    }
  }

  const rounds = asks.map((a, i) => ({
    round: i + 1,
    questions: a.questions.map((q) => {
      const raw = answers.get(a.id) || '';
      // The harness echoes: "<question>"="<chosen>" — pair them by question text.
      const esc = q.question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = raw.match(new RegExp(`"${esc}"="([^"]*)"`));
      return {
        question: q.question,
        header: q.header,
        options: q.options.map((o) => ({ label: o.label, description: o.description })),
        chosen: m ? m[1] : 'n/d (sem resposta registada no transcript)',
      };
    }),
  }));

  return { ok: true, err: null, file, rounds };
}

/** Render the recovered Q&A in the spec's DECISIONS shape — full text, never truncated. */
function renderQA(qa) {
  if (!qa.ok) return `  n/d — ${qa.err}`;
  const out = [`  (extraído verbatim de ${path.basename(qa.file)} — zero LLM)`];
  let n = 0;
  for (const r of qa.rounds) {
    for (const q of r.questions) {
      n += 1;
      out.push('');
      out.push(`  Q${n}. "${q.question}"`);
      q.options.forEach((o, i) => out.push(`     ${i + 1}) ${o.label} — ${o.description}`));
      out.push(`     → escolheu: "${q.chosen}"`);
    }
  }
  out.push('');
  out.push(`  total: ${n} perguntas · ${qa.rounds.length} rondas`);
  return out.join('\n');
}

function todo(name) {
  return `<<TODO: ${JUDGEMENT_FIELDS[name] || name}>>`;
}

function render(f) {
  const { git, wts, gate, canon, drift } = f;
  const nd = (v) => (v === null || v === undefined || v === '' ? 'n/d' : v);
  const pushed = git.ahead > 0 ? `UNPUSHED ⚠ (${git.ahead})` : 'pushed ✓';

  const unpushedBlock = wts.map((w) => {
    const c = sh('git', ['rev-list', '--count', `origin/main..${w.branch || w.head}`], w.path);
    const d = sh('git', ['status', '--short'], w.path);
    const dn = d ? d.split('\n').filter((l) => l && !l.startsWith('??')).length : 0;
    if (c === null) return `  ${w.branch || w.head}  n/d`;
    if (Number(c) === 0 && dn === 0) return null; // clean+pushed: not worth the noise
    return `  ${(w.branch || w.head).padEnd(42)} ${String(c).padStart(3)} commits · ${dn} sujos`;
  }).filter(Boolean).join('\n') || '  (nada por push em nenhum worktree)';

  return `⇄ MOO HANDOFF · ${todo('INTENT')} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
TL;DR:    ${git.state} · ${git.ahead ?? 'n/d'} commits por push · ${git.dirty} sujos
GOAL:     ${todo('GOAL')}
INTENT:   ${todo('INTENT')}

🎯 A ÚNICA COISA: ${todo('A ÚNICA COISA')}

STATE:    ${git.state}
WORKTREE: ${REPO} · ${nd(git.branch)} @${nd(git.head)} · ${git.ahead ?? 'n/d'} ahead of ${git.upstream} · ${pushed}
GATE:     classify.js sha ${gate.classifySha} · testes ${gate.tests}
WORK:     ${nd(git.stat)}
          commits: ${git.commits.length ? '\n            ' + git.commits.join('\n            ') : 'nenhum'}
DECISIONS:
${renderQA(f.qa)}
  Nota: NÃO vem do Ledger. O Live Context Accumulator emite kind:decision só com
  output_hash/idem_key — hashes, sem Q, opções ou escolha. Isto foi recuperado do
  transcript do Claude Code, que guarda o AskUserQuestion inteiro. Zero LLM.
PENDING:
  ${todo('PENDING')}
RISK:
  ${todo('RISK')}

UNPUSHED (todos os worktrees):
${unpushedBlock}

BOARD:
  ${todo('BOARD')}

NEXT:     ${todo('NEXT')}
NEXT FOR COWORK:
  ${todo('NEXT FOR COWORK')}

~narrativa (qwen, best-effort · nunca load-bearing): <<local moo preenche>>

conf:     git ✓ (medido) · gate ${gate.classifySha.startsWith('✓') ? '✓' : 'n/d'} · narrativa ~
canon:    vault ${canon.vault === 'n/d' ? 'n/d' : '✓'} · council ${canon.council} · notion ${canon.notion}

Rodapés
CCA: ${canon.cca.startsWith('✓') ? '<<preencher n/5>>' : 'n/d'} — ${canon.cca}
🔍 council: ${canon.council.startsWith('✓') ? '<<8/8 + objeção mais forte + como resolvida>>' : canon.council}
  ${canon.council.startsWith('✓') ? '' : '→ assina n/d, NUNCA 8/8. Regra de ouro do spec:95 — "quando incerto, n/d, nunca palpite".'}
${drift.drifted ? `\n⚠️ SPEC DRIFT: o spec tem campos que este preflight não conhece: ${drift.unknown.join(', ')}\n   Actualiza KNOWN_FIELDS em tools/handoff-preflight.js antes de confiar neste esqueleto.` : ''}
⇄ END`;
}

function main() {
  const argv = process.argv.slice(2);
  const drift = checkSpecDrift();

  if (argv.includes('--check')) {
    if (drift.err) { console.error(`handoff-preflight: ${drift.err}`); process.exit(1); }
    if (drift.drifted) {
      console.error(`handoff-preflight: SPEC DRIFT — campos desconhecidos: ${drift.unknown.join(', ')}`);
      process.exit(1);
    }
    console.log('handoff-preflight: OK — esqueleto cobre todos os campos do spec');
    return;
  }

  const sidIdx = argv.indexOf('--sid');
  const sid = sidIdx !== -1 ? argv[sidIdx + 1] : (process.env.CLAUDE_SESSION_ID || null);
  const qa = extractQA(sid);

  if (argv.includes('--qa')) {
    console.log(renderQA(qa));
    return;
  }

  const facts = { git: gitFacts(), wts: worktrees(), gate: gateFacts(), canon: canonChecks(), drift, qa };

  if (argv.includes('--json')) {
    console.log(JSON.stringify(facts, null, 2));
    return;
  }

  const out = render(facts);
  const i = argv.indexOf('--out');
  if (i !== -1 && argv[i + 1]) {
    fs.writeFileSync(argv[i + 1], out + '\n');
    console.log(`handoff-preflight: escrito → ${argv[i + 1]}`);
    return;
  }
  console.log(out);
}

if (require.main === module) main();

module.exports = {
  specFields, checkSpecDrift, gitFacts, worktrees, gateFacts, canonChecks,
  extractQA, renderQA, render, KNOWN_FIELDS,
};
