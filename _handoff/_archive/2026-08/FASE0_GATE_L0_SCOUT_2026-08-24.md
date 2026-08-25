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
activos são apenas **P2 e P3** (`context-pack.mjs:654`), e produziram
**466 achados únicos / 494 ocorrências**, com esta distribuição por chave única:

```
P2  ACTIVO     {"low/trivial": 353, "low/nao-e-um-problema": 2}   = 355
P3  ACTIVO     {"low/trivial": 108, "low/nao-e-um-problema": 3}   = 111
                                                          total    466
```

**100% `low` com motivo tipado** — isto é, `curar()` drena-os na íntegra.
A fila viva confirma-o, e vale a pena separar as duas métricas porque elas **não
são iguais** (ver §4c):

```
porTriar(receipts, decisoes, sem limite)  →  232 ENTRADAS
chaves únicas nessas entradas             →  219
contarTriagem().por_triar                 →  219
severidade sobre as 232 entradas          →  {low/trivial: 230, low/nao-e-um-problema: 2}
curar(fila, {cap: Infinity})              →  232 actos / 219 chaves · NÃO fechados: 0
nicho nessas entradas                     →  0
```

Por chave única: 219 (P2 141 · P3 78), 217 `low/trivial` + 2
`low/nao-e-um-problema`. Sob qualquer das duas contagens, o nicho é **0** e
`curar()` é **elegível para 100% da fila**.

**Precisão sobre "drena":** com o `cap = 25` de produção, `curar()` fecha 25 por
chamada, não 232. Os 232 caem em **~10 tiques de 45s ≈ 7,5 minutos** de relógio.
"Drena a fila toda" é verdade no tempo, não numa chamada — e só se o L1 estiver
ligado, que não está (FACTO 2). *Segunda correcção vinda do adversário.*

Chegadas do nicho por dia: `20/08: 0 · 21/08: 3 · 22/08: 4 · 23/08: 1` — e as duas
fontes estão desligadas desde então.

O limiar do MP é 20 descartes do dono *por assinatura*. O nicho inteiro tem 8
itens de sempre, repartidos por dois pilares desligados — **nenhuma assinatura
está sequer perto de 20, e nenhuma pode crescer enquanto as fontes estiverem
off**.

> **Honestidade sobre o tempo verbal** (correcção do adversário): isto mede o
> **snapshot**, não o futuro. "Nunca terá matéria-prima" é uma **projecção**, e
> a projecção é `n/d`. O que está medido é: hoje, 0 na fila; de sempre, 8; das
> fontes vivas, 0. Se P2/P3 mudarem de enunciado, ou se um pilar novo entrar, o
> nicho pode nascer — e então o desenho do MP volta a ser candidato.

### (c) Dois defeitos laterais que a medição apanhou

Nenhum destes é o gate, mas os dois tocam o mesmo aparelho e ficam registados
para não se perderem:

**`porTriar` não deduplica chaves.** `triagem.mjs:173-190` percorre os recibos e
faz `out.push()` sem o `vistos` Set que `contarTriagem` tem em `:197`. Resultado
medido: **232 entradas para 219 chaves únicas — 13 duplicadas**. Consequências:
o painel pode mostrar o mesmo achado duas vezes ao dono, e `curar()` emitiria 13
linhas redundantes no ledger (inofensivas — append-only, última-vence — mas
ruído). *Apanhado pelo adversário (codex), não por mim: a minha primeira leitura
citou 219 como se fosse o output de `porTriar`, quando era a minha própria
contagem deduplicada. Duas métricas diferentes com o mesmo nome.*

