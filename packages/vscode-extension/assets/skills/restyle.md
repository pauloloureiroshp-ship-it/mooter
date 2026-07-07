---
id: restyle
label: /restyle
glyph: 🎛️
tier_floor: local
kind: class
hint: ajusta o estilo Tailwind — determinístico quando dá, moo local quando precisa
template: "ajusta o estilo (Tailwind) deste elemento: "
---

# /restyle — ajustar o estilo do elemento

Primeiro tenta o **caminho determinístico `$0`** (os presets de cor/tamanho/espaçamento já
resolvem a maioria via `mergeClass` + a cerca de className). Quando o pedido é mais aberto
("faz isto parecer um cartão"), cai no moo local cercado que reescreve **só o className** —
a cerca recusa classNames dinâmicas (`{expr}`) e caracteres inseguros.

## Few-shot

- `mais arredondado` → `rounded-xl`
- `sombra suave` → `shadow-md`
- `centra o conteúdo` → `flex items-center justify-center`

Nunca escreve fora do atributo `class` do nó selecionado.
