/**
 * context-pack.mjs — builds a REAL, bounded context pack for one local round.
 *
 * Why this file exists: the host-side prototype asked the local model generic
 * questions with zero bytes of the project attached, so 174 receipts came back
 * hallucinating about routers and invoices that do not exist in this repo.
 * A receipt is only worth something if the model saw real lines and can cite
 * them back as `file:line` — which `evidence-verifier.mjs` then checks for free.
 *
 * Deterministic, zero-LLM, zero-network. Reads the repo and nothing else.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * A escada de bases do diff. O poco de UMA base e FINITO: medido a 2026-08-18,
 * `HEAD~12` dava 20 hunks e o runner consome 2950 rondas por dia (29s cada) —
 * o poco secava em menos de 10 minutos e a GPU passava a remoer os mesmos 20
 * excertos ~147 vezes por dia. Foi assim que 113 rondas deram 0 achados uteis:
 * nao por o motor ser mau, mas por lhe darmos o mesmo trabalho outra vez.
 *
 * Quando a base actual nao tem nada por rever, abre-se a seguinte.
 */
export const DIFF_LADDER = ['HEAD~12', 'HEAD~25', 'HEAD~50', 'HEAD~100'];

export const MAX_SLICE_LINES = 70;
export const MAX_SLICE_BYTES = 16 * 1024;

/**
 * Candidate files per pillar. Explicit lists (not globs) so a round is
 * reproducible and cheap: no walk, no surprise, and a missing file degrades to
 * `n/d` instead of silently shifting the cursor onto something unrelated.
 */
