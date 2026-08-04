#!/usr/bin/env node
/**
 * mooter · monitor de frota
 *
 * Corre como processo persistente durante a sessão (plugin monitor). Cada linha
 * de stdout chega ao Claude como notificação, e a `description` do monitor
 * aparece no painel de tarefas.
 *
 * ⚠️ Monitores são um componente EXPERIMENTAL do Claude Code e a doc declara que
 * correm "only in interactive CLI sessions". Este ficheiro é enhancement, nunca
 * fundação: se o monitor não arrancar, o painel continua a funcionar pelo
 * subagente `mooter-dispatch`, que não depende disto.
 *
 * DOUTRINA:
 *   • Só fala quando algo MUDA. Silêncio é o estado normal.
 *   • Nunca inventa: campo ausente ⇒ "n/d".
 *   • "o log cresceu" ≠ "o trabalho avançou". Um job cujo ficheiro não muda há
 *     mais de STALL_MIN minutos é reportado como POSSIVELMENTE ENCRAVADO, não
 *     como a trabalhar.
 *   • Só lê. Nunca escreve, nunca chama a rede, nunca chama um modelo.
 *
 * Custo: um `readdir` + `stat` por ficheiro a cada POLL_MS. Sem parsing enquanto
 * o mtime não mudar. Não toca no caminho quente de nenhum prompt.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const POLL_MS = Number(process.env.MOOTER_MONITOR_POLL_MS) || 4000;
const STALL_MIN = Number(process.env.MOOTER_MONITOR_STALL_MIN) || 10;
const ROOT = path.join(os.homedir(), '.mooter');

/** Candidatos por ordem de preferência. O primeiro que existir ganha. */
const CANDIDATES = ['jobs', 'ledger', 'board'];

const seen = new Map(); // ficheiro -> { mtimeMs, state, announcedStall }
let watchDir = null;
let announcedMissing = false;

function say(line) {
  process.stdout.write(`${line}\n`);
}

function parseOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findDir() {
  for (const name of CANDIDATES) {
    const p = path.join(ROOT, name);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
    } catch { /* segue */ }
  }
  return null;
}

/** Extrai só os campos que reconhece. Nunca deduz. */
function readJob(file) {
  const j = parseOrNull(fs.readFileSync(file, 'utf8'));
  if (!j || typeof j !== 'object') return null;
  return {
    id: typeof j.job_id === 'string' ? j.job_id : path.basename(file, '.json'),
    state: typeof j.state === 'string' ? j.state : (typeof j.last === 'string' ? j.last : 'n/d'),
    agent: typeof j.agent_label === 'string' ? j.agent_label
      : (typeof j.agent === 'string' ? j.agent : 'n/d'),
    model: typeof j.model_used === 'string' ? j.model_used : 'n/d',
    local: typeof j.local === 'boolean' ? j.local : null,
    cost: typeof j.cost_usd === 'number' ? j.cost_usd : null,
    relocated: j.relocated === true,
    worktree: typeof j.worktree_usada === 'string' ? j.worktree_usada
      : (typeof j.worktree === 'string' ? j.worktree : null),
  };
}

function money(job) {
  if (job.local === true) return '🐮 $0 (GPU local)';
  if (typeof job.cost === 'number') return `$${job.cost.toFixed(4)}`;
  return 'custo n/d';
}

function tick() {
  if (!watchDir) {
    watchDir = findDir();
    if (!watchDir) {
      if (!announcedMissing) {
        announcedMissing = true;
        say(`mooter: não encontrei estado de jobs em ${ROOT} (procurei ${CANDIDATES.join(', ')}) — fico em silêncio até aparecer.`);
      }
      return;
    }
    say(`mooter: a vigiar ${watchDir} — só falo quando algo mudar.`);
  }

  let files;
  try {
    files = fs.readdirSync(watchDir).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }

  const now = Date.now();

  for (const f of files) {
    const full = path.join(watchDir, f);
    let st;
    try { st = fs.statSync(full); } catch { continue; }

    const prev = seen.get(f);

    if (prev && prev.mtimeMs === st.mtimeMs) {
      // Ficheiro parado. Se o job dizia estar vivo, isto é o sinal que interessa:
      // vivo ≠ a progredir.
      const stalledMin = Math.floor((now - st.mtimeMs) / 60000);
      const running = /run|start|dispatch/i.test(prev.state || '');
      if (running && stalledMin >= STALL_MIN && !prev.announcedStall) {
        prev.announcedStall = true;
        say(`⚠️ mooter: job ${prev.id} diz "${prev.state}" mas o ficheiro não muda há ${stalledMin} min — possivelmente encravado, não a trabalhar.`);
      }
      continue;
    }

    const job = readJob(full);
    if (!job) { seen.set(f, { mtimeMs: st.mtimeMs, state: 'n/d', id: f }); continue; }

    if (!prev) {
      say(`🐮 mooter: job ${job.id} · ${job.agent} · ${job.model} · ${job.state} · ${money(job)}`);
    } else if (prev.state !== job.state) {
      say(`🐮 mooter: job ${job.id} · ${prev.state} → ${job.state} · ${job.agent} · ${money(job)}`);
    }

    if (job.relocated && (!prev || !prev.relocatedAnnounced)) {
      say(`⚠️ mooter: job ${job.id} foi RELOCADO para ${job.worktree || 'n/d'} — o resultado descreve essa pasta, não a que pediste.`);
    }

    seen.set(f, {
      mtimeMs: st.mtimeMs,
      state: job.state,
      id: job.id,
      announcedStall: false,
      relocatedAnnounced: job.relocated,
    });
  }
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

tick();
setInterval(tick, POLL_MS);
