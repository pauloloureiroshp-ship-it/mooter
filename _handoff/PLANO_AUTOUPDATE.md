# Actualização silenciosa do conector — o plano
**Data:** 2026-07-27 · **Problema:** actualizar o Mooter custa cliques, um diálogo do Desktop que
fica pendurado, e um `aplicar` que estoura o timeout. **Decisão do MEO:** automático e silencioso.

---

## 1. O que está realmente a acontecer (factos, não suposições)

| Sintoma | Causa encontrada |
|---|---|
| "Não vejo o botão Actualizar" | Ele **existe** (`fleet-ui.html:543`) mas só aparece quando o painel, naquele render, já detectou versão nova. E, pior: **não instala** — escreve um pedido na conversa (`say(...)`) para o modelo executar. Um botão que pede a outra pessoa para carregar no botão. |
| "Pede para attach vários .js e o último (sessao) fica parado" | O `aplicar` **reescreve os ficheiros dentro da pasta da extensão instalada**. O Claude Desktop deteta a alteração e abre o seu próprio diálogo de confirmação, ficheiro a ficheiro. Nós causamos o diálogo; ele não é opcional enquanto escrevermos ali. |
| "`aplicar` dá erro de timeout" | É síncrono: faz backup de toda a pasta + escreve 32 ficheiros. Passou dos 30 s do host quando o bundle cresceu. Antes completava apesar do erro; na v1.20.0 **deixou de completar**. |

**A raiz é uma só: estamos a escrever no sítio errado.** A pasta da extensão pertence ao Desktop —
mexer nela é pedir para ele reagir.

---

## 2. A correcção: o runtime sai da pasta da extensão

O que vai dentro do `.mcpb` passa a ser um **carregador fino** que não muda quase nunca. O código
real vive em `~/.mooter/runtime/<versão>/` — uma pasta nossa, onde podemos escrever à vontade.

```
ANTES                                  DEPOIS
extensão/server/*.js  ← reescrito      extensão/server/loader.js  ← nunca muda
  ⇒ Desktop reage, diálogo, cliques      └─ carrega ~/.mooter/runtime/1.21.0/*.js
                                            ⇒ escrita numa pasta nossa: sem diálogo
```

**Regras de segurança do carregador:**
- Se `~/.mooter/runtime/<versão>/` não existir ou não carregar, **cai para o código embutido** no
  próprio bundle. Nunca fica sem servidor.
- Só carrega uma versão que tenha passado a mesma verificação que o `aplicar` já faz hoje
  (manifest legível, todos os `require` satisfeitos, sintaxe de cada ficheiro).
- A versão activa fica registada em `~/.mooter/runtime/activa.json` — rollback é trocar uma linha.

---

## 3. Os quatro passos, por ordem

| # | Passo | O que resolve | Risco |
|---|---|---|---|
| **1** | **`aplicar` assíncrono** — devolve `{estado:'a instalar'}` de imediato e escreve em segundo plano; o `ver` e o painel reportam a conclusão | O timeout de 30 s | Baixo — é só inverter quem espera |
| **2** | **Runtime fora da extensão** (carregador + `~/.mooter/runtime/`) | O diálogo do Desktop e os cliques | **Médio** — muda o modelo de distribuição; exige o fallback do §2 |
| **3** | **Auto-update ao arrancar** — se houver bundle mais recente e verificado, instala sozinho e escreve uma linha no resumo do painel. Desligável em `preferences.json → auto_update:false` | O trabalho manual todo | Baixo, com o passo 2 feito |
| **4** | **Botão que instala mesmo** — o botão do painel passa a executar em vez de escrever um pedido na conversa; e um aviso persistente "reinicia para activar" enquanto o processo em memória for antigo | O botão que não faz nada | Baixo |

⚠️ **O que isto NÃO resolve, e é honesto dizê-lo:** o processo em memória continua a ser o antigo
até reiniciares o Desktop. Nenhum MCP se reinicia a si próprio. O que muda é que o reinício passa a
ser **a única coisa** que tens de fazer — hoje são cliques, um diálogo e um submit manual.

---

## 4. Ordem recomendada e porquê

**Passo 1 primeiro** (uma tarde): é isolado, corrige o erro visível e não mexe em distribuição.
**Passo 2 a seguir**, com o fallback bem testado — é a mudança que apaga o diálogo do Desktop, que
é a tua dor principal. **Passos 3 e 4** vêm quase de graça depois do 2.

Antes do passo 2 quero uma coisa medida: **confirmar que o diálogo desaparece mesmo** quando
escrevemos fora da pasta da extensão. Não vale a pena reestruturar a distribuição com base numa
teoria minha — faz-se uma prova pequena primeiro (escrever um ficheiro em `~/.mooter/runtime/` e
ver se o Desktop reage), exactamente como fizemos com o `ui-probe` e com as capacidades MCP.
