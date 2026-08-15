#!/usr/bin/env node
/**
 * pack-mcpb.mjs — build the .mcpb from the repo, reproducibly.
 *
 * WHY: until v1.1 the bundle that actually ran in Cowork was NOT in git. The
 * installed `server-apps.js` was 13 138 bytes; the repo's was 6 658. Two truths,
 * and the tests only covered the one nobody was running. This script makes the
 * repo the single source and prints a sha256 so the two can be compared.
 *
 * Zero dependencies: writes the ZIP container by hand (stored, no compression),
 * which every unzip and the Claude Desktop installer accept.
 *
 * Usage: node pack-mcpb.mjs [outputPath]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const OUT = process.argv[2] || path.join(HERE, '..', '..', '_handoff', `mooter-v${manifest.version.replace(/\./g, '')}.mcpb`);

// exact file list — never a glob. A stray file in a bundle is a supply-chain bug.
const FILES = [
  ['manifest.json', 'manifest.json'],
  // ⚠️ SEGUNDA COPIA, DE PROPOSITO. `install-id.js` faz `require('./manifest.json')`
  // (install-id.js:50). No repo isso resolve, porque manifest.json e o vizinho dele.
  // No bundle NAO: install-id.js viaja para `server/` e o manifest fica na raiz do
  // zip (onde o formato .mcpb o exige). O require rebentava com MODULE_NOT_FOUND,
  // e o `catch` da linha 53 — escrito para "sem permissao de escrita" — engolia-o.
  // Efeito medido numa instalacao limpa: `~/.mooter/install-id.json` NUNCA era
  // escrito, o painel dizia "Identidade da instalacao: persistente (gerada agora)"
  // sem ter persistido nada, e cada sessao voltava a anunciar "🐮 primeira vez".
  // Ou seja: o GAP 5 do onboarding ("install-id efemero em silencio") continuava
  // aberto DENTRO da release que o vinha fechar. Herdado desde a v1.29.0 (f46d9ac).
  ['manifest.json', 'server/manifest.json'],
  ['entregas-por-versao.json', 'entregas-por-versao.json'],
  ['icon.png', 'icon.png'],
  ['README.md', 'README.md'],
  ["server-apps.js", "server/server-apps.js"],
  ["gpu.js", "server/gpu.js"],
  ['server.js', 'server/server.js'],
  ['seamless.js', 'server/seamless.js'],
  ['kimi-adapter.js', 'server/kimi-adapter.js'],
  ['install-id.js', 'server/install-id.js'],
  ['fleet.js', 'server/fleet.js'],
  ['fleet-ui.html', 'server/fleet-ui.html'],
  ['telemetry.js', 'server/telemetry.js'],
  ['moo.js', 'server/moo.js'],
  ['plan.js', 'server/plan.js'],
  ['journal.js', 'server/journal.js'],
  ['worktrees.js', 'server/worktrees.js'],
  ['tools6.js', 'server/tools6.js'],
  // Os 5 gaps do onboarding (`_handoff/SUPERMASTER_MAC_MINI.md:100-111`). Sem esta linha o
  // conector publicado rebentava no `require('./onboarding.js')` do tools6.js — e só se saberia
  // já instalado, na máquina do estranho. O `bundle.test.js` apanhou-a no minuto exacto.
  ['onboarding.js', 'server/onboarding.js'],
  ['radar.js', 'server/radar.js'],
  ['sinal-valor.js', 'server/sinal-valor.js'],
  ['localfirst.js', 'server/localfirst.js'],
  // Oráculo de regressão (auditoria E2E 2026-08-01). O `bundle.test.js` apanhou a
  // ausência desta linha no minuto em que o `seamless.js` passou a requerê-lo —
  // sem ela o conector publicado rebentaria no require, e só se saberia depois
  // de instalado. É exactamente o género de erro que só um gate mecânico apanha.
  ['oraculo.js', 'server/oraculo.js'],
  ['aprender.js', 'server/aprender.js'],
  ['eta.js', 'server/eta.js'],
  ['estimativa.js', 'server/estimativa.js'],
  ['sync.js', 'server/sync.js'],
  ['fatia-local.js', 'server/fatia-local.js'],
  ['terminal.js', 'server/terminal.js'],
  // f-mu0: identidade no envelope do ledger. Entra pela mesma porta e pela mesma
  // razão que o oraculo.js acima — o B1 apanhou-a no minuto em que o seamless.js
  // passou a requerê-la. Sem esta linha, quem instalasse o .mcpb tinha um
  // conector que morre no primeiro require, com o repo todo verde.
  ['actor.js', 'server/actor.js'],
  ['retry.js', 'server/retry.js'],
  ['board.js', 'server/board.js'],
  ['recibo.js', 'server/recibo.js'],
  ['recibo-contexto.js', 'server/recibo-contexto.js'],
  ['sentinela.js', 'server/sentinela.js'],
  ['afericao.js', 'server/afericao.js'],
  ['afericao-tarefas.json', 'server/afericao-tarefas.json'],
  ['capacidades.js', 'server/capacidades.js'],
  ['fosso.js', 'server/fosso.js'],
  ['context.js', 'server/context.js'],
  ['paths.js', 'server/paths.js'],
  ['arvore.js', 'server/arvore.js'],
  ['probe.js', 'server/probe.js'],
  // Wave LP (2026-08-05): probe.js passou a requerer retrato-mapa.js, e
  // preview.js passou a requerer dono.js + portas-do-projecto.js. Ficaram fora
  // desta lista — o B1 apanhou-o ANTES de custar uma release, que é o trabalho dele.
  ['retrato-mapa.js', 'server/retrato-mapa.js'],
  ['dono.js', 'server/dono.js'],
  ['portas-do-projecto.js', 'server/portas-do-projecto.js'],
  // v1.48 — a Trilha. `trilha-tool.js` é requerido pelos DOIS entrypoints;
  // `trilha.js` é requerido preguiçosamente por ele. Fora da lista, o bundle
  // morre no primeiro require e o Cowork só sabe dizer "o servidor falhou".
  ['trilha-tool.js', 'server/trilha-tool.js'],
  ['trilha.js', 'server/trilha.js'],
  ['preview.js', 'server/preview.js'],
  ['quota.js', 'server/quota.js'],
  ['update.js', 'server/update.js'],
  ['sessao.js', 'server/sessao.js'],
  ['bundle-package.json', 'server/package.json'],
  // ⚠️ classify.js is FROZEN (CI-enforced sha256) — copying it verbatim is the
  // one thing this file is allowed to do with it. But classify.js is not
  // self-contained: it `require('./patterns')` unconditionally at module load
  // and reads `tuning-state.defaults.json` from its own __dirname with no
  // fallback if that read fails. Ship classify.js alone and every install
  // without ~/frugal cloned gets a router that throws on the first require.
  // version.json is optional (wrapped in try/catch inside classify.js) but
  // costs nothing to ship — the alternative is a fabricated 'v0.0.0-unknown'.
  ['../../tools/router/classify.js', 'server/classify.js'],
  ['../../tools/router/patterns.js', 'server/patterns.js'],
  ['../../tools/router/tuning-state.defaults.json', 'server/tuning-state.defaults.json'],
  ['../../tools/router/version.json', 'server/version.json'],
];

function minorKey(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || ''));
  if (!match) throw new Error('manifest.version não é semver MAJOR.MINOR.PATCH: ' + String(version || 'n/d'));
  return match[1] + '.' + match[2];
}

function verifyDeliveries(version, deliveries, files, root) {
  const key = minorKey(version);
  if (!deliveries || !Object.prototype.hasOwnProperty.call(deliveries, key)) {
    throw new Error(
      'VERSÃO ' + version + ' NÃO PODE SER EMPACOTADA — não existe declaração para ' + key + '.\n'
      + 'Faz assim: declara a entrega em entregas-por-versao.json antes de subir manifest.json.',
    );
  }
  const expected = deliveries[key];
  if (!Array.isArray(expected) || expected.some((file) => typeof file !== 'string' || !file.trim())) {
    throw new Error('VERSÃO ' + version + ' NÃO PODE SER EMPACOTADA — a entrega ' + key + ' não é uma lista válida.');
  }
  const bundled = new Set(files.map(([src]) => src));
  const missing = expected.filter((file) => !fs.existsSync(path.join(root, file)));
  const outsideBundle = expected.filter((file) => !bundled.has(file));
  if (!missing.length && !outsideBundle.length) return;
  const problems = [];
  if (missing.length) problems.push('faltam no repo: ' + missing.join(', '));
  if (outsideBundle.length) problems.push('existem mas não entram em FILES: ' + outsideBundle.join(', '));
  throw new Error(
    'VERSÃO ' + version + ' NÃO PODE SER EMPACOTADA — entrega ' + key + ' incompleta: '
    + problems.join('; ') + '.\n'
    + 'Faz assim: adiciona os ficheiros à bridge e a FILES; se a entrega mudou, corrige em conjunto '
    + 'manifest.json e entregas-por-versao.json antes de empacotar.',
  );
}

const IMPORT_ONLY = process.env.MOOTER_PACK_IMPORT_ONLY === '1';
if (!IMPORT_ONLY) {
  try {
    const deliveries = JSON.parse(fs.readFileSync(path.join(HERE, 'entregas-por-versao.json'), 'utf8'));
    verifyDeliveries(manifest.version, deliveries, FILES, HERE);
  } catch (error) {
    console.error((error && error.message) || String(error));
    process.exit(1);
  }
}

/**
 * ⚠️ `verifyDeliveries` prova que os ficheiros EXISTEM, não que fazem alguma coisa.
 *
 * Um `existsSync` passa com um ficheiro vazio. Até aqui, qualquer pessoa podia
 * empacotar uma versão cuja entrega tinha sido regredida, e o bundle saía com o
 * carimbo de aprovado. O `entrega.test.js` verifica marcadores de conteúdo — mas
 * só valia se alguém se lembrasse de o correr. Agora o pack corre-o sozinho e
 * recusa-se a produzir um `.mcpb` se ele falhar: o gate está no caminho, não na
 * disciplina de quem empacota.
 *
 * Só este teste, de propósito. A bateria inteira demora e transformaria o pack
 * num CI — o que faria as pessoas contorná-lo com uma variável de ambiente.
 */
