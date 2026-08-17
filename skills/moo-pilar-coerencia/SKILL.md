---
name: moo-pilar-coerencia
description: Pilar P3 — Coerência Doc↔Produto (cargo MCC). Ronda GPU-local que caça documentos canônicos que mentem — claims de skills/site sem código correspondente, SYNC.md fora da regra, shas divergentes. Usar quando o Paulo disser "/moo-pilar-coerencia", "ronda de coerência", "que doc está mentindo?", ou quando /moo-talo escolher P3 neste device.
---

# /moo-pilar-coerencia — P3: que documento está a mentir hoje?

> Pergunta-âncora (MCC): **que documento canônico mente HOJE, com ficheiro:linha do claim e ficheiro:linha do código que o desmente?**
> Precedente real: Wave J achou 3 de 5 skills com claims falsos; 15/08: `WAVE41_46_REPORT.md` (na RAIZ) cita sha antigo `7b01eb86` como "INTACT" enquanto disco+CLAUDE.md dizem `427d8c0b…` — raiz mente, archive é história.
> ⚠️ Lição de 15/08 (comigo mesmo): um agente leitor citou "ROUTING.md" como fonte do sha errado e a citação era falsa — **finding sem grep próprio morre, inclusive o teu**.
> ⚠️ Prior DocPrism: prompting direto é inútil (flag 82-97%); pipeline decomposto chega a precision 0.63 **num 70B** — nos nossos 20B é DESCONHECIDA → 1ª ronda = medir em 50 pares rotulados.

## Protocolo: segue /moo-talo. Específico do P3:

### MEDE ($0, L0)
- `device_bash`: `wc -l SYNC.md` (regra ≤200; hoje 3.438); `ls _handoff/*.md | wc -l` (hoje 186); mtime dos canônicos; grep literal de claims mecânicos (nomes de parâmetros de skills vs código, shas citados vs `shasum` real).
- **Só o delta:** pares claim↔código cujo ficheiro mudou de mtime desde a última ronda. Nunca o corpus inteiro (prefill domina no M4; corpus completo = 4-15h).

### PROPÕE (GPU, $0)
- 1 par por job, micro-pergunta fechada: "O parâmetro/claim <X> citado em <doc>:<linha> existe em <ficheiro de código>? Responde {consistente | inconsistente | n-d} + citação exata."
- Digest de canônico longo: **PROIBIDO até SYNC.md ≤200 linhas** — a correção é a tesoura (J-0b) + teste de CI, não um resumidor a mastigar o problema.

### TESTA
- Filtro L0 mata citação inventada: o grep tem de encontrar a linha citada. Finding sem grep = morto.
- Top-5 "docs que mentem" por gravidade — com a taxa de falsos positivos da ronda anotada (o Paulo desmente, o caso vira golden set).

### Só nuvem/humano
Reescrita do doc canônico (draft local + promoção humana); decidir se claim comercial sai do site; arbitrar divergência ambígua.

### Gauntlet (com comando)
1. SYNC.md linhas hoje vs 200 + delta desde a última ronda? → `wc -l`.
2. Existe teste de CI que falha se voltar a crescer? → `ls .github/workflows` + grep. Hoje: n/d.
3. Que claim de skill não tem grep correspondente no código? → bateria de greps.
4. Shas citados em docs batem com `shasum` real? → comparação direta (achado vivo: ROUTING.md).
5. Dos drafts da última ronda, quantos promovidos vs rejeitados e porquê? → ledger + digest anterior.

### Recibo
RECIBO_DE_FECHO + `mooter_journal`. Cada finding: doc:linha + código:linha + grep que prova. Precision da ronda declarada (confirmados/flagados) ou n/d.
