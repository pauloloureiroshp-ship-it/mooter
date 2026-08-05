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

/**
 * ⚠️ Caminhos com forma de Windows, de propósito, e que NUNCA tocam o disco.
 * O `dono.js` só reconhece caminhos absolutos de Windows (`C:\\...`) porque é
 * de linhas de comandos do `Win32_Process` que eles vêm. Um teste escrito com
 * `os.tmpdir()` passaria em Windows e falharia em Linux — sem que o código
 * tivesse nada de errado. A mistura de `/` e `\\` abaixo é a real: a lista de
 * worktrees vem com `/`, a linha de comandos vem com `\\`.
 */
const PASTA_A = 'C:/Users/Paulo Loureiro/frugal-teste-a';
const PASTA_B = 'C:/Users/Paulo Loureiro/frugal-teste-b';

test('P7 — a memoria e POR PASTA, nao global a maquina', async () => {
  const antes = pv.lembrar(4321, PASTA_A);
  assert.ok(antes.ok);
  assert.strictEqual(antes.ultima, 4321);
  assert.strictEqual(antes.escopo, 'esta pasta');
  const mem = JSON.parse(fs.readFileSync(pv.MEM, 'utf8'));
  const daA = pv.memoriaDaPasta(mem, PASTA_A);
  assert.strictEqual(daA.ultima, 4321);
  assert.strictEqual(daA.historico['4321'], 1);
  pv.lembrar(4321, PASTA_A);
  assert.strictEqual(pv.memoriaDaPasta(pv.lerMemoria(), PASTA_A).historico['4321'], 2);
});

/**
 * ⚠️ O TESTE QUE FALTAVA — e a sua ausência era a causa.
 *
 * A suite antiga nunca punha mais do que uma pasta em jogo, por isso os cinco
 * defeitos desta família ficavam verdes enquanto o utilizador via o preview
 * errado (achado do codex, 2026-08-04). Isto falha contra a versão anterior do
 * `preview.js`, onde `mem.ultima` era um campo único de máquina.
 */
test('P14 — confirmar uma porta na pasta A nao enviesa a pasta B', async () => {
  pv.lembrar(4321, PASTA_A);
  const daB = pv.memoriaDaPasta(pv.lerMemoria(), PASTA_B);
  assert.strictEqual(daB.ultima, null, 'a pasta B nunca confirmou nada e nao pode herdar');
  assert.deepStrictEqual(daB.historico, {}, 'nem o historico de peso');
});

test('P15 — uma lista de portas PEDIDA nao e contaminada pela memoria', async () => {
  pv.lembrar(4321, PASTA_A);
  const r = await pv.descobrir({ portas: [59997], timeout_ms: 150, pasta_sessao: PASTA_A });
  assert.deepStrictEqual(r.portas, [59997],
    'quem pede portas explicitas recebe essas e so essas; a 4321 memorizada nao entra');
});

test('P16 — um servidor de OUTRA pasta nunca e escolhido, e diz-se porque', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end('<html><head><script type="module" src="/@vite/client"></script></head><body><div id="root"></div></body></html>');
  });
  try {
    const r = await pv.descobrir({
      portas: [porta], timeout_ms: 900,
      pasta_sessao: PASTA_A,
      pastas: [PASTA_A, PASTA_B],
      plataforma: 'win32',
      // o processo dono desta porta cita a pasta B — nao a desta sessao
      execImpl: async (cmd) => (/netstat/i.test(cmd)
        ? { ok: true, erro: null, saida: '  TCP    0.0.0.0:' + porta + '   0.0.0.0:0   LISTENING   9001' }
        : { ok: true, erro: null, saida: JSON.stringify([{ ProcessId: 9001, ParentProcessId: 1,
            Name: 'node.exe',
            CommandLine: 'node "C:\\Users\\Paulo Loureiro\\frugal-teste-b\\node_modules\\vite\\bin\\vite.js"' }]) }),
    });
    assert.strictEqual(r.candidatas.length, 1, 'o servidor foi mesmo encontrado');
    assert.strictEqual(r.candidatas[0].minha, false, 'e foi MEDIDO como nao sendo desta pasta');
    assert.strictEqual(r.escolhida, null,
      'encontrar nao e' + ' motivo para mostrar: a app de outra pasta nao se escolhe');
    assert.strictEqual(r.atribuicao.estado, 'nenhuma_minha');
    assert.match(r.nota, /nenhum e desta pasta|nenhum é desta pasta/,
      'e a nota tem de explicar a recusa: ' + r.nota);
  } finally { s.close(); }
});

test('P17 — sem pasta de sessao declarada, escolhe por peso mas NAO afirma que e tua', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end('<html><head><script type="module" src="/@vite/client"></script></head><body></body></html>');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.ok(r.escolhida, 'sem atribuicao possivel, o comportamento antigo mantem-se');
    assert.strictEqual(r.atribuicao.estado, 'sem_pasta_sessao');
    assert.strictEqual(r.escolhida.minha, null, 'minha e n/d — nunca true por omissao');
    assert.match(r.nota, /nao posso afirmar que e a tua|não posso afirmar que é a tua/,
      'a nota tem de assumir o que nao sabe: ' + r.nota);
  } finally { s.close(); }
});

test('P18 — a URL nomeia a familia IP que respondeu, nao "localhost"', async () => {
  const { s, porta } = await servir((q, r) => {
    r.setHeader('content-type', 'text/html');
    r.end('<html><body><div id="root"></div></body></html>');
  });
  try {
    const r = await pv.descobrir({ portas: [porta], timeout_ms: 900 });
    assert.ok(r.escolhida, r.nota);
    assert.match(r.escolhida.url, /^http:\/\/(127\.0\.0\.1|\[::1\]):/,
      'com dois servidores na mesma porta em familias diferentes, "localhost" abria o outro');
    assert.strictEqual(pv.urlLocalValida('http://[::1]:5173').ok, true, 'e [::1] tem de ser aceite');
  } finally { s.close(); }
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

test('P19 — as portas declaradas pelo projecto entram na sondagem, a frente das 14', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-proj-'));
  fs.mkdirSync(path.join(raiz, 'landing'));
  fs.writeFileSync(path.join(raiz, 'landing', 'package.json'), JSON.stringify({
    scripts: { dev: 'next dev -H 127.0.0.1 -p 7819' } }));
  const r = await pv.descobrir({ timeout_ms: 120, pasta_sessao: raiz, portas: null });
  assert.ok(r.portas.includes(7819),
    '7819 nao entrou: sem isto o dev server do utilizador e invisivel. portas=' + JSON.stringify(r.portas));
  assert.ok(r.portas.indexOf(7819) < r.portas.indexOf(5173),
    'a porta do projecto tem de ser sondada ANTES das genericas');
  const d = (r.portas_declaradas || []).find(x => x.porta === 7819);
  assert.strictEqual(d.onde, 'landing/package.json', 'a proveniencia tem de viajar ate ao painel');
  assert.match(r.nota, /7819 em landing\/package.json/,
    'a nota tem de dizer a porta REAL deste projecto, nao "corre npm run dev": ' + r.nota);
});

test('P20 — zero candidatas diz "nada_encontrado", nao "nenhuma e tua"', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-nada-'));
  const r = await pv.descobrir({ portas: [59996], timeout_ms: 150, pasta_sessao: raiz });
  assert.strictEqual(r.candidatas.length, 0);
  assert.strictEqual(r.atribuicao.estado, 'nada_encontrado',
    '"nenhuma_minha" afirma que existem servidores; com a lista vazia isso e falso');
  assert.strictEqual(r.escolhida, null);
});
