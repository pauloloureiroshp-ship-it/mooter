'use strict';
/**
 * O contrato entre o extractor e a sua prova.
 *
 * `retrato-mapa.test.js` salta quando a máquina não tem browser, e reconhece
 * esse caso por comparação EXACTA com uma string de `retrato-mapa.js`. Uma
 * string duplicada em dois ficheiros é uma bomba com relógio: alguém reescreve
 * a mensagem no módulo, a comparação deixa de bater, e o salto deixa de
 * acontecer sem ninguém reparar — a prova volta a falhar em toda a máquina sem
 * browser, e o vermelho volta a ser ruído.
 *
 * Este ficheiro não precisa de browser nenhum: lê o código-fonte e verifica que
 * as duas pontas continuam a dizer a mesma coisa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MODULO = fs.readFileSync(path.join(__dirname, 'retrato-mapa.js'), 'utf8');
const PROVA = fs.readFileSync(path.join(__dirname, 'retrato-mapa.test.js'), 'utf8');

const SEM_BROWSER = 'nenhum browser aceitou abrir a porta de depuração';

test('o extractor continua a emitir a razão exacta que a prova reconhece', () => {
  assert.ok(
    MODULO.includes(`'${SEM_BROWSER}'`),
    'retrato-mapa.js deixou de emitir a razão que a prova usa para saltar — '
    + 'actualiza SEM_BROWSER nos dois lados',
  );
});

test('a prova declara a mesma constante, letra a letra', () => {
  assert.ok(
    PROVA.includes(`const SEM_BROWSER = '${SEM_BROWSER}';`),
    'retrato-mapa.test.js já não declara a constante esperada',
  );
});

test('o salto é estreito: só cobre a ausência de browser', () => {
  // A tentação seria saltar em qualquer `!r.ok`. Isso transformaria um extractor
  // partido — DOM mal lido, PNG vazio, zonas a zero — num teste sempre verde.
  assert.ok(
    PROVA.includes('if (r.porque === SEM_BROWSER) {'),
    'a condição de salto tem de comparar a razão exacta, nunca apenas !r.ok',
  );
  assert.ok(
    PROVA.includes("console.log('  FALHA arranque: ' + r.porque);"),
    'qualquer outra razão tem de continuar a falhar',
  );
});

test('o salto é audível e pode ser proibido', () => {
  assert.ok(PROVA.includes("'  SKIP · '"), 'um salto silencioso é indistinguível de um teste que passou');
  assert.ok(PROVA.includes('r.tentados'), 'tem de dizer QUE browsers tentou, senão não se diagnostica');
  assert.ok(
    PROVA.includes("process.env.MOOTER_REQUIRE_BROWSER === '1'"),
    'tem de haver forma de exigir que a prova corra mesmo (CI com browser, ou dúvida)',
  );
});

test('o extractor continua a dizer QUE browsers tentou', () => {
  assert.ok(
    /tentados[,\s]/.test(MODULO),
    'sem a lista de tentativas, o SKIP não explica nada a quem o lê',
  );
});

// ── descoberta de browser ────────────────────────────────────────────────────

const { candidatosBrowser } = require('./retrato-mapa.js');

test('a descoberta conhece as três plataformas, não só o Windows', () => {
  // O bug original: a lista tinha caminhos de `C:\` e os nomes de PATH
  // `chrome`/`msedge`/`chromium`. Nenhum resolve num Mac, onde o Chrome vive
  // dentro de um .app e nunca está no PATH — logo o Live Preview não podia
  // funcionar num Mac, e a prova saltava numa máquina COM Chrome instalado.
  const c = candidatosBrowser();
  assert.ok(c.some((p) => p.includes('/Applications/Google Chrome.app')), 'falta o macOS');
  assert.ok(c.some((p) => p.startsWith('/usr/bin/')), 'falta o Linux');
  assert.ok(c.some((p) => p.endsWith('chrome.exe')), 'falta o Windows');
});

test('a plataforma actual é tentada primeiro', () => {
  const c = candidatosBrowser().filter((p) => p.includes('/') || p.includes('\\'));
  const primeiro = c[0];
  if (process.platform === 'darwin') assert.match(primeiro, /^\/Applications\//);
  else if (process.platform === 'win32') assert.match(primeiro, /\.exe$/);
  else assert.match(primeiro, /^\/usr\/bin\//);
});

test('MOOTER_BROWSER continua a ganhar a tudo', () => {
  const antes = process.env.MOOTER_BROWSER;
  process.env.MOOTER_BROWSER = '/caminho/meu/browser';
  assert.strictEqual(candidatosBrowser()[0], '/caminho/meu/browser');
  if (antes === undefined) delete process.env.MOOTER_BROWSER; else process.env.MOOTER_BROWSER = antes;
});
