# Mooter for VS Code — Blueprint de Execução

**Data:** 2026-06-11 · **Escopo decidido:** Cockpit + Launcher · **Esforço alvo:** 3-5 semanas
**Companion deste doc:** `VSCODE-EXTENSION-MOCKUP-2026-06-11.html` (mockup interactivo) · `VSCODE-EXTENSION-VIABILIDADE-2026-06-11.md` (análise prévia)

---

## 1. Tese de produto

**"O Claude Code é o motor. O Mooter é o cockpit."** A extensão não reimplementa o agente — dá aos *non-hard vibe coders* a interface visual que o CLI nunca dará: quanto estou a poupar, porquê este modelo, que pack está activo, está tudo saudável. Cada install no Marketplace é funnel para o CLI; cada user do CLI ganha uma razão para abrir o VS Code.

**Persona:** dev/builder com Claude Max ($100+/mês) que já usa (ou vai usar) a extensão Claude Code oficial, mas não vive no terminal. Quer ver valor, não ler `decisions.log`.

---

## 2. Princípios UX — copiar padrões, não pixels

O "look and feel próximo do Claude Code plugin" consegue-se imitando os **padrões estruturais** (que são padrões VS Code, livres) e divergindo na **identidade** (que é da Anthropic, protegida):

| Padrão Claude Code (copiar) | Como | Identidade (divergir) |
|---|---|---|
| Painel no secondary sidebar (direita), arrastável | View container webview | Ícone próprio 🐄 (nunca o Spark ✱) |
| Header com tabs/sessões + histórico | Webview header | Naming "Mooter" |
| Cards de conversa limpos, espaçamento generoso | CSS system próprio | Verde-savings como cor de assinatura |
| Item na Status Bar (✱ Claude Code → 🐄 T2·sonnet·$0.42↓) | StatusBarItem API | Conteúdo: tier + modelo + saving |
| Onboarding checklist "Learn Claude Code" | `contributes.walkthroughs` | "Learn Mooter" 4 passos |
| Theming nativo (dark/light/high-contrast automático) | Só CSS vars `--vscode-*` | — |
| Permission-first, nada silencioso | Toggles explícitos | Telemetria opt-in |

