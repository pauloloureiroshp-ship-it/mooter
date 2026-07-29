# 🐮 MOOTER_SKILLS_MAP — inventário · gaps · top-5 specs · interno vs publicável

> Cowork · 2026-07-17 · Tipo: DESIGN (E1+E2+E3+E4 do `_handoff/MOOTER_SKILLS_DISTILLATION_MASTERPROMPT.md`)
> ⛔ STOP: revisão Paulo/Cowork antes de QUALQUER implementação. Design-only — zero código nesta rodada,
> zero colisão com Fleet/Mesh/#255 em voo. Casa: `_handoff/` → arquivar quando a wave E4 shipar.

## 0. BOOT executado (fontes confrontadas, na ordem)

vault `40-strategy/mooter-agentic-os-playbook` §1+§5+§8 · vault `40-strategy/mooter-prioridades-2026-07-16`
(+ adendo LoRA + adendo Gemini 07-17) · `_handoff/MOO_LINGUA_FRANCA_MASTERPROMPT.md` P0–P6 ·
**PR #255 lido dos refs git** (`chore/moo-lingua-franca`, 4 commits e080035→e74a93d: AGENT_CONTEXT_PROTOCOL
§Lingua Franca v1 completo + AGENTS.md §Pre-Dispatch Red-Team Gate + 4 templates + 5 fixtures cd89b89c) ·
`_handoff/MOO_HARMONY_MESH_BLUEPRINT.md` §1.8+§3 · vault `00-core/protocolo-comunicacao.md` +
`00-core/onde-vive-o-que.md` · `tools/handoff-preflight.js` (521 linhas working tree; 1104 no #255) ·
`.claude/skills/` (21 confirmadas) + `packs/` (**10 com `pack.yaml`, não 9** — masterprompt corrigido pela
contagem real: animation-web, caveman, code-audit, code-graph, data-spreadsheet, diagram-systems,
knowledge-third-brain, obsidian-vault-sync, prd-strategy, voice-tts).

---

## 1. INVENTÁRIO (E1a) — 21 skills confrontadas vs 5 experiências

| Skill | Experiência | Veredicto 2026-07-17 |
|---|---|---|
| `moo-verify` | Review | ✅ a mais forte — crítico L0 determinístico $0; dependência natural das novas |
| `final-reviewer-honest` | Review | ✅ sólida — gate T3 pré-merge; é o "council de código" |
| `local-first-default` | Route | ✅ alinhada à doutrina GPU-turbo |
| `mooter` · `routing-decision-explain` | Route/Watch | ✅ ok — interfaces do motor |
| `pricing-correto-2026` | honest-copy | ✅ canônica — o modelo "skill = fonte única" a imitar |
| `moo-status` · `moo-herd` · `moo-dashboard` · `moo-agents` | Watch | ✅ ok — telemetria |
| `moo-workflow` | Route/exec | ✅ ok |
| `mooter-update` | 🛠 manutenção | ✅ ok |
| `moo-pack` · `moo-memory` · `moo-init` | meta/Resume/setup | ✅ ok; `moo-init` será estendido pela Mesh fase C (auto-setup), não por esta wave |
| `agent-sync` | Watch/comunicação | 🟡 pré-LF — usa briefs do ledger mas não os 4 tipos/budgets/rodapés; refresh pós-#255 (a mais próxima do domínio novo) |
| `wave-brief-compose` | Plan | ⚠️ pré-LF — house style próprio, ignora `MASTERPROMPT.template.md`, sem ♻️ REUSE nem rodapé council → **absorvida por `moo-masterprompt` (E4)** |
| `moo-effort` | Route | ⚠️ colisão futura de nome — modos low/default/high/ultramoo são o eixo POR-SESSÃO (mode-registry); o dial GPU LazyMoo/Moo/CrazyMoo é GLOBAL (blueprint §1.6). Disambiguação pertence à wave Mesh, não a esta |
| `moo-help` | meta | ⚠️ carrega tagline superseded "your LLM router. Learns forever" (playbook vault §5: 1 dos 4 sítios com slogan antigo; claim menos provada) → wave "Uma Verdade" (P1-6), não esta |
| `moo-distill` + `pastor-distill` | distribuição | ⚠️ redundantes — ambas embrulham `mooter pastor distill` → fundir (manter `pastor-distill`); housekeeping da F4, não desta wave |

**Packs (10):** domínio de prompt do axis-2 (`classify_domain`) — nenhum cobre comunicação entre agentes.
Confirma o ♻️ interno do #255 ("No matching protocol pack exists in `packs/`").
**Skills Cowork do Paulo:** `sync-project` (Resume manual entre superfícies) · `notion-to-vault` ·
`morning` — cobrem Resume/registro parcialmente; nenhuma emite/avalia mensagem tipada.

**Cobertura por experiência:** Route forte (5 skills) · Watch forte em telemetria · Review forte em
CÓDIGO (`moo-verify`, `final-reviewer-honest`) · Plan fraco (1 skill pré-LF) · Resume fraco (Mesh
prebake, não skill). **Gap estrutural: as 21 são interfaces do MOTOR. Zero skills cobrem o modelo de
operação multi-agente que o ciclo 16–17/07 provou à mão — e o canon (#255) já existe para ser apontado.**

---

## 2. MAPA DE GAPS (E1b) — a tabela-hipótese confrontada com a evidência real

| Padrão manual do ciclo | Evidência real (a fixture) | Veredicto |
|---|---|---|
| Handoff tipado + preflight + rodapés | handoff escrito 3× antes de acertar (`tools/handoff-preflight.js:8-14`); preflight existe e ninguém tem skill que o dispare | ✅ **`moo-handoff`** — top-5 |
| Avaliar handoff (scorecard 9.3/10) | scorecard feito à mão pelo Cowork (blueprint §3:164); rodapé `council 8/8` assinado com canon inalcançável foi pego (`handoff-preflight.js:252-255`); **Gemini FABRICOU prova de escrita no ledger 07-17** (prioridades:92-97) → teste de admissão + red-flag "id hex sequencial bonito" | ✅ **`moo-handoff-check`** — top-5, reforçada |
| Council 8 perguntas + anti-sycophancy | canonizado no #255 (`AGENTS.md` §Pre-Dispatch Red-Team Gate); preflight só valida PRESENÇA do rodapé — rodar o gate continua manual | ✅ **`moo-council`** — top-5 |
| Composição de masterprompt | ≥6 masterprompts compostos à mão neste ciclo; template existe no #255 mas preencher GUARD/GATE/allowlist/REUSE é artesanato; `wave-brief-compose` é a versão pré-LF | ✅ **`moo-masterprompt`** — top-5 (absorve wave-brief-compose) |
| Decision contract tipado | DECISION HANDOFF cd89b89c (fixture do #255); 9 perguntas transcritas à mão por modelo cloud quando `extractQA()` já recupera verbatim $0 (`handoff-preflight.js:293-368`) | ✅ **`moo-decision`** — top-5 |
| Regra de despacho 📮 | vault `00-core/protocolo-comunicacao.md:53-64` (feedback Paulo: paste sem destino = handoff incompleto) | 🔀 **absorvida como regra obrigatória nos emissores** (`moo-masterprompt` + `moo-decision` terminam com `📮 DESTINO`) — não é workflow, é rodapé; skill própria seria a 6ª (teto 5) |
| Gatilhos de registro (vault/Notion/memória) | vault `00-core/onde-vive-o-que.md:46-60` (canonizado 07-17) | ❄️ **cortada desta rodada** — a própria tabela canônica já a destina a job L1 da Mesh fase B (cronista-pillar); consumidor é só o Cowork; alavanca < top-5 |
| Review-no-STOP (FC-8, diff crítico) | regra FC-8 já É canon (#255 §c: consumidor sem acesso → handoff inclui diff); confronto de rebase independente (playbook §3) | ❄️ **cortada como skill própria** — a metade "verificar claims linha a linha" entra no `moo-handoff-check`; a metade código já é `final-reviewer-honest` |

Nenhuma 8ª skill inventada. Achado novo (Gemini 07-17) não vira skill — vira seção de red-flags do
`moo-handoff-check`, exatamente como o adendo do vault pede.

---

## 3. SPECS DAS TOP-5 (E2) — skill = INTERFACE que aponta pro canon, nunca cópia

Formato comum às 5: SKILL.md ≤60 linhas · frontmatter `name`+`description` (padrão Agent Skills) ·
zero conteúdo do protocolo duplicado — só `path:linha` para o canon pós-#255. Medição: os checks
determinísticos são testáveis JÁ (fixtures + `handoff-preflight.test.js`, 513 linhas no #255);
score MooterBench local = **n/d — fase B ainda não mede skills; quando medir, as fixtures já servem**.

### 3.1 `moo-handoff` — emitir handoff perfeito
| Campo | Spec |
|---|---|
| Trigger | "handoff", "passar estado", "fechar sessão", "emitir HANDOFF", fim de wave/STOP — quando um executor precisa reportar estado real a um brain |
| Passos | 1. `node tools/handoff-preflight.js --out <f>` (esqueleto mecânico, 90% $0) → 2. preencher SÓ os `<<TODO>>` de julgamento (GOAL/INTENT/A ÚNICA COISA/DECISIONS/PENDING/RISK) → 3. `--qa` para DECISIONS verbatim → 4. rodapés `CCA: n/5` honesto + council via `moo-council` → 5. `--lint` no ficheiro emitido → 6. budget ≤4k: cortar prosa, nunca evidência |
| Referencia | `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` §LF v1(b)(c) · `docs/strategy/PERFECT_HANDOFF_SPEC.md:64-148` · `_handoff/templates/HANDOFF.template.md` |
| Fixtures | `_handoff/templates/fixtures/cd89b89c606a7a20.HANDOFF.md` + handoffs reais do ciclo (ex.: `FLEET_FASE3_LAUNCH_HANDOFF.md`) |
| Medida | preflight `--check` + `--lint` verdes (determinístico, já testável) · MooterBench n/d |
| Deps | `tools/handoff-preflight.js` · `moo-council` |

### 3.2 `moo-handoff-check` — avaliar handoff recebido (o scorecard que era heroísmo)
| Campo | Spec |
|---|---|
| Trigger | "avalia este handoff", "confere o que o executor mandou", chegada de HANDOFF/BRIEF de outro agente, teste de admissão de agente novo (caso Gemini) |
| Passos | 1. `--lint` (campos, rodapés, budget — L0) → 2. **confront-before-accept**: cada claim verificável reproduzida contra git/fs/testes (nunca aceitar a palavra do executor — regra do rebase, playbook §3) → 3. red-flags de fabricação: id hex "bonito" sequencial, prova não-reproduzível, print sem comando, teste "verde de memória" → 4. rubrica 10 pontos (a do scorecard 9.3/10) com nota por campo → 5. veredicto ACEITO / ACEITO-COM-FLAGS / DEVOLVIDO com objeções concretas |
| Referencia | protocolo §LF v1(c) truth rules · `AGENTS.md` §Communication protocol · `handoff-preflight.js:228-258` (lint) |
| Fixtures | positivas: fixtures cd89b89c · negativa: o caso Gemini 07-17 (transcrever sanitizado do adendo do vault — hoje n/d no repo) |
| Medida | % de claims verificadas mecanicamente (determinístico) · MooterBench n/d |
| Deps | `moo-council` (anti-sycophancy) · `moo-verify` (quando o claim é "testes verdes") |

### 3.3 `moo-masterprompt` — compor masterprompt no template, com REUSE e council
| Campo | Spec |
|---|---|
| Trigger | "masterprompt para…", "prepara a wave", "compõe o brief da wave", brain despachando trabalho a executor |
| Passos | 1. carregar `_handoff/templates/MASTERPROMPT.template.md` → 2. GUARD sempre com: classify.js frozen sha + allowlist EXATA de ficheiros + git add seletivo + sem .md na raiz → 3. ♻️ REUSE: responder as 3 perguntas com busca real (skills internas/packs · npm+GitHub citando achados · `_handoff/_archive/`+`MEMORY.md`) → 4. GATE mecânico + ⛔ STOPs nomeados → 5. rodapé council via `moo-council` → 6. rodapé `📮 DESTINO: <agente> · sessão <FRESCA na pasta X | EXISTENTE "título">` (regra de despacho — obrigatório) → 7. budget ≤8k |
| Referencia | protocolo §LF v1(b)(d) · template + fixture MASTERPROMPT · vault `00-core/protocolo-comunicacao.md:53-64` (despacho) · house style herdado: `wave-brief-compose` (Day-0 recon que REFUTA premissas — manter, é o que o template não tem) |
| Fixtures | `cd89b89c606a7a20.MASTERPROMPT.md` + este próprio ciclo (LF, MESH, SKILLS_DISTILLATION) |
| Medida | template-conformance + presença dos 3 REUSE + budget (determinístico) · MooterBench n/d |
| Deps | `moo-council` · futuro reuse-indexer da Mesh (até lá: grep manual, declarado) |

### 3.4 `moo-decision` — decision contract tipado a partir de handoff + respostas
| Campo | Spec |
|---|---|
| Trigger | "responde ao STOP", "fecha as decisões", brain convertendo respostas do Paulo em contrato executável |
| Passos | 1. extrair Q&A VERBATIM do transcript (`handoff-preflight.js extractQA` — zero LLM, zero transcrição à mão) → 2. tabela Decision/Verdict/Exact-change do template → 3. GUARD herdado do masterprompt de origem → 4. NEXT GATE explícito → 5. rodapé council + `📮 DESTINO` → 6. budget ≤2k |
| Referencia | template DECISION_CONTRACT + fixture · protocolo §LF v1(b) |
| Fixtures | `cd89b89c606a7a20.DECISION_CONTRACT.md` + os contratos reais das decisões Paulo 07-15/16 |
| Medida | conformance + budget (determinístico) · MooterBench n/d |
| Deps | `handoff-preflight.js` (extractQA) · `moo-council` |

### 3.5 `moo-council` — as 8 perguntas + anti-sycophancy (a dependência de todas)
| Campo | Spec |
|---|---|
| Trigger | antes de emitir MASTERPROMPT/DECISION CONTRACT/copy pública/canon/decisão arquitetural; chamada pelas outras 4 |
| Passos | 1. LER as 8 perguntas do canon (`AGENTS.md` §Pre-Dispatch Red-Team Gate — nunca hardcodar; canon ausente → assinar `n/d`, nunca `8/8`, regra `handoff-preflight.js:200-221`) → 2. responder as 8 com evidência concreta → 3. anti-sycophancy: produzir ≥1 objeção REAL ou declarar o que tentou refutar → 4. emitir rodapé `🔍 council n/8 · objeção mais forte: <X> · resolvida: <como>` |
| Referencia | `AGENTS.md` §Pre-Dispatch (pós-#255) · protocolo §Council pre-emit gate · espelho conceitual vault `00-core/reasoning-protocol.md` Axioma 4 |
| Fixtures | os rodapés council reais deste ciclo (incl. o caso "8/8 sem canon" que o lint pegou) |
| Medida | lint de presença/formato (já no preflight) · qualidade da objeção = julgamento, n/d mecânico |
| Deps | nenhuma (é a folha) — por isso implementa-se PRIMEIRO |

Ordem de implementação (dependências): `moo-council` → `moo-handoff` → `moo-handoff-check` →
`moo-masterprompt` → `moo-decision`.

---

## 4. INTERNO vs PUBLICÁVEL (E3) — recomendação fundamentada, decisão do Paulo

**Web do dia (2026-07-17), reconfirmado:**
- Agent Skills é standard aberto com governança própria (agentskills.io + github.com/agentskills/agentskills)
  e adoção massiva: Claude/Claude Code, **Cursor, GitHub Copilot, VS Code, Gemini CLI, OpenAI Codex,
  JetBrains Junie, Roo Code, Goose, OpenHands** e ~40 clients listados no showcase oficial.
- `anthropics/skills`: **Apache 2.0** (exceto document skills source-available), 149k★ — o formato é
  portável e a licença de referência do ecossistema.
- Marketplaces ativos e de barreira zero: **SkillsMP indexa 2,2M SKILL.md auto-descobertos de repos
  GitHub públicos** (publicar = repo público, sem submissão) · tonsofskills.com (2.810 skills) ·
  claudemarketplaces.com · agentskill.club.
- **O gap segue aberto — mas a janela está fechando.** Confrontados hoje os 2 vizinhos mais próximos:
  `open-gitagent/gitagent-protocol` (2.8k★, MIT, abril 2026) define IDENTIDADE de agente em git — zero
  mensagens tipadas/budgets/gates humanos; e `mattpocock/skills` **issue #306 (jun/2026) propõe
  exatamente "handoff verification discipline + resume protocol" — proposto, NÃO mergeado**. Ou seja:
  ninguém shipou o contrato (repo-native · 4 mensagens · verdade git · gate humano), mas a demanda já
  está articulada em público por terceiros. First-mover ainda disponível; não por muito tempo.

| Advogado do diabo | Ganha publicando | Perde/risco |
|---|---|---|
| Fosso | nada — o fosso é motor+GPU+custo afundado; metodologia publicada é marketing (tese §8) | pack público que divirja do produto confunde a marca |
| Distribuição | SkillsMP auto-indexa repo público = distribuição $0; autoridade "melhor prompt engineer" + funil mooter.ai | superfície de suporte/issues de terceiros para empresa de 1 |
| Honest-copy | metodologia demonstrável com fixtures reais | ❌ não pode publicar "9.3/10" (avaliação interna, não benchmark) nem "learns forever"; toda claim datada ou cortada |
| Canon | — | ⚠️ risco da 2ª verdade: as skills internas apontam para paths do repo Mooter; a versão publicável precisa de canon GENERALIZADO (os `00-core` do vault já são essa generalização cross-projeto) — é trabalho real, não um `cp` |

**Sanitização obrigatória antes de qualquer publicação (checklist):** zero paths pessoais
(`C:\Users\Paulo Loureiro`, `paulo-vault`, Notion HQ) · zero segredos/INFRA · zero claims não medidas
(scorecard vira "rubrica de 10 pontos", sem nota) · fixtures revisadas (cd89b89c contém contexto interno
do ciclo) · incidente Gemini anonimizado ("um agente externo fabricou prova") · preços NUNCA no pack
(defer à doutrina pricing) · refs a paths do repo Mooter substituídas por spec genérica embutida no pack.

**Licença:** recomendo **MIT** (consistência com o repo Mooter, já MIT) — alternativa defensável:
Apache 2.0 (alinha com `anthropics/skills` e traz patent grant). Sem urgência de decidir antes da wave 2.

**🔜 Recomendação (não decisão): duas ondas.**
**Onda 1 AGORA (E4): interno.** As 5 skills entram no repo pós-#255 como interfaces do canon — valor
imediato para CC/Codex/Cowork/Gemini-admissão, zero sanitização, zero superfície pública.
**Onda 2 DEPOIS (gate próprio): pack publicável `moo-protocol`** — só após (a) checklist de sanitização
acima integralmente aplicada, (b) canon generalizado sem paths Mooter, (c) 2+ semanas de uso interno
real das skills (fixtures de verdade, não teoria), (d) decisão de licença. O que se publica é a
metodologia (protocolo + skills + fixtures sanitizadas); o que NUNCA se publica é o motor.
A issue #306 do mattpocock é o relógio: se aquilo mergear com tração, o slot de "referência do handoff
verificado" fica ocupado.

---

## 5. E4 — MASTERPROMPT EXECUTÁVEL da wave de implementação (executa DEPOIS, pós-#255)

📮 DESTINO: Claude Code · sessão FRESCA em worktree `../frugal-moo-skills`

```markdown
# ⇄ COWORK → CC · MASTERPROMPT — WAVE MOO-SKILLS (top-5 do protocolo viram skills)
> Budget: ≤8k tokens · id: moo-skills-w1 · source: _handoff/MOOTER_SKILLS_MAP.md

🎯 GOAL   Implementar as 5 skills do §3 do MOOTER_SKILLS_MAP como INTERFACES finas (≤60 linhas
          cada) do canon Lingua Franca — nunca duplicando o protocolo.
📍 WHERE  worktree ../frugal-moo-skills · branch feat/moo-skills-pack · from origin/main.
⏱️ WHEN   SÓ depois do merge do PR #255. Gate de entrada obrigatório:
          grep -q "Lingua Franca v1" docs/agent-context/AGENT_CONTEXT_PROTOCOL.md || STOP.
▶ DO
  0. Ler: MOOTER_SKILLS_MAP §3 (as specs) · AGENT_CONTEXT_PROTOCOL §LF v1 · AGENTS.md
     §Pre-Dispatch Red-Team Gate · _handoff/templates/*.template.md + fixtures ·
     tools/handoff-preflight.js (API: --out/--qa/--lint/--check, extractQA, lintHandoff).
  1. Na ordem de dependência: moo-council → moo-handoff → moo-handoff-check →
     moo-masterprompt → moo-decision. Uma skill = um dir .claude/skills/<nome>/SKILL.md.
  2. Descriptions de trigger na metodologia skill-creator (otimizadas para disparo correto;
     PT-BR+EN nos gatilhos). Corpo: passos do §3, refs path:linha, zero cópia de canon.
  3. moo-masterprompt e moo-decision terminam SEMPRE com o rodapé 📮 DESTINO (regra de
     despacho — espelhar a regra por referência, fonte: AGENTS.md §Communication protocol).
  4. wave-brief-compose/SKILL.md: reduzir a ponteiro de deprecação → moo-masterprompt
     (preservando a seção Day-0 recon como herança citada lá).
  5. Validar: renderizar as 4 fixtures cd89b89c via as skills novas; handoff-preflight
     --lint verde nas saídas; --check verde.
🔒 GUARD  classify.js FROZEN (sha 427d8c0b…) · ALLOWLIST EXATA: .claude/skills/{moo-council,
          moo-handoff,moo-handoff-check,moo-masterprompt,moo-decision}/** (novos) +
          .claude/skills/wave-brief-compose/SKILL.md (edit único) — NADA mais; zero
          tools/**, zero packages/**, zero docs/** · git add seletivo · sem .md novos na
          raiz · PT-BR conversa / EN identifiers.
✅ GATE   docs-hygiene verde · 0 regressão nas suites existentes · fixtures lint-verdes ·
          final-reviewer-honest antes do commit (verdicto no report).
♻️ REUSE  (1) interno: tools/handoff-preflight.js + templates #255 — as skills SÓ orquestram;
          wave-brief-compose absorvida com crédito. (2) público: confrontado 2026-07-17 —
          gitagent-protocol=identidade, não mensagens; mattpocock/skills#306=proposto, não
          mergeado; nada serve → construir e registar. (3) waves: PERFECT_HANDOFF_SPEC +
          scaffold HANDOFF reusados por referência.
⛔ STOP   1. Diff das 5 SKILL.md antes do commit → Paulo. 2. Qualquer necessidade fora da
          allowlist. 3. Qualquer tentação de editar canon (#255) — reportar, não absorver.
⏭ NEXT   Onda 2 (gate próprio, decisão §4 pendente): pack publicável moo-protocol sanitizado.
📋 BACK   HANDOFF tipado ≤4k (template #255) com CCA: n/5 honesto + fixtures renderizadas.

🔍 council 8/8 · objeção mais forte: "5 skills novas = mais superfície de manutenção para
empresa de 1, antes do produto core" · resolvida: skill = interface ≤60 linhas; a lógica
vive no preflight já testado (513 linhas de teste no #255); custo marginal ~zero e cada uma
substitui heroísmo manual já pago 2× neste ciclo.
```

---

## O que este mapa NÃO faz (guard do masterprompt-mãe, cumprido)

❌ zero implementação nesta conversa · ❌ zero canon duplicado (só refs) · ❌ zero 8ª skill (2 cortadas
com porquê, 1 absorvida como regra) · ❌ zero recomendação de publicar sem sanitização listada ·
❌ zero toque em worktrees/ficheiros dos executores (leituras git read-only) · ❌ zero promessa de
MooterBench fase B — onde não mede hoje, está escrito n/d.

🔍 council 8/8 · objeção mais forte: "skills que apontam pro canon viram ponteiros mortos se o #255
mudar paths antes do merge" — resolvida: E4 tem gate de entrada mecânico (grep do canon) e o
pointer-sentinel da Mesh A vigia depois; até lá nada ships (guard 'nada antes do #255 mergeado').
