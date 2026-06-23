# Arrancar o Autopilot Loop — 1 comando

## Quando
**Depois** de o W1 (run atual no CC) abrir o PR e parar. Não arranques antes — o runner leria o bus e duplicaria o W1.

## O comando (terminal do VS Code, na raiz do repo, na branch wave-council-d)
```powershell
node _handoff/loop/start-loop.mjs
```
Isto: lê a `QUEUE.jsonl` → escolhe a próxima wave (`W2`) → prepara `CRITERIA.md`+`INBOX.md`+`STATE.json` → lança o `loop-runner.mjs`. A partir daí gira sozinho.

Smoke seguro primeiro (prepara o bus e simula, sem gastar tokens):
```powershell
$env:DRY_RUN=1; node _handoff/loop/start-loop.mjs
```
Forçar uma wave específica: `node _handoff/loop/start-loop.mjs W3`

## O que acontece depois (sozinho)
1. O runner corre o CC headless na wave atual, escreve `OUTBOX.md` + `ledger.jsonl`.
2. O avaliador (`cowork-loop-evaluator`, cada 10 min) lê, decide:
   - **continua** a wave (próxima ronda), ou
   - **fecha** a wave → cria sub-página no Notion ("🛸 Autopilot Loop — Wave Log") + exige nota no vault → **arranca a próxima wave da QUEUE**, ou
   - **escala-te** (acção irreversível: merge/push-main/tag/deploy/secrets) → cartão "Precisa de ti" no cockpit (Aprovar/Parar).
3. Encadeia W2 → W3 → W4 sem parar no reversível.

## Travões
- **Parar:** cria `_handoff/loop/STOP` (ou botão Stop no cockpit 🛸).
- `maxRounds=12` por wave · timeout 30 min/ronda · `classify.js` sha provada a cada fecho.
- **Nunca** faz merge/push para `main` sozinho — sempre o teu gate.

> Pré-aprova o avaliador uma vez: em *Scheduled* → `cowork-loop-evaluator` → **Run now** (para não pausar em permissões na 1ª volta real).
