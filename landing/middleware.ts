import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /dashboard is handled in-component — layout.tsx renders <LoginHero /> when
  // /api/me returns no email. We want brand-new visitors to land on LoginHero
  // (sign-in first), not /#access (waitlist). Waitlist is still linked from the
  // landing page itself for users who don't want to sign in.
  //
  // /onboarding, /admin, /settings stay hard-gated: they expect an authenticated
  // user and have no anon fallback UI.
  const protectedPaths = ['/onboarding', '/admin', '/settings'];

  if (protectedPaths.some(p => pathname.startsWith(p))) {
    const session = request.cookies.get('sb-access-token');
    if (!session) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/onboarding/:path*', '/admin/:path*', '/settings/:path*'],
};
