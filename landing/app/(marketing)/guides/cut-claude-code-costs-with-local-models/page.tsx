import type { Metadata } from 'next';
import { pageMeta } from '@/app/lib/page-meta';
import { JsonLd, articleLd, faqLd, type QA } from '@/app/lib/jsonld';
import { EXEC_SENTENCE, EXEC_SCOPE, NO_DOLLARS, LOCAL_OF_TOTAL } from '@/app/lib/doc-facts';
import { pageByPath } from '@/app/lib/site-pages';
import { DocPage, Sec, FaqList, Bullets, Ext, Int, Code, Pre, P } from '../../_doc/DocKit';

const PATH = '/guides/cut-claude-code-costs-with-local-models';
const TITLE = 'Reduce Claude Code cost with local models (Ollama) — what Mooter can and cannot do';
const DESCRIPTION =
  'Using local Ollama models with Claude Code through Mooter: the real install steps, what happens on each prompt, and what to expect. Mooter recommends a model for cheap prompts; it does not enforce it.';

export const metadata: Metadata = pageMeta(PATH, TITLE, DESCRIPTION);

const FAQ: QA[] = [
  {
    q: 'Will a local model replace Claude for my hard prompts?',
    a: 'No, and Mooter does not try to. It recommends a local model for small work (commit messages, renames, small edits, "explain this") and recommends Sonnet or Opus for debugging, refactors and architecture. Destructive prompts such as "rm -rf the production database" are floored to T3.',
  },
  {
    q: 'Do I need an API key?',
    a: 'No. The installer degrades gracefully without an Anthropic API key and without Ollama. With a key set, an unsure classification can be checked by Claude Haiku, which sends the prompt to Anthropic with your key; set MOOTER_ARBITER_DISABLE=1 to keep classification fully local.',
  },
  {
    q: 'Is anything sent to a Mooter server?',
    a: 'No Mooter server handles the request. Telemetry is off by default and, when turned on, carries only aggregated stats and hashes, never prompt text. See the privacy page for what is kept on your machine.',
  },
];

