#!/usr/bin/env node
/* moo-deck-build — o deck e o PDF do Mooter, GERADOS do registo. Nunca editados à mão.
 *
 * A REGRA QUE TRAVA TUDO
 * ----------------------
 * O conteúdo dos dois artefactos vem SÓ de
 *   $VAULT_PATH/40-strategy/2026-08-25-pitch-registro-metricas-medidas.md
 * Cada cifra entra pelo componente de número honesto — `cifra()` — que EXIGE
 * `fonte` e `janela`. Sem qualquer uma delas a função ATIRA e o build morre.
 * Para editar um deck: muda-se o registo, regenera-se. NUNCA se edita o slide.
 *
 * PORQUE O NEGRITO DO MARKDOWN É DEITADO FORA
 * -------------------------------------------
 * O registo escreve `**760 pass · 0 fail**` num positivo e `**2 mantidos / 44
 * decisões**` num negativo — mas nem sempre. Se o `**` chegasse ao HTML como
 * `<b>`, a tipografia de uma cifra passaria a depender de quem a escreveu: um
 * negativo redigido sem asteriscos leria-se mais fraco que um positivo com
 * eles. A regra «negativos na mesma tipografia dos positivos» tem de ser
 * verdadeira POR CONSTRUÇÃO, não por revisão — por isso `limpo()` remove o
 * ênfase do autor e a tipografia é decidida só pelo componente.
 *
 * GRAU DA FONTE — o que este ficheiro NÃO faz
 * -------------------------------------------
 * O parser não inventa fontes. Cada cifra herda, por esta ordem declarada:
 *   1. `directa` — a coluna «Fonte» da própria linha do registo
 *   2. `secao`   — o `fontes:` / `fonte:` do cabeçalho da entrada
 *   3. `registo` — último recurso: o ficheiro do registo + a âncora da entrada
 * O grau `registo` é PROCEDÊNCIA (dá para ir lá ver), não é PROVA de medição —
 * por isso vai impresso na margem do slide e contado no relatório, e
 * `--estrito` faz o build falhar enquanto existir um único.
 * Isto foi medido: a entrada «Delta · 25/08 23:3xZ · CC headless mac-mini» não
 * declara `fontes:` no cabeçalho e a sua tabela de negativos só tem «Leitura».
 * Herdar em silêncio seria a guarda a dobrar-se; declarar o grau é a guarda a
 * dizer exactamente onde é fraca.
 *
 * Zero dependências, zero rede, zero LLM. Node puro a emitir HTML.
 *
 *   node design/deck/moo-deck-build.mjs             # gera deck + PDF
 *   node design/deck/moo-deck-build.mjs --estrito   # sai 1 se houver fonte grau `registo`
 *   node design/deck/moo-deck-build.mjs --json      # só o relatório
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const DESIGN = resolve(AQUI, '..');
export const SAIDA = join(AQUI, 'out');
export const CSS_GRAMATICA = join(DESIGN, 'tokens/moo-ui.css');
export const REGISTO_NOME = '2026-08-25-pitch-registro-metricas-medidas.md';

/* quantas cifras cabem antes de um slide deixar de ter UMA ideia */
const MAX_POR_SLIDE = 4;
const MAX_POR_SECCAO_PDF = 8;

// ── erros com nome: quem apanha o build sabe o que partiu ────────────────
export class RegistoAusente extends Error { constructor(m) { super(m); this.name = 'RegistoAusente'; } }
export class MetricaSemProcedencia extends Error { constructor(m) { super(m); this.name = 'MetricaSemProcedencia'; } }
export class GramaticaViolada extends Error { constructor(m) { super(m); this.name = 'GramaticaViolada'; } }

// ── localizar o registo ──────────────────────────────────────────────────
export function caminhoDoRegisto(env = process.env) {
  if (env.MOO_REGISTO) return resolve(env.MOO_REGISTO);
  const vault = env.VAULT_PATH;
  if (!vault) {
    throw new RegistoAusente(
      'VAULT_PATH não está definido e MOO_REGISTO não foi passado. ' +
      'O deck só se gera a partir do registo — não há conteúdo de reserva.');
  }
  return join(vault, '40-strategy', REGISTO_NOME);
}

