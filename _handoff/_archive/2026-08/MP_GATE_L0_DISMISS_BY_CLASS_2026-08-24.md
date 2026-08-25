# MP — Gate L0 "dismiss-by-class" (2026-08-24)

Origem: workflow adversarial Fable 5 (wf_2d5f400e, 7 agentes, 3 abordagens julgadas + fusão). Colar no CC numa sessão fresca no repo frugal. Gesto 0 do corpo: `/rename gate-l0-dismiss-by-class`.

═══════════════════════════════════════════════════════════════
ADENDA G11 — LER ANTES DA FASE 0 (correção de 2 factos por medição no PC, 24/08, main@071cf58d)
═══════════════════════════════════════════════════════════════
O corpo abaixo foi produzido por agentes que leram uma visão DIVERGENTE da árvore. Duas asserções da secção "FACTOS JÁ MEDIDOS" estão ERRADAS contra o checkout real do PC (desktop-j26409q), medido por mim hoje:

- **FACTO 5 (corrigido):** `tools/cockpit/runner/triagem.mjs` linha 61 **JÁ contém** `'instrumento-nao-discrimina'` em MOTIVOS (medido: grep no checkout; git status limpo para o ficheiro). ⇒ O item "+1 linha em MOTIVOS" do CÓDIGO NOVO MÍNIMO é provavelmente **NO-OP** — confirma e segue.
- **FACTO 6 (corrigido):** `tools/cockpit/runner/classes-da-fila.mjs` e `tools/cockpit/runner/voidar-fila.mjs` **EXISTEM, tracked, com testes** (`classes-da-fila.test.mjs`, `voidar-fila.test.mjs`) — medido por `git ls-files` no PC; não modificados. Leituras anteriores confirmam: `assinatura()` (a FORMA sem os dados) vive em classes-da-fila.mjs; `planear()` (não sobrepõe decisões, dry-run por default, PILLAR_IDS fonte única) vive em voidar-fila.mjs. ⇒ A FASE 1 passa de "constrói as 3 funções" para **"AUDITA as existentes contra a spec do corpo e constrói SÓ o que faltar"** (ex.: `classesSuprimiveis()` e o escopo-por-caminho dentro de `assinatura()` podem não existir — verificar exports reais). A medição "P2 = 1 classe, 166/166" veio DESTE instrumento — não é fantasma; ainda assim, recomputa dos dados reais como o corpo manda.

Regra de decisão na FASE 0 (substitui o "pára se algum não bater" para os factos 5/6):
- Se o TEU checkout bater com esta ADENDA (ficheiros existem, motivo existe) → caminho REAPROVEITAR: audita, estende, nunca reconstruas em paralelo.
- Se o teu checkout bater com o corpo original (ficheiros ausentes) → **PÁRA e reporta**: há dois checkouts divergentes no mundo (G11 real) e isso é problema de sync ANTES de ser problema de gate.

Os factos 1–4 do corpo (curar() já drena low+motivo em tooling; tiqueCurar hospedeiro fail-closed; portoes() subtrai por:'agente'; os 320 dismiss históricos por:'dono' NUNCA se movem) foram verificados e permanecem VÁLIDOS. As 3 notas de honestidade do júri também: (a) curar() já fecha o ruído de tooling — o nicho real do gate é MED não-público com motivo:null; (b) nenhuma promessa de "destravar o L2 movendo históricos"; (c) o gate NÃO abre o L2 sozinho.

═══════════════════════════════════════════════════════════════
CORPO INTEGRAL (produzido pelo workflow; ler com a ADENDA acima aplicada)
═══════════════════════════════════════════════════════════════

MASTERPROMPT — gate-l0-dismiss-by-class (repo mooter/frugal)

gesto 0: /rename gate-l0-dismiss-by-class

OBJETIVO MEDIDO (não adjetivo): na GPU ociosa, ANTES da fila humana, auto-descartar por:'agente' — com recibo, append-only, reversível, zero-LLM — a CLASSE de achados que o dono já dismisse repetidamente e que o curar() existente NÃO fecha (MED não-público, motivo:null). Resultado a provar em números: (a) a quota dessas classes nas NOVAS chegadas à fila do dono cai para ~0; (b) o keep-rate da fila REAL restante (só decisões por:'dono') não desce e, para as classes discriminantes, sobe monotonicamente; (c) 0 achados com QUALQUER aceite do dono foram suprimidos. Sem mais cliques do dono.

