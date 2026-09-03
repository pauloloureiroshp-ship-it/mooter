# Mooter — Project Instructions

**Mooter** (mooter.ai, MIT) exists so a vibe coder can operate like a master without studying
every day: it sets up, watches, and pilots a real multi-agent project from inside VS Code with
total visibility — alerting foundation gaps (skills, memory, loops, file structure), applying
vibe-coding best practices automatically, and making the magic visible (Live Preview).
Under the hood, the engine: a deterministic local-first router (<50ms, $0 to classify)
that orchestrates multiple LLM subscriptions (Anthropic, OpenAI, Google) plus the user's own
GPU (Ollama), routing every prompt to the minimum viable tier and learning forever from local
telemetry — never proxying prompts, never fabricating metrics. The moat is trust: an auditable
receipt and adversarial verification (critic ≠ author) on work a non-dev can check.
The engine is table stakes; the cockpit is where the proof shows. A change earns its place by
improving one of five experiences: **Resume · Plan · Route (invisible) · Watch · Review**.

> Paulo's personal routing doctrine lives in `~/.claude/CLAUDE.md` and still applies globally.
> The long version that used to live here is archived at
> `docs/foundation/CLAUDE_MD_ARCHIVE_2026-06-11.md`.

Tool-agnostic canon — architecture map, conventions, multi-agent communication
protocol, information architecture: see @AGENTS.md (auto-imported into every session).

## Hard invariants (CI-enforced where noted)

