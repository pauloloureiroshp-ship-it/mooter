# Reproduzir cada prova com um comando — resposta à pergunta 10 do gauntlet

Todos os caminhos são relativos a esta pasta (`_handoff/provas-v1-2026-09-09/`), a partir do worktree do pacote. Cada cartão tem **dois** comandos: um que **recalcula os números a partir do bruto já guardado** (barato, determinístico, $0, é o que verifica o slide) e um que **volta a medir do zero** (caro, precisa de rede, modelo ou instalação — é o que reproduz a experiência).

| Cartão | Recalcular do bruto (verifica o slide) | Voltar a medir do zero |
|---|---|---|
| **P1** decidir custa zero | `node P1-decidir-custa-zero/run.mjs --analyse` | `node P1-decidir-custa-zero/run.mjs --arm A` e `--arm B` (B precisa de Ollama com `qwen2.5-coder:14b`) |
| **P2** o tier vale alguma coisa | `node P2-o-tier-vale-alguma-coisa/run.mjs --analyse` | `--arm A` (Ollama), `--arm B` e `--arm C` (subagente Haiku por subscrição) |
| **P3** obediência | `node P3-obediencia/run.mjs --analyse` | `--arm A` e `--arm B` (20 sessões `claude -p` cada; o braço B instala o hook `pretooluse-route.js` numa cópia isolada) |
| **P4** crítico ≠ autor | `node P4-critico-nao-autor/review.mjs --analyse` | `node P4-critico-nao-autor/setup.mjs` (clona os 3 sujeitos nos shas fixados), `node mutate.mjs`, depois `review.mjs --arm A` (Opus) e `--arm B` (Codex) |
| **P5** atestação de egress | `node P5-atestacao-de-egress/run.mjs --analyse` | `--arm A/B/C/D` e `node arm-e.mjs` (o braço E levanta um proxy de contagem por prompt; ver `SETUP.md` e `ccr.md` para os concorrentes) |
| **P6** custo na linha | `node P6-custo-na-linha/run.mjs --analyse` | `node P6-custo-na-linha/run.mjs --live` (corte A, lê o `decisions.log` vivo) e `--proto` (corte B, 20 chamadas Haiku) |
| **P7** usar vs não usar | `node P7-usar-vs-nao-usar/analyse.mjs` (lê `results/ledger.jsonl`; para reler uma corrida preservada, copia o ledger dessa corrida para esse nome) | `powershell -NoProfile -ExecutionPolicy Bypass -File "<caminho>/P7-usar-vs-nao-usar/launch-correr-3.ps1"` — **≈2 h 20 min e 46 invocações completas do agente**; exige uma janela de sessão inteira do fornecedor (ver `AMENDMENT-2.md`) |
| **P8** cabeça-a-cabeça | não tem cálculo próprio: cada célula cita o cartão de origem | — |
| **Instrumentos** | `node --test lib/` (proxy de contagem, calibração, estatística) e `node ../../tools/router/cost-line.test.js` (15/15, valores calculados à mão) | — |
| **O pacote inteiro** | `node lib/conferir-cartoes.mjs .` — 53 verificações que relêem os números dos slides a partir do bruto e reprovam se divergirem; com teste de mordida em `lib/conferir-cartoes.md` | — |

**Duas coisas que o `--analyse` de propósito não faz:** não volta a chamar modelo nenhum (por isso é $0 e determinístico) e não repara ficheiros de bruto em falta — se o `results/` estiver incompleto, ele diz e pára, em vez de calcular com menos.

**Uma advertência sobre o P7.** O `analyse.mjs` é um leitor **independente** do controlador: re-deriva X, o p exacto unilateral e o veredicto a partir do ledger cru, e serve para confirmar ou desmentir o número que o controlador imprimiu. O número que conta é o do controlador (`--analisar`, no log). Se os dois discordarem, é isso que se publica.

## As escotilhas — o que reapontar numa máquina que não é esta

Até 2026-09-09 oito caminhos desta máquina estavam codificados sem forma de os mudar, e um deles falhava em silêncio para zero (defeito **D14**). Todos passaram a ler uma variável de ambiente:

| Variável | O que reaponta | Sem ela |
|---|---|---|
| `PROVAS_CLAUDE_EXE` | o executável do agente, usado por P2, P3, P4 e pelos dois braços do P5 | o caminho do npm no Windows desta máquina; noutro sistema o `path.join` do `e-probe.mjs` chegava a lançar `TypeError` |
| `P5_HOOK` | o `inject_context.js` que os braços A do P5 medem | a cópia **instalada** em `~/.claude/`, que não é a do repositório (ver `00-preflight.json`) |
| `P6_DECISIONS_LOG` · `P6_LEDGER` | os dois ficheiros vivos que o corte A do P6 lê | **falha alto, com exit 2 e o nome do ficheiro em falta.** Antes devolvia «0 de 0 eventos com custo e origem», que se lê como medição |
| `P3_ROUTER_DIR` | o directório do router usado pelo P3 | a cópia instalada — e até hoje esta escotilha estava **fechada por dentro**: o hook honrava-a, o arreio sobrescrevia-a no ambiente de cada filho |
| `P2_PARTNER` · `P4_REPOS` · `P5_LITELLM_SITE` | já existiam antes | — |

**O que continua sem escotilha, e é honesto dizê-lo:** os braços que precisam de Ollama exigem os modelos certos instalados (`qwen2.5-coder:14b`, `qwen3:30b`); o P4 precisa dos três sujeitos nos shas fixados (é o que o `setup.mjs` faz); e o P7 precisa do executor do branch `feat/r24-controlador` — os comandos e os sha256 estão em `P7-usar-vs-nao-usar/ONDE-ESTAO-AS-FERRAMENTAS.md`.
