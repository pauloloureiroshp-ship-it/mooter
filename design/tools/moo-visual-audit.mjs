#!/usr/bin/env node
/* moo-visual-audit — auditoria visual como código.
 * Renderiza cada prancha e mede o que o olho não garante:
 * corte, overflow horizontal, contraste real, linha de base, família de easing,
 * escala de raios, e os padrões banidos pelas DIRETRIZES.
 * Precisa de um browser (playwright) — por isso vive fora do moo-design-check, que é zero-dep.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Onde vive o canvas — argv[2] > MOO_AUDIT_CANVAS > ./canvas.json.
// Até 2026-08-27 isto era `readFileSync('canvas.json')` com os ficheiros e a saída
// ancorados em /home/claude/ e o chromium em /opt/pw-browsers/. Media o canvas do Claude
// Design e mais nada: fora dessa sandbox o auditor não arrancava. As quatro âncoras
// passaram a parâmetros; a medição em si não mudou uma linha.
const CANVAS = resolve(process.argv[2] || process.env.MOO_AUDIT_CANVAS || 'canvas.json');
if (!existsSync(CANVAS)) {
  console.error(`moo-visual-audit: canvas não encontrado em ${CANVAS}\n` +
    `  uso: node moo-visual-audit.mjs <caminho/para/canvas.json>\n` +
    `  o canvas declara { artboards: [{ file, page, w, h, name?, scroll? }] },\n` +
    `  com file relativo à pasta do próprio canvas.`);
  process.exit(2);
}
const CV = JSON.parse(readFileSync(CANVAS,'utf8'));
const BASE = CV.base ? resolve(dirname(CANVAS), CV.base) : dirname(CANVAS);
const SAIDA = process.env.MOO_AUDIT_OUT
  ? resolve(process.env.MOO_AUDIT_OUT)
  : join(dirname(CANVAS), '.visual-audit.json');
/* ── A ESCALA E A FAMÍLIA SAEM DO TOKEN ─────────────────────────────────────
   Até 2026-08-29 estas duas listas eram escritas à mão AQUI, e eram a QUARTA
   fonte de verdade de um sistema cuja tese é que a fonte é o JSON. A escala à
   mão era `[0,1,2,3,4,6,7,8,9,10,11,12,14,16,999]` — quinze valores, sete dos
   quais (1,3,7,9,11,12 e o próprio critério) nunca estiveram na escala
   canónica. Um auditor que mede contra uma régua sua não audita: ratifica.

   A divergência gémea já tinha sido resolvida em `moo-design-check.mjs` a
   2026-08-28. Este ficheiro ficou para trás por uma razão que vale a pena
   registar: os seus testes não corriam. `test:design` era uma lista escrita à
   mão sem o `moo-visual-audit.test.mjs`, e corriam 61 dos 72 testes — o que se
   descobriu a 2026-08-29 ao passar a lista a varrimento da pasta. Um
   instrumento que ninguém corre diverge sem fazer barulho.

   MEDIDO ANTES DE APERTAR, que é a regra deste repo («os limiares sobem quando
   as verificações passarem a medir, nunca por conveniência de uma onda»).
   Contra as 5 pranchas reais de `design/canvas.json`:
     raios computados:  4px x18 · 8px x6 · 10px x22 · 12px x16 · 14px x10 · 16px x1
     curvas computadas: ease · cubic-bezier(0.2, 0.8, 0.2, 1) · ease-in-out
   Com a escala derivada, o ÚNICO valor que sai é o 12 (x16), todas em
   `landing/public/brand-guide.html`, de três regras. Foram corrigidas primeiro,
   com o desempate de cada uma registado no commit. As curvas custam ZERO: o
   `motion` já declara `ease` e `ease-in-out` como valores de token, e os quatro
   cubic-bezier da família estão lá. `linear`, `ease-in` e `ease-out` estavam na
   lista à mão e NÃO no token — saem, sem custo hoje; se algum dia forem
   precisos, o sítio de os pôr é o token, não este ficheiro.

   NORMALIZAÇÃO, e porque é obrigatória: o token escreve
   `cubic-bezier(.45,0,.55,1)` e o browser computa `cubic-bezier(0.45, 0, 0.55, 1)`.
   São a mesma curva. Sem normalizar os DOIS lados, derivar do token trocava uma
   lista desactualizada por um alarme permanente — que é pior. É a mesma
   `normCurva` do portão.

   Guardado por `moo-visual-audit.test.mjs`, que edita a escala numa cópia do
   `design/` e exige que o veredicto do auditor MUDE com ela. Derivar sem esse
   teste seria indistinguível de ter copiado os valores certos por sorte. */
