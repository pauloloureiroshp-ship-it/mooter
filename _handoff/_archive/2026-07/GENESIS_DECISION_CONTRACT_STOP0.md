# ⇄ COWORK → CC · DECISION CONTRACT — GENESIS STOP-0 resolvido (payload↔P4 · probe · merges)
> Budget: ≤ 2k tokens · id: genesis-dc-stop0 · source: decisões Paulo 2026-07-17/18 (transcript Cowork
> + sessão CC genesis) · consumidor: sessão F1 FRESCA em `../frugal-genesis` — este ficheiro existe
> para as decisões sobreviverem fora do transcript (o `--qa` de sessão nova não as apanha).

CONTEXT: F0 do `GENESIS_SUPER_MASTERPROMPT` correu 2026-07-17 e parou em STOP-0 (3 gates vermelhos +
premissas refutadas). Paulo respondeu. Cowork confrontou, corrigiu os artefactos e tipifica aqui.

| Decision | Verdict | Exact change/evidence |
|---|---|---|
| 1. payload §2.4 ↔ P4 | **(b) contrato de PRODUTO — fora do escopo P4** | schema dos 8 pilares nasce standalone e versionado (`schema_version`), herda truth rules (n/d · provenance · read_evidence) como DOUTRINA, não como 5º tipo de mensagem; canon #255 INTOCADO (o 🔒 GUARD já proibia editá-lo); nota já gravada em `docs/strategy/MOOTER_GENESIS_SPEC.md` §2.4 |
| 2. colisão `setup_profile.json` × `setup-state.json` | **`mooter genesis probe` novo** | `packages/cli/src/commands/genesis.ts` (novo — já estava na allowlist); `setup.ts` da Wave 29 INTOCADO (motor frozen-adjacent); C3 fica servido pelo Genesis em vez de esperar por ele |
| 3. merges | **#255 PRIMEIRO; #254 NÃO mergear já** ⚠️ emenda Cowork à instrução "merge #254+#255" | evidência nova medida 2026-07-18: os DOIS PRs adicionam `tools/handoff-preflight.js` com conteúdo DIVERGENTE (sha `33a4015…` em chore/mooter-20-h0 vs `2611369…` em chore/moo-lingua-franca) — mergear ambos = conflito; e o #254 declara no corpo "SEM merge — para revisão". Sequência: merge #255 → #254 rebaseia e reconcilia o preflight (a versão #255 é a validada: 31/31 testes, referenciada pelo canon) |
| 4. allowlist/REUSE do F0 | **corrigidos e gravados** | `genesis-*.js` CommonJS · `assets/genesis/**` · claim vscode-elements RETIRADO — em `GENESIS_SUPER_MASTERPROMPT.md` (F0d/GUARD/F4/REUSE), spec §5, `GENESIS_PILLAR_PROMPTS.md` cabeçalho |
| 5. corpus RED ALERT | **fechado (local)** | commit `b3dd641` em `feat/genesis-tab` (9 ficheiros, 1612 linhas); ⚠️ 1 disco só até o PUSH (gate Paulo) |

GUARD:
herdado integral do `GENESIS_SUPER_MASTERPROMPT.md` — classify.js FROZEN sha `427d8c0b…` · allowlist
exata (corrigida, decisão 4) · git add seletivo · push/merge/delete = gate Paulo · honest-copy.

NEXT GATE: `git fetch origin` → `git show origin/main:docs/agent-context/AGENT_CONTEXT_PROTOCOL.md`
contém "Lingua Franca v1" E `git cat-file -e origin/main:tools/handoff-preflight.js` → rebase
`feat/genesis-tab` sobre origin/main → F1 arranca (schema + validador L0 + `kind:genesis` + projeção
genesis-state, 3 fixtures) → termina em ⛔ STOP-1 (diff do schema → Paulo).

⛔ STOP
STOP-1 (diff do schema F1) · STOP-2 (superfície do conector, antes da F6) · Radar C4 ausente →
modo degradado declarado: F4 marca `proof: n/d` CINZA, nunca verde (teste "verde sem proof = FAIL").

🔍 council 8/8 · objeção mais forte: "a decisão 3 contradiz a instrução registada do Paulo (mergear
ambos)?" · resolvida: não contradiz — reordena com evidência nova (sha divergente, medido); o clique
final continua sendo do Paulo, e o #254 continua vivo na própria trilha de review.
📮 DESTINO: CC · sessão F1 FRESCA no worktree `../frugal-genesis` (ler este ficheiro no boot, antes de F1)
⇄ END
