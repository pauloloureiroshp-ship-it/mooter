import { JANELA, M } from './canonical-metrics';
import type { QA } from './jsonld';

// doc-facts.ts — as frases das páginas novas que carregam número.
//
// Nenhum número é escrito aqui: todos saem de `canonical-metrics.ts`, que é a
// única fonte do que esta landing pode afirmar. As páginas /vs/*, /guides/* e
// /faq repetem a MESMA frase (a da execução, 1 local em 3.225) porque é a
// ressalva que o diagnóstico do Prisma apontou como a objecção nº 1 — e uma
// ressalva que cada página escreve à sua maneira é uma ressalva que um dia
// diverge.

const DE = JANELA.de.slice(0, 10);
const ATE = JANELA.ate.slice(0, 10);

/** «O router recomendou … Nas mesmas sessões, de 3225 execuções, 3193 correram no Opus e 1 localmente.» */
export const EXEC_SENTENCE = M.frase;

/** A janela e o denominador, para ir colados à frase acima. */
export const EXEC_SCOPE = `Measured ${DE} to ${ATE} on one machine, from the router's own decisions and execution logs. Not a forecast, and not a measure of your setup.`;

/** A ressalva do dinheiro: não há tokens registados, não há valor. */
export const NO_DOLLARS = M.ressalva;

/** «1 of 3225» — a forma curta, para tabelas. */
export const LOCAL_OF_TOTAL = `${M.execucoesLocal} of ${M.execucoes}`;

export const FAQ: QA[] = [
  {
    q: 'What is Mooter?',
    a: 'Mooter is an open-source (MIT) hook for Claude Code. It reads each prompt on your machine, classifies it into a tier — T0 local Ollama, T1 Haiku, T2 Sonnet, T3 Opus — and writes a recommendation that Claude Code can follow. It is not a proxy and not a gateway: no Mooter server handles the request.',
  },
  {
    q: 'Does Mooter actually run my prompts on cheaper or local models?',
    a: `Almost never, today: the hook recommends, and Claude Code decides whether to follow the recommendation. ${EXEC_SENTENCE} ${EXEC_SCOPE}`,
  },
  {
    q: 'How much money does Mooter save?',
    a: `Unknown. ${NO_DOLLARS} A headline figure from earlier launch posts has been withdrawn. What can be measured on your own machine is described on the methodology page.`,
  },
  {
    q: 'Is Mooter a proxy? Does my code go through your servers?',
    a: 'No. Mooter is a hook in your terminal. Execution goes straight to your own provider or to local Ollama; no Mooter server handles the request. Two caveats from the privacy page: if an Anthropic API key is set and the local rules are unsure, Claude Haiku may be asked to break the tie, which sends your prompt to Anthropic with your key (MOOTER_ARBITER_DISABLE=1 keeps classification fully local); and with an API key set, some tasks classified T0 still run on cloud Haiku instead of local Ollama.',
  },
  {
    q: 'How is Mooter different from Claude Code Router?',
    a: 'Claude Code Router is a local gateway: requests go through it to the provider and model you configure. Mooter is a hook: it recommends a tier and stays out of the request path. The comparison page has the sources, the date they were read, and when not to use Mooter.',
  },
  {
    q: 'How is Mooter different from LiteLLM?',
    a: "LiteLLM's AI Gateway is a self-hosted server with one OpenAI-compatible endpoint for 100+ providers, with virtual keys, budgets and spend tracking. Mooter has none of that: it is a per-developer hook for Claude Code. The comparison page has the sources and when not to use Mooter.",
  },
  {
    q: 'How do I install Mooter?',
    a: 'Run bash <(curl -fsSL https://mooter.ai/install.sh) on macOS, Linux, or Windows via bash. It needs Claude Code and Node 22; Ollama and an API key are optional. Add --dry-run to preview every change before anything is written.',
  },
  {
    q: 'Do I need Ollama or a local model?',
    a: 'Ollama is optional: the installer degrades gracefully without it, and pulls qwen2.5:3b (about 1.9 GB) for the local T0 tier if Ollama is present. Without a local model, T0 has nowhere local to run.',
  },
  {
    q: 'How do I uninstall Mooter?',
    a: 'Run mooter uninstall. It removes the shim, the runtime and the hooks.',
  },
  {
    q: 'When should I not use Mooter?',
    a: 'If you need the model choice enforced, a measured dollar figure, per-team keys and budgets, or a way to reroute Claude Code requests to other providers, use a gateway instead. If you do not use Claude Code, Mooter has nothing to hook into.',
  },
  {
    q: 'Who makes Mooter?',
    a: 'Paulo Loureiro, as a single-founder open-source project under the MIT license. It is a community project and is not affiliated with Anthropic.',
  },
];