export const PILLARS = {
  /**
   * REDESENHADOS a 2026-08-19, com 33 rondas contra o motor real.
   *
   * O que mudou nao foi o SYSTEM_PROMPT — foi o VERBO. As perguntas antigas
   * pediam possibilidade ("qual destas linhas PODE falhar") e obrigavam a
   * escolher ("Escolhe uma"). Um 14B a quem se manda escolher escolhe SEMPRE,
   * mesmo perante codigo impecavel: 72 achados julgados um a um deram 1 util.
   *
   * Estas pedem COPIA e COMPARACAO. Cada uma tem uma saida neutra que e uma
   * CONCLUSAO do passo de comparacao, nao uma licenca para nao trabalhar
   * ("CADA CHAMADA UMA VEZ", "CONFEREM", "COMPLETA"). Medido: levantar a
   * proibicao de citar comentarios PIORA (2/2 falsos positivos com ela
   * levantada, 3/3 correcto com ela ligada) — a proibicao nunca foi o bloqueio.
   *
   * E mudam os ALVOS, nao so as perguntas. O P3 perde os cinco .md (987 rondas,
   * 0 aceites: eram 100% prosa, e prosa e citacao proibida). O P6 ganha a
   * superficie que o utilizador OPERA, com 0 rondas de sempre.
   */
  P1: {
    label: 'Routing & Cost — repeated work',
    files: [
      'tools/router/*.js',
    ],
    ask: [
      'STEP 1 — copy, one per line, every line in this excerpt that READS a file or',
      'CALLS a function. Format: `LINE <n>: <the call>`.',
      'STEP 2 — look only at the list you just wrote. Does any call appear TWICE with',
      'the same arguments? Write `REPEATED: <line A> and <line B>` for each pair, or',
      '`EVERY CALL ONCE`.',
      'Always end with a line `PROOF: <file>:<one of the line numbers you copied>`.',
    ].join('\n'),
  },
  P2: {
    label: 'Quality & Verification — does the seed value reach the output?',
    files: [
      'tools/**/*.js',
      'packages/*/src/*.ts',
    ],
    ask: [
      'STEP 1 — copy the lines in this excerpt that give a variable the initial value',
      '`0`, `\'\'` or `[]`. Format: `LINE <n>: <name> = <value>`.',
      'STEP 2 — for each name on that list, copy the line IN THIS SAME EXCERPT where it',
      'is returned, added to, or written into an output field. Format: `EXITS AT LINE <n>`;',
      'write `does not exit` when you find none.',
      'STEP 3 — write `SEED VISIBLE: <init line> -> <exit line>` for each name that has',
      'both, or `NO SEED EXITS`.',
      'Always end with a line `PROOF: <file>:<one of the line numbers you copied>`.',
    ].join('\n'),
  },
  P3: {
    label: 'Docs vs Product — comment against code',
    files: [
      'tools/cockpit/runner/*.mjs',
      'tools/router/*.js',
    ],
    ask: [
      'STEP 1 — copy ONE comment from this excerpt that states a concrete number, name',
      'or path. Comment lines start with // or with *. Format: `COMMENT LINE <n>: <text>`.',
      'STEP 2 — copy the CODE line (no // and no *) that this comment describes.',
      'Format: `CODE LINE <n>: <line>`.',
      'STEP 3 — is the value stated in the comment the same one the code uses? Write',
      '`THEY MATCH` or `THEY DIVERGE: comment says <x>, code does <y>`.',
      'Always end with `PROOF: <file>:<the CODE line number>`.',
    ].join('\n'),
  },
  P4: {
    label: 'Hygiene — published text left broken',
    /**
     * ⛔ DESLIGADO 2026-08-21 — nao por gosto, por medicao.
     *
     * Fica no catalogo (nao se apaga) porque 62 recibos do ledger apontam para
     * ele: apagar o pilar tornaria ilegivel o historico que explica porque e que
     * ele foi desligado. Sai apenas da ROTACAO, via `PILLAR_IDS`.
     *
     * **O que se mediu.** Tres configuracoes do mesmo pilar, ledgers isolados:
     *
     *     A · enunciado original     382 rondas   62 achados (16,2%)
     *     B · so o prompt             80 rondas    3 achados
     *     C · harness garante         80 rondas   13 achados
     *
     * Depois, um verificador DETERMINISTICO (sem modelo) sobre a afirmacao que o
     * P4 faz — "esta linha esta cortada a meio" —, que so marca falso quando a
     * linha citada acaba num limite de token obvio (ponto, `)`, `|`, palavra
     * inteira) e diz "nao decido" no resto:
     *
     *                achados   afirmacao falsa   SOBREVIVEM
     *          A        62        47 (75,8%)         0
     *          B         3         3 ( 100%)         0
     *          C        13        13 ( 100%)         0
     *
     * **0 em 78.** E o remate: das 443 `.md` em `docs/`, **0** acabam a meio de
     * uma palavra. O defeito que este pilar procura nao ocorre neste repo.
     *
     * Duas correccoes reais sairam da investigacao e FICAM (valem por si, para
     * todos os pilares): a linha fantasma do `split('\n')` — que fazia 19,4% dos
     * achados citarem uma linha inexistente — e o `janela: 'ultima'`. Nenhuma
     * delas salva o P4: a C ate o faz disparar MAIS por ronda (16,3% contra
     * 13,4%), porque agora todas as janelas sao aquelas onde ele dispara.
     *
     * **Custo do que se desliga:** 382 rondas de GPU para 62 achados, todos
     * falsos, sobre um defeito com zero ocorrencias.
     *
     * **Reversivel numa linha:** apagar este `activo: false`. Reactivar sem
     * mudar a PERGUNTA e, no entanto, repetir a medicao acima.
     *
     * **O que NAO se fez de proposito:** reformular. Higiene a MEIO do documento
     * (links partidos, tabelas tortas) e uma pergunta DIFERENTE — enunciado novo,
     * com a sua propria medicao — e nao um remendo neste.
     */
    activo: false,
    files: [
      '*.md',
      'docs/**/*.md',
      'packages/*/README.md',
      'landing/**/*.md',
    ],
    /**
     * ⚠️ REESCRITO 2026-08-21 — o enunciado anterior media a JANELA, nao o texto.
     *
     * Dizia, literalmente: "copia a ULTIMA linha deste excerto ... esta fechada?".
     * Mas o excerto e uma fatia de 70 linhas cortada num sitio arbitrario, e a
     * ultima linha de uma fatia cai quase sempre a meio de uma fence, de uma
     * tabela ou de um paragrafo. O modelo respondia `BROKEN` e tinha razao sobre
     * a FATIA, sem dizer nada sobre o DOCUMENTO.
     *
     * Medido nos 619 achados com PROOF e janela legiveis do ledger deste device:
     *
     *     pilar   achados   PROOF a <=2 linhas do fim da janela
     *     P1        210      8   3,8%
     *     P2        112      2   1,8%
     *     P3         17      0   0,0%
     *     P4         62     58  93,5%     <-- este
     *     P5        218      4   1,8%
     *
     * 53 dos 62 apontavam para EXACTAMENTE a ultima linha. Tres abertos a mao
     * confirmaram-no: `PERFECT_HANDOFF_SPEC.md:70` ("falta fechar o fence" — a
     * fence fecha depois da janela), `COCKPIT_UX_AUDIT.md:70` ("falta fechar o
     * parentesis" — e uma linha de tabela completa), `PASTOR.md:70` ("falta
     * fechar o paragrafo" — frase completa, `---` na linha 72).
     *
     * Os outros pilares nao tinham o defeito porque perguntam sobre CONTEUDO em
     * qualquer sitio do excerto; so o P4 julgava a fronteira.
     *
     * A correccao nao precisou de mexer no harness: o cabecalho do pack ja diz
     * `Ficheiro: <f> (linhas A-B de N)`. A informacao estava la; o enunciado e
     * que nunca a mandava usar.
     *
     * CONSEQUENCIA ASSUMIDA: o P4 passa a so disparar na ULTIMA janela de cada
     * ficheiro. E o que ele ja fazia de facto (so olhava para a ultima linha),
     * agora sem a mentira da fronteira. Higiene a MEIO do documento (links
     * partidos, tabelas tortas) NAO fica coberta por este pilar — nunca esteve,
     * e fingir o contrario era o que produzia os 93,5%. Se ela for precisa, e um
     * enunciado NOVO, nao um remendo neste.
     *
     * A chave de revisao inclui o hash do `ask` (ver `chaveDeRevisao`), portanto
     * mudar este texto reabre as janelas do P4 para nova passagem — e o A/B
     * mede-se sozinho no `ab-report`.
     */
    // O harness so entrega a ULTIMA janela do ficheiro a este pilar. Sem isto, a
    // pergunta e sobre a fatia e nao sobre o documento — ver o comentario em
    // `indices`, no seletor de janelas.
    janela: 'ultima',
    ask: [
      'STEP 1 — copy the LAST NON-EMPTY line of this excerpt exactly as it is, with',
      'the number you see on the left. This excerpt always ends where the file ends.',
      'STEP 2 — read only that line you copied, and nothing else. Ignore anything',
      'that was opened earlier in the file: you are judging this line alone.',
      'STEP 3 — write `COMPLETE` when that line ends on a whole word, or',
      '`BROKEN: <what is missing>` when it is cut mid-word or mid-token.',
      'Always end with the line `PROOF: <file>:<that last line number>`.',
    ].join('\n'),
  },
  P5: {
    label: 'Local engine & GPU — same shape, different names',
    files: [
      'tools/cockpit/runner/*.mjs',
      'tools/router/gpu-*.js',
      'packages/mooter-bridge/*.js',
    ],
    ask: [
      'STEP 1 — copy the first `return` in this excerpt, with its fields, and the number',
      'of the line where it starts.',
      'STEP 2 — go through the rest of the excerpt and copy every `return` that gives back',
      'the SAME fields, changing only the text or the names. Give the line of each one.',
      'STEP 3 — write `SAME SHAPE: lines <a>, <b>, <c>` when step 2 found anything, or',
      '`SHAPE IS UNIQUE` when the first return does not repeat.',
      'Always end with a line `PROOF: <file>:<one of the line numbers you copied>`.',
    ].join('\n'),
  },
  P6: {
    label: 'Product & Experience — hardcoded number on screen',
    /**
     * ⛔ DESLIGADO 2026-08-21 — o quarto e ultimo dos mudos.
     *
     *     483 rondas · 480 (99,4%) dizem literalmente NO FINDING · 0 achados
     *
     * Semeado o defeito exacto que ele procura — `SavingsCard.tsx`, linha 36,
     * "89%" cravado numa frase de UI — com um controlo onde TODOS os numeros tem
     * origem na mesma linha (props, `formatPct()`, constante importada):
     *
     *     semeado   -> "NO FINDING"  4 tokens
     *     controlo  -> "NO FINDING"  4 tokens
     *
     * Nao e do modelo: perguntado com a guiada acerta em 99 tokens, cita a linha
     * 36 e explica; e no controlo diz correctamente que nao ha nenhum.
     *
     * ⚠️ ELE NAO VARIAVA, ao contrario do que o ledger sugeria. As 89
     * `citacao-ok` e as 37 `refutado` sao TODAS `NO FINDING`: este enunciado
     * exige `PROOF:` mesmo sem achado, portanto 130 rondas emitem uma citacao
     * que nao cita nada, e e o verificador a classificar essa citacao inutil que
     * produz o split. Variava a citacao, nao o achado. **Quem reescrever este
     * pilar tem de tirar o PROOF obrigatorio do caminho do `NO FINDING`.**
     *
     * ⚠️ COBERTURA: era o unico pilar a olhar para `landing/` e para a extensao
     * do VS Code. A partir daqui o loop **nao ve a frente nenhuma** — so
     * `tools/` e `packages/` de backend. Nao se perde deteccao medida (0/483),
     * mas perde-se cobertura, e quem quiser a frente de volta precisa de um
     * pilar NOVO.
     */
    activo: false,
    files: [
      'landing/app/**/*.tsx',
      'landing/components/**/*.tsx',
      'packages/vscode-extension/src/*.js',
    ],
    // MEDIDO a 2026-08-20: este pilar produziu 16 dos 17 `refutado` de 1.645
    // rondas — citacoes para linhas que nao existem no ficheiro. Era o UNICO
    // enunciado que mandava o modelo NAVEGAR entre linhas ("look on the same
    // line OR THE LINE NEXT TO IT") e o unico sem ancora final de prova. A um
    // 14B a quem se pede aritmetica de numeros de linha, o numero inventa-se.
    //
    // Os dois achados deste pilar que valeram alguma coisa
    // (landing/app/api/og/route.tsx:7 e WhyLocalCards.tsx:12) estavam ambos NA
    // PROPRIA linha — tirar a navegacao nao perde nada do que ja funcionou.
    //
    // A saida passa a `NO FINDING`, que o `evidence-verifier` ja sabe ler. O
    // `EVERY NUMBER HAS AN ORIGIN` que o #312 pos aqui nao era lido por nada
    // no repo: era um sentinela que so o proprio enunciado conhecia.
    ask: [
      'STEP 1 — copy, one per line, every line in this excerpt that puts a NUMBER into',
      'something the user sees: a saving, a percentage, a price, a count, a duration.',
      'Copy the line EXACTLY as it is, with the line number you see on the LEFT.',
      'STEP 2 — read only the lines you just copied. For each one, does the number come',
      'from a read, a parameter or an imported constant that is VISIBLE ON THAT SAME',
      'LINE? Write `HAS ORIGIN` or `NO ORIGIN` next to it.',
      'STEP 3 — the first `NO ORIGIN` is the FINDING. If every line has an origin, or',
      'there are no such lines, answer NO FINDING.',
      'Always end with a line `PROOF: <file>:<one of the line numbers you copied>`.',
    ].join('\n'),
  },
  /**
   * P7 — o cockpit vigia-se a si proprio. Todos os outros apontam ao produto;
   * nenhum apontava ao instrumento. Medido: o painel chamou "recibos ao todo" a
   * uma janela de 5000 com o ledger em 6579.
   */
  P7: {
    label: 'Moo Pilot itself',
    files: [
      'tools/cockpit/**/*.mjs',
      'tools/cockpit/*.html',
    ],
    ask:
      'STEP 1 — copy, one per line, every line in this excerpt that puts a NUMBER or a '
      + 'LABEL into something a person will read: a payload field, a rendered string, a '
      + 'counter. Format: `LINE <n>: <name> = <what it holds>`.\n'
      + 'STEP 2 — for each line you copied, find in this same excerpt where that value is '
      + 'produced, and copy that line too.\n'
      + 'STEP 3 — compare the two, word by word. If the name says total, all or every, and '
      + 'the production has a slice, a limit, a cap or a filter, cite BOTH lines. If every '
      + 'name matches what its own line produces, answer NO FINDING.',
  },
  /**
   * P8 — pontas soltas. Um campo escrito e nunca lido, ou lido e nunca escrito,
   * VE-SE dentro de um excerto. Custou tres vezes numa so sessao: escopo,
   * hunksTruncados e diffErro, todos produzidos e nunca consumidos.
   */
  P8: {
    label: 'Loose ends between features',
    files: [
      'tools/cockpit/runner/*.mjs',
      'packages/mooter-bridge/*.js',
      'packages/router/src/*.ts',
    ],
    /**
     * ⛔ DESLIGADO 2026-08-21 — o unico dos tres com a causa PROVADA.
     *
     * Nao e "nao acha nada": e que nao ha nada desta forma para achar. Quatro
     * implementacoes medidas (3 passos · 1 extraccao · pergunta directa ·
     * determinista) e nenhuma serve — a determinista discrimina na perfeicao
     * num fixture e depois marca 41,4% das janelas do repo real, porque
     * "campo escrito e nunca lido aqui" descreve argumentos e valores de
     * retorno. Detalhe completo no bloco abaixo.
     *
     * Reversivel numa linha, mas reactivar sem mudar a PERGUNTA e repetir 455
     * rondas de GPU para zero.
     */
    activo: false,
    /**
     * ⚠️ NAO REESCREVER ESTE ENUNCIADO. A PERGUNTA E QUE ESTA MAL-POSTA.
     *
     * Este pilar respondeu `sem-achado` em 455/455 rondas. O metodo #312
     * (`prova-de-pilar.mjs`) semeou-lhe o defeito exacto que ele diz procurar —
     * `tempo_estimado_s`, escrito e nunca mais referido — com um controlo limpo
     * ao lado. Resposta byte a byte igual nos dois: `NO FINDING`, 4 tokens.
     *
     * Tentou-se corrigir por enunciado a 2026-08-21, e MEDIU-SE cada tentativa:
     *
     *     forma                                     semeado    repo real
     *     3 passos (esta)                           nao acha    0% em 455 rondas
     *     1 extraccao ("copia os campos mortos")    nao acha    —
     *     pergunta directa NEUTRA                   nao acha    —
     *     pergunta directa GUIADA (afirma que ha)   acha 13tok  nao serve: pressupoe
     *     saida com prova obrigatoria               acha 147tok 3 falsos no controlo
     *     DETERMINISTA, janela de 70 linhas         acha        41,4% das janelas
     *     DETERMINISTA, ficheiro inteiro            acha        66,7% · 284 campos
     *
     * A reescrita para uma so extraccao foi revertida por medir exactamente o
     * mesmo: zero. E a versao determinista — sem modelo nenhum — discrimina na
     * perfeicao no fixture e depois inunda o repo real.
     *
     * O PORQUE, que e o que interessa: em JavaScript real, "um campo escrito
     * num objecto e nunca lido aqui" descreve sobretudo ARGUMENTOS
     * (`{ cwd, encoding, timeout, stdio }` que o `execSync` consome) e VALORES
     * DE RETORNO (`{ ok, host }` que o chamador consome). Isso e codigo normal,
     * nao um defeito. O fixture so funcionou porque se construiu de proposito um
     * objecto que nao era nem argumento nem retorno.
     *
     * Nao ha enunciado que salve isto, porque o alvo nao existe como classe. O
     * que existe — campo morto a serio — precisa de saber quem CONSOME o objecto,
     * e isso e analise de chamadas, nao leitura de um excerto.
     */
    ask:
      'STEP 1 — copy, one per line, every field this excerpt WRITES into an object. '
      + 'Format: `WRITTEN LINE <n>: <field>`.\n'
      + 'STEP 2 — for each field name you copied, search the rest of the excerpt for that '
      + 'exact name and copy every other line where it appears. Format: `READ LINE <n>`.\n'
      + 'STEP 3 — a field with a WRITTEN line and no READ line is written and never used. '
      + 'Cite its line. If every field you copied appears on both sides, answer NO FINDING.',
  },
  /**
   * P9 — a primeira pergunta deste ficheiro que NAO procura um defeito.
   *
   * Os oito pilares acima perguntam todos o que esta errado. Nenhum pergunta o
   * que podia ser melhor, e por isso a GPU nunca trouxe uma oportunidade: nao
   * lhe pediram uma. Repeticao e a oportunidade mais barata de ver e a mais
   * cara de deixar ficar — duas verificacoes iguais divergem no dia em que uma
   * delas e corrigida.
   *
   * Continua a exigir a MESMA prova: duas linhas citadas, ou nada. Uma
   * oportunidade sem citacao e uma opiniao.
   */
  P9: {
    label: 'Repetition worth a name',
    /**
     * ⛔ DESLIGADO 2026-08-21 — por NAO DETECTAR, nao por pergunta mal-posta.
     *
     * 455 rondas, 455 `sem-achado`, 0 achados. Semeado o defeito exacto que ele
     * diz procurar (`rotulos.mjs`: guardas identicas nas linhas 12 e 24, so muda
     * `nome`/`rotulo`), com um controlo de seis transformacoes todas distintas:
     *
     *     semeado   -> "NO FINDING"  4 tokens
     *     controlo  -> "NO FINDING"  4 tokens
     *
     * Byte a byte igual. Zero discriminacao.
     *
     * ⚠️ A DIFERENCA PARA O P8, que importa se alguem quiser reactiva-lo: no P8
     * ficou PROVADO que a pergunta esta mal-posta — quatro implementacoes, e ate
     * a determinista inunda. Aqui **nao se testou isso**. Sabe-se que este
     * enunciado nao detecta; NAO se sabe se outro detectaria. "Duas expressoes
     * que fazem o mesmo trabalho" e, ao contrario do campo morto, uma pergunta
     * que se responde dentro do excerto.
     *
     * Quem reactivar: mudar a PERGUNTA primeiro, e re-medir com o mesmo par
     * (`prova-de-pilar.mjs --pilar P9`). Reactivar como esta e repetir as 455.
     */
    activo: false,
    files: [
      'tools/router/*.js',
      'tools/cockpit/runner/*.mjs',
      'packages/router/src/*.ts',
    ],
    ask:
      'STEP 1 — copy, one per line, every check, guard or transformation in this excerpt. '
      + 'Format: `LINE <n>: <the expression>`.\n'
      + 'STEP 2 — compare the lines you copied to each other, character by character.\n'
      + 'STEP 3 — if two of them do the same work (identical, or differing only in a '
      + 'variable name), cite BOTH line numbers and give the one name they should share. '
      + 'If every line you copied is unique work, answer NO FINDING.',
  },
  /**
   * P10 — o trabalho que a maquina podia fazer e esta a pedir a uma pessoa.
   *
   * E a tese do produto virada para dentro: um passo manual escrito num README
   * e um passo que alguem vai esquecer. Se esta escrito, pode ser corrido.
   */
  P10: {
    label: 'Handwork a script could do',
    /**
     * ⛔ DESLIGADO 2026-08-21 — por NAO DETECTAR, como o P9.
     *
     * 455 rondas, 455 `sem-achado`, 0 achados. Semeado um runbook com a linha 41
     * — "Confirma no painel da Vercel..." — sem nenhum comando no documento que
     * o faca, contra um controlo com OITO instrucoes, todas com o comando ao
     * lado (um runbook sem instrucao nenhuma tambem daria NO FINDING, mas pela
     * razao errada):
     *
     *     semeado   -> "NO FINDING"  4 tokens
     *     controlo  -> "NO FINDING"  4 tokens
     *
     * Como no P9: sabe-se que este enunciado nao detecta, NAO se sabe se outro
     * detectaria. Perguntado directamente, o mesmo modelo acerta a primeira
     * (113 tokens, cita a linha 41 e transcreve a instrucao).
     *
     * ⚠️ CONSEQUENCIA DE COBERTURA, declarada porque nao e obvia: com o P4 ja
     * desligado, este era o ULTIMO pilar a olhar para `*.md`, `docs/**`,
     * `packages/<pkg>/README.md` e `.github/workflows/`. **A partir daqui o
     * loop nao le documentacao nem CI.** Nao se perde deteccao medida — o P4 deu
     * 0/78 achados verdadeiros e este deu 0/455 — mas perde-se a COBERTURA, e
     * quem voltar a querer olhar para docs precisa de um pilar novo, nao de
     * reactivar este.
     */
    activo: false,
    files: [
      '*.md',
      'docs/**/*.md',
      '.github/workflows/*.yml',
      'packages/*/README.md',
    ],
    ask:
      'STEP 1 — copy, one per line, every sentence in this excerpt that tells a PERSON to '
      + 'do something: run, copy, paste, check, remember, update, confirm. Format: '
      + '`LINE <n>: <the instruction>`.\n'
      + 'STEP 2 — for each one you copied, search this same excerpt for a command, script '
      + 'or CI step that already does it, and copy that line if it exists.\n'
      + 'STEP 3 — an instruction with no line doing it is handwork a script could do. Cite '
      + 'its line and name what would run it. If this excerpt asks nothing of a person, '
      + 'answer NO FINDING.',
  },
};

