/**
 * _modelado.tsx — a proveniência dos números de poupança da shell autenticada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORQUE ISTO EXISTE
 *
 * A auditoria de 2026-08-23 encontrou cinco números de poupança em circulação
 * neste projecto, todos a contradizerem-se, e nenhum sobreviveu. Saíram todos da
 * superfície pública. **A shell autenticada ficou com quinze**, sob o argumento
 * de que mostrar a quem entrou não é publicar — o que é verdade, e não chega.
 *
 * Porque o número é modelado. `savings-tracker.js:441-451` é explícito consigo
 * próprio:
 *
 *     real_cost_estimated: 0,  // Σ estimateTurnCost(tier, prompt_len)
 *     naive_cost:          0,  // Σ naiveOpusCost(prompt_len)
 *     saved:               0,  // naive − real
 *
 * `saved` é **estimado menos estimado**, os dois derivados do COMPRIMENTO DO
 * PROMPT. Não há um token contado em lado nenhum deste cano. É exactamente a
 * classe de número que a auditoria matou lá fora.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE MUDOU, E PORQUE ISTO NÃO É APENAS UM RÓTULO
 *
 * Até 2026-08-28 a defesa deste número era esta, escrita em
 * `dashboard/page.tsx:1464`:
 *
 *     «Not real tokens — real token counts require API access mooter doesn't have.»
 *
 * **Deixou de ser verdade.** `tools/router/recibo.js` mede os tokens reais sem
 * API nenhuma: o Claude Code escreve `message.usage` completo em cada linha de
 * `~/.claude/projects/**\/*.jsonl`, e a atribuição faz-se pela cadeia
 * `parentUuid` até ao turno humano — 318 turnos, 9.420 chamadas, 0 órfãs.
 *
 * Ou seja: o número modelado deixou de ser o melhor que se consegue. Passou a
 * ser o **pior** dos dois que existem. E a razão de ele ficar não é técnica — é
 * arquitectural, e vale a pena dizê-la em vez de a esconder:
 *
 *   · O `recibo` lê os transcripts da máquina de QUEM O CORRE. Mede-te a ti.
 *   · A shell mostra dados do hub — de outros devices, de outras pessoas. Nenhum
 *     servidor pode medir tokens que nunca lhe passaram pelas mãos, e é bom que
 *     não possa: os prompts nunca saem da máquina, que é a tese do produto.
 *
 * Portanto o número da shell é modelado por construção, e continuará a sê-lo.
 * O que muda é que passa a dizê-lo, em todos os sítios, com a mesma tipografia
 * — a regra do registo de métricas do dono: «o negativo entra com a mesma
 * tipografia do positivo».
 *
 * E aponta para o número medido, que é o do próprio utilizador. É a mesma
 * doutrina que o `RankingsExplorer` já tinha por excepção declarada: «é o
 * produto a mostrar o número de quem o corre, não o site a afirmar um número
 * sobre terceiros».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CONTRATO
 *
 * Toda a cifra de poupança renderizada em `landing/app/(app)/` passa por aqui.
 * Não é convenção: `design/tools/moo-design-check.mjs` conta como claim
 * qualquer cifra nesta pasta cuja linha NÃO refira `Modelado` (ou `modelled` —
 * o identificador é português, o que o utilizador lê é inglês), e
 * `design/tools/moo-proveniencia.test.mjs` planta uma cifra sem marca e exige
 * que o portão a apanhe. Um rótulo que se pode esquecer não é um rótulo.
 *
 * A marca tem de estar na MESMA LINHA do número — e há um teste só para isso.
 * Uma proveniência a três linhas de distância é a que se perde na próxima
 * refactorização, e aí fica o pior dos dois mundos: o número sem o rótulo, e o
 * portão a dizer que está tudo bem.
 */

import type { ReactNode } from 'react';

/** A proveniência, numa frase. Uma só definição — nunca reescrita à mão. */
export const MODELADO_PORQUE =
  'modelled from prompt length — no tokens are counted in this figure';

/** A alternativa medida, que corre na máquina de quem lê. */
export const MODELADO_ALTERNATIVA = 'mooter recibo';

/**
 * Marca de proveniência. Curta por desenho: vive colada ao número, e um rótulo
 * que não cabe ao lado do número acaba noutro sítio, que é como se perde.
 */
export function Modelado({ titulo }: { titulo?: string }) {
  return (
    <span
      title={titulo ?? `${MODELADO_PORQUE}. For measured cost, run \`${MODELADO_ALTERNATIVA}\` — it reads the token counts already on your machine.`}
      style={{
        fontSize: '0.62rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontFamily: 'var(--mono)',
        marginLeft: 5,
        verticalAlign: 'middle',
        cursor: 'help',
        borderBottom: '1px dotted var(--muted)',
      }}
    >
      modelled
    </span>
  );
}

/**
 * A nota longa, para o pé de uma secção que mostre estes números. Diz o que o
 * número é, o que não é, e onde está o que é medido.
 */
export function ModeladoNota({ children }: { children?: ReactNode }) {
  return (
    <p
      style={{
        fontSize: '0.72rem',
        color: 'var(--muted)',
        lineHeight: 1.6,
        margin: '10px 0 0',
        maxWidth: 640,
      }}
    >
      <strong style={{ color: 'var(--text)' }}>Modelled, not measured.</strong>{' '}
      Savings here are {MODELADO_PORQUE}: the router estimates what each turn
      would have cost per tier from the length of the prompt, and subtracts.
      Nothing on this page counts a token.{' '}
      <strong style={{ color: 'var(--text)' }}>
        For the measured figure, run <code style={{ fontFamily: 'var(--mono)' }}>{MODELADO_ALTERNATIVA}</code>
      </strong>{' '}
      — it reads the token counts Claude Code already writes on your own machine
      and attributes every API call to the prompt that caused it. This page can
      never do that: it shows data synced from devices whose prompts never left
      them, which is the point.
      {children}
    </p>
  );
}
