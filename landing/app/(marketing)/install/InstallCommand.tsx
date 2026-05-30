'use client';

import { useState } from 'react';

export default function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(command).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-accent)',
        borderRadius: 12,
        padding: '18px 20px',
      }}
    >
      <code style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(15px, 2.4vw, 22px)', color: 'var(--color-text)', flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        style={{
          background: 'var(--color-accent)',
          color: '#1A0E0E',
          border: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontWeight: 600,
          fontFamily: 'var(--font)',
          flexShrink: 0,
        }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}
