# SUPER WAVE · LP-4.8 (UX+Skills) → LP-5 (🛡 Security) → LP-6 (🚀 Publish)

> As features VISÍVEIS que faltam: toolbar in-canvas + /skills · botão Review Security ·
> botão Publish. Paridade com os prints Lovable do Paulo (2026-07-06). Comboio sequencial,
> gate humano entre cada. Base de cada wave = origin/main ACTUAL (tem LP-4.7 quality engine).
> Estudos-fonte: LIVE_EDIT_LP4_LP6_VISION.md · LIVE_EDIT_LP47_MOO_QUALITY_UX_STUDY.md.

## Routing de modelo (com os $50 de crédito · 2026-07-07)
- **Sonnet** = o cavalo de trabalho do código volumoso das 3 waves (barato, bom o suficiente,
  os $50 dão folga).
- **Opus** = arquitectura das peças difíceis (toolbar in-canvas, gate do publish) + as
  **reviews adversariais** (onde a qualidade paga o custo — foi a adversarial que salvou
  todas as waves de hoje).
- **Fable 5 (@fable)** = SÓ se a quota de plano estiver disponível (verificar; os $50 de
  crédito NÃO repõem a quota Fable, que reseta por período). Se disponível, reservar para
  UM momento de alto valor por wave (ex: o desenho da UX in-canvas), não para o grosso —
  é caro e opt-in. NUNCA auto-routed.
- ❌ Não construir estas waves em Haiku (degrada UI/segurança — foi a frustração que trouxe
  o Paulo aqui).

## Regras do comboio (inegociáveis)
- Cada wave: worktree própria nova off origin/main (git fetch primeiro) · commits atómicos ·
  gate executável + review adversarial FOCADA (com repro) · push SÓ da branch · PÁRA para OK
  do Paulo. Wave N+1 só arranca depois do merge da Wave N em main.
- classify.js FROZEN (sha 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f).
- Vias/cercas/allowlists/quality-engine existentes INTACTAS. Zero deps novas sem allowlist
  .vscodeignore + live-edit-packaging.test.js. Selective add · PT-PT chat, EN código.
- Acções irreversíveis (deploy/publish real) NUNCA sem confirmação two-factor do humano; o
  gate PROVA o fluxo mas não publica em produção sem o Paulo escrever o nome do projecto.

════════ WAVE A · LP-4.8 · UX IN-CANVAS + SKILLS NO PIN ════════
Worktree wave/lp-4-8-ux-skills ../frugal-lp48 off origin/main.
DO (commit por peça):
1. Toolbar in-canvas flutuante ancorada ao pin (shadow DOM do tap, pointer-events só na
   toolbar, reposiciona no scroll/resize): [caixa prompt] [chips modelo local$0/Haiku/Sonnet/
   Opus/@fable] [presets determinísticos: cor·tamanho·spacing 1-clique] [dropdown /skills]
   [🗑] [↩]. O painel direito passa a mostrar SÓ diff/feed/resposta. A toolbar reusa o motor
   existente (não duplica lógica de edição). → COMMIT.
2. Presets determinísticos $0 (playbook Lovable): swatches de cor Tailwind, escala de tamanho
   (text-sm..text-4xl), spacing (p/m steps) → aplicam via editClass existente, SEM LLM,
   instantâneo. → COMMIT.
