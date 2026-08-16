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

As skills vivem em **`.claude/skills/`**, que é o directório que o `/mooter-update` sincroniza
para `~/.claude/skills/`. Não é uma preferência de arrumação: uma skill em `skills/` é
versionada, revista, documentada — e **nunca instalada em máquina nenhuma**. Estas sete
estiveram assim desde que nasceram, porque este ficheiro dizia "podem ser copiadas" e ninguém
copiou. Canónica e morta é pior que ausente, porque parece feita.

`npm run skills:doctor` mapeia as moradas e denuncia órfãs e colisões de nome.
