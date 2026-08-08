# 📥 COLAR EM: QUALQUER sessão NOVA do Claude Code (CC) · pasta `frugal` · o gesto é sempre o mesmo
# MAESTRO POKE-MOO **v1.1** — um único regente, da pista ao primeiro speedtest M1 (A vs B′, vídeo + métricas)
`gauntlet: alto-risco · wrapper de orquestração sobre briefs JÁ confrontados (POKE-MOO v1.3 pós-G4-codex · VANTAGEM v1.1 pós-G4 · protocolo nº2 congelado) — superfície nova é só a máquina de estados; o G4 dela CORREU (job-mskch6ok-9cac, NO-SHIP, 13 achados) e este v1.1 é o resultado`

O Paulo cola SEMPRE a mesma linha numa sessão nova: **"Executa _handoff/MAESTRO_POKEMOO_2026-08-08.md"**.

> **v1.0 → v1.1.** O G4 deu **NO-SHIP** à máquina de estados do v1.0: as fases fechavam por
> prosa, os gestos eram forjáveis pelo próprio agente, a F4 mandava o escritor criar a sua
> própria chave, e uma F2 morta a meio ficava indistinguível de uma F2 fechada. Prova e
> achados: `_handoff/maestro-g4/resultado.md`. v1.0 revisto = sha
> `159413c716b8ef4eba7787448485dd3771056d5587f1337b630a4b2148102cb4`.

---

## 0. O contrato deste ficheiro

Cada sessão: (1) lê o ESTADO REAL no disco — **nunca** confia em memória de conversa nem em
prosa deste ficheiro; (2) executa APENAS a próxima fase destravada; (3) para no gate certo;
(4) fecha com BOARD `[medido]`.

**A regra que substitui a idempotência ingénua do v1.0:** uma fase **não** é "fechada ou
não-fechada". Tem estado explícito e o estado vive num ficheiro, não numa frase.

## 1. Modelo de estado — o que substitui a prosa

Estados possíveis de cada fase:

```
NOT_STARTED → RUNNING(attempt_id) → { COMPLETE | BLOCKED(motivo) | FAILED(motivo) }
```

- **`COMPLETE` só existe se existir `_handoff/maestro-state/<FASE>.complete.json`**, escrito
  atomicamente no ÚLTIMO passo da fase, depois de a validação passar.
- **`BLOCKED` nunca conta como `COMPLETE`.** "À espera de gesto humano" é `BLOCKED`. Nenhuma
  fase a jusante pode alegar que uma fase `BLOCKED` fechou. *(G4 nº2)*
- Ao encontrar `RUNNING`, a sessão **reconcilia** pelo `attempt_id` (ledger, commits, outputs)
  e retoma do último checkpoint. **Nunca repete um dispatch já materializado.** *(G4 nº10)*
- Declaração em prosa, rodapé, BOARD antigo ou cabeçalho "pós-G4" **não fecham nada**. *(G4 nº1)*

### Schema obrigatório de `<FASE>.complete.json`

```json
{
  "phase": "F1a",
  "status": "complete",
  "attempt_id": "<uuid ou job_id>",
  "master_sha256": "<sha deste maestro no momento do fecho>",
  "brief_sha256": "<sha do brief que governa a fase>",
  "input_hashes":  {"<path>": "<sha256>"},
  "output_hashes": {"<path>": "<sha256>"},
  "repo": "<frugal|poke-lab>", "branch": "<...>", "commit_sha": "<...>",
  "comandos": [{"cmd": "...", "rc": 0, "resumo": "18 passed"}],
  "completed_at": "<ISO-8601 UTC>"
}
```

Manifesto **inválido** (⇒ a fase NÃO está fechada): anterior aos seus próprios inputs · sem
binding de sha · com campo em falta · produzido por uma tentativa que abortou. *(G4 nº9)*

## 2. Bloco CONFIG — congelado pelo dono ANTES da F1a

Sem isto, uma sessão inventa respostas operacionais. **Campo `n/d` ⇒ PARAR e perguntar.** *(G4 nº13)*

| chave | valor | estado |
|---|---|---|
| `poke_lab_remote_url` | — | **n/d** ⇒ STOP antes de qualquer criação de remoto |
| `remote_name` / `branch` / `visibility` | — / — / `private` | **n/d** (visibilidade é a única pré-decidida: privado) |
| `arm_a_provider` / `arm_a_transport` / `arm_a_model` | — | **n/d** — "Fable 5" à solta não é um modelo *(brief C1)* |
| `F2_repo` / `F2_brief_sha` | `frugal` / `1ad0fe29…` (VANTAGEM v1.1) | parcial |
| `N2_protocol_sha` | — | **n/d** — o protocolo executável ainda não existe (§F3) |
| `N2_result_path` | — | **n/d** |
| `quota_predicate` | — | **n/d** — ver §4 |
| `video_policy` | `HUD-only publicável; frames ⇒ fase jurídica separada` | fixado |

