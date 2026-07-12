# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` (Mac) e `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows).
> Snapshot, não log (regra ≤200 linhas; histórico em `docs/foundation/SYNC_ARCHIVE_2026.md`).

**Atualizado:** 2026-07-12 · **GitHub `main` @** `89ff3e3` (PR #246 merged) ·
**extensão em main:** `v0.16.67` · **candidata local:** `v0.16.68` em
`fix/lp-iframe-reload-rearm @ ea65359` (**1 commit local, ainda sem push**).

## Verdade atual

- **LP-COERÊNCIA:** PR #246 merged; os 19 findings COH-01…19 estão em `main`.
- **Seleção pós-reload:** o host rearma o tap depois de um reload same-URL e mostra uma razão assertiva
  quando o gate 🎯 está bloqueado. Suite extensão **1166/1166 pass**.
- **Landing:** suite **211/211 pass**. Build compila e chega à recolha de páginas, mas para por ausência local
  de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; não é regressão atribuída ao código.
- **Classificador:** `tools/router/classify.js` SHA
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — FROZEN/intacto.
- **Bind da landing:** mudança `127.0.0.1 → 0.0.0.0` preservada separadamente em
  `wip/landing-bind-all-interfaces @ 1f3b9a6`; não integrar sem decisão explícita sobre exposição de rede.

## Consolidação dos worktrees

Auditoria mecânica pelo Git nativo do Windows, confrontada com `origin/main`:

| Classe | Quantidade | Tratamento |
|---|---:|---|
| Limpos e já em `main` | 18 | removíveis após gate humano |
| Limpos, branch ainda não mesclada | 10 | remover só a pasta; preservar a branch |
| Sujos, trabalho já em `main` | 6 | separar artefactos locais antes de remover |
| Sujos, trabalho exclusivo | 6 | preservar/commit/rever antes de qualquer remoção |
| **Total** | **40** | nenhum `worktree remove --force` autónomo |

O diretório pretendido como canónico, `C:\Users\Paulo Loureiro\frugal`, ainda está em
`wave/honest-controls` e contém 25 alterações rastreadas + 1562 não rastreadas. Ele **não pode** ser
transformado em `main` nem limpo até o conteúdo real ser separado de caches, projeções e arquivos de trabalho.

## Arquitectura de informação

- Régua/auditoria/mock/masterprompt já executados foram movidos para `_handoff/_archive/2026-07/`.
- Handoffs Guardian com nome UUID são projeções locais regeneráveis e agora ficam ignorados; os specs Guardian
  canónicos continuam rastreados.
- Specs vivas permanecem em `docs/strategy/`; `LIVE_EDIT_ROADMAP.md` é o arco canónico do Live Preview/Edit.
- Notion HQ e `~/Documents/paulo-vault/Mooter` estavam **NO ACCESS** nesta sessão; nenhum conteúdo foi inventado
  ou escrito externamente.

## Guardrails permanentes

`classify.js` FROZEN · packages de motor congelados fora de allowlist · selective `git add` ·
zero push/merge/delete sem Paulo · deploy real sempre humano · T5 só `@fable` · honest-copy (`n/d`) ·
webview concat-only/CSP/origin-lock/tree-gate preservados.

## Próxima missão

1. Revisar e, com autorização, publicar `fix/lp-iframe-reload-rearm` como PR curto para `main`.
2. Preservar o trabalho real dos 12 worktrees sujos, começando pelo diretório canónico `frugal`.
3. Apresentar a lista nominal dos worktrees removíveis; Paulo autoriza a remoção em lote.
4. Deixar apenas `C:\Users\Paulo Loureiro\frugal` em `main`, limpo e sincronizado; branches históricas podem
   continuar no Git sem ocupar pastas.

## Pointers

- Auditoria: `_handoff/_archive/2026-07/LP_COHERENCE_AUDIT_REPORT.md`
- Mock aprovado: `_handoff/_archive/2026-07/mooter-live-preview-mock-v2.html`
- Masterprompt executado: `_handoff/_archive/2026-07/LP_FABLE5_COHERENCE_IMPL_MASTERPROMPT.md`
- Spec viva: `docs/strategy/LIVE_EDIT_ROADMAP.md`
- Estratégia: `docs/strategy/STRATEGY.md`
- Infra: `INFRA.md`
