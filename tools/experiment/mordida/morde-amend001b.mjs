// morde-amend001b.mjs — AMENDMENT-001b: mutações por item (B1/B2/B3), uma de cada vez; restaura. Uso: node morde-amend001b.mjs B1
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Raiz do repo derivada da localização deste ficheiro (tools/experiment/mordida/) — sem caminho absoluto.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = process.env.MORDIDA_OUT || path.join(os.tmpdir(), 'prisma-mordida');
fs.mkdirSync(OUT_DIR, { recursive: true });
const ITEM = process.argv[2] || 'B1';
const FILES = { closeout: path.join(REPO, 'tools/experiment/closeout.mjs'), scores: path.join(REPO, 'tools/experiment/scores.mjs'), freeze: path.join(REPO, 'tools/experiment/freeze.mjs'), effort: path.join(REPO, 'tools/experiment/effort.mjs') };
const orig = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

const ALL = {
  B1: {
    testes: ['07-reset-beyond-window', '11-denominators', '10-integrity'],
    mut: [
      { id: 'B1-M1 · «qualquer failed histórico» decide R1 (preflight_failed tratado como terminal) — a mordida pedida', file: 'closeout',
        alvo: "export const TERMINAL_FAILURE_KINDS = Object.freeze(SLOT_KINDS.filter((k) => /fail/.test(k) && (SLOT_TRANSITIONS[k] || []).length === 0));",
        subst: "export const TERMINAL_FAILURE_KINDS = Object.freeze(SLOT_KINDS.filter((k) => /fail/.test(k))); /* MORDIDA */", esperado: ['07g', '07e', '07f'] },
      { id: 'B1-M2 · qualquer known_not_submitted ⇒ attempted=false, mesmo com submitted posterior', file: 'closeout',
        alvo: "  const attempted = intent_recorded && (lastKnsIdx < 0 || sentAfterKns);",
        subst: "  const attempted = intent_recorded && lastKnsIdx < 0; /* MORDIDA */", esperado: ['07g', '07f'] },
      { id: 'B1-M3 · history[] não reportado (a falha anterior desaparece do relatório)', file: 'closeout',
        alvo: "    history: events.map((e) => e.kind),", subst: "    history: [], /* MORDIDA */", esperado: ['07g'] },
      { id: 'B1-M4 · prior_failures não distingue: conta a terminal como histórica', file: 'closeout',
        alvo: "  const prior_failures = Object.fromEntries(HISTORICAL_FAILURE_KINDS.map((k) => [k, ops.filter((e) => e.kind === k).length]));",
        subst: "  const prior_failures = Object.fromEntries(HISTORICAL_FAILURE_KINDS.map((k) => [k, ops.filter((e) => /fail/.test(e.kind)).length])); /* MORDIDA */", esperado: ['07g'] },
    ],
  },
  B2: {
    testes: ['11-denominators', '19-search-fields', '20-scientific-independence', '07-reset-beyond-window'],
    mut: [
      { id: 'B2-M1 · null adjudicado conta como avaliável — a mordida pedida ((c) vermelho)', file: 'closeout',
        alvo: "    if (last.value === null) return false;",
        subst: "    /* MORDIDA: null adjudicado conta */", esperado: ['11h'] },
      { id: 'B2-M2 · evaluable igualado a applicable (as duas contagens colapsam)', file: 'closeout',
        alvo: "    x.evaluable_for = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, x.capture_sufficient_for[f] && adjudicated(x.slot_id, f)]));",
        subst: "    x.evaluable_for = { ...x.applicable_for }; /* MORDIDA */", esperado: ['11h', '19e'] },
      { id: 'B2-M3 · capture_sufficient ignora o outcome (unknown conta como captura suficiente)', file: 'closeout',
        alvo: "  if (req.needs_response && EVALUABILITY_BY_OUTCOME[slot.outcome] !== true) why.push(`outcome:${slot.outcome}`);",
        subst: "  if (false) why.push(`outcome:${slot.outcome}`); /* MORDIDA */", esperado: ['11a', '11e', '11h'] },
      { id: 'B2-M4 · search_used=false exclui da avaliabilidade (§19)', file: 'closeout',
        alvo: "export function captureSufficientFor(slot, field, frozen) { return notEvaluableReasons(slot, field, frozen).length === 0; }",
        subst: "export function captureSufficientFor(slot, field, frozen) { return notEvaluableReasons(slot, field, frozen).length === 0 && slot.search_used !== false; } /* MORDIDA */", esperado: ['11e', '11h', '19e'] },
      { id: 'B2-M6 · adjudicated ignora o hash da resposta (observação obsoleta conta como avaliável) — nota do gate final', file: 'closeout',
        alvo: "    if (FIELD_EVIDENCE[field].needs_response && last.answer_sha256 !== current_sha[slot_id]) return false; // obsoleta",
        subst: "    /* MORDIDA: sem verificação do hash */", esperado: ['11i'] },
      { id: 'B2-M5 · countObservations conta n_evaluable sem exigir capture_sufficient', file: 'scores',
        alvo: "          if (cs && v !== null && !stale) c.n_evaluable++;",
        subst: "          if (v !== null && !stale) c.n_evaluable++; /* MORDIDA */", esperado: ['11h', '20a'] },
    ],
  },
  B3: {
    testes: ['12-holdout', '01-freeze', '11-denominators'],
    mut: [
      { id: 'B3-M1 · o freeze aceita R01/R02 no manifesto — a mordida pedida', file: 'freeze',
        alvo: "    if (RESERVED_ID.test(p.id)) push('reserved_partition_unsupported',",
        subst: "    if (false) push('reserved_partition_unsupported', /* MORDIDA */", esperado: ['12e'] },
      { id: 'B3-M2 · o freeze aceita partition independent-reserved sem custodiante', file: 'freeze',
        alvo: "  if (m.partition === 'independent-reserved') push('reserved_partition_unsupported',",
        subst: "  if (false) push('reserved_partition_unsupported', /* MORDIDA */", esperado: ['12e'] },
      { id: 'B3-M3 · o freeze aceita role reserved', file: 'freeze',
        alvo: "    if (p.role === 'reserved') push('reserved_partition_unsupported',",
        subst: "    if (false) push('reserved_partition_unsupported', /* MORDIDA */", esperado: ['12e'] },
      { id: 'B3-M4 · order com id reservado passa', file: 'freeze',
        alvo: "  else for (const id of m.order) { if (!ids.has(id)) push('order_unknown_prompt', id); if (RESERVED_ID.test(id)) push('reserved_partition_unsupported', `order contém ${id}`); }",
        subst: "  else for (const id of m.order) { if (!ids.has(id)) push('order_unknown_prompt', id); } /* MORDIDA */", esperado: ['12e'] },
    ],
  },
  B4: {
    testes: ['effort', '11-denominators'],
    mut: [
      { id: 'B4-M1 · condições combinadas ENTRE replays (cada condição basta verificar-se em algum replay)', file: 'effort',
        alvo: "  const rule_satisfied = enough_replays && satisfied_replays >= REQUIRED_SATISFIED;",
        subst: "  const rule_satisfied = enough_replays && CONDITIONS.every((c) => evaluated.some((e) => e.pairs[c.measure].holds)); /* MORDIDA */", esperado: ['effort-iii'] },
      { id: 'B4-M2 · um replay com uma condição falhada conta na mesma', file: 'effort',
        alvo: "  const satisfied_replays = wins + ties;",
        subst: "  const satisfied_replays = evaluated.length; /* MORDIDA */", esperado: ['effort-iii'] },
      { id: 'B4-M3 · empate integral apresentado como vitória', file: 'effort',
        alvo: "  else if (wins === 0) verdict = 'tie';",
        subst: "  else if (false) verdict = 'tie'; /* MORDIDA */", esperado: ['effort-i'] },
      { id: 'B4-M4 · percentagem de poupança na apresentação', file: 'effort',
        alvo: "    no_percentages: true,",
        subst: "    no_percentages: true, savings_pct: evaluated.length ? Math.round(100 * (1 - evaluated.reduce((s, e) => s + e.pairs.human_minutes.B, 0) / Math.max(1, evaluated.reduce((s, e) => s + e.pairs.human_minutes.A, 0)))) + '%' : null, /* MORDIDA */", esperado: ['effort-i'] },
      { id: 'B4-M5 · medida em falta vira 0 (o vício do motor: null ⇒ 0)', file: 'effort',
        alvo: "const num = (v, what) => { if (!(typeof v === 'number' && Number.isFinite(v))) throw new EffortError('bad_measure',",
        subst: "const num = (v, what) => { if (v == null) return 0; if (!(typeof v === 'number' && Number.isFinite(v))) throw new EffortError('bad_measure', /* MORDIDA */", esperado: ['effort-iv'] },
    ],
  },
};

const conf = ALL[ITEM];
if (!conf) { console.error('item?'); process.exit(2); }
const TESTES = conf.testes.map((t) => `tools/experiment/tests/${t}.test.mjs`);
function correr() {
  const r = spawnSync(process.execPath, ['--test', ...TESTES], { cwd: REPO, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { pass: Number((out.match(/^ℹ pass (\d+)/m) || [])[1]), fail: Number((out.match(/^ℹ fail (\d+)/m) || [])[1]), falhas: [...new Set([...out.matchAll(/^✖ (\S+) /gm)].map((m) => m[1]))] };
}
const restaurar = () => { for (const [k, p] of Object.entries(FILES)) fs.writeFileSync(p, orig[k]); };
const base = correr();
console.log(`[${ITEM}] linha de base: pass ${base.pass} fail ${base.fail}`);
const rel = [];
for (const m of conf.mut) {
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
fs.writeFileSync(path.join(OUT_DIR, `morde-amend001b-${ITEM}.result.json`), JSON.stringify({ item: ITEM, base, mutacoes: rel, fim }, null, 2));