- **`tools/router/classify.js` is FROZEN** — never modify it. Its sha256 is CI-enforced:
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- **Frozen engine packages**: `packages/*` shipped in waves 28-34.5 stay untouched unless the
  current wave brief explicitly allowlists specific files.
  Wave 58 allowlisted **additions** to `packages/router/src/` (new files only — no existing
  engine file is modified): `specialization-matrix.ts`, `decide-agent.ts`, `task-categories.ts`,
  `adaptive-learner.ts`, `tes-calculator.ts`, `benchmark-fetcher.ts`, `fable-5-routing.ts`.
  **2026-08-22 · piso de Node** allowlists `packages/router/package.json` (autorizado pelo dono,
  a pedido explícito). Só o `--target` do `build:packhint` (node18 → node22) e um `engines.node`
  novo — zero linhas de lógica do motor. Não é cosmético: o `install.sh:196` compila esse bundle
  **na máquina do utilizador** e instala-o como hook do Claude Code, portanto o alvo era um
  runtime que o instalador já recusa. Verificado por `tools/cockpit/runner/piso-de-node.mjs`.
  **2026-08-25 · exclusão de T5** allowlists **modificações** a
  `packages/router/src/decide-agent.ts` (autorizado pelo dono, decisão A3 do plano
  `~/paulo-vault/40-strategy/2026-08-25-plano-construir-superar.md`). É a primeira entrada que
  autoriza mexer num ficheiro de motor **existente**, e o motivo é que a alternativa era pior:
  até 2026-08-25 a escada de tiers não existia em código nenhum. O que impedia o `decideAgent`
  de auto-escolher o Fable era o snapshot de preços não trazer preço para ele — «you cannot rank
  what you cannot price». Medido nesse dia contra o motor real: pondo o preço que o SSOT
  (`tools/router/pricing.js`) sempre teve, `decideAgent({task_category:'reasoning.science'})`
  passava a devolver `claude-fable-5` com TES 3784, **sem ninguém ter escrito `@fable`**. Um
  invariante defendido por um número em falta cai no dia em que alguém completa os dados de
  boa-fé. Acrescentado: `OPT_IN_ONLY_MODELS` / `isOptInOnly()` e um filtro antes dos portões de
  `min_score` e de orçamento — zero alterações à ordenação por TES ou ao `force_model`
  (nomear o modelo **é** o opt-in). Provado por `packages/router/tests/decide-agent.test.ts`
  (comportamental: 0 das 24 categorias o escolhem) e por
  `tools/cockpit/runner/precificavel-nao-rotavel.test.mjs` (cobertura: qualquer modelo que
  reúna preço + célula medida tem de estar coberto pela guarda).
  **2026-08-28 · gramática do movimento** allowlists **4 linhas** de
  `packages/mooter-bridge/fleet-ui.html` (autorizado pelo dono, onda de design de 27-28/08).
  O portao `moo-design-check` tem duas verificações que varrem o repo inteiro e não pedem
  licença ao caminho: `movimento-seguro` (só `transform`/`opacity`, sempre com guarda de
  movimento reduzido) e `linguagem-visual` (as quatro curvas da família, os raios da escala).
  Esta folha falhava as duas: `@keyframes sl` animava `margin-left` — que fora da GPU faz
  *layout* a cada frame —, a barra de motor usava uma curva fora da família, e um raio de 5px
  não está na escala. As três linhas são `margin-left` → `transform: translateX`,
  `cubic-bezier(.4,0,.2,1)` → `(.2,.8,.2,1)`, e `border-radius: 5px` → `4px`. Zero lógica,
  zero comportamento, zero JavaScript. Fica registado porque a regra o exige: o congelamento
  é documentário, e **uma edição não registada é indistinguível de uma violação** — foi o
  gate de pré-merge desta onda que a apanhou por commitar sem entrada. Provado por
  `npm run test:design` (53 testes) e pelo índice em 9,09.
  A **4.ª linha** entra no mesmo dia e pelo mesmo motivo: `.eta` (linha 126) tinha
  `border-radius: 7px`, e 7 deixou de estar na escala quando ela foi completada
  (ver `moo-tokens.json → radius_nota`). Passou a `8px` — o degrau `panel`, que é
  o valor mais usado do repositorio. Zero lógica, zero comportamento.
  **2026-08-29 · a guarda de movimento reduzido passa a cobrir** allowlists a
  substituição do bloco `@media (prefers-reduced-motion: reduce)` de
  `packages/mooter-bridge/fleet-ui.html` (3 linhas → 8, autorizado pelo dono, a
  pedido explícito). O que estava lá nomeava **dois** selectores —
  `.mrow.on .mdot` e `.mbar.ind i` — e a folha tem **seis** animados. Ficavam de
  fora `.pulse` (:59), `.eta-track.pulsante` (:133), `.eta-track.ind > i` (:134)
  e `.eta-dot.vivo` (:137): **quatro animações `infinite` a correr para quem pediu
  ao sistema operativo que não corressem.** Não é cosmética — é acessibilidade
  (WCAG 2.1 SC 2.3.3), e o utilizador afectado é o que tem enxaqueca vestibular
  ou perturbação de movimento. O portão dava verde porque testava
  `/prefers-reduced-motion/` por ficheiro: **presença, não cobertura** — a mesma
  classe de defeito que fez o portão nascer cego para os `.svg` a 2026-08-27.
  A substituição passa a universal (`*, *::before, *::after` com
  `animation-duration`, `animation-iteration-count`, `transition-duration` e
  `scroll-behavior`) **de propósito**: uma lista de selectores foi exactamente o
  que envelheceu aqui, porque cada animação nova nascia descoberta e em silêncio.
  Zero lógica, zero comportamento, zero JavaScript — só CSS dentro de um `@media`
  que só se aplica a quem já pediu menos movimento. Provado por playwright com
  `reducedMotion: 'reduce'`: as **seis** passam de `infinite` para `x1` a 0,01ms,
  e as 3 transições da folha também. E o portão deixou de aceitar presença: a
  verificação `movimento-seguro` passa a exigir cobertura (universal, ou lista
  que nomeie todos), guardada por 4 testes novos em `moo-design-check.test.mjs`.
  **2026-09-01 · `OLLAMA_HOST` sem esquema** allowlists **uma adição** —
  `packages/cli/src/ollama-host.ts` — e **quatro linhas** em ficheiros
  existentes: `src/audit/orchestrator.ts`, `src/commands/init.ts`,
  `src/commands/quant-vector.ts`, `src/fable-observe/cca-f-audit.ts`
  (autorizado pelo dono, a pedido explícito: «faz o install e tudo que sugeriu»).
  `OLLAMA_HOST=127.0.0.1:11434` — **sem esquema** — é o formato canónico do
  Ollama, é assim que ele próprio o documenta e o imprime, e é o que esta
  máquina tem definido. Os quatro sítios assumiam `http://` e concatenavam, o
  que produz `fetch("127.0.0.1:11434/api/generate")`. Não é hipótese: no motor,
  a mesma linha fazia o `callOllama()` devolver **`null` sem razão nenhuma**
  (o `catch` do fetch engolia o `Failed to parse URL`), e o motor **$0** falhava
  MUDO enquanto o trabalho caía para um motor pago — corrigido em #454/#458.
  A regra não é importada de `tools/router/ollama-host.js` porque o bundle
  esbuild do CLI não arrasta código de fora do pacote (AGENTS.md § Conventions):
  é uma fronteira de **empacotamento**, não de conhecimento. Para as duas cópias
  não divergirem em silêncio, ambas são provadas contra a **mesma** tabela,
  `tools/router/ollama-host.casos.json` — os testes correm no repo, não no
  bundle, e a fronteira não se lhes aplica. Provado por
  `packages/cli/tests/ollama-host.test.ts` (6) e pelos 2 casos de paridade em
  `tools/router/ollama-host.test.js`; mordida verificada: alterar um caso da
  tabela reprova **os dois lados**.
  **2026-09-01 · release 1.53.0** allowlists **uma linha** em cada um de
  `packages/mooter-bridge/manifest.json` e `packages/mooter-bridge/version.json`
  (mais o `released`), e **duas** em `packages/mooter-bridge/entregas-por-versao.json`
  (a chave `"1.53": []`). Autorizado pelo dono no kickoff da release
  (`_handoff/_archive/2026-09/KICKOFF-RELEASE-1530.md` — arquivado no mesmo commit
  que o executa, como manda o `AGENTS.md` § Information architecture; ponto 1:
  «Bump 1.53.0 … e build
  `_handoff/mooter-v1530.mcpb`»). Zero linhas de lógica.
  Não é cosmético e não é redundante com a automação: o `version-sync.yml` só
  corre **no push da tag**, que acontece DEPOIS do merge — e o `pack-mcpb.mjs`
  lê `manifest.version` para dar nome e versão ao bundle. Sem o bump aqui, o
  artefacto que o kickoff pede sairia chamado `mooter-v1520.mcpb` e rotulado
  1.52.0. O bump manual é **idempotente** com o workflow (ele imprime «already
  1.53.0 — no change») e é o mesmo gesto de 2026-08-18, que o
  `versao-coerente.test.js` apanhou e passou a guardar.
  `"1.53": []` é a declaração honesta de que esta onda **não entrega ficheiro
  novo à bridge** — o trabalho todo vive em `tools/cockpit/`. Precedente:
  `"1.50": []`. Provado por `node pack-mcpb.mjs` (335 verificações de conteúdo
  OK, sha256 `9100e0dfaf5724fbb5845122c64ef3e89e10c0d49a7385f95fa3774004f96ad6`)
  e por `packages/mooter-bridge/versao-coerente.test.js`.
  **2026-09-02 · as duas causas-raiz da medicao de eficiencia** allowlists
  **modificacoes** a `packages/mooter-bridge/seamless.js` e
  `packages/mooter-bridge/context.js`, e **adicoes**:
  `packages/mooter-bridge/bin-resolver.js` e
  `packages/mooter-bridge/cadeia-nao-silenciosa.test.js` (mais as tres linhas de
  registo em `pack-mcpb.mjs`, `entregas-por-versao.json` e `entrega.test.js` que
  os gates B1/entrega exigem). Autorizado pelo dono no master prompt «Moo Pilot
  Perfeito», item **C1.4**, que nomeia os ficheiros: «linhas numeradas no
  contexto injetado (`context.js:149`); resolvedor de binários (generalizar
  `gh-bin.mjs`) usado em `seamless.js` antes do spawn; … cadeia moo→cc nunca
  falha em silêncio».
  Não é cosmético: a 2026-09-02, seis tarefas despachadas pelo conector deram
  **duas** entregas locais e **quatro** falhas, e as quatro eram de ambiente.
  · `context.js` — injectava o ficheiro CRU. Os dois jobs que chegaram ao fim
  acertaram **3/3 dos factos e 0/3 das linhas**. Medido em A/B nesta bancada,
  mesmo modelo e mesmo prompt: contexto cru **0/7** linhas certas, contexto
  numerado **5/7**.
  · `seamless.js` — três linhas, três defeitos medidos. (1) `spawn codex ENOENT`
  com o `codex` instalado em `~/.local/node/bin`: o Claude Desktop lança o
  conector com um PATH que não o tem — mesma classe do `gh` sob launchd, mesma
  solução (`bin-resolver.js`, e resolve-se no spawn e não no `buildCommand`
  para o caminho com o nome do dono não entrar no ledger). (2) `USER` e
  `LOGNAME` fora do `CHILD_ENV_BASE_KEYS`: o job `cc` morria em 2 s com «Not
  logged in · Please run /login», `<synthetic>`, 0 tokens — **com a sessão
  válida**. Reproduzido a frio: `env -i PATH=$PATH HOME=$HOME claude -p` diz
  «Not logged in»; a mesma linha com `USER=$USER` responde. Em macOS a
  credencial vive no chaveiro indexada pela conta, e a conta é o `$USER`. Isto
  **refuta** o diagnóstico do kickoff («encontra um binário (ou outro HOME) que
  não está logado»): não era o binário nem o HOME. (3) uma escalada recusada só
  ia para o `log()` — reproduzido no mesmo dia, a cadeia `moo → kimi` fechou com
  `settled:true, failed:0` e **zero** eventos sobre o job pago que nunca
  existiu; passa a `chain_refused` no ledger, com destino e motivo.
  · `bin-resolver.js` é uma segunda cópia por uma fronteira de **empacotamento**,
  não de conhecimento (AGENTS.md § Conventions) — precedente exacto:
  `packages/cli/src/ollama-host.ts`. As duas cópias são provadas contra a MESMA
  tabela, `tools/cockpit/runner/bin-resolver.casos.json`; mordida verificada:
  alterar um caso reprova **os dois lados**.
  **Mesma autorizacao, item C1.3**: `seamless.js` ganha `requireDecisoes()` e
  uma escrita `appendMeasured` depois do evento terminal, e `pack-mcpb.mjs`
  ganha a linha `decisions_v2.js` (o conector instalado nao tem repo de onde o
  ler). O `decisions_v2.jsonl` tinha **403 decisoes e 0 com tokens**, e nao por
  descuido: quem o escreve e o hook de UserPromptSubmit, que corre ANTES da
  execucao. Quem tem os tokens e o despachante, e ate agora esse numero morria
  no ledger do conector.
  ⚠️ **Cobertura em producao: `n/d`, a 2026-09-03.** Um esboco desta entrada
  dizia «medido depois: 5/5 despachos com tokens medidos (100%)». Nao ha esse
  numero em lado nenhum: o corpus real tem 420 linhas e **4** com
  `tokens_fonte: 'medido'`, que sao **dois pares identicos** (10/5 e 100/80,
  um par por corrida da suite) — ver a entrada seguinte.
  Que nenhuma delas veio de um motor a serio nao esta *no esquema* (o registo
  guarda `via` e uma razao textual, nao a identidade da execucao — objeccao do
  adversario, codex 2026-09-03). O que esta medido e: os valores sao
  exactamente as fixtures (`10/5` = `prompt_eval_count:10, eval_count:5` do
  stub do Ollama; `100/80` = `v12.test.js:288`), aparecem em pares nos
  timestamps das corridas da suite, e **redireccionar `MOOTER_CLAUDE_DIR` fez o
  par de hoje aterrar no temporario em vez do corpus** — prova directa para o
  par de 2026-09-03, inferencia forte para o de 2026-09-02.
  O caminho esta provado end-to-end (`cadeia-nao-silenciosa.test.js`,
  `corpus-de-routing.test.js`); a cobertura VIVA so pode ser medida depois de o
  dono reinstalar o conector, porque o que corre nesta maquina e anterior a
  mudanca.
  **2026-09-03 · os testes escreviam no corpus do dono** allowlists uma
  **adicao** — `packages/mooter-bridge/testes-nao-escrevem-no-corpus.cjs` e
  `corpus-de-routing.test.js` — e **uma linha** em
  `packages/mooter-bridge/package.json` (`scripts.test` passa a carrega-lo por
  `--require`). Mesma autorizacao, e e a continuacao directa do C1.3: o
  `appendMeasured` sem `logPath` resolve para
  `~/.claude/tools/router/decisions_v2.jsonl`, e dois testes desta pasta fazem
  despachos a serio contra motores de mentira (`cadeia-nao-silenciosa.test.js`
  com um Ollama em loopback, `v12.test.js:288` com `usage:{100,80}`). Cada
  `npm test` injectava DUAS linhas rotuladas `tokens_fonte: 'medido'` no corpus
  REAL. A mudanca escrita para impedir que um numero nao medido entrasse no
  corpus era a unica coisa a por la numeros inventados. Redirecciona-se
  `MOOTER_CLAUDE_DIR` (a raiz, nao o ficheiro) para que qualquer escritor
  futuro nasca coberto — presenca nao e cobertura, a licao de 2026-08-29.
  Medido (reproduzivel — `L=~/.claude/tools/router/decisions_v2.jsonl;
  wc -l <$L; npm test; wc -l <$L`): 420 linhas antes, **420 depois** de uma
  suite completa (1182/1182). Os dois passos do CI com
  `working-directory: packages/mooter-bridge` passam de `node --test` a
  `npm test` (`.github/workflows/test.yml`) porque um gate que corre outro
  comando nao gateia isto.
  **Segunda ronda, depois do adversario (codex, 2026-09-03).** O `--require`
  nao cobre um humano a correr o ficheiro a mao — e `v12.test.js:6` ENSINA a
  faze-lo («Run: node v12.test.js»). Allowlist estende-se a **uma linha** em
  cada um de `v12.test.js`, `path.test.js` e `cadeia-nao-silenciosa.test.js`
  (`require('./testes-nao-escrevem-no-corpus.cjs')`, idempotente, zero logica).
  A guarda e sobre a **interseccao** «ensina a correr-se a mao» ∩ «despacha»,
  e nao sobre «tudo o que despacha»: dez ficheiros desta pasta chamam
  `toolWork` e nunca escrevem, e exigir-lhes a linha seria ruido que ninguem
  mantem. Verificado por medicao: `node v12.test.js` directo, 420 -> 420.
  Do mesmo adversario, e no mesmo commit: `quotaPorMotor` contava tokens por
  `tokens_out > 0` — classificava um zero REALMENTE MEDIDO como nao-medido,
  a mesma confusao que o C1.3 desfaz, a sobreviver dentro do ficheiro que a
  desfaz. Passa a usar o predicado unico `foiMedido()`. E o `numeroOuNulo`
  ganha `>= 0`: finitude nao chega, `-1` e finito e nao e uma contagem.
  **Objeccao do adversario recusada, e porque:** «falta `landing/app/version.json`
  no bump». Fica a 1.53.0 de proposito — o ficheiro diz «Generated — never
  hand-edit» e e o `version-sync.yml` que o escreve no push da tag. Mesma
  decisao, com as mesmas palavras, de `72b8e31f`.
  **2026-09-03 · 1.53.0 -> 1.53.1** allowlists **uma linha** em cada um de
  `packages/mooter-bridge/manifest.json`, `packages/mooter-bridge/version.json`,
  `tools/router/version.json` e `plugin/mooter/.claude-plugin/plugin.json`
  (mais o `released` nos dois `version.json`). Autorizado pelo dono no kickoff
  de 2026-09-03: «usa-o para gerar um pacote novo do conector com estes fixes».
  Nao e cosmetico e o precedente e exacto — `72b8e31f`, «1.48.0 -> 1.48.1 para
  o .mcpb do piloto poder instalar»: `update.js:354` recusa qualquer bundle
  cuja versao nao seja ESTRITAMENTE maior do que a instalada. Com 1.53.0 nos
  dois lados, o `.mcpb` com as correccoes do C1.4/C1.3 seria recusado com «ja
  tens a 1.53.0» e o conector continuaria a correr o codigo de antes — que e
  exactamente o estado medido nesta maquina hoje. Nao tocado:
  `landing/app/version.json` («Generated — never hand-edit»).
  `entregas-por-versao.json` ja declara a chave minor `"1.53"`, e 1.53.1 cai na
  mesma. Zero linhas de logica.
  Provado por `packages/mooter-bridge` (1176/1176), `context.test.js` (18),
  `cadeia-nao-silenciosa.test.js` (5, end-to-end com um Ollama de mentira em
  loopback), `tools/cockpit/runner/bin-resolver.test.mjs` (22) e
  `preflight-motores.test.mjs` (13).
