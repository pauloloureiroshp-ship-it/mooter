# MEMORY.md — Mooter Persistent Memory

Fatos duradouros sobre o projeto. Decisões arquiteturais estáveis, constraints imutáveis, "por que fizemos X e não Y". Lido no início de toda sessão do Terminal 1 (obrigatório) e do Terminal 2 (opcional). Escrito apenas pelo Terminal 1, quando uma decisão passou o teste do tempo em LOOP.md e merece ser destilada.

**Propósito:** evitar que aprendizados se percam. Evitar que a gente redebata decisões já tomadas. Evitar que Terminal 2 refaça caminho já descartado.

**Protocolo de escrita:** append-only semanal. Nunca edita entry anterior — se decisão muda, adiciona nova entry com `SUPERSEDES: YYYY-MM-DD-slug`. Histórico preservado.

**Versão do documento:** 1.0 · Abril 2026

---

## 2026-04-21 — tese-perene

**Decisão:** Mooter é o protocolo aberto de observabilidade e roteamento para agentes de AI.

**Framing:** Hook, não proxy. Privacy by architecture. Observabilidade sobre economia. Expert local para tarefas estreitas, cloud para tarefas abertas. Protocolo aberto para ser adotado.

**Por que essa e não outra:** testamos cinco framings alternativos em conversa longa. "Save 90%" envelhece (preços de API caem). "Hook-based router" é técnico demais para viralizar. "Home Grid" é o setup do Paulo, não o mercado. "Token economy DePIN" depende de problemas não resolvidos há 3 anos (proof-of-inference, regulação). "Observability + routing como protocolo aberto" é o único que sobrevive a todos os cenários 2027-2030.

**Implicações imutáveis:**
- Preços de API caindo não matam Mooter — só deprimem a dimensão econômica
- Anthropic/OpenAI lançando router nativo não mata — protocolo aberto pode ser adotado por ambos
- Se Opus fica grátis, Mooter ainda roteia por qualidade, latência e privacidade
- Observabilidade é dor perene, não contingente

---

## 2026-04-21 — filosofia-open-core

**Decisão:** open-core com data moat protegido + telemetria opt-in.

**Modelo de referência:** PostHog, Supabase, Plausible Analytics.

**Aberto (MIT ou Apache 2.0):**
- `classify.js` — lógica do classifier
- `router.js` — policy engine
- Hook handlers — integração com Claude Code, Cursor, Aider
- Dashboard local — HTML/CSS/JS
- Semantic cache layer
- Mooter Protocol spec (Apache 2.0 para proteger contra patent claims)
- Reference implementation do protocolo

**Moat protegido (nunca publicado):**
- `gold-labels.json` — 84+ prompts curados à mão
- `router-tuning.json` — patches aprendidos em produção
- `validation-set.json` — hold-out curado
- `patterns.js` avançados — 167 regex patterns
- Expert LoRAs treinados em código proprietário

**Arquivos sagrados do ambiente pessoal do Paulo (nunca Terminal 2 modifica):**
- `~/.claude/settings.json`
- `~/.claude/statusline.sh`
- `~/.claude/skills/**` (só Terminal 1, só após review)
- `~/.mooter/**`
- Hooks registrados no Claude Code

**Telemetria:** opt-in explícito, default OFF, só hashes e outcomes (não conteúdo), privacy-first by architecture.

**Por que:** publicar moat em MIT mataria a única rota de monetização gradual. Manter tudo privado mata a adoção OSS. Open-core é o único modelo que permite ambos.

---

## 2026-04-21 — as-oito-features-canonicas

**Decisão:** o plano de 30 dias após Fase 0 entrega oito features em ordem fixa. Nenhuma outra feature entra sem superseder formal desta entry.

