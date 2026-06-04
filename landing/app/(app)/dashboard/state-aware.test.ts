// Wave 14 Day 2 — state-aware signed-in fixes (F-4 / F-6 / F-7 / F-10).
// Pure logic is imported and exercised directly; the wiring into the big client
// page components is asserted at the source level (same pattern as parity/b2b2).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { heroDataSource, installedOllamaModels, isModelInstalled, HERO_STALE_DAYS } from './_state';

const NOW = Date.parse('2026-06-04T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const DASH = read('page.tsx');
const SETTINGS = read('../settings/page.tsx');

describe('F-4 — stats hero data source (live / outdated / demo)', () => {
  it('fresh sync with data → live', () => {
    expect(heroDataSource(daysAgo(2), true, NOW)).toBe('live');
  });
  it('stale sync (> 7d) with data → outdated', () => {
    expect(heroDataSource(daysAgo(52), true, NOW)).toBe('outdated');
    expect(heroDataSource(daysAgo(HERO_STALE_DAYS), true, NOW)).toBe('live'); // boundary
  });
  it('no data or no sync timestamp → demo', () => {
    expect(heroDataSource(daysAgo(2), false, NOW)).toBe('demo');
    expect(heroDataSource(null, true, NOW)).toBe('demo');
  });
  it('hero badge is wired to heroDataSource, not hardcoded "live"', () => {
    expect(DASH).toContain('heroDataSource(latestDevice?.last_sync_at');
    expect(DASH).not.toMatch(/<DataSourceBadge\s+source="live"/);
  });
});

describe('F-6 — recommendations are state-aware (skip installed models)', () => {
  it('installedOllamaModels dedups across devices and reads the real payload', () => {
    const profile = {
      devices: [
        { ollama_models: ['qwen3:30b', 'llama3:8b'] },
        { ollama_models: ['qwen3:30b'] },
        { ollama_models: null },
      ],
    };
    expect(installedOllamaModels(profile).sort()).toEqual(['llama3:8b', 'qwen3:30b']);
    expect(installedOllamaModels({})).toEqual([]);
  });
  it('isModelInstalled matches exact tag, and untagged recs match any tag', () => {
    expect(isModelInstalled(['qwen3:30b'], 'qwen3:30b')).toBe(true);
    expect(isModelInstalled(['qwen3:30b'], 'qwen2.5:3b')).toBe(false);
    expect(isModelInstalled(['qwen3:30b'], 'qwen3')).toBe(true); // untagged rec
    expect(isModelInstalled([], 'qwen3:30b')).toBe(false);
  });
  it('getRecommendations gates the qwen pulls on isModelInstalled', () => {
    expect(DASH).toContain("isModelInstalled(installed, 'qwen2.5:3b')");
    expect(DASH).toContain("isModelInstalled(installed, 'qwen3:30b')");
    expect(DASH).toContain('installedOllamaModels(profile)');
  });
});

describe('F-7 — hardware label uses formatGpuLabel, not the raw payload', () => {
  it('dashboard formats the GPU string instead of rendering it raw', () => {
    expect(DASH).toContain('formatGpuLabel');
    expect(DASH).not.toContain('latestDevice?.gpu_name || null');
    expect(DASH).not.toMatch(/<span>\{latestDevice\.gpu_name\}<\/span>/);
  });
  it('settings builds a human hardware label (OS + formatted GPU)', () => {
    expect(SETTINGS).toContain('formatGpuLabel');
    expect(SETTINGS).toContain('hardwareLabel');
    expect(SETTINGS).not.toContain("{profile.hardware_tier.replace(/_/g, ' ')}");
  });
});

describe('F-10 — device platform uses osLabel (win32 → Windows)', () => {
  it('settings + dashboard device rows format os_type, never render it raw', () => {
    expect(SETTINGS).toContain('osLabel(d.os_type)');
    expect(DASH).toContain('osLabel(d.os_type)');
    // a raw "(win32)"-style platform render must not exist
    expect(SETTINGS).not.toMatch(/\(\{d\.os_type\}\)/);
    expect(DASH).not.toMatch(/\(\{d\.os_type\}\)/);
  });
});
