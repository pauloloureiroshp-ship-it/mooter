#!/usr/bin/env node
// review.mjs — P4: os dois revisores sobre as mesmas janelas. Ver protocol.json (congelado).
//   node review.mjs --arm A            auto-revisao: Opus (claude.exe -p), DIFF_SYSTEM_PROMPT do Mooter
//   node review.mjs --arm B            critico != autor: Codex, mesmo prompt, sem acesso ao repo
//   node review.mjs --analyse
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RES = path.join(HERE, 'results');
const W = process.env.P4_REPOS || 'C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-p4'; // pasta dos sujeitos: env P4_REPOS, senao a da corrida de 2026-09-09 (ver setup.mjs)
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const now = () => new Date().toISOString();
const save = (n, o) => { fs.mkdirSync(RES, { recursive: true }); fs.writeFileSync(path.join(RES, n), JSON.stringify(o, null, 1)); };
const load = (n) => { try { return JSON.parse(fs.readFileSync(path.join(RES, n), 'utf8')); } catch { return null; } };
const CLAUDE_EXE = process.env.PROVAS_CLAUDE_EXE || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'); // PROVAS_CLAUDE_EXE: sem isto o caminho e do Windows desta maquina e nao ha como reapontar (achado R12 do exame de 2026-09-09)
const fwd = (p) => p.split('\\').join('/');

const { DIFF_SYSTEM_PROMPT } = await import('file:///' + fwd(path.join(ROOT, 'tools', 'cockpit', 'runner', 'context-pack.mjs')));
const { checkCitation } = await import('file:///' + fwd(path.join(ROOT, 'tools', 'cockpit', 'runner', 'evidence-verifier.mjs')));
const windows = JSON.parse(fs.readFileSync(path.join(HERE, 'windows.json'), 'utf8')).windows;
const userText = (w) => `Ficheiro: ${w.file} (linhas ${w.lo}-${w.hi} de ${w.total_lines})\nAs linhas marcadas com * MUDARAM agora. As outras sao contexto.\n\n${w.text}`;

function parse(text) {
  const t = String(text || '');
  const achado = /\bACHADO\s*:/i.test(t) && !/\bSEM ACHADO\b/i.test(t.split(/\bACHADO\s*:/i)[0] || '');
  const sem = /\bSEM ACHADO\b/i.test(t) && !/\bACHADO\s*:/i.test(t.replace(/\bSEM ACHADO\b/gi, ''));
  const m = t.match(/PROVA\s*:\s*`?([^\s:`]+):(\d+)/i);
  return { verdict: achado ? 'ACHADO' : (sem ? 'SEM ACHADO' : (t.trim() ? 'INVALIDO' : 'VAZIO')), file: m ? m[1] : null, line: m ? Number(m[2]) : null, raw: t.slice(0, 600) };
}
function classify(w, p) {
  const repoRoot = `${W}/${w.repo}`;
  const cit = p.file && p.line ? checkCitation(repoRoot, { file: p.file, line: p.line }) : null;
  const citationValid = !!(cit && cit.ok);
  let outcome;
  if (w.kind === 'mutant') { if (p.verdict === 'ACHADO') outcome = (p.line !== null && Math.abs(p.line - w.line) <= 2) ? 'TP' : 'WRONG_REASON'; else if (p.verdict === 'SEM ACHADO') outcome = 'FN'; else outcome = 'INVALID'; }
  else { if (p.verdict === 'ACHADO') outcome = 'FP'; else if (p.verdict === 'SEM ACHADO') outcome = 'TN'; else outcome = 'INVALID'; }
  return { outcome, citation_valid: citationValid, citation_reason: cit ? cit.reason : null };
}

async function arm(which, only) {
  const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')); if (proto.estado !== 'CONGELADO') throw new Error('nao congelado');
  const file = `${which}.json`; const prev = load(file); const rows = prev ? prev.rows : [];
  const done = new Set(rows.map((r) => r.id)); let fails = 0;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p4-codex-')); // cwd vazio para o Codex: sem acesso ao repo
  for (const w of windows) {
    if (done.has(w.id) || (only && !only.includes(w.id))) continue;
    const t0 = Date.now(); let text = '', exit = null, usage = null, err = '';
    if (which === 'A') {
      const r = spawnSync(CLAUDE_EXE, ['-p', '--model', 'opus', '--system-prompt', DIFF_SYSTEM_PROMPT, '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'], { input: userText(w), encoding: 'utf8', windowsHide: true, timeout: 300000, env: { ...process.env, CLAUDECODE: '' } });
      exit = r.status; err = (r.stderr || '').slice(0, 200);
      try { const j = JSON.parse(r.stdout); text = j.result; usage = j.usage ? { in: j.usage.input_tokens, out: j.usage.output_tokens, cache_read: j.usage.cache_read_input_tokens, cache_create: j.usage.cache_creation_input_tokens, cost: j.total_cost_usd } : null; } catch { text = r.stdout || ''; }
    } else {
      const out = path.join(scratch, `${w.id}.md`);
      const q = (s) => '"' + s.split('\\').join('/') + '"'; // shell:true + caminho com espaco
      const r = spawnSync('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', '-C', q(scratch), '-o', q(out), '-'], { input: DIFF_SYSTEM_PROMPT + '\n\n' + userText(w), encoding: 'utf8', windowsHide: true, timeout: 300000, shell: true });
      exit = r.status; err = (r.stderr || '').slice(0, 200);
      try { text = fs.readFileSync(out, 'utf8'); } catch { text = ''; }
      const tk = (r.stdout || '').match(/tokens used\s*\n?\s*([\d,]+)/i); usage = tk ? { total_reported: Number(tk[1].replace(/,/g, '')) } : null;
    }
    const p = parse(text); const c = classify(w, p);
    rows.push({ id: w.id, kind: w.kind, repo: w.repo, file: w.file, target_line: w.line, arm: which, exit, ms: Date.now() - t0, ...p, ...c, usage, stderr: err });
    console.log(w.id, which, c.outcome, p.verdict, p.file ? `${p.file}:${p.line}` : '-', c.citation_valid ? 'cit-ok' : 'cit-x', Math.round((Date.now() - t0) / 1000) + 's');
    save(file, { arm: which, at: now(), engine: which === 'A' ? 'claude.exe -p --model opus (auto-revisao)' : 'codex exec gpt-6-astra (critico != autor)', system_prompt: 'DIFF_SYSTEM_PROMPT de tools/cockpit/runner/context-pack.mjs', rows });
    fails = exit === 0 ? 0 : fails + 1; if (fails >= 3) { console.error('regra de paragem: 3 falhas consecutivas'); break; }
  }
}

