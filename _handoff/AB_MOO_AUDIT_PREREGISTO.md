# Pré-registo — A/B do Moo Audit (2026-08-26)

**Este ficheiro fixa os sujeitos, os braços, as métricas e os limiares ANTES de a
corrida existir. Qualquer alteração a este ficheiro depois de o primeiro achado
ser gerado invalida a corrida** — e a invalidação é declarada no relatório final,
não apagada.

- **Commit de ancoragem:** `97ad846b40d7e1939e02d7b826e4388fe65d60e6` (`origin/main`, 2026-08-26)
- **Escrito por:** Claude Code (Opus 5), worktree `frugal-ab-audit`, branch `ab-audit/preregisto`
- **Fonte:** `_handoff/MP_AB_MOO_AUDIT_2026-08-26.md`
- **Semente determinista de amostragem:** a literal `AB_MOO_AUDIT_2026-08-26`
  (toda a amostragem é reprodutível a partir dela; nenhuma amostra é sorteada à mão)

---

## Emenda 1 — 2026-08-26, depois do adversário, antes do primeiro achado

O adversário deste pré-registo (`codex-cli 0.144.1`, motor OpenAI, ≠ autor,
instruído a refutar) devolveu **`BLOQUEIA`** com 4 HIGH e 1 MED, publicado em
comentário do PR. Quatro objeções procedem e estão corrigidas abaixo.

**Por que emendar agora não é batota:** o guardrail diz que os limiares não se
mexem *depois de ver os números*. **Não há números.** Zero braços corridos, zero
achados gerados, zero ficheiros de resultados nesta data. Este é o único momento
em que uma emenda é legítima — depois da crítica, antes do primeiro achado — e
fica como emenda datada em vez de reescrita silenciosa do original.

| objeção | o que muda |
|---|---|
| **não se dizia quais rótulos alimentam a precisão** — o autor podia escolher primário, secundário ou consenso depois de ver os números | §6.2 novo: **a precisão é sempre a do rotulador primário**; o secundário só serve para o teste de concordância; discordantes **nunca** são excluídos |
| **métrica 3 tinha um erro de álgebra**: `(precisão × volume) ÷ (volume × s ÷ 3600)` simplifica para `precisão × 3600 ÷ s` — o `volume` **cancela-se**, logo a métrica não combinava precisão com volume | §4 reescrito: a métrica 3 é uma **taxa** e assume-se como tal; o volume passa a entrar por uma métrica 3b separada (**horas de atenção para esgotar a fila**) |
| **o tempo do humano não estava instrumentado** — prometia-se cronometrar a passagem do agente, e o rotulador primário é o dono | §4/§6: a ferramenta de rotulação **carimba a hora de cada rótulo**; `segundos_por_achado` do dono é medido pelo ficheiro, não prometido |
| **C não tinha calibração equivalente** e por isso era avaliado num universo maior do que A e B | §3.3 novo: C sofre um **saque cego do mesmo tamanho** antes da amostra de avaliação |
| **§7 não era falsificável** — «avaliado por sujeito e depois agregado» não definia a agregação, e colidia com a métrica 3 dizer «é esta que decide» | §7 reescrito: **unanimidade nos três sujeitos**; §7 é o critério de passa/falha e a métrica 3 é reportada mas **não decide** |
| §9 dava por medido o percurso integrado Node→WSL | §9 corrigido: mediu-se o `semgrep` em WSL, **não** o percurso integrado — esse é `n/d` até a F1 o medir |

A assimetria de universo entre A/B (só veem o que o Semgrep encontrou) e C
(procura livremente) **não é corrigível sem destruir a pergunta**, e por isso
passa a estar declarada em §2.4 em vez de escondida.

## Emenda 2 — 2026-08-26, segunda passagem do mesmo adversário, ainda com zero achados

