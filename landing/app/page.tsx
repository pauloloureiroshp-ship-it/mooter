'use client';

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type CSSProperties,
} from 'react';
import { env, HUB_URL } from './lib/env';

/* -----------------------------------------------------------------
 * Auth (preserved)
 * ----------------------------------------------------------------- */

function loginWithGitHub() {
  // env.ts will have thrown at module-load if this is missing, so no defensive
  // bail-with-no-error here (that was the 2026-04-13 P1 OAuth bug).
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const params = new URLSearchParams(window.location.search);
  if (params.get('cli') === '1') {
    sessionStorage.setItem('cli_login', '1');
  }
  const redirectTo = `${window.location.origin}/auth/callback`;
  window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;
}

/* -----------------------------------------------------------------
 * ErrorBoundary (preserved)
 * ----------------------------------------------------------------- */

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e: Error) { console.warn('[ErrorBoundary]', e.message); }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/* -----------------------------------------------------------------
 * Hooks (preserved)
 * ----------------------------------------------------------------- */

function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function useCommunityStats() {
  // Baseline = friends-beta seed snapshot 2026-05-05. Replaced as soon as
  // the hub responds. Numbers come from the cumulative all-time queries
  // shipped in stats.js on this same date — not personal session data.
  const [stats, setStats] = useState({
    prompt_count: 1437,
    savings_pct: 89.9,
    savings_usd: 6.29,
    user_count: 1,
  });
  const [live, setLive] = useState(false);

  useEffect(() => {
    const fetchStats = () =>
      fetch(
        HUB_URL + '/api/stats',
        { signal: AbortSignal.timeout(3000) },
      )
        .then(r => r.json())
        .then(data => {
          if (data?.prompt_count) {
            setStats({
              prompt_count: data.prompt_count,
              savings_pct: data.avg_savings_pct ?? 89.9,
              savings_usd: data.total_savings_usd ?? 0,
              user_count: data.user_count ?? 1,
            });
            setLive(true);
          }
        })
        .catch(() => {});

    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, []);

  return { stats, live };
}

function Reveal({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return (
    <div ref={ref} className={`reveal ${visible ? 'visible' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const visible = useInView(ref);

  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    let start = 0;
    const end = value;
    const duration = 1200;
    const step = (end / duration) * 16;
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); return; }
      setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [visible, value]);

  return (
    <span ref={ref}>
      {prefix}{decimals > 0 ? display.toFixed(decimals) : Math.floor(display).toLocaleString()}{suffix}
    </span>
  );
}

function fmtCompact(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return String(Math.floor(n));
}

/* -----------------------------------------------------------------
 * Logo — MOOTER_MARK (visible ears on beige)
 * ----------------------------------------------------------------- */

function MooterMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter">
      <path fill="#B8C0C8" d="M2 2c-1 1 1 7 4.5 8.5S11 6 10 6C6.5 6 4 0 2 2z"/>
      <path fill="#B8C0C8" d="M34 2c1 1-1 7-4.5 8.5S25 6 26 6c3.5 0 6-6 8-4z"/>
      <path fill="#F5D7D8" d="M4.5 3.5c-.5.5 1 5 3 6s3-3.5 2-3.5c-2 0-3.5-3-5-2.5z"/>
      <path fill="#F5D7D8" d="M31.5 3.5c.5.5-1 5-3 6s-3-3.5-2-3.5c2 0 3.5-3 5-2.5z"/>
      <path fill="#B8C0C8" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z"/>
      <path fill="#B8C0C8" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z"/>
      <path fill="#CCD3DA" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"/>
      <path fill="#EDAEB0" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"/>
      <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3"/>
      <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3"/>
      <path fill="#2C2F33" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
      <path fill="#2C2F33" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
    </svg>
  );
}

/* Minimal cow mark for the in-terminal statusline strip (2-tone) */
function MooterMarkTiny({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} style={{ flexShrink: 0 }}>
      <path fill="#CCD3DA" d="M22 31h-8C9 31 4 27 4 21v-9C4 6 9 2 14 2h8C28 2 32 6 32 12v9C32 27 28 31 22 31z" />
      <path fill="#EDAEB0" d="M35 28c0 5-4 8-10 8H11C6 36 1 34 1 28s4-10 10-10h14c5 0 10 4 10 10z" />
    </svg>
  );
}

/* -----------------------------------------------------------------
 * Provider icon chips (inline SVG, normalised 14px)
 * ----------------------------------------------------------------- */

function IconChip({ children, bg = '#fff' }: { children: ReactNode; bg?: string }) {
  return (
    <span className="model-logo" style={{ background: bg }}>
      {children}
    </span>
  );
}

const AnthropicGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#d97757" aria-hidden="true">
    <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
  </svg>
);

const OpenAIGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#111" aria-hidden="true">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
  </svg>
);

const GoogleGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#4285F4" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18a11 11 0 0 0 0 9.86z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
  </svg>
);

const OllamaGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#111" aria-hidden="true">
    <path d="M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002z" />
  </svg>
);

const MetaGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#0866FF" aria-hidden="true">
    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm5.8 7.57c-.62-.48-1.24-.73-1.83-.73-1.07 0-1.81.82-2.63 2.16.43.67.83 1.4 1.17 2.04.65 1.2 1.31 2.25 2.1 2.25.3 0 .55-.07.82-.2l.25.9c-.4.28-1 .45-1.66.45-1.33 0-2.05-1.1-2.88-2.58-.33-.6-.67-1.22-1.06-1.84-.62 1.14-1.6 2.92-2.33 3.7-.7.75-1.38 1.13-2.18 1.13-.95 0-1.66-.72-2.16-1.66l.71-.6c.33.55.73.88 1.22.88.56 0 1.05-.39 1.68-1.22.68-.88 1.62-2.62 2.4-4.06-.5-.85-.94-1.56-1.34-2-.61-.69-1.12-.95-1.75-.95-.34 0-.74.13-1.1.33l-.37-.88c.6-.3 1.3-.5 1.98-.5.86 0 1.5.33 2.16 1.03.45.48.96 1.24 1.43 2.08.67-1.26 1.74-3.1 3.54-3.1.77 0 1.53.23 2.3.7z" />
  </svg>
);

const DeepSeekGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#4D6BFE" aria-hidden="true">
    <text x="2" y="18" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="16">D</text>
  </svg>
);

const MistralGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="4" width="4" height="16" fill="#FF7000" />
    <rect x="18" y="4" width="4" height="16" fill="#FFD800" />
    <rect x="10" y="4" width="4" height="16" fill="#FF4E00" />
  </svg>
);

const QwenGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#615CED" aria-hidden="true">
    <text x="3" y="18" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="16">Q</text>
  </svg>
);

/* OS icons */
const AppleIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
  </svg>
);

const WindowsIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#00A4EF" aria-hidden="true">
    <path d="M2 3.5L10.2 2.4V11.5H2V3.5M11 2.3L22 1V11.4H11V2.3M2 12.5H10.2V21.6L2 20.5V12.5M11 12.5H22V23L11 21.5V12.5Z" />
  </svg>
);

const LinuxIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.504 2c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.08 1.134-.251 2.022-1.073 3.042-.967 1.19-2.326 3.007-2.72 5.021-.177.822-.158 1.646.04 2.3-.117.014-.23.032-.34.057-.856.162-1.5.67-1.5 1.512 0 .673.39 1.206.96 1.589.572.384 1.329.615 2.04.615.717 0 1.336-.12 2.068-.52.48-.262 1.001-.51 1.61-.645.09-.02.182-.04.275-.058.292-.055.594-.1.88-.12.068-.006.137-.008.204-.013V19a.7.7 0 0 0 .7.7h2.3a.7.7 0 0 0 .7-.7v-1.898c.066.005.135.007.204.013.286.02.588.065.88.12.093.018.185.038.275.058.61.135 1.13.383 1.61.645.732.4 1.351.52 2.068.52.71 0 1.468-.231 2.04-.615.57-.383.96-.916.96-1.589 0-.842-.644-1.35-1.5-1.512-.11-.025-.223-.043-.34-.057.199-.654.217-1.478.04-2.3-.394-2.014-1.753-3.831-2.72-5.021-.822-1.02-.993-1.908-1.074-3.042C15.29 6.808 16.413 2.334 12.186 2c-.165-.013-.325-.021-.48-.021-.057 0-.114 0-.17.002-.056-.002-.113-.002-.17-.002Z" />
  </svg>
);

const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ArrowRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const GitHubIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.1-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.3.46-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.92 1.24 3.22 0 4.6-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .31.22.7.83.57A12 12 0 0 0 12 .3" />
  </svg>
);

const VSCodeIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#007ACC" aria-hidden="true">
    <path d="M17.583.063a1.5 1.5 0 0 0-.875.375L8.29 7.689 3.375 3.95a1 1 0 0 0-1.293.082L.32 5.752a1 1 0 0 0 0 1.415L4.167 12 .32 16.833a1 1 0 0 0 0 1.415l1.762 1.72a1 1 0 0 0 1.293.082L8.29 16.31l8.418 7.252a1.5 1.5 0 0 0 .875.375A1.5 1.5 0 0 0 19.083 22.5V1.5A1.5 1.5 0 0 0 17.583.063zM17.5 18.27l-6.82-6.27 6.82-6.27z" />
  </svg>
);

/* -----------------------------------------------------------------
 * NAV
 * ----------------------------------------------------------------- */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-inner">
        <a href="#top" className="nav-brand" onClick={scrollTo('top')}>
          <MooterMark /> <span>mooter</span>
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#models" onClick={scrollTo('models')}>Models</a>
          <a href="#modes" onClick={scrollTo('modes')}>Modes</a>
          <a href="#statusline" onClick={scrollTo('statusline')}>Statusline</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
          <a href="#install" onClick={scrollTo('install')}>Install</a>
        </div>
        <div className="nav-right">
          <button
            onClick={loginWithGitHub}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            <GitHubIcon /> Sign in with GitHub
          </button>
          <a href="#install" onClick={scrollTo('install')} className="btn btn-primary">
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}

/* -----------------------------------------------------------------
 * Hero — terminal demo with 4 scenarios
 * ----------------------------------------------------------------- */

type HeroScene = {
  tier: string;
  tierColor: string;
  tierLabel: string;
  prompt: string;
  classify: string;
  level: string;
  levelCls: 'ok' | 'warn';
  route: string;
  routeColor: string;
  suffix: string;
  cost: string;
  costCls: 'ok' | 'warn';
  sessionN: number;
  sessionCost: string;
  sessionSaved: string;
  sessionPct: string;
};

const HERO_SCENES: HeroScene[] = [
  {
    tier: 'T0', tierColor: '#3D8B5E', tierLabel: 'local · free',
    prompt: '"make this button rounded"',
    classify: '8ms', level: 'TRIVIAL', levelCls: 'ok',
    route: '→ qwen2.5:3b', routeColor: '#E8888A', suffix: ' (local)',
    cost: '$0.000', costCls: 'ok',
    sessionN: 1, sessionCost: '$0.000', sessionSaved: '$0.048', sessionPct: '100%',
  },
  {
    tier: 'T1', tierColor: '#3D6FA8', tierLabel: 'haiku · fast',
    prompt: '"explain this TypeError"',
    classify: '11ms', level: 'EXPLAIN', levelCls: 'ok',
    route: '→ claude-haiku', routeColor: '#A0B8D8', suffix: '',
    cost: '$0.001', costCls: 'ok',
    sessionN: 2, sessionCost: '$0.001', sessionSaved: '$0.095', sessionPct: '99%',
  },
  {
    tier: 'T2', tierColor: '#7A5EA8', tierLabel: 'sonnet · reason',
    prompt: '"why does submit crash on iOS?"',
    classify: '12ms', level: 'INVESTIGATE', levelCls: 'ok',
    route: '→ claude-sonnet', routeColor: '#A88BD4', suffix: '',
    cost: '$0.003', costCls: 'ok',
    sessionN: 3, sessionCost: '$0.004', sessionSaved: '$0.140', sessionPct: '97%',
  },
  {
    tier: 'T3', tierColor: '#B8523F', tierLabel: 'opus · critical',
    prompt: '"design payment infra w/ stripe"',
    classify: '19ms', level: 'ARCHITECTURE', levelCls: 'warn',
    route: '→ claude-opus', routeColor: '#D46A5A', suffix: '',
    cost: '$0.042', costCls: 'warn',
    sessionN: 4, sessionCost: '$0.046', sessionSaved: '$0.146', sessionPct: '76%',
  },
];

function HeroTerminalDemo() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % HERO_SCENES.length);
        setVisible(true);
      }, 250);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const s = HERO_SCENES[idx];

  return (
    <div className="term">
      <div className="term-head">
        <div className="dots"><i /><i /><i /></div>
        <div className="title" style={{ marginLeft: 8 }}>mooter · live routing</div>
        <div
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: s.tierColor,
            fontFamily: 'var(--mono)',
            background: s.tierColor + '1A',
            border: '1px solid ' + s.tierColor + '44',
            borderRadius: 4,
            padding: '1px 7px',
            letterSpacing: '0.04em',
            transition: 'all 0.25s',
          }}
        >
          {s.tier} · {s.tierLabel}
        </div>
      </div>

      <div
        className="term-body"
        style={{
          transition: 'opacity 0.25s',
          opacity: visible ? 1 : 0,
          minHeight: 160,
        }}
      >
        {idx >= 1 && (
          <>
            <div style={{ opacity: 0.35 }}>
              <span className="muted">$</span>{' '}
              <span style={{ color: '#9A8F7E' }}>{HERO_SCENES[0].prompt}</span>{' '}
              <span className="muted">·</span>{' '}
              <span style={{ color: '#3D8B5E' }}>{HERO_SCENES[0].cost}</span>
            </div>
            <div style={{ height: 4 }} />
          </>
        )}
        {idx >= 2 && (
          <>
            <div style={{ opacity: 0.35 }}>
              <span className="muted">$</span>{' '}
              <span style={{ color: '#9A8F7E' }}>{HERO_SCENES[1].prompt}</span>{' '}
              <span className="muted">·</span>{' '}
              <span style={{ color: '#3D6FA8' }}>{HERO_SCENES[1].cost}</span>
            </div>
            <div style={{ height: 4 }} />
          </>
        )}
        {idx >= 3 && (
          <>
            <div style={{ opacity: 0.35 }}>
              <span className="muted">$</span>{' '}
              <span style={{ color: '#9A8F7E' }}>{HERO_SCENES[2].prompt}</span>{' '}
              <span className="muted">·</span>{' '}
              <span style={{ color: '#7A5EA8' }}>{HERO_SCENES[2].cost}</span>
            </div>
            <div style={{ height: 4 }} />
          </>
        )}

        <div>
          <span className="prompt">$</span> <span className="cmd">claude {s.prompt}</span>
        </div>
        <div>
          <span className="muted">  ├─ classify.js</span>{' '}
          <span className={s.levelCls}>{s.classify}</span>{' '}
          <span className="muted">→ {s.level}</span>
        </div>
        <div>
          <span className="muted">  └─ route</span>{' '}
          <span style={{ color: s.routeColor }}>{s.route}</span>
          {s.suffix && <span className="muted">{s.suffix}</span>}{' '}
          <span className={s.costCls}>{s.cost}</span>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid #2a241f',
          padding: '8px 20px',
          background: '#0A0807',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          transition: 'opacity 0.25s',
          opacity: visible ? 1 : 0,
        }}
      >
        <MooterMarkTiny />
        <span style={{ color: '#E8888A', fontWeight: 700 }}>mooter</span>
        <span style={{ color: '#3A332B' }}>│</span>
        <span style={{ color: '#F2ECDF', fontWeight: 700 }}>🐮 Moo</span>
        <span style={{ color: '#3A332B' }}>│</span>
        <span style={{ color: s.tierColor, fontWeight: 700 }}>{s.tier}</span>
        <span style={{ color: '#3A332B' }}>│</span>
        <span style={{ color: '#C8BFB2' }}>{s.sessionN}p</span>
        <span style={{ color: '#3A332B' }}>·</span>
        <span style={{ color: '#C8BFB2' }}>{s.sessionCost} spent</span>
        <span style={{ color: '#3A332B', marginLeft: 'auto' }}>·</span>
        <span style={{ color: '#6FB28C', fontWeight: 700 }}>
          {s.sessionSaved} saved ({s.sessionPct})
        </span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="hero" id="top">
      <div className="page">
        <div className="hero-grid">
          <div>
            <span className="hero-tag"><span className="dot" /> Open source · MIT · Free forever</span>
            <h1>
              You already have the setup.<br />
              You just don&apos;t know it yet. <span className="rose">*</span>
            </h1>
            <p className="lede">
              Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI stack.
              But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
              environment and routes every prompt to the optimal model.{' '}
              <strong style={{ color: 'var(--ink)' }}>Same results. Up to 90% less cost.</strong>
            </p>
            <div className="hero-cta">
              <a href="#install" className="btn btn-primary">
                Install mooter <ArrowRight />
              </a>
              <button onClick={loginWithGitHub} className="btn btn-secondary">
                <GitHubIcon /> Sign in with GitHub
              </button>
            </div>
            <div className="hero-micro">
              <span><CheckIcon size={12} /> Hook, not a proxy</span>
              <span><CheckIcon size={12} /> Runs locally</span>
              <span><CheckIcon size={12} /> &lt;50ms overhead</span>
            </div>
          </div>
          <div className="hero-visual"><HeroTerminalDemo /></div>
        </div>
      </div>
    </header>
  );
}

/* -----------------------------------------------------------------
 * Stats strip — live community stats + animated counters
 * ----------------------------------------------------------------- */

function StatsStrip() {
  const { stats, live } = useCommunityStats();
  return (
    <section className="band tight" style={{ paddingTop: 0 }}>
      <div className="page">
        <Reveal>
          <div className="stats">
            <div className="stat">
              <div className="v"><AnimatedNumber value={stats.prompt_count} /></div>
              <div className="k">Prompts routed</div>
              <div className="delta">{live ? 'last 7 days · community hub' : 'baseline · seed'}</div>
            </div>
            <div className="stat">
              <div className="v"><AnimatedNumber value={stats.savings_pct} decimals={1} suffix="%" /></div>
              <div className="k">Avg savings</div>
              <div className="delta">vs all-Opus · last 7d</div>
            </div>
            <div className="stat">
              <div className="v"><span className="unit">$</span><AnimatedNumber value={stats.savings_usd} decimals={2} /></div>
              <div className="k">Saved last 7d</div>
              <div className="delta">{stats.user_count} {stats.user_count === 1 ? 'profile' : 'profiles'} · rolling window</div>
            </div>
            <div className="stat">
              <div className="v">&lt;<AnimatedNumber value={50} />ms</div>
              <div className="k">Classify latency</div>
              <div className="delta">pure regex · local</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Flow diagram — 5-step
 * ----------------------------------------------------------------- */

function FlowDiagram() {
  const steps = [
    { n: '01', title: 'Prompt in',     desc: 'Your prompt enters the Claude Code hook — intercepted locally, zero network.', badge: 'hook' },
    { n: '02', title: 'Classify',      desc: '167 regex patterns score complexity, risk & intent in <50ms.', badge: 'classify.js' },
    { n: '03', title: 'Profile match', desc: 'Your GPU (probed via nvidia-smi / system_profiler), installed Ollama models, and the subscription profile you set in `mooter init` shape the decision.', badge: 'profile' },
    { n: '04', title: 'Route',         desc: 'Picks the cheapest model that meets the quality bar for this exact prompt.', badge: 'T0/T1/T2/T3' },
    { n: '05', title: 'Answer back',   desc: 'Best model responds. Decision logged, savings tracked, community learns.', badge: 'validate' },
  ];
  return (
    <section className="band" id="how">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Five stages. One hook. Zero proxies.</h2>
            <p className="lede muted">
              Every prompt flows through the same pipeline before touching any model. Pure regex, no API calls to classify, no cost to route.
            </p>
          </div>
        </Reveal>
        <Reveal>
          <div className="flow">
            {steps.map((s, i) => (
              <div key={s.n} style={{ display: 'contents' }}>
                <div className="flow-step">
                  <div className="n">{s.n}</div>
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                  <div className="badge">{s.badge}</div>
                </div>
                {i < steps.length - 1 && <div className="flow-arrow">→</div>}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Models section — 4-column tier grid with subscription labels
 * ----------------------------------------------------------------- */

const T0_MODELS = [
  { name: 'qwen2.5:3b',        vram: '2 GB',  role: 'triage',     glyph: QwenGlyph },
  { name: 'qwen2.5-coder:14b', vram: '9 GB',  role: 'code',       glyph: QwenGlyph },
  { name: 'qwen3:30b',         vram: '20 GB', role: 'reason',     glyph: QwenGlyph },
  { name: 'gemma2:9b',         vram: '6 GB',  role: 'general',    glyph: GoogleGlyph },
  { name: 'gemma3:e4b',        vram: '3 GB',  role: 'multimodal', glyph: GoogleGlyph },
  { name: 'deepseek-r1:7b',    vram: '4 GB',  role: 'math',       glyph: DeepSeekGlyph },
  { name: 'llama3.2:3b',       vram: '2 GB',  role: 'fast',       glyph: MetaGlyph },
  { name: 'mistral:7b',        vram: '4 GB',  role: 'chat',       glyph: MistralGlyph },
];

function ModelRow({ glyph, name, meta }: { glyph: ReactNode; name: string; meta: string }) {
  return (
    <div className="model-row">
      <IconChip>{glyph}</IconChip>
      <div className="grow">
        <div className="model-name">{name}</div>
        <div className="model-meta">{meta}</div>
      </div>
    </div>
  );
}

function ModelsSection() {
  return (
    <section className="band beige-2" id="models">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">The roster</span>
            <h2>Every model has a specialty.<br />Opus isn&apos;t always the answer.</h2>
            <p className="lede muted">
              A brain surgeon shouldn&apos;t put on band-aids. Mooter evaluates {T0_MODELS.length + 9} models across 4 tiers — and picks the right one per prompt.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="tiers">
            {/* T0 */}
            <div className="tier-col t0">
              <div className="top">
                <span className="tier t0">T0</span>
                <span className="price">local · $0.000</span>
              </div>
              <h3>Local on your hardware</h3>
              <p className="desc">Free. Runs on your GPU via Ollama. <code>mooter init</code> probes your GPU and recommends the model set that fits your VRAM. T0 is opt-in — skip it and cloud tiers still work.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                {T0_MODELS.map(m => (
                  <ModelRow key={m.name} glyph={m.glyph} name={m.name} meta={`${m.vram} · ${m.role}`} />
                ))}
              </div>
              <div className="ollama-tag">
                <IconChip>{OllamaGlyph}</IconChip> Served via Ollama runtime
              </div>
            </div>

            {/* T1 */}
            <div className="tier-col t1">
              <div className="top">
                <span className="tier t1">T1</span>
                <span className="price" title="Estimate only — varies by subscription plan and prompt length">~$0.001/prompt</span>
              </div>
              <h3>Fast &amp; cheap</h3>
              <ModelRow glyph={AnthropicGlyph} name="claude-haiku" meta="Free · Pro · Max · Team · API" />
              <ModelRow glyph={OpenAIGlyph}    name="gpt-4o-mini"  meta="Plus · Codex · API" />
              <ModelRow glyph={GoogleGlyph}    name="gemini-flash" meta="Advanced · API" />
              <p className="desc">Quick explanations, docstrings, simple transforms.</p>
              <p className="disclaimer">~ est. only — actual cost varies by subscription plan &amp; prompt length</p>
            </div>

            {/* T2 */}
            <div className="tier-col t2">
              <div className="top">
                <span className="tier t2">T2</span>
                <span className="price" title="Estimate only — varies by subscription plan and prompt length">~$0.003/prompt</span>
              </div>
              <h3>Balanced reasoning</h3>
              <ModelRow glyph={AnthropicGlyph} name="claude-sonnet" meta="Pro · Max · Team · API" />
              <ModelRow glyph={OpenAIGlyph}    name="gpt-4o"        meta="Plus · Codex · API" />
              <ModelRow glyph={GoogleGlyph}    name="gemini-2-pro"  meta="Advanced · API" />
              <p className="desc">Bug investigation, root-cause analysis, technical planning.</p>
              <p className="disclaimer">~ est. only — actual cost varies by subscription plan &amp; prompt length</p>
            </div>

            {/* T3 */}
            <div className="tier-col t3">
              <div className="top">
                <span className="tier t3">T3</span>
                <span className="price" title="Estimate only — varies by subscription plan and prompt length">~$0.015/prompt</span>
              </div>
              <h3>Elite / critical</h3>
              <ModelRow glyph={AnthropicGlyph} name="claude-opus"  meta="Max · Team · API (limited on Pro)" />
              <ModelRow glyph={OpenAIGlyph}    name="o1-pro"       meta="Pro · API" />
              <ModelRow glyph={GoogleGlyph}    name="gemini-ultra" meta="Ultra · API" />
              <p className="desc">Architecture decisions, security reviews, production deploys.</p>
              <p className="disclaimer">~ est. only — actual cost varies by subscription plan &amp; prompt length</p>
              <div className="guardrail">
                Guardrail: migrations, secrets &amp; deploys are <em>always</em> routed here.
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Statusline section — 6-row TTY mockup (what you see after install)
 * ----------------------------------------------------------------- */

function StatuslineSection() {
  return (
    <section className="band" id="statusline">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">Your terminal, upgraded</span>
            <h2>What appears in your terminal after install.</h2>
            <p className="lede muted">
              A live HUD in your statusline: current model, tier, token spend, savings, share of each tier, and a nudge when you&apos;re close to the plan cap. Updates in real time — no extra window, no context switch.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="statusline-wrap">
            <div className="term-head dark">
              <div className="dots"><i /><i /><i /></div>
              <div className="title" style={{ marginLeft: 8 }}>~/my-app · claude-code · mooter active</div>
              <div style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--mono)', color: '#6FB28C', letterSpacing: '0.06em' }}>
                ● connected
              </div>
            </div>

            <div className="sl-convo">
              <div className="sl-convo-line muted">$ mooter &quot;refactor the auth middleware for session tokens&quot;</div>
              <div className="sl-convo-line">
                <span className="sl-convo-prompt">▸</span> working in <span style={{ color: '#F2ECDF' }}>lib/auth/middleware.ts</span>…
              </div>
            </div>

            <div className="statusline">
              {/* row 1: brand + mode trio (auto/beast/zen) */}
              <div className="sl-row">
                <span className="sl-cow"><MooterMarkTiny size={14} /></span>
                <span className="sl-brand">mooter</span>
                <span className="sl-sep">│</span>
                <span className="sl-cell">
                  <b style={{ color: '#F2ECDF' }}>🐮 Moo</b>
                  <span className="sl-dim"> · CrazyMoo · LazyMoo</span>
                </span>
                <span className="sl-sep">│</span>
                <span className="sl-cell"><span className="sl-dim">model</span> <span className="sl-k sl-model" style={{ color: '#A88BD4' }}>claude-sonnet</span></span>
                <span className="sl-sep">│</span>
                <span className="sl-cell"><span className="sl-dim">tier</span> <span className="sl-k" style={{ color: '#A88BD4' }}>T2</span></span>
                <span className="sl-sep">│</span>
                <span className="sl-cell"><span className="sl-dim">classify</span> <span className="sl-num">14ms</span></span>
                <span className="sl-sep">│</span>
                <span className="sl-cell"><span className="sl-dim">ctx</span> <span className="sl-ctx">63%</span></span>
              </div>

              {/* row 2: session spend + saved */}
              <div className="sl-row">
                <span className="sl-cell"><span className="sl-dim">session</span> <span className="sl-num">42 prompts</span></span>
                <span className="sl-sep">·</span>
                <span className="sl-cell sl-spent">$0.184 spent</span>
                <span className="sl-sep">·</span>
                <span className="sl-cell sl-save">$1.68 saved</span>
                <span className="sl-sep">·</span>
                <span className="sl-cell sl-save">90% vs all-Opus</span>
                <span className="sl-grow" />
                <span className="sl-chip green">
                  <span className="sl-dot" style={{ background: '#6FB28C' }} /> healthy
                </span>
              </div>

              {/* row 3: tier share bar */}
              <div className="sl-row">
                <span className="sl-dim" style={{ minWidth: 58 }}>routing</span>
                <div className="sl-share-bar" style={{ flex: 1 }}>
                  <span className="sl-share-seg" style={{ width: '58%', background: '#3D8B5E' }} />
                  <span className="sl-share-seg" style={{ width: '22%', background: '#5A9BD4' }} />
                  <span className="sl-share-seg" style={{ width: '14%', background: '#A88BD4' }} />
                  <span className="sl-share-seg" style={{ width: '6%',  background: '#D46A5A' }} />
                </div>
              </div>

              {/* row 4: legend */}
              <div className="sl-row">
                <span className="sl-legend"><span className="sl-dot" style={{ background: '#3D8B5E' }} /><span className="sl-legend-k">T0</span> <span className="sl-legend-pct">58% local</span></span>
                <span className="sl-legend"><span className="sl-dot" style={{ background: '#5A9BD4' }} /><span className="sl-legend-k">T1</span> <span className="sl-legend-pct">22% haiku</span></span>
                <span className="sl-legend"><span className="sl-dot" style={{ background: '#A88BD4' }} /><span className="sl-legend-k">T2</span> <span className="sl-legend-pct">14% sonnet</span></span>
                <span className="sl-legend"><span className="sl-dot" style={{ background: '#D46A5A' }} /><span className="sl-legend-k">T3</span> <span className="sl-legend-pct">6% opus</span></span>
              </div>

              {/* row 5: plan awareness */}
              <div className="sl-row">
                <span className="sl-chip"><span className="sl-dim">plan</span> <b>Claude Max</b></span>
                <span className="sl-chip"><span className="sl-dim">quota</span> <b>43/80</b> prompts</span>
                <span className="sl-chip ticky">next reset · 4h 12m</span>
                <span className="sl-grow" />
                <span className="sl-dim">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.10.1'} · sha {process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'}</span>
              </div>

              {/* row 6: community pulse */}
              <div className="sl-row">
                <span className="sl-dim">community</span>
                <span className="sl-cell"><span className="sl-num">14.2M</span> prompts</span>
                <span className="sl-sep">·</span>
                <span className="sl-cell"><span className="sl-num">$184K</span> saved</span>
                <span className="sl-sep">·</span>
                <span className="sl-cell">weekly patterns updated <span className="sl-save">✓</span></span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="statusline-callouts">
            <div className="callout">
              <div className="callout-k">MODEL</div>
              <h4>Live current model</h4>
              <p>See which model mooter routed the current prompt to — no tab-switching, no guessing.</p>
            </div>
            <div className="callout">
              <div className="callout-k">SPEND</div>
              <h4>Real-time cost tracking</h4>
              <p>Cumulative session spend and savings vs the all-Opus baseline, updated per prompt.</p>
            </div>
            <div className="callout">
              <div className="callout-k">SHARE</div>
              <h4>Tier distribution</h4>
              <p>At-a-glance bar showing what % of your prompts go to each tier. Healthy sessions skew green.</p>
            </div>
            <div className="callout">
              <div className="callout-k">PLAN</div>
              <h4>Subscription awareness</h4>
              <p>Your plan quota, usage and reset timer — so you never hit the wall mid-session.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Modes section — Moo / CrazyMoo / LazyMoo
 * ----------------------------------------------------------------- */

function ModesSection() {
  return (
    <section className="band beige-2" id="modes">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">The mood control</span>
            <h2>Moo. CrazyMoo. LazyMoo.<br />Three moods. One command away.</h2>
            <p className="lede muted">
              Sometimes you want max savings. Sometimes you&apos;re shipping and cost is irrelevant. Sometimes you want
              mooter to just figure it out. Each mood caps the router differently — and you can swap mid-session.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="modes">
            {/* Moo (auto) — default */}
            <div className="mode-card moo">
              <div className="mode-head">
                <span className="mode-emoji" aria-hidden="true">🐮</span>
                <div className="mode-meta">
                  <div className="mode-name">Moo</div>
                  <div className="mode-sub">auto · default</div>
                </div>
                <span className="mode-cap">T0 → T3</span>
              </div>
              <p className="mode-desc">
                The balanced brain. Mooter classifies every prompt and routes to the cheapest model that meets the
                quality bar. This is what you get out of the box — and where 90% of savings actually come from.
              </p>
              <div className="mode-pulse">
                <MooterMarkTiny size={12} />
                <b style={{ color: '#F2ECDF' }}>Moo</b>
                <span className="sl-sep">│</span>
                <span className="sl-dim">model</span>{' '}
                <span style={{ color: '#A88BD4' }}>claude-sonnet</span>
                <span className="sl-grow" />
                <span className="sl-save">90% saved</span>
              </div>
              <div className="mode-cmd">
                <code>/mooter-auto</code>
                <span className="sl-dim"> · or just don&apos;t override</span>
              </div>
              <div className="mode-when">
                <span className="mode-when-k">When</span>
                <span>Any normal day. The default. 90%+ of sessions.</span>
              </div>
            </div>

            {/* CrazyMoo (beast) — force Opus */}
            <div className="mode-card crazymoo">
              <div className="mode-head">
                <span className="mode-emoji" aria-hidden="true">🐂</span>
                <div className="mode-meta">
                  <div className="mode-name">CrazyMoo</div>
                  <div className="mode-sub">beast · force T3</div>
                </div>
                <span className="mode-cap warn">T3 only</span>
              </div>
              <p className="mode-desc">
                Cost is irrelevant. Force claude-opus on every prompt — even the trivial ones. For when you&apos;re
                shipping a release, debugging in production, or just want maximum horsepower with no
                second-guessing.
              </p>
              <div className="mode-pulse">
                <MooterMarkTiny size={12} />
                <b style={{ color: '#F2ECDF' }}>CrazyMoo</b>
                <span className="sl-sep">│</span>
                <span className="sl-dim">model</span>{' '}
                <span style={{ color: '#D46A5A' }}>claude-opus</span>
                <span className="sl-grow" />
                <span style={{ color: '#D46A5A' }}>$0.046 spent</span>
              </div>
              <div className="mode-cmd">
                <code>/mooter-beast</code>
                <span className="sl-dim"> · until you switch back</span>
              </div>
              <div className="mode-when">
                <span className="mode-when-k">When</span>
                <span>Pre-release, prod incident, deep refactor. Burn the credits.</span>
              </div>
            </div>

            {/* LazyMoo (zen) — cap at T1 */}
            <div className="mode-card lazymoo">
              <div className="mode-head">
                <span className="mode-emoji" aria-hidden="true">🐄</span>
                <div className="mode-meta">
                  <div className="mode-name">LazyMoo</div>
                  <div className="mode-sub">zen · cap at T1</div>
                </div>
                <span className="mode-cap save">T0 / T1</span>
              </div>
              <p className="mode-desc">
                Maximum savings, zero compromise on availability. Cap the router at T1 — Haiku and local Ollama
                only. Guardrails still escalate to Opus for migrations, secrets and deploys, no matter the mood.
              </p>
              <div className="mode-pulse">
                <MooterMarkTiny size={12} />
                <b style={{ color: '#F2ECDF' }}>LazyMoo</b>
                <span className="sl-sep">│</span>
                <span className="sl-dim">model</span>{' '}
                <span style={{ color: '#3D8B5E' }}>qwen2.5:3b</span>
                <span className="sl-grow" />
                <span className="sl-save">100% saved</span>
              </div>
              <div className="mode-cmd">
                <code>/mooter-zen</code>
                <span className="sl-dim"> · safe to leave on</span>
              </div>
              <div className="mode-when">
                <span className="mode-when-k">When</span>
                <span>Out of credits, exploration, drafting, learning a new codebase.</span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="modes-foot">
            <span className="sl-dim">Switch any time.</span>{' '}
            <code>/mooter-auto</code>{' '}
            <span className="sl-dim">resets to default. Mood is per-session, persisted across restarts.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Terminal compare — interactive replay
 * ----------------------------------------------------------------- */

type TCPrompt = {
  cmd: string;
  opus: { model: string; cost: string; time: string };
  mooter: { tier: string; model: string; cost: string; time: string; cls: 'ok' | 'warn' };
};

const TC_PROMPTS: TCPrompt[] = [
  { cmd: '"fix login button color"',           opus: { model: 'claude-3-opus', cost: '$0.048', time: '6.2s' }, mooter: { tier: 'T0', model: 'qwen2.5:3b (local)',       cost: '$0.000', time: '0.4s', cls: 'ok'   } },
  { cmd: '"explain this TypeError"',           opus: { model: 'claude-3-opus', cost: '$0.051', time: '7.1s' }, mooter: { tier: 'T1', model: 'claude-haiku',             cost: '$0.001', time: '1.1s', cls: 'ok'   } },
  { cmd: '"rename var userInfo → currentUser"', opus: { model: 'claude-3-opus', cost: '$0.039', time: '5.4s' }, mooter: { tier: 'T0', model: 'qwen2.5:3b (local)',       cost: '$0.000', time: '0.3s', cls: 'ok'   } },
  { cmd: '"refactor auth for multi-tenant"',   opus: { model: 'claude-3-opus', cost: '$0.052', time: '8.1s' }, mooter: { tier: 'T3', model: 'claude-opus (guardrail)',  cost: '$0.052', time: '8.1s', cls: 'warn' } },
];

function TerminalCompare() {
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);

  const replay = () => {
    if (running) return;
    setStep(-1);
    setRunning(true);
    let i = 0;
    const advance = () => {
      setStep(i);
      i++;
      if (i < TC_PROMPTS.length) setTimeout(advance, 900);
      else setRunning(false);
    };
    setTimeout(advance, 300);
  };

  const opusTotal   = TC_PROMPTS.slice(0, step + 1).reduce((a, p) => a + parseFloat(p.opus.cost.slice(1)), 0);
  const mooterTotal = TC_PROMPTS.slice(0, step + 1).reduce((a, p) => a + parseFloat(p.mooter.cost.slice(1)), 0);
  const savedAmt = opusTotal - mooterTotal;
  const savedPct = opusTotal > 0 ? Math.round((savedAmt / opusTotal) * 100) : 0;
  const visible = (i: number) => step >= i;

  return (
    <section className="band beige-2">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">Same prompts · Different bill</span>
            <h2>The difference shows up in your terminal.</h2>
            <p className="lede muted">
              Four identical prompts sent to Claude Code. Left: every single one goes to Opus. Right: mooter routes each to the right model. Quality: same. Cost: a fraction.
            </p>
          </div>
        </Reveal>

        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={replay}
            disabled={running}
            style={{ fontSize: 13, padding: '9px 18px' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.9" />
            </svg>
            {running ? 'running session…' : step < 0 ? 'Run session' : 'Replay'}
          </button>
          {step >= 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-ink)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span>{step + 1} / {TC_PROMPTS.length} prompts</span>
              {!running && step >= TC_PROMPTS.length - 1 && (
                <span style={{ color: 'var(--t0-green)', fontWeight: 700 }}>✓ session complete</span>
              )}
            </div>
          )}
        </div>

        <div className="term-compare">
          {/* Without */}
          <div className="without">
            <div className="term-label">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#B8523F' }} />
              Without mooter
            </div>
            <div className="term">
              <div className="term-head">
                <div className="dots"><i /><i /><i /></div>
                <div className="title" style={{ marginLeft: 8 }}>claude-code · session</div>
                {step >= 0 && (
                  <div style={{ marginLeft: 'auto', fontSize: 10.5, fontFamily: 'var(--mono)', color: '#D46A5A', fontWeight: 700 }}>
                    ${opusTotal.toFixed(3)}
                  </div>
                )}
              </div>
              <div className="term-body" style={{ minHeight: 170 }}>
                {TC_PROMPTS.map((p, i) => !visible(i) ? null : (
                  <div key={i}>
                    <div style={{ animation: step === i ? 'fadeIn 0.3s ease' : undefined }}>
                      <span className="prompt">$</span> <span className="cmd">{p.cmd}</span>
                    </div>
                    <div>
                      <span className="muted">  → {p.opus.model}</span>{' '}
                      <span className="err">{p.opus.cost} · {p.opus.time}</span>
                    </div>
                    {i < TC_PROMPTS.length - 1 && <div style={{ height: 6 }} />}
                  </div>
                ))}
                {step >= TC_PROMPTS.length - 1 && (
                  <>
                    <div style={{ height: 10, borderTop: '1px solid #2a241f', marginTop: 12, paddingTop: 12 }} />
                    <div style={{ color: '#D46A5A' }}>● session · 4 prompts · $0.190 · avg 6.7s</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>every prompt → Opus. no routing layer.</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* With */}
          <div className="with">
            <div className="term-label">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3D8B5E' }} />
              With mooter
            </div>
            <div className="term">
              <div className="term-head">
                <div className="dots"><i /><i /><i /></div>
                <div className="title" style={{ marginLeft: 8 }}>mooter · classify → route</div>
                {step >= 0 && (
                  <div style={{ marginLeft: 'auto', fontSize: 10.5, fontFamily: 'var(--mono)', color: '#6FB28C', fontWeight: 700 }}>
                    ${mooterTotal.toFixed(3)}
                  </div>
                )}
              </div>
              <div className="term-body" style={{ minHeight: 170 }}>
                {TC_PROMPTS.map((p, i) => !visible(i) ? null : (
                  <div key={i}>
                    <div style={{ animation: step === i ? 'fadeIn 0.3s ease' : undefined }}>
                      <span className="prompt">$</span> <span className="cmd">{p.cmd}</span>
                    </div>
                    <div>
                      <span className="muted">  {p.mooter.tier} → {p.mooter.model}</span>{' '}
                      <span className={p.mooter.cls}>{p.mooter.cost} · {p.mooter.time}</span>
                    </div>
                    {i < TC_PROMPTS.length - 1 && <div style={{ height: 6 }} />}
                  </div>
                ))}
                {step >= TC_PROMPTS.length - 1 && (
                  <>
                    <div style={{ height: 10, borderTop: '1px solid #2a241f', marginTop: 12, paddingTop: 12 }} />
                    <div style={{ color: '#6FB28C' }}>● session · 4 prompts · $0.053 · avg 2.5s</div>
                    <div className="rose" style={{ fontSize: 11, marginTop: 4 }}>saved $0.137 · 72% · faster on 3 of 4</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {step >= 0 ? (
          <div className="term-savings-strip">
            <div>
              <span className="tiny">Without</span>
              <span className="big" style={{ color: '#B8523F' }}>${opusTotal.toFixed(3)}</span>
            </div>
            <div style={{ color: 'var(--faint-ink)', fontSize: 18 }}>→</div>
            <div>
              <span className="tiny">With mooter</span>
              <span className="big" style={{ color: 'var(--rose)' }}>${mooterTotal.toFixed(3)}</span>
            </div>
            {savedAmt > 0 && (
              <>
                <div style={{ color: 'var(--faint-ink)', fontSize: 18 }}>·</div>
                <div>
                  <span className="tiny">Saved</span>
                  <span className="big" style={{ color: 'var(--t0-green)' }}>{savedPct}%</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 32, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--mono)', fontSize: 13, opacity: 0.6 }}>
            <div>
              <span className="muted" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Without</span>{' '}
              <span style={{ fontSize: 22, fontWeight: 600 }}>$0.190</span>
            </div>
            <div style={{ color: 'var(--faint-ink)' }}>→</div>
            <div>
              <span className="muted" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>With mooter</span>{' '}
              <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--rose)' }}>$0.053</span>
            </div>
            <div style={{ color: 'var(--faint-ink)' }}>·</div>
            <div style={{ color: 'var(--t0-green)', fontWeight: 700 }}>72% saved · click &ldquo;Run session&rdquo; ↑</div>
          </div>
        )}
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Compare section — 8-row table
 * ----------------------------------------------------------------- */

type CmpStatus = 'yes' | 'no' | 'meh';

const CMP_ROWS: {
  f: string;
  mooter:     [CmpStatus, string];
  litellm:    [CmpStatus, string];
  openrouter: [CmpStatus, string];
  cursor:     [CmpStatus, string];
  plain:      [CmpStatus, string];
}[] = [
  { f: 'Works natively with Claude Code', mooter: ['yes', 'Hook-based, no proxy'],      litellm: ['meh', 'Custom config'],    openrouter: ['no',  'Different CLI'],   cursor: ['no',  'Cursor-only'],   plain: ['yes', 'But no routing']   },
  { f: 'No proxy / no interception',      mooter: ['yes', 'Zero MitM'],                 litellm: ['no',  'Proxy server'],     openrouter: ['no',  'Cloud proxy'],     cursor: ['no',  'Intercepts all'], plain: ['yes', 'Direct']           },
  { f: 'Local model support',             mooter: ['yes', 'Hardware-aware'],            litellm: ['yes', 'Manual config'],    openrouter: ['no',  'Cloud only'],      cursor: ['meh', 'Limited'],       plain: ['no',  'API only']         },
  { f: 'Hardware-aware routing',          mooter: ['yes', 'GPU probe + VRAM-aware'],    litellm: ['no',  '—'],                openrouter: ['no',  '—'],               cursor: ['no',  '—'],             plain: ['no',  '—']                },
  { f: 'Subscription-aware routing',      mooter: ['yes', 'Max · Pro · API · Codex'],   litellm: ['no',  '—'],                openrouter: ['no',  '—'],               cursor: ['no',  '—'],             plain: ['no',  '—']                },
  { f: 'Classification latency',          mooter: ['yes', '<50ms · regex'],             litellm: ['meh', '~200ms LLM'],       openrouter: ['meh', '50–200ms'],        cursor: ['no',  'n/a'],           plain: ['no',  'n/a']              },
  { f: 'Community-fed patterns',          mooter: ['yes', 'Weekly updates'],            litellm: ['no',  '—'],                openrouter: ['no',  '—'],               cursor: ['no',  '—'],             plain: ['no',  '—']                },
  { f: 'Price',                           mooter: ['yes', 'Free · MIT'],                litellm: ['yes', 'OSS, self-host'],   openrouter: ['meh', '5–10% markup'],    cursor: ['meh', '$20/mo'],        plain: ['yes', 'API cost only']    },
];

const iconFor = (s: CmpStatus) => s === 'yes' ? '✓' : s === 'no' ? '✕' : '~';
const classFor = (s: CmpStatus) => s === 'yes' ? 'yes' : s === 'no' ? 'no' : 'meh';

function CompareSection() {
  return (
    <section className="band" id="compare">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">vs the market</span>
            <h2>Not a proxy. Not a wrapper.<br />A different paradigm.</h2>
            <p className="lede muted">
              Every other routing solution sits between you and your models. Mooter is a hook, not a proxy — runs in your process, on your machine, no network dependency.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="compare-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th></th>
                  <th className="mooter-head">Mooter<br /><span className="sub">mooter.ai</span></th>
                  <th>LiteLLM<br /><span className="sub">proxy-based</span></th>
                  <th>OpenRouter<br /><span className="sub">cloud proxy</span></th>
                  <th>Cursor<br /><span className="sub">IDE-locked</span></th>
                  <th>Plain CC<br /><span className="sub">no router</span></th>
                </tr>
              </thead>
              <tbody>
                {CMP_ROWS.map((r, i) => (
                  <tr key={i}>
                    <td><strong style={{ color: 'var(--ink)' }}>{r.f}</strong></td>
                    <td className="mooter-col"><span className={classFor(r.mooter[0])}>{iconFor(r.mooter[0])}</span><span className="sub">{r.mooter[1]}</span></td>
                    <td><span className={classFor(r.litellm[0])}>{iconFor(r.litellm[0])}</span><span className="sub">{r.litellm[1]}</span></td>
                    <td><span className={classFor(r.openrouter[0])}>{iconFor(r.openrouter[0])}</span><span className="sub">{r.openrouter[1]}</span></td>
                    <td><span className={classFor(r.cursor[0])}>{iconFor(r.cursor[0])}</span><span className="sub">{r.cursor[1]}</span></td>
                    <td><span className={classFor(r.plain[0])}>{iconFor(r.plain[0])}</span><span className="sub">{r.plain[1]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Install section — bash/npm tabs + VS Code card
 * ----------------------------------------------------------------- */

const INSTALL_BASH =
  'curl -fsSL https://mooter.ai/install.sh | bash';
const INSTALL_PS = 'irm https://mooter.ai/install.ps1 | iex';

function InstallSection() {
  const [tab, setTab] = useState<'bash' | 'ps'>('bash');
  const [copied, setCopied] = useState(false);
  const cmd = tab === 'bash' ? INSTALL_BASH : INSTALL_PS;

  const copy = () => {
    navigator.clipboard?.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="band beige-2" id="install">
      <div className="page">
        <Reveal>
          <div className="section-head">
            <span className="eyebrow">Install</span>
            <h2>Terminal + VS Code. One install.</h2>
            <p className="lede muted">
              Works on macOS, Windows and Linux. Needs Node.js ≥18 and Claude Code. Under one minute from curl to first routed prompt.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="install-grid">
            <div>
              <div className="tabs">
                <button
                  className={`tab ${tab === 'bash' ? 'active' : ''}`}
                  onClick={() => setTab('bash')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  macOS / Linux
                </button>
                <button
                  className={`tab ${tab === 'ps' ? 'active' : ''}`}
                  onClick={() => setTab('ps')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <polyline points="7 10 11 14 7 18" />
                    <line x1="13" y1="18" x2="17" y2="18" />
                  </svg>
                  Windows
                </button>
              </div>
              <div className="install-code">
                <button className="copy" onClick={copy}>{copied ? '✓ copied' : 'copy'}</button>
                <span style={{ color: '#6FB28C' }}>$</span> {cmd}
              </div>
              <div className="install-req">
                Requires Node.js ≥18 · Claude Code · {tab === 'bash' ? 'curl' : 'PowerShell 5.1+'}
              </div>
              <div className="install-chips">
                <span className="install-chip label">Works on</span>
                <span className="install-chip"><AppleIcon size={16} /> macOS</span>
                <span className="install-chip"><WindowsIcon size={16} /> Windows</span>
                <span className="install-chip"><LinuxIcon size={16} /> Linux</span>
              </div>
            </div>

            <div className="vsc-card">
              <div className="vsc-head">
                <VSCodeIcon />
                <div>
                  <div className="title">VS Code Extension</div>
                  <div className="sub">statusline · live routing decisions</div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                Real-time statusline showing model, tier, cost and savings for every prompt — without leaving your editor. Also surfaces why the classifier picked the model it picked.
              </p>

              <div className="vsc-checklist">
                <div><CheckIcon /> GPU probed on first <code>mooter init</code></div>
                <div><CheckIcon /> Local models pulled to fit your VRAM</div>
                <div><CheckIcon /> Subscriptions configured once, used forever</div>
                <div><CheckIcon /> Hook wired into Claude Code</div>
                <div><CheckIcon /> Statusline goes live on next prompt</div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={loginWithGitHub} className="btn btn-rose">
                  <GitHubIcon /> Sign in to sync
                </button>
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted-ink)', letterSpacing: '0.04em' }}>
                v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.10.1'} · MIT · cross-platform
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * Footer
 * ----------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="footer">
      <div className="page">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="name"><MooterMark /> <span>mooter</span></div>
            <div>route every prompt. spend nothing.</div>
            <div className="tag">MIT · Built in Portugal · 2026</div>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <a href="#how">How it works</a>
            <a href="#models">Models</a>
            <a href="#modes">Modes</a>
            <a href="#statusline">Statusline</a>
            <a href="#install">Install</a>
          </div>
          <div className="footer-col">
            <h5>Community</h5>
            <a href="mailto:paulo.loureiro.shp@gmail.com?subject=Mooter%20beta%20access">Request beta access</a>
            <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
          </div>
          <div className="footer-col">
            <h5>Legal</h5>
            <a href="/methodology">Methodology</a>
            <a href="/LICENSE">MIT License</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 mooter · MIT License · Open source, not a proxy</span>
          <span>v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.10.1'} · build {process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'}</span>
        </div>
      </div>
    </footer>
  );
}

/* -----------------------------------------------------------------
 * Page
 * ----------------------------------------------------------------- */

export default function Page() {
  return (
    <ErrorBoundary>
      <main>
        <Nav />
        <Hero />
        <StatsStrip />
        <FlowDiagram />
        <ModelsSection />
        <StatuslineSection />
        <ModesSection />
        <TerminalCompare />
        <CompareSection />
        <InstallSection />
        <Footer />
      </main>
    </ErrorBoundary>
  );
}
