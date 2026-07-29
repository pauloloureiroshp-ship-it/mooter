# O Recibo de Fecho — o painel que fecha a thread
**Data:** 2026-07-27 · **Estado:** especificação aprovada pelo MEO, por implementar

> O painel do Mooter aparece **quando é lançado** e mostra o que vai acontecer.
> Falta o gémeo: um painel que aparece **no fim** e mostra o que aconteceu.
> Um é a promessa; o outro é a prova. Sem o segundo, o utilizador tem de acreditar.

---

## 1. Quando aparece

| Gatilho | Comportamento |
|---|---|
| A última tarefa de uma wave termina | Recibo automático dessa wave |
| O utilizador diz "e agora?", "fecha", "resumo" | Recibo da sessão inteira |
| Fim de um bloco de trabalho (`/mooter-resume`) | Recibo + estado guardado |

❌ **Nunca a meio.** Um recibo que interrompe é mais um alarme. Ele fecha, não acompanha.

---

## 2. O template — sete blocos, e nenhum inventado

```
🐮 RECIBO — <wave ou sessão> · <data> · <duração>

① O QUE FICOU FEITO
   ✅ <entrega>            <agente> · <modelo> · <tempo> · <custo>
   ✅ <entrega>            …
   ⚠️ <o que ficou a meio, e porquê>

② QUEM FEZ O QUÊ
   | motor | tarefas | tempo | custo | fatia |
   | moo   |    3    |  29 s |   $0  |  60%  |
   | codex |    1    | 23 min|  n/d  |  20%  |
   | cc    |    1    |  40 s | $0,44 |  20%  |
   → <frase de uma linha: onde é que o local ganhou, e onde não chegou>

③ EFICIÊNCIA DESTA SESSÃO
   Custo por tarefa entregue   $<x>      (mediana da sessão)
   Trabalho a $0               <x>%      (meta <y>%)
   1º token útil               <x> s     (mediana)
   Poupança estimada           $<x>      ⚠️ estimativa, com a base à vista
   Interrupções ao MEO         <n>       (faixa 0-1/dia)

④ O QUE O MOOTER APRENDEU
   Exemplos novos para treino    <n>   (acumulado: <N>)
   Decisões que mudaram          <n>   ex.: "leitura_resumo passa a ir para moo (8/8)"
   Keep rate                     <x>% ou n/d com o porquê
   ⚠️ LoRA/DoRA: NÃO TREINADA. <N> exemplos recolhidos; o treino abre aos <meta>.
      Enquanto não abrir, isto é combustível, não é aprendizagem.

⑤ ESTADO DO PROJECTO (o que um vibe coder tem de saber antes de fechar o portátil)
   Branch          <nome> · <n> commits à frente/atrás
   Por commitar    <n> ficheiros  ⚠️ <lista curta se ≤5>
   Por push        <n> commits    ⚠️ o trabalho só existe depois do push
   .gitignore      <ok | n ficheiros que deviam lá estar: node_modules, .env, *.log>
   Worktrees       <n> abertas, <n> livres  ⚠️ <as que têm alterações não commitadas>
   Suites          <verde | vermelho: <suite>>
   Segredos        <nenhum detectado | ⚠️ padrão encontrado em <ficheiro>>

⑥ REGISTO
   Vault Obsidian   ✅ <ficheiro> | ❌ não escrito, porque <razão>
   SYNC.md          ✅ actualizado | ⚠️ desactualizado há <n> dias
   Notion           n/d — conector por autorizar

⑦ O QUE FAZER A SEGUIR (máx. 3, por ordem)
   1. <acção> — <porquê em meia linha>
   2. …
```

---

## 3. As regras que impedem isto de virar teatro

1. **Cada número vem do ledger, do git ou do disco.** Nenhum bloco é gerado por um LLM. O recibo é
   composição, não redacção.
2. **`n/d` com o porquê** em qualquer campo sem dado. Um recibo com tudo preenchido e metade
   inventado é pior do que meia página honesta.
3. **⚠️ A parte da LoRA é a mais perigosa** e por isso é a mais explícita: enquanto não houver
   adaptador treinado, o recibo diz **"combustível recolhido"**, nunca "o modelo melhorou". Prometer
   aprendizagem que não aconteceu seria exactamente o tipo de mentira que este produto existe para
   não contar.
4. **Cabe num ecrã.** Se um bloco não tiver nada a dizer, desaparece — não fica a ocupar espaço com
   zeros.
5. **Fecha com no máximo três acções.** Um recibo que termina com uma lista de doze coisas é uma
   caixa de entrada com outro nome.

---

## 4. Porque é que isto impressiona (e não é vaidade)

Nenhuma ferramenta de coding com IA te diz, ao fechar: *isto custou-te X, correu Y% na tua própria
GPU, deixaste N ficheiros por commitar, três worktrees abertas e o vault ficou registado.*
O Cursor mostra o que gastaste. O Copilot mostra o que sugeriu. **Nenhum fecha o dia contigo.**

O recibo é a materialização da tese: *o motor é o fosso, a cabine é o produto* — e a cabine sem
um velocímetro no fim da viagem é só um volante.
