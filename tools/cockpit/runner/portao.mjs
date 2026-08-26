/**
 * portao.mjs — os limiares e a decisao, sem depender de mais nada.
 *
 * PORQUE E QUE ISTO E UM FICHEIRO SEPARADO.
 *
 * O `podeEntrar` nasceu dentro do `ancora.mjs` (#389, 2026-08-25) para decidir
 * as REGRAS do modo ancorado. A 2026-08-26 passou a decidir tambem os PILARES,
 * que e o sitio de onde o problema tinha vindo — mas `context-pack.mjs` nao o
 * podia importar de la sem fechar um ciclo:
 *
 *     context-pack -> ancora -> portao-de-existencia -> context-pack
 *
 * O ciclo provavelmente ate funcionaria: nenhum dos tres CHAMA nada do outro no
 * topo do modulo, e as ligacoes de ESM sao vivas. Mas `PILLAR_IDS` e calculado
 * na inicializacao do modulo, e uma ordem de import diferente passaria a ser a
 * diferenca entre a rotacao certa e uma rotacao vazia — sem erro nenhum a
 * dize-lo. Um portao que depende da ordem de carregamento nao e um portao.
 *
 * Este ficheiro nao importa nada. E a raiz da arvore, e por isso pode ser lido
 * por qualquer um dos outros.
 *
 * `portao-de-existencia.mjs` e `ancora.mjs` continuam a re-exportar o que ja
 * exportavam: quem os importava nao muda uma linha.
 */

/**
 * Os limiares. Pre-registados: mudar isto depois de ver os numeros e batota.
 *
 * OS DOIS LIMIARES, E PORQUE SAO DOIS.
 *
 *     >= 10 defeitos REAIS   e   >= 30% dos candidatos marcados serem reais
 *
 * Cada um dos onze pilares morreu por um lado diferente, e um so criterio deixa
 * passar o outro:
 *
 *   · so a precisao  -> `|| 0` em codigo de dinheiro deu 2 reais em 39 (5%).
 *                       Baixando a fasquia passava, e daria um pilar mudo — dois
 *                       defeitos no repo inteiro nao sustentam uma rotacao.
 *   · so o volume    -> o P11 produziu 87 achados e 1 talvez util (1,1%).
 *                       Passava por volume, e foi exactamente o que aconteceu.
 */
export const LIMIARES = Object.freeze({
  REAIS_MINIMO: 10,
  PRECISAO_MINIMA: 0.30,
});

/**
 * Uma regra — ou um pilar — pode entrar na rotacao?
 *
 * ⚠️ ISTO E O PORTAO A DEIXAR DE SER UM DOCUMENTO.
 *
 * Ate 2026-08-25 a unica coisa que impedia um pilar ou uma regra de entrar sem
 * medicao era um comentario a pedi-la, e um teste que verificava se o campo
 * `porque` tinha um digito. `porque: 'medido 1 vez'` passava. Foi assim que o
 * P11 entrou: passou o ensaio, entrou, e em UM dia deu 87 achados dos quais 76
 * falhavam o proprio enunciado.
 *
 * A pratica que isto segue esta escrita nas best-practices do Claude Code:
 * *"Hooks are deterministic and guarantee the action happens"*, ao contrario das
 * instrucoes em prosa, que sao *advisory*. Um portao que se pode esquecer nao e
 * um portao.
 *
 * O `porque` continua a existir para quem le. O que DECIDE e o `medicao`, que e
 * estruturado e portanto verificavel:
 *
 *     medicao: { candidatos: 84, lidos: 40, reais: 28 }
 *
 * `precisao` NAO se declara: deriva-se de `reais / lidos`. Um numero declarado a
 * mao e um numero que se pode escrever errado.
 */
export function podeEntrar(regra, { limiares = LIMIARES } = {}) {
  if (!regra || regra.activo !== true) return { pode: false, porque: 'nao esta marcada como activa' };
  const m = regra.medicao;
  if (!m || typeof m !== 'object') {
    return { pode: false, porque: 'sem campo `medicao` — uma regra sem numeros nao entra, por mais convincente que seja o `porque`' };
  }
  const inteiro = (x) => Number.isSafeInteger(x) && x >= 0;
  if (!inteiro(m.candidatos) || !inteiro(m.lidos) || !inteiro(m.reais)) {
    return { pode: false, porque: 'a `medicao` tem campos que nao sao inteiros — nao se arredonda um portao' };
  }
  if (m.lidos === 0) return { pode: false, porque: 'zero candidatos lidos: nao houve triagem' };
  if (m.reais > m.lidos) return { pode: false, porque: `${m.reais} reais em ${m.lidos} lidos — impossivel, a medicao esta errada` };
  if (m.lidos > m.candidatos) return { pode: false, porque: `${m.lidos} lidos de ${m.candidatos} candidatos — a amostra nao pode ser maior que o universo` };

  const precisao = m.reais / m.lidos;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const falhas = [];
  if (m.reais < limiares.REAIS_MINIMO) falhas.push(`so ${m.reais} reais, precisa de ${limiares.REAIS_MINIMO}`);
  if (precisao < limiares.PRECISAO_MINIMA) falhas.push(`precisao ${pct(precisao)}, abaixo de ${pct(limiares.PRECISAO_MINIMA)}`);
  if (falhas.length) return { pode: false, porque: falhas.join(' e '), precisao };
  return { pode: true, porque: `${m.reais} reais em ${m.lidos} lidos · ${pct(precisao)}`, precisao };
}
