# 🔥 MP MASTER — MOOTER · fechar o ciclo de valor · 2026-08-18
**CC em sessão fresca · mooter no talo com a frota inteira · modo workflow**

---

## 🧭 COMO CORRER ISTO

- **Sessão CC nova**, raiz do repo, conector Mooter ligado. Branch base **`feat/f1-runner-canonico`** (`main` já tem tudo o que se segue).
- **Mooter no talo:** `/mooter-model mix` → **moo** (Ollama local · $0) · **cc** (Claude/Fable) · **codex** · **gemini** · **kimi**. Local-primeiro; **Fable orquestra**.
- **Modo workflow:** cada fase = 1 workflow, subagentes em paralelo (um por dimensão/ficheiro/achado), **verificação adversarial obrigatória** antes de dar por feito.
- **Duas economias:** o **BUILD** (executar este MP) usa a frota, tokens OK. O **RUNNER entregue** é **$0 DURO** (só `127.0.0.1:11434`). Se gastar 1 token de subscrição, é bug — PÁRA e reporta.

---

## 📜 AS SETE LIÇÕES DESTA SESSÃO (não repetir os erros)

1. **Contar ≠ ler.** Reportei "a GPU trabalhou a noite toda, $0" contando 2699 recibos sem os ler. 1755 eram `fetch failed` — o Ollama tinha morrido às 23:18. **Volume nunca é prova; só o conteúdo é.**
2. **Forçar um achado produz ruído, não vigilância.** O prompt dizia "escolhe UMA linha e diz porquê". Resultado medido em 860 achados: 27% em `.md`, 14% a citar comentários, ~65% nitpick, **~15% acionáveis**.
3. **O silêncio é o ruído inverso.** Ao corrigir, martelei "SEM ACHADO é a resposta certa" e o modelo ficou **mudo** — 100% SEM ACHADO em produção, falhando bugs óbvios. **Só um canário com bugs plantados revelou isso.**
4. **Concordância entre LLMs ≠ correção** (ρ 0.20–0.59). Modelos erram juntos por viés partilhado. Confiança vem de **ground-truth** (repro, teste, analisador), nunca de votos.
5. **LLM é mau detetor primário, bom juiz.** A âncora estática deteta; o moo julga. Inverter isto foi a causa raiz de tudo.
6. **O poço seca.** Análise estática sobre repo parado dá conjunto **finito**. Depois de julgado, moer 24/7 é movimento, não progresso. Só o **diff** dá trabalho infinito.
7. **O erro engolido esconde-se no próprio caçador.** `readChangedLines` corria `git diff` sem `maxBuffer`; 52k linhas → `ENOBUFS`; o `catch` mudo devolvia `[]`. **O modo diff nunca disparou desde que foi entregue e nada o disse.**

> **Regra que resume tudo:** *evidência-ou-`n/d`*. Medir antes de afirmar. Reportar a falha em vez de a calar. Nunca levantar uma guarda para acomodar o próprio lixo.

---

## ✅ O QUE JÁ ESTÁ FEITO (herdar, não refazer)

