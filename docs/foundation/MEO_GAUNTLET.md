# MEO GAUNTLET v3 — 10 perguntas, régua de disparo, crítico ≠ autor
> v1: as 8 do Paulo (terreno real). v2: +5 da literatura. **v3: uma sessão de contexto fresco
> correu o gauntlet SOBRE o gauntlet, apanhou um erro factual (números do CoVe colados pelo
> autor na compressão — os três valores são de três tarefas distintas: MultiSpanQA F1 0.39→0.48,
> FACTSCORE 55.9→71.4, Wikidata precision 0.17→0.36) e seis defeitos de desenho.** Quase tudo
> aceite. A própria v2→v3 é a demonstração do método: o crítico era outro contexto, verificou
> contra as fontes, e mudou o entregável.

## Régua de disparo (o buraco mais caro da v2 — sem "quando", ou não corre ou corre a fingir)

| Classe | Critério | Gauntlet |
|---|---|---|
| **Trivial** | reversível em <5 min, não sai da sessão | **nenhum** |
| **Rotina** | entregável que o dono vai ler mas não re-verificar linha a linha | **G1, G3, G7 auto-aplicadas** + declaração de 1 linha |
| **Alto risco** | toca produção/secrets/CI/release/site público, OU o dono vai agir sem reler, OU vira masterprompt para outra sessão | **as 10, com G4 num MOTOR DIFERENTE.** Sem segundo motor disponível: o entregável não sai, ou sai carimbado `não-verificado` — nunca sai limpo |

## As 10

| # | Pergunta | Origem · prova de terreno |
|---|---|---|
| G1 | **Verificaste cada AFIRMAÇÃO factual numa passagem separada, contra a fonte, sem olhar para o teu texto?** (a releitura NÃO conta — foi a releitura que deixou passar "🐮 feito" 3× e os números do CoVe) | Paulo + CoVe · retro-prova: OAuth/release/site (08-01 manhã) e o próprio erro da v2 (08-01 tarde) |
| G2 | Percorreste o fluxo na PELE do utilizador, gesto a gesto? | Paulo · retro-prova: onboarding F0 em falta |
| G3 | **Está FORÇADO por mecanismo — e a medição que prova que o mecanismo disparou existe ANTES da entrega?** (absorve a antiga G12) | Paulo + Amazon Q5 · retro-prova: 3/6 requisitos do contrato eram esperança |
| G4 | **Um motor DIFERENTE tentou derrubar isto e encontrou ≥1 erro concreto — ou explicou porque não?** Role-play de advogado do diabo no mesmo modelo REFORÇA a posição (Nemeth 2001); dissidência tem de ser doutro contexto/motor | Paulo + Nemeth · retro-prova: a própria v3 (contexto fresco apanhou o que o autor não viu) |
| G5 | Pesquisaste ANTES de construir? O ecossistema já resolveu melhor? | Paulo · retro-prova: juiz local, /fork, tiers velhos |
| G6 | Funciona em TODAS as superfícies e devices, ou só onde estás sentado? | Paulo · retro-prova: terreno Mac≠Windows; Cowork cloud sem `~/.mooter` |
| G7 | A sequência está no fim, ordenada, com DONO em cada gesto? | Paulo · retro-prova: D1-D9 |
| G8 | Podias ter resolvido com MENOS interacções do dono? | Paulo · retro-prova: scripts auto-validantes |
| G9 | **Qual é a assunção que, se cair, deita tudo abaixo — e que confiança REAL tenho nela?** | Key Assumptions Check (CIA) · retro-prova: session-affinity gravava recomendação, não executor |
| G10 | **O que me faria dizer que está ERRADO — defini o critério de refutação ANTES e fui procurá-lo?** | ACH/Heuer · distingue "os testes passam" de "tentei partir" (era a G11 da v2) |

**3 slots livres.** Candidatas em fila de espera, à espera de RETRO-PROVA (correr contra ≥3 falhas
reais do registo e apanhar ≥1 que as 10 não apanham):
- *Pre-mortem* (Klein) — cortada por sobreposição com G10 e evidência mais fraca (lab 1989 vs teste executado).
- *Pontos de revisão anteriores abertos* (NASA) — volta QUANDO o registo de acções abertas existir
  como artefacto (cérebro da Wave M). Sem ficheiro grep-ável, é pergunta retórica.

## Como funciona — os 3 estágios de automação (honestidade sobre o que é automático HOJE)

1. **Hoje — contrato de prompt** (§3.9.6 do SUPERMASTER_MOOTER_2_0): o agente corre porque o
   briefing manda e declara no fecho. NÃO é automático — depende de obediência. É o estágio
   Urbach: funciona enquanto muda comportamento, degrada em tick-box.
2. **Próximo — enforcement mecânico (O-2):** hook de fecho de wave verifica a PRESENÇA e a FORMA
   da declaração `gauntlet:` (grep, como o wave-gate faz aos testes) — sem declaração, a wave não
   fecha. Barato, não avalia qualidade, mata o esquecimento.
3. **Fecho do loop — juiz O-1:** amostra declarações e distingue "internalizada" de "carimbada às
   cegas". Só aqui o gauntlet passa de checklist a sistema que aprende.

## Protocolo de declaração (formato fixo, grep-ável para o estágio 2)

`gauntlet: [classe] · Gn mudou X · G4 em [motor|auto-DEGRADADO|não-verificado] · não corridos: Gn (porquê)`

## Regras de crescimento

- Tecto **10 efectivas + 3 slots**. Entrada SÓ por retro-prova (≥3 falhas reais, apanha ≥1 nova).
  A v2 violou isto (5 entraram por autoridade da literatura numa tarde) — a v3 paga a multa.
- Pergunta que não muda nada em 3+ sessões de alto risco → o juiz distingue internalizada de
  carimbada; carimbada sai para a fila de espera.
- O log de deltas (`gauntlet:` nas declarações registadas) é o dado de calibração — N5 do Sócio.

## Fontes

CoVe 2309.11495 (números por tarefa, corrigidos na v3) · Nemeth 2001 (DA designado reforça;
nuance: estimula pensamento, mas do tipo errado) · Huang 2310.01798 (auto-crítica sem sinal
externo falha) · Reflexion 2303.11366 · CRITIC 2305.11738 · CIA Tradecraft Primer · Heuer/ACH ·
Haynes 2009 + Urbach 2014 (checklist muda comportamento ou não faz nada) · Klein/HBR (fila de
espera) · NASA NPR 7123.1 (fila de espera) · Superpowers two-stage.
