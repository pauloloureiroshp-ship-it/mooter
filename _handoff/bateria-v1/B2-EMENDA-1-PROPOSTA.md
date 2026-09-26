# B2 — EMENDA 1 · PROPOSTA (não aplicada)

> **Estado: PROPOSTA para o dono decidir.** O pré-registo (`B2-PREREGISTO.md`, sha256
> `f2344e78…3962a`) **não foi alterado**. Se for aceite, a emenda entra por commit novo, **antes
> de qualquer dado**, como manda o próprio pré-registo (§ cabeçalho).
> Origem: `B2-adversario-codex-r1.md` (23 ataques: 15 bloqueantes, 8 sérios).
> A coluna "Recomendação" é do autor (Claude) — e o autor é a parte que foi atacada; lê-a como tal.

## Decisões que só o dono pode tomar

| # | Pergunta | Opções |
|---|---|---|
| D1 | A primária mede **tentativa** de delegação ou **transferência** do trabalho? (A14) | (a) renomear para "taxa de tentativa" — barato, honesto, mais fraco · (b) exigir transferência (host não repete o trabalho) — precisa de critério novo no instrumento |
| D2 | Inferência por sessão (A1) | (a) diferença de proporções com bootstrap por cluster de sessão · (b) regressão logística com erros robustos por sessão · Fisher fica só descritivo em ambas |
| D3 | Data-limite administrativa (A2) | valor a fixar (ex.: 45 dias após o arranque) |
| D4 | O dono aceita **não** escolher/reformular pedidos pelo braço e registar incentivos explícitos à delegação? (A11) | sim / não (se não, H1 só se lê como "com utilizador informado") |

## Emendas propostas (texto que entraria no pré-registo)

