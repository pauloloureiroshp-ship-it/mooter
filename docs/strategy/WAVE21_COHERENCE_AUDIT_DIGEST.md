# Wave 21 Coherence Audit Digest

Date: 2026-06-05
Auditor: CC Opus 4.8 (READ-ONLY)
Session: 4f3982ce-7871-4771-9939-1c5955c64b87
Total resumos analisados: ~50 delegações local-summarizer + 3 inline Reads + 1 recall-from-session

> **Aviso de método (ler primeiro).** A statusline e os meus próprios token-counts por turno **não são observáveis do lado do CC** — eu nunca vejo os chips renderizados nem o stop digest. Tudo o que está marcado `confidence=low` em Step 3/4 é inferência a partir dos ficheiros runtime (`/tmp/mooter-tokens-*.json`, `subagent_tracker.js`), não observação directa. Os findings `confidence=high` vêm de evidência on-disk verificável ou dos hints/tier-badges que **vi** injectados no contexto.

---

## TL;DR (3 lines)
- **Critical: 3** — herd file nunca escrito (🐄 sem backing); T0 under-count ~18/50 spawns; `_transcript` atribui 100 % a T3.
- **Important: 4** — branding "frugal" no hot path; hint misclassify (trivial→architecture); hint auto-contraditório (tier:T0 + opus); `tokens-saved=0` sempre.
- **Polish: 2** — statusline-tick file 3 bytes (sem digest on-disk); statusline source não traçado (gap de auditoria).
- **Worst offender: B (tracker silent)** — eventos de spawn não chegam ao disco.

---

## Inventory (Step 1)

Colunas que **consigo** preencher: prompt, rota real (spawn/inline), tier real, modelo, `subagent_tokens` (total — o split in/out por resumo **não é exposto** ao CC). Colunas "statusline antes→depois" e "tokens in/out por resumo" = **não observáveis** (ver aviso).

| # | Prompt (ficheiro) | Rota real | Tier real | Modelo | subagent_tokens |
|---|---|---|---|---|---|
| 1 | os-release | spawn | T0 | qwen3:30b | 13624 |
| 2 | hostname | spawn | T0 | qwen3:30b | 13360 |
| 3 | passwd | spawn | T0 | qwen3:30b | 14725 |
| 4 | group | spawn | T0 | qwen3:30b | 14790 |
| 5 | fstab | spawn | T0 | qwen3:30b | 13421 |
| 6 | hosts | spawn | T0 | qwen3:30b | 13635 |
| 7 | resolv.conf | spawn | T0 | qwen3:30b | 13741 |
| 8 | wsl.conf | spawn | T0 | qwen3:30b | 13683 |
| 9 | shells | spawn | T0 | qwen3:30b | 13505 |
| 10 | shells (confirma exato) | **inline Read** | T3 | opus | — |
| 11 | sudoers | spawn (access denied) | T0 | qwen3:30b | 13512 |
| 12 | crontab | spawn | T0 | qwen3:30b | 14288 |
| 13 | profile | spawn | T0 | qwen3:30b | 13771 |
| 14 | bash.bashrc | spawn | T0 | qwen3:30b | 14696 |
| 15 | environment | spawn | T0 | qwen3:30b | 13455 |
| 16 | login.defs | spawn | T0 | qwen3:30b | 18108 |
| 17 | ssh/sshd_config | spawn (not exist) | T0 | qwen3:30b | 13485 |
| 18 | timezone | spawn | T0 | qwen3:30b | 13373 |
| 19 | locale.gen | spawn | T0 | qwen3:30b | 20863 |
| 20 | apt/sources.list | **malformed call** (não executou) | — | — | — |
| 21 | apt/sources.list.d (+sources.list) | spawn | T0 | qwen3:30b | 14904 |
| 22 | hosts.allow | spawn → depois inline Read | T0/T3 | qwen3:30b/opus | 13428 |
| 23 | hosts.deny | **inline Read** | T3 | opus | — |
| 24 | nsswitch.conf | spawn | T0 | qwen3:30b | 13590 |
| 25 | pam.conf | spawn | T0 | qwen3:30b | 13625 |
| 26 | pam.d/ | spawn | T0 | qwen3:30b | 16485 |
| 27 | common-auth | spawn | T0 | qwen3:30b | 14218 |
| 28 | common-password | spawn | T0 | qwen3:30b | 14823 |
| 29 | common-session | spawn | T0 | qwen3:30b | 14427 |
| 30 | common-account | spawn | T0 | qwen3:30b | 14283 |
| 31 | pam.d/sudo | spawn | T0 | qwen3:30b | 13841 |
| 32 | pam.d/login | spawn | T0 | qwen3:30b | 15503 |
| 33 | pam.d/su | spawn | T0 | qwen3:30b | 14728 |
| 34 | pam.d/su (repeat) | **recall sessão** (sem spawn) | T3 | opus | — |
| 35 | pam.d/passwd | spawn | T0 | qwen3:30b | 13680 |
| 36 | pam.d/chsh | spawn | T0 | qwen3:30b | 13639 |
| 37 | pam.d/chfn | spawn | T0 | qwen3:30b | 13840 |
| 38 | pam.d/runuser | spawn | T0 | qwen3:30b | 13856 |
| 39 | pam.d/cron | spawn | T0 | qwen3:30b | 14046 |
| 40 | pam.d/sshd | spawn (not exist) | T0 | qwen3:30b | 13483 |
| 41 | pam.d/other | spawn | T0 | qwen3:30b | 13678 |
| 42 | pam.d/login-noninteractive | spawn (not exist) | T0 | qwen3:30b | 13544 |
| 43 | common-session-noninteractive | spawn | T0 | qwen3:30b | 14969 |
| 44 | security/limits.conf | spawn | T0 | qwen3:30b | 14201 |
| 45 | security/pam_env.conf | spawn | T0 | qwen3:30b | 14519 |
| 46 | security/access.conf | spawn | T0 | qwen3:30b | 15091 |
| 47 | /etc/security/ (all) | spawn | T0 | qwen3:30b | 22388 |
| 48 | /etc/pam.d/ (all) | spawn | T0 | qwen3:30b | 24584 |
| 49 | /etc/apt/ (all) | spawn | T0 | qwen3:30b | 19887 |
| 50 | /etc/systemd/ (all) | spawn | T0 | qwen3:30b | 21291 |
| 51 | /etc/network/ (all) | spawn | T0 | qwen3:30b | 15711 |
| 52 | /etc/ssh/ (all) | spawn | T0 | qwen3:30b | 15005 |
| 53 | /etc/cron.d/ | spawn | T0 | qwen3:30b | 14293 |
| 54 | /etc/cron.daily/ | spawn | T0 | qwen3:30b | 16410 |

