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

## EXPERIMENTO

### (nenhum experimento ativo neste momento — aguardando primeiro ciclo de Terminal 2)

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
