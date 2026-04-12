---
name: frugal-dashboard
description: >
  Opens the frugal local dashboard in the browser (localhost:7820). Starts the dev server if not
  already running. Use when the user types "/frugal-dashboard", "abre o dashboard", "open dashboard",
  "mostra o dashboard", or wants to see routing decisions visually.
---

# /frugal-dashboard — Local Dashboard

Opens the frugal routing dashboard at `http://127.0.0.1:7820`.

---

## Steps

1. Check if the dashboard dev server is already running on port 7820:

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7820 2>/dev/null || echo "not_running"
```

2. If not running, start it in the background:

```bash
cd ~/frugal/dashboard && npm run dev &
```

Wait 3 seconds for the server to start.

3. Open in browser:

- **Windows:** `start http://127.0.0.1:7820`
- **macOS:** `open http://127.0.0.1:7820`
- **Linux:** `xdg-open http://127.0.0.1:7820`

4. Report to user:

```
Dashboard running at http://127.0.0.1:7820

Pages:
  / ........... Overview (KPIs, tier distribution, decisions, cost trend, tuning)
  /misroutes .. Low-confidence decisions for debugging
  /community .. Hub aggregate stats vs local
```
