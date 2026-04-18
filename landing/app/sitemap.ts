import type { MetadataRoute } from 'next';

// Only public, anon-visible pages. Auth/admin routes are excluded so they
// don't appear in Google's index.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://mooter.ai';
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/methodology`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
