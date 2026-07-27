# ⇄ COWORK → CODEX · MOO LINGUA FRANCA — protocolo único, templates copy-paste, zero retrabalho

> Cowork · 2026-07-16 · Origem: DECISION HANDOFF cd89b89c (FC-1..FC-8) + 7 princípios do Paulo.
> Casa: `_handoff/` → arquivar em `_handoff/_archive/2026-07/` no PR que shipar isto.

🎯 GOAL   Todo agente (CC, Codex, moo, Cowork) fala a MESMA língua tipada: 4 tipos de mensagem com
          template copy-paste, budget de tokens, reuse-gate obrigatório e dados estruturados que o
          Cockpit projeta depois. Handoff perfeito vira consequência do protocolo, não heroísmo.
📍 WHERE  Worktree própria `../frugal-lingua-franca` · branch `chore/moo-lingua-franca` · from
          origin/main (fetch antes). NUNCA a árvore principal.
⏱️ WHEN   Pode rodar em paralelo a F1–F3 (zero overlap se respeitares o GUARD). Se preferires
          sequencial: depois do commit da F3.
🔒 GUARD  classify.js FROZEN (sha `427d8c0b…`) · PROIBIDO tocar ficheiros das allowlists F1/F2/F3:
          `tools/router/{agent-sync-ledger,ledger-reduce,sync-hooks,arbiter,inject_context}.js`,
          `host-extra.js`, `no-frugal.yml`, `package.json`/`README.md`/`walkthrough` do plugin,
          `SYNC.md` · git add seletivo · push/merge = gate Paulo · sem novos .md na raiz.
✅ GATE   docs-hygiene verde · testes existentes 0 regressão · protocolo validado com fixture real
          (o brief cd89b89c reformatado nos templates) · ⛔ STOP humano antes do commit do P1.
⏭  NEXT   depois disto: F4 (docs stale) herda o protocolo; Setup Radar projeta o JSON no Cockpit.
📋 BACK   diff resumido · os 4 templates renderizados com a fixture · output docs-hygiene.

---

## Princípios do Paulo → onde cada um aterra (não perder nenhum)

| # | Princípio | Aterra em |
|---|---|---|
| 1 | Instruções perfeitas no contexto, mesma língua | P1 protocolo único + P2 templates |
| 2 | Quase tudo copy-paste entre LLMs | P2 templates com placeholders `<>` |
| 3 | Máxima eficiência de tokens | P1§e budgets + refs>dumps + tabelas>prosa |
| 4 | Economizar tempo | P2 (zero redação de novo) + P3 (zero retrabalho de caça a contexto) |
| 5 | UX/UI perfeitos | P4 contrato de dados (a UI vem no Setup Radar — NÃO construir UI aqui) |
| 6 | Tudo visual no plugin | P4 front-matter JSON projetável pelo Cockpit |
| 7 | Reusar skills/repos públicos antes de construir | P1§d REUSE GATE obrigatório |

## P0 — Ler antes (consolidar, nunca duplicar)
`docs/agent-context/AGENT_CONTEXT_PROTOCOL.md` (existe — é a BASE; estende, não forka) ·
`docs/strategy/PERFECT_HANDOFF_SPEC.md` (formatos Cowork-perfect + regra de ouro) ·
`AGENTS.md` §Communication protocol (espelho) · `scaffold/HANDOFF.template.md` (template existente).
Resultado do P0: decidir o que já está escrito e só precisa de ponteiro. Duplicação = FAIL do gate.

## P1 — O protocolo único (v1) — em `docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`
Uma seção nova "Lingua Franca v1" com exatamente 5 blocos:

**(a) Línguas e marcadores.** PT-BR conversa · EN código/identifiers · marcadores canônicos
✅ feito · 🔜 próximo · 🟡 em curso · ⚠️ atenção · ❌ não fazer · 🔥 foco · ❄️ pausa · 🛠 manutenção ·
⛔ STOP (gate humano) · ♻️ reuse. Nomes próprios nunca traduzidos.

**(b) Os 4 tipos de mensagem tipada** (qualquer coisa entre agentes É um dos 4 — se não é, não envia):
| Tipo | Direção | Função | Budget alvo |
|---|---|---|---|
| MASTERPROMPT | brain → executor | trabalho a fazer | ≤ 8k tokens |
| HANDOFF | executor → brain | estado real | ≤ 4k tokens |
| DECISION CONTRACT | brain → executor | resposta tipada a decisões | ≤ 2k tokens |
| BRIEF | executor → ledger | registro durável mínimo | ≤ 1k tokens |

