📥 **COLAR EM:** n/a — documento de entrega. O ÚNICO passo humano está no §1 (instalar o `.mcpb`). Ficheiro em `_handoff/MOOTER_V12_RELEASE_2026-07-25.md` no repo `frugal` (EXISTENTE, árvore principal).

```yaml
type: RELEASE
id: MOOTER-BRIDGE-1.2.0
data: 2026-07-25
construido_em: Cowork, sem abrir o VS Code
bundle: _handoff/mooter-v120.mcpb  ·  167 475 bytes
sha256: (corre `node packages/mooter-bridge/pack-mcpb.mjs` para reconfirmar)
testes: 64 verdes, 0 falhas
custo_da_construcao: $2.58 (2 jobs reais despachados pelo próprio conector)
```

# 🐮 Mooter bridge v1.2 — o cockpit dentro da conversa

## 1. 🔥 O ÚNICO passo humano

`Settings` → **Desktop app → Extensions** → `mooter` → **Uninstall** →
**Advanced settings → Install Extension…** → `C:\Users\Paulo Loureiro\frugal\_handoff\mooter-v120.mcpb`
→ confirmar **Version 1.2.0** → fechar o Claude Desktop **por completo (tray incluída)** → reabrir → task nova.

❌ Nunca: `claude_desktop_config.json` · `Add ⌄` em Plugins · Settings → Developer.

**Como saber que funcionou, em 10 segundos:** numa task nova, pede `mooter_fleet`. Devem aparecer
**13 tools** (eram 9), o painel deve ter **a vaca** no cabeçalho, e o rodapé deve mostrar
`cloud … out · local … out`. Se disser `mooter_work`, é a v1.2.

## 2. As 9 lacunas × o que mudou

| # | O que disseste | Estado | Onde |
|---|---|---|---|
| 1 | ver o trabalho na thread | ✅ já existia | painel |
| 2 | **qual LLM por task** | ✅ **lido do stream do job** — nunca mais adivinhado | `telemetry.js` + `attachModels` |
| 3 | **tokens em tempo real por LLM** | ✅ in/out/tok-s por job, **separados cloud vs local** | `--output-format stream-json` + Ollama |
| 4 | **que task está a correr** | ✅ frase em português: *"a ler fleet.js"*, *"a correr `npm test`"* | `describeToolUse()` |
| 5 | **moos em handoff com as cloud** | ✅ **`moo` é agente de 1ª classe** e despachável | `moo.js` |
| 6 | **logo da vaquinha** | ✅ SVG inline no painel + `icon.png` no manifest | `fleet-ui.html`, `manifest.json` |
| 7 | **algo estruturado** | ✅ **plano com etapas, risco e quem executou** | `plan.js` |
| 8 | **certeza da metodologia** | ✅ **`--model` passa ao CLI**; ledger grava recomendado **e** usado | `seamless.js` |
| 9 | **registo no vault** | ✅ `mooter_journal` + chip Obsidian com hora da última nota | `journal.js` |

## 3. Os quatro bugs que isto mata

**1 · O painel mentia sobre o modelo.** `attachModels` casava job↔sessão só por pasta. Em 25/07 um job
herdou `claude-opus-4-8` de uma sessão de **18 horas** antes. Nova ordem de confiança:
stream do job → id de sessão → pasta **com sobreposição temporal** → `null`. Há um teste que reproduz o
caso exacto e falha se voltar.

**2 · O fosso estava desligado.** `grep -- "--model"` dava **0**. Agora `buildCommand` recebe o modelo, e
`mooter_dispatch` chama o `classify.js` sozinho quando ninguém decide. T1→`haiku`, T2→`sonnet`, T3→`opus`,
**T5→`null`** (Fable nunca é auto-roteado). Aliases, não versões fixas, para não apodrecer.

**3 · O Codex estava morto.** `spawn` sem `stdio` deixava o filho com um stdin que nunca via EOF.
Agora `stdio: ['ignore','pipe','pipe']`. E o `kill` passou a `taskkill /T /F`: com `shell:true` o filho
directo é o `cmd.exe`, e matá-lo deixava o CLI neto vivo enquanto o ledger escrevia `failed`.

**4 · Jobs fantasma bloqueavam worktrees para sempre.** O watchdog de 30 min vivia só em memória; um
restart do conector deixava `started` eterno e o WIP guard recusava tudo. Agora há **sweeper no boot**,
estado **`stale`** no status, e **`mooter_cancel`** (com `sweep:true` para varrer todos).

