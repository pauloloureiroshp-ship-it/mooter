# Wave 2 — Plano canónico re-priorizado (2026-05-28 → 2026-06-10)

> **SSoT operacional** da Wave 2. Substitui `PASTOR.md §8 Wave 2` (que ficou desactualizado pós-benchmark Wave 1 + decisão do Paulo 2026-05-28).
>
> Decisão original do PASTOR.md punha **embedding layer no Day 1**. Pós-benchmark Wave 1 (verdict WEAK 1/3 — ver `docs/benchmarks/wave1-pastor/REPORT.md`), priorizamos **fixes de bottleneck antes** porque telemetria nasce sobre dados sãos. Decisão do Paulo 2026-05-28 add: **statusline encaixada no Day 2** (não Day 5), **weekly digest movido para último**.

---

## Resumo da nova ordem

| Day | Foco | Estado | Notas |
|---|---|---|---|
| 1 | Bottleneck fixes (GENERAL fallback + code-audit floor + T0 swap) | ✅ DONE (PR #8 pending merge) | sanity 5/5 pos-fix, $0.17 cost, 24/24 router tests verdes |
| 2 | AMBIGUOUS scaffold + **statusline wire** + animation-web compression | 🔜 NEXT | statusline encaixada cedo |
| 3 | Embedding layer (nomic-embed-text local + faiss) | 🔜 | feed primary do classify_domain v2 |
| 4 | Event schema `mooter_event` v1 + writer + retention 30d/90d | 🔜 | feed da statusline e tudo a jusante |
| 5 | 4 packs adicionais (data-spreadsheet, prd-strategy, voice-tts, knowledge-third-brain) | 🔜 | |
| 6 | Slash commands set W2: `/mooter init`, `why`, `status`, `rate`, `override` | 🔜 | consume event schema do Day 4 |
| 7 | Re-benchmark valida fixes (target STRONG ou MEDIUM 2-3/3) | 🔜 | gate de fecho da Wave 2 |
| 8 | Weekly digest local (movido para último, opt-out por default no v0.2.0) | ❄️ | sem feedback loop antes de eventos vivos |

---

## Day 1 ✅ — Bottleneck fixes (2026-05-28)

**Status**: COMPLETO. Branch `wave2-day1-fixes` pushed, PR #8 → `dev` (NÃO merged, Paulo decide).

**Entregas (referência)**:
- Fix #1: `inject_context.ts` força `tier=T2 Sonnet` + scaffold "general expert" quando `pack_id="GENERAL"`
- Fix #2: `packs/code-audit/pack.yaml` `model_floor=T2, ceiling=T3, escalation_keywords=[...]`
- Fix #3: `tools/router/ollama_call.sh` `MODEL="${OLLAMA_T0_MODEL_OVERRIDE:-qwen2.5-coder:7b}"`

**Sanity**: 5/5 prompts (P005, P012, P013, P018, P020) pós-fix verificados, $0.17 cost (well below $1 BLOCKER).

**Reviewer**: APPROVE_WITH_NOTES (4 NITs → Day 2 backlog).

**Próximo**: merge PR #8 → `dev`, depois arrancar Day 2.

---

## Day 2 🔜 — AMBIGUOUS scaffold + statusline wire + animation-web compression

**Entregas**:

### 2.1 AMBIGUOUS scaffold (continuação Day 1)
Quando `axis2_confidence ∈ [0.45, 0.60]` (ambíguo entre 2+ packs):
- `inject_context.ts` emite `<pack-hint pack_id="AMBIGUOUS" candidates="A,B" confidence="0.52">` + scaffold pedindo Claude a desambiguar com 1 pergunta antes de planear.
- Test: 3 prompts ambíguos (existentes em `benchmark_data/prompts.csv`).

### 2.2 Statusline wire (encaixe Wave 2 conforme decisão Paulo)

**O quê**:
- Wire `~/.claude/settings.json statusLine` → `tools/router/statusline-multi.js` (já existente, narrativa v2).
- **Acrescentar à statusline existente**: linha 1 ganha `· pack: <id>` quando `pack_id ≠ GENERAL`; linha 3 ganha placeholder `adapter: <id|◌>` (Wave 5 alimenta, agora mostra `◌`).
- Auto-start `savings-tracker.js :7821` ao boot da sessão (hook `SessionStart`).
- Graceful degrade: se tracker offline → linha 1 mostra `🛠 mooter setup incomplete · /mooter init`.

**Não fazer agora**:
- Não criar `mooter init` wizard completo (fica Day 6 com slash commands).
- Não desenhar 1-linha colapsada (Day 6 quando estilizamos cross-platform).

**Test**: launch Claude Code em WSL → vê statusline render com pack info → kill tracker → vê fallback 🛠.

### 2.3 Animation-web compression
- `packs/animation-web/pack.yaml` baixa `model_ceiling` de T3 → T2.
- Adicionar `prompt_scaffold.compression_hint`: "Use SVG inline, prefer CSS animations over JS libs unless requested".
- Sanity: re-corre prompts P006, P011, P022 (benchmark Wave 1) com compression aplicada.

**DoD**: PR `wave2-day2-statusline-ambiguous-compression` aberto para `dev`, 3 sub-features verdes, final-reviewer APPROVE.

---

## Day 3 🔜 — Embedding layer

**O quê**: nomic-embed-text local (Ollama) + faiss in-memory para classify_domain v2.
- Build embedding store: cada pack tem `domain_signals.embedding_seed` (5-10 prompts canónicos).
- Classify v2: cosine similarity top-k=3 packs → confidence weighted.
- Fallback: regex classify_domain v1 se embedding store unavailable.

**DoD**: classify_domain p99 ≤ 80ms inclui embedding lookup; recall ≥ 0.90 nos 20 prompts validation set; classify.js eixo 1 byte-identical (P11 invariant).

---

## Day 4 🔜 — Event schema `mooter_event` v1

**O quê**: implementação do schema completo definido no deep dive (PASTOR.md §6.x a criar).
- `~/.mooter/events/YYYY-MM-DD.jsonl` writer (rolling daily, 30d retention).
- `~/.mooter/sessions/<id>.jsonl` writer (90d retention).
- `~/.mooter/env-snapshot.json` (hardware + stack + subs + mooter).
- Hook: cada turn emite 1 event nível 1 (implícito) automaticamente.
- Schema versionada (`schema_version: 1.0.0` + `pricing_version` + `env_hash`).

**Não fazer agora**:
- Nada de upload ao hub (Wave 3).
- Sem opt-in flow (Wave 3 via `/mooter share`).

**DoD**: 100 events sintéticos escritos em ≤ 200ms; retention pruner corre sem erros; schema validado contra `decision_record.json` derivado.

---

## Day 5 🔜 — 4 packs adicionais

`data-spreadsheet`, `prd-strategy`, `voice-tts`, `knowledge-third-brain`. Spec em PASTOR.md §5.4-§5.7. Cada um:
- `pack.yaml` validado contra schema
- 5 prompts validation set
- Recall ≥ 0.85 isolado + ≥ 0.85 em set total (40 prompts)

**DoD**: 7 packs no registry local, todos validated.

---

## Day 6 🔜 — `/mooter init` wizard v1 + slash commands W2

> **Expandido 2026-05-28** para incluir activation journey completo (Momento 1 da análise UX/UI). Cobre credentials Anthropic + Ollama, pack recommendations, consent screen. Outros providers (OpenAI, Google, Grok) e `/mooter rate`/feedback loop ficam Wave 3.

### 6.1 `/mooter init` wizard (5 steps, terminal-native)

**Step 1/5 — Hardware probe (automatic, ~2s)**
- Detecta: OS, Node version, Ollama URL + models, GPU (via `nvidia-smi`/`system_profiler`/`wmic`), VRAM
- Cross-platform: Linux full · macOS skeleton · Windows-WSL full (foco principal)

**Step 2/5 — Providers multi-select**
- Lista: Anthropic, OpenAI, Google, Grok, Ollama (auto-checked)
- Multi-select com [x] / [ ]
- v1 captura todos seleccionados mas só configura credentials Anthropic + Ollama (Wave 3 captures OpenAI/Google/Grok)

**Step 3/5 — Anthropic access**
- Choice: API key only · Pro · Max · Team
- Se API key: paste com input masking (mostra `sk-ant-***...***`)
- Se browser sub: detecta da session activa OU OAuth flow via browser-handoff (Supabase Auth, mesmo que landing actual)
- Valida com test call (`/v1/messages` 1 token) — se 401, mostra erro claro
- Detecta tier real, regista budget 5h/7d

**Step 4/5 — Pack recommendations (top 3)**
- Algoritmo v1: score por (hardware fit + provider tier + community trust_score offline placeholder)
- Mostra 3 packs como cards com [install] / [skip] (default skip — privacy-first, never auto-install)
- Trust_score real vem da Wave 3 hub (placeholder valores fixos por enquanto)

**Step 5/5 — Telemetry consent**
- Default: **OFF** (privacy-first opt-in, mudável depois com `/mooter share`)
- Linguagem clara: "we collect X, never Y"
- Schema `consent.json` regista timestamp + version

### 6.2 Schemas canónicos (introduzidos Day 6)

**`~/.mooter/credentials.json`** (chmod 600, keyring quando disponível com fallback warning)
```json
{
  "schema_version": "1.0.0",
  "providers": {
    "anthropic": {
      "type": "oauth_max" | "oauth_pro" | "api_key" | "team",
      "credential_ref": "<keyring-id OR encrypted blob>",
      "tier_detected": "max",
      "budget_5h_limit": 80,
      "budget_7d_limit": 1000,
      "last_validated_utc": "2026-05-28T..."
    },
    "ollama": {
      "type": "local",
      "url": "http://host.docker.internal:11434",
      "models": ["qwen2.5-coder:7b", ...],
      "gpu": "RTX 4090 24GB"
    }
  }
}
```

**`~/.mooter/profile.json`** (hardware + os snapshot)
```json
{
  "schema_version": "1.0.0",
  "os": "ubuntu-22.04-wsl2",
  "node_version": "20.11.0",
  "gpu": { "model": "RTX 4090", "vram_gb": 24 },
  "ram_gb": 32,
  "cpu_cores": 16,
  "captured_utc": "2026-05-28T...",
  "next_refresh_utc": "2026-06-27T..."
}
```

**`~/.mooter/consent.json`**
```json
{
  "schema_version": "1.0.0",
  "telemetry_enabled": false,
  "consent_timestamp_utc": "2026-05-28T...",
  "consent_version": "1.0.0",
  "can_revoke": true
}
```

### 6.3 Slash commands set W2 (consume schemas do Day 4 + Day 6)

| Comando | Acção |
|---|---|
| `/mooter init` | Wizard 5-step (acima) |
| `/mooter why` | Explica routing do último turn (tier, pack, model, cost, fallback used?) |
| `/mooter status` | Full dump: profile, credentials health, packs active, last 5 decisions, savings session |
| `/mooter override <T0\|T1\|T2\|T3>` | Força tier no próximo turn, auto-revert após 1 turn |

`/mooter rate` e `/mooter pack suggest` ficam Wave 3 (precisam de feedback loop maduro).

### 6.4 Definition of Done Day 6

- Wizard completo em fresh WSL2 ≤ 3 min
- Credentials masked durante input
- Anthropic API validation funciona (test call 1 token, 401 reporta erro claro)
- 3 schemas (credentials/profile/consent) escritos com permissions correctas (600)
- Telemetry consent ficheiro existe MAS upload está OFF até Wave 3
- 4 slash commands com unit + integration test
- Cost sanity: $0.01 (1 test call Anthropic durante validation)

**DoD**: wizard verde em fresh-install, all schemas válidos, slash commands respondem.

---

## Day 7 🔜 — Re-benchmark

Mesmo design do Wave 1 (34 prompts × 3 arms + Sonnet judge), mesmas seeds, mesmas rúbricas. Pre-registration imutável (BENCHMARK_DESIGN.md v2).

**Predicted post-fixes** (do REPORT.md §8):
- cost $0.022 → $0.013-0.016 (-40 a -50%)
- latency 51s → 15-20s (-65%)
- verdict MEDIUM-STRONG 2-3/3

**Gate de fecho Wave 2**: se STRONG 3/3 → tag `v0.2.0-rc1` + Wave 3 starts. Se WEAK 1/3 ainda → pivot decision com Paulo.

---

## Day 8 ❄️ — Weekly digest local

**O quê**: `/mooter digest` lê últimos 7d de `~/.mooter/events/*.jsonl`, agrega savings + top packs + regression flags, formata para terminal + opcionalmente para file.
- Sem email mailer (Wave 3+ opt-in).
- Sem upload (Wave 3).

**DoD**: `/mooter digest` produz output válido em fresh-install + 7d sintéticos.

**Justificação da última posição**: digest precisa de events vivos do Day 4 + slash commands do Day 6 + feedback loop do Day 7. Antes disso é fé.

---

## Invariantes ao longo da Wave 2

- ❌ Nunca tocar `classify.js` (eixo 1 byte-identical, P11)
- ❌ Nunca `git add -A`
- ❌ Nunca merge directo para `main` (sempre `dev`, Paulo aprova squash)
- ❌ Nunca `--no-verify`
- ✅ Final-reviewer obrigatório pré-PR em cada Day
- ✅ Sanity check com $1 cost BLOCKER em cada Day
- ✅ Notion sub-page por Day + actualização SYNC.md
- ✅ Commits selectivos

---

## Master prompts

| Day | Master prompt | Estado |
|---|---|---|
| 1 | `docs/strategy/WAVE2_DAY1_KICKOFF.md` | ✅ executado |
| 2 | `docs/strategy/WAVE2_DAY2_KICKOFF.md` | 🔜 compor |
| 3 | `docs/strategy/WAVE2_DAY3_KICKOFF.md` | pending |
| 4 | `docs/strategy/WAVE2_DAY4_KICKOFF.md` | pending |
| 5 | `docs/strategy/WAVE2_DAY5_KICKOFF.md` | pending |
| 6 | `docs/strategy/WAVE2_DAY6_KICKOFF.md` | pending |
| 7 | `docs/strategy/WAVE2_DAY7_KICKOFF.md` | pending |
| 8 | `docs/strategy/WAVE2_DAY8_KICKOFF.md` | pending (❄️) |

---

## Relacionados

- [PASTOR.md](./PASTOR.md) — SSoT estratégico (§8 aponta para este ficheiro como SSoT operacional Wave 2)
- [WAVE2_DAY1_KICKOFF.md](./WAVE2_DAY1_KICKOFF.md) — master prompt Day 1 (executado)
- [docs/benchmarks/wave1-pastor/REPORT.md](../benchmarks/wave1-pastor/REPORT.md) — verdict WEAK 1/3 + bottlenecks
- [docs/benchmarks/wave1-pastor/BENCHMARK_DESIGN.md](../benchmarks/wave1-pastor/BENCHMARK_DESIGN.md) — pre-registration imutável
- Memory: `project_mooter_pastor_wave1_shipped` (eixo 2 SHIPPED 2026-05-27, benchmark 2026-05-27, REPORT 2026-05-28)