// ── texto ────────────────────────────────────────────────────────────────
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Tira o ênfase do autor. Ver o cabeçalho: a tipografia é do componente. */
export function limpo(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapa e devolve o `código` como `<code>` — a única marcação inline aceite. */
function inline(s) {
  return esc(limpo(s)).replace(/`([^`]+)`/g, '<code class="moo-cod">$1</code>');
}

const slug = (s) => limpo(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

/* Nome curto de uma entrada: o que vem antes do primeiro parêntese ou travessão.
   `slice(0,40)` cru dava «Snapshot 2026-08-25 (medido 11:00–12:15Z (cont.)» —
   um parêntese aberto que nunca fecha, na margem, em caixa-alta. */
export function curto(s, n = 44) {
  const base = limpo(s).split(/\s[—–]\s|\s\(/)[0].trim() || limpo(s);
  return base.length > n ? base.slice(0, n - 1).trimEnd() + '…' : base;
}

// ── janela e fonte, extraídas do cabeçalho da entrada ────────────────────
/* A hora só é procurada ANTES do `—` ou do `fontes:`. Sem isso o cabeçalho
   «Delta 2026-08-25 (dia) — fontes: painel 17:18 local» dava a janela «17:18»,
   que é a hora do painel citado como FONTE, não a janela da medição.
   O corte EXIGE espaços à volta do travessão: a 1ª versão cortava em `–` nu e
   partia `11:00–12:15Z` ao meio, publicando a janela «2026-08-25 11:00» — um
   intervalo de 75 minutos a passar por um instante. Um travessão colado entre
   dígitos é intervalo; separador de frase leva espaços. */
export function janelaDe(titulo, anoBase) {
  const cabeca = String(titulo).split(/\s[—–]\s|,?\s*fontes?:/i)[0];
  let data = null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(cabeca);
  if (iso) data = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else {
    const br = /\b(\d{2})\/(\d{2})\b/.exec(cabeca);
    if (br && anoBase) data = `${anoBase}-${br[2]}-${br[1]}`;
  }
  if (!data) return null;
  const h = /(\d{1,2}:[0-9x]{2}(?:\s*[–—-]\s*\d{1,2}:[0-9x]{2})?\s*Z?)/.exec(cabeca);
  const hora = h ? h[1].replace(/\s+/g, '') : null;
  return { data, hora, texto: hora ? `${data} ${hora}` : data };
}

export function fontesDe(titulo) {
  const m = /fontes?:\s*(.+)$/i.exec(String(titulo));
  if (!m) return null;
  return limpo(m[1]).replace(/\)\s*$/, '').trim() || null;
}

const SINAL_NEG = /negativ|contradi|⚠|refutad|bloquei/i;
/* A flag `i` não é cosmética: sem ela `### Positivos medidos` — como está
   escrito no registo real, com P maiúsculo — caía em `neutro`, e a folha
   inteira de positivos ficava rotulada «medido» em vez de «positivo medido».
   Apanhado pelo teste «o sinal vem do registo», nunca pela leitura. */
const SINAL_POS = /positiv|🔥/i;
function sinalDe(titulo, herdado = 'neutro') {
  const t = String(titulo);
  if (SINAL_NEG.test(t)) return 'negativo';
  if (SINAL_POS.test(t)) return 'positivo';
  return herdado;
}

// ── parser do registo ────────────────────────────────────────────────────
export function parseRegisto(txt, { origem = REGISTO_NOME } = {}) {
  const linhas = String(txt).replace(/\r\n/g, '\n').split('\n');
  const meta = {};
  let i = 0;
  if (linhas[0] === '---') {
    i = 1;
    for (; i < linhas.length && linhas[i] !== '---'; i++) {
      const m = /^([a-z_]+):\s*(.*)$/i.exec(linhas[i]);
      if (m) meta[m[1]] = m[2].trim();
    }
    i++;
  }
  const anoBase = (meta.created || '').slice(0, 4) || null;

  const capitulos = [];
  let cap = null, sub = null, titulo = null;
  const semProcedencia = [];
  let n = 0;

  const nova = (base) => {
    n += 1;
    const fonteDirecta = base.fonteDirecta;
    const fonteSeccao = (sub && sub.fontes) || (cap && cap.fontes) || null;
    let fonte;
    if (fonteDirecta) fonte = { texto: fonteDirecta, grau: 'directa' };
    else if (fonteSeccao) fonte = { texto: fonteSeccao, grau: 'secao' };
    else fonte = { texto: `${origem} § ${limpo(cap ? cap.titulo : '?')}`, grau: 'registo' };
    const m = {
      id: `m${String(n).padStart(3, '0')}`,
      rotulo: base.rotulo, valor: base.valor, texto: base.texto || null,
      escopo: base.escopo || null, nota: base.nota || null,
      sinal: base.sinal, fonte, janela: cap ? cap.janela : null,
      sub: sub ? sub.titulo : null,
      origem: { ficheiro: origem, linha: base.linha },
    };
    if (!m.janela) semProcedencia.push({ ...m, falta: 'janela' });
    return m;
  };

  for (; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^#\s+/.test(l)) { titulo = limpo(l.replace(/^#\s+/, '')); continue; }
    if (/^##\s+/.test(l)) {
      const t = l.replace(/^##\s+/, '');
      cap = {
        titulo: limpo(t), ancora: slug(t), linha: i + 1,
        janela: janelaDe(t, anoBase), fontes: fontesDe(t),
        sinal: sinalDe(t), metricas: [], prosa: [],
      };
      sub = null;
      capitulos.push(cap);
      continue;
    }
    if (/^###\s+/.test(l)) {
      if (!cap) continue;
      const t = l.replace(/^###\s+/, '');
      sub = { titulo: limpo(t), fontes: fontesDe(t), sinal: sinalDe(t, cap.sinal), linha: i + 1 };
      continue;
    }
    if (!cap) continue;

    // tabela
    if (/^\s*\|/.test(l)) {
      const bloco = [];
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) { bloco.push({ txt: linhas[i], linha: i + 1 }); i++; }
      i--;
      const celulas = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const cab = celulas(bloco[0].txt);
      const corpo = bloco.filter((b) => !/^\s*\|[\s:|-]+\|?\s*$/.test(b.txt)).slice(1);
      const iFonte = cab.findIndex((c) => /^fontes?$/i.test(c));
      const iNota = cab.findIndex((c) => /^(leitura|nota)$/i.test(c));
      const iVal = cab.map((c, k) => k).filter((k) => k !== 0 && k !== iFonte && k !== iNota);
      for (const linhaT of corpo) {
        const c = celulas(linhaT.txt);
        if (!c[0]) continue;
        const rot = limpo(c[0]);
        const sig = sinalDe(rot, sub ? sub.sinal : cap.sinal);
        for (const k of iVal) {
          if (!c[k]) continue;
          cap.metricas.push(nova({
            rotulo: rot, valor: limpo(c[k]),
            escopo: iVal.length > 1 ? limpo(cab[k]) : null,
            nota: iNota >= 0 ? limpo(c[iNota] || '') || null : null,
            fonteDirecta: iFonte >= 0 ? limpo(c[iFonte] || '') || null : null,
            sinal: sig, linha: linhaT.linha,
          }));
        }
      }
      continue;
    }

    // lista
    if (/^\s*[-*]\s+/.test(l)) {
      const bruto = l.replace(/^\s*[-*]\s+/, '');
      const t = limpo(bruto);
      const sig = sinalDe(t, sub ? sub.sinal : cap.sinal);
      const semMarca = t.replace(/^(?:⚠️|🔥|✅|❌)\s*/, '').replace(/^NEGATIVO\s*[—–-]\s*/i, '');
      const dp = semMarca.indexOf(': ');
      const rot = dp > 0 && dp <= 64 ? semMarca.slice(0, dp) : semMarca.split(/\s+/).slice(0, 5).join(' ') + '…';
      const val = dp > 0 && dp <= 64 ? semMarca.slice(dp + 2) : semMarca;
      cap.metricas.push(nova({ rotulo: rot, valor: val, texto: t, sinal: sig, linha: i + 1 }));
      continue;
    }

    // prosa
    const p = limpo(l);
    if (p) cap.prosa.push({ texto: p, linha: i + 1, sinal: sub ? sub.sinal : cap.sinal, sub: sub ? sub.titulo : null });
  }

  return { titulo, meta, origem, capitulos, semProcedencia };
}

// ── O COMPONENTE DE NÚMERO HONESTO ───────────────────────────────────────
/* Uma cifra sem fonte, ou sem janela, não sai daqui. Atira. É o único caminho
   por onde um número entra no deck ou no PDF — por isso a percentagem de
   cifras com procedência é 100% por construção, não por auditoria.
   O sinal NÃO escolhe tipografia: vai em `data-sinal`, e
   `assertNeutralidadeTipografica()` recusa qualquer CSS que o use para mudar
   fonte, peso ou cor. */
export function cifra(m, { extremo = false } = {}) {
  const onde = m && m.origem ? `${m.origem.ficheiro}:${m.origem.linha}` : 'origem desconhecida';
  if (!m || !m.fonte || !limpo(m.fonte.texto || '')) {
    throw new MetricaSemProcedencia(
      `cifra sem FONTE — «${m && m.rotulo ? limpo(m.rotulo) : '?'}» (${onde}). ` +
      'Um número sem fonte não se publica: acrescenta a fonte no registo e regenera.');
  }
  if (!m.janela || !limpo(m.janela.texto || '')) {
    throw new MetricaSemProcedencia(
      `cifra sem JANELA — «${limpo(m.rotulo)}» (${onde}). ` +
      'Sem janela o número não diz quando foi medido: data no cabeçalho da entrada do registo.');
  }
  const valor = String(m.valor || '').trim();
  if (!valor) throw new MetricaSemProcedencia(`cifra sem VALOR — «${limpo(m.rotulo)}» (${onde}).`);
  const esc_ = (m.escopo ? `<span class="moo-cifra-e">${inline(m.escopo)}</span>` : '');
  /* A escala do extremo depende do COMPRIMENTO do valor, nunca do sinal:
     «0 de 24» a 96px e «L1 ativo (dreno auditado, 25/tique…)» a 96px seriam a
     mesma decisão a produzir uma folha limpa e uma folha rebentada. */
  const escala = valor.length <= 18 ? '1' : valor.length <= 46 ? '2' : '3';
  return `<span class="moo-cifra" data-sinal="${esc(m.sinal || 'neutro')}"` +
    ` data-grau="${esc(m.fonte.grau)}" data-escala="${escala}"${extremo ? ' data-extremo="true"' : ''}>` +
    `<span class="moo-cifra-r">${inline(m.rotulo)}</span>` +
    `<span class="moo-cifra-v">${inline(valor)}</span>${esc_}` +
    (m.nota ? `<span class="moo-cifra-n">${inline(m.nota)}</span>` : '') +
    `<span class="moo-cifra-p">fonte · ${inline(m.fonte.texto)}` +
    `${m.fonte.grau === 'registo' ? ' <em class="moo-grau">[grau: registo]</em>' : ''}` +
    ` &nbsp;·&nbsp; janela · ${esc(m.janela.texto)}</span></span>`;
}

/** Só conta como cifra o que tem dígito ou é um `n/d` declarado. */
export const eCifra = (m) => /\d/.test(String(m.valor || '')) || /\bn\/d\b/i.test(String(m.valor || ''));

// ── GUARDAS DA GRAMÁTICA (cada uma com teste que planta o defeito) ───────
export function assertNeutralidadeTipografica(css) {
  const maus = [];
  for (const m of String(css).matchAll(/([^{}]*\[data-sinal[^\]]*\][^{}]*)\{([^}]*)\}/g)) {
    if (/(^|[;\s])(font|font-[a-z-]+|color|-webkit-text-fill-color|letter-spacing|text-transform|opacity|transform)\s*:/i.test(m[2]))
      maus.push(limpo(m[1]));
  }
  if (maus.length) {
    throw new GramaticaViolada(
      `o sinal está a escolher tipografia em ${maus.length} regra(s): ${maus.join(' · ')}. ` +
      'Negativos usam a MESMA tipografia dos positivos — a única diferença é o sinal.');
  }
  return true;
}

