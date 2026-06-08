// Wave 32 (Phase NEW3) — privacy audit. Scans a serialized export for PII /
// credential leaks BEFORE it is written to disk. The export must pass this audit;
// if it ever finds a violation, the export is the bug, not the audit.

export interface AuditViolation {
  kind: "email" | "bearer_token" | "private_key" | "secret_value" | "jwt";
  sample: string; // truncated, never the full secret
}

const PATTERNS: { kind: AuditViolation["kind"]; re: RegExp }[] = [
  { kind: "email", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
  { kind: "bearer_token", re: /\b(?:bearer\s+|sk-|ghp_|gho_|github_pat_)[A-Za-z0-9._-]{12,}/gi },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "private_key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function truncate(s: string): string {
  return s.length <= 8 ? s.slice(0, 2) + "…" : s.slice(0, 4) + "…" + s.slice(-2);
}

/**
 * Audit a serialized export. `knownSecrets` (e.g. the telemetry secret value)
 * are matched verbatim so a leaked secret is caught even if it doesn't match a
 * generic pattern. Returns [] when clean.
 */
export function auditExport(serialized: string, knownSecrets: string[] = []): AuditViolation[] {
  const out: AuditViolation[] = [];
  for (const { kind, re } of PATTERNS) {
    const m = serialized.match(re);
    if (m && m.length) out.push({ kind, sample: truncate(m[0]) });
  }
  for (const sec of knownSecrets) {
    if (sec && sec.length >= 8 && serialized.includes(sec)) {
      out.push({ kind: "secret_value", sample: truncate(sec) });
    }
  }
  return out;
}

export function isClean(serialized: string, knownSecrets: string[] = []): boolean {
  return auditExport(serialized, knownSecrets).length === 0;
}
