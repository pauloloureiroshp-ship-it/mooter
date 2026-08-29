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

### 2026-08-27 (Win · CC · design) · o portão nasceu cego, e o 3,41 era 1,5 de nada

O pacote `mooter-brand-v2.0.0` aterrou em `design/`. A onda O0 não era copiar ficheiros: era pôr um
portão a morder — e o portão que veio no pacote **não mordia**.

**`marca-unica` dava 1,5/1,5 — «um só desenho» — com 8 cópias da vaca vivas no repo.** `.svg` não
estava em `EXT_TEXTO`, o walker nunca devolvia um SVG, e a linha seguinte filtrava por
`extname(f) !== '.svg'`: descartava 100% do que recebia (2783 ficheiros, 0 svg, `variantes: []`
**sempre**). E pior — `MOO_REPO` apontado a uma pasta sem superfícies punha as três verificações
pesadas a `n/d`, tirava-as do denominador, e o índice **subia de 3,41 para 8,75 com `--ci` a sair
0**. O portão pontuava melhor quanto menos via.

Seis defeitos corrigidos com o número que os justifica: `numero-honesto` marcava `savings_usd`
(coluna D1 viva) e os comentários que registam a retirada — incluindo o teste
`expect(src).not.toContain('up to 90% less cost')`, a prova da decisão marcada como violação dela —
**243 achados, ~2 reais**; o regex de `@keyframes` engolia o próprio ficheiro gerado e fabricava 45
propriedades que escondiam **3 violações reais**; e `moo-tokens-build.mjs`, o comando publicado no
README, era um **no-op silencioso** (`file://${process.argv[1]}` nunca coincide com `import.meta.url`).

**Índice: 3,41 → 3,18 → 5,68 → 6,36 → 8,18 → 9,09.** A descida inicial é a correcção (o 3,41
contava 1,5 pontos de uma verificação cega); o resto é trabalho. O **`--ci` está LIGADO** no limiar
8 — o limiar nunca se moveu, foi o índice que subiu até ele. **53 testes de mordida.**

**A gramática está nas superfícies.** Cartucho, grelha de 8px, coluna de margem e hairlines em vez
de caixas, em 10 folhas: home (DES. 001), methodology (002), packs (003), compare (004), commands
(005), cockpit (006), under-the-hood (007), workflow (008), moo-pilot (010), cockpit.html (011). As
margens são **contadas do próprio ficheiro**, nunca escritas à mão. Os 2 cockpits deixaram a paleta
própria — o `moo-pilot-shell` usava `--accent: #2b5ede`, **azul**, contra a rosa da marca.

**Superfície pública sem um único claim de poupança.** Saíram: `One bill is 47% smaller` (corpo
gigante na home, sobre preços de tabela em seis prompts inventados), `~30% less` ×2,
`{savings_pct}% saved vs all-Opus` nos packs, três cifras fabricadas na API `analyse`, e o cartão
`Est. savings ~$8–15/day` do dashboard.

⚠️ **Recusei um 10,00.** Separar «publicar» de «mostrar a quem entrou» é defensável — mas o índice saltou para a nota cheia no mesmo minuto em que mudei a régua, e a decisão de 27/08 nomeia isso. A verificação vale **metade** enquanto houver 15 estimativas na shell autenticada; contadas e impressas, não escondidas.

