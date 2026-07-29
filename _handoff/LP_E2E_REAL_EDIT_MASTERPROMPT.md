# ⇄ COWORK→CC · LP-COERÊNCIA-DEMO · Edição real E2E via motor de produção (sem GUI, sem mock)

> **Cola isto numa janela fresca do CC.** Objetivo: provar o pipeline Ask→Apply→Security Review de ponta
> a ponta com uma edição REAL (não teste, não mock) no ficheiro real, contra o dev server real que já está
> a correr em 7819 — porque o Cowork não pode digitar dentro do VS Code (restrição de tier da ferramenta,
> não contorno) para simular o clique na caixa de prompt da GUI.

## CONTEXTO
- Seleção já pinada na GUI: `landing/app/page.tsx:52` — `<p>Spawns agents safely by default.</p>`.
- Dev server 7819 confirmado, dual-stack, PID vivo (ver sessão anterior).
- O objetivo NÃO é escrever um teste novo — é invocar o MESMO handler host-side que a GUI chama quando
  o utilizador escreve na caixa "Perguntar"/"Aplicar" e clica. Localiza-o (mesma zona de
  `lp-ask-apply-host.js`/`.test.js` que já leste na sessão anterior) e chama-o com um payload real:
  `{selectionLease: <lease atual real do host, não inventado>, instruction: "Muda este parágrafo para:
  'Ships with safety guardrails on, no config needed.'", file: "landing/app/page.tsx", line: 52}`.
- Se o handler exige um `taskId`/handshake prévio (registo primeiro, resposta depois, só então apply —
  o próprio contrato do COH-07), respeita a sequência REAL: primeiro pedido "Ask" com a pergunta/instrução,
  depois "Apply" citando o taskId devolvido. Não saltes etapas do contrato só para simplificar.

## GUARD
- Edição SÓ em `landing/app/page.tsx` (o parágrafo pinado). Não tocar em mais nada.
- NÃO commit, NÃO push, NÃO `vercel`, NÃO deploy. O ficheiro fica alterado e uncommitted no disco —
  decisão de manter ou reverter é do Paulo depois.
- `classify.js` FROZEN — não tocar.
- Não reinicies o dev server (Next.js faz hot-reload sozinho ao gravar o ficheiro).

## FAZER
1. Confirma o lease/selection atual real do host (não inventes um `selectionLease` — lê o que o host tem
   registado agora, já que a GUI pinou este elemento nesta sessão).
2. Chama o fluxo Ask real com a instrução acima.
3. Chama o fluxo Apply real com o taskId devolvido pelo Ask (não uses atalho direto ao filesystem — tem de
   passar pelo mesmo caminho host que a GUI usaria, incluindo qualquer validação de lease/trust/origin).
4. Roda o Security Review real (mesmo handler que o botão "Review" da GUI chama) sobre a mudança e
   reporta o veredicto tal como ele sai (pass/fail/motivo).
5. Confirma por `curl http://127.0.0.1:7819/` (ou rota certa) que o HTML servido já reflete o novo texto —
   prova que não é só o ficheiro em disco, é o servidor vivo a servir a mudança.
6. `git diff -- landing/app/page.tsx` — cola o diff real no BACK.
7. NÃO reverter automaticamente. Deixa como está para o Cowork mostrar na GUI e o Paulo decidir.

## GATE
Nenhum — não há commit/push/deploy nesta wave, é só a prova viva do pipeline.

## BACK (cola no Cowork)
```
⇄ CC→COWORK · LP-E2E-REAL-EDIT · <sucesso | falhou em: <etapa>>
Handler Ask usado: <ficheiro:função>
Handler Apply usado: <ficheiro:função>
taskId: <real>
Diff real:
<git diff output>
Security Review: <veredicto real + motivo>
Curl pós-edição: <output confirmando texto novo servido>
git status: <só landing/app/page.tsx modificado, uncommitted>
classify.js sha: <intacta>
```
