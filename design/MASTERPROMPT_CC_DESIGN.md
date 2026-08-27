# MASTERPROMPT — Design e Interface do Mooter
### v2.0 · 2026-08-27 · direcção **fixada** · janela `frugal@97ad846b`

> Cola isto inteiro numa sessão do Claude Code com custódia do repo.
> A direcção já está escolhida. Este documento existe para que **nunca mais se escolha** —
> só se aplique.

---

## 0 · A direcção, e porquê

**Papel Milimétrico.** Desenho técnico: grelha de 8 px visível, coluna de margem para anotação,
cotas com linha de chamada, hairlines em vez de caixas, precisão como estética.

Não foi escolhida por ser a mais espectacular. Foi escolhida porque é **a única das cinco que
sobrevive às catorze superfícies do Mooter** — landing, cockpit, fleet-ui, statusline, deck, PDF.
Um design system tem de extender; impressionar num sítio só é um cartaz.

Três razões que a decidem:

1. **É o produto.** O Mooter é um classificador determinista: onze passes de regex, zero ML.
   Desenho técnico é a linguagem visual do determinismo. Um campo de partículas diz *magia de AI*;
   um desenho cotado diz *medido*.
2. **É a mais difícil de falsificar.** Vive de alinhamento — exactamente o que um gerador erra.
   A auditoria provou-o: a linha de base estava em 33 %.
3. **Carrega a doutrina do número nativamente.** Um desenho técnico anota cada medida com o valor
   e a unidade. Isso é `fonte` + `janela` por construção, não por disciplina.

**Os papéis das outras quatro** — nenhuma foi deitada fora sem razão escrita:

| direcção | papel | porquê |
|---|---|---|
| **O Sinal** | o **único** momento extremo da página (regra 10) | a página correr o classificador é a prova, mas uma por página |
| **O Recibo** | a doutrina do número | `fonte` e `janela` coladas a cada cifra, em todas as superfícies |
| **Dois Terminais** | **uma secção**, nunca a linguagem | a comparação é um argumento, não uma gramática |
| **A Manada** | **reformada** | metáfora sem medição — e campo de partículas é o que 2026 já tem a mais |

---

## 1 · A gramática, em sete linhas

Tudo o que se construir daqui para a frente obedece a isto. Está em código em
`design/tokens/moo-ui.css` — **não se reescreve, importa-se**.

```
.moo-mm         a grelha de 8px, faint, position:absolute inset:0
.moo-folha      padding 0 80px, position:relative
.moo-secao      grid 216px 1fr · border-top 1px · padding 48px 0
.moo-marg       a coluna de margem: mono 10px, .16em, caixa-alta, alinhada à DIREITA
.moo-cota       linha de chamada: stroke accent 1.1px
.moo-cartucho   o cartucho: identificação à esquerda, revisão à direita
.moo-ent/-traco/-pulso   as três animações da família (a quarta, mola, é inline)
```

**Regras que não se negoceiam:**
- A anotação vive **na margem**, alinhada à direita. Nunca num cartão colorido.
- Hairline `1px solid var(--moo-line-strong)` separa secções. **Não há caixas.**
- **Um** momento extremo por página. Um.
- Rosa `--moo-accent` só em: o `?` do wordmark, as cotas, e o CTA. Mais nada.
- Movimento: quatro curvas (`entrada` `reacção` `respiração` `mola`) e mais nenhuma.

---

## 2 · Receita — construir QUALQUER superfície nova

```html
<div class="moo-folha" style="position:relative">
  <div class="moo-mm"></div>

  <div class="moo-cartucho">
    <span>MOOTER · &lt;O QUE É&gt; · DES. NNN</span>
    <span>ESC 1:1 · REV &lt;versão&gt; · &lt;data&gt;</span>
  </div>

  <!-- HERO: o único momento extremo -->
  <div style="padding:96px 0 48px">
    <div class="moo-ent" style="--d:80ms;font-size:136px;font-weight:300;letter-spacing:-.06em;line-height:.84">…</div>
    <div class="moo-ent" style="--d:180ms;font-size:136px;font-weight:700;letter-spacing:-.06em;line-height:.84">…</div>
  </div>

  <!-- cada bloco é uma secção com margem -->
  <div class="moo-secao">
    <div class="moo-marg">rótulo<br><b>valor</b></div>
    <div>… conteúdo …</div>
  </div>
</div>
```

**Ordem de leitura da margem:** o que a secção É, depois o número que a governa, depois a ressalva.
Nunca prosa: a margem é telegráfica.

---

## 3 · Apresentações — decks e PDFs travados

**Slide** = uma `moo-folha` de **1920 × 1080**, `padding: 0 128px`, cartucho em cima, um único
`moo-secao` no meio, número de folha no canto inferior direito. Um slide, uma ideia, um extremo.

**Relatório PDF** = uma `moo-folha` de **794 px** (A4 a 96 px/pol), `padding: 0 64px`, secções
empilhadas, e o cartucho repetido no topo de cada página.

**A regra que trava tudo:** o conteúdo dos dois vem **só** de
`40-strategy/2026-08-25-pitch-registro-metricas-medidas.md`. Cada cifra entra pelo componente de
número honesto, com `fonte` e `janela`. Negativos na mesma tipografia dos positivos — por
construção do componente, não por revisão.

**Para editar um deck depois:** muda-se o registo, regenera-se. **Nunca se edita o slide.**

---

## 4 · Ficheiros — o que se toca e o que nunca se toca

