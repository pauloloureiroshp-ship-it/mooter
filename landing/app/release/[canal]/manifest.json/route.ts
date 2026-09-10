import { NextRequest, NextResponse } from 'next/server';

// Onboarding v2 · W1 — GET /release/<canal>/manifest.json
//
// O manifesto assinado que o `mooter update` lê. Este endpoint é um ESPELHO:
// não assina, não gera e não guarda estado. Serve o que o CI de release
// publicou no GitHub Releases, e mais nada.
//
// PORQUE UM ESPELHO E NÃO UM GERADOR. Se este processo assinasse, a chave
// privada de release teria de viver no runtime da Vercel — e passaria a ser
// alcançável por qualquer defeito de execução remota nesta app. A assinatura
// pertence ao CI de release (`workflow_dispatch`, chave em secret), que corre
// uma vez por release e não atende pedidos de estranhos.
//
// O CLIENTE NÃO CONFIA NESTE ENDPOINT, e é esse o ponto. Ele verifica a
// assinatura Ed25519 contra a chave pública pregada nele próprio
// (`tools/cli/lib/manifesto.js`). Se este servidor for comprometido e servir
// um manifesto forjado, o cliente recusa-o. É por isso que servir por HTTP
// simples a partir de um espelho é aceitável — e é por isso que este ficheiro
// não tem autorização nenhuma: o manifesto é público por construção.

/** Lista fechada. O canal entra num URL de origem — não é texto livre. */
const CANAIS = new Set(['stable', 'beta', 'friends-beta']);

/** De onde vêm os manifestos publicados pelo CI de release. */
const ORIGEM =
  process.env.MOOTER_RELEASE_ORIGIN ||
  'https://github.com/pauloloureiroshp-ship-it/mooter/releases/latest/download';

// Um manifesto é pequeno e muda uma vez por release: 5 min de cache tira a
// carga sem atrasar de forma que alguém note.
const CABECALHOS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
} as const;

const SEM_CACHE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ canal: string }> },
) {
  const { canal } = await params;

  if (!CANAIS.has(canal)) {
    return NextResponse.json(
      { error: 'canal desconhecido', canais: [...CANAIS] },
      { status: 404, headers: SEM_CACHE },
    );
  }

  let r: Response;
  try {
    r = await fetch(`${ORIGEM}/manifest-${canal}.json`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
  } catch {
    // Honesto: o espelho não conseguiu chegar à origem. Não inventamos um
    // manifesto vazio — um manifesto vazio parece "não há nada de novo".
    return NextResponse.json(
      { error: 'a origem das releases não respondeu' },
      { status: 502, headers: SEM_CACHE },
    );
  }

  if (!r.ok) {
    return NextResponse.json(
      { error: `sem manifesto publicado para o canal '${canal}'` },
      { status: 404, headers: SEM_CACHE },
    );
  }

  let corpo: unknown;
  try {
    corpo = await r.json();
  } catch {
    return NextResponse.json(
      { error: 'a origem devolveu algo que não é JSON' },
      { status: 502, headers: SEM_CACHE },
    );
  }

  // Uma verificação de forma mínima, e deliberadamente MÍNIMA: quem valida a
  // sério é o cliente, com a chave. Isto só evita servir lixo óbvio como se
  // fosse um manifesto.
  const m = corpo as Record<string, unknown>;
  if (!m || typeof m.version !== 'string' || !m.sig) {
    return NextResponse.json(
      { error: 'o manifesto publicado não tem versão ou não está assinado' },
      { status: 502, headers: SEM_CACHE },
    );
  }
  // O canal do manifesto tem de ser o canal pedido. O cliente também verifica
  // isto (é anti-rebaixamento e vive dentro da assinatura) — aqui apanha-se
  // mais cedo, e apanha-se um erro de publicação em vez de um ataque.
  if (m.channel !== canal) {
    return NextResponse.json(
      { error: `o manifesto publicado em '${canal}' declara o canal '${String(m.channel)}'` },
      { status: 502, headers: SEM_CACHE },
    );
  }

  return NextResponse.json(corpo, { status: 200, headers: CABECALHOS });
}
