// morde-amend001-registo.mjs — AMENDMENT-001 · registo de emendas + external_review derivado + completude A4: mutações em closeout.mjs; corre 10/11/07; restaura.
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

const MUT = [
  { id: 'R-M1 · external_review escrito à mão («pending») em vez de derivado do registo', file: 'closeout',
    alvo: "    external_review: externalReviewState(amendments),", subst: "    external_review: 'pending', /* MORDIDA */", esperado: ['10d'] },
  { id: 'R-M2 · loadAmendments ignora o directório (lista sempre vazia)', file: 'closeout',
    alvo: "  try { names = fs.readdirSync(dir).filter((n) => /^AMENDMENT-\\d{3}\\.json$/.test(n)).sort(); } catch { names = []; }", subst: "  names = []; /* MORDIDA */", esperado: ['10d'] },
  { id: 'R-M3 · checkConclusion aceita qualquer external_review e não confronta com o registo', file: 'closeout',
    alvo: "  if (!EXTERNAL_REVIEW_STATES.includes(c.external_review)) problems.push(`external_review ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);\n  if (Array.isArray(c.amendments) && c.external_review !== externalReviewState(c.amendments))", subst: "  if (false) problems.push(`external_review ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);\n  if (false) /* MORDIDA */", esperado: ['10d'] },
  { id: 'R-M4 · «n/d» nu aceite como julgamento concluído', file: 'closeout',
    alvo: "  return just.length < 8;", subst: "  return false; /* MORDIDA */", esperado: ['10e'] },
  { id: 'R-M5 · <<TODO>> conta como concluído na completude', file: 'closeout',
    alvo: "    if (c[k] === TODO || c[k] === undefined) out.push({ field: k, why: c[k] === undefined ? 'undefined' : TODO });", subst: "    if (c[k] === undefined) out.push({ field: k, why: 'undefined' }); /* MORDIDA */", esperado: ['10e'] },
  { id: 'R-M6 · loadAmendments não confronta semantics_version nem external_review_after', file: 'closeout',
    alvo: "    if (!EXTERNAL_REVIEW_STATES.includes(a.external_review_after)) throw new CloseoutError('amendment_invalid', `${n}: external_review_after ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);\n    if (a.semantics_version !== SEMANTICS_VERSION) throw", subst: "    if (false) throw new CloseoutError('amendment_invalid', `${n}: external_review_after ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);\n    if (false) throw /* MORDIDA */", esperado: ['10d'] },
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
fs.writeFileSync(path.join(OUT_DIR, 'morde-amend001-registo.result.json'), JSON.stringify({ base, mutacoes: rel, fim }, null, 2));
