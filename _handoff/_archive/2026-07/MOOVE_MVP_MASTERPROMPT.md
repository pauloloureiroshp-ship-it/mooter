# ⇄ COWORK→CC · MOOVE MVP — Masterprompt faseado

> ❄️ **STATUS: BACKLOG (decisão Paulo 2026-07-05)** — NÃO executar agora. Item Parked P1 no
> Mooter Backlog (Notion). Antes de colar isto num CC: **refrescar a pesquisa web** (docs
> Lovable/Supabase/Bolt/v0 mudam <30 dias — anexo de pesquisa na página Moove do Notion) e
> **auditar a traction do `lovable-eject`** (concorrente OSS directo).

> **GOAL:** construir o MVP do **Moove** — migração assistida Lovable → Claude Code, escopo
> **1 ferramenta (Lovable) + 1 stack (Vite+React+TS+Tailwind+shadcn+Supabase — o stack do Marley)**.
> **WHERE:** `~/frugal`, branch novo `wave/moove-mvp`, package novo `packages/moove`.
> **CONTEXTO OBRIGATÓRIO (ler antes de codificar):**
> `docs/strategy/PORTABILITY_LOVABLE_TO_CC_STUDY.md` · `docs/strategy/MOOVE_PRODUCT_DESIGN.md` · `CLAUDE.md` do repo.

## GUARD (invariantes — violação = parar)

- `tools/router/classify.js` **FROZEN** (sha CI-enforced) — não tocar.
- Packages congelados (waves 28-34.5) **não se modificam**. Todo o código novo vive em `packages/moove/` (package novo = permitido). **Integração no CLI (`packages/cli`) fica FORA deste masterprompt** — regista o que seria preciso em `packages/moove/INTEGRATION_NOTES.md` e o Paulo decide o allowlist numa wave futura.
- Git: staging selectivo, **nunca `git add -A`**. Sem push sem o Paulo mandar.
- Sem novos `.md` na raiz do repo.
- **Segurança Moove:** o código NUNCA lê, imprime, loga ou persiste valores de secrets. Só nomes. Qualquer output que possa conter um valor de secret é redigido (`sk_***`). Testes incluem este contrato.
- Código e identifiers em inglês; output de utilizador (relatórios) em PT-BR (produto para o público do Marley) com copy honesto — nunca "perfect", "100%", "1-click".
- Cada fase termina com testes verdes + commit atómico. Não saltar gates.

---

## FASE MV0 — Scaffold + fixture de teste (gate: testes correm)

1. `packages/moove/` standalone: `package.json` (node >=20, sem deps do engine congelado; deps mínimas — usar o que já existe no monorepo como devDeps padrão), `src/`, `test/`, `README.md` curto.
2. **Fixture:** `test/fixtures/lovable-export/` — mini-projecto sintético que reproduz um export Lovable real (verificado na pesquisa 2026-07): `vite.config.ts` com `componentTagger()` de `lovable-tagger`, `package.json` com `lovable-tagger` + `@lovable.dev/cloud-auth-js`, **`package-lock.json` E `bun.lockb`**, `.env` com `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` (valores fake), `src/integrations/supabase/client.ts`, `supabase/config.toml`, `supabase/migrations/` (2 SQL com RLS, 1 tabela SEM RLS de propósito), `supabase/functions/hello/index.ts`, um `signInWithOAuth` SEM `redirectTo`, um secret hard-coded de propósito (`sk_test_FAKE123` num componente), um URL `https://fake.lovable.app` cozido num link, `index.html` + `src/App.tsx` com BrowserRouter e 3 rotas.
3. Runner de testes igual ao resto do repo (`cd packages/moove && npm test`).

**Gate MV0:** fixture existe, testes arrancam, commit `feat(moove): scaffold + lovable export fixture`.

## FASE MV1 — Moo Scan (read-only, $0) (gate: relatório correcto na fixture)

`src/scan/` — análise **100% read-only**, determinística, sem LLM:

1. **Inventory:** rotas (parse React Router), páginas, hooks, componentes, edge functions, migrations (contagem + nomes UUID vs semânticos), env vars referenciadas (`import.meta.env.*`).
2. **Fingerprints Lovable:** `lovable-tagger` (vite.config + package.json), `@lovable.dev/*` deps, `.env` tracked no git (`git ls-files`), duplo lockfile, commits `lovable-dev[bot]`, URLs `*.lovable.app` no código.
3. **Security scan:** secrets hard-coded (regex + entropia: `sk_`, `sk-`, JWTs, `service_role`; report com valor REDIGIDO), tabelas em migrations sem policy RLS, `signInWithOAuth`/`signInWithPassword` sem `redirectTo`, CORS `*` em edge functions.
4. **Regime detection (heurística):** presença de `@lovable.dev/cloud-auth-js` ⇒ provável Lovable Cloud; senão perguntar (o output marca `regime: unknown → ask user`).
5. Output: `MooveScanResult` (JSON tipado) + testes que fixam contra a fixture (nº exacto de findings, cada categoria).

**Gate MV1:** na fixture, o scan encontra: 2 deps Lovable, .env tracked, duplo lockfile, 1 secret hard-coded, 1 tabela sem RLS, 1 OAuth sem redirectTo, 1 URL lovable.app. Nem mais, nem menos. Commit atómico.

## FASE MV2 — Mapa Honesto (gate: legível por não-dev)

