> **Base:** `feat/onboarding-v2-w0` (PR #491). W1 empilha sobre W0 porque as ondas são sequenciais e W0 ainda não está fundida.

## O achado principal: uma premissa do kickoff estava errada

O kickoff da W1 manda assinar «com a chave pública **já embutida nos beacons**».
**Não existe nenhuma.** Procurado neste repo a 2026-09-10 — `PUBKEY`, `publicKey`,
`BEGIN PUBLIC`, `SPKI`, `chave_publica` em `tools/`, `packages/mooter-bridge/` e
`landing/app/`: **zero** chaves públicas embutidas.

E o que existe não serve, por duas razões diferentes:

- **HMAC** (`assinatura.js`) — chave **simétrica**. Quem verifica consegue assinar. Pregá-la em
  cada cliente é dar a chave de assinar releases a toda a gente que instala o Mooter.
- **Ed25519** (`assinatura.js`) — chave **por device**, verificada contra
  `50-fleet/trusted-devices.json`, que vive no vault **pessoal** do dono. Um cliente instalado
  não tem vault, logo não tem contra o que verificar.

Uma release assinada precisa de uma **terceira** coisa: uma **chave de release**, pública
pregada no cliente, privada com quem corta releases. É isso que este PR define.

## E a decisão que daí sai: falha FECHADA, sem chave inventada

Essa chave exige um segredo que só o dono pode criar. Por isso este PR **não traz chave nenhuma**:

- há um teste que **reprova** se alguém commitar uma `release-pubkey.json`;
- sem âncora, `verificarManifesto()` devolve `sem-ancora` e o `update` **recusa-se a trocar o
  payload**.

A alternativa — deixar passar enquanto não há chave — é exactamente o defeito que o adversário
mediu no updater do bridge: «verifica presença/sintaxe, **não** assinatura». Um verificador que
degrada para «aceito na mesma» não é um verificador; é um comentário.

## Três defeitos medidos, os três fechados

**1. O canal evaporava-se, em silêncio.** O `install.sh` aceita `--channel=` e `MOOTER_CHANNEL`,
guarda o valor em `CHANNEL` (linha 23), e a única coisa que faz com ele é **imprimi-lo** (linha
101). Nada o persiste. O `update` re-executava o instalador, o instalador voltava ao valor por
omissão, e quem escolheu `beta` ficava em `friends-beta` a partir do primeiro update — sem erro,
sem aviso, sem maneira de o notar a não ser reparando que nunca chegam versões do canal.

Passa a vir do `entitlement.json`, escrito **só** pelo serviço de conta (D4). O `profile.json`
fica proibido como fonte, com erro explícito e testado: é auto-declarado pela própria máquina, e
o canal decide **que código é descarregado e executado**.

**2. Não havia verificação.** Agora há — e o `channel` entra **dentro** da assinatura e é
comparado com o canal pedido. Sem isso, um manifesto `beta` **autêntico** servido a quem pediu
`stable` passava, e o atacante nem precisa de forjar nada: serve o ficheiro errado. Também entram
no corpo assinado `version`, `url`, `sha256` e `released` — o `sha256` obrigatoriamente, senão
trocava-se binário e hash ao mesmo tempo e a assinatura continuava válida sobre um manifesto que
já não descreve o que se descarrega.

**3. Não havia volta.** Entram `cli.prev`, troca por `rename` e `mooter update --rollback`
(estado B14 do mapa).

Sobre o `rename`: um `cp -r` tem uma janela — às vezes segundos — em que a pasta que o Mooter
está a correr está meio escrita; morrer aí deixa no disco um cruzamento das duas versões que não
existe em release nenhuma. E a ordem importa: entre `cli → cli.prev` e `cli.next → cli` há um
instante em que `cli` **não existe**. Se a segunda falhar sem reposição, a máquina fica **sem
payload** — pior do que a versão velha, que é a única coisa que um update nunca pode fazer. Há
um teste para isso.

## O que entra

| Ficheiro | O que faz |
|---|---|
| `tools/cli/lib/entitlement.js` | o canal, e de onde **não** vem |
| `tools/cli/lib/manifesto.js` | forma + assinatura + anti-rebaixamento |
| `tools/cli/lib/payload-troca.js` | troca atómica, `cli.prev`, rollback |
| `tools/cli/lib/update-core.js` | a decisão, testável sem rede e sem disco |
| `tools/cli/commands/update.js` | reescrito; `--check` não escreve nada |
| `tools/router/moo-verify.js` | `moo-verify manifest <f>` — a **mesma** função que o update corre |
| `landing/app/release/[canal]/manifest.json` | espelho do GitHub Releases; **nunca assina** |
| `plugin/mooter/skills/mooter-atualizar/` | `/mooter-atualizar` |

A rota do site é um **espelho** de propósito: se assinasse, a chave privada de release viveria no
runtime da Vercel e passaria a ser alcançável por qualquer defeito de execução remota nesta app.
O cliente não confia nela — verifica a assinatura contra a chave que traz pregada.

## Testes

**28 novos** (`tools/cli/lib/update-canal.test.js`), sem rede e sem tocar no `~/.mooter` de
ninguém — a suite do `packages/cli` já apagou o `~/.mooter` vivo de quem a correu, duas vezes
(2026-08-05 e 2026-08-20), e essa lição vale para toda a gente que escreve testes que sabem onde
é a casa. Entre eles:

- mexer em **qualquer um dos 5 campos cobertos** invalida a assinatura;
- rebaixamento de canal (manifesto `beta` autêntico servido a quem pediu `stable`);
- «uma troca falhada não deixa a máquina **sem payload nenhum**»;
- «o repo **não** commita uma chave de release».

## Portões

- ✅ `tools/router`: **1109/1109** (1 skip pré-existente)
- ✅ `landing`: **232/232** · `tsc --noEmit` limpo
- ✅ `classify.js` intacto: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- ✅ `patterns.js` intacto · **0 linhas** alteradas em `packages/`
- ✅ `SYNC.md` a 177 linhas; a história de 2026-09-09 foi **movida** (nunca apagada) para
  `docs/foundation/SYNC_ARCHIVE_2026.md`
- ✅ Stage explícito, ficheiro a ficheiro

## Defeito registado, deliberadamente **não** corrigido

`UserPromptSubmit · loader:1520` fica em `_handoff/onboarding-v2/DEFEITOS.md` (W1-D1) com causa
`n/d`: o `loader:1520` é do **carregador de plugins do Claude Code**, não deste repo. Descartado
por medição neste worktree que seja erro de sintaxe (`node --check` passa), excepção ou saída ≠0
(corre e sai 0, mudo), ou hook declarado em dois sítios (há uma só declaração). Sobra uma
hipótese — `${CLAUDE_PLUGIN_ROOT}` a expandir vazio — e está escrita **como** hipótese.

Não se corrige por adivinhação um defeito cuja causa não se mediu: uma correcção sem reprodução
não se distingue de uma alteração ao acaso, e passa a **esconder** o defeito real.

Importa mais do que parece: um hook que não carrega conta como **desobediência do host**, e a
medição de W4/W6 (**R9**) não sabe distinguir «o host ignorou» de «o hook nunca lá esteve».

## `n/d` declarado

`mooter update` **ainda não aplica nada**. Sem chave de release publicada não há manifesto
assinado para descarregar, e escrever um descarregador que nunca correu contra um artefacto real
seria código por provar a fingir que está provado. `correr()` recusa com `sem-descarregador`, e
isso está **impresso no ecrã** em vez de escondido. O passo que falta é do dono: gerar o par de
release e publicar a pública.

## Não faz

Não toca no `classify.js` nem no `patterns.js`. Não gera chaves. Não escreve o CI de release
(precisa da chave primeiro). Não funde nada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCFBbpAPoAQyZ45iF1VJbM
