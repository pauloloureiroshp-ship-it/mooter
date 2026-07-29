---
name: mooter-agentic-os-playbook
title: Mooter — Agentic OS Playbook (operacional + estratégico, fonte durável)
type: strategy
tags: [mooter, agentic-os, operacional, roadmap, playbook]
updated: 2026-07-15
canonical: true
lê-me-primeiro: true
---

# 🐮 Mooter — Agentic OS Playbook

> **Propósito deste ficheiro:** ser a fonte durável que evita ir-e-voltar operacional. Qualquer sessão
> (Cowork, Claude Code, Codex) lê isto primeiro e continua sem re-derivar contexto. Vive no vault (fonte de
> verdade cross-projeto). Espelho de memória: Cowork `project_mooter_*`. Estado técnico do dia: repo `SYNC.md`.

---

## 1. O OBJETIVO (a régua de tudo — decore antes de qualquer decisão)

O Mooter existe para o **vibe coder operar como um mestre sem estudar todos os dias**: melhores práticas
aplicadas automaticamente, **visibilidade total** do projeto e dos agentes, **alertas de gaps de fundação**
(skills, memória, loops, estrutura de ficheiros), e a **magia visível** (Live Preview) — tudo pilotado do
**plugin VS Code** (futuramente Antigravity). Por baixo, o motor-fosso: **roteamento determinístico
local-first ($0, <50ms)** sobre **multi-subscriptions (Anthropic/OpenAI/Google) + a GPU do próprio usuário**.

**O motor é o fosso; a cabine é o produto.** Uma mudança só entra se melhorar uma das **5 experiências**:
**Resume · Plan · Route (invisível) · Watch · Review**.

**Doutrina da GPU-turbo:** todo token que um modelo local produz sem erro é um token que **não cobra, não
espera, e não gasta quota** da assinatura. ~70% da metodologia (specs, índices, resumos, compressão, triage)
é tarefa que um 3-8B local faz sem erro. O turbo é uma malha por baixo de TUDO: prompt, loop, schedule,
handoff, skill.

**Frase-produto:** *o Mooter não te ensina as melhores práticas — torna impossível não segui-las, sem dar bronca.*

**Eixos (não confundir):** 4 níveis de maturidade agêntica (Backbone · Memória · Interface · Distribuição)
= linguagem de **PRODUTO** (o que o usuário vê). 5 pilares = régua de **ENGENHARIA** (o que prioriza a wave).

---

## 2. OS 3 MEDOS QUE O PRODUTO MATA (a fundação de verdade)

| Medo | Antídoto | Peça |
|---|---|---|
| Irreversibilidade ("e se o agente estragar?") | desfazer mais fácil que fazer | **Time Machine** (checkpoint por ação + timeline + undo 1 clique) |
| Cegueira ("o que rolou enquanto eu não olhava?") | Resume/Morning Brief 60s | **F1 Resume** (pré-cozido pela GPU $0) |
| Custo invisível ("quanto vai me custar?") | recibo por ação | **Turbo Gauge** + recibos em tudo |

Peças de produto aprovadas em conceito (sem wave marcada): **Time Machine · Spec Rail** (mini-spec → local
expande $0 → cloud valida → tasks com gate de teste) · **Turbo Gauge** ("tua GPU pagou X% da assinatura").
**Wow só quando é prova** (roteamento visível once, timeline, gauge, radar acendendo, Live Preview/cinema).
❌ confete/gamificação.

---

## 3. METODOLOGIA OPERACIONAL (como trabalhamos — para não re-explicar)

**Papéis:** Cowork = arquiteto/red-team/memória · Claude Code = executor (worktrees, merges) · Codex =
implementador paralelo (worktrees próprios, draft PRs, nunca merge) · moos locais = mão-de-obra $0 · Paulo =
autoriza todo irreversível (push/merge/delete/rename).

**Onde rodar cada coisa (aprendido na marra 2026-07-15):**
- **Leitura/diagnóstico de git:** `device_bash` no VM Linux (frugal montado) — rápido, seguro, no object DB.
  ⚠️ Loop sobre muitas branches estoura timeout 45s → comandos únicos/lotes. `git worktree list` via mount
  marca "prunable" FALSO (Linux não vê paths C:\). `git status` sobre repo muito sujo pode travar e deixar
  `index.lock` preso.
- **Git irreversível (push/delete/rename/worktree-remove):** SÓ **nativo no Windows**, sessões fechadas,
  gate do Paulo. NUNCA pelo mount (o bridge bloqueia rm/unlink; sem rede para push; escrita concorrente já
  corrompeu o .git 2×). NUNCA por computer-use (terminal fica mascarado/só-clique = cego).
