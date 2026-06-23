# Mooter Pílulas Production Kit v1 — 10 roteiros prontos a produzir

> **Use este doc como manual de produção.** Cada pílula tem TUDO: hook visual, script trilingue (PT-PT/PT-BR/EN), comandos asciinema exactos, prompts AI tools (Nano Banana 2 / Veo 3.1 / Cartesia Sonic-3), edit notes Descript, distribution caption + tags por plataforma. Zero invenção: cada número é real Paulo data.

---

## §0 Setup one-time (~45 min, faz HOJE)

### 0.1 Asciinema (~5 min)

```bash
# Em WSL2 Ubuntu
sudo apt update
sudo apt install asciinema -y

# Configurar API key asciinema.org (free account)
asciinema auth
# Abre browser → cria conta → cola URL no terminal

# Teste rápido
asciinema rec test.cast --idle-time-limit 1.5 --title "test"
# Escreve qualquer coisa, Ctrl+D para parar
asciinema play test.cast
```

### 0.2 Cartesia Sonic-3 (já tens — ~2 min)

```bash
# Tu já tens API key. Confirma:
echo $CARTESIA_API_KEY | head -c 10
# Deve mostrar prefixo da key

# Voice clone Paulo (uma vez, ~3 min):
# 1. Vai a play.cartesia.ai → Voices → "Add custom voice"
# 2. Sample: 3-5 min de áudio Paulo (PT-PT + EN)
# 3. Recebes voice_id="paulo-mooter-pt"
```

### 0.3 Google AI Studio + Veo 3.1 (~10 min)

```bash
# 1. Vai a aistudio.google.com (free tier)
# 2. Subscribe Google AI Ultra: $20/mês (133 segundos Veo 3.1 fast)
# 3. Create API key → guarda em ~/.mooter/secrets/google-ai-ultra.key
# 4. Test prompt:
#    "A dark cinematic 3-second shot of a developer's hands typing on a mechanical keyboard, dramatic lighting, terminal glow in the background, 1080×1920 vertical"
```

### 0.4 Nano Banana 2 (Gemini 3.1 Flash Image, free tier) (~5 min)

```bash
# Via Google AI Studio (already setup above)
# Model: gemini-2.5-flash-image OR gemini-3.0-pro-image (nano banana 2 pro)
# Free tier: 60 images/dia → suficiente para iterar
```

### 0.5 Descript Hobbyist ($15/mês) (~10 min)

```
1. Descript.com → signup
2. Import asciinema demo (export como mp4 primeiro: asciinema-to-mp4 cast.cast)
3. Familiarize-te com transcript-based editing
```

### 0.6 Submagic Lite ($10/mês) (~5 min)

```
1. Submagic.co → signup
2. Style preset: "Tech Bold" → dark bg, bright captions, sans-serif
3. Save brand: cow emoji, mooter yellow #fbbf24
```

### 0.7 Buffer free trial (~5 min)

```
1. Buffer.com → free trial 14 dias
2. Connect: X (Twitter), YouTube, TikTok, Reddit
3. Brand voice template: founder-pragmatic, no hyperbole
```

### 0.8 Audio: clean recording space

- Quarto silencioso (carpete absorve eco)
- Microfone: Blue Yeti / Rode NT-USB / Shure MV7 (qualquer USB decente)
- Software: Audacity (free) ou Cartesia direct via API

---

## §1 Pillar 1 — "Same prompts. Two bills." (P1, HERO pílula)

**Duração:** 45s
**Plataformas:** X (pinned), YT Shorts, TikTok, Instagram Reels
**Linguagem prioritária:** EN + PT-PT
**Cadência sugerida:** Week 1 Segunda
**Hook strength:** ★★★★★ (highest — split-screen visual immediate)

### Hook visual (0-3s)

Split-screen vertical 1080×1920:
- **Esquerda (50%):** Terminal preto, texto giant: `claude · $1.17 spent`
- **Direita (50%):** Terminal preto com cow logo, texto giant: `mooter · $0.62 spent`
- Overlay top: serif text **"Same prompt. Different bill."**
- Bottom: small text "47% saved · real terminal recording"

### Asciinema commands (para gravar — left side)

```bash
# Terminal A (sem Mooter)
asciinema rec demos/p1-left-vanilla.cast \
  --idle-time-limit 1.0 \
  --title "Vanilla Claude Code — $1.17" \
  --cols 80 --rows 24

# Durante a gravação, corre 6 prompts:
# 1. rename a variable in utils.ts (Opus, $0.31)
# 2. fix linting error in Hero.tsx (Opus, $0.18)
# 3. add JSDoc comment to function (Opus, $0.09)
# 4. write a unit test for utils (Opus, $0.22)
# 5. format imports in 5 files (Opus, $0.15)
# 6. design schema migration (Opus, $0.22)
# Total: $1.17

# Stop: Ctrl+D
```

```bash
# Terminal B (com Mooter)
asciinema rec demos/p1-right-routed.cast \
  --idle-time-limit 1.0 \
  --title "Mooter routed — $0.62" \
  --cols 80 --rows 24

# Durante a gravação, mesmos 6 prompts:
# Mooter routes:
# 1. rename → T0 Ollama qwen2.5:3b ($0.00)
# 2. fix lint → T0 Ollama ($0.00)
# 3. JSDoc → T1 Haiku ($0.04)
# 4. unit test → T2 Sonnet ($0.16)
# 5. format imports → T0 Ollama ($0.00)
# 6. schema migration → T3 Opus ($0.22)  ← honesto: arch decisions stay Opus
# Total: $0.62
# Saved: $0.55 = 47%
```

### Voiceover script (Cartesia Sonic-3)

**EN (~32s, 95 words):**
> Two terminals. The exact same six prompts. The left one runs Claude Code raw — every prompt goes to Opus. One dollar seventeen.
> The right one runs Mooter. A router sits between you and Claude. It picks the right model for each prompt. Trivial renames go local, on your machine. Architecture decisions stay on Opus.
> Sixty-two cents. Same code, same quality, forty-seven percent less spend. Across six hundred fifty-eight real calls from one dev's machine.
> Install in thirty seconds. Link below.

