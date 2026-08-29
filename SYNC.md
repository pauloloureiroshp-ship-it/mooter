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

Rolados para `docs/foundation/SYNC_ARCHIVE_2026.md` a 2026-08-29 — a secção já apontava para lá e o
SYNC é snapshot, não log. Frota em Ed25519 (2/2 devices) · suite `tools/router` estabilizada · e o resto.

### 2026-08-29 (Mac · CC · executar) · o conector passa a acusar a varredura que nao pode fazer

**T1 · `aviso_fabricacao` — o defeito de classe, fechado.** O guard A4 (`veredictoSemEvidencia`) exigia
evidencia ZERO para disparar; o job `job-mtea5wou-f2b3` tinha 304 das 1131 linhas de `router-execute.js`
injectadas, logo escapou-lhe por construcao — e respondeu "0 chamadores em TODO o repo". Regra nova (A6,
`seamless.js`): quantificador de varredura no goal **E** (`permissoes_diferenca.diferem===true` **OU**
lista efectiva vazia) ⇒ `sem_ferramentas`, `aviso_fabricacao` nao-nulo **no despacho** (antes de o modelo
responder) e prefixo `SEM FERRAMENTAS — NAO PUBLICAVEL COMO FACTO` no `collect`. A truncagem entra na razao.
Reutiliza a mecanica do A4 (prefixar, nunca substituir) e o mesmo campo — **taxonomia nova nenhuma**.
- ⚠️ **`sem_adversario` NAO EXISTE** (`grep -rn "sem_adversario" --include="*.js"` = 0 resultados). O que
  existe com essa mecanica e `veredictoSemEvidencia`/`veredicto_sem_evidencia`. Foi essa que se reutilizou.
- Decisao declarada: a regra **nao** e travada por nome de motor (`ENGINES_SEM_FICHEIROS`), porque a
  condicao do brief e a ausencia MEDIDA de ferramentas, nao quem esta a correr. Suite verde a confirmar.

**T2 · `tools/radar/vigia.mjs` — primeira ronda com rede, agendada.** 3/3 alvos alcancados (a VM do Cowork
nao tinha rede). Linha de base: ollama-catalogo **239**, openrouter-precos **396**, openrouter-docs **3**.
2.a corrida confirmou "sem delta" contra o snapshot. `launchctl` regista `ai.mooter.radar` com
`Weekday 1 / Hour 9 / Minute 0`; a maquina esta em **-03**, medido com `date` — logo 09:00 BRT.
- **Revisao de PR externo: 1 defeito corrigido.** Uma digestao vazia ou em erro virava snapshot valido e
  envenenava a linha de base (a ronda seguinte cuspiria "+239 modelos novos" falsos). Agora e `n/d` e o
  snapshot **nao** e tocado. **Nao existe rotina de pitch no launchd** (`ls ~/Library/LaunchAgents` +
  `grep -ril pitch` = 0) — o brief dizia "colado a rotina do pitch"; ficou autonomo.
- **O achado do kimi refuta-se, medido no JSON completo (396 modelos, nao 88).** Nao sao tres fontes para
  o mesmo modelo — sao modelos diferentes: `kimi-k3` **$3,00/$15,00** (o `pricing.js` **nao o lista**);
  `kimi-k2.6` **$0,95/$4,00** hoje, contra **$0,60/$2,50** no codigo (`pricing.js:116`) — o `$0,95/$4,00`
  do brief e o que o **comentario** ja dizia, nao o valor a correr; `$0,68/$3,41` do comentario aproxima
  `kimi-k2.7-code` (**$0,66/$3,40**). **`pricing.js` NAO foi tocado** — fora do enunciado desta sessao.

**T3 · a correccao confirmada por mim antes de escrever (L7).** O grep bate certo: `providerState` **e**
construido (`router-execute.harness.js:64,135`; `.test.js:794`) e `filterDegraded` (`:181-192`) esta
correcto. O que falta e o **PRODUTOR**: so `if (MOCK_PROVIDERS==='1')` (`:1067-1075`) o preenche, em
producao chega `undefined`, a `:662` aplica `|| {}` e nada e excluido. Corrigido no `ADENDO`, seccao A1.
- ⚠️ **Por corrigir, fora do meu alcance:** `claude/ARQUITETURA_ONBOARDING_E_SAAS_2026-08-28.md` (doc do
  Project) **nao existe neste checkout** — mantem o diagnostico errado. **Fica para o Cowork.**