1. Observabilidade local como produto (Semana 1)
2. Budget-aware routing com enforcement real (Semana 1)
3. Learning insights dashboard (Semana 1)
4. Semantic cache com eviction cost-aware (Semana 2)
5. Three-axis classifier — category × complexity × safety (Semana 2)
6. Policy DSL declarativa não-Turing-completa (Semana 3)
7. Model catalog dinâmico auto-benchmarking (Semana 3)
8. Mooter Protocol RFC público (Semana 3)
9. Meta-LoRA do Mooter sobre uso real (Semana 4)
10. Reasoning depth routing + LLM-as-judge quality gate (Semana 4)

Nota: são 10 features numeradas mas "8 canônicas" no nome porque as duas primeiras da Semana 1 (observabilidade + budget) se entrelaçam.

**Explicitamente fora do escopo 30 dias:** Home Grid como produto standalone, Token Economy, FDLoRA cross-project transfer learning, Federated Learning global. Todas ficam como visões futuras condicionais a métricas específicas (1000+ users, proof-of-inference resolvido, regulação clara).

---

## 2026-04-21 — arquitetura-dois-terminais

**Decisão:** toda execução do Mooter acontece em dois terminais no mesmo PC Windows RTX 4090.

**Terminal 1 — Orquestrador Estratégico:**
- Modelo: Claude Opus 4.7 via Max subscription, beast mode opcional
- Execução: Paulo presente, interativo
- Atua em: arquitetura, código crítico (classifier, router, training pipeline, policy DSL), decisões de design, code review de PRs do Terminal 2, RFC, outreach
- Branch: main ou feature branches aprovadas
- Gate: final-reviewer obrigatório antes de push

**Terminal 2 — Executor Autônomo:**
- Modelo: 100% local via Ollama (qwen3:30b ou similar no stack atual)
- Execução: 24/7 sem presença constante, dangerous mode ativo
- Atua em: tarefas mecânicas, verificáveis, não-estruturais (geração de datasets sintéticos, benchmarks, documentação, refactor de testes, preparação de stacks)
- Branch: `agent/terminal-2-*`, nunca main direto
- Gate: merge em main só via Terminal 1 revisando PR

**iPhone Claude Dispatch:** controle remoto estratégico assíncrono. Aprovação de PRs, redirecionamento. Funciona durante viagem, almoço, qualquer momento fora do PC.

**MacBook Pro:** fallback se dispatch não bastar para decisão complexa.

**Por que no mesmo PC e não máquinas separadas:** elimina Tailscale, elimina sync de filesystem entre máquinas, elimina latência de rede. Git worktrees separados resolvem contenção de working directory. Ollama queue serializa acesso à GPU.

---

## 2026-04-21 — fluxo-de-conhecimento-entre-terminais

**Decisão:** conhecimento flui entre os dois terminais via quatro artefatos vivos e três mecanismos de propagação.

**Artefatos:**
- SYNC.md — estado operacional atual
- MEMORY.md (este arquivo) — fatos duradouros
- LOOP.md — ciclo OBSERVADO/HIPÓTESE/EXPERIMENTO
- SKILL.md files — procedimentos executáveis codificados

**Mecanismos:**
- Session boundary ritual (abrir = ler, fechar = escrever)
- PR como veículo de conhecimento (Terminal 2 abre PR, Terminal 1 revisa e absorve)
- Memory distillation semanal (Terminal 1 lê LOOP.md e promove padrões estáveis para MEMORY.md)

**Por que é crítico:** sem fluxo formal, dois terminais viram dois projetos solitários que divergem. Sistema multi-agente sem canal de aprendizado compartilhado é pior que sistema single-agent.

---

## 2026-04-21 — estado-da-infra-atual-inventariado

**Decisão:** o inventário gerado em `docs/CURRENT-STATE.md` (21 abril 2026) é o baseline factual do projeto. Toda referência a "o que existe" aponta para esse documento até novo inventário.

**Assets confirmados em produção:**
- SYNC.md canônico em `C:\Users\Paulo Loureiro\frugal\SYNC.md` (50KB, 30+ seções)
- final-reviewer como agent com Opus hardcoded, gate pré-push
- Beast/Zen/Auto mode via mooter-mode.js → .mooter-mode.json
- 12 skills mooter-* essenciais
- 14 MCPs conectados (Notion, Supabase, Sentry, Cloudflare, Context7, Figma, Linear essenciais)
- Landing live em mooter.ai
- Audit discipline com 17 findings fechados em Sprint A-D (commits 0cdf73f → 4d60d9f)

