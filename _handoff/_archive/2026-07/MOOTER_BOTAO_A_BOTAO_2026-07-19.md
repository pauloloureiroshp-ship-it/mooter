# 🔬 Auditoria botão-a-botão do plugin Mooter — front (ao vivo) × backend (código) × advogado do diabo

> Cowork · 2026-07-19 · Método: navegação ao vivo (computer-use: Cockpit + Control) + inventário de
> backend por subagente (46 handlers do webview + 7 comandos + ~35 lp-*) + advogado do diabo.
> Correção de honestidade: o subagente reportou row-renderer/mission-control/project-command como
> "ausentes" — era artefato do MEU staging incompleto; **eu vi todos renderizando ao vivo**, existem
> no build. Abaixo já corrigido: separo BUG REAL de artefato-de-staging.

## 1. Veredicto do backend (o que o código realmente faz)

**A grande notícia: o backend é SÓLIDO.** Dos 46 handlers do Cockpit, **44 são vivos e reais**
(escrita atómica em disco, git via execFile com sha-guard, CLI, Ollama, file-bus). Os 7 comandos do
package.json têm handler. Os ~35 handlers do Live Preview são todos reais (git, fs, Agent SDK,
deploy hard-gated). Isto NÃO é uma casca vazia — é um backend de produção. O veredicto 4.5/10 de
julho subestimou; o backend merece ~8.

## 2. Os defeitos REAIS (independentes de build — confirmados no código E/OU ao vivo)

| # | Defeito | Evidência | Front (vi ao vivo?) | Severidade |
|---|---|---|---|---|
| **D1** | **Savings INCONSISTENTE entre abas + NEGATIVO** — Cockpit: "$0.05 · 0 dispatches"; Control: **"$-109.39"** | ao vivo (2 screenshots) | ✅ SIM — gritante | 🔴 alta (mata confiança na hora) |
| **D2** | **hardware n/d** ("nvidia-smi não escreveu cache") no header e no bloco GPU | ao vivo + código (`fleetAgo`/gpu-monitor) | ✅ SIM | 🔴 alta |
| **D3** | **`toggleProject` não persiste** — grava via `extra.preferences.__set` que NÃO existe (host-extra só tem leitura) → colapso do projeto volta a cada refresh | código (extension.js:961 + host-extra:118) | n/d (comportamento) | 🟡 média |
| **D4** | **`archMode` e `auditFilter` mandam mensagem MORTA ao host** — funcionam client-side, mas o `send()` ao host é lixo (o próprio código comenta "a dead control") | código (sem `m.cmd` correspondente) | n/d | 🟢 baixa (funciona, mas é dívida) |
| **D5** | **`refreshIntegrations` enganoso** — rótulo sugere sync remoto, mas só carimba hora LOCAL (o toast até admite) | código (extension.js:974) | 🟡 chips Notion/Obsidian | 🟡 média |
| **D6** | **Densidade sem modo compacto** — Cockpit+Fleet+LiveSessions+Control empilham em scroll longo | ao vivo | ✅ SIM | 🟡 média (power-user ok, amigo afoga) |
| **D7** | **2 webviews** (Cockpit + Live Preview em janelas separadas) do mesmo produto | ao vivo + package.json | ✅ SIM | 🟡 média |

## 3. O que está PERFEITO (não tocar — advogado do diabo confirma que são fortes)

- **Savings honesto do Cockpit** ("$0.05 · real executed $0.00 · 0 local dispatches yet · advisory") — honestidade radical, é doutrina. NÃO mexer (só reconciliar com D1).
- **Local Moo Fleet** ("8 moos · qwen3:30b medido · 206.1 tok/s · $0 · GPU live") — o fosso na tela. Perfeito.
- **Pipeline** spec→plan→exec→review→ship 8 (derivado de git). Primeiro-classe.
- **gitFlow / handoff / commit&push** — backend real com sha-guard e preview. Robusto.
- **Live Preview** — probe HTML 2xx validado, edição $0, deploy hard-gated. Feature completa.
- Modos LazyMoo/Moo/CrazyMoo + Auto routing. Claro.

## 4. Advogado do diabo — "isto está pronto para o teste do amigo?"

**NÃO, por causa de D1 e D2 — e só por causa deles.** Ataque: "O backend é ótimo, mas o amigo não lê
código; ele lê a TELA. E a tela diz, na primeira dobra da aba Control, **-$109.39**. Nenhuma
explicação salva um número negativo gigante no lugar onde devia dizer quanto ele POUPOU. Ele
desinstala antes de ver o Fleet brilhar." Procede 100%. Contra-ataque fraco: "é advisory/n/d" — não
salva, porque o rótulo diz "poupado hoje" e o número é negativo. **D1+D2 são baratos de corrigir e
são o que separa 6.5 de 8.5.** Todo o resto (D3–D7) é dívida real mas não fisga o amigo na primeira tela.

## 5. Como resolver — a régua de eficiência (o mínimo que move a agulha)

| Wave | O que | LLM | Por quê | Move a nota |
|---|---|---|---|---|
| **VS-F0UX** | D1 (reconciliar/nunca-negativo) · D2 (hardware real ou esconder) · D5 (rótulo honesto) · D3 (persistir toggle) · D4 (remover mensagem morta) | **CC** | cirurgia no webview que ele domina; são reparos, não features | 6.5 → **8.0** |
| **VS-W1** (já em PR #260) | estado fora do painel (semáforo/beacon/badge) — resolve "densidade exige foco" (D6 parcial) | **CC** | já entregue | +1.0 |
| **compacto+dedup** (god-mode F2) | modo compacto default (D6) + fundir/clarificar 2 webviews (D7) | **CC** | design de navegação | 8.0 → 8.5 |
| **Recibos por anel** | o número honesto por anel alimenta o savings correto (raiz de D1) | **Codex** | determinístico | fecha a raiz de D1 |

**Advogado do diabo sobre a régua:** "não é over-engineering consertar 7 coisas?" — não: D1+D2
são 1 wave curta (F0UX) e resolvem o fisga-do-amigo; o resto é sequenciado, não simultâneo. E
NENHUMA é feature nova — é higiene. Fazer feature nova antes de consertar o "-$109" seria o erro.

📮 Alimenta o VS-F0UX v2 (com os path:linha dos bugs) + Currículo Vivo (auditoria botão-a-botão ao
vivo com backend confrontado — competência rara). Nota atual: front 6.5 · backend 8.0 · **produto 7.0**.