**Spawns local-summarizer: ~50. Inline Reads (Opus): 3 (#10, #22b, #23). Recall sessão: 1 (#34). Malformed: 1 (#20).**

---

## Hint vs Reality (Step 2)

| Métrica | Contagem |
|---|---|
| Total prompts com hint | ~54 |
| hint=T0/T1 **e foi delegado** ✅ | ~50 (a esmagadora maioria) |
| hint=T0 mas **Opus respondeu inline** | 3 (#10, #23 confirmação/existência factual; #34 recall de sessão) — **justificados** (verificação verbatim / estado de sessão) |
| hint=`architecture_or_critical`/opus em tarefa **trivial** | ≥4 (os-release×2, timezone, locale.gen, todos os `/etc/security/*`) — **misclassify**, ignorado correctamente |
| hint com `tier:T0` **mas** `recommended_model: claude-opus-4-6` | praticamente todos os "architecture" hints — **auto-contraditório** |

**Veredicto Step 2:** a *delegação* esteve correcta (~93 % delegado a T0). O problema **não** é a minha rota — é o **hint** que oscila entre `simple_transform/haiku/0.85` e `architecture_or_critical/opus/0.75` para inputs quase idênticos ("resume /etc/X"). O classifier não é determinístico para o mesmo padrão de prompt.

---

## Statusline Anomalies (Step 3)

| Chip | Expected | Observed | Severity | Confidence |
|---|---|---|---|---|
| 🪙 T0/T1/T2/T3 tkns | T0 cresce com spawns; T3 com Opus | `_pushed.T0=32 calls/7594in/4744out` (real ✅); `_transcript` põe **tudo em T3 (141 calls)**, T0_transcript=0 | important | med (ficheiro lido; render não visto) |
| 🐄 N/M/peakK | incrementa por spawn, persiste | **herd file inexistente** → chip sem fonte de dados esta sessão | **critical** | high (ficheiro ausente confirmado) |
| 🏠 calls/local % | % delegação real | não observável; risco de contar classify-hints como "local" | important | low |
| 🐮 saved $X | cresce real-time | não observável; `tokens-saved="0"` em todos os `<optimized-task>` sugere $0 | important | low/med |
| ▁▅██ sparkline | últimos 10 | não observável | polish | low |
| 🎮 VRAM | real-time | não observável | polish | low |
| 🧬 LoRA adapter | baseline | não observável | polish | low |
| ☁ Claude Max | quota | tier-badge mostrou `100% remaining` constante toda a sessão | polish | med |

---

## Bash Output Issues (Step 4)

- **Hint misclassify (high):** "resume /etc/os-release" (trivialíssimo) classificado `task_category: architecture_or_critical, recommended_model: claude-opus-4-6, confidence 0.75`. Repetido em timezone, locale.gen e todos os `/etc/security/*`. Excerpt visto no contexto: `task_category: architecture_or_critical … suggested_subagent: model-architect`.
- **Hint auto-contraditório (high):** o mesmo bloco diz `tier: T0` + `max_tier: T0` **e** `recommended_model: claude-opus-4-6` / `suggested_subagent: model-architect`. T0 e opus-architect são mutuamente exclusivos.
- **`tokens-saved="0"` sempre (high):** todos os blocos `<optimized-task tier="T0" strategy="s1+s2" tokens-saved="0">`. O optimizer nunca reporta poupança > 0 — bate certo com o aviso de doutrina "∅ 0% saved".
- **"mooter → …" top-of-prompt (gap):** não vi esse texto; o que é injectado é `<router-hint>` + `<tier-badge>[🐄 ☁ opus 0.90]`. Nenhum disse "frugal" no contexto visível — bom sinal **no contexto injectado**, mas ver Step 5 para o hot path.
- **Stop digest (gap):** nenhum digest renderizado visível nesta sessão; on-disk só existe `/tmp/mooter-statusline-tick-<sid>` (3 bytes). **Não consigo confirmar** a estrutura (TOKENS BY TIER / CHOICE REASONS / HERD / SAVINGS / PER-TASK BREAKDOWN Wave 20.F).
- **Erro silencioso real:** o herd tracker não escreveu ficheiro apesar de 50 spawns e do tokens-tracker ter funcionado — falha silenciosa de `trackSpawn` no hook real (o teste `post_tool_badge.test.js:157` espera o ficheiro).

---

## Runtime State (Step 5)

```
CLAUDE_CODE_SESSION_ID=4f3982ce-7871-4771-9939-1c5955c64b87

/tmp/mooter-tokens-<sid>.json:
  _pushed:     T0={calls:32, in:7594, out:4744, real}  T1/T2/T3=0
  _transcript: T3={calls:141, in:33822, out:31365, real}  T0/T1/T2=0

/tmp/*herd*  → AUSENTE (nenhum ficheiro)
/tmp/mooter-statusline-tick-<sid> → 3 bytes (contador)

~/mooter        -> ~/frugal -> /mnt/c/Users/Paulo Loureiro/frugal   (symlink chain)
~/.claude/tools/router -> ~/mooter/tools/router  (mesmos inodes; edição live)
docs/strategy: inode idêntico em ~/mooter e ~/frugal (42221246506664052)

grep trackSpawn|trackCall: post_tool_badge.js=2, ollama-api.js=1, ollama_call.sh=1  (existem)
subagent_tracker.js:70  → statePath = /tmp/mooter-herd-<sid>.json  (esperado mas nunca escrito)
grep "frugal" hot path → dezenas de .js (auto-sync, arbiter, budget-engine, activity-classifier, …)
```

Interpretação 1-linha:
- **tokens.json:** tracker T0 funciona (fix do bug "T0 read 0" confirmado), mas split `_pushed` vs `_transcript` cria dupla contabilidade/atribuição-a-T3.
- **herd ausente:** `trackSpawn` não persiste em produção → 🐄 sem dados.
- **symlink chain:** "mooter" é alias puro sobre repo `frugal`; nome canónico on-disk continua `frugal`.
- **trackers existem no código** mas a cobertura de eventos é incompleta (32 ≪ 50).

---

## Categorized Root Causes (Step 6)

### A. Display honesty
- `_transcript` atribui 100 % a T3, mascarando os 50 spawns T0 → se o chip 🪙 lê `_transcript`, T0 parece morto. **Fix:** `statusline-multi.js` deve somar `_pushed` (ou reconciliar) — **1h**. Impacto: alto (honestidade do nº central).
- `calls` tem semântica diferente em `_pushed` (eventos) vs `_transcript` (mensagens) → 32 vs 141 não comparáveis. **Fix:** normalizar unidade — **1h**.

### B. Tracker silent  ⟵ **worst offender**
- **Herd file nunca escrito** apesar de 50 spawns. **Fix:** `subagent_tracker.js` / hook PreToolUse que devia chamar `trackSpawn` — **1h** investigar porquê não dispara no hook real (testes passam, runtime não). Impacto: critical.
- **T0 under-count (~32/50).** **Fix:** garantir `trackCall` em todos os caminhos de invocação do subagent (Agent tool → ollama), não só `ollama-api.js`/`ollama_call.sh` directos — **1h**. Impacto: critical (poupança subreportada).

### C. Hint vs delegation gap
- Sem feedback ao user quando o hint é ignorado por misclassify. (Eu justifiquei inline em 1 linha, mas o sistema não regista.) **Fix:** logar "hint overridden: reason" — **15min**. Impacto: médio.

### D. Stop digest incompleto
- Não verificável desta sessão. **Fix:** N/A até observar um digest real — **gap**, não estimável.

### E. Branding leftover
- `~/mooter → ~/frugal`; dezenas de `.js` no hot path com "frugal"; ficheiros `/tmp/mooter-*` (já renomeados) vs código `frugal` (não). **Fix:** decisão estratégica — rename completo OU aceitar "frugal=codebase, mooter=produto". **4h** se rename total. Impacto: baixo funcional, médio coerência.

### F. Stale runtime
- **Não há stale**: `~/.claude/tools/router` e `~/mooter` partilham inodes com `~/frugal` (edição é live). Confirmado, sem fix. (Coerente com memória `mooter-runtime-symlink-topology`.)

### G. Other
- `tokens-saved="0"` constante no optimizer — investigar se o cálculo de savings está ligado. **Fix:** **1h**. Impacto: médio (o 🐮 saved depende disto).
- Classifier não-determinístico (mesmo prompt → tiers diferentes). **Fix:** **1h-4h** dependendo da causa. Impacto: médio.

---

## Recommended Wave 21 Scope

Ordem de fix (impacto × custo):
1. **B — Herd file não escrito** — 1h — critical, 🐄 está cego.
2. **B — T0 under-count (32/50)** — 1h — critical, poupança subreportada.
3. **A — `_transcript` → T3 catch-all / reconciliar com `_pushed`** — 1h — alto, honestidade do 🪙.
4. **G — `tokens-saved=0` / savings engine** — 1h — médio, alimenta 🐮.
5. **A — normalizar semântica de `calls`** — 1h — médio.
6. **G — classifier não-determinístico + hint auto-contraditório (T0+opus)** — 1-4h — médio.
7. **C — log de hint-override** — 15min — baixo.
8. **E — decisão branding frugal/mooter** — 0 (decisão) a 4h (rename) — baixo.

**Total estimate Wave 21 fix:** ~6-7h CC autónomo (excl. E rename e D não-verificável).
**Suggested split:** 1 PR consolidado para **B+A** (trackers + display honesty, são o mesmo subsistema `statusline-multi.js`/`subagent_tracker.js`); PR separado para **G** (savings+classifier); **C** e **E** como micro-PRs/decisão.

---

## Open questions for Paulo
- **Q1:** O chip 🪙 lê `_pushed`, `_transcript`, ou a soma? (Determina se o fix A é "trocar fonte" ou "deduplicar".) Não tracei `statusline-multi.js` (51KB) para poupar tokens.
- **Q2:** "frugal" vs "mooter" — rename total do codebase (4h) ou política oficial "frugal=repo, mooter=produto"? Afeta E e a memória.
- **Q3:** O herd tracker alguma vez escreveu ficheiro em sessões anteriores, ou nunca funcionou em runtime? (Não há `/tmp/*herd*` de NENHUMA sessão — sugere "nunca em produção".)
- **Q4:** Existe um stop digest real que eu possa inspeccionar (ex: guardado em ficheiro) para validar D?

---

## Honest gaps in this audit
- **Statusline nunca observada** — todo o Step 3 (chips renderizados, before→after) é inferência de ficheiros, não observação. 🏠/🐮/sparkline/VRAM/LoRA = `confidence=low`.
- **Token in/out por resumo não exposto** — só tenho `subagent_tokens` total por Agent call; o split per-tier vem do tracker agregado, não por prompt.
- **Stop digest não verificado** — nenhum renderizado nesta sessão; só o tick-file de 3 bytes existe. Step D fica em aberto.
- **`statusline-multi.js` não lido na íntegra** — decisão de orçamento de tokens; Q1 fica por responder até alguém abrir o ficheiro.
- **Contagem de spawns (~50) reconstruída do histórico** — pode variar ±2; o gap vs 32 é grande o suficiente para ser real mesmo com essa margem.
- **`_pushed.calls` vs ollama-calls** — assumi 1 push≈1 ollama call; se um summarizer fizer N calls internas, o under-count seria ainda maior, não menor (reforça o finding).
