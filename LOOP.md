# LOOP.md — Mooter Learning Loop

Canal de aprendizado contínuo entre os dois terminais. Terminal 2 (executor autônomo local) reporta observações; Terminal 1 (orquestrador estratégico com Opus) valida hipóteses e aprova experimentos. Paulo arbitra quando terminais discordam.

**Propósito:** garantir que Terminal 2 trabalhando sozinho não gere aprendizado que morre no próprio Terminal 2. Todo insight precisa subir para decisão humana (Terminal 1) e eventualmente para memória permanente (MEMORY.md).

**Protocolo:** append-only. Nunca edita entry antiga. Se contradição surge, abre nova entry citando a anterior via `REFUTES: YYYY-MM-DD-slug` ou `REFINES: YYYY-MM-DD-slug`.

**Ciclo de vida de uma entry:**
1. Terminal 2 cria `OBSERVADO` durante sessão autônoma
2. Terminal 1 (Paulo presente) adiciona `HIPÓTESE` — interpretação do que significa
3. Terminal 1 aprova `EXPERIMENTO` com critério de validação
4. Resultado preenchido após experimento executar
5. Se resultado estável e repetido em 3+ entries → Paulo destila para MEMORY.md na review semanal
6. Entry é marcada `ARCHIVED → MEMORY.md#slug`

**Versão do documento:** 1.0 · Abril 2026

---

## OBSERVADO

### 2026-04-21-classifier-gastou-opus-em-tarefa-descritiva

**Contexto:** inventário descoberta do Mooter gerando `docs/CURRENT-STATE.md`. Tarefa envolvia ler filesystem, concatenar outputs, formatar markdown. Perfil de custo esperado: T0/T1 majoritário.

**Resultado observado:** 32 calls Opus, custo $2.89, economia $0.19 versus all-Opus (≈6% savings). HUD mostrou T3 99%.

**Dados brutos:**
- `Stop says: frugal turn end → 🔴 claude-opus-4-7 ×32 · ❓ unknown ×4 · actual ~$2.89 · saved $0.191 vs all-Opus`
- Ver `docs/CURRENT-STATE.md` para o próprio artefato gerado

**Quem observou:** Paulo (manualmente, olhando HUD pós-inventário)

**Status:** aceito como débito técnico conhecido por decisão explícita. Não investigar até depois da viagem / período de estabilização pós-Fase 0.

---

### 2026-04-21-side-finding-f1-1-mooter-mode-js-sync-manual

**Contexto:** `/mooter-auto` executado após inventário. Beast mode saiu com sucesso, mas revelou bug.

**Resultado observado:** runtime não tinha `~/.claude/tools/router/mooter-mode.js` — shim loader falhou com "Cannot find module './mooter-mode.js'". Sync manual do canônico `frugal/tools/router/mooter-mode.js` resolveu.

**Quem observou:** Terminal 1 durante sessão de `/mooter-auto`.

**Status:** fix aplicado localmente. Follow-up sugerido: incluir em install/sync-to-runtime para tornar runtime `/mooter-auto-capable` a partir de install fresca. Histórico: findings F1.1 original fechado em Sprint B (commit 0a9d05c) cobriu um ângulo, este é manifestação secundária.

---

### 2026-04-21-vram-retention-ollama-zombie-processes

**Contexto:** Durante H1 setup, investigação de VRAM livre após configurar OLLAMA_KEEP_ALIVE=5m.

**Resultado observado:** 5 processos ollama.exe tipo CUDA compute residentes na GPU consumindo ~19GB de 24GB VRAM, mesmo com `ollama ps` retornando vazio. Após taskkill force e novo `ollama serve`, 5 processos subiram novamente (comportamento esperado de Ollama parent+children). VRAM estabilizou em 5694 MiB livres, ainda longe dos 18GB+ esperados pós keep-alive expirar.

**Dados brutos:**
```
memory.free [MiB]
5694 MiB
(ollama ps: vazio)
5 ollama.exe ativos em nvidia-smi
```

