---
id: icon
label: /icon
glyph: 🎨
tier_floor: local
kind: asset
hint: insere um ícone da whitelist (lucide / Simple Icons) — $0, sem inventar SVGs
template: "insere um ícone da whitelist (lucide / Simple Icons) neste elemento — qual: "
---

# /icon — inserir um ícone da whitelist

Reutiliza a **asset fence da LP-4.7** (`live-edit-assets.js`): só nomes de `lucide-react`
que existem no export whitelist, ou SVGs de marca do `simple-icons` (path data vendorada,
nunca da memória de um modelo). Corre no caminho local `$0` — a cerca verifica os imports
antes de escrever; um nome que não resolve é recusado com a razão honesta.

## Few-shot

- `github` → `<Github className="w-5 h-5" />` (import verificado de lucide-react)
- `estrela` → `<Star className="w-5 h-5" />`
- `carrinho de compras` → `<ShoppingCart className="w-5 h-5" />`

Um pedido de marca removida do lucide v1.0 (ex.: um logo) resolve-se pelo SVG de marca
vendorado, não por um import que já não existe.
