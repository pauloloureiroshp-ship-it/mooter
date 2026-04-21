/* Mooter landing — data shared across components */

window.LANDING_DATA = {
  // Live-counter stats (animated from 0 to these on page load)
  stats: {
    prompts:   14_283_641,   // prompts routed
    tokens:    2_847_930_000, // tokens optimized
    saved_usd: 184_723,      // total USD saved across users
    models:    12,           // models actively evaluated
  },

  // T0 local models — shown on landing w/ logos
  t0Models: [
    { name: "qwen2.5:3b",        vram: "2 GB",  provider: "alibaba",  role: "triage" },
    { name: "qwen2.5-coder:14b", vram: "9 GB",  provider: "alibaba",  role: "code" },
    { name: "qwen3:30b",         vram: "20 GB", provider: "alibaba",  role: "reason" },
    { name: "gemma2:9b",         vram: "6 GB",  provider: "gemma",    role: "general" },
    { name: "gemma3:e4b",        vram: "3 GB",  provider: "gemma",    role: "multimodal" },
    { name: "deepseek-r1:7b",    vram: "4 GB",  provider: "deepseek", role: "math" },
    { name: "llama3.2:3b",       vram: "2 GB",  provider: "meta",     role: "fast" },
    { name: "mistral:7b",        vram: "4 GB",  provider: "mistral",  role: "chat" },
  ],

  tiers: {
    t1: { name: "Claude Haiku",  provider: "anthropic", price: "$0.001", role: "Quick explanations, docstrings, simple transforms" },
    t2: { name: "Claude Sonnet", provider: "anthropic", price: "$0.003", role: "Bug investigation, root-cause analysis, technical planning" },
    t3: { name: "Claude Opus",   provider: "anthropic", price: "$0.015", role: "Architecture decisions, security reviews, production deploys" },
  },

  // Simulator hardware presets (popular picks shown as chips; rest in dropdown)
  gpus: [
    { id: "none",    label: "No GPU",          vram: 0,  t0Mix: 0.05, brand: "none" },
    { id: "m1",      label: "Apple M1/M2",     vram: 8,  t0Mix: 0.55, brand: "apple" },
    { id: "m3max",   label: "Apple M3 Max",    vram: 36, t0Mix: 0.78, brand: "apple" },
    { id: "rtx4070", label: "RTX 4070 (12GB)", vram: 12, t0Mix: 0.72, brand: "nvidia" },
    { id: "rtx4090", label: "RTX 4090 (24GB)", vram: 24, t0Mix: 0.82, brand: "nvidia" },
    { id: "h100",    label: "H100 (80GB)",     vram: 80, t0Mix: 0.88, brand: "nvidia" },
  ],
  // Extended list for dropdown ("other GPUs")
  gpusExtended: [
    { id: "m1",        label: "Apple M1",            vram: 8,  t0Mix: 0.48, brand: "apple" },
    { id: "m2",        label: "Apple M2",            vram: 8,  t0Mix: 0.52, brand: "apple" },
    { id: "m2pro",     label: "Apple M2 Pro",        vram: 16, t0Mix: 0.62, brand: "apple" },
    { id: "m2max",     label: "Apple M2 Max",        vram: 32, t0Mix: 0.72, brand: "apple" },
    { id: "m3",        label: "Apple M3",            vram: 8,  t0Mix: 0.54, brand: "apple" },
    { id: "m3pro",     label: "Apple M3 Pro",        vram: 18, t0Mix: 0.66, brand: "apple" },
    { id: "m3max",     label: "Apple M3 Max",        vram: 36, t0Mix: 0.78, brand: "apple" },
    { id: "m4",        label: "Apple M4",            vram: 16, t0Mix: 0.62, brand: "apple" },
    { id: "m4max",     label: "Apple M4 Max",        vram: 64, t0Mix: 0.84, brand: "apple" },
    { id: "rtx3060",   label: "RTX 3060 (12GB)",     vram: 12, t0Mix: 0.68, brand: "nvidia" },
    { id: "rtx3070",   label: "RTX 3070 (8GB)",      vram: 8,  t0Mix: 0.56, brand: "nvidia" },
    { id: "rtx3080",   label: "RTX 3080 (10GB)",     vram: 10, t0Mix: 0.64, brand: "nvidia" },
    { id: "rtx3090",   label: "RTX 3090 (24GB)",     vram: 24, t0Mix: 0.80, brand: "nvidia" },
    { id: "rtx4060",   label: "RTX 4060 (8GB)",      vram: 8,  t0Mix: 0.58, brand: "nvidia" },
    { id: "rtx4070",   label: "RTX 4070 (12GB)",     vram: 12, t0Mix: 0.72, brand: "nvidia" },
    { id: "rtx4080",   label: "RTX 4080 (16GB)",     vram: 16, t0Mix: 0.78, brand: "nvidia" },
    { id: "rtx4090",   label: "RTX 4090 (24GB)",     vram: 24, t0Mix: 0.82, brand: "nvidia" },
    { id: "rtx5080",   label: "RTX 5080 (16GB)",     vram: 16, t0Mix: 0.80, brand: "nvidia" },
    { id: "rtx5090",   label: "RTX 5090 (32GB)",     vram: 32, t0Mix: 0.86, brand: "nvidia" },
    { id: "a100",      label: "A100 (40GB)",         vram: 40, t0Mix: 0.85, brand: "nvidia" },
    { id: "a100-80",   label: "A100 (80GB)",         vram: 80, t0Mix: 0.88, brand: "nvidia" },
    { id: "h100",      label: "H100 (80GB)",         vram: 80, t0Mix: 0.90, brand: "nvidia" },
    { id: "h200",      label: "H200 (141GB)",        vram: 141,t0Mix: 0.92, brand: "nvidia" },
    { id: "amd7900",   label: "AMD RX 7900 XTX",     vram: 24, t0Mix: 0.78, brand: "amd" },
    { id: "amd7800",   label: "AMD RX 7800 XT",      vram: 16, t0Mix: 0.70, brand: "amd" },
    { id: "mi300x",    label: "AMD MI300X",          vram: 192,t0Mix: 0.90, brand: "amd" },
    { id: "intelarc",  label: "Intel Arc A770",      vram: 16, t0Mix: 0.60, brand: "intel" },
    { id: "none",      label: "No GPU / CPU only",   vram: 0,  t0Mix: 0.05, brand: "none" },
  ],
  oses: [
    { id: "mac",     label: "macOS",   logo: "apple" },
    { id: "win",     label: "Windows", logo: "windows" },
    { id: "linux",   label: "Linux",   logo: "linux" },
  ],
  subs: [
    { id: "api",      label: "API only",        logo: "anthropic", mult: 1.00 },
    { id: "pro",      label: "Claude Pro",      logo: "anthropic", mult: 0.85 },
    { id: "max",      label: "Claude Max",      logo: "anthropic", mult: 0.55 },
    { id: "plus",     label: "ChatGPT Plus",    logo: "openai",    mult: 0.78 },
    { id: "codex",    label: "Codex CLI",       logo: "openai",    mult: 0.72 },
    { id: "gemadv",   label: "Gemini Advanced", logo: "google",    mult: 0.82 },
    { id: "copilot",  label: "GitHub Copilot",  logo: "copilot",   mult: 0.88 },
    { id: "cursor",   label: "Cursor Pro",      logo: "cursor",    mult: 0.80 },
    { id: "grok",     label: "xAI Grok",        logo: "grok",      mult: 0.90 },
  ],
};
