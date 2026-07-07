# ⇄ COWORK→CC · WAVE LP-1 · MP3-v2 (recuperar o perdido) + MP4-polish (calibrar o strip)

> **Sessão 1 de 2 do Live Preview restante.** Aplica o PROTOCOLO à prova de erro (R1–R6) — os erros de
> hoje foram todos de processo (o MP3 perdeu-se por correr no tree partilhado sem commit). Lê
> `_handoff/LIVE_EDIT_MP5_SPEC.md` §2 + `_handoff/LIVE_PREVIEW_POSTMORTEM_PROTOCOL.md`. Sonnet.

## 🛡️ PROTOCOLO OBRIGATÓRIO (não negociável)
- **R1 · uma worktree própria:** `git fetch` ; `git worktree add -b wave/lp-mp3v2 ../frugal-mp3v2 origin/main` ; `cd` lá ; **confirma `git rev-parse --show-toplevel` == `...frugal-mp3v2`** (NUNCA `frugal`).
- **R2 · commit atómico após CADA peça** (antes de qualquer teste manual). Nada fica uncommitted.
- **R5 · base = `origin/main` atual** (≥ `266e4f3`).

## ▶ DO (por ordem; COMMIT após cada)
1. **MP3.1 · relógio tz local:** em `packages/vscode-extension/src/live-preview-view.js`, `clock(ts)` →
   `new Date(ts).toLocaleTimeString(undefined,{hour12:false})`; `n/d` honesto se `ts` inválido. Aplica a
   todos os timestamps do Director's Cut. Teste unitário: tz local ≠ UTC. **→ COMMIT.**
2. **MP3.2 · consolidar o iframe em main:** confirma se o `<iframe src=localhost:PORT>` já veio com o MP4;
   se faltar, trá-lo limpo. CSP `frame-src http://localhost:*` (dev) · `X-Frame-Options` só-dev. **→ COMMIT.**
3. **MP3.3 · multi-page nav (ver TODAS as abas do site):** barra de endereço funcional (Enter navega o
   iframe) + sync `lp-nav {path}` do tap (via `popstate`, que o tap já capta) + dropdown de rotas lendo
   `landing/app/**/page.tsx`. **→ COMMIT.**
4. **MP4-polish · calibrar o strip** (nit provado hoje: acendeu **vermelho** para um **warning de CSS
   benigno** `:host { all: initial }` — o browser a avisar sobre `direction`, padrão de shadow DOM):
   (a) distinguir **fatal (vermelho)** de **warning (amarelo)**; (b) **FILTRAR o próprio ruído** do
   tap/highlight shadow-DOM (mensagens `:host` / `all: initial` geradas pelo próprio Live Preview);
   (c) ignorar CSS parse warnings benignos (não são erros de runtime da app). **→ COMMIT.**

## 🔒 GUARD (R4)
`classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · honest-copy ·
selective `git add` (nunca `-A`) · toca só `packages/vscode-extension/` + `landing/` · **sem push/merge sem OK do Paulo** · PT-PT.

## ✅ GATE
Relógio mostra hora de **São Paulo** · navego entre rotas e **vejo todas as abas do site** · o strip **NÃO
acende** para o warning CSS benigno **mas AINDA acende para um erro real** · testes verdes (extensão + landing) ·
sha intacta · **`git status` LIMPO (tudo committed)**. PÁRA no gate; cola `git --no-pager log --oneline` + testes + sha.

## ⏭ NEXT (Sessão 2, só depois desta aterrar)
MP5.0/5.1 (click-to-code + edit determinístico $0 + chip de modelo) — reconciliar o `extension.js` do WIP
`feat/live-edit` com o MP4 já em main. Depois MP5.2/5.3 (estrutural + área).