- **Selective git adds only** — never `git add -A`. Stage exactly the files you changed.
- **No new root `.md` files** without an explicit request.
- **PT-BR in conversation, English in code** and identifiers. (Canon PT-BR reconfirmado 2026-07-07.)
- **`owner_tz = America/Sao_Paulo` (UTC-3).** Paulo mora em São Paulo. Armazenamento sempre
  em UTC ISO-8601; **apresentação ao dono sempre convertida** para a hora dele e rotulada
  como tal. Nunca apresentar UTC cru, nunca assumir Europa/Lisboa. Registado também em
  `_handoff/maestro-state/CONFIG.json`. *(Custou uma "correcção" errada a dois ficheiros
  normativos em 2026-08-08: `2026-08-14T01:00Z` é quinta 13/08 às 22:00 na hora dele, que
  era exactamente o que o plano já dizia.)*

## Tier ladder (the truth, no embellishment)

| Tier | Routing | Notes |
|---|---|---|
| T0 | auto | local Ollama (free) |
| T1 | auto | Haiku |
| T2 | auto | Sonnet |
| T3 | auto | Opus — high-risk floors (deploy/secrets/migrations) force T3 |
| T5 | **opt-in only via `@fable`** | Fable — NEVER auto-routed; there is no T4 |

## Where things live (do not duplicate — point)

