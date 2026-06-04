// Wave 14 — local visual harness for the signed-in DARK pages.
// Runs Playwright against a local `next start`, fakes auth (the middleware only
// checks the sb-access-token cookie's PRESENCE) and intercepts /api/me +
// /api/profile + /api/decisions-log with fixtures, so the auth-gated dark UI
// renders with realistic data WITHOUT a real Supabase session.
//
// Usage: node shoot.mjs [baseURL]   (default http://localhost:3100)
// Output: ./shots/*.png

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
// Output to /tmp — avoids WSL %20-in-path encoding on /mnt/c and is faster.
const OUT = '/tmp/mooter-shots/';
mkdirSync(OUT, { recursive: true });

// ── Fixtures — chosen to light up the Wave-14 dark states ──────────────────
const ISO_52D_AGO = new Date(Date.now() - 52 * 864e5).toISOString(); // stale > 7d
const GPU_ANGLE =
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)';

const DEVICE = {
  device_id: 'dev-1',
  device_name: 'DESKTOP-J26409Q',
  os_type: 'win32',                 // → osLabel → "Windows"
  hw_tier: 'gpu_high',
  gpu_name: GPU_ANGLE,              // → formatGpuLabel → "NVIDIA GeForce RTX 4090"
  gpu_vram_mb: 24576,
  ollama_models: ['qwen3:30b'],     // → F-6: hides the qwen3:30b recommendation
  has_ollama: true,
  has_anthropic_key: true,
  frugal_version: '0.9.1',          // → VersionBadge stale (52d ago)
  decisions_count: 663,
  savings_usd: 73.85,
  last_sync_at: ISO_52D_AGO,        // → F-4 hero "Outdated" + stale-sync banner
};

const PROFILE = {
  id: 'demo-user',
  email: 'paulo.loureiro.shp@gmail.com',
  hardware_tier: 'windows_nvidia',
  os_type: 'win32',
  subscriptions: ['Claude Max'],
  prompts_per_day_estimate: 40,
  onboarding_completed: true,
  github_username: 'pauloloureiroshp-ship-it',
  github_primary_language: 'TypeScript',
  github_public_repos_count: 12,
  experience_level: 'senior',
  persona: 'solo_founder',
  frugal_config: { has_ollama: true, pct_by_tier: { t0: 59, t1: 12, t2: 0, t3: 29 } },
  install_completed: true,
  frugal_version: '0.9.1',
  devices: [DEVICE],
};

const ME = {
  userId: 'demo-user',
  email: PROFILE.email,
  hw_tier: DEVICE.hw_tier,
  gpu_name: DEVICE.gpu_name,
  os_type: DEVICE.os_type,
  frugal_version: DEVICE.frugal_version,
  last_sync_at: DEVICE.last_sync_at,
};

const DECISIONS = {
  rows: Array.from({ length: 8 }, (_, i) => ({
    recorded_at: new Date(Date.now() - (52 + i) * 864e5).toISOString(),
    decisions: 663 - i * 7,
    savings_usd: +(73.85 - i * 0.9).toFixed(2),
    device_id: 'dev-1',
  })),
};

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function shoot(page, path, name, label) {
  const url = `${BASE}${path}`;
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(700); // let client fetches + transitions settle
  const file = `${OUT}${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${label} → shots/${name}.png  (final url: ${page.url()})`);
}

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  // Fake the auth gate (middleware only checks presence).
  await context.addCookies([
    { name: 'sb-access-token', value: 'harness-dummy', url: BASE },
  ]);
  // Intercept the data APIs with fixtures.
  await context.route('**/api/me', (r) => r.fulfill(json(ME)));
  await context.route('**/api/profile**', (r) => r.fulfill(json(PROFILE)));
  await context.route('**/api/decisions-log**', (r) => r.fulfill(json(DECISIONS)));

  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('   [page error]', m.text()); });

  console.log(`Shooting signed-in dark pages @ ${BASE}`);
  await shoot(page, '/dashboard', 'dashboard-desktop', 'dashboard (desktop)');
  await shoot(page, '/settings', 'settings-desktop', 'settings (desktop)');
  await shoot(page, '/onboarding', 'onboarding-step1-desktop', 'onboarding step 1 (desktop)');

  // Best-effort: advance the onboarding wizard for steps 2 & 3.
  try {
    await page.getByText('Windows + NVIDIA', { exact: false }).first().click({ timeout: 3000 });
    await page.getByText('Next', { exact: false }).first().click({ timeout: 3000 });
    await shoot(page, '/onboarding', 'onboarding-step2-desktop', 'onboarding step 2 (desktop)');
  } catch (e) { console.log('  · onboarding step 2 skipped:', e.message.split('\n')[0]); }

  // Mobile responsive pass (Wave 10 B.2c #9).
  const mob = await context.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await context.route('**/api/me', (r) => r.fulfill(json(ME)));
  await shoot(mob, '/dashboard', 'dashboard-mobile', 'dashboard (mobile 390px)');
  await shoot(mob, '/onboarding', 'onboarding-mobile', 'onboarding (mobile 390px)');

  await browser.close();
  console.log('Done. PNGs in scripts/visual/shots/');
};

run().catch((e) => { console.error('HARNESS FAILED:', e); process.exit(1); });
