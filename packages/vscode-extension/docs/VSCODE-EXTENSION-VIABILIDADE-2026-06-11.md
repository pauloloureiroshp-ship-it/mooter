# Mooter × VS Code Extension — Análise de Viabilidade

**Data:** 2026-06-11 · **Autor:** Claude (Cowork) · **Pedido:** Paulo — "plugin VS Code quase cópia do plugin Claude, mas com Mooter"
**Fontes:** memória Cowork (estado 11-Jun, v1.35.0) · Notion HQ (Estratégia v2 05-Mai, Value Benchmark 24-Mai) · docs oficiais Claude Code + VS Code (web hoje) · GitHub issues

---

## TL;DR

⚠️ **"Cópia do plugin do Claude" é a pergunta errada — e a resposta certa é melhor do que a pergunta.** A extensão Claude Code para VS Code **embute o mesmo CLI** e partilha `~/.claude/settings.json` com hooks e MCP. O Mooter é hint layer sobre esse mesmo harness. Logo:

| Via | O quê | Esforço | Veredicto |
|---|---|---|---|
| **A — Zero-build** | Validar que o hook do Mooter já dispara dentro da extensão Claude Code | 1 dia (teste) | 🔥 P0 — fazer já |
| **B — Companion extension** | "Mooter for VS Code": painel de routing/savings ao lado do Claude Code, sem reimplementar agente | 2-4 semanas | ✅ Recomendado |
| **C — Clone completo** | Agente próprio tipo Cline/Roo com Agent SDK + routing Mooter | 3-6+ meses | ❌ Não fazer agora |
| **D — LM Chat Provider (BYOK)** | Provider "Mooter" no chat nativo do VS Code/Copilot | 3-6 semanas | 🟡 Opcional, fase 2 |

A extensão VS Code **já estava no teu roadmap** — milestone de Julho na Estratégia v2 (Notion, 2026-05-05). Não é desvio; é a fase certa, desde que seja a via B e não a C.

---

## 1. O que a extensão Claude Code realmente é (web hoje)

