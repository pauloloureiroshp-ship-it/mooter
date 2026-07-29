# Mooter — Go-to-Revenue · Estudo + Plano (2026-07-28)

> Origem: sessão Cowork 2026-07-28. Método: (1) agente UX simulou um novo usuário ponta-a-ponta
> no repo (read-only, evidência ficheiro:linha), (2) pesquisa web com fontes, (3) spot-check
> adversarial por bash — **6/6 claims críticos confirmados**. Complementa `STRATEGY.md`
> (single source of truth da tese); este doc é o plano de receita.

---

## 1 · Veredicto da simulação de novo usuário

**Nota do onboarding: 3/10** — 6/10 de engenharia (módulos honestos: `moo.js`, `preview.js`,
`gpu.js`), **0/10 de distribuição**. Frase-síntese: *o usuário nº 2 é impossível hoje.*

| # | Loophole (ordem de dor) | Evidência (verificada) |
|---|---|---|
| 1 | **O produto não é obtenível.** O `.mcpb` está no `.gitignore:192`, ausente de todas as releases GitHub (última: v1.39.0 de 14-Jun; bridge vai em v1.26.0 de 28-Jul), invisível no site e README | `.gitignore:192` ✓ bash |
| 2 | **Conector sem repo = painel sem motor.** `classify.js` não vai no bundle (`pack-mcpb.mjs` — 0 menções ✓ bash); `seamless.js:746` recusa routing sem `~/frugal` clonado | `seamless.js:746-747`, `server-apps.js:89-112` |
| 3 | **O site vende outro produto.** mooter.ai = "The router for Claude Code" (hook CLI, badge v1.39.0). Zero menções a Cowork/Claude Desktop/conector. E `install.sh` não tem `nvidia-smi` nem chama `mooter init` (o wizard real, órfão em `packages/cli/src/commands/init.ts`) | fetch mooter.ai 07-28 ✓ |
| 4 | **Doutrina errada instalada.** `install.sh:210-211` copia o `CLAUDE.md` do repo (regras internas: FROZEN, PT-BR, sha256) para o `~/.claude/CLAUDE.md` global do estranho, em vez de `CLAUDE.md.template` | `install.sh:208-213` ✓ bash |
| 5 | **Nada observável, nada se actualiza.** Conector emite 0 bytes de telemetria (`telemetry.js` é parser local); auto-update só procura em `~/frugal/_handoff` e `~/Downloads` (`update.js:123-126`); `npx @mooter/cli` falha — npm tem placeholder 0.0.1 de Abril **sem campo `bin`** ✓ registry | `update.js:123-126`, registry npm ✓ |

Extras: `manifest.json` sem `user_config` ✓ bash (logo `MOOTER_VAULT`/`MOOTER_REPO`/`OLLAMA_HOST`
inatingíveis pela UI); Mac Apple Silicon sem leitura de GPU (`gpu.js:130`) → selector cai no
modelo mais pequeno mesmo num M4 de 128 GB; `docs/ONBOARDING_GUIDE.md` inteiro na era frugal com
`install-windows.ps1` inexistente; `README.md:414` aponta para `INSTALL.md` que não existe.

## 2 · Features pedidas vs realidade do código

| Feature (pedido Paulo) | Veredicto | Onde / gap |
|---|---|---|
| Ficheiros organizados | ❌ não existe | Só worktrees a pedido + scaffold de prompt. Promessa em `CLAUDE.md:5`, 0 implementações |
| Vault integrado | ⚠️ parcial, enviesado | `journal.js:39-43` — 2 de 5 candidatos são `paulo-vault`; escape `MOOTER_VAULT` existe mas sem `user_config` na manifest é inalcançável |
| Graphify | ✅ existe, fora do conector | Wave 66 (`v1.44.0-graphify`), `packages/router/src/graph-aware-decide.ts`; depende do tool terceiro `safishamsi/graphify` gerar o `graph.json`; 0 presença no bridge |
| LoRA | ⚠️ runbook de operador | `scripts/train_lora.py` real (QLoRA r16), mas "Paulo runs it"; CLI `lora.ts` = "infra only", auto-swap OFF |
| DoRA | ❌ **não existe — e o site afirma que existe** | `landing/.../commands/page.tsx:58` promete `mooter forge train` "DoRA r=32"; `forge.ts:5-6` diz por escrito "no training automation yet". Única claim do site classificada FALSA, não aspiracional |
| Selector Ollama por hardware | ✅ bom (Windows/NVIDIA) | `moo.js:240-384`: geração>tamanho + tecto VRAM + explicação. Mas só escolhe entre instalados (nunca faz pull) e no Mac degrada para "o mais pequeno" |
| Ver o resultado perfeito (Live Preview) | ✅ melhor feature do lote | `preview.js` — 14 portas, assinaturas de dev server, localhost-only |

