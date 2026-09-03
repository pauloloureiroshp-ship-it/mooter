# MOO PILOT PERFEITO — PONTO DE SITUAÇÃO (append-only)

## 2026-09-03 · Fase C1 retomada · branch `fix/c1-cockpit-rapido-e-honesto`

Retoma da corrida que parou às 09:14 de 02/09 por limite de sessão
(`_handoff/masterprompt-c1.log`). Base: `8b6398b1`.

---

### 0. O achado do conector — confirmado, e a hipótese do kickoff estava certa

O kickoff supunha que o conector a correr não é o código desta branch. **É isso
mesmo, e o confronto é byte a byte, não por etiqueta:**

| | sha256 de `seamless.js` | tem `USER`? | tem `bin-resolver`? | tem `appendMeasured`? |
|---|---|---|---|---|
| instalado (Claude Desktop) | `c7dfb1dd…` | não | não | não |
| repo (`78befc60`+) | `9f0b6501…` | sim | sim | sim |

**E os dois estavam rotulados `1.53.0`.** É o achado do C1.6 a repetir-se em
carne viva: duas etiquetas iguais não provam que o código é o mesmo. O
`mooter_setup` confirma a data: instalado a **2026-09-01T11:46**, ou seja
*antes* dos commits de 02/09 que corrigem as três falhas medidas
(`cc → Not logged in`, `codex/gemini → spawn ENOENT`).

**O que fiz:** bump `1.53.0 → 1.53.1` e reconstruí o bundle.

> ⚠️ **O bump foi um juízo meu, e é a decisão desta sessão que mais merece o teu
> olhar.** O kickoff mandou «gerar um pacote novo do conector com estes fixes».
> Um pacote a 1.53.0 **não é instalável**: `update.js:354` recusa qualquer bundle
> cuja versão não seja *estritamente* maior do que a instalada. O precedente é
> exacto — `72b8e31f`, «1.48.0 → 1.48.1 para o .mcpb do piloto poder instalar».
> Registei os 4 ficheiros na allowlist do `CLAUDE.md`. Se preferires outro
> número, é uma linha em cada um dos quatro.

Artefacto: **`_handoff/mooter-v1531.mcpb`**
· 63 ficheiros · 384 verificações de conteúdo OK · sha256
`2f6363d75eef0acdad5b354b77367ddce672bb871ef92ffe00bb8f44f1faf636`
(reconstruído depois da ronda do adversário — ver §3b)

Verificado dentro do zip: `server/decisions_v2.js`, `server/bin-resolver.js`,
`'USER', 'LOGNAME'` nas `CHILD_ENV_BASE_KEYS`, `server/version.json` a 1.53.1.
E o `mooter_setup(atualizar:'ver')` já o vê: *«há a versão 1.53.1 disponível
(local; tens a 1.53.0)»*.

**Reparação de estrago meu:** a primeira construção sobrescreveu o
`_handoff/mooter-v1530.mcpb` — o artefacto da release publicada. Reconstruí-o a
partir da tag `v1.53.0` e ficou **byte a byte igual ao original**: sha256
`9100e0df…`, o mesmo registado no `CLAUDE.md`, 335 verificações, 61 ficheiros,
1 235 164 bytes — que é o tamanho exacto do ficheiro publicado no GitHub.

---

### 1. O defeito que eu próprio encontrei: os testes escreviam medições **inventadas** no teu corpus

Não estava no kickoff. É a consequência directa do C1.3 e é a coisa mais séria
desta sessão.

`appendMeasured` sem `logPath` resolve para
`~/.claude/tools/router/decisions_v2.jsonl` — **o teu corpus real**, o mesmo que
a métrica-mãe lê. Dois testes do bridge fazem despachos a sério contra motores
de mentira. Cada `npm test` injectava lá **duas linhas rotuladas
`tokens_fonte: 'medido'`**:

```
10/5   qwen2.5:3b  via mooter-moo   ← o stub do Ollama (cadeia-nao-silenciosa.test.js)
100/80 sonnet      via mooter-cc    ← a fixture do v12.test.js:288
```

Medido: 420 linhas no corpus, **4** com `tokens_fonte:'medido'` — **dois pares
idênticos**, um por corrida da suite (02/09 12:13 e 03/09 10:30).
Que nenhuma tenha vindo de um motor a sério **não é demonstrável pelo esquema**
(objecção do adversário — ver §3b); o que está medido é que os valores são
exactamente as fixtures, que aparecem em pares nos timestamps das corridas, e
que redireccionar `MOOTER_CLAUDE_DIR` fez o par de hoje aterrar no temporário.
A mudança escrita para impedir que um número não medido entrasse
no corpus era a única coisa a pôr lá números inventados — e pior que o zero
legado, porque o zero pelo menos não mentia sobre a proveniência.