gate: design **53/53** · landing **219/219** · cockpit-runner 943/941/**0** · cockpit-invariants 215/4 (baseline) · auditor visual: contraste **178 → 30** · PR #416, CI verde


---

### 2026-08-28 · v1.51.0 EM PRODUÇÃO — a onda que começou em design e acabou na tese

**29 commits, 100 ficheiros, +11.607/−1.494. PR #416 fundida, tag `v1.51.0`, mooter.ai a servir.**

**Retirado por não ser verdade — e verificado ao vivo no site depois do deploy:**
`/privacy` afirmava «Differential privacy noise (ε=1.0)» **com visto verde**, e não há
implementação nenhuma no repo (o único resultado é `quality.ts:32` — «lands in Wave 31»). O
`k-anonymity ≥50` **ficou**, porque é real (`hub/routes/federated.js:22`, com testes que plantam
49 e 60) e agora diz onde. `/packs/[id]` renderizava **«Savings vs Opus 89%»** — um dos cinco
números mortos — a um clique da página que publicava a ressalva. O seed público trazia **805
instalações** contra os **2 developers** que `/api/community/pulse` devolve ao vivo. `/workflow`
gritava um **160×** que dividia um medido por um estimado.

**A latência, que ninguém tinha medido apesar de o medidor existir no repo:**
`classify()` **0,001 ms** p50 (5.000 chamadas) · o hook em prompts reais **121,6 ms** p50
(660 amostras do `decisions.log`). O `14ms` publicado em três ficheiros não era nenhum dos dois.

**O site não abria em telemóvel.** `moo-ui.css` tinha **uma** media query
(`prefers-reduced-motion`) e **zero** breakpoints de largura. `/compare` media **901px** num ecrã
de 375. Agora **375px em todas as rotas**, com navegação (`<details>` nativo, sem client state).

**No Windows não havia caminho nenhum.** O one-liner `irm|iex` imprimia «private friends-beta» e
saía **0**; `install-windows.ps1` era **404**; `mooter` dava `ENOENT` porque `where claude` devolve
duas linhas. Smoke real: `claude.cmd → cmd /d /c → 2.1.224`, exit 0.

**A escada de fallback tinha a lógica certa e memória nenhuma.** `resolveFallbackChain()` sempre
existiu; `execute()` fazia `deps.providerState || {}` e **nada jamais preencheu esse campo**.
`provider-health.js` dá-lhe memória **com decaimento** (sem isso vira lápide) e default
**«disponível», não «morto»** (o custo dos dois erros não é simétrico). O `<router-hint>` passa a
dizer quem está em baixo e até quando.

**E o achado que muda a tese: os tokens sempre estiveram no disco.**
O projecto publicou meses a fio «no tokens are logged» — verdade sobre a telemetria do Mooter,
**falsa sobre a máquina**. `~/.claude/projects/**/*.jsonl` tem `message.usage` completo. 282
transcripts; só nos 40 mais recentes, **7,57 mil milhões de tokens de cache lido**, que o modelo
de poupança ignorava por inteiro.

⚠️ **A chave de atribuição não é `session_id`.** Medido antes de escrever código: 387 prompts ↔
9.692 chamadas = **25 por prompt** — o defeito exacto que matou o `0%` («o denominador eram
chamadas Bash, não prompts»). Um adversário noutro fornecedor (codex) apanhou-o. A chave é a cadeia
**`parentUuid`** até ao turno humano: **318 turnos ← 9.420 chamadas, 0 órfãs**.
`mooter recibo` imprime-o, e a etiqueta é `EQUIVALENTE A PREÇO DE TABELA`, **nunca** `custo` — os
tokens correm dentro de uma subscrição de valor fixo, e chamar-lhe despesa seria a poupança
fabricada virada ao contrário. Há um teste que falha se a palavra voltar.

**Dois bugs que esta onda criou e fechou, ambos registados:** `provider-health.js` gravou as falhas
SIMULADAS dos testes no `~/.mooter` **real** (3.ª ocorrência desta armadilha no repo) — guarda posta
com mordida; e acrescentei um sítio ao piso de Node sem o pôr no `paths:` do CI, o que o
`piso-de-node.test.mjs` apanhou por mim.

**E um que desbloqueou o repositório inteiro:** `F5/2` em `autopilot.test.mjs` **dependia da hora
do dia** — o fixture usava base 30, e a queda só dispara depois das **08:00** na hora do dono.
Estava vermelho no `main` e a protecção do ramo recusava **todos** os merges. Provado com o relógio
fixado à meia-noite; fixture determinístico, detector intacto.

gate: **12 workflows verdes, zero falhas** · classify.js sha `427d8c0b` intacto · design **53/53**,
índice **9,09** · landing **219/219** · CLI **30/30** · router **1217** · cockpit **943, 0 fail** ·
piso de Node **14 sítios** (era 13) · instaladores byte-a-byte · `packages/` com 3 linhas
registadas na allowlist do `CLAUDE.md` no mesmo PR

**Aberto:** as 15 estimativas de poupança na shell autenticada (decisão de produto do dono, e a
verificação 3 do portão dá metade enquanto lá estiverem) · o cruzamento recomendação↔custo casa
**22 de 710** turnos, porque o `decisions.log` só tem sessão em 1.350 das 1.916 linhas e a maioria
dos transcripts é anterior · `/methodology` ainda grita **91%** numa calculadora hipotética ·
o site ainda tem duas gramáticas visuais (8 folhas novas, 8 antigas, 1 scaffold)


---

### 2026-08-28 (tarde) · A GRAMÁTICA NAS 17 FOLHAS — e o que apareceu ao medir

**PR #419 e #420 fundidas, em produção. O site deixou de estar partido ao meio.**

Antes: **8 de 17 rotas** na gramática do Papel Milimétrico, 8 na antiga com
`<Card>` e `<Eyebrow>`, e a `/spawn` em scaffold cru. Agora **17/17**, cartuchos
DES. 001–019, zero números duplicados.

Nove agentes em paralelo, ficheiros disjuntos. **Nenhum** tocou em `globals.css`,
`design/tokens/`, `design/tools/` ou no `Cartucho` — quando precisaram,
reportaram em vez de editar.

**As margens são contadas, não escritas.** `{STEPS.length}`,
`{pack.models.length}`, `{entries.length}` — acrescentar uma entrada ao array
move a cota sozinho. O agente do `/changelog` foi mais longe: `loadEntries`
devolvia `Entry[]` e a lista de reserva era indistinguível da real, portanto a
margem **não tinha como** dizer a verdade sobre a proveniência. Passou a devolver
`{ entries, ao_vivo }`.

⚠️ **O defeito grande apareceu ao medir, não ao planear.** 55 margens renderizadas
ao público, **38 em PORTUGUÊS**, num site inteiramente inglês. Um agente
levantou-o em vez de decidir sozinho, e tinha razão: é o defeito que `e0187e35`
corrigiu na home, e que ficou escrito em `canonical-metrics.ts:97-106` — «uma
ressalva que o leitor não entende não é uma ressalva; é ruído que faz duvidar de
tudo o resto na página». Aqui era pior, porque a margem é **onde vive a
honestidade**: `não é medição`, `não é média da manada`, `números do fornecedor
— não medidos aqui`. Numa língua que o leitor não lê, a honestidade é
decorativa. **55/55 em inglês**, sem suavizar nenhuma, zero expressões tocadas.

⚠️ **E depois o mesmo defeito outra vez, um elemento acima.** Os 17 cartuchos
diziam `MOOTER · A PRIVACIDADE · DES. 014`. Apanhei-o **a olhar para o site
depois do deploy** — o aferidor que escrevi conta cartuchos, não lê o que eles
dizem. Um instrumento que mede a presença não mede a correcção. PR #420.

**Telemóvel medido em build de PRODUÇÃO, rota a rota: 17/17 com
`scrollWidth === 375`.** A `/methodology` media 380 — terceira ocorrência do
mesmo `min-width: auto` nesta landing (os `input[type=range]` a 356px, com o
cursor a transbordar). Colapsar para uma coluna não chega quando a coluna se
recusa a encolher.

gate: design **53/53** · índice **9,09** (limiar 8, inalterado) · landing tsc
limpo · **219/219** · 8 workflows verdes em cada PR · zero ficheiros partilhados
tocados

**Aberto:** dois `<Card>` em componentes irmãos que ficaram fora de âmbito por
instrução — `compare/MultiSessionTable.tsx` e `rankings/RankingsExplorer.tsx`
(este tem excepção declarada no portão, a única cifra de poupança do projecto).
São as duas últimas superfícies com caixas · o interior do `RankingsExplorer`
continua no vocabulário antigo (pills de raio 999, faixas tingidas) e vale uma
folha de serviço própria.


---

### 2026-08-28 (fim) · AS CAIXAS ACABARAM — e três instrumentos meus estavam cegos

PRs **#422** e **#423** fundidas, em produção. O `<Card>` da landing ficou **sem
um único importador**.

| medido na superfície de marketing inteira | |
|---|---|
| `<Card>` | **0** |
| fundos tingidos | **0** |
| pílulas `999px` em `/rankings` (produção) | **0** |

**RankingsExplorer** — a pílula do TierBadge virou legenda de folha de desenho
(quadrado de amostra 6×6 na cor do tier, sem raio, sem fundo). As pílulas de
categoria deixaram de ser rosa: um estado activo não é um CTA. A faixa verde da
poupança saiu — e a razão vale mais do que o gesto: **a tinta verde aparecia
também no ramo NÃO-medido**, ou seja insinuava um sinal que não existia. Tirá-la
é menos sinal falso, não menos sinal. A cifra ficou intacta atrás de
`seed.savings.measured &&`, com a sua excepção declarada.

A linha recomendada passou a `box-shadow: inset` e não a `border` na `<tr>`, por
uma razão medida: com `border-collapse: collapse` o empate resolve-se por
precedência célula > linha (CSS 2.1 §17.6.2.1), e o `<th>` comia a régua de cima.

⚠️ **Três instrumentos meus estavam cegos, e cada um mentiu de maneira diferente.**

1. **O aferidor contou 1 `<Card>` no `MultiSessionTable` e havia 5 caixas.** Três
   faixas tingidas e um painel com fundo, borda e `borderRadius: 12` eram caixas
   na prática sem usarem o componente. Um grep pelo componente apanha uma em
   cinco. Foi o agente que mo devolveu.
2. **O `grep -c` disse-me que o `/compare` ainda tinha rosa em produção.** Conta
   LINHAS, e o HTML servido é uma linha só. A página estava limpa; a régua é que
   não sabia contar. Mas a busca que fiz para perceber isso mostrou o que eu não
   procurava: os dois selectores do `/methodology` marcavam o seleccionado com um
   **azulejo rosa** — o mesmo padrão, na folha ao lado, no mesmo dia (#423).
3. **O portão não vê `borderRadius:` nem `background:` em JSX** — só a sintaxe
   CSS. Há **45 raios em JSX** que ele nunca olhou. Foi por isso que estas
   superfícies sobreviveram à onda anterior com o índice a 9,09.

Não aleguei o portão. O comentário dele (`moo-design-check.mjs:645-648`) diz que
unificar a escala «é trabalho de desenho, com o dono, e tem de vir com a lista de
sítios a mudar — não com um `Set` novo», e alargá-lo produziria 45 achados de uma
vez, que é o erro que esta onda já cometeu (78 não-problemas, revertidos).

**A distinção que ficou desenhada, e que não atravessei:** restam 5 ficheiros com
rosa tingido — `CockpitShowcase`, `CmdKPalette`, `TwoTerminalDemo`,
`WorkflowPipeline`, `ConductorVisual`. Nenhum é chrome de folha: são **maquetas
do produto**. A folha é o desenho; a maqueta é o objecto desenhado. Uma prancha
técnica de um automóvel não pinta o automóvel de cinzento para combinar com o
papel.

gate: tsc limpo · **219/219** · design **53/53** · índice **9,09** · 7 workflows
verdes em cada PR. Produção: `/rankings` e `/compare` a **375px**, tabelas a
rolar dentro de si.

**Por decidir (não decidi sozinho):** `landing/components/Card.tsx` ficou órfão,
zero importadores — apagá-lo é teu · duas usages de rosa no `RankingsExplorer`
que são SINAL e não decoração: `T5: var(--color-accent)` (não existe
`--color-tier-5`) e o texto «✦ mooter routes here» · a escala de raios, que o
portão aceita larga de propósito.


---

### 2026-08-28 (noite) · O T5 E A ESCALA DE RAIOS — as duas por medição

PR **#426** fundida, em produção. `mooter.ai` serve `--color-tier-5: #D9A441` e
**zero** ocorrências de `border-radius:12px`.