if (!IMPORT_ONLY && process.env.MOOTER_PACK_SKIP_GATE !== '1') {
  const gate = spawnSync(process.execPath, ['--test', 'entrega.test.js'], { cwd: HERE, encoding: 'utf8' });
  if (gate.status !== 0) {
    console.error('GATE DE ENTREGA FALHOU — o bundle NÃO foi escrito.');
    console.error('A entrega declarada para ' + manifest.version + ' não está implementada, ou foi regredida.');
    console.error((gate.stdout || '').split('\n').filter((l) => /^not ok|falta o marcador/.test(l)).join('\n'));
    console.error('Faz assim: corrige o código, ou corrige entregas-por-versao.json se a entrega mudou.');
    process.exit(1);
  }
  const passed = /^# pass (\d+)/m.exec(gate.stdout || '');
  console.log('gate de entrega: ' + (passed ? passed[1] : 'n/d') + ' verificações de conteúdo OK');
}

/**
 * ⚠️ O bundle é uma lista à mão — e uma lista à mão esquece-se.
 *
 * A v1.4.2 acrescentou `paths.js` e, se ficasse de fora, o conector instalado
 * morria no primeiro `require` com o Cowork a dizer apenas "servidor falhou".
 * Em vez de confiar na memória, lemos os `require('./x.js')` de cada ficheiro
 * que vai no bundle e exigimos que todos estejam na lista. Falha o build, não
 * a máquina do utilizador.
 */
