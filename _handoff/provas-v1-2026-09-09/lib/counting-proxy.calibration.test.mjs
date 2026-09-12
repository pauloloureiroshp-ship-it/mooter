// counting-proxy.calibration.test.mjs — calibracao do contador com volumes CONHECIDOS (ataque P5-17 da ronda 2):
// um tunel CONNECT para um eco TCP local; escrevem-se N bytes e le-se o eco; o contador tem de dar exactamente N em cada
// sentido (bytes_out = cliente->upstream, bytes_in = upstream->cliente), sem dupla contagem e sem contar a resposta do proxy.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { startCountingProxy } from './counting-proxy.mjs';

function echoServer() { return new Promise((res) => { const s = net.createServer((c) => c.pipe(c)); s.listen(0, '127.0.0.1', () => res({ port: s.address().port, close: () => new Promise((r) => s.close(r)) })); }); }

test('calibracao: N bytes por um tunel CONNECT contam exactamente N em cada sentido', async () => {
  const echo = await echoServer();
  const p = await startCountingProxy({ block: false });
  const N = 100_000; const payload = Buffer.alloc(N, 0x61);
  const u = new URL(p.url);
  const got = await new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: Number(u.port), method: 'CONNECT', path: `127.0.0.1:${echo.port}` });
    req.on('connect', (res, socket) => {
      assert.equal(res.statusCode, 200);
      let seen = 0; socket.on('data', (c) => { seen += c.length; if (seen >= N) { socket.end(); } });
      socket.on('close', () => resolve(seen)); socket.on('error', reject);
      socket.write(payload);
    });
    req.on('error', reject); req.end();
  });
  await new Promise((r) => setTimeout(r, 200));
  const rep = p.report(); await p.close(); await echo.close();
  assert.equal(got, N, 'o eco tinha de devolver N bytes');
  assert.equal(rep.total_connections, 1);
  const c = rep.connections[0];
  assert.equal(c.host, '127.0.0.1'); assert.equal(c.port, echo.port);
  assert.equal(c.bytes_out, N, `bytes_out ${c.bytes_out} != ${N} (dupla contagem ou cabecalho do CONNECT a entrar)`);
  assert.equal(c.bytes_in, N, `bytes_in ${c.bytes_in} != ${N}`);
});

test('calibracao: CONNECT recusado (upstream fechado) fica registado com 0 bytes de tunel, nao como tunel estabelecido com dados', async () => {
  const p = await startCountingProxy({ block: false });
  const u = new URL(p.url);
  const dead = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => res(port)); }); });
  await new Promise((resolve) => {
    const req = http.request({ host: u.hostname, port: Number(u.port), method: 'CONNECT', path: `127.0.0.1:${dead}` });
    req.on('connect', (res, socket) => { socket.on('close', resolve); socket.on('error', resolve); socket.end(); });
    req.on('response', (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', resolve); req.end();
  });
  await new Promise((r) => setTimeout(r, 300));
  const rep = p.report(); await p.close();
  assert.equal(rep.total_connections, 1, 'a tentativa fica registada');
  assert.equal(rep.connections[0].bytes_in, 0, 'nada veio do upstream');
  assert.ok(rep.connections[0].bytes_out <= 0, `bytes_out ${rep.connections[0].bytes_out}: nao ha dados de tunel num CONNECT recusado`);
});
