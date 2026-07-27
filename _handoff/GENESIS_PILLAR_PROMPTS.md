# 🌱 GENESIS PILLAR PROMPTS — biblioteca dos masterprompts-por-pilar (E2)

> Cowork · 2026-07-17 · Casa: `_handoff/` (na wave E4 estes textos viram templates DE DADOS do plugin,
> ex.: `packages/vscode-extension/assets/genesis/*.md` — `resources/` não existe; `assets/` é a casa
> estabelecida de .md empacotado, correção F0 2026-07-17). Consumidor: o
> GERADOR do plugin, que substitui `{{placeholders}}` com o que o probe detectou e o pipeline acumulou.
> Regras-mãe: agnóstico de LLM (zero "Claude") · read-first (H1) · stack-aware (H3) · dois modos (H4) ·
> resposta = frontmatter tipado §2.4 da `docs/strategy/MOOTER_GENESIS_SPEC.md` (⚠️ relação com o P4
> em decisão STOP-1 — ver a nota do §2.4; a alegação antiga "instância P4" contradizia os 4 tipos).

## 0 · MOLDURA COMUM (prefixo de TODO prompt gerado — o plugin injeta uma vez)

```text
Você é o cérebro deste projeto: {{project_path}}. O Mooter (plugin local que organiza a fundação
agêntica do projeto) precisa da sua ajuda para preencher UM pilar da fundação. Modo: {{MODE}}.

REGRAS INEGOCIÁVEIS
1. [modo IMPORT] LEIA os ficheiros reais listados abaixo ANTES de responder. Responda SOMENTE com o
   que leu. O que não encontrar = "n/d" — NUNCA responda de memória, NUNCA chute.
   [modo COLD-START] Este projeto ainda não tem ficheiros. Sua fonte é o USUÁRIO: faça as perguntas
   abaixo A ELE, UMA de cada vez, adaptando cada pergunta à resposta anterior. Não invente por ele;
   o que ele não souber = "n/d" + defaults sugeridos marcados como sugestão.
2. Cada campo da resposta declara provenance: repo (leu no ficheiro X) · user (o usuário disse) ·
   n/d. Campo repo exige read_evidence {path, finding}.
3. Segredos: NUNCA valores (keys/tokens) — apenas referências ("ANTHROPIC_API_KEY em .env").
4. Best practices: os princípios abaixo são gerais; ADAPTE à stack real que você encontrou/que o
   usuário descreveu. Não imponha convenções de outra stack.
5. Formato de resposta: SOMENTE o bloco YAML do contrato ao final + rationale curto antes dele.
   {{RETURN_INSTRUCTION}}   ← A: "envie via tool mooter_genesis_submit" | B: "escreva em
                               .mooter/genesis/{{pillar}}.yaml" | C: "devolva no chat p/ colar"

CONTEXTO JÁ CONFIRMADO (não re-perguntar; use para afinar as perguntas):
{{pipeline_context}}        ← acumulado dos pilares anteriores (o pipeline N→N+1)
JÁ DETECTADO PELA MÁQUINA (confirme apenas se contradito pelo que ler):
{{probe_findings}}
```

---

## 1 · 🧠 IDENTIDADE ⭐AHA

```text
PILAR: identidade — a alma do projeto (alimenta AGENTS.md §overview, CLAUDE.md header).
[IMPORT] Leia: README* · manifesto do projeto ({{manifest_hint}}: package.json/Cargo.toml/go.mod/
pyproject/pubspec…) · CONTRIBUTING* · docs de visão se existirem ({{detected_docs}}).
[COLD-START] Entreviste: o que você quer construir? para quem? por que você (e não o mercado)?
RESPONDA/PERGUNTE: missão em 1 linha · o que o projeto É (2 linhas) · quem é o "brain" (a pessoa:
papel, o que só ela decide) · a tese/aposta central · voz e tom da comunicação do projeto · valores
não-negociáveis (o que este projeto NUNCA faz).
BEST-PRACTICE (princípio, adapte): a missão de 1 linha vira a régua de toda decisão futura dos
agentes; valores viram invariantes de comportamento. Vago aqui = agentes sem critério depois.
CONTRATO fields: mission_1line · what_it_is · brain{name, role, decides} · thesis · voice ·
non_negotiables[] (+ provenance cada um).
```

## 2 · 🏗️ STACK & ARQUITETURA ⭐AHA