O adversário releu a Emenda 1 e devolveu **`BLOQUEIA`** outra vez: 1 objeção
`FECHADO`, 4 `MAQUILHADO`, e 3 objeções **novas** que a própria emenda tinha
aberto. Sete procedem. Continua a não existir um único achado gerado.

| objeção da 2.ª passagem | o que muda |
|---|---|
| §6.2 dizia «discordantes nunca são excluídos» mas §4 exclui `nao-sei` do denominador — **contradição interna** | §6.3: separa-se *discordância* de *abstenção*. Discordância entre dois rótulos **decididos** fica no denominador com o rótulo do primário; `nao-sei` do primário é abstenção e sai, diga o secundário o que disser |
| **carimbo de submissão não mede atenção** — não distingue trabalho de pausa | §4.3: a ferramenta carimba **abertura e submissão** de cada achado; intervalos > 120 s são tratados como pausa e caem fora da mediana. A regra fica fixada aqui, não escolhida depois |
| §3.3 não dizia o que fazer **quando C produz ≤ k achados** | §3.3: se `total_C ≤ k`, o saque cego **não se faz**, e o desvio é publicado com os dois números |
| **§7 indefinido quando `precisão_A = 0`, denominador zero, ou amostra vazia** — o rácio «≥ 2×» rebenta | §7.3: piso absoluto e regra de inconclusivo, ambos fixados agora |
| **3b chamava «achados reais entregues» a `precisão × volume`** — isso é extrapolação, não medição, e colidia com a regra 10 | §4.3b: passa a chamar-se **estimativa extrapolada**, com intervalo de confiança e rótulo `estimado` |
| **«classes que nenhuma regra do Semgrep produz» não tinha critério** — permitia classificar retrospetivamente | §2.4: critério **mecânico** — um achado de C está fora do alcance de A/B se **nenhum candidato do Semgrep existir a ±3 linhas no mesmo ficheiro**. Sem adjudicador, sem juízo |
| **não havia tecto para `nao-sei`** — o primário podia abster-se seletivamente e ainda produzir uma precisão formalmente válida | §6.4: `nao-sei` > **25%** da amostra de um braço num sujeito ⇒ esse par braço×sujeito é **inconclusivo** ⇒ FALHA por unanimidade |

### Regra de paragem deste ciclo — declarada agora, para não correr para sempre

Um adversário que bloqueia sempre é tão inútil como um que aprova sempre. A
partir da terceira passagem, cada objeção cai num de dois sítios, e não há
terceiro:

1. **muda um número ou um procedimento** ⇒ é emendada e o adversário volta a
   correr;
2. **não muda nem número nem procedimento** (é uma limitação inerente ao desenho)
   ⇒ é registada em §12 como **limitação assumida**, com o texto do adversário, e
   a corrida avança com ela à vista.

Uma limitação publicada não é uma objeção ignorada. Objeção apagada seria.

---

## 1. Sujeitos — 3 repositórios, fixados por sha

| # | repositório | sha fixado | licença | linhas JS/TS medidas |
|---|---|---|---|---|
| S1 | `pauloloureiroshp-ship-it/mooter` (este repo) | `97ad846b40d7e1939e02d7b826e4388fe65d60e6` | MIT | **102 188** |
| S2 | `fastify/fastify` | `1beaf7e72d24b2fc63a02a7f5806772a00e45454` | MIT | **77 475** |
| S3 | `honojs/hono` | `06880c4a2b04de9dd74217f26dd831209b9c01f1` | MIT | **84 377** |

Medição das linhas: `find` por `*.js|mjs|cjs|ts|tsx|jsx`, excluindo `node_modules/`
e `.git/`, contado com `wc -l`. Corrido a 2026-08-26 nesta máquina.

Os três cumprem o critério do MP: JS/TS, licença permissiva, testes próprios,
entre 20k e 200k linhas. **S2 e S3 não são nossos** — existem para matar a
objeção "só funciona no repo dele". Ficam clonados fora do repositório, em
`C:/Users/Paulo Loureiro/ab-audit-subjects/`, com `--depth 1`; o sha acima é o
que a corrida usa e é o único que conta.

