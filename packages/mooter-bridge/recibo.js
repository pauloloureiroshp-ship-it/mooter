'use strict';

const { PassThrough } = require('stream');
const fleet = require('./fleet.js');
const { fatiaLocal } = require('./fatia-local.js');
const { isTerminal } = require('./terminal.js');
const { ACTOR_LEGACY, actorDoEvento, porqueDoEvento } = require('./actor.js');

const VALID_CARGOS = Object.freeze(['MOO', 'MTO', 'MFO', 'MIO', 'MRO', 'MCC', 'MEO']);
const PERIODOS = Object.freeze(['sessao', 'dia', 'semana']);
const VERDICT_QUESTION = 'Que cargos é que o MEO pode ignorar hoje, e porquê?';

function iso(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function buildWindow(opts) {
  const options = opts || {};
  const periodo = options.periodo || 'dia';
  if (!PERIODOS.includes(periodo)) {
    throw new Error('período desconhecido; válidos: ' + PERIODOS.join(', '));
  }
  const ate = iso(options.agora || new Date());
  if (!ate) throw new Error('agora inválido; usa um instante ISO verificável');
  const end = Date.parse(ate);
  let start;
  let porque;
  if (periodo === 'sessao') {
    start = Date.parse(options.desde || '');
    if (!Number.isFinite(start)) {
      throw new Error('desde é obrigatório para o âmbito sessao e tem de ser um instante ISO válido');
    }
    porque = 'desde o instante de início da sessão declarado pelo chamador';
  } else {
    const days = periodo === 'dia' ? 1 : 7;
    start = end - days * 24 * 60 * 60 * 1000;
    porque = periodo === 'dia' ? 'janela móvel de 24 horas' : 'janela móvel de 7 dias';
  }
  if (start > end) throw new Error('desde não pode ser posterior a agora');
  return { periodo, desde: new Date(start).toISOString(), ate, porque };
}

function firstEventTimes(events) {
  const times = new Map();
  for (const event of events) {
    if (!event || !event.job_id) continue;
    const time = Date.parse(event.ts || '');
    if (!Number.isFinite(time)) continue;
    const previous = times.get(event.job_id);
    if (previous == null || time < previous) times.set(event.job_id, time);
  }
  return times;
}

function jobTime(job, firstTimes) {
  for (const value of [job.dispatched_at, job.started_at, job.ended_at]) {
    const time = Date.parse(value || '');
    if (Number.isFinite(time)) return time;
  }
  return firstTimes.get(job.job_id) ?? null;
}

function projectActor(job) {
  const actor = actorDoEvento(job);
  const legacy = actor.type === ACTOR_LEGACY.type
    && actor.id === ACTOR_LEGACY.id
    && actor.origem === ACTOR_LEGACY.origem;
  return {
    job_id: job.job_id,
    actor,
    actor_porque: porqueDoEvento(job),
  };
}

function cargoOf(job) {
  if (job && Object.prototype.hasOwnProperty.call(job, 'cargo') && VALID_CARGOS.includes(job.cargo)) {
    return { cargo: job.cargo, porque: job.cargo_porque || 'declarado por quem disparou' };
  }
  return {
    cargo: null,
    porque: (job && job.cargo_porque) || 'n/d — anterior à instrumentação de cargos',
  };
}

function metric(value, porque, extra) {
  return Object.assign({ valor: value, porque }, extra || {});
}

function costMetric(jobs) {
  if (!jobs.length) {
    return metric(0, 'nenhum job deste cargo na janela; soma vazia medida como zero', {
      unidade: 'USD', parcial: false, jobs_medidos: 0, jobs_sem_medicao: 0,
    });
  }
  const measured = jobs.filter((job) => Number.isFinite(Number(job.cost_usd)));
  const missing = jobs.length - measured.length;
  if (!measured.length) {
    return metric(null, 'n/d — nenhum dos ' + jobs.length + ' job(s) trouxe cost_usd medido', {
      unidade: 'USD', parcial: true, jobs_medidos: 0, jobs_sem_medicao: missing,
    });
  }
  const value = Number(measured.reduce((sum, job) => sum + Number(job.cost_usd), 0).toFixed(6));
  return metric(value, missing
    ? 'total parcial: ' + missing + ' de ' + jobs.length + ' job(s) sem cost_usd medido'
    : 'soma de cost_usd dos ' + measured.length + ' job(s) medidos', {
    unidade: 'USD', parcial: missing > 0,
    jobs_medidos: measured.length, jobs_sem_medicao: missing,
  });
}

function tokenMetric(jobs, field, label) {
  if (!jobs.length) return metric(0, 'nenhum job local deste cargo na janela');
  const measured = jobs.filter((job) => Number.isFinite(Number(job[field])));
  if (!measured.length) {
    return metric(null, 'n/d — nenhum job local trouxe ' + label + ' medidos', {
      jobs_medidos: 0, jobs_sem_medicao: jobs.length,
    });
  }
  const missing = jobs.length - measured.length;
  return metric(measured.reduce((sum, job) => sum + Number(job[field]), 0), missing
    ? 'soma parcial; ' + missing + ' job(s) local(is) sem ' + label
    : 'soma dos ' + label + ' medidos nos jobs locais', {
    jobs_medidos: measured.length, jobs_sem_medicao: missing, parcial: missing > 0,
  });
}

function freeWorkMetric(jobs, cargo) {
  const cargoName = cargo || 'n/d';
  const fatia = fatiaLocal(jobs, { escopo: 'por cargo', cargo: cargoName });
  const localJobs = jobs.filter((job) => job.local === true || job.agent === 'moo');
  return {
    jobs: metric(fatia.jobs_total === 0 ? 0 : fatia.jobs_local, fatia.jobs_total === 0
      ? 'nenhum trabalho concluído deste cargo na janela'
      : 'jobs locais concluídos sobre o total de concluídos do cargo', { total: fatia.jobs_total }),
    percentagem: metric(fatia.valor, fatia.porque),
    tokens_locais: {
      entrada: tokenMetric(localJobs, 'tokens_in', 'tokens de entrada'),
      saida: tokenMetric(localJobs, 'tokens_out', 'tokens de saída'),
    },
  };
}

function buildHandoffs(scopedJobs, allJobs) {
  const byId = new Map(allJobs.map((job) => [job.job_id, job]));
  const out = [];
  for (const target of scopedJobs) {
    if (!target.handoff_from) continue;
    const source = byId.get(target.handoff_from) || null;
    out.push({
      from: target.handoff_from,
      to: target.job_id,
      seta: target.handoff_from + ' → ' + target.job_id,
      agente_from: source ? source.agent || null : null,
      agente_to: target.agent || null,
      /**
       * ⚠️ Auditoria E2E 2026-08-01 — este campo chamava-se `poupanca` e não era.
       *
       * O valor é `prep_chars/4`: o volume que o moo local PRODUZIU antes de
       * passar o trabalho ao motor pago. Nesta seta (`handoff_from → job`) o
       * motor pago corre a seguir e recebe esse texto no prompt — logo não há
       * poupança líquida a declarar, há trabalho local feito. O campo passa a
       * dizer o que mede, e a poupança líquida fica explicitamente n/d.
       */
      tokens_locais_produzidos: source && Number.isFinite(Number(source.tokens_poupados_estimados))
        ? metric(Number(source.tokens_poupados_estimados), source.tokens_poupados_estimados_nota
          || 'estimativa registada pelo handoff local')
        : metric(null, 'n/d — o handoff não trouxe medição do volume local'),
      poupanca_liquida: metric(null,
        'n/d — nesta seta o motor pago correu a seguir e recebeu o texto local no prompt; '
        + 'medir poupança exigiria o mesmo trabalho sem preparação como base de comparação'),
    });
  }
  return out;
}

function waveIndex(jobs) {
  const waves = new Map();
  for (const job of jobs) {
    if (!job.wave) continue;
    if (!waves.has(job.wave)) waves.set(job.wave, []);
    waves.get(job.wave).push(job);
  }
  return waves;
}

/**
 * ⚠️ DIETA (J-0d, 2026-07-31) — medido no conector v1.29.1: 7 dos 8 blocos de
 * cargo diziam «nenhum trabalho deste cargo na janela», cada um com ~1 KB de
 * zeros justificados e 4 níveis de aninhamento. ≈67% do recibo era preenchimento.
 *
 * A primeira tentativa foi SUPRIMIR os blocos vazios. Partiu 5 testes — e ainda
 * bem: o teste «S2 — cargo sem trabalho aparece com zero e porquê» defende uma
 * garantia conquistada na v1.22 (nenhum agregado nasce a zero sem explicação).
 * Suprimir teria trocado ruído por cegueira.
 *
 * A dieta certa é COMPRIMIR, não suprimir. O bloco continua a existir, continua
 * a dizer zero e a dizer porquê, e as excepções continuam lá — o que desaparece
 * é só a repetição de estruturas vazias que não descrevem nada.
 * `verbose: true` devolve o bloco por extenso.
 */
function buildEmptyCargoRecord(cargo, exceptions, boardAvailable) {
  const because = 'nenhum trabalho deste cargo na janela';
  const own = boardAvailable ? exceptions.filter((item) => item && item.dono === cargo) : null;
  /**
   * O `porque` do topo do bloco aplica-se a todos os zeros que se seguem —
   * repeti-lo em cada sub-campo custava ~460 B por cargo e não acrescentava
   * um único facto. `sem_trabalho: true` torna a herança explícita.
   * O `custo.porque` fica porque descreve algo diferente: a soma vazia.
   */
  const record = {
    cargo,
    sem_trabalho: true,
    porque: because,
    waves: { valor: 0 },
    entregas: { valor: 0 },
    custo: { valor: 0, porque: 'nenhum job deste cargo na janela; soma vazia medida como zero', unidade: 'USD' },
    trabalho_a_zero: { jobs: { valor: 0, total: 0 } },
    excepcoes: own,
  };
  if (!boardAvailable) {
    record.excepcoes_porque = 'n/d — o board não respondeu; não tratei ausência de medição como zero excepções';
  } else if (own && own.length) {
    record.excepcoes_porque = 'excepção aberta num cargo sem trabalho na janela — preservada porque um cargo parado pode estar fora da faixa';
  }
  return record;
}

function buildCargoRecord(cargo, jobs, allJobs, exceptions, boardAvailable, verbose) {
  if (cargo != null && !jobs.length && !verbose) {
    return buildEmptyCargoRecord(cargo, exceptions, boardAvailable);
  }
  const names = [...new Set(jobs.map((job) => job.wave).filter(Boolean))].sort();
  const jobsWithoutWave = jobs.filter((job) => !job.wave).length;
  const allWaves = waveIndex(allJobs);
  const delivered = names.filter((wave) => {
    const jobsInWave = allWaves.get(wave) || [];
    return jobsInWave.length > 0 && jobsInWave.every((job) => job.state === 'done');
  });
  const becauseNoWork = jobs.length ? null : 'nenhum trabalho deste cargo na janela';
  const handoffs = buildHandoffs(jobs, allJobs);
  const record = {
    cargo,
    porque: cargo == null
      ? ([...new Set(jobs.map((job) => cargoOf(job).porque))].join(' · ')
        || 'nenhum trabalho sem cargo na janela')
      : (becauseNoWork || 'cargo declarado nos jobs contados'),
    waves: metric(jobs.length && !names.length ? null : names.length, becauseNoWork
      || (jobsWithoutWave
        ? 'contagem parcial: ' + jobsWithoutWave + ' job(s) sem wave no ledger'
        : 'waves distintas com este cargo'), { lista: names, jobs_sem_wave: jobsWithoutWave }),
    entregas: metric(jobs.length && !names.length ? null : delivered.length, becauseNoWork
      || (jobsWithoutWave
        ? 'contagem parcial: ' + jobsWithoutWave + ' job(s) sem wave; entregas contam waves, não jobs'
        : 'waves cujos jobs terminaram todos em done; jobs não são contados como entregas'),
    { waves: delivered, jobs_sem_wave: jobsWithoutWave }),
    custo: costMetric(jobs),
    trabalho_a_zero: freeWorkMetric(jobs, cargo),
    passou_trabalho_a: handoffs,
    passou_trabalho_a_porque: handoffs.length ? 'derivado de handoff_from no ledger' : (becauseNoWork || 'nenhum handoff provado no ledger'),
    excepcoes: boardAvailable ? exceptions.filter((item) => item && item.dono === cargo) : null,
    excepcoes_porque: boardAvailable
      ? 'excepções do board cujo DONOS bate com este cargo'
      : 'n/d — o board não respondeu; não tratei ausência de medição como zero excepções',
  };
  return record;
}

function project(events, opts) {
  const ledger = Array.isArray(events) ? events.filter(Boolean) : [];
  const options = opts || {};
  const window = buildWindow(options);
  const firstTimes = firstEventTimes(ledger);
  const allJobs = fleet.foldJobs(ledger);
  const start = Date.parse(window.desde);
  const end = Date.parse(window.ate);
  let withoutTimestamp = 0;
  const scopedJobs = allJobs.filter((job) => {
    const time = jobTime(job, firstTimes);
    if (time == null) { withoutTimestamp++; return false; }
    return time >= start && time <= end;
  });
  const exceptions = Array.isArray(options.excepcoes) ? options.excepcoes : [];
  const boardAvailable = options.board_disponivel !== false;
  const verbose = options.verbose === true;
  const cargos = VALID_CARGOS.map((cargo) => buildCargoRecord(
    cargo,
    scopedJobs.filter((job) => cargoOf(job).cargo === cargo),
    allJobs, exceptions, boardAvailable, verbose
  ));
  const unassigned = scopedJobs.filter((job) => cargoOf(job).cargo == null);
  return {
    gerado_em: window.ate,
    janela: window,
    fonte: 'ledger append-only + board determinístico',
    jobs: scopedJobs.map(projectActor),
    cobertura: {
      jobs_na_janela: metric(scopedJobs.length, 'jobs com timestamp atribuível dentro da janela'),
      jobs_sem_timestamp: metric(withoutTimestamp, withoutTimestamp
        ? 'não foram atribuídos a uma janela porque o ledger não trouxe timestamp válido'
        : 'todos os jobs tinham timestamp atribuível'),
    },
    cargos,
    sem_cargo: buildCargoRecord(null, unassigned, allJobs, [], true, verbose),
    ...(verbose || !cargos.some((r) => r.sem_trabalho) ? {} : {
      cargos_sem_trabalho_nota: 'os cargos com sem_trabalho:true trazem o bloco compacto — o porquê do topo aplica-se a todos os zeros; pede verbose:true para os ver por extenso',
    }),
  };
}

function pulse(events, wave) {
  const ledger = (Array.isArray(events) ? events : []).filter((event) => event && event.wave === wave);
  const jobs = fleet.foldJobs(ledger);
  if (!wave || !jobs.length || !jobs.every(isTerminal)) return null;
  const cargos = [...new Set(jobs.map((job) => cargoOf(job).cargo).filter(Boolean))].sort();
  const agents = [...new Set(jobs.map((job) => job.agent).filter(Boolean))].sort();
  const starts = jobs.map((job) => Date.parse(job.dispatched_at || job.started_at || '')).filter(Number.isFinite);
  const ends = jobs.map((job) => Date.parse(job.ended_at || '')).filter(Number.isFinite);
  const duration = starts.length === jobs.length && ends.length === jobs.length
    ? Math.max(0, Math.round((Math.max(...ends) - Math.min(...starts)) / 1000))
    : null;
  const localJobs = jobs.filter((job) => job.local === true || job.agent === 'moo');
  const localOut = tokenMetric(localJobs, 'tokens_out', 'tokens de saída');
  const cost = costMetric(jobs);
  const cargo = cargos.length === 1 ? cargos[0] : null;
  const cargoPorque = cargos.length === 1
    ? 'cargo único declarado nos jobs da wave'
    : (cargos.length ? 'n/d — a wave contém cargos distintos: ' + cargos.join(', ')
      : ([...new Set(jobs.map((job) => cargoOf(job).porque))].join(' · ')
        || 'n/d — anterior à instrumentação de cargos'));
  const costText = cost.valor == null ? 'custo n/d' : ('$' + cost.valor + (cost.parcial ? ' parcial' : ''));
  const durationText = duration == null ? 'duração n/d' : duration + 's';
  const lines = [
    '🐮 ' + wave + ' fechou · cargo ' + (cargo || 'n/d') + ' · ' + (agents.join(', ') || 'agentes n/d'),
    durationText + ' · ' + costText + ' · moo a $0: ' + localJobs.length + '/' + jobs.length + ' job(s)',
  ];
  if (localOut.valor != null && localOut.valor > 0) lines.push(localOut.valor + ' tokens de saída locais medidos');
  return {
    wave, cargo, cargo_porque: cargoPorque, agentes: agents,
    jobs: jobs.map(projectActor),
    duracao_s: metric(duration, duration == null
      ? 'n/d — faltam timestamps válidos de início ou fim'
      : 'do primeiro dispatch ao último terminal da wave'),
    custo: cost,
    moo_a_zero: {
      jobs: metric(localJobs.length, 'jobs com local:true na wave', { total: jobs.length }),
      tokens_saida: localOut,
    },
    resumo: lines.join('\n'),
  };
}

function factsForVerdict(receipt) {
  return Object.fromEntries(receipt.cargos.map((entry) => [entry.cargo, {
    waves: entry.waves.valor,
    entregas: entry.entregas.valor,
    custo_usd: entry.custo.valor,
    custo_parcial: entry.custo.parcial,
    jobs_locais: entry.trabalho_a_zero.jobs.valor,
    jobs_total: entry.trabalho_a_zero.jobs.total,
    excepcoes: Array.isArray(entry.excepcoes) ? entry.excepcoes.length : null,
  }]));
}

async function askLocalVerdict(receipt, opts) {
  const options = opts || {};
  const moo = options.mooModule || require('./moo.js');
  const host = options.host || process.env.OLLAMA_HOST || '127.0.0.1:11434';
  const resident = options.resident !== undefined
    ? options.resident
    : await fleet.probeOllama(700).catch(() => null);
  const model = options.model || await moo.pickModel(null, host, resident, {
    goal: VERDICT_QUESTION,
  }).catch(() => null);
  if (!model) return null;
  const prompt = [
    'Os factos abaixo já foram calculados mecanicamente. Não alteres, completes nem inventes números.',
    JSON.stringify(factsForVerdict(receipt)),
    '',
    'Responde num único parágrafo, em PT-PT, apenas a esta pergunta:',
    VERDICT_QUESTION,
    'Se os factos não chegarem, escreve n/d e diz exactamente o que falta.',
  ].join('\n');
  const outStream = new PassThrough();
  const errStream = new PassThrough();
  let raw = '';
  outStream.on('data', (chunk) => { raw += chunk.toString('utf8'); });
  errStream.resume();
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    let child;
    try {
      child = moo.runLocal({ hostStr: host, model, prompt, outStream, errStream });
    } catch { finish(null); return; }
    child.once('close', (code) => {
      if (code !== 0) { finish(null); return; }
      let result = null;
      for (const line of raw.split('\n')) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event && event.type === 'result' && event.subtype === 'success' && event.result) {
          result = String(event.result).replace(/\s+/g, ' ').trim();
        }
      }
      finish(result || null);
    });
    child.once('error', () => finish(null));
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* */ }
      finish(null);
    }, Math.max(100, Number(options.timeout_ms) || 20_000));
    try { timer.unref(); } catch { /* */ }
  });
}