const E_CURVA = /^(cubic-bezier\([^)]*\)|steps\([^)]*\)|linear|ease|ease-in|ease-out|ease-in-out)$/;
const normCurva = (c) => String(c).trim().replace(/\s/g, '').replace(/(^|\(|,)0\./g, '$1.');
/* O caminho dos tokens é a QUINTA âncora a virar parâmetro, pela mesma razão que
   as outras quatro (CANVAS, SAIDA, PW_EXE, base): uma derivação que não se pode
   apontar a outro ficheiro não se pode testar, e uma derivação não testada é
   indistinguível de ter copiado os valores certos por sorte. O default continua
   a ser o irmão real, portanto o uso normal não muda. */
const TOKENS = JSON.parse(readFileSync(process.env.MOO_TOKENS
  ? resolve(process.env.MOO_TOKENS)
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens', 'moo-tokens.json'), 'utf8'));
const EASING_OK = (() => {
  const set = new Set();
  (function colhe(o) {
    if (o == null) return;
    if (typeof o === 'string') { const v = normCurva(o); if (E_CURVA.test(v)) set.add(v); return; }
    if (typeof o === 'object') Object.values(o).forEach(colhe);
  })(TOKENS.motion);
  return set;
})();
const RAIOS_OK = new Set([0, ...Object.values(TOKENS.radius || {})
  .map(v => parseInt(v, 10)).filter(Number.isFinite)]);

// executablePath só quando alguém o declara — senão o playwright usa o browser que instalou.
/* O `playwright` carrega-se AQUI, e nao no topo. Um `import` estatico e
   avaliado antes da primeira linha de codigo, portanto numa maquina sem o
   pacote este ficheiro rebentava com MODULE_NOT_FOUND e codigo 1 — incluindo
   no caminho que nem browser precisa: recusar um canvas que nao existe.
   O teste `o auditor recusa-se a inventar quando o canvas nao existe` exige
   codigo 2, e passava so nas maquinas que ja tinham o browser. Ninguem deu
   por isso porque `test:design` era uma lista escrita a mao e este ficheiro
   nao estava nela: 61 dos 72 testes corriam em CI. Descoberto a 2026-08-29,
   ao passar a lista a varrimento da pasta.
   A validacao de argumentos vem antes das dependencias pesadas — assim a
   recusa e a mensagem de uso funcionam em qualquer maquina. */
const { chromium } = await import('playwright');
const PW_EXE = process.env.MOO_AUDIT_CHROMIUM || '/opt/pw-browsers/chromium';
const b = await chromium.launch(existsSync(PW_EXE) ? { executablePath: PW_EXE } : {});
const pg = await b.newPage();
/* ── EXCEPÇÕES DECLARADAS ────────────────────────────────────────────────────
   Aqui estavam CINCO entradas, cada uma a nomear um par de cores exacto com a
   nota «correcção calculada, por aplicar». As correcções foram aplicadas — e as
   cinco entradas MORRERAM sem ninguém dar por isso, porque uma excepção por
   valor de cor deixa de coincidir no dia em que a cor muda. Verificado a
   2026-08-29: apanhavam ZERO achados, e o relatório imprimia
   «declarado 0» há semanas sem que isso significasse «não há nada declarado».

   Uma lista de excepções que envelhece em silêncio é pior do que não existir:
   dá a impressão de que alguém está a olhar. Por isso a forma mudou — declara-se
   a SUPERFÍCIE, não o par de cores.

   `fleet-ui.html` é o único caso, e é estrutural, não uma cor a corrigir: a
   folha declara `--bg: var(--color-background-primary, transparent)` de
   propósito (`:31`), para herdar o tema do editor que a embebe. Num browser nu
   não há host, o fallback é transparente, e o que o auditor mede por trás é o
   preto do próprio browser. Os 1,26:1 e 3,87:1 que ele reportava eram o
   contraste contra um fundo que NÃO EXISTE em produção — a mesma classe do
   `color(srgb ...)` mal lido, mas por outra via.
   Medido, não medível: o contraste desta folha é `n/d` enquanto for renderizada
   fora do host. Contado à parte e visível, nunca somado aos achados. */
const SEM_FUNDO_PROPRIO = new Map([
  ['packages/mooter-bridge/fleet-ui.html',
   'declara `--bg: transparent` para herdar o tema do editor (fleet-ui.html:31); '
   + 'fora do host o fundo medido e o do browser, nao o do produto'],
]);
const rel = [];

for (const a of CV.artboards) {
  await pg.setViewportSize({ width: a.w, height: Math.min(a.h, 3200) });
  const alvo = resolve(BASE, a.file);
  if (!existsSync(alvo)) { console.error(`  ! ausente: ${a.file} (${alvo}) — saltado`); continue; }
  await pg.goto(pathToFileURL(alvo).href);
  await pg.waitForTimeout(700);
  const r = await pg.evaluate((frameH) => {
    const lum = (r,g,bl)=>{const v=[r,g,bl].map(x=>x/255).map(x=>x<=.03928?x/12.92:((x+.055)/1.055)**2.4);
      return .2126*v[0]+.7152*v[1]+.0722*v[2];};
    /* ── O PARSER LIA `color(srgb ...)` COMO SE FOSSE 0-255 ──────────────────
       Era `c.match(/[\d.]+/g)` — um scrape de digitos. Funciona para
       `rgb(242, 236, 223)` e MENTE para a sintaxe moderna: o Chromium devolve
       `color(srgb 0.875059 0.897804 0.846588)` para tudo o que sai de um
       `color-mix()`, com componentes de 0 a 1. O scrape apanhava 0,875 e tratava
       como 0,875/255 — ou seja, calculava o contraste contra um fundo QUASE
       PRETO que nao existe em lado nenhum.
       Medido a 2026-08-29 no `moo-pilot-shell`: os dois unicos achados de
       contraste da folha vinham dai. O auditor nao estava a ser severo demais;
       estava a inventar o fundo.
       Isto e pior do que um numero errado num relatorio: o auditor existe para
       ser acreditado, e um parser que falha em silencio faz o proximo verde
       valer tanto como o vermelho de hoje. */
    const parse = (c) => {
      if (!c || c === 'transparent' || c === 'none') return null;
      const m = String(c).match(/^color\(\s*srgb\s+([^)]+)\)$/i);
      if (m) {
        const [rgb, alfa] = m[1].split('/');
        const v = rgb.trim().split(/\s+/).map((x) => x.endsWith('%') ? parseFloat(x) / 100 : Number(x));
        if (v.length < 3 || v.some((x) => !Number.isFinite(x))) return null;
        const a = alfa === undefined ? 1
          : (alfa.trim().endsWith('%') ? parseFloat(alfa) / 100 : Number(alfa));
        return [v[0] * 255, v[1] * 255, v[2] * 255, a];
      }
      const n = String(c).match(/[\d.]+%?/g);
      if (!n) return null;
      /* A percentagem vale 0-255 nos tres canais e 0-1 no alfa — tratar as duas
         com a mesma regra era o mesmo defeito com outro nome. */
      return n.map((x, i) => x.endsWith('%')
        ? (i < 3 ? parseFloat(x) * 2.55 : parseFloat(x) / 100)
        : Number(x));
    };
    const bgDe = el => { let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && (c[3] === undefined || c[3] > .85)) return c;
        n = n.parentElement; }
      return parse(getComputedStyle(document.body).backgroundColor) || [11,10,9]; };
    const split = s => { const o=[]; let d=0, cur=''; for (const ch of s) {
        if (ch==='(') d++; if (ch===')') d--;
        if (ch===',' && d===0) { o.push(cur.trim()); cur=''; } else cur+=ch; }
      if (cur.trim()) o.push(cur.trim()); return o; };
    const ratio = (f,g) => { const [x,y]=[lum(...f.slice(0,3)),lum(...g.slice(0,3))].sort((m,n)=>n-m);
      return (x+.05)/(y+.05); };

    const out = { alturaReal: document.body.scrollHeight, corte: document.body.scrollHeight - frameH,
                  overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
                  contraste: [], base8: {ok:0,total:0}, easings: {}, raios: {}, barras: 0,
                  fontes: [], caixas: 0, raiosPercentagem: 0 };

    // contraste sobre texto realmente visível
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t, vistos = 0;
    while ((t = walk.nextNode()) && vistos < 600) {
      const s = t.textContent.trim(); if (s.length < 3) continue;
      const el = t.parentElement; if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .35) continue;
      const rect = el.getBoundingClientRect(); if (rect.width < 4 || rect.height < 4) continue;
      // ignora o que está dentro de um filtro (estado morto é intencional)
      let n = el, filtrado = false;
      while (n && n !== document.body) { if (getComputedStyle(n).filter !== 'none') { filtrado = true; break; } n = n.parentElement; }
      if (filtrado) continue;
      vistos++;
      const fg = parse(cs.color); const bg = bgDe(el);
      if (!fg) continue;
      const px = parseFloat(cs.fontSize); const peso = parseInt(cs.fontWeight) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const min = grande ? 3 : 4.5;
      const rr = ratio(fg, bg);
      if (rr < min) out.contraste.push({ txt: s.slice(0,42), px, peso, r: +rr.toFixed(2), min,
        cor: cs.color, fundo: `rgb(${bg.slice(0,3).join(',')})` });
    }

    // linha de base 8px + raios + barras + caixas
    document.querySelectorAll('div,section,h1,h2,h3,p,table,svg,pre').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 8 || rect.width < 8) return;
      out.base8.total++;
      if (Math.abs(Math.round(rect.top) % 8) <= 1 || Math.abs(Math.round(rect.top) % 8) >= 7) out.base8.ok++;
      const cs = getComputedStyle(el);
      const rawBr = cs.borderTopLeftRadius;
      const br = rawBr.includes('%') ? 0 : (parseFloat(rawBr) || 0);
      if (br >= 8 && rect.height > 60 && rect.width > 120 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.caixas++;
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const temFundo = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      if (bl >= 3 && temFundo && rect.height > 40) out.barras++;
    });

    /* ── OS RAIOS MEDEM-SE EM TUDO, E NOS QUATRO CANTOS ─────────────────────
       Até 2026-08-29 a medição de raios ia à boleia do ciclo da linha de base,
       que varre `div,section,h1,h2,h3,p,table,svg,pre` — e lia só o canto
       superior-esquerdo. Isso não é uma amostra: é um filtro que apaga
       exactamente onde os raios pequenos vivem. Medido nas 5 pranchas reais, o
       que estava invisível:
         · `a`, `span`, `button` — o `.badge` a 3px (x5) e o `.hero-copy-btn` a
           5px (x1) do brand-guide, nenhum na escala, nenhum jamais acusado;
         · toda a regra `border-radius: 0 0 Xpx Xpx` — as pilhas de `.type-row`,
           `.structure-item`, `.space-row` e `.voice-*` contam 0 pelo canto de
           cima, e o raio real está em baixo.
       Um auditor que anuncia «raios fora da escala: —» tendo olhado para nove
       etiquetas e um canto diz uma coisa mais perigosa do que um número errado:
       diz que procurou.
       Alargado com a medição feita PRIMEIRO — as duas violações que apareceram
       foram corrigidas no mesmo commit, não descobertas depois.

       A PERCENTAGEM fica de fora, mas DECLARADA. `border-radius: 50%` é um
       círculo (os pontos da barra de título, o `.dot`), não um degrau falhado —
       compará-lo com uma escala em px seria acusar por acusar. Mas um valor que
       se exclui em silêncio é indistinguível de um valor que passou, por isso
       vai contado no relatório. */
    document.querySelectorAll('*').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 8 || rect.width < 8) return;
      const cs = getComputedStyle(el);
      const cantos = new Set();
      let pct = false;
      for (const c of ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius']) {
        const cru = cs[c];
        if (cru.includes('%')) { pct = true; continue; }
        const v = parseFloat(cru) || 0;
        if (v > 0) cantos.add(v > 500 ? 999 : Math.round(v));
      }
      if (pct) out.raiosPercentagem++;
      cantos.forEach(k => { out.raios[k] = (out.raios[k] || 0) + 1; });
    });

    // easing de tudo o que anima
    document.getAnimations().forEach(an => {
      const e = an.effect?.getComputedTiming?.() ? an.effect.getTiming().easing : null;
      const el = an.effect?.target;
      const cs = el ? getComputedStyle(el) : null;
      (cs ? split(cs.animationTimingFunction) : [e || '?']).forEach(f => {
        out.easings[f] = (out.easings[f]||0)+1; });
    });
    document.querySelectorAll('*').forEach(el => {
      const f = getComputedStyle(el).transitionTimingFunction;
      const d = getComputedStyle(el).transitionDuration;
      if (d && d !== '0s') split(f).forEach(x => out.easings[x] = (out.easings[x]||0)+1);
    });

    out.fontes = [...new Set([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family))];
    return out;
  }, a.h);

  /* A folha inteira e n/d quando nao tem fundo proprio — nao se filtram cores
     uma a uma, filtra-se a superficie, porque o problema e do fundo. */
  const porque = SEM_FUNDO_PROPRIO.get(a.file.split(String.fromCharCode(92)).join('/'));
  r.contrasteNovo = porque ? [] : r.contraste;
  r.contrasteDeclarado = porque ? r.contraste.length : 0;
  r.contrasteND = porque ?? null;
  const easBad = Object.keys(r.easings).filter(e => !EASING_OK.has(normCurva(e)));
  const raiBad = Object.keys(r.raios).map(Number).filter(x => !RAIOS_OK.has(x));
  rel.push({ prancha: a.name || basename(a.file).replace(/\.(dc\.)?html$/,''),
             pagina: a.page ?? '—', ficheiro: a.file, scroll: !!a.scroll, ...r, easBad, raiBad,
             base8pc: r.base8.total ? +(r.base8.ok/r.base8.total*100).toFixed(1) : null });
}
await b.close();
if (!rel.length) { console.error('moo-visual-audit: nenhuma prancha medida — nada a escrever.'); process.exit(2); }
writeFileSync(SAIDA, JSON.stringify(rel,null,2));

