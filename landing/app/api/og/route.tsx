import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const savings = searchParams.get('savings') || '90.2%';

  return new ImageResponse(
    (
      <div
        style={{
          background: '#080808',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <div style={{ color: '#4ec9b0', fontSize: '80px', fontWeight: 800 }}>
          mooter
        </div>
        <div style={{ color: '#ededed', fontSize: '32px', marginTop: '20px' }}>
          {savings} less. Same results.
        </div>
        <div style={{ color: '#666', fontSize: '20px', marginTop: '16px' }}>
          The Claude Code router that knows when to save.
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
