# 🐮 RUNBOOK DO PAULO — tudo que decidimos, em ordem, copia-e-cola (2026-07-15)

> Uma página. Segue de cima para baixo. Cada passo diz QUEM faz (tu / CC / Codex / Cowork) e o que colar.
> Regra de ouro da rodada: **1 sessão CC de cada vez na árvore principal** · Codex roda em paralelo
> (worktrees próprias) · nada mergeia sem ti · SYNC.md 📥 fica 🟡 até o spine fechar.

---

## PASSO 1 — Fundação (CC) · começa HOJE · é o trilho principal

Abre **UMA** sessão do Claude Code na pasta `frugal` e cola:

```
Lê e segue _handoff/FOUNDATION_RESET_MASTERPROMPT_V2_1.md na íntegra, começando pela F1 (snapshot).
Lê antes as 3 notas aditivas de _handoff/MOOTER_MASTER_ANALYSIS_2026-07-14.md (F0.5 máquina sem GPU;
F5 coluna core|frozen|parked; F7 drift check claim-vs-prova).
IMPORTANTE na F1.5 (PR da régua): a worktree ../frugal-regua (branch chore/tese-v2) JÁ EXISTE — usa ela,
não cria outra. O texto aprovado da tese está na FASE 0 de _handoff/SETUP_RADAR_MASTERPROMPT.md
(bloco EN para AGENTS.md + bloco PT-BR para MOOTER_ROADMAP.md). Aplica exatamente esses textos.
Para em TODOS os ⛔ STOP e espera meu OK.
```

**O que TU fazes neste passo:** responder os ⛔ STOPs (F1 backup → OK; F1.5 diff da régua → OK; F3 por
lote; F5 keep-list ≤6 → tu bates o martelo). O relógio: F3→F6 fecham em ≤7 dias.

## PASSO 2 — Corrida Codex (paralelo, pode ser hoje também)

Terminal na pasta `frugal` → digita `codex` → cola:

```
Lê e segue _handoff/CODEX_AGENTIC_OS_RUN_MASTERPROMPT.md. Executa a wave C0 (recon, read-only) e PARA
no ⛔ STOP com o mapa de colisões antes de escrever qualquer linha.
```

**O que TU fazes:** revisar o mapa do C0 → OK → ele segue C1→C6, cada wave termina num **draft PR**.
Quando um BACK chegar, cola no Cowork (aqui) que eu confronto contra os gates antes do teu merge.
Se os BACKs vierem fracos a partir do C3/C4, muda o modo: cola a mesma linha numa sessão CC e deixa
o CC orquestrar o Codex por keeper (método W-UX).

## PASSO 3 — Só-tu (5-15 min cada, qualquer hora desta semana)

1. **Conectar o vault ao Cowork** (pendência desde 13/07 — nem eu nem a análise de 14/07 conseguimos
   auditar): Claude Desktop → botão **Add folder** → `C:\Users\Paulo Loureiro\paulo-vault`.
2. **Teste do amigo (F0.5)**: escolhe 1 amigo vibe coder com **máquina SEM GPU NVIDIA** (isso é de
   propósito — ataque D4) e marca ~30 min. Instala v0.16.66 de main/tag, cronometra, anota friamente
   onde quebra. Vira `docs/strategy/FRIEND_TEST_BASELINE_2026-07.md`. Expectativa honesta: vai falhar —
   o objetivo é medir ONDE.
3. **3 decisões pendentes** (responde aqui no Cowork quando quiseres):
   ☐ arbiter Haiku OFF por default no build do amigo? (recomendo SIM — privacidade/D6)
   ☐ keep-list da F5: quais dos 24 PRs sobrevivem? (candidatos: #233 quota · #229 eval · #225 moo-loop ·
     #244 MEO · spine PR · flicker PR — máx. 6)
   ☐ nome novo do worktree-conductor (proposta: herd-conductor) — decide na Great Rename.

## PASSO 4 — Great Rename frugal → mooter (🧊 PARKED — NÃO agora)

Masterprompt pronto em `_handoff/GREAT_RENAME_MASTERPROMPT.md`. **Gate: só depois da F4+F6** (árvore
limpa + worktrees ≤5, tudo pushed). Quando o CC declarar F6 fechada, cola numa sessão CC nova:

```
Lê e segue _handoff/GREAT_RENAME_MASTERPROMPT.md. Confirma os 3 gates de entrada antes da FASE 0;
se qualquer um falhar, ABORT e reporta.
```

Resultado: uma pasta `mooter\` única (repo + `mooter\worktrees\`), tasks/pm2/paths atualizados, e a
tela do VS Code para de parecer um estacionamento de frugais.

## PASSO 5 — Depois (não agora; só para saberes o mapa)

Spine B-F + North Star F0 fecham (CC) → Cowork emite a **corrida 2 do Codex**: Morning Brief (Resume),
Time Machine (undo 1 clique), Spec Rail, botões "Corrigir" do Radar. Aí o teu agentic OS está inteiro:
para ti → re-roda teste do amigo → e só então falamos de clientes.

---

## COLA-RÁPIDA (os 3 comandos desta semana)

| Onde | O quê |
|---|---|
| Sessão CC (árvore principal) | `Lê e segue _handoff/FOUNDATION_RESET_MASTERPROMPT_V2_1.md ...` (bloco completo no Passo 1) |
| Terminal `codex` | `Lê e segue _handoff/CODEX_AGENTIC_OS_RUN_MASTERPROMPT.md ...` (bloco do Passo 2) |
| Claude Desktop | Add folder → `C:\Users\Paulo Loureiro\paulo-vault` |

## O QUE NUNCA FAZER NESTA RODADA

❌ Apagar pastas `frugal-*` à mão (3 têm commits que não existem em nenhum remote — a F6 poda com
verificação) · ❌ 2 sessões CC na árvore principal ao mesmo tempo · ❌ mergear draft PR sem confronto ·
❌ escrever no SYNC.md 📥 (spine é o dono) · ❌ rename de pasta antes da F6 · ❌ `git add -A` (sempre).