export function assertSemCaixas(css) {
  const maus = [];
  for (const m of String(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, sel, corpo] = m;
    if (/border-radius\s*:\s*(?!0[a-z%]*\s*[;}]|0\s*$)/i.test(corpo)) maus.push(`${limpo(sel)} · border-radius`);
    if (/(^|[;\s])box-shadow\s*:\s*(?!none)/i.test(corpo)) maus.push(`${limpo(sel)} · box-shadow`);
    if (/(^|[;\s])border\s*:\s*(?!none|0)/i.test(corpo)) maus.push(`${limpo(sel)} · border (4 lados)`);
  }
  if (maus.length) {
    throw new GramaticaViolada(
      `${maus.length} caixa(s) no CSS gerado: ${maus.join(' · ')}. ` +
      'A hairline de 1px separa secções. NÃO HÁ CAIXAS.');
  }
  return true;
}

const ROSA_PERMITIDO = /^(\.moo-q|\.moo-cota|\.moo-cota-t|\.moo-cota-svg|\.moo-cta|\.moo-mm|:focus-visible)/;
export function assertRosaContida(css) {
  const maus = [];
  for (const m of String(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/--moo-accent/.test(m[2])) continue;
    for (const s of m[1].split(',')) {
      const sel = limpo(s);
      if (!ROSA_PERMITIDO.test(sel)) maus.push(sel);
    }
  }
  if (maus.length) {
    throw new GramaticaViolada(
      `rosa fora do sítio em ${maus.length} selector(es): ${maus.join(' · ')}. ` +
      'Rosa só no ? do wordmark, nas cotas e no CTA.');
  }
  return true;
}

