Missão de FECHO (delegação explícita do Paulo via Cowork, 2026-08-25 ~19:00Z: "resolver tudo como sempre"). Regista esta delegação no corpo do PR/commits — as decisões abaixo são tomadas em nome do dono por instrução escrita dele, não auto-autorização.

MUTEX: PC em main (9c54af2c). Trabalha em branch mac/fecho-pendencias + PR. Pull de main primeiro.

1. RATIFICAÇÃO + MERGE #390: o Paulo delegou a ratificação da edição de fixture (cache-aware-cost.test.ts). Comenta no PR: "Ratificado por delegação escrita do dono (Cowork 2026-08-25)". Se CI verde, merge.
2. claude-fable-5 (tier): preservar o invariante do SSOT "priceable, not routable" — alinhar o snapshot removendo o campo tier do fable-5 (deixa de ser ordenável por custo), MANTER pricing withheld até isso estar mergeado, e só então precificar do SSOT. Teste que falha se um modelo sem tier no SSOT ganhar tier no snapshot.
3. Stash mac-checkup-v1494 (24/08): inspeciona (git stash show -p). Se o conteúdo já estiver contido nos ficheiros atuais do vault/repo, dropa e regista o diff no journal; se houver conteúdo único, aplica numa branch, mostra no PR e NÃO dropes sem merge.
4. Duas colisões (LIVE_PREVIEW_AUDIT_FINDINGS.md, LP_COHERENCE_AUDIT_REPORT.md topo vs archive): NUNCA apagar — funde num só ficheiro no _archive/ com headers "=== versão topo ===" / "=== versão archive ===" e datas; topo fica limpo.
5. _handoff/archive/2026-08 órfão: mover conteúdo para o canónico _handoff/_archive/, remover a pasta órfã vazia.
6. Baseline do ratchet: SÓ depois de 3-5 limparem stashes/untracked. Se TODAS as métricas ficarem iguais-ou-melhores, corre --update-baseline com a justificação no commit ("decisão humana delegada por escrito"); se alguma piorar, não corras e reporta.
7. tmp-study/ (220K, corpus do estudo de hoje): move para _handoff/_archive/2026-08-25-estudo-corpus/.
Adversário: codex só-leitura refuta o plano do item 2 ANTES de codificar (é o único com risco de arquitetura). Ollama valida o item 4.
Suite completa por PR (comando do CI). Fecho: append em _handoff/cc-no-talo-progress.md + journal no vault + SYNC (≤3 linhas). PARA e reporta se: CI vermelho não-Vercel, conflito com trabalho do PC, ou o item 3 revelar conteúdo único grande.
GUARDRAILS: classify.js FROZEN · nunca poupança · nunca tocar branches alheias · F1-F4 continuam fora.