**O T5 usava a marca.** `RankingsExplorer:40` tinha `T5: var(--color-accent)` —
rosa é para o `?` do wordmark, as cotas e o CTA, e usar a marca para dizer
«tier» confunde *o modelo mais caro* com *a acção principal*. Não havia
`--color-tier-5` para usar.

A cor saiu de uma medição, não de gosto. Critério: o T5 aparece sempre ao lado
dos outros quatro, logo o que conta é a **menor** distância perceptual dentro de
{T0..T3,T5}. Os quatro actuais têm entre si um mínimo de **dE 29,8** (T1/T2).
Seis candidatos em CIELAB; **âmbar `#D9A441` deu dE mín 43,8** — separa-se melhor
do que o pior par da própria rampa —, contraste 8,80 e dE 50,0 ao accent.

E há uma razão de desenho por cima da medição: **não existe T4.** O T5 é opt-in
via `@fable` e nunca é auto-rotado, portanto não é um quinto degrau da escada —
e a cor diz isso ao ser o único tom quente. Lê-se como estando *fora* da rampa.

⚠️ **Achado colateral, com número e sem acção:** os quatro tiers de **papel**
estão todos abaixo de AA e nunca foram medidos porque nunca foram declarados —
t0 **3,53** · t1 **4,42** · t2 **4,47** · t3 **4,13**. Não lhes toquei: escurecê-los
é mexer na paleta clara inteira, que serve impressão e superfícies que não vi.
Os dois pares do T5 entram já a passar, para não acrescentar dívida.

