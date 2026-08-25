# Mooter Mirror — "um cérebro, duas caras" · arquitectura do espelho Cowork⇄cockpit · 2026-07-05

> Pedido do Paulo: o Claude Desktop tem perfil, Projects, artifacts, schedule, customize, context,
> memory, loop, design — e o Mooter, na linha do sync perfeito via conector, precisa **espelhar
> isso perfeitamente e visualmente no plugin VS Code**. Este doc fecha a arquitectura; os
> masterprompts executáveis estão em `_handoff/MIRROR_MASTERPROMPTS.md`.

## 0. A tese (e o limite honesto)

**Um cérebro, duas caras.** O estado que importa (quem és, o que sabemos, o que está na fila, o
que a frota faz, o que custou) deve ser UM só — visto do chat (Cowork) ou do cockpit (VS Code),
é a mesma verdade. O Mirror não é uma cópia da UI do Claude Desktop dentro do VS Code; é o
**estado partilhado renderizado nativamente em cada cara**. Limite honesto: parte do estado do
Claude Desktop é cloud-only e sem API pública — esse espelha-se **por exportação** (o Cowork
escreve snapshots), nunca por scraping. O cockpit mostra `n/d honesto` quando não sabe.

## 1. Descoberta que muda o custo (verificada hoje, empiricamente)

