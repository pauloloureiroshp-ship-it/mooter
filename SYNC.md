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
### ✅ Fechados a 25/08

Os fechados rolaram para `docs/foundation/SYNC_ARCHIVE_2026.md` a 2026-08-29 — a secção já apontava para
lá e o SYNC é snapshot, não log. Frota em Ed25519 (2/2 devices) · suite `tools/router` estabilizada.

> ⚠️ **O que está abaixo NÃO é história e não rola.** A primeira volta deste corte levou-o por engano e
> `packages/slack-spike/guardas.test.js` ficou vermelho no CI — que é exactamente o que ele existe para
> fazer. A linha de destrave e o `GO CONDICIONADO` que a autoriza vivem juntos de propósito: uma linha
> sozinha seria indistinguível de alguém a passá-la para o ficheiro para calar o gate.

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

### 2026-08-31 (noite) · O PROBE QUE NUNCA EXISTIU — e o motor $0 dado como morto

O SUPER MASTERPROMPT «NO TALO» v1 mandava correr `_handoff/duelo-2026-08-31/probe-frota.mjs` antes
de cada tarefa. **Não existia** — nem ele, nem o `render_medir.js` (F3), nem o `mapa-e-roadmap.md`
(as 10 perguntas da §5). Busca exaustiva e citada: `git log --all` em todo o histórico e todas as
branches · `find` por nome na home inteira · `grep -rl` no repo · vault. **Zero.** Parei e disse
(L7); o dono confirmou que nunca existiram e mandou desenhar de raiz.

**Feito** (`23655073`): probe + 19 testes. Não inventa sondas — compõe `providers/*.isAvailable()`
(nenhum consome quota), `quota-honesta.js` (separa saúde de quota) e `provider-health.js` (**o
cooldown que a F1 pedia já existia**). Mordida provada: 3 defeitos plantados → 1, 1 e 6 falhas.
A regra «n/d de quota = esgotada» da §2 é aplicada à letra mas **nunca em silêncio**:
`excluido_por_nd` é campo distinto de `esgotado_medido`, e sem candidatos a etapa sai `BLOQUEADA`
em vez de eleger o mais barato — o *viés do default barato*.

**O achado da 1.ª corrida:** `OLLAMA_HOST=127.0.0.1:11434` (sem esquema — o formato canónico do
Ollama) e `ollama-api.js:161` concatenava sem normalizar. O Ollama estava **vivo, com 10 modelos**.

**Fecho (22:55–23:40 SP) · o motor $0 volta a estar operacional.** Pior do que a sonda: `callOllama()`
devolvia **`null` sem razão nenhuma** — o `catch` engolia o `Failed to parse URL`, e quem o lia concluía
«o modelo não respondeu». O motor $0 falhava **mudo** e a leitura caía para motor pago sem sinal. **E
eram SETE sítios, não cinco** — a minha lista ficou a cinco porque o `grep` parou no 1.º ecrã; nos
outros seis, `new URL(…)` lançava `Invalid URL`. Um só helper: `ollama-host.js` (`8788e1d8`,
`61efb446`), e **10 testes, sobretudo a varredura de COBERTURA**, que falha se alguém voltar a ler
`process.env.OLLAMA_HOST` sem normalizar. Suites: router **1231/1234** · cockpit **948/0** · audit
**5/6** — as 3 falhas **pré-existentes**, verificadas em `HEAD` limpo.

