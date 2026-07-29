# Conductor F0 — red-team (advogado do diabo) · 2026-07-05

> Confronto do desenho v1 (`MOOTER_CONDUCTOR_PRODUCT_DESIGN.md` + masterprompt F0 v1) contra o
> código real, a doc oficial e os orquestradores públicos. Resultado: **3 falhas reais no v1**,
> **2 técnicas melhores encontradas**, e uma lição de mercado que valida a tese thin-layer.
> O masterprompt v2 (`CONDUCTOR_F0_DISPATCH_MASTERPROMPT.md`) já incorpora tudo.

## 1. Lição de mercado (a mais importante)

Os orquestradores que **reconstruíram a UI do CC** (spawn de processo + render próprio de
output/permissões/diffs) estão **mortos**: Crystal (stravu) → deprecated fev-2026 (renasce como
Nimbalyst pago), vibe-kanban (BloopAI) → sunset. Entretanto a Anthropic absorveu o genérico:
`--worktree` nativo, agent teams, CC Desktop com sidebar multi-sessão (abr-2026). **Conclusão:**
competir em "gestor de sessões paralelas" é correr contra a Anthropic. O fosso do Mooter é o que
nenhum deles tem: o **pipeline masterprompt-como-artefacto** (Cowork escreve → cockpit despacha →
doctrine/gates/$0). O v1 já apontava aqui; o red-team confirma que é o ÚNICO sítio defensável.
⚠️ Bónus: **"Conductor" já é um produto CC** (conductor.build, Mac, conhecido). Rebatizar antes
de qualquer copy pública — sugestões na régua do herd: **Moo Dispatch** (F0) e **Herd Maestro**
(visão). Decisão do Paulo.

## 2. Falhas reais encontradas no v1

### F1 · O deep-link expulsa a sessão do VS Code (contradiz a dor original)
`claude-cli://` abre **Windows Terminal externo**. A dor era "30 abas no VS Code sem saber qual é
qual" + fricção de foco entre janelas — o v1 trocava abas anónimas por **janelas externas** que o
cockpit não consegue focar (`openSessionTab` só cobre abas da extensão) e que perdem a integração
IDE (diffs nativos, @terminal, selection context).
**Fix v2 (técnica melhor):** `vscode.window.createTerminal({cwd: worktree, name: '🐮 '+name})` +
`sendText('claude')` — o equivalente VS Code do tmux send-keys que o Claude Squad usa em produção.
Prefill do bootstrap com `sendText(texto, false)` (sem newline) → **pré-preenchido dentro do REPL,
Enter continua a ser do Paulo**. Sessão fica DENTRO do VS Code, terminal nomeado por worktree,
`/ide` auto-conecta.

### F2 · Timing cego do sendText → resolvido com ground truth que JÁ existe
Digitar antes do CC arrancar = texto vai para o PowerShell (feio e potencialmente perigoso).
A API do VS Code não lê o buffer do terminal (estável). **Fix v2:** não adivinhar — **observar
`~/.claude/projects/<enc(cwd)>/`**: um `.jsonl` novo aparece quando a sessão arranca (é a mesma
ground truth que `recentSessions()`/`listSessionFiles()` já usam). Poll ≤15s → só então prefill.
Sem shell-integration API, sem delays mágicos. Degradação honesta: timeout → NÃO digita nada,
oferece o fallback deep-link + copy no clipboard. Pré-flight: `where claude` antes de lançar.

### F3 · A régua 1w=1s validava-se na fonte ERRADA
O v1 mandava cruzar com o file-bus — mas `eventsPath()` é `<workspace>/_handoff/...`, **per-repo**:
sessões em worktrees irmãs escrevem no bus DELAS, invisível ao cockpit. **Fix v2:** validar contra
`~/.claude/projects/<enc(cwd)>/*.jsonl` (global, todas as worktrees), mtime <30min = viva — a
heurística exacta que `recentSessions()` já usa (host-extra.js). Encoding do dir: `cwd` com
`[\\/:.]`→`-` (formato visível em listSessionFiles).

### F4 · Worktree nova nasce sem node_modules (fricção conhecida, ignorada no v1)
CLAUDE.md: fresh worktrees precisam de `npm install` em packages/cli E packages/router. O card e o
bootstrap do v2 avisam; a instalação fica a cargo da sessão CC (masterprompts têm GATE de testes).
F1+ pode ganhar setup-command opcional (padrão Claude Squad).

