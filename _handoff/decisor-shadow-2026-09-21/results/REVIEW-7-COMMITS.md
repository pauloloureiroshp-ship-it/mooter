# Revisão dos 7 commits do MP3 — para o dono, em português corrente

Estão em `main`, **por push**, na ordem em que foram feitos (2026-09-21, 07:36 → 08:20 BRT). Nenhum deles toca em
`classify.js` (sha `427d8c0b…` verificado no fim de cada passo). Nenhum deles muda a rota de nenhum prompt: o único
código novo no router **só corre** se tu ligares `MOOTER_DECISOR_SHADOW=1` — e mesmo ligado, regista e não decide.

**Ordem de leitura sugerida (≤ 10 min):** 1 → 5 → 6 → 7; os outros três (2, 3, 4) são só ficheiros de registo e podes
saltar. Se só leres um: o **5** (é o único que muda o router). Se só quiseres saber «o que me acontece se fizer push»:
a tabela no fim.

---

## 1 · `32e65ac6` — pré-registo MP3 (confirmatório v0 + F2-shadow)

- **O que muda:** acrescenta ao `protocol.json` do pacote o bloco `mp3` — a experiência escrita antes de ser corrida:
  qual o candidato (o decisor «cru», v0), qual o corpus (prompts de Agosto/Setembro, um por sessão), quem rotula (três
  motores), qual o gate. Alarga o `.gitignore` do pacote para os ficheiros com prompts reais nunca irem para o git.
- **Ficheiros:** `_handoff/decisor-shadow-2026-09-21/.gitignore` (+7) · `MP3_CONFIRMATORIO_V0_E_F2_SHADOW_CC.md` (+50, o
  próprio masterprompt) · `protocol.json` (+180/−12; as −12 são só re-indentação de listas do bloco `mp2`, conteúdo igual).
- **Risco: nenhum.** Só ficheiros de texto dentro de `_handoff/`; nada é lido pelo router.
- **Reverter:** `git revert 32e65ac6`.
- **Não muda:** rota, `classify.js`, nada em `tools/router/`.

## 2 · `3ce8d61b` — AMENDMENT mp3-1 (o corpus tem 37, não 60)

- **O que muda:** regista, antes de rotular, que o pool de sessões só dava 37 prompts com «um por sessão estrito» — e que
  o tecto **não** foi subido. O sampler (`corpus-60b.mjs`) ganha a opção `--block mp3` para ler os parâmetros do bloco novo.
- **Ficheiros:** `corpus-60b.mjs` (+15/−5) · `protocol.json` (+11/−1).
- **Risco: nenhum.** Script do pacote; ninguém fora de `_handoff/` o importa.
- **Reverter:** `git revert 3ce8d61b`.
- **Não muda:** rota, `classify.js`, `tools/router/`.

## 3 · `542438ab` — AMENDMENT mp3-2 (tecto do shadow 400 → 800 ms)

- **O que muda:** só o `protocol.json`: regista que o tecto de tempo do decisor-sombra subiu de 400 para 800 ms e porquê
  (na altura: 7 em 10 prompts a sair «timeout» pelo hook).
- **Ficheiros:** `protocol.json` (+22).
- **Risco: nenhum.** Texto.
- **Reverter:** `git revert 542438ab`.
- **Não muda:** rota, `classify.js`, `tools/router/`.

## 4 · `bce9cf9d` — erratum ao AMENDMENT mp3-2

- **O que muda:** só o `protocol.json`: corrige a razão do commit 3 — os «7 em 10 timeouts» eram um artefacto do banco de
  ensaio (faltava o `hw-capability.json` e o hook caía para um modelo de 22 GB que despejava o 14b). O custo real do
  decisor, medido, é ~245 ms com o modelo quente. O tecto de 800 fica pela margem.
- **Ficheiros:** `protocol.json` (+21).
- **Risco: nenhum.** Texto.
- **Reverter:** `git revert bce9cf9d`.
- **Não muda:** rota, `classify.js`, `tools/router/`.

## 5 · `0017f8f0` — F2-shadow, 1.ª versão (o único commit que mexe no router)

- **O que muda:** o `arbiter.js` ganha duas funções novas — `ollamaLogit` (faz ao modelo local as 4 perguntas de uma
  letra que o estudo mediu) e `shadowDecisor` (regista no `decisions.log` o que esse decisor **diria**, ao lado do que a
  regra decidiu). O `inject_context.js` ganha **uma linha** que chama isso, e só quando `MOOTER_DECISOR_SHADOW=1`.
  `types.d.ts` ganha tipos opcionais. Entra um ficheiro de testes novo (7 testes) e, no pacote, o `09-shadow-report.mjs`
  e a secção do README que explica tudo.
