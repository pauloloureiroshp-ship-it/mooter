# ⇄ COWORK→CC · MASTERPROMPT · GPU-POR-PILAR F0 — runner + STOP + P8 + higiene-CI · 2026-08-15

**GOAL** Aterrar a fundação que destrava os 6 pilares GPU-local: (1) local-loop-runner em main, (2) STOP no motor, (3) contador P8, (4) higiene como CI, (5) raiz honesta. Estratégia-mãe: vault `40-strategy/mooter-gpu-pilares-2026-08-15.md` + SYNC.md bloco 📥 2026-08-15.

**WHERE** Repo Mooter (`~/frugal` no Mac · clone canônico no Windows). Worktree própria por frente. Branch base: `main` ATUALIZADA (o Mac está em v1.33.0 — pull primeiro).

**DO**
- **D0 · RECON (nada se emite sem isto):** `git fetch origin` · `git branch -r | grep -iE "fleet|runner"` · `git cat-file -t ef51a37` · `git log origin/main -1 --oneline`. Reportar tabela: branch runner existe? commit existe? main local vs remoto. ⚠️ No Mac (15/08) o clone só tem `main` — a spec EVOLUTION_FLEET §2 diz que o runner está em `feat/fleet-local-runner @ef51a37`; se o fetch não o trouxer, o claim da spec é FALSO e regista-se isso no LOOP.md.
- **D1 · PULL:** atualizar `main` local. Selective adds sempre; nunca tocar estado sujo de outra frente.
- **D2 · RUNNER:** worktree `../mooter-wt-runner`. Se a branch existe: rebase em main, `npm install` nos packages tocados, suite NATIVA, abrir **PR** (nunca merge). Se não existe: reconstruir da spec `docs/strategy/MOOTER_EVOLUTION_FLEET.md` §11 (F0.5): Node+Ollama, fila de jobs bounded single-shot, ledger append por device, ≥11 testes. O runner verifica STOP antes de CADA dispatch e respeita folga de VRAM ≥2,2 GB (bloqueante, não aconselhável).
- **D3 · STOP no motor:** estado em `~/.mooter/stop.json` lido pelo despachador (bridge + runner) antes de cada job. Drill obrigatório: disparar STOP com fila cheia e CRONOMETRAR a propagação (meta <5s) — sem drill medido não se chama kill-switch.
- **D4 · P8:** agregar `meo_interrupcao` + decisões pedidas por dia no ledger e expor em `mooter_fleet view=board`. 1 número: interrupções/dia.
- **D5 · HIGIENE-CI:** `scripts/higiene-check.mjs`: SYNC.md linhas (ratchet: falha se CRESCER vs baseline do commit; meta final ≤200 pós-tesoura J-0b) · untracked · stashes · `.md` no topo de `_handoff/` · sha256 de classify.js == `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. + workflow GitHub Actions que roda isso em PR.
- **D6 · RAIZ HONESTA:** mover `WAVE41_46_REPORT.md` da raiz para `docs/archive/sessions/` (cita sha antigo `7b01eb86` como INTACT — o canônico é `427d8c0b…`; história vai para o archive, a raiz não mente).
- **D7 · AUDIT FINAL:** rodar `scripts/higiene-check.mjs` + suites nativas + drill STOP. Recibo com números (formato RECIBO_DE_FECHO, "o que NÃO verifiquei" obrigatório).

**GUARD** 🐮 Mooter no talo: todo sub-trabalho bounded (digest de log, classificação de falha, resumo de diff) vai ao tier local via mooter — a GPU trabalha, tu decides. Tier mínimo sempre; T3 só no final-reviewer. ⛔ classify.js FROZEN · nunca `git add -A` · nunca push -f · PR sim, MERGE NUNCA (gate Paulo) · nada novo na raiz · evidência-ou-n/d · 1 worktree por frente · ficheiros sagrados intocáveis (`~/.claude/settings.json`, skills, hooks).

**GATE** Suites nativas verdes + drill STOP cronometrado + higiene-check rodando + PRs abertos (não merged) + recibo honesto. Falhou um → reportar, não maquiar.

**NEXT** (pós-merge do Paulo) P2 mínimo: golden set semeado com as falhas reais A4/G.3/J0-A/kimi + guarda de recusa + default-FAIL.

**BACK** ⇄ MOO HANDOFF no fim do SYNC.md (marcar o bloco 📥 2026-08-15 como ✅ Lido em sessão #N) + entry no LOOP.md + append em `~/paulo-vault/30-learnings/` (1 nota: o que a spec prometia vs o que o git real tinha). O Cowork audita o handoff e regista no Notion.
⇄ END HANDOFF