| Peça | Estado |
|---|---|
| PRs #268/#269/#270/#271/#272 | **merjados na `main`** |
| Motor | runner $0 non-stop · F10 `:4290` (`/fleet.json`, `POST /play\|/stop\|/focus`) · GPU via `ioreg` |
| Guardas | LaunchAgent `ai.mooter.ollama-watchdog` (120s) + `ai.mooter.nosleep` |
| Cabine | **browser** `127.0.0.1:4290/panel`, abre sozinha ao arrancar o motor |
| Sidebar-vivo | **impossível — provado 2×.** Sandbox não alcança `127.0.0.1`. Não perseguir. |
| Escada de contexto | `DIFF → ÂNCORA → CAÇA`, degrada sozinha |
| Âncora estática | `tools/ancora` (eslint 9 + plugin security), afinada 3× pelo veredicto do moo |
| Escalada $0 | `negacaoDensa()` + aviso dirigido + 2º parecer de modelo local de **linhagem diferente** |
| Fixes reais entregues | CORS wildcard · `{pattern}` esmagado · glyph duplicado · ENOBUFS |
| Canários | `tools/ops/moo/CANARIO-DIFF.command` e `CANARIO-ESCALADA.command` |
| Testes | `npm run test:cockpit-runner` — **157 verdes** |
| `classify.js` | **FROZEN** sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` |

---

## 🎯 O QUE FALTA — as fases

### **F1 · PROVAR QUE O MODO DIFF PRODUZ (P0, começa aqui)**
O `ENOBUFS` foi corrigido hoje (`ea65737d`), mas **nunca vimos o modo diff a produzir em regime**. Antes de tudo:
- correr ≥100 rondas e **medir**: % em modo `diff` · % `SEM ACHADO` · % achado real · % falso positivo;
- **critério de aceitação: ≥30% das rondas em modo diff com achado acionável, 0% a citar comentário.** Se não bater, o problema é o prompt ou a janela — arranja antes de avançar;
- o painel passa a mostrar o **modo** de cada ronda (o recibo já leva `modo`).

### **F2 · CANÁRIO NO CI (o teste que ninguém pode apagar)**
O canário mede **2/3 e é flaky** — ontem 3/3, hoje 2/3, mesma condição. Isso não pode viver num `.command` que alguém corre à mão.
- transformar os dois canários em **teste versionado** com N repetições e limiar (ex.: ≥8/10 no off-by-one, ≥6/10 na negação);
- correr no CI **e** no arranque do runner. Uma descida = alerta, não silêncio;
- registar a taxa no ledger para se ver a **deriva do modelo** ao longo do tempo.

### **F3 · EXECUTOR (F-C) — o achado vira PR**
É aqui que o ciclo fecha e o ROI aparece.
- `POST /aplicar` no F10 → cria **worktree isolado** `mooter-wt-fix-<id>`;
- o modelo escolhido escreve o diff sob as regras: **diff mínimo · `classify.js` FROZEN · nunca `git add -A` · evidência-ou-`n/d`**;
- **gauntlet** verifica (testes + ratchet + higiene + "isto piora algo?"). Falha → escala tier;
- FSM por achado: `draft→applied→verified→pr→merged→deployed`, recibo em cada transição;
- **`abrir PR`, `merge` e `deploy` = gate do Paulo.** A autonomia vai até à porta e pára com o diff à frente.

### **F4 · CARD ACIONÁVEL + DROPDOWN DE LLM**
- cada achado no painel ganha: classe (🔴risco/🟢oportunidade), confiança, **origem** (âncora/diff), e os botões **[Verificar] [Aplicar] [Abrir PR] [Descartar]**;
- **selector de modelo por ação** com **custo estimado à frente**: T0 moo $0 · T1 Haiku · T2 Sonnet · T3 Opus · T5 Fable · codex/gemini/kimi;
- em modo snapshot os botões ficam desabilitados **com o porquê no tooltip**. Nunca simular.

### **F5 · ROI METER (a tese em números do Paulo)**
Hoje `mooter_fleet` devolve todos os totais `null` — a poupança nunca foi medida.
- instrumentar: por tarefa, o que T0 fez e **o que teria custado em T3**;
- topo do painel passa de "5274 recibos" para **fixes-que-passam-o-check · $ poupado · risco fechado**;
- `mooter_journal` regista cada fix e a poupança. **Utilização de GPU não é ROI; fixes que passam o check é que são.**

### **F6 · HIGIENE ESTRUTURAL (decisão do Paulo, preparação do CC)**
Medido hoje: a `main` tem **339 ficheiros versionados em `_handoff/`** contra baseline 312, e **129 scripts operacionais** (`.ps1/.js/.bat`) no topo que o linter sinaliza.
- o CC **propõe** o plano (o que é ativo, o que é arquivo, que subpastas), **não executa** a arrumação grande;
- o Paulo decide; depois o CC executa e **baixa a baseline** (nunca sobe).

### **F7 · 4090 NA FROTA** *(❄️ pausado por decisão do Paulo — não começar sem ele pedir)*
Replica runner+beacon+F10 no Windows. **Mac tria; 4090 conserta os pesados (30B).** Implementer e reviewer de **linhagens diferentes**, reviewer read-only, cap de 2 rondas.

---

## 🚦 GATE — só o Paulo (nunca o CC, nunca eu)

`abrir PR` · `merge` · `push main` · **`tag`** · `deploy` · `secrets` · `apagar dados` · trocar modelo residente.

**Sobre a TAG, com os números medidos hoje:**

| Onde | Versão |
|---|---|
| `packages/vscode-extension` | **0.16.78** |
| tags `cockpit-v*` | pararam em **0.9.2** |
| `packages/cli` | 1.0.0 |
| `packages/mooter-bridge` | 0.1.0 |
| `landing/app/version.json` | **1.48.0** (o número que o painel mostra) |

**Cinco números para a mesma coisa. Publicar assim não é deploy seguro.** O CC deve **propor** um esquema de versionamento coerente e mostrar o impacto de cada opção; **o Paulo escolhe**; só depois se cria a tag. Sem tag, o que está merjado **não chega aos utilizadores**.

---

## 🛡 GUARDA / DOUTRINA

- Runner entregue = **$0 duro** (só Ollama). `assertLocalEngine` + `redirect:'error'` em **todos** os pedidos, incluindo o 2º parecer.
- **Evidência-ou-`n/d`.** Citação sem grep morre. Contar não é ler.
- **Nunca engolir erro em silêncio** — se o `catch` devolve vazio, tem de **reportar** que rebentou. Foi assim que o modo diff ficou morto sem ninguém saber.
- **Guardas só descem.** `frugal-baseline`, `docs-hygiene-baseline`, `wave-gate-baseline`: subir exige decisão humana explícita. Se o ratchet apanhar o teu lixo, **arruma o lixo**.
- **Nunca `git add -A`.** Nunca `write:true` sem pedido. `classify.js` **FROZEN**.
- **Testes verdes antes de qualquer push** — e a trava exige `pass>0` **e** `fail=0` (ausência de checks **não** é verde; aprendi isso da forma difícil).
- **Git de escrita corre nativo**, nunca pela VM (deixa `index.lock` órfão que a VM não apaga).
- **Cabine viva = browser.** Sidebar = snapshot honesto com pill de modo. Offline/stale = honesto, **nunca verde-falso**.

---

## 🌀 O ESTILO WORKFLOW

- Cada fase: `Workflow` com `phase()` por etapa; **fan-out** de um subagente por achado/dimensão; **pipeline** por omissão (sem barreira entre etapas).
- **Verify adversarial obrigatório:** por cada fix proposto, ≥2 subagentes tentam **refutar**. Sobrevive o que a maioria não refuta.
- **Perspetivas diferentes, não redundantes:** correção · segurança · "isto reproduz?" · "isto piora outra coisa?".
- **Loop-until-dry** na triagem: repete até 2 rondas sem achado novo confirmado.
- **Fable orquestra;** o trabalho pesado vai para o modelo escolhido, independentemente do modelo da sessão.
- **Sem tectos silenciosos:** se limitares cobertura (top-N, amostragem), **`log()` o que ficou de fora**.

---

## 🔜 ORDEM

`F1 (provar o diff) → F2 (canário no CI) → F3 (executor) → F4 (card+dropdown)` — este quarteto entrega o primeiro fix que nasce, é julgado e chega à porta do PR sozinho.
Depois `F5 (ROI)` e `F6 (proposta de higiene)`. `F7` só quando o Paulo desbloquear.

## ↩ FECHO

Recibo de 7 blocos — **objetivo · o que mediu · o que propôs · o que NÃO verificou · custo · duração · próximo** — mais `mooter_setup({sessao:'registar', decisoes:[...]})` com o routing de cada prompt. ≤3 ações, ≤1 pergunta.

---

**A frase que o CC deve levar:** *o motor está provado, o ciclo está aberto. Fechá-lo é fazer um achado nascer, ser julgado, virar diff, passar o gauntlet e parar à porta do PR — com o Paulo a decidir. Tudo o resto é movimento.*
