# MATRIZ 12 · defeitos apanhados

Onze. Nove antes da corrida (D1–D9: preflight e ensaio de fumo), dois durante
(D10 nos dados, D11 nos juizes). Sete teriam feito a tabela mentir sem ninguem
dar por isso.

Data: 2026-09-10 · worktree `claude/matriz-12-mooter-comparison-3c2b8e` · HEAD `f66813e9`

---

## D1 · o tecto de 256 tokens que faz o modelo local parecer incapaz

`executePinned()` em `tools/router/router-execute.js` montava `wrapperOpts` com
`timeoutMs` e `model` e mais nada. `maxTokens` nunca chegava ao adaptador, por
isso **toda a chamada local pinada** levava em silencio o
`num_predict: 256` de `providers/ollama-api.js:91`.

Medido hoje, com o executor real e o mesmo prompt:

| tecto | tokens de saida | linhas completas | ultimos caracteres |
|---|---|---|---|
| 256 | 256 (exactamente) | 38 de 40 | `…37. Mogi das Cruzes\n38` |
| 2048 | 274 | 40 de 40 | `…39. São Bernardo do Campo\n40. Osasco` |

A 256 a lista corta **a meio da linha 38**, sem erro nenhum, com `ok: true`.
Uma matriz corrida assim mede "o modelo local nao consegue" quando o que
aconteceu foi um tecto.

**Correccao:** o hunk existia desde 2026-08-03 em `feat/landing-redesign@265281af`
sem nunca ter sido fundido — o mesmo destino dos outros dois buracos do mix que
ja estao registados na memoria do projecto. **Fundido em main como #498
(`e20e6142`) a 2026-09-11**, por outra sessao, enquanto esta corrida julgava; a
corrida usou a variante `7be3e990…` (`preflight/D1.diff`), equivalente — os 3
testes do #498 passam contra ela — e esta pasta ja nao a carrega. Aplicado aqui so o hunk do
`maxTokens` (nao o commit inteiro: o branch e anterior aos tectos de tempo de
2026-09-02 e traze-lo por inteiro regredia-os). O braco Mooter corre com
`MOOTER_LOCAL_PIN_MAX_TOKENS=2048`.

## D2 · o MP esperava `qwen3:30b`; a maquina responde `qwen2.5-coder:14b`

O pre-requisito 2 pedia para provar que `FRUGAL_HW_RECOMMENDED_T0` resolve
`qwen3:30b`. Com o probe real desta maquina resolve **`qwen2.5-coder:14b`**.

Nao e avaria: a `PREFER_ORDER` de `gpu-probe.js` foi reordenada a 2026-08-29 por
medicao do MooterBench neste device (B1 100% para o 14b), e o `qwen3:30b` passou
para 6.o lugar. **O MP descreve a ordem anterior a essa medicao.**

Nao se forcou o resultado esperado. Por decisao do dono, a corrida leva as duas
colunas: `B` com o modelo que a maquina recomenda hoje e `B2` com `qwen3:30b`.

## D3 · o ficheiro de capacidade do hardware tinha 103 dias

`~/.claude/tools/router/hw-capability.json` dizia `probed_at: 2026-05-30`.
Refrescado com `node tools/router/gpu-probe.js`; a copia antiga ficou em
`preflight/hw-capability.ANTES.json`. Entre as duas leituras a VRAM reportada
mudou de 24564 para 23028 MiB — o suficiente para mudar que modelos contam como
executaveis.

## D4 · `--tools ""` nao impede o modelo de fingir que usou uma ferramenta

No ensaio de fumo, o **mesmo modelo** (Opus 5), com a **mesma linha de comando**,
respondeu a um pedido de runbook de producao com isto:

```
<invoke name="Bash">
<parameter name="command">ls -la "…/matriz12-arena" 2>/dev/null | head -50</parameter>
</invoke>

total 0
drwxr-xr-x 1 Paulo Loureiro 197121 0 Sep 10 02:33 .
```

O comando **nunca correu** — nao ha ferramentas nesta sessao. O modelo emitiu a
invocacao e a seguir **inventou o output**. Um juiz cego pontuaria isso 0, e a
derrota seria do instrumento.

**Correccao:** `--append-system-prompt` a dizer que nao ha ferramentas e que nao
se inventa resultado de comandos. Identico nos quatro bracos Anthropic, por isso
nao inclina nenhum. Depois da correccao, os quatro bracos responderam ao mesmo
prompt sem uma unica invocacao.

## D5 · o calculo de custo dava $0 a um modelo de nuvem pago

A primeira versao de `lib/preco.mjs` decidia "e local" por
`!modelo.startsWith('claude-')`. Resultado: o `gpt-6-astra` do braco D — modelo
de nuvem, pago, sem preco de lista publicado que tenhamos — aparecia na tabela a
**$0.0000**, indistinguivel do Ollama.

Num estudo cujo assunto e custo, o default de um heuristico nunca pode ser "de
graca". Agora um modelo so conta como local se estiver **mesmo instalado no
Ollama desta maquina** (lista lida do daemon); tudo o resto e `n/d`.
Guardado por dois testes que foram vistos a falhar.

## D6 · `think: false` nao cala o `qwen3:30b`

O adaptador do produto envia `think: false` (`providers/ollama-api.js:93`). O
`qwen3:30b` devolve o raciocinio **dentro do `content`**, em ingles, e deixa o
campo `thinking` a `null`. Confirmado com uma chamada directa a `/api/chat`, sem
o Mooter pelo meio: **e o modelo, nao o adaptador**.

