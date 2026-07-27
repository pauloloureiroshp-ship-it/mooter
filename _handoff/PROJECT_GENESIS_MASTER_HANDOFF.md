# ⇄ COWORK → COWORK (Fable 5) · PROJECT GENESIS — o onboarding do Mooter como produto

> Cowork · 2026-07-17 · Budget ≤8k · Tipo: MASTERPROMPT · Consumidor: NOVA conversa Cowork/Fable 5.
> Casa: `_handoff/`. NÃO duplica `MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md` (a base R1–R12 + Roo Code
> ref + conector) — ESTENDE-o com o mecanismo central que o Paulo cristalizou: o **gerador de
> masterprompt por pilar**. Aquele handoff é o QUÊ; este é o COMO o usuário chega lá sem estudar.

🎯 GOAL   Desenhar "Project Genesis": a aba de setup do plugin VS Code que pega QUALQUER projeto de
          vibe coding (novo ou ongoing, Claude/Codex/Gemini/local) e o leva à MESMA experiência que
          o Paulo tem — gerando, por pilar, um masterprompt que o usuário cola no PRÓPRIO cérebro
          (Cowork/CC/Codex dele), cuja resposta volta e alimenta o Mooter. Import do cérebro, não
          formulário. Output: spec + wireframe + masterprompt executável + decisão de mecânica.
📍 BOOT   Ler: este doc · `_handoff/MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md` (a base — R1–R12) ·
          `_handoff/MOOTER_SKILLS_DISTILLATION_MASTERPROMPT.md` (as skills que cada botão usa) ·
          `_handoff/MOO_HARMONY_MESH_BLUEPRINT.md` §1.9 (Mission Control) + §2 (auto-setup 4 passos) ·
          `_handoff/SETUP_RADAR_MASTERPROMPT.md` (a base do Radar) · `docs/strategy/SETUP_MAPPING.md` ·
          vault `40-strategy/mooter-agentic-os-playbook` §1+§8 · `00-core/como-trabalhamos.md`.
🔒 GUARD  Design-only, zero código, zero colisão com executores em voo · agnóstico (funciona com
          Claude/Codex/Gemini/local — nunca hardcodar Claude) · honest-copy · REUSE gate por peça
          (o `mooter init` de 32KB já faz metade da detecção — ESTENDER) · council+CCA nos teus outputs.

## 0. ADVOGADO DO DIABO — 4 buracos que o design DEVE fechar (senão falha com o usuário-alvo)
Refinado 2026-07-17 após stress-test. A visão é certa; estes 4 furos matariam a experiência:

**H1 · Garbage-in (o mais grave).** A mecânica assume que o cérebro do usuário conhece o projeto
dele. O novo usuário tem um Cowork que NUNCA foi alimentado — responde palpite, não contexto.
→ **Regra:** todo masterprompt-por-pilar INSTRUI o cérebro a LER os ficheiros reais do projeto
(repo, configs, package.json, código) ANTES de responder. "Responde só do que leste; o que não
achares = n/d." Nunca responder de memória. O pilar é uma leitura guiada, não um quiz.

**H2 · Mais fricção que o Roo, não menos.** Roo configura tudo num painel. Copy-paste-para-fora-e-
-voltar é PIOR UX — a menos que o conector Claude↔Mooter seja o caminho-herói.
→ **Regra:** conector = caminho PRIMÁRIO seamless (o cérebro lê/escreve no Mooter direto); copy-paste
= FALLBACK universal (para quem não tem o conector). Nunca vender o paste como a experiência principal.

**H3 · Best practices de QUEM.** O que aprendemos foi num projeto TS/Node/router. Impor isso a um
projeto Rust/Go/mobile é conselho errado com cara de autoridade.
→ **Regra:** o contexto de best practices é STACK-AWARE (detecta a stack e adapta) ou explicitamente
genérico/principiológico. NUNCA "faz como o Mooter faz". O princípio viaja; a implementação não.

**H4 · O persona sem cérebro E sem ficheiros = greenfield (inclui o Paulo no próximo projeto).**
Projeto do zero não tem brain alimentado nem repo pra ler. O Genesis não pode só "importar".
→ **Regra:** DOIS caminhos explícitos — IMPORT (projeto ongoing: lê o que existe, pré-preenche,
usuário confirma) e COLD-START (greenfield: a entrevista GERA a fundação do zero, aí sim o cérebro
responde do conhecimento do usuário sobre o que QUER construir). O dogfood nº1 é o Paulo no próximo
projeto — se não serve para ele greenfield, não está pronto.