export default function Page() {
  const { lastModified } = pageByPath(PATH);
  return (
    <DocPage
      sheet="GUIDE"
      desenho="022"
      date={lastModified}
      h1="Reduce Claude Code cost with local models: what Mooter can and cannot do"
      lede={
        <>
          Mooter is a hook that classifies each Claude Code prompt on your machine and recommends a tier, from local
          Ollama (T0) up to Opus (T3). To use it with a local model, install Ollama and then Mooter. It recommends; it
          does not enforce, it measures no dollars, and today almost none of the executions it has measured ran locally,
          so read the numbers in step 5 before you expect a lower bill.
        </>
      }
    >
      <Sec marg="step 1" value="what's cheap" note="the prompts a local model can take" title="1. Know which prompts are small">
        <p style={P}>
          Some Claude Code prompts are small: commit messages, renames, small edits, &ldquo;explain this&rdquo;.
          Mooter&apos;s classifier sorts prompts into four tiers, and the install page shows how it treats four
          representative prompts:
        </p>
        <Bullets
          items={[
            <>&ldquo;write a commit message for this change&rdquo; → T0 or T1 (local or Haiku)</>,
            <>&ldquo;my app crashes when I click submit on mobile&rdquo; → T2 (Sonnet)</>,
            <>&ldquo;design the multi-tenant auth architecture&rdquo; → T3 (Opus)</>,
            <>&ldquo;rm -rf the production database&rdquo; → T3, floored</>,
          ]}
        />
      </Sec>

      <Sec marg="step 2" value="Ollama" note="optional but it is the local tier" title="2. Run a local model with Ollama">
        <p style={P}>
          Install Ollama from <Ext href="https://ollama.com/download">ollama.com/download</Ext>. If Ollama is present
          when you install Mooter, the installer pulls <Code>qwen2.5:3b</Code> (about 1.9 GB) for the free local T0 tier.
          You can pull it yourself first:
        </p>
        <Pre>{`ollama pull qwen2.5:3b`}</Pre>
        <p style={P}>
          Without Ollama, Mooter still installs and still recommends tiers; T0 just has nowhere local to run. The
          calculator on <Int href="/methodology">the methodology page</Int> treats a machine with no discrete GPU as
          having no local tier. That is a modelling assumption there, not a measurement.
        </p>
      </Sec>

      <Sec marg="step 3" value="install" note="one command, --dry-run first" title="3. Install Mooter">
        <p style={P}>
          Mooter needs Claude Code and Node 22. Preview every change first, then install:
        </p>
        <Pre>{`bash <(curl -fsSL https://mooter.ai/install.sh) --dry-run
bash <(curl -fsSL https://mooter.ai/install.sh)`}</Pre>
        <p style={P}>
          The installer copies the routing runtime to <Code>~/.claude/tools/router/</Code>, the CLI to{' '}
          <Code>~/.mooter/cli/</Code>, adds a shim at <Code>~/.local/bin/mooter</Code>, writes{' '}
          <Code>~/.mooter/env</Code>, and registers hooks in <Code>~/.claude/settings.json</Code> with a non-destructive
          merge. It runs on macOS, Linux, and Windows via bash. Then:
        </p>
        <Pre>{`source ~/.mooter/env     # or open a new terminal
mooter doctor           # runs checks against the runtime and your environment
mooter                  # opens Claude Code with the hook active`}</Pre>
        <p style={P}>
          The full list of steps and flags is on <Int href="/install">the install page</Int>. To undo everything:{' '}
          <Code>mooter uninstall</Code>.
        </p>
      </Sec>

      <Sec marg="step 4" value="per prompt" note="what the hook does" title="4. What happens on each prompt">
        <Bullets
          items={[
            'The hook reads your prompt on your machine and classifies it with rules — no AI, no network.',
            'If an Anthropic API key is set and the rules are unsure, Claude Haiku may break the tie. That call sends your prompt to Anthropic with your key; MOOTER_ARBITER_DISABLE=1 turns it off.',
            'The result is a recommendation: a tier, from T0 (local Ollama) to T3 (Opus). Claude Code can follow it.',
            'Execution then goes straight to your own provider, or to local Ollama. No Mooter server is in the path.',
          ]}
        />
      </Sec>

      <Sec marg="step 5" value={LOCAL_OF_TOTAL} note="executions that ran locally" title="5. What to expect — the honest part">
        <p style={P}>{EXEC_SENTENCE}</p>
        <p style={P}>{EXEC_SCOPE}</p>
        <p style={P}>
          That gap, between what the router recommended and what actually ran, is the current state of the product.{' '}
          {NO_DOLLARS} A savings figure from earlier launch posts has been withdrawn; the{' '}
          <Int href="/methodology">methodology page</Int> explains why.
        </p>
      </Sec>

      <Sec marg="step 6" value="measure" note="on your side, by you" title="6. Check the result yourself">
        <p style={P}>
          Mooter will not tell you what you saved, because it does not log tokens. Compare the usage your own provider
          already reports for a stretch of work before you installed Mooter with a stretch after. That comparison is yours to
          make, and it is the only one that reflects your setup.
        </p>
      </Sec>

      <Sec marg="not mooter" value="when not" note="read before installing" title="When not to use Mooter">
        <Bullets
          items={[
            <>
              You need the choice <strong>enforced</strong>: use a gateway that sits in the request path, such as{' '}
              <Int href="/vs/claude-code-router">Claude Code Router</Int> or <Int href="/vs/litellm">LiteLLM</Int>.
            </>,
            'You need a measured dollar saving: Mooter has none to give.',
            'You need to reroute Claude Code requests to another provider: the Mooter hook does not do that.',
            'You do not use Claude Code, or you need a team-wide setup: Mooter is per developer machine.',
          ]}
        />
      </Sec>

      <Sec marg="faq" value={`${FAQ.length} Q`} note="short" title="Questions">
        <FaqList items={FAQ} />
        <p style={{ ...P, marginTop: 10 }}>
          More: <Int href="/vs/claude-code-router">Mooter vs Claude Code Router</Int> ·{' '}
          <Int href="/vs/litellm">Mooter vs LiteLLM</Int> · <Int href="/privacy">privacy</Int> · <Int href="/faq">FAQ</Int>.
        </p>
      </Sec>

      <JsonLd data={articleLd(PATH, TITLE, DESCRIPTION)} />
      <JsonLd data={faqLd(FAQ)} />
    </DocPage>
  );
}
