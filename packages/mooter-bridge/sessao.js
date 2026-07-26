'use strict';
/**
 * sessao.js — mooter-bridge v1.9: o cérebro da sessão, mantido pela GPU a $0.
 *
 * ── A MEDIÇÃO QUE JUSTIFICA ESTE FICHEIRO ─────────────────────────────────
 *
 * Sete dias de sessões do Paulo, lidos dos ficheiros locais em 2026-07-26:
 *
 *   cache_read   631 500 005 tokens   →  69,8% do peso da factura
 *   cache_write   16 701 349 tokens   →  23,1%
 *   output         1 278 971 tokens   →   7,1%
 *   input fresco       7 718 tokens   →   0,0%
 *
 * Média de 462 mil tokens RELIDOS por turno. A conversa arrasta-se atrás de si
 * própria: cada pergunta paga o custo de todas as anteriores. O que o assistente
 * escreve — a parte que toda a gente tenta encurtar — é 7% do problema.
 *
 * O Paulo disse-o assim: "a cada prompt feito aqui no cowork, não deveria ter
 * que ler toda a conversa e estourar os meus créditos". Tinha razão, e o efeito
 * é maior do que ele supunha.
 *
 * ── O QUE ESTE FICHEIRO NÃO FAZ, E NÃO PODE FAZER ─────────────────────────
 *
 * ❌ NÃO compacta a conversa em curso. O MCP não expõe nenhuma via para um
 *    servidor alterar o histórico do host — nem `/compact`, nem `/clear`, nem
 *    truncar mensagens. Um conector que prometesse isso estaria a mentir.
 *
 * ✅ O que faz: mantém, em disco, um ESTADO VIVO da sessão — o que foi feito, o
 *    que ficou por fazer, que decisões foram tomadas, que ficheiros mudaram — e
 *    devolve-o como um bloco pronto a colar. A conversa seguinte começa com o
 *    contexto todo em ~2 mil tokens em vez de arrastar 462 mil por turno.
 *
 * É o "compact e clear com segurança" que ele descreveu: a conversa nova nasce
 * informada em vez de nascer amnésica.
 *
 * ── QUEM ESCREVE ISTO, DE FACTO ───────────────────────────────────────────
 *
 * ⚠️ Uma versão anterior deste cabeçalho dizia "o estado é escrito pelo MODELO
 * LOCAL, a $0". Não é verdade, e num projecto cuja promessa é não fabricar,
 * mentir sobre si próprio é a pior classe de bug. `registar()` grava os arrays
 * que QUEM CHAMA lhe passa — e quem chama é o assistente da conversa. A GPU
 * local não participa nesta função.
 *
 * O que é verdade: **guardar e devolver o estado custa $0** — é I/O de disco,
 * sem inferência nenhuma. A poupança não vem de quem escreve o resumo; vem de
 * a conversa seguinte nascer com 2 mil tokens em vez de arrastar 462 mil.
 *
 * ⚠️ E não há registo automático: nada regista sozinho ao fim de cada turno.
 * Só existe estado se alguém chamar `mooter_setup({sessao:"registar"})`. Um
 * `turnos_registados: 1` ao fim de um dia inteiro quer dizer exactamente isso.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MOOTER_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const DIR = path.join(MOOTER_DIR, 'sessoes');

/** Tudo o que o estado de uma sessão pode conter. Nada fora desta forma entra. */
function vazio(id) {
  return {
    id: id || 'actual',
    aberta_em: new Date().toISOString(),
    actualizada_em: null,
    projecto: null,
    objectivo: null,
    feito: [],            // o que ficou concluído, com a prova
    por_fazer: [],        // o que ficou explicitamente por fazer
    decisoes: [],         // escolhas com consequência, e o porquê
    bloqueios: [],        // o que depende de outra pessoa
    ficheiros: [],        // o que mudou no disco
    proximo: null,        // a resposta ao "e agora?"
    turnos_registados: 0,
  };
}

function ficheiro(id) { return path.join(DIR, (String(id || 'actual').replace(/[^\w.-]/g, '_')) + '.json'); }

function ler(id) {
  try { return JSON.parse(fs.readFileSync(ficheiro(id), 'utf8')); } catch { return null; }
}

function gravar(e) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(ficheiro(e.id), JSON.stringify(e, null, 2));
    return true;
  } catch { return false; }
}

