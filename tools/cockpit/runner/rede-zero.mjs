/**
 * rede-zero.mjs — o "(medido)" do gate da F1.
 *
 * O gate do MP diz, à letra: «0 chamadas de rede durante a corrida (medido)».
 * A palavra que faz trabalho é a última. Este ficheiro existe porque a
 * alternativa — escrever «corre offline» no relatório — é uma promessa, e este
 * projecto já pagou por promessas: o modo ANCORADO esteve 10 624 recibos sem
 * correr e ninguém deu por isso, porque a ausência era silenciosa.
 *
 * ── O MECANISMO ESCOLHIDO, E PORQUE É QUE ELE PROVA O QUE DIZ ───────────────
 *
 * Escolhido: **contar e RECUSAR toda a saída no processo que corre a experiência,
 * e tornar cada processo filho mensurável antes de o deixar nascer.**
 *
 * A instrumentação sozinha (`dns.lookup` / `net.Socket.prototype.connect` /
 * `fetch`) seria um guarda que NUNCA podia falhar em produção, porque os três
 * produtores da F1 são todos processos filhos: o semgrep corre em WSL, o jscpd
 * é um binário nativo, o knip é outro processo Node. Um contador no processo-pai
 * que conta sempre zero, façam os filhos o que fizerem, é exactamente o que o
 * enunciado desta tarefa chama «um guarda indistinguível de um partido».
 *
 * Por isso o mecanismo tem duas metades, e é uma só coisa:
 *
 *  1. **No processo** — `dns.lookup`, `dns.promises.lookup`, `net.Socket.prototype.connect`,
 *     `tls.connect` e `fetch` são substituídos. Cada tentativa para fora do
 *     loopback é REGISTADA e a seguir ATIRA. Contar e bloquear na mesma camada
 *     é deliberado: se só contasse, um produtor podia falar para fora e o
 *     relatório dizia «1 chamada» com os dados já enviados. Loopback e IPC
 *     (named pipes, sockets unix) são registados à parte e deixados passar —
 *     é a mesma linha que o `runner-core.assertLocalEngine` já traça, e o
 *     próprio painel do cockpit vive em loopback.
 *
 *  2. **Nos filhos** — `child_process.spawn/execFile/exec` (e as variantes
 *     síncronas) passam por um ponto único que REGISTA o filho com o seu argv.
 *     Um produtor não consegue nascer sem ficar no registo. E cada filho tem de
 *     trazer a sua própria medição, numa de quatro qualidades:
 *
 *       · `bloqueado`     — o processo correu dentro de um espaço de nomes de
 *                           rede sem interfaces (`unshare -rn` no WSL). Não é
 *                           observação, é construção: não há rota nenhuma para
 *                           haver chamada. É o caminho do semgrep, e é o mais
 *                           forte, porque a tabela de sockets do Windows NÃO VÊ
 *                           para dentro da VM do WSL — sondar `wsl.exe` daria
 *                           zero por cegueira, a pior espécie de zero.
 *       · `instrumentado` — a sentinela (`rede-zero-sentinela.cjs`) entrou no
 *                           filho por `NODE_OPTIONS=--require` e interceptou lá
 *                           dentro. Não há janela para escapar: a prova é por
 *                           intercepção, não por amostragem. Só cobre as APIs de
 *                           JavaScript — um addon nativo dentro desse processo
 *                           (o motor do `jscpd@5` é um) só é coberto pela sonda.
 *       · `sondado`       — a tabela de sockets do SO foi lida pelo PID do filho,
 *                           N vezes durante a vida dele. É observação: uma
 *                           ligação curta entre duas amostras escapa. Medido a
 *                           2026-08-26, uma amostra custa ~550 ms e o jscpd corre
 *                           em 211 ms — foi por isto que a sentinela teve de
 *                           existir, e a primeira corrida a sério deu `n/d`.
 *       · `n/d`           — não se conseguiu medir. Zero amostras e sem
 *                           sentinela, PID desconhecido (variante síncrona),
 *                           plataforma sem sonda.
 *
 *     Uma saída vista por qualquer destas vias — incluindo a de um NETO, um
 *     processo que este ramo não registou mas que herdou a sentinela — derruba o
 *     veredicto. Estar um nível abaixo não é estar de fora.
 *
 * E daí sai um resultado de TRÊS estados, que é a parte que impede este ficheiro
 * de mentir a favor:
 *
 *      rede_zero = false  há tentativa registada, ou um filho com remoto observado
 *      rede_zero = null   nasceu um filho que NÃO se conseguiu medir
 *      rede_zero = true   zero tentativas e TODOS os filhos medidos a zero
 *
 * `null` não é `true`. Não medido nunca é medido-zero — é a mesma regra que o
 * F0 impôs ao índice do harness («componente que não se consegue medir vale zero
 * e diz porquê») e a mesma que o `lerDetector` já impõe ao painel.
 *
 * O que isto NÃO prova, e fica escrito para ninguém o vender melhor do que é:
 * não bloqueia a rede aos filhos ao nível do SO (isso exigia regra de firewall,
 * ou seja, administrador). O que faz aos filhos é (a) dar-lhes um ambiente
 * hostil — todas as variáveis de proxy apontadas a uma porta fechada do loopback
 * — e (b) exigir que cada um traga medição própria ou se declare `n/d`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Porta do loopback escolhida para onde apontar os proxies dos filhos. Não tem
 * nada à escuta de propósito: uma biblioteca que respeite `HTTP_PROXY` falha em
 * vez de sair, e a falha é ruidosa.
 */
