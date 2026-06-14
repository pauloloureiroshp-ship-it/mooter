import type { MetadataRoute } from 'next';

// Wave 33.7 — PWA manifest (served at /manifest.webmanifest by Next.js).
// Cow brand: warm dark background + mooter yellow accent.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'mooter — The router for Claude Code',
    short_name: 'mooter',
    description: 'Local-first LLM router for Claude Code. Comparable quality on routine tasks, a fraction of the spend.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0A09',
    theme_color: '#0B0A09',
    icons: [
      { src: '/mooter-logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
