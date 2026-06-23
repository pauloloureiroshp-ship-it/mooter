# Mooter Cockpit — arquitectura "Auto-pilot por sessão" (sem-erro by design)

**Composto:** 2026-06-23 · **Escopo:** `packages/vscode-extension` + bus `_handoff/loop/` + `~/.claude/tools/router/` + hook Notification + `sdk-runner.mjs`.
**O que entrega:** no cockpit, cada live session do CC mostra a sua vaquinha animada no seu **modo Mooter** (LazyMoo/Moo/CrazyMoo), o seu **modelo LLM**, o **auto-pilot** próprio, agrupada pelo **projeto Cowork** (Mooter.ai, Cloude Home…), com o **título da conversa Cowork** (brain) que a governa — e quando o auto está ON, as perguntas reversíveis do CC são respondidas pelo brain sem ti.

---

## Componentes (e quem escreve/lê o quê)
| Componente | Papel | Lê | Escreve |
|---|---|---|---|
| Cockpit webview (`extension.js` getHtml/snapshot) | UI: cards, animações, selectores | snapshot | mensagens de UI → host |
| Host `DataService.refresh()` | junta o snapshot (poll visibility-aware) | ficheiros+HTTP | snapshot p/ webview |
| `host-extra.recentSessions()` | estado por sessão (working/your turn) | `decisions.log`, transcripts | — |
| **`mode-registry.js`** (novo) | verdade por-sessão: modo/modelo/auto/projeto/brain | `.mooter-sessions.json` | atómico (tmp+rename) |
| **`cowork-waiting.js`** (novo) | estado "waiting for Cowork" + badge/CSS | `.cowork-pending.json` | — |
| `signal.ps1` (Notification hook / runner) | emite sinal de decisão | stdin do hook | `.cowork-pending.json` + `NEEDS_DECISION.json` + toast |
| `sdk-runner.mjs` (headless) | gerador; `canUseTool` responde s/ diálogos | INBOX + registry | OUTBOX/ledger/STATE |
| Cowork governador (scheduled) | cérebro: decide reversível, escala destrutivo | bus + política + vault | INBOX/DECISIONS/Notion |

---

## Fluxo end-to-end (numerado)
1. **Selecção por sessão:** clicas no card → modo (lazy/moo/crazy) / modelo / auto. O webview manda `setMode/setModel/setAuto` ao host → `mode-registry.set(sid, patch)` (escrita atómica).
2. **Render:** `DataService.refresh()` → `recentSessions()` calcula working/your-turn → `modeRegistry.decorate(row)` junta modo/modelo/auto/projeto/brain → `coworkWaiting.decorate(row, pending)` sobrepõe "waiting for Cowork" se houver sinal → snapshot → webview agrupa por `byProject()` e desenha a vaquinha com a animação do modo.
3. **O runner honra o modo/modelo:** ao começar uma ronda, o `sdk-runner` lê `mode-registry.get(sid)` → mapeia modo→política de routing e usa o `model` escolhido (lazy→local/barato, moo→equilíbrio, crazy→topo). Cada sessão corre no seu modo.
4. **Pergunta no CC:** se auto=OFF → Notification hook dispara `signal.ps1` → `.cowork-pending.json` + toast → card fica 🔵 "waiting for Cowork — <brain>". Se auto=ON → `canUseTool` (runner) ou o governador responde pela política/contexto do brain → card mostra 🔵 "auto-answered · escolheu X".
5. **Cérebro decide:** reversível → resolve + regista; destrutivo (push/merge/deploy/secrets) → **sempre** escala ao Paulo (DECISIONS + toast), nunca auto. Depois limpa o sinal → card volta a 🟢/🟠.

---

## Contratos de ficheiro
`.mooter-sessions.json` (registry): `{ "<session_id>": { mode:"lazy|moo|crazy", model:"<id>|null", auto:bool, project:"Mooter.ai", brainTitle:"<conversa>" } }`
`.cowork-pending.json` (sinal→plugin): `{ session_id, status:"pending|cowork_working|answered", note, coworkTitle, ts }`
`NEEDS_DECISION.json` (sinal→governador): `{ ts, source, note, session_id, cwd }`
Preferências UI (dropdowns abertos, último modo): `~/.mooter/preferences.json`.

---

## De onde vêm "projeto" e "brain" (real, não inventado)
A conversa Cowork sabe o seu projeto (Claude Desktop project) e título. Quando "reclama" uma sessão/branch (ou quando ligas no card "link a Cowork brain"), o Cowork escreve `{project, brainTitle}` no registry para esse `session_id`. O cockpit agrupa por `project` e mostra `brainTitle`. Sem reclamação → projeto "Unassigned" + CTA "link a brain".

---

## Estados (máquina, por sessão)
`idle → working(🟢, vaquinha anima no modo) → your turn(🟠)` e, ortogonal, `waiting for Cowork(🔵 + título)` quando há sinal e auto=OFF, ou `auto-answered(🔵✓ + opção)` quando auto=ON. Mutuamente exclusivos no badge; o modo (lazy/moo/crazy) define a animação da vaquinha em qualquer estado activo.

---

## Falhas conhecidas → como ficam impossíveis (lições aprendidas)
| Falha (já vista) | Prevenção no design |
|---|---|
| **Corrupção NUL** ao escrever ficheiros | escrita **atómica** tmp+rename + validação JSON na leitura (registry/STATE) |
| **Deadlock** (query aninhada no canUseTool) | governador **determinístico** in-process; zero query aninhada; + **timeout de ronda** (AbortController) |
| **Colisão** de escritores no repo | **um** escritor headless por bus; registry por `session_id`; sessões interactivas legadas fecham |
| **Mount stale** (leitura truncada) | o host lê o **FS real** (não o mount do sandbox); STATE validado |
| **Custo descontrolado** (Opus runaway) | modelo **por sessão** (lazy→local $0); default Sonnet; **destrutivo nunca auto** |
| Modo inválido / patch corrompido | `set()` valida `mode ∈ {lazy,moo,crazy}`; resto cai no DEFAULT |

---

## Invariantes (CI-enforced onde aplicável)
`classify.js` FROZEN (sha `427d8c0b…364bc48f`) intacta · `packages/*` engine não tocado · só ficheiros novos + os 3 pontos aditivos no `src/` · `git add` selectivo · nunca merge/push/tag para main (gate humano).

---

## Plano de teste (o "teste em produção")
- **Unit:** `mode-registry` (read/set/decorate/byProject, escrita atómica, validação de modo); `cowork-waiting` (decorate/badge); contrato em `data.test.js` (campos novos, estados mutuamente exclusivos).
- **Integração:** escrever `.cowork-pending.json` → snapshot mostra 🔵 + título; `set(sid,{mode:'crazy'})` → card anima crazy; `byProject` agrupa.
- **E2E prod:** instalar plugin → cockpit agrupa por projeto, 3 modos animam, selector por sessão muda modo/modelo, auto ON resolve uma pergunta reversível e regista, destrutivo escala. `classify.js` sha provada intacta no fim.