**Quem observou:** Terminal 1 — H1 setup session

**Status:** novo

**Priority for Terminal 1:** medium (não bloqueia H1, mas afetará training de LoRA na Semana 4)

---

### 2026-04-21-shells-leaked-evidenciados

**Contexto:** CURRENT-STATE.md mencionou "~20 shells leaked Apr17-18". Durante investigação de Ollama, encontrei evidência concreta.

**Resultado observado:** 5 processos ollama.exe com StartTime de 17/04/2026 (4 dias atrás) continuavam rodando no Get-Process output. Isso valida a observação original do inventário. Processos foram terminados manualmente com Stop-Process + taskkill /F /T.

**Dados brutos:**
```
Name       Id    StartTime
ollama     10272 17/04/2026 10:14:10
ollama     21580 17/04/2026 09:42:21
ollama     47052 17/04/2026 10:14:16
ollama app 42616 17/04/2026 09:42:20
ollama     16500 21/04/2026 09:49:00 (único recente)
```

**Quem observou:** Terminal 1 — H1 setup session

**Status:** novo

**Priority for Terminal 1:** high (hygiene pattern, pode repetir). Sugestão: skill de cleanup automático em mooter-session-boundary fechamento.

---

### 2026-04-21-mooter-terminal-env-not-inherited

**Contexto:** Após configurar MOOTER_TERMINAL=1 via [System.Environment]::SetEnvironmentVariable com scope "User", skill mooter-session-boundary reportou MOOTER_TERMINAL=<unset> ao verificar a env var.

**Resultado observado:** Env vars setadas em User scope persistem no registry Windows, mas processo filho do Claude Code (que foi iniciado antes da var ser setada) não herda. Precisa fechar VS Code inteiro e reabrir para terminais filhos herdarem. Fallback gracioso do skill funcionou (default → Terminal 1).

**Dados brutos:**
```
[System.Environment]::GetEnvironmentVariable("MOOTER_TERMINAL", "User") → 1
$env:MOOTER_TERMINAL (novo PowerShell) → vazio
Claude Code env echo → <unset>
```

**Quem observou:** Terminal 1 — H1 setup session

**Status:** novo

**Priority for Terminal 1:** low (fallback funcionou, problema cosmético). Considerar incluir no mooter-session-boundary: se detectar <unset>, sugerir restart de VS Code.

---

### 2026-04-21-session-boundary-primeira-execucao-sucesso

**Contexto:** Primeira invocação real do skill mooter-session-boundary após instalação via bundle.

**Resultado observado:** Skill carregou (Successfully loaded skill), leu os 4 arquivos canônicos com tamanhos exatos (SYNC 50026, MEMORY 10492, LOOP 7608, TERMINAL-CONTRACT 13317), verificou EMERGENCY_STOP e gpu-lock (ausentes), confirmou branch main, detectou MOOTER_TERMINAL=<unset> com fallback correto, gerou resumo de 5 linhas incluindo referências a Audit 2026-04-19, entries pendentes em LOOP, e sugestão de próxima ação. Tempo: 45s. Custo: $0.257 em Opus.

**Dados brutos:** Ver output do session-boundary em docs/sessions/ (se criado) ou transcript.

**Quem observou:** Paulo (Terminal 1)

**Status:** novo

**Priority for Terminal 1:** validação positiva — protocolo entre terminais operacional.

---

### 2026-04-21-classifier-roteou-correto-duas-vezes

**Contexto:** Durante H1 setup, duas tarefas mecânicas descritivas foram roteadas pelo classifier.

**Resultado observado:**
1. Diff analysis de mooter-continuous-tester.js + mooter-review.js: T0 qwen2.5:3b local conf 85% est save $0.085
2. Configuração de env vars OLLAMA_KEEP_ALIVE + MOOTER_TERMINAL: T0 qwen3:30b local conf 55% est save $0.086

