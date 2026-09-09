# Exame adversarial ao pacote inteiro — 66 achados, 35 confirmados, 5 refutados, 26 nunca verificados

Corrido a 2026-09-09 com cinco lentes independentes sobre os ficheiros do pacote (redacção, números, reprodutibilidade, estatística, fronteiras), seguidas de uma passagem que tentava **refutar** cada achado contra o ficheiro citado. Existe porque a regra R5 do masterprompt manda atacar cada cartão — e o pacote, como um todo, também é um artefacto.

## A primeira coisa a dizer é a que me incomoda

**26 dos 66 achados nunca foram verificados.** Os agentes de verificação morreram com a mesma mensagem que matou as corridas 1 e 2 do P7 — `You've hit your session limit` — porque eu os lancei na mesma janela de quota. Não estão refutados nem confirmados: estão por examinar, e ficam listados aqui com esse estado em vez de desaparecerem. Um exame que se auto-interrompe e se apresenta como completo seria exactamente o defeito que este pacote existe para apanhar.

Dos 40 que chegaram a ser verificados, **5 foram refutados** pelo próprio verificador — e em dois deles a correcção que o achado propunha teria posto um erro **novo** no slide. É para isso que a passagem de verificação existe.

## Os cinco marcados fatais

| # | Onde | O problema | Estado |
|---|---|---|---|
| **FW-01** | `08-PACOTE.md` | This is the package's own compliance claim and it is false by grep. `P3-obediencia/slide.md:16` reads «that the hook enforces or even changes a spawn». The same paragraph records that the P5 | Corrigido — a palavra saiu do slide do P3 e a alegação de conformidade passou a citar o `grep` que a sustenta |
| **FW-03** | `P8-cabeca-a-cabeca/slide.md` | «Stays … on the machine» is a positive containment claim. The measurement is a bounded negative: 35 connection events, all loopback, in 75 *tapped Node processes*, with the boundary column o | Corrigido — a célula deixou de afirmar contenção; diz o que o tap registou (35 ligações, todas loopback) e onde está o bruto |
| **R1** | `P7-usar-vs-nao-usar/analyse.mjs` | analyse.mjs:12 reads results/ledger.jsonl. That file is not in the package: P7-usar-vs-nao-usar/results/ contains only analysis.json, correr-corrida-1-invalida.log and ledger-corrida-1-inval | Corrigido — o analyse.mjs deixou de rebentar com ENOENT, o results/LEIA-ME.md diz o que é cada ficheiro, e o analysis.json órfão foi renomeado para dizer que não é resultado |
| **R2** | `P7-usar-vs-nao-usar/protocol.json` | Neither file exists on the branch that ships this package nor on main. `git cat-file -e origin/main:tools/ab/r24-prereg.json` answers "exists on disk, but not in 'origin/main'", and origin/m | Corrigido — ONDE-ESTAO-AS-FERRAMENTAS.md traz os comandos git show e os quatro sha256, com remoto e disco comparados |
| **S1** | `P8-cabeca-a-cabeca/slide.md` | This is an equivalence claim read off a non-significant test with essentially zero power, and it contradicts the card it summarises. P4's discordant pairs are 0 vs 1 on the mutants and 2 vs  | Corrigido — junto com HI-05 |

Os cinco estão corrigidos. **Nenhum era uma medição errada:** os cinco eram a cópia a dizer mais do que a medição, que é o modo de falhar deste tipo de pacote.

## Confirmados e corrigidos

