# Prompt de auditoria da experiência — colar numa sessão NOVA do Cowork

> Depois de reiniciares o Claude Desktop, abre uma **sessão nova** com a pasta `frugal` e cola o
> bloco abaixo. Ele audita a experiência inteira: abertura, progresso e fecho — e vai à procura de
> buracos, não de confirmação.

---

## O prompt (copiar daqui até ao fim do bloco)

```
Audita a experiência do Mooter nesta thread, do princípio ao fim, como se fosses um utilizador
exigente que nunca o viu. Não me digas que está bom: procura o que está confuso e o que mente.

Regras: mede em vez de assumir; cada afirmação traz o número e de onde veio; onde não conseguires
medir, escreve n/d com o porquê. Não corrijas nada — esta sessão é só auditoria.

FASE 1 · ABERTURA (mede o tempo, não o estimes)
1. Regista a hora exacta agora, antes de chamares seja o que for.
2. Chama mooter_fleet({view:'tudo'}) e regista a hora em que a resposta chegou.
3. Diz-me: quantos segundos entre o meu prompt e o primeiro painel? A versão do conector é a
   1.22.0? Se não for, diz qual é e pára para eu reiniciar.
4. Olha para o painel como quem nunca o viu e responde: dá para perceber, em menos de 10 segundos,
   (a) o que está a acontecer agora, (b) quanto já gastei, (c) o que a GPU está a fazer? Diz o que
   ficou por perceber.

FASE 2 · PROGRESSO (a parte que eu acho confusa — descobre porquê)
5. Despacha três jobs pequenos na wave 'auditoria-ux', um de cada tipo:
   - leitura simples (deve ir para o moo, $0)
   - trabalho que exija a nuvem
   - um que force recusa local (ex.: auditoria de segurança)
6. Enquanto correm, chama mooter_check duas vezes com 15s de intervalo e diz-me: consigo saber, sem
   adivinhar, quanto falta e quem está a trabalhar? Que informação FALTA para eu não ter de
   perguntar "e agora?".
7. Compara o que o painel diz com o ledger real (mooter_fleet view:'tudo' vs view:'board'): há
   algum número que não bate? Nomeia-o.

FASE 3 · FECHO (o recibo tem de bater certo, campo a campo)
8. Quando os três terminarem, chama mooter_fleet({view:'recibo'}).
9. VERIFICA CADA NÚMERO do recibo contra a fonte, um a um:
   - as entregas do bloco ① existem mesmo no ledger, com aquele agente e aquele modelo?
   - a tabela do bloco ② soma 100% e bate com os jobs reais?
   - o custo do bloco ③ bate com o que o mooter_check devolveu?
   - o bloco ④ diz "LoRA/DoRA NÃO TREINADA"? Se disser que o modelo melhorou, isso é um BUG GRAVE
     e quero-o em primeiro lugar no relatório.
   - o bloco ⑤ bate com `git status` e `git log origin/HEAD..HEAD` reais? Ficheiros por commitar e
     commits por push conferem?
   - o bloco ⑥ diz a verdade sobre o vault e o SYNC.md?
   - o bloco ⑦ tem no máximo 3 acções?
10. Procura ACTIVAMENTE loopholes, e diz-me quantos encontraste:
    - algum número aparece a 0 quando devia ser n/d?
    - algum n/d aparece sem porquê?
    - algum bloco vazio aparece na mesma?
    - o recibo contradiz o scorecard nalgum ponto?
    - a poupança estimada aparece sem a base de cálculo à vista?

VEREDICTO FINAL, nesta ordem:
A. Tempo até ao primeiro painel: X s. É aceitável? (alvo: <5 s)
B. Os três momentos — abertura, progresso, fecho — estão claros? Nota de 0 a 10 para cada, com a
   razão da nota, não com adjectivos.
C. Os 3 piores buracos de experiência, por ordem de irritação.
D. Uma coisa que devia existir e não existe.
E. O recibo é fiável? Sim/não, e quantos campos não bateram.

Termina com um BOARD curto. Não faças nenhuma correcção.
```

---

## Como ler o resultado

| Sinal | O que significa |
|---|---|
| Tempo até ao painel > 5 s | A abertura precisa de cache ou de resposta parcial |
| "não consigo saber quanto falta" na fase 2 | Confirma a tua sensação: falta progresso incremental |
| Qualquer campo do recibo que não bate | **Bug de honestidade — prioridade máxima** |
| Bloco ④ a dizer que o modelo melhorou | **Bug grave** — a única coisa que o produto não pode fazer |
| Loopholes > 0 | Cada um vira um teste antes de virar correcção |

---

## O que este teste NÃO cobre (e é honesto dizê-lo)

- **A sensação.** Um número pode estar certo e a experiência continuar confusa. Por isso a pergunta
  B pede nota **com razão**, não adjectivos.
- **A primeira vez de outra pessoa.** Tu já sabes o que cada campo significa. O verdadeiro teste de
  onboarding é alguém que nunca viu — fica para quando o plugin sair.
- **O meio da thread.** É precisamente o que ainda não construímos: hoje há abertura e fecho, e o
  progresso é o `mooter_check` que tens de pedir. Se a auditoria confirmar isto, a próxima peça é
  um **progresso que se actualiza sozinho** — e aí a thread fica completa.
