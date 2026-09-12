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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import child_process from 'node:child_process';
import worker_threads from 'node:worker_threads';

import {
  medirRede, auditar, ehInerte, alvoDoConnect, ambienteHostil, instalarGuardas,
  lerRegistoDosFilhos, RedeBloqueada, PORTA_PROXY_MORTA, RE_INERTE,
  METODOS_RESOLVER, classificarPorCamadas, instalarVigiaDeFilhos, pareceNode,
} from './rede-zero.mjs';
// Os símbolos da 3.ª lente entram por namespace, para que este ficheiro CARREGUE
// contra 481ea0d7 e os testes de mordida falhem na asserção, não no import.
import * as rz from './rede-zero.mjs';
const { instalarVigiaDeWorkers, FORA_DA_SENTINELA, ESTADOS_POR_CONSTRUCAO } = rz;

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

test('corrida limpa com filho sondado é `null` — a amostragem é evidência, e diz quantas amostras tirou', async () => {
  // Sem sentinela (`registo: null`): o que se julga aqui é a via da AMOSTRAGEM.
  // Até 2026-09-11 dava `true`. A 3.ª lente mostrou UDP a sair entre amostras
  // (61 bytes de 1.1.1.1:53 com 3 amostras tiradas): observação não é prova.
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20, registo: null });

  assert.equal(auditoria.rede_zero, null, 'sondado limpo é evidência, não veredicto');
  assert.equal(auditoria.filhos[0].sonda.estado, 'sondado');
  assert.ok(auditoria.filhos[0].sonda.amostras >= 1, 'a evidência tem de dizer quantas amostras');
  assert.match(auditoria.porque, /sem isolamento do SO não há prova/);
  assert.match(auditoria.porque, /amostra\(s\) da sonda/);
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

