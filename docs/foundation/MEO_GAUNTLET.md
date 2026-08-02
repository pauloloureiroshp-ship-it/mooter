# MEO GAUNTLET v5 — 15 perguntas, régua de disparo, crítico ≠ autor
> v1: as 8 do Paulo (terreno real). v2: +5 da literatura. **v3: uma sessão de contexto fresco
> correu o gauntlet SOBRE o gauntlet, apanhou um erro factual (números do CoVe colados pelo
> autor na compressão — os três valores são de três tarefas distintas: MultiSpanQA F1 0.39→0.48,
> FACTSCORE 55.9→71.4, Wikidata precision 0.17→0.36) e seis defeitos de desenho.** Quase tudo
> aceite. A própria v2→v3 é a demonstração do método: o crítico era outro contexto, verificou
> contra as fontes, e mudou o entregável.
> **v4 (2026-08-01, auditoria E2E): +2 entradas, ambas por RETRO-PROVA, ambas de falhas medidas
> na própria auditoria — G11 (instrumento) e G12 (denominador). Restam 1 slot livre.**
> **v5 (2026-08-01/02, sessão Cowork + CC): +3 entradas, todas por RETRO-PROVA ×3 de falhas do
> próprio dia — G13 (procura-antes-de-delegar), G14 (valor de negócio), G15 (memória cross-silo).
> Tecto elevado 13→15, 0 slots. A partir daqui: entra uma → sai uma.**

## Régua de disparo (o buraco mais caro da v2 — sem "quando", ou não corre ou corre a fingir)

| Classe | Critério | Gauntlet |
|---|---|---|
| **Trivial** | reversível em <5 min, não sai da sessão | **nenhum** |
| **Rotina** | entregável que o dono vai ler mas não re-verificar linha a linha | **G1, G3, G7 auto-aplicadas** + declaração de 1 linha |
| **Alto risco** | toca produção/secrets/CI/release/site público, OU o dono vai agir sem reler, OU vira masterprompt para outra sessão | **as 15, com G4 num MOTOR DIFERENTE.** Sem segundo motor disponível: o entregável não sai, ou sai carimbado `não-verificado` — nunca sai limpo |

## As 15 — G1 a G13 na tabela abaixo; G14 e G15 seguem, cada uma colada à sua retro-prova

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
| G11 | **Validaste o INSTRUMENTO antes de acreditares na medição? Um negativo é ausência do facto, ou defeito do teu método — provaste qual?** | Auditoria E2E 08-01 · retro-prova ×4 abaixo. G1 verifica a afirmação contra a fonte; esta verifica o APARELHO que produziu a fonte |
| G12 | **O número que publicas mede a coisa que importa, ou a coisa fácil de contar? Declara o denominador ao lado do valor.** | Auditoria E2E 08-01 + Wave K · retro-prova ×4 abaixo. G1 pergunta se o número é verdadeiro; esta pergunta se mede o que interessa |
| G13 | **Antes de mandar o dono fazer um gesto: consultaste `O_QUE_O_SOCIO_FAZ_SOZINHO.md` E corriste o ToolSearch? Cada gesto que lhe passas é IMPOSSÍVEL para ti (com prova), ou não verificaste?** | Paulo · retro-prova ×3 abaixo. G8 pergunta se podias resolver com menos interações; esta pergunta se sequer PROCURASTE. Inventário em `docs/foundation/O_QUE_O_SOCIO_FAZ_SOZINHO.md` — ficheiro **local, não versionado** (lista os conectores ligados do Paulo; fica fora do repo público por decisão dele, 2026-08-02) |

### Retro-prova da G11 (instrumento) — 4 falhas reais, todas de 2026-08-01

1. «`nvidia-smi` não encontrado» reportado como bug do diagnóstico — era o harness do auditor a
   despir `PATHEXT` do ambiente do processo filho. Com ambiente Windows completo, o diagnóstico
   acerta (🟢 RTX 4090). **G1 não apanha: a leitura da fonte estava certa; o aparelho é que mentia.**
2. «o resolvedor descartou a directoria do caminho» — o ficheiro citado simplesmente não existia;
   o erro do conector estava correcto e bem construído.
3. «10 pacotes órfãos» — o grep procurava `packages/<nome>`, mas o CLI importa por
   `../../<nome>/src/...`. Método errado ⇒ falso órfão. Corrigido: 11 são só-CLI, 2 sem consumidor.
