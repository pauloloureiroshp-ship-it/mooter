#!/usr/bin/env node
/**
 * mooterbench.mjs — B1/B2/B4/B5 EMPARELHADO, $0, só Ollama local.
 *
 * O que faz: para cada cursor, corre a MESMA ronda com cada modelo. O pack de
 * contexto é determinístico por (repoRoot, pilar, cursor) com `revistos: null`,
 * portanto os modelos vêem o MESMO excerto — é isso que faz o par valer.
 *
 * O que NÃO faz:
 *   · B3 e B6 JÁ são medidos, por `bench-b3b6.mjs`, fora do `runRound` (que não
 *     exercita ferramentas nem saída estruturada).
 *   · Não promove nada a residente. Isso é o ▶ do dono + shadow 7d.
 *   · Não escreve no ledger de produção. Escreve o seu próprio ficheiro.
 *
 * Aborta se o poço estiver seco: um bench sobre `nada-por-rever` é fabricação.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { runRound } from './runner-core.mjs';
import { b3, b6 } from './bench-b3b6.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

const REPO = process.env.MOOTER_REPO || path.resolve(new URL('../../..', import.meta.url).pathname);
const N = Number(arg('n', '20'));
const PILAR = arg('pilar', 'P2');
const MODELOS = arg('modelos', 'qwen2.5-coder:14b,granite4.2:8b,granite4.2:3b').split(',');
const STOP_FILE = path.join(os.homedir(), '.mooter', 'STOP');
const OUT_DIR = path.join(REPO, '_handoff');
const TS = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const JSONL = path.join(OUT_DIR, `mooterbench-${TS}.jsonl`);
const SUMO = path.join(OUT_DIR, `mooterbench-${TS}.md`);

let repoSha = null;
try {
  repoSha = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
} catch { /* sem git: fica null, nunca inventado */ }

/** VRAM carregada agora, por modelo (B5). Lê `ollama ps`; sem ele devolve null. */
function loadedGb(model) {
  try {
    const out = execFileSync('ollama', ['ps'], { encoding: 'utf8', timeout: 5000 });
    for (const line of out.split('\n').slice(1)) {
      const c = line.trim().split(/\s{2,}/);
      if (c[0] === model) {
        const m = String(c[2] || '').match(/([\d.]+)\s*GB/i);
        return m ? Number(m[1]) : null;
      }
    }
  } catch { /* ollama ausente */ }
  return null;
}

const rows = [];
console.log(`=== MooterBench · ${new Date().toISOString()} ===`);
console.log(`repo ${REPO}\nsha ${repoSha || 'n/d'}\npilar ${PILAR} · N=${N} · modelos ${MODELOS.join(', ')}`);
console.log(`⚠️  B3 e B6 NAO sao medidos aqui. Sem eles o portao de promocao nao fecha.\n`);

if (!fs.existsSync(STOP_FILE)) fs.writeFileSync(JSONL, '');
else { console.error('❌ STOP presente em ~/.mooter/STOP — o dono parou a frota. Nao corro.'); process.exit(2); }

for (let cursor = 0; cursor < N; cursor++) {
  for (const model of MODELOS) {
    const t0 = Date.now();
    let r;
    try {
      r = await runRound({ repoRoot: REPO, pillar: PILAR, cursor, model, stopFile: STOP_FILE, revistos: null, repoSha });
    } catch (err) {
      r = { dispatched: false, receipt: { verdict: 'erro-harness', erro: String(err && err.message).slice(0, 120) } };
    }
    const rec = r.receipt || {};
    const row = {
      cursor, modelo: model,
      verdict: rec.verdict || 'n/d',
      dur_s: rec.dur_s ?? Math.round((Date.now() - t0) / 1000),
      tokens_out: rec.tokens_out ?? 0,
      motor_ok: rec.motor_ok === true,
      chave: rec.chave || null,
      escopo: rec.escopo || null,
      loaded_gb: loadedGb(model),
    };
    rows.push(row);
    fs.appendFileSync(JSONL, JSON.stringify(row) + '\n');
    console.log(`  c${String(cursor).padStart(3)} ${model.padEnd(20)} ${String(row.verdict).padEnd(14)} ${String(row.dur_s).padStart(3)}s ${String(row.tokens_out).padStart(4)}tok ${row.loaded_gb ?? '?'}GB`);
  }
}

