# WAVE 33.5 — HISTORIC: Sessions Orchestrator + Spawn Agents Default + Security Framework + Install Wizard 2026

**Sequência:** Wave 33 Ultimate SHIPPED → **Wave 33.5 Historic**
**Tag esperada:** `v1.21.1-historic-spawn-orchestrator`
**Estimate:** 12-16h CC autonomous (ultracode + dangerous)
**Owner:** Paulo (CC executor) · doutrina T0/T1/T2/T3 + scratchpad activo · classify.js sha INTACT obrigatório
**Date kickoff:** quando Wave 33 ship

> **Este é o ship que separa Mooter dos outros 2026. Por isso "Historic".**
>
> Mooter deixa de ser router invisível para ser **router + orchestrator local-first com spawn de agents por default + 4 layers segurança nativos + wizard install state-of-the-art**. Posicionamento muda de "tool que poupa $$$" para **"infra histórica para vibe coding 2026: o único orchestrator local-first que spawna agents seguros, observa todas sessões, prevê quota, e ensina-se a si mesmo enquanto trabalhas"**.

---

## §1 Por que esta wave é HISTORIC (a verdade nua)

### Decisão estratégica Paulo 2026-06-08

"Spawn agents por default" — Mooter passa de **observer** (Wave 33 actual) para **orchestrator full** (Wave 33.5+). Local-first faz isto possível: zero API rate-limits Anthropic para spawn, Ollama free, Pastor learning agregado.

### 8 trunfos consolidados (positioning oficial)

| Trunfo | Concretização técnica | Por que é diferenciador 2026 |
|---|---|---|
| **1. Estratégia** | Local-first + cross-session intelligence + Pastor cross-session learning | Composio/Conductor/Codex são cloud-only |
| **2. Metodologia** | 16 layers V5 + classify.js sha intact 12+ waves + final-reviewer Opus gate | Doctrine vencedora documentada |
| **3. Segurança** | 4 mandatory layers (network egress, filesystem, secrets, config) + bubblewrap/Seatbelt + worktree isolation | CVE-2025-59528 (Antigravity escape) prova isto importa |
| **4. UX/UI** | Intent-based primary (chat input first) + Ralph TUI + Zellij floating panes + adaptive statusline | +27% first-week retention vs dashboard-first |
| **5. Banco de dados estruturados** | SQLite local schema versionado 17 migrations + D1 hub federated (k-anon ≥50) | Privacy-first com structure |
| **6. Rotas bem feitas** | 7 hub endpoints + 12 MCP tools + CLI 50+ comandos + 12 slash commands | Surface area documentado + tested |
| **7. Transparência** | Inline token tracker + statusline real-time + bash command commentary + workflow watch TUI | Cada acção visível, zero black-box |
| **8. Statusline em tempo real** | UserPromptSubmit hook + 4 modes (legacy/compact/full/didactic) + ≤10ms render budget | Quota awareness segundo a segundo |

### Posicionamento competitivo 2026-06-08

| Tool | Spawn agents | Local-first | Cross-session $ | 5h quota forecast | Pastor learning | 4-layer sandbox | Intent-based UX | Wizard 2026 | Multiplexer plugins |
|---|---|---|---|---|---|---|---|---|---|
| Composio AO | ✅ cloud | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | 🟡 | ❌ |
| Conductor (Melty) | ✅ | ❌ | ❌ | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ |
| Claude Squad | ✅ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ |
| Cursor Bg Agents | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | N/A |
| Anthropic Agent Teams | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | 🟡 | 🟡 | 🟡 |
| OpenAI Codex cloud | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Antigravity | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ CVE'd | 🟡 | 🟡 | ❌ |
| Termdock | ❌ | ✅ | ❌ | ❌ | ❌ | 🟡 | ❌ | ❌ | ✅ |
| **Mooter Wave 33.5+** | **✅ default** | **✅** | **✅** | **✅** | **✅** | **✅** | **✅** | **✅** | **✅** |

**Conclusão:** Mooter é o ÚNICO tool 2026 que faz TODAS as 9 dimensões em simultâneo. **Historic.**

---

## §2 Cabeçalho operacional

| Item | Valor |
|---|---|
| Branch base | `main @ <wave33-ship-commit>` |
| Branch feature | `wave33_5-historic` |
| Tag pré-merge | ❌ NÃO criar |
| Tag pós-merge | `v1.21.1-historic-spawn-orchestrator` apontando para main HEAD final |
| Worker canónico | `wrangler.mooter.toml` (Worker `mooter-hub`) |
| classify.js sha | `7b01eb86…87762` **INTACT obrigatório** (13+ waves consecutive) |
| Wave 28-33 packages | **INTOCADOS** — apenas estender via novos sub-packages |
| Doutrina | Honest > forced. Day 0 recon obrigatório. final-reviewer Opus gate antes merge. Tag DEPOIS de merge. |
| Anthropic quota | Spread T0/T1 onde possível; Block B (spawn) precisa de T3 inicial, depois local execution |

---

## §3 Day 0 honest recon (~1h obrigatório antes de qualquer commit)

