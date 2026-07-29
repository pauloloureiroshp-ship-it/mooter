# ⇄ COWORK → CC · SETUP RADAR + WIZARD — a cabine de setup do vibe coder

> Autor: Cowork · 2026-07-15 · Aprovado por Paulo (decisões: tese nova = régua oficial; masterprompt agora).
> Origem: confronto Agentic OS (Chase AI via Gemini) × repo 2026-07-15 + inputs do Paulo (12 campos).
> Casa deste ficheiro: `_handoff/` — ao shipar, arquivar em `_handoff/_archive/2026-07/` no mesmo PR (AGENTS.md § IA).

🎯 GOAL   O vibe coder configura e pilota o agentic OS multi-LLM + GPU inteiro pelo plugin, sem terminal e sem
          estudar: Radar mostra onde estão as estruturas e os gaps; Wizard corrige com 1 clique, com prova.
📍 WHERE  worktree ../frugal-setup-radar · branch feat/setup-radar · from origin/main (fetch antes; main local é STALE)
▶  DO     Fases 0-5 abaixo, em ordem. Fase 0 é gate humano. Fases 1-2 podem correr antes do F0 NÃO MENTIR
          fechar (read-only/aditivas). Fases 3-5 SÓ depois do F0 — Radar em cima de dados que mentem = anti-produto.
