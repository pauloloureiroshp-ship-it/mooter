---
version: 1.0
last_reviewed: 2026-04-21
owner: paulo-loureiro
enforcement: terminal-2 must parse frontmatter before any action; violation = hard abort

terminal_2:
  identity:
    agent_type: claude-code-local
    model: ollama-local-only
    mode: dangerous-skip-permissions
    branch_prefix: "agent/terminal-2-"

  allowed_paths:
    - "docs/**"
    - "docs/sessions/**"
    - "docs/proposed-skills/**"
    - "tools/router/tests/**"
    - "tools/router/benchmarks/**"
    - "datasets/synthetic/**"
    - "datasets/augmented/**"
    - "scripts/benchmarks/**"
    - "reports/**"
    - "LOOP.md"

  append_only_paths:
    - "LOOP.md"

  forbidden_paths:
    - "tools/router/classify.js"
    - "tools/router/patterns.js"
    - "tools/router/router.js"
    - "tools/router/mooter-mode.js"
    - "tools/router/inject_context.js"
    - "gold-labels.json"
    - "router-tuning.json"
    - "validation-set.json"
    - ".mooter-mode.json"
    - ".frugal-mode.json"
    - "~/.claude/**"
    - "~/.mooter/**"
    - "landing/**"
    - "MEMORY.md"
    - "TERMINAL-CONTRACT.md"
    - ".env"
    - ".env.*"
    - "**/*.key"
    - "**/*.pem"
    - "**/secrets.*"

  read_only_paths:
    - "SYNC.md"
    - "MEMORY.md"
    - "TERMINAL-CONTRACT.md"
    - "package.json"
    - "tools/router/**"

  forbidden_commands:
    - "git push origin main"
    - "git push origin master"
    - "git push --force"
    - "git reset --hard"
    - "git rebase -i"
    - "git clean -fdx"
    - "npm publish"
    - "npm version"
    - "gh release create"
    - "gh pr merge"
    - "vercel deploy --prod"
    - "wrangler deploy"
    - "docker system prune"
    - "rm -rf"
    - "Remove-Item -Recurse -Force"
    - "curl | bash"
    - "wget | sh"
    - "Invoke-Expression"

  required_on_session_start:
    - read_file: "SYNC.md"
    - read_file: "LOOP.md"
    - read_file: "TERMINAL-CONTRACT.md"
    - check_absence: "~/.mooter/EMERGENCY_STOP"
    - check_file: "~/.mooter/gpu-lock"
    - verify_branch_prefix: "agent/terminal-2-"

  required_on_session_end:
    - append_entry: "LOOP.md#OBSERVADO"
    - update_section: "SYNC.md#terminal-2-last-session"
    - create_session_report: "docs/sessions/terminal-2-NNN.md"
    - commit_if_changes: "branch must match agent/terminal-2-*"
    - open_pr_if_code_changed: "target=main, body must link session report"

  limits:
    max_files_per_pr: 15
    max_lines_changed_per_pr: 500
    max_session_duration_minutes: 240
    cost_ceiling_cloud_usd: 0.00
    check_emergency_stop_every_seconds: 30
    check_gpu_lock_before_ollama_call: true

  budget_policy:
    cloud_api_calls: forbidden
    local_ollama_calls: unlimited
    if_ollama_unavailable: abort_with_loop_entry

terminal_1:
  identity:
    agent_type: claude-code-interactive
    model: claude-opus-4-7
    mode: approval-required
    branch_prefix: ["main", "feature/", "fix/"]

  authority:
    - approve_or_reject_terminal_2_prs: true
    - write_to_memory_md: true
    - modify_forbidden_paths: true
    - push_to_main: "after final-reviewer passes"
    - create_new_skills: "after review"
    - distill_loop_to_memory: "weekly, paulo present"

shared_artifacts:
  living_documents:
    - path: "SYNC.md"
      owner: both
      write_protocol: "section-by-section, owner marked per section"
    - path: "MEMORY.md"
      owner: terminal-1
      write_protocol: "append-only, distillation weekly"
    - path: "LOOP.md"
      owner: both
      write_protocol: |
        Terminal 2: only OBSERVADO and PERGUNTA_URGENTE sections, append-only
        Terminal 1: HIPÓTESE, EXPERIMENTO, ARCHIVED, and replies
    - path: "TERMINAL-CONTRACT.md"
      owner: terminal-1
      write_protocol: "versioned, final-reviewer required, breaking changes bump major"

gpu_lock_protocol:
  file: "~/.mooter/gpu-lock"
  format: "JSON {holder, task, started_at, estimated_end}"
  terminal_2_training_acquire:
    check: "file absent OR older than 4h"
    write: "holder=terminal-2, task=lora-training-<slug>"
    release: "delete file on task end or abort"
  terminal_1_inference_check:
    if_file_present: "use cloud API instead of local Ollama"
    if_file_absent: "use local Ollama normally"

