/**
 * moo-deck-build.test.mjs — o teste de mordida do gerador do deck.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * «Guarda sem teste de mordida não é guarda.» Cada teste aqui PLANTA o defeito
 * que a guarda existe para apanhar e exige que ela o apanhe. Uma guarda que
 * nunca falhou é indistinguível de uma guarda que não funciona.
 *
 * Três dos testes abaixo não são hipotéticos — foram escritos DEPOIS de o
 * defeito ter passado nesta mesma sessão (2026-08-27), contra o registo real:
 *
 *   · `janelaDe` cortava o cabeçalho em `–` nu e publicava a janela
 *     «2026-08-25 11:00» quando o registo dizia «11:00–12:15Z». Um intervalo
 *     de 75 minutos a passar por um instante. → teste «travessão colado».
 *   · a margem cortava o título a 40 caracteres e imprimia
 *     «Snapshot 2026-08-25 (medido 11:00–12:15Z (cont.)» — parêntese aberto,
 *     em caixa-alta, na coluna que existe para identificar. → teste `curto()`.
 *   · o extremo era «o primeiro da tabela», o que punha uma frase de 70
 *     caracteres a 96px e deixava um «0 de 24» a corpo pequeno ao lado.
 *     → teste `indiceDoExtremo` via `modelar()`.
 *
 *   node --test design/deck/moo-deck-build.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  cifra, limpo, curto, janelaDe, fontesDe, parseRegisto, modelar, build,
  construirDeck, construirPdf, eCifra, caminhoDoRegisto,
  assertNeutralidadeTipografica, assertSemCaixas, assertRosaContida,
  assertMovimentoDaFamilia, assertUmExtremoPorFolha,
  assertTokensDaGramatica, assertClassesDaGramatica, CLASSES_EMPRESTADAS, CSS_GRAMATICA,
  CSS_DECK, CSS_PDF, MetricaSemProcedencia, RegistoAusente, GramaticaViolada,
} from './moo-deck-build.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const GERADOR = join(AQUI, 'moo-deck-build.mjs');

function bancada(md) {
  const raiz = mkdtempSync(join(tmpdir(), 'moo-deck-'));
  const f = join(raiz, 'registo.md');
  writeFileSync(f, md);
  return { raiz, registo: f, saida: join(raiz, 'out') };
}

const BOA = {
  rotulo: 'Suite de testes', valor: '760 pass · 0 fail', sinal: 'positivo',
  fonte: { texto: 'journal gate-L0 25/08', grau: 'directa' },
  janela: { texto: '2026-08-25 11:00–12:15Z' },
  origem: { ficheiro: 'registo.md', linha: 12 },
};

// ── 1. O COMPONENTE DE NÚMERO HONESTO ────────────────────────────────────

test('cifra sem FONTE atira — o build morre, não publica', () => {
  const m = { ...BOA, fonte: null };
  assert.throws(() => cifra(m), (e) => {
    assert.ok(e instanceof MetricaSemProcedencia, `esperava MetricaSemProcedencia, veio ${e.name}`);
    assert.match(e.message, /sem FONTE/);
    assert.match(e.message, /registo\.md:12/, 'o erro tem de dizer QUE linha do registo');
    return true;
  });
});

test('cifra com fonte só de espaços atira — string vazia não é fonte', () => {
  assert.throws(() => cifra({ ...BOA, fonte: { texto: '   ', grau: 'directa' } }),
    MetricaSemProcedencia);
});

test('cifra sem JANELA atira — um número sem quando não é um número medido', () => {
  assert.throws(() => cifra({ ...BOA, janela: null }), (e) => {
    assert.match(e.message, /sem JANELA/);
    return true;
  });
});

test('cifra sem VALOR atira', () => {
  assert.throws(() => cifra({ ...BOA, valor: '' }), MetricaSemProcedencia);
});

test('cifra com fonte e janela emite, e carrega a procedência visível no HTML', () => {
  const h = cifra(BOA);
  assert.match(h, /journal gate-L0 25\/08/);
  assert.match(h, /2026-08-25 11:00–12:15Z/);
  assert.match(h, /data-sinal="positivo"/);
});

// ── 2. NEGATIVOS NA MESMA TIPOGRAFIA — POR CONSTRUÇÃO ────────────────────

test('positivo e negativo geram HTML idêntico a menos do atributo do sinal', () => {
  const pos = cifra({ ...BOA, sinal: 'positivo' });
  const neg = cifra({ ...BOA, sinal: 'negativo' });
  assert.notEqual(pos, neg, 'o sinal tem de estar registado algures');
  assert.equal(
    pos.replace('data-sinal="positivo"', 'data-sinal="X"'),
    neg.replace('data-sinal="negativo"', 'data-sinal="X"'),
    'positivo e negativo diferem em algo mais do que o sinal — isso é tipografia a julgar');
});

test('MORDIDA · CSS que faz o sinal escolher a cor é apanhado', () => {
  const plantado = CSS_DECK + '\n.moo-cifra[data-sinal="negativo"] .moo-cifra-v{color:var(--moo-bad)}';
  assert.throws(() => assertNeutralidadeTipografica(plantado), (e) => {
    assert.ok(e instanceof GramaticaViolada);
    assert.match(e.message, /MESMA tipografia/);
    return true;
  });
});

test('MORDIDA · CSS que faz o sinal escolher o peso da fonte é apanhado', () => {
  const plantado = '.moo-cifra[data-sinal="positivo"] .moo-cifra-v{font-weight:900}';
  assert.throws(() => assertNeutralidadeTipografica(plantado), GramaticaViolada);
});

test('o CSS real do deck e do PDF passa a neutralidade', () => {
  assert.equal(assertNeutralidadeTipografica(CSS_DECK), true);
  assert.equal(assertNeutralidadeTipografica(CSS_PDF), true);
});

test('a escala do extremo depende do comprimento, nunca do sinal', () => {
  const curto_ = cifra({ ...BOA, valor: '0 de 24' }, { extremo: true });
  const longo = cifra({ ...BOA, valor: 'x'.repeat(80) }, { extremo: true });
  assert.match(curto_, /data-escala="1"/);
  assert.match(longo, /data-escala="3"/);
  // mesmo valor, sinais opostos → mesma escala
  const a = cifra({ ...BOA, valor: '0 de 24', sinal: 'positivo' }, { extremo: true });
  const b = cifra({ ...BOA, valor: '0 de 24', sinal: 'negativo' }, { extremo: true });
  assert.equal(/data-escala="(\d)"/.exec(a)[1], /data-escala="(\d)"/.exec(b)[1]);
});

test('MORDIDA · o negrito do autor não chega ao HTML', () => {
  const h = cifra({ ...BOA, valor: '**760 pass** · 0 fail' });
  assert.doesNotMatch(h, /<b>|<strong>|\*\*/,
    'se o `**` do registo virasse <b>, a tipografia passava a depender de quem escreveu');
  assert.match(h, /760 pass/);
});

