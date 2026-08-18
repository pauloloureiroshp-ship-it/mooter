# ⇄ COWORK→CC · MASTERPROMPT · GPU-POR-PILAR — réplica Windows RTX 4090 · 2026-08-15

**GOAL** Pôr a 4090 no regime novo: inversão de residentes (pequeno residente, 30B sob demanda), golden set do P2 semeado, e 1 ronda P2 piloto medida. Estratégia-mãe: vault `40-strategy/mooter-gpu-pilares-2026-08-15.md`.

**WHERE** PC Windows, clone canônico do Mooter. PowerShell nativo (git irreversível NUNCA pelo mount — MEMORY 2026-07-03).

**DO**
- **D0 · RECON:** `git fetch` + estado (branches runner? untracked — última medição 249? stashes — 10?). `nvidia-smi` → VRAM livre AGORA. `ollama list` → modelos reais instalados. Reportar tabela antes de tocar.
- **D1 · SYNC:** `git pull origin main` + `/mooter-update` (após qualquer release que toque tools/router — CLAUDE.md do repo tem o checklist de 6 passos).
- **D2 · INVERSÃO DE RESIDENTES (a correção da Wave J):** hoje o 30B fica residente e estrangula (folga chegou a 1.653 MB < 2,2 GB). Novo regime: um 7-9B (verificador/juiz — escolher de `ollama list`/registry, NÃO inventar nome) com `keep_alive=-1` RESIDENTE; `qwen3:30b` com `keep_alive` curto (10m), carregado SOB DEMANDA só para review de diff. Registar em `~/.mooter/preferences.json`/config o orçamento: residentes + picos + folga ≥2,2 GB. Medir com `nvidia-smi` antes/depois e colar números.
- **D3 · GOLDEN SET P2:** criar `tests/golden-set/` e semear com os casos REAIS documentados: A4 (15/15 verdes escondendo execução arbitrária), G.3 (3 bugs kimi: custo fracionário, cancel race, manifest), J0-A, kimi adapter. Cada caso: input (diff/registro) + veredicto correto + fonte. Meta ≥100 casos ao longo das semanas; hoje: os que existem, rotulados.
- **D4 · RONDA P2 PILOTO (bounded, GPU no talo):** para cada PR aberto do MP F0: review de diff mono-tema no 30B local + veredicto de painel (pequeno residente com swap A/B). Findings com ficheiro:linha; sem grep que confirme → finding morre. NADA de agentic multi-step no local.
- **D5 · AUDIT:** kappa contra o golden set (com nº de casos à vista — IC largo é declarado, não escondido) + recibo com: jobs, modelos, tok/s, folga mínima de VRAM da ronda, custo $0 comprovado.

**GUARD** 🐮 Mooter no talo (tier mínimo; pré-digest local; T3 só final-reviewer) · folga ≥2,2 GB BLOQUEANTE · classify.js FROZEN · selective adds · PR sim merge não · troca de residente é decisão registrada (afeta todos os pilares desta máquina) · evidência-ou-n/d.

**GATE** nvidia-smi antes/depois colado no recibo + golden set com N casos rotulados + 1 ronda P2 com recibo + zero violações de folga.

**NEXT** Sessões Cowork no Windows com /moo-talo (elegíveis lá: P2 qualidade · P5 motor). prev_hash chain antes de consolidar ledger multi-device.

**BACK** ⇄ MOO HANDOFF no SYNC.md + LOOP.md + nota no vault (`30-learnings/`). Cowork audita e regista no Notion.
⇄ END HANDOFF
