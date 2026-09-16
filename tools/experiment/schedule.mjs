// schedule.mjs — quando é que o próximo envio PODE acontecer. Puro: sem fs, sem relógio.
//
// engine-contract 0.3 queue_policy.next_action_at:
//   «No earlier than max(last_terminal_time + preregistered interval+jitter,
//    provider retry_after/reset, operator pause_until); only if remaining wave
//    budget permits.»
//
// O jitter é DETERMINÍSTICO: sha256(seed do manifesto + slot_id) → uniforme no
// intervalo pré-registado. Dois replays com o mesmo manifesto dão os mesmos
// instantes; um adversário não consegue dizer «foi sorte». O seed está no
// manifesto congelado (condição C4), logo faz parte do manifest_hash.
//
// O intervalo é um guardrail de laboratório (60 s + 0–15 s), não uma regra do
// fornecedor — o reset real, quando existe, prevalece (é o max()).

import crypto from 'node:crypto';

/** Eventos de slot que contam como «conclusão» para efeitos de intervalo (tocaram o fornecedor). */
export const TERMINAL_FOR_SPACING = Object.freeze(['captured', 'capture_uncertain', 'failed', 'policy_review', 'submission_uncertain']);

/**
 * Jitter em ms, determinístico em (seed, slot_id), uniforme em [min, max] segundos.
 * @param {{ seed: string, slot_id: string, range_seconds: [number, number] }} o
 */
export function jitterMs({ seed, slot_id, range_seconds }) {
  if (typeof seed !== 'string' || seed.length === 0) throw new Error('jitter: seed obrigatório');
  const [min, max] = Array.isArray(range_seconds) ? range_seconds : [0, 0];
  if (!(Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min)) throw new Error(`jitter: intervalo inválido ${JSON.stringify(range_seconds)}`);
  const h = crypto.createHash('sha256').update(`${seed}|${slot_id}`, 'utf8').digest();
  const u = h.readUInt32BE(0) / 0x1_0000_0000; // [0, 1)
  return Math.round((min + u * (max - min)) * 1000);
}

const ms = (iso) => (iso == null ? null : Date.parse(iso));

/**
 * @param {object} o
 * @param {string|null} o.opened_at          ISO — primeiro instante possível se ainda não houve conclusão
 * @param {string|null} o.last_terminal_at   ISO do último evento em TERMINAL_FOR_SPACING (ou null)
 * @param {number} o.interval_seconds
 * @param {number} o.jitter_ms
 * @param {string|null} [o.reset_at]         ISO do reset literal do fornecedor (lerReposicao) ou null
 * @param {string|null} [o.pause_until]      ISO de pausa do operador ou null
 * @returns {{ next_action_at: string, basis: string[] }}
 */
export function nextActionAt({ opened_at, last_terminal_at = null, interval_seconds, jitter_ms, reset_at = null, pause_until = null }) {
  if (!(Number.isFinite(interval_seconds) && interval_seconds >= 0)) throw new Error('nextActionAt: interval_seconds inválido');
  if (!(Number.isFinite(jitter_ms) && jitter_ms >= 0)) throw new Error('nextActionAt: jitter_ms inválido');
  const candidatos = [];
  if (opened_at != null) candidatos.push(['opened_at', ms(opened_at)]);
  if (last_terminal_at != null) candidatos.push(['last_terminal+interval+jitter', ms(last_terminal_at) + interval_seconds * 1000 + jitter_ms]);
  if (reset_at != null) candidatos.push(['provider_reset', ms(reset_at)]);
  if (pause_until != null) candidatos.push(['operator_pause', ms(pause_until)]);
  if (!candidatos.length) throw new Error('nextActionAt: sem referência temporal (opened_at em falta)');
  const max = Math.max(...candidatos.map(([, t]) => t));
  return { next_action_at: new Date(max).toISOString(), basis: candidatos.filter(([, t]) => t === max).map(([k]) => k) };
}
