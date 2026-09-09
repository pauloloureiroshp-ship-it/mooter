# 08 · PACOTE DE PROVAS v1 — «onde o Mooter ganha, medido contra quem existe» (2026-09-09)

**O que é.** Oito cartões (P1–P8), cada um com protocolo pré-registado, corrida, veredicto, slide em inglês e um adversário noutro motor (Codex CLI). Vitórias por construção, empates e derrotas com a mesma tipografia. Nenhum número sem medição (`n/d` quando não há); nenhuma poupança em % ou $; nenhum «privado/seguro/enforces/most accurate».

**Estado no fecho deste ficheiro:** P1–P6 fechados; P8 composto; **P7 em curso** (R-24, 23 tarefas × 2 braços, lançado 2026-09-09T14:51:04Z; o cartão P7 e a linha correspondente do P8 são actualizados quando o controlador emitir o veredicto).

## Índice

| # | Pergunta | Veredicto em uma linha | Ficheiros |
|---|---|---|---|
| P1 | Decidir custa zero? E acerta? | **0 tokens de inferência, 0 hosts externos para classificar; o hook custa 207 ms (p95 1,27 s); a regra acerta 35 % em 40 prompts reais — perde para um juiz local (52,5 %) e para «sempre T2» (45 %)** | `P1-decidir-custa-zero/` (protocolo, corpus-40/63, rótulos cegos, `run.mjs`, veredicto v3, slide, 2 rondas de adversário) |
| P2 | O tier vale alguma coisa? | **Política local/Haiku por tier: 17/20 aceites; local só: 7/20; Haiku em tudo: 19/20 — sem chave, esta máquina dá 7/20** | `P2-o-tier-vale-alguma-coisa/` (holdout-10 revisto pelo Codex, AMENDMENT-1, veredicto v2) |
| P3 | Obediência > 0? | **Executada: 0/20 nos dois braços.** 7 spawns do subagente local em 40 sessões, nenhum chamou o modelo local; 8 tentativas de rewrite registadas, aplicação não verificada | `P3-obediencia/` (corpus-20, `pretooluse-route.js`, AMENDMENT-1, veredicto v2) |
| P4 | Crítico ≠ autor apanha mais? | **Não estabelecido:** Codex 26/28 vs Opus 27/28; alarmes 4/28 vs 2/28; p = 1,0; 59/59 referências resolvem para linhas existentes; autoria não testada | `P4-critico-nao-autor/` (28 mutantes + 28 originais, `review.mjs`, veredicto v2) |
| P5 | O que sai da máquina para decidir? | **Nenhum destino externo registado num *tap* de 75 processos Node (sem chave, D1)**; o árbitro construiria pedidos com o prompt inteiro; LiteLLM nunca escolheu o deployment a preço 0 (0/40); nativo ~40 CONNECT e 1,62 MB cliente→proxy por invocação, 4 hosts incl. Datadog; ccr `n/d` | `P5-atestacao-de-egress/` (net-tap, counting-proxy calibrado, mock-llm, 2 emendas, 3 rondas de adversário, veredicto v3.1) |
| P6 | Cada turno tem custo com origem? | **Ledger vivo: 0/2 157 eventos com custo e origem; protótipo: 156/156 numa corrida instrumentada, não no produto;** preço de lista input/output = 6 % do que o host reporta, e a cache a 1 h reconstrói o host com resíduo 0 em 20/20 | `P6-custo-na-linha/` (`tools/router/cost-line.js` + 15 testes, AMENDMENT-1, veredicto v2) |
| P7 | Usar é diferente de não usar? | **Em curso** — R-24 pré-registado pelo dono (2026-09-04): 23 tarefas reais, TVA ≤ 0,8×, limiar 16/23, ITT | `P7-usar-vs-nao-usar/` (protocolo por referência, `launch-correr.ps1`, logs do aparelho 23/23 + 23/23) |
| P8 | Onde ganha, contra quem existe? | **Tabela de 9 linhas × 5 colunas, cada célula medida ou `n/d` com motivo** | `P8-cabeca-a-cabeca/slide.md` |

Transversais: `00-preflight.json` (máquina, versões, chaves por nome, concorrentes, corpus), `09-DEFEITOS-APANHADOS.md` (D1–D10, do produto e dos meus instrumentos), `10-NAO-PROVADO.md`, `ERRATA-timestamps.md`, `lib/` (stats, net-tap, counting-proxy + calibração, mock-llm, adversário).

## Os oito cartões (inglês, prontos a colar; o texto integral está em cada `slide.md`)

