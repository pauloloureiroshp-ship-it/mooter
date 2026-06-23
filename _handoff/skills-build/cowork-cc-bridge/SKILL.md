---
name: cowork-cc-bridge
description: >
  Ponte autónoma 24/7 entre o Cowork (Claude Desktop, o "cérebro") e o Claude Code (as "mãos"),
  para o loop de auto-melhoria do Mooter. Usa quando o Paulo disser "/cowork-cc-bridge", "arranca o
  loop", "és o cérebro do Mooter", "põe o CC a trabalhar sem parar", "governa o loop", "modo autónomo",
  "human-on-the-loop", ou quiser que o CC trabalhe 24/7 enquanto o Cowork vigia, decide e só escala o
  irreversível. NÃO é a sync pontual de um projecto (isso é a skill sync-project) — esta skill PÕE E
  MANTÉM o loop a correr: o CC gera (via Agent SDK + canUseTool), o Cowork avalia e decide pela política,
  e nada destrutivo acontece sem o Paulo. Funciona em Cowork (lado cérebro) e em Claude Code (lado mãos).
---

# cowork-cc-bridge — o Cowork é o cérebro, o Claude Code são as mãos (24/7)

Esta skill opera o loop autónomo de auto-melhoria do Mooter. O Cowork carrega o contexto todo
(vault, Notion, memória, política) e **decide**; o Claude Code **executa** sem parar, em headless,
via o Agent SDK. As perguntas do agente e o trabalho reversível são resolvidos automaticamente
pela política — só o **irreversível** (merge/push para main, deploy, secrets, apagar, dinheiro)
chega ao Paulo, e mesmo esse **não bloqueia** o loop.

> Porque é que isto funciona sem diálogos: o gerador corre com o **Claude Agent SDK** e o callback
> `canUseTool`, que intercepta TANTO permissões de tool COMO as perguntas `AskUserQuestion`. Logo o
> loop responde-se a si próprio pela política, em processo. Sem clicar, sem teclar, sem UI.
> Ref: https://code.claude.com/docs/en/agent-sdk/user-input

---

## Passo 1 — Detectar o lado

**Estás no Cowork (CÉREBRO) se:** tens MCP do Notion, memória auto, scheduled tasks, mas não tens o
terminal autenticado do `claude`. → Vai para **Modo CÉREBRO**.

**Estás no Claude Code (MÃOS) se:** tens bash com o `claude`/Ollama autenticados e lês `~/frugal`
localmente. → Vai para **Modo MÃOS**.

---

## Modo CÉREBRO (Cowork) — governar o loop

O Cowork é o governador human-on-the-loop. Execução fresca: lê o disco, aplica a política, decide,
escreve a próxima instrução, e só escala o irreversível.

**Bus** (`~/frugal/_handoff/loop/`): `STATE.json` · `INBOX.md` · `OUTBOX.md` · `QUEUE.jsonl` ·
`DECISIONS.md` · `ledger.jsonl` · `transcript/round-N-outbox.md` · `STOP`.
Detalhe do protocolo: lê `references/bus-contract.md`.

**Política (lei do loop):** aplica sempre `~/frugal/_handoff/fleet/STANDING_POLICY.md` +
`WORLD_CLASS_LOOP.md` + `AUTONOMY_MODEL.md`. Resumo operacional:

| Banda | Decisões | O que fazes |
|---|---|---|
| **AUTO** (decide e avança, NÃO perguntar) | objectivo, próxima wave, revert, refactor, ficheiros novos, evals, commits locais, branches, dynamic-workflow, agentes moo | decide pela rubrica e escreve o próximo `INBOX` |
| **DIGEST** (não-bloqueante) | push/merge-PR-main, deploy, secrets, apagar, dinheiro, pivot, descongelar `classify.js` | acrescenta a `DECISIONS.md` (contexto + opções + a TUA recomendação) e manda o loop seguir noutra coisa reversível |

