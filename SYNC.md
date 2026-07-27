# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` (Mac) e `C:\Users\Paulo Loureiro\frugal\SYNC.md` (Windows).
> Snapshot, não log (regra ≤200 linhas; histórico em `docs/foundation/SYNC_ARCHIVE_2026.md`).

**Atualizado:** 2026-07-13 · **GitHub `main` @** `89ff3e3` (PR #246 merged) ·
**extensão em main:** `v0.16.67` · **candidata local instalada:** `v0.16.72` em
`fix/lp-iframe-reload-rearm` (**push/review/merge pendentes**).

## Verdade atual

- **LP-COERÊNCIA:** PR #246 merged; os 19 findings COH-01…19 estão em `main`.
- **Seleção/prompt pós-reload:** o host rearma o tap depois de reload same-URL; se a caixa não couber sem
  cobrir o pin, o mesmo prompt docka no topo do rail, é revelado mesmo quando o rail estava scrollado e a
  🐮 sempre reabre com foco. O dock fica sticky durante a seleção, inclusive após resizes tardios do webview.
- **Estabilidade do preview:** conexão TCP sem status HTTP dentro do budget é inconclusiva, não erro positivo;
  o porto configurado continua autoritativo nessa ronda e a identidade/pin não são invalidados. Budget do
  probe subiu para 1,8 s. Erro HTTP real continua fail-closed. Prova Chromium isolada: 100 s, 99 amostras,
  zero reload/blank/perda de pin/textbox; mais 3 reloads manuais com árvore verde.
- **Descoberta/recovery do localhost:** probe HTTP 2xx+HTML em IPv4/IPv6, portas configuradas/comuns e ranges
  auto-incrementados em paralelo. Poll automático e ↻ são latest-wins; ↻ nunca se perde durante outro probe,
  ignora identidade sticky, recupera override inalcançável e recarrega o iframe same-URL. Reinício exige trust
  e só encerra listener com ownership do projeto comprovado. Socket reutilizado não acumula listeners. Suite
  extensão com HOME isolada e ficheiros seriais **1209/1209 pass**; landing **211/211 + typecheck**.
- **Árvore realmente em teste:** a janela QA, o workspace do VS Code e o processo que possui `:7819` apontam
  todos para `C:\Users\Paulo Loureiro\frugal-lp-coerencia`; o gate confirmou a raiz servida `landing/` nessa
  mesma linhagem. As 12 worktrees ainda registadas não causaram esta falha, mas a consolidação para uma única
  pasta canónica `frugal` ainda não terminou.
- **MEO Control Tower:** Control/Stream/Sessões cruzam bus, execução real, catálogo de sessões e Ledger tipado.
  Cada etapa mostra agente, modelo, canal com base de atribuição, título da sessão e wave/PR; handoffs, fleet e
  sinais de Notion/Obsidian ficam visíveis sem inventar acesso. Suite extensão **1176/1176 pass**.
- **Tracking durável:** `tools/router/agent-sync-ledger.js` gera `_handoff/agent-sync/{events.jsonl,snapshot.json,
  latest.md,prompts/,briefs/}` (estado operacional local e gitignored). O Stop hook existente registra turnos
  Claude automaticamente; Codex/Gemini/Ollama usam checkpoints/briefs tipados.
- **Landing:** suite **211/211 pass**. Build compila e chega à recolha de páginas, mas para por ausência local
  de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; não é regressão atribuída ao código.
- **Classificador:** `tools/router/classify.js` SHA
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — FROZEN/intacto.
- **Bind da landing:** mudança `127.0.0.1 → 0.0.0.0` preservada separadamente em
  `wip/landing-bind-all-interfaces @ 1f3b9a6`; não integrar sem decisão explícita sobre exposição de rede.

## Consolidação dos worktrees

Auditoria mecânica pelo Git nativo do Windows, confrontada com `origin/main`. Dos 40 worktrees iniciais,
27 limpos foram removidos sem `--force`; todas as branches foram verificadas como preservadas.

| Estado atual | Quantidade | Tratamento |
|---|---:|---|
| Worktree canónico `frugal` | 1 | manter; preservar WIP antes de alinhar a `main` |
| Worktree desta consolidação | 1 | limpo; branch candidata publicada |
| Outros worktrees sujos | 10 | patches + não rastreados preservados no cofre; revisão antes de remover |
| **Registrados** | **12** | eram 40; redução segura de 70% |

`frugal-final` saiu do registro Git, mas o Windows manteve um resíduo órfão de 5,7 MB bloqueado em
`packages/vscode-extension/src`; não foi forçado. Fechar o processo que mantém o diretório aberto antes de
remover o resíduo físico.

O diretório pretendido como canónico, `C:\Users\Paulo Loureiro\frugal`, ainda está em
`wave/honest-controls` e contém 25 alterações rastreadas + 1562 não rastreadas. Ele **não pode** ser
transformado em `main` nem limpo até o conteúdo real ser separado de caches, projeções e arquivos de trabalho.

## Arquitectura de informação

- Régua/auditoria/mock/masterprompt já executados foram movidos para `_handoff/_archive/2026-07/`.
- **Alocação Live Preview:** auditada sem movimentos; `extension.js`, módulos flat `lp-*`/`live-edit-*`, assets,
  tap na landing e hook no router permanecem nos locais atuais. O §8 do handoff fixa os contratos e armadilhas.
- **Extensão legada `vscode-extension/`:** é um pacote `mooter-savings@0.5.2` completo, não um ficheiro órfão.
  A mesma implementação está instalada nesta máquina como `frugal.frugal-savings-0.5.2`; fica preservada até
  uma PR separada migrar/desinstalar essa identidade e decidir os comportamentos únicos.
- Handoffs Guardian com nome UUID são projeções locais regeneráveis e agora ficam ignorados; os specs Guardian
  canónicos continuam rastreados.
- Specs vivas permanecem em `docs/strategy/`; `LIVE_EDIT_ROADMAP.md` é o arco canónico do Live Preview/Edit.
- Notion HQ e `~/Documents/paulo-vault/Mooter` estavam **NO ACCESS** nesta sessão; nenhum conteúdo foi inventado
  ou escrito externamente.

## Guardrails permanentes

`classify.js` FROZEN · packages de motor congelados fora de allowlist · selective `git add` ·
zero push/merge/delete sem Paulo · deploy real sempre humano · T5 só `@fable` · honest-copy (`n/d`) ·
webview concat-only/CSP/origin-lock/tree-gate preservados.

## Próxima missão

1. Na janela principal do Paulo, executar uma única vez **Developer: Reload Window** para o extension host
   carregar a `v0.16.72` já instalada; repetir pin → prompt/dock → minimizar/reabrir. A prova isolada já passou.
   Depois push seletivo para atualizar o draft PR; merge/Marketplace continuam gates humanos.
2. Preservar/triangular o trabalho real dos 11 worktrees sujos, começando pelo diretório canónico `frugal`.
3. Remover o resíduo órfão `frugal-final` somente depois de o lock do Windows desaparecer.
4. Deixar apenas `C:\Users\Paulo Loureiro\frugal` em `main`, limpo e sincronizado; branches históricas podem
   continuar no Git sem ocupar pastas.

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar.

**Última actualização Cowork:** 2026-07-26 · **Estado:** 🟡 Por ler

- **ONDA 0 (a régua honesta) SHIPPED** em `chore/mooter-20-h0` @ `fd4f425` + `4bf34eb` (pushed, v1.11.0):
  dedup por requestId (inflação **medida 2,44×**: 2061 linhas → 844 turnos), guard #25941,
  entradas no peso, quota **Codex disponível** (rollouts locais), `forcar_local` ligado ao dispatch,
  referência calibrável via `~/.mooter/preferences.json → quota_referencia`.
- Medição real em `_handoff/onda0-medicao.json`; plano completo em
  `_handoff/MASTER_PROMPT_MOOTER_COWORK_2026-07-26.md`.
- **ONDA 1 TAMBÉM SHIPPED** @ `86a3af5` (v1.12.0): `num_ctx`≥16384 + `keep_alive` 10m (fim da
  truncagem silenciosa a 4096; corte agora é DITO com números), selector adequação×capacidade
  (`qwen3.6:27b` ganha ao `qwen3:30b`; código → `qwen2.5-coder:14b`; residente de geração velha
  não bloqueia), `OLLAMA_KV_CACHE_TYPE=q8_0` (User env — **reiniciar o Ollama para valer**).
- **ONDA 2** @ `6224a0d` (v1.13.0) + `0a666e3`: timeout de preparação (`MOOTER_PREP_TIMEOUT_MS`,
  20 s), fallback quando o moo falha (o chain deixou de morrer em silêncio), prep medida no ledger,
  sondas do painel em paralelo. Causa-raiz apanhada a meio: `quota.estado()` era **síncrona e
  bloqueava o event loop 209 ms** → nasceram `quota.medirAsync/estadoAsync`.
- **ONDA 3** @ `9026e57` (v1.14.0): `aprender.js` — um resultado de job **muda decisões futuras**
  (≥5 observações, nunca contra um veto de risco), keep rate honesto (`n/d` quando não é
  atribuível), satisfação inferida, custo por tarefa entregue, bloco "o que aprendi". Prova com o
  ledger real: 73 jobs, 55 entregues, 27 locais, custo mediano US$ 0,4826 em 45 jobs.
- **ONDA 5.1/5.3** @ `0a666e3`: `docs/strategy/STRATEGY.md` reescrito na tese "o motor é o fosso, a
  cabine é o produto" (estava congelado em 2026-05-07 a dizer v0.11) e
  `docs/strategy/RADAR_CONCORRENCIA.md` criado, com cadência trimestral.
- **Conector actualizado 1.9.0 → 1.12.0**; há bundle novo por instalar em `_handoff/`.
- ⚠️ **Duas regras novas, ambas pagas caro:** (1) o sandbox Linux dá **falsos-verdes** — o E2E do
  `v12.test.js` é saltado sem git e dava "20/20" enquanto o Windows falhava 3/3; o gate real é o
  runner nativo. (2) Um commit pode ficar **incoerente** — `6224a0d` chamava `quota.estadoAsync`
  sem incluir o `quota.js` que a define; verificar sempre que o que o commit chama existe no commit.
- Referência da quota **calibrada com dado real**: barra /usage a 75% → `quota_referencia`
  `{peso_semana: 11961, peso_5h: 1196}` em `~/.mooter/preferences.json`. Pressão agora ≈0,75 = "alto"
  (tecto sonnet) — bate com a app, sem haiku falso.
- Decisão 1.4: `specialization-matrix.ts` NÃO é consumível do bridge (TS + células por medir);
  o selector local usa factos verificáveis (nome/tamanho/geração). Ligar a matriz medida = Onda 3
  (adaptive-learner). Nada ficou a fingir que decide.
- **Próxima missão: ONDA 4** (o fosso — mapa de projecto persistente `PROJECT_CONTEXT.json`,
  verificação cruzada local↔nuvem a $0, fan-out, estratégias nomeadas de routing) e depois
  **5.2/5.4** (Notion 7 releases atrás; bugs do conector: `create_worktree` ignorado,
  `permissoes_efectivas` que declara read-only e usa Bash, bind de projecto que se perde).
- ⚠️ Por fazer na máquina: **reiniciar o serviço Ollama** (para o KV cache q8_0 valer) e **fechar e
  reabrir o Claude Desktop** (o conector em memória ainda é o antigo). Depois, confirmar num job
  real que o `/api/ps` mostra `context_length ≥ 16384` e que o modelo escolhido é o `qwen3.6:27b`.

## Pointers

- Auditoria: `_handoff/_archive/2026-07/LP_COHERENCE_AUDIT_REPORT.md`
- Mock aprovado: `_handoff/_archive/2026-07/mooter-live-preview-mock-v2.html`
- Masterprompt executado: `_handoff/_archive/2026-07/LP_FABLE5_COHERENCE_IMPL_MASTERPROMPT.md`
- Spec viva: `docs/strategy/LIVE_EDIT_ROADMAP.md`
- Estratégia: `docs/strategy/STRATEGY.md`
- Infra: `INFRA.md`
