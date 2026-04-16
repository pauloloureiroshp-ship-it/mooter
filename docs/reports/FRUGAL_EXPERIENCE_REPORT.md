# frugal — Diagnóstico de Experiência Cross-Platform
> Gerado em 2026-04-10 | Baseado em análise completa de ficheiros + Notion HQ

---

## 1. O que existe hoje (inventário completo)

### Código instalado em `~/.claude/` (runtime)

| Ficheiro | Propósito | Estado |
|---|---|---|
| `CLAUDE.md` | Doutrina mediator-router | ✅ instalado |
| `tools/router/classify.js` | Classifier v3 (102 patterns, 11-pass pipeline) | ✅ prod |
| `tools/router/inject_context.js` | Hook UserPromptSubmit | ✅ prod |
| `tools/router/patterns.js` | Single source of truth de padrões | ✅ prod |
| `tools/router/savings-tracker.js` | HTTP :7821, /metrics, /last, /gpu | ✅ prod |
| `tools/router/backtest.js` | Auto-learning loop diário | ✅ prod |
| `tools/router/onboarding.js` | First-run: deteta HW + subscriptions | ✅ prod |
| `tools/router/setup-profile.js` | Interactive subscription wizard | ✅ existe |
| `tools/router/gpu-probe.js` | Deteta NVIDIA/Apple/AMD/CPU | ✅ prod |
| `tools/router/hub-push.js` | Envia deltas ao frugal-hub (cooldown 24h) | ✅ prod |
| `tools/router/hub-pull.js` | Recebe tuning do hub (cooldown 4h) | ✅ prod |
| `tools/router/frugal-mode.js` | Beast/Zen/Auto mode | ✅ prod |
| `tools/router/smoke-test.js` | 4 testes básicos do classifier | ✅ prod |
| `hooks/gsd-statusline.js` | Statusline renderer v0.12 | ✅ prod |
| `hooks/gsd-turn-end.js` | Stop hook (latency tracking) | ✅ prod |
| `agents/` | 6 subagents (Opus/Sonnet/Haiku/Ollama) | ✅ prod |
| `skills/frugal-*` | 9 slash commands | ✅ prod |

### frugal-hub (Cloudflare — LIVE)

| Componente | URL/ID | Estado |
|---|---|---|
| Worker | frugal-hub.frugal-hub.workers.dev | ✅ live |
| D1 database | 320b55f6-9444-4deb-bcd5-e8227739546e | ✅ live |
| R2 bucket | frugal-hub-storage | ✅ live |
| POST /api/delta | Recebe deltas (trust_score 0.8) | ✅ ok |
| GET /api/stats | Stats públicas 7 dias | ✅ ok |
| Crons | hourly/daily/weekly | ✅ configurados |

### Resultados validados

- **90.2% savings** em 1,437 prompts reais
- Hook p50: **113ms** (era 3s antes do v0.7)
- 102 patterns, 56/56 testes passam
- T0 (Ollama, $0): **83.9%** dos prompts
- T3 (Opus): apenas **3.6%**

---

## 2. Diagnóstico do MacBook — O que falhou e porquê

### Problema 1: Statusline "diferente"

**O que vês:** `/gsd-update | Sonnet 4.6 | cloude-home | 🐕 🔒 ↑100% saved ~$0.26 | Local 100% · Apple M3`

**O que devias ver:** `🐕 ↓89% 💰~$3.84 · spent ~$0.47 │ ████████░░ 🔴 Opus 9% · 🟡 Sonnet 22% · 🟢 Local 69% ⚡Apple M3`

**Causa raiz:** O `savings-tracker.js` (porta 7821) não arrancou automaticamente na primeira sessão Mac. Sem o tracker ativo, o `gsd-statusline.js` cai no fallback de leitura direta do `decisions.log`, que produz uma versão simplificada. Após o tracker arrancar (na 2ª sessão), a statusline fica completa.

