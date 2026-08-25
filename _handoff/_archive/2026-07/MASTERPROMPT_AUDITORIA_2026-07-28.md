# MASTERPROMPT — auditoria adversarial da sessão de 2026-07-27/28

**Cola isto numa sessão nova.** Não é um pedido de revisão: é um pedido de
refutação. A tua tarefa não é confirmar que está tudo bem — é **provar que não
está**, e só dizer que está depois de teres tentado a sério e falhado.

---

## Regras do auditor

1. **Adversarial por omissão.** Cada afirmação abaixo é uma hipótese a abater.
   Procura o contra-exemplo primeiro. Se não o encontrares, diz explicitamente
   *"tentei refutar assim e assim, não consegui"* — não basta dizer "confirmado".
2. **Prova ou `n/d`.** Cada veredicto traz **ficheiro:linha**, output de comando,
   ou sha. Sem prova, o veredicto é `n/d — não consegui verificar porque X`.
   Um `n/d` honesto vale mais do que um ✅ por simpatia.
3. **Nunca inventes um número.** Se não mediste, não escrevas.
4. **Busca vazia = vocabulário errado, não ausência.** O código está em inglês,
   os comentários em português. Antes de concluíres que algo não existe com 0-1
   resultados, tenta sinónimos EN+PT e marcadores estruturais (nomes de classes,
   ids, chaves de JSON). Esta regra existe porque já custou uma entrega
   declarada como vazia quando estava lá.
5. **Não confies numa worktree.** Perguntas de existência só na raiz real
   (`C:\Users\Paulo Loureiro\frugal`). Uma worktree noutro branch responde
   "não existe" com toda a confiança do mundo.
6. **Leitura apenas.** Não comitas, não empurras, não apagas, não instalas.

---

## Parte 1 — As afirmações a abater

Verifica **uma a uma**. Todas são desta sessão.

### A. Git e estrutura

| # | Afirmação | Como refutar |
|---|---|---|
| A1 | Existem 8 commits novos e o HEAD local é igual ao remoto | `git log --oneline -10` e comparar `git rev-parse HEAD` com `git ls-remote origin chore/mooter-20-h0` |
| A2 | Nenhum commit usou `git add -A` | ver o número de ficheiros por commit e se algum apanhou coisas não relacionadas |
| A3 | Os untracked caíram de ~690 para ~83 | `git status --porcelain \| grep -c '^??'` — e ver **o que sobra**: é lixo ou é trabalho por commitar? |
| A4 | Os 18 `.jsonl` versionados estão protegidos do padrão largo | `git ls-files '*.jsonl'` e `git check-ignore -v` em cada um. **Nenhum pode ser apanhado** |
| A5 | O `.gitignore` novo não ignora nada que devesse estar versionado | procurar padrões demasiado largos; testar `git check-ignore` em ficheiros de código reais |
| A6 | A worktree `frugal-super-auditoria` foi removida e não ficou lixo | `git worktree list` e `git branch --list 'mooter/*'` |

### B. Testes e gates

| # | Afirmação | Como refutar |
|---|---|---|
| B1 | **404 testes verdes em 32 ficheiros**, zero vermelhos | correr **todos** os `*.test.js` de `packages/mooter-bridge`, um a um, e somar. **Não aceites o `npm test` agregado** sem veres a contagem por ficheiro |
| B2 | O `pack-mcpb.mjs` recusa escrever o `.mcpb` se a entrega estiver regredida | **teste negativo**: numa cópia, parte um marcador (ex.: renomeia `eta-track` no `fleet-ui.html`), corre o pack, e confirma que **nenhum ficheiro foi escrito** |
| B3 | O gate corre 76 verificações de conteúdo | `node --test entrega.test.js` |
| B4 | `entrega.test.js` cobre **todas** as versões declaradas, não só a actual | ler `entregas-por-versao.json` e confirmar que cada chave gera testes |
| B5 | `classify.js` está intacto | sha256 tem de ser `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` |
| B6 | A bridge entrou no CI | ler `.github/workflows/test.yml`; confirmar os passos e que os `paths` incluem `packages/mooter-bridge/**` |
| B7 | O `sync:check` ficou **de fora** do CI de propósito, com o porquê escrito | se o porquê não estiver no ficheiro, é uma omissão disfarçada de decisão |

