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
 * ⚠️ O QUE O CAS GARANTE, E O QUE NÃO GARANTE.
 *
 * A comparação corre sob o lock do broker — mas o `seamless.ledgerAppend` NÃO
 * toma esse lock. Existe portanto uma janela real entre comparar e despachar em
 * que outro processo pode escrever no mesmo job. O CAS apanha tudo o que
 * aconteceu ANTES da comparação; não apanha o que acontece durante a janela.
 *
 * Isto não se corrige aqui por âmbito: fechar a janela é pôr o outro escritor a
 * tomar o mesmo lock, e isso é o single-writer interprocessos que o masterprompt
 * adiou para MU0-c. O que se faz é dizê-lo — no módulo, no retorno (`cas`) e no
 * evento gravado. Um CAS que se apresentasse como atómico seria a mesma mentira
 * que um RBAC que se apresentasse como autenticado.
 *
 * ÂMBITO: o CONTRATO-BROKER da crítica descreve tenant_id, correlation_id,
 * causation_id e uma máquina de estados completa. Isso é F-MU1+. Aqui está o
 * núcleo que o masterprompt estreitou (kimi #7/#11/#13).
 */

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
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

/**
 * Só estas fecham um pendente.
 *
 * STALE não: um clique obsoleto não decide nada. E NEGADO também não — uma
 * falha de POLÍTICA (papel sem capacidade, roles.json avariado) não é uma
 * recusa humana. Enquanto eram a mesma coisa, a tentativa de um viewer fechava
 * o pedido e o owner deixava de o poder aprovar: a autorização envenenava o que
 * devia proteger.
 */
const DECISOES_FINAIS = ['APPROVED', 'REJECTED', 'EXPIRED'];

/** Os dois nomes sob os quais uma decisao se grava. */
const EVENTOS_DE_DECISAO = ['approval.decided', 'approval_rejected'];

const LOCK_TTL_S = 60;

const TODAS_AS_CAPACIDADES = ['read', 'write', 'bash', 'net', 'git'];

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
  } catch (erro) {
    if (erro && erro.code === 'ENOENT') return [];
    // Falhar a leitura e não haver eventos davam ambos `[]`. Não propagamos
    // `null`: estadoDoJob, listPending, decide e o adapter Slack consomem este
    // contrato como colecção. O neutro fica, mas a falha real deixa de ser muda.
    try { process.stderr.write('[mooter-broker] ledger não lido: '
      + ((erro && erro.message) || erro)
      + ' — a lista vazia é falha de leitura, não ausência de eventos\n'); } catch { /* stderr fechado */ }
    return [];
  }
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
  // A capacidade EFECTIVA manda sobre a pedida: o proprio seamless documenta que
  // `--allowedTools` PRE-APROVA ferramentas e NAO LIMITA o conjunto disponivel.
  // Derivar autorizacao do que foi PEDIDO, ignorando o que ficou efectivamente
  // disponivel, era medir a fechadura errada.
  const temCampo = !!(p.permissoes_efectivas
    && Object.prototype.hasOwnProperty.call(p.permissoes_efectivas, 'valor'));
  const efectivas = temCampo ? p.permissoes_efectivas.valor : undefined;

  if (temCampo && Array.isArray(efectivas)) {
    // Lista efectiva CONHECIDA. Vazia quer dizer vazia — o moo e o kimi correm
    // mesmo sem ferramentas. Antes o [] virava TODAS, que e o oposto do que o
    // produtor esta a dizer.
    if (!efectivas.length) return ['read'];
    return derivarDeFerramentas(p, efectivas.join(','));
  }
  if (temCampo) {
    // O produtor escreve literalmente "n/d" para cc, codex e gemini. Recuar para
    // o `allowedTools` era fail-open: o campo que ele proprio documenta como
    // "pre-aprova, nao limita" passava a valer como se fosse o limite.
    return [...TODAS_AS_CAPACIDADES];
  }
  const fonte = p.allowedTools;
  if (fonte == null || String(fonte).trim() === '') {
    // Job legado, sem informacao nenhuma. Sem saber o que pode fazer, o pior.
    return [...TODAS_AS_CAPACIDADES];
  }
  return derivarDeFerramentas(p, String(fonte));
}

