/**
 * rede-zero-apis.cjs — a LISTA das saídas que este ramo cobre, escrita UMA vez.
 *
 * ── PORQUE É QUE ESTE FICHEIRO EXISTE (2026-08-26, lente adversarial) ────────
 *
 * Até hoje havia duas listas: o pai (`rede-zero.mjs`) substituía cinco pontos de
 * saída e a sentinela que corre DENTRO dos filhos (`rede-zero-sentinela.cjs`)
 * substituía quatro. A que faltava na sentinela era `dns.promises.lookup`, e
 * `dns.promises.lookup !== dns.lookup` — substituir um não toca no outro.
 * Medido, com as sondas da lente:
 *
 *     C · filho: dns.promises.lookup      rede_zero=true  chamadas=0  saidas: []
 *     D · filho: dns.Resolver -> 192.0.2.1 rede_zero=true  chamadas=0  saidas: []
 *     A · pai:   dns.resolve4 -> 192.0.2.1 rede_zero=true  chamadas=0
 *
 * Três saídas reais devolvidas como «0 chamadas de rede (medido)». Duas listas
 * para a mesma pergunta divergem, e a que divergir é descoberta tarde — que é
 * exactamente o que o cabeçalho de `rede-zero.mjs` já dizia sobre o loopback e
 * não tinha aplicado às APIs. Aqui há UMA lista, um instalador, e um teste que
 * exige que os dois lados instalem o mesmo conjunto.
 *
 * ── A FRONTEIRA TAMBÉM É UMA SÓ ─────────────────────────────────────────────
 * Havia duas definições de «isto não sai da máquina»: `ehLoopback` (:109) não
 * incluía `0.0.0.0`, e `remotoInerte` (:131) incluía. Consequência medida:
 *
 *     F · pai: dgram bind local (nao e saida)  rede_zero=false  chamadas=1
 *         chamada registada: ["dns.lookup->0.0.0.0"] | atirou: RedeBloqueada
 *
 * Abrir um socket UDP local passa por `dns.lookup('0.0.0.0')` (node:internal/
 * dgram:23). Um bind local não é uma saída, e o veredicto ia a `false` com a
 * corrida morta por dentro. `RE_INERTE` é agora a única fronteira: loopback mais
 * os endereços não-especificados (`0.0.0.0`, `::`, `*`), que como destino de um
 * connect significam a própria máquina e como lado remoto de uma sonda
 * significam «à escuta».
 *
 * ── PORQUE É QUE `dns.resolve*` É RECUSADO SEM OLHAR AO NOME ────────────────
 * `dns.lookup` pergunta ao resolver do SO e, para um IP literal ou uma entrada
 * de `hosts`, não sai da máquina — por isso é o nome que decide. `dns.resolve*`
 * e `reverse` são outra coisa: mandam um pacote ao servidor de DNS configurado,
 * seja qual for o nome perguntado. O destino é o SERVIDOR, não o nome. Medido a
 * 2026-08-26 nesta máquina: `dns.getServers()` devolve `["127.0.0.1"]` e há um
 * listener em `0.0.0.0:53`, mas se ele reencaminha ou não é **n/d — não se
 * conseguiu medir**. Um servidor em loopback que reencaminhe é uma saída
 * disfarçada de loopback. Por isso a regra aqui é a conservadora e está escrita:
 * qualquer `resolve*`/`reverse` é recusado, com os servidores configurados a
 * viajar no alvo para que quem lê o relatório veja para onde ia.
 */

'use strict';

/**
 * A ÚNICA fronteira de «isto não sai da máquina» deste ramo. Fonte de regex de
 * propósito: a sentinela recebe-a por ambiente em vez de trazer uma cópia sua.
 */
const RE_INERTE = String.raw`^(localhost|127\.[0-9.]+|::1|0:0:0:0:0:0:0:1|0\.0\.0\.0|::|\*|)$`;

/** Fabrica o predicado a partir da fonte (a mesma nos dois lados da fronteira). */
function fazEhInerte(fonte) {
  const re = new RegExp(fonte || RE_INERTE, 'i');
  return function ehInerte(host) {
    if (host === null || host === undefined) return true;
    return re.test(String(host).trim().toLowerCase().replace(/^\[|\]$/g, ''));
  };
}

