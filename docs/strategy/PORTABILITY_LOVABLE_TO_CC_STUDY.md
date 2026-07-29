# 📦 Portabilidade Lovable → Claude Code + Mooter — Estudo Profundo

> **Data:** 2026-07-05 · **Fontes:** 6 páginas Notion da migração real do Marley Living (mar 2026) +
> pesquisa web 2026-07 (docs Lovable/Bolt/v0/Cursor/Supabase/Vercel + comunidade) +
> `_handoff/LIVE_PREVIEW_FEATURE_STUDY.md`.
> **Séries irmãs:** `MOOVE_PRODUCT_DESIGN.md` · `_handoff/MOOVE_MVP_MASTERPROMPT.md`.

---

## 0. Veredicto em 7 linhas

1. A ideia é **válida e o timing é bom**: o export mecânico é commodity (todos têm zip+GitHub), mas **ninguém combina migração assistida + local-first $0 + workflow contínuo**. O resíduo não-resolvido é sempre a tríade **secrets · dados/auth users · DNS** + qualidade do código pós-export.
2. Existe **um competidor directo embrionário**: `lovable-eject` (OSS, GitHub, 2026) — analyse/transform/deploy num comando. Maturidade não auditada. Validar traction antes de posicionar. O próprio **Bolt tem "Import from Lovable"** oficial (funil tool→tool, não tool→local).
3. A linha honesta é **~80% auto / ~20% guiado** — e o Marley provou-a na prática: código+schema+edge functions migram; secrets, auth users, DNS e config de auth **exigem sempre o humano**.
4. **Lovable tem hoje 2 regimes** e isso muda tudo: **Classic** (Supabase do user, dashboard acessível) vs **Lovable Cloud** (default desde fim-2025, Supabase na org do Lovable, **sem dashboard**). O Marley caiu no segundo — é o caso difícil e o mais comum daqui em diante.
5. O maior risco de produto não é técnico, é de promessa: **nunca "migração perfeita"** — o Marley perdeu features no processo (vCard handler, pin de número, Street View) e precisou de sessões de restauro. O produto tem de tornar essa perda **visível antes**, não descoberta depois.
6. O **Live Preview é a arma de conversão**: paridade visual lado-a-lado (Lovable live vs localhost) transforma "confia em mim" em "vê com os teus olhos".
7. Cursor é um caso **diferente**: já é local; a "migração" é de confiança/workflow, não de código. Fica fora do MVP.

---

## 1. O ouro do Marley — o que a migração real ensinou (mar 2026)

O plano dizia 2-3h; a realidade foram **8+ sessões ao longo de dias**. Destilado:

| # | Aprendizado vivido | Implicação para o produto |
|---|---|---|
| 1 | **Supabase na org do Lovable** — conta pessoal bloqueada no dashboard; acesso só via Lovable → Cloud → Auth settings → Advanced | Detectar o regime (Classic vs Cloud) é o **passo 1 do wizard**; caminhos totalmente diferentes |
| 2 | **Site URL sobrescrito a cada deploy do Lovable** (documentado como intencional no Notion) — login redirecciona para *.lovable.app | Fix definitivo = `redirectTo` explícito no código (`window.location.origin`) — patch **determinístico**, automatizável |
| 3 | **`.env` commitado/rastreado no git** (risco identificado na auditoria) | Scan de secrets no export é obrigatório antes de qualquer push |
| 4 | Só **2 dependências Lovable** a remover: `lovable-tagger` (vite.config) + `@lovable.dev/cloud-auth-js` | Limpeza de fingerprints é mecânica, determinística, $0 |
| 5 | **98 migrations com nomes UUID** — ilegíveis | Renomeação semântica = melhoria guiada, não bloqueante |
| 6 | **RLS devolve vazio sem erro** — a causa nº1 de "os dados sumiram" pós-migração | Smoke tests têm de testar *dados visíveis*, não só *app compila* |
| 7 | **Auth users não migram** (password hashes) — o Marley **manteve o Supabase do Lovable como prod** e criou projecto próprio vazio como backup | Estratégia "paralelo" > "corte"; mover o Supabase é opcional e adiável |
| 8 | Redirect URLs do Lovable no Supabase são **protegidas** — não remover, só adicionar as novas | O wizard adiciona, nunca remove — princípio "não partir o fallback" |
| 9 | **Features perderam-se na migração** e exigiram prompts de restauro (Fase 0 diagnóstico → fases → verificação) | O padrão auditoria-primeiro (Master Prompt Auditoria, 10 secções) é o esqueleto do "Moo Scan" |
| 10 | DNS: Vercel IP novo `216.198.79.1` (não o antigo 76.76.21.21); Hostinger A+CNAME; propagação | Checklist DNS guiado com valores actuais verificados na hora (web) |
| 11 | **CLAUDE.md é obrigatório desde o dia 1** — sem ele o CC recomeça do zero | O produto gera o CLAUDE.md do projecto migrado automaticamente |
| 12 | Coexistência funcionou: UI no CC, edge functions via Lovable, prod no Vercel, fallback no Lovable | "Paralelo" é um modo de vida suportado, não uma fase transitória |