export function assertMovimentoDaFamilia(css) {
  const novos = [...String(css).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  const familia = new Set(['moo-ent', 'moo-traco', 'moo-pulso']);
  const fora = novos.filter((k) => !familia.has(k));
  if (fora.length) {
    throw new GramaticaViolada(
      `${fora.length} curva(s) fora da família: ${fora.join(', ')}. ` +
      'As quatro curvas da família e mais nenhuma.');
  }
  return true;
}

/* MEDIDO a 2026-08-27, no browser, contra o deck real.
   O `moo-ui.css` é gerado por outro processo. Abri o deck a meio de uma
   reescrita desse ficheiro: o `:root` tinha nesse instante só os tokens
   `--moo-tinta-*`, e `var(--moo-font-sans)` ficou por resolver. Um shorthand
   `font:` com uma variável vazia é INVÁLIDO — o browser deita a declaração
   inteira fora e cai no default. O deck renderizou o wordmark de 200px a 16px
   Times New Roman, sem um erro, sem um aviso, com o build a dizer «gerado».
   Um deck que perde a tipografia toda e continua a imprimir «ok» é a mesma
   família do gate que estava verde e não estava a olhar. Daqui em diante o
   build lê a gramática e recusa-se a emitir se ela não trouxer o que ele usa. */
export function assertTokensDaGramatica(gram, ...usos) {
  const bloco = (txt, re) => { const m = re.exec(String(txt)); return m ? m[1] : ''; };
  const alcanceDe = (txt) => bloco(txt, /:root\s*\{([\s\S]*?)\}/)
    + bloco(txt, /\[data-moo-theme="papel"\]\s*\{([\s\S]*?)\}/);
  const def = new Map();
  for (const fonte of [String(gram), ...usos.map(String)]) {
    for (const m of alcanceDe(fonte).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]*);/g)) def.set(m[1], m[2]);
  }
  const usados = new Set(usos.flatMap((c) =>
    [...String(c).matchAll(/var\((--moo-[a-z0-9-]+)/g)].map((m) => m[1])));

  /* Um token que existe mas não RESOLVE é tão inútil como um token em falta.
     MEDIDO a 2026-08-27: a gramática passou a dizer
        --moo-font-sans: var(--font-sans), 'Space Grotesk', …
     e `--font-sans` é o token que o `next/font` injecta na landing. Fora dela
     não existe e não tem fallback: `var()` por resolver torna a propriedade
     custom inválida no ponto de uso, o shorthand `font:` que a lê cai inteiro,
     e o deck sai em Times New Roman 16px — o build a dizer «gerado», a página
     sem uma única queixa. Seguir a cadeia é o que separa «o token está lá» de
     «o token funciona». */
  const porResolver = [];
  const segue = (t, raiz, visto = new Set()) => {
    if (visto.has(t)) return; visto.add(t);
    const v = def.get(t);
    if (v === undefined) { porResolver.push({ raiz, elo: t, tipo: 'indefinido' }); return; }
    for (const m of v.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,?)/g)) {
      if (m[2] === ',') continue;            // tem fallback próprio: resolve na mesma
      segue(m[1], raiz, visto);
    }
  };
  for (const t of usados) segue(t, t);

  if (porResolver.length) {
    const lista = porResolver.map((p) => (p.raiz === p.elo ? p.raiz : `${p.raiz} → ${p.elo}`));
    throw new GramaticaViolada(
      `${porResolver.length} token(s) que o deck usa não resolvem: ${lista.join(', ')}. ` +
      'Um `font:` com var() por resolver é uma declaração inválida — o deck sairia em ' +
      'Times New Roman sem uma única queixa. Define a raiz em falta no CSS do deck, ' +
      'ou regenera `design/tokens/moo-ui.css`.');
  }
  return usados.size;
}

/* Mesma família: a grelha do deck é emprestada da gramática. Se `.moo-secao`
   for renomeada, o slide perde as colunas em silêncio e continua a «gerar». */
export const CLASSES_EMPRESTADAS = [
  'moo-mm', 'moo-folha', 'moo-secao', 'moo-marg', 'moo-cartucho',
  'moo-cota', 'moo-cota-t', 'moo-ent', 'moo-traco',
];
export function assertClassesDaGramatica(gram) {
  const falta = CLASSES_EMPRESTADAS.filter((c) => !new RegExp(`\\.${c}\\b`).test(String(gram)));
  if (falta.length) {
    throw new GramaticaViolada(
      `a gramática já não tem ${falta.length} classe(s) que o deck empresta: ${falta.join(', ')}. ` +
      'Sem elas o slide perde a grelha e o cartucho, e o build não daria por isso.');
  }
  return CLASSES_EMPRESTADAS.length;
}

function blocos(html, tag, classe) {
  const out = [];
  const re = new RegExp(`<${tag}[^>]*class="[^"]*\\b${classe}\\b`, 'g');
  for (const m of String(html).matchAll(re)) {
    const fim = String(html).indexOf(`</${tag}>`, m.index);
    out.push(String(html).slice(m.index, fim === -1 ? undefined : fim));
  }
  return out;
}

export function assertUmExtremoPorFolha(html, { tag = 'article', classe = 'moo-slide' } = {}) {
  const folhas = blocos(html, tag, classe);
  if (!folhas.length) throw new GramaticaViolada(`nenhuma folha .${classe} encontrada — o build não produziu nada.`);
  const maus = [];
  folhas.forEach((f, k) => {
    const n = (f.match(/data-extremo="true"/g) || []).length;
    if (n !== 1) maus.push(`folha ${k + 1}: ${n} extremos`);
  });
  if (maus.length) {
    throw new GramaticaViolada(
      `${maus.length} folha(s) sem exactamente UM momento extremo: ${maus.join(' · ')}. ` +
      'Um slide, uma ideia, UM extremo.');
  }
  return folhas.length;
}

// ── HTML: a gramática, importada de moo-ui.css ───────────────────────────
function gramatica() {
  try { return readFileSync(CSS_GRAMATICA, 'utf8'); }
  catch (e) { throw new GramaticaViolada(`não consegui ler a gramática em ${CSS_GRAMATICA}: ${e.message}`); }
}

