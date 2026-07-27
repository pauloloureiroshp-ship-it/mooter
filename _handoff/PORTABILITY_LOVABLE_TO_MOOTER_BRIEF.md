# ⇄ Handoff Cowork → Cowork · "Portabilidade" para o Mooter (o graduation path Lovable/Cursor → CC)

> **A ideia (do Paulo, 2026-07-04):** como quando trocas de iPhone para Samsung e há uma *portabilidade* que
> migra tudo, o Mooter devia oferecer uma **migração assistida** de projetos de Lovable / Cursor / Bolt / v0
> para Claude Code + Mooter — com onboarding sofisticado, zero loop holes, front/back impecáveis, segurança
> máxima. Objetivo: baixar o muro que faz gente ficar presa no vibe-coding "for dummies" e trazer as mentes
> para o local-first $0. Win-win: mais adoção do Mooter, mais subscriptions Claude, users libertos do lock-in.
> **Veredicto do Cowork:** ideia forte (dor vivida, alinhada ao local-first, é o funil que falta). Não é delírio.
> **Guardar o motor certo:** o valor é libertar o user; as subscriptions vêm por arrasto — não o contrário.

## 🎯 O que esta nova conversa deve produzir
1. Um **estudo profundo** de como fazer a portabilidade *com perfeição possível* (não prometida) → doc no repo.
2. Um **desenho de produto**: o "Mooter Onboard / Moove" — fluxo de migração + onboarding para não-devs.
3. Um **masterprompt** faseado (começar por 1 ferramenta + 1 stack) para o CC construir o MVP.
4. Registo no vault (40-strategy) + Notion HQ Mooter.

## 📚 Fontes a estudar (obrigatório cruzar as três)

### A) O que JÁ aprendemos — a migração real do Marley Living (Notion, mar 2026) — ouro puro
O Paulo já viveu isto. Ler e destilar os padrões, dores e loop holes destes registos:
- 🚀 **Migração Lovable → Claude Code — Plano Completo** — `3216f6e4-2bc4-8164-b1e3-c8df71d7cead`
- 📖 **Base de Conhecimento — Migração Lovable → Claude Code** — `3246f6e4-2bc4-8113-bec4-d48f70f74757`
- 🔧 **Prompt Migração Lovable → Marley Living (CC)** — `3226f6e4-2bc4-811b-b774-e44dbfe7aa4e`
- 🔍 **Master Prompt — Auditoria Lovable → Claude Code** — `3236f6e4-2bc4-81a6-87b6-f8166761b5ee`
- 🔄 **Master Prompt — Sincronização Lovable vs Claude Code** — `3236f6e4-2bc4-815c-9da7-cfb631096080`
- ⚖️ **Estratégia — Lovable + Claude Code em paralelo** — `3246f6e4-2bc4-8109-a0dd-ea9c8d5c489f`
  - já contém um loop hole concreto: *"Lovable redireciona o login para o domínio dele a cada deploy no Supabase — intencional, não bug"* (lock-in a mapear).
- Stack do Marley (o caso-piloto): **React + Vite + TS + Tailwind + shadcn/ui + Supabase + WAHA**.
- Também: vault `10-projects/marley-living.md` + `MEMORY.md`/`LOOP.md` do repo Marley se acessíveis.

### B) Documentação/FAQ das ferramentas de origem (o que exportam e como estruturam)
- **Lovable:** export para GitHub, estrutura de projeto (Vite/React/shadcn), integração Supabase (schema, RLS, edge functions, auth), publish/domínios, o que fica preso ("*.lovable.app", redirect de auth, secrets no Lovable).
- **Cursor:** é um IDE (já é local) — a "migração" aqui é diferente: é **onboarding/confiança** (o caso do sogro), não portabilidade de código. Mapear o *receio* → UI amigável do Mooter como ponte.
- **Bolt / v0:** WebContainers (Bolt) e deploy Vercel + Git panel (v0) — como exportam, o que se perde.
- Como cada um estrutura **automaticamente**: Supabase (DB/SQL/RLS/edge/auth), Vercel (deploy/env), Hostinger/GoDaddy (domínios/DNS), env vars/secrets.