4. Histórico (O-0, 08-01 manhã): 6 dispatches recusados atribuídos **inteiramente** ao bug de
   caminhos com espaço, quando a raiz do guard estava também implicada. Uma causa encontrada
   fechou a busca antes de o instrumento estar validado.

### Retro-prova da G12 (denominador) — 4 falhas reais

1. Fatia local: **50,9% por contagem de jobs vs 15,0% por tokens de entrada** (ledger, 08-01).
   O custo segue os tokens; a métrica publicada infla o fosso ~3,4×.
2. Wave K (07-31): a mesma pergunta — «quanto corre local?» — deu 27,27% / 40% / n/d em três
   vistas, cada uma com o seu denominador.
3. Recibo 08-01: `trabalho_a_zero 66,67%` (cargo MEO) e `43%` (advogado do diabo) **no mesmo payload**.
4. `custo_total` declarado "parcial" enquanto 292 259 tokens de entrada de um único job codex
   ficavam sem preço — a parcialidade era honesta, a magnitude nunca aparecia.

### Retro-prova da G13 (procura-antes-de-delegar) — 3 falhas reais, 2026-08-01 noite

1. Mandei o Paulo "abrir o PR no GitHub e clicar Merge" — SEM verificar. Tinha
   `merge_diff` (aceita URL de PR do GitHub) o tempo todo. Um gesto humano inventado por preguiça.
2. Padrão do dia inteiro: `.bat` de duplo-clique para o Paulo, quando muitos eram despacháveis
   à frota — só descobri o limite real (index.lock, política) DEPOIS de tentar, não antes.
3. O próprio Paulo teve de perguntar "você não consegue sozinho?" 3× em sessões diferentes —
   o sinal de que a delegação estava a ser o default, não o último recurso.
**A régua: um gesto só chega ao dono depois de um ToolSearch provar que é impossível para o agente.**

**Passo histórico: tecto 13→14, com a entrada da G14** — não é o estado final (a v5 fecha em 15 · 0
slots; ver o fecho abaixo). (decisão consciente 2026-08-01: o Paulo, como CEO,
apanhou que o gauntlet inteiro media corretude técnica e NADA media valor de negócio — um
checklist que garante que o código está certo mas não que alguém paga por ele. Elevar o tecto
por 1 é a exceção justificada da regra Urbach: entra por PROVA de lacuna, não por entusiasmo).

| # | Pergunta | Origem · prova |
|---|---|---|
| G14 | **Esta wave move a agulha do NEGÓCIO — e qual (aquisição, activação, receita, retenção, referência)? Ou é polimento que não muda a disposição de alguém a pagar?** Se for polimento, porque está à frente do que gera receita? | Paulo-CEO 2026-08-01 · retro-prova ×3 abaixo. G3 pergunta se está forçado por mecanismo; G14 pergunta se o mecanismo importa para o VALOR. É o "kill list" e o "custo de oportunidade" virados pergunta |

### Retro-prova da G14 (valor de negócio) — 3 falhas reais do próprio dia

1. **O dia inteiro (35 turnos) não produziu UM cêntimo de disposição-a-pagar provada.** Titular
   honesto, oráculo, gauntlet — tudo corretude. A demo de 90s (a única coisa que um cliente vê)
   e o F0 (o que abre ao 2º cliente) ficaram sempre para "a próxima wave". Ordenámos por elegância
   técnica, não por receita.
2. **A nota do produto foi 6/10 ponderada — mas "6 em quê?".** Motor 8,5 · produto-para-o-mundo 4.
   O único número que importa para valuation (clientes que pagam) foi **zero**, e nem entrou na conta.
3. **O radar competitivo e o benchmark público** — as duas únicas coisas que criam defesa de mercado
   e à-frente-da-concorrência — esperam um "sim" do Paulo desde as 10h da manhã e nenhuma wave os
   priorizou. Construímos o motor; ninguém construiu a prova de que o motor vale dinheiro.

**A régua de negócio (nova, ao lado da técnica):** nenhuma wave passa da PRIME-0 sem declarar a que
métrica pirata (AARRR) serve. Wave de corretude só ganha prioridade sobre wave de receita se um
BUG estiver a bloquear a receita — senão, receita primeiro. O CEO não pergunta "está certo?";
pergunta "quem paga, quanto, e quando?".

