# 🐮📦 Moove — Desenho de Produto (migração assistida Lovable → Claude Code + Mooter)

> **Data:** 2026-07-05 · **Base:** `PORTABILITY_LOVABLE_TO_CC_STUDY.md` (ler primeiro).
> **Metáfora:** portabilidade de telemóvel (iPhone→Samsung) — ligas, autorizas, e a mudança acontece
> com um humano a guiar-te nos passos que só tu podes dar.
> **Nome decidido (Paulo, 2026-07-05): Moove** (move + moo).
> ❄️ **Status: backlog** — item Parked P1 no Mooter Backlog (Notion); fazer mais à frente com maestria.

---

## 1. Persona e promessa

**Persona primária:** o vibe coder não-dev preso no Lovable (os amigos do Paulo, o sogro no caso Cursor). Já tem um app real, dados reais, e um destes gatilhos: créditos a arder, feature presa num edit-loop, medo do "e se o Lovable morre/aumenta o preço", ou a parede do paywall (domínio/download).

**Promessa (honest-copy, nunca mais que isto):**

> *"Migramos ~80% do teu projecto automaticamente, de graça, no teu PC. Os outros ~20% — as tuas
> keys, o teu domínio, os teus users — só tu podes mover, e nós guiamos-te passo a passo.
> No fim vês o teu app a correr lado a lado com o original antes de decidires o que quer que seja.
> O Lovable continua vivo até TU o desligares. Se algo não migrar, dizemos-te antes, não depois."*

❌ Proibido: "migração perfeita", "1 clique", "sem esforço", "100%".

## 2. Princípios não-negociáveis

1. **Nunca tocar em secrets** — o Moove lista *nomes* de secrets e diz *onde colar*; valores nunca transitam por ele.
2. **Paralelo por default** — o Lovable fica vivo como fallback; "corte" é um graduation step opcional e explícito.
3. **Aditivo, nunca destrutivo** — adiciona redirect URLs, nunca remove; nunca escreve no Supabase de prod; nunca `git push -f`.
4. **Trabalho pesado em moos locais $0** — scan, mapa de deps, checklist, diff de paridade: tudo na GPU local. Cloud só quando ganha o custo (doctrine do router).
5. **Ver antes de confiar** — Live Preview lado-a-lado é o gate de cada fase, não um extra.
6. **Relatório antes de acção** — padrão Marley: Fase 0 = diagnóstico, nada se altera antes do user ver o mapa.

## 3. O fluxo — wizard em 7 passos

```
[1 Ligar] → [2 Moo Scan $0] → [3 Mapa Honesto] → [4 Migrar código] → [5 Backend guiado] → [6 Prova de paridade] → [7 Graduation]
```

**Passo 1 — Ligar (5 min, humano).** O user liga o Lovable ao GitHub (doc oficial; o Moove mostra como) e dá o URL do repo. Detecção automática do regime: **Classic** (Supabase próprio) vs **Lovable Cloud** (sem dashboard) — pergunta única: "consegues abrir supabase.com/dashboard e ver o teu projecto?". Isto bifurca todo o fluxo.

**Passo 2 — Moo Scan (auto, $0, ~minutos).** Clone read-only + análise por moo local: inventário (rotas, páginas, hooks, edge functions, migrations — os números tipo "42 páginas, 38 hooks, 20 functions, 98 migrations" do Marley), fingerprints Lovable (tagger, cloud-auth-js, .env commitado, duplo lockfile), scan de segurança (secrets hard-coded, RLS ausente, deps vulneráveis, CORS), mapa de env vars e integrações externas (o "WAHA" de cada projecto). Zero tokens cloud.

**Passo 3 — Mapa Honesto (o coração do produto).** Um relatório em 3 cores que o não-dev entende:

| 🟢 Migra sozinho | 🟡 Eu guio-te (só tu podes) | 🔴 Não migra (sabe antes) |
|---|---|---|
| código, deps, schema, RLS, edge functions, CLAUDE.md | secrets (colar), auth config, DNS, dados se Cloud, storage | passwords dos users (reset), chat history Lovable, version history |

Com estimativa de tempo por coluna e o botão "começar". **Este ecrã é o produto.** Se o user parar aqui, já recebeu valor (e confiança) de graça.

**Passo 4 — Migrar código (auto).** Branch `moove/migration`: remover fingerprints, dedupe lockfile (npm), patch `redirectTo` explícito no auth (mata o loop hole nº1), `.env` fora do tracking + `.env.example` gerado, vercel.json com SPA fallback, grep de URLs *.lovable.app cozidas, **CLAUDE.md gerado** do scan (stack, comandos, arquitectura, gotchas), `npm ci && npm run build` como gate. Commits selectivos e descritivos — o user vê cada passo no Director's Cut.

**Passo 5 — Backend guiado (humano + moo a assistir).** Bifurca por regime. *Classic:* `supabase link` + `db pull` + validação das migrations — quase auto. *Cloud:* o caminho Marley — obter config de auth via painel Lovable, decidir "manter Supabase do Lovable (paralelo)" vs "projecto próprio (corte, com custos explícitos)". Secrets: o Moove mostra a lista de *nomes* e abre a página certa onde colar cada valor. Auth: checklist Site URL + redirect allowlist (adicionar, nunca remover) + OAuth consoles.

**Passo 6 — Prova de paridade (o momento WOW).** Live Preview lado-a-lado: localhost vs app Lovable live. Screenshot-diff por rota (moo local), smoke tests de *dados* (listagens com N>0 — mata a RLS silenciosa), checklist de features gerado da auditoria (não genérico). Output: "17/19 rotas idênticas; 2 diferenças — vê aqui". **Honest: o que não bate, aparece.**

**Passo 7 — Graduation (opcional, ritmo do user).** Deploy próprio (Vercel guiado), domínio/DNS (checklist com valores verificados na hora), e — só se quiser — o corte: Supabase próprio, cancelar Lovable. Cada item com o custo real à frente ("mover users = todos fazem reset de password").

## 4. Forma de entrega (MVP)

- **CLI primeiro:** `mooter moove <repo-url>` — package novo `packages/moove` (não toca em packages congelados), com os passos 2-4 e o Mapa Honesto em markdown + terminal. Dogfood: **re-migrar o Marley com a ferramenta**.
- **Depois:** painel no cockpit VS Code (o wizard visual em cima do CLI) + integração Live Preview para o passo 6.
- **Cursor não entra no MVP** — é onboarding/confiança, não portabilidade; tratado depois como conteúdo/wizard de boas-vindas, não como migração.

## 5. Anti-scope

- ❌ Bolt/v0 no MVP (superfícies diferentes; só após Lovable→CC provado).
- ❌ Migrar auth users automaticamente (impossível com honestidade; oferecer só o caminho documentado + reset).
- ❌ Executar qualquer passo com credenciais do user (DNS, secrets, billing).
- ❌ Hospedar/proxy do app (não é o negócio).
- ❌ Prometer suporte a stacks fora de Vite+React+TS+Supabase no MVP.

## 6. Ligação ao GTM

O Moove é o **funil de entrada** que falta ao Mooter: cada migração termina com o user dentro do CC com router local, CLAUDE.md, memória e Live Preview — o resto do produto vende-se sozinho a partir daí. Métrica do MVP: **1 migração real completa (Marley re-migrado) + 3 migrações de amigos**, tempo total < 1 dia por projecto, 0 incidentes de secrets.
