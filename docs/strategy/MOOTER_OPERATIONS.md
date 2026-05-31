# Pastor — Runbook Operacional

> Companion do `PASTOR.md`. Este documento responde *como executar*, não *o quê executar*. O PASTOR.md tem a estratégia; este tem os comandos.
>
> **Assumido**: WSL2 + Ubuntu 22 em Windows 11, Docker Desktop com WSL2 backend, Claude Code CLI instalado, RTX 4090 com Ollama nativo Windows ou WSL. Se algum destes assumidos não bater, **para e avisa antes** do Passo 1.
>
> **Criado**: 2026-05-27 · **Autor**: Paulo Loureiro

---

## Sumário visual — 5 fases, 5 semanas

```
SETUP (one-time, hoje, ~45 min)
   │
   ▼
WAVE 1 — Foundations (7 dias, 4-6h/dia)
   ├─ Day 1: Schema + ADR
   ├─ Day 2: 3 packs sementinha
   ├─ Day 3: classify_domain regex
   ├─ Day 4: <pack-hint> no hook
   ├─ Day 5: CLI mooter pack
   ├─ Day 6: pack_resolve + 5 cenários
   └─ Day 7: 20 prompts validação + REPO PÚBLICO 🟢
   │
   ▼
WAVE 2 — Registry + embeddings (7 dias)
   │
   ▼
WAVE 3 — Onboarding + Notion KB (7 dias)
   │
   ▼
WAVE 4 — Launch público + cookbook PR (7 dias)
   │
   ▼
WAVE 5 — Adapter Forge (8 dias) [se gates passarem]
```

---

## 0. Pré-requisitos (verificar AGORA, antes de qualquer passo)

Abre PowerShell no Windows e corre estes comandos. Cada um deve retornar OK:

```powershell
# 1. WSL2 instalado e Ubuntu activo
wsl -l -v
# Expected: NAME=Ubuntu STATE=Running VERSION=2

# 2. Docker Desktop a correr com WSL2 backend
docker version
# Expected: Client + Server (Linux) ambos respondem

# 3. Claude Code CLI no Windows OU WSL (verificar onde)
claude --version
# Expected: claude code 1.x.x ou similar
```

Agora dentro de **WSL Ubuntu** (`wsl` no PowerShell para entrar):

```bash
# 4. Node 20+
node --version          # Expected: v20.x ou superior

# 5. Ollama com qwen3:30b
ollama list             # Expected: lista que inclui qwen3:30b ou qwen3:30b-a3b-instruct

# 6. Repo mooter clonado
ls ~/mooter/            # Expected: package.json, README.md, src/, etc.

# 7. Repo frugal (vault) clonado em WSL ou sincronizado com C:\Users\Paulo Loureiro\frugal\
ls ~/frugal/docs/strategy/
# Expected: PASTOR.md, PASTOR_OPERATIONS.md (este), STRATEGY.md, MASTER_PROMPT.md, etc.

# 8. Git config ok
git config --global user.email
git config --global user.name
# Expected: o teu email + nome

# 9. GitHub CLI autenticado (para `gh pr` mais à frente)
gh auth status
# Expected: Logged in to github.com as <username>
```

### ❌ Algum destes falhou?

| Falha | Acção |
|---|---|
| WSL2 não instalado | `wsl --install` no PowerShell admin; reboot |
| Docker Desktop não corre | Abrir Docker Desktop manualmente; settings → "Use WSL2 based engine" ✅ |
| Claude Code CLI não existe | Instalar — ver `https://docs.claude.com` para método actual |
| Ollama sem qwen3:30b | `ollama pull qwen3:30b-a3b-instruct` (~17GB download) |
| `~/mooter/` vazio | `cd ~ && git clone https://github.com/mooter-ai/mooter.git` (assumindo repo existe) |
| `~/frugal/` em WSL não existe | Opção A: clonar o repo. Opção B: criar symlink para o vault Windows: `ln -s /mnt/c/Users/Paulo\ Loureiro/frugal ~/frugal` |
| `gh auth status` falha | `gh auth login` — escolher GitHub.com + HTTPS + autenticar via browser |

**Se algo persistir bloqueado**, para e diz qual passo falhou. Não avances.

---

