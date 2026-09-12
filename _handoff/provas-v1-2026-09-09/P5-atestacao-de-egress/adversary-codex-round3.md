<!-- adversary: codex exec (gpt-6-astra), read-only, cwd vazio; round 3; exit 0; 60 s; tokens_reported n/d; prompt_chars 42260; at 2026-09-09T14:43:30.260Z -->

**O slide ainda exige edições.** Os totais e as medianas de saída/CONNECT verificáveis nas 20 linhas fornecidas são coerentes. As fragilidades restantes estão na interpretação e na força das verificações.

- **P5-19 — serious — ainda de pé.**  
  **Afirmação:** «13/20 returned `is_error` (medians 1.62 MB vs 1.63 MB for the 7 without)».  
  **Problema:** separar volumes por resultado não esclarece o que ocorreu. Sem os erros, não sabemos se o tráfego acompanha execução normal, falhas de configuração ou tentativas falhadas. `exit0` também não demonstra conclusão da tarefa. A proximidade das medianas não resolve isto.  
  **Resolve:** resultados JSON por invocação, motivos dos erros e indicação de conclusão. Até lá, acrescentar: **“Error causes and task completion unverified.”**

- **P5-28 — serious.**  
  **Afirmação:** «Forwards the full prompt to the chosen provider 20/20».  
  **Problema:** D apresenta apenas `raw_prompt_forwarded: 20`; não apresenta o teste nem igualdade de campo. O defeito de procura textual foi corrigido explicitamente em B, mas não há demonstração equivalente para D. Também não fica explícito que estes 20 casos pertencem apenas à corrida original, depois de a mesma célula descrever 60 pedidos.  
  **Resolve:** corpos recebidos, associação ao corpus e igualdade do campo de conteúdo após parsing, por variante. Até lá: **“Original run: the detector reported prompt presence in 20/20 mock requests; full-field equality not demonstrated here.”**

- **P5-29 — serious.**  
  **Afirmação:** «1.62 MB outbound», com contador «calibrated on known volumes».  
  **Problema:** segundo a descrição fornecida, `bytes_out` conta dados **recebidos do cliente pelo proxy**, não confirma entrega ao destino externo. O teste de eco valida um túnel concluído normalmente; o teste recusado não envia payload. Nenhum testa dados pendentes quando o upstream falha ou quando a medição termina. Isto não demonstra números errados, mas impede chamar-lhes bytes efectivamente enviados para fora.  
  **Resolve:** implementação e reconciliação entre bytes recebidos, encaminhados e descartados, incluindo falha e fecho com dados pendentes. Edição suficiente para o slide: **“median 1.62 MB client→proxy tunnel bytes”**, aplicando a mesma fronteira aos 187 kB atribuídos ao túnel Datadog.

- **P5-25 — minor — ainda de pé numa formulação residual.**  
  **Afirmação:** «Mooter arbiter (**runs only with a key**)».  
  **Problema:** continua a ser uma condição universal sobre execução. Vinte chamadas com chave falsa e uma configuração sem chave não demonstram todos os caminhos; o próprio slide admite isso.  
  **Resolve:** revisão dos pontos de entrada e condições de activação. Substituir por **“fake key supplied for these 20 instrumented invocations”**.

- **P5-30 — minor.**  
  **Afirmação:** «~1,62 MB de saída e ~40 CONNECT **para um prompt de 37 caracteres**» — leitura honesta, ponto 4.  
  **Problema:** junta medianas de variáveis diferentes como se descrevessem uma observação emparelhada. Não foi demonstrado que uma invocação com 37 caracteres tenha aqueles valores.  
  **Resolve:** dados emparelhados ou substituir por **“medianas por invocação: ~1,62 MB e 40,5 CONNECT; mediana do corpus: 37 caracteres.”**

**SURVIVE:** ausência de destinos externos *registados* no A, com as restrições impressas; A-block não exercitado; construção instrumentada de B; contagens observadas do LiteLLM; medianas verificáveis de E; contagens dos detectores locais.

**REWORD:** cinco afirmações acima.

**DEAD:** leitura dos bytes recebidos pelo proxy como entrega externa comprovada; ideia de que estratificar por `is_error` esclareceu as falhas.

Não pude verificar o repositório, brutos completos, execução da calibração, implementação dos instrumentos, configurações efectivas ou anterioridade dos commits/emendas. O código de teste apresentado não é um resultado de execução.

**SLIDE PUBLISHABLE WITH THESE EDITS — declarar erros/conclusão não verificados; limitar D à presença detectada na corrida original; identificar bytes como client→proxy; retirar “runs only with a key”.**