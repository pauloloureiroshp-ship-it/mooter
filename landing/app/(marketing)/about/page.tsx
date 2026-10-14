import type { Metadata } from 'next';
import { pageMeta } from '@/app/lib/page-meta';
import { JsonLd } from '@/app/lib/jsonld';
import { GITHUB_ISSUES, GITHUB_LICENSE, GITHUB_REPO, GITHUB_SECURITY, ORGANIZATION, SITE, VS_MARKETPLACE, pageByPath } from '@/app/lib/site-pages';
import { DocPage, Sec, Bullets, Ext, Int, P } from '../_doc/DocKit';

const PATH = '/about';

const TITLE = 'About mooter — who makes it, license and source';
const DESCRIPTION =
  'Mooter is an open-source (MIT) hook for Claude Code, made by Paulo Loureiro as a single-founder project. Source code, license, and how to get in touch.';

export const metadata: Metadata = pageMeta(PATH, TITLE, DESCRIPTION);

export default function Page() {
  const { lastModified } = pageByPath(PATH);
  // Este bloco repete a Organization do layout, com o mesmo @id, por dentro de
  // uma AboutPage: quem lê só esta página vê a identidade completa, e quem junta
  // os blocos pelo @id vê UM nó, não dois.
  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: `${SITE}${PATH}`,
    name: 'About mooter',
    dateModified: lastModified,
    mainEntity: ORGANIZATION,
  };
  return (
    <DocPage
      sheet="ABOUT"
      desenho="024"
      date={lastModified}
      h1="About mooter"
      lede={
        <>
          Mooter is an open-source (MIT) hook for Claude Code that recommends a model tier for each prompt. It is made
          by Paulo Loureiro as a single-founder project and is not affiliated with Anthropic.
        </>
      }
    >
      <Sec marg="what" value="a hook" note="not a proxy" title="What it is">
        <p style={P}>
          Mooter installs into Claude Code as a hook. It reads each prompt on your machine, classifies it into a tier — T0
          local Ollama, T1 Haiku, T2 Sonnet, T3 Opus — and writes a recommendation Claude Code can follow. No request
          passes through a Mooter server. Today it recommends and does not enforce; the{' '}
          <Int href="/#honest-numbers">honest numbers</Int> section shows the gap between what it recommended and what
          ran.
        </p>
      </Sec>

      <Sec marg="who" value="solo" note="single founder" title="Who makes it">
        <p style={P}>
          Paulo Loureiro builds and maintains Mooter. The copyright line in the license is his. So are the benchmarks and
          numbers on this site: they are ours, and we know of no independent review of them.
        </p>
      </Sec>

      <Sec marg="license" value="MIT" note="free to use, read, fork" title="License and source">
        <Bullets
          items={[
            <>
              Source code and issues: <Ext href={GITHUB_REPO}>GitHub</Ext>
            </>,
            <>
              License: <Ext href={GITHUB_LICENSE}>MIT</Ext>
            </>,
            <>
              VS Code extension: <Ext href={VS_MARKETPLACE}>Mooter — Cost Cockpit for Claude Code</Ext> on the Visual Studio
              Marketplace
            </>,
          ]}
        />
      </Sec>

      <Sec marg="contact" value="GitHub" note="public, no email on this page" title="How to get in touch">
        <Bullets
          items={[
            <>
              Questions, bugs, or a fact on this site that is wrong: <Ext href={GITHUB_ISSUES}>open an issue</Ext>. We fix
              errors in the comparison pages when the source says otherwise.
            </>,
            <>
              Security reports: follow <Ext href={GITHUB_SECURITY}>SECURITY.md</Ext> in the repository, and do not open a
              public issue.
            </>,
          ]}
        />
      </Sec>

      <Sec marg="more" value="read" note="what we claim, and what we withdrew" title="Read next">
        <p style={P}>
          <Int href="/faq">FAQ</Int> · <Int href="/methodology">Methodology</Int> · <Int href="/privacy">Privacy</Int> ·{' '}
          <Int href="/install">Install</Int> · <Int href="/vs/claude-code-router">vs Claude Code Router</Int> ·{' '}
          <Int href="/vs/litellm">vs LiteLLM</Int>
        </p>
      </Sec>

      <JsonLd data={aboutLd} />
    </DocPage>
  );
}
