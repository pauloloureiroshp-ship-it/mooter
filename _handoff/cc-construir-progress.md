# Progresso — CC Construir & Superar (Mac) · 2026-08-25

Kickoff: `_handoff/KICKOFF-CONSTRUIR-MAC.md` · Plano-mãe: `~/paulo-vault/40-strategy/2026-08-25-plano-construir-superar.md`

MUTEX: `cc-sistema.log` e `cc-inscrever-jetson.log` ambos com `=== fim` → livre para arrancar.

## FASE A

### A0 — PR #396
Estado ao arrancar: `mergeStateStatus=UNSTABLE`, 19 checks **pass**, 2 **fail**:
- `Vercel – frugal` → "Deployment rate limited — retry in 24 hours."
- `Vercel – landing` → idem.

A mensagem do Vercel diz **24 horas**, não "recupera sozinho em minutos". Não é verde ⇒ **não faço merge agora**.
Registado; re-verifico no fecho. Merge é acção irreversível — só com CI verde ou ordem explícita do dono.

### A1 — PR #394
**Já estava merged** às `2026-08-25T19:40:47Z` (branch `mac/fecho-pendencias`). Nada a fazer.

### A2 — rebase do stash-paridade ✅ PR #397
Não foi um `git rebase`: a branch de 24/08 estava a **128 commits** do main, com os mesmos
ficheiros reescritos em **13 079 linhas**. Mediu-se campo a campo o que faltava.

**Já em main (superseded, não reaplicado):** `fleet-remoto.mjs`/`beaconsDoRemoto` + wiring do
`f10-server` + `remotos` no `readBeacons` · `verConector` pasta-vs-registo (aterrou como
`versaoInstalada()`) · `sync-device.mjs` de fonte única.

**Único, refeito:** `BEACON_FRESH_REMOTO_S` (o bug dos "716s" ainda está vivo em main) ·
`medirParidade` + campo `paridade` no beacon + linha de paridade no painel.

**Desvio deliberado:** `medirParidade` NÃO mede o conector — isso já viaja em `conector` com
`verConector` como fonte única; duplicar repunha as duas verdades que essa correcção matou.

Gate: `npm run test:cockpit-runner` → 846 testes, **844 pass, 0 fail**, 2 todo (pré-existentes).
`classify.js` intacto. Branch de 24/08 e stash originais **não** tocadas. PR aberto, **sem merge**.

### A3 — exclusão de T5 em código ✅ PR #398
**Premissa do enunciado corrigida:** o SSOT (`tools/router/pricing.js:66`) **já** precificava o
Fable a $10/$50. O que estava retido era o **snapshot** — e era ele que segurava o invariante.

Medido contra o motor real: **sem** a exclusão, `reasoning.science` → `claude-fable-5` TES 3784
(1 de 24 categorias); **com** a exclusão, 0 de 24. O Fable ganhava essa categoria sozinho por ter
a única célula medida lá dentro (0.946 GPQA Diamond) — faltava-lhe só o preço.

Feito: `OPT_IN_ONLY_MODELS` + `isOptInOnly()` no `decide-agent.ts`, filtro **antes** de
`min_score` e orçamento, exclusão **dupla** (roster nomeado + tier T5), `force_model` intacto.
Snapshot precificado. Entrada de allowlist no `CLAUDE.md` no mesmo PR.
**Arame → teste permanente:** a pergunta muda de "os dados têm de estar incompletos" para
"toda a condição de violação tem de estar coberta pela guarda"; lê o roster da fonte do motor
e devolve `null` (não `[]`) se não a reconhecer. Provado que morde.

Gate: router 302 pass / 3 fail (**as mesmas 3 da baseline em main**) · cockpit 844 testes 0 fail ·
CLI 663 testes 0 fail · `classify.js` intacto. PR aberto, **sem merge**.

### A4 — package-lock do mooter-bridge ✅ PR #399
Os outros 5 pacotes com lockfile já o versionam e este não está no `.gitignore` — só nunca foi
adicionado. 16 linhas, sem `dependencies`: **afirma** o "Zero deps" que o `install.sh` assume.

### A5 — rollup do SYNC ✅ (já feito; faltava o anúncio) — no PR #396
O rolo **já estava feito** na sessão anterior (`ad0deaed`): 604 → 212 linhas, história em
`docs/foundation/SYNC_ARCHIVE_2026.md` (path canónico do `AGENTS.md`, não `_archive/`).
O que faltava era o **anúncio ao PC** — `SYNC.md` é ficheiro partilhado e um PC com a cópia
velha não distingue "o Mac enrolou" de "o Mac apagou 400 linhas". Acrescentado, e a dizer
explicitamente que saiu **depois** do rolo, não antes como o plano pedia.
Coube em **220 linhas exactas**; `docs-hygiene` sem `SYNC_TOO_LONG`.

