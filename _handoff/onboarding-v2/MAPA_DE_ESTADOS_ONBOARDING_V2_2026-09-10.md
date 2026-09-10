# Mapa de estados — onboarding v2 (2026-09-10)

Fonte dos ecrãs felizes: canvas «Percurso Real no mooter.ai» (8 ecrãs). Este mapa cobre o que o canvas não mostra: os caminhos tristes, o que o utilizador vê, e a saída. Regra: **nenhum estado bloqueia o router** — degrada, avisa, nunca pára.

## A. Site (mooter.ai)

| # | Estado | Detecção | O utilizador vê | Saída | Existe hoje? |
|---|---|---|---|---|---|
| A1 | GitHub OAuth falha / cancela | callback sem sessão | Banner "Não foi possível entrar com o GitHub. Tenta de novo ou usa Google." | volta a `/` | parcial (`AuthErrorBanner.tsx`) |
| A2 | Hardware não detectado no browser (WebGL bloqueado, Safari) | `WEBGL_debug_renderer_info` null | "Não consegui adivinhar. Escolhe abaixo — o `mooter init` confirma no teu Mac." | escolha manual | sim (`Confirm or pick manually`) |
| A3 | Utilizador sem GPU (cloud/other) | escolha | "Sem GPU local o Mooter roteia entre as tuas subscrições; podes adicionar Ollama depois." | modo só-subscrição | sim (copy existe) |
| A4 | Nenhuma subscrição seleccionada | passo 2 vazio | "Sem subscrições o Mooter corre só local (T0). Continua?" | Free local | n/d |
| A5 | Token de instalação expirado (24 h) ou já usado | `/i/<token>` → 410 | Script devolve mensagem legível; site: "Gera outro em Settings → Add device" | novo token | sim (`errorScript`) |
| A6 | Utilizador abre `/i/<token>` no browser | GET sem pipe | Mostra o script como texto (é a feature `\| less`) | — | sim |
| A7 | Download do `.mcpb` bloqueado (Gatekeeper / SmartScreen) | — | Página com "o Claude Desktop instala bundles assinados; se o macOS avisar, abre com o Claude Desktop" | — | n/d — assinatura do bundle a decidir |
| A8 | Trial acaba sem pagamento | entitlement | Dia 23: email. Dia 30: "voltaste ao Free; nada parou" | Free | n/d |
| A9 | Revogar device | Settings | "Chave morta. O device continua a funcionar em modo Free local." | — | n/d |
| A10 | Segundo device | Settings → Add device | Novo comando/bundle pessoal, token novo | — | n/d (botão) |

## B. Device (launcher, payload, init)

| # | Estado | Detecção | O utilizador vê | Saída | Existe hoje? |
|---|---|---|---|---|---|
| B1 | Payload ausente (1.ª vez) | launcher | Elicitation: "Vou preparar o Mooter (≈30 s)". Barra de progresso na conversa | descarrega `~/.mooter/cli` | n/d |
| B2 | Sem rede no 1.º arranque | fetch falha | "Sem rede não consigo descarregar o Mooter. Tento outra vez quando houver." | retry no próximo pedido | n/d |
| B3 | Sem Ollama | `which ollama` / porta 11434 | "Vou instalar o motor local (≈2 GB). Enquanto isso, este pedido vai pelo Claude." | recibo via subscrição; download em background | parcial (`install.sh` avisa) |
| B4 | RAM < 8 GB ou sem GPU | probe | "Este device não corre modelos locais; roteio entre as tuas subscrições." | só-subscrição | sim (init pergunta) |
| B5 | Disco cheio a meio do pull | Ollama erro | "Faltam X GB. Fico com o 3b." | degrada | n/d |
| B6 | Pull interrompido | modelo ausente no `ollama list` | Retoma no próximo pedido; recibo diz "motor local a preparar" | — | n/d |
| B7 | Nenhuma CLI de subscrição com sessão | probe | "Não encontrei sessões do Claude/Codex/Gemini. Roteio só local até entrares numa." | Free local | n/d |
| B8 | Claude Desktop precisa de reiniciar | conector registado mas não visível | Terminal: "Reinicia o Claude Desktop". `/install` detecta e mostra o mesmo | — | n/d |
| B9 | `claude`/`codex` CLI não instalada | `which` | "Registo o conector quando instalares. Comando: …" | — | n/d |
| B10 | Token pessoal inválido no bundle | 401 no link | "Este bundle expirou. Descarrega outro em Settings." | Free local | n/d |
| B11 | Offline depois de ligado | entitlement cache | Tudo funciona 30 dias; painel diz "sem sync há X" | — | n/d |
| B12 | Chave de device revogada | 401 no beacon | "Este device foi revogado. Continua em Free local; volta a ligar em Settings." | — | n/d |
| B13 | Consentimento `mooter share` recusado | `consent.json` | Nada sobe; dashboard mostra "device sem sync (opt-out)" | — | sim (opt-in existe) |
| B14 | Payload corrompido / update a meio | verificação de assinatura falha | Volta à pasta anterior; "Actualização revertida (assinatura inválida)." | rollback | n/d |

