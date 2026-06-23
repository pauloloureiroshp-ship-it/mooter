# Wave 2.5 Day 2 — Kickoff master prompt (Wizard hardening)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados**:
- ✅ PR #16 merged em dev (squash commit `992cf6b`)
- ✅ Day 1 Wave 2.5 fechada (statusline 🐮 + per-session isolation)
- ✅ Wizard `mooter init` existe (`packages/cli/src/commands/init.ts`, Day 6 Wave 2)
- ✅ Bug conhecido: stdin non-TTY rebenta com `ERR_USE_AFTER_CLOSE` em raw-mode
- ✅ Init.ts já tem injection seams (IO interface, fetchImpl, probe, validateAnthropic)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.5-day2-wizard-hardening` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 2**: shippar 5 sub-features num único PR para `dev`:

1. **Fix stdin non-TTY bug** — `ERR_USE_AFTER_CLOSE` em raw-mode quando pipe-mode
2. **Edge case: no Ollama** — wizard completa com clarity, T0 disabled, sem partir
3. **Edge case: no Anthropic** — wizard completa, statusline marca "no providers"
4. **Idempotency robust** — re-run 3x não duplica packs, atualiza profile, preserva consent
5. **Error message format** — padrão claro (Cause/Fix) para todos os failure paths

Cross-platform smoke continua Linux-first (Day 6 já cobriu macOS/Windows skeleton).

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** — commits selectivos
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** `tools/router/*` (Day 1 Wave 2.5 owns)
- ❌ **NÃO tocar** `packages/router/src/*` (Wave 2 days 1-6 + Wave 2.5 D1)
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md` (cross-stream)
- ❌ **NÃO commitar** docs untracked em `docs/strategy/*`
- ❌ **NÃO mudar schemas canónicos** (credentials.json, profile.json, consent.json — Day 6 Wave 2 spec)
- ❌ **NÃO breaking** os tests existentes do init (25/25 passing actualmente)
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR
- ✅ **Sanity cost $1 BLOCKER** — pode haver 1 Anthropic test call durante teste manual ($0.001), tudo o resto é local/mock
- ✅ **Notion sub-page** ao fim + SYNC.md update
- ✅ **Backward compat**: API actual de `runInit({io})` continua a funcionar

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma 992cf6b no topo (squash Day 1 Wave 2.5)
git checkout -b wave2.5-day2-wizard-hardening
```

Recon (lê antes de tocar):
- `packages/cli/src/commands/init.ts` (~600 linhas) — alvo principal
- `packages/cli/tests/init.test.ts` — testes existentes (manter passing)
- Procurar pelo `defaultIO()`, `askHidden`, `setRawMode` — onde o bug stdin está

## 3. Sub-feature 1 — Fix stdin non-TTY bug 🔴 CRITICAL

### 3.1 Root cause

O `defaultIO().askHidden` faz `inp.setRawMode(true)` para ocultar input de API key. Em pipe mode (`echo "..." | mooter init`):
- `process.stdin.isTTY === undefined`
- `setRawMode()` não existe ou throws
- Mais grave: o readline interface foi criado E o stdin já fechou → `ERR_USE_AFTER_CLOSE`

### 3.2 Fix

**Ficheiro**: `packages/cli/src/commands/init.ts`

Atualizar `defaultIO()`:

```typescript
function defaultIO(): InitIO {
  const isTTY = !!(process.stdin as NodeJS.ReadStream & { isTTY?: boolean }).isTTY;

  if (!isTTY) {
    // Non-TTY mode: read all stdin upfront, split into lines, consume one per ask.
    // API keys come from MOOTER_ANTHROPIC_KEY env var (never from pipe — privacy).
    return makeNonTTYIO();
  }

  // TTY mode (original behaviour)
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    print: (line) => process.stdout.write(line + "\n"),
    ask: (q) => new Promise((res) => rl.question(q, (a) => res(a.trim()))),
    askHidden: makeAskHiddenTTY(rl),  // refactored helper using setRawMode safely
    confirm: (q, def) => /* existing */,
  };
}

