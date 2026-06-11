// OTLP/HTTP JSON exporter (Wave Mega 50-51 Phase 1.A).
//
// OTLP traces over HTTP is just a JSON POST to <endpoint>/v1/traces — no SDK
// needed. node:http/https only, short timeout, honest success/failure report.

import http from "node:http";
import https from "node:https";
import type { OtlpPayload } from "./convert.ts";

export interface ExportResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export type PostFn = (endpoint: string, payload: OtlpPayload, timeoutMs?: number) => Promise<ExportResult>;

/** POST the OTLP payload to <endpoint>/v1/traces. Never throws. */
export function postOtlp(endpoint: string, payload: OtlpPayload, timeoutMs = 3000): Promise<ExportResult> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      const base = endpoint.replace(/\/+$/, "");
      url = new URL(base.endsWith("/v1/traces") ? base : base + "/v1/traces");
    } catch {
      resolve({ ok: false, status: null, error: `invalid endpoint: ${endpoint}` });
      return;
    }
    const body = JSON.stringify(payload);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: timeoutMs,
      },
      (res) => {
        // Drain the response so the socket closes cleanly.
        res.resume();
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) resolve({ ok: true, status, error: null });
        else resolve({ ok: false, status, error: `collector responded HTTP ${status}` });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on("error", (err) => {
      resolve({ ok: false, status: null, error: err.message });
    });
    req.write(body);
    req.end();
  });
}