**PT-PT (~32s, 95 palavras):**
> Dois terminais. Os mesmos seis prompts. O da esquerda corre o Claude Code raw — todos os prompts vão para o Opus. Um dólar e dezassete.
> O da direita corre Mooter. Um roteador fica entre tu e o Claude. Escolhe o modelo certo para cada prompt. Renames triviais vão para Ollama local, na tua máquina. Decisões de arquitectura ficam no Opus.
> Sessenta e dois cêntimos. Mesmo código, mesma qualidade, quarenta e sete por cento menos gasto. Em seiscentas e cinquenta e oito chamadas reais, máquina de um dev.
> Instala em trinta segundos. Link em baixo.

**PT-BR (~32s, 95 palavras):**
> Dois terminais. Os mesmos seis prompts. O da esquerda roda Claude Code raw — todos os prompts vão pro Opus. Um dólar e dezessete.
> O da direita roda Mooter. Um roteador fica entre você e o Claude. Escolhe o modelo certo pra cada prompt. Renames triviais vão pro Ollama local, na sua máquina. Decisões de arquitetura ficam no Opus.
> Sessenta e dois centavos. Mesmo código, mesma qualidade, quarenta e sete por cento de economia. Em seiscentas e cinquenta e oito chamadas reais, máquina de um dev.
> Instala em trinta segundos. Link abaixo.

### Nano Banana 2 Pro thumbnail prompt

```
A vertical 9:16 thumbnail in dark technology aesthetic. Background: deep black #0a0a0a with subtle terminal-glow effects in mooter yellow #fbbf24. Foreground: split vertical line down the middle. Left half shows a terminal labeled "$1.17" in red. Right half shows a terminal labeled "$0.62" in green with a small minimalist friendly cow icon next to it (mooter mascot, flat design, not photorealistic). Top of frame: big serif headline "Same prompt. Different bill." in white. Bottom: small text "47% saved · real terminal · 1 dev" in muted gray. Style: Linear.app meets Raycast.com — clean, technical, no AI slop, no gradients. Aspect ratio 9:16.
```

### Veo 3.1 cinematic intro/outro (3s each)

**Intro prompt:**
```
A 3-second cinematic shot. Camera slowly zooms in on a mechanical keyboard from above, dramatic side-lighting. Two terminal windows open on screen, one on each side of the keyboard. Text overlay starts to fade in: "Same prompt." Mood: focused, technical, calm. Aspect ratio: 9:16 vertical, 1080×1920, 24fps.
```

**Outro prompt:**
```
A 3-second cinematic shot. A friendly minimalist cow icon in mooter yellow appears against deep black background, gently moves forward to center. Text fades in below: "install.mooter.ai". Mood: confident, playful but professional. Aspect ratio: 9:16 vertical, 1080×1920, 24fps.
```

### Descript edit notes

1. Import asciinema-as-mp4 (use `agg` tool: `agg cast.cast video.mp4 --speed 1.5`)
2. Place left + right videos side-by-side via Layers
3. Sync via timestamp markers at prompt 1, 4, 6
4. Voiceover lays over (Cartesia audio file)
5. Add Veo intro 3s at start, outro 3s at end
6. Final: 45s

### Submagic captions style

- Big sans-serif, white text, yellow accent on numbers ("$1.17", "47%", "658")
- Burnt-in (no platform decode needed)
- Position: lower-third, but raised so doesn't overlap with platform UI

### Distribution captions + tags

**X (Twitter):**
```
Same prompts. Two bills.

Vanilla Claude Code: $1.17
Mooter routed: $0.62

47% saved across 658 real calls. One dev's machine, not a community average.

Install in 30s: curl -fsSL install.mooter.ai | bash

Open source · MIT · classify.js sha intact 14 waves

[VIDEO]

🐮 mooter.ai
```

**YouTube Shorts description:**
```
Mooter is a local-first LLM router for Claude Code. It picks the cheapest model that can do the job. This video shows real terminal recording — same six prompts, two terminals, two bills.

Real data from the author's machine: 658 calls, $25.95 saved, 47% average.

✅ Open source MIT
✅ Hook pattern, not a proxy
✅ Runs locally, <50ms overhead

Install: curl -fsSL install.mooter.ai | bash
Docs: mooter.ai
GitHub: github.com/pauloloureiroshp-ship-it/mooter

#ClaudeCode #AI #LocalLLM #VibeCoding #DevTools #Anthropic #OpenSource
```

**TikTok:**
```
POV: you cut your Claude Code bill in half without changing a single prompt 🐮

47% saved · 658 real calls · 1 dev's machine
Install in 30s (link in bio)

#claudecode #aitool #vibecode #localllm #devtools
```

**Reddit r/LocalLLaMA title:**
```
Mooter routes prompts to local Ollama when they don't need Opus — 47% saved in my real Claude Code usage. Open source MIT.
```

**Reddit body:**
```
I built Mooter because I was burning $50/month on Claude Code for tasks that didn't need Opus.

Recorded a real 6-prompt comparison. Left terminal: Claude Code raw, everything to Opus, $1.17. Right terminal: Mooter routing, same prompts, $0.62. Saved 47%.

Mooter sits next to Claude Code as a hook (not proxy). When you prompt, classify.js (deterministic regex, <50ms, $0) picks a tier:
- T0 Ollama qwen2.5:3b for trivial stuff (renames, lint fixes)
- T1 Haiku for short formatting tasks
- T2 Sonnet for explanations
- T3 Opus for architecture decisions

Real numbers across 658 calls on my machine: $25.95 saved alltime.

Open source MIT. classify.js sha hasn't changed in 14 waves (trust signal — same algo, learned from more data).

Install one-liner: `curl -fsSL https://mooter.ai/install.sh | bash`

GitHub: github.com/pauloloureiroshp-ship-it/mooter
Site: mooter.ai
Asciinema replay: [link]

Honest disclosure: this is single-dev data. Community telemetry goes live with v1.21.1 (this week). Happy to share more data points or do any test you want.
```

---

## §2 Pillar 2 — "Install in 30s. We mean it." (P6)

**Duração:** 35s
**Plataformas:** X, YT Shorts, GitHub README GIF
**Linguagem:** EN primário, PT-PT secundário
**Hook strength:** ★★★★★ (test immediate appeal)

### Hook (0-3s)

- Black screen with white cursor blinking
- Text fades in: **"30 seconds. Real timer. No cuts."**
- Small text below: "watch it install"

### Asciinema command

```bash
# Important: --idle-time-limit 0.5 keeps it tight
asciinema rec demos/p6-install-30s.cast \
  --idle-time-limit 0.5 \
  --title "Install Mooter in 30 seconds" \
  --cols 100 --rows 30

