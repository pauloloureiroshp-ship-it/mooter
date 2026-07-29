# ⇄ Handoff Cowork → Cowork · Mooter Conductor — orquestrador de sessões CC (matar o imposto de ambientalização)

> **Tema:** o vibe coder perde tempo precioso a gerir a frota de sessões Claude Code — descobrir *onde colar*
> um masterprompt, *que aba*, *que worktree*, *fresh ou continuar* — e arrisca colar no sítio errado. O Mooter
> devia **absorver esse roteamento**: colas o(s) masterprompt(s) num sítio só do plugin, e **moos locais**
> decidem criar sessão fresca ou responder a uma viva, na worktree certa, e disparam. Um **orquestrador de
> sessões + ponte Cowork↔CC**, tudo **$0 local**.
> **Veredicto Cowork (2026-07-05):** NÃO é delírio. É o degrau lógico da própria missão do Mooter
> (*"poder do CC sem o fardo operacional"*), dor universal em qualquer vibe coder com >2-3 sessões, e ~metade
> da infra já existe. Alta prioridade estratégica (é o cartão de visita da tranquilidade que o Mooter promete).

## 1. A dor — PROVADA ao vivo (2026-07-05, não teórica)
Numa única sessão de trabalho real do Paulo:
- O CC **editou a worktree errada** (`frugal` main em vez de `frugal-lp-diag`) — "besteira" que só se apanhou por sorte e exigiu correção manual.
- Sessões colidiram no **mesmo working tree** → `node_modules` corrompido, `EADDRINUSE`, edits perdidos.
- O Cowork produziu 4 masterprompts em texto; o Paulo teve de descobrir manualmente **qual aba CC**, **qual worktree**, **fresh vs continuar** — o trabalho de roteamento ficou todo no humano.
- O VS Code acumulou **~30 abas CC** abertas pelo plugin, sem forma de saber qual é qual.

**Custo:** o tempo mais caro do Paulo (founder) gasto em admin de infraestrutura disfarçado, em vez de na parte criativa. É exatamente o fardo que o Mooter existe para abolir. Ver [[project_mooter_vibe_coder_mission]].

## 2. A visão — dois níveis (começar simples, sonhar grande)

### Nível 1 · "Dispatch" (MVP — resolve ~80% da dor, esforço baixo)
Cada masterprompt vira um **cartão acionável** no plugin, não texto solto. Um clique → o plugin lê a linha
`Worktree ../frugal-X from Y` (que os masterprompts **já contêm** hoje) → **cria a worktree, abre a sessão CC
fresca e injeta o prompt** — pasta certa, sozinho. O Paulo não copia, não escolhe aba, **não pode colar no sítio errado**.

### Nível 2 · "Mooter Conductor / Maestro" (o de-outro-mundo)
Uma caixa no plugin onde se colam **um ou vários** masterprompts. Um **moo local** lê cada um e decide:
*nova sessão fresca* vs *responder a uma viva*, *qual worktree*, *qual base*. Cruza com o estado real das
sessões (o file-bus já sabe), cria/reusa worktrees, dispara a frota, e mostra tudo **por exceção** no cockpit
(encaixa no CTO Command Deck — ver [[project_mooter_cto_command_deck]]). Gestão de sessões por **colar-e-esquecer**, $0 local.

## 3. Cruzamento com o Mooter atual — o que já existe vs o que falta
| Peça | Estado hoje | Nota |
|---|---|---|
| Abrir sessões CC pelo plugin | ✅ | `mooter.newSession` |
| Ponte Cowork⇄CC programática | ✅ | Agent SDK · `sdk-runner.mjs` · skill `cowork-cc-bridge` (ver [[project_mooter_cowork_cc_bridge]]) — auth crédito Max sem API key |
| Rastreio de sessões/estado | ✅ | file-bus `_handoff/live-preview/events.jsonl` + hook-collector; cockpit lista sessões |
| Handoff estruturado | ✅ | Director's Cut + MOO HANDOFF (cada vez melhor) |
| Moos locais $0 | ✅ | qwen na RTX 4090 (Ollama) |
| **Parser/roteador de masterprompts → worktree/sessão** | ❌ | **a peça que falta** — tarefa T0/T1, ideal p/ moo local $0 |
| **Caixa "cola aqui" no plugin + cartões de dispatch** | ❌ | UX nova no cockpit |
| **Criação/gestão de worktrees pelo plugin** | ❌ (parcial) | `git worktree add ../frugal-X` automatizado + limpeza |

**Conclusão:** não é infra pesada nova — é a **camada de orquestração** por cima do que já existe.

## 4. Arquitectura proposta (a investigar/validar)
1. **Formato canónico de masterprompt** (já quase existe): cabeçalho parseável — `⇄ COWORK→CC · <título>` + `Worktree ../<nome> from <base>` + `<Modelo>`. O moo extrai: nome da worktree, base, título, fresh-vs-continue.
2. **Moo local parser/router** ($0): lê o masterprompt, cruza com o estado das sessões/worktrees, decide a ação. Quando **incerto → pergunta** (honest-copy; nunca uma besteira silenciosa). NÃO toca `classify.js` (frozen) — é um moo/parser aditivo novo.
3. **Executor** (reusa a ponte Agent SDK): cria/reusa a worktree (`git worktree add`), lança a sessão CC com o prompt injetado (fresh), regista no file-bus. Deep-link para a aba.
4. **Cockpit UI:** caixa de input "cola masterprompt(s)" + fila de cartões (parseado → confirmação → dispatch) + mapa de sessões↔worktrees (qual aba é qual). Encaixa no NOW/Floor do CTO Command Deck.

