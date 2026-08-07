# VERIFICADOR-0 — veredicto

**Contra o `PRE-REGISTO.md`, commitado em `3ebbb692` antes da primeira chamada e não alterado desde.**

- Data: 2026-08-07 · custo real: **$0** (Ollama local, RTX 4090) · Wh: **n/d** (sem medição)
- 108 juízos: 2 modelos × 18 artefactos × 3 repetições. Tempo de GPU: 130,3 s no total.
- `classify.js` e `_handoff/piloto/` **intocados**.

---

## 1. Veredicto: REPROVADO nos dois modelos

O critério era **accuracy ≥ 90% E consistência ≥ 90%**.

| | accuracy (dom. 2) | consistência 3× | veredicto |
|---|---|---|---|
| `qwen3:30b` | **78,8%** | 100% | **REPROVA** (accuracy) |
| `qwen2.5-coder:14b` | **54,5%** | 19,2% | **REPROVA** (ambos) |

**Aplica-se o caminho pré-registado para este caso:** o gate da cascata terá de ser
**teste-mecânico-primeiro, com LLM só em desempate**. Não é uma opinião sobre modelos locais —
é o que o número obriga.

## 2. O número que interessa mais do que o veredicto

O `qwen3:30b` não ficou "perto". Fez **exactamente o baseline**:

| Métrica | `qwen3:30b` | Baseline "responder sempre S" |
|---|---|---|
| accuracy global | 78,8% | **78,8%** |
| accuracy só nos itens discriminantes | 61,1% | **61,1%** |
| consistência 3× | 100,0% | 100% (trivial) |
| **recall nas falhas** | **0,0%** (0/63) | 0% |

Não é coincidência. **Respondeu "S" a 297 de 297** julgamentos do domínio visual. É uma função
constante. A accuracy de 78,8% e a consistência de 100% não são um verificador quase bom a
precisar de afinação — são a assinatura de um verificador que não está a verificar nada.

**A objecção pré-registada era isto.** Escrevi antes de correr que *"um verificador que nunca
diga 'N' faz 78,8% de accuracy e 0% de recall nas falhas"*. Saiu exactamente esse verificador.
Se o `VEREDICTO.md` reportasse só accuracy e consistência — como o critério pedia — este modelo
apareceria a 11 pontos do alvo, com consistência perfeita, e a conclusão natural seria *"quase
lá, vamos afinar o prompt"*. Estaríamos a afinar uma constante.

## 3. Pior do que ruído: anti-correlacionado

| Domínio | O que lá estava | O que o `qwen3:30b` disse |
|---|---|---|
| 2 · visual (21% de falhas reais) | 63 falhas em 297 rótulos | **nunca sinalizou uma** |
| 1 · código (0 falhas — todos correctos) | 0 falhas em 27 | **inventou 6** (22,2% de falso alarme) |

No domínio onde havia defeitos, não viu nenhum. No domínio onde não havia nenhum, condenou seis.
Um gate assim não é neutro: deixa passar trabalho defeituoso **e** estrangula trabalho bom.

O `qwen2.5-coder:14b` é pior de outra maneira — 54,5% de accuracy (**abaixo** do baseline de
78,8%), consistência de 19,2%, e 74 respostas ilegíveis em 297. Não é conservador; é instável.

## 4. Tabela medida, completa

| Modelo | Domínio | accuracy global | accuracy discriminantes | consistência 3× | recall falhas | precisão falhas | ilegíveis |
|---|---|---|---|---|---|---|---|
| `qwen3:30b` | 2 · visual | 78,8% (234/297) | 61,1% (99/162) | 100,0% (99/99) | 0,0% (0/63) | n/d (0 previstos) | 0 |
| `qwen2.5-coder:14b` | 2 · visual | 54,5% (162/297) | 41,4% (67/162) | 19,2% (19/99) | 8,7% (4/46) | 17,4% (4/23) | 74 |

