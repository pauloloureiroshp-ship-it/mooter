# ⇄ HANDOFF Cowork→Cowork · Arquitectura de Informação — arrumar os .md + afinar a metodologia

> **Para quê:** o projecto Mooter/Live Edit evoluiu MUITO (LP-4.7 em main, funil Lovable-grade
> local-first a caminho). Com isso a documentação inchou e a metodologia de informação ficou
> para trás. Esta sessão Cowork nova endereça as 5 dores do Paulo (§2) **sem** partir nada.
> **Regra de ouro deste trabalho: bisturi, não buldózer. Consolidar > apagar. Git é do Paulo.**
> **Data:** 2026-07-07 · não-dev · sabbatical técnica.

## 0. Boot obrigatório (lê ANTES de tocar em nada — responde à dor "vault não é levado em conta")
Vault montado em `~/Documents/paulo-vault`. Lê, por esta ordem:
1. `00-core/protocolo-comunicacao.md` — a rota Paulo·Cowork·CC, os formatos canónicos, as 3
   camadas de memória. **Já existe e é bom; o problema é que não está a ser vivido.**
2. `00-core/regras-de-trabalho.md` + `00-core/freshness-protocol.md` — quando cruzar vault vs
   web vs feed; a régua "SYNC muda por sessão, vault muda por decisão".
3. `20-decisions/4-canonicos.md` — os 4 ficheiros por projecto (CLAUDE/SYNC/MEMORY/LOOP) e o
   que cada um guarda.
4. `00-core/3rd-brain.md` + `00-core/project-map.md` — o sistema operativo do vault.
5. `~/frugal/CLAUDE.md` + `AGENTS.md` — invariantes do repo (⚠️ CI-enforced, ver §4).

## 1. Como falar com o Paulo (não-negociável)
PT-PT (não PT-BR): "ficheiro", "ecrã", "actualizar". "Tu", nunca "você". Founder-pragmatic,
directo, denso, tabelas > prosa. Marcadores: ✅ 🔜 🟡 ⚠️ ❌ 🔥 ❄️ 🛠. Nunca hype vazio, nunca
inventar números ("verifica em X"). Nomes próprios não se traduzem (Mooter, Cowork, Claude Code).

## 2. As 5 dores do Paulo (o alvo)
1. Comunicação Paulo·Cowork não totalmente fluida.
2. O pensamento do Paulo (vault/Obsidian) não está a ser levado em conta perfeitamente.
3. Demasiados ficheiros → poluído e pouco eficiente (`_handoff/` ~134 itens; hoje 7+ estudos
   LP-* sobrepostos).
4. Podem faltar tipos de .md por falta de metodologia actualizada/eficiente.
5. Incerteza se estamos a usar os melhores skills, conectores, plugins, soluções terceiras.

## 3. Diagnóstico (a sessão deve validar/refutar, não assumir)
A metodologia JÁ existe no vault; a falha é de **disciplina de execução**, não de desenho:
- O `freshness-protocol` manda cruzar 2 ficheiros do vault antes de decisões estratégicas —
  na prática o vault é lido no boot e esquecido.
- Não há uma regra viva e curta de **"onde vive o quê"** aplicada a `_handoff/` → tudo cai lá,
  efémero e canónico misturados, nunca se consolida.
- `SYNC.md`/`LOOP.md` do repo subusados (o registo vai para Notion/vault, o canal repo seca).
⇒ Arrumar sem instituir a regra = re-poluição em ~2 semanas. A regra vem primeiro.

## 4. O que NÃO fazer (guardas duros)
- ❌ NÃO tocar invariantes CI-enforced: `tools/router/classify.js` (sha frozen), packages
  frozen das waves 28-34.5, sem novos `.md` na RAIZ do repo sem pedido.
- ❌ NÃO reestruturar o vault (Johnny-Decimal) sem OK explícito por pasta; NÃO renomear em massa
  (os wikilinks `[[10-projects/mooter]]` partem-se).
- ❌ NÃO apagar nada por conta própria — **mover para `_handoff/_archive/` ou consolidar**, e o
  Paulo decide o `git rm`. Git (escrita) é sempre do Paulo, PowerShell nativo.
- ❌ NÃO mexer no `~/frugal` enquanto está em `wave/honest-controls` behind 32 (ver §7) sem o
  Paulo arrumar primeiro — trabalhar sobre base errada.