**Fraturas reconhecidas (não urgentes, mas rastreadas):**
- Classifier gastou $2.89 / 32 Opus calls em tarefa descritiva T0/T1 (inventário). Não investigado por decisão explícita. Aceito como bug conhecido com flag em LOOP.md.
- VRAM 2.2GB livre sugere modelos Ollama residentes. Mitigação aplicada: `OLLAMA_KEEP_ALIVE=5m`.
- Divergência `frugal/skills/` vs `~/.claude/skills/` — fonte de verdade é `~/.claude/skills/`.
- `mooter-continuous-tester` listado em docs mas não como processo — status real a confirmar.
- Side-finding F1.1: `mooter-mode.js` precisa sync manual do canônico frugal/tools/router. Follow-up pendente para tornar `/mooter-auto-capable` a partir de install fresca.

---

## 2026-04-21 — modelo-de-rentabilizacao-gradual

**Decisão:** monetização acontece em camadas, não monetiza tudo de uma vez.

- **Free forever:** core OSS, runtime, classifier base, dashboard local, protocolo
- **Pro $10-20/mês:** gold labels curados, expert LoRAs genéricos pré-treinados, sync multi-device
- **Team $30-50/seat/mês:** observabilidade agregada, audit logs, SSO, shared expert registry, policy management
- **Enterprise $milhares/mês:** on-prem, SOC 2, HIPAA, priority support, custom LoRAs em código proprietário

**TAM realista 24 meses:** 10k-100k OSS users, 100-1k Pro, 10-100 teams, 1-10 enterprises. Revenue $50k-$500k ARR.

**Por que não mais:** ambição lifestyle business sólido com opcionalidade de acelerar. Não é tese de unicórnio. É MBA técnico com rentabilização possível.

---

## 2026-04-21 — paulo-e-o-primeiro-user

**Decisão:** Paulo é o primeiro user do Mooter v2 e precisa estar convencido antes de recomendar.

**Implicação operacional:** Paulo precisa de acesso a múltiplos providers (Anthropic via Max — tem; OpenAI — $5 depósito planejado; Gemini tier grátis — planejado) para testar Mooter como multi-provider real. Sem isso, Mooter testa 1/4 da própria tese.

**Implicação de processo:** toda feature só é "shipada" quando Paulo mesmo usa por 48h+ sem frustração. Não é métrica de observadores externos. É dogfooding ritual.

---

## 2026-06-07 — mission-statement

**Decisão:** a missão canônica é **"Your LLM router. Local-first. Learns forever."** (7 palavras, universal — variante B6d, escolhida entre alternativas na Wave 30).

**Implicação:** todo copy público deriva daqui; "save 90%" e afins são consequência, nunca a promessa.

---

## 2026-06-08 — tier-ladder-t5-fable-opt-in

**Decisão:** T0-T3 são auto-roteados; **T5 (Fable) é opt-in exclusivo via `@fable` e nunca auto-roteado; não existe T4**. Prompts de alto risco (deploy/secrets/migrations) têm floor T3.

**Por quê:** custo/capacidade do tier Mythos não justifica roteamento automático; o floor T3 protege o irreversível. (Formalizado em `CLAUDE.md`/`AGENTS.md`; wave 58 adicionou `fable-5-routing.ts` por allowlist.)

---

## 2026-06-11 — engine-frozen-e-allowlist-por-wave

**Decisão:** `tools/router/classify.js` é FROZEN (sha256 CI-enforced) e os `packages/*` das waves 28-34.5 ficam intocados salvo allowlist explícita no brief da wave ativa (padrão: **só adições, arquivos novos**).

**Por quê:** o motor provado não se degrada por acreção; toda evolução entra por camada nova auditável.

