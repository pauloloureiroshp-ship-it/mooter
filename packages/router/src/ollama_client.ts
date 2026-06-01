// ollama_client.ts — minimal HTTP client for Ollama's /api/embed endpoint
// (Pastor Wave 2 Day 3). Used exclusively by embedding_store.ts to fetch
// nomic-embed-text vectors when classifying prompts on axis 2.
//
// Why a new client rather than reusing scripts/wave1-benchmark/lib/ollama-client?
// That one targets /api/generate (text completion, long timeouts, retry/backoff
// for benchmarks). This one targets /api/embed (sub-second, single attempt,
// short timeout) and lives in src/ so the production hook can import it.
//
// WSL2 reminder: Ollama runs on the Windows host; default URL is
// http://host.docker.internal:11434 (override via OLLAMA_HOST).
//
// Failure model: any error (network, timeout, non-2xx, malformed body) throws
// — embedding_store catches and falls back to v1 (regex-only) silently.

export const DEFAULT_OLLAMA_URL =
  process.env.OLLAMA_HOST ?? "http://host.docker.internal:11434";

const DEFAULT_TIMEOUT_MS = 2_000;

interface OllamaEmbedResponse {
  embeddings?: number[][];
}

export class OllamaClient {
  constructor(
    private readonly url: string = DEFAULT_OLLAMA_URL,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async embed(model: string, input: string): Promise<Float32Array> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.url}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
      const data = (await res.json()) as OllamaEmbedResponse;
      const vec = data.embeddings?.[0];
      if (!vec || vec.length === 0) throw new Error("Ollama embed returned no vector");
      return Float32Array.from(vec);
    } finally {
      clearTimeout(timer);
    }
  }
}