**(c) Regras de verdade** (as que o ciclo F1–F3 provou): n/d nunca palpite · uncommitted = RED ALERT
com paths completos · confront-before-emit (ler estado real antes de emitir) · referência por
`path:linha`, NUNCA colar conteúdo que o consumidor pode abrir · contradição achada = reportada, nunca
absorvida · budget estourado = cortar prosa, nunca cortar evidência.

**(d) ♻️ REUSE GATE (obrigatório em todo MASTERPROMPT).** Antes de construir QUALQUER peça nova, o
executor responde 3 perguntas no próprio documento: (1) existe skill interna (`.claude/skills/`,
`packs/`) que faz isso? (2) existe pacote/repo público mantido que faz isso melhor? (buscar npm +
GitHub, citar o que achou, mesmo que a resposta seja "nada serve — motivo") (3) o Mooter já fez isso
noutra wave? (grep em `_handoff/_archive/`, `MEMORY.md`). Construir sem responder as 3 = FAIL de gate.
Achou → adapta e cita; não achou → constrói e regista o porquê. Zero retrabalho de trabalho público.

**(e) Eficiência de tokens.** Tabela > prosa · template > redação livre · o handoff aponta para
evidência, não a repete · narrativa qwen local = guarnição best-effort, nunca load-bearing (regra que
o PERFECT_HANDOFF_SPEC já fixa — citar, não reescrever).

## P2 — Templates copy-paste — novos, em `_handoff/templates/`
4 ficheiros, cada um ≤60 linhas, placeholders `<>`, com o budget no cabeçalho:
`MASTERPROMPT.template.md` (⇄ GOAL/WHERE/WHEN/GUARD/GATE/NEXT/BACK + ♻️ REUSE + ⛔ STOPs) ·
`HANDOFF.template.md` (deriva do scaffold existente + STATE/WORKTREE/GATE/WORK/DECISIONS/PENDING/
RED ALERT — alinhar com o formato Cowork-perfect do spec, não inventar campos novos) ·
`DECISION_CONTRACT.template.md` (o formato §10 do ciclo F1–F3, generalizado) ·
`BRIEF.template.md` (id · quem · o quê · git state · pointer de evidência).
**Prova:** renderizar o brief cd89b89c real nos 4 templates como fixture em
`_handoff/templates/fixtures/` — se a fixture não couber no budget, o template está errado.
**♻️ REUSE OBRIGATÓRIO (novo, 2026-07-16):** o CC criou `npm run handoff:preflight` + `handoff:qa`
(commit `f77d11b`, 11/11 testes) — gerador/checker MECÂNICO de handoff que parseia o PERFECT_HANDOFF_SPEC,
preenche os campos git-deriváveis e falha em campo faltante. **ESTENDER esta ferramenta, nunca duplicar:**
os templates P2 devem ser compatíveis com o preflight dela, e o futuro handoff-lint da mesh nasce DELA.
Dois validadores de handoff = FAIL de gate. As 8 perguntas do council NÃO devem ser hardcoded na
ferramenta — ela lê da seção canônica que o P6 cria em AGENT_CONTEXT_PROTOCOL/AGENTS.md (n/d gracioso
até lá).

## P3 — Fixes de comunicação do ciclo (FC-5, FC-6-repo, FC-8)
1. **FC-5:** regra no protocolo + mudança no writer: briefs tipados vivem em
   `_handoff/agent-sync/briefs/` da ÁRVORE PRINCIPAL (ou são copiados pra lá no fim da sessão) —
   nunca só em dir gitignored de worktree descartável. Copiar o cd89b89c existente pra lá.
2. **FC-6 (lado repo):** em `AGENTS.md`, trocar as 2 referências mortas ao vault
   (`00-core/protocolo-comunicacao`, `00-core/onde-vive-o-que`) por: referência ao ficheiro canônico
   do repo + nota "espelho conceitual no vault do Paulo (mantido pelo Cowork)". O Cowork já criou os
   ficheiros do vault — o repo só precisa parar de apontar pro vazio.
