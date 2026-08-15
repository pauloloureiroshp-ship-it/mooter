'use strict';

/**
 * f-mu0 · PARTE B — broker de decisão.
 *
 * A Parte A era aditiva: a identidade passou a viajar. Esta migra AUTORIDADE —
 * quem pode aprovar o quê, e o que acontece quando o mundo mudou entre o pedido
 * e o clique. Por isso tudo aqui é fail-closed e nada é silencioso.
 *
 * REGRA DE OURO DA FRENTE: promover o que existe, nunca recriar.
 *  · o hash canónico vem do `tools/router/ledger-prov.js` (canonicalize/provHash).
 *    NÃO se escreve aqui uma segunda implementação — há um teste que o proíbe.
 *  · a terminalidade vem do `terminal.js`. Nunca uma lista paralela.
 *  · a identidade vem do `actor.js`, o mesmo módulo que a Parte A instalou.
 *  · o lock segue o PADRÃO do `packages/worktree-conductor/src/locks.ts`:
 *    `O_CREAT|O_EXCL` via flag 'wx', obsolescência por TTL, e — o que interessa —
 *    **um lock órfão é REPORTADO, nunca roubado em silêncio**.
 *
 * Porque é que o lock é o padrão e não o módulo: o `locks.ts` é TypeScript ESM
 * dentro de um pacote privado sem entrypoint compilado, e este bridge é
 * CommonJS. Importá-lo não é possível hoje sem lhe construir um build — o que
 * seria mais invasivo do que reutilizar 20 linhas de disciplina. Fica dito, e
 * fica citado, para ninguém pensar que foi distração.
 *
 * ÂMBITO, declarado: o CONTRATO-BROKER da crítica descreve um envelope com
 * tenant_id, correlation_id, causation_id e uma máquina de estados completa.
 * Isso é F-MU1+. Aqui implementa-se o núcleo que o masterprompt estreitou
 * (kimi #7/#11/#13): CAS sobre o ÚLTIMO evento do job, expiração, recusa,
 * idempotência durável e capacidades derivadas.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isTerminal } = require('./terminal.js');
const identidade = require('./actor.js');

/** 72h, e conta a partir do PEDIDO — quem decide não estica o prazo por demorar. */
const EXPIRACAO_DEFAULT_MS = 72 * 60 * 60 * 1000;

/**
 * O estado de "à espera de um humano" tem nomes REAIS no código (achado 6): o
 * evento é `nao_verificado` e o exit_code é este. Inventar `PENDING_APPROVAL`
 * aqui criaria uma segunda verdade sobre a mesma coisa.
 */
const EXIT_A_ESPERA = 'agent-awaiting-approval';

const LOCK_TTL_S = 60;

function MOOTER_HOME_DIR() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}
function LEDGER_PATH() { return path.join(MOOTER_HOME_DIR(), 'ledger.jsonl'); }
function ROLES_PATH() { return path.join(MOOTER_HOME_DIR(), 'roles.json'); }
function LOCK_PATH() { return path.join(MOOTER_HOME_DIR(), 'locks', 'broker.lock'); }

// ── promoção do ledger-prov ───────────────────────────────────────────────
// Mesmo padrão do `requireClassify()` no seamless.js: o repo primeiro, o bundle
// depois. Sem isto, o conector instalado (que não tem `tools/router/`) morria no
// require — que é exactamente o furo que o bundle.test.js existe para apanhar.
let _provCache = null;
function _prov() {
  if (_provCache) return _provCache;
  const repo = process.env.MOOTER_REPO || path.join(__dirname, '..', '..');
  const tentativas = [
    path.join(repo, 'tools', 'router', 'ledger-prov.js'),
    path.join(__dirname, 'ledger-prov.js'),
  ];
  let ultimoErro = null;
  for (const alvo of tentativas) {
    try { _provCache = require(alvo); return _provCache; } catch (e) { ultimoErro = e; }
  }
  throw new Error('ledger-prov.js indisponível em ' + tentativas.join(' nem em ')
    + ': ' + ((ultimoErro && ultimoErro.message) || ultimoErro));
}

