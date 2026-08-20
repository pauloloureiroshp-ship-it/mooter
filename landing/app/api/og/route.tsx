import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Sem medicao, nao ha numero. Ate 2026-08-20 esta linha era
  // `searchParams.get('savings') || '90.2%'`: qualquer partilha do link sem
  // parametro publicava "90.2% less" — um numero sem procedencia no primeiro
  // ecra que um estranho ve, num produto cuja tese e nunca fabricar numeros.
  // Achado pelo pilar P6 do proprio Moo Pilot (landing/app/api/og/route.tsx:7),
  // na ronda das 06:42 de 2026-08-20. Passa um `?savings=` medido e o cartao
  // mostra-o; sem ele, o cartao diz o que e verdade sem numero nenhum.
  const savings = searchParams.get('savings');

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
          {savings
            ? `${savings} less. Comparable quality on routine tasks.`
            : 'Every prompt to the cheapest model that can do it.'}
        </div>
        <div style={{ color: '#666', fontSize: '20px', marginTop: '16px' }}>
          The Claude Code router that knows when to save.
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