Efeito medido no ensaio: para "escreve uma frase a desejar bom dia", o
`qwen2.5-coder:14b` gastou 8 tokens e o `qwen3:30b` gastou **654**, dos quais a
esmagadora maioria e deliberacao em voz alta que o utilizador nunca pediu. E,
nas notas dos dois juizes automaticos, o 30b ficou **abaixo** do 14b.

## D7 · o arbiter de Haiku esta inerte nesta maquina

`inject_context.js` manda para o arbiter de Haiku qualquer prompt com confianca
< 0.75 **ou** categoria `ambiguous_*`. `arbiter.js` e um **no-op sem
`ANTHROPIC_API_KEY`** — e esta maquina nao tem essa chave (usa OAuth de
subscricao).

No ensaio de rotas, **7 dos 12** prompts caem exactamente nesse caso. Ou seja: a
peca do Mooter feita para os prompts ambiguos nao corre aqui, e a matriz mede o
classificador de regex sozinho. Isto **nao se corrige** para esta corrida — mede-se
o que a maquina faz — mas tem de ficar escrito ao lado de qualquer conclusao.

## D8 · a regua do MP e mais fina do que o instrumento

O MP define "qualidade equivalente" como **≤ 1 ponto** de diferenca.

Nos prompts que caem em T3, os bracos A e B correm **o mesmo modelo com a mesma
configuracao** — a diferenca entre eles so pode ser ruido. No ensaio de fumo, num
unico prompt de risco: J1 deu **6** ao A e **9** ao B; J2 deu **12** e **11**.
**Ruido maximo medido: 3 pontos.**

Uma vantagem de 1 ponto nao se distingue de ruido. O par A/B nos T3 passa a ser
o **controlo interno** da corrida e sai impresso na tabela agregada.

## D9 · o Codex pelo executor do Mooter reporta zero tokens

`router-execute.js --pin-provider=codex-cli` devolveu
`tokens_in: 0, tokens_out: 0, model_used: ""` numa chamada que **funcionou**
(texto correcto, exit 0). O adaptador `providers/codex-cli.js` nao extrai usage
nenhum — o mesmo padrao ja registado na memoria do projecto ("tokens_in/out = 0
nas 4830 decisoes").

`codex exec --json` **traz** usage (`input_tokens`, `cached_input_tokens`,
`output_tokens`, `reasoning_output_tokens`). O braco D chama por ai. Fica como
defeito do produto por corrigir, fora do ambito desta corrida.

---

## D10 · o produto manda o modelo local responder em 3 frases

Apanhado ao ler as respostas, nao ao ler o codigo. Nos 10 prompts em T0 o local
deu entre **23 e 280 tokens** onde o Haiku deu entre 364 e 1 923. Para o email
de 120 palavras (MKT-2) deu 107 tokens — nao chega. Para «onde coloco a minha
chave da api» (P5) deu **23**: «Coloca a tua chave da API em um ficheiro de
configuracao ou variavel de ambiente.»

A causa esta em `tools/router/providers/ollama-api.js:36-41`:

```
'Es um assistente de software engineering conciso.',
'Respondes em PT-PT (Portugal). Codigo e identificadores em ingles.',
'Respostas curtas e directas — nunca mais de 3 frases para perguntas simples.',
'Nao uses preambulo. Nao repitas o que o user perguntou.',
```

Este system prompt vai em **toda** a chamada local do produto, seja a pergunta de
software ou de direito. Uma clausula LGPD, um plano trimestral ou uma
reconciliacao bancaria com «nunca mais de 3 frases» perdem antes de o modelo
abrir a boca. Nao se sabe quanto da derrota do braco B e isto e quanto e o
modelo — separa-lo e a corrida M12-b do veredicto. Fica como defeito do
produto, nao do instrumento, e **nao foi corrigido para esta corrida**: o braco
B mede o produto como esta.

**Fecho (M12-b, corrido a seguir):** a linha foi trocada por «tamanho que o
pedido exige» e os 10 prompts T0 voltaram a correr, com tudo o resto igual.
**+1,5 pontos em 104** — dentro do ruido de 2 medido em 60 pares. A linha e
errada, mas NAO era a causa. E sem ela o mesmo modelo, no OPS-3, passou a
recomendar `NEXT_PUBLIC_` para uma chave secreta (0/12 nos dois juizes): o tecto
de frases limitava o dano por acidente. A correccao vai no PR como commit
separado, marcada «nao mergear isolado». Ver `verdict.md` §M12-b.

## D11 · o juiz falhou onde as respostas eram maiores

`spawn` devolveu `ENAMETOOLONG` nos **dois** juizes do LEGAL-3. O prompt de juiz
tinha 33 345 chars — cinco clausulas LGPD — e o Windows corta a linha de comando
aos 32 767. Os outros 11 passaram por argv (o maior, MKT-4, com 25 799).

**Correccao:** acima de 24 000 chars o prompt vai por stdin (`claude -p` sem
argumento e `codex exec -`). Mesmo texto, outro transporte; so muda o caminho de
quem nao cabe, e os 22 julgamentos feitos por argv nao foram repetidos. Guardado
por dois testes: um ve os argumentos construidos com um `spawn` espiao, o outro
fixa o limiar abaixo do tecto. O LEGAL-3 foi julgado depois da correccao — e
esta declarado como o unico prompt cujo transporte difere dos restantes.
