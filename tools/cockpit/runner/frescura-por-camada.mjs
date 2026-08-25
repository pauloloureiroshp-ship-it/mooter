/**
 * frescura-por-camada.mjs — cada fonte envelhece a um ritmo, e cada uma
 * declara o SEU tecto.
 *
 * O `self-check.mjs` ja pergunta "isto esta em dia?" a cinco coisas desta
 * maquina. O que faltava e a pergunta que atravessa as fontes: um agente que
 * arranca le o vault, o espelho do Notion e o pitch como se as tres tivessem a
 * mesma idade. Nao tem. Medido a 2026-08-25:
 *
 *   · o beacon do Mac tinha 18 s          (ciclo de 10 min → fresco)
 *   · o espelho do Notion tinha 31 DIAS   (`last_incremental_sync: 2026-07-25`)
 *
 * e nenhuma superficie dizia a diferenca. O `AGENTS.md` ja manda avisar quando o
 * espelho do Notion esta atrasado — mas mandava-o em PROSA, a um agente, que
 * tem de se lembrar. Uma regra em prosa nao se aplica a si propria.
 *
 * ── O QUE ESTE MODULO NAO FAZ ───────────────────────────────────────────────
 *
 * Nao vai buscar nada. Nao faz rede, nao faz git, nao escreve. Recebe FACTOS ja
 * lidos (um `synced_at`, um `mtime`, um numero de commits atras) e responde o
 * que eles valem contra o tecto declarado. Quem le e quem escolhe: assim isto
 * testa-se com um relogio na mao e sem montar vault nenhum.
 *
 * Nao inventa idade. Uma fonte que nao se consegue datar sai `n/d` com o
 * motivo, nunca `ok` — a mesma regra do `self-check.mjs`, e pela mesma razao:
 * um verde por ignorancia e pior do que um vermelho.
 *
 * ── PORQUE E QUE OS TECTOS SAO DIFERENTES ───────────────────────────────────
 *
 * O tecto de cada camada nao e uma preferencia, e uma consequencia do ciclo que
 * a alimenta. Esta escrito ao lado de cada um, e e a unica forma de alguem os
 * poder discutir sem ter de os redescobrir.
 */

/** Estados, no vocabulario do `self-check.mjs` — de proposito, para nao haver dois. */
export const OK = 'ok';
export const AVISO = 'aviso';
export const MAU = 'mau';
export const ND = 'n/d';

const H = 3600;
const D = 24 * H;

/**
 * A politica. Um `max_age` por fonte, em segundos, com a razao ao lado.
 *
 * `aviso` = ja passou o ciclo normal, e provavelmente so atraso.
 * `mau`   = passou tanto que a fonte deixou de descrever o presente.
 */
export const POLITICA = {
  beacon: {
    // O publicador corre de 10 em 10 min (`beacon-publisher.MINUTOS_OMISSAO`),
    // e o leitor do outro lado faz fetch de 2 em 2 min. Duas rondas falhadas
    // e atraso; tres e um device que parou de publicar.
    aviso: 20 * 60, mau: 30 * 60,
    rotulo: 'beacon da frota',
    canal: 'via vault · ciclo ~10 min',
  },
  vault: {
    // O vault sincroniza pelo mesmo ciclo do publicador. Duas horas atras sem
    // ninguem ter puxado quer dizer que este device esta a trabalhar contra
    // uma copia velha do canon.
    aviso: 2 * H, mau: 12 * H,
    rotulo: 'vault (canon)',
    canal: 'git · pull do ciclo',
  },
  notion: {
    // O espelho do Notion e uma PROJECCAO, sincronizada a mao pela skill
    // `notion-to-vault`. Uma semana e o ritmo que o dono lhe da; um mes quer
    // dizer que ninguem lhe toca, e nessa altura ele mente sobre o estado.
    aviso: 7 * D, mau: 30 * D,
    rotulo: 'espelho do Notion',
    canal: 'skill notion-to-vault · a mao',
  },
  pitch: {
    // O pitch e o unico artefacto cuja validade nao depende de um ciclo, mas do
    // MUNDO: precos de modelos, nomes de concorrentes, numeros medidos. Trinta
    // dias e o horizonte em que um desses tres muda quase de certeza.
    aviso: 30 * D, mau: 90 * D,
    rotulo: 'pitch / estrategia',
    canal: 'escrito a mao · sem ciclo',
  },
};

