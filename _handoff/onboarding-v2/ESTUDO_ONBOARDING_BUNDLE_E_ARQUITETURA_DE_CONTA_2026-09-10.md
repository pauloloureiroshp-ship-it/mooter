# Onboarding sem fricção — bundle único, arquitectura launcher+payload e conta (2026-09-10)

Estudo prévio ao masterprompt. Factos web de hoje com fonte; factos do repo lidos em disco (`landing/`, `plugin/mooter/`, `tools/cli/commands/`, `install.sh`). Nada construído.

## 0. Veredicto em 8 linhas

| # | Pergunta do dono | Resposta |
|---|---|---|
| 1 | Dá para embutir tudo (Node, modelos, Ollama) num bundle único e pessoal? | **Quase.** Node: sim, de graça — o Claude Desktop já traz Node para bundles `.mcpb`. Código do Mooter: sim, dentro do `.mcpb`. Token pessoal: sim (`.mcpb` gerado por utilizador, ou campo `user_config` sensível no diálogo de instalação). **Modelos (2–9 GB): não** — nunca vão dentro do instalador; descarregam-se depois, com progresso. Ollama: bundlável (MIT) ou substituível por `node-llama-cpp` dentro do próprio bundle |
| 2 | Python? | **Eliminar.** O host não fornece Python (só Node). Tudo o que o Mooter precisa corre em Node |
| 3 | Tão simples como a Anthropic liga um conector? | **Sim, pelo mesmo mecanismo:** duplo clique no `.mcpb` → diálogo do Claude Desktop → instalado. O `.mcpb` passa a ser o bootstrap: no 1.º pedido, ele próprio instala o resto |
| 4 | Complexidade para um utilizador "dummy"? | 3 níveis (§2). Recomendado: **L1 — `.mcpb` pessoal** (2 cliques + 1 pergunta). L0 (`curl \| bash`) fica para devs/CLIs. L2 (instalador nativo .pkg/.exe) só quando houver PJ a pedir |
| 5 | Features/skills no onboarding? | **Não todas de uma vez.** Divulgação progressiva: minuto 1 = recibo; dia 1 = statusline + cockpit; dia 7 = extrato + `/moo-talo`. Inventário em §4 |
| 6 | Como convencer quem se encantou? | Test drive A/B no próprio prompt, recibo partilhável, "carta dos 7 dias", garantia "nunca gera factura" (§5) |
| 7 | Usar o skill de design para o mock impecável + mapa de botões + caminhos tristes? | **Sim — mas depois de fixar a arquitectura (§3).** Primeiro o mapa de estados (§6), depois protótipo clicável, depois o masterprompt |
| 8 | `/mooter-atualizar` ligado à conta? | **Arquitectura launcher + payload** (§7): o `.mcpb` é um lançador fino e estável; o código vive em `~/.mooter/cli` e actualiza-se sozinho pelo canal que a conta define (free = stable · solo = stable+beta · team = fixado pelo admin) |

## 1. Factos que decidem o desenho

