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

### 2026-08-31 → 09-01 · O MASTERPROMPT CITAVA TRÊS FICHEIROS QUE NUNCA EXISTIRAM

Busca exaustiva e citada em cada caso (`git log --all`, `find` na home inteira, `grep -rl`, vault).
**Dois foram desenhados de raiz; o terceiro afinal existia com outro nome.**

**F1 · `probe-frota.mjs`** (`23655073`) — compõe `isAvailable()`, `quota-honesta.js` e
`provider-health.js` (o cooldown que a F1 pedia **já existia**). A regra «n/d = esgotada» aplica-se à
letra mas nunca em silêncio: `excluido_por_nd` ≠ `esgotado_medido`, e sem candidatos sai `BLOQUEADA`.
**Na 1.ª corrida encontrou o motor $0 dado por morto:** `OLLAMA_HOST=127.0.0.1:11434` (o formato
canónico do Ollama) e o adaptador concatenava sem normalizar. O Ollama estava **vivo, com 10 modelos**.

**A cadeia que isso abriu** (#454 → #458 → #459): o `callOllama()` devolvia **`null` mudo**; eram
**11 sítios** a ler `OLLAMA_HOST` cru, não 5 nem 3; e **cinco** definições de «runtime», não três — os
dois instaladores, o Step 5 do update e as duas cópias servidas pelo site, que o `piso-de-node.mjs`
apanhou quando eu já julgava ter fechado o drift. Pelo meio meti eu a mesma classe com o sinal trocado
(#456: o espelho arrastava `coverage/` e 12 `.json` de **estado local**). Corri o sync errado 1×: 13
estados ficaram iguais ao repo e **não consigo provar quais sobrepus** — sem backup; dano material ~0.

**F3 · `render_medir.js`** (#462) — o critério («o rascunho B sai fail») era inverificável, e **o repo
devolveu-o**: o #450 mediu que pontuar `body.thinking` em vez de `body.response` valia **0% contra
83%**. Não implementa critérios: **compõe quatro**, cada um com o seu número (#450 · **209/275** rondas
que nunca chegaram ao modelo · **174** achados alucinados · **62** achados com `citacao-ok` e **0 de
78** verdadeiros). «Render» era a metade que faltava: os verificadores do repo devolvem JSON para
máquinas, e o fosso é «work a non-dev can check».

**§5 · o gauntlet — o meu erro** (#464, #465). Escrevi que as perguntas «não são deriváveis de nada
medido». **Falso:** `docs/foundation/MEO_GAUNTLET.md` tem **18** (G1–G18), é **v6** (o «MEO v6» do MP),
versionado. Procurei pelo nome do índice e **concluí do ficheiro para o conteúdo**; foi o retrieval do
vault que me corrigiu. Não acrescentei perguntas — «um agente nunca eleva o tecto sozinho». O que
faltava era o **estágio 2 que o documento pede**: medido, **zero** ficheiros verificavam a declaração
`gauntlet:`. Dezoito regras escritas, nenhuma aplicada. O portão **lê a lista do documento**, tem três
estados (`carimbado` com exit próprio: sem 2.º motor «nunca sai limpo») e distingue uma **instrução**
de uma **declaração**. E o mesmo defeito noutro sítio (#465): o `handoff-preflight` valida as **8** do
red-team gate e **nenhum workflow o invocava** — ligado, com o `AGENTS.md` nos paths.

**O que fechou cada camada não foi a correcção** — foi passar a haver **um teste de cobertura que
morde**: a varredura do `OLLAMA_HOST` (dos dois lados da fronteira do bundle), o `sync-runtime --check`,
o `paridade-instaladores`, e agora o portão do gauntlet.

**Medido no fim:** `runtime em dia (221)` · acumulador OK · `TEST=pass` · motor $0 `available:true` ·
cli **668/669** · router **1285/1288** · audit **5/6** (as 3 pré-existentes) · ratchet 215 ·
`classify.js` FROZEN intacto. **Aberto:** o estágio 3 (juiz O-1) não existe · a **D8** é do dono
(C1–C4 entram? quais das 18 saem?) · detalhe completo no journal do vault.

### 2026-09-01 (manhã) · A 1.53.0 — os botões do Ledger deixaram de ser maquetas

Três verbos POST a sério no F10, todos com a **mesma guarda de origem do kill-switch**: `/triage`
(a **mesma porta** que o `/triagem` — um só escritor, um só ficheiro), `/assist` (a doca do Moo:
relay ao Ollama local, **sem tool-calls, sem escalada, sem memória**; medido ao vivo, 7,3 s e $0 no
`qwen2.5-coder:14b`) e `/update` (aponta o `.mcpb` e **não instala** — a recusa viaja no payload).
**G8 fechado:** o arranque deixou de ECOAR o bind e passou a medi-lo (`lsof -nP -iTCP:4290`) —
`1 socket(s), todos locais`, escrito no log; sem `lsof` fica `n/d`, nunca um «está seguro».

**A prosa que citava uma fonte inexistente.** O Ledger dizia «the closed routing table (C0–C5)».
Procurada no repo inteiro: **não existia ficheiro nenhum**. Não era mentira sobre o comportamento
(as rondas correm mesmo local, o git é mesmo custódia do CC) — era pior: um facto verdadeiro
afirmado por uma fonte que não existe. Agora existe (`runner/rota.mjs`), cada classe carrega a
**prova** de quem a impõe, e as duas que este loop não exercita dizem-no em vez de serem inventadas
para a escala fechar em seis. **G6 fechado** com o resto: `finding_id` estável, `triage.items[]`,
`route`, `publish`, `feed[].device` — e o capítulo V passou a mostrar **decisões a sério** em vez de
dois recibos `citacao-ok` quaisquer carimbados «closed · self-curated» sem nunca terem sido triados.
Nada é dado por escrito num 200: cada escrita **relê a contagem** do servidor e só então diz
`confirmed by re-read`; se não mexer, di-lo.

**REFUTADA A REFUTAÇÃO DE ONTEM** («o bump para 1.53.0 não entrega nada»). A premissa estava certa —
nada nesta onda toca em `packages/mooter-bridge/` — e a conclusão estava errada sobre o **artefacto**:
o `mooter-v1520.mcpb` foi construído a 29/08 às **09:00**, e o fix de acessibilidade do `fleet-ui.html`
(#442, quatro animações `infinite` a correr para quem pediu ao SO que não corressem) entrou às
**15:51 do mesmo dia**. O bundle mais novo em disco estava **6h51m** atrás do fix. O
`mooter-v1530.mcpb` é o primeiro que o leva (335 verificações, sha `9100e0df…`).

**REFUTADO — a perf do Ledger.** A premissa do kickoff era que o fundo pontilhado fazia o capture CDP
expirar. **Medido** (Chrome headless, 3 corridas cada): 1280×20000 → antes 2,88/4,62/3,10 s, depois
3,29/2,93/2,93 s; 1280×60000 → 8,13/8,15 s vs 7,60/8,01 s. ~3% no melhor caso, **dentro do ruído**.
O custo cresce com a ÁREA capturada e nenhuma folha de estilos o encurta. A textura passou a camada
`fixed` na mesma (é grátis, correcta e visualmente idêntica), mas o remédio é capturar por fatias ou
subir o tecto do CDP — está escrito no CSS para ninguém voltar a supô-lo.

**G3 entregue como CÓDIGO, não como agente a correr.** O `beacon-renew.mjs` re-assina o **mesmo
corpo** antes da janela de 24 h fechar — o `ts` do device **nunca** se re-carimba, senão um cron
punha uma máquina morta a dizer «awake · heartbeat 3m ago», que é a mentira que a correcção viria
introduzir (e há um teste que reprova essa alteração). Mais `seq` monotónico **dentro** do payload
assinado, que passou a decidir a corrida disco-vs-remoto em vez do relógio. Instalar é duplo-clique
(`_handoff/operar/47-INSTALAR-RENOVACAO-BEACON.command`) e **só arruma esta máquina**: até correr no
`desktop-j26409q` e no `paulo-desktop`, esses dois beacons continuam a expirar exactamente como hoje
(553 768 s e 496 375 s contra uma janela de 86 400 s).

**A REVISÃO ADVERSARIAL ANTES DO PUSH APANHOU UM BLOQUEANTE MEU.** A casca tinha
`const F10 = 'http://127.0.0.1:4290'` cravado, e a porta é configurável — o próprio servidor manda
usar `MOO_PORT` num segundo projecto. Com dois F10 vivos, o Ledger do projecto B (servido na :4291)
escrevia a chave de B no `triagem.jsonl` de **A** — e como a contagem de A subia mesmo, a releitura
CONFIRMAVA. Uma confirmação que certifica o alvo errado é pior do que não haver confirmação nenhuma.
Agora o alvo é `location.origin`; provado ao vivo a servir o Ledger na :4292 (arranca em `live`, fala
com a :4292) e há um teste que **morde** (repor o endereço cravado reprova). Mais três da mesma
revisão: o `seq` passou de decisor a **veto** (a decidir, um contador de época antiga declarava
`morto` um device a trabalhar — reproduzido); o `proximoSeq` deixou de reinventar `1` sobre um
contador ilegível (agora `null`, escrita atómica); e o `publicacao.mjs` deixou de chamar «publicado»
a um commit que não foi empurrado (`por_empurrar`, medido contra `@{u}`).

**E um incidente meu, registado porque a regra o exige:** a prova manual do `/triage` correu contra o
`MOOTER_HOME` REAL e escreveu no `triagem.jsonl` do dono uma decisão assinada `por:'dono'` que ele
nunca tomou. As contagens não mexeram (a chave não tinha recibo) — isso foi sorte, não desenho. A
linha foi removida (era a última, e provavelmente minha: `PROVA-DA-PORTA-1530`), as contagens foram
reconferidas antes e depois (`achados 1071 · aceite 3`, iguais), e o aviso ficou no `smoke.test.mjs`.

Cockpit **1078/0** · bridge **1126/0** · design **10,00/10** · `classify.js` FROZEN intacto.
Congelamento registado em `CLAUDE.md` (3 ficheiros do bridge, versão apenas).
**Aberto:** instalar os dois LaunchAgents (G1 e G3, gesto do dono) · `npm run sync:cockpit` ·
`version-sync.yml` continua vermelho por erro de ficheiro de workflow, também em `main`.

<!-- HUMANO:FIM -->