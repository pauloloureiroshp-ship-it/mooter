import type { MetadataRoute } from 'next';
import { PAGES, urlFor } from './lib/site-pages';

// Public, anon-visible pages only. Auth/admin routes (dashboard, onboarding,
// settings, admin, api) are excluded so they don't appear in Google's index.
// Wave 33.7 — expanded from 2 → all live marketing routes.
//
// 2026-10-14 · o `lastModified` era `new Date()`: as 13 páginas diziam «mudei
// agora» com a hora do build. Passa a vir de `lib/site-pages.ts`, onde cada
// página tem a data (YYYY-MM-DD) da sua última mudança de conteúdo, fixa entre
// builds. A lista de páginas é a mesma que alimenta o /llms.txt.
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({
    url: urlFor(p.path),
    lastModified: p.lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
