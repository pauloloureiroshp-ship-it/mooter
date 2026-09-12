# MATRIZ 12 · o que esta corrida NAO prova

Escrito **antes** de olhar para os resultados. Estas limitacoes sao do desenho,
nao do numero que sair — e um resultado favoravel nao apaga nenhuma delas.

---

## 1. Os prompts foram escritos por quem escreveu as previsoes

O MP mandava usar uma lista do Cowork. Essa lista nao existia em disco. O dono
autorizou usar a proposta escrita nesta sessao — pelo mesmo agente que copiou as
previsoes para o pre-registo.

Quem escreve o prompt escolhe boa parte do resultado: um pedido de risco redigido
com as palavras que o `classify.js` reconhece cai em T3 por construcao, e um
pedido dificil redigido em voz curta cai em T0 pela mesma razao. **Isto e a
limitacao mais seria da corrida.**

Os textos derivam dos rotulos que o MP ja fixava (dominio, assunto, degrau
esperado). Havia aqui uma frase a dizer que, como duas previsoes do MP falharam
na rota, os prompts nao podiam ter sido feitos para lhes dar razao. O adversario
derrubou-a (M12-07): previsoes falham por muitas razoes, e uma amostra pode
estar enviesada sem intencao nenhuma. A frase saiu. Fica o facto, sem atenuante.

O que continua por fazer: repetir com prompts de terceiro, ou com prompts reais
de transcricoes, escolhidos por alguem que nao conheca as previsoes.

## 2. N = 12. Nao ha estatistica aqui

Doze pedidos, um por celula. Nao ha repeticoes, nao ha intervalos de confianca,
nao ha valor-p — e nenhum sera calculado a posteriori para arranjar um. Uma
corrida so, como o MP manda.

Somando a isto a unica referencia de ruido que existe — dois bracos que correm o
mesmo motor em 2 prompts, 4 pares de notas, que **nao e uma calibracao** —
qualquer diferenca pequena nesta matriz e uma anedota bem instrumentada, nao um
resultado.

## 3. O arbiter esta inerte — mede-se o regex, nao o Mooter completo

`arbiter.js` e um no-op sem `ANTHROPIC_API_KEY`, e esta maquina usa OAuth de
subscricao. Sete dos doze prompts caem no gatilho do arbiter (confianca < 0,75
ou categoria `ambiguous_*`).

Ou seja: **a peca do Mooter desenhada exactamente para os prompts ambiguos nao
correu.** Numa maquina com chave, a rota de mais de metade da matriz podia ser
outra, e as conclusoes sobre "o Mooter manda isto para local" nao se transferem.

## 4. Nenhum dolar foi poupado

Os dois motores de nuvem correm por subscricao: Claude Code por OAuth, Codex por
subscricao ChatGPT. Nada nesta corrida saiu da carteira por token.

Todos os valores em dolares sao **preco de lista imputado**, calculados a partir
da pagina oficial de precos lida a 2026-09-10. Servem para comparar bracos entre
si. Nao sao poupanca, nao viram percentagem, e nao descrevem a factura de
ninguem.

E o local nao e "de graca": corre na GPU do dono e gasta energia. A corrida
reporta segundos; nao converte nada disso em dinheiro.

## 5. A cegueira dos juizes e de rotulo, nao de estilo

As respostas vao aos juizes com rotulo sorteado e sem nome de modelo, custo ou
tempo. Mas um juiz atento reconhece um modelo local pela forma de escrever —
sobretudo um que despeja deliberacao em ingles antes de responder.

Nao se editaram as respostas para as uniformizar: seria falsificar o que os
motores deram. A cegueira e imperfeita e fica assim declarada.

## 6. O J2 e da mesma familia de dois dos candidatos — e o B nao e nenhum deles

J1 corre em OpenAI, J2 em Anthropic. Os bracos A e C sao Anthropic; o D e OpenAI;
o **B e Qwen em 10 dos 12 prompts** e Anthropic so nos 2 que foram a Opus. (A
primeira versao deste paragrafo dizia «A, B e C sao todos Anthropic» — estava
errada, e o adversario apanhou-a, M12-05. A implicacao e ao contrario: um vies
do J2 pela propria familia pesa **contra** o B e a favor do C.) Nao existe juiz
sem conflito nenhum neste conjunto.

E para isso que existe o J3 humano, com folha vazia e chave selada. Ate a folha
do J3 voltar, as tabelas trazem a media de **dois** juizes com conflito
declarado.

## 7. O braco D nao e um modelo — e um agente

`codex exec` traz system prompt proprio, ferramentas e sandbox, e gasta ~27 mil
tokens de entrada antes de ler o pedido. Os bracos Anthropic correm com as
ferramentas desligadas.

Comparar os dois e comparar **um agente com um modelo**. Quando o D ganha, parte
do credito e do harness. E o custo do D e `n/d`: nao temos preco de lista
publicado para o id de modelo que ele usa.

## 8. Uma so maquina, um so dia, uma so lingua

RTX 4090, Windows 11, prompts em portugues, 2026-09-10. Os modelos de nuvem nao
sao deterministas e as versoes mudam. Nada aqui diz o que aconteceria noutra
maquina, noutro dia, ou em ingles.

## 9. Os 4 pontos que a rubrica nao ve

RESOLVE, CORRECTO, EXECUTAVEL, RISCO e ECONOMIA nao medem: se a resposta esta
certa em direito brasileiro (nenhum juiz e advogado), se o codigo compila
(nenhum foi corrido), se o plano de marketing funcionaria (ninguem o executou),
nem se o utilizador ficaria satisfeito. Medem o que se pode ler no texto.
