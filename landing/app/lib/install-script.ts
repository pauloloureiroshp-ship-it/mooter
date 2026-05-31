// Wave 6 D2 — personalized install script generator + token validation.
//
// Pure + framework-free so it unit-tests in landing's node-env vitest. The
// /i/[token] route redeems a token and pipes the OUTPUT of
// generateInstallScript() back as text/plain — a plain, readable shell script
// (NOT obfuscated): a user can `curl mooter.ai/i/<token> | less` first.
//
// The config is ANONYMOUS — hardware class + persona + self-reported plan only.
// Never PII, never a secret. Values are interpolated through shellQuote() so a
// crafted config can't break out of the heredoc / inject commands.

/** The token shape minted by create_install_token (regex-guarded at the edge). */
export const INSTALL_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function isValidInstallToken(token: unknown): token is string {
  return typeof token === "string" && INSTALL_TOKEN_RE.test(token);
}

export interface InstallConfig {
  persona?: string;
  subscription_self_reported?: string;
  hardware_class?: { gpu_class?: string; ram_class?: string; os_class?: string };
}

/** Single-quote a value for safe POSIX-shell interpolation. */
function shellQuote(v: unknown): string {
  return `'${String(v ?? "").replace(/'/g, "'\\''")}'`;
}

/** A safe display token (alnum/_/-/space/./:), for echo lines only. */
function safeText(v: unknown, fallback: string): string {
  const s = String(v ?? "").trim();
  return /^[\w .:\-]{1,40}$/.test(s) ? s : fallback;
}

/**
 * Build the install script for a redeemed token's config. `now` is injectable
 * for deterministic tests. The script clones the repo, pre-seeds an anonymous
 * ~/.mooter/profile.json, and points the user at `mooter init` to finish.
 */
export function generateInstallScript(config: InstallConfig | null | undefined, now: Date = new Date()): string {
  const c = config ?? {};
  const rawHw = c.hardware_class ?? {};
  const persona = safeText(c.persona, "other");
  const plan = safeText(c.subscription_self_reported, "api-only");
  const gpu = safeText(rawHw.gpu_class, "unknown");
  const os = safeText(rawHw.os_class, "linux");
  // Sanitize every field that lands in the seeded profile — values are inert
  // inside the single-quoted heredoc, but we keep them clean regardless.
  const hw = {
    gpu_class: gpu,
    ram_class: safeText(rawHw.ram_class, "unknown"),
    os_class: os,
  };
  const profileJson = JSON.stringify(
    {
      persona,
      subscription_plan: plan,
      hardware: hw,
      pre_seeded_via_web: true,
      pre_seeded_at_utc: now.toISOString(),
    },
    null,
    2,
  );

  return `#!/usr/bin/env bash
# Mooter install script — generated ${now.toISOString()}
# Pre-config: ${persona} · ${plan} plan · ${gpu} GPU · ${os}
# This script is plain and readable — run \`curl ... | less\` to review it first.
set -euo pipefail

echo "🐮 Welcome to Mooter"
echo "  Pre-config: ${persona} · ${plan} plan · ${gpu} GPU"
echo

cd "\${HOME}"
if [ -d mooter/.git ]; then
  echo "ℹ Mooter directory exists. Updating..."
  cd mooter && git pull --ff-only
else
  git clone https://github.com/pauloloureiroshp-ship-it/mooter.git
  cd mooter && npm install
fi

# Pre-seed an ANONYMOUS profile (hardware class + persona only — no PII).
mkdir -p "\${HOME}/.mooter"
cat > "\${HOME}/.mooter/profile.json" <<'MOOTER_PROFILE_JSON'
${profileJson}
MOOTER_PROFILE_JSON

echo
echo "✓ Mooter pre-config saved to ~/.mooter/profile.json"
echo "  Persona ${shellQuote(persona)} pre-filled from the web wizard."
echo "  Run 'mooter init' to confirm hardware + add your provider keys."
`;
}

/** Tiny shell snippet returned for error cases (kept readable + safe). */
export function errorScript(message: string): string {
  const safe = message.replace(/[^\w .:\-/]/g, "");
  return `# ${safe}\necho ${shellQuote(safe)}; exit 1\n`;
}
