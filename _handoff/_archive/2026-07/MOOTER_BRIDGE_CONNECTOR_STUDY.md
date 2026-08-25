# Estudo — Conector Cowork⇄Mooter (MCP): vale a pena? · 2026-07-05

> Pergunta do Paulo: *"vale ter um conector do Claude que faz a comunicação perfeita entre o
> Claude Cowork e o Mooter (em especial o plugin VS Code)? Unir todas as forças."*
> **Resposta curta: SIM — e já está meio construído no teu repo.** `packages/mooter-bridge` é
> literalmente "Cowork ↔ Mooter fleet (MCP)", P0+P1 escritos, **provavelmente staged e nunca
> committed** (leitura do mount — confirma nativo). Este estudo confronta a ideia com o código,
> a doc e a realidade do Cowork, e recomenda o caminho.

---

## 1. O que JÁ existe (inventário real, lido hoje)

| Peça | Onde | O quê | Estado |
|---|---|---|---|
| **`@mooter/mcp-server`** | `packages/mcp-server` | 20 tools stdio p/ **Claude Code** (`mooter mcp serve`): status, route_query (classify.js real read-only), savings honestos, sessions_list/handoff, pastor, workflows, Notion write, GDPR | Shipped Wave 30→32; git log do mount não mostra história (mount suspeito) |
| **`@mooter/bridge`** | `packages/mooter-bridge` | **O conector pedido**: stdio zero-dep p/ **Cowork/Claude Desktop**. P0: `mooter_sessions_list` + `mooter_session_read` (reusa `host-extra.recentSessions` — a verdade do cockpit). P1: `mooter_run` (headless `claude -p`, cwd isolado, audit em `~/.mooter/bridge-runs.log`) | ⚠️ `git status`: **staged, não committed** (verificar nativo) |
| **sdk-runner / cowork-cc-bridge** | `_handoff/loop/` + skill | Loop 24/7 Agent SDK (outra coisa: geração contínua, não conector) | Operacional |
| **Filesystem mount** | Cowork ↔ `~/frugal` | O "conector" de hoje: eu escrevo ficheiros, tu és o estafeta | Funciona MAS **mente no git** (incidente 2026-07-03: 2119 dirty vs 11 reais) |

**Conclusão do inventário:** a pergunta não é "construir?", é "**terminar, endurecer e ligar** o
que já existe" — e decidir a divisão de trabalho conector-vs-plugin.

## 2. Liga-se ao Cowork? (o facto que destrava tudo)

A narrativa pública é "MCP local não funciona no Cowork" (a VM sandbox não vê processos do host).
**Falso na prática** — dois mecanismos verificados hoje:

1. **SDK Bridge (built-in):** MCPs stdio em `claude_desktop_config.json` são **bridged
   automaticamente para dentro da VM do Cowork** (aparecem como `type: "sdk"`).
   **Prova empírica nesta sessão:** o teu MCP local do Spotify (AppleScript) aparece nas tools
   do Cowork — é exactamente um stdio local bridged. Logo o mooter-bridge liga-se por config:
   ```json
   { "mcpServers": { "mooter-bridge": { "command": "node",
     "args": ["C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server.js"] } } }
   ```
2. **Fallback HTTP:** `supergateway` converte stdio→streamable-http em `localhost:800x`
   (+pm2), adicionável como custom connector. Só se o SDK bridge falhar.

Empacotamento futuro: **`.mcpb` Desktop Extension** (zip + manifest, one-click, open-source spec)
— o caminho para o mooter-bridge virar produto instalável por qualquer vibe coder. GTM natural.

## 3. A análise crítica — o que o conector acrescenta AO QUE O MOUNT JÁ DÁ

Advogado do diabo primeiro: **eu já leio e escrevo no teu repo**. Para escrever masterprompts em
`_handoff/dispatch/` (o F0), o mount chega. Então o que justifica um conector?

| Gap real do Cowork hoje | Com mount (hoje) | Com mooter-bridge | Ganho |
|---|---|---|---|
| **Verdade git** | ❌ mente (2119 vs 11; HEAD partido; régua: "LER só cruzando com nativo") | `mooter_git_snapshot` roda git NATIVO no host | 🔥 mata a classe inteira de incidentes |
| **Ver a frota de sessões CC** | ❌ screenshots + dedução | `mooter_sessions_list/read` (JÁ ESCRITO) — status honesto, branch, PR, custo | 🔥 o Cowork passa a decidir com a mesma verdade do cockpit |
| **Dispatch de masterprompts** | ✅ escrevo o ficheiro; validação só quando o card abre | `mooter_dispatch_enqueue` valida NA HORA (worktree livre? base existe?) e devolve o veredicto síncrono | médio — antecipa erros do F0 |
| **Executar no host** (git worktree add, claude -p) | ❌ a minha shell é uma VM Linux isolada | `mooter_run` (P1, já escrito) + tools novas | 🔥 com gates (ver §4) |
| **Cérebro Mooter** (tier de um prompt, savings, quota) | ❌ | `mooter_route_query`, `mooter_get_savings`, `mooter_sessions_quota_forecast` (padrão do mcp-server) | médio — recomendações com números reais |
| **Funcionar sem VS Code aberto** | n/a | stdio spawned pelo Desktop — independe do VS Code | pequeno mas real |

O que o conector **NÃO dá** (e o plugin continua a dar): UI — cards, terminal integrado com
prefill, mapa de abas, Enter humano. **O conector não substitui o F0; é o outro lado da mesma
fila.** Encontram-se no contrato `_handoff/dispatch/` (por desenho, já partilhado).