| # | Grav. | Onde | Estado |
|---|---|---|---|
| FW-01 | fatal | `08-PACOTE.md` | Corrigido — a palavra saiu do slide do P3 e a alegação de conformidade passou a citar o `grep` que a sustenta |
| FW-03 | fatal | `P8-cabeca-a-cabeca/slide.md` | Corrigido — a célula deixou de afirmar contenção; diz o que o tap registou (35 ligações, todas loopback) e onde está o bruto |
| R1 | fatal | `P7-usar-vs-nao-usar/analyse.mjs` | Corrigido — o analyse.mjs deixou de rebentar com ENOENT, o results/LEIA-ME.md diz o que é cada ficheiro, e o analysis.json órfão foi renomeado para dizer que não é resultado |
| R2 | fatal | `P7-usar-vs-nao-usar/protocol.json` | Corrigido — ONDE-ESTAO-AS-FERRAMENTAS.md traz os comandos git show e os quatro sha256, com remoto e disco comparados |
| S1 | fatal | `P8-cabeca-a-cabeca/slide.md` | Corrigido — junto com HI-05 |
| FW-02 | serious | `10-NAO-PROVADO.md` | Corrigido — mesma correcção, do lado do `10-NAO-PROVADO.md` |
| FW-04 | serious | `08-PACOTE.md` | Corrigido — «nunca escolheu» passou a «0 de 40», com o contraste dos 20/20 quando o preço passa a 1e-9 |
| FW-05 | serious | `08-PACOTE.md` | Corrigido — o mesmo no cartão inglês pronto a colar |
| FW-06 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — as quatro células passaram a dizer o que foi lido na documentação do concorrente e o que não foi medido aqui |
| FW-07 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — legenda a distinguir n/d de n/a; as sete n/a passaram a ter motivo, três delas eram n/d; e o título deixou de dizer «every cell measured or n/d» |
| FW-08 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — a célula diz que o 20/20 mede o defeito D1 (sem chave a regra diz T0 a tudo), não uma escolha de routing |
| FW-09 | serious | `P3-obediencia/slide.md` | Corrigido — «never called» passou a «nenhuma das 35 chamadas locais registadas carrega a assinatura do subagente», com o método da atribuição ao lado |
| HI-01 | serious | `08-PACOTE.md` | Corrigido — o estado «P7 em curso» saiu dos quatro sítios |
| HI-02 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — «0 tokens para decidir» passou a «0 tokens para classificar», com a pré-resposta local declarada |
| HI-03 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — a célula do cliente nativo passou a n/a com motivo, e o número ficou etiquetado como custo de uma invocação inteira |
| HI-04 | serious | `08-PACOTE.md` | Corrigido — junto com FW-04 |
| HI-05 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — «Tie» passou a «não estabelecido, e é uma derrota impressa» |
| HI-06 | serious | `P8-cabeca-a-cabeca/slide.md` | Corrigido — o rodapé da tabela passou a dizer que a vitória e a derrota principal são o mesmo comportamento: a regra alcança o tier gratuito facilmente **e demasiadas vezes** |
| HI-07 | serious | `P1-decidir-custa-zero/slide.md` | Corrigido — o slide do P1 passou a nomear o ponto cego dos wrappers em processo e a limitar o alcance do «0 chamadas em 1 176 classificações» ao processo que classifica |
| R3 | serious | `P5-atestacao-de-egress/results/A.json` | Corrigido — os dois tap.jsonl resgatados do %TEMP% para results/bruto-resgatado/ (defeito D13) |
| R4 | serious | `P6-custo-na-linha/run.mjs` | Corrigido — overrides P6_DECISIONS_LOG e P6_LEDGER, e a falha deixou de ser silenciosa: em vez de «0 de 0 eventos» sai exit 2 a dizer que ficheiro falta (defeito D14) |
| R5 | serious | `P5-atestacao-de-egress/run.mjs` | Corrigido — P5_HOOK aponta o hook que os braços A medem (defeito D14) |
| R7 | serious | `P1-decidir-custa-zero/hook-events.mjs` | Corrigido — o decisions.log do home isolado do P1 resgatado do %TEMP% (defeito D13) |
| S4 | serious | `08-PACOTE.md` | Corrigido — junto com HI-01 |
| S5 | serious | `P1-decidir-custa-zero/slide.md` | Corrigido — o slide passou a imprimir o teste pré-registado dos 63 (p = 3,0×10⁻⁷) e os três estratos, com a explicação da pseudo-replicação |
| HI-10 | minor | `P1-decidir-custa-zero/slide.md` | Corrigido — a linha do segundo motor de rótulos entrou no slide, e ela inverte o sinal contra a constante |
| R11 | minor | `P3-obediencia/run.mjs` | Corrigido — o ROUTER_DIR do arreio passou a honrar P3_ROUTER_DIR, que ele próprio sobrescrevia no ambiente de cada filho (defeito D14) |
| R12 | minor | `P2-o-tier-vale-alguma-coisa/run.mjs` | Corrigido — os cinco sítios passaram a aceitar PROVAS_CLAUDE_EXE |
| S10 | minor | `P7-usar-vs-nao-usar/AMENDMENT-1.md` | Corrigido — 21 pares válidos, não 20, recontados a partir do ledger publicado |
| S6 | minor | `P1-decidir-custa-zero/slide.md` | Corrigido — o método dos intervalos fica nomeado uma vez no índice: Wilson a 95 %, McNemar exacto, binomial exacto unilateral no P7 |

## Confirmados e NÃO corrigidos — ficam impressos

| # | Grav. | Onde | O que fica por fazer |
|---|---|---|---|
| FW-10 | serious | `08-PACOTE.md` | por triar |
| FW-11 | minor | `10-NAO-PROVADO.md` | Por corrigir — nuance sobre a leitura do −94 % do P6 |
| FW-12 | minor | `P6-custo-na-linha/slide.md` | Por corrigir — nuance de redacção no P6 |
| HI-08 | minor | `P2-o-tier-vale-alguma-coisa/slide.md` | Por corrigir, e metade dele foi refutada pelo verificador: a correcção que o achado propunha poria um erro **novo** no slide do P2 |
| HI-09 | minor | `P4-critico-nao-autor/slide.md` | Por corrigir — falta um marcador na frase de fronteira do P1 |

