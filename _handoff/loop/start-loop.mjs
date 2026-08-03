#!/usr/bin/env node
/**
 * start-loop.mjs — bootstrap do Autopilot Loop (1 comando).
 *
 * Lê a QUEUE, escolhe a próxima wave não-concluída, prepara o bus
 * (CRITERIA.md + INBOX.md + STATE.json) e lança o loop-runner.
 * A partir daí o avaliador (scheduled task) + a QUEUE encadeiam as waves,
 * alimentam Notion/vault e escalam o irreversível.
 *
 * Uso (na raiz do repo, na branch certa):
 *   node _handoff/loop/start-loop.mjs            # arranca a próxima wave queued
 *   node _handoff/loop/start-loop.mjs W3         # força uma wave específica
 *   DRY_RUN=1 node _handoff/loop/start-loop.mjs  # prepara o bus e simula (não chama o CC)
 *
 * Segurança: NUNCA merge/push para main (imposto no INBOX + runner + avaliador).
 * Pára com: cria _handoff/loop/STOP  (ou o botão Stop no cockpit).
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const P = (f) => join(DIR, f);
const forceId = process.argv[2] || null;

function readQueue() {
  const t = readFileSync(P("QUEUE.jsonl"), "utf8").trim().split(/\r?\n/);
  return t.filter(Boolean).map((l) => JSON.parse(l));
}
function pickWave(q) {
  if (forceId) return q.find((w) => w.id === forceId) || null;
  return q.find((w) => w.status === "queued") || q.find((w) => w.status === "in_flight") || null;
}
function writeAtomic(file, text) { const tmp = file + ".tmp"; writeFileSync(tmp, text); renameSync(tmp, file); }

const RULES = [
  "REGRAS DURAS: classify.js FROZEN (não tocar; prova a sha 427d8c0b…364bc48f no fim).",
  "Tudo ADITIVO; git add seletivo (nunca -A). NUNCA merge/push/tag para main — isso é gate humano (reporta em BLOCKERS).",
  "No fim da wave ALIMENTA o Notion (sub-página sob a log page) E o vault Obsidian (precedência canónica do AGENTS.md: $MOOTER_VAULT → $VAULT_PATH → raiz do home ~/paulo-vault; NUNCA ~/Documents/paulo-vault, que é o clone stale).",
  "Termina sempre com o bloco ```status``` (DID/TESTS/BLOCKERS/NEXT/DONE).",
].join("\n");

function buildInbox(w) {
  return `# Wave ${w.id} — ${w.title}\n\n`
    + `Branch base: ${w.branch_base || w.branch || "wave-council-d"}. Cria uma branch de trabalho aditiva.\n\n`
    + `OBJECTIVO / CRITÉRIOS:\n${w.criteria}\n\n`
    + `${RULES}\n\n`
    + `Começa agora. Quando parares, termina com o bloco \`\`\`status\`\`\`.\n`;
}

function main() {
  const q = readQueue();
  const w = pickWave(q);
  if (!w) { console.log("[start-loop] sem waves queued — nada a arrancar."); return; }
  if (existsSync(P("STOP"))) { console.log("[start-loop] remove _handoff/loop/STOP primeiro."); return; }

  writeAtomic(P("CRITERIA.md"), `# Critérios — Wave ${w.id}: ${w.title}\n\n${w.criteria}\n\nDONE só quando: critérios cumpridos + Notion e vault alimentados + classify.js sha intacta + suites verdes.\n`);
  writeAtomic(P("INBOX.md"), buildInbox(w));
  writeAtomic(P("STATE.json"), JSON.stringify({
    loop_id: `autopilot-${new Date().toISOString().slice(0, 10)}`,
    wave: w.id, title: w.title, branch: w.branch_base || w.branch || "wave-council-d",
    status: "cc_running", round: 1, maxRounds: 12, sessionId: null,
    updated_at: new Date().toISOString(),
  }, null, 2));
  console.log(`[start-loop] bus preparado para ${w.id} — ${w.title}. A lançar o runner…`);

  const child = spawn(process.execPath, [P("loop-runner.mjs")], { stdio: "inherit", env: process.env });
  child.on("exit", (c) => console.log(`[start-loop] runner saiu (code ${c}).`));
}
main();
