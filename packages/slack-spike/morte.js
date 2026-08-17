'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. Nao copiar para o produto sem frente propria + G4.
 *
 * O spike nasce com data de morte. Nao e uma nota no README: e um valor que o
 * daemon LE antes de arrancar, para que o prazo se cumpra sozinho quando
 * ninguem estiver a olhar.
 */

/** +30 dias a contar de 2026-08-17 (dia 0 do spike). */
const SPIKE_MORRE_EM = '2026-09-16';

const MOTIVO_MORTE = 'o spike passou o prazo de ' + SPIKE_MORRE_EM
  + ' sem piloto pago — arquiva-se o branch em vez de o deixar virar produto por inercia';

function estadoDeMorte(agora) {
  const limite = Date.parse(SPIKE_MORRE_EM + 'T23:59:59.999Z');
  const t = agora instanceof Date ? agora.getTime()
    : (agora == null ? Date.now() : Date.parse(String(agora)));
  if (!Number.isFinite(t)) {
    // sem relogio utilizavel nao se declara vida: fail-closed, como o resto.
    return { morto: true, morre_em: SPIKE_MORRE_EM, dias_restantes: null,
      porque: 'relogio ilegivel — sem data nao se prova que o prazo ainda corre; ' + MOTIVO_MORTE };
  }
  const morto = t > limite;
  return {
    morto,
    morre_em: SPIKE_MORRE_EM,
    dias_restantes: Math.ceil((limite - t) / 86400000),
    porque: morto ? MOTIVO_MORTE
      : 'dentro do prazo: o spike morre em ' + SPIKE_MORRE_EM,
  };
}

module.exports = { SPIKE_MORRE_EM, MOTIVO_MORTE, estadoDeMorte };
