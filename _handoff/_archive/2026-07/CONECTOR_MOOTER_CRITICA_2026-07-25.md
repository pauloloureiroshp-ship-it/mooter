📥 **COLAR EM:** n/a — documento de saída. Destino real: `_handoff/CONECTOR_MOOTER_CRITICA_2026-07-25.md` no repo `frugal` (EXISTENTE, árvore principal). Os masterprompts do §7 são para colar em sessões CC novas, um por wave.

```yaml
type: CRITIQUE + PLAN
id: CONECTOR-CRITICA-2026-07-25
gerado_por: Cowork/Opus 5 — sessão de resgate M2, modo advogado do diabo
método: auditoria de código (subagente Explore) + 4 medições ao vivo no conector + 5 fontes web de hoje
veredicto: ⚠️ FUNCIONA end-to-end, mas o fosso está DESLIGADO e o painel MENTE
```

# 🐮 O conector Mooter não está perfeito — está a **um passo** de ser bom e a **três** de ser o produto

## 0. Resposta directa às 4 perguntas

| Queixa do Paulo | Causa raiz (código) | Veredicto |
|---|---|---|
| "não apareceu na lateral quem trabalhava por LLM" | o painel MCP Apps só renderiza quando uma tool com `_meta.ui.resourceUri` é chamada; nesta sessão o loop foi `dispatch → status → collect` e **nenhuma delas** repinta o painel enquanto o job corre. Não há `notifications/*` nenhuma (`sendNotification` = 0 ocorrências no pacote) | ❌ **defeito de arquitectura**, não de UI |
| "a resposta demorou" | 168 s reais. O job correu em **Opus** (default da subscrição) numa tarefa read-only de 600 palavras. O `mooter_route` recomendou `claude-opus-4-6` — e **esse valor nunca chega ao spawn** | ⚠️ **metade preço, metade tempo estavam na mesa** |
| "não tem logo da vaquinha nem qual LLM" | `manifest.json` do `.mcpb` **não tem `icon` nem `icons`**; o bundle não contém um único `.png`/`.svg`. O `fleet-ui.html` não tem `<svg>`/`<img>`/emoji — a identidade são 4 pontos de cor | ❌ **nunca foi implementado** |
| "o conector funciona end2end?" | Sim: `route → dispatch → spawn real → done exit 0 → collect` com $1.658/168 s medidos. **Mas 1 dos 2 agentes está morto e o modelo mostrado é falso** | 🟡 **6/10** |

---

## 1. 🔴 O achado mais grave: **o painel mostrou um modelo que não era o do job**

Medido ao vivo, 11:50Z, com duas chamadas ao próprio conector:

```
mooter_fleet → job-ms0aezxg-1c8f · model: "claude-opus-4-8" · session_id: "a00885ef"
mooter_session_read("a00885ef") → ageMs: 64 992 846  (≈ 18 HORAS)
                                   title: "Lê o ficheiro C:\...\.mooter\jobs\j…"
                                   costUsd: 0.5599   (o job real custou 1.658)
```

A sessão `a00885ef` é **o ensaio de ontem**. O job de hoje herdou o modelo dela só porque partilham o
`cwd` `frugal-w2`. O mecanismo é `attachModels()` (`fleet.js:103-112`): cruza `job.worktree` com
`session.cwd` e copia `s.model`, **sem comparar timestamps**.

> ⚠️ Isto viola o princípio fundador escrito no CLAUDE.md: *"never fabricating metrics"*.
> Pior que `n/d`: o painel está confiante e errado. E a "prova" registada na memória de ontem
> (`model:"claude-opus-4-8"`, sessão `a00885ef`) é **o mesmo artefacto** — validámos o painel com o bug.

**Fix (1 linha de condição):** só colar o modelo se `session.started_at` estiver dentro da janela
`[job.dispatched_at, job.ended_at]`. Fora disso → `null`. É melhor um `—` honesto que um Opus inventado.

## 2. 🔴 O fosso está desligado no caminho que importa

O produto é *"deterministic local-first router que roteia cada prompt para o tier mínimo viável"*.
No dispatch real, isso **não acontece**:

| Elo | Estado | Evidência |
|---|---|---|
| `classify.js` decide tier | ✅ funciona, $0, <50 ms | `{tier:T3, conf:0.75, recommended_model:"claude-opus-4-6"}` |
| esse modelo chega ao CLI | ❌ **não** | `grep -- "--model" packages/mooter-bridge/*.js` → **0 ocorrências**. `buildCommand(agent, jobDir, allowedTools)` — 3 argumentos, nenhum é modelo (`seamless.js:119-137`) |
| o cliente pode forçar | ❌ **não** | `inputSchema` de `mooter_dispatch` não tem `model` e é `additionalProperties:false` (`seamless.js:319-325`) |
| T0 / GPU local | ❌ **não despachável** | `tierToAgent = {T0:'moo', T1:'cc', T2:'cc', T3:'cc'}` + `routing_note: "T0/moo não é dispatchável na v0"`. O enum de agentes é `cc|codex|gemini` — **`moo` não existe** |
| prova viva | recomendou `opus-4-6`, correu `opus-4-8` | os dois valores discordam no mesmo job |

`claude -p` aceita `--model` com alias (`sonnet`, `opus`) — documentado. Não é uma limitação técnica:
**é uma linha que nunca foi escrita.**

**Custo disso, com a tabela de preços do próprio repo** (`host-extra.js:457-462`, marcada *advisory*):
opus `[5,25]` · sonnet `[3,15]` · haiku `[1,5]` por 1M tokens. Para o mesmo perfil de tokens, o job de
$1.658 sairia ≈ **0,6× em Sonnet** e ≈ **0,2× em Haiku**. Não medi o split in/out — é aritmética sobre
preços advisory, não medição. Mas a ordem de grandeza é a tese inteira do produto a não acontecer.

⚠️ E a GPU está lá, parada: `qwen2.5:3b` residente, 2,16 GB VRAM, `local_available:true`. Zero jobs.

## 3. 🔴 O agente Codex está morto — e a doutrina "multi-vendor" morre com ele

`codex exec` pendura em stdin. **É bug conhecido a montante**, com 5 issues públicas
(openai/codex #27019, #20919; codex-mcp-server #153; gstack #971, #1034) e workaround unânime:
`< /dev/null`. O `cc` só escapa porque tem timeout interno de 3 s.

No nosso código: `spawn()` sem `stdio`, logo default `['pipe','pipe','pipe']`, e **nunca**
`child.stdin.end()` (`seamless.js:144-152`). O filho herda um stdin que nunca vê EOF.

**Agravante que ninguém tinha visto:** no Windows o spawn é `shell:true`, portanto o filho directo é o
`cmd.exe`. O `child.kill('SIGKILL')` do watchdog (`seamless.js:226`) mata a **shell**, não o neto
`codex.exe`. O ledger escreve `failed` e o processo real continua vivo. Órfão silencioso.

## 4. 🟡 O watchdog existe — e é pior do que não existir

Correcção ao meu próprio relatório de há 20 minutos (loophole 15 dizia "não há timeout"): **há**,
`MOOTER_JOB_TIMEOUT_MS` = 30 min (`seamless.js:45`, `225-229`). O problema é outro e é maior:

1. O timer vive **só na memória do processo do conector** (`REGISTRY`, `seamless.js:157`). Cada restart do
   Claude Desktop mata o timer → o job fica `started` **para sempre** no ledger.
2. Esse `started` eterno é lido pelo WIP guard (`activeJobsByWorktree`, `seamless.js:70-80`, `109`) →
   **a worktree fica bloqueada permanentemente**.
3. **Não existe `mooter_cancel` nem `mooter_kill`** nas 9 tools. Não há saída pelo protocolo.
4. `mooter_status` devolve `alive:false` (registry) enquanto o ledger diz `started`. Dois campos
   contraditórios, sem terceiro estado `stale`.

Não há sweeper que releia o ledger no arranque e feche órfãos. **30 minutos de conector aberto é a única
janela em que o watchdog funciona.**

## 5. ⚠️ Progress notifications **não** são a solução — e é por isso que a arquitectura actual salva-se

Instinto óbvio: "emite `notifications/progress` e o Cowork mostra o job a andar". **Não funcionaria hoje.**

Issue **anthropics/claude-code#58687** (aberto 13/05/2026, labels `area:cowork` + `area:mcp` + `bug` +
`has repro`, ainda **Open**): o cliente MCP do Cowork **não envia `_meta.progressToken`** no `tools/call`
e não passa `onprogress`/`resetTimeoutOnProgress` ao SDK. Trace capturado no issue:

```
{"method":"tools/call","params":{"name":"<tool>","arguments":{…}},"id":2}
   ^^^ params._meta is ABSENT. No progressToken supplied.
{"method":"notifications/cancelled","params":{"requestId":2,"reason":"MCP error -32001: Request timed out"}}
```

Pior: quando o resultado chega depois do timeout, **o host descarta-o em silêncio**.

✅ **Consequência que joga a nosso favor:** o padrão `dispatch devolve job_id em <1 s + painel polla de 3 s`
é, por acidente, **a decisão de arquitectura correcta** para este host. Não mexer nisso. O erro não é o
polling — é o painel não se repintar durante o job e o modelo mostrado ser falso.

## 6. 🔵 O que o estado da arte diz (fontes de hoje, 2026-07-25)

O **RC da spec MCP `2026-07-28`** — final daqui a **3 dias** — traz exactamente o nosso caso de uso:

| Novidade | O que resolve para o Mooter |
|---|---|
| **Tasks extension** (SEP-2663) | `tools/call` devolve um **task handle**; o cliente dirige com `tasks/get` / `tasks/update` / **`tasks/cancel`**. É o `mooter_dispatch` + `mooter_status` + o `mooter_cancel` que falta — **padronizados**. Criação é *server-directed*: o servidor decide o que corre como task |
| **MCP Apps vira extensão oficial** (SEP-1865) | o painel deixa de ser aposta; templates declarados à cabeça, prefetch e security-review pelo host |
| **Sampling e Logging deprecados** | não construir nada sobre eles. Logging → `stderr` + OpenTelemetry (o `mooter-mcp-boot.log` já vai nessa direcção) |
| **JSON Schema 2020-12 completo** | `inputSchema` pode ter `oneOf`/condicionais → um schema de dispatch que **exige** `model` quando `agent=cc` |
| Extensions negociadas por capability | dá para adoptar Tasks **sem** partir o que existe |

⚠️ Nuance honesta: o RC é **breaking** e o Cowork negocia `2025-11-25`. Adoptar Tasks **hoje** seria
apostar num host que ainda não fala a versão. **Recomendação: desenhar as tools no formato Tasks agora
(nomes e lifecycle), implementar sobre o transporte actual, migrar quando o host negociar.**

---

## 7. 🔥 O plano — por alavancagem, não por dificuldade

### W1 · HONESTIDADE (1-2 h) — *nada de novo, só parar de mentir*
1. `attachModels` só cola modelo se a sessão estiver **dentro da janela temporal** do job; senão `null`.
2. `mooter_status` ganha estado **`stale`** (ledger diz `started`, registry não conhece).
3. **Sweeper no boot**: ao arrancar, reler o ledger e escrever `failed{exit_code:'orphaned-by-restart'}`
   em todo o `started` sem processo. Desbloqueia worktrees sozinho.
4. Nova tool **`mooter_cancel(job_id)`** — com `taskkill /T /F` no Windows (mata a árvore, não a shell).
**Gate:** `job-ms0afc3y-aae0` (pendurado agora) fecha sozinho e a `frugal-integ` volta a aceitar dispatch.

### W2 · O FOSSO LIGADO (2-3 h) — *a wave que devolve o produto ao produto*
1. `buildCommand(agent, jobDir, allowedTools, **model**)` → `claude -p … --model <alias>`.
2. `mooter_dispatch` ganha `model?: string` e, quando ausente, **chama o `classify.js` sozinho** e usa o
   `recommended_model`. Roteamento passa a ser **default**, não sugestão.
3. `< NUL` / `stdio:['ignore','pipe','pipe']` no spawn → **Codex ressuscita**.
4. Ledger passa a gravar `model_recommended` **e** `model_used` — a divergência vira métrica, não bug.
**Gate:** repetir *exactamente* o job de hoje em Sonnet e comparar $ e s contra `$1.658 / 168 s`.
**Isso é o primeiro recibo real de poupança do Mooter — medido, não contrafactual.**

