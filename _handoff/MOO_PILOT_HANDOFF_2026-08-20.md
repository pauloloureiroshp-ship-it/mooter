# ⇄ HANDOFF · Moo Pilot · Mac mini → Windows

**Emitido** 2026-08-20 · **por** Claude Code no `mac-mini-de-paulo` · **para** Cowork no PC Windows
**Objectivo deste documento:** dar ao próximo agente o estado real, sem ter de o re-descobrir.

---

## 0 · TL;DR

O Moo Pilot passou de **um painel que não compilava** a um cockpit que se audita
a si próprio. 19 PRs merjados em 2026-08-19/20. **355 testes, 0 falhas.**

A frota tem **um device**. O Windows nunca publicou. O conector está **16
versões atrás** em todas as máquinas. E o número que manda continua mau: **13
aceites em 307 achados**.

---

## 1 · VERSÕES — o que está a correr, medido, não assumido

| o quê | versão | onde se lê |
|---|---|---|
| repo (HEAD) | `b4f70927` (#316) | `git log -1` |
| conector **no repo** | **1.49.3** | `packages/mooter-bridge/manifest.json` |
| conector **instalado** no Claude Desktop | **1.33.0** ⚠️ | `~/Library/Application Support/Claude/extensions-installations.json` |
| runtime do router (espelho) | 1.49.3 | `~/.claude/tools/router/version.json` |
| skill `moo-pilot` | 119 linhas, bilingue mac/win | `.claude/skills/moo-pilot/SKILL.md` |
| pilares activos | **P1 … P10** | `context-pack.mjs` |

> **O Moo Pilot não tem número de versão próprio.** Anda com o repo. Se
> precisares de um identificador para um relatório, usa o SHA do `HEAD`.

⚠️ **Dezasseis versões de diferença no conector.** O `.mcpb` da v1.49.3 está
descarregado em `~/Downloads/mooter-v1493.mcpb` **desde 18/08** e nunca foi
instalado. Não é falta do ficheiro — é falta do duplo-clique. **Nenhum script
pode fazer isto**: instalar uma extensão é aprovação do utilizador, e escrever
no registo forjaria um estado que a app não conhece.

---

## 2 · ESTADO AO VIVO (2026-08-20, `mac-mini-de-paulo`)

```
rondas 5000 (janela) · cited 991 · uncited 69 · nada-por-rever 256
triagem: 307 achados · 196 por triar · 13 aceites · 97 descartados
por motivo: nao-e-um-problema 16 · citacao-certa-conclusao-errada 11
descartes anteriores à regra (sem motivo): 70
frota: 1 device
```

---

## 3 · O QUE FOI FEITO — 19 PRs, por tema

### Os números deixaram de mentir
- **#292** o painel **não compilava**. Um apóstrofo por escapar matou o `<script>`
  inteiro (550 linhas). A suite passava porque os testes procuravam padrões no
  *texto*. Agora o 1.º teste é `new vm.Script(SCRIPT)`.
- **#310** `uncited: 275` → **66**. 209 eram rondas que **nunca chamaram o modelo**.
  Retroactivo, sem reescrever o ledger.
- **#308** o `escalate to` era um `<select>` **sem `onchange`** — decorativo, ao
  lado de botões reais. Removido. `open issue` **não abre issue nenhuma** → passou
  a `flag for issue`.
- **#300** o painel de recurso servia-se **em silêncio** com 200. Agora leva
  header `X-Moo-Panel` e um aviso visível.

### A GPU deixou de girar em falso
- **#295/#297** memória de revisão **por pilar** + âncoras por padrão:
  19 337 → **267 353 linhas**; 604 → **3 274 janelas**.
- **#304** o apontamento do eslint ia para **pilares errados** — um pilar de
  documentos recebia `.js`.
- **#307** **76% do material não era defeito**: 58 de 76 âncoras eram `no-empty`
  em `catch` deliberados. 76 → 4.
- **#312** **A/B com defeito plantado**: perguntar *"há um defeito?"* → `NO FINDING`
  em 1s, falhou. Perguntar *"copia os dois números e compara"* → **apanhou-o**.
  Os 10 pilares passaram a copiar-e-comparar.

### Custo e honestidade
- **#293** custo por modelo (`/custo.json`). A família Claude 5 **não existia** em
  `pricing.js` — `claude-opus-5` era 98,7% dos turnos e caía no fallback de
  Sonnet. Os mesmos 7 dias: **$16,52 errado vs $27,53 real**.
- **#299** **descartar exige razão** (5 fechadas). Fase A do roadmap.
- **#311** **auto-verificação** (`/saude.json` + cartão *"What needs your hand"*) —
  determinística, sem modelo, cada alerta com o comando que o resolve.

### Multi-device e arranque
- **#302/#306** publicador de beacons. A 1.ª versão **nunca correu**
  (`where.replace is not a function`) — os 8 testes testavam o módulo, nenhum
  testava a **ligação**.
- **#313/#314/#315/#316** preflight de alinhamento → `moo-sync` → arranque de um
  comando → **tudo colapsado**: `npm run pilot` alinha antes de levantar.

---

## 4 · PASTAS — o que foi tocado e o que NÃO foi

### Acedido e alterado
```
tools/cockpit/                    o Moo Pilot todo (runner, painel, sync, bootstrap)
tools/router/pricing.js           família Claude 5
tools/router/backtest.js          linha `null` derrubava o /mooter-update (#303)
tools/router/moo-skills.test.js   declarar a moo-sync (13 → 14)
.claude/skills/moo-pilot/         + moo-sync
docs/strategy/MOO_PILOT_MODES_ROADMAP.md
package.json                      scripts device:sync/check/bootstrap
```

### Acedido só para LER
```
packages/mooter-bridge/quota.js   reutilizado por spend-by-model (NUNCA alterado)
hub/routes/, hub/migrations/      estudo da ponte multi-device
AGENTS.md, CLAUDE.md, INFRA.md
```

### Deliberadamente NÃO tocado
```
tools/router/classify.js          FROZEN — sha CI-enforced
packages/*                        engine congelado (waves 28-34.5)
SYNC.md                           606 linhas vs gatilho de ~200; o ratchet da
                                  higiene BLOQUEIA acrescentar-lhe linhas.
                                  Arquivar é mover ficheiros → revisão do Paulo.
~/.mooter/preferences.json        nunca escrito (causa da statusline curta)
```

---

## 5 · VAULT

```
path        /Users/pauloloureiro_mac_mini/paulo-vault   (VAULT_PATH)
remoto      git@github.com:pauloloureiroshp-ship-it/paulo-vault.git
branch      main   ← estava em `codex/agent-sync-fleet-v3`, movido em 19/08
beacons     50-fleet/mac-mini-de-paulo.json   (só este)
```

**Alterações feitas no vault** (as únicas):
- `50-fleet/mac-mini-de-paulo.json` — beacon, publicado de 10 em 10 min
- `.claude/moo-bootstrap.mjs` — stub de arranque (`c2e94f5`)
- `.claude/3rd-brain/index.json` — reconstruído

⚠️ **O branch `codex/agent-sync-fleet-v3` tem 5 commits do Paulo por empurrar.**
Intactos. **Não os empurres.**

⚠️ **O índice do vault estava 21 dias atrasado** — 60 de 448 ficheiros (13%)
invisíveis a quem seguisse o `AGENTS.md`. Causa: **não existe hook `SessionStart`**
(o `AGENTS.md` afirma que existe). Reconstruir custa **135 ms**.

---

## 6 · PENDENTE — por ordem de bloqueio

### Só o Paulo pode
1. **Instalar o `.mcpb` v1.49.3** — `~/Downloads/mooter-v1493.mcpb`. Desalinha tudo o resto.
2. **Triar.** 196 por triar; das 110 decisões, **13 aceites** e as úteis foram do Claude.
   Sem isto a **Fase A não produz dado** e as fases C/D não têm base.
3. **Decidir o projecto activo** — `cowork-session.json` diz `mooter-pilar-coerencia`,
   `sessoes/mooter.json` diz `mooter-gpu-local-strategy`. **Discordam, sem árbitro.**
4. **Arquivar o `SYNC.md`** (606 → ~200 linhas).

### À espera de autorização
5. **Reparação autónoma** — a GPU propõe o *patch* e ele só chega à triagem se
   **compilar e a suite passar**. Muda o que a máquina escreve no repo sozinha.
6. **Vista read-only partilhável** — o painel tem `POST /stop`; uma URL partilhada
   é um botão de parar a GPU de outra pessoa. Separar **ver** de **comandar**.

### Construível já
7. **Verificador adversarial** — 2.º modelo local a julgar o 1.º. `gpt-oss:20b` e
   `gemma4:12b` estão parados. É o moat escrito no `CLAUDE.md` e não existe no loop.
8. **Ligar o hub** — ver §7.

---

## 7 · A OPORTUNIDADE — está construída e escura

```
hub/routes/live_sessions.js      POST/GET /v1/live-sessions
worker deployado                 responde 400 "bad_owner" → o handler ESTÁ vivo
clientes JÁ escritos             sessions-orchestrator/src/remote.ts
                                 vscode-extension/src/hub-client.js
```

O comentário do ficheiro descreve exactamente o multi-device:

> *"Lets a user's OWN cockpits (e.g. a Windows PC and a Mac) see each other's live Claude Code sessions"*

**Porque nunca funcionou:** `~/.mooter/identity.json` **não existe**, e sem
`owner_hash` o cliente devolve `[]` **em silêncio**. Existe `device.id`
(`ac67a7f5…`) e `install-id.json`; falta só a chave que agrupa os devices do
mesmo dono.

**Uma feature deployada, com migrations, schema e dois clientes — escura por três
linhas de JSON.**

É *pull*, nunca *push*: um GET só devolve devices com o mesmo `owner_hash`, o
schema **rejeita** conteúdo de prompts/ficheiros, e ninguém comanda ninguém.

### Outras oportunidades registadas
- **`preferences.json` nunca escrito** — lido por ~40 ficheiros, causa da statusline curta.
- **`TIER_TO_PRICING_KEY` desactualizado** — há **três** mapas tier→modelo
  divergentes (`pricing.js`, `budget-engine.js:60`, `_model-resolver.js:21`).
  Corrigir um só põe o relatório a escrever `sonnet-4-6` e a cobrar Sonnet 5
  (provado pelo CI). Têm de ser tratados juntos.
- **Corpos por enterrar** em `~/.mooter/`: `f10-server.py` (Python que nada chama),
  `mooter-mcp-boot.log`, 6× `marca-*.txt`, `backup-1.33.0`. Os `jobs/` não têm reaper.
- **`bridge-runs.log` e `fable-5-escalations.jsonl` são write-only.**
- **O conector e o cockpit não se conhecem** — partilham o nome de uma pasta e
  mais nada. "fleet" quer dizer coisas diferentes nos dois.

---

## 8 · O QUE FAZER NESTE WINDOWS

```powershell
git clone git@github.com:pauloloureiroshp-ship-it/paulo-vault.git $HOME\paulo-vault
node $HOME\paulo-vault\.claude\moo-bootstrap.mjs
```

O segundo faz tudo: clona o repo, alinha e **levanta o cockpit**.

Depois confirma e diz os valores:
```powershell
$env:VAULT_PATH ; $env:MOO_PUBLICAR_BEACON
```
Vazio → define com `[Environment]::SetEnvironmentVariable(...,'User')`, **fecha e
reabre o PowerShell**, repete. É aqui que quase sempre falha, e o **sintoma é
silêncio, não erro**.

Prova de que este device entrou na frota:
```powershell
cd $HOME\paulo-vault ; git log --oneline -3 -- 50-fleet/ ; ls 50-fleet\
```
Tem de aparecer um beacon com o nome DESTE PC.

**Regras:** PowerShell (nunca `export` nem `~/`) · o vault fica em `main` · nunca
`git add -A` nem `push --force` · nunca `--play` · se falhar, **pára e reporta o
erro tal e qual**.

---

## 9 · O QUE ESTE HANDOFF NÃO SABE

- **Nada sobre o Windows.** Nunca publicou beacon. Não sei que versão tem, se tem
  repo, nem se o Ollama está lá.
- **Jetson (ARM):** `gpu-sampler` usa `nvidia-smi`, o Jetson usa `tegrastats` →
  GPU virá `n/d`. `qwen2.5-coder:14b` **não cabe**; usa `qwen2.5:3b`. Nunca testado.
- **Se as perguntas novas (#312) melhoraram a taxa de aceites.** Mediram-se 9
  rondas — não chega. **É a única prova que interessa e ainda não existe.**
