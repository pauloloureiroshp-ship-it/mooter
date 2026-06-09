# Friends-launch DMs — v12 (perfil-diferenciado · Wave 33.13)

> Refresh pós maratona Wave 33.10–33.13 (2026-06-08 madrugada). mooter.ai LIVE.
> **Mudança vs v11:** v11 era por idioma (PT-PT/PT-BR/EN). v12 é por **perfil de friend** —
> 2 confirmados + 1 a confirmar, cada um com hook + bullets + CTA único + PS com ângulo próprio.
> Tudo PT-PT. Supersedes v11 só no eixo de personalização; os numbers honestos mantêm-se.
>
> **Numbers reais (setup do Paulo, 1 dev — NÃO community average):**
> 658 calls roteadas · $25.95 saved (47%) vs all-Opus · 3 packs · classify.js sha intact.
> **Honest caveats:** dashboard per-user dá vazio até um `mooter sync` logged-in popular dados;
> federated/herd wisdom precisa ≥10 devices (Wave 34).
>
> **CTA único (todos):** https://mooter.ai · repo github.com/pauloloureiroshp-ship-it/mooter

---

## 👨‍💻 Friend 1 — Technical (developer / ops) · **Medium DM**

> Hook: *Fiz uma cena que te vai irritar por não a teres feito tu primeiro — um router local-first pro Claude Code.*
>
> Pus o **mooter.ai** live. É um hook (não um proxy) que mapeia o teu setup e decide, por prompt, se vai pro Ollama local, Haiku, Sonnet ou Opus — sem mudares uma linha de código.
>
> Pra ti, o que interessa:
> - **Install em 30s, corre 100% offline, sem conta obrigatória** — é um hook no Claude Code, não fica no meio do teu tráfego.
> - **Sign-in opcional (GitHub) só pra sync cross-device** — scopes mínimos `read:user user:email`. **Nunca lê o teu código.**
> - **Spawna sub-agentes com sandbox 4-layer by default** (bwrap, `--tmpfs $HOME` mask — não vaza credenciais). Não há `--no-sandbox` mágico.
> - **`classify.js` com sha gated em CI** — a lógica de routing é determinística e versionada, não um LLM a adivinhar.
> - Open source, MIT, single founder.
>
> No meu setup (1 dev, dados reais — não média): **658 calls, $25.95 poupados (47%)** vs all-Opus.
>
> 5 min: https://mooter.ai
>
> *PS (privacy): tudo local-first por design. O sync é opt-in e o hub nunca vê o teu raw user id nem o teu JWT — só um hash anónimo. Se quiseres, mostro-te o threat-model.*

---

## 🤔 Friend 2 — Curioso, tech-savvy (não-dev) · **Short DM**

> Hook: *Tás a gastar mais do que precisas em IA e nem dás por isso.*
>
> Lancei o **mooter.ai** — uma ferramenta que, quando usas o Claude Code, escolhe automaticamente o modelo de IA mais barato que ainda faz bem o trabalho (em vez de usar sempre o topo de gama). Instala-se em 30s e corre no teu próprio computador.
>
> - **No meu caso poupou 47%** — $25.95 em 658 utilizações reais.
> - **Não precisas de conta nem de configurar nada.**
> - Open source e gratuito.
>
> Dá uma espreitadela: https://mooter.ai
>
> *PS (poupança): os 47% são do meu setup pessoal, não uma média inflada de marketing — números honestos de 1 utilizador.*

---

## 🎨 Friend 3 — Vibe coder · **Short DM**

> Hook: *Sabes quando abres 3 terminais de Claude Code e eles começam a pisar-se uns aos outros? Resolvi isso.*
>
> O **mooter.ai** tem um **Conductor** que deixa correr vários Claude Code em paralelo sem conflitos — locks atómicos por worktree, heartbeat, fila e auto-recovery (nunca rouba uma sessão viva). Mais: roteia cada prompt pro modelo certo e poupa-te dinheiro de borla.
>
> - **Paraleliza sessões CC** sem race conditions (`mooter conductor`).
> - **Spawna agentes locais grátis** (Ollama) pra o trabalho pesado, cloud só pra síntese.
> - **47% de poupança** no meu setup real (658 calls, $25.95).
> - Install 30s, corre offline, MIT.
>
> Experimenta: https://mooter.ai
>
> *PS (paralelismo): o Conductor foi feito exactamente pra quem tem 4 terminais abertos ao mesmo tempo — fan-out sem te dar dores de cabeça.*

---

*v12 composto 2026-06-08 (Wave 33.13). Eixo = perfil de friend (vs idioma em v11). Numbers honestos: 1-dev setup do Paulo, não community average. Herd telemetry opt-in fica live quando ≥10 devices fizerem sync (Wave 34).* 🐮