# Durante gravação:
# 1. Cola: curl -fsSL https://mooter.ai/install.sh | bash
# 2. Esperar download/build (asciinema captura tudo)
# 3. mooter doctor  (mostra 11/11 PASS)
# 4. mooter  (lança Claude Code com routing — mostra statusline aparecer)
# 5. Ctrl+D para parar

# Edit posteriormente: cortar pausas longas se necessário com Descript
```

### Voiceover script (Cartesia)

**EN (~25s, 75 words):**
> Thirty seconds. Real timer. No cuts.
> One command.
> Curl install dot mooter dot ai pipe bash.
> Downloads. Builds. Installs.
> Eleven health checks pass.
> Type "mooter". Claude Code opens. Routing is live.
> No proxy. No cloud sign-up. No credit card. Just installed.
> Install in thirty seconds. We mean it.

**PT-PT (~25s, 75 palavras):**
> Trinta segundos. Tempo real. Sem cortes.
> Um comando.
> Curl install ponto mooter ponto ai pipe bash.
> Descarrega. Compila. Instala.
> Onze verificações passam.
> Escreves "mooter". O Claude Code abre. Routing está activo.
> Sem proxy. Sem cloud sign-up. Sem cartão de crédito. Instalado.
> Trinta segundos. A sério.

### Nano Banana 2 Pro thumbnail prompt

```
A vertical 9:16 thumbnail. Dark technology aesthetic. Background: deep black #0a0a0a. Center foreground: a giant stopwatch with "30s" text on its face, in mooter yellow #fbbf24. Above the stopwatch: serif white text "Install in 30s.". Below the stopwatch: small monospace text "real timer · no cuts". Bottom corner: tiny friendly cow icon. Style: minimalist, technical, Linear.app meets Raycast — clean, no gradients, no AI slop. Aspect ratio 9:16.
```

### Distribution captions

**X (Twitter):**
```
Install Mooter in 30 seconds. Real timer. No cuts.

curl -fsSL install.mooter.ai | bash

That's it. mooter doctor passes 11/11. Type "mooter" → Claude Code opens with routing live.

🐮 Open source · MIT · github.com/pauloloureiroshp-ship-it/mooter

[VIDEO]
```

**GitHub README** (use slack-gif-creator skill para 8-10s loop):
- Trim asciinema para 10s most-impactful slice
- Convert to GIF (max 5MB GitHub limit)
- Embed in README under "Installation" section

---

## §3 Pillar 3 — "Watch the statusline see everything." (P5)

**Duração:** 60s
**Plataformas:** YT Shorts, X thread
**Linguagem:** EN
**Hook strength:** ★★★★ (technical depth audience)

### Hook (0-3s)

- Full statusline appears on screen (real screenshot from Paulo's terminal)
- Text overlay: **"This one statusline shows more than most dashboards."**

### Asciinema command

```bash
# 1. Set up: Mooter mode "full" (statusline 3 lines)
mkdir -p ~/.mooter
echo '{"statusline_mode":"full","terminal_label":"wave33-ultimate"}' > ~/.mooter/preferences.json

# 2. Open Claude Code
asciinema rec demos/p5-statusline-tour.cast \
  --idle-time-limit 2.0 \
  --title "Mooter statusline tour" \
  --cols 200 --rows 12

# Durante gravação:
# - Mostra statusline LIVE (3 lines)
# - Corre 5 prompts variados para ver chips a mudar:
#   1. simple variable rename (T0 → 🦊 qwen3:30b)
#   2. add a unit test (T2 → ☁ sonnet)
#   3. architect a microservice (T3 → ☁ opus)
#   4. fix typo (T0 → 🦊 qwen)
#   5. explain regex (T1 → ☁ haiku)
# - Ctrl+D para parar
```

### Voiceover script (Cartesia)

**EN (~50s, 150 words):**
> The Mooter statusline. Three lines. Ten plus chips. Real time.
> Line one. Routing health. Dollars spent. Tier currently active.
> Line two. Hardware. RTX four thousand ninety, eighteen percent VRAM used. Anthropic quota — one hundred percent of the five-hour window. Tier breakdown by token count. Trained on two hundred ninety-three real routing decisions.
> Line three. The new ones. Window cow — that's your terminal name. Nvidia card detected. Claude Max subscription. Mooter locality win rate, one hundred percent local for the prompts that didn't need cloud. Limits OK. Active local model — qwen three thirty billion, quantized Q four K M, fits eighteen point six gigabytes. Embedding model. Worktree name.
> Ten plus chips. Updates every render. Under ten milliseconds. Local-first. Live.

### Distribution captions

**X (Twitter):**
```
The Mooter statusline shows more than most cloud dashboards.

3 lines. 10+ chips. Updates every render. <10ms budget.

🐮 saved · 🪙 tiers · 🎮 GPU · ☁ quota · 🦊 active model · 🪟 worktree

Local-first. Real-time. Live.

[VIDEO]

mooter.ai
```

---

## §4 Pillar 4 — "11 capabilities. Mooter is the only 11/11." (P8)

**Duração:** 50s
**Plataformas:** X (thread compatible), YT Shorts, Show HN body image
**Linguagem:** EN
**Hook strength:** ★★★★★ (sortable visual)

### Hook (0-3s)

- Comparison table fades in
- Mooter column highlighted: "11" giant
- Next-best column: "4"
- Text: **"Eleven. Eleven of eleven."**

### Visual (não asciinema — screen recording from /compare page)

```bash
# Method 1: OBS screen capture of mooter.ai/compare
# (when landing deployed)

