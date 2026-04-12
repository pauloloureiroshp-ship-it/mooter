import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForSession } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const accessToken = searchParams.get('access_token');

  // Code flow (PKCE / authorization_code)
  if (code) {
    const session = await exchangeCodeForSession(code);

    if (session) {
      // Set cookies for both flows (web and CLI)
      const cookieOpts = (maxAge: number) => ({
        httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge,
      });

      // Serve a bridge page that checks sessionStorage for CLI login
      // before redirecting — server can't read sessionStorage directly
      const bridgeHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Signing in…</title></head>
<body><script>
  if (sessionStorage.getItem('cli_login') === '1') {
    sessionStorage.removeItem('cli_login');
    window.location.replace('http://127.0.0.1:7822/callback?token=${encodeURIComponent(session.access_token)}');
  } else {
    window.location.replace('/onboarding');
  }
</script><p>A autenticar…</p></body></html>`;

      const res = new NextResponse(bridgeHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      res.cookies.set('sb-access-token', session.access_token, cookieOpts(60 * 60 * 24 * 7));
      res.cookies.set('sb-refresh-token', session.refresh_token, cookieOpts(60 * 60 * 24 * 30));
      return res;
    }
  }

  // Implicit flow: Supabase puts tokens in URL hash — browser can't send hash to server.
  // We serve a small HTML page that reads the hash and POSTs the token to /auth/token.
  if (!code && !accessToken) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Signing in…</title></head>
<body>
<script>
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const isCli = sessionStorage.getItem('cli_login') === '1';
  if (access_token) {
    fetch('/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, refresh_token }),
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        if (isCli) {
          sessionStorage.removeItem('cli_login');
          window.location.replace('http://127.0.0.1:7822/callback?token=' + encodeURIComponent(access_token));
        } else {
          window.location.replace('/onboarding');
        }
      } else window.location.replace('/?auth=error');
    }).catch(() => window.location.replace('/?auth=error'));
  } else {
    window.location.replace('/?auth=error');
  }
</script>
<p>A autenticar…</p>
</body>
</html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }

  return NextResponse.redirect(new URL('/?auth=error', request.url));
}
