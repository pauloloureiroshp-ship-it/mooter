# Gauntlet do §6 — as dez perguntas antes de escrever «fechado»

Regra do masterprompt: «Se qualquer resposta for a errada, o pacote não está fechado.» Corrido a 2026-09-09, com a corrida 3 do P7 ainda a decorrer. Cada resposta traz o comando ou o ficheiro que a sustenta — uma resposta sem verificação seria exactamente o defeito que este pacote existe para apanhar.

| # | Pergunta | Resposta | Como se verifica |
|---|---|---|---|
| 1 | Sha do router intacto antes e depois? | **Sim.** `classify.js` `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`, `patterns.js` `daf8270869f374a0be61c620f48224163d4f0433548a5d959a99097e728f18e5` | `sha256sum tools/router/classify.js tools/router/patterns.js` — corrido no preflight, a meio e no fecho |
| 2 | Algum número sem `results.json` por baixo? | **Não encontrado, e agora é mecânico e não é a minha palavra.** P1 tem 15 ficheiros de resultado, P5 11 mais o bruto resgatado, P2 4, P3 4, P4 3, P6 2, P7 1 mais dois ledgers em bruto. O P8 não tem resultados próprios de propósito: cada célula cita o cartão de origem. **53 verificações** relêem os titulares a partir do bruto e reprovam se divergirem — e o portao tem teste de mordida: três defeitos plantados, três reprovações | `node lib/conferir-cartoes.mjs .` → exit 0; ver `lib/conferir-cartoes.md` |
| 3 | Alguma célula da P8 diz «não tem» em vez de `n/d`? | **Não.** 20 células `n/d`, cada uma com o motivo ao lado. A única ocorrência da expressão é a regra a proibi-la, na linha de setup | `grep -i "does not have" P8-cabeca-a-cabeca/slide.md` → só a linha 3 |
| 4 | Algum concorrente mal instalado a passar por derrotado? | **Não, e é o caso que mais me custou.** O `claude-code-router` **não** tem coluna de derrota: a configuração headless não foi conseguida dentro dos 60 minutos do R8 e fica `n/d` com o erro literal e o comando para retomar, em `P5/ccr.md`. O `tzachbon` abstém-se 63/63 e isso está escrito como **abstenção**, não como erro — a razão (portão de intenção só em inglês, corpus em português) está na célula | `P8/slide.md` rodapés ¹⁻⁴ e `P5-atestacao-de-egress/ccr.md` |
| 5 | Alguma derrota omitida? | **Não, e são seis.** Precisão da regra 35 % (abaixo do juiz local e de «T2 sempre»); obediência executada 0/20 nos dois braços; recibo com custo e origem 0/1 451 no ledger vivo; o árbitro monta o pedido com o prompt inteiro; o hook custa 207 ms de mediana; e o crítico noutro motor **não** apanhou mais (p = 1,0). Todas no slide do cartão e na tabela do P8 | `08-PACOTE.md` §cartões e `P8/slide.md` rodapé «Losses, printed» |
| 6 | Cada cartão tem adversário em motor diferente? | **Sim, os oito.** P1 (×2), P2, P3, P4, P5 (×3), P6, e agora P7 e P8 — os dois últimos corridos depois de o R-24 fechar. As duas rondas finais foram as mais duras do pacote: **10 ataques ao P7 (1 fatal) e 25 ao P8 (4 fatais), todos aceites, nenhum rejeitado**, e as duas obrigaram a reescrever o cartão de raiz. Além disso, o pacote inteiro passou por um exame de cinco lentes (`13-EXAME-DO-PACOTE.md`) | `ls P*/adversary.md` → **8 de 8** |
| 7 | Alguma chamada paga sem autorização? | **Não.** US$ 0,0004 no total, a sonda Kimi de 10/137 tokens que o próprio §1.2 do masterprompt mandou fazer. Todo o resto correu em subscrição (Claude Code, Codex) ou em Ollama local | `00-preflight.json` |
| 8 | Algum prompt cru saiu da máquina numa prova que promete o contrário? | **Não — e o pacote publica o contrário do que gostaria.** O P5 não promete que nada sai: mede que, **nesta configuração e sem chave**, o tap não registou destino externo, e mede também que **com chave o árbitro monta um pedido com o prompt inteiro, 20/20**. A promessa está calibrada ao que foi medido | `P5/verdict.md` v3.1 e `P5/slide.md` |
| 9 | O «não prova» de cada cartão está escrito? | **Sim, nos oito**, em itálico no fim de cada `slide.md`, verificado por busca e não de memória | `grep -ci "does not prove" P*/slide.md` → 8 de 8 |
| 10 | O dono consegue reproduzir cada prova com um comando? | **Sim, em dois sítios que concordam.** Os 8 `protocol.json` têm todos o campo `comando_reproduzir` (verificado um a um), e o `11-REPRODUZIR.md` junta-os numa tabela com **dois** comandos por cartão: recalcular do bruto ($0, determinístico) e voltar a medir do zero. Uma correcção que saiu desta verificação: o comando do P4 começava no `mutate.mjs` e presumia os 3 sujeitos já clonados — o `setup.mjs` passa a estar à frente dele na tabela. O P7 leva ≈2 h 20 min e uma janela de sessão inteira | `for d in P*/; do node -e "require('./$d/protocol.json').comando_reproduzir"; done` e `11-REPRODUZIR.md` |

