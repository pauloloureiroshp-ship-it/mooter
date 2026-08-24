⇄ MOO HANDOFF · mac-vault-destravar → identidade da frota · sid n/d · 2026-08-24T15:30Z

STATE:    **landed** (10 PRs na main) + **awaiting-you** (1 decisão de produto: o P2)

WORKTREE: /Users/pauloloureiro_mac_mini/frugal · main @071cf58d · 0 ahead of origin/main · pushed ✓
          Outros 3 worktrees (mooter-wt-higiene, -runner, -skills): 0 commits fora da main,
          0 uncommitted, sem ramo remoto. **Nada preso em lado nenhum.**

GATE:     classify.js sha 427d8c0b… ✓ intacto
          test:cockpit-runner 686 · 685 pass · **0 fail** · 1 todo (pré-existente, q13)
          tools/router        958 · 957 pass · **0 fail** · 1 skipped (pré-existente, router-execute T-05)
          ⚠️ a suite tools/router NÃO conta sempre o mesmo: 944/958/962/969/983 em corridas
             diferentes, incluindo em main intocada. fail sempre 0. Por investigar.

WORK:     70597e5e → 071cf58d · 108 ficheiros, +11588/−745
          10 PRs, todos squash, todos com CI verde, todos os ramos apagados:
            #351 56a57eb1  fix(sync-device) versão do conector lida do self-check
            #352 32007142  feat(frota) beacons dos outros devices pelo REMOTO do vault
            #353 25d9ba93  chore(handoff) os 4 .command versionados em _handoff/operar/
            #354 f7ffe16d  fix(assinatura) kid no envelope · prova_frota medida
            #355 6869f8b6  fix(handoff) o cd que ficou por commitar no #353
            #356 64ceb6ad  feat(frota) Fase 1 — chave do dono à mão, fora do git
            #357 f560b3cd  feat(frota) Fase 2 — Ed25519 com registo de públicas
            #358 bb9f154f  docs(sync) sessão de 2026-08-24
            #359 071cf58d  docs(sync) migração Ed25519 a meio

RED ALERT — uncommitted:
          Nenhum ficheiro *modificado* por commitar. Existe 1 **untracked**:
          `packages/mooter-bridge/package-lock.json` — o preflight chama-lhe "uncommitted";
          é `??`, não `M`. Não foi criado nesta sessão e não foi tocado.

DECISIONS:
          ⚠️ `npm run handoff:qa` devolveu `n/d — --sid obrigatório`. E mesmo com sid não teria
          nada: **esta sessão não usou AskUserQuestion uma única vez** — as decisões foram
          tomadas em conversa. O que segue é recuperado à mão e diz que o é.

  Q:"o index.json do vault está em conflito — como resolver?"
    → escolheu:"pelo precedente e7f99d6: ficheiro derivado, git reset do caminho"
    · porquê: o commit anterior avisa por escrito que resolver com `git add` é o que
      re-versiona o ficheiro pela enésima vez. Disco intocado, .gitignore volta a morder.

  Q:"os 4 .command na raiz de _handoff/ ou em subpasta?"
    → escolheu:"_handoff/operar/, e NÃO subir o baseline do ratchet"
    · porquê: o próprio check pede "scoped run directory"; subir o baseline seria mexer no
      medidor para o commit passar. Destino futuro é tools/cockpit/operar/ quando o
      publicador do cockpit existir — registado no #353.

  Q:"versionar a .owner.key para a frota se ver?"
    → escolheu:"NÃO — Fase 1 (à mão) e depois Fase 2 (Ed25519)"
    · porquê: o HMAC existe para proteger o canal git; pôr a chave nesse canal é dá-la a
      quem ela exclui, e para sempre no histórico.

  Q:"desligar o P2, reformular a pergunta, ou só anular os achados?"
    → escolheu:"tentar reformular (A)" → **refutado pela medição**, ver PENDING.