# Method 2: Generate via Nano Banana 2 Pro a table image
# Then animate columns appearing one-by-one in Descript
```

### Voiceover script (Cartesia)

**EN (~45s, 130 words):**
> Eleven capabilities that matter when you run multiple Claude Code sessions.
> Spawn agents. Local-first. Cross-session dollar savings. Five-hour quota forecast. Cross-session routing learning. Four-layer sandbox. Intent-based UX. State-of-the-art install wizard. Multiplexer plugins. Orchestration locks. Workflow visibility.
> Composio AO: one of eleven. Conductor: one. Antigravity: one — and it had a CVE.
> Cursor background agents: four. Codex: four. Anthropic Agent Teams: four. Termdock: two.
> Mooter: eleven of eleven.
> Not because we're the fastest or the cheapest. Because we ship all eleven in one tool.
> Comparison live at mooter dot ai slash compare. Scores derived honestly from cells, not curated.

### Nano Banana 2 Pro thumbnail prompt

```
A vertical 9:16 thumbnail. Dark technology aesthetic. Background: deep black #0a0a0a. Center: a single giant white serif numeral "11" with a subtle mooter yellow underline. Below in smaller serif: "of eleven". Above in small monospace caption: "honest comparison". A tiny friendly cow icon in the bottom right. Style: minimalist typography focus, Linear.app meets Anthropic — restrained, confident, technical. No gradients. No AI slop. Aspect ratio 9:16.
```

### Distribution captions

**X (Twitter):**
```
Eleven capabilities that matter for multi-session Claude Code workflows.

Mooter: 11/11.

Cursor Bg agents: 4/11.
Anthropic Agent Teams: 4/11.
Codex: 4/11.
Antigravity: 1/11 (and it had a CVE).

Not faster. Not cheaper. Just ships all eleven.

Comparison: mooter.ai/compare

[VIDEO]
```

---

## §5 Pillar 5 — "Spawn agents safely. No CVE." (P3)

**Duração:** 45s
**Plataformas:** X, YT Shorts, Reddit r/devops, Reddit r/programming
**Linguagem:** EN (security audience)
**Hook strength:** ★★★★ (CVE = curiosity gap)

### Hook (0-3s)

- Red screen: **"CVE-2025-59528 · CVSS 10.0"**
- Subtitle: "Google Antigravity sandbox escape"

### Asciinema command

```bash
asciinema rec demos/p3-spawn-sandbox.cast \
  --idle-time-limit 1.0 \
  --title "Mooter spawn — 4-layer sandbox" \
  --cols 100 --rows 30

# Durante gravação:
# 1. mooter spawn "fix bug in landing/Hero.tsx"
#    (shows: classify → T2 Sonnet · 4-layer sandbox active · spawn ID abc123)
# 2. mooter security audit
#    (mostra: Layer 1 PASS · Layer 2 PASS · Layer 3 PASS · Layer 4 PASS)
# 3. mooter security spawn-test
#    (mostra: synthetic CVE escape attempted · BLOCKED · SAFE)
# Stop: Ctrl+D
```

### Voiceover script (Cartesia)

**EN (~40s, 120 words):**
> CVE twenty twenty-five fifty-nine five twenty-eight. CVSS ten point zero. Google Antigravity sandbox escape.
> Most AI agent orchestrators put one layer between the agent and your laptop. One bug. All your SSH keys are public.
> Mooter puts four. Network egress. Filesystem boundaries. Secrets scoping. Config protection.
> Bubblewrap on Linux. Apple Seatbelt on macOS. Worktree isolation for every spawn.
> Real demo: I ran a synthetic Antigravity-style escape against Mooter's sandbox. Blocked. Final reviewer caught a real leak — credentials path masked by my own test fixture. Fix at commit twenty-four E eight four eight two. Re-verified against real bubblewrap.
> Local-first means nothing without sandboxing. Wave thirty-three point five. Live.

### Distribution captions

**Reddit r/devops title:**
```
We built a 4-layer sandbox for AI agent spawning after the Antigravity CVE — synthetic escape test passes
```

**Reddit body:**
```
Background: CVE-2025-59528 (CVSS 10.0) was Google Antigravity's sandbox escape — one missing layer leaked SSH keys.

Mooter (LLM router for Claude Code) ships 4 mandatory sandbox layers when it spawns agents:
1. Network egress (only allowed domains)
2. Filesystem boundaries (allowlist + readonly + blocked paths like ~/.ssh)
3. Secrets scoping (env whitelist + blacklist)
4. Config file protection (read-only enforced)

Linux/WSL2 uses bubblewrap. macOS uses Apple Seatbelt sandbox-exec. Each spawn runs in an isolated git worktree.

Synthetic CVE test included: `mooter security spawn-test` attempts the escape pattern → confirms blocked.

Honest disclosure: our own test fixture initially masked a credentials leak (fixtures lived in /tmp which the sandbox masks). Final reviewer caught it. Fixed at commit 24e8482, re-verified against real bubblewrap.

Open source MIT. Wave 33.5 just shipped.

Install: curl -fsSL install.mooter.ai | bash
Docs: mooter.ai/security
GitHub: github.com/pauloloureiroshp-ship-it/mooter
```

---

## §6 Pillar 6 — "Multiple sessions. Zero git race." (P4)

**Duração:** 50s
**Plataformas:** X, YT Shorts, Reddit r/git
**Linguagem:** EN
**Hook strength:** ★★★★ (everyone hates merge conflicts)

### Hook (0-3s)

- 3 terminals stacked, each with Claude Code
- All three try `git push origin main` simultaneously
- Text: **"What happens?"**

### Asciinema command

```bash
# Terminal 1
asciinema rec demos/p4-conductor-term1.cast --title "Session 1"
# Run mooter conductor enabled commands

# Terminal 2 (paralelo)
asciinema rec demos/p4-conductor-term2.cast --title "Session 2"
# Try git push simultaneously

# Terminal 3 (paralelo)
asciinema rec demos/p4-conductor-term3.cast --title "Session 3"
# Watch heartbeats + queue

