'use client';

import { useState } from 'react';

// Click-to-copy chip for a single slash command. Same copy affordance as the
// install page's InstallCommand, scoped to the /mooter reference rows.
export default function CommandCopy({ command, tint }: { command: string; tint: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(command).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied ${command}` : `Copy ${command}`}
      style={{
        appearance: 'none',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        fontSize: 13,
        fontWeight: 600,
        color: copied ? 'var(--color-green)' : tint,
        whiteSpace: 'nowrap',
        textAlign: 'left',
      }}
    >
      {copied ? '✓ copied' : command}
    </button>
  );
}