async function analyse() {
  const { wilson, mcnemarExact } = await import('file:///' + fwd(path.join(HERE, '..', 'lib', 'stats.mjs')));
  const out = { at: now(), n_windows: windows.length, n_mutants: windows.filter((w) => w.kind === 'mutant').length, arms: {} };
  const A = load('A.json'), B = load('B.json');
  const per = (d) => { const m = d.rows.filter((r) => r.kind === 'mutant'), c = d.rows.filter((r) => r.kind === 'control'); const cnt = (rs, o) => rs.filter((r) => r.outcome === o).length; const ach = d.rows.filter((r) => r.verdict === 'ACHADO'); const byRepo = {}; for (const repo of ['mooter', 'fastify', 'hono']) { const mm = m.filter((r) => r.repo === repo), cc = c.filter((r) => r.repo === repo); byRepo[repo] = { mutants: mm.length, TP: cnt(mm, 'TP'), FN: cnt(mm, 'FN'), WRONG: cnt(mm, 'WRONG_REASON'), controls: cc.length, FP: cnt(cc, 'FP'), TN: cnt(cc, 'TN') }; } return { n: d.rows.length, mutants: m.length, controls: c.length, TP: cnt(m, 'TP'), FN: cnt(m, 'FN'), WRONG_REASON: cnt(m, 'WRONG_REASON'), INVALID: d.rows.filter((r) => r.outcome === 'INVALID').length, FP: cnt(c, 'FP'), TN: cnt(c, 'TN'), recall: { k: cnt(m, 'TP'), n: m.length, ...wilson(cnt(m, 'TP'), m.length) }, fp_rate: { k: cnt(c, 'FP'), n: c.length, ...wilson(cnt(c, 'FP'), c.length) }, achados: ach.length, citations_valid: ach.filter((r) => r.citation_valid).length, citations_invalid_reasons: ach.filter((r) => !r.citation_valid).map((r) => r.citation_reason), by_repo: byRepo, mean_s: d.rows.reduce((a, r) => a + r.ms, 0) / d.rows.length / 1000, exits: d.rows.reduce((mm, r) => (mm[r.exit] = (mm[r.exit] || 0) + 1, mm), {}) }; };
  if (A) out.arms.A_self_review_opus = per(A);
  if (B) out.arms.B_critic_codex = per(B);
  if (A && B) {
    const a = {}, b = {}; for (const r of A.rows) a[r.id] = r; for (const r of B.rows) b[r.id] = r;
    let bw = 0, aw = 0; for (const w of windows.filter((x) => x.kind === 'mutant')) { const ta = a[w.id] && a[w.id].outcome === 'TP', tb = b[w.id] && b[w.id].outcome === 'TP'; if (tb && !ta) bw++; if (ta && !tb) aw++; }
    const m1 = mcnemarExact(bw, aw); out.mcnemar_mutants_B_catches_more = { B_wins: bw, A_wins: aw, discordant: m1.n, p_B_gt_A: m1.p_one_sided_A_gt_B, p_A_gt_B: m1.p_one_sided_B_gt_A, p_two_sided: m1.p_two_sided };
    let bf = 0, af = 0; for (const w of windows.filter((x) => x.kind === 'control')) { const fa = a[w.id] && a[w.id].outcome === 'FP', fb = b[w.id] && b[w.id].outcome === 'FP'; if (fa && !fb) af++; if (fb && !fa) bf++; }
    const m2 = mcnemarExact(af, bf); out.mcnemar_controls_B_fewer_FP = { A_FP_only: af, B_FP_only: bf, discordant: m2.n, p_B_fewer: m2.p_one_sided_A_gt_B, p_two_sided: m2.p_two_sided };
    out.per_window = windows.map((w) => `${w.id}:${(a[w.id] || {}).outcome || '-'}/${(b[w.id] || {}).outcome || '-'}`);
  }
  save('analysis.json', out); console.log(JSON.stringify(out, null, 1));
}

if (has('--analyse')) await analyse();
else if (opt('--arm')) await arm(opt('--arm'), opt('--only') ? opt('--only').split(',') : null);
else { console.error('uso: --arm A|B [--only ids] | --analyse'); process.exit(2); }
