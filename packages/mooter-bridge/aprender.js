'use strict';
/** Onda 3: resultados reais mudam routing futuro; desconhecido é `n/d`. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { PRICING_USD_PER_MILLION: KIMI_PRICES } = require('./kimi-adapter.js');
const { isTerminal } = require('./terminal.js');
const { actorDoEvento, temActorValido, porqueDoEvento } = require('./actor.js');

const ND = 'n/d';
const CUSTO_FONTE_CALCULADO = 'calculado a partir de tokens e tabela de precos';
const CUSTO_FONTE_CLI = 'reportado pelo CLI';
const PRECOS_USD_POR_MILHAO = Object.freeze({
  'kimi-k3': Object.freeze({ input: KIMI_PRICES.input_cache_miss, output: KIMI_PRICES.output }),
});
const MIN_OBSERVATIONS = 5;
const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const DESFECHOS = new Set(['entregue', 'falhou', 'interrompido', 'expirou', 'indeterminado']);
const CATEGORY_PATTERNS = [
  ['git_deploy', [/\b(git|commit|push|merge|rebase|branch(?:es)?|pull request|pr)\b/i,
    /\b(deploy|publica|lan[çc]a|release|migra|migration)\b/i]],
  ['auditoria', [/\b(audita|auditoria|audit|review|revis[aã]o|seguran[çc]a|security|vulnerabilidad|red.?team)\b/i]],
  ['codigo', [/\b(c[oó]digo|code|implementa|corrige|fix|bug|refactor|fun[çc][aã]o|class|teste|test|javascript|typescript|python|css|html)\b/i,
    /\b(cria|edita|escreve|altera)\b.*\b(ficheiro|arquivo|file|componente|m[oó]dulo)\b/i]],
  ['leitura_resumo', [/\b(l[eê]|leia|read|resume|resumo|sumariza|summariz|explica|explique|compara|extrai|lista|identifica|traduz)\b/i]],
];
const CATEGORY_NAMES = new Set(CATEGORY_PATTERNS.map(([category]) => category).concat('outro'));
const LEGACY_CATEGORY_PATTERNS = CATEGORY_PATTERNS.map(([category, patterns]) => (
  category === 'git_deploy'
    ? [category, [/\b(git|commit|push|merge|rebase|branch|pull request|pr)\b/i, patterns[1]]]
    : [category, patterns]
));

function classifyCategoryText(text, categoryPatterns) {
  for (const [category, patterns] of categoryPatterns || CATEGORY_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(text))) return category;
  }
  return 'outro';
}

/**
 * A categoria descreve o trabalho, não o rodapé de processo.
 *
 * Contrato para quem escreve briefs: se houver `OBJECTIVO:`, usa-se essa linha;
 * caso contrário usa-se a primeira frase da primeira linha não vazia. Blocos
 * posteriores de regras, guardrails ou instruções nunca entram na classificação.
 */
