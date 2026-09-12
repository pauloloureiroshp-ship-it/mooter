// ollama-host.ts — uma só resposta a «qual é o URL do Ollama?», do lado do CLI.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// `OLLAMA_HOST=127.0.0.1:11434` — sem esquema — é o formato CANÓNICO: é assim
// que o próprio Ollama o documenta e o imprime. Quatro sítios deste pacote
// assumiam que vinha com `http://` e partiam com o valor real de uma máquina:
//
//   · `audit/orchestrator.ts`      → `fetch("127.0.0.1:11434/api/generate")`
//   · `commands/init.ts`           → o mesmo, na sonda de `/api/tags`
//   · `commands/quant-vector.ts`   → idem
//   · `fable-observe/cca-f-audit.ts` → idem
//
// A 2026-08-31 mediu-se o custo desta classe no motor: o `callOllama()` do
// `tools/router/providers/ollama-api.js` devolvia **`null` sem razão nenhuma**,
// porque o `catch` do fetch engolia o `Failed to parse URL`. O motor $0 falhava
// MUDO e o trabalho caía para um motor pago sem que nada o sinalizasse.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ISTO É UMA SEGUNDA CÓPIA — e como não diverge
//
// A regra já existe em `tools/router/ollama-host.js`. Não se importa daqui: o
// `packages/cli` é empacotado com esbuild num bundle self-contained, e o
// AGENTS.md é explícito em não arrastar para lá código de fora do pacote.
//
// A duplicação é uma fronteira de EMPACOTAMENTO, não de conhecimento — por isso
// as duas implementações são ancoradas na mesma tabela de casos,
// `tools/router/ollama-host.casos.json`, que os testes dos dois lados lêem. Os
// testes correm no repo, não no bundle: a fronteira não se aplica a eles. Sem
// essa âncora, duas cópias da mesma regra divergiam em silêncio — que é
// exactamente o defeito que o `ollama-host` existe para matar.

/** O que o Ollama serve por omissão numa instalação local. */
export const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

/**
 * Devolve sempre uma origem absoluta, pronta para concatenar `/api/...`.
 *
 *   normalizeOllamaHost("127.0.0.1:11434")   → "http://127.0.0.1:11434"
 *   normalizeOllamaHost("https://gpu:11434") → "https://gpu:11434"   (não rebaixa)
 *   normalizeOllamaHost("")                  → o fallback, também normalizado
 *
 * Nunca lança. Um normalizador que rebenta é pior do que o bug que corrige.
 */
export function normalizeOllamaHost(
  raw: string | null | undefined,
  fallback: string = DEFAULT_OLLAMA_HOST,
): string {
  const limpo = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!limpo) {
    // O fallback de cada chamador é diferente (`host.docker.internal` no audit,
    // `localhost` no resto). Normaliza-se também: um default mal escrito partia
    // exactamente como a env partia.
    return fallback === DEFAULT_OLLAMA_HOST
      ? DEFAULT_OLLAMA_HOST
      : normalizeOllamaHost(fallback, DEFAULT_OLLAMA_HOST);
  }
  // `https` fica `https`. Forçar `http` aqui seria um downgrade de transporte
  // feito por um utilitário de URLs.
  return /^https?:\/\//i.test(limpo) ? limpo : `http://${limpo}`;
}

/** Lê `OLLAMA_HOST` do ambiente já normalizado. */
export function ollamaHostFromEnv(
  fallback: string = DEFAULT_OLLAMA_HOST,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return normalizeOllamaHost(env?.OLLAMA_HOST, fallback);
}
