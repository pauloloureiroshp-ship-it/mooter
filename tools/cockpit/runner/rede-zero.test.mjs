/**
 * rede-zero.test.mjs
 *
 * PORQUE É QUE ESTE FICHEIRO EXISTE, e é a razão inteira:
 *
 * O gate da F1 diz «0 chamadas de rede durante a corrida (medido)». Um guarda
 * que nunca falhou é indistinguível de um guarda partido — e um contador que só
 * sabe imprimir zero produziria exactamente o mesmo relatório se estivesse
 * desligado. Metade dos testes deste ficheiro são de MORDIDA: obrigam o guarda a
 * apanhar uma saída a sério e a devolver `rede_zero: false`.
 *
 * A outra metade tranca a coisa mais fácil de perder de vista: `null` (não medi)
 * nunca pode virar `true` (medi zero). É a mesma regra do índice do harness da
 * F0 — componente que não se consegue medir vale zero e diz porquê.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';
import child_process from 'node:child_process';

import {
  medirRede, auditar, ehLoopback, alvoDoConnect, ambienteHostil,
  lerRegistoDosFilhos, RedeBloqueada, PORTA_PROXY_MORTA, RE_LOOPBACK,
} from './rede-zero.mjs';

// Sonda injectada: nunca vê nada. Serve os casos em que o que se testa é a
// contabilidade, não o SO.
const sondaLimpa = async () => ({ remotos: [], udp: 0 });

// ── MORDIDA · o guarda tem de apanhar uma saída do próprio processo ─────────

test('MORDIDA · dns.lookup para fora é contado E recusado', async () => {
  // Se este teste passar a verde com `rede_zero: true`, o guarda está partido e
  // todo o número de rede do relatório da F1 é ficção. `example.com` nunca é
  // resolvido: a substituição atira antes de qualquer syscall.
  let atirou = null;
  const { auditoria } = await medirRede(async () => {
    try { dns.lookup('example.com', () => {}); } catch (e) { atirou = e; }
  }, { sondaImpl: sondaLimpa });

  assert.ok(atirou instanceof RedeBloqueada, 'a chamada tinha de ser recusada, não só contada');
  assert.equal(auditoria.rede_zero, false);
  assert.equal(auditoria.chamadas.length, 1);
  assert.equal(auditoria.chamadas[0].api, 'dns.lookup');
  assert.match(auditoria.porque, /example\.com/);
});

test('MORDIDA · net.connect para fora é contado E recusado', async () => {
  let atirou = null;
  const { auditoria } = await medirRede(async () => {
    try { net.connect(443, 'semgrep.dev'); } catch (e) { atirou = e; }
  }, { sondaImpl: sondaLimpa });

  assert.ok(atirou instanceof RedeBloqueada);
  assert.equal(auditoria.rede_zero, false);
  assert.equal(auditoria.chamadas[0].alvo, 'semgrep.dev:443');
});

test('MORDIDA · fetch para fora é contado E recusado', async () => {
  let erro = null;
  const { auditoria } = await medirRede(async () => {
    await globalThis.fetch('https://registry.npmjs.org/knip').catch((e) => { erro = e; });
  }, { sondaImpl: sondaLimpa });

  assert.ok(erro instanceof RedeBloqueada);
  assert.equal(auditoria.rede_zero, false);
  assert.equal(auditoria.chamadas[0].api, 'fetch');
});

test('MORDIDA · um filho com destino remoto observado derruba o veredicto', async () => {
  // O caso que a instrumentação no processo-pai NUNCA apanharia: os três
  // produtores da F1 são processos filhos. Se a sonda vir um remoto, o veredicto
  // tem de ser `false` mesmo com zero chamadas no processo.
  const sondaSuja = async () => ({ remotos: ['93.184.216.34'], udp: 0 });
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{},600)']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaSuja, intervaloSondaMs: 20 });

  assert.equal(auditoria.chamadas.length, 0, 'o processo-pai não falou para fora');
  assert.equal(auditoria.rede_zero, false, 'e mesmo assim o veredicto é falso — foi o filho');
  assert.match(auditoria.porque, /93\.184\.216\.34/);
});

// ── não medido ≠ medido zero ───────────────────────────────────────────────

test('um filho que não se conseguiu medir dá `null`, nunca `true`', async () => {
  // `spawnSync` bloqueia o event loop: não há como sondar o PID enquanto corre.
  // O caminho fácil seria assumir zero. Aqui assume-se ignorância.
  const { auditoria } = await medirRede(async () => {
    child_process.spawnSync(process.execPath, ['-e', '0']);
  }, { sondaImpl: sondaLimpa });

  assert.equal(auditoria.rede_zero, null, '`null` é "não medi", e não colapsa em `true`');
  assert.equal(auditoria.filhos.length, 1);
  assert.equal(auditoria.filhos[0].sonda.estado, 'n/d');
  assert.match(auditoria.filhos[0].sonda.porque, /sincron|síncron/i);
});

test('um filho que morre antes da primeira amostra não conta como medido a zero', async () => {
  // A honestidade da sonda: ela é OBSERVAÇÃO. Zero amostras não é zero ligações.
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', '0']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.rede_zero, null);
  assert.match(auditoria.filhos[0].sonda.porque, /antes da primeira amostra/);
});

test('sem sonda para a plataforma, um filho leva o veredicto a `null` com a razão', async () => {
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', '0']);
    await new Promise((r) => p.on('close', r));
  }, { plataforma: 'sunos' });

  assert.equal(auditoria.rede_zero, null);
  assert.match(auditoria.filhos[0].sonda.porque, /sunos/);
});

test('um adaptador pode declarar a sua própria medição — é o caminho do semgrep em WSL', async () => {
  // A tabela de sockets do Windows não vê para dentro da VM do WSL. Sondar
  // `wsl.exe` daria zero por cegueira. `bloqueado` é prova por construção
  // (`unshare -rn`), não observação.
  const { auditoria } = await medirRede(async (ctx) => {
    ctx.declararFilhoMedido({
      cmd: 'wsl.exe semgrep (unshare -rn)',
      estado: 'bloqueado',
      porque: 'espaço de nomes de rede sem interfaces',
    });
  }, { sondaImpl: sondaLimpa });

  assert.equal(auditoria.rede_zero, true);
  assert.equal(auditoria.filhos[0].sonda.estado, 'bloqueado');
});

test('corrida limpa com filho sondado dá `true` e diz quantas amostras foram tiradas', async () => {
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.equal(auditoria.rede_zero, true);
  assert.equal(auditoria.filhos[0].sonda.estado, 'sondado');
  assert.ok(auditoria.filhos[0].sonda.amostras >= 1, 'um `true` sem uma única amostra seria um `true` sem medição');
  assert.match(auditoria.porque, /amostra/);
});

// ── loopback não é rede ────────────────────────────────────────────────────

test('loopback passa e é contado à parte — é a fronteira do assertLocalEngine', async () => {
  const servidor = net.createServer(() => {});
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const porta = servidor.address().port;
  try {
    const { auditoria } = await medirRede(async () => {
      await new Promise((r, rej) => {
        const s = net.connect(porta, '127.0.0.1');
        s.on('connect', () => { s.destroy(); r(); });
        s.on('error', rej);
      });
    }, { sondaImpl: sondaLimpa });
    assert.equal(auditoria.rede_zero, true, 'falar com o próprio painel não é sair da máquina');
    assert.equal(auditoria.loopback_permitido, 1);
  } finally { servidor.close(); }
});

// ── funções puras ──────────────────────────────────────────────────────────

test('ehLoopback aceita as formas todas e recusa o resto', () => {
  for (const h of ['localhost', '127.0.0.1', '127.10.0.3', '::1', '']) assert.equal(ehLoopback(h), true, h);
  for (const h of ['semgrep.dev', '8.8.8.8', 'registry.npmjs.org']) assert.equal(ehLoopback(h), false, h);
});

test('alvoDoConnect distingue as três formas do connect, e IPC não é rede', () => {
  assert.deepEqual(alvoDoConnect(['\\\\.\\pipe\\x']), { tipo: 'ipc', alvo: '\\\\.\\pipe\\x' });
  assert.deepEqual(alvoDoConnect([{ path: '/tmp/s.sock' }]), { tipo: 'ipc', alvo: '/tmp/s.sock' });
  assert.deepEqual(alvoDoConnect([{ host: 'semgrep.dev', port: 443 }]), { tipo: 'rede', alvo: 'semgrep.dev:443' });
  assert.deepEqual(alvoDoConnect([11434, '127.0.0.1']), { tipo: 'loopback', alvo: '127.0.0.1:11434' });
});

test('auditar recusa transformar "não medi" em "medi zero"', () => {
  const medido = { cmd: 'a', sonda: { estado: 'sondado', remotos: [], amostras: 3, porque: null } };
  const cego = { cmd: 'b', sonda: { estado: 'n/d', remotos: [], amostras: 0, porque: 'sem sonda' } };
  assert.equal(auditar({ filhos: [medido] }).rede_zero, true);
  assert.equal(auditar({ filhos: [medido, cego] }).rede_zero, null);
  assert.equal(auditar({ chamadas: [{ api: 'fetch', alvo: 'x' }], filhos: [medido] }).rede_zero, false);
  // Uma chamada registada ganha a tudo: nem sequer se olha para os filhos.
  assert.equal(auditar({ chamadas: [{ api: 'fetch', alvo: 'x' }], filhos: [cego] }).rede_zero, false);
});

test('ambienteHostil aponta todos os proxies a uma porta fechada do loopback', () => {
  const e = ambienteHostil({ PATH: '/bin' });
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY']) {
    assert.equal(e[k], `http://127.0.0.1:${PORTA_PROXY_MORTA}`, k);
  }
  assert.equal(e.NO_PROXY, '', 'um NO_PROXY herdado abriria um buraco no meio da fechadura');
  assert.equal(e.SEMGREP_SEND_METRICS, 'off');
  assert.equal(e.PATH, '/bin', 'o resto do ambiente passa intacto');
});

// ── a instrumentação não pode ficar pendurada ──────────────────────────────

test('tudo o que foi substituído é reposto, mesmo quando a corrida atira', async () => {
  // Um `dns.lookup` que ficasse substituído depois da corrida partiria todo o
  // resto do processo — incluindo os outros ficheiros de teste desta suite.
  const antes = {
    dns: dns.lookup, connect: net.Socket.prototype.connect,
    spawn: child_process.spawn, fetch: globalThis.fetch,
  };
  await assert.rejects(() => medirRede(async () => { throw new Error('rebentou'); }, { sondaImpl: sondaLimpa }));
  assert.equal(dns.lookup, antes.dns);
  assert.equal(net.Socket.prototype.connect, antes.connect);
  assert.equal(child_process.spawn, antes.spawn);
  assert.equal(globalThis.fetch, antes.fetch);
});

// ── a sentinela dentro do filho: prova por intercepção, não por amostragem ──

test('MORDIDA · a sentinela apanha a saída DENTRO do filho e derruba o veredicto', async () => {
  // Este é o teste que o design todo existe para tornar possível. A sonda do SO
  // não chegava: medido a 2026-08-26, o jscpd corre em 211 ms e o knip em
  // 1118 ms, enquanto uma amostra `Get-NetTCPConnection` custa ~550 ms — a
  // primeira corrida a sério deu `n/d` por zero amostras em dois filhos.
  // A sentinela intercepta no instante da chamada, e a prova deixa de depender
  // de a amostra calhar no sítio certo.
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(
      process.execPath,
      ['-e', "require('dns').lookup('semgrep.dev', () => {})"],
      { env: ctx.ambiente },
    );
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.equal(auditoria.chamadas.length, 0, 'o processo-pai não falou para fora');
  assert.equal(auditoria.rede_zero, false, 'e mesmo assim o veredicto é falso — a sentinela viu-o');
  assert.match(auditoria.porque, /semgrep\.dev/);
  assert.equal(auditoria.filhos[0].sonda.saidas.length, 1);
  assert.equal(auditoria.filhos[0].sonda.saidas[0].api, 'dns.lookup');
});

test('um filho calado com a sentinela carregada é `instrumentado`, e isso basta para `true`', async () => {
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', '0'], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  // O MESMO filho que, sem sentinela, dava `n/d` por morrer antes da amostra.
  assert.equal(auditoria.filhos[0].sonda.estado, 'instrumentado');
  assert.equal(auditoria.rede_zero, true);
});

test('MORDIDA · a saída de um NETO (filho de um filho) também derruba o veredicto', async () => {
  // O `NODE_OPTIONS` é herdado, portanto a sentinela desce a árvore inteira. Um
  // processo que este ramo não registou mas que falou para fora não pode
  // desaparecer só por estar um nível abaixo.
  const neto = "require('child_process').spawnSync(process.execPath,['-e',\"try{require('dns').lookup('registry.npmjs.org',()=>{})}catch(e){}\"])";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', neto], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.rede_zero, false);
  assert.ok(auditoria.netos.length >= 1, 'o neto tem de aparecer, ainda que ninguém o tenha registado');
  assert.match(auditoria.porque, /descendentes/);
});

test('sem a linha `sentinela-carregada` não se conclui nada — ficheiro vazio ≠ filho calado', () => {
  // A distinção que impede o pior modo de falha: se a sentinela nunca entrar no
  // processo, o registo fica vazio — exactamente igual ao de um filho que não
  // falou. Só a marca de carregamento separa as duas coisas.
  const { porPid, partidas } = lerRegistoDosFilhos('/x', {
    readImpl: () => [
      JSON.stringify({ pid: 10, ev: 'sentinela-carregada' }),
      JSON.stringify({ pid: 10, ev: 'saida', api: 'fetch', alvo: 'https://x' }),
      'linha-partida',
      JSON.stringify({ ev: 'saida' }),
    ].join('\n'),
  });
  assert.equal(porPid.get(10).carregada, true);
  assert.equal(porPid.get(10).saidas.length, 1);
  assert.equal(partidas, 2, 'uma linha ilegível e uma sem PID são contadas, não engolidas');
  assert.equal(lerRegistoDosFilhos('/nao-existe', { readImpl: () => { throw new Error('ENOENT'); } }).porPid.size, 0);
});

test('o --require da sentinela leva barras PARA A FRENTE', () => {
  // Regressão medida a 2026-08-26: com barras invertidas, o parser do
  // NODE_OPTIONS come-as como escape e o filho morre com
  // `Cannot find module 'C:UsersPaulo Loureiro…'`. O knip e o jscpd falharam
  // os dois assim, e o relatório dessa corrida perdeu 1034 apontamentos.
  const e = ambienteHostil({}, PORTA_PROXY_MORTA, { registo: '/r', sentinela: String.raw`C:\a b\s.cjs` });
  assert.equal(e.NODE_OPTIONS, '--require "C:/a b/s.cjs"');
  assert.equal(ambienteHostil({ NODE_OPTIONS: '--x' }, PORTA_PROXY_MORTA, { registo: '/r', sentinela: 's.cjs' }).NODE_OPTIONS,
    '--x --require "s.cjs"', 'o NODE_OPTIONS do utilizador não é apagado');
  assert.equal(ambienteHostil({}).NODE_OPTIONS, undefined, 'sem registo não se mexe no ambiente do filho');
});

test('a fronteira do loopback é UMA só, e a sentinela recebe-a em vez de a copiar', () => {
  const e = ambienteHostil({}, PORTA_PROXY_MORTA, { registo: '/r' });
  assert.equal(e.REDE_ZERO_LOOPBACK_RE, RE_LOOPBACK);
  const re = new RegExp(RE_LOOPBACK, 'i');
  for (const h of ['localhost', '127.0.0.1', '::1', '']) assert.equal(re.test(h), ehLoopback(h), h);
  for (const h of ['semgrep.dev', '8.8.8.8']) assert.equal(re.test(h), ehLoopback(h), h);
});