| Modelo | Domínio 1 (todo-positivo) | concordância | **falso alarme** | consistência 3× | ilegíveis |
|---|---|---|---|---|---|
| `qwen3:30b` | código-com-teste | 77,8% (21/27) | **22,2%** (6/27) | 66,7% (6/9) | 0 |
| `qwen2.5-coder:14b` | código-com-teste | 74,1% (20/27) | **11,1%** (3/27) | 66,7% (6/9) | 4 |

> O domínio 1 é **todo-positivo** (9/9 correctos): não mede accuracy — um "diz sempre S" faz
> 100%. Só mede falso alarme. Declarado no pré-registo, não descoberto agora.

**Escolha entre modelos, por número:** `qwen3:30b` é o menos mau (não produz ilegíveis, é
estável), mas ambos reprovam e nenhum serve para gate. Não há vencedor a promover.

**Custo:** `qwen3:30b` 54 chamadas / 45,9 s / 298 290 tok in / 1 512 tok out.
`qwen2.5-coder:14b` 54 chamadas / 84,4 s / 299 316 tok in / 2 437 tok out. **$0 nos dois** —
GPU do Paulo, nada saiu da máquina. Wh **n/d**: não há medição de energia nesta bancada, e não
se inventa.

## 5. Um defeito do arnês, encontrado e declarado

A primeira passagem deu **0% ao `qwen3:30b` em tudo**, com 297/297 respostas ilegíveis. Não era
o modelo: o `qwen3:30b` é um modelo de raciocínio e, com `format:"json"`, o Ollama manda a
resposta inteira para o campo `thinking` e devolve `response: ""`. A resposta estava lá e estava
certa. Faltava `think: false`.

Se não tivesse investigado, este documento diria *"o qwen3:30b é inutilizável, 0% em tudo"* — e
seria uma medição do meu arnês apresentada como veredicto sobre o modelo. É o mesmo defeito que
matou os braços de controlo da bateria T1 na segunda-feira, na terceira encarnação.

Os juízos inválidos ficam em `juizos-v1-arnes-partido/` com um LEIA-ME. Não foram apagados.
A correcção foi aplicada **aos dois modelos**, para o arnês ser idêntico e a comparação valer.

## 6. Limites deste número

- **n pequeno:** 18 artefactos, duas tarefas. Não é uma régua pública.
- O domínio 2 vem de uma bateria **arquivada como inválida** para comparar braços. Os artefactos
  são reais e o gabarito é mecânico; nada aqui compara braços.
- **4 dos 12 itens do gabarito são heurísticos** (2, 3, 4, 7 dizem-no no próprio texto). Onde o
  verificador discorda do harness, é discordância entre dois instrumentos — mas isso não salva
  o resultado: um verificador que responde sempre "S" não discorda de nada.
- **A temperatura (0,7) não estava no pré-registo.** Escolhi a default típica, porque a
  temperatura 0 tornaria a consistência ~100% por construção e mediria o sampler. Fica dito:
  o pré-registo tinha esse buraco, e a escolha foi minha, a posteriori do documento e a priori
  do resultado.

## 7. O que isto muda na CASCATA-APRENDE

Confirma a forma já acordada e aperta-a com um número:

1. **O gate é mecânico primeiro.** Teste, harness, compilador — o que for determinístico.
   O LLM entra em desempate, nunca como juiz único.
2. **Nunca self-confidence** — já estava decidido, e este spike mostra porquê pelo lado de fora:
   o modelo mais estável dos dois é o que nunca discorda de si próprio *porque nunca varia*.
3. **A rotina semanal de aferição do verificador não é opcional.** Sem ela, um verificador que
   colapsa numa constante passa despercebido: accuracy alta, consistência perfeita, zero valor.
   A métrica que o apanha é **recall na classe minoritária**, e essa tem de estar na régua.
4. Se se quiser voltar a testar um verificador LLM, o corpus tem de ter **negativos suficientes
   e um baseline publicado ao lado** de qualquer número de accuracy.

Nada disto foi implementado. O desenho vive na memória do Cowork.