function objectiveForCategory(goal) {
  const text = String(goal || '').trim();
  if (!text) return '';
  const beforeRules = text.split(
    /(?:^|\r?\n)\s*(?:#{1,6}\s*)?(?:REGRAS|INSTRUÇÕES|INSTRUCOES|GUARDRAILS)(?:\s|\(|:)/i,
  )[0];
  const declared = beforeRules.match(
    /(?:^|\r?\n)\s*(?:#{1,6}\s*)?OBJECTIVO(?:\s+DA\s+WAVE)?\s*:\s*([^\r\n]+)/i,
  );
  const line = declared
    ? declared[1].trim()
    : (beforeRules.split(/\r?\n/).map((item) => item.trim()).find(Boolean) || '');
  const firstSentence = line.match(/^.*?[.!?](?:\s|$)/);
  return (firstSentence ? firstSentence[0] : line).trim();
}

function categoryForGoal(goal) {
  return classifyCategoryText(objectiveForCategory(goal));
}

/** Mantém a categoria que os jobs anteriores a esta wave já recebiam. */
function categoryForLegacyGoal(goal) {
  return classifyCategoryText(String(goal || ''), LEGACY_CATEGORY_PATTERNS);
}

function resolveCategory(goal, declaredCategory) {
  if (declaredCategory != null && String(declaredCategory).trim()) {
    const category = String(declaredCategory).trim();
    if (!CATEGORY_NAMES.has(category)) {
      return {
        category: null,
        category_fonte: 'declarada',
        porque: 'categoria desconhecida: ' + category,
      };
    }
    return { category, category_fonte: 'declarada', porque: null };
  }
  return { category: categoryForGoal(goal), category_fonte: 'inferida', porque: null };
}

function numberOrNull(value) {
  const parsed = Number(value);
  return value != null && Number.isFinite(parsed) ? parsed : null;
}

function costOrNull(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function tokenCountOrNull(value) {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function modeloComTabela(event) {
  const explicit = String((event && (event.model_used || event.model)) || '').trim().toLowerCase();
  if (PRECOS_USD_POR_MILHAO[explicit]) return explicit;
  return event && event.agent === 'kimi' ? 'kimi-k3' : null;
}

/**
 * Completa custo ausente apenas quando há tokens inteiros e uma tabela conhecida.
 * A proveniência viaja ao lado do número para um cálculo nunca parecer medição.
 */
function enriquecerCusto(event) {
  const source = event && typeof event === 'object' ? event : {};
  const out = { ...source };
  if (!isTerminal(source)) return out;

  const reported = costOrNull(source.cost_usd);
  if (reported != null) {
    out.cost_usd = reported;
    out.cost_usd_fonte = source.cost_usd_fonte
      || (source.agent === 'moo' ? 'inferência local sem custo de API' : CUSTO_FONTE_CLI);
    return out;
  }

  const model = modeloComTabela(source);
  const prices = model && PRECOS_USD_POR_MILHAO[model];
  const tokensIn = tokenCountOrNull(source.tokens_in);
  const tokensOut = tokenCountOrNull(source.tokens_out);
  if (!prices || tokensIn == null || tokensOut == null) {
    out.cost_usd = null;
    out.cost_usd_fonte = ND;
    return out;
  }

  const cost = (tokensIn * prices.input + tokensOut * prices.output) / 1_000_000;
  out.cost_usd = Number(cost.toFixed(9));
  out.cost_usd_fonte = CUSTO_FONTE_CALCULADO;
  out.cost_usd_calculo = {
    modelo: model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    precos_usd_por_milhao: prices,
  };
  return out;
}

function aprenderDir(options) {
  const opts = options || {};
  return opts.dir || opts.directory || path.join(
    process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'),
    'aprender',
  );
}

/**
 * Append lógico num JSON diário válido. Um job já guardado nunca é actualizado:
 * eventos terminais repetidos são no-op, preservando o primeiro desfecho histórico.
 */
function persistirSnapshotTerminal(event, options) {
  if (!isTerminal(event)) {
    return { ok: true, appended: false, porque: 'evento não terminal' };
  }
  if (!event.job_id) return { ok: false, appended: false, porque: 'job_id n/d' };
  const timestamp = Date.parse(event.ts);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, appended: false, porque: 'timestamp terminal n/d' };
  }

  const date = new Date(timestamp).toISOString().slice(0, 10);
  const directory = aprenderDir(options);
  const file = path.join(directory, date + '.json');
  fs.mkdirSync(directory, { recursive: true });

  let history = { schema_version: 1, date, jobs: [] };
  if (fs.existsSync(file)) {
    history = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!history || history.schema_version !== 1 || history.date !== date
        || !Array.isArray(history.jobs)) {
      throw new Error('histórico de aprendizagem inválido em ' + file);
    }
  }
  if (history.jobs.some((job) => job && job.job_id === event.job_id)) {
    return { ok: true, appended: false, ficheiro: file, job_id: event.job_id };
  }

  history.jobs.push(enriquecerCusto(event));
  fs.writeFileSync(file, JSON.stringify(history, null, 2) + '\n', 'utf8');
  return { ok: true, appended: true, ficheiro: file, job_id: event.job_id };
}

function median(values) {
  const measured = values.map(numberOrNull).filter((value) => value != null).sort((a, b) => a - b);
  if (!measured.length) return ND;
  const middle = Math.floor(measured.length / 2);
  return measured.length % 2 ? measured[middle]
    : Number(((measured[middle - 1] + measured[middle]) / 2).toFixed(6));
}

function normalizeOptions(input) {
  if (Array.isArray(input)) return { ledger: input };
  return input && typeof input === 'object' ? input : {};
}

/**
 * Uma só classificação para escrita nova e leitura histórica.
 * `event` continua intacto para não quebrar os consumidores do ledger v1.
 */
function classificarDesfecho(event) {
  if (!isTerminal(event)) return null;
  if (DESFECHOS.has(event.desfecho)) return event.desfecho;
  const exit = event.exit_code;
  if (exit === 'cancelled-by-user' || exit === 'orphaned-by-restart'
      || exit === 'agent-awaiting-approval') return 'interrompido';
  if (exit === 'timeout' || exit === 'prep-timeout') return 'expirou';
  if (exit == null || exit === '') return 'indeterminado';
  if (event.event === 'done' && (exit === 0 || exit === '0')) return 'entregue';
  return 'falhou';
}

function comDesfecho(event) {
  const desfecho = classificarDesfecho(event);
  if (!desfecho || event.desfecho === desfecho) return event;
  return { ...event, desfecho };
}

/** Dependência tardia evita o ciclo seamless → aprender → seamless. */
function readLedger(input) {
  const options = normalizeOptions(input);
  if (Array.isArray(options.ledger)) return options.ledger;
  if (typeof options.ledgerRead === 'function') return options.ledgerRead();
  try { return require('./seamless.js').ledgerRead(); } catch { return []; }
}

function jobRecords(input) {
  const byJob = new Map();
  for (const event of readLedger(input)) {
    if (!event || !event.job_id) continue;
    const eventActor = actorDoEvento(event);
    const record = byJob.get(event.job_id) || {
      job_id: event.job_id, actor: eventActor,
      actor_porque: porqueDoEvento(event),
      agent: null, tier_motor: null, goal: null,
      worktree: null, escrita: null, preparation: false, dispatched_at: null, completed_at: null,
      worktree_criada: null, git_base_clean: null, git_base_commit: null,
      status: null, desfecho: null, duration_s: null, tokens_in: null, tokens_out: null,
      model_used: null, cost_usd: null, cost_usd_fonte: ND, cost_usd_calculo: null,
      prep_duration_s: null, tokens_poupados_estimados: null,
      files_touched: null, files_touched_reason: null,
      motivo_nao_local: null, forcado_por_quota: false,
      category: null, category_fonte: null, categoria_legado: false,
    };
    if (temActorValido(event)) {
      // Último-a-falar, como o cargo — ver a nota no actor.js.
      record.actor = eventActor;
      record.actor_porque = porqueDoEvento(event);
    }
    for (const field of ['agent', 'tier_motor', 'goal', 'worktree']) {
      if (event[field]) record[field] = event[field];
    }
    if (typeof event.escrita === 'boolean') record.escrita = event.escrita;
    if (typeof event.preparation === 'boolean') record.preparation = event.preparation;
    if (CATEGORY_NAMES.has(event.category)) {
      const source = event.category_fonte === 'declarada' ? 'declarada' : 'inferida';
      if (!record.category || source === 'declarada' || record.category_fonte !== 'declarada') {
        record.category = event.category;
        record.category_fonte = source;
      }
    }
    if (event.categoria_legado === true) record.categoria_legado = true;
    if (event.event === 'dispatched') {
      if (!record.dispatched_at) record.dispatched_at = event.ts || null;
      if (event.local_decisao && typeof event.local_decisao === 'object') {
        record.motivo_nao_local = event.local_decisao.motivo_nao_local || null;
        record.forcado_por_quota = event.local_decisao.forcado_por_quota === true;
      }
      if (event.worktree_criada && typeof event.worktree_criada === 'object') {
        record.worktree_criada = event.worktree_criada;
      }
      if (typeof event.git_base_clean === 'boolean') record.git_base_clean = event.git_base_clean;
      if (event.git_base_commit) record.git_base_commit = event.git_base_commit;
    }
    if (isTerminal(event)) {
      const terminal = enriquecerCusto(event);
      record.desfecho = classificarDesfecho(terminal);
      record.status = record.desfecho === 'entregue' ? 'done' : 'failed';
      record.completed_at = terminal.ts || record.completed_at;
      for (const field of ['duration_s', 'tokens_in', 'tokens_out', 'cost_usd',
        'cost_usd_fonte', 'cost_usd_calculo', 'model_used',
        'prep_duration_s', 'tokens_poupados_estimados']) {
        if (terminal[field] != null) record[field] = terminal[field];
      }
      if (Array.isArray(terminal.files_touched)) record.files_touched = terminal.files_touched;
      if (terminal.files_touched_reason) record.files_touched_reason = terminal.files_touched_reason;
    }
    byJob.set(event.job_id, record);
  }
  return [...byJob.values()].map((record) => {
    if (record.category) return record;
    return {
      ...record,
      category: categoryForLegacyGoal(record.goal),
      category_fonte: 'legado',
      categoria_legado: true,
    };
  });
}

function statistics(input) {
  const ledger = readLedger(input);
  const records = jobRecords({ ledger });
  const completed = records.filter((record) => record.status && !record.preparation);
  const preparationJobs = records.filter((record) => record.status && record.preparation).length;
  const grouped = new Map();
  for (const record of completed) {
    const key = [record.agent || ND, record.tier_motor || ND, record.category].join('|');
    const list = grouped.get(key) || [];
    list.push(record); grouped.set(key, list);
  }
  const groups = [...grouped.entries()].map(([key, list]) => {
    const [agent, tier_motor, category] = key.split('|');
    const done = list.filter((record) => record.status === 'done');
    const totals = list.filter((record) => numberOrNull(record.tokens_in) != null
      && numberOrNull(record.tokens_out) != null)
      .map((record) => Number(record.tokens_in) + Number(record.tokens_out));
    const costed = done.filter((record) => costOrNull(record.cost_usd) != null);
    const costs = costed.map((record) => costOrNull(record.cost_usd));
    const calculatedCosts = costed.filter((record) => record.cost_usd_fonte === CUSTO_FONTE_CALCULADO).length;
    const reportedCosts = costed.length - calculatedCosts;
    return {
      agent, tier_motor, category, jobs: list.length, done: done.length,
      failed: list.length - done.length,
      success_rate: Number((done.length / list.length).toFixed(6)),
      duration_median_s: median(list.map((record) => record.duration_s)),
      tokens_median: median(totals),
      tokens_in_median: median(list.map((record) => record.tokens_in)),
      tokens_out_median: median(list.map((record) => record.tokens_out)),
      prep_duration_median_s: median(list.map((record) => record.prep_duration_s)),
      tokens_saved_estimated_median: median(list.map((record) => record.tokens_poupados_estimados)),
      delivered_cost_median_usd: median(costs),
      delivered_cost_jobs_measured: reportedCosts,
      delivered_cost_jobs_calculated: calculatedCosts,
      delivered_cost_jobs_unknown: done.length - costed.length,
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.agent.localeCompare(b.agent));
  return {
    jobs: completed.length, preparation_jobs: preparationJobs,
    pending_jobs: records.filter((record) => !record.status).length, groups,
    satisfaction_signals: inferSatisfaction({ ledger }),
    by_key: Object.fromEntries(groups.map((group) => [
      [group.agent, group.tier_motor, group.category].join('|'), group,
    ])),
  };
}

function normalizedTrigrams(text) {
  const normalized = String(text || '').toLocaleLowerCase('pt-BR')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (!normalized) return new Set();
  if (normalized.length < 3) return new Set([normalized]);
  const result = new Set();
  for (let index = 0; index <= normalized.length - 3; index++) result.add(normalized.slice(index, index + 3));
  return result;
}

function trigramJaccard(left, right) {
  const a = normalizedTrigrams(left);
  const b = normalizedTrigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Sinal inferido com confiança declarada; nunca feedback atribuído ao user. */
function inferSatisfaction(input) {
  const records = jobRecords(input)
    .filter((record) => !record.preparation && record.goal && record.worktree && record.dispatched_at)
    .sort((a, b) => Date.parse(a.dispatched_at) - Date.parse(b.dispatched_at));
  const signals = [];
  for (let index = 0; index < records.length; index++) {
    const current = records[index];
    const next = records.slice(index + 1).find((candidate) => candidate.worktree === current.worktree);
    if (!next) continue;
    const deltaMs = Date.parse(next.dispatched_at) - Date.parse(current.dispatched_at);
    if (!Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > REPEAT_WINDOW_MS) continue;
    const similarity = trigramJaccard(current.goal, next.goal);
    signals.push({
      job_id: current.job_id, next_job_id: next.job_id,
      signal: similarity > 0.7 ? 'negativo' : 'positivo_fraco',
      confidence: similarity > 0.7 ? 'media' : 'baixa',
      similarity: Number(similarity.toFixed(3)),
      basis: similarity > 0.7
        ? 'goal repetido na mesma worktree em menos de 10 minutos'
        : 'o job seguinte avançou para um goal diferente na mesma worktree',
    });
  }
  return signals;
}

function recomendarAgente(args) {
  const input = args && typeof args === 'object' ? args : {};
  const resolved = resolveCategory(input.goal, input.category);
  const category = resolved.category;
  const categoryFonte = input.category_fonte === 'declarada' || input.category_fonte === 'inferida'
    ? input.category_fonte : resolved.category_fonte;
  if (!category) return { agente: null, porque: resolved.porque };
  // localfirst continua a autoridade; estes vetos protegem chamadas directas.
  if (input.escrita === true) {
    return { agente: null, porque: 'trabalho de escrita tem veto: um erro local pode alterar ficheiros' };
  }
  if (category === 'git_deploy') {
    return { agente: null, porque: 'a categoria git_deploy tem veto: um erro aqui é irreversível' };
  }
  if (category === 'auditoria') {
    return { agente: null, porque: 'a categoria auditoria tem veto: exige revisão independente' };
  }
  if (String(input.tier || '').toUpperCase() === 'T3') {
    return { agente: null, porque: 'o tier T3 tem veto: trabalho de alto risco não é desviado pela aprendizagem' };
  }
  const records = jobRecords({ ledger: input.ledger, ledgerRead: input.ledgerRead })
    .filter((record) => record.status && !record.preparation && record.category === category);
  if (records.length < MIN_OBSERVATIONS) {
    return {
      agente: null,
      porque: 'só há ' + records.length + ' observações; são precisas ' + MIN_OBSERVATIONS,
      base: { category, category_fonte: categoryFonte, observations: records.length },
    };
  }
  const byAgent = new Map();
  for (const record of records) {
    const list = byAgent.get(record.agent || ND) || [];
    list.push(record); byAgent.set(record.agent || ND, list);
  }
  const candidates = [...byAgent.entries()].map(([agent, observations]) => {
    const done = observations.filter((record) => record.status === 'done').length;
    return { agent, observations: observations.length, done,
      success_rate: done / observations.length,
      duration_median_s: median(observations.map((record) => record.duration_s)) };
  }).filter((candidate) => candidate.observations >= MIN_OBSERVATIONS)
    .sort((a, b) => b.success_rate - a.success_rate || b.observations - a.observations
      || (a.agent === 'moo' ? -1 : (b.agent === 'moo' ? 1 : a.agent.localeCompare(b.agent))));
  const best = candidates[0];
  if (!best) {
    return {
      agente: null,
      porque: 'há ' + records.length + ' observações, mas nenhum agente tem '
        + MIN_OBSERVATIONS + ' na categoria ' + category,
      base: { category, category_fonte: categoryFonte, observations: records.length },
    };
  }
  if (best.success_rate < 0.6) {
    return {
      agente: null,
      porque: best.done + '/' + best.observations + ' jobs de ' + category
        + ' terminaram em done; a taxa medida fica abaixo de 60%',
      base: {
        category, category_fonte: categoryFonte, observations: records.length,
        agent_observations: best.observations, successes: best.done,
        success_rate: Number(best.success_rate.toFixed(6)),
      },
    };
  }
  const pct = Number((best.success_rate * 100).toFixed(1));
  return {
    agente: best.agent,
    porque: best.done + '/' + best.observations + ' jobs de ' + category
      + ' terminaram em done (' + pct + '% medidos)',
    confianca: best.observations >= 10 ? 'alta' : 'media',
    base: {
      category, category_fonte: categoryFonte, observations: records.length,
      agent_observations: best.observations, successes: best.done,
      success_rate: Number(best.success_rate.toFixed(6)),
      duration_median_s: best.duration_median_s,
    },
  };
}

function runGit(worktree, args, options) {
  if (options && typeof options.runGit === 'function') return String(options.runGit(worktree, args) || '');
  return execFileSync('git', ['-C', worktree, ...args], {
    encoding: 'utf8', timeout: 5000, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Base limpa é necessária para atribuir causalmente os ficheiros ao job.
 *
 * ⚠️ CUSTO MEDIDO (2026-07-26, Windows, árvore com ~1500 não-rastreados):
 * **129 ms de mediana** em 5 amostras, e é SÍNCRONO. Fica assim de propósito, e
 * a razão é a lição da Onda 2 lida ao contrário: o que era intolerável ali era
 * uma sonda de 209 ms num painel que repolla de 2 em 2 segundos. Isto corre uma
 * vez por job **de escrita** — jobs que duram minutos — e tem de correr ANTES
 * de o agente tocar no disco, senão a base já não é base.
 *
 * ❌ Nunca chamar isto no caminho de leitura (o tier local, que é o caminho
 * quente e barato): 129 ms num job de 2 s seria 6% de imposto por nada.
 */
function captureGitBase(worktree, options) {
  try {
    const commit = runGit(worktree, ['rev-parse', 'HEAD'], options).trim();
    const dirty = runGit(worktree, ['status', '--porcelain=v1', '--untracked-files=all'], options).trim();
    return { commit: commit || null, clean: !dirty,
      reason: dirty ? 'a worktree já estava suja antes do job' : null };
  } catch {
    return { commit: null, clean: false, reason: 'não foi possível ler a base Git da worktree' };
  }
}

function zeroList(text) {
  return String(text || '').split('\0').map((item) => item.trim()).filter(Boolean);
}

function captureFilesTouched(worktree, base, options) {
  if (!base || !base.commit) return { files: null, reason: 'a base Git do job não foi registada' };
  if (!base.clean) return { files: null, reason: base.reason || 'a worktree já estava suja antes do job' };
  try {
    const head = runGit(worktree, ['rev-parse', 'HEAD'], options).trim();
    if (head !== base.commit) return { files: null,
      reason: 'HEAD mudou durante o job; não é possível atribuir o diff só ao agente' };
    const tracked = zeroList(runGit(worktree, ['diff', '--name-only', '-z', base.commit], options));
    const untracked = zeroList(runGit(worktree, ['ls-files', '--others', '--exclude-standard', '-z'], options));
    return { files: [...new Set([...tracked, ...untracked])].sort(), reason: null };
  } catch {
    return { files: null, reason: 'não foi possível medir os ficheiros tocados pelo job' };
  }
}

function ndKeepRate(reason) {
  return { keep_rate: ND, valor: ND, porque: reason };
}

/**
 * Percentagem de ficheiros do job que entrou no commit seguinte e continua
 * intacta no HEAD actual. É uma unidade conservadora, não sobrevivência por linha.
 */
function measureKeepRate(job, input) {
  const options = normalizeOptions(input);
  if (!job || !job.worktree) return ndKeepRate('worktree do job não registada');
  if (!job.worktree_criada || typeof job.worktree_criada !== 'object') {
    return ndKeepRate('o job não correu numa worktree criada de fresco; keep rate não é atribuível');
  }
  const criada = typeof job.worktree_criada.path === 'string' ? job.worktree_criada.path.trim() : '';
  if (!criada) return ndKeepRate('a worktree criada de fresco não tem caminho registado');
  if (path.resolve(criada) !== path.resolve(job.worktree)) {
    return ndKeepRate('a worktree criada não coincide com a worktree onde o job correu');
  }
  if (job.git_base_clean !== true) {
    return ndKeepRate('a base Git limpa da worktree criada não foi provada');
  }
  if (!Array.isArray(job.files_touched) || !job.files_touched.length) {
    return ndKeepRate(job && job.files_touched_reason
      ? job.files_touched_reason : 'ledger não registou os ficheiros tocados pelo job');
  }
  if (!job.completed_at) return ndKeepRate('hora de conclusão do job não registada');
  const root = path.resolve(job.worktree);
  const files = [];
  for (const file of job.files_touched) {
    const absolute = path.resolve(root, String(file));
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
      return ndKeepRate('um ficheiro tocado ficou fora da worktree');
    }
    files.push(path.relative(root, absolute).replace(/\\/g, '/'));
  }
  try {
    const commits = runGit(root, [
      'log', '--reverse', '--format=%H', '--after=' + job.completed_at, 'HEAD',
    ], options).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!commits.length) return ndKeepRate('ainda não existe commit seguinte ao job');
    const nextCommit = commits[0];
    const committedFiles = new Set(runGit(root, [
      'diff-tree', '--no-commit-id', '--name-only', '-r', nextCommit,
    ], options).split(/\r?\n/).map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean));
    if (files.some((file) => !committedFiles.has(file))) {
      return ndKeepRate('o commit seguinte não contém todos os ficheiros atribuídos ao job');
    }
    let kept = 0;
    for (const file of files) {
      const changed = runGit(root, ['diff', '--stat', nextCommit, '--', file], options).trim();
      if (!changed) kept++;
    }
    const rate = Number(((kept / files.length) * 100).toFixed(1));
    return {
      keep_rate: rate, valor: rate,
      porque: kept + '/' + files.length + ' ficheiro(s) continuam intactos desde o commit seguinte',
      files_measured: files.length, files_kept: kept, next_commit: nextCommit,
      unit: 'ficheiros_intactos_desde_commit_seguinte',
    };
  } catch {
    return ndKeepRate('não foi possível comparar o commit seguinte com o estado Git actual');
  }
}

/** Texto PT-BR para fecho de sessão, limitado a seis linhas. */
function resumoDeAprendizagem(input) {
  const options = normalizeOptions(input);
  const completed = jobRecords(options).filter((record) => record.status && !record.preparation);
  if (!completed.length) return 'Aprendizado: n/d — o ledger não tem jobs concluídos.';
  const lines = [];
  const done = completed.filter((record) => record.status === 'done');
  const local = completed.filter((record) => record.agent === 'moo');
  const localDone = local.filter((record) => record.status === 'done');
  lines.push(completed.length + ' jobs concluídos, ' + done.length + ' entregues e '
    + (completed.length - done.length) + ' com falha.');
  lines.push(local.length + ' jobs locais, ' + localDone.length + ' entregues.');
  const writeJobs = completed.filter((record) => record.escrita === true).slice(-20);
  const keepResults = writeJobs.map((record) => measureKeepRate(record, options));
  const rates = keepResults.filter((result) => typeof result.keep_rate === 'number');
  if (rates.length) {
    const measured = rates.reduce((sum, result) => sum + result.files_measured, 0);
    const kept = rates.reduce((sum, result) => sum + result.files_kept, 0);
    lines.push('Keep rate: ' + Number(((kept / measured) * 100).toFixed(1))
      + '% (' + kept + '/' + measured + ' arquivos intactos).');
  } else {
    const reason = keepResults.length ? keepResults[keepResults.length - 1].porque
      : 'nenhum job de escrita mensurável';
    lines.push('Keep rate: n/d — ' + reason + '.');
  }
  const costed = done.filter((record) => costOrNull(record.cost_usd) != null);
  const costs = costed.map((record) => costOrNull(record.cost_usd));
  const calculatedCosts = costed.filter((record) => record.cost_usd_fonte === CUSTO_FONTE_CALCULADO).length;
  const reportedCosts = costed.length - calculatedCosts;
  // ⚠️ 4 casas, e não as 16 que o float traz: "US$ 0.4825805000000001" foi o que
  // saiu na primeira prova com o ledger real. Falsa precisão é o oposto de rigor —
  // e um produto que jura não inventar números não pode dar-se ao luxo de PARECER
  // que inventa. Diz-se também de quantos jobs saiu a mediana.
  lines.push(costs.length
    ? 'Custo mediano por tarefa entregue: US$ ' + Number(median(costs)).toFixed(4)
      + ' (mediana de ' + costs.length + ' job(s): ' + reportedCosts + ' reportado(s) pelo CLI, '
      + calculatedCosts + ' ' + CUSTO_FONTE_CALCULADO + ').'
    : 'Custo mediano por tarefa entregue: n/d — sem custo reportado nem tokens com tabela conhecida.');
  const satisfaction = inferSatisfaction(options);
  const negative = satisfaction.filter((signal) => signal.signal === 'negativo').length;
  const positive = satisfaction.filter((signal) => signal.signal === 'positivo_fraco').length;
  lines.push(satisfaction.length
    ? 'Satisfação inferida: ' + negative + ' repetição(ões) negativa(s) e '
      + positive + ' avanço(s) positivo(s) fraco(s); não é feedback declarado.'
    : 'Satisfação inferida: n/d — não há sequência comparável em 10 minutos.');
  return lines.slice(0, 6).join('\n');
}

module.exports = {
  ND, CUSTO_FONTE_CALCULADO, CUSTO_FONTE_CLI, PRECOS_USD_POR_MILHAO,
  MIN_OBSERVATIONS, CATEGORY_NAMES, objectiveForCategory, categoryForGoal,
  categoryForLegacyGoal, resolveCategory, statistics, inferSatisfaction,
  trigramJaccard, recomendarAgente, measureKeepRate, resumoDeAprendizagem,
  captureGitBase, captureFilesTouched, classificarDesfecho, comDesfecho,
  enriquecerCusto, persistirSnapshotTerminal, _jobRecords: jobRecords,
};