test('auditar recusa transformar "não medi" em "medi zero" — e "observei limpo" também não é "medi zero"', () => {
  const provado = { cmd: 'w', sonda: { estado: 'bloqueado', remotos: [], amostras: 1, porque: 'unshare' } };
  const observado = { cmd: 'a', sonda: { estado: 'sondado', remotos: [], amostras: 3, porque: null } };
  const cego = { cmd: 'b', sonda: { estado: 'n/d', remotos: [], amostras: 0, porque: 'sem sonda' } };
  assert.equal(auditar({ filhos: [provado] }).rede_zero, true, 'só a construção dá true');
  assert.equal(auditar({ filhos: [observado] }).rede_zero, null, 'sondado limpo é evidência');
  assert.equal(auditar({ filhos: [provado, observado] }).rede_zero, null, 'um sem isolamento chega para não haver prova');
  assert.equal(auditar({ filhos: [provado, cego] }).rede_zero, null);
  assert.equal(auditar({ chamadas: [{ api: 'fetch', alvo: 'x' }], filhos: [provado] }).rede_zero, false);
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

test('um filho calado, com sentinela e SEM addons nativos, é `instrumentado` — e o veredicto é `null`', async () => {
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', '0'], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  // O MESMO filho que, sem sentinela, dava `n/d` por morrer antes da amostra.
  // O estado diz a qualidade da evidência; o veredicto diz que evidência não
  // é prova: até 2026-09-11 isto era `true`, e foi exactamente com um filho
  // assim que a 3.ª lente ligou TCP por `process.binding('tcp_wrap')`.
  assert.equal(auditoria.filhos[0].sonda.estado, 'instrumentado');
  assert.equal(auditoria.filhos[0].sonda.nativo, 'sem-addons');
  assert.match(auditoria.filhos[0].sonda.porque, /ZERO addons nativos/);
  assert.match(auditoria.filhos[0].sonda.porque, /evidência, não prova/);
  assert.equal(auditoria.rede_zero, null);
  assert.match(auditoria.porque, /process\.binding/);
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

test('G2 · o MESMO filho com addon, mas com amostras da sonda, é `sondado` — evidência com o nome certo, e `null`', async () => {
  // A regra não é «addon nativo mata o veredicto»: é «uma camada sem NENHUMA
  // evidência é n/d». Com a sonda a tirar amostras, a camada nativa passa a ter
  // observação — e o estado diz a qualidade da PIOR camada: `sondado`, com o
  // número de amostras. Até 2026-09-11 isto dizia `instrumentado` e dava
  // `true`; a 3.ª lente apontou que «só promove com addons=0» não batia com
  // este ramo, e que observação (UDP entre amostras) não é prova.
  const cod = "try{process.dlopen({exports:{}},'C:/nao-existe-addon.node')}catch(e){};setTimeout(()=>{},400)";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 20 });

  assert.ok(auditoria.filhos[0].sonda.amostras >= 1);
  assert.equal(auditoria.filhos[0].sonda.estado, 'sondado');
  assert.equal(auditoria.filhos[0].sonda.js, 'intercetado', 'a camada de JS continua anexada como evidência');
  assert.match(auditoria.filhos[0].sonda.porque, /só por amostragem: \d+ amostra\(s\) da sonda do SO/);
  assert.equal(auditoria.rede_zero, null);
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
  // Era `instrumentado` — a afirmação «só promove com addons=0» não batia com o código (3.ª lente).
  assert.equal(classificarPorCamadas({ saidas: [], addons: ['x.node'], amostras: 3 }).estado, 'sondado');
});

test('MORDIDA · a matriz de estados: TODAS as combinações addons×por-cobrir×amostras batem com a tabela do cabeçalho', () => {
  // A 3.ª lente apanhou uma linha da tabela a dizer uma coisa e o código outra
  // (`addons=1, amostras=1, filhos=[]` → `instrumentado`, contra «só promove
  // com addons=0 e 0 filhos»). Uma tabela que não é percorrida inteira é uma
  // promessa. Esta é percorrida inteira, e a expectativa está escrita AQUI, à
  // mão, linha a linha — não derivada do código.
  const curl = { api: 'spawnSync', cmd: 'curl.exe', args: [], pid: 1, node: false, coberto: false };
  const esperado = {
    // addons | porCobrir | amostras → estado
    '0|0|0': 'instrumentado',
    '0|0|1': 'instrumentado',
    '0|1|0': 'n/d',
    '0|1|1': 'n/d',
    '1|0|0': 'n/d',
    '1|0|1': 'sondado',
    '1|1|0': 'n/d',
    '1|1|1': 'n/d',
  };
  const vistos = [];
  for (const addons of [0, 1]) for (const porCobrir of [0, 1]) for (const amostras of [0, 1]) {
    const chave = `${addons}|${porCobrir}|${amostras}`;
    const r = classificarPorCamadas({
      saidas: [],
      addons: addons ? ['x.node'] : [],
      amostras,
      filhos: porCobrir ? [curl] : [],
    });
    assert.equal(r.estado, esperado[chave], `addons=${addons} porCobrir=${porCobrir} amostras=${amostras}`);
    assert.doesNotMatch(r.porque, /não sobra camada/, chave);
    vistos.push(chave);
  }
  assert.equal(vistos.length, 8, 'as oito combinações, nem mais nem menos');
  assert.deepEqual(Object.keys(esperado).sort(), vistos.sort(), 'a tabela e o percurso cobrem o mesmo conjunto');
  // Um worker por cobrir é um «por cobrir» como os outros: em qualquer linha
  // da tabela, leva o estado a `n/d`.
  const workerSemSentinela = { tid: 1, execArgv: true, env: 'proprio', herda_sentinela: false, coberto: false };
  for (const addons of [0, 1]) for (const amostras of [0, 1]) {
    assert.equal(classificarPorCamadas({ saidas: [], addons: addons ? ['x.node'] : [], amostras, workers: [workerSemSentinela] }).estado, 'n/d', `worker por cobrir com addons=${addons} amostras=${amostras}`);
  }
  // E nenhum estado que saia daqui pode dar `true` em auditar.
  for (const estado of ['instrumentado', 'sondado', 'n/d']) {
    assert.notEqual(auditar({ filhos: [{ cmd: 'x', sonda: { estado, remotos: [], saidas: [], amostras: 1, udp_max: 0, porque: '' } }] }).rede_zero, true, estado);
  }
});

test('auditar conta os descendentes não medidos como não medidos', () => {
  const observado = { cmd: 'a', sonda: { estado: 'instrumentado', remotos: [], saidas: [], amostras: 0, porque: null } };
  const provado = { cmd: 'w', sonda: { estado: 'bloqueado', remotos: [], saidas: [], amostras: 1, porque: 'unshare' } };
  const cego = { cmd: 'd', pid: 7, sonda: { estado: 'n/d', remotos: [], saidas: [], amostras: 0, porque: 'addon sem sonda' } };
  assert.equal(auditar({ filhos: [provado] }).rede_zero, true);
  assert.equal(auditar({ filhos: [observado] }).rede_zero, null, 'instrumentado é evidência, não prova');
  assert.equal(auditar({ filhos: [provado], descendentes: [cego] }).rede_zero, null);
  assert.match(auditar({ filhos: [provado], descendentes: [cego] }).porque, /sem medição/);
  const falador = { cmd: 'd', pid: 7, sonda: { estado: 'instrumentado', remotos: [], saidas: [{ api: 'fetch', alvo: 'https://x' }], amostras: 0, porque: null } };
  assert.equal(auditar({ filhos: [provado], descendentes: [falador] }).rede_zero, false);
});

// ────────────────────────────────────────────────────────────────────────────
// A 2.ª LENTE, 2026-08-26. Duas objecções que BLOQUEARAM a prova:
//
//   H · filho Node instrumentado faz nascer um NETO que não é Node (curl.exe)
//       → era `instrumentado`/`true` com HTTP 200 real; tem de ser `n/d`
//   P · registo das sentinelas com uma linha `saida` truncada
//       → `partidas` caía no chão e o veredicto era `true`; tem de ser `null`
//
// Cada guarda leva o teste que o faz MORDER e o par que confirma que NÃO
// morde sempre. Os de mordida foram corridos contra o código ANTIGO
// (HEAD 27c4fdac) e FALHARAM lá — ver a mensagem do commit.
// ────────────────────────────────────────────────────────────────────────────

/** Um executável que NÃO é Node, sem rede: o ponto é que seja anunciado. */
function netoNaoNode() {
  if (process.platform === 'win32') {
    const curl = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe');
    if (fs.existsSync(curl)) return ['curl.exe', ['--version']];
    return ['cmd.exe', ['/c', 'exit 0']];
  }
  return ['/bin/sh', ['-c', 'exit 0']];
}
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('MORDIDA · H · um filho instrumentado que faz nascer um neto NÃO-Node não pode ser «instrumentado»', async () => {
  // O `probe/n.mjs` da lente, sem a rede real: a sentinela cobria rede e
  // `dlopen`, não o `child_process`, e a sonda do SO só olhava para o PID do
  // filho. Um `curl.exe` nascido cá dentro não deixava rasto e o relatório dizia
  // `instrumentado · não sobra camada por observar`. Aqui o neto só imprime a
  // versão — o que se exige é que o nascimento seja VISTO e derrube a promoção.
  const [cmd, args] = netoNaoNode();
  const cod = `require('child_process').spawnSync(${JSON.stringify(cmd)}, ${JSON.stringify(args)}, {stdio:'ignore'})`;
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.chamadas.length, 0, 'o processo-pai não falou para fora');
  assert.notEqual(auditoria.rede_zero, true, 'um neto que ninguém mediu nunca pode dar `true`');
  assert.equal(auditoria.rede_zero, null);
  const f = auditoria.filhos[0];
  assert.equal(f.sonda.estado, 'n/d');
  assert.equal(f.sonda.addons.length, 0, 'sem addons — é precisamente o ramo que dizia «não sobra camada»');
  assert.equal(f.sonda.filhos.length, 1, 'o nascimento tem de ter sido anunciado');
  assert.equal(f.sonda.filhos[0].coberto, false);
  assert.equal(f.sonda.filhos[0].node, false);
  assert.match(auditoria.porque, new RegExp(escapar(path.basename(cmd))), 'o `porque` tem de nomear o comando');
  assert.doesNotMatch(auditoria.porque, /não sobra camada/);
});

test('H2 · o MESMO filho a fazer nascer um neto NODE continua `instrumentado` — o neto anuncia-se', async () => {
  // O par positivo: o guarda não pode morder sempre. Um neto Node herda o
  // `NODE_OPTIONS`, escreve a sua própria `sentinela-carregada` e o anunciado
  // fica coberto. O filho continua `instrumentado` e o neto aparece como
  // descendente. O veredicto é `null` (sem isolamento não há prova), e o
  // `porque` NÃO pode nomear um buraco de cobertura — é o que distingue este
  // caso de H e H3.
  const cod = "require('child_process').spawnSync(process.execPath, ['-e','0'], {stdio:'ignore'})";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.rede_zero, null);
  assert.match(auditoria.porque, /sem isolamento do SO não há prova/);
  assert.doesNotMatch(auditoria.porque, /sem medição/, 'coberto é coberto: o único motivo do null é a falta de isolamento');
  const f = auditoria.filhos[0];
  assert.equal(f.sonda.estado, 'instrumentado');
  assert.equal(f.sonda.filhos.length, 1);
  assert.equal(f.sonda.filhos[0].node, true);
  assert.equal(f.sonda.filhos[0].coberto, true, 'o PID anunciado tem de casar com a sentinela-carregada do neto');
  assert.equal(auditoria.descendentes.length, 1);
  assert.equal(auditoria.descendentes[0].pid, f.sonda.filhos[0].pid);
  assert.match(auditoria.descendentes[0].cmd, /anunciado pelo pid/);
  assert.match(f.sonda.porque, /1 filho\(s\) anunciado\(s\), 1 coberto\(s\)/);
});

