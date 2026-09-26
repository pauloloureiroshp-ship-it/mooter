# Mooter P0 — instrumento (26/09/2026)

Pacote de trabalho do Cowork. Vive em `~/.mooter/p0/`, fora do git: o Cowork não escreve no repo. O Claude Code porta para `tools/p0/` no repo **depois** de uma ronda de adversário codex (ver `PLANO_P0_INSTRUMENTO_2026-09-26.md` no Project).

| Ficheiro | O que faz | Quando |
|---|---|---|
| `RUN-P0-MEDIR.bat` | Sonda + medição do histórico + janela do 60d, a partir dos transcripts do Claude Code | **Já.** De preferência com o Claude Code parado (evita CPU durante eventos do shadow) |
| `RUN-P0-TESTES.bat` | 23 testes com fixtures sintéticas em pasta temporária | Já |
| `RUN-POCOCK-INSTALAR.bat` / `-REMOVER.bat` | 5 skills do Matt Pocock no âmbito do utilizador | Já (ver nota do 60d) |
| `apos-05-10/` | Receptor OTel + bloco `env` para o `settings.json` | **Só depois do veredicto de 05/10** |

## O que o `medir-p0.mjs` mede

1. **Aderência ao `<router-hint>`.** Cada prompt humano cai numa de quatro categorias:
   - **já no tier:** o host já estava no tier recomendado;
   - **seguiu:** delegou ao subagente ou tier sugerido, ou correu o `router-execute`;
   - **delegou a outro:** delegou, mas não ao sugerido;
   - **ignorou:** não fez nada do que o hint pedia.

   Aderência = seguiu ÷ (seguiu + delegou a outro + ignorou). É por prompt, ao contrário do `compliance_pct` do savings-tracker, que é a moda por sessão com meio ponto para tiers adjacentes.

   **Precedência:** as delegações decidem primeiro. Um turno que delegou conta como *seguiu* (ao sugerido ou a um agente do tier recomendado) ou *delegou a outro*, mesmo que o host já estivesse no tier; *já no tier* é só para quem não delegou.

   **Atribuição:** hint e respostas ligam-se ao prompt pela cadeia `parentUuid`, em duas passagens por ficheiro, porque há hints gravados antes do seu prompt. Uma cadeia partida ou cíclica não conta (`fonte.hints_sem_dono`). Um turno aberto por `<task-notification>` ou por compactação é barreira (`fonte.hints_de_turno_nao_humano`). Só os transcripts sem `parentUuid` (formato antigo) caem na sequência. O `router-execute` conta quando é **invocado** com `node`; mencioná-lo, testá-lo ou lê-lo não conta.
2. **Tokens medidos.** Usage real da API gravado no transcript, por modelo, dia e âmbito (principal ou subagente), com leituras e escritas de cache. Um pedido = um `message.id`, ou o `requestId` quando falta (reconciliados assim que uma linha traga os dois). Fica o **máximo** de cada campo, porque o usage cresce ao longo das linhas do mesmo pedido.
3. **Custo de delegar.** Arranque a frio de cada subagente (input + escrita de cache do 1.º pedido, por tempo) e total, por tipo. Cópias do mesmo subagente contam como uma execução.

**Privacidade:** o medidor não guarda texto de prompts, respostas, comandos nem caminhos. Os ids de sessão e projecto só são contados. Modelos, versões e tipos de agente só saem com a forma esperada; o resto sai como `outro` (nunca um hash, que um dicionário reverteria). O receptor OTel grava só atributos de uma allowlist, e só com valores de um token (sem espaços, `@` nem caminhos). Só lê `~/.claude/projects/`.

**Limites:** um prompt só entra se tiver hint gravado, e prompts abaixo do gate de 0,6 não têm hint. O tier do host é o do 1.º pedido do turno. Tokens de subscription são quota, não fatura. A lista completa sai em `limites` no JSON.

**Testes:** `node --test tools/p0/test/*.test.mjs` com `HOME`/`USERPROFILE` temporários. Os `adversario-r1*.test.mjs` são um teste por ataque aplicado do adversário codex (`adversario-codex-r1.md`).
