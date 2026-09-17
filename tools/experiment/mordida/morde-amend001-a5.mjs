// morde-amend001-a5.mjs — AMENDMENT-001 · A5: mutações em import.mjs (custo: basis no enum, coverage, estimated nunca observed), uma de cada vez; corre 09/18/10/11; restaura.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Raiz do repo derivada da localização deste ficheiro (tools/experiment/mordida/) — sem caminho absoluto.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = process.env.MORDIDA_OUT || path.join(os.tmpdir(), 'prisma-mordida');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FILES = { imp: path.join(REPO, 'tools/experiment/import.mjs') };
const orig = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));

const MUT = [
  { id: 'A5-M1 · aggregateUsage aceita basis «partial» (a mordida pedida pela emenda)', file: 'imp',
    alvo: "      if (m && !BASIS.includes(m.basis)) throw new ImportError('metric_bad_basis',",
    subst: "      if (false) throw new ImportError('metric_bad_basis', /* MORDIDA */", esperado: ['18e'] },
  { id: 'A5-M2 · costEnvelope volta a devolver basis «partial» com um lado desconhecido', file: 'imp',
    alvo: "  if (coverage === 'partial') return { value: null, basis: 'unknown', reason:",
    subst: "  if (coverage === 'partial') return { value: null, basis: 'partial', reason: /* MORDIDA */", esperado: ['18a', '18d', '18e'] },
  { id: 'A5-M3 · tokens observados × lista sai «observed» (custo calculado apresentado como cobrança real)', file: 'imp',
    alvo: "  const comp = (m, per) => (m.value === null ? { value: null, basis: 'unknown', tokens_basis: 'unknown' } : { value: (m.value * per) / 1e6, basis: m.basis === 'imputed' ? 'imputed' : 'estimated', tokens_basis: m.basis, source: m.source });",
    subst: "  const comp = (m, per) => (m.value === null ? { value: null, basis: 'unknown', tokens_basis: 'unknown' } : { value: (m.value * per) / 1e6, basis: m.basis, tokens_basis: m.basis, source: m.source }); /* MORDIDA */\n  const basisMut = (ic, oc) => [ic.basis, oc.basis].includes('imputed') ? 'imputed' : [ic.basis, oc.basis].includes('estimated') ? 'estimated' : 'observed';", esperado: ['18a', '18c', '18e', '09b', '09c'],
    extra: [["  const basis = [ic.basis, oc.basis].includes('imputed') ? 'imputed' : 'estimated';", "  const basis = basisMut(ic, oc); /* MORDIDA */"]] },
  { id: 'A5-M4 · a parcela em falta é preenchida com 0 (soma «total» com meio envelope)', file: 'imp',
    alvo: "  if (coverage === 'partial') return { value: null, basis: 'unknown', reason: ic.value === null ? 'input_unknown' : 'output_unknown', ...base, input_component: ic, output_component: oc };",
    subst: "  if (coverage === 'partial') return { value: (ic.value ?? 0) + (oc.value ?? 0), basis: 'estimated', reason: ic.value === null ? 'input_unknown' : 'output_unknown', ...base, input_component: ic, output_component: oc }; /* MORDIDA */", esperado: ['18a', '18d', '18e'] },
  { id: 'A5-M5 · coverage calculado ao contrário (partial quando ambos conhecidos)', file: 'imp',
    alvo: "  const coverage = components_known.length === 2 ? 'full' : components_known.length === 1 ? 'partial' : 'none';",
    subst: "  const coverage = components_known.length === 2 ? 'partial' : components_known.length === 1 ? 'full' : 'none'; /* MORDIDA */", esperado: ['18a', '18c', '18e', '09b'] },
  { id: 'A5-M6 · aggregateUsage soma os componentes conhecidos como se fossem o total', file: 'imp',
    alvo: "      if (!m || m.value === null || m.basis === 'unknown') { acc.n_unknown++; continue; }\n      acc[`n_${m.basis}`]++;",
    subst: "      if (m && m.value === null && m.coverage === 'partial') { acc.n_estimated++; acc.estimated_sum += (m.input_component?.value ?? 0) + (m.output_component?.value ?? 0); continue; } /* MORDIDA */\n      if (!m || m.value === null || m.basis === 'unknown') { acc.n_unknown++; continue; }\n      acc[`n_${m.basis}`]++;", esperado: ['18e'] },
  { id: 'A5-M7 · metric() aceita «partial» como basis de tokens', file: 'imp',
    alvo: "  if (!BASIS.includes(basis)) throw new ImportError('metric_bad_basis',",
    subst: "  if (!BASIS.includes(basis) && basis !== 'partial') throw new ImportError('metric_bad_basis', /* MORDIDA */", esperado: ['18e'] },
];

const TESTES = ['09-usage-null', '18-partial-usage', '10-integrity', '11-denominators'].map((t) => `tools/experiment/tests/${t}.test.mjs`);
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
fs.writeFileSync(path.join(OUT_DIR, 'morde-amend001-a5.result.json'), JSON.stringify({ base, mutacoes: rel, fim }, null, 2));
