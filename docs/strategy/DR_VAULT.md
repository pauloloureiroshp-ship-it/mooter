# DR do vault — o remoto único, o que o restauro não traz, e a proposta que espera GO

**Estado:** risco documentado; proposta **à espera de decisão do dono**. Nada foi implementado.
**Medido em:** 2026-08-25, `Mac-mini-de-Paulo`, contra o `paulo-vault` real.
**Ensaio reprodutível:** `tools/ops/restaurar-vault.sh` (só leitura, nunca toca no vault).

---

## 1. O risco, dito sem embelezar

O vault tem **um** remoto:

```
$ git -C ~/paulo-vault remote -v
origin  git@github.com:pauloloureiroshp-ship-it/paulo-vault.git (fetch)
origin  git@github.com:pauloloureiroshp-ship-it/paulo-vault.git (push)
```

Não há segundo destino. O que o protege hoje é:

- **duas cópias completas** — o Mac e o `desktop-j26409q` têm ambos o repositório inteiro
  (é git, portanto cada clone é um backup completo da história);
- **o GitHub**, que é o único ponto onde as duas se encontram.

O que **não** o protege:

- perda da conta GitHub (suspensão, comprometimento, erro humano num `delete repository`) —
  ficam as duas cópias locais, mas deixa de haver canal entre elas, e o `beacon-publisher`
  passa a falhar em silêncio a cada ciclo;
- um `git push --force` errado que reescreva história — o GitHub aceita-o, e os dois
  devices adoptam-no no `pull --rebase` seguinte.

O vault é **privado** — confirmado no portão de entrada desta sessão
(`gh repo view … --json visibility` → `PRIVATE`) — portanto isto é um risco de
**disponibilidade e integridade**, não de confidencialidade.

---

## 2. O que um restauro REALMENTE devolve — medido, não presumido

Um backup que nunca foi restaurado é uma suposição. O `restaurar-vault.sh` clona do
`origin` para uma pasta temporária e valida. Corrida de 2026-08-25:

| passo | resultado |
|---|---|
| clone | **1322 commits, 2865 ms** |
| canon `00-core/` | **18 ficheiros** |
| ficheiros seguidos pelo git | **917** |
| índice do 3rd-brain reconstrói no clone | **570 entradas** |
| retriever responde | **3 resultados** para `"mooter"` |
| beacons da frota | **3 ficheiros, todos parseáveis** |

**O restauro funciona.** E o ensaio é, pela mesma corrida, o ensaio do **onboarding**:
o que uma máquina nova tem de fazer para existir é exactamente isto.

### 2.1 O que ele NÃO devolve

Só dois ficheiros do vault estão fora do git, e só um deles importa:

| ficheiro | consequência |
|---|---|
| `.claude/3rd-brain/index.json` | **nenhuma** — é derivado, e o passo 3 do ensaio reconstrói-o à frente de quem olha. Está no `.gitignore` por uma razão medida: versioná-lo prendeu o vault 24 h a 2026-08-19. |
| `50-fleet/.owner.key` | **não volta.** É a chave HMAC do dono. Se esta máquina morrer, morre com ela. |

A `.owner.key` cai no `*.key` do `.gitignore` do vault, portanto **nunca viajou entre
máquinas** — cada device gerou a sua. O `fleet-beacon.mjs` já tinha chegado a esta mesma
conclusão por outro caminho, ao descobrir que `prova_frota: true` estava a ser afirmado
com duas chaves diferentes.

**Consequência prática:** perder um device não é perder o vault; é perder a capacidade
desse device de assinar. A recuperação é reinscrever a máquina nova no registo de
públicas — o que é exactamente o caminho que o Ed25519 já abriu, e a razão pela qual ele
é melhor do que a chave partilhada.

### 2.2 Um defeito encontrado pelo ensaio, que não é do restauro

O `retrieve.js` do vault **não imprime nada quando o caminho até ele atravessa um
symlink**. O guarda de CLI compara `import.meta.url` (que vem resolvido) com
`pathToFileURL(process.argv[1])` (que não vem); através de um symlink nunca batem, e o
processo sai `0` sem escrever um byte.

Descoberto porque o `$TMPDIR` do macOS vive em `/var/folders/…` e `/var` é um symlink
para `private/var`.

**Porque é que isto importa fora do ensaio:** o `AGENTS.md` manda **todo** agente
arrancar com `node "$VAULT_PATH/.claude/3rd-brain/retrieve.js" "<tópico>"` e ler o que
vier. Num device cujo `VAULT_PATH` atravesse um symlink, o agente lê **zero linhas, sem
erro nenhum**, e segue convencido de que o vault não tinha nada sobre o assunto.

**Correcção:** comparar com `fs.realpathSync(process.argv[1])`.
**Onde:** repositório pessoal do dono → **gate dele**. Aqui fica a probe permanente que
o mede e o nomeia a cada corrida do ensaio.

