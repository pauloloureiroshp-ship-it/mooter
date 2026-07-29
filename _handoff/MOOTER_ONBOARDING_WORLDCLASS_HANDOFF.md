# ⇄ COWORK → COWORK (Fable 5) · MOOTER ONBOARDING WORLD-CLASS — handoff de design

> Origem: sessão Cowork 2026-07-16 (ciclo remediação F1–F3 + tese afiada). Autor: Cowork/Fable 5.
> Consumidor: NOVA conversa Cowork com Fable 5, dedicada a onboarding/setup do plugin.
> Casa: `_handoff/` do repo frugal. Tipo: MASTERPROMPT (design, zero código nesta conversa).

🎯 GOAL   Desenhar o onboarding/setup do plugin VS Code do Mooter como A melhor experiência do
          mercado: o vibe coder importa o cérebro que já tem (Claude/Codex/Gemini/local/vault/Notion),
          o Mooter detecta+prova em vez de pedir formulário, e sai operando como o Paulo opera hoje —
          sem YouTube, sem estudar. Output: spec viva + masterprompt executável + 1 decisão de conector.
📍 BOOT   Ler NESTA ordem (tudo existe): vault `40-strategy/mooter-agentic-os-playbook` §1+§8 ·
          vault `40-strategy/mooter-prioridades-2026-07-16` · repo `_handoff/MOO_HARMONY_MESH_BLUEPRINT.md`
          (§1.5–1.9 dial/executores/skills/MissionControl · §7 LoRA) · `_handoff/SETUP_RADAR_MASTERPROMPT.md`
          (a base — NÃO recriar, estender) · `_handoff/MOOTER_20_TRUST_RELEASE_MASTERPROMPT.md` (H1 cut) ·
          `_handoff/MOO_LINGUA_FRANCA_MASTERPROMPT.md` (P4 front-matter, P5 CCA, P6 council) ·
          `docs/strategy/SETUP_MAPPING.md` (probe→payload→surface já mapeado).
🔒 GUARD  Design-only: ZERO código, zero colisão com Codex (F1–F3, lingua-franca) e CC (Trust Release
          H0–H4). Honest-copy (nada de "destruir Cursor" em copy — posicionamento = custo afundado).
          ♻️ REUSE gate por peça. Council P6 + CCA nos handoffs. Toda claim de mercado = web do dia.
✅ GATE   3 entregáveis + 2 ⛔ STOPs (abaixo). Régua: "teste do amigo" — instala e opera em <10min.

---

## 1. A REFERÊNCIA — Roo Code settings (screenshots do Paulo, 2026-07-16, v3.54.0)

O Paulo mapeou as ~17 abas de settings do Roo Code como benchmark de "opções de operação". Superfícies
observadas: **Providers** (config profiles nomeados; provider+API key+modelo com context window/preço/
caching visíveis; sliders max tokens/thinking) · **Modes** (personas com role definition, when-to-use,
tools permitidas, instruções por modo, API config POR MODO) · **Skills** (global vs workspace, add,
disponibilidade por modo) · **Slash Commands** (global/workspace) · **Auto-Approve** (granular:
Read/Write/MCP/Mode/Subtasks/Execute/Question + Max Count + Max Cost $) · **MCP Servers** (global/
project) · **Checkpoints** (automáticos + timeout) · **Notifications** (TTS/sons) · **Context** (limites
de tabs/ficheiros/git-status, subfolder AGENTS.md, diagnósticos) · **Terminal** · **Prompts** (enhance
prompt com preview) · **Worktrees** (lista+criar+abrir janela por worktree) · **UI** · **Experimental**
(background editing, model-initiated slash, custom tools) · **Language** · **About** (export/import/reset).

**O que ROUBAR (adaptado ao Mooter):** config profiles → perfis por ENGINE com o effort dial (LazyMoo/
Moo/CrazyMoo + tetos por assinatura) · Auto-Approve granular com Max Cost → nossa versão é MELHOR:
recibos + reversibilidade + gates por classe (nunca blanket) · Checkpoints → é o Time Machine (medo nº1) ·
Context sliders → token-warden com budget visível · **Export/Import settings → chave do teste do amigo**
(portabilidade de setup inteiro) · Worktrees panel → já temos backend (waves/conductor), falta surface ·
Enhance Prompt → `moo-masterprompt` skill rodando LOCAL $0 (L1) — Roo cobra API por isso.

**O que REJEITAR:** 17 abas = a poluição que o H1 corta (~60%) · personas free-text (Mooter usa protocolo
tipado, não prosa por modo) · configuração como produto. **A tese do onboarding Mooter em 1 frase:
Roo Code é um FORMULÁRIO que o usuário preenche; o Mooter é um RADAR que detecta, um WIZARD que corrige
com 1 clique, e uma PROVA de que funcionou (N1–N4 com evidência real, nunca check verde de fé).**

## 2. OS REQUISITOS DO PAULO (consolidados — nenhum pode se perder)

R1. Setup espelha TUDO que gera a magia do Paulo hoje: estrutura de agentes, paths (vault Obsidian,
    Notion, MD files), plugins, connectors, skills — vira produto configurável/detectável.
R2. Plugin espelha tudo que o backend já oferece (21 skills, 9 packs, MEO, fleet, router, Ledger).
R3. Onboarding seamless de LLMs: subscriptions (Anthropic/OpenAI/Google) + local (Ollama) — detectar
    keys/subs/modelos, nunca formulário cego (probe do `init.ts` 32KB já existe).
