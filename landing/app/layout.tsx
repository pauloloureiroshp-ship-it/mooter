import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono, Caveat } from 'next/font/google';
import './globals.css';
import CmdKPalette from './_components/CmdKPalette';
import LpErrorTap from './_components/LpErrorTap';
import versionInfo from './version.json';
import { M } from './lib/canonical-metrics';

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

// Wave 33.9 — handwritten accent for the Conductor showcase annotation.
const caveat = Caveat({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-caveat',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#0B0A09',
  width: 'device-width',
  initialScale: 1,
};

// Wave 33.7 — honest numbers only. The hero/PulseStrip real data is 47% saved
// vs all-Opus across the author's own 658 routed calls. No inflated "~90%", no
// "1,437 prompts", and NO fabricated aggregateRating (single-founder MIT project
// with zero collected reviews — a fake rating is both dishonest and a Google
// rich-result violation).
//
// 2026-09-29 · dizia «learns forever … same results, a fraction of the spend,
// zero code changes». Nenhuma das três está medida (não há custo registado —
// ver o /compare, «Not measured (no token logging)»). Fica só o que o Mooter é:
// um hook local que escolhe o tier de cada prompt, MIT.
const DESCRIPTION =
  'The local router for Claude Code: a hook on your machine that routes each prompt to a tier — local Ollama, Haiku, Sonnet or Opus. Open source, MIT.';

export const metadata: Metadata = {
  title: 'mooter — The router for Claude Code',
  description: DESCRIPTION,
  authors: [{ name: 'Paulo Loureiro', url: 'https://github.com/pauloloureiroshp-ship-it/mooter' }],
  creator: 'Paulo Loureiro',
  keywords: ['Claude Code', 'LLM router', 'Ollama', 'local-first', 'AI cost savings', 'Anthropic', 'Opus', 'Sonnet', 'Haiku'],
  icons: {
    icon: '/mooter-logo.svg',
    shortcut: '/mooter-logo.svg',
    apple: '/mooter-logo.svg',
  },
  manifest: '/manifest.webmanifest',
  metadataBase: new URL('https://mooter.ai'),
  alternates: {
    canonical: 'https://mooter.ai',
  },
  openGraph: {
    title: 'mooter — The router for Claude Code',
    // Já dizia "47% saved vs all-Opus". Não havia custo medido de que derivar
    // uma poupança — ver canonical-metrics.ts. A meta description e o cartão OG
    // são o que aparece quando alguém partilha o link: é o pior sítio possível
    // para um número que não se sustenta, porque viaja sozinho e sem ressalva.
    description: `Routes ${M.recomendadoBarato} classified prompts to a local or cheap tier. Zero proxy. Just a hook. Open source · MIT.`,
    type: 'website',
    url: 'https://mooter.ai',
    siteName: 'mooter',
    images: [{ url: `/api/og?routed=${encodeURIComponent(M.recomendadoBaratoPct)}`, width: 1200, height: 630, alt: 'mooter — The router for Claude Code' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'mooter — The router for Claude Code',
    description: `Routes ${M.recomendadoBarato} classified prompts to a local or cheap tier. Zero proxy. Just a hook. MIT.`,
    images: [`/api/og?routed=${encodeURIComponent(M.recomendadoBaratoPct)}`],
  },
};

// Structured data (Wave 33.7): SoftwareApplication + WebSite + the founder as a
// Person, linked via @graph. Honest — no aggregateRating, no review counts.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://mooter.ai/#app',
      name: 'mooter',
      url: 'https://mooter.ai',
      description: DESCRIPTION,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Windows, Linux',
      softwareVersion: versionInfo.version,
      license: 'https://opensource.org/licenses/MIT',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: { '@id': 'https://mooter.ai/#paulo' },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://mooter.ai/#website',
      url: 'https://mooter.ai',
      name: 'mooter',
      description: 'The local router for Claude Code. Open source, MIT.',
      publisher: { '@id': 'https://mooter.ai/#paulo' },
    },
    {
      '@type': 'Person',
      '@id': 'https://mooter.ai/#paulo',
      name: 'Paulo Loureiro',
      url: 'https://github.com/pauloloureiroshp-ship-it',
      jobTitle: 'Creator of mooter',
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${caveat.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Plausible analytics — privacy-first, no cookies, GDPR-compliant */}
        <script defer data-domain="mooter.ai" src="https://plausible.io/js/script.js" />
      </head>
      <body>
        {children}
        <CmdKPalette />
        {/* Live Preview MP4 — dev-only Honest Diagnostics tap (tree-shaken from production). */}
        <LpErrorTap />
      </body>
    </html>
  );
}