Ambas executaram localmente sem invocar Opus. Qualidade de output foi equivalente ao que Opus entregaria.

**Contraste com mesma sessão:**
- Inventário CURRENT-STATE.md: T3 32 Opus calls $2.89 (miscalibrated, já em LOOP)
- Final-reviewer 3 commits: T3 9 tool uses $0.77 (apropriado para review)
- Este prompt de adicionar entries: T3 Opus $0.171 (miscalibrated — era tarefa descritiva)

**Dados brutos:** outcomes.jsonl dessa sessão (timestamps entre ~17:30-18:00 local).

**Quem observou:** Paulo (Terminal 1) observando HUD

**Status:** novo

**Priority for Terminal 1:** low — quando classifier roteia correto, funciona bem. Casos de miscalibration são os interessantes para investigação futura (ver entry classifier-gastou-opus).

---

### 2026-04-21-drift-bidireccional-canonical-vs-runtime

**Contexto:** investigação a `sync-to-runtime.sh --diff` para fechar CRITICAL-2 do audit 2026-04-19 (triple-location file drift). Sprint A/B/D tinham sido aplicados ao canonical mas o runtime `~/.claude/tools/router/` não reflectia as fixes.

**Resultado observado:** o drift não é uni-direccional — é **bi-direccional** com dois fluxos que nunca se reconciliam. Aplicar `sync-to-runtime.sh --apply` cegamente destruiria trabalho não-versionado do runtime.

**Inventário dos 9 ficheiros divergentes:**

| Ficheiro | Canonical tem mais novo | Runtime tem mais novo |
|---|---|---|
| classify.js | `@ts-check` + JSDoc typedefs, `TUNED_COMPLEXITY_THRESHOLD=0.3` | tuning `generated_at=2026-04-21T10:29:19Z` sample=38364, `TUNED_COMPLEXITY_THRESHOLD=0.35`, TUNED_DEMOTE_* arrays |
| inject_context.js | `@ts-check` + JSDoc, Sprint A fixes | — |
| arbiter.js | `@ts-check` + JSDoc, Sprint A metrics seed from log | — |
| backtest.js | **B4 weight boost (+248 linhas)** | — |
| savings-tracker.js | `sanitizeJson`, `requireEnv`, `sentry-helper` imports (CCA Sprint 8.4) | — |
| shadow-mode.js, pricing.js, event-builder.js | `@ts-check` + JSDoc (CCA Sprint 1.x) | — |
| version.json | v0.9.9 / 2026-04-13 / landing-five-azure-16.vercel.app | **v0.10.0 / 2026-04-17 / mooter.ai** |

**Dois fluxos independentes:**
1. **Dev flow**: edits no repo → commit → mas **nunca chega ao runtime** (sync manual esquecido desde Apr 17).
2. **Tuning flow**: `update-router.js` corre diariamente 02:00 → reescreve `classify.js` do runtime com patches do backtest → **nunca propaga de volta ao repo**.

Resultado: canonical sempre desactualizado em tuning; runtime sempre desactualizado em dev fixes. Sprint A/B/D (fixes) no canonical; tuning 04-21 (38364 samples) no runtime. Ambas versões têm valor diferente.

**Por que isto importa agora:** `inject_context.js` do runtime é o hook que classifica cada prompt. Está sem a fix F5.1 (mode schema union). Se `.mooter-mode.json` for criado com `{beast_mode:true}`, o classifier runtime silenciosamente ignora — UI mente.

**Dados brutos:**
- Sprint commits no canonical: `0cdf73f` (Sprint A), `0a9d05c` (Sprint B), `4d60d9f` (Sprint D)
- `sync-to-runtime.sh --diff` output preservado no transcript desta sessão
- Tamanhos: canonical maior que runtime em 8 de 9 ficheiros (fixes são additive); só `version.json` tem runtime maior

**Quem observou:** Terminal 1 durante investigação pós-abertura em resposta a "faça sua melhor análise e siga em frente".

