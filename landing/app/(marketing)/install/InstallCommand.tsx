'use client';

import { useState } from 'react';

/**
 * O comando de instalação.
 *
 * Era uma caixa: fundo `--color-surface`, contorno rosa e raio 12. A direcção
 * fixada a 2026-08-27 não tem caixas — o que separa é a hairline — e reserva o
 * rosa a três sítios: o `?` do wordmark, as linhas de cota, e o CTA. O contorno
 * rosa à volta de tudo gastava a cor no sítio errado e deixava o botão (que é o
 * CTA a sério desta folha) a competir com a moldura.
 *
 * Fica o comando entre duas hairlines, com a cota por baixo (na folha) a dizer
 * quanto mede. O rosa fica só no botão.
 */
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
        gap: 16,
        borderTop: '1px solid var(--color-border-light)',
        borderBottom: '1px solid var(--color-border-light)',
        padding: '22px 0',
      }}
    >
      <code
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 'clamp(15px, 2.4vw, 26px)',
          letterSpacing: '-0.01em',
          color: 'var(--color-text)',
          flex: 1,
          minWidth: 0,
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
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
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}
