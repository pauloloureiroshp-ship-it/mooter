# O que colar depois de reiniciar o Desktop
**Actualizado:** 2026-07-27, depois da auditoria UX e do bug do shebang

---

## ⚠️ ORDEM CERTA — três passos, e o primeiro NÃO é reiniciar

1. **Corre primeiro** (duplo-clique ou pela barra de endereço do Explorer):
   `C:\Users\Paulo Loureiro\frugal\RUN-INSTALAR.bat`
   Instala o bundle mais recente na pasta real da extensão. **Tem de ser este script, não o
   `atualizar:aplicar`** — a v1.21.0 instalada tem o verificador do shebang partido e recusa
   qualquer bundle, incluindo o que a corrige.
   Confirma no fim: `_handoff/instalar-saida.txt` deve dizer `OK INSTALADO`.
2. **Só depois, reinicia o Claude Desktop** (fechar por completo e abrir).
3. **Abre uma sessão nova** com a pasta `frugal` e cola o prompt abaixo.

---

## O prompt

```
Audita a experiência do Mooter nesta thread, do princípio ao fim, como um utilizador exigente que
nunca o viu. Não me digas que está bom: procura o que está confuso e o que mente. Mede em vez de
assumir; cada afirmação traz o número e a fonte; onde não medires, escreve n/d com o porquê.
NÃO CORRIJAS NADA — isto é auditoria.

GATE (pára aqui se falhar)
0. Chama mooter_setup({atualizar:'ver'}) e diz a versão a correr. Se for inferior a 1.22.0, diz-me
   qual é e PÁRA — significa que o RUN-INSTALAR.bat não correu ou o Desktop não reiniciou.
   ⚠️ Não tentes instalar com atualizar:'aplicar': nesta versão o verificador rejeita ficheiros com
   shebang e recusa todos os bundles. A instalação é pelo script nativo.

FASE 1 · ABERTURA (mede, não estimes)
1. Regista a hora exacta antes de qualquer chamada.
2. Chama mooter_fleet({view:'tudo'}) e regista a hora da resposta.
3. Diz: quantos segundos até ao primeiro painel? (alvo <5 s) E qual o tamanho do payload em KB?
   (alvo <8 KB — na auditoria anterior eram ~30 KB e isso são ~7.500 tokens por chamada)
4. VERIFICA OS 14 LOOPHOLES da auditoria anterior, um a um, e diz quais ficaram fechados:
   #1 totals.cost_usd é null (com jobs_sem_medicao) em vez de 0? #2 cloud_in/out idem?
   #3 o painel contradiz combustivel.codex? #4 totals e arvore.resumo continuam a divergir?
   #5 local_share/quota_local_pct/modelo/tier_motor têm porquê? #6 blocos vazios desapareceram?
   #7 arrastar soma 100,0? #8 worktrees free bate com busy? #9/#10 há medido_em+fresco+idade_h?
   #11 duração tem uma só fonte? #12 suspeitas diz qual? #13 active_wave só com job vivo?
   #14 coherence deixou de mostrar stderr de ambiente?
5. Leitura aos 10 s por um estranho: dá para perceber (a) o que acontece agora, (b) quanto gastei,
   (c) o que a GPU faz? Nota 0-10 com a razão, não com adjectivos.

FASE 2 · PROGRESSO
6. Despacha três jobs na wave 'auditoria-ux2': um de leitura (deve ir para o moo, $0), um que exija
   a nuvem, e um que force recusa local (auditoria de segurança).
7. Enquanto correm, chama mooter_check duas vezes com 15 s de intervalo: consigo saber quanto falta
   e quem trabalha, sem adivinhar? Que informação FALTA para eu não ter de perguntar "e agora?".
8. Compara view:'tudo' com view:'board': algum número não bate? Nomeia-o.

FASE 3 · FECHO
9. Chama mooter_fleet({view:'recibo'}). Se a view não existir, diz-o e salta para o veredicto.
10. Se existir, verifica CADA número contra a fonte: entregas do ① existem no ledger com aquele
    agente e modelo? ② soma 100%? ③ bate com o mooter_check? ④ diz "LoRA/DoRA NÃO TREINADA"
    (se disser que o modelo melhorou é BUG GRAVE, em primeiro lugar)? ⑤ bate com `git status` e
    `git log origin/HEAD..HEAD`? ⑥ diz a verdade sobre vault e SYNC.md? ⑦ tem no máximo 3 acções?
11. Procura loopholes novos e conta-os: zeros que deviam ser n/d · n/d sem porquê · blocos vazios ·
    recibo a contradizer o scorecard · poupança sem base à vista · dados velhos sem idade.

VEREDICTO
A. Tempo até ao painel e tamanho do payload — antes vs agora.
B. Quantos dos 14 loopholes ficaram fechados. Nomeia os que sobraram.
C. Nota 0-10 para abertura, progresso e fecho, com a razão.
D. Os 3 piores buracos por ordem de irritação.
E. Uma coisa que devia existir e não existe.
F. O recibo é fiável? Quantos campos não bateram?

Termina com um BOARD curto. Não corrijas nada.
```

---

## O que eu já sei que vais encontrar (para não fingirmos surpresa)

| Previsão | Porquê |
|---|---|
| A Fase 2 continua fraca | O progresso incremental ainda não existe — é a próxima peça |
| O payload pode continuar grande | A L2 (deduplicação) ainda não foi feita; só a L1 entrou |
| O recibo pode não existir | A L3 só arranca depois da L1 fechar |

Se a auditoria confirmar isto, não é falha do teste — é o teste a fazer o seu trabalho, que é
medir o que existe e não o que gostávamos que existisse.
