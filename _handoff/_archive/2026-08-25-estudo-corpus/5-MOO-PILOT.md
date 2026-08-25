# MOO PILOT + SKILLS (2026-08-25)
===== ./plugin/mooter/skills/cockpit/SKILL.md =====
---
name: cockpit
description: Open the Mooter Cockpit for the current session — what ran, what is stuck, what it cost, and what needs action. Use when the user says "/cockpit", "open the cockpit", "where was I?", or when resuming a session and needing to get oriented. Also answers to the old name "cabine" / "cabin" — renamed 2026-08-04, the alias stays so anyone who learned the old one is not stranded.
---

# Mooter Cockpit

A per-session cockpit that answers one question — *"where was I?"* — for someone running many
sessions in parallel (Cowork + Claude Code) with work split between a local GPU and paid
subscriptions.

## Surfaces — they are NOT the same

| Where | What you get | Why |
|---|---|---|
| **Claude Code** | this skill + the `/cockpit` command, rendered as text | no artifacts, and the Mooter MCP connector is usually **not** attached to CC sessions |
| **Cowork** | a persistent **artifact** panel that calls the connector from the browser | the MCP connector is attached, and artifacts can call it without spending model tokens |

⚠️ **You cannot open an artifact.** There is no tool for it. In Cowork the user opens it from
`Artifacts` in the left sidebar. Your job is to say where it is, not to try to open it.

## Publishing without hiding the source

Remote `update_artifact` replaces the HTML and **clears the connector grants**. After any remote
update, the user must re-authorize the Mooter connector in the desktop UI; the page itself has no
authorization API and cannot repair those grants.

The low-friction publication path is:

1. Run `node tools/cockpit/build-snapshot.js` from the repo root.
2. Publish `dist/cockpit-snapshot.html`, not the clean source file. The generated artifact carries
   a dated, explicitly **frozen** snapshot, so it still has data while grants are absent.
3. Re-authorize the connector in the desktop UI to restore live `bridge` readings and actions.

The source remains `plugin/mooter/skills/cockpit/cockpit.html`; the generator never writes to it.
There is still no tool that opens an artifact — the user opens it from `Artifacts`.

## In Claude Code — render it

1. Read the state. `~/.mooter/` holds everything, and the MCP tools are usually absent here:
   - `~/.mooter/jobs/` — one file per job (state, agent, model, tier, cost, timestamps)
   - `~/.mooter/scorecard.json` — metrics with owners and out-of-range exceptions
   - `~/.mooter/board/<date>.json` — the day's history
   - `~/.mooter/hardware.json` — GPU snapshot
   If `mcp__Mooter__mooter_fleet` **is** available, prefer it: views `jobs`, `board`, `recibo`, `pastas`.
   ⚠️ Never `view:"tudo"` — it returns ~60 000 characters.

2. Render, short, in this order:

| Block | Content |
|---|---|
| **Session** | name · folder · worktree + branch · registered? |
| **Prompt log** | one line per prompt: local time · ≤60-char summary · engine marks. Nothing else |
| **Attention** | ONLY exceptions: out-of-range metrics, stalled work, coherence warnings. Empty when there are none |
| **Devil's advocate** | the questions from the receipt — rule-derived over measured numbers, never model-generated |
| **Project** | one line: version · quota · GPU · free folders · vault |

3. Close with one line: can the user stop for the day, and if not, which **single** exception to
   take first — by owner (MOO · MEO · MTO · MFO · MIO · MRO · MCC).

## In Cowork — point, don't narrate

Say: *"The Cockpit is in `Artifacts` → Mooter Cockpit, in the left sidebar."* Then give the same
one-line reading. **Do not rewrite the panel in text** — narrating it costs 5 000 to 60 000 tokens
to repeat what is already on screen.

## The rules that make this trustworthy

- **`state: "running"` does not mean working.** If `estimativa.vivo.estado` is `parado`, if the log
  has not grown, or if `exit_code` contains `agent-awaiting-approval`, report it as **stalled** or
===== ./.claude/worktrees/mystifying-bohr-78f90b/plugin/mooter/skills/cockpit/SKILL.md =====
---
name: cockpit
description: Open the Mooter Cockpit for the current session — what ran, what is stuck, what it cost, and what needs action. Use when the user says "/cockpit", "open the cockpit", "where was I?", or when resuming a session and needing to get oriented. Also answers to the old name "cabine" / "cabin" — renamed 2026-08-04, the alias stays so anyone who learned the old one is not stranded.
---

# Mooter Cockpit

A per-session cockpit that answers one question — *"where was I?"* — for someone running many
sessions in parallel (Cowork + Claude Code) with work split between a local GPU and paid
subscriptions.

## Surfaces — they are NOT the same

| Where | What you get | Why |
|---|---|---|
| **Claude Code** | this skill + the `/cockpit` command, rendered as text | no artifacts, and the Mooter MCP connector is usually **not** attached to CC sessions |
| **Cowork** | a persistent **artifact** panel that calls the connector from the browser | the MCP connector is attached, and artifacts can call it without spending model tokens |

⚠️ **You cannot open an artifact.** There is no tool for it. In Cowork the user opens it from
`Artifacts` in the left sidebar. Your job is to say where it is, not to try to open it.

## Publishing without hiding the source

Remote `update_artifact` replaces the HTML and **clears the connector grants**. After any remote
update, the user must re-authorize the Mooter connector in the desktop UI; the page itself has no
authorization API and cannot repair those grants.

The low-friction publication path is:

1. Run `node tools/cockpit/build-snapshot.js` from the repo root.
2. Publish `dist/cockpit-snapshot.html`, not the clean source file. The generated artifact carries
   a dated, explicitly **frozen** snapshot, so it still has data while grants are absent.
3. Re-authorize the connector in the desktop UI to restore live `bridge` readings and actions.

The source remains `plugin/mooter/skills/cockpit/cockpit.html`; the generator never writes to it.
There is still no tool that opens an artifact — the user opens it from `Artifacts`.

## In Claude Code — render it

1. Read the state. `~/.mooter/` holds everything, and the MCP tools are usually absent here:
   - `~/.mooter/jobs/` — one file per job (state, agent, model, tier, cost, timestamps)
   - `~/.mooter/scorecard.json` — metrics with owners and out-of-range exceptions
   - `~/.mooter/board/<date>.json` — the day's history
   - `~/.mooter/hardware.json` — GPU snapshot
   If `mcp__Mooter__mooter_fleet` **is** available, prefer it: views `jobs`, `board`, `recibo`, `pastas`.
   ⚠️ Never `view:"tudo"` — it returns ~60 000 characters.

2. Render, short, in this order:

| Block | Content |
|---|---|
| **Session** | name · folder · worktree + branch · registered? |
| **Prompt log** | one line per prompt: local time · ≤60-char summary · engine marks. Nothing else |
| **Attention** | ONLY exceptions: out-of-range metrics, stalled work, coherence warnings. Empty when there are none |
| **Devil's advocate** | the questions from the receipt — rule-derived over measured numbers, never model-generated |
| **Project** | one line: version · quota · GPU · free folders · vault |

3. Close with one line: can the user stop for the day, and if not, which **single** exception to
   take first — by owner (MOO · MEO · MTO · MFO · MIO · MRO · MCC).

## In Cowork — point, don't narrate

Say: *"The Cockpit is in `Artifacts` → Mooter Cockpit, in the left sidebar."* Then give the same
one-line reading. **Do not rewrite the panel in text** — narrating it costs 5 000 to 60 000 tokens
to repeat what is already on screen.

## The rules that make this trustworthy

- **`state: "running"` does not mean working.** If `estimativa.vivo.estado` is `parado`, if the log
  has not grown, or if `exit_code` contains `agent-awaiting-approval`, report it as **stalled** or
