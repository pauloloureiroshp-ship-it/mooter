# Frente `onda-a3` — o downgrade silencioso derrota a hermeticidade do teste

**Aberta:** 2026-08-16 · **Origem:** CC · f-mu0 (descoberto no ACK, isolado, medido, nunca tocado)
**Worktree:** `.claude/worktrees/onda-a3` · **Branch:** `onda-a3/moo-sem-contexto` · **Base:** `main@93bf52f6`
**Prova do vermelho:** `_handoff/onda-a3/A3-VERMELHO.txt` (sha256 `99400919…`)

## Porque é que isto bloqueia toda a gente

Enquanto `ondaA.test.js` A3/A3b estiverem vermelhos, o gate `final-reviewer-honest`
recusa SHIP a **qualquer** frente que corra a suite do bridge — seja de quem for o
vermelho. Foi o único bloqueio que a f-mu0 não pôde fechar sozinha, e por isso
esta frente existe.

## O que falha, literalmente

| Teste | Espera | Recebe |
|---|---|---|
| **A3** · leitura impossível é recusada com saída | `r.erro === 'sem_contexto_para_o_local'` | `undefined` |
| **A3b** · o conector lê o ficheiro PELO modelo local | `r.ficheiros_lidos === ['alvo.js']` | `null` |

## Medido, não deduzido

- Falha **sozinho** na base, sem mais nenhum ficheiro na corrida.
- Falha no checkout principal e em worktree fresca.
- Falha com o Ollama **em baixo E de pé** — logo **não é ambiente**.
- Confirmado de forma independente pelo G4 #6 da Parte A da f-mu0 e por todas as
  5 rondas de G4 da Parte B, sempre como alheio à identidade.

## Causa candidata (não confirmada — é o trabalho desta frente)

O teste é hermético de propósito: `ondaA.test.js:30` fixa
`OLLAMA_HOST = '127.0.0.1:1'`, e o comentário em `:25` explica que apagar a
variável não isola nada. Ou seja, **o teste quer o modelo local inalcançável**.

Só que `seamless.js:3296-3304` reage a isso mudando o motor:

```js
if (agent === 'moo') {
  ...
  if (!has) {
    downgraded = 'o router escolheu a GPU local (T0) mas não há modelo local ... — passei para o Claude Code';
    agent = 'cc';
  }
}
```

E o contrato de leitura que os testes asseveram (`sem_contexto_para_o_local`,
`ficheiros_lidos`) vive no caminho dos motores que **não** lêem ficheiros
(`seamless.js:3478+`). Assim que o motor passa a `cc` — que lê ficheiros
sozinho — esse caminho nunca corre, e as duas asserções ficam sem objecto.

**A hermeticidade do teste é derrotada pelo próprio downgrade.**

## O que descobri a caminho, e que vale mais do que o teste vermelho

A mensagem diz **"o router escolheu a GPU local (T0)"**. No teste — e em qualquer
chamada com `agent: 'moo'` — **não foi o router: foi o chamador**. O downgrade
trata uma escolha explícita do utilizador como se fosse uma inferência do
classificador, e substitui um motor gratuito por um pago sem que o contrato o
diga. Fica no log, sim; mas o `resumo` e o `erro` que o chamador lê não o
distinguem.

Isto pode ser o bug real, e o teste vermelho apenas o sintoma.

## Duas direcções, e a escolha é do dono

1. **O downgrade não se aplica a uma escolha EXPLÍCITA.** Se o chamador pediu
   `moo`, ou corre em `moo` ou recusa — e o `sem_contexto_para_o_local` volta a
   ter objecto. Muda comportamento de produção; blast radius no caminho de
   selecção de motor, que todos os jobs atravessam.
2. **O teste passa a fixar o motor** e o downgrade fica como está. Mais barato,
   fecha o gate, e deixa por resolver a pergunta de cima.

A **1** é a que responde à pergunta certa. A **2** é a que desbloqueia depressa.
Não são exclusivas: a 2 desbloqueia o gate hoje, a 1 vira frente própria.

## Limites desta frente

- **Não tocar** em `tools/router/classify.js` (FROZEN, sha CI-enforced).
- Adds selectivos; nunca `git add -A`.
- Zero push. O merge é gesto do dono.
- Prova obrigatória: par VERMELHO→VERDE em ficheiro, com a **suite completa**
  (`cd packages/mooter-bridge && node --test`) — parcial não conta.
- G4 crítico≠autor antes de fechar.