## 1. Setup do devcontainer (one-time, ~20 min)

O devcontainer é uma "sandbox" para o Claude Code agir sem mexer no teu sistema host. Importantíssimo para `--permission-mode auto`.

### 1.1 Verificar se já tens `.devcontainer/`

```bash
ls ~/mooter/.devcontainer/
```

- ✅ Se existe `devcontainer.json` → salta para **§1.3**
- ❌ Se não existe → continua para **§1.2**

### 1.2 Criar devcontainer (se não existe)

```bash
cd ~/mooter
mkdir -p .devcontainer
nano .devcontainer/devcontainer.json
```

Cola exactamente isto (e adapta linhas marcadas `# AJUSTAR`):

```json
{
  "name": "mooter-dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20-bookworm",
  "features": {
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/python:1": {
      "version": "3.11"
    }
  },
  "mounts": [
    "source=${localEnv:HOME}/frugal,target=/home/node/frugal,type=bind,consistency=cached",
    "source=${localEnv:HOME}/.claude,target=/home/node/.claude,type=bind,consistency=cached"
  ],
  "runArgs": [
    "--network=host"
  ],
  "customizations": {
    "vscode": {
      "extensions": [
        "anthropic.claude-code",
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode"
      ]
    }
  },
  "postCreateCommand": "npm install && echo 'Devcontainer ready'",
  "remoteUser": "node"
}
```

`Ctrl+O` → `Enter` → `Ctrl+X` para guardar e sair.

Commit este ficheiro (não toques no `.gitignore`):

```bash
cd ~/mooter
git add .devcontainer/devcontainer.json
git commit -m "chore: add devcontainer for Pastor wave 1"
```

### 1.3 Abrir VS Code no devcontainer

1. No WSL, corre: `code ~/mooter`
2. VS Code abre — vai aparecer notificação no canto inferior direito: *"Reopen in Container"*. Clica.
3. (Alternativa: `Ctrl+Shift+P` → `Dev Containers: Reopen in Container`)
4. Espera ~3-5 min na primeira vez (download da imagem + npm install)
5. Quando estiver dentro, o terminal integrado do VS Code já está dentro do container

### 1.4 Verificar que estás dentro do container

No terminal integrado VS Code:

```bash
whoami              # Expected: node
pwd                 # Expected: /workspaces/mooter
ls /home/node/frugal/docs/strategy/    # Expected: PASTOR.md visível
ollama --version    # Pode falhar — Ollama está no host, não no container. OK.
curl http://localhost:11434/api/tags   # Expected: lista de modelos Ollama (network=host expõe o host)
node --version      # Expected: v20.x
gh auth status      # Expected: logged in (herda credenciais host)
```

✅ Devcontainer pronto. Vais voltar a este estado **todos os dias**.

---

## 2. Loop diário — anatomia de um dia da Wave 1

Cada dia segue o mesmo molde. Decora isto.

### Fluxo padrão (~4-6h por dia)

```
[09:00] Abrir VS Code → Reopen in Container (~30s)
[09:01] Terminal: cd ~/mooter && git checkout dev && git pull
[09:02] Criar branch do dia: git checkout -b wave1-pastor-dayN
[09:03] Verificar Ollama warm: curl http://localhost:11434/api/tags
[09:04] Lançar Claude Code: claude --permission-mode auto
[09:05] Colar Master Prompt do dia (instruções em §3-§9 abaixo)
[09:05 → ~13:00] Claude executa. Tu acompanhas, aprovas tool calls quando perguntar.
[13:00] Sessão termina. Reviews os commits.
[13:05] Garantes: final-reviewer correu, PR aberto para dev.
[13:10] Notion HQ — criar sub-página da sessão.
[13:15] SYNC.md — actualizar com o que ficou pronto + próxima missão.
[13:20] git push origin wave1-pastor-dayN
[13:25] Mergeas PR para dev (no GitHub UI, depois de final-reviewer aprovar)
[13:30] Fechar terminal. Dia feito.
```

**Importante:** entre dias, o `~/mooter/SYNC.md` é o teu cérebro persistente. Sem ele, a próxima sessão perde contexto.

---

## 3. DAY 1 — Schema + ADR (passo-a-passo absoluto)

### 3.1 Abrir o ambiente

