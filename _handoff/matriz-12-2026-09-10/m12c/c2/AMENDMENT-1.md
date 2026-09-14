# M12-c · emenda 1 — «uma variável» eram duas (2026-09-12, antes de qualquer resultado válido)

O pré-registo (`protocol.json`, congelado 2026-09-11) dizia: *única variável = o arbiter deixa de ser
no-op*. Estava errado, e o erro apareceu na primeira ronda de `rotas`, que não conta como M12-c (o
arbiter tentou e falhou por falta de saldo — `arbiter_call outcome:failed 62 ms`, sem nada no hint;
guardada em `../rotas.arbiter-falhou-sem-saldo.json` e `../decisions.arbiter-falhou-sem-saldo.log`).

Nessa ronda, **4 prompts subiram T0→T1 sem arbiter nenhum**: LEGAL-1, LEGAL-3, DEV-2, MKT-4. A causa
está no `classify.js` congelado, linha 901: sem `ANTHROPIC_API_KEY` no env, **todo o T1 é rebaixado
para T0** (`haiku_unavailable_no_provider_degraded_to_local`). A corrida principal correu sem chave —
por isso «0 → T1». A presença da chave faz portanto DUAS coisas: liga o arbiter **e** faz o T1 existir.

Desenho corrigido, sem tocar em nada que já tenha sido medido:

- **c1** — chave presente + `MOOTER_ARBITER_DISABLE=1`: mede só «o T1 existe». Não precisa de saldo.
- **c2** — chave presente + arbiter activo (este `protocol.json`): mede o arbiter **por cima** da c1.
  Precisa de saldo na org/workspace da chave; a corrida só arranca depois de uma sonda de 5 tokens passar.

As previsões do `protocol.json` mantêm-se para a c2 tal como escritas. Para a c1 há pré-registo
próprio (`../c1/protocol.json`). Nenhum número desta emenda vem de uma corrida: vem da leitura do
código e da ronda inválida, que não é usada para mais nada.
