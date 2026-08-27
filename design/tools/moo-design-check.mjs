#!/usr/bin/env node
/* moo-design-check — o portão do design system do Mooter.
 * Zero LLM, zero rede, zero dependências. Corre em ~1s, cabe no CI e no cron.
 * Oito verificações, cada uma com peso. Saída: .design-check.json + Índice de Coerência Visual 0–10.
 *
 * A tese: um design system sem portão é um <router-hint> — recomendação a 0,23% de obediência.
 * Este ficheiro é o que o torna vinculativo.
 *
 *   node design/tools/moo-design-check.mjs            # relatório
 *   node design/tools/moo-design-check.mjs --ci       # sai 1 abaixo do limiar
 *   node design/tools/moo-design-check.mjs --json     # só JSON
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from './moo-tokens-build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(HERE, '..');
const REPO = process.env.MOO_REPO ? resolve(process.env.MOO_REPO) : resolve(DESIGN, '..');
const LIMIAR = Number(process.env.MOO_LIMIAR ?? 8);

// ── configuração: os alvos reais do Mooter ──────────────────────────────
const SUPERFICIES_UI = [
  'landing/app/globals.css',
  'tools/cockpit/moo-pilot-shell.html',
  'plugin/mooter/skills/cockpit/cockpit.html',
  'plugin/mooter/skills/cockpit/moo-panel.html',
  'packages/mooter-bridge/fleet-ui.html',
];
const SUPERFICIES_TEXTO = [
  'landing/app', 'plugin/mooter', 'packages/mooter-bridge',
  'README.md', 'marketplace.json', '.claude-plugin/marketplace.json',
];
const TOKENS_PROTEGIDOS = /^\s*--(bg|bg-2|surface|surface-2|line|ink|panel|text|muted|faint|accent|accent-2|ok|warn|bad|dead|mono|sans|r|radius|tier-\d)\s*:/gm;
const IGNORAR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'worktrees']);
const EXT_TEXTO = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.html', '.css', '.md', '.json', '.yaml', '.yml']);
const EXT_SVG = new Set(['.svg']);
/* Um ficheiro de teste e onde a decisao se DEFENDE, nao onde se viola. Sem esta
   exclusao o portao marcava `wave11-landing.test.ts:18`
   — `expect(src).not.toContain('up to 90% less cost')` — como claim proibido. */
const E_TESTE = (f) => /[.](test|spec)[.][jt]sx?$|(^|[/])__tests__[/]/.test(f);

const T = JSON.parse(readFileSync(join(DESIGN, 'tokens/moo-tokens.json'), 'utf8'));

/* ── O portao recusa-se a medir o que nao e o repo ──────────────────────
   `n/d` sai do denominador por desenho — "nao medido nao conta, e nao e zero".
   Isso esta certo, e e tambem exactamente como se cega este ficheiro: apontar
   `MOO_REPO` a uma pasta sem superficies punha as tres verificacoes pesadas a
   `n/d`, deixava as que nao dependem do repo a passar, e o indice SUBIA.

     MOO_REPO=design/brand node moo-design-check.mjs --ci   ->  8.75/10, exit 0
     (o mesmo repo, medido a serio, dava 3.41)

   Medido a 2026-08-27. Um portao que pontua melhor quanto menos ve e pior do
   que portao nenhum, porque publica um numero que ninguem sabe estar vazio. */
const UI_AUSENTES = SUPERFICIES_UI.filter(f => !existsSync(join(REPO, f)));
const TEXTO_PRESENTES = SUPERFICIES_TEXTO.filter(f => existsSync(join(REPO, f)));
if (UI_AUSENTES.length === SUPERFICIES_UI.length && TEXTO_PRESENTES.length === 0) {
  console.error(`
  MOO_REPO nao e um checkout do Mooter: ${REPO}` +
    `
  zero superficies de UI e zero de texto — nao ha nada que medir.` +
    `
  O indice NAO e publicado (seria um numero sobre o vazio).
`);
  process.exit(2);
}