| Grupo | Ataques | Emenda | Recomendação |
|---|---|---|---|
| **E1 · Unidade e teste** | A1, A3 | A inferência primária respeita a sessão (D2). Fisher sobre turnos é só descritivo. A diferença é absoluta (pp), também com A = 0 %. Falhar a primária = "critério de adopção não demonstrado", não "ausência de efeito"; imprime-se estimativa + IC 95 %. | aceitar |
| **E2 · Regra de paragem fechada** | A2 | Termina no 1.º fecho diário em que os dois braços têm ≥ 30 sessões com ≥ 1 turno elegível **e** ≥ 100 turnos elegíveis; entram todos os turnos até ao corte. Data-limite D3; mínimos não atingidos ⇒ inconclusivo. Zero olhadelas intermédias por eficácia. | aceitar |
| **E3 · Elegibilidade antes do resultado** | A12, A20 | Elegível = hint presente ∧ tier do host conhecido ∧ ≠ tier recomendado ∧ não HIGH_RISK ∧ sem override do utilizador — calculado **antes** de olhar para delegações. Inelegíveis nunca entram no numerador nem no denominador. Nota: exige uma função de elegibilidade nova em `tools/p0` (o `classificarTurno` actual devolve `seguiu` antes de testar `ja_no_tier`, `medir-p0.mjs:655-658`). | aceitar — **bloqueante confirmado no código** |
| **E4 · Tier declarado manda** | A13 | Conta como "seguiu" só se o tier declarado na chamada (quando existe) = tier recomendado; o nome exacto do agente passa a métrica separada. (`medir-p0.mjs:652,655` hoje faz o contrário.) | aceitar — **confirmado no código** |
| **E5 · O que a primária mede** | A14, A18 | Conforme D1. Em qualquer caso: tentativa T0 e execução local concluída são reportadas em separado; duplicação pelo host é reportada. | aceitar (a); (b) se o dono quiser a afirmação forte |
| **E6 · Instrumento congelado por hash** | A18, A17, A15 | Congela-se por sha256 a cadeia inteira (`medir-p0.mjs` + a função de elegibilidade nova + `AGENTE_TIER` + `agents/*.md`), não só a classificação. Fixture de controlo: os dois textos de hint sem `tool_use` ⇒ 0 delegações (A17: o código já só lê `tool_use` estruturado, `medir-p0.mjs:254-272`; a fixture prova-o). Validar numa amostra que o 1.º pedido do turno é o modelo que decide (A15). | aceitar |
| **E7 · Braço gravado na sessão, não no hint** | A16 | O braço é registado na criação da sessão e ligado a todos os turnos, com ou sem hint; o relatório imprime o fluxo por braço (prompts → com hint → elegíveis). | aceitar |
| **E8 · Alocação por linhagem** | A8, A9, A10 | Toda a sessão iniciada entra no registo de alocação (mesmo abandonada). Retomadas/forks herdam o braço da raiz; subagentes não são unidades. Chave = device + session_id raiz. **Pré-requisito n/d:** verificar como o Claude Code gera o `session_id` num resume/fork antes de congelar. | aceitar; verificação obrigatória antes |
| **E9 · Quota completa** | A6 | Quota por turno = host + todos os descendentes (incluindo tentativas falhadas), pela regra de atribuição `parentUuid` já usada no recibo. Guarda: mediana B ≤ 1,10 × mediana A (descritivo, não teste). Consumo não reconstruível ⇒ guarda inconclusiva. | aceitar |
| **E10 · Qualidade** | A4, A5 | Script congelado sorteia 20 turnos elegíveis por braço com semente comprometida no commit da emenda; apresentação em ordem aleatória, sem o texto do hint e sem ids; nota = média dos 2 juízes; passa se o limite inferior unilateral de 95 % de B − A > −0,5 (bootstrap por sessão). Precisão insuficiente **não** conta como passagem. O dono regista quando reconhece um turno. | aceitar; aceitar que n=20 pode dar inconclusivo |
| **E11 · Retrabalho** | A7 | Janela fixa: os 3 turnos humanos seguintes na mesma linhagem; regex congelada + `git revert`/`reset` na mesma janela; turnos sem janela completa ficam como "sem acompanhamento", não como "sem retrabalho". | aceitar |
| **E12 · Kill-switch com semântica** | A21 | `MOOTER_AB_B2=off` ⇒ todas as sessões novas recebem A; activação datada e justificada no ledger; os dados anteriores ficam na análise; suspensão ⇒ resultado "interrompido", sem adopção; retomar exige emenda. | aceitar |
| **E13 · Contaminação** | A22 | Antes do arranque: inventário + sha256 de `~/.claude/CLAUDE.md`, `CLAUDE.md`/`AGENTS.md` do repo, memória, hooks e skills, gravado por sessão. Facto conhecido do autor (não verificado pelo adversário): o `~/.claude/CLAUDE.md` do dono já manda "DELEGA SEMPRE" em T0/T1 — ou seja, **o braço A já é parcialmente imperativo**. O B2 mede o incremento do texto do hint **sobre** essa base; congelar a base durante a janela. | aceitar — **o ponto mais relevante para a leitura do resultado** |
| **E14 · Janela operacional** | A23 | O arranque exige uma emenda curta posterior aos marcos (veredicto 60d + F2), com data/hora de início e versões do decisor/host/config. Actualizações a meio suspendem a janela (E12). A estratificação por modelo é descritiva; a decisão usa só o agregado. | aceitar |
| **E15 · H2 sem causalidade** | A19 | H2 passa a "turnos com output curto do host", descritivo; nenhuma afirmação sobre trivialidade nem sobre causalidade. | aceitar |

## O que esta emenda NÃO faz

- Não mexe em `tools/router` nem no `settings.json` — a implementação do braço (hook) é trabalho separado e só começa depois de a emenda ser decidida.
- Não mexe no gate primário (≥ 20 pp): o adversário não o atacou como número, só a forma de o testar.
- Não resolve os n/d (A9/A10/A15): marca-os como pré-requisito verificável antes do arranque.
