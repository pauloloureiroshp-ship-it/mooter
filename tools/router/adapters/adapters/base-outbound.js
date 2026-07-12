'use strict';

// FRENTE C · PM Adapters — outbound adapter base.
//
// An outbound adapter is a DUMB, one-way sender: given a coalesced summary and a token,
// it shapes an HTTP request (buildRequest) and hands it to a transport. It holds no
// enable/consent/debounce logic — the AdapterManager owns those gates and only calls
// deliver() once they all pass. Two defense-in-depth guards remain here so an adapter
// can never send without a token, and the transport is injectable so tests assert what
// WOULD be sent with zero network + zero cost.

/** Default transport — real HTTP via the built-in global fetch (Node 20+). Best-effort:
 *  never throws; a network error becomes { ok:false }. */
async function httpSend(req) {
  try {
    if (typeof fetch !== 'function') return { ok: false, status: 0, error: 'no_fetch' };
    const res = await fetch(req.url, {
      method: req.method || 'POST',
      headers: req.headers || {},
      body: req.body != null ? req.body : undefined,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: String((e && e.message) || e) };
  }
}

/**
 * Build an outbound adapter.
 * @param {object} o
 * @param {string} o.tool
 * @param {(summary:object, token:string)=>object} o.buildRequest → { url, method, headers, body }
 * @param {(req:object)=>Promise<object>} [o.transport] — injectable; defaults to real HTTP.
 */
function makeOutbound({ tool, buildRequest, transport = httpSend }) {
  return {
    tool,
    direction: 'outbound',
    /** Send a coalesced summary. Returns { ok, blocked?, status? }. Never throws. */
    async deliver(summary, { token } = {}) {
      try {
        if (!token) return { ok: false, blocked: 'no_token' };
        if (!summary || !Array.isArray(summary.items) || summary.items.length === 0) {
          return { ok: true, skipped: 'empty' };
        }
        const req = buildRequest(summary, token);
        if (!req || !req.url) return { ok: false, blocked: 'no_request' };
        const res = await transport(req);
        return { ok: !!(res && res.ok), status: res && res.status, ...(res && res.error ? { error: res.error } : {}) };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    },
  };
}

module.exports = { makeOutbound, httpSend };
