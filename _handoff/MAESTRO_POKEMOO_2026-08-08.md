# 📥 COLAR EM: QUALQUER sessão NOVA do Claude Code (CC) · pasta `frugal`
# MAESTRO POKE-MOO **v1.1.1** — o grafo de fases. O detalhe vive nos briefs.
`gauntlet: alto-risco · wrapper de orquestração · G4 CORRIDO (job-mskch6ok-9cac, NO-SHIP, 13 achados) · verificação do remendo CORRIDA (job-mskurzba-b4e2, NO-SHIP, 3 fechado/8 cosmético/2 pior) · prova em _handoff/maestro-g4/`

O Paulo cola sempre: **"Executa _handoff/MAESTRO_POKEMOO_2026-08-08.md"**.

> **v1.1 → v1.1.1.** A verificação adversarial do remendo chamou **PIOR** a duas coisas que eu
> tinha feito: (a) o manifesto de fase era escrito pelo próprio executor — troquei o sítio da
> mentira, não a impedi; (b) o CONFIG mandava congelar tudo antes da F1a e parar em qualquer
> `n/d`, o que é inexecutável — e foi violado na mesma sessão que o escreveu. Também apanhou
> que eu estava a **resumir o brief** e já divergia dele em C1/C2, C5 e E1–E6.
> **Este ficheiro encolheu de propósito.** Resumo normativo do brief = fonte de divergência.

## Regra de ouro deste ficheiro

> **O brief manda no CONTEÚDO. Este ficheiro manda só na ORDEM.**
> Onde eu resumir um brief, o resumo **não reduz** o DoD dele. Divergência ⇒ o brief pinado
> por sha ganha e a sessão **PARA**.

| documento soberano | sha256 |
|---|---|
| `BRIEF_POKE_MOO_2026-08-07.md` (v1.3) | `b272265329a32cec6de702a28658106846cfc900b46817f1f60ec3d0eac582e6` |
| `SUPERMASTER_VANTAGEM_2026-08-07_v1.1.md` | `1ad0fe297aa35272b4c9ddabe2fe9f02dadb8846550837d7c479f837627c6c0b` |
| `ADDENDUM_MOO_RUN_SERIE_2026-08-08.md` (insumo de F4 e F5) | `bfead0f8d2636f6cc3b5879917bb9490cc6430bed35ec2b26728c380db26fb73` |
| `DEMO_FORMATO_2026-08-09_v0.1.md` (insumo de F4 e F5) | `65372ae03481c4ae51ba909f57a0052e766d180d7fbc1e44252eca68591a21dd` |
| `piloto2/PROTOCOLO_v2_REGRAS_CONGELADAS.md` (base imutável da F3) | `49c2cd2f6048422322868c5fc8e40224cf2770d48935a8cc074d8589b713b448` |

> **Correcção 2026-08-09.** Uma versão anterior deste ficheiro procurava
> `piloto2/PROTOCOLO_v2.md` — um nome que eu inventei — e declarava a F3 "travada por
> construção" por ele não existir. O ficheiro real é o `..._REGRAS_CONGELADAS.md` acima, e
> **não se duplica um ficheiro congelado para lhe dar outro nome.** Ver §F3 para o que
> realmente falta.

## 0.1 Fuso do dono

`owner_tz = America/Sao_Paulo` (UTC-3). Armazenamento em **UTC ISO-8601**; **apresentação ao
dono sempre convertida** para a hora dele e rotulada. Nunca UTC cru, nunca assumir Lisboa.
*(`2026-08-14T01:00Z` = **quinta 13/08 às 22:00** na hora dele.)*

---

## 1. Como uma fase fecha — e porque não é este ficheiro que decide

**Fonte de verdade = os outputs reais + o Git.** O manifesto é uma **projecção validada**.

```
NOT_STARTED → RUNNING(attempt_id) → { COMPLETE | BLOCKED(motivo) | FAILED(motivo) }
```

