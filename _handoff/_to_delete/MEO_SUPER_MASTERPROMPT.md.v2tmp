# ⇄ COWORK→CC · SUPER MASTERPROMPT · MEO — as 2 waves finais (F5 rename+polish · F6 integração)

> **Executa na sessão CC do DCv2 (../frugal-dcv2), a mesma que fez F1-F4.** Estado à entrada:
> `wave/directors-cut-v2 @ f76dd5e` (F1 dados · F2 lentes · F3 pulso 🐮 · F4 auto-journal),
> pushed, ~724 testes verdes, classify frozen. **DECISÃO DO PAULO (2026-07-08): a feature
> chama-se MEO — Moo Executive Officer.** O Director's Cut evolui para o cockpit executivo
> do vibe coder solo: uma C-suite de um. Este masterprompt fecha a feature: rename honesto,
> polish de topo, e UMA integração na linhagem de release. Depois disto, MEO está perfeito.
>
> **Régua de ouro inalterada:** honesto > bonito. n/d, ~est., idade do sinal, âmbitos
> correctos ("deste workspace" vs "desta máquina"). Se o MEO fabricar um número, mata a
> tese. O nome executivo NÃO autoriza copy inflado — cada palavra sustentada por dado real.

## GUARD (todas as waves)
- Concat-only nas fns serializadas (zero backticks/`${}`, até em comentários) · esc
  self-contained · fail-soft (null → empty honesto) · render assinado (nunca ressaltar
  tab/scroll/pulso) · CSP intocado · zero libs.
- `tools/router/classify.js` FROZEN. Add selectivo. Worktree ../frugal-dcv2 SÓ. NUNCA
  tocar ~/frugal. Merge/release final NUNCA sem OK do Paulo. Sonnet-first (F2-F4 provaram:
  ~809k Sonnet, zero escalação); alvo F5 <200k · F6 <300k.
- Antes de cada wave: `git fetch` + confirmar que origin/wave/directors-cut-v2 == local e
  há 2 sessões paralelas noutras worktrees — divergiu? PÁRA e reporta.

## GATE VISUAL F2-F4 (antes do F5 — coordenado, não é teu)
O Cowork fecha o gate visual (screenshots das 4 lentes + pulso + cartão journal) com o
Paulo. **Não gastes tokens nisso.** O que a ronda visual achar de errado entra como
fix-list no F5 (o Cowork manda). Se a ronda ainda não fechou quando leres isto, começa o
F5.1-F5.2 (rename/copy — independente do visual) e integra a fix-list quando chegar.

## F5 · MEO — rename honesto + polish de topo (uma wave, um commit)

**F5.1 Rename (UI copy + docs — NÃO renomear identificadores de código):**
- Título da secção do painel: `🐮 MEO — Moo Executive Officer` com sublinha honesta:
  `o teu cockpit executivo · dados reais, custos ~est.` (nada de "AI executive" inflado).
- Cada lente ganha um papel na header, mapeamento fixo:
  · Stream → `Chief of Staff — o diário da sessão`
  · Dia → `COO — operações por dia`
  · LLM → `CFO — custos e modelos (~est.)`
  · Fleet → `COO — frota em paralelo`
  Chips das tabs mantêm os nomes curtos (Stream·Dia·LLM·Fleet) — o papel vive na header
  da lente, não no chip (não poluir a navegação).