// ── 3. SEM CAIXAS · ROSA CONTIDA · QUATRO CURVAS ─────────────────────────

test('MORDIDA · uma caixa no CSS é apanhada', () => {
  const plantado = CSS_DECK + '\n.moo-cartao{border:1px solid var(--moo-line);border-radius:10px}';
  assert.throws(() => assertSemCaixas(plantado), (e) => {
    assert.match(e.message, /NÃO HÁ CAIXAS/);
    return true;
  });
});

test('MORDIDA · uma sombra no CSS é apanhada', () => {
  assert.throws(() => assertSemCaixas('.x{box-shadow:0 2px 8px rgba(0,0,0,.2)}'), GramaticaViolada);
});

test('o CSS real não tem caixas', () => {
  assert.equal(assertSemCaixas(CSS_DECK), true);
  assert.equal(assertSemCaixas(CSS_PDF), true);
});

test('MORDIDA · rosa fora do ?/cota/CTA é apanhado', () => {
  const plantado = CSS_DECK + '\n.moo-cifra-v{color:var(--moo-accent)}';
  assert.throws(() => assertRosaContida(plantado), (e) => {
    assert.match(e.message, /Rosa só no \? do wordmark/);
    return true;
  });
});

test('o rosa real está contido', () => {
  assert.equal(assertRosaContida(CSS_DECK), true);
  assert.equal(assertRosaContida(CSS_PDF), true);
});

test('MORDIDA · uma curva fora da família é apanhada', () => {
  assert.throws(() => assertMovimentoDaFamilia('@keyframes moo-salto{to{transform:none}}'),
    (e) => { assert.match(e.message, /fora da família/); return true; });
});

test('o deck não inventa curvas', () => {
  assert.equal(assertMovimentoDaFamilia(CSS_DECK), true);
  assert.equal(assertMovimentoDaFamilia(CSS_PDF), true);
});

