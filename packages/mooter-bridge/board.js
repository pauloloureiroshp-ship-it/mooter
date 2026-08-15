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
const { fatiaLocal } = require('./fatia-local.js');
const { actorDoEvento, porqueDoEvento } = require('./actor.js');

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
  taxa_interrupcao_pct: Object.freeze([0, 100]),
  interrupcoes_por_dia: Object.freeze([0, 1]),
  divergencias_por_dia: Object.freeze([0, 10]),
  tempo_recuperacao_min: Object.freeze([0, 60]),
  keep_rate_pct: Object.freeze([50, 100]),
  custo_por_tarefa_entregue_usd: Object.freeze([0, 1]),
  custo_total_usd: null,
  cobertura_custo_pct: null,
  trabalho_zero_pct: Object.freeze([50, 100]),
  pressao_quota: Object.freeze([0, 0.85]),
  wip_actual: Object.freeze([0, 3]),
});

const DONOS = Object.freeze({
  entregas_por_dia: 'MOO',
  lead_time_primeiro_token_s: 'MOO',
  taxa_falha_pct: 'MTO',
  taxa_interrupcao_pct: 'MEO',
  interrupcoes_por_dia: 'MEO',
  divergencias_por_dia: 'MTO',
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
  taxa_interrupcao_pct: 'mais trabalho é interrompido antes de chegar a um desfecho útil',
  interrupcoes_por_dia: 'o MEO continua a ser chamado acima do limiar diário acordado',
  divergencias_por_dia: 'mais divergências verificáveis ficam abertas para o MTO investigar',
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
    if (padrao == null) {
      out[nome] = {
        faixa: null,
        origem: nome === 'custo_total_usd'
          ? 'n/d — total acumulado; não tem faixa'
          : 'n/d — cobertura informativa; sem limiar declarado',
      };
      continue;
    }
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
  const faixa = config && Array.isArray(config.faixa) ? config.faixa : null;
  const estado = n == null ? 'n/d'
    : (!faixa ? 'n/d' : (n >= faixa[0] && n <= faixa[1] ? 'dentro' : 'fora'));
  return {
    valor: n,
    unidade,
    fonte,
    medido_em: medidoEm,
    faixa: faixa ? [...faixa] : null,
    faixa_origem: config ? config.origem : 'n/d — faixa não declarada',
    estado,
    porque: n == null ? porque
      : (!faixa ? porque + '; faixa n/d — não existe limiar declarado'
        : (porque + '; valor ' + n + (estado === 'dentro' ? ' dentro de ' : ' fora de ')
          + '[' + faixa.join(', ') + ']')),
  };
}

function lerLedger(opts) {
  const o = opts || {};
  if (Array.isArray(o.ledger)) return o.ledger.map(aprender.comDesfecho);
  const read = typeof o.ledgerRead === 'function' ? o.ledgerRead : seamless.ledgerRead;
  try {
    const r = read();
    return Array.isArray(r) ? r.map(aprender.comDesfecho) : [];
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
      if (aprender.classificarDesfecho(ev) !== 'falhou') continue;
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
  const escritos = records.filter((r) => r.status === 'done' && r.escrita === true);
  const jobs = escritos.filter((r) => {
    const criada = r.worktree_criada && typeof r.worktree_criada.path === 'string'
      ? r.worktree_criada.path.trim() : '';
    if (!criada || !String(r.worktree || '').trim() || r.git_base_clean !== true) return false;
    return path.resolve(criada) === path.resolve(r.worktree);
  }).slice(-20);
  if (!jobs.length) return { valor: null, porque: escritos.length
    ? 'nenhum job de escrita entregue correu numa worktree criada de fresco com base limpa provada'
    : 'não há jobs de escrita entregues para medir' };
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

function motivosNaoLocal(ledger) {
  const contagem = new Map();
  for (const event of ledger) {
    if (!event || event.event !== 'dispatched' || event.preparation === true) continue;
    const decisao = event.local_decisao;
    if (!decisao || decisao.local !== false || !String(decisao.porque || '').trim()) continue;
    const porque = String(decisao.porque).trim();
    const motivo = decisao.motivo_nao_local ? String(decisao.motivo_nao_local) : null;
    const chave = JSON.stringify([motivo, porque]);
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return [...contagem.entries()].map(([chave, n]) => {
    const [motivo, porque] = JSON.parse(chave);
    return motivo ? { motivo, porque, n } : { porque, n };
  }).sort((a, b) => b.n - a.n || a.porque.localeCompare(b.porque));
}

function eventosNoDia(ledger, medidoEm) {
  const dia = String(medidoEm || '').slice(0, 10);
  const noDia = ledger.filter((event) => event && String(event.ts || '').slice(0, 10) === dia);
  return { dia, eventos: noDia };
}

function porqueInterrupcoes(valor, dia, divergenciasExcluidas) {
  return valor + ' chamada(s) ao MEO registada(s) em ' + dia + ' UTC; exclui '
    + divergenciasExcluidas + ' evento(s) motivo=divergencia porque o cross-check não interrompe o humano';
}

function interrupcoesNoDia(ledger, medidoEm) {
  const { dia, eventos } = eventosNoDia(ledger, medidoEm);
  if (!eventos.length) {
    return { valor: null, divergenciasExcluidas: 0,
      porque: 'o ledger não tem cobertura no dia UTC medido; divergências excluídas: n/d' };
  }
  const interrupcoes = eventos.filter((event) => event.event === 'meo_interrupcao');
  const divergenciasExcluidas = interrupcoes.filter((event) => event.motivo === 'divergencia').length;
  const valor = interrupcoes.length - divergenciasExcluidas;
  return { valor, divergenciasExcluidas, porque: porqueInterrupcoes(valor, dia, divergenciasExcluidas) };
}

function divergenciasNoDia(ledger, medidoEm) {
  const { dia, eventos } = eventosNoDia(ledger, medidoEm);
  if (!eventos.length) {
    return { valor: null,
      porque: 'jobs com divergências: n/d; soma de divergencias_count: n/d — o ledger não tem cobertura no dia UTC medido' };
  }
  const crossChecks = eventos.filter((event) => {
    const count = numero(event && event.divergencias_count);
    return event && event.event === 'cross_check' && count != null && count > 0;
  });
  if (crossChecks.length) {
    const jobsComId = new Set(crossChecks.map((event) => event.job_id).filter(Boolean));
    const jobs = jobsComId.size || crossChecks.length;
    const soma = crossChecks.reduce((total, event) => total + numero(event.divergencias_count), 0);
    return { valor: jobs, porque: jobs + ' job(s) com divergências em ' + dia
      + ' UTC; soma de divergencias_count: ' + soma };
  }
  const sinais = eventos.filter((event) => event.event === 'meo_interrupcao' && event.motivo === 'divergencia');
  return { valor: sinais.length, porque: sinais.length + ' job(s) sinalizado(s) por motivo=divergencia em ' + dia
    + ' UTC; soma de divergencias_count: n/d — não há eventos cross_check medidos no dia' };
}

function jaTemInterrupcaoHojeParaMetrica(ledger, metrica, medidoEm) {
  const dia = String(medidoEm || '').slice(0, 10);
  const noDia = ledger.filter((event) => event && String(event.ts || '').slice(0, 10) === dia);
  return noDia.some((event) => event.event === 'meo_interrupcao' && event.metrica === metrica);
}

/**
 * A profundidade REAL de história do ficheiro. Existe porque em 2026-08-05 o
 * ledger foi apagado duas vezes e todas as médias "por dia" continuaram a ser
 * publicadas sobre uma janela de minutos sem o dizer. `dias_representados` é
 * um número, nunca texto — o consumidor decide como o mostrar, não interpreta.
 */
function ledgerJanela(ledger) {
  const eventos = Array.isArray(ledger) ? ledger.length : 0;
  let primeiro = null;
  let ultimo = null;
  const diasUtc = new Set();
  for (const event of (Array.isArray(ledger) ? ledger : [])) {
    const t = Date.parse((event && event.ts) || '');
    if (!Number.isFinite(t)) continue;
    if (primeiro == null || t < primeiro) primeiro = t;
    if (ultimo == null || t > ultimo) ultimo = t;
    diasUtc.add(new Date(t).toISOString().slice(0, 10));
  }
  if (primeiro == null) {
    return {
      primeiro_ts: null, ultimo_ts: null, dias_representados: 0, eventos,
      porque: eventos ? 'nenhum evento do ledger tem ts válido — janela indeterminável'
        : 'o ledger não tem eventos — janela vazia',
    };
  }
  return {
    primeiro_ts: new Date(primeiro).toISOString(),
    ultimo_ts: new Date(ultimo).toISOString(),
    dias_representados: diasUtc.size,
    eventos,
    porque: 'janela real do ficheiro: ' + diasUtc.size + ' dia(s) UTC com eventos entre o primeiro e o último ts',
  };
}

function construir(ledger, quotaState, gpuState, opts) {
  const o = opts || {};
  const medidoEm = agoraIso(o);
  const faixas = lerFaixas(o);
  const records = registos(ledger, o);
  const concluidos = records.filter((r) => r.status && !r.preparation);
  const entregues = concluidos.filter((r) => r.status === 'done');
  const desfechos = concluidos.filter((r) => r.desfecho);
  const baseFalha = desfechos.filter((r) => r.desfecho === 'entregue' || r.desfecho === 'falhou');
  const falharam = baseFalha.filter((r) => r.desfecho === 'falhou');
  const baseInterrupcao = desfechos.filter((r) => r.desfecho !== 'indeterminado');
  const interrompidos = baseInterrupcao.filter((r) => r.desfecho === 'interrompido');
  const dias = new Set(ledger.filter((e) => e && e.job_id && Number.isFinite(Date.parse(e.ts || 0)))
    .map((e) => new Date(e.ts).toISOString().slice(0, 10)));
  const ttft = temposPrimeiroToken(ledger);
  const recuperacoes = temposRecuperacao(ledger);
  const keep = keepRate(records, o);
  const chamadasMeo = interrupcoesNoDia(ledger, medidoEm);
  const divergencias = divergenciasNoDia(ledger, medidoEm);
  const custos = entregues.map((r) => numero(r.cost_usd)).filter((v) => v != null);
  const costsMeasured = custos.length;
  const costsMissing = entregues.length - costsMeasured;
  const totalCost = costsMeasured
    ? arredondar(custos.reduce((sum, cost) => sum + cost, 0), 6) : null;
  const costCoverage = entregues.length
    ? arredondar(costsMeasured / entregues.length * 100, 2) : null;
  const totalCostReason = !entregues.length
    ? 'não há tarefas entregues para somar'
    : (!costsMeasured
      ? 'nenhuma das ' + entregues.length + ' entregas tem cost_usd reportado pelo CLI'
      : (costsMissing
        ? 'soma parcial: ' + costsMeasured + ' entrega(s) medida(s) e ' + costsMissing + ' sem medição de custo'
        : 'soma real das ' + costsMeasured + ' entrega(s) com custo reportado pelo CLI'));
  const pressao = quotaState && quotaState.pressao ? numero(quotaState.pressao.valor) : null;
  const wip = records.filter((r) => !r.status).length;
  const janela = ledgerJanela(ledger);

  const metricas = {
    entregas_por_dia: Object.assign(metrica(
      'entregas_por_dia', entregues.length && dias.size ? arredondar(entregues.length / dias.size, 3) : null,
      'tarefas/dia UTC', 'seamless.ledgerRead · done / dias UTC representados no ledger', medidoEm, faixas,
      entregues.length ? entregues.length + ' entregas em ' + dias.size + ' dia(s) UTC representado(s)'
        : 'o ledger não tem tarefas entregues',
    ), { dias_representados: janela.dias_representados }),
    lead_time_primeiro_token_s: metrica(
      'lead_time_primeiro_token_s', arredondar(mediana(ttft), 3), 's (mediana)',
      'seamless.ledgerRead · dispatched → first_token/ttft_ms', medidoEm, faixas,
      ttft.length ? ttft.length + ' job(s) com primeiro token explicitamente medido'
        : 'o ledger não regista first_token, first_token_at ou ttft_ms; done não é usado como palpite',
    ),
    taxa_falha_pct: Object.assign(metrica(
      'taxa_falha_pct', baseFalha.length ? arredondar(falharam.length / baseFalha.length * 100, 2) : null,
      '% de jobs com sucesso/falha', 'aprender._jobRecords · falhou / (entregue + falhou)', medidoEm, faixas,
      baseFalha.length ? falharam.length + '/' + baseFalha.length + ' desfechos elegíveis foram falha de trabalho'
        : 'não há desfechos entregue/falhou comparáveis',
    ), { dias_representados: janela.dias_representados }),
    taxa_interrupcao_pct: metrica(
      'taxa_interrupcao_pct', baseInterrupcao.length
        ? arredondar(interrompidos.length / baseInterrupcao.length * 100, 2) : null,
      '% de jobs terminais classificados', 'aprender._jobRecords · interrompido / desfechos conhecidos', medidoEm, faixas,
      baseInterrupcao.length ? interrompidos.length + '/' + baseInterrupcao.length + ' desfechos conhecidos foram interrompidos'
        : 'não há desfechos terminais classificados',
    ),
    interrupcoes_por_dia: metrica(
      'interrupcoes_por_dia', chamadasMeo.valor, 'chamadas/dia UTC',
      'seamless.ledgerRead · event=meo_interrupcao · motivo!=divergencia', medidoEm, faixas, chamadasMeo.porque,
    ),
    divergencias_por_dia: metrica(
      'divergencias_por_dia', divergencias.valor, 'jobs/dia UTC',
      'seamless.ledgerRead · event=cross_check · jobs com divergencias_count>0', medidoEm, faixas, divergencias.porque,
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
    custo_por_tarefa_entregue_usd: Object.assign(metrica(
      'custo_por_tarefa_entregue_usd', arredondar(mediana(custos), 4), 'USD/tarefa (mediana)',
      'aprender._jobRecords · cost_usd das tarefas done', medidoEm, faixas,
      custos.length ? custos.length + '/' + entregues.length + ' entregas com custo reportado pelo CLI'
        : 'nenhuma tarefa entregue tem cost_usd reportado pelo CLI',
    ), { dias_representados: janela.dias_representados }),
    custo_total_usd: Object.assign(metrica(
      'custo_total_usd', totalCost, 'USD (soma)',
      'aprender._jobRecords · soma de cost_usd das tarefas done', medidoEm, faixas,
      totalCostReason,
    ), { jobs_medidos: costsMeasured, jobs_sem_medicao: costsMissing }),
    cobertura_custo_pct: Object.assign(metrica(
      'cobertura_custo_pct', costCoverage, '% de entregas',
      'aprender._jobRecords · entregas com cost_usd / tarefas done', medidoEm, faixas,
      entregues.length
        ? costsMeasured + '/' + entregues.length + ' entregas têm custo reportado pelo CLI'
        : 'não há tarefas entregues para calcular cobertura',
    ), { jobs_medidos: costsMeasured, jobs_sem_medicao: costsMissing }),
    trabalho_zero_pct: (() => {
      const fatia = fatiaLocal(records, { escopo: 'global — todos os cargos' });
      return Object.assign(metrica(
        'trabalho_zero_pct', fatia.valor,
        '% de jobs concluídos', 'fatiaLocal(aprender._jobRecords)', medidoEm, faixas,
        fatia.porque,
      ), { dias_representados: janela.dias_representados });
    })(),
    pressao_quota: (() => {
      const m = metrica(
        'pressao_quota', pressao, 'rácio 0–1', 'quota.estado' + (o.async ? 'Async' : '') + '.pressao.valor', medidoEm, faixas,
        pressao == null ? ((quotaState && quotaState.pressao && quotaState.pressao.porque) || 'quota.js não devolveu pressão medida')
          : ((quotaState.pressao && quotaState.pressao.porque) || 'pressão devolvida por quota.js'),
      );
      if (quotaState && quotaState.pressao && quotaState.pressao.calibrando === true) {
        const dias = quotaState.pressao.dias_historico || 0;
        const peso = (quotaState.pressao.referencia && quotaState.pressao.referencia.peso_semana) || 4000;
        m.estado = 'n/d';
        m.porque = 'a calibrar — só ' + dias + '/7 dia(s) de histórico; referência ' + peso
          + ' ainda não medida, ver quota.js — estado pendente até ter 7 dias de histórico';
      }
      return m;
    })(),
    wip_actual: metrica(
      'wip_actual', records.length ? wip : null, 'jobs', 'aprender._jobRecords · jobs sem estado terminal', medidoEm, faixas,
      records.length ? wip + ' job(s) sem done/failed no ledger' : 'o ledger não tem jobs',
    ),
  };

  return {
    gerado_em: medidoEm,
    ledger_eventos: ledger.length,
    ledger_janela: janela,
    jobs: records.map((record) => {
      const actor = actorDoEvento(record);
      return {
        job_id: record.job_id,
        actor,
        // O porque só faz sentido ao lado de um ator REAL. Hoje isto já sai
        // certo, mas por acaso: o input vem do aprender.js, que filtra a montante.
        // Sem esta guarda, a coerência do board depende de um guard noutro
        // ficheiro — e um evento legacy com um actor_porque perdido passaria a
        // mostrar "declarado por quem disparou" ao lado de um ator `legacy`.
        actor_porque: porqueDoEvento(record),
      };
    }),
    motivos_nao_local: motivosNaoLocal(ledger),
    metricas,
    fontes: {
      ledger: { fonte: 'seamless.ledgerRead', eventos: ledger.length, dias_representados: janela.dias_representados },
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

function registarInterrupcao(input, opts) {
  const item = input || {};
  const motivos = new Set(['irreversivel', 'divergencia', 'limiar']);
  if (!motivos.has(item.motivo)) throw new Error('motivo de interrupção inválido: ' + String(item.motivo || 'n/d'));
  if (!String(item.o_que || '').trim()) throw new Error('o_que é obrigatório na interrupção ao MEO');
  if (!String(item.quem_pediu || '').trim()) throw new Error('quem_pediu é obrigatório na interrupção ao MEO');
  const event = {
    ts: agoraIso(opts), event: 'meo_interrupcao', motivo: item.motivo,
    o_que: String(item.o_que).trim(), quem_pediu: String(item.quem_pediu).trim(),
  };
  if (item.metrica) {
    event.metrica = String(item.metrica).trim();
  }
  const append = opts && typeof opts.ledgerAppend === 'function' ? opts.ledgerAppend : seamless.ledgerAppend;
  append(event);
  return event;
}

function excepcoes(card, opts) {
  const metricas = card && card.metricas && typeof card.metricas === 'object' ? card.metricas : {};
  const donos = Object.assign({}, DONOS, (opts && opts.donos) || {});
  const out = [];
  for (const [nome, item] of Object.entries(metricas)) {
    if (!item || item.estado !== 'fora') continue;
    const dono = donos[nome];
    if (!dono || !['MEO', 'MOO', 'MTO', 'MFO', 'MIO', 'MRO', 'MCC'].includes(dono)) {
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

function finalizar(card, ledger, opts) {
  const anterior = lerAnterior(opts);
  for (const [nome, item] of Object.entries(card.metricas)) {
    if (item.estado !== 'fora') continue;
    const antigo = anterior && anterior.metricas && anterior.metricas[nome];
    item.fora_desde = antigo && antigo.estado === 'fora'
      ? (antigo.fora_desde || antigo.medido_em || anterior.gerado_em)
      : card.gerado_em;
  }
  card.excepcoes = excepcoes(card, opts);
  const ledgerReal = !(opts && (Array.isArray(opts.ledger) || typeof opts.ledgerRead === 'function'));
  let interrupcoesRegistadas = 0;
  if (ledgerReal && (!opts || opts.persist !== false)) {
    for (const excecao of card.excepcoes) {
      if (excecao.metrica === 'interrupcoes_por_dia') continue;
      const antiga = anterior && anterior.metricas && anterior.metricas[excecao.metrica];
      if (antiga && antiga.estado === 'fora') continue;
      if (jaTemInterrupcaoHojeParaMetrica(ledger || [], excecao.metrica, card.gerado_em)) continue;
      const item = card.metricas[excecao.metrica];
      try {
        registarInterrupcao({
          motivo: 'limiar', quem_pediu: excecao.dono, metrica: excecao.metrica,
          o_que: 'métrica ' + excecao.metrica + ' fora da faixa [' + item.faixa.join(', ') + ']: ' + item.valor,
        }, opts);
        interrupcoesRegistadas++;
      } catch { /* o scorecard continua; a ausência do evento fica visível no contador */ }
    }
  }
  if (interrupcoesRegistadas) {
    const item = card.metricas.interrupcoes_por_dia;
    const anteriorValor = numero(item.valor);
    item.valor = (anteriorValor == null ? 0 : anteriorValor) + interrupcoesRegistadas;
    item.estado = item.valor >= item.faixa[0] && item.valor <= item.faixa[1] ? 'dentro' : 'fora';
    const contagem = interrupcoesNoDia(ledger || [], card.gerado_em);
    item.porque = porqueInterrupcoes(item.valor, String(card.gerado_em).slice(0, 10), contagem.divergenciasExcluidas)
      + '; valor ' + item.valor
      + (item.estado === 'dentro' ? ' dentro de ' : ' fora de ') + '[' + item.faixa.join(', ') + ']';
    if (item.estado === 'fora') item.fora_desde = item.fora_desde || card.gerado_em;
    card.ledger_eventos += interrupcoesRegistadas;
    if (card.fontes && card.fontes.ledger) card.fontes.ledger.eventos = card.ledger_eventos;
    card.excepcoes = excepcoes(card, opts);
  }
  const nd = Object.values(card.metricas).filter((m) => numero(m.valor) == null).length;
  const podeIrDormir = card.excepcoes.length
    ? { valor: false, porque: card.excepcoes.length + ' métrica(s) fora da faixa' }
    : (nd ? { valor: null, porque: nd + ' métrica(s) n/d; não há prova suficiente para dizer sim' }
      : { valor: true, porque: 'todas as métricas medidas estão dentro da faixa' });
  return Object.assign({ pode_ir_dormir: podeIrDormir }, card);
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
  const card = finalizar(construir(ledger, quotaState, gpuState, o), ledger, o);
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
  const card = finalizar(construir(ledger, quotaState, gpuState, { ...o, async: true }), ledger, o);
  if (o.persist !== false) {
    await ceder();
    card.persistencia = await persistirAsync(card, o);
  }
  return card;
}

module.exports = {
  scorecard, scorecardAsync, excepcoes, registarInterrupcao, persistir, persistirAsync, lerFaixas,
  ledgerJanela,
  DEFAULT_FAIXAS, DONOS, RESOURCE, RESOURCE_URI,
  _construir: construir, _temposPrimeiroToken: temposPrimeiroToken,
  _temposRecuperacao: temposRecuperacao, _motivosNaoLocal: motivosNaoLocal, _paths: paths,
};
