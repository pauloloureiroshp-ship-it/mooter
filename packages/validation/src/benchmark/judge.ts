// Blinded LLM-as-judge (Wave 30 Phase L).
//
// Presents two anonymised outputs (A/B, randomised by caller) for a task and
// asks the judge which better answers it. Multiple judges → majority vote. Used
// for subjective tasks where the objective regex grader is insufficient.

export type JudgeCaller = (prompt: string) => Promise<string>;

export interface JudgeVerdict {
  winner: "A" | "B" | "tie";
  confidence: number;
}

export function buildJudgePrompt(taskPrompt: string, outA: string, outB: string): string {
  return [
    `You are a blind, impartial judge. Two assistants answered the same task.`,
    `Pick which answer is better (or "tie"). Judge only quality/correctness, not length or style.`,
    ``,
    `TASK:\n${taskPrompt}`,
    ``,
    `--- ANSWER A ---\n${outA}`,
    ``,
    `--- ANSWER B ---\n${outB}`,
    ``,
    `Answer in EXACTLY this format:`,
    `WINNER: <A|B|tie>`,
    `CONFIDENCE: <0.0-1.0>`,
  ].join("\n");
}

export function parseJudge(text: string): JudgeVerdict {
  const w = text.match(/winner:\s*(A|B|tie)/i);
  let winner: JudgeVerdict["winner"] = "tie";
  if (w) winner = (w[1].toUpperCase() === "TIE" ? "tie" : (w[1].toUpperCase() as "A" | "B"));
  const c = text.match(/confidence:\s*([0-9]*\.?[0-9]+)/i);
  let confidence = c ? parseFloat(c[1]) : 0.5;
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));
  return { winner, confidence };
}

export async function judgeBlinded(
  taskPrompt: string,
  outA: string,
  outB: string,
  judges: JudgeCaller[],
): Promise<{ verdict: JudgeVerdict; votes: JudgeVerdict[] }> {
  const prompt = buildJudgePrompt(taskPrompt, outA, outB);
  const votes = await Promise.all(
    judges.map(async (j) => {
      try {
        return parseJudge(await j(prompt));
      } catch {
        return { winner: "tie", confidence: 0 } as JudgeVerdict;
      }
    }),
  );
  const tally: Record<string, number> = { A: 0, B: 0, tie: 0 };
  for (const v of votes) tally[v.winner] += v.confidence;
  const winner = (Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "tie") as JudgeVerdict["winner"];
  const total = votes.reduce((s, v) => s + v.confidence, 0) || 1;
  return { verdict: { winner, confidence: tally[winner] / total }, votes };
}
