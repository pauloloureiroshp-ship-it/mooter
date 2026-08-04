'use strict';
/**
 * retry.js — O GAUNTLET DE RETRY
 * ==============================================================================
 * Um job falhado não é um botão "tentar outra vez". É um DIAGNÓSTICO com uma
 * receita. Este módulo transforma o registo medido de um job (exactamente a
 * forma que `mooter_fleet({view:"jobs"})` devolve) numa acção correctiva
 * concreta — ou numa recusa honesta de agir.
 *
 * DOUTRINA (o que este ficheiro não faz):
 *
 *  1. NUNCA gera diagnóstico por modelo. Toda a classificação é uma REGRA sobre
 *     um CAMPO MEDIDO do ledger. É a mesma lei do bloco "advogado do diabo" do
 *     Cockpit: perguntas derivadas de números, nunca de prosa de LLM. Um modelo
 *     a adivinhar porque é que um job falhou é exactamente o erro que o painel
 *     inteiro existe para não cometer.
 *
 *  2. NUNCA re-despacha às cegas. Se a assinatura não é reconhecida, devolve
 *     `accao:'parar'` com o motivo — ausência de receita nunca é ausência de
 *     problema, e repetir o mesmo disparo é a definição de teatro.
 *
 *  3. NUNCA repete uma receita que já falhou. Assinatura igual duas vezes com a
 *     mesma receita = a receita está errada. Isso é um ACHADO para o dono, não
 *     um terceiro disparo.
 *
 *  4. TODA a mudança face ao disparo original é enumerada em `mudou[]`, com o
 *     campo, o valor antigo, o novo e a pergunta do gauntlet que a obrigou.
 *     Um retry que não sabe dizer o que mudou é o mesmo job outra vez.
 *
 * O gauntlet aqui não é decorativo: cada receita cita a pergunta de
 * `docs/foundation/MEO_GAUNTLET.md` que a produziu, e é essa pergunta que
 * justifica a correcção. G3 (mecanismo, não esperança) é a que mais dispara —
 * porque a falha mais cara desta frota é autorização escrita em PROSA no goal
 * em vez de FORÇADA por argumento.
 */

const MAX_TENTATIVAS = 3;

/* ─────────────────────────────────────────────────────────────────────────────
 * 0 · Leitores tolerantes
 * O payload do fleet mistura escalares e objectos `{valor, porque}` no mesmo
 * campo consoante a vista. Ler à bruta parte; ler assim não.
 * ────────────────────────────────────────────────────────────────────────────*/

function val(x) {
  if (x && typeof x === 'object' && !Array.isArray(x) && 'valor' in x) return x.valor;
  return x;
}

function texto(job, ...campos) {
  const partes = [];
  for (const c of campos) {
    const v = val(job && job[c]);
    if (typeof v === 'string') partes.push(v);
    else if (Array.isArray(v)) partes.push(v.filter((s) => typeof s === 'string').join(' \n'));
    else if (v && typeof v === 'object') partes.push(JSON.stringify(v));
  }
  return partes.join(' \n');
}

/**
 * O exit_code em string, preservando o ZERO.
 * `String(val(x) || '')` transforma `0` em `''` — e `0` é precisamente o código
 * de "correu bem". Um job feito passava a "sem exit_code" e caía no ramo
 * genérico. Apanhado pelo teste "um job que acabou bem nunca entra no retry".
 */
function exitStr(job) {
  const raw = val(job && job.exit_code);
  return raw === null || raw === undefined ? '' : String(raw);
}

function goalTexto(job) {
  const g = job && job.goal;
  if (typeof g === 'string') return g;
  if (g && typeof g === 'object') return String(g.resumo || g.texto || '');
  return '';
}

function stalledS(job) {
  const e = (job && job.estimativa) || {};
  const v = (e.vivo && e.vivo.ultimo_crescimento_s);
  if (typeof v === 'number') return v;
  const p = job && job.eta_bar && job.eta_bar.pulse;
  if (p && typeof p.stalled_s === 'number') return p.stalled_s;
  return null;
}

function avisoEta(job) {
  const e = (job && job.estimativa) || {};
  const a1 = e.aviso;
  const a2 = job && job.eta_bar && job.eta_bar.warning;
  return String(a1 || a2 || '');
}

