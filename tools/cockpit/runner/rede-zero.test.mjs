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
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import child_process from 'node:child_process';

import {
  medirRede, auditar, ehInerte, alvoDoConnect, ambienteHostil, instalarGuardas,
  lerRegistoDosFilhos, RedeBloqueada, PORTA_PROXY_MORTA, RE_INERTE,
  METODOS_RESOLVER, classificarPorCamadas,
} from './rede-zero.mjs';

// Sonda injectada: nunca vê nada. Serve os casos em que o que se testa é a
// contabilidade, não o SO.
const sondaLimpa = async () => ({ remotos: [], udp: 0 });

// 192.0.2.1 = TEST-NET-1 (RFC 5737): reservado para documentação, não
// encaminhável para host nenhum. Prova SAÍDA sem falar com ninguém.
const BURACO = '192.0.2.1';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

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
  // `registo: null` desliga a sentinela de propósito: o que se exerce aqui é o
  // caminho em que a ÚNICA evidência possível seria a amostragem do SO.
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', '0']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000, registo: null });

  assert.equal(auditoria.rede_zero, null);
  assert.match(auditoria.filhos[0].sonda.porque, /antes da primeira amostra/);
});

test('sem sonda para a plataforma, um filho leva o veredicto a `null` com a razão', async () => {
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', '0']);
    await new Promise((r) => p.on('close', r));
  }, { plataforma: 'sunos', registo: null });

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
  // Sem sentinela (`registo: null`): o que se julga aqui é a via da AMOSTRAGEM.
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20, registo: null });

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