===== ./.claude/worktrees/mystifying-bohr-78f90b/.claude/skills/moo-pilot/SKILL.md =====
---
name: moo-pilot
description: Moo Pilot — o cockpit por device do Mooter. Levanta o motor local, o endpoint e o loop desta máquina, e abre o painel ao vivo em 127.0.0.1:4290/panel com GPU medida, os 6 pilares, os recibos por veredicto e a frota. Tudo da GPU e do ledger local, $0. Usar quando o Paulo disser "/moo-pilot", "abre o pilot", "cockpit do device", "o que a GPU está a fazer?", ou ao configurar um device novo.
---

# /moo-pilot — cada device é um funcionário com cockpit próprio

> **Nome oficial:** Moo Pilot. **Um cockpit por device**, nunca um agregador central.
> Código canónico: `tools/cockpit/runner/` (com testes: `npm run test:cockpit-runner`).
> Shell: `tools/cockpit/moo-pilot-shell.html`. Nada disto vive numa skill — a skill
> só sabe conduzir o que já está no repo.

## O gesto

```bash
cd ~/frugal && npm run pilot
```

Levanta o que estiver em baixo (endpoint F10, loop dos pilares), identifica o device
pelo hostname e abre o painel. `npm run pilot:status` reporta sem arrancar nada.

**O lançamento NUNCA levanta o STOP.** Lançar é "mostra-me os controlos"; trabalhar é o
▶ do dono. Se o STOP estiver activo, o cockpit abre com a máquina parada e o botão pronto.

## Ladder de dados — e a regra que a governa

1. **Ao vivo** — `GET http://127.0.0.1:4290/fleet.json`, poll 3s. É o único modo que
   **conduz**: ▶/⏸ e o foco por pilar precisam do endpoint.
2. **Instantâneo** — `node tools/cockpit/runner/build-shell-snapshot.mjs` injecta
   `window.__MOOTER_SNAPSHOT__` num HTML autónomo. Abre em qualquer lado, **não controla
   nada**, e diz isso num banner permanente.
3. **Silêncio honesto** — sem endpoint e sem snapshot, a página mostra o endereço vivo e o
   comando que o levanta. Nunca um número inventado, nunca um botão morto.

> **Não mandes o snapshot quando o Paulo pediu o cockpit.** Um snapshot num painel lateral
> sandboxed não alcança o `127.0.0.1` — os controlos ficam inertes e parece que o produto
> está partido. Custou-nos exactamente isso uma vez. Snapshot é para arquivar ou partilhar,
> nunca para conduzir.

## O que fazes, por ordem

1. **Estado real primeiro:** `npm run pilot:status`. Reporta o que está vivo e o que não está,
   com os PIDs e o estado do STOP. Sem inventar.
2. **Levanta e abre:** `npm run pilot`. Se o Ollama estiver em baixo, PÁRA e diz `ollama serve` —
   um cockpit apontado a uma GPU morta é pior que nenhum.
3. **Confirma que o painel é o canónico:** a resposta do `/panel` traz
   `X-Moo-Panel-Source: tools/cockpit/moo-pilot-shell.html`. Se vier outro ficheiro, diz qual.
4. **Lê o que o painel diz** e resume ao Paulo em linguagem dele: quantas rondas, quantas com
   citação conferida, GPU medida, alinhamento do repo, quem está na frota e com que idade.
5. **Device novo:** confirma `nvidia-smi` (Windows/Linux) ou `ioreg` (macOS) e o vault montado —
   sem vault partilhado a frota é um device só, e o painel diz isso.
6. **Arranque automático**, se o Paulo pedir: `node tools/cockpit/runner/autostart.mjs --install`.
   Corre o runner directamente, nunca o shim, e nunca com `--play`.
7. **Registo:** `mooter_setup({sessao:'registar', ...})` no fecho.

## Vocabulário — não o suavizes

| No painel | Quer dizer |
|---|---|
| `citação-ok` | a linha citada **existe** e foi lida do disco. **Não** que o achado esteja certo. |
| `refutado` | o modelo citou algo que não existe. |
| `sem citação` | resposta sem `ficheiro:linha` — não verificável. |
| `sem achado` | a ronda declarou nada a reportar. É honesto uma vez; em série é alarme — o painel conta as vazias seguidas, porque GPU ocupada sem produzir não é trabalho. |
| `sem veredicto` | recibos anteriores ao verificador. Contam como volume, nunca como trabalho. |
| `fora da janela` | citou uma linha real que nunca lhe foi mostrada. |

## Regras

- **$0 duro.** O runner só fala com `127.0.0.1:11434`. `assertLocalEngine` recusa tudo o resto,
  e `redirect: 'error'` impede que um 307 o leve para fora. Se algo aqui custar um token de
===== ./.claude/worktrees/mystifying-bohr-78f90b/.claude/skills/local-first-default/SKILL.md =====
---
name: local-first-default
description: Prefer FREE local Ollama execution paths (mooter workflow, local-summarizer/local-transformer subagents) for summarize/extract/transform/compare tasks before burning any cloud tokens. Use when planning how to execute a task that smells like T0 work, or when the user asks "can this run locally?".
---

# /local-first-default

Mooter's mission is local-first: route every turn to the cheapest model that
can do it well. Local Ollama costs **$0**; every cloud call costs real money.
Before executing summarize/extract/transform/compare/translate work in a cloud
model, check the local paths first.

## The smell test (apply before every inline cloud execution)

> **"Can a local model do this alone with the inputs I can hand it?"**

If yes → delegate. The 1-2s spawn overhead never outweighs cloud token cost.
The saving is only real when the delegation actually happens — otherwise the
statusline shows `∅ 0% saved (all-Opus)`.

Signals that the answer is YES:
- Summarize / explain a file or diff
- Extract fields, lists, or structure from text
- Format/syntax transforms (JSON↔YAML, table↔list, rename sweeps)
- Compare 2-3 snippets, brainstorm variants, translate
- Fan-out work across many files where each unit is independent

Signals that the answer is NO (keep the routed tier):
- Multi-file architectural judgment, tradeoff decisions
- HIGH_RISK: `.env*`, CI/CD, migrations, secrets, pre-push/merge/deploy
- The task depends on un-persisted session state a fresh worker cannot see
  (declare that dependency in one line before inlining)

## Local execution paths (in order of preference)

| Path | When |
|---|---|
| `local-summarizer` / `local-transformer` subagents | Single-unit summarize/extract/transform — spawn via Agent tool |
| `mooter workflow run "<task>"` (or `/moo-workflow`) | Many files / fan-out: free local Ollama workers + at most ONE cloud synthesis call |
| `bash ~/.claude/tools/router/ollama_call.sh --text "<prompt>"` | Quick one-shot local call from the shell |
| `mooter local-models` | List what is actually pulled locally before promising a model |

## Honest caveats

- Check Ollama is up before promising local execution
  (`curl -s --max-time 1 http://127.0.0.1:11434/api/tags`); if it's down, say
  so and fall back to the routed tier — don't silently burn Opus.
- Local-first is a default, not a ceiling: tier floors and safety boosts
  always win. Never downgrade HIGH_RISK work to local to save money.
- Quality intent (`quality_intent: high`) or an explicit user model pin
  overrides this skill.
===== ./.claude/worktrees/mystifying-bohr-78f90b/docs/archive/frugal-skills-pre-rename-2026-04-14/model-router/SKILL.md =====
---
name: model-router
description: Use when the user explicitly asks "qual modelo devo usar", "rota essa tarefa", "/router", "classifica essa pergunta", or when you yourself are unsure which tier (Opus/Sonnet/Haiku/Ollama) fits a request. Returns a routing decision with rationale grounded in ~/.claude/docs/ROUTING_POLICY.md.
---

# Model Router