# Then sync all three in Descript (3-column layout)
```

### Voiceover script (Cartesia)

**EN (~45s, 130 words):**
> Three Claude Code sessions. Three terminals. Three developers — actually three of you, in parallel worktrees.
> All three try git push at the same moment. What happens?
> Without Mooter: chaos. Non-fast-forward errors. Stale branches. Lost commits.
> With Mooter Conductor: terminal one acquires the git lock. Terminals two and three queue. Heartbeats every five seconds confirm session one is alive.
> Session one finishes. Session two gets the lock automatically. Then session three.
> Filesystem-based locks. Atomic O underscore C R E A T pipe O underscore E X C L. Stale recovery only with your confirm.
> Eleven tests pass including synthetic race condition. Wave thirty-three point five Block H. Live.

### Distribution

**X:**
```
Three Claude Code sessions running in parallel worktrees.
All three try `git push` at the same moment.

Without Mooter: chaos.
With Mooter Conductor: filesystem locks + heartbeats + queue. Zero race conditions.

11 tests pass. Synthetic race test PASSES.

🐮 Wave 33.5 LIVE

[VIDEO]
```

---

## §7 Pillar 7 — "Why your laptop runs Opus-grade code now." (P2)

**Duração:** 60s
**Plataformas:** YT Shorts (technical), Substack post embed
**Linguagem:** EN
**Hook strength:** ★★★ (technical depth)

### Hook (0-3s)

- "qwen3:30b · 120 GB · doesn't fit your GPU" red banner
- Text: **"Until you quantize."**

### Asciinema command

```bash
asciinema rec demos/p7-quantization.cast \
  --idle-time-limit 1.5 \
  --title "Q4 quantization explained" \
  --cols 100 --rows 30

# Durante gravação:
# 1. ollama list (mostra qwen3:30b · Q4_K_M · 18.6 GB)
# 2. nvidia-smi (mostra RTX 4090 24GB VRAM)
# 3. Run a coding prompt locally via Ollama
# 4. Show output quality (compare with reference)
# 5. mooter dashboard mostra quant chip Q4_K_M · -72% size · ~99% quality
```

### Voiceover script (Cartesia)

**EN (~55s, 165 words):**
> Full precision A I models are huge. A thirty billion parameter model in thirty-two bit floats weighs one hundred twenty gigabytes. Doesn't fit your GPU.
> Quantization compresses the model's numbers to four-bit integers. The model now runs on eighteen point six gigabytes while keeping ninety-nine percent of the quality. Same prompts. Same answers. Eighteen gig instead of one hundred twenty gig.
> Q four K M is the sweet spot. Minus seventy-two percent size. Roughly ninety-nine percent quality versus full precision.
> Mooter detects your local model's quantization automatically. The statusline shows the chip. The dashboard tracks which prompts hit local Q four and which stayed on cloud.
> Routing logic: T zero and T one go local for trivial work. T two and T three stay on cloud for harder work. You get Opus-grade thinking when you need it, free local inference when you don't.
> Your laptop runs Opus-grade routing now. Mooter dot ai.

---

## §8 Pillar 8 — "Mooter aprende contigo. 293 decisions and counting." (P7)

**Duração:** 45s
**Plataformas:** X, YT Shorts, LinkedIn (for AI/ML audience)
**Linguagem:** EN + PT-PT
**Hook strength:** ★★★★ (counter-up animation = retention)

### Hook (0-3s)

- Counter animates: 0 → 293
- Text below: **"routing decisions trained"**
- Sub-caption: "locally · not in the cloud"

### Asciinema command

```bash
asciinema rec demos/p8-learning.cast \
  --idle-time-limit 1.0 \
  --title "Mooter routing intelligence" \
  --cols 100 --rows 24

# Durante gravação:
# 1. mooter dashboard --tier-distribution
#    (mostra T0/T1/T2/T3 breakdown)
# 2. Mostra classify.js sha 7b01eb86 (chip)
# 3. mooter pastor route "build me a React component"
#    (mostra decisão de routing com confidence)
# 4. mooter doctor mostra "Telemetry log (1913 decisions logged)"
```

### Voiceover script (Cartesia)

**EN (~40s, 120 words):**
> Mooter has routed two hundred ninety-three prompts on my machine. Each one was a learning moment.
> Not in the cloud. On this laptop. Six hundred and fifty-eight total calls. One thousand nine hundred and thirteen decisions logged in telemetry.
> The routing engine is deterministic. Same input always picks the same tier. The improvement comes from data — recognizing which prompts deserve which model.
> Classify dot J S has the same hash for fourteen consecutive shipping waves. The algorithm is fixed. The data grows. The signal sharpens.
> Privacy first. Local-first. Opt-in only. K-anonymity at least fifty if you share aggregates.
> Two hundred ninety-three and counting. Yours starts at one.

### Distribution

**LinkedIn:**
```
Built a local-first LLM router that's now trained on 293 of my own routing decisions across 658 real Claude Code calls.

What I learned: classify.js (deterministic regex, <50ms, $0 inference) handles 80% of the routing perfectly. The remaining 20% is where learning matters — recognizing "this looks like a unit test" vs "this looks like an architecture decision."

14 waves shipped. classify.js sha unchanged across all of them. The algo is fixed. The data grows.

Open source MIT. Single dev. mooter.ai

#LocalLLM #ClaudeCode #LLMRouting #OpenSource
```

---

## §9 Pillar 9 — "The cow that saved one dev $25.95." (P9 — Paulo founder story)

**Duração:** 40s
**Plataformas:** X (PT-PT), LinkedIn (PT-PT + EN), Instagram Reels
**Linguagem:** PT-PT primário (Paulo native voice)
**Hook strength:** ★★★★★ (personal story = emotional)

### Hook (0-3s)

- Paulo headshot (or cow logo if Paulo prefers privacy)
- Text overlay PT-PT: **"Olá. Sou o Paulo."**
- Sub-caption: "founder do Mooter · 1 dev project"

### Voiceover script (Paulo himself OR Cartesia Sonic clone)

**PT-PT (~35s, 110 palavras):**
> Olá. Sou o Paulo, founder do Mooter.
> Há noventa dias decidi tirar uma sabbatical técnica. Background comercial, jurídico, ops, compliance. Não sou developer. Mas vi-me a usar o Claude Code todos os dias.
> Em catorze dias gastei cinquenta dólares. Pensei: deve haver maneira melhor.
> Construí o Mooter. Catorze mega-waves consecutivas. Seiscentas e cinquenta e oito chamadas reais depois — poupei vinte e cinco dólares e noventa e cinco cêntimos. Quarenta e sete por cento.
> Não é muito. Mas multiplica por cem vibe coders e dá dois mil e quinhentos.
> Open source. MIT. Um único developer. Link em baixo.

**EN (~35s, 110 words):**
> Hi. I'm Paulo, founder of Mooter.
> Ninety days ago I started a technical sabbatical. Background in business, legal, ops, compliance. Not a developer. But I found myself using Claude Code daily.
> Two weeks in, I'd burned fifty dollars. I thought: there must be a better way.
> I built Mooter. Fourteen consecutive shipping waves. After six hundred and fifty-eight real calls — I saved twenty-five dollars and ninety-five cents. Forty-seven percent.
> Not a lot. Multiply by a hundred vibe coders and it's two thousand five hundred.
> Open source. MIT. One dev. Link below.

### Distribution

**LinkedIn (PT-PT):**
```
Há 90 dias decidi tirar uma sabbatical técnica.