## 0.5 · A METODOLOGIA CERTA — value-first, não complete-the-form (revisão 2026-07-17, evidência)
O maior erro do design v2 era filosófico: "completa os 8 pilares → aí o Mooter funciona". Evidência de
mercado (web hoje): **setup-first é anti-padrão provado — 98% de churn em 2 semanas sem marco de valor;
90% de conclusão de onboarding COM churn no dia 2**, porque completar formulário ≠ entregar valor. A
régua vira:

**NORTE = time-to-first-value (TTFV), não "8/8 pilares".** O evento de ativação do Mooter = o primeiro
HANDOFF PERFEITO, o primeiro RECIBO da GPU, ou o primeiro MORNING BRIEF. O Genesis existe para levar o
usuário a UM desses o mais rápido possível — não para completar um checklist.

Consequências no design:
1. **Fundação MÍNIMA primeiro (2 pilares, não 8):** Identidade + Stack já bastam para gerar o primeiro
   handoff/recibo real. Os outros 6 enriquecem DEPOIS, com o produto já funcionando. Nunca bloquear
   valor atrás de setup completo.
2. **Pilares são um PIPELINE progressivo, não 8 formulários independentes:** a resposta do pilar N
   molda o prompt do pilar N+1 (o plugin segura o estado). Isso dá a adaptatividade do "interview mode"
   (a prática de ponta: perguntas que se ajustam à resposta anterior) mantendo o custo-zero do cérebro
   do usuário. Cada pilar completado DESBLOQUEIA valor imediato — não "termina tudo, aí funciona".
3. **O Genesis faz HANDOFF para o sistema em curso, não termina em "setup completo":** ele é um Ledger
   de eventos-genesis que projetam na fundação (reusa o nosso próprio padrão Ledger→projeção) e entrega
   ao BOARD/handoff/Mesh que já existem. Onboarding não é uma ilha; é a rampa para a operação diária.
4. **Detect-don't-ask + uma ação por vez (anti-Roo):** o Roo mostra 17 abas — o oposto do que funciona.
   O `mooter init` já detecta metade; o Genesis PERGUNTA só o que não conseguiu detectar, uma coisa de
   cada vez, com escape hatch (pular/deferir ao julgamento do Mooter).

## 1. O INSIGHT (verificado contra o mercado — é defensável)
Estado da arte 2026 (web hoje): "interview mode" (agente pergunta antes de gerar → spec melhor que
prompt one-shot) + AGENTS.md como padrão-aberto de contexto + spec-driven development. **A inversão
do Paulo:** em vez do Mooter entrevistar o USUÁRIO (que não conhece arquitetura de ponta), o plugin
gera a entrevista por pilar e ela é respondida pelo CÉREBRO do usuário (o Cowork dele, que já tem o
contexto do projeto). Máquina pergunta a quem sabe. Ninguém faz isso — é o "importar cérebro" como UX.

## 2. OS PILARES (o que o Mooter precisa saber para funcionar perfeito — 1 masterprompt cada)
Cada pilar = 1 botão na aba Genesis → gera 1 masterprompt → usuário cola no cérebro dele → resposta
tipada (JSON/frontmatter) volta → plugin importa → scaffolda. Confirmar/cortar a partir do repo real:
| Pilar | O masterprompt gerado pede ao cérebro do usuário | Alimenta |
|---|---|---|
| 🧠 Identidade | missão do projeto, quem é o brain, tese, voz | AGENTS.md · CLAUDE.md |
| 🏗️ Stack & Arquitetura | langs, frameworks, deploy, serviços, invariantes | AGENTS.md · INFRA.md · SYSTEM_DESIGN |
| 🗂️ Memória & ficheiros | onde vive o quê (vault/Notion/MD paths), estado | SYNC/MEMORY/LOOP · onde-vive-o-que |
| 🤖 Agentes & papéis | que LLMs usa, papéis (arquiteto/impl/revisor), gates | AGENTS.md · protocolo |
| 🔌 Conectores | Notion/Obsidian/GitHub/Vercel/Supabase paths+auth | INFRA · setup-state |
| 🛠️ Skills & packs | o que já usa, o que falta das best practices | .claude/skills · packs |
| 🪄 Routing & GPU | assinaturas (Anthropic/OpenAI/Google), Ollama, hardware | preferences · effort dial |
| 🌊 Waves & fluxo | como organiza trabalho, o que está em curso | Waves tab · _handoff |

