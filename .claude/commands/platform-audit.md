# /platform-audit — mooter.ai Platform Audit v3

> **Baseado no histórico real da sessão 2026-04-18.** Não repete verificações já feitas.
> Foca apenas o que falta de facto.

**LEITURA OBRIGATÓRIA ANTES DE QUALQUER TOOL CALL:**
```
Read /frugal/prompts/PLATFORM_AUDIT_MASTER.md           ← brief completo (lê TUDO)
Read /frugal/prompts/INFRA_VERIFY_AND_NOTION_LOG_MASTER.md  ← handoff da sessão anterior
Read /frugal/SYNC.md
Read /frugal/INFRA.md
```

**JÁ VERIFICADO — não repetir:**
Landing ✅ · LoginHero ✅ · Onboarding ✅ · Dashboard (CSS cascade) ✅ · Settings ✅ ·
Vercel 3 deploys READY ✅ · Hub /api/stats ✅ · Todos /api/* sem 500s ✅ · Supabase OAuth ✅

---

## PASSO 0 — MCPs: resolver antes de tudo

```bash
claude mcp list
# Tentar ToolSearch para Notion, Supabase, Cloudflare
# Se MCPs não carregam → usar CLIs (supabase login, vercel, wrangler, gh)
```

## BLOCO 1 — PRIORITÁRIO: 3 CI tests a falhar

```bash
gh run view $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId') --log-failed 2>&1 | \
  grep -E "not ok|# Subtest" | head -20
```
Tests: `pricing: Opus turn costs 30-60×` + `sub-tier specialist` (qwen logic) + 1 mais.
Corrigir em `tools/router/`. Confirmar CI verde via `gh run watch`.

## BLOCO 2 — Supabase (requer `supabase login`)

```bash
supabase login   # uma vez, interactivo
supabase db execute --project-ref eymtobwinevywmmlmxqa \
  "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND table_schema='public';"
```
Verificar: `hw_tier`, `gpu_name`, `frugal_version` existem; `device_heartbeats` existe; RLS activo em todas as tabelas.
Se colunas em falta → criar migration `landing/migrations/008_profiles_hw_fields.sql`.
Verificar redirect URLs em Supabase Dashboard: incluem `https://mooter.ai/**`?

## BLOCO 3 — Vercel: env var em falta

```bash
echo "https://mooter-hub.frugal-hub.workers.dev" | vercel env add NEXT_PUBLIC_MOOTER_HUB_URL production
```

## BLOCO 4 — Notion: 3 páginas de sessão

Se MCP Notion carregou:
```
notion-create-pages → parent: { page_id: "33d6f6e4-2bc4-816b-977a-fe84bbe912c9" }
  título 1: "🎨 Sessão 2026-04-18 — Landing warm beige redesign (mooter.ai)"
  título 2: "🔐 Sessão 2026-04-18 — Auth + App warm dark redesign"
  título 3: "🔍 Sessão 2026-04-18 — Platform audit"
```
Se não → tentar Notion HTTP API com token de `.credentials.json`. Se também falhar → descrever o que vai em cada página e reportar ao Paulo.

## BLOCO 5 — UX: middleware redireccion issue

```bash
cat /frugal/landing/middleware.ts | head -30
```
Comportamento actual: `/dashboard` sem cookie → 307 → `/#access` (nunca vê LoginHero).
Apresentar ao Paulo: é intencional ou deve redirigir para `/dashboard` e mostrar LoginHero? **Não alterar sem decisão.**

## BLOCO 6 — Código menor

```bash
grep -n "qwen2.5:7b" /frugal/landing/app/lib/generate-frugal-config.ts  # fix → :3b
/gsd-update  # stale hooks
```
INFRA.md: actualizar tema (warm beige), URL (mooter.ai), endpoints hub.

## BLOCO 7 — SYNC.md + Escalabilidade

SYNC.md: actualizar após todos os blocos.
Escalabilidade: documentar DB size actual + thresholds (Supabase 400MB→Pro, Vercel 80GB→Pro, CF 80k req→$5) no Notion página 3.

---

## CHECKLIST

```
[ ] Bloco 0 — MCPs carregam ou CLI workaround em uso
[ ] Bloco 1 — CI 3 tests verdes ← PRIORITÁRIO
[ ] Bloco 2 — Supabase: schema + RLS + redirect URLs
[ ] Bloco 3 — NEXT_PUBLIC_MOOTER_HUB_URL na Vercel
[ ] Bloco 4 — 3 páginas Notion criadas
[ ] Bloco 5 — middleware decision documentada
[ ] Bloco 6 — qwen fix + hooks + INFRA.md
[ ] Bloco 7 — SYNC.md + escalabilidade
[ ] npm run build → exit 0 · git push · Vercel READY
```

**INFRA IDs:**
```
Vercel:     prj_2aZMQagzjYOtLyvofeWPnEA0mM1b  /  team_q3kDk3fEFhlL6AcNryTzH3o2
Supabase:   eymtobwinevywmmlmxqa
Cloudflare: b1093c8a6e663afd02f98a1e87d0fa34
Hub:        https://mooter-hub.frugal-hub.workers.dev
Notion HQ:  33d6f6e4-2bc4-816b-977a-fe84bbe912c9
```