/**
 * Os pilares que ENTRAM NA ROTACAO.
 *
 * Um pilar com `activo: false` continua no catalogo — o `PILLARS` inteiro — mas
 * o loop nao lhe pega. A distincao existe porque os recibos ja escritos guardam
 * o `pilar`, e apagar a entrada tornaria ilegivel o historico que explica porque
 * e que ele foi desligado. Um pilar desligado tem de conseguir explicar-se.
 *
 * Consequencia deliberada: `readFocus` valida contra estes ids, portanto pedir
 * foco num pilar desligado e RECUSADO em voz alta em vez de silenciosamente
 * ignorado — que e o comportamento certo para um botao que nao pode funcionar.
 */
export const PILLAR_IDS = Object.keys(PILLARS).filter((id) => PILLARS[id].activo !== false);

/** Todos, incluindo os desligados — para o painel e para ler historico. */
export const PILLAR_IDS_TODOS = Object.keys(PILLARS);

/** Onde um projecto declara os seus proprios pilares. */
export const PILLARS_FILE = '.mooter/pilares.json';

/**
 * Valida uma declaracao de pilares vinda de um projecto.
 *
 * As entradas podem ser caminhos ou PADROES (`tools/router/*.js`). Ate
 * 2026-08-19 este comentario dizia "sem globs, sem walk", e invocava
 * reprodutibilidade: um pilar tinha de dar a mesma ronda hoje e daqui a um mes.
 * O argumento caiu por medicao — com listas de 3 a 5 ficheiros, 46% das rondas
 * morriam sem material e a GPU corria 5 minutos por hora. O determinismo que
 * importa mantem-se: a expansao e ordenada e em cache, e duas leituras no mesmo
 * instante dao a mesma lista. O que NAO se pode exigir e que a lista seja a
 * mesma daqui a um mes — se o repo cresceu, o trabalho tambem cresceu.
 *
 * O que muda com o B3 e QUEM declara a lista: deixa de ser este ficheiro e
 * passa a ser o projecto.
 *
 * @returns {{ok: boolean, pillars: object|null, erros: string[]}}
 */
export function validarPilares(bruto) {
  const erros = [];
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { ok: false, pillars: null, erros: ['a raiz tem de ser um objecto { P1: {...}, ... }'] };
  }
  const ids = Object.keys(bruto);
  if (ids.length === 0) erros.push('nenhum pilar declarado');
  const limpos = {};
  for (const id of ids) {
    const p = bruto[id];
    const onde = `pilar ${id}`;
    if (!p || typeof p !== 'object') { erros.push(`${onde}: nao e um objecto`); continue; }
    if (typeof p.label !== 'string' || !p.label.trim()) erros.push(`${onde}: falta \`label\``);
    if (typeof p.ask !== 'string' || !p.ask.trim()) erros.push(`${onde}: falta \`ask\` (a pergunta da ronda)`);
    if (!Array.isArray(p.files) || p.files.length === 0) {
      erros.push(`${onde}: \`files\` tem de ser uma lista nao vazia de caminhos relativos`);
      continue;
    }
    const maus = p.files.filter((f) => typeof f !== 'string' || !f.trim() || f.startsWith('/') || f.split('/').includes('..'));
    // Um caminho que sai do repo nao e um pilar mal configurado: e leitura de
    // ficheiros fora do projecto a partir de um ficheiro do projecto.
    if (maus.length) erros.push(`${onde}: caminhos fora do repo ou invalidos: ${JSON.stringify(maus.slice(0, 3))}`);
    if (typeof p.label === 'string' && typeof p.ask === 'string' && !maus.length) {
      limpos[id] = { label: p.label.trim(), files: p.files.map(String), ask: p.ask.trim() };
    }
  }
  if (erros.length) return { ok: false, pillars: null, erros };
  return { ok: true, pillars: limpos, erros: [] };
}

/**
 * Carrega os pilares do projecto, com os embutidos como DEFAULT.
 *
 * Nunca lanca e nunca para uma ronda — mas tambem nunca cala: um
 * `pilares.json` presente e invalido devolve os defaults COM um `erro` que
 * quem chama tem de registar. Um catch que devolve vazio em silencio foi
 * exactamente como o modo diff ficou morto um dia inteiro sem ninguem saber.
 *
 * @returns {{pillars: object, ids: string[], fonte: 'projeto'|'default', ficheiro: string, erro: string|null}}
 */