### C) Cruzar com o estudo de preview já feito
- `_handoff/LIVE_PREVIEW_FEATURE_STUDY.md` — o Live Preview é a **arma de conversão**: "vê a magia acontecer enquanto falas com o CC" é o que o Paulo acha que convence os amigos a migrar. A portabilidade + o preview andam juntos.

## ❓ Questões de investigação (responder no estudo)
1. **O que é migrável automaticamente vs o que exige o humano?** (código/estrutura = auto; secrets/DNS/billing = guiado). Desenhar a linha honesta.
2. **Como reconstruir a estrutura com fidelidade?** Mapear padrões Lovable (pastas, shadcn, Supabase client, edge functions) → estrutura CC limpa. Onde estão os loop holes (auth redirect, deps não-fixadas, env implícitos)?
3. **Segurança:** como migrar sem o Mooter jamais ver uma key. Fluxo de "traz as tuas keys" guiado. Auditoria de segredos hard-coded no export.
4. **Onboarding para não-devs** (o sogro): que UI/wizard baixa o receio? Quanto pode o Mooter automatizar com **moos locais $0** (analisar export, mapear deps, gerar checklist)?
5. **Backend/DB:** como trazer o Supabase (schema dump, migrations via CLI, RLS, edge functions) sem partir produção. Estratégia "paralelo" (Lovable vivo enquanto migra) vs "corte".
6. **Verificação:** como provar que o app migrado ≡ o original (paridade visual via Live Preview, testes de fumo, checklist).

## 🧱 Restrições não-negociáveis (o desenho tem de as respeitar)
- ❌ **Nunca prometer "migração perfeita"** → posicionar "80% auto + 20% guiado, honesto sobre o que não migrou". Honest-copy.
- ❌ **Nunca tocar em secrets** (Supabase/Vercel/DNS keys) — guiar, nunca executar. Régua de segurança do Mooter.
- 🔒 **Segurança de código máxima:** auditar o export por secrets hard-coded, deps vulneráveis, RLS em falta antes de "está pronto".
- 🎯 **Escopo faseado:** MVP = **só Lovable → CC**, stack **Vite+React+Supabase** (o do Marley). Cursor/Bolt/v0 depois.
- 🐮 **Foco 90 dias:** isto é grande (quase um ângulo de GTM/produto). Não descarrilar o foco Mooter — MAS avaliar se é *o* íman que traz os ≥250 stars / ≥3 contributors do gate (2026-05-26 já passou; reavaliar o gate atual). Decidir com o Paulo se vira wave ou track paralelo.
- **$0 local:** o trabalho pesado da migração (análise do export, mapa de deps, checklist) corre em **moos locais**, não cloud.

## 💡 Nome / identidade (a decidir com o Paulo)
Candidatos: **Moove** (move + moo), **Mooter Onboard**, **Graduation** (do vibe-coding "for dummies" para o local-first), **Eject to Local**. Manter a identidade 🐮 e a metáfora "portabilidade" (troca de telemóvel) que o Paulo usou.

## 📋 Como arrancar (para a nova conversa)
1. Ler as 6 páginas do Notion (secção A) + `LIVE_PREVIEW_FEATURE_STUDY.md`. Destilar os padrões/loop holes reais do Marley.
2. Pesquisar B (FAQ/docs Lovable/Cursor/Bolt/v0 export + Supabase/Vercel/DNS auto-setup) — **web_search obrigatório** (muda <30 dias).
3. Escrever o estudo + desenho de produto + masterprompt faseado. Registar vault/Notion.
4. Voltar ao Paulo com: linha do migrável-vs-guiado, o MVP proposto, e a decisão de escopo (wave vs track).
