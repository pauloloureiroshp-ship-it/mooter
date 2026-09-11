> **Base:** `feat/onboarding-v2-w3` (PR #496).

Duas coisas: a suite deixa de mentir sobre si própria, e a chave de release passa a existir.

---

# 1. A suite dizia 1110 verdes — e eram 1377

O script `test` corria `node --test --test-force-exit …`. Essa flag mata o processo quando a fase
síncrona acaba, e **os testes assíncronos que ainda estavam a correr desaparecem** — sem aviso, e
sem mudar o código de saída.

| | testes | pass | fail | termina? |
|---|---|---|---|---|
| antes | 1110 | 1109 | 0 | sim, em 3,4 s — porque matava os filhos |
| **depois** | **1379** | **1378** | **0** | sim |
| `test:integration` (opt-in) | 20 | 20 | 0 | sim |

**+269 testes passam a correr mesmo.** O `1 skipped` é pré-existente.

## Metade da hipótese estava errada, e a medição desfê-la

O plano era mover **dois** ficheiros para a suite de integração: `pin-timeout.test.js` e
`backtest.test.js`. Medi antes de mexer:

| corrida | resultado |
|---|---|
| suite sem **ambos** | termina — 1199 testes |
| suite **com** `backtest`, sem `pin-timeout` | **termina** — 1293 testes |

**Só o `pin-timeout.test.js` pendura.** O `backtest.test.js` parecia culpado por aparecer sempre
ao lado dele na lista de processos vivos — era só a vítima de estar na mesma corrida. Movê-lo
teria custado **~94 testes de cobertura no CI** por uma suposição. Ficou onde estava.

`pin-timeout.test.js` exercita `executePinned` contra o `codex exec` — o próprio cabeçalho do
ficheiro chama-lhe «an agentic loop, not a chat», com um caso medido de 283 s e
`timeoutMs: 600000`. É esse o ficheiro que justificava a flag: **a flag não foi um descuido, foi
uma solução para o sintoma errado.**

## A correcção não foi «tirar a flag»

Foi, por esta ordem: **medir** o que ela escondia · **isolar** o ficheiro que a justificava ·
**movê-lo** para `npm run test:integration` (opt-in) · e **só então** tirá-la. Ao contrário,
pendurava o CI inteiro.

## As 5 falhas de `mooter-doctor.test.js`: reconfirmadas, e não eram defeito

Corrido **fora** da sandbox: **5/5 pass**. Eram `listen EPERM 127.0.0.1` — a sandbox desta bancada
a recusar um listen local. Ficam arquivadas como artefacto de ambiente. Era por isto que não lhes
chamei defeito no dia em que apareceram.

Das 6, a única real era minha (o `probe.js` a normalizar `OLLAMA_HOST` à mão), já corrigida na W3.

## O que impede a volta

`tools/router/suite-honesta.test.js`, **dentro da própria suite**, com 6 guardas: a flag não pode
voltar ao `test` nem a **nenhum** script `test*` · o `pin-timeout` não pode regressar à suite
normal · o `backtest` não pode sair dela · a lista não pode encolher abaixo de um chão · e nenhum
ficheiro listado pode deixar de existir no disco.

O último não é teórico: **um ficheiro renomeado sem actualizar o script não dá erro** — o
`node --test` ignora-o em silêncio, e deixa de correr sem ninguém reparar.

---

# 2. A chave de release (D7)

Desde a W1 que o `update` e o launcher recusavam instalar seja o que for (`sem-ancora`). Não era
um bug: era a única postura honesta enquanto não houvesse chave. Agora há.

## Porquê uma terceira chave

| chave existente | porque não serve |
|---|---|
| HMAC do `assinatura.js` | **simétrica** — quem verifica assina. Pregá-la no cliente é distribuir a chave de assinar releases a toda a gente que instala o Mooter |
| Ed25519 do `assinatura.js` | **por device**, verificada contra um registo que vive no vault pessoal do dono. Um cliente instalado não tem vault |

## Onde vive cada metade

| | onde |
|---|---|
| Pública | `tools/cli/lib/release-pubkey.js` — **no git de propósito**; com ela só se verifica |
| Privada · pessoa | Keychain do macOS, `mooter-release-key`, `-T ""` (sem app de confiança → pede autorização a cada leitura) |
| Privada · CI | secret `MOOTER_RELEASE_KEY` |

Gerada neste Mac a 2026-09-11, `kid` **`4be1bf1d6017e10f`**. A cópia local do ficheiro privado foi
**destruída** depois de instalada nos dois sítios.

**Provado, não afirmado:** assinar com a privada real e verificar com a pública commitada devolve
`assinatura valida`, e o `kid` bate. Adulterar o `sha256` depois de assinado devolve
`assinatura-invalida`.

## Rotação — a ordem que não se pode inverter

`ancora()` passa a devolver uma **lista** de públicas e `verificarManifesto()` tenta-as todas,
porque **durante uma rotação há duas válidas ao mesmo tempo**. Publica-se a nova **primeiro**
(numa release ainda assinada com a antiga); só depois se troca o secret.

Ao contrário, todos os clientes com a pública antiga recusariam a release que traz a nova — e
ficavam **presos para sempre**, porque a única saída seria instalar uma release que eles já não
aceitam. Há teste para as duas passarem, **e para uma terceira chave continuar a ser recusada**:
aceitar duas não é aceitar todas. Procedimento completo no ADR § D7.

## Um teste mudou de pergunta

Dizia «o repo **não** commita uma chave de release — a âncora tem de estar **ausente**». Era
verdade enquanto não havia chave nenhuma. Agora há, e a pergunta certa mudou: não é «existe um
ficheiro de chave?», é **«alguma vez entra aqui uma chave privada?»**. Uma pública commitada é o
objectivo; uma privada commitada é uma chave que deixa de valer no segundo em que o é.

---

# 3. A migração `enroll_device` — escrita, **nunca executada**

`_handoff/onboarding-v2/MIGRACAO-enroll_device.sql`, escrita contra o esquema **real** (lido em
`landing/migrations/002` e `006`: `device_id` é TEXT e PK, `user_id` referencia `profiles(id)` e
**não** `auth.users(id)`).

⚠️ **Não foi executada em lado nenhum**, e está escrito no topo do próprio ficheiro:

- `create_branch` do Supabase devolveu **`PaymentRequiredException: Branching is supported only on
  the Pro plan or above`** — o projecto `frugal` está no Free.
- Nesta máquina não há Postgres nem Docker a correr (`psql`, `initdb`, `docker info` — nenhum).

Ou seja: **escrita contra o esquema real e revista, mas nunca parseada por um Postgres.** Um erro
de sintaxe ou de tipo só aparecerá na primeira execução. O ficheiro indica duas formas de a provar
sem gastar dinheiro (container descartável, ou `begin; … rollback;` no SQL Editor).

**Não aplicar em produção antes disso.** Fica para aprovação do dono.

---

## Portões

- ✅ `tools/router`: **1379 testes, 1378 pass, 0 fail, 1 skip**
- ✅ `test:integration`: 20/20 · `packages/launcher`: 31/31
- ✅ `classify.js` intacto: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- ✅ Varredura: nenhuma chave privada no diff
- ✅ `SYNC.md` a 174 linhas · stage explícito

## `n/d` declarado

Os **20** testes de `test:integration` deixam de correr em CI — precisam de motores reais que o
runner não tem. Antes corriam **truncados** (9 de 20 com a flag), o que não é melhor; mas é uma
diferença e fica escrita. Fechá-la exige um runner com `codex`/`ollama`, e isso é decisão de
infraestrutura.

## Não faz

Não toca no `classify.js` nem no `patterns.js`. Não aplica migrações. Não funde nada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCFBbpAPoAQyZ45iF1VJbM