| Facto | Fonte | Consequência |
|---|---|---|
| Claude Desktop **inclui Node** para servidores `.mcpb` tipo `node`; Python **não** é fornecido | [mcpb #89](https://github.com/modelcontextprotocol/mcpb/issues/89) · [MANIFEST.md](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md) | Pré-requisito Node desaparece para quem instala pelo Claude Desktop; nunca depender de Python |
| `.mcpb` tem `user_config` (string/number/boolean/directory/file), `sensitive: true` (input mascarado, "store securely"), injectado por `env`/`args`; `compatibility.platforms` darwin/win32/linux | MANIFEST.md | O token pessoal pode ser campo do diálogo de instalação **ou** vir já dentro de um `.mcpb` gerado por utilizador (é um zip) |
| `.mcpb` = instalação com um clique, sem editar JSON | [claude.com/docs/connectors/building/mcpb](https://claude.com/docs/connectors/building/mcpb) · [support.claude.com](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) | É o "como a Anthropic faz" |
| MANIFEST **não define mecanismo de update** de bundles instalados | MANIFEST.md | Update tem de ser nosso → launcher + payload (§7) |
| Ollama: mac `brew`/app/`install.sh`, Windows `winget install Ollama.Ollama` ou `OllamaSetup.exe` sem admin, Linux `install.sh`; sem flag silenciosa documentada; `OLLAMA_KEEP_ALIVE=-1` evita cold-start | [hybrid-llm 2026](https://hybrid-llm.com/tutorial/ollama/ollama-setup-guide-2026/) | Instalação de Ollama é um passo com UI própria; ou bundlamos o binário (MIT) ou trocamos por inferência embutida |
| Modelos por RAM (guia 2026): 8 GB → 3b/8b · 16 GB → 14b · 24–32 GB → 30b | idem | O probe decide o modelo; o 1.º recibo sai com o pequeno |
| `bun build --compile` gera binário único mac arm64/x64, win x64/arm64, linux; cross-compile; codesign no mac com entitlements JIT; notarização não coberta | [bun.com/docs/bundler/executables](https://bun.com/docs/bundler/executables) | Caminho para instalador nativo (L2) sem Node no sistema; exige Apple Developer para notarizar |
| Repo hoje: `plugin/mooter` (skills mooter/cockpit/retry, commands cabine/cockpit/mooter-setup, hook `route-or-bootstrap.js`, statusline, agent `mooter-dispatch`), CLI `init/doctor/recibo/dashboard/update/uninstall`, `install.sh` com canal `friends-beta`, site com token single-use e `profile.json` | disco | O update (`update.js`) e o canal já existem — falta ligá-los à conta |

## 2. Três níveis de instalação (complexidade real)

| Nível | Quem | Passos do utilizador | O que acontece por trás | Pré-requisitos que sobram | Esforço nosso |
|---|---|---|---|---|---|
| **L0 · dev** | Claude Code / Codex / Cursor | 1 · login GitHub · 2 · copiar `curl mooter.ai/i/<token> \| bash` · 3 · `mooter init` | clona, `npm i`, profile, regista conectores, consentimento | git, Node ≥ 20 | ✅ existe (afinar `init`) |
| **L1 · .mcpb pessoal** 🔥 | Claude Desktop (e Cowork) | 1 · login GitHub · 2 · **Download `Mooter-<nome>.mcpb`** · 3 · duplo clique → "Instalar" · 4 · 1.º pedido responde 1 pergunta | Node do host corre o launcher; launcher descarrega payload para `~/.mooter/cli`, corre probe, instala/descarrega motor local com progresso na conversa (elicitation), regista Claude Code/Codex se existirem, liga device com o token embutido | **nenhum** (Ollama tratado por nós) | 🔜 médio: gerador de `.mcpb` por utilizador no site + launcher + bootstrap por elicitation |
| **L2 · instalador nativo** | PJ, "dummy" total, Windows | 1 · login · 2 · Download `.pkg`/`.exe` · 3 · Next-Next-Finish | binário `bun --compile` + Ollama bundlado + registo de todos os hosts + token no nome do ficheiro ou no `profile` | nenhum | ❌ alto: assinatura/notarização (Apple Developer), MSI/Inno, canais de update por OS — só com PJ a pagar |

**Onde estão os GB:** modelo 3b ≈ 2 GB · 7b ≈ 4–5 GB · 14b ≈ 9 GB (ordem de grandeza; medir no probe). Regra: **primeiro recibo com o 3b (ou via subscrição) enquanto o 14b desce em background**. O único tempo de espera inevitável fica escondido atrás de valor já entregue.

**Motor local — duas opções para o bundle:**

| Opção | Prós | Contras | Veredicto |
|---|---|---|---|
| Ollama (bundlado ou instalado pelo launcher) | Já é o padrão do repo (`OLLAMA_HOST`, keep_alive, bench); app própria com updates | Instalação com UI própria no mac/win; segundo processo a gerir | 🔥 Manter agora |
| `node-llama-cpp` dentro do payload | Zero dependência externa; Metal/CUDA prebuilt; download de GGUF gerido por nós | Muda o motor medido no MooterBench; re-medir tudo | 🔜 Estudar para L2 |

## 3. Arquitectura recomendada: launcher + payload + conta

```
mooter.ai (Next/Supabase)                     device
┌──────────────────────────┐    .mcpb pessoal   ┌─────────────────────────────────────┐
│ login GitHub             │ ────────────────▶ │ LAUNCHER (.mcpb, ~KB, estável)       │
│ /onboarding → profile    │                   │  · lê token do user_config/bundle    │
│ gera Mooter-<nome>.mcpb  │                   │  · garante ~/.mooter/cli (payload)   │
│ entitlement por conta    │ ◀── beacons ───── │  · exec payload → MCP stdio          │
│ canal de update          │                   │ PAYLOAD (~/.mooter/cli, actualizável)│
│ dashboard/settings       │                   │  · router, recibo, probe, bootstrap  │
└──────────────────────────┘                   │  · regista Claude Code/Codex/Cursor  │
                                               │ MOTOR LOCAL (Ollama + modelos)       │
                                               └─────────────────────────────────────┘
```

| Peça | Responsabilidade | Muda com que frequência |
|---|---|---|
| Launcher (`.mcpb`) | Só: token, garantir payload, lançar. Nunca lógica de produto | Quase nunca (é o que o Claude Desktop instala) |
| Payload (`~/.mooter/cli`) | Tudo o resto. Auto-update por canal | Semanal |
| Conta | Entitlement, canal, devices, extrato | — |

Porquê: o MANIFEST não define update; o Claude Code faz exactamente isto (lançador npm fino + auto-update); o Claude Code e o Codex partilham o mesmo payload via `claude mcp add` / `codex mcp add`.

## 4. O que o Mooter tem para oferecer — e quando aparece

| Momento | O que aparece | De onde vem (repo) | Porquê aqui |
|---|---|---|---|
| Minuto 1 | Recibo do 1.º pedido + regra "local p/ leitura, Claude p/ escrita" | `tools/cli/commands/recibo.js`, hook `route-or-bootstrap.js` | É a magia; tudo o resto distrai |
| Minuto 5 | Statusline com rota e quota; `/mooter-cockpit` | `statusline-firstmagic.js`, `plugin/.../commands/cockpit.md` | "your first five minutes" já existe em `/install` |
| Dia 1 | `mooter doctor`, `mooter recibo`, política "nunca sai" por projecto | `doctor.js`, W3.b | Quando o utilizador já confia |
| Dia 2–7 | `/moo-talo` (GPU a trabalhar sozinha), pilares, `mooter-retry` | `skills/moo-*`, `plugin/.../skills/retry` | Só faz sentido com histórico |
| Dia 7 | Extrato por email + dashboard; convite para Solo | `dashboard.js`, `/dashboard` | Argumento de renovação |
| Sempre | `/mooter-atualizar`, `mooter uninstall` | `update.js`, `uninstall.js` | Confiança: sair é fácil |

Regra: cada feature aparece **no momento em que resolve algo que o utilizador acabou de sentir** — nunca em lista.

## 5. Convencer quem se encantou (fora da caixa, sem inventar números)

| Ideia | Como | O que prova |
|---|---|---|
| **Test drive no próprio prompt** | Botão "corre isto também no Claude e compara" no 1.º recibo (opt-in, gasta a janela dele uma vez) | Par real, medido, no código dele — a única classe admitida no pitch |
| **Recibo partilhável** | Link/imagem sem prompt: rota, 3 preços, egresso, veredicto | O utilizador faz o marketing; suposição visível evita o problema Honey |
| **Carta dos 7 dias** | Email com 3 contagens reais + "o que não medimos ainda" | Honestidade como diferenciador |
| **Garantia escrita** | "Nunca cobramos por token · passar do plano nunca gera factura · cancelar não parte nada" | Remove a última dúvida do financeiro |
| **Mostrar o payload do beacon antes do consentimento** | `mooter share --show` no terminal e na elicitation | Segurança visível, não prometida |
| **"O teu device apresenta-se"** | Probe no terminal/elicitation lista GPU + subscrições logadas | Frase que nenhum gateway consegue dizer |

## 6. Mapa de estados (caminhos felizes e tristes) — a fazer antes do protótipo

| Estado | Detecção | O que o utilizador vê | Saída |
|---|---|---|---|
| Sem Ollama | probe | "Vou instalar o motor local (≈2 GB). Enquanto isso, o 1.º pedido vai pelo Claude." | recibo via subscrição, download em background |
| Sem GPU / RAM < 8 GB | probe | "Este device não corre modelos locais; o Mooter roteia entre as tuas subscrições" | modo só-subscrição, honesto |
| Disco cheio a meio do pull | Ollama erro | "Faltam X GB. Continuo com o 3b." | degrada, não bloqueia |
| Claude Desktop não reinicia | conector não aparece | Página `/install` mostra "reinicia o Claude Desktop" com detecção | — |
| Token expirado (24 h) / já usado | `/i/<token>` 410 | "Gera outro em Settings → Add device" | — |
| Offline | entitlement cache | Tudo funciona 30 dias; dashboard não actualiza | — |
| Host ignora a rota (obediência) | "última rota há > 24 h" | Painel avisa; hooks no Claude Code | M1 |
| Trial acabou sem pagamento | entitlement | Volta a Free; nada pára | — |
| Segundo device | Settings → Add device | Novo `.mcpb`/comando pessoal | — |
| Revogar device | Settings | Chave morre; payload continua em modo Free | — |
| Utilizador Free sem conta | escolha na elicitation | Tudo local; sem extrato multi-device | pode ligar depois |

## 7. `/mooter-atualizar` na nova arquitectura

| Hoje | Proposta |
|---|---|
| `update.js` + `install.sh --channel=friends-beta` | Canal vem do **entitlement** da conta: Free = `stable` · Solo = `stable`/`beta` à escolha · Team = fixado pelo admin (versão mínima/máxima) · Enterprise = manifesto assinado e espelhado |
| Update do código clonado | Update do **payload** em `~/.mooter/cli` a partir de manifesto assinado (Ed25519, já existe); launcher intocado; rollback = pasta anterior |
| Sem relação com device | Beacon reporta versão → dashboard mostra "device X desactualizado" → `/mooter-atualizar` ou auto-update silencioso por política |
| Sem verificação | `mooter-verify` valida a assinatura do manifesto antes de trocar |

## 8. Sequência recomendada (antes do masterprompt)

1. **Fixar a arquitectura** launcher + payload + conta (§3) — decisão do dono, com refutação codex.
2. **Mapa de estados** completo (§6) — é a fonte dos ecrãs tristes.
3. **Protótipo clicável** no canvas de design: os 8 ecrãs + estados tristes, cada botão com destino e efeito; testar com 1 pessoa que nunca viu o Mooter (o "terceiro humano" do gate B4).
4. Só então o masterprompt — com o protótipo como especificação, não como inspiração.

**As que mordem (gauntlet):** nº7 obediência 0% (tudo isto mostra rotas que o host pode ignorar — M1 primeiro); nº1 números do dashboard "saved vs all-Opus" têm de sair antes do utilizador nº2.
