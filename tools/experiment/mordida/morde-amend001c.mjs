// morde-amend001c.mjs — AMENDMENT-001c · C1: as três mordidas pedidas para a fixture do .intent órfão (04f), uma de cada vez; restaura.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Raiz do repo derivada da localização deste ficheiro (tools/experiment/mordida/) — sem caminho absoluto.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = process.env.MORDIDA_OUT || path.join(os.tmpdir(), 'prisma-mordida');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FILES = { journal: path.join(REPO, 'tools/experiment/journal.mjs'), closeout: path.join(REPO, 'tools/experiment/closeout.mjs') };
const orig = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

const MUT = [
  { id: 'C1-M(a) · resume() ignora o .intent órfão (não marca submission_uncertain) ⇒ passo 1', file: 'journal',
    alvo: "    if (!ctx.fs.existsSync(intentPath(ctx, slotId))) continue;",
    subst: "    continue; /* MORDIDA: órfãos ignorados */", esperado: ['04f', '04b'] },
  { id: 'C1-M(b) · closeout classifica submission_uncertain como not_started ⇒ passo 4', file: 'closeout',
    alvo: "const R3_KINDS = Object.freeze(['intent_committed', 'submitted', 'submission_uncertain', 'capture_uncertain', 'policy_review']);\nconst R4_KINDS = Object.freeze(['known_not_submitted', 'prepared', 'preflight_ok', 'preflight_failed', 'queued']);",
    subst: "const R3_KINDS = Object.freeze(['intent_committed', 'submitted', 'capture_uncertain', 'policy_review']); /* MORDIDA */\nconst R4_KINDS = Object.freeze(['known_not_submitted', 'prepared', 'preflight_ok', 'preflight_failed', 'queued', 'submission_uncertain']);", esperado: ['04f', '07f'] },
  { id: 'C1-M(c) · commitIntent aceita o slot com token no disco (sem existsSync e sem O_EXCL) ⇒ passo 3', file: 'journal',
    alvo: "  if (ctx.fs.existsSync(intentPath(ctx, slot_id))) throw new JournalError('attempt_token_exists',",
    subst: "  if (false) throw new JournalError('attempt_token_exists', /* MORDIDA */", esperado: ['04f', '04a'],
    extra: [["    fd = ctx.fs.openSync(file, 'wx'); // O_CREAT|O_EXCL — exactamente um criador", "    fd = ctx.fs.openSync(file, 'w'); /* MORDIDA */"]] },
];

const TESTES = ['04-crash-after-intent', '07-reset-beyond-window', '03-claim'].map((t) => `tools/experiment/tests/${t}.test.mjs`);
function correr() {
  const r = spawnSync(process.execPath, ['--test', ...TESTES], { cwd: REPO, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { pass: Number((out.match(/^ℹ pass (\d+)/m) || [])[1]), fail: Number((out.match(/^ℹ fail (\d+)/m) || [])[1]), falhas: [...new Set([...out.matchAll(/^✖ (\S+) /gm)].map((m) => m[1]))] };
}
const restaurar = () => { for (const [k, p] of Object.entries(FILES)) fs.writeFileSync(p, orig[k]); };
const base = correr();
console.log(`[001c] linha de base: pass ${base.pass} fail ${base.fail}`);
const rel = [];
for (const m of MUT) {
  restaurar();
  let s = orig[m.file];
  const alvos = [[m.alvo, m.subst], ...(m.extra || [])];
  if (!alvos.every(([a]) => s.includes(a))) { console.log(`${m.id}: ALVO NÃO ENCONTRADO`); rel.push({ id: m.id, aplicou: false }); continue; }
  for (const [a, b] of alvos) s = s.replace(a, b);
  fs.writeFileSync(FILES[m.file], s);
  const r = correr();
  restaurar();
  const mordeu = m.esperado.every((id) => r.falhas.some((f) => f.startsWith(id)));
  console.log(`${m.id}: pass ${r.pass} fail ${r.fail} · vermelhos: ${r.falhas.join(', ') || '(nenhum)'} · esperado ${m.esperado.join('+')} → ${mordeu ? 'MORDEU' : 'NÃO MORDEU'}`);
  rel.push({ id: m.id, aplicou: true, ...r, esperado: m.esperado, mordeu });
}
restaurar();
const fim = correr();
console.log(`restaurado: pass ${fim.pass} fail ${fim.fail} · ficheiros idênticos ao original: ${Object.entries(FILES).every(([k, p]) => fs.readFileSync(p, 'utf8') === orig[k])}`);
fs.writeFileSync(path.join(OUT_DIR, 'morde-amend001c.result.json'), JSON.stringify({ base, mutacoes: rel, fim }, null, 2));
