# ⇄ COWORK → CC · SUPER MASTERPROMPT — Quota-Aware + Fleet FASE3 a RODAR (2026-07-06)

> **És o maestro de 4 fases sequenciais.** No fim, o Mooter roteia consciente da quota semanal E a fleet de moos locais corre rondas reais na 4090 a $0, visível na Fleet Console, com ledger honesto. Specs-mãe (lê CADA UMA no início da fase respectiva): `_handoff/QUOTA_AWARE_MP.md` (Fase Q) · `_handoff/FLEET_FASE3_LAUNCH_HANDOFF.md` (Fases A+R; ignora o §MP-B — é frente futura).
> **Contexto que já foi confrontado pelo Cowork hoje (NÃO redescobrir):** orchestrator+Overclock em main 266e4f3 · workforce local não existe (vais construí-la) · `gsd-statusline.js` lê stdin (l.2229) · `quota-tracker.js` é additive-only · `applyBudgetCap` em `inject_context.js` ~l.253 · weekly do Paulo a 89% (sê frugal contigo próprio).

## 🧼 HIGIENE DESTA SESSÃO (obrigatório ANTES de tudo — a semana está a 89%)
Modelo **Sonnet** · `/mcp` → desliga context7 e todo o server não-essencial · **ZERO subagents** (o trabalho é linear) · nada de exploração ampla — os confrontos já estão feitos e citados · R2: commit atómico assim que compila · sai no gate final.

## 🚦 REGRAS DURAS (violar = abortar; valem nas 4 fases)
1. `tools/router/classify.js` **FROZEN** — prova `sha256 == 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` no início e fim de CADA fase.
2. **NUNCA** merge/push/tag — two-factor = Paulo. Trabalho fica nas branches; a única excepção é a Onda 0 (commit docs-only LOCAL em main, sem push).
3. Selective `git add` (nunca `-A`) · packages frozen intocados (só ficheiros NOVOS + edições explicitamente permitidas nas specs) · honest-copy: número sem fonte = `n/d`, nunca fabricar.
4. **R1/R5**: cada fase na SUA worktree, criada de main ATUAL (`git fetch` antes). Confirma `git rev-parse --show-toplevel` antes de tocar em qualquer ficheiro.
5. Destrutivo descoberto a meio → 1 linha em DECISIONS.md, nunca executar.
6. PT-PT na conversa · inglês no código.

---
## ⓪ ONDA 0 · Aterrar os docs (sem isto as worktrees nascem cegas — lição 2026-06-30)
No tree principal `~/frugal`:
1. `git fetch` · confirma `git log --oneline -1 main` (esperado: 266e4f3 ou descendente). Se o tree estiver em `wave/honest-controls`: `git checkout main` (está 5 atrás, 0 à frente — nada se perde).
2. `git add _handoff/QUOTA_AWARE_MP.md _handoff/FLEET_FASE3_LAUNCH_HANDOFF.md _handoff/SUPER_MP_QUOTA_FLEET.md` → `git commit -m "docs(handoff): quota-aware + fleet FASE3 launch specs (Cowork 2026-07-06)"` — docs-only, aditivo, LOCAL (sem push).
3. Sanidade nativa: `node --version` · `ollama ps` (Ollama vivo? se não: pára e diz ao Paulo) · `nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv` (baseline da GPU — guarda o número).
**GATE 0:** commit docs feito · main confirmado · Ollama vivo · baseline GPU registado.

## ① FASE Q · Quota-Aware Routing (worktree `../frugal-quota`, branch `feat/quota-aware`)
Lê `_handoff/QUOTA_AWARE_MP.md` e executa Q0→Q4 exactamente como especificado (probe do payload real primeiro — NUNCA inventar schema; §REUSE lá indica o que ler antes de escrever).
**GATE Q** (o da spec): payload capturado · quota-live.json escrito em sessão real · `basis:"official"` · defcon roteia com reasoning · floors T3 provados intocados · spawn `/api/oauth/usage` evitado com cache fresco · chip opt-in · default byte-idêntico · testes verdes · sha intacta · tudo committed. **Não avances sem TODOS.**