// ── 3b. A GRAMÁTICA EMPRESTADA (o defeito medido no browser) ─────────────

const GRAM_REAL = readFileSync(CSS_GRAMATICA, 'utf8');

test('MORDIDA · gramática sem um token que o deck usa faz o build morrer', () => {
  /* Reproduz o que aconteceu a 2026-08-27: o `moo-ui.css` foi apanhado a meio
     de uma reescrita, com o `:root` só a definir `--moo-tinta-*`. O deck saiu
     em Times New Roman 16px e o build imprimiu «gerado». */
  const meio = GRAM_REAL.replace(/--moo-font-sans\s*:/g, '--moo-tinta-font-sans:');
  assert.throws(() => assertTokensDaGramatica(meio, CSS_DECK, CSS_PDF), (e) => {
    assert.ok(e instanceof GramaticaViolada);
    assert.match(e.message, /--moo-font-sans/);
    assert.match(e.message, /Times New Roman/);
    return true;
  });
});

test('MORDIDA · gramática sem `.moo-secao` faz o build morrer', () => {
  const sem = GRAM_REAL.replace(/\.moo-secao\b/g, '.moo-bloco');
  assert.throws(() => assertClassesDaGramatica(sem), (e) => {
    assert.match(e.message, /moo-secao/);
    return true;
  });
});

test('a gramática real de hoje serve o deck', () => {
  assert.ok(assertTokensDaGramatica(GRAM_REAL, CSS_DECK, CSS_PDF) > 5);
  assert.equal(assertClassesDaGramatica(GRAM_REAL), CLASSES_EMPRESTADAS.length);
});

test('MORDIDA · o deck não pode inventar tokens fora da gramática', () => {
  assert.throws(() => assertTokensDaGramatica(GRAM_REAL, '.x{color:var(--moo-cor-inventada)}'),
    GramaticaViolada);
});

test('MORDIDA · token que EXISTE mas não RESOLVE é apanhado na mesma', () => {
  /* O defeito real de 2026-08-27: `--moo-font-sans: var(--font-sans), 'Space
     Grotesk', …`. O token existe. A cadeia não fecha fora da landing, e o
     `font:` shorthand cai inteiro. Uma guarda que só perguntasse «está
     definido?» dava verde a um deck em Times New Roman. */
  const gram = `:root{--moo-font-sans: var(--font-sans), 'Space Grotesk', sans-serif;}`;
  assert.throws(() => assertTokensDaGramatica(gram, '.x{font:700 20px var(--moo-font-sans)}'), (e) => {
    assert.match(e.message, /--moo-font-sans → --font-sans/);
    assert.match(e.message, /não resolvem/);
    return true;
  });
  // com a raiz declarada pelo consumidor, resolve
  assert.equal(assertTokensDaGramatica(gram,
    `:root{--font-sans:'Space Grotesk';}\n.x{font:700 20px var(--moo-font-sans)}`), 1);
});

test('um var() com fallback próprio não conta como por resolver', () => {
  const gram = `:root{--moo-x: var(--nao-existe, 12px);}`;
  assert.equal(assertTokensDaGramatica(gram, '.y{padding:var(--moo-x)}'), 1);
});

test('o CSS do deck declara as raízes que a gramática espera da landing', () => {
  assert.match(CSS_DECK, /--font-sans:/);
  assert.match(CSS_PDF, /--font-mono:/);
});

// ── 4. UM EXTREMO POR FOLHA ──────────────────────────────────────────────

const folhaCom = (n) => `<article class="moo-slide">` +
  Array.from({ length: n }, () => '<span data-extremo="true">x</span>').join('') +
  `</article>`;

test('MORDIDA · duas cifras extremas na mesma folha são apanhadas', () => {
  assert.throws(() => assertUmExtremoPorFolha(folhaCom(2)), (e) => {
    assert.match(e.message, /UM momento extremo/);
    assert.match(e.message, /folha 1: 2 extremos/);
    return true;
  });
});

test('MORDIDA · uma folha sem extremo nenhum também é apanhada', () => {
  assert.throws(() => assertUmExtremoPorFolha(folhaCom(0)), GramaticaViolada);
});

test('MORDIDA · zero folhas é apanhado (um build vazio não passa por bom)', () => {
  assert.throws(() => assertUmExtremoPorFolha('<div>nada</div>'), GramaticaViolada);
});

