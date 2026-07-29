# Inventário do que ficou por fazer — revisitando toda a conversa
**Data:** 2026-07-27 · **Estado:** v1.18.0 (v1.19.0 em curso) · branch `chore/mooter-20-h0`, tudo pushed

> Método: percorri cada ponto de interação desta conversa — a auditoria dos 15 pontos, as 5 ondas,
> a doutrina MEO, as 8 perguntas do diagnóstico e os pedidos directos. Cada linha diz **quem decide**
> e **porque ainda não está feito**. Nada aqui é "quase feito": ou está, ou não está.

---

## A. Feito e provado nesta sessão (para não se perder)

| Entrega | Commit | Prova medida |
|---|---|---|
| Onda 0 — régua honesta | `fd4f425`+`4bf34eb` | inflação 2,44× medida; peso 15 283→8 971 |
| Onda 1 — tier local | `86a3af5` | contexto 4096→≥16 384; qwen3.6:27b ganha ao 3:30b |
| Onda 2 — velocidade | `6224a0d`+`0a666e3` | sonda de quota bloqueava 209 ms → cede o ciclo |
| Onda 3 — loop que aprende | `9026e57` | 73 jobs lidos; custo mediano real |
| Onda 4 — fosso (parcial) | `3e05415` | mapa de projecto + verificação cruzada |
| Onda 5.1/5.3 — narrativa | `0a666e3` | STRATEGY.md reescrito; radar criado |
| MEO M0+M1 + skills | `da856bf`+`0a52e5b` | **roots suportado (9 raízes)**; scorecard vivo |
| Onda 5.4 — 3 bugs | `af3787a` | create_worktree, permissões, bind |
| M1.5 — instrumentação | `06baa60` | falha 26,58→**17,14%**; custo 0,4826→**0,2811** |

---

## B. Pendente — por ordem de valor

### B1 · ✅ FECHADO — os dois bugs de honestidade (`bf358e7`, v1.19.0)
- **Bug A:** um pedido de execução para um motor sem ferramentas passa a ser **recusado** (quando
  o `moo` é explícito) ou **reencaminhado para `cc`** (quando a escolha era automática). Deixou de
  poder responder sem correr.
- **Bug B:** o tecto de tier é **reaplicado ao modelo final**, imediatamente antes do
  `buildCommand`, com `desceu_de` e `routed_by:'quota'` expostos. O Codex confirmou o vermelho
  pré-fix, como pedido.
- Gate nativo: **23 suites verdes** + require graph. `seamless.test.js` passou de 13 → **22**.

### B2 · 🔴 Trabalho a $0 em 36,71% (meta 50%) — a única excepção aberta
**Dono:** MOO. Não se resolve com código novo: precisa de saber **porque** foi recusado, e o
`local_decisao` só começou a ser gravado na v1.18.0 — os jobs antigos não o têm. **Acção:** deixar
correr 20-30 jobs e ler `motivos_nao_local`. É a primeira métrica que se vai autoexplicar.

### B3 · 🟠 Resto da Onda 4 — o fosso que ninguém vende
Escolheste esta como próxima onda. Falta: **fan-out real** (1 tarefa → N motores → merge),
**failover com estado**, e **estratégias nomeadas de routing** (`latency-based`, `least-busy` — o
LiteLLM tem-nas, nós não temos nenhuma). **Dono:** MEO decide o âmbito; MTO implementa.

### B4 · 🟠 M2 a sério — usar os seis cargos durante 5 dias
As skills existem (`skills/meo-*`), o scorecard existe, o contador de interrupções existe.
**O que falta é usá-los** e ver se as interrupções caem para ≤1/dia. Não é código: é uma semana de
prática. **Dono:** MEO (só tu podes fazer este).

### B5 · 🟠 Calibrar as faixas do scorecard
As 9 faixas são todas `default`, e `entregas/dia [1, 1000]` nunca poderá disparar — é enfeite com
ar de rigor. **Só o MEO pode definir o que é "bom".** Editar `~/.mooter/preferences.json →
board_faixas`.

### B6 · 🟠 Cache-awareness na conta de poupança (P6)
A releitura de cache é **53,8%** do peso e está a subir (era 48,8% ontem). Enquanto não
descontarmos a invalidação que as nossas próprias trocas de tier provocam, qualquer "poupança"
mostrada é parcialmente ficção. **Recomendação do MFO:** mostrar `n/d` até estar medido.

### B7 · 🟡 MRO — auditar o histórico de permissões (P7)
Agora que `permissoes_pedidas` vs `permissoes_efectivas` existe, falta varrer os jobs históricos e
ver se algum escreveu fora do âmbito. **Dono:** MRO, e não precisa do MEO para começar.

### B8 · 🟡 Radar de concorrência — 1ª ronda activa (frente 8)
O ficheiro existe com a ronda de Julho, mas a **rotina trimestral** ainda não correu uma vez de
propósito. Próxima: Outubro 2026.

### B9 · 🟡 Notion — 7 releases atrás (frente 14)
Bloqueado: **o conector do Notion precisa que o autorizes** nas definições de conectores do
claude.ai. Enquanto isso, o vault Obsidian está em dia e é a fonte fiável.

### B10 · 🟡 M3 — plugin e marketplace
Empacotar conector + skills + comandos num plugin instalável e candidatar ao directório oficial.
⚠️ Facto medido que muda o plano: **`elicitation` é `n/d`** (não declarado pelo cliente), logo o
onboarding dentro do Cowork fica pelo **plano B** (painel de setup no MCP Apps).

### B11 · 🟡 A sexta experiência — "Delegar"
Propus acrescentá-la ao `STRATEGY.md` (hoje são Resume·Plan·Route·Watch·Review). **Continua por
decidir.** Sem ela, a camada MEO não tem lugar declarado na tese.

### B12 · ❄️ M4 — mesh multi-GPU
**Gate fechado de propósito:** só abre se ≥20% dos jobs esperarem por GPU ocupada em 14 dias. Hoje
o gargalo é decisão e verificação, não silício. Confirmado pela pesquisa: o Cowork desktop **não**
continua uma execução noutro dispositivo — o mesh teria de ser inteiramente nosso.

### B13 · ❄️ LoRA / DoRA (frente 3)
Inegociável: só depois de o loop da Onda 3 ter recolhido dados. Treinar sobre dados que ninguém
recolheu é teatro caro.

---

## C. Pendências na máquina (não dá para automatizar daqui)

| # | O quê | Porquê importa |
|---|---|---|
| 1 | **Reiniciar o serviço Ollama** | Sem isso o `OLLAMA_KV_CACHE_TYPE=q8_0` não vale — está gravado mas inactivo |
| 2 | Confirmar num job local que `/api/ps` mostra `context_length ≥ 16384` | É a prova final da Onda 1; hoje só sabemos que o payload envia |
| 3 | Autorizar o conector do Notion | Desbloqueia B9 |

---

## D. O que eu faria a seguir, se decidisses só uma coisa

**B2 + B5 juntos, e nesta ordem.** Deixa correr jobs para o `motivos_nao_local` encher, e calibra
as faixas — porque enquanto as faixas forem default, o scorecard alarma sobre padrões que não são
teus. Um painel que alarma pelo motivo errado treina-te a ignorá-lo, e aí perdemos a camada MEO
inteira antes de ela começar.