## C. Conversa (Claude Desktop / Claude Code / Codex)

| # | Estado | Detecção | O utilizador vê | Saída | Existe hoje? |
|---|---|---|---|---|---|
| C1 | Host ignora a rota (obediência) | "última rota há > 24 h" com pedidos a acontecer | Painel: "O Claude não está a chamar o Mooter neste projecto. Ver porquê." | hooks no Claude Code (M1); no Desktop, instruções do server | ❌ **0% medido** |
| C2 | Modelo local responde mal (veredicto ≠ aceite) | verificação | Recibo: "escalado para Claude — motivo: citações em falta" | escalada com recibo | parcial (`verify` D3) |
| C3 | Pedido sensível num projecto "nunca sai" | política | "Este projecto nunca sai do Mac. Corro local ou paro." | local ou recusa com motivo | n/d (W3.b) |
| C4 | Janela do Claude Code esgotada | quota estimada / erro do host | Painel: "Janela do Claude a 0% — reservo o Codex para escrita até 17:05" | re-rota | n/d — é a dor original |
| C5 | Pedido de escrita com motor local escolhido | classe | "Escrita vai para o Claude Code (regra tua). Mudar: `mooter route`" | — | parcial |
| C6 | Cold-start do modelo (>10 s) | `load_duration` | Recibo mostra "carregar modelo: 8,2 s" — e sugere keep_alive | `OLLAMA_KEEP_ALIVE=-1` | parcial (D4) |
| C7 | Painel MCP App não suportado pelo host | capabilities | Recibo em texto, mesma informação | — | n/d |
| C8 | Utilizador pede "quanto poupei?" | — | "Não medimos poupança sem tokens dos dois lados. Vê: tarefas, cobertura, janela preservada." | — | cultura existe |

## D. Conta e cobrança

| # | Estado | O utilizador vê | Saída |
|---|---|---|---|
| D1 | Free sem conta quer extrato multi-device | Elicitation "Liga uma conta (grátis)" | — |
| D2 | Team: seat sem beacon há 7 dias | Admin: "Rita ainda não ligou nenhum device" + reenviar convite | onboarding, não cobrança |
| D3 | Pagamento falha na renovação | Email + 14 dias de graça; depois Free | nunca interrompe |
| D4 | Cancelamento | "Perdes sync e extrato; o router fica para sempre" | Free |

## E. Regras transversais
1. Nunca uma barra de quota sem "estimado". 2. Nunca "0 bytes saíram" — "nenhuma chamada cloud despachada pelo Mooter". 3. Nunca % de poupança sem par real. 4. Todo o estado triste tem uma frase e uma saída — sem stack trace na conversa. 5. Todo o beacon é visível antes de subir (`mooter share --show`).
