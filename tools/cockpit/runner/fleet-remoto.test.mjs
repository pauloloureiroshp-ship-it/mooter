import test from 'node:test';
import assert from 'node:assert/strict';

import { beaconsDoRemoto, FETCH_MIN_MS } from './fleet-remoto.mjs';

const T0 = Date.parse('2026-08-21T13:50:00Z');

/** Um git falso: regista os comandos e responde ao que for preciso. */
function gitFalso({ beacons = {}, upstream = 'origin/main', falharFetch = false } = {}) {
  const chamadas = [];
  const run = (cwd, args) => {
    chamadas.push(args.join(' '));
    const [cmd] = args;
    if (cmd === 'fetch') { if (falharFetch) throw new Error('remoto em baixo'); return ''; }
    if (cmd === 'rev-parse') return upstream;
    if (cmd === 'ls-tree') return Object.keys(beacons).map((n) => '50-fleet/' + n).join('\n');
    if (cmd === 'show') {
      const nome = args[1].split(':50-fleet/')[1];
      if (!(nome in beacons)) throw new Error('nao existe');
      return typeof beacons[nome] === 'string' ? beacons[nome] : JSON.stringify(beacons[nome]);
    }
    throw new Error('comando inesperado: ' + args.join(' '));
  };
  return { run, chamadas };
}
const comGit = (p) => p.endsWith('.git');

test('le os beacons do origin sem tocar na arvore de trabalho', () => {
  const g = gitFalso({ beacons: { 'mac-mini.json': { device: 'mac-mini', ts: '2026-08-21T13:48:31Z' } } });
  const r = beaconsDoRemoto('/vault', { agora: T0, runImpl: g.run, existsImpl: comGit, memo: { ultimoFetchMs: 0 } });
  assert.equal(r.fetch, 'feito');
  assert.equal(r.ref, 'origin/main');
  assert.equal(r.remotos['mac-mini.json'].device, 'mac-mini');
  assert.ok(g.chamadas.some((c) => c.startsWith('fetch --quiet --no-tags origin')));
  assert.ok(!g.chamadas.some((c) => /^(pull|checkout|merge|rebase|add|commit|stash)/.test(c)), 'nada que mexa no vault do dono');
});

test('o fetch e throttled: o painel faz poll, o remoto nao paga por isso', () => {
  const g = gitFalso();
  const memo = { ultimoFetchMs: 0 };
  const a = beaconsDoRemoto('/vault', { agora: T0, runImpl: g.run, existsImpl: comGit, memo });
  const b = beaconsDoRemoto('/vault', { agora: T0 + 1000, runImpl: g.run, existsImpl: comGit, memo });
  const c = beaconsDoRemoto('/vault', { agora: T0 + FETCH_MIN_MS + 1, runImpl: g.run, existsImpl: comGit, memo });
  assert.equal(a.fetch, 'feito');
  assert.equal(b.fetch, 'saltado: recente');
  assert.equal(c.fetch, 'feito');
  assert.equal(g.chamadas.filter((x) => x.startsWith('fetch')).length, 2);
});

test('com index.lock no vault ha outro git a trabalhar: nao se faz fetch, le-se o que ha', () => {
  const g = gitFalso({ beacons: { 'pc.json': { device: 'pc', ts: '2026-08-21T13:40:00Z' } } });
  const r = beaconsDoRemoto('/vault', {
    agora: T0, runImpl: g.run, memo: { ultimoFetchMs: 0 },
    existsImpl: (p) => p.endsWith('.git') || p.endsWith('index.lock'),
  });
  assert.equal(r.fetch, 'saltado: lock');
  assert.equal(r.remotos['pc.json'].device, 'pc');
  assert.ok(!g.chamadas.some((c) => c.startsWith('fetch')));
});

test('um remoto em baixo nao derruba o painel nem vira martelo', () => {
  const g = gitFalso({ falharFetch: true, beacons: { 'pc.json': { device: 'pc', ts: '2026-08-21T13:40:00Z' } } });
  const memo = { ultimoFetchMs: 0 };
  const r = beaconsDoRemoto('/vault', { agora: T0, runImpl: g.run, existsImpl: comGit, memo });
  assert.match(r.fetch, /^falhou: remoto em baixo/);
  assert.equal(r.remotos['pc.json'].device, 'pc', 'o que o remoto ja tinha continua a valer');
  const r2 = beaconsDoRemoto('/vault', { agora: T0 + 1000, runImpl: g.run, existsImpl: comGit, memo });
  assert.equal(r2.fetch, 'saltado: recente', 'a falha marcou o relogio: nao se martela o remoto');
});

test('sem vault git nao ha remoto — e diz-se porque', () => {
  const r = beaconsDoRemoto('/nao-e-git', { agora: T0, runImpl: () => '', existsImpl: () => false });
  assert.deepEqual(r.remotos, {});
  assert.match(r.porque, /nao e um repositorio git/);
});

test('um beacon ilegivel ou sem device no remoto e um device a menos, nunca a frota a menos', () => {
  const g = gitFalso({ beacons: { 'lixo.json': '{nao e json', 'vazio.json': { ts: 'x' }, 'ok.json': { device: 'ok', ts: 'x' } } });
  const r = beaconsDoRemoto('/vault', { agora: T0, runImpl: g.run, existsImpl: comGit, memo: { ultimoFetchMs: 0 } });
  assert.deepEqual(Object.keys(r.remotos), ['ok.json']);
});
