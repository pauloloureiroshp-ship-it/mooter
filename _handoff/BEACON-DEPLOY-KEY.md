# Beacon com chave própria — o que falta, e é um gesto teu

> **Estado: MECANISMO PRONTO, DESLIGADO.** Nada nesta página foi activado.
> A activação é uma ata tua (M10). Código: `tools/cockpit/runner/beacon-publisher.mjs`.

## Porque é que isto existe

Hoje, quando o publicador do beacon está ligado (`MOO_PUBLICAR_BEACON=1`), ele
faz `git push` **com as tuas credenciais**. Isso quer dizer que um processo que
corre sozinho de 10 em 10 minutos empurra com a tua identidade, para qualquer
repositório a que tu tenhas acesso. Não é uma hipótese sobre o código — é o que
uma credencial de utilizador significa.

Duas coisas mudam com este modo:

1. **Chave de deploy só-escrita**, ligada a **um** repositório. Revoga-se sozinha
   sem lhe tocares na conta, e não abre mais nada.
2. **Pasta isolada** — `50-fleet/90-beacons/`. Uma chave de deploy limita o
   *repositório*, não o caminho lá dentro. Com a pasta isolada, uma regra do
   lado do vault pode dizer «esta chave só escreve aqui» sem ambiguidade.

Já ficou feito, sem depender de nada disto: **o publicador deixou de poder
escrever em qualquer sítio do vault.** Antes o caminho vinha de fora e não era
verificado — a defesa era «mas ele só passa beacons», que é uma convenção de
chamada e não uma trava. Agora recusa `00-core/…`, `40-strategy/…`, `../…` e
tudo o que não seja um `.json` dentro de `50-fleet/`.

## O que eu não posso fazer por ti

Criar uma chave é gerar um segredo e registá-lo numa conta tua. Não faço nem uma
coisa nem outra.

## Os passos (≈5 minutos)

**1. Gerar a chave, nesta máquina, sem passphrase** (um agente não pode responder
a um pedido de passphrase de madrugada):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/mooter-beacon -N "" -C "mooter-beacon@$(hostname -s)"
chmod 600 ~/.ssh/mooter-beacon
```

**2. Registá-la no repositório do vault** (só no do vault):

GitHub → repositório do vault → *Settings* → *Deploy keys* → *Add deploy key*
- Title: `mooter-beacon · <nome-da-máquina>`
- Key: o conteúdo de `~/.ssh/mooter-beacon.pub`
- ☑ **Allow write access** ← sem isto o push falha
- Não a adiciones à tua conta pessoal. Uma chave de conta não é uma chave de deploy.

**3. Criar a pasta isolada** e commitá-la uma vez, à mão:

```bash
mkdir -p "$VAULT_PATH/50-fleet/90-beacons"
printf 'Beacons de device, escritos pelo mooter-beacon. Nada aqui é editado à mão.\n' \
  > "$VAULT_PATH/50-fleet/90-beacons/README.md"
git -C "$VAULT_PATH" add 50-fleet/90-beacons/README.md
git -C "$VAULT_PATH" commit -m "chore(fleet): pasta isolada dos beacons"
git -C "$VAULT_PATH" push
```

**4. Ligar** (as duas variáveis, e as duas são precisas):

```bash
launchctl setenv MOO_PUBLICAR_BEACON 1
launchctl setenv MOO_BEACON_PUSH 1
launchctl setenv MOO_BEACON_CHAVE "$HOME/.ssh/mooter-beacon"
```

Se puseres `MOO_BEACON_PUSH=1` **sem** `MOO_BEACON_CHAVE`, ou com um caminho que
não existe, o publicador **recusa-se a publicar**. Não cai para as tuas
credenciais — cair seria o contrário do que este modo existe para fazer.

**5. A guarda do lado do vault (opcional, e é a que morde).** Um hook
`pre-receive` no vault, ou uma *branch protection rule* com *restrict who can
push* + *file path restrictions* em `50-fleet/90-beacons/**`. Sem isto, a chave
está limitada ao repositório mas não ao caminho — o que já é muito melhor do que
hoje, e não é o que ficou desenhado.

## O critério, e porque é que ele ainda é `n/d`

O roadmap pede **3 renovações consecutivas em <15 min** para dar isto por
funcional. Esse número **só se pode medir depois de ligares** — declará-lo
cumprido agora seria inventá-lo. Depois de ligar:

```bash
tail -f ~/.mooter/beacon-renew.log
```

Três linhas seguidas com intervalo <15 min = critério cumprido. Escreve a ata
com essas três linhas coladas. Enquanto não existirem, o critério é `n/d`.

## Como desligar

```bash
launchctl unsetenv MOO_BEACON_PUSH
```

E, se quiseres cortar mesmo, revoga a deploy key no GitHub. A tua conta não é
afectada — é exactamente esse o ponto.