### A6 — LLMs no talo · três medições, duas refutam o plano
- **A6a ✅ PR #400.** A condição `kimi-egress FECHADA` **foi verificada** e não quer dizer o que
  parece: é o destrave do MODO VIVO do *spike*, não a correcção do ALTO (o commit `94a0d3e8`
  escreve-o). O **veto de egress não está em main**. Reutilizar essa linha seria chamar
  *condicional* a uma aceitação **incondicional**. Kimi readmitido em `MOTORES_PERMITIDOS` atrás
  de `MOTORES_CONDICIONADOS` + linha própria (`gate.LINHA_KIMI`), que ainda não existe.
  **Consequência dita:** hoje continua recusado, mas a uma linha de distância. 290/290 testes.
- **A6b/c/d — a matriz do plano estava errada.** `codex ❌ n/d (não instalado)` era falso:
  codex 0.149.1, gemini 0.57.0 e kimi-code 0.38.0 estão em `~/.local/node/bin`, fora do PATH da
  shell do circuito. Os três protocolos respondem; os três morrem em **autenticação**
  (401 · "set an Auth method" · "No model configured"). Falta **um gesto do dono**
  (`11-LOGINS-LLMS.command`), não uma instalação. Número do gemini no MooterBench: **n/d**.
- **A6d premissa falsa:** o `kimi-adapter.js` **não usa o CLI** — fala a API HTTP da Moonshot.
  Não há schema a divergir.
- SYNC actualizado (219 linhas) + dois blocos ✅ enrolados para o arquivo.

### GATE A
| Verificação | Resultado |
|---|---|
| `tools/router` | 1166 testes, **1165 pass, 0 fail** |
| `npm run test:cockpit-runner` | 896 testes, **894 pass, 0 fail**, 2 todo |
| `packages/cli` | 663 testes, **662 pass, 0 fail** |
| `classify.js` | `427d8c0b…4bc48f` intacto |
| ratchet | **FAIL — só em `stashes: 1 > 0`** |

**O Gate A tem uma premissa falsa e ela bloqueia o rebaseline.** O kickoff dizia *"baseline do
ratchet re-corrido DEPOIS do A2 (agora pode: stashes volta a 0)"*. Não volta: a decisão A2 era
**"NUNCA descartar"**, e a stash foi deliberadamente mantida. `--update-baseline` agora gravaria
`stashes: 1` como novo mínimo — exactamente o que o próprio plano avisava.

Melhorias reais que ficam por gravar: `sync_lines` 606→**219** · `active_packets` 204→**31** ·
`top_level_handoff_files` 312→**152** · `untracked_active_packets` 5→**0** (resolvido nesta fase).

**Desbloqueio (é do dono, não meu):** o conteúdo da stash está agora em **três** sítios —
`stash@{0}`, a branch `mac/stash-paridade-2026-08-24` (no origin) e, refeito, o PR #397. Largar a
stash é seguro em substância, mas é irreversível. Com `git stash drop stash@{0}` seguido de
`node tools/docs-hygiene.js --ratchet --update-baseline`, os quatro números acima ficam gravados.
Não o fiz.

## FASE B — painel UX ✅ PR #401

**3 eram defeitos, 3 eram rótulos a mandar procurar defeitos que não existem, 1 já estava meio feito.**

Mudou a forma de testar: `painel-cartao.test.mjs` **corre o script real do painel** num `vm` com DOM
mínimo e `Date.now` injectado. Prova: contra `main`, **8 de 10 falham**; com a correcção, **14/14**.

| # | Veredicto |
|---|---|
| 1 repaint | **Real** — o rodapé carimbava a hora do *render* (3 em 3 s), não a idade dos *dados* |
| 2 nome vertical | **Real** — `min-width` aterrou hoje às 16:33; faltavam `nowrap`+`ellipsis`+`title` |
| 3 morto/holding | **Real** — `pausa.activa` é uma afirmação sobre o instante do beacon |
| 4 schema win32 | **Falso** — schema idêntico; o PC está mesmo em pausa (`no eligible loop`) |
| 5a StatuslineCard | **Real** — `Partial<>` deixa passar `undefined`; saía em branco, a verde |
| 5b build-snapshot | **Real, mas não é race** — é validar-e-depois-substituir, acima de 2 MB |
| 6 projecto/prefs | Já alinhados; faltava o **durável** — a precedência, que não existia em código |
| 7 contadores | **Falso** — janela de 5000 contra ledger de **5492**; faltava o rótulo dizê-lo |

Efeito colateral necessário: o `vitest` da landing não resolvia `@/`, o que tornava **qualquer**
componente não-testável. Resolvido.

Gate: cockpit 862 testes 0 fail · landing 219 testes 0 fail · `classify.js` intacto.

## FASE C — WS1 keep-rate ✅ desenho publicado e refutado localmente
`~/paulo-vault/_handoff/design-instrumento-v2.md` (273 linhas), **status 🔴 POR REFUTAR** pelo
codex do PC. Não foi escrito código — era essa a instrução.

