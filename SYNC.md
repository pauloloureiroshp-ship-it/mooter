# SYNC — projecção verificável do estado Mooter

> Este bloco é gerado por `packages/mooter-bridge/sync.js`. Edita apenas a zona humana delimitada no fim.

## Cabeçalho

- versão instalada: 1.49.4
- HEAD: ad0deaede95ebc0404a4b6d09dab5f79e4f13457
- branch: mac/sistema-sync-2026-08-25
- remoto: n/d (porque não foi possível determinar o upstream: fatal: no upstream configured for branch 'mac/sistema-sync-2026-08-25')
- gerado_em: 2026-08-25T20:17:14.000Z (derivado do último facto observado; não do relógio da execução)

## Entregas

| Versão | Entrega medida | Commit que a trouxe |
|---|---|---|
| v1.20 | sentinela.js, afericao.js | 44c9a803 — feat(mooter-bridge): v1.20.0 - os dois loops de self-learning: sentinela horaria que ESCREVE em vez de gritar (so transicoes, custo zero) e afericao com tarefas de resposta conhecida que mede custo por resposta certa por motor; estudo dos pilares de vibe coding com a bateria real (moo 3/3 em 7s a 0 USD contra sonnet a 0.44 USD) |
| v1.22 | n/d (porque a versão não tem entregas descritas na fonte) | 09e1e948 — fix(mooter-bridge): v1.22.0 - L1 fecha os 14 loopholes da auditoria UX: nenhum agregado nasce a 0 (somatorio sem parcelas medidas e n/d com jobs_sem_medicao), totals e arvore derivam da mesma funcao, medido_em+fresco+idade_h por bloco, blocos vazios desaparecem e o coherence deixa de mostrar stderr de ambiente; e o BUG DE TIJOLO: o verificador rejeitava o shebang dos nossos proprios ficheiros e teria trancado todas as instalacoes futuras |
| v1.23 | board.js, seamless.js, tools6.js, server-apps.js | cfc3f5dc — ﻿feat(bridge): onda 1 - parar a mentira (v1.23.0) |
| v1.24 | capacidades.js, eta.js, estimativa.js, fleet.js, fleet-ui.html, sync.js, worktrees.js | 8bc25a07 — chore(sync): regenerar SYNC.md para v1.24.1 |
| v1.25 | moo.js, localfirst.js, estimativa.js | fe58c45d — feat(bridge): tecto de VRAM, a ETA para de fingir 100%, e os gates entram no CI (v1.25.0) |
| v1.26 | recibo.js, seamless.js, tools6.js, fleet.js | bf84d0ec — feat(bridge): o trabalho passa a saber de que departamento e (v1.26.0) |
| v1.27 | manifest.json, tools6.js, update.js, seamless.js, fleet.js | n/d (porque nenhum commit do branch menciona v1.27) |
| v1.28 | manifest.json, tools6.js, update.js, seamless.js, kimi-adapter.js, fleet.js | 26366897 — chore(bridge): bump version to 1.28.1 (force updater past old kimi bundle) |
| v1.28.1 | manifest.json | 26366897 — chore(bridge): bump version to 1.28.1 (force updater past old kimi bundle) |
| v1.29 | manifest.json, seamless.js, kimi-adapter.js, install-id.js | 838dbe17 — fix(bridge): manifest.json v1.29.1 ÔÇö DXT schema violations blocking install |
| v1.32 | recibo.js, recibo-contexto.js, fleet.js, tools6.js, kimi-adapter.js | a157c095 — feat(bridge): v1.32.0 - dieta de payload, schema destravado e recibo com contexto |
| v1.33 | seamless.js, tools6.js, worktrees.js, fosso.js, moo.js, afericao.js, aprender.js, kimi-adapter.js | 3506c762 — chore(release): sync version.json → 1.33.0 [skip ci] |
| v1.45 | fatia-local.js | 4d4254fc — chore(release): sync version.json → 1.45.4 [skip ci] |
| v1.47 | retry.js, terminal.js, board.js, fleet.js, seamless.js | 3af2c2ce — chore(release): adiciona v1.47 a entregas-por-versao.json |
| v1.48 | trilha.js, trilha-tool.js, seamless.js, fleet.js, tools6.js, probe.js, server.js | 72b8e31f — chore(release): 1.48.0 -> 1.48.1 para o .mcpb do piloto poder instalar |
| v1.49 | capacidades.js, server-apps.js, probe.js, fleet-ui.html | 15280a66 — chore(v1.49.4): a versao lidera a tag (#348) |

## Trabalho recente (até 1 jobs terminais)

### validacao-generalizacao-2026-08-18

- `job-msyeuimh-84b1` · agente=moo · actor={"type":"system","id":"legacy","origem":"evento anterior à instrumentação de identidade (f-mu0)"} · actor_porque=n/d (porque o evento não contém actor_porque; nunca inferido) · duração=20 (fonte: ledger.duration_s) · desfecho=entregue · custo=0 (fonte: ledger.cost_usd) USD

## Zona humana

<!-- HUMANO:INICIO -->
> **SNAPSHOT, nao log.** Orcamento ~220 linhas; ao passar, rola-se a historia
> para `docs/foundation/SYNC_ARCHIVE_2026.md` (`docs-hygiene` avisa).
>
> O bloco acima e da MAQUINA. Precisa dos DOIS marcadores da zona humana —
> faltava o de FIM, o `extractHumanBlock` lancava em todas as corridas, e o
> cabecalho serviu `v1.24.1 / 2026-07-27` durante um mes com a maquina em
> `v1.49.4`. Regenerar: `node packages/mooter-bridge/sync.js --max-jobs 1`

# Mooter — Sync Snapshot

## ⏳ PENDENTE — o que continua aberto

> Promovido para aqui a 2026-08-23, ao rolar a história para
> `docs/foundation/SYNC_ARCHIVE_2026.md`. Estava enterrado no meio de entradas
> de sessão antigas; arquivar sem promover seria perdê-lo. O registo completo,
> com o contexto de cada um, fica no arquivo.

<!-- miscalibração T3 (parqueado 2026-08-03) -->
### 🅿️ PARQUEADO — miscalibração T3 vs trabalho crítico (2026-08-03)

- Classificador decide **T3 nativamente em 85,7%** das classificações (108/126), com `escalation_rule: none` em 91 e `task_category: architecture_or_critical` em 98 — sem beast, sem safety_boost, sem override [medido: `decisions.log`, janela 03:23→13:44 de 2026-08-03].
- `haiku_unavailable_no_provider_degraded_to_local` em **9,8%** (376/3845) — o T1 cai para local por falta de provider [medido: `decisions_v2.jsonl`, 2026-06-13→2026-08-03].
- **Investigar** se é quota a arder por miscalibração ou se o trabalho é mesmo crítico. `classify.js` é FROZEN (sha CI-enforced), portanto o fix vive **fora** dele. Descartado nesta sessão: beast mode — 2 disparos em 3845 decisões (0,05%), `.mooter-mode.json` em `auto` [medido: `decisions_v2.jsonl` + `~/.claude/tools/router/.mooter-mode.json`].

<!-- runtime config + HIBP (sessões #28/#29) -->
### ⚠️ Acções PENDENTES para Paulo (runtime config)

**De Sessão #29 (novo):**

1. **Criar 4 projectos Sentry** em sentry.io: `mooter-landing`, `mooter-dashboard`, `mooter-hub`, `mooter-router`
2. **Configurar DSN em 3 stores:**
   - Vercel (landing + dashboard): `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_{ORG,PROJECT,AUTH_TOKEN}`
   - Cloudflare (hub): `wrangler secret put SENTRY_DSN`
   - Shell profile (router): `export MOOTER_SENTRY_DSN=...`

Sem DSN, os 4 Sentry SDKs estão no-op silencioso. Producao continua cega até configurar.

**De Sessão #28 (ainda pendentes):**

### HIBP blocker (decisão estratégica)

Leaked Password Protection bloqueado pela API com `HTTP 402 — Pro Plan only` ($25/mo). Recomendação: deixar off enquanto GitHub OAuth é caminho principal (email/password = fallback). Revisitar se >50 email-auth users.

<!-- slack-spike — bloqueados no dono -->
### BLOQUEADOS (não dependem de mim)
- **`reactions:write` ausente** → a reacção ⏳→✅/❌ do H5 não é construível. Scopes actuais
  medidos: `app_mentions:read`, `chat:write`. **Precisa do dono.**
- **Suprimir o push** (H5) — o `text` controla o *conteúdo* do push, não *se* há push. Não
  há via de API para o suprimir. `n/d`.
- **3c rotação dos tokens** — o dono regenera; eu não crio credenciais.
- **3d recusa e STALE ao vivo** — precisam de um clique humano.

<!-- slack-spike — continua por fazer -->
### Continua por fazer (do dono, ou bloqueado)
Rotação dos tokens ✅ **FEITA 2026-08-18** — bot e app, os dois regenerados e conferidos por
fingerprint (o app estava em 13384004…, passou a 4116af94…). Deixa de haver credencial viva
exposta. · demo agendada (gate nº1, **ainda aberto**) ·
`reactions:write` para a reacção ⏳ · recusa e STALE ao vivo (precisam de clique) ·
`git merge origin/main` + suite na árvore fundida antes do push (o branch está 28 atrás) ·
`slack-spike` não corre em CI nenhum.

<!-- slack-spike — o GO CONDICIONADO que autoriza a linha de destrave -->
### ✅ Fechados a 25/08 — detalhe em `docs/foundation/SYNC_ARCHIVE_2026.md`

- **Frota em Ed25519, 2 de 2 devices.** `prova_frota: true`, `verificados: 2`, `rejeitados: 0`, os dois
  ancorados no registo. A privada nunca sai da máquina. Multi-user é desenho sem código
  (`docs/strategy/IDENTIDADE_MULTI_USER.md`).
- **A suite `tools/router` já conta sempre o mesmo.** Era o `--test-force-exit` a matar o reporter; sem
  ele, 1160 ×3, `fail 0`. O `fail 0` original era artefacto — havia 3 falhas verdadeiras cortadas.

**Continua ABERTO (não é história):** beacon do `desktop-j26409q` com **66 min** (tecto 30) — `morto`: ou o loop parou lá, ou o publicador parou de empurrar. Gargalo do Mac: **1054 achados por triar**, loop em pausa por `human queue full (524/6)` — nenhum dos PRs lhe tocou.

---

## 🧱 Stack técnica
| Camada | Tecnologia |
|--------|------------|
| Classifier | `classify.js` v0.10+ (regex, ~47KB, 11-pass + ARCH_SIGNALS guard) |
| Arbiter | Haiku 4.5 via Anthropic SDK |
| Hooks | UserPromptSubmit + PostToolUse + Stop |
| T0 Local | Ollama brew service (qwen2.5:3b/14b, gemma4:e4b, nomic-embed-text) |
| T1-T3 | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.6 |
| Telemetry | savings-tracker :7821 + hub Cloudflare + D1 |
| Landing | `mooter.ai` (public waitlist) + `landing-five-azure-16.vercel.app` (Friends Beta) |

## 🔗 Links duraveis

| Recurso | URL |
|---------|-----|
| Notion HQ | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| GitHub (publico) | https://github.com/pauloloureiroshp-ship-it/mooter |
| Landing | https://mooter.ai |
| Hub Cloudflare | https://mooter-hub.frugal-hub.workers.dev/api/stats |
| npm | https://www.npmjs.com/package/@mooter/cli |

*(os 25 links de sessoes de Abril-Maio foram para o arquivo)*
kimi-egress FECHADA — slack-spike destravado

### 2026-08-26 (Mac · CC · "rodar perfeito") · o pedido inverteu-se ao abrir o ficheiro

**#396 MERJIDO** (`0a2c172d`, 11:20:59Z) — CI **22/22** verde, o rate-limit do Vercel passou. Cinco
conflitos: os dois `package.json` por **união** (escolher um lado desligava testes dos dois lados);
o painel com a **arquitectura do #396 e a regra do #401 lá dentro** — a premissa de que "o #396 já
antecipa o #401" **não se confirma**, o ramo da pausa vinha antes do teste de morte e tomá-lo tal e
qual reintroduzia o defeito do beacon a 3592 s; e o `SYNC.md` do #396, que era o correcto (219 vs
390 linhas) mas tinha deixado de fora **uma** das quatro entradas de 25/08 do main — a do PC, com a
hipótese do autor refutada contra 57 etiquetas. Resgatada para o arquivo.

**O P1 do kickoff inverteu-se.** Pedia religar P4 e P5 apagando `activo: false`. O P4 não é
"zero-LLM": é um enunciado de GPU para um defeito com **0 ocorrências** neste repo (0 de 443 `.md`
acabam a meio de uma palavra). O P5 não mede modelos: é `falso-em-ambos`. E as **"+603 linhas de
ledger da madrugada, $0" não eram saúde** — o processo vivo era de 25/08 08:13, tinha o catálogo
antigo em memória, e passou ~15 h a produzir **P2/P3**, os dois pilares de que o dono decidiu 19
achados à mão e não guardou nenhum.

Em vez disso, a correcção um nível acima: **a rotação passou a derivar de medição**
(`portao.mjs` + `podeEntrar`, o mesmo portão que o #389 pôs nas regras do ancorado na véspera
*"porque foi assim que o P11 entrou"* — e que aos pilares, de onde o problema veio, nunca foi
aplicado). Forçar `activo: true` nos onze dá **zero**, cada recusa com o seu número. Cinco
comentários que diziam "reversível numa linha" passaram a ser falsos e foram corrigidos.

**Loop relançado** sob launchd (PID 11825) com o código de `main` — o `ai.mooter.runner` estava
carregado mas **não era ele que corria** (PID `-`; o processo real fora lançado à mão e segurava o
lock). A objecção que ontem bloqueou o relançamento (`nextPillar(n,[])` a falhar em silêncio) era
um **defeito corrigível**: com `ids=[]` o escalonador dizia `all capped / paused / suspended`, falso
nas três coisas que nomeia e a mandar o dono triar uma fila que não existe. Corrigido. Ao vivo às
11:18Z o painel pinta `holding · zero pilares na rotacao — nenhum passa o portao de medicao`.

⚠️ **O ledger NÃO cresce, e é o resultado certo** — declarado, não disfarçado. Sem pilar não há
ronda. Voltar a crescer exige um pilar que passe o portão (≥10 reais, ≥30 %, triados à mão): onda
de medição, não booleano. #400/#402 avaliados e **não merjidos** — continuam 🔴 por adversário
externo, e o codex não está nesta máquina.

Vermelhos: espelho do cockpit **42 ficheiros atrás** e o LaunchAgent aponta **directo ao checkout** ·
`.mooter/pilares.json` **contorna o portão** novo · a condição do #400 é uma linha no `SYNC.md`, não
o veto em código.

gate: cockpit 938/0 (2 todo pré-existentes) · router 977/0 · classify.js `427d8c0b` intacto ·
detalhe em `_handoff/cc-perfeito-progress.md`

### 2026-08-25 (Mac · construir) · os LLMs do talo, medidos — e a condição que não estava cumprida

**A condição `kimi-egress FECHADA` foi verificada, e não quer dizer o que parece.** É o destrave do
MODO VIVO do *spike*, não a correcção do ALTO; o commit que a repôs (`94a0d3e8`) escreve-o por extenso.
Procurado em `main`: o **veto de egress no caminho kimi/Moonshot NÃO existe** — o ALTO (a recusa por
`agent:"kimi"` deixa um plano no disco que o recibo não declara) continua aberto. Por isso o kimi foi
readmitido (PR #400) atrás de **linha própria** — `kimi-egress VETO EM MAIN — kimi readmitido na rota`,
que ainda não existe. Consequência dita: hoje o kimi continua recusado, mas a uma linha de distância.

**codex/gemini/kimi: instalados, protocolo confirmado, SEM LOGIN.** A matriz do plano dizia `codex ❌ n/d
(não instalado)` no Mac — **errado**: `@openai/codex@0.149.1`, `@google/gemini-cli@0.57.0` e
`@moonshot-ai/kimi-code@0.38.0` estão em `~/.local/node/bin` (fora do PATH da shell do circuito).
`codex exec --json` emite o JSONL certo e morre em **401**; `gemini --output-format json` pede método de
auth; `kimi -p` diz `No model configured`. Falta **um gesto do dono** (`11-LOGINS-LLMS.command`), não uma
instalação. Até lá: refutador local do Mac = Ollama; gemini no MooterBench = **n/d**.

**A6d — premissa falsa:** o `kimi-adapter.js` do bridge **não usa o CLI** — fala a API HTTP da Moonshot
(`api.moonshot.ai/v1`, `MOONSHOT_API_KEY`, `kimi-k3`). O CLI novo é outra superfície (`stream-json`,
`/login`). Não há schema a divergir; e `MOONSHOT_API_KEY` não está definida nesta máquina.

<!-- HUMANO:FIM -->