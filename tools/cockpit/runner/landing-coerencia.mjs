/**
 * landing-coerencia.mjs — o `landing/` nao leva um pilar. Leva isto.
 *
 * PORQUE NAO E UM PILAR.
 *
 * Mediram-se OITO classes candidatas em `landing/` (74 `.tsx`) antes de escrever
 * uma linha de enunciado, porque foi essa a licao dos nove pilares semeados:
 *
 *     classe                     densidade   porque nao serve
 *     href vs texto visivel         14       exige juizo
 *     aria-label vs texto           21       exige juizo
 *     numero em texto visivel       34       e o P6 — sao maquetes de UI
 *     mesmo numero 2x no ficheiro   48/74    demasiado comum, viraria ruido
 *     title vs <h1>                 10       divergem DE PROPOSITO (SEO vs headline)
 *     target=_blank sem rel          5/8     nitpick: os browsers ja implicam noopener
 *     percentagem vs fraccao          1      raro demais
 *     afirmacao de contagem vs lista  2      raro demais
 *
 * Nenhuma junta as tres coisas que os dois pilares saos (P2, P3) tem: densidade,
 * comparacao entre dois LITERAIS visiveis, e zero juizo.
 *
 * E AQUI ESTA A DISTINCAO QUE ISTO ENSINA:
 *
 *   **A densidade importa para um pilar porque o silencio dele e ambiguo** — sem
 *   volume nao se distingue "calou-se porque esta certo" de "calou-se porque esta
 *   partido", e foi exactamente isso que custou 2900 rondas de GPU a cinco
 *   pilares. **Para uma verificacao DETERMINISTICA a densidade nao importa**: ela
 *   custa 0 ms, corre sobre tudo, e o silencio dela e prova, nao ausencia de
 *   prova.
 *
 * Por isso fica aqui UMA verificacao, sem modelo nenhum: a unica classe que e ao
 * mesmo tempo mecanicamente decidivel e sem falsos positivos no repo real. E a
 * regra do dia inteiro: o que o harness consegue decidir nunca se pede a um
 * modelo.
 *
 * HONESTIDADE SOBRE O ALCANCE: hoje ela guarda UMA afirmacao — o `31%` do
 * CockpitShowcase, que bate com o seu `126/408`. Uma verificacao que guarda uma
 * coisa nao e um exagero quando custa 0 ms; seria um exagero se custasse GPU, e
 * e por isso que nao e um pilar.
 *
 * Uso: node tools/cockpit/runner/landing-coerencia.mjs [raiz-do-repo]
 */

import fs from 'node:fs';
import path from 'node:path';

export function ficheirosTsx(dir, { readdirImpl = fs.readdirSync } = {}, out = []) {
  let entradas = [];
  try { entradas = readdirImpl(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entradas) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheirosTsx(p, { readdirImpl }, out);
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * A percentagem afirmada bate com a fraccao que a sustenta?
 *
 * O padrao existe no repo: `['cache-hit', '31%', V.text, 'measured 126/408']`
 * — a afirmacao e o recibo dela, lado a lado. 126/408 = 30,9%, arredonda a 31%.
 * E o moat do projecto numa linha: um numero publico com a sua prova ao lado.
 */
export function pctContraFraccao(texto, { tolerancia = 1 } = {}) {
  const achados = [];
  const linhas = String(texto || '').split('\n');
  linhas.forEach((l, i) => {
    // ⚠️ A MESMA linha, nao uma janela de duas. A primeira versao olhava tambem
    // para a linha seguinte e emparelhava um `%` com uma fraccao que nada tinha
    // a ver com ele — deu "diz 31% mas 11/11 da 100%" a partir de um heading e
    // de uma tabela sem relacao. O padrao real vive numa linha so:
    //   ['cache-hit', '31%', V.text, 'measured 126/408']
    const pct = l.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
    const frac = l.match(/(\d{2,})\s*\/\s*(\d{2,})/);
    if (!pct || !frac) return;
    const declarado = Number(String(pct[1]).replace(',', '.'));
    const den = Number(frac[2]);
    if (!den) return;
    const real = (Number(frac[1]) / den) * 100;
    if (Math.abs(declarado - real) <= tolerancia) return;
    achados.push({
      linha: i + 1,
      tipo: 'pct-vs-fraccao',
      porque: `diz ${declarado}% mas ${frac[1]}/${frac[2]} da ${real.toFixed(1)}%`,
    });
  });
  return achados;
}

/**
 * ⚠️ AQUI ESTAVA UMA SEGUNDA VERIFICACAO — "a contagem afirmada bate com a lista
 * que ela conta?" — e foi RETIRADA depois de correr sobre o repo real.
 *
 * Ha exactamente DUAS afirmacoes de contagem em 74 ficheiros, e numa delas a
 * verificacao acusava um falso positivo: `MultiSessionTable.tsx:178` diz
 * "5 capabilities no other tool has" e enumera cinco inline — e um SUBCONJUNTO
 * legitimo das 11 da tabela, nao uma contagem errada. Distinguir "conta a lista"
 * de "conta um subconjunto" exige ler a frase, ou seja: juizo.
 *
 * Um falso positivo em duas ocorrencias e 50%. Foi exactamente esse numero que
 * levou ao desligar de cinco pilares hoje, e nao se ship a mesma coisa com outro
 * chapeu so por ser deterministica.
 */

/** Corre a verificacao sobre um ficheiro. */
export function verificar(texto) {
  return pctContraFraccao(texto);
}

function principal() {
  const raiz = process.argv[2] || process.env.MOOTER_REPO || process.cwd();
  const base = path.join(raiz, 'landing');
  const files = [...ficheirosTsx(path.join(base, 'app')), ...ficheirosTsx(path.join(base, 'components'))];
  if (!files.length) { console.log(`sem .tsx em ${base} — n/d`); return; }

  let total = 0;
  for (const f of files) {
    const achados = verificar(fs.readFileSync(f, 'utf8'));
    for (const a of achados) {
      total += 1;
      console.log(`${path.relative(raiz, f).split(path.sep).join('/')}:${a.linha}  [${a.tipo}] ${a.porque}`);
    }
  }
  console.log(`\n${files.length} ficheiros · ${total} incoerencia(s)`);
  if (total > 0) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('landing-coerencia.mjs')) principal();
