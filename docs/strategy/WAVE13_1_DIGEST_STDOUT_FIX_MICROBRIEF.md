# Wave 13.1 — Stop digest stdout cosmético fix

> **Goal**: o Stop digest da Wave 13 ("🐮 Moos that worked the session ...") está a sair
> para stdout do shell host, que tenta executar as linhas como comandos. Resultado visual:
> `🐮: command not found`, `local-summarizer: command not found`, `Command 'peak' not found...`.
> Cosmético — NÃO bloqueia funcionalidade — mas estraga o wow factor da feature.
>
> **Reproduzido em**: Day 5 incognito WSL2 Ubuntu, Paulo, 2026-06-04 prod v1.8.1-brand-cleanup.
>
> **Scope**: 1 PR, 1 ficheiro (mais provável `tools/router/stop_hook.js` ou
> `tools/router/digest_renderer.js`), fix de output channel. Backwards-compat total.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - Zero schema changes
> - Zero hub touch
> - Tests 110/110 mantidos
> - **Digest continua visível em todas as plataformas** (bash/zsh/fish/PowerShell)

---

## 0. Reproduzir o bug

Após qualquer sessão Claude Code em WSL/Linux com subagents locais executados,
ao sair (`/quit` ou Ctrl+D) aparece:

```
🐮 Moos that worked the session
  local-summarizer × 3 · avg ~6s · qwen3:30b
  peak concurrent: 1
🐮: command not found
local-summarizer: command not found
Command 'peak' not found, did you mean:
  command 'pear' from deb php-pear ...
  command 'peek' from deb peek ...
  command 'speak' from deb espeak-ng-espeak ...
Try: sudo apt install <deb name>
```

O bloco do digest está correcto (linhas 1-4). As linhas 5+ são o **shell host a tentar
executar as linhas do digest como comandos**. Significa que o hook escreveu o digest
em local que o shell apanhou como input em vez de output puramente visual.

## 1. Root cause hypothesis

Provável: o Stop hook escreve via comando que produz output via `echo` ou `printf`
sem prefix, mas o stdout retornou para o terminal pai (shell host) **depois** do
Claude Code sair, fazendo o shell tratar essas linhas como input no prompt.

Hypothesis alternativa: hook está a usar `cat << EOF ...EOF` que escreve para stdin
do shell host (heredoc evaporou após exit).

## 2. Fix policy

Por ordem de preferência (escolhe a primeira que se aplica):

**Fix A — comment prefix em cada linha (mais simples, 100% portável)**
Prefixar cada linha do digest com `# ` (comment shell). Shell ignora linhas que
começam por `#`. Visual: as linhas aparecem na mesma mas shell não as tenta executar.

```
# 🐮 Moos that worked the session
#   local-summarizer × 3 · avg ~6s · qwen3:30b
#   peak concurrent: 1
```

❌ Contra: visualmente menos limpo (vê-se o `#`).

**Fix B — emit via stderr** (recomendado)
Escrever digest via `process.stderr.write(...)` em vez de `console.log()`. stderr
não fica no shell input buffer. Visual: digest aparece normalmente, shell não tenta
executar.

✅ Pro: visual limpo · não rompe nada · portável (Linux/Mac/Windows).
❌ Contra: alguns terminals podem renderizar stderr em vermelho (verificar).

**Fix C — escrever para um ficheiro tmpdir + tail no exit hook**
Demasiado complicado para o ganho. Skip.

**Recomendação**: **Fix B (stderr)**. Se stderr em vermelho for visualmente mau no
Windows Terminal/iTerm, fallback para **Fix A (comment prefix)**.

## 3. Recon comandos

```bash
# Encontrar o hook que renderiza o digest
grep -rn "Moos that worked" tools/
grep -rn "peak concurrent" tools/
grep -rn "stop_hook\|Stop hook" tools/router/

# Confirmar que classify.js NÃO é tocado
sha256sum tools/router/classify.js  # deve ser 7b01eb86...87762
```

