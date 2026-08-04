'use strict';

/**
 * RECIBO — CONTEXTO E ADVOGADO DO DIABO (Wave J-6, 2026-07-31)
 *
 * O PORQUÊ, em uma frase: hoje o recibo diz o que a frota fez, mas não diz
 * ONDE, PARA QUÊ, o que estava antes, o que ficou registado no vault, nem o
 * que se deve perguntar a seguir. Uma sessão nova do Cowork abre sem nada
 * disto e o utilizador paga outra vez o contexto que já tinha comprado.
 *
 * ⚠️ A REGRA QUE GOVERNA ESTE FICHEIRO
 * As perguntas do advogado do diabo são DERIVADAS DE REGRAS sobre números já
 * medidos. Não são geradas por um modelo. Isto é deliberado e não é uma
 * limitação:
 *   · custam $0 e 0 ms;
 *   · são reproduzíveis — o mesmo ledger dá sempre as mesmas perguntas;
 *   · não podem alucinar um problema que não existe, porque cada pergunta
 *     transporta o facto que a fez nascer;
 *   · a opinião do moo continua a existir à parte, rotulada como opinião.
 * Um agente que gera perguntas inventa dúvidas. Uma regra que dispara sobre um
 * número medido não consegue.
 *
 * ⚠️ O QUE ESTE MÓDULO NÃO CONSEGUE SABER — e não finge saber
 *   · A conversa do Cowork. O MCP não expõe o session_id ao servidor
 *     (tools6.js diz isto por escrito no campo session_model). Só sabemos o
 *     que alguém declarar em mooter_setup({sessao:"registar"}).
 *   · Pull requests. O conector não fala com o git nem com o GitHub. O que
 *     conseguimos derivar são as PASTAS de trabalho, não os PRs.
 *   · O estado do código antes da tarefa. Não há snapshot pré-job. O "antes"
 *     que damos é o estado de sessão anteriormente REGISTADO — outra coisa,
 *     e dizemo-lo.
 * Cada um destes aparece como n/d com o motivo, nunca como vazio.
 */

const fs = require('fs');
const path = require('path');
const { isTerminal } = require('./terminal.js');

const LIMIAR_COBERTURA_CUSTO = 80; // %
const LIMIAR_TRABALHO_LOCAL = 50; // %

function nd(porque, extra) {
  return Object.assign({ valor: null, porque }, extra || {});
}

function seguro(fn, porque) {
  try { return fn(); } catch (e) { return nd(porque + ': ' + ((e && e.message) || e)); }
}

// ────────────────────────────────────────────────────── onde e para quê ──

/**
 * Deriva projecto e pastas do que está no ledger — nunca inventa.
 * Uma pasta que apareceu num job é um facto; um "projecto" só existe se
 * alguém o declarou.
 */
function contextoDeTrabalho(jobs, opts) {
  const options = opts || {};
  const lista = Array.isArray(jobs) ? jobs : [];
  const pastas = [...new Set(lista.map((j) => j && j.worktree).filter(Boolean))];
  const waves = [...new Set(lista.map((j) => j && j.wave).filter(Boolean))].sort();
  const agentes = [...new Set(lista.map((j) => j && j.agent).filter(Boolean))].sort();

  let estadoSessao = null;
  if (options.sessaoModule !== null) {
    estadoSessao = seguro(() => {
      const sessao = options.sessaoModule || require('./sessao.js');
      const lido = sessao.ler(options.sessaoId || 'actual');
      return lido && !lido.vazio ? lido : null;
    }, 'não consegui ler o estado de sessão');
  }

  return {
    projecto: estadoSessao && estadoSessao.projecto
      ? { valor: estadoSessao.projecto, porque: 'declarado em mooter_setup({sessao:"registar"})' }
      : nd('nenhuma sessão declarou um projecto; o servidor MCP não recebe essa informação do host'),
    sessao_id: estadoSessao && estadoSessao.id
      ? { valor: estadoSessao.id, porque: 'id do estado de sessão em disco' }
      : nd('sem estado de sessão registado — usa mooter_setup({sessao:"registar", id:"<projecto>"})'),
    conversa_do_host: nd('o MCP não expõe o identificador da conversa ao servidor; só o que for declarado explicitamente'),
    pastas: pastas.length
      ? { valor: pastas, porque: 'pastas onde os jobs correram, segundo o ledger' }
      : nd('nenhum job na janela trouxe pasta'),
    waves: waves.length
      ? { valor: waves, porque: 'waves com jobs na janela' }
      : nd('nenhum job na janela trouxe wave'),
    agentes: agentes.length
      ? { valor: agentes, porque: 'motores que trabalharam na janela' }
      : nd('nenhum job na janela trouxe agente'),
    pull_requests: nd('o conector não fala com git nem com o GitHub; derivamos pastas e branches, nunca PRs'),
  };
}

