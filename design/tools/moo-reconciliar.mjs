#!/usr/bin/env node
/**
 * moo-reconciliar — o que o token DIZ contra o que a produção SERVE.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * `moo-tokens.json` declara `landing/app/globals.css` como uma das suas fontes
 * ($meta.fontes). A 2026-08-27 mediu-se: divergiram.
 *
 *     tinta.faint   token #7A7168 (4.13:1)   ·   globals.css #5A5249 (2.58:1)
 *
 * As "correcções de contraste calculadas" do próprio JSON foram calculadas sobre
 * `#7A7168`. Aplicá-las corrigia um número que ninguém lê — o site serve o outro.
 * E 2.58:1 não está abaixo de AA (4.5): está abaixo de AA-GRANDE (3.0). É texto
 * que muita gente não consegue ler, no ar, agora.
 *
 * Um portão que pontua contraste sobre valores que a produção não usa está a
 * medir uma intenção. Isto mede o que está no ar, e emite as duas colunas lado a
 * lado para que a decisão seja tomada sobre factos e não sobre o snapshot.
 *
 *   node design/tools/moo-reconciliar.mjs           # tabela
 *   node design/tools/moo-reconciliar.mjs --json    # só JSON
 *   node design/tools/moo-reconciliar.mjs --propor  # + o menor desvio que passa AA
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(AQUI, '..');
const REPO = process.env.MOO_REPO ? resolve(process.env.MOO_REPO) : resolve(DESIGN, '..');

/* Onde cada tema do token vive de facto no CSS de produção.
   `tinta` é o site público (`:root`); `papel` é a shell autenticada clara, e
   `.onboarding-shell, .app-shell-dark` é a variante escura da MESMA shell — que
   reusa os mesmos NOMES com valores diferentes. Por isso são três blocos e não
   dois: comparar `papel` contra o bloco errado dava uma divergência inventada. */
export const BLOCOS = {
  /* `âncora` é a ÚLTIMA classe do selector, porque em `globals.css` ele está
     partido em linhas (`.onboarding-shell,\n.app-shell-dark {`) e procurar a
     forma de uma linha só devolvia `null` — que o relatório mostrava como `n/d`,
     isto é, "não medido", quando na verdade era "não encontrado". Duas coisas
     muito diferentes a sair pelo mesmo símbolo. */
  tinta: { ficheiro: 'landing/app/globals.css', ancora: '.app-shell-dark' },
  papel: { ficheiro: 'landing/app/globals.css', ancora: '.app-shell-root' },
};

/**
 * O token e a produção não usam os mesmos NOMES. Este mapa é o achado que torna
 * `fonte-unica` uma migração e não um find-and-replace: mesmo que os valores
 * fossem idênticos, `--line` não existe em `globals.css` — chama-se `--border`.
 *
 *   token          produção
 *   line       ->  border
 *   line-strong->  border-light
 *   ok         ->  green
 *   warn       ->  yellow
 *   accent-2   ->  accent-soft
 *   on-accent  ->  cream
 *
 * `bad` não tem correspondência: a shell não declara nenhuma cor de erro própria.
 * Isso é `n/d` — ausência, não divergência.
 */
export const ALIAS = {
  'line': 'border', 'line-strong': 'border-light',
  'ok': 'green', 'warn': 'yellow',
  'accent-2': 'accent-soft', 'on-accent': 'cream',
};

