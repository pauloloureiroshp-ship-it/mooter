# Live Edit · LP-4 → LP-6 — Prompt ancorado → Security Review → Publish (a visão completa)

> **Visão do Paulo (2026-07-06):** tudo o que fixo com pin → prompt + escolha de LLM (local $0
> ou subscription) + resultado visual em tempo real · botão **🛡 review security** (melhor skill
> possível, local) · depois do OK do review, botão **🚀 publish** — o utilizador vê a mágica
> acontecer de ponta a ponta.
>
> Advogado do diabo aplicado 2026-07-06 (Cowork/Fable 5): 6 buracos achados no draft da 5.2b —
> corrigidos no masterprompt LP-4 v2 abaixo. Regra: **3 waves atómicas, não 1 mega-wave**
> (postmortem R1-R6; mega-waves foi como se perdeu o MP3).

## Sequência (cada uma aterra e prova antes da seguinte)

| Wave | Entrega | Gate humano |
|---|---|---|
| **LP-4 · Prompt ancorado v2** | caixa de prompt no pin + LLM local $0 default + escalação subscription via Agent SDK + cerca AST + hash-guard + **undo** + **re-prompt no mesmo nó** | diff antes de escrever; merge só com OK |
| **LP-5 · 🛡 Review Security** | botão no Live Preview → pipeline LOCAL $0 (secret-scan + npm audit + headers/CSP + XSS estático) + moo local explica findings em PT + fixes cercados 1-clique (cada fix = mesmo motor da LP-4) | findings P0 bloqueiam o publish |
| **LP-6 · 🚀 Publish** | só activo com review verde → commit selectivo das edições + push + deploy Vercel preview → URL no painel → "promote to production" com confirmação two-factor | publish é irreversível → SEMPRE confirmação explícita |

## LP-4 v2 — correcções do advogado do diabo (vs draft §4 do SelectLock_Spec)

1. **Escalação cloud = Agent SDK headless** (não API key): a extensão não tem credencial; a
   subscription Max entra via ponte `sdk-runner.mjs` (provada em [[project_mooter_cowork_cc_bridge]])
   / mooter-bridge P1. Botão "subir p/ Sonnet/Opus" → spawn headless com SÓ o subtree + prompt;
   a resposta volta pela MESMA cerca (spliceNodeRange + hash-guard). `@fable` manual only.
2. **Undo $0**: antes de cada escrita, guardar {file, span, texto anterior, sha}; botão
   "desfazer último" aplica o inverso por byte-splice. Histórico por sessão (mínimo: 1 nível;
   ideal: pilha).
3. **Re-prompt no mesmo nó**: após apply + HMR, o tap re-emite `lp-select` do nó com carimbo
   fresco (line/col novos) → o pin nunca fica stale → iteração "agora mais escuro" funciona.
4. **Modelo local do perfil**: ler o moo default de `~/.mooter/preferences.json` (fallback
   qwen3:30b; se Ollama offline → mensagem honesta + oferta de cloud).
5. **Transparência de árvore (mitigação A7)**: o cabeçalho do diff mostra o caminho ABSOLUTO
   do ficheiro que vai ser escrito. (Fix estrutural do A7 — identidade da árvore servida — vem
   da auditoria total; não bloqueia a LP-4.)
6. **"Tempo real" honesto**: v1 = aplicar→HMR (1-2s) + undo 1-clique. Before/after RENDERIZADO
   (leapfrog) é LP-7, não se promete nesta wave.

## LP-4.5 · Tarefas Ancoradas — o pin fala com o PROJECTO (dor viva do Paulo, 2026-07-06 11:0x)

> **O caso que expôs o limite:** Paulo pinou `<CommunityPulse>` (números 61/$0.00/2 vêm de
> dados DENTRO do componente) e pediu (a) "valida se estes números estão coerentes com o
> projecto" e (b) "põe números reais em função do projecto". A LP-4 reescreveu o nó de uso
> na page.tsx:148 → nada mudou no ecrã → e disse "✓ escrito" (bug de honestidade). A LP-4 é
> uma reescritora de NÓ; o Paulo pediu uma TAREFA DE PROJECTO ancorada no pin.

