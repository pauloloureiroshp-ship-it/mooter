# Cowork ⇄ CC — Loop autónomo (feature candidata do Mooter plugin)

Loop hands-free entre o **Cowork (avaliador/"brain")** e o **Claude Code (gerador)**, sem teclas humanas
depois do arranque. O CC corre em **headless** (`claude -p --output-format stream-json --resume`),
pilotado pelo `loop-runner.mjs` através de um **bus de ficheiros**. O Cowork avalia cada ronda via um
**scheduled task** e escreve a instrução seguinte. Padrão Generator→Evaluator.

## Arranque (a ÚNICA coisa que fazes — 1 vez)
```powershell
# na raiz do repo, na branch wave-council-d
node _handoff/loop/loop-runner.mjs
```
Smoke-test primeiro (sem chamar o CC, só testa o bus):
```powershell
$env:DRY_RUN=1; node _handoff/loop/loop-runner.mjs   # vês round 1 simular e ir a awaiting_eval; Ctrl+C
```

## Como gira
```
Cowork (scheduled task, cada 10 min)         CC side (loop-runner.mjs, sempre a correr)
  lê STATE+OUTBOX quando awaiting_eval   ◄──►   corre claude -p no INBOX quando cc_running
  avalia vs CRITERIA.md                          escreve OUTBOX + bloco ```status```
  escreve próximo INBOX, status=cc_running       status=awaiting_eval
  ou status=done / stopped                       (done/stopped → runner sai)
```

## Travões de segurança
- `STOP` — cria um ficheiro vazio `_handoff/loop/STOP` → o runner sai limpo (kill switch).
- `maxRounds` (12) — anti-runaway.
- `ROUND_TIMEOUT_MS` (30 min) — mata uma ronda presa.
- **Never merge/tag/push para `main`** — imposto no INBOX, no PROTOCOL_FOOTER e no CRITERIA. Merge é gate humano.
- Corre sempre numa **branch isolada**.

## Knobs (env)
- `PERMISSION_MODE` (default `acceptEdits`). Para autonomia total o CC pode precisar de `bypassPermissions`
  — ⚠️ só numa branch isolada e com `STOP` à mão; é a tua decisão consciente.
- `MAX_ROUNDS`, `POLL_MS`, `ROUND_TIMEOUT_MS`, `DRY_RUN`, `CLAUDE_BIN`, `REPO`, `LOOP_DIR`.

## Bus (`_handoff/loop/`)
`STATE.json` (máquina de estados) · `INBOX.md` (Cowork→CC) · `OUTBOX.md` (CC→Cowork) ·
`CRITERIA.md` (critérios da wave) · `transcript/` (audit por ronda) · `STOP` (kill switch).

## Parar
Cria `_handoff/loop/STOP`, ou deixa o avaliador pôr `status:done/stopped`. Para o meu lado:
desliga o scheduled task `cowork-loop-evaluator` em Scheduled tasks.
