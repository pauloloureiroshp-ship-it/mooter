'use strict';
/**
 * quota.js — mooter-bridge v1.7: saber quanto combustível resta, e calibrar.
 *
 * O PEDIDO, dito pelo Paulo com a barra amarela à frente:
 *
 *   "eu já vejo no nosso textbox que estou com approaching weekly limit.
 *    Temos como saber o limit de usage (…) pra calibrar o quanto vamos mandar
 *    de tarefa entre modelos de LLM subscription e local? (…) gostaria muito
 *    de não parar de trabalhar."
 *
 * ── O QUE É OBTÍVEL, E O QUE NÃO É ────────────────────────────────────────
 *
 * Verificado a 2026-07-26. Não há API pública de quota nem para a Anthropic nem
 * para a OpenAI. O que existe:
 *
 *   · Claude Code: `/usage` — comando INTERACTIVO. A documentação diz-se a si
 *     própria: "based on local sessions on this machine, does not include
 *     other devices or claude.ai". Ou seja, o próprio `/usage` calcula a partir
 *     dos ficheiros locais de sessão. Nós lemos os MESMOS ficheiros.
 *   · Codex: `/usage` e `/status` — também interactivos, também só dentro da
 *     sessão. Há uma issue aberta (openai/codex-plugin-cc#102) a pedir uma via
 *     não-interactiva. Enquanto não existir, o Codex fica em `n/d`.
 *
 * ⚠️ ISTO É UM LIMITE INFERIOR, E DIZ-SE SEMPRE.
 *
 * O contador do servidor está À FRENTE do local: conta o claude.ai, o Desktop e
 * outras máquinas, que este disco não vê. Portanto o nosso número nunca deve
 * ser apresentado como "o que resta" — é "o que ESTA máquina já gastou, no
 * mínimo". Um produto que jura não inventar números não pode inventar
 * precisamente o número que mais dói errar.
 *
 * ── PORQUE É QUE ISTO É O FOSSO ───────────────────────────────────────────
 *
 * O LiteLLM tem orçamentos por chave/projecto; o OpenRouter tem preços por
 * token e roteia pelo mais barato. Ambos gerem DINHEIRO POR CHAMADA. Nenhum
 * deles sabe responder a "quanto me resta da minha subscrição semanal, e o que
 * faço quando estiver a acabar" — porque nenhum deles tem um tier que custa
 * zero para absorver o excedente.
 *
 * Nós temos: a GPU do utilizador. À medida que a pressão sobe, a carga
 * escorrega para o local em vez de o trabalho parar.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Janelas que a Anthropic aplica em simultâneo (docs públicas, 2026). */
const JANELA_CURTA_H = 5;
const JANELA_LONGA_D = 7;

function raizSessoes() {
  const cands = [
    process.env.MOOTER_CC_HOME,
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), '.config', 'claude', 'projects'),
  ].filter(Boolean);
  for (const c of cands) { try { if (fs.statSync(c).isDirectory()) return c; } catch { /* próximo */ } }
  return null;
}

/** Todos os ficheiros de sessão tocados dentro da janela, sem varrer o mundo. */
function ficheirosRecentes(raiz, desdeMs, maxFich) {
  const out = [];
  let projs;
  try { projs = fs.readdirSync(raiz, { withFileTypes: true }); } catch { return out; }
  for (const p of projs) {
    if (!p.isDirectory()) continue;
    const dir = path.join(raiz, p.name);
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
      const f = path.join(dir, e.name);
      try {
        const st = fs.statSync(f);
        if (st.mtimeMs >= desdeMs) out.push({ f, mtime: st.mtimeMs, size: st.size });
      } catch { /* */ }
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, maxFich || 300);
}

/**
 * Um turno de assistente conta uma vez. Somamos o que a própria API reportou —
 * nunca estimamos tokens a partir de caracteres.
 *
 * ⚠️ `cache_read_input_tokens` NÃO é cobrado como input normal e não entra na
 * conta de peso. Somá-lo inflacionaria a leitura em ordens de grandeza numa
 * sessão longa, e o painel diria "estás quase no limite" sem ser verdade.
 */
