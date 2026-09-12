<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 1; exit 0; 128 s; tokens_reported n/d; prompt_chars 26555; at 2026-09-09T14:21:06.247Z -->

**P5 não demonstra que o prompt fica no dispositivo nem que toda a rede externa foi bloqueada. Demonstra, segundo os resultados fornecidos, ausência de destinos externos registados por um instrumento parcial, numa configuração sem chave e com o encaminhamento condicionado por um defeito.**

Ataque limitado ao material transcrito. Não consultei repositório, documentação externa ou máquina. Não pude verificar o tap, os testes, os YAML, os pedidos capturados, os logs brutos, os hashes ou a cronologia Git. Os números abaixo são resultados **reportados**, não reproduzidos.

### P5-01 — fatal — Cobertura do instrumento confundida com fronteira do dispositivo

**Afirmação atacada:** “Does the raw prompt leave? **No**”; “0 hosts externos para classificar, medido ao socket”.

**Porque pode falhar:** o preload cobre processos Node instrumentados, não necessariamente filhos não-Node, processos que removam `NODE_OPTIONS`, DNS, UDP/QUIC ou serviços previamente arrancados. As 15 ligações ao Ollama transferem trabalho para outro processo cuja saída não foi observada; o mesmo problema existe na porta de métricas 7821. Loopback identifica o próximo salto, não o destino final. Zero CONNECT também não cobre clientes que contornem o proxy.

**Evidência que resolve:** observação de rede ao nível do sistema, com cobertura TCP/UDP, IPv4/IPv6 e DNS, atribuição aos processos e serviços envolvidos, incluindo Ollama e métricas; controlos positivos de fuga por cada caminho. Para afirmar especificamente ausência de *prompt*, é ainda necessária evidência do conteúdo ou da ausência completa de saída nessa fronteira.

### P5-02 — fatal — Os contadores de bytes não estão validados

**Afirmação atacada:** medir “quantos bytes de prompt saem do dispositivo”; contadores de socket apresentados como instrumento dessa medição.

**Porque pode falhar:** todas as 35 ligações apresentam **zero bytes enviados e recebidos**, incluindo as chamadas atribuídas ao Ollama. Isso exige explicação: recolha prematura, contadores errados, ligação mal associada ou ausência real de tráfego. Não permite escolher automaticamente a última hipótese. Mesmo contadores corretos de socket mediriam tráfego, não isolariam bytes de prompt.

**Evidência que resolve:** enviar payloads conhecidos e não vazios pelos mesmos caminhos HTTP/Ollama/métricas; reconciliar contadores do tap, bytes recebidos pelo servidor e captura independente. Explicar o momento de leitura dos contadores e a distinção entre corpo, prompt e tráfego de transporte.

### P5-03 — fatal — Bloqueio sem tentativa é um teste vazio

**Afirmação atacada:** “**all external network refused**”; “prova que, mesmo recusando toda a rede externa, o hook decide na mesma”.

**Porque pode falhar:** o tap não é um bloqueio de rede do sistema. **Zero tentativas bloqueadas** significa que a barreira não foi exercitada nesta corrida. Tiers iguais, ambos forçados a T0, não demonstram preservação de decisões funcionais sob bloqueio. Os quatro testes reportados podem validar caminhos específicos, não toda a fronteira.

**Evidência que resolve:** bloqueio ao nível do sistema abrangendo serviços dependentes, com tentativas externas deliberadas comprovadamente recusadas; comparação de decisões num router funcional, incluindo casos que normalmente tentem aceder à rede.

### P5-04 — fatal — O resultado mede uma configuração defeituosa, não uma propriedade do produto

**Afirmação atacada:** título do slide e “*decidir* não sai da máquina”.

**Porque pode falhar:** sem chave, o árbitro está desativado; com D1, os 20 tiers ficam T0. O teste não separa a arquitetura pretendida dos efeitos dessa configuração. Também não demonstra que D1 causou a ausência de rede: faltam controlos para isolar esse efeito. “Estado por omissão” nesta máquina não estabelece o comportamento por omissão do produto instalado noutro ambiente.

**Evidência que resolve:** novas corridas identificadas separadamente, com D1 corrigido, chave ausente/presente, árbitro desativado/ativado e prompts que exercitem os caminhos de baixa confiança. Até lá, restringir o resultado à configuração testada.

### P5-05 — serious — B prova construção de pedido, não transmissão ou número de ligações

**Afirmação atacada:** “would open **1 per prompt**”; “the arbiter ships the raw prompt whenever it runs”.

**Porque pode falhar:** uma chamada capturada não equivale a uma ligação: reutilização, retries ou falha anterior ao envio podem alterar essa relação. B contorna a seleção real do árbitro e substitui a execução de rede. O agregado apresenta `destinations: [null]`; a atribuição à Anthropic depende de código não fornecido. A subcorrida bloqueada é irrelevante para rede se o envio já foi substituído.

A pesquisa de substring escapada também é inferior a verificar o campo efetivamente enviado: pode encontrar o texto noutro ponto do corpo.

