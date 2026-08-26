# MASTERPROMPT v2 · Sistema & Sync no talo · 2026-08-25 (Cowork, backlog 100% medido nas sessões 24-25/08)

Executor: Claude Code. NO TALO com todos os motores: **codex** (refutador só-leitura obrigatório), **kimi-k3** (2ª lente ONDE EXISTIR — no Mac é n/d medido, declarar), **Ollama local** (rondas/varreduras $0), gemini se o dispatch voltar. DEVICE-AWARE: itens [PC] só correm no desktop-j26409q; executor de outro device declara-os e salta. Mutex: branch própria por device (mac/sistema-* ou win/sistema-*), pull de main primeiro, ler SYNC e declarar escopo em ≤3 linhas.

## W0 — Gates de entrada (parar se falhar)
- `mac/fecho-pendencias` e #390: verificar estado (mergeado? PR aberto?). Se PR aberto com CI verde e a delegação registada, mergear; se vermelho, parar e reportar.
- `gh repo view pauloloureiroshp-ship-it/paulo-vault --json visibility` → **se não for PRIVATE, PARAR TUDO e alertar o dono** (incidente). Idem para checar que nada de 50-credentials além do mapa location-only está tracked.

## W1 — Segurança & DR
1. Varredura de segredos (bateria P4/L0, zero-LLM) no vault E no repo: chaves, tokens, paths pessoais em docs públicos. Achados HIGH = parar e reportar; LOW = corrigir em PR.
2. DR: documentar o remoto único como risco aceite-ou-não (proposta: mirror privado 2º remoto, push duplo pelo publicador — desenho para GO do dono); script `restaurar-vault.sh` de teste de restauração em pasta temporária (dry-run, sem tocar no vault real) — é também o ensaio do onboarding.
GATE W1: varredura verde no CI; script de restauro corre e valida (index 3rd-brain reconstrói, beacons legíveis).

## W2 — Canal de sync (a escada medida: 283/300 commits de 24h são beacons; .git 14MB)
1. Alias de leitura: documentar `git log --oneline -- ':!50-fleet'` em 00-core/onde-vive-o-que.md + configurar `git config alias.hlog` por device (circuito ou setup).
2. **Revisar a branch `codex/agent-sync-fleet-v3`** (e irmãs agent-sync-*) ANTES de desenhar qualquer canal novo: veredito aproveitar/descartar com prova por item; codex refuta o veredito.
3. Desenho do canal `fleet-state` separado (branch órfã ou repo mínimo, squash periódico) — SÓ DOC para decisão do dono, com gatilho numérico de implementação (ex.: .git>50MB ou clone>30s). Respeitar o beacon-publisher existente (tem testes e decisão consciente documentada — nunca mudar sem ler).
4. Alarme de frescura por camada: `max_age` por fonte no beacon/painel (vault behind>20 por >2h; Notion `synced_at` visível com banner "stale desde X"; pitch >30d) → NEEDS YOUR HAND. Código + teste.
5. Regra de eco do Project: handoff sem RELATÓRIO em 24h = "falho declarado" — check no 4-VERIFICAR-FROTA.
GATE W2: alarme dispara em teste sintético; veredito da v3 escrito com prova; doc do canal com gatilho numérico.

## W3 — Painel & beacons
1. [PC] beacon win32 publica `conector: null` → descobrir porquê (registo do Claude Desktop) e preencher.
2. Bug de frescura do painel (medido 24/08: "1 min ago" com ficheiro de 2 dias): teste de render das labels + fix; label honesta "via vault · ciclo ~10min".
3. Suite tools/router instável (944/962/969/983, fail 0, em main intocada): investigar salto silencioso de testes; gate = 3 corridas consecutivas com o MESMO total.
GATE W3: 3×N idêntico; teste de labels verde; beacon PC completo.

## W4 — Métricas que vencem concorrência
1. Métrica-mãe (RouteLLM): % de calls no modelo forte vs % de qualidade mantida — expor no P1/painel a partir do ledger (depende de M2a tokens; se tokens ainda não estiverem 100%, implementar atrás de flag e mostrar n/d).
2. Quota por subscription: medir e expor no ledger o consumo por motor (CC/codex/kimi) por dia — teto real, não só yardstick.
3. kWh por ronda: SPEC de bench (como medir no Mac via powermetrics e no PC via nvidia-smi) — só desenho, execução com GO do dono.
GATE W4: painel mostra a métrica-mãe (ou n/d honesto); ledger com coluna por motor.

## W5 — Fundação multi-user + docs
1. Desenho: chave Ed25519 por USER (além de por device) + namespace 50-fleet/<user>/ — doc para o dossiê corporate, sem código.
2. Atualizar 00-core/onde-vive-o-que.md com: alias hlog, canais de sync (tabela de latências medidas), circuitos operar/, este masterprompt.
3. SYNC.md: enrolar histórico para docs/foundation/SYNC_ARCHIVE_2026.md ATÉ ≤220 linhas — COORDENAR: só o executor que detiver o lock lógico (declarar no próprio SYNC antes) — é ficheiro partilhado.
GATE W5: SYNC ≤220 com CI verde; onde-vive-o-que reflete a realidade (P3 não pode caçá-lo).

## Doutrina por wave
codex refuta TODA conclusão de W2.2 e o desenho W2.3/W5.1; kimi [PC] endurece W4; Ollama roda as varreduras W1. Suite completa por PR. Cada wave fecha com: journal no vault + SYNC (≤3 linhas) + RELATÓRIO no doc do Project (a regra de eco de W2.5 aplica-se a ti primeiro). Lições ativas: MERGED≠main · re-auditar vizinhança · sha_carregado probe · classe>instância · número sem fonte = n/d.
GUARDRAILS: classify.js FROZEN · nunca poupança · vault append-only · F1-F4 do masterprompt v1 continuam no fluxo próprio (não duplicar aqui) · decisões de produto = dono.
