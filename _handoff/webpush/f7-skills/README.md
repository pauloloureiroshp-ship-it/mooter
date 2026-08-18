# Skills do Mooter — a camada MEO

Estas skills são **os cargos da empresa de um**. Não são prompts descartáveis: são versionadas no
repo, evoluem com o produto e são a mesma coisa em todas as máquinas.

| Skill | Cargo | Veto exclusivo |
|---|---|---|
| `meo-conselho` | Secretário do conselho | — (consolida, não decide) |
| `meo-moo` | Mooter Operating Officer — a GPU | recusar trabalho que não cabe no local |
| `meo-mto` | Mooter Technology Officer | bloquear merge |
| `meo-mfo` | Mooter Financial Officer | descer o tecto de tier |
| `meo-mio` | Mooter Intelligence Officer | reencaminhar categoria de tarefa |
| `meo-mro` | Mooter Risk Officer | parar tudo e escalar |
| `meo-mcc` | Mooter Chief of Comms | marcar um documento como "mente" |

O MEO é o Paulo. Não há skill para ele: as decisões irreversíveis são dele, e é isso que o define.

## A camada dos pilares — a mesma empresa, agora a correr na GPU

Os cargos acima **decidem**; os pilares **rondam**. Cada pilar é uma ronda *bounded* que corre no
tier local ($0), produz um recibo e pára — nunca um daemon a moer GPU sem prestar contas.

| Skill | Pilar | Cargo dono |
|---|---|---|
| `moo-talo` | consola: abre UMA ronda do pilar certo para este device | — (despacha) |
| `moo-pilar-routing` | P1 — Routing & Custo | MFO + MIO |
| `moo-pilar-qualidade` | P2 — Qualidade & Verificação | MTO |
| `moo-pilar-coerencia` | P3 — Coerência Doc↔Produto | MCC |
| `moo-pilar-higiene` | P4 — Segurança & Higiene do Repo | MRO |
| `moo-pilar-motor` | P5 — Motor Local & GPU | MOO |
| `moo-pilar-produto` | P6 — Produto & Experiência | MEO |

As três leis da ronda, que valem para todos: **um pilar activo por GPU** (lease, nunca roubada) ·
**folga de VRAM** medida ou `n/d`, nunca presumida · **STOP do humano** (`~/.mooter/stop.json`)
verificado antes de cada dispatch e a falhar FECHADO. O mecanismo está em
`packages/fleet-commander/src/stop-gate.mjs`; a métrica "% de GPU" é banida dos recibos.

## Como se usa

**Uma sessão do Cowork por cargo.** Numa sessão dedicada, invoca-se `/meo-mfo` (ou o cargo que
for) e trabalha-se só aquele departamento — contexto pequeno, barato e focado. Cada cargo escreve
o seu artefacto em `_boardroom/`.

**Uma sessão para o MEO.** Invoca `/meo-conselho`, que lê o scorecard e os artefactos e entrega
**uma página**: o que mudou, no máximo três excepções e no máximo uma decisão.

As sessões **não** falam umas com as outras — nem precisam. O barramento é o disco: o ledger, o
`scorecard.json` e a pasta `_boardroom/`. É assíncrono, auditável e custa zero.

## As três regras que fazem isto funcionar

1. **Evidência ou `n/d`.** Nenhum cargo gera um número: lê os que o motor mediu.
2. **Hub-and-spoke.** Os cargos falam com o MEO, nunca entre si.
3. **Silêncio é sucesso.** Um cargo que reporta todos os dias sem excepção nenhuma está a treinar
   o MEO a ignorá-lo.

## Instalação

As skills vivem no repo (`skills/`) e são embaladas no plugin (M3). Enquanto o plugin não sai,
podem ser copiadas para a pasta de skills do Cowork/Claude Code.
