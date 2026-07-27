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

/**
 * ⚠️ DEDUPLICAÇÃO (Onda 0.1, 2026-07-26) — o bug que estrangulava o produto:
 *
 * Uma resposta com N blocos de conteúdo escreve N linhas `type:"assistant"` no
 * .jsonl, CADA UMA com uma cópia do MESMO `usage`. Medido hoje na sessão viva:
 * a mesma resposta aparecia 2-3×, e a quota lia 15 090 de peso onde havia ~6 000.
 * Consequência: `nivel: "critico"` → tecto haiku → o produto sabotava a própria
 * qualidade com um número que ele próprio inflacionou.
 *
 * Um turno = um `requestId`. Fallback: `message.id`; último recurso: a assinatura
 * (timestamp + usage). Last-wins: a linha mais recente do turno fica com o usage.
 * O factor de inflação medido (linhas brutas ÷ turnos únicos) VIAJA no resultado
 * para o painel o mostrar — medido, não estimado.
 */
function lerFicheiro(f, desdeMs, conteudo) {
  const r = { entradas: 0, saidas: 0, cache_criado: 0, cache_lido: 0, turnos: 0,
    linhas_brutas: 0, suspeitas: 0, por_modelo: {}, ultimo: 0, linha: [] };
  let bruto = conteudo;
  // `conteudo` chega já lido quando quem chama usou fs.promises (caminho async)
  if (bruto == null) { try { bruto = fs.readFileSync(f, 'utf8'); } catch { return r; } }
  if (typeof bruto !== 'string') return r;
  const porTurno = new Map();   // chave de dedup -> turno único (last-wins)
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
    r.linhas_brutas++;
    const chave = m.requestId || msg.id
      || (t + '|' + (u.input_tokens || 0) + '|' + (u.output_tokens || 0) + '|'
        + (u.cache_creation_input_tokens || 0) + '|' + (u.cache_read_input_tokens || 0));
    const antes = porTurno.get(chave);
    porTurno.set(chave, {
      t, mod: msg.model || 'n/d',
      e: Number(u.input_tokens || 0), s: Number(u.output_tokens || 0),
      c: Number(u.cache_creation_input_tokens || 0),
      /**
       * ⚠️ O cache LIDO não entra no peso da quota (é 0,1× e a barra da app não o
       * conta assim), mas é o número que explica a factura: 631 MILHÕES em 7 dias,
       * 69,8% do custo. Guardá-lo é o que permite responder à pergunta certa —
       * "vale a pena recomeçar a conversa?".
       */
      cr: Number(u.cache_read_input_tokens || 0),
      dups: antes ? antes.dups + 1 : 1,
    });
  }
  for (const turno of porTurno.values()) {
    r.turnos++;
    r.entradas += turno.e; r.saidas += turno.s;
    r.cache_criado += turno.c; r.cache_lido += turno.cr;
    // guard #25941: output gravado como placeholder 1-2. Hoje NÃO reproduz
    // (0 de 22 linhas ≤3) — mas no dia em que reproduzir, somá-lo cegava o produto.
    if (turno.s <= 3) r.suspeitas++;
    if (turno.t > r.ultimo) r.ultimo = turno.t;
    const pm = r.por_modelo[turno.mod] || (r.por_modelo[turno.mod] = { entradas: 0, saidas: 0, turnos: 0 });
    pm.entradas += turno.e; pm.saidas += turno.s; pm.turnos++;
    // guardado para se poder recortar a janela de 5h sem reler o ficheiro
    r.linha.push(turno);
  }
  return r;
}

