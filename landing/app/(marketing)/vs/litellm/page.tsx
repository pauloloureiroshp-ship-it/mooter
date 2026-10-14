import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { pageMeta } from '@/app/lib/page-meta';
import { JsonLd, articleLd, faqLd, type QA } from '@/app/lib/jsonld';
import { EXEC_SENTENCE, EXEC_SCOPE, NO_DOLLARS, LOCAL_OF_TOTAL } from '@/app/lib/doc-facts';
import { FACTS_READ, pageByPath } from '@/app/lib/site-pages';
import { DocPage, Sec, FactTable, FaqList, Bullets, Ext, Int, Code, P } from '../../_doc/DocKit';

const PATH = '/vs/litellm';
const TITLE = 'Mooter vs LiteLLM — hook or AI gateway?';
const DESCRIPTION =
  'LiteLLM is a self-hosted AI gateway your applications call; Mooter is a per-developer hook for Claude Code that recommends a model tier. Sourced differences, and when not to use Mooter.';
const DOCS = 'https://docs.litellm.ai/docs/simple_proxy';
const DOCS_OLLAMA = 'https://docs.litellm.ai/docs/providers/ollama';

export const metadata: Metadata = pageMeta(PATH, TITLE, DESCRIPTION);

const FAQ: QA[] = [
  {
    q: 'Is Mooter an alternative to LiteLLM?',
    a: 'Mostly no. LiteLLM is a gateway that applications and teams call, with keys, budgets and spend tracking. Mooter is a hook inside one developer\'s Claude Code. They overlap only on the idea of sending cheaper work to cheaper models.',
  },
  {
    q: 'Can LiteLLM route to local Ollama models?',
    a: 'Yes. LiteLLM\'s documentation says it supports all models from Ollama, addressed with the ollama/<model> prefix; the same page recommends the ollama_chat/ prefix for better responses. Mooter also uses Ollama, for its local T0 tier.',
  },
  {
    q: 'Can I use LiteLLM with Claude Code?',
    a: 'LiteLLM\'s documentation lists "Client setup — Connect Claude Code, Codex, and other clients to the gateway" as a next step. We have not tested it, so we make no claim beyond what the documentation says.',
  },
];