- "Director's Cut" sobrevive como alias UMA vez no README/CHANGELOG ("MEO, antigo
  Director's Cut") para continuidade; todo o resto do copy vira MEO.
- ⚠️ Uso INTERNO do plugin apenas: antes de QUALQUER uso público/marketing de "MEO",
  o Paulo verifica marca registada (colisão conhecida: MEO = Altice Portugal telecom).
  Regista esta nota no CHANGELOG.
- Identificadores de código (renderDirectorsCut, lpdc-*, etc.) NÃO mudam — churn sem
  valor para o utilizador. Um comentário no topo do módulo mapeia nome-código→nome-produto.

**F5.2 Glossário final (o cânon, já reconciliado pelo Cowork):**
`~est.` · `n/d` · `ops reais` vs `rotas` · `eventos (deste workspace)` ·
`decisões/rotas — todas as sessões desta máquina` · `frota em repouso` + `último sinal
<data>` · `resumo local (qwen · best-effort)` · `sem sinal há Xs` · `janela recente`.
Auditoria: cada rótulo idêntico em todas as lentes; zero sinónimos à solta.

**F5.3 Polish WCAG 2.2 AA (auditoria, não retrabalho — o design entrou no F2):**
- Contraste das barras/pills nos 3 temas (dark · light · high-contrast) — corrige tokens
  com fallback var() onde falhar.
- Tabs: foco visível, ←→/Home/End já existem — confirma; targets ≥24px; `aria-selected`.
- Info nunca só por cor (tiers têm letra T0-T3 além da cor — confirma em TODAS as lentes).
- `prefers-reduced-motion` re-provado (pulso 🐮 morto sob reduce).
- Cartão journal: `role=status`? Não — é conteúdo, não status; o pulso é que é status. Confirma.

**F5.4 Fecho da wave:** CHANGELOG (MEO + anomalia de versões registada) · suite completa
verde (≥724) · commit `feat(live-preview): DCv2 F5 — MEO rename + WCAG polish` · push ·
vsix SEM bump ainda · install --force · reporta e PÁRA (o Cowork faz ronda visual 2, rápida).

## F6 · Integração — MEO entra na linhagem de release (só após OK do gate F5)

> ⚠️ **ACTUALIZAÇÃO 2026-07-10 (Cowork, verificado no remoto):** `origin/main` JÁ ABSORVEU
> a lp-4-9 (`9a4358f` é ancestral de main) E o PR #231 (cockpit layout). **O alvo de
> integração é `origin/main`**, não a lp-4-9 (que ficou para trás). merge-base(main, DCv2)
> = `2c1a492` — o merge traz lp-4-9 + FIX-MP-1 + layout de uma vez.

**F6.1 Pré-voo:** `git fetch origin` · fixa no relatório os shas do momento:
`origin/main` (alvo — hoje `f5a1f04`, 0.16.62 — pode ter mexido; re-verifica ao vivo) e a
versão MÁXIMA global (a corrida de versões entre linhagens é anomalia conhecida; NÃO
tentes resolvê-la, só não colidas com ela).

**F6.2 Integra por MERGE, não rebase** (a branch está pushed; não reescrever história):
`git merge origin/main` dentro de wave/directors-cut-v2.
Hotspots de conflito esperados (lp-4-9 + PR #231 layout tocam o mesmo webview):
- `extension.js`: bloco de requires fail-soft · livePreviewSnapshot (campos DCv2 são
  ADITIVOS — em conflito, ficam AMBAS as mudanças) · bloco de serialização
  `const renderX=${...}` (une as listas das duas waves) · watcher/debounce · e agora
  também o layout do PR #231 (arch-tree/deck/mission-control/project-command — superfícies
  que o DCv2 NÃO tocou: em conflito nessas zonas, o lado main vence).
- `live-preview-view.js`: module.exports (une) · fns novas de cada lado (não colidem).
- `package.json`/CHANGELOG: versão → resolve para o bump do F6.3.
Régua de resolução: NUNCA descartar honestidade de nenhum dos lados; em dúvida entre
comportamento LP-4.9 e DCv2 no MESMO ponto, PÁRA e pergunta ao Paulo com o diff.

**F6.3 Bump:** versão = (máxima global entre main/lp-4-9/qualquer release no momento) + 1
(hoje seria ≥0.16.63 — recalcula ao vivo). CHANGELOG da versão integra as entradas MEO.

**F6.4 Prova total pós-merge:** suite completa (as duas famílias de testes: dcv2-* E os
de LP-4.9/5/6 + layout #231) · webview-syntax · honest-controls · classify sha `427d8c0b…` ·
`git diff --stat origin/main...HEAD -- tools/router` → se NÃO vazio,
o ritual pós-release do CLAUDE.md aplica-se (/mooter-update etc.) — reporta.
`vsce package` (versão nova) · `vsce ls | findstr lp-aggregates` · install --force.

**F6.5 GATE FINAL (humano, irreversível — PÁRA):** apresenta ao Paulo:
- PR proposto: `wave/directors-cut-v2` → `main` (a linhagem de release viva — absorveu
  lp-4-9 + #231). NÃO abrir/mergear sem OK explícito.
- Relatório: conflitos resolvidos (lista) · suite · versão · o que o Paulo ganha ao
  instalar (MEO completo SOBRE as features 0.16.59 que ele perdeu temporariamente).
- O Cowork faz a ronda visual final no vsix integrado. Só depois do OK do Paulo: merge
  do PR para main — e o MEO passa a fazer parte da release do Mooter.

## BACK (cada gate)
`⇄ CC→COWORK: F<n> · branch+sha · testes · conflitos (F6) · adversarial · tokens/modelo ·
desvios · PARADO.`
