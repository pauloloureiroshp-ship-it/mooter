import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TAP = path.join(path.dirname(fileURLToPath(import.meta.url)), 'net-tap.cjs').split('\\').join('/');
const run = (code, extra = {}) => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nettap-')), 'tap.jsonl');
  const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 30000, env: { ...process.env, NODE_OPTIONS: `--require "${TAP}"`, NET_TAP_OUT: out, ...extra } });
  const recs = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => !x.event) : [];
  return { r, recs };
};

test('https.request para fora e registado com host e porta, e bloqueado com NET_TAP_BLOCK=1', () => {
  const { r, recs } = run("require('https').request({host:'example.invalid',port:443,path:'/'},()=>{}).on('error',e=>console.log('err',e.code)).end()", { NET_TAP_BLOCK: '1' });
  assert.ok(/err ECONNREFUSED/.test(r.stdout), 'o processo tinha de ver ECONNREFUSED: ' + r.stdout + r.stderr);
  assert.equal(recs.length, 1); assert.equal(recs[0].host, 'example.invalid'); assert.equal(recs[0].port, 443); assert.equal(recs[0].blocked, true);
});

test('fetch (undici) para fora tambem passa pelo tap', () => {
  const { recs } = run("fetch('https://example.invalid/').then(()=>console.log('ok'),e=>console.log('err'))", { NET_TAP_BLOCK: '1' });
  assert.ok(recs.some((x) => x.host === 'example.invalid' && x.blocked), JSON.stringify(recs));
});

test('loopback nao e bloqueado e os bytes sao contados', () => {
  const code = "const http=require('http');const s=http.createServer((q,res)=>res.end('pong')).listen(0,'127.0.0.1',()=>{http.get({host:'127.0.0.1',port:s.address().port,path:'/'},r=>{r.on('data',()=>{});r.on('end',()=>{s.close();setTimeout(()=>{},50)})})})";
  const { recs } = run(code, { NET_TAP_BLOCK: '1' });
  const c = recs.find((x) => x.host === '127.0.0.1');
  assert.ok(c, 'tinha de haver uma ligacao loopback registada: ' + JSON.stringify(recs));
  assert.equal(c.blocked, false); assert.ok(c.bytes_out > 0 && c.bytes_in > 0);
});

test('um processo mudo deixa 0 ligacoes', () => {
  const { recs } = run('console.log(2)', { NET_TAP_BLOCK: '1' });
  assert.equal(recs.length, 0);
});