/** Segundos entre `quandoIso` e `agoraMs`. `null` se nao houver data utilizavel. */
export function idadeSegundos(quandoIso, agoraMs) {
  if (quandoIso == null) return null;
  const t = quandoIso instanceof Date ? quandoIso.getTime()
    : typeof quandoIso === 'number' ? quandoIso
      : Date.parse(String(quandoIso));
  if (!Number.isFinite(t)) return null;
  const s = Math.round((agoraMs - t) / 1000);
  // Uma fonte datada no FUTURO nao e fresca — e um relogio errado nalgum lado,
  // e chamar-lhe `ok` esconderia exactamente isso. Cinco segundos de folga para
  // desvio de relogio entre maquinas.
  if (s < -5) return null;
  return Math.max(0, s);
}

/** Idade em palavras do dono, sempre com unidade. */
export function emPalavras(s) {
  if (s == null) return 'n/d';
  if (s < 60) return `${s} s`;
  if (s < H) return `${Math.round(s / 60)} min`;
  if (s < D) return `${Math.round(s / H)} h`;
  return `${Math.round(s / D)} d`;
}

/**
 * Uma camada, julgada contra o seu tecto.
 *
 * @param {string} fonte   chave da POLITICA
 * @param {object} facto   `{ quando, detalhe?, porqueNd? }` — `quando` e o ISO/ms
 *                         da ultima actualizacao dessa fonte, ou null.
 */
export function verCamada(fonte, facto, { agora = Date.now(), politica = POLITICA } = {}) {
  const p = politica[fonte];
  if (!p) {
    return { id: `frescura:${fonte}`, fonte, estado: ND, o_que: fonte, idade_s: null,
      porque: 'fonte sem tecto declarado — nao ha contra o que a julgar', canal: null, resolver: null };
  }
  const f = facto || {};
  const idade = idadeSegundos(f.quando, agora);

  const base = {
    id: `frescura:${fonte}`,
    fonte,
    o_que: p.rotulo,
    idade_s: idade,
    // O CANAL viaja sempre, fresco ou velho. "1 min" sem dizer por onde veio e
    // a metade da verdade que fez o painel parecer que mentia: o dono olhava
    // para um ficheiro de dois dias no disco e para um rotulo de um minuto, e
    // os dois estavam certos — o rotulo vinha do remoto.
    canal: p.canal,
    tecto: { aviso_s: p.aviso, mau_s: p.mau },
  };

  if (idade === null) {
    return { ...base, estado: ND,
      porque: f.porqueNd || 'sem data utilizavel — nao se pode afirmar frescura nenhuma',
      resolver: f.resolver || null };
  }

  const detalhe = f.detalhe ? ` · ${f.detalhe}` : '';
  if (idade >= p.mau) {
    return { ...base, estado: MAU, valor: emPalavras(idade),
      porque: `${emPalavras(idade)} sem actualizar (tecto ${emPalavras(p.mau)})${detalhe} — esta fonte deixou de descrever o presente`,
      resolver: f.resolver || null };
  }
  if (idade >= p.aviso) {
    return { ...base, estado: AVISO, valor: emPalavras(idade),
      porque: `${emPalavras(idade)} sem actualizar (tecto ${emPalavras(p.aviso)})${detalhe}`,
      resolver: f.resolver || null };
  }
  return { ...base, estado: OK, valor: emPalavras(idade),
    porque: `${emPalavras(idade)} · dentro do ciclo${detalhe}`, resolver: null };
}