**Três vias no painel (roteadas por intenção, moo local $0 classifica):**
1. **Determinístico $0** — texto/classe/apagar (existe).
2. **Reescrita cercada** — nó-only, byte-bounded, local $0/cloud (LP-4, existe).
3. **Tarefa de projecto (NOVO)** — pergunta OU edição que exige contexto: spawna headless CC
   via ponte SDK (workspace trusted) com âncora {file:line + nodeSource + breadcrumb +
   instrução}; o agente LÊ o repo (Read/Grep/Glob permitidos), responde no painel (perguntas
   → resposta markdown com fontes, ZERO escrita) ou edita NO SÍTIO CERTO (Edit permitido;
   Bash/rede NEGADOS); no fim o painel mostra o git diff dos ficheiros tocados + "manter /
   reverter tudo". Subscription default (tool-use de qualidade); moo local para classificar
   e para perguntas simples.

**Honestidade nova obrigatória:** quando o nó pinado é um componente cujo conteúdo vem de
props/dados, avisar ANTES de reescrever: "os números vêm de dentro do componente — reescrever
este nó não os muda; queres uma tarefa de projecto?" (mata o "✓ escrito" mentiroso).

**v2 (advogado do diabo, 2026-07-06):** (1) SEM classificador-porteiro — uma caixa, default =
agente SDK que decide responder vs editar (paridade Lovable "qualquer prompt resolve"); o $0
cercado é CHIP explícito "local $0 · só este nó", nunca adivinha. (2) Edits feed UNIFICADO:
todas as vias (determinística/cercada/agente) numa lista "mudanças desta sessão" com reverter
por item (git-backed). (3) Device toggle no preview (mobile/tablet/desktop widths) — paridade
Lovable barata e fosso embedded. (4) ZERO botões placeholder — 🛡 e 🚀 só chegam reais (LP-5/
LP-6), com a UI dos prints Lovable do Paulo: popover Published (URL · custom domain ·
visibilidade · Review security · Update) e painel Security (Detected Issues por nível ·
Try-to-fix por finding via o MESMO runner de agente · Project dependencies review).

## LP-5 · 🛡 Review Security — desenho (brief; masterprompt quando a LP-4 aterrar)

- **Pipeline local $0** (sem cloud, sem envio de código): (a) secret-scan (regex curada:
  chaves AWS/GitHub/Stripe/私keys/.env leakado no client); (b) `npm audit --json` resumido
  honesto (sem alarmismo: dev-only vs prod); (c) headers/CSP do next.config (X-Frame-Options,
  CSP, HSTS); (d) XSS estático (dangerouslySetInnerHTML, href javascript:, eval); (e) ficheiros
  sensíveis expostos em /public. Reusa o padrão do auditor estático P5 ([[project_mooter_security_audit]]).
- **Moo local explica**: cada finding passa pelo moo $0 → explicação PT-BR/PT-PT de founder,
  não jargão ("esta chave da Stripe está visível a qualquer visitante — mover para .env").
- **Fix 1-clique cercado**: quando o fix é determinístico (remover atributo, mover const),
  gera diff pelo MESMO motor LP-4 (cerca + hash-guard + confirmação). Nunca auto-aplica.
- **Honest-copy**: "review local — não substitui auditoria humana; cobre X, não cobre Y".
  P0 abertos ⇒ botão publish desactivado com motivo visível.

## LP-6 · 🚀 Publish — desenho (brief)

- Pré-condição dura: review security verde na sessão actual (ou override explícito com aviso).
- Fluxo: commit SELECTIVO só dos ficheiros editados no Live Edit (lista visível, nunca add -A)
  → push branch → deploy Vercel preview → URL clicável no painel → botão "promote to production"
  com confirmação two-factor (escrever o nome do projecto, estilo GitHub).
- Nada de credenciais novas: usa vercel CLI/token já configurado na máquina; se ausente,
  onboarding honesto.
- Telemetria honesta: custo do ciclo inteiro (edits $0 + review $0 + publish) visível — o
  contraste com o credit-burn dos concorrentes É o marketing.

## Porquê 3 waves (advogado do diabo contra "tudo já")
- Mega-wave = o erro que matou o MP3 (trabalho não-atómico perdido). 3 waves = 3 gates, 3 provas vivas.
- LP-5 sem LP-4 não tem motor de fix; LP-6 sem LP-5 publica inseguro — a ordem é dependência real.
- A auditoria total (`LIVE_PREVIEW_TOTAL_AUDIT_WAVE.md`) corre em PARALELO (read-only) e alimenta
  o fix do A7 antes do publish tocar produção.
