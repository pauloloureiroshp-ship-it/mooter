# MP — A/B do Moo Audit: a experiência que é, ao mesmo tempo, a prova e o produto (2026-08-26)

Colar no CC numa sessão fresca no repo frugal. gesto 0: `/rename ab-moo-audit`

Contexto: artifacts **Do Loop ao Produto** e **A Virada do Moo Pilot**. Este MP é a Semana 0 + o experimento da Semana 1 comprimidos, porque produzem o mesmo artefacto.

## PORQUÊ ESTE E NÃO OUTRO

Um A/B do *loop* mediria zero: 0 pilares ativos, 0% dos jobs na GPU local, 28 correções em toda a vida do projeto. **O que tem output hoje é o censo.** E o censo é também o primeiro produto vendável. Logo: uma experiência, três resultados — a prova de que o portão vale, o primeiro ativo comercial, e o número real do índice do harness.

## PRÉ-REGISTO (fixar ANTES de correr; qualquer alteração posterior invalida a corrida)

Escrever `_handoff/AB_MOO_AUDIT_PREREGISTO.md` com o hash do commit, e só depois correr. É a defesa contra o que já aconteceu duas vezes nesta casa: um portão que passa por vacuidade, e um limiar ajustado depois de ver o número.

**Sujeitos — 3 repositórios.** `frugal` + **2 repositórios open source que não são nossos**, com testes, licença permissiva, entre 20k e 200k linhas, em JS/TS. Escolher e fixar por escrito antes de correr. Os dois de fora existem para matar a objeção "só funciona no repo dele".

**Braços — 3.**
| braço | o que corre | custo esperado |
|---|---|---|
| **A · baseline** | Semgrep CE com o conjunto de regras por omissão, saída crua | $0 |
| **B · Mooter** | os mesmos candidatos, filtrados pelo **portão 0** (≥10 reais e ≥30% de precisão por classe, calibrado com amostra de 40) | $0 |
| **C · pago** | um agente de subscrição com o mesmo âmbito e o pedido "encontra defeitos reais neste caminho", **com tokens e custo medidos** | medir |

**Rotulação cega.** 40 achados por braço por repositório, misturados num único ficheiro, **sem indicação do braço**, rotulados `real | falso | nao-sei`. Rotulador primário: o dono. Rotulador secundário: um adversário em motor diferente, sobre a **mesma** amostra, para haver concordância entre rotuladores. Se a concordância entre os dois for inferior a 70%, a amostra não serve e diz-se isso.

**Métricas primárias — declaradas agora:**
1. **precisão** = reais ÷ rotulados
2. **volume entregue ao humano** = quantos achados o braço apresenta
3. **achados reais por hora de atenção humana** ← é esta que decide; combina as duas
4. **custo em dólares** e **tempo de parede**
5. **o código saiu da máquina?** — binário, e é diferencial

**Hipótese e limiar de sucesso, declarados agora:**
> **B tem precisão ≥ 2× a de A, com volume ≤ 1/5 do de A, a custo $0.**
> Se B não bater isto, **o portão não acrescenta valor sobre Semgrep cru e a tese da cunha cai.** Escrever isso no relatório com a mesma clareza com que se escreveria o contrário.

## PERCURSO DO UTILIZADOR (cronometrado, no mesmo PR)

Um agente em motor diferente faz de **utilizador crítico que nunca viu isto**: instalar → apontar a um dos repositórios de fora → obter o relatório. Mede-se: **minutos até ao primeiro relatório útil**, **número de vezes que ficou bloqueado**, e **cada sítio onde teve de adivinhar**. Alvo declarado: **≤ 30 minutos, 0 bloqueios que exijam o dono**. Falhar o alvo é resultado, não vergonha — mas tem de estar no relatório.

## FASES

**F0 — destravar (antes de tudo, 3 PRs pequenos).**
1. Varredura de segredos em **todo o histórico** do git — o repositório é público. Se encontrar alguma coisa, **para tudo e reporta**.
2. `tools/cockpit/runner/indice-do-harness.mjs`, zero-LLM: sete componentes com numerador e denominador visíveis (testes gateados pelo CI 2,0 · medições com recibo de censo 2,0 · vereditos adversariais publicados 1,5 · devices no mesmo sha 1,5 · cobertura de telemetria 1,5 · higiene de PRs abertos 1,0 · limiares derivados de medição 0,5). Publicar no beacon e no `/fleet.json`. Componente que não se consegue medir vale **zero** e diz porquê.
3. Um teste novo fora do script do CI faz o **CI falhar**.
**GATE:** índice publicado com as sete parcelas · 3 devices no mesmo sha · 0 segredos no histórico.

**F1 — adaptadores de produtor (1 PR).** Semgrep, `jscpd` e `knip` como produtores no **mesmo esquema** do detector determinista (`apontamentoDoDetector`), cada um com a sua `origem`. Correm como processo separado, offline, sem enviar nada para fora — e isso é verificado, não assumido. **GATE:** os três produzem para a fila com contagem própria no `/fleet.json`; 0 chamadas de rede durante a corrida (medido).

**F2 — a corrida (1 PR).** Correr os três braços nos três repositórios, gerar a amostra cega, rotular, calcular as cinco métricas. **GATE:** as cinco métricas por braço por repositório, com numerador e denominador; concordância entre rotuladores declarada.

**F3 — o relatório (1 PR).** `_handoff/RESULTADO_AB_MOO_AUDIT.md` com: as tabelas, **uma secção "onde perdemos"** (o que C encontrou e B não), o percurso do utilizador cronometrado, e o índice do harness antes e depois. **A secção dos negativos é obrigatória e não é opcional** — um relatório que só ganha não convence ninguém que já viu um.

## GUARDRAILS
- Pré-registo antes de correr; limiares não se mexem depois de ver os números.
- Nunca remover o `assertLocalEngine`; os produtores correm offline e isso é medido.
- Nada de valor novo entra no repositório público antes da decisão de IP do dono.
- Adversário em motor diferente por PR, com o veredicto **publicado** em comentário.
- Número não medido = `n/d` com o porquê. Nenhum adjetivo no relatório final.
- git é custódia: branch sempre, 1 PR por fase, número colado no PR.

## O QUE ISTO NÃO PROMETE
Não promete que B ganha. Se o Semgrep cru já for bom o suficiente neste tipo de repositório, o portão não tem mercado nesta forma e é melhor sabê-lo em cinco dias do que em cinco meses. Não promete que o percurso de 30 minutos se cumpre à primeira. E não substitui o gate de negócio: **o relatório só vale quando uma pessoa de fora pedir o segundo.**