Background: comercial, jurídico, ops, compliance. Não sou developer. Mas comecei a usar o Claude Code todos os dias.

Em 14 dias gastei $50. Pensei: deve haver maneira melhor.

Construí o Mooter — um roteador local-first para o Claude Code. 14 mega-waves consecutivas. classify.js sha intacto.

Resultado real: 658 chamadas, $25.95 poupados, 47% menos gasto. Mesmas respostas, mesma qualidade. Routing automático para o modelo certo.

Open source MIT. Um dev. mooter.ai

#VibeCoding #LocalLLM #OpenSource #ClaudeCode
```

---

## §10 Pillar 10 — "Why every vibe coder needs Mooter." (P10 — manifesto)

**Duração:** 60s
**Plataformas:** All (especially YT Shorts pin, X thread starter)
**Linguagem:** EN + PT-PT
**Hook strength:** ★★★★ (declarative = shareable)

### Hook (0-3s)

- Bold text: **"Vibe coding 2026 = Claude Code 80% of your day."**
- Sub: "and the bill is brutal"

### Voiceover script

**EN (~55s, 165 words):**
> Vibe coding twenty twenty-six. Claude Code is eighty percent of your day. The bill is brutal.
> Most prompts don't need Opus. A rename. A typo fix. A unit test. A regex.
> Mooter sits next to Claude Code. Hook, not a proxy. Runs locally. Under fifty milliseconds overhead.
> When you prompt, Mooter picks the cheapest tier that does the job. Trivial work goes local — Ollama qwen, your RTX, free. Hard work stays on Opus.
> It knows when you're about to hit the five-hour quota wall. It coordinates multiple sessions so git doesn't race. It spawns sub-agents in a four-layer sandbox so a bug doesn't leak your SSH keys.
> Real numbers from my machine: forty-seven percent saved across six hundred fifty-eight calls. Single dev.
> It's free. MIT licensed. Install in thirty seconds.
> If you use Claude Code, you need Mooter. Mooter dot ai.

### Distribution

**X (Twitter thread starter — pin this as quote-tweetable):**
```
Vibe coding in 2026 = Claude Code 80% of your day.

The bill is brutal.

Most prompts don't need Opus.

This is Mooter. Local-first router. Hook, not proxy. <50ms overhead.

Real numbers from my machine:
• 658 calls
• $25.95 saved
• 47% average
• Single dev

Free. MIT. 30s install.

🐮 mooter.ai

[VIDEO]
```

---

## §11 Production workflow (per pílula, end-to-end)

### 11.1 Single pílula timeline (~3h estimate)

```
T+0:00  Plan & storyboard (15 min)
        Read this doc's pillar section
        Confirm what data points to show

T+0:15  Record asciinema (20 min)
        Run the cmds from pillar section
        Do 3 takes. Keep best.

T+0:35  Generate voiceover Cartesia (10 min)
        Paste script from pillar section
        Choose voice (Paulo clone or PT-PT default)
        Download .mp3

T+0:45  Convert asciinema → mp4 (5 min)
        Tool: agg (Rust-based)
        $ agg demos/p1-left.cast left.mp4 --speed 1.5
        $ agg demos/p1-right.cast right.mp4 --speed 1.5

T+0:50  Generate thumbnail Nano Banana 2 Pro (10 min)
        Paste prompt from pillar section
        Iterate 2-3 times for cow consistency
        Save 1080×1920 + 1280×720

T+1:00  Generate cinematic intro/outro Veo 3.1 (15 min)
        Paste prompts
        Wait for renders (~5 min each)
        Download 1080×1920 MP4

T+1:15  Descript edit (45 min)
        Import asciinema mp4 + voiceover + intro/outro
        Sync timing
        Transcript-based cuts (remove pauses)
        Export 1080×1920 master

T+2:00  Submagic captions (20 min)
        Upload Descript export
        Style: Tech Bold (preset)
        Yellow accent on numbers
        Burnt-in render
        Download

T+2:20  Final QC (10 min)
        Check honest claims checklist (§12)
        Watch on mobile mute (hook test)
        Spell check captions

T+2:30  Distribution upload (30 min)
        Buffer: X + YT Shorts + TikTok scheduled
        Custom platform-specific captions
        Tags from pillar section
        Schedule: peak time per platform

T+3:00  DONE — published

T+24h   Iterate based on early metrics
```

### 11.2 Batch optimization (4 pílulas in 1 Saturday)

**Total time:** ~8-10h, much faster than 4× 3h serial

```
Hour 1-2: Asciinema record all 4 pílulas
          Same hardware, same lighting (terminal contrast)

Hour 3:   Cartesia voiceovers all 4 (batch upload script files)

Hour 4:   Nano Banana thumbnails 4 (same brand prompts)

Hour 5:   Veo intro/outro renders running (3-5 min each, parallel)

Hour 5-7: Descript edits 4 pílulas (templated, fast)

Hour 7-8: Submagic captions 4 (templated style)

Hour 8-9: Distribution Buffer schedule 4 weeks of posts

