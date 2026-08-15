'use strict';

/**
 * f-mu0 · PARTE B — broker de decisão.
 *
 * ⚠️ LÊ ISTO ANTES DE CONFIAR NO QUE ESTÁ AQUI.
 *
 * A verificação de papéis deste módulo é **ADVISORY**: protege contra ENGANO,
 * não contra ADVERSÁRIO. O `actor` que ela usa é um campo de PROVENIÊNCIA que a
 * Parte A criou — declarado por quem chama e validado só na forma. Ninguém o
 * autentica. Um chamador que se apresente como `paulo` é tratado como o Paulo.
 *
 * Isto não é um descuido, é o âmbito: o masterprompt pede o RBAC (B3) e a
 * autenticação é F-MU1 (o estudo aponta o Obot como edge de authn remota). O
 * que NÃO é aceitável é a coisa parecer o que não é — um RBAC sem authn que se
 * apresentasse como controlo de segurança seria teatro, e teatro é pior do que
 * nada, porque alguém confia nele. Por isso:
 *   · todo o evento gravado leva `authz.advisory: true` e `actor_autenticado: false`;
 *   · o retorno de `decide()` leva os mesmos campos;
 *   · e este parágrafo existe para que ninguém tenha de os descobrir.
 *
 * REGRA DE OURO DA FRENTE: promover o que existe, nunca recriar.
 *  · o hash canónico vem do `tools/router/ledger-prov.js` — há um teste que
 *    falha se aparecer uma segunda implementação no pacote;
 *  · a terminalidade vem do `terminal.js`, nunca de uma lista paralela;
 *  · a identidade vem do `actor.js`, o módulo que a Parte A instalou;
 *  · o lock segue o PADRÃO do `packages/worktree-conductor/src/locks.ts`:
 *    `O_CREAT|O_EXCL` via flag 'wx', obsolescência por TTL, e um lock órfão é
 *    REPORTADO, nunca roubado em silêncio.
 *
 * Porque é o padrão e não o módulo: o `locks.ts` é TypeScript ESM num pacote
 * privado sem entrypoint compilado, e este bridge é CommonJS. O crítico
 * confirmou que não era importável no runtime actual.
 *
 * ÂMBITO: o CONTRATO-BROKER da crítica descreve tenant_id, correlation_id,
 * causation_id e uma máquina de estados completa. Isso é F-MU1+. Aqui está o
 * núcleo que o masterprompt estreitou (kimi #7/#11/#13).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { isTerminal } = require('./terminal.js');
const identidade = require('./actor.js');

/** 72h, e conta do PEDIDO — quem decide não estica o prazo por demorar a clicar. */
const EXPIRACAO_DEFAULT_MS = 72 * 60 * 60 * 1000;

/**
 * O estado de "à espera de um humano" tem nomes REAIS no código (achado 6): o
 * evento é `nao_verificado` e o exit_code é este.
 */
const EXIT_A_ESPERA = 'agent-awaiting-approval';

/** Só estas fecham um pendente. STALE não: um clique obsoleto não decide nada. */
const DECISOES_FINAIS = ['APPROVED', 'REJECTED', 'EXPIRED'];

const LOCK_TTL_S = 60;

function MOOTER_HOME_DIR() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}
function LEDGER_PATH() { return path.join(MOOTER_HOME_DIR(), 'ledger.jsonl'); }
function ROLES_PATH() { return path.join(MOOTER_HOME_DIR(), 'roles.json'); }
function LOCK_PATH() { return path.join(MOOTER_HOME_DIR(), 'locks', 'broker.lock'); }

// ── promoção do ledger-prov ───────────────────────────────────────────────
// Padrão do `requireClassify()` do seamless.js: repo primeiro, bundle depois.
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

