---
name: moo-pilar-higiene
description: Pilar P4 — Segurança & Higiene do Repo (cargo MRO). Bateria L0 zero-LLM de segredos, shas, untracked, stashes e worktrees stale — desenhada para virar script cron+CI; a sessão humana só corre quando um alerta dispara. Usar quando o Paulo disser "/moo-pilar-higiene", "ronda de higiene", "o repo está limpo?", ou após qualquer incidente.
---

# /moo-pilar-higiene — P4: o pulso determinístico (isto quer ser um cron)

> Pergunta-âncora (MRO): **o que correu que eu não autorizei e podia ser irreversível?**
> Honestidade estrutural (refutação aceita): este pilar é ~100% L0 zero-LLM. O destino certo é **script cron + testes de CI que falham em crescimento + alerta por limiar** — não um cargo com cerimônia. Esta skill existe para (a) correr a bateria à mão até o cron aterrar, (b) responder a alertas. **Nunca gradua** (H3). Kill-switch: se algo cheira a segredo exposto → STOP global via mooter_setup imediato, sem esperar a ronda.

## Bateria L0 (via device_bash, $0, read-only)

```
wc -l SYNC.md                                  # regra ≤200 · 15/08: 3.438 ⚠️
ls _handoff/*.md | wc -l                       # meta 0 executados no topo · 15/08: 186 ⚠️
ls | wc -l                                     # raiz · 15/08: 50
git status --porcelain | grep -c '^??'         # untracked · 15/08 Mac: 0 ✅
git stash list | wc -l                         # stashes · 15/08 Mac: 0 ✅
shasum -a 256 tools/router/classify.js         # tem de ser 427d8c0b… · 15/08: ✅
git worktree list                              # stale? mtime > 7d = preso
git log origin/main..main --oneline | wc -l    # unpushed local
grep -rEl '(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16})' --include='*.md' _handoff/ | head  # padrão de segredo
```
Ledger: `permissoes_pedidas` vs `permissoes_efectivas` (`diferem:true` = anotar); jobs fora de worktree; eventos sem cargo.

## Regras
- Cada número comparado com a última ronda — **este pilar só fala em deltas numéricos**.
- L1 só para triagem de untracked em 3 baldes (lixo óbvio / arquivar / rever humano) — sugestão flagada, NUNCA delete. Todo arquivo em massa = lista explícita + gate Paulo + `mv` para `_archive/` (nunca `rm`).
- Provar negativa ("nada correu sem autorização") exige prev_hash chain no ledger — enquanto não existir, a resposta é `n/d — cadeia por implementar`, não "nada".

## Gauntlet (com comando)
1. sha classify verificado NESTA ronda? → `shasum` acima.
2. Permissões pedidas vs efetivas: onde diferem? → ledger.
3. Untracked/stashes/_handoff/SYNC: deltas vs última ronda? → bateria.
4. Algum job tocou path da lista SELF_GOVERNANCE? → ledger + git log.
5. Worktree stale com trabalho preso? → `git worktree list` + mtime.

## Saída
Recibo RECIBO_DE_FECHO (só números e deltas) + `mooter_journal`. Proposta permanente enquanto não existir: "aterrar isto como cron + CI com limiares" — é a decisão nº1 que este pilar pede ao MEO.
