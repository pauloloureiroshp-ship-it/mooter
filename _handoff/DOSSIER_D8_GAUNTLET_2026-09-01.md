# Dossier da D8 — as candidatas C1–C4 do gauntlet, verificadas contra o registo

**Data:** 2026-09-01 (03:00 São Paulo) · **Para:** decisão do dono · **Autor:** Claude Code
**Estado:** aberto — nada foi decidido, nada entrou, o tecto continua 18 (`grep -c "| G19 |"` → 0)

> **A D8, verbatim** (`docs/foundation/MEO_GAUNTLET.md:288`):
> «C3 e C4 entram? Se sim, quais das 18 saem, OU gesto explícito de elevar o tecto.
> Sem dados do juiz O-1 não há recomendação de poda — tecto ou fila é decisão do dono.»

---

## O que este dossier NÃO faz

Não recomenda. Não por cerimónia — por três impedimentos, dois deles do próprio documento e um
medido hoje:

1. **«Um agente nunca eleva o tecto sozinho»** (`:315`). Elevar não é opção minha.
2. **«Sem dados do juiz O-1 não há recomendação de poda»** (`:289`). O juiz O-1 é o estágio 3 e
   **não existe**. Sem ele, dizer «sai a Gn» é escolher por gosto e chamar-lhe método.
3. **Não há dado de mérito, só de ausência** — medido abaixo. Podar com base no que existe seria
   cortar perguntas por não terem sido declaradas, não por não terem mordido.

O que este dossier faz é **confrontar as retro-provas com o registo**, para a decisão ser tomada
sobre factos verificados em vez de sobre o que o documento afirma de si próprio.

---

## O achado que reordena a pergunta

A regra de entrada tem duas metades (`:308`): **≥3 falhas reais** *e* **apanha ≥1 que as 18 não
apanham**. Verificadas as quatro:

| | Retro-prova (≥3 falhas reais) | Apanha o que as 18 não apanham |
|---|---|---|
| **C1** «o ✓ tem corpo?» | ✅ **3/3 confirmadas** — shas reais, linha defeituosa lida nos dois lados do fix | ❌ cai dentro da **G11** (o próprio `LOOP.md` chama-lhes «três defeitos no INSTRUMENTO») |
| **C2** «congelaste todas as superfícies?» | ⚠️ **3/3 em substância**, com dois erros de facto no texto | ❌ argumenta contra a G11 e **nunca confronta a G6**, a única das 18 com «superfícies» no corpo |
| **C3** «leste a tabela INTEIRA?» | ❌ **0/3 como escritas** (2 em substância, 1 refutada) | ✅ **sim** — nenhuma das 18 varre descontos publicados pelo fornecedor |
| **C4** «o que tentaste REMOVER?» | ❌ **0/3** (1 n/d, 2 refutadas) | ⚠️ sim, mas defende-se contra a G8/G17 e **ignora a G14 e a G16** |

**A D8 pergunta exactamente pelas duas cuja retro-prova não aguenta confronto** — e pela mesma
razão nas duas: a fonte não é auditável. A C3 cita um glob `_handoff/*2026-08-12*` que **resolve para
zero ficheiros versionados**; a C4 cita «a própria conversa», que não existe no repo nem no vault.

Em contraste, C1 e C2 citam SHAs. Verifiquei os seis: **todos existem**, todos de 2026-08-07, e as
mensagens correspondem. A afirmação mais específica da C2 — «corrigido às 05:28, o mesmo defeito vivo
até às 14:5x — 9 horas» — mede-se: `b62146cc` às **05:28:55**, `dbb8142a` às **14:43:54**, delta
**9h14m**. As nove horas confirmam-se ao minuto; o «14:5x» está errado (é 14:43).

---

## O sinal de uso — o dado que faltava, e o que ele não diz

O documento chama ao log de deltas «o dado de calibração» (`:320`). Medi-o:

| | |
|---|---|
| Linhas `gauntlet:` em todo o registo (repo + vault) | **27** |
| Que o portão do estágio 2 vê como declaração | **27** (eram 16 antes de hoje — ver nota) |
| Com classe reconhecível | **14** |
| **Que passam o portão** | **0** |
| Deltas literais («Gn mudou X») | **9**, cobrindo **5** perguntas: G2, G4, G5, G11, G12 |
| Perguntas sem um único delta literal | **13** — G1 G3 G6 G7 G8 G9 G10 G13 G14 G15 G16 G17 G18 |