test('MORDIDA · H3 · um neto Node lançado SEM o ambiente da sentinela não fica coberto', async () => {
  // Ser Node não chega: a cobertura é a `sentinela-carregada` do próprio neto.
  // Um filho que monta o ambiente à mão (sem `NODE_OPTIONS`) faz nascer um Node
  // cego, e o filho que o lançou tem de ficar `n/d`.
  const cod = "require('child_process').spawnSync(process.execPath, ['-e','0'], {stdio:'ignore', env:{PATH:process.env.PATH}})";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.rede_zero, null);
  assert.equal(auditoria.filhos[0].sonda.estado, 'n/d');
  assert.equal(auditoria.filhos[0].sonda.filhos[0].node, true, 'é Node…');
  assert.equal(auditoria.filhos[0].sonda.filhos[0].coberto, false, '…mas nunca se anunciou');
  assert.equal(auditoria.descendentes.length, 0);
});

test('H4 · as SETE portas do child_process anunciam, e `exec` anuncia UMA vez', async () => {
  // MEDIDO no Node v24.14.0: `exec` chama `module.exports.execFile` — sem a
  // guarda de reentrância um `exec` contava dois filhos. `fork` chama o `spawn`
  // LOCAL do módulo e passa ao lado do exportado — por isso é embrulhado à
  // parte. Aqui o vigia é instalado NESTE processo, com um colector no lugar
  // do registo, e cada porta é batida uma vez.
  //
  // E o que ele NÃO consegue, medido em vez de assumido: `execFileSync` e
  // `execSync` devolvem o stdout, não o PID. Em sucesso o anúncio leva
  // `pid: null` e um neto Node lançado assim nunca fica coberto (`n/d`, com o
  // motivo escrito). Em falha (rc ≠ 0) o erro traz o PID.
  const vistos = [];
  const vigia = instalarVigiaDeFilhos({ aoFilho: (f) => vistos.push(f) });
  const modulo = path.join(os.tmpdir(), `rede-zero-fork-${process.pid}.cjs`);
  fs.writeFileSync(modulo, '');
  try {
    assert.equal(vigia.instaladas.length, 7);
    const [cmd, args] = netoNaoNode();
    const node = process.execPath;
    child_process.spawnSync(cmd, args, { stdio: 'ignore' });
    child_process.execFileSync(node, ['-e', '0'], { stdio: 'ignore' });
    child_process.execSync(`"${node}" -e 0`, { stdio: 'ignore' });
    try { child_process.execFileSync(node, ['-e', 'process.exit(3)'], { stdio: 'ignore' }); } catch { /* rc=3 é o ponto */ }
    const esperar = (p) => new Promise((r) => { p.on('close', r); p.on('error', r); });
    await esperar(child_process.spawn(node, ['-e', '0'], { stdio: 'ignore' }));
    await esperar(child_process.execFile(node, ['-e', '0']));
    await esperar(child_process.exec(`"${node}" -e 0`));
    await esperar(child_process.fork(modulo, [], { stdio: 'ignore' }));
  } finally {
    vigia.restaurar();
    try { fs.unlinkSync(modulo); } catch { /* temporário */ }
  }
  assert.deepEqual(vistos.map((v) => v.api), ['spawnSync', 'execFileSync', 'execSync', 'execFileSync', 'spawn', 'execFile', 'exec', 'fork']);
  assert.equal(vistos.filter((v) => v.api === 'execFile').length, 1, 'o execFile de dentro do exec não pode contar');
  const [neto, efsOk, esync, efsFalha, spawn, execFile, exec, fork] = vistos;
  assert.equal(neto.node, false, 'o neto não-Node é anunciado como tal');
  assert.ok(Number.isInteger(neto.pid) && neto.pid > 0, 'spawnSync devolve o PID');
  for (const v of [spawn, execFile, fork]) {
    assert.equal(v.node, true, v.api);
    assert.ok(Number.isInteger(v.pid) && v.pid > 0, `${v.api} tem de trazer o PID`);
  }
  for (const v of [esync, exec]) assert.equal(v.node, false, `${v.api} passa por shell: o PID é o da shell`);
  assert.equal(efsOk.node, true);
  assert.equal(efsOk.pid, null, 'execFileSync em sucesso devolve o stdout, não o PID — fica por cobrir, e o porque di-lo');
  assert.equal(efsFalha.node, true);
  assert.ok(Number.isInteger(efsFalha.pid) && efsFalha.pid > 0, 'execFileSync em falha atira um erro que traz o PID');
  assert.equal(child_process.spawn.name, 'spawn', 'o vigia foi reposto');
});