## 4. Sequência (1 PR autonomous, ~30 min)

1. **Recon** — localizar o ficheiro que faz emit do digest (provável `tools/router/stop_hook.js` ou `tools/router/digest_renderer.js`)
2. **Identify emit pattern** — `console.log` / `process.stdout.write` / `echo` shell call
3. **Fix B** — substituir por `process.stderr.write` OU `console.error`
4. **Test cross-platform** — verificar visualmente em Linux/Windows (se possível)
5. **classify.js sha256 check** — confirmar inalterado
6. **PR squash→dev** — branch `wave13-1-digest-stderr-fix`
7. **final-reviewer** — T1 (Haiku) é suficiente para cosmetic fix
8. **Tag** — `v1.8.2-digest-stderr-fix-dev`

## 5. Definition of Done

1. ✅ Stop digest visível em Linux WSL (Ubuntu) sem `command not found` errors
2. ✅ Stop digest visível em macOS bash/zsh (verificável via análise de código)
3. ✅ Tests 110/110 router surface mantidos
4. ✅ classify.js sha256 byte-identical
5. ✅ Tag `v1.8.2-digest-stderr-fix` (após promote main)

## 6. Anti-patterns

- ❌ NÃO criar nova categoria/feature — é só channel switch (stdout → stderr)
- ❌ NÃO mexer no conteúdo do digest (texto, emojis, formatação)
- ❌ NÃO tocar em `classify.js`
- ❌ NÃO tocar em `subagent_tracker.js` (state intacto)
- ❌ NÃO tocar em hub/
- ❌ NÃO refactor "while we're at it"

## 7. Master prompt para CC (paste when ready)

```
Inicia Wave 13.1 Stop Digest stderr fix conforme docs/strategy/WAVE13_1_DIGEST_STDOUT_FIX_MICROBRIEF.md.

Pré-flight: Wave 13 v1.8.0-show-the-herd + Wave 13.x v1.8.1-brand-cleanup ambas EM PROD.

Bug reproduzido em: Day 5 incognito WSL2 Ubuntu Paulo 2026-06-04 — Stop digest sai para stdout que shell host tenta executar (cosmético, não bloqueia).

Scope: 1 PR autonomous, 1 ficheiro provavelmente, channel switch stdout→stderr no Stop digest.

Lê PRIMEIRO:
  - docs/strategy/WAVE13_1_DIGEST_STDOUT_FIX_MICROBRIEF.md inteiro
  - tools/router/stop_hook.js (ou ficheiro que faz emit do "Moos that worked the session")
  - Memória local Wave 13 (project_wave13_prod / project_wave13_herd) para context

Non-negotiables:
  - classify.js byte-identical (sha256 7b01eb86...87762)
  - Zero schema changes
  - Zero hub touch
  - Tests 110/110 mantidos
  - Digest visível em Linux/Mac/Windows após fix

Sequência (~30 min autonomous):
  1. grep para localizar emit pattern do digest
  2. Identificar console.log/stdout.write → substituir por process.stderr.write OU console.error
  3. Verificar inline tests/snapshots existentes não partem
  4. classify.js sha256 check (byte-identical)
  5. PR squash→dev branch wave13-1-digest-stderr-fix
  6. final-reviewer T1 (Haiku) ok para cosmetic fix

Tag dev: v1.8.2-digest-stderr-fix-dev. Reporta para Cowork merge.

Após Paulo aprovar, promote dev→main: tag prod v1.8.2-digest-stderr-fix.

Reporta WAVE13_1_FINDINGS.md se houver decisões (esperado: zero — é fix muito específico).
```

---

**Composed by Cowork, 2026-06-04 afternoon. Wave 13.1 cosmetic fix do Stop digest
output channel. ~30 min CC autonomous + Paulo Gate único. Tag v1.8.2.**