/**
 * Extrai o destino de um `Socket.prototype.connect`, que aceita três formas.
 *
 * MEDIDO a 2026-08-26: `net.connect(porta, host)` normaliza os argumentos ANTES
 * de chamar `Socket.prototype.connect`, e o que chega cá é UM argumento só — o
 * array `[{port,host}, cb]`. Sem o ramo do array o destino lia-se como
 * localhost.
 */
function alvoDoConnect(args, ehInerte) {
  const a0 = args[0];
  if (Array.isArray(a0)) return alvoDoConnect(a0, ehInerte);
  if (typeof a0 === 'string') return { tipo: 'ipc', alvo: a0 };
  if (a0 && typeof a0 === 'object') {
    if (a0.path) return { tipo: 'ipc', alvo: String(a0.path) };
    const host = a0.host ?? a0.hostname ?? 'localhost';
    return { tipo: ehInerte(host) ? 'loopback' : 'rede', alvo: `${host}:${a0.port ?? '?'}` };
  }
  const host = typeof args[1] === 'string' ? args[1] : 'localhost';
  return { tipo: ehInerte(host) ? 'loopback' : 'rede', alvo: `${host}:${a0 ?? '?'}` };
}

/**
 * Destino de `dgram.Socket.prototype.send`.
 * Assinatura: `send(msg, [offset, length,] [port,] [address,] [callback])`.
 * Sem `address`, o Node manda para `127.0.0.1` (udp4) — documentado — logo a
 * ausência é inerte, e não desconhecida. Num socket já ligado (`send(msg, cb)`)
 * o destino foi decidido no `connect`, que também está coberto aqui.
 */
function alvoDoDgram(args, ehInerte) {
  const i = (typeof args[1] === 'number' && typeof args[2] === 'number') ? 3 : 1;
  const porta = args[i];
  const endereco = typeof args[i + 1] === 'string' ? args[i + 1] : '127.0.0.1';
  return { tipo: ehInerte(endereco) ? 'loopback' : 'rede', alvo: `${endereco}:${porta ?? '?'}` };
}

/**
 * Os métodos de resolução do c-ares. Derivados de
 * `Object.getOwnPropertyNames(dns.Resolver.prototype)` no Node v24.14.0 desta
 * máquina, e não de documentação — se uma versão nova acrescentar um, o teste
 * `a lista de resolvers cobre TUDO o que o Node expõe` parte no mesmo dia.
 */
const METODOS_RESOLVER = Object.freeze([
  'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname',
  'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa',
  'resolveSrv', 'resolveTlsa', 'resolveTxt', 'reverse',
]);

/**
 * Instala os guardas. `aoSaida(api, alvo)` devolve o Erro a atirar (é quem
 * regista); `aoLocal(api, alvo)` é chamado quando a chamada é inerte e passa.
 *
 * Devolve `{ restaurar, instaladas }`. `instaladas` é a lista de etiquetas — é
 * o que o teste de paridade compara entre o pai e a sentinela.
 */
