📮 DESTINO: CC (Claude Code) · sessão FRESCA na worktree ../frugal-transp — lado PRODUTO/UX
   QUANDO: APÓS `integ-g1-cc-v2` fechar E, idealmente, o Ledger (PRÓX-A do Codex) expor o dado — a UX de custo
   real precisa de dado real do ledger. Se o ledger ainda não expõe → slot `n/d` honesto, marca PENDING.
🖥️✨ PRÓX-B · transparencia-cc-20260720 · o "no chinelo": custo real em tempo real + first-magic + decision packet
---
type: MASTERPROMPT
id: transparencia-cc-20260720
from: cowork (brain)
to: claude-code (dono do produto/plugin/UX)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier M)
contexto: _handoff/MOOTER_ESTUDO_POSICIONAMENTO_2026-07-20.md §5 (tese) + §7 (UX) + §10 wave B
---
⇄ COWORK → CC · MASTERPROMPT · construir o eixo onde deixamos Cursor/Lovable no chinelo (transparência)

⇄ ACK OBRIGATÓRIO (≤5 linhas, nas TUAS palavras).

🧭 CONTEXTO (do estudo): o mercado (Tokenpocalypse) tem medo de fatura e não confia no que o agente fez.
  Os incumbentes ESCONDEM custo (é o modelo de negócio deles). O nosso "no chinelo" é o oposto: **custo real
  na cara, em tempo real, + auditoria**. Best-practices confirmadas: o aha é hands-on em <2min (63% vs 42%);
  o inimigo é complexidade, não preço; integração NATIVA VS Code; trust-UX via "decision packet".

🎯 GOAL — contra a régua das 5 experiências (Watch/Review/Plan):
  T1 · **Custo real em tempo real (Watch)** — o statusline/semáforo mostra o custo real da sessão + savings vs
     all-Opus, lendo o ledger real (PRÓX-A). Ausente → `n/d` honesto (não zero). É o aha nº1.
  T2 · **First-magic onboarding (Plan)** — na 1ª instalação, em <2min e SEM docs, produzir **um recibo real**
     ("acabaste de rotear isto pra Haiku e poupaste $X"). Usa a VS Code walkthroughs API. (existe branch
     `feat/first-magic-onboarding` — reusa/avança, não recria).
  T3 · **Decision packet (Review)** — toda ação de risco (push/deploy/merge) mostra: ação+params EXATOS (não
     resumo simpático) · delta antes/depois · **reversibilidade explícita** (reverte? compensa? impossível?) ·
     comandos além de sim/não (approve/reject/edit/defer). Não-intrusivo (notificação, não modal).
📍 WHERE  worktree `../frugal-transp` · branch a partir do `feat/integ-g1` pós-v2. Fetch antes.
🛡 GUARD  classify FROZEN · **allowlist SÓ `packages/vscode-extension/**`** — PROIBIDO `tools/**` (Codex) ·
  concat-only no webview (WCOCKPIT) · integração NATIVA (status bar/side panel/walkthrough — não UI paralela) ·
  sem push · git add seletivo.
♻️ REUSE  o statusline/semáforo existente · `feat/first-magic-onboarding` · o ledger do Codex (consome, não
  recria) · paste-beacon · row-renderer.
⚡ SE-ENTÃO  Se o ledger não expõe o dado ainda → slot `n/d` + PENDING (não fabrica custo). Se o decision
  packet ficar intrusivo → prefere notificação passiva (best-practice P4). Se onboarding não couber em <2min →
  reporta o corte honesto.
❌ DO-NOT  Tocar `tools/**` (Codex) · fabricar custo/savings · modal bloqueante · UI paralela ao VS Code ·
  push/merge (Paulo) · feature fora das 5 experiências.
✅ GATE  custo real em tempo real (ou `n/d`) · onboarding produz recibo real em <2min · decision packet com
  reversibilidade explícita · não-intrusivo · suite verde · 0 regressão · screenshot (tu/Cowork) · 🤝 SOCIO + council-mini.
📋 REGISTRO  Carimba `events.jsonl` `{ts, from:"claude-code", to:"cowork", wave_id:"transparencia-cc-20260720",
  type:"ux", result}` + linha do ORCHESTRATION LOG.
📋 BACK  HANDOFF v1.1 ≤4k · diff · antes/depois das 3 experiências · screenshot do custo-real-em-tempo-real ·
  a linha do tracking. 📮 DESTINO  CC → BACK ao brain → Cowork valida VISUAL via computer-use → gate Paulo.
