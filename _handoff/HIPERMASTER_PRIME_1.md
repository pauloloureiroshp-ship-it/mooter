# HIPER-MASTER · PRIME-1 → a demo de 90 s, com um número que um cético verifica

> ⇄ ORIGEM: sessão CC `mooter` (wave PRIME-0, 2026-08-01) → ALVO: sessão FRESCA, `~/frugal`.
> Boot: `mooter_setup({sessao:"retomar", id:"mooter"})` · `AGENTS.md` + tail `SYNC.md` ·
> `docs/foundation/MEO_GAUNTLET.md` (15) · `CONSELHO_C_LEVEL.md` · `O_QUE_O_SOCIO_FAZ_SOZINHO.md`.
> PT-BR na conversa, inglês no código.

## MÉTRICA AARRR QUE ESTA WAVE MOVE (G14, declarada à cabeça)

**Activação + Referência.** A demo é o único artefacto que um estranho vê antes de decidir se isto
vale dinheiro, e é o único que se partilha sem explicação. Não é polimento: hoje o produto tem
0 clientes e 0 demos. Qualquer wave de corretude a seguir a esta precisa de justificar porque está
à frente da receita — e depois da PRIME-0 já não há bug conhecido a bloqueá-la (ver abaixo).

## ESTADO À ENTRADA [medido na PRIME-0, 2026-08-01]

- `main` com 4 commits novos sobre `d7337ce` — **por empurrar** (`origin/main..HEAD` = 4).
- **P0 USER_OVERRIDE fantasma: fechado.** `tools/router/user-override-guard.js` + 41/41 testes.
  O G4 (codex) devolveu NO-GO à 1ª versão e os 9 achados dele estão todos como caso de teste.
- **P0 novo, encontrado e fechado:** `reverter()` repunha o `manifest.json` dentro de `server/`
  em vez da raiz → o updater passava a jurar que estava na versão de que se tinha revertido e
  **recusava reinstalar**. Rollback era porta só de ida. Teste U29.
- Release **1.45.3 preparada mas NÃO publicada** — travada por código à espera do gesto do Paulo
  (`_handoff/RUN-RELEASE-1453.bat`) e da confirmação da rotação do OAuth.
- wave-gate: exit 0 · 673 pass · 1 crónica (ondaA, documentada no baseline).

## ⚠️ SUJIDADE HERDADA QUE PODE MORDER (não a ignores)

Durante a PRIME-0, ficheiros-fonte da bridge apareceram **revertidos para antes do PR #267** na
working tree (`oraculo.js`, `seamless.js`, `package.json`, e o `manifest.json` uma segunda vez),
com mtime `2026-08-01 15:02:18` — o minuto exacto da publicação da v1.45.2. Havia também
`classify.js`, `patterns.js`, `version.json`, `tuning-state.defaults.json` soltos dentro de
`packages/mooter-bridge/` (são ficheiros que o bundle mapeia para `server/`) e dois `.rej` de
07-31. **Alguém instalou um bundle por cima do código-fonte.**

Restaurei de HEAD e guardei as versões velhas em scratchpad. **A cadeia causal exacta é n/d** — não
a inventei. Antes de qualquer coisa nesta wave:

```bash
git -C ~/frugal status --porcelain packages/mooter-bridge/
git -C ~/frugal diff --stat
```

Se `oraculo.js`/`seamless.js` voltarem a aparecer modificados sem ninguém lhes ter tocado,
**pára e investiga isso primeiro** — é um repo que se auto-corrompe, e nenhuma demo sobrevive a isso.
Os 6 ficheiros soltos continuam untracked: decidir com o Paulo se se apagam ou se entram no
`.gitignore` (apagar é dele).

## AS TAREFAS

### 1 · Desbloquear a 1.45.3 (rápido, é o que já está pago)
Push dos 4 commits (pede o "pode" ao Paulo — irreversível), depois ele corre o `.bat`. O script já
verifica sozinho: rotação do OAuth confirmada, versões alinhadas, gate verde, e que o oráculo D13
está mesmo dentro do zip. **Não publiques sem o "rodei"/"vou rodar".**

