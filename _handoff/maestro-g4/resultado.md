# G4 do MAESTRO POKE-MOO — resultado · 2026-08-08

**Veredicto: NO-SHIP** para a máquina de estados do v1.0. 13 achados — **11 ALTO · 2 MÉDIO**.
Todos incorporados no v1.1. Este ficheiro existe porque o próprio achado nº1 exige que a F0
tenha prova persistente: sem ele, "o G4 correu" era uma declaração em prosa.

## Proveniência mecânica

| campo | valor |
|---|---|
| job | `job-mskch6ok-9cac` · wave `maestro-g4` |
| motor | codex, sandbox **read-only** (`write:false`), `pre_digest:false` |
| worktree | `C:\Users\Paulo Loureiro\frugal` (absoluto) |
| tokens | in 681 440 (cached 611 328) · out 19 755 (reasoning 12 327) |
| custo | `n/d` — o CLI não reportou `total_cost_usd` |
| verificação cruzada local | **não correu** (`cross-check.json` pendente) ⇒ este gate teve **um** motor, não dois |
| gate cross-device | `LOCAL_AGENT_SYNC=fail` ⇒ readiness da frota `n/d` |
| transcript bruto | `~/.mooter/jobs/job-mskch6ok-9cac/last-message.txt` · sha256 `a107e8622a2052973f50b5801802cb8ea10173fd70112df8b5b3c536c116b49d` |

**Rótulo honesto:** revisão **INTERNA** de motor distinto (codex ≠ Claude). Não é auditoria
independente e não será vendida como tal.

## Ficheiros pinados por sha no momento da revisão

| ficheiro | sha256 |
|---|---|
| `MAESTRO_POKEMOO_2026-08-08.md` **(v1.0 — o alvo revisto)** | `159413c716b8ef4eba7787448485dd3771056d5587f1337b630a4b2148102cb4` |
| `BRIEF_POKE_MOO_2026-08-07.md` (v1.3) | `b272265329a32cec6de702a28658106846cfc900b46817f1f60ec3d0eac582e6` |
| `piloto2/PROTOCOLO_v2_REGRAS_CONGELADAS.md` | `49c2cd2f6048422322868c5fc8e40224cf2770d48935a8cc074d8589b713b448` |
| `~/poke-lab/README.md` | `8dd32d07a9a26123b571bcdaa84ca68ec98ee7f996a6a67c0d300b9df4b2cb86` |

## Estado real medido antes do disparo (não assumido)

`~/poke-lab` 18 passed (corrido, não lido) · `git remote -v` **vazio** ·
`pokemoo-gestos/` **inexistente** ⇒ 4 gestos ausentes · maestro **untracked** ·
`mooter_check` `live:0` · `classify.js` `427d8c0b…48f` **íntegro** ·
ROM-sonda `64255c38…` bate certo com o brief.

## Os 13 achados e onde aterraram no v1.1