Nenhum dos três é alterado pela corrida. Os produtores são de leitura.

---

## 2. Braços — 3

| braço | o que corre | âmbito | o código sai da máquina? | custo esperado |
|---|---|---|---|---|
| **A · baseline** | Semgrep CE com o conjunto vendorizado de §2.1, saída crua, sem filtro | §2.2 | **não** | $0 |
| **B · Mooter** | os **mesmos** candidatos de A, filtrados pelo **portão 0** (`tools/cockpit/runner/portao.mjs`) | idêntico a A | **não** | $0 |
| **C · pago** | agente de subscrição (`codex exec`, motor OpenAI) com o mesmo âmbito | idêntico a A | **sim** | tokens medidos; dólares imputados (§4.4) |

B é um **filtro sobre A**, não um detector independente. É isso que torna a
comparação honesta: se B ganhar, ganhou por deixar cair ruído, não por procurar
noutro sítio.

### 2.1 Regras do Semgrep — vendorizadas e congeladas

O conjunto de regras é descarregado **uma vez**, antes da corrida, e guardado em
`_handoff/ab-audit/regras-semgrep/` com o sha256 de cada ficheiro registado. A
corrida usa a cópia local e corre **offline** (`--metrics=off`, sem `--config`
remoto). Motivo: um conjunto de regras que mude no registo remoto entre a corrida
de S1 e a de S3 torna os três sujeitos incomparáveis, e ninguém daria por isso.

Conjuntos fixados: `p/javascript`, `p/typescript`, `p/security-audit`, `p/nodejs`.
A lista não cresce nem encolhe depois desta linha.

### 2.2 Âmbito — igual para os três braços

Para cada sujeito, o âmbito é o conjunto de ficheiros `*.js|mjs|cjs|ts|tsx|jsx`
**excluindo**: `node_modules/`, `.git/`, ficheiros de teste (`*.test.*`,
`*.spec.*`, `test/`, `tests/`, `__tests__/`), `dist/`, `build/`, `coverage/`, e
ficheiros gerados (`*.min.js`, `*.d.ts`).

O âmbito é calculado por um único script e **os três braços recebem a mesma
lista**, gravada em `_handoff/ab-audit/ambito-<sujeito>.txt`. Braço que veja outra
lista é um braço inválido.

### 2.3 Prompt do braço C — fixado agora, palavra por palavra

> Encontra defeitos reais no código destes ficheiros. Um defeito real é um que faz
> o programa comportar-se mal em execução — não estilo, não preferência, não
> "podia ser melhor". Para cada um: ficheiro, linha, regra/classe, e uma frase a
> dizer o que corre mal. Não proponhas correções. Não leias ficheiros fora da
> lista dada.

Corre com `codex exec --skip-git-repo-check`, uma invocação por sujeito, com a
lista de ficheiros de §2.2 no prompt. **Se o prompt tiver de mudar, a corrida de C
recomeça do zero nos três sujeitos** e isso fica escrito.

### 2.4 Assimetria declarada entre A/B e C — não é corrigível, é declarável

A e B só podem entregar aquilo que o Semgrep encontrou. **C procura livremente**
nos mesmos ficheiros e pode devolver classes de defeito que nenhuma regra do
Semgrep exprime. Os ficheiros são os mesmos; **o universo de oportunidades não é**.

Isto não se corrige sem destruir a pergunta que a experiência faz — que é
precisamente «um censo determinista filtrado chega perto de um agente pago?». Logo:

- a assimetria fica declarada aqui, e **não** é apresentada depois como se A, B e C
  tivessem tido a mesma hipótese de encontrar as mesmas coisas;