export function loadPillars(repoRoot, { readImpl = fs.readFileSync } = {}) {
  const ficheiro = path.join(String(repoRoot || ''), PILLARS_FILE);
  const embutidos = { pillars: PILLARS, ids: PILLAR_IDS, fonte: 'default', ficheiro, erro: null };
  let raw;
  try {
    raw = readImpl(ficheiro, 'utf8');
  } catch (err) {
    // Ausente e o caso normal: o projecto nao declarou nada, usam-se os nossos.
    return err && err.code === 'ENOENT'
      ? embutidos
      : { ...embutidos, erro: `${PILLARS_FILE} ilegivel: ${String((err && err.message) || err).slice(0, 120)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ...embutidos, erro: `${PILLARS_FILE} nao e JSON valido: ${String((err && err.message) || err).slice(0, 120)}` };
  }
  const v = validarPilares(parsed && parsed.pilares ? parsed.pilares : parsed);
  if (!v.ok) return { ...embutidos, erro: `${PILLARS_FILE} recusado: ${v.erros.slice(0, 4).join('; ')}` };
  return { pillars: v.pillars, ids: Object.keys(v.pillars), fonte: 'projeto', ficheiro, erro: null };
}

/**
 * The output contract is deliberately narrow. A first live pass with a softer
 * prompt made qwen2.5-coder:14b answer `SEM ACHADO` on every round: given a wall
 * of numbered lines and an abstract question, bailing was the cheapest path. So
 * the task is now "pick one line from what you see and say why", the answer
 * shape is fixed to two labelled lines, and the empty verdict is moved to the
 * bottom with an explicit bar to clear.
 */
const SYSTEM_PROMPT = [
  'És um revisor do Mooter a correr localmente. Recebes um excerto REAL do',
  'repositório, com o número da linha à esquerda de cada linha.',
  '',
  'A tua tarefa é encontrar um DEFEITO REAL. Não é encontrar algo a dizer.',
  '',
  'Se houver um defeito real, responde EXACTAMENTE assim, sem mais nada:',
  '',
  'ACHADO: <sintoma> QUANDO <condição que o dispara> ENTÃO <impacto concreto>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'O que conta como defeito real (só isto):',
  '- erro que rebenta ou é engolido em silêncio num caminho alcançável;',
  '- risco de segurança concreto (input não validado, permissão larga, segredo exposto);',
  '- a linha contradiz o que o código/doc afirma noutro sítio;',
  '- recurso não libertado, corrida, off-by-one, condição invertida.',
  '',
  '',
  "OS TRÊS ERROS QUE MAIS SE COMETEM AQUI. Medidos: dos 72 achados que este motor",
  "produziu e que foram julgados um a um, 39 morreram por uma destas três razões —",
  "mais do que por qualquer outra coisa. Antes de dizeres ACHADO, verifica as três.",
  '',
  "1. JÁ ESTÁ GUARDADO (20 dos 72). Se ao lado da linha houver um ficheiro .sha256,",
  "   um teste que a cobre, ou um gate de CI nomeado num comentário, então o risco",
  "   JÁ está travado. Um guarda a funcionar não é um defeito. \"Este sha pode",
  "   divergir\" não é achado quando existe um .sha256 que é o que o impede.",
  '',
  "2. É DELIBERADO E ESTÁ ESCRITO (12 dos 72). Este repositório comenta os PORQUÊS.",
  "   Se houver no excerto um comentário que explica a decisão — um catch que é",
  "   mesmo para engolir, um valor cravado com justificação, uma despromoção de",
  "   tier explicada — lê-o e acredita nele. Esse comentário é a resposta à tua",
  "   objecção, escrita antes de tu a fazeres.",
  '',
  "3. É UM REGISTO DO PASSADO (7 dos 72). Uma entrada de changelog, uma linha de",
  "   log de commits, um snapshot datado, um \"Sessão #28\" — descrevem o que",
  "   ACONTECEU. Um facto datado não fica desactualizado nem contradiz o código de",
  "   hoje: ele nunca falou do código de hoje.",
  '',
  'NUNCA cites, em nenhuma circunstância:',
  '- uma linha de comentário (// /* * #), uma linha em branco, uma cerca de código (```);',
  '- markdown, títulos, tabelas ou prosa — cita só linhas EXECUTÁVEIS;',
  '- um `null`/`n/d` que é claramente intencional e honesto (é feature, não bug).',
  '',
  'Frases proibidas (se a tua única queixa for isto, NÃO é achado):',
  '"pode confundir o utilizador", "pode não ser intuitivo", "pode ser null",',
  '"poderia ser melhor documentado", "falta contexto adicional".',
  '',
  'REGRA MAIS IMPORTANTE: se não vires um defeito real neste excerto, responde',
  'apenas SEM ACHADO. Isso é uma resposta CERTA e valiosa — a maioria dos excertos',
  'de código bom não tem defeito. Inventar um achado fraco é o pior erro possível.',
  '',
  'Regras de forma:',
  '- O caminho é o que está no cabeçalho "Ficheiro:".',
  '- O número tem de ser um número que vês à esquerda no excerto.',
  '- Nunca inventes ficheiros nem números.',
  '- Sem preâmbulo, sem explicação extra, sem markdown.',
].join('\n');

/**
 * Modo DIFF — o degrau mais alto da escada.
 *
 * Uma analise estatica sobre um repo parado da um conjunto FINITO de achados:
 * depois de julgados, o poco seca e a GPU passa a moer ruido. Codigo que MUDA
 * gera trabalho novo para sempre. Por isso o runner olha primeiro para o diff.
 */
export const DIFF_SYSTEM_PROMPT = [
  'És um revisor de código do Mooter a correr localmente. Recebes linhas que',
  'MUDARAM agora, com o número real de cada linha à esquerda.',
  '',
  'A tua tarefa: encontrar defeitos INTRODUZIDOS por estas linhas.',
  '',
  'EXAMINA COM ATENÇÃO ESPECIAL, linha a linha:',
  '- condições booleanas: o && / || / ! está correcto? inverter uma condição de',
  '  permissão ou de guarda é o defeito mais caro que existe;',
  '- índices e limites: <= vs <, length vs length-1, o primeiro e o último passo',
  '  do ciclo — percorre-os mentalmente com um caso concreto;',
  '- caminhos de erro: algo rebenta ou é engolido onde é alcançável?',
  '- recursos: fica alguma coisa aberta, presa ou por libertar?',
  '- o contrato com quem chama: o retorno mudou de forma, tipo ou significado?',
  '',
  'Se encontrares um defeito, responde EXACTAMENTE assim, sem mais nada:',
  '',
  'ACHADO: <sintoma> QUANDO <condição que o dispara> ENTÃO <impacto concreto>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'Se percorreste a lista acima e a mudança está correcta, responde apenas:',
  '',
  'SEM ACHADO',
  '',
  'Regras:',
  '',
  "ANTES DE DIZERES ACHADO, três verificações (medidas: 39 dos 72 achados deste",
  "motor morreram por falharem uma delas):",
  "- JÁ ESTÁ GUARDADO? um .sha256 ao lado, um teste, um gate nomeado num",
  "  comentário. Um guarda a funcionar não é defeito.",
  "- ESTÁ EXPLICADO? se um comentário do excerto justifica a decisão, ele é a",
  "  resposta à tua objecção — lê-o e acredita.",
  "- É DO PASSADO? changelog, log de commits, snapshot datado: descreve o que",
  "  aconteceu, e um facto datado não contradiz o código de hoje.",
  '- NÃO comentes estilo, nomes, formatação, nem "podia estar mais documentado".',
  '  Isso não é defeito e não conta.',
  '- Mas um defeito REAL nunca pode passar em silêncio: se a lógica está errada,',
  '  diz. Ficar calado perante um bug é pior do que um falso alarme.',
  '- Cita só linhas que vês. Nunca inventes ficheiros nem números.',
].join('\n');

/**
 * Deteccao de logica de NEGACAO — o ponto cego medido do tier local.
 *
 * O canario de 2026-08-17 mostrou-o e a producao confirmou-o no mesmo dia: o
 * qwen2.5-coder:14b le `!==` como `===`. Falhou uma condicao de permissao
 * invertida no canario e, horas depois, acusou de fail-open um `isStopped` que
 * e fail-closed — as duas vezes por ler a negacao ao contrario.
 *
 * Nao se conserta isto com prompt: e o tecto do modelo. O que se pode fazer e
 * SABER quando estamos nesse terreno, e nao vender a resposta como certa.
 */
const NEGACAO_RE = /!==|!=|!\s*\(|![A-Za-z_$]|\bnunca\b|\bnever\b/g;

/** Quantos operadores de negacao aparecem no texto dado. */
export function contarNegacoes(texto) {
  const m = String(texto || '').match(NEGACAO_RE);
  return m ? m.length : 0;
}

/**
 * Um excerto e "denso em negacao" a partir de dois operadores, ou de um so
 * quando esse um decide um caminho (if/return/ternario) — que e onde inverter
 * o sentido custa caro.
 */
export function negacaoDensa(texto) {
  const n = contarNegacoes(texto);
  if (n >= 2) return true;
  if (n === 1) return /\b(if|return|while|\?)\b/.test(String(texto || ''));
  return false;
}

/**
 * A identidade de um excerto revisto. Inclui o CONTEUDO, nao so a posicao: se
 * as linhas mudarem, e trabalho novo e volta a fila; se nao mudarem, ja foi
 * julgado e nao ha nada a ganhar em julga-lo outra vez.
 */
/**
 * Fase de um device na caminhada partilhada.
 *
 * Dois devices a conduzir o MESMO repo percorriam a mesma sequencia pela mesma
 * ordem e moiam os mesmos alvos — o dobro da GPU pelo mesmo trabalho. Cada um
 * entra na caminhada num ponto diferente, deterministico no NOME do device: a
 * frota cobre mais em vez de repetir, e uma maquina sozinha continua a dar
 * exactamente a mesma ronda que dava.
 *
 * Nao substitui coordenacao a serio (um device nao sabe o que o outro ja
 * julgou); e a versao barata que nao precisa de nenhuma.
 */
export function faseDoDevice(device) {
  const nome = String(device || '');
  if (!nome) return 0;
  let h = 0;
  for (let i = 0; i < nome.length; i += 1) h = ((h * 31) + nome.charCodeAt(i)) >>> 0;
  return h % 7919; // primo: nao alinha com o numero de pilares nem de hunks
}

export function hunkKey(file, startLine, endLine, texto) {
  const sha = crypto.createHash('sha256').update(String(texto || '')).digest('hex').slice(0, 12);
  return `${file}:${startLine}-${endLine}:${sha}`;
}

/**
 * A chave que diz "isto ja foi julgado" — E O PILAR FAZ PARTE DELA.
 *
 * Ate aqui a chave era so o conteudo (`ficheiro:linhas:sha`). Uma janela vista
 * pelo P3 ficava marcada como vista para os OITO pilares, embora cada um faca
 * uma pergunta diferente sobre ela. "Este comentario contradiz o codigo?" e
 * "este campo e escrito e nunca lido?" nao sao o mesmo trabalho, e responder a
 * uma nunca respondeu a outra.
 *
 * Medido a 2026-08-19 na maquina do dono: 46% das rondas de uma hora morriam
 * com "todas as janelas ja foram revistas" sem chamar o modelo uma unica vez,
 * e P2, P3 e P6 estavam a 100% de esgotamento. A GPU corria 5 minutos por
 * hora. Esta linha multiplica o material disponivel pelo numero de pilares
 * sem acrescentar um unico ficheiro.
 *
 * ⚠️ As chaves antigas (sem pilar) deixam de bater. Isso e uma REPOSICAO
 * deliberada, nao um acidente: os pilares mudaram de pergunta, e as 604
 * janelas ja vistas nunca foram vistas com as perguntas de agora.
 */
export function chaveDeRevisao(pillar, file, startLine, endLine, texto, ask = null) {
  // ⚠️ A PERGUNTA FAZ PARTE DA CHAVE.
  //
  // Sem ela, mudar o enunciado de um pilar deixa as janelas ja vistas marcadas
  // como feitas — sob uma pergunta que ja nao existe. Aconteceu a 2026-08-19: o
  // #312 reescreveu P7, P8, P9 e P10, e 1129 janelas ficaram fechadas para
  // sempre a uma pergunta que nunca lhes foi feita.
  //
  // E o mesmo principio que o Bazel usa na action cache: a chave e o digest de
  // TUDO o que determina a resposta — comando E entradas. Aqui, o excerto E a
  // pergunta. Um `revistos` endereçado por conteudo so e correcto se o conteudo
  // incluir aquilo que produziu a resposta.
  const v = ask ? crypto.createHash('sha256').update(String(ask)).digest('hex').slice(0, 6) : 'sem-q';
  return `${pillar}.${v}|${hunkKey(file, startLine, endLine, texto)}`;
}

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

/**
 * O que conta como trabalho novo para rever.
 *
 * Medido a 2026-08-18 (`git diff --name-only HEAD~12...HEAD` sobre extensoes de
 * codigo): 53 ficheiros, dos quais 10 em `_handoff/**` — copias arquivadas de
 * codigo que ja nao corre — e 24 `*.test.*`. A GPU moia arquivo e chamava-lhe
 * revisao.
 *
 * A primeira versao deste comentario dizia "10 dos 20", porque o denominador foi
 * lido de uma listagem truncada a 20 linhas: 19% publicado como 50%. Fica escrito
 * porque foi apanhado por uma auditoria adversarial e porque este e, de todos os
 * ficheiros do repo, aquele cuja razao de existir e caçar metricas que mentem.
 * As
 * exclusoes sao pathspec do git (`:(exclude)`), avaliadas pelo proprio git, para
 * que o custo do diff caia na origem em vez de se filtrar depois.
 */
export const DIFF_PATHSPEC = [
  '*.js', '*.mjs', '*.cjs', '*.ts', '*.tsx', '*.jsx',
  ':(exclude)_handoff/**',
  ':(exclude)docs/archive/**',
  ':(exclude)*.test.*',
];

/**
 * Lê as linhas que mudaram entre `baseRef` e HEAD. Devolve [] em qualquer falha
 * — um repo sem git, um ref inexistente ou um diff vazio nunca podem parar uma
 * ronda; o runner cai para o degrau seguinte da escada.
 */
export function readChangedLines(repoRoot, { baseRef = 'HEAD~6', runImpl = null, maxFiles = 40, onError = null, onCap = null } = {}) {
  // maxBuffer explicito: um diff de 12 commits neste repo da 52k linhas e o
  // default de 1 MB do execFileSync rebenta com ENOBUFS. O catch mudo que estava
  // aqui engolia isso e devolvia [] — o modo diff nunca disparava e ninguem
  // sabia porque. E exactamente a classe de defeito que este runner procura,
  // encontrada no proprio runner. Agora o buffer chega, o diff e limitado a
  // ficheiros de codigo pelo pathspec, e a falha e REPORTADA em vez de calada.
  const run = runImpl || ((args) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      // Windows: sem isto cada `git` abre uma consola nova e rouba o foco.
      windowsHide: true,
    }));
  let out;
  try {
    out = run(['diff', '--unified=0', '--no-color', `${baseRef}...HEAD`, '--', ...DIFF_PATHSPEC]);
  } catch (err) {
    // Nunca parar a ronda por causa disto — mas tambem nunca fingir que o diff
    // estava vazio quando na verdade rebentou.
    if (onError) onError(String((err && err.message) || err).slice(0, 160));
    return [];
  }
  const hunks = [];
  let file = null;
  for (const line of String(out || '').split('\n')) {
    if (line.startsWith('+++ b/')) {
      const rel = line.slice(6).trim();
      const dot = rel.lastIndexOf('.');
      file = dot >= 0 && CODE_EXT.has(rel.slice(dot)) ? rel : null;
      continue;
    }
    if (!file || !line.startsWith('@@')) continue;
    const m = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isInteger(start) || start < 1 || count < 1) continue;
    hunks.push({ file, start, count });
    // Tecto real, dito em voz alta. Sem o `onCap`, `HEAD~100` e `HEAD~200`
    // devolviam os dois exactamente 320 hunks e ninguem sabia porque: um tecto
    // silencioso le-se como "cobri tudo" quando nao cobriu.
    if (hunks.length >= maxFiles * 8) {
      if (onCap) onCap(hunks.length);
      break;
    }
  }
  return hunks;
}

