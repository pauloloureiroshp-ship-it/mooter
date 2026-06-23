# Wave WCOCKPIT-5 — FIX: cockpit em branco após a build do git-stage (0.16.4)

SINTOMA (prod real): instalado o vsix com o estágio-git, a extensão recarrega e o painel do cockpit fica
EM BRANCO (sem render). A v4 (pré-git-stage) renderizava bem. Logo a adição WCOCKPIT-4 (gitStage/render)
introduziu um ERRO DE RUNTIME no render do webview que os testes string-assert NÃO apanharam.

OBJETIVO: encontrar e corrigir o erro de runtime, sem regredir a v4, e blindar com um teste que EXECUTA o render.

DIAGNÓSTICO PROVÁVEL (verifica todos):
- renderRow()/renderGroupHeader() são serializados para o webview via fn.toString() — qualquer referência a
  algo fora do corpo da função (helper não-inlined, variável de módulo) quebra no webview. Confirma que
  TODAS as funções auxiliares usadas pelo render (incl. as do gitStage: stageColor, etc.) estão inline/
  self-contained dentro do que é serializado.
- row.gitStage pode ser undefined em sessões sem worktree/git → acesso a .state/.dirty rebenta. Mete guardas
  (gitStage opcional; default seguro).
- erro lançado dentro do map de sessões → webview script aborta → painel em branco.

VERIFICAÇÃO OBRIGATÓRIA (executar o render, não só assert de string):
- Teste que IMPORTA a função renderRow real e a EXECUTA com várias rows (com e sem gitStage, com e sem
  worktree, com e sem brain) e confirma que NÃO lança e devolve HTML não-vazio. Idem renderGroupHeader.
- Simular o caminho de serialização: se o webview usa fn.toString()+eval, replica isso no teste (Function(...))
  para apanhar refs a símbolos externos.
- Os 106 testes anteriores continuam verdes.

REGRAS: classify.js FROZEN (sha 427d8c0b...364bc48f, prova no fim). Aditivo/corretivo no que é novo (não tocar
engine). git add selectivo. NUNCA merge/push/deploy (gate humano). No fim: bloco status + Notion + vault.
DONE:yes só quando renderRow EXECUTA sem erro nos testes + 106 baseline verdes + sha intacta.