═══════════════════════════════════════════════════════════════
FACTOS JÁ MEDIDOS NO REPO (não os re-descubras do zero; confirma-os no gesto 1 e pára se algum não bater)
═══════════════════════════════════════════════════════════════
Ficheiros: tools/cockpit/runner/{triagem.mjs, autopilot.mjs, f10-server.mjs}.
1. curar(fila,{cap=25}) (autopilot.mjs) JÁ escolhe todo achado low-com-motivo e fecha-o como {decisao:'descartado', por:'agente', motivo:s.motivo}. severidade(a) manda tools/|scripts/|_handoff/|.test.|test para {k:'low', motivo:'trivial'}, e o fallback (sem claim, não-público) também. ⇒ O ruído seed-value em tooling JÁ É DRENADO por curar(). NÃO o re-implementes.
2. tiqueCurar() (f10-server.mjs ~250-278) corre curar() a cada 45s, guardado por pedido.nivel>=1 E efectivo(pedido.nivel,ps)>=1 (fail-closed: se o portão 1 refutado<2% fecha, o L1 suspende-se). É AQUI que o gate entra, ao lado do curar(fila) na linha ~269. O decisoes já está em mão (lerTriagem na ~256): ZERO I/O novo.
3. portoes() (autopilot.mjs ~112) faz triados = aceite+descartado+issue − doAgente, doAgente=(por_autor.agente). ⇒ Fechos por:'agente' NUNCA poluem o denominador do L2. É a razão pela qual o gate escreve por:'agente'.
4. chaveDoRecibo(r) = r.chave (ficheiro:janela:sha do conteúdo) — ESTÁVEL. porTriar exclui chaves decididas para sempre. ⇒ Os 320 dismiss históricos por:'dono' NÃO se movem (invariante: nunca sobrepor decisão humana). Qualquer promessa de "desbloquear o L2 movendo os 320" é FALSA contra o código — NÃO a faças. O gate só age sobre achados NOVOS, ainda-não-decididos.
5. MOTIVOS (triagem.mjs ~40) = [nao-e-um-problema, ja-sabido, fora-do-que-estou-a-fazer, citacao-certa-conclusao-errada, trivial]. registarTriagem faz throw em motivo desconhecido. Falta 'instrumento-nao-discrimina'.
6. classes-da-fila.mjs (assinatura) e voidar-fila.mjs (planear) NÃO EXISTEM na árvore. Têm de ser construídos, mínimos. A medição "P2=1 classe, 166/166" vem de instrumento inexistente — não confies nela; recomputa tudo dos dados reais.

NICHO REAL (o único onde este gate acrescenta sobre o curar()): severidade() devolve motivo:null exatamente em med não-público (claim && !publico) e med público (publico && !claim). O gate NUNCA toca público (guardrail). Sobra: claim && !publico — números em código enviado que o probe marca como claim e o dono dismisse repetidamente (falso-positivo de deteção de claim em código não-público). É a classe que curar() não fecha e que o dono continua a triar à mão.

═══════════════════════════════════════════════════════════════
PEÇAS A REAPROVEITAR (exatamente estas; não inventes regime paralelo)
═══════════════════════════════════════════════════════════════
- triagem.mjs: lerTriagem (Map decisoes, última-decisão-por-chave vence), registarTriagem (append-only, valida motivo), chaveDoRecibo, ehAchado, porTriar (fila = só chaves não-decididas, já traz resultado_resumo/evidencia/ficheiro/pilar), contarTriagem (por_autor/por_motivo — o instrumento de medição).
- autopilot.mjs: severidade() e SEV_PUBLICO/SEV_INTERNO (o gate senta ESTRITAMENTE atrás dela: só entra o que já é low OU med não-público; high/público impossível por construção), a FORMA do acto de curar() {chave,decisao,por:'agente',motivo,nota,recibo}, cap=25, portoes()/doAgente, MIN_TRIADOS=20 reusado como limiar N.
- f10-server.mjs: tiqueCurar como hospedeiro (mesmo fail-closed, mesmo decisoes já lido).
- voidar-fila.planear NÃO existe ⇒ constrói planear() novo mas COM a mesma disciplina que o CLI de voidar teria: {registos,activos,decisoes}, --dry-run por default, nunca sobrepor decisão.

