const HUB_URL = process.env.NEXT_PUBLIC_MOOTER_HUB_URL || process.env.NEXT_PUBLIC_FRUGAL_HUB_URL || 'https://mooter-hub.frugal-hub.workers.dev';

export async function GET() {
  try {
    const res = await fetch(`${HUB_URL}/aggregate-stats`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return Response.json(
        { error: `Hub returned ${res.status}`, hint: 'Check hub worker status' },
        { status: 502 },
      );
    }
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: `Hub unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
