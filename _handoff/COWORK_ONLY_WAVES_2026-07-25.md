📥 **COLAR EM:** os masterprompts do §6 vão, **um por sessão**, numa **task nova do Cowork** (não no VS Code, não no CC nativo). Este ficheiro vive em `_handoff/COWORK_ONLY_WAVES_2026-07-25.md` no repo `frugal` (EXISTENTE, árvore principal).

```yaml
type: AUDIT + PLAN
id: COWORK-ONLY-WAVES-2026-07-25
método: 3 medições ao vivo no conector + spec MCP Apps 2026-01-26 (lida integralmente) + 4 fontes web de hoje
veredicto_estratégia: 🟡 VIÁVEL com 3 exceções nomeadas — não é "sem VS Code", é "sem VS Code para 90%"
```

# 🐮 As 9 lacunas, auditadas — e o que o Cowork **deixa mesmo** fazer

## 1. Medições ao vivo (não inferidas)

`mooter_sessions_list` (11:58Z) devolveu 6 sessões. Três factos que mudam o plano:

| Facto medido | Número | Porque importa |
|---|---|---|
| Sessões em `claude-opus-4-8` | **6 de 6 (100 %)** | Zero Sonnet, zero Haiku, **zero local**. A escada de tiers não acontece em lado nenhum |
| `savedUsd` **negativo** | **6 de 6** (−0,15 · −0,36 · **−2,86** · −4,45 · −7,13 · **−9,53**) | O baseline é *all-Opus 4.8* e tudo corre em Opus 4.8 → a fórmula é **estruturalmente incapaz** de dar positivo. O produto que vende poupança mostra prejuízo em 100 % das amostras |
| Dois custos para o mesmo job | CLI: **$1,658** · cockpit: **$4,094** | `total_cost_usd` do `claude -p` vs `costFor()` com tabela advisory (`host-extra.js:457`). **Divergência de 2,5×** — e ninguém sabe qual é o verdadeiro |

E o achado que fecha o caso do modelo falso:

```
mooter_collect(job-ms0aezxg-1c8f) → session_id: "fe11d2a3-3430-…"   ← o CERTO, o conector JÁ o tem
mooter_fleet()                    → session_id: "a00885ef"          ← o ERRADO, adivinhado por cwd
mooter_sessions_list()            → fe11d2a3: 35 turns · 104 981 in · 28 311 out · $4,09 · needs_you
                                    a00885ef:  3 turns ·  38 340 in ·    356 out · $0,56 · 18 h de idade
```

⚠️ O `mooter_collect` **devolve o `session_id` correcto**. O `attachModels()` ignora-o e adivinha pelo `cwd`.
Não falta dado — **falta ligar dois campos que já existem**. É meia linha, não uma wave.

⚠️ Bónus: a sessão do job headless aparece como **`needs_you`**. Um job `claude -p` não pode precisar de ti.

## 2. As 9 lacunas × é possível dentro do Cowork?

| # | Lacuna do Paulo | Possível? | Como, exactamente |
|---|---|---|---|
| 1 | ver o trabalho na thread | ✅ **já** | painel MCP Apps a 3 s |
| 2 | **qual LLM por task + evolução** | ✅ **fácil** | `mooter_collect` já traz `session_id`; parar de adivinhar por `cwd`. Melhor ainda: `--output-format stream-json` traz o modelo **no evento `system` de init do próprio job** |
| 3 | **tokens em tempo real por LLM** | ✅ **fácil** | `claude -p --output-format stream-json --verbose --include-partial-messages` emite NDJSON com `usage` a cada evento. O conector já faz `stdout.pipe(outStream)` — basta **ler o tail** do `out.log` em vez de esperar o fim. Para os moos: Ollama devolve `prompt_eval_count`/`eval_count`/`eval_duration` (ns) → tokens **e** tok/s reais |
| 4 | **que task está a correr, em texto** | ✅ **fácil** | mesmo stream: o último `tool_use` / bloco de texto do assistant = "a ler `fleet.js`", "a correr `npm test`". Hoje o `title` é só o começo do prompt cru |
| 5 | **moos locais em handoff perfeito** | ❌ **não se aplica hoje** | `tierToAgent = {T0:'moo',…}` mas o enum de `mooter_dispatch` é `cc\|codex\|gemini` — **`moo` não é despachável**. Não há handoff imperfeito: **não há handoff nenhum.** Precisa do adapter, não de UI |
| 6 | **logo da vaquinha** | ✅ **fácil** | 2 sítios: `icon` no `manifest.json` do `.mcpb` (hoje **ausente**, bundle sem 1 asset) e **SVG inline** no painel. ⚠️ A CSP default do MCP Apps é `img-src 'self' data:` → **SVG inline/data-URI funciona, URL externo não** |
| 7 | **algo estruturado na thread** | ✅ **já quase** | o painel tem wave→jobs→GPU. Falta: repintar durante o loop (só `mooter_fleet` declara `_meta.ui.resourceUri`; `dispatch`/`status`/`collect` **não**) |
| 8 | **certeza de que CC/codex/local seguem a metodologia** | 🔴 **hoje: NÃO seguem** | 100 % Opus medido · `--model` nunca passado (`grep` = 0) · Codex pendurado em stdin · `moo` não despachável. **Esta é a lacuna real; as outras 8 são sintomas** |
| 9 | **registo no vault com logo do Obsidian** | ✅ **possível** | o servidor é Node local, escreve onde quiser. ⚠️ O caminho do vault no Windows é `n/d` (memória diz `~/paulo-vault`, as sessões medidas dizem `C:\Users\Paulo Loureiro\Documents\paulo-vault`) → **detectar, nunca assumir** |

