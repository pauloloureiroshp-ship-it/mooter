# Best-in-class por domínio — Maio 2026

> Research para Mooter v2 / Pastor Alemão. Cobertura de 14 domínios que representam ~80% dos pedidos de um vibe coder solo. Dados extraídos da web em 2026-05-27. Números marcados "não verificado" quando a fonte não os confirmou de forma fiável.

---

## 1. Orquestração de agentes

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **LangGraph** | https://github.com/langchain-ai/langgraph | Graph-based state machines com durable execution + human-in-the-loop; ultrapassou CrewAI em stars no início de 2026, escolha enterprise para audit trails | MIT | Não tem MCP oficial; integra com MCP como tool consumer | Curva de aprendizagem alta (state machines), overkill para fluxos simples |
| **CrewAI** | https://github.com/crewAIInc/crewAI | Role-based agents, time-to-prod 40% mais rápido que LangGraph para workflows business; melhor DX inicial | MIT | Não, mas suporta MCP como tools | Reliability ~54% em complex tasks (vs 62% LangGraph) |
| **Anthropic Agent SDK** | https://code.claude.com/docs/en/agent-sdk/overview | Tool-use-first, agent loop minimalista; agentes podem invocar outros como tools; ecossistema com Skills + Plugins + MCP | Proprietária (Claude-bound) | Sim, nativo (é o SDK que orquestra Skills/MCPs) | Vendor-lock Anthropic; sem suporte multi-provider sem adapter |
| **OpenAI Agents SDK** | https://openai.github.io/openai-agents-python/ | Sucessor production-grade do Swarm; lowest latency porque liga functions nativas ao tool-calling do modelo; handoffs explícitos | MIT | Não nativamente, mas adapta MCP | Vendor-bias OpenAI; menos primitivas para state graph |
| **AutoGen / AG2** | https://github.com/ag2ai/ag2 | Conversational patterns mais diversos (debates, consensus); reliability 58%. AG2 é o fork comunitário após Microsoft pôr AutoGen em maintenance | Apache-2.0 | Não oficial | Microsoft moveu AutoGen para maintenance em 2026; futuro incerto |
| **Inngest AgentKit** | https://github.com/inngest/agent-kit | Multi-agent networks TypeScript com deterministic routing + MCP como tools; durable execution via Inngest workflow engine | Apache-2.0 | Suporte MCP first-class | Menos maturidade do que LangGraph; tied to Inngest runtime para durability |
| **BeeAI Framework (IBM)** | https://github.com/i-am-bee | Production-ready Python + TypeScript; built-in messaging + task coordination; backed por IBM | Apache-2.0 | Em desenvolvimento | Adoção ainda limitada fora da Red Hat / IBM enterprise |
| **AWS Strands Agents** | (parte do showdown 2026) | Novo entrant AWS, foco em durabilidade serverless | Apache-2.0 | Suporte MCP | Recente, comunidade ainda pequena |

**Mudou no último ano (Maio 2025 → Maio 2026):**
- OpenAI Swarm → substituído por production-grade Agents SDK
- Microsoft AutoGen → maintenance mode; comunidade migrou para AG2
- Consolidação visível: 6 frameworks dominam (Claude Agent SDK, Strands, LangGraph, OpenAI Agents SDK, CrewAI, AG2)
- LangGraph ultrapassou CrewAI em stars (não verificado o número exacto)

**Sources:**
- https://qubittool.com/blog/ai-agent-framework-comparison-2026
- https://www.buildmvpfast.com/blog/langgraph-vs-crewai-vs-autogen-vs-swarms-agent-framework-2026
- https://agentkit.inngest.com/overview
- https://code.claude.com/docs/en/agent-sdk/overview

---

