#!/usr/bin/env node
// 14-tta-agreement.mjs — MP7 (ii): concordância das 4 rotações TTA como sinal de confiança (protocol.json#mp7.part_ii).
// Lê SÓ os ficheiros TTA já em disco (D-qwen2.5-coder_14b-tta4-*.json.json, MP6); não corre modelo; não ajusta nada.
// Por item: voto_r = argmax da rotação r (espaço de tier); tier_final = argmax da média (o que o ficheiro tem);
// votos = #{r : voto_r == tier_final}; p_agree = votos/4. Reporta acc por nível, ECE com p = p_agree, e compara.
import fs from 'node:fs'; import path from 'node:path';
import { HERE, TIERS, ece, wilson } from './lib-common.mjs';
const RES = path.join(HERE, 'results'); const J = (f) => JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8'));
const mp7 = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).mp7;
const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? 'n/d' : x.toFixed(d));
const CORPORA = [['40', 'D-qwen2.5-coder_14b-tta4-corpus-40-unredacted.json.json', 'D-qwen2.5-coder_14b-corpus-40-unredacted.json.json'], ['57', 'D-qwen2.5-coder_14b-tta4-corpus-60b.json.json', 'D-qwen2.5-coder_14b-corpus-60b.json.json'], ['60c', 'D-qwen2.5-coder_14b-tta4-corpus-60c.json.json', 'D-qwen2.5-coder_14b-corpus-60c.json.json']];
const argmaxTier = (probs) => TIERS.reduce((a, b) => (probs[a] >= probs[b] ? a : b));