/** O "antes": o estado de sessão que estava registado — não é o estado do código. */
function estadoAnterior(opts) {
  const options = opts || {};
  return seguro(() => {
    const sessao = options.sessaoModule || require('./sessao.js');
    const e = sessao.ler(options.sessaoId || 'actual');
    if (!e || e.vazio) {
      return nd('não havia estado de sessão registado antes desta janela');
    }
    return {
      rotulo: 'estado de sessão anteriormente registado — NÃO é um snapshot do código',
      actualizada_em: e.actualizada_em || null,
      feito: Array.isArray(e.feito) ? e.feito : [],
      por_fazer: Array.isArray(e.por_fazer) ? e.por_fazer : [],
      bloqueios: Array.isArray(e.bloqueios) ? e.bloqueios : [],
      proximo: e.proximo || null,
      porque: 'lido de ~/.mooter/sessoes',
    };
  }, 'não consegui ler o estado anterior');
}

// ─────────────────────────────────────────────────────────────── vault ──

/** O que ficou efectivamente escrito no vault — lido do disco, não presumido. */
function registadoNoVault(opts) {
  const options = opts || {};
  return seguro(() => {
    const journal = options.journalModule || require('./journal.js');
    const v = options.vault || journal.detectVault();
    if (!v || !v.root) {
      return nd('vault não encontrado (' + ((v && v.source) || 'sem detecção') + ') — nada foi registado');
    }
    const desde = Date.parse(options.desde || '') || 0;
    const notas = [];
    for (const pasta of Object.values(journal.FOLDERS)) {
      const dir = path.join(v.root, pasta);
      let ficheiros = [];
      try { ficheiros = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { continue; }
      for (const f of ficheiros) {
        let st;
        try { st = fs.statSync(path.join(dir, f)); } catch { continue; }
        if (st.mtimeMs >= desde) notas.push({ pasta, ficheiro: f, escrito_em: new Date(st.mtimeMs).toISOString() });
      }
    }
    notas.sort((a, b) => String(b.escrito_em).localeCompare(String(a.escrito_em)));
    return {
      raiz: v.root,
      notas: notas.slice(0, 20),
      total: notas.length,
      porque: notas.length
        ? 'notas do vault com mtime dentro da janela'
        : 'nenhuma nota escrita no vault dentro desta janela',
    };
  }, 'não consegui ler o vault');
}

// ────────────────────────────────────────── o advogado do diabo, por regra ──

/**
 * Cada regra: um facto medido → uma pergunta que esse facto obriga a fazer.
 * Se o facto não estiver medido, a regra não dispara. Nunca perguntamos por
 * suspeita.
 */
function perguntasAdversariais(recibo, opts) {
  const options = opts || {};
  const scorecard = options.scorecard || null;
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const perguntas = [];
  const add = (pergunta, facto, porque_importa) => perguntas.push({ pergunta, facto, porque_importa });

  // 1. Cobertura de custo — sem custo não há "custo por resposta certa".
  /* ⚠️ BUG CORRIGIDO 2026-08-04 (gauntlet G1/G11): o numerador filtrava TODOS
     os jobs e o denominador só os terminais. Um job ainda a correr que já
     trouxesse `cost_usd` inflava a cobertura — e com jobs vivos suficientes o
     rácio podia passar de 100%. Uma pergunta sobre a validade de uma medição,
     construída sobre uma medição inválida, é o pior defeito possível NESTA
     regra em particular: é a única que existe para pregar a G11. */
  const terminais = jobs.filter(isTerminal);
  const comCusto = terminais.filter((j) => Number.isFinite(Number(j.cost_usd)));
  if (terminais.length) {
    const pct = Math.round((comCusto.length / terminais.length) * 100);
    if (pct < LIMIAR_COBERTURA_CUSTO) {
      add(
        'A régua é "custo por resposta certa". Com ' + (terminais.length - comCusto.length) + ' de '
          + terminais.length + ' jobs sem custo, essa régua ainda mede alguma coisa?',
        'cobertura de custo medida: ' + pct + '%',
        'um agregado calculado sobre metade da frota não compara motores — compara o que sobrou'
      );
    }
  }

  // 2. Trabalho local — é o fosso declarado; se está baixo, o fosso não opera.
  const locais = jobs.filter((j) => j.local === true || j.agent === 'moo');
  const concluidos = jobs.filter((j) => j.state === 'done');
  if (concluidos.length) {
    const pct = Math.round((locais.filter((j) => j.state === 'done').length / concluidos.length) * 100);
    /* ⚠️ 2026-08-04 (gauntlet G11): contar JOBS é o denominador lisonjeiro.
       Um job local de 900 tokens e um job pago de 30 000 contam 1 e 1. A
       medição por TOKENS deu 15% onde a contagem por jobs deu 51% — 3,4× de
       diferença, e a regra até se calaria se os jobs batessem o limiar
       enquanto a fatia real de trabalho continuasse pequena.
       Não trocamos o numerador (a contagem por jobs também interessa): dizemos
       os DOIS, e a pergunta passa a ser sobre a distância entre eles. */
    const tokDe = (arr) => arr.reduce((n, j) => n + (Number(j.tokens_out) || 0), 0);
    const tokLocais = tokDe(locais.filter((j) => j.state === 'done'));
    const tokTodos = tokDe(concluidos);
    const semTok = concluidos.filter((j) => j.tokens_out == null).length;
    const pctTok = tokTodos > 0 ? Math.round((tokLocais / tokTodos) * 100) : null;
    if (pct < LIMIAR_TRABALHO_LOCAL) {
      add(
        'O diferencial declarado é a GPU que já pagaste. Com ' + pct + '% do trabalho concluído a correr local'
          + (pctTok !== null && pctTok !== pct ? ' — mas só ' + pctTok + '% dos tokens produzidos' : '')
          + ', o diferencial está a operar ou só a ser afirmado?',
        pct + '% dos jobs concluídos correram no moo'
          + (pctTok !== null ? ' · por TOKENS a fatia local é ' + pctTok + '%' : ' · fatia por tokens n/d')
          + (semTok ? ' (⚠️ ' + semTok + ' job(s) sem tokens medidos — o número por tokens é um piso)' : ''),
        'um fosso que não opera na maioria dos casos é uma intenção, não um fosso'
          + (pctTok !== null && pct - pctTok >= 10
              ? '. E contar JOBS lisonjeia: a distância para a contagem por tokens é de '
                + (pct - pctTok) + ' pontos'
              : '')
      );
    }
  }

  // 3. Jobs que fecharam sem produzir — o padrão que já nos custou 3 vezes.
  /* ⚠️ 2026-08-04 (gauntlet G11): isto tratava `null` e `0` como a mesma coisa.
     São opostos. `0` é uma AFIRMAÇÃO — o motor mediu e não produziu nada, o que
     é um sinal forte de recusa carimbada como sucesso. `null` é uma ABSTENÇÃO —
     ninguém mediu, e não se sabe se produziu.
     Juntá-los era a violação da doutrina da casa dentro da própria regra que
     existe para a defender. Agora são duas perguntas, com forças diferentes. */
  const zeroMedido = jobs.filter((j) => j.state === 'done' && Number(j.tokens_out) === 0);
  const naoMedido  = jobs.filter((j) => j.state === 'done' && j.tokens_out == null);
  if (naoMedido.length) {
    add(
      naoMedido.length + ' job(s) fecharam como entregues sem NINGUÉM medir os tokens de saída. Sabes se entregaram?',
      'job(s) done com tokens_out não medido: ' + naoMedido.map((j) => j.job_id).join(', '),
      'não é o mesmo que terem produzido zero — é não se saber. E um "done" que ninguém mediu não prova entrega'
    );
  }
  const semSaida = zeroMedido;
  if (semSaida.length) {
    add(
      semSaida.length + ' job(s) fecharam como entregues com tokens de saída MEDIDOS a zero. Foram entregas ou recusas carimbadas como sucesso?',
      'job(s) done com tokens_out = 0 medido: ' + semSaida.map((j) => j.job_id).join(', '),
      'um exit_code 0 sobre uma recusa é indistinguível de uma entrega — já aconteceu três vezes'
    );
  }

  // 4. Preparação local que não poupou nada.
  const prepFalhado = jobs.filter((j) => String(j.exit_code || '').includes('prep-timeout'));
  if (prepFalhado.length) {
    add(
      'A preparação local falhou em ' + prepFalhado.length + ' job(s) e não poupou tokens. O prep em série está a pagar-se, ou só a adicionar latência?',
      'prep-timeout em: ' + prepFalhado.map((j) => j.job_id).join(', '),
      'o handoff local é vendido como poupança; quando expira, é só espera'
    );
  }

  // 5. Excepções que ninguém está a resolver.
  const excepcoes = scorecard && Array.isArray(scorecard.excepcoes) ? scorecard.excepcoes : [];
  if (excepcoes.length) {
    add(
      'Há ' + excepcoes.length + ' métrica(s) fora da faixa (' + excepcoes.map((e) => e.metrica).join(', ')
        + '). Qual delas é causa das outras, e qual é só sintoma?',
      'donos: ' + [...new Set(excepcoes.map((e) => e.dono).filter(Boolean))].join(', '),
      'tratar sintomas de forma independente multiplica trabalho e não move a causa'
    );
  }

  // 6. Nada foi registado no vault.
  const vault = options.vault_resumo;
  if (vault && vault.total === 0) {
    add(
      'Esta janela produziu trabalho e zero notas no vault. Quem abrir uma sessão nova amanhã vai saber o que aconteceu?',
      'notas escritas no vault na janela: 0',
      'trabalho não registado é trabalho que se paga outra vez em contexto'
    );
  }

  // 7. Relocação de pasta — a régua pode ter sido medida em árvores diferentes.
  const relocados = jobs.filter((j) => j.relocated === true);
  if (relocados.length && new Set(jobs.map((j) => j.worktree).filter(Boolean)).size > 1) {
    add(
      'Houve ' + relocados.length + ' relocação(ões) e os jobs desta janela correram em pastas diferentes. As comparações entre eles leram o mesmo código?',
      'pastas distintas: ' + [...new Set(jobs.map((j) => j.worktree).filter(Boolean))].join(' · '),
      'comparar dois motores sobre ficheiros diferentes mede a árvore, não o motor'
    );
  }

  return perguntas.length ? perguntas : [{
    pergunta: 'Nenhuma regra adversarial disparou nesta janela.',
    facto: 'as regras só disparam sobre números medidos — silêncio aqui significa que nada saiu da faixa, não que está tudo bem',
    porque_importa: 'ausência de alarme não é prova de saúde; é ausência de medição fora da faixa',
  }];
}

/** Próximos passos derivados das perguntas — nunca inventados. */
function proximosPassos(perguntas, contexto) {
  const passos = [];
  for (const q of (perguntas || [])) {
    if (/custo/i.test(q.pergunta)) passos.push('fechar a cobertura de custo (calcular por tokens × tabela quando o CLI não reporta)');
    if (/GPU que já pagaste/i.test(q.pergunta)) passos.push('subir a fatia de trabalho local — verificar o que está a impedir o moo de pegar nas tarefas fáceis');
    if (/recusas carimbadas/i.test(q.pergunta)) passos.push('guarda de recusa: reclassificar jobs que fecham sem produzir');
    if (/prep em série/i.test(q.pergunta)) passos.push('correr a preparação local em paralelo com o job pago, ou desligá-la');
    if (/causa das outras/i.test(q.pergunta)) passos.push('escolher UMA excepção como causa e tratar só essa antes de tocar nas outras');
    if (/sessão nova amanhã/i.test(q.pergunta)) passos.push('registar a wave no vault com mooter_journal antes de fechar');
    if (/mesmo código/i.test(q.pergunta)) passos.push('fixar a pasta antes de comparar motores, ou registar o hash do ficheiro lido');
  }
  const unicos = [...new Set(passos)];
  if (!(contexto && contexto.sessao_id && contexto.sessao_id.valor)) {
    unicos.push('declarar o estado da sessão com mooter_setup({sessao:"registar", id:"<projecto>"}) para que uma sessão nova comece na mesma página');
  }
  return unicos.length ? unicos : ['nada a propor: nenhuma regra disparou nesta janela'];
}

// ─────────────────────────────────────────────────────────────── montagem ──

function montar(recibo, opts) {
  const options = opts || {};
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const contexto = contextoDeTrabalho(jobs, options);
  const vault = registadoNoVault({
    desde: options.desde || (recibo && recibo.janela && recibo.janela.desde),
    journalModule: options.journalModule,
    vault: options.vault,
  });
  const perguntas = perguntasAdversariais(recibo, Object.assign({}, options, {
    vault_resumo: vault && vault.total != null ? vault : null,
  }));
  return {
    rotulo: 'contexto e advogado do diabo — perguntas derivadas de regras sobre números medidos, nunca geradas por um modelo',
    onde: contexto,
    antes: estadoAnterior(options),
    registado_no_vault: vault,
    advogado_do_diabo: perguntas,
    proximos_passos: proximosPassos(perguntas, contexto),
  };
}

module.exports = {
  montar,
  contextoDeTrabalho,
  estadoAnterior,
  registadoNoVault,
  perguntasAdversariais,
  proximosPassos,
  LIMIAR_COBERTURA_CUSTO,
  LIMIAR_TRABALHO_LOCAL,
};