PENDING (awaiting-you) — UMA decisão, e é de produto:

  Q: O pilar P2 ("Quality & Verification — does the seed value reach the output?")
     está medido e NÃO discrimina. O que se faz com ele e com os 415 achados que produziu?

  A PROVA (prova-de-pilar.mjs, fixture P2 do próprio repo, qwen2.5-coder:14b):
     modo        semeado                controlo           veredicto          n
     caça        achado, cita L8        achado, cita L14   falso-em-ambos ×3  4
                                                            erra-o-alvo ×1
     ancorado    achado, cita L28 ✓     achado, cita L14   falso-em-ambos ×3  3
     diff        sem-achado             sem-achado         **partido** ×3     3
     (defeito semeado: `custo = 0` na L28 sai como `custo_usd` na L34)
     O P3, medido igual: **funciona** ×3. Acha no semeado, cala-se no controlo.

  PORQUE falha: o modelo responde CERTO a uma pergunta demasiado larga. Todo o acumulador
  nasce a zero e é devolvido — `let saida = 0; … return saida` É um valor-semente a chegar
  a uma saída. Resposta crua do semeado:
     "LINE 8: saida = 0 EXITS AT LINE 12 … SEED VISIBLE: LINE 8 -> LINE 12
      PROOF: tools/router/contagem-tokens.js:8"

  opções:
  1) **B — desligar o P2** com a medição escrita (padrão do P4/P11: `activo: false`, fica no
     catálogo), e anular os 415 com `instrumento-nao-discrimina`.
     CUSTO MEDIDO: a rotação cai para **um único pilar (P3)**. Ficam sem pilar nenhum
     **111 ficheiros** `packages/*/src/*.ts` e **834** `tools/**/*.js` fora de `tools/router/`.
     3 testes-guardrail falham e têm de ser reescritos à mão, incluindo um que diz
     literalmente "a cobertura de packages/*/src/*.ts tem de sobreviver ao desligar do P9".
  2) **C — anular só os 415** e deixar o P2 a correr. Fila limpa hoje, volta a encher.
  3) **A — reformular a pergunta.** ⛔ TENTADO E FALHADO nesta sessão, 4 formulações:
     v1 (actual) dispara em tudo · v2 cala-se nos dois · v3 desiste no passo 1 ·
     v4 enumera CERTO (extrai `FIELD LINE 34: custo_usd = custo`, cala-se no controlo 2/3)
     mas **morre a meio da frase** — `tokens_out: 264` contra um NUM_PREDICT de 700, ou
     seja NÃO é o tecto de tokens: o modelo perde coerência antes de concluir.

  HIPÓTESE MINHA, TAMBÉM REFUTADA (para não a repetires): propus remover o default
  `conclusaoDeCitacao: indeterminado → achado`. Medido: **468 dos 524 (89,3%) já dizem a
  conclusão positiva do seu pilar** (`SEED VISIBLE`/`THEY DIVERGE`). O fix mataria os 56
  restantes e deixaria os 468. Além disso esse default é ele próprio um fix medido a
  19/08 (22 de 115 rondas eram deitadas fora por formato). **Não mexer.**

ESTADO DA FROTA (medido agora):
  mac-mini-de-paulo : sig **Ed25519-v1** · kid bb8ed09958167518 · sha 071cf58dd5db · âncora `registo`
  desktop-j26409q   : sig HMAC-SHA256-v1 · **kid AUSENTE** · sha **15280a66c278** · ts 15:25:43Z
  registo (vault 50-fleet/trusted-devices.json): só `mac-mini-de-paulo`
  `prova_frota: false` — e ESTÁ CERTO: "só um device verifica". Antes de hoje dizia `true`
  nesta mesma situação, com a chave nunca partilhada. Não ler o `false` como regressão.

TRIAGEM (medido agora):
  1484 anulados hoje com `instrumento-nao-discrimina` (por=claude, append-only, idempotente)
  524 abertos: **P2 415 · P3 109** ← o `human queue full (524/6)` que pausa a geração
  O tecto é 6 porque `preferences.json` não existe nesta máquina; com ele seria 50 —
  **também não chega**. Não é o preferences que desbloqueia.

NEXT:     Decidir 1) ou 2) acima. Depois disso a fila do dono passa a 109 (só P3, instrumento
          validado hoje) — revisível por uma pessoa. 524 nunca foi.

NEXT FOR COWORK (limpo, sem depender da decisão do P2):
  · **No Windows/PC:** `git pull` no frugal → reiniciar cockpit → `npm run frota:chave -- --inscrever`.
    Isto NÃO é um gesto esquecido: aquela máquina corre 15280a66 e **não tem o código** do
    Ed25519 nem o comando. Depois: mandar a pública (não é segredo) → no Mac
    `--inscrever-device desktop-j26409q <pub>` → **rever o `git diff` do trusted-devices.json
    e commitar** → reiniciar. Só aí `prova_frota` passa a `true`, pela primeira vez honestamente.
  · Investigar a oscilação da suite `tools/router` (944→983). Uma suite que não conta sempre
    o mesmo pode estar a saltar testes em silêncio.
  · Triar os 109 do P3. `AUTORES` distingue `dono` de `claude` de propósito — essas decisões
    são o sinal que separa "o defeito está na PERGUNTA" de "está na RELEVÂNCIA".

RISK:     Nenhuma divergência real entre worktrees (verificado: 0 commits fora da main nos 3).
          O risco vivo é o **P2 a produzir ~415 achados sem valor probatório enquanto correr**,
          e a manter a geração do loop em pausa.

O QUE CORREU MAL NESTA SESSÃO (para não se repetir):
  · **#355 existe por minha causa.** No #353 corri `git mv` (que stageia) e só depois o `sed`;
    commitei sem re-`git add`. Os 4 scripts ficaram partidos na main. O `git status` avisou —
    `RM` com M na 2ª coluna — e eu li o `RM` como "renamed+moved". Pior: disse "verificado a
    correr o script", e corri o WORKTREE, que tinha o fix. **Testei código que não commitei.**
    Correcção de método, aplicada no resto da sessão: `git diff HEAD` vazio + sha256 do
    ficheiro em origin/main igual ao do worktree, ANTES de correr a verificação.
  · A CI do #359 morreu 7 vezes com `not acquired by Runner of type hosted`. O `gh pr checks`
    dizia `pending` sobre jobs já mortos durante 15 min — a fonte fiável é `gh run list`.
    Resolvido com `gh run rerun --failed` (5 do pull_request + 2 do push).

canon:    vault ✓ · notion 4d ⚠️ stale (>3d) · SYNC.md actualizado (#358, #359), 551 linhas
          contra o tecto 606 do ratchet

conf:     git ✓ medido · gate ✓ medido · frota ✓ medida · DECISIONS ⚠️ recuperadas à mão
          (handoff:qa indisponível — sem AskUserQuestion nesta sessão)

⇄ END
