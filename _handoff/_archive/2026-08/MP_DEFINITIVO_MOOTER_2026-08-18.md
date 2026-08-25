# 🔥 MP DEFINITIVO — MOOTER · fechar os 6 bloqueadores que sobram
**CC em sessão fresca · mooter no talo com a frota inteira · modo workflow · 2026-08-18**

---

## 🧭 COMO CORRER

- **Sessão CC nova**, raiz do repo (`~/frugal`), conector Mooter ligado. Branch base **`feat/f1-runner-canonico`** (`main` está 4 commits atrás — merjar no fim, não no início).
- **Mooter no talo:** `/mooter-model mix` → **moo** (Ollama local · $0) · **cc** (Claude/Fable) · **codex** · **gemini** · **kimi**. Local-primeiro; **Fable orquestra**.
- **Modo workflow:** cada fase = 1 workflow com subagentes em paralelo + **tribunal adversarial** (cada achado tem de ser *reproduzido* por um cético antes de contar). Esse método já provou o seu valor: numa auditoria de 16 agentes hoje, **refutou 6 de 10 achados** — seis falsos alarmes que teriam entrado no relatório.
- **Duas economias:** o **BUILD** usa a frota, tokens OK. O **RUNNER entregue** é **$0 DURO** — só `127.0.0.1:11434`. Se gastar 1 token de subscrição, é bug: **PÁRA e reporta**.

## ⚠️ ARMADILHA DE AMBIENTE (custou 3 falhas hoje)
`device_bash` corre numa **VM Linux**, não no macOS. Consequências que já morderam:
- **git de escrita** pela VM deixa `.git/index.lock` órfão que a VM **não consegue apagar** → correr git nativo;
- `/tmp` da VM **não é** o `/tmp` do Mac (um `git commit -F /tmp/msg` falhou por isto);
- `sed -i` **remove o bit de execução** dos `.command`;
- a VM **não vê processos do macOS** (`launchctl`, `ps` do host).

---

## 📊 O ESTADO, MEDIDO (não assumir nada)

| | |
|---|---|
| Testes | `npm run test:cockpit-runner` → **161 passam, 0 falham** (1 TODO antigo) |
| Runner | vivo, **modo `diff` em 12/12 rondas**, $0, `ollama-local` |
| Ledger | 5469 recibos · **os dois eixos já gravam** (`verdict` + `conclusao`) |
| Higiene | `RATCHET OK` — 204 active packets, 312 top-level, exactamente na baseline |
| Branch | 4 commits à frente da `main` |

**Já corrigido hoje (não refazer):** B4 (dois eixos do veredicto) e B5(i) (raciocínio visível no painel) — commit `af3794d7`.

---

## 🚧 OS 6 BLOQUEADORES QUE SOBRAM

Cada um vem com a evidência que o provou e o fix concreto. **Ordem obrigatória** — está justificada, não é gosto.

### **B6 · O modo diff mente no rótulo e mói código arquivado** *(primeiro)*
**Medido:** os packs de P1 e P5 diferem em **1 linha de 25** — só o cabeçalho; o campo `question` é **idêntico**. Os 6 pilares apontam ao mesmo ficheiro e à mesma janela. E os alvos incluem `_handoff/loop/` — **código arquivado**.
**Fix:** em `context-pack.mjs`, no degrau do diff: (a) filtrar os hunks pela lista de ficheiros do pilar **ou**, se não houver interseção, marcar `pilar: 'diff'` e parar de mentir no rótulo; (b) acrescentar `_handoff/**`, `docs/archive/**` e `**/*.test.*` ao pathspec de exclusão do `git diff`.
**Aceitação:** dois pilares diferentes, mesmo cursor → alvos **diferentes**; zero alvos em `_handoff/`.

