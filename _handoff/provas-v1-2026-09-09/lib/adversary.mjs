#!/usr/bin/env node
// adversary.mjs — R5 do MP: critico != autor. Envia protocolo + veredicto + slide + analise de uma prova ao Codex CLI
// (motor diferente do autor), em cwd vazio e read-only, e grava o prompt enviado e a resposta integra.
//   node lib/adversary.mjs <pasta-da-prova> "<foco do ataque>" [--round N] [--extra ficheiro ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const dir = path.resolve(args[0]); const focus = args[1] || '';
const round = args.includes('--round') ? Number(args[args.indexOf('--round') + 1]) : 1;
const extra = args.includes('--extra') ? args.slice(args.indexOf('--extra') + 1).filter((a) => !a.startsWith('--')) : [];
const CAP = 40000;
const read = (f) => { try { const s = fs.readFileSync(f, 'utf8'); return s.length > CAP ? s.slice(0, CAP) + `\n… [truncado a ${CAP} chars de ${s.length}]` : s; } catch { return null; } };
const id = path.basename(dir).split('-')[0];
const parts = [];
parts.push(`You are the ADVERSARY (Codex, gpt-6-astra) for a pre-registered evidence package — proof ${id}. The author is a different engine (Claude). Your job is to KNOCK DOWN the numbers and the claims, not to comment on them. ${focus}\nFor EACH attack give: id (${id}-NN), severity (fatal|serious|minor), the exact claim attacked, why it may not hold, and what evidence would settle it. Then: SURVIVE / REWORD / DEAD lists, and a final line SLIDE PUBLISHABLE AS IS / WITH THESE EDITS (give the edits) / NOT PUBLISHABLE. Be concrete and merciless; a verdict that only approves has not run. Do not rewrite the package. You have no repo access: attack what is in front of you, and say explicitly what you could not verify.`);
for (const [label, f] of [['PROTOCOL', 'protocol.json'], ['AMENDMENTS', 'AMENDMENT-1.md'], ['VERDICT', 'verdict.md'], ['SLIDE', 'slide.md'], ['ANALYSIS', path.join('results', 'analysis.json')]]) {
  const s = read(path.join(dir, f)); if (s) parts.push(`\n=== ${label} (${f}) ===\n${s}`);
}
for (const f of extra) { const s = read(path.resolve(f)); if (s) parts.push(`\n=== EXTRA (${path.basename(f)}) ===\n${s}`); }
const prompt = parts.join('\n');
fs.writeFileSync(path.join(dir, round === 1 ? 'adversary-prompt-sent.txt' : `adversary-prompt-sent-round${round}.txt`), prompt);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-adv-'));
const out = path.join(scratch, 'out.md');
const q = (s) => '"' + s.split('\\').join('/') + '"';
const t0 = Date.now();
const r = spawnSync('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', '-C', q(scratch), '-o', q(out), '-'], { input: prompt, encoding: 'utf8', windowsHide: true, timeout: 900000, shell: true });
let text = ''; try { text = fs.readFileSync(out, 'utf8'); } catch { /* */ }
const tk = (r.stdout || '').match(/tokens used\s*\n?\s*([\d,]+)/i);
const header = `<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round ${round}; exit ${r.status}; ${Math.round((Date.now() - t0) / 1000)} s; tokens_reported ${tk ? tk[1] : 'n/d'}; prompt_chars ${prompt.length}; at ${new Date().toISOString()} -->\n\n`;
fs.writeFileSync(path.join(dir, `adversary-codex-round${round}.md`), header + (text || `(sem saida) stderr: ${(r.stderr || '').slice(0, 2000)}`));
console.log(`${id} round ${round}: exit ${r.status}, ${text.length} chars, ${Math.round((Date.now() - t0) / 1000)} s, tokens ${tk ? tk[1] : 'n/d'}`);
process.exit(r.status === 0 && text ? 0 : 1);