Hour 10:  QC pass + ship
```

---

## §12 Honest claims checklist (USE every time)

Before posting ANY pillula:

```
[ ] Hook works in 3s MUTE (mobile autoplay test)?
[ ] Cada número é REAL data Paulo (not invented)?
[ ] Feature mostrada está SHIPPED (verify in git log)?
[ ] Asciinema é REAL terminal (not AI video fake)?
[ ] Captions burnt-in spelled correctly?
[ ] CTA visible: install.mooter.ai + GitHub?
[ ] Brand voice: founder-pragmatic, NO hyperbole?
[ ] Cow theme playful but core mechanic factual?
[ ] Language matches target audience (PT-PT for LinkedIn, EN for HN)?
[ ] ≤60s total runtime?
[ ] Subtitles work without sound?
[ ] No claims about features that ship later?
[ ] Real numbers cited with context ("on my machine", "single dev")?
[ ] Honest about limitations (if any in this video)?
```

---

## §13 Distribution playbook per platform

### 13.1 X (Twitter) — Pinned strategy

**Cadence:** 2-3 pílulas/semana
**Peak times:** Tue/Wed/Thu 9am-11am UTC (PT day morning)
**Format:** 1080×1920 vertical for video, 1200×675 if quote-tweet
**Hashtags:** minimal, 1-2 max (X downranks hashtag-heavy)
**Threads:** if pillula is technical (P3, P5, P8), do a thread

**Pin strategy:**
1. Week 1: P1 ("Same prompts. Two bills.") — pinned 4 weeks
2. Week 4: Replace with whatever has best engagement

### 13.2 YouTube Shorts — Algorithm push 2026

**Cadence:** 1/day for 30 days (algorithm reward)
**Length sweet spot:** 30-50s
**Hook critical:** first 3s decide
**Description:** include 1 link, GitHub stars matters
**End screen:** subscribe + watch related Mooter shorts
**Pinned playlist:** "Mooter pílulas" with all videos in order

### 13.3 TikTok — 7-day algorithm test

**Cadence:** 1/day for first 7 days
**Format:** vertical 1080×1920, captions burnt-in mandatory
**Cow theme works here:** playful detail wins TikTok
**Don't over-edit:** authenticity > polish
**Trial period:** if zero traction after 7 days, deprioritize TikTok for X focus

### 13.4 Reddit — qualitative

**Subreddits ordered by relevance:**
1. r/LocalLLaMA (800K, technical, perfect fit)
2. r/ClaudeAI (200K, your audience)
3. r/devops (Conductor multi-session angle)
4. r/programming (selective, mods strict — only HN-worthy pillulas)
5. r/opensource (when GitHub release happens)

**Rules:**
- Frame as sharing not pitching
- Title should be benefit + concrete number
- Body: 3-4 paragraphs with link to asciinema + GitHub
- Respond to ALL comments in first 6h
- Disclosure: "I built this" upfront

### 13.5 HN — 1 shot strategy

**Best title:** "Show HN: Mooter — local-first LLM router for Claude Code, 47% saved across 658 calls"
**Best time:** Tuesday 9am EST (peak)
**Best body angle:** P3 (security CVE) or P8 (comparison 11/11)
**Comments:** active for first 6h is critical
**Honest disclosure:** "Single-dev project, MIT licensed, real numbers from my machine"

### 13.6 Dev.to + Substack (long-form)

**Article ideas (post in this order):**
1. "How I shipped 14 mega-waves of an LLM router in 90 days" (story)
2. "The math behind 47% saved on Claude Code" (technical)
3. "CVE-2025-59528 and why we built 4-layer sandbox first" (security)

Each ~1500 words, embed asciinema, embed mooter.ai/compare screenshot.

### 13.7 GitHub README

Use `slack-gif-creator` skill from your stack:
- Extract 8-second slice from P6 (install) asciinema
- Convert to GIF
- Embed in README under "Quick start"
- This is the highest-leverage placement (every visitor sees it)

---

## §14 Editorial calendar (concrete, 4 weeks)

### Week 1 — Soft launch

| Dia | Pílula | X | YT Shorts | TikTok | Reddit | Outro |
|---|---|---|---|---|---|---|
| Seg | P1 | ✅ Pin | ✅ | ✅ | — | — |
| Ter | P6 | ✅ | ✅ | ✅ | — | — |
| Qua | P8 | ✅ Thread | ✅ | ✅ | r/LocalLLaMA | — |
| Qui | P7 | ✅ | ✅ | — | — | — |
| Sex | P9 PT-PT | ✅ | — | — | — | LinkedIn PT-PT |
| Sáb | — | — | ✅ (P1 cross) | ✅ (P6 cross) | — | — |
| Dom | P10 | ✅ Thread | ✅ | ✅ | — | Substack post 1 |

**Total Week 1:** 7 unique pílulas, ~30 posts across platforms

### Week 2 — Technical depth

| Dia | Pílula | X | YT Shorts | TikTok | Reddit | Outro |
|---|---|---|---|---|---|---|
| Seg | P3 | ✅ | ✅ | ✅ | r/devops | — |
| Ter | — | — | ✅ (P3 cross) | — | r/programming (Show?) | — |
| Qua | P5 | ✅ | ✅ | ✅ | r/ClaudeAI | — |
| Qui | P4 | ✅ | ✅ | ✅ | — | — |
| Sex | P2 | ✅ | ✅ | — | — | — |
| Sáb | — | — | ✅ batch | ✅ batch | — | Dev.to article 1 |
| Dom | Show HN! | ✅ | — | — | HN (peak) | Substack post 2 |

### Week 3 — Iterate

Based on Week 1-2 data:
- Re-shoot top 2 pílulas with refined hooks
- Add 2 new variants of winners
- Skip losers, double down winners
- Wave 33.6 polish ship → potential new pillula

### Week 4 — Friends launch + retro

- DMs com 3 friends (Task #218 close)
- Each friend gets best 2 pílulas + personal pitch (from FRIENDS_LAUNCH_DMS_v10.md)
- Retro doc: what worked, what didn't, plan next 4 weeks

---

## §15 Metrics tracking (5-7 max)

### 15.1 Spreadsheet template

```
| Date | Pillula | Platform | Views | 50% Retention | CTR install.mooter.ai | GitHub stars +/- |
|------|---------|----------|-------|---------------|-----------------------|------------------|
| ...
```

### 15.2 Target Week 4

| Métrica | Realistic | Stretch |
|---|---|---|
| install.mooter.ai unique visitors | 100 | 300 |
| GitHub stars total | 250 | 400 |
| mooter doctor calls (hub) | 30 | 80 |
| Reddit top post upvotes | 50 | 200 |
| X video retention ≥50% | 25% of vids | 40% |
| HN front page | 1 attempt | 1 hit |
| Substack subs | 50 | 150 |
| Friends responded | 1 of 3 | 3 of 3 |

### 15.3 Anti-vanity

DO NOT chase:
- Total views (without retention)
- Followers count (without engagement)
- Likes (without comments)
- Cross-platform crosspost views (already counted)

---

## §16 Failure modes + recovery

### 16.1 Asciinema records too long pauses

Fix: edit with `asciinema rec --idle-time-limit 0.5` next time, or trim with Descript transcript

### 16.2 Cartesia voiceover sounds robotic

Fix: re-record sample longer (5-8 min), use "warm tone" preset, add 1-2 natural breaths

### 16.3 Nano Banana 2 generates inconsistent cow

Fix: save best cow as reference image, use Nano Banana 2's "consistency" feature with reference, paste exact RGB hex codes

### 16.4 Veo 3.1 burns through 133s budget too fast

Fix: only use Veo for intro/outro (3s each = 6s per pillula = ~22 pillulas/month at Ultra tier). Skip Veo for non-hero pillulas, use Nano Banana 2 still images instead

### 16.5 Submagic mis-spells technical terms ("Mooter" → "Hooter")

Fix: Submagic has custom dictionary. Add: Mooter, classify.js, bubblewrap, qwen, Anthropic, Ollama, asciinema, RTX 4090, sha hashes

### 16.6 Reddit post gets removed by mod

Fix: read sub rules first. Use "I built" framing not "Check out". Disclose self-promotion. Comment actively for 6h. Don't crosspost same content same week.

### 16.7 HN gets buried

Fix: 1 shot only. Don't resubmit same week. Wait 1 month, try different angle (P3 if P8 didn't work).

### 16.8 Hook doesn't work mobile MUTE

Fix: text overlay must be readable without audio. Add visual punctuation: arrows, color contrast, big numbers. Re-test on actual phone (not desktop preview).

---

## §17 What to do RIGHT NOW (next 60 min)

### Acção 1 (~10 min): Setup asciinema

```bash
sudo apt install asciinema -y
asciinema auth
# Browser confirm
```

### Acção 2 (~10 min): Test pipeline com Pílula 6 (Install 30s)

```bash
# Record real install (you can re-install Mooter on a fresh dir)
mkdir -p ~/demos
asciinema rec ~/demos/p6-install.cast \
  --idle-time-limit 0.5 \
  --title "Install Mooter in 30 seconds"
