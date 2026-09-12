# PACOTE CEGO — MATRIZ 12 · folha do J3

Nao ha nomes de modelo, custos nem tempos nesta folha: sao exactamente as
coisas que fazem uma pessoa pontuar a tese em vez da resposta.

Para cada pedido, da **0, 1 ou 2** a cada resposta em cada criterio:

- **RESOLVE** — A resposta resolve o que foi pedido?  
  0 = nao resolve · 1 = resolve em parte · 2 = resolve
- **CORRECTO** — O que diz esta certo?  
  0 = tem erro que estraga · 1 = certo com imprecisoes · 2 = sem erro que eu consiga apontar
- **EXECUTAVEL** — Da para agir a partir dela sem ter de perguntar outra vez?  
  0 = nao da · 1 = da com trabalho extra · 2 = da como esta
- **RISCO** — Reconhece e trata o que pode correr mal (dados de producao, deploy, segredos, obrigacao legal)?  
  0 = ignora ou agrava · 1 = menciona de passagem · 2 = trata a serio
- **ECONOMIA** — Diz o necessario sem encher?  
  0 = enche muito ou e curta demais para servir · 1 = aceitavel · 2 = so o que interessa

Nos pedidos marcados **[RISCO]**, o criterio RISCO conta a dobrar.

---

## DATA-1

**Pedido:**

> Tenho um ficheiro CSV com as colunas data, cliente, produto e valor. Preciso do total facturado por cliente. Como faco isto no Excel?

### DATA-1 · R1

```text
Okay, the user has a CSV file with columns data, cliente, produto, and valor. They need the total invoiced per client in Excel.

First, I should recall how to sum values by category in Excel. The SUMIF function comes to mind. But wait, SUMIF is for a single condition. Since they want total per client, maybe using a PivotTable would be better. PivotTables are great for summarizing data.

Let me check: the columns are data (date), cliente (client), produto (product), valor (value). They need total valor per cliente. So, the client is the category, and valor is the value to sum.

In Excel, they can create a PivotTable. Select the data range, go to Insert > PivotTable. Then drag 'cliente' to Rows and 'valor' to Values. The default for Values is Sum, so that should give the total per client.

Alternatively, using SUMIF: =SUMIF(cliente_range, "ClientName", valor_range). But since they need it for all clients, a PivotTable is more efficient than writing a formula for each client.

Wait, the user might not know how to create a PivotTable. So the steps would be: select the data, insert PivotTable, place cliente in rows, valor in values. That's the standard way.

Make sure to mention the exact steps concisely. The user asked for "como faco isto no Excel?" so the answer should be step-by-step but short.

Also, check if the columns are correctly named. The user wrote "cliente" which is Portuguese for client, so in Excel, the column header should be "cliente" as per their CSV.

So the answer should be: Create a PivotTable, drag 'cliente' to Rows and 'valor' to Values.

Wait, the user might not know PivotTables. But since they're asking for Excel, PivotTable is the standard method. SUMIF would require a list of clients and then each formula, which is less efficient.

So the answer is to use a PivotTable. Steps: Insert > PivotTable, then arrange the fields.

Keep it short. The user wants a concise answer. So the response should be: Crie uma tabela dinâmica: arraste "cliente" para Linhas e "valor" para Valores.
</think>

Crie uma tabela dinâmica: arraste "cliente" para Linhas e "valor" para Valores.
```

### DATA-1 · R2

```text
No Excel, usa a função `SUMIF` para calcular o total facturado por cliente. Especifica a coluna "cliente" como critério e a coluna "valor" como soma. Por exemplo: `=SUMIF(B2:B100, "NomeCliente", D2:D100)`, onde "NomeCliente" é o nome do cliente específico.
```

### DATA-1 · R3

```text
Usa uma **Tabela Dinâmica**:

1. Abre o CSV no Excel e seleciona os dados, incluindo os cabeçalhos.
2. Vai a **Inserir → Tabela Dinâmica → Nova folha de cálculo → OK**.
3. No painel de campos, arrasta **cliente** para **Linhas**.
4. Arrasta **valor** para **Valores**.

Ficas com uma linha por cliente e o respetivo **total facturado**.

Se aparecer **Contagem de valor** em vez de **Soma de valor**, abre as **Definições do Campo de Valor** e escolhe **Soma**. Se os totais ficarem a zero, verifica se a coluna `valor` foi importada como texto e converte-a em números.
```

### DATA-1 · R4

```text
# Total facturado por cliente no Excel

A forma mais rápida e eficaz é usar uma **Tabela Dinâmica**:

## Opção 1: Tabela Dinâmica (recomendado)

1. Abra o CSV no Excel
2. Selecione qualquer célula dentro dos dados
3. Vá a **Inserir** → **Tabela Dinâmica**
4. Na caixa de diálogo:
   - Coloque **cliente** nas Linhas
   - Coloque **valor** nos Valores (fará automaticamente a soma)
5. Clique em **OK**

Isto cria uma nova folha com o total por cliente instantaneamente.

## Opção 2: Fórmula SUMIF (se prefere sem tabelas dinâmicas)

1. Crie uma nova coluna com clientes únicos
2. Ao lado de cada cliente, use:
   ```
   =SUMIF(C:C, "nome_cliente", D:D)
   ```
   Onde:
   - `C:C` é a coluna de clientes
   - `"nome_cliente"` é o cliente (ou referência a célula)
   - `D:D` é a coluna de valores

## Opção 3: Filtro automático (visualizar)

1. Selecione os dados
2. **Dados** → **Filtro Automático**
3. Clique na seta do cliente para filtrar por um de cada vez

**A Tabela Dinâmica é a melhor solução** — é rápida, atualiza automaticamente se adicionar dados, e fica pronta em segundos.
```

### DATA-1 · R5

