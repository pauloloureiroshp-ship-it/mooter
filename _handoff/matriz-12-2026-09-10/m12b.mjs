#!/usr/bin/env node
// @ts-check
/**
 * m12b.mjs — M12-b: a mesma matriz, mudando UMA variável — a linha 3 do system
 * prompt do executor local («nunca mais de 3 frases» → tamanho proporcional).
 *
 *   node _handoff/matriz-12-2026-09-10/m12b.mjs congelar   # pré-registo (uma vez)
 *   node _handoff/matriz-12-2026-09-10/m12b.mjs correr     # só o braço B, só os T0
 *   node _handoff/matriz-12-2026-09-10/m12b.mjs julgar     # J1+J2, B substituído no MESMO conjunto
 *   node _handoff/matriz-12-2026-09-10/m12b.mjs comparar   # tabela B vs B(m12b), e o ruído dos vizinhos
 *
 * Só corre o braço B: A, C e D não mudaram — as respostas deles são as da corrida
 * original, byte a byte. Os juízes vêem o MESMO conjunto, na MESMA ordem sorteada,
 * com uma única resposta trocada: a do rótulo que calhou ao B. Isso dá de borla
 * uma segunda referência de ruído: A, C e D são pontuados duas vezes, com o mesmo
 * texto, mudando só um vizinho.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chamarClaude } from './lib/claude-call.mjs';
import { chamarCodex } from './lib/codex-call.mjs';
import { correrMooter } from './lib/mooter-rota.mjs';
import { custos } from './lib/preco.mjs';
import { baralhar } from './lib/cego.mjs';
import { montarPromptDeJuiz, extrairJson, total, maximo, CRITERIOS } from './lib/rubrica.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const ARENA = path.join(os.tmpdir(), 'matriz12-arena');
const M = path.join(AQUI, 'm12b');
const RES0 = path.join(AQUI, 'results');
const JUZ0 = path.join(AQUI, 'juizes');
const RES = path.join(M, 'results');
const JUZ = path.join(M, 'juizes');
fs.mkdirSync(RES, { recursive: true }); fs.mkdirSync(JUZ, { recursive: true });

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prereg0 = JSON.parse(fs.readFileSync(path.join(AQUI, 'protocol.json'), 'utf8'));
const prompts = JSON.parse(fs.readFileSync(path.join(AQUI, 'prompts.json'), 'utf8')).prompts;
const OLLAMA_API = path.join(REPO, 'tools/router/providers/ollama-api.js');
const modo = process.argv[2];

// ── congelar ───────────────────────────────────────────────────────────────
if (modo === 'congelar') {
  const dest = path.join(M, 'protocol.json');
  if (fs.existsSync(dest)) { console.error('m12b/protocol.json já existe'); process.exit(2); }
  const src = fs.readFileSync(OLLAMA_API, 'utf8');
  const linha3 = (src.match(/const SYSTEM = \[([\s\S]*?)\]\.join/) || [])[1];
  fs.writeFileSync(dest, JSON.stringify({
    _schema: 'matriz-12/m12b-prereg/1',
    congelado_em: new Date().toISOString(),
    pergunta: 'Quanto da derrota do braço B nos 10 prompts T0 é a instrução «nunca mais de 3 frases» do system prompt local?',
    unica_variavel: 'tools/router/providers/ollama-api.js, linha 3 do SYSTEM: «Respostas curtas e directas — nunca mais de 3 frases para perguntas simples.» → «Responde de forma directa, com o tamanho que o pedido exige: curto quando a pergunta é simples, completo quando pede um documento, um plano ou um passo a passo.»',
    o_que_nao_muda: 'prompts.json (mesmo sha), modelo local (o que o probe recomenda), tecto 2048, D1 aplicado, classify congelado, rota (T0 nos mesmos 10), juízes J1/J2, rubrica, sorteio (mesma semente → mesma ordem), respostas de A/C/D (as originais, byte a byte)',
    ollama_api_sha256_com_d10: sha(OLLAMA_API),
    system_prompt_em_vigor: linha3 ? linha3.trim() : 'n/d',
    prompts_sha256: sha(path.join(AQUI, 'prompts.json')),
    prompts_sha256_esperado: prereg0.prompts_sha256,
    semente_do_sorteio: prereg0.semente_do_sorteio,
    congelados: prereg0.congelados,
    previsoes: {
      'B(m12b) > B nos 10 T0, pontos agregados J1+J2': 'SIM',
      'B(m12b) ≥ C (65,5) nos mesmos 10': 'NÃO',
      'B(m12b) recupera pelo menos metade da distância B→C (≥ 51,0)': 'NÃO SEI — é a pergunta',
    },
    regra_de_paragem: 'se B(m12b) ≥ A (81,5) nos 10 T0, o instrumento está partido: parar e investigar.',
    ruido_de_borla: 'A, C e D são pontuados outra vez, com o mesmo texto, mudando só o vizinho B. A diferença entre as duas rondas é ruído do juiz, medido em 30 respostas × 2 juízes.',
  }, null, 1) + '\n');
  console.log('pré-registo m12b escrito');
  process.exit(0);
}

const prereg = JSON.parse(fs.readFileSync(path.join(M, 'protocol.json'), 'utf8'));
const t0s = prompts.filter((p) => {
  const r = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8'));
  return r.bracos.B.rota && r.bracos.B.rota.tier === 'T0';
});

// ── correr ─────────────────────────────────────────────────────────────────
if (modo === 'correr') {
  if (sha(OLLAMA_API) !== prereg.ollama_api_sha256_com_d10) { console.error('ollama-api.js mudou depois do pré-registo — PARADO'); process.exit(2); }
  if (sha(path.join(AQUI, 'prompts.json')) !== prereg.prompts_sha256) { console.error('prompts.json mudou — PARADO'); process.exit(2); }
  for (const [n, s] of Object.entries(prereg.congelados)) if (sha(path.join(REPO, n)) !== s) { console.error(`${n} mudou — PARADO`); process.exit(2); }
  console.log(`M12-b · ${t0s.length} prompts T0 · só o braço B`);
  for (const p of t0s) {
    const dest = path.join(RES, `${p.id}.json`);
    if (fs.existsSync(dest)) { console.log(`- ${p.id}: já existe — saltado`); continue; }
    process.stdout.write(`  ${p.id} B(m12b)…`);
    const r = correrMooter({ prompt: p.texto, repo: REPO, arena: ARENA });
    if (!r.rota || r.rota.tier !== 'T0') { console.log(` ROTA MUDOU para ${r.rota && r.rota.tier} — não devia; gravado como está`); }
    const linha = { id: p.id, iniciado: new Date().toISOString(), braco: 'B_m12b', ...r, ...custos(r.modelo || '', r) };
    fs.writeFileSync(dest, JSON.stringify(linha, null, 1) + '\n');
    console.log(` ok · ${r.tokens_out} tokens · ${(r.decorrido_ms / 1000).toFixed(1)}s${r.truncou ? ' · TRUNCOU' : ''}`);
  }
  process.exit(0);
}

// ── julgar ─────────────────────────────────────────────────────────────────
const JUIZ = { J1: { motor: 'codex', modelo: 'gpt-6-astra' }, J2: { motor: 'claude', modelo: 'claude-sonnet-5' } };
function perguntar(juiz, prompt) {
  if (JUIZ[juiz].motor === 'codex') { const r = chamarCodex({ prompt, cwd: ARENA, model: JUIZ[juiz].modelo }); return { texto: r.texto, ok: r.ok, motivo: r.motivo, tokens_in: r.tokens_in, tokens_out: r.tokens_out }; }
  const r = chamarClaude({ prompt, model: JUIZ[juiz].modelo, cwd: ARENA });
  return { texto: r.texto, ok: r.ok, motivo: r.motivo, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cache_creation: r.cache_creation, cache_read: r.cache_read };
}
if (modo === 'julgar') {
  for (const p of t0s) {
    const r0 = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8'));
    const fB = path.join(RES, `${p.id}.json`);
    if (!fs.existsSync(fB)) { console.log(`- ${p.id}: sem B(m12b) — saltado`); continue; }
    const rB = JSON.parse(fs.readFileSync(fB, 'utf8'));
    if (!rB.texto) { console.log(`- ${p.id}: B(m12b) sem texto — saltado`); continue; }
    // O mesmo conjunto de braços da ronda original, na mesma ordem; só o texto do B muda.
    const comTexto = Object.entries(r0.bracos).filter(([, v]) => v && typeof v.texto === 'string' && v.texto.trim()).map(([k]) => k);
    const { rotulos, chave } = baralhar(comTexto, prereg.semente_do_sorteio, p.id);
    const respostas = comTexto.map((b) => ({ rotulo: rotulos[b], texto: b === 'B' ? rB.texto : r0.bracos[b].texto })).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    const promptDeJuiz = montarPromptDeJuiz({ pedido: p.texto, ehDeRisco: !!p.risco, respostas });
    const dest = path.join(JUZ, `${p.id}.json`);
    const feito = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : { id: p.id, chave, notas: {} };
    for (const juiz of ['J1', 'J2']) {
      if (feito.notas[juiz]) { console.log(`- ${p.id} ${juiz}: já existe`); continue; }
      process.stdout.write(`  ${p.id} ${juiz}…`);
      const r = perguntar(juiz, promptDeJuiz);
      const j = extrairJson(r.texto);
      const notas = {};
      if (j) for (const [rot, v] of Object.entries(j)) { const b = chave[rot]; if (!b) continue; const n = {}; for (const c of CRITERIOS) n[c.chave] = Number(v[c.chave]); notas[b] = { rotulo: rot, ...n, porque: v.porque || null, total: total(n, !!p.risco), maximo: maximo(!!p.risco) }; }
      feito.notas[juiz] = { motor: JUIZ[juiz], ok: r.ok && Object.keys(notas).length === comTexto.length, motivo: r.motivo || null, notas, bruto: r.texto, custo_tokens: { in: r.tokens_in, out: r.tokens_out, cache_write: r.cache_creation || 0, cache_read: r.cache_read || 0 } };
      fs.writeFileSync(dest, JSON.stringify(feito, null, 1) + '\n');
      console.log(feito.notas[juiz].ok ? ' ok' : ` FALHOU: ${feito.notas[juiz].motivo}`);
    }
    fs.writeFileSync(path.join(JUZ, `${p.id}.prompt-de-juiz.txt`), promptDeJuiz);
  }
  process.exit(0);
}

// ── comparar ───────────────────────────────────────────────────────────────
if (modo === 'comparar') {
  const out = [];
  out.push('# M12-b — uma variável: a linha das 3 frases');
  out.push('');
  out.push(`Pré-registo: \`m12b/protocol.json\` (${prereg.congelado_em}). Gerado por \`m12b.mjs comparar\`; nenhuma célula à mão.`);
  out.push('');
  out.push('| prompt | máx | B (3 frases) | **B (m12b)** | Δ B | tokens B → m12b | C (ronda 1 → 2) | A (1 → 2) | D (1 → 2) |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  const acc = { B0: 0, B1: 0, C0: 0, C1: 0, A0: 0, A1: 0, D0: 0, D1: 0, max: 0, n: 0 };
  const ruido = [];
  for (const p of t0s) {
    const fJ1 = path.join(JUZ, `${p.id}.json`);
    if (!fs.existsSync(fJ1)) continue;
    const j0 = JSON.parse(fs.readFileSync(path.join(JUZ0, `${p.id}.json`), 'utf8'));
    const j1 = JSON.parse(fs.readFileSync(fJ1, 'utf8'));
    const r0 = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8'));
    const r1 = JSON.parse(fs.readFileSync(path.join(RES, `${p.id}.json`), 'utf8'));
    const media = (jz, b) => { const xs = ['J1', 'J2'].map((J) => jz.notas[J] && jz.notas[J].notas[b]).filter((x) => x && Number.isFinite(x.total)).map((x) => x.total); return xs.length === 2 ? (xs[0] + xs[1]) / 2 : null; };
    const m = maximo(!!p.risco);
    const v = { B0: media(j0, 'B'), B1: media(j1, 'B'), C0: media(j0, 'C'), C1: media(j1, 'C'), A0: media(j0, 'A'), A1: media(j1, 'A'), D0: media(j0, 'D'), D1: media(j1, 'D') };
    if (Object.values(v).some((x) => x === null)) { out.push(`| ${p.id} | ${m} | n/d | n/d | n/d | | | | |`); continue; }
    for (const k of Object.keys(v)) acc[k] += v[k];
    acc.max += m; acc.n++;
    for (const b of ['A', 'C', 'D']) for (const J of ['J1', 'J2']) ruido.push(Math.abs(j0.notas[J].notas[b].total - j1.notas[J].notas[b].total));
    const f = (x) => x.toFixed(1);
    out.push(`| ${p.id} | ${m} | ${f(v.B0)} | **${f(v.B1)}** | ${(v.B1 - v.B0) >= 0 ? '+' : ''}${f(v.B1 - v.B0)} | ${r0.bracos.B.tokens_out} → ${r1.tokens_out}${r1.truncou ? ' (truncou)' : ''} | ${f(v.C0)} → ${f(v.C1)} | ${f(v.A0)} → ${f(v.A1)} | ${f(v.D0)} → ${f(v.D1)} |`);
  }
  const f = (x) => x.toFixed(1);
  out.push(`| **total** | ${acc.max} | ${f(acc.B0)} | **${f(acc.B1)}** | ${(acc.B1 - acc.B0) >= 0 ? '+' : ''}${f(acc.B1 - acc.B0)} | | ${f(acc.C0)} → ${f(acc.C1)} | ${f(acc.A0)} → ${f(acc.A1)} | ${f(acc.D0)} → ${f(acc.D1)} |`);
  out.push('');
  const maxR = ruido.length ? Math.max(...ruido) : null;
  const medR = ruido.length ? ruido.reduce((s, x) => s + x, 0) / ruido.length : null;
  out.push('## Ruído do juiz, medido de borla');
  out.push('');
  out.push(`A, C e D têm o MESMO texto nas duas rondas; só o vizinho B mudou. Diferença por (resposta, juiz): **máx ${maxR}**, média ${medR === null ? 'n/d' : medR.toFixed(2)}, em ${ruido.length} pares.`);
  out.push('');
  out.push('## Previsões pré-registadas');
  out.push('');
  const metade = acc.B0 + (acc.C0 - acc.B0) / 2;
  out.push(`| previsão | registado | resultado |`);
  out.push(`|---|---|---|`);
  out.push(`| B(m12b) > B | SIM | ${acc.B1 > acc.B0 ? 'SIM' : 'NÃO'} (${f(acc.B1)} vs ${f(acc.B0)}) |`);
  out.push(`| B(m12b) ≥ C | NÃO | ${acc.B1 >= acc.C1 ? 'SIM' : 'NÃO'} (${f(acc.B1)} vs C ronda 2 ${f(acc.C1)}) |`);
  out.push(`| recupera ≥ metade de B→C (≥ ${f(metade)}) | não sei | ${acc.B1 >= metade ? 'SIM' : 'NÃO'} |`);
  out.push(`| paragem: B(m12b) ≥ A (${f(acc.A0)}) | — | ${acc.B1 >= acc.A0 ? '**DISPAROU — investigar**' : 'não disparou'} |`);
  fs.writeFileSync(path.join(M, 'COMPARACAO.md'), out.join('\n') + '\n');
  console.log(out.join('\n'));
  process.exit(0);
}
console.error('modo: congelar | correr | julgar | comparar'); process.exit(2);
