---
name: moo-pilar-routing
description: Pilar P1 — Routing & Custo (cargos MFO+MIO). Ronda GPU-local sobre misroutes, quota e poupança-líquida do Mooter. Usar quando o Paulo disser "/moo-pilar-routing", "ronda de routing", "o routing está certo?", ou quando /moo-talo escolher P1 neste device.
---

# /moo-pilar-routing — P1: para onde vai cada prompt, e a que custo

> Pergunta-âncora (MFO+MIO): **que decisão de routing mudou por causa de um RESULTADO real — e a poupança-líquida é número ou n/d?**
> ⚠️ Estado bloqueante herdado: poupança-líquida = **n/d** → enquanto for n/d, **este pilar MEDE e não propõe**. "Poupança 47%" é contrafactual sem recibo — banido.

## Protocolo: segue /moo-talo (arranque verde, mutex, orçamento). Específico do P1:

### MEDE ($0, L0)
- `mooter_fleet({view:'recibo', periodo:'semana'})` → custo real por tier, tokens locais/nuvem, jobs medidos vs sem medição.
- `mooter_fleet({verbose:true})` → `combustivel` (pressão de quota, dedup, cache lido — a fatia de releitura de cache cola-se a qualquer número).
- `device_bash`: janela do `decisions.log`/ledger — contagem de decisões por tier, `local_decisao` presente? (se ausente em 100%, essa É a proposta da ronda).

### PROPÕE (GPU, $0) — jobs moo bounded
- 1 decisão por job: "Dado este registo de routing <JSON de 1 decisão>, lista os factos objetivos presentes (tier, categoria, tokens, custo) e marca `candidato_replay: sim/não` se o registo indicia tier acima do mínimo. NÃO julgues correção — só triagem para replay."
- Digest da janela: "Resume estas N decisões em tabela tier×categoria×custo. Nada fora dos dados."

### TESTA
- ❌ Misroute NUNCA se declara por opinião de L1. Só com **downgrade A/B real**: propõe ao Paulo re-executar N candidatos no tier abaixo (custo de calibração entra na poupança-líquida). O L1 só ordena a fila de candidatos.

### Gauntlet (cada pergunta com o comando que a responde)
1. Poupança-líquida da janela: número ou n/d? → `recibo` da fleet + custo de fronteira da sessão. n/d → só medir.
2. Quota: a barra da app diz X%, o nosso número diz o quê? → `combustivel.pressao` (limite inferior, ressalva colada).
3. `local_decisao {local, porque, confianca}` gravado em quantos % dos dispatches? → grep no ledger.
4. Fatia de releitura de cache da janela? → `combustivel` (último medido: 53,8% — se n/d, dizer).
5. Quantos candidatos a replay acumulados e quantos re-executados de facto? → ledger da wave.

### Recibo
Formato RECIBO_DE_FECHO + `mooter_journal`. Proibido: "poupança", "otimizado", número sem fonte. Fecho: ≤3 ações, ≤1 pergunta ao MEO.