/* CSS do deck: só o que a gramática não dá. Passa pelas quatro guardas. */
/* A gramática espera `--font-sans` / `--font-mono` / `--font-caveat` — os
   tokens que o `next/font` injecta NA LANDING. O deck é um documento avulso
   que se abre com duplo clique e imprime sem servidor: ninguém lhos injecta.
   Declará-los aqui não é editar a gramática, é o consumidor a satisfazer a
   dependência que ela declara. Sem rede: se a família de marca não estiver
   instalada, a cascata do próprio token cai na stack de sistema — que é o
   comportamento correcto, e não o Times New Roman de um var() por resolver. */
export const CSS_RAIZES = `
:root{--font-sans:'Space Grotesk';--font-mono:'JetBrains Mono';--font-caveat:'Caveat';}
`;

export const CSS_DECK = CSS_RAIZES + `
html,body{margin:0;background:var(--moo-bg);color:var(--moo-text);
  font-family:var(--moo-font-sans);-webkit-font-smoothing:antialiased}
.moo-palco{--z:min(1, calc(100vw / 1920));width:100%}
.moo-slide{position:relative;width:1920px;height:1080px;overflow:hidden;
  transform:scale(var(--z));transform-origin:top left}
.moo-caixilho{width:calc(1920px * var(--z));height:calc(1080px * var(--z))}
.moo-slide .moo-folha{padding:0 128px;height:100%;display:flex;flex-direction:column}
.moo-slide .moo-cartucho{padding-top:72px}
.moo-slide .moo-secao{flex:1;align-content:center;border-top:none;padding:0}
.moo-slide .moo-secao::before{content:"";display:block;grid-column:1/-1;
  border-top:1px solid var(--moo-line-strong);margin-bottom:48px}
.moo-folio{position:absolute;right:128px;bottom:64px;font:500 10px/1.2 var(--moo-font-mono);
  letter-spacing:.24em;text-transform:uppercase;color:var(--moo-faint)}
.moo-marg{position:relative}
.moo-cota-svg{position:absolute;right:0;bottom:-64px;width:216px;height:28px;overflow:visible}
.moo-corpo{min-width:0}
.moo-cifra{display:block;margin:0 0 40px}
.moo-cifra:last-child{margin-bottom:0}
.moo-cifra-r{display:block;font:500 11px/1.2 var(--moo-font-mono);letter-spacing:.16em;
  text-transform:uppercase;color:var(--moo-muted);margin-bottom:12px}
.moo-cifra-v{display:block;font:700 30px/1.2 var(--moo-font-mono);letter-spacing:-.03em;
  font-variant-numeric:tabular-nums;color:var(--moo-text);overflow-wrap:anywhere}
.moo-cifra[data-extremo="true"][data-escala="1"] .moo-cifra-v{font-size:132px;line-height:1;letter-spacing:-.05em}
.moo-cifra[data-extremo="true"][data-escala="2"] .moo-cifra-v{font-size:72px;line-height:1.04;letter-spacing:-.045em}
.moo-cifra[data-extremo="true"][data-escala="3"] .moo-cifra-v{font-size:46px;line-height:1.14;letter-spacing:-.035em}
.moo-cifra-e{display:block;font:500 10px/1.2 var(--moo-font-mono);letter-spacing:.14em;
  text-transform:uppercase;color:var(--moo-faint);margin-top:10px}
.moo-cifra-n{display:block;font:400 17px/1.55 var(--moo-font-sans);color:var(--moo-text-2);
  margin-top:14px;max-width:62ch}
.moo-cifra-p{display:block;font:400 10px/1.7 var(--moo-font-mono);letter-spacing:.06em;
  color:var(--moo-faint);margin-top:14px;max-width:80ch}
.moo-grau{font-style:normal}
.moo-cod{font-family:var(--moo-font-mono);font-size:.92em}
.moo-frase{font:700 clamp(32px,3.6vw,52px)/1.12 var(--moo-font-sans);letter-spacing:-.035em;
  margin:0;max-width:22ch}
.moo-prosa{font:400 19px/1.62 var(--moo-font-sans);color:var(--moo-text-2);
  margin:28px 0 0;max-width:64ch}
.moo-q{color:var(--moo-accent)}
.moo-wordmark{font:700 200px/0.9 var(--moo-font-sans);letter-spacing:-.06em;margin:0}
.moo-cta{color:var(--moo-accent);font:500 12px/1.4 var(--moo-font-mono);letter-spacing:.2em;
  text-transform:uppercase}
@media print{
  @page{size:1920px 1080px;margin:0}
  .moo-caixilho{width:auto;height:auto}
  .moo-slide{transform:none;break-after:page;page-break-after:always}
  .moo-ent{opacity:1;animation:none}
}
`;