function makeNonTTYIO(): InitIO {
  let stdinLines: string[] = [];
  let stdinReady = false;

  const readStdin = (): Promise<void> => new Promise((res, rej) => {
    if (stdinReady) return res();
    let buf = '';
    process.stdin.on('data', (chunk) => { buf += chunk.toString(); });
    process.stdin.on('end', () => {
      stdinLines = buf.split('\n');
      stdinReady = true;
      res();
    });
    process.stdin.on('error', rej);
  });

  return {
    print: (line) => process.stdout.write(line + "\n"),
    ask: async (q) => {
      process.stdout.write(q);
      await readStdin();
      return (stdinLines.shift() ?? '').trim();
    },
    askHidden: async (q) => {
      const envKey = process.env.MOOTER_ANTHROPIC_KEY;
      if (envKey) {
        process.stdout.write(q + '(read from MOOTER_ANTHROPIC_KEY env)\n');
        return envKey;
      }
      // Non-TTY without env var: skip step, return empty, init.ts handles "no key"
      process.stdout.write(q + '(non-TTY, no env var — skipping)\n');
      return '';
    },
    confirm: async (q, def) => {
      process.stdout.write(q + (def ? ' [Y/n]: ' : ' [y/N]: '));
      await readStdin();
      const ans = (stdinLines.shift() ?? '').trim().toLowerCase();
      if (!ans) return def;
      return ans === 'y' || ans === 'yes';
    },
  };
}

