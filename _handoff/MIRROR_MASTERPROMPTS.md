# ⇄ COWORK→CC · Mooter Mirror — masterprompts (MP-0 recon · MP-1 lente · MP-2 export)

Lê primeiro: `_handoff/MOOTER_MIRROR_ARCHITECTURE.md` (a spec). Ordem: MP-0 pode correr JÁ em
paralelo com o F0 Dispatch (não toca a extensão); MP-1 só DEPOIS do F0 aterrar (ambos tocam
vscode-extension — régua 1 worktree = 1 sessão). MP-2 é maioritariamente trabalho do Cowork.

---

## MP-MIRROR-0 · Day-0 recon do disco Claude Desktop (read-only, sem UI)

---
dispatch: { worktree: frugal-mirror-recon, base: main, model: sonnet, mode: fresh }
---
Worktree ../frugal-mirror-recon from main. Sonnet.

GOAL
Mapear com verdade empírica o que do estado Claude Desktop/Cowork vive em disco nesta máquina e
em que formato, para a lente 🧠 Cowork nunca ser construída sobre suposição. Estruturas internas
não são documentadas — este recon é o contrato.

DO
1. Explora (READ-ONLY, nunca escrever/mover/lockar):
   `%APPDATA%\Claude\local-agent-mode-sessions\` — estrutura de workspaces/agents/spaces;
   `spaces\<id>\memory\` (confirmar MEMORY.md + front-matter dos .md);
   sessões Cowork (transcripts? formato? mtime útil p/ "sessões de hoje"?);
   artifacts (onde persistem? índice?); scheduled tasks (existe storage local? senão marca
   cloud-only); skills (caches: paths, SKILL.md parseável); uploads/outputs.
   Também `%APPDATA%\Claude\claude_desktop_config.json` (mcpServers — só constatar, não editar).
2. Para cada superfície: path glob estável · formato · campo de freshness · risco de mudança
   (heurística: tem GUID? tem versão?) · veredicto T1-lível vs T2-export vs cloud-only.
3. Escreve `docs/foundation/CLAUDE_DESKTOP_DISK_MAP.md` (o contrato do Mirror) + parser-stub puro
   `packages/vscode-extension/src/cowork-mirror-recon.md` NÃO — sem código nesta wave; só o doc.
4. Redige no doc os 2 exemplos reais mais pequenos (anonimizados) de cada formato encontrado.

GUARD
READ-ONLY absoluto no AppData (a régua do mount-git em dobro: escrever = corromper o cérebro) ·
nada de conteúdo pessoal de memórias no doc (só estrutura/frontmatter, valores redacted) ·
classify.js intocado · sem novos .md na raiz (docs/foundation/) · PT-PT prosa, inglês identifiers.

GATE
Doc existe com: ≥5 superfícies mapeadas com veredicto T1/T2/cloud-only cada · paths glob testados
na máquina real · seção "riscos de versão" · zero escritas no AppData (prova: nenhum mtime mudou
nos dirs explorados — regista mtimes antes/depois).

BACK
Tabela superfície→veredicto + o que muda no desenho do MP-1 (ex: se sessões Cowork não forem
T1-líveis, a linha SESSÕES nasce T2).

---

## MP-MIRROR-1 · Lente 🧠 Cowork no cockpit (T1 + freshness honesta)

---
dispatch: { worktree: frugal-mirror-lens, base: main, model: sonnet, mode: fresh }
---
Worktree ../frugal-mirror-lens from main (DEPOIS do F0 Dispatch aterrar). Arquitectura Opus, código Sonnet.
Lê: MOOTER_MIRROR_ARCHITECTURE.md §2-§4 + docs/foundation/CLAUDE_DESKTOP_DISK_MAP.md (output do MP-0 — é o contrato).

GOAL
Quinta lente do CTO Command Deck: 🧠 Cowork — perfil, memória (navegável), fila dispatch, schedule,
skills, sessões Cowork↔CC, artifacts. Tudo com idade do dado no chip. O vibe coder vê o cérebro
sem sair do VS Code.

DO
1. Novo `src/cowork-mirror.js` (módulo puro, injectável p/ testes): leitores fail-soft por
   superfície segundo o DISK_MAP — `readMemoryIndex()` (MEMORY.md → [{title, file, hook}]),
   `readMemoryEntry(file)` (front-matter+corpo), `readSkills()`, `readCoworkSessions()` (se T1),
   `readMirrorSnapshots()` (T2: `~/.mooter/cowork-mirror/*.json|md` + idade), `freshness(mtime)`.
   Caps de leitura (tail/64KB) ao estilo readBusTail. Erro/ausência → null (n/d honesto).
2. Lente no deck (webview): layout §4 da arquitectura. Cada linha clicável:
   memória → abre o .md (`vscode.window.showTextDocument`); skill → SKILL.md; card → lente
   Dispatch; sessão CC → openSessionTab. Busca client-side no índice de memórias.
3. Chips de freshness em TODAS as linhas ("ao vivo" T1 · "snapshot há 2h" T2 · "n/d" cloud-only).
   NUNCA mostrar dado sem idade.
4. Privacidade: rendering local-only; nenhum campo do mirror entra em hub-client/telemetria/
   handoffs gerados; assert em teste (grep no payload do hub).
5. Integra os embriões existentes (não duplicar): cowork-waiting → linha de estado; mode-registry
   coworkMap → mapa sessões; vaultMtime → chip perfil.
6. Testes: fixtures de memory dir sintético (índice+2 memórias) · skills dir · snapshots T2 com
   idades · ausência total (n/d) · privacidade (mirror fora do hub payload) · caps de leitura.

GUARD
classify.js FROZEN · READ-ONLY no AppData · privacidade §3 da arquitectura (local-only, fora do
git, nunca hub) · aditivo (ficheiros novos + diff mínimo no deck) · honest-copy (freshness sempre;
nunca fingir tempo-real) · PT-PT copy · selective add · vsix instala em máquina SEM Claude Desktop
(lente mostra n/d honesto, zero crash).

GATE
Lente abre com: as minhas memórias reais listadas e pesquisáveis · clique abre o .md certo ·
perfil com idade do snapshot · skills reais · fila do F0 viva · máquina sem Desktop → n/d limpo ·
testes verdes + suite sem regressões · sha intacta · zero writes no AppData.

BACK
Screenshot da lente com dados reais + relatório de qualquer divergência DISK_MAP vs realidade.

---

## MP-MIRROR-2 · Contrato T2 + export do lado Cowork (executor: o COWORK, não o CC)

Sem worktree — isto é maioritariamente meu (Cowork). O CC só entra se o recon exigir helper local.

CONTRATO (`~/.mooter/cowork-mirror/`, FORA do repo):
- `profile.md` — resumo do perfil que me renderiza (quem és, foco, régua de comunicação) SEM dados
  sensíveis (sem moradas/números; é um espelho de trabalho, não um dossier)
- `projects.json` — [{name, description, lastSeen}] dos Projects que vejo
- `schedule.json` — [{name, cadence, lastRun}] das scheduled tasks que conheço
- `artifacts.json` — [{title, updatedAt}] dos artifacts vivos
- `snapshot.json` — {ts, generator: "cowork", version: 1} (o plugin usa p/ idade global)

EXECUÇÃO (eu, Cowork):
1. Gero os snapshots on-demand ("actualiza o mirror") e no fecho de sessões relevantes (junta-se
   ao hábito Notion+vault que já tenho).
2. Scheduled task diária (06h, junto ao briefing) que reescreve os snapshots — colar-e-esquecer.
3. Se MP-0 concluir que schedule/artifacts são T1-líveis, removo-os do T2 (menos é mais).

GUARD: nunca escrever dados sensíveis do perfil · dir fora do repo · versão no snapshot p/ o
plugin degradar com honestidade quando o contrato evoluir.

GATE: os 5 ficheiros existem com ts de hoje · a lente MP-1 mostra-os com idade correcta · rodar o
export 2× é idempotente.

---

## Addendum Bridge v0.2 (para o track do conector, já decidido)
+ tool `mooter_mirror_status` (read-only): devolve {superfície: {available, freshness}} — permite
ao Cowork auto-verificar se o seu export está a chegar ao cockpit. Junta-se a git_snapshot/
dispatch_enqueue/dispatch_status/worktree_list do estudo do conector.