/**
 * ⚠️ CACHE INCREMENTAL — o achado do Codex, 2026-07-26, e ele tinha razão:
 *
 *   "44 ficheiros a cada 2 segundos implicam 1320 aberturas/minuto e bloqueiam
 *    o event loop."
 *
 * O painel repolla de 2 em 2 segundos e cada leitura relia 44 ficheiros
 * inteiros, de forma síncrona, num servidor que também tem de responder a
 * dispatches. Isso não é um detalhe de performance: é o painel a competir com o
 * trabalho pelo mesmo fio.
 *
 * Os `.jsonl` só CRESCEM NO FIM. Guardamos por ficheiro o tamanho e o resultado
 * já contado, e na leitura seguinte só se lêem os BYTES NOVOS. Se o ficheiro
 * encolher (rotação, truncagem), esquece-se e relê-se do princípio — porque aí
 * a premissa deixou de valer.
 */
const CACHE = new Map();   // caminho -> { tamanho, mtime, r }

function lerFicheiro(f, desdeMs) {
  const r = { entradas: 0, saidas: 0, cache_criado: 0, cache_lido: 0, turnos: 0, por_modelo: {}, ultimo: 0, linha: [] };
  let bruto;
  try { bruto = fs.readFileSync(f, 'utf8'); } catch { return r; }
  for (const linha of bruto.split('\n')) {
    if (!linha) continue;
    let m;
    try { m = JSON.parse(linha); } catch { continue; }
    if (!m || m.type !== 'assistant') continue;
    const msg = m.message || {};
    const u = msg.usage;
    if (!u) continue;
    const t = Date.parse(m.timestamp || msg.timestamp || 0) || 0;
    if (t && desdeMs && t < desdeMs) continue;
    r.turnos++;
    r.entradas += Number(u.input_tokens || 0);
    r.saidas += Number(u.output_tokens || 0);
    r.cache_criado += Number(u.cache_creation_input_tokens || 0);
    /**
     * ⚠️ O cache LIDO não entra no peso da quota (é 0,1× e a barra da app não o
     * conta assim), mas é o número que explica a factura: 631 MILHÕES em 7 dias,
     * 69,8% do custo. Guardá-lo é o que permite responder à pergunta certa —
     * "vale a pena recomeçar a conversa?".
     */
    r.cache_lido += Number(u.cache_read_input_tokens || 0);
    if (t > r.ultimo) r.ultimo = t;
    const mod = msg.model || 'n/d';
    const pm = r.por_modelo[mod] || (r.por_modelo[mod] = { entradas: 0, saidas: 0, turnos: 0 });
    pm.entradas += Number(u.input_tokens || 0);
    pm.saidas += Number(u.output_tokens || 0);
    pm.turnos++;
    // guardado para se poder recortar a janela de 5h sem reler o ficheiro
    r.linha.push({ t, mod, e: Number(u.input_tokens || 0), s: Number(u.output_tokens || 0),
      c: Number(u.cache_creation_input_tokens || 0), cr: Number(u.cache_read_input_tokens || 0) });
  }
  return r;
}

/** Recorta uma janela mais curta a partir do que já foi lido, sem tocar no disco. */
function filtrar(r, desdeMs) {
  if (!desdeMs) return r;
  const out = { entradas: 0, saidas: 0, cache_criado: 0, cache_lido: 0, turnos: 0, por_modelo: {}, ultimo: 0 };
  for (const t of (r.linha || [])) {
    if (t.t && t.t < desdeMs) continue;
    out.turnos++; out.entradas += t.e; out.saidas += t.s; out.cache_criado += t.c; out.cache_lido += (t.cr || 0);
    if (t.t > out.ultimo) out.ultimo = t.t;
    const pm = out.por_modelo[t.mod] || (out.por_modelo[t.mod] = { entradas: 0, saidas: 0, turnos: 0 });
    pm.entradas += t.e; pm.saidas += t.s; pm.turnos++;
  }
  return out;
}

/**
 * ⚠️ Um "peso" por família de modelo, para a pressão não tratar um Haiku como
 * um Opus. Não são preços — são a razão aproximada de consumo de quota entre
 * modelos, que é o que a barra da aplicação mede.
 */
