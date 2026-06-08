// Wave 33 (L11 / B.4) — provider status monitor.
//
// PRIVACY FIRST: this polls only PUBLIC status pages (statuspage.io JSON), never
// any inference endpoint, and NEVER sends a prompt anywhere. It reads the public
// incident indicator each provider already publishes. fetch is injectable; a
// failed poll yields "unknown" (never throws, never blocks routing).
//
// DOCTRINE: the output is ADVISORY. classify.js is INTACT — the tier a prompt
// gets is unchanged. The only thing arbitrage can influence is the WITHIN-tier
// model preference (e.g. prefer a healthy T2 provider over a degraded one). The
// tier floor always wins, exactly like Ultramoo.

export type Health = "operational" | "degraded" | "down" | "unknown";

export interface ProviderEndpoint {
  id: string;
  /** statuspage.io v2 summary JSON. */
  url: string;
}

// Public statuspage.io endpoints. Google Cloud uses a different format; it is
// intentionally omitted rather than parsed wrongly (honest > guessing).
export const PROVIDERS: ProviderEndpoint[] = [
  { id: "anthropic", url: "https://status.anthropic.com/api/v2/status.json" },
  { id: "openai", url: "https://status.openai.com/api/v2/status.json" },
];

/** Map a statuspage.io indicator to our health enum. */
export function indicatorToHealth(indicator: string | undefined): Health {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
      return "degraded";
    case "major":
    case "critical":
      return "down";
    default:
      return "unknown";
  }
}

export interface ProviderHealth {
  id: string;
  health: Health;
  description: string;
}

/** Poll one provider's public status page. Never throws. */
export async function pollProvider(
  ep: ProviderEndpoint,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ProviderHealth> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(ep.url);
    if (!res.ok) return { id: ep.id, health: "unknown", description: `status ${res.status}` };
    const data = (await res.json()) as { status?: { indicator?: string; description?: string } };
    const indicator = data.status?.indicator;
    return {
      id: ep.id,
      health: indicatorToHealth(indicator),
      description: data.status?.description ?? "",
    };
  } catch (e) {
    return { id: ep.id, health: "unknown", description: (e as Error).message };
  }
}

/** Poll every configured provider concurrently. */
export async function pollAll(
  opts: { fetchImpl?: typeof fetch; providers?: ProviderEndpoint[] } = {},
): Promise<ProviderHealth[]> {
  const providers = opts.providers ?? PROVIDERS;
  return Promise.all(providers.map((p) => pollProvider(p, { fetchImpl: opts.fetchImpl })));
}
