📥 **COLAR EM:** o §6 é o super masterprompt — cola-o numa **task nova do Cowork**, depois de instalar o `.mcpb` v1.3. Este ficheiro vive em `_handoff/MOOTER_V13_DRYTEST_E_MASTERPROMPT_2026-07-25.md` no repo `frugal` (EXISTENTE, árvore principal).

```yaml
type: DRYTEST + AUDIT + MASTERPROMPT
id: MOOTER-V13-2026-07-25
bundle: _handoff/mooter-v130.mcpb · 197 931 B · 14 ficheiros
sha256: f81c7123e6f1d066f694cac92a6ffdf9c15503a2c8de2962ba5ab3a00273c9b9
testes: 75 verdes, 0 falhas (11 são regressões da auditoria adversarial)
custo do dry test: $2.87 (1 job de auditoria) + $0 (codex nunca arrancou)
```

# 🧪 Dry test, advogado do diabo, e o que ainda não existe

## 1. O que o dry test PROVOU ao vivo

Despachei **cc e codex ao mesmo tempo**, de dentro do Cowork, para duas worktrees diferentes.

| Prova | Resultado |
|---|---|
| **Paralelismo real** | ✅ dois `started` no ledger com 9 s de diferença, ambos `alive:true` em simultâneo |
| **CC corre mesmo como sessão** | ✅ `job-ms0dc70s-f36f`, exit 0, **369 s**, **$2.866776**, `session_id: fe346550-…` — sessão Claude Code de verdade, com Bash e Grep |
| **Codex ainda pendurado (v1.1)** | ⚠️ `job-ms0dcdqm-0dfe` — **25+ min** em `"Reading additional input from stdin..."`. **Terceira reprodução.** A v1.3 corrige-o na origem |
| **Watchdog funciona** | ✅ o codex de manhã foi morto às 12:04 com `exit_code:"timeout"`, `duration_s:2063` — corrige o meu loophole 15: o timer EXISTE e disparou |
| **Modelo falso, de novo** | ⚠️ os 3 jobs cc mostram `claude-opus-4-8` / sessão `a00885ef` — a mesma sessão de 18 h. A v1.1 continua a mentir; a v1.3 não |
| **Sessões do cockpit** | ⚠️ `sessions: []` e `sessions_fresh:false` em **todas** as chamadas — o enriquecimento estoura o orçamento de 1200 ms sempre |

## 2. 🔪 O advogado do diabo — 12 achados, todos endereçados

Pus o próprio Mooter a atacar o Mooter: um job Claude Code com o papel explícito de encontrar falhas.
Encontrou **12**, três de severidade alta. **Um deles tinha efeito colateral real na tua máquina.**

| # | Achado | Sev | Estado |
|---|---|---|---|
| 1 | `subfolder` do modelo fazia `path.join` cru → escrita **fora do vault** | **alta** | ✅ resolvido — resolve + refusa o que escapa |
| 2 | `MOOTER_VAULT` era candidato, não autoridade → **os testes escreveram no teu vault real** | **alta** | ✅ resolvido — se definido, é o único; sem fallback |
| 3 | `sweepOrphans` no boot matava jobs vivos de uma **2ª janela** → dois agentes na mesma worktree | **alta** | ✅ resolvido — `owner.json` com pid + prova de liveness |
| 4 | `readJobResult` corria no `close` antes do stream drenar → podia perder custo/modelo | média | ✅ resolvido — espera `finish`, com tecto de 1,5 s |
| 5 | `mooter_cancel sweep:true` com o mesmo defeito | média | ✅ resolvido pelo #3 |
| 6 | `tokens_in` **inflado**: somava o contexto reenviado a cada turno | média | ✅ resolvido — input é max, output acumula |
| 7 | duas sessões na mesma pasta → o Map ficava com uma à sorte | média | ✅ resolvido — >1 sessão = `n/d` explicado |
| 8 | `writePlan` com `.tmp` fixo → lost update entre processos | média | ✅ resolvido — tmp com pid + random |
| 9 | injecção de `⇄` via `goal`/`context` podia forjar um cabeçalho de routing | média | ✅ resolvido — `⇄` recusado no input do utilizador |
| 10 | `readSync` ignorava os bytes lidos → memória não inicializada no painel | baixa | ✅ resolvido |
| 11 | `cost_usd: 0` apresentado como custo **total** | baixa | ✅ resolvido — rotulado custo de **API**; energia não é zero |
| 12 | `innerHTML` com números sem `esc()` | baixa | 🟡 aceite — só recebe `Number`; sem defesa em profundidade |

⚠️ **Limpeza que te pertence:** o achado #2 deixou um ficheiro no teu vault real —
`30-learnings/2026-07-25-nota-da-wave*.md`. Apaga-o quando quiseres; a partir da v1.3 não volta.

**O que o auditor disse estar bem feito** (uma linha, como pedi): `foldJobs` colapsa por `job_id` com
last-wins, portanto os totais **não** duplicam mesmo com `done`+`failed`+`collected` no mesmo job; e o
`esc()` fecha a superfície XSS real do painel.

