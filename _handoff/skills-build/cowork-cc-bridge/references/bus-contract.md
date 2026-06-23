# Bus contract — `_handoff/loop/`

Canal de ficheiros entre o gerador (CC/SDK) e o cérebro (Cowork). Um escritor de cada lado.

## Ficheiros
| Ficheiro | Escrito por | Conteúdo |
|---|---|---|
| `STATE.json` | ambos | estado da máquina (ver abaixo) |
| `INBOX.md` | cérebro | a instrução da próxima ronda (o prompt que o gerador recebe) |
| `OUTBOX.md` | gerador | resultado da ronda (pode truncar — preferir o transcript) |
| `transcript/round-N-outbox.md` | gerador | resultado completo da ronda N (fonte de verdade p/ avaliar) |
| `CRITERIA.md` | cérebro | critérios de aceitação da wave actual |
| `QUEUE.jsonl` | cérebro | fila de waves (`status`: queued/done) |
| `DECISIONS.md` | ambos | digest não-bloqueante do irreversível + auto-respostas registadas |
| `ledger.jsonl` | gerador | uma linha por ronda (ts, round, ok, chars, engine) |
| `heartbeat.json` | gerador | pulso + evento `turn_stop` (via Stop hook) |
| `STOP` | humano | sentinela kill-switch; existe = gerador sai |

## STATE.json — máquina de estados
```json
{
  "loop_id": "autopilot-2026-06-22",
  "wave": "WN1",
  "title": "...",
  "branch": "wave-autopilot-loop",
  "status": "cc_running | awaiting_eval | awaiting_human | done | stopped",
  "round": 4,
  "maxRounds": 12,
  "sessionId": "<resume id — preservar entre rondas>",
  "lastOk": true,
  "eval_note": "porquê do último estado"
}
```

Transições: `cc_running` → (gerador corre 1 ronda) → `awaiting_eval` → (cérebro decide) →
`cc_running` (próxima ronda) | `done` | `stopped`. `awaiting_human` só quando NÃO há nada
reversível a fazer (raro, por design human-on-the-loop).

## Regras de ouro
- **Um escritor de cada lado.** Nunca correr 2 geradores no mesmo bus (colisão de working tree).
- **`sessionId` preserva-se** sempre que escreves `INBOX` (continuidade de contexto via SDK `resume`).
- **JSON sempre válido** no `STATE.json` (escrita atómica via `.tmp` + rename já está no runner).
- O cérebro lê o **transcript**, não o `OUTBOX.md` (este pode truncar em respostas longas).