| Need | File |
|---|---|
| Strategy (single source of truth) | `docs/strategy/STRATEGY.md` |
| Infra, URLs, credentials, endpoints | `INFRA.md` |
| Current project state / next mission | `SYNC.md` |
| Routing policy detail | `~/.claude/docs/ROUTING_POLICY.md` |
| Cross-tool agent instructions | `AGENTS.md` |
| Where each `.md` type lives + lifecycle (handoffs, specs, archive) | `AGENTS.md` § Information architecture |
| Personal per-dev preferences | `CLAUDE.local.md` (gitignored; template at `CLAUDE.local.md.template`) |

## Tests

- CLI: `cd packages/cli && npm test`
- Fresh worktrees need `npm install` in **both** `packages/cli` and `packages/router` first.
- Other packages: each is standalone — `cd packages/<name> && npm test`.

## After every release (keep `~/.claude/` in sync)

`/mooter-update` syncs **files** (router `*.js`, skills, agents) **and mirrors the
wired `~/.claude/hooks/` copies** (`sync-hooks.js`), then **self-checks the turn-end
accumulator** — it never sets environment variables, and runtime mirrors live
outside the repo. (The hooks mirror exists because `settings.json` wires the Stop
hook at `~/.claude/hooks/gsd-turn-end.js`; the plain router glob only refreshes
`~/.claude/tools/router/`, so the wired Stop hook used to go stale and silently
drop the Live Context Accumulator — 63 sessions, 0 journals.) After any release
that touches `tools/router/`:

1. `git pull origin main` in `~/frugal`.
2. In Claude Code, run `/mooter-update` (idempotent — safe to run twice).
3. Verify the new runtime files landed:
   `Test-Path ~/.claude/tools/router/<new-file>.js`
4. Confirm the wired accumulator is intact:
   `node ~/.claude/tools/router/sync-hooks.js --check` (must print `OK self-check`).
5. Espelhar o cockpit e confirmar que e ELE que a maquina corre:
   `npm run sync:cockpit` (deve imprimir `OK self-check`). Ate 2026-08-18 o
   cockpit nao tinha canal de distribuicao nenhum: nada fora de
   `tools/cockpit/` o importava, o `/mooter-update` nao o sincronizava, e o
   LaunchAgent apontava direto para dentro do checkout. Um `AVISO` aqui quer
   dizer que o espelho esta em dia e a maquina corre outra copia — que e
   exactamente como o acumulador morreu 63 sessoes em silencio.
5. Kill stale CC sessions: `Get-Process claude | Stop-Process -Force`.
6. Open a **fresh** CC terminal and confirm the statusline.

**Statusline depends on machine state `/mooter-update` cannot restore** — if it
drops to 3 lines after a fresh profile/OS, re-apply (see `~/.claude/PREFERENCES.md`):

- expanded layout: `[Environment]::SetEnvironmentVariable('MOOTER_MODE','1','User')`
- GPU chip + dense line: `~/.mooter/preferences.json` → `{"statusline_line3": true}`
  (path is `~/.mooter/`, **not** `~/.claude/`).
