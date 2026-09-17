// morde-amend001-a1.mjs — AMENDMENT-001 · A1: mutações em closeout.mjs (redução determinística), uma de cada vez; corre 07/11/10; restaura.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Raiz do repo derivada da localização deste ficheiro (tools/experiment/mordida/) — sem caminho absoluto.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = process.env.MORDIDA_OUT || path.join(os.tmpdir(), 'prisma-mordida');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FILES = { closeout: path.join(REPO, 'tools/experiment/closeout.mjs') };
const orig = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

const R1 = "  if (failedEv) { outcome = 'failed'; rule = 'R1_failed_terminal'; }\n  else if (capturedEv) {";
const MUT = [
  { id: 'A1-M1 · troca da precedência 1↔4: known_not_submitted/preflight no fim vence sobre failed (a mordida pedida pela emenda)', file: 'closeout',
    alvo: R1,
    subst: "  if (last && R4_KINDS.includes(last.kind)) { outcome = 'not_started'; rule = `R4_${last.kind}`; } /* MORDIDA 1↔4 */\n  else if (failedEv) { outcome = 'failed'; rule = 'R1_failed_terminal'; }\n  else if (capturedEv) {", esperado: ['07f'] },
  { id: 'A1-M2 · regra 6 ignorada: scored/closed contam como operacionais (mascaram a classe)', file: 'closeout',
    alvo: "export const NON_OPERATIONAL_KINDS = Object.freeze(['scored', 'closed']);",
    subst: "export const NON_OPERATIONAL_KINDS = Object.freeze([]); /* MORDIDA */", esperado: ['07e', '07f'] },
  { id: 'A1-M3 · regra 5 ignorada: R2 lê o PRIMEIRO captured, não o último (a recuperação não supersede)', file: 'closeout',
    alvo: "  const capturedEv = last && last.kind === 'captured' ? last : null;",
    subst: "  const capturedEv = last && last.kind === 'captured' ? (ops.find((e) => e.kind === 'captured') || last) : null; /* MORDIDA */", esperado: ['07f'] },
  { id: 'A1-M4 · completeness=unknown tratado como partial (comportamento do passo 4)', file: 'closeout',
    alvo: "    if (cap.capture_completeness === 'unknown') { outcome = 'unknown'; rule = 'R2_captured_completeness_unknown'; }",
    subst: "    if (false) { outcome = 'unknown'; rule = 'R2_captured_completeness_unknown'; } /* MORDIDA */", esperado: ['07e', '07f'] },
  { id: 'A1-M5 · attempted volta a ser «houve intent_committed» (known_not_submitted contado como tentado)', file: 'closeout',
    alvo: "  const attempted = intent_recorded && (lastKnsIdx < 0 || sentAfterKns);",
    subst: "  const attempted = intent_recorded; /* MORDIDA */", esperado: ['07d', '07e', '07f', '07g'] },
  { id: 'A1-M6 · regra 2 ignorada: submitted sem captura sai partial em vez de unknown', file: 'closeout',
    alvo: "  else if (last && R3_KINDS.includes(last.kind)) { outcome = 'unknown'; rule = `R3_${last.kind}_without_sufficient_capture`; }",
    subst: "  else if (last && R3_KINDS.includes(last.kind)) { outcome = 'partial'; rule = `R3_${last.kind}_without_sufficient_capture`; } /* MORDIDA */", esperado: ['07c', '07d', '07e', '07f'] },
  { id: 'A1-M7 · a asserção de identidade deixa de contar unknown (planned ≠ soma tem de LANÇAR, não só reportar)', file: 'closeout',
    alvo: "  counts.identity_ok = counts.planned === counts.complete + counts.partial + counts.failed + counts.unknown + counts.not_started;",
    subst: "  counts.identity_ok = counts.planned === counts.complete + counts.partial + counts.failed + counts.not_started; /* MORDIDA */", esperado: ['07c', '07d', '07e'] },
  { id: 'A1-M8 · preflight_failed sem intenção deixa de ser not_started (sai da R4 e cai em R0/unknown) — o caso (a) da emenda', file: 'closeout',
    alvo: "const R4_KINDS = Object.freeze(['known_not_submitted', 'prepared', 'preflight_ok', 'preflight_failed', 'queued']);",
    subst: "const R4_KINDS = Object.freeze(['known_not_submitted', 'prepared', 'preflight_ok', 'queued']); /* MORDIDA */", esperado: ['07e', '07f'] },
];

const TESTES = ['07-reset-beyond-window', '10-integrity', '11-denominators'].map((t) => `tools/experiment/tests/${t}.test.mjs`);
function correr() {
  const r = spawnSync(process.execPath, ['--test', ...TESTES], { cwd: REPO, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { pass: Number((out.match(/^ℹ pass (\d+)/m) || [])[1]), fail: Number((out.match(/^ℹ fail (\d+)/m) || [])[1]), falhas: [...new Set([...out.matchAll(/^✖ (\S+) /gm)].map((m) => m[1]))] };
}
const restaurar = () => { for (const [k, p] of Object.entries(FILES)) fs.writeFileSync(p, orig[k]); };
const base = correr();
console.log(`linha de base: pass ${base.pass} fail ${base.fail}`);
const rel = [];
for (const m of MUT) {
  restaurar();
  if (!orig[m.file].includes(m.alvo)) { console.log(`${m.id}: ALVO NÃO ENCONTRADO`); rel.push({ id: m.id, aplicou: false }); continue; }
  fs.writeFileSync(FILES[m.file], orig[m.file].replace(m.alvo, m.subst));
  const r = correr();
  restaurar();
  const mordeu = m.esperado.every((id) => r.falhas.some((f) => f.startsWith(id)));
  console.log(`${m.id}: pass ${r.pass} fail ${r.fail} · vermelhos: ${r.falhas.join(', ') || '(nenhum)'} · esperado ${m.esperado.join('+')} → ${mordeu ? 'MORDEU' : 'NÃO MORDEU'}`);
  rel.push({ id: m.id, aplicou: true, ...r, esperado: m.esperado, mordeu });
}
restaurar();
const fim = correr();
console.log(`restaurado: pass ${fim.pass} fail ${fim.fail} · ficheiros idênticos ao original: ${Object.entries(FILES).every(([k, p]) => fs.readFileSync(p, 'utf8') === orig[k])}`);
fs.writeFileSync(path.join(OUT_DIR, 'morde-amend001-a1.result.json'), JSON.stringify({ base, mutacoes: rel, fim }, null, 2));