## 3. O que a spec MCP Apps **autoriza** (li a `2026-01-26` inteira — status *Stable*)

Três capacidades que o painel **não usa** e que mudam o produto:

| Método | O que permite | Uso no Mooter |
|---|---|---|
| **`ui/message`** | a View injecta uma mensagem na conversa **como se o Paulo a tivesse escrito** — dispara um turno do modelo | botão **"❌ matar job"**, **"🔁 refazer em Sonnet"**, **"✅ aceitar diff"** direto no painel. Consentimento: "Host **MAY** request user consent" |
| **`ui/update-model-context`** | a View empurra contexto para os **turnos futuros** do modelo, **sem** disparar resposta e **sem** gastar tool call | o painel mantém-**me** informado do estado da frota. Hoje eu tenho de chamar `mooter_fleet` e queimar contexto para saber o que já está no ecrã dele |
| **`visibility: ["app"]`** em `_meta.ui` | tool **invisível ao modelo**, chamável só pelo painel | `mooter_tick` para o polling de 3 s deixar de poluir a lista de tools do agente |
| `ui/request-display-mode: "pip"` | painel flutuante persistente | cockpit sempre visível durante a wave |
| `hostContext.styles.variables` | ~80 tokens CSS do Claude + `theme:"light"\|"dark"` | o painel deixa de ter cores hard-coded (`#c15f3c` etc.) e passa a parecer nativo |

⚠️ **Limites reais, para não prometer o impossível:**
- **Não existe push servidor→painel** enquanto nenhuma tool corre (`n/d` na spec). O polling **é** a arquitectura correcta.
- **Não existe persistência de estado** do widget entre turnos — foi **deferido** ("State persistence and restoration" está em *Future Considerations*). O painel tem de reidratar do ledger sempre. Já faz.
- **Ícones não existem na spec do MCP Apps** (`n/d`) — a vaca entra pelo `manifest.json` do MCPB e por SVG inline.
- **CSP default:** `connect-src 'none'` → o painel **não pode** falar com o Ollama directamente; tem de passar pelo servidor. Já passa.

## 4. 🧨 Advogado do diabo: "tudo no Cowork sem VS Code" — **boa ideia, com 3 buracos nomeados**

**✅ Porque é melhor do que parece.** O conector inverteu a limitação histórica: o `device_bash` só lê e o mount serve conteúdo *stale* (a tua própria memória, 07-16, com um clobber real como prova), mas o **`mooter_dispatch` corre `claude -p` no host verdadeiro**. Os jobs **escrevem no disco real**, sem passar pelo mount. Prova de hoje: o job leu ficheiros que o meu mount não expõe (`~/.mooter/ledger.jsonl`) e correu em `frugal-w2`. **O Cowork vira a cabine; o CC headless vira as mãos.** Isto é exactamente a tese "cabine = produto, motor = fosso" — só que agora a cabine não é o VS Code, é a thread.

**❌ Onde quebra — e não adianta fingir:**

| Buraco | Porquê | Mitigação honesta |
|---|---|---|
| **Git irreversível** | push/merge/rebase/delete continuam gate humano por doutrina tua, e o mount não é fonte de verdade para o HEAD | manter nativo. **Não automatizar.** Um `mooter_git_status` read-only resolve 80 % da ansiedade sem tocar no gate |
| **Ver o resultado com os olhos** | não há F5, não há Live Preview, não há screenshot do app a correr | o job pode correr testes e devolver o output; **UI visual continua a precisar da máquina**. Não mentir sobre isto |
| **Sessão interactiva** | `claude -p` é one-shot: não dá para "espera, muda isso" a meio | é *feature*, não bug — força masterprompts bons (a tua doutrina Perfect Handoff). Mas para exploração aberta, o CC nativo continua superior |