function instalarGuardas({ ehInerte, aoSaida, aoLocal = null }) {
  const dns = require('node:dns');
  const net = require('node:net');
  const tls = require('node:tls');
  const dgram = require('node:dgram');

  const repor = [];
  const instaladas = [];
  const local = aoLocal || (() => {});

  const trocar = (obj, chave, etiqueta, fabricar) => {
    const antes = obj[chave];
    if (typeof antes !== 'function') return;
    obj[chave] = fabricar(antes);
    repor.push(() => { obj[chave] = antes; });
    instaladas.push(etiqueta);
  };

  // ── dns.lookup: o nome decide, porque um IP literal ou uma entrada de
  //    `hosts` não sai da máquina.
  trocar(dns, 'lookup', 'dns.lookup', (orig) => function (hostname, ...resto) {
    if (ehInerte(hostname)) { local('dns.lookup', String(hostname)); return orig.call(this, hostname, ...resto); }
    throw aoSaida('dns.lookup', String(hostname));
  });
  trocar(dns.promises, 'lookup', 'dns.promises.lookup', (orig) => function (hostname, ...resto) {
    if (ehInerte(hostname)) { local('dns.promises.lookup', String(hostname)); return orig.call(this, hostname, ...resto); }
    return Promise.reject(aoSaida('dns.promises.lookup', String(hostname)));
  });

  // ── dns.resolve* / reverse: o destino é o SERVIDOR. Ver o cabeçalho.
  const servidoresDe = (esteObj) => {
    try {
      if (typeof esteObj?.getServers === 'function') return esteObj.getServers();
      return dns.getServers();
    } catch { return ['?']; }
  };
  for (const m of METODOS_RESOLVER) {
    trocar(dns.Resolver.prototype, m, `dns.Resolver#${m}`, () => function (nome, ...resto) {
      throw aoSaida(`dns.Resolver.${m}`, `${nome} via ${servidoresDe(this).join(',')}`);
    });
    // `dns.resolve4` é uma função JÁ LIGADA ao resolver por omissão no momento
    // em que o módulo carregou: substituir o protótipo NÃO lhe toca. Medido:
    // `dns.resolve4 === dns.Resolver.prototype.resolve4` → false.
    trocar(dns, m, `dns.${m}`, () => function (nome, ...resto) {
      throw aoSaida(`dns.${m}`, `${nome} via ${servidoresDe(null).join(',')}`);
    });
    trocar(dns.promises.Resolver.prototype, m, `dns.promises.Resolver#${m}`, () => function (nome) {
      return Promise.reject(aoSaida(`dns.promises.Resolver.${m}`, `${nome} via ${servidoresDe(this).join(',')}`));
    });
    trocar(dns.promises, m, `dns.promises.${m}`, () => function (nome) {
      return Promise.reject(aoSaida(`dns.promises.${m}`, `${nome} via ${servidoresDe(null).join(',')}`));
    });
  }

  // ── sockets TCP e TLS. http/https/http2/undici descem todos a este ponto.
  trocar(net.Socket.prototype, 'connect', 'net.connect', (orig) => function (...args) {
    const { tipo, alvo } = alvoDoConnect(args, ehInerte);
    if (tipo === 'ipc' || tipo === 'loopback') { local(tipo === 'ipc' ? 'ipc' : 'net.connect', alvo); return orig.apply(this, args); }
    throw aoSaida('net.connect', alvo);
  });
  trocar(tls, 'connect', 'tls.connect', (orig) => function (...args) {
    const { tipo, alvo } = alvoDoConnect(args, ehInerte);
    if (tipo === 'rede') throw aoSaida('tls.connect', alvo);
    local('tls.connect', alvo);
    return orig.apply(this, args);
  });

  // ── UDP cru. É por aqui que o DNS vive, e não passa por `net`.
  trocar(dgram.Socket.prototype, 'send', 'dgram.send', (orig) => function (...args) {
    const { tipo, alvo } = alvoDoDgram(args, ehInerte);
    if (tipo === 'rede') throw aoSaida('dgram.send', alvo);
    local('dgram.send', alvo);
    return orig.apply(this, args);
  });
  trocar(dgram.Socket.prototype, 'connect', 'dgram.connect', (orig) => function (porta, ...resto) {
    const endereco = typeof resto[0] === 'string' ? resto[0] : '127.0.0.1';
    if (!ehInerte(endereco)) throw aoSaida('dgram.connect', `${endereco}:${porta ?? '?'}`);
    local('dgram.connect', `${endereco}:${porta ?? '?'}`);
    return orig.call(this, porta, ...resto);
  });

  // ── fetch.
  if (typeof globalThis.fetch === 'function') {
    trocar(globalThis, 'fetch', 'fetch', (orig) => function (entrada, ...resto) {
      const url = String(entrada && entrada.url ? entrada.url : entrada);
      let host = url;
      try { host = new URL(url).hostname; } catch { /* url relativa: não sai da máquina */ }
      if (ehInerte(host)) { local('fetch', url); return orig.call(globalThis, entrada, ...resto); }
      return Promise.reject(aoSaida('fetch', url));
    });
  }

  return {
    instaladas: Object.freeze(instaladas.slice()),
    restaurar() { for (const f of repor.reverse()) f(); repor.length = 0; },
  };
}

/**
 * «Isto é o Node?» — decide se um processo que um filho fez nascer é da mesma
 * espécie e, portanto, PODE ter herdado a sentinela pelo `NODE_OPTIONS`. Não é
 * prova de cobertura: a prova é a linha `sentinela-carregada` com o PID dele.
 * Um comando que passa por shell (`exec`, `execSync`, `shell: true`) nunca é
 * Node aqui — o PID que se obtém é o da shell, e o que ela lança não se vê.
 */