const p = (s,n)=>String(s).padStart(n), l=(s,n)=>String(s).padEnd(n);
const larg = Math.max(14, ...rel.map(r => r.prancha.length + 1));
const largP = Math.max(4, ...rel.map(r => String(r.pagina).replace('page-','').length + 1));
console.log('\n  ' + l('PRANCHA',larg) + l('PÁG',largP) + ' CORTE  OVFX   CONTR  BASE8  CAIXAS  BARRAS  EASING-FORA  RAIO-FORA');
console.log('  ' + '─'.repeat(larg + largP + 76));
for (const r of rel) {
  // `corte` = altura real − altura declarada. Numa prancha de altura fixa isso é um defeito;
  // numa página que rola por natureza, não é. `scroll: true` no canvas diz qual é qual —
  // o número medido fica no JSON de qualquer maneira, o que muda é só a leitura.
  const corte = r.scroll ? '—' : (r.corte>0?`+${r.corte}`:'ok');
  const flag = (!r.scroll && r.corte>0?'❌':'') + (r.overflowX>0?'↔':'') + (r.contrasteNovo.length>0?'◐':'');
  console.log('  ' + l(r.prancha,larg) + l(String(r.pagina).replace('page-',''),largP) +
    p(corte,6) + p(r.overflowX||'ok',6) + p(r.contrasteNovo.length + (r.contrasteDeclarado?`(${r.contrasteDeclarado})`:''),8) +
    p(r.base8pc===null?'n/d':r.base8pc+'%',7) + p(r.caixas,8) + p(r.barras,8) + p([...new Set(r.easBad)].length||'—',13) +
    p(r.raiBad.join(' ')||'—',11) + '  ' + flag);
}
const T = k => rel.reduce((a,r)=>a+(Array.isArray(r[k])?r[k].length:r[k]),0);
const fixas = rel.filter(r => !r.scroll);
console.log('\n  TOTAIS  · cortes ' + (fixas.length ? fixas.filter(r=>r.corte>0).length + '/' + fixas.length + ' pranchas de altura fixa' : 'n/d (todas as superfícies rolam)') +
            ' · contraste novo ' + T('contrasteNovo') + ' · declarado ' + T('contrasteDeclarado') +
            '\n          · caixas arredondadas ' + T('caixas') + ' · barras à esquerda ' + T('barras'));
const comBase = rel.filter(r => r.base8pc !== null);
console.log('  linha de base 8px: ' + (comBase.length
  ? (comBase.reduce((a,r)=>a+r.base8pc,0)/comBase.length).toFixed(1) + '% dos blocos (medido, não alvo)'
  : 'n/d — nenhum bloco medível'));
console.log('  easings fora da família: ' + [...new Set(rel.flatMap(r=>r.easBad))].join('  |  '));
console.log('  raios fora da escala:    '
  + ([...new Set(rel.flatMap(r=>r.raiBad))].sort((a,b)=>a-b).join(' · ') || '—')
  /* Declarado, nao escondido: um `border-radius: 50%` e um circulo, nao um degrau
     falhado, e compara-lo com uma escala em px seria acusar por acusar. Mas uma
     exclusao silenciosa e indistinguivel de um valor que passou — e a mesma regra
     do `sem_par_declarado` do contraste: nao medido tem de ser VISIVEL. */
  + `   ·   ${rel.reduce((n, r) => n + (r.raiosPercentagem || 0), 0)} em % (circulos, fora desta escala por desenho)`
  + '\n');
