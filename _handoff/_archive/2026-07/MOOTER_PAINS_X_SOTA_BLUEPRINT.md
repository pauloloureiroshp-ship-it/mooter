# Dores do Paulo × metodologia de ponta (2026-07) × o fluxo ideal — blueprint

> Pedido: pegar TODAS as dores ditas, confrontar com o SOTA mais actual, e desenhar a melhor
> solução do mundo. Método: inventário de dores (com incidente real), confronto com 5 correntes
> metodológicas de 2026 (pesquisadas hoje), gap-analysis contra o que o Mooter JÁ tem, e o fluxo
> ideal fim-a-fim. **Spoiler honesto: a melhor solução do mundo não é uma peça nova — é terminar
> e ligar 3 peças já desenhadas, com 2 upgrades baratos validados pelo SOTA. E o SOTA também diz
> onde estávamos a apontar para o sítio errado (F2).**

---

## 1. Inventário das dores (todas, com evidência)

| # | Dor | Evidência real |
|---|---|---|
| D1 | Roteamento manual de masterprompts (onde colar, que aba, fresh-vs-viva) | 4 masterprompts roteados à mão em 2026-07-05 |
| D2 | Worktree errada / colisões no mesmo tree | CC editou `frugal` em vez de `frugal-lp-diag`; node_modules corrompido, EADDRINUSE |
| D3 | ~30 abas CC sem identidade | sessão 2026-07-05 |
| D4 | Estafeta humano Cowork⇄CC (copiar, screenshots de diálogos, responder por clique) | toda a história do sdk-runner nasceu disto |
| D5 | Mount mente no git → decisões erradas | 2119 dirty vs 11 reais; HEAD partido (2026-07-03) |
| D6 | Delírio de contexto em sessões longas; saltar p/ fresh tarde demais | brief do Context Guardian; /compact por fora impossível (CC #58538) |
| D7 | Trabalho por salvar; worktrees/branches a apodrecer | 40 worktrees p/ podar; fleet-commander stale (2176 add/4946 del); forge no stash |
| D8 | Tempo de founder queimado em admin de infra | a dor-mãe (missão vibe coder) |
| D9 | GPU RTX 4090 subutilizada (runner sequencial) | Overclock fase 1: nunca satura |
| D10 | Gate humano sem virar fadiga de aprovação | bandas AUTO/DIGEST do standing policy |
| D11 | Registo falha silenciosamente | 63 sessões, 0 journals (hook stale) |
| D12 | change≠improvement; falsos verdes | caveat do Council; moo-verify falha pré-existente |

## 2. As 5 correntes SOTA (2026-07, pesquisadas hoje) e o que dizem às dores

### S1 · Spec-Driven Development (GitHub Spec Kit, Kiro, OpenSpec — "todo o grande tool shipou SDD em 2026")
Spec versionada = fonte de verdade; fluxo **Specify→Plan→Tasks→Implement com checkpoint humano por fase**; `constitution.md` = princípios invioláveis. Resultados reportados: ~10× menos ciclos "regenerar do zero"; features de 40h em <8h humanas.
→ **Confronto:** o masterprompt Mooter JÁ É uma spec (GOAL/DO/GUARD/GATE ≈ specify/tasks/constitution/acceptance) e o CLAUDE.md é a constitution. O que falta do SOTA: (a) **GATE executável** — acceptance criteria como comandos, não prosa; (b) a spec viver **versionada na fila** (`_handoff/dispatch/` já resolve). Valida D1, D12.

### S2 · Harness de agentes longos (Anthropic engineering) + Ralph loop (Huntley; agora nativo: /loop, /goal do CC)
**Artefactos em disco > compaction**: progresso vive em git/ficheiros (feature-list JSON, progress files), não na conversa; **context reset fresh a cada iteração** ("initializer agent" + "coder agent" com handoff estruturado). Ralph: `while :; do cat PROMPT.md | claude -p; done` — o insight é o reset, não o loop.
→ **Confronto:** o Mooter convergiu SOZINHO nisto (Director's Cut, MOO HANDOFF, fresh-first do Dispatch, sdk-runner = Ralph com governador). **Validação forte do F0 fresh-first.** E uma correcção de rumo: 🔻 **F2 "responder-a-viva" está CONTRA o SOTA** — injectar em sessão viva é o anti-padrão (contexto degradado); o padrão vencedor é fresh + handoff artefacto. F2 rebaixa-se a "focar aba + resume quando o HUMANO quiser", nunca objectivo do router. Resolve D6 por doutrina, não por engenharia.

### S3 · Fleet management by exception (tiered: coordenadores triam, humano só estratégia+excepção)
Verificação **construída no output, não bolted-on**; papéis separados (triage/planner/narrator — um agente a fazer os três = piloto falhado de 2026); blast-radius gates; audit trail.
→ **Confronto:** as bandas AUTO/DIGEST + canUseTool JÁ são management-by-exception; o CTO Command Deck NOW é o "só excepções". Gap: a verificação ainda é ad-hoc por wave (D12) → ver upgrade U2. Valida D10 como já-resolvido-por-doutrina; exige disciplina nos novos executores (Dispatch/Bridge respeitam bandas).

### S4 · Control-plane MCP local (SDK bridge do Desktop; .mcpb one-click)
O cérebro (chat) vê e comanda a frota por tools nativas, não screenshots.
→ **Confronto:** mooter-bridge (estudo de hoje) É isto. Resolve D4+D5 (verdade nativa) e dá olhos ao narrator. Já decidido: track próprio.

### S5 · Worktree-per-task "cattle not pets" (CC `-w` nativo, Squad/Conductor.build, agent teams)
Ambiente efémero por tarefa, auto-provisionado e **auto-colhido**; 1 tarefa = 1 worktree = 1 sessão; merge cedo, podar sempre.
→ **Confronto:** o Mooter tem a criação (F0) mas não a **colheita** — D7 é exactamente a metade que falta do ciclo. O padrão "landing train" já foi provado à mão (aterragem 7 verdes via worktree dedicada, zero conflitos). Falta ritualizá-lo.

## 3. Gap-analysis — o que fazer (quase tudo já está decidido; 2 upgrades novos)

| Dor | SOTA | Já em curso | **Acção nova?** |
|---|---|---|---|
| D1, D2, D3 | S1+S5 | ✅ F0 Dispatch v2 (masterprompt pronto) | não — executar |
| D4, D5 | S4 | ✅ Bridge track (estudo pronto) | não — executar |
| D6 | S2 | ✅ fresh-first + handoff + Guardian (pausado) | 🔻 **rebaixar F2** respond-to-live (anti-padrão) |
| D12 | S1+S3 | proof-gates ad-hoc | 🆕 **U2 GATE executável** (abaixo) |
| D7 | S5 | Doctor hygiene + dispatch.jsonl | 🆕 **U1 Landing ritual** (abaixo) |
| D9 | S2 | Overclock fase 2 masterprompt pronto | não — fila depois do F0/Bridge |
| D10 | S3 | ✅ bandas + canUseTool + NOW deck | não — disciplina |
| D11 | — | acumulador corrigido; bridge notion/vault tools | não — dispatch.jsonl alimenta journal |
| D8 | todas | = soma das outras | 🆕 **métrica**: TTD (time-to-dispatch) + interrupções/dia no cockpit |

### U1 · Landing ritual (fecha o ciclo de vida — a metade que falta do S5)
Cada card do Dispatch tem 4 estados: `queued → dispatched → proven → landed`. "Proven" = GATE
executável verde (U2). Botão **Land** no card: roda o checklist da aterragem-7-verdes (worktree
`frugal-land` dedicada, testes, sha, merge SÓ com o teu OK — o gate irreversível mantém-se) e
depois `git worktree remove` + arquiva o card. **Worktrees passam a ser gado, não animais de
estimação — nascem no Dispatch, morrem no Land.** Cabe no F1 do Dispatch (não inchar o F0).

### U2 · GATE executável (verificação built-in — S1+S3)
O formato canónico ganha um bloco opcional:
```yaml
gate:
  - cd packages/cli && npm test
  - node tools/router/verify-sha.js
```
O CC corre-o no fim (já o faz em prosa); o card só vira `proven` com exit 0 + o moo local $0
re-corre como juiz independente (mata falso-verde barato — D12). Retrocompatível: sem bloco
`gate:`, card não afirma proven (honesto, nunca finge).

## 4. O fluxo ideal (fim-a-fim, com tudo ligado)

**08h50** · Scheduled task já correu: briefing no chat — frota (via bridge `sessions_list`), cards
`proven` à espera de Land, DIGEST de irreversíveis, TTD de ontem.
**09h00 — conversa criativa (o teu único trabalho real)** · Decidimos a wave. Eu escrevo a spec
(masterprompt canónico: front-matter + GOAL/DO/GUARD/**gate:**) e chamo `mooter_dispatch_enqueue`
→ validação síncrona no host (worktree livre? base existe? `claude` no PATH?) → **card nasce verde
no cockpit**. Zero colar, zero estafeta.
**09h10 — Enter** · Cockpit NOW mostra a fila. Clicas Dispatch: worktree criada, terminal
integrado 🐮 nomeado abre com o bootstrap pré-preenchido. **Enter.** (3 cards = 3 Enters, cada um
na sua worktree — colisão impossível por construção.)
**09h15–17h — a frota trabalha, tu crias** · Sessões fresh com spec em disco (S2); moos locais $0
pré-cozinham handoffs e re-verificam gates (GPU a trabalhar — D9); Guardian sugere salto p/ fresh
antes do delírio; perguntas e reversível resolvem-se pelas bandas (S3); só DIGEST te toca.
Eu acompanho pela bridge e aviso: *"MP3 proven; MP4 bloqueado num secret — decisão tua."*
**17h30 — Landing train** · Cards `proven` → botão Land → checklist automático → **o teu OK** no
merge (único gate irreversível do dia) → worktrees colhidas, cockpit limpo.
**17h45 — registo sozinho** · dispatch.jsonl → journal → Notion HQ + vault. TTD do dia no statusline
ao lado do 🐮 saved.

**O que este fluxo elimina:** colar no sítio errado (impossível), estafeta (bridge), screenshots
(bridge), worktree errada (por construção), abas anónimas (terminais nomeados + mapa), delírio
(fresh-first), falso-verde (gate executável + juiz moo), worktrees zombies (Land), registo
esquecido (automático). **O que preserva:** o teu Enter no dispatch e o teu OK no merge — dois
gates, zero fadiga.

## 5. Onde o SOTA corrige o plano — e onde o Mooter está À FRENTE

**Correcções aceites:** F2 respond-to-live rebaixado (S2: fresh+artefactos vence injecção em viva) ·
verificação passa a built-in (U2), não wave-a-wave ad-hoc · lifecycle completo (U1), não só criação.
**Onde o Mooter já está à frente do SOTA publicado:** routing determinístico local $0 (<50ms, sha
congelada) — ninguém no espaço tem; honest-copy como princípio de UI; savings contrafactuais
honestos; governador de perguntas (canUseTool) — o Spec Kit ainda faz checkpoint humano manual em
TODAS as fases. Não importar burocracia SDD que o doctrine já resolve melhor.

## 6. Ordem de execução (sem abrir frentes novas)

1. **F0 Dispatch v2** (masterprompt pronto) — mata D1/D2/D3 já.
2. **Bridge P0 ligado** (commit nativo + config Desktop, read-only, risco zero) — mata D4/D5 no dia seguinte.
3. **F1 Dispatch = U1 Land + U2 gate: + multi-select** — fecha D7/D12.
4. **Bridge v0.2** (hardening + enqueue/git_snapshot) — o fluxo ideal §4 completo.
5. Overclock fase 2 (D9) e Guardian (D6) entram DEPOIS, pela fila que já têm.

## Fontes (hoje)
[Spec Kit](https://github.com/github/spec-kit) · [SDD guide 2026](https://thebcms.com/blog/spec-driven-development) · [GitHub blog SDD](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) · [Anthropic: effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) · [InfoQ three-agent harness](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/) · [Ralph (ghuntley)](https://ghuntley.com/ralph/) · [Ralph loop 2026](https://dev.to/alexandergekov/2026-the-year-of-the-ralph-loop-agent-1gkj) · [loop engineering](https://explainx.ai/blog/loop-engineering-coding-agents-claude-code-guide-2026) · [agent management 2026](https://www.agentcenter.cloud/blogs/complete-guide-ai-agent-management-2026) · [awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering) · estudos anteriores de hoje: `MOOTER_CONDUCTOR_PRODUCT_DESIGN.md` · `CONDUCTOR_F0_REDTEAM.md` · `MOOTER_BRIDGE_CONNECTOR_STUDY.md`.
