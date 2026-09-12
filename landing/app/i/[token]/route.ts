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

// ── Onboarding v2 · W2 — `GET /i/<token>.mcpb` ─────────────────────────────
//
// A mesma rota serve o `.mcpb` do launcher. Duas coisas que parecem detalhes e
// não são:
//
// 1. **`peek`, não `redeem`.** O código de instalação é de USO ÚNICO. Se o
//    download do bundle o consumisse, a pessoa descarregava o ficheiro e depois
//    não tinha código nenhum para colar no diálogo do Claude Desktop — e o erro
//    apareceria só no passo seguinte, longe da causa. `peek_install_token` já
//    existe (`/api/install/validate/[token]`) exactamente para validar sem
//    consumir. O que consome é o `mooter init`.
//
// 2. **O bundle é IGUAL para toda a gente.** Pela D3.1 do ADR ele não leva
//    credencial nenhuma dentro, portanto não há nada a personalizar. Validar o
//    código aqui não é segurança — é dar um erro legível a quem já tem o código
//    expirado, em vez de o mandar descobrir isso mais tarde. Está escrito assim
//    de propósito para ninguém confundir isto com uma protecção.
const ORIGEM_BUNDLE =
  process.env.MOOTER_LAUNCHER_ORIGIN ||
  'https://github.com/pauloloureiroshp-ship-it/mooter/releases/latest/download/mooter-launcher.mcpb';

async function serveMcpb(token: string) {
  if (!isValidInstallToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const config = await rpc<InstallConfig | null>('peek_install_token', { p_token: token });
  if (!config) {
    return NextResponse.json(
      { error: 'expired_or_used', hint: 'Gera outro em mooter.ai/onboarding' },
      { status: 410, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let r: Response;
  try {
    r = await fetch(ORIGEM_BUNDLE, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: 'origem_indisponivel' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!r.ok) {
    return NextResponse.json({ error: 'bundle_nao_publicado' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  return new NextResponse(r.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="mooter.mcpb"',
      // Não é secreto (D3.1) mas também não vale a pena cachear por muito tempo:
      // um bundle novo tem de chegar sem esperar por um TTL longo.
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (token.endsWith('.mcpb')) return serveMcpb(token.slice(0, -'.mcpb'.length));

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