// ── utilitários ─────────────────────────────────────────────────────────
const ler = (p) => { try { return readFileSync(join(REPO, p), 'utf8'); } catch { return null; } };
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
/* `exts` e parametro porque a verificacao 2 precisa de .svg e as de texto nao.
   Ate 2026-08-27 `.svg` nao estava em EXT_TEXTO, e a verificacao 2 filtrava o
   que `andar` lhe dava por `extname(f) !== '.svg'` — descartava 100% do que
   recebia. Medido: 2783 ficheiros varridos, 0 svg, `variantes: []` SEMPRE.
   Dava 1,5/1,5 com 8 variantes vivas no repo. Um portao que nao pode morder
   nao e um portao.

   O caminho sai normalizado com `/`: no Windows `join` devolve barra
   invertida, e o `f.includes('design/brand/')` da verificacao 2 nunca
   coincidiria — os seis desenhos canonicos auto-denunciavam-se como variantes,
   so nesta plataforma. */
function* andar(dir, prof = 0, exts = EXT_TEXTO) {
  if (prof > 8) return;
  let ents; try { ents = readdirSync(join(REPO, dir)); } catch { return; }
  for (const e of ents) {
    if (IGNORAR.has(e) || e.startsWith('.') && e !== '.claude-plugin') continue;
    const rel = join(dir, e);
    let st; try { st = statSync(join(REPO, rel)); } catch { continue; }
    if (st.isDirectory()) yield* andar(rel, prof + 1, exts);
    else if (exts.has(extname(e))) yield rel.split(String.fromCharCode(92)).join('/');
  }
}
const alvosTexto = () => {
  const out = new Set();
  for (const s of SUPERFICIES_TEXTO) {
    const abs = join(REPO, s);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) for (const f of andar(s)) out.add(f);
    else out.add(s);
  }
  return [...out];
};
// WCAG 2.x
const lum = (hex) => {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255)
    .map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const rácio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const pick = (path) => path.split('.').reduce((o, k) => o?.[k], T.color);

// ── as sete verificações ────────────────────────────────────────────────
const V = [];
const reg = (id, nome, peso, r) => V.push({ id, nome, peso, ...r });

// 1 · FONTE ÚNICA (2.0) — nenhum token de marca definido fora do ficheiro gerado
{
  const falhas = [];
  let vistos = 0;
  for (const f of SUPERFICIES_UI) {
    const s = ler(f); if (s === null) continue;
    vistos++;
    const m = [...s.matchAll(TOKENS_PROTEGIDOS)].map(x => x[1]);
    if (m.length) falhas.push({ ficheiro: f, tokens: [...new Set(m)].sort(), n: m.length });
  }
  reg('fonte-unica', 'Fonte única de tokens', 2.0, vistos === 0
    ? { estado: 'n/d', porque: 'nenhuma superfície de UI encontrada em MOO_REPO', pontos: null }
    : { estado: falhas.length ? 'falha' : 'passa', achados: falhas,
        total: falhas.reduce((a, b) => a + b.n, 0),
        pontos: falhas.length ? 0 : 2.0,
        porque: falhas.length
          ? `${falhas.reduce((a, b) => a + b.n, 0)} definições de token fora de moo-ui.css, em ${falhas.length} ficheiro(s)`
          : `${vistos} superfícies, zero tokens redefinidos` });
}

// 2 · MARCA ÚNICA (1.5) — um só desenho, sha travado, sem variantes vivas
{
  let canon = ler('design/brand/mooter-mark.svg');
  if (canon === null) { try { canon = readFileSync(join(DESIGN, 'brand/mooter-mark.svg'), 'utf8'); } catch { canon = null; } }
  const shaCanon = canon ? sha(canon) : null;
  const variantes = [];
  for (const f of andar('.', 0, EXT_SVG)) {
    if (f.includes('design/brand/')) continue;
    const s = ler(f); if (!s) continue;
    if (/M21\.976 31h-7\.951|M22 31h-8C9 31/.test(s)) variantes.push(f);
  }
  const legado = variantes.filter(f => /legacy|frugal|creme|cream/i.test(f));
  if (!canon) { reg('marca-unica', 'Marca única', 1.5, { estado: 'n/d', porque: 'design/brand/mooter-mark.svg ausente', pontos: null }); } else
  reg('marca-unica', 'Marca única', 1.5, {
    estado: variantes.length ? 'aviso' : 'passa',
    sha: shaCanon, variantes, legado,
    pontos: legado.length ? 0 : variantes.length ? 0.75 : 1.5,
    porque: legado.length ? `${legado.length} variante(s) legado vivas`
      : variantes.length ? `${variantes.length} cópia(s) da vaca fora de design/brand/ — gerar, não copiar`
      : `um só desenho, sha ${shaCanon}`,
  });
}