This skill is the human-facing interface to Paulo's personal model router. It does **not** execute the task — it tells you (or Paulo) which tier should.

## When to invoke

- The user types `/router` or `model-router` or asks "which model for this?"
- A `<router-hint>` block is missing from the turn AND the next action is non-trivial
- You are about to spawn a subagent and want a sanity check on which one

## How to run

1. Take the prompt or task description (from the user message, or ask if missing).
2. Call the classifier:
   ```bash
   node "$HOME/.claude/tools/router/classify.js" "<the task>"
   ```
3. Read the JSON result. It will look like:
   ```json
   {
     "task_category": "...",
     "tier": "T0|T1|T2|T3",
     "recommended_backend": "ollama|anthropic_api|claude_subagent",
     "recommended_model": "...",
     "suggested_subagent": "...",
     "confidence": 0.0,
     "escalation_rule": "...",
     "anthropic_key_present": false
   }
   ```
4. Translate that into a one-screen recommendation in PT-PT.

## Output format (give this back to the user)

```
## Roteamento sugerido
- **Tier:** <T0–T3>
- **Categoria:** <task_category>
- **Backend:** <ollama | anthropic_api | claude_subagent>
- **Modelo:** <recommended_model>
- **Subagent sugerido:** <suggested_subagent>
- **Confiança:** <0.00–1.00>
- **Por quê:** <one sentence>

<se confiança < 0.6, dizer: "Confiança baixa — recomendo escalar 1 tier acima ou pedir mais contexto antes de delegar.">

<se anthropic_key_present == false e tier originalmente seria T1: "Sem ANTHROPIC_API_KEY no env — Haiku indisponível, rebaixei para Ollama local.">
```

## Tier cheat sheet

| Tier | Quando | Modelo |
|---|---|---|
| **T3** | arquitetura, refator multi-arquivo, review final, mexer em prod, secrets | Opus |
| **T2** | bug investigation, root cause, plano técnico, decomposição | Sonnet |
| **T1** | commit msg, docstring, regex, explicar erro, transform de formato | Haiku (ou Ollama se sem key) |
| **T0** | triagem, sumarização curta, comparação, extração, brainstorm | Ollama qwen3:30b |

## Guardrails (não economizar de forma burra)
- Tarefas críticas → SEMPRE T3, mesmo que pareçam pequenas.
- Arquivos `.env*`, `package.json`, migrations, CI → no mínimo T3.
- Confiança < 0.5 → escalar 1 tier.
- T0 nunca para edits em arquivos de produção sem revisão T2+.

Política completa: `~/.claude/docs/ROUTING_POLICY.md`.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-pilar-higiene/SKILL.md =====
---
name: moo-pilar-higiene
description: Pilar P4 — Segurança & Higiene do Repo (cargo MRO). Bateria L0 zero-LLM de segredos, shas, untracked, stashes e worktrees stale — desenhada para virar script cron+CI; a sessão humana só corre quando um alerta dispara. Usar quando o Paulo disser "/moo-pilar-higiene", "ronda de higiene", "o repo está limpo?", ou após qualquer incidente.
---

# /moo-pilar-higiene — P4: o pulso determinístico (isto quer ser um cron)

> Pergunta-âncora (MRO): **o que correu que eu não autorizei e podia ser irreversível?**
> Honestidade estrutural (refutação aceita): este pilar é ~100% L0 zero-LLM. O destino certo é **script cron + testes de CI que falham em crescimento + alerta por limiar** — não um cargo com cerimônia. Esta skill existe para (a) correr a bateria à mão até o cron aterrar, (b) responder a alertas. **Nunca gradua** (H3). Kill-switch: se algo cheira a segredo exposto → STOP global via mooter_setup imediato, sem esperar a ronda.

## Bateria L0 (via device_bash, $0, read-only)

```
wc -l SYNC.md                                  # regra ≤200 · 15/08: 3.438 ⚠️
ls _handoff/*.md | wc -l                       # meta 0 executados no topo · 15/08: 186 ⚠️
ls | wc -l                                     # raiz · 15/08: 50
git status --porcelain | grep -c '^??'         # untracked · 15/08 Mac: 0 ✅
git stash list | wc -l                         # stashes · 15/08 Mac: 0 ✅
shasum -a 256 tools/router/classify.js         # tem de ser 427d8c0b… · 15/08: ✅
git worktree list                              # stale? mtime > 7d = preso
git log origin/main..main --oneline | wc -l    # unpushed local
grep -rEl '(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16})' --include='*.md' _handoff/ | head  # padrão de segredo
```
Ledger: `permissoes_pedidas` vs `permissoes_efectivas` (`diferem:true` = anotar); jobs fora de worktree; eventos sem cargo.

## Regras
- Cada número comparado com a última ronda — **este pilar só fala em deltas numéricos**.
- L1 só para triagem de untracked em 3 baldes (lixo óbvio / arquivar / rever humano) — sugestão flagada, NUNCA delete. Todo arquivo em massa = lista explícita + gate Paulo + `mv` para `_archive/` (nunca `rm`).
- Provar negativa ("nada correu sem autorização") exige prev_hash chain no ledger — enquanto não existir, a resposta é `n/d — cadeia por implementar`, não "nada".

## Gauntlet (com comando)
1. sha classify verificado NESTA ronda? → `shasum` acima.
2. Permissões pedidas vs efetivas: onde diferem? → ledger.
3. Untracked/stashes/_handoff/SYNC: deltas vs última ronda? → bateria.
4. Algum job tocou path da lista SELF_GOVERNANCE? → ledger + git log.
5. Worktree stale com trabalho preso? → `git worktree list` + mtime.

## Saída
Recibo RECIBO_DE_FECHO (só números e deltas) + `mooter_journal`. Proposta permanente enquanto não existir: "aterrar isto como cron + CI com limiares" — é a decisão nº1 que este pilar pede ao MEO.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-pilar-produto/SKILL.md =====
---
name: moo-pilar-produto
description: Pilar P6 — Produto & Experiência. Ronda GPU-local de dieta de payloads, honestidade do site e prontidão para o usuário nº2 — medição L0 primeiro, triagem L1 flagada depois; decisão de produto é sempre do MEO. Usar quando o Paulo disser "/moo-pilar-produto", "ronda de produto", "o onboarding está pronto?", "dieta de payloads", ou quando /moo-talo escolher P6.
---

# /moo-pilar-produto — P6: o que o usuário vê, medido antes de opinado

> Pergunta-âncora: **um usuário nº2 consegue instalar hoje — e qual é o PRIMEIRO passo que parte, com evidência?** (GATE F0: simulação deu 3/10; distribuição 0/10.)
> Anti-vanity: painel que não muda decisão não entra. Decisão de design/produto: **sempre MEO** (MPO não nasce — deriva nº5 da GOVERNANCA_MEO).

## Protocolo: segue /moo-talo. Específico do P6:

### MEDE ($0, L0)
- Payloads reais: `mooter_fleet({view:'jobs'})` e `view:'recibo'` → bytes, % de campos a zero/null, repetições (goal 4× no mesmo payload — achado Wave J). Meta pós-dieta: −67% recibo, −75% jobs.
- Smoke de distribuição = **checks de script, não ronda** (refutação aceita): `.mcpb` publicado como release asset? `classify.js` dentro do bundle? `manifest.json` valida e a versão bate a tag? `install.sh` copia o template certo? → cada um é candidato a teste de CI.
- `files_touched`/keep rate: instrumentado? (hoje: 0 eventos → a proposta é a linha de instrumentação, não o número).

### PROPÕE (GPU, $0)
- Dieta de payload: 1 superfície por job — "Neste JSON de <view>, lista campos sempre-zero/sempre-null/duplicados nesta amostra de N payloads. Só o que está na amostra."
- Draft de microcopy PT-BR flagado `moo-draft` (texto final: humano).
- ❌ Triagem visual de UI: **fora do loop** — os residentes são text-only; volta quando houver VLM certificado no MooterBench contra julgamentos do Paulo.

