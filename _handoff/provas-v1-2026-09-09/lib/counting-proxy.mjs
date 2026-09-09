// counting-proxy.mjs — um proxy HTTP/HTTPS(CONNECT) em loopback que CONTA
// hosts e bytes sem ler conteudo. Serve para responder «o que saiu da maquina
// para decidir?» sem confiar em ninguem: o processo sob teste recebe
// HTTP_PROXY/HTTPS_PROXY (e NODE_USE_ENV_PROXY=1 para o fetch do Node 24) e
// tudo o que ele mandar para fora passa por aqui.
//
// Nunca desencripta: num CONNECT ve so o host:porta e o numero de bytes do
// tunel. Num pedido HTTP em claro ve o host e o tamanho.
//
//   import { startCountingProxy } from './counting-proxy.mjs';
//   const p = await startCountingProxy({ block: false });   // block:true recusa tudo (mede a intencao sem deixar sair)
//   ... spawn com env { HTTPS_PROXY: p.url, HTTP_PROXY: p.url, NODE_USE_ENV_PROXY: '1' }
//   p.report()  -> { connections:[{host, port, bytes_out, bytes_in, blocked}], by_host:{...} }
//   await p.close()

import http from 'node:http';
import net from 'node:net';

export async function startCountingProxy({ block = false, host = '127.0.0.1' } = {}) {
  const connections = [];
  const server = http.createServer((req, res) => {
    // pedido HTTP em claro (raro; o que interessa e CONNECT)
    const u = new URL(req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`);
    const rec = { kind: 'http', host: u.hostname, port: Number(u.port || 80), bytes_out: 0, bytes_in: 0, blocked: block, at: new Date().toISOString() };
    connections.push(rec);
    req.on('data', (c) => { rec.bytes_out += c.length; });
    if (block) { req.on('end', () => { res.statusCode = 403; res.end('blocked by counting-proxy'); }); return; }
    const up = http.request({ host: u.hostname, port: u.port || 80, method: req.method, path: u.pathname + u.search, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.on('data', (c) => { rec.bytes_in += c.length; }); r.pipe(res); });
    up.on('error', () => { try { res.statusCode = 502; res.end(); } catch { /* */ } });
    req.pipe(up);
  });
  server.on('connect', (req, clientSocket, head) => {
    const [h, p] = req.url.split(':');
    const rec = { kind: 'connect', host: h, port: Number(p || 443), bytes_out: head.length, bytes_in: 0, blocked: block, at: new Date().toISOString() };
    connections.push(rec);
    if (block) { clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); clientSocket.destroy(); return; }
    const up = net.connect(rec.port, h, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) up.write(head);
      clientSocket.on('data', (c) => { rec.bytes_out += c.length; up.write(c); });
      up.on('data', (c) => { rec.bytes_in += c.length; clientSocket.write(c); });
    });
    const end = () => { try { clientSocket.destroy(); } catch { /* */ } try { up.destroy(); } catch { /* */ } };
    up.on('error', end); clientSocket.on('error', end); up.on('close', end); clientSocket.on('close', end);
  });
  await new Promise((r) => server.listen(0, host, r));
  const url = `http://${host}:${server.address().port}`;
  return {
    url, port: server.address().port,
    report() { const by = {}; for (const c of connections) { const k = `${c.host}:${c.port}`; by[k] = by[k] || { n: 0, bytes_out: 0, bytes_in: 0, blocked: 0 }; by[k].n++; by[k].bytes_out += c.bytes_out; by[k].bytes_in += c.bytes_in; if (c.blocked) by[k].blocked++; } return { connections: connections.slice(), by_host: by, total_connections: connections.length }; },
    close() { return new Promise((r) => server.close(() => r())); },
  };
}
