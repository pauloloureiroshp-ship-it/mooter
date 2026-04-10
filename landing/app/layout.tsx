import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'frugal — Route smarter. Spend less.',
  description:
    '~90% cost savings on Claude Code prompts. Zero proxy router that classifies every prompt in under 50ms.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'frugal — Route smarter. Spend less.',
    description: '~90% cost savings on Claude Code prompts. Validated on months of real developer usage.',
    type: 'website',
    images: [{ url: '/api/og?savings=90.2%25', width: 1200, height: 630 }],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'frugal',
  description: 'Claude Code router that saves 90% on LLM costs via automatic tier routing',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', reviewCount: '1437' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Plausible analytics — privacy-first, no cookies, GDPR-compliant
            Replace data-domain with your final domain when ready */}
        <script defer data-domain="frugal.dev" src="https://plausible.io/js/script.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
