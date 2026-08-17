'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. O POLLER, extraido para poder ser testado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORQUE ESTE FICHEIRO EXISTE (a sexta instancia do mesmo erro, num dia)
 *
 * Isto vivia inline dentro de `principal()` no `correr.js`, a seguir a
 * `if (r.correu)` — ou seja, so alcancavel com socket aberto, tokens e gate. Nenhum
 * teste lhe podia chamar. O critico externo mutou-o e a suite ficou VERDE:
 *
 *   seguirCorrente() -> no-op                          188/188 verde
 *   herdarThread()   -> no-op                          188/188 verde
 *   jobs: [...threads.keys()] -> jobs: []              188/188 verde
 *   pertence: (job) => nossos.has(job) -> () => true   188/188 verde
 *
 * Os quatro sao exactamente as correccoes dos DOIS bugs que apanhamos ao vivo. Os
 * testes que os acompanharam provavam que `publicarFechos` se porta bem DADA a
 * lista certa — e o bug ERA a lista. Provavam a parte que nunca esteve partida.
 *
 * E o pior: o `correr.js` ja tinha, por cima disto, um comentario a explicar que a
 * quinta instancia aconteceu porque «a LIGACAO so existia dentro de uma funcao
 * grande que nenhum teste podia chamar». Escrevi a sexta por baixo do aviso que a
 * descreve. Uma licao so conta quando muda a forma do codigo, nao quando fica em
 * prosa ao lado dele.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Faz os filhos herdarem o thread do pai.
 *
 * ⚠️ DOIS ELOS, nao um. O broker liga o filho ao pai por `prep_from` quando a
 * preparacao EXPIRA, e por `handoff_from` quando ela tem SUCESSO. Conhecer so o
 * primeiro fazia o caminho FELIZ perder o thread: a prep corria bem, entregava a um
 * filho pago, e o resultado desse filho nunca aparecia no Slack. Foi assim que o
 * dono viu «Trabalho concluido · US$ 0,00» — o fecho do PAI — enquanto o filho
 * gastava US$ 0,12 em silencio.
 */
function seguirCorrente(ledger, threads, registar) {
  const herdados = [];
  for (const e of ledger) {
    if (e.event !== 'dispatched') continue;
    const pai = e.prep_from || e.handoff_from;
    if (!pai || !e.job_id || threads.has(e.job_id)) continue;
    const ts = threads.get(pai);
    if (!ts) continue;
    threads.set(e.job_id, ts);
    herdados.push({ job: e.job_id, de: pai });
    if (typeof registar === 'function') registar({ tipo: 'thread_herdado', job: e.job_id, de: pai });
  }
  return herdados;
}

/**
 * @param {{adaptador, transporte, broker, meuActor, ignorados?, lerLedger, registar?}} dep
 * @returns {{tique:Function, vistos:Set, fechados:Set}}
 */
function criarPoller(dep) {
  const d = dep || {};
  for (const nome of ['adaptador', 'transporte', 'broker', 'meuActor', 'lerLedger']) {
    if (!d[nome]) throw new Error('criarPoller precisa de `' + nome + '`');
  }
  const registar = d.registar || (() => {});
  const ignorados = d.ignorados instanceof Set ? d.ignorados : new Set();
  const vistos = new Set();      // (job, hash) do cartao ja publicado
  const fechados = new Set();    // jobs cujo fim ja foi anunciado

  async function tique() {
    const ledger = d.lerLedger();
    seguirCorrente(ledger, d.transporte.threads, registar);

    // pertenca derivada do LEDGER, nao do estado corrente: a reconciliacao do
    // motor re-carimba jobs antigos SEM actor e um filtro por actor perde-os
    const nossos = d.adaptador.jobsNossos(ledger, d.meuActor);

    // o FIM dos que acabaram sem pedir decisao
    for (const f of await d.adaptador.publicarFechos({
      jobs: [...d.transporte.threads.keys()],
      jaVisto: (job) => ignorados.has(job) || fechados.has(job),
    })) {
      if (f.publicado) {
        fechados.add(f.job_id);
        registar({ tipo: 'fecho_publicado', job: f.job_id, estado: f.estado });
      }
    }

    // e os cartoes dos que estao a espera de decisao
    const pubs = await d.adaptador.publicarPendentes({
      pertence: (job) => nossos.has(job),
      jaVisto: (p) => ignorados.has(p.job_id) || vistos.has(p.job_id + ':' + p.state_hash),
    });
    for (const p of pubs) {
      // ⚠️ `publicado` diz que atravessou as barreiras; `envio` diz se o Slack
      // aceitou. Marcar como visto so com o primeiro fazia um cartao recusado por
      // rate_limit desaparecer para sempre — nunca chegava e nunca era retentado.
      const entregue = p.publicado
        ? await Promise.resolve(p.envio).then((e) => !e || e.enviado !== false).catch(() => false)
        : false;
      if (!entregue && p.publicado) {
        registar({ tipo: 'cartao_nao_entregue', job: p.job_id,
          nota: 'atravessou as barreiras mas o Slack nao o aceitou — vai ser retentado' });
        continue;
      }
      if (p.publicado) {
        vistos.add(p.job_id + ':' + p.state_hash);
        registar({ tipo: 'cartao_publicado', job: p.job_id,
          hash: String(p.state_hash || '').slice(0, 12) });
      } else if (p.porque && !/ja publicado/i.test(p.porque)) {
        registar({ tipo: 'cartao_RECUSADO', job: p.job_id, porque: p.porque });
      }
    }
    return { pendentes: pubs.length, nossos: nossos.size };
  }

  return { tique, vistos, fechados, ignorados };
}

module.exports = { seguirCorrente, criarPoller };
