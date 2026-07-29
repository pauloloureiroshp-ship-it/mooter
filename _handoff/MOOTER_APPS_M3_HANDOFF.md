📥 **COLAR EM:** n/a — documento de referência. Vive em `_handoff/MOOTER_APPS_M3_HANDOFF.md`.

```yaml
type: HANDOFF
id: MOOTER-APPS-M3-2026-07-24
wave: mooter-seamless-m3
objetivo: substituir o plugin VS Code pelo sidebar nativo do Cowork — frota, waves, tarefas riscadas e GPU local, via MCP
estado: v0.4 escrita, 16 testes unitários + 14 asserções E2E + render em Chromium (light/dark)
falta: 1 passo humano — registar o conector
```

# ⇄ M3 — a frota no sidebar nativo

## 0. ⚠️ Confronto de premissa (ler primeiro)

O pedido era: *"na aba Context, o `mooter` com um dropdown que abre um Progress/Outputs próprio"*.

- **O chip na secção Connectors: sim**, aparece de graça assim que o conector estiver registado.
- **Conteúdo próprio dentro do dropdown desse chip: não existe API.** As superfícies documentadas
  para um conector desenhar são **card inline na conversa** e **fullscreen** (MCP Apps). O chip
  do Context é UI do Cowork — nem o Notion desenha lá dentro.
- **Mas o Progress nativo É alimentável** — não pelo servidor MCP, sim pelo modelo, via
  `TaskCreate`/`TaskUpdate`. É exatamente a experiência do VS Code: caixas de tarefa **riscadas**
  quando concluem, com quem as fez. Está codificado no skill `mooter-fleet`.

Logo a arquitetura real são **duas superfícies nativas** a trabalhar juntas:
o **painel** (o agora) + o **Progress** (a memória da sessão). Nenhuma delas é interface do Mooter.

## 1. Ficheiros

| Ficheiro | Papel |
|---|---|
| `packages/mooter-bridge/fleet.js` | `mooter_fleet` (ledger + GPU local + contexto da sessão) e `mooter_session_bind` |
| `packages/mooter-bridge/fleet-ui.html` | o painel `ui://` — secções colapsáveis, waves, riscados, GPU |
| `packages/mooter-bridge/fleet.test.js` | 16 testes |
| `packages/mooter-bridge/server-apps.js` | entrypoint v0.3+ |
| `_handoff/apps-smoke.js` · `RUN-TEST-MOOTER-APPS.bat` | smoke E2E por stdio |
| `mooter-fleet.skill` | o skill que espelha os jobs no Progress nativo |

`server.js`, `seamless.js`, `server-seamless.js` intocados.

## 2. O que o painel mostra

```
● 4 agentes a trabalhar                         19:56
  Mooter.ai · frugal · 3 ficheiros
  ▾ A trabalhar                                     4
      mooter-seamless-m3
        ◌ frugal-integ        ● Codex          1618s
        ◌ frugal-w2           ● Claude Code     183s
      vs-w1-semaforo
        ◌ frugal-vsw1         ● Claude Code     158s
  ▾ Local · GPU                                     2
        ▪ qwen3-coder:30b     ● local            32k
          30.5B · Q4_K_M · 18.0 GB
  ▾ Concluídas                                      2
        ✓ f̶r̶u̶g̶a̶l̶-̶i̶n̶t̶e̶g̶     ● Codex             24s
```

Sem custo, sem poupança, sem eficiência — por decisão explícita.

## 3. As três fontes (e o que cada uma admite não saber)

| Fonte | Dá | Quando não sabe |
|---|---|---|
| `~/.mooter/ledger.jsonl` | jobs despachados, agente, worktree, estado, duração | linha ausente = job não existe, não se inventa |
| `GET 127.0.0.1:11434/api/ps` | modelos **residentes na GPU** agora, VRAM, quantização, contexto | `local: null` = **n/d**, nunca `[]` a fingir zero. Timeout de 700 ms |
| `~/.mooter/cowork-session.json` | projeto, pasta e ficheiros da sessão Cowork | sem bind = painel sem rótulo, e é assim que deve ser |