test('H5 · um neto Node por `execFileSync` fica por cobrir e o porque diz que foi o PID que faltou', async () => {
  // A consequência do que H4 mede, vista de fora: é `n/d`, não `true`, e não é
  // um `n/d` mudo — nomeia a porta que não devolveu o PID.
  const cod = "require('child_process').execFileSync(process.execPath, ['-e','0'], {stdio:'ignore'})";
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.rede_zero, null);
  assert.equal(auditoria.filhos[0].sonda.filhos[0].pid, null);
  assert.match(auditoria.porque, /execFileSync não devolveu o PID/);
  // O neto anunciou-se na mesma (herdou o NODE_OPTIONS) — só não se consegue
  // casar com o anúncio. Aparece como descendente não registado.
  assert.equal(auditoria.descendentes.length, 1);
  assert.match(auditoria.descendentes[0].cmd, /não registado/);
});

test('pareceNode reconhece o execPath e o nome, e mais nada', () => {
  assert.equal(pareceNode(process.execPath), true);
  assert.equal(pareceNode('node'), true);
  assert.equal(pareceNode('C:\\Program Files\\nodejs\\node.exe'), true);
  assert.equal(pareceNode('/usr/bin/node'), true);
  assert.equal(pareceNode('curl.exe'), false);
  assert.equal(pareceNode('nodemon'), false);
  assert.equal(pareceNode(''), false);
  assert.equal(pareceNode(undefined), false);
});

test('classificarPorCamadas: o terceiro eixo — um filho anunciado por cobrir é `n/d` com o nome', () => {
  const curl = { api: 'spawnSync', cmd: 'curl.exe', args: ['-s', 'http://x'], pid: 1, node: false, coberto: false };
  const nodeOk = { api: 'spawn', cmd: process.execPath, args: ['-e', '0'], pid: 2, node: true, coberto: true };
  const r1 = classificarPorCamadas({ saidas: [], addons: [], amostras: 0, filhos: [curl] });
  assert.equal(r1.estado, 'n/d');
  assert.match(r1.porque, /curl\.exe -s http:\/\/x/);
  const r2 = classificarPorCamadas({ saidas: [], addons: [], amostras: 0, filhos: [nodeOk] });
  assert.equal(r2.estado, 'instrumentado');
  assert.match(r2.porque, /1 filho\(s\) anunciado\(s\), 1 coberto\(s\)/);
  // Um coberto ao lado de um por cobrir continua a ser um por cobrir.
  assert.equal(classificarPorCamadas({ saidas: [], addons: [], amostras: 0, filhos: [nodeOk, curl] }).estado, 'n/d');
  // Addons COM amostras e um neto por cobrir: o neto ganha, é `n/d`.
  assert.equal(classificarPorCamadas({ saidas: [], addons: ['x.node'], amostras: 3, filhos: [curl] }).estado, 'n/d');
  // A frase que a lente derrubou não pode voltar.
  for (const r of [r1, r2, classificarPorCamadas({ saidas: [], addons: [], amostras: 0 })]) {
    assert.doesNotMatch(r.porque, /não sobra camada/);
  }
});

