---
name: moo-pilar-qualidade
description: Pilar P2 — Qualidade & Verificação (cargo MTO). Ronda GPU-local de review de diffs, guarda de recusa e scorer das propostas dos outros pilares. Usar quando o Paulo disser "/moo-pilar-qualidade", "ronda de qualidade", "revisa os diffs pendentes", ou quando /moo-talo escolher P2 (device com 30B — RTX 4090).
---

# /moo-pilar-qualidade — P2: o que está verde por não estar a ser testado?

> Pergunta-âncora (MTO): **o que está verde por NÃO estar a ser testado?** Este pilar assina as propostas de todos os outros. **Nunca gradua** (H3). É pré-requisito: nenhum outro pilar propõe sem o P2 ter guarda de recusa + default-FAIL ativos.
> Device: precisa do 30B para review de diff (prior: 32B ~88%, 14B ~75% piso, 7B proibido — promptquorum 06/2026, **hipótese até medir aqui**).

## Protocolo: segue /moo-talo. Específico do P2:

### MEDE ($0, L0)
- `device_bash`: suites targeted do que mudou (`npm test` no pacote tocado — runner NATIVO conta, sandbox não).
- Ledger: jobs `done` com recusa/erro no conteúdo (guarda de recusa apanhou?); contagem de `regressed`.
- Golden set: nº de casos hoje (meta ≥100 antes de qualquer decisão de suspensão; semear com as falhas reais documentadas: A4, G.3, J0-A, kimi).

### PROPÕE (GPU, $0)
- 1 diff mono-tema por job: "Revê este diff <conteúdo>. Devolve findings com ficheiro:linha + severidade + 'o que NÃO verifiquei'. Formato JSON. Não inventes linha que não está no diff."
- Painel de juízes nas propostas dos outros pilares: 2-3 modelos de famílias diferentes, rubrica binária, **swap A/B** (veredicto tem de sobreviver à troca de ordem), senão `inconclusivo`.

### TESTA
- Default-FAIL: finding sem ficheiro:linha real (grep confirma) morre.
- Kappa: **semanal**, contra o golden set — não por ronda (IC de 30-50 casos é ±0.15-0.2, não distingue nada).
- Auto-suspensão: só por evento `regressed` confirmado pós-apply — nunca por "falso-PASS intra-ronda" (indetetável por definição).

### Só nuvem/humano
Correção profunda (JudgeBench: nem GPT-4o), anti-patterns arquiteturais, performance, final-reviewer T3 pré-PR (caro por design, nunca cron), desempate do painel.

### Gauntlet (com comando)
1. Testes saltados a contar como passados? → saída literal do runner (skipped ≠ passed).
2. Jobs done-com-erro que a guarda apanhou vs deixou passar? → ledger.
3. Kappa da semana no golden set (nº de casos)? → registo do golden set; sem set, `n/d — semear primeiro`.
4. Regressões pós-apply e tempo-até-revert? → eventos `regressed` no ledger.
5. Que teste novo nasceu de falha REAL desta semana? → diff dos testes + falha-mãe citada.

### Recibo
RECIBO_DE_FECHO + `mooter_journal`. Cada afirmação: ficheiro:linha ou saída literal. Sem isso, `n/d`.