- **Execução autônoma plena:** só se a tarefa Cowork rodar **"No seu computador"** (app desktop, seletor
  "Run this task"), onde o shell é nativo = git+rede+apagar+observável. Na nuvem, o limite é real: nenhum
  canal reúne acesso-local + rede + escrita-plena + observabilidade ao mesmo tempo.

**Doutrinas invioláveis:** classify.js FROZEN (sha `427d8c0b…`) · git add seletivo (nunca -A) · honest-copy
(zero número inventado; prova-ou-cinza) · nada se apaga sem tag/backup · 1 sessão CC por worktree · WIP 3-5.

---

## 4. SEQUÊNCIA-MESTRA (consolidar → agentic OS · nada se perde)

> Detalhe copy-paste: repo `_handoff/CONSOLIDATION_MASTER_SEQUENCE.md`. Ordem inegociável:

1. **PASSO -1** · remover `index.lock` stale (nativo, git idle).
2. **PASSO 0 · INSURANCE** · tag em cada branch (`insurance-tag-all.ps1`) = garantia matemática nada-se-perde.
3. **PASSO 1 · FOUNDATION RESET** (`FOUNDATION_RESET_MASTERPROMPT_V2_1.md`): F1 snapshot → **F1.5 régua** (worktree
   `frugal-regua`, aplica textos da FASE 0 do SETUP_RADAR) → F2 spine → F3 triagem → F4 lixo → F5 archive+tag
   (os 47 unpushed) → F6 worktrees ≤5 → F7 guardrails. **Isto É a consolidação lossless** (não há atalho).