- a secção obrigatória **«onde perdemos»** da F3 quantifica-a por um **critério
  mecânico**, fixado aqui e sem adjudicador:

  > Um achado real de C está **fora do alcance de A/B** se, no mesmo ficheiro,
  > **não existir nenhum candidato do Semgrep (do conjunto vendorizado de §2.1) a
  > ±3 linhas** da linha apontada por C.

  A janela de ±3 linhas existe porque um agente e uma regex raramente apontam
  exatamente a mesma linha para o mesmo defeito. O número é arbitrário — mas é
  arbitrário **antes** de haver dados, que é a única coisa que importa. Sem esta
  regra, «B nunca poderia ter encontrado isto» seria uma classificação feita
  depois de ver quais achados convinham a cada lado;
- em sentido inverso, **B recebe uma calibração que C não recebe** — um orçamento
  de afinação que é uma vantagem de B. §3.3 iguala o *tamanho da amostra*, mas não
  a vantagem de afinação, e isso está aqui escrito para o leitor descontar.

---

## 3. Portão 0 — a calibração, e a armadilha que ela tem

O portão é `podeEntrar()` em `tools/cockpit/runner/portao.mjs`, com os limiares
que **já estão em código e não são tocados**:

    REAIS_MINIMO: 10        PRECISAO_MINIMA: 0.30

Uma **classe** = uma regra do Semgrep (o `check_id`). Classes com menos de 5
candidatos num sujeito são agrupadas numa classe única `cauda`, e a `cauda` passa
pelo mesmo portão que as outras — não há passe livre por ser pequena.

**Amostra de calibração:** `min(40, candidatos)` por classe, sorteada com a
semente do cabeçalho. Uma classe que não chegue a 40 candidatos é calibrada com o
que tem, e o `n` real aparece no relatório ao lado do veredicto.

### 3.1 Calibração e avaliação são disjuntas — declarado agora

Se B fosse calibrado nos mesmos achados em que é avaliado, B estaria a ser testado
no seu próprio conjunto de treino e a precisão de B seria mentira. Logo:

> **Os 40 achados de avaliação de cada braço são sorteados do conjunto que RESTA
> depois de retirada a amostra de calibração.** Se para um sujeito não sobrarem 40
> candidatos fora da calibração, o `n` desce, é declarado, e não se compensa indo
> buscar achados já usados.

### 3.2 Nota honesta sobre os dois limiares com n=40

Com uma amostra de 40, `PRECISAO_MINIMA=0.30` exige 12 reais e `REAIS_MINIMO=10`
exige 10: **a precisão é a restrição que morde, o volume mínimo fica redundante**.
Isto não é um defeito do portão — os limiares foram desenhados para amostras de
tamanho variável — mas fica escrito para que ninguém leia "passou os dois
critérios" como se fossem duas provas independentes. Nesta corrida, são uma e meia.

---

### 3.3 C também perde achados para um saque cego do mesmo tamanho

A e B perdem `k` achados para a calibração e são avaliados no que resta. Se C
fosse avaliado no seu conjunto inteiro, C estaria a ser avaliado num universo
maior. Logo: **antes de sortear os 40 de avaliação de C, retira-se de C um saque
cego de `k` achados, com a mesma semente**, onde `k` é o número de achados que a
calibração consumiu de A/B nesse sujeito. Esse saque é descartado sem ser lido.

**Se `total_C ≤ k`**, o saque não se faz — retirá-lo deixaria C sem amostra
nenhuma. Nesse caso o desvio é publicado com os dois números (`total_C` e `k`) e
o sujeito é marcado como tendo tratamento desigual entre braços. Não se inventa
um `k` mais pequeno para o caso caber.

Isto iguala o **tamanho** do universo. Não iguala a vantagem de afinação que B
tem e C não — ver §2.4.

## 4. Métricas primárias — declaradas agora, todas com numerador e denominador

1. **precisão** = `reais ÷ rotulados`, onde `rotulados = real + falso`. Os
   `nao-sei` ficam **fora** do denominador e o seu número é publicado à parte.