| ficheiro | quem edita | regra |
|---|---|---|
| `design/tokens/moo-tokens.json` | **só aqui, à mão** | a fonte. Um sha. |
| `design/tokens/moo-ui.css` · `.ts` | `moo-tokens-build.mjs` | **gerado.** Editar é defeito que o portão apanha (v4). |
| `design/brand/*.svg` | à mão, raramente | silhueta intocável (decisão 27/08) |
| `design/DESIGN.md` · `DIRETRIZES.md` | à mão | o que o grep não apanha |
| `design/tools/*` | à mão | o portão e o auditor |
| `landing/` · `tools/cockpit/` · `plugin/` · `packages/` | à mão | **importam, nunca redefinem** |

**Comandos:**
```bash
node design/tools/moo-tokens-build.mjs      # json → css + ts
node design/tools/moo-design-check.mjs      # o portão: 8 verificações, índice 0–10
node design/tools/moo-design-check.mjs --ci # sai 1 abaixo do limiar
node design/tools/moo-visual-audit.mjs      # o auditor: renderiza e mede (precisa de browser)
```

---

## 5 · As ondas

Cada uma fecha com **gate numérico**. Sem o número, a onda não fecha.
Publicar o índice **antes** e **depois** — subiu ou não.

### O0 · Fundação — 1 dia
Copiar o pacote para `design/`. `moo-tokens-build`. Ligar `moo-design-check --ci` ao CI.
Publicar o índice no beacon como **8.ª linha do Índice do Harness**. `git add` do `moo-panel`
(40 KB de UI viva fora do git hoje).
**GATE:** índice publicado · CI verde com o check ligado · zero UI untracked.

### O1 · Site
`globals.css` passa a `@import '../../design/tokens/moo-ui.css'` e **perde todas as definições
próprias de token**. `mooter-event.ts` lê `TIER_*` do `moo-tokens.ts`. A home passa à gramática
do §2: cartucho, hero de dois pesos, secções com margem, o classificador vivo como único extremo.
`<MonoNum>` exige `fonte` e `janela` em TypeScript — um número sem proveniência **deixa de
compilar**. Remover `~30% less` (2×) e `47% smaller`.
**GATE:** `fonte-unica` 2,0/2,0 · `numero-honesto` 2,0/2,0 · `linguagem` 1,0/1,0 · suite `landing`
**219/219** · `tsc` falha num `<MonoNum>` sem `fonte` (teste que o reproduz).

### O2 · Cockpits
`moo-pilot-shell` inline do `moo-ui.css` no build · `cockpit.html` **passa a ser gerado** (mata os
20 dias de atraso na origem) · `fleet-ui` mantém `var(--moo-*, fallback)` para herdar o host ·
os primitivos escritos 3× passam a um só sítio (**~1 374 linhas** hoje).
**GATE:** CSS duplicado **< 200 linhas** (medir antes e depois, publicar os dois) · três cockpits
com o mesmo acento · um teste prova que mudar o JSON aparece no `cockpit.html`.

### O3 · Terminal e recibos
`subagent-statusline.js` e `cockpit-render.js` lêem `MOO.color.tier.terminal` — o T2 amarelo é
**desenho**, escrever o motivo ao lado. ⚠️ `STATUSLINE_FORMAT_LINES` ainda começa por
`"🐮 saved $X today"` — viola a decisão de 24/08. As 7 skills emitem recibo por **um** template.
**GATE:** grep de `saved $` e `savings` = **0** · um só cabeçalho de recibo.

### O4 · Distribuição
Favicon, ícone npm, `marketplace.json`, avatar e social card do `design/brand/`. Matar
`mooter-logo-legacy.svg`. ⚠️ `marketplace.json` ainda anuncia **47 % savings**.
Corrigir **`SPEC.md` §4** — manda creme+laranja; a decisão de 27/08 é cinza-aço.
**GATE:** `marca-unica` 1,5/1,5 · zero claims proibidos em superfície pública · uma só versão.

### O5 · Deck e PDF
Pelo §3. **GATE:** deck e registo com o mesmo `synced_at` · zero cifras sem `fonte` e `janela`.

### O6 · Migração das folhas antigas
As **20 caixas arredondadas** que restam e a linha de base a 37 %.
**GATE:** caixas **0** · linha de base **≥ 55 %** medida pelo auditor (não 100 % — a altura de
linha do texto não é múltipla de 8, e fingir um alvo é pior do que publicar o real).

---

## 6 · Kill-list

Matar, com commit próprio que diga **desde quando** estava parada:
`tools/router/mooter-dashboard.js` (19/04, e a skill `moo-dashboard` ainda a anuncia) ·
`dashboard/` Next.js (09/04) · `vscode-extension/` (13/04) · `landing-v12-deploy/` ·
`docs/design-exploration/` · `mooter-logo-legacy.svg`.

---

## 7 · Ritual de fecho

1. `moo-design-check` — **publicar o índice**, subiu ou não.
2. `moo-visual-audit` — cortes, contraste novo, caixas, barras. Guardar o `.visual-audit.json`.
3. Journal novo em `10-projects/` com os números antes e depois.
4. `SYNC.md` ≤ 200 linhas.
5. Um adversário em **motor diferente** sobre qualquer conclusão com consequência.
6. Se o índice desceu, dizê-lo na mesma tipografia com que o dirias se tivesse subido.

**A frase que fecha:** *a direcção está escolhida e travada em código. A partir daqui não se
escolhe — aplica-se, e o portão diz se ficou.*