## 5. Plano em fases (cada fase pára para OK do Paulo)
**Fase 0 · Inventário (read-only).** Mapear: (a) `_handoff/*.md` — agrupar por tema, marcar
efémero (executado, obsoleto) vs vivo (spec actual); (b) os 4 canónicos do repo — existem e
estão frescos?; (c) vault — que ficheiros deviam ter sido criados hoje e não foram; (d) Notion
HQ — está em dia? Output arquivado: `_handoff/_archive/2026-07/INFO_AUDIT.md` (tabela, sem mexer em nada).

**Fase 1 · A regra "onde vive o quê" (o coração).** Escrever/afinar uma tabela curta e viva:
efémero (masterprompt executado → arquiva) · spec vivo (1 por feature, consolidado) · canónico
repo (CLAUDE/SYNC/MEMORY/LOOP) · decisão estável (vault) · log (Notion). Onde arquivar o
efémero. Quando consolidar. Vive em `AGENTS.md`/`CLAUDE.md` do repo + espelho no vault
`00-core/`. Isto resolve a dor 3 e 4 de forma permanente.

**Fase 2 · Consolidar o que hoje explodiu.** Fundir os LP-* (VISION + CONTEXT_PACK_STUDY +
QUALITY_UX_STUDY + MP5 specs + SUPER_WAVE) num único `docs/strategy/LIVE_EDIT_ROADMAP.md`
(vivo, canónico) + arquivar os masterprompts já executados. Actualizar `SYNC.md` do repo com o
estado real (LP-4.7 em main, comboio LP-4.8→6 pendente). Alimentar `LOOP.md` com os aprendizados
de hoje (vsix packaging, fence assimétrica, asset whitelist).

**Fase 3 · Fechar o loop de memória.** Garantir as 3 camadas em dia (Ledger automático · Notion
HQ · vault por decisão). Um registo único do "dia de aterragens" se ainda faltar.

**Fase 4 · Auditoria de skills/conectores/plugins (dor 5).** Listar o que está instalado
(skills: notion-to-vault, sync-project, etc.; conectores: Notion, Vercel, Supabase, GitHub) vs
o que devia estar a ser usado; propor o que activar. Usar `list_skills`/`suggest_skills` e a
registry de conectores. Não instalar nada sem OK.

## 6. Meta-honestidade (reconhecer a ironia)
Este handoff é +1 ficheiro no `_handoff/` que se queixa de ter ficheiros a mais. É deliberado:
é META (o handoff que institui a limpeza) e a **primeira coisa a arquivar** quando a Fase 2
terminar. Regista isto para não virar lixo permanente.

## 7. Estado operacional a confrontar (nativo, não prints)
- `~/frugal` está em `wave/honest-controls`, `behind 32`, ~78 uncommitted (ambiente). O `main`
  tem tudo (MP5.2a→LP-4.7). Recomendação ao Paulo antes desta sessão: `git switch main` limpo no
  `~/frugal` (arrumar o stash/uncommitted primeiro) — mas é decisão dele.
- Worktrees acumuladas por limpar (R6): frugal-mp52a, frugal-land-mp52a, frugal-lpfix, frugal-lp4,
  frugal-lp45, frugal-lp47, frugal-audit. Podar quando o Paulo autorizar.

## 8. Onde está tudo
- Vault: `~/Documents/paulo-vault` (00-core, 10-projects, 20-decisions, 30-learnings, 40-strategy…).
- Repo: `~/frugal` — canónicos `CLAUDE.md`/`SYNC.md`/`MEMORY.md`/`LOOP.md`; `AGENTS.md`; `docs/`;
  `_handoff/` (o alvo da limpeza).
- Notion HQ Mooter (conector). Memória Cowork: espelho em disco.
- Specs LP-* de hoje: `_handoff/LIVE_EDIT_*`, `_handoff/SUPER_WAVE_*`, `_handoff/LIVE_PREVIEW_*`.

## 9. Régua de ouro (repetir no fim de cada fase)
Consolidar > criar. Arquivar > apagar. Confrontar o real > assumir. O vault alimenta a resposta,
não decora o boot. Uma regra de "onde vive o quê" que se cumpra vale mais que uma arrumação
perfeita que ninguém mantém.