| # | Pergunta | Origem · prova |
|---|---|---|
| G15 | **O que aprendeste ficou REGISTADO onde a próxima sessão (qualquer superfície, qualquer device) o encontra sem tu contares — E as decisões que afectam outra "cadeira" (CFO/COO/CMO/CISO/CRO/UX — ver `CONSELHO_C_LEVEL.md`) foram escritas onde essa cadeira as lê?** | Paulo-CEO 2026-08-01 · retro-prova ×3 abaixo. G13 é sobre não delegar gestos ao humano; G15 é sobre não delegar MEMÓRIA ao humano — o conhecimento tem de sobreviver à sessão E cruzar silos |

### Retro-prova da G15 (memória cross-superfície e cross-silo) — 3 falhas reais

1. A sessão CC de 11:16 fechou **sem escrever nada no vault** — o learning morreu com a sessão até
   alguém (eu) o resgatar. Memória delegada ao humano é memória perdida.
2. **Dois vaults com `.obsidian`** (D10): o `mooter_journal` escrevia no clone abandonado — o
   conhecimento ia para um sítio que a próxima sessão não lê. Registado ≠ registado no sítio certo.
3. O `custo por resposta certa` (a métrica do CFO/CRO) foi discutido 3× e nunca escrito onde a
   lente financeira o encontraria — ficou preso na conversa, invisível ao "conselho".

**A régua:** fechar uma wave sem `mooter_journal` no vault CANÓNICO é violação. Onde fica o canónico
NÃO se decide aqui — está em `AGENTS.md` § Agent boot & freshness (raiz do home, `~/paulo-vault`, fora
de Documents/OneDrive/iCloud). A precedência que o detector aplica de facto
(`packages/mooter-bridge/journal.js`) é `MOOTER_VAULT` → `VAULT_PATH` → raiz do home: se as duas
variáveis divergirem, o canónico deixa de ser mecanicamente garantido — mede antes de assumir (G11). E se a wave tocou
numa métrica de outra cadeira (custo, activação, segurança, receita, UX), essa cadeira tem de ter
o número escrito onde o lê — senão o silo vence e o MEO decide às cegas.

**Tecto 15 · 0 slots.** Entradas desde a v4 (12 perguntas, tecto 13): a G13 (procura-antes-de-delegar)
ocupou o slot que estava livre — **não** elevou o tecto; a G14 (valor de negócio) elevou 13→14 e a G15
(memória cross-silo) elevou 14→15. Todas com retro-prova ×3 do próprio dia, nenhuma da literatura.
**A partir daqui, entra uma → sai uma.** As lentes C-level NÃO entram: vivem em `CONSELHO_C_LEVEL.md`,
por rotação, porque persona-por-entrega é o inchaço que Urbach mata.
Candidatas em fila de espera, à espera de RETRO-PROVA (correr contra ≥3 falhas
reais do registo e apanhar ≥1 que as 15 não apanham):
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

- Tecto **15 efectivas**: hoje 15 + 0 slots. Entrada SÓ por retro-prova (≥3 falhas reais, apanha ≥1 nova).
  A v2 violou isto (5 entraram por autoridade da literatura numa tarde) — a v3 pagou a multa.
  A v4 respeitou-a: G11 e G12 entraram com 4 falhas medidas cada, todas do registo, nenhuma da literatura.
  A v5 respeitou-a: G13, G14 e G15 entraram com 3 falhas medidas cada, todas do próprio dia.
  Com 0 slots vale a regra do fecho: entra uma → sai uma. Elevar o tecto outra vez NÃO é alternativa
  a essa regra — exige decisão explícita do dono, registada, como a que o levou de 13 a 15.
- Pergunta que não muda nada em 3+ sessões de alto risco → o juiz distingue internalizada de
  carimbada; carimbada sai para a fila de espera.
- O log de deltas (`gauntlet:` nas declarações registadas) é o dado de calibração — N5 do Sócio.

## Fontes

CoVe 2309.11495 (números por tarefa, corrigidos na v3) · Nemeth 2001 (DA designado reforça;
nuance: estimula pensamento, mas do tipo errado) · Huang 2310.01798 (auto-crítica sem sinal
externo falha) · Reflexion 2303.11366 · CRITIC 2305.11738 · CIA Tradecraft Primer · Heuer/ACH ·
Haynes 2009 + Urbach 2014 (checklist muda comportamento ou não faz nada) · Klein/HBR (fila de
espera) · NASA NPR 7123.1 (fila de espera) · Superpowers two-stage.