1. Abrir Docker Desktop (verificar que corre).
2. Abrir VS Code.
3. `Ctrl+Shift+P` → `Dev Containers: Reopen in Container` (se não está já).
4. Terminal integrado abre.

### 3.2 Branch e estado limpo

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git status              # Expected: working tree clean
git checkout -b wave1-pastor-day1
```

### 3.3 Verificar Ollama (no host, via network=host)

```bash
curl -s http://localhost:11434/api/tags | head -20
# Expected: JSON com modelos. Se não responde, sai do container, vai ao Windows, abre Ollama.
```

### 3.4 Lançar Claude Code

```bash
claude --permission-mode auto
```

Vais ver algo como:
```
Claude Code 1.x.x
Working dir: /workspaces/mooter
Permission mode: auto
> 
```

### 3.5 Copiar o Master Prompt Dia 1

1. Abre noutra janela: `~/frugal/docs/strategy/PASTOR.md`
2. Procura a secção **§10. Master Prompt Dia 1 (kickoff zoom-in, pronto a colar)**
3. Selecciona desde `=== START ===` (linha incluída) até `=== END ===` (linha incluída)
4. Copia (`Ctrl+C`)

### 3.6 Colar no Claude Code

No terminal onde Claude Code está aberto, cola (`Ctrl+Shift+V` no terminal WSL, ou clica direito → Paste). Pressiona `Enter`.

Claude vai começar a ler, planear, e executar. **Aprova tool calls quando perguntar** — em particular Edit, Write, Bash. Permite todos os relacionados com `~/mooter/packs/`, `~/mooter/docs/adr/`, `~/mooter/docs/spec/`. **Recusa** qualquer Bash que mexa em `/`, `~/.ssh`, `.env`.

### 3.7 No fim da sessão Day 1 — verificações

```bash
# Dentro do mesmo terminal, depois de Claude terminar:
ls ~/mooter/packs/pack.schema.yaml            # Existe
ls ~/mooter/docs/adr/015-*.md                 # Existe
ls ~/mooter/docs/spec/pack-hint.md            # Existe
git log --oneline | head -5                   # 3-4 commits descritivos
gh pr view 2>/dev/null || gh pr list          # PR aberto contra dev?
```

### 3.8 Final-reviewer (T3-gate obrigatório)

Se o Claude Code não invocou `final-reviewer` automaticamente, faz tu:

```
> /agents
[escolhe final-reviewer]
> Review the PR I just opened (wave1-pastor-day1 → dev). Focus on schema correctness, ADR completeness, and any drift from PASTOR.md §4.
```

Espera o veredicto. Aceita feedback se houver.

### 3.9 Notion HQ — sub-página da sessão

1. Abrir Notion no browser
2. Navegar para HQ (ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`)
3. Criar nova sub-página com título: **`🐑 Pastor Day 1 — Schema + ADR (2026-05-28)`**
4. Cola este conteúdo (preenche tu os hashes reais):

```markdown
# 🐑 Pastor Day 1 — Schema + ADR

**Data**: 2026-05-28
**Branch**: wave1-pastor-day1
**PR**: #XXX (link)

## Commits
| Hash | Descrição |
|---|---|
| abc123 | feat(packs): add pack.schema.yaml — Pastor Day 1 |
| def456 | docs(adr): 015 Pastor — eixo domínio |
| ghi789 | docs(spec): pack-hint format |
| jkl012 | test(packs): schema validation |

## Ficheiros criados
- `packs/pack.schema.yaml`
- `docs/adr/015-pastor-eixo-dominio.md`
- `docs/spec/pack-hint.md`
- `packs/tests/schema.test.ts`
- `packs/__mock__/example-pack.yaml`

## Decisões
- Eixo 3 (Adapter Forge) referenciado mas não implementado nesta wave (Wave 5)
- Schema YAML pure (sem JSON Schema, ajustar mais tarde se necessário)

## Pendente Day 2
- 3 packs sementinha: animation-web, code-audit, diagram-systems
- Master Prompt Day 2 = PASTOR.md §9 "Day 2"
```

### 3.10 SYNC.md update

```bash
cd ~/mooter
# Abrir SYNC.md (criar se não existe)
nano SYNC.md
```

Garante que tem (mínimo):

