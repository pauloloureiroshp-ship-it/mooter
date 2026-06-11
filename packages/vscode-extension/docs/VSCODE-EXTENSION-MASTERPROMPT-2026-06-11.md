# MASTER PROMPT — Mooter for VS Code (F0 → F3)

> **Para:** Claude Code (repo `mooter`, branch `dev`) · **De:** Cowork session 2026-06-11 · **Dono:** Paulo
> **Docs canónicos (ler ANTES de escrever código, por esta ordem):**
> 1. `VSCODE-EXTENSION-VIABILIDADE-2026-06-11.md` — porquê e o que NÃO fazer
> 2. `VSCODE-EXTENSION-BLUEPRINT-2026-06-11.md` — arquitectura, estrutura, fases
> 3. `VSCODE-EXTENSION-UX-SPEC-2026-06-11.md` — UX/UI lei; em conflito com gosto pessoal, a spec ganha
> 4. `VSCODE-EXTENSION-MOCKUP-2026-06-11.html` — alvo visual (abrir no browser)
>
> Estes 4 ficheiros estão na pasta Cowork (`~/Documents/Claude/Projects/Mooter.ai (macOS)/`). **Primeiro passo: copiá-los para `packages/vscode-extension/docs/` no repo** para ficarem versionados.

---

## Missão

Construir a extensão **"Mooter — Cost Cockpit for Claude Code"** (escopo Cockpit + Launcher) com qualidade que a Anthropic mostraria como exemplo de ecossistema. Não é um clone do agente: é o cockpit de observabilidade e launch sobre o motor que já existe.

## Regras de engagement (válidas em todas as fases)

1. **Read → Edit contextual, nunca patch via sed/regex** em JS/TS. `node --check` (ou `tsc --noEmit`) antes de cada commit. *(doutrina do Paulo, ver vault)*
2. **Zero lógica de routing na extensão.** Só leitura de `decisions.log`/`~/.mooter`/tracker + launch. Se sentires tentação de duplicar o classifier, pára e regista uma issue.
3. **Schema first:** antes de consumir `decisions.log` ou o tracker, lê o código que os escreve e gera fixtures reais. Nunca assumir campos — a UX-SPEC §12 lista as incógnitas.
4. **Cada fase termina com:** testes verdes + QA checklist UX (UX-SPEC §11) + entrada no `CHANGELOG.md` + secção COWORK←CC no `SYNC.md` + commit em `dev`.
5. **Gates são duros:** não avançar de fase com gate aberto. Se um gate falhar, reportar no SYNC.md e parar — o Paulo decide.
6. Documentação de produto em EN; notas internas/SYNC em PT-PT.
7. Versionamento lock-step com `version.json` (workflow `version-sync.yml` cobre o novo package).

---

## F0 — Spike de verdade (2-3 dias)

**Objectivo:** matar as 4 incertezas antes de investir em UI.

### F0.1 🔥 Teste P0 — hook na extensão oficial
- Instalar extensão Claude Code no VS Code do Mac. Prompt de teste no painel gráfico.
- Verificar se `inject_context.js` (UserPromptSubmit) dispara: adicionar log temporário `~/.mooter/hook-fire.log` com timestamp + surface.
- Repetir em terminal mode (`useTerminal: true`) e CLI pura como controlo.
- **Output:** `docs/P0-HOOK-TEST-RESULTS.md` com matriz superfície × dispara?. Issue #21736 do anthropics/claude-code como referência.
- **Consequência:** se gráfico=sim → Launcher usa URI handler; se não → `mooter.launcher.preferTerminal` default true e copy do Doctor explica (UX-SPEC V4).

### F0.2 Schema audit
- Ler writers de `decisions.log` + endpoints reais do savings-tracker (:7821).
- **Output:** `shared/schemas.ts` (zod) + 3 fixtures reais em `test/fixtures/` + se o log não tem version field, **adicionar** (`schema_version`) no writer do runtime — PR separado ao core.