export const CSS_PDF = CSS_RAIZES + `
html,body{margin:0;background:var(--moo-bg-2);color:var(--moo-text);
  font-family:var(--moo-font-sans);-webkit-font-smoothing:antialiased}
.moo-pagina{position:relative;width:794px;margin:0 auto;background:var(--moo-bg);
  padding-bottom:64px}
.moo-pagina .moo-folha{padding:0 64px}
.moo-pagina .moo-cartucho{position:sticky;top:0;z-index:2;background:var(--moo-bg);
  padding-top:24px;letter-spacing:.2em}
.moo-pagina .moo-secao{grid-template-columns:150px 1fr;padding:36px 0;break-inside:avoid}
.moo-pagina .moo-marg{padding-right:20px}
.moo-corpo{min-width:0}
.moo-cifra{display:block;margin:0 0 26px}
.moo-cifra:last-child{margin-bottom:0}
.moo-cifra-r{display:block;font:500 10px/1.2 var(--moo-font-mono);letter-spacing:.14em;
  text-transform:uppercase;color:var(--moo-muted);margin-bottom:6px}
.moo-cifra-v{display:block;font:700 17px/1.35 var(--moo-font-mono);letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;color:var(--moo-text);overflow-wrap:anywhere}
.moo-cifra[data-extremo="true"][data-escala="1"] .moo-cifra-v{font-size:46px;line-height:1.02;letter-spacing:-.04em}
.moo-cifra[data-extremo="true"][data-escala="2"] .moo-cifra-v{font-size:29px;line-height:1.12;letter-spacing:-.032em}
.moo-cifra[data-extremo="true"][data-escala="3"] .moo-cifra-v{font-size:22px;line-height:1.25;letter-spacing:-.025em}
.moo-cifra-e{display:block;font:500 9px/1.2 var(--moo-font-mono);letter-spacing:.14em;
  text-transform:uppercase;color:var(--moo-faint);margin-top:6px}
.moo-cifra-n{display:block;font:400 13px/1.55 var(--moo-font-sans);color:var(--moo-text-2);margin-top:8px}
.moo-cifra-p{display:block;font:400 9px/1.65 var(--moo-font-mono);letter-spacing:.04em;
  color:var(--moo-faint);margin-top:8px}
.moo-grau{font-style:normal}
.moo-cod{font-family:var(--moo-font-mono);font-size:.92em}
.moo-frase{font:700 27px/1.15 var(--moo-font-sans);letter-spacing:-.03em;margin:0;max-width:30ch}
.moo-prosa{font:400 14px/1.62 var(--moo-font-sans);color:var(--moo-text-2);margin:14px 0 0}
.moo-q{color:var(--moo-accent)}
.moo-wordmark{font:700 92px/0.9 var(--moo-font-sans);letter-spacing:-.05em;margin:0}
.moo-cta{color:var(--moo-accent);font:500 10px/1.4 var(--moo-font-mono);letter-spacing:.18em;
  text-transform:uppercase}
.moo-folio{display:none}
@media print{
  @page{size:A4;margin:14mm 0}
  html,body{background:#fff}
  .moo-pagina{width:auto;padding-bottom:0}
  .moo-pagina .moo-cartucho{position:fixed;top:0;left:0;right:0;padding:6mm 18mm 3mm}
  .moo-pagina .moo-folha{padding:22mm 18mm 0}
  .moo-mm{display:none}
  .moo-ent{opacity:1;animation:none}
}
`;

const COTA = (rot) => `<svg class="moo-cota-svg" viewBox="0 0 216 28" aria-hidden="true">
<path class="moo-cota moo-traco" style="--L:216" d="M0 20 H216"/>
<path class="moo-cota" d="M0 14 V26 M216 14 V26"/>
<text class="moo-cota-t" x="216" y="10" text-anchor="end">${esc(rot)}</text></svg>`;

const rotSinal = (s) => (s === 'negativo' ? 'negativo medido' : s === 'positivo' ? 'positivo medido' : 'medido');

function margem({ eyebrow, sinal, janela, cota }) {
  return `<div class="moo-marg"><b>${inline(eyebrow)}</b>${esc(rotSinal(sinal))}<br>` +
    `janela ${esc(janela ? janela.texto : 'n/d')}` +
    (cota ? COTA(cota) : '') + `</div>`;
}

function pagina(html, { doc, titulo, css }) {
  return `<!doctype html>
<html lang="pt-PT" data-moo-theme="papel">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="generator" content="design/deck/moo-deck-build.mjs — gerado do registo, nunca editado à mão">
<meta name="moo-documento" content="${esc(doc)}">
<style>${gramatica()}</style>
<style>${css}</style>
</head>
<body>
${html}
<!-- GERADO. Editar aqui é trabalho perdido: muda-se o registo e regenera-se.
     origem única: 40-strategy/${REGISTO_NOME} -->
</body>
</html>
`;
}