**Fix:** Verificar se o tracker está a correr: `curl http://127.0.0.1:7821/health`

### Problema 2: Não sei se está tudo instalado

**Causa raiz:** O `install.sh` atual não tem confirmação visual clara no final. Faz o install e termina, sem mostrar um dashboard de saúde. O utilizador não sabe o estado real.

**O que falta:** Um `frugal-doctor` melhorado que mostre:
- ✅/❌ cada componente com estado claro
- Qual subscription foi detetada
- Se o hub-push está a funcionar
- Quantas decisões foram registadas
- Se o auto-learning está ativo

### Problema 3: Não sei se os dados fluem para melhorar o algoritmo

**Pipeline atual (quando tudo funciona):**

```
Prompt → inject_context.js → classify.js → decisions.log (JSONL)
                                    ↓ (às 02:00 via cron)
                              backtest.js --export-delta
                                    ↓
                              hub-push.js → frugal-hub D1
                                    ↓ (cooldown 4h)
                              hub-pull.js → router-tuning.json
                                    ↓
                              update-router.js → classify.js TUNED block
```

**O que pode estar a falhar no Mac:**
1. O cron (`FrugalRouterBacktest`) foi configurado no Windows (Task Scheduler). No Mac não foi configurado nenhum LaunchAgent ou cron job equivalente.
2. O `decisions.log` pode estar a ser escrito mas o backtest nunca corre → dados ficam presos na máquina, nunca chegam ao hub.
3. Sem dados a chegar ao hub → hub não gera novo `router-tuning.json` → classifier não melhora.

### Problema 4: Subscription profile não foi configurado interativamente

O `setup-profile.js` só corre interativamente (stdin TTY). Quando o `onboarding.js` é chamado pelo hook (stdin é pipe), cria um perfil default vazio (`anthropic: 'unknown'`). O router nunca sabe que tens Claude Max, o que significa que o `applyBudgetCap()` pode estar a aplicar caps desnecessários.

---

## 3. O que falta para experiência perfeita

### Tier 1 — Crítico (bloqueia tudo)

| Gap | Impacto | Fix |
|---|---|---|
| Mac não tem cron para backtest | Dados nunca chegam ao hub | Adicionar LaunchAgent macOS ao installer |
| Subscription profile vazio | Router não sabe das tuas subscriptions | Wizard interativo no install |
| Repo privado | Amigos não conseguem instalar | Tornar público OU hospedar install.sh na landing |
| Supabase RLS | Waitlist não grava | 1 SQL no dashboard |

### Tier 2 — Experiência (visibilidade)

| Gap | Impacto | Fix |
|---|---|---|
| Sem confirmação visual pós-install | Utilizador não sabe o estado | frugal-doctor melhorado |
| Tracker não auto-inicia na 1ª sessão | Statusline simplificada | LaunchAgent ou startup check melhorado |
| Sem feedback "isto foi grátis" | WOW moment ausente | /frugal-hello já existe, falta divulgar |
| Dashboard não funcional | Não consigo ver métricas visualmente | `cd dashboard && npm install && npm run dev` |

### Tier 3 — Algoritmo (melhorar continuamente)

| Gap | Impacto | Fix |
|---|---|---|
| Modo system (v0.9.3) não aplicado no inject_context.js | Beast/Zen não funcionam | Aplicar MODES_MASTER_PROMPT.md patch |
| Time-based routing não implementado | Não usa hora do dia para optimizar | L8 pendente |
| VSCode extension não publicada | Utilizadores não descobrem | Publicar no marketplace |
| GitHub OAuth não configurado | Multi-user onboarding não funciona | CLAUDE_AI_BROWSER_MASTER_PROMPT.md T1 |

---

## 4. Plano de ação priorizado

### Fazer AGORA (esta sessão)

