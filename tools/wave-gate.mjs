#!/usr/bin/env node
/**
 * wave-gate — o fecho de wave deixa de depender de alguém se lembrar.
 *
 * PORQUÊ ISTO EXISTE (2026-08-01)
 * A Wave K fechou com `packages/mooter-bridge/fatia-local.js` fora da lista
 * FILES do `pack-mcpb.mjs`. O próximo `.mcpb` publicado teria instalado um
 * servidor quebrado (MODULE_NOT_FOUND em fleet.js, board.js e recibo.js).
 * Havia dois testes exactamente para isso — `bundle.test.js` e
 * `estranho.test.js` — e ambos estavam VERMELHOS. Ninguém correu a suite
 * completa depois de a wave fechar.
 *
 * A REGRA NÃO É "A SUITE PASSA"
 * Seria bonito e seria mentira: `estranho.test.js` e `ondaA.test.js` têm
 * falhas crónicas (testes escritos contra código que nunca foi implementado).
 * Um gate que exige verde seria desligado na primeira semana. A regra que
 * aguenta o contacto com a realidade é: **a suite não pode PIORAR**.
 *
 * O baseline vive em `tools/wave-gate-baseline.json`, versionado. Quando uma
 * falha crónica é resolvida, o baseline desce — e nunca mais pode subir.
 * Subir o baseline é uma decisão consciente, num commit, com justificação;
 * não é uma coisa que acontece por distração.
 *
 * USO
 *   node tools/wave-gate.mjs                      # todos os pacotes do baseline
 *   node tools/wave-gate.mjs packages/mooter-bridge
 *   node tools/wave-gate.mjs --update             # regrava o baseline medido
 *
 * SAÍDA: 0 = pode fechar a wave · 1 = piorou, não fecha · 2 = erro de execução
 */

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const BASELINE = join(HERE, 'wave-gate-baseline.json');

/** A suite completa do mooter-bridge passa dos 2 min. Nunca herdar um timeout curto. */
const TIMEOUT_MS = 10 * 60 * 1000;

function lerBaseline() {
  if (!existsSync(BASELINE)) return {};
  try { return JSON.parse(readFileSync(BASELINE, 'utf8')).pacotes || {}; }
  catch (e) { console.error('baseline ilegível: ' + e.message); process.exit(2); }
}

function correr(pkg) {
  return new Promise((res) => {
    // ⚠️ `--test-reporter=tap` é obrigatório, não é preferência. O reporter por
    // omissão do `node --test` mudou para `spec` no Node 24 (`ℹ pass N` em vez de
    // `# pass N`), e `medir()` deixou de encontrar os totais — o gate passou a
    // devolver "não consegui ler" em TODAS as corridas. Fixar o reporter torna a
    // medição imune à versão do Node que estiver no PATH.
    execFile(process.execPath, ['--test', '--test-reporter=tap'], {
      cwd: join(REPO, pkg), timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const saida = String(stdout || '') + String(stderr || '');
      // ⚠️ `killed` distingue "os testes falharam" de "o processo foi morto".
      // Sem isto, um timeout apareceria como suite verde — a mentira exacta
      // que este ficheiro existe para impedir.
      res({ saida, morto: !!(err && err.killed) });
    });
  });
}

/** Lê os totais do TAP. Devolve null quando não os encontra — nunca zero. */
function medir(saida) {
  const num = (rotulo) => {
    const m = saida.match(new RegExp('^# ' + rotulo + ' (\\d+)$', 'm'));
    return m ? Number(m[1]) : null;
  };
  const falhados = (saida.match(/^not ok .*$/gm) || []).map((l) => l.trim());
  return { pass: num('pass'), fail: num('fail'), falhados };
}

const args = process.argv.slice(2);
const actualizar = args.includes('--update');
const alvos = args.filter((a) => !a.startsWith('--'));
const baseline = lerBaseline();
const pacotes = alvos.length ? alvos : Object.keys(baseline);

if (!pacotes.length) {
  console.error('sem pacotes: passa um caminho ou cria tools/wave-gate-baseline.json');
  process.exit(2);
}

let piorou = false;
const medido = {};

for (const pkg of pacotes) {
  process.stdout.write('· ' + pkg + ' … ');
  const { saida, morto } = await correr(pkg);
  if (morto) {
    console.log('⛔ MORTO POR TIMEOUT — resultado desconhecido, não é verde');
    piorou = true;
    continue;
  }
  const m = medir(saida);
  if (m.fail === null) {
    console.log('⛔ não consegui ler `# fail` da saída TAP — não afirmo nada');
    piorou = true;
    continue;
  }
  medido[pkg] = { fail: m.fail, pass: m.pass, falhados: m.falhados };

  const base = baseline[pkg];
  if (!base) {
    console.log(m.fail + ' falha(s) · sem baseline — corre com --update para o fixar');
    continue;
  }
  if (m.fail > base.fail) {
    console.log('⛔ PIOROU: ' + base.fail + ' → ' + m.fail);
    const novos = m.falhados.filter((f) => !(base.falhados || []).includes(f));
    for (const n of novos) console.log('    novo vermelho: ' + n);
    piorou = true;
  } else if (m.fail < base.fail) {
    console.log('✅ MELHOROU: ' + base.fail + ' → ' + m.fail + ' — corre com --update e commita o baseline');
  } else {
    console.log('✅ estável em ' + m.fail + ' falha(s) crónica(s) · ' + m.pass + ' pass');
  }
}

if (actualizar) {
  const anterior = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  writeFileSync(BASELINE, JSON.stringify({
    _comment: 'Baseline de falhas CRÓNICAS por pacote. A regra é: nunca subir. '
      + 'Descer é bom e deve ser commitado. Subir exige justificação explícita no commit. '
      + 'Gerado por tools/wave-gate.mjs --update.',
    medido_em: new Date().toISOString(),
    pacotes: Object.assign({}, anterior.pacotes, medido),
  }, null, 2) + '\n');
  console.log('\nbaseline regravado em tools/wave-gate-baseline.json');
}

process.exit(piorou ? 1 : 0);
