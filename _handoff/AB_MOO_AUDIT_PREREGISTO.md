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

## 4. Métricas primárias — declaradas agora, todas com numerador e denominador

1. **precisão** = `reais ÷ rotulados`, onde `rotulados = real + falso`. Os
   `nao-sei` ficam **fora** do denominador e o seu número é publicado à parte.
2. **volume entregue ao humano** = achados que o braço apresenta no âmbito
   completo (não na amostra).
3. **achados reais por hora de atenção humana** = `precisão × volume ÷ horas de
   atenção`, onde `horas = volume × segundos_por_achado ÷ 3600` ← **é esta que
   decide.**
   `segundos_por_achado` é **medido**, não estimado: cronómetro por achado durante
   a rotulação cega, mediana por braço. Se a rotulação não for cronometrada, esta
   métrica é `n/d` e diz-se porquê.
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

### 6.1 Dependência humana declarada — não é contornável por mim

A rotulação primária é do dono. Eu preparo a amostra cega, cronometro a minha
própria passagem e trago o rotulador secundário; **não posso rotular no lugar dele
nem apresentar os meus rótulos como sendo os dele**. Se a rotulação primária não
acontecer, F2 fica com métricas `n/d` e o relatório di-lo na primeira linha, em vez
de publicar uma precisão que ninguém validou.

---

## 7. Hipótese e limiar de sucesso — declarados agora

> **B tem precisão ≥ 2× a de A, com volume ≤ 1/5 do de A, a custo $0.**

Avaliado **por sujeito** e depois agregado. Um B que ganhe em S1 (o nosso repo) e
perca em S2 e S3 **não passa** — seria exatamente a objeção que os sujeitos de fora
existem para matar.

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
| Node | v24.14.0 nativo; ausente em WSL. Os adaptadores correm em Node no lado Windows e invocam o semgrep dentro do WSL. |

O braço do censo **fica no desktop Windows via WSL2**, não no Mac. O Mac deixa de
ser necessário para isto. Se o WSL falhar a meio, a alternativa registada é o Mac,
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
7. Apresentar qualquer número que não tenha sido medido. **Número não medido =
   `n/d` com o porquê.**

---

## 11. O que isto não promete

Não promete que B ganha. Se o Semgrep cru já for bom o suficiente neste tipo de
repositório, o portão não tem mercado nesta forma — e é melhor sabê-lo em cinco
dias do que em cinco meses. Não promete que o percurso de 30 minutos se cumpre à
primeira. E não substitui o gate de negócio: o relatório só vale quando uma pessoa
de fora pedir o segundo.