## 4. Tools: 9 → 13

`mooter_work` ⭐ · `mooter_cancel` · `mooter_plan` · `mooter_journal` são novas.
**7 delas repintam o painel** (`_meta.ui.resourceUri` em dispatch/status/collect/work/cancel/plan/journal) —
em v1.1 só o `mooter_fleet` o fazia, por isso durante um job de 3 minutos o painel ficava congelado.

**`mooter_work("o que queres")`** é a porta única: classifica → escolhe tier **e** motor **e** worktree
livre → escreve o cabeçalho ⇄ da constituição → despacha → devolve o painel a andar. Read-only por
omissão; `write:true` para deixar mexer em ficheiros. Git **nunca**.

## 5. Provas medidas hoje (nenhum número inventado)

| Prova | Valor | Como |
|---|---|---|
| GPU a trabalhar | **pico 80 %** na RTX 4090, VRAM 6 052 MiB | job real `job-ms0ckji4-dfcd` |
| Throughput local | **185 tok/s** (qwen2.5:3b, 385 tokens) | `eval_count / eval_duration` |
| Campos do Ollama | `eval_count`, `prompt_eval_count`, `eval_duration` — **existem todos** | verificado na máquina, `all3: true` |
| Suite | **64 testes, 0 falhas** | `v12` 17 · `moo` 5 · `seamless` 8 · `fleet` 18 · `server` 16 |
| Bundle | 13 ficheiros, 167 475 B, arranca e lista 13 tools | descompactado e testado |
| Custo desta construção | **$2.58** | 2 jobs, ledger |

⚠️ O teste do `moo` afirma **exactamente 185 tok/s** contra o servidor falso — se o Ollama mudar de
unidade (nanosegundos!), a suite parte de imediato em vez de mentir devagar.

## 6. O que continua a NÃO fazer (e porquê)

| ❌ | Razão |
|---|---|
| `notifications/progress` | o cliente do Cowork **não envia `progressToken`** (anthropics/claude-code#58687). O polling é a arquitectura certa |
| guardar estado no widget | **não existe** na spec MCP Apps 2026-01-26 (deferido) — o painel reidrata do ledger |
| `fetch` externo no painel | CSP default `connect-src 'none'`. Por isso a vaca é SVG inline |
| git automático | push/merge/delete continuam gate humano |
| tocar em `classify.js` | FROZEN, sha `427d8c0b…364bc48f` — **nada nesta versão o altera** |

## 7. Ficheiros

**Novos:** `telemetry.js` · `moo.js` · `plan.js` · `journal.js` · `pack-mcpb.mjs` · `icon.png` ·
`v12.test.js` · `moo.test.js`
**Alterados:** `seamless.js` · `fleet.js` · `server-apps.js` · `fleet-ui.html` · `manifest.json`
**CW0:** o bundle v1.1 que corria e **não estava em git** foi trazido para o repo antes de qualquer
alteração; a cópia anterior está em `.pre-cw0/`. `pack-mcpb.mjs` reconstrói o `.mcpb` a partir do repo
com timestamps fixos → **o mesmo sha256 sempre**.

## 8. BOARD

| Item | Estado | Próxima acção |
|---|---|---|
| v1.2 construída e testada | ✅ 64/64 | — |
| Instalação | 🔜 **só tu podes** | §1, 2 minutos |
| Job órfão `job-ms0afc3y-aae0` | ⚠️ ainda a bloquear `frugal-integ` | depois de instalar: `mooter_cancel(sweep:true)` — **deixa de precisar de `taskkill`** |
| Commit | 🔜 gate teu | `git add` selectivo dos 13 ficheiros; ❌ nunca `-A` |
| Codex | 🟡 corrigido, **por provar** | 1º dispatch codex depois de instalar |
| Vault | 🟡 caminho por detectar na tua máquina | `mooter_journal status_only:true` |
| `SYNC.md` | ⚠️ parado em 13/07 | actualizar com M1/M2/M3 + v1.2 |

🤝 **SOCIO:** receita? na · despesa↓? **S** — o `--model` e o tier local são a diferença entre uma
`savedUsd` negativa em 6/6 sessões e um recibo positivo medido · risco↓? **S** — 4 bugs de produção
mortos, cada um com teste de regressão · reversível? **S** — desinstalar volta à v1.1, e a v1.1 está no
repo · escopo? **S** — nada fora de `packages/mooter-bridge/`.

📮 **DESTINO:** Paulo (instalar → `mooter_cancel sweep:true` → primeiro `mooter_work`)