- **Ficheiros:** `tools/router/arbiter.js` (+282) · `tools/router/inject_context.js` (**+1**) · `tools/router/types.d.ts`
  (+53) · `tools/router/arbiter-shadow.test.js` (+130, novo) · `_handoff/…/09-shadow-report.mjs` (+33, novo) ·
  `_handoff/…/README.md` (+31).
- **Risco: baixo — e esta versão foi substituída pelo commit 6.** Sem a variável de ambiente, a linha nova é um `if`
  falso: zero comportamento. Com ela ligada, **esta** versão esperava até 0,8 s pelo decisor dentro do hook e escrevia
  80 caracteres do prompt no log — foi exactamente o que o adversário apontou e o commit 6 corrige. Se revertesses só o
  6 e ficasses com o 5, ficavas com a versão pior; reverte os dois ou nenhum.
- **Reverter:** `git revert 04c78631 0017f8f0` (os dois juntos, por esta ordem).
- **Não muda:** a rota (nem o tier, nem o modelo, nem o subagente — provado por teste: a decisão é byte-idêntica antes e
  depois), `classify.js`, o arbiter Haiku existente, o `package.json`.

## 6 · `04c78631` — F2-shadow corrigido depois do round 3 do adversário

- **O que muda:** o decisor-sombra sai do caminho do hook: o hook lança um processo separado e **não espera** (medido:
  +4 ms por prompt, em vez de até 800). O evento no log deixa de ter qualquer texto do prompt (fica só um hash e o
  comprimento). O prompt passa ao processo filho por stdin, não pela linha de comandos. O host só pode ser `127.0.0.1`/
  `localhost`. Em modelo frio, o próprio processo separado aquece o modelo, uma vez de cada vez. Testes: 8 (um deles corre o
  hook real com o shadow ligado e verifica que a rota é idêntica).
- **Ficheiros:** `tools/router/arbiter.js` (+331/−128) · `tools/router/arbiter-shadow.test.js` (+40/−1 … 8 testes) ·
  `tools/router/types.d.ts` (+5/−1) · `_handoff/…/README.md` (+13/−1).
- **Risco: baixo.** Sem a env: zero. Com a env: um processo `node` extra por prompt, ~200 ms de GPU por conta própria,
  uma linha de log por prompt. A suite inteira do router (1 328 testes) dá o mesmo resultado antes e depois (1 324 passam;
  as 3 que falham já falhavam e não têm nada a ver com isto).
- **Reverter:** `git revert 04c78631 0017f8f0` (com o 5).
- **Não muda:** rota, `classify.js`, arbiter Haiku, `package.json`, `inject_context.js` (a linha é a mesma do commit 5).

## 7 · `8aa4d210` — resultados do MP3 (só ficheiros do pacote)

- **O que muda:** entram os scripts de análise (`07-guard.mjs`, `08-analyse-mp3.mjs`), os rotuladores (`label-kimi.mjs`,
  `label-60b.mjs` alargado), a análise final (`08-analysis-mp3.md`), o ledger do adversário round 3 e o `PROGRESSO.md`
  com o veredicto **ENTRE**. Os ficheiros com prompts reais (corpora, rótulos brutos) **não** entram — estão no
  `.gitignore` e foram verificados um a um.
- **Ficheiros:** 8, todos em `_handoff/decisor-shadow-2026-09-21/` (+501/−8).
- **Risco: nenhum.** Texto e scripts do pacote.
- **Reverter:** `git revert 8aa4d210`.
- **Não muda:** rota, `classify.js`, `tools/router/`.

---

## Se fizeres `git push origin main`, o que passa a acontecer no teu Claude Code?

| Situação | O que acontece |
|---|---|
| Só push, sem mais nada | **Nada.** O Claude Code corre o hook em `~/.claude/tools/router/`, não o do repo. |
| Push + `/mooter-update` (sincroniza o runtime) | **Nada visível.** A linha nova no hook é um `if (MOOTER_DECISOR_SHADOW === '1')` — sem a variável, não faz nada. Rota igual, latência igual (medido: +4 ms mesmo com a variável ligada). |
| Push + `/mooter-update` + `RUN-DECISOR-SHADOW-ON.bat` + terminal novo | Cada prompt teu gera **uma linha** `decisor_shadow` no `~/.claude/tools/router/decisions.log` (hash + comprimento + o que o decisor local diria), e um processo `node` de ~200 ms de GPU corre em segundo plano. **A rota continua a ser a de hoje.** Para desligar: `RUN-DECISOR-SHADOW-OFF.bat` + terminal novo. |
| Daqui a 14 dias | `node _handoff/decisor-shadow-2026-09-21/09-shadow-report.mjs` mostra quantos prompts acumulaste e quantas vezes o decisor concordou com a regra. Nada roteia por isso. |

**O que ainda não está resolvido e o push não resolve** (MP4-a trata disto): o `hw-capability.json` da tua máquina diz
que és um Mac; e o arbiter Haiku tem um bug de argumentos que o impede de funcionar mesmo com chave.
