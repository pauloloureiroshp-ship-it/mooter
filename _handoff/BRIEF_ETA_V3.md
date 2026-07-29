# BRIEF — ETA v3: a barra, no sítio onde não custa uma interação

**Depende da ETA v2.** Não comeces sem `estimativa.js` no repo: esta onda só
*desenha* o que ele calcula. Se inventares aqui um número que o `estimativa.js`
não deu, destróis a peça toda.

**O objectivo, em uma frase.** O utilizador tem de conseguir olhar para o painel
e saber, sem escrever nada a ninguém, o que está a acontecer e quanto falta.
Cada pergunta "já acabou?" feita ao assistente é uma falha desta onda.

---

## S1 — Sondar antes de assumir (isto vem primeiro, de propósito)

O `notifications/progress` existe na especificação MCP (`progressToken`,
`progress`, `total`, `message`) e permite ao servidor empurrar progresso sem o
modelo perguntar. **Mas a spec diz explicitamente que os clientes não são
obrigados a suportá-lo**, e não sabemos se o Cowork o renderiza.

Portanto: **medir, nunca assumir.**

- Acrescenta `notifications/progress` à sonda de capacidades (`capacidades.js`),
  ao lado das que já lá estão.
- Regista o resultado com o mesmo rigor das outras: `suportado: true|null`,
  `porque`, `fonte`, `medido_em`. **Ausência de declaração não prova ausência de
  suporte** — é `null` com o porquê, nunca `false`.
- Se for suportado, emitir progresso por aí é bónus. **A barra não pode depender
  disso.**

## S2 — A barra no painel (`fleet-ui.html`)

O painel já é um MCP App (`ui://`, `resourceUri`). Ele faz o seu próprio
polling local: **anima sem gastar uma única interação nem um único token.** É
aqui que a barra vive.

**Uma linha por job/agente vivo.** Nunca uma barra agregada da wave.

```
Codex · eta-v2            ████████████░░░░░░░  ~7 min    p60 · mediana de 9 jobs
Claude Code · S3 de 4     ███████████████░░░░  ~40 s     passos reais
Ollama qwen3.6 · local    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  n/d       sem histórico
```

Regras visuais, todas derivadas de honestidade e não de gosto:

| Situação | O que se vê |
|---|---|
| até ao p50 | barra a encher, cor calma |
| entre p50 e p90 | cor de aviso, mas sem alarme |
| depois do p90 | barra **pulsante** + `já passou o p90 — o máximo histórico foi X min`. **Nunca cancela, nunca sugere cancelar** |
| `n < 5` observações | **barra indeterminada** (listrada, animada) + `n/d — sem histórico suficiente`. É a convenção universal para "não sei quanto falta", e é honesta |
| E3 diz parado | ponto de pulso apagado + `sem crescimento há N min`, **independente** da barra. Uma barra a 60% com pulso morto tem de se ver logo |

- A percentagem só aparece quando vem de **passos reais** (E1). Com base em
  percentil (E2), mostra-se a barra e o tempo — **nunca um "87%"**, que
  fingiria um denominador que não existe.
- Debaixo de cada barra, em letra pequena: **qual estimador está a mandar**.
  Quem lê tem sempre como auditar o número.

## S3 — Sem regressão de desempenho

- O polling lê **um** `eta-index.json` e faz **um** `stat` ao `out.log` por job vivo.
- **Nunca** varrer o `ledger.jsonl` no ciclo de refresh.
- Sem jobs vivos, o painel não faz trabalho nenhum.
- O ritmo de refresh não pode acelerar com o número de jobs — mede e prova.

## S4 — Testes

Em `packages/mooter-bridge/` (segue o padrão de `board.test.js` para o que é
lógica pura e não precisa de browser):

1. o renderizador devolve **barra indeterminada** quando a estimativa é `null`, e não uma barra a 0%;
2. percentagem só é emitida quando a fonte é `passos declarados`;
3. passado o p90, o estado é `aviso` e **não existe** nenhuma acção de cancelamento no output;
4. o pulso (E3) é independente da barra: pulso morto com barra a 60% produz os dois sinais em simultâneo;
5. um ciclo de refresh com 3 jobs vivos não abre `ledger.jsonl` (espiar o `fs`);
6. a sonda de `notifications/progress` regista `null` com `porque` quando o cliente não declara — nunca `false`.

## S5 — Fechar o ciclo

- Subir o `manifest.json` para **1.24.0**.
- Declarar a entrega em `entregas-por-versao.json` na chave `1.24` — **substituir
  o `recibo.js` que lá está** (o Recibo de Fecho foi congelado por WIP e não
  entra nesta versão; uma entrega declarada que não existe parte o gate).
- Garantir que `eta.js`, `estimativa.js` e `sync.js` estão em `FILES` no
  `pack-mcpb.mjs`.
- **Não** empacotar nem instalar — isso é feito por runner nativo, fora daqui.

## Regras da casa

- `git add` **selectivo**. Nunca `git add -A`. Sem push, sem PR.
- Não tocar em `tools/router/classify.js` (FROZEN) nem em `landing/app/page.tsx`.
- Português nos comentários, inglês nos identificadores.
- Nenhum número sem base. Se não foi medido, é `n/d` **com o porquê** — e a
  ressalva viaja colada ao número, não numa nota de rodapé.
