'use strict';
/**
 * M1: scorecard determinístico da empresa de uma pessoa.
 *
 * Não há LLM, inferência de valores em falta, nem zero a representar n/d.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const seamless = require('./seamless.js');
const quota = require('./quota.js');
const aprender = require('./aprender.js');
const gpu = require('./gpu.js');

const RESOURCE_URI = 'mooter://meo/scorecard';
const RESOURCE = {
  uri: RESOURCE_URI,
  name: 'MEO scorecard',
  description: 'Scorecard determinístico: métricas, faixas e excepções da operação Mooter.',
  mimeType: 'application/json',
};

/** Limiares de arranque: são defaults operacionais, não factos medidos. */
const DEFAULT_FAIXAS = Object.freeze({
  entregas_por_dia: Object.freeze([1, 1000]),
  lead_time_primeiro_token_s: Object.freeze([0, 120]),
  taxa_falha_pct: Object.freeze([0, 20]),
  tempo_recuperacao_min: Object.freeze([0, 60]),
  keep_rate_pct: Object.freeze([50, 100]),
  custo_por_tarefa_entregue_usd: Object.freeze([0, 1]),
  trabalho_zero_pct: Object.freeze([50, 100]),
  pressao_quota: Object.freeze([0, 0.85]),
  wip_actual: Object.freeze([0, 3]),
});

const DONOS = Object.freeze({
  entregas_por_dia: 'MOO',
  lead_time_primeiro_token_s: 'MOO',
  taxa_falha_pct: 'MTO',
  tempo_recuperacao_min: 'MTO',
  keep_rate_pct: 'MIO',
  custo_por_tarefa_entregue_usd: 'MFO',
  trabalho_zero_pct: 'MOO',
  pressao_quota: 'MFO',
  wip_actual: 'MOO',
});

const EFEITOS = Object.freeze({
  entregas_por_dia: 'a cadência continua abaixo da faixa e o backlog cresce',
  lead_time_primeiro_token_s: 'o feedback inicial continua lento e aumenta o WIP percebido',
  taxa_falha_pct: 'mais trabalho termina sem entrega e exige repetição',
  tempo_recuperacao_min: 'falhas ficam abertas por mais tempo e bloqueiam a wave',
  keep_rate_pct: 'mais alterações entregues são desfeitas ou refeitas',
  custo_por_tarefa_entregue_usd: 'cada entrega continua a consumir mais orçamento pago',
  trabalho_zero_pct: 'mais trabalho continua a sair da GPU local para subscrições',
  pressao_quota: 'o tecto de subscrição aproxima-se sem redução de tier',
  wip_actual: 'o trabalho em curso continua acima da capacidade de fecho',
});

function home(opts) {
  const o = opts || {};
  return o.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

function paths(opts) {
  const raiz = home(opts);
  return {
    scorecard: path.join(raiz, 'scorecard.json'),
    board: path.join(raiz, 'board'),
    preferences: (opts && opts.preferencesFile) || path.join(raiz, 'preferences.json'),
  };
}

function agoraIso(opts) {
  const valor = opts && opts.agora;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'string') return new Date(valor).toISOString();
  return new Date(valor || Date.now()).toISOString();
}