function lerLedger() {
  try {
    return fs.readFileSync(LEDGER_PATH(), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/**
 * O ESCOPO DO CAS (kimi #7): o último evento DESTE job. Nem a fila, nem o
 * diário — um evento noutro job não pode invalidar esta decisão, ou dois
 * utilizadores bloqueavam-se um ao outro sem razão.
 *
 * `seq` é o índice dentro do job. NÃO é uma sequência global: o ledger não a
 * tem, e inventá-la seria fingir uma garantia que o ficheiro não dá.
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
 * Capacidades DERIVADAS do próprio pedido (achado 14 + kimi #8). Nunca se lê um
 * campo `capacidades` do payload: quem pede não declara o que pode.
 *
 * ⚠️ Os nomes vêm do evento `dispatched` REAL — `escrita` e `allowedTools`. Se
 * mudarem lá, mudam aqui: há um teste de contrato que liga os dois, porque a
 * primeira versão disto lia um campo que o produtor não escrevia e ninguém
 * dava por isso.
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
 * @returns {{modo:'single_user'}|{modo:'roles',...}|{modo:'ilegivel', porque}}
 *
 * AUSENTE e ILEGÍVEL são coisas diferentes, e confundi-las abria a porta toda:
 * quem apagasse metade do roles.json ganhava autoridade total. Ausente é uma
 * escolha (single-user, regressão zero). Ilegível é uma avaria — e uma avaria
 * na configuração de autorização fecha, não abre.
 */
function lerPapeis() {
  let bruto;
  try {
    bruto = fs.readFileSync(ROLES_PATH(), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { modo: 'single_user' };
    return { modo: 'ilegivel', porque: 'roles.json existe mas não foi possível lê-lo: ' + e.message };
  }
  let r;
  try { r = JSON.parse(bruto); } catch (e) {
    return { modo: 'ilegivel', porque: 'roles.json não é JSON válido: ' + e.message };
  }
  if (!r || typeof r !== 'object' || typeof r.papeis !== 'object' || typeof r.capacidades !== 'object') {
    return { modo: 'ilegivel', porque: 'roles.json sem os campos `papeis` e `capacidades`' };
  }
  return { modo: 'roles', papeis: r.papeis, capacidades: r.capacidades };
}

// ── lock (padrão do worktree-conductor/src/locks.ts) ──────────────────────
function _adquirirLock(dono) {
  const alvo = LOCK_PATH();
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  const agora = Date.now();
  let fd = null;
  try {
    fd = fs.openSync(alvo, 'wx');                    // O_CREAT|O_EXCL — atómico
  } catch {
    let held = null;
    try { held = JSON.parse(fs.readFileSync(alvo, 'utf8')); } catch { /* vazio ou ilegível */ }
    const nascimento = (held && held.acquired_at_ms) || _idadeDoFicheiro(alvo);
    const ttl = ((held && held.ttl_seconds) || LOCK_TTL_S) * 1000;
    return {
      acquired: false,
      held_by: (held && held.acquired_by) || 'desconhecido',
      // NUNCA se rouba um lock órfão: o locks.ts reporta e deixa a decisão a
      // quem tem contexto. Roubar sozinho é como se perdem escritas.
      stale: nascimento != null && agora > nascimento + ttl,
    };
  }
  try {
    fs.writeSync(fd, JSON.stringify({
      recurso: 'broker', acquired_by: dono, pid: process.pid,
      acquired_at: new Date(agora).toISOString(), acquired_at_ms: agora,
      ttl_seconds: LOCK_TTL_S,
    }));
    return { acquired: true };
  } catch (e) {
    // Falhar DEPOIS do 'wx' deixava um lock vazio — sem dono e sem relógio, e
    // portanto nunca obsoleto: bloqueava o broker para sempre. Limpa-se.
    try { fs.rmSync(alvo, { force: true }); } catch { /* */ }
    return { acquired: false, held_by: 'n/d', stale: false,
      porque: 'não foi possível escrever o lock: ' + e.message };
  } finally {
    try { fs.closeSync(fd); } catch { /* */ }
  }
}

/** Idade de um lock sem metadata legível — para um ficheiro vazio não ser eterno. */
function _idadeDoFicheiro(alvo) {
  try { return fs.statSync(alvo).mtimeMs; } catch { return null; }
}

function _libertarLock(dono) {
  try {
    const held = JSON.parse(fs.readFileSync(LOCK_PATH(), 'utf8'));
    if (held && held.acquired_by !== dono) return false;   // só o dono liberta
  } catch { return false; }
  try { fs.rmSync(LOCK_PATH(), { force: true }); return true; } catch { return false; }
}

// ── escrita ───────────────────────────────────────────────────────────────
/**
 * ⚠️ Os eventos do broker NÃO levam `job_id`, e é de propósito.
 *
 * Levavam, na primeira versão, e isso partia leitores existentes: um
 * `approval.decided` no meio do stream de um job não é terminal, por isso o
 * `toolCollect` passava a dizer que o job ainda corria e o `toolCancel` podia
 * acrescentar um `failed` falso. A Parte A inteira respeitou a invariante
 * "aditivo, nenhum leitor parte" — a Parte B não a vai quebrar no último metro.
 *
 * A ligação ao job faz-se por `request_id`, que é quem o broker usa. O
 * `foldJobs` e companhia saltam eventos sem `job_id` e nunca os vêem.
 */
function _append(ev) {
  const actor = identidade.normalizarActor(ev.actor == null ? null : ev.actor);
  if (!actor.ok) throw new Error(actor.error);
  const registo = { ts: new Date().toISOString(), ...ev, actor: actor.actor, actor_porque: actor.porque };
  delete registo.job_id;
  fs.appendFileSync(LEDGER_PATH(), JSON.stringify(registo) + '\n');
  return registo;
}

// ── dispatcher injectável (dependência tardia, como no aprender.js) ───────
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

  // Só uma decisão FINAL fecha um pendente. Um STALE diz "o teu clique estava
  // velho" — o job continua à espera de alguém, e escondê-lo era perdê-lo.
  const fechados = new Set(ledger
    .filter((e) => e.event === 'approval.decided' && DECISOES_FINAIS.includes(e.estado))
    .map((e) => e.request_id));

  // O pendente é o job cujo ÚLTIMO evento é o de espera. Olhar só para "existe
  // um evento de espera algures" mantinha na fila jobs que já tinham seguido.
  const ultimo = new Map();
  for (const e of ledger) { if (e.job_id) ultimo.set(e.job_id, e); }

  const out = [];
  for (const [job_id, ev] of ultimo) {
    if (ev.exit_code !== EXIT_A_ESPERA || !isTerminal(ev)) continue;
    if (fechados.has(job_id)) continue;
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
      expira_em: ev.ts ? new Date(Date.parse(ev.ts) + EXPIRACAO_DEFAULT_MS).toISOString() : null,
    });
  }
  return out;
}

// ── a decisão ─────────────────────────────────────────────────────────────
/** ⚠️ ASSÍNCRONA: o re-despacho é async e o resultado dele faz parte da decisão. */
async function decide(args) {
  const a = args || {};
  const quem = identidade.normalizarActor(a.actor == null ? null : a.actor);
  if (!quem.ok) return { estado: 'INVALIDO', porque: quem.error };
  if (!a.request_id) return { estado: 'INVALIDO', porque: 'request_id é obrigatório' };
  if (!a.idem_key) return { estado: 'INVALIDO', porque: 'idem_key é obrigatória' };
  // O CAS não é opcional. Deixá-lo cair quando o campo vinha vazio era oferecer
  // um interruptor para o desligar a quem quisesse.
  if (!a.expected_state_hash) {
    return { estado: 'INVALIDO', porque: 'expected_state_hash é obrigatório — sem CAS não há decisão' };
  }

  const dono = 'broker-' + process.pid + '-' + (a.decision_id || a.idem_key);
  const lock = _adquirirLock(dono);
  if (!lock.acquired) {
    return { estado: 'LOCKED', held_by: lock.held_by, stale: lock.stale,
      porque: lock.porque || 'outro processo tem o lock do broker; nada foi escrito' };
  }

  try {
    const ledger = lerLedger();

    // 1 · idempotência — por (idem_key, request_id). Só pela chave, uma chave
    //     reutilizada noutro job devolvia a decisão do PRIMEIRO: sem CAS, sem
    //     autorização e sem despacho do segundo. Era um buraco, não um atalho.
    const jaDecidido = ledger.find((e) => e.event === 'approval.decided'
      && e.idem_key === a.idem_key && e.request_id === a.request_id);
    if (jaDecidido) {
      return { estado: jaDecidido.estado, terminal: true, idempotente: true,
        decision_id: jaDecidido.decision_id, porque: 'idem_key já decidida para este pedido' };
    }

    const authz = { advisory: true, actor_autenticado: false,
      porque: 'o actor é proveniência declarada, não identidade autenticada; a fronteira real é F-MU1' };
    const base = {
      event: 'approval.decided', decision_id: a.decision_id || null,
      request_id: a.request_id, about_job: a.request_id,
      idem_key: a.idem_key, actor: quem.actor, veredicto: a.veredicto || null, authz,
    };

    const estado = estadoDoJob(a.request_id, ledger);
    if (!estado) return { estado: 'INVALIDO', porque: 'request_id sem eventos no ledger' };

    // 2 · expiração — o default de 72h conta do PEDIDO. Só valer o `expires_at`
    //     que o decisor mandasse era deixá-lo escolher o seu próprio prazo.
    const pedidoEspera = ledger.filter((e) => e.job_id === a.request_id
      && e.exit_code === EXIT_A_ESPERA).pop();
    const nascido = pedidoEspera && pedidoEspera.ts ? Date.parse(pedidoEspera.ts) : null;
    const limiteDeclarado = a.expires_at ? Date.parse(a.expires_at) : null;
    const limitePorDefeito = nascido != null && Number.isFinite(nascido)
      ? nascido + EXPIRACAO_DEFAULT_MS : null;
    // o mais APERTADO dos dois manda: um expires_at generoso não estica as 72h
    const limite = [limiteDeclarado, limitePorDefeito]
      .filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y)[0];
    if (limite != null && Date.now() > limite) {
      _append({ ...base, estado: 'EXPIRED', expira_em: new Date(limite).toISOString(),
        porque: 'a decisão expirou antes do clique' });
      return { estado: 'EXPIRED', terminal: true, descartada: true, authz };
    }

    // 3 · CAS anti-stale
    if (a.expected_state_hash !== estado.state_hash) {
      _append({ ...base, estado: 'STALE', seq: estado.seq,
        expected_state_hash: a.expected_state_hash, actual_state_hash: estado.state_hash,
        porque: 'o estado do job mudou entre o pedido e o clique' });
      return { estado: 'STALE', terminal: true, authz,
        expected_state_hash: a.expected_state_hash, actual_state_hash: estado.state_hash };
    }

    // 4 · recusa humana — terminal, e não despacha nada
    if (a.veredicto === 'recusar') {
      _append({ event: 'approval_rejected', request_id: a.request_id, about_job: a.request_id,
        decision_id: a.decision_id || null, actor: quem.actor, idem_key: a.idem_key, authz });
      _append({ ...base, estado: 'REJECTED', seq: estado.seq, porque: 'recusado por quem decide' });
      return { estado: 'REJECTED', terminal: true, authz };
    }
    if (a.veredicto !== 'aprovar') {
      return { estado: 'INVALIDO', porque: 'veredicto tem de ser "aprovar" ou "recusar"' };
    }

    // 5 · autorização ADVISORY por capacidade, derivada do pedido original
    const pedido = ledger.find((e) => e.job_id === a.request_id && e.event === 'dispatched');
    if (!pedido) {
      // Sem o pedido original não se sabe o que o job faria. Derivar `read` e
      // aprovar era autorizar às cegas com cara de rigor.
      return { estado: 'INVALIDO',
        porque: 'não há evento `dispatched` para este request_id — não é possível derivar capacidades' };
    }
    const exigidas = capacidadesDoPedido(pedido);
    const papeis = lerPapeis();
    if (papeis.modo === 'ilegivel') {
      _append({ ...base, estado: 'REJECTED', seq: estado.seq,
        porque_negado: 'roles_ilegivel', detalhe: papeis.porque });
      return { estado: 'REJECTED', terminal: true, porque_negado: 'roles_ilegivel',
        detalhe: papeis.porque, authz };
    }
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
          papel, capacidades_exigidas: exigidas, capacidades_em_falta: faltam, authz };
      }
      autorizacao = 'roles:' + papel;
    }

    // 6 · aprovar = RE-DESPACHAR autenticado. E ESPERAR: o despacho é async, e
    //     gravar APPROVED antes de saber o resultado era inventar um sucesso.
    let despacho = null;
    try {
      despacho = await _despachar({
        agent: pedido.agent || 'cc', worktree: pedido.worktree, wave: pedido.wave,
        masterprompt: pedido.masterprompt || pedido.goal || '',
        handoff_from: a.request_id, actor: quem.actor,
        allowedTools: pedido.allowedTools || undefined,
      });
    } catch (e) {
      _append({ ...base, estado: 'REJECTED', seq: estado.seq,
        porque_negado: 'despacho_falhou', detalhe: e.message });
      return { estado: 'REJECTED', terminal: true, porque_negado: 'despacho_falhou',
        detalhe: e.message, authz };
    }
    if (!despacho || despacho.error || !despacho.job_id) {
      _append({ ...base, estado: 'REJECTED', seq: estado.seq,
        porque_negado: 'despacho_recusado',
        detalhe: (despacho && (despacho.error || despacho.erro)) || 'sem job_id' });
      return { estado: 'REJECTED', terminal: true, porque_negado: 'despacho_recusado',
        detalhe: (despacho && (despacho.error || despacho.erro)) || 'sem job_id', authz };
    }

    _append({ ...base, estado: 'APPROVED', seq: estado.seq, autorizacao,
      capacidades_exigidas: exigidas, job_novo: despacho.job_id });
    return { estado: 'APPROVED', terminal: true, autorizacao, authz,
      capacidades_exigidas: exigidas, job_novo: despacho.job_id };
  } finally {
    _libertarLock(dono);
  }
}

module.exports = {
  EXPIRACAO_DEFAULT_MS,
  EXIT_A_ESPERA,
  DECISOES_FINAIS,
  LOCK_PATH,
  listPending,
  decide,
  estadoDoJob,
  capacidadesDoPedido,
  lerPapeis,
  setDispatcher,
  _prov,
};
