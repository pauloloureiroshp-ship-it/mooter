import { ORGANIZATION, SITE, pageByPath, urlFor } from './site-pages';

/** Um <script type="application/ld+json">. O `<` sai escapado para o JSON nunca fechar o script. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export const organizationLd = { '@context': 'https://schema.org', ...ORGANIZATION };

export function articleLd(path: string, headline: string, description: string) {
  const { lastModified } = pageByPath(path);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline,
    description,
    url: urlFor(path),
    mainEntityOfPage: urlFor(path),
    inLanguage: 'en',
    datePublished: lastModified,
    dateModified: lastModified,
    // O @graph do layout já declara estes nós; referenciá-los por @id evita duplicados.
    author: { '@id': `${SITE}/#paulo` },
    publisher: { '@id': ORGANIZATION['@id'] },
    isPartOf: { '@id': `${SITE}/#website` },
  };
}

export interface QA {
  q: string;
  a: string;
}

export function faqLd(items: QA[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