export const PORTA_PROXY_MORTA = 9;

/** De quanto em quanto tempo se lê a tabela de sockets de um filho vivo. */
export const INTERVALO_SONDA_MS = 250;

/**
 * A ÚNICA definição de "isto não sai da máquina" deste ramo, escrita como fonte
 * de regex de propósito: a sentinela que corre DENTRO dos filhos recebe-a por
 * ambiente (`REDE_ZERO_LOOPBACK_RE`) em vez de trazer uma cópia sua. Duas
 * definições de loopback seriam duas fronteiras diferentes para a mesma
 * pergunta, e a que divergisse seria descoberta tarde.
 */
export const RE_LOOPBACK = String.raw`^(localhost|127\.[0-9.]+|::1|0:0:0:0:0:0:0:1|)$`;

const _reLoopback = new RegExp(RE_LOOPBACK, 'i');

/**
 * Loopback não é rede. A mesma fronteira que o `assertLocalEngine` já usa —
 * mudar de opinião aqui tornaria o painel do próprio cockpit numa violação.
 * `0.0.0.0` e `::` contam como loopback SÓ do lado remoto de uma sonda, onde
 * significam "à escuta", nunca como destino de um connect.
 */
export function ehLoopback(host) {
  if (host === null || host === undefined) return true;
  return _reLoopback.test(String(host).trim().toLowerCase().replace(/^\[|\]$/g, ''));
}

/** O ficheiro `.cjs` que os filhos Node carregam com `--require`. */
export const SENTINELA = fileURLToPath(new URL('./rede-zero-sentinela.cjs', import.meta.url));

/** Um destino que a sonda do SO devolve e que não conta como saída. */
function remotoInerte(addr) {
  const a = String(addr || '').trim();
  if (!a) return true;
  if (a === '0.0.0.0' || a === '::' || a === '*') return true;
  return ehLoopback(a);
}

export class RedeBloqueada extends Error {
  constructor(api, alvo) {
    super(`rede-zero: ${api} para ${alvo} recusado — a corrida da F1 é offline por construção`);
    this.name = 'RedeBloqueada';
    this.api = api;
    this.alvo = alvo;
  }
}

/**
 * Extrai o destino de um `Socket.prototype.connect`, que aceita três formas.
 * Devolve `{ tipo, alvo }`, com `tipo` em `rede | loopback | ipc`.
 */
