# F0.1 — Varredura de segredos em todo o histórico do git (2026-08-26)

> ## A afirmação, exactamente como se sustenta
>
> **0 achados de severidade crítica não declarados, em todo o histórico do git,
> nos três âmbitos** (`origin`, `all`, `todos`), incluindo as mensagens de commit
> e de tag. Treze achados críticos foram encontrados, os treze verificados um a
> um no blob, os treze fixtures. **Nenhuma credencial precisa de rotação.**
>
> **Isto não é a mesma frase que «não há absolutamente nada».** Os 2 424 achados
> de nível `LOW` — uma única classe heurística — **não foram triados um a um**
> (§4). Um título mais forte do que a prova é o erro que a doutrina desta casa
> existe para apanhar, e a primeira versão deste relatório cometeu-o: abria com
> «0 segredos reais» e sustentava outra coisa. Foi o adversário que apanhou.

- **Repositório:** `pauloloureiroshp-ship-it/mooter` — **público**, MIT
- **Âncora:** `97ad846b40d7e1939e02d7b826e4388fe65d60e6`
- **Corrido em:** desktop Windows (`desktop-j26409q`), 2026-08-26

---

## 1. O buraco que isto fecha

O repo já tinha um varredor de segredos: `tools/audit/varredura-segredos.mjs`.
O cabeçalho dele diz *"NAO varre o disco: varre o que o git segue"* — e o que ele
varre é a **árvore de HEAD**.

> Um segredo commitado a 12 de Abril e apagado a 13 **desaparece dessa varredura
> no dia 13** — e continua no histórico para sempre, clonável por qualquer
> pessoa, num repositório que é público.

Isso não é teoria. Um dos treze achados críticos desta corrida —
`sk-ant-inherited-friend-build-key` em `tools/router/backtest.test.js` — **já não
existe em HEAD**. O varredor da árvore devolve `HIGH 0` e está certo; o segredo
continua lá atrás, e só esta varredura o vê.

`tools/audit/varredura-historico.mjs` fecha isso, e **reutiliza o mesmo detector**
(`scanSecrets` de `lp-secret-scan.js`) e a mesma tabela de severidade que o
varredor da árvore já usa. Um segundo conjunto de regras seria uma segunda
verdade a divergir da primeira no primeiro mês.

---

## 2. Os números

### 2.1 Ferramenta do repo — `varredura-historico.mjs`

Três âmbitos, três perguntas diferentes:

| | `origin`<br>o que está no mundo | `all`<br>+ branches locais | `todos`<br>+ objectos soltos |
|---|---|---|---|
| objectos alcançáveis | 19 041 | 20 684 | 14 775 |
| **objectos lidos** | **11 755** | **12 851** | **13 752** |
| saltados (binário/grande/ilegível/em falta) | 70 / 1 / 0 / 0 | 109 / 2 / 0 / 0 | 1 020 / 3 / 0 / 0 |
| **HIGH antes de declarar** | 6 | 9 | 13 |
| **HIGH depois de declarar** | **0** | **0** | **0** |
| LOW | 2 169 | 2 334 | 2 424 |
| INFO (dummy ou blob declarado) | 69 | 83 | 93 |
| tempo de parede | ~7,5 s | ~8 s | ~8 s |

O que cada âmbito acrescenta, e porque a diferença importa:

- **`origin`** é o único que responde à pergunta pública: *isto é clonável por
  qualquer pessoa?*
- **`all`** acrescenta branches locais que nunca foram empurradas
  (`kimi-egress/fail-closed`). É risco, não incidente.
- **`todos`** acrescenta os objectos **soltos** — o que sobrou de rebases,
  `--amend` e branches apagadas. Medido a 2026-08-26: **1 571 blobs e 242
  commits** fora do alcance de `--all`. Não são clonáveis por ninguém, mas
  respondem a *isto alguma vez existiu nesta máquina?*

**Em qualquer âmbito lêem-se também as mensagens de commit e de tag.** Um token
colado numa mensagem de commit é tão público como um token num ficheiro, e a
primeira versão desta ferramenta nunca olhou para nenhuma.

### 2.2 Contraprova externa — `gitleaks 8.30.1`

Corrido independentemente, com o conjunto de regras próprio dele, sobre
`--all --full-history`:

| | |
|---|---|
| commits varridos | **2 478** |
| bytes varridos | **61,81 MB** em **3,71 s** |
| achados brutos | **61** |
| **segredos distintos** (por sha256 do valor) | **34** |
| **reais depois de triagem manual** | **0** |

Os dois detectores são independentes e concordam no nível crítico. O gitleaks
não está ligado ao CI e não passa a estar: existe aqui como **contraprova de uma
corrida**, não como segunda verdade permanente.

#### A triagem, reproduzível

Dizer «triados à mão» sem mostrar o quê não é uma prova, é uma afirmação. Os 34
valores distintos, identificados pelos **8 primeiros caracteres do sha256 do
valor** — nunca pelo valor, que não sai daqui:

| distintos | onde | veredicto |
|---|---|---|
| **18** | vários | **marca sintética óbvia** no próprio valor ou na linha (`EXAMPLE`, `hunter2`, `abcdefghij…`, `inherited`, `placeholder`, zeros/sequências) |
| **12** | ficheiros `*.test.*` / `tests/` | fixtures de teste sem marca no valor, verificados no ficheiro |
| **4** | fora de testes | **verificados um a um** — ver abaixo |

Os 4 fora de ficheiros de teste, que são os únicos que exigiam olhar:

| impressão | regra | onde | o que é |
|---|---|---|---|
| `cda935b7` | `generic-api-key` ×16 | `packages/router/scripts/wave*-benchmark/prompts.jsonl` | o corpo de um **prompt de benchmark** que pede ao modelo *"faz um secret scan a este config — há credenciais hardcoded?"*. A linha a seguir tem `postgres://admin:hunter2@…` |
| `091c670d` | `generic-api-key` ×2 | `docs/benchmarks/wave2-pastor/outputs/RAW_RESULTS.jsonl` | a **resposta** do modelo ao prompt acima, no ficheiro de resultados. 13 caracteres |
| `457643f4` | `aws-access-token` ×3 | `tools/audit/varredura-segredos.mjs` | fixture do próprio scanner, com o comentário `'alfabeto sequencial — fixture do proprio lp-secret-scan'` na mesma linha |
| `f2063675` | `jwt` ×3 | `SYNC.md`, `docs/MASTER_PROMPTS/…` | a chave **`anon`** do Supabase — ver §5 |

Reproduzir a tabela: correr o gitleaks com `--report-format json` e agrupar por
`sha256(Secret)`. O comando está em §6.

---

## 3. Os treze críticos, um a um

Cada um foi lido no **blob**, não no ficheiro — um achado aponta para conteúdo
imutável, e é esse conteúdo que foi verificado. Qualquer pessoa repete com
`git cat-file -p <blob>`.

| # | tipo | blob | onde | o que é |
|---|---|---|---|---|
| 1 | `aws-access-key` | `bd1e23cf` | `tools/audit/varredura-segredos.test.mjs:56` | `AKIAIOSFODNN7EXAMPLE` — a chave falsa publicada pela **documentação oficial da AWS**. Encontrá-la não é um achado, é uma citação |
| 2 | `aws-access-key` | `bd1e23cf` | `…:61` | AKIA de forma válida **inventado para o teste** *"um AKIA de forma real e desconhecido continua HIGH"* |
| 3 | `pem-private-key` | `bd1e23cf` | `…:78` | cabeçalho `-----BEGIN RSA PRIVATE KEY-----` **sem corpo** |
| 4 | `pem-private-key` | `bd1e23cf` | `…:87` | cabeçalho PEM com **58 chars** de base64. Uma chave RSA real tem mais de 1000 |
| 5 | `aws-access-key` | `bd1e23cf` | `…:136` | o mesmo AKIA inventado, num fixture de listagem de ficheiros |
| 6 | `anthropic-api-key` | `b8979864` | `tools/router/backtest.test.js:602` | `sk-ant-inherited-friend-build-key` — sufixo de 26 chars em palavras minúsculas. Uma chave real tem prefixo `api03-` e ~100 chars. **Já não existe em HEAD** |
| 7-9 | `anthropic-api-key` | `08414396`, `52afc0be`, `075acee0` | `packages/mooter-bridge/egress.test.js:160,195` | `sk-ant-api03-abcdefghijklmnop` — alfabeto sequencial. Só em branch **local** |
| 10-13 | `anthropic-api-key` | `315683a7`, `ba1db6ef`, `9435254e` | **este próprio relatório**, a allowlist, e a **mensagem do commit** que criou os dois | ver §3.2 |

