# Wave WCOCKPIT-4 — estágio git por sessão (safety) + worktree visual

CONTINUA na branch wave-WCOCKPIT. 100% ADITIVO. Acrescenta DUAS coisas por live session, ambas com fonte real.

## 1. Estágio git por sessão (SALVAGUARDA — não fechar sessões com trabalho por guardar)
Helper novo `gitStage(cwd)` (em host-extra ou mode-registry; git porcelain, timeout 3s, never-throws):
- `git -C <cwd> status --porcelain` → conta dirty (modificados/untracked); col1 != espaço = staged.
- `git -C <cwd> rev-list --count --left-right @{u}...HEAD` (se houver upstream) → ahead/behind.
- Devolve `{ state, dirty, staged, ahead, behind }` com state ∈ clean | uncommitted | staged | ahead.
Row: `row.gitStage`. No rowFor, **chip de estágio git**:
- ✓ clean (verde discreto) · ● N uncommitted (âmbar) · ◐ staged (azul) · ↑N to push (azul).
- Quando dirty>0 OU ahead>0: mostrar dica de segurança "⚠ trabalho por guardar — não fechar" no card.
Objectivo: o vibe coder vê NUM RELANCE se uma sessão tem trabalho não-commitado/por-pushar antes de a fechar.

## 2. Worktree visual (quais sessões partilham worktree)
Já temos `worktrees()`. Reforçar o VISUAL: sessões no mesmo linked worktree partilham o chip "⌥ wt:<nome>"
E um **accent de cor por worktree** (ex.: borda-esquerda colorida consistente por wt) para se VER que são o
mesmo trabalho físico. Header do grupo conta "N em wt:<nome>". (Sem borda arredondada em border-left — regra.)

## VERIFICAÇÃO (HTML-level, não só dados)
Testes que chamam rowFor(sampleRow) e fazem assert: contém o chip de estágio git com o estado certo
(clean/uncommitted/staged/ahead), a dica "não fechar" quando dirty>0/ahead>0, e o accent+chip de worktree
quando worktree definido. + unit do gitStage (parse de porcelain e de rev-list). Todos verdes.

## REGRAS
classify.js FROZEN (sha 427d8c0b...364bc48f, prova no fim). Aditivo. git add selectivo. NUNCA
merge/push/tag/deploy (gate humano). git porcelain é READ-ONLY (status/rev-list — nunca commit/push no helper).
Escrita JSON atómica. No fim: bloco status + Notion (sub 3876f6e4-2bc4-812b-b5d3-e6433a6cc8af) + vault.

## BASELINE OBRIGATÓRIO — não regredir o print
O cockpit v4 JÁ está instalado e aprovado pelo Paulo (vaquinhas animadas por modo, brain link,
modelo-dropdown por sessão, relógio/última-interação, Notion+Obsidian+refresh, **worktree chip já
presente**, selector de modo + toggle auto por sessão, agrupamento por projeto, waiting-for-cowork).
ISTO É O BASELINE: preserva tudo exactamente como está. NÃO mexer/regredir nada disso. A ÚNICA adição
desta wave é o **chip de estágio git** (clean/uncommitted/staged/ahead + dica "não fechar"). O accent
de cor por worktree é um reforço opcional do chip que já existe — não remover o chip actual.
Testes: além dos HTML-asserts do estágio git, garantir que os asserts do v4 (modo/modelo/auto/brain/
notion/obsidian/worktree/projeto) CONTINUAM verdes (regressão = falha).
