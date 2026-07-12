# MEO Polish Wave — masterprompt (SHIPPED)

**Origem:** COWORK → CC · 2026-07-10 · pós-auditoria Codex (`MEO_CODEX_AUDIT_REPORT.md`, 10 PASS / 2 PARTIAL / 0 FAIL).
**Branch:** `wave/meo-polish` (de `origin/main` c5cda85) · **vsix:** 0.16.66 · **suite:** 1024/1024.
**Fecha:** os 4 gaps aceites da auditoria (§5-6) + higiene.

Arquivado no mesmo PR que faz ship da wave, conforme a regra de lifecycle da Information
Architecture (`AGENTS.md` § Information architecture: masterprompt executado ⇒ `_handoff/_archive/YYYY-MM/`).

---

## Brief executado (verbatim)

⇄ COWORK→CC · MEO POLISH WAVE (pós-auditoria Codex) — Paulo, 2026-07-10
Contexto: lê _handoff/MEO_CODEX_AUDIT_REPORT.md (§5-6). Auditoria deu 10 PASS/2 PARTIAL/0 FAIL;
esta wave fecha os 4 gaps aceites. Branch nova wave/meo-polish a partir de origin/main (c5cda85
ou posterior — verifica ao vivo). GUARD de sempre: concat-only no webview, esc, fail-soft,
add seletivo, classify intocado, testes verdes, PÁRA no gate antes de PR.

1. DESCOBERTA: CTA textual "Abrir MEO 🐮 no Live Preview" no Cockpit (renderer + comando
   mooter.openLivePreview já existente) — visível, não só ícone.
2. BRAIN honesto pela PROVENIÊNCIA (correção do Cowork à rec do Codex): o costUsd do Brain vem
   do campo cost REAL do bus — NÃO rotular ~est.; rotular "custo (reportado)" e n/d quando
   ausente, como já faz. Adiciona o teste adversarial: falha se aparecer "$" no render sem
   rótulo de proveniência (~est. OU reportado).
3. EMPTY-STATES com acção: Dia/LLM/Fleet ganham a linha "abre uma sessão Claude Code e executa
   uma tarefa — os dados aparecem aqui" (Fleet: "a frota está em repouso desde <data>" já diz
   o suficiente, só acrescenta a dica se não houver heartbeat).
4. VERSÃO no header do MEO: "v<versão>" discreto no título (lê do package.json host-side,
   passa no snapshot, nullable). Teste.
5. Higiene: apaga C:\tmp\frugal-meo-audit (git worktree remove --force — worktree descartável
   do auditor, autorizado pelo Paulo).

GATE: suite completa verde + vsix bump (máx global +1 — atenção: existe 0.16.65 instalado,
verifica o máximo REAL) + install + reporta. PR só com OK. Sonnet-first, alvo <150k.

---

## Como foi entregue

| # | Gap | Entrega | Ficheiros |
|---|---|---|---|
| 1 | Descoberta | CTA textual `Abrir MEO 🐮 no Live Preview` no Cockpit → `send('openLivePreview')` → handler host → `mooter.openLivePreview` | `src/extension.js` |
| 2 | Custo honesto | Cost do Brain vem de `e.cost` REAL (`buildBrainData:121`) ⇒ `custo (reportado) $X`, nunca `~est.`; `n/d` quando ausente. Teste adversarial: `$` sem rótulo de proveniência ⇒ falha | `src/live-preview-view.js`, `src/live-preview-view.test.js` |
| 3 | Empty-states | Dia/LLM/Fleet com linha de acção; Fleet só quando não há heartbeat | `src/live-preview-view.js`, `src/dcv2-lenses.test.js` |
| 4 | Versão | `v<versão>` discreto no título do MEO; `EXT_VERSION` host-side (nullable) → snapshot → `formatMeoVersion` (pura, testada) | `src/extension.js`, `src/live-preview-view.js`, `src/live-preview-view.test.js` |
| 5 | Higiene | worktree `C:\tmp\frugal-meo-audit` removido (`git worktree remove --force`) | — |

**Guardrails:** `tools/router/classify.js` frozen (sha `427d8c0b…bc48f` intacto) · webview concat-only + ES5 · add seletivo · vsix 0.16.66 (máx global real 0.16.65 + 1).