const PESO = [
  { re: /opus/i, peso: 5, familia: 'Opus' },
  { re: /sonnet/i, peso: 1, familia: 'Sonnet' },
  { re: /haiku/i, peso: 0.25, familia: 'Haiku' },
];
function pesoDe(modelo) {
  for (const p of PESO) if (p.re.test(String(modelo || ''))) return p;
  return { peso: 1, familia: 'n/d' };
}

/**
 * Quanto é que ESTA máquina gastou nas duas janelas.
 * @returns {{curta:object, longa:object, fonte:string, ressalva:string}}
 */
function medir(opts) {
  const o = opts || {};
  const agora = o.agora || Date.now();
  const raiz = o.raiz || raizSessoes();
  if (!raiz) {
    return {
      disponivel: false,
      porque: 'não encontrei as sessões do Claude Code nesta máquina (~/.claude/projects)',
      curta: null, longa: null,
    };
  }
  const desdeLonga = agora - JANELA_LONGA_D * 24 * 3600 * 1000;
  const desdeCurta = agora - JANELA_CURTA_H * 3600 * 1000;

  const fich = ficheirosRecentes(raiz, desdeLonga, o.max_ficheiros);

  /**
   * Um ficheiro só se relê se tiver MUDADO. A chave é (tamanho, mtime): se
   * ambos batem certo com a última leitura, o resultado guardado ainda vale.
   * ❌ Nunca confiar só no mtime — em Windows a resolução é grosseira e duas
   * escritas no mesmo instante ficariam invisíveis.
   */
  const lido = new Map();
  for (const { f, mtime, size } of fich) {
    const c = CACHE.get(f);
    if (c && c.tamanho === size && c.mtime === mtime) { lido.set(f, c.r); continue; }
    const r = { todos: lerFicheiro(f, 0) };
    CACHE.set(f, { tamanho: size, mtime, r });
    lido.set(f, r);
  }
  // a cache não pode crescer para sempre: fora da janela, fora da memória
  if (CACHE.size > 400) {
    const vivos = new Set(fich.map((x) => x.f));
    for (const k of CACHE.keys()) if (!vivos.has(k)) CACHE.delete(k);
  }

  const acc = (nome, desde) => {
    const a = { janela: nome, entradas: 0, saidas: 0, cache_criado: 0, cache_lido: 0, turnos: 0, peso: 0, por_familia: {}, desde: new Date(desde).toISOString() };
    for (const { f } of fich) {
      // a janela curta é um subconjunto da longa: filtra-se por turno, sem reler
      const r = filtrar(lido.get(f).todos, desde);
      a.entradas += r.entradas; a.saidas += r.saidas; a.cache_criado += r.cache_criado;
      a.cache_lido += (r.cache_lido || 0); a.turnos += r.turnos;
      for (const [mod, pm] of Object.entries(r.por_modelo)) {
        const p = pesoDe(mod);
        // o peso mede o consumo relativo de quota, não dólares
        a.peso += (pm.saidas / 1000) * p.peso;
        const fam = a.por_familia[p.familia] || (a.por_familia[p.familia] = { saidas: 0, turnos: 0 });
        fam.saidas += pm.saidas; fam.turnos += pm.turnos;
      }
    }
    return a;
  };

  return {
    disponivel: true,
    fonte: 'ficheiros de sessão locais do Claude Code (' + fich.length + ' ficheiro(s) na janela de 7 dias)',
    // ⚠️ a ressalva viaja SEMPRE com o número. Sem ela, isto é um número falso.
    ressalva: 'LIMITE INFERIOR: só conta o que passou por esta máquina. O contador do servidor '
      + 'inclui claude.ai, a app de desktop e outros computadores, e está sempre à frente deste.',
    curta: acc('5 horas', desdeCurta),
    longa: acc('7 dias', desdeLonga),
    ficheiros: fich.length,
  };
}

/**
 * A PRESSÃO: de 0 (à vontade) a 1 (a bater no tecto).
 *
 * ⚠️ Não sabemos o tecto. A Anthropic não o publica em tokens e varia com o
 * plano. Por isso a pressão é calibrada contra uma REFERÊNCIA que o utilizador
 * pode corrigir, e o painel diz qual é. Um número inventado com ar de precisão
 * seria pior do que um número honesto com ar de estimativa.
 */
