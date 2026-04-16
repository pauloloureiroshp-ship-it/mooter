import { NextRequest, NextResponse } from 'next/server';
import { getUser, getProfile, upsertProfile, upsertDevice, insertDecisionsSnapshot, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';

interface InstallPayload {
  device_id?: string;
  device_name?: string;
  hw_tier: string;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_gemini_key: boolean;
  has_ollama: boolean;
  ollama_models: string[];
  ollama_has_qwen3b: boolean;
  ollama_has_qwen30b: boolean;
  frugal_version: string;
  gpu_name?: string | null;
  gpu_vram_mb?: number | null;
  os_type: string;
  arch: string;
  decisions_count: number;
  savings_usd: number;
  guaranteed_saved_usd?: number;
}

export async function POST(request: NextRequest) {
  try {
    // Auth: accept cookie OR Authorization header (CLI uses header)
    let accessToken = request.cookies.get('sb-access-token')?.value;
    if (!accessToken) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        accessToken = authHeader.slice(7);
      }
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const user = await getUser(accessToken);
    if (!user) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
    }

    const payload: InstallPayload = await request.json();

    // Read existing profile to do conditional updates
    const existing = await getProfile(accessToken, user.id) as Record<string, unknown> | null;
    const existingConfig = (existing?.frugal_config as Record<string, unknown>) || {};

    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
      id: user.id,
      install_completed: true,
      frugal_version: payload.frugal_version,
      frugal_config: {
        ...existingConfig,
        has_anthropic_key: payload.has_anthropic_key,
        has_openai_key: payload.has_openai_key,
        has_gemini_key: payload.has_gemini_key,
        has_ollama: payload.has_ollama,
        ollama_models: payload.ollama_models,
        ollama_has_qwen3b: payload.ollama_has_qwen3b,
        ollama_has_qwen30b: payload.ollama_has_qwen30b,
        os_type: payload.os_type,
        arch: payload.arch,
        decisions_count: payload.decisions_count,
        savings_usd: payload.savings_usd,
        guaranteed_saved_usd: payload.guaranteed_saved_usd ?? existingConfig.guaranteed_saved_usd ?? 0,
        synced_at: now,
      },
    };

    // Only set hardware_tier if not already defined or was 'unknown'
    if (!existing?.hardware_tier || existing.hardware_tier === 'unknown' || existing.hardware_tier === '') {
      update.hardware_tier = payload.hw_tier;
    }

    // Only set install_completed_at if install_completed was false
    if (!existing?.install_completed) {
      update.install_completed_at = now;
    }

    await upsertProfile(accessToken, update);

    // MP-12: upsert device if device_id provided
    if (payload.device_id) {
      await upsertDevice(accessToken, {
        device_id: payload.device_id,
        user_id: user.id,
        device_name: payload.device_name || `${payload.os_type} device`,
        os_type: payload.os_type,
        arch: payload.arch,
        hw_tier: payload.hw_tier,
        gpu_name: payload.gpu_name || null,
        gpu_vram_mb: payload.gpu_vram_mb || null,
        has_ollama: payload.has_ollama,
        ollama_models: payload.ollama_models,
        ollama_has_qwen3b: payload.ollama_has_qwen3b,
        ollama_has_qwen30b: payload.ollama_has_qwen30b,
        has_anthropic_key: payload.has_anthropic_key,
        has_openai_key: payload.has_openai_key,
        has_gemini_key: payload.has_gemini_key,
        frugal_version: payload.frugal_version,
        decisions_count: payload.decisions_count,
        savings_usd: payload.savings_usd,
        last_sync_at: new Date().toISOString(),
      });
    }

    // MP-18 PEÇA 2: insert snapshot into decisions_log for historical tracking
    if (payload.decisions_count > 0) {
      try {
        await insertDecisionsSnapshot(accessToken, user.id, payload.device_id || null, {
          decisions: payload.decisions_count,
          savings_usd: payload.savings_usd,
        });
      } catch {
        // Non-fatal: profile/device sync already succeeded
      }
    }

    return NextResponse.json({ ok: true, userId: user.id, deviceId: payload.device_id || null });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
