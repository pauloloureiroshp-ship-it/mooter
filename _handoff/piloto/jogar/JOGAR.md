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
| ART-1 | ? |  |
| ART-2 | ? |  |
| ART-3 | ? |  |
| ART-4 | ? |  |
| ART-5 | ? |  |
| ART-6 | ? |  |
| ART-7 | ? |  |
| ART-8 | ? |  |
| ART-9 | ? |  |

---

Quando acabares, diz-me. Eu corro:

```bash
node _handoff/piloto/aplicar-item8.mjs
```

Isso lê esta tabela, mapeia `ART-n` → run pelo `mapa.json`, escreve o item 8 em cada
`runs/<id>/dod/dod.json` **mecanicamente**, e regenera o `resultado.md` e o `dossier-data.json`.

**Nenhum `meta.json` é editado à mão** — nem por mim nem por ti. Se a tabela tiver uma resposta que
não seja `S`, `N` ou `?`, o script recusa-se a escrever e diz qual linha, em vez de adivinhar.
