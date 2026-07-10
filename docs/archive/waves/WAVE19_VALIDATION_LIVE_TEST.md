# Wave 19 Validation Live Test — Master Prompt

> **Goal**: confirmar end-to-end que Day 4.1 honesty hot-fix está LIVE numa sessão
> CC real com spawns local-summarizer. Validar todas as 4 entregas Wave 19 funcionam
> em tempo real: statusline 4-tier chip, decisions_v2.jsonl, mooter trail, Stop digest.
>
> **Trigger**: Paulo apanhou em sessão CC fresh (WSL2 /home/paulo) que statusline
> mostra `🟡 T0:0 · 🔵 T1:0 · 🟡 T2:0 · 🔴 T3:0` mesmo após spawn local-summarizer.
> Precisa de validation sistemático para confirmar fix.
>
> **Scope**: 1 sessão CC autonomous validation ~30-45 min. READ-ONLY (zero code changes).
> Output: relatório PASS/FAIL por cada gate.

---

## Master prompt — cola no CC (qualquer sessão fresh, WSL2 ideal)

```
Wave 19 Validation Live Test — verify Day 4.1 token-tracker honesty fix is live.

Goal: confirm this CC session shows T0 tokens > 0 in statusline AFTER local-summarizer spawns, and that Stop digest TOKENS BY TIER is populated with real Ollama tokens.

PRE-FLIGHT:
- Sessão CC fresh em /home/paulo (WSL2 Ubuntu, Claude Code v2.1.165, Opus 4.8)
- Day 4.1 hot-fix PR #107 merged to dev (commit 8fd3da2)
- Canonical edits em ~/frugal/tools/router/: statusline-multi.js + providers/ollama-api.js + ollama_call.sh
- Runtime path ~/.claude/tools/router/ pode estar stale — needs /mooter-update

VALIDATION SEQUENCE (8 steps, ~30-45 min autonomous):

STEP 1 — Pull dev branch (Wave 19 lives em dev, NÃO em main ainda):
  cd ~/frugal && git fetch origin && git checkout dev && git pull origin dev
  Verify HEAD: git log --oneline -3 → should show f5c07e7 + 8fd3da2 + (107 merge) Day 4.1
  Report current HEAD commit.

STEP 2 — Sync canonical → runtime via /mooter-update skill:
  Run skill /mooter-update (será no Claude Code)
  After completion, verify which files updated:
    ls -la ~/.claude/tools/router/
    grep -c "trackCall" ~/.claude/tools/router/providers/ollama-api.js
    grep -c "trackCall\|token_tracker" ~/.claude/tools/router/ollama_call.sh 2>/dev/null
    grep -c "T0.*T1.*T2.*T3" ~/.claude/tools/router/statusline-multi.js
  Report counts per file. Each should be > 0 if Day 4.1 sync succeeded.

STEP 3 — Verify sessionId propagation:
  echo "CLAUDE_SESSION_ID=$CLAUDE_SESSION_ID" via bash
  Report whether env var is set or empty.
  If empty: Day 4.1 caveat #2 active — bash subagent T0 will cache to "unknown" session file.
  If set: T0 cache writes to /tmp/mooter-tokens-<id>.json correctly.

STEP 4 — Pre-test snapshot:
  ls -la /tmp/mooter-tokens-*.json 2>/dev/null OR echo "no cache files yet"
  Initial statusline state: confirm 🪙 T0:0 · T1:0 · T2:0 · T3:N (N varies)

STEP 5 — Trigger 3 local-summarizer spawns:
  Send 3 prompts that delegate to local-summarizer:
    Prompt 1: "resume o ficheiro /etc/os-release em 3 linhas"
    Prompt 2: "resume o ficheiro /etc/lsb-release em 3 linhas"
    Prompt 3: "compara /etc/hostname e /etc/hosts em 3 bullets"
  
  Após CADA prompt completar (wait for "Done · N tokens"):
    a) Read statusline current state (visible) — note T0 value
    b) ls -la /tmp/mooter-tokens-*.json — cache file path
    c) cat /tmp/mooter-tokens-<your-session>.json — show JSON contents
  
  Expected progression:
    After prompt 1: T0 tokens > 0 (maybe ~1.5k), calls=1
    After prompt 2: T0 tokens grow, calls=2
    After prompt 3: T0 tokens grow, calls=3

STEP 6 — Inspect decisions_v2 (Day 3 feature):
  mooter trail --calls
  mooter trail --calls --json
  Verify output has 3 entries (or N) with tier=T0, llm=qwen3:30b, tokens_in>0, tokens_out>0, reason=classify_score or similar.

STEP 7 — Render Stop session report (Day 4):
  /quit (or graceful exit)
  
  Capture the Stop digest output that appears in terminal.
  Verify structure:
    🐮 Mooter session report — Xm Ys
    
    TOKENS BY TIER
    T0 (local ollama qwen3:30b)   N tokens · 3 calls · $0.00     ← VERIFY N > 0
    T1 (haiku-4-5)                0 tokens · 0 calls · $0.00
    T2 (sonnet-4-6)               0 tokens · 0 calls · $0.00
    T3 (opus-4-7)                 M tokens · K calls · $X.XX
    
    CHOICE REASONS
    3× T0 → classify_score>0.80 (delegated to local-summarizer)
    Kx T3 → arch_decision / Paulo override
    
    HARDWARE STATE
    Model: qwen3:30b · Quantization Q4_K_M
    Adapter: baseline · trained on N decisions
    GPU peak: RTX 4090 · X% VRAM peak
    
    HERD
    local-summarizer × 3 · avg Xs · peak concurrent: 1
    
    SAVINGS
    Total saved vs all-Opus: $X.XX (Y% reduction)
    Total spent: $X.XX

STEP 8 — Report PASS/FAIL per gate:
  Write findings to docs/strategy/WAVE19_DAY41_VALIDATION_LIVE_RESULTS.md with:
  
  PRE-FLIGHT:
    [ ] HEAD commit on ~/frugal dev: ___________
    [ ] /mooter-update synced: <list of files updated>
    [ ] CLAUDE_SESSION_ID propagated: SET / EMPTY
    [ ] Initial cache state: existing files (list)
  
  GATES:
    [ ] G1 — Statusline 🪙 chip shows T0 > 0 after spawn: PASS / FAIL (value seen: ____)
    [ ] G2 — Cache file /tmp/mooter-tokens-*.json contains T0 entries: PASS / FAIL (paste JSON)
    [ ] G3 — mooter trail --calls shows T0 entries with real tokens: PASS / FAIL (paste output)
    [ ] G4 — Stop digest TOKENS BY TIER row T0 has N > 0 and calls > 0: PASS / FAIL (paste output)
    [ ] G5 — Stop digest CHOICE REASONS includes T0 → classify_score: PASS / FAIL
    [ ] G6 — Stop digest HARDWARE STATE shows Q4_K_M + adapter info: PASS / FAIL
    [ ] G7 — Stop digest HERD shows local-summarizer × 3: PASS / FAIL
    [ ] G8 — Stop digest SAVINGS shows non-zero saved $: PASS / FAIL
  
  HONEST VERDICT:
    Number PASS: __ / 8
    Number FAIL: __ / 8
    
  If any FAIL: 
    - Document exact symptom + file paths + grep output
    - Recommend Wave 19 Day 4.2 follow-up scope
  
  If all PASS:
    - Wave 19 verified end-to-end LIVE in real session
    - Ready for prod promote (PR #106 unblocked)

NON-NEGOTIABLES:
  - READ-ONLY (zero code changes; this is validation only)
  - Document everything (cat outputs, grep results, file paths)
  - HONEST verdict — if T0 still 0 after sync + spawns, say so clearly

Cost target: ~30-45 min CC autonomous.

Report final to Paulo via summary at session end + WAVE19_DAY41_VALIDATION_LIVE_RESULTS.md file.
```

