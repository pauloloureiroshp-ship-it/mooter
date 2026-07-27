# 🐮🕸️ MOO HARMONY MESH — a GPU nunca dorme (blueprint + masterprompt)

> Cowork · 2026-07-16 · Origem: doutrina GPU-turbo do playbook + pedido do Paulo (GPU constante →
> perfect handoff garantido, harmonia, auto-setup, skills) + web hoje (limites reais de modelos locais).
> Casa: `_handoff/` → arquivar quando a wave shipar. Depende de: MOO_LINGUA_FRANCA (o protocolo que
> esta malha executa). Não colide com F1–F3.

🎯 GOAL   A GPU local trabalha 24/7 como malha de fundo que GARANTE o protocolo: valida handoffs,
          caça inconsistências antes que enganem agentes, pré-coze contexto, e faz o setup do agentic
          OS sozinho. O usuário pilota; a malha mantém a harmonia. Custo marginal: $0.

## 0. A verdade do mercado primeiro (para não construir em cima de hype)

Verificado hoje (web): modelos <7B **falham como agentes** (tool-calling malformado, incoerência
multi-step — propriedade do modelo, não do harness). O que funciona local: classe 30B+ para julgamento,
e qualquer tamanho para transforms mecânicos single-shot. Conclusão honesta que JÁ é a doutrina do
repo ("o handoff perfeito é determinístico; qwen é guarnição, nunca substância"):

| Camada | Quem | Para quê | Confiabilidade |
|---|---|---|---|
| L0 Determinística | scripts Node, zero-LLM | verdade: git state, sha, grep, schema-check, mtime | 100% — é a substância |
| L1 Julgamento local | qwen3:30b (4090) | avaliar consistência semântica, triage, resumo fiel | alta em single-shot bounded |
| L2 Guarnição | qwen2.5:3b | narrativa best-effort, compressão de prosa | nunca load-bearing |

**Regra de ouro da malha: um check que PODE ser determinístico DEVE ser determinístico.** O LLM local
entra onde código não alcança (semântica), e mesmo aí produz sugestão flagada, nunca fato.

## 1. Os jobs da malha (cada um previne uma falha REAL já ocorrida)

| Job | Camada | Gatilho | O que faz | Falha real que teria prevenido |
|---|---|---|---|---|
| **handoff-lint** | L0+L1 | handoff/brief escrito | valida contra template (campos, budget, n/d vs palpite, RED ALERT presente se uncommitted) | handoffs incompletos pré-protocolo |
| **pointer-sentinel** | L0 | diário + pré-handoff | todo `path` citado em AGENTS/CLAUDE/SYNC/masterprompts existe? refs `path:linha` batem? | **FC-6** (vault morto 3+ semanas) · **FC-1** (paths errados no meu masterprompt) |
| **orphan-watch** | L0 | diário | untracked/uncommitted > N horas em qualquer worktree → alerta no Cockpit + handoff | **FC-3/FC-4** (F3 uncommitted · PHASE_A_GATE 6 dias invisível) |
| **projection-drift** | L0 | pós-commit/merge | SYNC.md vs git real (PR/SHA/versão) divergem? → flag "projeção mente" | SYNC apontando #246 semanas depois |
| **brief-keeper** | L0 | fim de sessão | copia briefs de dirs gitignored/worktrees → `_handoff/agent-sync/briefs/` da árvore principal | **FC-5** (brief evaporável) |
| **context-prebake** | L1+L2 | noturno + pós-merge | digests, index.md por pasta, Morning Brief pré-cozido, delta-since-last-look | F1 Resume da tese (60s de re-ambientação) |
| **doc-drift** | L1 | semanal | SYSTEM_DESIGN/README vs código (as 4 divergências do B4 eram detectáveis: timeout, cron count, backend) | achados B4/A3/A4 da auditoria |
| **reuse-indexer** | L0+L1 | semanal | indexa `.claude/skills/`, `packs/`, `_handoff/_archive/` + watchlist de repos públicos → responde o ♻️ REUSE GATE em <5ms local | retrabalho de coisas já feitas |
| **gate-runner** | L0 | pré-handoff | roda testes targeted + sha + node --check e emite `kind:outcome` no Ledger | GATE mecânico sempre completo, nunca "verde" de memória |
| **token-warden** | L0 | contínuo | mede tokens por mensagem tipada vs budget; estourou → aponta a seção gorda | eficiência de tokens auditável, não aspiracional |

Infra que JÁ existe e a malha reusa (não construir de novo): fleet pm2 + watchdog (ciclos 15s),
gpu-stream (windowsHide), handoff-journal/rollup, 3rd-brain retriever (<5ms, zero-LLM), Pastor,
doctor-checks no plugin, `mooter digest`. A malha é **orquestração de peças existentes + checkers novos
L0 pequenos** — não é um sistema novo.

