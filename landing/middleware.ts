import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPaths = ['/dashboard', '/onboarding'];

  if (protectedPaths.some(p => pathname.startsWith(p))) {
    const session = request.cookies.get('sb-access-token');
    if (!session) {
      return NextResponse.redirect(new URL('/#access', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
};