/**
 * Todas as camadas de uma vez.
 *
 * `factos` e um objecto `{ beacon: {...}, vault: {...}, notion: {...}, pitch: {...} }`.
 * Uma fonte AUSENTE do objecto sai `n/d` — nao se cala, porque uma camada que
 * ninguem mediu e indistinguivel de uma camada saudavel, e essa confusao e a
 * unica coisa que este modulo existe para acabar.
 */
export function frescuraPorCamada(factos, { agora = Date.now(), politica = POLITICA } = {}) {
  const f = factos || {};
  const itens = Object.keys(politica).map((fonte) => verCamada(
    fonte,
    Object.prototype.hasOwnProperty.call(f, fonte)
      ? f[fonte]
      : { quando: null, porqueNd: 'esta fonte nao foi medida nesta ronda' },
    { agora, politica },
  ));
  const conta = { ok: 0, aviso: 0, mau: 0, 'n/d': 0 };
  for (const i of itens) conta[i.estado] = (conta[i.estado] || 0) + 1;
  return {
    itens,
    conta,
    pior: conta.mau > 0 ? MAU : conta.aviso > 0 ? AVISO : conta.ok > 0 ? OK : ND,
  };
}

/**
 * O que disto PEDE A MAO DO DONO, no formato do `naTuaMao` do fleet-beacon.
 *
 * So `mau` e `aviso` entram; `ok` nao ocupa a lista, e `n/d` entra porque nao
 * saber e trabalho por fazer, nao e ausencia de trabalho.
 */
export function naTuaMaoFrescura(resultado) {
  return (resultado && resultado.itens ? resultado.itens : [])
    .filter((i) => i.estado !== OK)
    .map((i) => ({
      id: i.id,
      estado: i.estado,
      titulo: i.estado === ND
        ? `${i.o_que}: idade desconhecida`
        : `${i.o_que}: ${i.valor} sem actualizar`,
      porque: i.porque,
      // O canal e a informacao accionavel: diz ao dono ONDE ir mexer.
      accao: i.canal ? `fonte chega ${i.canal}` : null,
      comando: i.resolver || null,
    }));
}

/**
 * Le o `synced_at` mais RECENTE de um manifesto do espelho do Notion.
 *
 * O manifesto tem um `last_incremental_sync` no topo e um `synced_at` por
 * pagina. O do topo pode estar a frente das paginas (uma corrida que nao
 * mudou nada ainda assim se regista), por isso conta o MAIS VELHO dos dois:
 * a frescura de um espelho e a da pagina mais atrasada que ele serve, nao a
 * da corrida mais recente.
 *
 * PURO: recebe o objecto ja parseado.
 */
export function frescuraDoNotion(manifesto) {
  const m = manifesto || {};
  const candidatos = [];
  if (m.last_incremental_sync) candidatos.push(Date.parse(m.last_incremental_sync));
  if (m.last_full_sync) candidatos.push(Date.parse(m.last_full_sync));
  const paginas = m.pages && typeof m.pages === 'object' ? Object.values(m.pages) : [];
  const porPagina = paginas
    .map((p) => (p && p.synced_at ? Date.parse(p.synced_at) : NaN))
    .filter((t) => Number.isFinite(t));

  const validos = candidatos.filter((t) => Number.isFinite(t));
  if (!validos.length && !porPagina.length) {
    return { quando: null, porqueNd: 'manifesto sem `last_*_sync` nem `synced_at` legivel', detalhe: null };
  }
  // O mais velho entre "a ultima corrida" e "a pagina mais atrasada".
  const maisVelhaPagina = porPagina.length ? Math.min(...porPagina) : null;
  const ultimaCorrida = validos.length ? Math.max(...validos) : null;
  const quando = maisVelhaPagina !== null && ultimaCorrida !== null
    ? Math.min(maisVelhaPagina, ultimaCorrida)
    : (maisVelhaPagina !== null ? maisVelhaPagina : ultimaCorrida);

  const stale = paginas.filter((p) => p && p.status === 'stale').length;
  return {
    quando,
    detalhe: `${paginas.length} paginas${stale ? `, ${stale} marcadas stale pelo proprio manifesto` : ''}`,
    resolver: 'correr a skill `notion-to-vault`',
  };
}