```text
PILAR: stack — o corpo do projeto (alimenta AGENTS.md §architecture/§invariants/§tests, INFRA.md).
[IMPORT] Leia: manifests ({{manifest_files}}) · árvore de {{src_dirs}} · configs de CI
({{ci_files}}) · Makefile/justfile/scripts · configs de deploy que encontrar · lockfiles (só versões).
[COLD-START] Entreviste: em que linguagem/stack pensa construir? (se não souber: proponha 2 opções
adequadas ao objetivo do pilar Identidade, com trade-offs em 1 linha cada) · onde vai rodar?
RESPONDA/PERGUNTE: linguagens+versões mínimas · frameworks · mapa de módulos (1 linha por diretório
de src) · como se roda os testes (comando exato) · como se builda/deploya · endpoints/serviços ·
INVARIANTES DUROS: o que NUNCA pode quebrar aqui (ficheiros que não se tocam, versões pinadas, regras
de licença, artefatos gerados que não se commitam, docs que têm de andar juntas — ex. real: um projeto
Rust pinando MSRV e exigindo changelog por PR; descubra os DESTE projeto, não copie o exemplo).
BEST-PRACTICE (princípio, adapte): invariante explícito = a única proteção real contra agente
entusiasmado; comando de teste exato = o gate mecânico mais barato que existe.
CONTRATO fields: languages[] · frameworks[] · module_map[{path, purpose_1line}] · test_cmd ·
build_cmd · deploy{how, where} · invariants[] · endpoints[] (+ provenance/read_evidence).
```

## 3 · 🗂️ MEMÓRIA & FICHEIROS

```text
PILAR: memória — o projeto lembra (alimenta SYNC.md, MEMORY.md, LOOP.md, AGENTS §info-architecture).
[IMPORT] Leia: CHANGELOG* · docs/ (títulos + 1º parágrafo) · wikis/ADRs se existirem · issues/PR
templates · qualquer SYNC/MEMORY/estado já existente ({{detected_state_files}}).
⚠️ MAPEIE ANTES DE CRIAR: se o projeto JÁ registra decisões/história em algum ficheiro (ex.:
CHANGELOG, ADRs), o novo mapa REFERENCIA esses ficheiros como canônicos — nunca proponha duplicá-los.
[COLD-START] Entreviste: onde você guarda hoje suas notas/decisões (Notion? Obsidian? cabeça?) ·
o que você odiaria ter que re-explicar a um agente toda sessão?
RESPONDA/PERGUNTE: onde-vive-o-quê (tabela: tipo de conteúdo → ficheiro/lugar → quando morre) ·
snapshot do estado ATUAL do projeto (5-10 linhas honestas — vira o 1º SYNC.md) · decisões duráveis
já tomadas, datadas (viram o 1º MEMORY.md) · aprendizados em aberto (viram o 1º LOOP.md).
BEST-PRACTICE (princípio): snapshot ≠ log (estado atual curto; histórico arquiva) · decisão durável
separada de nota do dia · 1 assunto = 1 casa (2ª verdade é o inimigo).
CONTRATO fields: where_lives[{content_type, home, lifecycle}] · current_state_snapshot ·
durable_decisions[{date, decision}] · open_learnings[] · existing_equivalents[{file, role}].
```

## 4 · 🤖 AGENTES & PAPÉIS

```text
PILAR: agentes — quem trabalha aqui (alimenta AGENTS §comm-protocol/§boot).
[IMPORT] Leia: CLAUDE.md/AGENTS.md/GEMINI.md/.roo/.cursor existentes ({{detected_agent_files}}) ·
CONTRIBUTING* (⚠️ procure POLÍTICAS SOBRE AI/agentes — muitos projetos legislam sobre PRs gerados
por IA; isso vira restrição importada, campo repo_constraints).
[COLD-START] Entreviste: que ferramentas de AI você usa/paga hoje? · trabalha só ou em equipe? ·
o que um agente JAMAIS pode fazer sem você aprovar?
RESPONDA/PERGUNTE: que LLMs/agentes operam o projeto · papéis (quem arquiteta/implementa/revisa —
se for 1 agente só, diga; não invente orquestra) · ordem de boot (o que todo agente lê primeiro) ·
GATES HUMANOS (ações que exigem o humano: push? merge? deploy? delete?) · restrições que o próprio
repo impõe a agentes (repo_constraints).
BEST-PRACTICE (princípio): gates humanos explícitos são o que torna agente confiável; 1 agente +
malha por baixo é topologia válida e comum — multi-agente é exceção, não meta.
CONTRATO fields: agents[{name, role}] · boot_order[] · human_gates[] · repo_constraints[] ·
tier_ladder (se aplicável, senão n/d).
```

## 5 · 🔌 CONECTORES (◐ quase tudo MACHINE — entrevista mínima)

