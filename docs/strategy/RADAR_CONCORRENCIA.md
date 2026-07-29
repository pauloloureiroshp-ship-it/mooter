# Radar de concorrência — ferramentas de coding agent e routing

> Cadência: **trimestral** (próxima revisão: Outubro 2026). Cada linha traz data e fonte.
> Uma entrada sem data é uma entrada por verificar. `n/d` é resposta legítima.
> Criado a 2026-07-26 porque o repo não sabia que o Roo Code tinha fechado, que o Continue.dev
> tinha sido comprado e que o Cursor lançara um router — três eventos com impacto directo na tese.

## Ronda 2026-07 (Julho de 2026)

| Actor | Movimento | Data | Impacto para o Mooter |
|---|---|---|---|
| **Cursor** | Cursor Router em GA — keep rate, custo por commit, cache-awareness | 2026-07-22 | Valida a tese de routing; a métrica *keep rate* é copiável e honesta. O ponto de cache-awareness aponta-nos directamente: releitura de cache é ~48,8% do nosso peso |
| **Continue.dev** | Comprado pela Cursor; repo em modo leitura | Jun 2026 | Menos um concorrente OSS no espaço local+nuvem |
| **Roo Code** | Encerrou | 2026-05-15 | Menos um; o espaço "híbrido honesto" ficou mais vazio, não mais cheio |
| **Cline / Kilo Code** | Continuam com Ollama BYOK | — | Os dois que restam. Nenhum lê quota de subscrição nem faz verificação cruzada |
| **LiteLLM** | Estratégias nomeadas: `latency-based-routing`, `least-busy`, `usage-based-routing-v2`, `cost-based-routing`; overhead 10-20 ms | — | Nós não temos nenhuma estratégia nomeada. Lacuna clara, e barata de fechar (Onda 4.4) |
| **OpenRouter** | Routing por preço; overhead 40-55 ms | — | Cobra na mesma. Não tem tier de custo zero |
| **Anthropic** | Sem endpoint de quota para planos de subscrição; Usage & Cost API só para organizações de API (`sk-ant-admin-*`) | — | Confirma que a leitura local de sessões é a única via — e é a nossa |
| **Fan-out / verificação cruzada** | **Nenhum produto comercial identificado a vender isto** | Jul 2026 | A janela do fosso continua aberta |

## Perguntas a repetir em cada ronda

1. Algum destes passou a ler quota de **subscrição** (não de API)?
2. Algum vende fan-out ou verificação cruzada entre motores?
3. Alguém trata a GPU do utilizador como tier de primeira, com contexto real?
4. Alguma métrica nova de qualidade sem perguntar ao utilizador (keep rate, satisfação inferida)?
5. Alguém publica poupança com cache-awareness incluída?

## Como actualizar

Uma pesquisa por actor, uma linha por movimento, com data e ligação. Se não houver movimento,
escreve-se "sem movimento verificado em <data>" — o silêncio também é informação, mas só quando é
datado.