## 2. MCP Registry / catálogo MCP

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Official MCP Registry (Anthropic)** | https://registry.modelcontextprotocol.io/ | Registry oficial Anthropic com ~2.000 servers catalogados; canónico para descoberta | MIT (protocolo) | É a fonte | Cobre só ~20% dos servers existentes (10k+ no total no ecossistema) |
| **anthropic/modelcontextprotocol/servers** | https://github.com/modelcontextprotocol/servers | Reference repo Anthropic; 7 servers actively maintained: Everything, Fetch, Filesystem, Git, Memory, Sequential Thinking, Time | MIT | Sim | Repo enxuto por design; quase tudo agora vem da comunidade |
| **PulseMCP** | https://www.pulsemcp.com/ | Maior directory comunitário: 15.930+ servers (não verificado o número exacto hoje); search e categorização | SaaS (free tier) | Catálogo, não server | Sem validação de qualidade automatizada |
| **Smithery** | https://smithery.ai/ | ~7.300 servers (não verificado); install one-click + hosted runtime | SaaS | Catálogo + runtime | Lock-in se usares o hosted runtime |
| **Composio** | https://composio.dev/ | 1.000+ toolkits / 20.000+ tools (não verificado); foco enterprise + auth managed | SaaS | Sim | Pricing menos amigável para indie devs |
| **GitHub MCP** | https://github.com/github/github-mcp-server | API GitHub completa via MCP: repos, issues, PRs, code search | MIT | Sim (oficial GitHub) | Rate limits do GitHub API |
| **Playwright MCP (Microsoft)** | https://github.com/microsoft/playwright-mcp | 2º MCP server mais popular (>30k stars segundo guias); browser automation production-grade | Apache-2.0 | Sim (oficial Microsoft) | Requer browser binary; não funciona em sandboxes mínimos |
| **Filesystem MCP (Anthropic)** | https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem | Acesso seguro sandbox a ficheiros locais; default em quase todo o setup | MIT | Sim (Anthropic) | Sem fuzzy search built-in |

**Top 20 (heurístico via PulseMCP + dev.to guides):** GitHub, Playwright, Filesystem, Postgres, Supabase, Notion, Linear, Slack, Brave Search, Sentry, Stripe, Figma, Memory, Sequential Thinking, Fetch, Time, Git, Puppeteer, Obsidian, Cloudflare.

**Sources:**
- https://registry.modelcontextprotocol.io/
- https://github.com/modelcontextprotocol/servers
- https://www.mcpbundles.com/blog/best-mcp-servers
- https://www.gentoro.com/blog/what-is-anthropics-new-mcp-registry/
- https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation

---

## 3. Skills marketplace

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **anthropics/skills** | https://github.com/anthropics/skills | Repo oficial com 17 Agent Skills open-source (Mar 2026); cobre design, docx, pdf, pptx, xlsx, etc. | MIT | Skills oficiais | Catálogo pequeno; sem auto-update mechanism |
| **SkillsMP** | https://skillsmp.com/ | Maior marketplace comunitário: 66.541+ skills (Jan 2026, não verificado hoje) | SaaS | Catálogo | Quality control variável (long-tail noisy) |
| **Claude Marketplaces (Plugins directory)** | https://claudemarketplaces.com/ | 6.700+ skills agregadas (não verificado) | SaaS | Catálogo | Sem rating/usage signals fiáveis |
| **claudeskills.info** | https://claudeskills.info/skills/ | Free downloads de skills curated; comunidade activa | Variada (per skill) | Catálogo | Discovery fraca, sem search semântica |
| **LobeHub Skills** | https://lobehub.com/skills/ | Catálogo categorizado, integração com LobeChat | SaaS / OSS | Catálogo + runtime | Foca em LobeChat, não Claude Code puro |

**O que mudou em 2025-2026:**
- Skills lançado em Outubro 2025; em ~7 meses o catálogo comunitário explodiu para dezenas de milhares
- Anthropic mantém o seu próprio catálogo pequeno (17 skills) e qualidade controlada
- Não existe ainda um "Skills Registry" oficial Anthropic equivalente ao MCP Registry — gap claro

**Sources:**
- https://github.com/anthropics/skills
- https://skillsmp.com/
- https://claude-world.com/articles/anthropic-official-skills-complete-guide/
- https://www.agensi.io/learn/best-ai-agent-skills-marketplaces-2026

---

