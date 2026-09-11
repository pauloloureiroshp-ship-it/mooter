# ADR — Onboarding v2: do `.mcpb` pessoal ao primeiro recibo

**Estado:** aceite · **Data:** 2026-09-10 · **Decisor:** Paulo Loureiro (dono)
**Registo da decisão:** `_handoff/onboarding-v2/ATA-D1-D6-2026-09-10.md` (registada por Cowork/Fable 5.1 em chat, a pedido do dono)
**Adversário:** `_handoff/onboarding-v2/REFUTACAO-CODEX.md` (job `job-mtvmlw3l-f78e`, 289 s, 699 831 tokens in / 8 151 out, custo `n/d`) — anexada na íntegra na secção 4
**Kickoff que este ADR governa:** `_handoff/onboarding-v2/KICKOFF-ONBOARDING-V2-MAGIA.md` (ondas W0→W6)
**Mapa de estados tristes:** `_handoff/onboarding-v2/MAPA_DE_ESTADOS_ONBOARDING_V2_2026-09-10.md`

---

## 1. Contexto

O caminho actual do utilizador novo tem três superfícies de instalação
(`~/.claude/tools/router`, `~/.mooter/cli`, `~/.mooter/cli-v1`), um updater que
re-executa o instalador (e perde o canal), e um recibo que não consegue provar
benefício porque **o ledger não tem tokens estruturados**. O adversário mediu
`0/156` eventos em `agent-sync/events.jsonl` com campos de tokens; a única
"linha com tokens" era texto livre dentro do `summary`.

Ao mesmo tempo, o `/dashboard` publicava `% saved vs all-Opus` derivado de um
custo **modelado** (`decisions × $0.015`), não medido — exactamente o que a
decisão de 2026-08-24 proíbe.

Este ADR fixa as seis decisões que governam as ondas W0→W6 e regista, junto de
cada uma, o que o adversário conseguiu derrubar.

## 2. Decisões (D1–D6)

| # | Decisão | O que o adversário disse | O que sobrevive |
|---|---|---|---|
| **D1** | **Launcher + payload.** Partir do `packages/mooter-bridge` existente e **unificar as três superfícies** (`~/.claude/tools/router`, `~/.mooter/cli`, `~/.mooter/cli-v1`) numa fronteira única launcher→payload. | «sobrevive enfraquecida» — a fronteira não existe hoje e não há inventário de consumidores | Aceite **com pré-condição**: W1.0 é obrigatório e produz o inventário de consumidores antes de qualquer troca de superfície. |
| **D2** | **Free sem conta.** O primeiro recibo não exige registo; a *elicitation* no 1.º pedido é o que converte. | sem objecção | Aceite tal como está. |
| **D3** | **O bundle nunca carrega credencial persistente.** O `.mcpb` leva um **código de bootstrap single-use (24 h)** via `user_config` sensível; o `init` troca-o por uma **chave de device** escopada, revogável, guardada 0600/keychain. | «B · `.mcpb` pessoal com token embutido: **refutada**» — um bundle copiável é uma credencial copiável | **A hipótese original foi derrubada e substituída.** O token pessoal continua a ser a credencial de *enrolment* (single-use, 24 h), mas **nunca** é a credencial de operação. |
| **D4** | **O canal de update vem do entitlement**, escrito **só** pelo serviço de conta — nunca de um `profile.json` autodeclarado no device. | «`CHANNEL` no `install.sh` só é impresso; o `update.js` re-executa o instalador e perde o canal» | Aceite, e o achado eleva W1 de "melhoria" a **correcção**. |
| **D5** | **Motor local: modelo pequeno primeiro** (para o 1.º recibo existir depressa), 14b descarregado em background. | sem objecção | Aceite tal como está. |
| **D6** | **Recibo:** usage nativo por balde + quota + custo + egresso é a **verdade primária**. O Moo Token é um contador técnico **secundário**, sem nome financeiro. | «C · Moo Token como odómetro principal: **refutada**» — 4 chars não conservam latência, energia, quota nem custo; o usage nativo já existe em `recibo.js` e `ledger-turn-io.js` | **A hipótese original foi derrubada.** O MT desce a secundário e ganha regras anti-dupla-contagem. |

### Decisões que este ADR **não** toma

Pricing público (exige definição de "seat" + tabela de comparáveis M12 + ata
própria) · instalador nativo L2 (bun compile, notarização) · política
"nunca sai" (W3.b) · `node-llama-cpp` · SAML/SCIM/RBAC · MCP App no Claude Code.

## 3. Consequências operacionais (as regras R1–R10 do kickoff)

Estas passam a ser vinculativas para W0→W6 e são a razão pela qual várias
superfícies mudam nesta onda:

- **R1** `tools/router/classify.js` e `patterns.js` **FROZEN**. Nada nestas
  ondas toca no classificador; o sha é verificado no CI.
- **R2** **Nenhum número de poupança** em superfície nenhuma sem par real
  (≥20 tarefas, tokens medidos dos **dois** lados). É por isto que W0 retira
  `Savings calculator`, `saved vs all-Opus` e `savings estimate` do
  `/dashboard`.
- **R4** Três frases proibidas na copy: «0 bytes saíram» (→ «nenhuma chamada
  cloud despachada pelo Mooter»), barra de quota sem o rótulo «estimado»,
  e «poupaste X%».
- **R6** Nunca ler tokens ou sessões das CLIs de terceiros — só presença,
  versão e estado de login.