1. **`frugal-doctor` cross-platform** — script que qualquer utilizador corre para ver o estado completo em segundos
2. **`install.sh` v2** — adiciona wizard de subscriptions + LaunchAgent macOS + confirmação visual
3. **Cron Mac** — LaunchAgent que corre backtest às 02:00 (equivalente ao Task Scheduler Windows)

### Fazer HOJE (próxima sessão Claude Code)

4. **MODES_MASTER_PROMPT.md** — aplicar o patch do mode system no inject_context.js
5. **Supabase RLS** — 1 SQL (pode fazer aqui no browser)
6. **Verificar hub-push** — confirmar que o MacBook está a enviar dados

### Fazer ESTA SEMANA

7. **Tornar repo público** (ou hospedar install.sh na landing)
8. **GitHub OAuth** (via CLAUDE_AI_BROWSER_MASTER_PROMPT.md)
9. **Dashboard npm install + validação visual**
10. **VSCode extension publicar**

---

## 5. Subscriptions suportadas — como o router as usa

| Subscription | Efeito no router | Como configurar |
|---|---|---|
| **Claude Max** (unlimited) | Desativa budget_cap — usa T3 sem medo de overspend | `node setup-profile.js` → responde "sim" à primeira pergunta |
| **Anthropic API key** (pay-per-token) | Ativa T1 direto (Haiku), budget_cap ativo | Mesmo wizard + `export ANTHROPIC_API_KEY=...` |
| **Ollama** (local) | T0 tier — 83.9% dos prompts grátis | `ollama pull qwen2.5:3b` |
| **OpenAI API** | T2 fallback alternativo (GPT-4o) | Wizard + `export OPENAI_API_KEY=...` |
| **Gemini API** | T2 fallback alternativo | Wizard + key |

**Estado atual (Mac):** O perfil foi criado em modo não-interativo → `anthropic: 'unknown'` → o router não está a otimizar para o teu Claude Max.

**Fix imediato:** Correr `node ~/.claude/tools/router/setup-profile.js` no terminal.

---

## 6. Como verificar que os dados estão a fluir

### Verificação rápida (30 segundos)

```bash
# 1. Classifier está ativo?
node ~/.claude/tools/router/classify.js "muda a cor do botão para azul"
# → deve devolver JSON com tier: "T0"

# 2. Tracker está a correr?
curl http://127.0.0.1:7821/health
# → deve devolver {"ok":true,...}

# 3. Quantas decisões foram registadas?
wc -l ~/.claude/tools/router/decisions.log
# → deve aumentar a cada prompt

# 4. Hub-push funcionou?
curl https://frugal-hub.frugal-hub.workers.dev/api/stats
# → deve mostrar contagens

# 5. Auto-learning ativo?
node ~/.claude/tools/router/backtest.js --dry-run 2>/dev/null | head -5
# → deve mostrar análise sem erros
```

### Verificação completa

```bash
bash install.sh --doctor
```

---

## 7. Referência rápida — Notion HQ

| Página | ID/URL |
|---|---|
| ⚡ frugal HQ | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| 🧪 E2E MVP Validation | https://www.notion.so/33e6f6e42bc481bc8e01ee0160b00928 |
| 👥 Friends Beta | https://www.notion.so/33e6f6e42bc48135ae61cccc625406d8 |
| 🌍 frugal v2.0 OS Vision | https://www.notion.so/33e6f6e42bc481289155d79fbc14a6e5 |
| 🚀 Sessão Landing v10 | https://www.notion.so/33e6f6e42bc481009c74e1bb9551106a |
| 📊 Algorithm Stats Live | https://www.notion.so/33e6f6e42bc481068581df4877adbec3 |
| ⚙️ Auto-Improvement Scripts | https://www.notion.so/33e6f6e42bc4815caee6d9b2a70ceeb3 |

---

*Este documento foi gerado automaticamente pelo Cowork em 2026-04-10.*
*Próxima revisão: após implementação do installer v2 e frugal-doctor.*
