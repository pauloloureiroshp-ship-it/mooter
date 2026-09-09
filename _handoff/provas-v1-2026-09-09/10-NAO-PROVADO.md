# 10 · O que NÃO ficou provado (e porquê)

Lista única, por prova, do que o pacote **não** demonstra — o que os protocolos excluíram, o que os adversários derrubaram e ficou por resolver, e o que ficou `n/d` com o bloqueio literal. Nada aqui é «ainda não fizemos porque não quisemos»: cada linha tem a razão.

## Transversal

- **Poupança em % ou $** — proibido pelo MP (§4) e por decisão do dono (2026-08-24). Nenhuma prova a calcula. **Correcção de 2026-09-09:** a frase dizia também «nenhum slide a insinua», e o adversário do P6 tinha registado o contrário — que o «−94 %» pode ler-se como poupança por quem só vê o número. O slide do P6 responde a isso com uma frase própria («instrumentation, not savings or verified billing»), o que é a mitigação certa, mas não autoriza este ficheiro a afirmar que nenhum slide o insinua. O que se pode afirmar é mais estreito: **nenhum slide calcula nem alega poupança, e o único número que se lhe podia confundir vem com a negação ao lado.**
- **«Privado», «seguro», «enforces», «most accurate»** — palavras proibidas; nenhuma prova as sustenta. **Correcção de 2026-09-09:** a frase que aqui estava dizia que os slides não as usam, e um `grep` sobre os slides devolvia **um** acerto — `enforces` no slide do P3, dentro da linha «o que isto não prova». Era negação, não afirmação, mas a regra do MP é sobre a palavra e a frase daqui era falsa como estava escrita. A palavra saiu do slide; a verificação é `grep -ril "enforces\|most accurate\|private\|secure" P*/slide.md`, que agora devolve zero.
- **Representatividade além desta máquina** — tudo foi medido num Windows 11 com RTX 4090, Claude Code 2.1.224, Ollama local, sem `ANTHROPIC_API_KEY` e com o defeito D1 vivo. Outra máquina, outra chave, outro estado do orçamento dão outros números.
- **Reprodutibilidade run-a-run** — 1 corrida por unidade em P2 (Haiku), P3, P4, P5-E; a temperatura do `claude -p` não é controlável.
- **Anterioridade do pré-registo em P1 e P2** — o primeiro commit (`f2739bcb`) tem protocolo e resultados juntos; a ordem está no transcript e nos mtimes, não no git. Nas provas seguintes o protocolo foi commitado antes da corrida (hashes na `ERRATA-timestamps.md`).
- **O Kimi** — não corrido como rotulador (API paga; R7); a única chamada paga do pacote foi a sonda de 137 tokens do §1.2 (≈ US$ 0,0004, `00-preflight.json`). O 2.º rotulador do P1 foi local.

## P1 · decidir custa zero

- Que a regra é boa: **perdeu** contra o juiz local e contra «sempre T2» nos 40 prompts reais (35 % vs 52,5 % vs 45 %); só 88,6 % no treino.
- Que o rótulo cego é a verdade (Codex, sem repo; kappa 0,50 com o 2.º rotulador local).
- A configuração com chave real e árbitro ligado; exposição indirecta dos rotuladores ao fraseado dos autores da regra.
- Que «o hook custa zero»: custa 207 ms de mediana / 1,27 s p95 e ~870 bytes por prompt, e 75/75 pré-cálculos locais expiraram (D3).
- Que o *tap* de sockets do P1 viu «0 ligações em 270 processos»: o tap v1 só registava no `close` e não apanhou os 25 filhos do Option A nem os 63 POSTs de métricas em loopback; o «0 hosts externos» assenta nos wrappers em processo (1 176 classificações), não no tap.
- Prompts acima de 500 caracteres (o protocolo dizia «> 4 k tokens», tecto mais largo; o corpus vai até 463 nos 40 e 604 nos 63).

## P2 · o tier vale alguma coisa

- Selecção inteligente entre tiers: o teste é aceitação emparelhada em 20 tarefas sintéticas; T2/T3 nunca foram recomendados; a política foi reconstruída dos dois braços, não executada como fluxo.
- Política ≈ Haiku-em-tudo (2 casos discordantes); o produto instalado ponta-a-ponta; a máquina **sem chave** dá 7/20 (a regra diz T0 em 20/20).

## P3 · obediência

- **Obediência executada > 0 — não aconteceu (0/20 nos dois braços).** Os 7 subagentes locais spawnados nunca chamaram o modelo local; **porquê** é `n/d` (os streams não foram persistidos).
- Que o hook PreToolUse altera o spawn (8 tentativas registadas; aplicação pelo harness não verificada) ou que tem efeito na taxa de delegação (n = 20, 1 corrida, sem teste).
- A decisão «vigente» por sessão — o produto tem uma decisão por máquina (`last-subagent.json`, D10), escrita por todas as sessões.
- Comportamento com chave (T1); qualidade do trabalho delegado (P7); obediência com Opus além da sonda de 5.