test('lerRegistoDosFilhos guarda os anúncios de filhos, com o PID do neto em `pid_filho`', () => {
  // `pid` na linha é quem ANUNCIA (a sentinela escreve `pid: process.pid`); o
  // PID de quem nasceu viaja em `pid_filho`. Um `pid` no anúncio sobrepunha o
  // do anunciante e atribuía a linha ao neto.
  const { porPid, partidas } = lerRegistoDosFilhos('/x', {
    readImpl: () => [
      JSON.stringify({ pid: 10, ev: 'sentinela-carregada', apis: 71 }),
      JSON.stringify({ pid: 10, ev: 'filho', api: 'spawnSync', cmd: 'curl.exe', args: ['-s'], pid_filho: 11, node: false }),
      JSON.stringify({ pid: 10, ev: 'filho', api: 'spawn', cmd: 'node', args: [], pid_filho: 12, node: true }),
      JSON.stringify({ pid: 12, ev: 'sentinela-carregada', apis: 71 }),
    ].join('\n'),
  });
  assert.equal(partidas, 0);
  assert.equal(porPid.get(10).filhos.length, 2);
  assert.deepEqual(porPid.get(10).filhos[0], { api: 'spawnSync', cmd: 'curl.exe', args: ['-s'], pid: 11, node: false });
  assert.equal(porPid.get(10).filhos[1].pid, 12);
  assert.equal(porPid.get(12).carregada, true);
  assert.equal(porPid.has(11), false, 'o curl nunca escreve nada: só existe no anúncio');
});

test('MORDIDA · P · uma linha `saida` truncada no registo leva o veredicto a `null`, nunca a `true`', async () => {
  // O `probe/p.mjs` da lente: `lerRegistoDosFilhos` contava a linha partida e o
  // chamador de produção fazia `const { porPid } = …` — `partidas` caía no chão
  // e uma tentativa de exfiltração registada pela própria sentinela desaparecia
  // com «todos medidos». Uma saída registada e partida nunca pode virar zero.
  const reg = path.join(os.tmpdir(), `rede-zero-partido-${process.pid}-${Date.now()}.jsonl`);
  fs.writeFileSync(reg,
    JSON.stringify({ pid: 424242, ev: 'sentinela-carregada', apis: 71 }) + '\n'
    + '{"pid":424242,"ev":"saida","api":"fetch","alvo":"https://exfil.exempl' + '\n');
  const { auditoria } = await medirRede(async () => {}, { registo: reg, sondaImpl: sondaLimpa });

  assert.equal(auditoria.rede_zero, null);
  assert.equal(auditoria.partidas, 1, 'a contagem tem de viajar na auditoria');
  assert.match(auditoria.porque, /partid/i);
  assert.match(auditoria.porque, /1 linha/);
});

test('P2 · o MESMO registo íntegro dá o veredicto de antes — completo é `false`, só carregada é `null` sem «partida»', async () => {
  // O par positivo, nas duas direcções: a linha completa é uma saída (`false`,
  // a nomear o alvo); sem a linha, um descendente calado — `null` desde
  // 2026-09-11 (é um processo sem isolamento), mas por ESSE motivo e não por
  // linha partida. `partidas` é zero nos dois e não aparece no `porque`.
  const reg = path.join(os.tmpdir(), `rede-zero-integro-${process.pid}-${Date.now()}.jsonl`);
  fs.writeFileSync(reg,
    JSON.stringify({ pid: 424242, ev: 'sentinela-carregada', apis: 71 }) + '\n'
    + JSON.stringify({ pid: 424242, ev: 'saida', api: 'fetch', alvo: 'https://exfil.example' }) + '\n');
  const a = (await medirRede(async () => {}, { registo: reg, sondaImpl: sondaLimpa })).auditoria;
  assert.equal(a.rede_zero, false);
  assert.equal(a.partidas, 0);
  assert.match(a.porque, /exfil\.example/);

  fs.writeFileSync(reg, JSON.stringify({ pid: 424242, ev: 'sentinela-carregada', apis: 71 }) + '\n');
  const b = (await medirRede(async () => {}, { registo: reg, sondaImpl: sondaLimpa })).auditoria;
  assert.equal(b.rede_zero, null);
  assert.equal(b.partidas, 0);
  assert.doesNotMatch(b.porque, /partid/i);
  assert.match(b.porque, /sem isolamento do SO/);
});