emergency_stop_protocol:
  file: "~/.mooter/EMERGENCY_STOP"
  creation_triggers:
    - paulo_manual: "touch ~/.mooter/EMERGENCY_STOP from anywhere"
    - iphone_dispatch: "/mooter-stop command"
    - cost_breach: "cumulative cloud spend > $20 in 24h"
    - vram_critical: "free VRAM < 500MB for > 5 minutes"
  terminal_2_behavior:
    check_frequency_seconds: 30
    on_detect:
      - abort_current_task: graceful
      - write_partial_session_report: true
      - commit_work_in_progress: "to branch agent/terminal-2-stopped-<timestamp>"
      - append_loop_entry: "emergency stop triggered, reason logged"
      - exit: "code 42"
  terminal_1_behavior:
    check_frequency_seconds: 300
    on_detect:
      - pause_current_task: true
      - notify_paulo: "if running autonomously"
      - wait_for_manual_removal: true
---

# TERMINAL-CONTRACT.md — Mooter Multi-Terminal Contract

Contrato formal entre Terminal 1 (Orquestrador Estratégico com Opus) e Terminal 2 (Executor Autônomo Local). Frontmatter YAML acima é **machine-readable** — Terminal 2 parseia antes de qualquer ação e rejeita comando que viola. Prosa abaixo explica **rationale** das regras para humanos e agentes futuros.

## Por que esse contrato existe

Dois agentes autônomos trabalhando no mesmo repo, no mesmo hardware, sem regra escrita, divergem rapidamente. Sistemas multi-agente sem contrato formal falham por uma das três vias: race conditions em arquivos compartilhados, agente autônomo tocando em código que não deveria, ou agentes produzindo soluções contraditórias para o mesmo problema. Esse contrato é o **vacina** contra as três.

## Princípios de design do contrato

**Princípio 1 — Default deny.** Terminal 2 só pode tocar em paths explicitamente listados em `allowed_paths`. Se path não está na lista, é forbidden. Sem ambiguidade.

**Princípio 2 — Forbidden > allowed.** Se um path aparece tanto em allowed quanto forbidden, forbidden vence. Isso permite escrever `allowed: docs/**` e depois `forbidden: docs/secrets.md` sem contradição.

**Princípio 3 — Read ≠ write.** Alguns paths (SYNC.md, MEMORY.md, package.json) Terminal 2 pode ler mas não escrever. Isso está em `read_only_paths`. Terminal 2 precisa conhecer SYNC.md pra saber estado, mas não tem autoridade pra alterar.

**Princípio 4 — Append-only > full-write.** LOOP.md é append-only. Terminal 2 nunca edita entries anteriores. Histórico preservado sempre.

**Princípio 5 — Ritual obrigatório.** Toda sessão começa com checklist (read files, check emergency stop, verify branch). Toda sessão termina com checklist (append LOOP, update SYNC, create session report, open PR). Sem exceção.

**Princípio 6 — Escalation é caminho, não falha.** Quando Terminal 2 encontra algo que não sabe resolver, existe protocolo explícito (ver Escalation Playbook abaixo). Escalar não é falhar — é comportamento correto.

## Por que Terminal 2 não toca `tools/router/classify.js` (e cia)

Classifier é o coração do produto. Cada um dos 167 regex patterns foi curado à mão contra gold labels. Um refactor "mecânico" que parece benigno — renomear variável, reformatar regex, extrair função — pode quebrar 1 pattern sem alerta e derrubar accuracy de 88.3% para 70% sem ninguém notar até o backtest semanal.

Decisões de alterar classifier são **sempre T3 arquitetura**. Exigem final-reviewer humano. Terminal 2 que encontra problema no classifier escreve observação em LOOP.md como entry `OBSERVADO`. Terminal 1 decide o que fazer.

**Exemplo de comportamento correto do Terminal 2:**

> Terminal 2 rodando benchmark detectou que pattern `/^refactor.*arquivo/i` classifica 60% dos prompts como T2 quando deveriam ser T1 (análise de distribuição histórica mostra). Terminal 2 NÃO edita `patterns.js`. Escreve em LOOP.md:
>
> ```
> OBSERVADO 2026-04-25-pattern-refactor-arquivo-overfits-t2
> Pattern /^refactor.*arquivo/i classifica 60% T2, histórico sugere 75% deveriam ser T1.
> Amostra: 23 prompts em outcomes.jsonl entre 2026-04-20 e 2026-04-25.
> Não editei patterns.js (forbidden_path). Proponho que Terminal 1 avalie ajuste.
> ```

Terminal 1 revê na próxima sessão, confirma ou rejeita, e se aprova, faz a edição com final-reviewer no ciclo.

## Por que landing/** é forbidden para Terminal 2

Landing é canal de aquisição. Mudanças afetam primeira impressão de beta testers externos. São decisões de produto, não de engenharia. Terminal 2 pode **propor** mudanças (em `docs/proposed-landing-changes/`), mas não aplica.

## Por que ~/.claude/** e ~/.mooter/** são forbidden

