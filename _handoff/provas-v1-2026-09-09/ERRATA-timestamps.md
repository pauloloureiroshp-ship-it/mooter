# ERRATA · timestamps escritos à mão (2026-09-09)

**O erro.** Escrevi de cabeça os campos `congelado_em` dos protocolos P3, P4, P5 e P6 e o `_written_at` do `holdout-10.json` do P2. Os valores eram plausíveis e **errados** — quatro deles ficaram *depois* da hora real da corrida. O adversário (Codex) apanhou-o duas vezes no mesmo dia (P2 A01, P6 P6-01) e chamou-lhe, com razão, «cronologia impossível».

**O que vale como prova de anterioridade.** O commit git que introduziu cada `protocol.json`, e a hora do primeiro artefacto bruto de cada prova:

| Prova | Commit do protocolo | Hora do commit (UTC) | Primeiro bruto (UTC) | Anterioridade |
|---|---|---|---|---|
| P3 | `5efd58ed` | 13:47:54 | `results/A-sonnet.json` 13:58:54 | ✓ 11 min antes |
| P4 | `030374b1` | 13:54:58 | `mutants.json` 13:56:30 | ✓ 1,5 min antes (mesma linha de shell: commit && mutate) |
| P5 | `22388a20` | 13:40:15 | `results/A.json` 13:42:06 | ✓ 2 min antes |
| P6 | `61007b23` | 13:51:24 | `results/analysis.json` 13:51:24,449 | ✓ mesma linha de shell (`git commit && node run.mjs`); o commit precede a corrida por milissegundos, com resolução de 1 s no git |
| P1 | — (primeiro commit `f2739bcb` tem protocolo e resultados juntos) | — | — | atestada só pela ordem do transcript e mtimes; declarado no veredicto |
| P2 | idem (`f2739bcb`) | — | — | idem; `_written_at` do holdout também à mão e errado (`AMENDMENT-1.md` do P2) |

**A correcção.** `lib/fix-congelado-em.mjs` substituiu `congelado_em` nos quatro protocolos pelo `%cI` do commit e acrescentou `congelado_em_fonte` com o valor antigo. Nada mais mudou nesses ficheiros. Os hashes que os protocolos congelam (corpus, rótulos, oráculos) não dependem do próprio `protocol.json`.

**A regra daqui para a frente** (também em memória pessoal): nenhum timestamp escrito à mão; `new Date().toISOString()` ou o git. Congelar = commitar antes de correr e citar o hash.