**Reverter custaria:** re-validar o classifier inteiro + perder a garantia de CI.

---

## 2026-06-26 — uma-sessao-cc-por-working-tree

**Decisão:** sessões CC compartilham a working-tree → **rodar UMA de cada vez**; ship de main via worktree dedicada (`git worktree add ../frugal-ship`), nunca da árvore compartilhada.

**Por quê:** worktree-crossing provado 2× (sessão Overclock ocupou a tree 06-28; CC editou worktree errada 07-05).

---

## 2026-07-03 — git-nativo-e-a-unica-verdade

**Decisão:** o estado git lido via mount/sandbox é **não-confiável para escrita e enviesado para leitura** (incidente: 2119 dirty reportado vs 11 real, HEAD "partido"). Leitura via mount só cruzada com nativo; **escrita git é sempre do Paulo, PowerShell nativo**.

**Reverter custaria:** risco real de corromper `.git` (permissões parciais no mount).

---

## 2026-07-03 — protocolo-de-comunicacao-tipado

**Decisão:** trabalho flui por handoffs tipados (⇄ COWORK→CC com GOAL/WHERE/DO/GUARD/GATE/NEXT/BACK · ⇄ MOO HANDOFF de volta), prosa só para decidir; **confrontar o estado real da frente (git/worktree/último handoff) antes de emitir** — incremento sobre o que existe, nunca recomeço; só o Paulo autoriza o irreversível.

**Onde vive:** `AGENTS.md` § Communication protocol (espelho do vault `00-core/protocolo-comunicacao`).

---

## 2026-07-04 — live-preview-local-first-sem-webcontainers

**Decisão:** o App Stage renderiza o **dev server real num iframe dentro do VS Code** — sem WebContainers, sem re-hospedar. Os 3 fossos: preview fiel · click-to-code · edições determinísticas $0 (moos locais).

**Por quê:** a queixa nº 1 do mercado (Lovable/Bolt/v0/Replit) é de CONFIANÇA (preview que mente, credit-burn); local-first ataca exatamente isso e nenhum concorrente o tem dentro do VS Code. O funil **edito $0 → seguro $0 → publico com custo visível** é o anti-credit-burn como produto.

---

## 2026-07-07 — arquitetura-de-informacao-ciclo-de-vida

**Decisão:** todo `.md` tem uma casa e um ciclo de vida (`AGENTS.md` § Information architecture): masterprompt executado arquiva em `_handoff/_archive/YYYY-MM/` **no mesmo PR do ship**; 1 spec vivo por feature em `docs/strategy/`; `SYNC.md` é snapshot ≤~200 linhas (histórico rola para archive); LOOP no dia; MEMORY destila o que sobrevive ~1 mês.

**Por quê:** auditoria 2026-07-07 (`_handoff/INFO_AUDIT.md`): 3 depósitos sem ciclo de vida (23 masterprompts executados soltos, SYNC de 371 KB, waves históricas em docs/strategy). Regra em .md é pedido — enforcement mecânico via `tools/docs-hygiene.js` (CI/hook, modo warn primeiro) planejado.

---

## Seção — Registro de decisões supersedidas

(vazio — será populado conforme decisões evoluem; nova entry superseder aponta para antiga via slug)

---

## Protocolo de distillation semanal

Uma vez por semana, Terminal 1 (Paulo presente) executa:

1. Lê todas as entries novas de LOOP.md desde última distillation
2. Identifica padrões que viraram estáveis (repetidos em ≥3 sessões ou validados em experimento decisivo)
3. Destila em entry nova de MEMORY.md com formato:
   - Slug: `YYYY-MM-DD-slug-em-kebab`
   - Decisão: frase única declarativa
   - Por que: contexto conciso
   - Implicações imutáveis: lista
4. Atualiza LOOP.md marcando entries destiladas como `ARCHIVED → MEMORY.md#slug`
5. Commit `memory: distill week of YYYY-MM-DD`
6. Final-reviewer obrigatório antes de push

Tempo esperado: 15-30 min por semana.