E não é teórico: o `/saude.json` que corre agora publica
`pct_cobertura: 1, presentes: 4` — **um número construído inteiramente com
fixtures de teste**.

**Corrigido** por `testes-nao-escrevem-no-corpus.cjs`, carregado por `--require`
no `scripts.test` — e não no topo dos dois ficheiros, porque uma lista envelhece
(a lição de 29/08: presença não é cobertura). Redirecciona `MOOTER_CLAUDE_DIR`,
a raiz, para que qualquer escritor futuro nasça coberto. O passo do CI passou de
`node --test` a `npm test`: um portão que corre outro comando não portaria isto.
Medido: **420 linhas antes, 420 depois** de uma suite completa (1182/1182), e
também com `node v12.test.js` corrido à mão.

> **Gesto teu (não toquei):** as 4 linhas continuam no teu ledger e continuam a
> alimentar o painel. São as linhas 415, 416, 419 e 420. Se quiseres limpá-las:
> ```sh
> L=~/.claude/tools/router/decisions_v2.jsonl
> cp "$L" "$L.bak-$(date +%s)"
> grep -v '"reason":"measured from the engine stream (mooter connector)"' "$L.bak"* > "$L"
> ```
> Não o fiz por ser o teu ledger, fora do repo, e append-only.

**Corrigi também uma alegação fabricada no `CLAUDE.md`.** O esboço da entrada do
C1.3 dizia «medido depois: **5/5 despachos com tokens medidos (100%)**». Esse
número não existe em lado nenhum — o corpus tem 4 medições e são as 4 escritas
pelos próprios testes. Substituído por `n/d` com a razão.

---

### 2. Os 8 itens da C1, um a um

| # | Estado | Prova |
|---|---|---|
| C1.1 · cache do ledger | **feito** (sessão anterior, `08431dc8`) | 3,39 s → 0,41 s, com a idade da cache visível |
| C1.2 · Ask vê a página | **feito** (sessão anterior, `8b6398b1`) | — |
| C1.3 · tokens no `decisions_v2` | **feito no código · cobertura viva `n/d`** | `bb37068b` + `43eca1d4`. Testes: decisions_v2 (6), metrica-mae (24), bridge 1182/1182 |
| C1.4 · as 2 causas-raiz | **feito no código · por instalar** | `78befc60`; o conector vivo ainda é o de 01/09 — ver §0 |
| C1.5 · manchete mede resultado | **feito** (sessão anterior, `13803acd`) | — |
| C1.6 · «conector ok» é um sha | **feito e a morder** | `verConector()` agora diz `mau · 1.53.0 instalado ≠ 1.53.1 no repo`; antes do bump dizia `1.53.0 nos dois lados, mas 2 de 56 ficheiros diferem — seamless.js, context.js`. Correcto nos dois casos |
| C1.7 · testes sem `gh` | **feito** | `8c266c9e`. `env -i PATH=<node>:/usr/bin:/bin HOME=/tmp/casa-vazia node --test 'tools/cockpit/runner/*.test.mjs'` → **1363 testes, 1361 pass, 0 fail, 2 todo** (idêntico com `gh` presente) |
| C1.8 · 5 `workflow_dispatch` verdes | **feito** | 5/5 `success` em `main`, runs `33745717051`, `…25271`, `…34506`, `…44066`, `…53341` |

**Premissa do kickoff refutada (C1.3).** A meta «cobertura ≥80% nas decisões
novas» **não é atingível como está escrita**, e não por falta de trabalho: quem
escreve a esmagadora maioria das decisões é o hook de `UserPromptSubmit`, que
corre *antes* da execução e por isso **nunca** pode ter tokens. Exigir-lhe 80%
seria exigir que ele inventasse. A meta honesta é *«≥80% dos **despachos** trazem
tokens medidos»* — e essa só se pode medir depois de reinstalares o conector.

**Achado sobre o C1.7 que vale a pena reter:** num ambiente sem `gh` falhavam
**seis** testes, não sete. O sétimo não falhava — **passava vazio**: sem `gh` o
`execImpl` nunca corria, a lista de pedidos ficava a zero e o `for` que procura
campos proibidos não iterava nada. Um teste que passa por não ter corrido é pior
do que um que falha: o vermelho chama, o verde cala. Tem agora uma guarda.

---

### 3. O que é gesto teu (não tentei, por desenho)

1. **Instalar o conector novo e reabrir a app.** Duas linhas:
   `mooter_setup(atualizar: "aplicar")` e depois **fechar e reabrir o Claude
   Desktop**. Sem isto, o C1.4 e o C1.3 continuam a valer zero na prática — o
   processo vivo é o de 01/09. Não instalei porque escrever dentro da extensão
   instalada é uma acção para fora, e o kickoff pediu-me o *pacote*, não a
   instalação.