## 4. Coding assistants

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Cursor** | https://cursor.com | Best polished AI IDE; multi-file editing com visual diffs (Composer) é o standard para refactors em codebases grandes | Proprietária / SaaS | Suporta MCP (cliente) | Pricing mudou para credits em 2025; pode ficar caro |
| **Claude Code** | https://code.claude.com/ | Terminal-first; integra git+terminal+editor sem mudar workflow; ecossistema Skills+Plugins+MCP nativo | Proprietária | Sim (host nativo) | Sem GUI integrada; tier-pricing recente (Agent SDK credits Jun 2026) |
| **Windsurf** | https://windsurf.com | Cascade (agentic mode) excellent para greenfield; free tier mais generoso pós-Cursor-credits | Proprietária / SaaS | Suporta MCP | Menos forte em codebases legacy |
| **Zed (AI)** | https://zed.dev | Editor em Rust; cold-start <0.5s, input latency <2ms; melhor para colaboração real-time | GPL-3.0 (editor) | Suporta MCP | Ecossistema de extensões pequeno vs VS Code |
| **Cline** | https://github.com/cline/cline | Extensão VS Code agentic, 58k stars (não verificado), Apache-2.0; melhor opção free completa BYOK | Apache-2.0 | Cliente MCP | Sem hosted runtime; tu pagas o LLM |
| **Aider** | https://github.com/Aider-AI/aider | CLI puro com git integration; 41k stars (não verificado); the OG terminal AI coding | Apache-2.0 | Cliente MCP | Sem GUI; setup inicial menos amigável |
| **Continue** | https://github.com/continuedev/continue | Pivot 2026: foco em quality control para AI-accelerated PRs (markdown rules + GitHub status checks); 31k stars (não verificado) | Apache-2.0 | Sim, primeira-classe | Já não é Cursor replacement directo |
| **OpenHands** | https://github.com/All-Hands-AI/OpenHands | Full agent platform; 68k stars (não verificado); melhor para autonomy completa | MIT | Suporta MCP | Pesado, requer infra própria |
| **GitHub Copilot** | https://github.com/features/copilot | Standard incumbent; usage-based AI Credits desde Jun 2026 | Proprietária | Suporta MCP (recente) | Menos agentic do que Cursor/Cline |

**Mudou no último ano:**
- Roo Code anunciou shutdown a 15 Maio 2026 (Extension, Cloud, Router) — recomenda Cline ou roomote.dev
- GitHub Copilot mudou para AI Credits a 1 Jun 2026
- Cursor mudou para credits em 2025
- Continue pivotou para quality-gate, não Cursor-alike

**Sources:**
- https://www.morphllm.com/best-ai-coding-agents-2026
- https://www.nxcode.io/resources/news/best-ai-code-editor-2026-cursor-windsurf-copilot-zed-compared
- https://openalternative.co/compare/continue/vs/roo-code
- https://artificialanalysis.ai/agents/coding

---

## 5. Animação web

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Motion (ex Framer Motion)** | https://motion.dev | Default React em 2026: declarativo, MIT (independente da Framer), ~32KB gzipped, sponsors top-tier (Figma, Tailwind, Sanity) | MIT | Não | Bundle maior do que GSAP core; pior em timelines complexos |
| **GSAP** | https://gsap.com | Industry standard 15+ anos; >100% free desde Webflow acquisition late 2024; ~23KB core | Proprietary free (Webflow, com restrição anti-competitive) | Não | Imperativo (curva para devs React-only); licença barra ferramentas que competem com Webflow |
| **Tailwindcss Motion** | https://github.com/romboHQ/tailwindcss-motion | 5KB, pure CSS; melhor para animações simples sem JS overhead | MIT | Não | Inadequado para timelines/interactivos |
| **Theatre.js** | https://www.theatrejs.com/ | Editor visual para sequências em código; useful para storytelling 3D/2D | Apache-2.0 | Não | Adoção pequena; learning curve |
| **Lottie (lottie-web / lottie-react)** | https://lottiefiles.com/ | Standard for JSON-driven motion graphics from After Effects | MIT | Não | Não é animação programática; depende de designer + AE |
| **React Spring** | https://www.react-spring.dev/ | Physics-based; bom para gestures naturais | MIT | Não | Bundle ~40KB; perdeu mindshare para Motion |

