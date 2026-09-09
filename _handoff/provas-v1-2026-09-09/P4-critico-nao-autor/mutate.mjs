#!/usr/bin/env node
// mutate.mjs — P4: planta defeitos e verifica que o teste do repo os mata.
//   node mutate.mjs [--repo mooter|fastify|hono] [--max 10] [--budget-min 60]
// Escreve mutants.json (os mortos, na ordem) e windows.json (mutante + controlo).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 'C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-p4';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MAX = Number(opt('--max', 10)); const BUDGET_MS = Number(opt('--budget-min', 60)) * 60000;
const onlyRepo = opt('--repo');
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')); if (proto.estado !== 'CONGELADO') throw new Error('nao congelado');

const OPS = [
  { name: '<= -> <', re: /<=(?!=)/, to: '<' },
  { name: '< -> <=', re: /(?<![<=!])<(?![<=])/, to: '<=' },
  { name: '=== -> !==', re: /===/, to: '!==' },
  { name: '!== -> ===', re: /!==/, to: '===' },
  { name: '&& -> ||', re: /&&/, to: '||' },
  { name: 'return true -> return false', re: /return true\b/, to: 'return false' },
  { name: '+ 1 -> - 1', re: /\+ 1\b/, to: '- 1' },
  { name: 'length - 1 -> length', re: /length - 1\b/, to: 'length' },
  { name: 'if (!x) -> if (x)', re: /if \(!(\w)/, to: 'if ($1' },
  { name: '> 0 -> >= 0', re: /> 0\b/, to: '>= 0' },
  { name: 'Math.max -> Math.min', re: /Math\.max/, to: 'Math.min' },
  { name: 'guarda removida', re: /^\s*if \(.*\) (throw|return)\b.*;\s*$/, to: '' },
];

const REPOS = {
  mooter: { dir: `${W}/mooter`, pairs: () => { const out = []; for (const [srcDir, ext, testExt] of [['tools/router', '.js', '.test.js'], ['tools/cockpit/runner', '.mjs', '.test.mjs']]) { const d = path.join(`${W}/mooter`, srcDir); for (const f of fs.readdirSync(d).sort()) { if (!f.endsWith(ext) || f.endsWith(testExt)) continue; const t = f.replace(new RegExp(ext.replace('.', '\\.') + '$'), testExt); if (fs.existsSync(path.join(d, t))) out.push({ src: `${srcDir}/${f}`, test: `${srcDir}/${t}`, cmd: ['node', '--test', `${srcDir}/${t}`] }); } } return out; } },
  fastify: { dir: `${W}/fastify`, pairs: () => { const out = []; const d = `${W}/fastify/lib`; for (const f of fs.readdirSync(d).sort()) { if (!f.endsWith('.js')) continue; const t = `test/${f.replace(/\.js$/, '.test.js')}`; if (fs.existsSync(`${W}/fastify/${t}`)) out.push({ src: `lib/${f}`, test: t, cmd: ['node', '--test', t] }); } return out; } },
  hono: { dir: `${W}/hono`, pairs: () => { const out = []; const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|dist/.test(f)) walk(p); continue; } if (!f.endsWith('.ts') || /\.test\.ts$|\.d\.ts$/.test(f)) continue; const t = p.replace(/\.ts$/, '.test.ts'); if (fs.existsSync(t)) out.push({ src: path.relative(`${W}/hono`, p).split('\\').join('/'), test: path.relative(`${W}/hono`, t).split('\\').join('/'), cmd: ['npx', 'vitest', 'run', path.relative(`${W}/hono`, t).split('\\').join('/')] }); } }; walk(`${W}/hono/src/utils`); walk(`${W}/hono/src/helper`); walk(`${W}/hono/src/middleware`); return out; } },
};

function runTest(dir, cmd) {
  const t0 = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: dir, encoding: 'utf8', timeout: 120000, windowsHide: true, shell: process.platform === 'win32', env: { ...process.env, CI: '1', NODE_OPTIONS: '' } });
  return { ok: r.status === 0, status: r.status, ms: Date.now() - t0, tail: ((r.stdout || '') + (r.stderr || '')).slice(-600) };
}

const started = Date.now();
const allMutants = []; const allWindows = [];
for (const [repo, R] of Object.entries(REPOS)) {
  if (onlyRepo && repo !== onlyRepo) continue;
  const mutants = []; const pairs = R.pairs(); const baselineOk = {};
  console.log(`== ${repo}: ${pairs.length} pares fonte/teste`);
  outer: for (const pr of pairs) {
    if (mutants.length >= MAX || Date.now() - started > BUDGET_MS) break;
    const abs = path.join(R.dir, pr.src); const orig = fs.readFileSync(abs, 'utf8'); const lines = orig.split('\n');
    let baseline = baselineOk[pr.test];
    if (baseline === undefined) { const b = runTest(R.dir, pr.cmd); baseline = baselineOk[pr.test] = b.ok; console.log(`  baseline ${pr.test}: ${b.ok ? 'passa' : 'FALHA (ignorado)'} ${b.ms}ms`); }
    if (!baseline) continue;
    let perFile = 0;
    for (let i = 0; i < lines.length && perFile < 2; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line) || line.trim() === '') continue;
      for (const op of OPS) {
        if (!op.re.test(line)) continue;
        const mutated = op.to === '' ? '' : line.replace(op.re, op.to);
        if (mutated === line) continue;
        const copy = lines.slice(); copy[i] = mutated;
        fs.writeFileSync(abs, copy.join('\n'));
        const r = runTest(R.dir, pr.cmd);
        fs.writeFileSync(abs, orig);
        const killed = !r.ok;
        console.log(`  ${killed ? 'MORTO' : 'sobrevive'} ${pr.src}:${i + 1} [${op.name}] ${r.ms}ms`);
        if (killed) {
          const m = { id: `${repo}-${String(mutants.length + 1).padStart(2, '0')}`, repo, file: pr.src, line: i + 1, op: op.name, before: line, after: mutated, test: pr.test, cmd: pr.cmd.join(' '), test_ms: r.ms, fail_tail: r.tail.slice(-300) };
          mutants.push(m); perFile++;
          const lo = Math.max(1, i + 1 - 25), hi = Math.min(lines.length, i + 1 + 25);
          const render = (arr) => arr.slice(lo - 1, hi).map((l, k) => `${String(lo + k).padStart(5)}${lo + k === i + 1 ? ' *' : '  '} ${l}`).join('\n');
          allWindows.push({ id: m.id + '-M', mutant_id: m.id, kind: 'mutant', repo, file: pr.src, line: i + 1, lo, hi, total_lines: lines.length, text: render(copy) });
          allWindows.push({ id: m.id + '-C', mutant_id: m.id, kind: 'control', repo, file: pr.src, line: i + 1, lo, hi, total_lines: lines.length, text: render(lines) });
          if (mutants.length >= MAX) break outer;
        }
        break; // um operador por linha
      }
    }
  }
  console.log(`== ${repo}: ${mutants.length} mutantes mortos em ${Math.round((Date.now() - started) / 1000)}s`);
  allMutants.push(...mutants);
}
fs.writeFileSync(path.join(HERE, 'mutants.json'), JSON.stringify({ _generated: new Date().toISOString(), _rule: proto.defeitos.seleccao, n: allMutants.length, mutants: allMutants }, null, 1));
fs.writeFileSync(path.join(HERE, 'windows.json'), JSON.stringify({ _generated: new Date().toISOString(), n: allWindows.length, windows: allWindows }, null, 1));
console.log('mutants', allMutants.length, 'windows', allWindows.length);
