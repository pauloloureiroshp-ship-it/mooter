# Rodada 2 — Concorrentes, Facilitadores e Performance

**Data:** 2026-06-11 · **Complementa:** UX-SPEC + MASTERPROMPT (este doc altera 3 decisões — ver §4)

---

## 1. ⚠️ Concorrentes directos existem — e isso é boa notícia

O Marketplace já tem **≥7 extensões de usage/cost tracking para Claude Code** (web hoje):

| Extensão | O que faz | O que NÃO faz |
|---|---|---|
| [Clusage](https://marketplace.visualstudio.com/items?itemName=Ajax1029.clusage) | custo, tokens, quota live na status bar + dashboard | routing, porquê, savings counterfactual |
| [ccusage-vscode](https://marketplace.visualstudio.com/items?itemName=suzuki0430.ccusage-vscode) | monitor de custos na status bar | idem |
| [Claude Usage Analytics](https://marketplace.visualstudio.com/items?itemName=AnalyticEndeavors.claude-usage-analytics) | stats em tempo real | idem |
| [Claude Code Usage Tracker](https://marketplace.visualstudio.com/items?itemName=YahyaShareef.claude-code-usage-tracker) | tokens + sessões | idem |
| + 3 outras ([Claude Status](https://marketplace.visualstudio.com/items?itemName=long-kudo.vscode-claude-status), [AI tracker](https://marketplace.visualstudio.com/items?itemName=CodeMaman.vscode-extension-claude-code-ai-tracker), [ccusage](https://marketplace.visualstudio.com/items?itemName=ahmedhamedaly.ccusage)) | variações do mesmo | idem |

**Leitura estratégica:**
1. **Validação de demanda** — 7 extensões independentes = devs querem ver custos do Claude Code no IDE. Mercado provado, sem precisares de educá-lo.
2. **"Custo na status bar" é commodity.** Se o Mooter for lançado como mais um cost tracker, é o 8º da lista. ❌
3. **O fosso do Mooter é o counterfactual:** eles mostram **o que gastaste**; o Mooter mostra **o que pouparam e porquê** (decisão de routing, confidence, doutrina HIGH_RISK, modo). Nenhum deles tem um motor de routing por baixo — não conseguem copiar isto sem construir o Mooter inteiro.
4. **Técnica a roubar deles (legítimo):** o ccusage lê os JSONL nativos do Claude Code (`~/.claude/projects/**/*.jsonl`) para custos reais por token. O Mooter extension deve **cruzar** essa fonte (custo real) com `decisions.log` (decisão + alternativa) → "custaste $0.08, terias gasto $0.50 sem routing". Número que nenhum concorrente consegue produzir.

**Reposicionamento do listing:** de "see what your AI coding costs" → **"Your Claude Code already has a cost tracker. Mooter is the autopilot that lowers the bill."** Comparação honesta com ccusage/Clusage no README ("works great alongside them — Mooter adds the routing layer").

## 2. Facilitadores de terceiros (build faster)

| Ferramenta | Veredicto |
|---|---|
| [reactive-vscode](https://github.com/KermanX/reactive-vscode) (Vue reactivity sobre a API VS Code, ~estado declarativo) | 🟡 Tentador, mas introduz paradigma Vue num stack Preact — duas mentalidades de reactividade. Só adoptar se o host-side state crescer; F0-F2 não justifica |
| [antfu/starter-vscode](https://github.com/antfu/starter-vscode) | ✅ Usar como referência de scaffold (esbuild config, publish scripts, CI) — não como dependência |
| `@vscode-elements/elements` + `@vscode/codicons` | ✅ Já decidido (BLUEPRINT) |
| ccusage (lib/CLI open-source) | ✅ Estudar o parser JSONL deles antes de escrever o nosso (licença e qualidade a verificar no repo) |

## 3. Performance — decisões refinadas

1. **Fonte de custo real = JSONL do Claude Code** (não estimativas): parse incremental com offset persistido (workspaceState), nunca reler ficheiros inteiros; os JSONL crescem muito.
2. **Join custo↔decisão em background:** índice por session_id/timestamp em memória (Map, LRU 1k itens), construído lazy à primeira abertura do painel.
3. **Pipeline de dados único:** DataService emite snapshots imutáveis; webview recebe diffs — nada de polling do webview.
4. **Watchers adaptativos:** fs.watch nos JSONL do projecto activo apenas; restantes projectos só on-demand (vista "all projects" não é MVP).
5. Budgets da UX-SPEC §9 mantêm-se; acrescentar: parse de 10MB de JSONL <500ms (benchmark com fixture real na F0.2).

## 4. Alterações ao MASTERPROMPT (delta)

- **F0.2 (schema audit) passa a incluir:** parser dos JSONL nativos do Claude Code + estudo do parser do ccusage + benchmark de 10MB. O join custo-real↔decisão é a feature-assinatura.
- **F2 (feed):** linha de decisão mostra custo REAL (JSONL) e custo evitado (decisão vs T3) — não estimativas.
- **F3 (listing):** copy reposicionada (§1.3) + secção README "Mooter vs cost trackers".

**Sources:** Marketplace (links acima) · [reactive-vscode](https://github.com/KermanX/reactive-vscode) · [starter-vscode](https://github.com/antfu/starter-vscode) · [guia extensões 2026](https://abdulkadersafi.com/blog/building-vs-code-extensions-in-2026-the-complete-modern-guide)