**Mudou:** Framer Motion foi rebrand para "Motion" (motion.dev) e separou-se financeiramente da Framer. GSAP tornou-se free pós-Webflow.

**Sources:**
- https://motion.dev/docs/gsap-vs-motion
- https://blog.logrocket.com/best-react-animation-libraries/
- https://www.annnimate.com/blog/gsap-vs-framer-motion-vs-react-spring

---

## 6. Diagrama / arquitectura visual

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Mermaid** | https://mermaid.js.org/ | LLM-familiarity massiva (GitHub renderiza nativo em README); first choice para PR-reviewable diagrams | MIT | Sim (várias implementações MCP) | Layout engine inferior ao D2; syntax mais arcano |
| **D2** | https://d2lang.com/ | Terrastruct's diagram language; layout automático Go-CLI, look "modern" out-of-the-box; ganha em estética | MPL-2.0 | Existe MCP server comunitário | Menos familiar aos LLMs (LLMs erram syntax mais frequentemente que Mermaid) |
| **Excalidraw** | https://excalidraw.com | Hand-drawn aesthetic; whiteboard real-time; export para SVG/PNG | MIT | Sim (excalidraw-mcp) | Não é diagram-as-code; perde versionamento limpo |
| **Eraser.io** | https://eraser.io | Docs + diagrams unificados, AI-generated diagrams in-workspace; tracção forte em 2026 para teams | SaaS | API existe; MCP não oficial | Proprietary; not free for teams |
| **draw.io / diagrams.net** | https://www.drawio.com/ | Standard free GUI tool; XML interno versionável | Apache-2.0 | Não | UX desktop datada; sem code-first |
| **Whimsical** | https://whimsical.com | UX favourite for flow + wireframe; AI generation built-in | SaaS | Não | Sem export para texto/code; lock-in |

**Veredito 2026:** Mermaid continua o default LLM-friendly (Pastor escolheria Mermaid by default). D2 ganha quando estética importa.

**Sources:**
- https://nimbalyst.com/blog/best-ai-diagram-tools-2026/
- https://aaronjbecker.com/posts/mermaid-vs-d2-comparing-text-to-diagram-tools/
- https://infrasketch.net/blog/top-7-architecture-diagram-tools

---

## 7. Spreadsheet AI

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Claude for Excel** | https://support.claude.com/en/articles/12650343 | GA desde 7 Maio 2026; opera Excel-nativo (pivots, formulas, formatting); citation clickables para células; MCP connectors para S&P, LSEG, FactSet, Moody's, PitchBook, Daloopa | Proprietary (Claude Pro/Max/Team/Enterprise) | Skill oficial Anthropic (xlsx); MCP connectors third-party | Só Pro+; só Windows/Mac Excel desktop |
| **SheetJS (community + pro)** | https://sheetjs.com/ | De-facto JS lib para read/write XLSX em browser e Node | Apache-2.0 (community) | Não oficial | Sem AI nativo; é primitive layer |
| **openpyxl** | https://openpyxl.readthedocs.io | Python standard for XLSX; integra com anthropics/skills xlsx | MIT | Skill xlsx usa | Performance pobre em files grandes (>100k rows) |
| **Excel MCP Server (community)** | https://github.com/keerthi/excel-mcp (vários forks) | Comunidade já construiu Excel MCP servers em 2026; permite Claude operar Excel out-of-Office | MIT | Sim (comunitário) | Maturidade variável |
| **Rows** | https://rows.com | AI-native spreadsheet SaaS; integração com Claude/GPT via prompt | SaaS | API; MCP não confirmado | Lock-in; not Excel-compat |
| **Equals** | https://equals.com | SQL-first spreadsheet for finance teams; tem AI integrations | SaaS | Não confirmado | Niche audience |

**Mudou:** Claude for Excel passou de beta para GA + add-ins Office completos (Word, Excel, PowerPoint) em Maio 2026. 6 novas skills financeiras lançadas (comp analysis, DCF, due diligence, teasers, profiles, earnings).