### W3 · A VACA APARECE (1 h) — *o que ele viu falhar*
1. `icon` + `icons[]` no `manifest.json` (a vaca) — o `.mcpb` não tem **um único asset gráfico**.
2. Logo + `serverInfo.title:"Mooter"` no `initialize` (hoje `serverInfo.name` é `mooter-bridge` e
   diverge do `display_name` `Mooter`).
3. `mooter_dispatch`, `mooter_status` e `mooter_collect` passam a declarar `_meta.ui.resourceUri` →
   **o painel repinta-se a cada passo do loop**, sem depender de notificações.
4. Cabeçalho do painel: 🐮 + agente + **modelo real** + tier decidido + custo acumulado da wave.

### W4 · O VIBE CODER NÃO PENSA (3-4 h) — *a tese, finalmente*
Hoje o conector é um **observador**. Para o vibe coder que não quer estudar o estado da arte, tem de ser
um **piloto**. Falta a tool que ninguém escreveu:

```
mooter_work(objetivo) →
  classify → escolhe tier E agente → escolhe worktree livre → injecta o
  protocolo de handoff (AGENTS.md) no MP → dispatch → devolve UI a andar →
  ao fim: diff + recibo ($ real vs baseline) + "aceitar / refazer noutro tier"
```

Nove tools que exigem saber o que é worktree, wave, tier e allowedTools **não** servem o vibe coder —
servem-te a ti. `mooter_work` é a mesma máquina com **uma** porta.

---

## 8. ❌ O que NÃO fazer (e porquê)

| ❌ | Razão |
|---|---|
| implementar `notifications/progress` | o host não manda `progressToken` — issue #58687 aberto. Trabalho morto |
| migrar já para a spec `2026-07-28` | breaking, e o Cowork negocia `2025-11-25`. Desenhar no formato, implementar depois |
| construir sobre Sampling ou Logging | **deprecados** no RC de 28/07 |
| mais gráfico no painel | o problema não é falta de dados bonitos, é um número **errado** e o painel não repintar |
| tocar em `classify.js` | FROZEN, sha `427d8c0b…364bc48f`. **Nada em W1-W4 precisa de o alterar** |
| versionar o bundle como está | ⚠️ **`fleet.js`, `fleet-ui.html`, `server-apps.js` e `manifest.json` NÃO estão em git.** O que corre no Cowork (v1.1) diverge do repo (v0.4). Os testes do repo **não cobrem o código que corre.** Isto é dívida P0 — resolver antes de W2 |

## 9. BOARD

| Item | Estado | Próxima acção |
|---|---|---|
| Conector end-to-end | 🟡 **funciona** — 6/10 | W1 |
| Modelo no painel | 🔴 **mostra valor falso** (prova §1) | W1.1 — 1 condição |
| Router → spawn | 🔴 **desligado** | W2 — o fosso |
| Codex | 🔴 morto por bug upstream conhecido | W2.3 — `< NUL` |
| Job pendurado `job-ms0afc3y-aae0` | ⚠️ 20+ min, bloqueia `frugal-integ` | 🔥 Paulo: `taskkill` nativo |
| Bundle vs repo | 🔴 **v1.1 não versionado** | commit antes de W2 |
| GPU local | 🟡 residente, **0 jobs** | W2 + adapter `moo` (F1) |
| Vaca | ❌ não existe no bundle | W3 |
| Spec 2026-07-28 | 🔵 final em **3 dias** | desenhar no formato Tasks |

🤝 **SOCIO:** receita? na · despesa↓? **S** (W2 é a única wave do roadmap que produz um recibo de poupança
**medido** — hoje o `savedUsd` é contrafactual contra all-Opus e chegou a dar **negativo**: `-0.359` na
sessão que medi) · risco↓? **S** (W1 fecha um bloqueio permanente de worktree que ninguém sabia existir) ·
reversível? **S** · escopo? **S** — nada aqui toca `classify.js` nem `packages/*` frozen.

📮 **DESTINO:** Paulo (matar o órfão + escolher a ordem W1→W4) → sessões CC, **uma wave por sessão**