- O executor escreve `_handoff/maestro-candidatos/<FASE>.candidate.json` e **só** lá pode pôr
  `attempt_id`, `comandos`, `veredicto`, `ressalva`, `notas`. Qualquer campo mensurável que
  ele forneça é **rejeitado**, não ignorado.
- **Escritor único de `_handoff/maestro-state/`: `tools/maestro/validar-fase.js`.** Ele
  recompõe os hashes do disco, confirma que os outputs estão **commitados**, mede o
  `evidence_commit_sha`, valida o `config_requires` da fase e o binding do gesto — e só então
  escreve `<FASE>.complete.json` atomicamente.
- **Auto-referência resolvida:** o manifesto guarda `evidence_commit_sha` (o commit dos
  *outputs*, que existe antes) e entra depois num **closure commit** que acrescenta só ele.
  Nunca tenta conter o sha do commit que o inclui.
- **Estados não-COMPLETE também vivem em ficheiro:** `maestro-state/<FASE>.state.json` com
  `{status, attempt_id, motivo, at}`. Estado só em prosa é estado inexistente.
- **Validador ausente, alterado ou incapaz de medir ⇒ `BLOCKED`, nunca `COMPLETE`.**

```bash
node tools/maestro/validar-fase.js F1a            # valida e escreve
node tools/maestro/validar-fase.js F1a --check    # confirma que o manifesto ainda bate
```

**O que isto NÃO prova:** autoria humana. Ver §3.

## 2. CONFIG — `_handoff/maestro-state/CONFIG.json`

Um `n/d` **só bloqueia a fase que consome esse campo** (`config_requires` na spec da fase).
A regra anterior — congelar tudo antes da F1a — era inexecutável e foi violada por quem a
escreveu. Escritor do CONFIG: **o dono**. Um agente propõe; não preenche.

| fase | `config_requires` |
|---|---|
| F1a | `poke_lab_repo_slug` · `remote_name` · `visibility` · `video_policy` |
| F1b | — |
| F2 | `F2_repo` · `F2_brief_sha` · `quota_predicate` |
| F3 | `N2_protocol_sha` · `N2_result_path` |
| F4 | — |
| F4b | `arm_a_provider` · `arm_a_transport` · `arm_a_model` |
| F5 | `video_policy` |

`branch` **não** é CONFIG: mede-se do Git e repete-se no payload exacto de cada push.

## 3. Gestos do dono — **fora da árvore do repo**

O brief diz que o gesto da ROM é privado e que o repo **só** regista `rom_sha256`. Guardar
`ROM_PATH.txt` dentro de `frugal/` contrariava-o. Pasta dos gestos: **`~/.poke-gestos/`**
(fora de `frugal` e de `poke-lab`).

| ficheiro | tem de conter | destrava |
|---|---|---|
| `ROM_PATH.txt` | caminho absoluto do dump | F1b |
| `GO_N2` | o sha256 de `piloto2/DECLARACAO_RUN_N2.md` | F3 |
| `PREREG_FREEZE` | o sha256 do `prereg-poke.md` **preenchido** | F4 |
| `POKE_GO` | o sha256 do θ0 congelado | F5 |

1. **Gesto vazio é INVÁLIDO.** O validador recusa 0 bytes e recusa um gesto que não contenha
   o sha daquilo que destrava.
2. **Agentes estão PROIBIDOS de criar ou alterar seja o que for em `~/.poke-gestos/`.**
3. **`autoria: n/d`, declarado no manifesto.** Verificar que o ficheiro existe, não está vazio
   e está ligado por sha é mecânico. *Provar que foi o dono a escrevê-lo não é* — nesta
   montagem, um nonce no ficheiro também não resolveria (quem o lê para validar consegue
   copiá-lo). Exige-se **também** a palavra do dono na conversa, e assume-se a limitação em vez
   de a disfarçar. Fecho verdadeiramente à prova de agente exigiria ler o transcript do host
   com `role=user`, ou um HMAC com segredo no Credential Manager — **não implementado**.

## 4. Quota e concorrência — antes de QUALQUER dispatch ou run, incluindo a F5

