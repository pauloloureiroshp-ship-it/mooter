# ESTADO ATUAL (2026-08-25)
===== SYNC.md (tail 350) =====

**Sete PRs, todos com CI verde e ramos limpos:**

| PR | Commit | O que trazia |
|---|---|---|
| #351 | `56a57eb1` | o alinhador lia a versão do conector do **registo do instalador**, que fica para trás a cada auto-actualização — passa a usar `versaoInstalada()` |
| #352 | `32007142` | beacons dos outros devices lidos do **remoto** do vault (`fetch`, nunca `pull`): a frescura deixa de esperar 20 min |
| #353 | `25d9ba93` | os 4 `.command` de operação versionados, em `_handoff/operar/`, com os campos mortos curados |
| #354 | `f7ffe16d` | `kid` no envelope da assinatura · `prova_frota` **medida** |
| #355 | `6869f8b6` | o `cd` do #353 ficou por commitar — os scripts estiveram partidos na main |
| #356 | `64ceb6ad` | Fase 1: mover a chave do dono à mão, fora do git |
| #357 | `f560b3cd` | Fase 2: **Ed25519 com registo de públicas** — nenhum segredo viaja |

**Duas afirmações falsas mortas.** `prova_frota: true` significava só "o ficheiro
da chave está debaixo do vault" — mas a `.owner.key` cai no `*.key` do
`.gitignore` do vault e **nunca viajou**: cada device gerou a sua. E o HMAC dava
`adulterado` tanto para chave errada como para conteúdo mexido, acusando de forja
um beacon que ninguém tocara. O `kid` separa as duas causas; o `ancora`
(`registo` · `chave-partilhada` · `chave-local`) diz o que cada verificação prova.

**O que destapou a chave:** ligar `frota.rejeitados` no `4-VERIFICAR-FROTA`. Um
beacon descartado em silêncio era indistinguível de um device que nunca existiu.

<!-- frota Ed25519 — metade feita, metade bloqueada em CODIGO, nao em gesto -->
### ⏳ Migrar a frota para Ed25519 — **1 de 2 devices** (2026-08-24)

**Feito · `mac-mini-de-paulo`.** Inscrito no `50-fleet/trusted-devices.json`
(vault `f981831`, empurrado) e a assinar `Ed25519-v1`, kid `bb8ed09958167518`.
No painel: `ancora: registo`. A privada vive em `~/.mooter/device-ed25519.key`
e nunca saiu da máquina — o vault só carrega a pública, que por isso se
versiona (a `.owner.key` continua no `*.key` do `.gitignore`, e é essa a
diferença que esta fase compra).

**Bloqueado · `desktop-j26409q`.** Não é um gesto que falte: é **código que
aquela máquina não tem**. Mede-se no beacon dela — `sha_carregado 15280a66`,
anterior ao #354, `sig.alg HMAC-SHA256-v1` e **sem `kid`**. Não há
`frota:chave` para correr lá antes de um `git pull`.

Ordem para fechar, **no PC**: `git pull` → reiniciar o cockpit →
`npm run frota:chave -- --inscrever`, que imprime a pública (não é segredo,
viaja por onde se quiser) → na máquina do vault
`--inscrever-device desktop-j26409q <pub>` → **rever o `git diff` do
`trusted-devices.json` e commitar** → reiniciar. A inscrição não é commitada
pelo comando de propósito: a lista de quem a frota acredita revê-se num
`git diff`, e um comando que commitasse deixaria qualquer processo com escrita
no vault inscrever-se a si próprio.

**`prova_frota` continua `false`, e está certo:** *"só um device verifica: uma
máquina sozinha não prova frota"*. Antes de hoje o painel dizia `true` nesta
mesma situação. O `true` honesto só chega com o segundo device inscrito.

Efeito colateral aceite: o painel do PC, em código antigo, passa a ver o beacon
do Mac como `alg-desconhecido` em vez de `adulterado`. Já o rejeitava — as
chaves HMAC das duas máquinas nunca foram a mesma. Muda a mensagem, não o
resultado.

<!-- suite do router — observação, não conclusão -->
### 🔍 A suite `tools/router` não conta sempre o mesmo (visto 2026-08-24)
944, 962, 969 e 983 testes em corridas diferentes, incluindo em `main` intocada.
`fail` foi sempre 0. Não investigado — mas uma suite que não conta sempre o mesmo
pode estar a saltar testes em silêncio.

**O gargalo continua onde estava:** 1054 achados por triar, loop em pausa por
`human queue full (524/6)`. Nada dos sete PRs lhe tocou — foi tudo encanamento,
ainda que encanamento que estava a mentir.

---

## 🏁 Sprints

