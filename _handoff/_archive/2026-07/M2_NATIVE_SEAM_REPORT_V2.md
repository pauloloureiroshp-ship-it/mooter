📥 **COLAR EM:** n/a — este ficheiro é o relatório de saída. Destino real: `_handoff/M2_NATIVE_SEAM_REPORT_V2.md` no repo `frugal` (EXISTENTE, árvore principal).

```yaml
type: REPORT
id: M2-NATIVE-SEAM-V2-2026-07-25
wave: mooter-seamless-m2
gerado_por: Cowork/Opus 5 — sessão de resgate 2026-07-25
supersede: M2_NATIVE_SEAM_REPORT.md (2026-07-24, veredicto costura ❌)
consome: MOOTER_SEAMLESS_M2_HANDOFF_2026-07-24.md §6 (P1→P6)
estado_da_wave: FECHADA no critério de aceite · 1 achado novo aberto (adapter codex)
custo_da_sessao: $1.658068 (1 job real; o 2º não produziu tokens)
```

# ⇄ M2 — COSTURA NATIVA ACESA E WAVE CORRIDA

**VEREDICTO: costura ✅.** As tools `mooter_*` estão presentes e funcionais nesta sessão Cowork,
sob o nome **`mcp__Mooter__*`** (9 tools) — *não* `mcp__remote-devices__mooter__*`, *não* `mooter_*` puro.
O caminho que funcionou foi o **`.mcpb` instalado por Connectors (M3)**, não o `claude_desktop_config.json`.
**H4 do relatório v1 fica CONFIRMADA por via positiva:** o ficheiro nunca era a superfície; a superfície é a UI.

**Critério de aceite da wave: CUMPRIDO.** Linha `event:"done"` com `wave:"mooter-seamless-m2"` no ledger,
job real citado abaixo.

---

## 1. P1 · Costura — sondas desta sessão

| Sonda | Resultado |
|---|---|
| Tools `mcp__Mooter__*` disponíveis | ✅ 9 (`fleet, route, dispatch, status, collect, run, session_bind, session_read, sessions_list`) |
| `mooter_fleet` ao vivo | ✅ `ok:true` · bind de **2026-07-24T20:51:26Z** · nota `"M3 — costura nativa acesa; primeira chamada real ao conector"` |
| GPU local via Ollama | ✅ `127.0.0.1:11434` · `qwen2.5:3b` (3.1B, Q4_K_M, 2.16 GB VRAM) residente |
| `mooter_status(wave: mooter-seamless-m2)` **antes** da corrida | ❌ `"nada no ledger"` — wave estava a zero |

⚠️ Nota de honestidade: o `fix-mooter-connector.log` **não foi relido** nesta sessão — o veredicto
`NODE_JSON_PARSE` está citado no relatório v1 §3 e não foi re-verificado. A costura acendeu por outra
via (`.mcpb`), o que torna a questão do BOM historicamente interessante mas operacionalmente morta.

## 2. P2 · Rota (classify.js FROZEN, $0, determinístico)

Input: `"auditar consistência entre dois buses de eventos e propor unificação"`

```json
{"agent":"cc","tier":"T3","confidence":0.75,
 "rationale":"high-risk signals: 1, multiFile: false",
 "recommended_model":"claude-opus-4-6"}
```

`routing_note` devolvido: *"codex/gemini são escolha de doutrina de wave, não do classifier. T0/moo não é
dispatchável na v0."*

## 3. P3–P4 · Job CC — ✅ done

| Campo | Valor |
|---|---|
| `job_id` | `job-ms0aezxg-1c8f` |
| agent / worktree | `cc` · `C:\Users\Paulo Loureiro\frugal-w2` |
| `allowedTools` | `Read` (keys por rotar — sem escrita) |
| `mp_hash` | `5c30d605ce8b069764ec44c30f6ea619a086754007b813122cbab025e9841d39` |
| eventos | `dispatched` 11:30:11.429Z → `started` 11:30:11.442Z → `done` 11:32:59.105Z |
| `exit_code` | `0` |
| `cost_usd` | **`1.658068`** |
| `duration_s` | **`168`** |
| `session_id` | `fe11d2a3-3430-4b3d-9708-3eadf62fd8a0` |
| coleta | `"primeira coleta"` · `truncated:false` |

**RTD (round-trip do dispatcher):** dispatch→done = 168 s; o `mooter_dispatch` devolveu `job_id` em <1 s
(não bloqueia, como documentado).

## 4. P5 · Job Codex — ❌ BLOQUEADO (o erro É o entregável)