**Conflito de fontes (registado honestamente):** a pesquisa web (jul 2026) não encontrou fonte pública que confirme o "sobrescreve Site URL a cada deploy"; o que está documentado é (a) no Lovable Cloud o user **não pode** editar a config de auth de todo (supabase#45388), e (b) no Classic as queixas são de configuração inicial. O Notion do Paulo documenta o comportamento como vivido e intencional (regime Cloud, mar 2026). **Desenho cobre os dois casos**: `redirectTo` explícito no código resolve ambos.

---

## 2. Superfície de export por ferramenta (web, jul 2026)

| | **Lovable** | **Bolt.new** | **v0** | **Cursor** |
|---|---|---|---|---|
| Código sai por | GitHub sync 2-way (1 branch activo) ou Download zip (pago) | GitHub 2-way nativo (mai 2025) ou zip | GitHub (branch por chat, PRs) · zip · shadcn CLI (flaky em 2026) | já é local — n/a |
| Stack | Vite+React+TS+Tailwind+shadcn | variado (WebContainers) | Next.js+shadcn | qualquer |
| Lockfile | **duplo**: package-lock.json + bun.lockb (footgun) | — | — | — |
| Fingerprints | `lovable-tagger`, `@lovable.dev/cloud-auth-js`, `.env` **commitado** (anon key), bot commits | — | — | — |
| Backend | Supabase (2 regimes: Classic vs **Cloud sem dashboard**) | Bolt Database → "claim" para Supabase | Vercel (env via `vercel env pull`) | — |
| Não sai | chat/prompt history, knowledge, secrets, dados (CSV manual), storage (script), **auth passwords (nunca)** | env vars/integrações | env sem projecto Vercel ligado | — |
| Dor que empurra a saída | credit-burn em bugs da própria AI, edit loops, paywall (domínio/download pagos), app pára a $0 créditos | token anxiety ($20→$340), tokens a corrigir erros próprios | paga por gerações falhadas, regressão de qualidade | pricing turmoil 2025 (confiança) |

**Claim oficial do Lovable:** "you are never locked in… You own your code. You own your data." **Gaps reais** (docs deles próprios): porta de sentido único (sem re-import), dados semi-portáveis (CSV manual, passwords impossíveis), Lovable Cloud sem dashboard, URL *.lovable.app irremovível, redirects só 302, e a "memória" do projecto (chat history) fica refém — ponto que liga directo ao pitch de memória auditável do Mooter.

---

## 3. A linha honesta: migrável-auto vs guiado vs não-migra

| Camada | Auto (moo local $0) | Guiado (humano com checklist) | Não migra (dizer antes) |
|---|---|---|---|
| Código fonte (src, config, shadcn) | ✅ clone + limpeza fingerprints + dedupe lockfile | | |
| Deps | ✅ audit (versões, vulns, não-fixadas) | | |
| Schema + RLS + triggers | ✅ já vem em `supabase/migrations/` (Classic) · `db pull` | Cloud: obter acesso via painel Lovable | |
| Edge functions | ✅ código no repo; deploy via CLI | secrets das functions (write-only, re-entrada manual) | |
| Dados (tabelas) | ✅ `db dump --data-only` se houver acesso | Cloud: export CSV manual | |
| Storage (ficheiros) | | script service-key re-upload (oficial Supabase) | |
| **Auth users** | | migração parcial (SQL auth.users) | ❌ **passwords — reset obrigatório** |
| **Secrets** (3rd party) | ❌ nunca tocar | ✅ fluxo "traz as tuas keys" — user cola, nunca transitam pelo Mooter | valores no Lovable/Supabase (write-only) |
| Auth config (Site URL, redirect, OAuth consoles) | ✅ patch `redirectTo` no código | ✅ checklist Supabase + Google Console | |
| DNS / domínio | | ✅ checklist com valores verificados na hora | domínio comprado via Lovable: transfer IONOS, 60-day lock |
| Deploy (Vercel) | ✅ `vercel link` + config | env vars no dashboard | |
| Chat history / knowledge | | extensão Chrome (best-effort) | ❌ version history Lovable |
| **CLAUDE.md + memória** | ✅ gerado do scan | | |

Números honestos: **~80% do *esforço* é automatizável**; os 20% guiados são exactamente os que envolvem credenciais e DNS — e é **desejável** que fiquem no humano (régua de segurança).

---

## 4. Loop holes catalogados (o mapa do campo minado)

1. **Auth redirect / Site URL** → patch determinístico `redirectTo: window.location.origin` + checklist de allowlist (adicionar, nunca remover as URLs Lovable).
2. **Lovable Cloud sem dashboard Supabase** → detectar regime cedo; caminho Cloud passa pelo painel do Lovable; pior caso: recriar projecto próprio + migrar dados (aceitar reset de passwords).
3. **`.env` commitado com anon key** → ok por design *se* RLS forte; scan de RLS fraca é parte do gate de segurança. Remover do tracking + verificar histórico git.
4. **Duplo lockfile** (npm + bun) → escolher npm, apagar bun.lockb, `npm ci` para provar reprodutibilidade.
5. **`lovable-tagger` + `@lovable.dev/cloud-auth-js`** → remoção mecânica (provado no Marley: commit 8603a16).
6. **RLS silenciosa** → smoke tests orientados a dados ("a listagem mostra N registos"), não a build.
7. **Edge functions: import maps/deno.json não vêm no download** → validar deploy de cada function individualmente.
8. **SPA BrowserRouter** → fallback rewrite obrigatório no host novo (vercel.json).
9. **302-only + URLs *.lovable.app cozidas** (OG, sitemap, links) → grep de domínio no código + aviso SEO.
10. **VITE_* baked at build time** → mudar env = rebuild; explicar ao não-dev.
11. **Features fantasma** — o que existe no Lovable live mas não no export (estado, config, integrações) → auditoria de paridade *antes* de declarar "migrado" (o padrão do Master Prompt Auditoria de 10 secções do Marley).

---

## 5. Segurança — como migrar sem o Mooter ver uma key

- **Princípio:** o Mooter **lê nomes, nunca valores**. `supabase secrets list` devolve digests — perfeito: o scan produz a *lista de secrets a re-inserir*, o user cola os valores directamente no destino (Supabase dashboard / `vercel env`).
- **Scan de export (moo local, $0):** regex+entropy para keys hard-coded (Stripe `sk_`, OpenAI `sk-`, JWTs, service_role), `.env` no git history, RLS ausente/fraca por tabela, deps vulneráveis (`npm audit`), CORS `*`.
- **Gate "está pronto":** só passa com 0 secrets hard-coded + RLS presente nas tabelas com dados de user + build reprodutível.
- **O caso Marley é o contra-exemplo a evitar:** a página do plano no Notion tem DB password + service role key em claro. O produto nunca escreve credenciais em docs/output — só nomes e onde colar.

---

## 6. Estratégia paralelo vs corte

O Marley provou o **paralelo**: Lovable vivo como fallback, prod no Vercel, Supabase partilhado, e a "regra de ouro" (verificar Site URL após cada deploy Lovable) enquanto coexistem. O **corte** (Supabase próprio, cancelar Lovable) fica opcional e adiável — o Marley ainda hoje corre no Supabase da org Lovable.

**Default do produto: paralelo.** Corte é um "graduation step" separado, com aviso explícito do custo (reset de passwords, migração de storage, downtime potencial). Honesto e reversível > heróico e irreversível.

---

## 7. Verificação de paridade (onde entra o Live Preview)

1. **Paridade visual:** Live Preview (MP2 já funciona) com o localhost ao lado do Lovable live — screenshot diff por rota (as ~42 páginas do Marley); relatório "N rotas idênticas, M com diferenças".
2. **Smoke tests de dados:** login, listagens com contagens > 0 (mata o RLS silencioso), forms de escrita, webhooks (WAHA no caso Marley).
3. **Build gate:** `npm ci && npm run build` limpo.
4. **Checklist humano final:** o user marca "vi com os meus olhos" por feature — a lista vem da auditoria inicial, não é genérica.

---

## 8. Concorrência e gap

| Quem | O quê | Gap deles |
|---|---|---|
| `lovable-eject` (OSS 2026) | analyse/transform/deploy CLI Lovable→Vercel+Supabase | 1 comando dev-oriented; sem onboarding não-dev, sem $0 local, sem workflow contínuo. **Traction não verificada — auditar antes do posicionamento** |
| Bolt "Import from Lovable" | funil oficial tool→tool | troca de senhorio, não liberta |
| Rescue services (VibeRescue £999+, etc.) | humanos a resgatar projectos presos | caro, não escala, não é produto |
| Guias/SEO (shipper.now, Diploi, etc.) | conteúdo topo-de-funil | prova a procura; não resolve |
| Dyad | alternativa local OSS ao Lovable | substitui o builder, não migra o projecto |

**O gap que só o Mooter fecha:** migração assistida **+** análise pesada em moos locais $0 **+** Live Preview para prova visual **+** o destino não é "um repo no disco" mas um **workflow CC completo** (CLAUDE.md, memória, router, economia). O momento pós-migração é o funil natural para o resto do Mooter.

---

## 9. Decisão de escopo

❄️ **Decisão Paulo 2026-07-05: BACKLOG** — nome **Moove**; fazer mais à frente com maestria, sem descarrilar o foco actual. Item **Parked · P1 · Impacto 9 · Esforço 6 · Frente GTM** no Mooter Backlog (Notion); espelhos integrais deste estudo + desenho + masterprompt + pesquisa bruta na página Moove do HQ Mooter; learnings duráveis no vault (`30-learnings/portabilidade-vibe-tools-pesquisa-2026-07-05.md`).

**Gate de arranque (quando sair do ❄️):** refrescar a pesquisa web (domínio muda <30 dias) + auditar traction do `lovable-eject` → colar `_handoff/MOOVE_MVP_MASTERPROMPT.md` em sessão CC fresca (`wave/moove-mvp`) → gate MVP: E2E na fixture + dogfood re-migrando o Marley + 0 incidentes de secrets.

---

## 10. Fontes

**Internas:** Notion Marley (Plano Completo 3216f6e4 · Base de Conhecimento 3246f6e4-8113 · Prompt Migração 3226f6e4 · Master Prompt Auditoria 3236f6e4-81a6 · Master Prompt Sincronização 3236f6e4-815c · Estratégia Paralelo 3246f6e4-8109) · `_handoff/LIVE_PREVIEW_FEATURE_STUDY.md`.

**Web (jul 2026, selecção):** docs.lovable.dev (github · supabase · external-deployment-hosting · deployment-hosting-ownership · custom-domain · credits-and-usage) · supabase.com/docs (local-development · db-pull · backup-restore · migrating-auth-users · functions/secrets · redirect-urls · identify-lovable-cloud-or-supabase-backend) · github.com/supabase/supabase/issues/45388 · support.bolt.new (projects-files · git · supabase · lovable-import) · v0.app/docs (github · pricing · download-version) · vercel.com/docs (cli/env · project-linking · domains) · github.com/ABS-Projects-2026/lovable-eject · techcrunch.com (Cursor pricing apology) · trustpilot.com/review/lovable.dev · diploi.com · shipper.now · vibe-rescue.dev · npmjs.com/package/lovable-tagger · repo real verificado: github.com/wickathou/soundboarded.