## 3 · Conector vs Plugin — resposta definitiva

**Precisamos dos dois, com o plugin como embalagem-mãe.**

- `.mcpb` **não transporta** skills nem hooks — só o servidor MCP + `user_config` (docs MCPB; submission: "skills are not a standalone submission type — bundle them in a plugin").
- Plugin empacota **skills + agents + hooks + MCP servers** e o `.mcp.json` aceita MCPBs → **um plugin pode embrulhar o nosso .mcpb**. 1 submissão cobre Cowork *e* Claude Code.
- Hooks só têm efeito no Claude Code (Cowork não corre hooks — gotcha já pago).
- **Plugin directory exige repo público** — mata plugin fechado; o open-core tem de viver no serviço (hub), não na embalagem.
- Distribuição: plugin directory = review automatizada + espelho `anthropics/claude-plugins-community`; connectors directory = review manual ~2 semanas, exige tool annotations + privacy policy no manifest 0.2+ (falta = rejeição).
- Directory ainda pequeno (~279 plugins em 07/2026) → **estar cedo é vantagem de ranking**.

## 4 · Monetização

Comparáveis (web 2026-07-28, fontes no relatório da sessão):

| Padrão | Quem | Números |
|---|---|---|
| Camada de controlo, sem markup de tokens | Kilo Code | Pass $19-199/mês, saldo sem markup |
| Assinatura IDE | Cursor / Windsurf | Pro $20 · power $60-200 |
| Open-core enterprise | LiteLLM | $250/mês+ |
| Licença lifetime local-first | Msty | $349 one-time |
| Take rate | OpenRouter | 5,5% + $0,80 mín |
| Não monetiza | aider (de propósito) · claude-code-router · **OmniRoute** | $0 |
| ⚰️ Mortos em 2026 | Continue.dev (comprada/encerrada) · Roo Code | extensão-sem-serviço morre |

**Resposta à pergunta "versões antigas free, novas pagas?"** — o modelo existe (FSL da Sentry:
código disponível, converte para Apache/MIT após 2 anos), mas para nós é a opção errada: já somos
MIT (não se re-fecha o que está aberto), o plugin directory exige repo público, e o motor tem um
concorrente grátis com 23,6k stars (OmniRoute cobre ~60% da tese do motor). **O motor não é
vendável; é o canal de distribuição.** O que se vende é serviço:

| Tier | O quê | Preço |
|---|---|---|
| **Free (MIT)** | Conector + router completo local, selector, Live Preview, handoff. Tudo o que roda na máquina do usuário | $0 para sempre |
| **Pro** | Hub: dashboard multi-device, quota fleet, herd benchmarks, update automático, histórico/telemetria agregada, suporte | **$19/mês** (âncora do mercado; nunca markup de tokens) |
| **Lifetime** (opcional, público local-first) | Pro perpétuo, 2 devices | ~$149 one-time (padrão Msty) |
| **Team** (futuro, só com tração) | seats + governança | $15/seat |

Infra de cobrança: **Polar.sh** (MoR open-source, license keys nativas, $0 + 5%+50¢) ou Lemon
Squeezy; Stripe+Keygen se quisermos controlo total. Entitlement offline: key assinada local +
check periódico com grace period.

## 5 · Conta, SSO e tracking