test('ehInerte aceita as formas todas — incluindo o não-especificado — e recusa o resto', () => {
  for (const h of ['localhost', '127.0.0.1', '127.10.0.3', '::1', '']) assert.equal(ehInerte(h), true, h);
  // A correcção de 2026-08-26: havia DUAS definições de inerte e `0.0.0.0` só
  // estava numa. Um bind local de UDP passa por `dns.lookup('0.0.0.0')` e o
  // veredicto ia a `false` por uma saída que nunca existiu.
  for (const h of ['0.0.0.0', '::', '*']) assert.equal(ehInerte(h), true, `${h} é um bind, não um destino`);
  for (const h of ['semgrep.dev', '8.8.8.8', 'registry.npmjs.org', '192.0.2.1']) assert.equal(ehInerte(h), false, h);
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
    dns: dns.lookup, dnsP: dns.promises.lookup, resolve4: dns.resolve4,
    resolverProto: dns.Resolver.prototype.resolve4, dgramSend: dgram.Socket.prototype.send,
    connect: net.Socket.prototype.connect,
    spawn: child_process.spawn, fetch: globalThis.fetch,
    nodeOptions: process.env.NODE_OPTIONS, registo: process.env.REDE_ZERO_REGISTO,
  };
  await assert.rejects(() => medirRede(async () => { throw new Error('rebentou'); }, { sondaImpl: sondaLimpa }));
  assert.equal(dns.lookup, antes.dns);
  assert.equal(dns.promises.lookup, antes.dnsP);
  assert.equal(dns.resolve4, antes.resolve4);
  assert.equal(dns.Resolver.prototype.resolve4, antes.resolverProto);
  assert.equal(dgram.Socket.prototype.send, antes.dgramSend);
  assert.equal(net.Socket.prototype.connect, antes.connect);
  assert.equal(child_process.spawn, antes.spawn);
  assert.equal(globalThis.fetch, antes.fetch);
  // O `NODE_OPTIONS` do próprio processo é mexido durante a medição (é o que
  // torna visível um descendente nascido de uma referência capturada). Deixá-lo
  // pendurado mudaria todos os `spawn` do resto da suite.
  assert.equal(process.env.NODE_OPTIONS, antes.nodeOptions);
  assert.equal(process.env.REDE_ZERO_REGISTO, antes.registo);
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

test('um filho calado, com sentinela e SEM addons nativos, é `instrumentado`', async () => {
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', '0'], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  // O MESMO filho que, sem sentinela, dava `n/d` por morrer antes da amostra.
  // A promoção só é legítima porque a camada nativa foi MEDIDA e está vazia.
  assert.equal(auditoria.filhos[0].sonda.estado, 'instrumentado');
  assert.equal(auditoria.filhos[0].sonda.nativo, 'sem-addons');
  assert.match(auditoria.filhos[0].sonda.porque, /ZERO addons nativos/);
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

test('a fronteira é UMA só, e a sentinela recebe-a em vez de a copiar', () => {
  const e = ambienteHostil({}, PORTA_PROXY_MORTA, { registo: '/r' });
  assert.equal(e.REDE_ZERO_INERTE_RE, RE_INERTE);
  const re = new RegExp(RE_INERTE, 'i');
  for (const h of ['localhost', '127.0.0.1', '::1', '', '0.0.0.0']) assert.equal(re.test(h), ehInerte(h), h);
  for (const h of ['semgrep.dev', '8.8.8.8']) assert.equal(re.test(h), ehInerte(h), h);
});

// ────────────────────────────────────────────────────────────────────────────
// AS SONDAS DA LENTE ADVERSARIAL, 2026-08-26, uma a uma.
//
// A lente produziu TRÊS saídas de rede reais que este mecanismo devolveu como
// `rede_zero: true, chamadas: 0`, e um falso positivo que matava a corrida por
// uma saída que nunca existiu. Cada caso dela tem aqui um teste com a mesma
// letra. Sem isto, a correcção seria «passa os testes que já existiam» — que é
// exactamente o que a lente disse não aceitar.
//
//   A · pai   · dns.resolve4 -> 192.0.2.1          era true, tem de ser false
//   B · pai   · dgram.send   -> 192.0.2.1:53       era true, tem de ser false
//   C · filho · dns.promises.lookup                era true, tem de ser false
//   D · filho · dns.Resolver -> 192.0.2.1          era true, tem de ser false
//   E · filho nascido de `import{spawn}`           era invisível, tem de aparecer
//   F · pai   · dgram bind local                   era false, tem de ser true
//   G · filho com addon nativo e 0 amostras        era `instrumentado`, tem de ser n/d
// ────────────────────────────────────────────────────────────────────────────

test('MORDIDA · A · dns.resolve* no processo é contado E recusado', async () => {
  // `dns.lookup` estava coberto e `dns.resolve4` não. São funções diferentes:
  // medido, `dns.resolve4 === dns.Resolver.prototype.resolve4` é FALSE, porque a
  // do módulo já vem ligada ao resolver por omissão. Substituir o protótipo não
  // lhe toca — por isso os dois pontos são substituídos.
  let atirou = null;
  const { auditoria } = await medirRede(async () => {
    const r = new dns.Resolver({ timeout: 200, tries: 1 });
    r.setServers([BURACO]);
    try { r.resolve4('exemplo-auditoria.invalid', () => {}); } catch (e) { atirou = e; }
  }, { sondaImpl: sondaLimpa });

  assert.ok(atirou instanceof RedeBloqueada, 'não bastava contar: a chamada tinha de ser recusada');
  assert.equal(auditoria.rede_zero, false);
  assert.match(auditoria.chamadas[0].alvo, /192\.0\.2\.1/, 'o SERVIDOR para onde ia tem de aparecer no relatório');
});

test('MORDIDA · A2 · o `dns.resolve4` do módulo (já ligado) também é apanhado', async () => {
  let atirou = null;
  const { auditoria } = await medirRede(async () => {
    try { dns.resolve4('exemplo-auditoria.invalid', () => {}); } catch (e) { atirou = e; }
  }, { sondaImpl: sondaLimpa });
  assert.ok(atirou instanceof RedeBloqueada);
  assert.equal(auditoria.rede_zero, false);
  assert.equal(auditoria.chamadas[0].api, 'dns.resolve4');
});

test('MORDIDA · B · dgram.send para fora é contado E recusado', async () => {
  let atirou = null;
  const { auditoria } = await medirRede(async () => {
    const s = dgram.createSocket('udp4');
    try { s.send(Buffer.from('x'), 53, BURACO, () => {}); } catch (e) { atirou = e; }
    s.close();
  }, { sondaImpl: sondaLimpa });

  assert.ok(atirou instanceof RedeBloqueada, 'UDP cru não passava por ponto nenhum: é onde vive o DNS');
  assert.equal(auditoria.rede_zero, false);
  assert.equal(auditoria.chamadas[0].alvo, BURACO + ':53');
});

test('MORDIDA · C · dns.promises.lookup DENTRO do filho derruba o veredicto', async () => {
  // O buraco exacto: o pai cobria cinco APIs e a sentinela quatro. A que
  // faltava era esta, e `dns.promises.lookup !== dns.lookup`.
  const cod = "require('dns').promises.lookup('exemplo-auditoria.invalid').catch(()=>{})";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.equal(auditoria.chamadas.length, 0, 'o processo-pai não falou para fora');
  assert.equal(auditoria.rede_zero, false);
  assert.equal(auditoria.filhos[0].sonda.saidas[0].api, 'dns.promises.lookup');
});

test('MORDIDA · D · dns.Resolver DENTRO do filho derruba o veredicto', async () => {
  // c-ares manda um pacote UDP para fora da máquina sem passar por `net` nem
  // por `dns.lookup`. A sentinela não tinha nada aqui.
  const cod = "const d=require('dns');const r=new d.Resolver({timeout:200,tries:1});r.setServers(['" + BURACO + "']);r.resolve4('exemplo-auditoria.invalid',()=>{})";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.equal(auditoria.rede_zero, false);
  assert.match(auditoria.filhos[0].sonda.saidas[0].api, /Resolver\.resolve4/);
  assert.match(auditoria.filhos[0].sonda.saidas[0].alvo, /192\.0\.2\.1/);
});

test('E · um descendente nascido FORA do ponto de registo deixa de ser invisível', async () => {
  // `import { spawn }` captura a referência no carregamento do módulo e passa ao
  // lado da substituição — medido: `import{spawn} vê a substituição? false`. O
  // comentário que dizia «um produtor não consegue nascer sem ficar no registo»
  // era falso e foi retirado. Não se fecha do lado do `child_process`; fecha-se
  // do outro lado: a sentinela vai no NODE_OPTIONS do PRÓPRIO processo, e um
  // descendente Node que herde o ambiente anuncia-se.
  const { spawn } = await import('node:child_process');
  const { auditoria } = await medirRede(async () => {
    const p = spawn(process.execPath, ['-e', 'setTimeout(()=>{},200)']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.equal(auditoria.filhos.length, 0, 'de facto não passou pelo ponto de registo');
  assert.equal(auditoria.descendentes.length, 1, 'e mesmo assim tem de aparecer no relatório');
  assert.match(auditoria.porque, /descendente não registado/);
});

test('MORDIDA · E2 · um descendente não registado que FALA derruba o veredicto', async () => {
  const { spawn } = await import('node:child_process');
  const { auditoria } = await medirRede(async () => {
    const p = spawn(process.execPath, ['-e', "try{require('dns').lookup('registry.npmjs.org',()=>{})}catch(e){}"]);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.equal(auditoria.filhos.length, 0);
  assert.equal(auditoria.rede_zero, false);
  assert.match(auditoria.porque, /registry\.npmjs\.org/);
});

test('MORDIDA · F · um bind local de UDP NÃO é uma saída', async () => {
  // O falso positivo que atira: `dgram.bind(0)` passa por
  // `dns.lookup('0.0.0.0')` (node:internal/dgram:23). Com duas definições de
  // inerte — uma com `0.0.0.0` e outra sem — a chamada era registada, ATIRADA, e
  // o veredicto ia a `false` acusando uma saída que nunca existiu. Um guarda que
  // mata a corrida por um bind local é tão inútil como um que deixa passar uma
  // saída: os dois destroem a confiança no número.
  let erro = null;
  const { auditoria } = await medirRede(async () => {
    await new Promise((res, rej) => {
      const s = dgram.createSocket('udp4');
      s.on('error', rej);
      s.bind(0, () => { s.close(); res(); });
    }).catch((e) => { erro = e; });
  }, { sondaImpl: sondaLimpa });

  assert.equal(erro, null, 'abrir um socket local não pode atirar RedeBloqueada');
  assert.equal(auditoria.chamadas.length, 0);
  assert.equal(auditoria.rede_zero, true);
});

test('MORDIDA · G · sentinela + addon nativo + zero amostras é `n/d`, não `instrumentado`', async () => {
  // A objecção mais grave da lente: a promoção a `instrumentado` corria
  // INCONDICIONALMENTE e APAGAVA o `n/d` que cobria a cegueira. Medido no
  // relatório da corrida real: `node.exe (jscpd) = instrumentado — 0 saídas de
  // JS interceptadas`, SEM contagem de amostras — ou seja, a camada onde o
  // motor nativo do jscpd faz o trabalho tinha cobertura ZERO e o estado
  // publicado dizia «medido». Aqui o filho carrega um addon (a tentativa falha,
  // e é a tentativa que conta — errar para o lado do `n/d` é o lado seguro) e
  // morre antes de qualquer amostra.
  const cod = "try{process.dlopen({exports:{}},'C:/nao-existe-addon.node')}catch(e){}";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.filhos[0].sonda.js, 'intercetado', 'a camada de JavaScript FOI medida');
  assert.equal(auditoria.filhos[0].sonda.addons.length, 1, 'e a nativa foi medida como PRESENTE');
  assert.equal(auditoria.filhos[0].sonda.estado, 'n/d');
  assert.equal(auditoria.rede_zero, null, '`null` é "não medi", e não colapsa em `true`');
  assert.match(auditoria.filhos[0].sonda.porque, /não foi observada/);
});

test('G2 · o MESMO filho com addon, mas com amostras da sonda, volta a ser medido', async () => {
  // A regra não é «addon nativo mata o veredicto»: é «uma camada sem NENHUMA
  // evidência mata o veredicto». Com a sonda a tirar amostras, a camada nativa
  // passa a ter observação e o número de amostras viaja no relatório.
  const cod = "try{process.dlopen({exports:{}},'C:/nao-existe-addon.node')}catch(e){};setTimeout(()=>{},400)";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.ok(auditoria.filhos[0].sonda.amostras >= 1);
  assert.equal(auditoria.filhos[0].sonda.estado, 'instrumentado');
  assert.match(auditoria.filhos[0].sonda.porque, /amostra\(s\) da sonda do SO/);
  assert.equal(auditoria.rede_zero, true);
});

// ── a paridade entre o pai e a sentinela, verificada a correr ───────────────

test('MORDIDA · a sentinela instala EXACTAMENTE as mesmas APIs que o pai', async () => {
  // A causa-raiz das objecções A a D: DUAS listas para a mesma pergunta. Este
  // teste atravessa a fronteira do processo — conta o que o instalador põe no
  // pai e compara com o número que a sentinela escreveu do lado de dentro. Se
  // alguém acrescentar um ponto de saída só a um dos lados, parte aqui.
  const g = instalarGuardas({ ehInerte, aoSaida: () => new Error('x') });
  const noPai = g.instaladas.length;
  g.restaurar();
  assert.ok(noPai >= 60, `o instalador tem de cobrir dezenas de pontos, cobriu ${noPai}`);

  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', '0'], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.filhos[0].sonda.apis, noPai,
    'o filho tem de instalar o MESMO número de guardas que o pai — duas listas divergem sempre');
});

test('MORDIDA · nenhum dos dois lados pode voltar a escrever a sua própria lista', () => {
  // A paridade acima mede o número. Esta mede a estrutura: se alguém voltar a
  // substituir `dns.lookup` à mão dentro de um dos ficheiros, a lista volta a
  // ser duas mesmo que os números batam certo por acaso.
  const sentinela = fs.readFileSync(path.join(AQUI, 'rede-zero-sentinela.cjs'), 'utf8');
  const pai = fs.readFileSync(path.join(AQUI, 'rede-zero.mjs'), 'utf8');
  for (const [nome, fonte] of [['sentinela', sentinela], ['pai', pai]]) {
    const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(codigo, /dns\.lookup\s*=/, nome + ' não pode ter a sua própria substituição');
    assert.doesNotMatch(codigo, /Socket\.prototype\.connect\s*=/, nome + ' não pode ter a sua própria substituição');
    assert.doesNotMatch(codigo, /globalThis\.fetch\s*=/, nome + ' não pode ter a sua própria substituição');
    assert.match(codigo, /instalarGuardas/, nome + ' tem de usar o instalador partilhado');
  }
});

test('a lista de métodos de resolução cobre TUDO o que este Node expõe', () => {
  // Derivada da medição, não da documentação. Se uma versão nova do Node
  // acrescentar um `resolveXyz`, esta linha parte no dia da actualização em vez
  // de abrir um buraco calado.
  const expostos = Object.getOwnPropertyNames(dns.Resolver.prototype).filter((n) => /^(resolve|reverse)/.test(n));
  for (const m of expostos) assert.ok(METODOS_RESOLVER.includes(m), m + ' está exposto e não está coberto');
});

test('classificarPorCamadas: a promoção depende da camada nativa, não da fé', () => {
  assert.equal(classificarPorCamadas({ saidas: [], addons: [], amostras: 0 }).estado, 'instrumentado');
  assert.equal(classificarPorCamadas({ saidas: [], addons: ['x.node'], amostras: 0 }).estado, 'n/d');
  assert.equal(classificarPorCamadas({ saidas: [], addons: ['x.node'], amostras: 3 }).estado, 'instrumentado');
});

test('auditar conta os descendentes não medidos como não medidos', () => {
  const medido = { cmd: 'a', sonda: { estado: 'instrumentado', remotos: [], saidas: [], amostras: 0, porque: null } };
  const cego = { cmd: 'd', pid: 7, sonda: { estado: 'n/d', remotos: [], saidas: [], amostras: 0, porque: 'addon sem sonda' } };
  assert.equal(auditar({ filhos: [medido] }).rede_zero, true);
  assert.equal(auditar({ filhos: [medido], descendentes: [cego] }).rede_zero, null);
  const falador = { cmd: 'd', pid: 7, sonda: { estado: 'instrumentado', remotos: [], saidas: [{ api: 'fetch', alvo: 'https://x' }], amostras: 0, porque: null } };
  assert.equal(auditar({ filhos: [medido], descendentes: [falador] }).rede_zero, false);
});
