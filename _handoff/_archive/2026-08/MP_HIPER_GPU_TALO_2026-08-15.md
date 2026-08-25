<!--
COLISAO DE CONTEUDO RESOLVIDA — 2026-08-25 (missao de fecho do Mac, item 5).

Ao mover o `_handoff/archive/2026-08/` orfao para o canonico `_handoff/_archive/`,
apareceu uma TERCEIRA colisao que a missao nao previa (previa duas, e as duas
estao tratadas no item 4). Nenhuma copia foi apagada sem se medir primeiro.

Medido: a copia canonica tinha 50 linhas, a orfa 57. A canonica e um
PREFIXO EXACTO da orfa — nao ha uma unica linha em conflito, so 7 linhas
que a orfa tinha a mais (o ADENDO 2, de 15/08 ~15h). Verificado por
difflib: todas as diferencas sao do tipo `insert`, nenhuma `replace` nem `delete`.

Por isso a fusao aqui e trivial e nao precisa de blocos de divergencia: fica a
versao ORFA, que contem a canonica inteira mais o adendo. Nada se perdeu.

## === versao topo === (`_handoff/archive/2026-08/`, orfa, 57 linhas — e esta)
## === versao archive === (`_handoff/_archive/2026-08/`, canonica, 50 linhas — prefixo exacto da de cima)
-->

# ⇄ COWORK→CC · HIPER MASTERPROMPT v2 · MOOTER NO TALO — fundação + pilares + sync + registro · 2026-08-15
# (supersede MP_GPU_PILAR_F0_RUNNER e a v1 deste ficheiro; MP_WINDOWS_REPLICA continua válido para a fase 4090)

**GOAL** Numa única corrida disciplinada: (A) sync perfeito repo+vault entre devices, (B) fundação F0 (runner + STOP + P8 + higiene-CI + raiz honesta), (C) skills dos pilares aterradas no repo, (D) tudo auditado, registrado no vault e devolvido em handoff — **com o Mooter no talo do primeiro ao último prompt**: tier mínimo, pré-digest local, todo sub-trabalho bounded na GPU, recibo em tudo.
Estratégia-mãe: `paulo-vault/40-strategy/mooter-gpu-pilares-2026-08-15.md` · SYNC.md bloco 📥 2026-08-15.

**WHERE — paths por device (Mac VALIDADO no disco 15/08; Windows = evidência dos docs, confirmar no S0)**
| | Mac mini (validado ✅) | Windows PC (confirmar no S0 ⚠️) |
|---|---|---|
| Repo Mooter | `/Users/pauloloureiro_mac_mini/frugal` → `cd ~/frugal` | `C:\Users\Paulo Loureiro\frugal` (se o Great Rename tiver acontecido: `C:\Users\Paulo Loureiro\mooter` — `Test-Path` decide) |
| Vault | `/Users/pauloloureiro_mac_mini/paulo-vault` | `C:\Users\Paulo Loureiro\paulo-vault` (fora do OneDrive, `core.autocrlf=false`) |
| Remote repo | `https://github.com/pauloloureiroshp-ship-it/mooter.git` (validado) | mesmo |
| Remote vault | `git@github.com:pauloloureiroshp-ship-it/paulo-vault.git` (validado; Obsidian Git auto-sync) | mesmo |
| NÃO usar | `~/Documents/Codex/Mooter` (clone do Codex Desktop, não do CC) | qualquer clone dentro do OneDrive |
Worktrees: `../mooter-wt-runner`, `../mooter-wt-skills`, `../mooter-wt-higiene`. Base: `main` ATUALIZADA.

**MOOTER NO TALO (valem para TODAS as fases)**
1. `/mooter-update` + self-check (`node ~/.claude/tools/router/sync-hooks.js --check` → `OK self-check`) ANTES de começar. Sem routing medido, a corrida não conta.
2. Todo sub-trabalho bounded (digest, resumo de diff, classificação, triage) → tier local T0. Opus/T3 só decisão arquitetural e final-reviewer. Pegou-se usando T3 pra resumir log → PARA e re-roteia.
3. Mini-recibo por fase (local vs cloud, tokens, tempo); recibo agregado no fim prova ou desmente a tese — mentir é a única opção proibida.

**DO**
- **S0 · SYNC-DEVICES (novo — nada roda sem isto):**
  a) Confirmar path do repo (`pwd`; no Windows: `Test-Path` nos dois nomes) e remote (`git remote -v` tem de bater a tabela).
  b) **Vault:** `cd` no vault → `git status`. ⚠️ Estado medido 15/08 no Mac: as notas do dia (`40-strategy/mooter-gpu-pilares-2026-08-15.md`, `20-decisions/2026-08-15-gpu-por-pilar-…`) estão **untracked** — commit seletivo + push (é o repo privado do vault; auto-push é o design validado 2026-06-21). No Windows: `git pull` primeiro e confirmar que as duas notas chegaram; sem elas, PARAR — a estratégia-mãe não está nesse device.
  c) **Repo:** `git fetch origin` + `git status`. No Mac, o SYNC.md tem o bloco 📥 2026-08-15 **uncommitted** — incluir no commit da sessão (branch da worktree, não direto em main). No Windows: `git pull` e confirmar que o bloco 📥 chegou.
  d) Regra de ouro multi-device: **1 device por vez neste MP.** Se a outra máquina tiver sessão CC ativa no repo, não começar.
