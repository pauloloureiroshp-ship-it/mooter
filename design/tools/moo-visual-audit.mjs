#!/usr/bin/env node
/* moo-visual-audit — auditoria visual como código.
 * Renderiza cada prancha e mede o que o olho não garante:
 * corte, overflow horizontal, contraste real, linha de base, família de easing,
 * escala de raios, e os padrões banidos pelas DIRETRIZES.
 * Precisa de um browser (playwright) — por isso vive fora do moo-design-check, que é zero-dep.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const CV = JSON.parse(readFileSync('canvas.json','utf8'));
// família declarada: quatro curvas — a quarta (mola) saiu desta auditoria
const EASING_OK = ['cubic-bezier(0.16, 1, 0.3, 1)','cubic-bezier(0.2, 0.8, 0.2, 1)',
                   'cubic-bezier(0.45, 0, 0.55, 1)','cubic-bezier(0.3, 1.3, 0.5, 1)',
                   'linear','ease','ease-in','ease-out','ease-in-out'];
const RAIOS_OK = [0,1,2,3,4,6,7,8,9,10,11,12,14,16,999];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await b.newPage();
// excepções DECLARADAS — valores de produção com correcção já calculada em moo-tokens.json.
// Um portão sem lista de excepções obriga a mentir ou a ignorar. Este declara.
const DECLARADO = {
  'rgb(194, 95, 101)|rgb(242,236,223)': 'papel.accent · correcção #A55156 calculada, por aplicar',
  'rgb(61, 139, 94)|rgb(242,236,223)':  'papel.ok · correcção #347851 calculada, por aplicar',
  'rgb(184, 82, 63)|rgb(242,236,223)':  'papel.bad · correcção #AD4D3B calculada, por aplicar',
  'rgb(61, 111, 168)|rgb(242,236,223)': 'papel.tier-1 · abaixo de AA na paleta de papel',
  'rgb(122, 94, 168)|rgb(242,236,223)': 'papel.tier-2 · abaixo de AA na paleta de papel',
};
const rel = [];

for (const a of CV.artboards) {
  await pg.setViewportSize({ width: a.w, height: Math.min(a.h, 3200) });
  await pg.goto('file:///home/claude/' + a.file);
  await pg.waitForTimeout(700);
  const r = await pg.evaluate((frameH) => {
    const lum = (r,g,bl)=>{const v=[r,g,bl].map(x=>x/255).map(x=>x<=.03928?x/12.92:((x+.055)/1.055)**2.4);
      return .2126*v[0]+.7152*v[1]+.0722*v[2];};
    const parse = c => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
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
                  fontes: [], caixas: 0 };

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
      if (br > 0) { const k = br > 500 ? 999 : Math.round(br); out.raios[k] = (out.raios[k]||0)+1; }
      if (br >= 8 && rect.height > 60 && rect.width > 120 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') out.caixas++;
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const temFundo = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      if (bl >= 3 && temFundo && rect.height > 40) out.barras++;
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

  const decl = r.contraste.filter(c => DECLARADO[`${c.cor}|${c.fundo}`]);
  r.contrasteNovo = r.contraste.filter(c => !DECLARADO[`${c.cor}|${c.fundo}`]);
  r.contrasteDeclarado = decl.length;
  const easBad = Object.keys(r.easings).filter(e => !EASING_OK.includes(e));
  const raiBad = Object.keys(r.raios).map(Number).filter(x => !RAIOS_OK.includes(x));
  rel.push({ prancha: a.file.replace('.dc.html',''), pagina: a.page, ...r, easBad, raiBad,
             base8pc: r.base8.total ? +(r.base8.ok/r.base8.total*100).toFixed(1) : null });
}
await b.close();
writeFileSync('/home/claude/.visual-audit.json', JSON.stringify(rel,null,2));

const p = (s,n)=>String(s).padStart(n), l=(s,n)=>String(s).padEnd(n);
console.log('\n  PRANCHA        PÁG  CORTE  OVFX   CONTR  BASE8  CAIXAS  BARRAS  EASING-FORA  RAIO-FORA');
console.log('  ' + '─'.repeat(93));
for (const r of rel) {
  const flag = (r.corte>0?'❌':'') + (r.overflowX>0?'↔':'') + (r.contrasteNovo.length>0?'◐':'');
  console.log('  ' + l(r.prancha,14) + l(r.pagina.replace('page-',''),4) +
    p(r.corte>0?`+${r.corte}`:'ok',6) + p(r.overflowX||'ok',6) + p(r.contrasteNovo.length + (r.contrasteDeclarado?`(${r.contrasteDeclarado})`:''),8) +
    p(r.base8pc+'%',7) + p(r.caixas,8) + p(r.barras,8) + p([...new Set(r.easBad)].length||'—',13) +
    p(r.raiBad.join(' ')||'—',11) + '  ' + flag);
}
const T = k => rel.reduce((a,r)=>a+(Array.isArray(r[k])?r[k].length:r[k]),0);
console.log('\n  TOTAIS  · cortes ' + rel.filter(r=>r.corte>0).length +
            ' · contraste novo ' + T('contrasteNovo') + ' · declarado ' + T('contrasteDeclarado') +
            '\n          · caixas arredondadas ' + T('caixas') + ' · barras à esquerda ' + T('barras'));
const bm = rel.reduce((a,r)=>a+r.base8pc,0)/rel.length;
console.log('  linha de base 8px: ' + bm.toFixed(1) + '% dos blocos (medido, não alvo)');
console.log('  easings fora da família: ' + [...new Set(rel.flatMap(r=>r.easBad))].join('  |  '));
console.log('  raios fora da escala:    ' + [...new Set(rel.flatMap(r=>r.raiBad))].sort((a,b)=>a-b).join(' · ') + '\n');