## 3. As 11 lacunas desta ronda

| # | Pedido | Estado na v1.3 |
|---|---|---|
| 1 | layout | ✅ mantido, mais denso |
| 2 | **qual wave está a ser trabalhada** | ✅ bloco no topo: wave, objectivo, `3/5 etapas`, barra, `⚠ n risco alto` |
| 3 | **números coerentes** | ✅ **o painel audita-se**: `coherence[]` sinaliza custo em falta, router pedido ≠ corrido, tokens ausentes, modelo sem proveniência |
| 4 | **qual é a GPU** | ✅ nome real (`nvidia-smi`), driver, VRAM total |
| 5 | **pasta + lido/editado** | ✅ pasta no cabeçalho; por job, chips dos ficheiros — `✎` marca os **escritos** |
| 6 | **quantos cloud vs local, ao vivo** | ✅ cabeçalho: *"2 subscrição · 1 local a trabalhar"* |
| 7 | **waves na lateral, nativo** | ✅ wave no topo + variáveis de tema do host (~80 tokens CSS) + `prefersBorder` |
| 8 | **handoffs e quem faz** | ✅ secção *Handoffs*: `qwen2.5:3b → sonnet` com chip `$0 de preparação`. **Só aparece se for verdade** — o ledger grava `handoff_from` apenas quando o output foi mesmo embebido |
| 9 | **GPU % em tempo real + overclock** | ✅ barras de utilização e VRAM, temp, watts; veredicto de folga e botão *"Aproveitar a folga"* |
| 10 | **Live Preview no Cowork** | 🟡 **não construído — ver §4** |
| 11 | **CC e Codex mesmo pelo Cowork** | ✅ provado hoje (§1) |

**E o que ninguém pediu mas faltava:** `mooter_work` agora tem **`prepare`** ligado por omissão — o moo
local escreve o brief de handoff a **$0**, e o agente pago arranca com esse trabalho **já dentro do
prompt**. É o "carregar o piano", e fica registado como cadeia provada, não como slogan.

## 4. 🟡 Live Preview dentro do Cowork — o que é possível e o que não é

Fui à spec MCP Apps (2026-01-26) em vez de adivinhar.

**O que a spec permite:** o recurso do painel declara `_meta.ui.csp.frameDomains`, que vira `frame-src`.
Declarar `http://localhost:*` **autoriza embutir um iframe** do teu dev server dentro do painel.
`postMessage` entre esse iframe e o painel **não é bloqueado por CSP** — e o tap de selecção que já
existe na landing do Mooter fala exactamente por postMessage.

**Onde pode partir, e não sei sem tentar:**
- *"Host MAY further restrict but MUST NOT allow undeclared domains"* — declarar é **necessário, não
  suficiente**. O Cowork pode recusar `localhost` por política e nada no protocolo obriga a aceitar.
- O sandbox proxy usa origem dedicada; um dev server sem CORS pode recusar ser enquadrado
  (`X-Frame-Options`).
- Publish e security review continuam **gates humanos** — e o Live Preview tem um P0 fail-open já
  auditado (`LP_CODEX_AUDIT_REPORT.md`). Trazê-lo para o Cowork **não** o corrige.

**Proposta honesta (2 h, não promessa):** uma prova mínima — declarar `frameDomains`, tentar carregar
`http://localhost:<porta>` num iframe do painel, e ver. Passa → o Live Preview no Cowork é real e vale
uma wave própria. Não passa → o plano B é **screenshot por job**: o CC headless corre um browser e
devolve PNG. Isso dá **ver**, não **selecionar** — e é preciso dizer isso pelo nome.

## 5. Loopholes que ficam abertos (a lista honesta)

| # | Loophole | Porquê fica |
|---|---|---|
| 18 | O bundle instalado é sempre **manual**. `%APPDATA%\Claude\Claude Extensions` não é concedível ao Cowork → nenhuma automação minha chega lá | limite do host |
| 19 | `sessions_fresh:false` **permanente** — o enriquecimento nunca cabe em 1200 ms nesta máquina | precisa de cache persistente, não de mais orçamento |
| 20 | Codex ignora `allowedTools`: corre com `--sandbox workspace-write`. **O masterprompt é a única barreira** | o adapter precisa de mapear a matriz de permissões para as flags do codex |
| 21 | O `moo` não tem ferramentas: não lê ficheiros, só raciocina sobre o que lhe damos. O brief é bom, mas cego | dar-lhe leitura exige um mini-agente, não um `/api/chat` |
| 22 | Nenhum teste corre no **Windows** — a suite é validada em Linux. `taskkill`, `shell:true` e caminhos com espaços são exactamente onde partem | precisa de uma corrida nativa na máquina dele |

---

## 6. ⇄ SUPER MASTERPROMPT — a wave seguinte

📥 **COLAR EM:** task **NOVA** do Cowork, depois de instalar o `mooter-v130.mcpb` e de reiniciar o Desktop.

