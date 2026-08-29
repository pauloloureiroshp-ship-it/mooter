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

### 2026-08-29 (Mac · CC · executar) · o conector passa a acusar a varredura que nao pode fazer

Detalhe por extenso no PR **#432** e no journal `~/paulo-vault/10-projects/2026-08-29-mac-cc-executar-*`.

**T1 · `aviso_fabricacao` (A6).** O guard A4 exige evidencia ZERO; o job `job-mtea5wou-f2b3` tinha 304 das
1131 linhas injectadas, logo escapou-lhe **por construcao**, e respondeu "0 chamadores em TODO o repo".
A condicao estava amarrada a QUANTIDADE de evidencia em vez de a RELACAO entre a evidencia e a pergunta:
contexto injectado e uma amostra, um quantificador de varredura e uma afirmacao sobre o universo.
Regra nova: quantificador no goal **E** (`diferem===true` **OU** efectivas vazias) ⇒ `sem_ferramentas`,
`aviso_fabricacao` nao-nulo **no despacho** e prefixo `SEM FERRAMENTAS — NÃO PUBLICÁVEL COMO FACTO` no
collect. Reutiliza a mecanica do A4 e o mesmo campo. ⚠️ **`sem_adversario` NAO EXISTE** (grep = 0); a
regra com essa mecanica e `veredictoSemEvidencia`. **Prova ponta-a-ponta, job real, $0**
(`job-mtebrb36-2af0`): recibo acusou antes de o modelo responder, entrega saiu prefixada.

**T2 · `tools/radar/vigia.mjs`.** 1.a ronda com rede: 3/3 alvos, base 239/396/3. `ai.mooter.radar` no
launchd (segunda 09:00; maquina em -03, medido). **1 defeito corrigido na revisao:** digestao vazia ou em
erro virava snapshot e envenenava a base. **Nao ha rotina de pitch no launchd** (grep = 0). **Achado do
kimi refutado** com o JSON completo (396 modelos, nao 88): nao sao 3 fontes, sao **modelos diferentes** —
`kimi-k3` $3,00/$15,00 (o `pricing.js` nem o lista); `kimi-k2.6` $0,95/$4,00 hoje contra $0,60/$2,50 no
codigo. **`pricing.js` NAO tocado** — fora do enunciado.

**T3 · o orfao 1 nao e o filtro, e quem o alimenta.** Grep re-corrido por mim (L7): `providerState` **e**
construido (`harness.js:64,135`; `.test.js:794`) e `filterDegraded` (`:181-192`) esta correcto. So
`if (MOCK_PROVIDERS==='1')` (`:1067-1075`) o preenche; em producao chega `undefined`, a `:662` aplica
`|| {}` e nada e excluido. **Falta o PRODUTOR.** Corrigido no `ADENDO` A1.
- ⚠️ **Fora do meu alcance:** `claude/ARQUITETURA_ONBOARDING_E_SAAS_2026-08-28.md` nao existe neste
  checkout e mantem o diagnostico errado. **Fica para o Cowork.**

**T4 · o gate de versao era a fonte da deriva** (nao estava no enunciado; apareceu a caminho do deploy).
Conector instalado **1.49.4**, repo **1.50.0**, ultima release **v1.51.0**. Run `33164279461`: o
`Version Sync` constroi o commit certo e leva `GH006: Protected branch update failed · 5 of 5 required
status checks` — **falha em TODAS as tags** desde que a proteccao de ramo entrou. A v1.51.0 foi publicada
com os cinco ficheiros a dizer 1.50.0, incluindo o `manifest.json` que rotula o `.mcpb`. Corrigido: abre
PR em vez de empurrar para `main` (+`pull-requests: write`); os cinco vao a **1.52.0**. O portao de
entrega recusou o bump ate a entrega estar declarada — **funcionou como devia**. `pack-mcpb.mjs` produz
`mooter-v1520.mcpb` (335 verificacoes OK) e o bundle **contem** o A6; o instalado **nao**.

**T5 · os 4 vermelhos do router guardavam contratos mortos — 1498/4 → 1503/0**, zero linhas de producao.
`sparkline.test.js` fixava o `COLUMNS` e lia o `~/.mooter/preferences.json` do dono real (`opts.home` ja
existia, faltava usa-la). Dois `sub-tier` exigiam modelos que o `classify.js` FROZEN nao produz — a
escolha **saiu** para o `inject_context.js`, de proposito. O `TUNED` exigia um bloco DENTRO do
`classify.js`: exactamente o que o freeze proibe; o tuner escreve em `tuning-state.json`. Passa a afirmar
o inverso, que e mais forte: correr o tuner nao pode mexer no sha `427d8c0b`.

**Gates.** bridge **1102/0** · cockpit **941/0** · router **1503/0** · `classify.js` `427d8c0b` intacto ·
`varredura.test.js` **7/8 falham em `main`**, 8/8 passam depois.
- ⚠️ **Flake da bridge: 1 vermelho em 9 corridas** (5 dedicadas, 1126/0 cada). **Nao reproduzido, nao
  identificado.** Fica dito, nao fica resolvido.
- ⚠️ **O corte deste SYNC levou por engano a linha de destrave do `slack-spike`** e o
  `guardas.test.js` ficou vermelho no CI — que e para o que ele existe. Restaurado verbatim; a decisao
  (`GO CONDICIONADO`) e a linha continuam a viver juntas.
- `MP-LIGAR`, `MP-MOOTER`, `KICKOFF` e `18-CC-PERFEITO.command` continuam **untracked**, por decidir.


<!-- HUMANO:FIM -->