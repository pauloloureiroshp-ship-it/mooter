# B2 — EMENDA 1 (aplicada · 2026-09-26)

> Emenda ao `B2-PREREGISTO.md` (commit `ab0bcf80`, sha256 do ficheiro `f2344e78…3962a`), que
> **não é editado**: onde esta emenda e o pré-registo divergirem, **manda a emenda**.
> Escrita **antes de qualquer dado do B2**. Origem: `B2-adversario-codex-r1.md` (23 ataques,
> 15 bloqueantes, 8 sérios) e `B2-EMENDA-1-PROPOSTA.md` (commit `d050e389`).
> Decisões D1–D4 e aceitação de E1–E15: **do dono**, nesta data, a pedido explícito.
> As alterações ao instrumento que esta emenda exige **não estão feitas**: estão listadas em
> `B2-PRE-REQUISITOS.md`, e o B2 **não arranca** enquanto houver um pré-requisito aberto.

## Decisões do dono

| # | Decisão |
|---|---|
| D1 | A primária é a **taxa de tentativa de delegação ao tier recomendado**. A transferência efectiva do trabalho é reportada em separado, sem gate. |
| D2 | Inferência primária: **diferença de proporções com bootstrap por cluster de sessão**. Fisher sobre turnos passa a ser só descritivo. |
| D3 | Data-limite administrativa: **45 dias após o arranque** (arranque fixado conforme E14). |
| D4 | **Sim**: o dono não escolhe nem reformula pedidos em função do braço, e os incentivos explícitos à delegação ficam registados. |

## Texto emendado (substitui o que conflituar no pré-registo)

**E1 · Unidade e teste** (A1, A3). A inferência primária respeita a sessão como unidade de alocação: a diferença de proporções B − A (em pp) tem um IC 95 % obtido por bootstrap de sessões (reamostragem de sessões inteiras, dentro de cada braço). Fisher sobre turnos é só descritivo. A diferença é absoluta, também quando A = 0 %. O gate primário passa a ser **B − A ≥ 20 pp e limite inferior do IC 95 % > 0**. Se a primária falhar, lê-se "critério de adopção não demonstrado", nunca "ausência de efeito", e imprimem-se a estimativa e o IC.

**E2 · Regra de paragem fechada** (A2). A recolha termina no 1.º fecho diário em que os dois braços têm ≥ 30 sessões com ≥ 1 turno elegível **e** ≥ 100 turnos elegíveis; entram todos os turnos até ao corte. Com os mínimos por atingir 45 dias após o arranque (D3), o resultado é **inconclusivo**. Não há olhadelas intermédias por eficácia.

**E3 · Elegibilidade antes do resultado** (A12, A20). Um turno é elegível quando: tem hint, o tier do host é conhecido e diferente do tier recomendado, o pedido não é HIGH_RISK e o utilizador não fixou modelo. A elegibilidade calcula-se **antes** de olhar para delegações. Um turno inelegível nunca entra no numerador nem no denominador. Os turnos HIGH_RISK ou com override entram numa auditoria de segurança à parte; uma violação impede a adopção e dispara a suspensão (E12).

**E4 · Tier declarado manda** (A13). Um turno só conta como "seguiu" se o tier declarado na chamada, quando existe, for igual ao tier recomendado. Sem tier declarado, vale o mapeamento nominal do agente. Acertar no nome exacto do agente passa a métrica separada e nunca se sobrepõe a um tier incompatível.

**E5 · O que a primária mede** (A14, A18; D1). A primária é a "taxa de tentativa de delegação ao tier recomendado" e não implica execução efectiva, exclusividade nem conclusão. Reporta-se em separado, sem gate: (i) transferência efectiva (o host não repete o trabalho principal), (ii) delegação exacta ao subagente sugerido, (iii) tentativa T0 face a execução local concluída, (iv) duplicação pelo host.

**E6 · Instrumento congelado por hash** (A15, A17, A18). Congela-se por sha256 toda a cadeia de medição: `tools/p0/medir-p0.mjs`, a função de elegibilidade (E3), `AGENTE_TIER` e os `agents/*.md` de que ele depende. Os hashes ficam gravados na emenda de arranque (E14). Fixture de controlo: os dois textos de hint sem `tool_use` têm de dar 0 delegações. Antes do arranque valida-se numa amostra que o 1.º pedido do turno corresponde ao modelo que decide. Correcções posteriores ao instrumento aplicam-se uniformemente a todos os dados e ficam documentadas.