const ROWS: ReactNode[][] = [
  [
    'What it is',
    'A hook registered in your Claude Code settings, plus a CLI. Open source, MIT.',
    <>
      A &ldquo;self-hosted server&rdquo; that gives applications &ldquo;one OpenAI-compatible endpoint for 100+ LLM
      providers, MCP tools, and A2A agents&rdquo; (its docs).
    </>,
  ],
  [
    'Where it sits',
    'Beside the request. The hook adds a recommendation to the prompt context; no Mooter server or gateway handles the request.',
    <>
      In the request path. A client sends requests to the gateway (the docs example uses <Code>base_url=&quot;http://localhost:4000&quot;</Code> and
      a virtual key), which forwards them to the provider and returns the reply in OpenAI format.
    </>,
  ],
  [
    'Who it is for',
    'One developer on one machine, using Claude Code.',
    'Applications and teams that call many providers through one endpoint: "If a client can use the OpenAI API, the client can also use the gateway."',
  ],
  [
    'Install',
    <>
      <Code>bash &lt;(curl -fsSL https://mooter.ai/install.sh)</Code>, which asks for Claude Code and Node 22.
    </>,
    'A one-line quickstart script from the LiteLLM repository ("approximately five minutes", per its docs), then an Admin UI at /ui. Docker, Helm and Terraform deployments and a Postgres database are also described.',
  ],
  [
    'Routing',
    'Rules on your machine classify each prompt into T0 (local Ollama), T1 (Haiku), T2 (Sonnet) or T3 (Opus).',
    'Load balancing, fallbacks and retries move traffic between deployments when a provider has a problem. An "Auto Router" is listed; the page does not explain how it works.',
  ],
  [
    'Keys, budgets, spend',
    'None. No tokens are logged and no dollar figure is published.',
    'Records the cost of each request and shows spend per key, team, user and tag. Virtual keys carry their own models, budgets and rate limits.',
  ],
  [
    'Local models (Ollama)',
    'Yes, T0. The installer pulls qwen2.5:3b (about 1.9 GB) if Ollama is present.',
    <>
      Yes: &ldquo;LiteLLM supports all models from Ollama&rdquo;, with the <Code>ollama/&lt;model&gt;</Code> prefix (its page recommends <Code>ollama_chat/</Code> for better responses).
    </>,
  ],
  [
    'Is the choice enforced?',
    <>
      No, not today. The hook recommends and Claude Code decides. {LOCAL_OF_TOTAL} recorded executions ran locally.
    </>,
    'Requests that go through the gateway follow its configuration.',
  ],
  ['License', 'MIT', 'MIT (license link in the docs footer).'],
];

export default function Page() {
  const { lastModified } = pageByPath(PATH);
  return (
    <DocPage
      sheet="VS LITELLM"
      desenho="021"
      date={lastModified}
      h1="Mooter vs LiteLLM"
      lede={
        <>
          LiteLLM is a self-hosted AI gateway: your applications call one OpenAI-compatible endpoint and it forwards to
          the provider behind it. Mooter is a hook inside one developer&apos;s Claude Code: it reads each prompt on your
          machine and recommends a tier, and no Mooter server handles the request. The core difference is a gateway in the
          request path versus a hook beside it.
        </>
      }
    >
      <Sec marg="short answer" value="hook vs gateway" note="different jobs" title="Which one fits">
        <Bullets
          items={[
            <>
              <strong>Pick LiteLLM</strong> if you need one endpoint for many providers, virtual keys, budgets, spend per
              team, or fallbacks between deployments.
            </>,
            <>
              <strong>Pick Mooter</strong> if you are one developer on Claude Code and want a per-prompt tier
              recommendation, with local Ollama for small tasks, without running a server.
            </>,
            <>
              <strong>Pick neither</strong> if you need a measured saving on your own Claude Code usage today: Mooter
              publishes none, and LiteLLM&apos;s spend tracking is a feature of requests that pass through it.
            </>,
          ]}
        />
      </Sec>

      <Sec marg="side by side" value={`${ROWS.length} rows`} note={`read ${FACTS_READ}`} title="What each one is">
        <FactTable head={['', 'Mooter', 'LiteLLM AI Gateway']} rows={ROWS} />
        <p style={{ ...P, fontSize: 12.5, marginTop: 12 }}>
          LiteLLM column: <Ext href={DOCS}>docs.litellm.ai/docs/simple_proxy</Ext> and{' '}
          <Ext href={DOCS_OLLAMA}>docs.litellm.ai/docs/providers/ollama</Ext>, read {FACTS_READ}. Mooter column: this
          site (<Int href="/install">install</Int>, <Int href="/privacy">privacy</Int>, <Int href="/#honest-numbers">honest numbers</Int>)
          and the <Ext href="https://github.com/pauloloureiroshp-ship-it/mooter">repository</Ext>.
        </p>
      </Sec>

      <Sec marg="what runs" value={LOCAL_OF_TOTAL} note="executions that ran locally" title="What Mooter actually does today">
        <p style={P}>{EXEC_SENTENCE}</p>
        <p style={P}>{EXEC_SCOPE}</p>
        <p style={P}>{NO_DOLLARS}</p>
      </Sec>

      <Sec marg="use theirs" value="when" note="honest limits of Mooter" title="When to use LiteLLM instead">
        <Bullets
          items={[
            'Several applications or people share one gateway and you need to know who spent what.',
            'You need keys with budgets and rate limits, or fallbacks when a provider has a problem.',
            'Your clients speak the OpenAI API and you want one endpoint in front of many providers.',
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
            'You need spend per key, team or user, or budgets. Mooter has no keys, no budgets and no spend tracking.',
            'You are not using Claude Code. Mooter is a hook for it and has nothing to attach to elsewhere.',
            'You need a team-wide or server-side setup. Mooter installs per developer machine, and every number on this site comes from one machine.',
            'You want something with independent reviews behind it. It is a single-founder project and the benchmarks are ours.',
          ]}
        />
      </Sec>

      <Sec marg="faq" value={`${FAQ.length} Q`} note="short" title="Questions">
        <FaqList items={FAQ} />
        <p style={{ ...P, marginTop: 10 }}>
          More: <Int href="/vs/claude-code-router">Mooter vs Claude Code Router</Int> · <Int href="/compare">full comparison table</Int> ·{' '}
          <Int href="/guides/cut-claude-code-costs-with-local-models">using local models with Claude Code</Int> ·{' '}
          <Int href="/faq">FAQ</Int>. Spot an error? <Ext href="https://github.com/pauloloureiroshp-ship-it/mooter/issues">Open an issue</Ext>.
        </p>
      </Sec>

      <JsonLd data={articleLd(PATH, TITLE, DESCRIPTION)} />
      <JsonLd data={faqLd(FAQ)} />
    </DocPage>
  );
}
