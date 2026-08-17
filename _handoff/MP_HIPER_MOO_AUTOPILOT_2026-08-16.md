# 🔥 MP HIPER — CC · MOOTER NO TALO · MOO AUTO PILOT PERFEITO · 2026-08-16 (v2)

## 🧭 COMO USAR
- **Sessão CC NOVA e fresca** na raiz do `frugal`, conector Mooter ligado. **Já há trabalho começado** na branch `feat/f1-runner-canonico` (F1) — **continua e valida daí, não recomeces**.
- **Frota de LLMs (mooter no talo, todas):** `/mooter-model mix` → o Mooter escolhe entre **moo (Ollama local · $0)**, **cc (Claude/Fable)**, **codex**, **gemini**, **kimi** — local-primeiro, escalando por tarefa; **Fable 5 orquestra**.
- **Modo workflow:** cada fase é um workflow com **subagentes em paralelo** (um por pilar/ficheiro/dimensão) + verificação adversarial.
- **Duas economias:** o **BUILD** (executar este MP) usa a frota toda, tokens OK; o **RUNNER entregue** (auto-pilot perpétuo) é **$0 DURO, só Ollama local** — se gastar 1 token de subscription, é bug.

## 🕳️ GAP Nº1 (o que separa o "hoje" do "perfeito") — LER PRIMEIRO
Hoje existem **DOIS painéis desligados**:
1. A **skill** `/moo-pilot` gera um artifact **ESTÁTICO** ("PARADO · Dados EMBUTIDOS · device offline"). NÃO faz fetch ao runner.
2. O **runner** (endpoint `127.0.0.1:4290`) é que tem a GPU a trabalhar de verdade, com gauge/feed ao vivo — **outro artifact** (`moo-pilot-mac-mini`).

**A magia só é "de verdade" quando a skill gera o painel que LIGA ao runner.** É o coração deste MP (F2+F5). Enquanto não unir, `/moo-pilot` = painel morto e `127.0.0.1:4290/panel` = painel vivo. **Unir os dois é a prioridade absoluta.**

