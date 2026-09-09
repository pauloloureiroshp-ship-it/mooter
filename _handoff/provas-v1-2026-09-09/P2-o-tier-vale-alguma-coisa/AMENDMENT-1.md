# P2 · AMENDMENT-1 — o braço Haiku v1 atingiu a regra de paragem por defeito do instrumento

**Quando:** 2026-09-09, depois da primeira corrida do braço C (Haiku) e antes de qualquer análise publicada.

**O que aconteceu.** A primeira corrida de `run.mjs --cloud --model haiku` usou `spawnSync('claude', [...], { shell: true })`. O `claude` do PATH é um shim `.cmd`; o `cmd.exe` mastigou aspas e parênteses do prompt (`The system cannot find the path specified`), 3 das 4 primeiras chamadas saíram com exit 1, e a regra de paragem do protocolo («3 falhas de serviço → parar e reter») disparou correctamente. A 4.ª chamada correu mas respondeu ao contexto injectado pelos hooks de sessão («Olá. Sessão carregada com contexto da worktree…») e não à tarefa. Esse bruto está no git (`f2739bcb`, `results/cloud-haiku.json` v1) e **não conta para nenhum número**.

**O que mudou no instrumento (e só no instrumento):**
1. executável real (`%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`) em vez do shim, sem `shell`;
2. prompt por **stdin** em vez de argumento;
3. `--settings '{"disableAllHooks":true}'` para a chamada ser crua ao modelo (o `--system-prompt` já substituía o system prompt; os hooks continuavam a injectar contexto).

**O que não mudou:** corpus, oráculos, parâmetros (`--max-turns 1`, tools desligadas, mesmo `system`), critério de aceitação, estatística, direcção da hipótese. O `protocol.json` e os seus hashes ficam intactos.

**Estado do resultado:** a corrida repetida é a corrida válida. O P2 passa a ler-se «pré-registado, **com uma emenda de instrumento**», e não «sem desvios». Registado também como D5 em `09-DEFEITOS-APANHADOS.md`.

**Errata de metadados (ataque A01 do adversário):** `holdout-10.json` traz `_written_at: 2026-09-09T13:40:00Z`, escrito à mão e **errado**. A ordem real, atestada pelos mtimes e pelo transcript: `holdout-10.json` escrito → revisão Codex (`oracle-review-codex.json`) → `protocol.json` congelado (13:07:06Z) → corridas → análise. O ficheiro não se corrige porque o seu sha está congelado no protocolo; a errata vive aqui. Regra a partir de agora: nenhum timestamp escrito à mão — só `new Date()`.
