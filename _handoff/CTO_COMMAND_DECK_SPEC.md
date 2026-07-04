# ⇄ COWORK → CC · SUPER MASTERPROMPT — Mooter CTO Command Deck (redesign do plugin VS Code)

> A wave que transforma o plugin de 7 tabs planas no **sistema operativo de um CTO/CEO solo** que pilota muitos
> agentes por exceção. Todas as features já existem — isto é **arquitetura de informação + link front↔back sem erro
> + identidade viva**. Alvo visual: os 8 mocks da sessão Cowork 2026-07-03 (descritos abaixo ao detalhe). É L (grande);
> **faseado, worktree por fase, gate humano no merge**. Nada de push/merge sem o OK do Paulo.

## 🎯 GOAL
Abrir o plugin e sentir: *"vejo tudo, controlo tudo, e só o que precisa de mim me chama"*. Cada número é verdadeiro
(honest-copy), cada botão funciona, cada lente diagnostica ("o que mudou · porquê · o que faço"), e a vaca 🐮 supervisiona.

## 🧭 As 6 leis de pilotagem (a filosofia — não negociável)
1. **Gestão por exceção** — só o que exige o humano sobe ao topo (inbox). Alerta nº1 = **sessão à espera de resposta**
   (`your turn`), acima até dos gates: um agente parado é o desperdício-mor.
2. **A tela calma é a vitória** — sem exceções, o CTO não faz nada; a frota flui.
3. **Uma empresa, um clique** — project switcher (Mooter/Marley/…) troca o deck inteiro (fonte: `mode-registry` projeto-por-sessão).
4. **Coerência absoluta** — wave = sessão = aba do CC, mesmo título. Click → abre a aba certa (comando novo).
5. **Contexto é rio, não balde** — handoff visível a fluir Cowork→CC→moos→Ledger.
6. **Agrega quando escala** — ≤12 sessões vê-se uma a uma; >12 agrega por etapa/wave/squad (= o Fleet Console).

## 🖥️ LAYOUT ALVO (top→bottom · painel estreito ~360-400px · header fixo)
1. **Project switcher bar** — 🐮(anima por modo) · `[Mooter · frugal ▾]` · `[❄️ Marley]` · `[＋ New ▾]` (menu: 💬 CC · ♾️ Loop · ⏰ Schedule). Fonte: `mode-registry.js` (projeto/modo por sessão).
2. **Inbox · o que precisa de ti 🔔** — linha-destaque a pulsar `🙋 N sessões à tua espera (your turn)`; abaixo, chips priorizados `🔴 N merge gate · ⚠️ N unsaved · 💸 budget X% · 🟢 resto flui`. Fonte: `cowork-waiting.js`/`NEEDS_DECISION.json` + git (unmerged/unpushed) + `host-extra` (unsaved).
3. **Hardware strip** — `🎮 GPU X% [bar] · 🟢 cabem +N moos · 🌡️ T°C · CPU X% · Max X%`. Fonte: `nvidia-smi` via overclock runner (`packages/overclock-moo`) + `subscriptions.js`. **Honesto: n/d se nvidia-smi ausente.**
4. **🏁 Pipeline** — esteira `spec→plan→exec→review→ship`, barra de carga por etapa (nº sessões) + marca do **gargalo**. Fonte: estados de sessão agregados.
5. **Lentes colapsáveis** (disclosure; `localStorage` lembra o estado aberto/fechado):
   - **🏭 Floor** — sessões: cada linha = `[dot estado] [ícone tipo 💬/♾️/⏰] título-da-aba-CC [estado: working/🙋 your turn/⏸️ waiting/💤 idle/⚠️ unsaved] [modelo] [📌 pin] [⇄ handoff] [↗ abre CC]`. Depois **⚡ Local Moo Fleet** (honesto: "N prontos · advisory · 0 dispatches reais" quando aplicável) e **🚜 Fleet Console** (agregado: N pilares · X loop · Y idle → expande). Fonte: `host-extra.recentSessions()` + `mode-registry` + `_handoff/fleet/*/STATE.json`.
   - **📊 Flow** — Project Command: WIP `Now/Next/Later` + waves (título · squad · ⇄ · ↗) + `🔮 Forecast` (Monte Carlo, N waves, P85). Fonte: `pc-snapshot.js` + `tools/router/forecast/forecast.json` + `ledger-read.js`.
   - **💰 Economics** — poupança por tier (barra) + `$0 real` + `💸 budget X%` + spans (W6) + `💳 Max X%/sem` + AI-attribution ("a poupança vem do routing, não de trade-off"). Fonte: savings tracker + `hub-client.js` + telemetria classify.
   - **🧠 Brain** — `🧠 Pastor · 🧬 Adapters (W7) · 💡 Insights (W9) · 🕸️ Graph (W10) · ⇄ Handoff (3 níveis: projeto/wave/sessão) · 🛡️ Guardian · 📒 Ledger`. Fonte: pastor + `guardian-chip.js` + Ledger. **Adapters/Insights/Graph = placeholders honestos até as waves entregarem (mostrar "🌊 W7" etc.).**
   - **🏗️ Foundations** (chips) — `Arch (classify frozen) · 🩺 Doctor · 🛡️ Security (DP) · ⚙️ Setup (hardware · subscription · packs, resumido)`. Fonte: `doctor-checks.js` · `arch-tree.js` · `subscriptions.js`.
6. **⇄ Handoff flow** — mini-fluxograma animado `🧠 Cowork → 💬 CC → 🐮 moos → 📒 Ledger` (partícula a fluir). Legenda: "nunca seca · nunca mente (work-aware)".