test('uma folha com exactamente um extremo passa', () => {
  assert.equal(assertUmExtremoPorFolha(folhaCom(1)), 1);
});

// ── 5. JANELA E FONTE, LIDAS DO REGISTO ──────────────────────────────────

test('MORDIDA · travessão colado entre dígitos é intervalo, não separador', () => {
  const j = janelaDe('Snapshot 2026-08-25 (medido 11:00–12:15Z, fontes: beacons, painel)', '2026');
  assert.equal(j.data, '2026-08-25');
  assert.equal(j.hora, '11:00–12:15Z',
    'cortar em `–` nu publicava «11:00» — 75 minutos a passar por um instante');
  assert.equal(j.texto, '2026-08-25 11:00–12:15Z');
});

test('MORDIDA · a hora de uma FONTE não vira janela', () => {
  const j = janelaDe('Delta 2026-08-25 (dia) — fontes: painel 17:18 local, journal 20:35Z', '2026');
  assert.equal(j.data, '2026-08-25');
  assert.equal(j.hora, null, '«17:18» é a hora do painel citado, não a janela da medição');
});

test('data em dd/MM herda o ano do front-matter', () => {
  assert.equal(janelaDe('Delta · 25/08 23:3xZ · CC headless — "merges"', '2026').data, '2026-08-25');
  assert.equal(janelaDe('Delta · 25/08 23:3xZ · CC headless — "merges"', '2026').hora, '23:3xZ');
});

test('cabeçalho sem data nenhuma devolve null (e mais abaixo faz o build morrer)', () => {
  assert.equal(janelaDe('Como esta página cresce', '2026'), null);
});

test('fontesDe apanha `fonte:` e `fontes:` e larga o parêntese', () => {
  assert.equal(fontesDe('Snapshot (medido, fontes: beacons, painel :4290)'), 'beacons, painel :4290');
  assert.equal(fontesDe('Delta — fonte: `_handoff/x.md`'), '`_handoff/x.md`');
  assert.equal(fontesDe('Delta · CC headless — "merges"'), null);
});

test('curto() não deixa parênteses abertos na margem', () => {
  const c = curto('Snapshot 2026-08-25 (medido 11:00–12:15Z, fontes: beacons)');
  assert.equal(c, 'Snapshot 2026-08-25');
  assert.doesNotMatch(c, /\([^)]*$/, 'a margem imprimia «(medido 11:00–12:15Z (cont.)»');
});

test('limpo() deita fora o ênfase do markdown', () => {
  assert.equal(limpo('**760 pass** · *0 fail*'), '760 pass · 0 fail');
});

// ── 6. O PARSER, CONTRA FIXTURES QUE PLANTAM O DEFEITO ───────────────────

const FIX_OK = `---
type: strategy-pitch-registro
created: 2026-08-25
regra: nenhuma poupança publicada sem tokens medidos
---

# Registo

## Snapshot 2026-08-25 (medido 11:00–12:15Z, fontes: beacons assinados)

### Confiabilidade
| Métrica | Valor | Fonte |
|---|---|---|
| Suite de testes | **760 pass · 0 fail** | journal gate-L0 |
| Integridade | sha 427d8c0b intacto | fleet.json |

### ⚠️ Negativos declarados
| Métrica | Valor | Leitura |
|---|---|---|
| Keep-rate do dono | 2 / 44 (4,5%) | o instrumento faz perguntas fracas |
`;

test('o parser lê métricas com fonte directa e fonte de secção', () => {
  const r = parseRegisto(FIX_OK, { origem: 'fx.md' });
  const ms = r.capitulos.flatMap((c) => c.metricas);
  assert.equal(ms.length, 3);
  assert.equal(ms[0].fonte.grau, 'directa');
  assert.equal(ms[0].fonte.texto, 'journal gate-L0');
  assert.equal(ms[2].fonte.grau, 'secao', 'coluna «Leitura» não é fonte — herda a da entrada');
  assert.equal(ms[2].nota, 'o instrumento faz perguntas fracas');
  assert.equal(ms[2].sinal, 'negativo');
  /* `### Confiabilidade` não diz «positivo» — e o gerador NÃO o infere. Um
     título neutro dá sinal neutro; positivo só quando o registo o escreve
     (`### Positivos medidos`). Inferir optimismo de um título seria a mesma
     família de defeito que fabricar uma métrica. */
  assert.equal(ms[0].sinal, 'neutro');
  for (const m of ms) assert.equal(m.janela.texto, '2026-08-25 11:00–12:15Z');
});