### C. Os bugs de honestidade que dizemos ter fechado

| # | Afirmação | Como refutar |
|---|---|---|
| C1 | A ETA deixou de dizer "faltam 0 s" com o job vivo | `estimativa.js`: com `steps_done > steps_total` tem de sair `null` **com porquê**; com `passo >= de` e job vivo, idem. Tenta construir um input que ainda produza `0` |
| C2 | O E3 (vivacidade) **nunca** influencia o tempo | procura qualquer caminho em que `bytes_*` entre no cálculo de `falta_s`. Se entrar, é uma regressão grave |
| C3 | A categoria lê o objectivo e ignora o rodapé de regras | `aprender.categoryForGoal` com (a) objectivo de código + rodapé de git ⇒ `codigo`; (b) objectivo de git ⇒ `git_deploy`. **Tenta um terceiro caso que parta os dois** |
| C4 | O histórico não foi reclassificado | as observações antigas mantêm a categoria com que nasceram |
| C5 | As recusas do `observeTerminal` deixaram de ser silenciosas | tem de existir `eta_observacao_recusada` no ledger, com `porque` |
| C6 | Um evento de diagnóstico não é lido como estado | `NON_STATE_EVENTS` inclui `eta_observacao_recusada`; `toolCancel` continua idempotente **depois** de um diagnóstico ser escrito |
| C7 | O selector tem tecto de VRAM e o residente é isento | `moo.js`: `FOLGA_MINIMA_GB`; e um modelo já carregado continua elegível |
| C8 | `falta_vram` é motivo distinto de `forcado_por_quota` | procurar os dois no ledger e no board |

### D. O cargo e o recibo (v1.26.0)

| # | Afirmação | Como refutar |
|---|---|---|
| D1 | O cargo é **declarado**, nunca inferido | tenta fazer o sistema atribuir um cargo a partir do texto. Se conseguires, é um bug |
| D2 | Cargo inválido é recusado com a lista dos válidos | passa `cargo:'XPTO'` |
| D3 | Sem declaração ⇒ `n/d` com porquê, nunca omitido nem adivinhado | |
| D4 | `entregas` conta **waves fechadas**, não jobs | uma wave com 3 jobs `done` tem de ser **1** entrega |
| D5 | Um cargo sem trabalho aparece com zero e porquê | não pode desaparecer da lista |
| D6 | O veredicto do moo **nunca** derruba o recibo | simula o moo em baixo; o recibo tem de sair completo com `veredicto: n/d` |
| D7 | O veredicto não pode alterar nenhum número | confirma que o moo recebe os números já calculados |

### E. O que está mesmo instalado e a correr

| # | Afirmação | Como refutar |
|---|---|---|
| E1 | O conector a correr é a **v1.26.0** | não olhes para o repo — usa o `mooter_setup`/`mooter_fleet` e vê o que o **processo** reporta |
| E2 | O bundle instalado é o que o repo produz | sha256 do `.mcpb` = `965c352a87cd7dfda17de1abf7186eaad2ddeaf3caf438cd5a4779e7fbced6e0` |
| E3 | A vista `view:'recibo'` existe e responde | |
| E4 | O pulso por cargo aparece quando a wave fecha | |

---

## Parte 2 — Prova em uso, não em código

Testes unitários provam funções. **Correm sem o produto estar ligado.** Esta
parte só conta se for feita **através do Mooter**, com jobs reais.

1. **Dispara um job em cada agente** (`moo`, `cc`, `codex`, `gemini`) com uma
   pergunta de **resposta verificável** — algo cuja resposta certa se conhece de
   antemão (uma constante num ficheiro, uma contagem, um valor de JSON).
   Regista, por agente: **acertou?** · custo · duração · tier pedido vs usado ·
   local ou nuvem.
   **O Gemini está morto desde 24/07 (`IneligibleTierError`).** Ele entra na
   bateria e a falha aparece com o erro real — um agente morto que aparece como
   morto é informação; um que desaparece da lista é uma frota que mente sobre o
   seu tamanho.
