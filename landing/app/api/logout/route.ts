import { NextResponse } from 'next/server';

export async function GET() {
  const res = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'));
  res.cookies.delete('sb-access-token');
  res.cookies.delete('sb-refresh-token');
  return res;
}