// ── leitura ───────────────────────────────────────────────────────────────
function lerLedger() {
  try {
    return fs.readFileSync(LEDGER_PATH(), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/**
 * O ESCOPO DO CAS, declarado (kimi #7): o último evento DESTE job — nem a fila,
 * nem o diário inteiro. Um evento noutro job não pode invalidar esta decisão, ou
 * duas pessoas a trabalhar ao mesmo tempo bloqueavam-se uma à outra sem razão.
 *
 * `seq` é o índice do evento dentro do job (não uma sequência global: o ledger
 * não a tem, e inventá-la seria fingir uma garantia que o ficheiro não dá).
 */
function estadoDoJob(jobId, ledger) {
  const evs = (ledger || lerLedger()).filter((e) => e.job_id === jobId);
  if (!evs.length) return null;
  const seq = evs.length - 1;
  const evento = evs[seq];
  const event_hash = _prov().provHash(evento);
  return { seq, event_hash, state_hash: _prov().provHash({ seq, event_hash }), evento };
}

/**
 * Capacidades DERIVADAS do próprio pedido (achado 14 + kimi #8).
 *
 * Nunca se lê um campo `capacidades` do payload: quem pede não declara o que
 * pode. Capacidade declarada pelo chamador é decoração — e um atacante que a
 * forjasse ganhava exactamente aquilo que este módulo existe para negar.
 */
function capacidadesDoPedido(pedido) {
  const p = pedido || {};
  const tools = String(p.allowedTools || '');
  const out = ['read'];
  if (p.escrita === true || /\b(Edit|Write|MultiEdit|NotebookEdit)\b/.test(tools)) out.push('write');
  if (/\bBash\b/.test(tools)) out.push('bash');
  if (/\b(WebFetch|WebSearch)\b/.test(tools)) out.push('net');
  if (/\bgit\b/i.test(tools)) out.push('git');
  return out;
}

/**
 * @returns {{modo:'single_user'}|{modo:'roles', papeis:object, capacidades:object}}
 * Sem roles.json o comportamento é o de hoje. Regressão zero é gate: um
 * ficheiro que não existe não pode passar a barrar quem já trabalhava.
 */
function lerPapeis() {
  try {
    const r = JSON.parse(fs.readFileSync(ROLES_PATH(), 'utf8'));
    if (!r || typeof r !== 'object') return { modo: 'single_user' };
    return { modo: 'roles', papeis: r.papeis || {}, capacidades: r.capacidades || {} };
  } catch { return { modo: 'single_user' }; }
}

// ── lock (padrão do worktree-conductor/src/locks.ts) ──────────────────────
function _adquirirLock(dono) {
  const alvo = LOCK_PATH();
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  const agora = Date.now();
  try {
    const fd = fs.openSync(alvo, 'wx');            // O_CREAT|O_EXCL — atómico
    try {
      fs.writeSync(fd, JSON.stringify({
        recurso: 'broker', acquired_by: dono, pid: process.pid,
        acquired_at: new Date(agora).toISOString(), acquired_at_ms: agora,
        ttl_seconds: LOCK_TTL_S,
      }));
    } finally { fs.closeSync(fd); }
    return { acquired: true };
  } catch {
    let held = null;
    try { held = JSON.parse(fs.readFileSync(alvo, 'utf8')); } catch { /* sumiu entretanto */ }
    const stale = !!held && agora > (held.acquired_at_ms || 0) + (held.ttl_seconds || LOCK_TTL_S) * 1000;
    // NUNCA se rouba um lock órfão aqui. O locks.ts reporta e deixa a decisão a
    // quem tem contexto para a tomar; roubar sozinho é como se perdem escritas.
    return { acquired: false, held_by: (held && held.acquired_by) || 'desconhecido', stale };
  }
}

function _libertarLock(dono) {
  try {
    const held = JSON.parse(fs.readFileSync(LOCK_PATH(), 'utf8'));
    if (held && held.acquired_by !== dono) return false;   // só o dono liberta
  } catch { return false; }
  try { fs.rmSync(LOCK_PATH(), { force: true }); return true; } catch { return false; }
}

// ── escrita ───────────────────────────────────────────────────────────────
// O broker escreve o SEU evento directamente, sob lock. Não passa pelo
// seamless.ledgerAppend de propósito: aquele caminho não toma o lock, e o ponto
// desta parte é ter um escritor que o toma. Que o outro escritor continue a não
// o tomar é a dívida MU0-c, declarada no fecho — o single-writer de hoje é por
// processo (seamless.js:142; plan.js:53), não interprocessos.
function _append(ev) {
  const actor = identidade.normalizarActor(ev.actor == null ? null : ev.actor);
  if (!actor.ok) throw new Error(actor.error);
  const registo = { ts: new Date().toISOString(), ...ev, actor: actor.actor, actor_porque: actor.porque };
  fs.appendFileSync(LEDGER_PATH(), JSON.stringify(registo) + '\n');
  return registo;
}

// ── dispatcher injectável ─────────────────────────────────────────────────
// Dependência tardia, pelo mesmo motivo que o aprender.js a usa: evita o ciclo
// e deixa a suite exercitar o caminho real sem pôr um processo de pé.
let _dispatcher = null;
function setDispatcher(fn) { _dispatcher = fn; }
function _despachar(args) {
  if (_dispatcher) return _dispatcher(args);
  return require('./seamless.js').toolDispatch(args);
}

// ── B1 · a fila ───────────────────────────────────────────────────────────
function listPending(filtro) {
  const f = filtro || {};
  const ledger = lerLedger();
  const decididos = new Set(ledger
    .filter((e) => e.event === 'approval.decided')
    .map((e) => e.request_id || e.job_id));

  const porJob = new Map();
  for (const e of ledger) {
    if (!e.job_id) continue;
    if (e.exit_code === EXIT_A_ESPERA && isTerminal(e)) porJob.set(e.job_id, e);
  }

  const out = [];
  for (const [job_id, ev] of porJob) {
    if (decididos.has(job_id)) continue;
    const quem = identidade.actorDoEvento(ev);
    if (f.worktree && ev.worktree !== f.worktree) continue;
    if (f.actor && quem.id !== (typeof f.actor === 'string' ? f.actor : f.actor && f.actor.id)) continue;
    const estado = estadoDoJob(job_id, ledger);
    out.push({
      job_id, wave: ev.wave || null, worktree: ev.worktree || null,
      event: ev.event, exit_code: ev.exit_code, ts: ev.ts || null,
      actor: quem, actor_porque: identidade.porqueDoEvento(ev),
      state_hash: estado ? estado.state_hash : null,
      seq: estado ? estado.seq : null,
    });
  }
  return out;
}

// ── a decisão ─────────────────────────────────────────────────────────────
function decide(args) {
  const a = args || {};
  const quem = identidade.normalizarActor(a.actor == null ? null : a.actor);
  if (!quem.ok) return { estado: 'INVALIDO', porque: quem.error };
  if (!a.request_id) return { estado: 'INVALIDO', porque: 'request_id é obrigatório' };
  if (!a.idem_key) return { estado: 'INVALIDO', porque: 'idem_key é obrigatória' };

  const dono = 'broker-' + process.pid + '-' + a.decision_id;
  const lock = _adquirirLock(dono);
  if (!lock.acquired) {
    return { estado: 'LOCKED', held_by: lock.held_by, stale: lock.stale,
      porque: 'outro processo tem o lock do broker; nada foi escrito' };
  }

  try {
    const ledger = lerLedger();

    // 1 · idempotência ANTES de tudo o resto: repetir um clique não é decidir
    //     outra vez, e por isso nem sequer se revalida o estado — o resultado
    //     que se devolve é o que ficou gravado da primeira vez. Durável, sem
    //     janela: o handoff-journal rodava às 50 entradas e por isso não servia.
    const jaDecidido = ledger.find((e) => e.event === 'approval.decided' && e.idem_key === a.idem_key);
    if (jaDecidido) {
      return { estado: jaDecidido.estado, terminal: true, idempotente: true,
        decision_id: jaDecidido.decision_id, porque: 'idem_key já decidida' };
    }

    const base = {
      event: 'approval.decided', decision_id: a.decision_id || null,
      request_id: a.request_id, job_id: a.request_id,
      idem_key: a.idem_key, actor: quem.actor,
      veredicto: a.veredicto || null,
    };

    // 2 · expiração — terminal e DESCARTA. Nunca se re-enfileira sozinha:
    //     re-pedir é um gesto humano novo, não um retry do sistema.
    const expira = a.expires_at ? Date.parse(a.expires_at) : null;
    if (expira != null && Number.isFinite(expira) && Date.now() > expira) {
      _append({ ...base, estado: 'EXPIRED', expires_at: a.expires_at,
        porque: 'a decisão expirou antes do clique' });
      return { estado: 'EXPIRED', terminal: true, descartada: true };
    }

    // 3 · CAS anti-stale sobre o último evento DESTE job
    const estado = estadoDoJob(a.request_id, ledger);
    if (!estado) return { estado: 'INVALIDO', porque: 'request_id sem eventos no ledger' };
    if (a.expected_state_hash && a.expected_state_hash !== estado.state_hash) {
      _append({ ...base, estado: 'STALE', seq: estado.seq,
        expected_state_hash: a.expected_state_hash, actual_state_hash: estado.state_hash,
        porque: 'o estado do job mudou entre o pedido e o clique' });
      return { estado: 'STALE', terminal: true,
        expected_state_hash: a.expected_state_hash, actual_state_hash: estado.state_hash };
    }

    // 4 · recusa humana — terminal, e não despacha nada
    if (a.veredicto === 'recusar') {
      _append({ event: 'approval_rejected', request_id: a.request_id, job_id: a.request_id,
        decision_id: a.decision_id || null, actor: quem.actor, idem_key: a.idem_key });
      _append({ ...base, estado: 'REJECTED', seq: estado.seq, porque: 'recusado por quem decide' });
      return { estado: 'REJECTED', terminal: true };
    }

    if (a.veredicto !== 'aprovar') {
      return { estado: 'INVALIDO', porque: 'veredicto tem de ser "aprovar" ou "recusar"' };
    }

    // 5 · autorização por CAPACIDADE, derivada do pedido original
    const pedido = ledger.find((e) => e.job_id === a.request_id && e.event === 'dispatched') || {};
    const exigidas = capacidadesDoPedido(pedido);
    const papeis = lerPapeis();
    let autorizacao = 'single_user';
    if (papeis.modo === 'roles') {
      const papel = papeis.papeis[quem.actor.id] || null;
      const tem = (papel && papeis.capacidades[papel]) || [];
      const faltam = exigidas.filter((c) => !tem.includes(c));
      if (faltam.length) {
        _append({ ...base, estado: 'REJECTED', seq: estado.seq,
          porque_negado: 'capacidade_em_falta', papel, capacidades_exigidas: exigidas,
          capacidades_em_falta: faltam });
        return { estado: 'REJECTED', terminal: true, porque_negado: 'capacidade_em_falta',
          papel, capacidades_exigidas: exigidas, capacidades_em_falta: faltam };
      }
      autorizacao = 'roles:' + papel;
    }

    // 6 · aprovar = RE-DESPACHAR autenticado. Nunca "resume": o job novo nasce
    //     com o ator de quem DECIDIU e com a cadeia provada em handoff_from.
    const despacho = _despachar({
      agent: pedido.agent || 'cc', worktree: pedido.worktree, wave: pedido.wave,
      masterprompt: pedido.masterprompt || pedido.goal || '',
      handoff_from: a.request_id, actor: quem.actor,
      allowedTools: pedido.allowedTools || undefined,
    });
    _append({ ...base, estado: 'APPROVED', seq: estado.seq, autorizacao,
      capacidades_exigidas: exigidas,
      job_novo: (despacho && despacho.job_id) || null });
    return { estado: 'APPROVED', terminal: true, autorizacao,
      capacidades_exigidas: exigidas, job_novo: (despacho && despacho.job_id) || null };
  } finally {
    _libertarLock(dono);
  }
}

module.exports = {
  EXPIRACAO_DEFAULT_MS,
  EXIT_A_ESPERA,
  LOCK_PATH,
  listPending,
  decide,
  estadoDoJob,
  capacidadesDoPedido,
  lerPapeis,
  setDispatcher,
  _prov,
};
