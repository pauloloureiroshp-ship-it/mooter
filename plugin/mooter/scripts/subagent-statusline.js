#!/usr/bin/env node
/**
 * mooter · subagent status line
 *
 * O Claude Code entrega em stdin: { columns, tasks: [{ id, name, type, status,
 * description, label, startTime, model, effort, contextWindowSize, tokenCount,
 * tokenSamples, cwd }] }  (model/contextWindowSize exigem v2.1.205+, effort v2.1.214+).
 * Devolvemos uma linha JSON por task que queremos sobrepor:
 *   { "id": "<task_id>", "content": "<corpo da linha>" }
 * Omitir o id mantém o default. content vazio esconde a linha.
 *
 * DOUTRINA — este ficheiro nunca inventa um número:
 *   • v0 usa SÓ o que o CC dá em stdin. Zero dependência do ledger do Mooter.
 *   • O enriquecimento do Mooter (tier, custo, GPU) é ADITIVO: se o ficheiro de
 *     estado não existir ou não parsear, a linha sai sem ele — nunca com um
 *     valor adivinhado.
 *   • Qualquer campo ausente escreve-se "n/d", nunca 0 nem "—".
 *
 * Nunca escreve em disco. Nunca chama a rede. Nunca chama um modelo.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED = '\x1b[31m';

/** Lê stdin até EOF. Devolve '' se não houver nada. */
function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Nunca lança. Devolve null se o JSON for inválido. */
function parseOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Enriquecimento OPCIONAL a partir de ~/.mooter/. Se qualquer coisa falhar,
 * devolve {} — a linha sai sem estes campos em vez de sair com números falsos.
 * Não assume esquema: só usa chaves que existam e sejam do tipo esperado.
 */
function mooterHint() {
  try {
    const p = path.join(os.homedir(), '.mooter', 'board', 'latest.json');
    if (!fs.existsSync(p)) return {};
    const st = fs.statSync(p);
    // Estado com mais de 5 min não descreve o que está a acontecer agora.
    if (Date.now() - st.mtimeMs > 5 * 60 * 1000) return {};
    const j = parseOrNull(fs.readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object') return {};
    const out = {};
    if (typeof j.tier_motor === 'string') out.tier = j.tier_motor;
    if (typeof j.cost_usd === 'number') out.cost = j.cost_usd;
    if (typeof j.gpu_util_pct === 'number') out.gpu = j.gpu_util_pct;
    if (typeof j.local === 'boolean') out.local = j.local;
    return out;
  } catch {
    return {};
  }
}

/** 12345 -> "12.3k". Nunca arredonda para zero um valor não-zero. */
function humanTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'n/d';
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

/** ms -> "1m 47s" */
function humanElapsed(startTime) {
  if (typeof startTime !== 'number' || !Number.isFinite(startTime)) return 'n/d';
  const s = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Família do modelo a partir do id. Só reconhece o que sabe — qualquer outra
 * coisa devolve o id cru, nunca um palpite.
 */
function engineChip(model) {
  if (typeof model !== 'string' || !model) return { label: 'n/d', color: DIM, paid: null };
  const m = model.toLowerCase();
  if (m.includes('haiku')) return { label: 'Haiku', color: AMBER, paid: true };
  if (m.includes('sonnet')) return { label: 'Sonnet', color: AMBER, paid: true };
  if (m.includes('opus')) return { label: 'Opus', color: AMBER, paid: true };
  if (m.includes('fable')) return { label: 'Fable', color: AMBER, paid: true };
  if (m.includes('qwen') || m.includes('llama') || m.includes('mistral') || m.includes('gemma')) {
    return { label: `${model} · local`, color: GREEN, paid: false };
  }
  if (m.includes('gpt') || m.includes('codex') || m.includes('o1') || m.includes('o3')) {
    return { label: model, color: AMBER, paid: true };
  }
  return { label: model, color: DIM, paid: null };
}

function buildRow(task, hint, columns) {
  const parts = [];

  const engine = engineChip(task && task.model);
  parts.push(`${engine.color}${engine.label}${RESET}`);

  // Tier: só aparece se o Mooter o tiver declarado. Nunca deduzido do modelo.
  if (hint.tier) parts.push(`${DIM}${hint.tier}${RESET}`);

  // Custo. Esta é a coluna que paga a renda: grátis tem de ler como grátis.
  // `engine.paid === false` é uma conclusão do id do modelo (família local
  // conhecida), não um palpite: um modelo servido pelo Ollama do próprio
  // utilizador não tem preço por token. Se a família for desconhecida
  // (`paid === null`), não afirmamos nada.
  if (hint.local === true || engine.paid === false
      || (typeof hint.cost === 'number' && hint.cost === 0)) {
    parts.push(`${GREEN}🐮 grátis${RESET}`);
  } else if (typeof hint.cost === 'number') {
    parts.push(`${AMBER}$${hint.cost.toFixed(4)}${RESET}`);
  } else if (engine.paid === true) {
    parts.push(`${DIM}custo n/d${RESET}`);
  }

  parts.push(`${DIM}${humanTokens(task && task.tokenCount)} tok${RESET}`);
  parts.push(`${DIM}${humanElapsed(task && task.startTime)}${RESET}`);

  if (typeof hint.gpu === 'number') parts.push(`${DIM}GPU ${hint.gpu}%${RESET}`);

  // "vivo" não é "a progredir" — quando o CC nos diz que a task está em erro,
  // dizemo-lo em vermelho em vez de continuar a animar uma linha optimista.
  if (task && typeof task.status === 'string' && /error|fail/i.test(task.status)) {
    parts.push(`${RED}⚠ ${task.status}${RESET}`);
  }

  let line = parts.join(`${DIM} · ${RESET}`);
  if (typeof columns === 'number' && columns > 20) {
    // Corte defensivo por comprimento visível (ignora os códigos ANSI).
    const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
    if (visible.length > columns - 2) {
      line = `${line.slice(0, Math.max(0, line.length - (visible.length - (columns - 3))))}…`;
    }
  }
  return line;
}

function main() {
  const input = parseOrNull(readStdin());
  if (!input || !Array.isArray(input.tasks)) return; // silêncio > linha errada

  const hint = mooterHint();
  const out = [];
  for (const task of input.tasks) {
    if (!task || typeof task.id !== 'string') continue;
    out.push(JSON.stringify({ id: task.id, content: buildRow(task, hint, input.columns) }));
  }
  if (out.length) process.stdout.write(`${out.join('\n')}\n`);
}

try {
  main();
} catch {
  // Uma statusline que rebenta não pode derrubar o painel. Falha em silêncio.
}