### 2 · A DEMO DE 90 SEGUNDOS (o coração da wave)
Um vídeo/GIF de 90 s que mostra, sem narração explicativa, um vibe coder a pedir uma coisa e o
Mooter a resolvê-la **com a frota visível**. Requisitos duros:

- **Um número real no ecrã, verificável.** Candidatos que a PRIME-0 mediu: `classify_ms` (3,296 ms
  medido, não estimado) e a fatia local **por TOKENS** (G12 — nunca por jobs). O ledger da PRIME-0
  dá 66,67% de *jobs* locais mas declara a poupança líquida das cadeias moo→nuvem como **n/d**;
  se fores usar poupança, ou a mede a sério ou não a mostras.
- **O recibo aparece.** É o que ninguém copia: a frota diz quem correu o quê e quanto custou.
- **Nada encenado.** Se um passo for cortado ou acelerado, diz-se no ecrã. Copy honesta.
- **Mede o TTFW** (time-to-first-win) do que aparece no vídeo. Se demorar mais de 90 s a sério, o
  problema é o produto, não a edição.

### 3 · O mínimo da Ponte que a demo precisa — e só esse
Não construir a Ponte inteira. Só o que faz a demo correr de ponta a ponta sem gesto humano.

### 4 · Fecho
`mooter_setup registar` + `mooter_journal` no vault CANÓNICO `~/paulo-vault` (G15).

## CONTRATO (igual ao da PRIME-0, mantido porque funcionou)

1. **Tudo o que possa ir pela frota, VAI** (`mooter_work`). Excepção declarada no ledger.
2. **G13 antes de passar QUALQUER gesto ao Paulo** — `O_QUE_O_SOCIO_FAZ_SOZINHO.md` + ToolSearch.
3. **Gate ANTES de push.** `timeout:600000`. stderr de git/gh ≠ erro.
4. **MULTI-LLM:** moo prepara a $0 · cc implementa · kimi lê volume · **codex faz o G4**.
   Motor não usado → o recibo diz PORQUÊ em letras grandes.

## O QUE A PRIME-0 APRENDEU E ESTA WAVE TEM DE HERDAR

1. **O G4 em motor diferente paga-se sozinho.** Devolveu NO-GO a um fix que eu já dava por bom e
   apanhou 9 problemas, 2 críticos — incluindo um (`confidence` inflada a 0.99 depois do veto) que
   mudava a execução em silêncio. **Não feches nada de alto risco sem ele.**
2. **Valida o instrumento antes de acreditar no negativo (G11).** Nesta wave, quatro "negativos"
   eram defeitos do aparelho: o `moo` sem ferramentas devolveu "não encontrado"; o `grep` falhou por
   path com espaço sem aspas; o `tail | grep` escondeu 8 falhas; e o `get_advisors` devolveu vazio
   num projecto **pausado**. Nenhum era ausência de facto.
3. **Compara sempre contra baseline medido, nunca contra memória.** A suite do router tem 11 falhas
   crónicas em `main` limpo. Sem correr o baseline 3× eu teria assinado uma regressão que não era
   minha — e, ao contrário, quase perdi uma que era.
4. **Um número sem denominador não é um número (G12).** "66,67% local" é de *jobs*; por *tokens* é
   outra coisa; e a poupança líquida das cadeias moo→nuvem é n/d. O ledger diz isto sozinho —
   copia essa disciplina para a copy da demo.

## 📋 BACK

SHA de `main` · a demo (ficheiro) + o número que ela mostra e como foi medido · TTFW real ·
gate antes do push · gauntlet 15 declarado com o G4 em motor diferente · o que ficou por fazer e
PORQUÊ · e a resposta à pergunta do CEO: **"se cobrasse $19/mês amanhã, o que falta — e esta wave
encurtou ou afastou essa distância?"**