Outros gaps validados: **(a)** contenção — 3 fontes (runner + 2 sessões) disputam a GPU/device → "device offline"; precisa de **1 lease de GPU por device** e "uma sessão de cada vez". **(b)** **auto-start** ausente (depende de duplo-clique). **(c)** **ids de artifact duplicados** (`moo-pilot-mac-mini` vs `moo-pilot-mac-mini-de-paulo-local`) → **UM canónico por device**. **(d)** alinhamento projeto/vault/github ainda `n/d` no fleet.json. **(e)** 3 PRs (#268/#269/#270) aguardam **merge do Paulo**.

## 🎯 GOAL
`/moo-pilot` num device → aperta **▶** → a GPU dele trabalha **não-stop, $0** (só Ollama local), validando/resolvendo/melhorando o projeto, com cockpit ao vivo (GPU% real via ioreg, VRAM, modelos locais, play por pilar, cross-device, alinhamento projeto/vault/github) — medido, honesto, sem verde-falso. Canónico no repo, amarrado ao conector 1.48.0, auto-arranca, refutado pelo gauntlet.

## 📍 WHERE
- **Mac mini:** `~/frugal`(main) · vault `~/paulo-vault` · `~/.mooter` · Ollama `127.0.0.1:11434`
- **Windows 4090:** `C:\Users\Paulo Loureiro\frugal` (P2/P5) · **gh** `pauloloureiroshp-ship-it/mooter` · **conector** 1.48.0
- **classify.js FROZEN** sha256 `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`

## 🧱 ESTADO — herda (NÃO recomeça)
- Branch **`feat/f1-runner-canonico`** já iniciada (F1 em curso — runner virou shim, a canonizar em pacote).
- 3 PRs abertos: `#268` f3-stop · `#269` f7-skills · `#270` f5-higiene (auditados; aguardam merge).
- Runner host-side vivo (980+ recibos $0): `~/frugal/moo-runner.command` — loop $0 Ollama + F10 `:4290` (`/fleet.json`,`/play`,`/stop`, serve `/panel`) + sampler **GPU% via `ioreg IOAccelerator`** + modelos (`/api/ps`). Kill-switch, mutex, race fechado.
- Painel v5 (o vivo, a ligar ao F10): `~/frugal/moo-pilot-preview.html`.
- moo-talo v2 (local-only, zero interrogatório). **GPU% provado via ioreg** (17–99%).
- Vault: `30-learnings/2026-08-16-*` + `40-strategy/moo-pilot-guia-operacao-2026-08-16.md`.

## ✅ DO — fases (cada uma = 1 workflow c/ subagentes; recibo no fecho)
**F0 · RECON** — `/mooter-first`. Fan-out de leitores sobre vault + tail do SYNC + os 3 ficheiros herdados + a branch f1. `mooter_fleet`+L0. Confirma conector 1.48.0. **grep prova ou morre.**
**F1 · RUNNER → PACOTE** (em curso) — termina o runner canónico em `packages/fleet-commander/` (loop $0 Ollama-only, F10, sampler ioreg, kill-switch), amarrado ao **stop-gate** (#268). Testes nativos verdes. `.command` = shim fino.
**F2 · UNIR SKILL ↔ RUNNER (GAP Nº1)** — o painel v5 vira `tools/cockpit/moo-pilot-shell.html` (contrato `build-snapshot.js`, ladder: `__MOOTER_SNAPSHOT__`→fetch F10→embutido). **A skill `/moo-pilot` passa a gerar ESTE shell**, que faz fetch a `127.0.0.1:4290` → VIVO. Mata o comportamento "Dados EMBUTIDOS estático". UM id por device.
**F3 · ALINHAMENTO REAL** — F10 expõe MEDIDO: `projeto.repo_clean`(git status), `repo_branch`, `behind/ahead`, `vault_last`, `classify_sha_ok`. Verde só quando medido.
**F4 · AUTO-START** — LaunchAgent Mac (`ai.mooter.runner.plist`) + tarefa Windows; arranca com o device, respeita STOP. "Ligar o Mac" = "apertar play".
**F5 · SKILLS CANÓNICAS + LEASE** — canoniza `skills/` (moo-talo v2, moo-pilot→shell F2, moo-pilar-*). **1 lease de GPU por device** (skill e runner coordenam-se; nunca 2 a bater no Ollama → mata a contenção "device offline").
**F6 · GPU% + MULTI-MODELO** — gauge consome `gpu.util_pct`/VRAM (ioreg); painel separa por modelo local o que cada um resolve. Valor = recibos/hora; GPU% = utilização, ambas honestas.
**F7 · CROSS-DEVICE (4090)** — replica Windows: runner+F10+shell `moo-pilot-<device>`; cada painel espelha a frota em tempo real.
**F8 · CHECKLIST 14 QUEIXAS** — critério verificável + prova no painel para cada. Uma falha = reprovado.
**F9 · GAUNTLET (adversarial, não-stop)** — subagentes tentam refutar: runner gasta token? kill-switch fail-closed em corrida? verde-falso em offline/tab-de-fundo/ficheiro-velho? recibo sem evidência? skill ainda gera estático? Corrige até **2 rondas limpas seguidas**.
**F10 · REGISTO** — `mooter_journal` + `SYNC.md` + Notion: decisões, routing por prompt (qual LLM), recibos.

## 🛡 GUARD
Runner entregue = **$0 duro** (só Ollama, zero subscription). classify.js **FROZEN**. Evidência-ou-`n/d` (citação sem grep morre). "% GPU" mede-se (ioreg) mas nunca substitui recibos/hora. Nunca `git add -A`. Nunca `write:true` sem pedido. Offline/tab-de-fundo/ficheiro-velho = **honesto**, nunca verde-falso.

## 🚦 GATE — só o Paulo
Merge · push `main` · deploy · tag · modelo residente · secrets · apagar dados.

## 🔜 NEXT
`F0 → F1(termina) → F2(unir, prioridade) → F3 → F5(lease) → F8 → F9`; depois F4/F6/F7; F10 no fecho.

## ↩ BACK
Recibo 7 blocos (objetivo · mediu · propôs · não-verificou · custo · duração · próximo) + `mooter_setup({sessao:'registar'})`. ≤3 ações, ≤1 pergunta.

---
**Prioridade: F2 (unir skill↔runner). Sessão fresca, mooter no talo com a frota inteira em workflow (Fable orquestra), até o gauntlet passar 2× limpo. O runner entregue é $0 local — se gastar 1 token de subscription, PÁRA e reporta.**

## ⚠️ ATUALIZAÇÃO 2026-08-17 — CI VERMELHO, RESOLVER ANTES DE MERJAR
Antes de qualquer merge dos 3 PRs, o CI está **vermelho** (medido via `gh pr checks`, sessão 2026-08-17):
- **#269** (f7-skills): `a suite não pode piorar` **fail** · `ratchet` **fail** (2×)
- **#270** (f5-higiene): `ratchet` **fail** (higiene / claude-review / threat-model **pass**)
- **#268** (f3-stop): não medido — **n/d**, verificar

**Resolver os guards `ratchet` e `a suite não pode piorar` (algo regrediu) ANTES de merjar.** Merjar no vermelho dispara `publish-npm` / `publish-mcpb` / `publish-cockpit` / `deploy-hub` com código regredido. **Só merjar com verde.** Fluxo: CC entra pela `feat/f1-runner-canonico` → fecha ratchet/suite + F2 → PRs verdes → `MERGE-3-PRS.command` merja limpo → deploy dispara sozinho.