export function alvoDoConnect(args) {
  const a0 = args[0];
  // MEDIDO a 2026-08-26, e não estava na cabeça de ninguém: `net.connect(porta,
  // host)` normaliza os argumentos ANTES de chamar `Socket.prototype.connect`, e
  // o que chega cá é UM argumento só — o array `[{port,host}, cb]`. Sem este
  // ramo, o destino lia-se como `localhost`, o connect passava por loopback, e a
  // saída só era apanhada mais à frente pelo `dns.lookup`. Um guarda que apanha a
  // segunda porta em vez da primeira ainda apanha; um que só tivesse a primeira
  // não apanhava nada.
  if (Array.isArray(a0)) return alvoDoConnect(a0);
  if (typeof a0 === 'string') return { tipo: 'ipc', alvo: a0 };
  if (a0 && typeof a0 === 'object') {
    if (a0.path) return { tipo: 'ipc', alvo: String(a0.path) };
    const host = a0.host ?? a0.hostname ?? 'localhost';
    const alvo = `${host}:${a0.port ?? '?'}`;
    return { tipo: ehLoopback(host) ? 'loopback' : 'rede', alvo };
  }
  const porta = a0;
  const host = typeof args[1] === 'string' ? args[1] : 'localhost';
  const alvo = `${host}:${porta ?? '?'}`;
  return { tipo: ehLoopback(host) ? 'loopback' : 'rede', alvo };
}

/**
 * A sonda do Windows: lê a tabela de sockets pelo PID. Devolve os endereços
 * remotos e a contagem de endpoints UDP.
 *
 * Medido a 2026-08-26 nesta máquina: ~557 ms por amostra (`Get-NetTCPConnection`
 * + `Get-NetUDPEndpoint` num PID de node vivo). É lento o suficiente para que
 * valha a pena dizer quantas amostras foram tiradas em vez de fingir contínuo.
 */
export function sondaWindows(spawnOriginal) {
  return async (pid) => {
    const ps = [
      "$ErrorActionPreference='SilentlyContinue';",
      `$t=@(Get-NetTCPConnection -OwningProcess ${pid} | Select-Object -ExpandProperty RemoteAddress);`,
      `$u=@(Get-NetUDPEndpoint -OwningProcess ${pid}).Count;`,
      "[Console]::Out.Write((($t -join ',') + '|' + $u))",
    ].join(' ');
    const saida = await new Promise((resolve) => {
      let buf = '';
      let p;
      try {
        p = spawnOriginal('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
          windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
        });
      } catch { resolve(null); return; }
      p.stdout.on('data', (d) => { buf += String(d); });
      p.on('error', () => resolve(null));
      p.on('close', () => resolve(buf));
    });
    if (saida === null) return null;
    const [tcp, udp] = String(saida).split('|');
    const remotos = String(tcp || '').split(',').map((s) => s.trim()).filter((s) => s && !remotoInerte(s));
    return { remotos, udp: Number(udp) || 0 };
  };
}

/**
 * O ambiente hostil que qualquer filho recebe. Não é prova — é a segunda
 * fechadura. Uma biblioteca que honre proxy falha; uma que não honre continua a
 * depender da medição do filho.
 */
