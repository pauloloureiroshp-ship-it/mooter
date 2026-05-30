export default function LockChip({ text = 'your code stays local' }: { text?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--color-accent-2)',
        background: 'var(--color-accent-08)',
        border: '1px solid var(--color-accent-25)',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">🔒</span>
      {text}
    </span>
  );
}
