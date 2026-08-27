import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * Paleta da marca, do tema `tinta` de `design/tokens/moo-tokens.json` (v2.0.0).
 *
 * ⚠️ Valores COPIADOS, e o porquê fica escrito: este ficheiro corre no runtime
 * `edge` e desenha com estilos inline — não há folha de estilo, logo não há
 * `var(--moo-*)`. E `design/tokens/moo-tokens.ts` está fora da raiz do Next, que
 * o recusa importar sem `experimental.externalDir`. Enquanto essa ponte não
 * existir, isto é uma cópia — declarada aqui em vez de silenciosa.
 *
 * O que estava antes, e não era um detalhe: o wordmark saía a `#4ec9b0`. É o
 * teal EXACTO do `mooter-logo-legacy.svg`, o logo do *frugal* — o nome anterior
 * do produto — e esse hex não existe em `moo-tokens.json`. A primeira imagem que
 * um estranho vê quando alguém partilha um link de mooter.ai estava a mostrar a
 * marca morta. O fundo era `#080808` e o texto `#ededed`, ambos contra o
 * `DESIGN.md` §2: «fundo #0B0A09, nunca #000; texto #F2EDE6, nunca #FFF».
 *
 * Sem rosa, de propósito: o acento só entra no `?` do wordmark, nas cotas e no
 * CTA. Este cartão não tem nenhum dos três.
 */
const MOO = {
  bg: '#0B0A09',
  text: '#F2EDE6',
  text2: '#C9C2B8',
  muted: '#8A8076',
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Sem medicao, nao ha numero. Ate 2026-08-20 esta linha era
  // `searchParams.get('savings') || '90.2%'`: qualquer partilha do link sem
  // parametro publicava "90.2% less" — um numero sem procedencia no primeiro
  // ecra que um estranho ve, num produto cuja tese e nunca fabricar numeros.
  // Achado pelo pilar P6 do proprio Moo Pilot (landing/app/api/og/route.tsx:7),
  // na ronda das 06:42 de 2026-08-20. Passa um `?savings=` medido e o cartao
  // mostra-o; sem ele, o cartao diz o que e verdade sem numero nenhum.
  //
  // 2026-08-23: o parametro passou de `savings` para `routed`. O `savings`
  // continua a ser aceite e IGNORADO de proposito — links partilhados no ano
  // passado ainda o trazem, e honra-lo publicaria de novo um numero que este
  // projecto ja concluiu nao conseguir sustentar. Aceitar-e-ignorar e mais
  // seguro que remover: um `undefined` a interpolar dava "undefined less".
  const routed = searchParams.get('routed');

  return new ImageResponse(
    (
      <div
        style={{
          background: MOO.bg,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <div style={{ color: MOO.text, fontSize: '80px', fontWeight: 800, letterSpacing: '-0.04em' }}>
          mooter
        </div>
        <div style={{ color: MOO.text2, fontSize: '32px', marginTop: '20px' }}>
          {routed
            ? `${routed} of prompts routed to a local or cheap tier.`
            : 'Every prompt to the cheapest model that can do it.'}
        </div>
        <div style={{ color: MOO.muted, fontSize: '20px', marginTop: '16px' }}>
          The Claude Code router that knows when to save.
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