/**
 * ⚠️ Um comentário que MENCIONE um require não é um require.
 *
 * O detector varria o texto cru e apanhou `// todos os require('./x.js') têm de
 * existir` — uma frase de documentação — e recusou o build inteiro por causa de
 * um ficheiro `x.js` que nunca existiu. Um guarda que dá falsos positivos acaba
 * por ser desligado, e um guarda desligado não guarda nada.
 */
function semComentarios(texto) {
  return String(texto)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // blocos
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // linha (sem apanhar http://)
}

/**
 * ⚠️ Perguntar "o ficheiro vai no bundle?" NÃO é a pergunta certa.
 *
 * A pergunta que o Node faz em runtime é outra: "o ficheiro está ao lado de quem
 * o pede, DEPOIS de o zip ser desempacotado?". Este detector comparava o nome do
 * require contra a lista de ORIGENS (`src`) e dava verde a
 * `install-id.js -> manifest.json` — que está mesmo na lista, mas com destino na
 * RAIZ do zip, enquanto o install-id.js aterra em `server/`. O require rebentava
 * na máquina de quem instala e ninguém sabia, porque o `catch` que existia para
 * "sem permissão de escrita" engolia o MODULE_NOT_FOUND.
 *
 * Agora a verificação é feita nos DESTINOS: para um ficheiro que aterra em
 * `server/x.js`, `require('./y.json')` exige um destino `server/y.json`. É a
 * mesma resolução que o Node faz, e é por isso que apanha o que a outra não
 * apanhava. `.json` conta tanto como `.js`.
 */
function verificarRequires(files) {
  const destinos = new Set(files.map(([, dest]) => dest));
  const faltam = [];
  for (const [src, dest] of files) {
    if (!src.endsWith('.js')) continue;
    const texto = semComentarios(fs.readFileSync(path.join(HERE, src), 'utf8'));
    const pasta = path.posix.dirname(dest);
    const re = /require\(\s*['"]\.\/([\w.-]+\.(?:js|json))['"]\s*\)/g;
    let m;
    while ((m = re.exec(texto)) !== null) {
      const alvo = path.posix.join(pasta === '.' ? '' : pasta, m[1]);
      if (!destinos.has(alvo)) faltam.push(dest + ' -> require("./' + m[1] + '") => ' + alvo + ' (nao existe no bundle)');
    }
  }
  if (faltam.length) {
    console.error('BUNDLE INCOMPLETO — estes require ficariam sem ficheiro depois de instalado:');
    for (const f of faltam) console.error('  ' + f);
    process.exit(1);
  }
}
verificarRequires(FILES);

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

if (!IMPORT_ONLY) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [src, dest] of FILES) {
    const p = path.join(HERE, src);
    if (!fs.existsSync(p)) { console.error('FALTA: ' + src); process.exit(1); }
    const data = fs.readFileSync(p);
    const name = Buffer.from(dest, 'utf8');
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);                    // stored
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x2821, 12);   // fixed timestamp = reproducible
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x2821, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);

    offset += lh.length + name.length + data.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(FILES.length, 8); eocd.writeUInt16LE(FILES.length, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16);

  const zip = Buffer.concat([...locals, central, eocd]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zip);

  console.log('mooter ' + manifest.version + '  ->  ' + OUT);
  console.log('  ' + FILES.length + ' ficheiros, ' + zip.length + ' bytes');
  console.log('  sha256 ' + crypto.createHash('sha256').update(zip).digest('hex'));
}

export { verifyDeliveries };
