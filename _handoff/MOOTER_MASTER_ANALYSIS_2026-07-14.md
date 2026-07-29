# 🐮 MOOTER — Master Analysis: arquitetura total × benefício real × SOTA × advogado do diabo
**2026-07-14 · Cowork** · Fontes: repo (`SYSTEM_DESIGN.md` v2 07-06 · `MOOTER_ARCHITECTURE.md` 07-04 · `PERFECT_HANDOFF_SPEC.md` 07-10 · `TIER_USAGE_REAL.md` · `MOOTER_PERF_VALIDATION.md` 06-27) + Notion (North Star 07-13 · Arquitectura & Modelo Quantitativo 07-02) + web ao vivo. **Vault: NÃO auditado — pasta não conectada** (path certo: `C:\Users\Paulo Loureiro\paulo-vault`).
**Régua:** nenhum número inventado; medido ≠ estimado, sempre separado.

## 1. A arquitetura total, órgão a órgão → pilar que serve

| Órgão (código real) | O que faz | Pilar | Estado honesto |
|---|---|---|---|
| `classify.js` FROZEN (sha CI) | regex <50ms, $0 → T0-T3 | Route | 🟢 o mais maduro; 83.3% acc no bench N=12 |
| decide-agent/TES + Graphify + fable-5-routing (`packages/router`) | melhor modelo no tier · barato-primeiro-escala-se-preciso | Route | 🟡 implementado; adaptive-learner opt-in em PR (#239) |
| Ollama T0 + Overclock + fleet (`_handoff/fleet`, gpu-stream) | GPU própria = mão-de-obra $0; 206-242 tok/s warm medidos | Route/Watch | 🟢 medido; flicker-fix provado |
| Ledger + Perfect Handoff (`handoff-journal.js`, reducer) | proveniência mecânica; handoff = projeção do ledger, qwen só guarnição | **Resume** | 🔴 PARCIAL — 5 gates P1 abertos (lock SYNC, writers bypassam reducer, `--force` salta SHA…) = spine B-F |
| Savings Tracker (`:7821`) + pricing.js SSOT | counterfactual vs all-Opus; guaranteed ≠ advisory | Watch | 🟢 metodologia rara no mercado |
| Cockpit VS Code (`packages/vscode-extension`) | 5 abas + MEO + Live Preview | Watch/Review | 🟡 v0.16.66 em main; **8 testes só** (o 1035/1035 era do CLI) |
| Hub CF Workers/D1 + landing Vercel/Supabase | telemetria anón agregada + site | — | 🟡 configurado; 7 testes bloqueados por dep local; ⚠ arbiter Haiku × copy de privacidade (P0) |
| Adaptive/Pastor/Forge/Hub federado | aprende de ti · de todos · treina-se | Route⁺ | 🟡 loop existe; **ganho de routing nunca provado** (bench OOD: DOMINATED) |
| Council (packages/council) | comité multi-modelo | — | 🔴 1.7/5, advisory; branches −84k = arquivar |
| MCP server, workflow engine, sessions/spawn/worktree-conductor, data-rights, transparency… (18 packages) | infra diversa | vários | 🟡 amplitude alta, manutenção alta — ver ataque D5 |

## 2. Onde está o benefício — números REAIS (datados) vs referência de mercado

### 2.1 Custo por token (o benefício PROVADO)
| Evidência | Número | Data |
|---|---|---|
| Sessão real "Mooter auditou Mooter" | $2.04 vs $11.78 counterfactual = **82.7%** | 06-06 |
| Dashboard live | $25.95 poupados / 658 calls = **47%** | 06-08 |
| Dia real statusline | $2.51/dia, 84% vs all-Opus, **70% dos turnos local** | 06-01/04 |
| Bench v2 (N=12, reprodutível) | **40.7% do custo all-Opus** (−59.3%), a 4.7pp do Oracle | 06-27 |
| Distribuição real de tiers (2063 decisões) | T0 21% · T1 32% · T2 7.5% · T3 39% | 06-10 |
| Envelope honesto declarado | **65-82%** vs all-Opus (não os 95% dos blogs) | SYSTEM_DESIGN §0 |
Referência de mercado: all-Opus ≈ $11/M vs roteado ≈ $1.7/M (~85%) — os números internos batem na faixa. ✅ Benefício real, medido, com metodologia separando guaranteed/advisory.
⚠️ Advogado do diabo embutido: ~2/3 da poupança vem de 2 alavancas simples (T0 local + Haiku no trivial). E o preço cloud por token CAI todo trimestre → **o fosso de custo erode com o tempo; é wedge, não moat**.

### 2.2 Tempo economizado por handoff perfeito (o benefício MAIOR — e ainda NÃO medido)
- Referência de mercado: 23 min p/ recuperar foco por interrupção (Gloria Mark/UC Irvine); 5-10 retomas/dia → **2-3 h/dia** potenciais.
- Interno: **zero medição**. Não existe métrica time-to-first-action no Ledger. O spec do Perfect Handoff define a régua certa ("handoff sozinho devolve controlo em 30s") mas o status é PARCIAL.
- Consequência estratégica: o custo/token erode; **o tempo NÃO erode** (nenhum preço de API devolve as tuas horas). O benefício comerciável nº1 é o Resume — exatamente a conclusão do North Star. Esta análise CONFIRMA a inversão de prioridade.
- 🔧 Ação: instrumentar `time_to_first_action` + `resumes/dia` no Ledger (entra no North Star F1; o teste do amigo F0.5 cronometra a versão humana).

## 3. Confronto SOTA (web ao vivo, 07-14)

| Prática SOTA 2026 | Mooter | Veredito |
|---|---|---|
| Orquestração determinística (MS lançou "Conductor" em maio/26; padrões Azure) | classify determinístico + doutrina > configuração | ✅ alinhado ANTES do mercado — e atenção: MS usa o nome "Conductor" (colisão com o nosso) |
| Isolamento por worktree como default (Agents window nativa) | doutrina existe mas foi violada na prática (17 sessões/1 árvore) | 🟡 doutrina certa, disciplina só agora (V2.1 F7) |
| Event-sourcing como verdade do estado do agente | Ledger + projeções + replay byte-idêntico (alvo) | ✅ desenho certo, 🔴 implementação PARCIAL (5 P1) |
| Routing: "Agent-as-a-Router" (arxiv 06/26), RouterBench como régua | bench próprio já usa Oracle/BestSingle/Random/all-Opus | ✅ metodologia em linha |
| Contabilidade honesta de custo | guaranteed ≠ advisory, counterfactual | ✅ **à frente do mercado** (raro) |
| Comité multi-modelo: evidência fraca vs single-model+harness bom | Council 1.7/5, advisory | ✅ a decisão de arquivar é a SOTA |
| Testes como gate de agente | CLI 1000+; **plugin 8** | 🔴 atrás — F0 North Star corrige |

## 4. Advogado do diabo — os 6 ataques à arquitetura total

**D1 · "O moat de custo derrete."** Preços cloud caem; concorrentes copiam roteamento básico num fim de semana. Defesa real: o que NÃO derrete — Resume (tempo), dataset privado de decisões, doutrina de honestidade. → Investimento deve migrar de Route (maduro) p/ Resume (quebrado). CONFIRMA North Star.
**D2 · "Learns forever é promessa, não propriedade."** O loop de aprendizagem existe, mas nenhum bench provou que o routing MELHOROU com o uso (OOD: DOMINATED, 05-24). Ou se prova com A/B datado (adaptive on/off), ou o slogan vira passivo de honestidade. → Gate: #239 só liga default-on com prova.
**D3 · "Arquitetura de 10 pessoas, empresa de 1."** 18 packages + hub + landing + fleet + LoRA + MCP + council. Cada órgão não-core cobra manutenção (os 7 testes do hub já quebraram por dep). → Cada órgão ganha um status explícito: `core | frozen | parked` no MOOTER_ARCHITECTURE.md §1; parked não recebe wave até o core (5 pilares) fechar.
**D4 · "Acoplado à 4090."** Sem GPU: T0 some, fleet some, compressão some — e o teste do amigo VAI bater nisso. A degradação graciosa existe no papel; nunca foi provada num laptop sem CUDA. → F0.5 inclui 1 máquina SEM GPU dedicada.
**D5 · "O Resume depende do órgão mais quebrado."** O pilar nº1 comercial (Resume 60s) projeta-se do Ledger — que tem 5 P1 abertos. Qualquer demo antes do spine B-F fechar arrisca um Resume que mente = suicídio da marca-honestidade. → Ordem inegociável: spine → Resume. (Já é a ordem do V2.1.)
**D6 · "Privacidade: a copy trai a arquitetura."** Preview local + Context Bridge + arbiter Haiku vs "nunca sai da máquina". Um post viral hostil quebra a única marca que temos. → wave PRIVACY ≡ North Star F0, antes de qualquer distribuição (inclusive o amigo? mínimo: arbiter OFF por default no build que o amigo instala).

## 5. Veredito sobre o masterprompt V2.1

**Estrutura: NÃO muda.** A análise confirmou a espinha (F1 snapshot → F1.5 tese → F2 spine → … → North Star F0-F5) e o advogado do diabo confirmou as 3 emendas de sócio. Emitir V2.2 agora seria churn de versão — o próprio vício que estamos curando. **3 notas aditivas** (o CC lê este doc junto com o V2.1; não reescrever o masterprompt):
1. **F0.5**: incluir 1 máquina SEM GPU no teste do amigo (mata D4) e cronometrar time-to-first-action manual (baseline do Resume).
2. **F5**: além da keep-list ≤6, o output inclui a coluna `core|frozen|parked` por órgão em `MOOTER_ARCHITECTURE.md §1` (mata D3; 1 linha por órgão, mesma PR).
3. **F7**: +1 drift check — "claim-vs-prova": `learns forever` e qualquer % de poupança público só aparecem com evidência datada linkada (mata D2/D6 na raiz).
Pendências de decisão (Paulo): arbiter default no build do amigo · nome "Conductor" (MS colidiu — renomear o nosso worktree-conductor?) · vault Add folder.

## 6. O gap desta análise
Vault não conectado (deliverables de 13-07 "a colocar" continuam órfãos) · números de savings têm ~5 semanas (re-medir pós-fundação com `perf-validate.js`) · velocidade cloud = estimada (sem key de streaming na máquina, declarado no perf doc).