// 3 · NÚMERO HONESTO (2.0) — nenhum claim morto em superfície nenhuma
//
// A primeira corrida desta verificação deu 243 achados. Medidos um a um a
// 2026-08-27, ~2 eram claims. O resto era o oposto de um claim:
//
//   · 100 de 218 `savings` eram IDENTIFICADORES — `savings_usd` é uma coluna D1
//     viva (`hub/migrations/003_deltas_savings.sql:3`), um campo de resposta HTTP
//     e o nome da tool MCP `mooter_get_savings`. Chegar a 2,0/2,0 por substring
//     obrigava a renomear colunas em produção.
//   · 15 de 15 `47%` eram COMENTÁRIOS a explicar que o número foi retirado.
//   · um deles era `landing/app/_components/wave11-landing.test.ts:18` —
//     `expect(src).not.toContain('up to 90% less cost')`, isto é, o TESTE que
//     defende a decisão, marcado como violação da decisão.
//
// E o claim vivo escapava: `landing/app/onboarding/_lib/estimate.ts:26` compõe
// "…% less than Opus-only" a partir de uma conta, por isso nenhuma das cinco
// substrings aparece no código-fonte.
//
// Um portão que marca a sua própria prova e falha o claim real ensina a ser
// ignorado — que é exactamente o destino do `<router-hint>` a 0,23%.
{
  const achados = [];
  /* Um ficheiro de teste é onde a decisão se DEFENDE, não onde se viola. */
  const alvos = alvosTexto().filter(f => !E_TESTE(f));
  /* Um comentário é o REGISTO de que o claim foi retirado. Preserva-se a
     contagem de linhas para que `linha` continue a apontar ao sítio certo. */
  const semComentarios = (txt) => txt.split('\n').map(l => l
    .replace(/<!--.*?-->/g, ' ')
    .replace(/\/\*.*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/, '$1')
    .replace(/^\s*[*]\s.*$/, '')
    .replace(/^\s*(\/\*|\{\/\*).*$/, ''));
  /* Um claim que é PALAVRA (`savings`) não é um claim por si: é o nome de uma
     coluna, e é também a palavra honesta de `README.md:170` — "Savings vs naive
     Opus | not measured". O que a decisão de 2026-08-24 proíbe é PUBLICAR UM
     NÚMERO de poupança. Por isso uma palavra só conta com uma cifra ou uma
     percentagem ao lado, na mesma linha. Os claims com `%` ou `$` no literal já
     trazem o número, e batem à letra. */
  const E_PALAVRA = (c) => /^[a-z]+$/i.test(c);
  const LIMITE = /[A-Za-z0-9_$]/;
  const VALOR = /\$\s?[\d{]|~?\d+(?:[.,]\d+)?\s*%|\{[^}]*\}\s*%/;
  const PERTO = 48;
  const padroes = (T.numero.claims_padroes ?? []).map(([nome, re]) => [nome, new RegExp(re, 'i')]);

  for (const f of alvos) {
    const bruto = ler(f); if (!bruto) continue;
    const cru = bruto.split('\n');
    const limpo = semComentarios(bruto);
    for (let li = 0; li < limpo.length; li++) {
      const L = limpo[li];
      if (!L.trim()) continue;
      const excerto = () => cru[li].trim().slice(0, 110);
      for (const claim of T.numero.claims_banidos) {
        const palavra = E_PALAVRA(claim);
        const alvo = palavra ? L.toLowerCase() : L;
        const agulha = palavra ? claim.toLowerCase() : claim;
        let i = -1;
        while ((i = alvo.indexOf(agulha, i + 1)) !== -1) {
          if (palavra) {
            if (LIMITE.test(L[i - 1] ?? '') || LIMITE.test(L[i + claim.length] ?? '')) continue;
            const janela = L.slice(Math.max(0, i - PERTO), i + claim.length + PERTO);
            if (!VALOR.test(janela)) continue;
          }
          achados.push({ ficheiro: f, linha: li + 1, claim, excerto: excerto() });
        }
      }
      for (const [nome, re] of padroes) {
        if (re.test(L)) achados.push({ ficheiro: f, linha: li + 1, claim: nome, excerto: excerto() });
      }
    }
  }
  reg('numero-honesto', 'Número honesto', 2.0, alvos.length === 0
    ? { estado: 'n/d', porque: 'nenhuma superfície de texto encontrada', pontos: null }
    : { estado: achados.length ? 'falha' : 'passa', achados: achados.slice(0, 60), total: achados.length,
        ficheiros: new Set(achados.map(a => a.ficheiro)).size,
        pontos: achados.length ? 0 : 2.0,
        porque: achados.length
          ? `${achados.length} claim(s) proibido(s) vivos em ${new Set(achados.map(a => a.ficheiro)).size} ficheiro(s) (decisão 2026-08-24)`
          : `${alvos.length} ficheiros varridos, zero claims proibidos` });
}

// 4 · GERAR, NÃO COPIAR (1.5) — a saída bate certo com a fonte
{
  const esperado = build();
  const pares = [['tokens/moo-ui.css', esperado.css], ['tokens/moo-tokens.ts', esperado.ts]];
  const derivou = pares.filter(([p, exp]) => {
    try { return readFileSync(join(DESIGN, p), 'utf8') !== exp; } catch { return true; }
  }).map(([p]) => p);
  reg('gerar-nao-copiar', 'Gerar, nunca copiar', 1.5, {
    estado: derivou.length ? 'falha' : 'passa', derivou,
    pontos: derivou.length ? 0 : 1.5,
    porque: derivou.length ? `${derivou.join(', ')} diverge(m) de moo-tokens.json — correr moo-tokens-build`
                           : 'css e ts idênticos ao que a fonte gera',
  });
}

// 5 · MOVIMENTO SEGURO (1.0) — só transform/opacity, e reduced-motion sempre
{
  const maus = [], semGuarda = [];
  /* Só folhas de estilo. Antes disto a lista incluía `moo-tokens-build.mjs`, e o
     portão lintava o TEMPLATE do próprio gerador como se fosse CSS. */
  const alvosMov = [...SUPERFICIES_UI, ...andar('design')].filter(f => /[.](css|html)$/.test(f));
  let vistosMov = 0;
  for (const f of alvosMov) {
    const s = ler(f); if (!s) continue; vistosMov++;
    /* O padrão antigo era `@keyframes[^{]+{(.*?)\n\s*}` — não-guloso até ao
       primeiro `\n  }`. Num keyframe escrito NUMA linha (como os três de
       `moo-ui.css`) esse fecho só aparece muito mais à frente: o bloco capturado
       engolia os três keyframes, o `:focus-visible` e o `@media
       prefers-reduced-motion`. Daí o portão acusar `moo-ui.css` — o seu próprio
       ficheiro gerado — de animar `transition-duration`, e os cockpits de animar
       `button`, `params` e `white-space`. Medido a 2026-08-27: 45 propriedades
       fabricadas em 5 ficheiros escondiam 3 violações reais.
       Este fecha um nível de aninhamento, que é o que um keyframe tem. */
    const kf = [...s.matchAll(/@keyframes[^{]+[{]((?:[^{}]*[{][^{}]*[}])*[^{}]*)[}]/g)].map(m => m[1]);
    if (!kf.length) continue;
    const props = new Set();
    /* Âncora `(?:^|[{;])`: numa linha só, a declaração vem depois de `{` ou `;`,
       nunca no início da linha. `^\s*` fazia passar por propriedade o próprio
       selector (`0%,100%` → nada, mas `button` → sim). */
    kf.forEach(b => [...b.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:/gm)].forEach(m => props.add(m[1])));
    const proibidas = [...props].filter(p => !['transform', 'opacity', 'filter', 'stroke-dashoffset'].includes(p));
    if (proibidas.length) maus.push({ ficheiro: f, propriedades: proibidas });
    if (!/prefers-reduced-motion/.test(s)) semGuarda.push(f);
  }
  const n = maus.length + semGuarda.length;
  /* Sem esta guarda a verificação dizia "só transform/opacity, e todos com guarda
     de movimento reduzido" tendo lido ZERO ficheiros. Não medido é `n/d`. */
  reg('movimento-seguro', 'Movimento seguro', 1.0, vistosMov === 0
    ? { estado: 'n/d', porque: 'nenhuma folha de estilo legível em MOO_REPO', pontos: null }
    : {
    estado: n ? 'falha' : 'passa', repinta: maus, sem_guarda: semGuarda, vistos: vistosMov,
    pontos: n ? 0 : 1.0,
    porque: n ? `${maus.length} ficheiro(s) animam propriedades que repintam · ${semGuarda.length} sem prefers-reduced-motion`
              : `${vistosMov} folhas · só transform/opacity, e todas com guarda de movimento reduzido`,
  });
}

// 6 · CONTRASTE (1.5) — WCAG AA sobre os pares declarados
{
  const linhas = T.contraste.pares.map(([fg, bg]) => {
    const a = pick(fg), b = pick(bg);
    const r = a && b ? +rácio(a, b).toFixed(2) : null;
    return { par: `${fg} sobre ${bg}`, hex: `${a} / ${b}`, racio: r,
             passa: r === null ? null : r >= T.contraste.minimo_normal,
             grande_ok: r !== null && r >= T.contraste.minimo_grande };
  });
  const falha = linhas.filter(l => l.passa === false);
  const soGrande = falha.filter(l => l.grande_ok);
  reg('contraste', 'Contraste AA', 1.5, {
    estado: falha.length === 0 ? 'passa' : soGrande.length === falha.length ? 'aviso' : 'falha',
    pares: linhas,
    abaixo_AA: falha.map(l => {
      const k = l.par.split(' sobre ')[0];
      const c = T.contraste.correccoes_propostas?.[k];
      return `${l.par} = ${l.racio}:1` + (c?.proposto ? ` → proposto ${c.proposto} (${c.para}:1)` : '');
    }),
    pontos: falha.length === 0 ? 1.5 : soGrande.length === falha.length ? 0.75 : 0,
    porque: falha.length === 0 ? `${linhas.length} pares, todos ≥ ${T.contraste.minimo_normal}:1`
      : `${falha.length} par(es) abaixo de AA — correcção calculada em moo-tokens.json, por aplicar`,
  });
}

// 7 · SUPERFÍCIES VIVAS (0.5) — nenhuma skill anuncia o que já morreu
{
  /* `vscode-extension` saiu da lista, e a razão importa: `packages/vscode-extension/`
     está VIVO — último commit 2026-08-20, publicado no VS Marketplace por
     `.github/workflows/publish-cockpit.yml`, e `packages/mooter-bridge/server.js:25`
     requer-lhe um ficheiro em runtime. O único achado que esta verificação produzia
     era `packages/mooter-bridge/README.md:24`, uma nota de dependência sobre um
     pacote que existe: 1 achado, 100% falso positivo. Uma verificação cujo único
     achado é falso ensina a ignorá-la. Ficam as duas superfícies mesmo paradas:
     a TUI de 2026-04-19 e o `dashboard/` Next.js de 2026-05-05. */
  const mortas = ['mooter dashboard', 'moo-dashboard'];
  const achados = [];
  let vistosVivas = 0;
  for (const f of alvosTexto()) {
    if (!/SKILL[.]md$|marketplace[.]json$|README[.]md$/.test(f)) continue;
    const s = ler(f); if (!s) continue; vistosVivas++;
    mortas.forEach(m => { if (s.includes(m)) achados.push({ ficheiro: f, anuncia: m }); });
  }
  reg('superficies-vivas', 'Superfícies vivas', 0.5, vistosVivas === 0
    ? { estado: 'n/d', porque: 'nenhum SKILL.md/README.md/marketplace.json em MOO_REPO', pontos: null }
    : {
    estado: achados.length ? 'aviso' : 'passa', achados, vistos: vistosVivas,
    pontos: achados.length ? 0 : 0.5,
    porque: achados.length ? `${achados.length} anúncio(s) de superfície parada`
                           : `${vistosVivas} ficheiros · nada anuncia superfície morta`,
  });
}

// 8 · LINGUAGEM (1.0) — as DIRETRIZES que viram grep
{
  const banidos = [];
  const EAS_OK = ['.16,1,.3,1','.2,.8,.2,1','.45,0,.55,1','.3,1.3,.5,1',
                  '0.16, 1, 0.3, 1','0.2, 0.8, 0.2, 1','0.45, 0, 0.55, 1','0.3, 1.3, 0.5, 1'];
  const RAIO_OK = new Set([0,2,3,4,6,7,8,9,10,11,12,14,16,999]);
  const alvos = [...SUPERFICIES_UI, ...andar('design')].filter(f => /\.(html|css|tsx?|jsx?)$/.test(f));
  let vistos = 0;
  for (const f of alvos) {
    const s = ler(f); if (!s) continue; vistos++;
    // regra 1 — barra de acento à esquerda com fundo tingido
    const barras = (s.match(/border-left:\s*[3-9]px solid/g) || []).length;
    if (barras) banidos.push({ ficheiro: f, regra: 1, o_que: 'barra de acento à esquerda', n: barras });
    // regra 9 — curva fora da família
    const curvas = [...s.matchAll(/cubic-bezier\(([^)]+)\)/g)].map(m => m[1].replace(/\s/g,''))
      .filter(c => !EAS_OK.some(k => k.replace(/\s/g,'') === c));
    if (curvas.length) banidos.push({ ficheiro: f, regra: 9, o_que: 'curva fora da família',
      n: curvas.length, exemplos: [...new Set(curvas)].slice(0,3) });
    // escala de raios
    const raios = [...s.matchAll(/border-radius:\s*(\d+)px/g)].map(m => +m[1]).filter(v => !RAIO_OK.has(v));
    if (raios.length) banidos.push({ ficheiro: f, regra: 0, o_que: 'raio fora da escala',
      n: raios.length, exemplos: [...new Set(raios)].slice(0,4) });
  }
  const n = banidos.reduce((a,x) => a + x.n, 0);
  /* `banidos.length` são REGISTOS de achado, não ficheiros: 8 registos em 4
     ficheiros liam-se como "8 ficheiro(s)". Número errado num portão que existe
     para exigir números certos. */
  const nFich = new Set(banidos.map(b => b.ficheiro)).size;
  reg('linguagem', 'Linguagem visual', 1.0, vistos === 0
    ? { estado: 'n/d', porque: 'nenhuma superfície legível', pontos: null }
    : { estado: n ? 'falha' : 'passa', achados: banidos, total: n, ficheiros: nFich,
        pontos: n ? 0 : 1.0,
        porque: n ? `${n} violação(ões) das DIRETRIZES em ${nFich} ficheiro(s)`
                  : `${vistos} ficheiros · zero barras, zero curvas fora da família, zero raios fora da escala` });
}