| # | sev | achado | aterrou em |
|---|---|---|---|
| 1 | ALTO | F0 sem prova persistente; "só na 1ª execução" não é predicado | §Estado · F0 fecha com `F0.complete.json` + este ficheiro |
| 2 | ALTO | Ordem permite declarar F1 fechada sem a executar | F1 dividida em **F1a/F1b**; `BLOCKED` ≠ `COMPLETE` |
| 3 | ALTO | Adapter A em F1 viola o brief que o wrapper diz soberano | adapter **removido da F1** → nova **F4b**, só MOCK |
| 4 | ALTO | Os 4 gestos são forjáveis pelo próprio agente | §Gestos: vazio = INVÁLIDO · agentes proibidos de escrever lá · `autoria: n/d` declarado |
| 5 | ALTO | F4 é o escritor a criar a própria chave; θ0 pode congelar vazio | template fora da pasta de gestos, termina em `DRAFT` |
| 6 | ALTO | θ0 do wrapper mais fraco que o θ0 do brief | validador exige literalmente **E1–E6** do brief |
| 7 | ALTO | F3 aponta para regras congeladas, não para protocolo executável | F3 exige `PROTOCOLO_v2.md` completo + `GO_N2` com o sha dele |
| 8 | ALTO | ROM tardia deixa B6 sem fase proprietária; F5 sem juiz | F1b `BLOCKED_ROM` até B4+B6+B5-real; entrada da F5 alargada |
| 9 | ALTO | Nenhuma prova F1–F5 fecha inequivocamente uma fase | `maestro-state/FN.complete.json` com bindings obrigatórios |
| 10 | ALTO | Idempotência binária ⇒ F2 parcial vira duplicação ou falso fecho | estados `NOT_STARTED→RUNNING→BLOCKED\|FAILED\|COMPLETE` |
| 11 | MÉDIO | "Sem quota pesada" não reserva a janela da F2 | F1 = zero dispatch Anthropic/Fable; `quota_predicate` ou STOP |
| 12 | ALTO | Gate jurídico do vídeo é prosa e é **mais fraco** que o brief | F5 HUD-only; frames crus ⇒ fase jurídica separada |
| 13 | MÉDIO | Decisões operacionais críticas em aberto | bloco **CONFIG** congelado pelo dono; `n/d` ⇒ STOP |

## O que o G4 tentou refutar e NÃO conseguiu (secção obrigatória — gate que só aprova não correu)

1. **X=40 · N=40 coerentes.** Procurou relaxamento numérico entre maestro L37 e o protocolo; não encontrou.
2. **A proibição de runs A/B antes de F3+`POKE_GO` é consistente** com o brief. O defeito está na autenticidade dos predicados, não na ordem declarada.
3. **A autorização de push está reservada ao dono** e não conseguiu construir um push conforme sem ela. O que falta é fixar o remoto e impedir que o agente o invente.
4. **A distinção B5-sonda vs B5-real é honesta** e coincide com os limites medidos no README.

## Conflitos com regras invioláveis — declarados, NÃO aplicados às regras

O escopo do G4 é **apenas a máquina de estados**. Nenhum achado foi aplicado contra REGRA 0,
regra jurídica dos frames, ROM-nunca-no-git ou push-só-com-payload. Um caso a registar:

- **Achado 12 é mais restritivo que o v1.0 e alinha-se com o brief** (D3: *"footage crua: só
  demo privada ao vivo"*). Aplicado na íntegra à F5 — o wrapper aperta, não afrouxa.
- **Tensão declarada, não resolvida por mim:** o D0-PRIVADO pedido pelo dono nesta sessão
  produz um ficheiro **persistente** com frames, ao passo que o brief diz "só demo privada ao
  vivo". O ficheiro é privado, fora de git, rotulado, e o exportador recusa escrever dentro de
  uma árvore git. **Decisão é do dono** — ver BOARD.

## Achados adicionais desta sessão (Claude, pré-G4) — todos subsumidos

Os 4 vectores que detectei antes do disparo (contradição wrapper↔brief · escritor cria a
própria chave · gestos vazios · idempotência sem estado intermédio) foram confirmados e
aprofundados pelo G4 nos achados 3, 5, 4 e 10 respectivamente. Sem achado órfão.

## Painel adversarial do prompt (16 achados, 7 altos)

`PAINEL_PROMPT_ENERGIA_2026-08-08.md` · sha256
`f1dc990399f73421d2c4d3d059de87e4f89501e2bc0feae4bc1d2ba8c91e29da`.
Os que são normativos para a máquina de estados entraram no v1.1: ordem barato-primeiro com
regra de paragem (UX-6), formato de prova legível para não-dev (UX-7), `gh auth` + auditoria
`ls-files` antes de criar remoto (UX-8/T-6), validação de vídeo por variância + frames
distintos (T-4), `pre_digest:false` + `base_sha` no pré-stage (T-5), escopo do G4 (T-2),
colisão `n/d` vs campo-ausente-`null` (T-8). Os restantes são sobre o prompt, não sobre o
maestro, e ficam registados aqui sem alterar o ficheiro.
