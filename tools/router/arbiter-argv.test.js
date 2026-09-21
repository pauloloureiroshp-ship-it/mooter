// arbiter-argv.test.js — MP4-a bug B (2026-09-21): callHaikuSync lia process.argv[2]/[3] no filho `node -e`,
// mas `node -e script a b` da argv = [node, a, b] — o corpo era a chave e a chave era undefined, logo o pedido
// nunca chegava valido a api.anthropic.com e o arbiter Haiku era um no-op MESMO COM CHAVE. Este teste:
//   (1) reproduz a forma do argv;  (2) faz o callHaikuSync real chegar a um servidor local a fingir a
//   Anthropic (um preload no filho desvia https.request para http://127.0.0.1:<porta>) e verifica x-api-key
//   e corpo;  (3) garante que o caminho _mockResponse nao mudou.
// O servidor falso corre NOUTRO processo: o arbitrate() usa spawnSync, que bloqueia o event loop de quem o
// chama — um servidor no mesmo processo nunca responderia (medido: TIMEOUT com o pedido ja recebido).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { arbitrate } = require('./arbiter.js');

test('(1) em `node -e`, o 1.o argumento e process.argv[1] e o 2.o e argv[2] — nao [2]/[3]', () => {
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', 'BODY', 'KEY'], { encoding: 'utf8' });
  assert.deepStrictEqual(JSON.parse(r.stdout), ['BODY', 'KEY']);
});

test('(2) callHaikuSync real: x-api-key chega e o corpo e o JSON do pedido (servidor local a fingir a Anthropic)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argv-test-'));
  const seenFile = path.join(dir, 'seen.json');
  // servidor falso num processo proprio; grava o que recebe em seen.json e responde como a Anthropic
  const serverJs = path.join(dir, 'server.cjs');
  fs.writeFileSync(serverJs, `const http = require('http'); const fs = require('fs');
const srv = http.createServer((req, res) => { let d = ''; req.on('data', (x) => { d += x; }); req.on('end', () => {
  fs.writeFileSync(${JSON.stringify(seenFile)}, JSON.stringify({ headers: req.headers, body: d }));
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ type: 'message', content: [{ type: 'text', text: '{"tier":"T2","subagent":"model-reasoner","reasoning":"argv fix"}' }] })); }); });
srv.listen(0, '127.0.0.1', () => process.stdout.write(String(srv.address().port) + '\\n'));
setTimeout(() => process.exit(0), 20000);`);
  const child = spawn(process.execPath, [serverJs], { stdio: ['ignore', 'pipe', 'ignore'] });
  const port = await new Promise((resolve) => { let s = ''; child.stdout.on('data', (d) => { s += d; if (s.includes('\n')) resolve(Number(s.trim())); }); });
  // preload para o FILHO do arbiter (herda NODE_OPTIONS): https.request -> http.request no servidor local
  const preload = path.join(dir, 'preload.cjs');
  fs.writeFileSync(preload, `const https = require('https'); const http = require('http');
https.request = (opts, cb) => http.request({ ...opts, hostname: '127.0.0.1', port: ${port}, protocol: 'http:' }, cb);`);
  const saved = { NODE_OPTIONS: process.env.NODE_OPTIONS, MOOTER_ARBITER_DISABLE: process.env.MOOTER_ARBITER_DISABLE, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  process.env.NODE_OPTIONS = `--require ${preload.split('\\').join('/')}`; // caminho 8.3 do tmpdir, sem espacos
  delete process.env.MOOTER_ARBITER_DISABLE;
  process.env.ANTHROPIC_API_KEY = 'chave-de-teste-local';
  try {
    const d = arbitrate('investiga porque e que o websocket reconnect falha as vezes (argv test)', { _skipCache: true });
    assert.ok(d, 'o arbiter devolveu uma decisao pelo caminho real');
    assert.strictEqual(d.tier, 'T2');
    const seen = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
    assert.strictEqual(seen.headers['x-api-key'], 'chave-de-teste-local', 'a chave chega no header');
    const body = JSON.parse(seen.body);
    assert.strictEqual(body.model, process.env.ARBITER_MODEL || 'claude-haiku-4-5-20251001');
    assert.strictEqual(body.messages[0].content, 'investiga porque e que o websocket reconnect falha as vezes (argv test)');
    assert.ok(typeof body.system === 'string' && body.system.length > 100, 'o system prompt vai no corpo');
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    child.kill();
  }
});

test('(3) o caminho _mockResponse nao mudou', () => {
  const saved = process.env.MOOTER_ARBITER_DISABLE; delete process.env.MOOTER_ARBITER_DISABLE;
  try {
    const d = arbitrate('gera commit message (mock)', { _skipCache: true, _mockResponse: JSON.stringify({ content: [{ text: '{"tier":"T1","subagent":"cheap-triage","reasoning":"mock"}' }] }) });
    assert.deepStrictEqual({ tier: d.tier, subagent: d.subagent, cached: d.cached }, { tier: 'T1', subagent: 'cheap-triage', cached: false });
  } finally { if (saved === undefined) delete process.env.MOOTER_ARBITER_DISABLE; else process.env.MOOTER_ARBITER_DISABLE = saved; }
});