CÓDIGO NOVO MÍNIMO (alvo total < ~90 linhas):
- assinatura(recibo) em novo tools/cockpit/runner/classes-da-fila.mjs (~25 linhas): a FORMA sem os dados, ESCOPADA POR CAMINHO. Devolve string `${pilar}|${escopo}|${forma}` onde escopo = SEV_PUBLICO.test(f)?'publico': SEV_INTERNO.test(f)?'interno':'enviado' (reusa os regex existentes — path-scope de graça e fiável), e forma = a evidência com todo literal/número/identificador mascarado para placeholder. É o que impede fundir P2-em-tools com P2-em-packages (a falha central da crítica ao discriminador-na-fonte).
- classesSuprimiveis(decisoes,{n=MIN_TRIADOS}) no mesmo ficheiro (~30 linhas): função PURA. Dobra decisoes SÓ de por:'dono' por assinatura(). Uma assinatura qualifica-se SSE: descartes_dono>=n E aceites_dono+issues_dono==0 E TODA a instância é escopo!=='publico' E severidade(instância).k!=='high'. Devolve Map<assinatura,{n,motivoDominante}>. Recomputado a cada leitura — fonte de verdade única, sem 2ª lista persistida.
- planear(fila, suprimiveis, decisoes,{cap=25}) no mesmo ficheiro (~20 linhas): para cada achado da fila cuja assinatura∈suprimiveis, não em decisoes, escopo!=='publico' e k!=='high', emite {chave,decisao:'descartado',por:'agente',motivo:'instrumento-nao-discrimina',nota:`gate L0 classe: ${n} dismiss do dono, 0 aceites`,recibo:a}. Nada escreve; devolve o plano.
- +1 linha em MOTIVOS: 'instrumento-nao-discrimina' (afirma sobre o INSTRUMENTO — "sem valor probatório" — nunca "é falso"; a lista fechada estende-se de propósito, com recibo).
- ~4 linhas em tiqueCurar: unir actos de curar(fila) com planear(fila, classesSuprimiveis(decisoes), decisoes), dedupe por chave, cap da união = 25.

═══════════════════════════════════════════════════════════════
FASES — cada uma um PR próprio, cada uma um GATE NUMÉRICO medido (nunca adjetivo)
═══════════════════════════════════════════════════════════════
Trabalha em branch (nunca no default). git é a custódia: cada fase = 1 commit + 1 PR. Não passa à fase seguinte sem o gate numérico da anterior verde e o número colado no PR.

FASE 0 — scout de confirmação (PR: doc, zero código de produção). Confirma no repo os factos 1-6 acima. GATE: um relatório com 6 asserções, cada uma citando ficheiro:linha. Se qualquer uma falhar (ex.: assinatura já existir, ou portoes contar por:agente), PÁRA e reporta — o desenho muda. Mede também o baseline atual: contarTriagem sobre o ledger real → {por_triar, aceite, descartado, issue, por_autor, por_motivo} e a precisao atual = (aceite+issue)/(triados). Cola os números.

FASE 1 — assinatura() + classesSuprimiveis() + calibração offline (PR: classes-da-fila.mjs + teste, NADA ligado ao loop). Constrói as 3 funções puras. Escreve calibrar-classes.mjs (corre UMA vez, fora do loop) que:
 - lê o triagem.jsonl real, FILTRA por:'dono' (nunca conta os próprios voids do agente — senão a calibração auto-valida-se);
 - deriva classesSuprimiveis;
 - faz backtest leave-one-out sobre CADA decisão por:'dono': aplica o predicado e conta matriz de confusão.
GATE NUMÉRICO (bloqueante):
 - FP (suprimido ∧ dono-manteve: aceite/issue) = 0. Se != 0, o PR NÃO entra. Este é o número de segurança.
 - Para cada assinatura qualificada imprime: n_dismiss_dono, n_aceite_dono(=0 obrigatório), escopo, k, motivoDominante.
 - keep-rate PROJETADO da fila pós-gate = keeps_dono / (decisões_dono que o gate NÃO suprimiria) ≥ keep-rate atual. Imprime ambos lado-a-lado. Como só removes classes 0-keep, tem de ser monótono; se descer, há bug — pára.
 - reconcilia a contagem por assinatura com contarTriagem().por_motivo (a "concordância com classes-da-fila" do teto de prontidão).

FASE 2 — DRY-RUN vivo que MOSTRA o número ANTES de aplicar (PR: endpoint/CLI de plano, ainda sem escrever no ledger). Adiciona um modo que corre no servidor mas em --dry-run por DEFAULT: computa planear(fila, classesSuprimiveis(decisoes), decisoes) e devolve, SEM escrever: quantos achados suprimiria AGORA, por assinatura, com o escopo de cada, e a projeção do keep-rate da fila restante. ORDEM OBRIGATÓRIA: este plano é emitido como recibo e mostrado ao dono no painel (bucket por_motivo/"o que o gate faria"). SÓ se aplica com o dono a ver o número — o apply exige flag explícita (--aplicar) ou toggle no painel; nunca auto-aplica em silêncio na primeira vez. GATE NUMÉRICO: o dry-run tem de bater EXATAMENTE com a matriz de confusão da calibração da Fase 1 (mesmas assinaturas, mesmas contagens) sobre o mesmo ledger. Divergência = fonte de verdade a divergir = bug; pára.

