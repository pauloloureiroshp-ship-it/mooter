# Mooter for VS Code — UX/UI Specification v1.0

**Data:** 2026-06-11 · **Escopo:** Cockpit + Launcher (aprovado) · **Companion:** BLUEPRINT (arquitectura) + MOCKUP (visual) + MASTERPROMPT-F0 (execução)
**Norma de referência:** [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) — cada superfície abaixo cita a guideline aplicável. Seguir as guidelines à letra é o que separa "extensão indie" de "extensão que a Anthropic mostra no palco".

---

## 0. Princípios de design (decidem todos os empates)

1. **Calm by default.** O Mooter trabalha em silêncio; a UI só fala quando tem valor a mostrar. Zero notificações não solicitadas, zero badges vermelhos, zero "upgrade now".
2. **Every number earns trust.** Cada $ mostrado tem um "porquê" a um clique. Se um dado não está disponível, mostrar "—" com tooltip explicativo — nunca inventar nem extrapolar.
3. **Native first.** Usar elemento nativo VS Code (TreeView, QuickPick, Notification) sempre que possível; webview só onde a expressividade paga o custo (Cockpit). O utilizador nunca deve sentir que saiu do VS Code.
4. **The CLI is the truth.** A UI nunca faz nada que o CLI não faça; todo o botão tem equivalente `mooter <cmd>` visível (tooltip), ensinando o caminho do poder.
5. **Degrade with grace.** Tracker off, CLI ausente, log vazio — cada estado degradado tem desenho próprio com 1 acção de recuperação. Nunca um spinner eterno, nunca um stack trace.

**Voz e tom (UI copy, EN):** curto, factual, ligeiramente caloroso. "No decisions yet — start a session" não "Oops! Nothing here 😢". Números primeiro, adjectivos nunca. O 🐄 é o único momento de personalidade permitido por ecrã.

---

## 1. Persona e jobs-to-be-done

**Primária — "Vibe coder com Max":** paga $100+/mês, usa a extensão Claude Code gráfica, não abre terminal se puder evitar. Jobs: (1) *"mostra-me que não estou a desperdiçar dinheiro"*, (2) *"diz-me que está tudo a funcionar sem eu perceber de hooks"*, (3) *"deixa-me começar uma sessão bem configurada com um clique"*.
**Secundária — power user CLI:** já vive no terminal; usa a extensão só como dashboard ambiente. Job: *"glanceability sem mudar de contexto"*. Implicação: o cockpit tem de ser útil **só de olhar**, sem interacção.

---

## 2. Mapa de superfícies