/**
 * Acrescentar sem repetir e sem crescer para sempre.
 *
 * ⚠️ O corte é REAL e tem de ser contado. O rodapé do `retomar` diz "o que não
 * está acima não foi registado" — mas uma linha cortada aqui FOI registada e
 * depois deitada fora. A diferença importa: "nunca soubeste" leva o utilizador
 * a registar de novo; "sabias e perdeste" leva-o a procurar no ledger.
 */
function juntar(lista, novos, max, contador) {
  const out = Array.isArray(lista) ? lista.slice() : [];
  for (const n of (Array.isArray(novos) ? novos : [novos]).filter(Boolean)) {
    const t = String(n).trim().slice(0, 300);
    if (!t) continue;
    // ⚠️ um estado que repete a mesma linha vinte vezes deixa de ser um resumo
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  const tecto = max || 25;
  if (out.length > tecto && contador) contador.n += out.length - tecto;
  // fica o mais recente: um estado é uma fotografia do presente, não um diário
  return out.slice(-tecto);
}

/**
 * Registar o que aconteceu neste bloco de trabalho.
 * Chamado depois de cada entrega — não a meio.
 */
function registar(a) {
  const id = a.id || 'actual';
  const e = ler(id) || vazio(id);
  if (a.projecto) e.projecto = String(a.projecto).slice(0, 120);
  if (a.objectivo) e.objectivo = String(a.objectivo).slice(0, 400);
  const cortadas = { n: (e.linhas_cortadas || 0) };
  e.feito = juntar(e.feito, a.feito, 30, cortadas);
  e.por_fazer = juntar(e.por_fazer, a.por_fazer, 20, cortadas);
  e.decisoes = juntar(e.decisoes, a.decisoes, 20, cortadas);
  e.bloqueios = juntar(e.bloqueios, a.bloqueios, 10, cortadas);
  e.ficheiros = juntar(e.ficheiros, a.ficheiros, 40, cortadas);
  e.linhas_cortadas = cortadas.n;
  if (a.proximo) e.proximo = String(a.proximo).slice(0, 400);
  // uma coisa feita deixa de estar por fazer — senão a lista mente
  if (Array.isArray(a.feito) && a.feito.length) {
    const feitoLower = a.feito.map((x) => String(x).toLowerCase());
    e.por_fazer = e.por_fazer.filter((p) => !feitoLower.some((f) => f.includes(p.toLowerCase().slice(0, 40))));
  }
  e.turnos_registados = (e.turnos_registados || 0) + 1;
  e.actualizada_em = new Date().toISOString();
  const ok = gravar(e);
  return { ok, estado: e, ficheiro: ficheiro(id) };
}

/**
 * O bloco para colar numa conversa nova.
 *
 * ⚠️ Isto substitui centenas de milhares de tokens relidos por uns milhares
 * escritos uma vez. Mas só vale se for HONESTO: o que não está aqui, perdeu-se.
 * Por isso o cabeçalho diz-o, em vez de fingir que o resumo é a conversa.
 */
function retomar(id, opts) {
  const e = ler(id || 'actual');
  if (!e) {
    return {
      ok: false,
      porque: 'não há estado guardado para esta sessão — nada foi registado ainda',
      faz_assim: ['mooter_setup({sessao:"registar", feito:[...], proximo:"..."}) no fim de cada bloco de trabalho'],
    };
  }
  const l = [];
  l.push('## Retomar: ' + (e.projecto || 'sessão') + (e.objectivo ? ' — ' + e.objectivo : ''));
  l.push('');
  l.push('_Estado mantido pelo Mooter na GPU local, a $0. ' + e.turnos_registados
    + ' bloco(s) registados, actualizado ' + (e.actualizada_em || 'n/d') + '._');
  l.push('');
  const sec = (titulo, arr, marca) => {
    if (!arr || !arr.length) return;
    l.push('**' + titulo + '**');
    l.push('');
    for (const x of arr) l.push(marca + ' ' + x);
    l.push('');
  };
  sec('Feito', e.feito, '✅');
  sec('Por fazer', e.por_fazer, '🔜');
  sec('Decisões tomadas', e.decisoes, '·');
  sec('Bloqueado em ti', e.bloqueios, '⚠️');
  if (e.ficheiros && e.ficheiros.length) {
    l.push('**Ficheiros tocados:** ' + e.ficheiros.slice(-15).join(', '));
    l.push('');
  }
  if (e.proximo) { l.push('**E agora:** ' + e.proximo); l.push(''); }
  l.push('---');
  l.push('⚠️ Isto é um RESUMO, não a conversa. O que não está acima não foi registado — se precisares de um detalhe que falte, diz e eu procuro no ledger ou no repo.');
  // ⚠️ um estado que cortou linhas e não o diz está a mentir por omissão:
  // "nunca foi registado" e "foi registado e deitado fora" mandam o utilizador
  // para sítios diferentes.
  if (e.linhas_cortadas > 0) {
    l.push('⚠️ ' + e.linhas_cortadas + ' linha(s) mais antigas foram registadas e depois cortadas pelo tecto de cada secção — existem no ledger, não aqui.');
  }
  if ((e.turnos_registados || 0) <= 1) {
    l.push('ℹ️ Só ' + (e.turnos_registados || 0) + ' bloco registado: isto é uma fotografia de um momento, não o histórico da sessão. O registo não é automático.');
  }

  const texto = l.join('\n');
  return {
    ok: true,
    texto,
    // uma estimativa grosseira, e declarada como tal: ~4 caracteres por token
    tokens_aprox: Math.round(texto.length / 4),
    estado: opts && opts.completo ? e : undefined,
  };
}

/**
 * Quanto está a custar ARRASTAR esta conversa, e quando vale a pena recomeçar.
 *
 * ⚠️ Os pesos relativos (input 1×, escrita de cache 1,25×, leitura 0,1×,
 * output 5×) são os da tabela pública da Anthropic para caching. Não são o teu
 * preço — são a PROPORÇÃO entre componentes, que é o que interessa para decidir.
 */
function custoDeArrastar(medida) {
  if (!medida || !medida.disponivel || !medida.longa) {
    return { disponivel: false, porque: 'sem leitura de sessões locais' };
  }
  const m = medida.longa;
  const partes = {
    releitura: (m.cache_lido || 0) * 0.1,
    regravacao: (m.cache_criado || 0) * 1.25,
    resposta: (m.saidas || 0) * 5,
    pergunta: (m.entradas || 0) * 1,
  };
  const total = Object.values(partes).reduce((s, x) => s + x, 0);
  if (!total) return { disponivel: false, porque: 'sem tokens medidos na janela' };
  const pct = {};
  for (const [k, v] of Object.entries(partes)) pct[k] = Number(((v / total) * 100).toFixed(1));
  const dominante = Object.entries(pct).sort((a, b) => b[1] - a[1])[0];
  return {
    disponivel: true,
    percentagens: pct,
    dominante: dominante[0],
    veredicto: dominante[0] === 'releitura'
      ? 'a maior fatia da tua quota é a conversa a reler-se a si própria — recomeçar com um resumo é o corte mais fundo que existe'
      : (dominante[0] === 'resposta'
        ? 'a maior fatia é o texto gerado — respostas mais curtas cortam mais do que recomeçar'
        : 'a maior fatia é a regravação do prefixo — muda menos o início da conversa (ficheiros anexados, instruções)'),
    base: 'ESTIMATIVA de proporções: input 1×, escrita de cache 1,25×, leitura de cache 0,1×, output 5×. '
      + 'São os rácios públicos do caching da Anthropic, não o teu preço.',
    estimativa: true,
  };
}

/** Listar as sessões guardadas, da mais recente para a mais antiga. */
function listar() {
  let ents;
  try { ents = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of ents) {
    try {
      const e = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      out.push({ id: e.id, projecto: e.projecto, actualizada_em: e.actualizada_em, turnos: e.turnos_registados,
        feito: (e.feito || []).length, por_fazer: (e.por_fazer || []).length });
    } catch { /* um estado ilegível não é um estado */ }
  }
  out.sort((a, b) => String(b.actualizada_em || '').localeCompare(String(a.actualizada_em || '')));
  return out;
}

function esquecer(id) {
  // ⚠️ apagar é um gate humano em todo o resto deste conector; aqui é o próprio
  // utilizador a pedir para largar um estado que já não serve.
  try { fs.unlinkSync(ficheiro(id || 'actual')); return { ok: true }; }
  catch (e) { return { ok: false, erro: (e && e.code) || 'não existia' }; }
}

module.exports = { registar, retomar, listar, esquecer, ler, custoDeArrastar, vazio, DIR };
