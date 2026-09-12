// hook-timings.mjs — le o decisions.log do HOME isolado do braco A-hook e anexa classify_ms por caminho.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const f = path.join(HERE, 'results', 'A-hook.json');
const h = JSON.parse(fs.readFileSync(f, 'utf8'));
const log = path.join(h.home_isolado, '.claude', 'tools', 'router', 'decisions.log');
const L = fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.includes('"classified"')).map((l) => JSON.parse(l));
const st = (p) => { const v = L.filter((x) => x.classify_path === p).map((x) => x.classify_ms).sort((a, b) => a - b); return v.length ? { n: v.length, p50: +v[Math.floor(v.length / 2)].toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), max: +v[v.length - 1].toFixed(2) } : null; };
h.hook_internal_classify_ms = { spawn: st('spawn'), cache: st('cache') };
h.classify_path_counts = { spawn: (st('spawn') || {}).n || 0, cache: (st('cache') || {}).n || 0 };
h.arbiter_calls_logged = L.filter((x) => x.arbiter_honored != null).length;
fs.writeFileSync(f, JSON.stringify(h, null, 1));
console.log(JSON.stringify({ classify_path_counts: h.classify_path_counts, hook_internal_classify_ms: h.hook_internal_classify_ms, arbiter: h.arbiter_calls_logged }));