---

## 3. A proposta — espelho privado como 2º remoto

**Ainda não implementada. Precisa de GO.**

### Desenho

1. Criar `pauloloureiroshp-ship-it/paulo-vault-mirror`, **privado**, vazio.
2. Adicionar como segundo push-url do `origin`:
   ```sh
   git -C "$VAULT_PATH" remote set-url --add --push origin git@github.com:…/paulo-vault.git
   git -C "$VAULT_PATH" remote set-url --add --push origin git@github.com:…/paulo-vault-mirror.git
   ```
   Com dois push-urls, **um `git push` escreve nos dois**. Não é preciso mudar uma linha
   de código: o `beacon-publisher` já faz `git push` e passa a publicar para ambos.
3. O espelho é **só destino**. Ninguém faz `pull` dele. É um backup, não um segundo tronco.

### Porque é que este desenho e não outro

- **Não cria segundo escritor.** O publicador continua a ser um só; o que muda é para
  onde o `push` dele aterra. Um segundo processo a espelhar seria um segundo escritor, e
  o `CANAL_DE_SYNC_ROADMAP.md` §3 mostra o que dois escritores custam.
- **Degrada graciosamente.** Se o espelho estiver em baixo, o `git push` falha **inteiro**
  — o que é a parte que precisa de decisão (ver §4).
- **Reversível a custo zero:** `git remote set-url --delete --push`.

### O que isto NÃO resolve

Um `--force` errado propaga-se aos dois remotos. Um espelho protege contra **perda da
conta**, não contra **erro do operador**. Para esse, o que vale é a
`branch protection` no GitHub, e é uma decisão separada.

---

## 4. A objecção a esta proposta, que não escondo

**Com dois push-urls, um remoto em baixo faz falhar o push todo.** O `beacon-publisher`
trata isso como qualquer outra falha — declara e continua no ciclo seguinte, sem
derrubar o loop (está escrito no `catch` dele: *«o beacon é conveniência, o trabalho é a
GPU»*). Mas o resultado é que **um espelho avariado pára a publicação para o remoto
principal**, e isso é trocar um risco raro (perder a conta) por um risco frequente
(parar o sync porque o backup tossiu).

Duas saídas, e a escolha é do dono:

| opção | efeito |
|---|---|
| **A — dois push-urls** (acima) | simples, zero código. Um espelho em baixo pára a publicação. |
| **B — push separado, best-effort** | o publicador faz `push origin` e depois, num `try` isolado, `push mirror`. O espelho pode falhar sem consequência. Custa ~10 linhas no `beacon-publisher.mjs`, que é módulo com testes e decisão documentada. |

**Recomendação:** **B**. O espelho existe para o dia mau; não pode ter o poder de
estragar os dias bons. As ~10 linhas pagam-se sozinhas na primeira vez que o
`paulo-vault-mirror` estiver indisponível.

---

## 5. Gate de red-team (as oito perguntas)

| # | pergunta | resposta |
|---|---|---|
| 1 | **fonte de verdade** | O `origin` continua a ser a fonte. O espelho é destino, nunca origem — ninguém lhe faz `pull`. |
| 2 | **escritor único** | Preservado: um publicador, dois destinos. A opção B mantém-no. |
| 3 | **reversível vs irreversível** | Totalmente reversível (`remote set-url --delete --push`). Criar o repo espelho é reversível. |
| 4 | **script-first** | O ensaio de restauro é um script que corre e falha visivelmente. Os números da §2 saíram dele. |
| 5 | **projecção vs 2ª verdade** | O espelho é cópia, não projecção nem segunda verdade — mesma história, mesmos shas. |
| 6 | **degradação graciosa** | É exactamente onde a proposta falha na variante A, e é por isso que a recomendação é a B. |
| 7 | **frozen/allowlist/n-d** | Opção A: zero código. Opção B: toca no `beacon-publisher.mjs` (`tools/cockpit/`, **não congelado**), com testes. `codex` **n/d** nesta máquina. |
| 8 | **custo de reverter** | Um comando. O repo espelho pode ficar lá sem custo. |

**Objecção real produzida:** sim — a §4 refuta a variante óbvia da própria proposta e
muda a recomendação de A para B.

---

## 6. O que pede a mão do dono

1. **GO/NO-GO no espelho privado**, e se sim, **A ou B** (recomendação: B).
2. **Decisão sobre a `.owner.key`**: aceitar que não sobrevive à perda da máquina
   (e confiar na reinscrição Ed25519), ou dar-lhe um caminho de recuperação. *A primeira
   é defensável e é o que está a acontecer por omissão — o que não é defensável é não
   estar decidido.*
3. **`branch protection` no `paulo-vault`** — protege contra o erro do operador, que é o
   risco que o espelho **não** cobre.
4. **Correcção do `retrieve.js`** (§2.2) — uma linha, no repo dele.