**A memória do Cowork vive em DISCO no host**, em markdown simples:
`%APPDATA%\Claude\local-agent-mode-sessions\<workspace>\<agent>\spaces\<space>\memory\`
→ `MEMORY.md` (índice, 1 linha/memória) + 60+ ficheiros `*.md` com front-matter
(`name/description/type: user|feedback|project|reference`). **O plugin pode ler isto nativamente,
read-only, sem conector nenhum.** As skills também estão em disco (cache do skills-plugin).
O cockpit já tem embriões do espelho: `cowork-waiting.js` (waiting-for-cowork), mapa CC↔Cowork
(`.mooter-sessions.json` via mode-registry, escrito pelo signal.ps1/sdk-runner), agrupamento por
`coworkProject`, `vaultMtime` no handoff. **O Mirror é a consolidação disto numa lente, não uma
infra nova.**

## 2. Os 3 mecanismos do espelho (por superfície do Claude Desktop)

| Superfície Claude | Onde vive | Mecanismo de espelho | Fidelidade |
|---|---|---|---|
| **Memory** | ✅ disco (`spaces/<id>/memory/*.md`) | **T1 · leitura directa** pelo plugin (read-only, fail-soft) | total, ao vivo (mtime) |
| **Skills** | ✅ disco (cache skills-plugin) | T1 · leitura directa (nome+descrição do SKILL.md) | total |
| **Sessões Cowork** (context/loop) | provável disco (`local-agent-mode-sessions/<sid>/`) | T1 após **recon MP-0** (estrutura não documentada — mapear antes de construir) | a confirmar |
| **Scheduled tasks** | armazenamento desconhecido | recon MP-0; fallback **T2 · export** | a confirmar |
| **Artifacts** | provável disco (space dir) | recon MP-0; fallback T2 | a confirmar |
| **Perfil / preferences / styles (customize/design)** | ☁️ cloud, sem API | **T2 · export pelo Cowork**: snapshot `profile.md` (o próprio Cowork conhece o perfil que o renderiza) + doutrina existente vault>profile | por snapshot, com timestamp |
| **Projects** | ☁️ cloud | T2 · export (lista+descrição que o Cowork vê) + espelho por convenção que JÁ existe (Notion mirror no vault, SYNC.md por projecto) | por snapshot |
| **Frota CC / dispatch / git-verdade / savings** | host Mooter | **T3 · bridge MCP + contratos de ficheiro** (dispatch/, dispatch.jsonl, decisions.log) — já desenhado | total, ao vivo |

**T2 em detalhe (a peça nova barata):** um dir-contrato `~/.mooter/cowork-mirror/` onde EU (Cowork)
escrevo snapshots: `profile.md`, `projects.json`, `schedule.json`, `artifacts.json`, `snapshot.json`
(ts + versões). Escrevo-os (a) on-demand quando pedes, (b) via scheduled task diária, (c) no fim de
sessões relevantes (hábito de registo que já tenho). O plugin lê e mostra com a idade do snapshot
no chip — **freshness honesta em vez de fingir tempo-real**.

## 3. Privacidade — guardrails NÃO-negociáveis do Mirror

1. **Local-only, sempre:** memória/perfil renderizam no webview e MORREM aí — nunca vão ao hub,
   nunca a telemetria, nunca a um LLM cloud sem acção explícita tua.
2. **Fora do git:** `~/.mooter/cowork-mirror/` vive FORA do repo (não é `_handoff/`!) — memória
   pessoal nunca pode acabar num commit/push. O que fica no repo é só a fila de dispatch (specs
   de trabalho, já hoje).
3. **Read-only rigoroso no T1:** o plugin NUNCA escreve nos internals do Claude Desktop (a régua
   do mount-git aplica-se em dobro aqui — escrever = corromper o cérebro).
4. **Estruturas internas = não-contratuais:** paths do AppData podem mudar com updates do Desktop
   → leitura fail-soft, versão detectada no recon, degradação p/ `n/d honesto` (nunca crash, nunca
   dado inventado).

## 4. A lente 🧠 Cowork no cockpit (encaixe no CTO Command Deck)

Quinta lente do deck (junta-se a Floor/Flow/Economics/Memory — ou funde com a Memory lens,
decisão de design no MP-1):

```
🧠 COWORK — o cérebro, espelhado
┌─────────────────────────────────────────────────────────────┐
│ PERFIL   Paulo · founder pós-exit · foco: Mooter Via B      │ ← T2 profile.md (idade: 2h)
│          gate 30d · PT-PT · vault ✓ fresco (4 min)          │ ← vaultMtime (já existe)
│ MEMÓRIA  67 memórias · 5 novas hoje                         │ ← T1 MEMORY.md ao vivo
│   🔍 [busca] → project_mooter_conductor (hoje) → abrir .md  │
│ FILA ⇄   3 cards: MP3 ✅proven · dispatch 🟡 · bridge ⬜    │ ← T3 dispatch.jsonl (F0)
│ SCHEDULE briefing 06h ✓ · loop-evaluator 10min ✓            │ ← T1/T2 (recon decide)
│ SKILLS   sync-project · notion-to-vault · cowork-cc-bridge  │ ← T1 skills dir
│ SESSÕES  Cowork hoje: 4 (esta: Conductor/Mirror) ↔ CC: 7    │ ← T1 recon + recentSessions
│ ARTIFACTS 2 vivos                                            │ ← T2/recon
└─────────────────────────────────────────────────────────────┘
```

Regras de design (herdadas do deck): diagnóstico-não-scoreboard · por-excepção (o que precisa de
ti sobe) · honest-copy (idade de cada dado no chip) · WCAG · 🐮 identidade. Cada linha é
clicável → abre o ficheiro real (memória .md, skill, card) — **o espelho é navegável, não
decorativo**.

## 5. Porque isto fecha o círculo "nunca mais Lovable"

O Lovable dá chat+preview+deploy mas é **amnésico e cego**: zero memória de ti, zero frota, zero
consciência de custo, zero auditabilidade. O stack Mooter completo responde superfície a
superfície: **App Stage/Live Preview** (já em prod) = o preview deles, local e fiel · **Live Edit
MP5** = o select-to-edit deles, determinístico $0 · **Dispatch F0** = o que eles nem têm (frota
paralela com gate humano) · **Mirror** = o cérebro que te conhece em AMBAS as caras · **Router $0**
= a conta que eles escondem. A frase: *"O Lovable conhece o teu último prompt. O Mooter
conhece-te há 90 dias — e mostra-to no cockpit."*

## 6. Sequência (respeita o que já está decidido; zero colisão de worktrees)

| Ordem | O quê | Toca | Pode correr em paralelo com |
|---|---|---|---|
| 1 | **F0 Dispatch v2** (pronto) | vscode-extension | MP-MIRROR-0 (não toca extensão) |
| 2 | **MP-MIRROR-0** recon disco Claude Desktop (read-only, relatório) | nada (só `_handoff/`) | F0, Bridge P0 |
| 3 | **Bridge P0** commit nativo + config Desktop | mooter-bridge | tudo |
| 4 | **MP-MIRROR-1** lente 🧠 no cockpit (T1 + freshness) | vscode-extension | Bridge v0.2 |
| 5 | **MP-MIRROR-2** contrato T2 + skill/schedule de export (lado Cowork = eu) | `~/.mooter/cowork-mirror/` | — |
| 6 | **Bridge v0.2** (+ `mooter_mirror_status`) | mooter-bridge | MIRROR-1 |

Masterprompts executáveis: `_handoff/MIRROR_MASTERPROMPTS.md`.