## 3. GESTOS DO DONO — `frugal/_handoff/pokemoo-gestos/`

| ficheiro | tem de conter | destrava |
|---|---|---|
| `ROM_PATH.txt` | caminho absoluto do dump do cartucho | F1b (B4→B6→B5-real) |
| `GO_N2` | o **sha256 de `piloto2/PROTOCOLO_v2.md`** | F3 |
| `prereg-poke.md` | §0 **totalmente preenchido** (E1–E6) | — |
| `PREREG_FREEZE` | o **sha256 exacto** do `prereg-poke.md` preenchido | F4 fecha |
| `POKE_GO` | o **sha256 do θ0 congelado** | F5 |

**Regras duras** *(G4 nº4, nº5)*:

1. **Gesto vazio é sempre INVÁLIDO.** Um ficheiro de 0 bytes prova que alguém fez `touch`, não
   que o dono decidiu.
2. **Agentes estão PROIBIDOS de criar ou alterar seja o que for em `pokemoo-gestos/`.** Se a
   pasta não existe, é o dono que a cria. Um agente que precise dela **pára e pede**.
3. **Autoria de um ficheiro não é mecanicamente provável nesta montagem.** Registar sempre
   `autoria: n/d` e exigir, além do ficheiro, **confirmação do dono na conversa**. Não fingir
   que o ficheiro é assinatura. *(honestidade: isto é uma limitação declarada, não um gate)*
4. A F4 **nunca** escreve dentro desta pasta — gera `_handoff/prereg-poke-template.md`, fora
   dela, e termina em `DRAFT`.

## 4. Predicado de quota — o que substitui "quota suficiente"

- **F1a: zero dispatch Anthropic/Fable.** Só verificações locais, `$0`, e MOCK. *(G4 nº11)*
- **F2 só arranca** com uma fonte **identificada** que registe reset, quota restante e a
  reserva mínima que o dono fixar.
- A medição local do `mooter_check` é **limite inferior** (só esta máquina) contra uma
  **referência default que não é um limite publicado**. **Não serve de gate numérico.**
- Fonte oficial `n/d` ⇒ **PARAR e perguntar**. Nunca inferir "há folga".

## 5. Leitura de estado (início de toda sessão)

`_handoff/maestro-state/*.complete.json` (a verdade das fases) · `~/poke-lab` (README + suite
**corrida**, não lida) · `BRIEF_POKE_MOO_2026-08-07.md` (v1.3) · `SYNC.md` (tail) ·
`pokemoo-gestos/` · quota (§4) · `mooter_check` — **nunca competir com wave viva**.

## 6. Regras invioláveis — **nenhum achado de G4 as levanta**

O escopo de qualquer G4 é **a máquina de estados**. Conflito com uma destas ⇒ **declara e NÃO
aplica**:

- **REGRA 0** do brief POKE-MOO — a fila não se fura; **ZERO runs A/B** antes de F3 fechada +
  `POKE_GO`. *(runs de **validação** B4/B6/B5-real são permitidos: não são comparativos)*
