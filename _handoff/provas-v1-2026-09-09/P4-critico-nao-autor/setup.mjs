#!/usr/bin/env node
// setup.mjs — P4: prepara a pasta dos sujeitos (W) para mutate.mjs e review.mjs.
//   node setup.mjs [--dry-run]
// Clona os tres sujeitos nos commits pinados em protocol.json (sujeitos.*) e corre
// `npm install --ignore-scripts` em cada um (como protocol.json -> sujeitos.clonados_em).
// Nao gera mutantes nem corre revisoes. Idempotente: clone existente e so re-apontado.
// Escrito DEPOIS da corrida de 2026-09-09 (AMENDMENT-1.md, (v)); a corrida usou clones
// feitos a mao na pasta por omissao. W: env P4_REPOS, senao a pasta da corrida.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = process.env.P4_REPOS || 'C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-p4';
const DRY = process.argv.includes('--dry-run');
const proto = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8'));
const pin = (s) => String(s).trim().split(/\s+/)[0]; // "97ad846b (102 188 linhas)" -> "97ad846b"

// URLs lidos de W/<repo>/.git/config (remote "origin") dos clones da corrida de 2026-09-09.
// mooter: a corrida clonou a worktree local; o mesmo commit (97ad846b) esta em origin/main de
// https://github.com/pauloloureiroshp-ship-it/mooter.git — P4_MOOTER_URL para usar esse.
const SUBJECTS = {
  mooter: { url: process.env.P4_MOOTER_URL || 'C:/Users/Paulo Loureiro/frugal/.claude/worktrees/pacote-provas-v1-255558', commit: pin(proto.sujeitos.mooter) },
  fastify: { url: 'https://github.com/fastify/fastify.git', commit: pin(proto.sujeitos.fastify) },
  hono: { url: 'https://github.com/honojs/hono.git', commit: pin(proto.sujeitos.hono) },
};

function run(cmd, args, cwd, { shell = false } = {}) {
  console.log(`  $ ${cmd} ${args.join(' ')}${cwd ? `   (em ${cwd})` : ''}`);
  if (DRY) return { status: 0, stdout: '' };
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, shell });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} saiu com ${r.status}`);
  return r;
}

fs.mkdirSync(W, { recursive: true });
for (const [name, S] of Object.entries(SUBJECTS)) {
  const dir = path.join(W, name);
  console.log(`== ${name}: ${S.url} @ ${S.commit} -> ${dir}`);
  if (!fs.existsSync(path.join(dir, '.git'))) run('git', ['clone', '--no-checkout', S.url, dir]);
  else run('git', ['-C', dir, 'fetch', 'origin']);
  run('git', ['-C', dir, 'checkout', '--detach', S.commit]);
  if (!DRY) {
    const head = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).stdout.trim();
    if (!head.startsWith(S.commit)) throw new Error(`${name}: HEAD ${head} != ${S.commit}`);
    console.log(`  HEAD ${head}`);
  }
  // npm no Windows e um shim (.cmd): precisa de shell. --ignore-scripts como no protocolo.
  run('npm', ['install', '--ignore-scripts'], dir, { shell: process.platform === 'win32' });
}
console.log(DRY ? 'dry-run: nada foi executado' : `pronto: ${Object.keys(SUBJECTS).join(', ')} em ${W}`);