**Sources:**
- https://www.anthropic.com/news/advancing-claude-for-financial-services
- https://support.claude.com/en/articles/12650343-use-claude-for-excel
- https://medium.com/data-science-collective/i-connected-claude-to-excel-using-the-excel-mcp-server-heres-what-i-built-0872a2745c17

---

## 8. Code audit / segurança

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Semgrep** | https://semgrep.dev | Best SAST engine para customização; YAML rules learnable em 1 dia; 35+ languages GA; outperforma Snyk em SAST (EASE 2024 benchmark) | LGPL-2.1 (OSS) + SaaS | MCP comunitário existe | SCA mais fraco do que Snyk; UI menos polished |
| **CodeQL (GitHub)** | https://codeql.github.com | Unmatched depth para vulnerability research; treats code como queryable DB | Proprietary (free OSS, paid enterprise) | Não oficial | Curva QL alta; só free para OSS public repos |
| **Snyk** | https://snyk.io | Best SCA / dependency / container / IaC platform (Forrester Wave Leader Q4 2024); melhor cobertura cloud-native | SaaS | Snyk MCP (oficial, recente) | SAST inferior a Semgrep; pricing alto enterprise |
| **GitGuardian** | https://www.gitguardian.com | Standard para secrets detection em git history; pre-commit + ci | SaaS (free tier) | Não oficial | Foca apenas em secrets, não SAST geral |
| **Bearer** | https://www.bearer.com | Privacy + PII scanning; integra com Cycode | OSS-CLI + SaaS | Não | Niche (privacy compliance) |
| **Aikido** | https://www.aikido.dev | All-in-one cloud security para startups; SAST + SCA + IaC + secrets numa só dashboard | SaaS (free tier) | Não | All-in-one trade-off: nenhum top-class isolado |

**Recomendação prática 2026:** Semgrep (SAST) + Snyk (SCA) + GitGuardian (secrets) = "ouro padrão" para agentes que precisam audit pré-commit.

**Sources:**
- https://rafter.so/blog/static-code-analysis-tools-comparison
- https://konvu.com/compare/snyk-vs-semgrep
- https://www.getpanto.ai/blog/best-code-audit-tools

---

## 9. Knowledge / Second Brain / Third Brain

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Obsidian** | https://obsidian.md | Default PKM 2026; ficheiros locais markdown; 85+ MCP servers community (PulseMCP search) | Proprietary free | MCP comunitário forte (MegaMem, MCPVault, etc.) | Sem MCP oficial Anthropic; plugins variáveis |
| **Tana** | https://tana.inc | Supertags + structured nodes; Local API MCP oficial (requer Tana Pro) | SaaS Pro | Sim, oficial | Pricing alto; learning curve |
| **Notion** | https://notion.so | Notion MCP oficial Anthropic disponível; integração nativa Claude.ai | SaaS | Sim, oficial | Performance pobre em vaults grandes; not local-first |
| **Mem** | https://get.mem.ai | AI integration mais agressiva (auto-surfacing related notes) | SaaS | API mas MCP não oficial | Lock-in; sem export limpo |
| **Reflect** | https://reflect.app | Daily notes + Claude integration nativa | SaaS | Integração Claude (não MCP) | Niche audience |
| **Logseq** | https://logseq.com | Open-source local-first alternative to Roam; outliner | AGPL-3.0 | MCP comunitário | Menos plugins do que Obsidian |
| **Capacities** | https://capacities.io | Object-based PKM; AI built-in | SaaS | Não | Sem MCP; novo entrant |

**Veredito:** Obsidian + MegaMem MCP é a combinação mais flexível e local-first em 2026. Notion ganha para teams (MCP oficial). Tana ganha para fluxos estruturados.

**Sources:**
- https://github.com/C-Bjorn/MegaMem
- https://blakecrosley.com/guides/obsidian
- https://chatforest.com/guides/mcp-personal-knowledge-management-pkm/
- https://www.pulsemcp.com/servers?q=obsidian

---