- `mooter_check` tem de dar **`live:0`** para piloto-1 e WAVE VANTAGEM. Job concorrente ou
  estado `n/d` ⇒ **BLOCKED**. *(o brief proíbe concorrência globalmente, não só na F2)*
- **F1a: zero dispatch Anthropic/Fable.** Local, `$0` e MOCK.

**`quota_predicate` (congelado pelo dono, 2026-08-09) — em `CONFIG.json`:**

| campo | valor |
|---|---|
| fonte | `~/.mooter/quota-live.json`, `source: cc-statusline-stdin` — **oficial**: é o próprio Claude Code a empurrar os limites reais e os instantes de reset para a statusline |
| regra | `now >= resets.seven_day` **AND** `(now - ts) <= 30 min` |
| ficheiro obsoleto (>30 min) | `n/d` ⇒ **STOP**. Nunca "assume-se que já resetou" |
| campo ausente | `null` **nunca** vale 0 ⇒ `n/d` ⇒ STOP |

**O instante lê-se do campo `resets.seven_day` NO MOMENTO do dispatch — nunca de uma data
escrita neste ficheiro.** Uma data em prosa envelhece e mente; o campo não.
A medição de quota do `mooter_check` é **limite inferior** (só esta máquina) contra uma
**referência default que não é um limite publicado** ⇒ **não serve de gate** e não substitui
o predicado.

## 5. Leitura de estado (início de toda sessão)

`node tools/maestro/validar-fase.js <F> --check` para cada fase com manifesto ·
`maestro-state/*.state.json` · `~/poke-lab` (README + suite **corrida**, nunca lida) ·
briefs soberanos (§Regra de ouro) · `~/.poke-gestos/` · `mooter_check` · `SYNC.md` (tail).

## 6. Regras invioláveis — nenhum achado de G4 as levanta

Conflito com uma destas ⇒ **declara e NÃO aplica**.

- **REGRA 0** do brief — a fila não se fura; **ZERO runs A/B** antes de F3 fechada + `POKE_GO`.
  *(runs de **validação** B4/B6/B5-real são permitidos — não são comparativos)*