```markdown
# SYNC.md

## 📥 COWORK → CLAUDE CODE
Próxima missão: Wave 1 Day 2 — 3 packs sementinha (animation-web, code-audit, diagram-systems).
Master Prompt: ~/frugal/docs/strategy/PASTOR.md §9 "Day 2".

## ✅ Done
- 2026-05-28 — Wave 1 Day 1: Schema + ADR 015 + spec pack-hint. PR #XXX merged.

## Notion HQ — Páginas de referência
- 🐑 Pastor Day 1 (2026-05-28): https://notion.so/...
```

### 3.11 Push e PR merge

```bash
git push origin wave1-pastor-day1
# No GitHub UI: aprovar PR, mergear para dev (squash merge recomendado)
git checkout dev
git pull origin dev
```

### 3.12 Fim do Day 1 ✅

Fecha o terminal. Fecha o VS Code. Day 1 done. Vai dar uma volta.

---

## 4. DAY 2 — 3 packs sementinha (mesma mecânica)

### Diferenças vs Day 1

| Passo | Day 1 | Day 2 |
|---|---|---|
| Branch | `wave1-pastor-day1` | `wave1-pastor-day2` |
| Master Prompt | PASTOR.md §10 | **PASTOR.md §9, secção "Day 2"** |
| Ficheiros criados | schema + ADR + spec + tests | 3 packs `pack.yaml` + scaffolds |
| Notion sub-page | "🐑 Pastor Day 1" | "🐑 Pastor Day 2 — 3 packs sementinha" |

### Copy do Master Prompt Day 2 (instruções)

O orquestrador (§9) tem o plano dia-a-dia. Para Day 2 especificamente, **abre `~/frugal/docs/strategy/PASTOR.md`** e localiza a secção:

```
### Day 2 (2026-05-29) — 3 packs sementinha

- 2.1 `~/mooter/packs/animation-web/pack.yaml` ...
- 2.2 `~/mooter/packs/animation-web/scaffold.md` ...
- 2.3 Idem para `code-audit` (§5.4) e `diagram-systems` (§5.2)
- 2.4 Test: schema-validator passa em todos 3

DoD: PR `feat/pastor-packs-day2` → `dev`. ...
```

Em vez de colar o orquestrador inteiro (que é Wave 1 todo), constrói um prompt focado em Day 2 — algo como:

```
És Claude Code em ~/mooter/, a iniciar Wave 1 Day 2 do Pastor.

Lê primeiro:
1. ~/frugal/docs/strategy/PASTOR.md §5 (especificação dos 7 packs sementinha)
2. ~/frugal/docs/strategy/PASTOR.md §9 secção "Day 2"
3. ~/mooter/SYNC.md (estado actual)
4. ~/mooter/packs/pack.schema.yaml (schema que tens de respeitar)

Tarefas Day 2:
1. Criar ~/mooter/packs/animation-web/pack.yaml (copiar de PASTOR.md §5.1)
2. Criar ~/mooter/packs/animation-web/scaffold.md (extrair prompt_scaffold do pack.yaml)
3. Idem para code-audit (§5.4) e diagram-systems (§5.2)
4. mooter pack validate <each-pack> deve passar (CLI ainda não existe — basta yamllint + schema check programático)
5. Commits selectivos, 1 por pack
6. PR wave1-pastor-day2 → dev
7. final-reviewer antes do PR
8. Notion HQ sub-página
9. SYNC.md update

Constraints:
- ❌ Não tocar classify.js (Day 3)
- ❌ Não tocar inject_context.js (Day 4)
- ❌ Não criar packs além destes 3 (foco)
- ❌ git add -A nunca

Quando terminar Day 2, parar. Não avançar Day 3.

Ready?
```

(Eu posso gerar este prompt-zoom-in para cada dia se preferires. Diz-me se queres que eu adicione **Master Prompts Day 2-7 ao PASTOR.md** como secções §10.2, §10.3, etc.)

### Restante do fluxo: idêntico ao Day 1

(§3.7 a §3.12, ajustar paths)

---

## 5. DAY 3-7 — em formato condensado

