// Self-consistency / agreement clustering for winner selection.
//
// WHY (W2 seeded eval, 32 verifiable items): the deliberation's peer-vote (seats
// reviewing each other) proved ANTI-correlated with correctness — the weakest seat
// (qwen2.5:3b) won 17/32 items and drove ALL FIVE verifiable regressions and all three
// open-pairwise losses, repeatedly with confidence 1.0 on a wrong answer. Two
// mechanisms cooperated: (a) the length-neutral tiebreak handed ties to the terse weak
// seat even when the answers DIFFERED, and (b) confidence was read straight off that
// same biased peer-vote.
//
// FIX PRINCIPLE: agreement across INDEPENDENT seats (self-consistency) is a far more
// reliable ensemble signal than one peer's review verdict, and a stronger model's lone
// answer should not be displaced by a weaker seat's marginal peer-vote edge. So winner
// selection becomes: cluster the Phase-1 answers by equivalence, weight each cluster by
// member COMPETENCE (a static prior from the model id — NOT fitted to any eval), and
// pick the heaviest cluster. Length-neutrality still holds, but ONLY *within* a cluster
// (genuinely equivalent answers) — never as a tiebreaker between different answers.
//
// This file is ADDITIVE (new in the council pillar). It computes no peer-vote and never
// touches the frozen engine.

/**
 * Normalize an answer for equivalence clustering. Deliberately CONSERVATIVE: it only
 * folds case, collapses whitespace, and strips surrounding quotes / trailing
 * punctuation. It must never merge two semantically different answers — a false merge
 * would fabricate agreement, which is exactly the dishonesty the council forbids.
 */
export function normalizeAnswer(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/```[a-z]*\n?|```/g, " ") // drop code-fence markers (keep the code text)
    .replace(/[\s ]+/g, " ")
    .replace(/^[\s"'`*_(]+|[\s"'`*_).,;:!?]+$/g, "")
    .trim();
}

/**
 * Static competence prior for a seat, parsed from its model id. ORDINAL by design
 * (small integers) so a genuine multi-seat consensus can tie — and, by policy, override
 * — a single stronger seat; raw parameter counts (14 vs 7+3) would make the top seat
 * un-overridable and collapse the council to "always trust the biggest model".
 *
 *   • parameter bucket: ≥30B → 4, ≥12B → 3, ≥7B → 2, else → 1
 *   • +1 for a code-specialized variant ("coder") — a real capability prior on code tasks
 *
 * This is an EXTERNAL prior (model lineage), transparent and NOT fitted to any dataset.
 * Unknown ids get a neutral 2 so a mystery seat neither dominates nor is dismissed.
 */
export function seatCompetence(seatId: string): number {
  const id = (seatId || "").toLowerCase();
  const m = id.match(/(\d+(?:\.\d+)?)\s*b\b/);
  const params = m ? Number(m[1]) : NaN;
  let base: number;
  if (!Number.isFinite(params)) base = 2;
  else if (params >= 30) base = 4;
  else if (params >= 12) base = 3;
  else if (params >= 7) base = 2;
  else base = 1;
  const coderBonus = /coder|code/.test(id) ? 1 : 0;
  return base + coderBonus;
}

/** One Phase-1 answer to cluster. */
export interface AgreementCandidate {
  seatId: string;
  text: string;
  /** Optional verbosity signal (trimmed char count); falls back to text length. */
  length?: number;
}

/** A cluster of seats whose normalized answers are equal. */
export interface AnswerCluster {
  key: string;
  members: string[];
  /** Σ competence over members. */
  weight: number;
  /** max competence among members. */
  topCompetence: number;
  size: number;
}

/**
 * Cluster candidates by normalized-answer equivalence, weighted by competence.
 * Returned sorted by the winner order: weight ↓, then topCompetence ↓, then size ↓,
 * then the lexicographically-smallest member id (deterministic, position-free).
 *
 * topCompetence breaks weight ties BEFORE size on purpose: a consensus must STRICTLY
 * OUTWEIGH the strongest dissenting seat to override it, not merely tie it. The W2
 * seeded eval proved why — on item r02 the two weak seats agreed on the SAME wrong
 * answer (weight 4) and tied the lone strong 14b seat (weight 4); a size-first tiebreak
 * handed the win to the wrong weak pair (a fresh regression), while competence-first
 * keeps the strong seat. Two genuinely strong seats that agree still win, because their
 * summed weight EXCEEDS any single seat — the wisdom-of-crowds signal survives where it
 * is real, and is refused where it is just two weak voices ganging up.
 */
export function clusterAnswers(
  candidates: AgreementCandidate[],
  competence: (seatId: string) => number = seatCompetence,
): AnswerCluster[] {
  const byKey = new Map<string, AnswerCluster>();
  for (const c of candidates) {
    const key = normalizeAnswer(c.text);
    const w = competence(c.seatId);
    const cur = byKey.get(key);
    if (cur) {
      cur.members.push(c.seatId);
      cur.weight += w;
      cur.topCompetence = Math.max(cur.topCompetence, w);
      cur.size += 1;
    } else {
      byKey.set(key, { key, members: [c.seatId], weight: w, topCompetence: w, size: 1 });
    }
  }
  const minId = (cl: AnswerCluster) => [...cl.members].sort()[0];
  return [...byKey.values()].sort(
    (a, b) =>
      b.weight - a.weight ||
      b.topCompetence - a.topCompetence ||
      b.size - a.size ||
      (minId(a) < minId(b) ? -1 : 1),
  );
}

/**
 * Pick the winning seat by competence-weighted agreement. Pure and deterministic.
 *   1. heaviest cluster (ties → higher top competence → larger cluster → seatId)
 *   2. within that cluster, the highest-competence seat (ties → shortest answer →
 *      seatId): length-neutrality applies ONLY here, among equivalent answers.
 * Returns the winner seatId plus the winning cluster's size/weight for transparency, or
 * null on an empty candidate set (never fabricates a winner).
 */
export function selectWinnerByAgreement(
  candidates: AgreementCandidate[],
  competence: (seatId: string) => number = seatCompetence,
): { seatId: string; clusterSize: number; clusterWeight: number } | null {
  if (candidates.length === 0) return null;
  const clusters = clusterAnswers(candidates, competence);
  const top = clusters[0];
  const lenOf = (id: string) => {
    const c = candidates.find((x) => x.seatId === id)!;
    return c.length ?? (c.text || "").trim().length;
  };
  const winner = [...top.members].sort(
    (a, b) => competence(b) - competence(a) || lenOf(a) - lenOf(b) || (a < b ? -1 : 1),
  )[0];
  return { seatId: winner, clusterSize: top.size, clusterWeight: top.weight };
}
