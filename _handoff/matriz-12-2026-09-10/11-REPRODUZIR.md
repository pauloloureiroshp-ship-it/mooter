# MATRIZ 12 · reproduzir

Todos os comandos correm da **raiz do repo**. Nenhum destes passos precisa de
`ANTHROPIC_API_KEY`: os bracos Anthropic vao pelo binario do Claude Code com a
sessao de subscricao do dono, e o Codex pela subscricao ChatGPT.

## O que e preciso ter

| coisa | como se confirma |
|---|---|
| Ollama a servir | `curl -s http://127.0.0.1:11434/api/tags` |
| `qwen2.5-coder:14b` e `qwen3:30b` puxados | aparecem na lista acima |
| Claude Code instalado | `~/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe --version` |
| Codex CLI instalado e com creditos | `codex exec 'responde apenas banana'` |
| GPU sondada | `node tools/router/gpu-probe.js` |

## Os cinco pre-requisitos, outra vez

```sh
node _handoff/matriz-12-2026-09-10/preflight.mjs
```

Reescreve `00-preflight.json`. Custa 4 chamadas a modelo (3 Anthropic baratas +
1 Codex) e 2 locais. Verifica os sha congelados, a mordida do tecto de tokens, o
modelo T0 que a maquina recomenda, os 3 modelos Anthropic e os creditos do Codex.

## Os testes dos instrumentos

```sh
node --test _handoff/matriz-12-2026-09-10/lib/instrumentos.test.mjs
```

12 testes. Foram vistos a falhar: mudar `cache_write_5m` de 6.25 para 6.30
reprova dois, e apagar `--append-system-prompt` de `claude-call.mjs` reprova o
terceiro. Um teste que nao morde nao esta a guardar nada.

## A rota de cada prompt, a custo zero

```sh
node _handoff/matriz-12-2026-09-10/ensaio-rotas.mjs
```

So o classificador congelado. Nenhum modelo e chamado. Escreve `ensaio-rotas.json`.

## A corrida

```sh
node _handoff/matriz-12-2026-09-10/correr.mjs
```

Para antes de gastar um token se algum sha do pre-registo nao bater (incluindo o
do `prompts.json`). Nao regrava um resultado que ja existe — para repetir um
prompt, apaga o ficheiro dele em `results/` de proposito.

Bandeiras: `--ensaio` (so classify + local, $0) · `--so=DATA-1` (um prompt).

## Os juizes automaticos

```sh
node _handoff/matriz-12-2026-09-10/julgar.mjs
```

J1 = Codex (OpenAI) · J2 = Sonnet 5 (Anthropic). Familias diferentes. A ordem em
que cada juiz ve as respostas vem do sorteio semeado pelo sha do `prompts.json`,
por isso e reproduzivel e nao foi escolhida por ninguem.

`--juiz=J1` corre so um. Nao repontua o que ja esta pontuado.

## A folha do juiz humano

```sh
node _handoff/matriz-12-2026-09-10/pacote-cego.mjs
```

Escreve `PACOTE-CEGO.md` (sem nomes de modelo, sem custos, sem tempos) e
`CHAVE-SELADA.json` com o sha256 do pacote la dentro. A chave so se abre depois
de a folha voltar preenchida; o sha prova que a folha julgada foi essa.

## As tabelas

```sh
node _handoff/matriz-12-2026-09-10/agregar.mjs > _handoff/matriz-12-2026-09-10/TABELAS.md
```

Nenhuma celula e escrita a mao. Inclui o **controlo de ruido**: nos prompts que
caem em T3, os bracos A e B correm o mesmo modelo com a mesma configuracao, por
isso a diferenca entre eles mede o ruido do conjunto modelo+juiz. Vantagens
menores do que esse numero nao sao vantagens.

## O que fica em disco

