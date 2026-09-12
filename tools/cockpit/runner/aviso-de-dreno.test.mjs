/**
 * aviso-de-dreno.test.mjs — um alarme que se repete a cada poll nao alarma.
 *
 * Medido a 2026-09-01 na maquina do dono: `~/.mooter/f10.log` tinha 9784
 * linhas e 9558 delas eram a MESMA linha de anomalia de dreno — 97,7% do
 * ficheiro. O tique corre a cada poll do painel (3s), e o loop esta parado por
 * decisao do dono, portanto o dreno e zero de propria vontade.
 *
 * A correccao nao pode ser apagar o detector: ele nasceu para apanhar o pilar
 * que MORRE com trabalho a espera, e esse caso e real. Estes testes fixam a
 * distincao — cala-se a aritmetica, nao a paragem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { avisoDeDreno, AVISO_DRENO_MS, anomaliaDeDreno } = await import('./autopilot.mjs');

const ANOMALIA = { anomalia: true, porque: 'o dreno CAIU', hoje: 0, base: 244.5 };
const CALMO = { anomalia: false, porque: 'dentro do normal', hoje: 20, base: 21 };
const T0 = Date.parse('2026-09-01T12:00:00Z');

test('sem anomalia nao ha aviso', () => {
  const r = avisoDeDreno(CALMO, { fila: 500, agora: T0 });
  assert.equal(r.avisar, false);
  assert.match(r.porque, /sem anomalia/);
});

test('FILA VAZIA CALA: zero fechados de zero por fechar e aritmetica, nao paragem', () => {
  const r = avisoDeDreno(ANOMALIA, { fila: 0, agora: T0 });
  assert.equal(r.avisar, false);
  assert.match(r.porque, /nada por drenar/);
  assert.equal(r.ultimoMs, null, 'calar nao pode consumir a janela horaria');
});

test('o pilar que morre COM trabalho a espera continua a disparar', () => {
  const r = avisoDeDreno(ANOMALIA, { fila: 524, agora: T0 });
  assert.equal(r.avisar, true);
  assert.equal(r.porque, 'o dreno CAIU');
  assert.equal(r.ultimoMs, T0);
});

test('uma vez por hora — o segundo aviso dentro da hora e calado', () => {
  const um = avisoDeDreno(ANOMALIA, { fila: 524, agora: T0 });
  const dois = avisoDeDreno(ANOMALIA, {
    fila: 524, agora: T0 + 60_000, ultimoMs: um.ultimoMs, silenciados: um.silenciados,
  });
  assert.equal(dois.avisar, false);
  assert.match(dois.porque, /ja avisado nesta hora/);
  assert.equal(dois.silenciados, 1);
});

test('passada a hora, volta a avisar — e DIZ quantos calou', () => {
  let estado = { ultimoMs: null, silenciados: 0 };
  let emitidos = 0;
  // 1200 tiques de 3 em 3 segundos = uma hora de poll do painel.
  for (let i = 0; i < 1201; i += 1) {
    const r = avisoDeDreno(ANOMALIA, {
      fila: 524, agora: T0 + i * 3000, ultimoMs: estado.ultimoMs, silenciados: estado.silenciados,
    });
    estado = { ultimoMs: r.ultimoMs, silenciados: r.silenciados };
    if (r.avisar) {
      emitidos += 1;
      if (emitidos === 2) {
        assert.equal(r.calados, 1199, 'o aviso tem de dizer o que ficou por dizer');
      }
    }
  }
  assert.equal(emitidos, 2, `1201 tiques numa hora deviam dar 2 avisos, deram ${emitidos}`);
});

test('sem o limite, os mesmos 1201 tiques dariam 1201 linhas — a medida do estrago', () => {
  const semLimite = Array.from({ length: 1201 }, () => ANOMALIA).filter((a) => a.anomalia).length;
  assert.equal(semLimite, 1201);
});

test('a fila voltar a encher nao ressuscita um aviso ja dado nesta hora', () => {
  const um = avisoDeDreno(ANOMALIA, { fila: 524, agora: T0 });
  const dois = avisoDeDreno(ANOMALIA, {
    fila: 0, agora: T0 + 10_000, ultimoMs: um.ultimoMs, silenciados: um.silenciados,
  });
  assert.equal(dois.avisar, false);
  const tres = avisoDeDreno(ANOMALIA, {
    fila: 900, agora: T0 + 20_000, ultimoMs: dois.ultimoMs, silenciados: dois.silenciados,
  });
  assert.equal(tres.avisar, false, 'ainda dentro da hora');
  assert.equal(tres.ultimoMs, T0, 'a janela horaria nao se reinicia por a fila mudar');
});

test('ultimoMs invalido nao cala o alarme — um relogio estranho nao e uma razao para calar', () => {
  const r = avisoDeDreno(ANOMALIA, { fila: 524, agora: T0, ultimoMs: Number.NaN });
  assert.equal(r.avisar, true);
});

test('a constante e mesmo uma hora', () => {
  assert.equal(AVISO_DRENO_MS, 3600_000);
});

test('integra com o detector real: paragem total com fila cheia dispara UMA vez', () => {
  const dia = (d, n) => Array.from({ length: n }, () => ({ ts: `${d}T12:00:00Z`, pilar: 'P2' }));
  const an = anomaliaDeDreno(
    [...dia('2026-08-29', 100), ...dia('2026-08-30', 100), ...dia('2026-08-31', 100)],
    { agora: Date.parse('2026-09-01T12:00:00Z') },
  );
  assert.equal(an.anomalia, true, 'o detector real tem de ver a paragem');
  const um = avisoDeDreno(an, { fila: 524, agora: T0 });
  const dois = avisoDeDreno(an, { fila: 524, agora: T0 + 3000, ultimoMs: um.ultimoMs, silenciados: um.silenciados });
  assert.equal(um.avisar, true);
  assert.equal(dois.avisar, false);
});