**E7 · Braço gravado na sessão** (A16). O braço é registado quando a sessão é criada e fica ligado a todos os turnos, com ou sem hint. O relatório imprime o fluxo por braço (prompts → com hint → elegíveis → razões de exclusão). H1 aplica-se só à população elegível.

**E8 · Alocação por linhagem** (A8, A9, A10). Todas as sessões iniciadas entram no registo de alocação, mesmo as abandonadas. Retomadas e forks herdam o braço da raiz e pertencem ao mesmo cluster. Os subagentes não são unidades experimentais. A chave é device + `session_id` raiz. É proibido reiniciar, excluir ou trocar de sessão para obter um braço.

**E9 · Quota completa** (A6). A quota por turno soma o host e todos os descendentes atribuíveis ao pedido, incluindo tentativas falhadas, atribuídos pela cadeia `parentUuid`. A guarda passa se a mediana de B for ≤ 1,10 × a mediana de A; é uma comparação descritiva, não um teste de não-inferioridade. Com mediana A = 0, só passa com mediana B = 0. Consumo que não se consiga reconstruir torna a guarda inconclusiva.

**E10 · Qualidade** (A4, A5). Um script congelado sorteia 20 turnos elegíveis por braço, sem reposição, com a **semente `934b83d56c1a223de026b71ba1a7d5d8`**, comprometida neste commit (gerada a `2026-09-26T21:33:43Z` com `crypto.randomBytes(16)`). Os turnos são apresentados em ordem aleatória, sem o texto do hint e sem ids. A nota de cada turno é a média dos 2 juízes, e cada juiz avalia antes de ver os rótulos. A guarda passa se o limite inferior unilateral de 95 % de B − A for > −0,5, com bootstrap por sessão. Precisão insuficiente **não** conta como passagem. κ é descritivo (κ de Cohen ponderado quadrático). Quando o dono reconhecer um turno, isso fica registado.

**E11 · Retrabalho** (A7). A janela de observação é fixa: os 3 turnos humanos seguintes na mesma linhagem. Conta como retrabalho uma regex congelada ("desfaz", "não era isso", "reverte", "volta atrás") ou um `git revert`/`git reset` na mesma janela. Um turno sem janela completa fica "sem acompanhamento", não "sem retrabalho". A guarda passa se B ≤ A + 5 pp.

**E12 · Kill-switch com semântica** (A21). Com `MOOTER_AB_B2=off`, todas as sessões novas recebem o braço A. Cada activação fica datada e justificada no ledger, e os dados anteriores continuam na análise segundo a alocação original. Uma suspensão dá o resultado "interrompido", sem adopção; retomar exige uma emenda nova e uma janela identificada.

**E13 · Contaminação** (A22). Antes do arranque inventariam-se e fazem-se sha256 de: `~/.claude/CLAUDE.md`, `CLAUDE.md` e `AGENTS.md` do repo, memória, hooks e skills. Os hashes ficam gravados por sessão. A base fica congelada durante a janela. **Leitura obrigatória do resultado:** o `~/.claude/CLAUDE.md` do dono já manda delegar em T0/T1, por isso o braço A já é em parte imperativo e o B2 mede o **incremento** do texto do hint sobre essa base.

**E14 · Janela operacional** (A23). O arranque exige os dois marcos (veredicto do 60d e conclusão do F2) e depois uma **emenda de arranque** curta com a data/hora de início, as versões do decisor, do host e da config, os hashes de E6 e E13 e o fecho de todos os `B2-PRE-REQUISITOS.md`. Uma actualização a meio da janela suspende-a (E12). A estratificação por modelo é descritiva; a decisão usa só o agregado.

**E15 · H2 sem causalidade** (A19). H2 passa a ser "turnos com output curto do host (< 2 000 tokens)" e é só descritiva, sem afirmações sobre trivialidade nem sobre o efeito causal de delegar.

## Decisão (substitui o § 3 "Decisão" do pré-registo)

- B passa a primária (E1) e todas as guardas (E9, E10, E11 e a auditoria de segurança de E3) → B passa a default.
- A primária não é demonstrada → "critério de adopção não demonstrado"; abre-se o desenho de **delegação automática**, com a estimativa e o IC impressos.
- B passa a primária mas falha uma guarda, ou uma guarda fica inconclusiva → B não entra e os números são impressos.
- Resultado inconclusivo (E2) ou interrompido (E12) → B não entra.