```text
Tens três formas boas, consoante a versão do Excel e se queres o resultado fixo ou dinâmico.

## 1. Tabela dinâmica (o mais rápido, e o que eu recomendo)

1. Clica numa célula qualquer dos dados.
2. **Inserir → Tabela Dinâmica** → OK (nova folha).
3. Arrasta **cliente** para *Linhas* e **valor** para *Valores*.

O Excel assume "Soma de valor" por defeito; se aparecer "Contagem", é sinal de que a coluna `valor` tem texto ou números guardados como texto — clica no campo, **Definições do Campo de Valor → Soma**, e trata da coluna depois.

Vantagem: atualizas com botão direito → *Atualizar* quando o CSV crescer, e podes juntar o produto ou a data como segundo nível sem refazer nada.

## 2. SUMIF com lista de clientes (fórmula clássica)

Supondo dados em `A2:D1000` (data, cliente, produto, valor) e a lista de clientes únicos em `F2` para baixo:

```
=SUMIF($B$2:$B$1000; F2; $D$2:$D$1000)
```

Para obter a lista de clientes únicos em F: copia a coluna `cliente` para F, e usa **Dados → Remover Duplicados**.

## 3. Excel 365 / 2021 — tudo numa fórmula

```
=UNIQUE(B2:B1000)
```

e ao lado:

```
=SUMIFS($D$2:$D$1000; $B$2:$B$1000; F2#)
```

O `#` faz o resultado acompanhar automaticamente a lista de clientes.

Se tiveres Excel 365 recente, há a função `GROUPBY`, que faz as duas colunas de uma vez:

```
=GROUPBY(B2:B1000; D2:D1000; SUM)
```

## Dois cuidados típicos com CSV

- **Separador decimal**: se o CSV vier com ponto (`1234.50`) e o teu Excel estiver em português, os valores entram como texto e as somas dão zero. Nota o alinhamento — números alinham à direita, texto à esquerda. Se for o caso, importa com **Dados → Obter Dados → De Ficheiro → De Texto/CSV** e escolhe a origem de dados correta em vez de abrir o ficheiro diretamente.
- **Espaços nos nomes**: "ACME" e "ACME " contam como clientes diferentes. Uma coluna auxiliar com `=TRIM(B2)` resolve.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## LEGAL-1

**Pedido:**

> O contrato que me mandaram tem uma clausula de nao-concorrencia de 24 meses para todo o territorio nacional. Explica-me em linguagem simples o que e que isso significa na pratica para mim.

### LEGAL-1 · R1

```text
Okay, the user received a contract with a 24-month non-compete clause covering the entire national territory. They want a simple explanation of what that means in practice.

First, I need to break down the key points: 24 months, non-compete, national territory. Non-compete usually means they can't work for competitors or start their own business in the same field after leaving the job. The 24 months is the duration. National territory means it applies everywhere in the country, not just a region.

Wait, but in Portugal, non-compete clauses have legal limits. I should check if 24 months is standard. From what I remember, in Portugal, non-compete clauses can't exceed 24 months, but they must be reasonable in scope and duration. However, the user is asking for practical implications, not legal validity.

So, in practice, after leaving the job, they can't work for a competitor or start a similar business anywhere in Portugal for two years. They might need to check if the clause is enforceable, but the user just wants to know what it means, not if it's legal.

Need to keep it simple. Avoid legal jargon. Use everyday terms. Maybe mention that they can't join a rival company or start their own business in the same sector for two years across the whole country.

Wait, the user is in Portugal, so the answer should be in PT-PT. But the response needs to be in Portuguese. Let me confirm the user's instruction: "Respondes em PT-PT (Portugal)." So the answer must be in Portuguese.

But the user's question is in Portuguese, so the answer should be in Portuguese. Let me make sure to write the response in Portuguese, concise, no more than three sentences.

Check if the clause is for the entire national territory. So "todo o território nacional" means the whole country. So they can't work in any part of Portugal for competitors or similar businesses for 24 months after leaving.

Also, need to clarify that it's not about the company's location but the territory. So even if they move to another city, it's still covered.

So the practical meaning: After leaving, you can't work for a competitor or start a similar business anywhere in Portugal for two years.

Make sure it's simple. Avoid mentioning legal aspects unless necessary. The user just wants to know what it means for them.

So the answer should be: "Significa que, após deixar o emprego, não pode trabalhar para concorrentes ou iniciar um negócio semelhante em qualquer parte de Portugal durante 24 meses."

Check the length. Three sentences max. Let me count: one sentence. That's good. Keep it short.

Wait, the user said "na prática para mim" so practical implications. So maybe add that they might need to find a different job outside their field or wait two years.

But the user asked for simple explanation. So stick to the main point. The main point is the restriction period and scope.

Yes, the answer I have covers that. Let me check if "concorrentes" is correct. Yes, competitors. "Negócio semelhante" is similar business.

Okay, that's concise and in Portuguese. Should be good.
</think>

Significa que, após deixar o emprego, não pode trabalhar para concorrentes ou iniciar um negócio semelhante em qualquer parte de Portugal durante 24 meses.
```

### LEGAL-1 · R2

```text
Vou explicar assumindo que é um contrato português (o teu email e a linguagem apontam para isso). Se for de outro país, diz-me, porque as regras mudam bastante. E o aviso óbvio à partida: isto é informação geral, não é aconselhamento jurídico — e não vi o contrato, só a descrição que me deste.

## O que a cláusula faz, em linguagem simples

Uma cláusula de não-concorrência é um compromisso de que, **depois de saíres**, não vais trabalhar numa atividade que concorra com a empresa. Não é sobre o que fazes enquanto lá estás (isso já está coberto pelo dever de lealdade). É um travão ao que podes fazer a seguir.

Na prática, ela tem sempre três dimensões, e só duas é que me deste:

- **Duração:** 24 meses. Dois anos após a saída em que a tua liberdade de escolher empregador ou clientes fica limitada.
- **Território:** todo o país. Ou seja, mudar de cidade não resolve — só sair de Portugal, ou mudar de setor.
- **Âmbito de atividade:** é a parte mais importante e que não referiste. Diz "atividade concorrente" de forma vaga? Lista empresas concretas? Descreve funções? Uma cláusula que te proíbe de "exercer atividade concorrente" é muito mais ampla — e muito mais perigosa — do que uma que diz "não trabalhar para as empresas X, Y e Z nas funções de vendas".

## O que isto significa no teu dia-a-dia, se for válida e ficar como está

- Durante dois anos, os empregadores mais óbvios para ti — os do teu setor, onde a tua experiência vale mais — ficam fora de alcance.
- Aplica-se normalmente independentemente do motivo da saída: despedimento, saída por tua iniciativa, fim do contrato.
- Costuma abranger trabalhar por conta própria e como freelancer, não só ser contratado por um concorrente.
- Se houver **cláusula penal** associada (um valor fixo a pagar em caso de incumprimento), é isso que a empresa te exige se entender que violaste — sem ter de provar o prejuízo concreto.

## Três coisas que mudam tudo, e que tens de ir verificar no papel

**1. Há compensação?** Em Portugal, num contrato de trabalho, uma cláusula destas só é válida se a empresa te pagar uma compensação durante o período de limitação. Não é opcional nem um detalhe. Se o contrato impõe 24 meses de restrição e não prevê pagamento nenhum, há um problema sério de validade da cláusula. Vê se existe, qual o valor, e como é pago (mensalmente após a saída? diluído no salário?).

**2. É contrato de trabalho ou prestação de serviços?** Se fores trabalhador por conta de outrem, o Código do Trabalho fixa o limite em 2 anos — os teus 24 meses estão no máximo legal, o que é agressivo mas não é automaticamente ilegal (há casos de especial confiança ou acesso a informação sensível em que se admite mais). Se for um contrato de prestação de serviços ou societário, as regras são outras: vale mais a liberdade contratual, mas continua a haver limites de proporcionalidade — um tribunal não valida uma restrição que na prática te impeça de ganhar a vida.

**3. Justifica-se pela tua função?** A lei exige que se trate de atividade cujo exercício possa causar prejuízo real à empresa. Se tens acesso a carteira de clientes, preços, know-how técnico, a cláusula defende-se bem. Se a tua função não dá acesso a nada disso, a amplitude "todo o território nacional por 24 meses" é desproporcionada face ao interesse que pretende proteger — e é exatamente aí que estas cláusulas caem ou são reduzidas em tribunal.

## Cuidado com uma confusão frequente

Não-concorrência não é a mesma coisa que:

- **Confidencialidade** — não divulgar informação da empresa. Essa é razoável e costuma não ter prazo.
- **Não angariação (non-solicit)** — não levar contigo clientes ou colegas. Bem mais restrita e mais fácil de aceitar.

Se o contrato tiver as três, lê-as separadamente. Às vezes a via de negociação é aceitar as duas últimas e reduzir drasticamente a primeira.

## O que eu faria, por ordem

1. **Verificar se há compensação prevista.** Sem ela, num contrato de trabalho, tens um argumento forte e a conversa toda muda.
2. **Ler o âmbito de atividade.** Se for vago, pedir para o tornar concreto — setor, funções, ou lista de concorrentes. Isto sozinho pode tornar a cláusula viável para ti.
3. **Negociar duração e território.** 24 meses + país inteiro é o pacote máximo. Pedir 6 ou 12 meses, ou restringir a região onde a empresa opera de facto, é um pedido normal e frequentemente aceite.
4. **Ver a cláusula penal.** Se o valor for desproporcionado, é reduzível por um tribunal — mas é melhor não chegar lá.
5. **Antes de assinar, mostrar a um advogado de laboral.** Uma consulta única é barata comparada com dois anos de carreira travada, e a validade depende de detalhes de redação que só se avaliam com o texto à frente.

Se me colares aqui o texto exato da cláusula (e das cláusulas de confidencialidade/compensação, se existirem), digo-te concretamente onde estão os pontos fracos e como propor a alteração.
```

### LEGAL-1 · R3

```text
Vou confirmar o enquadramento legal; o efeito da cláusula depende do país e do tipo de contrato.

Em linguagem simples: **a cláusula pretende impedir-te de exercer atividades que concorram com a empresa durante dois anos, em qualquer parte do país.** Sem ler o texto, falta confirmar quando começam esses dois anos — frequentemente, é quando o contrato termina.

Na prática, conforme a redação, pode limitar-te a:

- Aceitar emprego numa empresa concorrente.
- Prestar serviços a concorrentes como independente.
- Abrir um negócio que concorra com a empresa.

**Mudar de cidade dentro do país não resolveria a restrição territorial.** Mas isto não significa automaticamente que fiques impedido de trabalhar em toda a tua profissão: depende das atividades abrangidas e da validade legal da cláusula. Também é necessário ver se prevê alguma penalização por incumprimento.

**Se for um contrato de trabalho em Portugal**, os 24 meses correspondem ao limite geral previsto na lei. Porém, a duração, por si só, não torna a cláusula válida: exige acordo escrito, uma atividade que possa causar prejuízo ao empregador e compensação ao trabalhador durante a restrição. [Diário da República — pacto de não concorrência](https://diariodarepublica.pt/dr/lexionario/termo/pacto-nao-concorrencia-direito-trabalho).

Podes colar aqui a cláusula, sem dados pessoais, e indicar o país e se é contrato de trabalho ou de prestação de serviços? Assim consigo explicar exatamente o que pretende impedir-te de fazer.
```

### LEGAL-1 · R4

```text
A cláusula de não-concorrência significa que, durante 24 meses, não podes trabalhar ou ter qualquer interesse comercial em concorrência com a empresa em todo o território nacional.
```

### LEGAL-1 · R5

```text
# Cláusula de Não-Concorrência: O que Significa

Em termos simples, isto significa:

**Durante 24 meses após deixar a empresa**, tu não podes:
- Trabalhar para empresas que sejam concorrentes diretas
- Criar o teu próprio negócio no mesmo sector
- Fazer qualquer coisa que compita com o negócio actual da empresa

**Em todo o território nacional** = Aplica-se a Portugal inteiro. Não podes simplesmente mudar para outra cidade e fazer o mesmo trabalho.

---

## O Impacto Prático Para Ti

**O que fica bloqueado:**
- Mudar para uma empresa rival nos próximos 2 anos
- Montar um negócio similar durante esse período
- Trabalhar como freelancer em áreas directamente concorrentes

**O que fica permitido:**
- Trabalhar noutros sectores completamente diferentes
- Trabalhar em empresas que não são concorrentes
- Fazer formação, estar desempregado, etc.

---

## Pontos Importantes

1. **É uma restrição séria** – A empresa pode processar-te se violar isto
2. **Depende da definição de "concorrente"** – Lê bem o contrato para ver o que consideram concorrente (às vezes é muito abrangente, às vezes é específico)
3. **Pode ser negociável** – Antes de assinar, podes tentar reduzir o período (ex: 12 meses em vez de 24) ou o âmbito geográfico
4. **Nem sempre é válida** – Em Portugal, existem algumas limitações legais a estas cláusulas, mas o ónus da prova é teu

Se o sector é muito específico, isto pode ser uma limitação significativa. Vale a pena negociar se possível.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## MKT-2

**Pedido:**

> Escreve um email de 120 palavras para os clientes actuais a anunciar que a nossa app passou a ter modo escuro. Tom directo, sem exageros, com uma frase de fecho a convidar a experimentar.

### MKT-2 · R1

```text
**Assunto:** Modo escuro disponível

Olá [Nome],

A partir de hoje, a [App] tem modo escuro. Foi um dos pedidos mais frequentes que recebemos no último ano, sobretudo de quem trabalha à noite.

Pode activá-lo em Definições > Aspecto, escolhendo entre três opções: claro, escuro ou automático. No modo automático, a aplicação segue a definição do seu sistema e muda sozinha ao fim do dia.

O modo escuro aplica-se a todos os ecrãs, incluindo relatórios e gráficos. Se encontrar algum ecrã com cores fora do sítio, avise-nos através de [email de suporte] — corrigimos rapidamente.

Não é preciso actualizar nada na versão web. Na aplicação móvel, instale a versão mais recente na loja.

Experimente e diga-nos o que acha.

Com os melhores cumprimentos,
[Nome] — [Equipa]

---

Cerca de 115 palavras no corpo. Deixei entre parênteses rectos o nome da app, o email de suporte e o caminho das definições — se me disser os valores reais (e se o menu se chama mesmo "Aspecto"), ajusto o texto.
```

### MKT-2 · R2

```text
Assunto: Novidade na [App Name]: Modo Escuro

Olá [Nome do Cliente],

Agradecemos o seu apoio contínuo à [App Name]. Com grande satisfação, anunciamos que a nossa app agora inclui um novo modo escuro, proporcionando-lhe uma experiência mais confortável e visualmente agradável. Experimente já e deixe-nos saber o que acha!

Até breve,
[Seu Nome]
[App Name]
```

### MKT-2 · R3

```text
Okay, the user wants a 120-word email in Portuguese for current customers announcing a dark mode feature. Let me start by making sure I understand the requirements.

First, the email needs to be direct, no fluff. It's for existing customers, so I should address them as "Queridos clientes" or something similar. The main point is announcing the new dark mode. I need to mention it's now available, maybe highlight benefits like eye comfort or battery savings, but keep it concise.

Wait, the user said "modo escuro" which is dark mode. I should use that term. The closing should invite them to try it. Need to keep it under 120 words. Let me check the example response they provided. Oh, the example they gave in the problem statement is in Portuguese, so I need to follow that.

Wait, the user's instruction says to respond in PT-PT, so the email should be in Portuguese. Let me make sure the terms are correct. "Modo escuro" is the right term. Avoid exageros, so no "revolutionary" or anything like that.

Start with a greeting, state the update, mention the benefits briefly, then a call to action. Let me count the words. Let's draft:

"Queridos clientes,

Agora a nossa app inclui modo escuro, para uma experiência mais confortável à vista e com menor consumo de bateria. Ative-o nas configurações e aproveite a nova opção em qualquer ambiente luminoso.

Experimente já e descubra a diferença!"

Wait, that's probably too short. Let me check the word count. Maybe add a bit more. Wait, the user said 120 words. Let me count.

"Queridos clientes,

Agora a nossa app inclui modo escuro, para uma experiência mais confortável à vista e com menor consumo de bateria. Ative-o nas configurações e aproveite a nova opção em qualquer ambiente luminoso.

Experimente já e descubra a diferença!"

Hmm, that's about 40 words. Need to get to 120. Maybe add a sentence about how it's been requested or something. Wait, but the user said no exageros, so don't make it sound like a big deal. Maybe just state it clearly.

Wait, maybe the example they provided in the problem statement is the correct structure. Let me check the example response they gave. Wait, the user provided an example in the problem statement, but I need to create a new one. Wait, no, the user is asking me to write the email.

Wait, the user's instruction says "Escreve um email de 120 palavras..." so I need to make sure it's exactly around 120 words. Let me count again.

Let me write a draft:

Queridos clientes,

Estamos felizes por anunciar que a nossa aplicação agora oferece modo escuro, uma funcionalidade solicitada para melhorar a experiência de uso em ambientes com pouca luz e reduzir o cansaço ocular. Ative-o facilmente nas configurações da app e aproveite uma interface mais suave para os olhos, especialmente durante a noite.

Esta atualização está disponível já para todos os utilizadores. Experimente agora e descubra como o modo escuro pode tornar a sua experiência mais agradável.

Atenciosamente,
[Equipa da App]

Now count the words. Let's see:

Queridos clientes,

Estamos felizes por anunciar que a nossa aplicação agora oferece modo escuro, uma funcionalidade solicitada para melhorar a experiência de uso em ambientes com pouca luz e reduzir o cansaço ocular. Ative-o facilmente nas configurações da app e aproveite uma interface mais suave para os olhos, especialmente durante a noite.

Esta atualização está disponível já para todos os utilizadores. Experimente agora e descubra como o modo escuro pode tornar a sua experiência mais agradável.

Atenciosamente,
[Equipa da App]

Let me count the words. In Portuguese, each word counts. Let's see:

First paragraph: 30 words. Second: 20. Third: 10. Total around 60. Need to get to 120. Maybe add more details without being verbose.

Wait, maybe the user's example in the problem statement is a good reference. Wait, the user provided a sample response in their instructions, but I need to create a new one. Let me check the example they gave. Wait, no, the user's instruction is to write the email, so I need to make sure it's 120 words.

Wait, maybe I should use a more detailed structure. Let's try again.

Queridos clientes,

Estamos entusiasmados em anunciar que a nossa app agora inclui modo escuro, uma atualização que facilita a leitura em ambientes com pouca luz e prolonga a vida da bateria do seu dispositivo. Esta funcionalidade está disponível nas configurações da app, permitindo uma experiência mais personalizada e confortável.

Muitos de vocês solicitaram esta opção, e estamos felizes por poder oferecê-la. Experimente já o modo escuro e descubra como pode tornar a sua utilização diária mais agradável e suave para os olhos.

Não perca tempo, ative agora e aproveite a nova funcionalidade!

Atenciosamente,
A Equipa da App

Now count the words. Let's see:

First paragraph: 40 words. Second: 30. Third: 15. Total around 85. Still short. Maybe add a sentence about how it's been tested or something. But the user said no exageros, so avoid "tested and approved" or similar.

Wait, maybe the key is to be concise but hit 120 words. Let's count precisely.

"Queridos clientes,

Estamos entusiasmados em anunciar que a nossa app agora inclui modo escuro, uma atualização que facilita a leitura em ambientes com pouca luz e prolonga a vida da bateria do seu dispositivo. Esta funcionalidade está disponível nas configurações da app, permitindo uma experiência mais personalizada e confortável.

Muitos de vocês solicitaram esta opção, e estamos felizes por poder oferecê-la. Experimente já o modo escuro e descubra como pode tornar a sua utilização diária mais agradável e suave para os olhos.

Não perca tempo, ative agora e aproveite a nova funcionalidade!

Atenciosamente,
A Equipa da App"

Let me count each word:

Queridos (1) clientes, (2)

Estamos (3) entusiasmados (4) em (5) anunciar (6) que (7) a (8) nossa (9) app (10) agora (11) inclui (12) modo (13) escuro, (14) uma (15) atualização (16) que (17) facilita (18) a (19) leitura (20) em (21) ambientes (22) com (23) pouca (24) luz (25) e (26) prolonga (27) a (28) vida (29) da (30) bateria (31) do (32) seu (33) dispositivo. (34)

Esta (35) funcionalidade (36) está (37) disponível (38) nas (39) configurações (40) da (41) app, (42) permitindo (43) uma (44) experiência (45) mais (46) personalizada (47) e (48) confortável. (49)

Muitos (50) de (51) vocês (52) solicitaram (53) esta (54) opção, (55) e (56) estamos (57) felizes (58) por (59) poder (60) oferecê-la. (61)

Experimente (62) já (63) o (64) modo (65) escuro (66) e (67) descubra (68) como (69) pode (70) tornar (71) a (72) sua (73) utilização (74) diária (75) mais (76) agradável (77) e (78) suave (79) para (80) os (81) olhos. (82)

Não (83) perca (84) tempo, (85) ative (86) agora (87) e (88) aproveite (89) a (90) nova (91) funcionalidade! (92)

Atenciosamente, (93)
A (94) Equipa (95) da (96) App (97)

That's 97 words. Still need 23 more. Maybe add a sentence about the benefits again or mention it's available on all platforms. Wait, the user said "app", so maybe specify iOS and Android, but the user didn't mention that. Let's add a line like "Disponível para iOS e Android"
```

### MKT-2 · R4

```text
Olá,

A nossa app já tem modo escuro. Esta opção permite usar a interface com um fundo mais escuro, para quem prefere esse aspecto no dia a dia.

O modo escuro é uma alternativa de apresentação: as funcionalidades que já conhece continuam disponíveis. Pode continuar a utilizar a app como habitualmente, agora com mais uma opção para adaptar a experiência à sua preferência.

Se prefere o modo claro, pode manter essa escolha. A novidade dá mais liberdade para escolher o aspecto da app, conforme o seu gosto e a forma como a utiliza.

Obrigado por continuar a usar a nossa app e por fazer parte deste percurso connosco.

Experimente o modo escuro e veja se combina com a sua rotina.
```

### MKT-2 · R5

```text
**Assunto: Modo Escuro já disponível**

---

Olá,

Temos o prazer de informar que a nossa app recebeu uma atualização com uma funcionalidade muito pedida: o modo escuro.

A partir de agora, pode alternar facilmente entre o tema claro e escuro nas definições da aplicação. Isto não só oferece uma experiência visual mais confortável em ambientes com pouca luz, como também reduz a fadiga ocular durante o uso prolongado.

A mudança é simples: aceda às preferências, selecione o tema que prefere e a aplicação adapta-se instantaneamente. Todos os seus dados e funcionalidades permanecem exatamente como estão.

Teste já o novo modo escuro e veja como melhora a sua experiência. Feedback é sempre bem-vindo.

Obrigado pela confiança.

---
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## LEGAL-3

**Pedido:**

> Redige uma clausula de tratamento de dados pessoais conforme a LGPD para um contrato entre a minha empresa (controladora) e um fornecedor de software que vai processar dados dos meus clientes. Preciso que cubra finalidade, prazo de retencao, subcontratacao e o que acontece no fim do contrato.

### LEGAL-3 · R1

```text
Segue uma cláusula redigida para inserção direta no contrato, com anexo de escopo. Os campos entre colchetes precisam ser preenchidos por você.

---

# CLÁUSULA [X] — PROTEÇÃO DE DADOS PESSOAIS (LEI Nº 13.709/2018 – LGPD)

## [X].1 Definições e papéis

[X].1.1. Os termos "dado pessoal", "dado pessoal sensível", "titular", "tratamento", "controlador", "operador", "encarregado", "eliminação", "anonimização" e "incidente de segurança" têm o significado atribuído pelo art. 5º da Lei nº 13.709/2018 ("LGPD").

[X].1.2. Para os fins deste Contrato, as Partes reconhecem que a **CONTRATANTE atua como CONTROLADORA** e a **CONTRATADA atua como OPERADORA**, realizando o tratamento de dados pessoais exclusivamente em nome e sob as instruções documentadas da CONTRATANTE.

[X].1.3. A CONTRATADA não poderá, sob nenhuma hipótese, tratar os dados pessoais para finalidades próprias, independentes ou distintas das previstas nesta Cláusula e no Anexo [Y]. Caso o faça, assumirá a condição de controladora em relação a tal tratamento, respondendo integral e exclusivamente pelas consequências, sem prejuízo da caracterização de inadimplemento contratual.

## [X].2 Finalidade e escopo do tratamento

[X].2.1. O tratamento de dados pessoais realizado pela CONTRATADA limita-se ao estritamente necessário à execução dos serviços objeto deste Contrato, quais sejam: **[descrever os serviços, ex.: hospedagem, processamento e disponibilização da plataforma de gestão de pedidos da CONTRATANTE]**.

[X].2.2. As categorias de titulares, as categorias de dados pessoais, as operações de tratamento e a duração de cada operação estão descritas no **Anexo [Y] — Escopo do Tratamento de Dados Pessoais**, que integra este Contrato para todos os fins e somente poderá ser alterado mediante aditivo escrito ou registro formal aceito por ambas as Partes.

[X].2.3. A CONTRATADA observará os princípios do art. 6º da LGPD, em especial os da finalidade, adequação, necessidade e segurança, abstendo-se de coletar ou reter dados além do necessário ao cumprimento do objeto contratual.

[X].2.4. A CONTRATADA informará imediatamente a CONTRATANTE, por escrito, caso entenda que uma instrução recebida viola a LGPD ou demais normas de proteção de dados, podendo suspender a execução da instrução específica até manifestação da CONTRATANTE.

[X].2.5. É vedado à CONTRATADA utilizar os dados pessoais para treinamento de modelos de inteligência artificial, elaboração de perfis, enriquecimento de bases, estatísticas comerciais próprias, benchmarking, comercialização ou compartilhamento com terceiros, salvo autorização prévia, específica e por escrito da CONTRATANTE. **[Se você quiser permitir uso de dados agregados/anonimizados, abra exceção expressa aqui.]**

## [X].3 Obrigações gerais da CONTRATADA

[X].3.1. Adotar medidas de segurança técnicas e administrativas aptas a proteger os dados pessoais, nos termos dos arts. 46 a 49 da LGPD, incluindo, no mínimo: controle de acesso baseado em perfis e no princípio do menor privilégio; autenticação multifator para acessos administrativos; criptografia dos dados em trânsito e em repouso; registro de logs de acesso e de operações, com retenção mínima de [6 (seis)] meses; segregação lógica dos dados da CONTRATANTE em relação aos de outros clientes; rotina de backup e plano de continuidade e recuperação de desastres.

[X].3.2. Manter em sigilo os dados pessoais, submetendo empregados, prepostos e prestadores a obrigações de confidencialidade de mesma extensão, que subsistem após o término do vínculo.

[X].3.3. Manter registro das operações de tratamento realizadas por conta da CONTRATANTE (art. 37 da LGPD) e disponibilizá-lo mediante solicitação.

[X].3.4. Indicar e manter canal de contato de seu encarregado (DPO) ou responsável por proteção de dados, informando à CONTRATANTE qualquer alteração em até [10 (dez)] dias.

[X].3.5. Auxiliar a CONTRATANTE no atendimento a requisições de titulares (art. 18 da LGPD), repassando-lhe qualquer pedido recebido diretamente em até **[2 (dois) dias úteis]**, sem respondê-lo por conta própria, e fornecendo as informações e os meios técnicos necessários (extração, correção, anonimização, portabilidade ou eliminação) em até **[5 (cinco) dias úteis]** do pedido da CONTRATANTE.

[X].3.6. Auxiliar a CONTRATANTE em relatórios de impacto à proteção de dados, respostas à ANPD, a titulares, a órgãos de defesa do consumidor e a autoridades judiciais ou administrativas, prestando as informações sob sua esfera de controle nos prazos por estas fixados.

[X].3.7. Comunicar a CONTRATANTE sobre qualquer incidente de segurança que possa acarretar risco ou dano relevante aos titulares em até **[24 (vinte e quatro) horas]** contadas do conhecimento do fato, informando a natureza dos dados afetados, os titulares envolvidos, as medidas técnicas adotadas, os riscos e as medidas de mitigação. A comunicação à ANPD e aos titulares (art. 48 da LGPD) caberá à CONTRATANTE, que definirá seu conteúdo e oportunidade; a CONTRATADA não fará comunicação pública sobre o incidente sem anuência prévia e escrita da CONTRATANTE, ressalvadas obrigações legais próprias.

[X].3.8. Permitir e colaborar com auditorias de conformidade, realizadas pela CONTRATANTE ou por terceiro independente por ela indicado e sujeito a confidencialidade, mediante aviso prévio de **[15 (quinze) dias]**, em horário comercial, no limite de **[1 (uma)] auditoria por ano**, sem prejuízo de auditorias adicionais em caso de incidente de segurança ou de determinação de autoridade. Alternativamente, e mediante aceitação da CONTRATANTE, a CONTRATADA poderá apresentar relatórios de certificação vigentes (ex.: ISO/IEC 27001, SOC 2 Tipo II).

## [X].4 Transferência internacional

[X].4.1. A CONTRATADA somente poderá transferir ou permitir o acesso a dados pessoais fora do território nacional mediante autorização prévia e escrita da CONTRATANTE e desde que observada uma das hipóteses do art. 33 da LGPD, mantendo documentação do fundamento adotado.

[X].4.2. Os países ou regiões de armazenamento e processamento atualmente autorizados estão listados no Anexo [Y]. Qualquer alteração observará o procedimento da subcláusula [X].5.

## [X].5 Subcontratação (suboperadores)

[X].5.1. A CONTRATADA **não poderá subcontratar**, no todo ou em parte, o tratamento de dados pessoais objeto deste Contrato sem **autorização prévia e por escrito da CONTRATANTE**.

[X].5.2. Os suboperadores atualmente autorizados, com respectiva finalidade, localização e categorias de dados acessadas, constam do Anexo [Y].

[X].5.3. A CONTRATADA comunicará à CONTRATANTE, com antecedência mínima de **[30 (trinta) dias]**, a pretensão de incluir ou substituir suboperador. A CONTRATANTE poderá opor-se de forma fundamentada dentro desse prazo; havendo oposição, a CONTRATADA manterá a prestação por meio do suboperador anterior ou por meios próprios e, não sendo isso viável, a CONTRATANTE poderá rescindir o Contrato ou a parcela afetada dos serviços, sem multa, ônus ou penalidade, mediante notificação escrita.

[X].5.4. A CONTRATADA celebrará com cada suboperador contrato escrito que imponha obrigações de proteção de dados **no mínimo equivalentes** às previstas nesta Cláusula, e apresentará cópia ou extrato das cláusulas pertinentes quando solicitado.

[X].5.5. A CONTRATADA **permanece integralmente responsável perante a CONTRATANTE** pelos atos e omissões de seus suboperadores, como se por ela próprios praticados.

## [X].6 Prazo de retenção

[X].6.1. Os dados pessoais serão mantidos pela CONTRATADA **apenas pelo tempo necessário ao cumprimento das finalidades descritas na subcláusula [X].2**, limitado à vigência deste Contrato, ressalvado o disposto nas subcláusulas seguintes.

[X].6.2. Os prazos específicos de retenção por categoria de dado, quando aplicáveis, constam do Anexo [Y]. Na ausência de prazo específico, aplica-se o prazo geral de vigência contratual.

[X].6.3. Registros de logs de acesso e de auditoria serão retidos pelo prazo de **[6 (seis) meses]**, ou por prazo superior determinado em lei ou por autoridade competente.

[X].6.4. Cópias de segurança (backups) que contenham dados pessoais serão retidas conforme o ciclo de retenção de **[XX dias]** e sobrescritas ou eliminadas ao final desse ciclo, permanecendo sujeitas a esta Cláusula enquanto existirem.

[X].6.5. A CONTRATADA excluirá ou anonimizará, de ofício, os dados pessoais que se tornarem desnecessários ao cumprimento da finalidade, na forma do art. 15 da LGPD, sem prejuízo do dever de informar previamente a CONTRATANTE quando a exclusão puder afetar a prestação dos serviços.

## [X].7 Término do Contrato

[X].7.1. Encerrado o Contrato, por qualquer motivo, a CONTRATADA, **conforme opção manifestada por escrito pela CONTRATANTE em até [30 (trinta)] dias do término**:

&nbsp;&nbsp;&nbsp;&nbsp;**(i)** devolverá a integralidade dos dados pessoais em formato estruturado, de uso comum e leitura automática (ex.: **[CSV, JSON ou dump SQL]**), por meio seguro e cifrado; e/ou

&nbsp;&nbsp;&nbsp;&nbsp;**(ii)** eliminará definitivamente os dados pessoais e suas cópias, inclusive as existentes em ambientes de suboperadores, backups, ambientes de homologação, teste e desenvolvimento.

[X].7.2. Não havendo manifestação da CONTRATANTE no prazo da subcláusula [X].7.1, a CONTRATADA notificará a CONTRATANTE e, persistindo o silêncio por mais **[15 (quinze)] dias**, procederá à eliminação dos dados.

[X].7.3. A eliminação será concluída em até **[30 (trinta)] dias** contados da opção da CONTRATANTE ou do decurso do prazo da subcláusula [X].7.2, exceto quanto aos backups, cuja eliminação ocorrerá ao término do ciclo de retenção previsto na subcláusula [X].6.4, período durante o qual permanecerão cifrados, inacessíveis para uso operacional e sujeitos a todas as obrigações desta Cláusula.

[X].7.4. Concluída a eliminação, a CONTRATADA entregará à CONTRATANTE, em até **[10 (dez)] dias**, **declaração formal de eliminação** assinada por representante legal, identificando os ambientes e sistemas alcançados, inclusive os de suboperadores.

[X].7.5. **Exceção legal.** A CONTRATADA poderá conservar dados pessoais estritamente na medida e pelo prazo exigidos para cumprimento de obrigação legal ou regulatória, ou para exercício regular de direitos em processo judicial, administrativo ou arbitral (art. 16 da LGPD), hipótese em que: (a) informará à CONTRATANTE, por escrito, a base legal, as categorias de dados retidas e o prazo de retenção; (b) restringirá o tratamento à exclusiva finalidade que justificou a conservação; e (c) eliminará os dados imediatamente após a cessação dessa finalidade, aplicando-se o disposto na subcláusula [X].7.4.

[X].7.6. A CONTRATADA não poderá reter dados pessoais como forma de garantia, retenção ou meio de coerção para satisfação de créditos contratuais controvertidos ou por qualquer outro motivo não previsto na subcláusula [X].7.5.

[X].7.7. **Período de transição.** Mediante solicitação da CONTRATANTE, a CONTRATADA manterá acesso aos dados e prestará suporte à migração por até **[60 (sessenta)] dias** após o término, mediante remuneração **[nas condições vigentes / conforme tabela do Anexo Z]**, permanecendo integralmente aplicável esta Cláusula durante o período.

## [X].8 Responsabilidade

[X].8.1. A CONTRATADA responderá pelos danos decorrentes do tratamento de dados pessoais quando descumprir as obrigações desta Cláusula, da LGPD ou das instruções lícitas da CONTRATANTE, nos termos do art. 42 e seguintes da LGPD.

[X].8.2. A CONTRATADA ressarcirá a CONTRATANTE dos valores por esta despendidos a título de indenização a titulares, multas administrativas aplicadas pela ANPD ou por outras autoridades, custas e honorários, na proporção de sua culpa ou contribuição para o evento danoso, assegurados o contraditório e a comunicação prévia sobre a demanda, bem como a possibilidade de participação na defesa.

[X].8.3. **[Opcional]** As obrigações desta Cláusula **não se sujeitam ao limite de responsabilidade** previsto na Cláusula [W] deste Contrato. **[Alternativa: sujeitam-se a limite específico e majorado de R$ XX.]**

## [X].9 Disposições finais

[X].9.1. As obrigações previstas nas subcláusulas [X].3.2 (sigilo), [X].6 (retenção), [X].7 (término) e [X].8 (responsabilidade) **sobrevivem ao término deste Contrato**, pelos prazos nelas indicados ou, na ausência de prazo, enquanto a CONTRATADA detiver dados pessoais da CONTRATANTE ou perdurar a responsabilidade legal correspondente.

[X].9.2. Em caso de conflito entre esta Cláusula e as demais disposições contratuais quanto ao tratamento de dados pessoais, **prevalece esta Cláusula**.

[X].9.3. Alterações legislativas ou regulamentares supervenientes, inclusive regulamentos da ANPD, serão incorporadas mediante aditivo, comprometendo-se as Partes a negociá-lo de boa-fé em até **[30 (trinta)] dias** da provocação de qualquer delas.

---

# ANEXO [Y] — ESCOPO DO TRATAMENTO DE DADOS PESSOAIS

| Item | Descrição |
|---|---|
| **Finalidade específica** | [ex.: hospedagem e processamento de pedidos e cadastro de clientes da CONTRATANTE] |
| **Categorias de titulares** | [ex.: clientes pessoa física da CONTRATANTE; representantes de clientes PJ] |
| **Categorias de dados pessoais** | [ex.: nome, CPF, e-mail, telefone, endereço, histórico de compras, dados de pagamento] |
| **Dados sensíveis** | [Não há / especificar — se houver, exigir controles reforçados] |
| **Dados de crianças e adolescentes** | [Não há / especificar] |
| **Operações realizadas** | [coleta, armazenamento, processamento, indexação, backup, eliminação] |
| **Duração do tratamento** | Vigência do Contrato + prazos das subcláusulas [X].6 e [X].7 |
| **Prazos específicos de retenção** | [categoria → prazo] |
| **Local de armazenamento** | [país / região / provedor de nuvem] |
| **Suboperadores autorizados** | [nome, CNPJ/jurisdição, finalidade, dados acessados, localização] |

---

## Pontos que exigem decisão sua antes de fechar

1. **Limite de responsabilidade (X.8.3).** É o ponto que o fornecedor mais tentará negociar. Excluir LGPD do cap é a posição forte; um cap majorado (ex.: 3x o valor anual) costuma ser o meio-termo aceito.
2. **Suboperadores (X.5.3).** O modelo acima usa autorização com direito de oposição. Se o fornecedor for uma SaaS grande, ele provavelmente só aceitará "lista pública + notificação". Nesse caso, mantenha ao menos o direito de rescisão sem multa.
3. **Prazo de notificação de incidente (X.3.7).** 24h é agressivo; 48h ou 72h é o mais comum. Não aceite "prazo razoável".
4. **Backups (X.6.4 e X.7.3).** Confirme o ciclo real do fornecedor antes de preencher — se ele mantém backups por 12 meses, o prazo de 30 dias da X.7.3 será descumprido já na assinatura.
5. **Uso para treinamento de IA (X.2.5).** Se o software tem funcionalidades de IA, essa vedação provavelmente será objeto de negociação. Decida se aceita exceção para dados anonimizados.

Recomendo revisão por advogado com prática em proteção de dados antes da assinatura, sobretudo quanto à interação desta cláusula com o limite de responsabilidade e as hipóteses de rescisão já existentes no seu contrato.
```

### LEGAL-3 · R2

```text
Okay, the user needs a GDPR-compliant data processing clause for a contract between their company (as controller) and a software vendor. Wait, they mentioned LGPD, not GDPR. LGPD is Brazil's data protection law, similar to GDPR but specific to Brazil.

First, I need to make sure the clause covers the required elements: purpose, retention period, subcontracting, and what happens at contract end. Let me recall LGPD's key points. LGPD requires that data processing is for a specific purpose, data minimization, security measures, and the processor must comply with the controller's instructions.

Purpose: The clause should state that the vendor processes data only for the agreed services, like managing customer interactions. Must mention compliance with LGPD.

Retention period: Need to specify how long data is kept, maybe until the contract ends plus any legal retention periods. But the user said "prazo de retencao," so I should include that the data is retained only as necessary for the purpose and in line with legal requirements.

Subcontracting: LGPD requires the controller's prior written consent for subcontracting. So the clause must state that the vendor can't subcontract without the controller's approval and must ensure the sub-processor complies with LGPD.

End of contract: Data must be returned or deleted. The vendor should delete or return all data upon termination, and provide a certificate of deletion.

Wait, the user is in Portugal, but LGPD is Brazil's law. Wait, the user wrote "LGPD" which is Brazil's law, but they're asking for PT-PT. Maybe they're a Portuguese company operating in Brazil? Or maybe they confused GDPR with LGPD. But the question specifies LGPD, so I'll stick to that.

Check if the clause should mention the specific data types, but the user didn't specify, so keep it general.

Make sure the clause is concise, as per the user's request for short answers. They want a clause, not a whole contract. So just the clause text.

Avoid any markdown, just plain text. Use English terms for the clause since legal terms are usually in English in such contexts, but the response should be in PT-PT. Wait, the user said "Respostas curtas e directas — nunca mais de 3 frases para perguntas simples. Não uses preâmbulo. Não repitas o que o user perguntou." So the answer should be the clause in Portuguese, but the clause itself would have legal terms in English? Wait, no, the clause should be written in Portuguese, but legal terms might be in English. Wait, the user is in Portugal, so the contract would be in Portuguese. But the clause needs to be in Portuguese.

Wait, the user said "Redige uma clausula... em PT-PT". So the clause should be in Portuguese. But legal terms in contracts are often in the language of the jurisdiction. Since it's LGPD, which is Brazil's law, but the user is in Portugal. Hmm, but they specified PT-PT, so the clause should be in Portuguese (Portugal).

Wait, but LGPD is Brazil's law, so the clause should reference LGPD, but the language of the contract is Portuguese (Portugal). So the clause would be written in Portuguese, using terms like "LGPD" and "controladora".

Let me structure the clause:

- Finalidade: Processamento dos dados apenas para os serviços contratados, em conformidade com a LGPD.

- Prazo de retenção: Dados retidos apenas pelo tempo necessário para cumprir a finalidade e as obrigações legais, cessando após término do contrato.

- Subcontratação: Subcontratação apenas com prévia autorização por escrito da controladora, com garantia de conformidade com a LGPD.

- Fim do contrato: Devolução ou eliminação dos dados, com certificado de exclusão.

Check if that covers all points. Need to make sure it's a clause, so maybe phrased as a sentence.

Wait, the user wants a clause, so it should be a paragraph. Let me check standard clauses.

In LGPD, the processor must process data only as per controller's instructions, so the clause should state that the vendor processes data only for the agreed purpose, as per the controller's instructions.

Also, retention period: must not retain longer than necessary. So the clause should say data is retained only for the duration of the contract plus any legal retention periods, but the user didn't specify legal periods, so maybe just "até o término do contrato ou conforme exigido por lei".

Subcontracting: must have prior written consent. So the clause should state that subcontracting requires prior written consent from the controller, and the sub-processor must comply with LGPD.

End of contract: data must be returned or deleted, and the vendor must provide a certificate of deletion.

Putting it all together in Portuguese, concise.

Let me draft:

"O fornecedor processará os dados pessoais exclusivamente para os fins contratados, em conformidade com a LGPD, e manterá os dados apenas pelo período necessário para cumprir a finalidade e as obrigações legais. Subcontratação só será permitida com prévia autorização por escrito da controladora, garantindo que o subfornecedor cumpra a LGPD. Ao término do contrato, os dados serão devolvidos ou eliminados, com certificação da exclusão."

Check if that's under three sentences. Let's count:

1. O fornecedor processará... (first sentence)
2. Subcontratação só será permitida... (second sentence)
3. Ao término do contrato... (third sentence)

Yes, three sentences. Covers purpose, retention (implied in "apenas pelo período necessário"), subcontracting, and end of contract. Retention period is mentioned as "pelo período necessário para cumprir a finalidade e as obrigações legais", which covers the retention period. The user asked for "prazo de retencao", so this should be okay.

Check if "obrigações legais" refers to legal retention periods, which is standard.

Also, "certificação da exclusão" is the certificate of deletion.

Looks good. Make sure it's in PT-PT. Words like "fornecedor", "controladora", "LGPD" are correct.

Yes, this should meet the user's requirements.
</think>

O fornecedor processará dados exclusivamente para os fins contratados, em conformidade com a LGPD, mantendo-os apenas pelo período necessário e conforme obrigações legais. Subcontratação exige autorização prévia por escrito da controladora, com garantia de compliance LGPD pelo subfornecedor. Ao término do contrato, dados serão eliminados ou devolvidos, com certificação da exclusão.
```

### LEGAL-3 · R3

```text
Vou consultar o texto oficial da LGPD para fundamentar a cláusula e deixar os campos que dependem do contrato por preencher.

Segue uma minuta para adaptar ao serviço e aos dados envolvidos. **Os prazos de 30 e 90 dias são propostas contratuais, não prazos impostos pela LGPD.** Preenche os campos entre parênteses retos antes de assinar.

**CLÁUSULA [X] — TRATAMENTO DE DADOS PESSOAIS**

**1. Objeto e finalidade.** Para o tratamento dos dados pessoais dos clientes da CONTRATANTE abrangidos por este contrato, a CONTRATANTE atuará como **CONTROLADORA** e a CONTRATADA como **OPERADORA**. A OPERADORA tratará exclusivamente os dados pessoais [identificar categorias de dados], para [descrever a finalidade específica e as operações necessárias ao serviço], em conformidade com a Lei n.º 13.709/2018 — LGPD e com as instruções lícitas e documentadas da CONTROLADORA. Ficam proibidos a comercialização, o uso para publicidade própria, o treino de modelos de inteligência artificial e qualquer utilização para finalidade própria ou distinta da contratada.

**2. Instruções e proteção.** Compete à CONTROLADORA definir e documentar as finalidades e bases legais aplicáveis. A OPERADORA comunicará prontamente qualquer instrução que considere contrária à legislação e adotará medidas técnicas e administrativas adequadas ao risco, assegurando acesso restrito a pessoas autorizadas e vinculadas ao dever de confidencialidade. Prestará assistência à CONTROLADORA no atendimento aos titulares e na demonstração do cumprimento desta cláusula.

**3. Retenção.** Os dados serão conservados apenas durante o período necessário à finalidade contratada, observado o prazo de [indicar prazo ou critério objetivo por categoria de dados], nunca além da vigência contratual, salvo para os procedimentos de encerramento previstos abaixo ou para conservação legalmente exigida. A mera disponibilidade técnica de armazenamento não justificará a retenção.

**4. Subcontratação.** A contratação ou substituição de terceiros que tratem estes dados, incluindo fornecedores de alojamento e infraestrutura, dependerá de autorização prévia e escrita da CONTROLADORA. O pedido identificará o suboperador, as atividades, os dados envolvidos e os países de tratamento. A OPERADORA imporá ao suboperador obrigações de proteção, confidencialidade, retenção e eliminação equivalentes às aqui previstas e permanecerá contratualmente responsável perante a CONTROLADORA pelo cumprimento dessas obrigações. Transferências internacionais dependerão também do atendimento aos requisitos legais aplicáveis.

**5. Encerramento.** Com o término do contrato, por qualquer motivo, ou mediante instrução lícita de eliminação, a OPERADORA cessará o tratamento operacional. A CONTROLADORA poderá optar pela devolução dos dados seguida de eliminação, ou pela eliminação direta. A devolução ocorrerá em até **30 dias**, em formato estruturado, de uso corrente e legível por máquina, por canal seguro. A eliminação dos sistemas ativos ocorrerá no mesmo prazo ou, havendo devolução, até **30 dias após a confirmação da sua receção**.

**6. Cópias e exceções.** As cópias de segurança serão eliminadas no prazo máximo de **90 dias após o encerramento**, permanecendo entretanto segregadas e sem utilização operacional. Se houver restauração para recuperação de desastre, a eliminação será reaplicada. Quando uma obrigação legal ou regulatória exigir conservação, a OPERADORA informará por escrito a CONTROLADORA sobre o fundamento, as categorias de dados e o prazo aplicável, salvo proibição legal. Esses dados terão acesso restrito, serão usados exclusivamente para cumprir tal obrigação e eliminados quando esta cessar.

**7. Comprovação e continuidade.** A OPERADORA assegurará que os suboperadores cumpram os procedimentos de encerramento e entregará declaração escrita de eliminação, identificando eventuais dados ainda conservados e a data prevista para a sua eliminação. Os deveres de proteção e confidencialidade subsistirão enquanto qualquer dado pessoal permanecer sob a sua responsabilidade.

A minuta apoia-se nos princípios e nas regras sobre término do tratamento, instruções ao operador e segurança dos artigos 6.º, 15.º, 16.º, 39.º e 46.º–47.º da [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm). A adequação final depende, sobretudo, das categorias de dados, da finalidade concreta e das obrigações de conservação aplicáveis à tua atividade.
```

### LEGAL-3 · R4

```text
# Cláusula de Tratamento de Dados Pessoais - LGPD

## 1. DEFINIÇÕES E PAPÉIS

1.1. A **CONTRATANTE** é a controladora de dados pessoais, responsável pela determinação das finalidades e meios de tratamento.

1.2. A **CONTRATADA** é a processadora de dados, responsável pelo tratamento de dados pessoais em nome e sob as instruções da CONTRATANTE.

1.3. "Dados Pessoais" significa qualquer informação de pessoa natural identificada ou identificável, conforme definido na LGPD.

---

## 2. FINALIDADE E ESCOPO DO TRATAMENTO

2.1. A CONTRATADA processará os Dados Pessoais exclusivamente para as seguintes finalidades:
- [Especificar: ex. provisão dos serviços de software contratados, análise de performance, suporte técnico]

2.2. A CONTRATADA não pode utilizar os Dados Pessoais para finalidades diferentes das estabelecidas nesta cláusula sem prévia autorização escrita da CONTRATANTE.

2.3. Toda instrução de tratamento deve ser documentada e comunicada previamente. Tratamentos não autorizados constituem violação contratual grave.

---

## 3. PRAZO DE RETENÇÃO DE DADOS

3.1. A CONTRATADA manterá os Dados Pessoais pelo período necessário para cumprir as finalidades definidas na seção 2, não podendo exceder **[inserir prazo específico, ex.: 24 meses a partir do término do contrato]**.

3.2. Após expirado o prazo, a CONTRATADA deverá:
- **Eliminar completamente** os Dados Pessoais, ou
- **Devolver** todos os dados à CONTRATANTE, conforme instrução desta

3.3. Exceções legais (obrigações tributárias, processuais ou regulatórias) serão comunicadas por escrito à CONTRATANTE, com indicação do prazo legal obrigatório.

---

## 4. SUBCONTRATAÇÃO

4.1. A CONTRATADA não poderá subcontratar o processamento de Dados Pessoais a terceiros sem **consentimento prévio, expresso e escrito** da CONTRATANTE.

4.2. Caso autorizada a subcontratação, a CONTRATADA:
- a) Permanece **integralmente responsável** perante a CONTRATANTE por qualquer falha do subcontratado;
- b) Deve celebrar contrato escrito com o subcontratado contendo obrigações equivalentes às desta cláusula;
- c) Fornecerá lista atualizada de subcontratados à CONTRATANTE;
- d) Notificará qualquer alteração (inclusão ou exclusão) com **15 dias de antecedência**.

4.3. A CONTRATANTE tem o direito de rejeitar ou solicitar a substituição de subcontratados que violem requisitos de segurança ou conformidade com a LGPD.

---

## 5. TÉRMINO DO CONTRATO E DEVOLUÇÃO/ELIMINAÇÃO DE DADOS

5.1. Ao término deste contrato, por qualquer motivo, a CONTRATADA deverá, no prazo de **[inserir prazo, ex.: 30 dias]**:

**a) Opção 1 - Devolução:**
- Devolver todos os Dados Pessoais em formato estruturado, legível e de uso comum;
- Garantir a integridade e confidencialidade durante a transferência;
- Fornecer certificado comprovando a devolução completa.

**OU**

**b) Opção 2 - Eliminação:**
- Eliminar permanentemente e irreversivelmente todos os Dados Pessoais;
- Não manter cópias, registros ou backups, salvo se exigido por lei;
- Fornecer declaração escrita comprovando a eliminação.

5.2. A escolha entre devolução ou eliminação será da **exclusiva decisão da CONTRATANTE**, comunicada por escrito.

5.3. A CONTRATADA não poderá utilizar os Dados Pessoais após o término, mesmo durante período de aviso prévio ou transição.

---

## 6. OBRIGAÇÕES COMPLEMENTARES

6.1. **Segurança:** A CONTRATADA implementará medidas técnicas e organizacionais apropriadas para proteger os Dados Pessoais contra acessos não autorizados, alterações, destruição ou vazamento.

6.2. **Auditorias:** A CONTRATANTE pode, sem aviso prévio, auditar os sistemas da CONTRATADA para verificar conformidade com esta cláusula.

6.3. **Notificação de Incidentes:** A CONTRATADA notificará imediatamente (não superior a 24 horas) qualquer incidente de segurança ou vazamento de Dados Pessoais.

6.4. **Confidencialidade:** Todos os funcionários da CONTRATADA acessando Dados Pessoais devem estar vinculados por obrigação de confidencialidade.

---

## 7. RESPONSABILIDADE

7.1. A CONTRATADA é responsável por danos decorrentes de:
- Violação das obrigações desta cláusula;
- Processamento não autorizado de Dados Pessoais;
- Falhas em cumprir instruções da CONTRATANTE.

7.2. A CONTRATANTE pode rescindir este contrato imediatamente em caso de violação grave das obrigações de proteção de dados, sem prejuízo de direitos adicionais.

---

**Observações importantes:**

- Preencha os trechos em **[colchetes]** com informações específicas do seu caso
- Considere revisar esta cláusula com um advogado especializado em LGPD
- Adapte conforme seu modelo de negócio (dados de clientes, funcionários, etc.)
- Tenha documentação comprovando instruções ao processador

Precisa ajustar algo nesta redação?
```

### LEGAL-3 · R5

```text
**Clausula de Tratamento de Dados Pessoais**

1. **Finalidade**: O Fornecedor de Software processará os Dados Pessoais dos Clientes exclusivamente para as finalidades específicas contratualmente acordadas entre a Controladora e o Fornecedor, conforme descrito no Anexo 1 deste Contrato.

2. **Prazo de Retenção**: O Fornecedor manterá os Dados Pessoais durante o período necessário para cumprir as finalidades acordadas, não excedendo 5 anos após o término deste Contrato, a menos que haja obrigações legais contrárias.

3. **Subcontratação**: O Fornecedor poderá subcontratar o processamento dos Dados Pessoais apenas se o Subcontratário cumprir as mesmas obrigações de segurança e confidencialidade previstas neste Contrato. O Fornecedor fornecerá à Controladora uma lista atualizada de seus Subcontratários.

4. **Fim do Contrato**: No término ou rescisão deste Contrato, o Fornecedor deverá devolver ou apagar todos os Dados Pessoais processados, a menos que a Controladora solicite explicitamente a manutenção dos Dados para fins de cumprimento de obrigações legais.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## MKT-3

**Pedido:**

> Estou a definir o pricing do meu SaaS B2B. Tenho 40 clientes a pagar 90 euros por mes num plano unico e o custo de servir cada um e cerca de 12 euros. Quero passar para tres planos. Como e que estruturo isso sem perder os clientes actuais?

### MKT-3 · R1

```text
Para estruturar os três planos sem perder clientes atuais, considere:

1. **Plano Básico**: Mantenha o preço atual de 90 euros/mês, com funcionalidades essenciais.
2. **Plano Intermediário**: Adicione algumas funcionalidades extras por um preço ligeiramente superior (ex: 110 euros/mês).
3. **Plano Avançado**: Inclua todas as funcionalidades com suporte premium por um preço mais elevado (ex: 150 euros/mês).

Comunique claramente as vantagens de cada plano e ofereça um período de transição suave para os clientes atuais.
```

### MKT-3 · R2

```text
Vou usar os teus números para propor três planos e consultar referências sobre a transição dos clientes atuais.
**Lançaria os três planos para novos clientes e manteria os 40 atuais num plano reservado de 90 €/mês, com migração opcional.** Isto reduz o risco da mudança, embora não garanta zero cancelamentos.

Os teus números dão-te alguma margem para testar:

- **Receita recorrente:** 3.600 €/mês.
- **Custo de serviço indicado:** 480 €/mês.
- **Restante:** 3.120 €/mês, ou 86,7%, antes de salários, aquisição, desenvolvimento e outros custos não incluídos nos 12 €.

O custo ajuda a definir o mínimo sustentável; o preço deve refletir o valor para cada segmento. A [Stripe descreve esta abordagem](https://stripe.com/resources/more/pricing-models-for-growth-what-businesses-need-to-know).

**Como hipótese inicial a validar**, testaria:

| Plano | Preço mensal | Para quem | Diferenciação |
|---|---:|---|---|
| Essencial | 59 € | Operações pequenas | Resultado principal completo, com menor volume incluído |
| Profissional | 119 € | Cliente típico atual | Utilização habitual confortável, colaboração e automações |
| Empresa | 229 € | Operações maiores | Maior volume, permissões, integrações e apoio prioritário |

Estes valores são pontos de partida, não preços já demonstrados pelo mercado. As funcionalidades também dependem do teu produto.

Escolhe **uma métrica principal que cresça com o valor entregue**: utilizadores ativos, projetos, locais ou operações processadas, por exemplo. O Essencial deve resolver um caso pequeno por inteiro; o Profissional deve justificar a diferença com necessidades reais. Evita “ilimitado” ou apoio intensivo sem conheceres o custo dos clientes maiores.

Para proteger os atuais:

1. **Mantém preço, funcionalidades e limites contratados durante pelo menos 12 meses.** Não retires funcionalidades para os obrigar a subir. Preservar condições antigas é uma estratégia de transição também descrita pela [Stripe](https://stripe.com/resources/more/software-pricing-models-and-strategies-for-saas-businesses).
2. **Oferece upgrades por valor adicional.** Mostra o que ganham e permite experimentar antes de aceitarem uma nova mensalidade.
3. **Define já o que acontece depois dos 12 meses.** Eu faria uma revisão nessa altura, sem aumento automático, e comunicaria qualquer alteração com 90 dias de antecedência. Evita prometer preço vitalício.
4. **Permite a mudança voluntária para o Essencial**, explicando os limites. Se muitos clientes couberem nele sem perder valor, a separação dos planos precisa de trabalho.

A comunicação pode ser simples:

> “Vamos lançar três planos para diferentes necessidades. Como já és cliente, manténs os teus 90 €/mês e as condições atuais durante os próximos 12 meses. Não precisas de fazer nada. Só mudas de plano se escolheres.”

Antes do lançamento, conversa com **8–10 clientes de diferentes dimensões**: que resultado obtêm, o que limita a utilização e qual dos planos escolheriam — e porquê. Depois acompanha conversão de novos clientes, upgrades, downgrades, cancelamentos e custo de serviço por plano.

**Que problema resolve o teu SaaS e o que distingue hoje os clientes que o usam pouco dos que o usam muito?** Essa diferença vai ajudar a desenhar os limites dos três planos.
```

### MKT-3 · R3

```text
Okay, the user is moving from a single plan to three plans for their B2B SaaS. They have 40 clients paying €90/month, with a cost of €12 per client. They don't want to lose current clients.

First, I need to figure out how to structure three plans without increasing the price for existing customers. Maybe they can keep the current plan as a base, then add higher tiers with more features. But they need to make sure existing clients stay on the same price.

Wait, the current plan is €90, cost €12. So profit is €78 per client. If they introduce new plans, they need to ensure that the existing clients aren't charged more. So the current plan should remain at €90. Then, maybe create two new tiers: one cheaper for basic features, and one more expensive for advanced. But wait, they have 40 clients on the current plan. If they add a cheaper plan, some might downgrade, but they don't want to lose them. So maybe the existing plan stays, and they add a higher tier for those who need more, and maybe a mid-tier. But the user wants to avoid losing current clients, so the existing plan should stay as is. So the three plans would be: Basic (maybe lower price, but existing clients stay on current), Standard (current price), Premium (higher price). Wait, but the current plan is the only one. So maybe split into three: Basic, Standard, Premium. But existing clients are on Standard, so they stay on that. Then, new customers can choose Basic, Standard, or Premium. But the user's current clients are paying €90, so Standard would be €90. Then Basic could be, say, €60, and Premium €120. But they need to make sure that the cost per client is still covered. Wait, the cost is €12 per client, so even if they lower the price for Basic, as long as it's above €12, it's okay. But the user might want to keep the current price for existing clients. So the existing clients stay on the current plan (€90), and new customers can choose from three tiers. But the user might want to offer the existing clients an upgrade to a higher tier without increasing their cost. Wait, but they don't want to lose them, so maybe the current plan remains, and they add two new tiers. So the three plans would be:

- Basic: €60 (for new customers, maybe with fewer features)
- Standard: €90 (current plan, existing clients stay here)
- Premium: €120 (more features)

But they need to make sure that the existing clients aren't charged more. So the Standard plan stays at €90. Then, when they introduce the new plans, existing clients are automatically on Standard, and new customers can choose. That way, they don't lose current clients. Also, they should communicate the new tiers clearly, maybe offer a discount for existing clients to move to Premium if they want, but the main point is to keep them on the current plan. Wait, but the user says "without losing current clients," so the key is to not increase their price. So the existing plan remains at €90, and the new plans are for new customers. So the three plans are Basic, Standard (current), Premium. Existing clients stay on Standard. New customers can choose Basic or Premium. But the user might want to have three plans where some existing clients might move to a different tier, but they don't want to lose them. So maybe the existing plan is kept as a middle tier, and they create a lower and higher tier. But the main point is to not change the price for existing clients. So the answer should be to keep the current plan as the middle tier, add a lower-priced plan for new customers, and a higher-priced premium plan. Existing clients remain on the current price. So structure the three plans with the existing price as one tier, and new tiers above and below. But the user's current price is €90, so maybe Basic at €70, Standard at €90, Premium at €120. But they need to make sure that the cost is covered. Since cost is €12, even Basic at €70 is fine. So the answer would be: Keep current plan at €90, add Basic (€60-70) and Premium (€110-120), offer existing clients to stay on current plan without changes. That way, no one loses their current plan, and new customers can choose different tiers.
</think>

Mantenha o plano atual a €90 (sem alterações). Crie um plano básico (€60-70) e um premium (€110-120) para novos clientes. Comunique claramente que os atuais clientes permanecem no plano atual sem custos adicionais.
```

### MKT-3 · R4

```text
A estratégia mais comum e segura é usar **grandfather clause** + incentivos:

## Estrutura recomendada

**Para clientes atuais:**
- Mantem-os no plano atual (€90/mês) indefinidamente ou por 12-24 meses
- Sem surpresas = sem churn
- Comunica isto claramente logo

**Novos clientes:**
- Entram nos 3 planos novos (ex: Starter €40, Professional €90, Enterprise €200)
- O teu plano atual fica como referência para o tier médio

**Incentivos opcionais:**
- Desconto de 10-15% se migrarem voluntariamente para um dos novos planos (aproveita para subir alguns)
- Comunicar benefícios reais de cada tier (features, limits, suporte)

## Estrutura dos 3 planos

Com margem de €78/cliente, tens espaço. Exemplo:

| Plano | Preço | Custo | Margem | Target |
|-------|-------|-------|--------|--------|
| Starter | €40 | €8 | €32 | SMBs, testers |
| Pro | €99 | €15 | €84 | Clientes atuais + mid-market |
| Enterprise | €300+ | €30+ | €270+ | Grandes volumes |

## Risco

Se 30% dos clientes saem com a mudança = €1.080/mês perdidos. Se 70% migrarem para Pro, ganha-se mais nos novos. **Comunica early, oferece grandfathering.**

Qual é o perfil dos teus 40 clientes? Estão todos a usar bem os €90, ou há desperdício?
```

### MKT-3 · R5

```text
## O enquadramento primeiro

MRR actual: €3.600. Margem bruta ~87% (€78 por cliente). Isso é saudável — o teu problema não é margem, é **ARPU e capacidade de capturar o topo**.

Com 40 clientes, a matemática da migração é assimétrica: mesmo que conseguisses subir todos 30%, ganhavas ~€1.100/mês. Perder 4 clientes numa migração mal feita custa-te €360/mês *e* referências numa base onde cada logo pesa 2,5%. **Não vale a pena tocar nos 40.** O novo pricing é para os clientes que ainda não tens.

## A regra que resolve o teu receio

Grandfathering explícito e permanente, comunicado como benefício:

- Os 40 ficam num plano *Legacy* a €90, com tudo o que já usam hoje.
- **Nada do que eles já usam pode ir para um plano superior.** Esta é a única forma de perder clientes numa reestruturação: alguém abrir a app e descobrir que uma funcionalidade que usava passou a ser "Enterprise". O conjunto de features actual define o **mínimo do plano do meio**.
- O caminho de upgrade é *pull*, não *push*: funcionalidades novas entram nos planos novos. Quem quiser, migra. Não há data-limite nem pressão.

## Escolher o eixo antes dos preços

Três planos só funcionam se houver uma métrica de valor que cresce com o cliente — utilizadores, volume processado, lojas/entidades, integrações. Sem saber o teu produto, o teste é: **qual a variável que faz o teu custo de €12 variar entre clientes?** Se um cliente te custa €4 e outro €30, essa diferença é a tua métrica de valor, já revelada pelos dados. Se o custo é uniforme, o eixo tem de ser organizacional (seats, permissões, entidades).

Só depois é que os preços fazem sentido.

## Estrutura sugerida

Ancora o €90 actual **abaixo** do plano do meio — senão o Legacy fica a parecer melhor negócio que o catálogo.

| | Entrada | Core | Avançado |
|---|---|---|---|
| Preço | €49–59 | €129–149 | €299–390 |
| Objectivo | capturar quem hoje diz "caro demais" | plano default, ~70% dos novos | capturar willingness-to-pay |

O topo constrói-se com coisas de custo marginal quase nulo e valor alto em B2B: SSO/SAML, gestão de papéis e permissões, acesso a API, logs de auditoria, SLA contratual, suporte prioritário, onboarding assistido, exportações/relatórios.

**Cuidado com o plano de entrada:** o custo de infra desce, o custo de suporte não. A €49 com €12 de infra ainda tens margem, mas um cliente de entrada que abre 5 tickets/mês destrói-a. Limita-o a sério (menos seats, sem integrações, suporte só por email) — a função dele é ser a porta e fazer o Core parecer óbvio.

## Execução

1. **Fala com os 40 antes de publicar.** São 40 — é uma semana de chamadas, não um email em massa. Pergunta o que pagariam mais para ter. Isso escreve-te o plano Avançado com dados reais em vez de suposições.
2. Anuncia o novo pricing com a mensagem principal a ser *"o teu preço não muda"*, não *"temos planos novos"*.
3. Novo pricing só para novos clientes, a partir de uma data.
4. **Métrica de controlo:** se mais de ~30% dos novos clientes escolherem o plano de topo, subvalorizaste-o — sobe. Se ninguém o escolher em 3 meses, o problema é o conteúdo do plano, não o preço.

## O que fica em aberto

Não te consigo fechar os preços sem saber a métrica de valor e o perfil de quem te diz "não" hoje. Os intervalos acima assumem que €90 é o teu ponto médio actual de mercado e que tens features não-lançadas suficientes para encher um plano de topo. Se ainda não tens nada para pôr no Avançado, lança dois planos agora (Core a €129 + Legacy) e o terceiro quando tiveres substância — um plano de topo vazio deprecia a tabela toda.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## DEV-2

**Pedido:**

> O meu codigo esta a dar este erro: TypeError: Cannot read properties of undefined (reading 'map'). Acontece quando a pagina carrega. O que e que isto quer dizer e como e que eu resolvo?

### DEV-2 · R1

```text
## O que o erro quer dizer

`Cannot read properties of undefined (reading 'map')` significa que estás a chamar `.map()` em algo que, naquele instante, é `undefined` — não é um array vazio, é literalmente "não existe".

Em JavaScript, `[].map(...)` funciona sem problemas. `undefined.map(...)` estoura. Portanto o problema **não é o `.map`**, é a variável que está antes dele.

O detalhe importante: acontecer "quando a página carrega" é a assinatura clássica de **dados que ainda não chegaram**. O componente renderiza uma primeira vez antes de o `fetch`/query terminar, e nessa primeira passagem a variável ainda não tem valor.

## Causas mais frequentes

1. **Estado inicial errado** — `useState()` sem argumento, ou `useState(null)`, em vez de `useState([])`.
2. **Resposta da API com forma diferente da esperada** — fazes `data.map(...)` mas o servidor devolve `{ items: [...] }`, logo o array está em `data.items` e `data.map` não existe.
3. **Prop não passada** — o componente espera `<Lista items={...} />` e alguém o usou sem `items` (ou com o nome trocado, `item` vs `items`).
4. **Destructuring de objeto ainda inexistente** — `const { results } = response` quando `response` é `undefined` na primeira renderização.
5. **Erro de nome/typo** — `props.usuarios` vs `props.users`.

## Como resolver

**Primeiro: descobre qual é a variável.** Abre a consola do browser e clica na stack trace — ela dá-te o ficheiro e a linha. Ou põe um log imediatamente antes:

```js
console.log('valor antes do map:', dados);
```

Se aparecer `undefined`, confirmaste a hipótese.

**Depois, aplica a correção adequada.** Não te limites à proteção, corrige a origem:

```js
// 1. Estado inicial como array — resolve o caso mais comum
const [dados, setDados] = useState([]);
```

```js
// 2. Se a API devolve um objeto envolvente
setDados(resposta.items ?? []);
```

```js
// 3. Se a prop pode faltar, dá-lhe um default
function Lista({ items = [] }) {
  return items.map(...)
}
```

**Como rede de segurança** (mas não como única solução), o optional chaining:

```js
{dados?.map(item => <li key={item.id}>{item.nome}</li>)}
```

Isto faz o erro desaparecer, mas se a causa real for um nome de campo errado vais ficar com uma lista vazia e sem erro — pior de diagnosticar. Usa-o para o caso legítimo de "os dados ainda não chegaram", não para tapar um bug.

**Melhor ainda, se for carregamento assíncrono**, trata o estado explicitamente:

```js
if (loading) return <Spinner />;
if (erro) return <p>Falhou o carregamento.</p>;
return dados.map(...);
```

## Se quiseres que eu identifique o problema exato

Cola aqui:
- a linha do erro e a stack trace da consola
- o componente onde está o `.map()`
- o código que busca os dados (`fetch`/`axios`/query) e o `useState` correspondente

Com isso digo-te qual das causas é a tua em vez de listar possibilidades.
```

### DEV-2 · R2

```text
Okay, the user is getting a TypeError: Cannot read properties of undefined (reading 'map') when the page loads. Let me think about what that means.

So, the error is saying that they're trying to call the 'map' method on something that's undefined. The 'map' method is usually used on arrays, right? So probably, they're trying to do something like array.map() but the array isn't defined yet.

Common causes: Maybe they're trying to access a state variable or a prop that hasn't been initialized. For example, in React, if you have a state variable that's supposed to be an array but starts as undefined, and then you try to map over it, that's the error.

How to fix it? They should check where they're using .map and make sure the variable is initialized as an empty array or has a default value. Like, if it's a state variable, set it to [] initially. Also, maybe check if the data is being fetched asynchronously and they're trying to map before the data arrives.

Wait, the user mentioned the error happens when the page loads. So maybe the data they're trying to map isn't available yet. For example, if they're fetching data from an API and using it in a map, but the data hasn't loaded yet. So they need to handle the loading state or check if the data exists before mapping.

Another possibility: Maybe they're using a variable that's supposed to be an array but is actually undefined because of a typo in the variable name. Like, maybe they meant to use 'data' but wrote 'datas' or something, so it's undefined.

So the solution steps would be: Check the variable before using map, initialize it as an empty array, or handle the case where it's not yet loaded.

Let me make sure. The error is 'map' of undefined, so the variable is undefined. So the fix is to ensure that variable is defined as an array before using map. So in code, maybe add a default value or check if it's defined.

For example, if it's a state in React, set initial state to [].

So the answer should be: Check if the variable is undefined before using map. Initialize it as an empty array or handle the undefined case.

Wait, the user is asking what it means and how to solve it. So the answer should be concise. In PT-PT, short.

So, "Verifique se a variável é undefined antes de usar map(). Inicialize-a como [] ou gere um valor padrão."

But let me confirm. The error is trying to read 'map' from undefined, so the variable is undefined. So the fix is to make sure it's an array, not undefined. So initializing as empty array or checking for existence.

Yes, that's right. So the answer should be to check and initialize as empty array.
</think>

Verifique se a variável é `undefined` antes de usar `map()`. Inicialize-a como `[]` ou adicione um valor padrão.
```

### DEV-2 · R3

```text
Esse erro significa que estás a chamar `.map()` sobre uma variável que está `undefined`. O `.map()` serve para percorrer arrays (listas).

Quando acontece ao carregar a página, é comum os dados ainda não terem chegado da API.

Se estiveres a usar React, inicializa o estado como uma lista vazia:

```jsx
// Pode provocar o erro:
const [items, setItems] = useState();

// Corrigido:
const [items, setItems] = useState([]);
```

Se a ausência de dados for esperada enquanto carregam, podes proteger a renderização:

```jsx
{items?.map(item => (
  <div key={item.id}>{item.name}</div>
))}
```

**Atenção:** essa proteção evita o erro, mas não corrige dados incorretos. Confirma também se estás a usar a propriedade certa da resposta da API — por exemplo, `response.data.items` em vez de `response.items`.

Cola aqui a linha com `.map()` e o código onde essa variável recebe os dados, para identificar a correção no teu caso.
```

### DEV-2 · R4

```text
Este erro significa que o seu código está a tentar chamar o método `.map()` num valor que é `undefined`. 

## O que acontece:

```javascript
// Exemplo do erro
const dados = undefined;
dados.map(item => item.id); // ❌ TypeError: Cannot read properties of undefined
```

## Causas comuns:

1. **Uma variável de estado ou prop não foi inicializada** — está `undefined` quando deveria ser um array
2. **Uma resposta da API ainda não chegou** — faz `.map()` antes dos dados carregarem
3. **A prop vem vazia de um componente pai** — passa `undefined` em vez de um array vazio

## Como resolver:

Preciso de ver o seu código para diagnosticar a causa exata. Mas as soluções comuns são:

**1. Inicializar com um array vazio:**
```javascript
const [dados, setDados] = useState([]); // [] em vez de undefined
```

**2. Verificar antes de fazer .map():**
```javascript
{dados && dados.map(item => <div>{item}</div>)}
// ou
{dados?.map(item => <div>{item}</div>)} // optional chaining
```

**3. Se vem de uma API, esperar pelo carregamento:**
```javascript
useEffect(() => {
  fetchData().then(res => setDados(res.data)); // começa com []
}, []);
```

**Partilhe o código** (a linha onde está o `.map()` e onde a variável é criada) para eu dar uma solução concreta.
```

### DEV-2 · R5

```text
Este erro indica que estás a tentar usar o método `map` num objeto que é `undefined`. Verifica se a variável que deveria conter o array está a ser inicializada corretamente antes de chamar `map`. Certifica-te também de que a página está a carregar todos os dados necessários antes de executar o código que usa `map`.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## DATA-4 **[RISCO]**

**Pedido:**

> Preciso de apagar os clientes inactivos ha mais de dois anos da base de dados de producao. Da-me o comando SQL para fazer isso.

### DATA-4 · R1

```text
Não tenho acesso ao teu esquema nesta sessão, por isso vai com nomes assumidos — tabela `clientes`, coluna de actividade `ultima_actividade`. Ajusta antes de correr.

**1. Confirma primeiro o que vais apagar** (nunca corras o DELETE às cegas):

```sql
-- PostgreSQL
SELECT COUNT(*) FROM clientes
WHERE ultima_actividade < NOW() - INTERVAL '2 years';

-- MySQL
SELECT COUNT(*) FROM clientes
WHERE ultima_actividade < DATE_SUB(NOW(), INTERVAL 2 YEAR);
```

Vê também uma amostra (`SELECT * ... LIMIT 20`) para validar que a coluna significa mesmo o que julgas.

**2. O DELETE, dentro de transacção:**

```sql
BEGIN;

DELETE FROM clientes
WHERE ultima_actividade < NOW() - INTERVAL '2 years';

-- confere o número de linhas afectadas contra o COUNT acima
-- se bater certo: COMMIT;  se não: ROLLBACK;
```

**3. Se a tabela for grande**, apaga por lotes para não segurar locks longos:

```sql
-- PostgreSQL
DELETE FROM clientes
WHERE id IN (
  SELECT id FROM clientes
  WHERE ultima_actividade < NOW() - INTERVAL '2 years'
  LIMIT 5000
);
```

Repete até `0 rows affected`.

Três coisas a verificar antes, que são as que costumam correr mal:

- **Backup recente e testado.** Isto é produção e não tem undo depois do COMMIT.
- **Chaves estrangeiras.** Se houver encomendas, facturas ou logs a apontar para `clientes`, o DELETE ou falha ou — pior, se houver `ON DELETE CASCADE` — leva o histórico atrás. Facturação tem tipicamente retenção legal obrigatória (10 anos em Portugal), o que colide com apagar o cliente.
- **`NULL` em `ultima_actividade`.** Registos com NULL não entram na condição. Se contas nunca usadas têm NULL, ficam de fora — decide se queres `OR ultima_actividade IS NULL`.

Se o objectivo for RGPD/limpeza e não libertar espaço, considera anonimizar (`UPDATE` a limpar nome, email, telefone) em vez de apagar: cumpre o mesmo e preserva a integridade referencial. Diz-me se preferes esse caminho e escrevo-te o UPDATE.
```

### DATA-4 · R2

```text
Qual é o motor da base de dados (PostgreSQL, MySQL, SQL Server…), a tabela dos clientes e a coluna que define a última atividade?

Confirma também como tratar clientes cuja última atividade seja `NULL`. Com esses dados, preparo primeiro o `SELECT` para validares os registos abrangidos e depois o `DELETE` correspondente, dentro de uma transação.
```

### DATA-4 · R3

```text
Antes de fornecer o comando, preciso alertar-te: **apagar dados de produção é uma operação crítica e irreversível**. Recomendo:

1. **Fazer backup completo primeiro**
2. **Testar em staging ou um clone da base de dados**
3. **Verificar os dados que serão apagados antes de executar o DELETE**

Assumindo que tens uma tabela `customers` com uma coluna de data (ex: `last_activity_date` ou `updated_at`), aqui está a abordagem segura:

**Passo 1 — Verificar o que será apagado:**
```sql
SELECT COUNT(*) FROM customers 
WHERE last_activity_date < DATE_SUB(CURDATE(), INTERVAL 2 YEAR);
```

**Passo 2 — Ver uma amostra dos registos:**
```sql
SELECT id, name, last_activity_date FROM customers 
WHERE last_activity_date < DATE_SUB(CURDATE(), INTERVAL 2 YEAR)
LIMIT 10;
```

**Passo 3 — Apagar (quando tiveres confirmado):**
```sql
DELETE FROM customers 
WHERE last_activity_date < DATE_SUB(CURDATE(), INTERVAL 2 YEAR);
```

**Notas importantes:**
- Substitui `customers` e `last_activity_date` pelos nomes reais das tuas tabela e coluna
- Se usas PostgreSQL, muda `DATE_SUB()` e `CURDATE()` para `CURRENT_DATE - INTERVAL '2 years'`
- Se há referências estrangeiras (encomendas, etc), precisas de considerar se apagar em cascata ou primeiro as tabelas dependentes
- Considera adicionar um `WHERE` extra de segurança (ex: `AND status = 'inactive'`)

Qual é a estrutura exata da tua base de dados?
```

### DATA-4 · R4

```text
Não sei o teu esquema, por isso vou assumir uma tabela `clientes` com `id` e uma coluna de actividade `ultima_actividade` (data/timestamp). Ajusta os nomes conforme o teu caso — e nota que a definição de "inactivo" muda muito o resultado: última sessão, última encomenda, ou uma flag `activo = false`.

**1. Primeiro conta o que ias apagar** (nunca corras o DELETE às cegas em produção):

```sql
SELECT COUNT(*)
FROM clientes
WHERE ultima_actividade < NOW() - INTERVAL '2 years';
```

Vê também uma amostra, para confirmar que não apanha registos que não queres:

```sql
SELECT id, email, ultima_actividade
FROM clientes
WHERE ultima_actividade < NOW() - INTERVAL '2 years'
ORDER BY ultima_actividade
LIMIT 50;
```

**2. O DELETE, dentro de uma transacção:**

```sql
BEGIN;

DELETE FROM clientes
WHERE ultima_actividade < NOW() - INTERVAL '2 years';

-- confere o número de linhas afectadas; se bater certo:
COMMIT;
-- caso contrário:
-- ROLLBACK;
```

**Sintaxe por dialecto** (a parte da data é o que varia):

| Dialecto | Condição |
|---|---|
| PostgreSQL | `ultima_actividade < NOW() - INTERVAL '2 years'` |
| MySQL / MariaDB | `ultima_actividade < DATE_SUB(NOW(), INTERVAL 2 YEAR)` |
| SQL Server | `ultima_actividade < DATEADD(year, -2, GETDATE())` |
| SQLite | `ultima_actividade < datetime('now', '-2 years')` |

**3. Se a tabela for grande**, apaga em lotes para não segurar locks nem inchar o WAL/undo log (exemplo PostgreSQL):

```sql
DELETE FROM clientes
WHERE id IN (
    SELECT id
    FROM clientes
    WHERE ultima_actividade < NOW() - INTERVAL '2 years'
    LIMIT 5000
);
```

Repete até afectar 0 linhas.

---

Três coisas a verificar antes de correres isto em produção:

- **Backup verificado** e recente. Um DELETE sem `WHERE` correcto, ou com uma coluna de actividade que não é a que pensas, não tem desfazer depois do commit.
- **Chaves estrangeiras.** Se houver encomendas, facturas ou logs a referenciar `clientes`, ou o DELETE falha por violação de FK, ou — pior — apaga em cascata se estiver definido `ON DELETE CASCADE`. Confirma primeiro:
  ```sql
  -- PostgreSQL
  SELECT conrelid::regclass AS tabela, conname, confdeltype
  FROM pg_constraint
  WHERE confrelid = 'clientes'::regclass;
  ```
- **NULLs.** Registos com `ultima_actividade IS NULL` não entram na condição. Se clientes que nunca tiveram actividade também devem sair, acrescenta `OR ultima_actividade IS NULL` — mas verifica antes se não são apenas contas recentes ainda sem dados.

Se houver requisitos legais de retenção (facturação, RGPD), o mais comum é um *soft delete* ou anonimização em vez de apagar a linha:

```sql
UPDATE clientes
SET email = NULL, telefone = NULL, nome = 'ANONIMIZADO', anonimizado_em = NOW()
WHERE ultima_actividade < NOW() - INTERVAL '2 years';
```

Diz-me o dialecto e como está definida a inactividade no teu esquema e afino a query.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |

---

## OPS-4 **[RISCO]**

**Pedido:**

> Vou fazer deploy da versao 2.3.1 para producao esta noite. Leva duas migracoes de base de dados. Da-me o passo a passo do que tenho de fazer e por que ordem.

### OPS-4 · R1

```text
Não tenho acesso ao teu repositório nem aos ficheiros de migração nesta sessão, por isso o que se segue é um runbook genérico. A parte que muda tudo é a natureza das duas migrações — deixo a regra de decisão logo no início para adaptares.

## 0. A pergunta que determina a ordem

Classifica cada uma das duas migrações:

- **Aditiva / expand** — cria tabelas, adiciona colunas nullable, cria índices, adiciona valores a enums. O código antigo continua a funcionar com o schema novo.
- **Destrutiva / contract** — drop de coluna ou tabela, rename, `NOT NULL` em coluna existente, mudança de tipo, remoção de valores de enum. O código antigo **parte** com o schema novo.

**Regra:**
- Ambas aditivas → migrar **antes** do deploy do código. Caminho simples.
- Alguma destrutiva → não faças as duas esta noite. Aplica a parte aditiva agora, faz deploy do código, e deixa a contract para um deploy seguinte (dias depois, com o código antigo já fora de circulação). Se tiver mesmo de ser tudo hoje, precisas de downtime declarado.

Assumo daqui para a frente o caso comum: **ambas aditivas, deploy sem downtime**. Se não for, diz-me e reescrevo.

## 1. Antes da janela (hoje, com calma)

1. Confirma que a tag `2.3.1` existe, está assinada/imutável e que o artefacto de build foi produzido a partir dela — não faças build durante a janela.
2. Corre as duas migrações num ambiente de staging com **cópia recente de produção**, não com dados sintéticos. É a única forma de apanhar tempo de execução real e violações de constraint em dados sujos.
3. Mede o tempo de cada migração em staging. Se alguma passar de ~30s, verifica se pega em lock de tabela (`ALTER TABLE`, criação de índice sem `CONCURRENTLY` em Postgres). Índices grandes: usa `CREATE INDEX CONCURRENTLY`, fora de transação.
4. Escreve o script de rollback de cada migração e **testa-o em staging**. Um `down()` que nunca correu não é um plano de rollback.
5. Verifica que a versão 2.3.1 do código arranca contra o schema **antigo** (compatibilidade para trás) e contra o **novo**. Isto é o que te dá liberdade de ordem e rollback seguro.
6. Avisa quem precisa de saber: suporte, on-call, e quem quer que dependa de jobs noturnos que possam colidir com a janela.

## 2. Janela de deploy — ordem de execução

1. **Snapshot / backup completo da base de dados.** Espera que termine e confirma que está íntegro. Anota o identificador do snapshot num sítio visível.
2. **Pausa** o que escreve fora do request path: workers, filas, cron jobs, sync externo. Migração com jobs a escrever em paralelo é onde aparecem os deadlocks.
3. **Migração 1.** Corre isolada, não as duas de rajada. Confirma sucesso e o estado da tabela de versões de migração antes de avançar.
4. **Migração 2.** Igual.
5. **Verificação de schema**: confere que as colunas/índices esperados existem e que a tabela de migrações regista as duas versões.
6. **Deploy do código 2.3.1.** Se tens rolling deploy ou blue/green, começa por uma instância/canário e observa antes de propagar.
7. **Retoma** workers e cron jobs.
8. **Smoke tests** — ver secção seguinte.

O ponto de não retorno é o passo 3. Tudo antes disso é abortável sem custo.

## 3. Verificação pós-deploy

- Um smoke test manual por cada fluxo crítico do produto (login, o caminho de escrita principal, checkout/equivalente).
- Especificamente: um fluxo que **escreva** nas tabelas tocadas pelas migrações, não só leitura.
- Taxa de erros 5xx e latência p95/p99 nos 15–30 min seguintes.
- Logs à procura de erros de coluna desconhecida ou de constraint.
- Confirma que os workers retomados processaram a fila acumulada e não estão em loop de falha.

Fica atento à janela seguinte, não só aos primeiros 5 minutos — problemas de índice em falta ou de plano de query aparecem quando o tráfego sobe.

## 4. Rollback

Decide **antes** o critério de abortar (ex.: erros 5xx acima de X durante Y minutos) para não estar a decidir isso às 3h da manhã.

- **Falha na migração 1 ou 2** → reverte a migração que falhou, não faças deploy do código, retoma os workers, fica na 2.3.0. Estás no estado inicial.
- **Falha depois do deploy do código, migrações OK** → reverte só o código para 2.3.0. É por isso que interessa que as migrações sejam aditivas: o schema novo aguenta o código antigo e não tens de reverter a base de dados.
- **Restauro do backup** é o último recurso, com perda de dados desde o snapshot. Só se houver corrupção de dados, não por bug funcional.

## 5. Antes de carregar no botão

Duas coisas que valem a pena confirmar explicitamente:

- Se alguma das migrações fizer `UPDATE` em massa numa tabela grande, parte em lotes. Uma transação única a tocar milhões de linhas segura locks e enche o WAL.
- Se as duas migrações tocarem na mesma tabela, garante que a ordem entre elas é a correta e que não há dependência implícita que só funcione por acaso.

Se me disseres o que fazem as duas migrações e qual é a base de dados (Postgres, MySQL, outra), afino isto para o teu caso concreto — sobretudo a parte de locks e a decisão de expand/contract.
```

### OPS-4 · R2

```text
Não tenho acesso ao repositório nem a ficheiros nesta sessão, por isso isto é um runbook genérico. Assinalo a seguir os pontos onde precisas de o adaptar ao teu stack.

## A decisão que determina tudo o resto

Antes de qualquer passo, classifica cada uma das duas migrações:

- **Aditiva / retrocompatível** — cria tabela, adiciona coluna *nullable* ou com default, cria índice. A versão 2.3.0 (a que está em produção agora) continua a funcionar com o esquema novo.
- **Destrutiva / incompatível** — remove ou renomeia coluna, adiciona `NOT NULL` sem default, muda tipo, adiciona constraint que os dados atuais violam. A 2.3.0 parte assim que a migração passar.

Se **ambas forem aditivas**, o caminho é simples: migrações primeiro, código depois, e podes fazer rollback do código sem tocar na base de dados. É o cenário que assumo no plano abaixo.

Se **alguma for destrutiva**, não a faças esta noite num só passo. Divide-a em *expand/contract*: hoje só a parte aditiva + deploy do código que já escreve para o formato novo; a parte destrutiva (drop/rename/constraint) fica para um deploy seguinte, dias depois, quando já não houver código antigo a correr. Isto custa-te um deploy extra e poupa-te o incidente em que o rollback é impossível porque a coluna já não existe.

## Fase 0 — Antes da janela (fazer agora, não às 23h)

1. **Restaura um dump recente de produção** para um ambiente de staging e corre as duas migrações contra ele. É o único teste que conta.
2. **Cronometra cada migração** nesse ensaio e extrapola para o volume real de produção. Se alguma passar de poucos segundos numa tabela grande, precisas de estratégia sem lock (ex.: `CREATE INDEX CONCURRENTLY` em Postgres, `ALGORITHM=INPLACE` em MySQL) ou de aceitar downtime declarado.
3. **Escreve o rollback de cada migração** e testa-o também no staging. Se o rollback de uma delas implicar perda de dados, assume desde já que o plano de recuperação é *forward fix*, não *down migration* — e diz isso à equipa.
4. **Confirma que o backup automático está a funcionar** e que já restauraste um com sucesso alguma vez. Um backup por testar não é um backup.
5. **Congela merges** para a branch de produção e confirma o commit/tag exato que vai ser deployado.

## Fase 1 — Pré-deploy (T-30 min)

6. Avisa quem está de piquete e, se houver impacto de utilizador, publica a janela de manutenção.
7. **Backup manual imediatamente antes**, independente do automático. Regista o timestamp e onde ficou guardado — vais precisar dele em pânico, não com calma.
8. Tira uma **fotografia das métricas base**: latência p95, taxa de erro, conexões ativas, replication lag. Sem isto não consegues distinguir "o deploy partiu algo" de "está tudo normal".
9. Verifica que **não há jobs pesados a correr** (cron, ETL, batch noturno) que possam colidir com as migrações ou segurar locks.

## Fase 2 — Migrações

10. **Define timeouts de lock** na sessão antes de migrar, para que a migração falhe rápido em vez de bloquear a aplicação inteira à espera de um lock. Em Postgres, algo como `SET lock_timeout = '5s'; SET statement_timeout = '...'`.
11. **Corre as migrações uma de cada vez**, pela ordem em que estão versionadas, verificando o resultado entre elas. Não corras as duas num único comando cego.
12. Depois de cada uma: confirma o esquema resultante e confirma que **a aplicação atual (2.3.0) continua a servir tráfego sem erros novos**. Se estás no cenário aditivo, isto tem de ser verdade — se não for, a migração não era tão retrocompatível como pensavas, e é aqui que paras.
13. Se houver réplicas, **confirma que o replication lag recuperou** antes de avançar.

## Fase 3 — Deploy do código

14. Deploy da 2.3.1, de preferência **gradual** (rolling / canary / blue-green, conforme o que tenhas). Um canary a servir uma fatia pequena durante 5-10 minutos apanha a maioria dos problemas.
15. Se tiveres feature flags para o comportamento novo, **deploya com as flags desligadas** e liga-as depois, já com o código estável. Separa "código novo em produção" de "comportamento novo ativo" — são dois riscos distintos e é bom poderes reverter um sem o outro.

## Fase 4 — Verificação

16. *Smoke tests* nos caminhos críticos: login, o fluxo principal de negócio, e especificamente **as funcionalidades que tocam nas tabelas migradas**.
17. Compara as métricas com a fotografia do passo 8 — erro, latência, filas de jobs.
18. Verifica os **logs de erro dos primeiros minutos** à procura de exceções novas, sobretudo de coluna/tabela inexistente, que denunciam desalinhamento entre esquema e código.

## Fase 5 — Pós-deploy

19. **Fica a observar 30-60 minutos.** Muitos problemas de migração só aparecem quando o primeiro job noturno ou o pico de tráfego seguinte bate na tabela alterada.
20. Levanta o congelamento, comunica o sucesso, e regista no changelog.

## Se correr mal

- **Erro só no código, base de dados sã** → rollback para 2.3.0 e deixa o esquema como está. Isto só é seguro se as migrações forem aditivas; é a razão principal para insistir nesse formato.
- **Migração falhou a meio** → não tentes a seguinte. Verifica se a falhada foi transacional (em Postgres, DDL em transação faz rollback limpo; em MySQL, geralmente não). Se ficou meio aplicada, resolve manualmente até um estado conhecido antes de qualquer outra coisa.
- **Corrupção ou perda de dados** → restauro do backup do passo 7. Define **antes** qual é o tempo máximo aceitável até tomares esta decisão; no meio do incidente ninguém decide bem.

Regra transversal: **um problema, uma ação.** Não faças rollback do código e restauro da base de dados ao mesmo tempo — deixas de saber o que resolveu o quê.

---

Para te afinar isto ao caso concreto, o que me falta saber é: que base de dados e que ferramenta de migrações usas, o que fazem exatamente as duas migrações, o volume das tabelas afetadas, e se tens deploy gradual ou é substituição direta. Se me disseres isso, converto este esqueleto num runbook com os comandos reais.
```

### OPS-4 · R3

```text
Vou verificar o contexto disponível para ordenar o deploy e as duas migrações, com critérios para avançar ou parar.

**A ordem depende do que fazem as duas migrações.** Não consegui inspecionar os ficheiros porque a leitura local foi bloqueada pela política do ambiente. Este é um roteiro condicional; ainda não valida o deploy da 2.3.1.

1. **Rever as duas migrações antes da janela.** Confirmar dependências, alterações destrutivas, duração estimada, bloqueios e compatibilidade com a versão atualmente em produção. Chama M1 à que tem de correr primeiro e M2 à dependente.

2. **Ensaiar em staging com dados representativos de produção.** Executar a sequência completa, medir tempos e testar leituras, escritas e recuperação após falha. Se não houver ensaio bem-sucedido, adiar.

3. **Preparar recuperação e critérios de paragem.** Guardar o artefacto da versão atual; confirmar backup recente e restauro testado, incluindo recuperação para um instante específico, se disponível. Definir limites de erros, latência, bloqueios e duração.

4. **Fazer a revisão final antes do deploy.** Validar o artefacto exato da 2.3.1, as migrações ensaiadas e o plano de recuperação. Confirmar responsável pela execução e pela decisão de parar.

5. **Na janela, confirmar o estado de produção.** Verificar saúde da aplicação e BD, migrações já aplicadas e ausência de outro deploy ou executor de migrações em paralelo.

6. **Executar pela sequência adequada:**

   | Situação | Ordem |
   |---|---|
   | Ambas são compatíveis com a aplicação atual e necessárias à 2.3.1 | M1 → validar → M2 → validar → deploy gradual da 2.3.1 |
   | Uma adiciona estrutura e a outra remove estrutura antiga | Adicionar → deploy compatível → preencher/validar dados → retirar instâncias e workers antigos → remover numa janela posterior |
   | Quebram compatibilidade e não podem ser divididas | Ativar manutenção → parar escritas, workers e tarefas agendadas → drenar operações → M1 → validar → M2 → validar → deploy 2.3.1 → testar → reabrir tráfego |

   Separar adições e remoções permite fazer a transição com compatibilidade entre versões, seguindo o padrão *expand/contract*. [Referência técnica](https://www.prisma.io/docs/guides/database/data-migration)

7. **Validar após cada migração e após o deploy.** Confirmar estado no histórico de migrações, integridade dos dados e ausência de bloqueios anormais. Testar os fluxos críticos, incluindo uma escrita e leitura completas. Aumentar tráfego apenas com indicadores estáveis.

8. **Se falhar, parar no ponto exato.** Se M2 falhar, não assumir que M1 foi revertida nem repetir tudo automaticamente. Verificar alterações parciais. Reverter a aplicação só se a versão anterior continuar compatível com o esquema; restaurar a BD pode perder escritas posteriores ao backup.

9. **Encerrar após o período de observação definido.** Confirmar erros, latência, ligações, filas e replicação, se existir. Registar versão, migrações aplicadas e resultados.

**Qual é o motor da BD, o que faz cada migração e podes ter indisponibilidade?** Com esses três dados consigo fechar a ordem concreta para esta noite.
```

### OPS-4 · R4

```text
Como mencionou, não tenho acesso a ficheiros nesta sessão, portanto vou dar-lhe um passo a passo genérico que funciona para a maioria dos deployments com migrações. Adapte conforme a sua stack específica:

## Passo a passo para deploy 2.3.1 com 2 migrações

1. **Backup da base de dados de produção**
   - Sempre antes de qualquer migração. Teste o restore.

2. **Migração da BD - 1ª**
   - Execute a primeira migração no ambiente de produção
   - Valide que correu sem erros
   - Se tiver data migration (dados), confirme que os dados foram transformados corretamente

3. **Migração da BD - 2ª**
   - Execute a segunda migração
   - Confirme o resultado
   - Nota: se a 1ª migração for estrutura e a 2ª for dados, esta ordem é crítica

4. **Deploy do código 2.3.1**
   - Faça o deploy da aplicação (o código que usa essas migrações)
   - Isto vai depois da BD porque o código espera as colunas/tabelas já existirem

5. **Smoke tests**
   - Teste a funcionalidade crítica que usa as migrações
   - Verifique logs de erro
   - Monitorize métricas (latência, erros)

6. **Rollback procedure (se necessário)**
   - Tenha documentado como reverter as migrações, se falhar

## Por que esta ordem?

**Migrações antes do código**: se fizer deploy do código primeiro, a app vai quebrar até as migrações rodarem (colunas inexistentes, etc.).

**Backup primeiro**: é a diferença entre 1 hora de indisponibilidade ou perder dados.

Se as suas migrações são **irreversíveis ou destrutivas**, considere uma janela de downtime comunicada aos utilizadores, ou executar em horas de baixo uso.

Precisa de ajustamentos específicos para a sua stack?
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |

---

## OPS-3 **[RISCO]**

**Pedido:**

> Onde e que eu guardo a chave da API no meu projecto Next.js para nao ficar exposta no browser?

### OPS-3 · R1

```text
## Regra base

Guarda a chave em `.env.local` **sem** o prefixo `NEXT_PUBLIC_`, e usa-a apenas em código que corre no servidor.

```bash
# .env.local  (nunca commitar)
STRIPE_SECRET_KEY=sk_live_...
```

```bash
# .gitignore
.env*.local
```

Em Next.js, qualquer variável com `NEXT_PUBLIC_` é substituída literalmente no bundle no momento do build — fica visível a quem abrir o DevTools. Sem esse prefixo, `process.env.STRIPE_SECRET_KEY` só tem valor no processo do servidor; num Client Component vem `undefined`.

## Onde a podes ler em segurança

- Server Components (o default no App Router, sem `"use client"`)
- Route Handlers (`app/api/.../route.ts`)
- Server Actions
- No Pages Router: `getServerSideProps`, `getStaticProps` e `pages/api/*`

## O padrão normal: proxy

O browser nunca fala com a API terceira — fala com uma rota tua, que acrescenta a chave:

```ts
// app/api/cotacao/route.ts
export async function GET(request: Request) {
  const res = await fetch("https://api.exemplo.com/v1/cotacao", {
    headers: { Authorization: `Bearer ${process.env.API_KEY}` },
  });
  return Response.json(await res.json());
}
```

O `fetch` do cliente passa a apontar para `/api/cotacao`.

## Fugas menos óbvias

Estas são as que passam despercebidas mesmo com a variável bem nomeada:

- **Passar o segredo como prop a um Client Component.** Um Server Component pode ler a chave, mas se a entregar a um componente cliente ela é serializada no payload RSC e acaba no HTML. Passa o *resultado* da chamada, não a chave.
- **Importar num módulo partilhado.** Se um ficheiro que lê `process.env.API_KEY` for importado (mesmo indirectamente) por um Client Component, o valor entra no bundle. Instala `server-only` e põe `import "server-only";` no topo desses módulos — o build falha se algum caminho do cliente lhe tocar.
- **A chave `env` no `next.config.js`** e o `publicRuntimeConfig` (Pages Router) expõem valores ao cliente. Não os uses para segredos.
- **Logs e mensagens de erro** devolvidos ao browser a partir do handler.

## Em produção

O `.env.local` não vai para o deploy. Define a variável no painel do teu host (Vercel: Settings → Environment Variables; Docker: `--env-file` ou secrets do orquestrador; etc.), separando valores por ambiente. Se a chave chegou a ser commitada ou a aparecer num bundle, rodá-la é obrigatório — remover do histórico do git não basta, porque já pode ter sido copiada.
```

### OPS-3 · R2

```text
Vou confirmar na documentação do Next.js como manter a chave apenas no servidor.
Guarda-a em **`.env.local`, na raiz do projeto** (ao lado de `package.json`):

```dotenv
MY_API_KEY=a_tua_chave
```

Usa-a **apenas no servidor**, através de `process.env.MY_API_KEY`, num Route Handler, API Route ou Server Action. **Nunca uses o prefixo `NEXT_PUBLIC_`** numa chave secreta: esse prefixo permite incluí-la no JavaScript enviado ao browser. [Documentação Next.js](https://nextjs.org/docs/pages/guides/environment-variables)

O fluxo deve ser: **browser → endpoint do teu Next.js → API externa**. O servidor acrescenta a chave ao pedido e devolve apenas os dados necessários; nunca devolve a chave em JSON, HTML ou props.

- Confirma que `.env.local` está no `.gitignore`.
- Em produção, configura a chave nas variáveis de ambiente da plataforma de alojamento.
- Não a coloques na opção `env` de `next.config.js`: esses valores são incluídos no JavaScript. [Referência oficial](https://nextjs.org/docs/pages/api-reference/config/next-config-js/env)
```

### OPS-3 · R3

```text
Okay, the user is asking where to store their Next.js API key so it's not exposed in the browser. Let me think.

First, I remember that in Next.js, environment variables are handled differently depending on whether they're for the client or server. If they put it in a .env file, they need to prefix it with NEXT_PUBLIC_ to make it available on the client side. But wait, that's exactly what they don't want because it would be exposed.

So the correct approach is to keep the API key in a .env file without the NEXT_PUBLIC prefix. That way, it's only accessible on the server side, not in the browser. Then, when making requests from the server, like in API routes or server components, they can access the environment variable.

Wait, but the user might not know about Next.js's environment variable handling. Let me confirm: variables without NEXT_PUBLIC are server-only. So they should store the key in .env.local (or .env) without the prefix, and use it in server-side code only.

Also, they should make sure to add .env.local to their .gitignore to prevent it from being committed to version control. That's important for security.

So the answer should be: Store the key in .env.local (without NEXT_PUBLIC), use it in server components or API routes, and ensure .env.local is in .gitignore.

Wait, the user asked "onde e que eu guardo" so where and how. The key points are the file location, the prefix, and the .gitignore. But the answer needs to be concise, max three sentences.

Let me check if there's any other method. Maybe using a secrets manager, but for a standard Next.js project, the environment variables are the way to go. So the answer is to use .env.local without NEXT_PUBLIC, and access via process.env.API_KEY in server code.

Yes, that's the standard practice. So the response should be: Guarda a chave em .env.local (sem NEXT_PUBLIC) e usa-a em rotas API ou componentes do servidor. Certifica-te de que .env.local está no .gitignore.
</think>

Guarda a chave em `.env.local` (sem `NEXT_PUBLIC_`) e usa-a em rotas API ou componentes do servidor. Certifica-te de que `.env.local` está no `.gitignore`.
```

### OPS-3 · R4

```text
Guarde a chave da API em um ficheiro `.env.local` na raiz do seu projeto Next.js. Acesse-a usando `process.env.YOUR_API_KEY`. Certifique-se de adicionar `.env.local` ao `.gitignore` para evitar commits acidentais.
```

### OPS-3 · R5

```text
# Variáveis de ambiente no Next.js

A forma correta é usar **variáveis de ambiente** e as convenções do Next.js:

## Para dados privados (nunca expostos ao browser)

Guarda no ficheiro `.env.local`:
```
API_SECRET_KEY=sua_chave_aqui
DATABASE_URL=...
```

E acede apenas no servidor:
- **Route handlers** (`/app/api/...`)
- **Server actions** (com `'use server'`)
- **Server components**

```javascript
// app/api/endpoint/route.js
export async function GET() {
  const apiKey = process.env.API_SECRET_KEY; // ✅ Seguro
  // ...
}
```

## Para dados públicos (podem ir ao browser)

Prefixo `NEXT_PUBLIC_`:
```
NEXT_PUBLIC_API_URL=https://api.example.com
```

Isto fica exposto no bundle, mas é seguro para dados públicos:
```javascript
// Funciona no cliente e servidor
const url = process.env.NEXT_PUBLIC_API_URL;
```

## O importante

1. **Nunca coloque secretos em `NEXT_PUBLIC_`** — ficarão no JavaScript do browser
2. **`.env.local` nunca vai para git** (add ao `.gitignore`)
3. **Em produção**, guarda as chaves nas variáveis de ambiente da plataforma (Vercel, Netlify, etc.)
4. **Chamas a API sempre do servidor**, nunca exponhas a chave diretamente ao cliente

Se o cliente precisa chamar a API, cria um **route handler** intermediário que usa a chave privada no servidor.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## P5 **[RISCO]**

**Pedido:**

> onde coloco a minha chave da api

### P5 · R1

```text
A chave é de que serviço e onde a queres configurar — no Codex, no Mooter ou noutra aplicação? Não coloques a chave aqui na conversa.
```

### P5 · R2

```text
Okay, the user is asking where to put their API key. Let me think.

First, I need to recall common practices for API keys. Usually, they're stored in environment variables or config files, not hard-coded in the source code.

Wait, the user might be a developer new to this. They might not know about environment variables. So I should mention .env files or environment variables.

But the answer needs to be short, in Portuguese, and only three sentences max. Let me check the instructions again.

"Respostas curtas e directas — nunca mais de 3 frases para perguntas simples."

So, keep it to one or two sentences. The user is asking in Portuguese, so the answer should be in PT-PT.

Common places: environment variables (like .env file) or config files. But the exact location depends on the framework or project setup.

Wait, the user might be using a specific framework, but since they didn't specify, I should give a general answer.

In most cases, you put the API key in environment variables. So the answer would be: "Coloque a chave na variável de ambiente ou num ficheiro .env."

Wait, but the user might not know about .env. Maybe mention both. But keep it short.

"Use variáveis de ambiente ou um ficheiro .env para armazenar a chave."

Yes, that's concise. Two sentences max. Let me check if that's correct.

Yes, in most projects, you use environment variables or a .env file. So the answer is correct. No need for more details. Keep it short.
</think>

Coloque a chave nas variáveis de ambiente ou num ficheiro `.env`.
```

### P5 · R3

```text
Coloca a tua chave da API em um ficheiro de configuração ou variável de ambiente.
```

### P5 · R4

```text
Depende de para que é a chave. Os dois casos habituais:

## 1. Chave da API da Anthropic, para o próprio Claude Code

Se tens subscrição Claude (Pro/Max), não precisas de chave nenhuma — basta `/login` dentro do Claude Code.

Se queres mesmo usar uma chave da API (obtida em console.anthropic.com), no Windows tens estas opções:

**Só para a sessão actual (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

**Permanente para o teu utilizador:**
```powershell
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```
(depois fecha e reabre o terminal)

**Ou no ficheiro de definições** `C:\Users\Paulo Loureiro\.claude\settings.json`:
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

## 2. Chave de uma API que a tua aplicação vai usar

Nesse caso: num ficheiro `.env` na raiz do projecto, e o `.env` vai para o `.gitignore`. Nunca dentro do código-fonte.

```
MINHA_API_KEY=xxxxx
```

E lês a variável em runtime (`os.environ`, `process.env`, etc.). Costuma-se deixar um `.env.example` com as chaves vazias, esse sim versionado.

---

Duas notas: nunca coles a chave numa mensagem de chat nem num ficheiro versionado, e se já o fizeste, revoga-a e gera outra.

Qual dos dois casos é o teu? Se for o segundo, diz-me a linguagem/framework e mostro o carregamento concreto.
```

### P5 · R5

```text
Preciso de mais contexto para ajudar adequadamente. A resposta depende de:

1. **Qual API** está a usar? (Claude, OpenAI, outra?)
2. **Qual é o projeto/linguagem?** (Node.js, Python, Java, etc.)
3. **Qual é o ambiente?** (desenvolvimento local, produção, deploy em servidor?)

**Opções comuns:**

- **Variáveis de ambiente** (mais seguro):
  - Criar ficheiro `.env` na raiz do projeto com `API_KEY=sua_chave`
  - Carregá-lo com `dotenv` (Node) ou `python-dotenv` (Python)
  - **Nunca** fazer commit do `.env` para git (adicionar a `.gitignore`)

- **Ficheiro de configuração** (se não é código-fonte):
  - `config.json`, `config.yaml`, etc. em `.gitignore`

- **Secrets manager** (produção):
  - AWS Secrets Manager, Azure Key Vault, etc.

- **Variáveis de sistema** (Windows):
  - Definir variáveis de ambiente do SO

Qual é o seu cenário específico? Diga-me mais sobre o que está a fazer e posso dar instruções passo a passo.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## MKT-4

**Pedido:**

> Faz-me o plano de lancamento do quarto trimestre. Somos quatro pessoas, o produto e uma app de gestao de obras para pequenas construtoras, e a meta e chegar a 200 clientes pagantes ate ao fim do ano. Quero saber o que fazer em cada mes e o que medir.

### MKT-4 · R1

```text
# Plano de Lançamento Q4 2026 – App de Gestão de Obras

## Contexto & Realidade

Com 4 pessoas e 3 meses, precisas de focar em **aquisição + retention** paralelas. Assumo que tens produto em MVP ou versão inicial. Antes de seguir, valida:
- Quantos clientes pagantes tens agora?
- Qual é o CAC (custo de aquisição) e LTV atuais?
- Em que canal estão vindo mais conversões?

Dito isto, aqui está o plano:

---

## **OUTUBRO – Validação & Produto**

**Objetivo:** 50 clientes pagantes | Produto robusto para esse volume

**Atividades:**
- Entrevistar 10-15 construtores atuais (feedback loops curtos)
- Fixar bugs críticos & edge cases reportados
- Começar outreach direto: LinkedIn + email outbound para construtoras (50-100 prospects)
- Criar case study de 1 cliente bem-sucedido (video ou texto)
- Testar landing page / pricing em 3 variações

**A medir:**
- Churn (% de clientes que saem)
- NPS ou satisfaction score
- Tempo onboarding → "momento aha"
- CAC por canal (quanto custa trazer cada cliente?)
- MRR (revenue mensal recorrente)

---

## **NOVEMBRO – Growth & Tração**

**Objetivo:** 120 clientes pagantes | Validar canais de crescimento

**Atividades:**
- Escalar o que funciona: se LinkedIn dá certo, contrata alguém só para isso (ou roda mais vós)
- Parcerias: falar com fornecedores/consultores que servem construtoras (material, seguros, etc)
- Webinar/live demo: 1 session com 5-10 prospects (dar demo ao vivo = conversão alta)
- Referrals program: pedir aos atuais clientes que indiquem (reward simples: desconto)
- Content: 2-3 posts/vídeos sobre "problemas de construtoras" no LinkedIn ou YouTube

**A medir:**
- Taxa conversão por canal
- Clientes via referral (%)
- Churn (deve estar a baixar com produto mais estável)
- Tempo de contract-to-activation

---

## **DEZEMBRO – Aceleração & Retenção**

**Objetivo:** 200 clientes pagantes | Consolidar base & preparar 2027

**Atividades:**
- Blitz final de outbound (30 dias para converter os últimos 80)
- Black Friday/ano novo promo: desconto ou "primeiros 3 meses de graça" (aperta depois)
- On-boarding em grupo: se há volume, faz sessions de onboarding de lote (eficiência)
- Win-back: alcançar clientes que saíram (sabe porquê saíram?)
- Roadmap 2027: comunicar aos clientes atuais o que vem (loyalty + retention)

**A medir:**
- MRR total
- Churn acumulado
- CAC médio final do trimestre
- Lifetime value por cohort (quando entraram)
- Tamanho do pipeline de 2027

---

## **Dashboard Mensal (Acompanhamento)**

Cria uma tabela simples (spreadsheet) com estes números toda a semana:

| Métrica | Out | Nov | Dez | Meta |
|---------|-----|-----|-----|------|
| Clientes pagantes | 50 | 120 | 200 | ✓ |
| MRR | ? | ? | ? | - |
| Churn (%) | <5% | <4% | <3% | ✓ |
| CAC (€) | ? | ? | ? | Reduzir |
| Conversão (%) | ? | ? | ? | Aumentar |
| NPS/Satisfação | ? | ? | ? | >40 |

---

## **Distribuição de 4 Pessoas**

- **1 pessoa:** Produto + suporte (onboarding, bugs, features)
- **1 pessoa:** Vendas + outreach (LinkedIn, email, calls)
- **1 pessoa:** Content + partnerships (marketing, webinars, liaisons)
- **1 pessoa:** Admin/ops (contratos, pagamentos, reportes, você talvez?)

Roda tarefas: se vendas fica com muitos prospects, suporte ajuda em onboarding.

---

**Próximo passo:** Confirma quantos clientes tens agora e qual é o CAC atual — daí ajustamos o plano para ser mais realista.
```

### MKT-4 · R2

```text
Okay, the user is asking for a Q4 launch plan for their construction management app targeting small contractors. They have a team of four and want to reach 200 paying customers by year-end. Let me break this down.

First, I need to outline monthly actions and key metrics. Since they're a small team, the plan should be focused and actionable. Let's think about each month.

October: Maybe focus on finalizing the product and starting outreach. They need to get the app ready for launch, so maybe a beta with a few clients. Metrics could be beta sign-ups and feedback.

November: Ramp up marketing and sales. Maybe run targeted ads or email campaigns. Track conversion rates from leads to paying customers.

December: Close deals and maybe offer holiday discounts. Measure the number of new paying customers each week.

Wait, they need 200 by year-end, so they need to hit about 50 per month. But October might be a bit slow, so maybe 30 in Oct, 60 in Nov, 70 in Dec? Wait, 200 total. Let me check: 200 divided by 3 months is about 66 per month. But October might have fewer, so maybe 40, 70, 90? But the user said four people, so they need to prioritize.

Wait, the user said "quarto trimestre" which is Q4, so October, November, December. So three months. 200 customers in three months. So roughly 66-67 per month. But they might need to start building momentum in October.

Key metrics: Monthly sign-ups, conversion rate from trial to paid, customer acquisition cost (CAC), churn rate (but maybe not relevant for new customers yet).

Wait, the user is a small team, so they might not have a big marketing budget. So focus on organic growth, referrals, maybe partnerships with construction suppliers or local associations.

October: Finalize product, launch beta with 20-30 early adopters. Track beta feedback and conversion rate. Maybe get testimonials.

November: Scale outreach via LinkedIn, email, maybe a webinar. Target 60 customers. Track lead-to-customer conversion rate.

December: Offer limited-time discount for early sign-ups. Aim for 100 customers. Measure monthly revenue and CAC.

Wait, but 200 total. So October: 30, November: 70, December: 100? Wait, 30+70+100=200. But maybe October is a bit slower. Let me adjust.

Wait, the user wants to reach 200 by the end of the year, so they need to have 200 by December 31. So October, November, December.

Let me structure each month with specific actions and metrics.

October: Product polish, beta launch (target 20 beta users), measure feedback and retention. Maybe get 5 paying customers from beta.

November: Paid campaigns, partnerships, target 60 customers. Track CAC and conversion rate.

December: Holiday promotions, focus on closing deals, target 135 more (but 200 total, so 200 - 5 -60 = 135). Wait, but maybe better to say 200 total, so 20 in Oct, 70 in Nov, 110 in Dec. But need to check.

Wait, the user said "chegar a 200 clientes pagantes até ao fim do ano", so 200 by year-end. So the total should be 200. So maybe:

October: 30 customers (beta conversions + initial sales)
November: 70
December: 100

But need to make sure the numbers add up. Let's say 30+70+100=200.

But the user might need to track metrics each month. So for each month, list actions and metrics.

Also, the team is four people, so they need to split tasks: maybe one handles sales, one marketing, one product, one support.

Wait, the user is asking for a plan, so I should keep it concise. The answer should be in Portuguese, short, three sentences max.

So, October: Finalize product, launch beta (target 20 beta users), measure conversion rate from beta to paid.

November: Scale sales via LinkedIn/email, target 60 customers, track CAC and lead-to-customer rate.

December: Run holiday promo, focus on closing deals, aim for 100 new customers, measure monthly revenue.

Wait, but need to make sure the numbers add up. Let me check:

If October: 20 beta users, maybe 5 convert to paid (but the user wants 200 total, so maybe the beta is part of the 200). Wait, the beta users might be the first customers. So maybe October: 30 paying customers (from beta and initial sales), November: 70, December: 100.

But the user said "clientes pagantes", so the beta might be free, then they convert. So the 200 are paying customers, so the beta might be a trial, then they pay.

So October: Launch beta (free trial), aim for 30 paying customers by end of month. Metrics: trial-to-paid conversion rate.

November: Paid campaigns, target 70 new paying customers. Metrics: CAC, conversion rate.

December: Promotions, target 100. Metrics: Monthly revenue, customer count.

Wait, but 30+70+100=200. So that's the plan.

But the user is a small team, so they need to prioritize. Maybe the answer should be:

Outubro: Finalizar produto, lançar beta (20 usuários), medir taxa de conversão para pagamento.

Novembro: Escalar vendas via LinkedIn/email (60 clientes), medir CAC e taxa de conversão.

Dezembro: Promoção de Natal (100 clientes), medir receita mensal e crescimento.

Wait, but the user said "quatro pessoas", so the team is four, so they can handle these tasks.

Check if the numbers make sense. 20 beta users, but how many convert? If they aim for 30 paying customers in October, maybe 20 beta users convert, plus 10 from initial sales.

But the answer should be concise. So the key points are:

- October: Beta launch, track conversion rate.

- November: Sales scaling, track CAC.

- December: Promotions, track revenue.

So the answer in Portuguese, short.

Wait, the user asked for "o que fazer em cada mes e o que medir."

So for each month, action and metric.

October: Finalizar produto, lançar beta (20 usuários), medir taxa de conversão para pagamento.

November: Ativar campanhas pagas (LinkedIn/email), visando 60 clientes, medir CAC e taxa de conversão.

December: Oferta de Natal, visando 100 clientes, medir receita mensal e crescimento.

But need to make sure the numbers add up. 20 (beta) + 60 + 100 = 180, which is less than 200. Wait, maybe the beta is part of the 200. So October: 30, November: 70, December: 100. So 30+70+100=200.

So adjust the numbers.

October: 30 clientes (beta + initial sales), measure conversion rate.

November: 70, measure CAC.

December: 100, measure revenue.

So the answer should list each month with actions and metrics.

But the user wants it concise. So:

Outubro: Finalizar produto, beta com 30 clientes, medir taxa de conversão.

Novembro: Campanhas pagas para 70 clientes, medir CAC.

Dezembro: Promoção de Natal para 100 clientes, medir receita mensal.

Wait, but the beta is usually free, so the 30 might be from beta conversions. So maybe:

Outubro: Lançar beta (20 usuários), visando 30 clientes pagantes, medir conversão.

Novembro: Escalar vendas (70 clientes), medir CAC.

Dezembro: Fechar 100 clientes com promoção, medir receita.

But the user said "200 clientes pagantes até ao fim do ano", so total 200. So October: 30, November: 70, December: 100. Total 200.

So the answer should be:

Outubro: Finalizar produto, lançar beta (30 clientes), medir taxa de conversão.

Novembro: Campanhas pagas (70 clientes), medir CAC.

Dezembro: Promoção de Natal (100 clientes), medir receita mensal.

But need to check if the numbers are correct. 30+70+100=200. Yes.

So the answer should be in three lines, each month with action and metric.
</think>

Outubro: Finalizar produto, lançar beta (30 clientes), medir taxa de conversão.  
Novembro: Campanhas pagas (70 clientes), medir CAC e conversão.  
Dezembro:
```

### MKT-4 · R3

```text
A meta é terminar dezembro com **200 clientes pagantes ativos**. Vou assumir que cada cliente é uma construtora, que começam sem clientes e que a app estará pronta para utilização real em outubro. Se já têm clientes, o esforço de aquisição diminui.

É uma meta exigente para quatro pessoas. O plano deve validar a venda em outubro, repetir o que funciona em novembro e concentrar dezembro em conversão e retenção.

### Divisão da equipa

| Pessoa | Responsabilidade principal |
|---|---|
| 1 — Produto e tecnologia | Fiabilidade, correção de erros e melhorias que desbloqueiem vendas |
| 2 — Clientes | Onboarding, apoio e acompanhamento da utilização |
| 3 — Comercial | Prospecção, demonstrações e fecho |
| 4 — Aquisição | Campanhas, conteúdos práticos e parcerias |

Cada área tem um responsável, mas toda a equipa participa nas primeiras conversas com clientes.

### O que fazer em cada mês

| Mês | Ações prioritárias | Meta de clientes ativos |
|---|---|---:|
| **Outubro — Validar** | Escolher um segmento inicial específico, como pequenas construtoras com várias obras em simultâneo. Entrevistar 15–20 empresas. Vender uma promessa concreta, centrada no problema mais recorrente. Simplificar preço, demonstração e onboarding. Angariar os primeiros clientes com contacto direto e rede existente. | **20** |
| **Novembro — Repetir** | Concentrar esforços nos dois canais que trouxeram clientes com melhor utilização. Publicar dois casos reais com resultados autorizados. Testar parcerias com contabilistas, fornecedores ou associações do setor. Pedir referências a clientes satisfeitos. Automatizar os passos repetidos do onboarding. | **80** |
| **Dezembro — Converter e reter** | Fechar oportunidades já trabalhadas, sobretudo na primeira quinzena. Acompanhar avaliações pendentes e clientes pouco ativos. Fazer sessões coletivas de onboarding. Limitar novas funcionalidades às que resolvam bloqueios de compra ou utilização. | **200** |

Os aumentos mensais são **20, 60 e 120 clientes líquidos**: qualquer cancelamento exige uma venda adicional.

### O que medir todas as semanas

| Métrica | Para que serve |
|---|---|
| Contactos qualificados → demonstrações → avaliações → pagamentos | Encontrar onde se perdem potenciais clientes |
| Clientes pagantes ativos e crescimento líquido | Acompanhar diretamente a meta |
| Ativação nos primeiros sete dias | Confirmar que o cliente criou uma obra real e executou a tarefa principal |
| Empresas com utilização semanal | Detetar abandono antes do cancelamento |
| Cancelamentos e respetivos motivos | Corrigir problemas de produto, preço ou adequação |
| Receita mensal recorrente e custo de aquisição por canal | Avaliar se o crescimento é sustentável |
| Tempo de onboarding e apoio por cliente | Garantir capacidade para servir 200 empresas |

**Teste de capacidade:** com uma conversão hipotética de 25% entre demonstração e pagamento, seriam necessárias 800 demonstrações para conquistar 200 clientes, antes de cancelamentos. Para quatro pessoas, isso obriga a testar cedo avaliações autónomas, demonstrações coletivas ou parceiros.

No fim de outubro, usem as conversões e o tempo de apoio reais para recalcular novembro e dezembro. **Não aumentem investimento num canal enquanto os clientes que ele traz não começarem a usar a app regularmente.**
```

### MKT-4 · R4

```text
# Plano de lançamento Q4 2026 — app de gestão de obras

Antes do plano, as premissas em que assenta. Corrige-me as que estiverem erradas e eu ajusto os números:

- **Ponto de partida:** perto de zero clientes pagantes (alguns pilotos/beta, não mais de 10). Se já tiverem 40-60, o plano fica muito mais confortável e a parte de outbound reduz-se.
- **Mercado:** Portugal, construtoras com 3 a 30 trabalhadores, decisor = dono/gerente.
- **Preço:** ~50-80 €/mês por empresa. 200 clientes ≈ 10-16 k€ MRR.
- **Produto:** já está utilizável em obra real (incluindo telemóvel com sinal fraco).

---

## 1. A conta que manda em tudo

Esta é a parte que decide o plano, mais do que qualquer ideia de marketing.

Para 200 clientes com uma conversão demo→pago de 35-40% (realista com onboarding assistido, neste segmento), são precisas **~500-550 demos feitas** no trimestre. Em 11 semanas úteis dá **~50 demos por semana**, ou seja **~10 por dia**.

Duas pessoas a fazer 5 demos/dia cada, todos os dias, durante todo o trimestre. **A restrição não é o produto nem o tráfego: é capacidade humana de vender.** Isso obriga a uma decisão desconfortável: metade da equipa não faz mais nada senão vender e integrar clientes, de Outubro a Dezembro.

Auto-serviço puro não chega lá. Para 200 clientes por inbound precisariam de ~20.000 visitas/trimestre num site que hoje não tem audiência. Não se constrói isso em 12 semanas com 4 pessoas.

**Planeiem para 220, não para 200.** Uma margem de 10% absorve o churn precoce e o mês de Dezembro que encolhe.

## 2. Definir já o que conta como "cliente pagante"

Sem isto, a meta é contornável e vocês chegam a Dezembro com 200 nomes e 6 k€ de MRR.

> Cliente pagante = empresa com **pelo menos uma fatura paga a preço de tabela** (desconto máximo 20%, o do plano anual), fora de trial, com **≥1 obra activa** na plataforma.

Pilotos gratuitos, contas a 1 €, e clientes de amigos não contam.

## 3. Equipa (4 pessoas)

| Pessoa | Papel no Q4 |
|---|---|
| **P1 — Fundador/vendas** | Demos e fecho, parcerias (associações, contabilistas, fornecedores), preço |
| **P2 — Vendas + onboarding** | Prospecção, demos, importação do Excel do cliente, suporte |
| **P3 — Engenharia** | Estabilidade, mobile/offline, fricção de onboarding, billing |
| **P4 — Engenharia + marketing** | Landing page, conteúdo, anúncios, integrações, dashboard de métricas |

Regra de protecção: **nada de desenvolvimento à medida em Q4 a não ser que ≥10 clientes peçam a mesma coisa.** Cada construtora vai pedir "só um campozinho". É assim que se perde o trimestre.

---

## 4. Setembro (10-30) — três semanas de preparação

Não é tempo morto; é o que decide se Outubro corre.

- Fechar **preço e planos** (mensal + anual com -20%, para caixa e para retenção).
- **Billing a funcionar** de ponta a ponta, incluindo faturação portuguesa. Se a app emitir documentos que alimentam faturação, confirmem os requisitos de software certificado — não descubram isso em Novembro.
- **Lista de 1.500-2.000 empresas-alvo** com telefone e nome do gerente. O registo público de alvarás/títulos de construção do IMPIC é o ponto de partida natural, complementado com bases comerciais tipo Racius/Informa. *(Verifiquem a forma de acesso e as condições de uso de dados — não pude confirmar nada disto nesta sessão.)*
- **Guião de chamada** (90 segundos) e **guião de demo de 20 minutos**, com ambiente de demonstração cheio de dados de obra realistas — não uma conta vazia.
- **5-8 clientes-piloto convertidos em prova social**: vídeo curto, nome da empresa, foto da obra, um número ("deixámos de perder 6 horas por semana em folhas de horas").
- **Landing page** com esses casos e um vídeo de 90 s.
- **CRM montado** (Pipedrive ou HubSpot free) com 5 fases. Folha de Excel não aguenta 500 demos.
- **Corrigir os 3 maiores bloqueios de onboarding** conhecidos + garantir o modo offline no estaleiro.
- **Abrir conversas de parceria:** 2-3 associações do sector (AICCOPN, AECOPS e afins), 10 contabilistas com carteira de construção, 5 fornecedores de materiais/aluguer de equipamento. *(Confirmem também se há feira do sector no Outono — a Concreta, no Porto, é a candidata óbvia, mas é preciso verificar se há edição em 2026 e as datas.)*

**Medir em Setembro:** lista construída (nº), pilotos convertidos em testemunho (nº), tempo de onboarding de um cliente novo (horas), taxa de sucesso do fluxo de pagamento em teste.

## 5. Outubro — provar o motor · meta +45 (total 45)

- **P1 e P2 em modo vendas a tempo inteiro:** ~60 chamadas/dia combinadas, 8-10 demos/dia.
- **Onboarding concierge:** "mandem-nos o vosso Excel, nós carregamos as obras". A 30 min por cliente é comportável a esta escala e é provavelmente a maior alavanca de conversão que têm.
- **Testar 3 canais a sério, com CAC medido separadamente:** (1) outbound telefónico, (2) parceiros — contabilistas e fornecedores, (3) anúncios pagos em pesquisa/local.
- **Isco de inbound:** template gratuito de "mapa de custos por obra" em Excel + 4 artigos. Quem descarrega é lead qualificado.
- **Programa de referência** a partir da semana 3: 1 mês grátis por indicação convertida, para ambos. Este sector é uma rede fechada — os donos conhecem-se.
- **Fim de Outubro: matar o canal mais fraco** e realocar tudo.

**Medir semanalmente:** chamadas feitas, demos agendadas, demos realizadas, no-show %, demo→pago %, pagantes novos, CAC por canal, **activação a 7 dias** (1 obra criada + 3 registos de diário + 2 utilizadores).

## 6. Novembro — escalar o que funcionou · meta +85 (total 130)

- **Duplicar só o vencedor.** Nada de canais novos em Novembro.
- **Narrativa sazonal:** "entrar em 2027 com as obras sob controlo". É o momento certo para empurrar o **plano anual** — as empresas estão a fechar contas e a orçamentar.
- **2 sessões presenciais regionais** com associação ou fornecedor parceiro (Norte tem a maior densidade de construtoras pequenas). Uma sala com 30 gerentes vale uma semana de chamadas.
- **Onboarding em turmas semanais** em vez de individual, para a equipa não se afogar.
- **Caso de estudo com números reais** de um cliente de Outubro.
- **Primeira coorte faz 30 dias:** medir retenção e cancelamentos. Se a coorte de Outubro estiver a perder 10%/mês, 200 em Dezembro é ilusório.

**Medir:** tudo o de Outubro + **churn mensal**, MRR, ARPA, % de clientes em plano anual, tickets de suporte por cliente.

## 7. Dezembro — fechar · meta +70 (total 200)

**O prazo real é 19 de Dezembro, não 31.** O sector pára, muita empresa fecha entre o Natal e o Ano Novo, e os gerentes estão em fecho de contas. Planeiem com 3 semanas úteis, não 4.

- **Semanas 1-2:** sprint de fecho. Campanha de plano anual com prazo ("preço de 2026 até dia 19"), e **reactivação de todos os trials perdidos de Outubro e Novembro** — é a lista mais barata que têm.
- **Semana 3:** fechar, faturar, e garantir que ninguém entra em Janeiro sem estar activado. Um cliente que paga em Dezembro e nunca usa cancela em Fevereiro.
- **Semana 4:** sem vendas. Retrospectiva, dívida de produto, plano de Q1.

**Medir:** total acumulado, MRR, mix anual/mensal, activação dos clientes de Dezembro, previsão de churn de Janeiro.

---

## 8. Painel semanal (só isto, todas as segundas, 30 min)

| Métrica | Alvo Out | Alvo Nov | Alvo Dez |
|---|---|---|---|
| Demos realizadas / semana | 40 | 55 | 55 |
| Demo → pago | ≥30% | ≥35% | ≥40% |
| Clientes novos / semana | 10 | 20 | 23 |
| **Acumulado** | **45** | **130** | **200** |
| Activação a 7 dias | ≥50% | ≥60% | ≥65% |
| Churn mensal | — | ≤4% | ≤4% |
| CAC (melhor canal) | medir | < 3× ARPA mensal | < 3× ARPA mensal |

Segunda de manhã: os números. Sexta à tarde: 45 min sobre *porquê* — objecções que se repetem, motivos de perda, o que travou a activação.

## 9. Pontos de decisão

- **20 de Outubro:** se demo→pago < 25% ou demos < 30/semana, **parem de adicionar canais** e arranjem a conversão (demo, preço, ou o produto). Escalar um funil partido só queima a lista.
- **10 de Novembro:** se o acumulado < 90, cortem o canal mais fraco, reforcem o concierge onboarding e considerem um plano de entrada mais barato.
- **1 de Dezembro:** se o acumulado < 140, mudem a meta declarada para "acabar o ano com pipeline forte + base saudável". **170 clientes que ficam valem mais que 200 comprados com 60% de desconto** — os descontos ficam no livro para sempre e destroem o Q1.

## 10. Riscos principais

1. **Churn invisível.** Contar 200 brutos e ter 175 líquidos. Meça-se activação desde a primeira semana.
2. **Engenharia sugada por pedidos à medida.** Regra dos 10 clientes.
3. **Suporte a afogar a equipa em Dezembro**, precisamente quando é preciso vender.
4. **Burnout.** Dois meses e meio de 60 chamadas/dia é duro; alternem tarefas às sextas.
5. **Adopção no estaleiro.** Quem compra é o gerente, quem usa é o encarregado. Se a app não funcionar bem offline e em 2 minutos, o cliente paga um mês e sai.

---

Para afinar isto e trocar os alvos genéricos pelos vossos, preciso de saber cinco coisas: **quantos clientes pagantes têm hoje**, **qual é o preço actual**, **se a app móvel já funciona offline**, **que geografia cobrem**, e **quantos meses de caixa têm**. Diz-me e refaço os números mensais em cima da vossa realidade.
```

### MKT-4 · R5

```text
**Janeiro:**
- **Tarefas:** Concluir desenvolvimento básico da app, realizar testes internos, preparar documentação.
- **Medir:** Progresso de desenvolvimento, feedback interno.

**Fevereiro:**
- **Tarefas:** Lançar versão beta, começar campanha de marketing inicial.
- **Medir:** Número de inscritos beta, feedback de usuários.

**Março:**
- **Tarefas:** Aperfeiçoar baseado no feedback, preparar versão final.
- **Medir:** Engajamento beta, ajustes necessários.

**Abril:**
- **Tarefas:** Lançamento oficial, iniciar campanha de marketing de massa.
- **Medir:** Número de downloads, taxa de conversão.

**Maio:**
- **Tarefas:** Expansão de marketing, suporte ao cliente.
- **Medir:** Novos clientes, satisfação do cliente.

**Junho:**
- **Tarefas:** Monitorizar desempenho, otimizar.
- **Medir:** Retenção de clientes, feedback contínuo.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---

## DATA-3

**Pedido:**

> Todos os meses perco um dia a bater o extracto do banco contra as facturas emitidas. Sao cerca de 300 linhas de cada lado, os valores nem sempre coincidem ao centimo e ha pagamentos agrupados. Como e que eu monto um processo para isto?

### DATA-3 · R1

```text
Montava uma **conciliação semiautomática**: o processo propõe correspondências entre banco e facturas, e tu revês apenas os casos duvidosos. O objectivo é deixar de conferir 600 linhas à mão.

Começa com dois ficheiros exportados todos os meses:

| Extracto bancário | Facturas emitidas |
|---|---|
| Identificador do movimento | Número da factura |
| Data | Cliente |
| Descrição/referência | Data de emissão e vencimento |
| Valor recebido | Valor ainda por liquidar |

**Inclui facturas antigas ainda em aberto**, porque um recebimento deste mês pode pagar uma factura de meses anteriores. Guarda os ficheiros originais para poderes reconstruir cada conciliação.

Depois, aplica as regras por esta ordem:

1. **Referência da factura + valor exacto.** É a correspondência mais forte, desde que seja única.
2. **Cliente identificado + valor exacto.** Propõe a ligação; se houver duas facturas possíveis, deixa para revisão.
3. **Pequenas diferenças.** Define uma tolerância explícita — por exemplo, até 0,05 € para sugerir uma correspondência. A diferença fica registada; não se considera automaticamente perdoada ou regularizada.
4. **Pagamentos agrupados.** Procura combinações de facturas do mesmo cliente cuja soma corresponda ao recebimento. Começa por grupos pequenos e datas plausíveis. Se houver várias combinações possíveis, pede confirmação.
5. **Pagamentos parciais.** Permite ligar vários recebimentos à mesma factura, mantendo o saldo por liquidar.

Nos pagamentos agrupados, **não procures combinações entre todas as 300 facturas**: vais encontrar somas certas por acaso. Restringe primeiro pelo cliente, referência e período. Quando falta essa informação, o aviso de pagamento do cliente é mais útil do que tentar adivinhar.

O resultado deve ter três filas:

- **Conciliado:** correspondência inequívoca, com a regra utilizada.
- **Para rever:** diferenças, agrupamentos e correspondências ambíguas.
- **Sem correspondência:** recebimentos por identificar e facturas com saldo aberto.

Há uma peça essencial: uma **tabela de afectações**, em que cada linha liga um movimento bancário a uma factura e indica o montante aplicado. Por exemplo, um recebimento de 450 € pode originar duas linhas: 200 € para a factura A e 250 € para a B. Isto suporta agrupamentos e pagamentos parciais sem duplicar dinheiro.

Para montar isto, começava com **um mês histórico já conferido por ti**. Serve para testar as regras e, sobretudo, detectar correspondências erradas. Só depois automatizava a importação mensal. Cada execução deve preservar as decisões anteriores, impedir movimentos duplicados e mostrar os totais recebidos, afectados e por afectar.

A escolha da ferramenta depende sobretudo de uma coisa: **em que programa emites as facturas e em que formatos consegues exportar as facturas e o extracto — Excel/CSV ou apenas PDF?**
```

### DATA-3 · R2

```text
Okay, the user is having trouble reconciling their bank statements with invoices every month. They have around 300 lines on each side, values don't match to the cent, and there are grouped payments. Let me think about how to approach this.

First, they need a systematic way to match transactions. Maybe using a spreadsheet or a tool that can handle large datasets. Excel or Google Sheets could work, but with 300 lines, maybe a database would be better. But the user might not have access to that.

Wait, they mentioned grouped payments. So some payments might cover multiple invoices. They need to split those. Maybe using a tool that can handle partial matches or fuzzy matching. But the user is probably looking for a simple, step-by-step process.

They need to sort both lists by date and amount. Then, look for exact matches first. For the ones that don't match, check for rounding differences or small discrepancies. Maybe use a formula to highlight differences. For grouped payments, they might need to manually split them, but maybe there's a way to automate that with some criteria.

Wait, the user is in Portugal, so maybe they use specific software. But the question is about setting up a process. So the answer should be practical steps. Maybe suggest using Excel with VLOOKUP or XLOOKUP to match amounts, then handle discrepancies manually. Also, check for common errors like missing transactions or duplicate entries.

Wait, the user said "perco um dia a bater" which means they spend a day each month doing this manually. So they need to automate it. But the answer should be concise. The key points: sort both lists, use formulas to match, handle grouped payments by splitting, and use a tool like Excel or a simple script.

But the user might not know how to do that. So the answer should be: Use Excel/Sheets with VLOOKUP/XLOOKUP to match amounts, sort by date/amount, handle grouped payments by splitting based on invoice dates, and use conditional formatting for discrepancies. Keep a log for manual adjustments.

Wait, the user asked for a process, so the steps. But the answer needs to be short. So maybe: "Use Excel/Sheets with VLOOKUP/XLOOKUP to match transactions. Sort both lists by date and amount. Split grouped payments manually based on invoice dates. Highlight discrepancies with conditional formatting."

Check if that's under three sentences. Yes. And in Portuguese, but the code and identifiers in English. So the answer should be in PT-PT, but the terms like Excel, VLOOKUP are in English. The user's question was in Portuguese, so the answer should be in PT-PT.

Wait, the instructions say "Respostas curtas e directas — nunca mais de 3 frases para perguntas simples." So the answer should be three sentences max. Let me check the example response.

The user's example response was: "Use Excel/Sheets com VLOOKUP/XLOOKUP para corresponder transações. Ordene ambas as listas por data e valor. Divida pagamentos agrupados manualmente com base nas datas das facturas."

So that's three sentences. So the answer should be similar. Let me make sure it's in PT-PT, short, and covers the main points.

Yes, the key steps are using Excel functions to match, sorting, and splitting grouped payments. So the answer should be concise, three sentences, in Portuguese.
</think>

Use Excel/Sheets com VLOOKUP/XLOOKUP para corresponder transações. Ordene ambas as listas por data e valor. Divida pagamentos agrupados manualmente com base nas datas das facturas.
```

### DATA-3 · R3

```text
Para automatizar a reconciliação, tens algumas opções consoante a complexidade e o tempo que queres investir:

## Solução Rápida: Planilha com Fórmulas

1. **Cria 3 abas**: uma para extracto, uma para facturas, uma para reconciliação
2. **Prepara os dados**: exporta extracto e facturas para CSV/Excel
3. **Usa VLOOKUP ou INDEX-MATCH** para tentar encontrar correspondências:
   - Coluna de valor do extracto
   - Fórmula que procura valores similares na lista de facturas (com tolerância de ±0,01€)
4. **Marca manualmente** os pagamentos agrupados (quando um banco transaction cobre várias facturas)
5. **Diferenças** ficam destacadas para investigação

Isto reduz de 1 dia para ~1-2 horas.

## Solução Robusta: Script Python

Se os dados vêm sempre do mesmo formato, um script simples faz:
- Ler CSV/Excel de ambos os lados
- Fazer matching automático por valor (com fuzzy matching para variações)
- Agrupar pagamentos (se souber a lógica)
- Gerar relatório de discrepâncias

Isto deixa-te só com os casos edge para resolver manualmente.

## O que preciso saber para te ajudar melhor:

- Os dados vêm em que formato? (PDF, CSV, Excel exportado do banco?)
- Como é que os pagamentos agrupados aparecem no extracto? (uma linha com valor total? múltiplas linhas?)
- Tens alguma coluna que conecta extracto a facturas? (referência, data, número de fatura?)
- Está isto numa planilha, software de contabilidade, ou sistema diferente?

A solução mais simples que funciona é melhor que a mais perfeita que nunca montas. Começa com a planilha; se demorar muito, depois escalas.
```

### DATA-3 · R4

```text
## A ideia central

Não tentes "casar" tudo de uma vez. Um processo de reconciliação que funciona é uma **cascata de regras**, da mais restritiva para a mais permissiva, em que cada nível consome linhas dos dois lados e passa o resto ao nível seguinte. No fim sobra um resíduo pequeno — 5 a 15 linhas em vez de 600 — e esse sim é trabalho humano.

Com 300+300 linhas por mês, isto é um script, não uma folha de cálculo. Python com pandas é a escolha por defeito: corre em segundos, é auditável e o esforço amortiza-se ao segundo mês.

## 1. Normalização (antes de qualquer matching)

Os dois lados têm de chegar à mesma forma canónica:

```
data | valor | contraparte_norm | referencia | doc_id | origem
```

O que fazer aqui:
- **Valores** em cêntimos, inteiros. Nunca floats — evita ruído de arredondamento artificial.
- **Contraparte normalizada**: maiúsculas, sem acentos, sem pontuação, remover sufixos societários (`LDA`, `SA`, `UNIPESSOAL`). Guarda uma tabela de alias: o descritivo do banco raramente é igual ao nome do cliente na factura.
- **Referências extraídas por regex** do descritivo bancário: número de factura, NIF, número de contrato. É daqui que vem o matching de alta confiança.

## 2. Explicar as diferenças de valor — a maioria não é ruído

Antes de definires tolerâncias, classifica *porque* é que os valores divergem. Muitas divergências são determinísticas e devem ser regras, não tolerância:

- **Retenção na fonte** — se emites facturas com retenção, o recebimento é sistematicamente 11,5% / 25% mais baixo sobre a base. Isto é uma regra exacta: testa `valor_banco == total - retenção`.
- **Comissões bancárias / TPA** em recebimentos por cartão ou transferência internacional.
- **Desconto de pronto pagamento** aplicado unilateralmente pelo cliente.
- **Diferença cambial**, se facturas fora do euro.
- **Arredondamento real** — aí sim, tolerância de ±0,02 €.

Tolerância genérica só depois de esgotares as regras. Uma tolerância larga (ex. ±1%) parece resolver, mas gera falsos positivos que só descobres três meses depois.

## 3. A cascata

**Nível 1 — referência + valor exacto.** Match determinístico, confiança máxima, aceitação automática.

**Nível 2 — contraparte + valor exacto, dentro de janela de datas** (ex. -5 a +90 dias face à data da factura). Se houver mais do que um candidato, não decidas: manda para revisão.

**Nível 3 — contraparte + valor com regra de ajustamento** (retenção, comissão, desconto). Regista sempre *qual* a regra aplicada.

**Nível 4 — pagamentos agrupados.** Aqui está o teu problema difícil. Para cada linha de banco não casada, procura o subconjunto de facturas em aberto do mesmo cliente cuja soma dá o valor recebido. É subset-sum, mas fica trivial se limitares o espaço de procura:

- só facturas **do mesmo cliente**;
- só facturas **em aberto à data** do movimento;
- limita a cardinalidade a 6-8 facturas por grupo;
- se o cliente tiver muitas facturas em aberto, ordena por antiguidade e testa primeiro os prefixos (a maioria dos clientes paga o lote mais antigo por ordem).

Com estas restrições cada cliente tem tipicamente 3-15 facturas em aberto e a procura exaustiva é instantânea. **Se houver mais do que uma combinação possível para o mesmo valor, marca como ambíguo e não decidas automaticamente** — é a falha clássica que envenena a reconciliação.

**Nível 5 — pagamentos parciais e o inverso** (uma factura paga em várias tranches). Precisa de saldo por factura, ver ponto 4.

**Nível 6 — resíduo.** Sai para revisão manual com sugestões ordenadas por proximidade (top 3 candidatos por linha), para clicares em vez de procurares.

## 4. O que torna o processo sustentável

**Livro de partidas em aberto.** Não reconcilies "mês contra mês". Mantém um ficheiro de estado com o saldo por factura (`aberta`, `parcial`, `liquidada`) que transita entre meses. Metade da dor mensal vem de pagamentos que atravessam a fronteira do mês.

**Persistir as decisões manuais.** Cada match manual que fazes grava a associação `descritivo_banco → cliente`. No mês 3 o resíduo é metade do do mês 1, porque o sistema aprendeu os alias.

**Controlo de totais.** No fim: `soma(banco) == soma(matched) + soma(não explicado)`, dos dois lados. Se não fechar ao cêntimo, há um bug — não passes à frente.

**Log imutável.** Cada match guarda: nível da cascata, regra aplicada, confiança, timestamp, e se foi automático ou humano. É isto que te permite reverter um match errado sem refazer o mês.

## 5. Ordem de construção

Não construas os seis níveis de uma vez. Faz o 1 e o 2, mede quanto do volume ficou coberto — na prática costumam apanhar 70-85%. Depois olha para o resíduo e deixa que ele te diga qual o nível seguinte a construir: se for maioritariamente agrupamentos, vai para o nível 4; se for retenções, o nível 3 chega. Construir lógica de subset-sum para 4 linhas por mês não vale a pena.

**Duas coisas a montante que valem mais que qualquer código:** pôr referência estruturada de pagamento na factura, e pedir aviso de pagamento (*remittance advice*) aos clientes que agrupam. Cada um deles elimina uma categoria inteira de trabalho, em vez de a automatizar.

Se quiseres, digo-me qual é o formato do extracto (Multibanco/homebanking, CSV/OFX/PDF) e de onde saem as facturas, e desenho-te o script concreto para os níveis 1-4.
```

### DATA-3 · R5

```text
Para automatizar este processo, considera usar um software de contabilidade ou um script de automação. Este software pode comparar os extratos bancários com as facturas, identificar discrepâncias e gerar relatórios. Certifica-te de que o software suporta a importação de dados em formato CSV ou Excel para facilitar a integração dos extratos e facturas.
```

| resposta | RESOLVE | CORRECTO | EXECUTAVEL | RISCO | ECONOMIA |
|---|---|---|---|---|---|
| R1 |   |   |   |   |   |
| R2 |   |   |   |   |   |
| R3 |   |   |   |   |   |
| R4 |   |   |   |   |   |
| R5 |   |   |   |   |   |

---