**Veredicto:** ✅ para waves com critério de aceite escrito (auditorias, refactors com testes, docs, análises). ❌ para exploração visual e para o gate de git. **Chamar-lhe "Cowork-first", não "Cowork-only"** — a honestidade do nome é parte do produto.

⚠️ **Dívida P0 que bloqueia tudo isto:** `fleet.js`, `fleet-ui.html`, `server-apps.js` e `manifest.json` **não estão em git**. O bundle v1.1 que corre diverge do repo v0.4. **Waves que editam código não versionado destroem-se umas às outras.** CW0 existe por isso.

---

## 5. As waves — todas executáveis de dentro do Cowork

Ordem é por **desbloqueio**, não por dificuldade. Uma sessão por wave.

### CW0 · VERSIONAR (30 min · $0) — *sem isto, nenhuma outra é segura*
Copiar o conteúdo real do `.mcpb` v1.1 para `packages/mooter-bridge/`, commit selectivo (`git add` explícito, nunca `-A`), e um `scripts/pack-mcpb.mjs` reproduzível.
**Aceite:** `sha256` do bundle empacotado a partir do repo == `sha256` do `.mcpb` instalado.

### CW1 · PARAR DE MENTIR (1-2 h · $0) — *a wave da confiança*
1. `attachModels`: usar o **`session_id` que o `mooter_collect` já devolve**; se não houver, `null`. ❌ nunca adivinhar por `cwd`.
2. Estado **`stale`** no `mooter_status` (ledger `started` + registry vazio).
3. **Sweeper no boot**: `failed{exit_code:'orphaned-by-restart'}` para todo `started` órfão → desbloqueia worktrees sozinho.
4. Tool **`mooter_cancel(job_id)`** com `taskkill /T /F` (mata a árvore; `shell:true` faz o `kill` matar só o `cmd.exe`).
5. `savedUsd`: enquanto o baseline for all-Opus e tudo correr em Opus, **mostrar `n/d`**, não um número negativo.
**Aceite:** `job-ms0afc3y-aae0` fecha sozinho · `frugal-integ` volta a aceitar dispatch · nenhum campo `model` sem prova.

### CW2 · O FOSSO LIGADO (2-3 h · ~$3) — *a única wave que produz um recibo real*
1. `buildCommand(agent, jobDir, allowedTools, **model**)` → `claude -p … --model <alias>`.
2. `mooter_dispatch` ganha `model?`; ausente ⇒ chama `classify.js` e usa o `recommended_model`. **Roteamento vira default.**
3. `< NUL` / `stdio:['ignore','pipe','pipe']` → **Codex ressuscita** (bug upstream conhecido, 5 issues, workaround unânime).
4. Ledger grava `model_recommended` **e** `model_used` — a divergência vira métrica.
**Aceite:** repetir o job de hoje em **Sonnet** e comparar contra `$1,658 / 168 s`. **Primeiro recibo medido do Mooter.**

### CW3 · TEMPO REAL (2-3 h · ~$1) — *lacunas 3 e 4*
1. `--output-format stream-json --verbose --include-partial-messages`; o conector já pipa o stdout — passar a **ler o tail** do NDJSON.
2. `mooter_status` ganha `now: {activity, tokens_in, tokens_out, tok_s, model_real}` — modelo **lido do stream**, não adivinhado.
3. Painel: por job, uma linha em português — *"Claude Code · Sonnet 4.6 · a ler `fleet.js` · 12,4k in / 3,1k out · 41 tok/s"*.
**Aceite:** durante um job, o painel muda de texto **pelo menos 3 vezes** sem eu chamar tool nenhuma.

### CW4 · A VACA E A CASA (1-2 h · $0) — *lacunas 6 e 7*
1. `icon` + `icons[]` no `manifest.json`; **SVG inline** da vaca no painel (CSP permite `data:`).
2. `_meta.ui.resourceUri` em `mooter_dispatch`, `mooter_status`, `mooter_collect` → **repinta a cada passo do loop**.
3. `hostContext.styles.variables` + `theme` → adeus cores hard-coded.
4. `serverInfo.title:"Mooter"` (hoje `name:"mooter-bridge"` diverge do `display_name:"Mooter"`).
**Aceite:** a vaca aparece em toda interacção e o painel fica igual em light e dark.