/**
 * Modo ANCORADO. O moo deixa de caçar achados (o que media 85% de nitpick) e passa
 * a julgar um achado que uma MÁQUINA já encontrou. Um LLM é bom a julgar contexto
 * e mau a ser detetor primário — por isso o detetor é o eslint e o juiz é o moo.
 */
export const ANCHORED_SYSTEM_PROMPT = [
  'És um revisor do Mooter a correr localmente. Uma ferramenta de análise estática',
  'apontou uma linha. O teu trabalho é JULGAR esse apontamento — não procurar outro.',
  '',
  'Responde EXACTAMENTE num destes dois formatos, sem mais nada:',
  '',
  'ACHADO: <sintoma> QUANDO <condição que o dispara> ENTÃO <impacto concreto>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'ou, se o apontamento não for um defeito real neste contexto:',
  '',
  'FALSO POSITIVO: <porque é seguro aqui, numa frase>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'Regras:',
  '',
  "ANTES DE DIZERES ACHADO, três verificações (medidas: 39 dos 72 achados deste",
  "motor morreram por falharem uma delas):",
  "- JÁ ESTÁ GUARDADO? um .sha256 ao lado, um teste, um gate nomeado num",
  "  comentário. Um guarda a funcionar não é defeito.",
  "- ESTÁ EXPLICADO? se um comentário do excerto justifica a decisão, ele é a",
  "  resposta à tua objecção — lê-o e acredita.",
  "- É DO PASSADO? changelog, log de commits, snapshot datado: descreve o que",
  "  aconteceu, e um facto datado não contradiz o código de hoje.",
  '- Cita a MESMA linha que a ferramenta apontou.',
  '- FALSO POSITIVO é uma resposta CERTA e valiosa — muitos avisos são intencionais',
  '  (um `null` honesto, um catch que é mesmo para engolir, um regex sobre input fixo).',
  '- Nunca inventes ficheiros nem números. Sem preâmbulo, sem markdown.',
].join('\n');

/** Regras que valem mais: defeito provável primeiro, estilo/ruído por último. */
/**
 * Regras do eslint que NAO sao defeito neste projecto.
 *
 * Medido a 2026-08-19 no `ancora-achados.json` real: 76 apontamentos, dos quais
 * **58 sao `no-empty`** (76%) e 14 sao `PARSE`. Amostrados tres dos `no-empty`,
 * todos eram `catch (e) {}` em caminhos de telemetria — deliberados, porque um
 * hook nunca pode partir o turno do dono.
 *
 * A prioridade sozinha nao resolvia isto: ordenar poe os poucos bons a frente,
 * e esgotados esses o resto e `no-empty` para sempre. Foi assim que 13 dos 45
 * achados por triar nasceram "bloco vazio" — a GPU a olhar para uma decisao
 * intencional e a ser-lhe perguntado se e um defeito.
 *
 * `PARSE` nao e sequer uma regra: e o eslint a nao conseguir ler o ficheiro.
 * Vale a pena saber, mas nao e coisa que um modelo julgue a partir de um excerto.
 */