export function ambienteHostil(base = process.env, porta = PORTA_PROXY_MORTA, { registo = null, sentinela = SENTINELA } = {}) {
  const morto = `http://127.0.0.1:${porta}`;
  // `--require` da sentinela: é o que torna um filho Node mensurável SEM
  // amostragem. Acrescenta-se ao `NODE_OPTIONS` que já exista em vez de o
  // substituir — apagar o do utilizador seria mudar o que se mede.
  // Barras PARA A FRENTE, e não é cosmética: MEDIDO a 2026-08-26, o parser do
  // `NODE_OPTIONS` trata `\` como escape dentro de aspas, e o caminho do Windows
  // chegou ao filho como `C:UsersPaulo Loureiro...` — o knip e o jscpd morreram
  // ambos com `Cannot find module`. O Node aceita barras para a frente no
  // Windows; o parser de opções é que não aceita as invertidas.
  const nodeOptions = registo
    ? `${base.NODE_OPTIONS ? `${base.NODE_OPTIONS} ` : ''}--require "${String(sentinela).split('\\').join('/')}"`
    : base.NODE_OPTIONS;
  return {
    ...base,
    HTTP_PROXY: morto, HTTPS_PROXY: morto, ALL_PROXY: morto,
    http_proxy: morto, https_proxy: morto, all_proxy: morto,
    NO_PROXY: '', no_proxy: '',
    // Desliga a telemetria dos próprios produtores à cabeça. Não substitui a
    // medição: existe para que a medição não tenha de apanhar o óbvio.
    SEMGREP_SEND_METRICS: 'off',
    DO_NOT_TRACK: '1',
    npm_config_offline: 'true',
    ...(registo ? { NODE_OPTIONS: nodeOptions, REDE_ZERO_REGISTO: registo, REDE_ZERO_LOOPBACK_RE: RE_LOOPBACK } : {}),
  };
}

/**
 * Lê o registo que as sentinelas dos filhos escreveram e agrupa-o por PID.
 * Uma linha ilegível é contada, nunca engolida.
 */
export function lerRegistoDosFilhos(caminho, { readImpl = fs.readFileSync } = {}) {
  let bruto;
  try { bruto = String(readImpl(caminho, 'utf8')); } catch { return { porPid: new Map(), partidas: 0 }; }
  const porPid = new Map();
  let partidas = 0;
  for (const linha of bruto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    let e;
    try { e = JSON.parse(linha); } catch { partidas += 1; continue; }
    if (!e || !Number.isInteger(e.pid)) { partidas += 1; continue; }
    if (!porPid.has(e.pid)) porPid.set(e.pid, { carregada: false, saidas: [] });
    const r = porPid.get(e.pid);
    if (e.ev === 'sentinela-carregada') r.carregada = true;
    else if (e.ev === 'saida') r.saidas.push({ api: e.api, alvo: e.alvo });
  }
  return { porPid, partidas };
}

/**
 * Decide o veredicto a partir do que foi registado. Separado de `medirRede`
 * para poder ser testado sem correr nada — é a função que tem de recusar
 * transformar "não medi" em "medi zero".
 */
export function auditar({ chamadas = [], loopback = [], ipc = [], filhos = [], netos = [] } = {}) {
  const naoMedidos = filhos.filter((f) => f.sonda.estado === 'n/d');
  // Um destino visto pela sonda do SO e um destino que a sentinela apanhou
  // DENTRO do filho contam o mesmo: os dois são saída observada.
  const comRemoto = filhos.filter((f) => (f.sonda.remotos || []).length > 0 || (f.sonda.saidas || []).length > 0);

  let rede_zero;
  let porque;
  if (chamadas.length > 0) {
    rede_zero = false;
    porque = `${chamadas.length} tentativa(s) de saída no processo: ${chamadas.map((c) => `${c.api}→${c.alvo}`).join(', ')}`;
  } else if (comRemoto.length > 0) {
    rede_zero = false;
    porque = `${comRemoto.length} filho(s) com destino remoto observado: ${comRemoto.map((f) => `${f.cmd}→${[...(f.sonda.remotos || []), ...(f.sonda.saidas || []).map((x) => x.alvo)].join('/')}`).join(', ')}`;
  } else if (netos.length > 0) {
    // Um processo que a sentinela viu mas que este ramo não registou como filho
    // é um NETO (um filho de um filho). Não se descarta: uma saída é uma saída,
    // venha de que profundidade vier.
    rede_zero = false;
    porque = `${netos.length} saída(s) de processos descendentes: ${netos.map((n) => `pid ${n.pid}→${n.alvo}`).join(', ')}`;
  } else if (naoMedidos.length > 0) {
    rede_zero = null;
    porque = `${naoMedidos.length} de ${filhos.length} filho(s) sem medição — ${naoMedidos.map((f) => `${f.cmd}: ${f.sonda.porque}`).join('; ')}`;
  } else {
    rede_zero = true;
    porque = filhos.length === 0
      ? '0 tentativas de saída no processo e nenhum filho nasceu'
      : `0 tentativas de saída no processo; ${filhos.length} filho(s), todos medidos: `
        + filhos.map((f) => `${f.cmd}=${f.sonda.estado}${f.sonda.estado === 'sondado' ? `(${f.sonda.amostras} amostra(s))` : ''}`).join(', ');
  }

  return {
    rede_zero,
    porque,
    chamadas,
    loopback_permitido: loopback.length,
    ipc_permitido: ipc.length,
    filhos,
    netos,
  };
}