## 📋 Inventário de features (♻️ já existe · 🆕 novo · 🌊 wave futura)
♻️ New CC session (`mooter.newSession`), modos 🐢/🐮/🔥 + vaca animada (keyframes `moowalk/wait/crazy`), savings, Pastor, Guardian, handoff-do-projeto, Project Command, Doctor, Arch, subscription (`subscriptions.js`), GPU via nvidia-smi, `mode-registry`, `cowork-waiting`, `NEEDS_DECISION`.
🆕 project switcher UI, inbox por exceção, `your turn` alerta, hardware strip no cockpit, pipeline com carga, sessões com **tipo+estado+pin**, deep-link click→aba CC, handoff por **wave/sessão** (só há de projeto), `+ New` multi-tipo, micro-diagnósticos $0 (moo local), activity feed, filtro/busca de sessões, empty/first-run state, notificação desktop, diff preview, cost projection.
🌊 New Loop/Schedule + Fleet Console (W5), Fleet Commander (W4), Adapters (W7), Insights (W9), Graph memory (W10), budget span-level (W6).

## 🗺️ Mapa wave → superfície (crescimento previsível, sem redesenho)
W13 Delivery→Flow · W14 Comms→Handoff flow · W5 Loop Sessions→`+New` tipos + Floor + Fleet Console · W4 Fleet→Fleet Console · W7 Forge→Brain/Adapters · W9 TTL→Brain/Insights · W6 Budget→Economics+inbox · W11 bandit→Foundations/Arch · W8 speculative→Economics/tier · W10 graph→Brain · W12 DP→Foundations/Security · W3 onboarding→empty-state.

## 🔒 GUARD (invariantes — violar = abortar)
- `tools/router/classify.js` **FROZEN** (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — prova no início e fim).
- Só `packages/vscode-extension/**` é alvo de escrita (+ testes). Engine/packages frozen NÃO tocar.
- **Honest-copy é lei de código**: quando um data-source falta → `n/d`/advisory, **nunca fabricar**, nunca crashar.
- Selective `git add` (nunca `-A`). **Sem push/merge/tag sem o OK do Paulo.** PT-PT conversa · inglês no código.
- `prefers-reduced-motion` desliga todas as animações · alvo WCAG 2.1 AA.

## ▶ DO — faseado (worktree por fase; gate entre fases; NÃO avançar sem o gate)
**Fase 0 · Tokens & foundation** (`../frugal-deck-tokens`, `feat/deck-tokens`): matar as ~60 cores hardcoded (`#E5C07B`, `#D19A66`, `#a78bfa`…) → `var(--vscode-*)` com fallback; suporte high-contrast (`ColorThemeKind`); `prefers-reduced-motion`; avaliar VSCode Elements Lite (só CSS). **Gate:** 3 temas (claro/escuro/high-contrast) legíveis · zero hex hardcoded no CSS · testes verdes · sha intacta.
**Fase 1 · A espinha** (`feat/deck-shell`): header fixo + project switcher + `+ New ▾` (multi-tipo) + inbox por exceção (`cowork-waiting`/`NEEDS_DECISION`) + roles WCAG (tablist/radiogroup, focus, ≥11px). **Gate:** inbox mostra o estado real (your-turn/gate/unsaved) · header sticky · a11y ok.
**Fase 2 · Floor + deep-link** (`feat/deck-floor`): sessões com tipo+estado+pin + Local Moo Fleet honesto + Fleet Console agregado; **comando novo `mooter.openSessionTab`** (click linha → foca/abre a aba CC do mesmo título — coerência wave=sessão=aba); handoff por wave/sessão. **Gate:** click abre a aba certa · honest-copy (0 dispatches = advisory) · pin persiste.
**Fase 3 · Lentes ligadas** (`feat/deck-lenses`): Flow (`pc-snapshot`+`forecast.json`), Economics (savings+budget+`hub-client`), Brain (Pastor+Guardian+placeholders W7/W9/W10), Foundations. Cada widget lê o **data-source real**; micro-diagnóstico $0 via moo local. **Gate:** cada número tem origem real ou `n/d`; nenhum hardcoded.
**Fase 4 · Vida** (`feat/deck-live`): hardware strip (nvidia-smi) + pipeline com carga + handoff flow + vaca por modo + pulsos live. **Gate:** nvidia-smi ausente → `n/d` (não crash) · reduced-motion desliga tudo.
**Fase 5 · Sem-erro** (`feat/deck-verify`): **auditoria de botões** (cada controlo dispara um `command` real registado — mata os "controlos mortos" do `COCKPIT_UX_AUDIT`) + E2E (snapshot real → webview, CSP-safe) + honest-copy audit (grep a números-nu sem fonte). **Gate:** 0 botões mortos · E2E verde · 0 fabricação · sha intacta · vsix instala e abre.

## ✅ GATE global (o que faz "impressionar qualquer um")
Abre o vsix instalado: 3 temas ok · cada botão funciona · cada número real ou `n/d` · click numa wave/sessão abre a aba CC · inbox chama só o que precisa · a vaca anima por modo · `prefers-reduced-motion` respeitado · `classify.js` sha intacta · zero regressão do trabalho de hoje (forecast/Project Command/AGENTS/roadmap).

## ⏭ NEXT
As waves futuras (W5/W7/W9/W10/W6) preenchem os placeholders 🌊 nas superfícies já reservadas — sem redesenho.

## 📋 BACK (reportar ao Cowork)
Por fase: branch onde o trabalho aconteceu (git-write worktree) + `git --no-pager diff --stat main..HEAD` (só adições em `packages/vscode-extension`) + testes + screenshot do vsix + confirmação "sha intacta + zero regressão". `uncommitted` é o alerta vermelho. **Nada de merge — o Paulo autoriza o irreversível.**
