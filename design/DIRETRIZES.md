# DIRETRIZES — design engineering do Mooter
### v1.0 · 2026-08-27 · escritas depois de olhar para as onze folhas que já existiam

> Estas regras não são gosto. Saíram de uma auditoria visual do próprio trabalho: rendi as onze
> pranchas do design system, olhei para elas lado a lado, e a crítica foi dura — **têm todas o mesmo
> esqueleto**. Isto existe para que a próxima não tenha.

## As seis banidas — os tiques que denunciam uma página feita por IA

| # | banido | porquê |
|---|---|---|
| 1 | Cartão arredondado com barra de acento à esquerda | Apareceu **8 vezes em 11 folhas**. É o tique mais reconhecível. A anotação vai para a **margem**, como num desenho técnico. |
| 2 | Numeração `01 / 02 / 03` sem sequência real | Numerar decora. Só numera o que tem ordem obrigatória. |
| 3 | O mesmo esqueleto em todas as folhas | `eyebrow → título → lede → grelha de cartões`, onze vezes. É *o* tell. |
| 4 | Gradiente como decoração | Gradiente é **material** — luz numa superfície. Fundo com gradiente é enchimento. |
| 5 | Emoji como marcador de secção | Excepção única: 🐮, que o `SPEC.md` §4 declara assinatura da marca. |
| 6 | Parágrafo de introdução antes de um bloco que se explica | Se o terminal faz o argumento, o parágrafo antes dele é ruído. (`brand-guide` §06) |

## As seis obrigatórias — o que um design engineer faz e um gerador não

| # | obrigatório | como se verifica |
|---|---|---|
| 7 | **Grelha de 12 colunas + coluna de margem** | a margem é onde vive a anotação; nunca num cartão colorido |
| 8 | **Linha de base de 8px** | tudo assenta nela — alinhamento deixa de ser gosto e passa a ser facto |
| 9 | **Uma só família de easing** | entrada `.16,1,.3,1` · reacção `.2,.8,.2,1` · respiração `.45,0,.55,1` · **mola `.3,1.3,.5,1`**. Mais nenhuma. |
| 10 | **Uma extremidade por folha** | um número gigante, uma faixa a sangrar, ou um especímen que ocupa a página — **uma**, não três |
| 11 | **Densidade que varia entre folhas** | a folha de tokens é densa; a da marca é quase vazia. Ritmo igual em tudo lê como template. |
| 12 | **Só `transform` e `opacity`, sempre com `prefers-reduced-motion`** | o movimento é um sistema, não um efeito — e desliga-se inteiro |

## As cinco direcções de landing

Cada uma é uma **linguagem diferente**, não a mesma pintada de outra cor. Cada uma carrega uma
técnica real e declara o que custa.

| # | direcção | a técnica | o custo |
|---|---|---|---|
| 01 | **O Sinal** | estado + FLIP, zero rede. A página corre o classificador. | precisa de um gesto para brilhar |
| 02 | **A Manada** | campo de partículas em CSS, **123 nós** = a janela medida | a metáfora precisa de legenda |
| 03 | **O Recibo** | máscara cónica + grelha de linha de base. Papel creme. | afasta quem não é técnico |
| 04 | **Papel Milimétrico** | grelha 8px + linhas de chamada em SVG, corte em elevação | vive ou morre no alinhamento |
| 05 | **Dois Terminais** | scroll-driven nativo (`animation-timeline`) | toda a página aposta numa secção |

**Nota de honestidade em todas as cinco:** o `101/123` é medido, com fonte e janela coladas. A
divisão entre `T0/T1` e `T2/T3` dentro de cada metade é **forma ilustrativa** e está declarada como
tal na própria página.

## Como esta folha entra no portão

As regras 8, 9 e 12 são verificáveis por código e são candidatas naturais a uma oitava verificação
do `moo-design-check` — grelha de base respeitada, easing fora da família declarada, e animação sem
guarda. **Uma regra que não pode virar grep é uma opinião.** As outras nove ficam como doutrina
escrita, e a revisão humana é que as aplica.

---

## Adenda da auditoria visual — 2026-08-27

Construí o auditor (`tools/moo-visual-audit.mjs`) e corri-o sobre as 17 pranchas. Correu contra
mim, e mudou uma regra.

**A regra 9 estava errada: eram três curvas, são quatro.** A sacudidela da orelha precisa de
*overshoot* — `cubic-bezier(.3,1.3,.5,1)`. Não é uma excepção; é um membro da família, e chama-se
**mola**. Só se usa em gestos físicos. Duas outras curvas soltas (`.22,.72,.3,1` e `.65,0,.35,1`)
foram substituídas por membros — porque essas **eram** desleixo.

### O que o auditor mede

| medida | o que apanha |
|---|---|
| `corte` | conteúdo maior que o frame — invisível no código |
| `overflowX` | barra horizontal, o defeito que mata a leitura em ecrã pequeno |
| `contraste` | rácio real do texto renderizado contra o fundo efectivo (sobe a árvore até achar opaco) |
| `base8` | % de blocos que assentam na linha de base |
| `caixas` | cartões arredondados com fundo — a regra 1 |
| `barras` | barra de acento à esquerda — a regra 1 |
| `easing` | qualquer curva fora da família — a regra 9 |
| `raio` | qualquer raio fora da escala |

### Excepções declaradas

Um portão sem lista de excepções obriga a mentir ou a ignorar. Este declara-as: os cinco pares de
contraste da paleta de papel estão na lista, com a correcção já calculada, e aparecem separados dos
achados novos. **`contraste novo 0 · declarado 5`** é honesto; `contraste 0` seria mentira.

### Antes e depois, medido

| | antes | depois |
|---|---|---|
| pranchas com corte | **3** | 0 |
| avisos de contraste | **193** | 0 novos (5 declarados) |
| caixas arredondadas | **52** | 20 |
| barras de acento à esquerda | **10** | 0 |
| curvas fora da família | 2 | 0 |
| raios fora da escala | 1 | 0 |
| linha de base 8px | ~33 % | **38,7 %** (medido, não alvo) |

A linha de base não chega a 100 % e **não deve** — a altura de linha do texto não é múltipla de 8.
38,7 % é o número real dos blocos estruturais. Publicá-lo é melhor do que fingir um alvo.