test('o sinal vem do registo, nunca de inferência sobre o conteúdo', () => {
  const md = FIX_OK.replace('### Confiabilidade', '### Positivos medidos');
  const ms = parseRegisto(md, { origem: 'fx.md' }).capitulos.flatMap((c) => c.metricas);
  assert.equal(ms[0].sinal, 'positivo');
});

test('MORDIDA · entrada sem data no cabeçalho faz o BUILD MORRER, não passa em silêncio', () => {
  const mau = FIX_OK.replace('## Snapshot 2026-08-25 (medido 11:00–12:15Z, fontes: beacons assinados)',
    '## Snapshot da semana (fontes: beacons assinados)');
  const b = bancada(mau);
  assert.throws(() => build({ registo: b.registo, escrever: false }), (e) => {
    assert.ok(e instanceof MetricaSemProcedencia, `veio ${e.name}: ${e.message}`);
    assert.match(e.message, /sem JANELA/);
    return true;
  });
});

test('MORDIDA · sem coluna Fonte E sem `fontes:` a cifra cai para grau `registo` — e diz que caiu', () => {
  const mau = `---
created: 2026-08-25
---
# R
## Delta · 25/08 23:3xZ · CC headless mac-mini — "merges delegados"

### ⚠️ Negativos medidos
| Métrica | Valor | Leitura |
|---|---|---|
| PRs sem merge | 4ª verificação, 0 merged | ainda rate-limited |
`;
  const b = bancada(mau);
  const { rel, html } = build({ registo: b.registo, escrever: false });
  assert.equal(rel.fonte_grau_registo >= 1, true, 'a fonte fraca tem de ser CONTADA, não escondida');
  assert.match(html, /\[grau: registo\]/, 'o grau fraco vai impresso no slide, não só no relatório');
  assert.equal(rel.pct_com_fonte_e_janela, 100);
});

test('`--estrito` sai 1 enquanto houver fonte de grau `registo`', () => {
  const mau = `---
created: 2026-08-25
---
# R
## Delta · 25/08 23:3xZ — "merges"

### ⚠️ Negativos
| Métrica | Valor | Leitura |
|---|---|---|
| PRs sem merge | 0 merged | rate-limited |
`;
  const b = bancada(mau);
  const env = { ...process.env, MOO_REGISTO: b.registo, MOO_DECK_OUT: b.saida };
  assert.throws(() => execFileSync(process.execPath, [GERADOR, '--estrito'], { env, stdio: 'pipe' }),
    (e) => { assert.equal(e.status, 1); return true; });
  // sem --estrito o mesmo registo gera
  const ok = execFileSync(process.execPath, [GERADOR, '--json'], { env, encoding: 'utf8' });
  assert.equal(JSON.parse(ok).fonte_grau_registo, 1);
});

test('registo inexistente: RegistoAusente, nunca conteúdo de reserva', () => {
  assert.throws(() => build({ registo: join(tmpdir(), 'nao-existe-moo.md'), escrever: false }),
    (e) => {
      assert.ok(e instanceof RegistoAusente);
      assert.match(e.message, /sem registo não há deck/);
      return true;
    });
});

test('sem VAULT_PATH e sem MOO_REGISTO o gerador recusa-se a adivinhar', () => {
  assert.throws(() => caminhoDoRegisto({}), RegistoAusente);
  assert.equal(caminhoDoRegisto({ MOO_REGISTO: '/x/y.md' }), resolve('/x/y.md'));
});

// ── 7. O MODELO E AS DUAS SAÍDAS ─────────────────────────────────────────

test('positivos e negativos nunca partilham a mesma folha', () => {
  const folhas = modelar(parseRegisto(FIX_OK, { origem: 'fx.md' }));
  for (const f of folhas.filter((x) => x.tipo === 'metricas')) {
    assert.equal(new Set(f.metricas.map((m) => m.sinal)).size, 1);
  }
});

test('MORDIDA · o extremo é a cifra mais curta com dígitos, não a primeira da tabela', () => {
  const md = FIX_OK.replace('| Suite de testes | **760 pass · 0 fail** | journal gate-L0 |',
    '| Frase comprida | 8 de 10 falham contra main e as 14 passam com a correcção do painel | journal |\n' +
    '| Cifra seca | 0 de 24 | pr #398 |');
  const folhas = modelar(parseRegisto(md, { origem: 'fx.md' }));
  const f = folhas.find((x) => x.tipo === 'metricas' && x.sub === 'Confiabilidade');
  assert.equal(f.metricas[0].valor.startsWith('8 de 10'), true, 'a primeira continua a primeira');
  assert.equal(f.metricas[f.extremoEm].valor, '0 de 24');
});

