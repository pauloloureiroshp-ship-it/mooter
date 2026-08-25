📥 **COLAR EM:** n/a — relatório. O §1 é o que instalas.

```yaml
type: RELEASE
id: MOOTER-V140-ONDA-A
responde_a: handoff mooter-v14-conector-honesto (auditoria v1.3.5)
bundle: _handoff/mooter-v140.mcpb · 255 026 B · 15 ficheiros
sha256: 79d0fbda7b051d82383429c9f522b3aa6a40faf0a2c8453875db631e6cde0ead
testes: 106 verdes, 0 falhas · 11 novos, um por achado da Onda A
onda_a: 8 de 8 fechados
```

# 🐮 v1.4.0 — Onda A completa

Respondo primeiro à tua pergunta, porque muda tudo o resto: **parti e arranjei na mesma wave**,
pela razão que tu deste — uma camada de compatibilidade que mantém `tokens_in: 4` vivo "por uma
versão" é exactamente como estes campos chegaram aqui.

## 1. Instalar

```
C:\Users\Paulo Loureiro\frugal\_handoff\mooter-v140.mcpb
```

Settings → Extensions → `mooter` → Uninstall → Install → confirmar **1.4.0** → fechar com a tray.

## 2. Os 8 achados, com o teste que os prova

| # | Achado | O que mudou | Teste |
|---|---|---|---|
| **A1** | `mooter_await` **matava o job que esperava** — a nota da tool dizia "aumenta o timeout_s" e alguém seguiu-a | tecto de **45 s** no schema e em runtime; a nota passa a *"volta a chamar com o mesmo job_id"*; `pedido_ajustado` diz quando cortou | `A1 · await com 600s responde em 4s` |
| **A2** | `orphaned-by-restart` marcava morto **sem matar** — um Opus continuou a escrever e deixou um commit sem dono | guarda-se o **pid do trabalho** (não só o do servidor); órfão só com `pid_verificado`; `mooter_cancel` re-verifica e escreve **`cancel_failed`** se o processo resistir | `A2 · pid do trabalho no ledger` |
| **A3** | leitura despachada para o `moo`, que **inventou três funções** que não existem | detector de intenção de leitura antes do dispatch; erro `engine_sem_ferramentas` com duas saídas; com `force:true` despacha mas **carimba** `aviso_fabricacao` | `A3` + `A3b` |
| **A4** | `tier` dizia T3 num job local grátis e T0 num Opus | dois campos: **`tier_pedido`** (o que o classify achou do texto) e **`tier_motor`** (derivado do que correu). O campo ambíguo `tier` **desapareceu** | `A4` + `A4b` |
| **A5** | job foi parar a uma worktree em **%TEMP%, detached**, sem o ficheiro pedido — e nada o disse | o picker exclui detached e temp-suspeito, e **exclui pastas onde o ficheiro citado não existe**; `worktree_pedida`/`usada`/`relocated`/`relocated_porque` vêm **sempre** | `A5` + `A5b` |
| **A6** | as suites corriam contra o **ledger real e as worktrees reais** | env antes dos requires + **prova de isolamento** que aborta se algum caminho sair do sandbox | os 106 testes |
| **A7** | plano com `running: 4` e `live: 0`; S1 exibia o `job_id` do S5 | `plan.reconcile(plan, ledgerStates)` — casa por `job_id`; passo sem job volta a `pendente`; `coherence` acusa a divergência | `A7` + `A7b` |
| **A8** | 5 de 10 sessões com o mesmo título, cortado a meio de um path | `cleanTitle()` — usa o rótulo `[wave · step · objectivo]` e remove tokens que são caminho de máquina | `A8` |

**Três regras novas de `coherence`**, exactamente as que pediste: tier invertido (local com tier pago,
ou pago com T0), `tokens_in` impossivelmente baixo, e plano a dizer que corre sem job vivo.

## 3. O que os testes de caminho apanharam sozinhos

O método que impuseste (*"testa a passagem, não a peça"*) rendeu **outra vez**:

- O `isTemp` ingénuo que escrevi para o A5 excluía as worktrees das próprias suites — que vivem em
  `mkdtemp`. Um teste que estava certo passou a falhar. A regra passou a ser a **discrepância**:
  worktree em temp **com o repo fora dele**. Sem o teste, isto só aparecia em produção.
- O `MOOTER_AWAIT_MAX_S` nasceu porque provar o clamp exigia esperar 45 s numa suite. Agora é
  configurável, o que também serve para afinar noutro host sem tocar no código.

## 4. O que fica, e porquê

| Item | Estado |
|---|---|
| **Onda B** (15→6 tools) | 🔜 breaking na API pública. `resumo`, schemas e annotations já estão feitos desde a v1.3.x; falta a **fusão**, que é decisão tua |
| **Onda C** (Tasks Extension) | 🔜 a spec final sai a **28/07, daqui a 3 dias**. O C1 (handle explícito) já funciona hoje: `mooter_work` devolve handle e `mooter_await` faz o poll. O C2 (Tasks nativo) espera pela spec |
| **Onda D** (OTel) | ❄️ correcto travar até A4 assentar. Um relatório de custo sobre números partidos é pior que nenhum |
| **Container em vez de worktree** | ❄️ concordo: Sculptor e `container-use` fazem-no melhor. Onda própria |

## 5. Sobre as três coisas que disseste como sócio

**Aceito as três.** A terceira dói mais e é a mais útil: pagaste $2.37 para descobrir o que
`node path.test.js` dizia de graça. Por isso a primeira coisa que fiz nesta wave foi o **A6** — sem
suites herméticas, nenhum dos outros sete achados era verificável, e eu estaria a escrever fixes por fé.

Sobre o fosso: concordo que router local sozinho não é defensável, e que o ledger cross-vendor é o
que resta. Por isso a Onda A não levou um único atalho — **todos os campos que não sabem agora dizem
`null`**, e há três regras de coerência que denunciam o próprio conector quando os números não batem.
É a única coisa aqui que nenhum concorrente tem incentivo comercial para copiar.

## 6. BOARD

| Item | Estado |
|---|---|
| Onda A — 8 achados | ✅ **fechada**, com teste por achado |
| Suite | ✅ **106 verdes** |
| Testes herméticos | ✅ com prova de isolamento que aborta |
| Suite em Windows | 🔜 primeiro passo depois de instalares |
| Commit | 🔜 idem — o bug que o bloqueava está corrigido desde a v1.3.5 |
| Onda B/C/D | 🔜 gate teu |
| `classify.js` | ❄️ intocado |

🤝 **SOCIO:** receita? **S** — A3 sozinho evita a pior falha possível num produto de confiança: uma
resposta plausível e inventada, marcada `done` · despesa↓? **S** — A1 e A3 impedem pagar por jobs que
morrem ou que nunca podiam funcionar · risco↓? **S** — A2 fecha a porta a um agente que escreve depois
de declarado morto · reversível? **S** · escopo? **S** — só `packages/mooter-bridge/`.

📮 **DESTINO:** Paulo (instalar 1.4.0 → suite em Windows → commit) → depois escolher entre Onda B e C
