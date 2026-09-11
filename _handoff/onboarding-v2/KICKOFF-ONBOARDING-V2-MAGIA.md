# KICKOFF — Onboarding v2: do `.mcpb` pessoal ao primeiro recibo (2026-09-10)

**Para:** Claude Code no Mac mini (custódia do git) · **De:** Cowork (Fable 5.1) + dono
**Especificação visual:** canvas «Percurso Real no mooter.ai» (8 ecrãs) · **Estados tristes:** `_handoff/onboarding-v2/MAPA_DE_ESTADOS_ONBOARDING_V2_2026-09-10.md` · **Estudos:** `_handoff/onboarding-v2/ESTUDO_*.md` · **Refutação codex:** `_handoff/onboarding-v2/REFUTACAO-CODEX.md` (anexar antes de W1)

## 0. Regras que não se negociam

| # | Regra | Fonte |
|---|---|---|
| R1 | `tools/router/classify.js` e `patterns.js` **FROZEN** — nada aqui toca no classificador; shas verificados no CI | decisão canónica |
| R2 | **Nenhum número de poupança** em superfície nenhuma sem par real (≥20 tarefas, tokens dos dois lados). "saved vs all-Opus" e "savings estimate" saem do `/dashboard` nesta wave | decisão 24/08 |
| R3 | Cada onda fecha com: testes verdes no CI, `SYNC.md` ≤200 linhas, journal no vault, `mooter_setup sessao:'registar'`, PR por script gh-gated. Push só com ✓ do dono | ritual |
| R4 | Copy nas superfícies: 3 frases proibidas — "0 bytes saíram" (→ "nenhuma chamada cloud despachada pelo Mooter"), barra de quota sem "estimado", "poupaste X%" | mapa de estados §E |
| R5 | Nada de Python novo. Node ≥ 20 no payload; o launcher corre no Node do Claude Desktop | mcpb #89 |
| R6 | Nunca ler tokens/sessões das CLIs de terceiros — só presença, versão e estado de login | segurança §B7 |
| R7 | Beacons: só contagens, assinados Ed25519 (já existe), payload visível com `mooter share --show` antes de qualquer consentimento | privacidade |
| R8 | Terminal = circuito ficheiro + duplo-clique (`_handoff/operar/NN-*.command`); nunca pedir ao dono para digitar | ritual |
| R9 | **M1 (obediência) tem precedência**: se W4 mostrar que o host ignora a rota em >50% dos pedidos no teste do terceiro humano, parar e reportar — não maquilhar | gauntlet nº7 |
| R10 | Número não medido = `n/d`. TTV, tamanhos de download, tempos de probe: só depois de cronometrados | cultura |

## 1. Arquitectura-alvo (decisão do dono, refutada pelo codex antes de W1)

```
mooter.ai ──(.mcpb pessoal | curl mooter.ai/i/<token>)──▶ LAUNCHER (fino, estável)
                                                          └─▶ PAYLOAD ~/.mooter/cli (auto-update por canal)
                                                                ├─ probe · init · recibo · router (FROZEN) · beacon
                                                                ├─ regista: Claude Desktop · Claude Code · Codex CLI
                                                                └─ motor local: Ollama (bundle ou instalado pelo init)
conta (Supabase): pessoa · devices · entitlement (plano, canal) · beacons agregados · extrato
```

Decisões fechadas: **D1** launcher+payload · **D2** Free sem conta (elicitation converte) · **D3** token pessoal single-use continua a ser a credencial de enrolment (já existe em `landing/app/lib/install-script.ts`); o `init` troca-o por chave de device · **D4** canal de update vem do entitlement · **D5** modelo pequeno primeiro, 14b em background.

## 2. Ondas

### W0 · Atas e limpeza (dono + CC, ½ dia)
- ADR `docs/adr/ADR-onboarding-v2.md`: D1–D5 + refutação codex anexada + o que fica por medir.
- `/dashboard`: remover "Savings calculator", "saved vs all-Opus", "savings estimate"; substituir por 4 KPIs: tarefas roteadas · cobertura local (tarefas) · janela preservada (estimado) · ESR `n/d` com a razão. Teste: grep no build por "saved vs" = 0.
- `plugin/mooter/skills/mooter/SKILL.md` e site: aplicar R4.
- **Saída:** PR-W0 · journal.

