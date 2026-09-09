import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const h = JSON.parse(fs.readFileSync(path.join(HERE, 'results', 'A-hook.json'), 'utf8'));
const log = path.join(h.home_isolado, '.claude', 'tools', 'router', 'decisions.log');
const ev = {}; const oa = [];
for (const ln of fs.readFileSync(log, 'utf8').split('\n')) { if (!ln.startsWith('{')) continue; const j = JSON.parse(ln); ev[j.event] = (ev[j.event] || 0) + 1; if (/option_a/.test(j.event)) oa.push(j); }
console.log(JSON.stringify({ events: ev, option_a_sample: oa.slice(0, 2) }, null, 1));
h.isolated_log_events = ev; fs.writeFileSync(path.join(HERE, 'results', 'A-hook.json'), JSON.stringify(h, null, 1));