Ambiente pessoal do Paulo. Settings.json, statusline.sh, hooks, skills instalados. Qualquer alteração por Terminal 2 quebra fluxo de trabalho do próprio Paulo sem ele perceber. Modificação nesses paths é sempre feita manualmente por Paulo ou via Terminal 1 com revisão explícita.

## Por que custo cloud = $0 para Terminal 2

Terminal 2 roda com Ollama local. Se Ollama cai ou recusa prompt, Terminal 2 aborta — não faz fallback para cloud. Razão: Terminal 2 é autônomo 24/7. Fallback silencioso para cloud pode gastar centenas de dólares em horas sem Paulo perceber. Melhor abortar e escrever em LOOP.md que Ollama falhou.

## Por que limites numéricos existem

- `max_files_per_pr: 15` — PRs grandes são impossíveis de revisar. Force Terminal 2 a dividir trabalho em chunks revisáveis.
- `max_lines_changed_per_pr: 500` — mesmo princípio.
- `max_session_duration_minutes: 240` — Terminal 2 em loop infinito queima VRAM e eletricidade. Session timeout força parada periódica e dá chance ao Paulo de revisar progresso.
- `check_emergency_stop_every_seconds: 30` — responsividade ao kill switch sem drenar recursos checando constantemente.

## Escalation Playbook

Regras explícitas sobre o que Terminal 2 faz quando encontra situação fora do normal.

### Caso 1 — Terminal 2 encontra bug em arquivo forbidden

**Não:** tenta fix.
**Sim:** escreve em LOOP.md como `OBSERVADO` com slug descritivo. Inclui evidência (linha do código, output de teste, log). Paulo decide no próximo Terminal 1.

### Caso 2 — Terminal 2 excede cost ceiling ou session timeout

**Não:** ignora e continua.
**Sim:** aborta graceful, escreve session report parcial, append em LOOP.md explicando o abort com razão. Commit em branch, NÃO abre PR (PR sugere completude).

### Caso 3 — Terminal 2 encontra ambiguidade em SYNC.md ou MEMORY.md

**Não:** adivinha interpretação.
**Sim:** adiciona entry em LOOP.md seção `PERGUNTA_URGENTE` com pergunta concreta. Aborta ou segue com tarefa alternativa. Paulo vê via iPhone dispatch e responde.

### Caso 4 — Terminal 2 detecta `EMERGENCY_STOP`

**Não:** continua "só mais um pouco".
**Sim:** executa protocolo de graceful shutdown (salva WIP em branch `agent/terminal-2-stopped-TIMESTAMP`, escreve session report parcial, append LOOP.md com razão, exit code 42).

### Caso 5 — Terminal 2 precisa GPU mas `~/.mooter/gpu-lock` indica outro holder

**Não:** ignora lock.
**Sim:** abort task, escreve em LOOP.md que GPU estava ocupada (por qual holder, quando começou). Reagendar tarefa para próxima sessão.

### Caso 6 — Terminal 2 descobre padrão que parece ser novo SKILL

**Não:** escreve em `~/.claude/skills/` (forbidden).
**Sim:** propõe em `docs/proposed-skills/SKILL-slug.md`. Terminal 1 revê, aprova (ou rejeita), e promove para `~/.claude/skills/` manualmente.

### Caso 7 — Terminal 2 precisa de API key, credential, ou secret

**Não:** procura em arquivos, variáveis de ambiente não-whitelisted.
**Sim:** aborta task, escreve em LOOP.md que secret era necessário. Paulo decide se provisiona via Terminal 1 ou rejeita a task.

### Caso 8 — Terminal 2 encontra violação deste contrato em código existente

Exemplo: um arquivo em path forbidden tem TODO dizendo "Terminal 2 can refactor this". 

**Não:** presume que TODO overridde contrato.
**Sim:** contrato tem autoridade acima de comentários em código. Escreve em LOOP.md a contradição encontrada. Paulo decide.

## Evolução deste contrato

Este documento é versionado com semver.

- **Patch** (1.0.x) — clarificações, novas entries em escalation playbook sem mudar regras
- **Minor** (1.x.0) — adicionar paths à lista allowed/forbidden
- **Major** (x.0.0) — mudar estrutura do frontmatter, adicionar novo terminal, mudar princípios

Mudanças são commits próprios com mensagem `contract: <summary> (bump to X.Y.Z)`. Final-reviewer obrigatório antes de push. Mudanças major exigem entry em MEMORY.md explicando por que o contrato anterior precisou mudar.

Terminal 2 relê este contrato no início de toda sessão — se versão é maior do que a que ele usou na última sessão, refaz session-start ritual completo considerando regras novas.

## Referências

- MEMORY.md — decisões arquiteturais duradouras
- LOOP.md — aprendizado contínuo
- SYNC.md — estado operacional
- `~/.claude/skills/mooter-session-boundary/SKILL.md` — ritual de abertura/fechamento
- `~/.claude/skills/mooter-loop-append/SKILL.md` — como Terminal 2 escreve em LOOP.md