| Pergunta | Estado real | Acção |
|---|---|---|
| Tracking por usuário existe? | **Sim no caminho CLI, ZERO no conector.** Hub Cloudflare + D1 vivos (20 migrations, incl. `008_link_user_device`, `019_admin_data_layer`); `install.sh` manda heartbeat; o `.mcpb` não emite um byte | Heartbeat opt-in no primeiro `mooter_setup` do conector (endpoint já existe) |
| SSO? | **GitHub OAuth já implementado** (Supabase, `landing/app/lib/supabase.ts:391`, shipped 04-17 PR #24) + magic link. Google: não existe | Google = ligar provider no Supabase (~1h). GitHub-first está certo para o público |
| Privacidade | ⚠️ contradição: plugin README promete "opt-in", `install.sh:344-348` dispara heartbeat **antes** de consentimento ✓ bash | Corrigir — coerência com "never fabricating metrics" é o nosso posicionamento |
| Telemetria produto | n/d | PostHog free (1M eventos/mês), opt-in, sem conteúdo de prompts; Plausible $9 para o site |

## 6 · Onde está o valor e quanto pagam

- **O motor sozinho: $0 de valor de mercado** — OmniRoute (MIT, 23,6k stars, 500 contribs) faz
  quota-aware fallback grátis. Confirma a tese do STRATEGY.md: *o motor é o fosso técnico, a
  cabine é o produto.*
- **O que ninguém vende:** cockpit (Resume·Plan·Watch·Review) + consciência de quota de
  **subscrição** (não de factura) + GPU como tier de primeira + honestidade radical de custo.
  É por isto que se paga $19.
- **Diferencial de UX/UI?** Hoje: honestidade (`n/d` em vez de números falsos, ETA que não mente,
  handoff auditável) — isso É o diferencial de UX, raro no mercado. Visual: bom mas não é fosso.
- **Diferencial de roteamento?** Determinístico <50ms $0 local sim; mas defensável apenas
  combinado com quota+GPU+cockpit.
- **Risco de plataforma real:** a Anthropic mudou a política de uso programático de subscrições
  3× em 2026 (ban fev-abr → split 14/05 → reversão 15/06). Mitigação: multi-vendor + GPU local
  já são a arquitectura; nunca depender de um único provider para o valor.

## 7 · Site

Vende o produto de Abril (hook CLI, v1.39.0). Acções: (a) página `/connector` com link da release
`.mcpb`; (b) remover/marcar roadmap as claims DoRA/`mooter forge train`; (c) narrativa "Got Moo?"
e honestidade dos números estão certas — manter; (d) corrigir badge de versão.

## 8 · Sequência-mestra (gates, nunca datas)

**F0 · Distribuição honesta (~10h de fiação, zero features novas)**
1. Publicar `.mcpb` como asset de GitHub Release (CI, 1 linha pós `pack-mcpb.mjs`)
2. `classify.js` dentro do bundle + fallback em `seamless.js:746` (copiar não viola FROZEN)
3. `user_config` na manifest: `vault_path`, `repo_path`, `ollama_host`
4. `mooter_setup` modo `primeira_vez`: diagnóstico 6 linhas verde/vermelho reutilizando
   `gpu.gpuSnapshot()` + `pickModelExplained()` + `vaultStatus()` + presença classify/CLIs/preview
5. `update.procurar()` consulta GitHub Releases API
6. Fixes de honestidade: `install.sh:211` → `CLAUDE.md.template`; site DoRA; README links;
   publicar `@mooter/cli` real (tag `cli-v0.1.0` nunca chegou ao registry)

**GATE F0: um estranho num Mac limpo instala pelo site e vê o diagnóstico verde.** Sem isto,
nada abaixo existe.

**F1 · Identidade + telemetria (1-2 semanas)** — heartbeat opt-in no conector; Google SSO;
dashboard liga device↔user (migrations já existem). **GATE F1: 50 instalações medidas** (o
"first 50" que o site já promete).

**F2 · Embalagem plugin** — plugin público que embrulha o `.mcpb` + skills (mooter-first,
mooter-resume, mooter-atualizar — hoje só existem na máquina do Paulo, versioná-las no repo) +
SETUP.md; submeter plugin directory + connectors directory. **GATE F2: instalável pelos dois
directories.**

**F3 · Monetização** — só com critério MEDIDO (doutrina empresa-de-um): N usuários semanais
activos → ligar Pro $19 via Polar.sh. Cobrar antes de F1 é cobrar a zero pessoas.

## 9 · ❌ Não fazer

- Não cobrar antes do usuário nº 2 existir (F0+F1 primeiro)
- Não FSL/re-licenciar o motor — já é MIT e o directory exige repo público
- Não markup de tokens — mata a confiança que é o posicionamento
- Não construir LoRA automation / features novas antes do GATE F0 — é fiação, não features, que falta
- Não prometer no site o que `forge.ts` nega por escrito
