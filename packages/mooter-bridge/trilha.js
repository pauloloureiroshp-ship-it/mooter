'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * trilha.js — o MODELO da Trilha (mooter-bridge)
 *
 * A Trilha responde a uma pergunta que nenhum concorrente responde:
 * **em cada passo desta sessão, QUEM trabalhou, quanto custou, e onde ficou
 * registo.** O painel desenha; este ficheiro decide o que é verdade.
 *
 * Duas fontes, e elas NÃO são intermutáveis:
 *
 *   host   — as acções da própria sessão (criou ficheiro, correu comando).
 *            Vivem nos `.jsonl` do Claude Code em `~/.claude/projects`.
 *            ⚠️ Existem no CC. Numa sessão Cowork, que corre na nuvem, podem
 *            não existir de todo — e nesse caso diz-se, não se finge.
 *   ledger — os jobs do Mooter (motor, cadeia, custo, estado). Existem sempre,
 *            nas duas superfícies, porque é o conector que os escreve.
 *
 * Módulo PURO: recebe dados, devolve estrutura. Não lê preferências, não
 * escreve nada, não conhece HTML. Quem rende é o painel (Cowork) ou
 * `texto()` (Claude Code, onde não há artefactos).
 *
 * DOUTRINA: nenhum campo ausente é `0`. É `{valor:null, porque:'...'}`.
 * Zero sem motivo lê-se como medição, e uma medição inventada é pior do que
 * um buraco declarado.
 * ══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/* ── vocabulário dos motores ────────────────────────────────────────────── */
/* `local:true` = corre na GPU do utilizador, a custo zero real. Tudo o resto
   consome quota ou dinheiro de alguém. A distinção é do produto, não cosmética. */
const MOTORES = {
  moo:    { label: 'moo · local GPU',   local: true,  marca: 'cow' },
  cc:     { label: 'Claude Code',       local: false, marca: 'claude' },
  claude: { label: 'Claude · Anthropic', local: false, marca: 'claude' },
  codex:  { label: 'Codex · OpenAI',    local: false, marca: 'codex' },
  kimi:   { label: 'Kimi · Moonshot',   local: false, marca: 'kimi' },
  gemini: { label: 'Gemini · Google',   local: false, marca: 'gemini' },
};
function motor(id, estado) {
  const m = MOTORES[id];
  return {
    id,
    label: m ? m.label : String(id),
    label_porque: m ? 'canonical engine table' : 'unknown engine — showing the raw id instead of inventing a name',
    local: m ? m.local : null,
    local_porque: m ? 'declared in the engine table' : 'engine outside the table; not claiming whether it runs locally',
    marca: m ? m.marca : null,
    estado: estado || 'terminado',
  };
}

/* ── o que o host faz, e como se chama na trilha ────────────────────────── */
/* Os rótulos imitam os do Cowork de propósito: quem lê a Trilha ao lado da
   conversa tem de reconhecer as mesmas palavras, ou são duas histórias. */
const ACCOES = {
  Write:        (i) => ({ kind: 'ficheiro', rotulo: 'Created ' + base(i && i.file_path) }),
  Edit:         (i) => ({ kind: 'ficheiro', rotulo: 'Edited ' + base(i && i.file_path) }),
  MultiEdit:    (i) => ({ kind: 'ficheiro', rotulo: 'Edited ' + base(i && i.file_path) }),
  NotebookEdit: (i) => ({ kind: 'ficheiro', rotulo: 'Edited ' + base(i && i.notebook_path) }),
  Bash:         (i) => ({ kind: 'comando',  rotulo: 'Ran command', sub: primeira(i && i.command) }),
  Task:         (i) => ({ kind: 'agente',   rotulo: 'Ran an agent', sub: i && i.subagent_type }),
};
/* Leitura e busca não entram: a trilha conta o que MUDOU, não o que foi olhado.
   ⚠️ Mas o número de filtrados VIAJA no resultado — um corte silencioso lê-se
   como "não aconteceu mais nada", que é exactamente a mentira a evitar. */
const RUIDO = new Set(['Read', 'Glob', 'Grep', 'TodoWrite', 'TaskCreate', 'TaskUpdate',
  'WebSearch', 'WebFetch', 'ToolSearch', 'ListMcpResourcesTool', 'ReadMcpResourceTool']);

/* Nome de modelo → motor. Só famílias que reconheço; qualquer outra devolve
   null e a linha fica sem motor, que é a verdade. */