**A escala de raios: o código não estava errado.** O portão tinha um `RAIO_OK`
de 15 valores escrito à mão contra os 5 do token, e o comentário dizia que
unificar «tem de vir com a lista de sítios a mudar — não com um `Set` novo».

A prova de que a **escala** é que falhava estava na própria saída do sistema: o
`moo-ui.css` **gerado** trazia `border-radius: 2px` no anel de `:focus-visible`,
cravado no gerador, com o 2 fora da escala. Cinco degraus cujo mais pequeno é 6
não descrevem chrome real — um raio de 6 numa barra de 3px está errado.

Medido antes de decidir: **166 ocorrências em 24 ficheiros**, com 8 (44×),
4 (26×) e 7 (22×) no topo. Acrescentados `hairline 2`, `tight 4`, `panel 8` — e
**não o 12**, para não virar uma rampa de 2 em 2. Depois os **54 sítios**, cada
empate decidido a olhar para o elemento: `3→2` nas barras finas (com 4 a barra
virava estádio), `3→4` nos balões de conversa (têm área, e são um par
espelhado), `12→10` num halo com `inset:-1px` (concentricidade, não tamanho),
`12→14` no `.term` (tem barra de título e corpo — é uma janela).

**E o portão deixa de poder divergir.** `RAIO_OK` deriva de `T.radius`, e a
regex passa a ver **as duas sintaxes** — só via `border-radius: Npx`, e
`borderRadius: 999` em JSX passava invisível. Foi assim que uma pílula
sobreviveu a uma onda inteira com o índice a 9,09.

