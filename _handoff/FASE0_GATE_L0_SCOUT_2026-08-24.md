# FASE 0 — scout de confirmação do gate L0 "dismiss-by-class"

**Veredicto: PARA. O desenho muda.** Dois dos seis factos do masterprompt não
resistem à medição, e a consequência não é cosmética: o gate, construído
exactamente como especificado, suprimiria **0 achados — hoje e no futuro
previsível**, por duas razões independentes.

- **Fonte:** `_handoff/MP_GATE_L0_DISMISS_BY_CLASS_2026-08-24.md` (com a ADENDA G11).
- **Onde:** `desktop-j26409q` · worktree `moo-pilot-f0-reconcile-560df1` ·
  branch `gate-l0/f0-scout` · a partir de `main@071cf58d`.
- **Quando:** 2026-08-24 (hora do dono, America/Sao_Paulo).
- **Dados medidos:** `~/.mooter/runner-ledger.jsonl` (9996 linhas, 0 partidas) e
  `~/.mooter/triagem.jsonl` (1448 linhas, 0 partidas).
- **Regra que se aplica:** a própria FASE 0 do MP — *"Se qualquer uma falhar
  (ex.: assinatura já existir, ou portoes contar por:agente), PÁRA e reporta —
  o desenho muda."*

---

## 1. Resolução da ADENDA G11 — caminho REAPROVEITAR, sem divergência de checkout

A ADENDA manda escolher entre dois caminhos consoante o que o checkout mostre.
O deste PC bate com a ADENDA, não com o corpo original:

| ADENDA diz | Medido aqui | Caminho |
|---|---|---|
| `'instrumento-nao-discrimina'` já está em MOTIVOS | `tools/cockpit/runner/triagem.mjs:61`, dentro do `Object.freeze` aberto em `:40` | ✅ bate |
| `classes-da-fila.mjs` e `voidar-fila.mjs` existem, tracked, com testes | `git ls-files` devolve os 4 ficheiros; `git status` limpo | ✅ bate |

⇒ **Não há dois checkouts divergentes no mundo.** O caminho é **REAPROVEITAR**:
auditar e estender o que existe, nunca reconstruir em paralelo. O item *"+1 linha
em MOTIVOS"* do CÓDIGO NOVO MÍNIMO é confirmadamente **NO-OP**.

---

## 2. As seis asserções, com ficheiro:linha

### FACTO 1 — ✅ CONFIRMADO

`curar(fila,{cap=25})` em `tools/cockpit/runner/autopilot.mjs:299` escolhe todo
achado `low` **com** motivo tipado e emite
`{chave, decisao:'descartado', por:'agente', motivo:s.motivo, nota, recibo}`.
`severidade()` em `autopilot.mjs:103` manda `SEV_INTERNO` (`:31` — `tools/`,
`scripts/`, `_handoff/`, `.test.`, `test`) para `{k:'low', motivo:'trivial'}`, e
o fallback sem claim e não-público também (`:135`). O ruído de tooling **já é
drenado**. Não re-implementar.

### FACTO 2 — ⚠️ CONFIRMADO COM DERIVA, E O HOSPEDEIRO ESTÁ DESLIGADO

`tiqueCurar()` existe em `tools/cockpit/runner/f10-server.mjs:287` (o MP dizia
~250-278) e chama `curar(fila)` em `:307` (o MP dizia ~269). As guardas
fail-closed são reais: `pedido.nivel < 1` em `:291` e `efectivo(pedido.nivel, ps) < 1`
em `:302`. O `decisoes` já está em mão (`:293`) — o "ZERO I/O novo" mantém-se.

**Mas:** `~/.mooter/autopilot.json` = `{"nivel":0,"orcamento":"medio"}`.
O L1 está **desligado**. `tiqueCurar` devolve 0 no primeiro `if`. Coerente com o
ledger: `por_autor.agente = 0` — o `curar()` **nunca correu neste device**.
Um gate pendurado aqui herda a inércia, não só o fail-closed.

### FACTO 3 — ⚠️ CONFIRMADO NA LETRA, REFUTADO NA CONSEQUÊNCIA

`portoes()` (`autopilot.mjs:172`) faz exactamente o que o MP diz:

```js
const doAgente = Number((triagem.por_autor || {}).agente) || 0;        // :185
const triados  = Math.max(0, aceite + descartado + issue - doAgente);  // :186
const precisao = triados ? ((aceite + issue) / triados) * 100 : null;  // :187
```

