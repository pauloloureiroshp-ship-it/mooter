// net-tap.cjs — preload (NODE_OPTIONS=--require) que regista TODAS as ligacoes
// de saida de um processo Node e dos seus filhos Node: http, https, fetch
// (undici), tls, tudo passa por net.Socket.connect. Conta bytes escritos e
// lidos por ligacao. Nunca le conteudo.
//
//   NET_TAP_OUT=<ficheiro.jsonl>   uma linha por ligacao (append)
//   NET_TAP_BLOCK=1                recusa qualquer destino fora do loopback
//                                  (o processo ve ECONNREFUSED; nada sai)
//
// E a resposta a «o que sai da maquina?» que nao depende de o processo honrar
// HTTPS_PROXY (o https.request do Node nao honra).
'use strict';
const net = require('net');
const fs = require('fs');
const tls = require('tls');

const OUT = process.env.NET_TAP_OUT;
const BLOCK = process.env.NET_TAP_BLOCK === '1';
const LOOPBACK = /^(127\.|::1$|localhost$|0\.0\.0\.0$)/;

function record(rec) {
  if (!OUT) return;
  try { fs.appendFileSync(OUT, JSON.stringify(rec) + '\n'); } catch { /* nunca partir o processo */ }
}

function argsToTarget(args) {
  // O agente http/https chama connect com a forma NORMALIZADA: args[0] e um
  // array [options, cb] (net.js normalizeArgs). Medido 2026-09-09: sem isto o
  // loopback do http.get aparecia como host '?' e era bloqueado.
  let a = args[0];
  if (Array.isArray(a)) a = a[0];
  if (a && typeof a === 'object' && !Array.isArray(a)) return { host: a.host || a.hostname || (a.path ? 'ipc' : '?'), port: Number(a.port || 0), path: a.path || null };
  if (typeof a === 'number') return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: a, path: null };
  if (typeof a === 'string') return { host: 'ipc', port: 0, path: a };
  return { host: '?', port: 0, path: null };
}

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function tappedConnect(...args) {
  const t = argsToTarget(args);
  const rec = { pid: process.pid, at: new Date().toISOString(), host: t.host, port: t.port, ipc: !!t.path, bytes_out: 0, bytes_in: 0, blocked: false, argv1: process.argv[1] ? String(process.argv[1]).split(/[\\/]/).pop() : null };
  const external = !t.path && !LOOPBACK.test(String(t.host));
  if (BLOCK && external) {
    rec.blocked = true; record(rec);
    const sock = this;
    process.nextTick(() => { const e = new Error(`net-tap: bloqueado ${t.host}:${t.port}`); e.code = 'ECONNREFUSED'; sock.destroy(e); });
    return this;
  }
  // Contagem pelos contadores do proprio socket, lidos no fecho: o http do Node
  // escreve por caminhos que um wrapper de write nao ve (medido: 0 bytes).
  const sock = this;
  this.once('close', () => { rec.bytes_out = Number(sock.bytesWritten || 0); rec.bytes_in = Number(sock.bytesRead || 0); record(rec); });
  return origConnect.apply(this, args);
};
// tls.connect cria um net.Socket e chama connect — coberto. Fica so o registo de que o tap esta activo.
record({ pid: process.pid, at: new Date().toISOString(), event: 'tap-loaded', block: BLOCK, argv1: process.argv[1] ? String(process.argv[1]).split(/[\\/]/).pop() : null });
void tls;