### CW5 · O MOO TRABALHA (3-4 h · $0 de inferência) — *lacuna 5*
1. Adapter `moo`: `agent` aceita `moo`; executa via Ollama (`/api/chat`), regista `prompt_eval_count`/`eval_count`/`eval_duration` → tokens **e** tok/s **medidos**.
2. `tierToAgent` T0→`moo` passa a despachável; T1 continua `cc`.
3. **Handoff moo→cc:** o moo pré-coze (resumo, lista de ficheiros, plano) e o output entra no MP do job cloud. É aqui que "handoff perfeito entre local e subscription" deixa de ser slogan.
**Aceite:** uma wave em que o moo faz o preparo e o `cc` recebe MP encurtado — com os dois custos lado a lado.

### CW6 · O VAULT (1-2 h · $0) — *lacuna 9*
1. **Detectar** a raiz do vault (testar `~/Documents/paulo-vault` e `~/paulo-vault`; achar `.obsidian/`). Se não achar → `n/d`, ❌ nunca escrever às cegas.
2. `mooter_journal(wave)` escreve `30-learnings/` ou `20-decisions/` com frontmatter e link para o `job_id`.
3. Chip **Obsidian** no painel com estado real: `✅ escrito 12:04` · `🟡 por escrever` · `⚠️ vault não encontrado`.
**Aceite:** fechar uma wave e ver a nota aparecer no Obsidian sem tocar no teclado.

### CW7 · UMA PORTA SÓ (3-4 h · ~$2) — *a tese*
`mooter_work(objectivo)`: classifica → escolhe tier **e** agente **e** worktree livre → injecta o protocolo de handoff → despacha → painel a andar → no fim, diff + recibo + botões **aceitar / refazer noutro tier** via `ui/message`.
**Aceite:** o teste do amigo — alguém que não sabe o que é worktree, wave ou tier termina uma tarefa real.

---

## 6. Ordem recomendada e porquê

```
CW0 → CW1 → CW2 → CW3 → CW4 → CW6 → CW5 → CW7
 └ segurança  └ confiança  └ fosso  └ tempo real  └ vaca  └ vault  └ local  └ produto
```

**CW2 antes de CW3** porque telemetria bonita de um router desligado é maquiagem.
**CW4 depois de CW3** porque a vaca sobre um painel que mente é pior do que nenhuma vaca.
**CW5 tarde** porque é a maior e a única que não desbloqueia mais nada.

## 7. ❌ Não fazer

| ❌ | Razão (com fonte) |
|---|---|
| `notifications/progress` | o cliente MCP do Cowork **não envia `_meta.progressToken`** — anthropics/claude-code#58687, aberto, `area:cowork` |
| migrar já para a spec `2026-07-28` | breaking; o Cowork negocia `2025-11-25`. Desenhar no formato **Tasks** (`tasks/get|update|cancel`), implementar depois |
| construir sobre Sampling/Logging | **deprecados** no RC de 28/07 |
| guardar estado no widget | **não existe** na spec MCP Apps 2026-01-26 (deferido) — reidratar do ledger |
| `fetch` externo no painel | CSP default `connect-src 'none'` |
| automatizar push/merge/delete | gate humano por doutrina; o mount não é fonte de verdade do HEAD |
| tocar em `classify.js` | FROZEN, sha `427d8c0b…364bc48f` — **nenhuma wave acima precisa** |

## 8. BOARD

| Item | Estado | Próxima acção |
|---|---|---|
| Estratégia Cowork-first | ✅ **viável** (o dispatch corre no host real, sem mount) | manter git + validação visual nativos |
| Bundle não versionado | 🔴 **P0** | **CW0 antes de tudo** |
| Modelo falso no painel | 🔴 dado certo existe e é ignorado | CW1.1 — meia linha |
| `savedUsd` negativo em 6/6 | 🔴 fórmula incapaz de dar positivo | CW1.5 → `n/d` até CW2 |
| 100 % Opus, 0 % local | 🔴 a metodologia não está a acontecer | CW2 + CW5 |
| Job `job-ms0afc3y-aae0` | ⚠️ pendurado, bloqueia `frugal-integ` | 🔥 Paulo: `taskkill` nativo **hoje** |
| Vaca | ❌ 0 assets no bundle | CW4 |
| Vault | 🟡 caminho `n/d` | CW6 — detectar, nunca assumir |

🤝 **SOCIO:** receita? na · despesa↓? **S** (CW2 é a única wave que transforma "poupança" de contrafactual
negativo em recibo medido) · risco↓? **S** (CW0 evita waves a destruírem-se em código não versionado; CW1
fecha um bloqueio de worktree que ninguém sabia existir) · reversível? **S** · escopo? **S** — nenhuma wave
toca `classify.js` nem `packages/*` frozen fora do `mooter-bridge`.

📮 **DESTINO:** Paulo (matar o órfão · aprovar CW0→CW2) → sessões Cowork, uma wave por task
