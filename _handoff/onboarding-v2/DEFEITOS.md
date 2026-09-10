# Defeitos apanhados — onboarding v2

Registo por onda. Cada entrada diz **o que se observou**, **o que se conseguiu
descartar por medição**, e **o que fica `n/d`**. Uma causa não verificada
escreve-se como hipótese, nunca como facto.

---

## W1-D1 · `UserPromptSubmit · loader:1520` no plugin (aberto)

**Reportado por:** o dono, 2026-09-10, a pedir que ficasse registado nesta onda.
**Severidade:** por determinar — depende de o hook chegar ou não a correr.
**Estado:** **aberto**, causa `n/d`.

### O que se observou

O Claude Code emite um erro de hook rotulado `UserPromptSubmit · loader:1520`.
O `loader:1520` aponta para uma linha do **carregador de plugins do próprio
Claude Code** — código que não vive neste repositório. Não é uma linha de
nenhum ficheiro do Mooter.

### O que foi descartado, por medição neste worktree (2026-09-10)

| Hipótese | Verificação | Resultado |
|---|---|---|
| O script do hook tem erro de sintaxe | `node --check plugin/mooter/hooks/route-or-bootstrap.js` | **passa** |
| O script rebenta ou sai ≠ 0 | `echo '{"prompt":"teste"}' \| node …/route-or-bootstrap.js` | **exit 0**, sem stdout, sem stderr |
| O hook está declarado em dois sítios (colisão) | `grep -rn UserPromptSubmit plugin/` | **uma só** declaração, em `hooks/hooks.json` |
| O `settings.json` do plugin declara hooks a competir | leitura directa | declara só `subagentStatusLine` |

O script é defensivo por construção: todo o corpo está dentro de `try {} catch {}`
e termina com `process.exit(0)` incondicional («absolute never-throw guarantee»).
Um erro **dentro** dele não produziria uma mensagem do carregador.

### Hipótese que sobra (não verificada)

O erro é de **carregamento**, não de execução: o carregador falha a resolver ou
a validar a declaração do hook antes de alguma vez o correr. O candidato mais
provável é a expansão de `${CLAUDE_PLUGIN_ROOT}` em
`node "${CLAUDE_PLUGIN_ROOT}/hooks/route-or-bootstrap.js"` — se essa variável
vier vazia, o comando resolve para `node "/hooks/route-or-bootstrap.js"`, que
não existe.

**Isto é hipótese e está escrito como tal.** Não foi reproduzido.

### Porque é que isto importa mais do que parece

Se o hook não carrega, o Mooter **não injecta a rota** nas sessões que dependem
do plugin. Essa é exactamente a métrica que a **R9** protege: obediência do host.
Um hook que falha a carregar em silêncio conta como desobediência e a medição de
W4/W6 não sabe distinguir «o host ignorou» de «o hook nunca lá esteve».

### O que é preciso para fechar

1. A mensagem de erro **completa** e a versão do Claude Code onde aparece
   (o `loader:1520` sozinho não localiza nada fora do binário).
2. `echo $CLAUDE_PLUGIN_ROOT` no ambiente onde o erro acontece.
3. Se a hipótese se confirmar: trocar a interpolação por um caminho resolvido
   pelo próprio script — a mesma lição do `gh-bin.mjs`, onde um binário
   assumido no `PATH` falhava sob `launchd` e a correcção foi resolver em
   código em vez de cravar o ambiente.

**Não corrigido nesta onda de propósito:** não se corrige por adivinhação um
defeito cuja causa não se mediu. Uma "correcção" sem reprodução não se distingue
de uma alteração ao acaso, e passa a esconder o defeito real.

---

## W1-D2 · `npm audit` HIGH em três pacotes — dívida de `main`, não desta onda (aberto)

**Encontrado:** 2026-09-10, no CI do PR #492.
**Decisão do dono:** deixar em aberto e seguir para W2.
**Estado:** **aberto**, causa **conhecida e medida**.

### O que falha

`security · npm audit (block on HIGH)` reprova em três pacotes:

| Pacote | Vulnerabilidade | Origem |
|---|---|---|
| `tools/router` | `js-yaml@4.3.1` HIGH — GHSA-2883-xcg3-v3hh (`maxTotalMergeKeys` não limita CPU) | **transitiva de dev**: `eslint@9.39.4` → `@eslint/eslintrc@3.3.5` |
| `packages/cli` | a mesma | a mesma |
| `hub` | `sharp <0.35.4` HIGH ×3 (libheif) — GHSA-rgj7-g3m4-5g8c | dependência **directa** |

### Não é da W1, e isso está medido

`git diff feat/onboarding-v2-w0..HEAD -- '*package-lock.json'` devolve **vazio**: os
lockfiles são byte-idênticos aos de `main`. A W1 alterou **uma** linha de
`tools/router/package.json` — a lista de ficheiros de teste — e **zero** dependências.

### Porque só aparece agora

O `security.yml` dispara por filtro de caminhos (`tools/router/**`, `packages/**`,
`hub/**`, `**/package.json`). A W1 tocou em `tools/router/`, logo o portão correu.
**A mesma dívida está em `main` e não está a ser medida lá** — só o cron de segunda-feira
a apanha, e um vermelho semanal num sítio que ninguém olha é um vermelho que não existe.

É a classe de defeito que este repositório já apanhou duas vezes: **presença não é
cobertura** (os `.svg` a 2026-08-27; a guarda de movimento reduzido a 2026-08-29). Um
portão que só corre quando um caminho muda não está a medir `main`; está a medir quem
teve o azar de lhe passar ao lado.

### O que é preciso para fechar

1. `hub`: bump directo de `sharp` para ≥ 0.35.4.
2. `tools/router`: bump do `eslint` (a `js-yaml` é transitiva de dev — não vai para
   produção nenhuma, mas o portão bloqueia à mesma, e bem: o portão não sabe adivinhar).
3. `packages/cli`: o mesmo bump — **e este exige entrada de allowlist no `CLAUDE.md`**,
   porque `packages/*` é motor congelado. É por isso que não foi feito por iniciativa
   do executor: mexer num pacote congelado sem entrada registada é indistinguível de
   uma violação.
4. Considerar tirar o filtro de caminhos do `security.yml`, ou correr o audit também
   em `push: main`. Sem isso, o próximo a tocar em `tools/router/` volta a herdar
   um vermelho que não é dele.

---

## W2-D1 · TTV por cronometrar — `n/d`, e porquê (aberto)

**Estado:** **`n/d`**. Não é um esquecimento; é uma medição que este executor não pode fazer.

O DoD nº 1 do kickoff pede: «Mac limpo → `.mcpb` → 1.º recibo, sem terminal, **TTV
cronometrado**». O teste exige uma **conta de utilizador nova** num Mac limpo, um duplo
clique no Finder e o Claude Desktop a instalar o bundle. Nada disso é acessível a partir
daqui: criar uma conta de utilizador no macOS é uma acção administrativa, e não há como
cronometrar um duplo clique que não acontece.

**O que ficou provado, e que não é a mesma coisa:**

| Provado | Como |
|---|---|
| O bundle constrói | `node pack-mcpb.mjs` → 2 ficheiros, 9 713 bytes |
| O bundle é **reproduzível** | dois empacotamentos dão o mesmo sha256 |
| O bundle abre num descompactador que não é o nosso | `unzip -l` do sistema |
| O manifesto dentro do zip é byte-a-byte o do disco | extraído e comparado |
| O launcher delega com `stdio: 'inherit'` | teste com `spawn` injectado |
| B1 e B2 dizem o que o mapa manda | 8 testes |

**O que continua por provar:** que o Claude Desktop **aceita** este manifesto, que o
diálogo de `user_config` aparece como se espera, e quanto tempo tudo isso demora. Um
`manifest_version` que o host recuse é exactamente o tipo de coisa que nenhum teste local
apanha.

**Para fechar** (dono, ≤10 min): conta de utilizador nova no Mac mini → duplo clique no
`.mcpb` → cronometrar até ao 1.º recibo → escrever o número, o que for.

