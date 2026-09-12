# P3 · adversário (crítico ≠ autor) — Codex CLI gpt-6-astra, ronda 1, e a resposta

**Prompt:** `adversary-prompt-sent.txt` · **Saída íntegra:** `adversary-codex-round1.md` (8 ataques, 99 s, sem acesso ao repo). A ronda inverteu o veredicto: de «obediência > 0, pequena» para **0/20**.

| # | Ataque | Gravidade (dele) | Resposta | Estado |
|---|---|---|---|---|
| P3-01 | a métrica não identifica quem executou: o Option A do hook satisfaz «chamada Ollama na sessão» | **fatal** | **Aceite — e confirmado no bruto.** Todas as 30 chamadas `qwen3:30b` têm `eval_count = 256` (tecto do `ollama_call_node.js` do hook; o `ollama_call.sh` do subagente usa 512) e, em B, precedem o rewrite. Métrica estrita na análise: **0/20 e 0/20**. Cadeia spawn→Bash→Ollama não reconstruível (streams não persistidos) | corrigido (análise) / declarado |
| P3-02 | «8/8 reescritos» é intenção registada, não aplicação | serious | **Aceite.** «8 tentativas de rewrite registadas; aplicação não verificada»; os `agent_calls` mostram o input original; 8 sessões alcançadas = 8 spawns (1 por sessão, inventário na AMENDMENT-1) | reformulado |
| P3-03 | setas e título sugerem efeito; negação absoluta também excede | serious | **Aceite.** Contagens separadas; «esta experiência não identifica o efeito do hook» | reformulado |
| P3-04 | população seleccionada com chave, executada sem chave; sha ausente do protocolo; n14 | serious | **Aceite.** Declarado no título dos números; errata do sha (`b4a8ac5b…`, blob `e517f362` em `5efd58ed`); n14 excluído pela regra push/deploy/delete/rm | corrigido (errata) |
| P3-05 | são 5 mudanças de decisão, não 4; execução local pode contrariar o router; T3 com rewrite T0 é incoerente | serious | **Aceite.** 5, corrigido. Causa: `last-subagent.json` é um ficheiro por máquina, lido no fim da sessão e escrito por todas as sessões (a do operador incluída) → `decision_at_spawn` = **n/d**; D10. «Obediência à recomendação» não é medível com este ficheiro | corrigido / declarado |
| P3-06 | o hook não cumpre todas as garantias anunciadas (override, idade, sessão) | serious | **Aceite.** As garantias saíram do veredicto; o hook é um padrão demonstrativo (tzachbon), não produto | reformulado |
| P3-07 | ambiente (sem `.git`, 12 turnos, 300 s, allowedTools) pode produzir falsos negativos; timeout ≠ «sem delegação» | serious | **Aceite em parte.** n07 foi tecto de turnos, não timeout; o enviesamento é possível e fica declarado; controlo positivo da cadeia local sob as mesmas restrições: **não feito** (o próximo instrumento) | declarado |
| P3-08 | conclusão para investidores excede o identificado; «primeira», «sem hook nenhum», tokens como recibo | **fatal** | **Aceite.** O veredicto v2 é «0/20»; «primeira» e «sem hook nenhum» saíram; os tokens Ollama são «todos do hook» | reformulado |

**Rejeitado:** nada. **Não resolvido:** cadeia de atribuição (exige persistir os streams); decisão por sessão (defeito de produto); controlo positivo da cadeia local; efeito do hook.

**Ronda 2:** não corrida — o veredicto passou a derrota e os ataques restantes são os declarados; a quota do Codex fica para P7/P8.
