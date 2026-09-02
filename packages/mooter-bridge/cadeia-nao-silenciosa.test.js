'use strict';
/**
 * cadeia-nao-silenciosa.test.js — a escalada que falha tem de ficar ESCRITA.
 *
 * ── O DEFEITO, reproduzido a 2026-09-02 com o conector real ─────────────────
 *
 * Wave `preflight-motores-0902b`, cadeia `moo -> kimi`. O job local correu e
 * disse `done`. O job pago NUNCA existiu — e o `mooter_check` respondeu:
 *
 *     {"settled":true, "total":1, "done":1, "failed":0, "cost_note":null}
 *
 * Zero eventos no ledger sobre a escalada. A recusa ia para o `log()` — o
 * stdout do conector — e mais nada. Quem chamou ficou a olhar para um
 * resultado local a acreditar que era o resultado que tinha pedido.
 *
 * ── PORQUE ISTO E UM TESTE E NAO UMA REVISAO DE CODIGO ──────────────────────
 *
 * Um `grep` por `chain_refused` provaria que a string existe. O que tem de
 * ficar provado e outra coisa: que a cadeia REALMENTE escreve o evento quando
 * o segundo despacho e recusado, e que o resultado local sobrevive. Por isso
 * este teste levanta um Ollama de mentira em loopback, corre a preparacao
 * local a serio, e faz o spawn do motor pago rebentar.
 *
 * NADA aqui toca na rede nem no Ollama real: `OLLAMA_HOST` aponta para o stub.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cadeia-'));
process.env.MOOTER_HOME = path.join(TMP, 'mooter-home');
// Sem isto o guard recusa a worktree por estar fora da raiz permitida — e a
// recusa do guard nao e o que este teste quer medir.
process.env.MOOTER_WORKTREE_ROOT = TMP;

const WT = path.join(TMP, 'wt');
fs.mkdirSync(WT, { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: WT });
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: WT });

/** Um Ollama de mentira: tres rotas, o suficiente para a preparacao local correr. */
const stub = http.createServer((req, res) => {
  if (req.url === '/api/tags') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b', size: 1.9e9, details: { family: 'qwen2' } }] }));
  }
  if (req.url === '/api/ps') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ models: [] }));
  }
  if (req.url === '/api/chat') {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ message: { content: 'brief local' }, done: false })}\n`);
    return res.end(`${JSON.stringify({ done: true, eval_count: 5, prompt_eval_count: 10 })}\n`);
  }
  res.writeHead(404); return res.end('{}');
});

let pass = 0;
function t(nome, fn) {
  try { fn(); console.log(`  ok  ${nome}`); pass += 1; }
  catch (e) { console.log(`  FAIL ${nome}\n       ${(e && e.message) || e}`); process.exitCode = 1; }
}

stub.listen(0, '127.0.0.1', async () => {
  process.env.OLLAMA_HOST = `127.0.0.1:${stub.address().port}`;
  const seam = require('./seamless.js');
  // O motor pago nao arranca — exactamente o `spawn codex ENOENT` medido.
  seam.setJobSpawner(() => { throw new Error('binario inexistente (simulado)'); });

  const r = await seam.toolWork({ agent: 'cc', worktree: WT, goal: 'faz X', wave: 'cadeia-t', pre_digest: true });

  console.log('\ncadeia — uma escalada que falha nao pode desaparecer');
  t('a cadeia arranca: o local prepara, o pago vem a seguir', () => {
    assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 200));
    assert.strictEqual(r.chained, true);
    assert.strictEqual(r.agent, 'moo → cc');
  });

  // O evento nasce num setImmediate depois do job local fechar.
  await new Promise((s) => setTimeout(s, 6000));

  const linhas = fs.readFileSync(path.join(process.env.MOOTER_HOME, 'ledger.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const eventos = linhas.map((l) => l.event);
  const recusa = linhas.filter((l) => l.event === 'chain_refused');

  t('o trabalho LOCAL sobrevive — ele foi feito e foi pago a $0', () => {
    assert.ok(eventos.includes('done'), `sem evento done: ${eventos.join(',')}`);
    const done = linhas.find((l) => l.event === 'done');
    assert.strictEqual(done.agent, 'moo');
    assert.strictEqual(done.cost_usd, 0);
  });

  t('a recusa da escalada FICA no ledger — era isto que nao acontecia', () => {
    assert.strictEqual(recusa.length, 1, `${recusa.length} eventos chain_refused em ${eventos.join(',')}`);
  });

  t('a recusa diz PARA ONDE ia e PORQUE nao foi', () => {
    const e = recusa[0];
    assert.strictEqual(e.escalada_para, 'cc');
    assert.match(e.nota, /escalada indisponivel/);
    assert.match(e.porque, /binario inexistente/);
  });

  t('a recusa esta presa ao job que a originou — senao nao se sabe de quem e', () => {
    assert.strictEqual(recusa[0].job_id, r.job_id);
    assert.strictEqual(recusa[0].wave, 'cadeia-t');
  });

  stub.close();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
  console.log(`\n${pass} testes de cadeia${process.exitCode ? ' — COM FALHAS' : ' — tudo verde'}\n`);
});