function pareceNode(cmd, execPath = process.execPath) {
  const c = String(cmd ?? '');
  if (!c) return false;
  if (c === execPath) return true;
  const base = c.split(/[\\/]/).pop().toLowerCase();
  return base === 'node' || base === 'node.exe';
}

/**
 * O vigia dos filhos — a terceira camada da sentinela (2026-08-26, 2.ª lente).
 *
 * A sentinela cobria a rede e o `process.dlopen`, e a promoção a
 * `instrumentado` dizia «não sobra camada por observar». Sobrava: um filho Node
 * instrumentado que fizesse nascer um `curl.exe` não deixava rasto — a
 * intercepção não vê o que outro executável faz, e a sonda do SO só olha para
 * o PID do filho. MEDIDO pela lente: HTTP 200 real de `172.66.147.243` e o
 * relatório a dizer `rede_zero: true · todos medidos`.
 *
 * Aqui cada nascimento é ANUNCIADO — `{ev:'filho', api, cmd, args, pid, node}` —
 * e é o pai (`rede-zero.mjs`) que decide, com o registo inteiro na mão, se o
 * anunciado ficou coberto (é Node E escreveu a sua própria
 * `sentinela-carregada`) ou se é um processo que ninguém mediu.
 *
 * MEDIDO no Node v24.14.0: `exec` chama `module.exports.execFile` — sem a guarda
 * de reentrância um `exec` anunciava-se duas vezes. `fork` chama o `spawn`
 * LOCAL do módulo, não o exportado — por isso é embrulhado à parte.
 */
function instalarVigiaDeFilhos({ aoFilho, execPath = process.execPath, maxArgs = 32, maxArg = 200 }) {
  const cp = require('node:child_process');
  const repor = [];
  const instaladas = [];
  let dentro = false;

  const pidDe = (r) => (r && Number.isInteger(r.pid) && r.pid > 0) ? r.pid : null;
  const cortar = (args) => (Array.isArray(args) ? args : []).slice(0, maxArgs).map((a) => String(a).slice(0, maxArg));

  const vigiar = (chave, extrair) => {
    const orig = cp[chave];
    if (typeof orig !== 'function') return;
    cp[chave] = function (...a) {
      if (dentro) return orig.apply(this, a);
      dentro = true;
      const { cmd, args, node } = extrair(a);
      let r;
      let pid = null;
      try {
        r = orig.apply(this, a);
        pid = pidDe(r);
      } catch (e) {
        // `execSync`/`execFileSync` atiram quando o filho sai ≠ 0; o filho
        // correu na mesma e o erro traz o PID.
        pid = pidDe(e);
        throw e;
      } finally {
        dentro = false;
        try { aoFilho({ api: chave, cmd, args, pid, node }); } catch { /* anunciar não pode partir o filho */ }
      }
      return r;
    };
    repor.push(() => { cp[chave] = orig; });
    instaladas.push(chave);
  };

  const directo = ([cmd, args]) => ({ cmd: String(cmd), args: cortar(args), node: pareceNode(cmd, execPath) });
  const porShell = ([linha]) => ({ cmd: String(linha), args: [], node: false });

  vigiar('spawn', directo);
  vigiar('spawnSync', directo);
  vigiar('execFile', directo);
  vigiar('execFileSync', directo);
  vigiar('exec', porShell);
  vigiar('execSync', porShell);
  vigiar('fork', ([modulo, args, opts]) => {
    const o = (args && !Array.isArray(args) && typeof args === 'object') ? args : (opts || {});
    const exe = (o && o.execPath) || execPath;
    return { cmd: String(exe), args: cortar([modulo, ...(Array.isArray(args) ? args : [])]), node: pareceNode(exe, execPath) };
  });

  return {
    instaladas: Object.freeze(instaladas.slice()),
    restaurar() { for (const f of repor.reverse()) f(); repor.length = 0; },
  };
}

module.exports = {
  RE_INERTE, fazEhInerte, alvoDoConnect, alvoDoDgram, METODOS_RESOLVER, instalarGuardas,
  pareceNode, instalarVigiaDeFilhos,
};