---

## Como usar

1. **Numa sessão CC fresh** (Linux WSL2 ou container Docker — NÃO a sessão Windows que está a rebase #106)
2. **Cola o master prompt acima** (sem o cabeçalho deste doc)
3. CC executa autonomous ~30-45 min
4. Tu recebes report final + ficheiro `WAVE19_DAY41_VALIDATION_LIVE_RESULTS.md` em docs/strategy/

---

## Expected outcome

### Se all PASS

- Wave 19 fix está genuinamente live
- PR #106 promote prod GO
- Friends-launch GO
- Tu vês T0 tokens reais a aparecer nos teus prompts daqui em diante

### Se G2 ou G4 FAIL (T0 cache não popula)

- Caveat #2 confirmado em campo — `CLAUDE_SESSION_ID` não está a propagar para bash subagent
- Cache file vai para `mooter-tokens-unknown.json`
- Day 4.2 follow-up: fix sessionId propagation OR fallback "use latest cache file" no statusline reader

### Se G1 FAIL (statusline T0 stays 0)

- Day 4.1 fix display não está active em runtime
- /mooter-update não copiou statusline-multi.js (or skill broken)
- Day 4.2 follow-up: verify /mooter-update skill source + diff

---

**Composed by Cowork, 2026-06-05 night. Validation master prompt to confirm Day 4.1
fix is live in actual session. ~30-45 min CC autonomous. Output PASS/FAIL per 8
gates + recommendations for Day 4.2 if needed.**
