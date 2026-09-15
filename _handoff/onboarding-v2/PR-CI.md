## A CI era cega a PRs empilhados

Onze dos doze workflows com `pull_request:` traziam `branches: [main]`. Num `pull_request`, esse
filtro é sobre a **base** do PR — não sobre o branch de trabalho.

| PR | base | checks | alguma suite correu? |
|---|---|---|---|
| #491 | `main` | **15** | ✅ router · landing · launcher · design · packages/cli |
| #492 | `feat/onboarding-v2-w0` | 9 | ❌ |
| #493 | `feat/onboarding-v2-w1` | 9 | ❌ |
| #496 | `feat/onboarding-v2-w2` | 9 | ❌ |
| #497 | `feat/onboarding-v2-w3` | 9 | ❌ |

Nos quatro empilhados, **nem um dos 9 checks era um teste** — eram `ratchet`, `segredos` e Vercel.
No branch da W3.5 as únicas workflows que chegaram a arrancar foram `no-frugal ratchet` e
`slack-spike tests`.

## E não foi só perder cobertura: um defeito escondeu o outro

O espelho do `test-skip.yml` foi partido pelas W2/W3 — dois `paths:` novos no `test.yml`
(`packages/launcher/**`, `tools/cli/**`) sem o par cá.

O teste que apanha exactamente isso — `workflows-parseiam.test.mjs` — estava **vermelho
localmente** e **não reprovou PR nenhum**, porque a workflow que o corre não chegava a arrancar.

A guarda existia. Estava certa. E era **inalcançável**.

## O que muda

Sai o `branches:` do `pull_request` das **oito** workflows de verificação: `test`, `test-skip`,
`landing-test`, `design-gate`, `security`, `docs-hygiene`, `wave-gate`, `lp-trust`. Passam a correr
em qualquer base; os `paths:` continuam a decidir **se** há algo a correr.

O `push:` fica como estava (`[main]`). Não se quer CI a cada push de cada branch pessoal — o que
estava errado era o gatilho do **PR**, não o do push.

**Ficam de fora, de propósito:** `benchmark` e `latency` gastam minutos a sério, e `claude-review`
gasta modelo. Alargar essas seria trocar um problema de cobertura por um de custo.

## `test.yml` e `test-skip.yml` mudam em lockstep

Se um correr numa base e o outro não, os checks obrigatórios ou ficam **por reportar** (PR
bloqueado para sempre — foi o #283, um fix de uma linha no README) ou são reportados **a verde sem
nada ter corrido**. A segunda é pior, e é precisamente o que esse par de ficheiros existe para
evitar. Há teste para eles não divergirem.

## Guardas novas

Em `tools/cockpit/runner/workflows-parseiam.test.mjs`:

1. as oito de verificação **não podem voltar** a filtrar a base do PR;
2. o `test.yml` e o `test-skip.yml` **não podem divergir** no gatilho.

**Mordida verificada:** repondo `branches: [main]` no `design-gate.yml`, a suite passa de 5/5 a
4/5 e **nomeia o ficheiro**. Reposto a seguir.

## Porque é um PR separado, com base `main`

Num `pull_request`, o GitHub decide se corre uma workflow lendo o `on:` do ficheiro **na base**.
Logo esta correcção não tem efeito nenhum enquanto viver só nos branches empilhados: **tem de
estar em `main`** para os #492–#497 passarem a ser testados.

É por isso que não foi junto com eles — e é por isso que este deve entrar primeiro.

## Portões

- ✅ `workflows-parseiam.test.mjs`: **5/5**
- ✅ Nenhum ficheiro de produto tocado — só gatilhos de CI e um teste
- ✅ `classify.js` não tocado

## O que se espera a seguir

Assim que isto estiver em `main`, os #492–#497 passam a correr as suites no próximo push. É
expectável que apanhem duas coisas já conhecidas:

- o **espelho partido** do `test-skip.yml` (fix já preparado para o cimo da pilha);
- o **`npm audit`** HIGH, que é dívida pré-existente de `main` e está registada em
  `_handoff/onboarding-v2/DEFEITOS.md` (W1-D2).

Ambas eram invisíveis até agora. Isso é o sistema a funcionar, não a piorar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCFBbpAPoAQyZ45iF1VJbM
