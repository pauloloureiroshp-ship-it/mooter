# Portões — do documento ao mecanismo

> **Estado:** activo · **Aberto:** 2026-08-25 · **Base:** `main` @ `6bc74f30`
> **Doutrina:** *mooter no talo* — adversário em motor diferente, nenhuma fase
> avança sem o gate numérico da anterior verde com o número colado no PR, 1 PR
> por fase, branch sempre, git = custódia.

## A tese em uma frase

Os três portões existem. Nenhum deles é **mecânico** — todos dependem de alguém
se lembrar de os correr. Esta é a distância entre o que o projecto já sabe e o
que ele ainda não faz sozinho.

## O que as práticas da Anthropic dizem, cruzado com o que já existe aqui

Fonte: `code.claude.com/docs/en/best-practices`, lido a 2026-08-25.

| Prática | Estado no Mooter | Distância |
|---|---|---|
| *"Give Claude a check it can run"* — teste, build, script que devolve pass/fail | Existe: 3 054 testes, portão de existência, ensaio semeado | **O gate não bloqueia.** É documental |
| *"As a deterministic gate: a Stop hook blocks the turn from ending until it passes"* | Há um Stop hook (`gsd-turn-end.js`) mas só acumula contexto | **Falta o hook que trava** |
| *"By a second opinion: a verification subagent has a fresh model try to refute"* | Feito à mão nesta sessão (codex, kimi) | Falta ser invocável |
| *"Have Claude show evidence rather than asserting success"* | **Já é doutrina do projecto.** `n/d` nunca vira `ok` | Alinhado — é a força |
| *"If your CLAUDE.md is too long, Claude ignores half of it"* | O global tem a doutrina de routing inteira | **Emagrecer, mover para skills** |
| *"Use skills for domain knowledge loaded on demand"* | Há muitas skills; a doutrina não é uma delas | Mover |
| *"Fan out across files"* | Feito: 14 agentes, um dono por ficheiro | Alinhado |
| *"`/clear` between unrelated tasks"* | Esta sessão correu ~17 turnos sem clear | Disciplina, não código |

**A convergência que importa:** a Anthropic escreve *"if you can't verify it,
don't ship it"*; este repositório escreve *"o que não se consegue medir devolve
`n/d`, nunca `ok`"*. São a mesma regra. O projecto não precisa de mudar de
filosofia — precisa de a tornar automática.

## O que seria perfeito

Um pilar, uma regra de âncora ou uma classe de defeito **não consegue entrar**
sem ter passado os três portões, e o resultado de cada passagem fica visível a
todos os devices sem ninguém escrever nada à mão.

Hoje: três documentos, três scripts, e a memória de quem está ao teclado.

## Fases

Cada fase é 1 PR, com o número do gate colado no corpo. Nenhuma avança sem a
anterior verde.

### F1 · O portão vira mecanismo

O `portao-de-existencia.mjs` existe e funciona. Falta ser **impossível de
esquecer**.

- Uma skill `/portao <ficheiro-de-classe>` que corre censo + escreve a amostra
  para triagem + aplica o veredicto, num gesto.
- Um teste que **recusa** uma regra de âncora `activo: true` cujo `porque` não
  tenha um número medido. Já existe em embrião (`ancora.test.mjs`); passa a ser
  o gate.
- O `veredicto` passa a escrever no ledger da frota, não só no terminal.

**Gate:** um teste prova que uma regra sem medição é recusada, e o veredicto
aparece no `agent-sync-ledger` de outro device.

### F2 · Os 44 por triar

A classe `catch-neutro` tem **84 candidatos**; o portão leu 40. Os outros 44
nunca foram vistos, e a precisão medida (70%) diz que ~30 deles são defeitos
reais por corrigir.

- Triar os 44 restantes.
- Corrigir os reais, pelo mesmo método do #385 (23 `null` + chamadores, 5 falha
  visível).
- Delegar a correcção a `codex`; a triagem é leitura humana e não se delega.