## 1.5 O dial de effort — LazyMoo · Moo · CrazyMoo (decisão Paulo 2026-07-16)

A malha não é infra invisível: é um **dial de effort por engine**, na mesma metáfora que os LLMs de
assinatura já ensinaram ao usuário (reasoning effort / thinking budget). Cada engine que o usuário JÁ
paga ganha um dial — Anthropic, OpenAI, Google (teto de tier/spend) e a GPU (intensidade da malha).
Não é taxonomia nova: estende o lazy/moo/crazy por-sessão que `MOOTER_COCKPIT_ARCHITECTURE.md` já
define para effort por engine/projeto.

| GPU effort | Jobs ativos | Cadência | Guarda |
|---|---|---|---|
| 🦥 LazyMoo | só L0 (pointer-sentinel, orphan-watch, projection-drift, brief-keeper) | diário + pré-handoff | quase zero VRAM |
| 🐮 Moo | L0 + L1 agendado (handoff-lint, doc-drift, reuse-indexer, prebake noturno) | ciclos do fleet | vram-preflight gate |
| 🐮⚡ CrazyMoo | tudo, capacidade máxima SEGURA (prebake contínuo, brief sempre quente) | contínuo | gpu-stream + teto térmico/VRAM · cede a jogos/uso interativo |

**Regra do recibo:** effort sem recibo é ventilador girando. Cada nível mostra no Turbo Gauge o que
comprou: digests pré-cozidos, drifts pegos, tokens poupados, tempo-até-Resume. Sem recibo, não sobe
de nível por default.

**Posicionamento que isto destrava (anti-OpenRouter):** router de preço×tier virou commodity (proxies
como OpenRouter cobram markup por token de API e NÃO usam assinaturas nem GPU do usuário). O
diferencial do Mooter é **maximização de custo afundado**: as assinaturas que o usuário já paga + a
GPU que já comprou, rendendo o teto, 24/7, hook-não-proxy, custo marginal $0. Nenhum player cloud
copia isso — o negócio deles é vender mais tokens, não fazer os teus renderem mais.

## 1.6 Controle do dial — auto-cede primeiro, comando como override (decisão Paulo 2026-07-16)

O usuário PRECISA poder retomar a GPU instantaneamente (jogo, vídeo, render) — sem isso ninguém
confia numa malha always-on. Desenho em 3 camadas, do automático ao manual:

1. **Auto-yield (a regra).** O `gpu-stream` já amostra utilização + foreign models a cada 15s.
   Heurística: consumo GPU interativo de processo não-Mooter detectado → malha degrada para LazyMoo
   sozinha → retoma o effort configurado após N min de GPU livre. O usuário joga sem digitar nada —
   "melhores práticas automáticas, sem bronca" aplicado à própria malha.
2. **Override manual (a exceção).** UM comando, não cinco: `/moo effort lazy|moo|crazy` +
   `/moo pause <duração>` (pausa temporal com auto-resume — resolve o "esqueci de reativar").
   ❌ Não criar escala paralela light/medium/high/extrahigh — seria a 4ª taxonomia; as 3 personas
   já existem no cockpit e são marca.
3. **Um estado, três portas.** Estado global em `~/.mooter/preferences.json`
   (`gpu_effort` + `pause_until`); enforcement no gate de ciclo do fleet (efeito ≤15s);
   interfaces: slash command (CC) · `mooter effort` (CLI) · dial visual no Cockpit.
   Nota: effort de GPU é GLOBAL da máquina — não confundir com o modo lazy/moo/crazy POR-SESSÃO
   do mode-registry (routing). Nomes iguais, eixos diferentes; o Cockpit deixa isso visível.

**Recibo na troca (sempre):** `/moo effort lazy` responde "liberando ~14GB VRAM · 6 jobs adiados
para 02:00 · Morning Brief continua garantido". Consequência visível, nunca fé.

## 1.7 Moos EXECUTORES — não só checkers (refinamento Paulo 2026-07-16)

Além de vigiar, os moos locais EXECUTAM as tarefas simples e agendadas — mais rápido que cloud
(zero rede, zero fila, $0) e sem gastar quota. A fronteira é dura e não-negociável:

| Classe de tarefa | Moo local faz? | Como |
|---|---|---|
| Agendamento/orquestração (cron, ciclos, retry) | ✅ mas SEM LLM | determinístico puro — fleet/schtasks já fazem |
| Transform single-shot bounded (digest, index.md, draft de entrada LOOP.md, compressão, formatação, changelog, projeção de handoff) | ✅ L1 (30B) | uma chamada, input fechado, output verificável; SEMPRE flagado `moo-draft` com proveniência — canônico só vira após gate (reducer/CC/humano) |
| Narrativa/resumo cosmético | ✅ L2 (3B) | best-effort, nunca load-bearing |
| Multi-step agentic (editar código, tool-calling, decidir) | ❌ NUNCA local <30B, e mesmo 30B só supervisionado | verificado no mercado: <7B falha sempre; autonomia local é hype |

