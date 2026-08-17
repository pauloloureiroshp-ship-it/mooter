---
name: moo-pilar-motor
description: Pilar P5 — Motor Local & GPU (cargo MOO). Ronda sobre o orçamento de VRAM de cada máquina, renda por modelo residente, MooterBench e capacidade real do tier local. Usar quando o Paulo disser "/moo-pilar-motor", "ronda do motor", "a GPU está rendendo?", "que modelo devo ter residente?", ou quando /moo-talo escolher P5.
---

# /moo-pilar-motor — P5: cada GB de VRAM paga renda em recibos

> Pergunta-âncora (MOO): **que fatia foi feita a $0 e o que impediu o resto, job a job?** E a segunda, da Wave J: **que modelo residente NÃO pagou a renda** (VRAM ocupada × recibos produzidos)? "Effort sem recibo é ventilador a girar."
> Dono da REGRA DE ORÇAMENTO DE VRAM (inviolável): folga ≥2,2 GB; na 4090 o pequeno é residente e o 30B sob demanda (inversão do erro Wave J); no Mac, nunca servidor partilhado entre >30B e pequenos (ollama#14578).

## Protocolo: segue /moo-talo. Específico do P5:

### MEDE ($0, L0)
- `mooter_fleet({verbose:true})` → `local_available`, fatia $0, jobs local vs cloud. ⚠️ No Mac o painel diz "GPU indisponível" porque a sonda é nvidia-smi-only — anotar como bug de produto (proposta permanente: sonda Apple Silicon via mactop/ioreg).
- `device_bash`: modelos instalados (`ls ~/.ollama/models/manifests/...`), tamanho em disco; no Windows: `nvidia-smi` (VRAM pico, folga mínima da janela).
- Ledger: `prep_timeout`, `downgraded`, `duration_s`, `tokens_out` por modelo — tok/s efetivo e taxa de falha por modelo.

### PROPÕE (GPU, $0)
- Draft de config por máquina (keep_alive por modelo, NUM_PARALLEL, qual residente) como **step em mooter_setup — nunca aplicado a quente**. Troca de residente = decisão do MEO (afeta todos os pilares da máquina).
- Job moo de classificação de falhas: "Classifica estes N registos de job {timeout | OOM | recusa | erro real | interrompido} — só com base nos campos presentes."

### TESTA
- Canary: 10 jobs sintéticos (fixtures MooterBench) com a config candidata num slot isolado → tok/s e taxa de timeout vs baseline. Piorou ou folga <2,2 GB → draft morre com evento `incident`.
- Deriva de modelo: qualquer troca de residente **invalida kappa e certificações** → re-correr MooterBench é parte do custo da troca, declarado no draft.

### Só nuvem/humano
Troca de residente (gate MEO) · treino de LoRA (só após A/B shadow com outcomes pareados; até lá o recibo diz "combustível recolhido", nunca "o modelo melhorou") · claims públicos de desempenho.

### Gauntlet (com comando)
1. Fatia a $0 da janela e razão específica de cada recusa? → fleet recibo + ledger.
2. Folga mínima de VRAM da ronda; houve prep_timeout/downgrade? → nvidia-smi/ledger (no Mac: n/d até a sonda existir — dizer).
3. Renda por modelo: recibos produzidos por GB residente? → ledger × modelos.
4. Skills a correr local sem certificação MooterBench? → lista (resposta certa: 0).
5. tokens_poupados: calculado com tabela à vista ou null? → ledger (LH-5).

### Recibo
RECIBO_DE_FECHO + `mooter_journal`, com o orçamento de VRAM declarado no topo (residentes + picos + folga). Sem medição de VRAM no device → n/d com o porquê, nunca estimativa disfarçada.