1. **Re-validar classify.js sha INTACT** — `git log --all --diff-filter=M -- packages/router/src/classify.js` deve estar vazio desde Wave 11.
2. **Wave 33 packages auditoria** — `ls packages/` deve mostrar @mooter/turboquant-backend (Block B Wave 33), @mooter/vllm-backend (Wave 32 + Wave 33 EAGLE-3), @mooter/minimax-watcher (Wave 33). Wave 33.5 NÃO toca neles.
3. **Verificar bubblewrap disponível** — `which bwrap` em WSL2 Linux. Se ausente, install instructions.
4. **Verificar Apple Seatbelt** (preparação macOS futura) — `which sandbox-exec`. Document.
5. **Auditar `~/.claude/settings.json` hooks actuais** — listar SessionStart, UserPromptSubmit, SubagentStop hooks já registados (Mooter pode ter colidir).
6. **CC Agent Teams API status** — verificar Anthropic CC v2.1.168+ se tem plugin API exposta para sidebar widgets. `claude --help` + `claude plugins list` se existir.
7. **Worktree status workspace** — `git worktree list` actual state.
8. **Web search latest:** Inquirer.js (CLI prompts), Chalk (colors), Ora (spinners), Cliffy (Deno equivalent) latest stable versions 2026-06.
9. **Web search bubblewrap latest WSL2 install instructions** + Apple Seatbelt sandbox-exec deprecation status (Apple sinalizou EOL futuro — research current state).
10. **Verificar Mooter actual `mooter spawn` cmd existe ou não** — `grep -r "spawn" packages/cli/src/commands/`.

**Output Day 0:** `docs/strategy/WAVE33_5_DAY0_RECON.md` com findings 10 pontos + recommendations.

---

## §4 Blocks (7 blocks ordenados)

### BLOCK A — Sessions Orchestrator MVP (~3h, T2 dominant)

**Pré-req:** Wave 33 SHIPPED. Reuse Sessions Orchestrator Design Spec v1.

**Package:** `@mooter/sessions-orchestrator`

**A.1 — Sessions watcher daemon**
- Poll `~/.claude/projects/**/sessions/*.jsonl` cada 5s (debounced)
- Poll `git worktree list --porcelain` (cached 30s)
- Output: `~/.mooter/sessions_state.json` (cache local)

**A.2 — CLI commands**
```bash
mooter sessions list              # tabela aged + tier + savings
mooter sessions watch             # Ralph-style TUI live
mooter sessions show <id>         # detail
mooter sessions diff <id1> <id2>  # compare
mooter sessions quota             # 5h forecast
mooter sessions worktrees         # git worktree mapping
mooter sessions kill <id> --graceful  # signal CC termination
mooter sessions focus <id>        # print cmd to switch terminal
mooter sessions export            # GDPR export
```

**A.3 — Ralph-style TUI (sessions watch)**
- Reuse Wave 32 E Ralph Mission Control patterns
- 1 widget per session card (border + glyph state)
- Global quota forecast widget bottom
- Cross-session $ savings widget
- Pastor agg signal widget
- Keybinds: ↑/↓ navigate, Enter focus, k kill, w worktrees, q quit, ? help

**A.4 — 4 MCP tools novos**
- `mooter_sessions_list`
- `mooter_sessions_quota_forecast`
- `mooter_sessions_handoff`
- `mooter_sessions_pastor_aggregate`

**Total MCP tools registry: 12 (Wave 32) + 4 = 16**

**A.5 — Cross-session Pastor aggregation**
- New module: `packages/synthesis/src/pastor/cross_session_aggregator.ts`
- Merge decisions across all local sessions
- Output enriched LORAUTER suggestions

**A.6 — Workflow visibility chip statusline 🔥 (Paulo request 2026-06-08)**
- New statusline chip: `🔄 wf-{id} 3/7 agents 💠💠💠○○○○ · 4.2k tk`
- Render quando Wave 28 Workflow Engine activo
- Show: workflow ID, progress dots (similar a CC dynamic workflow agents), token count per workflow
- Source: `~/.mooter/workflows/{id}/state.json` (already shipped Wave 28)
- Animation: progress dots cycle every 500ms
- Hide: `mooter quiet --hide-workflow-chip`
- Budget impact: medir antes/depois, target ≤2ms add

**A.7 — Terminal/Worktree name chip statusline 🔥 (Paulo request 2026-06-08)**
- New statusline chip: `(wave33-ultimate)` between session timer and tier
- Source: detect terminal context
  - First try: `$TMUX_PANE_TITLE` (tmux)
  - Then: `$ZELLIJ_SESSION_NAME` (Zellij)
  - Then: `$WEZTERM_PANE` (WezTerm)
  - Fallback: git worktree name from `git worktree list` matched against `process.cwd()`
  - Fallback 2: directory basename
- Cache by PID for performance (lookup once per session)
- Hide: `mooter quiet --hide-terminal-name`
- Customisable: `mooter terminal label <name>` overrides

**A.8 — Sessions watch enriched with workflow + terminal context**
- TUI now shows per-session: terminal name + active workflow ID + workflow progress
- Aggregate: cross-session workflow handoff visualization

