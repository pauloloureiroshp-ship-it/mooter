# 🖥️ Auditoria UX/UI do plugin Mooter — "eu usaria isto?" (2026-07-19)

> Cowork · confronto AO VIVO (computer-use no VS Code do Paulo) + package.json real + synergy map
> (14 APIs) + veredicto god-mode 4.5/10. Lente: um vibe coder de alta performance decide se adota.
> Método honesto: só afirmo o que vi na tela ou li no código; hipótese marcada como tal.

## 1. O que VI ao vivo no teu VS Code (evidência, não suposição)

1. **Activity bar com 18+ ícones** — o 🐮 do Mooter (cow.svg, monocromático) **não consegui localizar com certeza** no meio de Files/Search/SCM/Run/Remote/Extensions/LiveShare/containers/Python/GitLens/Todo-Tree/Gemini… Se EU (que procuro o produto) me perco, o vibe coder casual nunca acha. **Descoberta = problema nº1.**
2. **Vibe coder afogado em janelas** — 3 janelas VS Code sobrepostas + painéis Gemini Code Assist + Claude Code + Codex SIMULTÂNEOS + Welcome + File Explorer. É exatamente a dor que o cockpit deveria resolver, mas o cockpit não estava à vista. O produto que organiza o caos estava enterrado no caos.
3. **"Try out the new Agents window"** visível na tela nativa — a comoditização da casca (god-mode 07-13) não é teoria: está a 1 botão de distância, de graça, no VS Code do Paulo AGORA.
4. **Ruído de terceiros:** Todo-Tree quebrado ("Failed to find vscode-ripgrep"), Extensions com badge de warning. O plugin Mooter compete por atenção com extensões que já falham silenciosamente.

## 2. O que o plugin OFERECE hoje (package.json real)

Activity bar container único `mooter` · **2 webviews** (Cockpit + Live Preview) · 7 comandos · 1 StatusBarItem (savings) · walkthrough de 3 passos · keybinding `ctrl+k ctrl+m`. Tudo via **webview HTML-string** (o descartável do veredicto 4.5/10). `extensionKind: workspace`, `untrustedWorkspaces` suportado (bom para confiança).

## 3. Confronto com a doutrina VS Code (o synergy map aplicado à UX)

| Princípio VS Code (doc oficial) | Plugin hoje | Veredicto UX |
|---|---|---|
| **Projetar estado na UI nativa** (FileDecoration, ViewBadge, StatusBar) em vez de reconstruir | Quase tudo em webview; ZERO decoration/badge nativo (até a VS-W1) | ⚠️ o maior gap — e é o que a VS-W1 corrige |
| **Progressive disclosure** (não despejar tudo) | Cockpit + Live Preview + 4 views avançadas escondidas atrás de comando | 🟡 razoável, mas 2 webviews competindo confunde |
| **Descoberta** (ícone claro, walkthrough, command palette) | Walkthrough ✅ existe; ícone monocromático se perde | ⚠️ ícone precisa de cor/badge que puxe o olho |
| **Feedback óptimista** (ação → resposta visível imediata) | Auditoria 07-13 achou 7 toggles sem feedback + 2 controlos mortos | ❌ mata confiança; vibe coder abandona |
| **Custo honesto de contexto** (webview retido só quando preciso) | `retainContextWhenHidden` em painel (auditoria MEO) | 🟡 performance — vigiar |
| **Não competir onde a plataforma é grátis** (Agents window) | Cockpit ainda tem "Live Sessions" que a Microsoft comoditizou | ⚠️ reposicionar no fosso, não na casca |

## 4. Nota como vibe coder de alta performance: **5.5/10** (era 4.5 em 07-13; a VS-W1 sobe)

**Adotaria?** Hoje, com hesitação — pelo motor ($0 routing é real e único), não pela cabine. **A cabine ainda não passa no "teste do amigo"**: instalo, me perco na activity bar, vejo 2 webviews sobrepostos, encosto num toggle que não responde, e volto pro terminal. O que segura a nota subindo: a VS-W1 (semáforo nativo) ataca 3 dos 4 gaps de UX de uma vez — decoration puxa o olho, beacon dá o próximo passo, badge dá o placar. É a direção certa.

## 5. As 6 correções que fariam eu ADOTAR (priorizadas por impacto/esforço)

| # | Correção | API (synergy map) | Esforço | Já em andamento? |
|---|---|---|---|---|
| 1 | **Ícone com cor+ViewBadge** que puxa o olho na activity bar lotada | ViewBadge (#4 do map) | S | ✅ VS-W1 (badge de pendências) |
| 2 | **Matar os 2 controlos mortos + feedback óptimista nos 7 toggles** (auditoria 07-13) | webview | M | ❌ backlog F0 não-mentir |
| 3 | **Fundir os 2 webviews** (Cockpit vs Live Preview competem) numa navegação clara | webview/custom editor | M | 🟡 god-mode F2 (dedup) |
| 4 | **Semáforo nas worktrees** (o estado no campo de visão) | FileDecoration (#2) | S | ✅ VS-W1 entregue |
| 5 | **Parar de reconstruir "Live Sessions"** — enriquecer a Agents window nativa | (proposed — vigiar) | — | ⏸ decisão god-mode |
| 6 | **Onboarding de 60s** (o teste do amigo: instala→valor→volta no dia seguinte) | walkthrough+Resume | L | ❌ F1/F5 god-mode |

## 6. Recomendação de sócio (o que fazer com esta auditoria)

A VS-W1 não é polimento — é **correção estrutural de UX** que já cobre #1 e #4. Mas ela sozinha não fecha o "teste do amigo": os controlos mortos (#2) e os 2 webviews (#3) matam a primeira impressão ANTES do semáforo brilhar. **Ordem certa:** mergear VS-W1 (o novo respira) → depois uma wave "F0 não-mentir de UX" (matar controlos mortos + feedback óptimista) → só então o teste do amigo. Não adianta semáforo lindo num cockpit que mente. Isto não é wave nova de features — é higiene de confiança, e é barata.

📮 Alimenta: fila única (candidata pós-VS-W1) · Currículo Vivo (auditoria de produto ao vivo) ·
os masterprompts do próximo round. Nota 5.5 registrada; re-medir pós-merge + pós-F0-UX.