Regra: cada masterprompt carrega o CONTEXTO das best practices de ponta (é o "usuário não estuda") —
ex.: o pilar Skills não só pergunta "que skills usas", mas sugere as que um vibe coder high-end teria.
Assim o usuário com projeto ongoing descobre o que não sabia que faltava. **MAS (H1+H3):** o prompt
manda o cérebro LER o projeto real antes de sugerir, e as sugestões são adaptadas à stack detectada —
nunca conselho genérico-de-Mooter imposto a um domínio diferente.

## 2.5 · O CONTRATO DE DADOS — validado contra a fundação real do Mooter (2026-07-17)
**Double-check feito por engenharia reversa da fundação que faz o Mooter funcionar.** O insight que
destrava tudo: a FORMA da fundação é UNIVERSAL (mesmos ficheiros para qualquer projeto agentic-OS);
só o CONTEÚDO muda. Isto é o que aprendemos em meses — o Genesis entrega essa forma pré-provada.

**A fundação perfeita = estes ficheiros (a "forma", agnóstica de stack):**
`AGENTS.md` (overview · boot&freshness · architecture map · conventions · invariants · comm protocol ·
info architecture) · `CLAUDE.md` (invariants · tier ladder · where-things-live · tests) · `SYNC.md`
(estado atual, projeção do Ledger) · `MEMORY.md` (decisões duráveis datadas) · `LOOP.md`
(observado/hipótese/experimento) · `INFRA.md` (endpoints · MCP patterns · refs de secrets, nunca
valores) · `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` (o protocolo) · `docs/strategy/*` (specs
vivos) · `_handoff/templates/*` (mensagens tipadas) · `.claude/skills/*` · vault `00-core` (identidade/
voz/regras — cross-projeto, opcional).

**O que o cérebro controlador (Cowork/Codex) DEVE produzir por pilar (o contrato — o que "mandar para o projeto"):**
| Pilar | Ficheiros que preenche | O cérebro OUTPUT (lendo o projeto real, H1) |
|---|---|---|
| 🧠 Identidade ⭐AHA | AGENTS §overview · CLAUDE header · vault quem-sou/voz | missão 1-linha · o que o projeto É · quem é o brain · tese · voz/tom · valores não-negociáveis |
| 🏗️ Stack&Arq ⭐AHA | AGENTS §architecture/invariants/tests · INFRA · strategy/ARCHITECTURE | langs · frameworks · mapa de módulos (1-linha cada) · deploy · **invariantes duros (o que NUNCA quebra — ficheiros frozen, shas)** · comandos de teste · endpoints |
| 🗂️ Memória | SYNC · MEMORY · LOOP · AGENTS §info-architecture | onde-vive-o-quê deste projeto + ciclo de vida · snapshot do estado atual · decisões duráveis datadas |
| 🤖 Agentes | AGENTS §comm-protocol/boot · PROTOCOL | que LLMs/agentes · papéis (arquiteto/impl/revisor) · ordem de boot · gates humanos · tier ladder |
| 🔌 Conectores | INFRA §MCP · setup-state | quais conectores · paths/workspace-IDs · método de auth · refs de secrets (NUNCA valores) |
| 🛠️ Skills | .claude/skills manifest | skills que tem/precisa · mapeadas às 5 experiências · gaps vs best-practice DA STACK dele (H3) |
| 🪄 Routing/GPU | CLAUDE §tier-ladder · preferences.json | assinaturas disponíveis · modelos locais · hardware · effort default |
| 🌊 Waves | strategy/ROADMAP · _handoff | como organiza trabalho · o que está em curso · metodologia de wave |

Regra de ouro do contrato: os 2 pilares ⭐AHA (Identidade + Stack) sozinhos já geram o AGENTS.md +
CLAUDE.md mínimos — suficiente para o PRIMEIRO handoff perfeito. Os outros 6 enriquecem depois. O
output de cada pilar é frontmatter tipado (contrato P4 da Lingua Franca), não prosa — importável e
validável mecanicamente.

## 3. O FLUXO (value-first — a jornada, wireframe textual, não pixel)
```
DETECT (mooter init, existe) → pré-preenche o que dá (import: lê CLAUDE.md/~/.claude/AGENTS/GEMINI/.roo;
  cold-start: só o que o hardware/keys revelam)
FASE 1 · AHA (2 pilares: Identidade + Stack) → plugin gera masterprompt (adaptativo, manda o cérebro
  LER o projeto) → conector escreve direto OU paste-fallback → scaffolda o MÍNIMO → **primeiro handoff
  perfeito / primeiro recibo GERADO AGORA.** O usuário VÊ valor antes de qualquer outro pilar.
FASE 2 · ENRIQUECER (os outros 6, progressivo, cada um pipelinado do anterior) → cada pilar 🟢 desbloqueia
  mais (Mesh liga, waves aparecem, skills entram) — com o produto JÁ funcionando. Pular é permitido.
FASE 3 · HANDOFF PARA O EM-CURSO → Genesis entrega ao BOARD/handoff/Mesh; dia 2 = Morning Brief pronto.
```
Métrica de sucesso da tela: minutos até a FASE 1 fechar (TTFV), não % de pilares. Estados por pilar:
🔴 vazio / 🟡 parcial / 🟢 pronto-com-prova. Um pilar nunca fica verde sem evidência real (doctor/Radar).

