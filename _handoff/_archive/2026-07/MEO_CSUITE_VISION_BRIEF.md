# 🐮 Visão "C-Suite de Um" — o Mooter como executivo completo do vibe coder solo
> Brief Cowork 2026-07-08 · nasce da insatisfação do Paulo com o nome "Director's Cut" (metáfora
> de cinema, difícil de entender) + da ideia MEO (Moo Executive Officer). Estado: CONCEITO para
> decisão no gate F5 da wave Director's Cut v2 — NÃO altera nada do que o CC constrói em F2-F4.

## 1. A visão (nas palavras do Paulo, estruturada)
O Mooter entra para facilitar radicalmente a vida do vibe coder e assume os papéis de C-level de
uma empresa — CEO, CTO, CMO, COO, CFO — **para uma empresa de UMA pessoa**, num único modo de
visualização. Não é um dashboard: é a leitura executiva que um solo founder teria se tivesse uma
equipa de executivos a reportar-lhe.

**Ligação com o existente:** é a evolução do CTO Command Deck (vault/memo 2026-07-03, "command
deck de vibe coder solo + IA de CTO") de UM cargo para a C-suite inteira. Mesma tese da missão
vibe-coder: poder do CC sem fardo operacional; MC = bater-o-olho-e-saber.

## 2. Porque a wave actual JÁ constrói isto (sem saber)
As lentes do Director's Cut v2 mapeiam 1:1 para papéis executivos — o rename é rótulo, não código:

| Lente (F2, em construção) | Papel | Pergunta executiva que responde | Fonte honesta |
|---|---|---|---|
| LLM/custos (`byModel`) | **CFO** | quanto gastei (~est), poupança vs all-Opus, % local $0 | decisions.log + pricing.js |
| Fleet (`fleet`) | **COO** | que operações correm em paralelo, o que está em repouso | fleet-heartbeat + STATE.json |
| Rotas/modelos (`decisions`+exec) | **CTO** | que cérebro executou o quê (ops reais vs rotas) | execution.log + decisions.log |
| Stream + Dia (`byDay`) | **Chief of Staff** | o que aconteceu, quando — o diário da empresa | file-bus events |
| Auto-journal (F4) | **Board minutes** | resumo vivo da sessão, $0 local | handoff-rollup (qwen) |

## 3. O problema do nome — advogado do diabo (2026-07-08)
- **"Director's Cut"** ❌ — metáfora de cinema que só faz sentido dentro do tema 🎬 do Live
  Preview; falha o teste "vibe coder de primeira viagem entende sem explicação?".
- **"MEO"** ⚠️ — conceito forte, sigla problemática:
  1. 🔴 Colisão de marca: MEO = marca única da Altice Portugal para todas as operações telecom
     (confirmado web 2026-07-08: en.wikipedia.org/wiki/MEO_(telecommunication_company);
     telecompaper "Altice Portugal adopts Meo brand for all operations"). Em mercado lusófono,
     "MEO" já tem dono mental. Verificar marca registada antes de QUALQUER uso público.
  2. 🟡 Em EN lê-se ~"meow" (gato) — trai o brand 🐮.
  3. 🟡 Sigla opaca sozinha — precisa de tagline, o mesmo defeito do nome actual.
  4. 🟡 Honestidade: "Executive Officer" sobre um feed de logs é overclaim HOJE; o nome só fica
     honesto quando as lentes F2 derem leitura executiva real. Timing: decidir no gate F5.

## 4. Candidatos (para o gate F5 — decidir com as lentes visíveis, testar com 2-3 amigos)
| Candidato | Prós | Contras |
|---|---|---|
| **Moo-Suite** (trocadilho C-suite) | auto-explicativo com chips CFO/COO/CTO visíveis; mantém MOO; EN-friendly | trocadilho pode envelhecer |
| **Chief Moo Officer (CMO0/"o Chief")** | persona única 🐮 que "apresenta" as lentes; casa com a vaquinha animada (F3) | CMO colide com Chief Marketing Officer |
| **Boardroom** | claríssimo, executivo, 1 palavra | perde a vaca; genérico |
| **Exec Deck** | curto, casa com "Command Deck"/"Mission Control" já existentes | seco, sem alma |
| **MEO** (original) | fiel à ideia do Paulo; memorável | riscos §3 |

**Recomendação Cowork:** usar **"C-Suite de Um" como nome da VISÃO** (interno/estratégia) já;
escolher o rótulo do UI no gate F5, com teste rápido de compreensão (mostrar screenshot a 2-3
amigos vibe coders: "o que achas que isto faz?"). Guard: rename = 1 string de UI + docs; os
identificadores de código (renderDirectorsCut etc.) NÃO se renomeiam nesta wave (churn sem valor
para o utilizador; fica para uma wave de higiene se algum dia doer).

## 5. O que NÃO fazer agora
- ❌ Não interromper/renomear nada na wave F2-F4 do CC (churn + risco de quebra a troco de rótulo).
- ❌ Não anunciar "MEO" publicamente antes de verificação de marca.
- ❌ Não deixar o nome inflar o copy além do que os dados sustentam (régua: honesto > bonito).

## 6. Próximos passos
1. 🔜 Gate F5 da wave: decidir rótulo com screenshots reais + teste de compreensão.
2. 🔜 Se a visão C-Suite ganhar tracção: expandir cada lente para "relatório executivo" com
   recomendações accionáveis (ex.: CFO sugere "80% dos teus T2 cabiam em T0 local — liga o moo X")
   — isso sim justifica o nome executivo, e vira wave própria pós-DCv2.
3. 🔜 Registar a decisão final no vault (20-decisions) + Notion HQ quando tomada.
