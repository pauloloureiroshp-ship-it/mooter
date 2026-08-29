#!/usr/bin/env node
// @ts-check
/**
 * vigia.mjs — a vigia do radar. TRES GETs publicos, zero-LLM, $0.
 *
 * NAO envia um byte de prompt para lado nenhum. Le a montra, nao entra na loja.
 * NAO faz `ollama pull`. NAO promove nada. So compara com o snapshot anterior
 * e escreve o delta.
 *
 * Uso:  node tools/radar/vigia.mjs [--escrever]
 *   sem --escrever  : imprime o delta e sai 0 (dry-run, o default)
 *   com --escrever  : grava o snapshot novo e faz append do delta ao radar do vault
 *
 * Saida: exit 0 sempre que a ronda corre. Rede em baixo NAO e falha do vigia —
 * e um alvo marcado `n/d` nessa ronda, declarado no delta.
 */
'use strict';

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ALVOS = [
  { id: 'ollama-catalogo', url: 'https://ollama.com/library',
    porque: 'tag nova ou tamanho mudado = candidato ao MooterBench' },
  { id: 'openrouter-precos', url: 'https://openrouter.ai/api/v1/models',
    porque: 'alimenta o pricing.js — fecha metade do M2a' },
  { id: 'openrouter-docs', url: 'https://openrouter.ai/docs/llms.txt',
    porque: 'pagina nova no indice = feature nova = candidato a clonar' },
];

const DIR = join(homedir(), '.mooter', 'radar');
const RADAR_VAULT = join(homedir(), 'paulo-vault', '40-strategy',
  '2026-08-28-radar-vigia-concorrencia-e-modelos.md');
const ESCREVER = process.argv.includes('--escrever');
const TIMEOUT_MS = 20000;

/** Impressao digital estavel de um alvo. Nunca guarda o corpo inteiro. */
function digerir(id, texto) {
  if (id === 'openrouter-precos') {
    // So o que interessa: slug -> preco. Ignora descricoes, que mudam por ruido.
    try {
      const j = JSON.parse(texto);
      const m = {};
      for (const mod of (j.data || [])) {
        m[mod.id] = `${mod.pricing?.prompt ?? 'n/d'}/${mod.pricing?.completion ?? 'n/d'}`;
      }
      return m;
    } catch { return { _erro: 'json ilegivel' }; }
  }
  if (id === 'openrouter-docs') {
    // Indice de docs: uma chave por caminho de pagina.
    const m = {};
    for (const l of texto.split('\n')) {
      const u = l.match(/\((\/docs\/[^)]+)\)/);
      if (u) m[u[1]] = 1;
    }
    return m;
  }
  // ollama: uma chave por nome de modelo listado.
  const m = {};
  for (const mm of texto.matchAll(/href="\/library\/([a-z0-9._-]+)"/gi)) m[mm[1]] = 1;
  return m;
}

function comparar(velho, novo) {
  const add = [], rem = [], mud = [];
  for (const k of Object.keys(novo)) {
    if (!(k in velho)) add.push(k);
    else if (JSON.stringify(velho[k]) !== JSON.stringify(novo[k])) mud.push(`${k}: ${velho[k]} -> ${novo[k]}`);
  }
  for (const k of Object.keys(velho)) if (!(k in novo)) rem.push(k);
  return { add, rem, mud };
}

const hoje = new Date().toISOString().slice(0, 10);
const linhas = [];
let houveDelta = false, alvosOk = 0;

mkdirSync(DIR, { recursive: true });

for (const alvo of ALVOS) {
  const snap = join(DIR, `${alvo.id}.json`);
  let texto = null, erro = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const r = await fetch(alvo.url, { signal: ctl.signal, headers: { 'user-agent': 'mooter-radar/1' } });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    texto = await r.text();
  } catch (e) { erro = String(e.message || e); }

  if (erro) {
    linhas.push(`| ${hoje} | \`${alvo.id}\` | **n/d — ${erro}** | rede em baixo nao e delta; ronda seguinte tenta outra vez |`);
    continue;
  }
  alvosOk++;

  const novo = digerir(alvo.id, texto);
  const nChaves = Object.keys(novo).length;

  // REVISAO 2026-08-29 (Mac, 1.a ronda com rede): uma digestao vazia ou em erro
  // NAO pode virar snapshot. Se virasse, a ronda seguinte comparava contra ela
  // e cuspia um delta gigante e falso — "+239 modelos novos" por causa de um
  // HTML que mudou de forma ou de um JSON meio lido. Um alvo que nao digeriu e
  // um alvo `n/d`, exactamente como a rede em baixo.
  if (novo._erro || nChaves === 0) {
    linhas.push(`| ${hoje} | \`${alvo.id}\` | **n/d — digestao vazia (${novo._erro || '0 entradas'})** | a resposta chegou mas nao deu para ler; snapshot NAO foi tocado |`);
    continue;
  }

  if (!existsSync(snap)) {
    linhas.push(`| ${hoje} | \`${alvo.id}\` | primeiro snapshot: **${nChaves}** entradas | linha de base, sem delta |`);
    if (ESCREVER) writeFileSync(snap, JSON.stringify(novo, null, 0));
    continue;
  }

  const velho = JSON.parse(readFileSync(snap, 'utf8'));
  const { add, rem, mud } = comparar(velho, novo);
  if (!add.length && !rem.length && !mud.length) {
    linhas.push(`| ${hoje} | \`${alvo.id}\` | sem delta (${nChaves} entradas) | — |`);
  } else {
    houveDelta = true;
    const p = [];
    if (add.length) p.push(`**+${add.length}**: ${add.slice(0, 8).join(', ')}${add.length > 8 ? '…' : ''}`);
    if (rem.length) p.push(`**-${rem.length}**: ${rem.slice(0, 8).join(', ')}${rem.length > 8 ? '…' : ''}`);
    if (mud.length) p.push(`**~${mud.length}**: ${mud.slice(0, 5).join(' · ')}${mud.length > 5 ? '…' : ''}`);
    linhas.push(`| ${hoje} | \`${alvo.id}\` | ${p.join(' · ')} | ${alvo.porque} — **fila do dono** |`);
  }
  if (ESCREVER) writeFileSync(snap, JSON.stringify(novo, null, 0));
}

const saida = linhas.join('\n');
console.log(`# radar · ronda ${hoje} · ${alvosOk}/${ALVOS.length} alvos alcancados\n`);
console.log(saida);
if (!houveDelta && alvosOk === ALVOS.length) console.log('\nsem deltas. nada a decidir.');

if (ESCREVER && existsSync(RADAR_VAULT)) {
  appendFileSync(RADAR_VAULT, `\n${saida}\n`);
  console.log(`\nescrito em ${RADAR_VAULT}`);
} else if (ESCREVER) {
  console.log(`\n⚠️ radar do vault nao encontrado em ${RADAR_VAULT} — delta nao gravado`);
}