function derivarDeFerramentas(p, tools) {
  const out = ['read'];
  if (p.escrita === true || /(Edit|Write|MultiEdit|NotebookEdit)/.test(tools)) out.push('write');
  if (/Bash/.test(tools)) out.push('bash');
  if (/(WebFetch|WebSearch)/.test(tools)) out.push('net');
  if (/git/i.test(tools)) out.push('git');
  return out;
}

/**
 * Eventos que descrevem o ESTADO de um job. Allowlist de proposito: `step`,
 * `collected`, `cross_check` e companhia sao OBSERVACOES, e trata-las como
 * estado escondia pendentes — um `mooter_collect` normal passava a ser o ultimo
 * evento e a espera desaparecia da fila. Uma denylist deixaria o proximo evento
 * novo entrar por engano; esta nao deixa.
 */
function eEstado(ev) {
  return isTerminal(ev) || ev.event === 'dispatched' || ev.event === 'started';
}

/** O ultimo evento que descreve ESTADO — nao o ultimo evento. */
function estadoCorrente(jobId, ledger) {
  let out = null;
  for (const e of ledger) { if (e.job_id === jobId && eEstado(e)) out = e; }
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
  if (!r || typeof r !== 'object' || typeof r.papeis !== 'object' || r.papeis === null
      || typeof r.capacidades !== 'object' || r.capacidades === null
      || Array.isArray(r.papeis) || Array.isArray(r.capacidades)) {
    return { modo: 'ilegivel', porque: 'roles.json sem os campos `papeis` e `capacidades`' };
  }
  // Uma capacidade que nao fosse array passava a validacao e depois o `.includes`
  // fazia correspondencia de SUBSTRING numa string: 'readwrite'.includes('read')
  // e true, e o papel ganhava uma capacidade que ninguem lhe deu.
  for (const [papel, caps] of Object.entries(r.capacidades)) {
    if (!Array.isArray(caps) || caps.some((c) => typeof c !== 'string')) {
      return { modo: 'ilegivel', porque: 'capacidades de "' + papel + '" não são uma lista de strings' };
    }
  }
  for (const [quem, papel] of Object.entries(r.papeis)) {
    if (typeof papel !== 'string' || !papel.trim()) {
      return { modo: 'ilegivel', porque: 'o papel de "' + quem + '" não é uma string' };
    }
  }
  // Object.create(null): um actor com id `toString`, `constructor` ou `__proto__`
  // recebia uma propriedade HERDADA truthy e passava a ter papel. O lookup usa
  // hasOwn por cima disto — cinto e suspensorios, porque a heranca de Object e
  // exactamente o tipo de coisa em que ninguem pensa a segunda vez.
  const papeis = Object.assign(Object.create(null), r.papeis);
  const capacidades = Object.assign(Object.create(null), r.capacidades);
  return { modo: 'roles', papeis, capacidades };
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

// ── contratos do retorno ──────────────────────────────────────────────────
// TODO o retorno leva `authz` e `cas`. Faltavam no INVALIDO, no LOCKED e no
// idempotente, e um consumidor que so olhasse para `estado` nao distinguia
// recusa humana de configuracao avariada. O `motivo` e o discriminador estavel.
const AUTHZ = Object.freeze({
  advisory: true, actor_autenticado: false,
  porque: 'o actor e proveniencia declarada, nao identidade autenticada; a fronteira real e F-MU1',
});
const CAS = Object.freeze({
  atomico: false,
  porque: 'a comparacao corre sob o lock do broker, mas o seamless.ledgerAppend nao o toma; '
    + 'existe uma janela entre comparar e despachar. Fecha-la e o single-writer '
    + 'interprocessos, adiado para MU0-c.',
});
function resposta(estado, motivo, extra) {
  return { estado, motivo, authz: AUTHZ, cas: CAS, ...(extra || {}) };
}

function JOBS_DIR() { return path.join(MOOTER_HOME_DIR(), 'jobs'); }

/**
 * O masterprompt COMPLETO vive na pasta do job; o ledger so guarda `goal` e
 * hash. Re-despachar com o `goal` nao funciona: o guard exige o texto integral
 * com o cabecalho. A ronda anterior nao dava por isso porque os testes usavam
 * stubs — o stub aceitava tudo, e a integracao real teria falhado no cliente.
 */
/**
 * O `request_id` vem de quem chama e ia direito a um `path.join`. Um
 * `../../algures` lia um ficheiro fora da pasta de jobs e o broker despachava-o
 * como se fosse o masterprompt do pedido. Um job_id e um identificador, nao um
 * caminho — e valida-se como identificador.
 */
// Um ponto NAO chega: `.` e `..` passavam este teste e o path.join resolvia-os
// para fora da pasta de jobs. A primeira correccao declarou-se feita e nao
// estava — por isso agora ha DUAS barreiras, e a segunda nao depende de eu ter
// pensado em todos os casos: confirma-se que o caminho resolvido fica DENTRO.
const JOB_ID_VALIDO = /^(?!\.+$)[A-Za-z0-9._-]+$/;

function jobIdSeguro(jobId) {
  return typeof jobId === 'string' && jobId.length > 0 && jobId.length < 256
    && JOB_ID_VALIDO.test(jobId);
}

function masterpromptDoJob(jobId) {
  if (!jobIdSeguro(jobId)) return null;
  const raiz = path.resolve(JOBS_DIR());
  const pasta = path.resolve(raiz, jobId);
  // cinto e suspensorios: mesmo que a regex deixe passar algo, o caminho tem de
  // ficar debaixo da raiz. `path.relative` diz-nos se saiu.
  const rel = path.relative(raiz, pasta);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  for (const nome of ['masterprompt.md', 'masterprompt.txt']) {
    try {
      const txt = fs.readFileSync(path.join(pasta, nome), 'utf8');
      if (txt && txt.trim()) return txt;
    } catch { /* tenta o seguinte */ }
  }
  return null;
}

/** O instante do pedido de aprovacao, ou null quando nao ha relogio utilizavel. */
function nascimentoDoPedido(jobId, ledger) {
  const esperas = ledger.filter((e) => e.job_id === jobId && e.exit_code === EXIT_A_ESPERA);
  const instantes = esperas.map((e) => Date.parse(e.ts || '')).filter((t) => Number.isFinite(t));
  if (!instantes.length) return null;
  // a PRIMEIRA espera manda: usar a ultima deixava o prazo esticar-se a cada
  // re-pedido, e um `.pop()` sobre a ordem do ficheiro nao e uma regra.
  return Math.min(...instantes);
}

// ── B1 · a fila ───────────────────────────────────────────────────────────
function listPending(filtro) {
  const f = filtro || {};
  const ledger = lerLedger();

  // So uma decisao FINAL fecha um pendente. Um STALE diz "o teu clique estava
  // velho" — o job continua a espera de alguem, e esconde-lo era perde-lo.
  // O `approval_rejected` conta por si. Sao dois appends separados, e uma falha
  // entre eles deixava a recusa gravada mas invisivel — e uma aprovacao podia
  // passar por cima dela.
  const fechados = new Set(ledger
    .filter((e) => EVENTOS_DE_DECISAO.includes(e.event) && DECISOES_FINAIS.includes(e.estado))
    .map((e) => e.request_id));

  const jobs = new Set(ledger.filter((e) => e.job_id).map((e) => e.job_id));
  const out = [];
  for (const job_id of jobs) {
    const ev = estadoCorrente(job_id, ledger);
    if (!ev || ev.exit_code !== EXIT_A_ESPERA || !isTerminal(ev)) continue;
    if (fechados.has(job_id)) continue;
    const quem = identidade.actorDoEvento(ev);
    if (f.worktree && ev.worktree !== f.worktree) continue;
    if (f.actor && quem.id !== (typeof f.actor === 'string' ? f.actor : f.actor && f.actor.id)) continue;
    const estado = estadoDoJob(job_id, ledger);
    const nascido = nascimentoDoPedido(job_id, ledger);
    out.push({
      job_id, wave: ev.wave || null, worktree: ev.worktree || null,
      event: ev.event, exit_code: ev.exit_code, ts: ev.ts || null,
      actor: quem, actor_porque: identidade.porqueDoEvento(ev),
      state_hash: estado ? estado.state_hash : null,
      seq: estado ? estado.seq : null,
      // sem relogio utilizavel nao se inventa um prazo — `new Date(NaN)` rebentava
      // o mesmo clamp que o decide() usa: um relogio no futuro nao estica o prazo
      expira_em: nascido == null ? null
        : new Date(Math.min(nascido, Date.now()) + EXPIRACAO_DEFAULT_MS).toISOString(),
      expira_em_porque: nascido == null ? 'n/d — o pedido nao tem ts utilizavel' : null,
    });
  }
  return out;
}

// ── a decisao ─────────────────────────────────────────────────────────────
/** ASSINCRONA: o re-despacho e async e o resultado dele faz parte da decisao. */
async function decide(args) {
  const a = args || {};
  const quem = identidade.normalizarActor(a.actor == null ? null : a.actor);
  if (!quem.ok) return resposta('INVALIDO', 'actor_invalido', { porque: quem.error });
  if (!a.request_id) return resposta('INVALIDO', 'sem_request_id', { porque: 'request_id e obrigatorio' });
  if (!a.idem_key) return resposta('INVALIDO', 'sem_idem_key', { porque: 'idem_key e obrigatoria' });
  if (!a.expected_state_hash) {
    return resposta('INVALIDO', 'sem_cas',
      { porque: 'expected_state_hash e obrigatorio — sem CAS nao ha decisao' });
  }
  // cedo: estava depois de caminhos que ja podiam ter gravado EXPIRED, STALE ou
  // NEGADO — ou seja, um veredicto invalido deixava rasto antes de ser recusado
  if (a.veredicto !== 'aprovar' && a.veredicto !== 'recusar') {
    return resposta('INVALIDO', 'veredicto_invalido',
      { porque: 'veredicto tem de ser "aprovar" ou "recusar"' });
  }

  const dono = 'broker-' + process.pid + '-' + (a.decision_id || a.idem_key);
  const lock = _adquirirLock(dono);
  if (!lock.acquired) {
    // uma falha a ESCREVER o lock nao e o mesmo que outro processo o ter, e
    // devolver o mesmo motivo para as duas tornava o campo inutil
    return resposta('LOCKED', lock.held_by === 'n/d' ? 'lock_indisponivel' : 'lock_tomado',
      { held_by: lock.held_by, stale: lock.stale,
        porque: lock.porque || 'outro processo tem o lock do broker; nada foi escrito' });
  }

  try {
    const ledger = lerLedger();

    // 1 · idempotencia — por (idem_key, request_id)
    // os dois nomes contam: a recusa grava-se como `approval_rejected` e e uma
    // decisao tao completa como qualquer outra
    const mesmaChave = ledger.find((e) => EVENTOS_DE_DECISAO.includes(e.event)
      && e.idem_key === a.idem_key && e.request_id === a.request_id);
    if (mesmaChave) {
      // devolve TUDO o que a primeira devolveu — se a resposta original se
      // perdeu, o chamador precisa do job_novo, nao so de saber que ja decidiu
      // o replay devolve o que a decisao FOI, nao um terminal:true de conveniencia:
      // um STALE ou um NEGADO nao passam a finais por serem repetidos
      return resposta(mesmaChave.estado, 'replay_exacto',
        { terminal: DECISOES_FINAIS.includes(mesmaChave.estado), idempotente: true,
          decision_id: mesmaChave.decision_id,
          job_novo: mesmaChave.job_novo || null, autorizacao: mesmaChave.autorizacao || null });
    }

    // 2 · ESTADO TERMINAL: uma decisao final e final. So a idem_key nao chegava —
    //     uma chave NOVA deixava decidir outra vez o mesmo pedido, porque as
    //     decisoes nao mudam o state_hash e o CAS nao dava por nada.
    // O `approval_rejected` conta AQUI tambem, nao so na fila. Estava so no
    // listPending: se o segundo append falhasse, o pedido sumia da fila mas uma
    // chamada directa aprovava-o na mesma.
    const finalAnterior = ledger.find((e) => e.request_id === a.request_id
      && EVENTOS_DE_DECISAO.includes(e.event) && DECISOES_FINAIS.includes(e.estado));
    if (finalAnterior) {
      return resposta(finalAnterior.estado, 'ja_decidido',
        { terminal: true, decision_id: finalAnterior.decision_id,
          porque: 'este pedido ja tem uma decisao final; uma chave nova nao a reabre' });
    }

    // 3 · o pedido tem de estar MESMO a espera agora
    const corrente = estadoCorrente(a.request_id, ledger);
    if (!corrente) return resposta('INVALIDO', 'sem_eventos', { porque: 'request_id sem estado no ledger' });
    if (corrente.exit_code !== EXIT_A_ESPERA || !isTerminal(corrente)) {
      return resposta('INVALIDO', 'nao_esta_a_espera',
        { porque: 'o job nao esta a espera de aprovacao agora (estado: ' + corrente.event + ')' });
    }

    const authzEvento = { advisory: true, actor_autenticado: false };
    const estado = estadoDoJob(a.request_id, ledger);
    const base = {
      event: 'approval.decided', decision_id: a.decision_id || null,
      request_id: a.request_id, about_job: a.request_id,
      idem_key: a.idem_key, actor: quem.actor, veredicto: a.veredicto || null,
      authz: authzEvento, cas: { atomico: false },
      // os dois hashes ficam em TODAS as decisoes, nao so no STALE: sem eles a
      // prova forense de uma aprovacao nao diz sobre que estado se aprovou
      expected_state_hash: a.expected_state_hash,
      actual_state_hash: estado ? estado.state_hash : null,
    };

    // 4 · expiracao — o default de 72h conta do PEDIDO, e sem relogio FECHA.
    const nascido = nascimentoDoPedido(a.request_id, ledger);
    if (nascido == null) {
      return resposta('INVALIDO', 'sem_relogio',
        { porque: 'o pedido nao tem ts utilizavel — sem ele nao ha prazo, e sem prazo nao se aprova' });
    }
    const limiteDeclarado = a.expires_at ? Date.parse(a.expires_at) : null;
    // um ts no FUTURO nao estica o prazo: o relogio do pedido e, no maximo, agora
    const limitePorDefeito = Math.min(nascido, Date.now()) + EXPIRACAO_DEFAULT_MS;
    const limite = Number.isFinite(limiteDeclarado)
      ? Math.min(limiteDeclarado, limitePorDefeito) : limitePorDefeito;
    if (Date.now() > limite) {
      _append({ ...base, estado: 'EXPIRED', expira_em: new Date(limite).toISOString(),
        porque: 'a decisao expirou antes do clique' });
      return resposta('EXPIRED', 'expirou', { terminal: true, descartada: true });
    }

    // 5 · CAS anti-stale (ver o limite declarado no cabecalho do modulo)
    if (a.expected_state_hash !== estado.state_hash) {
      _append({ ...base, estado: 'STALE', seq: estado.seq,
        expected_state_hash: a.expected_state_hash, actual_state_hash: estado.state_hash,
        porque: 'o estado do job mudou entre o pedido e o clique' });
      // terminal:false — o STALE nao decide nada, e o pedido continua na fila
      return resposta('STALE', 'estado_mudou', { terminal: false,
        expected_state_hash: a.expected_state_hash, actual_state_hash: estado.state_hash });
    }

    // 6 · o pedido original — precisa-se dele para AMBOS os veredictos
    const pedido = ledger.find((e) => e.job_id === a.request_id && e.event === 'dispatched');
    if (!pedido) {
      return resposta('INVALIDO', 'sem_pedido_original',
        { porque: 'nao ha evento `dispatched` para este request_id — nao da para derivar capacidades' });
    }
    const exigidas = capacidadesDoPedido(pedido);
    const papeis = lerPapeis();
    if (papeis.modo === 'ilegivel') {
      _append({ ...base, estado: 'NEGADO', seq: estado.seq,
        porque_negado: 'roles_ilegivel', detalhe: papeis.porque });
      return resposta('NEGADO', 'roles_ilegivel',
        { terminal: false, porque_negado: 'roles_ilegivel', detalhe: papeis.porque,
          porque: 'falha de politica nao fecha o pedido — arranja-se o roles.json e decide-se' });
    }
    let autorizacao = 'single_user';
    let papel = null;
    if (papeis.modo === 'roles') {
      papel = Object.prototype.hasOwnProperty.call(papeis.papeis, quem.actor.id)
        ? papeis.papeis[quem.actor.id] : null;
      // RECUSAR tambem e um acto de autoridade: fecha o pedido de outra pessoa.
      // Antes gravava-se a recusa ANTES de olhar para os papeis, e qualquer um
      // conseguia encerrar o pedido alheio mesmo no modelo advisory.
      if (!papel) {
        _append({ ...base, estado: 'NEGADO', seq: estado.seq, porque_negado: 'sem_papel' });
        return resposta('NEGADO', 'sem_papel', { terminal: false, porque_negado: 'sem_papel',
          porque: 'quem nao tem papel declarado nao decide — nem para aprovar nem para recusar' });
      }
      autorizacao = 'roles:' + papel;
    }

    // 7 · a intencao pendurada domina QUALQUER veredicto. Estava depois da
    //     recusa, por isso uma recusa passava por cima de um despacho de
    //     resultado desconhecido e fechava o pedido como se nada tivesse
    //     acontecido.
    const pendurado = ledger.find((e) => e.event === 'approval.dispatching'
      && e.request_id === a.request_id);
    if (pendurado) {
      return resposta('INDETERMINADO', 'despacho_pendurado', { terminal: false,
        porque: 'ha um despacho iniciado e nao confirmado para este pedido; decidir agora '
          + 'podia esconder um efeito que ja aconteceu. Resolver a mao.',
        decision_id: pendurado.decision_id });
    }

    // 8 · recusa humana — terminal
    if (a.veredicto === 'recusar') {
      // UM append, nao dois. Dois criavam uma janela em que a recusa ficava
      // gravada sem hashes, sem seq e sem veredicto — e essa versao incompleta
      // era aceite como decisao final. Uma projeccao a fazer de fonte canonica.
      // O nome do evento e o que o contrato pede (`approval_rejected`); os campos
      // sao os mesmos de qualquer outra decisao final.
      _append({ ...base, event: 'approval_rejected', estado: 'REJECTED',
        seq: estado.seq, autorizacao, porque: 'recusado por quem decide' });
      return resposta('REJECTED', 'recusa_humana', { terminal: true, autorizacao });
    }
    // 9 · aprovar exige as capacidades que o pedido usa
    if (papeis.modo === 'roles') {
      const tem = (papel && Object.prototype.hasOwnProperty.call(papeis.capacidades, papel)
        && papeis.capacidades[papel]) || [];
      const faltam = exigidas.filter((c) => !tem.includes(c));
      if (faltam.length) {
        _append({ ...base, estado: 'NEGADO', seq: estado.seq,
          porque_negado: 'capacidade_em_falta', papel, capacidades_exigidas: exigidas,
          capacidades_em_falta: faltam });
        return resposta('NEGADO', 'capacidade_em_falta', { terminal: false,
          porque_negado: 'capacidade_em_falta', papel,
          capacidades_exigidas: exigidas, capacidades_em_falta: faltam,
          porque: 'quem tiver a capacidade continua a poder decidir este pedido' });
      }
    }

    // 10 · o masterprompt COMPLETO, do disco, E AMARRADO AO HASH APROVADO.
    //      Ler o ficheiro sem o comparar deixava-o mudar entre o pedido e o
    //      clique: aprovava-se um texto e despachava-se outro.
    const mp = masterpromptDoJob(a.request_id);
    if (!mp) {
      return resposta('INVALIDO', 'sem_masterprompt',
        { porque: 'o masterprompt completo do job nao esta em disco; re-despachar so com o goal '
          + 'seria despachar outra coisa' });
    }
    if (!pedido.mp_hash) {
      // Sem hash nao ha a que amarrar. Despachar assim era aprovar um texto que
      // ninguem consegue provar ser o que foi pedido — e o caminho legado e
      // exactamente onde um atacante escolheria entrar.
      return resposta('INVALIDO', 'sem_mp_hash',
        { porque: 'o pedido nao tem mp_hash; sem ele o masterprompt nao se pode amarrar ao que foi aprovado' });
    }
    {
      const agora = crypto.createHash('sha256').update(mp, 'utf8').digest('hex');
      if (agora !== pedido.mp_hash) {
        return resposta('INVALIDO', 'masterprompt_mudou',
          { porque: 'o masterprompt em disco nao bate com o mp_hash do pedido; aprovar isto '
            + 'seria despachar um texto que ninguem aprovou',
            mp_hash_pedido: pedido.mp_hash, mp_hash_disco: agora });
      }
    }

    // 11 · a intencao entra ANTES do efeito externo
    _append({ event: 'approval.dispatching', request_id: a.request_id, about_job: a.request_id,
      decision_id: a.decision_id || null, idem_key: a.idem_key, actor: quem.actor,
      authz: authzEvento });

    let despacho = null;
    try {
      despacho = await _despachar({
        agent: pedido.agent || 'cc', worktree: pedido.worktree, wave: pedido.wave,
        masterprompt: mp, handoff_from: a.request_id, actor: quem.actor,
        allowedTools: pedido.allowedTools || undefined,
        // O filho não pode ficar mais caro só porque o handoff aumentou o prompt.
        // `tier_pedido` cobre eventos legados; nos actuais, `tier` é o efectivo.
        __tier_ceiling: pedido.tier || pedido.tier_pedido || undefined,
      });
    } catch (e) {
      // NAO se grava REJECTED: uma excepcao nao diz se o efeito aconteceu. Fechar
      // aqui era transformar incerteza em certeza — e a certeza errada.
      return resposta('INDETERMINADO', 'despacho_incerto', { terminal: false,
        detalhe: e.message,
        porque: 'o dispatcher lancou; nao se sabe se o job chegou a nascer. A intencao ficou '
          + 'gravada e o pedido nao fecha ate alguem confirmar.' });
    }
    if (!despacho || despacho.error || !despacho.job_id) {
      // Aqui SIM ha certeza: o guard respondeu que nao despachou.
      const detalhe = (despacho && (despacho.error || despacho.erro)) || 'sem job_id';
      _append({ ...base, estado: 'REJECTED', seq: estado.seq,
        porque_negado: 'despacho_recusado', detalhe, autorizacao });
      return resposta('REJECTED', 'despacho_recusado',
        { terminal: true, porque_negado: 'despacho_recusado', detalhe });
    }

    _append({ ...base, estado: 'APPROVED', seq: estado.seq, autorizacao,
      capacidades_exigidas: exigidas, job_novo: despacho.job_id });
    return resposta('APPROVED', 'aprovado', { terminal: true, autorizacao,
      capacidades_exigidas: exigidas, job_novo: despacho.job_id });
  } finally {
    _libertarLock(dono);
  }
}

module.exports = {
  EXPIRACAO_DEFAULT_MS,
  EXIT_A_ESPERA,
  DECISOES_FINAIS,
  EVENTOS_DE_DECISAO,
  LOCK_PATH,
  listPending,
  decide,
  estadoDoJob,
  capacidadesDoPedido,
  estadoCorrente,
  masterpromptDoJob,
  JOB_ID_VALIDO,
  TODAS_AS_CAPACIDADES,
  lerPapeis,
  setDispatcher,
  _prov,
};
