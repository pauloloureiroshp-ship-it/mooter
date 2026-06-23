# Mooter — "Waiting for Cowork" (live HITL handoff no plugin VS Code)

**Composto:** 2026-06-23 · **Onde vive:** `packages/vscode-extension` (statusline/live-session) + bus `_handoff/loop/` + `~/.claude/tools/router/.cowork-pending.json` + hook Notification.
**One-liner:** a sessão CC mostra um 3.º estado ao vivo — **🔵 waiting for Cowork — &lt;título da conversa&gt;** — para o vibe coder saber, sem vigiar nada, que uma decisão foi escalada e QUAL conversa do Cowork a está a tratar.

---

## Porque é uma feature flagship (e os vibe coders vão amar)
Hoje o plugin tem 2 estados de sessão: **🟢 working** (vaquinha a andar) e **🟠 your turn**. Falta o estado do mundo agêntico real: *o agente está bloqueado num humano/cérebro e tu não sabes**onde** agir.* As best practices de HITL 2026 dizem exactamente isto: quando o humano não está colado ao ecrã, precisas de **alta visibilidade + correlação de volta à conversa certa**, não de um "Approve?" cego ([Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop), [augmentcode handoff](https://www.augmentcode.com/guides/agent-handoff-patterns-human-agent-interface), [note.com HITL patterns](https://note.com/timakin/n/nd812eb702425?hl=en)). Esta feature transforma o "your turn" genérico num **handoff endereçado**: *quem* tem a bola (Cowork) e *qual* conversa.

---

## Máquina de estados (aditiva — o 3.º estado)
```
            classified+fresh                turn_end / stalled
   idle ────────────────────► 🟢 working ───────────────────► 🟠 your turn
                                  │                                  ▲
              decisão escalada    │ (Notification hook / canUseTool defer)
                                  ▼                                  │
                        🔵 waiting for Cowork                        │
                     pending → cowork_working(<título>) ──answered───┘
```
- **🟢 working** — `classified` + transcript fresco (<2 min). Vaquinha anda (`moowalk`).
- **🟠 your turn** — `turn_end` ou stalled (existente).
- **🔵 waiting for Cowork** *(NOVO)* — sinal de decisão activo. Sub-estados:
  - `pending` → "signalled Cowork…" (sinal escrito, ainda não reclamado);
  - `cowork_working` → **"waiting for Cowork — &lt;título&gt;"** (o Cowork reclamou e escreveu a sua identidade).
  - Ao `answered` → volta a working/your turn. Vaquinha em `moowait` (balanço lento, azul).

Mutuamente exclusivos; o estado Cowork ganha enquanto activo.

---

## O fluxo perfeito (event-driven, correlação bidireccional)
Best practice central: **correlation id** liga o trabalho assíncrono de volta à conversa de origem ([Microsoft handoff/conversation-id](https://devblogs.microsoft.com/agent-framework/a-tour-of-handoff-orchestration-pattern/)). Aqui o id é o `session_id` do CC; a "conversa" do outro lado é a do Cowork.

1. **CC escala** (interactivo: Notification hook `permission_prompt`; headless: `canUseTool` defer do irreversível) → corre `signal.ps1`.
2. **`signal.ps1`** escreve **dois** ficheiros + toast: `~/.claude/tools/router/.cowork-pending.json` `{session_id,status:"pending",note,coworkTitle:null,ts}` (lido pelo PLUGIN) e `_handoff/loop/NEEDS_DECISION.json` (lido pelo COWORK). Toast/push instantâneo ao Paulo.
3. **Plugin** (`recentSessions()`) lê o ficheiro de correlação → row fica `🔵 pending`.
4. **Cowork reclama** (governador agendado ou conversa viva) → reescreve `.cowork-pending.json` com `status:"cowork_working"` + `coworkTitle:"<o meu título>"`. Plugin passa a mostrar **"waiting for Cowork — &lt;título&gt;"**. (Checkpoint durável = ficheiro; padrão de estado persistido, [Temporal HITL](https://docs.temporal.io/ai-cookbook/human-in-the-loop-python).)
5. **Cowork decide** (pela rubrica/política; só o destrutivo chega ao Paulo) → escreve a resposta (headless: `canUseTool` lê; interactivo: clique/instrução) e marca `status:"answered"` → apaga o sinal.
6. **Plugin** volta a 🟢/🟠.

---

## Wiring no plugin (100% aditivo — 3 pontos)
Mapa real confirmado em `src/host-extra.js` + `src/extension.js`. Drop-in: `cowork-waiting.js` (copiar p/ `src/`).
1. **`host-extra.js` `recentSessions()` (~L714):** `const cw = require('./cowork-waiting'); const pend = cw.readCoworkPending();` e por cada row `cw.decorate(row, pend)` antes do `out.push`.
2. **`extension.js` `rowFor()` (~L576):** `const cwb = COWORK.badge(r); const badge = cwb || (r.working?…:(r.needsYou?…:…));` e na `<span class="livecow…">` juntar `+ (r.waitingForCowork?' cowork':'')`.
3. **`extension.js` CSS (~L354-364):** colar `COWORK.CSS` (escopado, não vaza).
+ contrato em `data.test.js`: `waitingForCowork:boolean`, `coworkTitle:string|null`, e os 3 estados mutuamente exclusivos.

Invariantes: `classify.js` FROZEN intacta; engine packages não tocados; só ficheiros/estado novos.

---

## UX (porque "fica animal")
- Cor distinta (azul `#61afef`) vs verde/âmbar → lê-se num relance.
- **Endereçada**: o título diz *qual* conversa do Cowork abrir — zero caça.
- **Não-bloqueante**: trabalhas noutra coisa; o toast/push chama-te só quando há decisão (inbox-style high-visibility, [note.com](https://note.com/timakin/n/nd812eb702425?hl=en)).
- **Honesta**: resume o pedido (note/título), não despeja JSON ([Microsoft HITL](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop)).

## Limite honesto + upgrade
Não há push nativo que acorde uma sessão Cowork local; o instantâneo é o **toast/push ao Paulo**, o Cowork actua no tick do governador ou quando aberto. Zero-latência real = migrar o governador para uma **Claude Code Routine** (cloud, endpoint HTTP que o hook chama) — o `signal.ps1` faria um POST e o Cowork-cloud responderia sem polling. Fica como Fase 2.