3. /skills element-scoped v1 com routing por skill (chip mostra o tier): /icon (usa a
   whitelist de assets da LP-4.7, tier local $0) · /copy (reescreve texto, moo pequeno) ·
   /restyle (determinístico→moo) · /a11y (corre checklist axe-like no nó + fix cercado) ·
   /section (tarefa de agente ancorada). Cada skill = template + few-shot + tier floor em
   .mooter/skills/*.md (vendored, commit). → COMMIT.
4. Multi-select Cmd/Ctrl: vários pins viram referências anexadas ao prompt do agente
   (padrão Lovable attach-as-reference); overlay mostra todos os seleccionados. → COMMIT.
5. Teclado/a11y: Esc fecha a toolbar sem roubar atalhos do VS Code; foco visível; ARIA nos
   controlos; toolbar navegável por Tab. → COMMIT.
ADVERSARIAL FOCADA: L1 a toolbar (no iframe do site) é injectável por CSS/JS do próprio site?
L2 os /skills furam o routing/cerca da sua via (ex: /icon a escrever fora do nó)?
GATE (dev server ~/frugal/landing:7819): pin → toolbar aparece no elemento · preset de cor
1-clique muda $0 · /icon insere logo GitHub local $0 · /a11y reporta e corrige · multi-select
2 nós · Esc/Tab ok · testes verdes · sha · push só da branch · PÁRA p/ OK.

════════ WAVE B · LP-5 · 🛡 REVIEW SECURITY ════════
(Só após merge da Wave A.) Worktree wave/lp-5-security ../frugal-lp5 off origin/main.
Paridade com o print Lovable (painel Security: Detected Issues por nível · Try-to-fix ·
dependencies review). DO (commit por peça):
1. Botão 🛡 "Review Security" no toolbar do Live Preview → abre painel de segurança. → COMMIT.
2. Pipeline LOCAL $0 (zero cloud, zero envio de código, allowlist intacta — só lê o workspace):
   (a) secret-scan (regex curada: AWS/GitHub/Stripe/private keys/.env no client-bundle);
   (b) `npm audit --json` resumido honesto (dev-only vs prod, sem alarmismo); (c) headers/CSP
   do next.config; (d) XSS estático (dangerouslySetInnerHTML, href javascript:, eval);
   (e) ficheiros sensíveis em /public. Reusa o auditor estático P5 se existir. → COMMIT.
3. Findings por nível (Critical/Warning/Info) numa lista; cada um expande com explicação do
   moo local em PT (honest, não jargão). → COMMIT.
4. "Try to fix" por finding: quando determinístico, gera diff pelo motor cercado da LP-4/4.7
   (cerca + hash-guard + diff + confirmação); NUNCA auto-aplica. Dependencies: lista as
   vulneráveis com a versão-alvo, sem executar npm install (sugere o comando). → COMMIT.
5. Honest-copy: "review local — cobre X, não substitui auditoria humana"; findings Critical
   marcam o estado para o gate do Publish (LP-6). → COMMIT.
ADVERSARIAL FOCADA: L1 o scan pode vazar segredos para fora (log/rede)? L2 um "fix" pode
escrever fora do nó/ficheiro alvo?
GATE: 🛡 lista findings reais da landing · explica em PT · "try to fix" gera diff cercado
(não auto-aplica) · Critical bloqueia o publish (flag) · testes · sha · push · PÁRA p/ OK.

════════ WAVE C · LP-6 · 🚀 PUBLISH ════════
(Só após merge da Wave B.) Worktree wave/lp-6-publish ../frugal-lp6 off origin/main.
Paridade com o popover Published do Lovable (URL · custom domain · visibilidade · Review
security · Update). DO (commit por peça):
1. Botão 🚀 "Publish" no toolbar → popover: estado (Published/Draft) · Website URL ·
   visibilidade · botão Review Security (liga à LP-5) · botão Update. → COMMIT.
2. Pré-condição DURA: só habilita Update se o Review Security (LP-5) não tem Critical aberto
   na sessão (ou override explícito com aviso vermelho). → COMMIT.
3. Fluxo de publish (DECISÃO Paulo 2026-07-07: DIRECT-TO-PRODUCTION, paridade Lovable — o
   "preview" já é o Live Preview local, sem URL intermédio): commit SELECTIVO só dos
   ficheiros editados no Live Edit (lista visível, NUNCA git add -A) → push da branch →
   deploy Vercel PRODUCTION via vercel CLI/token já na máquina (se ausente: onboarding
   honesto, não inventa credencial) → URL de produção clicável no popover. → COMMIT.
4. TWO-FACTOR OBRIGATÓRIO antes do deploy de produção (NÃO-NEGOCIÁVEL, é acção irreversível):
   o utilizador escreve o nome do projecto (estilo GitHub delete) antes de o Update disparar.
   O botão Update NUNCA publica sem esta confirmação, mesmo em direct-to-prod. → COMMIT.
5. Telemetria honesta: custo do ciclo (edits $0 + review $0 + deploy) visível — o contraste
   com o credit-burn dos concorrentes. → COMMIT.
ADVERSARIAL FOCADA: L1 o commit selectivo pode arrastar ficheiros não-intencionados (git add
scope)? L2 o promote-to-production pode disparar sem a confirmação two-factor?
GATE: 🚀 popover mostra estado+URL · Update bloqueado com Critical aberto · deploy PREVIEW
funciona (ou onboarding honesto se sem token) · promote exige nome do projecto · commit é
selectivo (git diff prova) · testes · sha · push · PÁRA p/ OK FINAL.

FIM: resumo consolidado (3 merges) + bump único de versão do vsix + guia de instalação.
NÃO /mooter-update (nada em tools/router/).
