# ONBOARDING_DEV.md — Novo dev em 15 minutos

> Bem-vindo ao frugal. Este guia dá-te o mapa mental do sistema em 15 min.
> Lê por esta ordem. Não saltes secções.

---

## 1. O que é o frugal (2 min)

frugal é um **router de LLMs para Claude Code** — sem proxy, sem middleman, sem porto extra.

**O problema que resolve:** Claude Code usa Opus por default em TUDO. Renomear uma variável custa $0.12. Uma commit message custa $0.08. frugal roteia cada prompt para o modelo mais barato que consegue resolver a tarefa.

**Como funciona:** Em vez de interceptar chamadas de API, frugal ensina o próprio Claude Code a tomar a decisão certa — através de um hook que corre antes de cada prompt e uma "doutrina" (CLAUDE.md) que o Claude lê na abertura da sessão.

**Resultado:** ~90% de poupança vs usar Opus em tudo, validado em 1.437 prompts reais.

---

## 2. Os 4 ficheiros que tens de conhecer (3 min)

| Ficheiro | Onde vive | O que faz |
|---|---|---|
| `tools/router/classify.js` | `/frugal/` (repo) | Classifica o prompt em <50ms. Regex puro. Sem LLM. Devolve tier + confiança + reasoning. |
| `inject_context.js` | `~/.claude/hooks/` | Hook UserPromptSubmit. Chama classify.js, emite `<router-hint>` no contexto. |
| `gsd-turn-end.js` | `~/.claude/hooks/` | Hook Stop. Regista `turn_end` em decisions.log para medir latência real. |
| `CLAUDE.md` | `~/.claude/` | Doutrina do mediador. O Claude lê isto na abertura de cada sessão e decide como interpretar o hint. |

Secundários mas importantes:

| Ficheiro | Onde vive | O que faz |
|---|---|---|
| `exec-logger.js` | `~/.claude/hooks/` | Hook PostToolUse. Regista modelo real usado por Bash call em `execution.log`. |
| `savings-tracker.js` | `~/.claude/tools/router/` | Servidor HTTP :7821. Lê decisions.log + execution.log e serve métricas para o statusline. |
| `backtest.js` | `tools/router/` | Analisa decisions.log e gera router-tuning.json (auto-learning). |
| `event-builder.js` | `tools/router/` | Constrói eventos anónimos para o hub (privacy contract). |

---

## 3. O fluxo de um prompt (3 min)

```
User escreve prompt no terminal
    │
    ▼
inject_context.js (UserPromptSubmit hook, ~15ms)
    ├── chama classify.js → devolve { tier, confidence, category, reasoning }
    ├── escreve .last-classified.json
    └── injeta <router-hint> no contexto do Claude Code
    │
    ▼
Claude Code lê o CLAUDE.md (doutrina, lido 1x na abertura da sessão)
    │
    ▼
Claude decide: inline ou spawn subagent?
    ├── T0 (trivial) → local-summarizer (Ollama qwen3:30b) ou inline
    ├── T1 (leve)    → cheap-triage (Haiku)
    ├── T2 (médio)   → model-reasoner (Sonnet)
    └── T3 (pesado)  → model-architect (Opus)
    │
    ▼
exec-logger.js (PostToolUse hook) regista modelo real em execution.log
    │
    ▼
gsd-turn-end.js (Stop hook) regista turn_end em decisions.log
    │
    ▼
savings-tracker.js lê ambos os logs → statusline mostra poupança real
```

**Nota crítica:** Os LLMs NÃO falam entre si. Quando o Sonnet spawna o Haiku como subagent, o Haiku recebe os inputs que o Sonnet lhe passa e devolve um resultado — é um processo isolado, sem memória partilhada. O "router" é o classify.js (regex), não outro LLM.

---

## 4. Tier system — a tabela de decisão (2 min)

| Tier | Modelo | Custo típico | Quando |
|---|---|---|---|
| T0-general | Ollama qwen3:30b | Grátis | Resumos, brainstorm, docs, traduções |
| T0-code | Ollama qwen2.5-coder:7b | Grátis | Renomear, formatar, commit messages, typos |
| T0-math | Ollama qwen2-math:7b | Grátis | Cálculos, transforms, regex |
| T1 | Claude Haiku | ~$0.001 | Código leve, explicações, regex, testes triviais |
| T2 | Claude Sonnet | ~$0.05-0.30 | Features, debugging, refactors, planos técnicos |
| T3 | Claude Opus | ~$0.50-5.00 | Arquitectura, multi-file, decisões críticas, pre-merge |

**Guardrails que forçam T3 sempre** (mesmo que o prompt pareça trivial):
- Toca em `.env*`, `package.json`, migrations, secrets
- Refactor > 3 ficheiros
- Antes de push / merge / deploy
- Palavras-chave: `crítico`, `urgente em prod`, `audit`, `review`

---

## 5. Auto-learning loop (1 min)

```
decisions.log
    │
    ▼  (backtest.js, corre às 02:00 ou /update-router)
router-tuning.json    ← padrões aprendidos localmente
    │
    ▼  (update-router.js)
classify.js           ← bloco TUNED_BLOCK actualizado
    │
    ▼  (backtest.js --export-delta + hub-push.js, opt-in)
frugal-hub (D1)       ← delta anónimo, TTL 7 dias
    │
    ▼  (hub-pull.js, opt-in)
router-tuning.json    ← padrões da comunidade fundidos localmente
```