| Day | Foco | Master Prompt | Ficheiros principais | PR |
|---|---|---|---|---|
| 3 | `classify_domain()` regex | PASTOR.md §9 "Day 3" | `packages/router/src/classify_domain.ts` + tests | `wave1-pastor-day3` |
| 4 | Hook emite `<pack-hint>` | PASTOR.md §9 "Day 4" | `packages/router/src/hooks/inject_context.ts` | `wave1-pastor-day4` |
| 5 | CLI `mooter pack ...` | PASTOR.md §9 "Day 5" | `packages/cli/src/commands/pack.ts` | `wave1-pastor-day5` |
| 6 | `pack_resolve()` + 5 cenários | PASTOR.md §9 "Day 6" | `packages/router/src/pack_resolve.ts` | `wave1-pastor-day6` |
| 7 | Validação real + repo público 🟢 | PASTOR.md §9 "Day 7" | `docs/wave1-validation.md` | `wave1-pastor-day7` |

**Day 7 tem uma acção crítica extra**: tornar o repo público.

```bash
gh repo edit mooter-ai/mooter --visibility public --accept-visibility-change-consequences
# Confirma: gh repo view mooter-ai/mooter | grep -i visibility
```

---

## 6. Entre waves — gates e decisões

No fim da Wave 1 (Day 7 mergeado em `main`):

### 6.1 Validation report (Day 7 produz isto)

`~/mooter/docs/wave1-validation.md` deve conter:
- 20 prompts reais com pack escolhido e nota subjectiva 1-5
- Recall (% prompts roteados para pack correcto) — target ≥ 85%
- Latência média do hint emit — target ≤ 60ms p99
- Sessão de demo gravada (Loom ou OBS, ≤5min)

### 6.2 Decisão go/no-go Wave 2

| Sinal | Decisão |
|---|---|
| Recall ≥ 85% + 0 regressions no eixo 1 + repo público | ✅ Avançar Wave 2 segunda-feira seguinte |
| Recall 70-85% | 🟡 Pausa 2 dias para tuning antes de Wave 2 |
| Recall < 70% | ❌ Re-design do classify_domain antes de Wave 2 |
| Repo ainda privado por qualquer razão | ❌ PARAR. Padrão de risco accionado. Pergunta Cowork session |

### 6.3 Wave 2 → Wave 3 → Wave 4 → Wave 5

Mesma mecânica. SYNC.md sempre updated. Notion HQ sempre com sub-página por dia.

**Gate de Wave 5** (Adapter Forge) é diferente: ≥ 50 utilizadores opt-in. Se não bater no fim de Wave 4, pausa Wave 5 e foca em growth de utilizadores antes.

---

## 7. Troubleshooting comum

| Problema | Diagnóstico | Fix |
|---|---|---|
| `claude` comando não encontrado dentro do container | Extension Anthropic não está instalada na imagem dev | Adicionar ao `postCreateCommand`: `npm install -g @anthropic-ai/claude-code` |
| `curl http://localhost:11434` falha dentro container | `--network=host` não está activo OU Docker Desktop não passa hosts | Verifica `runArgs` no `devcontainer.json`; alternativa: usar IP do host `http://host.docker.internal:11434` |
| `final-reviewer` não corre automaticamente | Skill/agent não está visível na sessão | `claude --list-agents` para confirmar; se ausente, copia `~/frugal/agents/*.md` para `~/mooter/.claude/agents/` |
| Claude tenta `git add -A` | Anti-pattern accionado | Aborta o tool call (`n` quando perguntar); avisa explicitamente "commits selectivos sempre, file-by-file" |
| Sessão bate weekly cap Claude Max | Demasiado Opus | Verificar statusline (`/savings`); usar Sonnet para o resto do dia; Ollama para drafts |
| WSL2 perde acesso à RTX 4090 | `nvidia-smi` falha em WSL | Actualizar drivers NVIDIA Windows; reinstalar `nvidia-container-toolkit` em WSL |
| Notion sub-page não cria | MCP Notion não autenticado | `mcp__plugin_design_notion__authenticate` em Cowork; ou criar manualmente no browser |
| SYNC.md corrupto entre sessões | Conflito de merge ou edição em paralelo | `git checkout main -- SYNC.md` para reset; reconstruir manualmente |

---

## 8. Cheat sheet — copy-paste diário

### Início do dia