2. **volume entregue ao humano** = achados que o braço apresenta no âmbito
   completo (não na amostra).
3. **achados reais por hora de atenção humana** = `precisão × 3600 ÷ segundos_por_achado`.

   **É uma taxa, e o `volume` não entra nela.** A primeira versão escrevia
   `precisão × volume ÷ (volume × s ÷ 3600)` e dizia que "combina as duas" — mas o
   `volume` cancela-se e a expressão é idêntica a esta. O adversário apanhou o erro
   de álgebra antes de haver um único número. A métrica está certa como taxa; a
   frase que a descrevia estava errada e foi retirada.

   **§4.3 · como `segundos_por_achado` é medido, e o que conta como atenção.**
   Um carimbo só na submissão não distingue trabalho de café. Logo a ferramenta de
   rotulação carimba **duas** horas por achado: **abertura** e **submissão**, e o
   intervalo é `submissão − abertura`.

   > **Intervalos > 120 s são tratados como pausa e ficam fora da mediana**, e o
   > número de intervalos descartados é publicado.

   Os 120 s são arbitrários; o que não é arbitrário é estarem fixados **antes** de
   existir um único intervalo medido. A mediana (e não a média) é o estimador, por
   ser insensível ao que sobrar de anómalo. Isto vale igual para o rotulador
   primário e para o secundário. Se os carimbos faltarem, a métrica é `n/d` e
   diz-se porquê.

3b. **§4.3b · o custo total, e o que dele é medido e o que é extrapolado.**

   - **horas de atenção para esgotar a fila** = `volume × segundos_por_achado ÷ 3600`
     — `volume` é contado, `segundos_por_achado` é medido; a multiplicação é
     aritmética sobre dois números medidos.
   - **achados reais estimados na fila completa** = `precisão × volume` —
     **isto é uma extrapolação da amostra para o universo, não uma medição**, e sai
     no relatório rotulado `estimado`, com o intervalo de confiança de 95% da
     proporção (Wilson) propagado ao produto. A regra 10 desta secção proíbe
     apresentar um número não medido como medido; proíbe-o também aqui.

   É neste par que o volume entra. Um braço com taxa alta e fila enorme custa mais
   horas do que um braço com a mesma taxa e fila curta, e as duas coisas têm de
   aparecer lado a lado ou o leitor tira a conclusão errada.
4. **custo em dólares** e **tempo de parede** (relógio, por sujeito por braço).
5. **o código saiu da máquina?** — binário por braço, verificado por contagem de
   chamadas de rede durante a corrida (§5), não por declaração.

### 4.4 O que "custo" significa no braço C

C corre numa **subscrição**, logo o custo faturado marginal é $0 e dizer "$0" seria
enganador. Regista-se: **tokens de entrada e de saída medidos** (o `codex`
imprime-os), e **dólares imputados a preço de tabela** vindos de
`tools/router/pricing.js` (o SSOT do repo). A tabela do relatório diz
`imputado, não faturado` nessa coluna. Um número imputado nunca é apresentado como
um número pago.

---

## 5. "Não sai da máquina" é medido, não prometido

Durante a corrida de A e de B, o processo dos produtores corre com contagem de
sockets de saída. Zero chamadas para fora de `127.0.0.1` é o resultado esperado;
qualquer chamada é registada com destino e conta como falha do critério 5 desse
braço. `assertLocalEngine()` não é removido nem contornado em lado nenhum.

C sai da máquina por construção — é o ponto da comparação, não um acidente.

---

## 6. Rotulação cega

- **40 achados por braço por sujeito** (ou menos, com `n` declarado — §3.1),
  misturados num **único ficheiro por sujeito**, ordem baralhada pela semente,
  **sem coluna de braço**. O mapa braço↔achado fica num ficheiro separado que o
  rotulador não abre.
