/**
 * reserva.mjs — como se pede a maquina emprestada ao runner.
 *
 * O runner tinha UM controlo: o `STOP`. Binario, manual, e sobrevive a
 * reinicios — de proposito, porque e o gesto do dono e um kill-switch que se
 * esquece nao e um kill-switch. Mas serve mal para a coisa mais comum:
 * "preciso da maquina vinte minutos".
 *
 * Medido numa so sessao (2026-08-18), quatro vezes:
 *   1. o `wave-gate` caiu por contencao de git com o loop;
 *   2. uma medicao A/B teve de parar o runner para nao disputar a GPU;
 *   3. o STOP que se pos a mao desapareceu, e ninguem soube quando;
 *   4. trabalho de primeiro plano ficou mais lento sem se saber porque.
 *
 * A RESERVA e o oposto do STOP em todos os eixos que importam:
 *
 *            STOP                        RESERVA
 *   quem     o dono                      qualquer tarefa
 *   dura     para sempre                 ate expirar
 *   levanta  o dono (--play)             o relogio, sozinho
 *   diz      "nao trabalhes"             "agora nao, tenho a maquina"
 *
 * A propriedade que faz isto funcionar e a EXPIRACAO. Uma reserva esquecida
 * deixa de valer sozinha; um STOP esquecido deixa a maquina parada para sempre.
 * Uma reserva cujo processo morreu tambem deixa de valer — nao se perde uma GPU
 * porque um script rebentou a meio.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Tecto de uma reserva. Ninguem fica com a maquina mais do que isto de uma vez. */
export const MAX_MINUTOS = 120;
/** Sem duracao declarada, uma reserva vale isto. Curto de proposito. */
export const MINUTOS_OMISSAO = 15;

export function caminhoReserva(base) {
  return path.join(base, 'reserva.json');
}

/**
 * Pede a maquina. Devolve a reserva escrita.
 *
 * `pid` e opcional mas recomendado: com ele, a reserva morre quando o processo
 * que a pediu morrer, mesmo antes de expirar.
 */
export function reservar(base, { quem, porque = null, minutos = MINUTOS_OMISSAO, pid = process.pid, agora = Date.now() } = {}) {
  if (!quem || !String(quem).trim()) throw new Error('reserva sem dono: quem esta a pedir a maquina?');
  const m = Math.min(MAX_MINUTOS, Math.max(1, Math.round(Number(minutos) || MINUTOS_OMISSAO)));
  const r = {
    quem: String(quem).slice(0, 80),
    porque: porque ? String(porque).slice(0, 200) : null,
    desde: new Date(agora).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    ate: new Date(agora + m * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    minutos: m,
    pid: Number.isInteger(pid) ? pid : null,
  };
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(caminhoReserva(base), `${JSON.stringify(r, null, 2)}\n`);
  return r;
}

/** Devolve a maquina antes do tempo. Idempotente. */
export function libertar(base) {
  try {
    fs.rmSync(caminhoReserva(base), { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ha reserva activa?
 *
 * Tres razoes para NAO haver, e as tres importam:
 *  - ficheiro ausente ou ilegivel: ninguem pediu nada;
 *  - o `ate` ja passou: o relogio libertou-a, e e esse o ponto;
 *  - o `pid` ja nao existe: quem pediu morreu, e uma GPU nao fica presa a um
 *    processo que rebentou.
 *
 * @returns {{activa: boolean, reserva: object|null, motivo: string, faltaS: number}}
 */
export function verReserva(base, { agora = Date.now(), vivoImpl = (p) => { try { process.kill(p, 0); return true; } catch { return false; } } } = {}) {
  let r;
  try {
    r = JSON.parse(fs.readFileSync(caminhoReserva(base), 'utf8'));
  } catch {
    return { activa: false, reserva: null, motivo: 'sem reserva', faltaS: 0 };
  }
  if (!r || !r.quem || !r.ate) {
    return { activa: false, reserva: null, motivo: 'reserva ilegivel — tratada como ausente', faltaS: 0 };
  }
  const ate = Date.parse(r.ate);
  if (!Number.isFinite(ate)) return { activa: false, reserva: r, motivo: 'reserva sem prazo legivel', faltaS: 0 };
  if (ate <= agora) {
    return { activa: false, reserva: r, motivo: `expirou as ${r.ate}`, faltaS: 0 };
  }
  if (Number.isInteger(r.pid) && r.pid > 0 && !vivoImpl(r.pid)) {
    return { activa: false, reserva: r, motivo: `o processo ${r.pid} de "${r.quem}" morreu — reserva caduca`, faltaS: 0 };
  }
  return { activa: true, reserva: r, motivo: `${r.quem}${r.porque ? `: ${r.porque}` : ''}`, faltaS: Math.round((ate - agora) / 1000) };
}

/**
 * Quanto tempo dormir antes de olhar outra vez.
 *
 * Nao se dorme ate ao fim da reserva: ela pode ser libertada mais cedo, e uma
 * GPU parada a mais e o mesmo desperdicio que uma GPU a atrapalhar.
 */
export function esperaS(faltaS, { tecto = 60 } = {}) {
  if (!Number.isFinite(faltaS) || faltaS <= 0) return 0;
  return Math.max(1, Math.min(tecto, faltaS));
}
