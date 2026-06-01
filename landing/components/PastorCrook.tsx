// PastorCrook — the shepherd's-crook mark for Mooter (the routing brain). Component name kept (rename = Wave 3 backlog).
// 4 variations (IMPLEMENTATION_SPEC §7.5). Reads as a crook, never a candy cane
// or a question mark. Never rendered larger than the cow mascot.

type CrookProps = { size?: number };

export function CrookOutline({ size = 24 }: CrookProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter — the shepherd">
      <path d="M30 95 L30 35" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M30 35 Q30 10, 18 10 Q6 10, 8 22" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="30" cy="35" r="2" fill="#E8888A" />
    </svg>
  );
}

export function CrookSolid({ size = 24 }: CrookProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter — the shepherd">
      <path
        d="M27 95 L27 35 Q27 13, 18 13 Q9 13, 11 22 L5 22 Q2 7, 18 7 Q33 7, 33 35 L33 95 Z"
        fill="currentColor"
      />
      <circle cx="30" cy="35" r="2.5" fill="#E8888A" />
    </svg>
  );
}

export function CrookAnimated({ size = 24 }: CrookProps) {
  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 60 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Mooter — the shepherd"
        style={{ transformOrigin: '30px 95px', animation: 'crook-sway 3s ease-in-out infinite' }}
      >
        <path d="M30 95 L30 35" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M30 35 Q30 10, 18 10 Q6 10, 8 22" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
        <circle cx="30" cy="35" r="2" fill="#E8888A" />
      </svg>
      <style>{`@keyframes crook-sway { 0%,100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }`}</style>
    </>
  );
}

export function CrookWithCow({ size = 28 }: CrookProps) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 60 140" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter with the Moos">
      <path d="M30 95 L30 35" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M30 35 Q30 10, 18 10 Q6 10, 8 22" stroke="currentColor" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="30" cy="35" r="2" fill="#E8888A" />
      {/* small cow head silhouette below */}
      <ellipse cx="30" cy="118" rx="13" ry="11" fill="currentColor" opacity="0.85" />
      <path d="M19 110 Q15 104, 18 102 Q22 104, 22 110 Z" fill="currentColor" opacity="0.85" />
      <path d="M41 110 Q45 104, 42 102 Q38 104, 38 110 Z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export default CrookOutline;