🔒 GUARD  classify.js frozen (sha CI) · packages/* waves 28-34.5 frozen (plugin NÃO é frozen; ficheiros novos em
          packages/vscode-extension/src/ ok) · git add seletivo · no push/merge sem OK do Paulo · no new root .md ·
          WIP 3-5 sessões · NUNCA check verde sem prova real.
✅ GATE   por fase (abaixo) + gate final = TESTE DO AMIGO: instala em minutos, conecta as contas que já paga,
          sai com Radar ≥ N1-N2 verdes, volta no dia seguinte sem reconstruir nada.
⏭  NEXT   depois disto: F1 Resume (Morning Brief) consome o mesmo setup-state.
📋 BACK   por fase: diff resumido + saída dos testes + screenshot da view + nº de checks com prova vs. total.

---

## A tese (contexto para quem executa — é a régua)

O Mooter existe para o vibe coder **ganhar tempo operando como um mestre sem estudar todos os dias**: melhores
práticas aplicadas automaticamente, **visibilidade total** do projeto e dos agentes, **alertas de gaps de fundação**,
e a magia visível (Live Preview) — tudo pilotado do plugin VS Code (futuramente Antigravity). Por baixo, o motor:
roteamento determinístico local-first ($0, <50ms) sobre **multi-subscriptions (Anthropic/OpenAI/Google) + a GPU do
próprio usuário**. O motor é o fosso; a cabine é o produto. Régua de wave: só entra o que melhorar uma das 5
experiências — Resume · Plan · Route (invisível) · Watch · Review.

---

## FASE 0 — PR da régua (Peça #1 · gate humano · fazer PRIMEIRO)

Trocar a tese escrita nos 2 pontos que todo agente lê. Diffs propostos (Paulo revisa a redação antes do commit):

**0a. `AGENTS.md` — substituir o bloco "## Project overview" (l.6-12) por:**

```md
## Project overview

**Mooter** (mooter.ai, MIT) exists so a vibe coder can operate like a master without studying
every day: it sets up, watches, and pilots a real multi-agent project from inside VS Code with
total visibility — alerting foundation gaps (skills, memory, loops, file structure), applying
vibe-coding best practices automatically, and making the magic visible (Live Preview).
Under the hood, the engine and moat: a deterministic local-first router (<50ms, $0 to classify)
that orchestrates multiple LLM subscriptions (Anthropic, OpenAI, Google) plus the user's own
GPU (Ollama), routing every prompt to the minimum viable tier and learning forever from local
telemetry — never proxying prompts, never fabricating metrics. The engine is the moat; the
cockpit is the product. A change earns its place by improving one of five experiences:
**Resume · Plan · Route (invisible) · Watch · Review**.
Mission: **"Your LLM router. Local-first. Learns forever."**
```

(Slogan da mission mantido — é marca; mudar slogan é decisão separada do Paulo.)

**0b. `docs/strategy/MOOTER_ROADMAP.md` — substituir "## A tese (a régua de toda a wave)" (l.8-11) por:**

```md
## A tese (a régua de toda a wave)
O Mooter existe para o vibe coder ganhar tempo operando como um mestre sem estudar todos os dias:
melhores práticas automáticas, visibilidade total, alertas de gaps de fundação, e a magia visível —
pilotado do plugin VS Code. Por baixo, o motor-fosso: roteamento determinístico local-first ($0,
<50ms) sobre multi-subscriptions + GPU do usuário. **Uma wave só entra se melhorar uma das 5
experiências: Resume · Plan · Route (invisível) · Watch · Review.** "$0 primeiro" continua como
princípio de execução (como trabalhar), não como tese (porquê existir). Prova > promessa.
```

**Gate 0:** Paulo aprova redação → commit dos 2 ficheiros → só então Fases 3-5 podem shipar.

---

## FASE 1 — Recon read-only (pode correr JÁ, paralela a tudo)

1. Confirmar no nativo: `cd packages/vscode-extension && npm test` (baseline real de testes do plugin).
2. Inventariar o que `doctor-checks.js` já cobre vs. a matriz de checks da Fase 3 (tabela abaixo) — output:
   tabela check→existe/falta.
3. Mapear onde `init.ts` (probe), `env-detect.ts`, `ecosystem.ts`, `local-models.ts` expõem cada campo do
   schema da Fase 2 (função + shape do retorno).
4. Confirmar mecanismo headless disponível para "Corrigir" (spawn-orchestrator vs sdk-runner vs exec direto
   do CLI `mooter`) e escolher UM padrão.

**Gate 1:** tabela de reuso completa; zero código escrito.

---

## FASE 2 — Data layer: `setup-state.json` (o schema dos 12 inputs do Paulo)

Um único artefato local (`~/.mooter/setup-state.json`), escrito por `mooter setup probe` (novo comando fino
que ORQUESTRA probes existentes — não reimplementar), lido pelo plugin. Cada campo carrega `{value, source,
verified_at, proof}` — sem proof, o campo é `unverified`, nunca "verde".

| # | Campo (input do Paulo) | Probe (reuso) | Prova de verificação |
|---|---|---|---|
| 1 | `workspace.path` — pasta trabalhada | plugin `_wsRoot()` (já funciona) | pasta existe + é git repo |
| 2 | `vault.path` — Obsidian/graph | `VAULT_PATH` env → fallback pergunta no wizard | `retrieve.js` responde em <100ms |
| 3 | `github.remote` — repo/origem | `git remote -v` no workspace | fetch dry-run ok |
| 4 | `prod.url` — site/app em produção | `INFRA.md` parse → fallback wizard; futuro: vercel/wrangler config | HTTP 200 no URL |
| 5 | `notion.workspace` | wizard input (token/URL) | ping API ok (é o fix do chip morto — reusar sync-collector) |
| 6 | `accounts.anthropic` | `init.ts` probe (já existe: key + subscription) | como no init |
| 7 | `accounts.openai` (Codex) | `init.ts` probe (já existe) | como no init |
| 8 | `accounts.google` (Gemini) | `init.ts` probe (já existe, B.2c) | como no init |
| 9 | `connectors[]` — ativos | novo probe fino: MCP servers em `.mcp.json` + `~/.claude/settings` | handshake stdio ok |
| 10 | `skills[]` — ativas · pendentes · LLM executor | listar `.claude/skills/` + packs instalados; **pendentes = Pastor/sessions-orchestrator propõe dos padrões reais**; executor = classify/matrix por skill | skill roda dry-run; proposta cita nº de sessões-fonte |
| 11 | `loops[]` — ativos · pendentes · LLM executor | pm2 list + scheduled tasks + fleet.json; pendentes = template (backtest, digest, eval) | heartbeat <2× intervalo |
| 12 | `structure.health` — arquivos organizados? | **construir `tools/docs-hygiene.js`** (já planejado no SYNC 07-07): valida AGENTS.md § IA (masterprompts em _handoff, sem .md novo na raiz, SYNC ≤200 linhas, index.md nas pastas-chave) | relatório com contagens reais |

Extras já probados que o Radar mostra de graça: hardware/GPU/VRAM/hw_tier + modelos Ollama (init probe —
resolve também o gap "VRAM stored never rendered" do SETUP_MAPPING.md).

**Gate 2:** `mooter setup probe` roda no teu setup real e produz setup-state.json com ≥10/12 campos
preenchidos-com-prova ou explicitamente `unverified` (nunca inventado). Testes node:test para o merge/shape.

---

## FASE 3 — Radar (a view "onde estão as estruturas e onde estão os gaps")

View nova no Cockpit (ou secção topo da futura aba Settings/F3 — decidir na hora pelo estado do W15).
**4 anéis = os 4 níveis de maturidade agêntica** (eixo de PRODUTO; os 5 pilares seguem sendo o eixo de
engenharia do roadmap — não misturar taxonomias na UI interna de dev):

| Anel | Nome no produto | Checks (do setup-state) |
|---|---|---|
| N1 | Backbone — skills & domínios | skills ativas ≥1 · packs por domínio do projeto · ≥1 skill usada em 7d (Ledger) |
| N2 | Memória — o projeto lembra | CLAUDE.md/AGENTS.md presentes · MEMORY/LOOP/SYNC saudáveis (sem lixo, mtime <7d) · index.md pastas-chave · vault conectado |
| N3 | Ação — botões & loops | Ollama up + modelo · loops ativos c/ heartbeat · ≥1 rotina executável por botão · contas cloud válidas |
| N4 | Time — distribuição | hub sync · dashboard web · pack exportável p/ equipe |

Regras de UI (as queixas do Paulo viram spec):
- **Cada check: verde-com-prova / vermelho-com-Corrigir / cinza-unverified.** Tooltip mostra a prova (comando + timestamp). Proibido verde hardcoded — teste unitário garante que todo estado verde referencia um `proof`.
- **Botão "Corrigir"** dispara rotina headless (padrão escolhido na Fase 1) e re-proba ao fim — o padrão
  visibilidade/ação do dashboard do vídeo (min 23:40), sem terminal.
- **Alertas por exceção**: só o gap mais importante vira notificação; o resto vive no Radar (sem poluir — lição W15).

**Gate 3:** rodando no setup real do Paulo, o Radar mostra HOJE (estado honesto esperado): ⚠️ Notion,
⚠️ memória (SYNC), ❌ índices, ❌ N4 — e cada um com Corrigir funcional ou "requer humano" explícito.
+≥20 testes novos no plugin (baixar a dívida dos 8).

---

## FASE 4 — Wizard (setup limpo em 5 telas, zero terminal)

1. **Detecção** — roda probe headless; cards: hardware/GPU/VRAM, Ollama+modelos, contas detectadas. (reuso: init probe + SETUP_MAPPING payload)
2. **Conexões** — os campos que probe não acha sozinho: vault, prod URL, Notion, GitHub remote se ausente. Cada um valida na hora (prova) antes de aceitar.
3. **Domínios & Skills** — "que tipo de trabalho fazes neste projeto?" → packs sugeridos; Pastor lê sessões
   existentes (read-only) e propõe 2-3 skills personalizadas citando os padrões que achou; mostra qual LLM/tier
   executa cada uma (matrix). Sem histórico → 3 perguntas de texto.
4. **Memória & Estrutura** — gera CLAUDE.md/AGENTS.md de template se faltarem · cria index.md nas pastas-chave
   (`mooter digest --write-indexes`, flag nova) · roda docs-hygiene e oferece correções.
5. **Prova final** — executa 1 rotina e2e de verdade e mostra o recibo: o que rodou, onde (local $0 vs cloud),
   tempo, resultado. Só declara "setup completo" com recibo verde. Termina abrindo o Radar.

**Gate 4:** TESTE DO AMIGO cronometrado (o gate F5 do god mode aplicado aqui): pessoa não-técnica, máquina
limpa, ≤15min até Radar N1-N2 verdes, sem abrir terminal, sem vídeo.

---

## FASE 5 — Gaps contínuos (o Radar não é evento, é guarda)

- docs-hygiene como check recorrente (warn no Radar; CI gate depois — já planejado no SYNC 07-07).
- Skill/loop "pendente" reaparece quando o Pastor detecta padrão novo ≥N sessões.
- Índices stale (pasta mudou, index.md não) → check amarelo + Corrigir.

**Gate 5:** 1 semana de dogfood no setup do Paulo sem falso-verde reportado.

---

## O que NÃO fazer (delete-bias)

❌ Reimplementar probes que o init/doctor já têm — a Fase 1 existe para impedir isto.
❌ Radar antes do F0 NÃO MENTIR fechar (Fases 3-5 esperam; 0-2 andam já).
❌ Nova taxonomia no roadmap — 4 níveis é linguagem de PRODUTO/usuário; a régua de wave são as 5 experiências.
❌ Copiar /raw /wiki /outputs literal do vídeo — a estrutura do repo já tem regra própria (AGENTS.md § IA).
❌ Competir com a Agents window da Microsoft em orquestração visual — o Radar/Wizard é o que ela não faz
   (setup multi-LLM + GPU local + fundação de agentic OS) e reforça os fossos 1 e 4.

## Riscos conhecidos (herdados, não criados aqui)

- Árvore compartilhada suja (412 dirty) — worktree dedicada obrigatória, stage seletivo.
- Plugin com 8 testes — cada fase acrescenta testes; Fase 3 tem quota explícita.
- SYNC.md 🟡 desde 10/07 (spine packet pendente) — este masterprompt NÃO substitui nem reordena o spine;
  Paulo decide a ordem entre os dois na próxima sessão CC.
