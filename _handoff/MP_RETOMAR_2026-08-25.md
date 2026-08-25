# MP · Retomar — sugestões de próximo passo, no CC e no Cowork

> **Experiência que serve:** **Resume** — a única das cinco que o inventário de hoje
> encontrou a zero em todo o roadmap proposto.
> **Régua:** o modelo **extrai**, uma regra **decide**. Nunca o contrário.

## Porque este desenho e não o óbvio

O óbvio é pedir ao modelo local *"olha a sessão e sugere o próximo passo"*. **Isso já foi
construído e falhou em silêncio.** O vault regista, em "por endereçar":

> o `ok` do selector significa só *"devolveu texto"* — o pré-cálculo respondeu **5 vezes,
> as 5 mal** — uma leu `350` (nº de PR) como *"350 horas"*. As 5 contaram como sucesso.

E as medições de 2026-08-25 explicam porquê. O mesmo modelo local, contra 57 etiquetas de
verdade conhecida:

| forma da pergunta | acordo |
|---|---|
| **JULGAR** — *"isto é um defeito real?"* | **52,6%** |
| **COMPARAR** — *"copia a linha que explica; senão NENHUMA"* | **25,9%** |

E o `runner-core.test.mjs:1432`, desde 19/08: *"o modelo local não sabe JULGAR se código
está certo — 8236 rondas, 0 bugs reais. Sabe COMPARAR duas coisas que existem."*

**"O que devo fazer a seguir?" é julgamento.** É a forma que falha.

## A inversão

Quase tudo o que uma boa sugestão precisa **não precisa de modelo nenhum**:

| facto | de onde vem | precisa de modelo? |
|---|---|---|
| ficheiros tocados | entradas `tool_use` do transcript | **não** |
| comandos que falharam | resultados com saída diferente de 0 | **não** |
| commits por empurrar | `git rev-list @{u}..HEAD` | **não** |
| testes vermelhos | última corrida de testes | **não** |
| branch e worktree onde se estava | `git` | **não** |
| chips pendentes | ficheiro de estado | **não** |
| *o que o utilizador queria* | prosa das mensagens | sim |
| *o que ficou por fechar, dito por palavras* | prosa | sim |

Por isso o desenho tem duas camadas, e a segunda **tem de provar que vale**.

---

## Camada 1 — determinista, zero modelo, zero custo

Lê o transcript e o estado do repo. Produz factos, e as sugestões saem de uma tabela
de regras. **Nenhuma chamada a modelo. Nenhum token.**

Regras iniciais (a tabela cresce por evidência, não por opinião):

| condição observada | sugestão |
|---|---|
| commits em `@{u}..HEAD` > 0 | *abrir PR de `<branch>` (`N` commits)* |
| última corrida de testes com `fail > 0` | *ver `<ficheiro>` — `N` testes vermelhos* |
| ficheiros modificados não commitados | *`N` ficheiros por commitar em `<branch>`* |
| chip pendente | *retomar: `<título do chip>`* |
| worktree diferente da última sessão | *estavas em `<worktree>`* |

**Degradação:** um facto que não se consegue medir é `n/d` visível — nunca zero, nunca
omitido em silêncio. É a regra que o `badge.js` e o `docs-hygiene.js` já seguem.

## Camada 2 — LLM local, desligada por omissão

Extrai da prosa, com contrato fechado e **sem pedir juízo**:

```
INTENÇÃO: <o que o utilizador pediu, nas palavras dele — copia, não interpretes>
POR FECHAR: <o que ficou explicitamente por fazer, citando a frase> ou NADA
```

Só isto. A sugestão continua a sair da tabela de regras — a camada 2 só acrescenta
factos à tabela. **O modelo nunca escreve a sugestão.**

Modelo: Ollama local. Custo: $0. Prompt nunca sai da máquina.

---

## As duas superfícies

| | Claude Code | Claude Desktop (Cowork) |
|---|---|---|
| pode empurrar para o campo de texto? | **sim** — hook `UserPromptSubmit` | **não** — MCP só responde a chamadas |
| superfície | linha de contexto + chips | tool do conector (`mooter_journal`) chamada ao abrir |
| onde vive | `tools/router/` (não congelado) | `packages/mooter-bridge/` |

**Restrição arquitectural, nomeada:** um servidor MCP **não consegue** escrever no campo
de texto do Desktop. Só responde quando é chamado. No Cowork a experiência obtém-se com
uma tool que o Claude chama no início — instrução de projecto, não código.

---

## O portão — nada entra sem número

O material já existe: **284 transcripts** em `~/.claude/projects/`.

1. Gerar sugestões da **camada 1** para 20 sessões passadas
2. O dono rotula cada uma: **útil / inútil / errada**
3. Fixar o limiar **antes** de ver o resultado
4. Só depois gerar as da **camada 2** sobre as mesmas 20
5. **A camada 2 só entra se bater a camada 1** na mesma amostra

Uma sugestão **errada** (facto falso) pesa mais que uma inútil: se o número de erradas
for maior que zero na camada 1, é defeito, não calibração — a camada 1 é determinista e
não tem licença para errar um facto.

## Restrições

- `tools/router/classify.js` **FROZEN**, sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- `packages/*` das waves 28-34.5 congelados — `sessions-orchestrator` **não se toca**
- Transcripts são **leitura**; nada sai da máquina
- Staging selectivo por nome de ficheiro
- Sem novos `.md` na raiz; e **sem sexta lista de roadmap** — este ficheiro é efémero e
  arquiva-se em `_handoff/_archive/` quando a onda fechar