### TESTA
- Replay do mesmo pedido com payload dieta → diff de bytes + prova de que nenhum campo não-zero sumiu. Campo não-zero removido sem gate humano = draft morto.
- Consumidor partiu (Cockpit, skill)? → revert imediato.

### Gauntlet (com comando)
1. Usuário nº2 instala? Primeiro passo que parte? → checklist de distribuição (grep .gitignore, release assets, manifest).
2. % de zeros no recibo e bytes do view=jobs vs meta? → medição L0 da ronda.
3. Keep rate: número ou n/d + a 1 linha que falta? → ledger (files_touched).
4. Que ecrã/skill/página promete o que o código não faz? → handoff para P3 (par claim↔código).
5. Que mudança de UX desta ronda tem antes/depois MEDIDO? → recibos; sem medição = "por parecer bonita" e não entra.

### Recibo
RECIBO_DE_FECHO + `mooter_journal`, com antes/depois por superfície. Decisões de produto pedidas ao MEO: máx. 1 por digest.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-pilar-routing/SKILL.md =====
---
name: moo-pilar-routing
description: Pilar P1 — Routing & Custo (cargos MFO+MIO). Ronda GPU-local sobre misroutes, quota e poupança-líquida do Mooter. Usar quando o Paulo disser "/moo-pilar-routing", "ronda de routing", "o routing está certo?", ou quando /moo-talo escolher P1 neste device.
---

# /moo-pilar-routing — P1: para onde vai cada prompt, e a que custo

> Pergunta-âncora (MFO+MIO): **que decisão de routing mudou por causa de um RESULTADO real — e a poupança-líquida é número ou n/d?**
> ⚠️ Estado bloqueante herdado: poupança-líquida = **n/d** → enquanto for n/d, **este pilar MEDE e não propõe**. "Poupança 47%" é contrafactual sem recibo — banido.

## Protocolo: segue /moo-talo (arranque verde, mutex, orçamento). Específico do P1:

### MEDE ($0, L0)
- `mooter_fleet({view:'recibo', periodo:'semana'})` → custo real por tier, tokens locais/nuvem, jobs medidos vs sem medição.
- `mooter_fleet({verbose:true})` → `combustivel` (pressão de quota, dedup, cache lido — a fatia de releitura de cache cola-se a qualquer número).
- `device_bash`: janela do `decisions.log`/ledger — contagem de decisões por tier, `local_decisao` presente? (se ausente em 100%, essa É a proposta da ronda).

### PROPÕE (GPU, $0) — jobs moo bounded
- 1 decisão por job: "Dado este registo de routing <JSON de 1 decisão>, lista os factos objetivos presentes (tier, categoria, tokens, custo) e marca `candidato_replay: sim/não` se o registo indicia tier acima do mínimo. NÃO julgues correção — só triagem para replay."
- Digest da janela: "Resume estas N decisões em tabela tier×categoria×custo. Nada fora dos dados."

### TESTA
- ❌ Misroute NUNCA se declara por opinião de L1. Só com **downgrade A/B real**: propõe ao Paulo re-executar N candidatos no tier abaixo (custo de calibração entra na poupança-líquida). O L1 só ordena a fila de candidatos.

### Gauntlet (cada pergunta com o comando que a responde)
1. Poupança-líquida da janela: número ou n/d? → `recibo` da fleet + custo de fronteira da sessão. n/d → só medir.
2. Quota: a barra da app diz X%, o nosso número diz o quê? → `combustivel.pressao` (limite inferior, ressalva colada).
3. `local_decisao {local, porque, confianca}` gravado em quantos % dos dispatches? → grep no ledger.
4. Fatia de releitura de cache da janela? → `combustivel` (último medido: 53,8% — se n/d, dizer).
5. Quantos candidatos a replay acumulados e quantos re-executados de facto? → ledger da wave.

### Recibo
Formato RECIBO_DE_FECHO + `mooter_journal`. Proibido: "poupança", "otimizado", número sem fonte. Fecho: ≤3 ações, ≤1 pergunta ao MEO.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-pilar-qualidade/SKILL.md =====
---
name: moo-pilar-qualidade
description: Pilar P2 — Qualidade & Verificação (cargo MTO). Ronda GPU-local de review de diffs, guarda de recusa e scorer das propostas dos outros pilares. Usar quando o Paulo disser "/moo-pilar-qualidade", "ronda de qualidade", "revisa os diffs pendentes", ou quando /moo-talo escolher P2 (device com 30B — RTX 4090).
---

# /moo-pilar-qualidade — P2: o que está verde por não estar a ser testado?

> Pergunta-âncora (MTO): **o que está verde por NÃO estar a ser testado?** Este pilar assina as propostas de todos os outros. **Nunca gradua** (H3). É pré-requisito: nenhum outro pilar propõe sem o P2 ter guarda de recusa + default-FAIL ativos.
> Device: precisa do 30B para review de diff (prior: 32B ~88%, 14B ~75% piso, 7B proibido — promptquorum 06/2026, **hipótese até medir aqui**).

## Protocolo: segue /moo-talo. Específico do P2:

### MEDE ($0, L0)
- `device_bash`: suites targeted do que mudou (`npm test` no pacote tocado — runner NATIVO conta, sandbox não).
- Ledger: jobs `done` com recusa/erro no conteúdo (guarda de recusa apanhou?); contagem de `regressed`.
- Golden set: nº de casos hoje (meta ≥100 antes de qualquer decisão de suspensão; semear com as falhas reais documentadas: A4, G.3, J0-A, kimi).

### PROPÕE (GPU, $0)
- 1 diff mono-tema por job: "Revê este diff <conteúdo>. Devolve findings com ficheiro:linha + severidade + 'o que NÃO verifiquei'. Formato JSON. Não inventes linha que não está no diff."
- Painel de juízes nas propostas dos outros pilares: 2-3 modelos de famílias diferentes, rubrica binária, **swap A/B** (veredicto tem de sobreviver à troca de ordem), senão `inconclusivo`.

### TESTA
- Default-FAIL: finding sem ficheiro:linha real (grep confirma) morre.
- Kappa: **semanal**, contra o golden set — não por ronda (IC de 30-50 casos é ±0.15-0.2, não distingue nada).
- Auto-suspensão: só por evento `regressed` confirmado pós-apply — nunca por "falso-PASS intra-ronda" (indetetável por definição).

### Só nuvem/humano
Correção profunda (JudgeBench: nem GPT-4o), anti-patterns arquiteturais, performance, final-reviewer T3 pré-PR (caro por design, nunca cron), desempate do painel.

### Gauntlet (com comando)
1. Testes saltados a contar como passados? → saída literal do runner (skipped ≠ passed).
2. Jobs done-com-erro que a guarda apanhou vs deixou passar? → ledger.
3. Kappa da semana no golden set (nº de casos)? → registo do golden set; sem set, `n/d — semear primeiro`.
4. Regressões pós-apply e tempo-até-revert? → eventos `regressed` no ledger.
5. Que teste novo nasceu de falha REAL desta semana? → diff dos testes + falha-mãe citada.

### Recibo
RECIBO_DE_FECHO + `mooter_journal`. Cada afirmação: ficheiro:linha ou saída literal. Sem isso, `n/d`.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-pilar-coerencia/SKILL.md =====
---
name: moo-pilar-coerencia
description: Pilar P3 — Coerência Doc↔Produto (cargo MCC). Ronda GPU-local que caça documentos canônicos que mentem — claims de skills/site sem código correspondente, SYNC.md fora da regra, shas divergentes. Usar quando o Paulo disser "/moo-pilar-coerencia", "ronda de coerência", "que doc está mentindo?", ou quando /moo-talo escolher P3 neste device.
---