## 4. SYNC entre stakeholders (o "seamless" — reusa o que já temos)
O Genesis configura de uma vez: Cowork↔CC↔Codex↔Gemini↔local falando o protocolo (Lingua Franca #255) +
o conector Claude↔Mooter (do onboarding handoff §3) como transporte + o BOOT GATE (check-in/out) +
o dial de GPU. Resultado: setup é um SYNC entre todos os ambientes do usuário, não N configurações.

## 5. ENTREGÁVEIS + STOPs
| # | Entregável | Gate |
|---|---|---|
| E0 | ÍNDICE-MESTRE: declara qual doc manda em quê (Genesis=jornada · onboarding=R1–R12 · skills=botões) e consolida overlaps na hora — resolve a fragmentação dos 3 docs de design | ⛔ STOP Paulo |
| E1 | `docs/strategy/MOOTER_GENESIS_SPEC.md` — jornada value-first com os DOIS caminhos (import + cold-start, H4), os N pilares finais, wireframe, o CONTRATO DE DADOS do §2.5 refinado/validado (a "forma universal" + output por pilar), conector=herói + paste=fallback (H2) | ⛔ STOP Paulo |
| E1.5 | Validar o §2.5 contra 1 projeto NÃO-Mooter (ex.: um repo público de stack diferente) — provar que a "forma universal" da fundação de facto generaliza, ou reportar onde não generaliza | mesmo STOP |
| E2 | Biblioteca dos masterprompts-por-pilar (o texto que o plugin gera — cada um com contexto de best practices, agnóstico de LLM) | mesmo STOP |
| E3 | UX/UI: aba Genesis VALUE-FIRST (Fase 1 AHA proeminente, Fase 2 progressiva, uma ação por vez, detect-don't-ask, escape hatch) — reusa vscode-elements, anti-Roo (nunca 17 abas), alinha à tese v2 | mesmo STOP |
| E4 | Masterprompt executável da wave (pós-Setup Radar; allowlist; skill-creator p/ os botões) | executa depois |

## 6. ♻️ REUSE (respondido — não reconstruir)
`mooter init` 32KB (detecção — estende) · SETUP_MAPPING (probe→payload→surface, gaps já mapeados) ·
Setup Radar masterprompt (a base do Radar) · Lingua Franca templates (o contrato de import) · conector
MCP ~20 tools (o SYNC) · interview-mode/AGENTS.md são padrão público (roubar o conceito, não fork).
Web do dia OBRIGATÓRIA antes de fechar a spec — o espaço muda em <30 dias.

## Sobre "perfeito" (o Paulo repete — a régua honesta)
A ambição é world-class + fast-track (o usuário faz em minutos o que o Paulo levou meses). Mas
"UX perfeita" NÃO é gate de aceite (não-verificável, convida scope creep — o erro que já custou o
fantasma D1-h8 e o "todos verdes, merga"). O gate é MENSURÁVEL: **TTFV — tempo até o primeiro handoff
perfeito/recibo/brief** (a métrica que o mercado prova prever retenção), validado pelo TESTE DO AMIGO:
5 pessoas com STACKS DIFERENTES (não só TS) chegam ao primeiro valor em <10min sozinhas, saem operando,
voltam no dia 2. Um greenfield. Um não-Claude (Codex/Gemini/local). Perfeito = TTFV baixo + passou o
teste, nunca = bonito. Um Genesis que fica lindo mas leva 40min ao primeiro valor FALHOU por definição.

## O que NUNCA fazer
❌ Implementar nesta conversa · ❌ hardcodar Claude (agnóstico é requisito) · ❌ prompt que o cérebro
responde de memória (H1: manda LER o projeto) · ❌ paste como experiência primária (H2: conector é o
herói) · ❌ best practice genérica-de-Mooter imposta a outra stack (H3) · ❌ só caminho de import
(H4: cold-start greenfield é obrigatório — é o Paulo no próximo projeto) · ❌ duplicar o onboarding
handoff (estende + E0 consolida) · ❌ prometer measurement/mesh como shipped · ❌ >8 pilares (WIP).
