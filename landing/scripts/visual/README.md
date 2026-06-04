# Signed-in dark-UI screenshot harness (Wave 14)

Captures the auth-gated dark pages (onboarding/dashboard/settings) with fixture
data, so the dark theme can be visually reviewed without a real Supabase session.
Auth is faked (middleware only checks the `sb-access-token` cookie's presence);
`/api/me`, `/api/profile`, `/api/decisions-log` are intercepted with fixtures.

## One-time setup
    cd landing/scripts/visual && npm i        # installs isolated playwright
    # Then install chromium system libs (NEEDS sudo):
    sudo ./node_modules/.bin/playwright install-deps chromium
    ./node_modules/.bin/playwright install chromium

## Run
    cd landing && npx next build && \
      NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co \
      NEXT_PUBLIC_SUPABASE_ANON_KEY=demo npx next start -p 3100 &
    node landing/scripts/visual/shoot.mjs http://localhost:3100
    # PNGs land in /tmp/mooter-shots/

Fixtures live at the top of shoot.mjs — tweak `last_sync_at`, `ollama_models`,
`frugal_version`, etc. to exercise different dark states.

## WSL / no-sudo browser deps (if `install-deps` fails)
On a WSL Ubuntu image with a broken `apt-get update` (404) and no passwordless
sudo, install the chromium system libs WITHOUT root by downloading + extracting
the .debs and pointing chromium at them:

    mkdir -p /tmp/pwlibs && cd /tmp/pwlibs
    apt-get download libnss3 libnspr4 libasound2 libatk1.0-0 libatk-bridge2.0-0 \
      libcups2 libgbm1 libxkbcommon0 libpango-1.0-0 libxcomposite1 libxdamage1 \
      libxrandr2 libxfixes3 libatspi2.0-0 libdrm2 libxcb1 libcairo2
    for f in *.deb; do dpkg-deb -x "$f" root/; done
    # then run with:
    LD_LIBRARY_PATH=/tmp/pwlibs/root/usr/lib/x86_64-linux-gnu node shoot.mjs

`apt-get download` uses the cached index, so it works even when `apt-get update`
404s; the 404 only breaks index refresh, not package fetches.