async function generate(opts) {
  const options = opts || {};
  const ledger = Array.isArray(options.ledger)
    ? options.ledger
    : (typeof options.ledgerRead === 'function' ? options.ledgerRead() : require('./seamless.js').ledgerRead());
  let scorecard = options.scorecard;
  let boardAvailable = !!scorecard;
  if (!scorecard) {
    try {
      const board = options.boardModule || require('./board.js');
      scorecard = await board.scorecardAsync(Object.assign({}, options.boardOptions, {
        ledger, persist: false,
      }));
      boardAvailable = true;
    } catch { scorecard = null; boardAvailable = false; }
  }
  const receipt = project(ledger, Object.assign({}, options, {
    excepcoes: scorecard && Array.isArray(scorecard.excepcoes) ? scorecard.excepcoes : [],
    board_disponivel: boardAvailable,
  }));
  /**
   * ⚠️ Duas garantias que estavam escritas mas não impostas — apanhadas por um
   * refutador em 2026-07-28, com o contra-exemplo já construído:
   *
   * 1. «o veredicto nunca altera um número». O `receipt` era passado POR
   *    REFERÊNCIA a uma função externa, e o `Object.assign` de saída é raso —
   *    bastava a função escrever `receipt.cargos[0].custo.valor = 999999` para
   *    o recibo sair corrompido, sem excepção e sem registo. A garantia vivia
   *    na boa-fé de quem escrevesse o `ask`. Agora a opinião recebe uma CÓPIA
   *    congelada: não há como estragar o que ela não consegue tocar.
   *
   * 2. «o moo em baixo nunca derruba o recibo». O `catch` só apanhava quem
   *    lança. Um `ask` que nunca resolve nem rejeita — um moo pendurado, não
   *    um moo em baixo — bloqueava o `generate()` para sempre. O timeout que
   *    existia vivia DENTRO do `askLocalVerdict`, e portanto desaparecia
   *    assim que alguém injectasse outra função. O tecto passa a ser deste
   *    lado, onde nenhuma injecção lhe escapa.
   */
  let verdict = null;
  try {
    const ask = typeof options.pedirVeredicto === 'function' ? options.pedirVeredicto : askLocalVerdict;
    const tectoMs = Number.isFinite(Number(options.veredictoTimeoutMs))
      ? Number(options.veredictoTimeoutMs) : 25_000;
    const copiaCongelada = congelar(JSON.parse(JSON.stringify(receipt)));
    /**
     * ⚠️ Sem `unref()`, e limpo à mão.
     *
     * A primeira versão usava `unref()` no timer, e o próprio teste do moo
     * pendurado apanhou o efeito: um timer sem referência não segura o event
     * loop, portanto se ele for a única coisa pendente o processo esvazia-se
     * e o timeout NUNCA dispara — a protecção desaparecia exactamente no
     * cenário para que foi feita. Agora o timer segura o loop até decidir, e
     * é cancelado assim que a corrida termina, seja quem for a ganhar.
     */
    let cronometro = null;
    try {
      verdict = await Promise.race([
        Promise.resolve(ask(copiaCongelada, options.veredictoOptions || {})),
        new Promise((resolve) => { cronometro = setTimeout(() => resolve(null), tectoMs); }),
      ]);
    } finally {
      if (cronometro) clearTimeout(cronometro);
    }
  } catch { verdict = null; }
  /**
   * ⚠️ J-6 (2026-07-31) — CONTEXTO E ADVOGADO DO DIABO.
   * O recibo dizia o que a frota fez, mas não dizia onde, para quê, o que
   * estava antes, o que ficou no vault, nem o que perguntar a seguir. Uma
   * sessão nova abria sem nada disto e pagava outra vez contexto já comprado.
   *
   * As perguntas são derivadas de REGRAS sobre números medidos — não de um
   * modelo. Custam $0, são reproduzíveis, e cada uma transporta o facto que a
   * fez nascer. Uma regra não consegue alucinar um problema inexistente.
   *
   * Nunca derruba o recibo: se este bloco falhar, o recibo factual sai na
   * mesma, com o motivo no lugar do contexto.
   */
  let contexto;
  try {
    const modulo = options.contextoModule || require('./recibo-contexto.js');
    contexto = modulo.montar(receipt, Object.assign({}, options, {
      jobs: fleet.foldJobs(ledger),
      scorecard,
    }));
  } catch (error) {
    contexto = {
      rotulo: 'contexto e advogado do diabo',
      valor: null,
      porque: 'não consegui montar o contexto: ' + ((error && error.message) || String(error))
        + ' — o recibo factual acima mantém-se completo',
    };
  }
  return Object.assign({}, receipt, {
    contexto,
    veredicto: {
      rotulo: 'interpretação do moo local — nunca altera os factos',
      pergunta: VERDICT_QUESTION,
      valor: verdict || null,
      texto: verdict || 'n/d — o moo não respondeu',
      porque: verdict ? 'opinião escrita sobre os números já calculados' : 'o moo não respondeu; o recibo factual mantém-se completo',
    },
  });
}

/** Congela em profundidade — um `Object.freeze` raso deixa os aninhados abertos. */
function congelar(valor) {
  if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const filho of Object.values(valor)) congelar(filho);
  }
  return valor;
}

module.exports = {
  VALID_CARGOS, PERIODOS, VERDICT_QUESTION, _congelar: congelar,
  buildWindow, project, generate, pulse, askLocalVerdict,
  projetar: project, gerar: generate, pulso: pulse,
  _costMetric: costMetric, _tokenMetric: tokenMetric, _cargoOf: cargoOf,
};