**Gate:** precisão dos 44 medida e comparada com os 70% da primeira amostra. Se
divergir mais de 15 pontos, a amostra por hash não estava a espalhar e isso é um
achado sobre o instrumento.

### F3 · A frota fecha

`READINESS=fail`. O `windows-rtx4090` ficou `active · errors=none` a 25/08; os
outros três continuam `pending / device_not_enrolled`, e o `mac-mini-codex` tem
recibos stale.

- Inscrever cada device quando ele correr (não se inscreve à distância).
- O `mac-mini-codex` precisa de um recibo fresco de `claude-code` e `ollama`.
- **Nenhum recibo se fabrica.** Uma superfície que não correu fica em falta.

**Gate:** `READINESS=pass`, ou a lista explícita de que devices faltam e porquê.

### F4 · O CLAUDE.md emagrece

A prática da Anthropic é directa: *"if your CLAUDE.md is too long, Claude ignores
half of it because important rules get lost in the noise"*. A doutrina de routing
do dono vive no global e é carregada em **todas** as sessões de **todos** os
projectos.

- Medir o custo actual em tokens (`/context`).
- Mover a tabela de decisão e os casos canónicos para uma skill carregada a
  pedido; deixar no CLAUDE.md só o que muda comportamento em todo o turno.
- **Verificar que o comportamento não muda:** correr um conjunto fixo de prompts
  pelo `classify.js` antes e depois e comparar as decisões.

**Gate:** contagem de tokens do arranque desce, e as decisões de routing num
conjunto fixo de prompts são **idênticas** antes e depois. Se mudarem, o corte
foi longe de mais.

### F5 · A dívida do #366

Seis resíduos declarados e nunca corrigidos: as três varreduras que param na
primeira colisão, o tique que desalinha `pilar` quando escritas são recusadas, a
fracção do dia que não chega ao teste por pilar, timestamps futuros no mesmo dia,
o ledger a aceitar `{}` como recibo, e `pilar:esgotado` como evento sem vigia.

**Gate:** um teste por resíduo, cada um a falhar antes da correcção.

## Ordem, e porquê

**F1 → F2 → F3 → F4 → F5.**

O F1 primeiro porque governa tudo o resto: enquanto o portão for documental, cada
fase seguinte depende de alguém se lembrar. O F2 a seguir porque é o único que
entrega defeitos reais corrigidos — valor imediato, medido. O F3 depende das
outras máquinas e por isso não bloqueia ninguém. O F4 é o de maior alcance e o de
maior risco de regressão silenciosa, por isso vai depois de os gates estarem
mecânicos. O F5 é dívida conhecida e paciente.

## Como se reparte o trabalho

| Motor | O quê | Porquê |
|---|---|---|
| `codex` | correcções mecânicas com chamadores, inventários, config de máquina | agente, edita ficheiros, corre testes |
| `kimi` | prosa de registo, sumários, relatórios | barato, e não precisa de tocar em código |
| Claude Code | arquitectura, verificação dos outros motores, merges, custódia | o que não se delega |
| Ollama local | ensaios semeados, censos | $0, e é o motor que o loop usa mesmo |

**Nenhum resultado de motor externo entra sem ser verificado.** Nesta sessão o
`codex` deu `auto_publish` como resolvido tendo posto a variável só no shell
dele, e o `kimi-k3` devolveu vazio por gastar o orçamento a pensar. Ambos foram
apanhados por medição, não por confiança.

## Registo

Cada fase, ao fechar, escreve em quatro sítios:

1. `SYNC.md` — o snapshot do estado
2. `LOOP.md` — se houve aprendizagem de execução
3. vault `20-decisions/` — se houve decisão que constranja o futuro
4. `agent-sync-ledger record` — para os outros devices verem, com
   `--device-id`, `--agent`, `--provider`, `--channel` e `--gate` com o número

O quarto é o que estava em falta até hoje: até 2026-08-25 este device nem sequer
tinha identidade, e o protocolo cuja função é responder *"quem/onde"* não
conseguia provar de que máquina vinha o trabalho.
