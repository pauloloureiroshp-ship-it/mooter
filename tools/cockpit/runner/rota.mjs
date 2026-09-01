/**
 * rota.mjs — a tabela de encaminhamento, escrita uma vez, lida por quem mostra.
 *
 * PORQUE EXISTE (medido 2026-09-01).
 *
 * O Moo Ledger dizia, em prosa cravada no HTML, que «the closed routing table
 * sends reading to the local engine» e que «Routing is a printed rule (C0-C5),
 * never a model's mood». Procurou-se essa tabela no repositorio inteiro: nao
 * existia. Nenhum ficheiro definia C0..C5, e a unica coisa impressa era a
 * propria frase que afirmava que havia uma regra impressa.
 *
 * Nao era uma mentira sobre o COMPORTAMENTO — as rondas correm mesmo no motor
 * local, e o git e mesmo custodia do Claude Code. Era pior de outra maneira: um
 * facto verdadeiro a ser afirmado por uma fonte que nao existe, num painel cuja
 * unica promessa e que tudo o que mostra foi lido de algum lado. A frase era
 * `n/d` a fingir-se de citacao.
 *
 * ⚠️ AS CLASSES SAO DESCRITIVAS, NAO ASPIRACIONAIS.
 *
 * Cada entrada carrega `prova` — o ficheiro que a EXECUTA — e `exercida`. Uma
 * classe que este sistema nao exercita fica com `exercida:false` e diz porque,
 * em vez de ser inventada para a escala ficar bonita de C0 a C5. Foi assim que
 * se descobriu que ha quatro classes reais e nao seis: se um dia alguem quiser
 * a quinta, tem de a implementar antes de a poder mostrar.
 */

/**
 * A escada. `motor` e QUEM faz; `porque` e a razao de nao ser outro; `prova` e
 * onde isso e imposto por codigo, nao por intencao.
 */
export const CLASSES = Object.freeze([
  Object.freeze({
    id: 'C0',
    nome: 'deterministic check',
    motor: 'this machine, no model at all',
    custo: '$0',
    porque: 'a rule that can be decided by reading text must never cost a token or a second opinion',
    prova: 'tools/cockpit/runner/refutador.mjs · autopilot gates',
    exercida: true,
  }),
  Object.freeze({
    id: 'C2',
    nome: 'read and analyse',
    motor: 'local engine on this GPU (Ollama)',
    custo: '$0',
    porque: 'reading your code is the bulk of the work and it never has to leave the machine',
    prova: 'tools/cockpit/runner/runner-core.mjs → assertLocalEngine() refuses any non-loopback engine',
    exercida: true,
  }),
  Object.freeze({
    id: 'C4',
    nome: 'write and commit',
    motor: 'Claude Code · subscription',
    // Nao repete "subscription" (o `motor` ja o diz): a pagina concatena os
    // dois campos e saia «Claude Code · subscription, subscription — …».
    custo: 'metered against API list price in the yardstick, never billed by this loop',
    porque: 'git custody belongs to one engine the owner trusts with writes, and the irreversible belongs to the owner',
    prova: 'AGENTS.md § Communication protocol — merge/push/delete are the human gate',
    exercida: true,
  }),
  Object.freeze({
    id: 'C5',
    nome: 'refute on a different engine',
    motor: 'codex · subscription',
    custo: 'subscription',
    porque: 'a consequential conclusion has to survive an engine that did not produce it — critic ≠ author',
    prova: 'AGENTS.md § Pre-Dispatch Red-Team Gate · refutations logged in the vault',
    exercida: true,
  }),
  Object.freeze({
    id: 'C1',
    nome: 'cheap cloud tier',
    motor: null,
    custo: null,
    porque: 'the cockpit loop never escalates: it is $0 by construction, so there is no rung between the local engine and a human-driven write',
    prova: null,
    exercida: false,
  }),
  Object.freeze({
    id: 'C3',
    nome: 'expensive cloud reasoning',
    motor: null,
    custo: null,
    porque: 'same reason as C1 — this loop has no path that spends money without the owner typing it',
    prova: null,
    exercida: false,
  }),
]);

const PORID = new Map(CLASSES.map((c) => [c.id, c]));

/** Uma classe pelo id, ou `null`. Nunca um objecto parcial. */
export function classe(id) {
  return PORID.get(String(id || '')) || null;
}

/** As que este sistema realmente corre — a lista que o painel deve mostrar. */
export function exercidas() {
  return CLASSES.filter((c) => c.exercida);
}

/**
 * A classe que PRODUZIU um recibo, derivada do proprio recibo.
 *
 * Devolve `null` quando o recibo nao chega para decidir — e um recibo antigo,
 * sem `modelo` e sem `engine`, e exactamente isso. Carimba-lo `C2` porque «o
 * loop e local» seria derivar do que sabemos do sistema em vez de do que esta
 * escrito na linha, que e a diferenca entre um dado e um palpite.
 */
export function rotaDoRecibo(r) {
  if (!r) return null;
  // Um evento do disjuntor nao e trabalho: nao passou por motor nenhum.
  if (r.evento) return classe('C0');
  if (r.modelo || r.engine) return classe('C2');
  return null;
}

/**
 * O que ACONTECE A SEGUIR se o dono aceitar este achado.
 *
 * E a unica parte prospectiva da tabela, e por isso e uma so: aceitar manda o
 * trabalho para quem tem custodia do git. Nao ha ramo nenhum aqui porque nao
 * ha ramo nenhum no sistema — o que existiria seria uma escolha, e uma escolha
 * que ninguem implementou nao se desenha na pagina.
 */
export function rotaDaCorreccao() {
  return classe('C4');
}