### P1 · Classifying costs no inference — and, on these 40 sampled prompts, the rule is wrong more often than "always T2"
0 inference tokens, 0 external hosts to classify (1,176 classifications, 270 tapped processes). Rule 0.002 ms median in-process; **the hook is not free: 207 ms median / 1,272 ms p95**, ~870 bytes of hint per prompt, local pre-answer timed out 75/75. Accuracy vs blind labels on 40 real prompts: rule **35.0 % [22.1, 50.5]**, local 14B judge 52.5 % [37.5, 67.1], constant T2 45.0 % [30.7, 60.2]; McNemar judge > rule p = 0.059. Training set 88.6 % vs 82.9 % vs 14.3 %. Kappa between label engines 0.50. tzachbon abstains 63/63; ccr/LiteLLM have no classifier (n/d). *Does not prove: commercial value; obedience; > 500 chars; that the blind label is truth; the keyed/arbiter configuration.*

### P2 · On 20 synthetic tasks, the local/Haiku policy got 17 accepted; local alone 7; Haiku on all 19
Policy 85 % [64, 95]; local only 35 % [18, 57]; Haiku everywhere 95 % [76, 99]. Paired policy vs local 10 to 0 (p = 0.001); Haiku-everywhere is 2 answers better and the policy skips 7 short Haiku calls. **Without a key — this machine — the rule says T0 on 20/20 and the offline composition is 7/20.** ~800 output tokens, 16–48k cached tokens, 8 s per Haiku call; subscription, list estimate US$ 1.32 for 20 calls (not an invoice). *Does not prove: intelligent selection; T2/T3; the product end to end.*

### P3 · Executed obedience: 0/20 in both arms — the local subagent was spawned 7 times in 40 sessions and never called the local model
Native 4/20 sessions spawned a subagent (3 local); with a PreToolUse rewrite hook 8/20 (4 local); **delegation executed locally 0/20 · 0 % [0, 16] in both**; Haiku spawns 0/20. All 35 recorded Ollama calls carry the router hook's own pre-answer signature (256-token cap), in B all before the rewrite timestamp. 8 rewrite attempts logged; application unverified. Decision at spawn n/d (one machine-wide file every session overwrites, D10). *Does not prove: obedience above zero; any hook effect; behaviour with a key.*

### P4 · On 28 selected test-killed mutants, an Opus reviewer scored 27/28 and a Codex reviewer 26/28; superiority of the second-engine critic was not established
Recall 96 % [82, 99] vs 93 % [77, 98]; findings on 28 unmutated windows 2/28 vs 4/28; offsets all 0; references resolving to an existing line 29/29 and 30/30 (relevance not assessed). McNemar p = 1.0 both directions; 53/56 windows agree. Deterministic selection (first killed, 15 files, 8/12 operators); target line marked in both groups. **Neither engine wrote the code it reviewed: nothing about self-review.** Opus ≈ US$ 0.51 list per window; Codex tokens n/d.

### P5 · No external destination recorded by a socket tap on 75 Node processes while the Mooter hook decided 20 real prompts — API key absent, live budget defect forced T0
35 connection events, all loopback; bytes n/d; block mode: 0 attempts to block. Arbiter (fake key, 20 instrumented invocations): 20/20 constructed requests carry the whole prompt to api.anthropic.com. LiteLLM cost routing: zero-priced deployment selected 0/40, 20/20 when priced 1e-9; forwards the prompt (presence 20/20). ccr n/d (headless config blocked). Native per invocation through the proxy: 4 hosts, median 40.5 CONNECT, 1.62 MB client→proxy, Datadog intake tunnel in 20/20 (median 187 kB); 13/20 `is_error`, causes unverified. Local logs: 752 home-path matches, 1,390 prompt-preview lines. *Does not prove: device-level egress; SOC 2/DPA; real key on the network; real providers.*

### P6 · Prototype cost-line coverage: 156 records in one instrumented run. Not yet emitted by the installed product
Live ledger 2,157 events, 0 with a cost and its origin (479 `cost_usd: 0` without saying why, 478 recorded as `deferred`). Prototype: 156/156 records with cost basis, declared origin and token fields; 63 rule records are synthetic zeros by policy. 20 Haiku calls: input/output list price US$ 0.079605 vs CLI-reported US$ 1.318525 (Δ −94 %); adding cache counts at the 1-hour write rate reconstructs US$ 1.3185247 — residual 0 on 20/20 (exploratory; multipliers not in our price table). 15 unit tests with hand-computed values. **Instrumentation, not savings or verified billing.**

