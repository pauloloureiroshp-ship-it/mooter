import { NextRequest, NextResponse } from 'next/server';
import { rpc } from '../../lib/supabase';
import { isValidInstallToken, generateInstallScript, errorScript, type InstallConfig } from '../../lib/install-script';

// Wave 6 D2 — `curl https://mooter.ai/i/<token> | bash`. Redeems the token
// (single-use, 24h) via the redeem_install_token RPC and returns a plain,
// readable shell script. hub/ is NOT involved — Supabase-only.
//
// Lives at /i/[token] (not /install/[token]) on purpose: a dynamic segment
// under /install would make ESLint's no-html-link-for-pages flag the existing
// `<a href="/install">` CTAs across the marketing pages (Phase A — must stay
// untouched). /i/ is short, brandable, and collision-free.

const PLAIN = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isValidInstallToken(token)) {
    return new NextResponse(errorScript('Invalid install token'), { status: 400, headers: PLAIN });
  }

  // SECURITY DEFINER RPC: marks used + returns config, or null when
  // missing / expired / already used. The token value is the bearer secret.
  const config = await rpc<InstallConfig | null>('redeem_install_token', { p_token: token });
  if (!config) {
    return new NextResponse(
      errorScript('Install token expired or already used. Get a new one at mooter.ai/onboarding'),
      { status: 410, headers: PLAIN },
    );
  }

  return new NextResponse(generateInstallScript(config), { status: 200, headers: PLAIN });
}