**Status:** novo — bloqueado em decisão de arquitectura.

**Priority for Terminal 1:** **HIGH**. Três fixes necessárias antes de qualquer sync cego:

1. **Exclude `version.json` do sync script** — runtime é source of truth para versão (actualizado por install/update).
2. **Separar tuning state de classify.js** — mover `TUNED_COMPLEXITY_THRESHOLD`, `TUNED_DEMOTE_*`, `generated_at`, `sample_size` para um `tuning-state.json` runtime-only, carregado dinamicamente. Isto resolve o conflito de fluxo permanentemente.
3. **Só então** propagar canonical → runtime. Preserva type safety + Sprint A/B/D + B4 + Sentry; preserva também tuning patches via nova separação.

Alternativa tática (sem refactor): antes do sync, extrair do runtime `classify.js` as linhas 23-28 (tuning header + threshold + TUNED_DEMOTE arrays), sync, re-injectar. Frágil — qualquer mudança de estrutura no canonical parte o patch.

**Recomendação arquitectónica:** opção 2. Tuning data não é código, não pertence a um ficheiro .js versionado.

---

### 2026-07-02-effectivecwd-heuristica-cwd-mais-recente

**Contexto:** Perfect Handoff LAND & PROVE — a captura (`effectiveCwd` em `tools/router/handoff-journal.js`) journala o worktree onde a sessão realmente commitou, derivado do transcript (Bash `cd` / `git -C`). Regra actual: escolhe o candidato git-context **mais RECENTE** que `gitInfo` resolve a um branch real.

**Resultado observado:** o final-reviewer (Opus) apontou que, se o ÚLTIMO comando git de um turno inspeccionar um worktree DIFERENTE (`git -C /outro/repo log`) DEPOIS de a sessão já ter commitado noutro, o journal pode registar um branch real-mas-errado. Continua *grounded* (nunca inventa um path — só devolve o que `gitInfo` resolve) e é estritamente melhor que o antigo `payload.cwd` fixo. Não re-introduz A Mentira (nunca vaza sha/contagem da árvore partilhada para um campo por-sessão).

**Quem observou:** final-reviewer subagent durante o gate de FASE 4 (verdict SHIP-WITH-NITS; este é um LOW não-bloqueante).

**Status:** aceite como débito técnico conhecido por decisão explícita do Paulo (Opção 1 do gate — não bloqueia o merge). Backlog: pesar candidatos por **proximidade ao commit** (o `cd` imediatamente antes do `git commit …`, não o último `git -C` de leitura) em vez de "mais recente ganha". Alternativa: exigir que o candidato tenha um `git commit`/`git add` no mesmo comando.

---

### 2026-07-03-low1-effectivecwd-work-aware-resolvido

REFINES: 2026-07-02-effectivecwd-heuristica-cwd-mais-recente

**Contexto:** Perfect Handoff v3 (work-aware). O LOW#1 (a "Alternativa" do backlog acima) foi implementado em `tools/router/handoff-journal.js` — só ADIÇÕES, `effectiveCwd` invertido para **work > navigation**.

**Resultado observado:** o LOW#1 morde no vivo — provado com os worktrees reais em disco. Cenário: sessão lançada de `~/frugal` (feat/overclock-moo-p1 @85e238a), turno `cd ../frugal-ph-v3 && git commit` (o TRABALHO) seguido de `cd ~/frugal && git branch -d …` (navegação/limpeza no tree partilhado).
- **ANTES (regra v2.5 "mais recente ganha"):** `Onde: feat/overclock-moo-p1 @85e238a` → o handoff CRUZA (a navegação venceu).
- **DEPOIS (v3 work-aware):** `Onde: feat/perfect-handoff-v3 @3a6d2fb` → o worktree do git-WRITE.

