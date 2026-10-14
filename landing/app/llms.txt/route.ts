import { PAGES, urlFor } from '../lib/site-pages';

// /llms.txt — o mapa curto do site, uma linha por página (formato de llmstxt.org).
// Sai da MESMA lista que o sitemap: uma página nova que entra em PAGES aparece
// nos dois, e não há um segundo ficheiro para desalinhar. Evidência de que
// ajuda a ser citado: fraca. Custa uma rota estática, por isso fica.
export const dynamic = 'force-static';

export function GET() {
  const lines = [
    '# mooter',
    '',
    '> Mooter is an open-source (MIT) hook for Claude Code. It reads each prompt on your machine and recommends a model tier: local Ollama, Haiku, Sonnet or Opus. It recommends; it does not enforce, and it publishes no measured dollar savings.',
    '',
    '## Pages',
    '',
    ...PAGES.map((p) => `- [${p.path === '/' ? 'Home' : p.path}](${urlFor(p.path)}): ${p.summary}`),
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