/** Lê as custom properties do bloco cuja chaveta abre depois de `ancora`. */
export function lerBloco(css, ancora) {
  /* Procura-se a âncora seguida (com espaços/quebras) de `{`, para não apanhar
     as regras `html:has(.app-shell-dark)` que aparecem ANTES e não declaram
     tokens nenhuns. */
  const re = new RegExp(ancora.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{');
  const m = re.exec(css);
  if (!m) return null;
  const abre = css.indexOf('{', m.index);
  const fecha = css.indexOf('\n}', abre);
  if (abre === -1 || fecha === -1) return null;
  const out = {};
  for (const d of css.slice(abre + 1, fecha).matchAll(/^\s*--([\w-]+)\s*:\s*([^;]+);/gm)) {
    out[d[1]] = d[2].trim();
  }
  return out;
}

// WCAG 2.x — a mesma aritmética do portão, de propósito: dois números diferentes
// para a mesma coisa seria exactamente o defeito que isto existe para apanhar.
const lum = (hex) => {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const racio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const HEX = /^#[0-9a-f]{6}$/i;
const norm = (v) => (v || '').trim().toLowerCase();

/**
 * O menor desvio que passa AA, mantendo o matiz.
 *
 * Caminha em HSL só na LUMINOSIDADE, um passo de cada vez, na direcção que
 * aumenta o contraste contra o fundo. "Menor desvio" não é retórica: é o
 * primeiro valor da caminhada que passa, e devolve-se o ΔL para se poder ver
 * quanto se mexeu. Preserva matiz e saturação — a cor continua a ser a mesma
 * cor, só mais legível.
 */
export function propor(fg, bg, alvo = 4.5) {
  if (!HEX.test(fg) || !HEX.test(bg)) return null;
  const [h, s, l] = rgbParaHsl(fg);
  const subir = lum(bg) < lum(fg) || racio('#ffffff', bg) > racio('#000000', bg);
  for (let d = 1; d <= 100; d++) {
    const nl = subir ? Math.min(100, l + d) : Math.max(0, l - d);
    const cand = hslParaRgb(h, s, nl);
    if (racio(cand, bg) >= alvo) return { proposto: cand, para: +racio(cand, bg).toFixed(2), deltaL: (subir ? d : -d) };
    if (nl === 0 || nl === 100) break;
  }
  return null;
}

export function rgbParaHsl(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s * 100, l * 100];
}

export function hslParaRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

export function reconciliar({ tokens, css } = {}) {
  const T = tokens ?? JSON.parse(readFileSync(join(DESIGN, 'tokens/moo-tokens.json'), 'utf8'));
  const folha = css ?? readFileSync(join(REPO, BLOCOS.tinta.ficheiro), 'utf8');
  const linhas = [];
  const ausentes = [];

  for (const [tema, cfg] of Object.entries(BLOCOS)) {
    const bloco = lerBloco(folha, cfg.ancora);
    if (!bloco) { ausentes.push({ tema, ancora: cfg.ancora, porque: 'bloco não encontrado no CSS' }); continue; }
    for (const [nome, valorToken] of Object.entries(T.color[tema] ?? {})) {
      const nomeCss = ALIAS[nome] ?? nome;
      const real = bloco[nomeCss];
      /* Sem correspondência no CSS não é divergência: é um token que a produção
         ainda não usa. Confundir os dois inflava a lista com falsos alarmes. */
      if (real === undefined) { linhas.push({ tema, nome, nome_css: nomeCss, token: valorToken, producao: null, estado: 'n/d' }); continue; }
      const igual = norm(real) === norm(valorToken);
      linhas.push({ tema, nome, nome_css: nomeCss, renomeado: nomeCss !== nome, token: valorToken, producao: real, estado: igual ? 'igual' : 'diverge' });
    }
  }

  /* O contraste mede-se sobre a PRODUÇÃO quando ela existe. É o ponto todo. */
  const valor = (tema, nome, preferir) => {
    const l = linhas.find(x => x.tema === tema && x.nome === nome);
    if (!l) return null;
    const v = preferir === 'producao' ? (l.producao ?? l.token) : l.token;
    return HEX.test(norm(v)) ? norm(v) : null;
  };

  const pares = (T.contraste?.pares ?? []).map(([fgK, bgK]) => {
    const [tf, nf] = fgK.split('.'), [tb, nb] = bgK.split('.');
    const fgT = valor(tf, nf, 'token'), bgT = valor(tb, nb, 'token');
    const fgP = valor(tf, nf, 'producao'), bgP = valor(tb, nb, 'producao');
    const rT = fgT && bgT ? +racio(fgT, bgT).toFixed(2) : null;
    const rP = fgP && bgP ? +racio(fgP, bgP).toFixed(2) : null;
    const min = T.contraste.minimo_normal;
    return {
      par: `${fgK} sobre ${bgK}`,
      token: { fg: fgT, bg: bgT, racio: rT, passa: rT === null ? null : rT >= min },
      producao: { fg: fgP, bg: bgP, racio: rP, passa: rP === null ? null : rP >= min },
      /* O caso que motivou este ficheiro: o token passa (ou quase) e a produção
         está muito pior. É o único em que pontuar pelo token é MENTIR. */
      token_melhor_que_producao: rT !== null && rP !== null && rT - rP > 0.05,
      proposta: rP !== null && rP < min && fgP && bgP ? propor(fgP, bgP, min) : null,
    };
  });

  return {
    gerado_em: new Date().toISOString(),
    repo: REPO,
    tokens_versao: T.$meta?.version ?? null,
    blocos_ausentes: ausentes,
    divergem: linhas.filter(l => l.estado === 'diverge'),
    iguais: linhas.filter(l => l.estado === 'igual').length,
    sem_correspondencia: linhas.filter(l => l.estado === 'n/d').map(l => `${l.tema}.${l.nome}`),
    renomeados: linhas.filter(l => l.renomeado).map(l => `${l.tema}.${l.nome} -> --${l.nome_css}`),
    pares,
    abaixo_AA_em_producao: pares.filter(p => p.producao.passa === false),
    mentem: pares.filter(p => p.token_melhor_que_producao && p.producao.passa === false),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = reconciliar();
  writeFileSync(join(DESIGN, '.reconciliacao.json'), JSON.stringify(r, null, 2));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

  console.log(`\n  🐮 TOKEN vs PRODUÇÃO   ${r.divergem.length} divergem · ${r.iguais} iguais · ${r.sem_correspondencia.length} sem correspondência\n  ${'─'.repeat(74)}`);
  for (const d of r.divergem) {
    console.log(`  ⚠️  ${(d.tema + '.' + d.nome).padEnd(20)} token ${d.token.padEnd(9)} · produção ${d.producao}`);
  }
  console.log(`\n  CONTRASTE — medido sobre a PRODUÇÃO, não sobre o token\n  ${'─'.repeat(74)}`);
  for (const p of r.pares) {
    const t = p.token.racio === null ? ' n/d ' : p.token.racio.toFixed(2).padStart(5);
    const pr = p.producao.racio === null ? ' n/d ' : p.producao.racio.toFixed(2).padStart(5);
    const ico = p.producao.passa === null ? '  ' : p.producao.passa ? '✅' : p.token_melhor_que_producao ? '🔴' : '❌';
    const prop = p.proposta ? `  → ${p.proposta.proposto} (${p.proposta.para}:1, ΔL ${p.proposta.deltaL > 0 ? '+' : ''}${p.proposta.deltaL})` : '';
    console.log(`  ${ico} ${p.par.padEnd(30)} token ${t} · produção ${pr}${prop}`);
  }
  if (r.mentem.length) {
    console.log(`\n  🔴 ${r.mentem.length} par(es) em que o TOKEN PASSA MELHOR DO QUE A PRODUÇÃO:`);
    console.log('     pontuar contraste pelo token, aqui, é publicar um número que o site não cumpre.');
    for (const m of r.mentem) console.log(`     · ${m.par}: token ${m.token.racio} · produção ${m.producao.racio}`);
  }
  console.log(`\n  detalhe → design/.reconciliacao.json\n`);

  /* ── `--ci`: o buraco que isto fecha ────────────────────────────────────
     `moo-design-check` pontua contraste sobre `moo-tokens.json`. Depois de
     reconciliado, token == produção e os 16 pares passam — que é exactamente o
     estado em que a próxima regressão fica INVISÍVEL: quem mexer só no
     `globals.css` não move o índice um milímetro. Foi assim que `--faint` chegou
     a 2.58:1 sem nada ficar vermelho.
     Aqui falha-se pelos dois motivos: divergir da produção, ou a produção
     falhar AA. */
  if (process.argv.includes('--ci')) {
    const problemas = [];
    if (r.blocos_ausentes.length) problemas.push(`${r.blocos_ausentes.length} bloco(s) de tokens não encontrados no CSS`);
    if (r.divergem.length) problemas.push(`${r.divergem.length} token(s) divergem da produção`);
    if (r.abaixo_AA_em_producao.length) problemas.push(`${r.abaixo_AA_em_producao.length} par(es) abaixo de AA em produção`);
    if (problemas.length) {
      console.error(`  ❌ ${problemas.join(' · ')}\n`);
      process.exit(1);
    }
  }
}