⚠️ **Guardrails IP (inegociáveis):**
- Nome: **"Mooter — Cost Cockpit for Claude Code"**. "for Claude Code" = uso descritivo/compatibilidade; aceitável, mas nunca implicar afiliação ("by", "official"). Disclaimer no README: "not affiliated with Anthropic".
- Zero assets da Anthropic (Spark icon, logos, screenshots da extensão deles no listing).
- Zero assets VS Code/Microsoft no ícone/branding ([brand guidelines](https://code.visualstudio.com/brand)).
- Não fazer pixel-clone do painel deles — mesma gramática, vocabulário próprio.

---

## 3. Arquitectura técnica

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code                                                      │
│  ┌──────────────────┐        ┌──────────────────────────┐   │
│  │ Claude Code ext  │        │ Mooter ext (esta)        │   │
│  │ (oficial, motor) │        │                          │   │
│  │  bundled CLI ────┼─┐      │ ExtensionHost (TS)       │   │
│  └──────────────────┘ │      │  ├ DataService           │   │
│                       │      │  ├ LauncherService       │   │
│  hooks/settings.json  │      │  ├ StatusBarController   │   │
│         ▼             │      │  └ WebviewProvider       │   │
│  ~/.claude/* ◄────────┘      │        ▲ postMessage     │   │
│  ~/.mooter/*  ◄─ runtime     │  Webview UI (Preact)     │   │
│  decisions.log   Mooter      │  cockpit · feed · packs  │   │
│  savings-tracker :7821       └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Camadas

**Extension host (TypeScript, sem framework):**
- `DataService` — única fonte de dados do webview:
  - `fs.watch` em `decisions.log` + ficheiros de estado `~/.mooter` (debounced, tail incremental — nunca reler o ficheiro inteiro)
  - Poll leve (15s, só com painel visível) ao savings-tracker `http://127.0.0.1:7821` com circuit breaker (tracker pode estar off — degradar com graça, nunca spammar)
  - Parse defensivo: schemas versionados, ignorar linhas malformadas (o log é escrito por 201 scripts — assumir lixo)
- `LauncherService` — o "Launcher" do escopo:
  - Primário: URI handler oficial `vscode://anthropic.claude-code/open?prompt=...` (abre tab Claude Code; documentado nos [docs oficiais](https://code.claude.com/docs/en/vs-code))
  - Pré-launch: aplicar modo Mooter escolhido (beast/zen/autopilot via `mooter-mode.js`) ANTES de abrir a sessão — o hook injecta o hint quando o prompt for submetido
  - Fallback: terminal integrado com `claude` (hooks disparam garantidamente no CLI)
  - Detecção: se extensão Claude Code não instalada → CTA "Install Claude Code" (deep link marketplace)
- `StatusBarController` — `🐄 T2 · sonnet · $1.87↓ hoje`; click abre o cockpit
- `WebviewProvider` — serve o painel, CSP estrito, `retainContextWhenHidden: false` (rebuild barato, estado no host)

**Webview UI:**
- **Preact + esbuild** (não React: bundle 10x menor, mesmo modelo mental; webview deve abrir <100ms)
- **`@vscode-elements/elements`** para primitivas (botões, badges, dividers) — o toolkit oficial da MS foi [deprecated Jan-2025](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561); vscode-elements é o sucessor de facto
- **`@vscode/codicons`** para ícones de sistema; emoji/SVG próprio para identidade
- **Só cores via `--vscode-*` CSS vars** (ex.: `--vscode-sideBar-background`, `--vscode-charts-green`) → theming automático em todos os temas. Única excepção: verde-savings Mooter com fallback
- Estado: host é a verdade; webview é projecção. Mensagens tipadas (`{type: 'decisions/append', payload}`) com discriminated unions partilhadas em `shared/messages.ts`

### 3.2 Estrutura no monorepo

```
packages/vscode-extension/          # novo package @mooter/vscode
├── package.json                    # manifest: contributes, activation
├── esbuild.mjs                     # build host + webview
├── src/
│   ├── extension.ts                # activate(): regista tudo
│   ├── services/data.ts            # watchers, poll, parse
│   ├── services/launcher.ts        # URI handler + terminal fallback
│   ├── statusbar.ts
│   └── webview/provider.ts
├── webview-ui/                     # Preact app
│   ├── App.tsx · views/{Cockpit,Decisions,Packs,Doctor}.tsx
│   └── styles/tokens.css           # mapa --vscode-* → tokens Mooter
├── shared/messages.ts              # protocolo IPC tipado
├── media/ (ícones, walkthrough)
└── test/ (vitest host · Playwright @vscode/test-electron smoke)
```

**Activation events:** `onView:mooterCockpit`, `onStartupFinished` (só p/ status bar, <50ms budget, lazy em tudo o resto). Extensão deve ser invisível em peso quando não usada.

### 3.3 Contributes (manifest)

| Contribuição | Conteúdo |
|---|---|
| `viewsContainers` | Activity Bar: ícone Mooter → container "Mooter" |
| `views` | Webview view `mooterCockpit` no container |
| `commands` | `mooter.openCockpit`, `mooter.newSession`, `mooter.toggleMode`, `mooter.runDoctor`, `mooter.showDecision` |
| `walkthroughs` | "Learn Mooter": 1) instalar CLI 2) verificar doctor 3) primeira sessão roteada 4) ler primeiro saving |
| `configuration` | `mooter.trackerPort`, `mooter.statusBar.enabled`, `mooter.telemetry` (default off) |
| `menus` | Comando no editor toolbar opcional (off por default — não competir com o Spark) |

---

## 4. As 4 vistas do cockpit (ver mockup)

1. **Cockpit (home):** hero de savings (hoje/semana/total, % vs all-Opus), donut de distribuição de tiers, modo activo com toggle, botão primário **"New Claude Code session"**. Para o non-hard vibe coder, esta vista É o produto.
2. **Decisions (feed):** stream live das decisões de routing — prompt truncado, tier chip (T0🐄/T1/T2/T3/T5), modelo, custo vs alternativa, expandir → porquê (regex/sinais/confidence/pack hint). Transparência = confiança = a feature que Cline/Kilo não têm.
3. **Packs:** Moo Packs instalados, qual está activo neste workspace, validate one-click. ⚠️ **Gated pelo fix do bug packs-not-wired** — não expor UI de algo dark em prod.
4. **Doctor:** `mooter doctor` renderizado — verde/amarelo/vermelho por check, fix-it buttons (correm comando no terminal integrado). Substitui a maior fonte de fricção do onboarding actual.

**Empty states desenhados** (criticidade alta para o público-alvo): sem CLI instalado → walkthrough; sem decisões ainda → "Start a session"; tracker off → como ligar.

---

## 5. Fases de execução

| Fase | Conteúdo | Esforço | Definition of Done |
|---|---|---|---|
| **F0 — Spike** 🔥 | Teste P0 (hook dispara na extensão oficial?) + scaffold + status bar a ler decisions.log real | 2-3 dias | Status bar mostra decisão real no teu Mac |
| **F1 — Cockpit MVP** | Vista 1 completa + theming + empty states + walkthrough | 1-1.5 sem | Demo gravável: prompt → decisão → saving visível |
| **F2 — Feed + Launcher** | Vistas 2 e 4 + LauncherService + fallbacks | 1-1.5 sem | Sessão lançada do painel com modo pré-aplicado |
| **F3 — Ship** | Packs view (se bug fixado) + listing assets + publisher account + CI (vsce package) + **Marketplace + Open VSX** | 1 sem | Instalável público, README com GIF |

Versioning: lock-step com `version.json` do monorepo (workflow `version-sync.yml` já existente cobre o novo package).

**Pré-requisitos do core (fora da extensão, mas bloqueantes):**
1. 🔥 Teste P0 do hook na extensão oficial (30 min — decide se o launcher usa tab gráfico ou terminal)
2. ⚠️ Fix Moo Packs wired no hook live (já identificado no deep-dive 06-10)
3. 🛠 Estabilizar schema de `decisions.log` (a extensão torna-o API pública de facto — versionar)

---

## 6. Riscos específicos desta build

| Risco | Impacto | Mitigação |
|---|---|---|
| Hook não dispara no painel gráfico oficial (issue #21736) | Launcher perde graça | Fallback terminal mode (hooks garantidos no CLI); UX igual, só muda a superfície da sessão |
| Anthropic muda URI handler / formato de settings | Launcher quebra | Handler está documentado oficialmente (estável); abstração `LauncherService` isola |
| decisions.log muda de formato entre versões Mooter | Cockpit mostra lixo | Schema version no log + parser tolerante + testes de fixture por versão |
| Marketplace rejeita naming | Atraso ship | "Mooter — Cost Cockpit for Claude Code" é uso descritivo; preparar nome alternativo ("Mooter Cockpit") |
| Webview pesado mata a percepção de qualidade | Churn imediato | Preact + esbuild, budget 150KB bundle, abrir <100ms, zero spinners na vista inicial |
| Mais uma superfície para manter (já são 16 packages) | Velocity do core cai | Extensão = só leitura + launcher. Zero lógica de routing duplicada. Regra dura. |

---

## 7. Distribuição e funnel

- **Canais:** VS Code Marketplace (publisher novo `mooter`) + Open VSX (Cursor/forks — o público Claude Code usa muito Cursor)
- **Listing:** GIF de 15s (prompt → tier chip → saving), copy "See what your AI coding actually costs", categoria "AI"
- **Funnel:** install extensão → walkthrough → instala CLI → primeira decisão visível → (opt-in) login hub. Medir cada degrau (telemetria opt-in, consistente com a doutrina de transparência)
- **Lançamento:** README badge + post "Mooter audits Mooter — now live in your sidebar" reaproveitando os números reais (658 prompts / $25.95 / 47%)

---

## 8. Verificações pendentes (não inventado — confirmar)

- ⚠️ Resultado do Teste P0 (hook na extensão) — **bloqueia decisão launcher tab vs terminal**
- ⚠️ Schema actual exacto de `decisions.log` e endpoints do savings-tracker :7821 (confirmar no repo antes de F0)
- ⚠️ Disponibilidade do publisher name `mooter` no Marketplace
- ⚠️ Estado do fix Moo Packs (gate da vista 3)

---

**Próximo passo sugerido:** valida o mockup (`VSCODE-EXTENSION-MOCKUP-2026-06-11.html`), e levo este blueprint para o Claude Code via `/sync-project` como master prompt da F0.

**Sources:** [Claude Code VS Code docs](https://code.claude.com/docs/en/vs-code) · [webview-ui-toolkit sunset](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561) · [VS Code brand guidelines](https://code.visualstudio.com/brand) · [issue #21736](https://github.com/anthropics/claude-code/issues/21736) · Notion Estratégia v2 + Value Benchmark · memória deep-dive Mac 2026-06-10
