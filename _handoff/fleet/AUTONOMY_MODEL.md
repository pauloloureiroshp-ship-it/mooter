# Mooter Auto-Build — modelo de autonomia (Human-ON-the-loop)

O Paulo nao quer aprovar cada passo/task/wave. Quer VER e poder intervir, com o loop a avancar nas MINHAS recomendacoes. Estado-da-arte 2026: passagem de human-IN-the-loop (aprova cada acao) para human-ON-the-loop (agente autonomo; humano supervisiona a governanca e intervem so no necessario). Guardrails "two-factor" SO no destrutivo/irreversivel.

## Bandas de autonomia (a regra que mata os gates)
AUTO — avanca na minha recomendacao, SEM perguntar (era aqui que estavam os 100 questionamentos):
  decisoes por ronda e por wave; estrategicas mas REVERSIVEIS (escolher objetivo, reverter o que nao melhora, escolher a proxima wave, refactors, ficheiros novos, correr evals, commits LOCAIS, criar branches, dynamic-workflow, agentes moo locais). O avaliador decide pela rubrica+politica e segue.
DIGEST — NAO bloqueia o loop; fica numa lista que tu ves quando voltas (loop continua noutras waves entretanto):
  push para remoto / abrir-mergear PR / deploy / secrets / apagar dados ou pacotes / gastar dinheiro / descongelar classify.js (auto-NO) / pivot de produto / mudar lambdas/holdout.
O loop NUNCA pára à espera de aprovacao para o reversivel. So o destrutivo espera — e mesmo esse vai para `_handoff/loop/DECISIONS.md` (+ notificacao) enquanto o loop segue a melhorar o resto.

## A organizacao continua (sempre a falar)
- Cowork (eu) = GOVERNADOR/avaliador: cada ~10 min leio o bus, decido o reversivel pela rubrica, alimento Notion+vault, e ponho so o destrutivo no digest.
- CC = GERADOR: corre non-stop (servico), nunca pergunta o reversivel; flag (nao bloqueia) o destrutivo.
- Fleet F1 (WF) = pilares com worktree por pilar (worktree-conductor, zero colisao), dynamic-workflow (parallel/vote/converge), agentes moo locais (Ollama), contexto fresco (vault/SYNC/memory). Pilares falam via o orquestrador + meta-avaliador cross-pillar.

## Como o Paulo supervisiona (sem aprovar passos)
Ve o board ao vivo (`fleet-watch.ps1`) + o Notion log + os PRs que aparecem. Ajusta GOVERNANCA (a STANDING_POLICY), nao passos. Two-factor so no merge para main: a minha recomendacao + o teu OK final.

Fontes: human-on-the-loop (waxell.ai, n8n.io, bytebridge); self-improving SWE agents 2026 (c3.ai, cogentinfo); AI Safety Report 2026 (arXiv 2602.21012) — guardrails ao nivel de governanca, two-factor no irreversivel.
