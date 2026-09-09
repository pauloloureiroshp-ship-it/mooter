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

**Duas coisas que o `--analyse` de propósito não faz:** não volta a chamar modelo nenhum (por isso é $0 e determinístico) e não repara ficheiros de bruto em falta — se o `results/` estiver incompleto, ele diz e pára, em vez de calcular com menos.

**Uma advertência sobre o P7.** O `analyse.mjs` é um leitor **independente** do controlador: re-deriva X, o p exacto unilateral e o veredicto a partir do ledger cru, e serve para confirmar ou desmentir o número que o controlador imprimiu. O número que conta é o do controlador (`--analisar`, no log). Se os dois discordarem, é isso que se publica.