**Dual guardrail:** HIGH_RISK patterns nunca são downgraded — verificado TANTO no `classify.js` runtime COMO no `backtest.js` antes de gerar o tuning file.

---

## 6. Logs que vais usar no dia-a-dia (2 min)

**`~/.claude/tools/router/decisions.log`** — JSONL, uma linha por prompt:
```json
{"session_id":"abc","ts_ms":1712842981000,"tier":"T1","confidence":0.85,"category":"code-light","reasoning":"short prompt, no risk signals","model_hint":"haiku","turn_end_ts":1712842983400,"wall_clock_ms":2400}
```

**`~/.claude/hooks/execution.log`** — TSV, uma linha por Bash call:
```
[2026-04-11T14:23:01Z] sess-abc123 claude-haiku-4-5 assistant bash:npm_install 340ms inline
```

**`.last-classified.json`** — estado do último turn (sobrescrito a cada prompt):
```json
{"tier":"T1","confidence":0.85,"session_id":"abc","has_file_refs":false,"cascade_upgrade":false}
```

Para ver métricas em tempo real:
```bash
curl http://localhost:7821/summary    # resumo da sessão
curl http://localhost:7821/real       # poupança real (execution.log)
curl http://localhost:7821/metrics    # JSON completo
```

---

## 7. Comandos que vais usar mais (1 min)

```bash
# Verificar saúde do sistema
node ~/.claude/hooks/frugal-doctor.js

# Correr testes (59/59 deve passar)
cd ~/frugal && node --test tools/router/backtest.test.js

# Ver poupanças da sessão
curl http://localhost:7821/summary

# Forçar re-tuning manual do classifier
cd ~/frugal && node tools/router/backtest.js && node tools/router/update-router.js

# Ver o que um delta conteria (sem enviar)
node tools/router/backtest.js --export-delta --dry-run

# Verificar hub
node tools/router/hub-status.js
```

---

## 8. Onde está o quê — mapa de ficheiros

```
~/.claude/
├── CLAUDE.md                    ← doutrina do mediador (EDITAR COM CUIDADO)
├── hooks/
│   ├── inject_context.js        ← UserPromptSubmit hook (entry point)
│   ├── gsd-turn-end.js          ← Stop hook (mede latência)
│   └── exec-logger.js           ← PostToolUse hook (modelo real)
├── tools/router/
│   ├── classify.js              ← classificador (core)
│   ├── patterns.js              ← SSOT de regex (importado por classify.js)
│   ├── savings-tracker.js       ← HTTP :7821
│   ├── backtest.js              ← auto-learning (analisa decisions.log)
│   ├── update-router.js         ← patcha classify.js com TUNED_BLOCK
│   ├── event-builder.js         ← constrói eventos para hub (privacy contract)
│   ├── hub-push.js              ← envia delta para frugal-hub
│   ├── hub-pull.js              ← puxa padrões do hub
│   ├── hub-status.js            ← verifica conectividade
│   ├── gpu-probe.js             ← detecta hardware tier
│   ├── frugal-mode.js           ← Beast/Zen/Auto mode system
│   ├── decisions.log            ← JSONL de todas as decisões
│   └── router-tuning.json       ← padrões aprendidos
└── agents/
    ├── local-summarizer.md      ← T0 subagent (Ollama)
    ├── cheap-triage.md          ← T1 subagent (Haiku)
    ├── model-reasoner.md        ← T2 subagent (Sonnet)
    ├── model-architect.md       ← T3 subagent (Opus)
    └── final-reviewer.md        ← pre-merge gate (Opus)

~/frugal/ (este repo)
├── ARCHITECTURE.md              ← source of truth técnico (15 secções)
├── SYNC.md                      ← canal bidirecional Cowork↔Claude Code
├── INFRA.md                     ← URLs, IDs, credenciais
├── PRIVACY.md                   ← o que sai da máquina
├── tools/router/                ← código fonte (está em ~/.claude após install.sh)
├── hub/                         ← Worker Cloudflare (frugal-hub)
└── prompts/                     ← master prompts de sessões anteriores
```

---

## 9. Armadilhas comuns (1 min)

| Sintoma | Causa provável | Fix |
|---|---|---|
| Statusline não mostra poupanças reais | gsd-turn-end.js não está em settings.json | `node frugal-doctor.js --fix` |
| Router sempre T3 | CLAUDE.md não foi copiado para ~/.claude/ | `bash install.sh` |
| exec-logger não regista | PostToolUse hook em falta | Verificar settings.json + `node frugal-doctor.js` |
| Hub push falha | URL errada ou Worker down | `node hub-status.js` → verifica frugal-hub.frugal-hub.workers.dev |
| Ollama não responde | Ollama não está a correr | `ollama serve` |
| `decisions.log` vazio | Hook nunca disparou | Fecha e reabre o Claude Code |

---

## 10. Próximos passos para contribuir

1. Lê **ARCHITECTURE.md** — tem o mapa completo com 15 secções
2. Lê **ROUTING_POLICY.md** — as regras completas de roteamento  
3. Corre os testes: `node --test tools/router/backtest.test.js` — 59/59 deve passar
4. Experimenta: abre o Claude Code com frugal e faz uns prompts variados. Vê o statusline mudar.
5. Faz um `curl http://localhost:7821/summary` depois de 10 prompts — confirma que as poupanças batem certo.

Dúvidas → paulo.loureiro.shp@gmail.com

---

*frugal v0.9.4 — Abril 2026*
