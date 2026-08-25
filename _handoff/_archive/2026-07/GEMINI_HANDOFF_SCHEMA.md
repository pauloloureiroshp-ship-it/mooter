# ⇄ COWORK → GEMINI · SCHEMA-FIRST HANDOFF — o sync perfeito da família (self-contained, read-only)

> Cowork · 2026-07-18 · Budget ≤6k · Tipo: MASTERPROMPT · Consumidor: Gemini (crítico externo · modelo
> Google, conhece A2A nativamente — este é o teu fit ideal). SELF-CONTAINED: tudo aqui + a tua web.
> Objetivo: desenhar o contrato SCHEMA-FIRST que faz CC/Codex/Gemini/Cowork nunca comunicarem mal.

## 0. O insight (validado contra a indústria, web 2026)
"Muitos agentes, um contrato, nunca comunicar mal" foi resolvido pela indústria e a resposta é
SCHEMA, não prosa. A2A (agent-to-agent, Google), JSON Schema, MCP: o sync acontece no DADO
ESTRUTURADO validado por máquina, não em texto livre (texto livre = ambiguidade/drift/alucinação).
O handoff do Mooter já tem o instinto (`handoff_schema: 1` no front-matter) mas o CORPO são 20 seções
de prosa — onde o drift vive. A tese: o contrato é o schema (front-matter/campos tipados, validado
pelo lint); a prosa é uma VISTA humana derivada, livre em voz mas consistente com o schema.

⚠️ LIMITE DURO (não proponhas over-engineering): a nossa realidade é copy-paste entre painéis do VS
Code, NÃO uma rede enterprise. Extrai o PRINCÍPIO schema-first da A2A; REJEITA a máquina pesada
(HTTP/JSON-RPC servers, Agent Cards em /.well-known/, transporte). O Codex já avaliou a A2A e concluiu
"não adotar como dependência" — confirma ou refuta isso, mas o default é: princípio sim, infra não.

## 1. O FORMATO ATUAL (o alvo — embutido, não precisas do repo)
Front-matter YAML (o embrião do schema): `handoff_schema · task_id · type · id · from · to · status ·
state · owner · created_at · updated_at · worktree · branch · base · head · sha · uncommitted · tests ·
decisions_pending · ledger_ref · supersedes`.
Corpo em prosa (20 seções): TL;DR · 🎯 A ÚNICA COISA · INTENT · STATE · WORKTREE · UNPUSHED · TIME ·
DELTA · GATE · WORK · NÃO FEITO · DECISIONS · PENDING · RED ALERT · RISK · GUARDS · NEXT · RESUME ·
~narrativa · conf · Evidence · HUMAN GATE · BACK. Rodapés: `CCA: n/5` · `🔍 council 8/8`.
4 tipos de mensagem: MASTERPROMPT (brain→exec) · HANDOFF (exec→brain) · DECISION CONTRACT (brain→exec)
· BRIEF (exec→ledger). Cowork emite os 2 do brain; executores emitem HANDOFF+BRIEF.

## 2. O TEU ESTUDO (schema-first, com fonte para cada afirmação externa)
S1. **A2A / JSON Schema / structured output — o que ADOTAR:** dos padrões que conheces (és Google,
    conheces a A2A), qual o núcleo mínimo que dá o "zero-ambiguity parsing" SEM infra pesada? (ex.:
    Task/Message/Artifact da A2A — o que mapeia para o nosso handoff, o que descartamos?)
S2. **O schema mínimo do HANDOFF:** propõe o JSON Schema (ou equivalente) dos campos MACHINE-READABLE
    que, validados, garantem que qualquer executor produz um contrato parseável idêntico. Tipos exatos
    (enum para status/state; formato para ts; nullable vs required). Isto é o que o lint valida.
S3. **A fronteira schema vs prosa:** que campos DEVEM ser estruturados (o contrato) e quais podem ficar
    prosa livre (a vista humana)? Regra: se dois agentes podem divergir num campo, ele tem de ser
    schema. Se é narrativa que não muda uma decisão, é prosa livre.
S4. **Derivação, não duplicação:** como garantir que a prosa é CONSISTENTE com o schema (ex.: o campo
    prosa "RED ALERT" não pode dizer 0 uncommitted se o schema diz 3)? Propõe a regra de consistência
    que o lint verifica.
S5. **Versionamento:** `handoff_schema: 1` — como evoluir o schema sem quebrar agentes antigos? (a
    lição A2A de versioned discovery, aplicada leve.)
S6. **Token-efficiency:** o schema-first é MAIS ou MENOS token-efficient que a prosa atual? Prova com
    uma estimativa (campos estruturados vs 20 seções de prosa). O Paulo exige eficiência.

## 3. ENTREGÁVEL
HANDOFF no formato atual (dogfood) contendo: S1–S6 + a **proposta concreta de schema mínimo-completo**
(o JSON Schema dos campos do contrato) + a regra schema-vs-prosa + NÃO FEITO + rodapés CCA/council.
Web permitido e esperado (A2A spec, JSON Schema, structured output) — cita fonte por afirmação externa.

## Guards
Read-only · self-contained · NUNCA fabricar (nem campos de A2A que não existem, nem "a spec diz X" sem
link — foi o teu erro antes: verifica antes de citar) · rejeita over-engineering (princípio, não infra) ·
a tua proposta é RECOMENDAÇÃO para o Cowork confrontar contra o padrão-ouro do Codex, não decisão ·
budget ≤6k. Impressiona com um schema que elimina ambiguidade E poupa tokens, não com volume.
