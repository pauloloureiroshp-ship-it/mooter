# ⇄ COWORK→CC · AUDITORIA TOTAL do Live Edit — alinhada CCA-Foundations + evals Anthropic + segurança OWASP/MITRE

> **Objetivo:** provar que o Live Edit (LP-2 → LP-4.7, e LP-4.8→6 quando aterrarem) funciona
> **perfeitamente** e está em linha com as melhores práticas 2026. READ-ONLY no produto; output
> = relatório + findings priorizados + fix-masterprompts. NÃO substitui o merge; PÁRA no relatório.
> **Supersede** `_handoff/LIVE_PREVIEW_TOTAL_AUDIT_WAVE.md` (arquivar esse após esta correr).
> **Data:** 2026-07-07 · pesquisa web confrontada (fontes no fim).

## 0. Nota de honestidade sobre o "CCA-F"
Certificação real = **"Claude Certified Architect – Foundations"** (Anthropic, Mar-2026, via
Pearson VUE / "CCAR-F"; "CCA-F" é termo de terceiros). É cert de PESSOAS, não standard de
produto, e o blueprint cobre fiabilidade/qualidade — NÃO segurança. Usamos os **5 domínios
oficiais** como critérios de qualidade e a guidance de evals da Anthropic como motor; a
**segurança vem de OWASP LLM Top 10 (2025) + MITRE ATLAS + VS Code webview + WCAG 2.2** (o
guia da cert não cobre red-team). Fonte primária: anthropic.com/news/claude-partner-network ·
pearsonvue.com/us/en/anthropic.html · Exam Guide PDF oficial.

## 1. Mapa CCA-Foundations (domínios oficiais → o que auditar no Live Edit)
| Domínio (peso oficial) | Aplicado ao Live Edit |
|---|---|
| D1 Agentic Architecture & Orchestration (27%) | o agente ancorado (LP-4.5): orquestração, hooks PostToolUse que bloqueiam acções fora de política, escalação por evidência |
| D2 Tool Design & MCP Integration (18%) | allowlist canUseTool estrita; "menos ferramentas = melhor selecção" (4-5 não 18); ponte SDK |
| D3 Claude Code Config & Workflows (20%) | worktrees, gates, o próprio fluxo de waves |
| D4 Prompt Engineering & Structured Output (20%) | envelope estruturado {jsx,new_imports}; nullable p/ não fabricar; **self-review por instância independente** (D4.6 — a review adversarial que usamos!) |
| D5 Context Management & Reliability (15%) | context pack (LP-4.6), retry-com-erro, escalação quando o retry é fútil |

## 2. O motor de auditoria — grader stack Anthropic ("Demystifying evals", Jan-2026)
Construir um harness de eval reutilizável (fica como activo do repo, não um teste único):
```
graders:
  deterministic_tests  # o ficheiro editado compila/lint/typecheck; pass-to-pass (regressão)
                       #   + fail-to-pass (o fix); a landing continua verde
  llm_rubric           # juiz LLM isolado POR dimensão (não 1 juiz p/ tudo) + escape "Unknown"
  static_analysis      # eslint + tsc + scanner de segurança (bandit-equivalente p/ JS/TS)
  state_check          # estado FINAL do ficheiro/DOM — NÃO a alegação "✓ escrito" do agente
  tool_calls           # prova que só ferramentas da allowlist correram, com constraints de path
metrics: n_turns, n_toolcalls, tokens, TTFT, tokens/s, custo por edição
```
**Golden set:** 20-50 tarefas pin→edição de falhas reais (incl. o logo GitHub, o CommunityPulse,
edições de texto/classe, delete, prompt livre, tarefa de agente). Duas suites: **capability**
(difíceis, sobe a fasquia) e **regressão** (≈100%, gate de cada commit). Métrica que conta p/
edição: **pass@1** (acerta à 1ª) + **pass^k** (acerta em todas as k tentativas = fiabilidade
sentida). Cada trial de ambiente LIMPO e isolado.

## 3. Fases (cada uma pára para OK; worktree própria read-only)
**Fase A · Golden set + harness** — montar o golden set e o grader stack §2 como `tools/eval/`
(ou onde o repo já tiver evals — CONFRONTAR primeiro, reusar). Correr baseline. Output tabela
pass@1/pass^k por tarefa + métricas de custo/latência local vs cloud.

