'use strict';
/**
 * preview.test.js — v1.6: o Live Preview encontra-se sozinho, e nao mente.
 *
 * Cada teste aqui e' um achado da auditoria do Codex (2026-07-26) sobre o
 * desenho do scanner de portas, ou uma decisao de UX do Opus sobre o painel.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MOOTER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-prev-'));
const pv = require('./preview.js');

function servir(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve({ s, porta: s.address().port }));
  });
}

test('P1 — reconhece um dev server Vite pelos sinais, nao pela porta', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end('<html><head><script type="module" src="/@vite/client"></script></head><body><div id="root"></div></body></html>');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.ok(r.escolhida, 'nao encontrou um Vite a servir HTML: ' + r.nota);
    assert.strictEqual(r.escolhida.porta, porta);
    assert.strictEqual(r.escolhida.confianca, 'alta');
    assert.ok(r.escolhida.sinais.includes('Vite'));
  } finally { s.close(); }
});

test('P2 — uma API que devolve JSON nao e a tua app', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'application/json');
    r.end('{"ok":true}');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.strictEqual(r.escolhida, null, 'ofereceu uma API JSON como se fosse a app');
  } finally { s.close(); }
});

test('P3 — o Ollama responde HTML e continua a NAO ser a tua app', async () => {
  // ⚠️ a 11434 responde "Ollama is running" em text/plain ou html conforme a
  // versao. Mostra-la no preview seria pior do que nao mostrar nada.
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end('<html><body>Ollama is running</body></html>');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.strictEqual(r.escolhida, null);
    assert.ok(r.descartadas && r.descartadas.length, 'descartou em silencio, sem dizer porque');
    assert.ok(/Ollama/i.test(r.descartadas[0].porque));
  } finally { s.close(); }
});

test('P4 — ACHADO CODEX: um servidor que recusa iframe nao pode ser oferecido', async () => {
  // descobrir uma porta que o iframe vai rejeitar e' pior do que nao descobrir:
  // parece que funcionou e o utilizador fica com um rectangulo branco.
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.setHeader('x-frame-options', 'DENY');
    r.end('<html><head><script src="/@vite/client"></script></head><body></body></html>');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.strictEqual(r.escolhida, null, 'ofereceu um servidor que vai recusar ser embebido');
    assert.ok(/embebid/i.test(r.descartadas[0].porque), 'nao explicou que o problema e o enquadramento');
  } finally { s.close(); }
});

test('P5 — frame-ancestors que PERMITE localhost continua a servir', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.setHeader('content-security-policy', "frame-ancestors 'self' http://localhost:*");
    r.end('<html><head><script src="/@vite/client"></script></head><body></body></html>');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.ok(r.escolhida, 'descartou um servidor que PERMITE ser embebido: ' + r.nota);
  } finally { s.close(); }
});

test('P6 — nada a ouvir: diz o que fez e o que fazer, sem culpar o utilizador', async () => {
  const r = await pv.descobrir({ portas: [59999], timeout_ms: 200 });
  assert.strictEqual(r.escolhida, null);
  assert.ok(/npm run dev/.test(r.nota), 'a mensagem tem de dizer o proximo passo concreto');
  assert.ok(/127\.0\.0\.1 e ::1/.test(r.nota), 'nao diz que tambem procurou em IPv6');
});

test('P7 — a memoria poe a porta que funcionou a frente', async () => {
  const antes = pv.lembrar(4321);
  assert.ok(antes.ok);
  assert.strictEqual(antes.ultima, 4321);
  const mem = JSON.parse(fs.readFileSync(pv.MEM, 'utf8'));
  assert.strictEqual(mem.ultima, 4321);
  assert.strictEqual(mem.historico['4321'], 1);
  pv.lembrar(4321);
  assert.strictEqual(JSON.parse(fs.readFileSync(pv.MEM, 'utf8')).historico['4321'], 2);
});

test('P8 — a sonda nunca lanca, mesmo com uma porta absurda', async () => {
  const r = await pv.sondar(70000, 100);
  assert.ok(r && r.viva === false, 'uma porta invalida tem de devolver, nao rebentar');
  assert.strictEqual(pv.lembrar(70000).ok, false);
});

test('P9 — ACHADO CODEX: ECONNREFUSED e ausencia clara; timeout nao e', async () => {
  const r = await pv.sondar(59998, 150);
  // a distincao tem de existir no resultado, senao nao se pode tentar outra vez
  assert.ok('recusada' in r || r.erro, 'sem distinguir recusa de timeout, um dev server a arrancar fica perdido');
});

test('P10 — retrato só lança o browser depois de uma resposta HTTP boa', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end('<html><body>app viva</body></html>');
  });
  let capturas = 0;
  try {
    const r = await pv.retrato('http://localhost:' + porta, {
      sonda_timeout_ms: 900,
      capturarImpl: async (candidato, url, ficheiro) => {
        capturas++;
        const png = Buffer.alloc(25);
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
        fs.writeFileSync(ficheiro, png);
        return { encontrado: true, erro: null };
      },
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(capturas, 1);
  } finally { s.close(); }
});

test('P11 — retrato recusa uma porta morta sem lançar o browser', async () => {
  const { s, porta } = await servir((q, r) => r.end('provisório'));
  await new Promise((resolve) => s.close(resolve));
  let capturas = 0;
  const r = await pv.retrato('http://localhost:' + porta, {
    sonda_timeout_ms: 200,
    capturarImpl: async () => { capturas++; return { encontrado: true, erro: null }; },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, null);
  assert.match(r.erro, /ECONNREFUSED|recus/i);
  assert.match(r.erro, /não capturei/);
  assert.strictEqual(capturas, 0);
});

test('P12 — retrato recusa HTTP 500 com o status literal e sem browser', async () => {
  const { s, porta } = await servir((q, r) => {
    r.statusCode = 500;
    r.setHeader('content-type', 'text/html');
    r.end('<html><body>erro</body></html>');
  });
  let capturas = 0;
  try {
    const r = await pv.retrato('http://localhost:' + porta, {
      sonda_timeout_ms: 900,
      capturarImpl: async () => { capturas++; return { encontrado: true, erro: null }; },
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.status, 500);
    assert.match(r.erro, /HTTP 500/);
    assert.strictEqual(capturas, 0);
  } finally { s.close(); }
});

test('P13 — retrato continua a recusar URLs externas antes do browser', async () => {
  let capturas = 0;
  const r = await pv.retrato('http://evil.example.com:3000/', {
    capturarImpl: async () => { capturas++; return { encontrado: true, erro: null }; },
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /localhost|127\.0\.0\.1/);
  assert.strictEqual(capturas, 0);
});