### **B8 · Sem circuit-breaker: o motor em baixo gera recibos na mesma** *(mesma sessão)*
**Medido:** **1767 recibos consecutivos** de `motor local indisponivel: fetch failed` — um apagão de **11 horas** que entrou no ledger como se fosse trabalho, porque o loop faz `appendReceipt` e dorme 15-30s **incondicionalmente**.
**Fix:** em `moo-runner.mjs`, contador de falhas consecutivas de motor → backoff exponencial (30s, 60s, 120s… tecto 15min) e, a partir de N=3, **não gravar recibo de ronda**, gravar um único `engine:down` com o instante de início. Ao voltar, gravar `engine:up` com a duração do apagão.
**Aceitação:** simular Ollama em baixo (apontar `OLLAMA_HOST` para porta morta) → ledger ganha **1** linha, não 100.

### **B7 · Os 161 testes nunca correm em CI, e não há smoke E2E**
**Medido:** `.github/workflows/test.yml` filtra `paths:` que **não incluem `tools/cockpit/**`**. O `moo-runner.mjs` chama `main()` no topo sem guarda → **não é importável** → nenhum teste levanta o loop nem o servidor F10.
**Fix:** (a) juntar `tools/cockpit/**` aos paths e o step `npm run test:cockpit-runner`; (b) `if (import.meta.url === pathToFileURL(process.argv[1]).href) main()`; (c) smoke: levantar o F10 numa porta efémera, `GET /fleet.json`, `POST /stop` com origem externa → **403**, e um recibo end-to-end com Ollama falso.
**Aceitação:** um push que quebre o runner **falha o CI**. Hoje não falharia.

### **B1 · O runner não consegue apontar para outro repo**
**Medido:** `moo-runner.mjs:29` deriva `REPO_ROOT` da localização do próprio script. Todas as env do runner: `HOME, MOOTER_DEVICE, MOOTER_HOME, MOO_DIFF_BASE, MOO_SECOND_MODEL, VAULT_PATH` — **nenhuma aponta um repo**. A própria skill declara: *"só sabe conduzir o que já está no repo"*.
**Fix (~10 linhas):** ordem de resolução `--repo <path>` → `MOO_REPO_ROOT` → `git rev-parse --show-toplevel` a partir do `cwd` → dirname do script. A linha que já imprime `repo ${REPO_ROOT}` passa a dizer a verdade.

### **B2 · Estado global, cego ao projeto**
**Medido:** um ledger, um cursor, um lock, uma âncora, **sem campo de repo**. Dois projetos não coexistem.
**Fix:** `MOO_DIR/projects/<hash(repoRoot)>/{ledger,cursor,focus,STOP,ancora}` + lock por projeto. **Independentemente disso e já:** `repo` e `repo_sha` no `receiptBase` — uma linha que torna todos os recibos futuros interpretáveis.

### **B3 · Não há descoberta de pilares**
**Medido:** `PILLARS` é **uma única definição literal** em `context-pack.mjs:25`. Não existe leitor de `CLAUDE.md`, `package.json`, `.claude/` ou `SYNC.md` para derivar pilares.
**Fix:** `PILLARS` passa a ser o **default** de um loader que lê `.mooter/pilares.json` do `repoRoot` resolvido. Manter listas explícitas (a reprodutibilidade é deliberada — está comentada no código), mas **declaradas pelo projeto**. Gerar o ficheiro por um `moo-pilot init` que lê `CLAUDE.md`/`package.json` e **propõe** pilares ao dono, que aprova.

---

## 🎨 DEPOIS DOS BLOQUEADORES — o produto (B5 ii/iii)

Só faz sentido depois de o motor achar coisas úteis. **Nunca antes.**
- **3 botões por achado** → `triagem.jsonl`: `[aceitar] [descartar] [abrir issue]`. É isto que fecha o ciclo e cria o primeiro número de ROI real.
- **Selector de LLM por ação**, com **custo estimado à frente**: T0 moo $0 · T1 Haiku · T2 Sonnet · T3 Opus · T5 Fable · codex/gemini/kimi. Registar o custo **real** depois — é isso que torna a tese do Mooter auditável.
- **Filtros** por conclusão / pilar / ficheiro (o feed está preso em `FEED_LENGTH=14`).
- **Alertas:** hoje há zero. Um 🔴 novo devia ser visível sem o dono ir procurar.