4 mordidas novas, e a que interessa: **tira `panel: 8` do TOKEN, sem tocar no
portão, e exige que ele passe a acusar quem usa 8.** Se alguém voltar a pôr um
`Set` paralelo, esse teste falha.

gate: design **57/57** · índice **9,09** · contraste **22 pares**, todos ≥ 4.5 ·
reconciliação token/produção **0 divergem, 30 iguais** · landing **219/219** ·
cockpit-runner 943, **0 fail** · 9 workflows verdes

**Aberto:** os 4 tiers de papel abaixo de AA (acima) · o `linguagem-visual` só
varre 5 superfícies + `design/` — os `.tsx` da landing nunca estiveram no âmbito,
e há lá raios que ninguém mede. Alargar o âmbito precisa da lista de sítios
primeiro, que é a regra que esta onda acabou de honrar.


---

### 2026-08-28 (fecho) · O PORTÃO PASSA A VER OS `.tsx` — 10 ficheiros → 123

PR **#428** fundida, em produção. O último buraco de âmbito, e o maior.

A `linguagem-visual` varria 5 superfícies HTML/CSS mais `design/`. **Os `.tsx` da
landing nunca estiveram na lista** — e não era só a regex que não via
`borderRadius:` em camelCase: os ficheiros nem eram abertos. Foi assim que uma
pílula de raio 9999 sobreviveu a uma onda inteira com o índice a 9,09, e como o
T5 pôde usar a rosa da marca sem ninguém dar por isso.

