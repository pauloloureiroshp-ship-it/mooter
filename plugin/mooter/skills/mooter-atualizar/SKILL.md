---
name: mooter-atualizar
description: Actualiza o payload do Mooter pelo canal do entitlement, com assinatura Ed25519 verificada e rollback. Mostra canal, versão e o estado da assinatura. Usar quando o Paulo disser "/mooter-atualizar", "actualiza o mooter", "há versão nova?", "volta atrás na actualização", ou depois de um release.
---

# /mooter-atualizar

Corre `mooter update` e mostra **o recibo verbatim** — canal, versão, e o
estado de cada passo. Nunca parafraseies o resultado nem inventes a versão.

## O que correr

| Pedido | Comando |
|---|---|
| «há versão nova?» / verificar sem aplicar | `mooter update --check` |
| «actualiza» | `mooter update` |
| «volta atrás» / algo partiu depois do update | `mooter update --rollback` |

## O que mostrar sempre

As três coisas que decidem se a actualização é de confiança, e por esta ordem:

1. **Canal** — e de onde veio. `entitlement` significa que a conta o escreveu;
   `omissao` significa que este device não tem conta (é o caso normal do Free);
   `recusado` significa que havia um entitlement e não servia — diz porquê.
2. **Versão** — a instalada e a do manifesto.
3. **Assinatura** — `✓` ou a razão exacta da recusa.

## Recusas, e o que dizer a cada uma

| Código | O que dizer |
|---|---|
| `sem-rede` | «Sem rede não consigo procurar actualizações. Tento outra vez quando houver.» Não é um erro — não dramatizes. |
| `sem-ancora` | «Este cliente não traz chave pública de release, por isso nenhuma actualização pode ser verificada — e nenhuma é aplicada.» Isto é **deliberado**, não uma avaria. |
| `assinatura-invalida` | «Actualização recusada: a assinatura não corresponde ao conteúdo.» Se já tinha trocado, diz «Actualização revertida». |
| `canal-trocado` | «Recusado: pedi o canal X e a origem serviu um manifesto do canal Y.» |
| `sha-diferente` | «O ficheiro descarregado não é o que o manifesto assinado descreve.» O payload vivo não foi tocado. |
| `origem-recusou` | A origem respondeu com um código de erro. Diz qual. Não é o mesmo que estar sem rede. |

## Caveats honestos

- **Nada é aplicado sem assinatura verificada.** Se te apetecer sugerir um
  `--force`, não existe, e não deve existir: um updater que aceita "aplica na
  mesma" não é um updater verificado.
- **O canal nunca vem do `profile.json`.** Vem do entitlement, escrito só pelo
  serviço de conta (ADR-onboarding-v2, D4). O `profile.json` é auto-declarado
  pela própria máquina, e o canal decide que código corre nela.
- **`mooter update` já não re-executa o `install.sh`.** Até 2026-09-10 fazia
  isso, e o instalador voltava sempre ao canal por omissão — quem escolhia
  `beta` perdia-o no primeiro update, sem erro nenhum.
- **Nunca digas um número de poupança.** Vale aqui a mesma regra da skill
  `mooter`.
