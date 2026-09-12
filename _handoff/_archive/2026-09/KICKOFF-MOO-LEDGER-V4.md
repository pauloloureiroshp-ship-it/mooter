# KICKOFF — Adotar o Moo Ledger (v4) e publicar · 2026-09-01

És o Claude Code no mac-mini, custódia do git. O Cowork (Fable 5) desenhou, mediu e dogfoodou uma
nova cara para o Moo Pilot — **The Moo Ledger** — e este kickoff leva-a ao publish com maestria.
Trabalha numa branch, nunca em main. NUNCA `git add -A`, nunca `--force`, nunca `--admin`.
`classify.js` é FROZEN. O kill-switch e o moo-runner não se tocam.

## Entradas (já neste repo, untracked)
- `_handoff/moo-pilot-v4-moo-ledger-2026-09-01.html` — o Ledger: shell self-contained, EN,
  ladder live→snapshot, schema documentado no próprio ficheiro (`window.__SNAPSHOT__`,
  `__ROADMAP__`, `__SHELL__`). Dogfooded: zero page errors, mobile ok, tooltips/toasts ok.
- `_handoff/moo-pilot-roadmap-2026-09-01.json` — gates G1–G8 por device/owner/user.
- `_handoff/moo-pilot-v3-receipts-2026-09-01.json` — amostra do formato de recibos usado.
- Docs de contexto no Project Cowork: ESTUDO_MOO_PILOT_V2 (01/09), MOO_PILOT_V3_PESQUISA (01/09),
  PLANO_MOO_PILOT_LANCAMENTO_DEFINITIVO (01/09).

## Objetivo do PR (escopo fechado — 1 PR)
1. **Adotar o Ledger como vista do dono**: `tools/cockpit/moo-ledger-shell.html` (copiar o v4).
   O F10 passa a servir `GET /ledger` com ele. O `/panel` v1 (vista de operador) fica intacto.
2. **`tools/cockpit/runner/build-ledger-snapshot.mjs`**: gera o `__SNAPSHOT__` do Ledger a partir
   do runner-ledger.jsonl + beacons do vault + eta-index, preenchendo o schema que o ficheiro
   documenta (window/counters/daily/triage/yardstick/night/needs_you/receipts≤50/fleet/versions/
   worktrees/engine/gates/hold/eta_keys/worktrees_list/paths). Regra dura: campo sem medição = null
   (o shell mostra n/d) — NUNCA valor inventado. Janela noturna: 00:00–08:00 America/Sao_Paulo.
   Injecta também `__ROADMAP__` (do json em _handoff, mover para `tools/cockpit/roadmap.json`)
   e `__SHELL__` {version:'4.0.1', built_at, device, requires_connector}.
3. **B7**: a skill `plugin/mooter/skills/moo-pilot` passa a apontar o shell canónico novo
   (build via build-ledger-snapshot.mjs) e ganha uma nota curta "vivo vs snapshot" (o artifact
   claude.ai é sempre snapshot por CSP; o vivo é o F10). Apagar a cópia velha em
   `_handoff/skills-build/gpu-pilares/` se nada mais a referir.
4. **G1 (supervisão)**: `tools/ops/moo/launchd/com.mooter.f10.plist` (KeepAlive+RunAtLoad, log
   ~/.mooter/f10-launchd.log) + `_handoff/operar/43-INSTALAR-SUPERVISAO-F10.command` que o instala
   com duplo-clique. SÓ o F10 — o runner continua a exigir gesto do dono.
5. **Versão**: bump do conector para 1.53.0 (a skill nova viaja nele), build do `.mcpb` para
   `_handoff/mooter-v1530.mcpb`, e o painel/skill a reportar a nova latest.
6. **Testes**: suites router e cockpit-runner a 0 fail; teste novo para o build-ledger-snapshot
   (snapshot gerado parseia, campos obrigatórios presentes, nenhum número fora do payload).
7. **Coerência**: SYNC.md atualizado (≤200 linhas, regra da casa) + journal novo no vault
   (10-projects, append-only) contando o dia: v2→v3→v4, as refutações, o publish.

## Portões antes do merge
- `git remote get-url origin` contém `pauloloureiroshp-ship-it/mooter`.
- Branch: `mac/moo-ledger-v4-2026-09-01`. Commits atómicos, só os ficheiros tocados.
- Testes 0 fail localmente ANTES do push. PR via `gh pr create` com corpo citando este kickoff.
- Merge via `gh pr merge --squash` SÓ com CI verde. CI vermelho = para e escreve o motivo no log
  e no SYNC; nada de forçar.
- No fim: `git switch main && git pull --rebase origin main` e confirmar `node tools/cockpit/runner/build-ledger-snapshot.mjs` a correr limpo em main.

## Registo
Termina escrevendo no log: versão publicada, sha, nº do PR, testes (pass/fail), e o que ficou
de fora com motivo. Honestidade > completude: se um item do escopo não couber com qualidade,
corta-o, di-lo, e publica o resto.
