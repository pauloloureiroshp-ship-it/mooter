'use strict';
/**
 * capacidades-modelo.js — o que um modelo local SABE FAZER, medido.
 *
 * ── Porque existe ───────────────────────────────────────────────────────────
 * O radar de 2026-08-28 (§2, padrão #4) apontou o órfão: «`require_parameters`
 * — só roteia para destino que suporta o que o prompt exige. Evita mandar
 * trabalho agêntico para modelo local sem tool-calling.» Ficou escrito e sem
 * dados. A 2026-08-29 os dados apareceram, e são piores do que a hipótese:
 *
 *   `qwen2.5-coder:14b`, o residente do Mac mini, declara `capabilities:
 *   ['completion','tools']` no catálogo — e em 20 tarefas que exigiam uma
 *   chamada de ferramenta chamou **zero**. Vinte vezes «não chamou ferramenta
 *   nenhuma». Os 20% de B3 dele vêm todos da tarefa de IRRELEVÂNCIA, que ele
 *   acerta precisamente por nunca chamar.
 *
 * Ou seja: o catálogo declarava uma capacidade que o modelo não tem, e não
 * havia nada que pudesse desmentir a declaração, porque ninguém media.
 *
 * ── As duas regras ──────────────────────────────────────────────────────────
 * 1. **Medido vence declarado.** `capabilities: ['tools']` é uma afirmação;
 *    `capabilities_medidas.tool_calling` é um recibo. Ganha o recibo.
 * 2. **Ausência não é negação** — a mesma doutrina do `capacidades.js` do
 *    bridge. Um modelo sem medição devolve `n/d`, nunca `false`. Um `n/d` não
 *    autoriza o despacho nem o proíbe: obriga a dizer que não se sabe.
 *
 * ── A armadilha da métrica, e como se evita ─────────────────────────────────
 * Uma percentagem de B3 sozinha premeia quem nunca chama: acerta a tarefa de
 * irrelevância e falha as outras em silêncio. Por isso o veredicto exige AS
 * DUAS coisas: a nota global E a taxa de «chamou quando devia».
 */

const fs = require('fs');
const path = require('path');

const INTEL_PATH = path.join(__dirname, 'model-intelligence.json');

/** Nota mínima para um veredicto positivo. É a barra do portão do mapa §3 (B3 ≥ 4/5). */
const BARRA_PCT = 80;

function lerIntel(opts = {}) {
  if (opts.intel) return opts.intel;
  try { return JSON.parse(fs.readFileSync(opts.intelPath || INTEL_PATH, 'utf8')); }
  catch { return null; }
}