### 3.1 Como cada um foi silenciado — e porque não pelo mesmo mecanismo

Não são todos iguais, e tratá-los como iguais partia um teste:

- **#7-9** entraram na lista de **DUMMIES por valor** em `varredura-segredos.mjs`,
  onde já viviam `AKIAIOSFODNN7EXAMPLE` e outros alfabetos sequenciais. É um
  valor obviamente falso; declará-lo beneficia os dois varredores.
- **#10-13** entraram na mesma lista por valor, pela razão de §3.2.
- **#1-6** entraram numa **allowlist por blob sha** nova
  (`tools/audit/blobs-declarados.json`), e **não** podiam ir para a lista por
  valor: o achado #2 existe precisamente para provar que *um AKIA desconhecido
  continua HIGH*. Allowlistar esse valor partia o teste que protege toda a gente.

Um **blob** é conteúdo imutável: declarar um blob nunca cega o detector para
outro conteúdo — ao contrário de allowlistar um **caminho** (passaria a valer
para tudo o que lá fosse escrito amanhã) ou um **valor** (passaria a valer no
repo inteiro).

### 3.2 A ferramenta apanhou o relatório sobre a ferramenta

Os achados 10-13 não existiam antes desta corrida: **foram criados por ela**.

Assim que a varredura passou a ler mensagens de commit, encontrou quatro cópias
novas do placeholder `sk-ant-inherited-friend-build-key` — na secção deste
relatório que o descreve, na entrada da allowlist que o declara, e na mensagem do
commit que fez as duas coisas.

> Um documento sobre segredos que **cita** o segredo passa a ser, ele próprio, um
> sítio onde o segredo está.

É a prova mais barata de que a leitura de mensagens funciona, e a razão pela qual
o valor passou para a lista de DUMMIES **por valor**: declarar o blob do relatório
resolveria uma cópia e deixaria as três seguintes. Pela mesma razão, o E2E monta
o `AKIA` de teste **por concatenação em tempo de execução** — se o literal
estivesse escrito no ficheiro de teste, o teste que prova que o detector funciona
passava a ser a razão pela qual o detector grita.

### 3.3 A allowlist é abusável — o que se fez foi encarecer a mentira

O adversário descreveu o caminho de abuso mais curto, e tem razão: commitar a
credencial, correr `git hash-object`, e escrever no JSON qualquer mentira de vinte
caracteres. **Isso não se elimina com código — elimina-se com revisão.** O que o
código pode fazer é obrigar a mentira a ser específica:

| trava | o que impede |
|---|---|
| `motivo` com ≥ 20 caracteres | declarar sem explicar |
| chave tem de ser um **sha de 40 hex** | declarar um *caminho* (valeria para tudo o que lá fosse escrito amanhã) |
| **`tipos` e `n` obrigatórios** | declarar em abstracto. Quem quiser esconder uma chave da Anthropic tem de escrever `"tipos": ["anthropic-api-key"], "n": 1` **na mesma linha** em que escreve "é um fixture" — e isso fica no diff, ao lado da frase que o contradiz |
| a declaração **só se aplica se a forma bater** | reutilizar uma declaração para esconder um achado a mais: a contagem deixa de bater e a declaração cai, com a discrepância impressa |
| allowlist ilegível é **recusa**, não allowlist vazia | um JSON partido a passar por "nada declarado" |

O relatório imprime sempre os blobs declarados, o nível que teriam, o motivo e o
comando para verificar. Uma allowlist silenciosa seria a forma mais limpa de
esconder uma fuga; esta é ruidosa por construção.

---

## 4. O que NÃO foi triado — dito antes de alguém perguntar

**Os 2 424 achados `LOW` (âmbito `todos`) não foram triados um a um.** São todos
de uma única classe heurística, `generic-secret-assignment`, distribuída por
~1 055 blobs e 229 caminhos distintos; 618 deles estão em versões antigas do
`SYNC.md`.

O que sustenta não os ter triado:

1. É **a mesma população** que o varredor da árvore já reporta em HEAD (`LOW 1692`)
   e que o próprio ficheiro dele classifica como dívida de higiene pré-existente,
   não incidente.
2. No **nível crítico** — que é onde vive uma credencial utilizável — dois
   detectores independentes concordam em zero.
3. Um `LOW` desta classe é um `nome = valor` cujo nome parece um segredo; não tem
   forma de chave de fornecedor nenhum.

Isto é uma limitação declarada, não uma conclusão. **A afirmação que este
relatório sustenta é: 0 achados de severidade crítica não declarados, em todo o
histórico.** Não é «não há absolutamente nada».

Também não foi varrido: o **vault** (`paulo-vault`, privado) — está fora do âmbito
da F0, que fala do repositório público. O `varredura-segredos.mjs` já o cobre à
superfície de HEAD quando montado.

---

## 5. Uma coisa que não é um segredo mas convém saber

O histórico contém a **chave `anon` do Supabase** do projecto `eymtobwinevywmmlmxqa`
(em `SYNC.md` e num masterprompt arquivado, três ocorrências do mesmo token,
`role: anon`, `exp: 2036-04-08`).

Uma chave `anon` do Supabase **é publicável por desenho** — vai no bundle do
browser de qualquer aplicação que a use, e é isso que o `landing/` faz. Não é
uma fuga e **não precisa de rotação**.

O que ela implica é outra coisa: **a protecção desse projecto é inteiramente o
RLS**. Se alguma tabela lá tiver RLS desligado, a chave que está no histórico
(e no site) chega para a ler. Isto não é um achado desta varredura — é um
apontamento para quem decidir olhar para a postura do Supabase, e fica escrito
aqui para não se perder.

---

## 6. Reproduzir

```bash
# a ferramenta do repo (zero dependencias externas)
node tools/audit/varredura-historico.mjs --refs origin   # o que esta no mundo
node tools/audit/varredura-historico.mjs                 # inclui branches locais
node tools/audit/varredura-historico.mjs --json

# os testes dela
node --test tools/audit/varredura-historico.test.mjs     # 18 testes

node tools/audit/varredura-historico.mjs --refs todos      # + objectos soltos

# os testes: 27 unitarios + 6 E2E contra um repositorio git de verdade
npm run test:audit                                        # 50 verdes

# a contraprova externa (nao faz parte do CI)
gitleaks detect --source . --log-opts="--all --full-history" --report-format json --report-path gl.json
```

Saída: `0` = sem HIGH · `1` = há HIGH, parar e reportar · `2` = a varredura falhou.

### 6.1 Onde isto corre em CI — e uma correcção

A primeira versão deste relatório afirmava que `tools/audit/**` estava fora de
todos os workflows. **Era falso, e a correcção fica aqui em vez de ser apagada.**

`.github/workflows/slack-spike-test.yml` — que corre em **todos** os pushes e
PRs, deliberadamente **sem filtro de `paths:`** — já corria duas coisas desde
antes desta corrida: a varredura da árvore (`varredura-segredos.mjs --sem-vault`)
e os testes dela. O guarda existia e funcionava.

O que faltava era só a metade nova: os testes da varredura do **histórico**. Por
isso a mudança de CI deste PR é uma linha — o passo que já existia passa a
correr `npm run test:audit`, que é **uma** lista para as duas ferramentas, em vez
de uma lista no workflow e outra no `package.json` a divergirem no primeiro mês.

O `test.yml` **não é tocado**. Uma segunda ligação lá seria cobertura duplicada
para o mesmo ficheiro, e faria parecer que o CI ganhou mais do que ganhou.

---

## 7. Veredicto para o portão da F0

| critério do portão | estado |
|---|---|
| **0 segredos no histórico** | **cumprido, na forma exacta do cabeçalho** — 0 HIGH não declarados nos três âmbitos (`origin`, `all`, `todos`), mensagens de commit e tag incluídas; 13 críticos verificados um a um no blob, todos fixtures; contraprova externa independente concorda no nível crítico. **Não cobre**: 2 424 `LOW` heurísticos por triar (§4) |
| índice publicado com as sete parcelas | pendente (F0.2) |
| 3 devices no mesmo sha | pendente |