Subtrai **`agente`, e só `agente`**. Mas as 1448 decisões que existem hoje foram
escritas por `voidar-fila.mjs:104` com **`por:'claude'`** — que `portoes()` **não
subtrai**. Medido agora:

```
triados = 1448 · precisao = 0.0% · alvo: 20 triados a >=70%
```

⇒ A premissa "fechos automáticos nunca poluem o denominador do L2" **é falsa em
produção**. O L2 já está envenenado — por `claude`, não por `agente`. Isto é um
defeito **real e presente**, independente do gate, e não é o que o MP se propõe
resolver.

### FACTO 4 — ❌ REFUTADO NO PONTO QUE IMPORTA

A parte técnica está certa: `chaveDoRecibo` (`triagem.mjs:81`) é estável — os
1695 achados do ledger trazem `r.chave` própria, no formato
`P1.3992e3|tools/router/usage-estimator.js:351-370:789838ed32fb` (pilar, ficheiro,
janela, sha do conteúdo); o ramo instável `ficheiro:janela@ts` nunca é usado.
`porTriar` (`triagem.mjs:173`) exclui chaves decididas.

**Mas os "320 dismiss históricos por:'dono'" não existem.** Contagem crua,
linha a linha, de `~/.mooter/triagem.jsonl`:

```
total linhas: 1448 · partidas: 0
por autor:          {"claude": 1448}
por autor/decisao:  {"claude/descartado": 1448}
motivos:            {"instrumento-nao-discrimina": 1123, "nao-e-um-problema": 325}
janela:             2026-08-22T15:58:11Z → 2026-08-23T14:57:55Z
```

**Zero `dono`. Zero `agente`. Zero `aceite`. Zero `issue`.**
Confirmado também via `contarTriagem()`: `por_autor = {"claude":1448}`.
Procurado e não encontrado: outro `triagem.jsonl` (só existe um — `projectPaths`
em `project.mjs:163` só sai de `~/.mooter` para `projects/<slug>/` em repos
não-canónicos, e essa pasta não existe), cópia em backup ou em `_to_delete`,
versão em git.

### FACTO 5 — ✅ CONFIRMADO NA VERSÃO DA ADENDA (o corpo estava errado)

`MOTIVOS` (`triagem.mjs:40`) tem seis entradas, com
`'instrumento-nao-discrimina'` em `:61`. `registarTriagem` (`:127`) faz throw em
motivo desconhecido (`:136`). Nada a acrescentar.

### FACTO 6 — ✅ EXISTEM (ADENDA), ❌ MAS NÃO SÃO O QUE O MP ASSUME

Os ficheiros existem e os testes passam, mas a auditoria mostra que **nenhuma das
três funções do CÓDIGO NOVO MÍNIMO está lá**:

| A spec do MP pede | O que existe | Distância |
|---|---|---|
| `assinatura(recibo)` → `pilar\|escopo\|forma`, escopo por regex de caminho | `classes-da-fila.mjs:43` devolve **só a forma**, de 7 regex sobre `resultado_resumo`. Sem pilar, sem escopo. | falta o path-scope — exactamente a defesa contra fundir "P2-em-tools" com "P2-em-packages" |
| `classesSuprimiveis(decisoes,{n})` | **não existe** | a construir |
| `planear(fila, suprimiveis, decisoes, {cap})` | `voidar-fila.mjs:56` é `planear(registos,{activos,decisoes})` — anula por **pilar desligado**, não por classe; escreve `por:'claude'` (`:104`) | homónima, semântica diferente. Reusar o nome seria colisão |

A disciplina a herdar é real e boa (`--dry-run` por default, nunca sobrepor
decisão, `PILLAR_IDS` como fonte única).

---

## 3. Baseline medido (os números que o MP manda colar)

```
ledger:  9996 linhas · 0 partidas · 1667 achados únicos
triagem: 1448 chaves decididas · 0 partidas

contarTriagem: achados 1667 · por_triar 219 · aceite 0 · descartado 1448 · issue 0 · sem_motivo 0
por_autor:     {"claude": 1448}
por_motivo:    {"instrumento-nao-discrimina": 1123, "nao-e-um-problema": 325}

L2: triados (sem 'agente') = 1448 · precisao = 0.0% · alvo 20 @ >=70%
```

`precisao = 0.0%` não é um sinal sobre a qualidade dos pilares. É o artefacto do
FACTO 3: 1448 descartes automáticos assinados `claude`, com numerador zero.

---

## 4. Porque é que o gate seria um no-op — duas medições independentes