## 10. Voice TTS

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Cartesia Sonic 3 / Sonic 3.5** | https://cartesia.ai | TTFA 75-90ms WebSocket; default low-latency 2026 para voice agents; ~$35/M tokens | SaaS | Não confirmado MCP oficial | Voice realism inferior a ElevenLabs flagship |
| **ElevenLabs v3 / Turbo / Flash v2.5** | https://elevenlabs.io | Best realism + voice cloning; ~75ms streaming Flash; multilingual líder | SaaS | MCP comunitário | Premium pricing (~$100/M v3) |
| **Hume Octave 2** | https://hume.ai | Best emotion expression; plain-English direction de delivery | SaaS | Não | TTFA 150ms (mais lento); $50-150/M |
| **OpenAI Voice (TTS-1, gpt-4o-mini-tts)** | https://platform.openai.com/docs/guides/text-to-speech | Best instructable character; standard integration | SaaS | Não específico | Latência média; menos vozes |
| **Resemble AI** | https://resemble.ai | Enterprise voice cloning + deepfake detection | SaaS | Não | Pricing enterprise |
| **PlayHT** | https://play.ht | Boa relação custo/qualidade; voice cloning rápido | SaaS | Não | Saiu da liderança 2024 |

**Default Pastor 2026:** Cartesia Sonic 3 para realtime conversational, ElevenLabs Flash v2.5 quando realism > latency.

**Sources:**
- https://cartesia.ai/vs/cartesia-vs-elevenlabs
- https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks
- https://sureprompts.com/blog/voice-generation-models-compared-2026

---

## 11. Image gen

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Recraft v3** | https://recraft.ai | ELO líder (1172 segundo fluxpro.ai, não verificado independentemente); best flat vector / icon / design output; produz SVG nativo | SaaS | Não MCP oficial; API REST | Inferior em fotorrealismo vs FLUX |
| **FLUX 1.1 Pro / Pro Ultra (Black Forest Labs)** | https://blackforestlabs.ai | Best photorealism: studio portraits, product shots, architectural; controlo via prompts literais | SaaS + open weights (FLUX.1 [dev]) | Replicate / fal.ai MCP comunitários | Mais lento (~15-30s) vs Imagen |
| **Google Imagen 3** | https://deepmind.google/technologies/imagen-3/ | Most balanced; text rendering accuracy + 3-5s generation; alto volume | SaaS Vertex AI | Não oficial Anthropic | Inferior em "art" puro |
| **Midjourney v7** | https://midjourney.com | King of aesthetics + artistic interpretation; hero campaign imagery | SaaS | Não oficial; só Discord/web | Sem API pública oficial; text rendering pobre |
| **SDXL Lightning + DALL-E** | https://platform.openai.com/docs/guides/images | DALL-E 4 para iteration sessions client-facing; SDXL Lightning para custo baixo | SaaS / OSS | Não | Quality stagnou vs FLUX/Imagen |

**Padrão "smart studio" 2026:** Imagen (volume + text) + Midjourney (hero) + FLUX (product) + Recraft (vector/design).

**Sources:**
- https://www.gradually.ai/en/ai-image-models/
- https://editorialge.com/midjourney-v7-vs-flux-1-1-pro-vs-dall-e-4/
- https://www.aimagicx.com/blog/tested-10-ai-image-generators-best-use-cases

---

## 12. Browser automation

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **Playwright + Claude** | https://github.com/microsoft/playwright-mcp | 92% reliability (top); melhor para deterministic + high-volume | Apache-2.0 | MCP oficial Microsoft | Não autonomous; tu escreves o script |
| **Browserbase + Stagehand** | https://github.com/browserbase/stagehand | Managed runtime + AI SDK (act/extract/observe); 89-90% reliability; melhor para AI actions cirúrgicas | MIT (Stagehand) / SaaS (Browserbase) | Stagehand MCP existe | Lock-in se quiseres managed |
| **Browser Use** | https://github.com/browser-use/browser-use | 92k stars (não verificado), de-facto OSS choice; full autonomous agent que planeia + navega | MIT | Sim, comunitário | Reliability inferior; Python-only |
| **Anthropic Computer Use** | https://docs.anthropic.com/en/docs/build-with-claude/computer-use | Pixel-based; cobre canvas + image-driven UIs onde DOM falha; nativo Claude | Proprietary | Sim, nativo | 78% reliability; mais lento; pixel cost |
| **OpenAI CUA (Computer-Using-Agent / Operator)** | https://openai.com/index/introducing-operator/ | Cloud-only OpenAI runtime; pixel-based como Anthropic | SaaS | Não MCP | 75% reliability; OpenAI lock-in |
| **Chrome MCP / Claude in Chrome** | https://www.anthropic.com/claude-in-chrome | Extensão Chrome Anthropic com browser tools nativos | Proprietary | Sim, nativo | Beta-ish; limited scope |