```
_handoff/matriz-12-2026-09-10/
  00-preflight.json          os 5 pre-requisitos, medidos
  09-DEFEITOS-APANHADOS.md   os defeitos apanhados antes de correr
  11-REPRODUZIR.md           este ficheiro
  prompts.json               os 12 pedidos (congelados, sha no protocol.json)
  protocol.json              o pre-registo: previsoes, semente, sha
  ensaio-rotas.json          a rota de cada prompt, sem gastar nada
  results/<ID>.json          uma corrida por prompt, com os 4-5 bracos
  results/linhas.jsonl       o mesmo, em append (versionado por excepcao no .gitignore)
  juizes/<ID>.json           as notas de J1 e J2, e a chave do sorteio
  PACOTE-CEGO.md             a folha do J3
  CHAVE-SELADA.json          quem era quem, com o sha do pacote
  TABELAS.md                 por prompt e agregada
  verdict.md                 o que prova e o que nao prova
  smoke/                     o ensaio de fumo que apanhou 4 dos 9 defeitos
  lib/                       instrumentos + os testes que mordem
```

## Alteracao ao repo que esta corrida carrega

**Nenhuma.** A corrida usou uma variante local do hunk D1 (`executePinned`
a passar `maxTokens`; sha do executor `7be3e990…`, diff em `preflight/D1.diff`).
Enquanto os juizes corriam, outra sessao fundiu o mesmo fix em main como
**#498 (`e20e6142`, 2026-09-11)** — logica identica uma linha acima. Esta pasta
foi rebaseada para cima do #498 e o hunk local descartado; os 3 testes do #498
passam contra a variante usada, e o braco B reproduz-se em cima do #498 (40/40
linhas, 270 tokens, sem truncar). Ver D1.

## M12-b — a mesma matriz mudando uma variável

```sh
node _handoff/matriz-12-2026-09-10/m12b.mjs congelar   # pré-registo (recusa se já existir)
node _handoff/matriz-12-2026-09-10/m12b.mjs correr     # só o braço B nos 10 T0, $0
node _handoff/matriz-12-2026-09-10/m12b.mjs julgar     # J1+J2, mesmo conjunto, só o B trocado
node _handoff/matriz-12-2026-09-10/m12b.mjs comparar   # m12b/COMPARACAO.md
```

Exige o `providers/ollama-api.js` com o sha do `m12b/protocol.json` (o D10 aplicado); para
antes de gastar se mudou. As respostas de A, C e D não são geradas outra vez: são as da
corrida principal, byte a byte, e por isso as duas rondas de julgamento delas medem o ruído do
juiz (60 pares).

## O que fica em disco (adenda)

```
  m12b/protocol.json         o pré-registo do M12-b, com as duas previsões de sinal contrário
  m12b/results/<ID>.json     o braço B com o system prompt corrigido, 10 T0
  m12b/juizes/<ID>.json      as notas de J1 e J2 na segunda ronda
  m12b/COMPARACAO.md         B vs B(m12b), e o ruído dos vizinhos
  verdict.v1.md              a versão antes do adversário
  adversary.md               os 17 ataques e o que mudou por cada um
```

## Alterações ao repo que esta pasta carrega (adenda)

**Nenhuma neste PR.** O D10 (uma linha do `SYSTEM` de `providers/ollama-api.js`) foi aplicado
para o M12-b e **retirado do PR** a pedido do portão de pré-push: «não mergear isolado» não se
garante dentro de um PR que o mergeia. O diff está em `m12b/D10.diff` (o `m12b/protocol.json`
fixa o sha `a36363e4…` do ficheiro com ele aplicado); o teste que o guarda
(`ollama-system-prompt.test.js`, 4 testes, **2** dos quais reprovam com a linha antiga — os outros
2 são estruturais) vai num PR rascunho separado. Para reproduzir o M12-b: `git apply
_handoff/matriz-12-2026-09-10/m12b/D10.diff` antes de `m12b.mjs correr`.