**A lista de sítios veio primeiro, que era a regra.** O próprio portão exigia,
por escrito, que alargar viesse «com a lista de sítios a mudar, não com um `Set`
novo». Medidos antes de lhe tocar: **32 raios fora da escala em 13 ficheiros**,
0 curvas, 0 barras. (As 3 «curvas» da primeira contagem eram falsos positivos
meus — o portão aceita `.2,.8,.2,1` e `0.2, 0.8, 0.2, 1` como a mesma curva e o
meu script só tinha a forma longa.)

Três empates que valem a pena guardar:

- **`layout.tsx:489`, calha de 6px, `3 → 2` e não 4** — o browser limita o raio a
  metade da dimensão, portanto `4` num elemento de 6px renderiza como **3**:
  ficava dentro da escala no código e idêntico ao valor antigo no ecrã. O `2` é a
  única das duas que muda mesmo alguma coisa.
- **`CockpitShowcase:324`, `5 → 4`** — o popover tem raio 8 e padding 4, logo o
  raio concêntrico exacto do filho é 8−4=4. A 6 as curvas deixavam de ser paralelas.
- **`lp-error-tap`, dois `3 → 4`** — três overlays sobre o *mesmo* rectângulo,
  sobrepostos; a irmã já estava a 4.

**E só depois o âmbito abriu:**

```
linguagem-visual:  10 ficheiros  ->  123
achados novos no momento em que abriu:  ZERO
```

É o que se quer de um alargamento: o portão vê doze vezes mais e continua verde
**porque o trabalho foi feito**, não porque a régua foi afrouxada.

**As três sub-regras derivam agora todas do token** — raios, curvas e barras.
O `EAS_OK` era o último `Set` à mão (as quatro curvas escritas duas vezes cada,
por causa do `0.` opcional) e passou a sair de `T.motion`.

gate: design **61/61** (53 → 57 → 61 ao longo do dia) · índice **9,09** ·
linguagem visual **123 ficheiros**, 1.0/1.0 · landing **219/219** · cockpit 943,
**0 fail** · 7 workflows verdes

**Aberto:** os 4 tiers de **papel** abaixo de AA (t0 3,53 · t1 4,42 · t2 4,47 ·
t3 4,13), medidos e não declarados — escurecê-los é mexer na paleta clara inteira,
que serve impressão · as **15 estimativas de poupança na shell autenticada**, que
são decisão de produto e mantêm a verificação 3 em metade da nota.

### 2026-08-29 · OS DOIS ABERTOS FECHARAM — e o 10,00 vem com a régua declarada

Fecharam os dois pontos que a entrada anterior deixou em «Aberto», por PRs
separados. O segundo obriga a uma ressalva que não se pode esconder no meio.

