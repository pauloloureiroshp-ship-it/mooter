# Mooter Conductor — desenho de produto (v1, 2026-07-05)

> Origem: `_handoff/MOOTER_CONDUCTOR_BRIEF.md`. Este documento responde às 6 questões de
> investigação do brief §7 com **código real lido no repo** + **doc oficial CC verificada hoje**,
> e fecha o desenho do produto + faseamento. O masterprompt executável do F0 está em
> `_handoff/CONDUCTOR_F0_DISPATCH_MASTERPROMPT.md`.

---

## 1. O que a ponte JÁ permite (verificado no código + doc, não de memória)

### 1.1 A descoberta que muda o F0: deep links oficiais do CC

A doc oficial (verificada 2026-07-05) documenta **dois handlers de URL** que fazem quase todo o
trabalho do Dispatch:

| Handler | Parâmetros | O que faz | Fonte |
|---|---|---|---|
| `claude-cli://open` | `cwd=<path absoluto>` · `q=<prompt URL-encoded, máx 5.000 chars, %0A=newline>` · `repo=<owner/name>` | Abre **novo terminal** (Windows: prefere Windows Terminal) com CC **na pasta certa** e o **prompt pré-preenchido mas NÃO submetido** — o humano lê e carrega Enter. Requer CC ≥2.1.91. Windows: `Start-Process "claude-cli://open?..."` | [deep-links](https://code.claude.com/docs/en/deep-links) |
| `vscode://anthropic.claude-code/open` | `prompt=<URL-encoded>` · `session=<id>` | Abre **aba CC no VS Code** com prompt pré-preenchido não-submetido, OU foca/resume uma sessão existente **do workspace aberto**. ⚠️ **Sem parâmetro `cwd`** — a aba nasce no workspace actual, não numa worktree irmã | [vs-code#launch-a-vs-code-tab-from-other-tools](https://code.claude.com/docs/en/vs-code#launch-a-vs-code-tab-from-other-tools) |

**Implicação de produto:** o "prompt pré-preenchido, não submetido" é o **gate humano perfeito e
honesto** — o Conductor prepara tudo (worktree + pasta + prompt) e o Paulo só valida com Enter.
Nunca dispara às cegas; a doc até mostra o aviso `Prompt from an external link` até ao envio.

### 1.2 O que já existe no repo (ficheiros lidos)

| Peça | Ficheiro | O que faz hoje | Reuso no Conductor |
|---|---|---|---|
| `mooter.newSession` | `packages/vscode-extension/src/extension.js` (~L1074) | `openExternal('vscode://anthropic.claude-code/open')` — sem prompt, sem cwd | F0 substitui por deep-link com parâmetros |
| `openSessionTab` | idem (~L388) | Deep-link aba=sessão via `claude-vscode.primaryEditor.open <id>` (API interna, funciona em prod) com fallback `?session=<id>` | Mapa sessões↔worktrees já tem o "focar aba" |
| Fluxo `playWave` | idem (~L494) | O **precursor honesto do Dispatch**: seed no clipboard → `newSession` → "cola-o (Ctrl+V)". Já lê `wave.worktree` do roadmap | F0 é este fluxo SEM o passo manual de colar |
| `runInTerminal` | idem (~L377) | `createTerminal` + `sendText` | Fallback e `git worktree add` (mas preferir execFile host-side, padrão do Commit&Push) |
| Fluxo Commit&Push | idem (WCOCKPIT-9) | **execFile git host-side, nunca terminal** (não sequestrável), stage selectivo, guarda sha classify.js | O `git worktree add` do F0 segue exactamente este padrão |
| file-bus | `_handoff/live-preview/events.jsonl` + hook-collector; `readBusTail` | Sessões↔cwd↔branch já rastreados; `worktreeParked`/`parseWorktrees` já lêem worktrees reais | A régua "1 worktree = 1 sessão" valida-se contra isto |
| Ponte Agent SDK | `_handoff/skills-build/cowork-cc-bridge/scripts/sdk-runner.mjs` | `query({prompt, options:{cwd, resume, permissionMode, canUseTool}})` — headless, cwd fixável, prompt injectado, `canUseTool` responde AskUserQuestion + nega destrutivo + protege classify.js. Sessões SDK⇄CLI **cross-resumable** (`--resume <id>` funciona nos dois sentidos) | É o motor do modo headless (F2+); F0 não precisa dele |

### 1.3 O que a doc CONFIRMA que NÃO dá (limites que moldam o desenho)

- ❌ `claude "prompt"` interactivo com prompt inicial **não existe** (só `-p` headless). O deep-link `q=` é o único caminho documentado para pré-preencher interactivo.
- ❌ **Injectar num processo CC vivo** de fora: sem IPC/stdin/file suportado. Único caminho: `--resume <id>` como processo novo, ou `?session=<id>` no VS Code (foca a aba; não injecta texto). → confirma o brief: **responder-a-viva fica para F2** e será "resume-como-novo-processo" ou pré-preencher via `?session` + clipboard.
- ⚠️ `claude --worktree <name>` existe mas gere worktrees **próprias** em `.claude/worktrees/<name>` a partir de `origin/HEAD` (base configurável só `fresh|head`). Reusar worktrees manuais irmãs (`../frugal-X`, o padrão Mooter) é **indocumentado** → o F0 faz o `git worktree add ../<name> <base>` ele próprio e usa `cwd=` no deep-link. Controlo total da base, padrão actual preservado.
- ⚠️ `q=` tem tecto de **5.000 chars** e os masterprompts do Paulo passam disso → o F0 **grava o masterprompt num ficheiro dentro da worktree** e o `q` é um bootstrap curto (ver §3.2).

## 2. Prior art (web, 2026-07) — o que existe e o que o Conductor tem de diferente

- **Nativo Anthropic:** [Agent teams](https://code.claude.com/docs/en/agent-teams) (equipas em split-panes tmux/iTerm2 — unix-first, não é o modelo cockpit), [worktrees nativas](https://code.claude.com/docs/en/worktrees), e o [redesign do CC Desktop (abr-2026)](https://miraflow.ai/blog/claude-code-desktop-redesign-parallel-sessions-routines-workspace-guide) com sidebar multi-sessão + isolamento por worktree — validação de que "gerir frotas" é a direcção da própria Anthropic.
- **OSS:** [Claude Squad](https://github.com/smtg-ai/claude-squad) (TUI tmux + worktrees, multi-agente), [ccswarm](https://github.com/nwiizo/ccswarm) (orquestração com isolamento por worktree), [claude-tmux](https://github.com/nielsgroen/claude-tmux), skill [parallel-worktrees](https://github.com/spillwavesolutions/parallel-worktrees); panorâmica em [6 frameworks](https://claudefa.st/blog/tools/orchestrators/multi-agent-orchestrators) e [Shipyard](https://shipyard.build/blog/claude-code-multi-agent/).
- **O buraco que nenhum cobre** (o fosso do Conductor): todos são terminal/tmux unix-first e **partem da tarefa**, não do **masterprompt como artefacto**. Nenhum: (a) vive no cockpit VS Code em Windows; (b) trata o masterprompt colado como unidade de dispatch parseável; (c) impõe "1 worktree = 1 sessão" por construção contra um file-bus real; (d) integra honest-copy + moos locais $0. O Conductor não compete com eles — absorve o fluxo Cowork→CC que só o Mooter tem.

## 3. O produto

### 3.1 Tese
> **Colas o masterprompt no cockpit. O Mooter descobre onde ele deve correr, prepara a worktree,
> abre a sessão certa com o prompt já escrito — e tu só carregas Enter.**
> Dispatch por colar-e-validar. Zero "qual aba?", zero worktree errada, $0 cloud.

### 3.2 F0 · Dispatch fresh-first (o MVP que devolve o tempo)

Pipeline (tudo host-side na extensão, determinístico, sem LLM — nem moo é preciso no F0):

1. **Caixa "⇄ Dispatch"** no cockpit (secção nova, encaixa no NOW do CTO Command Deck): textarea "cola o masterprompt".
2. **Parser determinístico** (regex, ~30 linhas, testável): extrai do formato que os masterprompts **já têm** —
   - título: linha `⇄ COWORK→CC · <título>` (fallback: primeira linha não-vazia)
   - worktree+base: `Worktree ../<name> from <base>` (fallback declarado: sem linha Worktree → card pede ao humano; **nunca adivinha**)
   - modelo: menção a Opus/Sonnet/Haiku (informativo no card)
3. **Cartão de pré-voo** (honest-copy): mostra exactamente o que vai acontecer — `worktree ../frugal-X (nova, base main) · terminal novo · prompt pré-preenchido — NADA corre até carregares Enter na sessão`. Validações no card:
   - worktree já existe? → cruza com `git worktree list` (parser já existe) + file-bus: **livre** → reusa com aviso; **ocupada por sessão viva** → ⚠️ bloqueia (régua 1w=1s imposta por construção); base inexistente → erro claro.
4. **Dispatch** (botão do card):
   a. `git worktree add ../<name> <base>` via execFile host-side (padrão Commit&Push; reversível; nunca `-f`).
   b. Grava o masterprompt completo em `<worktree>/_dispatch/MASTERPROMPT.md` (contorna o tecto de 5.000 chars e deixa rasto auditável).
   c. `openExternal('claude-cli://open?cwd=<abs worktree>&q=' + encodeURIComponent('Lê e executa _dispatch/MASTERPROMPT.md. GUARD: classify.js FROZEN · selective add · sem push/merge sem OK.'))` → abre Windows Terminal na pasta certa com o bootstrap pré-preenchido.
   d. Regista o dispatch no file-bus (`_handoff/live-preview/` ou `dispatch.jsonl` próprio): `{ts, title, worktree, base, promptFile}` → o cockpit passa a mostrar o mapa **cartão→worktree→sessão** (resolve as "30 abas sem saber qual é qual" juntando ao `openSessionTab` existente).
5. **O Enter do Paulo é o gate.** A extensão nunca alega auto-executar (mesma honestidade do playWave, menos um passo manual).

Fallback F0.b (se o handler `claude-cli://` não estiver registado na máquina): card degrada para o fluxo playWave actual (clipboard + newSession) com aviso honesto + instrução de correr `claude` uma vez para registar o handler.

### 3.3 Faseamento (do brief, afinado pelo que se confirmou)

| Fase | Entrega | Peça técnica nova | LLM |
|---|---|---|---|
| **F0 · Dispatch fresh-first** | 1 masterprompt → cartão → worktree + terminal + prompt pré-preenchido | parser regex + `worktree add` host-side + deep-link + registo bus | nenhum |
| **F1 · Multi-dispatch** | colar N → fila de cartões → dispara vários, cada um na sua worktree | fila + validação cruzada de colisões (1w=1s em lote) | nenhum |
| **F2 · Router inteligente** | fresh vs **responder-a-viva** (via `?session=<id>` p/ focar aba + prompt no clipboard, ou `--resume <id>` em terminal novo), dependências entre MPs (ex: "MP5 depois de MP3" — o formato já o diz em prosa) | moo local (qwen RTX 4090) p/ parsing fuzzy + decisão; **pergunta quando incerto** | moo $0 |
| **F3 · Frota por exceção** | Conductor sugere salto p/ sessão fresca (liga ao Moo Context Guardian), agrega >12 sessões, headless via sdk-runner p/ rondas sem UI | integração guardian + sdk-runner | moo $0 |

### 3.4 Formato canónico de masterprompt (retrocompatível — questão §7.4 do brief)

Mínimo parseável = o que já se escreve hoje; só se **normaliza**:

```
⇄ COWORK→CC · <título>
Worktree ../<nome> from <base>[. <Modelo>.]
[Depends: <MP-id>, ...]        ← opcional, novo (F2 usa; F0 ignora)
DO: ...
GUARD: ...
GATE: ...
```

Regra de ouro do parser: linha `Worktree` ausente ou ambígua → o card **pergunta**, nunca infere.
Todos os masterprompts já escritos em `_handoff/` continuam válidos.

### 3.5 Segurança (questão §7.6)

- O dispatch **nunca executa conteúdo do masterprompt**: só o lê p/ extrair 3 campos e o grava em ficheiro. Quem executa é o CC, atrás do Enter do Paulo + permissões normais do CC.
- Acções host-side do F0: `git worktree add` (reversível) + escrita de 1 ficheiro + abrir URL. **Zero** merge/push/rm/deploy. `classify.js` intocado (o Conductor é 100% aditivo: ficheiros novos na extensão).
- Deep-link é inerte por desenho (doc oficial): prompt visível, aviso "Prompt from an external link", nada enviado sem Enter.
- Régua 1 worktree = 1 sessão validada contra `git worktree list` + file-bus **antes** de criar/reusar.

### 3.6 Decisão wave-vs-track (recomendação)

**Wave única, curta (CC-once), fora do foco Live Preview** — o F0 é ~1 ficheiro novo de parser +
~1 secção de cockpit + reuso de 4 peças existentes. Não justifica track paralelo permanente; F1-F3
só ganham track se o F0 provar uso diário. Dogfood imediato: os próprios masterprompts MP3/MP4.1 do
Live Preview são os primeiros cartões a despachar — o Conductor nasce a servir o foco actual, não a
competir com ele.

## 4. Questões do brief §7 — respostas directas

1. **Ponte SDK lança sessões?** Sim, headless com prompt+cwd+resume (`sdk-runner.mjs`); injectar em viva: só resume-como-novo-processo. Fresh interactivo: deep-link.
2. **`mooter.newSession` passa prompt/cwd?** Hoje não (URI nu), mas o handler aceita `?prompt=` e `?session=`; cwd só no handler CLI (`claude-cli://open?cwd=`). F0 usa o CLI handler.
3. **Prior art:** §2 — tmux/TUI unix-first; nenhum faz dispatch-por-masterprompt em cockpit Windows.
4. **Formato canónico:** §3.4 — o actual, normalizado + `Depends:` opcional.
5. **UX cockpit:** caixa + cartão pré-voo + mapa cartão→worktree→sessão (§3.2); encaixa no NOW do Command Deck.
6. **Segurança:** §3.5.
