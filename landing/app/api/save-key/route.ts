import { NextRequest, NextResponse } from 'next/server';
import { getUser, getProfile, upsertProfile } from '../../lib/supabase';

const KEY_PATTERNS: Record<string, RegExp> = {
  anthropic_api: /^sk-ant-/,
  openai_api: /^sk-/,
};

const KEY_FLAGS: Record<string, string> = {
  anthropic_api: 'has_anthropic_key',
  openai_api: 'has_openai_key',
};

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const { provider, key } = await request.json();

  if (!provider || !key || typeof key !== 'string') {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const pattern = KEY_PATTERNS[provider];
  if (!pattern) {
    return NextResponse.json({ error: 'unsupported_provider' }, { status: 400 });
  }

  if (!pattern.test(key)) {
    return NextResponse.json({ error: 'invalid_key_format' }, { status: 400 });
  }

  // Never store the key — only mark that it was validated
  const flagField = KEY_FLAGS[provider];
  if (!flagField) {
    return NextResponse.json({ error: 'unsupported_provider' }, { status: 400 });
  }

  const profile = await getProfile(accessToken, user.id);
  const existingConfig = (profile && typeof profile.frugal_config === 'object' && profile.frugal_config !== null)
    ? profile.frugal_config as Record<string, unknown>
    : {};

  const updatedConfig = { ...existingConfig, [flagField]: true };

  await upsertProfile(accessToken, {
    id: user.id,
    frugal_config: updatedConfig,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, flag: flagField });
}