# /moo-pilar-coerencia — P3: que documento está a mentir hoje?

> Pergunta-âncora (MCC): **que documento canônico mente HOJE, com ficheiro:linha do claim e ficheiro:linha do código que o desmente?**
> Precedente real: Wave J achou 3 de 5 skills com claims falsos; 15/08: `WAVE41_46_REPORT.md` (na RAIZ) cita sha antigo `7b01eb86` como "INTACT" enquanto disco+CLAUDE.md dizem `427d8c0b…` — raiz mente, archive é história.
> ⚠️ Lição de 15/08 (comigo mesmo): um agente leitor citou "ROUTING.md" como fonte do sha errado e a citação era falsa — **finding sem grep próprio morre, inclusive o teu**.
> ⚠️ Prior DocPrism: prompting direto é inútil (flag 82-97%); pipeline decomposto chega a precision 0.63 **num 70B** — nos nossos 20B é DESCONHECIDA → 1ª ronda = medir em 50 pares rotulados.

## Protocolo: segue /moo-talo. Específico do P3:

### MEDE ($0, L0)
- `device_bash`: `wc -l SYNC.md` (regra ≤200; hoje 3.438); `ls _handoff/*.md | wc -l` (hoje 186); mtime dos canônicos; grep literal de claims mecânicos (nomes de parâmetros de skills vs código, shas citados vs `shasum` real).
- **Só o delta:** pares claim↔código cujo ficheiro mudou de mtime desde a última ronda. Nunca o corpus inteiro (prefill domina no M4; corpus completo = 4-15h).

### PROPÕE (GPU, $0)
- 1 par por job, micro-pergunta fechada: "O parâmetro/claim <X> citado em <doc>:<linha> existe em <ficheiro de código>? Responde {consistente | inconsistente | n-d} + citação exata."
- Digest de canônico longo: **PROIBIDO até SYNC.md ≤200 linhas** — a correção é a tesoura (J-0b) + teste de CI, não um resumidor a mastigar o problema.

### TESTA
- Filtro L0 mata citação inventada: o grep tem de encontrar a linha citada. Finding sem grep = morto.
- Top-5 "docs que mentem" por gravidade — com a taxa de falsos positivos da ronda anotada (o Paulo desmente, o caso vira golden set).

### Só nuvem/humano
Reescrita do doc canônico (draft local + promoção humana); decidir se claim comercial sai do site; arbitrar divergência ambígua.

### Gauntlet (com comando)
1. SYNC.md linhas hoje vs 200 + delta desde a última ronda? → `wc -l`.
2. Existe teste de CI que falha se voltar a crescer? → `ls .github/workflows` + grep. Hoje: n/d.
3. Que claim de skill não tem grep correspondente no código? → bateria de greps.
4. Shas citados em docs batem com `shasum` real? → comparação direta (achado vivo: ROUTING.md).
5. Dos drafts da última ronda, quantos promovidos vs rejeitados e porquê? → ledger + digest anterior.

### Recibo
RECIBO_DE_FECHO + `mooter_journal`. Cada finding: doc:linha + código:linha + grep que prova. Precision da ronda declarada (confirmados/flagados) ou n/d.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-pilar-motor/SKILL.md =====
---
name: moo-pilar-motor
description: Pilar P5 — Motor Local & GPU (cargo MOO). Ronda sobre o orçamento de VRAM de cada máquina, renda por modelo residente, MooterBench e capacidade real do tier local. Usar quando o Paulo disser "/moo-pilar-motor", "ronda do motor", "a GPU está rendendo?", "que modelo devo ter residente?", ou quando /moo-talo escolher P5.
---

# /moo-pilar-motor — P5: cada GB de VRAM paga renda em recibos

