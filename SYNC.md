# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` (Mac) e `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows).
> Snapshot, não log (regra ≤200 linhas; histórico em `docs/foundation/SYNC_ARCHIVE_2026.md`).

**Atualizado:** 2026-07-16 · **GitHub main @** 71340b2 (PRs #248 e #249 merged) · **extensão em main:** v0.16.78 · **remediação F1:** Gates 1–3 locais, sem push/PR.

## Verdade atual

- PRs #248 e #249 estão integrados em origin/main @ 71340b2.
- F1: Gates 1–3 implementados localmente em fix/remediation-perfect-handoff-p1; nenhuma publicação autorizada.
- F1 Gate 1: ledger durável append-only separado do contexto rolante de 50 eventos (commit edc8420).
- F1 Gate 2: lock O_EXCL com owner/PID/host/nonce/lease, recuperação auditável e escrita durável (commit 77a0318).
- F1 Gate 3: reducer único versionado, ponte VSIX por subprocesso compatível e replay byte-idêntico; commit local no STOP.
- F2: copy pública honesta + teste de claims no commit local 31d131f; sem push.
- F3: ratchet merge-base permanece local no commit 9de33d5; publicação em HOLD.
- PHASE_A_GATE.md preservado byte a byte com sha256 02282153134eab3d329d68ac3d5ea5414b97509f5cc9dc9d110c9ed6b99bca13.
- tools/router/classify.js permanece frozen com sha256 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f.

## Consolidação dos worktrees

Auditoria mecânica pelo Git nativo do Windows, confrontada com `origin/main`. Dos 40 worktrees iniciais,
27 limpos foram removidos sem `--force`; todas as branches foram verificadas como preservadas.

| Estado atual | Quantidade | Tratamento |
|---|---:|---|
| Worktree canónico `frugal` | 1 | manter; preservar WIP antes de alinhar a `main` |
| Worktree desta consolidação | 1 | limpo; branch candidata publicada |
| Outros worktrees sujos | 10 | patches + não rastreados preservados no cofre; revisão antes de remover |
| **Registrados** | **12** | eram 40; redução segura de 70% |

`frugal-final` saiu do registro Git, mas o Windows manteve um resíduo órfão de 5,7 MB bloqueado em
`packages/vscode-extension/src`; não foi forçado. Fechar o processo que mantém o diretório aberto antes de
remover o resíduo físico.

O diretório pretendido como canónico, `C:\Users\Paulo Loureiro\frugal`, ainda está em
`wave/honest-controls` e contém 25 alterações rastreadas + 1562 não rastreadas. Ele **não pode** ser
transformado em `main` nem limpo até o conteúdo real ser separado de caches, projeções e arquivos de trabalho.

## Arquitectura de informação

- Régua/auditoria/mock/masterprompt já executados foram movidos para `_handoff/_archive/2026-07/`.
- **Alocação Live Preview:** auditada sem movimentos; `extension.js`, módulos flat `lp-*`/`live-edit-*`, assets,
  tap na landing e hook no router permanecem nos locais atuais. O §8 do handoff fixa os contratos e armadilhas.
- **Extensão legada `vscode-extension/`:** é um pacote `mooter-savings@0.5.2` completo, não um ficheiro órfão.
  A mesma implementação está instalada nesta máquina como `frugal.frugal-savings-0.5.2`; fica preservada até
  uma PR separada migrar/desinstalar essa identidade e decidir os comportamentos únicos.
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

1. Na janela principal do Paulo, executar uma única vez **Developer: Reload Window** para o extension host
   carregar a `v0.16.72` já instalada; repetir pin → prompt/dock → minimizar/reabrir. A prova isolada já passou.
   Depois push seletivo para atualizar o draft PR; merge/Marketplace continuam gates humanos.
2. Preservar/triangular o trabalho real dos 11 worktrees sujos, começando pelo diretório canónico `frugal`.
3. Remover o resíduo órfão `frugal-final` somente depois de o lock do Windows desaparecer.
4. Deixar apenas `C:\Users\Paulo Loureiro\frugal` em `main`, limpo e sincronizado; branches históricas podem
   continuar no Git sem ocupar pastas.

## Pointers

- Auditoria: `_handoff/_archive/2026-07/LP_COHERENCE_AUDIT_REPORT.md`
- Mock aprovado: `_handoff/_archive/2026-07/mooter-live-preview-mock-v2.html`
- Masterprompt executado: `_handoff/_archive/2026-07/LP_FABLE5_COHERENCE_IMPL_MASTERPROMPT.md`
- Spec viva: `docs/strategy/LIVE_EDIT_ROADMAP.md`
- Estratégia: `docs/strategy/STRATEGY.md`
- Infra: `INFRA.md`
