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
### [2026-08-17] COWORK — decisão do RISK do slack-spike: GO CONDICIONADO (a linha acima é o destrave mecânico)
- Decisor: Cowork/Fable 5 como maestro, sob delegação do dono (veto dele disponível). Fundamento: o ALTO de CÓDIGO aberto da kimi-egress (plano em disco não declarado no recibo, na recusa por agent kimi) vive EXCLUSIVAMENTE no caminho kimi/Moonshot. CONDIÇÃO DURA do GO: o spike exclui o kimi por construção — allowlist de motores do despacho SEM kimi, com teste que prova a recusa de agent:"kimi" — ANTES do 1º dispatch vivo. Com o vendor guardado fora da rota, o ALTO não é alcançável pelo caminho vivo. Quando a kimi-egress mergear de verdade, o kimi volta por decisão explícita, nunca por default.
- A demo declara isto ao estranho como feature: "Moonshot desligado até o veto de egress entrar em main" — custódia por enforcement, não por promessa.
- Restante fila do CC slack-spike inalterada: tokens (.env, caminho vem do Paulo) → exclusão kimi testada → MODO VIVO → ensaio do infeliz real → final-reviewer antes de push. Condição de sócio nº1 mantém-se: demo AGENDADA com estranho antes do merge.

---

<!-- frota Ed25519 — FECHADO 2026-08-25: 2 de 2 -->
### ✅ Frota em Ed25519 — **2 de 2 devices** (fechado 2026-08-25)

O item dizia "1 de 2, bloqueado no PC" desde 24/08. Medido hoje com
`readBeacons`: **`prova_frota: true`**, `verificados: 2`, `por inscrever: []`,
`rejeitados: 0`, os dois com `ancora: registo`. Os dois beacons assinam
`Ed25519-v1` (`bb8ed099…` / `1ec7458f…`) e ambos estao em
`50-fleet/trusted-devices.json`. O PC puxou o codigo e inscreveu-se entretanto;
ninguem fechou o item. A privada de cada device nunca sai da maquina — o vault
so carrega publicas, e e essa a diferenca face a `.owner.key`, que nunca viajou
e nao sobrevive a perda da maquina (`docs/strategy/DR_VAULT.md`).

Multi-user (chave por PESSOA acima da de device) e desenho, sem codigo:
`docs/strategy/IDENTIDADE_MULTI_USER.md`.

**Aberto, medido 2026-08-25 20:1x:** o beacon do `desktop-j26409q` tinha **66
min** (tecto: 30) — `morto` pela politica de frescura. Ou o loop la parou, ou o
publicador parou de empurrar.

<!-- suite do router — RESOLVIDO 2026-08-25 -->
### ✅ A suite `tools/router` ja conta sempre o mesmo (fechado 2026-08-25)

Era o `--test-force-exit`, que matava o reporter antes de ele drenar os
subtestes. Nao era flakiness nem descoberta (o script lista os ficheiros a mao).
O `fail 0` da observacao original tambem era artefacto — havia **3 falhas
verdadeiras** o tempo todo, cortadas junto com o resto. Sem o flag: 1160 / 1160 /
1160, `fail 0`, em 3-4 s. Detalhe no arquivo e no commit.

**O gargalo continua onde estava:** 1054 achados por triar, loop em pausa por
`human queue full (524/6)`. Nada dos sete PRs lhe tocou — foi tudo encanamento,
ainda que encanamento que estava a mentir.

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

### ⇄ COWORK → CC/PC · o SYNC foi enrolado (Mac, 25/08 17:17 BRT, `ad0deaed`/PR #396)

**PC: se o teu `SYNC.md` tem ~600 linhas está velho — puxa antes de escrever.** 604 → 212; a história saiu
para `docs/foundation/SYNC_ARCHIVE_2026.md` (path canónico do `AGENTS.md`), não foi apagada. Ficheiro
partilhado: confirmou-se que `desktop-j26409q` não lhe tocou desde a base comum (`git diff $(git merge-base
…)` vazio; o `-6` do `git diff main` era o main à frente). **Este aviso saiu depois do rolo** — o plano pedia
antes; fica como foi. Regra: SYNC é snapshot; quem passar das ~220 enrola e anuncia **aqui, antes**.

