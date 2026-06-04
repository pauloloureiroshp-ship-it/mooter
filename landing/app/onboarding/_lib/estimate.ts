// Wave 14 — onboarding savings estimate (pure, directional). Extracted from
// page.tsx so it unit-tests in node-env AND so page.tsx keeps only the exports
// Next.js App Router allows on a route file (a named export there fails the
// `next build` "not a valid Page export field" check).
//
// Numbers are directional, anchored on real router accuracy (~88%) and tier
// cost ratios used in the landing page calculator.

export const LOCAL_HW = new Set([
  'mac_m_series',
  'windows_nvidia',
  'windows_amd',
  'linux_nvidia',
  'linux_amd',
]);

export function estimateMonthlySavings({ hw, subs, budget }: { hw: string; subs: string[]; budget: number }): string {
  const hasLocal = LOCAL_HW.has(hw);
  const hasMax = subs.includes('Claude Max');
  const effectiveBudget = budget === 999 ? 300 : budget; // "no limit" anchor
  // Rough mental model: without mooter, users burn ~$120/mo in Opus-only at moderate usage.
  // With mooter, local deflection + tier routing typically brings that down 70–90%.
  const floor = hasLocal ? 0.10 : 0.25;
  const baseline = hasMax ? 120 : Math.max(40, effectiveBudget * 4);
  const saved = Math.round(baseline * (1 - floor));
  if (hasLocal) return `Save ~$${saved}/mo · ${Math.round((1 - floor) * 100)}% less than Opus-only`;
  return `Save ~$${saved}/mo · ${Math.round((1 - floor) * 100)}% less than Opus-only (cloud-only routing)`;
}
