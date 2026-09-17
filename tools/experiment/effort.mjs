// effort.mjs — o limiar de utilidade pré-registado (E-6): «o kit ajudou?» decide-se
// POR PAR, A vs B no MESMO replay, nunca combinando condições de replays diferentes.
//
// Origem: annex/effort-measures-prereg.json do plano cc-plan-20260916-v1
// (prereg_threshold_proposal), aprovado tal como está pelo dono — E-6, registado em
// RECONCILIACAO-CC-PLAN-v1-20260916 (Cowork Prisma, 16/09). AMENDMENT-001 §A4 (limiar de
// utilidade: CONFORME) e AMENDMENT-001b §B4 pedem as três provas por par como fixtures
// deste módulo — não replays reais. Nada aqui mede coisa nenhuma: recebe os pares já
// medidos e aplica a regra escrita ANTES do ensaio (feedback_regra_de_paragem_quebrada).
//
// Regra (verbatim do pré-registo): «B ≤ A em human_minutes E record_completeness_B ≥
// record_completeness_A E failures_and_rework_B ≤ failures_and_rework_A, em ≥ 2 de 3
// replays independentes.» Empate ou derrota reportados com a mesma visibilidade; sem
// percentagens — publicam-se os pares (A, B) e as diferenças absolutas por medida.
//
// Custo/esforço (A5 · B4): USD de tabela é ESTIMATED, nunca custo observado; «Ollama = 0
// USD» é encargos adicionais de API = 0, nunca custo total; tokens observados reportam-se
// à parte dos USD calculados. Este módulo não soma USD a minutos: cada medida fica na sua
// unidade.

export const EFFORT_RULE_ID = 'cc-effort-measures-prereg-20260916';
export const EFFORT_RULE_APPROVAL = 'E-6 · RECONCILIACAO-CC-PLAN-v1-20260916 (Cowork Prisma, 2026-09-16): aprovado tal como está';
export const REQUIRED_REPLAYS = 3;
export const REQUIRED_SATISFIED = 2;

/** As três condições, cada uma comparada DENTRO do mesmo replay. */
export const CONDITIONS = Object.freeze([
  { measure: 'human_minutes', direction: 'B_le_A', unit: 'min' },
  { measure: 'record_completeness', direction: 'B_ge_A', unit: 'ratio' },
  { measure: 'failures_and_rework', direction: 'B_le_A', unit: 'count' },
]);

export class EffortError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'EffortError'; this.code = code; this.details = details; }
}

const num = (v, what) => { if (!(typeof v === 'number' && Number.isFinite(v))) throw new EffortError('bad_measure', `${what}: valor tem de ser número finito (recebido ${JSON.stringify(v)}) — sem medida não há par, e sem par não há regra`); return v; };

/** Avalia UM replay: as três condições sobre o par (A, B) desse replay. Puro. */
export function evaluateReplay(replay, idx = 0) {
  if (!replay || typeof replay !== 'object' || !replay.A || !replay.B) throw new EffortError('bad_replay', `replay ${idx}: precisa de A e B medidos no mesmo replay`);
  const pairs = {};
  let all_hold = true, any_strict = false;
  for (const c of CONDITIONS) {
    const a = num(replay.A[c.measure], `replay ${idx} A.${c.measure}`);
    const b = num(replay.B[c.measure], `replay ${idx} B.${c.measure}`);
    const holds = c.direction === 'B_le_A' ? b <= a : b >= a;
    const strict = c.direction === 'B_le_A' ? b < a : b > a;
    pairs[c.measure] = { A: a, B: b, abs_diff: Math.abs(a - b), unit: c.unit, condition: c.direction, holds, strict };
    if (!holds) all_hold = false;
    if (strict) any_strict = true;
  }
  const outcome = !all_hold ? 'loss' : any_strict ? 'win' : 'tie';
  return { replay: replay.id ?? `replay-${idx + 1}`, order: replay.order ?? null, pairs, outcome, counts_for_claim: all_hold, failed_conditions: Object.entries(pairs).filter(([, p]) => !p.holds).map(([m]) => m) };
}

/**
 * Aplica a regra E-6 a N replays. Devolve o veredicto e a tabela publicável (pares e
 * diferenças absolutas por medida, por replay). Nunca combina condições entre replays:
 * um replay só conta se as TRÊS condições se verificarem nele.
 */
export function utilityThreshold(replays) {
  if (!Array.isArray(replays)) throw new EffortError('bad_replays', 'replays[] obrigatório');
  const evaluated = replays.map((r, i) => evaluateReplay(r, i));
  const wins = evaluated.filter((e) => e.outcome === 'win').length;
  const ties = evaluated.filter((e) => e.outcome === 'tie').length;
  const losses = evaluated.filter((e) => e.outcome === 'loss').length;
  const satisfied_replays = wins + ties;
  // O pré-registo fixa 3 replays (ordem A,B / B,A / A,B). Menos: sem veredicto. Mais: não é a regra
  // pré-registada — «≥ 2 de 3» não é «≥ 2 de N» (gate final 2026-09-17, nota do final-reviewer).
  const enough_replays = evaluated.length === REQUIRED_REPLAYS;
  const rule_satisfied = enough_replays && satisfied_replays >= REQUIRED_SATISFIED;
  // Apresentação: empate integral é EMPATE, não poupança. Só há «kit ajudou» com ≥ 1 vitória estrita entre os que contam.
  let verdict;
  if (evaluated.length < REQUIRED_REPLAYS) verdict = 'insufficient_replays';
  else if (evaluated.length > REQUIRED_REPLAYS) verdict = 'replay_count_not_preregistered';
  else if (!rule_satisfied) verdict = 'not_satisfied';
  else if (wins === 0) verdict = 'tie';
  else verdict = 'satisfied';
  return {
    rule_id: EFFORT_RULE_ID,
    approval: EFFORT_RULE_APPROVAL,
    rule: `B ≤ A em human_minutes E record_completeness_B ≥ record_completeness_A E failures_and_rework_B ≤ failures_and_rework_A, em ≥ ${REQUIRED_SATISFIED} de ${REQUIRED_REPLAYS} replays; condições avaliadas DENTRO de cada replay, nunca combinadas entre replays`,
    n_replays: evaluated.length, wins, ties, losses, satisfied_replays,
    rule_satisfied, verdict,
    presentation: verdict === 'tie' ? 'EMPATE — a regra é satisfeita por igualdade; não é poupança' : verdict === 'satisfied' ? 'o kit ajudou nesta tarefa (em ≥ 2 de 3 replays, por par)' : verdict === 'not_satisfied' ? 'o kit não ajudou nesta tarefa — resultado válido, com a mesma visibilidade' : verdict === 'replay_count_not_preregistered' ? `${evaluated.length} replays não é a regra pré-registada (${REQUIRED_REPLAYS}): sem veredicto — outra regra é outra emenda` : `faltam replays (${evaluated.length}/${REQUIRED_REPLAYS})`,
    replays: evaluated,
    no_percentages: true,
  };
}