function numero(valor) {
  if (valor == null || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function arredondar(valor, casas) {
  const n = numero(valor);
  return n == null ? null : Number(n.toFixed(casas == null ? 3 : casas));
}

function mediana(valores) {
  const lista = valores.map(numero).filter((v) => v != null).sort((a, b) => a - b);
  if (!lista.length) return null;
  const meio = Math.floor(lista.length / 2);
  return lista.length % 2 ? lista[meio] : (lista[meio - 1] + lista[meio]) / 2;
}

function faixaValida(valor) {
  const lista = Array.isArray(valor) ? valor
    : (valor && typeof valor === 'object' ? [valor.min, valor.max] : null);
  if (!lista || lista.length !== 2) return null;
  const min = numero(lista[0]);
  const max = numero(lista[1]);
  return min != null && max != null && min <= max ? [min, max] : null;
}

function lerFaixas(opts) {
  const p = paths(opts);
  let calibradas = {};
  try {
    const prefs = JSON.parse(fs.readFileSync(p.preferences, 'utf8'));
    calibradas = prefs && prefs.board_faixas && typeof prefs.board_faixas === 'object'
      ? prefs.board_faixas : {};
  } catch { /* sem preferências: os defaults ficam declarados */ }
  const out = {};
  for (const [nome, padrao] of Object.entries(DEFAULT_FAIXAS)) {
    const calibrada = faixaValida(calibradas[nome]);
    out[nome] = calibrada
      ? { faixa: calibrada, origem: 'preferences.json → board_faixas (calibrada pelo utilizador)' }
      : { faixa: [...padrao], origem: 'default MEO M1 — não é um valor medido; calibrável em preferences.json' };
  }
  return out;
}

function metrica(nome, valor, unidade, fonte, medidoEm, faixas, porque) {
  const config = faixas[nome];
  const n = numero(valor);
  const estado = n == null ? 'n/d'
    : (n >= config.faixa[0] && n <= config.faixa[1] ? 'dentro' : 'fora');
  return {
    valor: n,
    unidade,
    fonte,
    medido_em: medidoEm,
    faixa: [...config.faixa],
    faixa_origem: config.origem,
    estado,
    porque: n == null ? porque
      : (porque + '; valor ' + n + (estado === 'dentro' ? ' dentro de ' : ' fora de ')
        + '[' + config.faixa.join(', ') + ']'),
  };
}

function lerLedger(opts) {
  const o = opts || {};
  if (Array.isArray(o.ledger)) return o.ledger;
  const read = typeof o.ledgerRead === 'function' ? o.ledgerRead : seamless.ledgerRead;
  try {
    const r = read();
    return Array.isArray(r) ? r : [];
  } catch { return []; }
}

function registos(ledger, opts) {
  const mod = (opts && opts.aprenderModule) || aprender;
  if (typeof mod._jobRecords === 'function') return mod._jobRecords({ ledger });
  return [];
}

function temposPrimeiroToken(ledger) {
  const despachos = new Map();
  const medidos = new Set();
  const valores = [];
  const ordenados = ledger.slice().sort((a, b) => Date.parse(a.ts || 0) - Date.parse(b.ts || 0));
  for (const ev of ordenados) {
    if (!ev || !ev.job_id) continue;
    if (ev.event === 'dispatched' && !despachos.has(ev.job_id)) {
      const t = Date.parse(ev.ts || 0);
      if (Number.isFinite(t)) despachos.set(ev.job_id, t);
      continue;
    }
    if (medidos.has(ev.job_id) || !despachos.has(ev.job_id)) continue;
    const explicito = numero(ev.first_token_ms != null ? ev.first_token_ms : ev.ttft_ms);
    if (explicito != null && explicito >= 0) {
      valores.push(explicito / 1000);
      medidos.add(ev.job_id);
      continue;
    }
    const primeiro = ev.first_token_at ? Date.parse(ev.first_token_at) : NaN;
    const eventoUtil = /^(first[_-]?token|token_util|useful_token)$/i.test(String(ev.event || ''))
      || (ev.event === 'progress' && numero(ev.tokens_out) > 0);
    const t = Number.isFinite(primeiro) ? primeiro : (eventoUtil ? Date.parse(ev.ts || 0) : NaN);
    if (Number.isFinite(t) && t >= despachos.get(ev.job_id)) {
      valores.push((t - despachos.get(ev.job_id)) / 1000);
      medidos.add(ev.job_id);
    }
  }
  return valores;
}

function temposRecuperacao(ledger) {
  const pendentes = new Map();
  const valores = [];
  const ordenados = ledger.slice().sort((a, b) => Date.parse(a.ts || 0) - Date.parse(b.ts || 0));
  for (const ev of ordenados) {
    if (!ev || !ev.wave || !['failed', 'done'].includes(ev.event)) continue;
    const t = Date.parse(ev.ts || 0);
    if (!Number.isFinite(t)) continue;
    if (ev.event === 'failed') {
      const lista = pendentes.get(ev.wave) || [];
      lista.push(t);
      pendentes.set(ev.wave, lista);
      continue;
    }
    const lista = pendentes.get(ev.wave) || [];
    for (const falha of lista) if (t >= falha) valores.push((t - falha) / 60000);
    if (lista.length) pendentes.delete(ev.wave);
  }
  return valores;
}

function keepRate(records, opts) {
  const o = opts || {};
  const jobs = records.filter((r) => r.status === 'done' && r.escrita === true).slice(-20);
  if (!jobs.length) return { valor: null, porque: 'não há jobs de escrita entregues para medir' };
  let resultados;
  if (Array.isArray(o.keepResults)) resultados = o.keepResults;
  else {
    const mod = o.aprenderModule || aprender;
    const medir = o.measureKeepRate || mod.measureKeepRate;
    resultados = jobs.map((job) => {
      try { return medir(job, o.aprenderOptions || {}); }
      catch (e) { return { keep_rate: null, porque: (e && e.message) || 'medição falhou' }; }
    });
  }
  const medidos = resultados.filter((r) => r && numero(r.keep_rate) != null);
  if (!medidos.length) {
    const ultimo = resultados.find((r) => r && r.porque);
    return { valor: null, porque: ultimo ? ultimo.porque : 'aprender.js não encontrou prova mensurável' };
  }
  const comFicheiros = medidos.filter((r) => numero(r.files_kept) != null && numero(r.files_measured) > 0);
  if (comFicheiros.length) {
    const kept = comFicheiros.reduce((s, r) => s + Number(r.files_kept), 0);
    const total = comFicheiros.reduce((s, r) => s + Number(r.files_measured), 0);
    return { valor: arredondar(kept / total * 100, 2), porque: kept + '/' + total + ' ficheiros medidos por aprender.js' };
  }
  return {
    valor: arredondar(medidos.reduce((s, r) => s + Number(r.keep_rate), 0) / medidos.length, 2),
    porque: 'média de ' + medidos.length + ' keep rate(s) medido(s) por aprender.js',
  };
}

function construir(ledger, quotaState, gpuState, opts) {
  const o = opts || {};
  const medidoEm = agoraIso(o);
  const faixas = lerFaixas(o);
  const records = registos(ledger, o);
  const concluidos = records.filter((r) => r.status && !r.preparation);
  const entregues = concluidos.filter((r) => r.status === 'done');
  const dias = new Set(ledger.filter((e) => e && e.job_id && Number.isFinite(Date.parse(e.ts || 0)))
    .map((e) => new Date(e.ts).toISOString().slice(0, 10)));
  const ttft = temposPrimeiroToken(ledger);
  const recuperacoes = temposRecuperacao(ledger);
  const keep = keepRate(records, o);
  const custos = entregues.map((r) => numero(r.cost_usd)).filter((v) => v != null);
  const locais = concluidos.filter((r) => r.agent === 'moo').length;
  const pressao = quotaState && quotaState.pressao ? numero(quotaState.pressao.valor) : null;
  const wip = records.filter((r) => !r.status).length;

  const metricas = {
    entregas_por_dia: metrica(
      'entregas_por_dia', entregues.length && dias.size ? arredondar(entregues.length / dias.size, 3) : null,
      'tarefas/dia UTC', 'seamless.ledgerRead · done / dias UTC representados no ledger', medidoEm, faixas,
      entregues.length ? entregues.length + ' entregas em ' + dias.size + ' dia(s) UTC representado(s)'
        : 'o ledger não tem tarefas entregues',
    ),
    lead_time_primeiro_token_s: metrica(
      'lead_time_primeiro_token_s', arredondar(mediana(ttft), 3), 's (mediana)',
      'seamless.ledgerRead · dispatched → first_token/ttft_ms', medidoEm, faixas,
      ttft.length ? ttft.length + ' job(s) com primeiro token explicitamente medido'
        : 'o ledger não regista first_token, first_token_at ou ttft_ms; done não é usado como palpite',
    ),
    taxa_falha_pct: metrica(
      'taxa_falha_pct', concluidos.length
        ? arredondar(concluidos.filter((r) => r.status === 'failed').length / concluidos.length * 100, 2) : null,
      '% de jobs concluídos', 'aprender._jobRecords · failed / concluídos', medidoEm, faixas,
      concluidos.length ? concluidos.filter((r) => r.status === 'failed').length + '/' + concluidos.length + ' jobs concluídos falharam'
        : 'não há jobs concluídos',
    ),
    tempo_recuperacao_min: metrica(
      'tempo_recuperacao_min', arredondar(mediana(recuperacoes), 3), 'min (mediana)',
      'seamless.ledgerRead · failed → done seguinte na mesma wave', medidoEm, faixas,
      recuperacoes.length ? recuperacoes.length + ' falha(s) com recuperação posterior na mesma wave'
        : 'não há par failed → done posterior na mesma wave',
    ),
    keep_rate_pct: metrica(
      'keep_rate_pct', keep.valor, '% de ficheiros mantidos', 'aprender.measureKeepRate', medidoEm, faixas, keep.porque,
    ),
    custo_por_tarefa_entregue_usd: metrica(
      'custo_por_tarefa_entregue_usd', arredondar(mediana(custos), 4), 'USD/tarefa (mediana)',
      'aprender._jobRecords · cost_usd das tarefas done', medidoEm, faixas,
      custos.length ? custos.length + '/' + entregues.length + ' entregas com custo reportado pelo CLI'
        : 'nenhuma tarefa entregue tem cost_usd reportado pelo CLI',
    ),
    trabalho_zero_pct: metrica(
      'trabalho_zero_pct', concluidos.length ? arredondar(locais / concluidos.length * 100, 2) : null,
      '% de jobs concluídos', 'aprender._jobRecords · agent=moo / concluídos', medidoEm, faixas,
      concluidos.length ? locais + '/' + concluidos.length + ' jobs concluídos correram no moo local'
        : 'não há jobs concluídos',
    ),
    pressao_quota: metrica(
      'pressao_quota', pressao, 'rácio 0–1', 'quota.estado' + (o.async ? 'Async' : '') + '.pressao.valor', medidoEm, faixas,
      pressao == null ? ((quotaState && quotaState.pressao && quotaState.pressao.porque) || 'quota.js não devolveu pressão medida')
        : ((quotaState.pressao && quotaState.pressao.porque) || 'pressão devolvida por quota.js'),
    ),
    wip_actual: metrica(
      'wip_actual', records.length ? wip : null, 'jobs', 'aprender._jobRecords · jobs sem estado terminal', medidoEm, faixas,
      records.length ? wip + ' job(s) sem done/failed no ledger' : 'o ledger não tem jobs',
    ),
  };

  return {
    gerado_em: medidoEm,
    ledger_eventos: ledger.length,
    metricas,
    fontes: {
      ledger: { fonte: 'seamless.ledgerRead', eventos: ledger.length },
      quota: { fonte: 'quota.estado' + (o.async ? 'Async' : ''), medido: pressao != null },
      aprender: { fonte: 'aprender.js', jobs: records.length },
      gpu: gpuState == null
        ? { fonte: 'gpu.js.gpuSnapshot', disponivel: null, porque: 'snapshot da GPU n/d nesta chamada' }
        : { fonte: 'gpu.js.gpuSnapshot', disponivel: gpuState.available === false ? false : true,
          nome: gpuState.name || null, porque: gpuState.reason || null },
    },
  };
}

function duracao(desde, ate) {
  const inicio = Date.parse(desde || 0);
  const fim = Date.parse(ate || 0);
  const segundos = Number.isFinite(inicio) && Number.isFinite(fim) && fim >= inicio
    ? Math.floor((fim - inicio) / 1000) : null;
  return { desde: Number.isFinite(inicio) ? new Date(inicio).toISOString() : null, segundos };
}

function excepcoes(card, opts) {
  const metricas = card && card.metricas && typeof card.metricas === 'object' ? card.metricas : {};
  const donos = Object.assign({}, DONOS, (opts && opts.donos) || {});
  const out = [];
  for (const [nome, item] of Object.entries(metricas)) {
    if (!item || item.estado !== 'fora') continue;
    const dono = donos[nome];
    if (!dono || !['MOO', 'MTO', 'MFO', 'MIO', 'MRO', 'MCC'].includes(dono)) {
      throw new Error('excepção sem dono válido: ' + nome);
    }
    out.push({
      metrica: nome,
      dono,
      ha_quanto_tempo: duracao(item.fora_desde || item.medido_em || card.gerado_em, card.gerado_em),
      o_que_muda_se_ninguem_agir: EFEITOS[nome] || 'n/d — falta declarar o efeito operacional desta métrica',
    });
  }
  return out;
}

function lerAnterior(opts) {
  if (opts && opts.previousScorecard) return opts.previousScorecard;
  if (opts && opts.persist === false) return null;
  try { return JSON.parse(fs.readFileSync(paths(opts).scorecard, 'utf8')); }
  catch { return null; }
}

function finalizar(card, opts) {
  const anterior = lerAnterior(opts);
  for (const [nome, item] of Object.entries(card.metricas)) {
    if (item.estado !== 'fora') continue;
    const antigo = anterior && anterior.metricas && anterior.metricas[nome];
    item.fora_desde = antigo && antigo.estado === 'fora'
      ? (antigo.fora_desde || antigo.medido_em || anterior.gerado_em)
      : card.gerado_em;
  }
  card.excepcoes = excepcoes(card, opts);
  const nd = Object.values(card.metricas).filter((m) => m.estado === 'n/d').length;
  card.pode_ir_dormir = card.excepcoes.length
    ? { valor: false, porque: card.excepcoes.length + ' métrica(s) fora da faixa' }
    : (nd ? { valor: null, porque: nd + ' métrica(s) n/d; não há prova suficiente para dizer sim' }
      : { valor: true, porque: 'todas as métricas medidas estão dentro da faixa' });
  return card;
}

function persistir(card, opts) {
  const p = paths(opts);
  fs.mkdirSync(p.board, { recursive: true });
  const dia = card.gerado_em.slice(0, 10);
  const texto = JSON.stringify(card, null, 2);
  fs.writeFileSync(p.scorecard, texto);
  fs.writeFileSync(path.join(p.board, dia + '.json'), texto);
  return { scorecard: p.scorecard, historico: path.join(p.board, dia + '.json') };
}

async function persistirAsync(card, opts) {
  const p = paths(opts);
  await fs.promises.mkdir(p.board, { recursive: true });
  const dia = card.gerado_em.slice(0, 10);
  const texto = JSON.stringify(card, null, 2);
  await Promise.all([
    fs.promises.writeFile(p.scorecard, texto),
    fs.promises.writeFile(path.join(p.board, dia + '.json'), texto),
  ]);
  return { scorecard: p.scorecard, historico: path.join(p.board, dia + '.json') };
}

function scorecard(opts) {
  const o = opts || {};
  const ledger = lerLedger(o);
  const qmod = o.quotaModule || quota;
  const quotaState = Object.prototype.hasOwnProperty.call(o, 'quotaState') ? o.quotaState
    : (o.quotaEstado || qmod.estado)(o.quotaOpts || {});
  const gpuState = Object.prototype.hasOwnProperty.call(o, 'gpuState') ? o.gpuState : null;
  const card = finalizar(construir(ledger, quotaState, gpuState, o), o);
  if (o.persist !== false) card.persistencia = persistir(card, o);
  return card;
}

function ceder() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function scorecardAsync(opts) {
  const o = opts || {};
  const qmod = o.quotaModule || quota;
  const gmod = o.gpuModule || gpu;
  // Primeiro deixa correr callbacks de lifecycle já pendentes. Só depois
  // começam a enumeração de sessões da quota e a sonda da GPU.
  await ceder();
  const quotaPromise = Object.prototype.hasOwnProperty.call(o, 'quotaState')
    ? Promise.resolve(o.quotaState)
    : Promise.resolve().then(() => (o.quotaEstadoAsync || qmod.estadoAsync)(o.quotaOpts || {})).catch(() => null);
  const gpuPromise = Object.prototype.hasOwnProperty.call(o, 'gpuState')
    ? Promise.resolve(o.gpuState)
    : Promise.resolve().then(() => (o.gpuSnapshot || gmod.gpuSnapshot)(null)).catch(() => null);
  await ceder();
  const ledger = lerLedger(o);
  await ceder();
  const [quotaState, gpuState] = await Promise.all([quotaPromise, gpuPromise]);
  await ceder();
  const card = finalizar(construir(ledger, quotaState, gpuState, { ...o, async: true }), o);
  if (o.persist !== false) {
    await ceder();
    card.persistencia = await persistirAsync(card, o);
  }
  return card;
}

module.exports = {
  scorecard, scorecardAsync, excepcoes, persistir, persistirAsync, lerFaixas,
  DEFAULT_FAIXAS, DONOS, RESOURCE, RESOURCE_URI,
  _construir: construir, _temposPrimeiroToken: temposPrimeiroToken,
  _temposRecuperacao: temposRecuperacao, _paths: paths,
};