/**
 * Corre `fn` com a instrumentação ligada e devolve `{ resultado, auditoria }`.
 *
 * `fn` recebe um contexto com `registarFilho` — é assim que um adaptador que
 * SABE medir-se a si próprio (o do semgrep, com `unshare -rn`) declara a sua
 * medição em vez de ficar à mercê de uma sonda que não o consegue ver.
 */
export async function medirRede(fn, {
  sondaImpl = null,
  intervaloSondaMs = INTERVALO_SONDA_MS,
  plataforma = process.platform,
  // O registo onde as sentinelas dos filhos escrevem. `null` desliga a
  // sentinela — usado nos testes que querem exercitar SÓ a sonda do SO.
  registo = path.join(os.tmpdir(), `rede-zero-${process.pid}-${Date.now()}.jsonl`),
} = {}) {
  const chamadas = [];
  const loopback = [];
  const ipc = [];
  const filhos = [];

  // Guardadas ANTES de substituir seja o que for: a sonda do SO precisa de
  // nascer sem passar pelo ponto de registo, senão sonda-se a si própria para
  // sempre.
  const spawnOriginal = child_process.spawn;
  const originais = {
    dnsLookup: dns.lookup,
    dnsPromisesLookup: dns.promises.lookup,
    socketConnect: net.Socket.prototype.connect,
    tlsConnect: tls.connect,
    fetch: globalThis.fetch,
    spawn: child_process.spawn,
    spawnSync: child_process.spawnSync,
    execFile: child_process.execFile,
    execFileSync: child_process.execFileSync,
    exec: child_process.exec,
    execSync: child_process.execSync,
  };

  const sonda = sondaImpl || (plataforma === 'win32' ? sondaWindows(spawnOriginal) : null);
  const motivoSemSonda = sondaImpl
    ? null
    : (plataforma === 'win32' ? null : `sem sonda de sockets para a plataforma ${plataforma}`);

  // Duas formas de recusar, e só UMA forma de registar. A separação existe
  // porque a primeira versão deste ficheiro rejeitava as promessas (`fetch`,
  // `dns.promises`) sem passar pelo registo: recusava a chamada e depois dizia
  // `rede_zero: true`, que é a mentira exacta que este ficheiro veio impedir.
  // Apanhado pelo teste de mordida do `fetch`, não pela leitura.
  const anotar = (api, alvo) => {
    chamadas.push({ api, alvo, ts: new Date().toISOString() });
    return new RedeBloqueada(api, alvo);
  };
  const registar = (api, alvo) => { throw anotar(api, alvo); };

  // ── camada 1: as saídas do próprio processo ──────────────────────────────

  dns.lookup = function (hostname, ...resto) {
    if (ehLoopback(hostname)) { loopback.push({ api: 'dns.lookup', alvo: String(hostname) }); return originais.dnsLookup.call(this, hostname, ...resto); }
    return registar('dns.lookup', String(hostname));
  };
  dns.promises.lookup = function (hostname, ...resto) {
    if (ehLoopback(hostname)) { loopback.push({ api: 'dns.promises.lookup', alvo: String(hostname) }); return originais.dnsPromisesLookup.call(this, hostname, ...resto); }
    return Promise.reject(anotar('dns.promises.lookup', String(hostname)));
  };
  net.Socket.prototype.connect = function (...args) {
    const { tipo, alvo } = alvoDoConnect(args);
    if (tipo === 'ipc') { ipc.push({ api: 'net.connect', alvo }); return originais.socketConnect.apply(this, args); }
    if (tipo === 'loopback') { loopback.push({ api: 'net.connect', alvo }); return originais.socketConnect.apply(this, args); }
    return registar('net.connect', alvo);
  };
  tls.connect = function (...args) {
    const { tipo, alvo } = alvoDoConnect(args);
    if (tipo === 'rede') return registar('tls.connect', alvo);
    loopback.push({ api: 'tls.connect', alvo });
    return originais.tlsConnect.apply(this, args);
  };
  globalThis.fetch = function (entrada, ...resto) {
    let alvo = String(entrada && entrada.url ? entrada.url : entrada);
    let host = alvo;
    try { host = new URL(alvo).hostname; } catch { /* url relativa: não é saída */ }
    if (ehLoopback(host)) { loopback.push({ api: 'fetch', alvo }); return originais.fetch.call(globalThis, entrada, ...resto); }
    return Promise.reject(anotar('fetch', alvo));
  };

  // ── camada 2: o ponto único por onde os filhos nascem ────────────────────

  const vivos = new Map(); // pid -> registo

  const novoRegisto = (cmd, args, extra = {}) => {
    const r = {
      cmd: String(cmd),
      args: (args || []).map(String),
      pid: null,
      sonda: { estado: 'n/d', remotos: [], udp_max: 0, amostras: 0, porque: 'ainda não medido' },
      ...extra,
    };
    filhos.push(r);
    return r;
  };

  const declararNaoMedivel = (r, porque) => { r.sonda = { estado: 'n/d', remotos: [], udp_max: 0, amostras: 0, porque }; };

  child_process.spawn = function (cmd, args, opts) {
    const r = novoRegisto(cmd, Array.isArray(args) ? args : []);
    const filho = originais.spawn.call(this, cmd, args, opts);
    r.pid = filho.pid ?? null;
    if (!sonda) declararNaoMedivel(r, motivoSemSonda || 'sem sonda disponível');
    else if (r.pid === null) declararNaoMedivel(r, 'o processo não devolveu PID');
    else {
      r.sonda = { estado: 'sondado', remotos: [], udp_max: 0, amostras: 0, porque: null };
      vivos.set(r.pid, r);
      filho.on('exit', () => vivos.delete(r.pid));
      filho.on('error', () => vivos.delete(r.pid));
    }
    return filho;
  };

  // As variantes síncronas bloqueiam o event loop: não há como sondar o PID
  // enquanto correm. Ficam registadas e declaradas `n/d` — o que empurra
  // `rede_zero` para `null` e força quem as usa a mudar para `spawn`.
  const marcarSincrono = (nome, orig) => function (cmd, args, ...resto) {
    const r = novoRegisto(cmd, Array.isArray(args) ? args : []);
    declararNaoMedivel(r, `${nome} é síncrono: o PID não é sondável enquanto corre`);
    return orig.call(this, cmd, args, ...resto);
  };
  child_process.spawnSync = marcarSincrono('spawnSync', originais.spawnSync);
  child_process.execFileSync = marcarSincrono('execFileSync', originais.execFileSync);
  child_process.execFile = function (cmd, args, ...resto) {
    const r = novoRegisto(cmd, Array.isArray(args) ? args : []);
    declararNaoMedivel(r, 'execFile não expõe o PID a tempo de o sondar; usa spawn');
    return originais.execFile.call(this, cmd, args, ...resto);
  };
  child_process.exec = function (linha, ...resto) {
    const r = novoRegisto(linha, []);
    declararNaoMedivel(r, 'exec passa por uma shell e não é sondável; usa spawn');
    return originais.exec.call(this, linha, ...resto);
  };
  child_process.execSync = function (linha, ...resto) {
    const r = novoRegisto(linha, []);
    declararNaoMedivel(r, 'execSync é síncrono e passa por uma shell; usa spawn');
    return originais.execSync.call(this, linha, ...resto);
  };

  let aSondar = false;
  const amostrar = async () => {
    if (aSondar || !sonda) return;
    aSondar = true;
    try {
      for (const [pid, r] of [...vivos.entries()]) {
        const v = await sonda(pid);
        if (!v) continue;
        r.sonda.amostras += 1;
        for (const a of v.remotos) if (!r.sonda.remotos.includes(a)) r.sonda.remotos.push(a);
        r.sonda.udp_max = Math.max(r.sonda.udp_max, v.udp || 0);
      }
    } finally { aSondar = false; }
  };

  const relogio = sonda ? setInterval(() => { amostrar(); }, intervaloSondaMs) : null;
  if (relogio && relogio.unref) relogio.unref();

  let resultado;
  try {
    resultado = await fn({
      // Um adaptador que se mede a si próprio declara-o aqui. É o caminho do
      // semgrep: a tabela de sockets do Windows não vê para dentro do WSL, e
      // sondar `wsl.exe` daria um zero cego.
      declararFilhoMedido: ({ cmd, args = [], estado, porque, amostras = 1 }) => {
        const r = novoRegisto(cmd, args, { declarado: true });
        r.sonda = { estado, remotos: [], udp_max: 0, amostras, porque };
        return r;
      },
      ambiente: ambienteHostil(process.env, PORTA_PROXY_MORTA, { registo }),
    });
  } finally {
    if (relogio) clearInterval(relogio);
    dns.lookup = originais.dnsLookup;
    dns.promises.lookup = originais.dnsPromisesLookup;
    net.Socket.prototype.connect = originais.socketConnect;
    tls.connect = originais.tlsConnect;
    globalThis.fetch = originais.fetch;
    child_process.spawn = originais.spawn;
    child_process.spawnSync = originais.spawnSync;
    child_process.execFile = originais.execFile;
    child_process.execFileSync = originais.execFileSync;
    child_process.exec = originais.exec;
    child_process.execSync = originais.execSync;
  }

  // A sentinela dos filhos: prova por INTERCEPÇÃO, não por amostragem. Uma
  // linha `sentinela-carregada` com o PID do filho é a prova de que ela correu
  // mesmo lá dentro; sem ela não se conclui nada, porque um ficheiro vazio é
  // igual quer o filho tenha estado calado quer a sentinela nunca tenha entrado.
  const { porPid } = lerRegistoDosFilhos(registo);
  const netos = [];
  const pidsDeFilhos = new Set(filhos.map((f) => f.pid).filter((x) => x !== null));
  for (const r of filhos) {
    const v = r.pid !== null ? porPid.get(r.pid) : null;
    if (!v || !v.carregada) continue;
    r.sonda.saidas = v.saidas;
    r.sonda.instrumentado = true;
    if (r.sonda.estado === 'n/d' || r.sonda.estado === 'sondado') {
      r.sonda.estado = 'instrumentado';
      r.sonda.porque = r.sonda.amostras > 0
        ? `sentinela dentro do processo (${v.saidas.length} saída(s)) + ${r.sonda.amostras} amostra(s) da sonda do SO`
        : `sentinela dentro do processo: ${v.saidas.length} saída(s) de JavaScript interceptada(s)`;
    }
  }
  for (const [pid, v] of porPid) {
    if (pidsDeFilhos.has(pid)) continue;
    for (const sa of v.saidas) netos.push({ pid, ...sa });
  }
  try { fs.unlinkSync(registo); } catch { /* o registo é temporário; apagá-lo não pode falhar a corrida */ }

  // Um filho que nasceu e morreu antes da primeira amostra não foi medido.
  // Dizer `sondado` com zero amostras seria dar por provado o que ninguém viu.
  for (const r of filhos) {
    if (r.sonda.estado === 'sondado' && r.sonda.amostras === 0) {
      declararNaoMedivel(r, 'o processo terminou antes da primeira amostra da sonda');
    }
  }

  return { resultado, auditoria: auditar({ chamadas, loopback, ipc, filhos, netos }) };
}