**Padrão "scales" 2026:** DOM-driven (Playwright/Stagehand) para 80%; vision-driven (Computer Use) só quando DOM falha.

**Sources:**
- https://www.nxcode.io/resources/news/stagehand-vs-browser-use-vs-playwright-ai-browser-automation-2026
- https://www.skyvern.com/blog/browser-use-vs-stagehand-which-is-better/
- https://dataresearchtools.com/best-headless-browser-frameworks-2026/

---

## 13. Sandbox / execução isolada

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **E2B** | https://e2b.dev | Purpose-built AI agents; Firecracker microVM; usado por "~half Fortune 500" (claim, não verificado); maior catálogo de templates | Apache-2.0 (SDK) + SaaS | E2B MCP existe (comunitário) | Sem GPU; max 24h sessions; sem BYOC |
| **Modal** | https://modal.com | Único onde sandbox pode ter GPU; ideal para inference/fine-tune dentro do mesmo isolated process | SaaS | Não oficial | Python-first; menos amigável fora-Python |
| **Daytona** | https://daytona.io | Cold-start 27-90ms (líder absoluto); pivot 2025 para AI sandbox infrastructure; safe untrusted code | SaaS + OSS | Não oficial | Catálogo de templates menor |
| **CodeSandbox SDK** | https://codesandbox.io/docs/sdk | VM-based; agora parte da Together AI; melhor para full-stack browser sandboxes | SaaS | Não | Latência maior que Daytona |
| **Vercel Sandbox** | https://vercel.com/docs/sandbox | Tight integration Vercel infra; bom para edge/Node | SaaS | Não | Vendor lock |
| **Northflank** | https://northflank.com | Self-host friendly; container-based | SaaS + self-host | Não | Não AI-specific |

**Decisão Pastor:** Daytona (latency-critical loops), E2B (Python iterative + templates), Modal (GPU side).

**Sources:**
- https://www.superagent.sh/blog/ai-code-sandbox-benchmark-2026
- https://modal.com/resources/best-code-execution-sandboxes-ai-agents
- https://www.startuphub.ai/ai-news/artificial-intelligence/2026/daytona-vs-e2b-vs-modal-vs-vercel-sandbox-2026

---

## 14. Awesome lists / repos públicos relevantes

| Tool / repo | Link | Por que best-in-class 2026 | Licença | MCP / Skill oficial? | Lacuna |
|---|---|---|---|---|---|
| **punkpeye/awesome-mcp-servers** | https://github.com/punkpeye/awesome-mcp-servers | Maior lista curated MCP (claim: 400 servers + ~1M stars agregados, não verificado); referência mainstream | CC0 / MIT-equivalent | Catálogo | Manual curation; nem tudo testado |
| **wong2/awesome-mcp-servers** | https://github.com/wong2/awesome-mcp-servers | Alternativa segunda mais citada | MIT | Catálogo | Menos abrangente que punkpeye |
| **tolkonepiu/best-of-mcp-servers** | https://github.com/tolkonepiu/best-of-mcp-servers | Ranked list, updated weekly automaticamente | MIT | Catálogo | Ranking algoritmo opaco |
| **caramaschiHG/awesome-ai-agents-2026** | https://github.com/caramaschiHG/awesome-ai-agents-2026 | 300+ resources / 20+ categories, updated monthly | MIT | Catálogo | Recente; não verifica qualidade |
| **awesome-claude-skills (vários forks)** | https://github.com/topics/awesome-claude-skills | Listas comunitárias de skills curated | MIT | Catálogo | Não há ainda um "canon" claro |
| **Zijian-Ni/awesome-ai-agents-2026** | https://github.com/Zijian-Ni/awesome-ai-agents-2026 | Curated AI Agent frameworks/tools/platforms 2026 | MIT | Catálogo | Overlapping com caramaschiHG |

