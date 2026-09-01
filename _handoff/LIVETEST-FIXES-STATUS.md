# PONTO DE SITUAÇÃO — os 4 achados do live test (2026-09-01)

**STATE** · entregue, em revisão. PR **#477** aberto, **NÃO fundido** (o merge é do dono).
**WHERE** · worktree `/Users/pauloloureiro_mac_mini/frugal` · branch `livetest-fixes` @ `8a25b81b` · 4 commits sobre `18e8c128` · empurrado ✓
**GATE** · `classify.js` sha `427d8c0b…4bc48f` **intacto** · **15/15 checks verdes** no #477 (inclui `cockpit tests (windows)` e `o portão do design`)

---

## O que se fez, achado a achado

### A1 · O Ledger mentia sobre o `gh` — **corrigido**

O `/ledger` dizia `n/d — o gh nao esta instalado nesta maquina`. Estava instalado.
A diferença não era a máquina, era o **processo**: o F10 corre sob launchd, com
`PATH=/usr/bin:/bin:/usr/sbin:/sbin`.

**A hipótese do kickoff está parcialmente refutada.** Ele apontava para os caminhos do
Homebrew. Neste Mac o `gh` está em `~/.local/bin` — **não** em `/opt/homebrew/bin` nem em
`/usr/local/bin`. Um `EnvironmentVariables/PATH` "com os caminhos do Homebrew" teria passado
em revisão e **não** teria corrigido a máquina onde o defeito foi medido.

Correcção em código: `tools/cockpit/runner/gh-bin.mjs` procura no PATH e nos sítios habituais
e **não executa nada** para o fazer (`which`/`where` precisam do PATH que falta). Cobre
launchd, cron, container de CI e o LaunchAgent que ainda não existe. O molde do plist passa a
explicar, no sítio onde se procura, porque não tem PATH.

A mensagem — a metade pior — passa a ter **duas saídas distintas e testadas**: não-encontrado
(diz o PATH do processo, quantos caminhos procurou, e admite as duas hipóteses) e
encontrado-fora-do-PATH (usa-o e publica `gh_fonte`).

Dois efeitos colaterais fechados no caminho:
- `nd-check.mjs` tinha o mesmo defeito pelo mesmo motivo (também corre sob launchd). Ali não
  havia mentira, havia **silêncio**: a issue nunca se abria.
- O caminho resolvido **é** o nome do dono, e este payload acaba num HTML que se envia a
  terceiros. Publica-se a **fonte**, nunca o caminho; as mensagens de erro passam por
  `redigirCasa()`. Dois testes guardam-no.

### A3 · O F10 não respondia a HEAD — **corrigido**

*Nota de rigor:* o kickoff dizia "devolve vazio, nenhum header". **Medido: devolve 404 com
cabeçalhos.** A consequência é a mesma — o probe lê morto — mas a causa é outra, e a diferença
importa para quem for procurar isto no código.

Uma linha (`metodo = req.method === 'HEAD' ? 'GET' : req.method`) e não um ramo por rota: um
HEAD que responda a um subconjunto das rotas GET é o mesmo defeito outra vez, e a rota
seguinte nasceria descoberta. O corpo é suprimido pelo próprio Node, portanto os cabeçalhos
saem idênticos, `Content-Length` incluído.

O custo fica dito: `HEAD /ledger` reconstrói o Ledger, tal como o GET. É o preço de não mentir
no `Content-Length`, e é o preço que essa rota já documenta pagar a cada pedido.

Quatro testes, e dois atacam a correcção e não o sintoma: **todas** as 9 rotas GET respondem,
e `/stop` · `/play` · `/assist` · `/triage` **não** ganharam HEAD (uma escrita alcançável por
um método de leitura seria trocar um defeito por um pior).

### A2 · «rebuild this page» não agia — **corrigido, e metade da queixa refutada**

Ao vivo, o gesto certo já existia sem nome: o `/ledger` reconstrói-se a cada pedido, portanto
**recarregar É a reconstrução**. Um controlo, dois modos declarados: ao vivo age; carimbado
copia — e o rótulo diz qual dos dois, porque não há device do outro lado.

**Refutado:** o comando copiado **já era completo**. O kickoff dizia ser preciso
`MOOTER_HOME=… VAULT_PATH=… MOOTER_DEVICE_NAME=… GIT_OPTIONAL_LOCKS=0`. Medido:

```
$ env -i PATH=/usr/bin:/bin HOME=$HOME node …/build-ledger-snapshot.mjs --json
{"generated_at":"…","device":"mac-mini-de-paulo","window":{"lines":6112,…
```

`MOOTER_HOME` cai em `~/.mooter`; `VAULT_PATH` ausente dá uma frota sem remotos — documentado,
não avaria. Encher a linha de variáveis desnecessárias faria parecer frágil um script que não
é. O que estava errado era o **rótulo**.

### A4 · `user n/d` — **corrigido, com uma decisão para o dono rever**

A causa é concreta e verificável: o batimento de um device **não transporta campo de
utilizador nenhum** — `writeBeacon` nunca o escreve e `readBeacons` nunca o lê. Não é
"multi-user ainda não medido": é um campo que não existe. O rótulo passa a dizê-lo, com o
porquê no tooltip.

