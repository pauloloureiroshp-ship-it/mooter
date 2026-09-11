# MATRIZ 12 · adversário — o que derrubou, o que ficou

Ronda 1: Codex (gpt-6-astra, effort medium), read-only, cwd vazio, sem o config
pessoal do dono, prompt por stdin (43 075 chars). 151 s. Resposta íntegra em
`adversary-codex-round1.md`. **17 ataques: 2 fatais, 15 sérios, 0 menores.**
Veredicto do adversário: **publicável com edições**. As edições foram feitas no
`verdict.md` (v2); a v1 fica em `verdict.v1.md`.

| id | sev. | o que atacou | decisão | o que mudou |
|---|---|---|---|---|
| M12-01 | sério | «faturado» e «$0 reais» fingem cobrança por token | **aceite** | «custo imputado incl. cache» em todo o lado; «$0 reais» → «nenhum token cobrado à parte; subscrição, GPU e energia existem». Confirmado o que ele calculou: sem cache a distância contra B **aumenta**. |
| M12-02 | sério | «mandar tudo para o modelo pequeno» é recomendação, não resultado | **aceite** | veredicto reescrito como descritivo; A volta a ser o comparador primário no texto; Haiku abaixo de Opus no risco escrito ao lado |
| M12-03 | **fatal** | 2 pontos de 4 pares não calibram ruído; «não é ruído» é excessivo | **aceite** | «ruído calibrado» e «não é ruído» saíram; fica «única referência disponível, 2 prompts, 4 pares, mistura modelo e juiz» e o facto que resta: dois juízes de famílias diferentes ordenam C > B |
| M12-04 | sério | MKT-3 cumpre o critério registado (≤ 1 e custo menor); retirá-lo é mudar a régua depois | **aceite** | 5/12 → **6/12**; MKT-3 conta como acerto, com «dentro da referência de ruído» ao lado |
| M12-05 | sério | B não é Anthropic em 10/12 — é Qwen; o viés do J2 pode pesar contra B e a favor de C | **aceite** | erro factual da v1 corrigido; a implicação ao contrário da que eu tinha escrito |
| M12-06 | sério | «o viés está nos dados» afirma mecanismo | **aceite** | → «padrão compatível com viés de família» |
| M12-07 | sério | «5 das 6 previsões falharam, logo os prompts não eram enviesados» não é inferência válida | **aceite** | o argumento de auto-isenção saiu do verdict; ficou só o facto (prompts do autor). A frase equivalente do `10-NAO-PROVADO.md` §1 também foi retirada |
| M12-08 | sério | quatro «causas» são hipóteses de uma corrida sem ablação | **aceite** | «Porque perde — as causas» → «cinco hipóteses, nenhuma isolada»; cada uma com o que NÃO se mediu |
| M12-09 | sério | falta a 5.ª hipótese: o desenho da experiência | **aceite** | acrescentada (prompts do autor, par OPS-3/P5, harness desigual, juízes lêem texto) |
| M12-10 | sério | pôr a chave não activa o arbiter neste instrumento — B chama `classify.js`, não o hook | **aceite** | tinha razão: M12-c reescrita para passar pelo `inject_context.js` com registo da invocação |
| M12-11 | sério | 14 linhas não são auditáveis por dimensão; sha do executor modificado em falta | **aceite** | `preflight/D1.diff` (o diff exacto) e sha `7be3e990…` no cabeçalho do verdict |
| M12-12 | **fatal** | «30b é pior» depende dos 2 truncados: sem eles 31,5 contra 31,0 | **aceite** | verificado (31,0 / 31,5): a conclusão sobre o modelo morreu; fica a comparação de configurações com a sensibilidade escrita, e «a ordem do probe está certa» saiu |
| M12-13 | sério | chamada directa não isola o modelo do servidor/template; «107 tokens» não é contagem de palavras | **aceite** | contado: **55 palavras** para um pedido de 120; D6 fica «esta configuração do Ollama», não «o modelo» |
| M12-14 | sério | omitir `NEXT_PUBLIC_` não prova insegurança sem a resposta; P5 não menciona Next.js | **aceite** | resposta do OPS-3 transcrita **integral** no verdict (são 3 frases); a afirmação técnica limitada ao OPS-3; P5 só com a nota dos juízes |
| M12-15 | sério | 56 ≠ 58 respostas; DEV-2 B é 5,0 não 4,0; D imprimia $0,0000 | **aceite** | os três corrigidos. O terceiro era um defeito do agregador (`Number(null)` = 0) — corrigido com teste que morde (15/15) |
| M12-16 | sério | `new Date()` não prova anterioridade; falta âncora externa | **aceite** | cabeçalho passa a «pré-registo declarado no pacote, não ancorado» e nomeia a falha de processo (ontem commitava-se antes; hoje não) |
| M12-17 | sério | «não usa o degrau do meio», «metade», «qualidade», «pontos por $» excedem a amostra | **aceite** | «nenhum destes 12 foi para T1/T2»; «36,5 contra 65,5» em vez de «metade»; «pontos dos juízes» em vez de «qualidade»; «pontos por $» retirado do verdict, mantido em `TABELAS.md` com nota de que não é retorno económico |

## O que não aceitei, e porquê

Nada de substantivo. Dois detalhes de formulação:

- M12-01 pede substituir «$0 reais» — substituído, mas o facto mantém-se escrito: nenhum token
  desta corrida gerou cobrança à parte. Retirar isso seria esconder que os dólares da tabela são
  todos imputados.
- M12-17 pede retirar «pontos por $» da apresentação ao investidor. Retirado do verdict. Fica em
  `TABELAS.md` porque a tabela é gerada e a coluna é uma razão técnica declarada como tal; um
  investidor lê o verdict, não o `TABELAS.md`.

## Destino das cinco afirmações numeradas

| # | adversário disse | v2 |
|---|---|---|
| 1 | REWORD | reescrita com todas as condições (12 prompts, máquina, patch D1, arbiter inactivo, sem incerteza) |
| 2 | REWORD | «nenhum destes 12 prompts foi encaminhado para T1/T2» |
| 3 | REWORD | rotas + resposta integral do OPS-3 + omissão nomeada; P5 só com nota |
| 4 | **DEAD** | substituída pela comparação de configurações com sensibilidade aos truncados; a validação do probe saiu |
| 5 | REWORD | «cortava aos 256; com o tecto corrigido o local continuou abaixo»; sem «por construção» |

## O que ele não pôde verificar (e continua por verificar)

Respostas completas, justificações dos juízes, código, patch D1 (agora tem o diff), logs, hashes,
cronologia, preços citados, isolamento efectivo. Tudo isto está em disco em
`_handoff/matriz-12-2026-09-10/` — mas ele não teve acesso ao repo, por desenho (R5), e por isso o
que ele diz «não verificado» é «não verificado por um segundo par de olhos».
