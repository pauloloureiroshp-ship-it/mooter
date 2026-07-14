# Claude Desktop / Cowork — mapa do disco (o contrato do Mirror) · MP-MIRROR-0

> **Recon empírico, read-only, 2026-07-05.** Este doc é o *contrato* sobre o qual a lente 🧠 Cowork
> (MP-MIRROR-1) pode ser construída sem suposição. Onde a arquitectura
> (`_handoff/MOOTER_MIRROR_ARCHITECTURE.md` §1) assumiu uma estrutura em disco, este recon confirma
> ou corrige com verdade da máquina real. Estruturas internas não são documentadas pela Anthropic →
> tudo aqui é heurística verificada, não promessa de estabilidade.

## 0. Método e âmbito

- Máquina: host do Paulo (Windows 11, perfil `Paulo Loureiro`). Um único perfil examinado.
- Ferramenta: `Get-ChildItem`/`Get-Item`/`Get-Content` — **apenas leitura e listagem**. Nenhuma
  escrita, move, rename ou lock em `%APPDATA%`/`%LOCALAPPDATA%`.
- Prova de não-intrusão: mtimes de todos os dirs Claude-Desktop capturados **antes** e **depois** do
  recon (§5). Resultado tick-exacto: `ALL UNCHANGED = True`.
- Redacção: nenhum valor de memória pessoal entra neste doc — só **estrutura e frontmatter**, com os
  corpos marcados `REDACTED`.

## 1. O headline que muda o desenho (⚠️ diverge da arquitectura §1)