**A assinatura em falta faz default para o dono.** `registarTriagem`
(`triagem.mjs:127`) tem `por = 'dono'` como valor por omissão, e `contarTriagem`
(`:209`) faz `const a = d.por || 'dono'`. Ou seja: **quem escrever uma decisão
sem `por` fica contado como o dono.** Hoje é latente — os cinco chamadores
(`f10-server.mjs:308,539`, `voidar-fila.mjs:100`, `fora-do-enunciado.mjs:167`,
`refutado-pela-fonte.mjs:150`) passam `por` explicitamente. Mas torna frágil
qualquer correcção do §6.1 escrita como *lista negra* ("subtrai `agente` e
`claude`"): o correcto é **lista branca** — contar no L2 só o que traz `por`
explicitamente igual a `'dono'`, e exigir `por` sem default.

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
   defeito real, presente: hoje o painel diz ao dono *"you keep 0% of what it
   finds"* sobre 1448 decisões que **não foram dele**. Corrigir isto muda um número
   que o dono vê. **Ordem de grandeza maior do que o gate.**
   Três precisões, todas vindas dos adversários:
   - **Lista branca, não lista negra** (§4c): contar só `por === 'dono'`
     explícito, e tirar o default `por = 'dono'` de `registarTriagem`. Escrito
     como *"subtrai também `claude`"*, o buraco fica aberto ao próximo autor que
     se esqueça do campo.
   - **Um filtro lexical não é proveniência.** `por` é uma string escolhida por
     quem escreve a linha; nada impede um agente de assinar `dono`. A defesa real
     é o **canal de escrita** — só a UI do dono escreve linhas de dono — com a
     assinatura rebaixada a metadado de exibição.
   - **Corrigido, o denominador fica a zero**, e o painel tem de dizer
     **"sem dados"** — nunca 0.0% e nunca 100%. `portoes()` já devolve
     `precisao: null` quando `triados === 0` (`autopilot.mjs:187`); o que falta
     garantir é que a superfície que o dono lê não converta esse `null` num número.
2. **Ligar o L1** (`autopilot.json: nivel 0 → 1`) drena os 219 da fila com o
   código que já existe, a 25/tique (~10 tiques). Decisão do dono, não minha.
   **Com uma condição que o segundo adversário levantou e eu não tinha:
   cegueira por drenagem.** Com a fila vazia, ninguém vê nada — se um pilar
   activo regredir e passar a produzir lixo `low`-com-motivo, o L1 drena-o em
   silêncio e o painel corrigido fica sem denominador para o revelar. Ligar o L1
   deve vir com amostra aleatória de auditoria ao dreno e alarme de anomalia de
   volume, ou troca-se um número falso por uma cegueira.
3. **Só depois** — com o dono a triar uma fila que é só sinal — é que nasce o
   ground-truth `por:'dono'` de que a calibração do gate precisa. O gate é
   **fase 3 desta ordem, não fase 1**.
4. **As 1448 não são material de calibração**, e a razão não é circularidade.
   O ensaio do defeito semeado é ground-truth legítimo (reprovou dois pilares
   próprios — um processo que se auto-valida não se reprova a si mesmo). O defeito
   é de **granularidade**: o ensaio reprovou *pilares*, o script anulou *achados*.
   Um pilar reprovado pode ter tido verdadeiros positivos no histórico; inferir o
   achado a partir do pilar é falácia ecológica. Se algum dia servirem de prior,
   precisam de proveniência própria (`varredura-ensaio`), fora do denominador do
   L2 e fora do gate.

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
  diferente** — feito, duas lentes (`codex`, `kimi-k3`), ver §8. O adversário
  refutou uma das quatro afirmações e corrigiu duas imprecisões; ambas estão
  incorporadas, e as correcções estão atribuídas onde aparecem.

---

## 8. Validação adversarial (motor diferente)

**Adversário: `codex`**, sessão fresca, sandbox só-leitura, instruído a *refutar*,
não a concordar. Mediu com os seus próprios scripts. Resultado: **refutou uma das
quatro afirmações e corrigiu-a em dois pontos.** Ambas as correcções estão
incorporadas acima.

| # | Afirmação | Veredicto do adversário |
|---|---|---|
| A1 | 1448 linhas, zero `por:'dono'` | **CONFIRMADO** — reproduziu `{"linhas":1448,"por":{"claude":1448},"decisao":{"descartado":1448}}` |
| A2 | `portoes()` subtrai só `agente` ⇒ triados=1448, precisão 0.0% | **CONFIRMADO** — `autopilot.mjs:185`, gate fechado |
| A3 | fila = 219, `curar()` drena 100% | **REFUTADO** — `porTriar` sem limite devolve **232** entradas (219 únicas + 13 repetidas); e `curar()` por omissão fecha **25**, não 232 (`cap=25`). A parte qualitativa aguenta: 232/232 são `low` com motivo, nicho vivo 0 |
| A4 | nicho = 8 de sempre, todos de pilares mortos | **CONFIRMADO no snapshot**; o *"nunca terá"* fica **`n/d`** — confirma o estado actual, não prova o futuro |

O que o adversário procurou e **não** encontrou: outro `triagem.jsonl` nas raízes
locais, `_to_delete`, worktrees, `.claude`, `.codex` ou vault; qualquer
`por:"dono"` em `~/.mooter` ou no vault; entrada sem `por` que activasse o
fallback `d.por || 'dono'` (zero). Confirmou que os quatro módulos medidos
mantiveram hashes idênticos durante a auditoria, e não escreveu ficheiros.

**Nota de proveniência:** a worktree onde o adversário corria avançou de
`071cf58d` para `4ea93834` a meio da auditoria — fui eu a commitar a §1-§7 na
mesma pasta em que o job tinha sido realojado. Ele detectou-o sozinho, recusou-se
a congelar os números antigos e re-verificou hashes e JSONL antes de concluir.
Erro de coordenação meu; o resultado sobreviveu porque só mudaram ficheiros
`_handoff/*.md`.

### O `n/d` que fica em aberto

`LOCAL_AGENT_SYNC=fail` e `device_identity: missing` — **outros devices são
`n/d`**. O registo da frota (`00-core/agent-sync-registry.json`) lista um
`mac-mini-codex` activo. Não posso refutar daqui que os "320 dismiss do dono"
existam no ledger DELE.

Mas isso não salva o desenho: `classesSuprimiveis()` lê o `triagem.jsonl`
**local**, e o MP não propõe nenhuma junção entre devices. Mesmo que os 320
existam no Mac, não alimentam este gate. Para a calibração os usar, faltaria uma
peça que o MP não tem — e essa peça mexe em ledgers de duas máquinas, o que é
uma decisão do dono, não uma linha de código.

### Segunda lente: `kimi-k3` (Moonshot) — ataque lógico às recomendações

Motor diferente do meu e do codex, sem ferramentas, alimentado só com os números.
Instruído a partir as recomendações do §6, não a concordar. **Veredicto: a
conclusão aguenta-se nos quatro pontos** — mas endureceu três coisas que eu não
tinha, e todas foram incorporadas no §6:

- **A vacuidade não é risco zero, é risco epistémico.** Um `FP=0` verde por não
  haver nada para testar pode ser citado mais tarde como *"validado"*, e o arnês
  entra ao vivo nunca tendo sido exercido. O estado honesto é
  **"inconclusivo — n=0"**, fail-closed na certificação, com shadow mode antes de
  qualquer enforcement.
- **A minha correcção do §6.1, escrita como filtro lexical, codificava o buraco
  em vez de o fechar** — daí a proveniência por canal de escrita e o
  "sem dados" explícito no denominador zero.
- **Cegueira por drenagem** (§6.2) e **falácia ecológica** nas 1448 (§6.4).

Também refutou um ataque que eu poderia ter comprado: as 1448 **não** são
circulares. Um ensaio de defeito semeado é ground-truth por construção, e este
reprovou dois pilares da própria casa — um processo que se auto-valida não se
reprova a si mesmo. O problema delas é categoria e granularidade, não circularidade.

E fechou o ponto 4 com a aritmética que fecha o caso: mesmo que o dono triasse os
219 à mão, são todos `low`-com-motivo — **a classe do nicho continuaria com 0
descartes**. Manter o L1 desligado não alimenta o gate; só estaciona 219 itens
que o mecanismo existente fecha sozinho. Fila vazia é o estado de **sucesso**
da recomendação 2, não a sua refutação.

### Lente que não correu

- `gemini`: falhou no dispatch (exit 1 em 5s). Verificado que não escreveu nada
  na worktree onde foi realojado.