> Pergunta-âncora (MOO): **que fatia foi feita a $0 e o que impediu o resto, job a job?** E a segunda, da Wave J: **que modelo residente NÃO pagou a renda** (VRAM ocupada × recibos produzidos)? "Effort sem recibo é ventilador a girar."
> Dono da REGRA DE ORÇAMENTO DE VRAM (inviolável): folga ≥2,2 GB; na 4090 o pequeno é residente e o 30B sob demanda (inversão do erro Wave J); no Mac, nunca servidor partilhado entre >30B e pequenos (ollama#14578).

## Protocolo: segue /moo-talo. Específico do P5:

### MEDE ($0, L0)
- `mooter_fleet({verbose:true})` → `local_available`, fatia $0, jobs local vs cloud. ⚠️ No Mac o painel diz "GPU indisponível" porque a sonda é nvidia-smi-only — anotar como bug de produto (proposta permanente: sonda Apple Silicon via mactop/ioreg).
- `device_bash`: modelos instalados (`ls ~/.ollama/models/manifests/...`), tamanho em disco; no Windows: `nvidia-smi` (VRAM pico, folga mínima da janela).
- Ledger: `prep_timeout`, `downgraded`, `duration_s`, `tokens_out` por modelo — tok/s efetivo e taxa de falha por modelo.

### PROPÕE (GPU, $0)
- Draft de config por máquina (keep_alive por modelo, NUM_PARALLEL, qual residente) como **step em mooter_setup — nunca aplicado a quente**. Troca de residente = decisão do MEO (afeta todos os pilares da máquina).
- Job moo de classificação de falhas: "Classifica estes N registos de job {timeout | OOM | recusa | erro real | interrompido} — só com base nos campos presentes."

### TESTA
- Canary: 10 jobs sintéticos (fixtures MooterBench) com a config candidata num slot isolado → tok/s e taxa de timeout vs baseline. Piorou ou folga <2,2 GB → draft morre com evento `incident`.
- Deriva de modelo: qualquer troca de residente **invalida kappa e certificações** → re-correr MooterBench é parte do custo da troca, declarado no draft.

### Só nuvem/humano
Troca de residente (gate MEO) · treino de LoRA (só após A/B shadow com outcomes pareados; até lá o recibo diz "combustível recolhido", nunca "o modelo melhorou") · claims públicos de desempenho.

### Gauntlet (com comando)
1. Fatia a $0 da janela e razão específica de cada recusa? → fleet recibo + ledger.
2. Folga mínima de VRAM da ronda; houve prep_timeout/downgrade? → nvidia-smi/ledger (no Mac: n/d até a sonda existir — dizer).
3. Renda por modelo: recibos produzidos por GB residente? → ledger × modelos.
4. Skills a correr local sem certificação MooterBench? → lista (resposta certa: 0).
5. tokens_poupados: calculado com tabela à vista ou null? → ledger (LH-5).

### Recibo
RECIBO_DE_FECHO + `mooter_journal`, com o orçamento de VRAM declarado no topo (residentes + picos + folga). Sem medição de VRAM no device → n/d com o porquê, nunca estimativa disfarçada.
===== ./.claude/worktrees/mystifying-bohr-78f90b/skills/moo-talo/SKILL.md =====
---
name: moo-talo
description: Consola de rondas GPU-local do Mooter — abre UMA ronda bounded do pilar certo para este device, com mutex de GPU, orçamento de VRAM, recibos no vault e gate humano. Usar quando o Paulo disser "/moo-talo", "põe a GPU a trabalhar", "abre uma ronda", "o mac não pode ficar ocioso", ou ao iniciar sessão de trabalho autônomo num device.
---

# /moo-talo — a GPU não para, mas nunca mente

> Doutrina: `40-strategy/mooter-gpu-pilares-2026-08-15` (vault) + GOVERNANCA_MEO + Harmony Mesh.
> **Métrica banida:** % de utilização de GPU. **Métrica real:** recibos-que-passam-o-check por hora, dentro do orçamento de VRAM.
> A sessão Cowork é **consola + abridora de rondas** — o trabalho $0 corre no `local-loop-runner` host-side.
> **Estado real (verificado 2026-08-15, não presumido):** o runner ESTÁ em main desde `1c0c077a`
> (`_handoff/loop/local-loop-runner.mjs`, suite nativa verde), e o gate pré-dispatch — STOP em
> `~/.mooter/stop.json` a falhar fechado, folga de VRAM tri-estado, 1 pilar por GPU via lease —
> vive em `packages/fleet-commander/src/stop-gate.mjs`. Mesmo assim, **cada ronda tem princípio,
> meio, fim e recibo**: isso é desenho, não uma limitação temporária à espera de daemon.

## Passo 0 — ARRANQUE VERDE (obrigatório, nunca saltar)

1. `mooter_fleet({verbose:true})` → confirma: `local_available:true`, worktree livre, **jobs live**.
2. **Mutex de GPU:** se há job live de OUTRO pilar neste device → esta ronda **só mede** (passo MEDE), não despacha. Um pilar ativo por GPU de cada vez.
3. **STOP:** se `mooter_setup` mostrar bloqueio/STOP declarado → parar e reportar. Nada se despacha.
4. `device_bash`: `shasum -a 256 tools/router/classify.js` → tem de bater `427d8c0b516315c6…`. Divergiu → STOP + escalar ao MEO.
5. `mooter_setup({id:'<pilar>', project:'mooter-pilar-<X>', session_model:'<modelo desta sessão>', steps:[...]})` — o plano da ronda fica visível no painel.
6. Escolhe o pilar pela tabela device×pilar (abaixo) + rotação: **máx. 2 pilares/dia no total da frota**. Fila de decisões humanas ≥3 hoje → todos os pilares só medem.

| Device | Pilares elegíveis | Receita de modelos |
|---|---|---|
| Mac mini | P1 routing · P3 coerência · P6 produto (P4 é cron, não ronda) | gpt-oss:20b residente + leve (gemma4/qwen); NUM_PARALLEL>1 só nos pequenos; nunca servidor partilhado com >30B |
| PC RTX 4090 | P2 qualidade · P5 motor | pequeno (7-9B) RESIDENTE como verificador + 30B SOB DEMANDA — folga ≥2,2 GB sempre |
| MacBook | ronda curta de qualquer pilar | throttle 20-30 min — nunca lease longo |

## Passos 1-7 — a ronda

1. **MEDE ($0, L0):** roda a bateria da skill do pilar (`/moo-pilar-*`). Números com comando à vista, nunca opinião.
2. **PROPÕE (GPU, $0):** fila de `mooter_work({agent:'moo', cargo:'<CARGO>', wave:'<pilar>-<data>', goal:'<1 input fechado>'})` — 1 diff, 1 par claim↔código, 1 decisão por job. Output em formato verificável, flag `moo-draft`. ❌ Nunca 1 job agentic longo. ❌ Nunca `write:true` sem o Paulo pedir.
3. **TESTA:** `mooter_check({wave})` + validação determinística: citação existe (grep via `device_bash`), schema bate. **Default-FAIL** — draft nasce reprovado; só passa quando a evidência foi LIDA.
4. **REGISTA:** recibo no formato RECIBO_DE_FECHO (7 blocos, nenhum inventado, "o que NÃO verifiquei" obrigatório) + `mooter_journal({kind:'learning', wave, title:'Ronda <pilar> <data>', body:<recibo>})` + `mooter_setup({sessao:'registar', feito, por_fazer, proximo})`.
5. **GATE HUMANO:** drafts sobrevivem como propostas no digest — **1 digest consolidado, ≤3 decisões/dia**. Push, merge, delete, troca de modelo residente, faixas do scorecard: sempre Paulo. A skill NUNCA executa o irreversível.
6. **REVERTE:** regressão pós-apply → revert + evento no ledger + caso entra no golden set do P2.
7. **CONTINUA OU FECHA:** enquanto (a) a fila L0 tem itens, (b) o orçamento da ronda não estourou (defina no passo 0: nº de jobs ou minutos), (c) não há STOP — despacha o próximo lote. Senão: fecha com recibo. Só oferece criar tarefa agendada DEPOIS de a ronda manual correr verde uma vez.

## Regras que não se negoceiam

- **Evidência ou `n/d`.** Recibo é composição do ledger/git/disco — nunca redação livre.
- **"Poupança" é palavra proibida** em recibo até existir A/B pareado. Reporta: custo real, tokens locais medidos, custo de fronteira da sessão (inclui a TUA quota).
- **Folga de VRAM ≥2,2 GB** é restrição bloqueante: não cabe → o job não despacha (veto MOO), não "tenta e reza".
- **1 pilar = 1 worktree = 1 device por vez.** Dois writers no mesmo repo nunca.
- Moos = transforms bounded single-shot. Nunca agentic <30B, nunca escrita canônica direta.
- Perguntas de gauntlet sem comando L0 declarado não se fazem em loop — vão para a revisão trimestral do Paulo.
- Fecha SEMPRE com no máximo 3 ações sugeridas e no máximo 1 pergunta.
===== ./.claude/skills/moo-pilot/SKILL.md =====
---
name: moo-pilot
description: Moo Pilot — o cockpit por device do Mooter. Levanta o motor local, o endpoint e o loop desta máquina, e abre o painel ao vivo em 127.0.0.1:4290/panel com GPU medida, os 10 pilares, os recibos por veredicto e a frota. Tudo da GPU e do ledger local, $0. Usar quando o Paulo disser "/moo-pilot", "abre o pilot", "cockpit do device", "o que a GPU está a fazer?", ou ao configurar um device novo.
---

# /moo-pilot — cada device é um funcionário com cockpit próprio

> **Nome oficial:** Moo Pilot. **Um cockpit por device**, nunca um agregador central.
> Código canónico: `tools/cockpit/runner/` (com testes: `npm run test:cockpit-runner`).
> Shell: `tools/cockpit/moo-pilot-shell.html`. Nada disto vive numa skill — a skill
> só sabe conduzir o que já está no repo.

## Uma máquina que nunca correu isto

```bash
node ~/paulo-vault/.claude/moo-bootstrap.mjs
```
```powershell
node $HOME\paulo-vault\.claude\moo-bootstrap.mjs
```

Clona o repo, alinha tudo e **levanta o cockpit**. Um comando, do zero ao painel
aberto. É o único que precisa de ser dito a alguém que nunca mexeu nisto.

## O gesto

**macOS / Linux**
```bash
cd ~/frugal && npm run pilot
```

**Windows (PowerShell)**
```powershell
cd $HOME\frugal ; npm run pilot
```

**Alinha primeiro, depois levanta.** Puxa o código, espelha o runtime e as
skills, reconstrói o índice do vault — e só então levanta o endpoint e o loop e
abre o painel. `--no-sync` salta o alinhamento para quem está a depurar.

Não mandes o Paulo correr `/moo-sync` antes disto: o alinhamento já vai
incluído, e um comando a mais é mais uma forma de falhar. `npm run pilot:status` reporta sem arrancar nada.

O código é o mesmo nos dois sistemas — `launch.mjs` já abre o browser com `open` no
macOS e `cmd /c start` no Windows, e o `autostart.mjs` instala um LaunchAgent ou uma
tarefa do `schtasks` conforme a máquina. **O que muda é só a sintaxe da linha de
comandos.** Se estiveres a conduzir uma máquina Windows, NUNCA mandes `export VAR=x`
nem caminhos com `~/` — em PowerShell é `$env:VAR = "x"` e `$HOME\frugal`.

**O lançamento NUNCA levanta o STOP.** Lançar é "mostra-me os controlos"; trabalhar é o
▶ do dono. Se o STOP estiver activo, o cockpit abre com a máquina parada e o botão pronto.

## Ladder de dados — e a regra que a governa

1. **Ao vivo** — `GET http://127.0.0.1:4290/fleet.json`, poll 3s. É o único modo que
   **conduz**: ▶/⏸ e o foco por pilar precisam do endpoint.
2. **Instantâneo** — `node tools/cockpit/runner/build-shell-snapshot.mjs` injecta
   `window.__MOOTER_SNAPSHOT__` num HTML autónomo. Abre em qualquer lado, **não controla
   nada**, e diz isso num banner permanente.
3. **Silêncio honesto** — sem endpoint e sem snapshot, a página mostra o endereço vivo e o
   comando que o levanta. Nunca um número inventado, nunca um botão morto.

> **Não mandes o snapshot quando o Paulo pediu o cockpit.** Um snapshot num painel lateral
> sandboxed não alcança o `127.0.0.1` — os controlos ficam inertes e parece que o produto
> está partido. Custou-nos exactamente isso uma vez. Snapshot é para arquivar ou partilhar,
> nunca para conduzir.

## O que fazes, por ordem

1. **Estado real primeiro:** `npm run pilot:status`. Reporta o que está vivo e o que não está,
===== ./.claude/skills/local-first-default/SKILL.md =====
---
name: local-first-default
description: Prefer FREE local Ollama execution paths (mooter workflow, local-summarizer/local-transformer subagents) for summarize/extract/transform/compare tasks before burning any cloud tokens. Use when planning how to execute a task that smells like T0 work, or when the user asks "can this run locally?".
---

# /local-first-default

Mooter's mission is local-first: route every turn to the cheapest model that
can do it well. Local Ollama costs **$0**; every cloud call costs real money.
Before executing summarize/extract/transform/compare/translate work in a cloud
model, check the local paths first.

## The smell test (apply before every inline cloud execution)

> **"Can a local model do this alone with the inputs I can hand it?"**

If yes → delegate. The 1-2s spawn overhead never outweighs cloud token cost.
The saving is only real when the delegation actually happens — otherwise the
statusline shows `∅ 0% saved (all-Opus)`.

Signals that the answer is YES:
- Summarize / explain a file or diff
- Extract fields, lists, or structure from text
- Format/syntax transforms (JSON↔YAML, table↔list, rename sweeps)
- Compare 2-3 snippets, brainstorm variants, translate
- Fan-out work across many files where each unit is independent

Signals that the answer is NO (keep the routed tier):
- Multi-file architectural judgment, tradeoff decisions
- HIGH_RISK: `.env*`, CI/CD, migrations, secrets, pre-push/merge/deploy
- The task depends on un-persisted session state a fresh worker cannot see
  (declare that dependency in one line before inlining)

## Local execution paths (in order of preference)

| Path | When |
|---|---|
| `local-summarizer` / `local-transformer` subagents | Single-unit summarize/extract/transform — spawn via Agent tool |
| `mooter workflow run "<task>"` (or `/moo-workflow`) | Many files / fan-out: free local Ollama workers + at most ONE cloud synthesis call |
| `bash ~/.claude/tools/router/ollama_call.sh --text "<prompt>"` | Quick one-shot local call from the shell |
| `mooter local-models` | List what is actually pulled locally before promising a model |

## Honest caveats

- Check Ollama is up before promising local execution
  (`curl -s --max-time 1 http://127.0.0.1:11434/api/tags`); if it's down, say
  so and fall back to the routed tier — don't silently burn Opus.
- Local-first is a default, not a ceiling: tier floors and safety boosts
  always win. Never downgrade HIGH_RISK work to local to save money.
- Quality intent (`quality_intent: high`) or an explicit user model pin
  overrides this skill.
===== cockpit runner (headers) =====
--- tools/cockpit/runner/launch.mjs
#!/usr/bin/env node
/**
 * launch.mjs — one gesture: put THIS device's cockpit on screen, live.
 *
 * What it does not do is as important as what it does. It never clears the STOP
 * flag: launching the cockpit is "show me the controls", not "start working".
 * The owner presses ▶ in the panel, and that press is the consent. A launcher
 * that silently resumed a stopped device would make the kill-switch a
 * suggestion — and this is exactly the path a scheduler or LaunchAgent would
 * take, which is where a fail-open actually bites.
 *
 * Every step reports what it found rather than what it assumed, and a step that
 * cannot be satisfied stops the launch with the concrete fix instead of opening
 * a cockpit wired to nothing.
 *
 *   node tools/cockpit/runner/launch.mjs          # start what is down, open the panel
 *   node tools/cockpit/runner/launch.mjs --status # report only, start nothing
 *   node tools/cockpit/runner/launch.mjs --no-open
 */

import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HOST, PORT } from './f10-server.mjs';
import { deviceName, beaconDir } from './fleet-beacon.mjs';
import { autoVerificar } from './self-check.mjs';
--- tools/cockpit/runner/runner-core.mjs
/**
 * runner-core.mjs — one bounded round of the $0 autopilot.
 *
 * Three guarantees are mechanical here, not promised in prose:
 *  1. `$0 duro` — `assertLocalEngine()` refuses any endpoint that is not the
 *     local Ollama loopback, so the delivered runner cannot reach a paid API
 *     even if someone edits the config.
 *  2. `fail-closed` — the STOP flag is read twice: once before the round is
 *     built and again in the last instruction before dispatch, which closes the
 *     check-then-act race.
 *  3. `evidencia ou n/d` — every receipt carries a verdict produced by
 *     `evidence-verifier.mjs` against real files, never a hardcoded label.
 *
 * All I/O is injected so the round is testable without a GPU or a network.
 */