```text
PILAR: conectores — o que o projeto toca (alimenta INFRA §MCP, setup-state).
O probe já detectou: {{probe_connectors}} (MCP servers, remotes git, configs de serviços).
[IMPORT] Leia apenas o que o probe NÃO alcança: INFRA/README §serviços · .env.example (NUNCA .env).
[COLD-START] Entreviste só: que serviços externos o projeto vai usar (repo host, deploy, DB, notas)?
RESPONDA/PERGUNTE: confirmar/corrigir a lista detectada · para cada conector: path/workspace-ID ·
método de auth como REFERÊNCIA ("token em X"), NUNCA o valor.
CONTRATO fields: connectors[{name, kind, path_or_id, auth_ref}] · confirmed_probe: true|false.
```

## 6 · 🛠️ SKILLS & PACKS

```text
PILAR: skills — o que o projeto sabe fazer de forma procedural (alimenta .claude/skills ou equivalente).
[IMPORT] Leia: .claude/skills/ ou equivalente da ferramenta detectada ({{detected_skills_dirs}}) ·
os gotchas recorrentes que encontrou nos pilares anteriores (CONTEXTO CONFIRMADO).
[COLD-START] Pergunte: que tarefa repetitiva você já sabe que vai existir neste projeto?
RESPONDA/PERGUNTE: skills/procedimentos que JÁ existem · GAPS: no máximo 2-3 skills que valem a pena
PARA ESTA STACK — critério duro (evidência SkillsBench, não opinião): procedural + coisa que um LLM
não sabe de fábrica + previne erro real deste projeto. O que o modelo já sabe de fábrica NÃO vira
skill — vira 1 linha no AGENTS.md (canal passivo, mais barato e mais eficaz).
⚠️ NÃO sugira "gerar skills do codebase inteiro" (evidência pública: piora o desempenho).
CONTRATO fields: existing_skills[] · proposed_skills[{name, prevents_what, why_not_passive}] (máx 3) ·
goes_to_agents_md[] (o excedente, como doutrina passiva).
```

## 7 · 🪄 ROUTING & GPU (❌ sem entrevista — confirmação de probe)

```text
Sem prompt ao cérebro: o probe local resolve (hardware, VRAM, Ollama+modelos, subscriptions por key).
A UI mostra os cards detectados com [confirmar] · [corrigir]. Único input eventual: effort default
(as 3 personas existentes) — default sugerido pelo hw_tier. Alimenta CLAUDE §tier-ladder +
preferences.json. Campo sem probe = cinza no Radar, nunca inventado.
```

## 8 · 🌊 WAVES & FLUXO

```text
PILAR: waves — como o trabalho flui (alimenta strategy/ROADMAP, _handoff ou equivalente).
[IMPORT] Leia: issues/PRs abertos (títulos) · TODO/ROADMAP* · checklists de release
({{detected_workflow_files}} — ex.: um release-checklist existente JÁ É a metodologia de wave deste
projeto; importe-a como canônica, não substitua) · branches ativas (nomes).
[COLD-START] Entreviste: como você gosta de trabalhar (sprints? ondas? contínuo?) · qual o primeiro
marco que faria você comemorar?
RESPONDA/PERGUNTE: metodologia real de organização do trabalho · o que está EM CURSO agora (com
evidência: branch/PR/issue) · próximos 1-3 marcos · onde os handoffs/planos devem viver.
CONTRATO fields: methodology · in_flight[{what, evidence}] · next_milestones[] (máx 3) ·
handoff_home · existing_workflow_files[].
```

---

## 9 · Regras do GERADOR (o que o plugin faz com estes textos)

1. Substitui `{{placeholders}}` com probe+pipeline; remove o bloco do modo não-ativo.
2. `{{manifest_hint}}`/`{{ci_files}}` etc. vêm da detecção de stack (stack-aware por injeção — o
   texto-base nunca hardcoda stack).
3. Ordem: pilar N+1 só é oferecido com N importado (pipeline); pular = evento skip no genesis-state.
4. Payload recebido passa a validação L0 (§2.4 da spec) ANTES de qualquer escrita; escrita em
   ficheiro SEMPRE mostra diff.
5. Todo prompt gerado termina com o retorno do nível ativo (A tool · B ficheiro · C paste).

---
🔍 council 8/8 · objeção mais forte: "8 textos-base = 8 superfícies para envelhecer quando o contrato
mudar" · resolvida: os fields de cada contrato vivem num schema único versionado (schema_version no
payload); os textos referenciam o schema, e o doc-drift da Mesh vigia divergência texto↔schema.
CCA: 5/5 ✓
