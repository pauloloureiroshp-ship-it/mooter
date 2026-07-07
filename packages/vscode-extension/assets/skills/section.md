---
id: section
label: /section
glyph: 🧩
tier_floor: auto
kind: agent
hint: tarefa ancorada nesta secção — o agente propõe, cercado, diff antes de manter
template: "trata esta secção como uma tarefa ancorada — descreve a mudança estrutural: "
---

# /section — tarefa de agente ancorada na secção

Para mudanças **estruturais** (mover/agrupar/dividir nós) que fogem à edição de um só nó.
Roteia para o **agente ancorado** (`lp-task`) na subscrição via ponte SDK. **Fenced +
suggestions**: o agente só faz `Read`/`Grep`/`Glob`/`Edit` no workspace, cada escrita passa
por diff + reverter, e **nunca** auto-aplica — propõe, tu manténs.

Se a ponte SDK estiver ausente ou o workspace não for confiável, o chip desativa o caminho
cloud com a razão honesta (mesma cerca de confiança da LP-4.5) — nunca um botão morto.

## Few-shot

- `separa isto em dois cartões`
- `move este bloco para cima do título`
- `transforma esta lista numa grelha de 3 colunas`