**NÃO se inventou um** — e a escolha é discutível, por isso fica explícita. Havia um
identificador real à mão (`os.userInfo().username`) e ficou de fora por duas razões: (1) esta
página envia-se a terceiros e um nome de conta é **conteúdo**, que é a regra que o `ci-prs.mjs`
já impõe em maiúsculas; (2) a conta que corre um processo não é a mesma coisa que um dono
declarado — usá-la seria responder à pergunta errada com confiança a mais.

> **DECISÃO PENDENTE (dono):** se quiseres um dono declarado no Ledger, o gesto é
> **declará-lo** — um campo novo no batimento, opt-in — nunca deduzi-lo da conta do SO.
> Enquanto não existir, `user n/d` é permanente **por desenho**, e agora diz porquê.

### Bónus não pedido: a bancada cresceu

O `domDeBolso` deitava fora os ouvintes (`addEventListener: () => {}`), portanto só se
conseguia afirmar o que a casca **desenha** — e A2 era sobre o que ela **faz**. Passa a
guardá-los e a expor `disparar()`, com `alvoQueCasa()` para o `closest()`. Os testes de A2
clicam a sério e contam recargas e cópias. É a peça que sobrevive a estes quatro achados.

---

## Prova

| Portão | Resultado |
|---|---|
| `npm run test:cockpit-runner` | **1305 testes · 0 falhas** (2 todo) |
| `ci-prs.test.mjs` | 22/22 (eram 14) |
| `smoke.test.mjs` | 30/30 (eram 26), duas corridas seguidas |
| `build-ledger-snapshot.test.mjs` | 41/41 (eram 35) |
| `faixa-operate.test.mjs` | 13/13 |
| `npm run design:check` | **10.00 / 10** |
| `plutil -lint` no molde do plist | OK |
| CI do #477 | **15/15 verdes** |

**Ponta a ponta**, num F10 real levantado com o PATH exacto do launchd (porta 4297, para não
tocar no do dono):

```
$ curl -sI http://127.0.0.1:4297/ledger
HTTP/1.1 200 OK
Content-Length: 117008
X-Moo-Ledger-Shell: 4.2.0

"ci_prs":{"disponivel":true,"gh_fonte":"fora-do-PATH","prs_abertos":30,…,"ci":{"janela":20,"verdes":20}}
```

Antes, o mesmo comando: `HTTP/1.1 404` e `"o gh nao esta instalado nesta maquina"`.

---

## Guardrails — o que NÃO foi tocado

- `classify.js` **intacto** (sha conferido acima).
- Nenhum `/play`, nenhum `/stop`. O F10 do dono na **4290 ficou vivo o tempo todo** — a prova
  correu na 4297 e o processo foi morto no fim.
- A suite do router **não** correu (pendura em `tools/verify/render_medir.test.js`).
- Vault: só leitura. `git add` selectivo (9 ficheiros nomeados). Nunca `--admin`.
- **Não fundido.** O merge é do dono.

## Pré-existente, não introduzido aqui

- `npm run test:design` falha **2/113** (`moo-tokens-build ESCREVE quando corrido` e
  `--ci sai 1 abaixo do limiar`). Confirmado em worktree limpo sobre `18e8c128`: **as mesmas
  duas, mesmo número**. Não bloqueia — o job `o portão do design` do CI é o `design:check`,
  que dá 10.00.
- `npm run sync:cockpit:check` reprova (`3/67 em dia`). O espelho `~/.mooter/cockpit/` **não
  existe** nesta máquina, e a própria ferramenta diz que isso está certo para quem corre o
  checkout. Não mexido: espelhar código de um branch por fundir seria pior.

## Nota de processo (erro meu, sem perda)

A meio corri um `git stash` para comparar contra `main`. A árvore estava limpa, portanto o
stash não guardou nada — e o `git stash pop` seguinte **desempilhou um stash antigo**
(`mac-checkup-v1494`, de 2026-08-24), gerando conflitos em 9 ficheiros que eu não tinha
tocado. Desfeito com `git reset --hard HEAD`; **o stash antigo continua intacto em
`stash@{0}`** e nenhum dos meus commits foi afectado. A comparação com `main` passou a
fazer-se como devia ser: `git worktree add --detach` sobre `18e8c128`.

## Próximo passo

1. Rever e fundir o **#477** (gesto do dono).
2. Depois do merge, `launchctl kickstart -k gui/$(id -u)/ai.mooter.f10` para o F10 da 4290
   passar a correr o código novo — é o único sítio onde estas quatro correcções ainda não
   estão a servir.
3. Responder à decisão pendente do A4 (dono declarado: declarar ou deixar `n/d`).

*O kickoff (`_handoff/KICKOFF-LIVETEST-FIXES.md`) nunca esteve em git, portanto o arquivo que o
`AGENTS.md` § Information architecture pede é um gesto sobre um ficheiro por versionar — fica
para o dono, com o resto do `_handoff/` por commitar.*
