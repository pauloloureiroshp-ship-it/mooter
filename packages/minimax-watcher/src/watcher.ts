// Wave 33 (B.3) — MiniMax M3 weight watcher.
//
// As of 2026-06-08 the M3 weights are NOT public (the GitHub repo is a
// placeholder, no GGUF exists). Expected ~June 10-11. This watcher polls the
// HuggingFace model search for a `MiniMax-M3-GGUF` repo and reports availability.
// Rate-safe at 1 poll / 15 min. fetch is injectable so it is fully testable
// offline; a network failure reports "unknown", never throws.

export const HF_SEARCH_URL = "https://huggingface.co/api/models?search=MiniMax-M3-GGUF";

export interface Availability {
  /** true only when at least one matching GGUF repo exists. */
  available: boolean;
  /** repo ids found (e.g. "ox-ox/MiniMax-M3-GGUF"). */
  repos: string[];
  /** false when the poll itself failed (network/parse) — distinct from "not yet". */
  ok: boolean;
  note: string;
}

interface HfModel {
  id?: string;
  modelId?: string;
}

/**
 * Poll HuggingFace for MiniMax-M3 GGUF repos. Only repos whose id contains both
 * "minimax-m3" and "gguf" (case-insensitive) count, so an M2.7 result never
 * false-positives. Injectable fetch + timeout for tests.
 */
export async function checkAvailability(
  opts: { fetchImpl?: typeof fetch; url?: string } = {},
): Promise<Availability> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = opts.url ?? HF_SEARCH_URL;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      return { available: false, repos: [], ok: false, note: `HF search returned ${res.status}` };
    }
    const data = (await res.json()) as HfModel[];
    const repos = (Array.isArray(data) ? data : [])
      .map((m) => m.id || m.modelId || "")
      .filter((id) => {
        const lc = id.toLowerCase();
        return lc.includes("minimax-m3") && lc.includes("gguf");
      });
    return repos.length
      ? { available: true, repos, ok: true, note: `MiniMax M3 GGUF available: ${repos.join(", ")}` }
      : { available: false, repos: [], ok: true, note: "MiniMax M3 GGUF not on HuggingFace yet (expected ~June 10-11, 2026)." };
  } catch (e) {
    return { available: false, repos: [], ok: false, note: `poll failed: ${(e as Error).message}` };
  }
}