3. **FC-8:** regra no protocolo: se o consumidor do handoff não tem mount/acesso ao worktree, o
   handoff INCLUI `git diff --stat` + diff das seções críticas (é a exceção à regra refs>dumps).

## P4 — Contrato de dados p/ o Cockpit (visual DEPOIS, contrato AGORA)
Todo HANDOFF/BRIEF ganha front-matter YAML mínimo e estável (`type, id, from, to, state, worktree,
branch, sha, uncommitted, tests, decisions_pending[]`) — o que torna cada mensagem projetável pelo
Cockpit (Radar/Resume) sem parse de prosa. **NÃO construir view nova agora** — só o contrato + um
teste que valida o front-matter das fixtures. A UI é wave do Setup Radar.

## O que NUNCA fazer aqui
❌ Tocar allowlists F1/F2/F3 (colisão com trabalho em voo) · ❌ construir UI nova · ❌ duplicar o que
AGENT_CONTEXT_PROTOCOL/PERFECT_HANDOFF_SPEC já dizem (estender + apontar) · ❌ criar taxonomia nova de
mensagens além das 4 · ❌ commitar o P1 sem o ⛔ STOP humano (é a constituição do OS — Paulo revisa).

## P5 — CCA-F standards gate (pilares da certificação como pre-req de handoff · emenda 2026-07-16)
Os 5 domínios do **Claude Certified Architect — Foundations** (verificados web 2026-07-16) viram
checklist mecânico no template de HANDOFF e no futuro handoff-lint da mesh. Não é burocracia: cada
pilar mapeia num check que já falhou pelo menos uma vez neste projeto.

| Pilar CCA-F (peso no exame) | Check mecânico no handoff | Falha real que cobre |
|---|---|---|
| Agentic Architecture & Orchestration (27%) | worktree/branch/deps declarados · 1 executor por frente · plano antes de código em mudança de arquitetura | sessões concorrentes no mesmo tree |
| Tool Design & MCP Integration (18%) | hook/tool novo cita o contrato existente (provider README) · zero ferramenta inventada/duplicada | duplicar codex-cli.js (evitado na W62) |
| Claude Code Config & Workflows (20%) | CLAUDE/AGENTS respeitados · hooks só via fontes versionadas (nunca ~/.claude direto) · sha classify no gate | condição 1 do F1 round 2 |
| Prompt Engineering & Structured Output (20%) | mensagem é 1 dos 4 tipos · campos obrigatórios presentes · budget respeitado | handoffs pré-protocolo |
| Context Management & Reliability (15%) | refs path:linha · n/d nunca palpite · RED ALERT se uncommitted · confront-before-emit | FC-1..FC-8 inteiras |

Mecânica: o template de HANDOFF ganha um rodapé `CCA: 5/5 ✓` (auto-verificável). Handoff com <5/5 =
⚠️ flag no lint (alerta, não bloqueia); 3 flags seguidas = STOP e revisão do processo. O score CCA
entra no Mission Control junto do score de handoff (série temporal — highest standards visíveis,
não decorados).

## P6 — Council pré-emit (advogado do diabo automático · emenda 2026-07-16)
O gate de red-team de 8 perguntas (memória Cowork `pre-dispatch-redteam-gate`, pedido do Paulo em
2026-07-14) é canonizado no repo — deixa de ser disciplina informal:
1. **`AGENTS.md` ganha § "Pre-Dispatch Red-Team Gate"** com as 8 perguntas verbatim (fonte de verdade ·
   escritor único · reversível vs irreversível · script-first · projeção vs 2ª verdade · degradação
   graciosa · frozen/allowlist/n-d · custo de reverter) + a regra anti-sycophancy: o gate DEVE produzir
   ≥1 objeção real ou declarar o que tentou refutar; gate que só aprova = não rodou.
2. **Rodapé obrigatório por tipo de mensagem:** MASTERPROMPT e DECISION CONTRACT terminam com
   `🔍 council 8/8 · objeção mais forte: <X> · resolvida: <como>`. HANDOFF já tem `CCA: 5/5` (P5) —
   os dois rodapés coexistem, um mede padrão, o outro mede autocrítica.
3. **Handoff-lint da mesh (fase A)** valida a presença dos dois rodapés — mensagem tipada sem eles = flag.
4. Espelho conceitual: vault `00-core/reasoning-protocol.md` Axioma 4 (já escrito pelo Cowork) — o repo
   referencia, não duplica.
