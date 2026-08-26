/**
 * rede-zero-sentinela.cjs — a mesma instrumentação, DENTRO do processo filho.
 *
 * Carregada com `--require` via `NODE_OPTIONS`, que o `rede-zero.mjs` põe no
 * ambiente de qualquer filho. Existe porque a sonda de sockets do SO é
 * AMOSTRAGEM, e a amostragem não chega para um processo curto: medido a
 * 2026-08-26, o jscpd sobre `hono` correu em **211 ms** e o knip em **1185 ms**,
 * enquanto uma amostra `Get-NetTCPConnection` custa ~550 ms. A primeira corrida
 * a sério deu `rede_zero: n/d` por isto mesmo — zero amostras em dois filhos.
 * Um `n/d` honesto não é uma prova; é a ausência dela.
 *
 * Aqui não há amostragem: cada tentativa de saída é interceptada no momento em
 * que acontece, escrita no registo e RECUSADA.
 *
 * ⚠️ O QUE ESTA SENTINELA NÃO VÊ, e tem de ficar escrito: só cobre as APIs de
 * JavaScript do processo. Um *addon* nativo carregado por esse processo (é o
 * caso do `jscpd@5`, cujo motor é `jscpd-windows-x64-msvc`) abre sockets sem
 * passar por `net`/`dns`. Para essa camada, a única evidência disponível
 * continua a ser a sonda de sockets do SO por PID — observação, não bloqueio.
 * `auditar()` publica as duas coisas em campos separados exactamente para que
 * ninguém as some numa afirmação que nenhuma das duas sustenta sozinha.
 *
 * NÃO decide o que é loopback. A regra vem do pai em `REDE_ZERO_LOOPBACK_RE`,
 * para não haver duas definições de "sair da máquina" neste repositório.
 */

'use strict';

const fs = require('fs');
const net = require('net');
const dns = require('dns');
const tls = require('tls');

const registo = process.env.REDE_ZERO_REGISTO;
if (registo) {
  const re = new RegExp(process.env.REDE_ZERO_LOOPBACK_RE || '^$', 'i');
  const ehLoopback = (h) => h === undefined || h === null || re.test(String(h).trim().toLowerCase().replace(/^\[|\]$/g, ''));

  const anota = (o) => {
    try { fs.appendFileSync(registo, `${JSON.stringify({ pid: process.pid, ...o })}\n`); } catch { /* um registo que falha não pode matar o filho */ }
  };

  anota({ ev: 'sentinela-carregada', argv: process.argv.slice(1, 3), ts: new Date().toISOString() });

  const erro = (api, alvo) => {
    const e = new Error(`rede-zero: ${api} para ${alvo} recusado dentro do processo filho`);
    e.name = 'RedeBloqueada';
    return e;
  };

  // Mesma leitura de argumentos que o pai faz. Ver `alvoDoConnect` em
  // `rede-zero.mjs`: `net.connect(porta, host)` normaliza ANTES de chegar cá e
  // o que aparece é um array.
  const alvo = (args) => {
    const a0 = args[0];
    if (Array.isArray(a0)) return alvo(a0);
    if (typeof a0 === 'string') return { tipo: 'ipc', alvo: a0 };
    if (a0 && typeof a0 === 'object') {
      if (a0.path) return { tipo: 'ipc', alvo: String(a0.path) };
      const h = a0.host ?? a0.hostname ?? 'localhost';
      return { tipo: ehLoopback(h) ? 'loopback' : 'rede', alvo: `${h}:${a0.port ?? '?'}` };
    }
    const h = typeof args[1] === 'string' ? args[1] : 'localhost';
    return { tipo: ehLoopback(h) ? 'loopback' : 'rede', alvo: `${h}:${a0 ?? '?'}` };
  };

  const lookupOriginal = dns.lookup;
  dns.lookup = function (hostname, ...resto) {
    if (ehLoopback(hostname)) return lookupOriginal.call(this, hostname, ...resto);
    anota({ ev: 'saida', api: 'dns.lookup', alvo: String(hostname) });
    throw erro('dns.lookup', String(hostname));
  };

  const connectOriginal = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const a = alvo(args);
    if (a.tipo !== 'rede') return connectOriginal.apply(this, args);
    anota({ ev: 'saida', api: 'net.connect', alvo: a.alvo });
    throw erro('net.connect', a.alvo);
  };

  const tlsOriginal = tls.connect;
  tls.connect = function (...args) {
    const a = alvo(args);
    if (a.tipo !== 'rede') return tlsOriginal.apply(this, args);
    anota({ ev: 'saida', api: 'tls.connect', alvo: a.alvo });
    throw erro('tls.connect', a.alvo);
  };

  if (typeof globalThis.fetch === 'function') {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = function (entrada, ...resto) {
      const url = String(entrada && entrada.url ? entrada.url : entrada);
      let host = url;
      try { host = new URL(url).hostname; } catch { /* url relativa não sai da máquina */ }
      if (ehLoopback(host)) return fetchOriginal.call(globalThis, entrada, ...resto);
      anota({ ev: 'saida', api: 'fetch', alvo: url });
      return Promise.reject(erro('fetch', url));
    };
  }
}