2. **Enquanto um job está vivo**, chama o `mooter_check` e olha para o bloco
   `estimativa`. Confirma que **não** aparece "faltam 0 s" com o job a trabalhar,
   e que o `vivo` e a `falta_s` **não se contradizem**.
3. **Declara um cargo** num job e confirma que ele chega ao recibo.
4. **Abre o artefacto `mooter-recibo-de-fecho`** e compara os números com os do
   `mooter_fleet`. Se divergirem, um dos dois mente.

**A régua que interessa não é tokens por segundo — é custo por resposta certa.**

---

## Parte 3 — As perguntas de MEO

Estas não são técnicas. Responde-as como quem decide onde pôr dinheiro e tempo.

1. **O produto ficou mais honesto, ou só mais verboso?** Conta quantos `n/d`
   novos existem. Cada um substituiu uma mentira, ou só substituiu um número
   útil por uma desculpa? **Dá exemplos dos dois lados.**
2. **Alguma coisa entregue nesta sessão muda uma decisão do MEO?** Se a resposta
   for "não, mas é mais correcto", isso é dívida técnica bem escrita — não é
   produto.
3. **O trabalho local subiu?** A métrica `trabalho_zero_pct` estava em **30%**
   com faixa `[45, 100]`, fora há mais de 31 h, dono **MOO**. O tecto de VRAM
   entrou para atacar uma das causas. **Mexeu?** Se não mexeu, a hipótese estava
   errada e é preciso dizê-lo.
4. **Quanto custou o dia e quanto poupou?** Custo total medido vs jobs que
   correram a $0. E: **quantos jobs não têm custo reportado?** Um total com 20%
   de cobertura em falta não é um total.
5. **O que é que ficou PIOR?** Alguma coisa ficou mais lenta, mais frágil, ou
   mais difícil de perceber? Procura a resposta a sério — uma sessão com 8
   entregas e zero regressões é improvável.
6. **Que promessa foi feita e não cumprida?** Procura no histórico da sessão o
   que foi anunciado como feito e não está.
7. **Se metade do que foi entregue hoje fosse apagada, o que faria falta?** A
   outra metade é candidata a ser removida.
8. **Os seis cargos servem para alguma coisa?** O critério é um só: o recibo
   consegue dizer-te **que cargos podes ignorar hoje**? Se não conseguir, é
   cerimónia e deve ser cortado.
9. **O que é que ainda não se sabe medir?** Lista as métricas em `n/d`
   permanente (ex.: `keep_rate_pct`) e diz se é por não ser medível ou por
   ninguém ter feito o trabalho.
10. **Qual é a coisa mais provável de estar partida sem ninguém saber?** Aponta
    uma, com o raciocínio.

---

## Parte 4 — Armadilhas conhecidas (não caias nelas outra vez)

| Armadilha | O que aconteceu |
|---|---|
| **Bateria parcial** | correram-se 11 de 29 ficheiros e chamou-se-lhe "140 testes verdes". Conta os ficheiros antes de somar |
| **`Out-Null` no git** | um `index.lock` stale fez todos os `git add` falharem e o script disse "SEM NADA PARA codigo" **sem um único erro à vista** |
| **Worktree no branch errado** | uma onda foi despachada para uma worktree cujo branch não tinha os ficheiros; o agente não podia entregar e não sabia porquê |
| **Sandbox do Codex** | `npm test` bloqueado por `spawn EPERM` produz um `n/d` que **parece** verde. Verifica sempre por fora |
| **Auto-referência** | o `SYNC.md` contém o HEAD; commitá-lo muda o HEAD. O `--check` mascara essa linha — confirma que só mascara essa |
| **Falso verde do agregado** | um `# pass` global pode esconder um ficheiro que nem chegou a correr |

---

## Formato da resposta

1. **Tabela de veredictos** — uma linha por afirmação: `CONFIRMADA` /
   `REFUTADA` / `n/d`, com a prova (ficheiro:linha, output, ou sha).
2. **O que me preocupa** — no máximo 5 pontos concretos que ninguém pediu.
3. **As dez perguntas de MEO**, respondidas com números.
4. **Uma recomendação só**: qual é a próxima coisa a fazer, e porquê essa e não
   outra.

Português de Portugal. Denso. Sem elogios.
