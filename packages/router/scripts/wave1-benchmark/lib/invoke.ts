// invoke.ts — single dispatch: route a model id to the right transport.
// Local (Ollama) ids go over HTTP; everything else over the Anthropic SDK.

import { callAnthropic, type LlmResult } from "./anthropic-client.ts";
import { callOllama } from "./ollama-client.ts";
import { isLocalModel } from "./pricing.ts";

export async function invokeModel(
  model: string,
  system: string,
  user: string,
): Promise<LlmResult> {
  if (isLocalModel(model)) return callOllama({ model, user, system });
  return callAnthropic({ model, user, system });
}