R4. **Prompts copy-paste como ponte:** o plugin GERA o prompt que o usuário cola no Cowork/Claude dele;
    a resposta (JSON estruturado: paths, stack, connectors, projetos) é colada de volta e o plugin
    importa — "export do cérebro" em 1 ida-e-volta, estilo importar projeto.
R5. **Importar projetos existentes** de Claude (CLAUDE.md, ~/.claude), Codex (AGENTS.md chain,
    ~/.codex), Gemini (GEMINI.md), local LLMs → `mooter import` mapeia tudo que o Mooter precisa e
    scaffolda a fundação (AGENTS/SYNC/MEMORY/LOOP/_handoff/templates) com diff antes de escrever.
R6. GPU como turbo seamless (mesh + dial + auto-yield — blueprint §1.5–1.6) configurada no onboarding
    conforme o hardware detectado (4090 = tudo; sem GPU = L0 via cron; teste do amigo cobre).
R7. Todo botão do plugin operado por skill (interna certificada ou pública via reuse-indexer).
R8. Advogado do diabo como FEATURE: council P6 (8 perguntas + anti-sycophancy) rodando nos prompts do
    usuário — o produto pergunta o que o usuário esqueceu, antes do retrabalho.
R9. **Waves auto-mapeadas**: parser lê `_handoff/` + vault + Notion → alimenta a aba Waves do Cockpit
    (o front-matter P4 da Lingua Franca é o enabler — sem parse de prosa).
R10. Local LLM faz o heavy-lifting com track perfeito ligado ao MEO (visibilidade de tudo que roda).
R11. Quantização (AWQ, W11 do roadmap) + LoRA/DoRA (blueprint §7) = Moo Effort mais eficiente —
     registrar como dependência técnica do dial, não construir agora.
R12. Validar concorrentes/inspiração na web DO DIA (Cursor onboarding, Lovable, Roo/Cline/Continue,
     VS Code walkthroughs nativos) antes de fechar a spec.

## 3. ⭐ A DECISÃO IMPORTANTE — conector Claude ↔ Mooter (pré-análise desta sessão)

Pergunta do Paulo: em vez de todo esse handoff manual entre LLMs/projetos, criar um CONECTOR do Claude
falando seamless com o Mooter? **Pré-análise honesta: SIM, e ~70% já existe.** O Mooter TEM um MCP
server com ~20 tools `mooter_*` (auditoria B4 contou; Wave 30+ shipou EARLY). O que falta é empacotá-lo
como conector do Claude Desktop/Cowork: (a) definir a superfície mínima de tools para o caso de uso
handoff (sugestão: `mooter_status` · `mooter_radar` · `mooter_handoff_read/write` · `mooter_waves` ·
`mooter_import_state` · `mooter_receipts`); (b) transporte local-only + auth (privacidade: nada sai da
máquina); (c) instalação 1-clique — VERIFICAR NA WEB (fast-moving): bundles de extensão desktop p/
MCP local no Claude Desktop (formato .mcpb/.dxt) e o que o Cowork suporta hoje. Efeito: o R4 (prompt
copy-paste) vira fallback para quem não tem o conector — com ele, o Cowork lê/escreve no Mooter direto,
zero fricção. ⚠️ Nota de memória: o estudo Slack→plugin concluiu que MCP era dead-end PARA O PLUGIN
(Node puro, sem LLM) — o caso aqui é o INVERSO (Cowork/Claude é quem chama), então o precedente não se
aplica; não confundir. ⛔ STOP: decisão do Paulo sobre a superfície de tools + prioridade vs Setup Radar.

## 4. ENTREGÁVEIS desta conversa (e só estes)

| # | Entregável | Formato | Gate |
|---|---|---|---|
| E1 | `docs/strategy/MOOTER_ONBOARDING_SPEC.md` (spec viva): jornada import→detect→scaffold→prove→operate, telas (wireframe textual), mapa R1–R12 → onde cada um aterra, settings-alvo (≤6 superfícies, não 17) | spec | ⛔ STOP revisão Paulo |
| E2 | Masterprompt executável da wave (pós-Setup Radar MVP), com allowlist, ♻️ reuse respondido, fases e testes | masterprompt | junto do STOP E1 |
| E3 | Decisão do conector (§3): superfície de tools + go/no-go + onde encaixa na fila | decision note | ⛔ STOP Paulo |

**Sequência na fila mestre (não furar):** este design alimenta Setup Radar (P2-11) + H1 cut do Cockpit —
roda em paralelo como DESIGN; implementação só entra depois de Mesh fase A, salvo decisão do Paulo.

## 5. Verdades desta sessão que a conversa nova precisa herdar (para não regredir)

Posicionamento = **maximização de custo afundado** (assinaturas pagas + GPU rendendo o teto) — nunca
"mais barato que todos" (Cursor $20/500 requests e Lovable $25/créditos queimam consumo; nós não
vendemos consumo). · Moos locais: transforms bounded SIM, agentic <30B NUNCA (verificado). · Effort
dial 3 personas + auto-yield + recibo (nunca 5 níveis). · Tudo que o produto DIZ tem que ser provado
(Trust Release; gate humano = 5 amigos <10min). · Council/CCA nos handoffs. · O roadmap tem 3 taxonomias
colidindo (F4 unifica) — esta conversa NÃO cria a 4ª: nomeia tudo dentro do Setup Radar/Onboarding.