// ── B3 e B6: fora do runRound, porque o runRound nao exercita nada disto ───
const extra = {};
if (process.env.BENCH_SKIP_B3B6 !== '1') {
  for (const m of MODELOS) {
    console.log(`\n  --- B3 tool-calling · ${m} ---`);
    extra[m] = { b3: await b3({ model: m, log: (l) => console.log(l) }) };
    console.log(`  --- B6 fidelidade JSON · ${m} ---`);
    extra[m].b6 = await b6({ model: m, log: (l) => console.log(l) });
  }
  fs.writeFileSync(JSONL.replace('.jsonl', '-b3b6.json'), JSON.stringify(extra, null, 2));
}

// ── Portao de honestidade: o poco estava seco? ─────────────────────────────
const seco = rows.filter((r) => r.verdict === 'nada-por-rever').length;
const pctSeco = rows.length ? Math.round((seco / rows.length) * 100) : 100;

// ── Emparelhamento: so contam cursores onde TODOS os modelos correram ───────
const porCursor = new Map();
for (const r of rows) {
  if (!porCursor.has(r.cursor)) porCursor.set(r.cursor, new Map());
  porCursor.get(r.cursor).set(r.modelo, r);
}
const paresValidos = [...porCursor.entries()]
  .filter(([, m]) => MODELOS.every((x) => m.has(x) && m.get(x).verdict !== 'nada-por-rever'))
  .map(([c]) => c);

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const p = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const resumo = MODELOS.map((m) => {
  const rs = paresValidos.map((c) => porCursor.get(c).get(m));
  const d = rs.length;
  const cit = rs.filter((r) => r.verdict === 'citacao-ok').length;
  const ref = rs.filter((r) => r.verdict === 'refutado').length;
  const sem = rs.filter((r) => r.verdict === 'sem-citacao').length;
  const nada = rs.filter((r) => r.verdict === 'sem-achado').length;
  const durs = rs.map((r) => r.dur_s).filter(Number.isFinite);
  const gbs = rs.map((r) => r.loaded_gb).filter((x) => Number.isFinite(x));
  return {
    modelo: m, n: d,
    B1_citacao_ok_pct: pct(cit, d), B2_refutado_pct: pct(ref, d),
    sem_citacao_pct: pct(sem, d), sem_achado_pct: pct(nada, d),
    B4_p50_s: p(durs, 0.5), B4_p95_s: p(durs, 0.95),
    B5_pico_gb: gbs.length ? Math.max(...gbs) : null,
    tokens_out_medio: d ? Math.round(rs.reduce((a, r) => a + (r.tokens_out || 0), 0) / d) : null,
  };
});