- Bundle do **mesmo CLI** + painel gráfico: diff viewer side-by-side, @-mentions, plan review, tabs de sessão, checkpoints ([docs oficiais](https://code.claude.com/docs/en/vs-code)).
- **Settings partilhados**: `~/.claude/settings.json` é usado por extensão E CLI — "allowed commands, environment variables, **hooks**, and MCP servers".
- Inclui um **MCP server local `ide`** que expõe diagnostics do VS Code ao modelo.
- ⚠️ **Contradição a verificar**: a [issue #21736](https://github.com/anthropics/claude-code/issues/21736) (aberta) reporta que hooks configurados em settings.json **não disparam dentro da extensão** (só no CLI). Os docs dizem que settings são partilhados. Não está claro se a issue já foi resolvida ou se afecta o `UserPromptSubmit` — **teste empírico necessário** (ver §4, Teste P0).

**Implicação directa:** se o hook disparar na extensão, o Mooter **já funciona dentro do VS Code hoje**, sem escreveres uma linha de extensão. Se não disparar, é um blocker conhecido com issue pública onde podes fazer pressão/contribuir.

## 2. O que o Mooter é (vault/Notion/memória)

- **Hint layer, não proxy** — `UserPromptSubmit` hook + doutrina CLAUDE.md. Nunca intercepta a API (memória, 11-Jun).
- v1.35.0, repo **público** `mooter` (MIT), 16 packages `@mooter/*`, two-axis routing (T0-T3 + T5 fable) + Moo Packs.
- ⚠️ **Bug aberto de produto**: Moo Packs **não estão wired no hook live** em prod (deep-dive Mac 2026-06-10) — metade da tese dark.
- **Veredicto do Value Benchmark (Notion, 24-Mai)**: COMPETITIVE in-domain (62.7% acc, Claude Code routing), DOMINATED out-of-domain. Conclusão explícita: *"amplificar Claude Code, não competir com LiteLLM"*. Risk discrimination é o edge real (Youden 0.520).

## 3. As 4 vias em detalhe

### Via A — Zero-build (validação) 🔥
O Mooter injecta hints via hook no harness que a extensão embute. Se funcionar: actualizar docs + landing ("Works in VS Code"), screenshot, done. Custo ~0. **Este teste decide tudo o resto.**

### Via B — "Mooter for VS Code" companion extension ✅
Não reimplementa o Claude — **observa e mostra**. O Claude Code extension é o motor; o Mooter dá o cockpit:

| Feature | Fonte de dados (já existe) | Esforço |
|---|---|---|
| Status bar: tier da última decisão (T0🐄…T3🚀) + modelo | `decisions.log` / `~/.mooter` | XS |
| Sidebar: savings do dia/semana ($, %), distribuição de tiers | savings-tracker (porta 7821) / stats | S |
| Painel de decisão: porquê T2? regex match, confidence, pack hint | `inject_context.js` output | S-M |
| Toggle de modos (beast/zen/autopilot) | `mooter-mode.js` | S |
| Pack indicator: que Moo Pack está activo no workspace | pack_resolve (⚠️ depois do fix do bug) | S |
| Notificação "este prompt podia ter ido a T0 — $0.42 saved" | shadow_mode | M |

**Stack:** TypeScript + VS Code Extension API (TreeView, StatusBar, Webview). Nada de LM API, nada de agente. Lê ficheiros/endpoints locais que o runtime Mooter já produz. É essencialmente o dashboard (localhost:7820) portado para dentro do IDE — código de UI reaproveitável.

**Distribuição:** VS Code Marketplace + Open VSX = canal de descoberta novo (devs procuram "claude code cost" no marketplace). Cada install é um funnel para o CLI.

### Via C — Clone completo (agente próprio) ❌
Tecnicamente possível — o [Agent SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript) dá o mesmo agent loop/tools/permissions do Claude Code para embeber em extensão própria. Mas:

- Competirias com **Cline, Roo Code, Continue, Kilo Code** — maduros, com comunidades grandes; o Kilo até já vende "model routing to control agentic spend" ([comparativos 2026](https://kilo.ai/articles/coding-agents-for-vscode)).
- O benchmark de 24-Mai diz explicitamente: o edge do Mooter é **dentro do harness Claude Code**, não como produto standalone de routing geral.
- 3-6+ meses solo para chegar a paridade de UX que o Cline já tem. Burn do sabbatical inteiro num red ocean.
- Replicar a UI do plugin da Anthropic levanta ainda questões de marca/IP — evitar "quase cópia" literal.

### Via D — LanguageModelChatProvider (BYOK) 🟡
Desde o VS Code 1.104 existe a [LM Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider): qualquer extensão pode contribuir modelos ao chat nativo (Copilot), incl. [sem login GitHub desde 1.122, Mai-2026](https://visualstudiomagazine.com/articles/2026/05/29/vs-code-1-122-lets-byok-work-without-github-sign-in.aspx). Um provider "Mooter" apareceria como modelo virtual que roteia por baixo (Ollama/Haiku/Sonnet/Opus). Interessante mas: (1) é o ecossistema Copilot, não Claude Code — fora do nicho onde o Mooter é COMPETITIVE; (2) o classifier foi tunado para prompts Claude Code; OOD é onde o Mooter é DOMINATED. Só faz sentido pós-B, se houver pull.

## 4. Plano recomendado

| # | Acção | Quando |
|---|---|---|
| 1 🔥 | **Teste P0:** instalar extensão Claude Code no Mac, prompt de teste, verificar se `<mooter-hint>` aparece no contexto (hook dispara?) | Hoje, 30 min |
| 2 ⚠️ | **Fix Moo Packs no hook live** antes de qualquer superfície nova — não expor no IDE um produto meio-dark | Esta semana |
| 3 | Se hook OK → docs + landing "Works with VS Code extension" (win grátis) | Esta semana |
| 4 | Spec da companion extension (via B): MVP = status bar + sidebar savings | Semana seguinte |
| 5 | MVP em 2 semanas, publicar Marketplace + Open VSX, badge no README | Jun→Jul |
| 6 🟡 | Avaliar via D só depois de tracção da B | Q3 se justificar |

## 5. Riscos

| Risco | Prob. | Mitigação |
|---|---|---|
| Hooks não disparam na extensão (issue #21736) | Média | Teste P0; fallback: companion extension lê decisions.log na mesma (o CLI dentro do terminal integrado dispara hooks) |
| Anthropic lança routing nativo (sinal já notado no benchmark, issues #19269/#30453) | Média | Velocidade + transparência como diferencial; companion sobrevive (observabilidade ≠ routing) |
| Manutenção de mais uma superfície (já tens 16 packages) | Alta | MVP mínimo; UI só lê dados existentes, zero lógica nova de routing |
| Kilo/Cline adicionam cost dashboards | Média | O Mooter tem dados que eles não têm: doutrina de risco + decisões reais do harness Claude Code |

## 6. Números que NÃO estão claros do contexto — verifica antes de decidir

- ⚠️ Stars/contributors actuais do repo público `mooter` (gate de 26-Mai: ≥250★ + 3 contribs — desfecho não registado nas memórias; verifica em github.com/pauloloureiroshp-ship-it/mooter)
- ⚠️ Estado actual da issue #21736 (pode já ter fix em release recente)
- ⚠️ Se a extensão Claude Code injecta o `UserPromptSubmit` output no painel gráfico ou só em terminal mode (`useTerminal: true` seria workaround imediato)

---

## Veredicto final

**Viável — mas como companion, não como cópia.** A jogada com melhor ROI é exactamente a inversa da proposta literal: em vez de reconstruir o plugin do Claude com Mooter dentro (meses, red ocean, contra o teu próprio benchmark), deixa o plugin do Claude ser o motor e constrói o **cockpit Mooter** à volta dele (semanas, blue ocean, alinhado com "amplificar Claude Code"). E o primeiro passo custa 30 minutos: testar se o hook dispara dentro da extensão.

**Sources:**
- [Claude Code VS Code docs](https://code.claude.com/docs/en/vs-code) · [Issue #21736 — hooks na extensão](https://github.com/anthropics/claude-code/issues/21736)
- [VS Code LM Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider) · [BYOK announcement](https://code.visualstudio.com/blogs/2025/10/22/bring-your-own-key) · [VS Code 1.122 BYOK sem login](https://visualstudiomagazine.com/articles/2026/05/29/vs-code-1-122-lets-byok-work-without-github-sign-in.aspx)
- [Agent SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript) · [Coding agents VS Code 2026](https://kilo.ai/articles/coding-agents-for-vscode) · [Cline vs Roo vs Continue](https://www.devtoolreviews.com/reviews/cline-vs-roo-code-vs-continue)
- Notion: [Estratégia v2 (05-Mai)](https://app.notion.com/p/3576f6e42bc481869870e07d3020c13a) · [Value Benchmark (24-Mai)](https://app.notion.com/p/36a6f6e42bc481d0b8c4ec6cb5de59f4)
