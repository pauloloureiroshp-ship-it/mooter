/**
 * moo-visual-ratchet.test.mjs — as mordidas do ratchet do auditor visual.
 *
 * O auditor mede bem desde 2026-08-29 e não travava nada: só corria quando
 * alguém o corria à mão. O ratchet é a peça que o põe a impedir — e um ratchet
 * sem mordida é um ficheiro que DIZ que trava.
 *
 * O que estes testes fixam, por ordem de perigo:
 *   · piorar tem de chumbar (o óbvio, e o menos provável de partir);
 *   · uma prancha que DESAPARECE tem de chumbar — foi assim que os `.svg`
 *     viveram invisíveis até 2026-08-27 e que o `moo-visual-audit.test.mjs`
 *     ficou fora do `test:design` até 2026-08-29. Um âmbito que estreita
 *     parece sempre uma melhoria no total;
 *   · uma prancha NOVA com defeitos não pode entrar com a sua própria base,
 *     senão acrescentar uma folha legaliza os seus defeitos no acto;
 *   · `--promover` só desce.
 *
 *   node --test design/tools/moo-visual-ratchet.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RATCHET = join(AQUI, 'moo-visual-ratchet.mjs');
const TEM_PW = existsSync(join(AQUI, 'node_modules', 'playwright'));

const LIMPA = `<!doctype html><meta charset="utf-8"><title>x</title>
<style>body{background:#fff}.t{color:#111;font-size:14px}</style><p class="t">texto</p>`;

const SUJA = `<!doctype html><meta charset="utf-8"><title>x</title>
<style>body{background:#fff}.t{color:#bbb;font-size:14px}</style><p class="t">texto</p>`;

/** Monta canvas + folhas + base, corre o ratchet, devolve saída e código. */
function correr({ folhas, base = null, args = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'moo-rat-'));
  for (const [nome, html] of Object.entries(folhas)) writeFileSync(join(dir, nome), html);
  const canvas = join(dir, 'canvas.json');
  writeFileSync(canvas, JSON.stringify({
    artboards: Object.keys(folhas).map((f) => ({
      name: f.replace('.html', ''), page: 'teste', file: f, w: 800, h: 600, scroll: true,
    })),
  }));
  const baseP = join(dir, 'base.json');
  if (base) writeFileSync(baseP, JSON.stringify(base, null, 2));

  let out = '', status = 0;
  try {
    out = execFileSync(process.execPath, [RATCHET, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MOO_AUDIT_CANVAS: canvas, MOO_AUDIT_OUT: join(dir, 'a.json'), MOO_VISUAL_BASE: baseP },
    });
  } catch (e) { status = e.status; out = (e.stdout ?? '') + (e.stderr ?? ''); }
  const baseFinal = existsSync(baseP) ? JSON.parse(readFileSync(baseP, 'utf8')) : null;
  rmSync(dir, { recursive: true, force: true });
  return { out, status, base: baseFinal };
}

const ZERO = { contraste: 0, overflowX: 0, easing: 0, raio: 0, corte: 0 };

test('sem base, cria-a e não chumba', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const r = correr({ folhas: { 'x.html': SUJA }, args: ['--ci'] });
  assert.equal(r.status, 0, 'a primeira corrida não tem contra o que comparar');
  assert.match(r.out, /linha de base criada/);
  assert.ok(r.base['x · n/d'].contraste > 0, 'a base regista o que existe, incluindo o que está mal');
});

test('igual à base: exit 0', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const r = correr({ folhas: { 'x.html': LIMPA }, base: { 'x · n/d': ZERO }, args: ['--ci'] });
  assert.equal(r.status, 0);
  assert.match(r.out, /sem alterações/);
});

test('MORDIDA · piorar chumba, e diz em que métrica', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const r = correr({ folhas: { 'x.html': SUJA }, base: { 'x · n/d': ZERO }, args: ['--ci'] });
  assert.equal(r.status, 1, 'um achado novo passou pelo ratchet');
  assert.match(r.out, /contraste: 0 →/);
});

test('melhorar passa, e convida a travar o novo mínimo', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const r = correr({ folhas: { 'x.html': LIMPA }, base: { 'x · n/d': { ...ZERO, contraste: 3 } }, args: ['--ci'] });
  assert.equal(r.status, 0);
  assert.match(r.out, /contraste: 3 → 0/);
  assert.match(r.out, /promover/);
});

test('MORDIDA · uma prancha que DESAPARECE chumba — estreitar não é melhorar', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  /* O total desceria (menos linhas, menos defeitos) e pareceria uma melhoria.
     É a forma mais silenciosa de um portão deixar de ver: tirar-lhe o alvo. */
  const r = correr({
    folhas: { 'x.html': LIMPA },
    base: { 'x · n/d': ZERO, 'sumida · claro': ZERO },
    args: ['--ci'],
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /sumida · claro — desapareceu da medição/);
});

test('MORDIDA · uma prancha NOVA com defeitos não se legaliza a si própria', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  /* Se uma medição nova entrasse com a sua própria contagem como base,
     acrescentar uma folha ao canvas seria a maneira de aprovar os seus defeitos
     no momento em que nascem. */
  const r = correr({
    folhas: { 'x.html': LIMPA, 'nova.html': SUJA },
    base: { 'x · n/d': ZERO },
    args: ['--ci'],
  });
  assert.equal(r.status, 1);
  assert.match(r.out, /nova · n\/d · contraste: nova/);
});

test('`--promover` só DESCE — nunca acomoda uma piora', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  // base a 3, real a 0 -> desce
  const desce = correr({ folhas: { 'x.html': LIMPA }, base: { 'x · n/d': { ...ZERO, contraste: 3 } }, args: ['--promover'] });
  assert.equal(desce.base['x · n/d'].contraste, 0);

  // base a 0, real com defeito -> a base NÃO sobe (senão promover apagava o defeito)
  const sobe = correr({ folhas: { 'x.html': SUJA }, base: { 'x · n/d': ZERO }, args: ['--promover'] });
  assert.equal(sobe.base['x · n/d'].contraste, 0,
    '`--promover` subiu a base para acomodar um defeito — é a régua a mexer-se');
});

test('MORDIDA · a recusa do auditor passa À FRENTE do ratchet, não é diluída', () => {
  /* Sem `skip`: um canvas com vocabulário inválido é recusado ANTES do browser.
     Se o ratchet engolisse o exit 2 e reportasse «sem alterações», um canvas
     partido passava por um canvas limpo. */
  const dir = mkdtempSync(join(tmpdir(), 'moo-rat-'));
  const canvas = join(dir, 'canvas.json');
  writeFileSync(join(dir, 'x.html'), LIMPA);
  writeFileSync(canvas, JSON.stringify({
    artboards: [{ name: 'x', page: 't', file: 'x.html', w: 800, h: 600, temas: ['dark'] }],
  }));
  let status = 0, out = '';
  try {
    execFileSync(process.execPath, [RATCHET, '--ci'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MOO_AUDIT_CANVAS: canvas, MOO_AUDIT_OUT: join(dir, 'a.json'), MOO_VISUAL_BASE: join(dir, 'b.json') },
    });
  } catch (e) { status = e.status; out = (e.stdout ?? '') + (e.stderr ?? ''); }
  rmSync(dir, { recursive: true, force: true });
  assert.equal(status, 2, 'o exit 2 do auditor tem de chegar cá fora inteiro');
  assert.match(out, /não há números para comparar/);
});