**`mooter_session_bind` existe porque o servidor não consegue descobrir a sessão.** É lançado
pela app de desktop; nada no protocolo carrega qual sessão/pasta/projeto o está a usar.

## 4. Testado (sem intervenção humana)

| Nível | Resultado |
|---|---|
| unidade | **16/16** — fold de eventos, `failed` nunca despromovido, elapsed honesto, match de modelo, `groupByWave`, **`probeOllama` devolve `null` e não `[]` quando o daemon está morto**, parse de um payload `/api/ps` real, `session_bind` recusa binding vazio, contrato `_meta`, painel sem URLs e **sem `$0`** |
| E2E stdio | **14/14** no disco do Paulo |
| suites vizinhas | `server.test.js` 16/16 · `seamless.test.js` 8/8 |
| render Chromium | desenha em light e dark; handshake dispara; **3 `tools/call` em 7 s** = repoll autónomo; caminho push-only também desenha |

**Bugs apanhados só por renderizar:** canvas branco em dark mode (faltava `color-scheme: light dark`);
`.ttl`/`.sub` inline a colarem-se; chevron a apontar para o lado errado quando aberto.

## 5. 🔥 O ÚNICO passo humano

**Settings → Developer → add local MCP server**

| Campo | Valor |
|---|---|
| nome | `mooter` |
| command | `C:\Program Files\nodejs\node.exe` |
| args | `C:\Users\Paulo Loureiro\frugal\packages\mooter-bridge\server-apps.js` |

Caminho do node **confirmado** nos logs do repo. Nunca só `node` — o processo que o Desktop
spawna pode não herdar o PATH. Depois: fechar o Desktop por completo (tray) → reabrir → task nova.

## 6. Como saber se funcionou

| # | Sinal | Se falhar |
|---|---|---|
| 1 | chip `mooter` em Connectors | registo não pegou / Desktop não reiniciou |
| 2 | linha `mooter_fleet` na conversa | conector crashou (improvável, o smoke cobre) |
| 3 | **painel, não JSON** | host ignorou `_meta.ui` (`ext-apps#671`) |
| 4 | **cronómetro mexe ~3 s depois, sozinho** | host bloqueia chamadas da app → painel correto mas estático |
| 5 | `Local · GPU` lista modelos | Ollama parado, ou noutro `OLLAMA_HOST` |
| 6 | tarefa riscada no **Progress** ao concluir o job | o skill não está a ser seguido |

## 7. Riscos que ficam

| # | Risco |
|---|---|
| **1** | **`moo` não é agente válido** — enum de `mooter_dispatch` é `["cc","codex","gemini"]`. A GPU aparece por **observação** (`/api/ps`), não por despacho. Despachar para local exige o adapter F1. **É o maior buraco face ao pedido** |
| 2 | **Subagentes sempre `null`** — nem ledger nem `host-extra` os registam. Próximo trabalho, e é no daemon |
| 3 | `initialize` ecoa o `protocolVersion` do cliente (nit no `server.js` congelado). **Deliberadamente não corrigido** — mexer sem testar contra o cliente real arriscava partir a ligação; v0.3+ imprime a versão negociada em stderr |
| 4 | issues abertos de render de MCP Apps (`ext-apps#671`, `claude-ai-mcp#236`) |
| 5 | colapsar uma secção muda a altura do iframe; se o host não observar resize, fica espaço vazio. Secções abrem por omissão |

## 8. ❌ Não fazer

- ❌ mexer em `server.js` / `seamless.js` / `classify.js`
- ❌ custo, poupança ou eficiência no painel
- ❌ inventar subagentes, modelos ou modelos locais: `null` é a resposta honesta
- ❌ marcar tarefa como `completed` sem linha `done` no ledger — riscar é afirmar
- ❌ qualquer janela ou dashboard do Mooter

---

🤝 **SOCIO:** receita? na · despesa↓? **S** (mata o plugin VS Code como superfície a manter) · risco↓? **S** (aditivo, reversível numa linha, 30 asserções verdes) · reversível? **S** · escopo? **S**
📮 **DESTINO:** Paulo (§5, ~2 min) → sessão Cowork nova com o skill `mooter-fleet` instalado