- **`classify.js` intocado** — `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- **Jurídico dos frames** — nenhum frame de jogo em material de pitch/publicado sem parecer
  prévio; publicável = HUD-only, zero áudio do jogo, disclaimer nominativo.
- **ROM nunca no git**, nunca distribuída; instruções de dump **nunca** escritas em ficheiro.
- **Push só com payload explícito** (`push origin <sha>:branch`) e autorização do dono na
  conversa.
- teste vermelho antes de fix · campo ausente = `null` (nunca 0); métrica não medida = `n/d`
  (nunca inventada) · commits selectivos · Mooter no talo (codex código · moo verificação `$0`
  · `pre_digest:false` · worktree em caminho **ABSOLUTO**) · anti-cherry-pick: todo run
  iniciado publica-se · claims `[medido]` ou `n/d`.

---

# AS FASES

## F0 — G4 da própria máquina de estados
**Estado: `COMPLETE`** `[medido 2026-08-08]`
**Prova:** `_handoff/maestro-g4/resultado.md` + `maestro-state/F0.complete.json`.
`job-mskch6ok-9cac`, codex read-only, **NO-SHIP, 13 achados (11 ALTO)** — todos incorporados
neste v1.1. Verificação cruzada local **não correu** ⇒ este gate teve **um** motor, não dois.
**Não se re-executa.** Um v1.2 que mude a máquina de estados exige G4 novo.

## F1a — PISTA, a parte que não depende da ROM
**Entrada:** F0 `COMPLETE` + CONFIG sem `n/d` nos campos que a fase usa.
**Trabalho:** suite do `~/poke-lab` **corrida** (não lida) · máquina de captura de vídeo com
gate de validação e controlo anti-vacuidade · higiene de push (`gh auth status` · `git
ls-files` dos dois repos provando zero `*.gb/*.gbc/*.mp4/*.gif` · remoto privado criado
**vazio, sem push**) · commit selectivo.
**PROIBIDO nesta fase:** qualquer adapter de braço *(ver F4b)* · qualquer dispatch
Anthropic/Fable · criar remoto sem `poke_lab_remote_url` no CONFIG.
**Fecha com:** `F1a.complete.json` (inclui o resumo exacto da suite e os shas dos outputs).

## F1b — B4 → B6 → B5-real
**Estado enquanto não houver `ROM_PATH.txt` válido: `BLOCKED_ROM`.** Nunca `COMPLETE`. *(G4 nº2, nº8)*
**Entrada:** gesto `ROM_PATH.txt` **não vazio** + confirmação do dono na conversa.
**Trabalho:** B4 (existência + boot no PyBoy + `rom_sha256`; **só o hash se regista**) → B6
(mapa RAM vs `pret/pokered`, com testes) → B5 repetido sobre a ROM real.
**FALHA é resultado válido** ⇒ `determinismo: null` **com nota em campo próprio**, e o §0 não
usa replay como selo.
**Formato da prova (para não-dev):** 1 linha em português (PASSA/FALHA + o que significa para
o §0) · `rom_sha256` · 1 frame PNG rotulado **PRIVADO**.
**Fecha com:** `F1b.complete.json` — exige B4 **e** B6 **e** B5-real declarados. Não fecha em
parte.

## F2 — CASCATA-APRENDE (a wave pesada)
**Entrada:** F1a `COMPLETE` (F1b pode estar `BLOCKED_ROM`) · `mooter_check` sem jobs vivos ·
predicado de quota do §4 satisfeito por **fonte identificada** · `base_sha` registado.
**Trabalho:** `SUPERMASTER_VANTAGEM_2026-08-07_v1.1.md` **Bloco C** como prioridade única.
DoD do próprio brief: teste vermelho primeiro · bateria interna com gate mecânico-primeiro ·
"T3 100%" morre **MEDIDO** no ledger · suite verde.
**Retoma:** passo 0 de qualquer sessão que encontre `RUNNING` = rebase + reconfirmar que os
vermelhos ainda falham **pelo motivo certo**.
**Fecha com:** `F2.complete.json` ligando eventos `escalated` (com motivo) ao `attempt_id`, ao
repo e ao commit. Eventos soltos, bateria verde solta ou commit solto **não fecham a fase**. *(G4 nº10)*

## F3 — TESTE Nº2 (a régua decide)
**Entrada:** F2 `COMPLETE` · existe `piloto2/PROTOCOLO_v2.md` **completo e congelado pelo
dono** · `GO_N2` contém o **sha256 desse protocolo**. Divergência de sha ⇒ **PARAR**. *(G4 nº7)*
> O ficheiro actual `PROTOCOLO_v2_REGRAS_CONGELADAS.md` são **regras**, não um protocolo
> executável: deixa tarefas, corpus, execuções e juízes por decidir. Correr sobre ele seria
> improvisar depois do `GO_N2`.
**Trabalho:** braço B′ (Mooter+cascata). **R1 IMUTÁVEL: X=40 · N=40** — a régua que chumbou o
B aprova (ou não) o B′. Verificar mecanicamente X, N, regra de amplitudes sobrepostas,
tarefas, corpus, n, juízes e commits de entrada **antes** de correr.
**Saída:** `resultado.md` no path fixado no CONFIG, publicado contra o §0 **seja qual for o
veredicto** + aviso ao dono para o Cowork gerar o DOSSIER-2.

## F4 — §0 DO POKÉ (papel, não runs)
**Entrada:** F3 `COMPLETE` (qualquer veredicto).
**Trabalho:** gerar `_handoff/prereg-poke-template.md` — **fora** de `pokemoo-gestos/`, campos
em branco, termina em **`DRAFT`**. O dono preenche e devolve `PREREG_FREEZE` com o sha.
**O validador de θ0 exige literalmente os campos E1–E6 do brief pinado** *(G4 nº6)*: tetos por
marco **incluindo overshoot máximo** (C5) · n de runs `[proposta: 3; headline sempre intervalo
min–max, nunca ponto único]` · **critério de vitória por métrica** · base contabilística
(preço de lista; T0 marginal **medido** ou `n/d`, nunca "$0" como facto) · régua imutável (R1)
· políticas de inválidos/timeouts/retoma · os **três hashes** nomeados (`rom_sha256` ·
`initial_state_sha256` · `runner_commit_sha`) · **estimativa prévia de passos×custo por braço**.
**Insumo OBRIGATÓRIO:** `ADDENDUM_MOO_RUN_SERIE_2026-08-08.md` (sha `7a3b0ff7…`) — os **dois
formatos pré-registados** (corrida-ao-marco **e** mesmo-orçamento, ambos sempre publicados) e
o carimbo por frame (`game_step_idx` + `record_hash` + QR) entram no §0, não são decorativos.
**Validador rejeita:** campo em branco · placeholder · `[proposta]` não decidida · alteração
posterior ao sha.
**Fecha com:** `F4.complete.json` só depois de `PREREG_FREEZE` bater com o sha do ficheiro
preenchido. Um sha prova bytes, não decisão — daí exigir-se o gesto **e** a palavra do dono.

## F4b — ADAPTERS (C1 e C2), só MOCK
**Existe porque o v1.0 punha isto na F1 e violava o brief que ele próprio declara soberano.** *(G4 nº3)*
**Entrada:** F4 `COMPLETE`. **Antes disso não se toca nos adapters** — o brief trava C1/C2 até
ao §0 e exige C0 antes de qualquer adapter.
**Trabalho:** construir e smocar C1 (braço A: **provider · transporte · modelo exactos**, nunca
"Fable 5" à solta) e C2 (B′ sobre `runDecision()`, nunca sobre `mooter_work`), **só com MOCK**,
sobre o C0. **Zero runs de medição.**
**Em conflito wrapper↔brief, o brief pinado por sha prevalece e a sessão PARA.**

## F5 — M1: O PRIMEIRO SPEEDTEST
**Entrada (todas, sem excepção):** `F1b COMPLETE` (⇒ B4 **e** B6 **e** B5-real) · `E2 judge
verde` · `F4 COMPLETE` (θ0 congelado) · `F4b COMPLETE` · `POKE_GO` contendo o **sha do θ0**. *(G4 nº8)*
**Trabalho:** runs M1 (badge do Brock) braço A vs B′, n conforme §0, **numerados ANTES** de
correr, **TODOS publicados** (incl. abortados) · recibo por lance na cadeia C0 · leaderboard
HTML gerado dos jsonl · âncora externa fica `anchor_status: "pending"` até aprovação
explícita do dono.
**Vídeo — gate, não frase** *(G4 nº12)*: a F5 gera **exclusivamente HUD-only**, sem frames e
sem áudio do jogo. **Qualquer versão persistente com frames pertence a uma fase jurídica
separada**, bloqueada por parecer + autorização humana ligados ao hash do ficheiro. O
exportador público **falha** se detectar assets de jogo. Footage crua: demo privada ao vivo.
**Insumo OBRIGATÓRIO:** o addendum MOO RUN (§F4) — série episódica, dois formatos, vídeo
auditável. Baselines do PokeAgent Challenge: **avaliar aqui**, com licença verificada, nunca antes.

---

## Fecho de TODA sessão

BOARD `[medido]` (pronto / `BLOCKED`: qual gesto / `FAILED`: porquê / quando voltar) ·
`SYNC.md` · journal no vault (G15) · `gauntlet:` grep-ável · push **proposto** com payload
explícito · **nunca** declarar fase fechada sem o `<FASE>.complete.json` no disco.

---
gauntlet: alto-risco · G4 do wrapper = **CORRIDO** (`job-mskch6ok-9cac`, NO-SHIP, 13 achados, 11 ALTO — todos incorporados neste v1.1; prova em `_handoff/maestro-g4/resultado.md`) · verificação cruzada local do G4 **não correu** ⇒ um motor, não dois · G5: zero conteúdo novo — orquestra briefs já confrontados e congelados · G3: a ordem é inviolável por manifesto em disco, não por prosa · G18: fase fechada = `<FASE>.complete.json`, nunca declaração · limitação declarada: autoria de gesto **não** é mecanicamente provável (`autoria: n/d`) · não corridos: nenhum
