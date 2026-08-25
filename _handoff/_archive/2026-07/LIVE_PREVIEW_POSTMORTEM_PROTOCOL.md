# Live Preview — Post-Mortem + Protocolo à Prova de Erro (2026-07-05)

> Escrito a pedido do Paulo ("ver tudo que deu errado e corrigir com perfeição, sem erro algum").
> Verdade central: **o código está sólido; o que falhou foi PROCESSO.** Nenhum incidente de hoje foi um bug
> de produto — todos vêm da mesma raiz de orquestração. Corrige-se com disciplina, não com mais código.

## ✅ O que deu CERTO (para não esquecer o que já é ouro)
- **MP2 App Stage → produção** (hot-reload provado ao vivo: `Got a Moo? LIVE`).
- **Honest-controls → produção** (badges derivados do git real).
- **MP4/MP4.1 → produção** (`main @266e4f3`): error-strip + captura server-side. 589/0 extensão · 18/0 landing · classify.js sha intacta · honest-controls preservado (cherry-pick, não revertido) · final-reviewer SHIP-WITH-NITS.
- Estudos sólidos: paridade Live Preview, spec Live Edit (MP5), Moove, Conductor (4 sessões de refino).

## ❌ O que deu ERRADO (5 incidentes)
1. **MP3 PERDIDO** (o pior) — os fixes relógio/iframe/nav correram no **tree partilhado** (`wave/honest-controls`), **nunca foram committados**, e a cópia foi sobrescrita. Trabalho evaporado.
2. **MP5.2/5.3 nunca materializou** — a sessão não produziu commits.
3. **Colisões de sessões no mesmo tree** — `node_modules` corrompido (junction removido por outra sessão), `EADDRINUSE`.
4. **CC editou a worktree ERRADA** (main em vez de `lp-diag`) no teste do throw — worktree-crossing.
5. **MP4 com base velha** (cortado de `e97014f`, antes do honest-controls) → precisou de cherry-pick para não reverter os honest-controls.

## 🎯 A CAUSA-RAIZ (uma só)
**Falta de disciplina worktree/sessão + commit não-atómico.** Todos os 5 incidentes derivam de:
- (a) **várias sessões CC no MESMO working tree partilhado** → colisões, edits no sítio errado;
- (b) **trabalho não committado atomicamente** → o MP3 morreu exatamente por isto;
- (c) **bases desatualizadas** → o MP4 partiu de antes do honest-controls.

Não é falha de código (589/0 verde). É falha de **orquestração** — literalmente a dor que o **Mooter Conductor** existe para abolir (ver [[project_mooter_conductor]]). Hoje pagámos a fatura em trabalho perdido. É a prova mais cara de que o Conductor é prioritário.

## 🛡️ PROTOCOLO À PROVA DE ERRO (6 regras — aplicar JÁ, à mão, até o Conductor as impor)
- **R1 · Uma worktree, uma sessão, uma frente.** NUNCA duas sessões no mesmo tree. Cada sessão **verifica** onde está: `git rev-parse --show-toplevel` tem de ser a worktree própria, não `frugal`.
- **R2 · Commit atómico ANTES de testar.** Assim que compila, `git add <ficheiros> && git commit` — mesmo WIP. Nada de testes manuais sobre trabalho não-committado. (Foi isto que matou o MP3.)
- **R3 · Uma frente de cada vez (sequencial)** até o Conductor impor o isolamento. O paralelismo é seguro em teoria, mas hoje provou-se frágil na prática. Constrói → commita → gate → aterra → limpa → próxima.
- **R4 · Gate executável antes de aterrar.** `classify.js` sha == `427d8c0b…` + testes verdes (extensão + landing) + **confrontar o git REAL** (nunca o mount/journal). O CC de consolidação fez isto exemplarmente hoje.
- **R5 · Base sempre = `main` ATUAL.** `git worktree add ../X main` depois de `git fetch`. Nunca partir de uma branch/base velha.
- **R6 · Limpar após cada aterragem.** `git worktree remove` a throwaway + `git worktree prune` + fechar a sessão CC. Não deixar acumular (hoje: 29 sessões, 41 dirty).

## 🚀 O PLANO para avançar com magia (sem repetir erros) — SEQUENCIAL
**Fase A · LIMPAR a base (agora, antes de construir mais):**
1. Reinstalar o vsix de `main` → ativa MP4 + honest-controls no cockpit (prova que estão vivos).
2. Podar worktrees mortas (`git worktree prune` + remover as usadas) · fechar sessões CC idle · triar os 41 dirty (lixo de ambiente vs trabalho — commitar/descartar). **Preservar** `feat/live-edit @6d44ccd` (MP5 WIP).
3. Ficar com o tree limpo: só `main`, sem WIP órfão.

**Fase B · Reconstruir o MP3 (do zero, com R1–R6):** relógio tz local + consolidar iframe em main + multi-page nav. Worktree própria, commit atómico cedo, gate, aterra, limpa. Masterprompt abaixo (§ MP3-v2).

**Fase C · Integrar o MP5.0/5.1** (o WIP `feat/live-edit` colide com o `extension.js` do MP4 já em main): worktree from main, **reconciliar** o `extension.js`, gate, aterra.

**Fase D · MP5.2/5.3** (estrutural + área) — depois, do zero, com disciplina.

---

## § MP3-v2 · Masterprompt (reconstruir o que se perdeu, à prova de erro)
```
⇄ COWORK→CC · MP3-v2 Live Preview fixes (RECONSTRUÇÃO — o MP3 original perdeu-se por correr no tree
partilhado sem commit). Aplica o PROTOCOLO à prova de erro. Lê _handoff/LIVE_EDIT_MP5_SPEC.md §2.
Sonnet.

PROTOCOLO (obrigatório, R1–R6):
- R1: git worktree add ../frugal-mp3v2 main ; cd lá ; confirma git rev-parse --show-toplevel == frugal-mp3v2.
- R2: commita atomicamente ASSIM QUE cada fix compila (antes de qualquer teste manual). Nada fica uncommitted.
- R5: base = main atual (git fetch antes).

DO:
1. Relógio tz local: live-preview-view.js clock(ts) → new Date(ts).toLocaleTimeString(undefined,
   {hour12:false}); n/d honesto se ts inválido. Teste unitário tz!=UTC. → COMMIT.
2. Consolidar o iframe em main (confirmar que já veio com o MP4; se não, trazer limpo): CSP frame-src
   http://localhost:* dev, X-Frame-Options só-dev. → COMMIT.
3. Multi-page nav: barra de endereço funcional (Enter navega) + sync lp-nav {path} do tap (popstate)
   + dropdown de rotas lendo landing/app/**/page.tsx. → COMMIT.

GUARD (R4): classify.js FROZEN (sha 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f) ·
honest-copy · selective git add · sem push/merge sem OK do Paulo · PT-PT.
GATE: relógio mostra hora de São Paulo · iframe reproduzível de main · navego entre rotas e vejo todas
as abas do site · testes verdes · sha intacta · TUDO committed (git status limpo). PÁRA no gate; cola
git log --oneline + testes + sha.
```
