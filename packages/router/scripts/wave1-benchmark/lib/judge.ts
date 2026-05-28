// judge.ts — blind Sonnet judge (§4 rubrics, §4.6 blind protocol).
//
// For each prompt the 3 arm outputs are presented WITHOUT labels, in a
// seed-randomized order (seed derived from prompt_id for reproducibility). The
// judge (Sonnet 4.6) scores each anonymous output on the 5 pre-registered
// dimensions using the literal rubrics. We then de-blind position→arm.

import { callAnthropic } from "./anthropic-client.ts";
import { JUDGE_MODEL } from "./models.ts";
import { mulberry32 } from "./stats.ts";
import { costMicros } from "./pricing.ts";
import type { Arm, QualityScores } from "./types.ts";

export interface JudgeArmOutput {
  arm: Arm;
  response: string;
}

export interface JudgeResult {
  scoresByPosition: Record<string, QualityScores>;
  positionToArm: Record<string, Arm>;
  lengthByPosition: Record<string, number>;
  scoresByArm: Record<Arm, QualityScores>;
  raw: string;
  latency_ms: number;
  tokens_input: number;
  tokens_output: number;
  cost_micros: number;
  seed: number;
  parse_ok: boolean;
}

const RUBRICS = `RUBRICS (aplica-as literalmente, não inventes critérios):

[correctness] — float em {0.0, 0.5, 1.0}
  Coding: 1.0 = compila + linta + (se aplicável) testes passam; 0.5 = compila com bugs óbvios; 0.0 = não compila / lib inexistente.
  Diagram/yaml: 1.0 = sintaxe válida e renderiza; 0.5 = válida mas com inconsistências semânticas; 0.0 = sintaxe inválida.
  Audit/review: 1.0 = identifica a vulnerabilidade real presente; 0.5 = identifica mas mal classificada; 0.0 = não identifica ou inventa problema.
  Texto/estratégia: 1.0 = factos verificáveis correctos, links reais; 0.5 = mistura correcto + inferência razoável; 0.0 = factos errados / URLs inventadas.

[completeness] — int 1-5
  5 = todos os requisitos endereçados com profundidade; 4 = todos, alguns superficiais; 3 = maioria, alguns ignorados; 2 = ~metade; 1 = só o requisito mais óbvio.

[relevance] — int 1-5
  5 = on-topic, idioms/libs/patterns do domínio correcto; 4 = on-topic com algumas referências cross-domain (não erradas); 3 = on-topic mas genérico; 2 = parcialmente off-topic; 1 = off-topic / domínio errado.

[actionability] — int 1-5
  5 = code/yaml/diagram pronto a colar + exemplos + edge cases + caveats; 4 = pronto a usar com 1-2 ajustes triviais; 3 = correcto mas precisa de pesquisar para implementar; 2 = vago, sem next step concreto; 1 = "depende"/"vê a docs", sem material útil.

[hallucination] — int 0 ou 1
  Verifica URLs, métodos/endpoints de APIs, nomes de packages/libs, estatísticas. 0 = nenhuma invenção detectada; 1 = pelo menos uma invenção factual material.`;

function buildJudgePrompt(originalPrompt: string, orderedOutputs: string[]): string {
  const blocks = orderedOutputs
    .map((o, i) => `--- OUTPUT ${i + 1} ---\n${o || "(resposta vazia)"}`)
    .join("\n\n");
  return `És um juiz técnico imparcial. Avalia 3 respostas anónimas ao MESMO prompt. Não sabes que modelo gerou cada uma — não assumas nada pelo estilo ou comprimento.

PROMPT ORIGINAL DO UTILIZADOR:
"""
${originalPrompt}
"""

${RUBRICS}

AS 3 RESPOSTAS A AVALIAR:

${blocks}

Devolve EXCLUSIVAMENTE um objecto JSON (sem markdown, sem texto à volta) com esta forma exacta, uma entrada por output:
{"1":{"correctness":0.0,"completeness":1,"relevance":1,"actionability":1,"hallucination":0},"2":{...},"3":{...}}`;
}

/** Deterministic 32-bit hash of a string (FNV-1a) for the per-prompt seed. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded shuffle of [A,B,C] → ordered arms by position (1-indexed). */
function seededOrder(seed: number): Arm[] {
  const arms: Arm[] = ["A", "B", "C"];
  const rng = mulberry32(seed);
  for (let i = arms.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arms[i], arms[j]] = [arms[j], arms[i]];
  }
  return arms;
}

const clampInt = (v: unknown, lo: number, hi: number, d: number): number => {
  const n = typeof v === "number" ? Math.round(v) : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.min(hi, Math.max(lo, n));
};
const correctnessVal = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (n >= 0.75) return 1.0;
  if (n >= 0.25) return 0.5;
  return 0.0;
};

function parseScores(raw: string): Record<string, QualityScores> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, Record<string, unknown>>;
  try {
    obj = JSON.parse(m[0]) as Record<string, Record<string, unknown>>;
  } catch {
    return null;
  }
  const out: Record<string, QualityScores> = {};
  for (const pos of ["1", "2", "3"]) {
    const s = obj[pos];
    if (!s) return null;
    out[pos] = {
      correctness: correctnessVal(s.correctness),
      completeness: clampInt(s.completeness, 1, 5, 3),
      relevance: clampInt(s.relevance, 1, 5, 3),
      actionability: clampInt(s.actionability, 1, 5, 3),
      hallucination: clampInt(s.hallucination, 0, 1, 0),
    };
  }
  return out;
}

/**
 * Judge one prompt. `repeatSalt` !== 0 produces a different blind order for the
 * sanity-check repeats (§4.6) without re-deriving the per-prompt seed elsewhere.
 */
export async function judgePrompt(
  promptId: string,
  originalPrompt: string,
  outputs: JudgeArmOutput[],
  repeatSalt = 0,
): Promise<JudgeResult> {
  const seed = (hashStr(promptId) + repeatSalt) >>> 0;
  const order = seededOrder(seed);
  const byArm = new Map(outputs.map((o) => [o.arm, o.response]));
  const orderedResponses = order.map((arm) => byArm.get(arm) ?? "");
  const positionToArm: Record<string, Arm> = {};
  const lengthByPosition: Record<string, number> = {};
  order.forEach((arm, i) => {
    positionToArm[String(i + 1)] = arm;
    lengthByPosition[String(i + 1)] = (byArm.get(arm) ?? "").length;
  });

  const judgePromptText = buildJudgePrompt(originalPrompt, orderedResponses);
  const r = await callAnthropic({ model: JUDGE_MODEL, user: judgePromptText, maxTokens: 1024, temperature: 0 });
  const parsed = parseScores(r.text);
  const parse_ok = parsed !== null;

  // Fallback to neutral mid scores if the judge returned unparseable output.
  const neutral: QualityScores = { correctness: 0.5, completeness: 3, relevance: 3, actionability: 3, hallucination: 0 };
  const scoresByPosition: Record<string, QualityScores> = parsed ?? { "1": neutral, "2": neutral, "3": neutral };

  const scoresByArm = { A: neutral, B: neutral, C: neutral } as Record<Arm, QualityScores>;
  for (const pos of ["1", "2", "3"]) scoresByArm[positionToArm[pos]] = scoresByPosition[pos];

  return {
    scoresByPosition,
    positionToArm,
    lengthByPosition,
    scoresByArm,
    raw: r.text,
    latency_ms: r.latency_ms,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    cost_micros: costMicros(JUDGE_MODEL, r.tokens_input, r.tokens_output),
    seed,
    parse_ok,
  };
}