test('deck e PDF geram-se e passam todas as guardas', () => {
  const b = bancada(FIX_OK);
  const { rel, html, pdf } = build({ registo: b.registo, escrever: false });
  assert.equal(rel.pct_com_fonte_e_janela, 100);
  assert.equal(rel.com_fonte_e_janela, rel.cifras_no_deck);
  assert.ok(rel.slides >= 3, `esperava ≥3 slides, veio ${rel.slides}`);
  assert.match(html, /1920px/);
  assert.match(pdf, /794px/);
  assert.match(pdf, /size:A4/);
  assert.match(html, /moo<span class="moo-q">\?<\/span>/, 'o ? do wordmark é o único rosa da capa');
  // o corpo não tem ênfase do autor nenhum
  const corpos = [...html.matchAll(/<div class="moo-corpo[^"]*">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  for (const c of corpos) assert.doesNotMatch(c, /<b>|<strong>/);
});

test('MORDIDA · o PDF refatia grupos grandes sem perder o extremo', () => {
  /* Defeito latente encontrado por leitura e fixado por teste: `extremoEm` é
     um índice dentro do grupo, e ao refatiar era herdado tal e qual. */
  const metricas = Array.from({ length: 19 }, (_, i) => ({
    ...BOA, rotulo: `M${i}`, valor: i === 17 ? '7' : `valor número ${i} com algum comprimento a mais`,
  }));
  const folhas = [{ tipo: 'metricas', capitulo: { titulo: 'Cap 2026-08-25', janela: BOA.janela },
    sub: 'Muitos', sinal: 'negativo', metricas, extremoEm: 17, rev: '2026-08-25' }];
  const pdf = construirPdf(folhas);
  assert.equal(assertUmExtremoPorFolha(pdf, { tag: 'section', classe: 'moo-secao' }), 3);
});

test('o fecho publica a poupança como `n/d`, com fonte e janela — nunca zero', () => {
  const b = bancada(FIX_OK);
  const { html } = build({ registo: b.registo, escrever: false });
  const fecho = html.split('<div class="moo-caixilho">').pop();
  assert.match(fecho, /Poupança publicada/);
  assert.match(fecho, /moo-cifra-v">n\/d</);
  assert.match(fecho, /decisão 2026-08-24/);
  assert.doesNotMatch(fecho, /moo-cifra-v">0</, 'não medido é `n/d`, NUNCA zero');
});

test('eCifra: um `n/d` conta como cifra, uma frase sem número não', () => {
  assert.equal(eCifra({ valor: 'n/d' }), true);
  assert.equal(eCifra({ valor: '4,5%' }), true);
  assert.equal(eCifra({ valor: 'intacto' }), false);
});

test('o build escreve os três ficheiros onde diz que escreve', () => {
  const b = bancada(FIX_OK);
  const { rel } = build({ registo: b.registo, saida: b.saida });
  assert.ok(existsSync(rel.saidas.deck));
  assert.ok(existsSync(rel.saidas.pdf));
  assert.ok(existsSync(join(b.saida, '.deck-build.json')));
  assert.ok(readFileSync(rel.saidas.deck, 'utf8').length > 4000);
});

// ── 8. CONTRA O REGISTO REAL (n/d declarado se o vault não estiver montado) ──

test('contra o registo real do vault: 100% das cifras com fonte e janela', (t) => {
  let caminho;
  try { caminho = caminhoDoRegisto(); } catch { caminho = null; }
  if (!caminho || !existsSync(caminho)) {
    t.skip(`n/d — registo não montado (VAULT_PATH=${process.env.VAULT_PATH || 'ausente'}). ` +
      'Não medido não é zero: este teste declara-se por medir em vez de passar por bom.');
    return;
  }
  const { rel } = build({ registo: caminho, escrever: false });
  assert.equal(rel.pct_com_fonte_e_janela, 100);
  assert.equal(rel.com_fonte_e_janela, rel.cifras_no_deck);
  assert.equal(rel.sem_janela, 0, 'nenhuma métrica do registo pode ficar sem janela');
  assert.ok(rel.slides > 10, `esperava um deck com corpo, veio ${rel.slides} slides`);
});