## Refutados pelo verificador

| # | Grav. | Onde | O que a lente alegou, e que o verificador foi ao ficheiro desmentir |
|---|---|---|---|
| R6 | serious | `P1-decidir-custa-zero/protocol.json` | --all runs A, A-spawn, A-hook, B and B-rater2 only (run.mjs:243-248). It never produces results/D-tzachbon.json, yet analyse() loads it and the P1 card publishes its result ("tzachbon abstai |
| R8 | serious | `P4-critico-nao-autor/protocol.json` | setup.mjs is the only step that creates the three subject clones, and it is not in the command. Both mutate.mjs:11 and review.mjs:15 open with `const W = process.env.P4_REPOS // 'C:/Users/Pa |
| R10 | minor | `P3-obediencia/protocol.json` | The command never produces results/A-opus.json. run.mjs's last line defaults the model — `opt('--model', 'sonnet')` — so `--arm A` yields A-sonnet.json only, while analyse() globs /^(A/B)-.* |
| R9 | minor | `P7-usar-vs-nao-usar/launch-correr.ps1` | The launcher the package ships as P7's apparatus hard-codes the owner's checkout at line 7 and its log destination at line 8 ($log = 'C:\Users\Paulo Loureiro\frugal\_handoff\r24\correr-2026- |
| S7 | minor | `P8-cabeca-a-cabeca/slide.md` | «both ways» reads as «both directions of the test», which is false for the alarm comparison. The discordant pairs there are b = 2 (Codex only) / c = 0 (Opus only): mcnemarExact(2,0) gives p  |

## Nunca verificados — 26

Levantados por uma lente, **não** confrontados com o ficheiro. Podem ser reais, podem ser ruído. Quem os quiser fechar tem o ficheiro e a citação em cada linha.

| # | Grav. | Onde | O que a lente alegou |
|---|---|---|---|
| PV-01 | serious | `P7-usar-vs-nao-usar/AMENDMENT-1.md` | The same file states run 1's valid-pair count two different ways. Three times it says 20 (line 15 «com 20 pares válidos de 23», line 33 «Os 20 pares válidos da corrida 1», line 43 «às 46/46  |
| PV-02 | serious | `P7-usar-vs-nao-usar/results/analysis.json` | This is the only unlabelled analysis file in P7's results/ — its two neighbours are explicitly named `ledger-corrida-1-invalida.jsonl` and `correr-corrida-1-invalida.log`. It is a mid-run sn |
| PV-03 | serious | `08-PACOTE.md` | Three files describe P7 as still running the launch of 14:51:04Z — 08-PACOTE.md line 5, 10-NAO-PROVADO.md («**Em curso** desde 2026-09-09T14:51:04Z») and P8-cabeca-a-cabeca/slide.md («**in p |
| PV-04 | serious | `P5-atestacao-de-egress/slide.md` | This is the exact error P1 already retracted, still standing in P5. P5's corpus is n01–n20 of P1's corpus-40.json (P5/verdict.md: «20 prompts reais, n01–n20 do corpus do P1»); their `ts` fie |
| PV-05 | serious | `08-PACOTE.md` | «Nunca» is the exact word the adversary got struck. P5/adversary.md round 2 records: «P5-14 / «nunca» excede 0/40 / serious / **Aceite.** «0/40 nas duas configurações com preço 0», com o lim |
| PV-06 | serious | `P5-atestacao-de-egress/verdict.md` | The verdict names itself v3 after two rounds; 08-PACOTE.md's index cell for P5 says «3 rondas de adversário, veredicto v3.1»; and P5/adversary.md documents a third round («## Ronda 3 (sobre  |
| PV-07 | serious | `08-PACOTE.md` | Contradicted by the same file 40 lines later — «adversário Codex por cartão (P1 ×2, P2, P3, P4, P5 ×3, P6; P7/P8 depois do P7)» — and by the directory: P7-usar-vs-nao-usar/ has no slide.md,  |
| PV-08 | serious | `ERRATA-timestamps.md` | The errata's own table, six lines below, adds a fifth: the P1 row says «o `congelado_em` do protocolo (13:05:00Z) era escrito à mão e é *posterior* a todos os braços (12:57–13:04)», and P1/v |
| PV-09 | serious | `P1-decidir-custa-zero/adversary.md` | The answer recorded against attack M4 is the number the v4 verdict later retracted. P1/verdict.md prints: «Errata a `results/analysis-extra.json` → `M4_hook_latency_full.note`: dizia «corrid |
| S2 | serious | `P1-decidir-custa-zero/slide.md` | The headline comparison is the only one in the card without the paired test the same data and the same library support. The Codex adversary flagged it in round 2 («São quatro acertos de dife |
| S3 | serious | `P7-usar-vs-nao-usar/results/analysis.json` | This is an unlabelled mid-run interim analysis of the run that AMENDMENT-1 declares void, shipped under the default filename a reproducer opens. Its `at` is 2026-09-09T16:32:35.471Z, which f |
| PV-10 | minor | `09-DEFEITOS-APANHADOS.md` | D7's status claims a clean fix across the board; two of the listed files were not fixed that way. P1-decidir-custa-zero/protocol.json now reads `congelado_em: "n/d — escrito à mão (13:05Z) e |
| PV-11 | minor | `09-DEFEITOS-APANHADOS.md` | D3 names one model as Option A's pick; two other places in the package name others for the same mechanism. P3-obediencia/AMENDMENT-1.md: «o pré-cálculo Option A do hook (`ollama_call_node.js |
| PV-12 | minor | `08-PACOTE.md` | The card asserts the ordering for all 17 calls in arm B; the proof only establishes it for 6 sessions. P3/slide.md: «in the 6 sessions with both a rewrite and an Ollama call, the call preced |
| PV-13 | minor | `00-preflight.json` | The same file gives two incompatible prices for the same 137-token probe. Fourteen lines above, the probe records `"list_price_estimate_usd": "<0.001 (92*3+45*15 por M)"` — that formula eval |
| PV-14 | minor | `08-PACOTE.md` | The measurement offered as corroboration falls outside the interval it is said to corroborate: P1/verdict.md gives «cache p50 1,53 (n=132)» and results/analysis-extra.json gives p50 1.53 / p |
| PV-15 | minor | `08-PACOTE.md` | The two logs the card is drawn from do not say that. P7-usar-vs-nao-usar/verificar-2026-09-09.log is headed «R-24 · verificação de 23 tarefas (sem chamar o modelo)» and ends «23 de 23 pronta |
| PV-16 | minor | `08-PACOTE.md` | The table it describes contains 7 cells reading «n/a», not «n/d» — e.g. «n/a — no decision step», «n/a», «the "without" arm». P8's own protocol.json distinguishes them («Uma celula 'n/a' so  |
| PV-17 | minor | `P1-decidir-custa-zero/adversary.md` | The file ends on that sentence — there is no note at the end of the file, and round 2's seven attacks get no attack-by-attack response, unlike every other proof in the package (P2, P3, P4, P |
| PV-18 | minor | `P8-cabeca-a-cabeca/slide.md` | Labels the whole P4 mutant set syntactic, which is the opposite of what P4 established. P4/verdict.md separates them: «**24 mortes com o teste executado** … e **4 mortes de carregamento/pars |
| R13 | minor | `P2-o-tier-vale-alguma-coisa/protocol.json` | Three of the eight comando_reproduzir fields are prose, not command lines, so they cannot be pasted: P2 contains literal `...` and the parenthetical "(sonnet/opus so nos casos recomendados)" |
| R14 | minor | `00-preflight.json` | The 40 real prompts that carry P1's headline (and, through corpus-40.json, P3's corpus-20 and P5's prompts20) were sampled from the owner's private Claude Code transcripts, and no sampling s |
| S11 | minor | `08-PACOTE.md` | The package reports roughly eight hypothesis tests across the cards (P1: three McNemars on 63/40 plus a kappa; P2: three; P4: two) and never states that no multiplicity control was applied o |
| S12 | minor | `08-PACOTE.md` | Contradicted by the package itself: P3-obediencia/slide.md ends with «that the hook enforces or even changes a spawn». 10-NAO-PROVADO.md repeats the same false assurance («nenhuma prova as s |
| S8 | minor | `P2-o-tier-vale-alguma-coisa/slide.md` | Two gaps in the card that decides the question «o tier vale alguma coisa». (1) The B-vs-C contrast is the one the protocol names as decisive — «imprime-se tambem B vs C (separa router-escolh |
| S9 | minor | `P4-critico-nao-autor/verdict.md` | The clustering is disclosed as a fact but never carried into the intervals. Every Wilson CI in P4 (27/28, 26/28, 23/24, 22/24, and the alarm rates 2/28, 4/28) treats 28 windows as 28 indepen |

---

**Como reler o bruto deste exame:** `subagents/workflows/wf_b6829d72-523/journal.jsonl`, na pasta desta sessão do Claude Code. Cada achado traz `file`, `quote`, `problem`, `severity` e `fix`; cada verificação traz `real` e `why`, com a citação que o sustenta ou o desmente.
