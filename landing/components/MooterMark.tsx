// MooterMark — cow mascot, identity preserved verbatim (IMPLEMENTATION_SPEC §4.1).
// Paths unchanged from the original landing/app/page.tsx.

export default function MooterMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="mooter logo — routing your prompts smarter"
      role="img"
    >
      <path fill="#B8C0C8" d="M2 2c-1 1 1 7 4.5 8.5S11 6 10 6C6.5 6 4 0 2 2z" />
      <path fill="#B8C0C8" d="M34 2c1 1-1 7-4.5 8.5S25 6 26 6c3.5 0 6-6 8-4z" />
      <path fill="#F5D7D8" d="M4.5 3.5c-.5.5 1 5 3 6s3-3.5 2-3.5c-2 0-3.5-3-5-2.5z" />
      <path fill="#F5D7D8" d="M31.5 3.5c.5.5-1 5-3 6s-3-3.5-2-3.5c2 0 3.5-3 5-2.5z" />
      <path fill="#B8C0C8" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z" />
      <path fill="#B8C0C8" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z" />
      <path
        fill="#CCD3DA"
        d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"
      />
      <path
        fill="#EDAEB0"
        d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"
      />
      <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3" />
      <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3" />
      <path fill="#2C2F33" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z" />
      <path fill="#2C2F33" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z" />
    </svg>
  );
}

/** Minimal 2-tone cow mark for the in-terminal statusline strip. */
export function MooterMarkTiny({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} style={{ flexShrink: 0 }} aria-hidden="true">
      <path fill="#CCD3DA" d="M22 31h-8C9 31 4 27 4 21v-9C4 6 9 2 14 2h8C28 2 32 6 32 12v9C32 27 28 31 22 31z" />
      <path fill="#EDAEB0" d="M35 28c0 5-4 8-10 8H11C6 36 1 34 1 28s4-10 10-10h14c5 0 10 4 10 10z" />
    </svg>
  );
}