| Campo | Valor |
|---|---|
| `job_id` | `job-ms0afc3y-aae0` |
| agent / worktree | `codex` · `C:\Users\Paulo Loureiro\frugal-integ` |
| `mp_hash` | `28db9f2b3df458d0a386614f68af0427e0f201c9ccd2a95474b8c5fd6fcd7b29` |
| eventos | `dispatched` 11:30:27.215Z → `started` 11:30:27.223Z → **nada mais** |
| estado após ~8 min | `last:"started"` · `alive:true` · **sem `done`, sem `failed`** |
| `stderr_tail` | **`"Reading additional input from stdin..."`** |

**Causa provável, com prova por contraste no mesmo minuto:**

| Agente | stderr | Consequência |
|---|---|---|
| `cc` | `"Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null…"` | **prossegue** após 3 s → done |
| `codex` | `"Reading additional input from stdin..."` | **espera para sempre** → pendurado |

O dispatcher não fecha stdin no spawn. O CLI do Claude tem timeout de 3 s e desiste; o `codex exec` não tem
e fica à espera de EOF que nunca chega. **Não corrigido nesta sessão** — o handoff mandava não consertar o
adapter aqui, e `packages/*` está frozen fora de allowlist. Fix candidato de uma linha: redirecionar
`stdin` de `/dev/null` (ou `NUL` em Windows) no spawn do adapter codex.

⚠️ **Processo ainda vivo** — o job `job-ms0afc3y-aae0` continua `alive:true`. Matá-lo é gate humano nativo.

**Codex continua sendo o dado que falta:** nunca correu via daemon, e agora sabe-se **porquê**.

## 5. Conteúdo da auditoria CC (o produto do job)

O CC devolveu 3 correcções de premissa e a auditoria pedida. Resumo fiel:

### 5.1 Drift encontrado (corrige o próprio masterprompt)

1. **`tools/router/handoff-bus.js` NÃO é o escritor do bus (b).** Escreve `~/.mooter/run/<id>/state.md`
   (working-state destilado: Goal/Decisions/State/Open/Artifacts, cap 4 KB) + `arbitrate()` para pinar
   provider. **Nunca toca em `_handoff/agent-sync/`.** É um **terceiro bus**, ortogonal aos dois em análise.
2. **`dispatch-queue.json`**: `grep` no repo = 0 ocorrências. Confirmado inexistente **e** nenhum doc o
   menciona → sem drift de documentação nesse nome.
3. **Nenhum dos dois escritores está versionado neste repo.**

### 5.2 Campos equivalentes

| Conceito | (a) `.mooter/ledger.jsonl` | (b) `_handoff/agent-sync` (`agent-sync-ledger.v2`) |
|---|---|---|
| timestamp | `ts` | `ts` |
| id da unidade | `job_id` | `id` (evento) / `session_id` |
| wave | `wave` | `wave` (null nos eventos observados) |
| agente | `agent` (cc/codex) | `agent` (claude-code) |
| worktree/repo | `worktree` | `repo_root` (só no snapshot) |
| ciclo de vida | `event` (dispatched…collected) | `status` + `kind` (done/turn) |
| identidade do prompt | `mp_hash` | n/d (`session_title` traz o prompt cru, sem hash) |
| resultado | `exit_code` | `status` |
| custo | `cost_usd` | n/d |
| duração | `duration_s` | n/d |
| semântica/integridade | n/d | `provider`, `model`, `execution_channel`, `classify.sha256`, `summary`, `next`, `decisions`, `acceptance`, `guard`, `brief`, `target_agents` |

### 5.3 Gaps

- **(a) sabe, (b) não:** `mp_hash`, `exit_code`, `cost_usd`, `duration_s`, transições
  `dispatched`/`collected`, correlação `job_id` entre agentes na mesma wave.
- **(b) sabe, (a) não:** `provider/model/execution_channel`, integridade do `classify.js` (sha), payload
  semântico (o *que* aconteceu), ligação de sessão e factos git.

### 5.4 Quem escreve o quê hoje

| Bus | Escritor | Onde vive |
|---|---|---|
| (a) `.mooter/ledger.jsonl` | dispatcher do Cowork M2 | home `.mooter/`, **externo ao repo** → escritor versionado = `n/d` |
| (b) `_handoff/agent-sync/*` | **Stop hook** (`source:"claude-code-hook"`) | `~/.claude/hooks/`, **não versionado aqui**; emite `events.jsonl` + `snapshot.json` + `latest.md` em conjunto |
| (c) `~/.mooter/run/<id>/state.md` | `tools/router/handoff-bus.js` → `writeState()` | **este** repo — bus distinto, fora do escopo |

