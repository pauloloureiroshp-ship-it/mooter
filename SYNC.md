# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` (Mac) e `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows).
> Snapshot, não log (regra ≤200 linhas; histórico em `docs/foundation/SYNC_ARCHIVE_2026.md`).

**Atualizado:** 2026-07-12 · **GitHub `main` @** `89ff3e3` (PR #246 merged) ·
**extensão em main:** `v0.16.67` · **candidata:** `v0.16.70` em
`fix/lp-iframe-reload-rearm` (**branch publicada; review/merge pendentes**).

## Verdade atual

- **LP-COERÊNCIA:** PR #246 merged; os 19 findings COH-01…19 estão em `main`.
- **Seleção pós-reload:** o host rearma o tap depois de um reload same-URL e mostra uma razão assertiva
  quando o gate 🎯 está bloqueado.
- **Descoberta/recovery do localhost:** probe HTTP 2xx+HTML em IPv4/IPv6, portas configuradas/comuns e ranges
  auto-incrementados em paralelo. Poll automático e ↻ são latest-wins; ↻ nunca se perde durante outro probe,
  ignora identidade sticky, recupera override inalcançável e recarrega o iframe same-URL. Reinício exige trust
  e só encerra listener com ownership do projeto comprovado. Suite extensão isolada **1202/1202 pass**.
- **MEO Control Tower:** Control/Stream/Sessões cruzam bus, execução real, catálogo de sessões e Ledger tipado.
  Cada etapa mostra agente, modelo, canal com base de atribuição, título da sessão e wave/PR; handoffs, fleet e
  sinais de Notion/Obsidian ficam visíveis sem inventar acesso. Suite extensão **1176/1176 pass**.
- **Tracking durável:** `tools/router/agent-sync-ledger.js` gera `_handoff/agent-sync/{events.jsonl,snapshot.json,
  latest.md,prompts/,briefs/}` (estado operacional local e gitignored). O Stop hook existente registra turnos
  Claude automaticamente; Codex/Gemini/Ollama usam checkpoints/briefs tipados.
- **Landing:** suite **211/211 pass**. Build compila e chega à recolha de páginas, mas para por ausência local
  de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; não é regressão atribuída ao código.
- **Classificador:** `tools/router/classify.js` SHA
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — FROZEN/intacto.
- **Bind da landing:** mudança `127.0.0.1 → 0.0.0.0` preservada separadamente em
  `wip/landing-bind-all-interfaces @ 1f3b9a6`; não integrar sem decisão explícita sobre exposição de rede.

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

1. Revisar o draft PR de `fix/lp-iframe-reload-rearm`; merge/Marketplace continuam gates humanos.
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