2. **`MOONSHOT_API_KEY`** para o `kimi` (fora do meu escopo, como o kickoff diz).
3. **As 4 linhas fabricadas no ledger** — comando acima.
4. **`npm run sync:cockpit`** + reinício do LaunchAgent: o `/saude.json` que
   responde agora ainda serve a string antiga («cobertura parcial»), ou seja o
   cockpit vivo também é de antes desta onda. Mesma classe do conector.

---

### 3b. A ronda do adversário (`codex exec --sandbox read-only`)

Correu sobre o diff. Achou **três defeitos reais**, e o pior era meu e vivia
dentro do próprio ficheiro que o corrige:

1. **`quotaPorMotor` contava tokens por `tokens_out > 0`** — classificava um
   zero *realmente medido* como não-medido. É a mesma confusão entre «gastou
   zero» e «ninguém contou» que o C1.3 existe para desfazer, a sobreviver 130
   linhas abaixo do comentário que a explica. O predicado estava copiado em dois
   sítios e os dois discordavam.
2. **`appendMeasured` aceitava negativos** — `Number.isFinite(-1)` é `true`, e
   um `-1` entrava rotulado `medido` e contava como cobertura válida.
3. **O `--require` não cobre quem corre o ficheiro à mão** — e `v12.test.js:6`
   *ensina* a fazê-lo («Run: node v12.test.js»). Porta documentada, agora
   fechada e verificada por medição (`node v12.test.js` directo → 420 → 420).

**Uma objecção recusada, com o motivo escrito:** «falta `landing/app/version.json`
no bump». Fica a 1.53.0 de propósito — diz «Generated — never hand-edit» e é o
`version-sync.yml` que o escreve no push da tag. Mesma decisão, com as mesmas
palavras, de `72b8e31f`.

**Uma alegação minha refutada:** eu tinha escrito que «zero das 4 medições
vieram de um motor». Não é demonstrável pelo esquema — o registo guarda `via` e
uma razão textual, não a identidade da execução. Reescrito para dizer o que está
medido: os valores são exactamente as fixtures, aparecem em pares nos timestamps
das corridas, e redireccionar `MOOTER_CLAUDE_DIR` fez o par de hoje aterrar no
temporário (prova directa para 03/09, inferência forte para 02/09).

### 3c. Aberto, e assumido — não fechei

1. **Duplo registo por despacho** (achado do adversário). Um despacho para `cc`
   pode gerar **duas** linhas: a do hook do filho (sem tokens) e a medida do
   conector. A métrica trata-as como chamadas distintas, o que **limita
   estruturalmente** a `pct_cobertura` — no limite, cobertura de 50% para 100%
   de despachos medidos. Fechá-lo precisa de correlação por execução (um id que
   viaje do despacho para a medição). Não entra nesta onda: é desenho de
   esquema, não um remendo.
2. **`mooter trail --calls`** volta a coagir `null` para `0` e mostra `0→0`
   (`trail.ts:557`, `:585`). Não é regressão — antes o valor era `0` e mostrava
   exactamente o mesmo — mas o `n/d` honesto ainda não chega ao ecrã do
   utilizador.

### 4. Git

Branch `fix/c1-cockpit-rapido-e-honesto`, **5 commits** novos sobre `8b6398b1`,
**PR [#482](https://github.com/pauloloureiroshp-ship-it/mooter/pull/482)** aberto:

- `bb37068b` feat(corpus): os tokens que alguém MEDIU chegam ao ledger
- `8c266c9e` test(ci-prs): 7 casos provavam que a máquina tinha `gh`
- `c74f4ec6` fix(corpus): a suite escrevia medições INVENTADAS no corpus do dono
- `bdbcd4cc` chore(release): 1.53.0 → 1.53.1
- `43eca1d4` fix(medição): as 3 do adversário

`main` avançou para `8fb84142` (#481) depois da base desta branch — o PR terá de
a integrar.

**Suites, todas verdes:** bridge **1182/1182** (corpus real 420 → 420) ·
cockpit **1363** (1361 pass, 2 todo, 0 fail), idêntico com `env -i` e sem `gh` ·
`decisions_v2` 6 · `wave22-honesty` 6 · vscode-extension 255 · cli trail-calls 5.

O bundle foi reconstruído depois desta ronda: sha256
`2f6363d75eef0acdad5b354b77367ddce672bb871ef92ffe00bb8f44f1faf636`
(substitui o `2d3f5130…` citado acima — o `decisions_v2.js` viaja dentro).

**Nunca fundido, nunca `--admin`, nunca `--force`, `git add` sempre selectivo.**