FASE 3 — ligar ao loop, atrás do mesmo fail-closed (PR: ~4 linhas em tiqueCurar). Une os actos de planear() aos de curar(), dedupe por chave, cap 25 partilhado. Herda a guarda: só com nivel>=1 e efectivo>=1. GATE NUMÉRICO (corre N tiques num device real ou fixture com fila nova): (a) quota das classes-alvo nas NOVAS chegadas a porTriar cai de X% para ~0; (b) contarTriagem: por_autor.dono para essas classes deixa de crescer, por_autor.agente absorve-as; (c) precisao medida por portoes() sobe ou mantém — nunca desce; (d) 0 supressões de chaves com aceite. Cola os quatro números no PR.

═══════════════════════════════════════════════════════════════
GUARDRAILS EXPLÍCITOS (invariantes; qualquer violação = o gate está errado, não os dados)
═══════════════════════════════════════════════════════════════
- NUNCA suprimir uma assinatura com QUALQUER aceite/issue do dono. Um único aceite no triagem.jsonl (append-only, última-vence) desqualifica a assinatura inteira para sempre, e como o Set é recomputado a cada tique, a supressão levanta-se sozinha no tique seguinte. O ground-truth do dono ganha sempre.
- NUNCA high/público. O gate senta atrás de severidade(): escopo==='publico' ou k==='high' são impossíveis por construção (regex de caminho, fiável — não dependas do eixo claim, que degrada na cópia magra).
- Append-only, reversível: cada supressão é um append por:'agente'; uma errada reverte-se com OUTRO append, nunca apagar. Motivo é 'instrumento-nao-discrimina' = "sem valor probatório", NUNCA "é falso" — o gate não lê os achados um a um.
- Fonte de verdade ÚNICA: o Set é sempre recomputado do triagem.jsonl; nenhuma 2ª lista persistida. (Se alguma fase quiser escrever config, essa config NÃO pode ser a autoridade da supressão — a derivação viva é.)
- Recibo para tudo: registarTriagem + a cópia magra do recibo em cada acto.
- Zero-LLM, determinístico. Cap 25/tique. Dry-run por default.
- git = custódia: branch, 1 PR por fase, número colado no PR, nunca commit no default.

═══════════════════════════════════════════════════════════════
TESTE QUE PROVA (obrigatório, entra na Fase 1 e re-corre na Fase 3)
═══════════════════════════════════════════════════════════════
teste-gate-classe.mjs, sobre o triagem.jsonl real (por:'dono') + uma fila nova sintética:
 1. keep-rate da fila REAL pós-gate ≥ keep-rate pré-gate (assert monótono; imprime os dois %).
 2. 0 achados com aceite/issue do dono foram suprimidos (varre todos os actos por:'agente'/'instrumento-nao-discrimina' e cruza com decisoes por:'dono' aceite/issue; assert == 0).
 3. nenhum acto do gate tem escopo==='publico' nem k==='high'.
 4. injecta um aceite do dono numa assinatura suprimível e assert que ela desaparece do Set no recompute (auto-cura).

═══════════════════════════════════════════════════════════════
VALIDAÇÃO AUTOMÁTICA ATÉ CONFIANÇA — o gate só é "PRONTO" quando os TRÊS passam
═══════════════════════════════════════════════════════════════
(1) CONCORDÂNCIA: o dry-run (Fase 2) bate exatamente com a derivação de classesSuprimiveis/contarTriagem().por_motivo — mesmas assinaturas, mesmas contagens, sobre o mesmo ledger. Se divergir, há duas fontes a divergir: pára.
(2) FILA CAI PARA SÓ-SINAL: aplicado num device real (nivel>=1, portão 1 aberto), correr N tiques e medir por porTriar/contarTriagem que a quota das classes-alvo nas novas chegadas → ~0 e por_autor.dono para essas classes deixa de crescer, sem que a precisao do L2 desça.
(3) ADVERSÁRIO: um SEGUNDO agente, em sessão fresca e motor diferente, recebe só o triagem.jsonl + o log de supressões por:'agente' e tenta encontrar UMA supressão indevida (uma classe que o dono às vezes manteria, ou um toque em público/high, ou uma assinatura grosseira que fundiu duas classes). Confirma 0 supressão indevida, por escrito, citando os dados. Se encontrar uma, sobe N (ex.: 40) ou afina a granularidade de assinatura() e re-corre os três — até o adversário não encontrar nada.

Nota de honestidade a manter no PR final: este gate NÃO abre o L2 sozinho — o L2 exige 20 triados por:'dono' a >=70%, que depende do trabalho dos pilares, não deste gate. O que o gate entrega é medível e limitado: impede que o ruído dessas classes CRESÇA a fila do dono e o denominador. Se, removido o ruído, até as classes discriminantes ficarem <70% mantidas, isso não é falha do gate — é o gate a revelar que os pilares precisam de trabalho, em vez de o esconder. Alinhado com o "não adivinha números" do projeto.