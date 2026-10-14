import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { pageMeta } from '@/app/lib/page-meta';
import { JsonLd, articleLd, faqLd, type QA } from '@/app/lib/jsonld';
import { EXEC_SENTENCE, EXEC_SCOPE, NO_DOLLARS, LOCAL_OF_TOTAL } from '@/app/lib/doc-facts';
import { FACTS_READ, pageByPath } from '@/app/lib/site-pages';
import { DocPage, Sec, FactTable, FaqList, Bullets, Ext, Int, Code, P } from '../../_doc/DocKit';

const PATH = '/vs/claude-code-router';
const TITLE = 'Mooter vs Claude Code Router — hook or gateway?';
const DESCRIPTION =
  'Claude Code Router is a local gateway your requests go through; Mooter is a hook that recommends a model tier. Sourced differences, and when not to use Mooter.';
const CCR = 'https://github.com/musistudio/claude-code-router';

export const metadata: Metadata = pageMeta(PATH, TITLE, DESCRIPTION);

const FAQ: QA[] = [
  {
    q: 'Is Mooter an alternative to Claude Code Router?',
    a: 'Only partly. Both are about choosing a model for Claude Code, but Claude Code Router sits in the request path and Mooter does not. If you need requests sent to a provider you choose, that is a gateway job; if you want a per-prompt tier recommendation with local Ollama for small tasks, that is what Mooter does.',
  },
  {
    q: 'Can I run both?',
    a: 'We have not tested running Mooter and Claude Code Router together, so we make no claim about it.',
  },
  {
    q: 'Which one is cheaper to run?',
    a: `Neither page can say. Mooter logs no tokens, so it has no measured dollar figure and publishes none. Claude Code Router's README mentions per-request cost estimates, but we found no savings figure and did not look beyond the README.`,
  },
];

