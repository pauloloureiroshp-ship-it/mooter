import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const {
  BASELINE_ID, BASELINE_PATH, BASELINE_SHA256,
  carregarBaseline, metricasDe, compararComBaseline,
} = await import('./baseline.mjs');

test('o ficheiro congelado existe', () => {
  assert.ok(fs.existsSync(BASELINE_PATH), `falta ${BASELINE_PATH}`);
});

test('IMUTAVEL: o sha256 do ficheiro e o que o modulo declara', () => {
  const cru = fs.readFileSync(BASELINE_PATH, 'utf8');
  const sha = createHash('sha256').update(cru).digest('hex');
  assert.equal(sha, BASELINE_SHA256,
    'o baseline foi editado. Nao o re-hasheies: cria um id novo e deixa este ficar.');
});

test('carregar recusa um baseline mexido', () => {
  assert.throws(
    () => carregarBaseline({ readImpl: () => '{"id":"outro"}' }),
    /baseline alterado/,
  );
});

test('os numeros congelados sao os que o construtor do Ledger mediu', () => {
  const b = carregarBaseline();
  assert.equal(b.id, BASELINE_ID);
  assert.equal(b.pipeline_version, '1.53.0');
  assert.equal(b.triagem.total, 1071);
  assert.equal(b.triagem.accepted, 3);
  assert.equal(b.triagem.issues, 1);
  assert.equal(b.triagem.dismissed_por_motivo['instrumento-nao-discrimina'], 607);
});

test('as percentagens gravadas sao reproduziveis pela formula, nao escritas a mao', () => {
  const b = carregarBaseline();
  const m = metricasDe(b.triagem);
  assert.equal(m.kept_rate_pct, b.metricas.kept_rate_pct);
  assert.equal(m.nao_discrimina_pct_do_total, b.metricas.nao_discrimina_pct_do_total);
  assert.equal(m.nao_discrimina_pct_dos_descartes, b.metricas.nao_discrimina_pct_dos_descartes);
});

test('denominador zero da n/d, nunca 0% — 0/0 nao e uma medicao', () => {
  const m = metricasDe({ total: 0, accepted: 0, issues: 0, dismissed_total: 0, dismissed: {} });
  assert.equal(m.kept_rate_pct, null);
  assert.equal(m.nao_discrimina_pct_do_total, null);
  assert.equal(m.nao_discrimina_pct_dos_descartes, null);
});

test('a divergencia do kickoff fica REGISTADA, nao apagada', () => {
  const b = carregarBaseline();
  const d = b.divergencia_do_kickoff;
  assert.equal(d.kickoff_dizia.kept_rate_pct, 0.26);
  assert.equal(d.kickoff_dizia.denominador, 782);
  assert.equal(d.kickoff_dizia.nao_discrimina_pct, 49);
  assert.match(d.hipotese_da_diferenca, /^n\/d/, 'a causa nao foi verificada — nao se adivinha');
});

test('comparar cita sempre o id e a versao do pipeline', () => {
  const r = compararComBaseline({
    total: 200, accepted: 10, issues: 2, dismissed_total: 188,
    dismissed: { 'instrumento-nao-discrimina': 20 },
  });
  assert.match(r.cita, /baseline-2026-09-01/);
  assert.match(r.cita, /1\.53\.0/);
  assert.equal(r.agora.kept_rate_pct, 6);
  assert.ok(r.delta.kept_rate_pct > 0, 'subir o keep-rate tem de dar delta positivo');
  assert.ok(r.delta.nao_discrimina_pct_do_total < 0, 'baixar o nao-discrimina tem de dar delta negativo');
});

test('delta com um lado n/d e n/d — nunca se compara contra o vazio', () => {
  const r = compararComBaseline({ total: 0, accepted: 0, issues: 0, dismissed_total: 0, dismissed: {} });
  assert.equal(r.delta.kept_rate_pct, null);
  assert.equal(r.delta.nao_discrimina_pct_do_total, null);
});
