# Inventário e ordem — 2026-08-25

> **Estado:** proposta. Nada executado sem o dono dizer.
> **Origem:** confronto adversarial do roadmap de 5 passos que o assistente propôs nesta
> sessão, contra o canon do vault, o `main` real (`deb14d22`) e a máquina do dono.
> 8 agentes · 196 tool calls · 1.071.001 tokens · 0 erros.
>
> **Régua:** cada linha traz o **facto medido com fonte** e um **portão numérico**.
> Onde não foi medido, diz `n/d` — nunca um número inventado.

## O erro que enquadra tudo o resto

Os 5 passos propostos, contados contra as cinco experiências do `CLAUDE.md`
(*Resume · Plan · Route · Watch · Review*):

```
Resume 0 · Plan 0 · Route 0 · Watch 1 (e a remover uma guarda) · Review 0
```

E o passo 1 **piorava** o Review. `CLAUDE.md:13` diz *"the engine is table stakes;
the cockpit is where the proof shows"* — foi escrita uma lista de manutenção do motor
porque se passou o dia dentro do motor. Esta é a quinta lista de roadmap viva no
projecto, e usava rótulos `F1-F5` que colidem com o North Star.

---

## 🔴 BLOCO 0 — arde agora · mão do dono · zero linhas de código

| id | o quê | facto medido | portão numérico |
|---|---|---|---|
| **T0.1** | fechar a porta do Ollama | `netstat`: `TCP 0.0.0.0:11434 LISTENING` PID 11840 · 2 regras `ollama.exe` **Enabled/Inbound/Allow/Public** · processo relançado pelo ícone hoje 16:29:58 | `netstat` sem `0.0.0.0:11434` **e** sem `[::]:11434` · as 2 regras a `Enabled:False` · o `db.sqlite` a dizer loopback (não só a porta — resistiu a 3 tentativas) |
| **T0.2** | decidir sobre o `pm2 mooter-fleet` | `online`, pid 3924, **937 MB**, ↺3 · corre `fleet-forever.mjs`, **ausente do `origin/main`** (PR #232 draft há 46 dias) · **4 achados em 2.653.041 ciclos** · log 32 MB | `pm2 list` sem processos a correr ficheiros que não existem em `origin/main` |
| **T0.3** | rodar o PAT do GitHub | padrão `github_pat_` em 2 backups (`14/06`, `24/07`) + 33 transcripts. **Não** está na config viva — essa não tem servidor MCP nenhum | PAT novo emitido, antigo revogado |
| **T0.4** | rodar a senha do DVR | o ficheiro já usa `$DVR_PASS`, histórico git limpo · **rotação no aparelho: `n/d`** | só o dono sabe |

**Nota de método:** o T0.3 foi reportado por um agente com uma localização **precisa e
errada** (dizia estar na config viva). Foi verificado à mão antes de ser repetido.
Um relatório de segurança não confirmado é pior do que nenhum.

---

## 🟠 BLOCO 1 — entregar o que já existe

| id | o quê | facto medido | portão | motor |
|---|---|---|---|---|
| **T1.1** | o conector corre de um checkout velho | `claude_desktop_config.json` aponta para `…/frugal/packages/mooter-bridge/server-seamless.js` · esse checkout em `77cc92bc`, `origin/main` em `deb14d22` = **19 commits atrás**. Nenhum `.mcpb` instalado | config a apontar para artefacto versionado, não para uma pasta de trabalho | dono + T3 |
| **T1.2** | 103 commits que ninguém lá fora tem | `git rev-list --count v1.49.4..origin/main` = **103** · 343 ficheiros · +13.507/−1.441. Inclui o portão de existência, o produtor da âncora e os 56 `catch-neutro` | `git rev-list --count <tag-nova>..origin/main` = 0 · `version.json.released` = data real da tag | T3 + `final-reviewer` |

> Ordem obrigatória, já registada em memória: **bump → merge → tag → release**.

---

## 🟡 BLOCO 2 — fechar o circuito do detector

*O passo 1 original ("trocar o juiz pelo detector") foi **retirado**. Estão em série,
não em paralelo — e os dois números não são comparáveis: 70% é precisão de um
**gerador de candidatos**, 52,6% é concordância de um **juiz** com um humano.*

| id | o quê | facto medido | portão | motor |
|---|---|---|---|---|
| **T2.1** | dar sumidouro ao detector | a âncora tem apontamentos e **0 com decisão**. Único leitor é `moo-runner.mjs:717` (input do juiz). Não entra em `porTriar` (`triagem.mjs:242`) nem em `por_triar` (`fleet-state.mjs:306`) — **o painel não os conta** | `por_triar` a incluir apontamentos de âncora · `alerta_achados` a disparar | codex |
| **T2.2** | repor um pilar elegível | `runner-state.json`: `pausa.razao: "no eligible loop"`, `fila: 0`, desde **12:09 de hoje** · `runner.log` diz `pilares  (default)` — **vazio** | `runner-state.json` sem `pausa.razao` · `fila > 0` | codex |
| **T2.3** | agendar o produtor da âncora e carimbar frescura | `grep ancora.mjs` em `tools/`, `package.json`, `.github` → só o teste. `ancora.mjs:446` escreve `gerado_em` e **ninguém o lê** | agendador a existir · `readAnchor`/`verAncora` a **recusar** âncora mais velha que X | codex |
| **T2.4** | triar os 31 candidatos actuais | o detector produz hoje **31** apontamentos sobre 289 ficheiros — não 84 nem 57. Os 28 defeitos corrigidos hoje saíram do universo. **Precisão actual: `n/d`** | 31/31 rotulados · precisão **derivada**, nunca declarada | dono + Opus |
| **T2.5** | deixar correr e medir o ancorado | modos nos 10.624 recibos: `caca 7760 · diff 1812 · sem-modo 1052 · **ancorado 0**`. O modo que o passo 1 queria trocar **nunca correu uma única vez** | ≥N recibos com `modo:'ancorado'` (**proponho 30** — não é número medido) · a medição gravada como `medicao:{}` que passe `podeEntrar` | Ollama · $0 |

**A medição do juiz não passa o meu próprio portão.** Os 70% estão gravados
(`ancora.mjs:200`, `medicao:{84,40,28}`) e derivados por `podeEntrar:336`. Os 52,6% e
os 25,9% não têm ficheiro, recibo nem commit — e `podeEntrar:326` recusa *"uma regra
sem números, por mais convincente que seja o `porque`"*. **O T2.5 é o que os torna
legítimos.**

---

## 🔵 BLOCO 3 — os números que sustentam a tese

| id | o quê | facto medido | portão | motor |
|---|---|---|---|---|
| **T3.1** | tokens: escrever depois da execução | `decisions_v2.jsonl`: **4.781 linhas, todas com `tokens_in`/`tokens_out`, zero com valor diferente de 0**. Causa: `inject_context.js:1028` escreve no hook de *classificação*, antes de haver execução, e `decisions_v2.js:77-78,92` fecha com `|| 0`. `savings-tracker.js:769` exige `tokOut > 0`, logo `est_tokens_saved_pct` é estruturalmente `null` | % de linhas com `tokens_in` diferente de 0 acima de 0 · `est_tokens_saved_pct` não-`null` pela primeira vez | T3 architect |
| **T3.2** | reparar o instrumento antes de citar o 0,23% | o medidor canónico é `computeRoutingAudit` (`savings-tracker.js:689-746`) e **nunca emitiu "3026/7"**. A fonte usada, `execution.log`, é **uma linha por chamada Bash** (`exec-logger.js:3`) · 29.890 linhas · 109 `model=claude-so` truncado e 65 `unknown` **descartados em silêncio** | número emitido por `computeRoutingAudit` · truncados e `unknown` deixarem de ser descartados calados | sonnet |

> `docs/archive/audits/AUDIT-MOOTER-2026-04-19.md:143-145` — **o repo já matou um
> número exactamente desta forma.** E escrever `0` é pior do que escrever `null`: a
> jusante ninguém vê um buraco, vê um número.

---

## ⚪ BLOCO 4 — distribuição e higiene

| id | o quê | facto medido | portão | motor |
|---|---|---|---|---|
| **T4.1** | o instalador não distribui o cockpit | `grep "cockpit|moo-runner|autostart" install.sh` devolve **só um comentário** (`:133`) | o mesmo `grep` a devolver código | codex |
| **T4.2** | 5 listas de roadmap para 1 | v3-waves · FOUNDATION F0-F7 · North Star F0-F5 · PORTOES F1-F5 · esta. O `PORTOES_ROADMAP.md` tem 1 commit e **já dá como pendente o que o `#389` e o `#391` entregaram** | 5 para 1 · masterprompts executados fora do topo de `_handoff/` | dono decide |
| **T4.3** | higiene de git | **32 PRs abertos**, o mais novo com 26 dias, **zero de Agosto** · 203 commits somados · pelo menos 10 de ondas que o `main` já ultrapassou · 74 worktrees · 179 ramos locais não mergeados | 32 para 22 ou menos · worktrees: alvo `n/d`, decide o dono | haiku a triar, dono autoriza |
| **T4.4** | produção cega | Sentry: 4 projectos por criar e DSN em 3 stores, logo os 4 SDKs são **no-op** (`SYNC.md:119-137`) | DSN real · 1 evento recebido | dono |

---

## ⏸ BACKLOG — bloqueado, e a dizer porquê

| id | o quê | bloqueio |
|---|---|---|
| **B.1** | lease cross-device | **Só faz sentido com um segundo device a escrever**, e o único candidato é o Jetson, que vem depois. **O primeiro passo é ler um ficheiro, não escrever um:** `packages/worktree-conductor/src/locks.ts` já promete *"atomic locks, heartbeats, serial intent queue"* — pode ser integração e não construção. *(O desenho do kimi está feito e sobreviveu à crítica — fica guardado.)* |
| **B.2** | Jetson | Precisa da placa ligada. **E tem um passo 0 que ninguém escreveu:** `runner-core.mjs:23` tem `DEFAULT_MODEL='qwen2.5-coder:14b'` como `const` **sem override de ambiente** — e 14b não cabe nos 8 GB unificados do Orin Nano. Dos 3 defeitos nomeados, o (c) provavelmente **não deve ser corrigido**: a resposta certa é o self-check dizer *"não sou host de conector"*, não inventar uma raiz Linux |

---

## ❌ CORTADO — e porquê

| cortado | razão |
|---|---|
| **`MOO_HOST` + Tailscale** (passo 3) | A única entrada da lista que **remove** uma propriedade de segurança em vez de somar capacidade. `MOO_HOST` não existe: o que existe é `HOST` const (`f10-server.mjs:73`) mais **três guardas** (`hostAllowed:142`, `originAllowed:120`, `corsHeaders:179`) e **dois ficheiros de teste que asseveram a recusa como regressão**. A decisão já estava tomada por escrito — `fleet-beacon.mjs:4-8`: *"no amount of Origin checking fixes a listening socket on a shared wifi"*. Toda a arquitectura de beacons assinados existe **em vez** disto. **E o prémio do atacante foi subestimado:** sem autenticação nenhuma, um `POST /triagem` com `por:'dono'` alimenta `contarTriagem().do_dono` → `portoes()` → **o nível 2 do autopilot**. Não é um botão de parar: é subir a autonomia de um agente. **A alternativa custa zero linhas:** `ssh -L 4290:127.0.0.1:4290` passa as guardas, e o `fleet-state.test.mjs:193` já o assere |
| **"máquina de classes"** (passo 5) | **Já está em `main`** (`#389`). O `podeEntrar` (`ancora.mjs:322-342`) decide por `medicao` e recusa não-inteiros, `reais > lidos` e `lidos > candidatos`. Propor o que existe consome fila e esconde o que falta |
| **passo 1 na forma "trocar"** | Reescrito como **T2.1** (dar sumidouro) e **T2.5** (medir). A troca só se decide depois, com o número gravado |

---

## O que os adversários NÃO derrubaram

- A hipótese central de que o detector é melhor sinal que o juiz — **nada no código a contradiz**. O que caiu foi a alegação de que já estava *medida*.
- O problema da lease é real: a semântica actual é local (`moo-runner.mjs:137-152`, PID mais `process.kill(pid,0)`).
- `classify.js` intacto: `PASS classifier_frozen: 427d8c0b…364bc48f`.

## Duas perguntas que só o dono responde

1. **`pm2 mooter-fleet`** — matar, ou rever o `#232` primeiro? (7 semanas · 4 achados em 2,65 M de ciclos)
2. **As cinco listas de roadmap** — qual fica canónica e quais se arquivam?
