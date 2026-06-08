import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0B0A09',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'mooter — Route smarter. Ship faster.',
  description:
    'The right model, every prompt. Automatically. Mooter routes Claude Code prompts across Ollama, Haiku, Sonnet and Opus — saving ~90% on AI costs with zero code changes.',
  icons: {
    icon: '/mooter-logo.svg',
    shortcut: '/mooter-logo.svg',
  },
  metadataBase: new URL('https://mooter.ai'),
  alternates: {
    canonical: 'https://mooter.ai',
  },
  openGraph: {
    title: 'mooter — Route smarter. Ship faster.',
    description: '~90% cost savings on Claude Code prompts. Validated on 1,437 real developer prompts.',
    type: 'website',
    url: 'https://mooter.ai',
    siteName: 'mooter',
    images: [{ url: '/api/og?savings=90.2%25', width: 1200, height: 630, alt: 'mooter — Route smarter. Ship faster.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mooter — Route smarter. Ship faster.',
    description: '~90% cost savings on Claude Code prompts. Zero proxy. Just a hook.',
    images: ['/api/og?savings=90.2%25'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'mooter',
  url: 'https://mooter.ai',
  description: 'Claude Code hook-based LLM router that saves ~90% on AI costs via automatic tier routing across Ollama, Haiku, Sonnet and Opus.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', reviewCount: '1437' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Plausible analytics — privacy-first, no cookies, GDPR-compliant */}
        <script defer data-domain="mooter.ai" src="https://plausible.io/js/script.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