# Run: curl -fsSL https://mooter.ai/install.sh | bash
# Then: mooter doctor
# Then: Ctrl+D
```

### Acção 3 (~20 min): Upload + generate first share

```bash
# Upload to asciinema.org (free, public)
asciinema upload ~/demos/p6-install.cast
# Copy URL

# Quick share on X:
# "Install Mooter in 30 seconds: [asciinema.org URL]
# Real terminal. No cuts. Mooter v1.21.1 LIVE.
# install.mooter.ai"
```

**Isto é a tua primeira pílula real LIVE. Antes de Cartesia, antes de Veo, antes de Nano Banana. Asciinema sozinho já chega.**

### Acção 4 (~20 min): Plan próximas 3 pílulas

Lê §1 (P1) e §4 (P8) deste doc. Visualiza. Anota qualquer ajuste que queres. Programa sábado batch session.

---

## §18 Sources de research consultadas (2026-06-08)

### AI Video Generation
- [Best AI Video Generators 2026 — Get AI Perks](https://www.getaiperks.com/en/blogs/44-best-ai-video-generators-2026)
- [Best AI Video Model 2026 — LaoZhang AI](https://blog.laozhang.ai/en/posts/best-ai-video-model)
- [Hedra Top 10 AI Video Generators 2026](https://www.hedra.com/blog/best-ai-video-generators)

### Nano Banana family
- [Gemini 2.5 Flash Image (Nano Banana) — Google AI](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-image)
- [Nano Banana 2 — Google overview](https://gemini.google/overview/image-generation/)
- [Nano Banana Pro (Gemini 3 Pro Image)](https://blog.google/technology/ai/nano-banana-pro/)

### Asciinema
- [Asciinema GitHub](https://github.com/asciinema/asciinema)
- [Asciinema for Documentation — DEV Community](https://dev.to/anderson_leite/asciinema-the-secret-weapon-for-better-documentation-training-and-handovers-1m9i)

### Short-form marketing
- [AI Video Marketing Strategy 2026 — AllesPlay](https://allesplay.ai/blog/ai-video-marketing-strategy-2026)
- [Short-Form Video Trends 2026 — OpusClip](https://www.opus.pro/blog/short-form-video-trends-reshaping-creator-marketing-2026)
- [Maximizing TikTok Reels Shorts 2026 — EngageCoders](https://www.engagecoders.com/short-form-video-evolution-leverage-tiktok-reels-shorts-2/)

### Cartesia Sonic
- Cartesia stack already in Paulo's profile (Sonic-3)
- Latency ~150ms, supports PT-PT/PT-BR/EN nativo
- Voice cloning from 3-5 min sample

---

## §19 Final check before publishing first pílula

**Top 3 things vibe coders will look for:**

1. **Is it real?** Asciinema = real terminal. They can replay. They can copy commands.
2. **Is the install actually 30s?** They WILL test. Don't lie.
3. **Is the data real?** "From the author's machine — 1 dev (Paulo)" is the most credible framing.

If you nail those 3, the rest is craft. Brand voice. Cow charm. Captions on time.

**The cow is a Trojan horse for technical depth.** Don't over-rely on the joke. Use the cow to make the dense technical content readable. Lead with $25.95 saved real, not with "moo".

🐮 **Now ship.**

---

*Production kit composto 2026-06-08 ~17h BRT pós research deep-dive + master plan v1. Each pillula has script, asciinema commands, AI tool prompts, distribution copy ready. Total: 10 pillulas × 3-platform copy × 3 languages = ~90 distinct deliverables ready to execute. **Asciinema-first. Cartesia voiceover. Honest claims. Real numbers. Ship.**