### 2026-08-25 (Mac · fecho 2, PR #394) · seis pendências decididas por delegação escrita

#390 mergido (`main @57fa1e44`). O item 2 caiu por **medição**: remover o `tier` do fable-5 e precificá-lo do SSOT fazia `decideAgent("reasoning.science")` devolver `claude-fable-5` (TES 3784) sem ninguém escrever `@fable` — o passo final do plano produzia a violação que o plano existia para evitar. O que segura o invariante hoje é a **ausência de preço**, e mais nada: não há exclusão de T5 dentro do `decideAgent`, e ele é ficheiro congelado. Entra um **arame** no CI (`precificavel-nao-rotavel`), não uma correcção. O stash de 24/08 não era resíduo — ~230 linhas que não existem em ref nenhum (PARIDADE entre devices + frescura de beacon remoto), preservadas em `mac/stash-paridade-2026-08-24`, stash **não** dropada; por isso o item 6 fica bloqueado (`--update-baseline` reescreve tudo e gravaria `stashes: 1`). Três colisões fundidas — a 3ª apareceu ao mover o archive órfão — com reconstrução verificada byte a byte. Adversário `codex`: **n/d**, não instalado nesta máquina; a refutação correu em Ollama local.

gate: 840 testes · 838 pass · 0 fail · 2 todo (pré-existentes) · higiene 26 pacotes / 141 topo · classify.js `427d8c0b` intacto

### 2026-08-25 (Mac · `mac/sistema-sync-2026-08-25`) · sistema & sync — o que estava a medir mal

Detive o **lock logico do SYNC** para este rolo (604 linhas -> orcamento).
Verifiquei antes que o unico outro device activo (`desktop-j26409q`) nao lhe
tinha tocado desde a base comum: o `git diff main <branch>` mostrava um falso
`-6` que era o main a estar a frente, nao a branch a apagar.

Tres coisas mediam mal, e as tres eram do instrumento, nao do objecto:

1. **A suite do router.** `--test-force-exit` matava o reporter: 889/977/979/
   1029/1000/1004 em corridas seguidas, e o `fail 0` era artefacto — havia 3
   falhas verdadeiras cortadas com o resto. Sem o flag: **1160 x3, fail 0**. As
   3 falhas eram `renderResolved` a chamar `renderTwoLine(ctx)` sem `opts`, a
   ler o `~/.mooter` REAL do dono.
2. **O painel.** "1 min ago" com ficheiro de 2 dias: o campo `via` (disco/remoto)
   existia nos dados e o painel **nunca o renderizou**. O rotulo passou para
   modulo testado — a unica coisa que o painel afirmava era a unica sem teste.
3. **Este ficheiro.** O cabecalho "verificavel" dizia `v1.24.1 / 2026-07-27`
   com a maquina em `1.49.4`: faltava o marcador de FIM da zona humana e o gerador
   lancava em **todas** as corridas, ha um mes.

**Refutado por medicao:** os 14 MB do `.git` do vault nao sao dos beacons — eles
sao 91% dos commits e **0,79 MiB** do pack; um clone fresco da 5,9 MB. E o beacon
do PC ja publica `conector` preenchido (a premissa do `null` estava velha).

**Veredicto `codex/agent-sync-fleet-v3`: APROVEITAR.** Enxertada numa worktree do
main de hoje (529 commits a frente): 56/56 na suite agent-sync, 1170 no router
sem regressao. Bloqueio unico: dois publicadores que nao se conhecem a escrever
no vault (`DR_VAULT.md` / `CANAL_DE_SYNC_ROADMAP.md`).

**Nao feito, declarado:** W4 (metrica-mae, quota por motor, kWh) e W5.1 (Ed25519
por utilizador). `codex` e `kimi`: **n/d** nesta maquina; refutacao em Ollama local.

gate: router 1160/1159/0 (x3, mesmo total) · cockpit 876/874/0/2 todo ·
varredura de segredos HIGH 0 · restauro do vault 0 falhas · classify.js `427d8c0b`

<!-- HUMANO:FIM -->