**Evidência que resolve:** capturas dos argumentos e pedidos, parse de JSON com igualdade entre o campo de mensagem e o prompt, destino explícito e teste autorizado com chave real acompanhado por observação de rede. Por agora: **20/20 pedidos construídos continham o prompt, segundo a instrumentação**.

### P5-06 — serious — O resultado LiteLLM pode ser um erro de configuração

**Afirmação atacada:** “cost-based routing […] picked the *expensive* deployment 20/20”.

**Porque pode falhar:** dois locais onde se escreveu um preço não provam que o router carregou esse preço. Não sabemos se ambos os deployments estavam elegíveis, saudáveis e no mesmo grupo efetivo; se os preços tinham unidades e nomes corretos; ou se houve fallback. HTTP 200 comprova serviço, não seleção por custo corretamente configurada. “Caro” é um rótulo de configuração num mock, não custo faturado.

**Evidência que resolve:** YAML exato, configuração efetiva carregada, preços resolvidos, saúde e elegibilidade dos dois deployments e logs de seleção. Fazer chamadas diretas a ambos e inverter preços mantendo identidades; depois inverter identidades/portas mantendo preços. Reproduzir com um exemplo mínimo validado para essa versão.

### P5-07 — serious — Receção no mock não demonstra saída do dispositivo

**Afirmação atacada:** LiteLLM “decides locally; forwards 100 %”; coluna “Does the raw prompt leave? **Yes**”.

**Porque pode falhar:** o prompt chegou a um fornecedor **loopback**. Saiu do processo cliente, não necessariamente do dispositivo. Além disso, a própria observação externa do Python é `n/d`, logo não sustenta “0 para decidir”. O comportamento de C não foi medido e não pode entrar numa conclusão sobre “os proxies”.

**Evidência que resolve:** separar explicitamente fronteiras de processo e dispositivo; verificar igualdade do prompt recebido pelo mock; observar o Python ao nível do sistema. Fornecedores reais exigem outra corrida. C permanece `n/d`.

### P5-08 — serious — “2 ligações por prompt” excede o que a amostragem estabelece

**Afirmação atacada:** “**2 per prompt, 20/20**”, apresentado como comportamento do nativo “por desenho”.

**Porque pode falhar:** snapshots podem perder ligações curtas. Sem o código de agregação, não sabemos se “2” conta destinos distintos, sockets, tuplos ou eventos de ligação; dois IPs não equivalem a duas ligações. O intervalo pedido de 150 ms também não comprova a cadência efetiva.

Metade das chamadas terminou com exit 1. Isso não apaga as observações de rede, mas impede tratar as 20 como execuções normais sem investigação. Concorrência como causa é uma hipótese. rDNS/IP também não estabelece a finalidade da ligação nem prova “GCP” com os dados fornecidos.

**Evidência que resolve:** eventos contínuos de conexão com PID, timestamps, tuplos e início/fim; algoritmo de deduplicação; corrida isolada com saídas bem-sucedidas e falhas analisadas separadamente. Até lá: **dois destinos TCP externos reportados pela amostragem em cada chamada**, sem total exato ou causalidade estabelecidos.

### P5-09 — serious — Input tokens não atestam entrega integral do prompt

**Afirmação atacada:** “100 % do prompt vai para a API”; “host reports input tokens 20/20”.

**Porque pode falhar:** `usage.input_tokens=10` não identifica o conteúdo recebido nem demonstra igualdade com o prompt original. O valor constante em 20 prompts diferentes exige examinar a semântica do campo, outros campos de utilização e a extração feita pelo harness. Não prova fraude ou falha, mas também não é uma atestação de conteúdo.

**Evidência que resolve:** pedidos efetivos ou confirmação do lado recetor que permita verificar conteúdo/comprimento/hash do prompt, com tratamento explicado de cache e transformações. Separar comportamento esperado de conteúdo efetivamente observado.

### P5-10 — serious — A sonda do proxy pode bloquear o próprio proxy

**Afirmação atacada:** “`claude.exe` não honra/ignores `HTTPS_PROXY`”.

**Porque pode falhar:** o código inicia o proxy e chama imediatamente `spawnSync`. **Se o proxy for servido pelo mesmo event loop Node**, esse loop fica bloqueado enquanto o filho espera resposta do proxy. Timeout e zero ligações contabilizadas tornam-se compatíveis com o cliente **honrar** a variável, mas o proxy não conseguir atender ou registar a ligação.

Não foi fornecida a implementação de `startCountingProxy`; portanto, esta causa é condicional, mas concreta. Além disso, a variante `{}` herda eventuais variáveis de proxy do ambiente: não garante um controlo “sem proxy”.

**Evidência que resolve:** proxy em processo independente ou cliente via `spawn` assíncrono, ambiente de proxy explicitamente limpo e controlo positivo durante a execução. Retirar a atribuição do defeito ao Claude até esse teste.

### P5-11 — serious — “752” é uma soma de matches, não uma auditoria de PII

**Afirmação atacada:** “752 instâncias de caminho-com-nome”; “O MP dizia ‘30 hoje’: são 752”; “0 e-mails”.

