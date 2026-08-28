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

<!-- HUMANO:FIM -->