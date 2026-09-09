import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { startCountingProxy } from './counting-proxy.mjs';

test('conta um CONNECT (host, porta, bytes) e bloqueia quando block=true', async () => {
  const p = await startCountingProxy({ block: true });
  // um CONNECT a mao
  await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: p.port, method: 'CONNECT', path: 'example.invalid:443' });
    req.on('connect', (res) => { assert.equal(res.statusCode, 403); resolve(); });
    req.on('error', resolve); req.end();
  });
  const r = p.report();
  assert.equal(r.total_connections, 1);
  assert.equal(r.connections[0].host, 'example.invalid');
  assert.equal(r.connections[0].port, 443);
  assert.equal(r.connections[0].blocked, true);
  await p.close();
});

test('o fetch do Node 24 com NODE_USE_ENV_PROXY=1 passa pelo proxy (o instrumento ve a intencao)', async () => {
  const p = await startCountingProxy({ block: true });
  const r = spawnSync(process.execPath, ['-e', "fetch('https://example.invalid/x').then(()=>console.log('ok'),e=>console.log('err',e.cause&&e.cause.code||e.message))"], { encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: p.url, HTTP_PROXY: p.url, NODE_USE_ENV_PROXY: '1' }, timeout: 20000 });
  const rep = p.report();
  await p.close();
  assert.ok(rep.total_connections >= 1, 'o fetch tinha de ter passado pelo proxy: ' + r.stdout + r.stderr);
  assert.equal(rep.connections[0].host, 'example.invalid');
});

test('um processo que nao fala com a rede deixa 0 ligacoes', async () => {
  const p = await startCountingProxy({ block: true });
  spawnSync(process.execPath, ['-e', 'console.log(1+1)'], { encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: p.url, HTTP_PROXY: p.url, NODE_USE_ENV_PROXY: '1' } });
  assert.equal(p.report().total_connections, 0);
  await p.close();
});
