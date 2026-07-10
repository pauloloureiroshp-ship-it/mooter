# WAVE 33.5 — Day 0 Honest Recon

**Data:** 2026-06-08 · **Executor:** CC (Opus) · **Branch base:** `main @ f375dd6`
**Veredicto:** GO com âmbito ajustado. 4 premissas do brief corrigidas (padrão Day 0). 1 bloqueador de sistema (bwrap) requer acção do Paulo.

---

## TL;DR (3 linhas)
1. `classify.js` **INTACT confirmado** — canónico é `tools/router/classify.js` sha `7b01eb8623a0b8fc` (brief aponta path errado `packages/router/src/classify.js` — não existe).
2. **`bwrap` NÃO instalado** → Block B (sandbox) não pode ser smoke-tested sem `sudo apt install bubblewrap` + (Ubuntu 24.04+) perfil AppArmor. Acção Paulo.
3. **Block A e Block C NÃO são greenfield**: `sessions.ts` (205 L, Wave 33) e `init.ts` (785 L, Wave 2) já existem → estender, não criar de raiz.

---

## Findings por ponto (10/10)

| # | Ponto | Resultado | Impacto no brief |
|---|---|---|---|
| 1 | classify.js sha INTACT | ✅ `tools/router/classify.js` = `7b01eb8623a0b8fc` (= brief `7b01eb86…`). Sem mods desde Wave 11 (últimas mods são Wave 9 / val 2026-05-07). | **Premissa corrigida**: path do brief `packages/router/src/classify.js` está errado. Canónico = `tools/router/`. |
| 2 | Wave 28-33 packages | ✅ Presentes: `turboquant-backend`, `vllm-backend`, `minimax-watcher`, `arbitrage-monitor`, `workflow`, `synthesis`, `validation`, `mcp-server`, `transparency`, `effort`, `data-rights`, `router`, `cli`. | INTOCAR confirmado. Novos packages = adições limpas. |
| 3 | bubblewrap | ❌ `bwrap NOT FOUND`. | **BLOQUEADOR Block B.** Install: `sudo apt install bubblewrap`. Ubuntu 24.04+ WSL2 precisa perfil AppArmor `/etc/apparmor.d/bwrap` (user namespaces). |
| 4 | Apple Seatbelt | ❌ `sandbox-exec` ausente (esperado em Linux). | Só documentar (macOS = Wave 35). |
| 5 | ~/.claude/settings.json hooks | SessionStart, UserPromptSubmit (inject_context.js + frugal-turn-header.js), Stop (stop_hook.js + gsd-turn-end.js), PostToolUse (post_tool_badge.js, matcher `Bash\|Agent\|Task`), SubagentStop. **PreToolUse = 0.** | **Block H**: PreToolUse livre (add limpo). PostToolUse já ocupado → append/coexistir, não substituir. Hooks são config partilhada → opt-in + backup obrigatório. |
| 6 | CC Agent Teams API | CC `2.1.168` (= mínimo do brief). `claude plugins list` funciona (1 plugin: frontend-design). Sem API de sidebar widget exposta. | Sidebar widget = fora de âmbito (já era Wave 34). |
| 7 | git worktree list | 1 worktree apenas (`main`). | Block H (Conductor) resolve race entre N worktrees — hoje N=1. Feature válida (multi-terminal), mas teste real precisa de 2º worktree sintético. |
| 8 | CLI wizard stack | Inquirer `14.0.2`, Chalk `5.6.2`, Ora recente (todos ESM-only). | Block C: adicionar Inquirer ao bundle CLI tem custo (ESM + deps). Avaliar vs estender `init.ts` existente. |
| 9 | bwrap WSL2 install | `apt install bubblewrap`; WSL2 OK (WSL1 não); Ubuntu 24.04+ requer perfil AppArmor; `socat` p/ relay de rede. | Block B install-instructions + fallback graceful (sem unsandboxed — security wins). |
| 10 | `mooter spawn` existe? | ❌ Não. Greenfield confirmado p/ Block B. | OK. |

### Premissa extra refutada (ponto 5/extra)
- **`sessions.ts` já existe (205 L, Wave 33)** com `mooter sessions list`. Block A = **estender** package CLI existente, não criar `@mooter/sessions-orchestrator` de raiz (ou criar package e portar o que sessions.ts já faz).
- **`init.ts` já existe (785 L, Wave 2 Day 6)** — wizard de activação com TTY-handling, hardware probe, persona, API-key prompt. Block C = **estender** este wizard (não reescrever com Inquirer — risco de bundle + regressão).

---

## Decisões de âmbito recomendadas (vs brief)

1. **classify.js**: usar `tools/router/classify.js` como gate sha (não o path do brief). ✅
2. **Block B sandbox**: gated em `bwrap`. Paulo instala (`sudo apt install bubblewrap` + AppArmor se 24.04+). Sem isso, Block B entrega arquitectura + `linux_bubblewrap.ts` + testes que correm em modo "detect-and-warn", mas o smoke CVE real fica pendente até bwrap presente.
3. **Block A**: estender `sessions.ts` + novo `cross_session_aggregator.ts` + chips statusline (A.6/A.7). Sub-feature de maior valor e menor risco → Day 1.
4. **Block C**: estender `init.ts` em vez de novo package Inquirer-based; manter byte-compat do flow actual, adicionar passos novos opt-in.
5. **Block H**: PreToolUse livre; integração de hooks = opt-in + backup `settings.json` antes de tocar.

## Bloqueadores que precisam do Paulo
- [ ] `sudo apt install bubblewrap socat` (Block B smoke real)
- [ ] (se Ubuntu ≥24.04) perfil AppArmor `/etc/apparmor.d/bwrap`
- [ ] Decisão de sequência/âmbito desta sessão (8 blocos = multi-sessão)

---
*Recon 10/10 completa. classify.js INTACT pré-verificado. Próximo passo gated na decisão de sequência do Paulo.*
