# ⇄ Handoff Cowork → Cowork · Live Sessions do cockpit — UX/UI perfeita, clean, coerente (2026-07-08)

> **Pedido do Paulo (verbatim, 2026-07-08):** cada live session muito menor (está poluída) · título informa o chat do Cowork E a sessão do VS Code · clicar no título abre perfeitamente a aba certa · abrir qualquer aba CC aparece automaticamente no cockpit · breakdown clean de tudo · limpar toggles/elementos que não servem a metodologia · **todo botão com tooltip que diz exactamente o que faz, e faz** · UX/UI perfeita e coerente com o projecto. "Não vamos errar novamente."

## 0. A regra que evita errar de novo: NÃO é um redesign novo
Isto já tem spec-mãe: **`_handoff/CTO_COMMAND_DECK_SPEC.md` (W15)** — super masterprompt pronto, 6 fases, 6 leis de pilotagem. O pedido do Paulo é executar AGORA um recorte focado: **W15 Fase 2 (Floor + deep-link) + Fase 5 (auditoria de botões) + tokens da Fase 0 no que tocares**. A nova conversa NÃO inventa layout novo — implementa o slot "Floor/sessões" do spec. Inventar um segundo design = o erro que já cometemos com o §MP-B (apanhado a 2026-07-06).

## 1. Mapa dor → solução já especificada → fonte no código (confrontar antes de emitir!)

| Dor do Paulo | Solução no W15 spec | Onde no código (verificar linhas actuais) |
|---|---|---|
| Sessão poluída/grande | Linha compacta: `[dot estado][ícone tipo 💬/♾️/⏰] título [estado working/🙋/⏸️/💤/⚠️] [modelo] [📌][⇄][↗]` — 1 linha, disclosure para detalhe | `packages/vscode-extension/src/mission-control-view.js` + `mc-snapshot.js` |
| Título = chat Cowork + sessão VS Code | **A fonte JÁ EXISTE:** `~/.claude/tools/router/.cowork-sessions.json` mapeia `session_id → {coworkProject, coworkTitle, coworkConversationId}` (WCOCKPIT-9 Bloco A; escrito pelo sdk-runner e mode-registry.decorate) | `_handoff/loop/sdk-runner.mjs` (writeCoworkSession) · `tools/router/` mode-registry |
| Click no título abre a aba certa | Comando novo **`mooter.openSessionTab`** (W15 Fase 2 — "coerência wave=sessão=aba"; já há um fallback openExternal `vscode://anthropic.claude-code/open?session=` em `extension.js` ~l.395 — confrontar porque falha hoje) | `extension.js` (openSession/deep-link) |
| Aba nova aparece automática | Confrontar o mecanismo actual de detecção (`host-extra.recentSessions()` — poll? fs.watch?) e fechar o gap para evento-driven ou poll curto honesto | `host-extra.js` |
| Sem breakdown / poluição | Disclosure colapsável com estado lembrado + **inbox por exceção** (só o que precisa do humano sobe) — leis 1/2 do W15 | `mission-control-view.js` |
| Toggles/elementos inúteis | **Regra do Paulo (vault 2026-06-30): "cada elemento é uma feature, ou não existe."** Inventariar cada controlo por sessão → ou tem command real + tooltip + serve a metodologia (handoff perfeito · honest-copy · gestão por exceção) → fica; senão → REMOVE (delete-bias) | `COCKPIT_UX_AUDIT.md` (docs/strategy) tem a lista de controlos mortos |
| Tooltips exactos | W15 Fase 5: **auditoria de botões** — cada controlo dispara command registado + `title`/tooltip que descreve o efeito REAL; grep a números-nu sem fonte | idem |

## 2. Doutrina (colar no masterprompt que emitires)
- Régua UX (vault [[30-learnings/mooter-cockpit-polish-backlog-2026-06-30]]): *"o vibe coder tem de ter tudo na mão — visualização, transparência, velocidade. Sem redundância. Cada elemento é uma feature, ou não existe."* Polish ≠ cosmético — é coerência com a tese da honestidade.
- 6 leis do W15 (gestão por exceção · tela calma · 1 clique · coerência wave=sessão=aba · contexto é rio · agrega >12 sessões).
- Honest-copy é lei de código: dado em falta → `n/d`, nunca fabricar, nunca crashar. Proveniência mecânica > inferida (lição do BOARD falso — [[E1 do polish backlog]]).
- Tokens: `var(--vscode-*)` em tudo o que tocares (zero hex novo) · `prefers-reduced-motion` · WCAG AA.

## 3. O que a nova conversa DEVE fazer (por ordem)
1. **Confrontar o código real** (não o meu resumo): `mission-control-view.js`, `host-extra.js`, `mc-snapshot.js`, `extension.js` (deep-link actual), `.cowork-sessions.json` vivo na máquina, e `COCKPIT_UX_AUDIT.md` — listar o que existe vs a tabela acima. O handoff do BOARD (25 sessões, 2026-07-08) mostra os títulos actuais TRUNCADOS e inúteis ("És o agente de tarefas ancoradas do Live Prev…") — é a dor viva.
2. **Inventário de controlos por live session** (print + lista): cada um → fica (command+tooltip) ou morre (delete-bias). Gate humano do Paulo na lista de remoções (1 mensagem).
3. **Emitir UM masterprompt CC** (não vários): worktree própria `../frugal-mc-clean`, branch `feat/mc-live-sessions-clean`, from main ATUAL; R1-R6; só `packages/vscode-extension/**` + testes; commits atómicos por bloco (linha compacta → título Cowork+CC → deep-link → auto-detect → disclosure/inbox → auditoria botões+tooltips → vsix + prova visual).
4. **GATE:** printscreen antes/depois · cada botão com tooltip exacto e command real (0 mortos) · click abre a aba certa (provado com 2+ sessões vivas) · aba nova aparece sem reload · zero regressão (testes da extensão verdes) · sha classify intacta · sem push/merge sem OK.

## 4. Gotchas (não pisar)
- **⚠️ Trilho paralelo vivo:** a fleet (FLEET_TOTAL) corre em `../frugal-fleet-arm` e o tree `~/frugal` está partilhado por ~21 sessões (77 dirty). A worktree nova NÃO toca em `_handoff/fleet/**` nem no tree principal. Fleet Console (parte do cockpit) só se for aditivo e sem conflito — o slot dela é do §MP-B/W15.
- O redesign COMPLETO do deck (project switcher, hardware strip, 5 lentes) continua a ser o W15 — esta frente é o recorte live-sessions. Componentes que criares têm de encaixar no layout alvo do spec (anti-retrabalho).
- Docs novos escritos no Cowork ficam untracked → **Onda 0: commit docs-only em main** antes de abrir a worktree (lição 2026-06-30).
- Memórias relevantes: [[project_mooter_cto_command_deck]] · [[project_mooter_cockpit_cowork_bug]] · [[project_mooter_honest_controls_wave]] · Notion "🎨 Cockpit Polish — Backlog (2026-06-30)" (frente F2 = Handoff & Live-Session UX, pontos A2/A3/A4/B3/B4).

**Começa por:** ler este brief → confrontar §3.1 → só depois escrever o masterprompt. Confrontar antes de emitir — é a régua que nos tem salvo.
