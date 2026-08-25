# NOTION MIRROR (indice, 2026-08-25)
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/databases
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/casa-inteligente
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/cloude-speaker
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/jetson
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/mooter
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/sentia
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/cloude-home
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/marley-living
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/projects/postamore
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/system
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/_sync
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/_sync/__pycache__
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/hub
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/reference
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/strategy
===== ficheiros (por data) =====
_sync
system
strategy
reference
projects
hub
databases
WINDOWS-SETUP-MASTERPROMPT.md
README.md
FASE2-MASTERPROMPT.md
AUTOMATION.md
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/80-notion-mirror/databases/mooter-backlog.md
---
type: notion-mirror
notion_id: 503df7b6-645d-4f16-913b-9cb69555a0cd
notion_url: https://app.notion.com/p/503df7b6645d4f16913b9cb69555a0cd
title: "Mooter Backlog"
notion_last_edited: 2026-06-28T11:40:00Z
synced_at: 2026-06-29T10:09:21+00:00
mirror: read-only  # NÃO editar à mão: o próximo sync sobrescreve. Promove para a canon (00-90) para guardar.
tags: [notion-mirror]
---

# Mooter Backlog

> [!note] Snapshot do database **Mooter Backlog** (Notion). Captura as linhas alteradas no sync de 2026-06-28 (a query SQL completa exige plano Business; este snapshot reflecte o delta detectado, não necessariamente todas as linhas). Schema: Item · Estado · Frente · Prioridade · Impacto · Esforço · Timing/Gate · ID.

**Schema** — Estado: Idea · Scoped · Ready · Doing · Done · Parked · Frente: Site · Router · Cockpit · Handoff/Bridge · Packs · Rankings · GTM · Infra · Prioridade: P0–P3.

## Linhas (delta 2026-06-28)

| ID | Item | Estado | Frente | Prio | Imp | Esf | Timing/Gate |
|---|---|---|---|---|---|---|---|
| BL-15 | Handoff combinado (sessão + projecto) + header de comentário p/ Cowork | Scoped | Handoff/Bridge | P0 | 5 | 2 | Próxima wave — desbloqueia orquestração Cowork |
| BL-24 | [FIX] Backlog/HQ apartado por projecto (tirar Mooter de baixo de Cloude Home) | Ready | Infra | P1 | 4 | 1 | Decisão do Paulo: onde fica o HQ Mooter |
| BL-25 | Zero-orientation: estado visual do projecto em tempo real (PC ou Mac) | Idea | Cockpit | P1 | 5 | 3 | Combina Arquitectura Viva + handoff combinado + sync cross-machine |
| BL-41 | Breakdown multi-projecto no Mission Control | Idea | Cockpit | P2 | 4 | 2 | Depende de backlog/HQ apartado por projecto |
| BL-48 | [fix] Nome do projecto: basename limpo (frugal), não o path completo | Ready | Cockpit | P3 | 2 | 1 | Entra no polimento visual |

## Detalhe das linhas

### BL-15 — Handoff combinado (sessão + projecto) + header de comentário p/ Cowork
**Porquê:** para o Cowork orquestrar sem fazer asneira, o handoff por live-session tem de trazer TAMBÉM o contexto do projecto (visão total: o que está a acontecer + o que aquela sessão precisa de resposta).
**Como:**
- `generateHandoff()` passa a combinar handoff de sessão + resumo do projecto (estado das outras frentes, branch, gates pendentes).
- Adicionar no **topo** do texto gerado uma linha editável `▸ NOTA PARA O COWORK: ____` que o Paulo preenche antes de colar — direcciona a leitura.
**Ref:** `packages/vscode-extension/src/host-extra.js` (`generateHandoff` / `generateProjectHandoff`).

### BL-24 — [FIX] Backlog/HQ apartado por projecto
**Sinal:** a database 'Mooter Backlog' está aninhada em 'Mooter HQ' → que está DENTRO de '🏠 Cloude Home — HQ'. Isto mistura dois projectos distintos.
**Recomendação:** cada projecto (Mooter, Cloude Home, Cloude Speaker, Marley) com HQ + backlog APARTADO. Mover 'Mooter HQ' para ser top-level (ou sob um hub 'Projectos'), não filho de Cloude Home. Mesmo princípio no vault Obsidian (Johnny-Decimal por projecto).
**Gate:** decisão do Paulo de onde fica o HQ Mooter; depois movo via Notion.

### BL-25 — Zero-orientation: estado visual do projecto em tempo real
**Princípio-norte:** o vibe coder, em qualquer máquina, retoma o projecto e sabe INSTANTANEAMENTE o que está a acontecer e o que falta — sem 'momento de se ambientar'. Transparente, visual, incrível.
**Composto de:** Arquitectura Viva (worktrees+agentes animados) + handoff combinado sessão+projecto + sync cross-machine (vê os dois PCs). Métrica: reduzir o tempo de re-orientação ao retomar.

### BL-41 — Breakdown multi-projecto no Mission Control
Chips por projecto (frugal/Cloude Home/Cloude Speaker/Marley) com mini-estado; clicar filtra o mission control para esse projecto. Liga à separação de HQ/backlog por projecto (item Infra já no backlog).

### BL-48 — [fix] Nome do projecto: basename limpo (frugal), não o path completo
O cockpit mostra 'Users Paulo Loureiro frugal' em vez de 'frugal'. Em mc-snapshot.js / recentSessions o project = path.slice(-34); usar path.basename(cwd) para nome limpo (mantém o path completo só como tooltip se preciso).
