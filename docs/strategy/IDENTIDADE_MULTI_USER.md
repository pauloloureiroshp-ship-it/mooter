# Identidade multi-user — chave por UTILIZADOR, `50-fleet/<user>/`, e o que isso custa

**Estado:** desenho para o dossiê corporate. **Sem código. Não implementado.**
**Escrito em:** 2026-08-25, `Mac-mini-de-Paulo`, contra o esquema que corre hoje.

---

## 1. O que existe hoje, medido

A frota autentica-se por **device**, com Ed25519 e um registo de públicas
commitado no vault:

```json
// paulo-vault/50-fleet/trusted-devices.json  (lido 2026-08-25)
{ "versao": 1, "devices": {
    "mac-mini-de-paulo":  { "alg": "Ed25519-v1", "kid": "bb8ed099…", "pub": "MCowBQ…" },
    "desktop-j26409q":    { "alg": "Ed25519-v1", "kid": "1ec7458f…", "pub": "MCowBQ…" } } }
```

Estado real, medido nesta sessão com `readBeacons`:

```
prova_frota: true
verificados: 2 · por inscrever: [] · rejeitados: 0
mac-mini-de-paulo  ancora: registo  ok: true
desktop-j26409q    ancora: registo  ok: true
```

**A migração Ed25519 está completa — 2 de 2 devices.** (O `SYNC.md` dizia
«1 de 2» desde 24/08; estava desactualizado e foi fechado no mesmo commit que
este documento.)

A privada de cada device vive em `~/.mooter/device-ed25519.key` e **nunca sai da
máquina**. O vault só carrega públicas. É por isso que este esquema é melhor do
que a `.owner.key` partilhada que o antecedeu: nenhum segredo viaja, e a
recuperação de um device perdido é uma linha num ficheiro que se revê em
`git diff`.

---

## 2. O que este esquema NÃO responde

Responde a **«que máquina escreveu isto?»**. Não responde a **«que pessoa?»**.

Hoje as duas perguntas colapsam numa, porque há um utilizador. Num contexto
corporate deixam de colapsar, e três coisas partem-se ao mesmo tempo:

1. **Atribuição.** Dois devices da mesma pessoa são indistinguíveis de dois
   devices de duas pessoas. Um recibo diz `desktop-j26409q`, não diz quem estava
   ao teclado.
2. **Revogação.** Alguém sai da equipa: hoje é preciso saber, de cor, quais dos
   N devices eram dessa pessoa. Não há nada no ficheiro que o diga.
3. **Colisão de espaço.** `50-fleet/` é um namespace plano de nomes de máquina.
   Dois `macbook-pro` em duas equipas colidem no mesmo ficheiro — e o
   `safeDeviceName()` normaliza-os para o **mesmo** nome, portanto a colisão é
   silenciosa.

---

## 3. O desenho — duas chaves, uma cadeia curta

Não se substitui a chave de device. **Acrescenta-se uma acima dela**, e a de
device passa a ser *certificada* pela do utilizador.

### 3.1 O registo passa a ter dois níveis

```
50-fleet/
  users.json                      ← públicas dos UTILIZADORES (o dono cura)
  paulo/
    trusted-devices.json          ← devices deste utilizador, assinado pela chave DELE
    mac-mini-de-paulo.json        ← beacon
    desktop-j26409q.json
  <outro-user>/
    trusted-devices.json
    …
```

```json
// 50-fleet/users.json
{ "versao": 2, "users": {
    "paulo": { "alg": "Ed25519-v1", "kid": "…", "pub": "…",
               "inscrito_em": "…", "inscrito_por": "raiz" } } }
```

### 3.2 A cadeia de confiança, com dois elos e não mais

```
users.json  ──assina──▶  <user>/trusted-devices.json  ──assina──▶  beacon
   (o dono cura                (o utilizador inscreve            (o device
    à mão, em git)              os SEUS devices)                  assina)
```

**Um beacon só é aceite se os dois elos fecharem.** Um device cuja entrada não
esteja assinada pela chave do utilizador que a reclama é rejeitado — e entra em
`rejeitados[]` com o motivo, como já acontece hoje.

**Porquê exactamente dois elos e não uma PKI:** com dois elos, a revogação de
uma pessoa é **apagar uma linha de `users.json`**, e todos os devices dela caem
juntos, sem ser preciso saber quais eram. Uma cadeia mais funda compraria
delegação que ninguém pediu e traria revogação transitiva, que é o problema
difícil das PKI reais. Não se paga esse preço antes de haver quem o peça.

### 3.3 O que muda no código (superfície, não implementação)

| onde | mudança |
|---|---|
| `tools/router/assinatura.js` | `lerRegisto()` passa a resolver `users.json` → `<user>/trusted-devices.json`. `verificar()` ganha um segundo elo. |
| `tools/cockpit/runner/fleet-beacon.mjs` | `beaconDir()` devolve `50-fleet/<user>/`; `readBeacons` varre os subdirectórios. |
| `50-fleet/trusted-devices.json` (v1) | continua a ser lido como o namespace do utilizador por omissão — ver §4. |