**Regra que se aplica aqui:** R10. Um TTV inventado seria pior do que `n/d`, porque
`n/d` diz a verdade e um número inventado entra em copy.

---

## W3-D1 · `--test-force-exit` esconde **206 testes e 6 falhas** — e a suite sai VERDE (aberto)

**Encontrado:** 2026-09-10, ao ligar os testes desta onda ao script `test` do `tools/router`.
**Severidade:** **alta.** O número que o CI publica não é o número de testes que existem.
**Estado:** **aberto**. Mitigado nesta onda; a causa **não** foi tocada.

### O que está medido

O script `tools/router` → `npm test` corre `node --test --test-force-exit …`. Essa flag mata o
processo assim que a fase síncrona acaba — e **os testes assíncronos que ainda estavam a correr
desaparecem, sem aviso e sem alterar o código de saída**.

Medido nesta bancada, ficheiro a ficheiro:

| Ficheiro | com a flag | sem a flag | perdidos |
|---|---|---|---|
| `ledger-turn-io.test.js` | 7 | 16 | **9** |
| `provider-health.test.js` | 7 | 14 | **7** |
| `ollama-host.test.js` | 9 | 11 | 2 |
| `recibo.test.js` | 10 | 11 | 1 |

E a suite inteira:

| | testes | pass | fail |
|---|---|---|---|
| **com** `--test-force-exit` (o que o CI corre) | 1110 | 1109 | **0** — verde |
| **sem** a flag | **1316** | 1309 | **6** |

**206 testes nunca correm, e 6 falham enquanto o CI diz que está tudo bem.**

### Das 6 falhas, quantas são reais

- **5** (`mooter-doctor.test.js:154+`) são `listen EPERM 127.0.0.1` — a **sandbox desta bancada** a
  recusar um listen local. Não é código. Precisam de ser reconfirmadas fora da sandbox antes de
  se lhes chamar defeito.
- **1 é real, e foi apanhada a mim.** `ollama-host.test.js` tem uma guarda de **cobertura**:
  nenhum ficheiro de `tools/` pode ler `process.env.OLLAMA_HOST` sem passar por
  `ollamaHostFromEnv()`. O `tools/cli/lib/probe.js` desta onda normalizava à mão, com regex
  própria. **Já corrigido neste PR** — mas o ponto é outro: com a flag ligada, essa guarda **nunca
  teria corrido**, e a segunda implementação entrava em `main` em silêncio. A guarda existe
  precisamente por causa do defeito de 2026-09-01, em que o motor $0 falhava mudo e o trabalho
  caía para um motor pago.

### Porque é que isto é a mesma lição outra vez

«Um número que ninguém verifica não é uma prova» está escrito no CI deste repositório, a propósito
do `mooter-bridge` — uma sessão anunciou «140 testes verdes» tendo corrido 11 de 29 ficheiros.
É exactamente isto, mas dentro da suite que impõe a regra.

### O que foi feito nesta onda (mitigação, não correcção)

Os três ficheiros de teste do onboarding v2 correm num script próprio,
`npm run test:onboarding-v2`, **sem** `--test-force-exit`, com passo dedicado no CI. Sem isso, os
78 casos desta onda passariam a 29 — e os 49 que faltavam eram precisamente os assíncronos:
enrolment, troca de payload, `fetch` injectado.

### O que é preciso para fechar (não feito aqui, de propósito)

1. Descobrir **porque** é que a flag lá está. Ela foi acrescentada por alguma razão — quase de
   certeza um teste que deixa um handle aberto e faz a suite pendurar. Tirá-la sem fechar essa
   causa troca um problema silencioso por um bloqueio ruidoso.
2. Encontrar o(s) ficheiro(s) que não fecham handles (`why-is-node-running`, ou bissecção).
3. Reconfirmar as 5 falhas do `mooter-doctor` **fora** de uma sandbox.
4. Só então tirar a flag, e cravar o número de testes num teste — o número que ninguém vigia
   volta a mudar.

**Fora do âmbito da W3, e deliberadamente não tocado:** mexer nisto às cegas pode pendurar o CI
inteiro, e essa decisão é do dono.