**Update corrido** (#454) — e **a correcção continuava morta**: o Step 5 usava um glob **não
recursivo** (204 da raiz; os 17 de `providers/`+`forecast/`+`hooks/` fora). Cinco ✓ com o
`ollama-api.js` velho, em silêncio — o ficheiro velho não requer o novo, logo nem erro havia.
**Corrigido** (#455): `sync-runtime.js` é a definição única do runtime, no padrão do `sync-hooks.js`;
o Step 6 ganha esse gate — **presença de um passo de sync não é prova de cobertura**. O `install.sh`
já sabia desde a Wave 61: o defeito era instalador e updater terem duas definições de «runtime».
**E depois eu fiz a mesma classe de erro, com o sinal trocado** (#456): o espelho arrastava
`coverage/` e **12 `.json` de estado local**, entre eles o `router-tuning.json` que o backtest escreve
**no runtime** — copiá-lo do repo por cima desfaz o tuning em silêncio. `git ls-files` resolve (23 →
9); sem git **desliga** em vez de falhar fechado. Corri o sync errado 1×: 13 estados ficaram iguais ao
repo e **não consigo provar quais sobrepus** (sem backup); dano material ~0.

**A onda do install** (#458, #459) fechou o resto. Eram **cinco** definições de «runtime», não três:
os dois instaladores, o Step 5, e as **duas cópias servidas pelo site** — que o `piso-de-node.mjs`
apanhou quando eu já julgava ter fechado o drift. Todas passam por `sync-runtime.js`. Cai a cópia
cega de `*.json` (um `package.json` no router governa a resolução de módulos daquela árvore) e o
espelho deixa de recriar a 4.ª cópia dos hooks ligados. **O portão que faltava:** os três ficheiros
pediam «keep in lockstep» *em comentário* e ninguém verificava — `paridade-instaladores.test.js`
falha se as listas divergirem, se alguém voltar a copiar à mão, ou se o piso de Node se separar.
E os últimos **4** sítios do `OLLAMA_HOST` (`packages/cli`, FROZEN, allowlist no mesmo commit):
a regra não é importada de `tools/` porque o bundle não arrasta código de fora — as duas cópias são
ancoradas na **mesma tabela de casos**, e alterar um caso reprova os dois lados. O `npm test` do
audit deixa de escrever num ficheiro **versionado**: uma suite não pode alterar o estado que mede.

**Medido:** `runtime em dia (221)` · acumulador OK · `TEST=pass` · motor $0 `available:true` · cli
**668/669 (0 fail)** · router **1261/1264** · audit **5/6** (as 3 pré-existentes) · ratchet 215.
**Aberto:** `retrato-mapa.test.js` **flaky** (FROZEN; corrigir sem reproduzir é adivinhar) ·
`coverage/` e 9 cópias de hooks ficaram no runtime (o `cert-guard` bloqueia `rm -rf` sob `$HOME` e
não contornei) · **F3 inverificável e §5 inexequível** — nada nesta onda desbloqueia isso.
Detalhe no journal do vault.

### 2026-09-01 (madrugada) · O MOO LEDGER — e os números saem do HTML

A v4 do Moo Pilot chegou dogfoodada e com o instantâneo **cravado no HTML** (2094 citações,
$24.29 de padrão, 16 GB de VRAM): verdadeiros no minuto em que foram escritos, mentiras silenciosas
no dia seguinte. Adoptada ao contrário — `moo-ledger-shell.html` é uma **casca sem um número
dentro** e `runner/build-ledger-snapshot.mjs` mede-os (ledger · triagem · beacons · `git worktree
list` · eta-index · portões do `autopilot`); sem payload a página **diz-o e pára**. F10 ganha
`GET /ledger`; o `/panel` v1 fica **intacto** (vista do operador, com os controlos), guarda de rota
nos dois. **26 testes**, metade a correr a casca contra um DOM de bolso. Cockpit **976/0** · router
**1126/0** · design **10,00/10** (o `SUPERFICIES_UI` não tinha a vista do dono: entrou e mordeu,
10,00 → 7,27). Onde **"sem medição = null"** doeu: `vram_total_gb` → `n/d`, e a pastagem mostra
**1 device, não 3** — os recusados viajam em `fleet_rejected` **com o motivo**. G1 entregue como
molde. **PR #461; detalhe no journal do vault.**
**REFUTADO — o bump do conector para 1.53.0:** a `FILES` do `pack-mcpb.mjs` não leva uma única skill
(vão por `/mooter-update`) e nada nesta onda toca em `packages/mooter-bridge/`. Fica em **1.52.0**.
**Aberto:** `npm run sync:cockpit` depois do merge (espelho desta máquina **vazio**, pré-existente) ·
instalar o LaunchAgent (gesto do dono) · **`version-sync.yml` vermelho por erro de ficheiro de
workflow**, também em `main` e desde antes desta onda — a rede sob o protocolo de release está caída.

<!-- HUMANO:FIM -->