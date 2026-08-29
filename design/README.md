# Material de marca do Mooter — v1.0.0

Pacote autónomo. Copiar para `design/` na raiz do repo. Nada aqui foi inventado: todos os
valores foram lidos de ficheiros de produção a **2026-08-27**, em `frugal@97ad846b`.

```
design/
  DESIGN.md                     o spec canónico — lê primeiro
  MASTERPROMPT_CC_DESIGN.md     o que dar ao Claude Code
  tokens/
    moo-tokens.json             A FONTE. Só isto se edita à mão.
    moo-ui.css                  gerado
    moo-tokens.ts               gerado
  brand/
    mooter-mark.svg             36px, animado, autónomo (respira dentro de <img>)
    mooter-mark-32.svg          chapados
    mooter-mark-16.svg          duas formas
    mooter-mark-mono.svg        silhueta currentColor, olhos recortados
    mooter-mark-512.svg         azulejo do marketplace sobre --surface-2
    favicon.svg
    mooter-mark.css             movimento para o SVG inline
  tools/
    moo-tokens-build.mjs        json → css + ts
    moo-design-check.mjs        O PORTÃO. Sete verificações, índice 0–10. Zero dependências.
    moo-visual-audit.mjs        A AUDITORIA VISUAL. Renderiza e mede o que o código não diz.
                                Precisa de playwright — por isso vive fora do portão.
    moo-visual-audit.test.mjs   o teste de mordida do auditor: planta um defeito de cada
                                família e exige que ele o apanhe.
    package.json                a ÚNICA dependência do design/ (playwright), isolada aqui.
  canvas.json                   que superfícies o auditor visual mede neste repo.
```

## Arrancar

```bash
node design/tools/moo-tokens-build.mjs      # regenera css e ts
node design/tools/moo-design-check.mjs      # relatório + índice
node design/tools/moo-design-check.mjs --ci # sai 1 abaixo do limiar (default 8)
# auditoria visual — precisa de browser, por isso tem dependência e canvas próprios
cd design/tools && npm install                       # playwright, só aqui
node design/tools/moo-visual-audit.mjs design/canvas.json     # escreve design/.visual-audit.json
cd design/tools && node --test moo-visual-audit.test.mjs      # o teste de mordida do auditor
```

Zero dependências, zero rede, ~1 s — **excepto a auditoria visual**, que precisa de um browser
e por isso tem o seu próprio `design/tools/package.json`. Nenhum `package.json` existente do
repo foi tocado. O `moo-design-check` continua zero-dep e é esse que cabe no CI e no cron.

### O canvas da auditoria visual

`design/canvas.json` declara **que superfícies existem mesmo neste repo** e abrem por `file://`
sem servidor. As páginas do `landing/` são Next.js: precisam de build + servidor, portanto são
`n/d` neste instrumento — não zero. Cada entrada leva `scroll: true` quando a superfície rola por
natureza; nessas, `corte` não é defeito e o auditor mostra `—` (o número medido fica no JSON).

⚠️ **Ler o `.visual-audit.json` sem olhar para `alturaReal` engana.** Quatro das cinco
superfícies são cascas que só se povoam com dados em runtime (`moo-pilot-shell` faz `fetch` a
`127.0.0.1:4290`; `cockpit`, `fleet-ui` e `moo-panel` mostram "a arrancar…"). O auditor mede o
que está no ecrã, e o que está no ecrã é o estado de arranque. Ver
`design/tools/moo-visual-audit.test.mjs` para o que o instrumento garante e o que não garante.

## A regra que mantém isto vivo

**Gerar, nunca copiar.** `moo-ui.css` e `moo-tokens.ts` são saída. Editá-los à mão é um defeito
que o portão apanha (verificação 4). O `cockpit.html` esteve 20 dias atrás do `moo-pilot-shell`
exactamente por ser cópia — este pacote existe para tornar isso impossível.

---

## Organização — onde vive cada coisa

| camada | onde | quem escreve | regra |
|---|---|---|---|
| **Fonte de tokens** | `design/tokens/moo-tokens.json` | à mão, só aqui | um ficheiro, um sha |
| **Saída** | `design/tokens/moo-ui.css` · `.ts` | `moo-tokens-build.mjs` | **gerado, nunca editado** |
| **Marca** | `design/brand/*.svg` + `.css` | à mão, raramente | silhueta intocável |
| **Portão** | `design/tools/moo-design-check.mjs` | à mão | zero LLM, zero rede |
| **Doutrina** | `design/DESIGN.md` · `DIRETRIZES.md` | à mão | o que o grep não apanha |
| **Ordem de trabalho** | `design/MASTERPROMPT_CC_DESIGN.md` | à mão | seis ondas com gate |
| **Saída do portão** | `design/.design-check.json` | o portão | gitignored ou versionado — decisão do dono |
| **Consumidores** | `landing/` · `tools/cockpit/` · `plugin/` · `packages/` | importam | **nenhum redefine um token** |

### No vault (`paulo-vault/`)

| o quê | onde |
|---|---|
| Decisão canónica de design | `20-decisions/2026-08-27-design-system-do-mooter-a-fonte-e-o-portao.md` |
| Diretrizes de design engineering | `20-decisions/2026-08-27-diretrizes-design-engineering.md` |
| Masterprompt para o CC | `_handoff/MASTERPROMPT_CC_DESIGN_2026-08-27.md` |
| Pacote (cópia de arquivo) | `_handoff/mooter-brand-v1.1.0.zip` |
| Journals da onda | `10-projects/2026-08-2*-*.md` |

**Regra de duplicação:** o vault guarda a **decisão** e o **estado**; o repo guarda a **fonte**.
O pacote no vault é arquivo, não fonte — se divergir do repo, o repo ganha.

### No canvas (`claude.ai/code/artifact/d3b9d549…`)

| página | o quê |
|---|---|
| Fundações | tokens, marca decidida, número honesto, tiers, primitivos |
| Marca viva | a vaca com luz e movimento, construção medida, assinatura, escada, motion |
| Portão | as sete verificações e o índice |
| Direcções | as doze regras + cinco direcções de landing |
