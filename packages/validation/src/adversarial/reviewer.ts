// Adversarial reviewer (Wave 30 Phase H).
//
// A reviewer is prompted to REFUTE a claim through a specific lens. Defaulting
// to "refute when uncertain" is deliberate — it kills plausible-but-wrong
// findings before they survive into a synthesis. The LLM call is injected
// (`LlmCaller`) so the logic is unit-testable with a deterministic mock; the
// default caller hits a local Ollama model (qwen3:30b) over /api/generate.

export type Lens = "correctness" | "security" | "completeness" | "repro" | "doctrine";

export const LENSES: Lens[] = ["correctness", "security", "completeness", "repro", "doctrine"];

export interface ReviewTarget {
  id: string;
  claim: string;
  context?: string;
}

export type Verdict = "confirm" | "refute" | "uncertain";

export interface ReviewResult {
  reviewer: string;
  lens: Lens;
  verdict: Verdict;
  confidence: number; // 0..1
  rationale: string;
}

export type LlmCaller = (prompt: string) => Promise<string>;

const LENS_GUIDANCE: Record<Lens, string> = {
  correctness: "Is the claim factually/logically correct? Look for off-by-one, wrong assumptions, false premises.",
  security: "Could this introduce or miss a vulnerability? Injection, auth, secrets, supply chain, sandbox escape.",
  completeness: "Does the claim miss a case, modality, or edge condition needed to be true in general?",
  repro: "Would this actually reproduce / run as stated? Consider environment, deps, missing models, timing.",
  doctrine: "Does it violate Mooter doctrine? classify.js hard guardrail, privacy DP/k-anonymity, local-first, tag-after-merge.",
};

export function buildReviewPrompt(target: ReviewTarget, lens: Lens): string {
  return [
    `You are an adversarial reviewer. Your job is to REFUTE the following claim if at all possible.`,
    `Lens: ${lens} — ${LENS_GUIDANCE[lens]}`,
    ``,
    `CLAIM: ${target.claim}`,
    target.context ? `CONTEXT: ${target.context}` : "",
    ``,
    `Default to "refute" if you are uncertain. Answer in EXACTLY this format:`,
    `VERDICT: <confirm|refute|uncertain>`,
    `CONFIDENCE: <0.0-1.0>`,
    `RATIONALE: <one sentence>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function parseVerdict(text: string): { verdict: Verdict; confidence: number; rationale: string } {
  const lower = text.toLowerCase();
  let verdict: Verdict = "uncertain";
  const vMatch = lower.match(/verdict:\s*(confirm|refute|uncertain)/);
  if (vMatch) {
    verdict = vMatch[1] as Verdict;
  } else if (/\brefute(d|s)?\b/.test(lower) && !/\bconfirm(ed|s)?\b/.test(lower)) {
    verdict = "refute";
  } else if (/\bconfirm(ed|s)?\b/.test(lower) && !/\brefute(d|s)?\b/.test(lower)) {
    verdict = "confirm";
  }
  const cMatch = text.match(/confidence:\s*([0-9]*\.?[0-9]+)/i);
  const confidence = cMatch ? clamp01(parseFloat(cMatch[1])) : 0.5;
  const rMatch = text.match(/rationale:\s*(.+)/i);
  const rationale = (rMatch ? rMatch[1] : text.trim().split("\n").pop() ?? "").trim().slice(0, 240);
  return { verdict, confidence, rationale };
}

export async function review(
  target: ReviewTarget,
  lens: Lens,
  call: LlmCaller,
  reviewerName = `${lens}-reviewer`,
): Promise<ReviewResult> {
  let raw: string;
  try {
    raw = await call(buildReviewPrompt(target, lens));
  } catch (e) {
    // A reviewer that errors abstains conservatively (uncertain, low confidence).
    return { reviewer: reviewerName, lens, verdict: "uncertain", confidence: 0, rationale: `caller error: ${(e as Error).message}` };
  }
  const { verdict, confidence, rationale } = parseVerdict(raw);
  return { reviewer: reviewerName, lens, verdict, confidence, rationale };
}

// ─── default Ollama caller ──────────────────────────────────────────────────

export interface OllamaOptions {
  model?: string;
  host?: string;
  timeoutMs?: number;
  temperature?: number;
}

/** Build an LlmCaller backed by a local Ollama model via /api/generate. */
export function makeOllamaCaller(opts: OllamaOptions = {}): LlmCaller {
  const model = opts.model ?? "qwen3:30b";
  const host = opts.host ?? "http://localhost:11434";
  const timeoutMs = opts.timeoutMs ?? 120000;
  return async (prompt: string) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: opts.temperature ?? 0.2 },
        }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const json = (await res.json()) as { response?: string };
      return json.response ?? "";
    } finally {
      clearTimeout(t);
    }
  };
}

export async function ollamaReachable(host = "http://localhost:11434"): Promise<boolean> {
  try {
    const res = await fetch(`${host}/api/tags`, { method: "GET" });
    if (!res.ok) return false;
    const json = (await res.json()) as { models?: unknown[] };
    return Array.isArray(json.models) && json.models.length > 0;
  } catch {
    return false;
  }
}