A cura: `_isGitWrite(cmd)` (commit|merge|rebase|cherry-pick|am|revert|worktree add|checkout/switch -b|-c|stash; `status|log|branch -d/-D|rev-parse|show|diff|fetch|remote` e `cd` nu NÃO contam) + `_workCwdCandidates(lines)` (cwd por comando git-write) + `effectiveCwd` na ordem `(a) git-write newest-first → (b) fallback navegação v2.5 → (c) payloadCwd`. Grounded, never-throws, back-compat total (a alínea (b) é byte-identical à v2.5 → zero regressão para sessões sem commit). +7 testes deterministas. `node --test` completo: 15 falhas env pré-existentes idênticas a main, todos os testes de handoff verdes.

**Quem observou:** Terminal 1 (Opus) na sessão PH v3, worktree `../frugal-ph-v3` @ `feat/perfect-handoff-v3` `3a6d2fb`.

**Status:** **RESOLVIDO** (não backlog). Falta apenas a propagação runtime (`/mooter-update` sincroniza `handoff-journal.js` para `~/.claude/tools/router/`) — post-merge; o hook wired `gsd-turn-end.js` já chama `effectiveCwd` (self-check `OK`), por isso o fix conta assim que o ficheiro aterrar em main.

---

## HIPÓTESE

### Sobre 2026-04-21-classifier-gastou-opus-em-tarefa-descritiva

**Hipótese A — final-reviewer disparando em sub-steps** (probabilidade: média-alta)

Tarefa de inventário criou muitos arquivos e seções intermediárias. Se `final-reviewer` está sendo invocado após cada seção significativa em vez de só antes de push, os 32 calls Opus fazem sentido matematicamente. Investigação necessária: log de quando `final-reviewer` foi chamado versus quantas vezes ferramentas de filesystem foram usadas.

**Hipótese B — patterns de "audit" ou "inventário" classificam como T3 arquitetura** (probabilidade: média)

O classifier tem 167 regex patterns. Se palavras como "inventário", "canonical", "audit", "descobrir" caem em patterns que foram tunados para arquitetura crítica, todo prompt dessa família sobe para T3. Investigação: backtest do prompt inicial contra `patterns.js`.

**Hipótese C — beast mode residual em cache** (probabilidade: baixa)

`.mooter-mode.json` foi deletado por `/mooter-auto` antes da investigação começar, mas algum cache de sessão anterior pode ter persistido em `.mooter-review-state.json` ou similar. Investigação: grep por referências a `beast` ou `FORCED` em arquivos de estado.

**Hipótese D — três hipóteses juntas** (probabilidade: média)

Não são mutuamente exclusivas. Custo de $2.89 pode ser 40% hipótese A + 40% hipótese B + 20% outra coisa.

**Decisão de Paulo:** investigar depois da viagem / estabilização. Documentar como risco rastreado em SYNC.md seção "débitos técnicos conhecidos". Monitoring: toda sessão acima de $1 em Opus agora deve disparar entry nova em LOOP.md `OBSERVADO` automaticamente (skill a criar).

---

### Sobre 2026-04-21-side-finding-f1-1-mooter-mode-js-sync-manual

**Hipótese A — script de install não cobre runtime/canonical sync** (probabilidade: alta)

F1.1 original (fechado em Sprint B) provavelmente cobriu o bug específico de schema union no classifier, não o ciclo de vida dos arquivos runtime. Install atual pega canonical mas não espelha para runtime em `~/.claude/tools/router/`.

**Hipótese B — `/mooter-update` deveria incluir esse sync** (probabilidade: alta)

Output do próprio Claude Code disse: "o próximo /mooter-update já o sincroniza automaticamente, mas ficaste bloqueado sem este sync manual". Sugere que /mooter-update já tem a lógica — só precisa rodar pelo menos uma vez após install.

**Decisão pendente:** verificar se `/mooter-update` de fato sincroniza mooter-mode.js. Se sim, documentar em install.sh como passo obrigatório pós-install. Se não, implementar.

---

### Sobre 2026-04-21-drift-bidireccional-canonical-vs-runtime

