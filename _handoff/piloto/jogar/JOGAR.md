# Item 8 do DoD — a única coisa que o harness não consegue medir

**Instrução:** abre cada `ART-n.html`, tenta cercar a vaca, e escreve `S` se a condição de vitória disparou ou `N` se não.

---

Nada mais é preciso. Não avalies qualidade, beleza nem desempenho — isso já está medido pelos outros
11 itens e pelos 3 juízes cegos. Aqui só interessa **se o jogo declara vitória quando a vaca fica
cercada**.

- Os ficheiros estão na ordem do baralhamento (`ART-1`…`ART-9`), **não** na ordem dos braços. Não
  precisas de saber de quem é cada um, e é melhor que não saibas enquanto jogas.
- Escreve só `S` ou `N` na coluna. Se não conseguires decidir (o jogo rebentou, não deu para cercar,
  ficaste na dúvida), deixa `?` — fica `n/d` com o motivo, e isso é um resultado honesto. **Não
  adivinhes.**
- Podes usar a coluna `nota` para uma frase, se quiseres. É opcional e não entra em conta nenhuma.

## Veredictos

| artefacto | venceu? (S/N/?) | nota (opcional) |
|---|---|---|
| ART-1 | S | venceu após esforço — 58 blocos, cerco fechado, banner disparou (13:37) |
| ART-2 | ? | travado na tela inicial — não deu para tentar cercar |
| ART-3 | ? | travado na tela inicial — não deu para tentar cercar |
| ART-4 | ? | travado na tela inicial — não deu para tentar cercar |
| ART-5 | ? | travado na tela inicial — não deu para tentar cercar |
| ART-6 | ? | travado na tela inicial — não deu para tentar cercar |
| ART-7 | ? | preso em "Loading three.js" (CDN) — o jogo nunca abriu |
| ART-8 | ? | travado na tela inicial — não deu para tentar cercar |
| ART-9 | ? | travado na tela inicial — não deu para tentar cercar |

<!-- Preenchido pelo Cowork em 2026-08-07 por transcrição literal dos relatos do juiz humano (Paulo),
     confirmada por ele nesta sessão antes da gravação. Nenhum veredicto foi deduzido: ART-1 = S
     (vitória validada também por leitura do código: flood-fill em a110()); ART-2..9 = ? porque o
     juiz não chegou a poder tentar o cerco — n/d, não N. -->

---

Quando acabares, diz-me. Eu corro:

```bash
node _handoff/piloto/aplicar-item8.mjs
```

Isso lê esta tabela, mapeia `ART-n` → run pelo `mapa.json`, escreve o item 8 em cada
`runs/<id>/dod/dod.json` **mecanicamente**, e regenera o `resultado.md` e o `dossier-data.json`.

**Nenhum `meta.json` é editado à mão** — nem por mim nem por ti. Se a tabela tiver uma resposta que
não seja `S`, `N` ou `?`, o script recusa-se a escrever e diz qual linha, em vez de adivinhar.
