# KICKOFF — Construir & Superar no Mac · 2026-08-25
És o Claude Code executor no mac-mini. Plano-mãe: ~/paulo-vault/40-strategy/2026-08-25-plano-construir-superar.md (lê inteiro primeiro).
MUTEX: aborta (exit 0, mensagem no log) se _handoff/cc-sistema.log OU _handoff/cc-inscrever-jetson.log existirem sem "=== fim". Nunca dois executores.

FASE A — Decisões delegadas do dono (25/08, por escrito):
A1. Merge do PR #394 se CI verde.
A2. Rebase de `mac/stash-paridade-2026-08-25` — pega `mac/stash-paridade-2026-08-24`, refaz sobre o main de hoje, abre PR. NUNCA descartar as ~230 linhas únicas.
A3. Exclusão de T5 em CÓDIGO no decideAgent (entrada no allowlist autorizada) + testes; SÓ DEPOIS precificar claude-fable-5 no SSOT. O arame do CI vira teste permanente.
A4. `git add packages/mooter-bridge/package-lock.json` + commit.
A5. Rollup do SYNC 598→≤220: ANUNCIA no SYNC (secção COWORK→CC) antes de enrolar; arquivo em _archive/ (path canónico).
Gate A: suite verde · classify.js 427d8c0b intacto · baseline do ratchet re-corrido DEPOIS do A2 (agora pode: stashes volta a 0).

FASE B — WS2 Painel: executa _handoff/KICKOFF-PAINEL-UX-2026-08-25.md na íntegra (7 itens). Gate: reproduzir os 2 bugs, corrigir, provar com teste.

FASE C — WS1 Keep-rate: F1 do _handoff/MASTERPROMPT-MOO-PILOT-NO-TALO-2026-08-25.md (redesenho do instrumento). Publica o design em ~/paulo-vault/_handoff/design-instrumento-v2.md para o codex do PC REFUTAR antes de codificar. Refutação local imediata: Ollama qwen2.5-coder:14b (declara que é Ollama, não codex).

FASE D — WS3 M1 v0: esqueleto do proxy loopback atrás de flag (ADR 20-decisions/2026-08-25-adr-m1-hook-para-proxy.md). Design em ~/paulo-vault/_handoff/design-m1-v0.md para refutação no PC. NÃO ligar por defeito.

FECHO obrigatório: journal append no vault (10-projects/) · Delta por onda no 40-strategy/2026-08-25-pitch-registro-metricas-medidas.md (positivos E negativos, só medidos) · relança o loop via `_handoff/operar/1-LANCAR-MOO.command`-equivalente (o loop carrega o código novo) · progress em _handoff/cc-construir-progress.md a cada fase.
Guardrails: classify.js FROZEN · nunca tocar 50-fleet além do desenho existente · número não medido = n/d · o que reverter enunciado do dono = PR sem merge + nota.

FASE A — adenda A6 (decisões do dono 25/08, estudo 40-strategy/2026-08-25-llms-subscription-mac.md):
A6a. Kimi volta à rota POR DECISÃO: inverte a allowlist de motores (a que hoje prova a recusa de agent:"kimi") com teste novo que prova a ACEITAÇÃO condicionada; documenta no SYNC que a condição kimi-egress-FECHADA foi verificada.
A6b. Se `codex` existir no PATH (pós circuito 10 + login do dono): smoke `codex exec --json` no provider tools/router/providers/codex-cli.js; codex assume papel de refutador local do mac nos fechos (fim do "codex n/d").
A6c. Se `gemini` existir: smoke `gemini --output-format json`; adiciona ao MooterBench (B1–B6) SEM entrar na rota; publica o número.
A6d. kimi-adapter.js do bridge: smoke com o CLI novo; qualquer divergência de schema vira nota no SYNC.

FASE A — adenda A0 (primeiro de tudo): PR #396 (mac/sistema-sync-2026-08-25) está com 19 checks verdes e 2 fails de rate-limit do Vercel (recuperam sozinhos, como no #390). Se ao arrancar o CI estiver todo verde: merge. Senão: espera não — regista o estado e segue as fases; re-verifica no fecho.

FASE E — ADR M2 convergidor (design→refutação, SEM implementar ainda):
E1. Lê ~/paulo-vault/20-decisions/DRAFT-2026-08-25-adr-m2-convergidor-de-versao.md. Produz o design técnico: schema do release-manifest.json, contrato do recibo de update no beacon, máquina de estados do rolling (sentinela→PC→mac, gate de saúde, timeout/quórum 2/3), e o diff conceptual das skills mooter-atualizar (convergidor) e moo-pilot (mostra drift por eixo). Publica em ~/paulo-vault/_handoff/design-m2-convergidor.md.
E2. Refutação OBRIGATÓRIA antes de qualquer código: codex local (agora logado — "Logged in using ChatGPT") em modo read-only com ordem de REFUTAR o design (foco: os 3 riscos do ADR + o que mais partir). Anexa a refutação ao mesmo ficheiro. Se objeção sobreviver, ajusta o design e declara.
E3. NÃO implementar nesta onda — implementação é onda própria após o dono assinar o ADR M2.
