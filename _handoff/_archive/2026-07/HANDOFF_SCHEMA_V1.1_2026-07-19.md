# 📡 HANDOFF SCHEMA v1.1 — o formato com evidência (proposta para STOP do Paulo)

> Cowork · 2026-07-19 · Base: deep-research adversarial (106 agentes, 25 claims **3-0, zero
> refutadas** — NEJM/JAMA/AHRQ/NASA-ASRS/FAA/FM 6-99) + Lingua Franca v1 (#255) + as 4 pernas
> do stack (vault `40-strategy/mooter-perfect-handoff-stack.md`).
> Casa: `_handoff/` → vira wave de implementação (CC) após ⛔ STOP; arquivar quando shipar.

## 1. A evidência que manda no desenho (verificada, com fonte)

| Achado | Números | Consequência no schema |
|---|---|---|
| I-PASS reduziu erros médicos **23%** e eventos evitáveis **30%** (9 hospitais, 10.740 admissões, NEJM 2014) com **ZERO overhead de tempo** (2.4 vs 2.5 min, P=0.55) | AHRQ 2025: certeza MODERADA (I-PASS) vs BAIXA (SBAR) | Estrutura ≠ burocracia — formato bem desenhado não custa tempo e reduz erro. I-PASS é o template-mãe |
| **Hearback problem** (NASA ASRS/FAA): o loop falha mesmo COM read-back — receptor lê errado e o EMISSOR não pega; silêncio ≠ confirmação; expectation bias faz o receptor "ouvir" o que esperava | 3 tipos de falha catalogados (Cardosi/FAA) | Read-back tem que ser **verificado pelo emissor/lint**, nunca fire-and-forget. ACK passivo é proibido |
| **Fidelidade colapsa sob carga** (SBAR: ganhos grandes em sala de aula, pequenos na clínica; outcomes só com intervenção enforçada) | Lo/BMJ Open 2021 | Schema sem **enforcement mecânico** degrada — o handoff-lint (Mesh, 7d408f5) não é opcional, é a condição do efeito |
| 9-line MEDEVAC (FM 6-99): ordem FIXA posicional, urgência na Linha 3, contingências em slots próprios — canal degradado ainda carrega handoff completo | doutrina estável | Ordem de campos é semântica: **lint valida ordem**, não só presença |
| Campos universais em TODOS os domínios de alta confiabilidade | síntese das 25 claims | Os 5 abaixo (§2) |

Lacuna honesta: **nenhuma claim sobre SRE/A2A/staleness sobreviveu à verificação** — a parte de
staleness continua desenho nosso (proposto), sem evidência externa; marcada como tal.

## 2. As 5 mudanças do v1 → v1.1 (cada uma amarrada à evidência)

### M1 · SEVERIDADE PRIMEIRO (I-PASS illness severity · MEDEVAC linha 3)
Front-matter ganha `severity: critical | high | routine | fyi` e o corpo ABRE com ela.
Alimenta o Board Inbox/decision budget do Paulo. Preenchimento: julgamento (emissor), 1 palavra.

### M2 · READ-BACK ATIVO com verificação do emissor (a mudança mais profunda — hearback)
Todo MASTERPROMPT exige ACK do receptor ANTES de trabalhar, ≤5 linhas, tipado:
```
⇄ ACK · <masterprompt-id> · sessão <session-id>
ENTENDI: <a única coisa, nas MINHAS palavras — nunca copiar/colar o GOAL>
GUARDS QUE ME PRENDEM: <2-3 itens>
NÃO FAREI: <o DO-NOT herdado>
```
Verificação em 2 camadas: lint mecânico (id bate · sessão existe/active no registry · campos
presentes) + emissor/Cowork confere semanticamente ("nas minhas palavras" mata o eco cego —
paráfrase forçada expõe o mal-entendido, que é o achado do expectation bias). Silêncio ou ACK
genérico = dispatch NÃO confirmado; lint segura.

### M3 · CONTINGÊNCIA IF-THEN no MASTERPROMPT (I-PASS contingency plans)
Seção nova obrigatória `⚡ SE-ENTÃO`: os 2-3 modos de falha previstos + resposta planejada
("se o rebase conflitar em X → PARA e reporta, não resolve sozinho"). Mata a improvisação do
executor sob carga — onde a evidência diz que tudo degrada.

### M4 · DO-NOT herdado nos dois sentidos
MASTERPROMPT: `❌ NÃO FAZER` explícito (já existia implícito no GUARD — vira slot próprio).
HANDOFF: `DO-NOT SOBREVIVENTE` — guards que continuam valendo para o próximo consumidor
(hoje morrem na virada de sessão).

### M5 · ORDEM FIXA + fecho automático (9-liner · uniformidade)
Ordem canónica dos campos vira validação do lint (posição = semântica). Fecho de turno (o
"parked, aguardo push") vira BRIEF-fecho tipado de ≤6 linhas: no CC sai AUTOMÁTICO via Stop
hook; Codex/Gemini via template no BACK + lint recusa fora do formato. Nomes de seção FIXOS,
zero sinónimos (objeção do próprio Gemini, aceita).

## 3. O que NÃO muda (e por quê)

Budgets (≤8k/4k/2k/1k) — evidência diz que estrutura boa não custa tempo; não é licença p/
inchar. · Front-matter YAML + envelope mecânico (preflight escreve fatos; recibos gen_ai.* OTel).
· n/d nunca palpite · RED ALERT · ♻️ REUSE · council/CCA nos tipos que os exigem ·
addressing por session-id (registry 75b947c já entrega o unambiguous addressing que a aviação
pede — call-sign ambiguity era fator dominante de erro).

## 4. Staleness (proposto, SEM evidência externa — honesto)

Front-matter `generated_at` + regra: campos mecânicos re-verificados pelo preflight se o handoff
for consumido >6h depois (mesmo default do stale do registry). Sem `valid_until` arbitrário —
re-verificação mecânica é mais barata que expiração e não inventa prazos.

## 5. Implementação (wave única, CC, pós-merges — allowlist estimada)

1. `_handoff/templates/*` — M1..M5 nos 4 templates + template novo `ACK.template.md` (≤60 linhas cada).
2. `tools/handoff-preflight.js` — emitir envelope com severity/generated_at + comando `--close`
   (BRIEF-fecho) + `--ack-check <masterprompt-id>` (verificação mecânica do M2).
3. handoff-lint (Mesh, já construído) — validar ordem fixa + ACK presente antes de work-start.
4. Stop hook (CC) chama `--close` — fecho automático uniforme.
5. `AGENT_CONTEXT_PROTOCOL.md` §LF v1 → v1.1 (a constituição — diff mínimo, gate docs).
Depende de: merges de mesh (7d408f5) · registry (75b947c) · receipts (101ddee). Zero código novo
além do listado; `sessions.json`/CONTEXT_CARD já dão o addressing e o GPS.

## 6. ⛔ STOP — decisões do Paulo

1. Aprovar M1-M5 (ou cortar — candidato a corte se quiser mínimo: M3 é o de maior custo de
   disciplina; a evidência médica o inclui no bundle que funcionou).
2. ACK obrigatório para TODO masterprompt ou só nível-2 (arquitetura/alto risco)? Recomendo:
   todo — é ≤5 linhas e o hearback mostra que é justamente no "rotineiro" que o loop quebra.
3. Autorizar a wave de implementação no CC após os merges pendentes.

Council (8 chaves): rodado — objeção mais forte: "ACK em toda tarefa vira atrito no anel-curto do
process routing" → mitigação: no anel-curto o ACK é as MESMAS ≤5 linhas (30s) e é exatamente onde
o operador cansado cola errado; a evidência de zero-overhead sustenta. 2ª objeção: M4 pode virar
lista morta — mitigação: lint só exige DO-NOT não-vazio quando o masterprompt-pai tinha ❌.
CCA: n/d. 📮 DESTINO: Paulo (STOP) → depois CC (wave v1.1).
