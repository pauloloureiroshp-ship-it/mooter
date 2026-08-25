# ⇄ Handoff Cowork → Cowork · Codex Plane — implementar a W-UX gastando quota OpenAI, não Claude (2026-07-10)

> **Objetivo (Paulo):** economizar tokens Claude delegando implementação mecânica ao Codex (`codex exec`,
> OAuth ChatGPT — quota separada). A conversa nova orquestra e verifica (Claude barato); o Codex escreve
> código (OpenAI). Papéis canónicos (vault/memória 2026-07-09): CC=arquitecto · Codex=implementador ·
> Gemini=revisor (opcional).

## 1. Estado confrontado (2026-07-10 — NÃO redescobrir)
- Worktree **`../frugal-wave-ux`** (branch `wave-ux`, de main `c5cda85`) existe; confronto + plano
  committed em `cb38684`. A lista de remoções deu VAZIA (controlos mortos já corrigidos) — o trabalho
  são **4 keepers**: ① wire `openSession → openSessionTab` (deep-link existe, view usa o antigo) ·
  ② linha compacta 1-linha + disclosure/group-by-state (B3) · ③ feedback óptimista nos toggles (B1) ·
  ④ auto-detect de abas novas + tooltips exactos em todos os controlos.
- Spec-mãe: `_handoff/COCKPIT_LIVE_SESSIONS_UX_BRIEF.md` (régua UX + gates) + o checkpoint `cb38684`.
- Infra Codex JÁ existe: `tools/router/providers/codex-cli.js` (single-turn, OAuth) + scaffold/masterprompt
  em `_handoff/codex/` (Wave 62). Confirmar `codex --version` antes de tudo.
- ⚠️ O **Wave Runner** (outra sessão CC) foi instruído a MARCAR a W-UX como DELEGATED e saltar para a
  próxima wave — confirma no `_handoff/waves/RUNNER_STATE.md` que o fez antes de tocares na worktree
  (R1: uma frente, uma worktree, um dono).

## 2. Método (por keeper — loop orquestrador barato, implementador OpenAI)
1. **Prompt Codex denso por keeper** (1 de cada vez): contexto mínimo (ficheiros exactos + trecho da spec
   + gate do keeper) → `codex exec` na worktree `frugal-wave-ux`. Bounded context: nunca colar a spec
   inteira — só a secção do keeper.
2. **Verificação determinística (tu, Cowork/CC — barata):** testes da extensão verdes · `sha256
   classify.js == 427d8c0b…` · grep honest-copy (números sem fonte) · tooltips presentes · zero regressão.
3. Verde → **commit atómico** (`feat(mc): keeper N — …`) · vermelho → 1 retry Codex com o erro colado;
   2º vermelho → o keeper volta para a fila Claude (não insistir — regista o porquê).
4. Opcional (se instalado): Gemini como revisor do diff antes do commit (`scripts/setup-gemini-vscode.ps1`
   já configurado, papel revisor).

## 3. GUARD
Só `packages/vscode-extension/**` + testes, na worktree `wave-ux` · classify FROZEN · aditivo · selective
add · **sem push/merge** (draft PR no fim = ok; merge = Paulo) · componentes têm de encaixar no slot
Floor/Fleet Console do W15 (`_handoff/CTO_COMMAND_DECK_SPEC.md` — 6 leis, tokens `--vscode-*`,
`prefers-reduced-motion`) · PT-PT conversa/EN código · o Codex NUNCA recebe secrets/env.

## 4. GATE
4 keepers implementados (ou devolvidos com razão) · testes extensão verdes · vsix local instala e a view
mostra: linha 1-linha + click abre a aba certa + toggles com feedback + aba nova aparece sem reload +
tooltip exacto em TODO o controlo · sha intacta · draft PR `wave-ux` aberto com atribuição honesta
("implementação: codex exec; orquestração/verificação: Cowork") · **contabilidade colada: tokens Claude
gastos (orquestração) vs trabalho entregue** — é a prova do modelo económico.

## 5. BACK
git log da wave-ux · testes · link do draft PR · relato por keeper (Codex 1º-try / retry / devolvido) ·
tokens Claude usados.