**A medição inverteu a ordem de trabalhos do F1:**
- `PILLAR_IDS = []` — **os 11 pilares estão `activo:false` em `main`**. O último gesto é de hoje
  (`edf00025`, desligou P2 e P3). Não há instrumento a afinar: está desligado. E os 44 achados
  que geram o keep-rate 4,5% vieram de pilares removidos **por serem maus** — não é um baseline.
- `nextPillar(n, [])` devolve `undefined` **em silêncio**: instrumento desligado é indistinguível
  de instrumento a correr sem achar nada.
- **Defeito vivo que nenhum item do F1 nomeia:** o produtor tira a linha fantasma
  (`context-pack.mjs:1222`, corrigido 21/08) e o verificador **não**
  (`evidence-verifier.mjs:127`). Medido: `checkCitation('run-savings.js', 108)` num ficheiro de
  **107** linhas devolve `ok:true` com snippet vazio — e o painel escreve *"the line exists on
  disk"*. A correcção aterrou no lado que mostra, não no que julga. É a **5ª recidiva** da classe
  "duas contagens, janelas diferentes".
- F1 item 5 (frescura >30 dias) **já existe** (`frescura-de-precos.mjs:109`); o que faltava era o
  preço do Fable — feito no PR #398.

**Refutação local (Ollama qwen2.5-coder:14b, $0, 43 s — declarado: NÃO é o codex).**
1 objecção válida em 3, e **alterou o desenho**: o §4 dizia "sem login, o dono é o 2º juiz" — abre
a porta à auto-aprovação. Corrigido: o gate numérico **não abre** sem um 2º motor autenticado.
As outras duas não contam (uma leu o enunciado ao contrário e argumentou *a favor*; outra era
genérica, sem ficheiro nem linha).

## FASE D — M1 v0 ✅ PR #402
ADR **assinado** (`DECISÃO: B · 2026-08-25 · Paulo`). `packages/m1-proxy/` — directório novo, não
toca em pacote congelado; entrada de uma linha no `AGENTS.md` no mesmo commit.

O v0 é sobretudo o que **recusa**: não ouve na rede (bind `127.0.0.1`, teste falha se `0.0.0.0`
aparecer no código) · não se liga sozinho (`criarProxy()` **recusa-se a construir** sem a flag; e
`'0'`/`'false'` não ligam, por serem truthy em JS) · **não tem degrau de nuvem** (tier que o local
não serve → `501` com o motivo; fail-closed para tier desconhecido) · não reclassifica
(`classify.js` é chamado com `require` tardio) · **não grava o prompt** (há um teste que tenta
contrabandeá-lo e exige que não chegue ao disco). Duas contagens desde o dia 1, sem campo `total`.
14/14 testes. Desenho em `~/paulo-vault/_handoff/design-m1-v0.md`, 🔴 por refutar.

## FECHO

- ✅ Journal: `~/paulo-vault/10-projects/2026-08-25-mac-construir-superar.md`
- ✅ Delta por onda (positivos **e** negativos, só medidos): `40-strategy/2026-08-25-pitch-registro-metricas-medidas.md`
- ✅ Vault commitado com adds selectivos (`e9a8208`); o publicador de beacons empurra-o no próximo ciclo (~10 min)
- ✅ A0 re-verificado: PR #396 continua `UNSTABLE` — 19 verdes, 2 fails de rate-limit do Vercel. **Sem merge.**

### ⛔ Loop NÃO relançado — e a razão é medida, não cautela

O kickoff manda relançar "para o loop carregar o código novo". Medi antes de agir:

| | |
|---|---|
| loop **vivo** | 10 pilares activos (P1–P10), a correr **P2**, `running: true` |
| **checkout** | `PILLAR_IDS = []` — os 11 estão `activo:false` desde `edf00025` (hoje, 16:33) |

**Relançar tem zero upside e uma consequência medida.** Zero upside porque *não há código novo
para carregar*: os seis PRs estão abertos, nenhum mergido. Consequência: o loop recarrega o
checkout, fica com **zero pilares**, e `nextPillar(n, [])` devolve `undefined` **em silêncio** —
o device pára de produzir e nada no painel o diz. É o modo de falha "63 sessões, 0 journals".

**As duas opções, com o que cada uma faz:**
1. **Não relançar** (o que fiz): o Mac continua a produzir achados com **P2**, que o dono já
   declarou mau (`edf00025`: "20 achados decididos pelo dono, 0 valiam"). Gasta GPU a $0 em
   trabalho de valor conhecido = baixo, mas o painel continua honesto.
2. **Relançar** (`_handoff/operar/1-LANCAR-MOO.command`): alinha a máquina com a decisão
   deliberada de main — e o device fica **silenciosamente parado** até o WS1 religar um pilar.

A opção 2 é defensável e pode até ser o que queres. Não a tomei sozinho porque cala o único
device a produzir, sem alarme, e isso é o F1.2 do desenho do WS1 — que ainda está por refutar.
