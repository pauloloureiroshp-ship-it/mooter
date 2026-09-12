/**
 * baseline.mjs — a linha de base congelada, e a unica forma honesta de a citar.
 *
 * Ate 2026-09-01 este projecto comparava melhorias contra numeros que viviam em
 * conversas: «o keep-rate era 4,5%», «os descartes eram 49%». Nenhum deles
 * dizia CONTRA QUE JANELA, e o ledger e append-only — o denominador cresce
 * sozinho. Uma percentagem sem denominador datado nao e uma medicao: e uma
 * lembranca. E foi exactamente o que aconteceu ao abrir esta onda: os numeros
 * do kickoff (0,26% / 782 / 49%) NAO se reproduziram contra o ledger deste
 * device — ver `divergencia_do_kickoff` no JSON.
 *
 * Por isso o baseline e um ficheiro CONGELADO com sha256 fixado no teste, e as
 * comparacoes passam todas por aqui. Determinístico, $0, sem rede, sem LLM.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** O id que toda comparacao futura tem de citar. */
export const BASELINE_ID = 'baseline-2026-09-01';
export const BASELINE_PATH = path.join(AQUI, `${BASELINE_ID}.json`);

/**
 * O sha256 do ficheiro congelado. Vive AQUI e nao so no teste de proposito:
 * quem importar o modulo em producao pode verificar o mesmo que o CI verifica,
 * em vez de confiar que alguem correu os testes.
 */
export const BASELINE_SHA256 =
  '82056f277f0abba82415b7501376aa374a0a8025a97225cb4041a8953ccc2643';

/** Le o baseline e RECUSA-SE a devolve-lo se ele foi mexido. */
export function carregarBaseline({ readImpl = fs.readFileSync, verificar = true } = {}) {
  const cru = readImpl(BASELINE_PATH, 'utf8');
  if (verificar) {
    const sha = createHash('sha256').update(cru).digest('hex');
    if (sha !== BASELINE_SHA256) {
      throw new Error(
        `baseline alterado: sha256 ${sha} != ${BASELINE_SHA256}. ` +
        'Um baseline editavel nao e um baseline. Se a linha de base tem mesmo de mudar, ' +
        'cria um id novo (baseline-AAAA-MM-DD) e deixa este ficar.',
      );
    }
  }
  return JSON.parse(cru);
}

/**
 * As metricas comparaveis, a partir do bloco `triage` de QUALQUER snapshot do
 * `build-ledger-snapshot.mjs`. Pura: a formula e uma so, e vive num sitio so —
 * duas formulas para o mesmo nome e como se produz um numero que discorda de
 * si proprio.
 *
 * Devolve `null` (nunca 0) quando o denominador e zero: 0/0 nao e «zero por
 * cento», e imprimir 0% seria afirmar uma medicao que nao houve.
 */
export function metricasDe(triage) {
  const t = triage || {};
  const total = Number(t.total) || 0;
  const dismissedTotal = Number(t.dismissed_total) || 0;
  const kept = (Number(t.accepted) || 0) + (Number(t.issues) || 0);
  const nd = Number((t.dismissed || t.dismissed_por_motivo || {})['instrumento-nao-discrimina']) || 0;
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1e6) / 1e4 : null);
  return {
    total,
    kept,
    kept_rate_pct: pct(kept, total),
    nao_discrimina: nd,
    nao_discrimina_pct_do_total: pct(nd, total),
    nao_discrimina_pct_dos_descartes: pct(nd, dismissedTotal),
  };
}

/**
 * Compara um snapshot de agora com o congelado. `delta` positivo = subiu.
 * Um lado sem denominador da `null` — e o resultado diz `n/d`, nao «0».
 */
export function compararComBaseline(triageAgora, { baseline = null } = {}) {
  const b = baseline || carregarBaseline();
  const antes = metricasDe(b.triagem);
  const agora = metricasDe(triageAgora);
  const delta = (a, x) =>
    (a == null || x == null ? null : Math.round((x - a) * 1e4) / 1e4);
  return {
    cita: `${b.id} · pipeline ${b.pipeline_version} · janela ${b.fonte.janela_linhas} linhas`,
    baseline_id: b.id,
    pipeline_version: b.pipeline_version,
    antes,
    agora,
    delta: {
      kept_rate_pct: delta(antes.kept_rate_pct, agora.kept_rate_pct),
      nao_discrimina_pct_do_total: delta(
        antes.nao_discrimina_pct_do_total, agora.nao_discrimina_pct_do_total),
    },
  };
}

/** `--medir`: constroi o snapshot de agora e compara. Nunca escreve o baseline. */
async function main() {
  const b = carregarBaseline();
  if (!process.argv.includes('--medir')) {
    process.stdout.write(`${JSON.stringify({ baseline: b.id, metricas: metricasDe(b.triagem) }, null, 2)}\n`);
    return;
  }
  const { buildLedgerSnapshot } = await import('./build-ledger-snapshot.mjs');
  const snap = await buildLedgerSnapshot({});
  process.stdout.write(`${JSON.stringify(compararComBaseline(snap.triage), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