**As 13 não são 13 perguntas mortas.** Pelo menos a G1, a G9, a G10 e a G18 morderam por sentido,
escrito noutras palavras — é o critério literal («Gn mudou») que as invisibiliza. Tomar estes 13
como lista de poda seria medir a forma da frase, não o efeito da pergunta.

> **Nota de honestidade sobre esta medição.** A primeira versão do portão (escrita hoje, #464)
> usava `^\s*gauntlet\s*:` e via **16** das 27 — era cega a onze declarações escritas dentro de
> crases, porque o formato é apresentado assim no documento e foi copiado com elas. Foi um motor
> diferente do autor que o apanhou (a G4 a funcionar). Corrigido; a medição acima já é a boa. O
> teste que dizia «nenhuma declaração real passa» estava **verde pela razão errada**.

---

## As quatro, uma a uma

### C1 — «o ✓ tem corpo?»
*Um estado de sucesso só conta se o artefacto que ele descreve existir e tiver conteúdo.*

- **Retro-prova: 3/3 confirmadas.** Li a linha defeituosa no ficheiro pré-fix em cada caso:
  `if (r.ok)` contra o irmão `if (texto.trim())`; `criterio_paragem: "TECTO ATINGIDO — incompleto"`
  sem guarda a montante; `done: (wt) => existsSync(join(wt, artefacto))` cego ao scratchpad.
- **Não verificável:** as magnitudes («6 de 9 runs», «5-7 MB»). Os `runs/` estão em `.gitignore:166`.
  O **mecanismo** vi-o em código; a **magnitude** é palavra do autor.
- **Sobreposição:** cai dentro da G11. Duas das três falhas são literalmente a sua segunda cláusula.
- **Custo de correr:** segundos, zero julgamento — é um `statSync().size > 0`.
- **A leitura que muda a decisão:** a C1 é a fatia **mecanizável** da G11. Não precisa de ser
  pergunta: cabe no hook do estágio 2 sem consumir slot.

### C2 — «congelaste todas as superfícies?»
*Um invariante aplicado a uma superfície e não às irmãs não é invariante, é um hábito.*

- **Retro-prova: 3/3 em substância**, 5 SHAs verificados. Mas **dois erros de facto no texto**:
  «14:5x» é 14:43:54; a «quarta aparição» não se reconstrói (o registo prova três sítios, e o
  quarto assenta num episódio que o repo conta com **duas causas incompatíveis**).
- **Sobreposição:** argumenta só contra a G11 — e a G11 vira-lhe o argumento ao contrário. **Nunca
  confronta a G6** («funciona em TODAS as superfícies e devices?»), a única das 18 com a palavra do
  seu próprio título.
- **O que sobrevive é real mas é outro eixo:** nenhuma das 18 obriga a varrer as irmãs **no mesmo
  commit**. Isso é «as 18 apanham tarde», não «as 18 não apanham».
- **Custo:** ~4 min de comando + ~20 min de leitura adversarial.

### C3 — «leste a tabela de preços INTEIRA do fornecedor?»
*Desconto garantido por regra publicada vale mais que a optimização engenhosa em desenho.*

- **Retro-prova: 0/3 como escritas.** Duas confirmam em substância (o Batch API −50% entrou como M4,
  a assimetria output≈5× como M5). A terceira está **refutada** no único pedaço verificável:
  «virou DO-NOT do M2» é falso nas duas versões, e «lido de um agregador» não tem qualquer suporte.
- **A fonte não existe versionada.** O glob citado resolve para zero ficheiros; os artefactos daquela
  madrugada estão `??` untracked no disco do dono.
- **Sobreposição: a única das quatro que apanha algo genuinamente novo** — e é a única com dinheiro
  directo. A G5 é build-vs-adopt; a G12/G18 atacam números que *eu* publico. Um desconto publicado
  que eu não li não cai em nenhuma.
- **Custo:** 3-5 min, um fetch por fornecedor, zero julgamento. **Mas exige rede viva**, e o G4 corre
  em sandbox read-only — degradaria para `n/d` exactamente onde o gauntlet manda correr as 18.

### C4 — «o que tentaste REMOVER antes de entregar?»
*Nenhuma das 18 força SUBTRACÇÃO no entregável.*

- **Retro-prova: 0/3.** O «bloco v3 kitchen-sink» não existe em git nem em disco; a cadeia
  «v1.0 → v1.1 → v3» junta duas famílias distintas, e a única transição descrita em detalhe é uma
  **partição** — que é o gesto de subtracção que a candidata diz não ter havido; «8 artefactos +
  6 appends» são 9 ou 10 e 4 à hora em que foi escrita.
- **Sobreposição:** a distinção é real — a G14 e a G16 cortam à unidade **wave**, nenhuma abre o
  entregável e pergunta que partes **dentro** dele são carga morta. Mas a candidata defende-se
  contra a G8 e a G17 e **nunca menciona a G14 nem a G16**, que são as perguntas de corte.
  *(A favor dela, e não está escrito: a G8 empurra na direcção contrária — um bloco de 8 passos
  numa sessão é menos interacções do dono, logo a G8 daria verde ao v3.)*
- **Custo: julgamento puro, zero comando.** É a única das quatro sem gesto verificável, e a mais
  fácil de carimbar.
- **A ironia que vale registar:** acrescentar uma 19.ª pergunta a um gauntlet que o próprio documento
  diz estar sobrecarregado é, literalmente, a falha que a C4 existe para apanhar.

---

## O que desbloquearia a D8

Por ordem de custo, do mais barato ao mais caro:

1. **Corrigir os erros de facto** antes de qualquer entrada — na C2 («14:5x», «quarta aparição», e a
   segunda causa somada do veredicto vazio, que é G11 e não congelamento) e na C3/C4 (as refutações
   acima). Uma candidata que entra com números que o git desmente entra pelo defeito que o gauntlet
   existe para matar.
2. **Versionar os artefactos de 2026-08-12** antes de os citar como prova. A retro-prova de uma
   pergunta cuja tese é *«lê a fonte inteira»* aponta hoje para ficheiros que desaparecem com o disco.
3. **Descer a C1 a mecanismo** em vez de a fazer competir por slot: `statSync().size > 0` no hook de
   fecho, sem consumir tecto.
4. **Dar à C4 um campo grep-ável** (`removido: X` ou `nada podia sair porque Y`), verificável pelo
   mesmo hook. Sem prova mecânica, entra como a mais fácil de fingir das 19.
5. **Fazer o portão do estágio 2 morder uma entrega real.** Hoje corre no CI, mas só os seus próprios
   testes — nenhum workflow lhe passa o corpo de um PR ou o fecho de uma wave.
6. **Escrever o log de deltas como artefacto**, não como resultado de um grep manual. O documento
   chama-lhe «o dado de calibração» e ele não existe como ficheiro.
7. **Correr o juiz O-1** sobre um N mínimo de declarações válidas. Só aí «internalizada vs carimbada
   às cegas» deixa de ser adjectivo e passa a número — e só aí a poda é decidível por mérito.

---

## Uma incoerência do documento, para decidir de passagem

A D8 pergunta por **C3 e C4**. Mas a fila tem **quatro**: a C1 e a C2 entraram a **2026-08-07**,
cinco dias antes, e a D8 não as menciona. Ou a decisão é sobre as quatro, ou o documento deve dizer
porque as duas mais antigas ficaram de fora.

---

## E a pergunta que fica por baixo de todas

Existem **27** declarações `gauntlet:` no registo e **zero** passam o portão. A mais recente foi
introduzida a **2026-08-23** (`git log -S` sobre cada ficheiro) — **as ondas de design de 27-29/08
não têm nenhuma**, e a de hoje sou eu a escrever sobre o assunto, não a declarar um fecho.

> *(Um número anterior deste dossier dizia «a última é de 17/08». Errado: 17/08 é a data no **nome**
> dos ficheiros do Slack Spike; a declaração foi introduzida a 18/08, e há uma de 23/08 depois dela.
> Medir a data pelo nome do ficheiro é a mesma classe de erro que este documento anda a auditar.)*

Isso torna a D8 uma pergunta sobre o tecto quando talvez seja outra: **passar de 18 para 20 não muda
um sistema em que nenhuma declaração passa a verificação que já existe.** O gargalo pode não ser o
tecto — pode ser a obediência.

Não é uma conclusão. É o número, posto ao lado da pergunta.
