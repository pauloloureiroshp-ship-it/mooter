// `mooter feedback "<message>"` (Wave 6.5 D2). Sends anonymous, pseudonymous
// feedback to the landing /api/feedback endpoint. NO PII: only the message
// (capped 1000 chars), an optional topic/severity, the mooter version and the
// hardware CLASS travel — never email or raw user_id (auth.json already holds a
// one-way user_id_hash). The pure helpers are unit-tested; runFeedback is thin IO.

import { readAuth } from "./login.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export const TOPICS = ["bug", "feature", "performance", "docs", "other"] as const;
export const SEVERITIES = ["low", "medium", "high"] as const;
export type Topic = (typeof TOPICS)[number];
export type Severity = (typeof SEVERITIES)[number];

const MAX_MESSAGE = 1000;
// Conservative email matcher — used to refuse messages that leak an address.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export interface FeedbackInput {
  message: string;
  topic?: string;
  severity?: string;
  version?: string;
  hardwareClass?: Record<string, unknown>;
}

export interface FeedbackPayload {
  message: string;
  topic: Topic;
  severity: Severity;
  mooter_version: string;
  hardware_class: Record<string, unknown>;
}

/** Narrow a free-form topic to the allow-list, defaulting to "other". */
export function coerceTopic(v: unknown): Topic {
  const s = String(v ?? "").trim().toLowerCase();
  return (TOPICS as readonly string[]).includes(s) ? (s as Topic) : "other";
}

/** Narrow severity to the allow-list, defaulting to "low". */
export function coerceSeverity(v: unknown): Severity {
  const s = String(v ?? "").trim().toLowerCase();
  return (SEVERITIES as readonly string[]).includes(s) ? (s as Severity) : "low";
}

/** True when the message appears to contain an email address (refuse → no PII). */
export function looksLikePII(message: string): boolean {
  return EMAIL_RE.test(String(message ?? ""));
}

/**
 * Build the validated feedback payload. Throws on empty message or detected PII;
 * caps the message at 1000 chars. Pure — no IO.
 */
export function buildFeedbackPayload(input: FeedbackInput): FeedbackPayload {
  const message = String(input.message ?? "").trim();
  if (!message) throw new Error("empty_message");
  if (looksLikePII(message)) throw new Error("pii_detected");
  return {
    message: message.slice(0, MAX_MESSAGE),
    topic: coerceTopic(input.topic),
    severity: coerceSeverity(input.severity),
    mooter_version: input.version ?? "unknown",
    hardware_class: input.hardwareClass ?? {},
  };
}

export interface RunFeedbackOptions {
  message: string;
  topic?: string;
  severity?: string;
  version?: string;
  hardwareClass?: Record<string, unknown>;
  mooterHome?: string;
  landingUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Send feedback. Requires `mooter login` first. Returns a CmdResult. */
export async function runFeedback(opts: RunFeedbackOptions): Promise<CmdResult> {
  const auth = readAuth(opts.mooterHome);
  if (!auth?.access_token) {
    return { exitCode: 1, output: "✗ Run `mooter login` first." };
  }

  let payload: FeedbackPayload;
  try {
    payload = buildFeedbackPayload(opts);
  } catch (e) {
    const reason = (e as Error).message;
    if (reason === "pii_detected") {
      return { exitCode: 1, output: "✗ Message looks like it contains an email — feedback is anonymous, please remove it." };
    }
    return { exitCode: 1, output: "✗ Empty feedback message." };
  }

  const base = opts.landingUrl ?? process.env.MOOTER_LANDING_URL ?? "https://mooter.ai";
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${base}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { exitCode: 1, output: `✗ Feedback failed (HTTP ${res.status}).` };
    }
    const data = (await res.json()) as { id?: string };
    return {
      exitCode: 0,
      output: `✓ Feedback sent${data.id ? ` (id: ${data.id})` : ""}. Thank you!\nℹ Anonymous · pseudonymous user_id_hash · no PII attached`,
    };
  } catch {
    return { exitCode: 1, output: "✗ Could not reach mooter.ai — check your connection." };
  }
}
