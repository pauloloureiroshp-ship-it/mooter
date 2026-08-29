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
import { blocoDeTokens, aplicar as aplicarInline, ALVOS as ALVOS_INLINE } from './moo-inline-sync.mjs';

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
/* A mesma lista, mas a CAPTURAR o valor. Sem o valor não se distingue um
   RE-EXPORT — `--bg: var(--moo-papel-bg)`, que tem fonte única — de uma
   REDEFINIÇÃO — `--bg: #F2ECDF`, que tem duas. A verificação 1 media nome em vez
   de fonte, e por isso pedia o impossível: apagar nomes que ~700 sítios usam. */
const TOKENS_PROTEGIDOS_V = /^\s*--(bg|bg-2|surface|surface-2|line|ink|panel|text|muted|faint|accent|accent-2|ok|warn|bad|dead|mono|sans|r|radius|tier-\d)\s*:\s*([^;]+);/gm;
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

// 1 · FONTE ÚNICA (2.0) — nenhum token de marca com VALOR próprio fora do gerado
//
// A primeira versão contava qualquer linha `--bg:` como redefinição. Isso não é
// "fonte única": é "nome único", que é outra coisa e é impossível de cumprir.
// Medido a 2026-08-27, das 28 linhas que apanhava em `globals.css`, 4 já eram
// `var(...)` — re-exports de um valor definido noutro sítio.
//
// A distinção que importa é a do VALOR. `--bg: var(--moo-papel-bg)` tem uma
// fonte única: o ficheiro gerado. `--bg: #F2ECDF` tem duas. A regra passa a ser
// essa, e é o que torna a migração possível: `landing/app/globals.css` liga-se
// aos tokens sem tocar nos ~700 sítios que já usam `var(--bg)`.
//
// Exigir o `@import` é a outra metade: um `var(--moo-…)` num ficheiro que não
// importa `moo-ui.css` resolve para nada, e a cor desaparece. Já aconteceu neste
// commit — os `--tier-*` apontavam a `--moo-tier-papel-t0`, que o gerador não
// emitia; 8 valores resolveram para string vazia e só um diff de valores
// resolvidos o apanhou.
{
  const falhas = [];
  const ligadas = [];
  let vistos = 0;
  for (const f of SUPERFICIES_UI) {
    const s = ler(f); if (s === null) continue;
    vistos++;
    const importa = /@import\s+['"][^'"]*moo-ui\.css['"]/.test(s)
                 || /--moo-[\w-]+\s*:/.test(s);   // ou traz o CSS inline
    const proprios = [];
    const origens = new Set();
    for (const m of s.matchAll(TOKENS_PROTEGIDOS_V)) {
      const valor = (m[2] || '').trim();
      /* Três origens, e só uma é defeito.
         · `var(--moo-…)`  — o ficheiro gerado. É o alvo.
         · `var(--outra)`  — outra variável. Também não duplica um valor: delega.
           `packages/mooter-bridge/fleet-ui.html` faz isto DE PROPÓSITO com
           `var(--color-background-primary, transparent)`: corre dentro do VS Code
           e herda o tema do editor. Obrigá-lo a ler os tokens do Mooter partia a
           integração — é desenho, não dívida.
         · um literal      — `#f5f6f8`. Aqui sim: o valor existe em dois sítios, e
           é a colisão que a decisão de 27/08 nomeia.
         O `importa` só é exigido para `var(--moo-…)`: sem o CSS carregado, essa
         variável resolve para nada e a cor desaparece. */
      if (/^var\(\s*--moo-[\w-]+/.test(valor)) {
        if (importa) { origens.add('gerado'); continue; }
        proprios.push({ token: m[1], valor: valor.slice(0, 60), porque: 'aponta a --moo-* sem importar moo-ui.css — resolve para nada' });
        continue;
      }
      if (/^var\(/.test(valor)) { origens.add('delegado'); continue; }
      proprios.push({ token: m[1], valor: valor.slice(0, 60), porque: 'valor literal — existe também no ficheiro gerado' });
    }
    if (proprios.length) {
      falhas.push({ ficheiro: f, importa_moo_ui: importa, origens: [...origens],
        tokens: [...new Set(proprios.map(p => p.token))].sort(), n: proprios.length,
        exemplos: proprios.slice(0, 4) });
    } else ligadas.push({ ficheiro: f, origens: [...origens] });
  }
  const n = falhas.reduce((a, b) => a + b.n, 0);
  reg('fonte-unica', 'Fonte única de tokens', 2.0, vistos === 0
    ? { estado: 'n/d', porque: 'nenhuma superfície de UI encontrada em MOO_REPO', pontos: null }
    : { estado: falhas.length ? 'falha' : 'passa', achados: falhas, total: n,
        superficies_ligadas: ligadas, vistos,
        pontos: falhas.length ? 0 : 2.0,
        porque: falhas.length
          ? `${n} token(s) com valor próprio em ${falhas.length} de ${vistos} superfícies — ${ligadas.length} já ligada(s) ao gerado`
          : `${vistos} superfícies, todas a ler do ficheiro gerado` });
}

// 2 · MARCA ÚNICA (1.5) — a silhueta é intocável, a paleta velha não vive
//
// A primeira versão contava «qualquer SVG com a vaca fora de design/brand/» e
// chamava-lhe variante. Medido a 2026-08-27, isso dava 8 achados — e nenhum
// deles era o defeito que a decisão descreve. A decisão diz uma coisa concreta:
// «a silhueta é INTOCÁVEL — onze paths, coordenada a coordenada». Medido path a
// path, a silhueta não derivou em lado nenhum: os 8 ficheiros carregam os mesmos
// `d`, ao byte. O que os distingue é o enquadramento (um tem um azulejo escuro,
// outro um viewBox de sangria) — que é desenho legítimo por superfície, não
// deriva.
//
// Ficheiro estar fora de `design/brand/` não é o defeito. Os defeitos reais são
// três, e são estes que se medem:
//
//   1. a silhueta DERIVOU — um `d` que não é o do canon;
//   2. a paleta SUPERSEDED (creme #F5EDD4 + laranja #FF6B35, que o `SPEC.md` §4
//      de Junho ainda manda) a viver numa superfície VIVA;
//   3. um logo LEGADO vivo — o `mooter-logo-legacy.svg`, o "F" teal do frugal,
//      que era servido em mooter.ai com zero referências em código.
//
// `_handoff/_archive/` fica de fora do resultado, e é uma excepção DECLARADA,
// não um silêncio: por `AGENTS.md` § Information architecture o arquivo é
// história imutável, e os quatro ficheiros creme de Junho são o registo do que
// foi decidido então. Apagá-los para o portão ficar verde seria apagar a prova
// de que a decisão de 27/08 mudou alguma coisa. Aparecem contados à parte.
{
  let canon = ler('design/brand/mooter-mark.svg');
  if (canon === null) { try { canon = readFileSync(join(DESIGN, 'brand/mooter-mark.svg'), 'utf8'); } catch { canon = null; } }
  const shaCanon = canon ? sha(canon) : null;
  const paths = (s) => [...s.matchAll(/\sd="([^"]+)"/g)].map(m => m[1].trim());
  const canonPaths = canon ? new Set(paths(canon)) : new Set();
  /* A escada de redução perde formas de propósito: «16 = duas formas». Um
     desenho declarado na escada não tem de trazer os onze paths. */
  const ESCADA = /mooter-mark-16\.svg$/;
  const PALETA_VELHA = /#F5EDD4|#FF6B35|#E85D2A|#FBE6C8/i;
  const E_ARQUIVO = (f) => /(^|\/)(_archive|archive)\//.test(f) || f.startsWith('docs/archive/');
  const E_LEGADO = (f) => /legacy|deprecated|frugal-logo/i.test(f);

  const derivou = [], paletaVelha = [], legado = [], arquivadas = [], derivadas = [];
  for (const f of andar('.', 0, EXT_SVG)) {
    if (f.includes('design/brand/')) continue;
    const s = ler(f); if (!s) continue;
    const vaca = /M21\.976 31h-7\.951|M22 31h-8C9 31/.test(s);
    if (!vaca && !E_LEGADO(f)) continue;
    if (E_ARQUIVO(f)) { arquivadas.push(f); continue; }
    if (E_LEGADO(f)) { legado.push(f); continue; }
    const fora = paths(s).filter(d => !canonPaths.has(d));
    if (fora.length && !ESCADA.test(f)) derivou.push({ ficheiro: f, paths_fora_do_canon: fora.length });
    else if (PALETA_VELHA.test(s)) paletaVelha.push(f);
    else derivadas.push(f);
  }

  const graves = derivou.length + paletaVelha.length + legado.length;
  if (!canon) { reg('marca-unica', 'Marca única', 1.5, { estado: 'n/d', porque: 'design/brand/mooter-mark.svg ausente', pontos: null }); } else
  reg('marca-unica', 'Marca única', 1.5, {
    estado: graves ? 'falha' : 'passa',
    sha: shaCanon, silhueta_derivou: derivou, paleta_superseded: paletaVelha, legado,
    /* Declaradas, não escondidas — a mesma régua do «contraste novo 0 · declarado 5». */
    derivadas_na_marca: derivadas, arquivadas_ignoradas: arquivadas,
    pontos: graves ? 0 : 1.5,
    porque: graves
      ? [derivou.length && `${derivou.length} com a silhueta derivada`,
         paletaVelha.length && `${paletaVelha.length} na paleta creme+laranja`,
         legado.length && `${legado.length} logo legado vivo`].filter(Boolean).join(' · ')
      : `silhueta intacta em ${derivadas.length} superfície(s) derivada(s), sha ${shaCanon}`
        + ` · ${arquivadas.length} arquivada(s) declarada(s) e fora do resultado`,
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
  const semComentarios = (txt) => {
    /* Um bloco ``` num markdown é a DOCUMENTAÇÃO DE UM FORMATO, não copy.
       `README.md:148` mostra um exemplo de `router-tuning.json` que contém a
       linha `"Estimated additional savings if patterns demoted: $0.0490."` — é
       o que o ficheiro produz, citado para explicar o que o ficheiro produz.
       Marcá-lo como claim publicado é a mesma classe de erro que marcar o
       comentário que regista a retirada: o portão a acusar o registo em vez do
       facto. As linhas mantêm-se (só o conteúdo é apagado) para o número de
       linha continuar a apontar ao sítio certo. */
    let dentro = false;
    return txt.split('\n').map(l => {
      if (/^\s*```/.test(l)) { dentro = !dentro; return ''; }
      if (dentro) return '';
      return l
        .replace(/<!--.*?-->/g, ' ')
        .replace(/\/\*.*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/, '$1')
        .replace(/^\s*[*]\s.*$/, '')
        .replace(/^\s*(\/\*|\{\/\*).*$/, '');
    });
  };
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
  /* `gi` e não `i`: os padrões passaram a correr com `matchAll` sobre o ficheiro
     inteiro, e `matchAll` recusa uma regex sem `g`. Um padrão sem `g` também só
     encontraria a PRIMEIRA ocorrência por ficheiro. */
  /* Duas grafias de proposito: `Modelado` e o identificador (o canon do repo e
     codigo em ingles, mas este componente nasceu com nome portugues e mudar-lhe
     o nome agora era ruido), e `modelled` e o que o utilizador le. Um rotulo que
     so conta numa lingua deixaria passar exactamente os sitios onde o texto
     visivel faz o trabalho. */
  const MARCA_PROVENIENCIA = /modelado|modelled/i;
  const padroes = (T.numero.claims_padroes ?? []).map(([nome, re]) => [nome, new RegExp(re, 'gi')]);
  /* Excepções DECLARADAS, com ficheiro, pedaço da linha e razão escrita — não um
     ficheiro numa lista negra. Se a linha for editada, a excepção deixa de
     coincidir e o claim volta. Um portão sem lista de excepções obriga a mentir
     ou a ignorar; este declara-as e conta-as à parte, como o
     «contraste novo 0 · declarado 5» do auditor visual. */
  const excepcoes = T.numero.claims_excepcoes ?? [];
  const excepcionado = (f, linha) =>
    excepcoes.find(e => f === e.ficheiro && linha.includes(e.contem));
  const declarados = [];

  for (const f of alvos) {
    const bruto = ler(f); if (!bruto) continue;
    const cru = bruto.split('\n');
    const limpo = semComentarios(bruto);
    /* ── Os padrões correm sobre o ficheiro INTEIRO, não linha a linha ──────
       Medido a 2026-08-27, ao olhar para a home renderizada em vez de para o
       relatório: `landing/app/_components/TwoTerminalDemo.tsx` publica
       "One bill is 47% smaller" em corpo gigante, e o portão dava-lhe passagem.
       Duas razões, as duas minhas:

         · `smaller` não estava no vocabulário (só `less|cheaper|menos|off`);
         · e o outro claim, `{pctSaved}%` + `cheaper on this trace`, está
           partido em DUAS linhas (`:342` e `:343`) — como JSX escreve sempre.
           Um matcher por linha nunca o veria.

       Juntar as linhas já limpas de comentário mantém as duas defesas (o
       registo da retirada continua fora) e deixa o padrão atravessar markup.
       O `indice→linha` é reconstruído por contagem de `\n` para o achado
       continuar a apontar ao sítio certo. */
    /* O markup sai, mas o comprimento NÃO muda: cada tag e cada bloco de estilo
       é substituído por espaços em igual número. Assim `indice → linha` continua
       exacto e o achado aponta ao sítio certo — recalcular offsets seria a forma
       fácil de o portão passar a mentir sobre onde está o problema.

       Porquê tirar o markup: o padrão media a FONTE, e em JSX a fonte mete 75
       caracteres de `style={{…}}` entre o número e a palavra. Para os alcançar,
       o padrão tinha de ser tão largo que apanhava `5× cheaper than Opus`
       (dashboard:1908) por causa de um `%` que estava noutra linha qualquer.
       Medindo o TEXTO QUE SAI, o claim fica adjacente e o vizinho inocente
       deixa de ter um `%` por perto. É também o que o leitor vê. */
    /* Os `\n` SOBREVIVEM. Uma tag JSX ocupa várias linhas, e `[^>]*` atravessa-as;
       substituir tudo por espaços mantinha o comprimento mas colapsava as quebras,
       e o achado do `TwoTerminalDemo` saía na linha **142** em vez da 172 — a
       apontar para `width: 7,`. Um portão que diz o ficheiro certo e a linha
       errada gasta o tempo de quem o lê, e ensina a não confiar nele. */
    const brancos = (m) => m.replace(/[^\n]/g, ' ');
    const texto = limpo.join('\n')
      .replace(/style=\{\{[^}]*\}\}/g, brancos)   // estilos inline do JSX
      .replace(/<\/?[a-zA-Z][^>]*>/g, brancos);   // tags de abertura e fecho
    const linhaDe = (idx) => texto.slice(0, idx).split('\n').length;
    const excertoDe = (li) => (cru[li - 1] ?? '').trim().slice(0, 110);
    /* A MARCA LE-SE NA LINHA JA SEM COMENTARIOS, e a razao e uma falha real
       cometida a 2026-08-29 dentro deste mesmo trabalho: em `admin/page.tsx`
       uma cifra foi «marcada» com um comentario JSX — que satisfaz a regex e
       NAO RENDERIZA NADA. O leitor via o numero nu; o portao dizia que estava
       rotulado. E a armadilha «documentar nao corrige» na sua forma mais pura,
       num ficheiro cuja unica funcao e impedi-la.
       `limpo` ja tem os comentarios apagados (com as colunas preservadas), por
       isso so conta a marca que chega ao ecra. */
    const MARCADA = (i) => MARCA_PROVENIENCIA.test(limpo[i] ?? '');

    for (let li = 0; li < limpo.length; li++) {
      const L = limpo[li];
      if (!L.trim()) continue;
      const exc = excepcionado(f, cru[li]);
      if (exc) { declarados.push({ ficheiro: f, linha: li + 1, porque: exc.porque }); continue; }
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
          achados.push({ ficheiro: f, linha: li + 1, claim, excerto: excertoDe(li + 1), marcado: MARCADA(li) });
        }
      }
    }

    for (const [nome, re] of padroes) {
      re.lastIndex = 0;
      for (const m of texto.matchAll(re)) {
        const li = linhaDe(m.index);
        /* A excepção declarada vale para o padrão tal como vale para o literal:
           senão a secção «Honest numbers» do README voltava pela porta lateral. */
        if (excepcionado(f, cru[li - 1] ?? '')) continue;
        achados.push({ ficheiro: f, linha: li, claim: nome, excerto: excertoDe(li), marcado: MARCADA(li - 1) });
      }
    }
  }
  /* ── PUBLICAR ≠ MOSTRAR A QUEM ENTROU ───────────────────────────────────
     ⚠️ Esta é a distinção mais discutível deste ficheiro, e por isso vai
     escrita por extenso em vez de escondida numa lista de excepções.

     A decisão do dono de 2026-08-24 diz «parar de PUBLICAR poupança até haver
     tokens medidos». O que ela trava é o site a afirmar um número sobre
     terceiros: a home, o README, o marketplace, o statusline.

     `landing/app/(app)/` é outra coisa: é a shell autenticada, e os números
     que lá aparecem são os DO PRÓPRIO utilizador, vindos do hub, atrás de
     `decisionsCount > 0` e rotulados `(est.)`. Chamar-lhe "claim publicado" é
     confundir o produto com a publicidade — e, pior, o efeito prático seria
     apagar a funcionalidade em vez de corrigir uma afirmação.

     A pontuação vem da superfície PÚBLICA. Os do produto continuam CONTADOS e
     visíveis no relatório e na frase final: a alternativa era não os contar,
     e um número que ninguém vê é o mesmo que um número que não existe.

     Se o dono decidir que a shell autenticada também não deve mostrar
     estimativas de poupança, isto muda numa linha — `PRODUTO` deixa de ser
     separado — e o índice desce 2,0 pontos até a funcionalidade sair. */
  /* A MARCA DE PROVENIENCIA — `landing/app/(app)/_modelado.tsx`.
     Uma cifra que renderiza COLADA a sua proveniencia nao e um claim: e um
     modelo rotulado, e a diferenca e a unica coisa que a decisao de 2026-08-24
     alguma vez pediu. A marca tem de estar na MESMA linha do numero, e nao
     algures na folha — um rotulo que se afasta do numero perde-se na proxima
     refactorizacao. */
  const E_PRODUTO = (f) => f.replace(/\\/g, '/').includes('landing/app/(app)/');
  const publicos = achados.filter(a => !E_PRODUTO(a.ficheiro));
  /* CONTAR CIFRAS, NAO COINCIDENCIAS. Um achado e uma coincidencia de padrao, e
     a mesma linha casa mais do que um: `you saved $42.10 this month` dispara o
     literal E o padrao. Enquanto isto somava achados, a frase final dizia «14
     modelada(s)» de 8 cifras — um numero inflacionado por construcao, num
     ficheiro cuja unica tese e que os numeros dizem o que parecem dizer.
     `marcado` e propriedade da LINHA, portanto colapsar por ficheiro:linha e
     exacto, nao aproximado. */
  const porLinha = (xs) => [...new Map(xs.map(a => [`${a.ficheiro}:${a.linha}`, a])).values()];
  const noProduto = porLinha(achados.filter(a => E_PRODUTO(a.ficheiro) && !a.marcado));
  const marcadosNoProduto = porLinha(achados.filter(a => E_PRODUTO(a.ficheiro) && a.marcado)).length;

  reg('numero-honesto', 'Número honesto', 2.0, alvos.length === 0
    ? { estado: 'n/d', porque: 'nenhuma superfície de texto encontrada', pontos: null }
    : { estado: publicos.length ? 'falha' : noProduto.length ? 'aviso' : 'passa',
        achados: publicos.slice(0, 60), total: publicos.length,
        ficheiros: new Set(publicos.map(a => a.ficheiro)).size,
        excepcoes_declaradas: declarados,
        /* Contados, nunca escondidos. */
        no_produto_autenticado: noProduto.length,
        no_produto_ficheiros: [...new Set(noProduto.map(a => a.ficheiro))],
        /* Contadas tambem as que JA declaram de onde vem. */
        no_produto_marcadas: marcadosNoProduto,
        /* A METADE FOI LIBERTADA a 2026-08-29 — e a condicao que a prendia
           deixou de existir, nao foi a regua que se mexeu.

           O que aqui estava: «fica presa ate as 15 estimativas sairem do produto
           ou o dono decidir que ficam — e nesse dia isto passa a 2.0 numa linha,
           com a decisao escrita ao lado». A decisao esta escrita, e nao e nenhuma
           das duas que eu tinha previsto.

           As cifras FICAM, porque a shell mostra dados sincronizados de outros
           devices, e nenhum servidor pode medir tokens que nunca lhe passaram
           pelas maos — e e bom que nao possa: os prompts nunca saem da maquina,
           que e a tese do produto. O numero de la e modelado por construcao
           (`savings-tracker.js:441-451`: `saved = naive - real`, os dois
           derivados do COMPRIMENTO DO PROMPT, zero tokens contados).

           O que mudou e que deixaram de ser estimativas apresentadas como
           factos. Cada cifra renderiza colada a sua proveniencia, de uma unica
           fonte (`_modelado.tsx`), e aponta para o numero MEDIDO — `mooter
           recibo`, que le os tokens reais da maquina de quem o corre. Ate
           2026-08-28 a defesa era «real token counts require API access mooter
           doesn't have»; isso deixou de ser verdade e a frase foi corrigida.

           Por isso isto nao e afrouxar a regua: a verificacao passou a medir a
           coisa certa. Antes contava «cifras de poupanca na shell», que castiga
           igualmente um numero honesto e um numero mudo. Agora conta «cifras SEM
           proveniencia declarada», que e o defeito que a decisao de 2026-08-24
           sempre visou. Uma cifra sem marca continua a valer metade.

           Guardado por `design/tools/moo-proveniencia.test.mjs`, que planta uma
           cifra sem marca e exige que ela apareca aqui — e planta a MESMA cifra
           com marca e exige a nota cheia. Sem essa mordida isto era o 10,00
           recusado a 2026-08-27 outra vez, com outra roupa. */
        pontos: publicos.length ? 0 : noProduto.length ? 1.0 : 2.0,
        porque: (publicos.length
          ? `${publicos.length} claim(s) proibido(s) em superfície PÚBLICA, em ${new Set(publicos.map(a => a.ficheiro)).size} ficheiro(s) (decisão 2026-08-24)`
          : `${alvos.length} ficheiros varridos, zero claims em superfície pública`)
          + (noProduto.length ? ` · ⚠️ ${noProduto.length} SEM proveniência na shell autenticada (ver o comentário na verificação 3)` : '')
          + (marcadosNoProduto ? ` · ${marcadosNoProduto} modelada(s) e declarada(s) na shell` : '')
          + (declarados.length ? ` · ${declarados.length} declarado(s)` : '') });
}

// 4 · GERAR, NÃO COPIAR (1.5) — a saída bate certo com a fonte
{
  const esperado = build();
  const pares = [['tokens/moo-ui.css', esperado.css], ['tokens/moo-tokens.ts', esperado.ts]];
  const derivou = pares.filter(([p, exp]) => {
    try { return readFileSync(join(DESIGN, p), 'utf8') !== exp; } catch { return true; }
  }).map(([p]) => p);

  /* ── As CÓPIAS INLINE também contam ─────────────────────────────────────
     Esta verificação media só `moo-ui.css` e `moo-tokens.ts`. Mas duas
     superfícies não podem importar — são servidas por HTTP e empacotadas — e
     por isso trazem o `:root` para dentro do próprio ficheiro. Enquanto isso
     era uma cópia manual com um comentário a dizer "cópia verbatim", ficava
     velha em silêncio.
     Ficou velha no MESMO DIA: `papel.faint` foi corrigido de #9A8F7E (2,70:1)
     para #726859 e as cópias mantiveram o valor velho. O auditor visual
     apanhou-o no sítio mais irónico — o cartucho `MOOTER · COCKPIT · DES. 011`,
     o texto que identifica a folha, a 2,70:1.
     `design/README.md` diz que este pacote existe para tornar isso impossível
     («o cockpit.html esteve 20 dias atrás precisamente por ser cópia»). Uma
     cópia com um comentário a dizer que é cópia continua a ser uma cópia. */
  const bloco = blocoDeTokens(esperado.css);
  const inlineVelhas = [], inlineSemMarcas = [];
  for (const rel of ALVOS_INLINE) {
    const s = ler(rel);
    if (s === null) continue;
    const novo = aplicarInline(s, bloco);
    if (novo === null) inlineSemMarcas.push(rel);
    else if (novo !== s) inlineVelhas.push(rel);
  }

  const mal = derivou.length + inlineVelhas.length + inlineSemMarcas.length;
  reg('gerar-nao-copiar', 'Gerar, nunca copiar', 1.5, {
    estado: mal ? 'falha' : 'passa', derivou,
    inline_desactualizadas: inlineVelhas, inline_sem_marcas: inlineSemMarcas,
    pontos: mal ? 0 : 1.5,
    porque: mal
      ? [derivou.length && `${derivou.join(', ')} diverge(m) de moo-tokens.json`,
         inlineVelhas.length && `${inlineVelhas.length} cópia(s) inline velha(s) — correr moo-inline-sync`,
         inlineSemMarcas.length && `${inlineSemMarcas.length} sem as marcas MOO:TOKENS`].filter(Boolean).join(' · ')
      : `css e ts idênticos à fonte · ${ALVOS_INLINE.length} cópias inline em dia`,
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
  /* ── O que esta verificação NÃO estava a medir ──────────────────────────
     Media só os pares que alguém se lembrou de escrever em `contraste.pares`,
     e depois imprimia "16 pares, todos ≥ 4.5:1" — que se lê como cobertura.
     Não era: `papel.warn` (2,50:1), `papel.faint` (2,70:1) e `papel.accent-2`
     (2,14:1) estavam todos abaixo de AA-GRANDE, todos usados como `color:` em
     produção, e nenhum tinha par. O `warn` só apareceu porque ligar o
     `moo-pilot-shell` aos tokens SUBSTITUIU um literal de 5,23:1 por um token
     de 2,50 — um retrocesso disfarçado de arrumação.
     Agora as cores de primeiro plano sem par saem declaradas. Não medido é
     `n/d`, e um `n/d` que ninguém vê é indistinguível de um verde. */
  const FRENTE = ['text', 'text-2', 'muted', 'faint', 'accent', 'accent-2', 'ok', 'warn', 'bad'];
  const temPar = new Set(T.contraste.pares.map(([fg]) => fg));
  const semPar = [];
  for (const tema of ['tinta', 'papel']) {
    for (const nome of FRENTE) {
      if (T.color[tema]?.[nome] && !temPar.has(`${tema}.${nome}`)) semPar.push(`${tema}.${nome}`);
    }
  }
  reg('contraste', 'Contraste AA', 1.5, {
    estado: falha.length === 0 ? 'passa' : soGrande.length === falha.length ? 'aviso' : 'falha',
    pares: linhas,
    abaixo_AA: falha.map(l => {
      const k = l.par.split(' sobre ')[0];
      const c = T.contraste.correccoes_propostas?.[k];
      return `${l.par} = ${l.racio}:1` + (c?.proposto ? ` → proposto ${c.proposto} (${c.para}:1)` : '');
    }),
    /* Declarado, não escondido: uma cor de primeiro plano sem par é uma cor que
       esta verificação NÃO mede, e dizê-lo é a diferença entre cobertura e
       aparência de cobertura. */
    sem_par_declarado: semPar,
    pontos: falha.length === 0 ? 1.5 : soGrande.length === falha.length ? 0.75 : 0,
    porque: (falha.length === 0 ? `${linhas.length} pares, todos ≥ ${T.contraste.minimo_normal}:1`
      : `${falha.length} par(es) abaixo de AA — correcção calculada em moo-tokens.json, por aplicar`)
      + (semPar.length ? ` · ⚠️ ${semPar.length} cor(es) de texto SEM par: ${semPar.join(', ')}` : ''),
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
  /* A familia das quatro curvas era um segundo Set escrito a mao, com cada uma
     duas vezes por causa do `0.` opcional. Passa a sair de `T.motion`, onde ja
     vivia (`sopro`, `saudar`, `entrada`, ...), normalizada uma vez em vez de
     duplicada: `0.16,1,0.3,1` e `.16,1,.3,1` sao a mesma curva. Verificado a
     2026-08-28 que o token cobre exactamente as quatro que estavam aqui. */
  const normCurva = (c) => String(c).replace(/\s/g, '').replace(/(^|,)0\./g, '$1.');
  const EAS_OK = (() => {
    const set = new Set();
    (function colhe(o) {
      if (!o) return;
      if (typeof o === 'string') {
        const m = o.match(/cubic-bezier\(([^)]+)\)/);
        if (m) set.add(normCurva(m[1]));
        return;
      }
      if (typeof o === 'object') Object.values(o).forEach(colhe);
    })(T.motion);
    return [...set];
  })();
  /* DIVERGÊNCIA RESOLVIDA a 2026-08-28. O que aqui estava, e porquê:

     Esta escala era escrita à mão — `new Set([0,1,2,3,4,6,7,8,9,10,11,12,14,16,999])`
     — e NÃO derivava de `moo-tokens.json`. Uma terceira fonte de verdade dentro
     do ficheiro cuja tese é que a fonte é o JSON. O comentário anterior dizia
     porque não se corrigia, e a razão era boa: derivá-la dos tokens foi tentado a
     2026-08-27 e passava de 40 para **118** violações, porque 7, 8, 9, 11 e 12
     estavam em uso legítimo por todo o lado. E terminava assim:

       «Unificar isto com moo-tokens.json é trabalho de desenho, com o dono, e tem
        de vir com a lista de sítios a mudar — não com um `Set` novo.»

     Foi isso que aconteceu. O dono pediu-o, e a resolução começou pelo lado certo:
     **a escala e que estava incompleta, não o código.** Cinco degraus cujo mais
     pequeno era 6 não descrevem chrome real — um raio de 6 numa barra de 3px de
     altura está errado — e a prova estava na própria saída do sistema: o
     `moo-ui.css` GERADO trazia `border-radius: 2px` no anel de `:focus-visible`,
     cravado no gerador, com o 2 fora da escala.

     Medido antes de decidir: 166 ocorrências fora da escala em 24 ficheiros, com
     8 (44x), 4 (26x) e 7 (22x) no topo. A escala ganhou os três degraus que o
     trabalho real usa — `hairline: 2`, `tight: 4`, `panel: 8` — e NÃO o 12, para
     não virar uma rampa de 2 em 2. Depois mudaram-se os 54 sítios que ficaram a
     falhar por pouco, com a decisão de cada empate registada no commit.

     Agora deriva do token e não pode voltar a divergir: mudar a escala no JSON
     muda o que este portao aceita, no mesmo commit.
     (`moo-tokens.json -> radius` + `radius_nota`.) */
  const RAIO_OK = new Set([0, ...Object.values(T.radius || {})
    .map(v => parseInt(v, 10)).filter(Number.isFinite)]);
  /* AMBITO ALARGADO a 2026-08-28. Ate aqui esta verificacao varria as 5
     superficies de `SUPERFICIES_UI` mais `design/` — e os `.tsx` da landing
     NUNCA estiveram na lista. Nao era so a regex que nao via `borderRadius:`;
     os ficheiros nem sequer eram abertos. Foi assim que uma pilula de raio 9999
     sobreviveu a uma onda inteira com o indice a 9,09, e como o `T5` pode usar
     a rosa da marca sem ninguem dar por isso.

     Alargar veio com a lista de sitios primeiro, que e a regra que este proprio
     ficheiro exigia: medidos 32 raios fora da escala em 13 ficheiros, todos
     corrigidos com a decisao de cada empate registada, ANTES de a verificacao
     passar a ve-los. Zero achados novos no momento em que o ambito abriu — o
     que se quer de um alargamento: o portao ve mais e continua verde porque o
     trabalho foi feito, nao porque a regua foi afrouxada.

     `.test.`/`.spec.` ficam de fora por `E_TESTE`: um teste e onde a decisao se
     defende, nao onde se viola. */
  const alvos = [
    ...SUPERFICIES_UI,
    ...andar('design'),
    ...andar('landing/app'),
    ...andar('landing/components'),
  ].filter(f => /\.(html|css|tsx?|jsx?)$/.test(f) && !E_TESTE(f));
  let vistos = 0;
  for (const f of alvos) {
    const s = ler(f); if (!s) continue; vistos++;
    // regra 1 — barra de acento à esquerda com fundo tingido
    const barras = (s.match(/border-left:\s*[3-9]px solid/g) || []).length;
    if (barras) banidos.push({ ficheiro: f, regra: 1, o_que: 'barra de acento à esquerda', n: barras });
    // regra 9 — curva fora da família
    const curvas = [...s.matchAll(/cubic-bezier\(([^)]+)\)/g)].map(m => normCurva(m[1]))
      .filter(c => !EAS_OK.includes(c));
    if (curvas.length) banidos.push({ ficheiro: f, regra: 9, o_que: 'curva fora da família',
      n: curvas.length, exemplos: [...new Set(curvas)].slice(0,3) });
    // escala de raios
    /* Duas sintaxes, e a segunda esteve invisível até 2026-08-28: um objecto de
       estilo em JS escreve `borderRadius: 999`, sem traço e sem `px`, e a regex
       de CSS nunca lhe tocou. Foi assim que uma pílula de raio 999 sobreviveu a
       uma onda inteira com o índice a 9,09. */
    const raios = [
      ...[...s.matchAll(/border-radius:\s*(\d+)px/g)].map(m => +m[1]),
      ...[...s.matchAll(/borderRadius:\s*(\d+)/g)].map(m => +m[1]),
    ].filter(v => !RAIO_OK.has(v));
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