**Tier sugerido:** T2 (Sonnet) majoritariamente, T3 (Opus) para Pastor aggregator + workflow chip integration.

### BLOCK B — Spawn Agents Default (~4h, T3 dominant) 🔥

**Esta é a peça HISTORIC. Mooter spawna agents local-first por DEFAULT.**

**Package:** `@mooter/spawn-orchestrator`

**B.1 — `mooter spawn <task>` CLI**
```bash
# Default: local-first spawn em worktree isolado + sandbox
mooter spawn "fix bug in landing/components/Hero.tsx"

# Override modes
mooter spawn --cloud   "complex refactor"          # forces cloud T3
mooter spawn --local   "rename variable"           # forces Ollama T0
mooter spawn --no-sandbox  (REJECTED — security)   # not supported

# Multi-spawn
mooter spawn --batch <file.txt>                    # one task per line
mooter spawn --interactive                         # wizard

# Lifecycle
mooter spawn list                                   # active spawns
mooter spawn watch                                  # Ralph TUI for spawns
mooter spawn kill <id> --graceful
mooter spawn logs <id> --tail
mooter spawn artifacts <id>                         # output artifacts
```

**B.2 — Spawn pipeline (default local-first)**
1. Parse intent: `classify.js` decide tier T0/T1/T2/T3 baseado em prompt
2. Create worktree: `git worktree add ~/.mooter/spawns/<spawn-id> <branch>`
3. Setup sandbox: bubblewrap (Linux/WSL2) ou Seatbelt (macOS) com 4 layers
4. Spawn process: CC subprocess OR Ollama subprocess OR Haiku/Sonnet/Opus subprocess
5. Watch state: write to `~/.mooter/spawns/<id>/state.json`
6. Stream output: `~/.mooter/spawns/<id>/output.log`
7. Workflow handoff support: artifacts via Wave 28 engine
8. On completion: graceful shutdown, optional auto-merge to main if green

**B.3 — Sandbox integration (4 mandatory layers)**

```ts
// packages/spawn-orchestrator/src/sandbox/sandbox.ts
interface SandboxConfig {
  // Layer 1: Network egress
  allowedDomains: string[];      // ['api.anthropic.com', 'ollama-local']
  blockedDomains: string[];      // ['*']
  
  // Layer 2: Filesystem boundaries
  allowedPaths: string[];         // [worktreePath, '/tmp/spawn-{id}']
  readOnlyPaths: string[];        // ['/etc', '/usr']
  blockedPaths: string[];         // ['~/.ssh', '~/.gnupg', '/root']
  
  // Layer 3: Secrets scoping
  envWhitelist: string[];         // ['NODE_ENV', 'CLAUDE_PROJECT_DIR']
  envBlacklist: string[];         // ['ANTHROPIC_API_KEY' unless tier requires]
  
  // Layer 4: Config file protection
  configReadOnly: string[];       // ['~/.claude/settings.json', '~/.mooter/preferences.json']
}
```

Implementations:
- `linux_bubblewrap.ts` — `bwrap --bind ... --ro-bind ... --unshare-net ...`
- `macos_seatbelt.ts` — `sandbox-exec -f <profile.sb> ...`
- `windows_native.ts` — Windows Job Objects + restricted token (research)

**B.4 — Spawn safety smoke tests**
- Spawn em worktree isolado → confirm no access to parent worktree files
- Spawn com network egress allowed `api.anthropic.com` apenas → confirm SSH key não vaza
- Spawn em CVE-2025-59528 scenario → confirm Mooter sandbox bloqueia escape

**B.5 — Spawn statusline integration**
- New chip: `🐝 3 spawns active · $0.02 total`
- Hide: `mooter quiet --hide-spawns`

**Tier sugerido:** T3 (Opus) para arquitectura sandbox + spawn lifecycle. Subsequent calls T2.

### BLOCK C — Install Wizard State-of-the-Art (~2h, T1 dominant)

**Package:** `@mooter/install-wizard`

**C.1 — Install entrypoint**
```bash
curl -fsSL install.mooter.ai | bash
# OR
npx @mooter/cli init
# OR
mooter init
```

Todos abrem o wizard interactivo.

**C.2 — Wizard flow (Inquirer.js + Chalk + Ora)**

