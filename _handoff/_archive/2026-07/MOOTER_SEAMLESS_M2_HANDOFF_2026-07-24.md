📥 **COLAR EM:** task Cowork **NOVA** (não numa existente) · modelo **Fable 5** · título `[T5]·mooter-seamless-m2·seam` · projeto Mooter.ai · pasta ligada `C:\Users\Paulo Loureiro\frugal`
⛔ **NÃO COLAR ANTES DE FAZER O PASSO 0** (abaixo). Sessão nascida antes do fix nasce cega e queima tokens à toa.

---

```yaml
type: MASTERPROMPT
id: MP-M2-SEAM-RETRY-2026-07-24
severity: high
wave: mooter-seamless-m2
generated_at: 2026-07-24T18:55Z
generated_by: Cowork/Opus 5 — sessão de triagem do bloqueio M2
tier_alvo: T5 (Fable — opt-in explícito do Paulo)
socio_pack: v1@manual (tier M)
supersede: M2_NATIVE_HANDOFF.md (2026-07-24) — premissa de ficheiro errada, ver §4
budget: ≤8k
```

# ⇄ MASTERPROMPT — retomar M2 com a costura nativa REPARADA

**DE:** Cowork/Opus 5 — sessão que recebeu o MP do M2 e **parou no passo 0** por ausência das tools.
**PARA:** Cowork/Fable 5 — sessão nova, nascida **depois** do fix do config + restart do Desktop.
**A ÚNICA COISA:** provar que `mooter_*` responde nativamente e fechar o M2 (auditoria read-only dos dois buses) com linhas novas no ledger.

## 1. SEVERIDADE E PORQUÊ (I-PASS: severity primeiro)

`high` — não é bug de código, é **a costura**: enquanto o Cowork não chamar `mooter_*` nativamente, todo o F1/F2 do roadmap fica dependente de Run-dialog manual, e o critério de saída nº1 do "produto perfeito" ("1 dia inteiro operado só do Cowork desktop, zero terminal") é inalcançável. Não há perda de dados nem risco de destruição: tudo abaixo é read-only ou reversível com backup.

## 2. ✅ PROVADO (com fonte, nada inferido)

| Fato | Evidência |
|---|---|
| Bridge v0.2 funciona E2E | ledger `~/.mooter/ledger.jsonl`, job `job-mrz8fzbc-2ec6`, wave `mooter-seamless-m1`, cc, `frugal-w2`: `dispatched 17:47:11.885Z → started 17:47:11.901Z → done 17:47:27.605Z (exit 0, $0.4825805, 16s) → collected 17:49:01.993Z`, `mp_hash 962755de…51b8d`. Copiado de `_handoff/ledger-tail.txt`. |
| Ledger tem **4 linhas, só m1** | mesmo ficheiro. **Zero linhas m2.** Nenhum job M2 chegou a existir. |
| `server-seamless.js` existe e é additivo | `packages/mooter-bridge/server-seamless.js` (2 670 B, 2026-07-24). Faz `require('./server.js')` + `require('./seamless.js')` e faz push do quarteto na `base.TOOLS`. `server.js` (12 508 B) intocado. |
| Entrada `mooter` foi escrita no config | `_handoff/apply-desktop-config.log`: backup `.bak-20260724-142821`, "Entrada 'mooter' adicionada", path `C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server-seamless.js`. |
| As tools `mooter_*` **NÃO existiam** na sessão de triagem | `ToolSearch` por nome exato + por keywords = 0 resultados. `RefreshMcpTools` nos 20 servers: nenhum `mooter`. 17 conectores visíveis (Ahrefs…Vercel + Microsoft 365 off) + `claude-code-remote`, `remote-devices`, `visualize`, `claude-in-chrome`. |
| O diagnóstico do Desktop **nunca correu** | `_handoff/dbg-mooter.ps1` existe (2 141 B) mas `dbg-mooter.log` **não existe** na pasta. |

## 3. 🔬 A DESCOBERTA — hipótese primária com evidência dura (BOM no config)

`apply-desktop-config-mooter.ps1` grava o config assim:

```powershell
$json | ConvertTo-Json -Depth 10 | Out-File $cfgPath -Encoding utf8
```

No **PowerShell 5.1**, `Out-File -Encoding utf8` emite **BOM `EF BB BF`**. O Claude Desktop é Electron/Node e faz `JSON.parse(readFileSync(cfg,'utf8'))` — e `JSON.parse` **rebenta** com BOM na posição 0 (`Unexpected token ﻿ in JSON at position 0`). Config inteiro descartado → `mooter` nunca arranca. Reiniciar o Desktop **não resolve**, o que explica porque a sessão nova continuou cega.

