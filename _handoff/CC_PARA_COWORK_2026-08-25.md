# ⇄ CC → COWORK · 2026-08-25

> **Régua:** cada número tem fonte. Onde não foi medido, diz `n/d`.
> **Este ficheiro não repete o que já está registado** — aponta. O `AGENTS.md` é
> explícito: *"referencia contexto, não o despejes."*

## 🎯 A ÚNICA COISA

**Não é executar.** É **refutar** cinco decisões tomadas hoje por quem as tomou sozinho.

O CC executou tudo o que estava do seu lado da fronteira. O que sobra divide-se em
duas pilhas: **gestos do dono** (3, indelegáveis) e **desenho por confrontar** (5,
que é o teu trabalho).

---

## STATE

```
main            13b5c027
mergeados hoje  #403 #404 #405 #407
abertos (CC)    #408 (bump v1.50.0) · #409 (regras do Retomar)
tag v1.50.0     NÃO existe
```

**Provenance:** o trabalho passou por **quatro** worktrees (`frugal-detector-lease`,
`frugal-retomar`, `frugal-salvar`, `frugal-v150`), todos já mergeados. O
`handoff:preflight` foi corrido e **produziria um handoff falso**: reporta
`~/frugal @77cc92bc` com 706 uncommitted, que é o checkout principal, 19 commits
atrás e cheio de `.tmp/`. A ferramenta assume **um** worktree. **É um achado sobre
a ferramenta, e está por corrigir.**

---

## O QUE JÁ ESTÁ REGISTADO — lê antes de perguntar

| onde | o quê |
|---|---|
| `LOOP.md` (2 entradas) | as duas medições do juiz, a hipótese refutada, o erro de instrumento |
| `SYNC.md` | a sessão, com gate |
| `_handoff/TASKS_2026-08-25_INVENTARIO_E_ORDEM.md` | **17 tarefas** com facto medido e portão numérico |
| vault `30-learnings/agent-sync/mooter/…` | 2 recibos com `integrity_sha256` |
| ledger da frota | 2 eventos duráveis (`outcome` + `decision`) |

---

## O QUE FOI FEITO — com o número, não com o adjectivo

**Medições contra 57 etiquetas de verdade conhecida** (36 reais / 21 falsos):

| forma da pergunta ao juiz | acordo | fora do contrato |
|---|---|---|
| **JULGAR** — o contrato em produção | **52,6%** | 0/57 |
| **COMPARAR** — hipótese do CC | **25,9%** | 3/57 |

Das 20 vezes que disse *"encontrei a linha que explica"*, **as 20 eram defeitos
reais**. Zero acertos — sinal invertido, não fraco.

**Em `main`:**
- o detector deixa de ser invisível — 31 apontamentos chegam à fila do painel com
  `origem: detector-deterministico`, sem fingir o carimbo `citacao-ok` do modelo
- Retomar camada 1 — sugestões de retoma no arranque, **1,7 ms** de mediana, $0
- 31 testes que estavam **três semanas fora do git** (`packages/mooter-bridge/`)

**Na máquina do dono:**
- hook Stop cravado estava **24 dias atrasado** (`6a67a56` de 01/08 vs `b1ba052`);
  espelhado → `LOCAL_AGENT_SYNC` de `fail` a `pass`
- `pm2 mooter-fleet` **morto** — 937 MB, **4 achados em 2.653.041 ciclos**, a correr
  um ficheiro ausente do `origin/main`
- Retomar **instalado e a funcionar** no `~/.claude/tools/router/`

---

## ⚠️ TRÊS GESTOS DO DONO — nenhum agente os faz

| # | acção | estado agora | porquê não é delegável |
|---|---|---|---|
| 1 | fechar a porta do Ollama | **ainda exposto** (`netstat` conta 1) | definição de segurança; e o processo do CC nem tem elevação (`elevado: False`) |
| 2 | revogar o PAT | `n/d` | credenciais |
| 3 | `git tag v1.50.0` | **tag não existe** | publica para fora (`publish-npm`, `publish-cockpit`, `publish-mcpb`) |

**Descoberta que resolve três tentativas falhadas do dono:** matou-se o servidor
Ollama (PID 11840); o tray relançou-o (PID 5032) **em `0.0.0.0` na mesma**, com
`OLLAMA_HOST=127.0.0.1:11434` já definido. **A definição da GUI ganha à variável de
ambiente.** Todas as tentativas anteriores atacaram a camada errada. Script pronto
em `~/fechar-ollama.ps1`, com o diagnóstico lá dentro.

---

## 🔴 O TEU TRABALHO — cinco coisas para refutar

### 1. O cache da regra que a medição proibiu

*"Há N worktrees com trabalho por commitar"* é a regra de maior valor do Retomar —
uma varredura à mão encontrou **14 worktrees** com trabalho pendente e **450
ficheiros** por versionar no checkout principal, que ninguém via.

```
git worktree list   115ms para 80 worktrees
1x git status       102ms
=> a varredura      ~8.223ms   (orçamento: 1,7ms, no arranque de cada sessão)
```

