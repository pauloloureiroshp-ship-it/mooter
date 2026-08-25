📥 **COLAR EM:** n/a — este ficheiro é o relatório de saída. Destino real: `_handoff/M2_NATIVE_SEAM_REPORT.md` no repo `frugal`.

```yaml
type: REPORT
id: M2-NATIVE-SEAM-2026-07-24
wave: mooter-seamless-m2
gerado_por: Cowork/Opus 5 — sessão MP-M2-OPUS5-UXRUN-2026-07-24
consome: MOOTER_SEAMLESS_M2_HANDOFF_2026-07-24.md (§7, 1º bullet: PARA)
estado_da_wave: ABERTA — parou no P0/P1 por costura ausente
custo_da_sessao: n/d (sem job dispatchado; zero tokens de agente headless)
```

# ⇄ M2 — RELATÓRIO DA COSTURA NATIVA

**VEREDICTO: costura ❌.** As tools `mooter_*` continuam ausentes **depois** do fix do BOM e do restart do Desktop.
**Hipótese que fica de pé: H4** — `claude_desktop_config.json` **não é a superfície** que alimenta o conjunto de conectores desta sessão Cowork. H3 (BOM) era real, mas era **co-morbidade, não a causa bloqueante**.

Nenhum job foi dispatchado. **Zero linhas `mooter-seamless-m2` no ledger.** Critério de aceite da wave: **não cumprido**.

---

## 1. P1 · Costura — o que a sessão viu

| Sonda | Resultado |
|---|---|
| `ToolSearch "mooter route dispatch job ledger"` | 0 tools mooter |
| `ToolSearch "+mooter"` (nome exato) | `No matching deferred tools found` |
| `mcp__remote-devices__mooter__*` | ausente |
| `RefreshMcpTools(remote-devices)` | `refreshed`, **53 tools**, `added: []`, `removed: []` |
| Chip `mooter` na lateral / Context | **não aparece** |

## 2. O teste-controlo que fecha o caso (não estava no MP — é dado novo)

O `claude_desktop_config.json` declara **três** servidores: `github`, `desktop-commander`, `mooter`.
Testei os outros dois, não só o mooter:

| Servidor | Declarado no config | Visível nesta sessão |
|---|---|---|
| `github` | ✅ | ❌ |
| `desktop-commander` | ✅ | ❌ |
| `mooter` | ✅ (reafirmado pelo fix) | ❌ |
| `Spotify (AppleScript)` | ❌ — **não está no ficheiro** | ✅ `mcp__remote-devices__Spotify__AppleScript___*` (16 tools) |

**Leitura:** a ponte `remote-devices` **funciona** e proxia MCP local (Spotify prova-o). O que não passa é **tudo o que vem do ficheiro** — os três, em bloco, incluindo dois que estão lá há semanas. Isto não é um problema do `server-seamless.js`; é a superfície.

## 3. Hipóteses — estado final

| # | Hipótese | Veredicto | Evidência |
|---|---|---|---|
| H1 | Desktop não reiniciado | **provável-refutada, não certa** | Paulo reiniciou ~16:05 BRT (afirmação dele, não verificável daqui) → ver §6, confound aberto |
| H2 | `server-seamless.js` crasha | **REFUTADA** | `fix-mooter-connector.log` §5, teste a frio: `initialize` OK + `tools/list` devolveu **7 tools** (`mooter_sessions_list, mooter_session_read, mooter_run, mooter_route, mooter_dispatch, mooter_status, mooter_collect`) |
| H3 | BOM quebra o parse do config | **CONFIRMADA NA ORIGEM, INSUFICIENTE** | log §1: `ef bb bf 7b` · `NODE_JSON_PARSE=FAIL` → log §4: `7b 0d 0a 20` · `NODE_JSON_PARSE=OK`. O bug era real e está corrigido — **e mesmo assim nada apareceu** |
| **H4** | **A superfície do ficheiro é ignorada** | **DE PÉ** | §2 acima + doc oficial (§4) + `%APPDATA%\Claude\logs` inexistente às 15:53 |

⚠️ **Correção ao registo anterior:** a memória dizia *"o BOM matava TODOS os MCPs do ficheiro, por isso github/desktop-commander nunca apareceram"*. Com o BOM corrigido e o parser a devolver `OK`, os três continuam ausentes. A explicação BOM→ausência **cai como causa suficiente**.

## 4. Doc oficial (web, hoje 2026-07-24) — confronto

`claude.com/docs/cowork/3p/extensions` lista as superfícies de utilizador:

- **Connectors:** instalar desktop extensions locais **`.mcpb`** pela página de Connectors
- **Local MCP servers:** adicionar processos MCP locais por **Settings → Developer**, quando o admin permite (`isLocalDevMcpEnabled`)
- "User-added extensions are stored in the user's **local data directory**"

`support.claude.com/.../when-to-use-desktop-and-web-connectors`: desktop extensions funcionam "only in Claude Desktop and Claude Code".

**Nenhuma das superfícies documentadas é "editar `claude_desktop_config.json` à mão".** O ficheiro é o caminho histórico do Claude Desktop clássico; a doc de 2026-07 aponta o registo do utilizador para a UI, com armazenamento no *local data directory*. Isto é **consistente** com o observado, mas é doc + observação — **não li o código do Desktop**, logo o mecanismo exato é `n/d`.

