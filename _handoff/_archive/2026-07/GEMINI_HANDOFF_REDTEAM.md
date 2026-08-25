# ⇄ COWORK → GEMINI · RED-TEAM do formato de handoff da família (self-contained, read-only)

> Cowork · 2026-07-18 · Budget ≤6k · Tipo: MASTERPROMPT · Consumidor: Gemini (crítico externo).
> SELF-CONTAINED: todo o material que precisas está NESTE documento — não precisas de ler o repo (o teu
> acesso a ficheiros é parcial; por isso a tarefa é raciocínio sobre o que está aqui + web, o teu forte).
> Objetivo: encontrar onde o formato AINDA pode falhar antes de virar canon mecânico. Ataca, não elogies.

## 0. Contexto (o que é e por que importa)
A família Mooter = Cowork (brain) · CC + Codex (executores) · tu (Gemini, crítico externo) · Paulo (gate
humano). Todos trocam mensagens tipadas. O tipo HANDOFF (executor → brain) precisa ser IDÊNTICO entre CC
e Codex para nunca haver falha de comunicação nem erro de copy-paste. Realidade observada: o Codex produz
o formato-ouro; o CC deriva para prosa; o Cowork emite DECISION CONTRACT (não HANDOFF). O objetivo é um
formato mínimo-completo, sem ambiguidade, token-efficient, que qualquer executor emite igual.

## 1. O FORMATO ATUAL (o alvo do teu ataque — embutido para não precisares do repo)
**Front-matter YAML (21 campos):** handoff_schema · task_id · type · id · from · to · status · state ·
owner · created_at · updated_at · worktree · branch · base · head · sha · uncommitted · tests ·
decisions_pending · ledger_ref · supersedes.
**Corpo (20 seções, na ordem):** TL;DR · 🎯 A ÚNICA COISA · INTENT · STATE · WORKTREE (ahead/behind vs
main E vs remote) · UNPUSHED · TIME (último checkpoint · à-espera-há) · DELTA (o que mudou desde que
olhaste) · GATE (mecânico: testes pass/total · sha · node--check) · WORK (git diff --stat · commits) ·
NÃO FEITO (lista explícita) · DECISIONS (do ledger: Q→escolha→porquê) · PENDING (só se awaiting-you:
pergunta INTEIRA + TODAS opções) · RED ALERT (uncommitted com paths) · RISK (lista numerada) · GUARDS ·
NEXT · RESUME (resposta copy-paste-pronta) · ~narrativa (qwen, opcional, nunca load-bearing) · conf:
(marcadores por-campo git✓/gate✓/~/n-d) · Evidence (comandos/fontes) · HUMAN GATE · BACK.
**Rodapés:** `CCA: <n>/5` (só domínios evidenciados; n/d nunca 5/5 fabricado) · `🔍 council 8/8 ·
objeção mais forte: <X> · resolvida: <como>`.
**Regras de verdade:** n/d nunca palpite · uncommitted=RED ALERT · confront-before-emit · referência
path:linha nunca dump (exceção: consumidor sem mount → inclui diff) · council que só aprova = não rodou ·
budget HANDOFF ≤4k tokens.

## 2. O TEU RED-TEAM (responde a cada um com precisão)
R1. **Ambiguidade:** que campos podem ser preenchidos de forma DIFERENTE por dois executores honestos?
    (ex.: "uncommitted" conta untracked? "ahead" vs main ou vs remote? "status" vs "state" — qual a
    fronteira exata?) Lista cada ambiguidade + a definição precisa que a elimina.
R2. **Falha de copy-paste:** onde é que o consumidor (brain ou humano) pode colar/agir errado por causa
    de um campo mal delimitado, ordem trocada, ou secção que parece decisão mas é histórico?
R3. **Buraco (o que falta):** que informação, se ausente, faria alguém pedir um esclarecimento (= falha
    de "agir só com o texto")? Que campo o formato NÃO tem e devia ter?
R4. **Inchaço / token-waste:** 21 campos + 20 seções — quais são LOAD-BEARING (a remoção quebra) e quais
    são redundantes/fundíveis? Propõe a versão MÍNIMA-COMPLETA (o menor formato que não perde nada).
    Justifica cada corte. (Isto é chave: o Paulo exige token-efficiency.)
R5. **Divergência de papel:** o Cowork emite DECISION CONTRACT e MASTERPROMPT, não HANDOFF. Faz sentido?
    Ou devia haver um campo comum a TODOS os 4 tipos para o preflight validar uniformemente?
R6. **Enforcement:** que parte deste formato um validador mecânico (lint) NÃO consegue verificar, e
    portanto depende de disciplina humana? (Onde o gate automático tem um cego.)

## 3. O ENTREGÁVEL
HANDOFF no formato acima (dogfood: usa o próprio formato que estás a criticar). Conteúdo: as respostas
R1–R6 + a **proposta de formato mínimo-completo endurecido** (a tua recomendação concreta) + NÃO FEITO +
rodapés CCA/council. Web search permitido (padrões de handoff/API contracts/structured logging que
possam inspirar). Cada afirmação factual sobre padrões externos = cita a fonte.

## Guards
Read-only · self-contained (não precisas do repo; se referires algo que não está aqui, di-lo n/d) ·
nunca fabricar (nem paths nem "padrões de mercado" sem fonte) · budget ≤6k · a tua proposta é RECOMENDAÇÃO
para o Cowork verificar, não decisão. Impressiona com precisão que endurece o protocolo, não com volume.