## 4. Red-team do próprio conector (os riscos que têm de ser fechados ANTES de ligar)

1. **`mooter_run` aceita `allowedTools` arbitrário do LLM** (ex: `Bash(git *)`) e `cwd` arbitrário
   → hoje NÃO tem o deny-list do sdk-runner. **Fechar antes de ligar ao Cowork:** policy no
   SERVIDOR (mesmos regexes DESTRUCTIVE_BASH + CLASSIFY_FROZEN do `canUseTool`), cwd allowlist
   (`~/frugal*` + temp), audit já existe. O gate não pode viver só na boa-fé do cliente.
2. **Dependência frágil:** o bridge faz `require('../vscode-extension/src/host-extra.js')` — só
   corre dentro do repo completo. Aceitável para ti (P0); bloqueia o `.mcpb` (P3 = bundlar).
3. **Dois servidores MCP** (mcp-server TS p/ CC · bridge JS p/ Cowork) = duplicação de
   sessions_list etc. Decisão: manter os dois curto-prazo (transportes/consumidores diferentes),
   consolidar tools partilhadas num módulo comum depois. NÃO bloquear nisto agora.
4. **Superfície de prompt-injection:** o bridge lê transcripts/logs → devolvê-los ao Cowork como
   DADOS (o README já o diz); nunca como instruções.
5. **Doutrina de escrita:** reads livres · writes reversíveis com audit (enqueue, worktree add) ·
   irreversível (push/merge/deploy/secrets) **NUNCA via bridge** — nem tool existe.
6. **Config do Desktop é global** — o bridge aparece em TODAS as conversas Cowork. Tools têm de
   ser inofensivas por default (read-only na dúvida) porque outros contextos podem chamá-las.

## 5. Arquitectura recomendada — "unir todas as forças"

```
                    ┌─ COWORK (cérebro) ────────────────┐
                    │  mount (ficheiros)  +  mooter-bridge (MCP stdio via SDK bridge)
                    └───────────┬───────────────────────┘
                                │ contrato: _handoff/dispatch/*.md + dispatch.jsonl
┌─ HOST ─────────────────────────┴──────────────────────────────────────────┐
│  mooter-bridge (leitor/validador/executor gated · git NATIVO · zero-dep)  │
│  plugin VS Code (UI: cards, terminal prefill, mapa, Doctor)  ← F0 v2      │
│  mcp-server (20 tools p/ sessões CC) · sdk-runner (loop 24/7)             │
└───────────────────────────────────────────────────────────────────────────┘
```

**Bridge v0.2 (o incremento):** endurecer `mooter_run` (§4.1) + 4 tools novas:
`mooter_git_snapshot` (status/branch/worktrees NATIVOS — fim das mentiras do mount) ·
`mooter_dispatch_enqueue` (grava em `_handoff/dispatch/` + validação síncrona) ·
`mooter_dispatch_status` (fila + dispatch.jsonl) · `mooter_worktree_list` (porcelain parseado).
Instalar via `claude_desktop_config.json`. `.mcpb` fica para depois (P3, GTM).

**O fluxo final (o "perfeito" que pediste):** tu pedes uma wave → eu escrevo o masterprompt e
chamo `mooter_dispatch_enqueue` → validação síncrona (worktree livre, base ok) → o card já nasce
verde no cockpit → tu clicas Dispatch → terminal com prompt pré-preenchido → **Enter**. Eu
acompanho com `mooter_sessions_list` e digo-te quando precisa de ti. Zero estafeta, zero
screenshot, gate humano intacto.

## 6. Decisão: refinar o masterprompt F0 ou nova conversa?

**Nova conversa (track próprio) — e o F0 v2 fica exactamente como está.** Porquê:
- **Zero sobreposição de ficheiros:** F0 = `packages/vscode-extension` · Bridge = `packages/mooter-bridge`. Worktrees diferentes, podem correr **em paralelo** (2 sessões CC — e o F0 despacha-se a si próprio como dogfood).
- O F0 não depende do bridge (fila via watcher + colar). O bridge não depende do F0 (P0 read-only já é valioso sozinho). Acoplar = atrasar os dois.
- O contrato entre eles (`_handoff/dispatch/`) já está definido no F0 v2 — o bridge só ganha um cliente novo (eu).
- Pré-requisito da nova conversa: **confirmar em git nativo** o estado de `packages/mooter-bridge` (staged? história?) — o mount não é fiável para isto.

**Sequência recomendada:** (1) commit nativo do mooter-bridge tal como está + config no Desktop
→ P0 a funcionar AMANHÃ (só reads, risco zero); (2) F0 v2 (wave CC-once); (3) Bridge v0.2
(hardening + 4 tools); (4) `.mcpb` quando o Mooter quiser distribuir isto.

## 7. Fontes
Repo: `packages/mooter-bridge/{README,server.js}` · `packages/mcp-server/{README,manifest.json}` · `host-extra.js` · memórias 2026-07-03 (mount git falso). Web (hoje): [SDK bridge + supergateway no Cowork](https://dev.to/murat-a-a/how-we-got-local-mcp-servers-working-in-claude-cowork-the-missing-guide-nbc) (corroborado empiricamente: MCP local Spotify visível nesta sessão Cowork) · [local MCP no Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) · [custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) · [Desktop Extensions .mcpb](https://www.anthropic.com/engineering/desktop-extensions) · [spec mcpb](https://github.com/modelcontextprotocol/mcpb) · [supergateway](https://github.com/supercorp-ai/supergateway).