- **`classify.js` intocado** — `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- **Jurídico dos frames** — nenhum frame de jogo em material de pitch/publicado sem parecer
  prévio; publicável = HUD-only, zero áudio do jogo, disclaimer nominativo. Footage crua: demo
  privada ao vivo.
- **ROM nunca no git**, nunca distribuída; instruções de dump nunca escritas em ficheiro.
- **Push só com payload explícito** (`push origin <sha>:branch`) + autorização do dono na conversa.
- teste vermelho antes de fix · campo ausente = `null`; **métrica não medida = `n/d`** (nunca
  `null`, nunca `0`, nunca inventada) · commits selectivos · Mooter no talo (codex código · moo
  verificação `$0` · `pre_digest:false` · worktree em caminho **ABSOLUTO**) · anti-cherry-pick ·
  claims `[medido]` ou `n/d`.

---

# O GRAFO

| fase | entrada (mecânica) | o que faz | fecha com |
|---|---|---|---|
| **F0** | — | G4 adversarial desta máquina de estados | `F0.complete.json` |
| **F1a** | F0 `COMPLETE` | pista sem ROM: suite corrida · máquina de captura com gate · higiene de push | `F1a.complete.json` |
| **F1b** | gesto `ROM_PATH.txt` | B4 → B6 → B5-real | `F1b.complete.json` |
| **F2** | F1a `COMPLETE` · `live:0` · `quota_predicate` | VANTAGEM **Bloco C** | `F2.complete.json` |
| **F3** | F2 `COMPLETE` · `DECLARACAO_RUN_N2.md` + `GO_N2` | teste nº2, braço B′ | `F3.complete.json` |
| **F4** | F3 `COMPLETE` | §0 do POKÉ (papel) | `F4.complete.json` |
| **F4b** | F4 `COMPLETE` | adapters C1/C2, **só MOCK** | `F4b.complete.json` |
| **F5** | F1b+F4+F4b `COMPLETE` · E2 verde · `POKE_GO` | M1 (badge do Brock) | `F5.complete.json` |

## F0 — `COMPLETE` `[medido 2026-08-08]`
Duas rondas, ambas codex read-only, ambas **NO-SHIP**: `job-mskch6ok-9cac` (13 achados, 11
ALTO) e `job-mskurzba-b4e2` sobre o remendo (3 fechado · 8 cosmético · 2 pior). Prova e
incorporação: `_handoff/maestro-g4/`. **Verificação cruzada local não correu em nenhuma ronda**
⇒ um motor, não dois. Rótulo honesto: revisão **INTERNA**. Um v1.2 que mexa no grafo exige G4 novo.

## F1a — pista, a parte que não depende da ROM
Suite do `~/poke-lab` **corrida** · máquina de captura com gate de validação e controlo
anti-vacuidade · higiene de push (`gh auth` · `git ls-files` provando zero `*.gb/*.gbc/*.mp4`
· remoto privado **vazio, sem push**).
**PROIBIDO:** adapters de braço (§F4b) · dispatch Anthropic/Fable.
**Ainda em falta para fechar:** o *guard do exportador público* (falhar se detectar assets de
jogo) **não existe** — o que existe é o guard da captura privada, que recusa escrever dentro
de uma árvore git, esse **testado**. Não confundir os dois.

## F1b — B4 → B6 → B5-real · `BLOCKED_ROM` até haver gesto
Não fecha em parte: exige B4 **e** B6 **e** B5-real.
**`FAIL` do B5-real não é deadlock.** Distinguir:
- B5 executou e deu FAIL ⇒ F1b pode ser `COMPLETE`, com
  `{"b5_real":{"execution":"complete","verdict":"FAIL","determinismo":"n/d","replay_seal":false,"reason":"<medido>"}}`
- B5 não terminou ou a prova é inválida ⇒ F1b é `FAILED`.
- `replay_seal:false` ⇒ o §0 **não** pode usar replay como selo, e o M3 fica proibido.
**Prova legível para não-dev:** 1 linha em português (PASSA/FALHA + o que significa para o §0)
· `rom_sha256` · 1 frame PNG rotulado **PRIVADO**.

## F2 — VANTAGEM Bloco C
Prioridade única. **DoD é o do brief**, integralmente. Passo 0 de qualquer sessão que encontre
`RUNNING`: rebase + reconfirmar que os vermelhos ainda falham **pelo motivo certo**.
Pré-stage em `mooter/wt-f2-prestage` (base_sha `168f598d`) — **não fecha a fase**.

## F3 — teste nº2 · **não está travada por construção**
A base existe e está congelada: `piloto2/PROTOCOLO_v2_REGRAS_CONGELADAS.md` (`49c2cd2f…`).
**Não se duplica nem se reescreve** — o resto do protocolo escreve-se *por cima* dela, nunca
contra ela, como o próprio ficheiro manda.

**Imutável (R1):** `X=40` · `N=40` · amplitudes sobrepostas são **INCONCLUSIVO, não empate**.
Não se movem nem "recalibrados", nem que o B′ falhe por 1 ponto. **R2:** o baseline é o nº1
medido (A 6,64/8,94/0% · B 6,66/**3,91**/**100%** · C 7,40/1,87/0%), que **não se re-corre**.
**R3/R4:** accuracy nunca sem baseline+recall da minoritária; proveniência sempre com o acaso
ao lado.

**O que falta é um entregável nomeável, não um impedimento estrutural.** As próprias regras
listam o que *pode* mudar e *tem* de ser declarado antes de correr: **tarefas · corpus · nº de
execuções · juízes · a introdução do braço B′**. Isso vive num ficheiro **novo**,
`piloto2/DECLARACAO_RUN_N2.md`, que cita o sha das regras congeladas; e `GO_N2` carrega o sha
**da declaração**. Publicar contra o §0 seja qual for o veredicto.