function makeAskHiddenTTY(rl: ReturnType<typeof createInterface>): (q: string) => Promise<string> {
  return (q) => new Promise((res) => {
    process.stdout.write(q);
    const inp = process.stdin as NodeJS.ReadStream & { isTTY?: boolean };
    if (!inp.isTTY || !inp.setRawMode) {
      // Should never reach here (defaultIO routes non-TTY elsewhere) but safe-guard
      rl.question('', (a) => res(a.trim()));
      return;
    }
    const wasRaw = inp.isRaw;
    inp.setRawMode(true);
    let buf = "";
    const onData = (ch: Buffer) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r' || c === '') {
        if (inp.setRawMode) inp.setRawMode(wasRaw ?? false);
        process.stdin.off('data', onData);
        process.stdout.write('\n');
        res(buf);
      } else if (c === '') {
        if (inp.setRawMode) inp.setRawMode(wasRaw ?? false);
        process.stdin.off('data', onData);
        process.exit(130);
      } else if (c === '') {
        if (buf.length) { buf = buf.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        buf += c;
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', onData);
  });
}
```

### 3.3 Test cover

`packages/cli/tests/init-non-tty.test.ts` (NEW):
```typescript
test('runInit completes in pipe-mode with stdin input', async () => {
  // Pipe: "y\nmax\n\n\n\n" → confirm anthropic + access=max + 3x defaults
  // Use makeNonTTYIO directly via injection
  // Assert: no ERR_USE_AFTER_CLOSE, all 5 schemas written
});

test('runInit reads MOOTER_ANTHROPIC_KEY env var when askHidden called non-TTY', async () => {
  process.env.MOOTER_ANTHROPIC_KEY = 'sk-ant-test';
  // ... run wizard, validate credentials.json has type=api_key
});

test('runInit gracefully degrades when non-TTY without API key', async () => {
  delete process.env.MOOTER_ANTHROPIC_KEY;
  // ... run wizard, validate credentials.json has no anthropic provider
});
```

## 4. Sub-feature 2 — Edge case: no Ollama

### 4.1 Behaviour

Quando `probeHardware()` retorna `ollama.available === false`:
- Wizard mostra `✗ Ollama not detected · T0 local tier disabled` (já existe)
- Continua para steps 2-5 sem erro
- Pack recommendations: `hardwareFit()` retorna 0.0 para packs T0/T1 → score baixo
- `installPack()` ainda funciona (pack manifest existe mesmo sem Ollama)
- `credentials.json` NÃO inclui `providers.ollama` (já existe)
- Statusline numa session futura mostra `T0 disabled` em algum chip

### 4.2 Test

`packages/cli/tests/init-no-ollama.test.ts` (NEW):
```typescript
test('runInit completes when Ollama is offline', async () => {
  const probe = async (): Promise<HardwareProfile> => ({
    os: 'linux', os_version: '22.04', node_version: 'v20.11.0',
    cpu_cores: 16, ram_gb: 32, gpu: null,
    ollama: { url: 'http://localhost:11434', models: [], available: false }
  });
  // ... run wizard, assert no error, credentials.json has providers.anthropic but NOT providers.ollama
});
```

## 5. Sub-feature 3 — Edge case: no Anthropic

### 5.1 Behaviour

Quando user salta step 3 ou Anthropic validation falha:
- Wizard imprime warning: `⚠ No Anthropic access — Pastor will route to Ollama T0/T1 only`
- Continua para steps 4-5
- `credentials.json` NÃO inclui `providers.anthropic`
- Pack recommendations: `providerTierFit()` recebe `detectedTier='T0'` (downgrade safe)
- Statusline mostra `no Anthropic` em algum chip

### 5.2 Test

`packages/cli/tests/init-no-anthropic.test.ts` (NEW):
```typescript
test('runInit completes when user skips Anthropic step', async () => {
  // IO scripted: answer "skip" to anthropic access question
  // assert credentials.json has providers.ollama but NOT providers.anthropic
  // assert consent.json still written
});

test('runInit handles Anthropic 401 gracefully', async () => {
  const validateAnthropic = async () => ({
    valid: false, tier_detected: 'api_key', budget_5h_limit: 0, budget_7d_limit: 0,
    error: '401 Unauthorized'
  });
  // ... assert wizard shows error message, no anthropic in credentials, no crash
});
```

## 6. Sub-feature 4 — Idempotency robust

### 6.1 Behaviour

Re-run `mooter init` 3x consecutivas:
- **profile.json** atualiza (last_captured_utc muda mas estrutura igual)
- **consent.json** preserva user choice (se opt-in true → continua true)
- **credentials.json** atualiza last_validated_utc mas mantém providers
- **packs/<id>/**: pack.yaml + scaffold.md já-instalados NÃO duplicate, apenas overwrite (sem warning)
- **installed.json** lista permanece consistente (Set semantics)

### 6.2 Test

`packages/cli/tests/init-idempotency.test.ts` (NEW):
```typescript
test('runInit 3x consecutive: no duplicates, profile updates, consent preserves', async () => {
  // Run 1: install 2 packs, consent OFF
  // Run 2: change provider tier from max to pro, keep same packs
  // Run 3: change consent OFF→ON
  // After: 
  //   profile.json has latest captured_utc
  //   credentials.json has tier_detected=pro (from run 2)
  //   consent.json has telemetry_enabled=true (from run 3)
  //   packs/ has exactly 2 dirs (not 4 or 6)
  //   installed.json lists exactly 2 packs
});
```

## 7. Sub-feature 5 — Error message format

### 7.1 Format

Cada erro segue padrão:
```
✗ <what failed>
  Cause: <why>
  Fix:   <what to do>
```

### 7.2 Apply to all failure paths

Audit init.ts para cada `throw new Error()` ou `print('error: ...')` e reformatar.

Examples:
- Anthropic 401 → `✗ Anthropic validation failed (401)\n  Cause: API key invalid or revoked\n  Fix:   Get a new key at https://console.anthropic.com/keys`
- Ollama timeout → `✗ Ollama probe timeout\n  Cause: Ollama not responding on ${url} within 2s\n  Fix:   Run "ollama serve" or set OLLAMA_HOST to correct endpoint`
- Pack copy failed → `✗ Pack install failed: ${packId}\n  Cause: ${err.message}\n  Fix:   Check disk space + perms on ~/.mooter/packs/`

### 7.3 Helper

Adicionar helper function:
```typescript
function formatError(what: string, cause: string, fix: string): string {
  return `✗ ${what}\n  Cause: ${cause}\n  Fix:   ${fix}`;
}
```

## 8. Tests aggregate

Target após Day 2:
- Tests existentes init: 25 (manter passing)
- Novos tests: ~12-15
- Total: ~37-40

## 9. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.5-day2-wizard-hardening vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- tools/router/* INTACTO (Day 1 Wave 2.5 owns)
- packages/router/src/* INTACTO (Wave 2 owns)
- Fix stdin non-TTY: makeNonTTYIO + makeAskHiddenTTY split, no ERR_USE_AFTER_CLOSE em pipe-mode
- MOOTER_ANTHROPIC_KEY env var consumido em non-TTY mode (privacy: nunca via pipe)
- Edge no-Ollama: wizard completa, credentials.json sem providers.ollama
- Edge no-Anthropic: wizard completa, credentials.json sem providers.anthropic
- Idempotency: 3x runs não duplicate packs, profile atualiza, consent preserva
- Error format aplicado: ✗ + Cause + Fix em todos failure paths
- 25 tests existentes verdes
- 12-15 tests novos (non-TTY, no-Ollama, no-Anthropic, idempotency)
- Sem git add -A, sem --no-verify
- Sem secrets em diff (test fixtures usam sk-ant-test, nunca real keys)
- PASTOR.md NÃO no diff
- docs/strategy/* untracked NÃO no diff
- Cost sanity: <$0.01 (no real API calls em tests)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 10. PR

```bash
git push -u origin wave2.5-day2-wizard-hardening
gh pr create --base dev --title "Wave 2.5 Day 2: Wizard hardening (stdin non-TTY + edge cases + idempotency)" --body-file - <<'EOF'
## Summary
5 sub-features Wave 2.5 Day 2:

1. **Fix stdin non-TTY** — ERR_USE_AFTER_CLOSE em pipe-mode resolved via makeNonTTYIO + MOOTER_ANTHROPIC_KEY env var
2. **Edge no-Ollama** — wizard completa, T0 disabled, credentials.json sem providers.ollama
3. **Edge no-Anthropic** — wizard completa, statusline mostra "no providers"
4. **Idempotency robust** — 3x runs: profile atualiza, consent preserva, packs não duplicate
5. **Error format** — ✗ + Cause + Fix em todos failure paths

## Changes
- `packages/cli/src/commands/init.ts`: defaultIO refactor (makeNonTTYIO + makeAskHiddenTTY split) + formatError helper + edge case handling
- `packages/cli/tests/init.test.ts`: existing 25 tests preserved
- `packages/cli/tests/init-non-tty.test.ts`: NEW — 5 tests pipe-mode
- `packages/cli/tests/init-no-ollama.test.ts`: NEW — 2 tests
- `packages/cli/tests/init-no-anthropic.test.ts`: NEW — 3 tests
- `packages/cli/tests/init-idempotency.test.ts`: NEW — 2 tests

## Tests
- CLI suite: <X/X> pass (25 existing + ~12 new)
- Tools/router untouched ✓
- packages/router/src/* untouched ✓
- Sanity cost: $0 (all mocked)

## Invariants
- ✅ classify.js byte-identical
- ✅ tools/router + packages/router/src/* intacto
- ✅ Schemas Wave 2 D6 (credentials/profile/consent) preserved
- ✅ Backward compat: runInit({io}) API works
- ✅ MOOTER_ANTHROPIC_KEY env var = ONLY non-TTY path para keys (nunca pipe)
- ✅ No git add -A, No --no-verify

## Out of scope (next days W2.5)
- Bash command attribution + tier mix — Day 3
- Confidence trail + e2e validation — Day 4

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog Day 3
- Bash command tier badges
- Statusline last-10 distribution
EOF
```

## 11. Notion + SYNC

### 11.1 Notion sub-page

Title: `🐮 Sessão YYYY-MM-DD — Wave 2.5 Day 2 (wizard hardening)`

Body: 5 sub-features delivered · tests aggregate · reviewer verdict · Day 3 backlog.

### 11.2 SYNC.md

Update:
- `## Notion HQ — Páginas de Referência` → add link Day 2
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge + arrancar Day 3 (bash attribution + tier mix)

## 12. Resumo final na chat

```
✅ Wave 2.5 Day 2 — Wizard hardening COMPLETO
- Branch: wave2.5-day2-wizard-hardening (pushed)
- PR: #<N> (link) → dev
- 5 sub-features: stdin non-TTY · no-Ollama · no-Anthropic · idempotency · error format
- Tests: <X/X> pass (25 existing + ~12 new)
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Cost sanity: $0
Próximo: Paulo merge + arranca Day 3 (bash command attribution + tier mix breakdown).
```

=== END ===
