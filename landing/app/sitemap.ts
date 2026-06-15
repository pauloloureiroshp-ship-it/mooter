import type { MetadataRoute } from 'next';

// Public, anon-visible pages only. Auth/admin routes (dashboard, onboarding,
// settings, admin, api) are excluded so they don't appear in Google's index.
// Wave 33.7 — expanded from 2 → all live marketing routes.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://mooter.ai';
  const now = new Date();
  const page = (
    path: string,
    priority: number,
    changeFrequency: 'weekly' | 'monthly',
  ): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    page('/', 1.0, 'weekly'),
    page('/install', 0.9, 'weekly'),
    page('/commands', 0.8, 'monthly'),
    page('/compare', 0.8, 'weekly'),
    page('/packs', 0.7, 'weekly'),
    page('/under-the-hood', 0.7, 'monthly'),
    page('/cockpit', 0.7, 'monthly'),
    page('/security', 0.7, 'monthly'),
    page('/sessions', 0.6, 'monthly'),
    page('/spawn', 0.6, 'monthly'),
    page('/methodology', 0.6, 'monthly'),
    page('/changelog', 0.6, 'weekly'),
    page('/privacy', 0.4, 'monthly'),
  ];
}
