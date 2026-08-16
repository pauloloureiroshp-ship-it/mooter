## Decisão medida

A contradição vem de dois testes que preservam cicatrizes diferentes — e o T1 mistura duas políticas que historicamente não nasceram juntas.

### 1. Cicatriz dos testes

- **T1:** introduzido por `589a9eea` em 2026-07-25. O incidente real foi cross-vendor: `toolWork` usava a assinatura antiga de `cliModelFor`, assumia Claude Code e entregava `sonnet` ao Ollama, que morreu em 0 s. A suite anterior tinha 57 asserts verdes e não percorria `toolWork → cliModelFor → spawn` ([path.test.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/path.test.js:5>), [handoff original](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/_handoff/MOOTER_CONNECTOR_HANDOFF_2026-07-25.md:24>)).

- **Exigir downgrade quando falta Ollama:** foi co-introduzido no T1 como política de disponibilidade, mas não encontrei um incidente de produção separado que o exigisse: `n/d`. O próprio comentário diz que nasceu dos testes de caminho ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3159>)).

- **A3/A3b:** introduzidos por `80359b47` em 2026-07-25. Incidente real: pediu-se ao `moo` para ler `worktrees.js` e ele devolveu `done` citando três funções inexistentes. A3 garante recusa quando o conector não consegue fornecer contexto; A3b garante leitura/injeção e recibo do ficheiro real ([ondaA.test.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/ondaA.test.js:116>)).

- A3/A3b não asseveram literalmente “nunca degradar”. Preservam “não apresentar leitura inventada como concluída”. Depois, `f753f055` tornou a suite hermética apontando todo o Ollama para uma porta morta ([ondaA.test.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/ondaA.test.js:25>)). Assim, A3b já não consegue provar que um modelo local executou; só prova a preparação do contexto.

### 2. Uso real e ledger

Snapshot local: 2026-08-16 06:13:53Z, 3.284 linhas JSON válidas.

- **89** jobs distintos foram despachados com `agent:'moo'`.
- **65** pertencem a `wave:'contrato-test'`.
- **24** ficam fora dessa wave; não afirmo que todos sejam produção.
- **2** terminaram com último `exit_code:'no-local-model'`, ambos em `contrato-test`: [ledger.jsonl:2003](<C:/Users/Paulo Loureiro/.mooter/ledger.jsonl:2003>) e [ledger.jsonl:2005](<C:/Users/Paulo Loureiro/.mooter/ledger.jsonl:2005>).
- Fora de `contrato-test`: **24 despachos, 0 `no-local-model`**.
- Downgrades reais: **`n/d`**. Existem zero campos operacionais `downgraded` e zero mensagens operacionais “passei para o Claude Code” no ledger. As ocorrências textuais pertencem ao `goal` desta investigação, não a downgrades.

Há um consumidor de produção explícito da semântica “`moo` significa $0”: o Cockpit gera `agent:"moo"` e manda escrever manualmente se o local falhar, em vez de usar um motor pago ([cockpit.html](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/plugin/mooter/skills/cockpit/cockpit.html:4122>)). Não encontrei um consumidor de produção que peça explicitamente `moo` e simultaneamente dependa de fallback pago: `n/d`.

Estes números são locais; a readiness cross-device está `FAIL`, portanto não provam cobertura da frota.

### 3. Custo para o utilizador

| Escolha | Benefício | Custo |
|---|---|---|
| Degradar sempre | O trabalho continua; T1 fica verde | Viola `agent` documentado como “Force an engine” ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3856>)); troca Ollama `$0` por `claude -p` autenticado pela subscrição ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:719>)); custo USD exato `n/d`, consumo de quota real; quebra A3/A3b. |
| Recusar sempre | Nunca transforma `$0` em subscrição | Bloqueia também T0 escolhido pelo router e reabre o problema original da porta única. |
| Explícito recusa; inferido degrada | Preserva intenção/custo e mantém disponibilidade automática | T1 tem de separar escolha explícita de inferência; a recusa atual precisa de recuperação estruturada. |
| Degradar + campo | Torna a troca auditável no retorno imediato | Já existe e não resolve A3/A3b. O ledger continua sem a medir. |

A premissa “fica só no log” está parcialmente refutada: o retorno estruturado já inclui `downgraded`, `agent`, `tier_motor` e `model` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3725>)). Porém:

- O `resumo` humano não explica a troca.
- Em sucesso, o canal textual mostra apenas esse `resumo`; os detalhes ficam no `structuredContent` ([server-apps.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/server-apps.js:463>)).
- Na recusa, o chamador recebe a causa em `error`, mas não recebe `exit_code`, `faz_assim` nem a evidência recolhida. Fica bloqueado até restaurar o Ollama ou escolher outro motor, sem recuperação estruturada ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:2210>)).

### 4. “Degradar, mas dizê-lo” não reconcilia os testes

Essa terceira via já é o contrato T1: sucesso mais `r.downgraded`. Continua a partir A3/A3b porque a mudança para `cc` ocorre antes do contrato de leitura local; com `cc`, não há `sem_contexto_para_o_local` nem `contextoInjectado` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3298>), [seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3465>)). Acrescentar outro aviso tornaria a quebra visível, mas não preservaria a semântica.

### 5. A3b: `null → undefined`

O caminho atual é:

1. `agent:'moo'` define `motorExplicito=true` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3152>)).
2. O novo guard impede o downgrade ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3304>)).
3. `alvo.js` é lido e colocado em `contextoInjectado` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3478>)).
4. `toolDispatch` tenta realmente o Ollama morto, grava `no-local-model` e devolve `{error, job_id}` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:2189>)).
5. `toolWork` sai pelo retorno antecipado de erro, que não contém `ficheiros_lidos` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3692>)). Em JavaScript, o acesso dá `undefined`.
6. Antes da alteração, o job degradava para `cc`, chegava ao retorno final e `contextoInjectado === null` produzia literalmente `ficheiros_lidos:null` ([seamless.js](<C:/Users/Paulo Loureiro/frugal/.claude/worktrees/onda-a3/packages/mooter-bridge/seamless.js:3768>)).

Gate de decisão: fonte de verdade = Git+código+ledger local; downgrade histórico sem escritor no ledger = `n/d`; consumo de quota após dispatch não é reversível; contagens foram extraídas mecanicamente; testes são projeções, não prova de uso; a degradação graciosa mantém-se para inferência; `classify.js` ficou intacto; custo de reversão é pequeno em linhas, mas alto no contrato e no gate. Objeção real: recusar pode contrariar quem prefere conclusão a custo; a resposta é que esse comportamento deve ser inferido ou explicitamente opt-in, não escondido dentro de `agent:"moo"`.

Worktree limpa em `6ce75e00`; zero ficheiros alterados e nenhum teste reexecutado por a wave proibir escritas.

**RECOMENDAÇÃO: degradar apenas quando `moo` foi inferido; quando foi explicitamente forçado, recusar com recuperação estruturada — custo: distinguir os dois casos no T1 e corrigir a prova semântica de A3b, preservando disponibilidade automática sem cobrar às escondidas.**