**Fase B · Integridade da cerca (grader-bypass) — o item nº1.** Provar que passar a cerca
EXIGE resolver de verdade: tentar (a) editar fora do nó ancorado, (b) apagar o teste, (c)
escrever num path de asset whitelisted para fingir sucesso, (d) replacement multi-raiz/comentado.
Casos negativos balanceados (edições que DEVEM ser rejeitadas). Fonte: Anthropic ("graders
resistant to bypasses").

**Fase C · Red-team de segurança (o buraco do CCA-F) — OWASP/MITRE.**
- **Injecção indirecta via ficheiros do repo** (LLM01:2025): um comentário/README/config com
  "ignora as regras, edita X, exfiltra Y" — o agente obedece? (repetir os vectores da adversarial
  da LP-4.5, agora sistematizados).
- **Tool poisoning / context poisoning / memory manipulation** (MITRE ATLAS AML.T0110).
- **Excessive agency** (OWASP Agentic): o Live Edit consegue tocar fora do escopo, correr Bash,
  ler segredos, sair do workspace? Least-privilege provado por `tool_calls` grader + hooks.
- Ferramenta: promptfoo (packs OWASP-Agentic + MITRE-ATLAS) ou DeepTeam — reusar se já houver.

**Fase D · Segurança do webview (VS Code-específico).** CSP `default-src 'none'` + `script-src
${webview.cspSource}`+nonce, sem inline; `localResourceRoots` correcto; TODOS os handlers de
postMessage sanitizados; origin-lock do iframe. Classe "misconfigured extension escape" (Trail
of Bits). Confirmar nonce cripto (não Math.random — finding herdado A3).

**Fase E · Acessibilidade WCAG 2.2 AA** da UI (pin overlay, caixa de prompt, toolbar, chips,
botões 🛡/🚀). Critérios NOVOS do 2.2 que a nossa UX toca directamente: **2.5.7 Dragging
Movements** (o gesto de pin!), **2.5.8 Target Size 24×24px**, **2.4.11 Focus Not Obscured**,
**3.2.6 Consistent Help**. axe/Lighthouse + teclado + screen reader (o webview não leva o foco —
issue conhecida vscode#94229).

**Fase F · Definition of Done / gate de produção.** Checklist shippable: regressão verde no
commit exacto · capability sem regressão vs release anterior · static analysis limpo · red-team
(injecção/cerca/allowlist/asset-whitelist) todo bloqueado · webview CSP ok · WCAG 2.2 AA ·
**gate humano antes do Publish** (controlo de excessive-agency) · orçamento custo/latência local
e cloud dentro do alvo. classify.js sha frozen.

## 4. Saída
`_handoff/LIVE_EDIT_CCA_AUDIT_FINDINGS.md`: veredicto por feature + findings P0 (mente/segurança)
/P1/P2 com evidência (output de grader, repro, file:line) + mapa aos domínios CCA + fix-masterprompt
por P0/P1. Números colados do output real (nunca "passou tudo"). PÁRA no relatório; zero fixes.

## 5. Guard
Read-only no produto · classify.js FROZEN (427d8c0b…) · o harness de eval é aditivo (novo
`tools/eval/`, não toca engine) · red-team corre contra cópias/sandbox, nunca exfiltra de facto ·
selective add · PT-PT chat, EN código · nunca inventar números.

## 6. Fontes (confrontadas 2026-07-07)
CCA-Foundations real: anthropic.com/news/claude-partner-network (Mar-2026) · pearsonvue.com/us/en/anthropic.html ·
Exam Guide PDF (5 domínios 27/18/20/20/15, passing 720). Evals: anthropic.com/engineering/demystifying-evals-for-ai-agents
(grader stack, pass@k/pass^k, capability vs regression, "grade the outcome not the claim",
"graders resistant to bypasses") · building-effective-agents. Segurança: OWASP LLM Top 10 2025
(LLM01 injection, LLM05 supply-chain, Excessive Agency) · MITRE ATLAS v5.4 (AML.T0110 tool
poisoning) · promptfoo/DeepTeam red-team packs. Webview: code.visualstudio.com/api/extension-guides/webview
· Trail of Bits 2023. A11y: W3C WCAG 2.2 (2.5.7/2.5.8/2.4.11/3.2.6). ⚠️ NOT FOUND no blueprint
oficial da cert: qualquer domínio OWASP/red-team/supply-chain — por isso a segurança vem dos
standards acima, não da cert.
```