```
🐮 Mooter Install Wizard v2026

[1/8] Welcome! What's your name? _________________

[2/8] What's your main use case?
  > ◉ Solo developer (1-3 sessions parallel)
    ◯ Team developer (4-8 sessions)
    ◯ Enterprise (custom)
    ◯ Just exploring

[3/8] Which LLM providers do you have access to?
  ✓ Anthropic Claude (auto-detected from CC)
  ✓ Ollama (auto-detected, running localhost:11434)
    Codex (not detected, configure later)
    OpenAI (not detected)
    Custom endpoint
    
[4/8] What's your monthly $ budget cap?
  > ◉ $20/month (typical solo)
    ◯ $50/month
    ◯ $200/month
    ◯ No cap
    
[5/8] Privacy preferences:
  > ✓ Local-first (everything stays on device)
  > ☐ Federated wisdom (k-anon ≥50, opt-in)
  > ☐ Cloud backup (encrypted)

[6/8] Statusline mode:
  Preview each by hovering:
  > ◯ Legacy (byte-identical Wave 31, zero risk)
    ◉ Compact (recommended for daily use)
    ◯ Full (all chips visible)
    ◯ Didactic (learning mode with explanations)

[7/8] Spawn agents default:
  > ◉ Local-first (Ollama for T0/T1, Cloud T2/T3 if needed)
    ◯ Always cloud (CC subprocess)
    ◯ Always local (Ollama only)
  Sandbox security: 4-layer (recommended)

[8/8] Multiplexer integration:
  ✓ Detect Zellij (found at /usr/bin/zellij)
  ✓ Install Zellij plugin? [Y/n]
    Detect tmux (not found)
    Detect WezTerm (found at /usr/local/bin/wezterm)
  ✓ Install WezTerm Lua snippet? [Y/n]

⏳ Installing Mooter...
  ✓ classify.js INTACT verified (sha 7b01eb86...)
  ✓ Local SQLite migrations 001-017 applied
  ✓ Pastor v2 LORAUTER baseline trained (264 decisions)
  ✓ 6 LoRA adapters registered
  ✓ Zellij plugin installed
  ✓ WezTerm Lua snippet installed
  ✓ Statusline mode = compact
  ✓ Spawn config saved
  ✓ Health check passed

🐮 Mooter v1.21.1-historic ready. Type `mooter help` to start.

Quick wins to try:
  mooter dashboard            # see your live state
  mooter sessions watch       # cross-session intelligence
  mooter spawn "fix bug X"    # local-first agent spawn
  mooter explain statusline   # learn the chips
```

**C.3 — Health check**
- classify.js sha verified
- All migrations applied
- Pastor state valid
- Quota check Anthropic + Ollama reachable

**C.4 — Uninstall path**
- `mooter uninstall --keep-data` (default safe)
- `mooter uninstall --full` (GDPR delete-all wrapper)

**Tier sugerido:** T1 (Haiku) — UX flow é simples mas precisa polished.

### BLOCK D — Security Framework Documentation (~1.5h, T2 dominant)

**D.1 — Security primer doc**
- `docs/security/THREAT_MODEL.md` — adversaries, attack vectors, mitigations
- `docs/security/SANDBOX_LAYERS.md` — 4 layers detailed
- `docs/security/CVE_RESPONSE.md` — how Mooter handles security disclosures

**D.2 — `mooter security audit` CLI**
```bash
mooter security audit                    # interactive 4-layer check
mooter security audit --json             # machine-readable
mooter security audit --fix              # interactive fixer
```

Output:
```
🛡️ Mooter Security Audit · 4 layers

Layer 1: Network egress       ✅ PASS — bubblewrap configured
Layer 2: Filesystem boundary  ✅ PASS — worktree isolation active
Layer 3: Secrets scoping      ⚠️  WARN — ANTHROPIC_API_KEY in env
Layer 4: Config protection    ✅ PASS — read-only enforced

1 warning. Run `mooter security audit --fix` to remediate.
```

**D.3 — `mooter security spawn-test`**
- Synthetic CVE-2025-59528 simulation: try sandbox escape, confirm blocked
- Output: PASS/FAIL with diagnostic

**Tier sugerido:** T2 (Sonnet) — security context requires care.

### BLOCK E — Intent-Based UX (chat input first) (~1.5h, T2 dominant)

**Decisão estratégica:** Research mostra +27% retention. Mooter passa a ter intent-first entry.

**E.1 — `mooter` (sem args) abre intent prompt**
```
🐮 Mooter v1.21.1 · session 0h00m · ☁ Claude Max 47% / 5h

What do you want to do?
> _

(Type intent, or press Tab for command palette)
```

Submit:
- "fix bug in Hero.tsx" → invoke `mooter spawn "fix bug in Hero.tsx"`
- "show me my sessions" → invoke `mooter sessions watch`
- "how much did I save today" → invoke `mooter savings today`
- "install Zellij plugin" → invoke `mooter sessions plugin install zellij`

**E.2 — Intent → command resolver**
- Use local Ollama qwen2.5:3b para intent classification (fast, free)
- Fallback to keyword matching se Ollama unavailable
- Always show resolved cmd antes de executar (transparency principle)

**E.3 — Command palette (Tab key)**
- Visual list of 50+ commands grouped por category
- Fuzzy search
- Recent commands history

**Tier sugerido:** T2 (Sonnet) para intent resolver design.

### BLOCK F — Marketing artifacts (~1.5h, T1 dominant)

**F.1 — Side-by-side terminal comparison demo (asciinema)**
- Script: `scripts/marketing/2terminals_demo.sh`
- Terminal A (without Mooter): user runs Claude Code, $$ burns, statusline mostra cost growing
- Terminal B (with Mooter): same user, same task, Mooter routes T0/T1 first, statusline mostra 47% saved real-time
- Output: asciinema cast + animated SVG snippet for landing

**F.2 — Tweet thread `TWEET_THREAD_WAVE33_5.md`**
Tweet 1: "Mooter v1.21.1 ships today. Spawn agents safely, locally, by default."
Tweet 2: 9-feature comparison table (Mooter only does all)
Tweet 3: 2-terminal demo video link
Tweet 4: Install one-liner + GitHub
Tweet 5: Friends-launch CTA