---

## 4. Compatibilidade — e a objecção que quase mata o desenho

**O `50-fleet/` de hoje é plano.** Mudar para `50-fleet/<user>/` **quebra todos
os devices que ainda correm código antigo**: eles escrevem no sítio velho e leem
o sítio velho, e a frota parte-se em duas metades que não se vêem.

E isto já aconteceu neste projecto, exactamente assim: em 2026-08-24 o Mac
passou a assinar Ed25519 enquanto o PC ainda corria HMAC, e o painel do PC
passou a ver o beacon do Mac como `alg-desconhecido`. Foi aceite porque era uma
transição de dias entre duas máquinas do mesmo dono. **Num contexto corporate,
com N devices que ninguém controla ao mesmo tempo, não é aceitável.**

**Mitigação obrigatória — leitura dupla, escrita nova:**

- o leitor varre `50-fleet/*.json` (v1, plano) **e** `50-fleet/*/*.json` (v2).
  Um beacon v1 continua válido e é atribuído ao utilizador por omissão
  declarado em `users.json`;
- o escritor só passa a v2 quando `users.json` existir **e** o device estiver
  inscrito lá — a mesma ordem que a migração Ed25519 já usou («inscrever
  primeiro, mudar de algoritmo depois»), e que foi o que a fez correr sem
  partir nada;
- o painel mostra a versão de cada beacon, para a transição ser **visível** em
  vez de silenciosa.

Sem esta mitigação, o desenho é um NO-GO.

---

## 5. O que isto NÃO resolve (dito antes de alguém perguntar)

- **Não é autenticação.** Prova que uma chave assinou; não prova quem a
  detinha. Uma privada roubada assina na mesma. É a mesma garantia que uma
  chave SSH dá, nem mais nem menos.
- **Não dá multi-tenancy.** Todos os utilizadores partilham o mesmo repositório
  git e vêem-se uns aos outros. Isolamento a sério é outro repositório por
  equipa — e o `CANAL_DE_SYNC_ROADMAP.md` já mostra o que custa multiplicar
  canais.
- **Não resolve a rotação.** Não há caminho de rotação de chaves em nenhum dos
  dois níveis, hoje. Acrescentar uma pessoa é fácil; **trocar a chave dela sem
  invalidar a história** é o trabalho que este desenho deixa por fazer, e é
  onde a maioria dos esquemas destes morre.

---

## 6. Gate de red-team (as oito perguntas)

| # | pergunta | resposta |
|---|---|---|
| 1 | **fonte de verdade** | `users.json`, curado à mão pelo dono e commitado. Um comando que o escrevesse sozinho deixaria qualquer processo com escrita no vault inscrever-se — é a mesma razão pela qual o `frota:chave` de hoje **não** commita. |
| 2 | **escritor único** | Por ficheiro, sim: cada device escreve **só** o seu beacon. `users.json` só o dono. `<user>/trusted-devices.json` só esse utilizador. |
| 3 | **reversível vs irreversível** | Reversível enquanto a leitura dupla (§4) existir. Deixa de o ser no dia em que o suporte a v1 for removido. |
| 4 | **script-first** | O `frota:chave` já existe e já imprime a pública. Ganha `--inscrever-user`. Nada aqui pede um serviço. |
| 5 | **projecção vs 2ª verdade** | O registo é fonte; os beacons são projecção. Não se acrescenta verdade nenhuma — acrescenta-se um elo de prova. |
| 6 | **degradação graciosa** | Sem `users.json`, tudo se comporta exactamente como hoje (v1 plano). É esse o teste que o desenho tem de passar. |
| 7 | **frozen/allowlist/n-d** | `tools/router/assinatura.js` **não** está congelado (`classify.js` é que está). Nenhum `packages/*`. Sem código nesta entrega. |
| 8 | **custo de reverter** | Baixo enquanto a leitura dupla existir; **alto** depois, porque os beacons v1 deixam de ser encontrados e a frota parte-se em silêncio. |

**Objecção real produzida:** sim, e é a §4 — o desenho na forma directa
(«mudar para `50-fleet/<user>/`») parte a frota de forma silenciosa, e este
projecto já viveu essa transição em pequeno. A leitura dupla deixa de ser
«boa prática» e passa a ser **condição de GO**.

---

## 7. O que pede a mão do dono

1. **Isto é para o dossiê corporate, ou é para construir?** Se é dossiê, fica
   aqui e não custa mais nada. Se é para construir, precisa de um segundo
   utilizador real — construir identidade multi-user com um utilizador é
   desenhar contra uma hipótese.
2. **A rotação de chaves (§5) entra no âmbito ou fica declarada como não
   resolvida?** É a pergunta que um comprador corporate faz primeiro.
3. Nada aqui é urgente. `prova_frota: true` com 2 devices, hoje.
