# MASTERPROMPT · Moo Pilot no talo · 2026-08-25 (escrito pelo Cowork mac-mini, backlog 100% medido)

Executor: **Claude Code** (custódia git). Adversários OBRIGATÓRIOS por fase: **codex** (só-leitura, mandado REFUTAR) + **kimi-k3** (2ª lente, endurecer recomendações). Rondas locais/ensaios: **Ollama** (qwen2.5-coder:14b no Mac; avaliar 30B na RTX 4090). gemini se o dispatch voltar. Doutrina: adversário em motor diferente, medição antes de construção, gates numéricos, parar-se-facto-falhar (lição G11).

## F0 — Confirmar factos (PARAR se divergir)
Cada item abaixo tem fonte; se o teu checkout disser outra coisa, para e reporta antes de codificar.

## F1 — O INSTRUMENTO (a causa-raiz do keep-rate 4,5%)
Evidência: 44 decisões do dono na frota → 2 mantidas (Mac 2/24 · PC 0/20; decisão 20-decisions/2026-08-25). Ordem:
1. **Off-by-one do verificador de citações**: grava linha N, conteúdo está na N-1 (medido: run-savings.js:19/20, validar-fase.js:80/81; issue registada na triagem do Mac 25/08). Corrigir a base de numeração excerto↔ficheiro; teste com fixture.
2. **P2 redesenho**: "seed visible" declara ACHADO no caso saudável (11 dos 20 do PC eram isto). A pergunta nova tem de exigir CONSEQUÊNCIA (valor errado chega a output/decisão), não forma.
3. **P4 artefacto de janela**: "BROKEN" na última linha de janela a meio do doc (PASTOR.md tem 64 fences pares e foi flagado MEDIUM). Só avaliar quebra em janelas que terminam o ficheiro, ou verificar fecho fora da janela.
4. **P7–P10 fatias**: 0 cited em ~2000 rondas — aumentar janela/contexto por pilar e medir de novo antes de qualquer conclusão.
5. **Aceite real a honrar**: decide-agent.ts:40 importa `pricing-snapshot-2026-05-27.json` (3 meses) num router de CUSTO → snapshot atualizado + teste de frescura (falha se >30 dias).
GATE F1: 50 rondas piloto pós-mudança → ≥5 achados que codex E kimi classifiquem "real e acionável"; refutado ≤2%.

## F2 — CONFIG & PARIDADE DA FROTA
1. Limiar da fila humana: Mac 6 vs PC 50 (medido nos beacons 25/08) → configurável por device com default são; documentar porque 6 < reserva (22) deadlocka a pausa.
2. Classe "duas contagens, janelas diferentes" (4 recidivas: porTriar vs contarTriagem; jaDoDono; runner vs L1 #369; limiar vs reserva): extrair UMA função de contagem canónica + teste de paridade que compara todas as vistas.
3. `launch.mjs` faz start→pull: qualquer restart carrega o pull ANTERIOR (3 duplo-cliques para convergir, medido 25/08 11:10–11:14Z). Inverter: pull → só depois spawn; imprimir sha carregado no arranque.
4. Beacon do PC publica `conector: null` (painel mostra n/d) — descobrir porque o publicador win32 não acha o registo do Claude Desktop.
5. Painel: rótulo de frescura do device remoto oscila vivo↔stale pela latência do vault (~10 min) — mostrar "via vault, ciclo ~10min" em vez de "sem sinal", e nunca mais "1 min ago" com ficheiro de 2 dias (bug visto 24/08).
GATE F2: teste de paridade verde + restart único converge sha + beacon PC com conector preenchido.

## F3 — SCHEDULER POR CAPACIDADE (a feature multi-device que não existe)
Hoje: os 2 devices rodam a MESMA rotação com o MESMO modelo 14b (medido 25/08: ambos em P3). Proposta a desenhar ANTES de codificar (doc para aprovação do MEO):
- mapa pilar↔device por VRAM/modelo: P2/qualidade → RTX 4090 com 30B; P7/P8 (cockpit) → Mac; higiene L0 zero-LLM → Jetson/cron; coerência docs → qualquer.
- coordenação via vault (claims por device no 50-fleet, TTL), sem canal novo.
- flag off por default; medir rendimento por pilar·modelo·device (MooterBench) antes de fixar.
GATE F3: doc aprovado pelo dono → implementação atrás de flag → 1 semana de números comparados.

## F4 — JETSON runner-only (frota 3/3)
Projecto doc claude/DEVICE_JETSON_ORIN_NANO_2026-08-20.md + FROTA §5/§7.7: clone repo+vault, moo-runner via systemd, matrícula Ed25519 (como Mac 13:36Z e PC 16:12Z de 24/08), beacon 10/10min. Sem Claude Desktop — só runner. GATE: 3ª linha no trusted-devices.json + prova_frota true com 3 aceites.

## F5 — MÉTRICAS & PITCH (zero-LLM)
1. Script agregador do ledger (rondas, cited, refutado%, keep-rate do dono, testes) → appenda no 40-strategy/2026-08-25-pitch-registro-metricas-medidas.md (a rotina semanal do Cowork já existe; o cron zero-LLM substitui-a quando nascer).
2. Atualizar `40-strategy/pitch-90s.md` (25/04): remover "poupar 90%" (viola decisão 24/08) → linguagem yardstick + honestidade instrumentada + o par do portão 2 ("mesmo output, uma vez falso e uma vez verdadeiro").
3. CI publica nº de testes no SYNC (hoje o número vive em journal).

## Pendências pequenas (apanhar de caminho)
projecto ativo divergente (~/.mooter/cowork-session.json 16/08 stale vs sessoes/mooter.json — alinhar p/ mooter-gpu-local-strategy salvo ordem contrária) · preferences.json (statusline_line3) · índice do vault no arranque do painel · arquivar ~300 ficheiros históricos de _handoff/ para _handoff/archive/ · RELATÓRIO do PC em falta no doc do Project (disciplina de reporte).

## Lições de processo a aplicar (do journal gate-L0 — não repetir)
MERGED ≠ está na main (verificar CONTEÚDO; pilhas de PR: merge de cima p/ baixo ou re-apontar bases) · cada ronda de correção re-audita a VIZINHANÇA do que mexeu · testes têm de estar no comando do CI (`package.json` — os 18 fantasmas) · probe do `sha_carregado` antes de declarar "no ar" · renomear não corrige · classe > instância.

## Guardrails invioláveis
`classify.js` FROZEN (sha CI) · decisões de produto = MEO/Paulo · NUNCA publicar poupança sem tokens medidos · vault append-only · suite completa por PR (o comando do CI) · nunca L2/L3 sem os portões abrirem por número.
