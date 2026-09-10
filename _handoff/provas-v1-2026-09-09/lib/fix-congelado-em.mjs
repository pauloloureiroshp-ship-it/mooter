// fix-congelado-em.mjs — substitui o congelado_em escrito a mao pelo instante do commit git
// que introduziu o protocol.json (a unica prova de anterioridade que vale). ERRATA registada.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = process.cwd(); const PK = path.join(ROOT, '_handoff', 'provas-v1-2026-09-09');
for (const d of ['P3-obediencia', 'P4-critico-nao-autor', 'P5-atestacao-de-egress', 'P6-custo-na-linha']) {
  const rel = `_handoff/provas-v1-2026-09-09/${d}/protocol.json`;
  const log = execFileSync('git', ['log', '--diff-filter=A', '--format=%H %cI', '--', rel], { encoding: 'utf8' }).trim().split('\n').pop();
  const [sha, iso] = log.split(' ');
  const f = path.join(PK, d, 'protocol.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const old = j.congelado_em;
  j.congelado_em = new Date(iso).toISOString();
  j.congelado_em_fonte = `git commit ${sha.slice(0, 8)} (%cI ${iso}); o valor anterior '${old}' era escrito a mao e errado — ERRATA-timestamps.md`;
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
  console.log(d, old, '->', j.congelado_em, sha.slice(0, 8));
}