**Está nomeada em comentário em `tools/router/retomar.js` com o número.** Precisa
de cache, e o cache é desenho: **quem escreve · quando expira · o que mostrar
enquanto está frio**. Um cache que mente sobre frescura é pior que nenhum.

### 2. O critério de entrada da camada 2 não é um número

O `_handoff/MP_RETOMAR_2026-08-25.md` diz que a camada 2 (LLM local a extrair
intenção da prosa) *"só entra se bater a camada 1"*. **Isso não é um critério —
é uma frase.** Falta: bater em quê, medido como, sobre que amostra, com que limiar
fixado antes.

**Contexto que pesa:** o vault regista o pré-cálculo local a responder **5 vezes, as
5 mal** — uma leu `350` (nº de PR) como *"350 horas"* — e as 5 contaram como `ok`
porque `ok` significava *"devolveu texto"*.

### 3. As 17 tarefas estão ordenadas por urgência, não por valor

`_handoff/TASKS_2026-08-25_INVENTARIO_E_ORDEM.md`. São coisas diferentes e o
documento assume que coincidem.

**Régua que o próprio CC levou na cara hoje:** o roadmap de 5 passos que ele propôs
foi demolido por contagem contra as cinco experiências —
**Resume 0 · Plan 0 · Route 0 · Watch 1 · Review 0**. Aplica a mesma régua às 17.

### 4. Um teste instável há semanas, e ninguém explicou

`concurrent writers preserve every event and atomic projections`, em
`tools/router/agent-sync-ledger.test.js`. Corrido **5 vezes sem tocar em nada**:
`fail = 2, 2, 2, 2, 3`.

**Não lhe chames flaky.** É um teste sobre **escritores concorrentes num ledger
append-only** — se ele é instável, ou o teste está mal escrito, ou o ledger perde
eventos sob concorrência. A segunda hipótese nunca foi eliminada.

### 5. O ledger não sabe anular, e isso envenena o portão

`tools/router/agent-sync-ledger.js`. Append-only, com `publish-vault --strict`, e
**zero** ocorrências de `supersede|tombstone|retract`.

Dois eventos gravados hoje com `--channel cli` (inválido → normaliza para `unknown`
→ recusado por `validateEvent:459`) fazem o `--strict` falhar **para sempre**. IDs:
`37b42587238e302b` e `9be0455c05fcff8c`.

**Um portão estrito que nunca mais pode passar deixa de ser portão** — passa a
ruído que se aprende a ignorar. E o `record` devia recusar um canal inválido na
escrita, em vez de o normalizar em silêncio e falhar mais tarde na publicação.

---

## O QUE O CC ERROU HOJE — para não voltares a construir em cima disso

1. **Apresentou como descoberta** o que o `runner-core.test.mjs:1432` já dizia desde
   19/08: *"o modelo local não sabe JULGAR, sabe COMPARAR"*
2. **Repetiu "70%"** sobre um repositório que a própria sessão mudou — restam **31**
   apontamentos, não 84 nem 57, e a precisão actual é **`n/d`**
3. **Desenhou uma medição sobre sessões passadas** que não podia funcionar: os factos
   que valem são estado de git **de agora**, não história
4. **Escreveu um teste dependente de plataforma** que partiu o CI (`C:\repo-antigo`
   é absoluto no Windows e relativo em Linux). Corrigiu-o ao nível do **teste**;
   **outra sessão corrigiu a causa no código** (`if (!path.isAbsolute(cwd)) return
   null`) — e essa correcção apanha um bug de produção que o CC não viu: num Mac,
   ler um transcript de Windows **fabricaria** *"estavas em `<repo local>`"* como
   facto **medido**
5. **Comparou grandezas incomensuráveis**: 70% é precisão de um *gerador de
   candidatos*; 52,6% é concordância de um *juiz* com um humano

**E as próprias medições do CC não passam o portão que ele escreveu:** os 70% estão
gravados em `ancora.mjs:200` (`medicao:{84,40,28}`) e derivados por `podeEntrar:336`;
os 52,6% e 25,9% não têm ficheiro, recibo nem commit — e `podeEntrar:326` recusa
*"uma regra sem números, por mais convincente que seja o `porque`"*.

---

## GATES desta sessão

```
runner              840 testes · 838 pass · 0 fail · 2 todo
router             1178 testes · 1171 pass · 6 fail (5 de ambiente + 1 instável)
mooter-bridge      1094 testes · 1093 pass · 0 fail
retomar              14 testes ·   14 pass · 0 fail
classify.js        427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f ✓
LOCAL_AGENT_SYNC   pass
```

## 📋 BACK — o que devolver ao CC

1. Veredicto sobre os 5 pontos acima — **com objecção real, não aprovação**
2. Se algum não sobreviver ao teu ataque, diz **qual e porquê**, e o CC retira-o
3. Ordem revista das 17 tarefas, por valor
4. Decisão sobre a camada 2: o número que a autoriza, ou o abandono dela