```
⇄ MOOTER · WAVE COWORK-FIRST
Cowork é o cérebro. O Mooter roteia. CC e Codex executam em paralelo. Os moos locais carregam o piano.
Nada disto sai da conversa.

OBJECTIVO DESTA WAVE: <descreve em uma frase o que queres feito>

── ARRANQUE (por esta ordem, sem saltar) ─────────────────────────────
1. `mooter_cancel(sweep:true)` — limpa fantasmas e liberta worktrees. Diz quantos fechaste.
2. `mooter_fleet` — lê o painel. Confirma em voz alta: versão do servidor, nome da GPU, %
   de utilização, modelos residentes, e se o vault está detectado. Se algum for `n/d`, DIZ,
   não contornes.
3. `mooter_session_bind` — projecto, pasta e os ficheiros que vais tocar.
4. `mooter_plan action:"set"` — as etapas desta wave. Escreve-as como o utilizador as diria.
   O risco é inferido; corrige à mão o que estiver mal classificado.

── EXECUÇÃO ──────────────────────────────────────────────────────────
5. Para cada etapa independente, `mooter_work` com `prepare:true` (default):
   · a GPU local escreve o brief a $0
   · o agente pago arranca com esse brief já embebido
   · passa sempre `step:"S<n>"` para o painel mostrar quem fez o quê
6. Corre etapas independentes EM PARALELO, em worktrees diferentes. Uma worktree = um job.
   Se o guard recusar por posse, é sinal — não forces.
7. Usa `agent:"codex"` em pelo menos uma etapa de análise. ⚠️ Codex ignora `allowedTools`:
   a única barreira é o masterprompt. Escreve as proibições de forma explícita.
8. Enquanto correm: `mooter_status(wave:…)` a cada ~60 s. Relata em UMA linha por job:
   modelo real · o que está a fazer · tokens · tok/s. ❌ Não repitas o JSON.

── HIGIENE (o que separa isto de teatro) ─────────────────────────────
9. NUNCA afirmes um número que não venha do ledger, do stream ou de `nvidia-smi`.
   O que não souberes = `n/d`. Se o painel mostrar incoerências (`coherence[]`), lê-as em voz alta
   antes de continuar.
10. ❌ Zero git (add/commit/push/merge/rebase/delete). ❌ Nada fora de `_handoff/`, `~/.mooter/`
    e do vault. ❌ Nunca tocar em `tools/router/classify.js` (FROZEN).
11. Se a mesma coisa falhar 2×, PARA e escreve o que houver.

── FECHO ─────────────────────────────────────────────────────────────
12. `mooter_collect` de cada job. Sintetiza — não coles resultados brutos.
13. `mooter_plan action:"get"` — confirma que todas as etapas fecharam com um `by` real.
14. `mooter_journal` com o resultado da wave (kind:"learning" ou "decision"). Se o vault
    for `n/d`, diz-me em vez de escrever às cegas.
15. Fecha com **BOARD** (item × estado × próxima acção) e **SOCIO** (receita/despesa↓/risco↓/
    reversível/escopo). Inclui: custo real da wave, % de output que foi local, e a divergência
    entre o modelo que o router pediu e o que correu.

── ❌ NÃO FAZER ──────────────────────────────────────────────────────
· Não uses `mooter_dispatch` directo quando `mooter_work` serve — a porta única existe por isso.
· Não desligues `prepare` sem razão: é $0 e encurta o prompt pago.
· Não declares "handoff perfeito" sem uma linha `handoff_from` no ledger a prová-lo.
· Não peças ao utilizador para abrir o VS Code. Se algo só for possível lá, diz porquê.
```

## 7. BOARD

| Item | Estado | Próxima acção |
|---|---|---|
| v1.3 construída, auditada, testada | ✅ **75 testes verdes** | — |
| Instalação | 🔜 **só tu** | `mooter-v130.mcpb` → reiniciar com tray |
| Job codex pendurado | ⚠️ 25+ min, `frugal-integ` | depois de instalar: `mooter_cancel(sweep:true)` |
| Ficheiro parasita no vault | ⚠️ deixado pelo achado #2 | apagar `30-learnings/2026-07-25-nota-da-wave*.md` |
| Live Preview no Cowork | 🟡 viável, **por provar** | prova de 2 h com `frameDomains` |
| Testes no Windows | ❌ **nunca corridos** | primeira wave depois de instalar |
| Codex + allowedTools | ⚠️ ignora a matriz | wave própria do adapter |
| Commit | 🔜 gate teu | `git add` selectivo; ❌ nunca `-A` |

🤝 **SOCIO:** receita? na · despesa↓? **S** — `prepare` move a orientação para $0 e o `--model` deixa de
mandar tudo para Opus · risco↓? **S** — três bugs de severidade alta apanhados **antes** de instalares,
um deles a escrever no teu vault · reversível? **S** — desinstalar volta à v1.1, que está no repo ·
escopo? **S** — nada fora de `packages/mooter-bridge/`.

📮 **DESTINO:** Paulo (instalar → sweep → colar o §6 numa task nova)
