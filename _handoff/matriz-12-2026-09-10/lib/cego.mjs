// @ts-check
/**
 * cego.mjs — baralhar e desbaralhar, de forma reproduzivel.
 *
 * A ordem em que um juiz ve as respostas nao pode ser a ordem em que elas
 * foram geradas: A vem sempre primeiro, e "primeiro" tem vantagem conhecida.
 * Baralha-se com um PRNG semeado por sha256(semente + id), por isso qualquer
 * pessoa com o pre-registo reproduz exactamente a mesma ordem e pode conferir
 * que nao foi escolhida a posteriori.
 *
 * A cegueira e de ROTULO, nao de estilo: um juiz atento pode reconhecer um
 * modelo local pela forma de escrever. Isso fica escrito no verdict.md. Editar
 * as respostas para as uniformizar seria falsificar o que os motores deram.
 */
import crypto from 'node:crypto';

/** PRNG determinista (mulberry32) semeado por 32 bits do sha. */
function prngDeSemente(texto) {
  const h = crypto.createHash('sha256').update(texto).digest();
  let a = h.readUInt32BE(0);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string[]} bracos  ex. ['A','B','B2','C','D']
 * @param {string} semente   sha do pre-registo
 * @param {string} id        id do prompt
 * @returns {{rotulos: Record<string,string>, chave: Record<string,string>}}
 *   rotulos: braco -> rotulo cego (R1, R2, ...)
 *   chave:   rotulo cego -> braco
 */
export function baralhar(bracos, semente, id) {
  const rnd = prngDeSemente(`${semente}|${id}`);
  const ordem = bracos.slice();
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  const rotulos = {};
  const chave = {};
  ordem.forEach((b, i) => { const r = `R${i + 1}`; rotulos[b] = r; chave[r] = b; });
  return { rotulos, chave };
}