Regra de escrita: moo executor NUNCA escreve direto em ficheiro canônico (SYNC/MEMORY/LOOP) — produz
draft + evento no Ledger; o reducer/gate materializa. Herda o single-writer da F1 por construção.
LOOP.md ganha o ciclo: evidência mecânica (testes, diffs) → moo L1 rascunha o learning → flag
`moo-draft` → CC/humano promove. Learnings deixam de se perder por preguiça de escrever.

## 1.8 Skills públicas para os moos — com certificação, não fé (refinamento Paulo 2026-07-16)

Agent Skills virou padrão aberto (repo público anthropics/skills, marketplaces, portável a qualquer
LLM — verificado web 2026-07-16). ♻️ REUSE direto: os moos executores carregam skills para fazer a
tarefa simples DO JEITO CERTO (formato de commit, changelog, digest, index) — o output local sai com
a mesma qualidade de forma que o cloud, e isso é o que gera confiança do usuário.

O diferencial honesto (ninguém faz): **certificação local por benchmark**. Uma skill pública só entra
no "moo skill pack" depois de: (1) curadoria — single-shot, sem tool-calling, cabe no contexto do
modelo local; (2) **MooterBench mede** a skill no modelo local alvo (3B e 30B) com fixtures reais;
(3) passou → entra no pack com score; falhou → fica cloud-only. O Cockpit mostra o score — "esta
skill roda local a 97% do cloud, $0". Skill sem medida não roda local. É a honest-copy doctrine
aplicada a skills — e alimenta a specialization-matrix que já existe.

## 1.9 Telemetria pilotável no Cockpit — recibos em tempo real (refinamento Paulo 2026-07-16)

Tudo que a malha faz aparece no plugin, em tempo real, pilotável. Reuso: Fleet view, hardware strip,
savings-tracker :7821 e gpu-stream JÁ existem — isto é uma view "Moo Mission Control" que os junta:

| Painel | Mostra | Fonte (existente) |
|---|---|---|
| Agora | jobs rodando/na fila · modelo carregado · VRAM/util · effort atual + auto-yield ativo | gpu-stream + fleet heartbeat |
| Recibos (o centro) | por job: o que produziu, tokens/quota poupados, drift pego, tempo até Resume | Ledger `kind:outcome` + savings-tracker |
| Pilotagem | dial effort · pause · toggle por job · promover/descartar moo-drafts pendentes | preferences.json + mode-registry |
| Skills locais | pack instalado + score de certificação por skill | MooterBench + packs/ |

Regra anti-vanity: a métrica-mãe é RECIBO (o que a GPU comprou pra ti hoje), nunca gráfico de
utilização por si só. Se um painel não muda uma decisão do usuário, não entra. Drafts pendentes de
promoção aparecem como fila de 1 clique — pilotar = decidir, não assistir.

## 2. Auto-setup: o agentic OS que se instala sozinho (a dor nº1 do vibe coder)

O entrevistador já existe (`init.ts` 32KB: hardware/Ollama/keys/subs). Falta ele AGIR. Pipeline:

```
mooter init --auto
 1. DETECT   (existe) probe: GPU/VRAM → tier local (3b? 30b?) · keys/subs · repo state
 2. SCAFFOLD (novo)   aplica a estrutura: AGENTS.md + SYNC/MEMORY/LOOP.md + _handoff/ +
                      templates Lingua Franca + hooks + .claude/skills base — tudo de template,
                      idempotente, diff mostrado antes de escrever
 3. MESH     (novo)   registra a malha no fleet conforme a GPU: 4090 → L0+L1+L2 ·
                      GPU fraca → só L0 (determinístico roda em qualquer máquina) · nada → L0 via cron
 4. PROVE    (existe) doctor + gate-runner → Radar N1-N4 com prova real, nunca check verde de fé
```

Gate de aceite = o teste do amigo: instala em minutos, conecta o que já paga, sai com estrutura
completa + malha rodando, volta no dia seguinte e o Morning Brief está pronto. **Zero pesquisa no
YouTube de "como ser vibe coder high-level" — as best practices viram estrutura aplicada, não estudo.**

## 3. Skills — o que vira skill do Mooter (destilação do que esta sessão fez à mão)

