# P2 · AMENDMENT-1 — o braço Haiku v1 atingiu a regra de paragem por defeito do instrumento

**Quando:** 2026-09-09, depois da primeira corrida do braço C (Haiku) e antes de qualquer análise publicada.

**O que aconteceu.** A primeira corrida de `run.mjs --cloud --model haiku` usou `spawnSync('claude', [...], { shell: true })`. O `claude` do PATH é um shim `.cmd`; o `cmd.exe` mastigou aspas e parênteses do prompt (`The system cannot find the path specified`), 3 das 4 primeiras chamadas saíram com exit 1, e a regra de paragem do protocolo («3 falhas de serviço → parar e reter») disparou correctamente. A 4.ª chamada correu mas respondeu ao contexto injectado pelos hooks de sessão («Olá. Sessão carregada com contexto da worktree…») e não à tarefa. Esse bruto **não ficou preservado em ficheiro nem em commit nenhum** (ver Correcção 1 abaixo — a primeira versão desta emenda dizia o contrário) e **não conta para nenhum número**.

**O que mudou no instrumento (e só no instrumento):**
1. executável real (`%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`) em vez do shim, sem `shell`;
2. prompt por **stdin** em vez de argumento;
3. `--settings '{"disableAllHooks":true}'` para a chamada ser crua ao modelo (o `--system-prompt` já substituía o system prompt; os hooks continuavam a injectar contexto).

**O que não mudou:** corpus, oráculos, parâmetros (`--max-turns 1`, tools desligadas, mesmo `system`), critério de aceitação, estatística, direcção da hipótese. O `protocol.json` e os seus hashes ficam intactos.

**Estado do resultado:** a corrida repetida é a corrida válida. O P2 passa a ler-se «pré-registado, **com uma emenda de instrumento**», e não «sem desvios». Registado também como D5 em `09-DEFEITOS-APANHADOS.md`.

**Errata de metadados (ataque A01 do adversário):** `holdout-10.json` traz `_written_at: 2026-09-09T13:40:00Z`, escrito à mão e **errado**. A ordem real, atestada pelos mtimes e pelo transcript: `holdout-10.json` escrito → revisão Codex (`oracle-review-codex.json`) → `protocol.json` congelado (13:07:06Z) → corridas → análise. O ficheiro não se corrige porque o seu sha está congelado no protocolo; a errata vive aqui. Regra a partir de agora: nenhum timestamp escrito à mão — só `new Date()`.

---

## Correcção 1 (2026-09-09, auditoria numérica independente) — a corrida v1 não está no git

A primeira versão desta emenda dizia: «Esse bruto está no git (`f2739bcb`, `results/cloud-haiku.json` v1)». **Estava errado.** `git show f2739bcb:…/results/cloud-haiku.json` devolve um ficheiro de **1 linha**: L1-a, exit 0, `accepted: true`, `answer: "SEN-4827"`, `at: 2026-09-09T13:14:14Z`, sem marca `aborted`. O `run.mjs` nesse mesmo commit já é o instrumento corrigido (`claude.exe`, prompt por stdin, `disableAllHooks`) — o `run.mjs` com `shell: true` também não está em commit nenhum. Dos 3 commits que tocam esta pasta (`f2739bcb`, `22388a20`, `5efd58ed`), nenhum guarda um `cloud-haiku.json` com exit ≠ 0 ou com `aborted`, e o `results/cloud-haiku.log` (21 linhas) só tem a corrida válida.

A corrida v1 — as 3 chamadas com exit 1 e a 4.ª a responder aos hooks — **sobrevive apenas no transcript da sessão**. O que o git permite verificar é que o instrumento mudou; o que não permite verificar é a falha que motivou a mudança. Fica registado como tal. Nenhum número muda: a v1 já não contava para nada.

## Correcção 2 (2026-09-09, mesma auditoria) — caminho do `partner-study` no instrumento

`run.mjs` (linha 31) fixava `PARTNER` num caminho fora do pacote: `C:/Users/Paulo Loureiro/OneDrive/Documents/ChatGPT/New project/output/partner-study-20260909`. O pacote já continha uma cópia em `partner-study/`, e os 4 ficheiros (`protocol.json`, `paired-results.json`, `paired-protocol.json`, `router-observations.json`) são **byte a byte iguais** aos originais (sha256 iguais, verificado nesta data). O `protocol.json` do P2 já congelava `partner-study/protocol.json` (`db783257…`) e `partner-study/paired-results.json` (`784186a2…`) por caminho relativo ao pacote — ou seja, o `checkFrozen()` verificava a cópia enquanto o `cases()` e o `analyse()` liam o OneDrive.

O que o `run.mjs` lê do estudo: em `cases()`, `protocol.json` → `.cases[]` (`id`, `level`, `prompt`, `answer`; 10 casos L1-a…L5-b); em `analyse()`, `paired-results.json` → as 10 linhas com `arm === 'native'` (`caseId`, `accepted`, `model`). `paired-protocol.json` e `router-observations.json` não são lidos. Alteração: `PARTNER = process.env.P2_PARTNER || path.join(HERE, 'partner-study')`. `node --check run.mjs` passa. **Zero números alterados** — mesmos bytes, mesma leitura; o `protocol.json` do P2 fica intacto.
