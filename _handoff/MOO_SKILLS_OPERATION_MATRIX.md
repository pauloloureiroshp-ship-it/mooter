# 🐮 MOO_SKILLS_OPERATION_MATRIX — skill × LLM × lugar × gatilho (loops/schedules)

> Cowork · 2026-07-18 · Cruza `_handoff/MOOTER_SKILLS_MAP.md` (E1) + canon #255 mergeado + doutrina
> GPU-turbo do playbook. Casa: `_handoff/` → arquivar quando a Mesh B (certificação) abrir.
> Regra-mãe desta matriz: **evento > cron para protocolo; cron só para pulso; moo local só pós-certificação.**

## 1 · A resposta curta às 3 perguntas

**Qual LLM roda cada skill?** As 5 camada-1 são ~90% `tools/handoff-preflight.js` (node, $0, zero LLM).
O LLM só faz o julgamento residual — e ele roda ONDE A SESSÃO JÁ ESTÁ (subscription já paga, custo
marginal ≈0). Moo local (4090/Ollama) NÃO consome skill hoje: moo recebe brief bounded, não carrega
`.claude/skills/` — dar-lhe skill não-certificada é o −1.3pp do SkillsBench. Local entra na onda 2,
pós-MooterBench (Mesh B §1.8).

**Onde no projeto rendem mais?** Nos EVENTOS de fronteira entre agentes: fim de sessão (handoff),
chegada de handoff (check), despacho de wave (masterprompt), resposta a STOP (decision), pré-emissão
(council). Não são features de runtime do produto — são o protocolo da mesh de BUILD.

**Loops/schedules?** Protocolo dispara por EVENTO (hooks/gates), não por horário. Cron é para pulso
(brief matinal, doctor semanal, fleet idle). Programar cron para skill de protocolo = rodar o gate
quando nada aconteceu.

## 2 · Matriz operacional (camada 1 + operacionais do motor)