**Os 4 tiers de papel passaram a AA** (PR #430). A dificuldade era real —
escurecê-los mexe na paleta clara inteira, que serve impressão. Resolveu-se com
o objectivo certo: **desvio mínimo sujeito a AA e a separação perceptual
preservada**, não separação máxima. A primeira tentativa optimizou o errado e
levou o t2 a dE 19,9 — deixava de ser a mesma cor — e foi rejeitada. Pares de
contraste: 22 → 26, todos ≥ 4,5:1.

**As 13 cifras da shell autenticada passaram a dizer de onde vêm** (PR #431).
Não saíram, e a razão não é conveniência: o `recibo` mede tokens reais mas lê a
máquina de quem o corre; a shell mostra dados sincronizados de outros devices, e
**nenhum servidor pode medir tokens que nunca lhe passaram pelas mãos** — os
prompts nunca saem da máquina, que é a tese. O número é modelado por construção
(`savings-tracker.js:441-451`: `saved = naive − real`, os dois derivados do
comprimento do prompt). O que mudou é que deixou de ser mudo: cada cifra
renderiza colada à proveniência, de uma fonte única (`_modelado.tsx`), e aponta
para o medido (`mooter recibo`).

Três números fabricados apanhados pelo caminho: **«40× cheaper»** era 5,0×,
**«5× cheaper»** era 2,5×, e **«90% of the capability»** não tinha fonte nenhuma
além de um masterprompt arquivado de Abril — apagado. E a defesa escrita no
dashboard, «real token counts require API access mooter doesn't have», tinha
deixado de ser verdade no dia em que o `recibo` nasceu.

**⚠️ A RÉGUA MEXEU-SE, e isso fica escrito.** A verificação 3 passou de contar
«cifras na shell» para «cifras SEM proveniência declarada». Sem essa mudança o
mesmo trabalho valeria 1,0/2,0 — a régua é *load-bearing*, e a 27/08 este
projecto **recusou** um 10,00 exactamente por isso. A diferença é que desta vez o
trabalho foi feito primeiro e **a régua morde**:
`design/tools/moo-proveniencia.test.mjs` (7 testes) planta uma cifra sem marca e
exige que apareça, planta a mesma com marca e exige a nota cheia, e prova que a
marca noutra linha não conta. Se falhar, o 10,00 deixa de valer. Quem discordar
da régua tem o argumento todo escrito no ficheiro — foi para isso que lá ficou.

**E mordeu logo, em mim.** Eu tinha «marcado» três cifras com um comentário JSX,
que satisfaz a regex e **não renderiza nada** — «documentar não corrige» na forma
mais pura, dentro do commit que criava a marca. A leitura passou a ser feita na
linha já sem comentários, com mordida própria.

**O instrumento estava cego, outra vez.** `test:design` era uma lista escrita à
mão e tinha perdido o `moo-visual-audit.test.mjs`: **corriam 61 de 72**. O «design
61/61» da entrada anterior lia-se como cobertura e não era. Passou a varrer a
pasta — e o primeiro teste que voltou a correr falhou em CI: o auditor importava
o `playwright` no topo, portanto rebentava com código 1 antes de validar
argumentos, e a sua recusa («esse canvas não existe») estava refém de um browser
instalado. Import preguiçoso, provado numa pasta sem playwright. O rótulo do
passo de CI dizia «53 testes» — número cravado à mão que envelhecia em silêncio;
saiu.

Também: o portão somava **coincidências de padrão** e dizia «14 modeladas» de 13
cifras — passa a contar por `ficheiro:linha`. E `wave12-dashboard.test.ts`
guardava o sufixo `(est.)`; passa a exigir o mecanismo, com mordida provada.

índice **9,09 → 10,00** · ratchet base promovida · design **74/74** (era 61 a
correr) · landing **220/220** + tsc + build · cockpit **906**, 0 fail · portão
`--ci` exit 0

**Aberto:** o `moo-visual-audit.mjs` tem a sua própria cópia à mão da escala de
raios e da família de curvas (`RAIOS_OK` inclui o 12, que a escala canónica
recusa) — é a quarta fonte de verdade, e ficou para trás porque os seus testes
nunca corriam. Derivá-la dos tokens torna o auditor mais estrito e precisa da
lista de sítios medida primeiro, numa máquina com playwright.

<!-- HUMANO:FIM -->