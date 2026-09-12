#!/usr/bin/env node
// @ts-check
/**
 * correr.mjs — a corrida da MATRIZ 12. Quatro bracos, doze prompts, uma vez.
 *
 *   node _handoff/matriz-12-2026-09-10/correr.mjs [--so=ID] [--ensaio]
 *
 *   --ensaio  corre so o braco local (T0) e o classify: custo $0, serve para
 *             ver a rota de cada prompt ANTES de gastar nuvem.
 *   --so=ID   corre um prompt so (para retomar uma corrida interrompida).
 *
 * Guardas antes da primeira chamada:
 *   - sha do classify.js e do patterns.js batem com o pre-registo;
 *   - sha do prompts.json bate com o pre-registo (o texto nao mudou depois
 *     das previsoes terem sido escritas);
 *   - results/ nao tem ja um ficheiro para esse prompt (uma corrida: nao se
 *     regrava por cima, o ficheiro que existe manda).
 *
 * Perdas ficam. Um braco que falha grava a falha e a corrida continua.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chamarClaude } from './lib/claude-call.mjs';
import { chamarCodex } from './lib/codex-call.mjs';
import { correrMooter } from './lib/mooter-rota.mjs';
import { custos, TABELA } from './lib/preco.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const ARENA = path.join(os.tmpdir(), 'matriz12-arena');
const RESULTS = path.join(AQUI, 'results');
fs.mkdirSync(ARENA, { recursive: true });
fs.mkdirSync(RESULTS, { recursive: true });

const argv = process.argv.slice(2);
const ENSAIO = argv.includes('--ensaio');
const SO = (argv.find((a) => a.startsWith('--so=')) || '').slice(5) || null;

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// ── guardas ────────────────────────────────────────────────────────────────
const prereg = JSON.parse(fs.readFileSync(path.join(AQUI, 'protocol.json'), 'utf8'));
const falhas = [];
for (const [nome, esperado] of Object.entries(prereg.congelados)) {
  const alvo = path.join(REPO, nome);
  let real;
  try { real = sha256(alvo); } catch (e) { falhas.push(`${nome}: ilegivel (${e.code})`); continue; }
  if (real !== esperado) falhas.push(`${nome}: sha ${real} != pre-registado ${esperado}`);
}
const shaPrompts = sha256(path.join(AQUI, 'prompts.json'));
if (shaPrompts !== prereg.prompts_sha256) falhas.push(`prompts.json: sha ${shaPrompts} != pre-registado ${prereg.prompts_sha256}`);
if (falhas.length) {
  console.error('PARADO antes de gastar um token. Congelamento partido:');
  for (const f of falhas) console.error('  - ' + f);
  process.exit(2);
}

const prompts = JSON.parse(fs.readFileSync(path.join(AQUI, 'prompts.json'), 'utf8')).prompts;
const alvo = SO ? prompts.filter((p) => p.id === SO) : prompts;
if (!alvo.length) { console.error(`nenhum prompt com id "${SO}"`); process.exit(2); }

// ── bracos ─────────────────────────────────────────────────────────────────
const BRACOS = {
  A: { nome: 'Opus 5 — a escolha real do utilizador', papel: 'PRIMARIO' },
  B: { nome: 'Mooter — rota do classify(), executada', papel: 'em estudo' },
  B2: { nome: 'Mooter, degrau T0 em qwen3:30b', papel: 'coluna extra, so nos T0 (pedido do dono)' },
  C: { nome: 'Haiku 4.5 — o adversario barato', papel: 'SECUNDARIO, declarado' },
  D: { nome: 'GPT via Codex CLI, effort medium', papel: 'AGENTE COM HARNESS, nao modelo nu' },
};
const MODELO_T0_ALTERNATIVO = 'qwen3:30b';

function comCusto(modelo, r) {
  const c = custos(modelo, r);
  return { ...r, ...c };
}

async function corre(p) {
  const dest = path.join(RESULTS, `${p.id}.json`);
  if (fs.existsSync(dest)) { console.log(`- ${p.id}: ja existe (uma corrida) — saltado`); return; }
  const linha = { id: p.id, dominio: p.dominio, risco: !!p.risco, iniciado: new Date().toISOString(), bracos: {} };

  // B primeiro: e o unico que pode dizer "isto e T0" e poupar as outras chamadas
  // se o dono um dia quiser cortar a corrida. Tambem e o mais barato de repetir.
  process.stdout.write(`  ${p.id} B…`);
  // UMA chamada. O modelo so se sabe depois de o classify decidir, por isso o
  // preco aplica-se ao resultado que ja existe -- nunca correndo o braco outra
  // vez so para descobrir para onde ele foi.
  const rB = correrMooter({ prompt: p.texto, repo: REPO, arena: ARENA });
  linha.bracos.B = comCusto(rB.modelo || '', rB);

  // B2 so existe onde ha diferenca: o degrau T0. Num T3 seria o mesmo Opus
  // chamado duas vezes — dinheiro e tempo por uma coluna identica.
  if (rB.rota && rB.rota.tier === 'T0') {
    process.stdout.write(' B2…');
    const rB2 = correrMooter({ prompt: p.texto, repo: REPO, arena: ARENA, modeloT0Forcado: MODELO_T0_ALTERNATIVO });
    linha.bracos.B2 = comCusto(rB2.modelo || '', rB2);
  } else {
    linha.bracos.B2 = { nao_corrido: `degrau ${rB.rota ? rB.rota.tier : 'n/d'}: B2 so existe no T0` };
  }

  if (!ENSAIO) {
    process.stdout.write(' A…');
    linha.bracos.A = comCusto('claude-opus-5', chamarClaude({ prompt: p.texto, model: 'claude-opus-5', cwd: ARENA }));
    process.stdout.write(' C…');
    linha.bracos.C = comCusto('claude-haiku-4-5-20251001', chamarClaude({ prompt: p.texto, model: 'claude-haiku-4-5-20251001', cwd: ARENA }));
    process.stdout.write(' D…');
    const d = chamarCodex({ prompt: p.texto, cwd: ARENA });
    linha.bracos.D = { ...d, ...custos('gpt-6-astra', d) };
  }

  linha.terminado = new Date().toISOString();
  fs.writeFileSync(dest, JSON.stringify(linha, null, 1) + '\n');
  fs.appendFileSync(path.join(RESULTS, 'linhas.jsonl'), JSON.stringify(linha) + '\n');
  const b = linha.bracos.B;
  console.log(` feito · rota ${b.rota ? b.rota.tier : 'n/d'} -> ${b.modelo || 'n/d'}`);
}

console.log(`MATRIZ 12 · ${alvo.length} prompt(s)${ENSAIO ? ' · ENSAIO ($0: so classify + local)' : ' · corrida a serio'}`);
console.log(`preco: ${TABELA.fonte} (lido ${TABELA.lido_em})`);
for (const p of alvo) await corre(p);
console.log('resultados em ' + RESULTS);
