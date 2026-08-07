# VERIFICADOR-0 — pré-registo

**Commitado ANTES de correr o verificador uma única vez.** Se este ficheiro for alterado
depois do primeiro run, o spike deixa de ser pré-registado e passa a ser uma história
contada a posteriori — e o `VEREDICTO.md` tem de o dizer.

- Data: 2026-08-07
- Fora do kit do piloto (`_handoff/verificador-0/`). `classify.js` e `_handoff/piloto/` **intocados**.
- Custo alvo: ~$0 (GPU local, Ollama). Sem chamadas pagas.

---

## 1. A pergunta

O gate da cascata CASCATA-APRENDE precisa de um verificador. Um moo local a $0 serve?

## 2. Critério de viabilidade (Paulo + Cowork, verbatim)

> O verificador é apto para o gate da cascata se **accuracy ≥ 90%** nos checks objetivos
> **E consistência ≥ 90%** (mesmo artefacto julgado 3×, mesmo veredicto). Abaixo disso, o
> gate da cascata terá de ser **teste-mecânico-primeiro com LLM só em desempate**.

Decisão guiada pelo número, não por esperança. **Este critério não se altera depois de ver
resultados.**

## 3. O número que torna o critério legível — BASELINE

Calculado do gabarito mecânico **antes** de qualquer julgamento LLM:

| Domínio | Artefactos | Rótulos objectivos | Distribuição | Baseline "responder sempre a classe maioritária" |
|---|---|---|---|---|
| 1 · código-com-teste | 9 | 9 (1 por artefacto) | **S=9 · N=0** | **100%** — corpus todo-positivo |
| 2 · visual-um-ficheiro | 9 | 99 (11 itens × 9; item 8 é n/d humano) | **S=78 · N=21** | **78,8%** |

**Consequências, ditas antes e não depois:**

- **O domínio 1 não consegue medir accuracy.** Todos os 9 artefactos são correctos (TEST_CMD
  verde + juiz neutro 5/5). Um verificador que responda sempre "correcto" faz 100%. Deste
  domínio só se pode extrair **taxa de falso alarme**: com que frequência condena código bom.
  Isso é útil — um verificador que condena bom código estrangula a cascata — mas **não é
  accuracy e não será reportado como tal**.
- **No domínio 2, "≥90%" está a 11,2 pontos do trivial.** Responder sempre "S" já dá 78,8%.
- **5 dos 11 itens são constantes** (1, 6, 9, 11, 12: S nos 9 jogos). Os itens que discriminam
  são 2, 3, 4, 5, 7 e 10 — 54 rótulos, S=33 · N=21, baseline 61,1%. Reporta-se **as duas
  contas**: todos os itens, e só os discriminantes. Um verificador que só acerte nas
  constantes é um verificador que não serve para gate nenhum.

## 4. A minha objecção ao critério (registada, não aplicada)

**Accuracy é a métrica errada para um gate de cascata, e o critério pode passar com o
verificador a falhar exactamente naquilo para que serve.**

O trabalho de um verificador numa cascata é **apanhar o que está mal** — se não apanha, a
cascata promove trabalho defeituoso e a poupança é falsa. Com S=78 · N=21, um verificador que
nunca diga "N" faz **78,8% de accuracy e 0% de recall nas falhas**. Chegar a 90% de accuracy é
compatível com deixar passar a maioria dos defeitos.

**Não altero o critério do Paulo** — é dele, e o veredicto será dado contra ele tal como está.
Mas fica pré-registado que reporto também, com igual destaque:

- **recall nas falhas** = das 21 respostas "N" do gabarito, quantas o verificador apanha;
- **precisão nas falhas** = das que ele diz "N", quantas são mesmo N;
- e se o critério passar **com recall nas falhas fraco**, o `VEREDICTO.md` dirá que o número
  passou e a aptidão não — em vez de festejar o número.

## 5. Método

- **Corpus:** já existente, zero geração nova. Domínio 1 = 9 artefactos da T2/C4. Domínio 2 =
  9 jogos da T1/bateria-1 (3 do `artefacto/`, **6 recuperados dos scratchpads** pelo
  `session_id` do `meta.json` — a v2.1 não os capturava). Montado por `montar-corpus.mjs`.
- **Gabarito:** domínio 1 → TEST_CMD do run + juiz neutro de 5 casos independentes.
  Domínio 2 → os 12 itens do `dod_harness.mjs` (Playwright, determinístico). Item 8 é
  `n/d (humano)` e sai da conta nos 9 jogos.
- **Verificador:** Ollama local. **Dois modelos**, escolha por número, não por gosto:
  `qwen3:30b` (18 GB) e `qwen2.5-coder:14b` (9 GB). Ambos presentes; RTX 4090, 23 GB.
- **Consistência:** cada artefacto julgado **3×** com o mesmo prompt. Consistente = os 3
  veredictos iguais.
- **Parsing:** o veredicto extrai-se mecanicamente da resposta. Resposta que não parseia conta
  como **falha de consistência e erro**, nunca se descarta em silêncio — descartar respostas
  ilegíveis é como o cross_check produziu 18 falsos positivos.
- **Anti-contaminação:** o verificador vê o enunciado e o artefacto. **Nunca** vê o gabarito,
  o braço de origem, nem o `meta.json`.

## 6. O que este spike NÃO decide

Não decide a arquitectura da cascata, não toca no `classify.js`, não altera thresholds, não
implementa nada em produção. Mede uma coisa: se um moo local julga bem o suficiente para ser
gate. O desenho da CASCATA-APRENDE vive na memória do Cowork e não se toca aqui.

## 7. Limites conhecidos deste spike

- **n pequeno:** 9 + 9 artefactos, uma tarefa por domínio. Não é uma régua pública.
- **Domínio 2 vem de uma bateria arquivada como inválida.** Os artefactos são reais e o
  gabarito é mecânico — mas a bateria não serve para comparar braços, e nada aqui o faz.
- **O gabarito do domínio 2 é heurístico em 4 dos itens** (2, 3, 4, 7 dizem-no no próprio
  texto: "heurística"). O verificador é medido contra o harness, não contra a verdade
  absoluta. Se discordarem, isso é uma discordância entre dois instrumentos — e será dito.
