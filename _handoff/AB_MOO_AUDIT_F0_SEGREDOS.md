# F0.1 — Varredura de segredos em todo o histórico do git (2026-08-26)

> **Resultado: 0 segredos reais no histórico.** O portão da F0 abre.
> O MP mandava parar tudo e reportar se encontrasse alguma coisa. Encontrou
> nove achados de severidade crítica — e os nove são fixtures de teste, cada um
> verificado à mão e declarado por escrito. Nenhuma credencial precisa de ser
> rodada por causa deste repositório.

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

Isso não é teoria. Um dos nove achados críticos desta corrida —
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

| | `--refs origin` (o que está no mundo) | `--refs all` (inclui branches locais) |
|---|---|---|
| blobs alcançáveis | 16 086 | 16 086 + branches locais |
| candidatos (depois de excluir extensões binárias) | 16 074 | — |
| **blobs lidos** | **8 806** | — |
| saltados: binário (NUL) / grande (>2 MB) / ilegível / não-blob | 70 / 1 / 0 / 7 209 | idem |
| **HIGH antes de declarar** | **6** | **9** (os 6 + 3) |
| **HIGH depois de declarar** | **0** | **0** |
| LOW | 2 160 | 2 323 |
| INFO (dummy ou blob declarado) | 50 | 63 |
| tempo de parede | **7,9 s** | ~8 s |

A diferença entre as duas colunas é o ponto: **3 achados críticos existem só em
branches locais que nunca foram empurradas** (`kimi-egress/fail-closed`). São um
risco, não um incidente — e a ferramenta distingue as duas coisas porque a
diferença importa.

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

---

## 3. Os nove críticos, um a um

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

### 3.1 Como cada um foi silenciado — e porque não pelo mesmo mecanismo

Não são todos iguais, e tratá-los como iguais partia um teste:

- **#7-9** entraram na lista de **DUMMIES por valor** em `varredura-segredos.mjs`,
  onde já viviam `AKIAIOSFODNN7EXAMPLE` e outros alfabetos sequenciais. É um
  valor obviamente falso; declará-lo beneficia os dois varredores.
- **#1-6** entraram numa **allowlist por blob sha** nova
  (`tools/audit/blobs-declarados.json`), e **não** podiam ir para a lista por
  valor: o achado #2 existe precisamente para provar que *um AKIA desconhecido
  continua HIGH*. Allowlistar esse valor partia o teste que protege toda a gente.

Um **blob** é conteúdo imutável: declarar um blob nunca cega o detector para
outro conteúdo — ao contrário de allowlistar um **caminho** (passaria a valer
para tudo o que lá fosse escrito amanhã) ou um **valor** (passaria a valer no
repo inteiro).

A allowlist tem trava: **uma entrada sem motivo escrito com pelo menos 20
caracteres é recusada**, uma chave que não seja um sha de 40 hex é recusada, e o
relatório imprime sempre quantos blobs foram declarados, com o nível que teriam e
o comando para os verificar. Um ficheiro de allowlist ilegível **não** é tratado
como allowlist vazia — é reportado como recusa. Uma allowlist silenciosa seria a
forma mais limpa de esconder uma fuga.

---

## 4. O que NÃO foi triado — dito antes de alguém perguntar

**Os 2 323 achados `LOW` não foram triados um a um.** São todos de uma única
classe heurística, `generic-secret-assignment`, distribuída por 1 055 blobs e 229
caminhos distintos; 618 deles estão em versões antigas do `SYNC.md`.

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

# a contraprova externa (nao faz parte do CI)
gitleaks detect --source . --log-opts="--all --full-history" --redact
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
| **0 segredos no histórico** | **cumprido** — 0 HIGH não declarados em `--refs all` e em `--refs origin`; 9 críticos verificados um a um, todos fixtures; contraprova externa concorda |
| índice publicado com as sete parcelas | pendente (F0.2) |
| 3 devices no mesmo sha | pendente |