4. **PASSO 2 · GREAT RENAME** (`GREAT_RENAME_MASTERPROMPT.md`, gate F4+F6): `frugal` → **pasta única `mooter`**
   + worktrees em `mooter\worktrees\`; atualiza tasks/pm2/paths; resolve nome do worktree-conductor.
5. **PASSO 3 · AGENTIC OS** (`CODEX_AGENTIC_OS_RUN_MASTERPROMPT.md`): C0 recon → C1 testes plugin 8→≥60 →
   C2 docs-hygiene+índices → C3 `setup probe`/setup-state (12 inputs + turbo) → C4 Radar read-only (verde só
   com prova) → C5 Turbo Gauge → C6 Wizard mínimo (primeiro valor ≤3min). C7 PARKED (Morning Brief/Time
   Machine/Spec Rail/botões Corrigir) até o spine B-F/North Star F0 fechar.
6. **Mercado:** perfeito p/ Paulo → amigos (teste F0.5, máquina SEM GPU) → clientes.

---

## 5. ESTADO MEDIDO (2026-07-15, na máquina) + DECISÕES

**Repo:** classify.js FROZEN ✅ · 15 pastas (1+14 worktrees) · 455 sujos · 185 branches · remote
github.com/pauloloureiroshp-ship-it/mooter. **47 commits unpushed em 18 branches antigas** (única coisa
perdível; F5 cobre com tag). Branches ativas 0 unpushed. `wave/lp-producao-perfeita` (ex-frugal-final "19
commits") JÁ pushed. `backup/tree-snapshot-2026-07-14` existe (F1 começou). `chore/tese-v2` tem commits.
⚠️ `index.lock` stale pendente de remoção (PASSO -1). Régua escrita ainda antiga em AGENTS.md/roadmap até o PR da F1.5.

**Decisões tomadas (Paulo):** tese nova = régua oficial · 4 níveis = produto / 5 pilares = engenharia ·
consolidar numa pasta ANTES do agentic OS · insurance-first · Great Rename gate F4+F6.

**Decisões pendentes (Paulo):** arbiter Haiku OFF no build do amigo? · keep-list ≤6 da F5 (candidatos #233
quota, #229 eval, #225 moo-loop, #244 MEO, spine PR, flicker PR) · nome do worktree-conductor (colisão MS
"Conductor"; proposta herd-conductor) · **conectar o vault ao Cowork** (Add folder — destrava este playbook
ser mantido e lido pelo 3rd-brain em sessões CC).

---

## 6. RISCOS FRIOS (advogado do diabo, do MASTER_ANALYSIS 14/07)
- Custo (65-82% vs all-Opus, medido) **erode** — é wedge, não moat. Investir migra p/ Resume (tempo, não erode).
- "Learns forever" nunca provado (bench OOD DOMINATED) → só liga default-on com A/B datado.
- 18 packages = manutenção de 10 pessoas p/ empresa de 1 → cada órgão ganha status `core|frozen|parked`.
- Acoplado à 4090 → teste do amigo em máquina SEM GPU (mata a suposição).
- Resume depende do Ledger (5 gates P1 abertos) → spine ANTES de qualquer demo de Resume (inegociável).
- Privacidade: arbiter Haiku vs "nunca sai da máquina" → wave PRIVACY antes de distribuir.

---

## 7. ONDE VIVE O QUÊ (pointers — não duplicar)
Objetivo/produto/roadmap: **este ficheiro** (vault) · estado técnico do dia: repo `SYNC.md` · masterprompts
executáveis: repo `_handoff/*` · decisões de arquitetura: repo `MEMORY.md` · régua tool-agnostic: `AGENTS.md`.
Memórias Cowork relacionadas: [[mooter-agentic-os-setup-radar]] · [[mooter-plugin-roadmap-god-mode]] ·
[[mooter-frugal-folders-validation]] · [[mooter-advogado-diabo-confronto-teses]].

---

## 8. MARCO 2026-07-16 — a tese afiada: Harmony Mesh, effort dial e custo afundado

**O motor ganhou nome preciso: maximização de custo afundado.** Router preço×tier virou commodity
(OpenRouter etc. = proxies com markup, que NÃO usam as assinaturas nem a GPU do usuário). O fosso real:
as assinaturas que o usuário JÁ paga + a GPU que JÁ comprou, rendendo o teto, 24/7, hook-não-proxy,
custo marginal $0. Nenhum player cloud copia — o negócio deles é vender mais tokens, não fazer os teus
renderem mais. "Mooter = além de router, a forma mais inteligente de usar a GPU sem parar para
impulsionar qualquer projeto de vibe coding" (Paulo, sentido na pele, validado contra mercado).

**Dial de effort por engine** — a metáfora que o usuário já conhece dos subscription LLMs: cada engine
paga ganha um dial (Anthropic/OpenAI/Google = teto de tier/spend · GPU = intensidade da malha,
LazyMoo/Moo/CrazyMoo). Auto-yield: a malha cede a GPU sozinha a jogo/vídeo (gpu-stream já amostra 15s);
`/moo effort` e `/moo pause 2h` são override manual, não regra. Recibo em toda troca ("liberando ~14GB ·
6 jobs adiados"). ❌ Não criar escala light/medium/high paralela — as 3 personas são marca.

**Harmony Mesh** — GPU 24/7 em 3 camadas honestas: L0 determinístico (substância — 100%), L1 qwen3:30b
(julgamento single-shot bounded), L2 3B (guarnição, nunca load-bearing). 10 jobs, cada um prevenindo
falha REAL do ciclo F1–F3 (FC-1..FC-8: pointer-sentinel pegaria o vault morto; orphan-watch, o
PHASE_A_GATE 6 dias invisível). Moos EXECUTORES de transforms bounded (draft LOOP, digest, index) —
NUNCA agentic <30B (verificado mercado: <7B falha sempre em tool-calling), NUNCA escrita canônica
direta (draft `moo-draft` + Ledger; reducer materializa — single-writer por construção).

**Skills públicas certificadas** — Agent Skills = padrão aberto (anthropics/skills, marketplaces).
Moo skill pack só entra com score MooterBench medido no modelo local (3B/30B) com fixtures reais.
Honest-copy aplicada a skills; alimenta a specialization-matrix. Diferencial que ninguém faz.

**Moo Mission Control** (plugin) — telemetria em tempo real recibos-first: Agora · Recibos (centro) ·
Pilotagem (dial/pause/toggles/fila de moo-drafts 1 clique) · Skills locais (scores). Regra anti-vanity:
painel que não muda decisão do usuário não entra.

**Sequência:** F1–F3 remediação (em curso, Codex) → Lingua Franca (protocolo: 4 tipos de mensagem
tipada + budgets + templates + ♻️ reuse gate) → Mesh fase A (4 checkers L0) → fases B/C (L1 +
auto-setup `mooter init --auto`) → Setup Radar (a UI que projeta tudo).

**Fontes executáveis no repo:** `_handoff/MOO_HARMONY_MESH_BLUEPRINT.md` (§1.5–1.9) ·
`_handoff/MOO_LINGUA_FRANCA_MASTERPROMPT.md` · decisão detalhada:
vault 20-decisions/mooter-harmony-mesh-effort-dial-2026-07-16.