```bash
# 1. PowerShell (Windows)
wsl

# 2. Dentro WSL
code ~/mooter
# VS Code abre → Reopen in Container

# 3. Terminal integrado VS Code
cd /workspaces/mooter
git checkout dev && git pull origin dev
git checkout -b wave1-pastor-dayN     # AJUSTAR N
curl -s http://localhost:11434/api/tags | head -3  # Ollama sanity
claude --permission-mode auto
```

### Durante a sessão

- ✅ Aprova `Edit`, `Write`, `Bash` em paths de `~/mooter/packs/`, `~/mooter/packages/`, `~/mooter/docs/`
- ❌ Recusa Bash em `/`, `~/.ssh`, `~/.aws`, `.env*`, `.github/workflows/`
- ❌ Recusa `git add -A`, `git push --force`, `rm -rf` em paths não-óbvios
- 🟡 Se Claude perguntar "posso correr `npm publish`?" → para e pergunta-me se não souberes

### Fim do dia

```bash
# 1. Verificações
git log --oneline | head -5
gh pr view 2>/dev/null

# 2. final-reviewer (se Claude não invocou)
# Dentro de Claude Code:
# > /agents
# > [final-reviewer]
# > Review the PR for wave1-pastor-dayN

# 3. Push + merge
git push origin wave1-pastor-dayN
# GitHub UI: review, approve, squash merge para dev

# 4. Notion + SYNC.md (manual ou via Claude tool)

# 5. Cleanup
git checkout dev && git pull origin dev
exit  # sai Claude
# Fecha VS Code
```

---

## 9. Comandos úteis (de emergência)

```bash
# Reset uma sessão Claude que ficou estranha
# (Ctrl+C dentro de Claude Code, ou /exit, e relançar)

# Ver custos da sessão actual
# Dentro Claude Code: /cost

# Listar agents disponíveis
# Dentro Claude Code: /agents

# Ver doutrina T0-T3
# Dentro Claude Code: a doutrina injecta-se via UserPromptSubmit; verifica com /context

# Backup rápido antes de operação arriscada
cd ~/mooter
git stash push -m "pre-risky-op-$(date +%Y%m%d-%H%M)"

# Reverter último commit (se tiver acabado de fazer algo mau)
git reset --soft HEAD~1   # mantém ficheiros, desfaz commit

# Reverter PR já mergeado em dev (cuidado)
git checkout dev
git revert <commit-hash>  # gera novo commit que desfaz
git push origin dev
```

---

## 10. Quando NÃO seguir o runbook

- 🔴 Se algum dia tu **não fizeres a sub-página Notion** → no dia seguinte, antes de qualquer coisa, recuperar o histórico via `git log` + criar a página retroactiva.
- 🔴 Se algum dia o `final-reviewer` **não correr** → não mergear. Espera próximo dia ou força corrida manual.
- 🔴 Se algum dia tu **tocares no `classify.js` eixo 1 inadvertidamente** → reverter imediatamente. Eixo 1 não muda nesta wave.
- 🔴 Se algum dia o teu `<router-hint>` **deixar de aparecer** depois de mexer no hook → bug em Day 4, rollback `inject_context.ts` antes de continuar.

---

## 11. O que pedir-me em sessão Cowork futura

Se durante a execução algo correr mal e quiseres voltar à Cowork para ajustar:

| Situação | O que dizer |
|---|---|
| Day N falhou DoD | "Day N do Pastor falhou em X. Posso ainda avançar Day N+1 ou tenho de re-fazer?" |
| Master prompt Day 2-7 incompleto | "Gera-me um Master Prompt Day N zoom-in pronto a colar, para o PASTOR.md" |
| Recall do classifier baixo | "Backtest do classify_domain mostra recall 60%. Diagnóstico?" |
| Wave 1 fechou — ready para Wave 2 | "Wave 1 fechou OK. Master Prompt Wave 2 Day 1?" |
| Adapter Forge — dúvida técnica Wave 5 | "Diz-me como escolher base model entre Qwen3-14B e 30B-A3B dado meu setup" |
| Re-prioritização do roadmap | "Vamos rever roadmap — chegou X feedback do mercado" |

---

*Runbook criado 2026-05-27. Mantém versionado em git. Actualiza ao fim de cada wave se algum passo se revelou impreciso.*
