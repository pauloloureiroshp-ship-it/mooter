// Cost accounting — reuses the canonical router price table.
//
// We do NOT fork the numbers: tools/router/pricing.js is the single source of
// truth (frozen; "Never modify pricing constants without running npm test").
// Local Ollama inference is free, so agent() prices ollama at $0 by BACKEND and
// only calls priceTurn() for the cloud backend — this also avoids the table's
// Sonnet-tier fallback for worker models (e.g. qwen2.5-coder:7b) that aren't
// listed as ollama in PRICES.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface CanonicalPricing {
  priceTurn: (model: string | null | undefined, tokensIn: number, tokensOut: number) => number;
  PRICES: Record<string, { input?: number; output?: number }>;
}

let _canonical: CanonicalPricing | null = null;

function canonical(): CanonicalPricing | null {
  if (_canonical) return _canonical;
  try {
    // ../../../tools/router/pricing.js relative to packages/workflow/src/
    _canonical = require("../../../tools/router/pricing.js") as CanonicalPricing;
  } catch {
    _canonical = null;
  }
  return _canonical;
}

/** USD for a cloud turn. Returns 0 if the canonical table can't be loaded. */
export function priceTurn(model: string, tokensIn: number, tokensOut: number): number {
  const c = canonical();
  if (!c || typeof c.priceTurn !== "function") return 0;
  return c.priceTurn(model, tokensIn, tokensOut);
}

/** The canonical price table (read-only), or {} if unavailable. */
export function prices(): Record<string, { input?: number; output?: number }> {
  return canonical()?.PRICES ?? {};
}
