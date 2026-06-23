# Arquitectura seamless — desenho + peças prontas (pesquisa 2026-06-22)

## O desenho (cérebro ↔ mãos, 24/7)
```
┌─ COWORK (cérebro) ──────────────┐         ┌─ CLAUDE CODE (mãos) ─────────────┐
│ contexto: vault, Notion, memória│  bus    │ sdk-runner.mjs (Agent SDK)       │
│ scheduled task evaluator (10min)│◄──────► │  query({resume, canUseTool,      │
│ + esta skill (cérebro à mão)    │ ficheiros│        hooks:{Stop}, acceptEdits})│
│ decide AUTO / escala DIGEST     │         │ canUseTool resolve perguntas+perm│
└─────────────────────────────────┘         │ pm2 = serviço 24/7 auto-restart  │
                                             └──────────────────────────────────┘
```
- **Gerador (mãos):** `claude-agent-sdk` `query()`. `canUseTool` intercepta `AskUserQuestion` E permissões
  → responde pela política, **sem diálogos**. `resume` mantém contexto. `Stop` hook avisa o bus no instante
  em que o turno acaba (zero lag de polling). `permissionMode: acceptEdits`.
- **Cérebro (Cowork):** avalia cada ronda vs `CRITERIA.md`, decide pela `STANDING_POLICY`/rubrica, escreve
  o próximo `INBOX`. Tudo reversível avança sozinho; só o irreversível vira `DECISIONS.md`.

## Porque NÃO sessões interactivas
Os diálogos que o Paulo via vêm de sessões **interactivas** a chamar `AskUserQuestion`. Em headless via
SDK, o `canUseTool` responde a essa pergunta em processo. Logo: visível (stream para `transcript/`) **e**
autónomo — o melhor dos dois mundos, sem clicar/teclar na UI.

## Auth (crítico)
Desde 2026-06-15 o Agent SDK corre no **crédito do plano** (Max 20x = $200/mês de crédito SDK), **sem API
key**. Se usares API key, perdes o crédito → pay-as-you-go. Não usar API key.
Ref: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan

## Peças prontas estudadas
| Peça | O que é | Onde encaixa | Veredicto |
|---|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | SDK oficial; `query`/`canUseTool`/`resume`/hooks | **o gerador** | núcleo — usamos |
| `claude mcp serve` (nativo) | expõe tools do CC a um cliente MCP | Cowork tocar o CC ad-hoc | opcional, útil |
| [steipete/claude-code-mcp](https://github.com/steipete/claude-code-mcp) | CC como 1 tool MCP one-shot ("agente no agente") | disparar tarefa quando o Paulo está presente | opcional; ⚠️ bypass de permissões por defeito |
| [ccmanager](https://github.com/kbwo/ccmanager) | gere N sessões CC por worktree; auto-aprova via Haiku | inspiração p/ a frota | TUI Unix-first; fraco no Windows |
| [claude-squad](https://github.com/smtg-ai/claude-squad) | multi-agente tmux+worktrees | frota | tmux = Unix; não Win11 |
| [ruflo / claude-flow](https://github.com/ruvnet/ruflo) | meta-harness swarm (314 MCP tools) | swarm futuro | poderoso mas pesado |
| Claude Code **Routines** | tarefas agendadas na cloud da Anthropic | correr sem o PC ligado | alternativa futura ao pm2 local |

Veredicto: o **SDK runner próprio** + file-bus é o caminho mais limpo no Windows. Para a frota
multi-pilar, o mesmo runner spawna **uma `query()` por worktree** — sem dependências externas. O
`claude-code-mcp` fica como atalho ad-hoc quando o Paulo quer disparar uma tarefa à mão.

## Fontes
- Agent SDK overview — https://code.claude.com/docs/en/agent-sdk/overview
- canUseTool + AskUserQuestion — https://code.claude.com/docs/en/agent-sdk/user-input
- Hooks (PermissionRequest/Stop/Notification) — https://code.claude.com/docs/en/hooks-guide
- SDK no plano (auth/crédito) — https://support.claude.com/en/articles/15036540
- claude-code-mcp — https://github.com/steipete/claude-code-mcp