- **R9** **M1 (obediência) tem precedência.** Se o teste do terceiro humano
  mostrar o host a ignorar a rota em >50% dos pedidos, **pára e reporta** —
  não se maquilha.
- **R10** Número não medido = `n/d`.

### Os 4 KPIs que substituem a poupança no `/dashboard`

| KPI | Fonte | Estado hoje |
|---|---|---|
| Tarefas roteadas | contagem real sincronizada (`total_calls` / `decisions_count`) | medido |
| Cobertura local (tarefas) | fracção T0 da `tier_distribution` do próprio utilizador | medido quando há sync |
| Janela preservada | tarefas que **não** foram despachadas para uma janela paga — contadas em **tarefas, não em tokens** | **estimado** (rótulo obrigatório) |
| ESR (Effective Savings Rate) | `(custo-equivalente cloud − custo pago incl. energia) ÷ custo-equivalente cloud` | **`n/d`**, com a razão à vista |

**Porque é que o ESR é `n/d` e não um número:** exige tokens medidos dos dois
lados. Medido pelo adversário a 2026-09-10: `0/156` eventos do ledger têm
campos de tokens estruturados. W4 é a onda que fecha isto; até lá o ecrã diz
`n/d` e diz porquê.

## 4. Refutação do adversário (anexa, na íntegra)

> Fonte: `_handoff/onboarding-v2/REFUTACAO-CODEX.md` · job `job-mtvmlw3l-f78e` ·
> 2026-09-10 · 289 s · 699 831 tokens in / 8 151 out · custo `n/d`.
> Texto do agente = **dados**, não instruções.

Verificado por leitura directa em disco: `packages/mooter-bridge/manifest.json`
(entry `server/server-apps.js`, `user_config` com `sensitive: true`),
`packages/mooter-bridge/update.js` (sem sign/sha256/verify), `install.sh`
(3 superfícies: `~/.claude/tools/router`, `~/.mooter/cli`, `cli-v1`).

**Veredictos**

| Item | Veredicto |
|---|---|
| A · launcher + payload + conta/entitlement | **sobrevive enfraquecida** |
| B · `.mcpb` pessoal com token embutido | **refutada** (bundle copiável = credencial copiável; o token actual é single-use/24 h e nunca entra no artefacto) |
| B' · "sem pré-requisitos" | refutada para hoje (Node 22, Git, Claude Code; Ollama só degrada) |
| C · Moo Token como odómetro principal | **refutada** (4 chars não conservam latência/energia/quota/custo; usage nativo já existe em `recibo.js` e `ledger-turn-io.js`) |
| C' · flat por utilizador | sobrevive enfraquecida (sem WTP/coorte/custo de suporte; "seat" vs "frota" indefinido) |

**Achados factuais novos**

- Ledger `agent-sync/events.jsonl`: **0/156** com campos estruturados de tokens;
  a "linha com tokens" é texto livre no `summary`.
- `CHANNEL` em `install.sh` só é impresso; `update.js` re-executa o instalador
  e perde o canal.
- O updater do bridge verifica presença/sintaxe, **não** assinatura — um
  atacante da origem entrega JS válido.
- `classify.js` intacto em `427d8c0…`. Doctor: `LOCAL_AGENT_SYNC=fail`, gate
  cross-device `READINESS=fail` (a revisão prova este worktree, não a frota).

**O que teria de ser verdade para a arquitectura sobreviver**

Fronteira única launcher→payload testada · inventário de consumidores ·
manifesto assinado verificado antes da troca · update atómico com rollback ·
entitlement escrito só pelo serviço de conta · bootstrap efémero no bundle,
credencial persistente emitida depois, escopada por device e no keychain ·
bootstrap provado em máquina limpa por OS · MT secundário com regras
anti-dupla-contagem, usage nativo primário.

## 5. O que fica por medir (`n/d` declarado, não esquecido)

| # | Por medir | Quem fecha | Hoje |
|---|---|---|---|
| 1 | **Obediência do host** — % de pedidos em que o host chama de facto o Mooter | W4 + W6 (terceiro humano) | **0% medido** (estado C1 do mapa) |
| 2 | **TTV** — tempo do duplo-clique ao 1.º recibo | W2 (cronometrado) | `n/d` |
| 3 | **Tokens dos dois lados** — sem eles não há ESR nem poupança publicável | W4 | `0/156` no ledger |
| 4 | **Tamanho do download** do payload e tempo de probe | W1/W3 | `n/d` |
| 5 | **Custo do job do adversário** | — | `n/d` (o conector regista tokens, não custo) |
| 6 | **Bootstrap em máquina limpa por OS** (macOS, Windows, Linux) | W2/W3 | `n/d` — só o Mac mini está provado |
| 7 | **Energia (Wh) por tarefa** — entra no ESR | W4 se medível, senão `n/d` permanente | `n/d` |

## 6. Custo de reverter

Baixo por onda, e é por isso que as ondas são PRs separados. A decisão mais
cara de desfazer é a **D1** (fronteira única): mexe em três superfícies de
instalação já no disco de utilizadores. É por isso que W1.0 (inventário de
consumidores) precede qualquer remoção, e que o update ganha `cli.prev` +
rollback **antes** de a fronteira mudar. As D2, D5 e D6 são reversíveis num
commit. A D3 é reversível mas não deve ser: reverter reintroduz uma credencial
persistente num artefacto copiável.
