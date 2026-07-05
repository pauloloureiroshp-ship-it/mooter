'use client';

import { useEffect } from 'react';

/**
 * LpBoundaryReport — Live Preview · MP4.1 · DEV-ONLY, embedded-only relay of a React error boundary's
 * caught error to the Mooter cockpit's Honest Diagnostics strip. Mounted inside app/error.tsx AND
 * app/global-error.tsx. Renders nothing.
 *
 * WHY a boundary and not the tap's DOM observer (proven 2026-07-05): a Server Component throw hard-reloads
 * the framed dev server into Next's global-error page, where the root layout — and the <LpErrorTap/> tap
 * mounted in it — never render, and the HMR websocket carries only a bare `serverComponentChanges` signal
 * (no error text). The boundary that caught the throw is the one place the message + stack still exist, so
 * it relays them here. This is the channel that makes a server-side throw appear in the strip with file:line.
 *
 * PRODUCTION-SAFE: `process.env.NODE_ENV === 'development'` is statically false in a prod build, so the
 * guarded dynamic import is dead code the bundler tree-shakes out — it never reaches a mooter.ai visitor.
 * In dev it posts ONLY when embedded (framed by the cockpit); a normally-browsed dev error page is untouched.
 */
export default function LpBoundaryReport({ error }: { error: unknown }): null {
  useEffect(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      typeof window !== 'undefined' &&
      window.parent !== window
    ) {
      import('./lp-error-tap')
        .then((m) => m.reportBoundaryError(error))
        .catch(() => {
          /* dev-only convenience — never surface a failure on the error page itself */
        });
    }
  }, [error]);

  return null;
}