import fs from 'node:fs';
import { buildContextPack, PILLARS, PILLAR_IDS } from './context-pack.mjs';
import { verifyEvidence, VERDICT } from './evidence-verifier.mjs';
import { deviceName } from './fleet-beacon.mjs';

export const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:14b';
export const DEFAULT_TIMEOUT_MS = 90_000;
export const NUM_PREDICT = 700;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const OLLAMA_PORT = '11434';

/**
--- tools/cockpit/runner/evidence-verifier.mjs
/**
 * evidence-verifier.mjs — the L0 gate that turns "nao-verificado" into a verdict.
 *
 * Zero LLM, zero network, zero cost: it reads the model's answer, extracts every
 * `path:line` citation, and confronts each one with the real file on disk. A
 * citation that points at a file that does not exist, or past the end of the
 * file, is a fabricated reference and sinks the whole receipt.
 *
 * The host-side prototype stamped every receipt `ollama:<model> nao-verificado`
 * regardless of content, which is how 174 hallucinated findings were counted as
 * work. This module is the difference between a counter and a proof.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Verdicts, ordered from best to worst.
 *
 * `citacao-ok` is deliberately NOT called "verificado": this gate proves the
 * cited line exists and shows what is on it — it does NOT prove the finding is
 * correct. Labelling an untriaged claim "verificado" would be exactly the
 * green-that-lies this runner exists to remove. Triage of the claim itself is a
 * separate, human- or critic-side step.
 */
