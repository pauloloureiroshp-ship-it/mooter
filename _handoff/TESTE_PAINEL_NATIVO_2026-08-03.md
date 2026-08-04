# Painel nativo do Claude Code — encaixe e teste

**Data:** 2026-08-03 · **Estado:** escrito e testado localmente, **não commitado, não pushed**

## 1. Resposta curta às três perguntas

| Pergunta | Resposta |
|---|---|
| Já está na versão mais nova do conector? | **Não. Não está em versão nenhuma.** Antes desta sessão existiam 0 linhas de código — só dois mocks HTML em `_handoff/`. E não vai estar no *conector*: o conector é o servidor MCP (`.mcpb`), e o MCP **não consegue** pintar o painel (issues #4157/#51713/#31893). O painel vive no **plugin** (`plugin/mooter/`), que é outro artefacto. |
| Como encaixa no Mooter? | Cinco ficheiros novos em `plugin/mooter/`, nenhum a tocar no motor. Ver §2. |
| Dá para ver o show com todas as LLMs? | Parcialmente — ver §5. Gemini está morto no fornecedor, o Codex acabou de queimar 13,4M tokens de entrada sem produzir veredicto, e a quota está em pressão crítica. |

## 2. O encaixe — 5 ficheiros, zero no caminho quente

| Ficheiro | Papel | Testado |
|---|---|---|
| `plugin/mooter/agents/mooter-dispatch.md` | subagente-casca, `background: true`, `model: haiku`, `maxTurns: 12`. **`disallowedTools: Write, Edit, NotebookEdit, Bash, Task`** — incapaz de trabalhar por construção, não por promessa | frontmatter conforme a doc |
| `plugin/mooter/settings.json` | regista o `subagentStatusLine` | ✅ JSON válido |
| `plugin/mooter/scripts/subagent-statusline.js` | lê o stdin do CC (`{columns, tasks:[{id,model,tokenCount,startTime,status,…}]}`) e devolve `{"id","content"}` por linha | ✅ `node --check` + corrido com stdin simulado |
| `plugin/mooter/monitors/monitors.json` | declara o monitor `mooter-fleet` | ✅ JSON válido |
| `plugin/mooter/scripts/watch-fleet.js` | processo persistente, poll de `~/.mooter/`, uma linha por mudança de estado | ✅ arranca, não encontra estado, declara-o e cala-se |

**Saída real do teste da statusline** (ANSI removido):

```
{"id":"t1","content":"Haiku · custo n/d · 10k tok · 2m 27s"}
{"id":"t2","content":"qwen2.5-coder:14b · local · 🐮 grátis · 497 tok · 17s"}
{"id":"t3","content":"qwen3.6:27b · local · 🐮 grátis · 847 tok · 599m 19s · ⚠ error"}
```

O teste dos 3 segundos passa: verde+grátis contra âmbar+pago, e o encravado de 599 min a gritar.

### Decisões de desenho que estão no código
- **v0 não depende do ledger.** A statusline usa só o stdin do CC. O enriquecimento do Mooter (tier, custo, GPU) lê `~/.mooter/board/latest.json` **se existir e tiver <5 min**; se não, a linha sai sem esses campos — nunca com um valor adivinhado.
- **`engine.paid === false` ⇒ 🐮 grátis.** Um modelo servido pelo Ollama do próprio utilizador não tem preço por token; isso é conclusão do id, não palpite. Família desconhecida ⇒ não afirmamos nada.
- **Vivo ≠ a progredir.** O monitor reporta `POSSIVELMENTE ENCRAVADO` quando um job diz "running" mas o ficheiro não muda há ≥10 min. Foi a lição da sessão: o codex correu 97 passos / 12 min a bater com a cabeça em globs Unix e o painel dizia "a-trabalhar".
- **Relocate é alarme, não nota de rodapé.** Tanto o agente como o monitor põem `relocated: true` em primeiro lugar, com a branch e a distância a `main`.

## 3. ⚠️ Divergência de versão encontrada

| Artefacto | Versão |
|---|---|
| `tools/router/version.json` | **1.45.4** (released 2026-08-03) |
| `plugin/mooter/.claude-plugin/plugin.json` | **1.38.0** |
| conector instalado | 1.45.3 (bundle 1.45.4 está em `_handoff/`, por instalar) |

O plugin está **7 minor atrás** do router. Quem instalar o plugin hoje leva metadados de uma versão que já não existe. Corrigir antes de qualquer distribuição.

## 4. Gates antes de acreditar que funciona

1. **O conector Mooter está ligado na sessão do Claude Code?** Agentes de plugin **não podem declarar `mcpServers`** (restrição de segurança da doc). O `mooter-dispatch` só funciona se `mcp__Mooter__*` já estiver disponível nessa sessão. Se o teu CC fala com o Mooter por hooks e não por MCP, este é o gate que falha primeiro.
2. **Monitores correm no teu host?** A doc diz "only in interactive CLI sessions" e marca-os como experimental. Se não arrancarem, o painel continua a funcionar pelo subagente — o monitor é enhancement, não fundação.
3. **`subagentStatusLine` exige versão recente do CC**: `model` e `contextWindowSize` no stdin pedem v2.1.205+; `effort` pede v2.1.214+.

## 5. Como ver o show

📥 **COLAR EM: terminal do Claude Code, na pasta `~/frugal`**

```
/plugin
```
→ confirma que `mooter` está activo e que `mooter:mooter-dispatch` aparece no `@`.

📥 **COLAR EM: prompt do Claude Code**

```
@mooter:mooter-dispatch faz um resumo em 3 linhas do que o ficheiro AGENTS.md exige antes de escrever um handoff. Deixa o router escolher o motor.
```
→ deve abrir linha no painel de Background tasks, com a statusline do Mooter por baixo.

**O que observar:** (a) a linha aparece com animação nativa; (b) a statusline mostra o motor e 🐮 grátis se o router escolher local; (c) o painel diz "relocado" se o Mooter mudar de pasta; (d) quanto custou a casca — se passar de ~2k tokens, o `maxTurns` e o intervalo de poll estão mal calibrados.

## 6. Estado dos jobs de auditoria da sessão

| Job | Motor | Resultado |
|---|---|---|
| `job-msdo8c49-1cd5` | codex | `exit_code: 0` · 1236 s · **9.651.679 tokens in** / 44.219 out · custo **n/d** · nota do próprio Mooter: *"sem veredicto: não verificou"* · correu em `frugal-site` (relocado) |
| `job-msdo942t-f63f` | moo | `prep-timeout` aos 20 s |
| `job-msdo9jm9-b1fe` | codex | `exit_code: 0` · 788 s · **3.741.719 tokens in** / 20.544 out · custo **n/d** · *"sem veredicto: não verificou"* · relocado |

**13,4 milhões de tokens de entrada, três jobs, zero veredictos.** A auditoria de coerência (`fatiaLocal`, `eta_bar`, divergência entre vistas) continua por fazer.

## 7. Por fazer

- [ ] Alinhar `plugin.json` 1.38.0 → 1.45.4
- [ ] Testes para `subagent-statusline.js` (stdin malformado, task sem `model`, `columns` pequeno)
- [ ] Confirmar gate #1 (MCP disponível na sessão CC) antes de prometer isto a alguém
- [ ] Auditoria de coerência de números — refazer sem relocate, na pasta principal
- [ ] Decidir como o plugin chega ao utilizador (marketplace vs CLI) — ver a descoberta de que o funil real é a CLI, não o conector
