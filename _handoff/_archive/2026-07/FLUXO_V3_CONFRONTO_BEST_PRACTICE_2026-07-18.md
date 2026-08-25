# 🐮 FLUXO V3 — o ciclo Mooter confrontado com o mercado (deep-research verificado) + desenho do fluxo mais eficiente

> Cowork · 2026-07-18 · Tipo: DESIGN + evidência. Origem: deep-research adversarial (106 agentes,
> 24 fontes, 118 claims extraídas, 25 verificadas, **23 confirmadas 3-0, 2 refutadas 0-3**) +
> canon interno (AGENTS.md · STRATEGY.md · MOO_HARMONY_MESH_BLUEPRINT · FLEET_ARM_GPU_TALO ·
> Lingua Franca #255 · playbook vault).
> Casa: `_handoff/` → arquivar quando a wave que shipar o v3 aterrar.
> ⛔ STOP: isto é design para decisão do Paulo — zero implementação nesta rodada.

---

## 1. Veredicto em uma linha

**O ciclo v2 NÃO é obsoleto — é mais completo que qualquer fluxo público verificado. O problema
é o oposto: ele é pesado demais para 80% das tarefas.** O mercado (Anthropic + OpenAI, docs
oficiais 2026) converge numa doutrina conservadora — *single-agent-first, multi-agente só quando
paraleliza de verdade* — porque multi-agente custa **~15× mais tokens** que chat. A resposta
mais eficiente não é copiar o mercado nem manter um anel único: é **rotear o PROCESSO como o
Mooter já roteia o modelo** — anel curto para tarefas pequenas, anel completo para waves,
tudo sobre uma malha local 24/7 que nenhum player de mercado tem (nenhuma claim confirmada
encontrou equivalente — inferência por ausência, ver §6 honestidade).

---

## 2. O que a pesquisa confirmou (23 claims, 3-0 cada) — resumo utilizável

| # | Achado verificado | Fonte primária | Implica para o Mooter |
|---|---|---|---|
| 1 | Claude Code tem 4 primitivas de paralelização (subagents · agent view · agent teams · dynamic workflows); worktree é o isolamento canónico, **automático** no agent view; agent teams (experimental, off por default) NÃO isola em worktrees | code.claude.com/docs/en/agents · /agent-teams | O worktree-spawn do v2 é o padrão de mercado; o mercado AUTOMATIZOU o spawn — v3 deve automatizar também (worktree-conductor/spawn-orchestrator já existem no repo) |
| 2 | Multi-agente = **~15× tokens** vs chat (single agent ~4×); orchestrator-worker venceu single-agent por 90.2% **em research, não coding**; a própria Anthropic: "a maioria das tarefas de coding é mau fit" | anthropic.com/engineering/multi-agent-research-system | O anel de 10 passos aplicado a TUDO queima tokens sem retorno — precisa de fast path |
| 3 | OpenAI: doutrina oficial **single-agent-first** — só dividir quando melhora capability/policy isolation, prompt clarity ou trace legibility; decomposição prematura = mais prompts/traces/aprovações sem melhorar resultado | developers.openai.com (orchestration) | Mesmo aviso do outro vendor — convergência de doutrina, não opinião isolada |
| 4 | Handoff tipado JÁ é mainstream (OpenAI Agents SDK: primitiva de 1ª classe, `transfer_to_<agent>`, `input_type` Pydantic) — MAS só tipifica **metadados** da chamada, não o artefacto | openai.github.io/openai-agents-python/handoffs | O Lingua Franca do Mooter tipifica o ARTEFACTO completo (estado git, gates, decisões, budgets) — está À FRENTE do SDK; manter e citar |
| 5 | Routing custo/capacidade é público desde 2024: RouteLLM até 85% de corte mantendo 95% GPT-4 no MT Bench, incl. híbrido cloud+Ollama — mas com UM threshold escalar, e o repo está **dormente desde 2024** | github.com/lm-sys/RouteLLM | Router por si só = commodity (confirma STRATEGY.md); o fosso não é rotear, é o pacote (assinaturas+GPU+telemetria local) |
| 6 | METR RCT: devs experientes ficaram **19% MAIS LENTOS** com AI early-2025 — e acreditavam estar 20% mais rápidos. Auto-percepção NÃO é métrica | metr.org (2025-07-10) | Valida a doutrina recibo/telemetria: eficiência SÓ medida mecanicamente. (Caveat: a METR diz que tooling 2026 provavelmente já acelera — o número expirou como arma, a lição metodológica não) |
| 7 | MAST (NeurIPS 2025, 1600+ traces, 7 frameworks): ganhos multi-agente frequentemente mínimos; **14 modos de falha**, ⅓ deles em *task verification* + *inter-agent misalignment* | arxiv.org/abs/2503.13657 | As duas categorias onde o mercado falha são EXATAMENTE o que gates mecânicos + handoff tipado + council atacam — o desenho do v2 está certo no lugar certo |
| 8 | DORA 2025: 90% usam AI; GitClear: código clonado 8.3%→12.3% das linhas (2021→2024) — adoção massiva com degradação mensurável (confidence media: fontes vendor/correlacionais) | dora.dev · gitclear.com | O caso de negócio do Mooter ("torna impossível não seguir best practices") tem números de mercado por trás |

**Refutadas 0-3 (nunca citar):** "OpenAI canoniza exatamente 2 padrões de orquestração" ·
"refactoring colapsou de 25%→<10% (GitClear)".

---

## 3. O anel v2, passo a passo, contra o mercado

| Passo v2 | Mercado tem? | Veredicto |
|---|---|---|
| 1 Intent | universal | = |
| 2 MASTERPROMPT tipado ≤8k | parcial (SDK tipifica só metadados; prompts de dispatch são prática, não protocolo) | **Mooter à frente** (budget + REUSE gate + red-team 8 perguntas) |
| 3 Worktree spawn | ✅ padrão (agent view automático; Conductor/Vibe Kanban) | = , mercado mais AUTOMÁTICO → v3 automatiza |
| 4 Executor sob allowlist | parcial (ownership de ficheiros manual em agent teams) | **Mooter à frente** (allowlist por wave + packages FROZEN, CI-enforced) |
| 5 Gates mecânicos $0 | parcial (dynamic workflows cross-verificam com **subagents LLM**, não determinístico) | **Mooter à frente** ("check que PODE ser determinístico DEVE ser" — ninguém verbaliza isto) |
| 6 HANDOFF tipado ≤4k + preflight | parcial (ver passo 2) | **Mooter à frente** (artefacto completo tipado + preflight mecânico 90% $0) |
| 7 Arbitragem council 8/8 + CCA | ❌ nenhuma claim confirmada de arbitragem multi-vendor estruturada pré-gate-humano | **só Mooter** (inferência por ausência) |
| 8 GATE humano no irreversível | ✅ consenso universal (HITL nos merges) | = |
| 9 Merge → ledger | ✅ (git) | = ; ledger tipado local é plus |
| 10 Loop/schedule | ✅ (loops autónomos, cron agents) | = |
| — Malha local 24/7 bounded | ❌ **zero claims confirmadas** de pipelines Ollama 24/7 para tarefas bounded — a maior lacuna da pesquisa | **só Mooter** (Harmony Mesh é blueprint, ainda não shipado) |
| — Router determinístico $0 <50ms + telemetria local | ❌ análogo mais próximo (RouteLLM) é threshold único, dormente | **só Mooter** (e subscription-aware = fosso permanente, STRATEGY.md §1.4) |

**Conclusão do confronto:** nenhum passo do v2 é pior que o mercado. Dois passos (7 e a malha)
não têm análogo verificado. O gap de eficiência do v2 não está nos passos — está em aplicar
**todos os passos a todas as tarefas**.

---

## 4. As 3 correções que o mercado ensina (o que muda do v2 → v3)

### 4.1 PROCESS ROUTING — rotear o processo, não só o modelo (a correção principal)
A doutrina convergente (Anthropic 15×, OpenAI single-agent-first) diz: o anel completo é
overkill para a maioria das tarefas de coding. O Mooter já tem o classificador que decide o
TIER — o v3 usa a MESMA decisão para escolher o **anel**:

| Rota | Quando (classify já sabe) | Passos do anel | Custo típico |
|---|---|---|---|
| 🐮 **Anel-zero** (moo local) | transform bounded (digest, index, draft, formatação) | moo L1 → draft flagado → reducer | $0, sem cloud |
| ⚡ **Anel-curto** | tarefa single-agent (fix, feature pequena, doc) | 1 Intent → 4 Executor (worktree auto) → 5 Gates → 8 Gate humano → 9 Merge | 1 sessão, sem masterprompt/council formais |
| 🔄 **Anel-completo v2** | wave, arquitetura, multi-frente, alto risco | os 10 passos | multi-agente justificado (paralelizável de verdade) |

Quem decide a rota: **o router, determinístico, $0** — mesma filosofia do tier ladder, com
pisos de segurança iguais (irreversível/secrets/deploy nunca descem de anel-completo + gate
humano). Isto é "single-agent-first" institucionalizado sem abrir mão do anel quando ele paga.
**Nenhuma claim de mercado mostra alguém roteando processo deterministicamente — candidato a
gap só-Mooter nº1.**

### 4.2 MALHA 24/7 como SUBSTRATO do anel (a intuição do Paulo, com fronteira dura)
Os moos locais não entram COMO passos do anel — trabalham **por baixo dele, continuamente**,
no que são comprovadamente bons (mesh blueprint já verificou: <7B falha sempre como agente;
30B ok em single-shot bounded). É o Harmony Mesh já desenhado (`_handoff/MOO_HARMONY_MESH_BLUEPRINT.md`),
que cobre exatamente a lista que o Paulo pediu:

| Pedido do Paulo | Job da mesh (já especificado) | Camada |
|---|---|---|
| handoffs | handoff-lint (valida contra template/budget) + preflight + projeção de handoff | L0+L1 |
| registro de ficheiros | brief-keeper (FC-5) · orphan-watch · pointer-sentinel · projection-drift | L0 |
| registro no Notion | cronista (drafts de registro; fase B da mesh — Notion via mirror, nunca escrita direta) | L1 |
| registro no vault | context-prebake (digests, index.md, Morning Brief, delta-since-last-look) + drafts `moo-draft` p/ o reducer | L1+L2 |
| "trabalhar sem parar" | fleet pm2 + Overclock pool (satura a 4090) + effort dial LazyMoo/Moo/CrazyMoo com auto-yield | infra |

Fronteiras não-negociáveis (doutrina 07-16, confirmada pelo mercado): transform single-shot
bounded ✅ · agentic <30B ❌ NUNCA · escrita canônica direta ❌ NUNCA (draft + Ledger → reducer
materializa) · check determinístico > LLM sempre.
**Zero claims de mercado sobre este padrão → gap só-Mooter nº2 (e o mais defensável: é a
maximização de custo afundado em ação — nenhum vendor cloud tem incentivo de copiar).**

### 4.3 VERIFICAÇÃO como investimento prioritário (onde o mercado sangra)
MAST: ⅓ das falhas multi-agente são de *task verification*; Addy Osmani (blog, corrobora):
"o gargalo deixou de ser geração — é verificação". O v2 já tem gates + council; o v3 reforça
com o que já existe no repo:
- **Juiz independente $0** (U2 GATE do fleet): um moo local re-corre o gate mecânico como
  segunda opinião — mata o falso-verde sem custar tokens cloud.
- **Council com dentes:** manter o anti-sycophancy (≥1 objeção real ou o gate não rodou) —
  nenhum equivalente de mercado verificado.
- **Recibos sempre** (lição METR): percepção mente 39 pontos (−19% real vs +20% percebido);
  toda alegação de eficiência do v3 sai do Ledger medido, nunca de sensação.

---

## 5. O FLUXO V3 desenhado

```
                         ┌─────────────────────────────────────────────┐
   INTENT ──► ROUTER ────┤ 🐮 anel-zero    → moo L1 → draft → reducer  │
  (Paulo /   (processo   │ ⚡ anel-curto   → exec → gates → 🔒 → merge │──► LEDGER ──► loop/
   schedule)  + tier,    │ 🔄 anel-completo→ os 10 passos do v2        │    (git+jsonl)  schedule
              $0 <50ms)  └─────────────────────────────────────────────┘
   ════════════════════════════════════════════════════════════════════════════════════
   MALHA 24/7 (substrato, $0, effort dial 🦥/🐮/🐮⚡, auto-yield):
   L0 determinístico: pointer-sentinel · orphan-watch · projection-drift · brief-keeper ·
                      gate-runner · token-warden · reuse-indexer
   L1 qwen3:30b:      handoff-lint semântico · doc-drift · context-prebake · cronista
                      (drafts vault/Notion) · juiz independente U2
   L2 qwen2.5:3b:     narrativa best-effort (nunca load-bearing)
```

Roster por papel (tier exato por tarefa = router; isto é o mapa de PAPÉIS):

| Papel | Quem | Regra |
|---|---|---|
| Brain / arbitragem / masterprompts | Cowork (Fable 5 = T5 opt-in p/ arquitetura e árbitro de última instância; nunca auto) | council + CCA antes de todo dispatch nível-2 |
| Executores cloud | Claude Code · Codex (worktree própria, allowlist) | anel-curto ou completo conforme rota |
| Validador read-only | Gemini (pós-teste de admissão — fabricou prova 07-17) | nunca escreve; só valida com evidência |
| Executores locais | moos (Ollama 30B/3B) | só bounded; draft flagado; $0; 24/7 via mesh |
| Gate | Paulo | todo irreversível; recibo do que o gate salvou |

**Por que isto bate qualquer fluxo público verificado:** (a) paga o custo multi-agente SÓ
quando paraleliza (doutrina dos 2 vendors, institucionalizada pelo router em vez de depender
de disciplina humana); (b) verificação em 3 camadas (mecânica $0 → juiz local $0 → council
cloud) atacando o modo de falha nº1 do mercado; (c) camada 24/7 de custo marginal zero que
nenhum player tem incentivo comercial de copiar; (d) tudo com recibo medido (lição METR).

---

## 6. Honestidade sobre a evidência (o que NÃO está provado)

1. **"Só o Mooter faz X" = inferência por ausência** nas 23 claims verificadas, não achado
   positivo. A pesquisa NÃO produziu claims confirmadas sobre Cursor/Windsurf/Devin/Factory/
   Jules/Antigravity, nem detalhe de Vibe Kanban/Conductor/Claude Squad, nem LangGraph/CrewAI/
   AutoGen a fundo. Ausência de claim ≠ ausência no mercado.
2. **Eficiência do v3 = n/d até medir.** Não existe RCT de tooling 2026 (METR promete follow-up).
   Nenhum número de ganho do v3 pode ser afirmado antes do Ledger medir anel-por-anel — e isso
   é instrumentação do Radar C3/C4, não promessa.
3. Os números pró-multi-agente (90.2%) e pró-routing (85%/95%) são self-reported/2024/benchmarks
   estreitos — usar como direção, nunca como claim de marketing.
4. Badges "best-practice →" da Vista B do fluxograma: dados agora existem (§2-§4) — aplicar aos
   DOIS renders do bake-off para manter a justiça (mesma spec, mesmos dados).

## 7. 🔜 Sequência proposta (decisão Paulo)

1. **Decidir o process routing** (§4.1) — é mudança de doutrina: régua escrita primeiro
   (AGENTS.md §ciclo + tabela de rotas), código depois. Zero código novo até lá.
2. **Mesh fase A** (4 checkers L0) — já sequenciada no playbook (F1–F3 → Lingua Franca →
   Mesh A → B/C → Radar); o v3 não adianta nada disso, só confirma a prioridade.
3. **Instrumentar recibos de anel** (wall-clock, tokens, drift catches) no Ledger — pré-condição
   para a Vista C do fluxograma sair de n/d.
4. Bake-off: passar §2-§4 como input comum aos dois renders (badges Vista B).

## 8. Fontes

Verificadas 3-0 (primárias): code.claude.com/docs/en/agents · code.claude.com/docs/en/agent-teams ·
anthropic.com/engineering/multi-agent-research-system · openai.github.io/openai-agents-python/handoffs ·
developers.openai.com/api/docs/guides/agents/orchestration · github.com/lm-sys/RouteLLM (+ examples/routing_to_local_models.md · arxiv 2406.18665) ·
metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study · arxiv.org/abs/2503.13657 (MAST) ·
dora.dev/dora-report-2025 · gitclear.com/ai_assistant_code_quality_2025_research.
Internas: AGENTS.md · docs/strategy/STRATEGY.md · _handoff/MOO_HARMONY_MESH_BLUEPRINT.md ·
_handoff/FLEET_ARM_GPU_TALO_BRIEF.md · _handoff/MOO_LINGUA_FRANCA_MASTERPROMPT.md (#255) ·
vault 40-strategy/mooter-agentic-os-playbook.