// ── índice ──────────────────────────────────────────────────────────────
const contam = V.filter(v => v.pontos !== null);
const possivel = contam.reduce((a, v) => a + v.peso, 0);
const obtido = contam.reduce((a, v) => a + v.pontos, 0);
const indice = possivel ? +(obtido / possivel * 10).toFixed(2) : null;
const nd = V.filter(v => v.pontos === null).map(v => v.id);

const rel = {
  gerado_em: new Date().toISOString(),
  repo: REPO, tokens_versao: T.$meta.version,
  indice_coerencia_visual: indice,
  possivel: +possivel.toFixed(1), obtido: +obtido.toFixed(2),
  nao_medido: nd,
  /* Uma superfície que não existe era saltada em silêncio por todas as
     verificações (`if (!s) continue`) e o portão pontuava 4 superfícies dizendo
     5. Declarar a ausência é a mesma regra do `n/d`. */
  superficies_ausentes: UI_AUSENTES,
  limiar: LIMIAR,
  passa: indice !== null && indice >= LIMIAR,
  verificacoes: V,
};
writeFileSync(join(DESIGN, '.design-check.json'), JSON.stringify(rel, null, 2));

if (process.argv.includes('--json')) { console.log(JSON.stringify(rel, null, 2)); }
else {
  const ico = { passa: '✅', aviso: '⚠️ ', falha: '❌', 'n/d': '  ' };
  console.log(`\n  🐮 ÍNDICE DE COERÊNCIA VISUAL   ${indice === null ? 'n/d' : indice.toFixed(2)} / 10` +
              `   (limiar ${LIMIAR})\n  ${'─'.repeat(66)}`);
  for (const v of V) {
    const p = v.pontos === null ? ' n/d ' : `${v.pontos.toFixed(1)}/${v.peso.toFixed(1)}`;
    console.log(`  ${ico[v.estado] ?? '  '} ${v.nome.padEnd(24)} ${p.padStart(8)}   ${v.porque}`);
  }
  if (nd.length) console.log(`\n  n/d: ${nd.join(', ')} — não medido não conta para o índice, e não é zero.`);
  console.log(`\n  detalhe → design/.design-check.json\n`);
}
if (process.argv.includes('--ci') && !rel.passa) process.exit(1);
