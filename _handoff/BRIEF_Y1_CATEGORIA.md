# BRIEF Y1 — a telemetria está a classificar as minhas regras, não o trabalho

**Medido hoje, no `~/.mooter/eta-index.json` real:**

```
moo|git_deploy|<4k      n=7    cc|git_deploy|<4k     n=10
cc|git_deploy|4-32k     n=6    codex|git_deploy|4-32k n=2
moo|codigo|<4k          n=1
```

Quase tudo é `git_deploy`. Um job de *"implementa o tecto de VRAM"* e um de
*"commita isto"* caem na mesma chave, e a mediana mistura os dois.

**A causa está em `aprender.js:11-13`.** `git_deploy` é o **primeiro** padrão da
lista e apanha `\b(git|commit|push|merge|…)\b`. E todos os briefs desta casa
terminam com *"git add selectivo, sem push"*. **A instrução que existe para
proteger o repo é a que envenena a telemetria.**

**E a consequência é pior.** Em `aprender.js:214`:

```js
if (input.escrita === true || category === 'git_deploy' || category === 'auditoria') return null;
```

`recomendarAgente` recusa-se a recomendar quando a categoria é `git_deploy`.
Como tudo é `git_deploy`, **o loop de auto-aprendizagem nunca disparou uma única
vez em produção** — e ninguém deu por isso, porque devolve `null` educadamente.

---

## S1 — O classificador lê o objectivo, não as regras

**Decisão tomada, não reabrir:** separar objectivo de regras.

O princípio tem de caber numa frase e ser previsível: **o objectivo é o que vem
antes das instruções de processo.** Escolhe a heurística mais simples que
consigas defender — a primeira frase é uma candidata óbvia — e **documenta-a no
código**, porque quem escrever o próximo brief precisa de saber onde acaba o
objectivo.

Requisitos:

1. Um bloco de regras no fim (git, não tocar em X, sem push, português nos
   comentários) **não pode** decidir a categoria.
2. Um objectivo que fale genuinamente de git (*"reconcilia os branches órfãos"*)
   **continua** a ser `git_deploy`. Não trocar um falso positivo por um falso negativo.
3. `mooter_work` passa a aceitar `category` explícita como **override**; quando
   vem, ganha sempre e a fonte fica registada (`category_fonte: 'declarada'` vs
   `'inferida'`) — quem lê a métrica tem de saber se ela foi adivinhada.
4. **Não reclassificar o histórico.** As observações antigas ficam como estão,
   com a categoria que tinham. Reescrever o passado com regras novas é a
   fabricação que este produto existe para evitar. Se quiseres marcar as antigas,
   marca-as como `categoria_legado: true` — nunca lhes mudes o valor.

## S2 — O veto do `recomendarAgente` deixa de ser cego

Com as categorias corrigidas, o veto de `git_deploy` volta a fazer sentido — mas
o problema de fundo mantém-se: **um `null` silencioso é indistinguível de
"ainda não sei"**.

`recomendarAgente` passa a devolver sempre um objecto com `porque`:
`{ agente: null, porque: 'a categoria git_deploy tem veto: um erro aqui é
irreversível' }` vs `{ agente: null, porque: 'só há 3 observações; são precisas
5' }`. Quem chama continua a poder ignorar, mas deixa de confundir veto com
falta de dados.

## S3 — Contar as perdas do `observeTerminal`

| Agente | `done` no ledger | observações no índice | captura |
|---|---|---|---|
| cc | 44 | 16 | 36% |
| moo | 42 | 8 | 19% |
| **codex** | **21** | **2** | **10%** |

Parte explica-se (o índice nasceu hoje), mas os rácios deviam ser parecidos e
não são. O `observeTerminal` devolve `ok:false` **em silêncio** quando não
consegue ler o `meta.json`, o `masterprompt.md` ou a duração.

- Registar cada recusa no ledger como evento próprio (`eta_observacao_recusada`)
  com o `porque` e o `job_id`. Um evento por recusa, não um contador agregado.
- Expor no `mooter_fleet view:'afericao'` (ou onde fizer mais sentido) a taxa de
  captura por agente. **Uma amostra com buracos que não se conhecem é pior do
  que uma amostra pequena que se conhece.**

## S4 — Testes

Em `aprender.test.js` (estender) e onde fizer sentido:

1. um goal com objectivo de código e rodapé de regras de git ⇒ categoria `codigo`, **não** `git_deploy`;
2. um goal cujo OBJECTIVO é git ⇒ continua `git_deploy`;
3. `category` explícita ganha sempre e regista `category_fonte: 'declarada'`;
4. `recomendarAgente` distingue veto de falta-de-dados no `porque`, em vez de dois `null` iguais;
5. uma recusa do `observeTerminal` produz um evento no ledger com o `porque` — não desaparece;
6. o histórico **não** é reclassificado: uma observação antiga mantém a categoria com que nasceu.

## Regras da casa

*(este bloco é exactamente o tipo de texto que NÃO pode decidir a categoria)*

- `git add` **selectivo**, ficheiro a ficheiro. Nunca `git add -A`. Sem push, sem PR.
- Não tocar em `tools/router/classify.js` (FROZEN) nem em `landing/app/page.tsx`.
- Português nos comentários, inglês nos identificadores.
- Nenhum número sem origem. Se não foi medido, é `n/d` **com o porquê**.
- Se um passo não puder ser feito com honestidade, **parar e escrever o porquê**.
