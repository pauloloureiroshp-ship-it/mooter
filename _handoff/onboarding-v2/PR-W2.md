> **Base:** `feat/onboarding-v2-w1` (PR #492). As ondas são sequenciais e nenhuma está fundida ainda.

## O achado — e só apareceu ao construir a rota

O kickoff pede `GET /i/<token>.mcpb`. A rota `/i/<token>` que já existe faz **`redeem`**, e o
código de instalação é de **uso único**.

Servir o bundle por ali **consumia-o**: a pessoa descarregava o ficheiro e ficava **sem código
nenhum** para colar no diálogo do Claude Desktop — e o erro aparecia só no passo seguinte, longe
da causa, com o aspecto de «o teu código expirou» quando na verdade tinha sido o próprio download
a gastá-lo.

A solução já existia desde a wave 6: **`peek_install_token`**, escrito precisamente para validar
sem consumir (é o que `/api/install/validate/[token]` usa). Há um teste para **cada lado** — o
`.mcpb` faz peek, o script continua a fazer redeem — porque a forma de isto voltar é alguém
"simplificar" as duas para a mesma chamada.

## A decisão que o kickoff deixou em aberto, fechada no ADR (D3.1)

O kickoff dizia, literalmente: «token no `user_config.default` **ou** deixado vazio para o
diálogo pedir — decidir no ADR; default: pré-preenchido, single-use».

**Fica vazio.** O adversário já tinha dito «bundle copiável = credencial copiável; o token actual
é single-use/24 h e **nunca entra no artefacto**». Pré-preencher é reintroduzir exactamente isso,
com o argumento de que a janela é pequena.

Mas **a janela não é o risco: o artefacto é.** Um `.mcpb` descarregado aterra em `~/Downloads`,
que em muitas máquinas está sincronizado com iCloud ou OneDrive; é reenviado a um colega que
pergunta «como instalaste isso?»; e fica em cópias de segurança. Um segredo dentro de um ficheiro
que a pessoa trata como um instalador vai ser tratado como um instalador.

**Custo de não pré-preencher:** uma colagem, num campo que o host já mostra e que é
`sensitive: true`. **O que se ganha:** o artefacto deixa de ser um segredo — pode ser cacheado,
espelhado e reenviado sem comprometer ninguém.

Como o bundle passa a ser **igual para toda a gente**, validar o código na rota deixa de ser
segurança. Continua lá — para dar um erro legível a quem já tem o código expirado, em vez de o
mandar descobrir isso mais tarde — e está escrito assim no código, para ninguém confundir aquilo
com uma protecção.

## O launcher: 200 linhas, zero dependências, zero lógica de produto

Os três números são guardados por teste **e** pelo empacotador, que **recusa empacotar** um
launcher que os viole. Um teste avisa; um empacotador que recusa impede.

Isto não é minimalismo por gosto. **O risco real de um launcher não é ter um bug — é deixar de
ser um launcher:** tudo o que ele souber fazer sozinho é uma coisa que deixa de se poder
actualizar pelo canal do W1, e volta a ficar presa à versão do dia da instalação.

| Guarda | Como é imposta |
|---|---|
| ≤ 200 linhas | teste + `verificar()` no `pack-mcpb.mjs` |
| 0 dependências não-builtin | teste + `verificar()` |
| 0 lógica de produto | teste que varre o ficheiro |
| token sem `default` | teste + `verificar()` (D3.1) |

## O bundle é reproduzível — e isso é identidade, não higiene

Timestamp fixo, sem compressão: **dois builds do mesmo commit dão o mesmo sha256**. Sem isso uma
assinatura de release não identifica nada — havia dois hashes para o mesmo código e ninguém sabia
qual era o certo.

E a prova corre contra o **`unzip` do sistema**, não contra o nosso próprio leitor: a prova que
interessa não é o nosso escritor concordar com o nosso leitor. O manifesto extraído é comparado
**byte-a-byte** com o do disco.

Medido: **2 ficheiros, 9 713 bytes**.

## Bootstrap (estados B1 e B2)

O launcher só atende MCP quando **não** há payload. Com payload, delega com `stdio: 'inherit'` e
sai com o código do payload — o host vê o que o payload viu, não o que o launcher achou.

- **B1** — pergunta antes de descarregar (elicitation, e só se o cliente **declarar** que sabe
  perguntar), **uma vez por sessão**, e um NÃO não descarrega nada.
- **B2** — sem rede diz «Sem rede não consigo descarregar o Mooter. Tento outra vez quando
  houver.», nunca um `ENOTFOUND`. **E um erro que não é de rede não se disfarça de falta de
  rede** — há teste para os dois sentidos. Uma mensagem simpática aplicada ao erro errado é uma
  mentira educada.

**Degrada como o W1, de propósito:** sem chave pública de release não há descarregador, e o texto
diz exactamente isso. Um launcher que descarregasse sem verificar seria a porta que o resto do
sistema fechou.

## Pacote novo em `packages/` — allowlist registada

`CLAUDE.md` ganha a entrada, como a regra exige **mesmo para adições**: o congelamento é
documentário, e uma edição não registada é indistinguível de uma violação. Precedente exacto: a
onda 58 (`packages/router/src/`, só ficheiros novos) e as 4 linhas de `fleet-ui.html` a
2026-08-28, apanhadas por commitarem sem entrada.

**Zero linhas alteradas em qualquer pacote existente.**

## CI

- `packages/launcher/**` entra nos filtros de caminho (push **e** PR). Sem essa linha o pacote
  nascia fora do CI — que é como a suite do cockpit correu à solta até 2026-08-18.
- O `pack-mcpb.mjs` corre no CI e **não só na release**, porque um portão que só corre no dia da
  release descobre o problema no pior dia possível.

## Portões

- ✅ `packages/launcher`: **31/31**
- ✅ `landing`: **239/239** · `tsc --noEmit` limpo
- ✅ `tools/router`: 1109/1109 (inalterado)
- ✅ bundle: 2 ficheiros, 9 713 bytes, sha256 estável entre builds
- ✅ `classify.js` intacto: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`
- ✅ `SYNC.md` a 191 linhas · stage explícito, ficheiro a ficheiro

## `n/d` declarado — o TTV

O DoD nº 1 pede «Mac limpo → `.mcpb` → 1.º recibo, **TTV cronometrado**». Exige uma **conta de
utilizador nova** e um **duplo clique no Finder**: nenhuma das duas é acessível a este executor.

Fica em `_handoff/onboarding-v2/DEFEITOS.md` (W2-D1) com a separação explícita:

| Provado | Por provar |
|---|---|
| o bundle constrói, é reproduzível, abre no `unzip` do sistema | que o Claude Desktop **aceita** este `manifest_version` |
| o manifesto sai byte-a-byte | que o diálogo de `user_config` aparece como se espera |
| o launcher delega com `stdio: 'inherit'`; B1/B2 dizem o que o mapa manda | quanto tempo tudo demora |

Um TTV inventado seria pior do que `n/d`: `n/d` diz a verdade, e um número inventado entra em copy.

## Não faz

Não toca no `classify.js` nem no `patterns.js`. Não altera pacote existente nenhum. Não assina o
bundle (a chave de release ainda não existe — W1). Não funde nada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCFBbpAPoAQyZ45iF1VJbM
