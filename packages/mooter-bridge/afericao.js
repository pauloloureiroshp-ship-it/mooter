'use strict';

/**
 * afericao.js — avaliação local de execuções já realizadas.
 *
 * Este módulo não despacha jobs nem usa rede. Recebe execuções do condutor,
 * avalia-as contra respostas conhecidas, persiste cada corrida e lê a última.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TASK_SET = require('./afericao-tarefas.json');
const DEFAULT_DIR = path.join(process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'afericao');
const VAGUE_ANSWERS = new Set([
  '', 'algum', 'alguma', 'alguns', 'algumas', 'varios', 'varias',
  'nao sei', 'n d', 'nd', 'desconhecido', 'talvez', 'depende',
]);

function normalizeText(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_+-]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function numericValues(text) {
  const matches = String(text || '').match(/[+-]?\d[\d.,]*/g) || [];
  const values = [];
  for (const raw of matches) {
    let cleaned = raw.replace(/[.,]+$/g, '');
    if (/^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(cleaned)) {
      cleaned = cleaned.replace(/[.,]/g, '');
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
    const value = Number(cleaned);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function expectedValue(task) {
  if (!task || typeof task !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(task, 'expected')) return task.expected;
  if (Object.prototype.hasOwnProperty.call(task, 'esperado')) return task.esperado;
  return task.answer;
}

/**
 * null significa que o texto não contém prova suficiente para decidir.
 * Só se marca false quando há uma resposta concreta e divergente.
 */
function avaliarResposta(task, text) {
  const expected = expectedValue(task);
  const normalized = normalizeText(text);
  if (expected === undefined || expected === null) {
    return { acertou: null, porque: 'a tarefa não tem resposta esperada verificável' };
  }
  if (VAGUE_ANSWERS.has(normalized)) {
    return { acertou: null, porque: 'a resposta é vaga ou declara que não sabe' };
  }

  const kind = task && task.kind;
  if (kind === 'number' || typeof expected === 'number') {
    const values = numericValues(text);
    if (values.length === 0) {
      return { acertou: null, porque: 'não encontrei um número concreto na resposta' };
    }
    if (values.some((value) => value === Number(expected))) {
      return { acertou: true, porque: 'a resposta contém o valor esperado ' + expected };
    }
    return {
      acertou: false,
      porque: 'a resposta deu ' + values.join(', ') + ', mas o valor verificável é ' + expected,
    };
  }

  const normalizedExpected = normalizeText(expected);
  const padded = ' ' + normalized + ' ';
  if (normalizedExpected && padded.includes(' ' + normalizedExpected + ' ')) {
    return { acertou: true, porque: 'a resposta contém o identificador esperado ' + expected };
  }

  // Um identificador explícito é resposta concreta; prosa sem candidato fica n/d.
  const candidates = String(text || '').match(/\b[\p{L}\p{N}]+(?:[_-][\p{L}\p{N}]+)+\b/gu) || [];
  if (candidates.length > 0) {
    return {
      acertou: false,
      porque: 'a resposta deu ' + candidates.join(', ') + ', mas o identificador verificável é ' + expected,
    };
  }
  if (/^[\p{L}\p{N}_-]+$/u.test(String(text || '').trim())) {
    return {
      acertou: false,
      porque: 'a resposta concreta diverge do valor verificável ' + expected,
    };
  }
  return { acertou: null, porque: 'não encontrei uma resposta concreta que possa verificar' };
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function median(values) {
  const sorted = values
    .map(finiteNonNegative)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value, places) {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(places));
}

function instanteDaCorrida(options) {
  const opts = options || {};
  const supplied = typeof opts.now === 'function' ? opts.now() : opts.now;
  const date = supplied == null ? new Date() : new Date(supplied);
  if (!Number.isFinite(date.getTime())) throw new Error('timestamp da aferição inválido');
  return date;
}

function timestampParaFicheiro(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function guardarResultadoDaAfericao(result, options) {
  const opts = options || {};
  const directory = opts.dir || opts.directory || DEFAULT_DIR;
  const measuredAt = instanteDaCorrida(opts);
  const base = timestampParaFicheiro(measuredAt);
  fs.mkdirSync(directory, { recursive: true });

  for (let sequence = 0; sequence < 1000; sequence++) {
    const suffix = sequence === 0 ? '' : '_' + String(sequence).padStart(3, '0');
    const file = path.join(directory, base + suffix + '.json');
    try {
      fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      return { ficheiro: file, medido_em: measuredAt.toISOString() };
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('não foi possível reservar um timestamp único para a aferição');
}

function recordsFrom(executions) {
  const records = [];
  for (const execution of Array.isArray(executions) ? executions : []) {
    if (!execution || typeof execution !== 'object') continue;
    const motor = String(execution.motor || execution.engine || execution.agent || 'n/d');
    if (Array.isArray(execution.respostas)) {
      for (const response of execution.respostas) {
        records.push(Object.assign({ motor }, response || {}));
      }
    } else {
      records.push(Object.assign({ motor }, execution));
    }
  }
  return records;
}

/**
 * O denominador de acerto só inclui avaliações booleanas: um null não pode
 * virar erro por acidente. O custo por resposta certa usa o custo total das
 * tentativas; se faltar um custo, o resultado é n/d (null), nunca um parcial.
 */
function resultadoDaAfericao(executions, options) {
  const groups = new Map();
  for (const record of recordsFrom(executions)) {
    if (!groups.has(record.motor)) groups.set(record.motor, []);
    groups.get(record.motor).push(record);
  }

  const result = {};
  for (const [motor, records] of groups) {
    const decided = records.filter((record) => {
      const value = record.acertou !== undefined
        ? record.acertou
        : record.resultado && record.resultado.acertou;
      return value === true || value === false;
    });
    const hits = decided.filter((record) => {
      const value = record.acertou !== undefined
        ? record.acertou
        : record.resultado && record.resultado.acertou;
      return value === true;
    }).length;
    const times = records.map((record) => (
      record.tempo_s !== undefined ? record.tempo_s : record.duration_s
    ));
    const rawCosts = records.map((record) => (
      record.custo_usd !== undefined ? record.custo_usd : record.cost_usd
    ));
    const costs = rawCosts.map(finiteNonNegative);
    const allCostsKnown = records.length > 0 && costs.every((value) => value !== null);
    const totalCost = allCostsKnown ? costs.reduce((sum, value) => sum + value, 0) : null;

    result[motor] = {
      acertos: hits,
      total: decided.length,
      acerto_pct: decided.length ? round((hits / decided.length) * 100, 2) : null,
      tempo_mediano_s: median(times),
      custo_mediano_usd: allCostsKnown ? median(rawCosts) : null,
      custo_por_resposta_certa: hits > 0 && totalCost !== null
        ? round(totalCost / hits, 6)
        : null,
    };
  }
  if (!options || options.persist !== false) guardarResultadoDaAfericao(result, options);
  return result;
}

const AFERICAO_FILE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2}-\d{3}Z(?:_\d{3})?)?\.json$/;

function medidoEmDoNome(name) {
  const base = String(name || '').replace(/\.json$/, '').replace(/_\d{3}$/, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
  const match = base.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  return match ? match[1] + 'T' + match[2] + ':' + match[3] + ':' + match[4] + '.' + match[5] + 'Z' : 'n/d';
}

/**
 * Leitura apenas: não cria a pasta nem corrige ficheiros inválidos.
 */
function lerUltimaAfericao(options) {
  const opts = options || {};
  const directory = opts.dir || opts.directory || DEFAULT_DIR;
  let files;
  try {
    files = fs.readdirSync(directory)
      .filter((name) => AFERICAO_FILE_RE.test(name))
      .sort()
      .reverse();
  } catch (error) {
    return {
      estado: 'n/d',
      porque: error && error.code === 'ENOENT'
        ? 'a aferição ainda não correu: não existe histórico em ' + directory
        : 'não consegui ler o histórico da aferição: ' + (error && error.message),
    };
  }
  if (!files.length) {
    return { estado: 'n/d', porque: 'a aferição ainda não correu: a pasta não contém medições' };
  }

  const file = path.join(directory, files[0]);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      estado: 'medido',
      ficheiro: file,
      medido_em: medidoEmDoNome(files[0]),
      resultado: data,
    };
  } catch (error) {
    return {
      estado: 'n/d',
      ficheiro: file,
      porque: 'a última aferição guardada não é JSON válido: ' + (error && error.message),
    };
  }
}

module.exports = {
  TASK_SET,
  DEFAULT_DIR,
  avaliarResposta,
  resultadoDaAfericao,
  guardarResultadoDaAfericao,
  lerUltimaAfericao,
  _median: median,
};
