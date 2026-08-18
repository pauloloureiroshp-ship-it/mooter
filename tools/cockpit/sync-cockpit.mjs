#!/usr/bin/env node
/**
 * sync-cockpit.mjs — espelha o cockpit para ~/.claude/tools/cockpit/.
 *
 * A causa que este modulo existe para matar, medida a 2026-08-18:
 *   nada fora de `tools/cockpit/` importa o cockpit (`grep -rl tools/cockpit
 *   packages/ hub/ landing/` -> vazio), o `/mooter-update` so sincroniza
 *   `tools/router/*.js`, skills, agents e hooks, e o LaunchAgent aponta direto
 *   para dentro do checkout: `<checkout>/tools/cockpit/runner/moo-runner.mjs`.
 *   Ou seja: o runner nao tinha canal de distribuicao NENHUM. Melhora-lo
 *   melhorava uma maquina — a que tem o repo clonado.
 *
 * O erro que NAO se repete aqui: o `sync-hooks.js` nasceu porque o espelho dos
 * hooks existia e o `settings.json` apontava para outro sitio — 63 sessoes, 0
 * journals, em silencio. Um espelho que ninguem corre e decoracao. Por isso o
 * self-check nao se limita a comparar shas: vai ver PARA ONDE o LaunchAgent
 * aponta, e diz alto quando aponta para o checkout em vez do espelho.
 *
 * Idempotente (salta ficheiros identicos). Aditivo (nunca apaga). Seguro (.bak
 * antes de sobrepor). Node puro, sem dependencias.
 *
 *   node tools/cockpit/sync-cockpit.mjs             espelha + self-check
 *   node tools/cockpit/sync-cockpit.mjs --check     so o self-check
 *   node tools/cockpit/sync-cockpit.mjs --dry-run   diz o que faria
 *   node tools/cockpit/sync-cockpit.mjs --dest <d>  outro destino
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const ORIGEM_RUNNER = path.join(AQUI, 'runner');
export const ORIGEM_SHELL = path.join(AQUI, 'moo-pilot-shell.html');

/** O destino canonico, ao lado do espelho do router que ja existe. */
export function destinoPadrao(home = os.homedir()) {
  return path.join(home, '.claude', 'tools', 'cockpit');
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

/**
 * O que constitui um cockpit a correr. Testes NAO viajam: sao a prova de que o
 * codigo esta bem, nao parte do que corre — e mandar 6 ficheiros de teste para
 * o runtime so aumenta a superficie sem aumentar a garantia.
 */
export function ficheirosCanonicos(origemRunner = ORIGEM_RUNNER) {
  let nomes;
  try {
    nomes = fs.readdirSync(origemRunner);
  } catch {
    return [];
  }
  return nomes
    .filter((n) => n.endsWith('.mjs') && !n.includes('.test.'))
    .sort()
    .map((n) => ({ rel: path.join('runner', n), abs: path.join(origemRunner, n) }));
}

/** Um ficheiro por copiar, ou a razao por que nao precisa. */
export function planear(origem = ORIGEM_RUNNER, dest = destinoPadrao(), shell = ORIGEM_SHELL) {
  const itens = ficheirosCanonicos(origem);
  if (fs.existsSync(shell)) itens.push({ rel: 'moo-pilot-shell.html', abs: shell });
  return itens.map((it) => {
    const alvo = path.join(dest, it.rel);
    let estado = 'novo';
    try {
      estado = sha(fs.readFileSync(alvo)) === sha(fs.readFileSync(it.abs)) ? 'igual' : 'desactualizado';
    } catch {
      /* novo */
    }
    return { ...it, alvo, estado };
  });
}

export function espelhar(plano, { dryRun = false } = {}) {
  const feitos = [];
  for (const it of plano) {
    if (it.estado === 'igual') continue;
    if (dryRun) { feitos.push({ ...it, accao: 'copiaria' }); continue; }
    fs.mkdirSync(path.dirname(it.alvo), { recursive: true });
    // .bak antes de sobrepor: um espelho nunca pode ser a unica copia.
    if (it.estado === 'desactualizado') {
      try { fs.copyFileSync(it.alvo, `${it.alvo}.bak`); } catch { /* best effort */ }
    }
    fs.copyFileSync(it.abs, it.alvo);
    feitos.push({ ...it, accao: 'copiado' });
  }
  return feitos;
}

/**
 * Para onde o LaunchAgent aponta REALMENTE. E a pergunta que o `sync-hooks.js`
 * aprendeu a fazer da maneira cara: o espelho pode estar impecavel e o sistema
 * continuar a correr outra copia.
 */
export function alvoDoLaunchAgent(home = os.homedir(), readImpl = fs.readFileSync) {
  const plist = path.join(home, 'Library', 'LaunchAgents', 'ai.mooter.runner.plist');
  try {
    const texto = String(readImpl(plist, 'utf8'));
    const m = /<string>([^<]*moo-runner\.mjs)<\/string>/.exec(texto);
    return m ? { plist, caminho: m[1] } : { plist, caminho: null };
  } catch {
    return { plist, caminho: null, ausente: true };
  }
}

/**
 * Self-check. Devolve `ok:false` quando o espelho esta incompleto OU quando ele
 * esta perfeito e ninguem o corre — as duas maneiras de este ficheiro falhar.
 */
export function selfCheck({ origem = ORIGEM_RUNNER, dest = destinoPadrao(), shell = ORIGEM_SHELL, home = os.homedir() } = {}) {
  const plano = planear(origem, dest, shell);
  const emFalta = plano.filter((p) => p.estado !== 'igual');
  const avisos = [];
  if (plano.length === 0) avisos.push('nenhum ficheiro canonico encontrado na origem');

  const la = alvoDoLaunchAgent(home);
  const destAbs = path.resolve(dest);
  if (la.ausente) {
    avisos.push(`sem LaunchAgent em ${la.plist} — o espelho existe mas nada o corre`);
  } else if (la.caminho && !path.resolve(la.caminho).startsWith(destAbs)) {
    avisos.push(
      `o LaunchAgent corre ${la.caminho}, nao o espelho — sincronizar aqui nao muda o que a maquina executa`,
    );
  }
  return { ok: emFalta.length === 0 && avisos.length === 0, total: plano.length, emFalta: emFalta.map((p) => p.rel), avisos };
}

export function main(argv = process.argv.slice(2), escrever = process.stdout.write.bind(process.stdout)) {
  const i = argv.indexOf('--dest');
  const dest = i >= 0 && argv[i + 1] ? argv[i + 1] : destinoPadrao();
  const soCheck = argv.includes('--check');
  const dryRun = argv.includes('--dry-run');

  if (!soCheck) {
    const feitos = espelhar(planear(ORIGEM_RUNNER, dest, ORIGEM_SHELL), { dryRun });
    escrever(`${dryRun ? '[dry-run] ' : ''}${feitos.length} ficheiro(s) para ${dest}\n`);
    for (const f of feitos) escrever(`  ${f.accao} ${f.rel}\n`);
  }

  const r = selfCheck({ dest });
  escrever(`espelho: ${r.total - r.emFalta.length}/${r.total} em dia\n`);
  for (const rel of r.emFalta) escrever(`  EM FALTA ${rel}\n`);
  // Nunca engolir em silencio: um espelho que ninguem corre e o modo de falha
  // caro deste ficheiro, e tem de doer no stdout.
  for (const a of r.avisos) escrever(`  AVISO ${a}\n`);
  escrever(r.ok ? 'OK self-check\n' : 'SELF-CHECK FALHOU\n');
  return r;
}

export const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invocadoComoPrograma) {
  const r = main();
  process.exitCode = r.ok ? 0 : 1;
}