export const REGRAS_IGNORADAS = new Set(['no-empty', 'PARSE']);

const RULE_PRIORITY = {
  'require-atomic-updates': 0,
  'no-dupe-keys': 1,
  'no-unreachable': 1,
  'no-self-compare': 1,
  'no-fallthrough': 2,
  'no-empty': 3,
  'security/detect-child-process': 3,
  'security/detect-unsafe-regex': 5,
};

/**
 * Lê os achados da âncora estática. Devolve [] em qualquer falha — uma âncora
 * ausente nunca deve parar uma ronda, só faz o runner voltar ao modo de caça.
 */
export function readAnchor(anchorPath, { readImpl = fs.readFileSync } = {}) {
  if (!anchorPath) return [];
  let raw;
  try {
    raw = readImpl(anchorPath, 'utf8');
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x) => x && typeof x.file === 'string' && Number.isInteger(x.line) && x.line > 0)
    .filter((x) => !REGRAS_IGNORADAS.has(x.rule))
    .sort((a, b) => {
      const pa = RULE_PRIORITY[a.rule] ?? 4;
      const pb = RULE_PRIORITY[b.rule] ?? 4;
      if (pa !== pb) return pa - pb;
      return String(a.file).localeCompare(String(b.file));
    });
}

/** Reads a file and returns its lines, or null when it does not exist. */
function readLines(repoRoot, relPath) {
  const abs = path.join(repoRoot, relPath);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  const linhas = raw.split('\n');
  // ⚠️ `split('\n')` num ficheiro terminado em newline — que sao quase todos —
  // devolve um ultimo elemento `''` que NAO e uma linha do ficheiro. O
  // `renderSlice` renderizava-o como `  147| ` num ficheiro de 146 linhas, e o
  // modelo, mandado julgar A ULTIMA LINHA do excerto, via uma linha vazia e
  // respondia BROKEN.
  //
  // Medido no ledger deste device a 2026-08-21: **12 dos 62 achados do P4
  // (19,4%) citavam uma linha que nao existe no ficheiro** — `ARCHITECTURE_V5.md:147`
  // num ficheiro de 146, `SENTRY-DSN-RUNBOOK.md:172` num de 171,
  // `MOOTER_ROADMAP.md:78` num de 77. A citacao parecia fabricada pelo modelo e
  // nao era: o harness deu-lhe mesmo aquela linha.
  if (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas;
}

/**
 * Picks the candidate file for this round. The cursor rotates over the files
 * that actually exist, so a deleted file shifts the rotation instead of
 * producing an empty round.
 */
/**
 * Quantos ficheiros um pilar pode ter, no maximo.
 *
 * Existe para limitar a caminhada no disco, nao para esconder trabalho: quando
 * o corte morde, o numero REAL viaja no `reason` do esgotamento. Um tecto que
 * ninguem ve e um numero falso a espera de acontecer.
 */
export const MAX_CANDIDATOS = 300;

/** Pastas que nunca sao codigo deste projecto a correr. */
const PASTAS_IGNORADAS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo',
  '.venv', '__pycache__', '_handoff', 'out', '.cache',
]);

/** Caminhos que sao arquivo: codigo que ja nao corre, mas ainda esta no disco. */
const CAMINHOS_IGNORADOS = ['docs/archive/', '.claude/worktrees/'];

/**
 * `tools/**\/*.js` -> RegExp. `**` atravessa pastas; `*` fica dentro de uma.
 * As sentinelas sao texto visivel de proposito: um caractere de controlo aqui
 * seria invisivel em qualquer diff que alguem leia.
 */
export function padraoParaRegex(padrao) {
  const escapado = String(padrao).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const corpo = escapado
    .replace(/\*\*\//g, '@@PASTAS@@')
    .replace(/\*\*/g, '@@TUDO@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@PASTAS@@/g, '(?:[^/]+/)*')
    .replace(/@@TUDO@@/g, '.*');
  return new RegExp('^' + corpo + '$');
}

/** Cache curta: a caminhada e barata, mas nao precisa de correr a cada ronda. */
const CACHE_PADRAO = new Map();
const CACHE_PADRAO_MS = 60_000;

/**
 * Expande um padrao para os ficheiros que existem MESMO no repo, por ordem
 * determinista. Um caminho literal (sem `*`) devolve-se a si proprio se
 * existir — uma lista de ficheiros antiga continua a funcionar tal e qual, e
 * e por isso que o `.mooter/pilares.json` de quem ja o tem nao parte.
 */
export function expandirPadrao(repoRoot, padrao, agora = Date.now()) {
  if (!String(padrao).includes('*')) {
    return readLines(repoRoot, padrao) !== null ? [padrao] : [];
  }
  const chave = repoRoot + '|' + padrao;
  const guardado = CACHE_PADRAO.get(chave);
  if (guardado && agora - guardado.em < CACHE_PADRAO_MS) return guardado.files;

  const re = padraoParaRegex(padrao);
  // Arranca na maior pasta literal do padrao: `landing/app/**` nao tem de
  // varrer o repo inteiro para descobrir que so lhe interessa `landing/`.
  const partes = String(padrao).split('/');
  const literais = [];
  for (const seg of partes.slice(0, -1)) {
    if (seg.includes('*')) break;
    literais.push(seg);
  }
  const encontrados = [];
  const pilha = [literais.join('/')];
  while (pilha.length > 0 && encontrados.length < MAX_CANDIDATOS * 4) {
    const rel = pilha.pop();
    let entradas;
    try {
      entradas = fs.readdirSync(path.join(repoRoot, rel || '.'), { withFileTypes: true });
    } catch { continue; }
    for (const e of entradas) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const filho = rel ? rel + '/' + e.name : e.name;
      if (CAMINHOS_IGNORADOS.some((x) => (filho + '/').startsWith(x))) continue;
      if (e.isDirectory()) {
        if (PASTAS_IGNORADAS.has(e.name)) continue;
        pilha.push(filho);
      } else if (e.isFile() && re.test(filho)) {
        // Pela mesma razao que o DIFF_PATHSPEC os exclui: um teste que falha
        // ja grita sozinho, e a GPU a moe-los era GPU a rever o alarme em vez
        // do incendio.
        if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(filho)) continue;
        encontrados.push(filho);
      }
    }
  }
  encontrados.sort();
  CACHE_PADRAO.set(chave, { em: agora, files: encontrados });
  return encontrados;
}

/**
 * Os ficheiros de um pilar, com a contagem REAL antes do corte.
 * @returns {{files: string[], total: number, truncado: boolean}}
 */
export function candidatosDoPilar(repoRoot, pillarId, pillars = PILLARS) {
  const pillar = pillars[pillarId];
  if (!pillar) return { files: [], total: 0, truncado: false };
  const vistos = new Set();
  for (const entrada of pillar.files) {
    for (const f of expandirPadrao(repoRoot, entrada)) vistos.add(f);
  }
  const todos = [...vistos].sort();
  return {
    files: todos.slice(0, MAX_CANDIDATOS),
    total: todos.length,
    truncado: todos.length > MAX_CANDIDATOS,
  };
}

export function resolveCandidates(repoRoot, pillarId, pillars = PILLARS) {
  return candidatosDoPilar(repoRoot, pillarId, pillars).files;
}

/**
 * Quem e o dono de um ficheiro, quando mais do que um pilar o reclama.
 *
 * Com padroes, a sobreposicao passa a ser a regra: `tools/router/*.js` cabe ao
 * P1 e ao P3, que lhe fazem perguntas diferentes. Na CACA isso e riqueza — a
 * memoria de revisao e por pilar, e o mesmo excerto sob outra pergunta e
 * trabalho novo. No DIFF e desperdicio: o diff e um poco pequeno e partilhado,
 * e oito pilares a moer o mesmo hunk sao um pilar a custar oito vezes.
 *
 * O dono e o pilar de AMBITO MAIS ESTREITO que o reclama — o que tem menos
 * ficheiros no total. Um pilar que diz `tools/cockpit/*.html` sabe mais sobre
 * aquele ficheiro do que um que diz `tools/**` + '/' + '*.js'. Empate desfaz-se pela
 * ordem dos ids, para ser deterministico.
 */
export function donoDoFicheiro(repoRoot, file, pillars = PILLARS) {
  let dono = null;
  let ambito = Infinity;
  for (const id of Object.keys(pillars)) {
    // ⚠️ Um pilar DESLIGADO nao pode ser dono de nada.
    //
    // Apanhado pelo teste da sobreposicao ao desligar o P4 (2026-08-21): ele
    // reclamava `*.md` e era o reclamante de ambito mais estreito, portanto
    // continuava a ganhar a posse de todos os `.md` do poco do diff — para um
    // pilar que ja nao corre. O efeito seria pior do que o problema que o
    // desligar resolve: os `.md` deixavam de ser revistos POR NINGUEM, e em
    // silencio, porque a posse existe precisamente para os outros pilares nao
    // lhes pegarem.
    if (pillars[id] && pillars[id].activo === false) continue;
    const c = candidatosDoPilar(repoRoot, id, pillars);
    if (!c.files.includes(file)) continue;
    if (c.files.length < ambito) { ambito = c.files.length; dono = id; }
  }
  return dono;
}

/** Renders a slice with real 1-based line numbers so citations are checkable. */
export function renderSlice(lines, startLine, maxLines = MAX_SLICE_LINES) {
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, start + maxLines - 1);
  const out = [];
  let bytes = 0;
  let last = start - 1;
  for (let n = start; n <= end; n += 1) {
    const rendered = `${String(n).padStart(5, ' ')}| ${lines[n - 1]}`;
    bytes += Buffer.byteLength(rendered, 'utf8') + 1;
    if (bytes > MAX_SLICE_BYTES) break;
    out.push(rendered);
    last = n;
  }
  return { text: out.join('\n'), startLine: start, endLine: last, count: out.length };
}