const ROWS: ReactNode[][] = [

            [
              'What it is',
              'A hook registered in your Claude Code settings, plus a CLI. Open source, MIT.',
              <>
                &ldquo;a local model gateway and control plane for coding agents&rdquo; (its README). Open source, MIT.
              </>,
            ],
            [
              'Where it sits',
              'Beside the request. The hook adds a recommendation to the prompt context; no Mooter server or gateway handles the request.',
              <>
                In the request path. Agents send requests to a local endpoint (default <Code>http://127.0.0.1:3456</Code>),
                which forwards them to the selected provider, model and account.
              </>,
            ],
            [
              'Install',
              <>
                <Code>bash &lt;(curl -fsSL https://mooter.ai/install.sh)</Code>, which asks for Claude Code and Node 22.
              </>,
              <>
                A desktop app (marked &ldquo;recommended&rdquo; in its README), or <Code>npm install -g @musistudio/claude-code-router</Code>{' '}
                then <Code>ccr ui</Code> (Node 22 or newer). Docker is also listed.
              </>,
            ],
            [
              'How routing works',
              'Rules on your machine classify each prompt into T0 (local Ollama), T1 (Haiku), T2 (Sonnet) or T3 (Opus).',
              'Routing conditions on headers and bodies, prefixes, rewrites, retries and ordered fallbacks, set in its management UI.',
            ],
            [
              'Providers',
              'Built around Claude Code, plus local Ollama for T0.',
              'Lists OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, SiliconFlow, Moonshot, Kimi Code, Mistral, Z.AI, Bailian and custom compatible providers.',
            ],
            [
              'Local models (Ollama)',
              'Yes, T0. The installer pulls qwen2.5:3b (about 1.9 GB) if Ollama is present.',
              'n/d: its README does not mention Ollama.',
            ],
            [
              'Is the choice enforced?',
              <>
                No, not today. The hook recommends and Claude Code decides. {LOCAL_OF_TOTAL} recorded executions ran
                locally.
              </>,
              'Requests that go through the gateway are forwarded according to its rules.',
            ],
            [
              'Measured dollar savings',
              'None. No tokens are logged, so no figure is published.',
              'No savings figure found. Its README does mention per-request token usage and cost estimates (observability).',
            ],
            ['License', 'MIT', 'MIT (its README)'],
            [
              'Maturity',
              'Single-founder project. The only measurements published are our own.',
              'n/d: not assessed here.',
            ],
];

export default function Page() {
  const { lastModified } = pageByPath(PATH);
  return (
    <DocPage
      sheet="VS CLAUDE CODE ROUTER"
      desenho="020"
      date={lastModified}
      h1="Mooter vs Claude Code Router"
      lede={
        <>
          Claude Code Router is a local gateway: Claude Code&apos;s requests go through it, and it forwards them to the
          provider and model you configure. Mooter is a hook: it reads each prompt on your machine and recommends a
          tier, and no Mooter server handles the request. The core difference is a gateway in the request path versus a hook
          beside it.
        </>
      }
    >
      <Sec marg="short answer" value="hook vs gateway" note="different jobs, partly overlapping" title="Which one fits">
        <Bullets
          items={[
            <>
              <strong>Pick Claude Code Router</strong> if you want Claude Code&apos;s requests to reach a provider or model
              you choose, with rules that apply to the request itself.
            </>,
            <>
              <strong>Pick Mooter</strong> if you stay on Claude Code&apos;s own connection and want a per-prompt tier
              recommendation (local Ollama up to Opus) without running a gateway.
            </>,
            <>
              <strong>Pick neither</strong> if you need a measured dollar saving: Mooter publishes none, and this page
              found none for Claude Code Router.
            </>,
          ]}
        />
      </Sec>

      <Sec marg="side by side" value={`${ROWS.length} rows`} note={`read ${FACTS_READ}`} title="What each one is">
        <FactTable head={['', 'Mooter', 'Claude Code Router']} rows={ROWS} />
        <p style={{ ...P, fontSize: 12.5, marginTop: 12 }}>
          Claude Code Router column: <Ext href={CCR}>its GitHub README</Ext>, read {FACTS_READ}. Mooter column: this site
          (<Int href="/install">install</Int>, <Int href="/privacy">privacy</Int>, <Int href="/#honest-numbers">honest numbers</Int>)
          and the <Ext href="https://github.com/pauloloureiroshp-ship-it/mooter">repository</Ext>. n/d means not stated
          in the source we read.
        </p>
      </Sec>

      <Sec marg="what runs" value={LOCAL_OF_TOTAL} note="executions that ran locally" title="What Mooter actually does today">
        <p style={P}>{EXEC_SENTENCE}</p>
        <p style={P}>{EXEC_SCOPE}</p>
        <p style={P}>{NO_DOLLARS}</p>
      </Sec>

      <Sec marg="use theirs" value="when" note="honest limits of Mooter" title="When to use Claude Code Router instead">
        <Bullets
          items={[
            'You want Claude Code to talk to a provider other than Anthropic. The Mooter hook does not reroute the requests Claude Code makes.',
            'You want the routing rule to apply to every request, not depend on the model following a recommendation.',
            'You want a UI to manage providers, models and accounts in one place.',
          ]}
        />
      </Sec>

      <Sec marg="not mooter" value="when not" note="read before installing" title="When not to use Mooter">
        <Bullets
          items={[
            <>
              You need the model choice <strong>enforced</strong>. Today Mooter advises; of the executions measured, {LOCAL_OF_TOTAL} ran
              locally.
            </>,
            'You need a measured dollar saving or a savings percentage. Mooter has neither and publishes neither.',
            'You do not use Claude Code. Mooter is a hook for it and has nothing to attach to elsewhere.',
            'You need a team-wide setup. Mooter installs per developer machine, and every number on this site comes from one machine.',
            'You want something with independent reviews behind it. It is a single-founder project and the benchmarks are ours.',
          ]}
        />
      </Sec>

      <Sec marg="faq" value={`${FAQ.length} Q`} note="short" title="Questions">
        <FaqList items={FAQ} />
        <p style={{ ...P, marginTop: 10 }}>
          More: <Int href="/vs/litellm">Mooter vs LiteLLM</Int> · <Int href="/compare">full comparison table</Int> ·{' '}
          <Int href="/guides/cut-claude-code-costs-with-local-models">using local models with Claude Code</Int> ·{' '}
          <Int href="/faq">FAQ</Int>. Spot an error? <Ext href="https://github.com/pauloloureiroshp-ship-it/mooter/issues">Open an issue</Ext>.
        </p>
      </Sec>

      <JsonLd data={articleLd(PATH, TITLE, DESCRIPTION)} />
      <JsonLd data={faqLd(FAQ)} />
    </DocPage>
  );
}