### 5.5 Proposta de unificação — escritor único

Os buses são **ortogonais**: (a) = ciclo de orquestração (dispatch→collect, custo, exit);
(b) = ledger semântico do turn + integridade. Só se cruzam por `agent` + `ts`.

Promover o **hook de (b) a único emissor** de um `agent-sync-ledger.v3`, com um bloco
`lifecycle:{event,exit_code,cost_usd,duration_s,mp_hash,job_id}` fundido em cada evento.
**Chave de correlação dupla:** `job_id` (de a) + `session_id` (de b), ambos carregados.
O hook já corre por-turn de forma determinística, com model/tokens/sha — é o candidato natural.
`handoff-bus.js` fica **de fora** (contrato "distilled, not dumped").

### 5.6 O que se perde na migração

- **`mp_hash`:** (b) guarda o prompt cru (`session_title`) mas sem hash → sem adicionar hash, quebra a
  idempotência/dedup que (a) faz por `mp_hash`.
- **`cost_usd` / `duration_s`:** o hook vê tokens-por-turn, não custo-por-job → ficam `n/d` até o
  dispatcher os injectar.
- **`dispatched` / `collected`:** transições que só o dispatcher observa (o hook só vê o turn que fecha).
  → A unificação exige que o dispatcher **continue** a alimentar o lifecycle; **não** é corte seco.

## 6. Loopholes novos (juntam-se aos 11–13 do v1)

| nº | Loophole |
|---|---|
| 14 | **Adapter `codex` pendura em stdin.** Sem `< /dev/null` no spawn, `codex exec` espera EOF indefinidamente. O `cc` sobrevive só porque tem timeout interno de 3 s. Nenhum `failed` é emitido — o job fica `started` para sempre e envenena a leitura de "worktree ocupado". |
| 15 | **Não há timeout no dispatcher.** Nada mata um job pendurado nem escreve `failed` por watchdog. O ledger passa a mentir por omissão: `alive:true` eterno ≠ a trabalhar. |
| 16 | **O MP do próprio handoff continha um facto errado** (`handoff-bus.js` como escritor do bus b) e o job gastou raciocínio a corrigi-lo. Masterprompts deviam citar a fonte de cada afirmação estrutural, ou marcá-la `a-verificar`. |
| 17 | **`wave` chega `null` nos eventos do bus (b)** — a chave que mais interessa para cruzar os dois buses é justamente a que (b) não preenche. |

## 7. BOARD

| Ator | Estado | Próxima ação |
|---|---|---|
| **Costura M2/M3** | ✅ **acesa** — `mcp__Mooter__*`, 9 tools, via `.mcpb`/Connectors | fixar em `SEAMLESS.md`: a superfície é a **UI**, não o config-file |
| **Ledger** | ✅ **5 linhas**, wave `mooter-seamless-m2` viva (era 0) | — |
| **CC** | ✅ job done, exit 0, $1.658, 168 s | nenhuma ação |
| **Codex** | ⚠️ **pendurado** há >8 min em stdin, `alive:true` | 🔥 **Paulo:** matar o processo nativo · fix de 1 linha (`stdin: NUL`) numa wave própria |
| **Paulo** | 🔜 3 gates | (1) matar job codex · (2) aprovar fix stdin · (3) decidir sobre o ledger v3 unificado |
| **SYNC.md** | ⚠️ **parado em 2026-07-13** — não conhece M1/M2/M3 | 🔜 actualizar (não feito aqui: escrita em ficheiro canónico é gate) |
| **Bus unificado** | 🟡 proposta escrita, não decidida | decisão do Paulo antes de qualquer código |

❌ **Não fazer:** consertar o adapter codex fora de uma wave própria · tocar em `packages/*` ou
`classify.js` (sha `427d8c0b…364bc48f`) · job com escrita enquanto as keys não forem rotadas ·
`git add -A`/push/merge · inventar `cost_usd` para o job codex (é `n/d` — nunca chegou a `done`).

---

🤝 **SOCIO:** receita? na · despesa↓? **S** ($1.66 fechou uma wave aberta há 1 dia **e** achou o bug que
travava o Codex — o job codex custou $0 porque nunca arrancou) · risco↓? **S** (o loophole 15 explica
por que "worktree ocupado" pode bloquear waves futuras sem sinal) · reversível? **S** (jobs read-only,
escrita só em `_handoff/`) · escopo? **S**

📮 **DESTINO:** Paulo (3 gates do BOARD) → wave própria para o fix `stdin` do adapter codex
