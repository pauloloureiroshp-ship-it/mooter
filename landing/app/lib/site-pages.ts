// site-pages.ts — a lista das páginas públicas, numa só fonte.
//
// Alimenta três saídas que antes não se falavam: o sitemap.xml, o /llms.txt e o
// `dateModified` do JSON-LD. Uma página que entra aqui entra nas três; uma que
// sai, sai das três. Era `new Date()` no sitemap — o `lastmod` de todas as
// páginas era a hora do build, ou seja, dizia «mudou agora» sobre o que não
// mudava há semanas, e um crawler que aprende que o lastmod mente deixa de o ler.
//
// `lastModified` é a data (YYYY-MM-DD, sem hora) da ÚLTIMA MUDANÇA DE CONTEÚDO da
// página, DIGITADA neste ficheiro e fixa entre builds — nunca calculada no build
// nem lida do git em tempo de execução. Para as 13 páginas que já existiam, o
// valor foi escolhido a 2026-10-14 olhando uma vez para o histórico do git
// (`git log -1 --format=%cs -- <ficheiros da página>`); para as novas, é a data
// em que o conteúdo foi escrito. Quando alguém muda o conteúdo de uma página,
// muda a data aqui no mesmo commit. Não há automatismo de propósito: um
// automatismo ligado ao build é exactamente o defeito que isto substitui.

export const SITE = 'https://mooter.ai';

/** Dia em que os factos sobre ferramentas de terceiros, nas páginas novas, foram lidos. */
export const FACTS_READ = '2026-10-14';

export const GITHUB_REPO = 'https://github.com/pauloloureiroshp-ship-it/mooter';
export const GITHUB_ISSUES = `${GITHUB_REPO}/issues`;
export const GITHUB_LICENSE = `${GITHUB_REPO}/blob/main/LICENSE`;
export const GITHUB_SECURITY = `${GITHUB_REPO}/blob/main/SECURITY.md`;
export const VS_MARKETPLACE = 'https://marketplace.visualstudio.com/items?itemName=mooter.mooter-cockpit';

export type ChangeFreq = 'weekly' | 'monthly';

export interface SitePage {
  path: string;
  /** Uma linha, para o /llms.txt. */
  summary: string;
  priority: number;
  changeFrequency: ChangeFreq;
  /** YYYY-MM-DD da última mudança de conteúdo. Fixo. */
  lastModified: string;
}

export const PAGES: SitePage[] = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly', lastModified: '2026-09-29', summary: 'What mooter is: a local hook that recommends a model tier for each Claude Code prompt, plus the honest numbers.' },
  { path: '/install', priority: 0.9, changeFrequency: 'weekly', lastModified: '2026-08-28', summary: 'The one-command installer, what it changes on your machine, and how to uninstall.' },
  { path: '/commands', priority: 0.8, changeFrequency: 'monthly', lastModified: '2026-08-28', summary: 'The /mooter slash commands available inside Claude Code.' },
  { path: '/compare', priority: 0.8, changeFrequency: 'weekly', lastModified: '2026-10-14', summary: 'How mooter compares with Claude Code Router, LiteLLM, Continue.dev, OpenRouter and multi-session tools.' },
  { path: '/packs', priority: 0.7, changeFrequency: 'weekly', lastModified: '2026-08-28', summary: 'Moo Packs: domain-specific routing profiles.' },
  { path: '/under-the-hood', priority: 0.7, changeFrequency: 'monthly', lastModified: '2026-08-28', summary: 'Quantization and DoRA explained, for running local models.' },
  { path: '/cockpit', priority: 0.7, changeFrequency: 'monthly', lastModified: '2026-08-28', summary: 'The VS Code sidebar that shows routing decisions (interactive mock).' },
  { path: '/security', priority: 0.7, changeFrequency: 'monthly', lastModified: '2026-08-28', summary: 'The 4-layer sandbox around spawned agents.' },
  { path: '/sessions', priority: 0.6, changeFrequency: 'monthly', lastModified: '2026-08-28', summary: 'Cross-session view of Claude Code sessions on one machine.' },
  { path: '/spawn', priority: 0.6, changeFrequency: 'monthly', lastModified: '2026-08-28', summary: 'Spawning local, sandboxed coding agents in git worktrees.' },
  { path: '/methodology', priority: 0.6, changeFrequency: 'monthly', lastModified: '2026-10-15', summary: 'How prompts are classified into tiers, the withdrawn savings claim, and what is and is not measured.' },
  { path: '/changelog', priority: 0.6, changeFrequency: 'weekly', lastModified: '2026-08-28', summary: 'What shipped, from GitHub releases.' },
  { path: '/privacy', priority: 0.4, changeFrequency: 'monthly', lastModified: '2026-09-29', summary: 'What stays on your machine, what the routing log keeps, and what telemetry sends (opt-in).' },
  { path: '/vs/claude-code-router', priority: 0.7, changeFrequency: 'monthly', lastModified: '2026-10-14', summary: 'Mooter vs Claude Code Router: a hook that recommends versus a local gateway, with sources and when not to use mooter.' },
  { path: '/vs/litellm', priority: 0.7, changeFrequency: 'monthly', lastModified: '2026-10-14', summary: 'Mooter vs LiteLLM: a per-developer hook versus a self-hosted AI gateway, with sources and when not to use mooter.' },
  { path: '/guides/cut-claude-code-costs-with-local-models', priority: 0.7, changeFrequency: 'monthly', lastModified: '2026-10-14', summary: 'A step-by-step guide to using local Ollama models with Claude Code through mooter, and what to expect.' },
  { path: '/faq', priority: 0.6, changeFrequency: 'monthly', lastModified: '2026-10-14', summary: 'Short answers: what mooter is, what it does not do, privacy, install, uninstall.' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly', lastModified: '2026-10-14', summary: 'Who makes mooter, the MIT license, the source code and how to get in touch.' },
];

export function pageByPath(path: string): SitePage {
  const p = PAGES.find((x) => x.path === path);
  if (!p) throw new Error(`site-pages: ${path} is not in PAGES`);
  return p;
}

export function urlFor(path: string): string {
  return `${SITE}${path}`;
}

// ── Identidade ─────────────────────────────────────────────────────────────
// O bloco Organization vive num <script> PRÓPRIO no layout, ao lado do bloco
// existente — nunca fundido nele. O @graph do layout fica byte a byte como
// estava; quem compara o antes e o depois vê um bloco a mais, não um bloco
// diferente.
//
// sameAs lista só o que foi verificado a 2026-10-14: o repositório (200) e a
// extensão no VS Marketplace (a API devolve publisher `mooter`, extensão
// `mooter-cockpit`). O `@mooter/cli` no npm existe mas é uma RESERVA do nome
// (0.0.1, «Public release coming soon», publicada a 2026-04-13): listá-la como
// presença oficial seria dizer que há um pacote onde há um marcador. Entra
// quando houver release de facto.
export const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE}/#org`,
  name: 'mooter',
  url: SITE,
  logo: `${SITE}/mooter-logo.svg`,
  description: 'Open-source (MIT) project that builds mooter, the local router for Claude Code.',
  founder: { '@type': 'Person', name: 'Paulo Loureiro', url: 'https://github.com/pauloloureiroshp-ship-it' },
  sameAs: [GITHUB_REPO, VS_MARKETPLACE],
} as const;