## 5. O bug nº2 (do handoff) continua válido

`_handoff/agent-sync/dispatch-queue.json` **não existe**. Bus B real = `events.jsonl` + `snapshot.json`. Nenhum job foi queimado a auditar caminho fantasma — a auditoria M2 não chegou a correr.

## 6. Confound honesto que não consegui fechar

Não consigo verificar daqui (`%APPDATA%` fora dos mounts; `device_bash` só vê `frugal`) se o Desktop foi **fechado por completo, tray incluída**, entre 15:53 e o nascimento desta sessão. Se não foi, H1 revive e H4 fica por provar.

**Discriminador de 30 segundos, custo zero, para o Paulo:** abrir **Settings → Connectors** (e **Settings → Developer**) e ver se `github` e `desktop-commander` estão listados na UI.

- **Não estão** → o ficheiro não é a superfície. **H4 confirmada.**
- **Estão** → o ficheiro é lido, e o problema é restart/permissão. **H1 revive.**

## 7. 🔜 PRÓXIMO PASSO — o mais barato primeiro

1. **M3-A (5 min, reversível):** `Settings → Developer → adicionar local MCP server`
   nome `mooter` · command `node` · arg `C:/Users/Paulo Loureiro/frugal/packages/mooter-bridge/server-seamless.js`.
   Fechar Desktop (tray) → reabrir → **task nova** → `ToolSearch "+mooter"`.
   Se aparecer (com qualquer um dos dois nomes) → M2 corre inteiro sem escrever uma linha de código.
2. **M3-B (fallback, ~1-2h):** empacotar o bridge como **`.mcpb`** e instalar por Connectors. É o F3 do roadmap, antecipado.
3. Só depois: P2–P6 do handoff M2 (route → dispatch cc → collect → dispatch codex → relatório).

❌ **Não** contornar por script/PowerShell: o produto desta wave é a **medição** da costura, não o resultado do job.

## 8. Loopholes novos (para o roadmap)

| nº | Loophole |
|---|---|
| 11 | **Superfície de registo MCP não é canónica.** Todo o plano seamless assumia `claude_desktop_config.json`. Nenhum doc do repo cita a doc oficial de superfícies. Fixar em `SEAMLESS.md`. |
| 12 | **Ausência de tool não emite sinal.** A sessão nasce cega e só descobre por sonda manual. O cockpit devia ter um tile "costura: ✅/❌ + nome real das tools", verificado no arranque. |
| 13 | **Teste-controlo em falta no protocolo de diagnóstico.** Duas sessões debugaram só o `mooter`. Bastava perguntar "e os outros dois do mesmo ficheiro?" para poupar um ciclo inteiro. Regra nova: **ao diagnosticar uma entrada de um ficheiro partilhado, testar sempre as entradas vizinhas.** |

## 9. U3 · O que a lateral MOSTROU vs o que ficou invisível (input p/ a spec F2)

| Superfície | Mostrou | Falhou |
|---|---|---|
| Context / chips | conectores remotos + `remote-devices` | **nenhum sinal** de que um servidor local declarado falhou a subir — silêncio idêntico a "não existe" |
| Progress (task widget) | as 4 tarefas desta sessão, a andar em tempo real | n/a — não houve job de frota para espelhar |
| Outputs | o relatório no fim | nada durante a corrida |
| Artifact `mooter-cockpit` | estado de M1 | não sabe que M2 tentou e falhou — **não há evento para o alimentar** |

**Conclusão de UX:** a lateral hoje mostra bem o que o Cowork **faz**, e não mostra nada do que o Cowork **não consegue alcançar**. O maior ganho de F2 não é mais gráfico — é um **semáforo de costura** no arranque da sessão: "mooter: ❌ ausente · última tentativa 24/07 16:05 · superfície: config-file (não suportada)".

## 10. BOARD

| Ator | Estado | Próxima ação |
|---|---|---|
| **Paulo** | 🔥 é o único que pode agir | Discriminador §6 (30s) → depois M3-A (§7.1) |
| **Cowork** | ✅ sessão fez o trabalho, parou onde devia | reabrir task nova **só depois** de `mooter` aparecer na UI |
| **CC** | ❄️ parado | nenhum job dispatchado nesta wave |
| **Codex** | ❄️ parado, ainda **nunca** correu via daemon | continua o dado que falta |
| **Ledger** | 🟡 4 linhas, só `m1` | primeira linha `m2` continua por escrever |
| **Bridge** | ✅ saudável | 7 tools no teste a frio; o problema não é o servidor |

❌ **Não fazer:** contornar por script · rotar guard nenhum · job com escrita (keys por rotar, loophole nº8) · tocar em `packages/*` ou `classify.js` · inventar número.

---

🤝 **SOCIO:** receita? na · despesa↓? **S** (matámos a hipótese errada por ~$0 em vez de queimar $3 num dispatch que nunca ia partir) · risco↓? **S** (o teste-controlo evita um terceiro ciclo cego) · reversível? **S** (nada foi escrito fora de `_handoff/` e da memória) · escopo? **S**
📮 **DESTINO:** Paulo (§6 + §7.1) → sessão Cowork nova quando a costura acender