| # | Superfície | API/Guideline | Conteúdo | Frequência de uso |
|---|---|---|---|---|
| S1 | Activity Bar item | [activity-bar](https://code.visualstudio.com/api/ux-guidelines/activity-bar) | Ícone Mooter → View Container | diária |
| S2 | Webview View (sidebar) | [webviews](https://code.visualstudio.com/api/ux-guidelines/webviews) | Cockpit (4 vistas) | diária |
| S3 | Status Bar item | [status-bar](https://code.visualstudio.com/api/ux-guidelines/status-bar) | tier·modelo·saving live | ambiente (sempre visível) |
| S4 | Command Palette | [command-palette](https://code.visualstudio.com/api/ux-guidelines/command-palette) | 6 comandos `Mooter:` | semanal |
| S5 | Quick Picks | [quick-picks](https://code.visualstudio.com/api/ux-guidelines/quick-picks) | selector de modo, pack picker | semanal |
| S6 | Notifications | [notifications](https://code.visualstudio.com/api/ux-guidelines/notifications) | só 3 casos permitidos (ver §8) | rara (by design) |
| S7 | Walkthrough | [walkthroughs](https://code.visualstudio.com/api/ux-guidelines/walkthroughs) | "Learn Mooter" 4 passos | once |
| S8 | Settings | [settings](https://code.visualstudio.com/api/ux-guidelines/settings) | 5 settings, prefixo `mooter.` | rara |
| S9 | Welcome Views | [views](https://code.visualstudio.com/api/ux-guidelines/views#welcome-views) | empty states nativos pré-webview | first-run |

**Regra das guidelines a respeitar:** Activity Bar item só se justifica com conteúdo persistente (✅ temos); não usar Panel (bottom) — o cockpit é sidebar por natureza (consulta lateral, não output de build).

---

## 3. Design tokens

### 3.1 Cores — só `--vscode-*` + 1 cor de marca

| Token Mooter | Mapeia para | Uso |
|---|---|---|
| `--moo-bg` | `--vscode-sideBar-background` | fundo do painel |
| `--moo-card` | `--vscode-editorWidget-background` | cards |
| `--moo-border` | `--vscode-widget-border` | bordas (1px, nunca sombras pesadas) |
| `--moo-fg` / `--moo-fg-dim` | `--vscode-foreground` / `--vscode-descriptionForeground` | texto |
| `--moo-green` | `--vscode-charts-green`, fallback `#4ec97a` | savings, T0, ACTIVE — **única cor de assinatura** |
| `--moo-t1/t2/t3` | `--vscode-charts-blue/yellow/red` | tier chips |
| `--moo-focus` | `--vscode-focusBorder` | focus rings (nunca custom) |
| `--moo-link` | `--vscode-textLink-foreground` | links |

⚠️ Proibido: cores hex hard-coded (excepto fallback do verde), gradientes, sombras coloridas. O painel tem de ser indistinguível de UI nativa em **qualquer** tema — testar em Dark+, Light+, High Contrast, Solarized.

### 3.2 Tipografia e espaçamento

- Fonte: `var(--vscode-font-family)` / `var(--vscode-font-size)` (13px base). Números grandes do hero: 26-30px, `font-variant-numeric: tabular-nums` (savings mudam sem layout shift).
- Mono (prompts no feed): `var(--vscode-editor-font-family)`.
- Grelha de espaçamento: múltiplos de 4px. Padding de card: 12-16px. Gap entre cards: 8px.
- Densidade: alvo ≤3 níveis de hierarquia visível por ecrã. O Claude Code panel é arejado — copiar essa respiração, não a densidade de um dashboard Grafana.

### 3.3 Iconografia

- Sistema: `@vscode/codicons` (`$(check)`, `$(warning)`, `$(history)`, `$(play)`) — consistência nativa.
- Marca: 🐄 emoji APENAS no título do painel e status bar. Ícone da Activity Bar: **SVG monocromático próprio** (silhueta de vaca minimal, 24×24, `currentColor`) — guideline exige monocromático; emoji não é aceitável aí.
- Tier chips: texto T0-T3/T5 + cor, não ícones (escala melhor, a11y melhor).

---

## 4. Especificação por vista (webview)

### V1 — Cockpit (default)

**Anatomia (top→bottom):** Hero savings → 3 KPI minis → distribuição de tiers (barras horizontais) → card de modo → botão Launcher → microcopy.

| Elemento | Spec | Interacção |
|---|---|---|
| Hero "$4.31 saved today" | Número verde tabular, sub "vs all-Opus · 52% below · 23 prompts" | Click → V2 filtrada hoje |
| KPI minis (Total/Prompts/Saved%) | All-time, do tracker | Tooltip com período exacto dos dados |
| Barras de tiers | % por tier hoje, animação width 200ms ease-out (só na 1ª render) | Click numa barra → V2 filtrada por tier |
| Card de modo | Segmented control beast/auto/zen | Persiste via `mooter-mode.js`; mostra "applies to next session" |
| **Launcher** | Botão primário único do ecrã, estilo `--vscode-button-background` MAS verde Mooter | Estados: normal → "Opening Claude Code…" (1.5s) → normal. Se ext. oficial ausente: botão vira "Install Claude Code" |

**Estados:** loading (skeleton 3 blocos, sem spinner, <300ms esperado) · tracker-off (hero mostra dados do log local + banner discreto "tracker offline — start: `mooter stats --serve`") · sem dados hoje (hero "$0.00 — no sessions yet today", resto normal).

### V2 — Decisions (feed)

- Linha: `[chip tier] prompt truncado (1 linha) | -$0.42 | 2m`. Expandir (click/Enter): modelo escolhido, confidence, sinais (pills), pack hint, custo evitado vs T3.
- **Live:** novas decisões entram no topo com fade-in 150ms; máx. 1 reflow/s (batch). Auto-scroll só se o utilizador está no topo (nunca roubar posição de leitura).
- Virtualização a partir de 200 itens. Filtros no View Toolbar (codicon `$(filter)`): por tier, por sessão, hoje/semana.
- Caso especial **HIGH_RISK floor**: chip T3 com `$(shield)`, detalhe explica a doutrina em 1 frase. Este é o momento "wow" para reviewer da Anthropic — segurança visível e explicável.

### V3 — Packs

- Card por pack: ícone, nome, estado (ACTIVE no workspace / idle / error), última activação.
- Acções: validate (one-click, output em toast inline no card, não notification), docs link.
- ⚠️ Gate: vista escondida atrás de `mooter.packs.enabled` até o bug packs-wired estar fixado. Não mostrar UI de funcionalidade dark.

### V4 — Doctor

- Lista de checks com semáforo ✅/🟡/❌, descrição 1 linha, fix-button quando auto-remediável.
- Fix-button corre comando no **terminal integrado visível** (não escondido — o utilizador aprende e confia).
- Header: resumo "Healthy with 2 warnings" + timestamp do último run + `$(refresh)`.
- Check especial **"Hook integration"**: detecta o resultado do Teste P0 em runtime (hook dispara na extensão oficial?) e explica o caminho activo (graphical vs terminal mode). Transforma a incerteza técnica em transparência de produto.

---

## 5. Fluxos críticos

### F1 — First-run (o que decide a review de 5★)
```
Install → activation lazy → Welcome View nativa (S9, sem webview ainda):
  "Mooter needs its CLI engine."
  [Install CLI]  → terminal integrado com one-liner curl (visível, não mágico)
  [I have it]    → doctor check → abre Cockpit
→ Walkthrough auto-sugerido (nunca auto-aberto):
  1. Install the engine (auto-completa via doctor)
  2. Check your setup (botão = doctor)
  3. Start a routed session (botão = launcher)
  4. Read your first saving (auto-completa à 1ª decisão no log) ← momento mágico
```
**Meta:** install→primeira decisão visível <5 min. Cada passo tem fallback documentado.

### F2 — Daily (glance loop)
Status bar mostra acumulado → glance (0 cliques, job #1 da persona 2) → opcional: click → cockpit → opcional: decisão estranha → expand → "porquê" → confiança reforçada → fecha.

### F3 — Launch session
Cockpit [New Claude Code session] → modo aplicado → URI handler abre tab oficial → (se P0 falhou: terminal mode com `claude`, copy idêntica) → decisões aparecem no feed em ≤2s após cada prompt.

### F4 — Troubleshooting
Status bar mostra `$(warning)` em vez de saving → click → Doctor (não Cockpit) → check vermelho no topo → fix-button → re-run automático → verde.

---

## 6. Superfícies nativas (fora do webview)

### S3 — Status Bar (a superfície mais usada)
- Alinhamento: **direita**, prioridade ao lado do ✱ Claude Code. Formato: `🐄 T2 · $4.31↓` (≤16 chars; modelo só no tooltip — economia de espaço é respeito).
- Tooltip (markdown): última decisão completa + "Open Mooter Cockpit".
- Estados: normal · `$(sync~spin)` 2s ao processar · `$(warning)` se doctor vermelho · oculto se `mooter.statusBar.enabled: false`.
- ⚠️ Guideline: nunca mudar de cor de fundo (reservado a erros do workbench).

### S4 — Command Palette (todos prefixados "Mooter: ")
`Open Cockpit` · `New Claude Code Session` · `Switch Mode` · `Run Doctor` · `Show Today's Decisions` · `Open Walkthrough`. Categoria `Mooter`, verbos no infinitivo EN, sem emoji nos títulos (guideline).

### S5 — Quick Picks
Switch Mode: 3 itens com descrição de 1 linha cada ("beast — always strongest model", "auto — Mooter decides (recommended)", "zen — prefer local/cheap"). `placeHolder` explica o efeito; item activo marcado `$(check)`.

### S8 — Settings
`mooter.statusBar.enabled` (true) · `mooter.trackerPort` (7821) · `mooter.telemetry` (false, **opt-in**) · `mooter.packs.enabled` (false até fix) · `mooter.launcher.preferTerminal` (false). Descrições com link para docs. Nada de settings que duplicam config do CLI — single source of truth é `~/.mooter`.

---

## 7. Acessibilidade (não negociável — e raro em extensões AI, logo diferenciador)

- **Teclado:** tab order lógico em todas as vistas; Enter/Space expande decisões; Esc fecha expansões; setas navegam o feed. Zero interacções mouse-only.
- **Screen reader:** webview com landmarks (`role="region"` + `aria-label` por secção); hero com `aria-live="polite"` (anuncia savings novos, não cada repaint); decisões como `role="listitem"` com label composto ("Tier 2, sonnet, saved 42 cents, 2 minutes ago").
- **High Contrast:** testar `Default High Contrast` — os tier chips precisam de borda além de cor (cor nunca é o único canal; chips têm texto T0-T3 sempre).
- **Reduced motion:** `prefers-reduced-motion` desliga animações de barras e fade-ins.
- **Focus:** `--vscode-focusBorder` em tudo o que é interactivo; nunca `outline: none`.

---

## 8. Notificações — política restritiva (3 casos, e mais nenhum)

| Caso | Tipo | Frequência máx |
|---|---|---|
| CLI desactualizado com breaking change | warning, botão "Update" | 1×/versão |
| Doctor passou a vermelho (hook quebrado) | warning, botão "Run Doctor" | 1×/sessão VS Code |
| Primeira poupança da vida do utilizador | info "Mooter just saved you $0.42 — see why", botão "Show me" | 1× ever |

Tudo o resto (savings diários, packs, updates menores) vive **dentro** do painel. Guideline: "Don't spam notifications" — levar a sério é diferenciador num mercado de extensões AI barulhentas.

---

## 9. Performance budgets (UX é latência)

| Métrica | Budget |
|---|---|
| Activation (`onStartupFinished`) | <50ms (só status bar; webview lazy) |
| Webview first paint | <100ms (Preact + esbuild, bundle ≤150KB) |
| Decisão nova → visível no feed | ≤2s |
| Memória extension host | <30MB steady |
| CPU idle (painel fechado) | ~0 (watchers dormem quando painel invisível >5min, excepto status bar tail) |

---

## 10. Marketplace listing (a primeira impressão É UX)

- **Nome:** "Mooter — Cost Cockpit for Claude Code" · **Ícone:** vaca minimal sobre fundo `#1e1e1e`, legível a 42px.
- **Hero GIF (15s, o asset mais importante):** prompt no Claude Code → chip T2 aparece no feed → status bar incrementa → expand "why". Gravar em Dark+ default, 800×450.
- **README:** primeiro ecrã = GIF + 3 bullets de valor + install. Tabela de features depois. Disclaimer "Not affiliated with Anthropic" no rodapé.
- **Categorias:** AI, Visualization. **Badges:** version, installs, CI.

---

## 11. QA checklist UX (gate de cada fase)

- [ ] 4 temas (Dark+, Light+, HC Dark, Solarized Light) sem regressão visual
- [ ] Teclado-only: completar F1-F4 sem rato
- [ ] Screen reader (VoiceOver): hero + feed compreensíveis
- [ ] Tracker off / CLI ausente / log vazio / log corrompido → 4 estados degradados com acção de recuperação
- [ ] `prefers-reduced-motion` respeitado
- [ ] Latência: cold open <100ms, decisão→feed <2s (medir, não estimar)
- [ ] Zero notificações fora dos 3 casos de §8
- [ ] Copy review: zero adjectivos de hype, todos os números com fonte

---

## 12. Não está claro do contexto — confirmar antes de F1

- ⚠️ Resultado Teste P0 (define copy do Launcher e check do Doctor)
- ⚠️ Campos exactos de `decisions.log` (confidence? sinais? custo evitado?) — a V2 assume estes campos; validar contra o schema real no repo
- ⚠️ savings-tracker :7821: endpoints e payloads reais (validar antes de desenhar KPIs all-time)
- ⚠️ Existência de asset de marca (vaca SVG) — se não existir, criar na F1

**Sources:** [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview) (+ páginas activity-bar, status-bar, notifications, walkthroughs, webviews, quick-picks, settings) · [Claude Code VS Code docs](https://code.claude.com/docs/en/vs-code) · BLUEPRINT-2026-06-11 · memória projecto (deep-dive Mac 06-10, benchmark 05-24)