function modeloParaMotor(mod) {
  const s = String(mod).toLowerCase();
  if (s.includes('claude')) return 'claude';
  if (s.includes('gpt') || s.includes('codex') || s.includes('o3') || s.includes('o4')) return 'codex';
  if (s.includes('gemini')) return 'gemini';
  if (s.includes('kimi')) return 'kimi';
  if (s.includes('qwen') || s.includes('llama') || s.includes('mistral')) return 'moo';
  return null;
}

function base(p) {
  if (!p) return 'file';
  return String(p).split(/[\\/]/).filter(Boolean).pop() || 'file';
}
function primeira(cmd) {
  if (!cmd) return null;
  const s = String(cmd).split('\n')[0].trim();
  return s.length > 46 ? s.slice(0, 45) + '…' : s;
}
/* Uma tool MCP do próprio Mooter é uma linha da CASA — leva a vaca, não o
   glifo genérico. Aceita os dois nomes porque o conector é registado em dois
   pontos de entrada e o cliente prefixa de maneiras diferentes. */
function ehMooter(nome) {
  return /(^|__)mooter_[a-z_]+$/i.test(String(nome || '')) || /Mooter__/i.test(String(nome || ''));
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · LINHAS DO HOST
   ⚠️ O GOTCHA JÁ PAGO (Onda 0.1, quota.js): uma resposta com N blocos de
   conteúdo escreve N linhas `type:"assistant"` no .jsonl, cada uma com uma
   CÓPIA do mesmo conteúdo. Contar por linha triplica a trilha. A chave é o
   `id` do próprio bloco `tool_use` — é único por chamada e sobrevive à cópia.
   ══════════════════════════════════════════════════════════════════════════ */
function lerHost(opts) {
  const o = opts || {};
  const vazio = (porque, extra) => Object.assign(
    { linhas: [], ficheiro: null, filtrados: 0, duplicados: 0, disponivel: false, porque }, extra || {});

  /* Quem já traz o conteúdo não precisa que eu descubra ficheiro nenhum —
     e forçá-lo a existir tornava o módulo impossível de testar sem disco. */
  let ficheiro = o.ficheiro || null;
  if (!ficheiro && o.conteudo == null) {
    const achado = sessaoMaisRecente(o.raizes, o.fs || fs, o.homedir || os.homedir());
    if (!achado.ficheiro) return vazio(achado.porque);
    ficheiro = achado.ficheiro;
  }
  if (!ficheiro) ficheiro = '(content supplied by the caller)';

  let bruto = o.conteudo;
  if (bruto == null) {
    try { bruto = (o.fs || fs).readFileSync(ficheiro, 'utf8'); }
    catch (e) { return vazio('could not read ' + ficheiro + ': ' + (e && e.code || 'error')); }
  }
  if (typeof bruto !== 'string') return vazio('session content is not text');

  const porId = new Map();      // id do bloco -> linha (dedup)
  let filtrados = 0, duplicados = 0, brutos = 0;

  for (const l of bruto.split('\n')) {
    if (!l) continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    if (!m || m.type !== 'assistant') continue;
    const conteudo = m.message && m.message.content;
    if (!Array.isArray(conteudo)) continue;
    const at = Date.parse(m.timestamp || (m.message && m.message.timestamp) || 0) || null;
    if (at && o.desdeMs && at < o.desdeMs) continue;

    for (const b of conteudo) {
      if (!b || b.type !== 'tool_use') continue;
      brutos++;
      const nome = b.name || '';
      if (RUIDO.has(nome)) { filtrados++; continue; }
      const chave = b.id || (nome + '|' + at + '|' + JSON.stringify(b.input || {}).slice(0, 120));
      if (porId.has(chave)) { duplicados++; continue; }

      let linha;
      if (ehMooter(nome)) {
        linha = { kind: 'mooter', rotulo: rotuloMooter(nome), sub: subMooter(b.input) };
      } else if (ACCOES[nome]) {
        linha = ACCOES[nome](b.input || {});
      } else {
        /* Tool que não conheço: não a escondo nem lhe invento um verbo.
           O nome cru é informação; um rótulo bonito e errado não é. */
        linha = { kind: 'outro', rotulo: nome, sub: null };
      }
      /* Quem fez esta acção do host? O próprio modelo da sessão — e o .jsonl
         diz qual, em `message.model`. É medido, não inferido: sem esse campo
         a linha fica sem motor em vez de ganhar um por omissão. */
      const mod = (m.message && m.message.model) || null;
      const eng = mod ? modeloParaMotor(mod) : null;

      porId.set(chave, Object.assign({
        at, fonte: 'host', sub: null, modelo: mod,
        motores: eng ? [Object.assign(motor(eng, 'terminado'), { modelo: mod })] : [],
        motores_porque: eng ? 'message.model, read from the transcript'
          : 'the transcript carried no message.model — no engine is assigned by default',
        ms: { valor: null, porque: 'the host transcript does not record a duration per call' },
        usd: { valor: null, porque: 'host cost is per turn, not per call — it is not split' },
        registos: [], estado: 'terminado',
      }, linha));
    }
  }

  const linhas = [...porId.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
  return {
    linhas, ficheiro, filtrados, duplicados, disponivel: true,
    brutos,
    porque: linhas.length
      ? 'read ' + brutos + ' tool_use blocks from ' + path.basename(ficheiro)
        + ' · ' + duplicados + ' copies dropped by id · ' + filtrados + ' read/search calls filtered out'
      : 'the session exists but holds no state-changing action (' + filtrados + ' read calls filtered out)',
  };
}

/** A sessão mais recente. Devolve SEMPRE o porquê — inclusive quando falha. */
function sessaoMaisRecente(raizes, _fs, home) {
  const cands = raizes && raizes.length ? raizes : [
    path.join(home, '.claude', 'projects'),
    path.join(home, '.config', 'claude', 'projects'),
  ];
  let melhor = null, vistas = 0, raizVista = null;
  for (const raiz of cands) {
    let projs; try { projs = _fs.readdirSync(raiz, { withFileTypes: true }); } catch { continue; }
    raizVista = raiz;
    for (const p of projs) {
      if (!p.isDirectory()) continue;
      const dir = path.join(raiz, p.name);
      let ents; try { ents = _fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
        vistas++;
        const f = path.join(dir, e.name);
        let st; try { st = _fs.statSync(f); } catch { continue; }
        if (!melhor || st.mtimeMs > melhor.mtimeMs) melhor = { ficheiro: f, mtimeMs: st.mtimeMs };
      }
    }
  }
  if (melhor) return { ficheiro: melhor.ficheiro, vistas, porque: 'most recent of ' + vistas + ' sessions' };
  return {
    ficheiro: null, vistas,
    porque: raizVista
      ? 'found ' + raizVista + ' but no session files in it'
      : 'no session transcripts on this machine — expected in a Cowork session, which '
        + 'runs in the cloud; the Trail shows Mooter jobs and states that host actions are not visible here',
  };
}

function rotuloMooter(nome) {
  const curto = String(nome).replace(/^.*__/, '');
  return ({
    mooter_work: 'Route to the right model', mooter_check: 'Check and collect',
    mooter_fleet: 'Fleet and receipts', mooter_journal: 'Write to the vault',
    mooter_setup: 'Bind this project', mooter_cancel: 'Stop a job',
  })[curto] || curto;
}
function subMooter(input) {
  if (!input) return null;
  if (input.wave) return 'wave ' + input.wave;
  if (input.agent) return 'engine ' + input.agent;
  if (input.job_id) return String(input.job_id);
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · LINHAS DO LEDGER (os jobs do Mooter)
   Um prompt raramente toca um motor só: o `moo` local prepara a $0 e passa a um
   pago. O ledger regista isso em `prep_from`/`handoff_from`. Seguimos a cadeia
   para trás e emitimos UMA linha por remate, com todos os motores que lá
   passaram. Um job que é antepassado de outro NÃO ganha linha própria — senão
   a mesma peça de trabalho aparece duas vezes e a trilha mente por inflação.
   ══════════════════════════════════════════════════════════════════════════ */
const VIVOS = new Set(['running', 'dispatched', 'pending']);

function dosJobs(jobs, opts) {
  const o = opts || {};
  const lista = Array.isArray(jobs) ? jobs : [];
  const porId = new Map(lista.map(j => [j.job_id, j]));
  const antepassados = new Set();
  for (const j of lista) {
    const pai = j.prep_from || j.handoff_from;
    if (pai && porId.has(pai)) antepassados.add(pai);
  }

  const linhas = [];
  for (const j of lista) {
    if (antepassados.has(j.job_id)) continue;         // só remates ganham linha
    const cadeia = [];
    let cur = j, guarda = 0, visto = new Set();
    while (cur && !visto.has(cur.job_id) && guarda++ < 8) {
      visto.add(cur.job_id); cadeia.unshift(cur);
      const pai = cur.prep_from || cur.handoff_from;
      cur = pai ? porId.get(pai) : null;
    }
    const vivo = cadeia.some(c => VIVOS.has(c.state));
    const falhou = !vivo && cadeia.some(c => c.state === 'failed');
    const custos = cadeia.map(c => c.cost_usd).filter(v => typeof v === 'number');
    const durs = cadeia.map(c => c.duration_s).filter(v => typeof v === 'number');
    const registos = (o.registos && o.registos[j.job_id]) || [];

    linhas.push({
      kind: 'mooter', fonte: 'ledger', job_id: j.job_id,
      rotulo: cadeia.length > 1 ? 'Chained work' : 'Dispatched work',
      sub: [j.wave ? 'wave ' + j.wave : null, j.agent_label || j.agent].filter(Boolean).join(' · ') || null,
      at: Date.parse(cadeia[0].dispatched_at || cadeia[0].started_at || 0) || null,
      motores: cadeia.map(c => motor(c.agent, VIVOS.has(c.state) ? 'vivo' : 'terminado')),
      registos,
      registos_porque: registos.length ? 'write receipt from the connector'
        : 'no destination confirmed a write for this job',
      ms: durs.length
        ? { valor: durs.reduce((a, b) => a + b, 0) * 1000, porque: 'sum of duration_s across the chain' }
        : { valor: null, porque: 'no job in the chain carried duration_s' },
      /* ⚠️ BUG APANHADO A OLHAR PARA O OUTPUT, não pelos testes: escrevia-se
         `soma || null`. Uma cadeia de jobs LOCAIS soma exactamente 0 — e `0 ||
         null` é `null`, ou seja o painel dizia "custo n/d" sobre o número mais
         importante que este produto tem para mostrar: que correu a zero.
         Medido-zero e não-medido são estados diferentes. Nunca com `||`. */
      usd: custos.length === 0
        ? { valor: null, porque: 'no job in the chain carried cost_usd', parcial: true }
        : { valor: custos.reduce((a, b) => a + b, 0),
            parcial: custos.length !== cadeia.length,
            porque: custos.length === cadeia.length
              ? 'sum of cost_usd across ' + cadeia.length + ' job(s), all measured'
              : custos.length + ' of ' + cadeia.length + ' job(s) have a measured cost — PARTIAL sum' },
      estado: vivo ? 'vivo' : falhou ? 'falhou' : 'terminado',
      actividade: j.activity || null,
    });
  }
  return linhas.sort((a, b) => (a.at || 0) - (b.at || 0));
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · FUNDIR — uma trilha só, por tempo
   ⚠️ Uma linha sem `at` não vai para o fim nem para o princípio por palpite:
   fica na ordem em que chegou, dentro do seu grupo, e o resumo diz quantas são.
   ══════════════════════════════════════════════════════════════════════════ */
function fundir(host, jobs, opts) {
  const o = opts || {};
  const h = host || { linhas: [], disponivel: false, porque: 'no host read was attempted' };
  const linhas = [...(h.linhas || []), ...(jobs || [])]
    .map((l, i) => Object.assign({ ordem: i }, l))
    .sort((a, b) => {
      if (a.at && b.at) return a.at - b.at;
      if (a.at) return -1;
      if (b.at) return 1;
      return a.ordem - b.ordem;
    });

  const motores = new Map();
  let semTempo = 0, registos = 0;
  for (const l of linhas) {
    if (!l.at) semTempo++;
    registos += (l.registos || []).length;
    for (const m of l.motores || []) if (!motores.has(m.id)) motores.set(m.id, m);
  }
  const vivos = linhas.filter(l => l.estado === 'vivo');
  const comLocal = linhas.filter(l => (l.motores || []).some(m => m.local === true));
  const custos = linhas.map(l => l.usd && l.usd.valor).filter(v => typeof v === 'number');
  const semCusto = linhas.filter(l => !l.usd || typeof l.usd.valor !== 'number').length;
  const locais = [...motores.values()].filter(m => m.local === true).length;

  return {
    linhas,
    host: { disponivel: !!h.disponivel, porque: h.porque, ficheiro: h.ficheiro || null,
            filtrados: h.filtrados || 0, duplicados: h.duplicados || 0 },
    resumo: {
      passos: linhas.length,
      sem_tempo: semTempo,
      vivos: vivos.length,
      motores: motores.size,
      motores_locais: locais,
      motores_subscricao: motores.size - locais,
      na_gpu_local: { valor: comLocal.length, de: linhas.length,
        porque: 'steps the local GPU solved or prepared, over the total number of STEPS. '
              + '⚠️ The denominator is steps, not tokens — the token share is always smaller and lives in fatiaLocal()' },
      custo: custos.length
        ? { valor: custos.reduce((a, b) => a + b, 0),
            porque: semCusto ? 'PARTIAL sum: ' + semCusto + ' of ' + linhas.length + ' steps have no measured cost'
                             : 'sum over every step, all of them measured',
            parcial: semCusto > 0 }
        : { valor: null, porque: 'no step carried a measured cost', parcial: true },
      registos,
    },
    /* A regra que o crítico obrigou a escrever: uma corrente que aponta para
       quatro sítios não aponta para nenhum. Acima do tecto, cala-se. */
    corrente: vivos.length === 0
      ? { mostrar: false, porque: 'nothing live' }
      : vivos.length > (o.tecto_vivos || 3)
        ? { mostrar: false, porque: vivos.length + ' steps live at once — the current goes quiet on purpose' }
        : { mostrar: true, indice: linhas.indexOf(vivos[vivos.length - 1]), porque: 'a single most-recent live step' },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · TEXTO — o rendering do Claude Code
   No CC não há artefactos: o `/cockpit` emite texto. Perde-se a vaca e os
   logótipos; NÃO se perde a informação. Cada linha continua a dizer quem
   trabalhou, quanto custou e onde ficou registo — que é o argumento.
   ══════════════════════════════════════════════════════════════════════════ */
const GLIFO = { ficheiro: '📄', comando: '▸', mooter: '🐄', agente: '🜂', pensamento: '✳', outro: '·' };

function texto(modelo, opts) {
  const o = opts || {};
  const m = modelo || {};
  const r = m.resumo || {};
  const L = m.linhas || [];
  const out = [];

  const cab = ['🐄 The Trail', o.projecto || null, r.passos + ' steps'];
  if (r.motores) cab.push(r.motores + ' engines (' + r.motores_subscricao + ' on subscription · ' + r.motores_locais + ' local)');
  if (r.na_gpu_local) cab.push(r.na_gpu_local.valor + '/' + r.na_gpu_local.de + ' on the local GPU');
  cab.push(r.custo && typeof r.custo.valor === 'number'
    ? (r.custo.valor === 0 ? '$0' : '$' + r.custo.valor.toFixed(3)) + (r.custo.parcial ? ' (partial)' : '')
    : 'cost n/a');
  if (r.registos) cab.push(r.registos + (r.registos === 1 ? ' receipt' : ' receipts'));
  out.push(cab.filter(Boolean).join(' · '));

  if (!m.host || !m.host.disponivel) {
    out.push('⚠️ Host actions not visible: ' + ((m.host && m.host.porque) || 'no read attempted'));
  }
  if (r.sem_tempo) out.push('⚠️ ' + r.sem_tempo + ' step(s) with no recorded instant — kept in arrival order');
  out.push('');

  /* ⚠️ Um travessão por campo ausente parecia rigor e era ruído: três `—`
     seguidos numa linha do host, que por desenho não tem duração nem custo.
     Campo ausente CALA-SE na linha; o porquê continua no modelo, para quem
     abrir o painel. Silêncio ≠ zero — só não se repete nove vezes. */
  L.forEach((l, i) => {
    const fim = i === L.length - 1;
    const marca = GLIFO[l.kind] || '·';
    const estado = l.estado === 'vivo' ? '  🟡 running'
      : l.estado === 'falhou' ? '  ⚠️ failed' : '';
    out.push((fim ? '└─ ' : '├─ ') + marca + ' ' + l.rotulo + estado);

    const quem = (l.motores || []).map(x => x.id + (x.estado === 'vivo' ? '*' : '')).join(' → ');
    const dur = l.ms && typeof l.ms.valor === 'number' ? (l.ms.valor / 1000).toFixed(1) + 's' : null;
    const usd = l.usd && typeof l.usd.valor === 'number'
      ? (l.usd.valor === 0 ? '$0' : '$' + l.usd.valor.toFixed(3))
        + (l.usd.parcial ? ' (partial)' : '') : null;
    const regs = (l.registos || []).map(x => x.label || x.id).join(', ');
    const det = [quem || null, dur, usd, l.sub || null, regs || null].filter(Boolean);
    if (det.length) out.push((fim ? '   ' : '│  ') + ' ' + det.join('  ·  '));
  });

  if (m.corrente && !m.corrente.mostrar && r.vivos > 0) {
    out.push('');
    out.push('⚑ ' + m.corrente.porque);
  }
  return out.join('\n');
}

module.exports = { lerHost, dosJobs, fundir, texto, sessaoMaisRecente, MOTORES, RUIDO, ehMooter, motor };