### (a) A calibração não tem entrada

`classesSuprimiveis()` qualifica uma assinatura SSE
`descartes_dono >= n (=MIN_TRIADOS=20)` **e** `aceites_dono + issues_dono == 0`.
Com **0 decisões `por:'dono'`**, o conjunto qualificado é vazio. O gate da FASE 1
(`FP = 0`) passaria **por vacuidade** — o pior modo de falha possível num portão
de segurança: verde porque não há nada para testar.

### (b) O nicho não tem matéria — e a fonte já está desligada

O MP nomeia o nicho: `claim && !publico` ⇒ `k:'med'`, `motivo:null`, não-público.
Medido sobre o ledger inteiro:

| | n |
|---|---|
| nicho na fila viva por triar | **0** |
| nicho em toda a vida do ledger | **8** |
| destes, produzidos por pilar **ainda activo** | **0** |

Os 8 vieram de **P5 (4)** e **P11 (4)** — ambos **desligados**. Os pilares
activos são apenas **P2 e P3** (`context-pack.mjs:654`), e produziram 461
achados com esta distribuição:

```
P2  ACTIVO     {"low/trivial": 353, "low/nao-e-um-problema": 2}
P3  ACTIVO     {"low/trivial": 108, "low/nao-e-um-problema": 3}
```

**100% `low` com motivo tipado** — isto é, `curar()` drena-os na íntegra.
A fila viva inteira confirma-o: 219 achados por triar (P2 141 · P3 78), dos quais
217 `low/trivial` + 2 `low/nao-e-um-problema`, **0 no nicho**.

Chegadas do nicho por dia: `20/08: 0 · 21/08: 3 · 22/08: 4 · 23/08: 1` — e as duas
fontes estão off desde então. **Taxa futura: 0/dia.**

O limiar do MP é 20 descartes do dono *por assinatura*. O nicho inteiro tem 8
itens de sempre, repartidos por dois pilares mortos. **Nenhuma assinatura pode
chegar a 20.**

---

## 5. O que isto não diz

- **Não** diz que o desenho do gate está errado como desenho. O coador-por-assinatura
  com escopo-por-caminho, calibração offline com FP=0 e apply atrás de dry-run é
  sólido. O que falha é a **premissa factual** sobre este device: não há ground-truth
  do dono, e a classe-alvo não tem massa.
- **Não** diz que os 219 achados na fila são falsos. Não foram lidos. Diz que o
  `curar()` que já existe os fecharia — se o L1 estivesse ligado.
- **Não** promete que resolver isto abre o L2. O L2 exige 20 decisões do dono a
  ≥70% mantidas; isso depende de o dono triar e de os pilares acertarem, não de
  nenhum gate. (Nota de honestidade do próprio MP, mantida.)

---

## 6. O que a medição sugere fazer em vez do gate (por ordem de retorno)

Nenhum destes é executado nesta fase — a FASE 0 pára aqui, por regra.

1. **`portoes()` conta `claude` no denominador** (`autopilot.mjs:185`). É um
   defeito real, presente, de uma linha: o denominador deve subtrair toda decisão
   não-humana, não só `agente`. Hoje o painel diz ao dono *"you keep 0% of what it
   finds"* sobre 1448 decisões que **não foram dele**. Corrigir isto muda um número
   que o dono vê. **Ordem de grandeza maior do que o gate.**
2. **Ligar o L1** (`autopilot.json: nivel 0 → 1`) drena os 219 da fila com o
   código que já existe, a 25/tique. Decisão do dono, não minha.
3. **Só depois** — com o dono a triar uma fila que é só sinal — é que nasce o
   ground-truth `por:'dono'` de que a calibração do gate precisa. O gate é
   **fase 3 desta ordem, não fase 1**.

---

## 7. Custódia

- Fase: **FASE 0 / 4**. As fases 1-3 **não** avançam: o gate numérico desta não
  está verde, e a regra do MP e a instrução do dono são a mesma — *pára e reporta*.
- Testes na baseline: `node --test` sobre `triagem · autopilot · classes-da-fila ·
  voidar-fila` ⇒ **75 pass / 0 fail**.
- Zero código de produção tocado nesta fase (o MP manda: FASE 0 = PR de doc).
- `tools/router/classify.js` não tocado.
- Validação 3-vias: (1) concordância — n/a nesta fase, não há dry-run a comparar;
  (2) fila-só-sinal — n/a, o gate não foi construído; (3) **adversário em motor
  diferente** — ver secção 8.