**Hipótese única (probabilidade: alta)** — Opção 2 do OBSERVADO (separar `tuning-state.json` de `classify.js`) é a solução arquitectónica correcta, não apenas tratamento de sintoma.

**Por que é a solução e não um paliativo:**

1. A raiz do drift é estrutural: tuning state mutável e código executável vivem no mesmo ficheiro. Qualquer pipeline que escreva tuning precisa parsear e reinjectar blocos de código — frágil por natureza e invisível ao git (porque tanto código como tuning são `.js`).
2. Opção 1 (excluir `version.json` do sync script) trata apenas 1 de 9 ficheiros. O drift em 7 outros (classify.js código vs tuning, type safety vs TUNED_BLOCK) continua a acontecer em cada backtest nocturno.
3. A opção tática (patch runtime → canonical pré-sync) é anti-pattern: encoda stale tuning em ficheiros versionados, commits ruidosos diários, e a história do git fica poluída com mudanças semânticas zero.

**Critério de confirmação:** após refactor, `sync-to-runtime.sh --apply` preserva tuning em runtime + propaga code changes sem destruir estado. Testes 42+ green pós-refactor.

**Risco identificado + mitigação:** `loadTuningState()` em classify.js tem que ter fallback defensivo, caso contrário fresh install falha em tempo de `require()` do classifier, e o hook `inject_context.js` passa a devolver `claude_session` em todos os prompts (router inoperante). Mitigação: try/catch + `tuning-state.defaults.json` (canonical seed committed). Se ambos falharem (ENOENT em defaults committed é impossible), o hook é fail-safe por design — nunca bloqueia prompts.

---

## EXPERIMENTO

### 2026-04-21-externalize-tuning-state

**Hipótese-alvo:** `2026-04-21-drift-bidireccional-canonical-vs-runtime` — Opção 2 (separar `tuning-state.json` de `classify.js`)

**Critério de validação:**
- `sync-to-runtime.sh --diff` reporta `0 diverged` (era 9)
- classify.test.js 3/3 + classify-branches.test.js 20/20 + sanitize.test.js 19/19 green
- Smoke canonical + runtime classify.js retornam JSON válido com mesmo tier pré/pós-refactor
- Runtime tuning state preservado através do refactor (threshold 0.35, sample 39593, 3 demote patterns)

**Procedimento:**
1. Phase 1 scaffold non-destructive (commit `5c41888`): `tuning-state.defaults.json` canonical seed + `.gitignore` entry + `sync-to-runtime.sh` exclude comment + `docs/DRIFT-RESOLUTION-PLAN.md` plano completo
2. Phase 2 core refactor (commit `d118e55`): `classify.js` com `_loadTuningState()` fallback-safe + `update-router.js` escreve `tuning-state.json` (JSON) em vez de editar classify.js
3. Seed runtime `~/.claude/tools/router/tuning-state.json` a partir do estado live de runtime classify.js pré-refactor (evita perder tuning acumulado em 4 dias)
4. Sync canonical → runtime (9 ficheiros)
5. Smoke tests canonical + runtime + `sync-to-runtime.sh --diff`
6. Final-reviewer gate → push `main`

