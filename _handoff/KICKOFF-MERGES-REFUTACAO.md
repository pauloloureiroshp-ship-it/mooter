# KICKOFF — Merges delegados + refutação codex + relançamento · 25/08 22:1xZ
És o Claude Code executor no mac. DELEGAÇÃO ESCRITA do dono (25/08, sessão Cowork): "resolver tudo em ordem de prioridade que você consegue montar" — sobre a recomendação registada: merge #397 #398 #399 #401; #400 e #402 SEGURAM até refutação. MUTEX: aborta se cc-sistema.log ou cc-construir.log não tiverem "=== fim" (têm).

P1 · MERGES (nesta ordem): para cada um de #397, #398, #399, #401 — verifica CI; se verde, merge; se vermelho, NÃO forces, regista e segue. Depois #396: se o rate-limit do Vercel tiver passado e tudo verde, merge; senão regista "ainda rate-limited". #400 e #402: NÃO mergir (aguardam refutação e palavra do dono).

P2 · PÓS-MERGE: pull main, corre a suite completa, confirma classify.js 427d8c0b intacto, e regista os totais.

P3 · REFUTAÇÃO CODEX (codex está logado — "Logged in using ChatGPT", auth.json presente desde 21:22Z; se der 401, regista e usa Ollama declarado): manda o codex (read-only, ordem: REFUTAR) contra os dois desenhos em ~/paulo-vault/_handoff/ (design do instrumento v2 e design-m2-convergidor, os que ficaram 🔴 no teu fecho anterior). Appenda cada refutação ao próprio ficheiro com veredicto: objeções que sobrevivem vs mortas.

P4 · RELANÇAMENTO DO LOOP (autorizado pela mesma delegação — agora HÁ código novo em main pós-merge, o upside que faltava): reinicia o runner (equivalente ao 1-LANCAR: launch.mjs --no-open com MOO_PUBLICAR_BEACON=1) e valida :4290 vivo + beacon fresco assinado + painel com os fixes do #401 (repaint + card da frota). NOTA: PILLAR_IDS=[] continua — NÃO religues pilares (é decisão do WS1 pós-refutação).

P5 · ADR M1: lê ~/paulo-vault/20-decisions/2026-08-25-adr-m1-hook-para-proxy.md, identifica a contradição cabeçalho-vs-assinatura que reportaste, e APPENDA uma nota de errata (nunca reescrever o texto assinado) citando a delegação de 25/08.

FECHO: journal append no vault + Delta no pitch-registro (números dos merges: PRs mergidos, testes, o que o painel novo mostra) + SYNC atualizado ≤220 + progress em _handoff/cc-merges-progress.md. Guardrails: classify.js FROZEN · nada entra no repo público além do que já está nos PRs (decisão IP pendente) · número não medido = n/d.