export function agreementRows(D) {
  return D.rows.map((r) => {
    const t = r.answers.tier; if (!t.tta || !t.tta.rotations || t.tta.rotations.length !== 4) throw new Error(`${r.id}: sem 4 rotações`);
    if (!['T0', 'T1', 'T2', 'T3'].includes(r.expected)) throw new Error(`${r.id}: sem rótulo válido`);
    // round 7 A16: integridade — 4 distribuições finitas e normalizadas, média finita, tier do ficheiro == argmax da média
    for (const a of t.tta.rotations) { const vals = TIERS.map((x) => a.probs?.[x]); if (vals.some((v) => !Number.isFinite(v))) throw new Error(`${r.id}: rotação ${a.rotation} sem probabilidades finitas`); const s = vals.reduce((p, q) => p + q, 0); if (Math.abs(s - 1) > 1e-6) throw new Error(`${r.id}: rotação ${a.rotation} não normalizada (${s})`); }
    if (argmaxTier(t.tta.mean) !== r.tier) throw new Error(`${r.id}: tier do ficheiro ≠ argmax da média`);
    const votes = t.tta.rotations.map((a) => argmaxTier(a.probs));
    const final = r.tier; const n_agree = votes.filter((v) => v === final).length; // pode ser 0 (round 7 A14): a média pode vencer sem voto individual
    const modal = TIERS.map((x) => [x, votes.filter((v) => v === x).length]).sort((a, b) => b[1] - a[1])[0];
    return { id: r.id, expected: r.expected, tier: final, correct: r.tier === r.expected, p_max_mean: r.p_max, votes, n_agree, p_agree: n_agree / 4, modal_tier: modal[0], modal_n: modal[1], v0_tier: votes[0], v0_correct: votes[0] === r.expected, v0_p_max: t.tta.rotations[0].p_max };
  });
}
export function byLevel(rows) {
  const out = {};
  for (const k of [4, 3, 2, 1, 0]) { const g = rows.filter((r) => r.n_agree === k); if (!g.length) continue; const ok = g.filter((r) => r.correct).length; out[`${k}/4`] = { n: g.length, k: ok, acc: ok / g.length, ci95: wilson(ok, g.length), p_agree: k / 4, mean_p_max: g.reduce((s, r) => s + r.p_max_mean, 0) / g.length, v0_acc: g.filter((r) => r.v0_correct).length / g.length }; }
  return out;
}
export function monotone(levels, minN = 5) {
  const seq = ['4/4', '3/4', '2/4'].map((l) => levels[l]).filter((x) => x && x.n >= minN).map((x) => x.acc);
  if (seq.length < 2) return { ok: null, note: `menos de 2 níveis com n ≥ ${minN}` };
  for (let i = 1; i < seq.length; i++) if (!(seq[i - 1] > seq[i])) return { ok: false, seq };
  return { ok: true, seq };
}
const isMain = /14-tta-agreement\.mjs$/.test(process.argv[1] || '');
if (isMain) {
  const at = new Date().toISOString(); const out = { at, rule: mp7.part_ii_tta_agreement, by_corpus: {} };
  const md = [`# decisor-shadow — MP7 (ii) · concordância das 4 rotações TTA como confiança · ${at}`, '', `Pré-registo: \`protocol.json#mp7.part_ii_tta_agreement\` (\`_registered_at\` ${mp7._registered_at}). Ficheiros TTA do MP6 (gravados 2026-09-21T13:44Z), sem correr modelo, sem ajuste. \`votos\` = rotações cujo argmax coincide com o argmax da média; \`p_agree\` = votos/4. Exploração = 40 e 57; 60c só reportado.`, '', '| corpus | nível | n | acc [IC95] | p_agree | p_max médio (média TTA) | acc do v0 (rotação 0) nos mesmos itens |', '|---|---|---|---|---|---|---|'];
  for (const [ck, ftta, fv0] of CORPORA) {
    const D = J(ftta); const rows = agreementRows(D); const levels = byLevel(rows);
    // A14: a soma dos níveis tem de ser o total
    const sumLevels = Object.values(levels).reduce((s, g) => s + g.n, 0); if (sumLevels !== rows.length) throw new Error(`${ck}: níveis somam ${sumLevels} ≠ ${rows.length}`);
    // A15/A16: alinhamento por id com o ficheiro v0 e verificação de que a rotação 0 == v0 (mesma pergunta, T=0)
    const V0rows = J(fv0).rows; const v0by = Object.fromEntries(V0rows.map((r) => [r.id, r]));
    if (V0rows.length !== rows.length || rows.some((r) => !v0by[r.id] || v0by[r.id].expected !== r.expected)) throw new Error(`${ck}: ficheiro v0 não alinha por id/rótulo com o TTA`);
    const rot0_eq_v0 = { tier: rows.filter((r) => r.v0_tier === v0by[r.id].tier).length, p_max_within_1e6: rows.filter((r) => Math.abs(r.v0_p_max - v0by[r.id].p_max) < 1e-6).length, n: rows.length };
    const eAgree = ece(rows.map((r) => ({ p_max: r.p_agree, correct: r.correct })));
    const eTta = ece(rows.map((r) => ({ p_max: r.p_max_mean, correct: r.correct })));
    const eV0 = ece(V0rows.map((r) => ({ p_max: r.p_max, correct: r.correct })));
    const mono = monotone(levels);
    const modalDiff = rows.filter((r) => r.modal_tier !== r.tier && r.modal_n > r.n_agree).length;
    out.by_corpus[ck] = { file: ftta, at: D.at, n: rows.length, levels, rotation0_equals_v0_file: rot0_eq_v0, ece_p_agree: eAgree.ece, bins_p_agree: eAgree.bins, ece_tta_p_max: eTta.ece, ece_v0_p_max: eV0.ece, monotone: mono, acc_tta: rows.filter((r) => r.correct).length / rows.length, items_where_modal_vote_differs_from_mean_argmax: modalDiff };
    for (const [l, g] of Object.entries(levels)) md.push(`| ${ck} | ${l} | ${g.n} | ${fmt(g.acc)} [${g.ci95.map((x) => fmt(x, 2)).join('–')}] | ${fmt(g.p_agree, 2)} | ${fmt(g.mean_p_max, 2)} | ${fmt(g.v0_acc)} |`);
    md.push(`| ${ck} | **ECE** | ${rows.length} | acc TTA ${fmt(out.by_corpus[ck].acc_tta)} | **ECE(p_agree) ${fmt(eAgree.ece)}** | ECE(p_max TTA) ${fmt(eTta.ece)} · ECE(v0) ${fmt(eV0.ece)} | monotonia 4/4>3/4>2/4 (n≥5): ${mono.ok == null ? 'n/d' : mono.ok ? '✅' : '❌'} ${mono.seq ? `(${mono.seq.map((x) => fmt(x, 2)).join(' > ')})` : ''} · voto modal ≠ argmax da média: ${modalDiff} · rotação 0 == ficheiro v0: tier ${rot0_eq_v0.tier}/${rot0_eq_v0.n}, p_max ${rot0_eq_v0.p_max_within_1e6}/${rot0_eq_v0.n} |`);
  }
  // veredicto pré-registado (40 e 57)
  const ok = (ck) => out.by_corpus[ck];
  const monoBoth = ok('40').monotone.ok === true && ok('57').monotone.ok === true;
  const monoNone = ok('40').monotone.ok === false && ok('57').monotone.ok === false;
  const eceBetterBoth = ok('40').ece_p_agree < ok('40').ece_tta_p_max && ok('57').ece_p_agree < ok('57').ece_tta_p_max;
  const eceWorseBoth = ok('40').ece_p_agree >= ok('40').ece_tta_p_max && ok('57').ece_p_agree >= ok('57').ece_tta_p_max;
  const verdict = monoBoth && eceBetterBoth ? 'CONFIRMADA' : (monoNone || eceWorseBoth) ? 'REFUTADA' : 'ENTRE';
  out.verdict = { verdict, monotone_both: monoBoth, ece_better_than_tta_both: eceBetterBoth, ece_p_agree_vs_v0: { '40': [ok('40').ece_p_agree, ok('40').ece_v0_p_max], '57': [ok('57').ece_p_agree, ok('57').ece_v0_p_max] } };
  md.push('', `## Veredicto (regra pré-registada, 40 e 57): **${verdict}**`, '', `- monotonia em ambos: ${monoBoth ? 'sim' : 'não'} · ECE(p_agree) < ECE(p_max TTA) em ambos: ${eceBetterBoth ? 'sim' : 'não'} (40: ${fmt(ok('40').ece_p_agree)} vs ${fmt(ok('40').ece_tta_p_max)}; 57: ${fmt(ok('57').ece_p_agree)} vs ${fmt(ok('57').ece_tta_p_max)}). Contra o v0 (só informativo): 40 ${fmt(ok('40').ece_p_agree)} vs ${fmt(ok('40').ece_v0_p_max)}; 57 ${fmt(ok('57').ece_p_agree)} vs ${fmt(ok('57').ece_v0_p_max)}.`, `- 60c (só reportado): ECE(p_agree) ${fmt(ok('60c').ece_p_agree)} · ECE(p_max TTA) ${fmt(ok('60c').ece_tta_p_max)} · ECE(v0) ${fmt(ok('60c').ece_v0_p_max)} · monotonia ${ok('60c').monotone.ok == null ? 'n/d' : ok('60c').monotone.ok ? '✅' : '❌'}.`, '', 'Nada disto entra no mp4 (mp7.part_ii.not_a_gate).', '');
  fs.writeFileSync(path.join(RES, '14-tta-agreement.md'), md.join('\n'));
  fs.writeFileSync(path.join(RES, '14-tta-agreement.json'), JSON.stringify(out, null, 1));
  console.log(md.join('\n'));
}
