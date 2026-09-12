// Wave 14 — onboarding routing preview (pure). Extracted from page.tsx so it
// unit-tests in node-env AND so page.tsx keeps only the exports Next.js App
// Router allows on a route file (a named export there fails the `next build`
// "not a valid Page export field" check).
//
// 2026-08-24 (owner decision) — stop publishing savings until there are
// measured tokens. This card used to compose its headline from two hardcoded
// ratios and an assumed baseline: neither the amount nor the percentage came
// from a single counted token, and the percentage was composed by arithmetic,
// so it never appeared as a literal in the source. What the onboarding answers
// honestly support is WHERE each tier runs — a projection of the choices just
// made — plus the fact that the saving itself is not measured. Same line as
// README.md § Honest numbers ("Savings vs naive Opus | not measured").

export const LOCAL_HW = new Set([
  'mac_m_series',
  'windows_nvidia',
  'windows_amd',
  'linux_nvidia',
  'linux_amd',
]);

// `budget` stays in the parameter type — page.tsx passes the whole onboarding
// state and TypeScript's excess-property check would reject the call without
// it — but no longer feeds a figure, because there is no figure to feed.
export function estimateMonthlySavings({ hw, subs }: { hw: string; subs: string[]; budget: number }): string {
  const t0 = LOCAL_HW.has(hw) ? 'T0 on your own GPU' : 'T0 on Haiku';
  const rest = subs.length > 0
    ? `T1–T3 across your ${subs.length} provider${subs.length > 1 ? 's' : ''}`
    : 'T1–T3 on cloud APIs';
  const honest = 'savings not measured yet';
  return [t0, rest, honest].join(' · ');
}
