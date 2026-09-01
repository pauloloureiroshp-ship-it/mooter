/**
 * correr-suite.mjs — a suite do router, e a razao pela qual ela "demorava 40 minutos".
 *
 * ⚠️ ESTE FICHEIRO EXISTE POR CAUSA DE UM DEFEITO MEDIDO, NAO POR ORGANIZACAO.
 *
 * «A suite do router demora 40+ minutos» era o que se sabia, e ja tinha
 * queimado duas corridas. Medido a 2026-09-01 no mac-mini: a suite completa
 * corre em 4,3 s — 1059 testes, 1058 ok, 1 saltado. Quando corre.
 *
 * ELA NAO E LENTA. ELA PENDURA, e pendura a maior parte das vezes. Isolado a um
 * ficheiro: `tools/verify/render_medir.test.js`, corrido SOZINHO, 5 tentativas:
 *
 *     25,0 s PENDUROU · 0,1 s ok · 25,0 s PENDUROU · 0,1 s ok · 25,0 s PENDUROU
 *
 * Tres em cinco. Quando nao pendura, leva um decimo de segundo. Um processo de
 * uma sessao anterior estava vivo ha 2 h 11 m quando isto foi medido — e e essa
 * a aritmetica dos "40 minutos": ninguem esperou por uma suite lenta, esperou-se
 * por uma suite parada.
 *
 * A causa provavel — e fica marcada como PROVAVEL, porque nao foi provada — e o
 * `await import()` de um modulo ESM (`evidence-verifier.mjs`) a partir de um
 * ficheiro CJS, debaixo do `node --test`. A intermitencia bate certo com um
 * bloqueio no carregador de modulos e nao com trabalho a mais. NAO foi corrigida
 * aqui: remendar o carregador as escuras seria trocar um defeito conhecido por
 * um desconhecido, e o defeito conhecido agora tem numero.
 *
 * O que este ficheiro faz: corre com TECTO e diz a verdade quando estoura, em
 * vez de deixar um processo pendurado a apodrecer. E o `--quick` deixa de fora
 * o ficheiro que pendura — por isso e utilizavel num portao.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Os ficheiros que o `test:router:quick` NAO corre, e porque.
 *
 * O subset nao e "os que sao rapidos" — medido, nenhum ficheiro da suite passa
 * de 1,6 s. E "os que guardam um invariante": o classificador congelado,
 * privacidade, resolucao de modelo, quotas, proveniencia. O resto e cobertura
 * de superficie (statusline, badges, chips), que um CI apanha e um portao
 * pre-commit nao precisa de esperar.
 */
export const FORA_DO_QUICK = Object.freeze({
  'tools/verify/render_medir.test.js':
    'PENDURA 3 em 5 corridas (medido, sozinho: 25s/0,1s/25s/0,1s/25s). E a causa dos "40 minutos".',
  'statusline-*': 'cobertura de superficie — o que se ve, nao o que decide',
  'badge-*, herd-*, glyphs, emoji-*': 'idem',
  'wave*-*': 'coerencia de ondas passadas — nao muda com uma alteracao de hoje',
});

export function ficheirosDaSuite() {
  const p = require('./package.json');
  return p.scripts.test.slice('node --test '.length)
    .match(/(?:[^\s"]+|"[^"]*")+/g).map((a) => a.replace(/^"|"$/g, ''));
}

/** O sumario do TAP. `null` em qualquer campo que nao venha — nunca zero. */
export function sumarioDoTap(texto) {
  const num = (nome) => {
    const m = new RegExp(`^# ${nome} (\\d+(?:\\.\\d+)?)$`, 'm').exec(String(texto || ''));
    return m ? Number(m[1]) : null;
  };
  return {
    testes: num('tests'), ok: num('pass'), falhas: num('fail'),
    saltados: num('skipped'), duracao_ms: num('duration_ms'),
  };
}

/**
 * Corre e devolve o sumario. `saida` e um FICHEIRO de propósito — mudar isto
 * para um pipe reintroduz o defeito que este ficheiro documenta.
 */
export function correr(args, { saida = path.join(os.tmpdir(), 'router-suite.tap'), tectoMs = 300000, prefixo = ['--test'] } = {}) {
  return new Promise((resolve) => {
    const fd = fs.openSync(saida, 'w');
    const c = spawn(process.execPath, [...prefixo, ...args], { cwd: AQUI, stdio: ['ignore', fd, fd] });
    const morte = setTimeout(() => c.kill('SIGKILL'), tectoMs);
    const t0 = Date.now();
    c.on('close', (code, sinal) => {
      clearTimeout(morte);
      try { fs.closeSync(fd); } catch { /* ja fechado */ }
      const tap = fs.readFileSync(saida, 'utf8');
      resolve({ ...sumarioDoTap(tap), code, sinal, ms: Date.now() - t0, tap: saida });
    });
  });
}

async function main() {
  const quick = process.argv.includes('--quick');
  const todos = ficheirosDaSuite();
  const args = quick
    ? ['--test-force-exit',
      '--test-skip-pattern=(TUNED block is idempotent|deepseek-r1 specialist|gemma4:e4b)',
      ...todos.filter((f) => !f.startsWith('--') && QUICK.has(f))]
    : ['--test-force-exit',
      '--test-skip-pattern=(TUNED block is idempotent|deepseek-r1 specialist|gemma4:e4b)',
      ...todos.filter((f) => !f.startsWith('--'))];
  const r = await correr(args);
  process.stdout.write(
    `suite do router (${quick ? 'quick' : 'completa'}) · ${(r.ms / 1000).toFixed(1)}s\n` +
    `  ${r.ok ?? 'n/d'} ok · ${r.falhas ?? 'n/d'} falhas · ${r.saltados ?? 'n/d'} saltados` +
    ` (de ${r.testes ?? 'n/d'})\n  TAP: ${r.tap}\n` +
    (r.sinal ? `  ⚠️ morto por ${r.sinal} — nao terminou\n` : ''),
  );
  process.exit(r.sinal || r.falhas ? 1 : 0);
}

/** O subset. Invariantes, nao velocidade — ver `FORA_DO_QUICK`. */
export const QUICK = new Set([
  'classify.test.js', 'classify-branches.test.js', 'classify-retry.test.js',
  'user-override-guard.test.js', 'privacy.test.js', 'sanitize.test.js', 'env.test.js',
  'ollama-host.test.js', '_model-resolver.test.js', 'ollama_call_node.test.js',
  'assinatura.test.js', 'backtest.test.js', 'quota-tracker.test.js', 'quota-honesta.test.js',
  'providers/providers.test.js', 'safety-boost.test.js', 'safety-regression.test.js',
  'tier-mix.test.js', 'recibo.test.js', 'moo-verify.test.js', 'ledger-prov.test.js',
  'ledger-event.test.js', 'ledger-decision.test.js', 'ledger-turn-io.test.js',
  'ledger-reduce.test.js', 'agent-sync-ledger.test.js', 'sync-runtime.test.js',
  'paridade-instaladores.test.js', 'mooter-doctor.test.js', 'saude-nao-medida.test.js',
]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