**Porque pode falhar:** **5 + 747 = 752** está correto. O significado depende das regex e dos matches não fornecidos. Igualdade entre contagens de nome e caminho não prova que correspondem às mesmas posições. Repetições, escapes, normalização e sobreposição podem alterar a interpretação; outras formas de PII podem escapar.

“30 hoje” e uma contagem de ficheiros completos não são comparáveis sem janela temporal e unidade comuns. Presença de `prompt_preview` em 1 390 linhas não prova, por si, que cada uma contém 80 caracteres crus, nem que são prompts distintos.

**Evidência que resolve:** regex, snapshots com hash, contagem por posição e sobreposição, amostra redigida auditável, testes de falsos positivos/negativos e filtro temporal equivalente. Publicar **“752 correspondências reportadas pelo detetor de caminhos; não representam PII única nem total”**; “zero e-mails detetados pela regex”.

### P5-12 — serious — A pré-inscrição não torna as mudanças metodológicas neutras

**Afirmação atacada:** “três alterações de instrumento, nenhuma de métrica”; “Pre-registered protocol committed before the first run”.

**Porque pode falhar:** substituir bytes CONNECT por snapshots TCP deixa a métrica principal de E sem resposta. O fallback estava previsto, o que legitima `n/d`; não legitima apresentá-lo como medição equivalente. Faltam timestamps verificáveis das emendas. Há ainda uma rec corrida isolada de n03 perante “0 retries”, e `analysis.at=14:16` perante corridas descritas como `14:2x`.

Isto exige reconciliação, não prova manipulação.

**Evidência que resolve:** histórico e hashes dos artefactos, timestamps por corrida, ligação entre análise e entradas, e separação explícita entre corrida registada, correções do instrumento e diagnóstico posterior.

### P5-13 — fatal — O slide compara grandezas diferentes sob a mesma coluna

**Afirmação atacada:** coluna “External connections **to decide**” e narrativa de vantagem Mooter.

**Porque pode falhar:** A mede um hook sem árbitro operacional; B constrói pedidos; D entrega a mocks; E executa chamadas nativas completas. As ligações de E não foram atribuídas à decisão de encaminhamento. O leitor recebe uma comparação quantitativa que o desenho não suporta.

A ressalva D1 no rodapé não corrige o título. As palavras proibidas `private` e `secure` aparecem literalmente, mesmo negadas. `enforces`, `most accurate` e `savings %` não aparecem, mas “all external network refused” implica uma garantia de enforcement não demonstrada.

**Evidência que resolve:** comparar a mesma operação com a mesma fronteira e instrumento, ou remover a comparação numérica e apresentar observações específicas por braço.

### SURVIVE

- A reporta 35 ligações loopback e nenhum destino externo **registado pelo tap**, em 75 processos Node.
- A/A-block reportam tiers T0 iguais em 20/20; nenhuma tentativa foi bloqueada.
- B reporta prompt presente em 20/20 pedidos construídos e média de corpo de 2 162,4 bytes.
- D reporta 20 respostas HTTP 200 e 20 entregas ao mock rotulado “caro”.
- C é `n/d`; bytes de E são `n/d`.
- A soma dos matches de caminhos reportados é 752.

### REWORD

- Zero observado → limitado ao tap, à máquina e à configuração defeituosa.
- B → pedido construído com prompt, sem alegação de transmissão ou número de ligações.
- D → resultado desta configuração mock, com causa da seleção por resolver.
- E → destinos TCP amostrados, com 10/20 saídas não-zero.
- PII → correspondências do detetor, sem comparação com “30 hoje”.
- Pré-inscrição → protocolo declarado, com fallback e correções posteriores identificados.

### DEAD

- “O prompt não sai do dispositivo.”
- “Toda a rede externa foi recusada.”
- “Bloquear a rede preserva as decisões” com base nesta corrida.
- “Uma ligação por prompt” no árbitro.
- “LiteLLM decide com zero egress” e qualquer conclusão sobre a qualidade do seu routing.
- “Duas ligações por prompt, por desenho.”
- Input tokens como prova de entrega integral.
- “Claude ignora `HTTPS_PROXY`” com esta sonda.
- Qualquer vantagem comparativa de egress, privacidade ou poupança derivada destes braços.

**SLIDE PUBLISHABLE WITH THESE EDITS:** título limitado a “No external destinations recorded by the Node tap in this run; API key absent, budget defect forced T0”; substituir a coluna comparativa por “Observation in this setup”; A “Device-level prompt egress not established”; A-block “0 intercepted attempts blocked; T0 unchanged”; B “20/20 constructed requests contained the prompt; no transmission observed”; D “20/20 delivered to the mock labelled expensive; effective cost configuration unverified; external egress unmeasured”; E “Two external TCP destinations reported per call by sampling; 10/20 non-zero exits; bytes and full prompt delivery unverified”; remover a afirmação sobre `HTTPS_PROXY`, a comparação com “30 hoje” e as palavras proibidas; qualificar 752 como matches do detetor e colocar D1 junto ao título.