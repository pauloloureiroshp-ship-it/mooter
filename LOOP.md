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