**Sources:**
- https://github.com/punkpeye/awesome-mcp-servers
- https://github.com/caramaschiHG/awesome-ai-agents-2026
- https://github.com/tolkonepiu/best-of-mcp-servers

---

## Sinais fortes para o Mooter

1. **Gap real: não existe um "Skills Registry" oficial Anthropic equivalente ao MCP Registry.** A Anthropic mantém apenas 17 skills oficiais; a comunidade tem >66k. Discovery e ranking fiável de skills é território livre — Mooter pode posicionar-se como o "ranker que classifica Pack→Skill→MCP" e diferenciar-se de SkillsMP/Claude Marketplaces (que são catálogos mas não decision engines).

2. **Consolidação de orquestração para 6 frameworks (Claude Agent SDK + Strands + LangGraph + OpenAI Agents SDK + CrewAI + AG2) abre espaço para um router agnóstico.** O Mooter não compete com eles — escolhe **qual** usar por intenção. Isto é o "Pastor": pastoreia os frameworks, não os substitui.

3. **MCP Registry oficial cobre só ~20% dos servers existentes.** Há 10k+ servers em PulseMCP/Smithery/Composio sem signal de qualidade unificado. Mooter pode emergir como autoridade de "qual MCP usar para X em 2026" — isto é literalmente a função do Pastor a escolher Moo Packs.

4. **Roo Code morreu (15 Mai 2026), Microsoft AutoGen entrou em maintenance, OpenAI Swarm foi substituído.** Velocidade de churn é alta — qualquer router precisa de health-checks contínuos (cron/scheduled-tasks) ou recomenda tools mortos. Built-in "tool deprecation watcher" é uma diferenciação clara.

5. **Browser automation e sandbox são domínios maduros mas fragmentados por trade-off claro (DOM vs Vision; cold-start vs GPU vs template-catalog).** Aqui o Pastor brilha: o user diz "scrape este site" e o router escolhe Playwright+Stagehand; user diz "execute este script Python iterativo" → E2B; user diz "fine-tune este modelo no sandbox" → Modal. Tabela de decisão por intent já está mapeada — implementação directa.

6. **Default voice TTS de 2026 é claro (Cartesia Sonic 3 para latency, ElevenLabs Flash para realism, Hume Octave para emoção).** Mooter pode oferecer um "Voice Pack" com selecção automática baseada no use case (call agent vs audiobook vs game NPC). Pricing diferencial 3-5x entre tiers torna a escolha relevante.

7. **Anthropic publicou skills financeiras (Excel) específicas + MCP connectors enterprise (S&P, FactSet, etc.) em Maio 2026.** Sinal: vertical-specific packs são o futuro. Mooter v2 deve estruturar Moo Packs por vertical (finance, design, devops, research, content) — não só por domínio técnico horizontal.

8. **Ameaça competitiva clara: Smithery + Composio + PulseMCP estão a evoluir de catálogos para semi-routers** (já fazem install-one-click e managed runtime). Se algum deles adicionar classificação por intent (T0-T3 equivalente), são o competidor directo do Mooter. Janela de oportunidade: provavelmente <12 meses.

9. **Anthropic Skills marketplace pequeno + canónico (17 skills) + comunitário enorme (66k+) sugere um modelo "core + extensions"** — Mooter pode adoptar o mesmo padrão: "Moo Packs oficiais" (10-20 curados manualmente) + "Moo Packs comunitários" (livres, com signals de uso).

10. **Mermaid continua o default diagram-as-code para LLMs por familiarity** — Mooter deve gerar internamente Mermaid quando o Pastor visualiza o pack escolhido (e nunca D2 unless explicitly asked). Pequeno detalhe operacional mas decisivo para zero-friction debugging quando o user pergunta "porque é que escolheste este pack?".

---

*Research concluída 2026-05-27. Números não-verificados estão marcados in-line. Todas as URLs verificadas no dia da escrita.*
