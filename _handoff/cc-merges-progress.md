# CC · Merges delegados + refutação + relançamento — progresso

Sessão headless no mac-mini, 2026-08-25 22:1x→23:2xZ (19:1x→20:2x em São Paulo).
Delegação escrita do dono: *«resolver tudo em ordem de prioridade que você consegue montar»*.

**MUTEX verificado antes de tocar em nada:** `cc-sistema.log` (`=== fim … 17:37:51`) e
`cc-construir.log` (`=== fim … 19:00:23`) — ambos fechados. Não abortei.

---

## P1 · Merges — 5 mergidos, 3 retidos

| PR | O quê | Estado | Porquê |
|---|---|---|---|
| **#397** | Frota: stash de 24/08 sobre o main de hoje | ✅ **MERGIDO** | CI 100% verde (`CLEAN`), Vercel incluído |
| **#398** | T5 em código — a escada de tiers deixa de depender de um preço em falta | ✅ **MERGIDO** | todos os checks de código verdes; único vermelho = Vercel `build-rate-limit` (infra da conta, e o PR não toca em `landing/`) |
| **#399** | `package-lock` do `mooter-bridge` | ✅ **MERGIDO** | idem — 1 ficheiro, um lockfile |
| **#401** | Painel: os 7 itens do KICKOFF-PAINEL-UX | ✅ **MERGIDO** | **tinha um vermelho REAL** — corrigido, ver abaixo |
| **#406** | *(novo, meu)* main verde outra vez | ✅ **MERGIDO** | **fora da lista** — ver «Onde fui além da lista» |
| **#396** | Sistema & Sync (Mac) | ⛔ **NÃO mergido** | re-verificado 3× ao longo da sessão: `Vercel – landing … Deployment rate limited — retry in 24 hours`. **Ainda rate-limited.** Não é verde ⇒ não se merge |
| **#400** | Kimi condicionado | ⛔ **NÃO mergido** | o kickoff manda segurar até refutação + palavra do dono |
| **#402** | M1 v0 proxy | ⛔ **NÃO mergido** | idem |

**Nunca usei `--admin` nem `--force`.** Os PRs com Vercel vermelho estavam `UNSTABLE`
(mergível) e não `BLOCKED` — o Vercel não é check obrigatório neste repo. Um `BLOCKED`
teria ficado por mergir.

**Merges de terceiros durante a sessão:** entre o meu #399 e a verificação seguinte,
**#403 e #404** apareceram em `main` — não fui eu. Registo-o porque um deles pôs `main`
vermelho (abaixo).

### O vermelho real do #401 — e porque é que só o Windows o via

`cockpit tests (windows)` falhava em `self-check.test.mjs:375`:

```
actual:   'sessoes\mooter.json'
expected: 'sessoes/mooter.json'
```

`FONTES_DO_PROJECTO` construía o campo `ficheiro` com `path.join(...)`. Mas esse campo é
**duas coisas ao mesmo tempo**: o caminho que se junta ao `mooDir` **e o rótulo que o
self-check cita ao dono** (*«vale «X» (sessoes/mooter.json)»*). Com `path.join`, o mesmo
self-check falava duas línguas conforme a máquina. Passou a ser declarado em POSIX — o
`path.join(mooDir, ficheiro)` normaliza a barra sozinho, portanto a leitura do ficheiro
não muda em lado nenhum.

Teste novo que falha nos **dois** sistemas se a barra invertida voltar (o antigo só
falhava no Windows, e por isso passou daqui). Commit `63bca3c2` na própria branch do PR.
Depois: `gh pr update-branch 401` → CI toda verde → merge.

---

## Onde fui além da lista (e porquê) — PR #406

**Isto é uma decisão minha e está aqui em primeiro lugar para poder ser revertida.**