**F.3 — Blog post `BLOG_POST_WAVE33_5.md` (~1500 words)**
Headers:
1. Why we built spawn-default (the philosophical pivot)
2. The 8 trunfos consolidated
3. Security-first or it's not local-first (CVE-2025-59528 lesson)
4. Intent over hierarchy (+27% retention data)
5. The comparison nobody can ignore (9 dimensions)
6. Install + first 5 minutes

**F.4 — Update `FRIENDS_LAUNCH_DMS_v9.md`**
- 3 versions (PT-PT/PT-BR/EN) com Wave 33.5 historic angle
- New short DM: "Mooter v1.21.1 = único orchestrator 2026 que spawna agents safely + local-first + saves you 47% across all sessions. Install em 30s. Tens 5 min?"

**Tier sugerido:** T1 (Haiku) — copywriting + script generation.

### BLOCK H — Worktree Conductor (orchestration entre terminais) 🔥 (Paulo request 2026-06-08, ~2h, T3 dominant)

**Esta peça resolve dor real:** múltiplos terminais com worktrees diferentes podem entrar em race conditions (dois fazem `git push` ao mesmo tempo, dois escrevem Notion concurrent, dois deploy hub no mesmo segundo). **Conductor é o orchestrator local-first que coordena tudo.**

**Package:** `@mooter/worktree-conductor`

**H.1 — Lock manager filesystem-based**

Lock files em `~/.mooter/orchestration/locks/`:
- `git-{repo-hash}.lock` — git operations per repo
- `notion.lock` — Notion API writes
- `deploy-hub.lock` — hub deployments
- `tag.lock` — git tag operations (race condition Wave 21 lesson)
- `npm-publish.lock` — npm publishing

Each lock file contains:
```json
{
  "acquired_by": "session-id-abc123",
  "terminal_name": "wave33-ultimate",
  "intent": "git push origin main",
  "acquired_at": "2026-06-08T06:14:32Z",
  "ttl_seconds": 60,
  "pid": 12345
}
```

**H.2 — Heartbeat protocol**

Each Mooter-aware session writes heartbeat every 5s to `~/.mooter/orchestration/heartbeats/{session-id}.json`:
```json
{
  "session_id": "abc123",
  "terminal_name": "wave33-ultimate",
  "worktree_path": "/home/paulo/frugal",
  "branch": "wave33-ultimate",
  "intent": "running CC block B",
  "last_heartbeat": "2026-06-08T06:14:32Z",
  "active_locks": ["git-frugal-hash"],
  "pending_intents": ["push", "tag", "notion-write"]
}
```

Stale heartbeats (>30s old) are reaped automatically.

**H.3 — Conductor CLI**

```bash
mooter conductor status              # show all sessions + locks + queue
mooter conductor lock <resource>     # acquire lock (waits if held)
mooter conductor lock <resource> --timeout 60s
mooter conductor unlock <resource>   # release explicitly
mooter conductor queue <intent>      # add to global queue for serial execution
mooter conductor wait <other-session-id> "git-push"  # wait for other to finish

# Inspection
mooter conductor heartbeats          # all live sessions
mooter conductor locks               # all active locks
mooter conductor queue list          # global queue state
mooter conductor history --tail 50   # recent operations log
```

**H.4 — Hooks integration**

