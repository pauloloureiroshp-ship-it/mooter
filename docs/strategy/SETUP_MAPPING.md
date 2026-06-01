# Setup Mapping — `mooter init` detection → dashboard surface

> Wave 10 Phase B.2c (#6). Cross-reference of what the CLI probes on first run
> vs. where (if anywhere) it surfaces in the signed-in dashboard.
> Source: `packages/cli/src/commands/init.ts` (`probeHardware`),
> `landing/app/api/install-complete/route.ts` (sync payload),
> `landing/app/(app)/dashboard/page.tsx` (display).

## Mapping table

| Detected field (`mooter init`) | Sync payload (`install-complete`) | Dashboard surface | Status |
|---|---|---|---|
| `os` / `os_version` | `os_type`, `arch` | Device sidebar chip (`osLabel`), hardware footer | ✅ |
| `gpu.model` | `gpu_name` | Device row + ModelCard tooltip + hardware footer | ✅ |
| `gpu.vram_gb` | `gpu_vram_mb` | — (stored, never rendered) | ⚠️ gap |
| `ram_gb` / `cpu_cores` | (folded into `hw_tier`) | Hardware tier chip only | ◐ tier-only |
| `hw_tier` (derived) | `hw_tier` / `hardware_tier` | Device chip + Recommended Mode | ✅ |
| `ollama.available` | `has_ollama` | AI stack tile (Active/Inactive) | ✅ |
| `ollama.models[]` | `ollama_models[]`, `ollama_has_qwen3b/30b` | Setup tab uses flags; full model **list** not shown | ◐ flags-only |
| Anthropic key/plan | `has_anthropic_key` (+ `subscriptions`) | AI stack tile | ✅ |
| OpenAI key/plan | `has_openai_key` (+ `subscriptions`) | AI stack tile | ✅ |
| Google Gemini key/plan | `has_gemini_key` (+ `subscriptions`) | AI stack tile | ✅ **(fixed B.2c — was a gap; `GeminiLogo` existed but was never rendered)** |
| Pack recommendations | — (derived web-side) | "Recommended for you" card | ✅ |
| Adapter installed | — | — (runtime adapter_selection is always-null today; honest to omit) | n/a by design |
| `CLAUDE.md` path | — (not probed) | "Router Context for your CLAUDE.md" section (generic, not the detected path) | ⚠️ not probed |

## Decisions taken in B.2c

- **Gemini tile added** to the AI stack (`hasGemini` mirrors `hasOpenAI`: `subscriptions` match on `gemini`/`google` OR `config.has_gemini_key`). The detection already shipped in the sync payload; only the surface was missing.

## Remaining gaps (NOT fixed — flagged for a future wave)

- **GPU VRAM** is stored (`gpu_vram_mb`) but never displayed. Low value on its own; the hardware tier already encodes capacity. Surface only if a "why this tier?" explainer is built.
- **Ollama model list** — dashboard shows Active + qwen flags, not the full pulled-models list. A "models pulled" sub-list in the Setup tab would close this; deferred (no user signal it's needed).
- **CLAUDE.md path** is not probed by `init` at all. The dashboard's "Router Context" section is generic copy. Surfacing the real path requires a new probe field; out of scope.