| Skill | Consumidor (LLM) | Custo LLM real | Lugar/momento no Mooter | Gatilho | Cadência |
|---|---|---|---|---|---|
| `moo-handoff` | executor da sessão: CC (Claude sub) · Codex (ChatGPT sub) · Gemini qd admitido | ~90% $0 (preflight `--out`/`--qa`); julgamento = sessão já aberta | fim de wave/STOP, fecho de sessão, em QUALQUER worktree | **evento**: fim de sessão | on-demand |
| `moo-handoff-check` | brain: Cowork/CC; ideal = modelo ≠ do emissor (doutrina crítico externo → Gemini na admissão) | lint $0; confronto = reproduzir comandos ($0) + veredicto LLM | chegada de HANDOFF/BRIEF; admissão de agente novo | **evento**: handoff recebido | on-demand |
| `moo-masterprompt` | brain: Cowork (aqui) ou CC | template+conformance $0; composição = sessão brain | despacho de wave a qualquer executor | **evento**: decisão de despachar | on-demand |
| `moo-decision` | brain: Cowork/CC | `extractQA` $0 (verbatim, zero transcrição LLM); tabela = residual | resposta do Paulo a STOP | **evento**: STOP respondido | on-demand |
| `moo-council` | embutida nos emissores (roda onde eles rodam) | 8 respostas com evidência = LLM da sessão; validação do rodapé $0 | pré-emissão de MASTERPROMPT/DC/copy/canon | **evento**: pré-emit | on-demand |
| `moo-verify` | QUALQUER — é crítico L0 determinístico | **$0 total** | pós-código, pré-commit | evento: código produzido | on-demand + gate |
| `final-reviewer-honest` | modelo forte (T3/Opus-class, subscription) | caro por design — é o gate T3 | pré-merge | **evento**: PR pronto | por PR, nunca cron |
| `agent-sync` | CC/Codex (🟡 pré-LF — refresh pós-#255 pendente) | ledger $0 | checkpoints de sessão | evento: checkpoint | on-demand |
| `pastor-distill` (funde `moo-distill`, F4) | CLI `mooter pastor distill` — TF-IDF determinístico | **$0 (zero LLM)** | pós-acúmulo de decisões | **cron candidato legítimo** (ver §3) | semanal |
| Produto (futuro Mesh C): `moo-verify` + honest-copy + 1 stack | agente do USUÁRIO (qualquer) via injeção do router | $0 local qd certificada | projeto do usuário, via `init --auto` | evento: por-prompt (router) | — |

## 3 · Loops & schedules — plano em 2 ondas

### Onda 1 — AGORA (zero LLM, zero risco, nativo na tua máquina)
| Job | O quê | Motor | Cadência | Estado |
|---|---|---|---|---|
| Gates por evento | preflight `--check` + `--lint` + moo-verify no fluxo de PR/commit | node/CI | por evento | ✅ já existe como doutrina; NÃO virar cron |
| Doctor semanal | `doctor-checks` runChecks read-only + relatório | node nativo (Task Scheduler/pm2) | semanal | 🔜 script-first quando quiseres — 30 min |
| Pastor distill | `mooter pastor distill` sobre decisões acumuladas | node TF-IDF $0 | semanal | 🔜 idem; output = skill candidata p/ gate humano |
| GPU stream/fleet pulse | nvidia-smi stream | já existe (`mooter-fleet`, commit 21408f5) | contínuo | ✅ vivo |
| Morning Brief / fecho-do-dia | Cowork scheduled tasks | Cowork | diário | ✅ já existem |

### Onda 2 — GATED (só pós: skills em main + 2 semanas de uso real + MooterBench medindo)
| Job | O quê | LLM | Gate de entrada |
|---|---|---|---|
| Moos locais em loop (4090, $0) | jobs bounded CERTIFICADOS: digest/index/draft/cronista-L1 (o destino da ex-moo-registro) | Ollama/local | MooterBench score + brief bounded; blueprint JÁ EXISTE: `_handoff/FLEET_ARM_GPU_TALO_BRIEF.md` — reusar, não recriar |
| Corrida subscription contínua | Codex waves aditivas | ChatGPT sub | já modelado (`CODEX_AGENTIC_OS_RUN_MASTERPROMPT.md`); Codex segue no Fleet/Mesh A |
| Admissão Gemini como checker de rotina | moo-handoff-check em todo handoff Codex→brain | Gemini | passar o teste de admissão (masterprompt pronto) |

### ❌ Não fazer agora (e porquê)
- Cron de skill de protocolo — gate sem evento = ruído; o disparo certo são os hooks/gates existentes.
- Moo local consumindo skill não-certificada — é a auto-geração do SkillsBench (−1.3pp) disfarçada.
- Nova frente de automação antes dos P1 da auditoria — WIP 3-5 (doutrina); os P1 destravam isto.

## 4 · Régua de eficiência honesta (o que "eficiente" significa HOJE)
| Camada | Medível hoje? | Como |
|---|---|---|
| Conformance mecânica | ✅ já medido | preflight --check 31/31 · lint · sha frozen · refs confrontadas (2 fantasmas corrigidos 07-18) |
| Eficiência de token | ✅ por construção | budgets no canon (8k/4k/2k/1k) + 90% do handoff $0 via preflight |
| Eficácia real (menos retrabalho, handoffs 1º-try) | 🟡 janela de 2 semanas de uso interno (régua do mapa §4) | contar: handoffs DEVOLVIDOS vs ACEITOS · masterprompts que sobrevivem ao Day-0 recon sem refutação |
| Score de skill (local vs cloud) | ❌ n/d — MooterBench não existe (Mesh B §1.8) | quando existir, as fixtures cd89b89c + caso Gemini já servem de eval |

**Métrica de sucesso da quinzena (proposta):** ≥80% dos handoffs ACEITOS sem DEVOLVIDO no 1º envio ·
0 rodapés `council 8/8` fabricados pegos pelo lint · 100% dos despachos com `📮 DESTINO`.

## 5 · Sessão fresca?
Esta análise: NÃO — o valor estava no contexto já confrontado desta thread; está agora gravado aqui.
Sessão fresca SIM para as execuções que este doc gateia: (a) wave Onda-1 scripts (qualquer sessão,
30 min), (b) Fleet Arm/certificação quando a Mesh B abrir — aí com masterprompt próprio via
`moo-masterprompt`, com `📮 DESTINO` e council, como manda o canon que acabou de aterrar.

🔍 council 8/8 · objeção mais forte: "matriz de LLM sem benchmark é opinião?" · resolvida: as
atribuições derivam de restrições mecânicas verificadas (moo não carrega .claude/skills; preflight é
node $0; T3 é doutrina escrita), não de preferência de modelo; onde falta medida está `n/d` com o
caminho para medir (§4).
CCA: 5/5 ✓