Auto-acquire locks via CC hooks (registered in `~/.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "mooter conductor auto-lock --tool=Bash --cmd=$CLAUDE_TOOL_INPUT_CMD"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "command": "mooter conductor auto-unlock --tool=Bash"
      }
    ]
  }
}
```

Auto-lock detects intent:
- `git push` → acquires `git-{repo-hash}.lock`
- `git tag` → acquires `tag.lock`
- `npx wrangler deploy` → acquires `deploy-hub.lock`
- Notion MCP write → acquires `notion.lock`

**H.5 — Conflict resolution UX**

When session B tries to acquire lock held by session A:
```
🐮 Mooter Conductor

Lock 'git-frugal-hash' held by session abc123 ('wave33-ultimate')
Intent: 'git push origin main' (acquired 12s ago, TTL 48s)

Options:
  [w] Wait for release (recommended)
  [s] See session details
  [f] Force release (only if confident A is dead)
  [c] Cancel my intent

>
```

**H.6 — Cross-session intent queue (Sequencer)**

For operations that must be SERIAL across sessions:
- Tag bumps (only one session tags v1.X at a time)
- Hub deploys (avoid mid-deploy race)
- Notion mass-writes (rate limit aware)

```bash
mooter conductor queue add "git tag v1.21.1" --session=abc123
mooter conductor queue add "git tag v1.21.2" --session=def456

mooter conductor queue list
# Order:
#   1. abc123 — git tag v1.21.1 (waiting on git-lock)
#   2. def456 — git tag v1.21.2 (queued)
```

**H.7 — Conductor dashboard widget (sessions watch enriched)**

Sessions Watch TUI (Block A) now includes a Conductor panel:
```
┌─ Conductor ──────────────────────────────────────────┐
│ Active locks: 1                                       │
│   🔒 git-frugal-hash (abc123 'wave33-ultimate', 12s)  │
│                                                       │
│ Pending queue: 2                                      │
│   1. def456 (wave34-exp) — wants git-lock             │
│   2. ghi789 (hotfix)     — wants git-lock             │
│                                                       │
│ Last 10 ops:                                          │
│   06:14:32 abc123 ACQUIRED git-frugal-hash            │
│   06:14:28 abc123 RELEASED notion-lock                │
│   06:14:25 def456 QUEUED git-tag                      │
│   ...                                                 │
└───────────────────────────────────────────────────────┘
```

**H.8 — Safety: auto-recovery from dead sessions**

If session holds lock but heartbeat stale >30s:
- Auto-mark stale
- Warn other sessions: "Lock X held by stale session abc123 (no heartbeat 47s). Release? [y/N]"
- Never auto-release without user confirm (avoid data loss)

**Tier sugerido:** T3 (Opus) — concurrency design + race condition prevention.

### BLOCK G — Landing infrastructure prep (~1h, T1 dominant)

**G.1 — Routes preparation em landing/app/**
- `/spawn` — info page intent-based UX
- `/sessions` — info page cross-session intelligence
- `/security` — 4-layer sandbox explainer
- `/install` — interactive install wizard preview
- `/compare` — comparison table page (vs Composio AO/Anthropic Agent Teams/Cursor/Codex)
- `/changelog` — v1.21.1 entry

**G.2 — JSON spec para CC Design consumir**
- `landing/design-spec/wave33_5_pages.json` — feature flags + content sections
- CC Design consome este JSON via fetch → renderiza

**G.3 — Landing actual sem breaking**
- NÃO mexer em landing actual.
- Apenas adicionar rotas novas opcionais com routing detection.

**Tier sugerido:** T1 (Haiku) — Next.js scaffolding.

---

## §5 Ordem de execução recomendada (8 blocks, ~14-18h)

```
Day 0 (~1h)           Honest recon 10 pontos
                      Output: WAVE33_5_DAY0_RECON.md

Day 1 (~4-5h)         Block A (Sessions Orchestrator MVP — 8 sub-features)
                      A.1-A.5 base + A.6 workflow chip + A.7 terminal name chip + A.8 sessions watch enriched
                      smoke local cada A.X
                      
Day 2 (~4-5h)         Block B (Spawn Agents Default)
                      T3 architecture + sandbox layers
                      smoke synthetic CVE simulation

Day 3 (~2h)           Block H (Worktree Conductor — orchestration locks)
                      Lock manager + heartbeat + queue + auto-recovery
                      
Day 4 (~2-3h)         Block C (Install Wizard) + Block D (Security framework)
                      Inquirer.js + Chalk + Ora
                      Security docs + audit cmd

Day 5 (~2-3h)         Block E (Intent-based UX) + Block F (Marketing) + Block G (Landing prep)
                      Intent resolver com Ollama
                      Asciinema demo
                      Blog + tweets + DMs v9
                      Landing routes scaffolding

Pre-merge (~1h)       final-reviewer Opus gate
                      classify.js sha re-verify
                      Bundle esbuild clean (<800 KB target — historic bigger ainda com Block H)
                      Wave 28-33 INTOCADOS verified
                      PR feature → main
                      Tag v1.21.1-historic-spawn-orchestrator
                      Notion sub-page
                      MEMORY.md update + SYNC.md update
```

---

## §6 Checklist pré-merge

### Block A — Sessions Orchestrator
- [ ] `@mooter/sessions-orchestrator` package criado, 9 CLI cmds funcionais
- [ ] Ralph TUI `mooter sessions watch` renderiza correctamente
- [ ] 4 MCP tools novos (total 16)
- [ ] Cross-session Pastor aggregator working
- [ ] **A.6 Workflow visibility chip** statusline aparece quando Wave 28 workflow activo (with agents + progress dots + token count)
- [ ] **A.7 Terminal/Worktree name chip** statusline shows `(wave33-ultimate)` ou similar (auto-detect tmux/Zellij/WezTerm/git worktree fallback)
- [ ] **A.8 Sessions watch enriched** with workflow + terminal context per session card

### Block H — Worktree Conductor (orchestration entre terminais)
- [ ] `@mooter/worktree-conductor` package criado
- [ ] Lock manager filesystem-based (`~/.mooter/orchestration/locks/`)
- [ ] Heartbeat protocol (5s polls, 30s stale threshold)
- [ ] `mooter conductor` CLI (10+ sub-cmds: status/lock/unlock/queue/wait/heartbeats/locks/history)
- [ ] Hooks integration (PreToolUse + PostToolUse auto-lock detection)
- [ ] Conflict resolution UX (interactive prompt when lock held)
- [ ] Cross-session intent queue (Sequencer)
- [ ] Conductor dashboard widget em sessions watch TUI
- [ ] Auto-recovery from dead sessions (heartbeat stale + user confirm)
- [ ] Synthetic race-condition test passes (2 sessions trying simultaneous git push)

### Block B — Spawn Agents Default
- [ ] `@mooter/spawn-orchestrator` package criado
- [ ] `mooter spawn` default local-first com fallback cloud
- [ ] 4-layer sandbox active (network/fs/secrets/config)
- [ ] bubblewrap (WSL2/Linux) integration tested
- [ ] CVE-2025-59528 synthetic test PASSES (sandbox blocks escape)
- [ ] Spawn lifecycle commands (list/watch/kill/logs/artifacts)
- [ ] Statusline chip `🐝 N spawns` opt-in

### Block C — Install Wizard
- [ ] `mooter init` ou `curl install.mooter.ai | bash` open wizard
- [ ] Inquirer.js 8-step flow polished
- [ ] Auto-detect (Anthropic, Ollama, Zellij, tmux, WezTerm)
- [ ] Health check final passes all 5 checks
- [ ] Uninstall path safe (default keep-data)

### Block D — Security Framework
- [ ] `docs/security/THREAT_MODEL.md` written
- [ ] `docs/security/SANDBOX_LAYERS.md` written
- [ ] `docs/security/CVE_RESPONSE.md` written
- [ ] `mooter security audit` cmd LIVE
- [ ] `mooter security spawn-test` synthetic CVE simulation passes

### Block E — Intent-Based UX
- [ ] `mooter` (no args) opens intent prompt
- [ ] Intent → command resolver via Ollama qwen2.5:3b
- [ ] Tab key opens command palette
- [ ] Transparency: always show resolved cmd before execute

### Block F — Marketing
- [ ] Asciinema 2-terminal comparison demo recorded
- [ ] TWEET_THREAD_WAVE33_5.md (5 tweets)
- [ ] BLOG_POST_WAVE33_5.md (~1500 words)
- [ ] FRIENDS_LAUNCH_DMS_v9.md (PT-PT/PT-BR/EN)

### Block G — Landing prep
- [ ] 6 new routes scaffolded (/spawn /sessions /security /install /compare /changelog)
- [ ] `wave33_5_pages.json` design-spec consumível CC Design
- [ ] Landing actual INTOCADA (sem breaking)

### Gates universais
- [ ] classify.js sha `7b01eb86…87762` verificada **pré** + **post-merge**
- [ ] Wave 28-33 packages **INTOCADOS** verificado via `git diff --stat`
- [ ] Statusline budget ≤10ms preservado
- [ ] Bundle esbuild clean (<750 KB total — historic mais features)
- [ ] `final-reviewer` (Opus) corrido sem high severity
- [ ] Notion sub-page criada via `mooter_notion_write` MCP
- [ ] PR feature → main mergeado
- [ ] **SÓ ENTÃO** `git tag v1.21.1-historic-spawn-orchestrator <main HEAD>` + push
- [ ] Hub deploy se Block C/D mexeram hub (additive only)

---

## §7 Riscos tracked

| Risco | Severidade | Mitigação |
|---|---|---|
| Sandbox escape em produção | **CRITICAL** | 4-layer enforce + CVE synthetic test + final-reviewer security focus + threat model doc |
| bubblewrap não disponível em todos WSL2 setups | HIGH | Install instructions claras + fallback graceful (warn user, opt-in unsandboxed para edge cases REJECTED — security wins) |
| Spawn process resource exhaustion (fork bomb) | HIGH | Max concurrent spawns config (default 4), graceful kill if exceed |
| Intent resolver wrong cmd → user data loss | HIGH | Always show resolved cmd + require Enter confirm + dry-run mode default |
| Install wizard fails mid-way (network drop) | MED | Idempotent steps, resume support, rollback on critical fail |
| Statusline budget break with spawn chip | MED | Cache spawn count, refresh max 1Hz |
| Workflow chip cycles (animação) impactam ≤10ms budget | MED | Cache rendered string per second, only animate dots |
| Terminal name detection wrong (false positive Zellij/tmux) | LOW | Fallback chain (tmux → zellij → wezterm → git worktree → cwd basename), allow `mooter terminal label` override |
| Lock manager filesystem race conditions (concurrent acquire) | HIGH | Use atomic `O_CREAT|O_EXCL` flock pattern + lockfile validation |
| Heartbeat process death without cleanup | MED | Auto-reap >30s stale, user confirm before force-release |
| Conductor queue infinite blocking (deadlock) | HIGH | Max wait timeout 5min default, escalate UI prompt |
| Hooks integration breaks CC native flow | HIGH | Opt-in only, dry-run mode default, easy uninstall |
| Wave 28-33 packages get touched accidentally | MED | `git diff --stat` gate in final-reviewer |
| Security audit too noisy (many warnings) | MED | Default = quiet mode, verbose opt-in |
| Multiplexer plugin install corrupts user config | HIGH | Backup before install + dry-run preview + tested rollback |

---

## §8 O que NÃO está nesta wave

- ❌ Browser bridge SPA (`mooter.ai/sessions/live`) — Wave 34
- ❌ Zellij plugin WASM build — Wave 34
- ❌ tmux plugin TPM — Wave 34
- ❌ Federated cross-device — Wave 35
- ❌ Cowork plugin marketplace submit — Wave 35
- ❌ MCP marketplace listing — Wave 35
- ❌ Cursor/Codex compat — Wave 35+
- ❌ Anthropic CC plugin official submit — Wave 35
- ❌ macOS Seatbelt FULL implementation — Wave 35 (docs já em D)
- ❌ Windows Job Objects sandbox — Wave 36+ (research)
- ❌ Wave 28 workflow engine extensions — INTOCADO
- ❌ Wave 31 LORAUTER changes — sha intact

---

## §9 Marketing diff Wave 33 → Wave 33.5 Historic

### Tweets
- 5-tweet thread (Block F.2)
- Personal Paulo Loureiro post: "Historic" angle + 9-dim comparison

### Blog
- Substack/Medium post ~1500 words (Block F.3)
- Cross-post: Dev.to + Hacker News ("Show HN: Mooter — only local-first orchestrator with sandboxed spawn agents")
- Reddit: r/LocalLLaMA, r/ClaudeAI, r/devops

### Landing
- 6 new routes scaffolded (Block G.1) — CC Design will redesign
- Changelog v1.21.1 entry

### Friends-launch
- FRIENDS_LAUNCH_DMS_v9.md (Block F.4)
- Paulo envia 3 DMs Task #218 com historic angle

### Notion
- Sub-page Wave 33.5 Historic em Mooter HQ
- Update Mooter HQ metrics secção (8 trunfos consolidated)

---

## §10 Sources de research consultadas

### CLI Wizard 2026 best practices
- [How to Create a CLI Tool with Node.js](https://oneuptime.com/blog/post/2026-01-22-nodejs-create-cli-tool/view)
- [npm-init wizard patterns](https://docs.npmjs.com/cli/init/)
- Inquirer.js + Chalk + Ora stack (industry standard)

### AI dev tool landing 2026
- [Cursor: AI tool that happens to be an editor](https://cursor.com/)
- [Best AI Code Editors 2026](https://playcode.io/blog/best-ai-code-editors-2026)
- [Cursor vs Continue.dev 2026](https://www.lowcode.agency/blog/cursor-ai-vs-continue-dev)

### Local-first AI agent security
- [AI Agent Sandboxing Enterprise Guide 2026](https://beyondscale.tech/blog/ai-agent-sandboxing-enterprise-security-guide)
- [3 Isolation Patterns 2026](https://www.digitalapplied.com/blog/ai-agent-sandboxing-isolation-patterns-2026)
- [How to sandbox AI coding agents](https://dev.to/alanwest/how-to-sandbox-ai-coding-agents-without-crippling-them-116c)
- [Claude Code sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing)
- CVE-2025-59528 (Google Antigravity sandbox escape, CVSS 10.0)

### SaaS Dashboard UX 2026
- [SaaS Dashboard UX Patterns Complete Guide 2026](https://www.gitnexa.com/blogs/saas-dashboard-ux-patterns)
- [AI-Native SaaS UX Design Patterns 2026](https://www.technology.org/2026/04/28/the-new-ux-of-ai-native-saas-and-erp-six-design-patterns-were-shipping-in-2026/)
- Intent-based interfaces +27% first-week retention (14 products tracked)

---

## §11 Definitions of Done

**Wave 33.5 Historic is DONE when:**
1. ✅ Tag `v1.21.1-historic-spawn-orchestrator` em main
2. ✅ All 7 blocks shipped + checklist 100%
3. ✅ classify.js sha INTACT verified
4. ✅ Sandbox 4-layer synthetic CVE test passes
5. ✅ Install wizard E2E walkthrough works
6. ✅ `mooter spawn "test task"` runs locally + Ollama subprocess + 4-layer sandbox active
7. ✅ `mooter sessions watch` shows 2+ sessions live
8. ✅ Notion sub-page LIVE
9. ✅ FRIENDS_LAUNCH_DMS_v9.md ready
10. ✅ TWEET_THREAD + BLOG_POST + asciinema demo prontos
11. ✅ Landing 6 routes scaffolded
12. ✅ MEMORY.md + SYNC.md actualizados

---

## §12 Pós-Wave 33.5 next steps

- **Friends-launch real (Task #218):** Paulo envia 3 DMs com `FRIENDS_LAUNCH_DMS_v9.md`
- **Landing redesign:** Paulo lança CC Design com `LANDING_V11_HISTORIC_DESIGN_MASTERPROMPT.md`
- **Wave 34 candidate:** Zellij plugin + tmux plugin + WezTerm Lua + browser bridge
- **Wave 35 candidate:** Federated wisdom + Marketplace + Cursor/Codex compat
- **Continuous monitoring:** Mooter.ai/dashboard metrics + Pastor learning curves + security audit recurring

---

*Brief composto 2026-06-08 ~05h30 BRT pós Wave 33 brief + Sessions Orchestrator Design v1 + Paulo strategic pivot (spawn agents default). Web research 4 paralelo validou: CLI wizard stack + landing patterns + sandbox layers + intent-based UX. Day 0 recon começa próxima sessão CC — não confiar nas premissas sem validar com filesystem + web actualizada. classify.js sha intact pré-verificar. **HISTORIC.**