Prova de que este cmdlet emite BOM **nesta máquina** (primeiros bytes, `od -tx1`):

| Ficheiro | Escrito com | Primeiros bytes |
|---|---|---|
| `_handoff/ledger-tail.txt` | `Out-File -Encoding utf8` | `ef bb bf 7b 22 74` |
| `_handoff/m1-dispatch.log` | `Out-File -Encoding utf8` | `ef bb bf 3d 3d 3d` |
| `_handoff/precheck-seamless.log` | `Out-File -Encoding utf8` | `ef bb bf 3d 3d 3d` |
| `_handoff/SEAMLESS_ROADMAP_2026-07-24.md` (controlo) | git/device | `23 20 f0 9f` |

**3 de 3** com BOM. E o mais forte: `m1-dispatch.ps1` e `m1-collect.ps1`, escritos **no mesmo dia**, usam de propósito `New-Object System.Text.UTF8Encoding($false)` para o JSON que alimentam ao servidor — a armadilha já era conhecida no repo. O script do config foi o único que não a aplicou.

⚠️ **Limite honesto:** não consigo ler `%APPDATA%\Claude\` daqui (o `device_bash` é uma VM Linux e só a pasta `frugal` está montada). Logo isto é **inferência forte, não verificação direta**. O `fix-mooter-connector.ps1` (§5) decide com o **mesmo parser do Desktop** (`node JSON.parse`), antes e depois.

Hipóteses concorrentes, mantidas vivas:

| # | Hipótese | Como se refuta/confirma |
|---|---|---|
| H1 | Desktop nunca foi reiniciado desde 14:28 local | log do fix mostra logs MCP com timestamp; restart é passo obrigatório de qualquer forma |
| H2 | Config OK, mas `server-seamless.js` crasha no arranque | `--- 5. TESTE A FRIO ---` no log: se `tools/list` devolver 7 tools, o servidor está bom |
| **H3** | **BOM quebra o parse do config** | `NODE_JSON_PARSE=FAIL` na secção 1 = confirmado; `=OK` = refutado |
| H4 | Este Desktop (v1.24012.9) só carrega MCP por Extensions/`.mcpb`, ignorando o ficheiro | se pós-fix + restart as tools continuarem ausentes com `NODE_JSON_PARSE=OK` → **n/d, é isto que sobra**; caminho vira `.mcpb` (F3 antecipado) |

**Contra-indício que impede fechar H3 como certeza:** existe nesta sessão `mcp__remote-devices__Spotify__AppleScript___*`, ou seja **um** servidor MCP local É proxiado pela ponte. Se o config estivesse totalmente ilegível, ele não devia aparecer — a menos que venha de outra superfície (Extensions) e não do ficheiro. Não resolvi isto. **n/d.**

### 🧨 Regra operacional descoberta (corrige a memória)

A memória `project_mooter_seamless_f0` dizia *"cloud nunca vê MCP local / congela no nascimento"*. **Metade errado:** MCPs locais **são** proxiados, com o prefixo `mcp__remote-devices__{server}__{tool}` — logo o `mooter` apareceria como **`mcp__remote-devices__mooter__mooter_status`**, não como `mooter_status`. Procura **os dois nomes**. O que é verdade é o resto: **o conjunto congela no nascimento da sessão** → daí a ordem obrigatória fix → restart → só então abrir a sessão.

## 4. 🐛 SEGUNDO BUG — o alvo da auditoria M2 não existe

O MP original manda auditar `_handoff/agent-sync/dispatch-queue.json`. **Esse ficheiro não existe.** Conteúdo real de `_handoff/agent-sync/`:

| Ficheiro | Tamanho |
|---|---|
| `events.jsonl` | 68 207 B |
| `snapshot.json` | 20 986 B |
| `latest.md` | 8 238 B |
| `briefs/`, `prompts/` | dirs |

Se o dispatch tivesse passado, o CC queimava ~$0.35–0.48 a auditar um caminho fantasma e devolvia `n/d` ou, pior, inventava. **O bus B é `events.jsonl` + `snapshot.json`.** O MP corrigido está em §6. (Loophole nº3 do roadmap continua válido — só muda o nome do ficheiro.)

## 5. PASSO 0 — Paulo, ANTES de abrir a sessão (1 duplo-clique + restart)

Não é delegável a nenhuma sessão Cowork: `%APPDATA%` está fora das pastas montadas e nenhuma sessão consegue escrever lá.

1. Duplo-clique em `_handoff\RUN-FIX-MOOTER-CONNECTOR.bat`
   (faz backup `.bak-fixbom-*`, prova/refuta o BOM com `node JSON.parse`, grava sem BOM, reafirma a entrada `mooter`, testa o servidor a frio, copia os logs MCP do Desktop → escreve `_handoff\fix-mooter-connector.log` **sem BOM**).
2. **Fechar o Claude Desktop por completo**, tray incluída. Reabrir.
3. Só então abrir a task nova em **Fable 5** e colar este ficheiro.

## 6. PASSOS DA SESSÃO FABLE 5

**P1 · Costura (30 s).** `ToolSearch` por `mooter_dispatch` **e** por `mcp__remote-devices__mooter`. Ler `_handoff/fix-mooter-connector.log` (device tools) — ele traz o veredicto `NODE_JSON_PARSE` antes/depois, o `tools/list` a frio e os logs MCP. Registar qual das hipóteses H1–H4 o log fecha.

**P2 · Rota.** `mooter_route` com `"auditar consistência entre dois buses de eventos e propor unificação"`. Registar tier + confiança devolvidos.

**P3 · Dispatch (MP CORRIGIDO — usar este, não o do MP antigo).** `mooter_dispatch` · agent `cc` · worktree `C:\Users\Paulo Loureiro\frugal-w2` · wave `mooter-seamless-m2` · `allowedTools: "Read"` · masterprompt:

> ⇄ ROUTING / DE: Cowork M2 (Fable 5) / PARA: cc / WAVE: mooter-seamless-m2
> TAREFA (read-only): audita a divergência entre os dois buses do Mooter: **(a)** `C:\Users\Paulo Loureiro\.mooter\ledger.jsonl` — schema `{ts,job_id,wave,agent,worktree,event,mp_hash,exit_code,cost_usd,duration_s}`, eventos `dispatched|started|done|failed|collected`; **(b)** `_handoff/agent-sync/events.jsonl` + `_handoff/agent-sync/snapshot.json` + o escritor `tools/router/handoff-bus.js` neste repo (bus VS-W0 do semáforo). **`dispatch-queue.json` NÃO existe — se algum doc o mencionar, reporta como drift de documentação, não inventes o ficheiro.**
> ENTREGA NO TEXTO FINAL (≤600 palavras): tabela de campos equivalentes · gaps em cada direção · quem escreve o quê hoje · proposta de unificação com **escritor único** · o que se perde na migração.
> ❌ NÃO escrever/criar/alterar/apagar ficheiro nenhum. ❌ Sem git. Números só com fonte; não sabes = `n/d`.

**P4 · Ciclo.** `send_later(+3 min)` → ao acordar `mooter_status(job_id)` → `mooter_collect(job_id)`. Guardar `job_id`, `cost_usd`, `duration_s`, RTD e o **conteúdo** da auditoria.

**P5 · Codex (dado novo — nunca correu via daemon).** Repetir P3 com agent `codex` · worktree `C:\Users\Paulo Loureiro\frugal-integ` · mesma wave · MP análogo análise-only. Se falhar, o **erro exato é o entregável** — não tentar consertar o adapter nesta sessão.

**P6 · Relatório.** Escrever `_handoff/M2_NATIVE_SEAM_REPORT.md` (NOVO) com: costura ✅/❌ e **sob que nome** as tools apareceram · qual hipótese H1–H4 ficou provada, citando o `fix-mooter-connector.log` · `job_id`s + linhas novas do ledger copiadas · custos/RTD reais · o conteúdo das 2 auditorias · loopholes novos · veredicto. Atualizar a memória `project_mooter_seamless_f0` com 1 parágrafo M2. Fechar com **BOARD** (Paulo · Cowork · CC · Codex · Ledger × estado × próxima ação × ❌).

## 7. ⚡ SE-ENTÃO (contingências previstas)

- **Se as tools continuarem ausentes E o log disser `NODE_JSON_PARSE=OK` nos dois momentos** → H1/H3 refutadas. **PARA.** Não tentar por script (o objetivo é medir a costura, não contorná-la). Escrever o relatório com H4 como candidata e recomendar salto para `.mcpb` (F3 antecipado). Custo da sessão: ~$0.
- **Se as tools aparecerem só com o prefixo `mcp__remote-devices__mooter__*`** → é **sucesso**, não anomalia. Registar o nome real no relatório e no `SEAMLESS.md` (o MP antigo assumia `mooter_*` puro).
- **Se o `tools/list` a frio (secção 5 do log) devolver menos de 7 tools ou erro** → H2. O problema é `seamless.js`/`server.js`, não o config. Reportar o stderr exato e **não** editar `packages/*` (frozen fora de allowlist).
- **Se o dispatch der erro de guard/permissões** → registar o erro literal e parar; keys não rotadas, não relaxar guard nenhum.
- **Se o job ficar >5 min sem `done`** → `mooter_status` uma vez, registar, e reportar como "timeout path exercido" (loophole nº10 do roadmap ganha o seu primeiro caso real).
- **Falhou 2× a mesma coisa** → relatório com o que houver e PARA.

## 8. ❌ NÃO FAZER

- ❌ Contornar a ausência das tools com PowerShell/script — mata a medição, que é o produto desta wave.
- ❌ `git add -A`, push, merge, delete, rebase. Zero git nesta sessão.
- ❌ Escrever fora de `_handoff/`, da memória de projeto e de `~/.mooter/`.
- ❌ Tocar em `tools/router/classify.js` (frozen, sha `427d8c0b…364bc48f`) ou em `packages/*`.
- ❌ `--dangerously-skip-permissions` / `--yolo`.
- ❌ Jobs com escrita: keys **não rotadas** → só `allowedTools: "Read"`.
- ❌ Novos `.md` na raiz.
- ❌ Inventar número. Sem fonte = `n/d`.

## 9. DO-NOT SOBREVIVENTE (herda para o próximo consumidor)

Gate de keys/PAT em plaintext continua aberto (loophole nº8) → **todo job permanece read-only** até o Paulo rotar. Guard v0 é seam, não canónico (nº2) → não confiar nele como barreira de segurança. `cost_usd` só existe para o CC (nº7) → custo de codex/gemini é `n/d`, nunca estimado. Gemini CLI está morto (IneligibleTierError → Antigravity) → não incluir em waves.

## 10. ⇄ ACK OBRIGATÓRIO antes de trabalhar (≤5 linhas, nas TUAS palavras)

```
⇄ ACK · MP-M2-SEAM-RETRY-2026-07-24 · sessão <session-id>
ENTENDI: <a única coisa — não copiar o texto acima>
GUARDS QUE ME PRENDEM: <2-3>
NÃO FAREI: <o ❌ que mais te limita aqui>
```

Sem ACK, o dispatch não está confirmado. Parafrasear, não ecoar.

## 11. ARTEFACTOS QUE ACOMPANHAM ESTE HANDOFF

| Ficheiro | Papel |
|---|---|
| `_handoff/fix-mooter-connector.ps1` | diagnóstico decisivo + correção do BOM, idempotente, com backup |
| `_handoff/RUN-FIX-MOOTER-CONNECTOR.bat` | o duplo-clique do Passo 0 |
| `_handoff/fix-mooter-connector.log` | **produzido pelo passo 0** — é a fonte de verdade do P1 |
| `_handoff/dbg-mooter.ps1` | diagnóstico anterior, nunca corrido; o fix acima substitui-o |
| `packages/mooter-bridge/SEAMLESS.md` | doc técnico do daemon |
| `_handoff/SEAMLESS_ROADMAP_2026-07-24.md` | mapa F0→F4 e os 10 loopholes |
| `_handoff/M2_NATIVE_HANDOFF.md` | MP anterior — **superseded** por este (§4) |

## 12. CRITÉRIO DE ACEITE DESTA WAVE

Uma linha `event:"done"` no ledger com `wave:"mooter-seamless-m2"` **e** um `M2_NATIVE_SEAM_REPORT.md` que cite o `job_id` real e o veredicto `NODE_JSON_PARSE`. Sem essas duas coisas, M2 continua aberto — independentemente de quanto texto se produza. Custo alvo da sessão ≤ $3.

---

🤝 **SOCIO:** receita? na · despesa↓? **S** (elimina o degrau de paste/Run-dialog em toda wave futura) · risco↓? **S** (acha loopholes antes do dogfood; fix tem backup e é reversível) · reversível? **S** · escopo? **S**
📮 **DESTINO:** Paulo (Passo 0) → Cowork/Fable 5 sessão nova (P1–P6) → CC + Codex em `frugal-w2`/`frugal-integ` (jobs read-only)