| Sprint | Nome | Estado |
|--------|------|--------|
| v0.9.9 | INFRA.md + deploy | ✅ Shipped (2026-04-13) |
| Rebrand | frugal → Mooter | ✅ Shipped (2026-04-14) |
| Sprint B | METHODOLOGY + Shadow + Closed Loop | ✅ Shipped (2026-04-16) |
| Review #1 | Context-aware overrides + 48 TUNED | ✅ Shipped (2026-04-16, #22) |
| MacBook bootstrap | 3 Cowork sessions — install + 3 bugs fixed | ✅ Shipped (2026-04-16) |
| Sprint C | Statusline redesign + Multi-Model V2 | ⏳ Pendente |
| Full Rebrand | frugal → mooter em toda a app shell (dashboard, onboarding, setup, admin, settings, OG, APIs) | ✅ Shipped (2026-04-17, #24) |
| OAuth verification | Env vars OK, OAuth 302 OK, waitlist RLS fix, mooter.ai domain verified | ✅ Shipped (2026-04-17, #24) |
| v1.0 | Public OSS launch | 🔵 Roadmap |

## 📊 Stats actuais
| Métrica | Valor |
|---------|-------|
| Overall accuracy | 88.3% (GATE PASS) |
| Tests passing | 89/89 |
| Gold labels | 84+ |
| Patterns | 114+ (48 TUNED_PROMOTE_T0 + 7 ARCH_SIGNALS novos) |
| Mac savings-tracker | saved 69.2% ($0.24 over 4 prompts) |
| Hub global | 1 user, 1 prompt (Mac), 1 hw (apple-silicon), 1 sub (max) |

## 🧱 Stack técnica
| Camada | Tecnologia |
|--------|------------|
| Classifier | `classify.js` v0.10+ (regex, ~47KB, 11-pass + ARCH_SIGNALS guard) |
| Arbiter | Haiku 4.5 via Anthropic SDK |
| Hooks | UserPromptSubmit + PostToolUse + Stop |
| T0 Local | Ollama brew service (qwen2.5:3b/14b, gemma4:e4b, nomic-embed-text) |
| T1-T3 | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.6 |
| Telemetry | savings-tracker :7821 + hub Cloudflare + D1 |
| Landing | `mooter.ai` (public waitlist) + `landing-five-azure-16.vercel.app` (Friends Beta) |

## 🔗 Links

| Recurso | URL |
|---------|-----|
| Notion HQ | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| 🐮 Wave 2.5 CLOSURE — v0.2.1-polish (2026-05-31) | https://www.notion.so/3716f6e42bc4813aaa58e6ffeb5bb241 |
| 🐮 Sessão 2026-05-30 — Wave 2.5 Day 1 | https://www.notion.so/3706f6e42bc481f8bca3d34d778dda34 |
| 🐑 Pastor Day 1 — Schema + ADR (2026-05-28) | https://www.notion.so/36d6f6e42bc4815eab62c8d38247fc42 |
| 🐑 Pastor Day 4 — hook emite <pack-hint> (2026-05-27) | https://www.notion.so/36d6f6e42bc48110bf0deedfa4cb81a3 |
| 🐑 Pastor Day 5 — CLI mooter pack (2026-05-27) | https://www.notion.so/36d6f6e42bc481458f08f79e3ad25ecd |
| 🐑 Pastor Day 6 — pack_resolve + 5 cenários + registry 27 (2026-05-27) | https://www.notion.so/36d6f6e42bc481778293ea3c9b5dde30 |
| 🟢 Wave 1 — SHIPPED (2026-05-27) — validation 20/20 + repo público | https://www.notion.so/36d6f6e42bc481eda50be369a5bbbdd8 |
| Notion Sessão #4 — Mirror Win→Mac | https://www.notion.so/3446f6e42bc4818d8b40f023b3ed758f |
| MacBook Install Playbook | https://www.notion.so/3446f6e42bc48156a7a7fab59fa87ac5 |
| Sessão 2026-04-16 — Review #1 + Multi-device | https://www.notion.so/3446f6e42bc4819eb313fa21cf15765d |
| Sessão 2026-04-17 — Review #2 + Classifier Detox | https://www.notion.so/3456f6e42bc4812e81e3dac67cb73b3f |
| Sessão 2026-04-17 — Landing Redesign + Reviews | https://www.notion.so/3456f6e42bc481d3b8fccacf8ed8a56b |
| Sessão 2026-04-17 — Post-crash Recovery + Router Deep Fixes (#25) | https://www.notion.so/3456f6e42bc4810099aae0b5d1ede30e |
| Sessão 2026-04-17 — Cowork Ship (#25-continued) | https://www.notion.so/3456f6e42bc481f991f0c9538438417e |
| Sessão 2026-04-18 — Review #11 + Counters data layer (#27) | https://www.notion.so/3466f6e42bc481c99569cb216e748c5f |
| Sessão 2026-04-18 — Mooter Review #16 (classifier limpo) | https://www.notion.so/3476f6e42bc4810b9ad6e7c605acccad |
| Sessão 2026-04-19 — /doctor fix (MCP Windows + HOME env) | https://www.notion.so/3476f6e42bc481a1a3ffc682d7fcdc1f |
| Sessão #35 2026-04-21 — H2 hygiene + bidirectional drift | https://www.notion.so/3496f6e42bc4814286b1d4d41c1a658e |
| Sessão 2026-05-05 — Codex Integration v0.11 (advisory layer) | https://www.notion.so/3586f6e42bc48177894dd04aec7a0e16 |
| Sessão #37 2026-05-05 — Site coherence + install alignment + statusline mode trio | https://www.notion.so/3576f6e42bc481fab148fa6a26db00de |
| Sessão #39 2026-05-07 — Wave-2 readiness (5 patches → 87.5% accuracy) | https://www.notion.so/3596f6e42bc4818caaf2e3b18dd7a581 |
| Sessão #40 2026-05-07 — Wave-2 router-execute LANDED + Validation Master Prompt | https://www.notion.so/3596f6e42bc4812e824cf48bf8b9321d |
| Sessão #40-validation 2026-05-07 — Wave-2 Independent Audit (APPROVED_WITH_NOTES) | https://www.notion.so/3596f6e42bc481b9a9e4c80086087885 |
| Sessão 2026-05-24 — Matriz de modelos 2026 + camada de dados do router | https://www.notion.so/36a6f6e42bc481a886d1d48a412ca1d7 |
| GitHub repo (PÚBLICO desde 2026-05-27) | https://github.com/pauloloureiroshp-ship-it/mooter |
| Landing público | https://mooter.ai |
| Friends Beta (private) | https://landing-five-azure-16.vercel.app |
| Hub Cloudflare | https://mooter-hub.frugal-hub.workers.dev/api/stats |
| npm | https://www.npmjs.com/package/@mooter/cli |

---

*Cowork Mac working surface: `~/Documents/Claude/Projects/Mooter.ai (macOS)/` com logs, dumps, mapa operacional HTML, e este SYNC.md.*

---

kimi-egress FECHADA — slack-spike destravado

### 2026-08-24 · a FASE 0 parou o gate L0: os "320 dismiss do dono" não existem — PR #361

**PR [#361](https://github.com/pauloloureiroshp-ship-it/mooter/pull/361) ABERTO**
(`gate-l0/f0-scout`, 2 commits, doc-only) · baseline `triagem · autopilot ·
classes-da-fila · voidar-fila` **75/75** · `classify.js` intacto (`427d8c0b…`).

O masterprompt `MP_GATE_L0_DISMISS_BY_CLASS_2026-08-24.md` (workflow adversarial
Fable 5, 7 agentes) manda confirmar seis factos antes de escrever código e **parar
se algum falhar**. Dois falharam.

| | |
|---|---|
| **ADENDA G11** | resolvida a favor de **REAPROVEITAR** — o motivo já está em `triagem.mjs:61` e os dois módulos existem tracked com testes. O "+1 linha em MOTIVOS" era **NO-OP**, como ela previa. Não há dois checkouts divergentes. |
| **FACTO 4 ❌** | os *"320 dismiss por:'dono'"* **não existem**. 1448 linhas, **todas `por:'claude'`**, escritas por 3 scripts. `classesSuprimiveis()` exige ≥20 descartes do dono por assinatura ⇒ conjunto **vazio** ⇒ o `FP=0` da FASE 1 passaria **por vacuidade**. |
| **FACTO 3 ❌** | `portoes()` subtrai `agente` e **só** `agente` (`autopilot.mjs:185`). As 1448 `claude` contam ⇒ **triados 1448 · precisão 0.0%**. O L2 já está envenenado — por quem o MP não supunha. |

E o nicho declarado (`med && motivo:null && !público`) não tem massa: **0 na fila
viva, 8 de sempre** (P5 4 · P11 4, ambos desligados), **0 vindos de pilar activo**.
Os activos são só P2 e P3 → 466 achados únicos, **100% `low` com motivo**, que o
`curar()` existente já fecha. `autopilot.json: nivel 0` — o L1 **nunca correu aqui**.

**O adversário mordeu** (`codex` só-leitura + `kimi-k3`, ambos mandados refutar):

- **refutou a minha A3** — `porTriar` sem limite devolve **232 entradas para 219
  chaves** (`triagem.mjs:173` não tem o `vistos` Set que o `contarTriagem` tem em
  `:197`), e `curar()` fecha **25** por chamada, não 232. Eu tinha citado a minha
  contagem deduplicada como se fosse output de `porTriar`.
- corrigiu-me o tempo verbal: *"nunca terá matéria-prima"* é **projecção ⇒ `n/d`**.
- deixou um `n/d` aberto: `LOCAL_AGENT_SYNC=fail`, o mac-mini pode ter decisões do
  dono. Não salva o desenho — `classesSuprimiveis` lê o ledger **local** e o MP não
  propõe junção entre devices.

**Latente, apanhado de caminho:** `registarTriagem` tem `por = 'dono'` por omissão
(`:127`) e `contarTriagem` faz `d.por || 'dono'` (`:209`) — **assinatura em falta
conta como o dono**. Os 5 chamadores passam `por`, mas isto condena qualquer
correcção escrita como lista negra.

**A ordem que a medição impõe** (nenhuma executada — a FASE 0 pára aqui): 1) corrigir
o denominador do L2 por **lista branca** + proveniência por **canal de escrita** +
"sem dados" quando o denominador é zero; 2) ligar o L1 **com auditoria ao dreno**
(senão troca-se um número falso por cegueira); 3) só então nasce o ground-truth do
dono. **O gate é a fase 3 desta ordem, não a fase 1.**

gate: 75/75 · fases 1-3 **não avançam** — o gate numérico da 0 não está verde

### 2026-08-25 · gate L0: a ordem invertida em `main`, 4 rondas adversariais e 35 defeitos — #362 #363 #364 #365 #366

**`main` @ `882c042f`.** O dono aprovou a ordem que a FASE 0 mediu (denominador →
L1 com auditoria → só então o gate) e mandou executar. **O gate L0 do
masterprompt continua por construir** — a FASE 0 explica porquê: sem decisões
dele, não tem entrada.

| Fase | O que entrou | Gate final |
|---|---|---|
| **F1** `#362` | denominador do L2 por **lista branca** (`do_dono`, só `por==='dono'` explícito); `no data yet` em vez de `0%`; `registarTriagem` perde o default `por='dono'`; campo `via` | triados **1448 → 0** |
| **F2** `#363`+`#365` | amostra de auditoria (que é a torneira do L2) · alarme de dreno por mediana com direcção · `porTriar` deduplica · guard "nenhum agente sobrepõe o dono" · `registarVarias` | fila 138 · reservados **20** · L1 drena 85,5% · churn **1** |
| **F3** `#364`+`#365` | `prontidao-l2.mjs` — proveniência derivada na leitura, `precisao: null` nunca 0, recusa-se a dar data | 1667 únicos · dono **0** · varredura 1123 · filtro-mecânico 325 |
| **Remediação** `#366` | os 2 HIGH da 4.ª ronda que faziam o painel mentir | 760 pass / 0 fail |

**Quatro rondas adversariais em motor diferente (`codex`, só-leitura), 35 defeitos.**
34 confirmados por medição minha, **1 refutado** (a escada era aninhada nos
divisores de 20 — a matemática dele estava certa em geral, errada neste caso).

O padrão que a série revelou: **em cada ronda, os defeitos vieram das correcções
da ronda anterior.** Três exemplos que valem mais do que a contagem:

- **"aritmética, não previsão"** era mentira minha. Apanhado, mudei o *rótulo* e
  deixei a *fórmula* — dizia 300 quando bastavam 15. Renomear não corrige nada.
- **A escada** que eu criei para corrigir um churn de 1 produzia um churn de 41.
  Troquei uma instabilidade pequena por um precipício e chamei-lhe correcção.
- **Escrevi 18 testes sobre honestidade que o CI nunca correu.** Defendi-os três
  rondas. Nenhuma verificação local o apanhava — só olhar para o `package.json`.

**O acidente de merge, registado porque quase custou metade do trabalho.** Os
#363/#364 estavam empilhados (`base` = branch anterior). Fiz merge do #362
**primeiro** e os outros resolveram-se **para dentro da pilha**: o GitHub
marcou-os `MERGED` e a `main` não tinha `prontidao-l2.mjs` nem metade das
funções. Só apanhei porque **verifiquei o conteúdo em vez de acreditar no estado
dos PRs**. O #365 corrigiu-o. *Lição: `MERGED` não é o mesmo que "está na main".*

**Os 2 HIGH da remediação — a única categoria bloqueante deste projecto:**

- `degrau_da_reserva` **era ficção**: a escada saíra na 3.ª ronda e o helper que
  a explicava ficou. O painel publicava "1-em-5" enquanto 8 reservadas estavam
  fora desse degrau e 39 do degrau fora da reserva.
- **O spoof do dono não estava fechado e eu dei a entender que estava.**
  `/triagem` faz `body.por || 'dono'`; fechei só o caso sem `Origin` **e** sem
  `por`. Não se fecha sem credencial no canal — e uma credencial que o painel
  serve lê-se com um `GET`. **Passa a contar-se:** `dono_via_painel` /
  `dono_sem_painel`. Contar o que não se consegue impedir é mais honesto do que
  fingir que se impediu.

**Fica por fazer, declarado no #366:** os três scripts de varredura param na
primeira colisão (`registarVarias` só ligado ao tique) · o tique desalinha o
`pilar` quando há recusadas · a fracção do dia não chega à detecção por pilar ·
actos futuros no mesmo dia passam · o ledger aceita `{}` como recibo. Nenhum faz
o painel mentir; nenhum dispara nos dados de hoje.

gate: 760 pass / 0 fail (`npm run test:cockpit-runner`) · classify.js `427d8c0b` intacto

### 2026-08-25 (2) · o L1 está LIGADO — e a ligação destapou um impasse de janela

**`main` @ `aa3d4ca5` · L1 `nivel: 1` · 118 achados fechados em ~4 min.**

O dono mandou ligar o L1. **Parei antes de ligar**, e ainda bem: o `f10-server`
vivo corria o **código antigo** (`import` carrega uma vez em memória; tinha sido
lançado antes dos merges). Ainda dizia, no ar:

```
portao 2 · 531 triaged · "0% kept" · "you keep 0% of what it finds"
```

Se o L1 tivesse sido ligado assim, corria o `curar()` antigo: drenava os 138 da
janela **sem reservar** os 20 e recriava o estado absorvente que quatro rondas
mataram. O espelho do cockpit também estava desactualizado (`SELF-CHECK FALHOU`,
`triagem.mjs` e `prontidao-l2.mjs` em falta).

Sequência: `sync:cockpit` (38/38, OK) → reiniciar `f10-server` → **verificar que
o código novo está no ar** → ensaio → só então ligar. E o `moo-runner` também
corria código velho: `sha_carregado 071cf58d`, de antes dos merges. Reiniciado
(`aa3d4ca5`), lock órfão reclamado sozinho.

**Resultado medido:** 118 fechados (`por:'agente'`, `via:'autopilot-l1'`,
25/tique), **20 reservados** (5 amostra + 15 para o portão 2), guardrails 0
não-`low` e 0 públicos. A mentira saiu do ar: `no data yet — the 649 not signed
by you never count`.

**O IMPASSE, que só aparece com o L1 ligado.** Duas contagens da mesma fila:

| quem | janela | fila |
|---|---|---|
| L1 e painel | `readLedger` default (5000 linhas) | **20** |
| runner (pausa) | ledger **inteiro** (9996) | **101** |

O runner pausa acima de 50, portanto fica pausado **para sempre**: o L1 já fechou
tudo o que a janela dele mostra e não consegue ver os 81 que estão fora dela.
`219 − 118 = 101` — a aritmética fecha exactamente.

Não é uma espera, é um deadlock. E é a MESMA classe de defeito que o adversário
apanhou três vezes hoje: **duas contagens do mesmo número, com janelas
diferentes**.

**CORRIGIDO em `#369`, `main` @ `b24d8359`.** A causa: `decidirRonda` lia o
ledger com o seu próprio `readFileSync`, **sem janela nenhuma**, enquanto o
`readLedger` — painel e tique do L1 — usa `maxLines = 5000`. Passa a ler pela
mesma porta: **101 → 20**, as três contagens dão o mesmo, e o runner despausou
(`pilar: P3`, `sha_carregado b24d8359b16e`).

A janela nunca foi acidente: o `CAUDA_AO_RODAR`, **no mesmo ficheiro**, já dizia
*"tem de ser a MESMA janela que o `readLedger` usa"*. A rotação estava alinhada
com ela; esta leitura é que passava ao lado da porta.

**Tratado como CLASSE, não instância.** Nas outras duas vezes de hoje corrigi a
instância e a classe sobreviveu. O teste novo usa **6000** achados de propósito
— com 5000 as duas leituras davam o mesmo número e não provava nada.

E a lição operacional repetiu-se pela terceira vez: a correcção estava em `main`
e o runner corria `aa3d4ca5`. **O `sha_carregado` dizia-o.** Só reiniciar carrega
código novo — `import` lê o ficheiro uma vez.

gate: 761 pass / 0 fail · classify.js `427d8c0b` intacto · backup do autopilot em `~/.mooter/autopilot.json.antes-l1`

### 2026-08-25 (3) · o loop voltou a produzir, esgotou-se, e a fila é 22 — 20 à espera do dono

Depois de `#369` desfazer o impasse, medido no ledger real:

```
desde o reinício (05:51Z → 09:29Z)
  531 rondas · 49 achados únicos  (9,2%)
  por pilar : P3 443 · P2 87
  verdicts  : citacao-ok 316 · sem-achado 211 · refutado 1
```

Depois **parou de escrever**, e a última linha diz porquê: `nada-por-rever`,
`nada-por-rever`, `pilar:esgotado`. O runner continua **vivo** (estado fresco,
sem pausa, `pilar: P3`) — percorreu tudo o que a base de diff dele mostra e
chegou ao fim. **Esgotado não é partido**, e a distinção importa.

**A fila do dono, agora:**

```
por triar              : 22   (20 low/trivial + 2 med/null)
reservados para ele    : 20   (6 amostra 1-em-20 + 14 para o portão 2)
o L1 ainda fecharia    : 0    — chegou ao fim do trabalho dele
decisões do dono       : 0 de 20
por pilar              : P2 14 · P3 8
```

**O padrão do que sobra é o dado que interessa.** Quase todos são a mesma forma:
*"esta variável é inicializada a 0/[] em duas linhas"* e *"este comentário tem um
número"*. Dois deles citam comentários escritos **hoje**, nesta sessão, no
`triagem.mjs` e no `autopilot.mjs`.

É exactamente a pergunta que o gate L0 nunca conseguiria responder: **os P2/P3
encontram problemas, ou descrevem código?** Decidir estes 20 responde-a — e mede
a precisão do dono pela primeira vez. Se ele mantiver poucos, a resposta é a
mesma que os outros sete pilares já deram este mês.

**Ponto cego novo, registado e não corrigido:** o `pilar:esgotado` é um evento no
ledger que ninguém vigia. O `anomaliaDeDreno` construído hoje detecta quedas de
*dreno*, não de *produção* — um pilar mudo por estar esgotado e um mudo por estar
partido são hoje indistinguíveis para quem olha para o painel.

gate: 761 pass / 0 fail · `main` @ `b50b4f68` · classify.js `427d8c0b` intacto
===== decisões recentes =====
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-24-parar-de-publicar-poupanca-ate-haver-tokens-medidos.md
# 2026-08-24 · Decisão: parar de publicar poupança até haver tokens medidos

**Estado:** aplicada e publicada na `v1.49.4` (PRs #346, #350).

---

## A decisão

**O Mooter deixa de publicar qualquer percentagem ou valor em dólares de
poupança**, em todas as superfícies: landing, README, plugin, CLI, hub e
statusline.

Passa a publicar apenas o que é medido:

> Em 123 prompts classificados, o classificador encaminhou 101 (82,1%) para tier
> local ou barato. Nas mesmas sessões, das 3.225 execuções registadas, 3.193
> correram em Opus e 1 correu localmente.

A **distância entre recomendação e execução fica visível de propósito**.

---

## Porquê

Uma auditoria encontrou **seis números de poupança em circulação**, todos a
contradizerem-se: `0%` · `49,9%` · `62,7%` · `83,2%` · `89,9%` · `81,2%`.
Nenhum sobreviveu ao exame.

A causa não é um bug — é estrutural: **nenhum ficheiro de telemetria deste
projecto regista tokens.** Zero de 4.534 linhas. Sem tokens não há custo medido;
sem custo medido não há poupança medida, em unidade nenhuma. Todo o valor em
dólares que o sistema mostrava era **modelado a partir do comprimento do prompt**.

O `README.md` chegou a ter dois valores que eram leituras **opostas** do mesmo
par (um *custo* de 65–82% é uma *poupança* de 18–35%), ambos na primeira dobra
de um repositório público.

---

## O que isto custa, e porque se aceita

**Custa a tese comercial.** Um produto que mede um fosso mas não o fecha é um
relatório, não uma ferramenta. A alegação "encaminha cada prompt para o modelo
mais barato que o consegue fazer" deixa de ter número que a sustente.

**Aceita-se porque a alternativa é pior.** Publicar um número que não se sustenta
é exactamente o defeito que fez desligar 9 de 10 pilares do Moo Pilot esta
semana. Não se pode aplicar essa régua ao produto e isentar o marketing dele.

---

## O que se ganha, e é o diferencial real

A literatura de routing de 2026 (RouterArena, LLMRouterBench, OrcaRouter) avalia
sempre routers **vinculativos** — o router escolhe, o modelo escolhido responde
por construção. **Nenhum mede a taxa a que um conselho é obedecido.**

O Mooter mediu-a: **0,23%** (3.026 subagentes locais/baratos recomendados, 7
executados). E mediu porquê — um hook do Claude Code tem dois verbos, injectar
contexto e vetar uma tool call, e nenhum deles escolhe modelo.
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-25-o-portao-de-existencia-medir-a-classe-antes-de-escrever-o-pilar.md
# 2026-08-25 · O portão de existência: medir a classe antes de escrever o pilar

> A pergunta era *"cria o pilar novo"*. A resposta foi **não há classe**, e o que
> ficou construído foi o instrumento que decide isso em dez minutos e a $0.

`main` @ `00e9feed` · PRs [#377](https://github.com/pauloloureiroshp-ship-it/mooter/pull/377) e [#378](https://github.com/pauloloureiroshp-ship-it/mooter/pull/378)

## A ordem estava errada, e é essa a lição

Os onze pilares foram escritos assim: **enunciado → ensaio semeado → meses de
rotação → alguém lê o que saiu**. A pergunta *"a classe de defeito que isto
procura existe mesmo neste repo?"* nunca foi feita antes. Onze pilares, onze
desligados por medição.

A ordem certa são três portões:

| portão | pergunta | custo |
|---|---|---|
| **0 · existência** | a classe **existe** aqui? | ~10 min, sem GPU, **$0** |
| 1 · ensaio semeado | o detector **detecta**? | uma corrida local |
| 2 · campo | o que sai **vale ser lido**? | um dia + 50 achados triados |

O P11 saltou o 0, passou o 1, e custou 87 achados num dia — 76 falhavam o
próprio enunciado. **O único que o teria evitado é o mais barato dos três.**

## Os dois limiares, e porque nenhum chega sozinho

> **≥ 10 defeitos reais** *e* **≥ 30% dos candidatos marcados serem reais**

- **só a precisão** → o `|| 0` em código de dinheiro deu 2 reais em 39.
  Baixando a fasquia passava, e daria um pilar mudo.
- **só o volume** → o P11 deu 87 achados e 1 útil. Passava a qualquer contagem.

Cada um dos onze morreu por um lado diferente. Estão `Object.freeze` — mudá-los
depois de ver os números é batota.

## Três coisas que aprendi a desconfiar

**1 · Um instrumento pode aprovar o silêncio.** O arnês graduava `funciona` uma
resposta que dizia, literalmente, `NO FINDING` seguido de `PROOF: …:36` — porque
o enunciado exige citação sempre e o número calhava aparecer. A variável que o
impedia **já existia**; estava consultada tarde de mais. Com isto corrigido, dos
dez pares passa **um** — e esse está desligado por 0% de precisão em campo.

**2 · Testei o prompt errado, e a correcção mudou a decisão.** Um adversário
disse que a saída barata vive no `SYSTEM_PROMPT`. Medi — e emparelhei o `ask`
com um prompt de sistema que **nunca co-ocorre com ele** em produção. Refeito com
a linha de base certa: 8 · 10 · 8 · 7 em 30. Ruído. **Não mexi no prompt.**
Se não tivesse verificado, teria mudado o motor com base num artefacto do meu
próprio ensaio — que é exactamente como nasceram os onze.

**3 · A variável era outra, e tem N grande.** 7 760 rondas reais do ledger:
enunciados com saída genérica (`NO FINDING`) → **0,1%** de achados; com saída
conclusiva (`THEY MATCH`, `SHAPE IS UNIQUE`) → **35,4%**. O modelo toma a saída
que o **enunciado** escreve, não a que o sistema oferece.

## O portão corrido a sério

Contra a classe do P2, no repo real: 236 ficheiros, 504 candidatos, amostra de 40
espalhada por 25 ficheiros. `const out = []`, `let failed = 0`, `const warnings = []`.
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-25-veredicto-p2-p3-20-achados-0-valiam.md
# Veredicto P2/P3: 20 achados, 0 valiam (2026-08-25)

## Decisão

**O dono decidiu os 20 achados reservados: todos descartados**, motivo
`nao-e-um-problema`. Razão registada em cada linha: *são a mesma forma repetida
— variável inicializada a zero, comentário que "diverge" — e não afirmam nada
sobre o código.*

```
decisoes do dono        20 de 20   ✓
mantidas por ele       0.0% de 70%
portao 2               fechado — "you keep 0% of what it finds"
```

## Porque é que isto importa mais do que o número

**A mesma frase que de manhã era mentira, agora é verdade.** Às ~05:00 o painel
dizia ao dono *"you keep 0% of what it finds"* — medindo **531 decisões de
scripts** que não eram dele. Foi esse o defeito que a sessão inteira corrigiu.
Agora diz exactamente o mesmo, sobre **20 decisões que são dele**. O portão está
fechado pela razão certa, medida sobre o juízo dele.

Este é o par que interessa guardar: *o mesmo output, uma vez falso e uma vez
verdadeiro.* A diferença não está no número — está em quem o produziu.

## O que os 20 eram

- **11 do P2**, todos a mesma forma: *"esta variável é inicializada a `0`/`[]`/`''`"*.
  Um deles sobre o `tools/router/classify.js` — que é **FROZEN**, sha CI-enforced,
  e está a fazer exactamente o que deve.
- **8 do P3**, *"o comentário diverge do código"* — **três citando comentários
  escritos na própria sessão** (a documentar as correcções do dia), e **dois
  citando como evidência a linha `*/`**, o fecho do bloco de comentário. Não é o
  comentário a divergir: é o instrumento a citar a linha errada.

## Consequência

**É a mesma resposta que os outros sete pilares deram este mês** antes de serem
desligados ([[2026-08-21-2026-08-21-p6-desligado-cinco-pilares-fora-o-loop-fecha-em-5]],
[[2026-08-21-2026-08-21-p8-p9-e-p10-desligados-o-loop-passa-de-10-pilares]]).

O **portão 1 continua aberto** — as citações resolvem, 0,2% de invenção. Mas
**resolver uma citação nunca foi o mesmo que encontrar um problema**, e é
exactamente essa distinção que o gate L0 do masterprompt nunca conseguiria
produzir: ele suprimia por classe, não media valor.

## Honestidade do registo

- `0 vieram do painel · 20 NÃO (sem via:'painel')`. Foi o agente a escrever a
  decisão do dono, e o relatório di-lo em voz alta — é o sinal construído no
  mesmo dia para o spoof que não se consegue fechar sem credencial no canal.
  Backup: `~/.mooter/triagem.jsonl.antes-decisao-dono`.
- **O alarme de dreno disparou pela primeira vez a sério:** `P2 81→9 (caiu)`. O
  agregado não dispararia; a detecção **por pilar** sim — a que o adversário
  obrigou a acrescentar na 3.ª ronda, a funcionar em dados reais no dia em que
  foi escrita.

## Próximo gesto (Paulo)

===== journals recentes =====
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/10-projects/2026-08-24-mp-gate-l0-e-reconciliacao-g11.md
# MP gate-L0 dismiss-by-class entregue + reconciliação G11 (2026-08-24, Cowork PC)

- Workflow Fable 5 (wf_2d5f400e, 7 agentes, ~570k tokens): 3 abordagens independentes → júri → fusão. MP final gravado em `frugal/_handoff/MP_GATE_L0_DISMISS_BY_CLASS_2026-08-24.md` (18.613 B).
- Desenho: coador-por-assinatura + escopo-por-caminho + calibração offline FP=0 obrigatório · 4 fases = 4 PRs com gate numérico · guardrails (nunca suprimir assinatura com aceite do dono; nunca público/high; append-only reversível; fonte de verdade única recomputada; zero-LLM; cap 25/tique; dry-run default) · validação 3-vias (concordância + fila-só-sinal + adversário em motor diferente).
- Nicho honesto: MED não-público (claim && !publico, motivo:null) — curar() JÁ drena low+tooling. O gate NÃO abre o L2 (20 triados dono ≥70% continua dependendo dos pilares).
- **G11 (conflito de factos) RESOLVIDO por medição no PC**: agentes do workflow alegaram classes-da-fila.mjs/voidar-fila.mjs inexistentes e MOTIVOS sem 'instrumento-nao-discrimina'. Medido em main@071cf58d: `git ls-files` mostra ambos TRACKED com testes; triagem.mjs:61 TEM o motivo. Os agentes leram visão divergente. ADENDA G11 no topo do MP corrige factos 5/6 e muda FASE 1 de "constrói" para "audita e estende só o que faltar"; se o checkout do CC divergir da adenda → parar e reportar (problema de sync antes de gate).
- Próximo gesto (Paulo): colar o MP numa sessão fresca do CC no repo frugal.

## Execução no CC (2026-08-24, PC · branch `gate-l0/f0-scout` · PR #361)

- **FASE 0 = PARA.** O MP manda parar se qualquer dos 6 factos falhar. **Dois falharam**, e a consequência não é cosmética: o gate construído à letra suprimiria **0 achados**.
- **ADENDA G11 confirmada** contra o checkout: motivo em `triagem.mjs:61`, os dois módulos tracked com testes ⇒ caminho **REAPROVEITAR**, sem divergência de checkout. O "+1 linha em MOTIVOS" era mesmo **NO-OP**.
- **FACTO 4 refutado:** os *"320 dismiss por:'dono'"* **não existem**. `~/.mooter/triagem.jsonl` = 1448 linhas, **todas `por:'claude'`**, todas `descartado`, escritas por 3 scripts (`voidar-fila` 1123 + `fora-do-enunciado`/`refutado-pela-fonte` 325). Zero dono, zero agente, zero aceite, zero issue. `classesSuprimiveis()` exige ≥20 descartes do dono por assinatura ⇒ conjunto **vazio** ⇒ o gate `FP=0` da FASE 1 passaria **por vacuidade** (verde por não haver nada para testar — o pior modo de falha num portão de segurança).
- **FACTO 3 refutado na consequência:** `portoes()` (`autopilot.mjs:185`) subtrai `agente` e **só** `agente`; as 1448 `claude` contam ⇒ **triados 1448 · precisão 0.0%**. A premissa "fechos automáticos nunca poluem o L2" é **falsa em produção** — o L2 já está envenenado, por `claude`. Defeito real e presente que o MP não trata.
- **O nicho não tem massa:** `med && motivo:null && !público` = **0 na fila viva**, **8 em toda a vida** (P5 4 · P11 4, **ambos desligados**), **0 vindos de pilar activo**. Activos são só P2/P3 → 466 achados únicos, **100% low com motivo**, que o `curar()` já fecha. E `autopilot.json: nivel 0` — o L1 **nunca correu neste device**.
- **Adversário em motor diferente (doutrina "no talo") mordeu a sério.** `codex` (só-leitura) **refutou a minha A3**: `porTriar` sem limite dá **232 entradas para 219 chaves** (`triagem.mjs:173` não tem o `vistos` Set do `contarTriagem:197` → 13 duplicadas na fila do dono) e `curar()` fecha **25** por chamada, não 232. Também impôs o tempo verbal certo: *"nunca terá matéria-prima"* é **projecção ⇒ n/d**. Segunda lente `kimi-k3` confirmou a conclusão mas endureceu três recomendações minhas.
- **Latente, apanhado de caminho:** `registarTriagem` tem `por = 'dono'` por omissão (`:127`) e `contarTriagem` faz `d.por || 'dono'` (`:209`) — **assinatura em falta conta como o dono**. Hoje inofensivo (os 5 chamadores passam `por`), mas condena qualquer correcção do denominador escrita como lista negra.
- **`n/d` que fica aberto:** `LOCAL_AGENT_SYNC=fail` + `device_identity missing` — o `mac-mini-codex` pode ter decisões do dono no ledger dele. Não salva o desenho: `classesSuprimiveis` lê o ledger **local** e o MP não propõe junção entre devices.
- **Ordem que a medição impõe** (nada executado — a FASE 0 pára): (1) denominador do L2 por **lista branca** + proveniência por **canal de escrita** + "sem dados" quando o denominador é zero; (2) ligar o L1 **com auditoria ao dreno** (senão troca-se número falso por cegueira por drenagem); (3) só então nasce o ground-truth do dono. **O gate é a fase 3 desta ordem, não a fase 1.**
- Custódia: 3 commits doc-only, `classify.js` intacto (`427d8c0b…`), baseline **75/75**, nenhum ledger escrito, nenhuma decisão tomada em nome do dono. **Fases 1-3 não avançaram.**
- Próximo gesto (Paulo): decidir se aprova a ordem invertida (denominador → L1 → gate) ou se manda seguir o MP à letra sabendo que dá no-op.

## UPDATE 24/08 ~20h — FASE 0 executada pelo CC: PAROU POR REGRA e refutou o MP (PR #361)

- Paulo colou a CAIXA A; CC criou `gate-l0/f0-scout` (3 commits, doc-only) e abriu PR #361. Mooter no talo cumprido: adversários codex (só-leitura) + kimi-k3 mandados REFUTAR; gemini falhou no dispatch (exit 1, nada escrito).
- **ADENDA G11 resolvida a favor de REAPROVEITAR** (sem checkouts divergentes; "+1 linha MOTIVOS" era NO-OP — como previsto).
- **FACTO 4 ❌**: os "320 dismiss por:'dono'" NÃO existem — triagem.jsonl = 1448 linhas, TODAS por:'claude' (voidar-fila.mjs:104, anulação dos pilares reprovados no ensaio; nota do próprio acto: "o achado nao foi lido nem julgado"). Gate seria no-op: calibração vazia ⇒ FP=0 verde POR VACUIDADE.
- **FACTO 3 ❌ na consequência**: portoes() subtrai só 'agente' (autopilot.mjs:185) ⇒ triados=1448, precisão 0,0% — o L2 está envenenado por 'claude'. Comentário em :183-184 prova que é a 2ª recidiva de lista-negra (20/08 foi 'agente'). Defesa certa: LISTA BRANCA por==='dono' + remover default por='dono' (triagem.mjs:127, :209) + proveniência por canal de escrita + "sem dados" quando triados=0.
- Nicho do gate sem massa: 0 na fila viva, 8 de sempre (P5/P11, desligados). Fila atual: 232 entradas porTriar (BUG: sem dedupe, 13 dups; 219 chaves), 100% low-com-motivo ⇒ curar() fecha tudo em ~10 tiques SE o L1 for ligado (autopilot.json nivel:0 — nunca correu). Ressalva kimi: ligar L1 só com auditoria por amostra + alarme de volume (cegueira por drenagem).
- n/d honesto: ledger do Mac não verificável daqui (LOCAL_AGENT_SYNC=fail); mesmo com decisões do dono lá, o gate lê o local — não salva o desenho.
- **Auditoria cruzada minha (Cowork PC), fonte dupla**: relatório do branch + SYNC.md × código no checkout via mount — autopilot.mjs:185, voidar-fila.mjs:104, triagem.mjs:127/209 conferidos linha a linha. TUDO BATE. Nota: o "531 triados" do veredito de 22-23/08 vs 1448 de hoje = medições de momentos diferentes (o voidar continuou a escrever); não é contradição.
- **Ordem nova (decisões SÓ-PAULO)**: D1 merge #361 (doc-only) · D2 PR do denominador honesto + dedupe do porTriar · D3 ligar L1 com salvaguardas (drena os 219; a "triagem manual SÓ-PAULO 219" morre como tarefa) · gate L0 ADIADO até ≥20 decisões por:'dono' numa assinatura (critério medível). CAIXA B (PACOTES) ganha mais valor DEPOIS do dreno — a fila restante é a matéria real dos pacotes.

## UPDATE 24/08 ~20h40 — PR #362 (PR-1 denominador honesto): auditoria do Cowork = 4/5 ✅, 1 gap

- Branch `gate-l0/f1-denominador` @ eae96c75, 2 commits, 5 ficheiros, +372/−28. Auditado por diff integral + testes corridos POR MIM no container (74/74 nos 2 test-files tocados; CC alega 668/0 no runner).
- ✅ Lista branca: contarTriagem ganhou balde `do_dono` (só por==='dono' explícito); portoes() lê SÓ do_dono, nada subtrai; `naoDoDono` existe apenas para nomear. ✅ Default removido: registarTriagem faz throw sem autor; fallback :209 vira 'n-d' (nunca 'dono'). ✅ Denominador zero → "no data yet — no current decisions signed by you" (nuance última-decisão-vence incorporada). ✅ Mooter no talo: adversário codex refutou 3 defeitos REAIS do próprio CC — (1) portão abria com lixo (`Number(x)||0` aceitava "500% kept"; agora inteiro≥0 senão 0=fechado); (2) GRAVE: curl local sem Origin+sem por → 200 com por:'dono' via:'painel' — spoof fechado (400; via passa a registar o OBSERVADO: painel/cliente-local; honestidade: via não é prova, fechadura por credencial continua por fazer); (3) cópias que afirmavam mais que os dados.
- ❌ GAP: dedupe do porTriar (Set vistos; 232→219, 13 dups no painel) estava na caixa do dono e NÃO entrou — sem menção de adiamento. Pedido ao CC: completar no mesmo branch + teste.
- main parado em 071cf58d: #361 (doc FASE 0) e #362 aguardam merge do dono.

## UPDATE 24/08 ~21h — CORREÇÃO do gap + PRs #363/#364: stack completo, auditoria 3/3 ✅

- **Correção ao update anterior**: o dedupe do porTriar NÃO faltou — entrou no PR #363 (f2-dreno), com gate numérico: 232 entradas/219 chaves/13 dups → 219/219/0, e porTriar passa a bater com contarTriagem().por_triar (duas verdades viram uma). Apanhado pelo adversário da FASE 0, entregue na fase certa.
- **PR #363 (f2-dreno, empilhado sobre f1)**: o dreno deixa de ser cego — (1) amostra de auditoria 1-em-20 DETERMINÍSTICA (FNV-1a da chave, não Math.random — fila estável entre olhares) que é a TORNEIRA do L2: os reservados são exatamente as decisões que o dono vai tomar (medido: 207 fechados + 12 reservados = 219 ✓); (2) alarme de anomalia por MEDIANA dos dias anteriores (média deixaria o 2º dia mau passar — propriedade com teste); (3) o dedupe acima. Tique carimba via:'autopilot-l1'.
- **PR #364 (f3-prontidao, sobre f2)**: prontidao-l2.mjs (177L+140L teste) — SÓ leitura: proveniência derivada na leitura (baldes varredura-ensaio/agente/outro/sem-assinatura; append-only intocado — reclassificar 1448 linhas seria o gesto que o projeto recusa), precisao:null nunca 0%, diz de onde saem as decisões que faltam (a amostra), e RECUSA-SE a estimar data (teste verifica que não existe campo de data). Medido: do dono = 0.
- **Auditoria independente minha**: testes corridos no container no topo do stack (0ccee262): **93 pass / 0 fail**. Diffs lidos integrais nos 3 PRs.
- Estado: 4 PRs abertos aguardando o dono — #361 (doc FASE 0), #362 (f1), #363 (f2), #364 (f3), empilhados nesta ordem. Pós-merge: 3-ATUALIZAR-E-REABRIR.bat (o loop vivo não carrega código novo sozinho) e ligar L1 no painel (nivel 0→1). Gate L0 original: adiado com critério agora MEDÍVEL pelo prontidao-l2 (≥20 do dono a ≥70%).

## Fecho da sessão (2026-08-24, PC) — a ordem invertida foi aprovada e executada

- **O dono aprovou a ordem que a medição impôs** (denominador do L2 → ligar o L1 com auditoria ao dreno → só então o gate) e mandou executar as três fases. O gate L0 do masterprompt **não foi construído** — continua sem entrada (0 decisões `dono`) e sem matéria (nicho a 0).
- **Quatro PRs empilhados**, `base` de cada um no anterior, nenhum mergeado (gate do dono): #361 (F0, doc) → #362 (F1) → #363 (F2) → #364 (F3).
- **F1 #362 — o denominador passa a lista branca.** `contarTriagem` ganha `do_dono` (só `por==='dono'` explícito); `portoes()` lê esse balde e nunca os totais; ausente ⇒ zero ⇒ fechado. Denominador zero diz `no data yet`, nunca `0%`. `registarTriagem` perde o default `por='dono'` e `contarTriagem` deixa de fazer `d.por || 'dono'` — os dois buracos da FASE 0. **Medido: triados 1448 → 0.**
- **F2 #363 — o dreno deixa de ser cego.** Amostra de auditoria 1-em-20 reservada ao dono, por hash FNV-1a (estável, não aleatória — `Math.random` daria uma fila diferente a cada tique). É também a **torneira do L2**: os reservados são exactamente o que ele vai decidir, e as decisões dele são o único material que abre o portão. Alarme de anomalia por **mediana** (com média, o dia mau levanta a fasquia que devia dispará-lo). `porTriar` passa a deduplicar. **Medido: 232→219 entradas, 207 fechados + 12 reservados = 219.**
- **F3 #364 — `prontidao-l2.mjs`.** Proveniência derivada na leitura (o ledger é append-only e reclassificar 1448 linhas no disco seria o gesto que o projecto recusa), `precisao: null` nunca 0, e **recusa-se a dar data** — há teste que verifica que o objecto não tem campo `quando`/`eta`/`previsao`. **Medido: do dono 0, varredura-ensaio 1123, outro 325.**
- **O adversário da F1 encontrou 3 defeitos reais** (codex, motor diferente, sandbox só-leitura). O pior: **um `curl` local assinava como o dono** — `POST /triagem` sem `Origin` e sem `por` devolvia 200 e escrevia `{"por":"dono","via":"painel"}`, na contagem que abre o L2. Fechado com 400; o painel não mexeu. Os outros dois: o portão abria com lixo (`{aceite:100, descartado:-80}` → *"500% kept"*), e a cópia dizia *"you have not decided"* mesmo quando o dono decidira e um agente sobrepusera a chave.
- **Lição a reter:** eu tinha escrito no código que o `via` "torna auditável em vez de acreditado". Era falso — quem escreve escolhe os dois campos. Reescrito para o que é verdade: **detecta ausência e inconsistência, não prova presença**. A fechadura exige credencial no canal e continua por fazer. *Uma promessa num comentário conta como cópia desonesta na mesma.*
- **Número honesto mantido nos PRs:** a amostra reserva 12 e o L2 exige 20 — esta fila sozinha não abre o portão.
- **PENDENTE ao fechar:** os adversários da F2 e da F3 ainda corriam (ambos accionaram uma segunda revisão independente antes do veredicto). Marcado `⏳ a correr` nos corpos de #363 e #364; o veredicto vai para comentário desses PRs. **Não foram dados por passados.**
- Custódia: 687/687 testes (main: 652), `classify.js` intacto `427d8c0b`, nenhum ledger reescrito, zero merges, adds selectivos.
- **Próximo gesto (Paulo):** ler os veredictos da F2/F3 quando chegarem, e decidir os merges pela ordem 361 → 362 → 363 → 364. A F1 é a que mexe no motor (3 ficheiros) e merece o olho dele; a F3 é ficheiro novo só-leitura.

## UPDATE 24/08 ~21h30 — Adversário da F2 devolveu NO-SHIP; CC corrigiu os 4 (PR #363 @ 7318887d)

- **HIGH (matava a tese da fase)**: a amostra 1-em-20 ESFOMEAVA o L2 — o runtime lê janela de 5000 linhas do ledger, não o ficheiro todo: via fila 138 e reservava 5 → estado ABSORVENTE (dono decide 5, portão exige 20, nunca abre). "A amostra é a torneira do L2" era FALSA como estava. Fix: reservarParaODono olha para o ALVO — reserva o que falta para as 20 (amostra por hash primeiro + complemento), depois 1-em-20 como vigilância. Medido na visão do runtime: 5→20 reservados; 118 drenados + 20 = 138 reconcilia.
- MED fuso: dias agrupados em UTC calavam o alarme (30 atos da noite BRT = 15+15) → passa a ownerDay (fonte única já existente). MED direção: queda 100→3 passava como sossego → alarme ganha direccao subiu|caiu (pilar que morre = tão grave). MED diluição: P2 1→101 + P3 99→99 = agregado 2x não dispara (P2 sozinho é 101x) → deteção por pilar. +3: reservados sobre fila cortada a 50 (janela dentro de janela) → tique lê sem corte; anomalia lia decisões pré-tique (alarme sempre atrasado) → corrigido; log separa amostra de complemento.
- **Lição de auditoria (minha, honesta)**: meus 93/93 testes e diffs validaram a lógica sobre o LEDGER INTEIRO; o adversário validou sobre a VISÃO DO RUNTIME (janela 5000) — e foi lá que morava o HIGH. Auditoria de código ≠ auditoria de comportamento em produção. O processo de 2 camadas (eu + adversário em motor diferente) pagou-se.
- Re-corri os testes no novo topo (7318887d): **95/95 pass**. #364 (f3) ficou para trás (base ad7a319b) — aguardar rebase. Merge: #361/#362 prontos; #363 aguarda veredito FINAL do adversário em comentário; #364 aguarda rebase + veredito.

## UPDATE 24/08 ~22h — ACHADO MEU no #364 rebased: incoerência F2↔F3 no relatório de prontidão

- f3 rebased limpo sobre o f2 corrigido (e59b661e; delta = só prontidao-l2.mjs+teste; testes 0 fail). MAS auditoria de coerência apanhou: **prontidao-l2 ainda usa a aritmética esfomeada que o adversário da F2 matou**. Fonte dupla em código: prontidao-l2.mjs:90 (reservados = só naAmostraDeAuditoria, 1-em-20) e :104-106 (achados_novos_necessarios = (20−triados−reservados)×20 ≈ "~160 novos") × autopilot.mjs:385 (reservarParaODono ALVO-primeiro: com fila≥faltam e dono=0, reserva os 20 JÁ; o próprio comentário manda quem reporta separar reservadosPorAmostra de reservadosPorAlvo). Rodapé MEDIDO do commit confirma medição pré-fix ("reservados 12 · faltariam ~160").
- Consequência: o relatório cuja única função é dizer a distância real ao L2 daria ao dono um número ~8× pessimista, contradizendo o mecanismo instalado pela F2. Teste verde não salvou: o teste tranca a lógica antiga (teste ≠ coerência entre módulos).
- Causa: f3 escrito antes do fix da F2; rebase foi textual, não semântico. Entregue ao Paulo caixa de correção para o CC (usar reservarParaODono como fonte única do reporte; achados_novos = max(0, faltam − fila elegível); rodapé com visão do runtime). Merge do #364 segue 🟡 até isto + veredito adversarial da F3.

## UPDATE 24/08 ~22h15 — Adversário da F3: NO-SHIP → 5 fixes (ad25f5c5). O MEU achado convergiu e morreu corrigido

- Enquanto eu registava a incoerência F2↔F3, o CC pushou o fix da F3 pós-NO-SHIP do adversário. **O meu achado foi apanhado independentemente e corrigido**: prontidao-l2.mjs:104 agora usa reservarParaODono(fila,{jaDoDono}) — a MESMA fonte do tique — e o MEDIDO passa a "reservados 20 → o que está reservado CHEGA para os 20 que faltam". Caixa de correção ao CC: cancelada (desnecessária). Convergência dupla (eu + adversário por caminhos diferentes) = o processo de validação funciona.
- Os 5 da F3 (todos reais, todos corrigidos): (1) HIGH "aritmética, não previsão" era mentira — a projeção depende do hash de chaves FUTURAS (160 chaves → 7/11/12 reservadas, não 8); renomeado achados_novos_em_expectativa + expectativa_pressupostos + CLI avisa; e o teste era CIRCULAR (verificava ausência do nome 'previsao', não a propriedade) → substituído por teste que prova a variabilidade. (2) proveniencia() ignorava decisao (aceite do claude rotulado "void em massa"). (3) balde-caixote 'outro' → 'filtro-mecanico' (as 325 nao-e-um-problema dos verificadores deterministas). (4) "1695 achados" eram EVENTOS (1667 únicos; inflação 28). (5) ledger vazio imprimia 0.0% (denominador ||1) → "n/d".
- Verificação independente minha no topo (ad25f5c5): testes 0 fail (CC alega 702/0 no runner; main era 652). Estado: #361/#362 prontos; #363/#364 corrigidos pós-NO-SHIP, aguardam veredito FINAL dos adversários em comentário (vigia armado).

## UPDATE 25/08 ~0h — 2ª ronda adversarial: NO-SHIP duplo → fixes; stack em 121/121

- **F2 (#363 @ 69a479a4 + 611ffbb)**: 2ª ronda NO-SHIP; 6 fixes, quase todos abertos pelos remendos da 1ª. O estrutural: **"agente não sobrepõe decisão do dono" era PROSA e virou GUARD** em registarTriagem (por!=='dono' não sobrepõe chave decidida pelo dono; falha aberta) — mata o 2º estado absorvente (agente sobrepõe 1 das 20 → 19/20 para sempre) e é invariante que o MP-PACOTES herda de graça. Outros: fome pela porta do lado (jaDoDono do ficheiro inteiro vs portão na janela 5000 → fonte única contarTriagem().do_dono; latente 0=0); complemento instável → escada de divisores 20⊂10⊂5⊂2⊂1 (descer só acrescenta; resíduo com teste; degrauDaReserva auditável); paragem total invisível → anomaliaDeDreno({agora}) materializa dia zero; ts sintético→persistido; FNV único. GATE: fila 138 · degrau 1-em-5 · reservados 33≥20 · 105+33=138 · reordenar não muda reserva.
- **F3 (#364 @ 0fb807ff)**: 2ª ronda NO-SHIP; HIGH = "renomear não corrigiu a fórmula" — a 1ª correção foi RÓTULO (manteve ×20; dizia 300 quando bastavam 15). Agora `faltam − reservados` e teste que SIMULA chegadas (anti-circular real). Outros: achados sem chave contados à parte; ledger corrompido → "ILEGÍVEL" exit=1 (não "0 achados" exit=0); CLI publica reservados_por_amostra/extra/degrau (verificado :122-124); nit. MEDIDO: 1667 únicos · reservados 51 (12+39) na visão do ledger.
- **Auditoria minha**: 121/121 pass no topo. Nota LOW: 33 (runtime/138) vs 51 (ledger/219) = janelas diferentes, ambas declaram parcelas+degrau; vigiar superfícies que citem sem declarar janela.
- **Vereditos formais NÃO postados** (corpos "⏳ a correr", WebFetch ~0h): adversários correram na sessão e moldaram commits, mas o gesto de postar+atualizar corpo ficou por fazer — falta 1 gesto pequeno da caixa de fecho. API GitHub desta sessão: 403 por política → vigia de comentários morto; vigia de refs segue. Merge: #361/#362 prontos; #363/#364 com 2 rondas absorvidas e testes verdes, falta o veredito formal.

## UPDATE 25/08 ~1h — 3ª ronda F2: NO-SHIP (a escada era um precipício) → fix; e o CC refutou o adversário num ponto

- #363 @ b6f3f7db: a "correção" da 2ª ronda (escada de divisores) trocava churn de 1 por precipício de 41 (fila 93→94 mudava degrau 2→5 e devolvia 41 reservados ao dreno). Fix: volta à ordem de hash com número medido — 40 chegadas na fila real, pior churn = 1; reserva volta a exata (20, não 33) e o L1 drena 85,5% (era 76%).
- **CC refutou o adversário com medição**: "a escada não é aninhada" estava ERRADO (20.000 chaves, divisores de 20, 0 quebras) — mas o churn que ele mediu estava certo, e foi esse que se corrigiu. Sinal de maturidade do processo: veredito não é oráculo; medição decide.
- Outros 5: registarVarias() (guard do dono no meio de um for deixava escrita parcial + log mentiroso "fila intacta"; colisões separadas de erros reais); relógio blindado (agora=NaN/'lixo'/[] não rebenta nem vira 1970); falso alarme matinal (base escala com fração do dia NO FUSO DO DONO — o teste apanhou o próprio CC lendo 00:23Z como madrugada = 21:23 SP); ato no futuro escondia paragem de hoje; alarme exige via:'autopilot-l1' (não mostra trabalho de outros canais como L1).
- GATE: reservados 20 · 118+20=138 · churn≤1 · relógios inválidos não rebentam. Minha verificação: 109/109 nos 2 test-files. f3 (#364) ficou para trás de novo — aguarda rebase sobre b6f3f7db. 3 NO-SHIPs consecutivos na F2: o processo converge (HIGHs estruturais → MEDs de borda), e o adversário está funcionando como suite de propriedade.

## UPDATE 25/08 ~1h30 — 3ª ronda F3: NO-SHIP com HIGH de PROCESSO (testes fora do CI) → fix; suite completa verificada por mim

- #364 @ a3393d3f (rebased sobre f2 3ª ronda): o HIGH não era lógica — **os 18 testes do prontidao-l2 nunca estiveram no CI** (test:cockpit-runner lista os ficheiros; o novo não constava; CI corre exclusivamente esse script). "Passei três rondas a discutir a honestidade de um relatório cujos testes não eram gateados por nada." Fix: adicionado; CI 741→758.
- Outros: corrupção parcial dava números exatos (1 legível + 500 partidas → exit=0) → >10% ilegíveis marca tudo como LIMITE INFERIOR + exit≠0; linha `null` é JSON parseável mas não é dado (contornava a guarda de zero-legíveis) → null/escalares/arrays contam como partidas; triagem ilegível saía exit=0 → ≠0; e o nit filosófico: "a data seria a ÚNICA mentira possível" era ela própria mentira → "a mais fácil, não a única".
- Validações OK da ronda: fórmula bate com simulação em 42.420 casos (0 divergências); CLI reconcilia (12+39=51; proveniência 0+1123+325=1448).
- **Verificação independente minha, suite COMPLETA do CI** no topo (a3393d3f): `npm run test:cockpit-runner` → **758 tests · 757 pass · 0 fail · 1 todo** (placeholder declarado, não falha). Estado: F2 e F3 com 3 rondas adversariais absorvidas cada; stack no ponto mais forte até agora; falta o gesto de postar vereditos nos PRs + merges do dono (#361→#364).

## UPDATE 25/08 ~2h — #361 destrancado: ratchet de higiene obrigou a arquivar o MP executado

- O CI bloqueou o #361 (top_level_handoff_files 313>312, active_packets 206>204): o MP e o relatório da FASE 0 estavam soltos no topo de _handoff/. O AGENTS.md já mandava (masterprompt executado → _handoff/_archive/YYYY-MM/ no MESMO PR). CC arquivou os 2 (move puro, e7e92dfa) e RECUSOU subir o baseline ("subir o baseline era pedir ao repo para aceitar a minha desarrumação"). Medido: 311<312 ✅. MP_PACOTES e COLAR_NO_CC ficam no topo — corretos, ainda não executados. Quadro de merge inalterado: 4 PRs prontos aguardando o dono.

## UPDATE 25/08 — MERGES COMEÇARAM: #361 e #362 no main

- main@fa094248: Merge #362 (f1-denominador) sobre Merge #361 (f0-scout). **O denominador honesto do L2 está em produção**: lista branca do_dono, sem default por='dono', "no data yet" em vez de 0%, spoof do curl fechado. f1/f2 branches atualizados pós-merge da base (0f6abf46/f4d51324); f3 aguarda. Faltam #363 e #364 → depois: 3-ATUALIZAR-E-REABRIR.bat + ligar L1 no painel.
- **#365 consolida F2+F3** (erro de ordem/base ao mergear a pilha fechou #363/#364): f2-dreno agora contém o merge do f3; diff vs o topo que auditei (a3393d3f) = **VAZIO** — mesmo conteúdo das 758·757·0·1-todo; diff vs main = as fases 2+3 (1.629 inserções). Resta 1 merge (#365) + bat + ligar L1.

## UPDATE 25/08 — 🎯 CICLO DE CÓDIGO COMPLETO: #365 mergeado, main@fa85684a tem as 3 fases

- Merge #365 no main: as fases F1 (denominador honesto, já em fa094248) + F2 (dreno com amostra-torneira, alarme por mediana/direção/pilar, guard "agente não sobrepõe dono") + F3 (prontidao-l2 no CI) estão TODAS em produção. 1.629 inserções desde 071cf58d. 6 rondas adversariais absorvidas no total (3 F2 + 3 F3), tudo auditado por mim com suite completa (758·757·0·1-todo).
- Restam os 2 gestos físicos do dono no PC: (1) 3-ATUALIZAR-E-REABRIR.bat (loop vivo não carrega código novo); (2) ligar L1 no painel (nível 0→1) → dreno fecha ~118 e reserva 20 para o dono — o material do L2 começa a existir.

## UPDATE 25/08 — 4ª ronda sobre o main: 2 HIGHs de honestidade → PR #366 (mergear ANTES dos 2 gestos)

- 7 defeitos no código já em main; 5 arestas declaradas não-bloqueantes (não disparam hoje); 2 HIGHs da única categoria bloqueante do projeto — o painel afirmava falsidades: (1) **degrau_da_reserva era ficção** — a escada saiu na 3ª ronda mas o helper-legenda ficou e o relatório publicava "1-em-5" para uma reserva por hash (medido: 8 reservadas fora do degrau, 39 do degrau fora da reserva); removido ("uma legenda errada por baixo de um gráfico certo"). (2) **o spoof do dono NÃO estava fechado** — F1 fechou só "sem Origin e sem por"; `por:'dono'` explícito de qualquer processo local passa. Em vez de fechadura de papel: CONTA-SE — dono_via_painel vs dono_sem_painel publicados, CLI avisa. "Contar o que não se consegue impedir é mais honesto do que fingir que se impediu."
- **Honestidade da MINHA auditoria**: eu também escrevi "spoof fechado" na auditoria da F1 — repeti a alegação sem testar o caso por:'dono' explícito. 4 camadas (CC + 3 rondas + eu) deixaram passar; a 4ª ronda apanhou. Registrado como limite do processo: auditoria de diff confirma o que o diff diz, não o que ele cala.
- Verificação minha no #366: suite completa **760 · 759 pass · 0 fail · 1 todo**. Recomendação ao dono AJUSTADA: mergear #366 PRIMEIRO, e só depois os 2 gestos (bat + ligar L1) — senão o painel nasce publicando o degrau-ficção.
- **#366 mergeado — main@882c042f COMPLETO**: F1+F2+F3+remediação em produção, 760·759·0·1-todo. GitHub fechado. Restam os 2 gestos físicos: 3-ATUALIZAR-E-REABRIR.bat + ligar L1 no painel.

## Fecho real (2026-08-25) — em `main`, depois de 4 rondas adversariais

- **`main` @ `882c042f`.** PRs #361 (F0 doc) · #362 (F1) · #363/#364 (F2/F3) · #365 (o que ficou fora do merge) · #366 (remediação dos 2 HIGH) · #367 (SYNC). **O gate L0 do masterprompt continua POR CONSTRUIR** — a FASE 0 explica porquê: sem decisões do dono, não tem entrada.
- **4 rondas adversariais em motor diferente (`codex`, só-leitura): 35 defeitos.** 34 confirmados por medição minha, **1 refutado** (a escada ERA aninhada nos divisores de 20 — a matemática dele estava certa em geral e errada naquele caso; o *churn* que ele mediu é que estava certo).
- **O padrão, que é a lição maior desta sessão: em cada ronda os defeitos vieram das correcções da ronda anterior.** Não é ruído: é o custo de corrigir sob pressão sem re-auditar a vizinhança do que se mexeu. Três casos que valem mais do que a contagem:
  - *"aritmética, não previsão"* era mentira minha; apanhado, mudei o **rótulo** e deixei a **fórmula** (dizia 300, bastavam 15). **Renomear não corrige nada.**
  - a **escada** que criei para corrigir um churn de 1 produzia um churn de **41** — troquei uma instabilidade pequena por um precipício e apresentei-o como correcção.
  - escrevi **18 testes sobre honestidade que o CI nunca correu**, e defendi-os três rondas. Nenhuma verificação local o apanhava — só olhar para o `package.json`.
- **ACIDENTE DE MERGE, a registar para não repetir:** os #363/#364 estavam **empilhados** (`base` = branch anterior, não `main`). Fiz merge do #362 primeiro e os outros **resolveram-se para dentro da pilha** — o GitHub marcou-os `MERGED` e a `main` **não tinha** `prontidao-l2.mjs` nem metade das funções. Só apanhei porque verifiquei o CONTEÚDO em vez de acreditar no estado dos PRs. **`MERGED` ≠ "está na main".** Com PRs empilhados: fazer merge de cima para baixo, ou re-apontar as bases para `main` antes de começar.
- **Os 2 HIGH remediados (#366)** — a única categoria que este projecto trata como bloqueante, "o produto diz ao dono algo que não é verdade":
  - `degrau_da_reserva` **era ficção**: a escada saíra e o helper que a explicava ficou. O painel publicava "1-em-5" com 8 reservadas fora desse degrau e 39 do degrau fora da reserva.
  - **o spoof do dono não estava fechado e eu dei a entender que estava.** `/triagem` faz `body.por || 'dono'`; fechei só o caso sem `Origin` **e** sem `por`. Não se fecha sem credencial no canal — e uma credencial que o painel serve lê-se com um `GET`, seria fechadura de papel. **Passa a contar-se** (`dono_via_painel`/`dono_sem_painel`). *Contar o que não se consegue impedir é mais honesto do que fingir que se impediu.*
- **Resíduos declarados em `main` (#366), nenhum faz o painel mentir:** os 3 scripts de varredura param na 1.ª colisão · o tique desalinha o `pilar` quando há recusadas · a fracção do dia não chega à detecção por pilar · actos futuros no mesmo dia passam · o ledger aceita `{}` como recibo.
- **Números finais:** 760 pass / 0 fail (`npm run test:cockpit-runner`, o comando que o CI corre) · `classify.js` `427d8c0b` intacto · o painel deixou de dizer ao dono que ele mantém 0% do que o loop encontra.
- **Próximo gesto (Paulo):** o L1 continua a `nivel: 0`. Ligá-lo é decisão dele, e agora vem com auditoria ao dreno. Só depois nasce o ground-truth `por:'dono'` de que o gate precisaria.
- **#367 (doc de fecho)**: retrospectiva no SYNC — 4 rondas · 35 defeitos (34 confirmados, 1 refutado) · o padrão "cada ronda apanha as correções da anterior" · o ACIDENTE DE MERGE documentado ("MERGED ≠ está na main" — pilha resolveu para dentro; #365 salvou) · 5 arestas declaradas por fazer. Consistente com a minha auditoria em todos os números (760/0, 1448→0, reservados 20, churn 1, 1667). Doc-only, pronto para merge.
- **#367 mergeado — main@aa3d4ca5. CICLO GITHUB DO GATE L0 100% FECHADO** (#361→#367). Pendente: os 2 gestos físicos no PC (bat + L1).

## O L1 foi LIGADO (2026-08-25) — e a ligação destapou um impasse de janela

- **`autopilot.json: nivel 1`.** 118 achados fechados em ~4 min (`por:'agente'`, `via:'autopilot-l1'`, 25/tique), **20 reservados** para o dono (5 pela amostra 1-em-20 + 15 porque o portão 2 os exige). Guardrails verificados: 0 não-`low`, 0 públicos. Backup em `~/.mooter/autopilot.json.antes-l1`.
- **PAREI ANTES DE LIGAR, e foi o que salvou o trabalho do dia.** O `f10-server` vivo corria o **código antigo** — `import` carrega uma vez em memória e ele fora lançado antes dos merges. Ainda dizia no ar: `531 triaged · "0% kept" · "you keep 0% of what it finds"`. Ligar o L1 assim corria o `curar()` antigo, drenava os 138 da janela **sem reservar** os 20, e recriava o estado absorvente que quatro rondas mataram. O espelho do cockpit também estava desactualizado (`SELF-CHECK FALHOU`).
- **Sequência que passa a ser a regra:** `sync:cockpit` → reiniciar o processo → **verificar que o código novo está mesmo no ar** (probe ao `/fleet.json`) → ensaio → só então ligar. O `moo-runner` também corria código velho (`sha_carregado 071cf58d`, de antes dos merges); reiniciado para `aa3d4ca5`, e o `claimLock` reclamou o lock órfão sozinho.
- **O IMPASSE, o achado desta parte da sessão.** Duas contagens da mesma fila, com janelas diferentes: o **L1 e o painel** leem `readLedger` com o default de **5000 linhas** → fila **20**; o **runner** conta o ledger **inteiro** (9996) → fila **101**. O runner pausa acima de 50, portanto fica pausado **para sempre**: o L1 já fechou tudo o que a janela dele mostra e não consegue ver os 81 que ficam de fora. `219 − 118 = 101`, a aritmética fecha exactamente. **Não é uma espera, é um deadlock — e fica POR CORRIGIR.**
- **É a mesma classe de defeito que o adversário apanhou três vezes hoje:** duas contagens do mesmo número com janelas diferentes (`porTriar` vs `contarTriagem`; `jaDoDono` do ficheiro vs do portão; e agora runner vs L1). O padrão sobreviveu a quatro rondas porque cada ronda corrigia a instância, não a classe.
- **Lição operacional a reter:** `sha_carregado` no `runner-state.json` existe precisamente para tornar visível o código velho em memória. Estava a dizer a verdade o tempo todo — faltava alguém olhar. O mesmo vale para o `SELF-CHECK` do espelho.
- **Próximo gesto (Paulo):** decidir os 20 reservados — é a primeira vez que o portão 2 pode medir a precisão DELE. E resolver o impasse da janela, senão o runner não volta a gerar achados.

## UPDATE 25/08 ~1h30 — 🟢 L1 LIGADO. 118 fechados · 20 reservadas ao dono · e um impasse de janela DECLARADO (PR #368)

- O CC PAROU antes de ligar — e ainda bem: o f10-server vivo corria código antigo (teria drenado os 138 SEM reservar, recriando o estado absorvente que 4 rondas mataram; ainda exibia "531 triaged · 0% kept"). Sequência correta executada: sync:cockpit 38/38 → reiniciar f10 E moo-runner (ambos em 071cf58d) → verificar código novo no ar → ensaio → ligar. Backup do autopilot.json guardado.
- **Medido**: 118 fechados (por:'agente', via:'autopilot-l1', 25/tique) · **20 reservadas** (5 amostra + 15 portão) · 0 não-low · 0 públicos · a mentira saiu do ar: "no data yet — the 649 not signed by you never count".
- **IMPASSE destapado (declarado, NÃO corrigido)**: runner conta a fila no ledger INTEIRO (101 = 219−118, aritmética fecha) e pausa acima de 50; o L1 vê a janela de 5000 (fila 20, tudo fechado). Runner pausado PARA SEMPRE = deadlock — a MESMA classe (duas contagens, janelas diferentes) que o adversário apanhou 3× hoje. Trava produção NOVA dos pilares; NÃO trava a triagem das 20 reservadas.
- **Próximo gesto do dono: TRIAR AS 20 no painel** — são o material do L2 (20 a ≥70% abre o portão). Fix do impasse: candidato a próximo PR pequeno (unificar a janela das duas contagens — fonte única, como das outras 3 vezes).

## O impasse da janela: CORRIGIDO (#369, `main` @ `b24d8359`)

- **A causa**, encontrada ao ler o código em vez de esperar: `decidirRonda` (`moo-runner.mjs`) lia o ledger com o seu **próprio `readFileSync`, sem janela nenhuma**, enquanto o `readLedger` — que o painel e o tique do L1 usam — lê `maxLines = 5000`. Duas leituras do mesmo ficheiro, com fronteiras diferentes, a responder à mesma pergunta.
- **A correcção:** o runner passa a ler pela mesma porta. **101 → 20**, as três contagens (runner, L1, painel) dão o mesmo número, e o runner despausou (`pilar: P3`, `sha_carregado b24d8359b16e`).
- **A janela nunca foi acidente:** o `CAUDA_AO_RODAR`, no MESMO ficheiro, já dizia *"tem de ser a MESMA janela que o `readLedger` usa"*. A rotação já estava alinhada com ela — esta leitura é que passava ao lado da porta. O sistema já sabia a regra; havia um sítio que não a seguia.
- **TRATADO COMO CLASSE, NÃO INSTÂNCIA — e é essa a lição.** Esta foi a **terceira** aparição do mesmo defeito num dia: (1) `porTriar` vs `contarTriagem` (232 contra 219), (2) `jaDoDono` contado do ficheiro contra o do portão, (3) runner vs L1. Nas duas primeiras corrigi a instância e a classe sobreviveu — foi por isso que a 4.ª ronda ainda a encontrou. O teste novo usa **6000** achados de propósito: com 5000 as duas leituras dariam o mesmo número e não provaria nada.
- **Regra que fica:** duas contagens do mesmo número são um defeito, mesmo quando ambas estão "certas" na sua própria janela. A correcção nunca é acertar uma delas — é fazê-las ler pela mesma porta.
- **Lição operacional, terceira repetição no mesmo dia:** a correcção estava em `main` e o runner corria `aa3d4ca5`. O `sha_carregado` do `runner-state.json` dizia-o o tempo todo. `import` lê o ficheiro uma vez; só reiniciar carrega código novo. Vale para o `f10-server`, para o `moo-runner` e para o espelho do cockpit (`SELF-CHECK`).
- **Estado final:** L1 ligado e a drenar · fila em 20 (os reservados para o dono) · runner a gerar de novo · 761 pass / 0 fail · `classify.js` `427d8c0b` intacto.

## O loop vivo, e a pergunta que fica na fila (2026-08-25, fim da sessão)

- **O impasse estava mesmo resolvido:** entre `05:51Z` e `09:29Z` o runner produziu **531 rondas e 49 achados únicos (9,2%)** — P3 443 · P2 87 · `citacao-ok` 316 · `sem-achado` 211 · `refutado` 1. Enquanto pausado não produzia nada.
- **Depois esgotou-se, e isso não é avaria:** as últimas linhas do ledger são `nada-por-rever`, `nada-por-rever`, `pilar:esgotado`. O runner continua **vivo** (estado fresco, sem pausa, `pilar: P3`) — percorreu tudo o que a base de diff mostra. **Esgotado não é partido**, e confundir os dois seria repetir o erro do P7 (*"produzir não é acertar"*, [[30-learnings/2026-08-21…p7-semeado]]).
- **A fila fechou em 22**, com **20 reservados** para o dono (6 pela amostra 1-em-20 + 14 porque o portão 2 os exige), 20 `low/trivial` + 2 `med/null`, P2 14 · P3 8. O L1 já não tem nada para fechar (`0`).
- **O PADRÃO DO QUE SOBRA É O DADO, e é mais importante do que a contagem.** Quase todos os 22 são a mesma forma: *"esta variável é inicializada a 0/[] em duas linhas"* e *"este comentário tem um número"*. **Dois deles citam comentários escritos nesta própria sessão** (`triagem.mjs` e `autopilot.mjs`). Isto é a pergunta que o gate L0 nunca conseguiria responder, agora em cima da mesa: **os P2/P3 encontram problemas ou descrevem código?** Se o dono mantiver poucos destes 20, a resposta é a mesma que os outros sete pilares já deram este mês.
- **PONTO CEGO NOVO, registado e NÃO corrigido:** `pilar:esgotado` é um evento no ledger que ninguém vigia. O `anomaliaDeDreno` construído hoje mede quedas de **dreno**, não de **produção** — um pilar mudo por estar esgotado e um mudo por estar partido são hoje indistinguíveis para quem olha para o painel. Candidato natural ao próximo sinal visível.
- **Estado no fim:** `main` @ `b50b4f68` · L1 ligado e sem trabalho pendente · runner vivo e esgotado · 761 pass / 0 fail · `classify.js` `427d8c0b` intacto.
- **Próximo gesto (Paulo):** decidir os 20. É a primeira vez que o portão 2 pode medir a precisão DELE, e a primeira vez que há material honesto para julgar os dois pilares que restam.

## O fecho do arco: o dono decidiu, e o número passou a ser dele

- **20 de 20 decididos, 0 mantidos.** Veredicto completo em [[20-decisions/2026-08-25-veredicto-p2-p3-20-achados-0-valiam]].
- **O par que vale a pena guardar desta sessão:** *o mesmo output, uma vez falso e uma vez verdadeiro.* Às ~05:00 o painel dizia `"you keep 0% of what it finds"` sobre 531 decisões de scripts — mentira. Às ~08:20 diz exactamente a mesma frase sobre 20 decisões do dono — verdade. **A diferença nunca esteve no número; esteve em quem o produziu.** É a tese do projecto inteiro, num par de leituras separadas por três horas.
- **O arco fechou-se onde a FASE 0 disse que fecharia:** o gate L0 suprimia por classe e nunca mediria valor; a ordem invertida (denominador → L1 com auditoria → ground-truth) produziu, em horas, a primeira medição honesta do juízo do dono. O masterprompt teria produzido um no-op com FP=0 verde por vacuidade.
- **Estado final:** `main` @ `0e4f4047` · 761 pass / 0 fail · L1 ligado · runner vivo · fila 73 com 7 reservados novos · `classify.js` `427d8c0b` intacto.
- **Próximo gesto (Paulo):** decidir se o P2 e o P3 seguem os outros sete pilares. Os números para essa decisão existem agora, e é a primeira vez.

---

## 2026-08-25 (fecho) · o loop cala-se — PR #373

A cadeia que começou com a FASE 0 a refutar o masterprompt acaba aqui, e não
onde o masterprompt apontava. Ele mandava suprimir achados **por classe**; o que
se construiu em vez disso foi o instrumento que **mede valor** — e o instrumento,
ao ser usado, disse que não havia valor nenhum a preservar.

- **20 achados decididos à mão pelo dono → 0 mantidos.** 11 do P2, 8 do P3.
- **P2 e P3 desligados.** Rotação a zero: onze pilares, onze reprovados.
- **`moo-runner` sem alvo, por decisão.** O loop fica mudo, e há um teste cuja
  única função é exigir que esse zero seja visível.

Detalhe e raciocínio em [[2026-08-25-veredicto-p2-p3-20-achados-0-valiam]].

**A lição que fica desta cadeia inteira**, e que não é sobre pilares: *um gate
que suprime por classe teria escondido exactamente os 20 achados que provaram
que o loop não valia nada.* Suprimir teria parecido melhoria. Medir mostrou a
verdade.

Estado: PR [#373](https://github.com/pauloloureiroshp-ship-it/mooter/pull/373)
aberto, à espera do gate do dono. Por fazer depois do merge: reiniciar o runner
(o catálogo antigo está em memória).

---

## 2026-08-25 · entregue: `main` @ `9c54af2c`

A cadeia fechou em código, não em intenção.

- **#373 merged** — 14/14 checks. Verificado por **avaliação** (`PILLAR_IDS === []`
  em `main`), não pelo estado do PR. `MERGED` nunca provou conteúdo, e esta
  mesma cadeia já pagou por isso com um PR de reparação.
- **Runner reiniciado.** `sha_carregado`: `b24d8359` → `356f4e3d` → `9c54af2c`.
  Um `import` é estático — o merge sozinho não muda o que a máquina corre, e
  este campo é o que transforma *"reiniciei"* numa afirmação com prova.
- **#374 → #375**, um bug encontrado ao fechar a sessão e corrigido no mesmo dia.

### O erro meu que vale mais do que o bug

Diagnostiquei o falso alarme do `launch.mjs` como *"não verifica o remoto"*.
**Verifica.** O que existia era uma janela de cinco segundos entre o `commit` e
o `push` do publicador, e o `launch.mjs` verifica logo depois de arrancar o
loop — apanha a janela quase de propósito. Medido no reflog: `08:51:01` commit,
`08:51:06` push.

Corrigi o registo antes de abrir a issue. Se tivesse aberto com o diagnóstico
errado, a correcção teria sido noutro sítio e o sintoma voltaria.

### O detalhe que a issue não tinha

O discriminador tem de ser o commit **mais antigo** por publicar, nunca o mais
recente. Um publicador avariado reescreve o beacon a cada ronda e deixa sempre
um commit de segundos atrás — com o mais recente, ficaria mudo para sempre.
**Trocar um alarme falso por um silêncio falso é pior**, e é o erro que este
ficheiro já tinha cometido uma vez na direcção oposta.

### Estado da máquina

`launch.mjs --status` imprime `alinhamento tudo em dia`, sem um único item na
secção do dono. Primeira vez no dia. O loop está parado e diz porquê:
`no eligible loop (all capped / paused / suspended)`, fila 0.

### Em aberto (não é para o fim de uma sessão longa)

Pilar novo desenhado contra o modo de falha dos onze — nenhum perguntava *"isto
parte alguma coisa?"* —, dívida declarada no #366, ou desligar o loop de vez.
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/10-projects/2026-08-25-mac-sync-cockpit-frota.md
# 2026-08-25 · Mac mini alinhado ao trabalho noturno do CC (Cowork mac-mini, 11:08–11:15Z)

Contexto: o CC no PC fechou o ciclo gate-L0 (#361→#371, 4 rondas adversariais, 35 defeitos, L1 ligado lá, fix do impasse da janela em #369). O Mac acordou retardatário: sha_carregado 071cf58 (pré-merges), FETCH_HEAD de 24/08 15:35Z, pausa 524/6.

Circuito executado (Finder click-only, `operar/3-REINICIAR-COCKPIT.command`, 3×):

| Reinício | Resultado |
|---|---|
| 1º (11:10Z) | pull PASSOU: +31 commits (disco → b50b4f68) — mas processos nasceram antes do pull: `sha_carregado 071cf58 ≠ disco`, desactualizado:true. Exatamente o modo de falha do journal do CC ("import carrega uma vez") |
| 2º (11:12Z) | carregou b50b4f68; origin avançou DURANTE (+2, #370/#371) → disco 0e4f4047, desactualizado:true de novo — o CC estava a pushar em tempo real |
| 3º (11:13Z) | **convergiu: sha_carregado = sha_disco = `0e4f4047` (#371), desactualizado:false** · painel PID/runner novos · STOP levantado |

Prova no ar (fleet.json vivo, 11:14Z): self `0e4f4047` desactualizado:false · autenticidade ok · prova_frota TRUE · rejeitados [] · campo novo `triagem.do_dono {0,0,0}` = denominador honesto do CC em produção NESTE Mac. PC: `b24d835` (#369) — o Mac ficou À FRENTE (docs #370/#371); o PC apanha no próximo restart de lá. Painel do dono recarregado, pintando ("connector 1.49.4 in this checkout · source live").

Estado pós-sync: pausa do Mac continua ("human queue full 328/6") — correto por desenho: L1 deste device está a nivel 0 (nunca correu aqui) e a fila humana é real. Nota: a ordem start→pull do launch.mjs faz qualquer restart carregar o pull anterior — candidato a achado (pull antes de spawn), mesma família dos "duas contagens, janelas diferentes".

Decisões que ficam do dono: ligar o L1 do Mac (agora com dreno auditado + fix da janela em produção) · os 20 reservados no PC · projecto ativo divergente (ainda) · preferences.json (ainda).

## Bloco 2 (11:30–11:59Z) — Cowork navegou o Moo Pilot NO LUGAR DO DONO (autorizado): 1 bug + 1 oportunidade + fila zerada

| Gesto | Prova |
|---|---|
| 3 dismisses do dono verificados no disco | agents-progress-status: caso saudável (not a problem) + 2 citações em linha errada (instrumento) |
| **BUG documentado via produto**: verificador de citações com off-by-one — grava linha N, conteúdo está na N-1 | confirmado em run-savings.js:19/20 e validar-fase.js:80/81 → "issue — recorded" (issues 0→1). Os P4 MEDIUM "BROKEN" são artefacto de janela (PASTOR.md 64 fences pares; VISION 2) — mesma família |
| **OPORTUNIDADE: L1 ligado** (escada L0→L1 no painel) | dreno auditado: fila 328→324→299→274→…→22 (25/tique), ~306 fechados com motivo |
| Descoberta de config: limiar do Mac (6) < reserva do dreno (~22) → pausa nunca levantaria sozinha (PC: limiar 50) | beacon "human queue full (22/6)" pós-dreno — corrigido pela triagem abaixo |
| **22 reservados triados como dono, um a um com leitura prévia**: 1 ACCEPT (decide-agent.ts:40 — pricing-snapshot de 27/05 hardcoded num router de custos, 3 meses velho, MED em código shipped) + 20 dismisses fundamentados (healthy-seed→not a problem; off-by-one→instrumento; runner-core:359→right-line-wrong-conclusion, o comentário JUSTIFICA o código) | cards "aceite/descartado — recorded"; restam **2** (deixados de propósito para o dono experimentar o gesto) |
| **RESULTADO: pausa levantada, loop a gerar** | beacon 11:59:00Z: pausa false · pilar P3 · GPU 99% · por_triar 2 |

Frota: PC também a gerar (P3, branch `decisao/desligar-p2-p3`, GPU 100%) — os DOIS devices com GPU quente pela 1ª vez desde 22/08. Para o CC: (1) issue off-by-one do verificador; (2) accept do pricing-snapshot → atualizar snapshot; (3) alinhar limiar da fila do Mac (6→50?); (4) launch start→pull (journal do bloco 1). Para o Paulo: 2 achados na fila para triar à mão + decidir keep-rate honesto (1 aceite/22 ≈ 4,5% — se o instrumento continuar assim, a decisão de desligar P2/P3 do PC ganha força).

Registado: masterprompt no repo + registro do pitch em 40-strategy + rotina semanal agendada (Cowork, segundas 09:00 BRT).
--- /sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/10-projects/2026-08-24-mac-checkup-v1494.md
# 2026-08-24 · mac checkup v1.49.4 (Cowork, 11:13–11:18Z)

| Medido | Valor |
|---|---|
| Device | mac-mini-de-paulo · darwin/arm64 (get_device_info 11:13:53Z) |
| Conector | versao_instalada **1.49.4** (`mooter_setup atualizar:'ver'`); app foi reaberto entre sessões (grants de computer-use caíram — evidência indireta); checkout do repo continua a declarar 1.49.3 (25 commits atrás) |
| Loop | estava **em baixo** às 11:14:57Z ("loop dos pilares: em baixo") — caiu entre 11:09Z e 11:14Z, janela do restart do app. Relançado pelo circuito Finder+duplo-clique → **arrancado (PID 58260)**. PIDs do endpoint/painel: n/d (sem ps do host via VM) |
| Validação (log +2335 bytes, 6426→8761) | Ollama :11434 vivo · endpoint :4290 vivo · loop vivo · STOP levantado · Gatekeeper não recusou |
| 1º beacon novo | **ts 2026-08-24T11:17:23.468Z** · running true (~2,4 min pós-arranque) |
| Painel | aberto no Chrome; header "morto — no receipt for 752s" = poço seco/disjuntor (pilar:esgotado, retoma sozinho), não processo morto |

Estranhezas:
- Vault: **behind 258** de origin/main, último commit local 22/08 15:58Z, conflito não resolvido `DU .claude/3rd-brain/index.json` → sync da frota parado desde sábado (o launch de hoje reportou "↻ índice do vault reconstruído" — verificar se destravou o publicador). Resolver = Claude Code.
- Painel fleet mostrava "desktop-j26409q · 1 min ago" com o ficheiro do beacon datado 22/08 15:55Z — candidato a bug do painel (prato para P7).
- Repo frugal: 25 atrás, pull do launch **não passou**; `package.json` e `moo-pilot-shell.html` modificados no working tree. Git = custódia CC, nada tocado daqui.
- Pendentes do dono: projecto ativo divergente (cowork-session.json ≠ sessoes/mooter.json) · preferences.json em falta · 1057 achados por triar.

Handoff → Windows: claude/HANDOFF_COWORK_WINDOWS_2026-08-24.md no Project Mooter.ai (canal Project porque o vault não sincroniza; reporte de volta no próprio doc).

## Validação pós-restart do app (Cowork mac-mini, 11:41Z)

| # | Check | ✅/❌ | Fonte |
|---|---|---|---|
| 1 | get_device_info = darwin | ✅ darwin/arm64, 11:41:35Z | get_device_info |
| 2a | versao_instalada 1.49.4 | ✅ | mooter_setup atualizar:'ver' |
| 2b | Processo MCP nascido após restart | ✅ capacidades re-medidas em **11:40:53.801Z** (initialize novo; protocol 2025-11-25, roots+extensions/ui anunciados) · 2ª evidência: allowlist de computer-use zerada (grants de 11:14Z limpos pelo restart) | .mooter/mcp-capabilities.json via mooter_setup; computer_list_granted_applications |
| 3a | Beacon fresco <10 min | ✅ ts **11:40:46.589Z** (~1 min), running true, P6, VRAM 15,3 GB — loop **sobreviveu ao restart**, sem relançamento (PID 58260 do launch 11:14:57Z presumido vivo, não re-medível da VM) | 50-fleet/mac-mini-de-paulo.json |
| 3b | sha do beacon = disco | ✅ beacon `70597e5e6804` = `git rev-parse HEAD` 70597e5e6804…616 | beacon paridade.repo_sha + git só leitura |
| 3c | sig HMAC no beacon | ❌ **campo não existe** e o código em disco não implementa (grep -ril hmac em tools/cockpit → vazio). Se a assinatura veio nos 25 commits de origin, só aparece após o pull (CC) — n/d daqui | beacon completo + grep no checkout |
| 4 | Painel pintando no Chrome | ✅ screenshot: header "stale — no receipt for 90s" (recibos a fluir; era 752s), GPU 31%, cards ok. Item novo em NEEDS YOUR HAND: "índice do vault — 1 por indexar" (`node .claude/3rd-brain/build-index.js`) | painel :4290 via Chrome |

Nada de /play //stop; git intocado.

## Destrave pelo Claude Code (mac-mini, 2026-08-24 ~11:46–11:52Z)

**Premissa refutada logo à cabeça:** o vault não tinha commits presos. `git rev-list --left-right --count HEAD...origin/main` deu `0 262` — zero à frente. Os `chore(fleet): beacon mac-mini…` **já estavam no remote** (o `pull --rebase` de 22/08 concluiu e reescreveu-os; `e78e133` local virou `f03f7b1`, que é antepassado de `origin/main`). O que estava preso era só sujidade local.

**1 · Vault — conflito resolvido pelo precedente, não pela mão**

| Facto | Valor |
|---|---|
| Causa real do `DU` | não era um merge a meio (`.git/MERGE_HEAD` não existia). Era o **autostash do `pull --rebase --autostash`** a falhar ao voltar — o rebase terminou, o pop conflituou, e ficaram entradas unmerged sem operação em curso |
| Precedente aplicado | `e7f99d6` ("tirar o índice do git — TERCEIRA vez") — o `index.json` é **derivado**, coberto pelo `.gitignore:71`, e o commit avisa por escrito que resolver o conflito com `git add` é exactamente o que o re-versiona pela enésima vez |
| Resolução | `git reset -- .claude/3rd-brain/index.json` — tira do índice, **não toca no disco**. `HEAD` não o versiona → o `.gitignore` volta a morder (`git check-ignore` confirma) |
| Regeneração | o `sync-device.mjs` do launch reconstruiu-o sozinho: "↻ índice do vault reconstruído" (1,07 MB 08:14 → **1,45 MB 08:50**) |
| Pull | `--ff-only` limpo, **262 commits**, `main` = `origin/main` |
| Push | o runner novo commitou e empurrou o beacon `86bfa9a` — `HEAD…origin/main` = **`0 0`** |

Nada destrutivo: sem `--force`, sem `git add -A`, sem escolher entre históricos de conteúdo (não havia nenhum para escolher — a divergência era 100 % estado).

**2 · Repo — ff-only recusou, stash NOMEADO** ⚠️ *pendente do dono*

O `pull --ff-only` abortou por 8 ficheiros locais. Guardados em:

```
stash@{0}: On main: mac-checkup-v1494: WIP local cockpit/runner pre-pull (2026-08-24)
```

9 ficheiros, +294/−34: `package.json` · `moo-pilot-shell.html` · `runner/{f10-server,fleet-beacon,fleet-beacon.test,moo-runner,self-check,self-check.test}.mjs` · `sync-device.mjs`. Divergem a sério do alvo (ex.: `fleet-beacon.mjs` a 400 linhas de diff), por isso **não presumi que fossem lixo superado** — ficam intactos até o Paulo decidir. Untracked (`_handoff/*.command`, `fleet-remoto.mjs`, `packages/mooter-bridge/package-lock.json`) não colidiam com o alvo e nem foram tocados.

Pull feito: `70597e5e` → **`15280a66`**.

*Nota de rigor:* a tag `v1.49.4` aponta para `e3c4637c`, **não** para `15280a66`. O `15280a66` é o `origin/main` e o commit chama-se "a versão lidera a tag (#348)" — a tag está atrás de propósito. O alvo pedido era o sha, e é esse que está carregado.

**3 · Loop relançado no código novo** — via o circuito do próprio Paulo (`_handoff/3-REINICIAR-COCKPIT.command`: SIGTERM ao `runner.lock`, kill do `:4290`, `launch.mjs --no-open`). Nunca `/play` nem `//stop`.

Processos de sexta 11:00 (runner 74113, f10 74108, código pré-pull) mortos → **f10 32033 · runner 32038**.

**Prova de fecho — os dois critérios, medidos no beacon:**

| Critério | Medido | ✅ |
|---|---|---|
| `sig` HMAC | `alg: "HMAC-SHA256-v1"`, nonce `fce7298a…`, mac `094a8721…` | ✅ (era ❌ às 11:41Z — veio nos 25 commits, como se suspeitava) |
| `sha_carregado` = `sha_disco` | ambos **`15280a66c278`** · `desactualizado: false` · = `git rev-parse HEAD` | ✅ |
| Conector | `instalado 1.49.4` = `repo 1.49.4` (o checkout deixou de declarar 1.49.3) | ✅ |

`launch.mjs --status`: Ollama vivo · endpoint vivo · loop vivo · STOP levantado. O item "beacon por empurrar" desapareceu da lista de gestos.

**Estado a seguir, para o Paulo:**
- ⚠️ `stash@{0}` no `frugal` à espera de decisão (ver §2).
- O loop arrancou **em pausa**: `"human queue full (524/6) — pause generation"`. É o disjuntor, não avaria — mas os **1054 achados por triar** continuam a ser o gargalo real e agora bloqueiam geração nova.
- Vault com 2 `autostash` órfãos (`stash@{0}`/`{1}`), ambos só com o `index.json` derivado. Zero valor; deixei-os por não destruir nada sem ordem.
- A quarta reincidência do `index.json` continua possível: a protecção durável que o `e7f99d6` pede — um **pre-commit hook no vault** que recuse indexar o caminho — ainda não existe.
- Gestos ainda por fazer (do `--status`): projecto activo divergente (`cowork-session.json` ≠ `sessoes/mooter.json`) e `preferences.json` em falta.

## Verificação + vigia da frota (Cowork mac-mini, 15:47Z)

| # | Check | ✅/❌ | Fonte |
|---|---|---|---|
| 1 | darwin + conector 1.49.4 | ✅ ambos (15:47:25Z) | get_device_info · mooter_setup ver |
| 2a | Beacon fresco e **assinado** | ✅ ts 15:47:12Z (17 s!) · `sig` **Ed25519-v1**, kid `bb8ed09958167518`, nonce+mac presentes | 50-fleet/mac-mini-de-paulo.json |
| 2b | sha código = disco | ✅ `codigo.sha_carregado` = `sha_disco` = `071cf58dd5db` = `git rev-parse HEAD` · repo **0 atrás** de origin (CC puxou) · conector repo 1.49.4 = instalado | beacon + git só leitura |
| 2c | Painel :4290 | ✅ pintando; header "holding — human queue full (524/6) — pause generation" · 726 triados · needs-your-hand caiu para 2 itens (projecto activo, preferences) | screenshot Chrome |
| 3 | Matrícula | ✅ `trusted-devices.json` v1 tem mac-mini-de-paulo, **Ed25519-v1**, kid = o mesmo do beacon, inscrito 13:36:11Z | 50-fleet/trusted-devices.json |
| 4 | Frota 2/2 | 🔜 **aguardando o PC** — só 1 device inscrito. Vigia armada: re-checo a 2ª linha periodicamente; quando aparecer (ou o Paulo avisar), corro `_handoff/operar/4-VERIFICAR-FROTA.command` (Finder, click-only) e exijo 2 aceites · 0 rejeitados · prova_frota TRUE | trusted-devices.json |

Notas: vault destravado ✅ (`main...origin/main` sem behind; último commit 15:43Z beacon) — o canal vault→PC voltou. ⚠️ Loop em **pausa deliberada** desde 14:01:47Z: fila humana cheia (524 achados vs limiar 6) — gate de design, destrava triando, não é falha. L2 segue locked (keep-rate 0% vs barra 70%).

## PROVA DA FROTA 2/2 — vigia disparou (Cowork mac-mini, 20:35–20:40Z)

A vigia detectou a 2ª linha em `trusted-devices.json` às 20:38Z (check anterior, 16:16Z: só 1) e correu `operar/4-VERIFICAR-FROTA.command` pelo circuito Finder+duplo-clique (log +1.376 bytes, 7.703→9.079).

| Critério | Medido | ✅/❌ |
|---|---|---|
| 2 aceites | frota = **mac-mini-de-paulo** (self, via disco, vivo 18s, `autenticidade {ok:true, ancora:"registo"}`) + **desktop-j26409q** (win32, via remoto, ts 20:33:20Z, running true, `autenticidade {ok:true, ancora:"registo"}`) | ✅ |
| 0 rejeitados | `"rejeitados":[]` no fleet.json | ✅ |
| prova_frota TRUE | `"prova_frota":true` (campo literal do /fleet.json, lido via Chrome) | ✅ |

Paridade fechada: **mesmo sha nos dois devices** (`071cf58dd5db`), conector do Mac 1.49.4 = repo 1.49.4; PC `conector n/d` no beacon (campo ainda não publicado de lá — cosmético). Vault a fluir nos 2 sentidos: commits `beacon desktop-j26409q` 17:23 -03 e `beacon mac-mini` 17:26 -03, origin/main 17:33 -03. Cockpit do Mac: runner vivo PID 76459 (relançado ~14h via reiniciar-cockpit, log 14:02), :4290 vivo (PID 76454), STOP levantado.

Pendências que a prova NÃO cobre (inalteradas): loop em pausa por fila humana (524/6, desde 14:01Z; triagem: 0 aceites · 726 descartados "instrumento-nao-discrimina" · 328 por triar) · decisões do masterprompt CC (`_handoff/MASTERPROMPT-CC-MAC-2026-08-24.md`, ainda untracked no repo). Vigia da frota: missão cumprida, **encerrada** (sem reagendamento).

## Auditoria de harmonia da frota (Cowork mac-mini, 20:41Z, a pedido do Paulo)

Verde: prova_frota true · rejeitados [] · 2 devices matriculados com kids distintos (mac bb8ed099…, PC 1ec7458f…) · mesmo sha nos dois (071cf58dd5db, carregado=disco) · ambos assinados Ed25519-v1 com âncora no registo · vault a alternar commits mac/PC de ~10 em 10 min (último 17:36 -03) · painel do Mac vivo mapeando o PC.

Assimetrias/gaps encontrados (nenhum quebra a frota):
1. **RELATÓRIO WINDOWS ausente** no doc do Project — o PC trabalhou (inscrição 16:12:38Z, pull, beacon assinado) mas nunca reportou; passo 6 do masterprompt por cumprir.
2. **Limiar da fila divergente**: Mac pausa a 6 (fila 524, desde 14:01Z) · PC pausa a 50 (fila 219, desde 16:39Z) — se 50 é o pretendido, o Mac está com limiar default; alinhar = CC.
3. **Beacon do PC com `conector: null`** → painel mostra n/d (Mac publica 1.49.4/1.49.4) — cosmético, verificar no PC porque o publicador não acha o registo do Claude Desktop.
4. PC oscila vivo↔stale no painel do Mac (538s no momento) — latência do canal vault (~10 min), por desenho, não falha.
5. Journal untracked no vault (`2026-08-21-frota-2-2-mac-no-release-pc-provado.md`) à espera de commit (CC).
6. `engine: n/d` e `pilar_atual: null` nos dois — consistente com a pausa; ambos os loops à espera da triagem do Paulo (GPU 10%/0%).

Veredito: **em harmonia** — mesma versão, mesma prova, mesmo estado (pausados pelo mesmo gate humano). O que falta é reporte (1), configuração (2,3) e triagem — nada de sincronização.
===== gauntlet =====
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-01-2026-08-01-conselho-c-level-gauntlet-a-15-rota-para-receita.md
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-15-f11-fila-de-aprovacao-do-meo-no-moo-vigia-device-como-funcio.md
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-02-push-do-gauntlet-v6-6-commits-e-porque-um-ficou-de-fora.md
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/20-decisions/2026-08-01-2026-08-01-auto-melhoria-ace-gepa-sobre-o-gauntlet-nao-lora-.md
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/30-learnings/2026-08-19-o-gauntlet-apanhou-me-a-mim-como-declarei-duas-waves-fechada.md
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/30-learnings/2026-08-02-o-gauntlet-foi-commitado-a-violar-se-a-si-proprio-e-o-que-a-.md
/sessions/rcw-01a3xbbkqcme44zz79eexymb/mnt/paulo-vault/30-learnings/2026-08-16-moo-pilot-v3-design-e-gauntlet.md