### F5 · Dispatch que só CRIA worktrees alimenta a doença das 40 worktrees
Já há backlog "podar 40 worktrees". O v2 não constrói lifecycle novo (o cockpit Doctor já tem
worktree hygiene) mas regista cada dispatch em `dispatch.jsonl` com estado, para o Doctor/F1
poderem colher. Nada de novo para manter; só rasto.

## 3. Técnicas/ideias melhores que o v1 não tinha

### T1 · Matar o "colar": os masterprompts JÁ SÃO ficheiros
O Cowork já escreve `_handoff/*_MASTERPROMPT.md`. Colar de novo no cockpit é fricção redundante.
**v2: a fila de dispatch nasce dos ficheiros** — o cockpit watch a `_handoff/dispatch/` (novo dir
canónico; drag/save do Cowork) e mostra cartões automaticamente; a caixa de colar vira fallback.
Isto entrega o "colar-e-esquecer" do Nível 2 com esforço de F0: o output do Cowork É a fila.

### T2 · Front-matter explícito > parsing (o emissor somos nós)
Quem gera masterprompts é o Cowork — não há razão para o receptor adivinhar por regex. Formato
canónico v2 ganha front-matter opcional:
```yaml
---
dispatch: { worktree: frugal-mp3, base: main, model: sonnet, mode: fresh }
---
```
Regex do v1 fica como fallback retrocompatível (validada contra os cabeçalhos reais do MP5 spec).
O moo local (F2) fica para DECISÕES (fresh-vs-viva, dependências), não para extração.

### T3 · O terminal integrado unifica F0 e F2
Deep-link `claude-cli://` não tem parâmetro de sessão → beco sem saída para "responder a viva".
O terminal integrado cobre os dois: fresh = `claude`; viva = `claude --resume <sid>` (novo processo,
único mecanismo suportado) com prefill igual. A arquitectura v2 não se deita fora no F2.

### T4 · (Opcional, flag) SessionStart hook por worktree
Escrever `.claude/settings.local.json` na worktree com hook SessionStart que injecta o
MASTERPROMPT.md como additionalContext → qualquer sessão aberta ali já nasce com o contexto, zero
timing. Não entra no F0 (mais superfície de config); fica documentado para F1 se o prefill chatear.

## 4. O que sobrevive intacto do v1
Parser determinístico $0 (agora fallback) · cartão de pré-voo honest-copy · `git worktree add`
host-side execFile (padrão Commit&Push) · masterprompt gravado em `<worktree>/_dispatch/MASTERPROMPT.md`
· Enter humano como gate · classify.js intocado · wave única CC-once · dogfood MP3/MP4.1.

## 5. Arquitectura final (escada de degradação honesta)
1. **Plano A** — terminal integrado nomeado + poll de `~/.claude/projects` + prefill sendText.
2. **Plano B** — deep-link `claude-cli://open?cwd&q=bootstrap` (externo mas documentado). Pré-flight: `reg query HKCU\Software\Classes\claude-cli`.
3. **Plano C** — clipboard + `mooter.newSession` (o playWave de hoje). Nunca falha.
O card diz sempre QUAL plano vai usar e porquê.

## Fontes
Código: `extension.js` (newSession/openSessionTab/playWave/runInTerminal/Commit&Push), `hook-collector.js` (eventsPath), `host-extra.js` (listSessionFiles/recentSessions/_sessionCwd), `sdk-runner.mjs`. Doc: [deep-links](https://code.claude.com/docs/en/deep-links) · [vs-code](https://code.claude.com/docs/en/vs-code) · [sessions](https://code.claude.com/docs/en/sessions) · [worktrees](https://code.claude.com/docs/en/worktrees). Prior art: [Crystal→Nimbalyst](https://github.com/stravu/crystal) (deprecated) · [vibe-kanban](https://github.com/BloopAI/vibe-kanban) (sunset) · [conductor.build](https://www.conductor.build/) (colisão de nome) · [Claude Squad](https://github.com/smtg-ai/claude-squad) (tmux send-keys) · [agent teams](https://code.claude.com/docs/en/agent-teams).
