#!/usr/bin/env node
// 05-amend-C-pmax.mjs — EMENDA, nao corrida nova. Recalcula a calibracao do braco C a partir
// do bruto que ja esta em disco. Zero chamadas a modelo; a stop rule nao e tocada.
//
// PORQUE EXISTE
// O adversario (codex, ronda 1, ataque 5) notou que o `p_max` do braco C nao pode ser a
// probabilidade maxima de uma distribuicao sobre 4 tiers: o maximo observado nos 40 e 0,1234
// no `typed-decisions` e a mediana 0,0952 no zero-shot — e num argmax sobre 4 classes o maximo
// e sempre >= 0,25. Verificado no artefacto e ele tem razao: o Laya devolve DOIS campos,
//
//   probabilities = {T0:0.062, T1:0.0768, T2:0.2672, T3:0.594}   <- soma 1, distribuicao real
//   confidence    = 0.2559                                        <- OUTRA coisa (margem)
//
// e o 03-arm-C-laya.py tomou `confidence` como `p_max`. Consequencia medida: a ECE do braco C
// estava calculada contra a quantidade errada, e o `abstain` (p_max < 0,4) dava 40/40 — que se
// leu como «o Laya nunca tem confianca» quando era so o campo errado. Mesma classe de defeito
// que este pacote ja apanhou duas vezes hoje (ECE do ledger, C2_redaction do P1): o instrumento
// a medir um campo que nao e o que se pensa.
//
// O que NAO muda: a acuracia. O `choice` e o argmax das `probabilities` e nao depende disto.
// Emenda-se em cima, preservando o valor original com nome explicito. Ficheiro a ficheiro.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, ece } from './lib-common.mjs';
const RES = path.join(HERE, 'results');
const out = [];
for (const f of fs.readdirSync(RES).filter((x) => /^C-.*\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
  if (j._amended_p_max) { out.push({ file: f, skipped: 'ja emendado' }); continue; }
  let semProbs = 0;
  for (const r of j.rows) {
    const p = r.probs_tier;
    if (!p || typeof p !== 'object' || !Object.keys(p).length) { semProbs++; continue; }
    r.p_max_ORIGINAL_campo_confidence = r.p_max;
    r.p_max = Math.max(...Object.values(p).map(Number));
    r.soma_probs = Object.values(p).reduce((a, b) => a + Number(b), 0);
    r.abstain_ORIGINAL = r.abstain;
    r.abstain = r.p_max < 0.4;
  }
  const antes = { ece: j.summary.calibration?.ece, abstain: j.summary.abstain };
  j.summary.calibration_ORIGINAL_campo_confidence = j.summary.calibration;
  j.summary.abstain_ORIGINAL_campo_confidence = j.summary.abstain;
  j.summary.calibration = ece(j.rows);
  j.summary.abstain = j.rows.filter((r) => r.abstain).length;
  j._amended_p_max = {
    at: new Date().toISOString(),
    porque: 'p_max era o campo `confidence` do Laya (margem), nao max(probabilities). Ataque 5 do adversario, verificado no artefacto.',
    o_que_muda: 'ECE e abstain. A acuracia NAO muda: o choice e o argmax das probabilities.',
    corridas_novas: 0, rows_sem_probs_tier: semProbs,
  };
  fs.writeFileSync(path.join(RES, f), JSON.stringify(j, null, 1));
  out.push({ file: f, acc_inalterada: j.summary.p, ece_antes: antes.ece, ece_depois: j.summary.calibration.ece,
    abstain_antes: antes.abstain, abstain_depois: j.summary.abstain, n: j.summary.n, sem_probs: semProbs });
}
console.log(JSON.stringify(out, null, 1));