`src/report/` — transforma o `MooveScanResult` no relatório 3-cores (o coração do produto, ver design §3):

1. Markdown com as 3 colunas: 🟢 migra sozinho / 🟡 eu guio-te / 🔴 não migra — com os itens do scan mapeados e estimativa de tempo honesta por item.
2. Secção "⚠️ Riscos encontrados" (security findings, valores redigidos) com explicação de 1 linha *para leigo* de porquê importa.
3. Secção "O que vais precisar de ter à mão" (lista de *nomes* de secrets/keys + onde os encontrar).
4. Regra de copy testada: proibido "perfect|100%|one.?click|zero effort" no output (teste literal).

**Gate MV2:** snapshot test do relatório da fixture; um leigo lê e sabe o que o espera. Commit.

## FASE MV3 — Migração de código (gate: fixture migrada builda)

`src/migrate/` — actua numa **cópia** (nunca in-place), branch `moove/migration`:

1. Remover `lovable-tagger` (vite.config + package.json) e `@lovable.dev/*`.
2. Dedupe lockfile: manter `package-lock.json`, apagar `bun.lockb`.
3. `.env`: remover do tracking (`git rm --cached`), gerar `.env.example` com os nomes, garantir `.gitignore`.
4. Patch auth: injectar `redirectTo: window.location.origin + '<path detectado>'` nos `signInWithOAuth` sem redirectTo (AST via ts-morph ou equivalente — não regex frágil).
5. `vercel.json` com SPA fallback rewrite.
6. Gerar **CLAUDE.md** do projecto migrado a partir do scan: stack, comandos (dev/build/test), mapa de pastas, gotchas (RLS silenciosa, VITE_ baked at build, URLs lovable remanescentes), regras de segurança (nunca expor service_role, etc. — herdar as "regras não-negociáveis" do prompt Marley).
7. Relatório de migração: cada mudança listada, URLs `*.lovable.app` **não** alteradas automaticamente — listadas para decisão humana.
8. Cada transformação = função pura testável + teste na fixture; no fim `npm ci && npm run build` da fixture migrada passa (fixture tem de ser buildável — ajustar MV0 se preciso).

**Gate MV3:** fixture migrada: 0 fingerprints, 1 lockfile, .env untracked, redirectTo presente, CLAUDE.md gerado, build verde. Commits atómicos por transformação.

## FASE MV4 — Guias interactivos (backend/secrets/DNS) (gate: dry-run completo)

`src/guide/` — os 20% humanos, como checklists geradas (markdown interactivo no terminal):

1. **Guia Supabase Classic:** `supabase link` → `db pull` → validar migrations → `functions deploy` — comandos prontos a copiar, com placeholders `<PROJECT_REF>` (o Moove nunca os preenche com valores reais de terceiros).
2. **Guia Lovable Cloud:** caminho Marley — onde clicar no painel Lovable (Cloud → Auth settings → Advanced), decisão paralelo-vs-corte com custos explícitos (reset passwords, storage script, CSV), sem automação.
3. **Guia secrets:** lista de nomes do scan → link directo para a página certa (Supabase Edge Functions → Manage Secrets / Vercel env) → checkbox por item.
4. **Guia auth/DNS:** Site URL + redirect allowlist (**adicionar, nunca remover** — regra Marley), OAuth consoles, DNS A/CNAME com nota "verificar valores actuais na doc Vercel" (não hard-codar IPs — mudaram uma vez, mudam outra).
5. Estado persistido em `.moove/state.json` no projecto migrado (retomável).

**Gate MV4:** dry-run completo na fixture percorre os 4 guias sem erro; nenhum guia contém um valor de secret. Commit.

## FASE MV5 — Verificação de paridade (mínima) + CLI (gate: E2E na fixture)

1. `src/verify/`: smoke test runner mínimo — `npm run build` + arranque do dev server + HTTP 200 nas rotas do inventário + grep de erros na consola do dev server. (Screenshot-diff e integração Live Preview ficam FORA do MVP — registar em `INTEGRATION_NOTES.md` como fase seguinte.)
2. `bin/moove.js`: `moove scan <path>` · `moove report` · `moove migrate` · `moove guide` · `moove verify` — pipeline completo, `--json` para cada comando.
3. `README.md` do package: quickstart honesto + o disclaimer de promessa (copy do design §1).
4. E2E: fixture → scan → report → migrate → verify, tudo verde num único teste.

**Gate MV5 (= gate do MVP):** E2E verde; suite completa `cd packages/moove && npm test` verde; `INTEGRATION_NOTES.md` lista o que falta (CLI integration, cockpit wizard, Live Preview paridade, dogfood Marley).

---

## NEXT (fora deste masterprompt — decisão do Paulo)

1. **Dogfood real:** correr o Moove contra o repo do Marley (`~/marleyliving`) — a prova de fogo.
2. Integração `mooter moove` no CLI (requer allowlist de `packages/cli`).
3. Wizard visual no cockpit + paridade Live Preview (screenshot-diff por rota).
4. Nome final (Moove vs Onboard vs Graduation) + landing/GTM.

## BACK (o que devolver ao Cowork)

`SYNC.md` actualizado + resumo: fases completadas, testes (N/N), sha do classify intacta,
findings inesperados, e o output do `moove report` da fixture colado em `_handoff/MOOVE_MVP_RESULT.md`.