function fraccao(s) {
  const m = String(s || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const d = Number(m[2]);
  return d > 0 ? Number(m[1]) / d : null;
}

/**
 * O que se sabe, MEDIDO, sobre um modelo local.
 * @returns {{modelo:string, tool_calling:Object|null, json_schema:Object|null, declaradas:string[]|null}}
 */
function capacidadesDe(modelo, opts = {}) {
  const intel = lerIntel(opts);
  const e = (intel && intel.models && intel.models.local && intel.models.local[modelo]) || null;
  const med = (e && e.capabilities_medidas) || null;
  return {
    modelo,
    tool_calling: (med && med.tool_calling) || null,
    json_schema: (med && med.json_schema) || null,
    declaradas: (e && Array.isArray(e.capabilities)) ? e.capabilities : null,
  };
}

/**
 * O modelo cumpre `tools`? Três estados, nunca dois.
 * @returns {{estado:'cumpre'|'nao-cumpre'|'n/d', porque:string, medido_em?:string}}
 */
function verificaTools(cap) {
  const t = cap.tool_calling;
  if (!t) {
    return {
      estado: 'n/d',
      porque: cap.declaradas && cap.declaradas.includes('tools')
        ? 'o catálogo DECLARA tools mas ninguém mediu — declaração não é recibo'
        : 'sem medição de tool-calling para este modelo',
    };
  }
  const chamou = fraccao(t.chamou_quando_devia);
  const nota = Number(t.b3_pct);
  // As duas condições, e é de propósito: a nota sozinha premeia quem nunca chama.
  if (Number.isFinite(nota) && nota >= BARRA_PCT && chamou !== null && chamou >= BARRA_PCT / 100) {
    return { estado: 'cumpre', porque: `B3 ${nota}% e chamou ${t.chamou_quando_devia} quando devia`, medido_em: t.medido_em };
  }
  if (chamou === 0) {
    return { estado: 'nao-cumpre', porque: `chamou ${t.chamou_quando_devia} — nunca chamou uma ferramenta`, medido_em: t.medido_em };
  }
  return { estado: 'nao-cumpre', porque: `B3 ${nota}% · chamou ${t.chamou_quando_devia} — abaixo da barra de ${BARRA_PCT}%`, medido_em: t.medido_em };
}

/** O modelo cumpre `json_schema`? */
function verificaJson(cap) {
  const j = cap.json_schema;
  if (!j) return { estado: 'n/d', porque: 'sem medição de fidelidade JSON para este modelo' };
  const p = Number(j.b6_schema_pct);
  return Number.isFinite(p) && p >= BARRA_PCT
    ? { estado: 'cumpre', porque: `B6 schema ${p}%`, medido_em: j.medido_em }
    : { estado: 'nao-cumpre', porque: `B6 schema ${p}% — abaixo de ${BARRA_PCT}%`, medido_em: j.medido_em };
}

/**
 * Este modelo pode receber este trabalho?
 * @param {string} modelo
 * @param {{tools?:boolean, json_schema?:boolean}} exige
 * @returns {{ok:boolean, incerto:boolean, faltas:Array, porque:string}}
 */
function podeExecutar(modelo, exige = {}, opts = {}) {
  const cap = capacidadesDe(modelo, opts);
  const faltas = [];
  let incerto = false;
  const avaliar = (nome, fn) => {
    const r = fn(cap);
    if (r.estado === 'nao-cumpre') faltas.push({ capacidade: nome, ...r });
    if (r.estado === 'n/d') { incerto = true; faltas.push({ capacidade: nome, ...r }); }
  };
  if (exige.tools) avaliar('tools', verificaTools);
  if (exige.json_schema) avaliar('json_schema', verificaJson);
  const duros = faltas.filter((f) => f.estado === 'nao-cumpre');
  return {
    ok: duros.length === 0 && !incerto,
    incerto,
    faltas,
    porque: duros.length ? duros.map((f) => `${f.capacidade}: ${f.porque}`).join(' · ')
      : incerto ? faltas.map((f) => `${f.capacidade}: ${f.porque}`).join(' · ')
      : 'cumpre o que o trabalho exige',
  };
}

/**
 * De uma lista de candidatos, os que servem — medidos primeiro, incertos depois,
 * e nunca os que foram medidos a falhar.
 */
function candidatosPara(modelos, exige = {}, opts = {}) {
  const av = modelos.map((m) => ({ modelo: m, ...podeExecutar(m, exige, opts) }));
  return {
    servem: av.filter((a) => a.ok).map((a) => a.modelo),
    incertos: av.filter((a) => !a.ok && a.incerto && !a.faltas.some((f) => f.estado === 'nao-cumpre')).map((a) => a.modelo),
    recusados: av.filter((a) => a.faltas.some((f) => f.estado === 'nao-cumpre')).map((a) => ({ modelo: a.modelo, porque: a.porque })),
  };
}

/** Onde o catálogo DECLARA uma capacidade que a medição desmente. */
function declaracoesDesmentidas(opts = {}) {
  const intel = lerIntel(opts);
  const locais = (intel && intel.models && intel.models.local) || {};
  const out = [];
  for (const m of Object.keys(locais)) {
    if (m.startsWith('_')) continue;
    const cap = capacidadesDe(m, opts);
    if (!cap.declaradas || !cap.declaradas.includes('tools')) continue;
    const v = verificaTools(cap);
    if (v.estado === 'nao-cumpre') out.push({ modelo: m, declara: 'tools', medido: v.porque, medido_em: v.medido_em });
  }
  return out;
}

module.exports = { capacidadesDe, podeExecutar, candidatosPara, declaracoesDesmentidas, verificaTools, verificaJson, BARRA_PCT };
