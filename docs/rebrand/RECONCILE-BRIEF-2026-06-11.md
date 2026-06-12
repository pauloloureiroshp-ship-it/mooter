# RECONCILE BRIEF — dev ↔ main (urgente, antes de qualquer wave nova)

**Data:** 2026-06-11 (Cowork) · **Estado medido:** dev tem 5 commits únicos (Kill Frugal ×3 + Wave 52 #152 + merge Wave 32) · main tem **91 commits únicos** (até Wave 53/54, v1.35.0)

## Porque é urgente
1. O Mac fez install do dev e levou **downgrade v1.35→v1.25** (recuperado reinstalando do main — ver memória Cowork 11-Jun).
2. O installer do main (frugal-era) **regenerou device.id espúrio** em ~/.frugal — o Kill Frugal só protege devices quando chegar ao main.
3. Dual-track de waves (52 no dev; 53/54 no main) = trabalho a divergir silenciosamente.

## Merge experimental (sandbox Cowork, `git merge origin/main` em cima de origin/dev)
**14 conflitos** — e ZERO nos ficheiros do rebrand (renames auto-resolvidos pelo git ✅):

| Ficheiro | dev (último toque) | main (último toque) | Resolução recomendada |
|---|---|---|---|
| tools/router/version.json | Wave 52 | release 1.35.0 | **main** (1.35.0) |
| SYNC.md | Cowork 11-Jun | main | concatenar (manter secção Cowork) |
| tools/router/package.json | Wave 52 | main | integrar deps de ambos |
| tools/router/statusline-multi.js + .test.js | Wave 52 (conductor-status chip) | Wave 53 (#157) | **integrar ambos** — features distintas |
| packages/cli/src/{index,commands/explain,security,sessions,statusline}.ts | Wave 52 | #159 | integrar ambos |
| packages/cli/tests/{security,statusline}.test.ts | Wave 52 | #159 | integrar ambos |
| packages/mcp-server/src/tools.ts + tests/mcp.test.ts | Wave 52 | Wave 49 #147 (MCP 16→20) | integrar ambos |

## Plano recomendado
1. `git checkout dev && git merge main` — resolver os 14 com a tabela acima (código = integração both-sides, não --theirs cego).
2. Suite completa + GATE canonical/adversarial + `node tools/router/identity.test.js` (11 testes do rebrand).
3. PR dev→main com o Kill Frugal incluído → **installer do main deixa de criar ~/.frugal** → migração limpa em todos os devices no próximo update.
4. Decidir política de branches daqui em diante (waves→dev→main sempre, ou abandonar dev) — registar em CLAUDE.md.
5. Depois disto: retomar KILL-FRUGAL-MASTERPROMPT (cauda longa ~140 ficheiros + hub wire migration) e MASTERPROMPT da extensão VS Code (F1 Cockpit).

**Contexto completo:** docs/rebrand/* + memória Cowork. Identidade actual do Mac: b14321f5 em ambos os paths (fix temporário Cowork até este merge chegar a prod).