test('auditar: `partidas > 0` é `null` sem saída encontrada, e uma saída ENCONTRADA ganha à mesma', () => {
  const medido = { cmd: 'a', sonda: { estado: 'bloqueado', remotos: [], saidas: [], amostras: 1, porque: null } };
  assert.equal(auditar({ filhos: [medido], partidas: 0 }).rede_zero, true);
  const r = auditar({ filhos: [medido], partidas: 2 });
  assert.equal(r.rede_zero, null);
  assert.equal(r.partidas, 2);
  assert.match(r.porque, /2 linha\(s\).*partida/);
  // Uma chamada registada continua a ganhar: partido não apaga o que se viu.
  assert.equal(auditar({ chamadas: [{ api: 'fetch', alvo: 'x' }], partidas: 2 }).rede_zero, false);
  // E ao lado de um `n/d` os dois motivos aparecem.
  const cego = { cmd: 'b', sonda: { estado: 'n/d', remotos: [], saidas: [], amostras: 0, porque: 'sem sonda' } };
  const r2 = auditar({ filhos: [medido, cego], partidas: 1 });
  assert.equal(r2.rede_zero, null);
  assert.match(r2.porque, /partida/);
  assert.match(r2.porque, /sem sonda/);
});

test('o cabeçalho de rede-zero.mjs deixou de citar o teste do spawnVivo como prova sobre os netos', () => {
  // A lente apontou o non-sequitur: o teste `spawnVivo` verifica que o
  // ADAPTADOR passa pelo ponto de registo, não o que o filho faz nascer. A
  // frase que o citava como fecho não pode voltar.
  const pai = fs.readFileSync(path.join(AQUI, 'rede-zero.mjs'), 'utf8');
  assert.doesNotMatch(pai, /trancado por um teste que exige `spawnVivo`/);
  assert.doesNotMatch(pai, /não sobra camada por observar`/);
});

// ────────────────────────────────────────────────────────────────────────────
// A 3.ª LENTE, 2026-09-11 (codex/OpenAI). Quatro escapes com `rede_zero: true`,
// e a conclusão que os quatro têm em comum: UMA SENTINELA DENTRO DO PROCESSO
// NÃO PROVA ZERO REDE. A partir daqui `true` só sai por construção.
//
//   W1 · Worker com env sem NODE_OPTIONS   → HTTP 200 real com `true`; tem de ser `null`, worker nomeado
//   W2 · process.binding('tcp_wrap')       → TCP ligado com `true`; tem de ser `null`, binding nomeado
//   W3 · UDP entre amostras (udp_max=1)    → DNS real com `true`; tem de ser `null`, UDP nomeado
//   W4 · shell do WSL antes do unshare     → ver produtores.test.mjs
//
// Cada um foi reproduzido contra 481ea0d7 ANTES de tocar no código, com as
// sondas do próprio adversário; a saída literal está na mensagem do commit.
// Nenhum destes testes precisa de rede real: o que se afirma é que o veredicto
// NÃO PODE ser `true`, não que a saída chegou a algum lado.
// ────────────────────────────────────────────────────────────────────────────

/** TCP cru por `process.binding`, contra TEST-NET-1, fechado logo a seguir. */
const TENTATIVA_TCP_CRUA = `const {TCP,TCPConnectWrap,constants}=process.binding('tcp_wrap');const t=new TCP(constants.SOCKET);const r=new TCPConnectWrap();r.oncomplete=()=>{};t.connect(r,'${BURACO}',80);t.close();`;

test('MORDIDA · W1 · um worker nascido com env sem o NODE_OPTIONS da sentinela não pode deixar o veredicto em `true`', async () => {
  // O `worker.cjs` da lente, sem o `http.get` real: o worker tenta um
  // `net.connect` para TEST-NET e destrói o socket. A sentinela não está lá
  // dentro (o env apagou o `--require`), logo não intercepta nada — e em
  // 481ea0d7 o processo saía `instrumentado · true`. Agora o worker é ANUNCIADO
  // com o `tid`, fica por cobrir, o processo é `n/d` e o `porque` nomeia-o.
  const worker = `try{const s=require('net').connect(80,'${BURACO}');s.on('error',()=>{});s.destroy()}catch(e){}`;
  const cod = `const {Worker}=require('node:worker_threads');const w=new Worker(${JSON.stringify(worker)},{eval:true,execArgv:[],env:{...process.env,NODE_OPTIONS:''}});w.on('exit',()=>{});`;
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.notEqual(auditoria.rede_zero, true, 'um worker sem sentinela nunca pode dar `true`');
  assert.equal(auditoria.rede_zero, null);
  const f = auditoria.filhos[0];
  assert.equal(f.sonda.estado, 'n/d');
  assert.equal(f.sonda.workers.length, 1, 'o worker tem de ter sido anunciado');
  assert.equal(f.sonda.workers[0].coberto, false);
  assert.equal(f.sonda.workers[0].herda_sentinela, false, 'as opções previam que NÃO herdava');
  assert.equal(f.sonda.workers[0].env, 'proprio');
  assert.equal(f.sonda.workers[0].execArgv, true);
  assert.match(auditoria.porque, /worker\(s\) sem sentinela/);
  assert.match(auditoria.porque, /env sem o NODE_OPTIONS/);
});

test('W1b · o MESMO worker com as opções por omissão herda a sentinela, anuncia-se com o tid, e a saída dele conta', async () => {
  // O controlo da própria lente: com `{eval:true}` a sentinela entra no worker.
  // O anunciado casa com a `sentinela-carregada` do `tid` dele (coberto), e a
  // tentativa lá dentro é interceptada → `false`. Uma saída vista é uma saída.
  const worker = `try{require('net').connect(80,'${BURACO}')}catch(e){}`;
  const cod = `const {Worker}=require('node:worker_threads');const w=new Worker(${JSON.stringify(worker)},{eval:true});w.on('error',()=>{});w.on('exit',()=>{});`;
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['-e', cod], { env: ctx.ambiente });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.equal(auditoria.rede_zero, false);
  const f = auditoria.filhos[0];
  assert.equal(f.sonda.workers.length, 1);
  assert.equal(f.sonda.workers[0].coberto, true, 'a sentinela do worker escreveu a sua própria sentinela-carregada com o tid');
  assert.equal(f.sonda.workers[0].herda_sentinela, true);
  assert.equal(f.sonda.saidas.length, 1);
  assert.equal(f.sonda.saidas[0].tid, f.sonda.workers[0].tid, 'a saída diz de que thread veio');
  assert.match(auditoria.porque, new RegExp(escapar(BURACO)));
});

test('MORDIDA · W2 · process.binding(tcp_wrap) liga por baixo dos guardas — o veredicto não pode ser `true`', async () => {
  // O `binding.cjs` da lente, contra TEST-NET em vez de 1.1.1.1. `TCP.connect`
  // não passa por `net.Socket.prototype.connect` nem por `dlopen`: a sentinela
  // vê `saidas: []`, `addons: []`, e em 481ea0d7 dizia `instrumentado · true`.
  // NÃO se intercepta `process.binding` (ver o cabeçalho da sentinela): o que
  // muda é que `instrumentado` deixou de ser prova. O `porque` nomeia o buraco.
  const { auditoria } = await medirRede(async (ctx) => {
    const p = child_process.spawn(process.execPath, ['--no-deprecation', '-e', TENTATIVA_TCP_CRUA], { env: ctx.ambiente, stdio: 'ignore' });
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaLimpa, intervaloSondaMs: 60_000 });

  assert.notEqual(auditoria.rede_zero, true, 'TCP cru por baixo de net: a sentinela não o vê, e não pode dizer zero');
  assert.equal(auditoria.rede_zero, null);
  assert.equal(auditoria.filhos[0].sonda.estado, 'instrumentado', 'a evidência da sentinela fica anexada tal como é');
  assert.equal(auditoria.filhos[0].sonda.saidas.length, 0, '…e é exactamente por isso que não é prova');
  assert.match(auditoria.porque, /process\.binding/);
  assert.match(auditoria.porque, /evidência, não veredicto/);
});

test('MORDIDA · W3 · um endpoint UDP visto pela sonda (udp_max>0) nunca deixa o veredicto em `true`', async () => {
  // O `udp.mjs` da lente: consulta DNS a 1.1.1.1:53, 61 bytes de resposta, 3
  // amostras da sonda com `udp_max=1` — e `auditar()` não olhava para
  // `udp_max`. Aqui a sonda é injectada a dizer «há um endpoint UDP», sem rede.
  const sondaUdp = async () => ({ remotos: [], udp: 1 });
  const { auditoria } = await medirRede(async () => {
    const p = child_process.spawn(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
    await new Promise((r) => p.on('close', r));
  }, { sondaImpl: sondaUdp, intervaloSondaMs: 20, registo: null });

  assert.ok(auditoria.filhos[0].sonda.amostras >= 1);
  assert.equal(auditoria.filhos[0].sonda.udp_max, 1);
  assert.notEqual(auditoria.rede_zero, true);
  assert.equal(auditoria.rede_zero, null);
  assert.match(auditoria.porque, /endpoint UDP/);
  assert.match(auditoria.porque, /udp_max=1/);
  assert.match(auditoria.porque, /sinal do SO nunca dá true/);
});

test('W3b · auditar: `udp_max` é lido em qualquer estado sem isolamento, e ignorado só num `bloqueado` (a sonda do Windows não vê a VM)', () => {
  const com = (estado) => ({ cmd: 'x', sonda: { estado, remotos: [], saidas: [], amostras: 3, udp_max: 1, porque: '' } });
  for (const estado of ['instrumentado', 'sondado']) {
    const r = auditar({ filhos: [com(estado)] });
    assert.equal(r.rede_zero, null, estado);
    assert.match(r.porque, /endpoint UDP/, estado);
  }
  // Exactamente o caso literal da lente: `sondado`, 1 amostra, udp_max=1, remotos vazios.
  assert.equal(auditar({ filhos: [{ cmd: 'udp', sonda: { estado: 'sondado', amostras: 1, udp_max: 1, remotos: [] } }] }).rede_zero, null);
  // Num `bloqueado` a contagem do wsl.exe é cega: mantém-se o que já estava.
  const r = auditar({ filhos: [com('bloqueado')] });
  assert.equal(r.rede_zero, true);
  assert.doesNotMatch(r.porque, /UDP/);
  // Um remoto continua a ganhar a tudo, em qualquer estado — incluindo bloqueado.
  assert.equal(auditar({ filhos: [{ cmd: 'x', sonda: { estado: 'bloqueado', remotos: ['1.1.1.1'], saidas: [], amostras: 1, udp_max: 0 } }] }).rede_zero, false);
});

test('W5 · `true` só por construção: a lista de estados que provam tem UM elemento, o `porque` di-lo, e os limites estão escritos', () => {
  assert.deepEqual([...ESTADOS_POR_CONSTRUCAO], ['bloqueado']);
  const r = auditar({ filhos: [{ cmd: 'wsl.exe', sonda: { estado: 'bloqueado', remotos: [], saidas: [], amostras: 1, udp_max: 0 } }] });
  assert.equal(r.rede_zero, true);
  assert.match(r.porque, /TODOS em isolamento do SO por construção/);
  // O que fica fora está escrito numa lista, e essa lista é a que viaja no porque.
  assert.equal(FORA_DA_SENTINELA.length, 3);
  const nulo = auditar({ filhos: [{ cmd: 'node', sonda: { estado: 'instrumentado', remotos: [], saidas: [], amostras: 0, udp_max: 0, instrumentado: true, addons: [], filhos: [], workers: [] } }] });
  for (const item of FORA_DA_SENTINELA) assert.ok(nulo.porque.includes(item), `o porque tem de nomear: ${item}`);
  // E o cabeçalho de rede-zero.mjs escreve os quatro limites (os três da sentinela + a shell do WSL).
  const pai = fs.readFileSync(path.join(AQUI, 'rede-zero.mjs'), 'utf8');
  for (const marca of ['process.binding', 'workers nascidos', 'UDP entre amostras', 'shell de arranque do WSL']) {
    assert.match(pai, new RegExp(escapar(marca)), `o cabeçalho tem de escrever o limite: ${marca}`);
  }
  const sentinela = fs.readFileSync(path.join(AQUI, 'rede-zero-sentinela.cjs'), 'utf8');
  assert.match(sentinela, /process\.binding/, 'a sentinela escreve o motivo estrutural de não provar nada');
  const codigo = sentinela.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codigo, /process\.binding\s*=/, 'e NÃO o embrulha');
});

test('W6 · o vigia de workers anuncia tid, execArgv e a previsão do env — medido em processo', async () => {
  // As cinco formas medidas no cabeçalho de `instalarVigiaDeWorkers`. A
  // previsão é feita a partir das opções; a cobertura (W1/W1b) é outra coisa.
  const vistos = [];
  const vigia = instalarVigiaDeWorkers({ aoWorker: (w) => vistos.push(w), nodeOptions: '--require x', registo: '/r' });
  try {
    assert.deepEqual([...vigia.instaladas], ['Worker']);
    const { Worker, SHARE_ENV } = worker_threads;
    const esperar = (w) => new Promise((r) => { w.on('exit', r); w.on('error', r); });
    await esperar(new Worker('0', { eval: true }));
    await esperar(new Worker('0', { eval: true, execArgv: [] }));
    await esperar(new Worker('0', { eval: true, env: SHARE_ENV }));
    await esperar(new Worker('0', { eval: true, env: { NODE_OPTIONS: '--require x', REDE_ZERO_REGISTO: '/r' } }));
    await esperar(new Worker('0', { eval: true, env: { NODE_OPTIONS: '' } }));
  } finally { vigia.restaurar(); }
  assert.equal(vistos.length, 5);
  for (const v of vistos) assert.ok(Number.isInteger(v.tid) && v.tid > 0, 'cada worker tem tid');
  assert.deepEqual(vistos.map((v) => [v.execArgv, v.env, v.herda_sentinela]), [
    [false, 'herdado', true],
    [true, 'herdado', true],
    [false, 'herdado', true],
    [false, 'proprio', true],
    [false, 'proprio', false],
  ]);
  assert.equal(worker_threads.Worker.name, 'Worker', 'o vigia foi reposto');
});

test('W7 · lerRegistoDosFilhos: a sentinela-carregada de um worker cobre o tid, não o PID; registos sem tid continuam a ler', () => {
  const { porPid } = lerRegistoDosFilhos('/x', {
    readImpl: () => [
      JSON.stringify({ pid: 10, tid: 0, ev: 'sentinela-carregada', apis: 71 }),
      JSON.stringify({ pid: 10, tid: 0, ev: 'worker', tid_worker: 1, execArgv: true, env: 'proprio', herda_sentinela: false }),
      JSON.stringify({ pid: 10, tid: 0, ev: 'worker', tid_worker: 2, execArgv: false, env: 'herdado', herda_sentinela: true }),
      JSON.stringify({ pid: 10, tid: 2, ev: 'sentinela-carregada', apis: 71 }),
      JSON.stringify({ pid: 10, tid: 2, ev: 'saida', api: 'net.connect', alvo: '192.0.2.1:80' }),
      JSON.stringify({ pid: 11, ev: 'sentinela-carregada', apis: 71 }),
    ].join('\n'),
  });
  const r = porPid.get(10);
  assert.equal(r.carregada, true);
  assert.equal(r.workers.length, 2);
  assert.deepEqual([...r.workersCarregados], [2], 'só o worker 2 se anunciou');
  assert.equal(r.saidas.length, 1);
  assert.equal(r.saidas[0].tid, 2, 'a saída diz de que thread veio');
  assert.equal(porPid.get(11).carregada, true, 'uma linha sem tid é a thread principal (registo antigo)');
});
