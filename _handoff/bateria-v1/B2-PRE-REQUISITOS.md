# B2 — pré-requisitos do arranque

> Tudo o que a `B2-EMENDA-1.md` exige e que **ainda não existe**. O B2 **não arranca** com
> nenhuma linha em aberto. Cada linha só fecha com o commit e a prova indicados; a emenda de
> arranque (E14) cita esses commits.
> Nada daqui foi feito na sessão de 2026-09-26: por decisão do dono, as alterações ao
> instrumento não eram para já.
> As linhas que tocam em `tools/router` (hook do hint) precisam de uma autorização explícita
> do dono na altura; esta lista não a dá.

| # | Emenda | Pré-requisito | Onde | Prova para fechar | Estado |
|---|---|---|---|---|---|
| PR-1 | E3 | Função de elegibilidade calculada **antes** das delegações: hint presente ∧ tier do host conhecido ∧ ≠ recomendado ∧ não HIGH_RISK ∧ sem override. Hoje `classificarTurno` devolve `seguiu` antes de testar `ja_no_tier` (`medir-p0.mjs:655-658`) | `tools/p0/` | teste: um turno `ja_no_tier` que delega fica **fora** do numerador e do denominador; mordida verificada (o teste falha contra `630ed8c6`) | aberto |
| PR-2 | E4 | O tier declarado na chamada manda sobre o nome exacto do agente; "exacto" passa a métrica separada (`medir-p0.mjs:652,655`) | `tools/p0/` | teste: agente T1 com `model` T3 declarado ≠ seguiu; mordida verificada | aberto |
| PR-3 | E5 | Métricas separadas, sem gate: transferência efectiva, delegação exacta, tentativa T0 vs execução local concluída, duplicação pelo host (regras escritas antes) | `tools/p0/` | teste por métrica, com fixture derivada de um transcript real | aberto |
| PR-4 | E6 | Fixture de controlo: os dois textos de hint (A e B) sem `tool_use` dão 0 delegações | `tools/p0/test/` | teste verde + mordida (injectar uma delegação textual não a faz contar) | aberto |
| PR-5 | E6 | Validação numa amostra de que o 1.º pedido do turno corresponde ao modelo que recebe o hint e decide (A15) | `tools/p0/` | relatório com n, taxa de concordância e casos divergentes | aberto |
| PR-6 | E6 | Cadeia de medição congelada: sha256 de `medir-p0.mjs`, da elegibilidade, de `AGENTE_TIER` e de `agents/*.md` | emenda de arranque | hashes calculados no commit que fecha PR-1…PR-5 | aberto |
| PR-7 | E7 | Braço gravado na **criação** da sessão e ligado a todos os turnos, com ou sem hint; o relatório imprime o fluxo por braço | hook do hint (`tools/router`, **precisa de autorização**) + `tools/p0/` | teste: uma sessão sem nenhum hint aparece no fluxo com o braço | aberto |
| PR-8 | E8 | Verificar como o Claude Code gera o `session_id` num resume e num fork, e se é único entre devices; registo de alocação por linhagem (device + raiz), incluindo sessões abandonadas | `tools/p0/` + nota de verificação | resume e fork reais observados e documentados; teste: um fork herda o braço da raiz | aberto (n/d hoje) |
| PR-9 | E9 | Quota por turno = host + todos os descendentes (cadeia `parentUuid`, incluindo tentativas falhadas); consumo que não se reconstrua é marcado | `tools/p0/` | teste com um subagente falhado a contar; controlo contra o `cost-state` | aberto |
| PR-10 | E10 | Script de sorteio congelado (semente `934b83d5…`) + geração do material cego (ordem aleatória, sem hint, sem ids) + folha de notas dos 2 juízes | `tools/p0/` ou `tools/ab/` | execução a seco sobre dados antigos (não do B2) reproduz o mesmo sorteio 2× | aberto |
| PR-11 | E11 | Detector de retrabalho: janela de 3 turnos na mesma linhagem, regex congelada, `git revert`/`reset`; "sem acompanhamento" é distinto de "sem retrabalho" | `tools/p0/` | teste por caso (hit, miss, janela incompleta) | aberto |
| PR-12 | E12 | Kill-switch `MOOTER_AB_B2=off`: sessões novas → A; activação datada no ledger | hook do hint (`tools/router`, **precisa de autorização**) | teste: com `off`, uma sessão que por hash iria para B recebe A e a activação fica registada | aberto |
| PR-13 | E13 | Inventário + sha256 da base (`~/.claude/CLAUDE.md`, `CLAUDE.md`/`AGENTS.md`, memória, hooks, skills), gravado por sessão | `tools/p0/` | relatório de inventário; teste: mudar a base a meio é detectado | aberto |
| PR-14 | E1, E2 | Script de análise congelado: diferença de proporções com bootstrap por cluster de sessão, IC 95 %, regra de corte diária, data-limite a 45 dias, Fisher só descritivo | `tools/p0/` ou `tools/ab/` | teste com dados sintéticos: IC conhecido; dois clusters grandes não inflacionam a significância | aberto |

**Condição de arranque (E14), fora da lista porque não é trabalho:** veredicto do 60d (≥ 05/10) e F2 concluído, seguidos da emenda de arranque com a data/hora, as versões, os hashes (PR-6, PR-13) e as 14 linhas fechadas.
