// morde-amend001-a3.mjs — AMENDMENT-001 · A3: mutações em closeout.mjs / scores.mjs / freeze.mjs (denominadores e avaliabilidade), uma de cada vez; corre 01/07/10/11/19/20; restaura.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Raiz do repo derivada da localização deste ficheiro (tools/experiment/mordida/) — sem caminho absoluto.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = process.env.MORDIDA_OUT || path.join(os.tmpdir(), 'prisma-mordida');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FILES = { closeout: path.join(REPO, 'tools/experiment/closeout.mjs'), scores: path.join(REPO, 'tools/experiment/scores.mjs'), freeze: path.join(REPO, 'tools/experiment/freeze.mjs') };
const orig = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

const MUT = [
  { id: 'A3-M1 · negativos somados ao denominador elegível (a mordida pedida pela emenda)', file: 'closeout',
    alvo: "  const eligible = slots.filter((x) => x.role === 'eligible');\n  const negative = slots.filter((x) => x.role === 'negative');\n  const other =",
    subst: "  const eligible = slots.filter((x) => x.role === 'eligible' || x.role === 'negative'); /* MORDIDA */\n  const negative = slots.filter((x) => x.role === 'negative');\n  const other =", esperado: ['11a', '11e'] },
  { id: 'A3-M2 · failed contado como avaliável (avaliabilidade por outcome errada)', file: 'closeout',
    alvo: "export const EVALUABILITY_BY_OUTCOME = Object.freeze({ complete: true, partial: true, failed: false, unknown: false, not_started: false });",
    subst: "export const EVALUABILITY_BY_OUTCOME = Object.freeze({ complete: true, partial: true, failed: true, unknown: false, not_started: false }); /* MORDIDA */", esperado: ['11a', '11e'] },
  { id: 'A3-M3 · new_fact_used avaliável sem fact_ref (sem diff da página)', file: 'closeout',
    alvo: "  new_fact_used:             Object.freeze({ needs_response: true,  needs: Object.freeze(['fact_ref']) }),",
    subst: "  new_fact_used:             Object.freeze({ needs_response: true,  needs: Object.freeze([]) }), /* MORDIDA */", esperado: ['11a', '11e'] },
  { id: 'A3-M4 · search_used=false/null EXCLUI de recommended_appropriately (o erro que o §19 proíbe)', file: 'closeout',
    alvo: "    if (n === 'asks_recommendation' && ev.asks_recommendation !== true) why.push(ev.declared ? 'asks_recommendation:false' : 'evidence:not_declared');",
    subst: "    if (n === 'asks_recommendation' && ev.asks_recommendation !== true) why.push(ev.declared ? 'asks_recommendation:false' : 'evidence:not_declared');\n    if (n === 'asks_recommendation' && slot.search_used !== true) why.push('search_used'); /* MORDIDA */", esperado: ['11e'] },
  { id: 'A3-M5 · countObservations ignora applicable_of: n_applicable = n_slots (denominador inflacionado)', file: 'scores',
    alvo: "          if (ap) c.n_applicable++;",
    subst: "          c.n_applicable++; /* MORDIDA */", esperado: ['11e', '20a'] },
  { id: 'A3-M6 · crawl_access passa a exigir resposta (observação do servidor tratada como observação da resposta)', file: 'closeout',
    alvo: "  crawl_access:              Object.freeze({ needs_response: false, needs: Object.freeze([]) }),",
    subst: "  crawl_access:              Object.freeze({ needs_response: true, needs: Object.freeze([]) }), /* MORDIDA */", esperado: ['11a', '11e'] },
  { id: 'A3-M7 · o freeze não leva a evidence para o diário (só para o manifest.json)', file: 'freeze',
    alvo: "      rubric_ref: frozen.rubric_ref ?? null,\n      evidence:",
    subst: "      rubric_ref: frozen.rubric_ref ?? null,\n      evidence_: /* MORDIDA */", esperado: ['11e', '11f'] },
  { id: 'A3-M8 · o freeze aceita evidence mal formada (entra em silêncio como «não avaliável»)', file: 'freeze',
    alvo: "    if ('evidence' in p && p.evidence !== undefined) {",
    subst: "    if (false) { /* MORDIDA */", esperado: ['11f'] },
  { id: 'A3-M9 · regra do piloto compara com o nome antigo (den.negative, undefined ⇒ nunca força)', file: 'closeout',
    alvo: "den.negative_evaluable < den.negative_planned)) {",
    subst: "den.negative_evaluable < den.negative)) { /* MORDIDA */", esperado: ['11g'] },
];

const TESTES = ['01-freeze', '07-reset-beyond-window', '10-integrity', '11-denominators', '19-search-fields', '20-scientific-independence'].map((t) => `tools/experiment/tests/${t}.test.mjs`);
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
fs.writeFileSync(path.join(OUT_DIR, 'morde-amend001-a3.result.json'), JSON.stringify({ base, mutacoes: rel, fim }, null, 2));