## ② FASE A · Armar a Fleet (worktree `../frugal-fleet-arm`, branch `feat/fleet-arm`)
Lê `_handoff/FLEET_FASE3_LAUNCH_HANDOFF.md` (MP-A: secções WHERE→DO→GUARD→GATE; §CHARTERS dá os charters; §GPU-POLICY e §USAGE-RELIEF dão a doutrina; ignora §MP-B). Executa DO 1→5:
governança 3 pilares (council+seguranca+**cronista**) → `local-pillar.mjs` (com STATE.json por ronda + bounded context assembly + ledger por pilar) → `cronista` (digest + juiz U2 + HANDOFF_NEXT) → `fleet-local-launch.mjs` → fleet.json (flags + entrada cronista) → higiene dos ledgers dry. (**Nota de mapa:** o passo 6 do DO da spec = a minha Fase R abaixo; o passo 7 é regra permanente, não passo.)
**GATE A:** tudo committed na branch · testes unitários verdes · sha intacta · `git status` limpo.

## ③ FASE R · RODAR (na worktree da Fase A — é aqui que a 4090 acorda)
1. `FLEET_MAX_ROUNDS=3` + `FLEET_ALLOW_CLOUD` **unset** → `node _handoff/fleet/fleet-local-launch.mjs`.
2. Em paralelo, capta GPU: `nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv -l 5` durante as rondas (guarda para o BACK; compara com o baseline da Onda 0).
3. No fim: verifica `fleet-ledger.jsonl` (engine `ollama-local`, `cost_usd:0`, rondas dos 3 pilares) · `STATE.json` frescos (round>0, last_run_ts agora) · `cronista/DIGEST.md` cobre as rondas · `HANDOFF_NEXT.md` por pilar · heartbeat `dry_run:false`.
4. Abre o cockpit (Reload Window se preciso) → Fleet Console TEM de mostrar os 3 pilares ACTIVE. Printscreen ou cola o fleetSnapshot.
**GATE R (= o GATE do MP-A):** ≥2 rondas reais/pilar · GPU util subiu (números baseline→durante) · $0 · ledger honesto · destrutivo só em DECISIONS.md · Fleet Console ACTIVE · sha intacta.

## ④ RELATÓRIO FINAL (uma mensagem, formato fixo)
```
SUPER-MP DONE 2026-07-06
FASE Q: branch feat/quota-aware @<sha> · <n> testes · quota-live: <colar sanitizado> · defcon demo: <reasoning>
FASE A: branch feat/fleet-arm @<sha> · <n> testes · diff --stat main..HEAD
FASE R: rondas: <n> por pilar · GPU: <baseline>% → <pico>% · custo cloud: $0 · ledger: <últimas 6 linhas>
CRONISTA: DIGEST resumo em 3 linhas · DECISIONS pendentes: <n>
SHA classify: intacta (provada 4x)
PENDENTE PAULO (two-factor): merge feat/quota-aware + feat/fleet-arm → main
PERGUNTA: ligar modo contínuo? (FLEET_MAX_ROUNDS alto + schedule; STOP file = _handoff/fleet/STOP)
```
**PÁRA aqui.** Merge e modo contínuo são decisões do Paulo.

## 🔁 §RESUME (se esta sessão estourar/morrer)
Sessão fresca em `~/frugal`, cola: *"Continua _handoff/SUPER_MP_QUOTA_FLEET.md. Vê git log/status nas worktrees frugal-quota e frugal-fleet-arm + _handoff/fleet/cronista/DIGEST.md; retoma da primeira fase cujo gate não está completo. NUNCA refaças passo committado."* Nada relevante vive só no contexto — se não está committado ou num ficheiro, não existe.