- Rótulos permitidos: `real | falso | nao-sei`. Nada mais.
- **Rotulador primário: o dono (Paulo).**
- **Rotulador secundário: um adversário em motor diferente**, sobre a **mesma**
  amostra, sem ver os rótulos do primário.
- **Concordância entre rotuladores** (acordo simples e Cohen's κ) é calculada e
  publicada. **Se o acordo simples for < 70%, a amostra não serve e diz-se isso** —
  não se escolhe o rotulador que dá o resultado melhor.
- A ferramenta de rotulação **carimba a hora de cada rótulo**. Os carimbos são o
  que produz `segundos_por_achado` (§4) — para os dois rotuladores.

### 6.2 Quais rótulos produzem a precisão — fixado agora

Sem esta secção, o autor podia, depois de ver os números, escolher entre os
rótulos do primário, os do secundário, o consenso dos dois, ou "os concordantes" —
quatro precisões diferentes e uma delas favorável. Logo:

> **A precisão publicada é sempre a do rotulador primário (o dono). Sempre. Sem
> exceção.**

- Os rótulos do **secundário servem para uma coisa só**: o teste de concordância.
  Não entram no numerador nem no denominador da precisão.
- Se o acordo simples ficar < 70%, a amostra é declarada inválida (§6) —
  **a precisão do primário não é resgatada trocando de rotulador.**

### 6.3 Discordância ≠ abstenção — a distinção que faltava

A Emenda 1 dizia «discordantes nunca são excluídos» e ao mesmo tempo excluía os
`nao-sei` do denominador. São duas coisas diferentes e o texto tratava-as como uma:

| caso | rótulo do primário | rótulo do secundário | entra no denominador? |
|---|---|---|---|
| **discordância** | `real` ou `falso` | o outro | **sim** — com o rótulo do primário |
| **abstenção do primário** | `nao-sei` | qualquer um | **não** — e conta para o tecto de §6.4 |
| **abstenção do secundário** | `real` ou `falso` | `nao-sei` | **sim** — o secundário não decide a precisão |

Excluir discordâncias seria remover exatamente os casos difíceis, e a precisão
subiria sozinha sem ninguém ter mentido uma única vez. Excluir abstenções é outra
coisa: um `nao-sei` não é um rótulo, é a ausência de um — e por isso tem tecto.

### 6.4 Tecto de abstenção — 25%

Sem tecto, o rotulador primário podia abster-se seletivamente nos casos duvidosos
e produzir uma precisão formalmente válida sobre o resto. Logo:

> **Se os `nao-sei` do primário passarem de 25% da amostra de um braço num
> sujeito, esse par braço×sujeito é declarado INCONCLUSIVO** — e, por §7.1
> (unanimidade), um sujeito inconclusivo faz B **falhar**.

A taxa de abstenção é publicada sempre, mesmo abaixo do tecto.

### 6.1 Dependência humana declarada — não é contornável por mim

A rotulação primária é do dono. Eu preparo a amostra cega, cronometro a minha
própria passagem e trago o rotulador secundário; **não posso rotular no lugar dele
nem apresentar os meus rótulos como sendo os dele**. Se a rotulação primária não
acontecer, F2 fica com métricas `n/d` e o relatório di-lo na primeira linha, em vez
de publicar uma precisão que ninguém validou.

---

## 7. Hipótese e limiar de sucesso — declarados agora

> **B tem precisão ≥ 2× a de A, com volume ≤ 1/5 do de A, a custo $0.**

### 7.1 A regra de agregação — unanimidade, fixada agora

A primeira versão dizia "avaliado por sujeito e depois agregado" sem dizer **como**.
Isso deixava o autor escolher a regra de agregação depois de ver os números — média,
mediana, maioria, ponderação por linhas — e os mesmos dados dariam PASSA ou FALHA
conforme a escolha. Logo:

> **B passa se e só se bater as três condições em CADA um dos três sujeitos,
> independentemente. S1, S2 e S3. Unanimidade.**
>
> Dois em três é **FALHA**. Não há média, não há ponderação por linhas de código,
> não há "ganhou no agregado".

Um B que ganhe em S1 (o nosso repo) e perca em S2 e S3 não passa — seria exatamente
a objeção que os sujeitos de fora existem para matar.

### 7.2 Quem decide: §7, não a métrica 3

A métrica 3 estava marcada como "é esta que decide" e §7 dizia outra coisa. Duas
regras de decisão são zero regras de decisão. Logo:

> **§7 é o único critério de passa/falha.** A métrica 3 (e a 3b) são **reportadas**
> porque são o que interessa a quem vai usar isto, mas **não decidem** o resultado
> pré-registado. Se B falhar §7 e ganhar na métrica 3, o veredicto é FALHA, e a
> métrica 3 aparece no relatório ao lado dele, sem ser promovida a critério.

### 7.3 Os casos degenerados — resolvidos agora, não quando aparecerem

Um critério em forma de rácio (`precisão_B ≥ 2 × precisão_A`) não está definido
quando o denominador é zero, e é exatamente aí que se decide a favor de quem
escreve. As três situações e a regra de cada uma, fixadas antes de haver dados:

| situação | regra |
|---|---|
| `precisão_A = 0` (A não teve um único achado real na amostra) | o rácio não se aplica. **B satisfaz a condição de precisão nesse sujeito se e só se `precisão_B ≥ 0.10`** — piso absoluto, declarado agora. Sem piso, «2 × 0» seria satisfeito por qualquer B, incluindo um B que também não acerta em nada |
| **denominador zero** num braço (todos `nao-sei`, ou amostra vazia) | esse par braço×sujeito é **INCONCLUSIVO** |
| **amostra vazia depois da calibração** (§3.1 esgotou os candidatos) | o `n` é declarado; se `n = 0`, **INCONCLUSIVO** |
| `volume_A = 0` (A não produziu nada nesse sujeito) | a condição de volume (`≤ 1/5`) não se aplica e o sujeito é **INCONCLUSIVO** — não há baseline para comparar |

> **Um sujeito INCONCLUSIVO faz B FALHAR**, porque §7.1 exige unanimidade nos três.
> Fail-closed: a ausência de prova nunca conta como prova.

**Se B não bater isto:** o portão não acrescenta valor sobre Semgrep cru, e a tese
da cunha cai. Isso é escrito no relatório com a mesma clareza com que se escreveria
o contrário. Não há limiar de recurso, não há "quase", não há sub-análise inventada
depois para salvar o resultado.

---

## 8. Percurso do utilizador — alvo declarado antes de correr

Um agente em motor diferente faz de utilizador crítico que nunca viu isto:
instalar → apontar a S2 ou S3 → obter o relatório.

Medido: **minutos até ao primeiro relatório útil**, **nº de bloqueios**, **cada
sítio onde teve de adivinhar**.

**Alvo: ≤ 30 minutos, 0 bloqueios que exijam o dono.** Falhar é resultado e vai
para o relatório.

---

## 9. Ambiente — factos medidos hoje, 2026-08-26

| facto | medição |
|---|---|
| Semgrep em Windows nativo | **não funciona.** `pip install semgrep` instala (1.174.0) e `semgrep --version` responde, mas **qualquer** scan morre com `semgrep-core exited with 1 / RPC subprocess failed` — testado com regra local em ficheiro e com `-e` inline. |
| Docker | CLI 29.2.1 presente, **daemon em baixo** (`npipe:////./pipe/dockerDesktopLinuxEngine` não existe). Não foi levantado. |
| **Semgrep em WSL2 (Ubuntu-22.04)** | **funciona.** 1.174.0 via `pip --user`. Scan de fumo em `hono/src/utils`: 0 achados, **0 erros**, 2,9 s de parede. **É este o caminho da corrida no desktop Windows.** |
| gitleaks | 8.30.1 nativo — é o que faz a varredura de segredos de todo o histórico (F0.1). |
| codex CLI | 0.144.1, autenticado, **com créditos** (invocação de fumo devolveu resposta e contou 22 854 tokens). |
| Node | v24.14.0 nativo no Windows; **ausente dentro do WSL** (medido). |
| percurso integrado Node(Windows) → semgrep(WSL) | **`n/d`.** Não foi medido. O que foi medido é o semgrep a correr dentro do WSL, isoladamente. O percurso completo — adaptador em Node no lado Windows a invocar o semgrep no WSL e a receber o JSON de volta — é trabalho da F1 e só será afirmado quando a F1 o medir. |

O braço do censo **fica no desktop Windows via WSL2**, não no Mac — **desde que a
F1 confirme o percurso integrado**, que hoje é `n/d`. O Mac deixa de ser
necessário para isto se essa medição correr bem. Se o WSL falhar a meio, a alternativa registada é o Mac,
e a mudança de máquina é declarada no relatório (máquinas diferentes ⇒ tempos de
parede deixam de ser comparáveis entre si).

---

## 10. O que invalida esta corrida

1. Mexer nos limiares de §3 ou §7 depois do primeiro achado gerado.
2. Trocar os shas dos sujeitos de §1.
3. Mudar o conjunto de regras de §2.1 ou o prompt de §2.3 a meio.
4. Avaliar B em achados que também serviram para o calibrar (§3.1).
5. Rotular com o braço à vista.
6. Publicar o custo imputado de C como custo faturado (§4.4).
7. Trocar o rotulador que produz a precisão, ou excluir os achados em que os dois
   rotuladores discordam (§6.2).
8. Agregar os três sujeitos por qualquer regra que não seja unanimidade (§7.1),
   ou promover a métrica 3 a critério de passa/falha (§7.2).
9. Avaliar C sem o saque cego equivalente à calibração de A/B (§3.3).
10. Apresentar qualquer número que não tenha sido medido. **Número não medido =
    `n/d` com o porquê.**

---

## 11. O que isto não promete

Não promete que B ganha. Se o Semgrep cru já for bom o suficiente neste tipo de
repositório, o portão não tem mercado nesta forma — e é melhor sabê-lo em cinco
dias do que em cinco meses. Não promete que o percurso de 30 minutos se cumpre à
primeira. E não substitui o gate de negócio: o relatório só vale quando uma pessoa
de fora pedir o segundo.

## 12. Limitações assumidas — objeções que ficam abertas de propósito

Esta secção existe por causa da regra de paragem da Emenda 2: uma objeção que não
muda um número nem um procedimento não é apagada, é registada aqui com o texto de
quem a levantou, e a corrida avança com ela à vista.

| limitação | quem a levantou | porque fica |
|---|---|---|
| **A e B só podem entregar o que o Semgrep encontrou; C procura livremente. Os ficheiros são os mesmos, o universo de oportunidades não é.** | adversário `codex-cli`, 1.ª e 2.ª passagens | Corrigi-la implicaria dar a A/B pesquisa livre — ou seja, transformá-los num agente. Isso destrói a pergunta que a experiência faz. Fica declarada (§2.4) e quantificada pelo critério mecânico das ±3 linhas |
| **B recebe um orçamento de calibração que C não recebe.** | adversário `codex-cli`, 2.ª passagem | §3.3 iguala o tamanho da amostra, não a afinação. É uma vantagem **de B**, e está escrita para o leitor descontar em vez de a descobrir sozinho |
| **A rotulação primária depende de uma pessoa e não pode ser substituída por um agente.** | o próprio autor (§6.1) | É a condição de o resultado valer alguma coisa. Sem ela, F2 fica com métricas `n/d` — que é o resultado honesto, não um contorno |

---