- **F0 · RECON:** `git branch -r | grep -iE "fleet|runner"` · `git cat-file -t ef51a37` · `git log origin/main -1` · tabela antes de tocar. ⚠️ Clone do Mac só tinha `main` (15/08); se o fetch não trouxer `feat/fleet-local-runner`, o claim da EVOLUTION_FLEET §2 é falso → LOOP.md e seguir pela reconstrução.
- **F1 · PULL:** `main` local atualizada (Mac estava em v1.33.0). Selective adds sempre.
- **F2 · RUNNER (o coração):** branch existe → rebase + suite nativa + PR. Não existe → reconstruir da spec `docs/strategy/MOOTER_EVOLUTION_FLEET.md` §11 (F0.5): Node+Ollama, fila de jobs bounded single-shot, ledger append por device, ≥11 testes. Invariantes: STOP (`~/.mooter/stop.json`) antes de CADA dispatch · folga VRAM ≥2,2 GB bloqueante · 1 pilar ativo por GPU · recibo por job.
- **F3 · STOP + DRILL:** drill cronometrado com fila cheia (meta <5s). Sem drill medido não é kill-switch.
- **F4 · P8:** interrupções/decisões pedidas ao humano por dia, do ledger, expostas em `mooter_fleet view=board`.
- **F5 · HIGIENE-CI:** `scripts/higiene-check.mjs` (SYNC linhas ratchet · untracked · stashes · `_handoff` topo · sha classify `427d8c0b…48f`) + GitHub Action em PR.
- **F6 · RAIZ HONESTA:** `WAVE41_46_REPORT.md` (sha antigo `7b01eb86` como "INTACT") → `docs/archive/sessions/`.
- **F7 · SKILLS NO REPO:** descompactar `_handoff/skills-build/gpu-pilares/*.skill` → `skills/moo-talo/`, `skills/moo-pilar-*/` (casa das meo-*) e incluir no PR.
- **F8 · AUDIT:** higiene-check + suites nativas + drill + as 5 perguntas universais do MEO sobre a própria corrida (GOVERNANCA_MEO §3.1), evidência-ou-n/d. Não repetir: verde-sobre-nada (A4/G.3) e citação sem grep.
- **F9 · REGISTRO E SYNC DE VOLTA:** recibo RECIBO_DE_FECHO → (a) append `LOOP.md`; (b) `paulo-vault/30-learnings/2026-08-XX-f0-runner-<resultado>.md` + **commit+push do vault** (o outro device precisa ver); (c) SYNC.md: bloco 📥 2026-08-15 → ✅ Lido em sessão #N + ⇄ MOO HANDOFF, **commitado no branch da sessão**.

**GUARD** ⛔ classify.js FROZEN (`427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · nunca `git add -A` · nunca push -f · no repo Mooter: PR sim, MERGE NUNCA (gate Paulo; push do vault privado é rotina Obsidian Git, não é este gate) · nada novo na raiz · packages congelados fora do allowlist · ficheiros sagrados intocáveis · evidência-ou-n/d · WIP ≤3 frentes.

**GATE** S0 verde nos DOIS repos (paths+remotes confirmados, vault sincronizado) + suites nativas verdes + drill STOP cronometrado + higiene-check no baseline + 3 PRs abertos (runner · higiene-CI · skills) + recibo com fatia local medida.

**NEXT** Merge do Paulo → Windows roda `MP_GPU_PILAR_WINDOWS_REPLICA` (inversão de residentes + golden set P2) → sessões Cowork `/moo-talo` por device → prev_hash antes de consolidar ledger multi-device.

**BACK** ⇄ MOO HANDOFF no SYNC.md com: tabela S0 (paths reais dos 2 repos), tabela RECON, resultado F2, tempos do drill, fatia local, os 3 PRs. O Cowork audita contra git/ledger e atualiza o Notion ("GPU por Pilar" → Runs).
⇄ END HANDOFF

# ADENDO: F10 · MOO VIGIA — ler e executar `_handoff/MP_ADDENDUM_F10_VIGIA_2026-08-15.md`
# (endpoint loopback $0 /fleet.json + SSE + POST /t/<token>/play|/stop; shell do artifact em
#  _handoff/skills-build/gpu-pilares/moo-vigia-shell.html — versionar em dashboard/ ou plugin/ via PR)

# ADENDO 2 (15/08 ~15h): DRAFTS PRONTOS — `_handoff/moo-drafts-2026-08-15.zip`
# Produzidos no Cowork (workflow Fable 5) e APROVADOS por refutação adversarial. Descompactar e aterrar via PR:
# · sonda-apple-silicon/ → módulo Node zero-sudo p/ o ramo darwin da sonda de GPU (prop-002; try/catch provado, contrato n/d-com-porquê 100%)
# · local-decisao/ → PATCH_SPEC + teste 9/9 do campo local_decisao no evento dispatched (prop-003; ponto de inserção: confirmar no código, spec não inventa linha)
# · golden-set/ → 14 casos com citação literal das falhas reais (P2 D3; 12 FAIL/2 PASS — desequilíbrio declarado no README, agregado ainda não é métrica)
# · doc-fix-prop005/ → 1 linha no STRATEGY.md (sha do classify; CONFIRMAR shasum antes de aplicar)