**T4 (nao estava no enunciado — apareceu ao seguir a sequencia ate ao fim).** Ao preparar o deploy:
o conector instalado e **1.49.4**, o repo dizia **1.50.0**, e a ultima release publicada e **v1.51.0**.
Causa medida: o workflow `Version Sync` **falha em TODAS as tags** desde que a proteccao de ramo entrou —
run `33164279461` constroi o commit certo e leva `GH006: Protected branch update failed · 5 of 5 required
status checks are expected`. A v1.51.0 foi publicada com os cinco ficheiros a dizer 1.50.0, incluindo o
`manifest.json` que rotula o `.mcpb` que o utilizador instala. **O gate que existe para impedir deriva de
versao era a fonte da deriva.** Corrigido: abre um PR em vez de empurrar para `main` (+`pull-requests:
write`); os cinco ficheiros vao a **1.52.0**. O portao de entrega recusou o bump ate a entrega estar
declarada — **funcionou como devia**: `entregas-por-versao.json` declara `1.52: [seamless.js]` com dois
marcadores que provam o A6 no conteudo. `pack-mcpb.mjs` produz `mooter-v1520.mcpb` (61 ficheiros, 335
verificacoes OK) e o bundle **contem** o A6; o conector instalado **nao**.

**T5 · os quatro vermelhos do router eram testes a guardar contratos mortos — 1498/4 → 1503/0.** Zero
linhas de producao alteradas. `sparkline.test.js` fixava o `COLUMNS` e lia o `~/.mooter/preferences.json`
do dono real (com `statusline_line3:true` ligado nesta maquina) — a saida `opts.home` ja existia,
faltava usa-la. Dois `sub-tier` exigiam `gemma4:e4b`/`deepseek-r1-distill-qwen:14b` quando o
`classify.js` FROZEN tem `qwen2.5:3b`/`deepseek-r1:7b` e o comentario diz que a escolha **saiu** para o
`inject_context.js`. O `TUNED` exigia um bloco dentro do `classify.js` — **exactamente o que o freeze
proibe**; o tuner escreve hoje em `tuning-state.json`. Passa a afirmar uma garantia mais forte: correr o
tuner nao pode mexer no sha `427d8c0b`.

**Prova ponta-a-ponta do A6, job real, $0** (`job-mtebrb36-2af0`, Ollama local): `aviso_fabricacao`
nao-nulo no despacho e a entrega prefixada com `SEM FERRAMENTAS — NÃO PUBLICÁVEL COMO FACTO`.
**Flake da bridge nao reproduzido** em 4 corridas seguidas (1126/0 cada). PR **#432** aberto.

**Gates, sem disfarce.** T1 ✅ 8 testes novos, **7 falham em `main`** e 8 passam depois (`varredura.test.js`);
bridge **1102/0**. T2 ✅ ronda escreveu, `launchctl list` mostra o agente. T3 ✅ grep re-corrido por mim.
cockpit **941/0** (2 todo). classify.js `427d8c0b` intacto.
- ✅ **router 1503/0** — as 4 falhas eram pre-existentes (confirmado com `git stash`: 1498/4 identico
  com e sem a minha alteracao) e ficaram **corrigidas** em T5. A referencia "977/0" do brief e de outro glob.
- ⚠️ **Bridge deu 1101/1 numa corrida** e verde em todas as outras (4 corridas dedicadas a cacar o flake,
  1126/0 cada). **Nao reproduzido e nao identificado.** Dito porque aconteceu.
- `MP-LIGAR` e `MP-MOOTER` de 28/08 continuam **untracked**, por decidir. Nao os movi: o brief manda
  confirmar com o dono.


<!-- HUMANO:FIM -->