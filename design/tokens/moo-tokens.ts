/* GERADO por tools/moo-tokens-build.mjs a partir de tokens/moo-tokens.json.
   NÃO EDITAR À MÃO — a próxima geração apaga o que aqui escreveres.
   fonte: frugal@97ad846b · medido 2026-08-27 · v2.0.0 */

export const MOO = {
  "color": {
    "tinta": {
      "bg": "#0B0A09",
      "bg-2": "#0F0E0C",
      "surface": "#141311",
      "surface-2": "#1C1A17",
      "surface-4": "#2B2A26",
      "surface-3": "#242320",
      "line": "#252220",
      "line-strong": "#302C28",
      "line-soft": "#1E1B19",
      "text": "#F2EDE6",
      "text-2": "#C9C2B8",
      "muted": "#998F85",
      "faint": "#9B8F82",
      "accent": "#E8888A",
      "accent-2": "#F2A5A5",
      "on-accent": "#1A0E0E",
      "ok": "#4CAF6A",
      "warn": "#D4C090",
      "bad": "#DC7262"
    },
    "papel": {
      "bg": "#F2ECDF",
      "bg-2": "#EBE3D1",
      "surface": "#FBF7EE",
      "surface-2": "#FFFDF7",
      "surface-4": "#EDEAE1",
      "surface-3": "#F6F4EE",
      "line": "#D9D0BB",
      "line-strong": "#C8BCA0",
      "line-soft": "#E8E4DB",
      "text": "#1A1613",
      "text-2": "#3A332C",
      "muted": "#6D6458",
      "faint": "#6E6455",
      "accent": "#AF4046",
      "accent-2": "#A53F45",
      "on-accent": "#FFFFFF",
      "ok": "#30724C",
      "warn": "#7E6031",
      "bad": "#A84836"
    },
    "tier": {
      "web": {
        "t0": "#4CAF6A",
        "t1": "#5A9BD4",
        "t2": "#A88BD4",
        "t3": "#D46A5A",
        "t5": "#D9A441"
      },
      "terminal": {
        "t0": "#4CAF6A",
        "t1": "#5A9BD4",
        "t2": "#D4C090",
        "t3": "#D46A5A",
        "t5": "#D9A441"
      },
      "papel": {
        "t0": "#28784C",
        "t1": "#196BA4",
        "t2": "#795DA7",
        "t3": "#B14C39",
        "t5": "#7D5A15"
      },
      "nota": "T2 diverge por desenho: o roxo não sobrevive à paleta de 16 cores do terminal.",
      "nota_t5": "T5 (Fable) e opt-in via @fable e NUNCA e auto-rotado; nao existe T4. Por isso nao e um quinto degrau da rampa — e a cor que se le como estando FORA dela, e e o unico tom quente-dourado do conjunto. Escolhido a 2026-08-28 por medicao, nao por gosto: entre 6 candidatos, o ambar #D9A441 e o que maximiza a MENOR distancia perceptual dentro do conjunto {T0,T1,T2,T3,T5} — dE minimo 43,8, melhor do que o pior par da propria rampa actual (29,8, entre T1 e T2). Contraste 8,80:1 sobre tinta.bg. E fica a 50,0 de dE do accent, que era o problema a resolver: ate hoje o T5 usava var(--color-accent), e a marca nao e um tier. No terminal fica o mesmo tom (dE 32,6 do #D4C090 do T2, distinguivel). Em papel escurece para #7D5A15 para passar AA (5,33:1).",
      "nota_papel": "ESCURECIDOS a 2026-08-29 para passarem AA. Antes: t0 3,53 · t1 4,42 · t2 4,47 · t3 4,13 sobre papel.bg — os quatro abaixo de 4,5, e nenhum declarado como par, portanto o portao nunca os tinha medido. Foram encontrados a 28/08 ao declarar o t5, e ficaram um dia por resolver com a cautela de que mexer na paleta clara era mexer em impressao. Medido depois: **a paleta de papel esta declarada em todo o lado e usada em lado nenhum** — os dois decks gerados (`moo-deck.html`, `moo-pitch-a4.html`) declaram as variaveis mas tem ZERO `var(--moo-tier-papel-*)`. A cautela era boa e a medicao dissolveu-a. Os valores nao sairam de escurecer as cegas: procurou-se, dentro da mesma familia de matiz (+-8 graus), a combinacao de MENOR desvio sujeita a duas restricoes — AA >= 4,5 e separacao minima do conjunto {t0..t3,t5} >= 29,8, que e a da rampa web. Resultado: contraste 4,50 a 4,85, separacao minima a subir de 25,9 para **30,1** (o par apertado continua a ser t1/t2, azul e roxo, tal como na web), e desvio total de 15,2 nas quatro cores — o t2 mexe-se 0,4, o t3 2,4. Cada uma continua na sua familia: verde, azul, roxo, terracota."
    },
    "term": {
      "bg": "#0d1117",
      "line": "#30363d",
      "head": "#161b22",
      "fg": "#c9d1d9",
      "dim": "#8b949e"
    },
    "marca": {
      "chifre": "#B8C0C8",
      "cabeca": "#CCD3DA",
      "focinho": "#EDAEB0",
      "narina": "#C16A6F",
      "olho": "#2C2F33",
      "brilho": "#FFFFFF"
    },
    "bad_nota_tinta": "CLAREADO a 2026-08-30, de #D46A5A. O token PASSAVA em todas as superficies que o sistema define (5,66:1 sobre tinta.bg, 4,97 sobre surface-2) e FALHAVA onde e realmente pintado: os paineis do cockpit, que sao cravados e mais claros do que qualquer superficie do token — 4,39:1 no --panel e 4,11:1 no --panel2. Foi o unico achado que sobreviveu ao auditor visual depois de ele passar a medir os dois temas. Escolhido clarear o TOKEN (dE76 3,0) em vez de escurecer os paineis (dE 1,0 e 3,3): uma cor de alerta mais clara em tema escuro e o padrao, resolve para superficies que ainda nao existem, e nao mexe na elevacao do cockpit. Distancia ao tinta.warn praticamente inalterada (dE 45,6 -> 43,9). RESSALVA REGISTADA: isto nao fecha a classe. Os mesmos paineis dao 6 outras combinacoes abaixo de AA na matriz (tinta.muted e tinta.faint sobre --panel/--panel2/--card) que NAO renderizam hoje, porque o cockpit usa cinzentos proprios. A causa de raiz — paineis fora da escala de superficies — continua de pe.",
    "superficies_nota": "COMPLETADA a 2026-08-30, e a razao e a mesma da escala de raios a 2026-08-28: a escala e que estava incompleta, nao o codigo. Medido nesse dia: os quatro paineis do cockpit mapeavam, no tema ESCURO, para `line` e `line-strong` — ou seja, para os degraus que a escala reserva aos TRACOS, nao as superficies. Usar uma cor de linha como fundo de painel e semanticamente errado mesmo quando e numericamente o mais proximo. A causa: a rampa escura ia de L* 2,8 a 9,4 (bg -> surface-2) e o cockpit precisa de L* 13,7 e 17. Quatro degraus para uma superficie que tem cinco niveis de elevacao. Acrescentados `surface-3` e `surface-4` com os valores que o trabalho REAL usa, tal como o `radius_nota` fez com o hairline/tight/panel — e NAO um quinto, para a rampa nao virar uma escada sem degraus. Custo medido e pago no mesmo commit: os degraus novos punham `tinta.muted` (4,12 e 3,77) e `tinta.faint` (4,08 e 3,73) abaixo de AA, e os dois foram clareados (dE76 5,4 e 5,8) mantendo a separacao entre eles em dE 1,9 e a distancia ao `text-2` em dE 20. O `papel` recebe os mesmos nomes por simetria e passa sem tocar em nada. Com isto os paineis do cockpit deixam de ser uma segunda fonte de verdade: `--panel`/`--panel2`/`--card`/`--term` passam a apontar ao token, com desvio maximo de dE 1,5. As BORDAS ficam de fora e declaradas: mapeiam a dE 5,4-7,3, e move-las e uma decisao de desenho, nao de acessibilidade."
  },
  "type": {
    "family": {
      "sans": "var(--font-sans, 'Space Grotesk'), -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      "mono": "var(--font-mono, 'JetBrains Mono'), ui-monospace, SFMono-Regular, monospace",
      "hand": "var(--font-caveat, 'Caveat'), cursive",
      "$nota": "Cada família começa por uma variável injectável COM FALLBACK DENTRO do var(). O fallback não é cosmético: `var(--font-sans)` sem segundo argumento é INVÁLIDO quando a variável não existe, e um valor inválido no ponto de uso derruba a declaração inteira — o shorthand `font:` cai todo e o texto sai em Times New Roman 16px. Medido a 2026-08-27 pelo gerador de deck, que corre fora da landing: lá o next/font injecta --font-sans, aqui não injecta ninguém. O `globals.css:985` já fazia isto certo; o token é que não fazia."
    },
    "scale": {
      "hero": {
        "size": "clamp(56px,13vw,168px)",
        "weight": 700,
        "lh": "0.92",
        "ls": "-0.05em"
      },
      "h1": {
        "size": "clamp(44px,6vw,76px)",
        "weight": 700,
        "lh": "1.02",
        "ls": "-0.045em"
      },
      "h2": {
        "size": "clamp(32px,3.6vw,48px)",
        "weight": 700,
        "lh": "1.08",
        "ls": "-0.035em"
      },
      "h3": {
        "size": "20px",
        "weight": 600,
        "lh": "1.3",
        "ls": "-0.02em"
      },
      "lede": {
        "size": "19px",
        "weight": 400,
        "lh": "1.6",
        "ls": "0"
      },
      "body": {
        "size": "16px",
        "weight": 400,
        "lh": "1.6",
        "ls": "0"
      },
      "small": {
        "size": "13px",
        "weight": 400,
        "lh": "1.55",
        "ls": "0"
      },
      "eyebrow": {
        "size": "11px",
        "weight": 500,
        "lh": "1.2",
        "ls": "0.16em",
        "case": "uppercase",
        "family": "mono"
      },
      "num": {
        "size": "32px",
        "weight": 700,
        "lh": "1.05",
        "ls": "-0.03em",
        "family": "mono",
        "tabular": true
      },
      "label": {
        "size": "10px",
        "weight": 500,
        "lh": "1.2",
        "ls": "0.14em",
        "case": "uppercase",
        "family": "mono"
      }
    },
    "min_body_px": 13
  },
  "space": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "40px",
    "2xl": "64px",
    "band": "clamp(4rem, 10vw, 9rem)",
    "grid": 4
  },
  "radius": {
    "hairline": "2px",
    "tight": "4px",
    "control": "6px",
    "panel": "8px",
    "card": "10px",
    "window": "14px",
    "hero": "16px",
    "pill": "999px"
  },
  "shadow": {
    "term": "0 40px 80px -40px rgba(26,22,19,0.4), 0 12px 32px -16px rgba(26,22,19,0.2)",
    "lift": "0 40px 100px -40px rgba(0,0,0,0.6)"
  },
  "motion": {
    "interact": {
      "ms": 140,
      "curve": "ease"
    },
    "surface": {
      "ms": 160,
      "curve": "ease"
    },
    "reveal": {
      "ms": 500,
      "curve": "ease",
      "from": "opacity 0, translateY(16px)"
    },
    "pulse": {
      "ms": 2200,
      "curve": "ease-in-out"
    },
    "sopro": {
      "ms": 4200,
      "curve": "cubic-bezier(.45,0,.55,1)",
      "delta": "scale 1 → 1.0125"
    },
    "piscar": {
      "ms": 7000,
      "fecha": 126,
      "abre": 112
    },
    "saudar": {
      "ms": 300,
      "curve": "cubic-bezier(.2,.8,.2,1)"
    },
    "entrada": {
      "ms": 900,
      "curve": "cubic-bezier(.16,1,.3,1)",
      "fases": 6
    },
    "regra": "Só transform e opacity. prefers-reduced-motion obrigatório em todo o ficheiro com animação.",
    "mola": {
      "curve": "cubic-bezier(.3,1.3,.5,1)",
      "uso": "só gestos físicos: sacudidela, encaixe",
      "origem": "auditoria visual 2026-08-27"
    },
    "familia": [
      "entrada .16,1,.3,1",
      "reacção .2,.8,.2,1",
      "respiração .45,0,.55,1",
      "mola .3,1.3,.5,1"
    ]
  },
  "numero": {
    "variantes": [
      "medido",
      "n/d",
      "externo",
      "regua"
    ],
    "obrigatorio": [
      "fonte",
      "janela"
    ],
    "regras": [
      "Verde só para sinal positivo genuíno — nunca num zero, nunca numa estimativa.",
      "Estimativa vem rotulada; dados parciais mostram cobertura.",
      "Sem dados = frase + CTA, nunca 0/0.",
      "Nunca dois números contraditórios lado a lado.",
      "Todo estado degradado carrega CTA.",
      "Régua de preço de tabela NUNCA é apresentada como poupança."
    ],
    "claims_banidos": [
      "47%",
      "90% ",
      "~30%",
      "saved $",
      "savings"
    ],
    "claims_banidos_nota": "A lista é o registo do que foi retirado e não se encolhe. Como se procura está em moo-design-check.mjs §3: comentários e ficheiros de teste ficam de fora (são o registo da retirada e a sua defesa, não a violação), e um claim que é palavra — 'savings' — só conta com uma cifra ou percentagem na mesma linha. Sem isso marcava 'savings_usd', uma coluna D1 viva.",
    "claims_excepcoes_nota": "Um portão sem lista de excepções obriga a mentir ou a ignorar (DIRETRIZES, adenda da auditoria visual). Estas são as duas superfícies cujo TRABALHO é narrar a retirada dos números: apagá-las seria apagar o registo de que a decisão de 2026-08-24 aconteceu. Cada excepção diz o ficheiro, um pedaço literal da linha, e porquê. Se alguém editar a linha, a excepção deixa de coincidir e o claim volta — que é o modo de falhar correcto.",
    "claims_excepcoes": [
      {
        "ficheiro": "landing/app/(marketing)/methodology/page.tsx",
        "contem": "dois numeros para a mesma coisa",
        "porque": "A página de metodologia existe para explicar porque os números foram retirados. Citar o 47% ao explicar que ele saiu é o oposto de o publicar."
      },
      {
        "ficheiro": "landing/app/(marketing)/rankings/RankingsExplorer.tsx",
        "contem": "seed.savings.by_category[category].saved_usd",
        "porque": "É o único sítio do projecto onde uma cifra de poupança é HONESTA por construção, e apagá-la seria uma regressão. Está atrás de `seed.savings.measured &&` — só aparece se o seed disser que foi medido — e o ramo alternativo publica, em vez do número, a frase 'Savings are measured on YOUR machine, never fabricated for this page' com o comando que a preenche do journal do próprio utilizador. É o produto a mostrar o número de quem o corre, não o site a afirmar um número sobre terceiros."
      },
      {
        "ficheiro": "README.md",
        "contem": "This README used to carry five different savings figures",
        "porque": "É a secção 'Honest numbers': o registo dos cinco números que a auditoria de 2026-08-23 não conseguiu sustentar. Sem esta frase, a tabela diz 'not measured' sem que ninguém saiba o que mudou."
      },
      {
        "ficheiro": "landing/public/brand-guide.html",
        "contem": "savings\" banner",
        "porque": "Esta linha esta dentro da lista \"✗ Hero NAO contem\": e a PROIBICAO do banner, nao o banner. Citar o claim para o vedar e o oposto de o publicar — a mesma razao ja escrita para a pagina de metodologia. As outras duas ocorrencias deste ficheiro NAO foram excepcionadas e sim corrigidas: o especime de tipografia publicava um \"$6.29 saved\" inventado (passou a mostrar os numerais), e a spec da seccao 03 PRESCREVIA uma headline com cifra para a landing, o que e o contrario de citar uma retirada."
      }
    ],
    "claims_padroes": [
      [
        "poupanca-computada",
        "%\\s{0,120}(?:smaller|cheaper|less|lower|menos|off|below)\\b"
      ],
      [
        "cifra-poupada",
        "(?:sav(?:ed|ings)|poupan\\w*)[^\\n]{0,40}?\\$\\s?[\\d{]|\\$\\s?[\\d{][^\\n]{0,40}?\\b(?:sav(?:ed|ings)|poupan\\w*)"
      ]
    ],
    "claims_padroes_nota": "Os padroes correm sobre o ficheiro inteiro, nao linha a linha: em JSX um claim nasce partido. Medido a 2026-08-27: TwoTerminalDemo.tsx:342-343 publica {pctSaved}% numa linha e \"cheaper on this trace\" na seguinte, e :172 diz \"{pctSaved}% smaller\" com a percentagem COMPUTADA. Nenhum dos dois tinha substring proibida, e \"smaller\" nem estava no vocabulario. Foram vistos ao olhar para a home renderizada, nao para o relatorio do portao."
  }
} as const;

export type MooTheme = 'tinta' | 'papel';
export type TierKey = 't0' | 't1' | 't2' | 't3';
export const TIER_WEB = MOO.color.tier.web;
export const TIER_TERMINAL = MOO.color.tier.terminal;
export const TIER_PAPEL = MOO.color.tier.papel;