### W1 · Payload auto-update por canal (CC, 1–2 dias)
- `tools/cli/commands/update.js`: deixa de correr `install.sh`; passa a: ler `~/.mooter/entitlement.json` (canal), buscar `https://mooter.ai/release/<canal>/manifest.json` (versão, url, sha256, assinatura Ed25519 com a chave pública já embutida nos beacons), descarregar para `~/.mooter/cli.next`, verificar, trocar atómico, manter `cli.prev` para rollback. `--check` só reporta.
- `mooter-verify manifest` como subcomando (reutilizar verificação dos beacons).
- Site: rota `/release/[canal]/manifest.json` servida do GitHub Releases (assinar no CI de release com `workflow_dispatch`).
- `/mooter-atualizar` (skill do plugin) chama `mooter update` e mostra canal + versão + assinatura ✓.
- Estados: B14 (assinatura inválida → rollback), B2 (offline → "sem rede").
- **Teste:** release fake em canal `beta` → update → rollback forçado → 3× verde no CI.

### W2 · Launcher `.mcpb` + gerador pessoal (CC, 2 dias)
- `packages/launcher/`: `manifest.json` (`server.type: node`, `compatibility.platforms: [darwin, win32, linux]`, `runtimes.node >= 20`, `user_config.mooter_token {type: string, sensitive: true}` injectado por env `MOOTER_TOKEN`), `index.js` ≤ 200 linhas: garante payload (W1), passa stdio ao payload, nunca lógica de produto.
- Site: `GET /i/<token>.mcpb` → zip do launcher com `manifest.json` pré-preenchido (token no `user_config.default` **ou** deixado vazio para o diálogo pedir — decidir no ADR; default: pré-preenchido, single-use).
- Bootstrap no 1.º `tools/call`: se payload ausente → elicitation "Vou preparar o Mooter (≈30 s)" → W1 download → continua o pedido. Estados B1, B2.
- Build no CI: `mcpb pack` + assinatura (decidir: sem assinatura na friends-beta, com assinatura antes do utilizador nº2).
- **Teste:** Mac limpo (conta de utilizador nova) · duplo clique · 1.º pedido → recibo. Cronometrar TTV (R10).

### W3 · `mooter init` v2 — o device apresenta-se (CC, 2 dias)
- `tools/cli/commands/init.js`: substituir perguntas por **probe** (`tools/cli/lib/probe.js`): GPU/VRAM/RAM (macOS `system_profiler`, Linux `nvidia-smi`, Windows `wmic`/PowerShell), Ollama (porta 11434 + `ollama list`), CLIs (`claude`, `codex`, `gemini`, `kimi`: presença, versão, `--version`/estado de login por comando read-only documentado; R6). Saída = tabela igual ao ecrã 4 do canvas.
- Enrolment: troca `MOOTER_TOKEN`/token do `profile.json` por **chave de device** (rota nova `POST /api/devices/enroll` no site: valida token single-use, cria device, devolve chave; device gera par Ed25519 e regista pubkey). Guardar em `~/.mooter/credentials` 0600. Estados B10, B12.
- Registo de conectores: Claude Desktop (`claude_desktop_config.json`, com backup e aviso "reinicia"), `claude mcp add mooter …`, `codex mcp add mooter …` quando existirem (B8, B9).
- Motor local: se sem Ollama → oferecer instalação (`brew`/`winget`/`install.sh`) e `ollama pull` do modelo pequeno **primeiro** (D5); 14b em background; B3–B6.
- Consentimento: `mooter share --show` imprime o payload; pergunta Y/n; `~/.mooter/consent.json` (já existe).
- Rota inicial: pergunta única "local p/ leitura, Claude p/ escrita?" → `~/.mooter/route.json` (não toca no classify.js — é política sobre classes existentes).
- **Teste:** `tests/init-v2.test.js` com probe mockado por OS; teste manual no Mac mini + PC 4090 + Jetson (headless: token noutro aparelho).

