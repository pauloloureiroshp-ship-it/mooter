import { NextRequest, NextResponse } from 'next/server';
import { getUser, getProfile, getDevices } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  const user = await getUser(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  // MP-16: include hardware info from latest device
  const profile = await getProfile(accessToken, user.id) as Record<string, unknown> | null;
  const devices = await getDevices(accessToken, user.id);
  const latestDevice = (devices?.[0] || null) as Record<string, unknown> | null;

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    hw_tier: latestDevice?.hw_tier || profile?.hardware_tier || null,
    gpu_name: latestDevice?.gpu_name || null,
    os_type: latestDevice?.os_type || profile?.os_type || null,
    frugal_version: latestDevice?.frugal_version || profile?.frugal_version || null,
  });
}
