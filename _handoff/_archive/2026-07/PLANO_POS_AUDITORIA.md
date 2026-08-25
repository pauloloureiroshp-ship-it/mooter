# Plano pós-auditoria UX — o que a auditoria destravou
**Data:** 2026-07-27 · **Auditoria:** `HANDOFF — AUDITORIA UX MOOTER (11:06 UTC)`
**Estado:** conector **1.21.0 instalado** (era 1.19.0) · gate desbloqueado

---

## 0. O que a auditoria fez aparecer, e que ninguém procurava

A auditoria parou na Fase 1 e, ao fazê-lo, desenterrou **três bloqueios** que nenhuma sessão de
desenvolvimento teria encontrado — porque só aparecem quando se tenta instalar a sério.

### 0.1 🔴 BUG DE TIJOLO — o verificador rejeitava os nossos próprios ficheiros

O `verificar()` da v1.21.0 (escrito **hoje**) passou a compilar com `vm.Script(Module.wrap(...))`,
que **não remove o shebang**. Como `server.js`, `server-apps.js` e `fleet.js` começam com
`#!/usr/bin/env node`, o resultado foi:

```
erro de sintaxe em server/server-apps.js: Invalid or unexpected token
erro de sintaxe em server/server.js:      Invalid or unexpected token
erro de sintaxe em server/fleet.js:       Invalid or unexpected token
```

**Se a v1.21.0 tivesse sido instalada pelo caminho normal, recusaria todos os bundles seguintes —
incluindo o que corrigisse isto.** Uma actualização que se tranca a si própria por fora.

**Porque é que os 21 testes passaram:** usavam ficheiros sintéticos **sem shebang**. Um teste que
não usa o formato real não testa o caso real. ✅ Corrigido + teste `U22` que lê os ficheiros
**reais** do pacote (22/22).

### 0.2 🔴 A pasta da extensão não está onde toda a gente procura

Medido: a extensão vive em
`AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\Claude Extensions\local.mcpb.paulo-loureiro.mooter\server`
— o sandbox de **app empacotada** do Windows. Procurar em `AppData\Roaming\Claude` devolve **zero**.

Isto explica o `EPERM` que matou a wave `autoupdate-p1` e reforça o **passo 2 do plano de
auto-update**: mexer nesta pasta é mexer no território do Desktop.

### 0.3 ✅ Gate desbloqueado
`1.19.0 → 1.21.0` instalado por script, com backup de 26 ficheiros e verificação a passar.
**Falta só reiniciar o Desktop** para o processo carregar o código novo.

---

## 1. O diagnóstico central da auditoria (e concordo inteiramente)

> *"Onde o autor pensou no caso vazio, escreveu `null` + porquê. Onde não pensou, o inicializador
> `0` sobreviveu até ao ecrã."*

Não são duas doutrinas em guerra — é **uma doutrina certa com cobertura incompleta**. E por isso o
fix é mecânico, não filosófico.

---

## 2. As três ondas, por ordem (recomendação do auditor: L1 → L3)

### 🔴 L1 · Honestidade de dados — os 14 loopholes
**Porque primeiro:** não se constrói o recibo por cima de um ledger que reporta `cost_usd: 0` para
25 minutos de trabalho. O recibo herdaria a mentira.

| Grupo | Loopholes | Correcção mecânica |
|---|---|---|
| **Zeros que deviam ser `n/d`** | #1 `cost_usd:0` com 2 jobs sem medição · #2 `cloud_in/out:0` para 2 jobs reais · #3 painel contradiz `combustivel.codex` (24,8M tokens) · #4 dois valores para o mesmo número | **Proibir `0` como inicializador de agregado.** Somatório sem parcelas medidas = `null` + `porque` + `jobs_sem_medicao` |
| **`n/d` sem porquê** | #5 `local_share`, `quota_local_pct`, `modelo`, `tier_motor` | Todo o campo nulo passa a `{valor:null, porque}` |
| **Frescura** | #9 `live_preview` de -14,7 h · #10 `session_model` de -9,5 h | **`medido_em` + `fresco` por bloco** (ver §3) |
| **Aritmética e contagem** | #7 `arrastar` soma 100,1% · #8 `worktrees free:35` mas 37 com `busy:false` · #11 `duration_s:null` e `elapsed_s:613` no mesmo job | Arredondar o último para fechar em 100; uma só fonte para `busy`; uma só fonte para duração |
| **Ruído** | #6 blocos vazios · #12 `suspeitas:1` sem dizer qual · #13 "frota parada" com wave falhada · #14 stderr cru no painel | Bloco vazio desaparece; alerta traz o item; `active_wave` só se tiver job vivo; `coherence` filtra ruído de ambiente |

### 🟠 L2 · Legibilidade — o painel não cabe num ecrã
Medido: **≈30 KB** de JSON, com o `goal` de uma wave repetido **4×** (≈19.600 caracteres de
briefing duplicado) e os mesmos jobs em **3 representações**.

⚠️ Isto não é só estética: **o painel é injectado na conversa**. 30 KB são ~7.500 tokens **por
chamada** — o painel que mede o custo é ele próprio um custo escondido.

Correcção: `goal` aparece **uma vez** (`plans[].goal`), com os outros a referenciarem por `wave`;
truncar a 240 caracteres com `goal_completo_em`; uma só representação de jobs; alvo **<8 KB**.

### 🟢 L3 · O Recibo de Fecho (v1.22.0)
Reconstruir a wave que morreu. Só **depois** de L1 — senão o recibo herda os zeros.

---

## 3. A coisa que devia existir e não existe (a auditoria acertou em cheio)

**`medido_em` + `fresco: true|false` por bloco.** Metade dos erros não é número errado — é número
certo **de outra hora** servido como se fosse de agora. Um campo transversal mata a classe inteira:

```json
"live_preview": { "veredicto": {...}, "medido_em": "2026-07-26T20:24Z",
                  "fresco": false, "idade_h": 14.7 }
```

Regra: `fresco: false` ⇒ o painel mostra a idade ao lado do valor. Sem excepções.

---

## 4. O que já está certo — copiar, não reinventar

A auditoria identificou o padrão-ouro, e ele já existe no código:
`poupanca: {usd: null, base: "sem tokens locais medidos", estimativa: true}` ·
`capacidades` com `"ausência não prova falta de suporte"` ·
`pressao` com fórmula, referência, origem e `estimativa: true` ·
`reconciliado: "o ledger diz failed — o plano estava atrasado"`.

**L1 é estender este padrão aos campos que ficaram de fora.** Nada de inventar doutrina nova.
