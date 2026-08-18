---
name: moo-pilar-produto
description: Pilar P6 — Produto & Experiência. Ronda GPU-local de dieta de payloads, honestidade do site e prontidão para o usuário nº2 — medição L0 primeiro, triagem L1 flagada depois; decisão de produto é sempre do MEO. Usar quando o Paulo disser "/moo-pilar-produto", "ronda de produto", "o onboarding está pronto?", "dieta de payloads", ou quando /moo-talo escolher P6.
---

# /moo-pilar-produto — P6: o que o usuário vê, medido antes de opinado

> Pergunta-âncora: **um usuário nº2 consegue instalar hoje — e qual é o PRIMEIRO passo que parte, com evidência?** (GATE F0: simulação deu 3/10; distribuição 0/10.)
> Anti-vanity: painel que não muda decisão não entra. Decisão de design/produto: **sempre MEO** (MPO não nasce — deriva nº5 da GOVERNANCA_MEO).

## Protocolo: segue /moo-talo. Específico do P6:

### MEDE ($0, L0)
- Payloads reais: `mooter_fleet({view:'jobs'})` e `view:'recibo'` → bytes, % de campos a zero/null, repetições (goal 4× no mesmo payload — achado Wave J). Meta pós-dieta: −67% recibo, −75% jobs.
- Smoke de distribuição = **checks de script, não ronda** (refutação aceita): `.mcpb` publicado como release asset? `classify.js` dentro do bundle? `manifest.json` valida e a versão bate a tag? `install.sh` copia o template certo? → cada um é candidato a teste de CI.
- `files_touched`/keep rate: instrumentado? (hoje: 0 eventos → a proposta é a linha de instrumentação, não o número).

### PROPÕE (GPU, $0)
- Dieta de payload: 1 superfície por job — "Neste JSON de <view>, lista campos sempre-zero/sempre-null/duplicados nesta amostra de N payloads. Só o que está na amostra."
- Draft de microcopy PT-BR flagado `moo-draft` (texto final: humano).
- ❌ Triagem visual de UI: **fora do loop** — os residentes são text-only; volta quando houver VLM certificado no MooterBench contra julgamentos do Paulo.

### TESTA
- Replay do mesmo pedido com payload dieta → diff de bytes + prova de que nenhum campo não-zero sumiu. Campo não-zero removido sem gate humano = draft morto.
- Consumidor partiu (Cockpit, skill)? → revert imediato.

### Gauntlet (com comando)
1. Usuário nº2 instala? Primeiro passo que parte? → checklist de distribuição (grep .gitignore, release assets, manifest).
2. % de zeros no recibo e bytes do view=jobs vs meta? → medição L0 da ronda.
3. Keep rate: número ou n/d + a 1 linha que falta? → ledger (files_touched).
4. Que ecrã/skill/página promete o que o código não faz? → handoff para P3 (par claim↔código).
5. Que mudança de UX desta ronda tem antes/depois MEDIDO? → recibos; sem medição = "por parecer bonita" e não entra.

### Recibo
RECIBO_DE_FECHO + `mooter_journal`, com antes/depois por superfície. Decisões de produto pedidas ao MEO: máx. 1 por digest.
