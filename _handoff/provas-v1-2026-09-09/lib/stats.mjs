// stats.mjs — a aritmética do pacote de provas, sem dependências.
//
// Tudo o que aqui está é verificável à mão e tem um teste ao lado
// (stats.test.mjs) com valores calculados fora deste ficheiro. Um número que
// sai de uma função sem teste não entra num cartão.

/** log(n!) por soma — chega para n ≤ 5000 sem perder precisão útil. */
function logFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }

/** P(X = k) para X ~ Binomial(n, p). */
export function binomPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  const logC = logFact(n) - logFact(k) - logFact(n - k);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/** P(X ≥ k) para X ~ Binomial(n, p). */
export function binomTailUpper(n, k, p) {
  let s = 0; for (let i = Math.max(0, k); i <= n; i++) s += binomPmf(n, i, p); return Math.min(1, s);
}

/** Intervalo de Wilson a 95% para uma proporção k/n. */
export function wilson(k, n, z = 1.959964) {
  if (n === 0) return { p: null, lo: null, hi: null };
  const p = k / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * McNemar exacto, DIRECCIONAL.
 *
 * `b` = pares em que A acertou e B errou; `c` = pares em que B acertou e A
 * errou. H1 «A > B» é testada como P(X ≥ b | n=b+c, 0.5). Devolve também o
 * bilateral (2·min(cauda)) para quem quiser ler sem direcção. O A/B antigo era
 * cego à direcção (INBOX 03/09) — este não é.
 */
export function mcnemarExact(b, c) {
  const n = b + c;
  if (n === 0) return { b, c, n, p_one_sided_A_gt_B: 1, p_one_sided_B_gt_A: 1, p_two_sided: 1, note: 'sem pares discordantes' };
  const pAgtB = binomTailUpper(n, b, 0.5);
  const pBgtA = binomTailUpper(n, c, 0.5);
  const two = Math.min(1, 2 * Math.min(pAgtB, pBgtA));
  return { b, c, n, p_one_sided_A_gt_B: pAgtB, p_one_sided_B_gt_A: pBgtA, p_two_sided: two };
}

/** Kappa de Cohen para dois rotuladores sobre as mesmas categorias. */
export function cohenKappa(a, b, categories) {
  if (a.length !== b.length || a.length === 0) return null;
  const n = a.length;
  const cats = categories || [...new Set([...a, ...b])];
  let agree = 0; const ca = {}, cb = {};
  for (let i = 0; i < n; i++) { if (a[i] === b[i]) agree++; ca[a[i]] = (ca[a[i]] || 0) + 1; cb[b[i]] = (cb[b[i]] || 0) + 1; }
  const po = agree / n;
  let pe = 0; for (const k of cats) pe += ((ca[k] || 0) / n) * ((cb[k] || 0) / n);
  if (pe === 1) return { kappa: 1, po, pe };
  return { kappa: (po - pe) / (1 - pe), po, pe };
}

/** Percentil por interpolação linear (p em [0,100]). */
export function percentile(values, p) {
  const v = values.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (v.length === 0) return null;
  const idx = (p / 100) * (v.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (idx - lo);
}

export function summary(values) {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return { n: 0 };
  return { n: v.length, min: Math.min(...v), p50: percentile(v, 50), p95: percentile(v, 95), max: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length };
}
