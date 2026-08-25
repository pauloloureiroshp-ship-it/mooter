# Mooter v1.4.2 — caminhos canónicos, guarda do bundle, saída da recusa

**Data:** 2026-07-25 (noite) · **Estado:** código escrito, 13 suites verdes em Linux,
gate no Windows a correr no momento em que isto foi escrito.
**Sem push. Sem merge. Sem apagar nada.** O commit é local e selectivo.

---

## 1. O bug que fechou (e porque era invisível)

Em Windows, o mesmo sítio no disco tem duas grafias:

| Fonte | O que devolve |
|---|---|
| `os.tmpdir()` | `C:\Users\PAULOL~1\AppData\Local\Temp` (forma curta 8.3) |
| `git worktree list` | `C:\Users\Paulo Loureiro\...` (forma longa) |
| `path.resolve()` | **não normaliza entre as duas** |

Consequências medidas, não supostas:

- o guard recusava worktrees legítimas com `worktree fora da raiz permitida`
- `isTemp()` não reconhecia o temp → o picker relocalizava sem razão
- 3 suites falhavam no Windows por motivos que nada tinham a ver com o código
  que testavam; os asserts passavam e o processo morria com `exit 124`

**Fix:** `packages/mooter-bridge/paths.js` — `canon()` via `fs.realpathSync.native()`
(resolve 8.3, junctions e symlinks), `mesmo()`, `dentroDe()` e `chave()`.

Ligado em quatro sítios:

| Ficheiro | Onde | Porquê |
|---|---|---|
| `seamless.js` | `guardCheck()`, `activeJobsByWorktree()` | o guard deixa de recusar o que é legítimo |
| `worktrees.js` | `isTemp()`, `list().is_main`, `firstFree()` | o picker deixa de fugir do temp real |
| `fleet.js` | `norm()` | o painel deixa de perder o match por grafia |
| `context.js` | `resolverDentro()` | o traversal continua bloqueado, agora à prova de 8.3 |

`canon()` é estrito (para guards). `chave()` é tolerante (para caminhos vindos de
ficheiros escritos por outros processos, que podem nem existir). A distinção é
deliberada: **um guard que perdoa não é um guard.**

Extra: `.unref()` nos timers longos. O timeout de um job é de dezenas de minutos e
prendia o event loop — era essa a causa do `exit 124` depois de todos os asserts
passarem.

---

## 2. A guarda que impede a próxima release partida

`paths.js` quase saiu de fora do `.mcpb`. Se tivesse saído: repo com 13 suites
verdes, conector instalado a morrer no primeiro `require`, e o Cowork a dizer
apenas *"o servidor falhou"*.

`pack-mcpb.mjs` passa a ler os `require('./x.js')` de cada ficheiro empacotado e
**recusa o build** se algum não estiver na lista. `bundle.test.js` (5 testes) trava
a mesma regra no repo, mais:

- a versão anunciada ao host vem do `manifest.json`, nunca de uma string colada
  (a v1.4.2 chegou a anunciar-se como 1.4.1 — um conector que mente sobre a
  própria versão torna impossível responder a *"é esta a build que instalei?"*)
- o manifest e as 6 portas públicas do servidor têm de bater certo

---

## 3. O que a validação ao vivo apanhou (bug novo, já corrigido)

Com o gate a correr, despachei em paralelo um job **local ($0)** a pedir o resumo de
`telemetry.js` na pasta `frugal-w2` — onde esse ficheiro não existe naquela branch.

O que aconteceu, literalmente:

> `NAO CONSEGUI LER` … seguido de cinco bullets a descrever uma função
> **`emitTelemetry`** que não existe em ficheiro nenhum.

O modelo obedeceu à instrução **e inventou a seguir**. É a prova prática de que a
honestidade não pode ser delegada ao modelo — tem de estar no conector.

A v1.4.2 já recusa este despacho. O que faltava era a **saída**: recusar sem dizer
onde o ficheiro está obriga a adivinhar entre 37 pastas. Agora a recusa traz
`onde_existe` — as pastas que têm mesmo o ficheiro, com caminho pronto a usar e a
marca de ocupada quando é o caso (`worktrees.comOsFicheiros`, 3 testes novos).

---

## 3b. O que o gate na máquina real apanhou (e o fix estava errado)

O gate `mooter-v142-gate` correu em Windows e devolveu **4 suites vermelhas**. Não era
ruído — era o fix a falhar no caso que interessa.

**`fs.realpathSync.native()` só resolve caminhos que EXISTEM.** A primeira versão do
`canon()` caía para `path.resolve()` quando o caminho não existia — e `path.resolve`
não normaliza 8.3. Ou seja: falhava exactamente no caso do guard (worktree ainda por
criar) e do `context.js` (ficheiro citado que pode não existir). O `paths.test.js T3`
apanhou-o:

```
assert.ok(P.dentroDe(path.join(d, 'sub', 'f.js'), os.tmpdir()))  →  false
```

**Correcção:** resolver o **ancestral mais próximo que existe** e colar o resto por
cima; e não guardar em cache o que ainda não existe (um caminho por criar muda de
resposta assim que passa a existir). Teste T9 reproduz a mesma classe com um symlink,
e por isso corre em qualquer sistema.

### As outras três eram falta de hermeticidade

| Suite | Porque falhava só no Windows |
|---|---|
| `path.test.js`, `ondaA.test.js` | faziam `delete OLLAMA_HOST` → o código cai para `127.0.0.1:11434`, que na tua máquina **tem daemon**. Assumiam "sem GPU" e encontraram uma. Agora apontam para porta morta. |
| `path.test.js` (T3, T4) | `await wait(300)` entre despachos. Numa máquina mais lenta o job anterior ainda vive e o WIP guard recusa — o guard estava certo, a suite é que adivinhava. Agora espera pelo **facto**: a worktree ficar livre. |
| `worktrees.test.js` | comparava caminhos com `path.resolve` — **o próprio erro que o módulo corrige**. |

> Uma suite cujo resultado depende de haver GPU ligada não é um gate.

## 3c. O tier local estava preso a 3B — e não por escolha

Os 4 jobs locais do dia correram todos em `qwen2.5:3b`. Não por ser o melhor: por estar
carregado. `pickModel` devolvia o primeiro residente sem olhar ao tamanho, e daí sai um
ciclo fechado:

> modelo pequeno é carregado → fica residente → ganha a regra 1 → volta a ser carregado
> → nunca há motivo para carregar um maior

Numa 4090 com 19 GB livres. Agora o residente só ganha se tiver **≥70%** do tamanho do
maior que cabe na VRAM livre, e a escolha vai com o `porque` para o ledger
(`local_model_chosen`) e para o painel. Carregar um modelo maior custa segundos; usar um
3B para trabalho a sério custa uma resposta errada.

## 4. Estado dos números

| Item | Valor |
|---|---|
| Suites | **13 verdes · 0 vermelhas · 0 intermitentes**, em Linux **e** no Windows real |
| Prova do 8.3 | `SAO_DIFERENTES=true` · comparação antiga **false** · `dentroDe` **true** · traversal continua bloqueado |
| Bundle | 19 ficheiros · versão anunciada = **1.4.2** (verificada por handshake) |
| sha256 do `.mcpb` | `541b92ade1ab67ce557823e66415ad53c90f2a43290399bae428fb21396b1853` |
| Commits locais | `9a4d190` (12 ficheiros) + `f753f05` (9 ficheiros) — **todos** dentro de `packages/mooter-bridge/`, zero intrusos, **sem push** |
| Verificação | commits, conteúdo e sha256 reconferidos por mim, não só pelo relatório do job |
| Custo do gate | $2.98 + $1.85 (sonnet) · o dia inteiro ficou em ~$10.8 |
| Quota local | 5 de 17 jobs · `local_share` continua baixa — ver §6 |

**Nota de método:** o gate correu **duas vezes** as suites `path.test.js` e
`ondaA.test.js`, seguidas, para distinguir "verde" de "verde por sorte". Saídas
idênticas nas duas passagens.

---

## 5. Para amanhã, por ordem

1. **Reinstalar o conector** — o `.mcpb` instalado é a v1.4.1 e **não tem** nem o
   `paths.js` nem a recusa com saída. Enquanto não for reinstalado, nada disto
   está a correr na tua máquina.
2. Rever o diff dos dois commits antes de qualquer push. Continua a haver >1000
   ficheiros não rastreados na árvore: `git add -A` continua proibido.
3. Medir o tier local **com um modelo maior**. O picker já deixa de ficar preso ao
   residente, mas a máquina só tem um 3B carregado — puxa um modelo de 8–14B e
   volta a correr o mesmo pedido para ver se a resposta muda de qualidade.
4. Onda C — Tasks Extension. A spec final do MCP sai a **2026-07-28**, daqui a 3
   dias. `mooter_check` já faz o papel do handle explícito; falta a via nativa,
   atrás de detecção de capability.

---

## 6. O que continua por resolver (dito, não escondido)

- **`local_share` baixa.** O router local-first existe, mas o modelo residente é
  `qwen2.5:3b` — pequeno de mais para trabalho a sério. Vale a pena medir com um
  modelo maior antes de dizer que o tier local funciona.
- **Codex sem custo reportado.** O CLI não devolve `total_cost_usd`; o ledger
  guarda `null` e o painel diz `n/d`. Está certo assim, mas o custo real do Codex
  continua fora da contabilidade.
- **`sessions_fresh: false`.** O painel apresenta sessões em cache quando o
  listador demora; está marcado, mas é uma fonte de confusão à espera de acontecer.