### P7 · Using Mooter vs not using it — R-24, 23 real repo tasks, pre-registered 2026-09-04
**In progress.** Time-to-green with a mechanical test, no judge; Z = 1 iff TVA_ON ≤ 0.8·TVA_OFF and ON passes; one-sided exact binomial, α 0.05, threshold 16/23; intention-to-treat. Apparatus verified today at $0: 23/23 tasks fail in the parent, 23/23 pass in the child. Result semantics: WON / LOST / INVALID, printed as the controller emits it. *(Card to be completed from `_handoff/r24/ledger.jsonl` and the controller's `--analisar` output.)*

### P8 · Head-to-head, measured on one machine
See `P8-cabeca-a-cabeca/slide.md` (9 rows × 5 columns, footnotes with versions/commits/config). Wins by construction: deciding stays in Node processes at 0 inference tokens; a $0 local tier is reachable by rule where LiteLLM's cost routing never picked a zero-priced deployment. Tie: critic ≠ author on syntactic mutants. Losses printed: rule accuracy on real prompts; executed obedience 0/20; cost line not in the product; the arbiter would ship the raw prompt; the hook is not free.

## Correcções ao deck (v3 de 2026-09-02, `book-text-2026-09-02-v3.md`) — o que este pacote substitui

| Onde no deck | O que diz hoje | O que a prova mediu | Acção |
|---|---|---|---|
| Capa (l.6), cap. 02 (l.268, 392, 408, 427, 438, 451) | «the sizing step sends nothing out» · «$0 · 0 bytes · on the machine» · «[declared · by construction] no socket» | P5: **nenhum destino externo registado** num *tap* de 75 processos Node, 20 prompts, **sem chave e com D1**; com chave o árbitro constrói pedidos com o prompt inteiro (20/20). Bytes do hook: n/d | Passar de [declared] a **[measured]** com a fronteira escrita: «no external destination recorded by a socket tap on Node processes; with an API key the arbiter sends the prompt». Retirar «0 bytes» (não medido) e «never leaves the machine» |
| l.230 «classify.js p50 1.6–1.9 ms»; CLAUDE.md «1 ms cached, 134 ms p50 when it spawns» | latência da regra/do hook | P1: regra 0,002 ms mediana em processo; **hook 207 ms mediana / 1 272 ms p95** por prompt nesta máquina; pré-cálculo local 75/75 expirado (D3) | Substituir pelos dois números com a fonte; retirar «134 ms» |
| SYNC/01-ESTADO «91,4 % (treino)» | precisão do classificador | P1: **35 % [22, 51] em 40 prompts reais** contra rótulo cego; 88,6 % no treino; perde para juiz local e para «sempre T2» | Imprimir a derrota ao lado do 91,4 % de treino |
| l.189, 197 «advises today; enforces once wired»; 01-ESTADO «obedience 0 %» | obediência | P3: **0/20 executadas** nos dois braços; 7 spawns locais sem execução; hook chega a 8/8 spawns, aplicação não verificada; decisão por máquina (D10) | Manter «advises»; acrescentar o número medido e o defeito D10 como próximo passo |
| l.222, 278, 386, 446 «Critic ≠ author … by hand / to wire» | crítico | P4: motor diferente **não** apanhou mais (26/28 vs 27/28, p = 1,0); 59/59 referências resolvem; autoria não testada | Reescrever como «a second engine did not catch more planted defects; every finding carries a checked file:line» — sem «provenance verified» |
| l.88, 206, 223, 235, 276, 489 «receipt per request … cost per turn after the fact by a script» | recibo/custo | P6: ledger vivo **0/2 157** com custo e origem; protótipo 156/156 não integrado; SSOT sem cache (explica −94 %) | «Today: 0 of 2,157 ledger events carry cost + origin; prototype line exists, not shipped» |
| l.208, 417, 437 «your own hardware first at $0» | tier local | P2: sem chave a regra diz T0 em 20/20 e o local aceita 7/20; P5-D: LiteLLM nunca escolheu o deployment a preço 0 (0/40) | Ligar a frase ao P2 (7/20 vs 17/20 vs 19/20) e ao contraste com o LiteLLM, sem «$0 saved» |
| l.264, 306, 444 «$0*», «list-price yardstick never a saving» | régua | mantém-se; P6 confirma que a régua de lista é 6 % do host sem cache | Sem alteração; anexar o P6 |
| l.390 «Local-first. Inside the host, never a proxy» | posicionamento | P5: LiteLLM reencaminha o prompt inteiro; ccr n/d; o hook do Mooter não está no caminho do tráfego (medido: 0 destinos externos ao decidir) | Manter, com a célula do P8 ao lado |
| l.471 «P0.0 verified 303/303 (declared)» | verificação | não medido neste pacote | Sem alteração; continua [declared] |

**Palavras proibidas (§4):** nenhum cartão usa «% saved», «$ saved», «enforces», «private», «secure», «most accurate». O adversário do P5 apanhou «privado/seguro» em negação no veredicto v2; removidos.

## Como foi feito (para quem reproduz)

- Regras R1–R10 do MP: pré-registo commitado antes da corrida (P3–P7; P1/P2 têm protocolo e resultados no mesmo primeiro commit — declarado), `classify.js` e `patterns.js` congelados e verificados por sha, adversário Codex por cartão (P1 ×2, P2, P3, P4, P5 ×3, P6; P7/P8 depois do P7), 0 US$ de API paga, subscrição e Ollama, concorrentes instalados em isolamento com 60 min de tecto.
- Cada prova tem `comando_reproduzir` no `protocol.json`; os brutos estão em `results/`; as emendas em `AMENDMENT-n.md`; os defeitos apanhados (do produto **e** dos meus instrumentos) em `09-DEFEITOS-APANHADOS.md`.