const L = [];
L.push(`# MooterBench — ${new Date().toISOString()}`);
L.push('');
L.push(`repo \`${REPO}\` · sha \`${repoSha || 'n/d'}\` · pilar **${PILAR}** · cursores pedidos **${N}**`);
L.push('');
L.push(`**Pares válidos: ${paresValidos.length} de ${N}.** \`nada-por-rever\`: ${seco}/${rows.length} (${pctSeco}%).`);
L.push('');
if (pctSeco > 50) {
  L.push('> ❌ **BENCH INVÁLIDO — o poço estava seco.** Mais de metade das rondas não chegou');
  L.push('> ao modelo por não haver excerto para rever. Isto não mede modelo nenhum.');
  L.push('> Alargar o âmbito (`--pilar=` outro, ou `diffBase`) e repetir.');
  L.push('');
}
L.push('| Modelo | n | B1 citação-ok | B2 refutado | B4 p50 | B4 p95 | B5 pico | tok médio | B3 tools | B6 schema |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const r of resumo) {
  const e = extra[r.modelo] || {};
  const t3 = e.b3 ? `${e.b3.pct}% (${e.b3.acertos}/${e.b3.n})` : 'n/d';
  const t6 = e.b6 ? `${e.b6.schema_pct}%` : 'n/d';
  L.push(`| \`${r.modelo}\` | ${r.n} | ${r.B1_citacao_ok_pct ?? 'n/d'}% | ${r.B2_refutado_pct ?? 'n/d'}% | ${r.B4_p50_s ?? 'n/d'}s | ${r.B4_p95_s ?? 'n/d'}s | ${r.B5_pico_gb ?? 'n/d'}GB | ${r.tokens_out_medio ?? 'n/d'} | ${t3} | ${t6} |`);
}
L.push('');
L.push('## B3 — tool-calling, por tarefa (a 5.ª é de IRRELEVÂNCIA: acertar = não chamar)');
L.push('');
L.push('| Modelo | ler | procurar | testes | git | irrelevante | total |');
L.push('|---|---|---|---|---|---|---|');
for (const m of MODELOS) {
  const e = (extra[m] || {}).b3;
  if (!e) { L.push(`| \`${m}\` | n/d | n/d | n/d | n/d | n/d | n/d |`); continue; }
  const t = e.porTarefa;
  L.push(`| \`${m}\` | ${t.ler} | ${t.procurar} | ${t.testes} | ${t.git} | ${t.irrelevante} | **${e.pct}%** |`);
}
L.push('');
L.push('## B6 — fidelidade JSON (parse / schema / enum contados em separado)');
L.push('');
L.push('| Modelo | n | faz parse | cumpre schema | veredicto no enum |');
L.push('|---|---|---|---|---|');
for (const m of MODELOS) {
  const e = (extra[m] || {}).b6;
  L.push(e ? `| \`${m}\` | ${e.n} | ${e.parse_pct}% | ${e.schema_pct}% | ${e.enum_pct}% |` : `| \`${m}\` | n/d | n/d | n/d | n/d |`);
}
L.push('');
L.push('## O portão de promoção — fecha?');
L.push('');
const inc = resumo[0];
L.push(`Incumbente: \`${inc.modelo}\` (B1 ${inc.B1_citacao_ok_pct}%, B4 p50 ${inc.B4_p50_s}s).`);
L.push('');
L.push('| Modelo | B1 ≥ inc+5pp <br>ou (≥inc−2pp e B4≤60%) | B2 < 2% | B3 ≥ 80% | N ≥ 100 | **Promove?** |');
L.push('|---|---|---|---|---|---|');
for (const r of resumo.slice(1)) {
  const e = (extra[r.modelo] || {}).b3;
  const b1a = r.B1_citacao_ok_pct >= inc.B1_citacao_ok_pct + 5;
  const b1b = r.B1_citacao_ok_pct >= inc.B1_citacao_ok_pct - 2 && r.B4_p50_s <= inc.B4_p50_s * 0.6;
  const okB1 = b1a || b1b, okB2 = r.B2_refutado_pct < 2;
  const okB3 = e ? e.pct >= 80 : null, okN = r.n >= 100;
  const mk = (v) => (v === null ? 'n/d' : v ? '✅' : '❌');
  L.push(`| \`${r.modelo}\` | ${mk(okB1)} | ${mk(okB2)} | ${mk(okB3)} | ${mk(okN)} | ${okB1 && okB2 && okB3 && okN ? '**SIM — proposta ao dono**' : '**NÃO**'} |`);
}
L.push('');
L.push('> Um ✅ em todas as colunas produz uma PROPOSTA no painel — nunca uma promoção.');
L.push('> Promover é o ▶ do dono, seguido de shadow 7d com revert automático.');
L.push('');
L.push(`Dados crus: \`${path.basename(JSONL)}\` (uma linha por ronda).`);
fs.writeFileSync(SUMO, L.join('\n') + '\n');

console.log('\n' + L.join('\n'));
console.log(`\nresumo: ${SUMO}\ncru:    ${JSONL}`);