### W4 · Recibo por prompt e painel (CC, 2–3 dias) — **onde a magia é medida**
- Ledger: acrescentar ao evento de dispatch `chars_in`, `chars_out`, `input_tokens`, `output_tokens`, `cache_read`, `cache_write`, `reasoning_tokens`, `energy_wh` (n/d se não medível), `execution_channel`, `egress` (`none` | provider), `outcome`. Baldes **exclusivos** (Langfuse #12306). Ollama: `prompt_eval_count`/`eval_count`/`load_duration`.
- `tools/cli/commands/recibo.js`: 3 preços — tabela (contador nativo gratuito por modelo de referência × catálogo vivo U1 `openrouter.ai/api/v1/models` com snapshot em disco), pago (medido), quota (contagem própria da janela, rótulo "estimado") + egresso + veredicto. Modelo de referência editável (`mooter route --ref`).
- Painel: MCP App (`io.modelcontextprotocol/ui`) quando o host declarar; fallback texto (C7). Conteúdo = ecrã 6 do canvas.
- Sinal de obediência: "última rota há X" no painel; alerta se >24 h com pedidos (C1). **Medir obediência no teste do terceiro humano — R9.**
- **Teste:** 20 prompts reais no Mac mini → 20 recibos com todos os campos ≠ n/d onde medível; `tokens` presentes em 100% das linhas novas do ledger (hoje 1/156).

### W5 · Site: devices, beacons, extrato honesto (CC, 2 dias)
- Settings: **Add device** (novo token + `.mcpb`/comando), **Revoke** (A9), nome do device, last sync (existe).
- Beacon: `POST /api/beacon` verifica Ed25519 + nonce + timestamp; agrega por dia; nunca aceita campos de prompt (schema fechado, rejeita extras).
- Dashboard: 4 KPIs (W0) + "por onde foi" + misroute/trail (existe) + "where each number comes from" (existe).
- Email dia 7 (Resend/Postmark): 3 contagens + "o que ainda não medimos".
- **Teste:** 2 devices reais (Mac mini + PC) a aparecer com sync; beacon com prompt forjado → 400.

### W6 · Caminhos tristes + terceiro humano (CC + dono, 2 dias)
- Implementar todos os estados A/B/C do mapa com uma frase e uma saída; teste por estado (`tests/estados-tristes.test.js`).
- **Terceiro humano** (gate B4): device limpo, 0 ajuda síncrona; cronometrar TTV; registar obediência real; recibo no vault. Se obediência <50% → R9.
- Só depois: pricing público (fora deste kickoff — exige tabela de comparáveis M12 + ata).

## 3. Definition of Done (verificável por artefacto)
1. Mac limpo → `.mcpb` → 1.º recibo, sem terminal, TTV cronometrado.
2. Dev → `curl | bash` → `mooter init` → mesmo recibo; Claude Code e Codex registados.
3. 100% das linhas novas do ledger com tokens e chars; recibo com 3 preços + egresso + veredicto.
4. `/dashboard` sem "saved vs all-Opus"; 4 KPIs com `n/d` honesto.
5. Update por canal com assinatura e rollback, 3× no CI.
6. 2 devices no Settings com sync; Revoke funciona; beacon forjado rejeitado.
7. Todos os estados do mapa com teste.
8. Obediência **medida** no terceiro humano e escrita no vault — número que for.

## 4. Fora deste kickoff (explícito)
Instalador nativo L2 (bun compile, notarização) · `node-llama-cpp` · SAML/SCIM/RBAC · Stripe/pricing público · MCP App no Claude Code (n/d) · política "nunca sai" (W3.b, próximo).

## 5. Disparo
`_handoff/operar/80-ONBOARDING-V2-W0.command` → abre Claude Code com este ficheiro, o mapa de estados, a refutação codex e o ADR em branco. Ordem: W0 → W1 → W2 → W3 → W4 → W5 → W6. Cada onda = 1 PR. Sem push sem ✓.
