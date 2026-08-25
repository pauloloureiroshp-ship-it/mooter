# 🐮🌱 MOOTER GENESIS — spec viva do onboarding como produto

> Cowork · 2026-07-17 · Tipo: SPEC VIVA (`docs/strategy/`) · Origem: `_handoff/_archive/2026-07/PROJECT_GENESIS_MASTER_HANDOFF.md`
> (E0+E1+E1.5+E3 num só doc — decisão anti-fragmentação, ver §0). ⛔ STOP: revisão Paulo antes de
> virar wave. Design-only — zero código nesta rodada. Web do dia 2026-07-17 confrontada (fontes no §8).

---

## 0 · ÍNDICE-MESTRE (E0) — qual doc manda em quê (resolve a fragmentação)

Regra: **1 assunto = 1 doc canônico**. Os outros viram fonte citada ou arquivam quando a wave shipar.

| Assunto | Doc que MANDA | Os outros docs viram |
|---|---|---|
| **Jornada de onboarding + mecânica por pilar + contrato de dados + UX da aba Genesis** | **ESTE doc** (`docs/strategy/MOOTER_GENESIS_SPEC.md`) | `PROJECT_GENESIS_MASTER_HANDOFF.md` → arquivar no PR que shipar; `MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md` → fonte dos R1–R12 (mapeados no §6), arquivar junto |
| Requisitos R1–R12 + benchmark Roo + decisão do conector (superfície de tools) | `MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md` **até** este doc ser aprovado; aí o §3+§6 daqui assumem | — |
| Skills que operam os botões (top-5 + specs + wave E4 delas) | `_handoff/_archive/2026-07/MOOTER_SKILLS_MAP.md` | este doc só REFERENCIA |
| Curadoria Project Zero (2-3 skills do `init`, classes de ativo A/B/C) | `_handoff/_archive/2026-07/MOOTER_PROJECT_ZERO_BLUEPRINT.md` | este doc só REFERENCIA (§2 usa as classes) |
| Prova/estado/checks (setup-state, Radar N1–N4, prova-ou-cinza) | `_handoff/SETUP_RADAR_MASTERPROMPT.md` + EMENDA | Genesis NÃO cria checks novos — projeta os do Radar |
| Contrato de mensagens tipadas (P4 frontmatter, budgets, 4 tipos) | `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` (#255) | ⚠️ relação payload §2.4 ↔ P4 em decisão (STOP-1 — ver nota no §2.4) |
| Auto-setup pipeline (DETECT→SCAFFOLD→MESH→PROVE) | `MOO_HARMONY_MESH_BLUEPRINT.md` §2 (Mesh fase C) | Genesis é a SUPERFÍCIE desse pipeline no plugin |

**Overlaps consolidados na hora:** (a) o "Wizard 5 telas" do Setup Radar F4 e a "aba Genesis" são a
MESMA superfície — o Genesis substitui o wizard como jornada (a EMENDA E1 já apontava para isso:
≤3 inputs, primeiro valor ≤3min); o Radar continua dono da PROVA. (b) O R4 (prompt copy-paste) do
onboarding handoff vira o fallback do §3 daqui — não é mais jornada principal. (c) `mooter init --auto`
(Mesh C) é o MOTOR do Genesis; a aba é a cabine dele. Nenhuma taxonomia nova criada.

---

## 1 · A JORNADA (E1) — value-first, dois caminhos

**Norte: TTFV.** Evento de ativação = primeiro HANDOFF PERFEITO, primeiro RECIBO da GPU, ou primeiro
MORNING BRIEF — nunca "8/8 pilares". Setup-first é anti-padrão provado (churn alto mesmo com onboarding
"completo"; mercado 2026 mede ativação por primeiro valor, não por conclusão — fontes §8).

### 1.1 Os DOIS caminhos (H4 — decididos no primeiro clique, detectados, não perguntados)

| | 🔁 IMPORT (projeto ongoing) | 🌱 COLD-START (greenfield — o Paulo no próximo projeto) |
|---|---|---|
| Detecção | pasta tem git/código/CLAUDE.md/AGENTS.md/GEMINI.md/.roo/.cursor | pasta vazia ou só README |
| O que o cérebro faz | **LÊ o projeto real** e extrai o contrato (H1: leitura guiada, nunca quiz) | **ENTREVISTA O USUÁRIO** sobre o que quer construir; o contrato nasce das respostas |
| Pré-preenchimento | `mooter init` probe + parse de CLAUDE/AGENTS/GEMINI/.roo → campos já 🟡 "confirmar" | só o que máquina/keys revelam (hardware, subs, Ollama) |
| Scaffold | MAPEIA o que existe antes de criar (ver §4 — nunca 2ª verdade) | gera a fundação completa de template |
| Risco típico | brain responde de memória → **regra read-first + n/d** | usuário não sabe responder → **defaults + defer ao Mooter, tudo revisável** |

### 1.2 As três fases (uma ação por vez, valor antes de setup)

```
FASE 0 · DETECT   mooter init probe (existe) → genesis-state pré-preenchido {value, source, proof}
                  (mesmo shape do setup-state.json do Radar — REUSE, não formato novo)
FASE 1 · AHA      SÓ 2 pilares (Identidade + Stack) → 1 entrevista gerada → cérebro responde →
                  plugin valida+importa → scaffolda o MÍNIMO (AGENTS.md+CLAUDE.md+SYNC.md) →
                  ⭐ PRIMEIRO VALOR AGORA: 1 prompt roteado com recibo OU 1 handoff perfeito gerado.
                  Gate da fase: ≤3 inputs manuais · primeiro valor ≤3min (EMENDA E1 herdada).
FASE 2 · ENRICH   os outros pilares, progressivos, 1 por vez, cada um pipelinado do anterior
                  (a resposta de N entra como "CONTEXTO CONFIRMADO" no prompt de N+1).
                  Cada pilar 🟢 desbloqueia algo visível (mesh liga · waves aparecem · skills entram).
                  Pular sempre permitido → campo fica cinza no Radar, nunca bloqueia.
FASE 3 · HANDOFF  Genesis emite eventos-genesis no Ledger → projeção na fundação → entrega ao
                  BOARD/Mesh/Radar. Dia 2 = Morning Brief. Onboarding não é ilha; é rampa.
```

---

## 2 · O CONTRATO DE DADOS (E1 — o §2.5 refinado pela validação E1.5)

### 2.1 Refinamento nº1 (achado da validação real, §4): **provenance por campo**

Nem todo campo do contrato pode vir da leitura do repo. Três classes — e o prompt de cada pilar
declara de qual classe cada campo vem, senão o cérebro alucina o que o repo não contém (garbage-in v2):

| Classe | Fonte da verdade | Quem responde | Exemplo |
|---|---|---|---|
| **REPO** | ficheiros do projeto | cérebro LENDO (H1) | mapa de módulos, comandos de teste, invariantes escritos |
| **MACHINE** | probe local | `mooter init` (detect-don't-ask) | GPU/VRAM, Ollama, keys, subs, MCP servers |
| **USER** | só a cabeça do usuário | entrevista (cérebro pergunta AO usuário) | tese, voz, gates humanos, como organiza trabalho |

### 2.2 Refinamento nº2: **pilar ≠ entrevista** — pilar é slot de estado

Dos 8 pilares, só ~5 geram entrevista ao cérebro. 🪄 Routing/GPU e metade de 🔌 Conectores são
MACHINE puros: o probe resolve e o usuário só CONFIRMA (1 clique). Menos fricção que o Roo por
construção, sem cortar pilar (continuam ≤8 como modelo de estado).

### 2.3 A tabela-mestra (forma universal validada §4 · ⭐AHA = Fase 1)

| Pilar | Entrevista? | Classe dominante | Ficheiros que preenche | Output do cérebro (resumo) |
|---|---|---|---|---|
| 🧠 Identidade ⭐ | ✅ | REPO+USER | AGENTS §overview · CLAUDE header | missão 1-linha · o que É · quem é o brain · tese · voz · valores não-negociáveis |
| 🏗️ Stack&Arq ⭐ | ✅ | REPO | AGENTS §arch/invariants/tests · INFRA | langs · frameworks · mapa módulos 1-linha · deploy · invariantes duros · comandos de teste |
| 🗂️ Memória | ✅ | REPO+USER | SYNC · MEMORY · LOOP · AGENTS §IA | onde-vive-o-quê + ciclo de vida · snapshot estado · decisões duráveis datadas |
| 🤖 Agentes | ✅ | USER+REPO | AGENTS §comm/boot | LLMs/papéis · ordem de boot · gates humanos · tier ladder · **restrições que o repo impõe a agentes** (achado fd §4) |
| 🔌 Conectores | ◐ confirma | MACHINE+USER | INFRA §MCP · setup-state | conectores+paths+auth · refs de secrets (NUNCA valores) |
| 🛠️ Skills | ✅ | REPO+MACHINE | .claude/skills manifest | tem/precisa · **teto 2-3 curadas** (Project Zero §7 — SkillsBench: 4+ = retorno decrescente; excedente vai pro AGENTS.md passivo) |
| 🪄 Routing/GPU | ❌ só confirma | MACHINE | CLAUDE §tier-ladder · preferences | subs · modelos locais · hardware · effort default |
| 🌊 Waves | ✅ | USER+REPO | strategy/ROADMAP · _handoff | como organiza trabalho · o que está em curso · metodologia (no fd: release-checklist JÁ É a wave deles — importar, não impor) |

**Regra de ouro (inalterada, agora provada):** Identidade+Stack sozinhos geram AGENTS.md+CLAUDE.md
mínimos → suficiente para o primeiro handoff/recibo. Os outros 6 enriquecem com o produto já vivo.

### 2.4 O payload (importável, validável, nunca prosa)

> ⚠️ **STOP-1 (achado F0 2026-07-17): a alegação original "instância do P4" contradiz a constituição.**
> O P4 (#255) diz "every inter-agent message MUST be exactly one of these four types" — e `GENESIS_PILLAR`
> seria um 5º tipo, sem os campos obrigatórios do frontmatter P4. Duas saídas honestas, decisão Paulo:
> **(a)** payload viaja como corpo de um `DECISION CONTRACT` (cérebro→executor, tipado, ≤2k — encaixa);
> **(b)** payload é **contrato de PRODUTO** (dados de runtime do onboarding), fora do escopo P4 — que
> governa mensagens entre agentes da mesh de build, não dados que o produto entrega ao projeto do usuário;
> herda as truth rules (n/d, provenance) como doutrina, não como tipo de mensagem.
> Recomendação Cowork: **(b)** — não emendar a constituição por causa de um payload de produto.

```yaml
# resposta de pilar — frontmatter tipado; o corpo é livre (rationale), o plugin só importa o YAML
type: GENESIS_PILLAR
pillar: stack            # identity|stack|memory|agents|connectors|skills|routing|waves
mode: import             # import|cold-start
schema_version: 1
read_evidence:           # H1 — prova de leitura; vazio em cold-start (lá a evidência é a entrevista)
  - {path: "Cargo.toml", finding: "Rust 1.90, edition 2024"}
fields:
  languages: {value: ["rust"], provenance: repo, confidence: high}
  test_cmd:  {value: "cargo test", provenance: repo, confidence: high}
  deploy:    {value: "n/d", provenance: none}     # não achou = n/d, NUNCA palpite
open_questions: ["deploy não está no repo — perguntar ao usuário"]
```

Validação no plugin (L0, $0): schema por pilar · `n/d` aceito, palpite sem provenance rejeitado ·
campo REPO sem `read_evidence` → volta como 🟡 "sem prova". O genesis-state guarda
`{value, source, verified_at, proof}` por campo — **mesmo contrato do setup-state.json do Radar**.

---

## 3 · A MECÂNICA (E1 — decisão) — conector é o herói, paste é o fallback (H2)

O transporte é **MCP — que é agnóstico por natureza** (Claude Desktop/Cowork, Codex CLI e Gemini CLI
falam MCP; verificado web §8). O conector NÃO é "do Claude": é o conector do CÉREBRO, seja ele qual for.

| Nível | Caminho | Quando | Experiência |
|---|---|---|---|
| **A · Conector (herói)** | MCP server do Mooter (~20 tools já existem) + 2 tools novas: `mooter_genesis_state` (ler pilar+prompt) · `mooter_genesis_submit` (devolver payload) | cérebro com MCP (Claude via **.mcpb 1-clique** — formato oficial, verificado hoje; Codex/Gemini via config) | usuário clica "Conectar cérebro" → o cérebro lê a entrevista, lê o projeto, devolve o payload DIRETO. Zero copy-paste |
| **B · File-contract** | cérebro repo-native (CC/Codex NA pasta) escreve `.mooter/genesis/<pillar>.yaml`; plugin observa e importa | brain já trabalha dentro do repo | 1 comando no cérebro; determinístico, $0, offline |
| **C · Paste (fallback universal)** | plugin mostra o prompt [Copiar] · caixa "Colar resposta" valida o frontmatter na hora | qualquer LLM, até web chat | a ponte R4 original — funciona sempre, nunca é vendida como a experiência |

Regras: a UI apresenta SEMPRE o nível A primeiro; C aparece como "ou copie manualmente" discreto.
Privacidade: transporte local-only (nada sai da máquina — doutrina existente). A superfície mínima de
tools do conector (decisão §3 do onboarding handoff) ganha as 2 tools genesis acima — o resto
(`mooter_status/radar/handoff_read/write/waves/receipts`) permanece como pré-analisado lá. ⛔ decisão Paulo.

---

## 4 · VALIDAÇÃO E1.5 — a forma universal confrontada com um projeto real NÃO-Mooter

**Método:** clone real de `sharkdp/fd` v10.4.2 (Rust CLI, 36k★, zero TS/Node, zero agentic) feito hoje;
os 8 pilares confrontados contra os ficheiros reais do repo. Veredicto: **a forma generaliza — como
ALVO DE MAPEAMENTO, não como cópia de ficheiros.** Achados:

| # | Achado (evidência real) | Consequência no design |
|---|---|---|
| 1 | Identidade/Stack 100% deriváveis: `Cargo.toml` (missão 1-linha, Rust 1.90/edition 2024, MSRV), `src/` mapeável módulo-a-módulo (cli, walk, filter, exec…), `cargo test` | ⭐AHA funciona em stack não-TS — o coração do Genesis viaja |
| 2 | Invariantes existem mas de OUTRA natureza: MSRV pinado, dual-license MIT/Apache, manpage `doc/fd.1` sincronizada, changelog obrigatório no PR | o slot "invariantes" é universal; o CONTEÚDO é da stack (H3 confirmado — prompt pede "o que nunca quebra AQUI", nunca exemplos Mooter) |
| 3 | **`CONTRIBUTING.md` do fd impõe política de uso de AI** (PR gerado por IA deve ser declarado; comunicação com maintainer deve ser humana) | pilar 🤖 Agentes ganha campo novo: `repo_constraints` — o repo pode LEGISLAR sobre agentes; importar antes de configurar papéis |
| 4 | O repo JÁ TEM equivalentes parciais: CHANGELOG≈memória histórica · `doc/release-checklist.md`≈metodologia de wave · SECURITY.md | **scaffold-by-mapping**: nunca criar ficheiro que duplique um existente (2ª verdade!). AGENTS.md gerado REFERENCIA CONTRIBUTING/CHANGELOG; SYNC.md entra como valor NOVO (não existe equivalente — é o gap real que o Mooter preenche) |
| 5 | Pilares 🪄 Routing/GPU e 🔌 Conectores: **zero informação no repo** — são da máquina/usuário | provenance por campo (§2.1) — sem isso o cérebro inventaria respostas "lendo" um repo que não as contém |

**Onde NÃO generaliza (honesto):** vault `00-core` (identidade cross-projeto) é opcional por design —
num projeto solo-OSS como o fd não existe equivalente e o contrato funciona sem ele; e `_handoff/templates`
só fazem sentido quando há multi-agente (cold-start de usuário 1-agente: scaffold adiado até o pilar
🤖 declarar >1 agente — topologia build≠produto do Project Zero §4 respeitada).

---

## 5 · UX/UI DA ABA GENESIS (E3) — value-first, anti-Roo, uma ação por vez

Superfície: aba do plugin VS Code (⚠️ correção F0: vscode-elements NÃO está instalado — a alegação de
REUSE era falsa; a UI reusa os padrões de webview já existentes no próprio plugin, `src/extension.js`;
adotar lib UI nova = fora do GUARD).
Anti-Roo por construção: **nunca grade de 17 abas; a tela mostra UMA ação primária por vez.**

```
┌─ 🌱 GENESIS ────────────────────────────────────────────────┐
│ [detectado: projeto Rust · git · sem fundação agêntica]     │  ← FASE 0, detect-don't-ask
│                                                             │
│ ⭐ FASE 1 — dá vida ao projeto (2 passos, ~3 min)           │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ 🧠+🏗️ Identidade & Stack                            │     │
│ │ 14 campos já detectados ✓ · faltam 6                │     │
│ │ ▶ [ Entrevistar meu cérebro ]                       │     │  ← ação primária ÚNICA
│ │    conector detectado: ● Claude Desktop (1-clique)  │     │  ← herói (A)
│ │    sem conector? copiar prompt ▸                    │     │  ← fallback (C), discreto
│ └─────────────────────────────────────────────────────┘     │
│ (pilares da Fase 2 ficam COLAPSADOS até a Fase 1 fechar)    │
│                                                             │
│ estado por pilar: 🔴 vazio · 🟡 parcial/sem prova · 🟢 com  │
│ prova (doctor/Radar) — verde NUNCA sem proof                │
│ toda escrita em ficheiro: DIFF antes de aplicar             │
│ [pular esta etapa — o Mooter assume defaults revisáveis]    │  ← escape hatch, sempre
└─────────────────────────────────────────────────────────────┘
FASE 1 fecha → o momento AHA ocupa a tela:
│ ✨ fundação criada (AGENTS.md · CLAUDE.md · SYNC.md — ver diff)
│ ▶ [ Rodar meu primeiro prompt com recibo ]   ← o TTFV acontece AQUI
│    → recibo real: "roteado local · $0 · 47ms · skill X injetada"
FASE 2 (aparece só depois): lista vertical dos pilares restantes, o próximo sugerido
aberto, resto colapsado; cada 🟢 mostra O QUE desbloqueou ("mesh ligada", "waves visíveis").
```

Regras herdadas que são spec (não inspiração): máx 3 inputs manuais na 1ª sessão (EMENDA E1) ·
alerta por exceção, não por lista (lição W15) · wow só quando é prova, zero confete (playbook §2) ·
recibo em toda troca. **Import**: campos pré-preenchidos aparecem como "confirmar" (1 clique), nunca
re-perguntados. **Cold-start**: mesma tela; a entrevista do cérebro vira entrevista AO usuário (o
prompt gerado instrui o cérebro a perguntar, uma pergunta por vez, e preencher o contrato).

---

## 6 · Onde cada requisito/medo aterra (nada se perde)

R1/R5→§1.1+§2 (import mapeia Claude/Codex/Gemini/.roo) · R3/R6→FASE 0 probe+§2.2 (MACHINE) ·
R4→§3 nível C · R7→botões operados pelas skills do `MOOTER_SKILLS_MAP` (o botão "Entrevistar"
usa `moo-masterprompt`; a validação de payload é prima do `moo-handoff-check`) · R8→council roda
no payload antes do import (open_questions) · R9→pilar 🌊 alimenta a aba Waves · R2/R10/R11→motor,
fora do Genesis (classes A do Project Zero) · R12→web do dia feita (§8) · H1→read-first+read_evidence ·
H2→§3 · H3→prompts stack-aware (§2, E2) · H4→§1.1 · 3 medos→FASE 1 termina em recibo (custo),
FASE 3 em Morning Brief (cegueira), todo scaffold com diff+revisável (irreversibilidade).

## 7 · Gate de aceite + o que NUNCA fazer

**Gate mensurável:** TTFV ≤10min no TESTE DO AMIGO — 5 pessoas, stacks diferentes (mín. 1 greenfield,
1 não-Claude), sozinhas, saem operando, voltam no dia 2. Primeiro valor ≤3min no caminho feliz.
"UX perfeita" não é gate (não-verificável — lição D1-h8).

❌ formulário como jornada (a entrevista é do cérebro) · ❌ prompt de memória (read-first sempre) ·
❌ paste como herói · ❌ best-practice Mooter imposta a outra stack · ❌ só import (cold-start é
obrigatório) · ❌ >8 pilares · ❌ pilar verde sem prova · ❌ scaffold que duplica ficheiro existente
(2ª verdade) · ❌ segredos em payload (refs, nunca valores) · ❌ expor a orquestração de 3 agentes ao
usuário-1-agente.

## 8 · Fontes (web do dia 2026-07-17)

AGENTS.md padrão aberto: agents.md · spec-driven/interview-mode 2026: guias BCMS/DEV correntes ·
conector 1-clique: formato .mcpb oficial (modelcontextprotocol/mcpb + Anthropic engineering) ·
TTFV/ativação como métrica-mãe de onboarding 2026: benchmarks SaaS correntes (Userpilot etc.) ·
Roo Code ≥3.47 (fev/2026, changelog ativo) — benchmark de fricção reconfirmado · SkillsBench/Vercel
evals: já citados com números em `MOOTER_PROJECT_ZERO_BLUEPRINT.md` §1 (não re-copiados — 1 verdade).

---
🔍 council 8/8 · objeção mais forte: "o pipeline pilar-N→N+1 cria estado no plugin que pode divergir
dos ficheiros escritos (2ª verdade de estado)" · resolvida: genesis-state é PROJEÇÃO de eventos-genesis
no Ledger (mesmo padrão Ledger→projeção da F1); os ficheiros são a verdade, o estado é derivado, e o
pointer-sentinel/projection-drift da Mesh vigiam a divergência.
CCA: 4/5 ✓ (arquitetura declarada · zero tool inventada · config via fontes versionadas · refs
path:linha, n/d onde não verificado · ⚠️ pilar "mensagem tipada P4" rebaixado: relação payload↔P4
em decisão STOP-1, ver §2.4)