### F0.3 Scaffold
- `packages/vscode-extension/` conforme BLUEPRINT §3.2: esbuild (host+webview), Preact, `@vscode-elements/elements`, `@vscode/codicons`, vitest.
- `package.json` manifest: viewContainer + view `mooterCockpit` + 6 comandos + 5 settings (UX-SPEC §6) + walkthrough stub.
- Activation: `onStartupFinished` → só StatusBarController; tudo o resto lazy.

### F0.4 Status bar viva
- `DataService` mínimo: tail incremental de `decisions.log` (fs.watch + debounce 500ms) → status bar `🐄 T2 · $4.31↓` com tooltip markdown (UX-SPEC S3).

**✅ Gate F0:** status bar mostra decisão real do teu uso no Mac · P0-HOOK-TEST-RESULTS.md escrito · schemas.ts com fixtures · `vsce package` produz .vsix instalável.

---

## F1 — Cockpit MVP (1-1.5 semanas)

- V1 Cockpit completa (UX-SPEC §4-V1): hero, KPIs, barras de tiers, card de modo, Launcher.
- Theming 100% `--vscode-*` (tokens UX-SPEC §3.1). **Testar nos 4 temas do checklist.**
- Estados degradados: tracker-off, log vazio, CLI ausente (Welcome View nativa S9 antes do webview).
- Walkthrough "Learn Mooter" 4 passos (UX-SPEC F1) com completion events reais.
- LauncherService: URI handler `vscode://anthropic.claude-code/open` + fallback terminal + detecção de extensão oficial ausente.
- A11y desde já (UX-SPEC §7): teclado-only, aria-live no hero, reduced-motion. Não é polish de fim — é fundação.
- Asset: criar SVG vaca monocromático 24×24 `currentColor` (Activity Bar) + ícone marketplace 128×128.

**✅ Gate F1:** demo gravável (prompt → decisão → saving no hero) · QA checklist §11 completo · first paint <100ms medido · F1 first-run flow completável teclado-only.

## F2 — Decisions feed + Doctor (1-1.5 semanas)

- V2 feed live (UX-SPEC §4-V2): expand com "porquê", batching 1 reflow/s, virtualização >200, filtros no View Toolbar, caso HIGH_RISK com `$(shield)`.
- V4 Doctor (UX-SPEC §4-V4): checks com fix-buttons no terminal integrado visível; check "Hook integration" reflecte resultado P0 em runtime.
- Quick Pick de modo (S5) + política de notificações (§8 — implementar os 3 casos COM os limites de frequência).
- Performance: medir budgets §9 com profiling real; watchers dormem com painel invisível.

**✅ Gate F2:** sessão lançada do painel com modo pré-aplicado e decisões a aparecer ≤2s · zero notificações fora da política em 1 dia de uso real.

## F3 — Ship (1 semana)

- V3 Packs **apenas se** bug packs-wired estiver fixado no core (senão: atrás de `mooter.packs.enabled: false`, registar issue).
- Marketplace: publisher `mooter` (verificar disponibilidade), listing conforme UX-SPEC §10, hero GIF 15s gravado em Dark+, README com disclaimer "Not affiliated with Anthropic".
- Publicar **Marketplace + Open VSX** (Cursor users). CI: build + test + `vsce package` no GitHub Actions.
- Telemetria opt-in (default off) — eventos: activation, view-open, launcher-used, walkthrough-completed. Nada de conteúdo de prompts. Documentar no README.
- Landing mooter.ai: secção "Now in VS Code" + badge.

**✅ Gate F3:** .vsix público instalável · install→primeira decisão <5 min testado num device limpo · post de lançamento draft no SYNC.md para o Paulo rever.

---

## Anti-goals (relembrar quando der vontade)

❌ Chat próprio / Agent SDK embebido · ❌ Duplicar routing na extensão · ❌ Assets Anthropic/Microsoft · ❌ Notificações fora da política · ❌ Settings que duplicam config do CLI · ❌ Pixel-clone do painel oficial

## Reporting

No fim de cada fase, escrever no `SYNC.md` (secção CC→COWORK): fase, gates passados/falhados, decisões tomadas, incógnitas novas, próximo passo. O Paulo acompanha pelo Cowork.

🐄 Bom trabalho. O motor já é bom — agora dá-lhe o cockpit que ele merece.
