📥 **COLAR EM:** n/a — relatório. O §1 é o que instalas.

```yaml
type: RELEASE + INCIDENT
id: MOOTER-V135-2026-07-25
bundle: _handoff/mooter-v135.mcpb · 237 994 B · 15 ficheiros
sha256: 04b9e7d36af1494828f5b19771f253eb741cc90dc4321df00792d4ba3a96a106
testes: 95 verdes, 0 falhas · 10 do caminho observável
```

# 🐮 v1.3.5 — Ondas C, D, E feitas, e um bug meu apanhado em produção

## 1. 🔥 Instala esta, e não a v1.3.3 nem a v1.3.4

```
C:\Users\Paulo Loureiro\frugal\_handoff\mooter-v135.mcpb
```

⚠️ **As v1.3.3 e v1.3.4 estão queimadas.** Introduzi nelas um bug que parte todos os
dispatches em Windows. Explico no §2, porque é a parte mais útil deste relatório.

## 2. 🔴 O incidente — o meu label cortou três jobs ao meio

Na v1.3.3 resolvi a queixa "8 sessões com o mesmo título" pondo um cabeçalho no prompt de arranque:

```js
return `# ${label}\nLê o ficheiro ${mpPath} e executa…`;   // ← a newline
```

No Windows o spawn é `shell: true`, e **o cmd.exe termina o comando na primeira newline**. O agente
recebia só o cabeçalho e nunca via a instrução de ler o masterprompt. Três jobs responderam, em bom
português, *"o teu prompt chegou cortado, cola-me o resto"*. Eu culpei o transporte; era eu.

**Como foi apanhado:** por medição, não por sorte. Despachei uma sonda a perguntar o tamanho do ficheiro
recebido — ela respondeu e provou que o transporte estava bom. O erro estava no argumento, não no canal.

**Fix, em três camadas:**
1. `bootstrapPrompt` devolve **uma linha**, com o label entre `[…]` no início — o título da sessão
   continua útil e nada se parte.
2. O texto do label é higienizado: sem `\r\n`, sem `" \` | & < > ^ %` — tudo o que uma shell lê.
3. `assertSingleLineArgs(cmd)` corre **antes** do spawn. Um argumento multi-linha passa a recusar o
   dispatch com uma mensagem explícita, em vez de truncar em silêncio.

**Porque é que 94 testes não o apanharam:** o spawner é falso nos testes, e um spawner falso não tem
shell. O **T9** novo olha para o **comando construído**, não para a execução — é a única forma de ver
isto sem um Windows real. É exactamente a lição do teu §5, aplicada a um bug meu.

## 3. Onda C — a frota deixou de exigir git

`worktrees.js` novo, com três níveis:

| nível | o que faz |
|---|---|
| listar | `mooter_worktrees` — cada pasta do projecto, a sua branch, e se está ocupada |
| escolher | worktree ocupada **já não é um beco**: o conector procura uma livre e muda-se para lá |
| criar | `create_worktree: true` — opt-in, porque é a única coisa aqui que escreve fora do job dir |

Se tudo estiver ocupado e não houver autorização para criar, o erro passa a listar **quais** estão
ocupadas e por que jobs — em vez de dizer "passa outra worktree" a quem não sabe o que isso é.

## 4. Ondas D e E

- **Painel inline mínimo:** wave · quem trabalha · plano · rodapé. GPU, VRAM, modelos residentes e
  histórico passam para **fullscreen**, a um clique. A capacidade já estava declarada em
  `availableDisplayModes` e nunca tinha sido usada para **esconder**, que é o trabalho difícil.
- **Custo e coerência ao fundo, mas sempre visíveis** — e o `$0 · tudo local` deixou de desaparecer
  por ser falsy.
- **E2:** `mooter_collect` devolve `allowed_tools_effective`, lido do comando realmente executado.
  Dá para auditar se o `allowedTools:"Read"` que pediste virou mesmo `--sandbox read-only`.
- **15 tools reordenadas**: as simples primeiro, `dispatch`/`route`/`run` marcadas **"Avançado"** e no
  fim. Descrições reescritas em uma linha — o que faz, quando usar. Zero changelog interno.

## 5. O que sobra, e é teu

| Item | Porquê |
|---|---|
| **Commit** | tentei duas vezes por job e ambas caíram no bug do §2. Com a v1.3.5 instalada, corre outra vez — ou faz `git add` selectivo à mão, a lista está no `_handoff/INSTALAR_MOOTER_V13.md` |
| **Suite em Windows** | mesma razão. É o primeiro teste a fazer depois de instalar |
| **Fundir 15 → 8 tools** | muda a API pública; é decisão tua |
| **Hierarquia fina do painel** | o esqueleto inline/fullscreen está feito; o afinamento quero-o contigo a ver |

## 6. BOARD

| Item | Estado |
|---|---|
| Onda A + B (v1.3.3) | ✅ |
| Onda C — worktrees | ✅ 6 testes |
| Onda D — painel | ✅ D1-D5 |
| Onda E — segurança | ✅ E1 + E2 |
| Bug do label (v1.3.3/1.3.4) | ✅ corrigido + guard + teste T9 |
| Suite | ✅ **95 verdes** |
| Commit | 🔜 depois de instalares |
| v1.3.3 e v1.3.4 | ❌ **não instalar** |

🤝 **SOCIO:** despesa↓? **S** — o guard do §2 impede pagar tokens de arranque a jobs que iam receber
meio prompt · risco↓? **S** — E2 torna as permissões auditáveis pela primeira vez · reversível? **S** ·
escopo? **S** — zero toques em `classify.js`.

📮 **DESTINO:** Paulo (instalar 1.3.5 → repetir o job de commit → suite em Windows)