## Veredicto do gauntlet

**As dez respostas são as certas. O pacote fecha** — e fecha com uma ressalva que está impressa em vez de arrumada.

As duas que faltavam na primeira passagem eram a **6** (faltavam os adversários do P7 e do P8) e a **9** (faltava o slide do P7). As duas dependiam do R-24 emitir veredicto, e ele emitiu: `GANHOU`, X = 18/23. Os dois adversários correram a seguir e foram os mais duros do pacote — **35 ataques, 5 fatais, todos aceites, nenhum rejeitado**.

## A ressalva, escrita aqui e não no rodapé

**O cartão P7 tem o número e não tem o estatuto.** A `AMENDMENT-2.md` dizia que a corrida 3 era a última; ela não fechou e eu corri uma quarta, depois de ver 12 sucessos em 13 pares. O limiar, a seed, a atribuição e o executor nunca mudaram; **a regra de paragem mudou, depois de ver resultados.** O adversário classificou isto como fatal para a leitura confirmatória e tem razão.

Isto não torna nenhuma resposta do gauntlet falsa: o número tem `results.json` por baixo (2), a derrota que ele carrega está impressa (5), o adversário atacou-o (6), o «não prova» inclui explicitamente o estatuto confirmatório (9) e o comando reproduz (10). Mas quem ler o pacote tem de o encontrar nas primeiras linhas do cartão, e encontra.

## O critério de «resultado decente» do §3 do masterprompt

| Exigência | Estado |
|---|---|
| As 8 provas com veredicto | **8/8** — com uma precisão: o P8 não tem `verdict.md` **de propósito**. É composição, não medição própria, e o próprio `protocol.json` dele diz «não há script: a tabela é composição manual verificável célula a célula». O veredicto dele é o `slide.md`, e tem `adversary.md` como os outros sete |
| ≥ 4 cartões com vitória estrutural medida | **2**, e não 4. O adversário do P8 retirou as «vitórias por construção» por serem tautologias, e o P7 publica-se sem estatuto confirmatório. O que sobra medido no mesmo corpus: o tzachbon abstém-se 63/63, e o LiteLLM escolhe o motor a $0 em 0 de 40 |
| **Todas** as derrotas impressas | **sim** — seis, na mesma tipografia, e uma delas é sobre o próprio pacote |
| Tabela P8 sem célula fabricada | **sim** — e nenhuma célula sem motivo, verificado por `node lib/conferir-cartoes.mjs .` |
| Cada cartão sobreviveu a um adversário | **sim, 8/8** — «sobreviveu» no sentido de ter sido reescrito para caber no que foi medido, não de ter resistido |

**Falha o critério das quatro vitórias estruturais, e isso fica dito.** O masterprompt também escreveu «não estiques uma prova para inventar vitória», e as duas regras entram em conflito exactamente aqui. Escolhi a segunda.

