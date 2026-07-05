'use client';

import { useEffect } from 'react';

/**
 * LpErrorTap — Live Preview · MP4 · DEV-ONLY mount for the Honest Diagnostics tap.
 *
 * Renders nothing. In production `process.env.NODE_ENV === 'development'` is statically false, so
 * the guarded `import('./lp-error-tap')` is dead code the bundler removes — the tap never reaches
 * a mooter.ai visitor's browser. In dev it installs the tap ONLY when the page is embedded
 * (framed by the Mooter cockpit's App Stage), so a normally-browsed dev page is untouched.
 */
export default function LpErrorTap(): null {
  useEffect(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      typeof window !== 'undefined' &&
      window.parent !== window
    ) {
      import('./lp-error-tap')
        .then((m) => m.installLpErrorTap())
        .catch(() => {
          /* dev-only convenience — never surface a failure to the page */
        });
    }
  }, []);

  return null;
}
