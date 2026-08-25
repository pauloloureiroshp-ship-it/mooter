# Achados pós-restart — a v1.18.0 provou-se, e dois bugs apareceram
**Data:** 2026-07-27 · **Conector:** v1.18.0 (verificado ao vivo após reinício do Desktop)

## 1. A M1.5 funcionou — com prova no scorecard real

| Métrica | Antes (v1.17) | Depois (v1.18) | Nota |
|---|---:|---:|---|
| Taxa de falha | 26,58% ❌ fora | **17,14% ✅ dentro** | passou a contar só `falhou` sobre (`entregue`+`falhou`) |
| Taxa de interrupção | não existia | **9,09%** | 7/77 desfechos foram interrompidos — dono MEO |
| Interrupções/dia | não existia | **0** (faixa [0,1]) | o critério de sucesso do M2 passou a ser medido |
| Custo por tarefa | US$ 0,4826 | **US$ 0,2811** | 47/58 entregas com custo reportado |
| Excepções abertas | 2 | **1** | só `trabalho_zero_pct` (36,71%, dono MOO) |

A previsão feita antes do reinício ("deve cair ~6 pontos") verificou-se: caiu **9,4**.

---

## 2. 🔴 BUG — o `moo` responde a pedidos de execução sem executar nada

**Reproduzido:** `mooter_work({agent:'moo', goal:"Corre o comando \`node board.test.js\` e diz quantos testes passaram"})`.

- `comandos_corridos: null` · `aviso_fabricacao: null`
- Resposta do moo: **"Testes Passaram: 14 · Testes Falharam: 0"**
- O valor real É 14 — mas por **coincidência**: ele leu `board.test.js` (12 747 chars injectados),
  contou as chamadas `test(` e assumiu que todas passam. **Se uma falhasse, teria dito 0 falhas na
  mesma.**

**Porque é grave:** é uma resposta plausível, não verificada, que acerta às vezes — a definição
exacta do que este produto promete não fazer. O guard A4 não cobre este caso: ele protege contra
*fabricação de evidência*, mas não contra *o tier local aceitar um pedido de execução que não pode
cumprir*.

**Correcção proposta:** se o `goal` pede execução (`corre`, `executa`, `run`, `npm test`, crase com
comando) **e** o motor escolhido não tem ferramentas de execução, o conector deve **recusar o
despacho** com "este motor não executa comandos — usa `cc` ou `codex`", ou reencaminhar
automaticamente. Nunca deixar responder. Dono: **MRO** (é honestidade), com o MOO a concordar.

---

## 3. 🔴 BUG — o tecto de tier da quota não é aplicado no caminho mais comum

**Reproduzido no mesmo teste:** job com `tier_pedido: T0` → local recusado → foi para a nuvem com
`model: "opus"`, `tier_motor: T3` — **enquanto a calibragem dizia `tecto: "sonnet"`**. Custou
**US$ 0,81** num job que devia ter custado uma fracção disso.

**Causa provável (`seamless.js:2022-2034`):** o bloco do tecto só corre `if (… && model)`, e neste
caminho o `model` ainda é `null` nesse ponto (`routed_by: 'cli-default'` prova-o — a variável
estava vazia). O modelo cloud é resolvido **depois**, já fora do alcance do tecto.

**Consequência:** o veto do MFO — que é o único mecanismo que protege a quota — está a ser
contornado precisamente no fluxo mais frequente (classificado T0, recusado localmente, despachado
para a nuvem).

**Correcção proposta:** aplicar o tecto **depois** de o modelo final estar resolvido (ou reaplicar
imediatamente antes do spawn), com um teste que falhe se um job sair acima do tecto declarado.
Dono: **MFO**. É a primeira excepção legítima a escalar ao MEO — porque envolve dinheiro.

---

## 4. Resposta à pergunta "dá para correr os testes sempre pelo Mooter?"

**Sim, com o motor certo — e a diferença não é de opinião, é de capacidade.**

| Motor | Corre comandos? | Prova |
|---|---|---|
| `moo` (local, $0) | ❌ **não** | `permissoes_efectivas: []` · "o moo corre via /api/chat e não recebe ferramentas" |
| `cc` (Claude Code) | ✅ sim | correu as 3 suites e colou a saída literal do node |
| `codex` | ✅ sim | correu suites em todas as ondas desta sessão |

Verificado agora com `cc` (`allowedTools: "Read,Glob,Grep,Bash"`), 26 s:
`board 14/14` · `aprender 13/13` · `seamless 13/13` — saída literal, três comandos, zero ficheiros
tocados.

**O que continua a precisar de runner nativo:** o **git** (add/commit/push). Não por capricho — o
mount não consegue escrever dentro do `.git`, e já perdemos trabalho por isso. Testes pelo Mooter,
git pelo runner.

**Regra prática:** pedir testes ao `cc`/`codex` com a instrução *"cola a saída literal; nunca
deduzas o resultado a partir do código-fonte"* — foi essa frase que separou a resposta verificada
da resposta inventada neste mesmo teste.