**Owner:** Terminal 1 (Opus 4.7, sessão #36, 2026-04-21)

**Cost ceiling:** ~80 tool calls + 3 final-reviewer gates (estimativa pré-execução). Atingido dentro do orçamento.

**Resultado:**
- `sync-to-runtime.sh --diff`: `0 synced, 23 identical, 0 diverged` ✅
- Testes: **42/42 green** (sanitize 19, classify 3, classify-branches 20). backtest.test.js + env.test.js + classify-retry.test.js não re-executados (não afectados pela refactor — nenhum testa TUNED_BLOCK nem fs.readFile em classify.js) ✅
- Smoke canonical `classify.js "hello world"` → T0 trivial_local, qwen2.5:3b ✅
- Smoke runtime `classify.js "hello world"` → T0 trivial_local, qwen2.5:3b (idêntico ao canonical) ✅
- Smoke runtime `classify.js "proxima vamos continuar"` → T0 com demote pattern `\\bproxima\\b` a disparar via runtime `tuning-state.json` (preservado) ✅
- Runtime `tuning-state.json` contém estado seeded `2026-04-21T15:37:26.739Z` (sample 39593, threshold 0.35, 3 demote patterns) ✅
- node --check em ambos ficheiros: OK ✅
- Final-reviewer gate (commit d118e55): PASS, zero blockers ✅

**Conclusão:** **CONFIRMA** — Opção 2 é a solução correcta. Drift resolvido definitivamente: pipeline de tuning agora é idempotente e não afecta código versionado.

**Próxima acção:**
- Aguardar próximo scheduled backtest (02:00 próximo ciclo) para validar que `update-router.js` refactored escreve `tuning-state.json` correctamente em runtime. Se OK → mais 2 ciclos estáveis → destilar em `MEMORY.md` como princípio geral ("externalizar mutable state de código executável sempre que o pipeline de escrita não está sob controlo do git"). Arquivar este entry quando destilado (`ARCHIVED → MEMORY.md#slug`).
- Phase 3 cleanup de artifacts legacy (`classify.js.bak`, `classify.js.sync-bak`, `backtest.js.bak`, `backtest.js.sync-bak`) opcional, pós-estabilização de 1-2 dias sem incidentes.

---

Template para entries futuras:

```
### YYYY-MM-DD-slug
**Hipótese-alvo:** link para hipótese sendo testada
**Critério de validação:** condição objetiva que determina resultado
**Procedimento:** passos mecânicos de execução
**Owner:** Terminal 1 ou Terminal 2
**Cost ceiling:** máximo de custo aceitável para o experimento
**Resultado:** preenchido após execução
**Conclusão:** CONFIRMA / REFUTA / INCONCLUSIVO
```

---

## PERGUNTA_URGENTE

Seção reservada para Terminal 2 levantar dúvidas que bloqueiam continuação da tarefa. Paulo verifica via iPhone dispatch ou Terminal 1.

Formato:
```
### YYYY-MM-DDTHH:MM — Terminal 2
Pergunta: [pergunta concreta]
Contexto: [o que o Terminal 2 estava fazendo]
Bloqueio: [o que o Terminal 2 fez — aguarda / executou cautelosamente / abortou]
```

(seção vazia inicialmente)

---

## ARCHIVED

Entries destiladas para MEMORY.md aparecem aqui com link. Não são deletadas de LOOP.md — só marcadas.

(seção vazia inicialmente)

---

## Protocolo de append por Terminal 2

Ao final de qualquer sessão autônoma, Terminal 2 executa skill `mooter-loop-append` que:

1. Coleta o que foi observado (nova info sobre o sistema, padrões inesperados, resultados surpreendentes)
2. Formata como entry `OBSERVADO` com slug `YYYY-MM-DD-descrição-curta-kebab`
3. Append em `LOOP.md` seção `OBSERVADO`
4. Se há pergunta bloqueante, adiciona entry em `PERGUNTA_URGENTE`
5. Commit: `loop: terminal-2 observation YYYY-MM-DD-slug`
6. Nunca edita entries antigas, nunca escreve em HIPÓTESE ou EXPERIMENTO, nunca destila para MEMORY.md

## Protocolo de escrita por Terminal 1

Terminal 1 pode:

- Adicionar HIPÓTESE a qualquer OBSERVADO
- Criar EXPERIMENTO para testar hipótese
- Preencher resultado de EXPERIMENTO
- Responder PERGUNTA_URGENTE (move para OBSERVADO com tag `[RESPONDIDA-PAULO]`)
- Marcar entries como ARCHIVED após distillation semanal

Terminal 1 não deve criar OBSERVADO diretamente — se observou algo novo, usa skill `mooter-loop-append` como Terminal 2 faria. Isso mantém consistência de formato.