/** Recorta uma janela mais curta a partir do que já foi lido, sem tocar no disco. */
function filtrar(r, desdeMs) {
  if (!desdeMs) return r;
  const out = { entradas: 0, saidas: 0, cache_criado: 0, cache_lido: 0, turnos: 0,
    linhas_brutas: 0, suspeitas: 0, por_modelo: {}, ultimo: 0 };
  for (const t of (r.linha || [])) {
    if (t.t && t.t < desdeMs) continue;
    out.turnos++; out.entradas += t.e; out.saidas += t.s; out.cache_criado += t.c; out.cache_lido += (t.cr || 0);
    out.linhas_brutas += (t.dups || 1);
    if (t.s <= 3) out.suspeitas++;
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
 * ⚠️ A LEITURA SÍNCRONA ERA A LENTIDÃO (Onda 2, medido 2026-07-26).
 *
 * O painel repolla de 2 em 2 s e chamava `quota.estado()`, que lê 47 ficheiros
 * de sessão de forma SÍNCRONA. Medição do Codex neste host: **209 ms de event
 * loop bloqueado** na primeira leitura. Nada mais corre nesse tempo — nem o
 * `close` de um job. Foi assim que um dispatch que fecha em 75 ms passou a
 * fechar em 324 ms e o teste E2E (250 ms) começou a falhar: o produto atrasava
 * o próprio ciclo de vida dos jobs para desenhar um painel.
 *
 * Pôr um `Promise.all` à volta de uma função síncrona não a torna paralela —
 * essa foi a primeira tentativa, e não chegou. A correcção de raiz é ler os
 * ficheiros com `fs.promises` e CEDER o event loop entre cada um: a leitura
 * total demora o mesmo, mas nunca prende o processo mais do que um ficheiro.
 *
 * A versão síncrona fica, porque há chamadores (router, testes) que a querem.
 */
function lerTodos(fich) {
  const lido = new Map();
  for (const { f, mtime, size } of fich) {
    const c = CACHE.get(f);
    if (c && c.tamanho === size && c.mtime === mtime) { lido.set(f, c.r); continue; }
    const r = { todos: lerFicheiro(f, 0) };
    CACHE.set(f, { tamanho: size, mtime, r });
    lido.set(f, r);
  }
  return lido;
}

async function lerTodosAsync(fich) {
  const lido = new Map();
  for (const { f, mtime, size } of fich) {
    const c = CACHE.get(f);
    if (c && c.tamanho === size && c.mtime === mtime) { lido.set(f, c.r); continue; }
    let bruto = null;
    try { bruto = await fs.promises.readFile(f, 'utf8'); } catch { /* ficheiro que sumiu */ }
    const r = { todos: lerFicheiro(f, 0, bruto) };
    CACHE.set(f, { tamanho: size, mtime, r });
    lido.set(f, r);
    // ceder o ciclo: um job a fechar não pode esperar pelo painel
    await new Promise((res) => setImmediate(res));
  }
  return lido;
}

/**
 * Quanto é que ESTA máquina gastou nas duas janelas.
 * @returns {{curta:object, longa:object, fonte:string, ressalva:string}}
 */
function medir(opts) {
  const p = prepararMedida(opts);
  if (p.erro) return p.erro;
  return concluirMedida(p, lerTodos(p.fich));
}

/** O mesmo número, sem prender o event loop. É esta que o painel usa. */
async function medirAsync(opts) {
  const p = prepararMedida(opts);
  if (p.erro) return p.erro;
  return concluirMedida(p, await lerTodosAsync(p.fich));
}

function prepararMedida(opts) {
  const o = opts || {};
  const agora = o.agora || Date.now();
  const raiz = o.raiz || raizSessoes();
  if (!raiz) {
    return { erro: {
      disponivel: false,
      porque: 'não encontrei as sessões do Claude Code nesta máquina (~/.claude/projects)',
      curta: null, longa: null,
    } };
  }
  const desdeLonga = agora - JANELA_LONGA_D * 24 * 3600 * 1000;
  const desdeCurta = agora - JANELA_CURTA_H * 3600 * 1000;
  /**
   * Um ficheiro só se relê se tiver MUDADO. A chave é (tamanho, mtime): se
   * ambos batem certo com a última leitura, o resultado guardado ainda vale.
   * ❌ Nunca confiar só no mtime — em Windows a resolução é grosseira e duas
   * escritas no mesmo instante ficariam invisíveis.
   */
  return { fich: ficheirosRecentes(raiz, desdeLonga, o.max_ficheiros), desdeLonga, desdeCurta };
}

function concluirMedida({ fich, desdeLonga, desdeCurta }, lido) {
  // a cache não pode crescer para sempre: fora da janela, fora da memória
  if (CACHE.size > 400) {
    const vivos = new Set(fich.map((x) => x.f));
    for (const k of CACHE.keys()) if (!vivos.has(k)) CACHE.delete(k);
  }

  const acc = (nome, desde) => {
    const a = { janela: nome, entradas: 0, saidas: 0, cache_criado: 0, cache_lido: 0, turnos: 0,
      linhas_brutas: 0, suspeitas: 0, peso: 0, por_familia: {}, desde: new Date(desde).toISOString() };
    for (const { f } of fich) {
      // a janela curta é um subconjunto da longa: filtra-se por turno, sem reler
      const r = filtrar(lido.get(f).todos, desde);
      a.entradas += r.entradas; a.saidas += r.saidas; a.cache_criado += r.cache_criado;
      a.cache_lido += (r.cache_lido || 0); a.turnos += r.turnos;
      a.linhas_brutas += (r.linhas_brutas || r.turnos); a.suspeitas += (r.suspeitas || 0);
      for (const [mod, pm] of Object.entries(r.por_modelo)) {
        const p = pesoDe(mod);
        const fam = a.por_familia[p.familia] || (a.por_familia[p.familia] = { entradas: 0, saidas: 0, turnos: 0, peso_x: p.peso });
        fam.entradas += pm.entradas; fam.saidas += pm.saidas; fam.turnos += pm.turnos;
      }
    }
    // Onda 0.1 — o factor de inflação é MEDIDO e viaja com o número
    a.dedup = {
      linhas_brutas: a.linhas_brutas, turnos_unicos: a.turnos,
      factor: a.turnos ? Number((a.linhas_brutas / a.turnos).toFixed(2)) : null,
      porque: 'li ' + a.linhas_brutas + ' linhas assistant, ' + a.turnos + ' turnos únicos por requestId — '
        + 'linhas duplicadas por bloco de conteúdo não contam duas vezes',
    };
    /**
     * ⚠️ GUARD #25941 (Onda 0.2) — `output_tokens` gravado como placeholder 1-2.
     * Hoje não reproduz nesta máquina (0 de 22 linhas ≤3). Se >20% dos turnos
     * vierem com output ≤3, as saídas passam a n/d e NUNCA se soma um placeholder
     * — melhor um n/d honesto do que um peso três ordens de grandeza a menos.
     */
    const guard = a.turnos > 0 && (a.suspeitas / a.turnos) > 0.2;
    if (guard) {
      a.aviso_saidas = 'claude-code#25941: ' + a.suspeitas + ' de ' + a.turnos
        + ' turnos têm output_tokens ≤3 (placeholder). saidas = n/d; o peso usa só as entradas.';
      a.saidas = null;
    }
    // Onda 0.4 — as ENTRADAS contam no peso: uma sessão de input gigante com
    // output curto já não lê "baixo". (Consumo relativo de quota, não dólares.)
    for (const fam of Object.values(a.por_familia)) {
      a.peso += ((fam.entradas + (guard ? 0 : fam.saidas)) / 1000) * fam.peso_x;
    }
    a.peso = Number(a.peso.toFixed(3));
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
/**
 * Onda 0.3 — "a referência é ajustável" só é verdade se houver onde a ajustar.
 * Lê `~/.mooter/preferences.json` → `quota_referencia: {peso_semana, peso_5h}`.
 * Calibragem honesta: olhar a barra de /usage da app (X%), e pôr
 * peso_semana = peso_medido / (X/100). Sem esse dado, ficam os defaults — que
 * o painel declara como defaults, não como limite.
 */
function lerReferencia(ficheiro) {
  try {
    const f = ficheiro || path.join(os.homedir(), '.mooter', 'preferences.json');
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    const r = p && p.quota_referencia;
    if (r && (Number(r.peso_semana) > 0 || Number(r.peso_5h) > 0)) {
      const out = { origem: 'preferences.json (calibrada pelo utilizador)' };
      if (Number(r.peso_semana) > 0) out.peso_semana = Number(r.peso_semana);
      if (Number(r.peso_5h) > 0) out.peso_5h = Number(r.peso_5h);
      return out;
    }
  } catch { /* sem prefs, sem drama */ }
  return null;
}

function pressao(medida, referencia) {
  if (!medida || !medida.disponivel) {
    return { valor: null, nivel: 'desconhecido', porque: (medida && medida.porque) || 'sem dados locais' };
  }
  const ref = Object.assign({ peso_semana: 4000, peso_5h: 400, origem: 'default — não é um limite publicado' },
    lerReferencia() || {}, referencia || {});
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
      + ' (entradas+saídas por 1000 × família: Opus 5×, Sonnet 1×, Haiku 0,25×; turnos deduplicados por requestId).'
      + ' A referência é ajustável — não é um limite publicado.',
    estimativa: true,
  };
}

/**
 * ── CODEX (Onda 0.5, 2026-07-26) ──────────────────────────────────────────
 *
 * O que estava escrito aqui era falso por preguiça: "a OpenAI só expõe a quota
 * por comando interactivo". Medido hoje: 2 560 ficheiros em `~/.codex/sessions/
 * ** /rollout-*.jsonl`, com contadores de tokens dentro (eventos `token_count`
 * com `last_token_usage` por turno e `total_token_usage` cumulativo).
 * O produto declarava indisponível uma coisa que está no disco.
 *
 * ⚠️ codex#27131 — estes caminhos NUNCA podem entrar nas ferramentas do agente:
 * o Codex já se auto-ingeriu e explodiu o próprio contexto. Só ESTE módulo os lê,
 * e só para somar números. (Veto correspondente em context.js.)
 *
 * Se o formato não for o que sabemos ler, a resposta é n/d com o porquê —
 * nunca um número inventado a partir de bytes que não entendemos.
 */
const CACHE_CODEX = new Map();   // caminho -> { tamanho, mtime, r }

function raizCodex() {
  const cands = [process.env.MOOTER_CODEX_HOME, path.join(os.homedir(), '.codex', 'sessions')].filter(Boolean);
  for (const c of cands) { try { if (fs.statSync(c).isDirectory()) return c; } catch { /* próximo */ } }
  return null;
}

/** rollouts vivem em sessions/AAAA/MM/DD/rollout-*.jsonl — desce no máximo 4 níveis. */
function ficheirosCodex(raiz, desdeMs, maxFich) {
  const out = [];
  const walk = (dir, prof) => {
    if (prof > 4 || out.length >= (maxFich || 400)) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { walk(f, prof + 1); continue; }
      if (!e.isFile() || !e.name.startsWith('rollout-') || !e.name.endsWith('.jsonl')) continue;
      try {
        const st = fs.statSync(f);
        if (st.mtimeMs >= desdeMs) out.push({ f, mtime: st.mtimeMs, size: st.size });
      } catch { /* */ }
    }
  };
  walk(raiz, 0);
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, maxFich || 400);
}

function lerRollout(f) {
  // deltas por turno (last_token_usage) — somáveis por janela sem dupla contagem
  const r = { linha: [], eventos: 0 };
  let bruto;
  try { bruto = fs.readFileSync(f, 'utf8'); } catch { return r; }
  for (const linha of bruto.split('\n')) {
    if (!linha || linha.indexOf('token') === -1) continue;   // barato antes do parse
    let m;
    try { m = JSON.parse(linha); } catch { continue; }
    const p = (m && m.payload) || m;
    const info = p && p.type === 'token_count' ? (p.info || p) : null;
    const lu = info && info.last_token_usage;
    if (!lu) continue;
    r.eventos++;
    r.linha.push({
      t: Date.parse(m.timestamp || 0) || 0,
      e: Number(lu.input_tokens || 0), s: Number(lu.output_tokens || 0),
      cr: Number(lu.cached_input_tokens || lu.cache_read_input_tokens || 0),
    });
  }
  return r;
}

/** Quanto é que ESTA máquina gastou de Codex nas duas janelas. Mesmo contrato: limite inferior. */
function medirCodex(opts) {
  const o = opts || {};
  const agora = o.agora || Date.now();
  const raiz = o.raiz_codex || raizCodex();
  if (!raiz) return { disponivel: false, porque: 'não encontrei as sessões do Codex nesta máquina (~/.codex/sessions)' };
  const desdeLonga = agora - JANELA_LONGA_D * 24 * 3600 * 1000;
  const desdeCurta = agora - JANELA_CURTA_H * 3600 * 1000;
  const fich = ficheirosCodex(raiz, desdeLonga, o.max_ficheiros);
  if (!fich.length) return { disponivel: false, porque: 'sem rollouts do Codex na janela de ' + JANELA_LONGA_D + ' dias' };
  let eventos = 0;
  const janela = (desde) => ({ desde: new Date(desde).toISOString(), entradas: 0, saidas: 0, cache_lido: 0, turnos: 0 });
  const curta = janela(desdeCurta); const longa = janela(desdeLonga);
  for (const { f, mtime, size } of fich) {
    const c = CACHE_CODEX.get(f);
    let r;
    if (c && c.tamanho === size && c.mtime === mtime) { r = c.r; }
    else { r = lerRollout(f); CACHE_CODEX.set(f, { tamanho: size, mtime, r }); }
    eventos += r.eventos;
    for (const t of r.linha) {
      for (const a of (t.t >= desdeCurta ? [curta, longa] : (t.t >= desdeLonga ? [longa] : []))) {
        a.turnos++; a.entradas += t.e; a.saidas += t.s; a.cache_lido += t.cr;
      }
    }
  }
  if (CACHE_CODEX.size > 500) {
    const vivos = new Set(fich.map((x) => x.f));
    for (const k of CACHE_CODEX.keys()) if (!vivos.has(k)) CACHE_CODEX.delete(k);
  }
  if (!eventos) {
    return { disponivel: false, porque: 'encontrei ' + fich.length + ' rollout(s) mas nenhum evento token_count que eu saiba ler — formato: n/d, não estimo' };
  }
  return {
    disponivel: true,
    fonte: 'rollouts locais do Codex (' + fich.length + ' ficheiro(s), ' + eventos + ' eventos token_count na janela de 7 dias)',
    ressalva: 'LIMITE INFERIOR: só conta o que passou por esta máquina.',
    curta, longa,
    nota: '⚠️ codex#27131: estes caminhos são lidos SÓ para contar tokens — nunca entram no contexto de nenhum agente',
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
  return montarEstado(medir(opts), opts);
}

/**
 * A mesma coisa sem bloquear — o painel usa ESTA. (Onda 2: a versão síncrona
 * prendia o event loop 209 ms e atrasava o fecho dos jobs.)
 */
async function estadoAsync(opts) {
  return montarEstado(await medirAsync(opts), opts);
}

function montarEstado(m, opts) {
  const p = pressao(m, (opts && opts.referencia) || null);
  const c = calibrar(p, opts);
  return {
    medida: m,
    pressao: p,
    calibragem: c,
    // ⚠️ a pergunta que a medição de hoje tornou a mais importante do produto:
    // vale a pena recomeçar a conversa? 69,8% do custo era releitura.
    arrastar: (() => { try { return require('./sessao.js').custoDeArrastar(m); } catch { return null; } })(),
    // Onda 0.5 — o Codex TEM leitura local (rollouts com token_count). O que
    // aqui dizia "não há via programática" era falso: estava no disco.
    codex: (() => { try { return medirCodex(opts); } catch (e) { return { disponivel: false, porque: 'erro a ler rollouts do Codex: ' + (e && e.message) }; } })(),
  };
}

module.exports = { estado, estadoAsync, medir, medirAsync, medirCodex, pressao, calibrar, filtrar, lerReferencia, CACHE, CACHE_CODEX, raizSessoes, raizCodex, pesoDe, JANELA_CURTA_H, JANELA_LONGA_D };
