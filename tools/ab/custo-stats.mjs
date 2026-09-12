/**
 * custo-stats.mjs — a estatística do teste de custo, em funções puras.
 *
 * Duas coisas, e só estas, porque o pré-registo (`custo-prereg.json`) só pede
 * estas: o intervalo de Wilson por braço, e o intervalo de score de Tango para
 * a DIFERENÇA de proporções emparelhadas — o que o pré-registo chama
 * «Newcombe-Tango» e que é DESCRITIVO, nunca um teste de hipótese.
 *
 * Porque Tango e não McNemar: o adversário (CUSTO-05) mostrou que McNemar
 * bilateral testa «as discordâncias são simétricas?», que não é a pergunta.
 * A pergunta é «quão grande é a diferença emparelhada, e com que precisão?».
 * O intervalo de Tango responde a isso e não afirma nada sobre limiares.
 *
 * Referência: Tango, T. (1998). Equivalence test and confidence interval for
 * the difference in proportions for the paired-sample design. Statistics in
 * Medicine 17, 891–908. O intervalo é o conjunto de δ para os quais o score
 * |Z(δ)| ≤ z_{α/2}, resolvido por bissecção. Sem forma fechada; é assim.
 */

// 1.959964 e nao 1.959963984540054: o `lib/stats.mjs` do pacote de provas usa
// o valor arredondado, e o portao `conferir-cartoes.mjs` reconhece o P3 pelo
// limite superior de 0/20 a 1e-9. Com o quantil exacto o limite difere no 9.o
// decimal e os dois instrumentos deixam de concordar entre si — descoberto por
// um teste que os confronta. A diferenca e irrelevante para qualquer conclusao;
// a concordancia entre instrumentos nao e.
const Z975 = 1.959964;

/** Wilson para uma proporção k/n. */
export function wilson(k, n, z = Z975) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) {
    throw new RangeError(`wilson: k=${k} n=${n} invalidos`);
  }
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centro = (p + z2 / (2 * n)) / denom;
  const meia = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centro - meia), hi: Math.min(1, centro + meia) };
}

/**
 * Score de Tango para uma diferença hipotética δ = p_A − p_B, dados os pares.
 *   b = só A aceitou · c = só B aceitou · n = pares válidos
 * Devolve Z(δ). O sinal segue (b − c − nδ).
 */
export function scoreDeTango(b, c, n, delta) {
  // MLE restrita de p21 (= proporcao "so B") sob a hipotese p12 - p21 = delta
  const A = 2 * n;
  const B = -b - c + (2 * n - b + c) * delta;
  const C = -c * delta * (1 - delta);
  const disc = B * B - 4 * A * C;
  const p21 = (Math.sqrt(Math.max(0, disc)) - B) / (2 * A);
  const varr = n * (2 * p21 + delta * (1 - delta));
  if (varr <= 0) return (b - c - n * delta) === 0 ? 0 : Math.sign(b - c - n * delta) * Infinity;
  return (b - c - n * delta) / Math.sqrt(varr);
}

/**
 * Intervalo de score de Tango para p_A − p_B, por bissecção em cada lado.
 * Devolve {diferenca, lo, hi, b, c, n}. Se n = 0, tudo é null: não há pares.
 */
export function tangoIC(b, c, n, z = Z975, tol = 1e-7) {
  if (![b, c, n].every(Number.isInteger) || b < 0 || c < 0 || n <= 0 || b + c > n) {
    if (n === 0) return { diferenca: null, lo: null, hi: null, b, c, n };
    throw new RangeError(`tangoIC: b=${b} c=${c} n=${n} invalidos`);
  }
  const ponto = (b - c) / n;
  // limite inferior: o menor δ em [-1, ponto] com Z(δ) <= z
  const bissecta = (esq, dir, alvo) => {
    // f(δ) = Z(δ) - alvo, monotona decrescente em δ
    let lo = esq, hi = dir;
    for (let i = 0; i < 200 && hi - lo > tol; i++) {
      const m = (lo + hi) / 2;
      if (scoreDeTango(b, c, n, m) > alvo) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const lo = bissecta(-1, ponto, z);      // Z desce de +inf ate z
  const hi = bissecta(ponto, 1, -z);      // Z desce de z' ate -z
  return { diferenca: ponto, lo: Math.max(-1, lo), hi: Math.min(1, hi), b, c, n };
}

/**
 * Varrimento fino independente da bissecção — usado SÓ pelos testes, como
 * controlo: os dois métodos têm de concordar. Um intervalo que só um método
 * calcula é um intervalo que ninguém verificou.
 */
export function tangoICPorVarrimento(b, c, n, z = Z975, passo = 1e-4) {
  let lo = null, hi = null;
  for (let d = -1; d <= 1 + 1e-12; d += passo) {
    const zz = scoreDeTango(b, c, n, d);
    if (Math.abs(zz) <= z) { if (lo === null) lo = d; hi = d; }
  }
  return { lo, hi };
}

/** Arredondamento do pré-registo: proporções a 3 casas, USD a 4, tokens inteiros. */
export const arred = {
  prop: (x) => (x === null || x === undefined || Number.isNaN(x) ? x : Math.round(x * 1000) / 1000),
  usd: (x) => (x === null || x === undefined || Number.isNaN(x) ? x : Math.round(x * 10000) / 10000),
  tok: (x) => (x === null || x === undefined || Number.isNaN(x) ? x : Math.round(x)),
};