## P4 · crítico ≠ autor

- **Auto-revisão real** — nenhum dos dois motores escreveu o código que reviu; a hipótese de autoria não foi testada.
- Superioridade do crítico em motor diferente — não estabelecida (26/28 vs 27/28; p = 1,0); equivalência também não (sem margem pré-definida).
- Valor incremental do verificador de citações — 59/59 referências resolvem para linhas existentes, sem relevância avaliada e sem um caso em que a rejeição mudasse um resultado.
- Que os 2 alarmes partilhados nos originais são defeitos reais (não adjudicados); ablação sem marcador da linha-alvo; amostra aleatória (foi determinística: primeiros mortos, 15 ficheiros, 7 de 12 operadores semânticos — os 4 mutantes `< → <=` partiram genéricos TypeScript e são erros de sintaxe, apanhados no carregamento e não por asserção; excluindo-os, 23/24 vs 22/24).
- O crítico **local** ($0): mediu-se em 2026-08-21 que tem zero discriminação e não foi repetido.

## P5 · egress

- **Egress ao nível do dispositivo** — o *tap* vê processos Node com o preload; não vê DNS/UDP/QUIC, filhos não-Node, a saída do próprio Ollama; completude não inventariada.
- «Toda a rede externa recusada» — nada tentou sair no modo bloqueio.
- O árbitro **com chave real em rede** (B é instrumentado; 20/20 pedidos construídos com o prompt).
- Corridas com **D1 corrigido** e com chave presente/ausente — não existem.
- claude-code-router — `n/d`: configuração headless não conseguida em 60 min (bloqueio e comando para retomar em `P5/ccr.md`).
- LiteLLM: o mecanismo do «preço 0 nunca escolhido» (0/40; hipótese «0 = sem preço» não vista no código); Ollama real; igualdade de campo do prompt reencaminhado (só presença); egress externo do processo Python.
- Nativo: bytes confirmados entregues ao destino (contam-se bytes cliente→proxy); conteúdo de qualquer túnel; tráfego directo sem proxy; causa dos 13/20 `is_error`; custo marginal por prompt em sessão persistente.
- SOC 2, DPA, retenção — não se abriu.

## P6 · custo na linha

- Custo **verificado**: a origem é declarada por quem chama (`source_declared_by_caller`); o preço de lista não é o desembolso do dono (subscrição).
- Que o produto instalado escreve estas linhas — não escreve (0 *callers*; ledger vivo 0/1 451 com custo e origem no corte do protocolo, 0/2 157 no exploratório).
- Snapshot imutável com hash dos logs lidos (o log vivo cresceu entre as duas corridas, escrito por P3/P5 deste pacote — D6).
- Multiplicadores de cache no SSOT (`pricing.js`) — proposta, não aplicada (decisão do dono).

## P7 · usar vs não usar (R-24)

- **Sem veredicto ao fim de duas corridas inválidas** (23 tarefas × 2 braços, tecto 1 800 s por corrida). Corrida 1 (14:51:04Z): 46 braços, 3 inválidos, **21/23 pares válidos**. Corrida 2 (19:12:29Z): 46 braços, 45 inválidos, **0/23 pares**. As duas no limite de sessão do fornecedor, as duas preservadas em `results/`. Corrida 3 desde 20:07:55Z. O que fica por provar depende do veredicto do controlador: GANHOU / PERDEU / INVÁLIDA. Independentemente do resultado: generalização a outro repo/máquina/modelo; qualidade além do teste mecânico; obediência (é ITT).
- Lançado como processo separado com as marcas de sessão Claude Code removidas (a guarda `ambienteApto()` recusa correr dentro de uma sessão) — declarado no protocolo; a sonda do próprio controlador chegou ao modelo.

## P8 · cabeça-a-cabeça

- Cada célula `n/d` da tabela tem o motivo ao lado; nenhuma diz «não tem». Não há classificador de complexidade no ccr nem no LiteLLM (n/d por construção); o tzachbon abstém-se 63/63 no corpus em português (regex inglesas).

## Instrumentos (defeitos meus, apanhados e corrigidos — `09-DEFEITOS-APANHADOS.md`)

D5 (shim do `claude`), D7 (timestamps à mão), D8 (sonda do proxy com `spawnSync` — retirada a acusação ao `claude.exe`), D9 (teste unitário com o mesmo `spawnSync`), D10 (decisão partilhada por máquina + métrica por coocorrência). O que **não** foi construído e falta para fechar as lacunas acima: persistência dos streams `stream-json` (P3), observação ao nível do sistema (P5), braço de autoria real (P4), rótulos humanos em prompts reais e longos (P1), decisão por sessão no produto (P3).