export const VERDICT = {
  CITED: 'citacao-ok',
  REFUTED: 'refutado',
  UNCITED: 'sem-citacao',
  NO_FINDING: 'sem-achado',
===== onboarding =====
./landing/app/onboarding
./tools/router/onboarding.js
./docs/ONBOARDING_DEV.md
./docs/ONBOARDING_GUIDE.md
./_handoff/MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md
./_handoff/GEMINI_FAMILY_ONBOARDING_MASTERPROMPT.md
./packages/mooter-bridge/onboarding.js
./packages/mooter-bridge/onboarding.test.js
--- tools/router/onboarding.js
#!/usr/bin/env node
/**
 * onboarding.js — first-run experience for mooter.
 *
 * Detects hardware, asks about subscriptions, fetches community config,
 * and shows a summary of expected savings. Called automatically by
 * inject_context.js when hw-capability.json or subscription-profile.json
 * are missing, or manually: node onboarding.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HW_CAP_PATH = path.join(ROUTER_DIR, 'hw-capability.json');
const SUB_PROFILE_PATH = path.join(ROUTER_DIR, 'subscription-profile.json');

function needsOnboarding() {
  return !fs.existsSync(HW_CAP_PATH) || !fs.existsSync(SUB_PROFILE_PATH);
}

function step(n, msg) {
  console.log(`  ${n}. ${msg}`);
}

async function main() {
  console.log('');
  console.log('  mooter — first-time setup');
  console.log('');

  // Step 1: Hardware detection
  step(1, 'Detecting hardware...');
  const gpuProbe = path.join(ROUTER_DIR, 'gpu-probe.js');
  if (fs.existsSync(gpuProbe)) {
    const r = spawnSync(process.execPath, [gpuProbe], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (r.status === 0) {
      try {
        const hw = JSON.parse(fs.readFileSync(HW_CAP_PATH, 'utf8'));
        console.log(`     ✓ ${hw.name || hw.vendor} detected${hw.vram_mb ? ` (${Math.round(hw.vram_mb / 1024)}GB VRAM)` : ''}`);
        console.log(`     ✓ hw_tier: ${hw.hw_tier}`);
        console.log(`     ✓ Recommended local model: ${hw.recommended_t0}`);
      } catch {
        console.log('     ✓ Hardware probe completed');
--- packages/mooter-bridge/onboarding.js
'use strict';

/**
 * onboarding.js — os 5 gaps da auditoria de onboarding, fechados num sítio só.
 *
 * FONTE DOS GAPS (não re-descobertos — citados): `_handoff/SUPERMASTER_MAC_MINI.md:100-111`,
 * tabela «Top 5 gaps do onboarding (auditoria real, file:line)»:
 *
 *   1. git/gh nunca verificados no boot   → 6 verdes e o 1º job falha com "git not found"
 *   2. Falhas de Ollama indistinguíveis   → moo.js:32-59, tools6.js:71-73
 *   3. Vault n/d para sempre, sem dica    → journal.js:34-58
 *   4. `user_config` nunca validado       → manifest.json:40-66
 *   5. install-id efémero em silêncio     → install-id.js:45-59
 *   + extra: «não existe first-run de verdade» (linha 110)
 *
 * REGRAS DESTE FICHEIRO (as mesmas do resto do conector):
 * - Zero dependências. Só builtins do Node.
 * - **Nunca lança.** Uma dependência em falta é uma linha vermelha, não uma excepção.
 * - **Nunca inventa.** O que não foi medido sai `null`/`n/d` com o motivo ao lado.
 * - **Nunca imprime segredos.** Da `moonshot_api_key` só sai presença e forma — jamais o valor,
 *   nem um prefixo, nem os últimos dígitos. Ver `validarUserConfig`.
 * - Cada diagnóstico vermelho traz **uma linha de conserto accionável**, por OS. Um vermelho sem
 *   conserto é o mesmo que silêncio para quem acabou de instalar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const MOOTER_DIR = path.join(os.homedir(), '.mooter');
const INSTALL_FILE = path.join(MOOTER_DIR, 'install-id.json');

// ───────────────────────────────────────────────────────────── GAP 1 · git/gh ──

/**
 * Varre o PATH por um executável (com as extensões do Windows).
 * Cópia deliberada de `tools6.cliNoPath`: este módulo não pode depender de tools6.js,
 * porque é tools6.js que depende dele. Duplicação de 10 linhas < ciclo de require.
 */
function noPath(bin) {
  const dirs = String(process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(path.delimiter).filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(dir, bin + ext);
      try {
        if (!fs.existsSync(p)) continue;
===== matriz de modelos =====
packages/cli/tests/matrix.test.ts
packages/cli/tests/pricing.test.ts
packages/cli/src/commands/pricing.ts
packages/cli/src/commands/matrix.ts
packages/overclock-moo/src/matrix-bridge.ts
packages/mooter-bench/tests/pricing.test.ts
packages/workflow/src/pricing.ts
packages/router/tests/specialization-matrix.test.ts
packages/router/tests/matrix-engine.test.ts
packages/router/scripts/wave2-benchmark/lib/pricing.ts
// specialization-matrix.ts — Wave 58 model × category specialization matrix.
//
// ── WHY THIS MATRIX IS SPARSE (anti-fabrication + adaptive growth) ───────────
//
// The matrix is 17 models × 24 categories = 408 logical cells.  The vast
// majority start EMPTY ({ score: null, source: "unknown", measured: false }).
// This is a deliberate design choice, not an oversight:
//
//   1. ANTI-FABRICATION (DOCTRINE V4 #5).  Mooter's brand is honest pricing and
//      honest capability claims.  We seed ONLY the cells for which a real,
//      cited benchmark exists (read from the Wave 58 benchmark seed via
//      benchmark-fetcher's loadBenchmarks()).  We never invent a score to make
//      the matrix look "complete".  An empty cell is the truthful state of our
//      knowledge — most (model, category) pairs simply have no public,
//      category-aligned benchmark, and pretending otherwise would be a NO-SHIP.
//
//   2. ADAPTIVE GROWTH (A.12 adaptive-learner).  The empty cells are not dead
//      space — they are the workspace for the adaptive learner, which fills
//      them over time from REAL routing outcomes (user feedback + measured
//      quality on this user's own traffic).  A learned cell carries
//      source: "adaptive" and measured: true once enough observations exist.
//      So the matrix densifies organically, per install, grounded in evidence —
//      never by fabrication.
//
// The UI can therefore say, honestly, "N of 408 cells measured" (coverageStats).
//
// ── SHAPE ────────────────────────────────────────────────────────────────────
//
//   matrix[model][category] = SpecializationCell {
//     score:      number | null   // [0,1]; null = cited-but-qualitative OR empty
//     source:     string          // "unknown" for empty cells; otherwise the
//                                  //   benchmark name / "adaptive" / etc.
//     measured:   boolean         // true only when a real source backs the cell
//     confidence?: "high"|"medium"|"low"  // proxy-mapping confidence (seeded)
//     as_of?:     string          // when the score was established
//   }
//
// SEED SOURCE: ~/.mooter/benchmarks-overrides.json + data/benchmark-seed-2026.json
// (companion to docs/strategy/BENCHMARK_SOURCES_2026.md), loaded through
// benchmark-fetcher.loadBenchmarks().  Only `measured` cells from that merge get
// a score here; every other cell is the empty sentinel above.
//
// §13.3 INVARIANT: numeric scores are raw provider-reported values in [0,1].
// null is the ONLY substitute when a benchmark is cited but has no numeric
// score.  Never interpolate; never fabricate.

import { TASK_CATEGORIES, type TaskCategory } from "./task-categories.ts";
import { loadBenchmarks, type BenchmarkCell } from "./benchmark-fetcher.ts";

// ---------------------------------------------------------------------------
// Models — the Wave 58 roster (expanded in Wave 58.4).
//
// Wave 58 shipped 14 models; Wave 58.4 adds 3 genuinely-new ids (Gemini 3 Flash,
// DeepSeek V4 Pro, Moonshot Kimi K2.6) for an honest count of 17.  These three
// are PRICE-ONLY additions: real, web-searched prices live in tools/router/
// pricing.js, but their specialization cells stay EMPTY (measured:false) until a
// benchmark source backs them — no fabricated scores (Doctrine V4 #5).
// qwen3.6 / qwen3-30b are the local (free) models.  NOTE: claude-fable-5 is
// LISTED here but routing stays opt-in via @fable (T5) — matrix presence is a
// capability record, NOT an auto-route signal.
benchmark-seed-2026.json
pricing-snapshot-2026-05-27.json
