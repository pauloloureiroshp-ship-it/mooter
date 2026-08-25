# 🔍 Por que o Paulo "não viu diferença" — diagnóstico honesto do semáforo (2026-07-20)

> Cowork · navegação ao vivo (computer-use) no VS Code do Paulo após o F5+reload. O feedback
> "não vi grande diferença, falta algo" está CERTO — e aponta um gap de design real, não só "não instalou".

## 1. O que vi ao vivo (fato)

- Janela ativa = **"frugal"** (a normal), plugin **INSTALADO** (versão main). NÃO é "[Extension Development Host]".
- Cockpit funcional: Cockpit/Control/Waves/Mapa · savings **$0.00** (mudou de $0.05 — dado vivo) · Fleet 8 moos · Live Sessions.
- **Explorer aberto = repo `FRUGAL` como PASTA ÚNICA** (packages, tools, scripts…). **Zero badge de semáforo** em qualquer pasta.

## 2. Por que o semáforo NÃO aparece (3 razões, em camadas)

1. **Não está instalado.** VS-W1 (@782b8df) está na branch, não em main, não no .vsix instalado. O plugin que corre é o de sempre. Se o F5 rodou, ou fechou, ou rodou a versão main (sem semáforo) — a janela que vejo não é dev host.
2. **O semáforo não vive no cockpit.** Por design, o FileDecoration pinta as **worktrees no Explorer** e o beacon vive na **status bar** — NÃO dentro do webview. Olhar o cockpit nunca mostraria o semáforo. (O Paulo estava a olhar o cockpit.)
3. **⭐ O GAP REAL (o que o teu instinto pegou):** o semáforo foi construído para decorar **worktrees** (`frugal-vs-w1`, `frugal-mesh-a`…) — mas **tu abres o repo principal como pasta única**, não um multi-root com as worktrees no Explorer. **Se as worktrees não estão no teu file tree, não há o que decorar.** Os badges de worktree brilham num layout que tu não usas no dia a dia.

## 3. O insight de sócio (a magia): o feedback está certo, e aqui está o porquê

O semáforo, como está, tem um **descasamento entre onde aparece e onde tu olhas**:

| Peça | Onde aparece | Tu olhas aí? |
|---|---|---|
| FileDecoration (badges) | worktrees no Explorer (layout multi-root) | ❌ tu abres o repo como pasta única |
| Paste Beacon | status bar (global) | 🟡 aparece, mas precisa da fila `dispatch-queue.json` cheia — que hoje está vazia |
| ViewBadge (nº no 🐮) | activity bar (global) | 🟡 aparece, mas precisa de itens na fila |

Ou seja: **duas das três superfícies dependem de uma fila que ninguém alimenta ainda**, e a terceira (badges) depende de um layout que tu não usas. Por isso, mesmo instalado, seria sutil ou invisível na tua rotina. **Não é bug — é um gap de produto: construímos o motor do semáforo, mas não o fluxo que o acende nem a superfície onde tu de facto vives.**

## 4. O que falta fazer (a recomendação honesta — 3 coisas, por impacto)

1. **VS-W1.5 — alimentar a fila (o que dá VIDA ao semáforo).** O `dispatch.js` (moo-dispatch, já no origin) precisa escrever `dispatch-queue.json` quando o Cowork gera um dispatch. Sem fila cheia, o beacon e o badge ficam mudos. **Isto é o que transforma infra em experiência viva** — é a peça que faltava, e o teu "falta algo" é literalmente isto.
2. **Levar o semáforo para onde tu OLHAS.** Já que abres o repo como pasta única, o estado tem de aparecer no **cockpit** também — a "Live Sessions strip" (spec Semáforo §5.3): uma linha por sessão com a cor do estado, DENTRO do cockpit que tu já abres. O FileDecoration de worktrees vira bônus para quem usa multi-root; o cockpit-strip é o palco principal.
3. **Um momento "aha" de demonstração.** O F5 com fixtures estáticas não impressiona. O que impressiona é ver a fila **fluir**: um dispatch entra → beacon acende 📥 → clicas Copiar → some → próximo. Isso precisa da #1 (fila viva) + um roteiro de demo real, não fixtures paradas.

## 5. Veredicto

O teu instinto ("falta algo, precisa melhorar") é **correto e valioso** — pegou o gap que a auditoria de código não pegaria: **o semáforo está tecnicamente perfeito e experiencialmente incompleto.** Construímos o relógio; falta ligá-lo à corrente (a fila) e pô-lo na parede onde tu olhas (o cockpit). Não é retrabalho — é a próxima wave (VS-W1.5), que já estava mapeada mas agora sobe de prioridade, porque é ELA que produz a "grande diferença" que não viste.

📮 Alimenta: fila (VS-W1.5 sobe) · Currículo Vivo (auditoria de UX ao vivo que pegou gap de produto) ·
o próximo masterprompt (VS-W1.5 para o CC, pós-merge).
