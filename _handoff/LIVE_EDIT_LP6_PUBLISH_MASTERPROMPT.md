# ⇄ COWORK→CC · WAVE LP-6 · 🚀 Publish — editar no preview → mooter.ai (com salvaguardas máximas)

> **Dor viva (Paulo 2026-07-08):** apagou um ícone no Live Preview (funcionou local, $0, registado),
> foi a mooter.ai e nada mudou. **Não é bug — o preview é local, mooter.ai é produção; falta o
> deploy.** Esta wave constrói o botão 🚀 Publish (paridade Lovable) que liga o preview ao site real.
> **⚠️ É a wave MAIS delicada de todas: toca o site de PRODUÇÃO.** Deploy real NUNCA é autónomo —
> só com two-factor do Paulo. Nem o CC nem o Cowork disparam deploy. R1–R6. classify.js FROZEN.

## 0. Regras não-negociáveis desta wave
- ❌ O CC **NUNCA** faz deploy real de produção — constrói a feature e prova o fluxo com o comando
  de deploy **mockado** (`child_process` fake). O deploy verdadeiro é sempre um clique do Paulo com
  two-factor.
- ❌ Nunca `git add -A` — commit **selectivo** só dos ficheiros editados no Live Edit (lista visível).
- ❌ Nunca push directo para `main`/branch de produção sem o gate — o Publish não salta o merge gate.
- 🔒 Two-factor OBRIGATÓRIO antes de qualquer deploy de produção: o utilizador escreve o nome do
  projecto (estilo GitHub delete). Sem isso, o botão não dispara.

## 1. Fase 0 · DESCOBRIR o mecanismo de deploy real (read-only, primeiro)
Confrontar, não assumir: como é que mooter.ai chega a produção HOJE?
- Procurar `landing/vercel.json`, `.vercel/project.json`, `landing/.vercel/`, GitHub Actions
  (`.github/workflows/*deploy*`), `wrangler*.toml` (se for CF), o token/CLI Vercel na máquina.
- Determinar: (a) que branch a Vercel observa (auto-deploy on push?), (b) domínio de produção vs
  preview, (c) se há um `vercel` CLI autenticado. Escrever `_handoff/LP6_DEPLOY_RECON.md` com o
  mecanismo REAL. **Se o deploy for git-push-triggered (Vercel observa main), o "publish" tem de
  passar pelo fluxo git com gate — NUNCA um push cego a main.** Parar e reportar o mecanismo antes
  de construir a UI.

## 2. Fase 1 · Popover Publish (paridade Lovable — o print do Paulo)
Botão 🚀 no toolbar do Live Preview → popover "Published":
- Estado (Published/Draft) · Website URL (produção) · "Add custom domain" (link) · visibilidade.
- Botão **Review Security** (liga à LP-5 se existir; senão desactivado com "review não instalado").
- Botão **Update** (o deploy) — desactivado até a pré-condição §4.
- Telemetria honesta: custo do ciclo (edits $0 + review $0 + deploy) visível.

## 3. Fase 2 · Preview do que vai ser publicado (honestidade antes do irreversível)
Antes de habilitar Update: mostrar a LISTA dos ficheiros que o Live Edit mudou nesta sessão
(reusa o feed "mudanças desta sessão") + `git diff --stat` dessas edições. O Paulo vê EXACTAMENTE
o que vai para produção. Se a árvore servida ≠ árvore de deploy (o P0 que o FIX-MP-1 trata),
avisar. Nada de "publicar às cegas".

## 4. Fase 3 · Pré-condição + Two-factor + Deploy (mockado no gate)
- **Pré-condição de segurança:** se a LP-5 existir e houver finding Critical aberto → Update
  DESACTIVADO com tooltip "resolve o Critical primeiro" (+ override explícito com aviso vermelho).
  Se a LP-5 não existir → banner honesto "sem review de segurança nesta sessão".
- **Fluxo do Update:** (a) commit SELECTIVO dos ficheiros editados (lista visível, mensagem
  gerada) → (b) o destino segue o mecanismo da Fase 0 (se Vercel observa main: cria PR/branch, NÃO
  push cego; se `vercel` CLI: deploy explícito) → (c) **two-factor: escrever o nome do projecto** →
  (d) deploy. **No gate, o comando de deploy é `child_process` MOCKADO** — provar o fluxo, os
  guards, o two-factor, SEM disparar produção. O deploy real fica para o Paulo, fora do gate.
- Pós-deploy: URL de produção clicável + estado actualizado + custo do ciclo.

## 5. Decisão Paulo pendente (confirmar antes da Fase 3)
O Paulo escolheu antes "direct to production". ⚠️ Para o site de PRODUÇÃO real, recomendo
**preview-Vercel primeiro + promote-to-production com two-factor** (uma rede de segurança a mais:
vês o deploy num URL de preview antes de tocar o mooter.ai real). Construir AMBOS os caminhos e o
Paulo escolhe no popover (default = preview-first para produção; direct só com override). Confirmar.

## 🔒 GUARD
Deploy real NUNCA autónomo (mock no gate) · commit selectivo · sem push cego a main · two-factor
obrigatório · security-gate se LP-5 existir · preview do diff antes · classify FROZEN · vias/cercas/
tree-gate (FIX-MP-1) intactas · zero deps novas sem allowlist · PT-PT chat, EN código · PÁRA no gate.

## ✅ GATE (prova viva, sem tocar produção)
Fase 0 recon colada (mecanismo real de deploy) · popover mostra estado+URL+diff dos ficheiros
editados · Update bloqueado sem two-factor · Update bloqueado com Critical (se LP-5) · deploy
MOCKADO prova o fluxo (child_process fake, zero produção tocada) · commit é selectivo (git diff
prova) · testes verdes · sha frozen · push só da branch · PÁRA. O deploy REAL é um passo humano
posterior, fora desta wave.

## Fontes
Brief no _handoff/LIVE_EDIT_LP4_LP6_VISION.md (§LP-6) + prints Lovable do Paulo (popover Published:
URL·domain·visibilidade·Review security·Update). Deploy recon = confrontar landing/vercel.json,
.vercel, GitHub Actions, vercel CLI na máquina — 2026-07-08.