---

## 🛡 GUARDA / DOUTRINA (violar isto é o bug, não a solução)

- **$0 duro** no runner: `assertLocalEngine` + `redirect:'error'` em **todos** os pedidos, incluindo o 2º parecer.
- **Evidência-ou-`n/d`.** Contar não é ler. Uma citação sem grep morre.
- **Nunca engolir erro em silêncio.** Se o `catch` devolve vazio, tem de **reportar** que rebentou. Foi assim que o modo diff ficou morto um dia inteiro sem ninguém saber (`ENOBUFS` num `git diff` de 52k linhas, sem `maxBuffer`).
- **Guardas só descem.** `frugal-baseline`, `docs-hygiene-baseline`, `wave-gate-baseline`. Se o ratchet apanhar o teu lixo, **arruma o lixo** — apanhou-me 3× hoje e das 3 arrumei.
- **Testes verdes antes de qualquer push**, e a trava exige `pass>0` **e** `fail=0` (ausência de checks **não** é verde).
- **`classify.js` FROZEN** sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. Nunca `git add -A`. Nunca `write:true` sem pedido.
- **Cabine viva = browser** (`127.0.0.1:4290/panel`). Sidebar sandboxed **não alcança** o localhost — provado 2×, não perseguir.
- **Um teste que aceita qualquer degrau não testa nenhum.** Foi assim que um TDZ passou 161 testes e rebentou todas as rondas.

## 🚦 GATE — só o Paulo

`abrir PR` · `merge` · `push main` · **`tag`** · `deploy` · `secrets` · `apagar dados`.

**A tag continua bloqueada por ambiguidade real:** `vscode-extension` **0.16.78** · tags `cockpit-v*` pararam em **0.9.2** · `cli` **1.0.0** · `mooter-bridge` **0.1.0** · `version.json` **1.48.0**. **Cinco números para a mesma coisa.** O CC **propõe** um esquema coerente e mostra o impacto de cada opção; o Paulo escolhe. Sem tag, o que está merjado **não chega aos utilizadores**.

---

## 🌀 O WORKFLOW, CONCRETAMENTE

- **Por fase:** `phase()` por etapa, fan-out de um subagente por ficheiro/dimensão, **pipeline** por omissão.
- **Tribunal obrigatório:** cada achado atacado por ≥1 cético que tem de **reproduzir a evidência**. Não reproduziu → achado morto. Hoje isto matou 6 de 10.
- **Perspetivas diferentes**, não redundantes: correção · segurança · "reproduz?" · "piora outra coisa?".
- **Sem tectos silenciosos:** se limitares cobertura, `log()` o que ficou de fora.
- **Fable orquestra;** o trabalho pesado vai para o modelo escolhido.

## 🔜 ORDEM

`B6 + B8` (restaura sinal) → `B7` (prende o comportamento certo em CI) → `B1 + B2 + B3` (generalização) → `B5 ii/iii` (produto) → merge → **tag (gate)**.

> **Porquê esta ordem:** *primeiro fazer o motor achar alguma coisa útil num repo; depois deixá-lo apontar para muitos.* Generalizar um motor que hoje produz **0 achados em 113 rondas** só multiplica o problema por N projetos. E prender em CI antes de corrigir o comportamento fixa o comportamento errado.

## ↩ FECHO

Recibo de 7 blocos — **objetivo · o que mediu · o que propôs · o que NÃO verificou · custo · duração · próximo** — mais `mooter_setup({sessao:'registar', decisoes:[...]})`. ≤3 ações, ≤1 pergunta.

---

**A frase que o CC deve levar:** *o motor corre a $0 e está provado; o ciclo de valor continua aberto. Fechá-lo é um achado nascer, ser julgado, virar diff, passar o gauntlet e parar à porta do PR — com o Paulo a decidir. Antes disso, tudo o resto é movimento.*