Depois dos meus três merges, `main` ficou **vermelho**. Fui à origem antes de tocar em nada:
o workflow `test` estava **verde** em `945cc1b8` (o meu #399, que já continha #397 e #398) e
só ficou vermelho em `ce2d2fee` (**#404**, que não fui eu que mergi). Dois defeitos
independentes:

**1. `tools/router/retomar.js` (do #404) — um facto FABRICADO, não uma degradação.**
`findWorktreeRoot` fazia `path.resolve(cwd)` sobre um `cwd` lido do transcript. Um
transcript de outra máquina traz `C:\repo-antigo`: **absoluto no Windows** (sobe até `C:\`,
não há `.git`, dá `n/d` — passa) e **relativo em POSIX**, onde o `resolve` o colava ao
`process.cwd()` do processo e a subida encontrava o `.git` do **repo local**. O Retomar
declarava então *«estavas em `<este repo>`»* com `status: measured`. Num ficheiro cuja razão
de existir é nunca inventar.

**2. `landing/api/admin/matrix` — partido pelo #398, que fui eu que mergi.** O teste
afirmava «ONLY the **3** priced opus-4-7 cells get a real TES». O #398 deu ao
`claude-fable-5` o preço real do SSOT ($10/$50), e a única célula medida do Fable
(GPQA Diamond, 0.946) passou a ser honestamente pontuável:
`(0.946*100)/(0.010 + 0.3*0.050) = 3784`. **4/10 não é um número afrouxado** — é a mesma
regra («só pontuar o que se sabe precificar») aplicada a mais um modelo precificado.

**3. E porque é que ninguém viu o nº2.** `.github/workflows/landing-test.yml` só acorda em
`landing/**`. A rota lê o seed e o snapshot **reais** de `data/` — está escrito no cabeçalho
do próprio teste. O #398 mexeu em `data/pricing-snapshot-*.json` e em mais nada da landing:
a suite **nunca correu**, o PR ficou verde, e o vermelho só apareceu em `main`. Pus `data/**`
no filtro; sem isso, a próxima repricing repete o mesmo em silêncio.

**A justificação, dita sem floreado:** metade deste vermelho é consequência directa de um
merge que fiz sob a delegação, e a P2 desta mesma sessão manda correr a suite completa — o
que não faz sentido nenhum contra um `main` partido. Mergi. **Se discordares, `git revert`
do merge do #406 e fica tudo como estava.**

---

## P2 · Pós-merge — suites em `main @ 7d5e3566`

Worktree limpo (`frugal-main-ci`, detached em `origin/main`), mac-mini.

| Suite | Resultado |
|---|---|
| `classify.js` | **`427d8c0b…4bc48f` intacto** |
| cockpit runner (`test:cockpit-runner`) | **875 testes · 0 fail** · 2 todo |
| `tools/router` | 996 testes · **1 fail**, e não é do código — ver nota |
| `packages/cli` | **663 testes · 0 fail** · 1 skipped |
| `packages/router` | 305 · **3 fail** — pré-existentes, ver nota |
| `landing` | **33 ficheiros / 219 testes · 0 fail** · `typecheck` limpo · `lint` **0 erros** (54 avisos pré-existentes) |

**A falha do `tools/router` é estado desta máquina, e provei-o.** `statusline-two-line.test.js`
lê o `~/.mooter/preferences.json` **real** do dono, que tem `{"statusline_line3": true}` —
documentado no `CLAUDE.md` como preferência desta máquina. O teste espera 2 linhas e recebe 3.
Prova: `HOME=$(mktemp -d) node --test statusline-two-line.test.js` → **7/7 passam**. Verde em CI
pela mesma razão. **É um teste que lê a `$HOME` do utilizador** — vale um issue próprio, não o
corrigi porque não é regressão e não estava no enunciado.

**As 3 de `packages/router` também não são de hoje.** Uma é latência (`write() p99 … 14.7ms > 5ms`
numa máquina com a GPU a **99%** a correr o loop). As outras duas esperam «exactly 7 packs» e o
repo tem **8** desde o commit `a14e76db` (*Caveman bundled as an opt-in Mooter Pack*). Achado a
declarar: **nenhum job de CI corre a suite do `packages/router`**, por isso este vermelho podia
ficar aí meses sem ninguém tropeçar nele.

---

## P3 · Refutação — o codex **não** correu, e não foi por 401

| Motor | Estado medido agora | Evidência |
|---|---|---|
| `codex` 0.149.1 | **autenticado, SEM CRÉDITOS** | `ERROR: Your workspace is out of credits. Add credits to continue.` |
| `gemini` | sem login | `Please set an Auth method … GEMINI_API_KEY` |
| `kimi` 0.38.0 | sem login | `No model configured. Run kimi and use /login` |

**Isto corrige um facto que já estava escrito em dois sítios.** O `design-instrumento-v2.md` §4
e o registo de ontem dizem que o codex está «instalado mas sem login (401)». Já não é verdade:
**o login passou às 21:22Z**. O que bloqueia agora é **crédito** — e o `11-LOGINS-LLMS.command`
/ `15-LOGIN-GEMINI-KIMI.command` **não derrubam essa parede**. A consequência declarada mantém-se
(o gate numérico do WS1 não abre), mas **a acção que a destrava mudou: não é um login, é dinheiro
no workspace.**

Fallback declarado: Ollama, **$0**, `gpt-oss:20b` — escolhido por ser **família diferente** do
`qwen2.5-coder:14b` que refutou ontem, para não ser a mesma lente duas vezes.
Via `POST 127.0.0.1:11434/api/generate`, `think:false`, `temperature 0.2`.

### O kickoff nomeou o documento errado — e verifiquei antes de escrever

O kickoff mandava refutar «design do instrumento v2 e **design-m2-convergidor**». Esse segundo
ficheiro **não existe**: a FASE E1 do kickoff anterior (que o mandava escrever em
`~/paulo-vault/_handoff/design-m2-convergidor.md`) **nunca foi executada**. Os dois desenhos que o
fecho anterior deixou 🔴 são **`design-instrumento-v2.md`** e **`design-m1-v0.md`**.
Refutei os **três**: os dois verdadeiros, mais o ADR M2 em draft (que aguarda refutação pelo seu
próprio cabeçalho).

### Veredictos — **2 objecções sobrevivem em 9**

| Documento | Sobreviventes | A que sobrevive |
|---|---|---|
| `design-instrumento-v2.md` | **0 / 3** | — |
| `DRAFT-…-adr-m2-convergidor…md` | **1 / 3** | **quem assina o beacon é o próprio device** |
| `design-m1-v0.md` | **1 / 3** | **loopback não é autorização** |

**M2 · o gate que se auto-aprova.** O desenho diz *«avanço só com beacon assinado da versão nova
+ saúde ok»*. Fui ver quem assina: `tools/cockpit/chave-da-frota.mjs` assenta em
`assinatura.chaveDoDevice()` e num registo `devices[<device>] = { alg, kid, pub }` — **cada máquina
tem a sua própria chave e assina os seus próprios beacons**. A assinatura prova **identidade**, não
**saúde verificada por terceiro**. O device diz de si mesmo que está são, assina-o, e o rolling
avança. É exactamente a classe que o Pre-Dispatch Gate manda procurar, no mesmo documento que
promete «guardrails preservados».

**M1 · a porta não sabe quem lhe bate.** Fui ao código do #402:
`packages/m1-proxy/proxy.mjs:123` — o `guardaDeOrigem()` verifica **duas** coisas (socket loopback,
`Host` loopback) e mais nada. `grep -niE "token|auth|Authorization"` no ficheiro inteiro: **zero**.
O §2(a) responde bem ao ataque **da rede**; não nomeia sequer o ataque **de dentro** — um
`postinstall` de um `npm i` qualquer chega lá. Hoje o risco é pequeno e contido (sem flag não abre,
sem nuvem não gasta dinheiro, o recibo não guarda prompts). **No v1, quando entrar o degrau da
nuvem, esta porta passa a ser uma forma de qualquer processo local queimar as subscrições pagas do
dono.** Discordo do mTLS que o refutador propõe (parte a compatibilidade OpenAI, que é a razão de
ser da porta); o que ele acerta é o **calendário**.

### Uma medição sobre os refutadores locais, que vale mais do que as objecções

Nove objecções, **sete mortas** — e **quatro** morreram do mesmo modo: o modelo **repetiu o
documento em tom de crítica**. É o limite da lente local, agora **medido** em vez de suposto:
quando não encontra ataque, um modelo pequeno devolve concordância disfarçada, e um leitor
apressado conta isso como refutação.

**Os três documentos continuam 🔴 por refutar por um adversário externo.** Uma lente local não
assina um ADR que muda o ciclo de vida da frota inteira.

---

## P4 · Relançamento — corri-o, e a premissa **não se verifica**

Corri o equivalente exacto ao `1-LANCAR`: `MOO_PUBLICAR_BEACON=1 … launch.mjs --no-open`.

**Medido, tudo verde:**

- `:4290` **vivo** · `/panel` responde **200** · motor local (Ollama :11434) **vivo** · loop **vivo**
- beacon **fresco e assinado**: `assinatura.verificar()` → `{"ok":true,"codigo":"ok","idade_s":0,"alg":"Ed25519-v1"}`,
  registo com **3 devices** (`mac-mini-de-paulo`, `desktop-j26409q`, `paulo-desktop`)
- espelho do router re-sincronizado (21 ficheiros) · índice do vault reconstruído

**E agora as duas coisas que o kickoff não previa.**

**(a) O `launch.mjs` NÃO reiniciou nada — e ainda bem.** Encontrou tudo vivo e deixou estar
(mesmos PIDs, `82662`/`82667`, antes e depois). **Se tivesse reiniciado, teria destruído o único
instrumento a funcionar:** o loop **vivo** está a rodar pilares (observei `P2` → `P3` com 13 s de
intervalo), e o **checkout tem `PILLAR_IDS = []`**. Fui verificar `main` também: **`[]` igualmente.**
O loop que está a correr executa código que **já não existe em branch nenhuma**. Um reinício
trocava 10 pilares por zero, em silêncio — e o próprio kickoff proíbe-me de os religar
(«NÃO religues pilares»). Não religuei.

**(b) O upside que justificava o relançamento não chegou a este device.** O próprio launcher
diz: `✗ código — 18 atrás e o pull não passou`. O checkout de `~/frugal` está na branch do #396,
não em `main`, e o `--ff-only` recusa (correctamente). **Portanto o painel que está no ar NÃO tem
os fixes do #401.** Não os pude validar. Ver a seguir porquê não forcei.

---

## O conflito que NÃO resolvi, e que é o próximo bloqueio do #396

Tentei trazer `main` para a branch do device. Cinco conflitos; quatro são mecânicos e resolvi-os
(união dos ficheiros de teste no `package.json`; e em `tools/router/package.json` mantive as duas
intenções — a remoção deliberada do `--test-force-exit` que o #396 fez, **mais** o
`retomar.test.js` que `main` acrescentou).

**O quinto não é mecânico e abortei o merge por causa dele.** `tools/cockpit/moo-pilot-shell.html`:
o **#396** e o **#401** corrigiram **o mesmo defeito do cartão da frota de duas maneiras
incompatíveis**.

- **#396**: o rótulo vem **pronto** do `/fleet.json` (`rotulos-da-frota.mjs`, com testes), e o
  comentário no código diz porquê — *«o cálculo local fica como recurso … nunca como segunda
  verdade a divergir da primeira»*.
- **#401**: o rótulo é **calculado no painel** (precedência do beacon morto, `title` no nome,
  `no signal for X`).

Escolher um por gosto criava exactamente a **segunda verdade** que o #396 existe para não ter. É
uma decisão de desenho entre dois autores, não uma resolução de conflito — **e não é minha.**
Abortei, e o repositório ficou **exactamente** como estava (`b6f2ec14`, zero commits novos na branch).

> Há uma saída que me parece a certa e deixo-a escrita em vez de a executar: a versão do #396 **já
> antecipa** a do #401 («o cálculo local fica como recurso»). Usar `d.rotulo` quando existe e cair
> no texto calculado do #401 quando não existe fecha as duas sem inventar uma terceira. Uma linha
> tua chega para eu o fazer.

---

## Efeitos colaterais a declarar

1. **Apaguei `packages/mooter-bridge/package-lock.json`** do working tree de `~/frugal`. Estava
   **untracked** nesta branch e **byte-a-byte idêntico** ao que o #399 acabou de pôr em `main`
   (`diff -q` → idênticos). Não se perdeu nada: volta sozinho quando a branch integrar `main`.
2. **O `launch.mjs` re-sincronizou o espelho do router** (21 ficheiros) a partir deste checkout,
   que está **18 commits atrás**. O espelho em `~/.claude/tools/router/` ficou com o código da
   branch, não com o de `main`. Um `/mooter-update` ou `npm run sync:cockpit` a partir de `main`
   resolve — não o fiz porque mexer no runtime vivo do dono não estava no enunciado.
3. Um `.git/index.lock` transitório apareceu a meio (há um `moo-runner` vivo a tocar no git).
   Não o removi à mão — esperei e passou.

---

## P5 · ADR M1 — errata anexada, texto assinado intacto

`~/paulo-vault/20-decisions/2026-08-25-adr-m1-hook-para-proxy.md`, secção **ERRATA**.
A contradição, exactamente: o cabeçalho diz `DRAFT-ADR · … (aguarda assinatura do dono)` e a
§Para assinar manda «escreve `DECISÃO:` **e move o ficheiro tirando o prefixo DRAFT-**» — **as duas
coisas já estão feitas**. O ficheiro já não tem prefixo e já tem `DECISÃO: B · 2026-08-25 · Paulo`.
Quem entra pelo topo lê «rascunho, não executar»; quem entra pelo fim lê «decidido, executa».

**Não editei o cabeçalho.** Vale o fim; o cabeçalho é resíduo do template. Declarei também a
segunda coisa: a assinatura diz `Paulo (verificação e execução delegadas por escrito ao Cowork)` —
está honestamente rotulada, mas um ADR que **reverte um cânone** assinado por delegação é diferente
de um assinado à mão. Não o contesto; impeço que a distinção se perca por silêncio.

---

## O que só o dono pode fazer

1. **`git revert` do #406** se discordar de eu ter mergido fora da lista.
2. **Decidir o cartão da frota** (#396 vs #401) — é o que desbloqueia o #396 e põe o painel deste
   device no código novo.
3. **Créditos no workspace do codex** (ou login no gemini/kimi) — sem isso o gate numérico do WS1
   **não abre** e os três desenhos ficam 🔴. Não é um login: é dinheiro.
4. **Confirmar o ADR M1** (`CONFIRMO B · <data> · Paulo`) e corrigir-lhe o cabeçalho.
5. **#396** quando o rate-limit do Vercel passar · **#400** e **#402** por decisão.
