import type { Metadata } from 'next';
import { pageMeta } from '@/app/lib/page-meta';
import { JsonLd, faqLd } from '@/app/lib/jsonld';
import { FAQ } from '@/app/lib/doc-facts';
import { pageByPath } from '@/app/lib/site-pages';
import { DocPage, Sec, FaqList, Int } from '../_doc/DocKit';

const PATH = '/faq';

const TITLE = 'Mooter FAQ — what it is, what it does not do';
const DESCRIPTION =
  'Short answers about Mooter, the local router hook for Claude Code: what it recommends, what actually runs, privacy, install, uninstall, and when not to use it.';

export const metadata: Metadata = pageMeta(PATH, TITLE, DESCRIPTION);

// Cada pergunta pode apontar para a página que a desenvolve. A chave é a
// pergunta, para o texto visível e o JSON-LD continuarem a vir da MESMA lista.
const MORE: Record<string, { href: string; label: string }> = {
  'What is Mooter?': { href: '/about', label: 'About' },
  'Does Mooter actually run my prompts on cheaper or local models?': { href: '/methodology', label: 'Methodology' },
  'How much money does Mooter save?': { href: '/methodology', label: 'Methodology' },
  'Is Mooter a proxy? Does my code go through your servers?': { href: '/privacy', label: 'Privacy' },
  'How is Mooter different from Claude Code Router?': { href: '/vs/claude-code-router', label: 'Mooter vs Claude Code Router' },
  'How is Mooter different from LiteLLM?': { href: '/vs/litellm', label: 'Mooter vs LiteLLM' },
  'How do I install Mooter?': { href: '/install', label: 'Install' },
  'Do I need Ollama or a local model?': { href: '/guides/cut-claude-code-costs-with-local-models', label: 'Guide: local models with Claude Code' },
  'Who makes Mooter?': { href: '/about', label: 'About' },
};

export default function Page() {
  const { lastModified } = pageByPath(PATH);
  const links = Object.fromEntries(
    Object.entries(MORE).map(([q, m]) => [q, <Int key={q} href={m.href}>{m.label} →</Int>]),
  );
  return (
    <DocPage
      sheet="FAQ"
      desenho="023"
      date={lastModified}
      h1="Mooter, in short answers"
      lede={
        <>
          Mooter is an open-source hook for Claude Code that reads each prompt on your machine and recommends a model
          tier. It recommends; it does not enforce, and it measures no dollars. These are the questions people ask first.
        </>
      }
    >
      <Sec marg="faq" value={`${FAQ.length} Q`} note="answers match the sources linked" title="Questions">
        <FaqList items={FAQ} links={links} />
      </Sec>
      <JsonLd data={faqLd(FAQ)} />
    </DocPage>
  );
}