/** Linhas de `coerencia[]` do fleet que falam deste job. */
function coerenciaDoJob(job, coerencia) {
  if (!Array.isArray(coerencia)) return [];
  const id = job && job.job_id;
  return coerencia.filter((c) => c && c.job === id).map((c) => String(c.msg || ''));
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 1 · AS ASSINATURAS
 *
 * Cada uma: um `quando(ctx)` que só lê campos medidos, o `gauntlet` que a
 * justifica, e a `receita` que devolve o delta de dispatch. `bloqueio:true`
 * marca as que têm de ser resolvidas ANTES das outras (um lock de git preso
 * torna qualquer outra correcção inútil).
 *
 * `severidade` ordena o painel. `auto:false` exige gesto explícito do dono —
 * é o caso de tudo o que ele próprio decidiu (cancelar) ou que custa dinheiro
 * sem prova de que desta vez passa.
 * ────────────────────────────────────────────────────────────────────────────*/

/* ─────────────────────────────────────────────────────────────────────────────
 * 1b · O GESTO DE CANCELAR — higiene, NÃO precondição
 *
 * MEDIDO 2026-08-04, 3 em 3: `mooter_cancel({job_id})` devolve
 * `{state:"nao_verificado", note:"já estava terminado — nada a fazer"}` e o job
 * continua `state:"running"` em `view:jobs`. A tool diz que matou e não matou.
 *
 * Duas consequências para este motor, ambas de terreno:
 *
 *  (a) O cancelamento NUNCA é bloqueante. Foi medido no mesmo dia que um
 *      dispatch novo entrou na worktree `frugal` com dois fantasmas `running`
 *      lá dentro — o fantasma infla o WIP, não tranca a porta. Tratar o cancel
 *      como precondição travava retries que funcionam.
 *  (b) O resultado do cancel não se aceita pela palavra dele. `verificar`
 *      manda reler `view:jobs`, e a escada continua em `sweep:true`.
 *
 * É a regra 6 do protocolo — confront-before-accept — escrita como dado.
 * ────────────────────────────────────────────────────────────────────────────*/

const CANCELAR = {
  tipo: 'cancelar',
  bloqueante: false,
  porque:
    'fecha o fantasma que infla o WIP. Não trava o re-disparo: medido 2026-08-04, ' +
    'um dispatch novo entrou numa worktree com 2 jobs `running` presos lá dentro.',
  verificar:
    'reler mooter_fleet({view:"jobs"}) — se o job continuar `running`, o cancel NÃO pegou ' +
    '(medido 3/3 em 2026-08-04: devolve "já estava terminado" e nada fecha). Escada: mooter_cancel({sweep:true}).',
  escalada: 'mooter_cancel({sweep:true})',
};

/* Um goal que ESCREVE tem de passar pelo confronto anti-stale antes de voltar a
 * correr; um goal só-de-leitura não. A régua é a regra 5 do protocolo: antes de
 * re-emitir um dispatch, confronta o git para ver se a wave já correu. Apanhou 2
 * no mesmo dia em 2026-07-19, e apanhou outros 2 no dia em que isto foi escrito. */
/* O `\b` no FIM de cada radical fechava a palavra: só casava a forma nua de 3ª
 * pessoa ("ele edita"). "vou escrever", "para corrigir", "antes de criar" — a
 * forma natural de escrever um goal em PT-BR — passavam todas ao lado, e o
 * portão anti-stale nunca disparava. Não era edge-case: era o caminho comum.
 * Achado do advogado do diabo, G4, 2026-08-04. Radical aberto à direita. */
const VERBOS_QUE_ESCREVEM =
  /\b(commit|push|merg|rebas|escrev|edit|alter|corrig|aplic|implement|cri[ae]|apag|remov|renome|refactor|fix|grava|guarda|salva|substitu|actualiz|atualiz)/i;

/* `git` sozinho conta, e não só no goal: o sinal mais fiável de que um job ia
 * escrever costuma estar no `activity` ("Preciso de aprovação para executar
 * comandos git") ou nos `commands` — precisamente nos casos em que o goal veio
 * cortado pelo painel. Ler só o goal perdia o job "Fechar o A5 e empurrar",
 * que era um push, e era o que estava stale. */
function escreveNoDisco(job) {
  if (!job) return false;
  if (job.write === true) return true;
  const alvo = [goalTexto(job), texto(job, 'activity', 'note'),
    Array.isArray(job.commands) ? job.commands.join(' ') : ''].join(' \n');
  return VERBOS_QUE_ESCREVEM.test(alvo) || /\bgit\b/i.test(alvo);
}

const ASSINATURAS = [
  /* ── B1 · lock de git preso ────────────────────────────────────────────────
   * Achado de terreno (2026-08-03/04): um `.git/index.lock` stale prendeu 3
   * jobs seguidos. O agente vê o lock, não consegue removê-lo, e acaba a pedir
   * aprovação — o que se lê como "o agente é desobediente" quando na verdade é
   * o disco que está bloqueado. G11: valida o INSTRUMENTO antes de acreditar na
   * medição. Sem isto, o retry corrige o sintoma errado.                       */
  {
    id: 'lock-git-preso',
    bloqueio: true,
    severidade: 90,
    auto: true,
    gauntlet: ['G11'],
    titulo: 'lock de git stale a bloquear o disco',
    quando(ctx) {
      return /index\.lock/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const m = ctx.medido.match(/[^\n]*index\.lock[^\n]*/i);
      return [{ campo: 'activity/commands', valor: (m && m[0].trim().slice(0, 160)) || 'index.lock' }];
    },
    diagnostico:
      'Um `.git/index.lock` stale está a bloquear o repositório. O agente não falhou a tarefa — ' +
      'não conseguiu sequer começar. Qualquer re-disparo sem limpar o lock morre no mesmo sítio.',
    receita() {
      return {
        pre: [
          {
            tipo: 'mover-lock',
            porque:
              '`rm` no lock é recusado pelo mount (Operation not permitted); `mv` passa. ' +
              'Achado registado 2026-08-04 — deixou de ser gesto do dono.',
          },
        ],
        delta: {},
        mudou: [],
      };
    },
  },

  /* ── B2 · aprovação presa ──────────────────────────────────────────────────
   * A falha mais cara desta frota, e a mais mal lida. O goal DIZ "NÃO PEÇAS
   * APROVAÇÃO — ela já foi dada". O agente pede à mesma. A leitura fácil é
   * "o modelo desobedeceu"; a leitura certa é G3: a autorização estava escrita
   * em PROSA dentro do prompt, e prosa não é mecanismo. O que autoriza de facto
   * é `write:true` + `allowedTools`. Enquanto isso não for passado como
   * ARGUMENTO, o parágrafo em maiúsculas é esperança.
   *
   * O sintoma composto que o torna venenoso: `exit_code` diz
   * `agent-awaiting-approval` mas `state` continua `running` — o job ocupa
   * worktree e conta como vivo para sempre. Por isso a receita cancela primeiro.
   */
  {
    id: 'aprovacao-presa',
    severidade: 80,
    auto: true,
    gauntlet: ['G3', 'G9'],
    titulo: 'terminou a pedir aprovação — a autorização era prosa, não mecanismo',
    quando(ctx) {
      return ctx.exit === 'agent-awaiting-approval' || /pedir aprovaç|preciso de aprovaç/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const ev = [{ campo: 'exit_code', valor: ctx.exit || 'n/d' }];
      if (ctx.job.state) ev.push({ campo: 'state', valor: String(ctx.job.state) });
      if (ctx.job.note) ev.push({ campo: 'note', valor: String(ctx.job.note).slice(0, 140) });
      const prosa = goalTexto(ctx.job).match(/N[ÃA]O PE[ÇC]AS APROVA[ÇC][ÃA]O[^.]*/i);
      if (prosa) ev.push({ campo: 'goal (a prosa que não funcionou)', valor: prosa[0].slice(0, 120) });
      return ev;
    },
    diagnostico:
      'O agente parou a pedir autorização. O goal já a concedia — por escrito. G3: ' +
      'a autorização não estava FORÇADA POR MECANISMO, estava escrita em prosa dentro do prompt, ' +
      'e prosa não vincula um CLI que tem o seu próprio portão de permissões. ' +
      'O job ficou `running` com `exit_code` de aprovação: ocupa worktree e conta como vivo.',
    receita(ctx) {
      /* O sinal de git pode estar no goal, mas o mais fiável está no `activity`:
       * "Preciso de aprovação para executar comandos git". Ler só o goal perde
       * o caso em que ele veio truncado pelo painel. */
      const querGit = /\bgit\b|commit|push\b|\badd\b/i.test(ctx.blob);
      const delta = { write: true };
      const mudou = [
        {
          campo: 'write',
          de: ctx.job.write === true ? 'true' : (ctx.job.write === false ? 'false (medido)' : 'n/d — não declarado'),
          para: 'true',
          porque: 'G3 — a permissão de escrita passa a argumento em vez de parágrafo no goal',
        },
      ];
      if (querGit) {
        delta.allowedTools = 'Bash(git add:*) Bash(git commit:*) Bash(git push:*) Bash(git status:*) Bash(git show:*) Edit Write Read';
        mudou.push({
          campo: 'allowedTools',
          de: ctx.job.allowedTools == null ? 'n/d — não declarado'
            : (ctx.job.allowedTools === '' ? "'' (medido — vazio)" : String(ctx.job.allowedTools)),
          para: delta.allowedTools,
          porque:
            'G3 — o goal pede git; sem allowedTools o CLI abre portão de permissão e o job morre à espera. ' +
            'A resposta do conector distingue pedido de capacidade efectiva: se o git não for concedido, sai no recibo.',
        });
      }
      return {
        pre: [CANCELAR],
        delta,
        mudou,
        goal_sufixo:
          '\n\n[RETRY · GAUNTLET G3] A tentativa anterior parou a pedir aprovação. A autorização vem agora ' +
          'pelos ARGUMENTOS do dispatch (write/allowedTools), não por este texto. Se ainda assim faltar uma ' +
          'permissão, NÃO peças: termina e declara exactamente qual ferramenta faltou e o comando exacto que ' +
          'terias corrido. Uma recusa nomeada vale mais do que um bloqueio silencioso.',
      };
    },
  },

  /* ── B3 · prep local que estoura sempre ────────────────────────────────────
   * Medido, não suposto: 4 jobs de prep neste ledger, todos com
   * prep_duration_s ∈ {20.011, 20.019, 20.021, 20.02} e prep_chars = 43.
   * Um valor que bate no tecto ao centésimo, 4 em 4, com output constante de 43
   * caracteres, não é um modelo lento — é um disjuntor a disparar
   * incondicionalmente. G12: `tokens_poupados_estimados: 0` publicado ao lado
   * disto mede a coisa fácil de contar, não a coisa que importa; o que se paga
   * são 20 s de latência por job, sempre.                                      */
  {
    id: 'prep-estoura-sempre',
    severidade: 60,
    auto: true,
    gauntlet: ['G3', 'G12'],
    titulo: 'preparação local estourou os 20 s — custo puro, poupança zero',
    quando(ctx) {
      return ctx.exit === 'prep-timeout' || /prepara[çc][ãa]o local excedeu/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const ev = [{ campo: 'exit_code', valor: ctx.exit || 'prep-timeout' }];
      if (ctx.job.prep_duration_s != null) ev.push({ campo: 'prep_duration_s', valor: String(ctx.job.prep_duration_s) });
      if (ctx.job.prep_chars != null) ev.push({ campo: 'prep_chars', valor: String(ctx.job.prep_chars) });
      if (ctx.job.tokens_poupados_estimados != null)
        ev.push({ campo: 'tokens_poupados_estimados', valor: String(ctx.job.tokens_poupados_estimados) });
      return ev;
    },
    diagnostico:
      'A pré-digestão local bateu no tecto dos 20 s e o job foi directo ao motor pago. ' +
      'O trabalho pago correu à mesma — o que se perdeu foram 20 s de latência e zero tokens poupados. ' +
      'Desligar o pre_digest não muda o resultado, muda o relógio.',
    receita(ctx) {
      return {
        pre: [],
        delta: { pre_digest: false },
        mudou: [
          {
            campo: 'pre_digest',
            de: 'true (por omissão)',
            para: 'false',
            porque:
              'G12 — o prep produziu ' +
              (ctx.job.prep_chars != null ? ctx.job.prep_chars + ' caracteres' : 'output residual') +
              ' e poupou ' +
              (ctx.job.tokens_poupados_estimados != null ? ctx.job.tokens_poupados_estimados : '0') +
              ' tokens em ' +
              (ctx.job.prep_duration_s != null ? ctx.job.prep_duration_s : '~20') +
              ' s. O denominador honesto é latência, e é negativo.',
          },
        ],
      };
    },
  },

  /* ── B4 · VRAM não chega ───────────────────────────────────────────────────
   * O próprio conector já escreve a aritmética em `modelo_porque`. Extraí-la é
   * ler, não adivinhar. G12: publicar "modelo escolhido" sem o número da VRAM
   * ao lado esconde a única causa que interessa.                               */
  {
    id: 'vram-nao-chega',
    severidade: 55,
    auto: true,
    gauntlet: ['G12'],
    titulo: 'o modelo pedido não cabe na GPU',
    quando(ctx) {
      return /precisa de [\d.,]+ ?GB, mas s[óo] h[áa]/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const m = ctx.medido.match(/precisa de [\d.,]+ ?GB, mas s[óo] h[áa][^.·]*/i);
      return [{ campo: 'modelo_porque', valor: (m && m[0].trim()) || 'n/d' }];
    },
    diagnostico:
      'O modelo pedido não cabe na VRAM livre. O conector já trocou por um que cabe — mas o pedido ' +
      'original continua a ser reemitido a cada disparo, e volta a pagar a troca.',
    receita(ctx) {
      const cabe = String(val(ctx.job.model_used) || val(ctx.job.model) || '').trim();
      if (!cabe) return { pre: [], delta: {}, mudou: [] };
      return {
        pre: [],
        delta: { model: cabe },
        mudou: [
          {
            campo: 'model',
            de: String(ctx.job.model_recommended || 'o pedido original'),
            para: cabe,
            porque: 'G12 — fixa o modelo que a VRAM medida comporta, em vez de repetir o pedido que não cabe',
          },
        ],
      };
    },
  },

  /* ── B5 · timeout do motor pago ────────────────────────────────────────────*/
  {
    id: 'timeout-motor',
    severidade: 70,
    auto: false,
    gauntlet: ['G6', 'G10'],
    titulo: 'o motor estourou o seu próprio timeout',
    quando(ctx) {
      return /excedeu o timeout de \d+ ?ms/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const m = ctx.medido.match(/[^\n]*excedeu o timeout de \d+ ?ms[^\n]*/i);
      return [{ campo: 'activity', valor: (m && m[0].trim()) || 'timeout' }];
    },
    diagnostico:
      'O motor bateu no tecto de tempo dele sem produzir nada. Repetir o mesmo disparo no mesmo motor ' +
      'é apostar que desta vez corre mais depressa — e não há medição que o suporte.',
    receita(ctx) {
      const escada = { kimi: 'cc', moo: 'cc', gemini: 'cc', cc: 'codex', codex: 'cc' };
      const novo = escada[String(ctx.job.agent)] || 'cc';
      return {
        pre: [],
        delta: { agent: novo, pre_digest: false },
        mudou: [
          {
            campo: 'agent',
            de: String(ctx.job.agent || 'n/d'),
            para: novo,
            porque: 'G10 — o critério de refutação era "o mesmo motor acaba dentro do timeout"; falhou. Muda-se a variável, não o número de tentativas.',
          },
        ],
      };
    },
  },

  /* ── B6 · parado muito para lá do histórico ────────────────────────────────
   * Só dispara com DUAS medições independentes a concordar: o log não cresce
   * (bytes) E o tempo passou o p90 (histórico). Uma só não chega — um job pode
   * estar legitimamente calado a pensar. G10: o critério de refutação está
   * definido ANTES, e é este.                                                  */
  {
    id: 'parado-fora-do-historico',
    severidade: 65,
    auto: true,
    gauntlet: ['G10', 'G11'],
    titulo: 'sem crescimento no log e para lá do p90',
    quando(ctx) {
      const s = stalledS(ctx.job);
      const passouP90 = /passou o p90/i.test(avisoEta(ctx.job));
      return String(ctx.job.state) === 'running' && typeof s === 'number' && s > 900 && passouP90;
    },
    evidencia(ctx) {
      const ev = [];
      const s = stalledS(ctx.job);
      if (s != null) ev.push({ campo: 'ultimo_crescimento_s', valor: String(s) + ' s sem o out.log crescer' });
      const a = avisoEta(ctx.job);
      if (a) ev.push({ campo: 'estimativa.aviso', valor: a });
      return ev;
    },
    diagnostico:
      'Duas medições independentes concordam: o out.log parou de crescer e a duração passou o p90 do ' +
      'histórico da mesma classe. O job está `running` no ledger e morto no disco.',
    receita() {
      return {
        pre: [CANCELAR],
        delta: { pre_digest: false },
        mudou: [],
      };
    },
  },

  /* ── B7 · órfão de reinício ────────────────────────────────────────────────*/
  {
    id: 'orfao-de-reinicio',
    severidade: 40,
    auto: true,
    gauntlet: ['G11'],
    titulo: 'o conector reiniciou e levou o job',
    quando(ctx) {
      return ctx.exit === 'orphaned-by-restart' || /orphaned|órf[ãa]o/i.test(String(ctx.exit || ''));
    },
    evidencia(ctx) {
      return [{ campo: 'exit_code', valor: String(ctx.exit) }];
    },
    diagnostico:
      'O job não falhou pelo conteúdo — perdeu o processo pai num reinício do conector. ' +
      'É a única classe em que repetir o disparo tal e qual é a resposta certa.',
    receita() {
      return { pre: [], delta: {}, mudou: [] };
    },
  },

  /* ── B8 · caminho com espaço não citado ────────────────────────────────────
   * `C:\Users\Paulo Loureiro\…` parte em qualquer comando sem aspas. Assina-se
   * pelo stderr truncado exactamente no espaço.                                */
  {
    id: 'caminho-com-espaco',
    severidade: 50,
    auto: true,
    gauntlet: ['G6', 'G11'],
    titulo: 'caminho com espaço partido por falta de aspas',
    quando(ctx) {
      return /C:\\+Users\\+Paulo:/i.test(ctx.medido) || /cannot find the (file|path) specified/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const m = ctx.medido.match(/[^\n]*(C:\\+Users\\+Paulo:|cannot find the (file|path) specified)[^\n]*/i);
      return [{ campo: 'stderr', valor: (m && m[0].trim().slice(0, 160)) || 'caminho truncado' }];
    },
    diagnostico:
      'Um comando partiu o caminho no espaço de "Paulo Loureiro". O erro lê-se como ficheiro inexistente ' +
      'quando é sintaxe de shell. G11: o instrumento é que estava errado, não o facto.',
    receita() {
      return {
        pre: [],
        delta: {},
        mudou: [],
        goal_sufixo:
          '\n\n[RETRY · GAUNTLET G11] A tentativa anterior partiu um caminho no espaço de "Paulo Loureiro". ' +
          'Cita SEMPRE caminhos entre aspas duplas, incluindo em `-C`, `rg`, `git` e redireccionamentos. ' +
          'Um "file not found" com o caminho cortado num espaço é erro de aspas, não ficheiro em falta.',
      };
    },
  },

  /* ── B9 · sandbox do codex em worktree no Windows ──────────────────────────*/
  {
    id: 'codex-worktree-windows',
    severidade: 58,
    auto: true,
    gauntlet: ['G6'],
    titulo: 'codex recusa sandbox em worktree recém-criada (Windows)',
    quando(ctx) {
      return /restricted-token sandbox|split writable root sets/i.test(ctx.medido);
    },
    evidencia(ctx) {
      const m = ctx.medido.match(/[^\n]*(restricted-token sandbox|split writable root sets)[^\n]*/i);
      return [{ campo: 'stderr', valor: (m && m[0].trim().slice(0, 160)) || 'sandbox' }];
    },
    diagnostico:
      'O Codex CLI no Windows não corre unsandboxed dentro de um worktree criado na hora. ' +
      'Reproduzido 2×, idêntico. Não é intermitente — é a combinação que é impossível.',
    receita(ctx) {
      return {
        pre: [],
        delta: { agent: 'cc', create_worktree: false },
        mudou: [
          {
            campo: 'agent + create_worktree',
            de: String(ctx.job.agent || 'n/d') + ' + create_worktree:'
              + (ctx.job.create_worktree === true ? 'true' : ctx.job.create_worktree === false ? 'false' : 'n/d'),
            para: 'cc + create_worktree:false',
            porque: 'G6 — funciona onde estás sentado (Windows), não só onde foi escrito',
          },
        ],
      };
    },
  },

  /* ── B10 · o dono cancelou ─────────────────────────────────────────────────
   * Nunca automático. Um cancelamento é uma decisão, e re-despachá-la sozinho
   * é desfazer uma escolha do dono.                                            */
  {
    id: 'cancelado-pelo-dono',
    severidade: 10,
    auto: false,
    gauntlet: [],
    titulo: 'cancelado pelo dono',
    quando(ctx) {
      return /cancelled-by-user|cancelado/i.test(String(ctx.exit || ''));
    },
    evidencia(ctx) {
      return [{ campo: 'exit_code', valor: String(ctx.exit) }];
    },
    diagnostico: 'Este job foi parado por decisão do dono. Re-disparar sozinho seria desfazer essa decisão.',
    receita() {
      return { pre: [], delta: {}, mudou: [] };
    },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * 2 · CLASSIFICAR
 * ────────────────────────────────────────────────────────────────────────────*/

function contexto(job, coerencia) {
  /* DUAS superfícies, e a diferença entre elas é doutrina.
   *
   * `medido` = só o que o job PRODUZIU: activity, note, stderr, comandos
   * corridos, a aritmética que o router escreveu. É o que uma assinatura de
   * FALHA pode ler.
   *
   * `blob` = o medido MAIS o texto do goal. O goal é INSTRUÇÃO, não medição:
   * um goal que diz "antes de comandos destrutivos, pedir aprovação ao dono"
   * descreve um procedimento — não é prova de que o job parou a pedir
   * aprovação. Classificar por aí dava falso positivo num job saudável
   * (apanhado pelo advogado do diabo, G4, 2026-08-04).
   *
   * Regra: `quando()` de uma assinatura lê `medido`. Só quem precisa da
   * INTENÇÃO do pedido — o detector de escrita no disco — lê `blob`. */
  const medido = [
    texto(job, 'activity', 'note', 'stale_note', 'modelo_porque', 'exit_code'),
    Array.isArray(job.commands) ? job.commands.join(' \n') : '',
    coerenciaDoJob(job, coerencia).join(' \n'),
    JSON.stringify((job && job.estimativa) || {}),
  ].join(' \n');
  const blob = medido + ' \n' + goalTexto(job);
  return { job, medido, blob, exit: exitStr(job), coerencia: coerenciaDoJob(job, coerencia) };
}

/**
 * classificar(job, coerencia) → { assinaturas: [...], porque }
 * Devolve TODAS as assinaturas que casam, ordenadas: bloqueios primeiro,
 * depois por severidade. Um job pode ter várias — e tratar só a primeira é
 * como o teste-controlo de vizinhos ensina a não fazer.
 */
function classificar(job, coerencia) {
  if (!job || typeof job !== 'object') {
    return { assinaturas: [], porque: 'job n/d — nada medido para classificar' };
  }
  const ctx = contexto(job, coerencia);
  const casadas = [];
  for (const a of ASSINATURAS) {
    let bateu = false;
    try {
      bateu = !!a.quando(ctx);
    } catch (_) {
      bateu = false;
    }
    if (!bateu) continue;
    casadas.push({
      id: a.id,
      titulo: a.titulo,
      gauntlet: a.gauntlet.slice(),
      severidade: a.severidade,
      bloqueio: !!a.bloqueio,
      auto: a.auto !== false,
      diagnostico: a.diagnostico,
      evidencia: a.evidencia(ctx),
    });
  }
  casadas.sort((x, y) => (y.bloqueio ? 1 : 0) - (x.bloqueio ? 1 : 0) || y.severidade - x.severidade);
  return {
    assinaturas: casadas,
    porque: casadas.length
      ? casadas.length + ' assinatura(s) reconhecida(s) por regra sobre campo medido'
      : 'nenhuma assinatura conhecida bateu — ausência de receita, não ausência de problema',
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 3 · ELEGIBILIDADE
 * ────────────────────────────────────────────────────────────────────────────*/

/** Um job só entra no retry se tiver PROVA de estar mal. */
function elegivel(job, coerencia) {
  const st = String((job && job.state) || '');
  const exit = exitStr(job);
  if (st === 'failed') return { sim: true, porque: 'state=failed' };
  if (st === 'done') {
    if (exit === '0') return { sim: false, porque: 'terminou bem — exit_code 0 medido' };
    if (exit !== '') return { sim: true, porque: 'state=done mas exit_code "' + exit + '" — o estado e o código discordam' };
    /* exit_code AUSENTE não é exit_code ZERO. Tratá-los como iguais é o mesmo
     * erro que a doutrina proíbe em todo o painel: n/d nunca é zero. Um job
     * `done` sem código medido só é dado por bom se nada no que ele produziu
     * disser o contrário. (G4, 2026-08-04.) */
    const c0 = classificar(job, coerencia);
    if (c0.assinaturas.length) {
      return { sim: true, porque: 'state=done com exit_code n/d — e o que o job produziu tem assinatura de falha: '
        + c0.assinaturas.map((a) => a.id).join(', ') };
    }
    return { sim: false, porque: 'terminou sem código medido (n/d, não zero) e sem assinatura de falha no que produziu' };
  }
  if (st === 'running' && exit && exit !== '0') {
    return { sim: true, porque: 'state=running com exit_code terminal "' + exit + '" — as duas verdades ao mesmo tempo' };
  }
  const c = classificar(job, coerencia);
  if (st === 'running' && c.assinaturas.some((a) => a.id === 'parado-fora-do-historico')) {
    return { sim: true, porque: 'running mas sem crescimento no log e para lá do p90' };
  }
  if (st === 'running') return { sim: false, porque: 'a trabalhar dentro do histórico — deixar acabar' };
  return { sim: false, porque: 'estado "' + (st || 'n/d') + '" sem prova de falha' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * 4 · PLANEAR — a saída que o botão consome
 * ────────────────────────────────────────────────────────────────────────────*/

/* Contar tentativas a menos é a falha PERIGOSA (nunca bate no tecto e o loop
 * não fecha); contar a mais só trava mais cedo. Por isso, na dúvida, conta.
 * O advogado do diabo construiu um histórico com a chave `root` e obteve
 * `tentativa_n: 1` cinquenta vezes seguidas. */
const CHAVES_RAIZ = ['raiz', 'root', 'job_id', 'parent', 'de', 'retry_de'];

function historicoDoJob(job, historico) {
  if (!Array.isArray(historico)) return [];
  const raiz = (job && (job.retry_de || job.job_id)) || null;
  return historico.filter((h) => {
    if (!h || typeof h !== 'object') return false;
    const chaves = CHAVES_RAIZ.filter((k) => h[k] != null);
    if (!chaves.length) return true;                      // sem chave: conta
    return chaves.some((k) => h[k] === raiz);
  });
}

/**
 * planear(job, {coerencia, historico}) → plano
 *
 * plano = {
 *   job_id, elegivel, tentativa_n,
 *   assinaturas[], gauntlet[], diagnostico,
 *   accao: 'despachar' | 'confirmar' | 'parar',
 *   pre[]            gestos que têm de acontecer ANTES (cancelar, mover-lock)
 *   dispatch{}       argumentos completos para mooter_work
 *   mudou[]          delta explícito face ao disparo original
 *   parar_porque     preenchido quando accao='parar'
 * }
 */
function planear(job, opts = {}) {
  const coerencia = opts.coerencia;
  const historico = historicoDoJob(job || {}, opts.historico);
  const tentativa = historico.length + 1;
  const base = {
    job_id: (job && job.job_id) || null,
    wave: (job && job.wave) || null,
    agent: (job && job.agent) || null,
    tentativa_n: tentativa,
    max_tentativas: MAX_TENTATIVAS,
  };

  const el = elegivel(job, coerencia);
  if (!el.sim) {
    return { ...base, elegivel: false, accao: 'parar', parar_porque: el.porque, assinaturas: [], gauntlet: [], mudou: [], pre: [] };
  }

  const { assinaturas, porque } = classificar(job, coerencia);

  if (!assinaturas.length) {
    return {
      ...base,
      elegivel: true,
      accao: 'parar',
      parar_porque:
        'assinatura desconhecida — ' + porque + '. Re-disparar sem diagnóstico é repetir, não corrigir. ' +
        'O que existe está no ledger: exit_code "' + (exitStr(job) || 'n/d') + '".',
      assinaturas: [],
      gauntlet: [],
      mudou: [],
      pre: [],
    };
  }

  /* Regra 3 da doutrina: receita já gasta não se repete. */
  const jaTentadas = new Set(historico.flatMap((h) => (h.assinaturas || []).map((a) => (typeof a === 'string' ? a : a.id))));
  const repetida = assinaturas.find((a) => jaTentadas.has(a.id));
  if (repetida) {
    return {
      ...base,
      elegivel: true,
      accao: 'parar',
      assinaturas,
      gauntlet: [...new Set(assinaturas.flatMap((a) => a.gauntlet))],
      mudou: [],
      pre: [],
      parar_porque:
        'a assinatura "' + repetida.id + '" já foi corrigida uma vez e voltou. A receita não funciona neste caso — ' +
        'isso é um ACHADO para decidir, não um terceiro disparo. Tentativas já feitas: ' + historico.length + '.',
    };
  }

  if (tentativa > MAX_TENTATIVAS) {
    return {
      ...base,
      elegivel: true,
      accao: 'parar',
      assinaturas,
      gauntlet: [...new Set(assinaturas.flatMap((a) => a.gauntlet))],
      mudou: [],
      pre: [],
      parar_porque: 'tecto de ' + MAX_TENTATIVAS + ' tentativas atingido. Mais disparos custam dinheiro sem hipótese nova.',
    };
  }

  /* ── PORTÃO ANTI-STALE ────────────────────────────────────────────────────
   * Regra 5 do protocolo, e a que mais dinheiro poupa: antes de re-emitir um
   * dispatch, confronta o repositório para ver se a wave JÁ correu por outra
   * via. Não é hipotético — no dia em que isto foi escrito, 2 dos 3 jobs presos
   * tinham o trabalho já em `main`: o "Fechar o A5 e empurrar" estava em
   * efce500c, e o "COMMIT E PUSH da skill cabine" estava em 1cfd4837 (e o
   * ficheiro entretanto mudou de nome para cockpit). Um botão de retry ingénuo
   * teria pago dois jobs para refazer trabalho feito — e arriscado um commit
   * duplicado sobre um ficheiro renomeado.
   *
   * Este módulo é puro: não abre o git. Por isso EXIGE a prova a quem chama.
   * Sem prova, um goal que escreve não passa a `despachar` — passa a
   * `confirmar`, com o comando de confronto já escrito. Ausência de verificação
   * nunca é prova de que falta fazer.                                          */
  const escreve = escreveNoDisco(job);
  const jaFeito = opts.jaFeito;
  let anti_stale = null;
  if (escreve) {
    if (!jaFeito || jaFeito.feito == null) {
      anti_stale = {
        estado: 'por-confrontar',
        porque: 'o goal escreve no disco e ninguém provou que a wave não correu já por outra via',
        como: 'git log --all --oneline -20 -- <ficheiros do goal>  ·  git status --porcelain',
      };
    } else if (jaFeito.feito === true) {
      return {
        ...base,
        elegivel: true,
        accao: 'parar',
        assinaturas,
        gauntlet: [...new Set(assinaturas.flatMap((a) => a.gauntlet))],
        mudou: [],
        pre: [CANCELAR],
        anti_stale: { estado: 'ja-feito', porque: jaFeito.porque || 'declarado por quem chamou', fonte: jaFeito.fonte || null },
        parar_porque:
          'o trabalho deste job JÁ ESTÁ FEITO por outra via' +
          (jaFeito.fonte ? ' (' + jaFeito.fonte + ')' : '') +
          '. ' + (jaFeito.porque || '') +
          ' Re-disparar pagava um job para refazer o que já está em disco. O que falta é fechar o registo, não repetir o trabalho.',
      };
    } else {
      anti_stale = { estado: 'confrontado', porque: jaFeito.porque || 'confrontado por quem chamou', fonte: jaFeito.fonte || null };
    }
  } else {
    anti_stale = { estado: 'nao-aplicavel', porque: 'goal só de leitura — repetir não escreve nada duas vezes' };
  }

  /* Compõe todas as receitas, bloqueios primeiro. */
  const ctx = contexto(job, coerencia);
  const pre = [];
  const mudou = [];
  let delta = {};
  let sufixos = '';
  let precisaConfirmar = false;

  /* As assinaturas vêm ordenadas por severidade DESCENDENTE, e um spread
   * sucessivo faz vencer a ÚLTIMA — ou seja, a menos grave. O advogado do
   * diabo provou-o: `codex-worktree-windows` (58) forçava `agent:'cc'` por
   * cima do escalonamento que `timeout-motor` (70) tinha acabado de fazer,
   * devolvendo o retry ao mesmo motor cujo timeout o gerou. Aplica-se por
   * ordem ASCENDENTE para a mais grave escrever por último, e as colisões
   * ficam registadas em vez de desaparecerem. */
  const colisoes = [];
  const receitasPartidas = [];
  for (const a of [...assinaturas].reverse()) {
    const def = ASSINATURAS.find((d) => d.id === a.id);
    if (!def) continue;
    if (def.auto === false) precisaConfirmar = true;
    let r;
    try {
      r = def.receita(ctx) || {};
    } catch (e) {
      /* Uma receita que rebenta não pode desaparecer em silêncio: o plano
       * ficava com `mudou: []` e lia-se como "não havia nada a mudar", que é
       * a mentira mais cara possível aqui. Aconteceu de verdade — um
       * ReferenceError numa receita passou por 30 testes verdes porque o
       * catch o engolia. Agora o defeito sai no plano e trava o automático. */
      receitasPartidas.push({ assinatura: a.id, erro: String((e && e.message) || e) });
      continue;
    }
    for (const p of r.pre || []) if (!pre.some((q) => q.tipo === p.tipo)) pre.push({ ...p, assinatura: a.id });
    for (const [k, v] of Object.entries(r.delta || {})) {
      if (k in delta && delta[k] !== v) colisoes.push({ campo: k, perdeu: delta[k], venceu: v, por: a.id });
      delta[k] = v;
    }
    for (const m of r.mudou || []) mudou.push({ ...m, assinatura: a.id, gauntlet: def.gauntlet.join('+') });
    if (r.goal_sufixo) sufixos += r.goal_sufixo;
  }

  /* Escalada: à segunda tentativa, sobe o motor mesmo que a receita não o peça. */
  if (tentativa >= 2 && !delta.agent) {
    const escada = { moo: 'cc', kimi: 'cc', gemini: 'cc', cc: 'codex', codex: 'cc' };
    const novo = escada[String(job.agent)] || 'cc';
    if (novo !== job.agent) {
      delta.agent = novo;
      mudou.push({
        campo: 'agent',
        de: String(job.agent || 'n/d'),
        para: novo,
        porque: 'escalada da tentativa ' + tentativa + ' — a receita sozinha não bastou na anterior',
        assinatura: 'escalada',
        gauntlet: 'G10',
      });
    }
  }

  const goalOriginal = goalTexto(job);
  /* Sem barreira, um goal que diga "ignora tudo o que vier a seguir" fica ANTES
   * do sufixo do retry e pode suprimi-lo. A cerca não é uma garantia — o motor
   * do outro lado é um LLM — mas torna a supressão visível em vez de silenciosa,
   * e diz de quem é cada metade. (G4, 2026-08-04, gravidade baixa.) */
  const CERCA = sufixos
    ? '\n\n' + '─'.repeat(60) + '\n[ACIMA: o pedido original, tal como foi escrito.'
      + ' ABAIXO: correcções do motor de retry, derivadas de campos medidos do ledger.'
      + ' Em conflito, ABAIXO manda — foi escrito depois de o pedido de cima ter falhado.]\n'
    : '';
  const dispatch = {
    goal: goalOriginal + CERCA + sufixos,
    ...(job.wave ? { wave: job.wave } : {}),
    ...(job.worktree ? { worktree: job.worktree } : {}),
    ...(job.cargo ? { cargo: job.cargo } : {}),
    ...(job.agent ? { agent: job.agent } : {}),
    ...delta,
  };

  if (receitasPartidas.length) {
    precisaConfirmar = true;
    pre.unshift({
      tipo: 'receita-partida',
      bloqueante: true,
      porque: 'a receita de ' + receitasPartidas.map((x) => x.assinatura).join(', ')
        + ' rebentou — o plano abaixo está INCOMPLETO: '
        + receitasPartidas.map((x) => x.erro).join(' · '),
    });
  }

  const porConfrontar = anti_stale && anti_stale.estado === 'por-confrontar';
  if (porConfrontar) {
    precisaConfirmar = true;
    pre.unshift({
      tipo: 'confrontar-git',
      bloqueante: true,
      porque: anti_stale.porque,
      verificar: anti_stale.como,
    });
  }

  return {
    ...base,
    elegivel: true,
    anti_stale,
    colisoes,
    receitas_partidas: receitasPartidas,
    accao: precisaConfirmar ? 'confirmar' : 'despachar',
    assinaturas,
    gauntlet: [...new Set(assinaturas.flatMap((a) => a.gauntlet))],
    diagnostico: assinaturas.map((a) => a.diagnostico).join(' '),
    pre,
    dispatch,
    mudou,
    goal_truncado: goalOriginal.length > 0 && /…$/.test(goalOriginal),
    goal_aviso: /…$/.test(goalOriginal)
      ? 'o goal veio cortado pelo painel — chama mooter_fleet({view:"jobs", verbose:true}) para o texto completo antes de disparar'
      : null,
    confirmar_porque: precisaConfirmar
      ? [
          receitasPartidas.length ? 'uma receita rebentou — o plano está incompleto' : null,
          porConfrontar ? 'o goal escreve e ainda não foi confrontado contra o git (regra 5 · anti-stale)' : null,
          assinaturas.some((a) => !a.auto)
            ? 'assinatura(s) que exigem gesto do dono: ' + assinaturas.filter((a) => !a.auto).map((a) => a.id).join(', ')
            : null,
        ].filter(Boolean).join(' · ')
      : null,
  };
}

/**
 * planearTodos(jobs, opts) → { planos[], resumo }
 * Uma passagem sobre a frota inteira. É isto que o botão "corrigir tudo" chama.
 */
function planearTodos(jobs, opts = {}) {
  const lista = Array.isArray(jobs) ? jobs : [];
  const planos = lista.map((j) => planear(j, opts)).filter((p) => p.elegivel);
  const resumo = {
    total_avaliados: lista.length,
    elegiveis: planos.length,
    despachar: planos.filter((p) => p.accao === 'despachar').length,
    confirmar: planos.filter((p) => p.accao === 'confirmar').length,
    parar: planos.filter((p) => p.accao === 'parar').length,
  };
  return { planos, resumo };
}

module.exports = { classificar, elegivel, planear, planearTodos, escreveNoDisco, CANCELAR, ASSINATURAS, MAX_TENTATIVAS, _val: val, _goalTexto: goalTexto };