## F4 — §0 do POKÉ
Gera `_handoff/prereg-poke-template.md` — **fora** da pasta de gestos, termina em `DRAFT`. O
dono preenche e devolve `PREREG_FREEZE` com o sha.
**`F4.complete.json` liga por `output_hash` os SEIS, não só o primeiro:**
E1 prereg congelado · E2 `judge.py` + testes verdes · E3 `StepReceiptV1` versionado + teste
campo-ausente=`null` · E4 teste dos três hashes exactos (`rom_sha256`, `initial_state_sha256`,
`runner_commit_sha`) · E5 estimativa prévia por braço · E6 escada de marcos + M3 condicionado.
*O sha do `prereg-poke.md` sozinho fecha apenas E1.* Conteúdo de cada um: **no brief**.
Insumo obrigatório: o addendum MOO RUN (dois formatos pré-registados; carimbo por frame).

## F4b — adapters C1 e C2, só MOCK
> **Pré-requisito de ordem, medido em 2026-08-09:** o `StepReceiptV1` **v2** (campos de prompt,
> contexto, `routing_reason` e guardrails — ver `DEMO_FORMATO_2026-08-09_v0.1.md` §6) tem de
> existir **antes** desta fase. O brief congela o schema antes dos adapters (C0.a); se os
> adapters nascerem contra a v1, o painel da demo não tem de onde sair e a F5 vira reescrita
> dos dois braços. É schema, não é run — não fura a REGRA 0.

Executa **integralmente** C1 e C2 do brief soberano — incluindo `StepReceiptV1`, proveniência
das decisões e **recibos separados de executor e juiz**. Braço A nomeia provider · transporte ·
modelo exactos ("Fable 5" à solta não é um modelo). Zero runs de medição.

## F5 — M1, o primeiro speedtest
> **O mock e o banner saem JUNTOS — e isto é código, não um parágrafo.**
> A DEMO-FORMATO tem hoje um MOCK rotulado na tela 2 e o banner "DEMO DE FORMATO".
> Trocar o mock por um motor real transforma a demo numa comparação de medição e cai
> na REGRA 0. `poke_lab/portao_demo.py` recusa mecanicamente essa troca sem: **F3
> fechada** (`maestro-state/F3.complete.json`) · **`POKE_GO` não vazio** · **run
> pré-registado** (`--prereg-sha`). Provado a recusar em `tests/test_portao_demo.py`.
> Tirar o mock e deixar o banner é pior que um erro: é comparação real vestida de
> brincadeira.
Runs numerados **antes**, **todos** publicados (incl. abortados) · recibo por lance na cadeia
C0 · leaderboard dos jsonl · âncora externa fica `anchor_status:"pending"` até aprovação
explícita do dono.
**Vídeo:** a F5 gera **exclusivamente HUD-only**. Versão persistente com frames ⇒ **fase
jurídica separada**, com parecer + autorização ligados ao hash do ficheiro. O guard do
exportador é **pré-requisito da F5** e ainda não existe.
**Tectos (C5) são os do brief, literalmente:** `step_timeout_s` · `max_steps_por_run` ·
`max_cost_usd_por_run` · admissão pré-call pelo pior caso · `max_output_tokens` obrigatório ·
overshoot máximo pré-registado · `termination_reason` sempre.

---

## Fecho de toda sessão
BOARD `[medido]` · `SYNC.md` · journal no vault · `gauntlet:` grep-ável · push **proposto** com
payload · **nunca** declarar fase fechada sem `validar-fase.js` a escrevê-la.

---
gauntlet: alto-risco · duas rondas de G4 corridas, ambas NO-SHIP, ambas incorporadas (prova em `_handoff/maestro-g4/`) · verificação cruzada local não correu em nenhuma ⇒ um motor, não dois · G3: a ordem é imposta por validador, não por prosa · G18: fase fechada = manifesto escrito pelo validador sobre outputs commitados · limitações DECLARADAS: autoria de gesto não é mecanicamente provável (`autoria: n/d`) · guard do exportador público não existe · a F3 NÃO está travada por construção: falta a DECLARACAO_RUN_N2 (tarefas·corpus·n·juízes·B′) sobre as regras congeladas · não corridos: nenhum
