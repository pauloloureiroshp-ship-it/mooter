import type { Metadata } from 'next';
import { M } from './canonical-metrics';
import { SITE } from './site-pages';

// pageMeta — title, description, canonical e os cartões de partilha de uma página
// nova, juntos. O `openGraph` do layout é substituído por inteiro quando uma
// página declara o seu (a fusão é só ao nível da chave de topo), e sem isto as
// páginas novas herdavam og:url = a home e o título da home — o cartão que sai
// quando alguém partilha o link dizia «sou a página inicial». A imagem é a
// mesma do layout, para o cartão não ficar sem ela.
export function pageMeta(path: string, title: string, description: string): Metadata {
  const image = `/api/og?routed=${encodeURIComponent(M.recomendadoBaratoPct)}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${SITE}${path}`,
      siteName: 'mooter',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