| Skill nova | Destila o quê | Camada |
|---|---|---|
| `moo-handoff-check` | o scorecard 9.3/10 que o Cowork fez à mão hoje | L0+L1 |
| `moo-decision-contract` | gerar o contrato tipado §10 a partir de um handoff | L1 |
| `moo-consistency` | pointer-sentinel + projection-drift sob demanda | L0 |
| `moo-reuse` | o ♻️ REUSE GATE com o índice local | L0+L1 |
| `moo-brief` | Morning Brief / delta-since-last-look | L1+L2 |
| `moo-masterprompt` | scaffold de masterprompt no template, com GUARD/GATE/STOPs preenchidos do contexto | L1 |
| (auditar existentes) | 21 skills em `.claude/skills/` — quais migram para o formato Lingua Franca | — |

Regra: skill = interface humana ("faz X agora"); job da malha = a mesma lógica agendada. Uma
implementação, duas portas. É o que torna cada prompt mais barato: o contexto certo já está pré-cozido
quando o prompt chega.

## 4. Sequência (onde isto encaixa — sem atropelar o que está em voo)

```
F1–F3 (em execução) → LINGUA FRANCA (protocolo+templates) → HARMONY MESH fase A (L0 checkers:
pointer-sentinel, orphan-watch, projection-drift, brief-keeper — 4 scripts pequenos, valor imediato)
→ fase B (L1: handoff-lint semântico, doc-drift, reuse-indexer) → fase C (auto-setup SCAFFOLD+MESH)
→ Setup Radar (a UI que projeta tudo — os jobs da malha alimentam o Radar)
```

Fase A é deliberadamente pequena: 4 checkers determinísticos + registro no fleet. Cada um teria
prevenido uma FC real deste ciclo — ROI provado antes de escrever a primeira linha.

## 5. ♻️ REUSE (respondido antes de construir, como manda o protocolo)

- **Spec-driven (GitHub Spec Kit, JetBrains)**: a indústria convergiu para "constituição do projeto +
  specs como fonte" — o Mooter já tem a constituição (AGENTS/SYNC/MEMORY/LOOP); a malha a mantém
  verdadeira automaticamente, que é o que nenhum kit público faz. Não adotar kit externo; roubar o
  conceito de "spec como autoridade" que já está no Lingua Franca.
- **Agentes locais autônomos**: mercado confirma que não funcionam <30B e exigem supervisão — a malha
  NÃO é agente autônomo; é checkers determinísticos + LLM bounded single-shot. Desenho validado.
- **pm2/cron/hooks**: já no repo. Ollama: já no repo. Nada novo de infra pesada a adquirir.

## ⛔ STOPs desta wave (quando virar masterprompt de execução)
1. Fase A: lista final dos 4 checkers + onde plugam no fleet — revisão Paulo antes de codificar.
2. Auto-setup SCAFFOLD: o diff do que `--auto` escreve — revisão Paulo (é a cara do produto).
3. Nunca: malha com poder de escrita em SYNC/Ledger fora do reducer (herda o single-writer da F1) ·
   checker LLM virando "fato" sem flag · job novo sem responder qual falha real ele previne.

## 7. O fecho do loop — LoRA/DoRA e o "learns forever" HONESTO (refinamento Paulo 2026-07-16)

O que já existe no repo: Pastor (LoRA treinada em 253 decisões reais · `mooter pastor distill`) ·
Adapter Forge (W7, O-LoRA/OPLoRA anti-forgetting, base `adapter/`) · adaptive learner atrás de
`use_learned` (DARK — default off, nenhum caller, auditoria G3) · MooterBench · specialization-matrix.
A claim "learns forever" é hoje a MENOS provada do produto — e a mesh é o que a torna provável.

**A ordem honesta (dados antes de adapters — inegociável):**
```
Mesh A (recibos + outcomes no Ledger)  →  Ledger Fase B (captura durável/rotação)
  →  A/B shadow (G3: candidate baseline vs learned, outcome real pareado, SEM mudar routing)
  →  Adapter Forge / Pastor v3 (treina LoRA/DoRA nos dados reais DO projeto do usuário)
  →  certificação MooterBench (mesmo gate das skills: score medido ou não roteia)
  →  claim "learns forever" no site/marketplace — COM dados, nunca antes
```

**Como a mesh alimenta o loop:** `gate-runner` emite `kind:outcome` (labels de sucesso/falha reais) ·
recibos do dial viram sinal de valor · **CrazyMoo agenda treino noturno** — GPU ociosa de madrugada é
a janela de fine-tune $0 (auto-yield garante que nunca compete com uso interativo).

**Guards:** nenhum adapter auto-roteia sem cell medida na specialization-matrix (o mesmo gate honesto
da W62 para modelos) · treino é job L1-agendado, nunca bloqueante · anti-forgetting (O-LoRA) obrigatório
antes de adapter por-projeto acumular · rollback de adapter = 1 clique (é um ficheiro, não um deploy).
