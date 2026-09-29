'use strict';

// demo/vs-val/projection-preview.js — computa, HEADLESS, os badges/beacon/ViewBadge ESPERADOS por
// passo do roteiro VS-VAL, a partir das fixtures + estado git REAL desta máquina. É a coluna
// "esperado" que o Paulo confirma visualmente no F5 (observado). Prova a máquina de estados; não
// renderiza UI. NÃO é código de produção. Rode: node demo/vs-val/projection-preview.js

const fs = require('node:fs');
const path = require('node:path');
const SEM = require('../../src/semaforo-decorations.js');
const BEACON = require('../../src/paste-beacon.js');
const AGENT_SYNC = path.join(__dirname, '..', '..', '..', '..', 'tools', 'agent-sync');
const { validateDocument } = require(path.join(AGENT_SYNC, 'dispatch-queue-validate.js'));
const validate = (i) => validateDocument(i);

const sessions = SEM.parseSessionsFile(fs.readFileSync(path.join(__dirname, 'sessions.demo.json'), 'utf8'));
const baseQueue = JSON.parse(fs.readFileSync(path.join(__dirname, 'dispatch-queue.demo.json'), 'utf8'));

// Worktrees reais desta máquina; o unpushed é lido via git REAL (fonte do gate 🔒).
const WT = [
  { path: 'C:/Users/Paulo Loureiro/frugal-vs-w1', branch: 'feat/vs-w1-semaforo' },
  { path: 'C:/Users/Paulo Loureiro/frugal-session-registry', branch: 'feat/session-registry' },
];
const line = (s) => process.stdout.write(s + '\n');

function snapshot(label, queue) {
  const model = SEM.readAgentSync({
    worktrees: () => WT, sessions, queue,
    readCoworkPending: () => null,
    gitUnpushed: SEM.defaultGitUnpushed, // git real
  });
  const map = SEM.buildDecorationMap({ worktrees: WT, sessions, queue: model.queue, gateFor: model.gateFor });
  const beacon = BEACON.beaconState({ queue: model.queue, gateCount: model.gateCount, validate });
  const badgeN = BEACON.pendingActionCount({ queue: model.queue, gateCount: model.gateCount, validate });
  line(`\n== ${label} ==`);
  for (const wt of WT) {
    const d = map[SEM.normalizePath(wt.path)];
    line(`  worktree ${path.basename(wt.path)} -> ${d ? d.badge + ' (' + d.stateKey + ')' : '—'}`);
  }
  line(`  beacon: "${beacon.text}"  [bg=${beacon.background || 'none'}]`);
  line(`  ViewBadge: ${badgeN}`);
}

snapshot('ESTADO A · fila cheia (blocker + paste), inicial', baseQueue);
const afterBlocker = baseQueue.map((i) => (i.id === 'vs-val-blocker-20260719' ? { ...i, estado: 'done' } : i));
snapshot('ESTADO B · blocker resolvido -> beacon avanca para o paste', afterBlocker);
const afterPaste = afterBlocker.map((i) => (i.id === 'vs-val-paste-20260719' ? { ...i, estado: 'pasted' } : i));
snapshot('ESTADO C · paste consumado -> fila vazia, resta o gate real (unpushed)', afterPaste);
