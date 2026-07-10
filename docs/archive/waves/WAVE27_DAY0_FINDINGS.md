# Wave 27 — Day 0 Honest Recon (findings)

**Data:** 2026-06-06 · **Branch:** `wave27-consolidation` @ `240e4cf` (= `main`, fresh) · **Mode:** CC autonomous (dangerous)

> TL;DR (3 linhas):
> 1. **Phase C premissa do brief estava ERRADA** — a CI não falha por `package-lock.json` Windows-only; falha por **1 teste** (`wave21-coherence.test.js` C1) cuja contract divergiu do código `recordSpawn` após Wave 21 Day 2. Fix aplicado (aditivo, sem regressão).
> 2. **Phase F premissas parcialmente ERRADAS** — `STRATEGY.md` é doc estratégico estático (v0.11, 2026-05-07), **não tem tracking de waves nem tag-history table**; `SYNC.md` top aponta para **Wave 20**, não "Wave 26 IN-FLIGHT". Ajustado o plano de edição em conformidade.
> 3. Restante inventário (LoRA, marketing, DMs) confirmado com pequenas correcções numéricas (212 = subset score≥8 de 560 totais; dropout real 0.0 não 0.1).

---

## 1. Inventário Wave 26 (o que entrou)

`git log --oneline 5408f9b..240e4cf`:

| Hash | Descrição |
|---|---|
| `240e4cf` | Merge PR #123 wave26-real-sync-pastor |
| `b58bbd2` | record final-reviewer gate + cursor fix in Day 0 findings |
| `efa1956` | success-advancing sync cursor (fix final-reviewer MEDIUM #1) |
| `c245315` | 26.A/B/D/E/F: real CLI→hub sync via /v1/events + pull-based Pastor |
| `48217d6` | 26.G + 26.H: LoRA trainer + 50-herd nuclear test + Day 0 recon |

Wave 26 está em `main`. Esta wave (27) parte de `main` fresh — branch já limpa, 0 commits à frente, 0 diff.

---

## 2. Phase C — root cause REAL da CI (premissa do brief refutada)

**Brief dizia:** lockfile `hub/package-lock.json` Windows-only (`@cloudflare/workerd-windows-64`) → CI Linux não resolve.

**Realidade observada:**
- `hub/package-lock.json` **já contém todas as plataformas**: `workerd-linux-64`, `workerd-darwin-64/arm64`, `workerd-windows-64`, `workerd-linux-arm64`. NÃO é Windows-only. Hipótese refutada.
- A CI que falha é o workflow **`test.yml`** (`unit + integration tests`), não um job do hub. Falhou em PR #123 em **26s** (cedo demais para ser timeout de testes).
- Log real: **508 pass / 1 fail / 1 skip**. O único `not ok`:
  ```
  not ok 506 - C1: PostToolUse writes herd file on a real CC Task payload
    location: tools/router/wave21-coherence.test.js:32  (expected true, actual false)
  ```

**Root cause:** divergência teste↔código.
- `tools/router/post_tool_badge.js::recordSpawn` foi reescrito na Wave 21 Day 2 para ler `payload.agent_type` + `payload.agent_id` (os inner Bash calls que o CC v2.1.165 emite). O outer Agent/Task payload deixou de carregar `subagent_type`.
- O teste `wave21-coherence.test.js` C1 continua a enviar o **shape antigo** (`tool_name:'Task'` + `tool_input.subagent_type`). Com esse payload, `agentType` é `undefined` → `recordSpawn` devolve `null` → herd file nunca é escrito → assert falha.
- Logo, este teste está **vermelho desde a Wave 21 Day 2** (bate com "falha consistentemente em PRs").

**Fix aplicado (commit nesta wave):** `recordSpawn` passa a aceitar **ambos** os shapes:
```js
const agentType = payload.agent_type
  || ((payload.tool_name === 'Task' || payload.tool_name === 'Agent') && payload.tool_input
    ? payload.tool_input.subagent_type : null);
const agentId = payload.agent_id || payload.tool_use_id
  || (agentType ? `${sessionId || 'global'}:${agentType}` : null);
```
- **Sem regressão / sem double-count:** os shapes são mutuamente exclusivos entre versões de CC (o CC actual nunca carrega `subagent_type` no payload outer). O path `agent_type/agent_id` mantém-se idêntico.
- `post_tool_badge.js` **NÃO é P11-protected** (só `classify.js` é). Edição legítima.
- Verificação local: `wave21-coherence.test.js` 5/5 ✅; suites relacionadas (`post_tool_badge`, `subagent_tracker`, `herd-chip`, `herd-integration`, `badge-always-on`) 49/49 ✅.

**Scope:** `tools/router/` é a infra do router (sujeito explícito da Phase C), **não** está na lista proibida (`landing/`, `cli/`, `hub/src/`). Em scope.

---

## 3. Phase B — telemetria prod (a inspeccionar)

- Configs wrangler **estão em `hub/`**, não na raiz: `hub/wrangler.mooter.toml` (+ `hub/wrangler.frugal-legacy.toml`). Os comandos do brief precisam de correr a partir de `hub/` ou com `--config hub/wrangler.mooter.toml`. Ajuste documentado.
- D1 binding: `mooter-hub`. Queries readonly permitidas pela doctrine da wave.

## 4. Phase D — LoRA setup (confirmado, com correcções)

- `scripts/train_lora.sh` ✅ existe (venv isolado, `set -euo pipefail`, guarda `nvidia-smi`, stack pinned unsloth/trl).
- `scripts/train_lora.py` ✅ existe.
- Base model: `unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit` → mapeia para `qwen2.5-coder:7b` no install. ✅
- Params: 4-bit ✅, `lora_alpha=16` ✅, `lr=2e-4` ✅, epochs 3 + early stopping ✅, output GGUF `q4_k_m` → `mooter-pastor-v1.gguf` ✅.
- **Correcções vs brief:**
  - `lora_dropout = 0.0` no script (brief dizia 0.1). Source of truth = script.
  - `audit/lora_train.jsonl` tem **560 linhas totais**, não 212. Distribuição de score: `{7: 348, 8: 178, 9: 4, 10: 30}`. **score≥8 = 212** (o "high set" que o `--min-score 8` default seleciona). O script recusa treinar com <212 (overfit guard). Premissa "212 samples" = subset, confirmada.
- **Não corro o treino** (sem GPU no CC). Phase D entrega o 1-liner para o Paulo.

## 5. Phase E — marketing (estado actual)

- `audit/TWEET_THREAD.md` ✅ existe (1648 bytes).
- `audit/BLOG_POST_DRAFT.md` ✅ existe (2615 bytes).
- `README.md`: badge **version v1.0.0** + **tests 62/62** → desactualizados (versão real corrente = `v1.15.0-pastor-live`). Phase E adiciona badge "Sync: live" + actualiza CHANGELOG.

## 6. Phase F — docs (premissas ajustadas)

- `docs/strategy/STRATEGY.md`: **doc estratégico estático** (frontmatter date 2026-05-07, corpo refere "v0.11"). **Não tem secção por-wave nem tag-history table.** As edições propostas no brief (secção "Wave 26 SHIPPED", "tag history table") **não têm âncora** — não aplicáveis tal como escritas. Decisão: **não inventar** secções novas num doc estratégico canónico; em vez disso o tracking de waves vive no `SYNC.md` (que já o faz). Documento aqui para honestidade.
- `SYNC.md`: top "Próxima missão" aponta para **Wave 20** (linha 14), estado refere **Wave 19** (linha 18). **Não** menciona "Wave 26 IN-FLIGHT". Premissa do brief refutada. Plano F ajustado: actualizar a secção COWORK→CLAUDE CODE e Notion HQ para reflectir Wave 26 SHIPPED + próxima missão Wave 28, sem fingir um estado que não existia.
- Arquivar: `WAVE25_COMPLETE_HONESTY_KICKOFF.md` + `WAVE25_DAY1_FINDINGS.md` → `docs/archive/sessions/` (ambos confirmados em `docs/strategy/`). `docs/archive/sessions/` ✅ existe.

## 7. Phase G — DMs (a materializar)

- `audit/FRIENDS_LAUNCH_DMS.md` **não existe** ✅ (correcto — Phase G cria). Não enviar DMs.

---

## 8. Plano final ajustado (decisões tomadas)

| Phase | Decisão |
|---|---|
| C | Fix `recordSpawn` (aditivo) em vez de regenerar lockfile. CI verde local. |
| B | Correr wrangler a partir de `hub/` / com `--config hub/...`. Readonly. |
| D | Validar scripts + 1-liner; dropout real 0.0; 212 = subset score≥8 de 560. |
| E | TWEET +Tweet#11, BLOG +closing-the-loop, README badge Sync:live + CHANGELOG v1.15.0. |
| F | Actualizar SYNC.md (não STRATEGY.md — sem âncora); arquivar 2 docs Wave 25. |
| G | Criar `audit/FRIENDS_LAUNCH_DMS.md`; Paulo envia manualmente. |
| H | final-reviewer Opus → PR feature→dev→main → CI verde → tag `v1.15.1-wave27-consolidation` PÓS-merge. |
</content>
</invoke>
