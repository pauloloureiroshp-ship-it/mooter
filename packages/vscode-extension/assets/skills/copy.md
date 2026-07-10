---
id: copy
label: /copy
glyph: ✍️
tier_floor: local
kind: text
hint: reescreve o texto deste elemento — moo local pequeno, cercado ao nó
template: "reescreve o texto deste elemento — mantém o sentido, muda o tom para: "
---

# /copy — reescrever o texto do elemento

Reescrita **cercada só a este nó** (o caminho fenced da LP-4: `lp-prompt` → diff → aplicar).
Corre no moo local `$0` por defeito; o chip deixa subir para cloud manualmente se quiseres.
Nunca toca noutros nós — a cerca recusa qualquer coisa que não seja um único texto.

## Few-shot

- `mais direto` → encurta a frase, remove enchimento.
- `mais caloroso` → tom amigável, primeira pessoa.
- `português de Portugal` → normaliza PT-PT.

Se o conteúdo vier de dentro de um componente (props/dados), o aviso honesto de componente
aparece e o `/copy` remete para o agente — nunca finge um `✓ escrito`.