## 5. Faseamento
- **F0 · Dispatch fresh-first:** 1 masterprompt → cartão → cria worktree + abre sessão CC fresca + injeta prompt. Sem parsing fuzzy (lê a linha `Worktree`). Resolve a dor imediata.
- **F1 · Multi-dispatch:** colar N masterprompts → fila de cartões → dispara vários (worktrees próprias, respeitando a régua "1 worktree = 1 sessão").
- **F2 · Router inteligente:** o moo decide fresh vs **responder a sessão viva**, cruza estado, deteta dependências entre masterprompts (ex: MP5 depende de MP3).
- **F3 · Frota por exceção:** o Conductor gere a frota, sugere quando saltar para sessão fresca (liga ao Moo Context Guardian — [[project_mooter_context_guardian]]), agrega quando >12 sessões.

## 6. Guardrails / red-team (honestos)
- ⚠️ **Injetar em sessão VIVA é difícil** (processo/terminal a correr); **fresh é fácil** (lança com prompt). → MVP = **fresh-sessions-first**; responder-a-viva é F2.
- ⚠️ **Parsing fiável exige formato canónico** + o moo **pergunta quando ambíguo** (nunca adivinha e faz besteira).
- 🔒 **Gate no irreversível permanece:** o Conductor cria worktrees (reversível) mas **NUNCA faz merge/push sem OK do Paulo**. A doutrina de hoje não muda.
- 🔒 **1 worktree = 1 sessão** (a régua que faltou hoje e causou as colisões) — o Conductor **impõe-na** por construção.
- ⚠️ **Over-engineering:** NÃO construir o Conductor completo primeiro. O **Dispatch (F0) sozinho já devolve o tempo** e é uma fração do esforço. Enviar valor cedo.
- 🐮 **Tudo em moo local $0** (pedido explícito do Paulo): o parser/router é T0/T1 local; a orquestração não gasta cloud.

## 7. Questões de investigação (a nova conversa deve responder)
1. **Como a ponte Agent SDK (`sdk-runner.mjs` / `cowork-cc-bridge`) lança sessões CC hoje?** Consegue injetar um prompt inicial numa sessão fresca? E numa viva? (ler o código real no repo).
2. **Como o plugin abre abas CC** (`mooter.newSession`) e se consegue passar-lhes um prompt + fixar a worktree/cwd.
3. **Prior art** (web_search, muda <30 dias): orquestradores multi-sessão de Claude Code / agent fleet managers / "CC session router" 2026 — o que existe, o que falhou.
4. **Formato canónico** definitivo do cabeçalho de masterprompt (mínimo parseável, retrocompatível com os já escritos).
5. **UX/UI do cockpit** para a caixa + cartões + mapa sessões↔worktrees (cruzar com design skills + CTO Command Deck).
6. **Segurança:** validar que o dispatch nunca corre um comando destrutivo sem gate; sandbox do prompt.

## 8. Restrições não-negociáveis
- 🔒 `classify.js` **FROZEN** (sha `427d8c0b…`) — o roteador de sessões é um moo/parser **aditivo**, nunca toca o classificador de tiers.
- 🐮 **Moos locais $0** para todo o parsing/routing (pedido do Paulo).
- **Gate humano no irreversível** (merge/push/secrets) — sempre.
- **Honest-copy:** o Conductor nunca dispara às cegas; pergunta quando incerto; mostra o que fez.
- **PT-PT conversa · inglês código.**

## 9. Como arrancar (para a nova conversa)
1. Ler este brief + [[project_mooter_vibe_coder_mission]] + [[project_mooter_cto_command_deck]] + [[project_mooter_cowork_cc_bridge]].
2. Ler o código real da ponte no repo (`sdk-runner.mjs`, a skill `cowork-cc-bridge`, `mooter.newSession` no plugin) para saber o que já é possível.
3. web_search do prior art (orquestração multi-sessão CC 2026).
4. Escrever: **desenho de produto do Conductor + masterprompt do F0 (Dispatch fresh-first)** — o MVP que devolve o tempo. Registar vault/Notion.
5. Voltar ao Paulo com: o que a ponte já permite, o MVP F0 proposto, e a decisão wave-vs-track.

---
**Contexto do dia (2026-07-05):** sessão longa e produtiva — Live Preview MP2 App Stage + honest-controls em **produção**; estudo de paridade + roadmap MP3-MP7 + spec do Live Edit (MP5) escritos; Moove (portabilidade) em backlog; gap server-side do MP4 descoberto. Esta dor de orquestração emergiu de viver tudo isso na pele. O Live Preview é o foco a retomar; este brief é para **paralelo/depois**.