A arquitectura afirmou, como "verificada hoje empiricamente", que a memória do Cowork vive em
`%APPDATA%\Claude\local-agent-mode-sessions\<workspace>\<agent>\spaces\<space>\memory\`.

**Nesta máquina, essa árvore NÃO existe.** Verificado exaustivamente:

- `%APPDATA%\Claude\` contém **apenas** `claude_desktop_config.json` — zero subdirectórios de sessão.
- Busca recursiva por `local-agent-mode-sessions` em **todo** o perfil (fora de `\Temp\`): **0 hits**.
- Busca por qualquer `spaces\*\memory\MEMORY.md` (a forma exacta que a arquitectura descreveu),
  fora de `\Temp\` e `\.claude\`: **0 hits**.
- App de desktop instalada em `Programs\`: só **"Cloude Home"** (Electron de terceiros — reparar na
  grafia "Cloude", não é o Claude Desktop da Anthropic). Não há `AnthropicClaude` nem `claude.exe`
  oficial instalado.

**Conclusão do contrato:** o "cérebro do Cowork em disco" que a arquitectura pressupôs **não está
presente neste host**. As superfícies de sessão/memória/artifacts do Claude Desktop são, aqui,
**cloud-only ou ausentes** → só se espelham por **T2-export** (o Cowork escreve snapshots), nunca por
leitura T1 de internals do Desktop.

**Mas há um cérebro em disco, com exactamente o formato markdown+frontmatter descrito — é o do
Claude *Code* (CC)**, em `~/.claude/`. Este é o único substrato T1 real hoje. Isto abre uma bifurcação
de desenho para o MP-1 (§6): mirror do *Cowork* (cloud → T2) vs. mirror do *CC* (disco → T1). São
cérebros diferentes; o doc não os funde por decreto — expõe a escolha.

## 2. Tabela-contrato: superfície → veredicto

| # | Superfície | Path glob (testado) | Formato | Freshness | Risco de mudança | **Veredicto** |
|---|---|---|---|---|---|---|
| 1 | Config MCP do Desktop | `%APPDATA%\Claude\claude_desktop_config.json` | JSON (`mcpServers{}`) | mtime | baixo (path estável, sem GUID) | **T1 · só constatar** (não é "cérebro"; é config) |
| 2 | Cowork agent-mode sessions | `%APPDATA%\Claude\local-agent-mode-sessions\` | — | — | n/a | **AUSENTE → cloud-only / T2** |
| 3 | Cowork memory | `…\spaces\<id>\memory\MEMORY.md` + `*.md` | — | — | n/a | **AUSENTE → T2-export** |
| 4 | Cowork sessions/transcripts | (idem #2) | — | — | n/a | **cloud-only / T2** |
| 5 | Artifacts | (espaço do Desktop) | — | — | n/a | **cloud-only / T2** |
| 6 | Scheduled tasks | (nenhum storage local encontrado) | — | — | n/a | **cloud-only / T2** |
| 7 | Perfil / preferences / styles | ☁️ sem API | — | — | n/a | **T2-export** (Cowork escreve `profile.md`) |
| 8 | Projects | ☁️ | — | — | n/a | **T2-export** |
| — | *(abaixo: o cérebro que EXISTE em disco — CC, não Desktop)* | | | | | |
| 9 | **CC auto-memory** | `~/.claude/projects/<slug>/memory/MEMORY.md` + `*.md` | índice + md c/ frontmatter | **mtime ao vivo** | médio (interno CC, não documentado; formato evoluiu — ver §4) | **T1 · ao vivo** |
| 10 | **CC skills cache** | `~/.claude/skills/<name>/SKILL.md` | md c/ frontmatter `name`+`description` | mtime | baixo (formato público estável) | **T1** |
| 11 | **CC sessions** | `~/.claude/projects/<slug>/*.jsonl` | JSONL (1 evento/linha) | **mtime útil p/ "hoje"** | alto (formato interno, muda entre versões CC) | **T1 c/ cautela** |
| 12 | CC agents | `~/.claude/agents/` | md | mtime | baixo | **T1** |
| 13 | T2 mirror (alvo) | `~/.mooter/cowork-mirror/*.json\|md` | JSON/MD versionado | `snapshot.json.ts` | **o mais baixo — contrato nosso** | **T2 · pendente** (dir ainda não existe) |

Dados medidos neste host: CC auto-memory do projecto frugal = **35 ficheiros** `.md` (índice + 34);
CC skills = **145** entradas `<name>/SKILL.md`; CC sessions = **136** `.jsonl`.

## 3. Formatos reais (2 exemplos mínimos por formato, anonimizados)

### 3.1 Config MCP do Desktop — `claude_desktop_config.json` (565 bytes)
Estrutura (só chaves; nomes de servidores são os reais, sem segredos):
```jsonc
{ "mcpServers": { "github": { … }, "desktop-commander": { … } } }
```
Top-level: só `mcpServers`. **Veredicto #1**: legível, mas é config — não alimenta a lente de cérebro.

### 3.2 CC auto-memory — índice `MEMORY.md` (uma linha por memória)
```
- [<Título>](<slug>.md) — <hook curto REDACTED>
- [<Título>](<slug>.md) — <hook curto REDACTED>
```
Forma real confirmada: `- [Title](file.md) — hook`. 33 linhas neste host.

### 3.3 CC auto-memory — entrada `<slug>.md` (frontmatter; corpo REDACTED)
Dois mais pequenos (`project_version_json_ssot.md` 682 B, `project_devices_migration_manual.md` 577 B):
```yaml
---
name: <string — título da memória>
description: <string 1-linha — REDACTED>
type: project | user | feedback | reference
originSessionId: <GUID>
---
<corpo markdown — REDACTED>
```
⚠️ **Divergência de formato a registar** (ver §4): o `~/.claude/CLAUDE.md` documenta o frontmatter
como `metadata:\n  type: …` (aninhado). Os ficheiros **em disco** usam `type:` **plano** + um campo
`originSessionId: <GUID>` não documentado. Um leitor T1 tem de tolerar **ambas** as formas.

### 3.4 CC skills — `<name>/SKILL.md` (frontmatter)
```yaml
---
name: <skill-name>
description: >
  <descrição multi-linha — pode ser folded scalar '>'>
---
```
Cada skill é um dir com `SKILL.md`. Nota: alguns `SKILL.md` estão a **0 bytes** (ex.:
`systematic-debugging`) → o leitor deve tratar vazio como `n/d`, não crashar.

### 3.5 CC sessions — `<session-uuid>.jsonl`
Nome = GUID de sessão; conteúdo = JSONL (um objecto-evento por linha). `mtime` é fiável para
"sessões de hoje" (os 3 mais recentes deste host partilham a data de hoje). Formato interno, denso
(100 KB–1.5 MB/ficheiro) — para a lente basta **mtime + contagem**, não o parse do corpo.

### 3.6 T2 mirror — `~/.mooter/cowork-mirror/` (alvo, ainda inexistente)
Contrato definido no MP-2: `profile.md`, `projects.json`, `schedule.json`, `artifacts.json`,
`snapshot.json` (`{ts, generator, version}`). **Ainda não existe** neste host → a lente deve mostrar
`n/d honesto` até o primeiro export do Cowork.

## 4. Riscos de versão (heurística de estabilidade)

- **Ausência não é permanente.** Se o Paulo instalar o Claude Desktop oficial e usar agent-mode, as
  superfícies #2–#6 podem materializar-se num path que **não podemos assumir** ser o da arquitectura.
  O leitor T1 tem de **detectar presença** (glob) antes de ler, e degradar para `n/d`.
- **`type:` plano vs `metadata.type:` aninhado** (§3.3) — o formato do frontmatter da CC-memory
  divergiu da doutrina escrita. Qualquer parser tem de aceitar as duas.
- **GUIDs = instabilidade.** Paths com GUID (sessions `<uuid>.jsonl`, `originSessionId`) são
  voláteis por natureza — nunca hard-codar um; enumerar sempre por glob + `mtime`.
- **JSONL de sessão = formato interno CC.** Alto risco de mudar entre versões do CC. Consumir só
  `mtime`/contagem; não depender da forma dos eventos.
- **"Cloude Home"** (Electron de terceiros) partilha prefixo de nome — o recon **não** o deve
  confundir com o Claude Desktop. Filtrar por publisher/estrutura, não só por nome.
- **Slug do projecto** (`c--Users-Paulo-Loureiro-frugal`) é derivado do cwd (determinístico), não
  um GUID → estável enquanto o path do repo não mudar.

## 5. Prova de zero-escrita no AppData (GATE)

mtimes capturados antes de qualquer leitura e re-verificados no fim (comparação tick-exacta):

| Path | mtime (antes = depois) | Estado |
|---|---|---|
| `%APPDATA%\Claude` | `2026-06-14T09:11:06.7111511-03:00` | UNCHANGED |
| `%APPDATA%\Claude\claude_desktop_config.json` | `2026-06-14T09:11:28.9823024-03:00` | UNCHANGED |
| `%LOCALAPPDATA%\Claude` | `2026-03-05T10:54:42.6903292-03:00` | UNCHANGED |
| `%LOCALAPPDATA%\Claude\Logs` | `2026-03-05T10:54:42.6903292-03:00` | UNCHANGED |

`ALL UNCHANGED = True`. Nenhuma escrita, criação, move ou lock em AppData durante o recon.

## 6. BACK — o que este recon muda no desenho do MP-MIRROR-1

**Resumo:** a premissa T1 da arquitectura (ler o cérebro do Cowork direto do disco do Desktop) **não
se sustenta neste host**. O MP-1 tem de nascer com a verdade abaixo, não com a da arquitectura §1.

| Linha da lente (arq. §4) | Assumido (arq.) | **Realidade deste recon** | Ajuste no MP-1 |
|---|---|---|---|
| **MEMÓRIA** | T1 do Desktop `spaces/…/memory` | Desktop **ausente**; T1 real = **CC** `~/.claude/projects/<slug>/memory` | Ou (a) nasce **T2** (Cowork exporta memória) — fiel ao "Cowork"; ou (b) espelha a **CC-memory** T1 — fiel ao "disco", mas é outro cérebro. **Decisão de design explícita, não implícita.** |
| **SKILLS** | T1 cache skills-plugin do Desktop | cache do Desktop ausente; existe cache **CC** (`~/.claude/skills`, 145) | T1 viável **se** a lente aceitar mostrar skills do CC. Tolerar `SKILL.md` a 0 bytes. |
| **SESSÕES Cowork** | T1 após recon | transcripts do Cowork **não em disco** aqui | Linha **nasce T2** (ou junta CC-sessions T1 `*.jsonl` só como mtime/contagem). Confirma a nota da arquitectura ("se não T1-líveis, nasce T2"). |
| **SCHEDULE** | T1/T2 (recon decide) | sem storage local → **cloud-only** | **T2** obrigatório (Cowork escreve `schedule.json`). |
| **ARTIFACTS** | T2/recon | sem disco → **cloud-only** | **T2** obrigatório. |
| **PERFIL** | T2 `profile.md` | confirmado cloud, `~/.mooter/cowork-mirror` ainda **não existe** | Mantém T2; lente mostra `n/d` até primeiro export. `vaultMtime` (já existe) continua a alimentar o chip de frescura. |
| **FILA ⇄ / dispatch** | T3 bridge/ficheiros | (fora do âmbito deste recon — host Mooter, não AppData) | Inalterado. |

**Regra de ouro herdada e reforçada:** cada leitor é **fail-soft por presença** (glob antes de ler,
`n/d` em ausência), tolera **duas formas** de frontmatter, e **nunca** assume o path da arquitectura.
Numa máquina sem Claude Desktop (como esta), a lente 🧠 tem de abrir limpa, com chips `n/d` honestos e
zero crash — e é isso, não o cenário "cheio", o **caso base** a testar no MP-1.
