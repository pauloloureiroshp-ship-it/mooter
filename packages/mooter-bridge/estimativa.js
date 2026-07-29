'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const aprender = require('./aprender.js');
const eta = require('./eta.js');

const LIVE_SAMPLES = new Map();

function nd(porque) { return { valor: null, porque }; }

function finiteNonNegative(value) {
  const number = value == null ? null : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function elapsedSeconds(job, now) {
  const explicit = finiteNonNegative(job && (job.elapsed_s != null ? job.elapsed_s : job.duracao_s));
  if (explicit != null) return explicit;
  const started = Date.parse((job && (job.started_at || job.started_ts)) || '');
  if (!Number.isFinite(started)) return null;
  return Math.max(0, (Number(now) - started) / 1000);
}

/**
 * ⚠️ Apanhado em uso real (2026-07-27, job-ms3keiig-ef8f).
 *
 * O Codex emitiu `steps_done: 36` contra `steps_total: 4` — porque o detector
 * de passos conta CHAMADAS DE FERRAMENTA e o total vem do plano da wave. São
 * duas grandezas diferentes com o mesmo nome.
 *
 * A versão anterior fazia `Math.min(done, total)` e devolvia "4 de 4": uma
 * barra cheia, com o job a meio, durante quase dez minutos. Clampar não é
 * defender-se do erro — é escondê-lo e apresentá-lo como certeza.
 *
 * `done > total` é a PROVA de que o denominador está errado. Nesse caso não há
 * progresso para mostrar: há um `n/d` com o porquê, e o E2 assume. A barra fica
 * indeterminada, que é a verdade.
 */
function progressFor(job) {
  const source = job && job.now ? { ...job, ...job.now } : (job || {});
  const done = finiteNonNegative(source.steps_done);
  const total = finiteNonNegative(source.steps_total);
  if (!Number.isInteger(total) || total <= 0) {
    return nd(source.steps_total_porque || 'o job não declarou um total de passos fiável');
  }
  if (!Number.isInteger(done)) return nd('o job ainda não declarou nenhum passo concluído');
  if (done > total) {
    return nd(
      'o job já declarou ' + done + ' passos contra um total de ' + total
      + ' — o denominador não descreve este job (o detector conta chamadas de ferramenta, '
      + 'o total vem do plano), por isso não há percentagem honesta a mostrar',
    );
  }
  return { passo: done, de: total, fonte: 'passos declarados' };
}

function indexKeyFor(job) {
  const agent = String((job && job.agent) || '').trim();
  if (!agent) return { key: null, porque: 'o agente do job é n/d' };
  const category = (job && job.category) || aprender.categoryForGoal(job && job.goal);
  const bucket = eta.contextBucket(job && job.prompt_chars);
  if (!bucket) return { key: null, porque: 'o tamanho real do prompt não foi medido; a faixa de contexto fica n/d' };
  return { key: eta.indexKey(agent, category, bucket), porque: null };
}

function historyFor(job, index) {
  const keyed = indexKeyFor(job);
  if (!keyed.key) return { key: null, entry: null, porque: keyed.porque };
  if (!index || index.porque) return { key: keyed.key, entry: null, porque: (index && index.porque) || 'eta-index.json não está disponível' };
  const entry = index.chaves && index.chaves[keyed.key];
  if (!entry) return { key: keyed.key, entry: null, porque: 'sem observações para ' + keyed.key };
  if (Number(entry.n) < eta.MIN_OBSERVATIONS || finiteNonNegative(entry.p50) == null) {
    return {
      key: keyed.key,
      entry,
      porque: entry.porque || 'só há ' + (Number(entry.n) || 0) + ' observação(ões); são precisas pelo menos ' + eta.MIN_OBSERVATIONS,
    };
  }
  return { key: keyed.key, entry, porque: null };
}

function actualPercentile(entry, elapsed) {
  const values = (entry && entry._observacoes || [])
    .map((sample) => finiteNonNegative(sample.duration_s))
    .filter((value) => value != null);
  if (!values.length || elapsed == null) return null;
  const atOrBelow = values.filter((value) => value <= elapsed).length;
  return 'p' + Math.max(1, Math.min(100, Math.round((atOrBelow / values.length) * 100)));
}

function stepEstimate(progress, elapsed) {
  if (!progress || progress.valor === null) return { valor: null, porque: progress && progress.porque };
  if (elapsed == null) return { valor: null, porque: 'o tempo decorrido do job é n/d' };
  if (progress.passo <= 0) return { valor: null, porque: 'ainda não há um passo concluído para medir o ritmo real' };
  /**
   * Sem tempo decorrido não há ritmo — e `elapsed * (de/passo)` com `elapsed`
   * a zero dá zero, que a barra leria como "acabou". Um job que ainda não
   * consumiu tempo mensurável não tem estimativa nenhuma; tem n/d.
   */
  if (elapsed <= 0) {
    return { valor: null, porque: 'o job ainda não acumulou tempo mensurável; não há ritmo de onde projectar' };
  }
  /**
   * ⚠️ "Faltam 0 s" num job que continua vivo é uma impossibilidade, não uma
   * estimativa optimista. Se os passos dizem que acabou e o job não acabou, os
   * passos estão errados — e a resposta certa é dizê-lo, não devolver zero e
   * deixar a barra cheia a contradizer o pulso do E3, que naquele mesmo
   * instante estava a marcar "a-trabalhar, cresceu há 0 s".
   */
  if (progress.passo >= progress.de) {
    return {
      valor: null,
      porque: 'os passos declarados dizem que o trabalho acabou (' + progress.passo + ' de ' + progress.de
        + ') mas o job continua a correr — os passos deixaram de descrever o que falta',
    };
  }
  const projectedTotal = Math.max(elapsed, elapsed * (progress.de / progress.passo));
  return {
    valor: Math.max(0, Math.round(projectedTotal - elapsed)),
    base: progress.passo + ' de ' + progress.de + ' passos declarados em ' + Math.round(elapsed) + ' s',
    percentil_actual: null,
  };
}

/**
 * ⚠️ O MESMO bug, no outro caminho — apanhado por um refutador em 2026-07-28.
 *
 * A onda X6 corrigiu o E1 (passos) e deu o problema por fechado. Não estava: o
 * `Math.max(elapsed, p50)` fazia exactamente a mesma coisa aqui. Assim que o
 * decorrido passava o p50, `projectedTotal` colapsava em `elapsed` e a conta
 * dava **zero** — "faltam 0 s" com o job vivo, que foi o incidente de 959 s
 * que julgávamos resolvido. O fix anterior nunca cobriu este ramo.
 *
 * A régua agora é escalonada, e admite o fim da sua própria competência:
 *   decorrido < p50  ⇒ falta o que resta até ao p50
 *   p50 ≤ dec < p90  ⇒ falta o que resta até ao p90, e a base di-lo
 *   decorrido ≥ p90  ⇒ n/d. O histórico deixou de descrever este job; nove em
 *                       dez jobs iguais já teriam acabado. O `aviso` continua
 *                       a aparecer, e o pulso do E3 diz se ainda está vivo.
 *
 * Zero nunca é uma estimativa: é a ausência de uma.
 */
function historyEstimate(history, elapsed) {
  if (!history || !history.entry || history.porque) return { valor: null, porque: history && history.porque };
  if (elapsed == null) return { valor: null, porque: 'o tempo decorrido do job é n/d' };
  const p50 = finiteNonNegative(history.entry.p50);
  if (p50 == null) return { valor: null, porque: 'o p50 histórico é n/d' };
  const p90 = finiteNonNegative(history.entry.p90);
  const n = Number(history.entry.n);

  if (elapsed < p50) {
    return {
      valor: Math.round(p50 - elapsed),
      base: 'p50 de ' + n + ' jobs ' + history.key,
      percentil_actual: actualPercentile(history.entry, elapsed),
    };
  }
  if (p90 != null && elapsed < p90) {
    return {
      valor: Math.round(p90 - elapsed),
      base: 'já passou o p50; conta agora até ao p90 de ' + n + ' jobs ' + history.key,
      percentil_actual: actualPercentile(history.entry, elapsed),
    };
  }
  return {
    valor: null,
    porque: 'o job já dura ' + Math.round(elapsed) + ' s e ultrapassou '
      + (p90 != null ? 'o p90 (' + p90 + ' s)' : 'o p50 (' + p50 + ' s)')
      + ' de ' + n + ' jobs ' + history.key
      + ' — o histórico deixou de descrever este job, e zero não é uma estimativa',
  };
}

function formatHistoricalMaximum(seconds) {
  const value = finiteNonNegative(seconds);
  if (value == null) return 'n/d';
  return Number((value / 60).toFixed(1)) + ' min';
}

function warningFor(history, elapsed) {
  if (!history || !history.entry || history.porque || elapsed == null) return null;
  const p90 = finiteNonNegative(history.entry.p90);
  if (p90 == null || elapsed <= p90) return null;
  return 'passou o p90 — o máximo histórico foi ' + formatHistoricalMaximum(history.entry.max);
}

function livenessFor(jobId, history, options) {
  const o = options || {};
  const io = o.fs || fs;
  const now = o.now == null ? Date.now() : Number(o.now);
  const mooterHome = o.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  const jobsDir = o.jobsDir || path.join(mooterHome, 'jobs');
  const outPath = o.outPath || path.join(jobsDir, jobId, 'out.log');
  let stat;
  try { stat = io.statSync(outPath); }
  catch (error) {
    return {
      estado: 'n/d', ultimo_crescimento_s: null,
      porque: 'não consegui medir out.log: ' + ((error && error.message) || 'ficheiro indisponível'),
    };
  }
  const bytes = finiteNonNegative(stat.size);
  const modifiedAt = finiteNonNegative(stat.mtimeMs)
    ?? (stat.mtime && Number.isFinite(stat.mtime.getTime()) ? stat.mtime.getTime() : null);
  const sinceGrowth = modifiedAt == null || !Number.isFinite(now)
    ? null : Math.max(0, Math.round((now - modifiedAt) / 1000));
  const previous = o.previousSample || LIVE_SAMPLES.get(jobId) || null;
  let state = 'n/d';
  let reason = sinceGrowth == null ? 'a data da última escrita no log é n/d' : 'o log cresceu há ' + sinceGrowth + ' s';
  if (previous && bytes != null && finiteNonNegative(previous.bytes) != null) {
    if (bytes > Number(previous.bytes)) {
      state = 'a-trabalhar';
      reason = 'out.log cresceu desde a amostra anterior; ' + reason;
    } else if (bytes === Number(previous.bytes)) {
      state = 'parado';
      reason = 'out.log não cresceu desde a amostra anterior; ' + reason;
    } else {
      reason = 'out.log encolheu ou foi reiniciado; a vivacidade fica n/d';
    }
  } else {
    reason += '; é a primeira amostra desta execução, por isso o estado fica n/d';
  }
  const bytesP50 = finiteNonNegative(history && history.entry && history.entry.bytes_p50);
  const bytesN = finiteNonNegative(history && history.entry && history.entry.bytes_n) || 0;
  if (bytesP50 != null && bytesP50 > 0 && bytesN >= eta.MIN_OBSERVATIONS && bytes != null) {
    reason += '; tamanho actual ' + bytes + ' B = ' + Number((bytes / bytesP50).toFixed(2)) + '× o p50 de ' + bytesN + ' logs finais';
  } else {
    const bytesWhy = history && history.entry && history.entry.bytes_porque;
    reason += '; vivacidade sem normalização histórica: ' + (bytesWhy || 'menos de ' + eta.MIN_OBSERVATIONS + ' logs com bytes medidos');
  }
  if (o.track !== false) {
    if (!LIVE_SAMPLES.has(jobId) && LIVE_SAMPLES.size >= eta.JANELA) {
      LIVE_SAMPLES.delete(LIVE_SAMPLES.keys().next().value);
    }
    LIVE_SAMPLES.set(jobId, { bytes, mtimeMs: modifiedAt, measuredAt: now });
  }
  return { estado: state, ultimo_crescimento_s: sinceGrowth, porque: reason };
}

function readIndex(options) {
  const o = options || {};
  if (o.index) return o.index;
  return eta.readIndex({ indexPath: o.indexPath, mooterHome: o.mooterHome, fs: o.fs });
}

function estimateJob(jobId, job, options) {
  const id = String(jobId || '').trim();
  const o = options || {};
  if (!id) {
    const porque = 'job_id é obrigatório para estimar um job vivo';
    return { progresso: nd(porque), falta_s: nd(porque), vivo: { estado: 'n/d', ultimo_crescimento_s: null, porque }, manda: null, manda_porque: porque, aviso: null, porque };
  }
  const now = o.now == null ? Date.now() : Number(o.now);
  const index = readIndex(o);
  const history = historyFor(job || {}, index);
  const progress = progressFor(job || {});
  const elapsed = elapsedSeconds(job || {}, now);
  const e1 = stepEstimate(progress, elapsed);
  const e2 = historyEstimate(history, elapsed);
  const candidates = [];
  if (e1.valor != null) candidates.push({ manda: 'E1', estimate: e1 });
  if (e2.valor != null) candidates.push({ manda: 'E2', estimate: e2 });
  candidates.sort((a, b) => b.estimate.valor - a.estimate.valor || b.manda.localeCompare(a.manda));
  const winner = candidates[0] || null;
  const because = [e1.porque, e2.porque].filter(Boolean).join('; ') || 'nenhum estimador tem base medida';
  const result = {
    progresso: progress,
    falta_s: winner ? winner.estimate : nd(because),
    vivo: livenessFor(id, history, { ...o, now }),
    manda: winner ? winner.manda : null,
    aviso: warningFor(history, elapsed),
    porque: winner
      ? winner.manda + (candidates.length > 1
        ? ' projecta mais tempo entre as bases medidas' : ' é o único estimador com base medida')
      : because,
  };
  if (!winner) {
    result.manda_porque = because;
  }
  return result;
}

function resetLiveness() { LIVE_SAMPLES.clear(); }

module.exports = {
  estimateJob, readIndex,
  _elapsedSeconds: elapsedSeconds,
  _actualPercentile: actualPercentile,
  _resetLiveness: resetLiveness,
};
