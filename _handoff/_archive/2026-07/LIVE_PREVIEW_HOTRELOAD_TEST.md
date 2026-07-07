# ⇄ COWORK → CC · Teste E2E do Hot-Reload — provar a magia do Live Preview

> **Estado:** MP2 App Stage LIVE e provado visualmente (2026-07-04). O Mooter · Live Preview renderiza o
> `mooter.ai` (`localhost:7819`) DENTRO do VS Code, com detetor de porta honesto (`probe · porta ativa`),
> Brain (n/d honesto) e Director's Cut (38 eventos reais). **Falta o último ato:** alterar o site e ver o
> preview atualizar em tempo real — a magia do vibe coding (a IA muda o código, tu vês ao vivo).

## 🎯 GOAL
Provar o hot-reload E2E: uma alteração no `landing/` propaga-se ao iframe do Live Preview em <2s, **sem recarregar**.

## 📍 ONDE
Worktree `../frugal-lp-stage` (branch `feat/lp-stage`). O dev server **já está a correr** (`next dev -p 7819`) —
**NÃO** reinicies o server. O Live Preview já está aberto no VS Code do Paulo.

## ▶ DO (uma alteração cirúrgica, visível, reversível)
1. Abre `landing/app/page.tsx`.
2. Faz **UMA** alteração muito visível no hero — muda o headline (ex.: `Got a Moo?` → `Got a Moo? 🐮 LIVE`) **ou**
   a cor de um elemento de destaque. **Uma linha só.** Nada mais.
3. Grava. **NÃO** commites, **NÃO** faças push, **NÃO** toques noutro ficheiro. É um teste visual.
4. Escreve `✅ gravei — olha o Live Preview` e **espera** o Paulo confirmar que viu o hero mudar em <2s.
5. Depois do OK do Paulo: **reverte** com `git checkout -- landing/app/page.tsx` (o site volta ao original).

## 🔒 GUARD
Só toca `landing/app/page.tsx` · **sem commit · sem push** · totalmente reversível · não reinicia o server ·
`classify.js` sha intacta (`427d8c0b…`) · não mexe no MP2 já construído.

## ✅ GATE
O Paulo vê o hero mudar **no Live Preview, sem recarregar a página** = hot-reload provado = a magia funciona.
Depois de confirmado e revertido, a decisão de **mergear `feat/lp-stage` → main** fica com o Paulo (two-factor).
