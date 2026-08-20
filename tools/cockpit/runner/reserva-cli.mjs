#!/usr/bin/env node
/**
 * reserva-cli.mjs — pedir a maquina ao runner numa linha.
 *
 *   npm run reserva -- --quem "wave 61" --porque "build pesado" --minutos 30
 *   npm run reserva -- --ver
 *   npm run reserva -- --libertar
 *
 * Pensado para ser a PRIMEIRA linha de um script de wave, de um benchmark ou de
 * uma medicao: pede-se o tempo que se acha preciso, e nao e preciso lembrar de
 * devolver — a reserva expira sozinha. Se o script rebentar, tambem caduca,
 * porque leva o pid.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { reservar, libertar, verReserva, MAX_MINUTOS } from './reserva.mjs';
import { resolveRepoRoot, projectPaths } from './project.mjs';

const RAIZ = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const MOO = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');

function opt(argv, nome) {
  const i = argv.indexOf(`--${nome}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const igual = argv.find((a) => a.startsWith(`--${nome}=`));
  return igual ? igual.slice(nome.length + 3) : null;
}

export function main(argv = process.argv.slice(2), escrever = process.stdout.write.bind(process.stdout)) {
  const raiz = (() => {
    try { return resolveRepoRoot({ argv, scriptRoot: RAIZ }).root; } catch { return RAIZ; }
  })();
  const base = projectPaths({ repoRoot: raiz, mooDir: MOO, canonicalRoot: RAIZ }).base;

  if (argv.includes('--libertar')) {
    libertar(base);
    escrever('reserva libertada — o runner volta ao trabalho na proxima ronda.\n');
    return { accao: 'libertar' };
  }
  if (argv.includes('--ver') || argv.length === 0) {
    const v = verReserva(base);
    escrever(v.activa
      ? `RESERVADA · ${v.motivo} · faltam ${v.faltaS}s (ate ${v.reserva.ate})\n`
      : `livre · ${v.motivo}\n`);
    return { accao: 'ver', ...v };
  }
  const quem = opt(argv, 'quem');
  if (!quem) {
    escrever('falta --quem: uma reserva anonima nao se pode cobrar a ninguem.\n');
    escrever(`uso: --quem "<nome>" [--porque "<razao>"] [--minutos N (max ${MAX_MINUTOS})]\n`);
    return { accao: 'erro' };
  }
  const r = reservar(base, { quem, porque: opt(argv, 'porque'), minutos: Number(opt(argv, 'minutos')) || undefined });
  escrever(`reservada por ${r.quem} ate ${r.ate} (${r.minutos} min)\n`);
  escrever('nao e preciso libertar: expira sozinha, e caduca se este processo morrer.\n');
  return { accao: 'reservar', reserva: r };
}

export const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoComoPrograma) main();