**Invariantes duros (nunca violar):** `classify.js` FROZEN (sha `427d8c0b…364bc48f`) → qualquer pedido
de a tocar = auto-NO. `packages/*` frozen → só ficheiros novos. `git add` selectivo. Nunca
merge/push/tag/deploy/secrets tu próprio.

### Ciclo do cérebro (cada vez que avalias)
1. Lê `STATE.json`. Se `status` ≠ `awaiting_eval` → tick curto, sai.
2. Lê `transcript/round-<round>-outbox.md` (o `OUTBOX.md` pode truncar) + `CRITERIA.md`. Faz parse do bloco ```status```.
3. **Decide e avança** (ver tabela): change≠improvement → revert + regista negativo; rumo ambíguo → fixa o objectivo (eval honesto, nicho); wave DONE (artefactos + sha intacta) → sub-página Notion + marca `done` na QUEUE + arranca a próxima `queued`.
4. **Destrutivo** → `DECISIONS.md` + manda o loop seguir noutra wave/sub-tarefa reversível (escreve `INBOX` a saltar o passo destrutivo). Só pões `awaiting_human` se NÃO houver mais nada reversível.
5. Escreve o próximo `INBOX.md` (round+1, `status:cc_running`, `sessionId` preservado). JSON válido.
6. Alimenta Notion (sub-página sob `3876f6e4-2bc4-812b-b5d3-e6433a6cc8af`) + vault quando uma wave fecha.

> O scheduled task `cowork-loop-evaluator` (cada 10 min) já corre este ciclo automaticamente. Esta
> skill é o mesmo cérebro, invocável à mão quando o Paulo quiser intervir ou arrancar.

---

## Modo MÃOS (Claude Code) — pôr o gerador a correr

O gerador é o `sdk-runner.mjs` (Agent SDK + `canUseTool`), instalado UMA vez como serviço
auto-reiniciável. Vê `references/architecture.md` para o desenho completo e as peças prontas.

**Arranque limpo (single-writer — evita colisões de escritores concorrentes):**
```powershell
cd ~/frugal
npm i @anthropic-ai/claude-agent-sdk          # auth: crédito do plano Max, SEM API key
Get-Process node | Stop-Process -Force         # mata órfãos
pm2 delete all 2>$null                          # um só escritor
$env:DRY_RUN=1; node _handoff\loop\sdk-runner.mjs   # smoke primeiro
```
Quando o smoke passar, arranca a sério via pm2 (serviço 24/7):
```powershell
Remove-Item Env:DRY_RUN
pm2 start _handoff\loop\sdk-runner.mjs --name mooter-sdk-loop
pm2 save
```
O script `scripts/start-loop.ps1` faz isto tudo (smoke incluído). Copia primeiro `scripts/sdk-runner.mjs`
para `~/frugal/_handoff/loop/` se ainda não estiver lá. Kill switch: criar `_handoff/loop/STOP`.
Parar serviço: `pm2 stop mooter-sdk-loop`.

---

## Peças prontas que esta skill usa (não reinventar)
- **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) — o gerador. `canUseTool` resolve perguntas+permissões.
- **`claude mcp serve`** — expõe as tools do CC a um cliente MCP (útil para o Cowork tocar o CC ad-hoc).
- **[steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp)** — CC como UMA tool MCP one-shot ("agente dentro do agente"), para disparar tarefas quando o Paulo está presente.
- Detalhe e trade-offs em `references/architecture.md`.

---

## Critério de sucesso
- O CC trabalha em rondas sem parar, sem abrir diálogos (perguntas resolvidas pela política).
- O Cowork decide tudo o reversível na sua recomendação; só o irreversível vira cartão em `DECISIONS.md`.
- `classify.js` sha intacta sempre; nada mergeado/deployed sem o Paulo.
- O Paulo vê o board + Notion + o `DECISIONS.md` raro — e não aprova passo a passo.
