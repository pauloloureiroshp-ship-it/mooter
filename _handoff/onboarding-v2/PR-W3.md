> **Base:** `feat/onboarding-v2-w2` (PR #493). As ondas são sequenciais e nenhuma está fundida ainda.

## O achado maior não é a onda: o CI diz verde com 6 vermelhos

Ao ligar os testes desta onda ao script `test` do `tools/router`, os meus **78 casos passaram a
29**. Puxei o fio.

O script corre `node --test --test-force-exit …`. Essa flag mata o processo quando a fase síncrona
acaba — e **os testes assíncronos que ainda estavam a correr desaparecem, sem aviso e sem mudar o
código de saída**.

| | testes | pass | fail |
|---|---|---|---|
| **com** a flag (o que o CI publica) | 1110 | 1109 | **0 — verde** |
| **sem** a flag | **1316** | 1309 | **6** |

Por ficheiro: `ledger-turn-io` 7→16 · `provider-health` 7→14 · `ollama-host` 9→11 · `recibo` 10→11.

**206 testes nunca correm, e 6 falham enquanto o CI diz que está tudo bem.**

### Das 6, uma era minha — e foi apanhada por uma guarda que a flag esconderia

`ollama-host.test.js` tem uma verificação de **cobertura**: nenhum ficheiro de `tools/` pode ler
`process.env.OLLAMA_HOST` sem passar por `ollamaHostFromEnv()`. O `probe.js` desta onda
normalizava à mão, com regex própria — **passava nos meus testes e reprovava a guarda**.

Essa guarda existe por causa do defeito de 2026-09-01: o `OLLAMA_HOST` sem esquema fazia o
`callOllama()` devolver `null` sem razão nenhuma, o `catch` engolia o `Failed to parse URL`, e o
motor **$0 falhava mudo** enquanto o trabalho caía para um motor pago. Com a flag ligada, a minha
segunda implementação entrava em `main` em silêncio. **Corrigida neste PR.**

As outras 5 são `listen EPERM 127.0.0.1` (`mooter-doctor.test.js`) — a **sandbox desta bancada** a
recusar um listen local. **Não lhes chamo defeito** sem as reconfirmar fora dela.

### Mitigado, não corrigido — e a pista para a causa

Os três ficheiros desta onda correm em `npm run test:onboarding-v2`, **sem** a flag, com passo
próprio no CI. Sem isso, 78 casos passavam a 29 — e os 49 que faltavam eram precisamente os
assíncronos: enrolment, troca de payload, `fetch` injectado.

A causa **não** foi tocada. Mas há uma pista verificada: a suite inteira **não termina** nesta
bancada, e ficam vivos exactamente dois ficheiros — `pin-timeout.test.js` e `backtest.test.js`.
Ambos passam sozinhos. **Ambos falam com motores reais**: o `pin-timeout` testa `executePinned`
contra `codex exec`, que o próprio cabeçalho descreve como «an agentic loop, not a chat», com um
caso medido de 283 s e `timeoutMs: 600000`.

Hipótese, escrita como hipótese em `_handoff/onboarding-v2/DEFEITOS.md` (W3-D1): a flag existe
porque estes testes lançam motores a sério. Se for isso, **a correcção não é tirar a flag** — é
separá-los para uma suite própria, o mesmo padrão que esta onda já usou.

## O CI tinha outro buraco, do mesmo feitio

`tools/cli/**` **nunca esteve** nos filtros de caminho. As suites de lá correm a partir de
`tools/router`, por isso *pareciam* cobertas — as W1 e W3 só accionaram o CI porque tocaram
**também** em `tools/router/`. Um PR que mexesse só no `mooter init` ou no `update` passava verde
**sem correr teste nenhum**. Fechado neste PR (push e PR).

Presença não é cobertura, pela terceira vez neste repositório.

## A onda

O `init` perguntava **onze** coisas de faturação — «tens Claude Max?», «tens um plano Pro do
Claude Code?», «usas o Cursor?», «tens Copilot?». Três problemas, e nenhum era de estilo:

1. A pessoa pode não saber — é uma pergunta de **faturação**, não de configuração.
2. A pessoa pode enganar-se, e um perfil errado roteia mal **para sempre**, em silêncio.
3. Onze prompts são onze oportunidades de desistir antes do 1.º recibo.

Agora há um **probe** e **duas** perguntas: a que não se consegue medir (Claude Max — não há sinal
nenhum no ambiente, e a R6 proíbe espreitar sessões) e a rota. Medido nesta máquina, não afirmado:

```
GPU        Apple M4 Pro · 15.8 GB utilizáveis
RAM        24 GB
Ollama     a atender · 6 modelo(s)
claude     2.1.267 (Claude Code) · login n/d
codex      codex-cli 0.149.1 · login n/d
gemini     0.57.0 · login n/d
kimi       0.38.0 · login n/d
```

**A forma do `subscription-profile.json` não muda** — dez ficheiros a lêem, e torná-la «mais
honesta» partia os dez de uma vez. Muda de **onde vem cada valor**: e uma CLI instalada fica `n/d`,
nunca vira uma subscrição inventada — `claude` no disco não prova plano nenhum. A GPU **não** é
redescoberta: `gpu-probe.js` já o faz e já está testado.

### Também

- **Enrolment (D3):** o código de uso único morre e nasce uma **chave de device** — 0600, a privada
  nunca sai da máquina, e a chave **nunca é impressa nem truncada** (meia chave é um bom princípio
  para adivinhar a outra metade). Falhar aqui **não** impede o Mooter de funcionar: cai em Free
  local, porque nenhum estado bloqueia o router.
- **Conectores:** backup **verificado por conteúdo** antes de escrever, e um
  `claude_desktop_config.json` ilegível **não é reescrito** — se o fosse, perdiam-se os conectores
  de outra pessoa. A frase «reinicia o Claude Desktop» é o estado B8: sem ela, a pessoa olha para
  uma janela onde o Mooter «não está» e conclui que a instalação falhou.
- **Rota única** em `route.json` — **política sobre as classes que o classificador já produz**, sem
  lhe tocar. A distinção não é formalidade: um router reconfigurável por política continua a ter
  decisões reproduzíveis; um router cuja lógica muda por preferência deixa de ter comportamento
  que se possa provar.

## Apanhei-me a escrever um teste fraco

O primeiro teste do backup só verificava que `r.codigo` existia — verdade mesmo com o backup
vazio, corrompido, ou cópia do ficheiro **já reescrito**. Um backup que não restaura não é um
backup, e um teste que só olha para o rótulo **parece cobertura sem ser**. Passou a comparar o
conteúdo e a restaurar.

## Não dupliquei o consentimento

`consent.json` já tem escritor em `packages/cli`. Um segundo escritor para o mesmo ficheiro é a
pergunta nº2 do gate de pré-despacho («escritor único»).

## Portões

- ✅ `npm run test:onboarding-v2`: **78/78** (eram 29 com a flag)
- ✅ `landing`: **246/246** · `tsc --noEmit` limpo
- ✅ `packages/launcher`: 31/31
- ✅ `classify.js` e `patterns.js` intactos · **0 linhas** em `packages/`
- ✅ `SYNC.md` a 164 linhas; W0–W3 **movidas** (não apagadas) para
  `docs/foundation/SYNC_ARCHIVE_2026.md`

## `n/d` declarado

**A suite completa do `tools/router` não corre até ao fim nesta bancada** — é o W3-D1 acima. Não
afirmo verde que não vi; o CI é o árbitro.

**A rota `POST /api/devices/enroll` não funciona em produção**: falta a função `enroll_device` no
Supabase. Não apliquei a migração de propósito — é irreversível numa base com dados reais, e é
decisão do dono. O **contrato** que a rota espera está escrito dentro do próprio ficheiro, para a
migração ser escrita contra ele em vez de adivinhada.

## Não faz

Não toca no `classify.js` nem no `patterns.js`. Não altera pacote existente nenhum. Não aplica
migrações. Não tira o `--test-force-exit` (é a W3.5). Não funde nada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCFBbpAPoAQyZ45iF1VJbM