// ── modelo: do registo para folhas ───────────────────────────────────────
function pedacos(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* O extremo é a cifra MAIS cifra do grupo: tem dígitos e é a mais curta.
   Sem isto o extremo era «o primeiro da tabela», e uma folha inteira ficava
   dominada por uma frase de 70 caracteres enquanto o «0 de 24» ao lado ia a
   corpo pequeno. Determinístico: empate resolve-se pela ordem do registo. */
function indiceDoExtremo(grupo) {
  let melhor = 0, custo = Infinity;
  grupo.forEach((m, k) => {
    const v = String(m.valor || '');
    const c = (/\d/.test(v) ? 0 : 1000) + v.length;
    if (c < custo) { custo = c; melhor = k; }
  });
  return melhor;
}

/* Altura estimada de uma cifra no slide de 1080px, em px.
   MEDIDO no browser a 2026-08-27: com `MAX_POR_SLIDE = 4` fixo, a folha 22
   («⚠️ Negativos medidos», valores de 156/80/39/100 caracteres) dava
   scrollHeight 1117 num slide de 1080 — 37px a cair fora, invisíveis, porque
   `overflow:hidden` corta sem se queixar. Contar métricas não mede nada:
   quatro cifras curtas cabem e duas longas não. Por isso o empacotamento é
   por ORÇAMENTO DE ALTURA, e o número máximo é só um tecto de leitura. */
const COL_CORPO = 1416;                  // 1920 − padding 256 − margem 216 − goteira 32
const ORCAMENTO = 800;                   // 1080 − cartucho − hairline − fólio − folga
const linhas = (txt, charsPorLinha) => Math.max(1, Math.ceil(String(txt || '').length / charsPorLinha));
export function custoDeAltura(m, { extremo = false } = {}) {
  const v = String(m.valor || '');
  const escala = v.length <= 18 ? 1 : v.length <= 46 ? 2 : 3;
  const [cpl, lh] = extremo
    ? (escala === 1 ? [Math.floor(COL_CORPO / 84), 132]
      : escala === 2 ? [Math.floor(COL_CORPO / 46), 75]
        : [Math.floor(COL_CORPO / 29), 52])
    : [Math.floor(COL_CORPO / 19), 36];
  return 23 + linhas(v, cpl) * lh
    + (m.escopo ? 22 : 0)
    + (m.nota ? linhas(m.nota, 62) * 26 + 14 : 0)
    + linhas(`fonte · ${m.fonte ? m.fonte.texto : ''} · janela · ${m.janela ? m.janela.texto : ''}`, 80) * 17 + 14
    + 40;
}

function empacotar(grupo) {
  const out = [];
  let atual = [];
  for (const m of grupo) {
    const cand = [...atual, m];
    const ex = indiceDoExtremo(cand);
    const alt = cand.reduce((a, x, k) => a + custoDeAltura(x, { extremo: k === ex }), 0);
    if (atual.length && (cand.length > MAX_POR_SLIDE || alt > ORCAMENTO)) { out.push(atual); atual = [m]; }
    else atual = cand;
  }
  if (atual.length) out.push(atual);
  return out;
}

export function modelar(reg) {
  const folhas = [];
  const rev = reg.meta.created || 'n/d';

  folhas.push({ tipo: 'capa', titulo: reg.titulo || 'Registo medido', rev });

  for (const cap of reg.capitulos) {
    const cifras = cap.metricas.filter(eCifra);
    if (cifras.length) {
      /* agrupa por (subsecção, sinal): é o que faz «uma ideia por slide» ser
         verdade — nunca positivos e negativos na mesma folha, nunca duas
         subsecções misturadas. */
      const chaves = [];
      for (const m of cifras) {
        const ch = [m.sub || '', m.sinal];
        if (!chaves.some((c) => c[0] === ch[0] && c[1] === ch[1])) chaves.push(ch);
      }
      for (const ch of chaves) {
        const [subT, sinal] = ch;
        const grupo = cifras.filter((m) => (m.sub || '') === subT && m.sinal === sinal);
        empacotar(grupo).forEach((g, k) => {
          folhas.push({
            tipo: 'metricas', capitulo: cap, sub: subT || null, sinal, metricas: g,
            extremoEm: indiceDoExtremo(g), continuacao: k > 0, rev,
          });
        });
      }
    }
    const prosa = cap.prosa.filter((p) => p.texto.length > 90 && !/^\|/.test(p.texto));
    if (prosa.length) {
      const p = prosa.slice(0, 3);
      folhas.push({ tipo: 'prosa', capitulo: cap, sinal: cap.sinal, prosa: p, rev });
    }
  }

  folhas.push({ tipo: 'fecho', reg, rev });
  return folhas;
}

// ── render ───────────────────────────────────────────────────────────────
function corpoDaFolha(f, { extremo }) {
  if (f.tipo === 'capa') {
    return {
      marg: margem({ eyebrow: 'registo', sinal: 'neutro', janela: { texto: f.rev }, cota: 'medido' }),
      corpo: `<div class="moo-corpo moo-ent">
<h1 class="moo-wordmark" data-extremo="true">moo<span class="moo-q">?</span></h1>
<p class="moo-prosa">${inline(f.titulo)}</p>
<p class="moo-cta">cada cifra com fonte e janela</p></div>`,
    };
  }
  if (f.tipo === 'fecho') {
    const m = {
      id: 'fecho', rotulo: 'Poupança publicada', valor: 'n/d',
      nota: limpo(f.reg.meta.regra || ''), sinal: 'negativo',
      fonte: { texto: `decisão 2026-08-24 · ${f.reg.origem} (front-matter «regra»)`, grau: 'directa' },
      janela: { texto: f.rev }, origem: { ficheiro: f.reg.origem, linha: 4 },
    };
    return {
      marg: margem({ eyebrow: 'a regra', sinal: 'negativo', janela: m.janela, cota: 'decisão' }),
      corpo: `<div class="moo-corpo moo-ent">${cifra(m, { extremo: true })}
<p class="moo-cta">muda-se o registo · regenera-se · nunca se edita o slide</p></div>`,
    };
  }
  if (f.tipo === 'prosa') {
    const [p0, ...resto] = f.prosa;
    return {
      marg: margem({
        eyebrow: curto(p0.sub || f.capitulo.titulo), sinal: f.sinal,
        janela: f.capitulo.janela, cota: curto(f.capitulo.titulo, 24),
      }),
      corpo: `<div class="moo-corpo moo-ent">
<p class="moo-frase" data-extremo="true">${inline(p0.texto)}</p>
${resto.map((p) => `<p class="moo-prosa">${inline(p.texto)}</p>`).join('\n')}</div>`,
    };
  }
  const alvo = typeof f.extremoEm === 'number' ? f.extremoEm : 0;
  return {
    marg: margem({
      eyebrow: curto(f.sub || f.capitulo.titulo) + (f.continuacao ? ' (cont.)' : ''),
      sinal: f.sinal, janela: f.capitulo.janela, cota: curto(f.capitulo.titulo, 24),
    }),
    corpo: `<div class="moo-corpo moo-ent">
${f.metricas.map((m, k) => cifra(m, { extremo: extremo && k === alvo })).join('\n')}</div>`,
  };
}

export function construirDeck(folhas) {
  const total = folhas.length;
  const slides = folhas.map((f, i) => {
    const { marg, corpo } = corpoDaFolha(f, { extremo: true });
    return `<div class="moo-caixilho"><article class="moo-slide" data-folha="${i + 1}">
<div class="moo-mm"></div>
<div class="moo-folha">
<div class="moo-cartucho"><span>mooter · registo de métricas medidas</span><span>rev ${esc(f.rev)}</span></div>
<section class="moo-secao">${marg}${corpo}</section>
</div>
<div class="moo-folio">${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
</article></div>`;
  }).join('\n');
  return pagina(`<div class="moo-palco">\n${slides}\n</div>`, {
    doc: 'deck', css: CSS_DECK,
    titulo: 'Mooter · deck do registo medido',
  });
}

export function construirPdf(folhas) {
  const seccoes = [];
  for (const f of folhas) {
    if (f.tipo === 'metricas' && f.metricas.length > MAX_POR_SECCAO_PDF) {
      /* `extremoEm` é um índice DENTRO do grupo. Herdá-lo ao refatiar apontava
         para outra cifra — ou para fora do sub-grupo, deixando a secção com
         zero extremos. Hoje o ramo não corre (o orçamento de altura fecha
         antes dos 8), o que é precisamente o pior tipo de defeito: latente,
         verde, à espera de que alguém suba `MAX_POR_SLIDE`. */
      for (const g of pedacos(f.metricas, MAX_POR_SECCAO_PDF)) {
        seccoes.push({ ...f, metricas: g, extremoEm: indiceDoExtremo(g) });
      }
    } else seccoes.push(f);
  }
  const corpo = seccoes.map((f, i) => {
    const { marg, corpo: c } = corpoDaFolha(f, { extremo: true });
    return `<section class="moo-secao" data-seccao="${i + 1}">${marg}${c}</section>`;
  }).join('\n');
  return pagina(`<div class="moo-pagina">
<div class="moo-mm"></div>
<div class="moo-folha">
<div class="moo-cartucho"><span>mooter · registo de métricas medidas</span><span>rev ${esc(folhas[0] ? folhas[0].rev : 'n/d')}</span></div>
${corpo}
</div>
</div>`, { doc: 'pdf', css: CSS_PDF, titulo: 'Mooter · registo medido (A4)' });
}

// ── build ────────────────────────────────────────────────────────────────
export function build({
  registo,
  saida = process.env.MOO_DECK_OUT ? resolve(process.env.MOO_DECK_OUT) : SAIDA,
  escrever = true,
} = {}) {
  const caminho = registo || caminhoDoRegisto();
  let txt;
  try { txt = readFileSync(caminho, 'utf8'); }
  catch (e) {
    throw new RegistoAusente(
      `registo não encontrado em ${caminho} (${e.code || e.message}). ` +
      'O deck não tem conteúdo de reserva — sem registo não há deck.');
  }
  const reg = parseRegisto(txt, { origem: caminho.split(/[\\/]/).pop() });
  const folhas = modelar(reg);

  /* a gramática entra ANTES de se emitir seja o que for */
  const gram = gramatica();
  const tokensUsados = assertTokensDaGramatica(gram, CSS_DECK, CSS_PDF);
  assertClassesDaGramatica(gram);

  const html = construirDeck(folhas);
  const pdf = construirPdf(folhas);

  // guardas — correm SEMPRE, não só no teste
  assertNeutralidadeTipografica(CSS_DECK);
  assertNeutralidadeTipografica(CSS_PDF);
  assertSemCaixas(CSS_DECK);
  assertSemCaixas(CSS_PDF);
  assertRosaContida(CSS_DECK);
  assertRosaContida(CSS_PDF);
  assertMovimentoDaFamilia(CSS_DECK);
  assertMovimentoDaFamilia(CSS_PDF);
  const nSlides = assertUmExtremoPorFolha(html);
  assertUmExtremoPorFolha(pdf, { tag: 'section', classe: 'moo-secao' });

  const todas = reg.capitulos.flatMap((c) => c.metricas);
  const cifras = todas.filter(eCifra);
  const usadas = folhas.flatMap((f) => f.metricas || []);
  const graus = usadas.reduce((a, m) => { a[m.fonte.grau] = (a[m.fonte.grau] || 0) + 1; return a; }, {});
  const rel = {
    gerado_em: new Date().toISOString(),
    registo: caminho,
    registo_bytes: Buffer.byteLength(txt),
    metricas_no_registo: todas.length,
    cifras_no_registo: cifras.length,
    cifras_no_deck: usadas.length + 1 /* o `n/d` do fecho */,
    com_fonte_e_janela: usadas.length + 1,
    pct_com_fonte_e_janela: 100,
    fonte_por_grau: graus,
    fonte_grau_registo: graus.registo || 0,
    slides: nSlides,
    tokens_da_gramatica_usados: tokensUsados,
    gramatica_bytes: Buffer.byteLength(gram),
    seccoes_pdf: (pdf.match(/<section class="moo-secao"/g) || []).length,
    sem_janela: reg.semProcedencia.length,
    saidas: { deck: join(saida, 'moo-deck.html'), pdf: join(saida, 'moo-pitch-a4.html') },
  };

  if (escrever) {
    mkdirSync(saida, { recursive: true });
    writeFileSync(rel.saidas.deck, html);
    writeFileSync(rel.saidas.pdf, pdf);
    writeFileSync(join(saida, '.deck-build.json'), JSON.stringify(rel, null, 2));
  }
  return { rel, html, pdf, reg, folhas };
}

// ── CLI ──────────────────────────────────────────────────────────────────
const ehCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (ehCLI) {
  try {
    const { rel } = build();
    if (process.argv.includes('--json')) console.log(JSON.stringify(rel, null, 2));
    else {
      console.log(`\n  🐮 DECK GERADO DO REGISTO\n  ${'─'.repeat(64)}`);
      console.log(`  registo            ${rel.registo}`);
      console.log(`  slides             ${rel.slides}`);
      console.log(`  secções no PDF     ${rel.seccoes_pdf}`);
      console.log(`  cifras publicadas  ${rel.cifras_no_deck}  (${rel.cifras_no_registo} do registo + 1 da regra de fecho)`);
      console.log(`  com fonte+janela   ${rel.com_fonte_e_janela}/${rel.cifras_no_deck} = ${rel.pct_com_fonte_e_janela}%  (por construção: sem elas, cifra() atira)`);
      console.log(`  fonte por grau     ${Object.entries(rel.fonte_por_grau).map(([k, v]) => `${k}:${v}`).join(' · ')}`);
      if (rel.fonte_grau_registo) {
        console.log(`  ⚠️  ${rel.fonte_grau_registo} cifra(s) com fonte de grau «registo» — procedência, não prova.`);
        console.log(`      Corrige-se no registo (acrescentar «fontes:» ao cabeçalho da entrada), não aqui.`);
      }
      console.log(`\n  deck → ${rel.saidas.deck}\n  pdf  → ${rel.saidas.pdf}\n`);
    }
    if (process.argv.includes('--estrito') && rel.fonte_grau_registo > 0) process.exit(1);
  } catch (e) {
    console.error(`\n  ❌ ${e.name}: ${e.message}\n`);
    process.exit(1);
  }
}
