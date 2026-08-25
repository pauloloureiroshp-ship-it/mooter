# 🗺️ MAPA + ROADMAP — Conector Seamless até "produto perfeito" · 2026-07-24

> Fonte única do plano. Estado vivo: memória Cowork `project_mooter_seamless_f0` · canon vault
> `40-strategy/mooter-seamless-conector-2026-07-24.md` · espelho Notion (página Conector Seamless v0.2).
> Regra: nenhum marco avança sem MÉTRICA no ledger. ✅ feito · 🔜 próximo · 🟡 em curso · ❌ gate.

## O mapa (onde estamos → onde vamos)

```
[✅ F0+M1] daemon v0.2 + ledger + guard v0 + Marco 1 técnico ($0.4826 · 16s · job-mrz8fzbc-2ec6)
[🟡 M2 ] COSTURA NATIVA — sessão Cowork fresca (Opus 5) chama mooter_* sem script  ← DISPARADA HOJE
[🔜 F1 ] hardening: adapter moo ($0) · hooks gitleaks vermelhos · matriz D4 · breakers D5 · RTD baseline (wave cc+codex)
[🔜 F2 ] VS Code JANELA: semáforo/cockpit leem o ledger (BUS ÚNICO — reconciliar com agent-sync/dispatch-queue.json)
         + Atalaia (moo $0 vigia o ledger) + scheduled task de vigília com push
[❄️ F3 ] PRODUTO: .mcpb one-click + privacy policy + submissão diretório MCP (gate: 2 semanas dogfood MEDIDO)
[❄️ F4 ] OAuth/hosting — só se houver procura mobile-sem-desktop
```

## M2 — o teste E2E nativo (sessão fresca, Opus 5)

Objetivo: provar o loop COMPLETO sem nenhum script/Run-dialog: Cowork → tool nativa →
CC e Codex em worktrees → collect → relatório no repo. Tarefa REAL embutida: auditoria
read-only da divergência dos dois buses (insumo direto da F2). Prova exigida: linhas novas
no ledger + `_handoff/M2_NATIVE_SEAM_REPORT.md` escrito pela sessão M2.

## Checklist de loopholes (cada um com dono e fase — nada fica órfão)

| # | Loophole | Fecho | Fase |
|---|---|---|---|
| 1 | Costura nativa não usada em produção | M2 (hoje) | M2 |
| 2 | Guard v0 é seam, não canónico | handoff-lint/guard canónico; adaptar NOSSO lado | F1 |
| 3 | Dois buses (ledger ≠ dispatch-queue.json) | decisão de bus único + escritor único | F2 |
| 4 | Sem circuit-breakers/orçamento (D5) | implementar com dado real $0.35–0.48/job | F1 |
| 5 | Hooks gitleaks não rodam DENTRO dos jobs | `.claude/settings.json` por worktree + caso vermelho | F1 |
| 6 | Codex sem job real via daemon · moo inexistente | job M2 (codex) + adapter moo | M2/F1 |
| 7 | cost_usd só do CC | parser usage codex/gemini quando houver fonte real; até lá n/d | F1 |
| 8 | Keys + PAT GitHub em plaintext | rotação (Paulo) → destrava jobs com write | ❌ gate |
| 9 | depth=1 (job não dispatcha job) sem enforcement | flag no ledger + recusa no guard | F1 |
| 10 | Timeout path nunca exercido | teste vermelho com job dummy longo | F1 |

## Estratégia de modelos (Opus 5, lançado hoje — verificado)

- Solistas CC: A/B Opus 5 × Opus 4.8 numa wave real, decidir pelo ledger (custo × aceite 1ª volta).
- Brain: sessões rotineiras podem rodar Opus 5 (≈½ custo do Fable); Fable para arbitragem dura.
- Computer-use melhor no Opus 5 ajuda nos degraus Run-dialog, mas a meta é eliminá-los (conector nativo).

## Definição de "produto perfeito" (critérios de saída, mensuráveis)

1. 1 dia inteiro operado só do Cowork desktop (relato + ledger, zero terminal).
2. RTD baseline e custo/wave publicados do ledger (n/d proibido nesses campos).
3. 0 incidentes de guard bypass; 2 casos vermelhos de hook provados.
4. Semáforo VS Code refletindo jobs do ledger em <5s (janela, não cano).
5. `.mcpb` instala em máquina limpa em <2 min com privacy policy.