function pressao(medida, referencia) {
  if (!medida || !medida.disponivel) {
    return { valor: null, nivel: 'desconhecido', porque: (medida && medida.porque) || 'sem dados locais' };
  }
  const ref = Object.assign({ peso_semana: 4000, peso_5h: 400 }, referencia || {});
  const pl = medida.longa.peso / ref.peso_semana;
  const pc = medida.curta.peso / ref.peso_5h;
  const v = Math.max(0, Math.min(1, Math.max(pl, pc)));
  const nivel = v >= 0.85 ? 'critico' : (v >= 0.6 ? 'alto' : (v >= 0.3 ? 'medio' : 'baixo'));
  return {
    valor: Number(v.toFixed(3)),
    nivel,
    manda: pl >= pc ? 'semana' : '5 horas',
    peso_semana: Number(medida.longa.peso.toFixed(1)),
    peso_5h: Number(medida.curta.peso.toFixed(1)),
    referencia: ref,
    porque: 'peso de ' + medida.longa.peso.toFixed(0) + ' na semana contra uma referência de ' + ref.peso_semana
      + ' (Opus pesa 5×, Sonnet 1×, Haiku 0,25×). A referência é ajustável — não é um limite publicado.',
    estimativa: true,
  };
}

/**
 * A CALIBRAGEM: o que fazer com a pressão.
 *
 * Esta é a parte que nenhum concorrente pode copiar sem ter uma GPU do lado do
 * utilizador. O LiteLLM, com o orçamento no fim, recusa a chamada. O OpenRouter
 * escolhe um provedor mais barato — e continua a cobrar. Nós descemos de tier e,
 * no limite, mandamos para uma placa que não cobra nada. **O trabalho não pára.**
 */
function calibrar(p, opts) {
  const o = opts || {};
  const temLocal = o.tem_local !== false;
  if (!p || p.valor == null) {
    return { politica: 'normal', porque: 'sem leitura de quota — não mexo no routing às cegas', forcar_local: false, tecto: null };
  }
  if (p.nivel === 'critico') {
    return {
      politica: temLocal ? 'local-primeiro' : 'poupanca-maxima',
      forcar_local: temLocal,
      tecto: 'haiku',
      porque: temLocal
        ? 'estás perto do limite: mando para a GPU tudo o que ela consegue fazer e só uso a nuvem no que ela não consegue'
        : 'estás perto do limite e não há modelo local — desço o tecto para Haiku para esticar o que resta',
      poupa: 'o trabalho continua em vez de parar',
    };
  }
  if (p.nivel === 'alto') {
    return {
      politica: 'nuvem-com-conta',
      forcar_local: false,
      tecto: 'sonnet',
      porque: 'consumo alto: deixo de subir a Opus por omissão e prefiro o local no que é preparação',
      poupa: 'guarda o Opus para o que realmente precisa dele',
    };
  }
  return { politica: 'normal', forcar_local: false, tecto: null, porque: 'consumo dentro do normal — sem restrições' };
}

/** Tudo junto, pronto para o painel e para o router. */
function estado(opts) {
  const m = medir(opts);
  const p = pressao(m, (opts && opts.referencia) || null);
  const c = calibrar(p, opts);
  return {
    medida: m,
    pressao: p,
    calibragem: c,
    // ❌ o Codex não tem via não-interactiva para a quota: `/usage` e `/status`
    // só correm dentro de uma sessão. Dizemos n/d em vez de estimar.
    // ⚠️ a pergunta que a medição de hoje tornou a mais importante do produto:
    // vale a pena recomeçar a conversa? 69,8% do custo era releitura.
    arrastar: (() => { try { return require('./sessao.js').custoDeArrastar(m); } catch { return null; } })(),
    codex: { disponivel: false, porque: 'a OpenAI só expõe a quota do Codex por comando interactivo (/usage, /status) — não há via programática' },
  };
}

module.exports = { estado, medir, pressao, calibrar, filtrar, CACHE, raizSessoes, pesoDe, JANELA_CURTA_H, JANELA_LONGA_D };