/**
 * Builds the pack for one round.
 *
 * @returns {{ok: true, pillar, label, file, startLine, endLine, lineCount,
 *            question, system, prompt, allowedFiles: string[]}}
 *        | {ok: false, reason: string, pillar: string}
 */
export function buildContextPack({
  repoRoot,
  pillar,
  cursor = 0,
  maxLines = MAX_SLICE_LINES,
  anchorPath = null,
  diffBase = null,
  diffRunImpl = null,
  // O device que esta a conduzir. Entra na fase da caminhada; ver faseDoDevice.
  device = null,
  // So a recursao da escada liga isto. Com uma base UNICA, um diff esgotado
  // tem de CAIR para o degrau seguinte (ancorado/caca) em vez de devolver
  // `ok:false`: medido a 2026-08-18 com `MOO_DIFF_BASE=HEAD~12`, 240 de 360
  // rondas nao produziam pack nenhum — dois tercos da GPU a nao fazer nada, e
  // cada uma dessas rondas escrevia um recibo sem bandeira, que o disjuntor
  // nao ve.
  pararSeEsgotado = false,
  // O que ja foi julgado. Um Set de chaves de `hunkKey`; vazio = tudo por rever.
  revistos = null,
  // Os pilares do PROJECTO, quando ele os declara. O default embutido continua
  // a ser o de sempre, para que um repo sem `.mooter/pilares.json` corra igual.
  pillars = PILLARS,
}) {
  const spec = pillars[pillar];
  if (!spec) return { ok: false, reason: `pilar desconhecido: ${pillar}`, pillar };

  // Escada de bases: quando a base actual nao tem nada por rever, abre-se a
  // seguinte em vez de remoer. Uma base so e um poco finito — 20 hunks contra
  // 2950 rondas por dia. Esgotadas todas, cai para os degraus de baixo
  // (ancorado, caca), que e a degradacao que ja existia.
  if (Array.isArray(diffBase)) {
    const resto = { repoRoot, pillar, cursor, maxLines, anchorPath, diffRunImpl, pillars, revistos, device };
    for (const base of diffBase) {
      const r = buildContextPack({ ...resto, diffBase: base, pararSeEsgotado: true });
      if (r.ok) return { ...r, escadaBase: base };
      // Esgotada e o unico motivo para alargar; qualquer outra falha e falha.
      if (!r.esgotado) break;
    }
    return buildContextPack({ ...resto, diffBase: null });
  }

  // O degrau do diff so ve codigo (ver DIFF_PATHSPEC). Um pilar cujos ficheiros
  // sao TODOS documentos — o P3, cujo trabalho SAO os documentos — nunca podia
  // ter interseccao com o diff, e ficava preso em `escopo: 'geral'` para
  // sempre, a rever codigo de outros em vez do canon que lhe compete. Para
  // esse, o diff nao e um degrau: e um desvio.
  const temCodigo = spec.files.some((f) => {
    const d = String(f).lastIndexOf('.');
    return d >= 0 && CODE_EXT.has(String(f).slice(d));
  });

  // ---- degrau 1: DIFF — rever o que mudou (trabalho infinito enquanto houver commits)
  let diffErro = null;
  if (diffBase && temCodigo) {
    let truncado = null;
    const todos = readChangedLines(repoRoot, {
      baseRef: diffBase, runImpl: diffRunImpl,
      onError: (e) => { diffErro = e; },
      onCap: (n) => { truncado = n; },
    });
    // Os hunks que caem nos ficheiros DESTE pilar. Sem interseccao, o pilar nao
    // tem nada de seu no diff: revemos o resto na mesma — trabalho novo vale
    // mais do que arrumacao — mas dizemo-lo, e `escopo: 'geral'` e um rotulo
    // que nao mente. O rotulo do pilar deixa de ser colado a um ficheiro que
    // nada tem a ver com ele.
    // Com padroes, a pertenca deixa de ser `includes` numa lista literal: um
    // pilar que diz `tools/router/*.js` e dono de 193 ficheiros que nunca
    // escreveu a mao. Expande-se (com cache) e pergunta-se ao conjunto real.
    const meus = todos.filter((h) => donoDoFicheiro(repoRoot, h.file, pillars) === pillar);
    // O que NENHUM pilar reclama. Deixar o `geral` percorrer `todos` punha-o a
    // cair no mesmo hunk que um pilar dono ja estava a rever — 8 colisoes em
    // 201 cursores, a primeira no cursor 2, porque o passo aritmetico nao ajuda
    // quando as duas caminhadas sao sobre conjuntos diferentes. Os orfaos sao
    // tambem a definicao honesta de "diff geral": a parte do trabalho novo que
    // nao tem dono.
    const orfaos = todos.filter((h) => donoDoFicheiro(repoRoot, h.file, pillars) === null);
    const escopo = meus.length > 0 ? 'pilar' : 'geral';
    const hunks = meus.length > 0 ? meus : (orfaos.length > 0 ? orfaos : todos);
    if (hunks.length > 0) {
      // Fora do ambito do pilar, o cursor sozinho dava a TODOS os pilares o
      // MESMO hunk na mesma ronda: medido a 2026-08-18, os packs de P1 e P5
      // diferiam em 1 linha de 25 — so o cabecalho — e a pergunta era
      // identica. Seis pilares a moer o mesmo ficheiro sao um pilar, com seis
      // vezes o custo. O ordinal do pilar desfaz a correlacao sem perder o
      // determinismo: mesma ronda, mesmo repo, mesmo resultado.
      // `indexOf` devolve -1 para um pilar fora do conjunto; `Math.max(0, ...)`
      // impede que um id desconhecido desloque a rotacao para tras.
      const ids = Object.keys(pillars);
      // `indexOf` devolve -1 para um pilar fora do conjunto; `Math.max(0, ...)`
      // impede que um id desconhecido desloque a rotacao para tras.
      // O desvio vale para os DOIS escopos. So o aplicar a `geral` deixava
      // dois pilares que partilham um ficheiro (P2 e P6 partilham
      // build-snapshot.js) a cair no mesmo hunk, com `desvio = 0` ambos, em
      // 100% das rondas — e um `geral` a colidir com um `pilar`. Medido:
      // 10 colisoes em 201 cursores, a primeira no cursor 10.
      const desvio = Math.max(0, ids.indexOf(pillar));
      // O passo tem de ser o NUMERO DE PILARES, nao 1. Com `cursor + desvio`, o
      // pilar k da rotacao r caia no mesmo hunk que o pilar k-1 da rotacao r+1
      // — medido no ledger vivo a 2026-08-18: P2 e P1, rondas seguidas, a mesma
      // janela 277-295. Multiplicar pelo numero de pilares torna cada par
      // (rotacao, pilar) um lugar unico na caminhada.
      const passo = cursor * ids.length + desvio + faseDoDevice(device);
      // Varre a partir do lugar deterministico ate encontrar um excerto que
      // ainda nao foi julgado. Sem isto, o cursor voltava sempre ao mesmo
      // hunk assim que o poco dava a volta.
      let h = null;
      let chave = null;
      for (let k = 0; k < hunks.length; k += 1) {
        const cand = hunks[Math.abs(passo + k) % hunks.length];
        const ls = readLines(repoRoot, cand.file);
        if (!ls || ls.length === 0 || cand.start > ls.length) continue;
        const fimC = Math.min(ls.length, cand.start + cand.count - 1);
        const kc = chaveDeRevisao(pillar, cand.file, cand.start, fimC, ls.slice(cand.start - 1, fimC).join('\n'), spec.ask);
        if (revistos && revistos.has(kc)) continue;
        h = cand;
        chave = kc;
        break;
      }
      // Poco seco nesta base: cai para o degrau seguinte da escada em vez de
      // remoer. Quem chama e que decide abrir uma base mais larga.
      // Esgotado: a escada quer saber para abrir a base seguinte; uma base
      // unica nao tem para onde ir e cai para os degraus de baixo.
      if (!h && pararSeEsgotado) {
        return { ok: false, esgotado: true, reason: `nada por rever em ${diffBase}`, pillar, diffErro };
      }
      if (h) {
      const lines = readLines(repoRoot, h.file);
      if (lines && lines.length > 0 && h.start <= lines.length) {
        const pad = 8; // contexto à volta da mudança, para o juiz perceber o que a rodeia
        const slice = renderSlice(lines, Math.max(1, h.start - pad), Math.min(maxLines, h.count + pad * 2));
        const fim = h.start + h.count - 1;
        // `mudadas` e `densa` TÊM de vir antes do prompt: o prompt usa `densa`.
        // Tê-los depois deu "Cannot access 'densa' before initialization" e
        // rebentou todas as rondas — apanhado só porque o runner regista a
        // excepção no recibo em vez de morrer calado.
        const mudadas = slice.text
          .split('\n')
          .filter((ln) => {
            const n = Number(String(ln).slice(0, 6).trim());
            return Number.isInteger(n) && n >= h.start && n <= fim;
          })
          .join('\n');
        const densa = negacaoDensa(mudadas);
        const rotulo = escopo === 'pilar'
          ? `${spec.label} (pilar ${pillar})`
          : `Diff geral — fora dos ficheiros do pilar ${pillar}`;
        const prompt = [
          `Revisao: ${rotulo}`,
          `Ficheiro: ${h.file} (linhas ${slice.startLine}-${slice.endLine} de ${lines.length})`,
          '',
          `MUDARAM as linhas ${h.start}-${fim} (contra ${diffBase}). O resto é contexto.`,
          '',
          slice.text,
          '',
          `Esta mudança (linhas ${h.start}-${fim}) introduz algum defeito?`,
          ...(densa
            ? [
                '',
                'ATENÇÃO: estas linhas usam negação (!, !==, !=). Lê cada condição',
                'DUAS vezes e diz em palavras o que ela significa antes de decidir.',
                '`a !== b` é "a é DIFERENTE de b". `!x` é "x é falso".',
              ]
            : []),
        ].join('\n');
        return {
          ok: true,
          mode: 'diff',
          escopo,
          chave,
          ...(truncado ? { hunksTruncados: truncado } : {}),
          negacaoDensa: densa,
          diffErro,
          anchored: false,
          diffBase,
          changedStart: h.start,
          changedCount: h.count,
          pillar,
          label: rotulo,
          file: h.file,
          startLine: slice.startLine,
          endLine: slice.endLine,
          lineCount: lines.length,
          question: `rever mudança em ${h.file}:${h.start}-${fim}`,
          system: DIFF_SYSTEM_PROMPT,
          prompt,
          allowedFiles: [h.file],
        };
        }
      }
    }
  }

  // ---- modo ANCORADO: julgar um achado que a máquina já encontrou ----
  // Se o `git diff` rebentou, a ronda continua pelo degrau seguinte — mas o
  // erro TEM de viajar ate ao recibo. Foi um catch mudo aqui que deixou o modo
  // diff morto um dia inteiro sem ninguem saber (ENOBUFS num diff de 52k
  // linhas). Capturar o erro e nao o mostrar e o mesmo catch mudo com mais
  // passos.
  const anchors = readAnchor(anchorPath);
  if (anchors.length > 0) {
    // O MESMO desvio que o ramo do diff ja tinha. Sem ele, os seis pilares
    // faziam `anchors[cursor % anchors.length]` e apontavam todos ao mesmo
    // apontamento: medido a 2026-08-18 na configuracao de PRODUCAO, 240
    // colisoes em 60 cursores (67%), com 9 recibos seguidos na mesma janela de
    // `gsd-statusline.js` pelos seis pilares. O ramo do diff estava corrigido e
    // este nao — e e este que corre a maior parte do tempo.
    const idsA = Object.keys(pillars);
    const passoA = cursor * idsA.length + Math.max(0, idsA.indexOf(pillar)) + faseDoDevice(device);
    // Varre a partir do lugar deterministico ate achar um apontamento por
    // julgar, tal como o ramo do diff faz com os hunks.
    // ⚠️ O ambito do pilar TEM de valer aqui tambem.
    //
    // Ate 2026-08-19 este ramo percorria TODOS os apontamentos do eslint sem
    // olhar a quem pertencem. Um pilar de documentos (P4, P10) recebia
    // `tools/router/*.js` e respondia a pergunta DELE sobre material que nao e
    // dele. Medido nas 5 primeiras horas do P10: 17 citacoes, todas sobre
    // blocos catch vazios em .js — quando a pergunta do P10 e "isto manda uma
    // PESSOA fazer a mao o que um script podia fazer?", feita a documentos.
    //
    // A pergunta certa sobre o ficheiro errado nao e meia resposta: e ruido
    // com aspecto de achado, que e pior, porque passa a triagem a parecer
    // trabalho. Sem apontamentos no seu ambito, o pilar cai para a caca — que
    // sempre respeitou o ambito.
    const meus = new Set(candidatosDoPilar(repoRoot, pillar, pillars).files);
    const anchorsDoPilar = anchors.filter((a) => meus.has(a.file));
    let hit = null;
    let chaveA = null;
    for (let k = 0; k < anchorsDoPilar.length; k += 1) {
      const cand = anchorsDoPilar[Math.abs(passoA + k) % anchorsDoPilar.length];
      const ls = readLines(repoRoot, cand.file);
      if (!ls || ls.length === 0 || cand.line > ls.length) continue;
      const kc = chaveDeRevisao(pillar, cand.file, cand.line, cand.line, `${cand.rule}|${ls[cand.line - 1] || ''}`, spec.ask);
      if (revistos && revistos.has(kc)) continue;
      hit = cand;
      chaveA = kc;
      break;
    }
    if (hit) {
      const hitLines = readLines(repoRoot, hit.file);
      if (hitLines && hitLines.length > 0 && hit.line <= hitLines.length) {
      // Janela centrada na linha apontada: o juiz precisa do que está em volta.
      const half = Math.floor(maxLines / 2);
      const slice = renderSlice(hitLines, Math.max(1, hit.line - half), maxLines);
      {
      const prompt = [
        `Pilar: ${pillar} — ${spec.label}`,
        `Ficheiro: ${hit.file} (linhas ${slice.startLine}-${slice.endLine} de ${hitLines.length})`,
        '',
        `A ferramenta apontou a LINHA ${hit.line}, regra "${hit.rule}":`,
        `  ${String(hit.msg || '').slice(0, 200)}`,
        '',
        slice.text,
        '',
        `Julga o apontamento na linha ${hit.line}. É defeito real ou falso positivo?`,
      ].join('\n');
      return {
        ok: true,
        diffErro,
        mode: 'ancorado',
        chave: chaveA,
        anchored: true,
        anchorRule: hit.rule,
        anchorLine: hit.line,
        pillar,
        label: spec.label,
        file: hit.file,
        startLine: slice.startLine,
        endLine: slice.endLine,
        lineCount: hitLines.length,
        question: `julgar ${hit.rule} em ${hit.file}:${hit.line}`,
        system: ANCHORED_SYSTEM_PROMPT,
        prompt,
        allowedFiles: [hit.file],
      };
      }
      }
    }
  }

  const candidates = resolveCandidates(repoRoot, pillar, pillars);
  if (candidates.length === 0) {
    return { ok: false, reason: 'nenhum ficheiro-âncora existe no repo', pillar };
  }

  // Percorre (ficheiro, janela) e nao so as janelas de UM ficheiro. A versao
  // anterior fixava `candidates[cursor % candidates.length]` e, esgotadas as
  // janelas desse, devolvia `ok:false` com os IRMAOS por rever: medido, 12 de
  // 24 cursores desperdicados quando um pilar tinha um ficheiro curto e outro
  // longo.
  const ids = Object.keys(pillars);
  const passoF = cursor * Math.max(1, ids.length) + Math.max(0, ids.indexOf(pillar)) + faseDoDevice(device);
  let file = null;
  let lines = null;
  let slice = null;
  let chaveC = null;
  for (let fi = 0; fi < candidates.length && !slice; fi += 1) {
    // `passoF` e nao `cursor`: o passo ja traz o indice do pilar e a fase do
    // device, e a escolha do FICHEIRO precisa deles tanto como a da janela.
    // Ate aqui so a janela os usava — dois pilares com listas sobrepostas, no
    // mesmo cursor, escolhiam sempre o mesmo ficheiro e o desvio por pilar
    // morria no `% janelas` de um ficheiro de uma janela so.
    const cand = candidates[Math.abs(passoF + fi) % candidates.length];
    const ls = readLines(repoRoot, cand);
    if (!ls || ls.length === 0) continue;
    const janelas = Math.max(1, Math.ceil(ls.length / maxLines));
    /**
     * QUAIS janelas este pilar pode ver.
     *
     * Por omissao, todas, em rotacao. Mas um pilar cuja pergunta so faz sentido
     * no FIM do ficheiro (`janela: 'ultima'`, o P4) nao pode receber uma fatia
     * do meio: a ultima linha de uma fatia arbitraria cai a meio de uma fence,
     * de uma tabela ou de um paragrafo, e o modelo responde BROKEN com razao
     * sobre a FATIA e sem dizer nada sobre o DOCUMENTO.
     *
     * A primeira tentativa de corrigir isto (2026-08-21) foi pedir ao modelo que
     * comparasse o fim da janela com o fim do ficheiro, ambos ja escritos no
     * cabecalho do pack. MEDIU-SE, e quase nao mexeu: a taxa de achado em
     * janelas cortadas passou de 18,0% para ~13,6%. O qwen2.5-coder:14b escrevia
     * `FIM DO FICHEIRO` por reflexo em janelas que claramente nao o eram
     * (`THREAT_MODEL.md 1-70` com uma janela `71-109` a seguir).
     *
     * A licao fica: **uma condicao que o harness consegue garantir nunca se pede
     * a um modelo.** Aqui garante-se — e o enunciado do P4 deixa de precisar de
     * aritmetica nenhuma.
     */
    const indices = spec.janela === 'ultima'
      ? [janelas - 1]
      : Array.from({ length: janelas }, (_, k) => (Math.abs(passoF) + k) % janelas);
    for (const idx of indices) {
      const sl = renderSlice(ls, (idx * maxLines) + 1, maxLines);
      const kc = chaveDeRevisao(pillar, cand, sl.startLine, sl.endLine, sl.text, spec.ask);
      if (revistos && revistos.has(kc)) continue;
      file = cand; lines = ls; slice = sl; chaveC = kc;
      break;
    }
  }
  if (!slice) {
    const conta = candidatosDoPilar(repoRoot, pillar, pillars);
    return {
      ok: false,
      esgotado: true,
      // O numero viaja com a queixa: "esgotado" com 3 ficheiros e um problema
      // de ambito; com 300 e um problema de ritmo. Pedem respostas diferentes.
      reason: `todas as janelas dos ${conta.files.length} ficheiros do pilar ja foram revistas`
        + (conta.truncado ? ` (de ${conta.total}; a lista foi cortada em ${MAX_CANDIDATOS})` : ''),
      pillar,
      diffErro,
    };
  }

  // Second axis of the cursor walks down long files across rounds, so a 900-line
  // file is not forever represented by its first 120 lines.
  const prompt = [
    `Pilar: ${pillar} — ${spec.label}`,
    `Ficheiro: ${file} (linhas ${slice.startLine}-${slice.endLine} de ${lines.length})`,
    '',
    slice.text,
    '',
    spec.ask,
  ].join('\n');

  return {
    ok: true,
    diffErro,
    chave: chaveC,
    mode: 'caca',
    anchored: false,
    pillar,
    label: spec.label,
    file,
    startLine: slice.startLine,
    endLine: slice.endLine,
    lineCount: lines.length,
    question: spec.ask,
    system: SYSTEM_PROMPT,
    prompt,
    allowedFiles: [file],
  };
}
