/**
 * moo-design-check.test.mjs — o teste de mordida do portão.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * A 2026-08-27 o portão corria, imprimia 3,41/10 e passava a verificação da
 * marca a 1,5/1,5 — «um só desenho». O repo tinha OITO cópias da vaca fora de
 * `design/brand/`. A verificação não estava errada por pouco: `andar()` só
 * devolvia extensões de `EXT_TEXTO`, onde `.svg` não estava, e a linha seguinte
 * filtrava por `extname(f) !== '.svg'`. Descartava 100% do que recebia. O ✅
 * não era uma medição — era a ausência de medição a vestir-se de medição.
 *
 * E havia pior: apontar `MOO_REPO` a uma pasta sem superfícies punha as três
 * verificações pesadas a `n/d`, tirava-as do denominador, e o índice SUBIA de
 * 3,41 para 8,75 com `--ci` a sair 0. O portão pontuava melhor quanto menos via.
 *
 * Cada teste aqui PLANTA o defeito e exige que o portão o apanhe. Um portão que
 * nunca falhou é indistinguível de um portão que não funciona.
 *
 *   node --test design/tools/moo-design-check.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESIGN_REAL = resolve(AQUI, '..');

/* A cópia existe para que correr os testes não reescreva o `.design-check.json`
   verdadeiro: o portão escreve-o sempre, e um teste que suja o relatório que o
   beacon publica é um teste que mente sobre o repo. */
function bancada() {
  const raiz = mkdtempSync(join(tmpdir(), 'moo-portao-'));
  cpSync(DESIGN_REAL, join(raiz, 'design'), {
    recursive: true,
    filter: (src) => !src.endsWith('.design-check.json'),
  });
  const repo = join(raiz, 'repo');
  mkdirSync(repo, { recursive: true });
  return { raiz, repo, portao: join(raiz, 'design', 'tools', 'moo-design-check.mjs') };
}

function escreve(repo, rel, texto) {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, texto);
  return abs;
}

/** Uma superfície mínima e limpa, para que a guarda anti-cegueira não dispare. */
function superficieLimpa(repo) {
  escreve(repo, 'landing/app/globals.css', ':root { color: #fff; }\n');
  escreve(repo, 'README.md', '# repo de teste\n');
}

function corre(bancadaObj, { ci = false } = {}) {
  const args = [bancadaObj.portao, '--json'];
  if (ci) args.push('--ci');
  try {
    const out = execFileSync(process.execPath, args, {
      env: { ...process.env, MOO_REPO: bancadaObj.repo },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, rel: JSON.parse(out) };
  } catch (e) {
    return { code: e.status, rel: e.stdout ? JSON.parse(e.stdout) : null, err: String(e.stderr || '') };
  }
}

const v = (rel, id) => rel.verificacoes.find(x => x.id === id);

/* A vaca vem do desenho CANÓNICO, não de um path inventado a partir do regex do
   detector. A primeira versão deste ficheiro escrevia um `<path d="M21.976 31…">`
   à mão: o detector encontrava-o (é o que ele procura), mas as coordenadas não
   eram as do canon, e por isso a própria fixture contava como silhueta derivada.
   Um teste cuja fixture já viola o invariante não consegue distinguir o defeito
   plantado do defeito acidental. */
const VACA = readFileSync(join(DESIGN_REAL, 'brand', 'mooter-mark.svg'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────

test('marca-unica ACEITA uma superfície derivada com a silhueta intacta', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* Um favicon com azulejo escuro e um viewBox próprio é desenho por superfície,
     não deriva. O que a decisão trava é a silhueta, não o sítio do ficheiro. */
  escreve(b.repo, 'landing/public/favicon.svg',
    VACA.replace('<g class="corpo"', '<rect width="32" height="32" rx="7" fill="#14110D"/><g class="corpo"'));

  const m = v(corre(b).rel, 'marca-unica');
  assert.equal(m.pontos, 1.5, `esperava passagem. porque=${m.porque}`);
  assert.deepEqual(m.derivadas_na_marca, ['landing/public/favicon.svg'],
    'e mesmo aceite, tem de aparecer declarada — não desaparecer');
});

test('marca-unica MORDE a silhueta derivada — o único invariante que a decisão trava', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* Mesma vaca detectada, mas com um path a mais que não existe no canon:
     alguém redesenhou uma orelha. */
  escreve(b.repo, 'landing/public/mooter-logo.svg',
    VACA.replace('</svg>', '<path d="M9 9l3 3-3 3z"/></svg>'));

  const m = v(corre(b).rel, 'marca-unica');
  assert.equal(m.pontos, 0);
  assert.equal(m.silhueta_derivou.length, 1);
  assert.equal(m.silhueta_derivou[0].paths_fora_do_canon, 1);
});

test('marca-unica MORDE a paleta creme+laranja numa superfície viva', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* O `SPEC.md` §4 de Junho ainda manda creme #F5EDD4 + laranja #FF6B35. A
     decisão de 2026-08-27 é cinza-aço. Se a paleta velha reaparecer numa
     superfície viva, é a decisão a ser desfeita em silêncio. */
  escreve(b.repo, 'landing/public/cow.svg', VACA.replace(/fill="[^"]*"/, 'fill="#F5EDD4"'));

  const m = v(corre(b).rel, 'marca-unica');
  assert.equal(m.pontos, 0);
  assert.deepEqual(m.paleta_superseded, ['landing/public/cow.svg']);
});

test('marca-unica MORDE um logo legado vivo', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/public/mooter-logo-legacy.svg',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#4ec9b0"/></svg>');

  const m = v(corre(b).rel, 'marca-unica');
  assert.equal(m.pontos, 0, 'o "F" teal do frugal não precisa de ser uma vaca para contar');
  assert.deepEqual(m.legado, ['landing/public/mooter-logo-legacy.svg']);
});

test('marca-unica IGNORA o arquivo — mas declara-o, não o esconde', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* `_handoff/_archive/` é história imutável (AGENTS.md § Information
     architecture). Apagar os quatro ficheiros creme de Junho para o portão ficar
     verde seria apagar a prova de que a decisão de 27/08 mudou alguma coisa. */
  escreve(b.repo, '_handoff/_archive/2026-06/assets/cow.svg',
    VACA.replace(/fill="[^"]*"/, 'fill="#F5EDD4"'));

  const m = v(corre(b).rel, 'marca-unica');
  assert.equal(m.pontos, 1.5, 'o arquivo não pontua contra');
  assert.deepEqual(m.arquivadas_ignoradas, ['_handoff/_archive/2026-06/assets/cow.svg']);
  assert.match(m.porque, /arquivada/, 'a excepção tem de aparecer na frase, não só no JSON');
});

test('marca-unica não confunde o canon com uma variante (barras do Windows)', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* `join()` devolve `design\brand\...` no Windows; o filtro procura
     `design/brand/`. Sem normalização, os seis desenhos canónicos
     auto-denunciavam-se — e só nesta plataforma. */
  escreve(b.repo, 'design/brand/mooter-mark.svg', VACA);
  escreve(b.repo, 'design/brand/favicon.svg', VACA);

  const m = v(corre(b).rel, 'marca-unica');
  assert.deepEqual(m.derivadas_na_marca, [], 'o canon nunca é derivado de si próprio');
  assert.equal(m.pontos, 1.5);
});

test('o portão RECUSA-SE a pontuar um alvo que não é o repo', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  // repo vazio de propósito: zero superfícies de UI, zero de texto.
  const r = corre(b, { ci: true });
  assert.equal(r.code, 2, 'tem de sair 2 — nem 0 (verde falso) nem 1 (falha medida)');
  assert.equal(r.rel, null, 'não pode publicar índice nenhum');
  assert.match(r.err, /nao ha nada que medir|não há nada que medir/);
});

test('movimento-seguro: um keyframe numa linha só não inventa propriedades', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* Exactamente a forma de `moo-ui.css`: keyframes numa linha, seguidos de
     outras regras e do bloco `prefers-reduced-motion`. O padrão antigo engolia
     tudo até ao primeiro `\n  }` e acusava `transition-duration`. */
  escreve(b.repo, 'landing/app/globals.css', [
    '@keyframes ent { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; } }',
    '.btn { color: red; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  *, *::before { animation-duration: .01ms !important;',
    '                 transition-duration: .01ms !important; }',
    '}',
  ].join('\n'));

  const mov = v(corre(b).rel, 'movimento-seguro');
  assert.equal(mov.pontos, 1.0,
    `CSS limpo não pode falhar. repinta=${JSON.stringify(mov.repinta)}`);
});

test('movimento-seguro MORDE uma propriedade que repinta', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  escreve(b.repo, 'landing/app/globals.css', [
    '@keyframes sl { 0% { margin-left: -34%; } 100% { margin-left: 100%; } }',
    '@media (prefers-reduced-motion: reduce) { * { animation: none; } }',
  ].join('\n'));

  const mov = v(corre(b).rel, 'movimento-seguro');
  assert.equal(mov.pontos, 0);
  assert.deepEqual(mov.repinta[0].propriedades, ['margin-left'],
    'a propriedade acusada tem de ser a real, não uma fabricada pelo regex');
});

test('movimento-seguro é n/d quando não leu folha nenhuma', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# só texto, zero css\n');

  const mov = v(corre(b).rel, 'movimento-seguro');
  assert.equal(mov.pontos, null, 'não medido é n/d');
  assert.equal(mov.estado, 'n/d',
    'nunca pode dizer "só transform/opacity" tendo lido zero ficheiros');
});

test('numero-honesto IGNORA identificadores — savings_usd é uma coluna, não um claim', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'landing/app/lib/hub.ts', [
    'export type Stats = { savings_usd: number; avgSavingsPct: number };',
    'const total = row.savings_usd + row.savings_est;',
  ].join('\n'));

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.total, 0,
    `identificadores não são claims. achados=${JSON.stringify(num.achados)}`);
});

test('numero-honesto IGNORA o comentário que regista a retirada', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'landing/app/page.tsx', [
    '// o claim de 47% foi retirado a 2026-08-24 — sem tokens medidos não se publica',
    '/* idem para "~30% less" e "saved $X" */',
    'export default function P() { return null; }',
  ].join('\n'));

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.total, 0,
    `o registo da retirada não é a violação. achados=${JSON.stringify(num.achados)}`);
});

test('numero-honesto IGNORA o teste que defende a decisão', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  escreve(b.repo, 'landing/app/_components/wave11.test.ts',
    "expect(src).not.toContain('up to 90% less cost');\n");

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.total, 0, 'marcar a própria prova como violação ensina a ignorar o portão');
});

test('numero-honesto MORDE um claim publicado', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'landing/app/page.tsx',
    'export const copy = "typically ~30% less on a mixed day";\n');

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.pontos, 0);
  assert.equal(num.achados[0].claim, '~30%');
  assert.equal(num.achados[0].linha, 1);
});

test('numero-honesto MORDE o claim COMPUTADO que a substring nunca via', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* `landing/app/onboarding/_lib/estimate.ts:26` compõe a percentagem a partir
     de uma conta: nenhuma das cinco substrings aparece no código-fonte, e o
     portão antigo dava-lhe passagem enquanto marcava 243 falsos positivos. */
  escreve(b.repo, 'landing/app/est.ts',
    'return `Save ~$${saved}/mo · ${Math.round(p * 100)}% less than Opus-only`;\n');

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.pontos, 0, 'o claim composto por template tem de ser apanhado');
  assert.ok(num.achados.some(a => a.claim === 'poupanca-computada'),
    `esperava o padrão poupanca-computada. achados=${JSON.stringify(num.achados)}`);
});

test('numero-honesto MORDE uma cifra poupada, mesmo sem a substring "saved $"', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  escreve(b.repo, 'landing/app/hero.tsx', '<span>$1.68 saved</span>\n');

  const num = v(corre(b).rel, 'numero-honesto');
  assert.ok(num.achados.some(a => a.claim === 'cifra-poupada'),
    `"$1.68 saved" não contém "saved $". achados=${JSON.stringify(num.achados)}`);
});

test('numero-honesto declara a excepção — e ela cai assim que a linha muda', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'landing/app/x.tsx', 'export const x = 1;\n');
  /* A excepção declarada em `moo-tokens.json` aponta a `README.md` e à frase que
     abre a secção «Honest numbers». Enquanto a frase estiver lá, o `65-82%` que
     ela cita não é um claim: é o registo de que o claim foi retirado. */
  const FRASE = 'This README used to carry five different savings figures — `65–82%`, `~78-90%`.';
  escreve(b.repo, 'README.md', FRASE + '\n');

  const comExcepcao = v(corre(b).rel, 'numero-honesto');
  assert.equal(comExcepcao.total, 0, `esperava isento. achados=${JSON.stringify(comExcepcao.achados)}`);
  assert.equal(comExcepcao.excepcoes_declaradas.length, 1,
    'isento não é invisível — tem de aparecer contado');
  assert.match(comExcepcao.porque, /declarado/);

  /* Editar a frase parte a coincidência, e o claim VOLTA. É o modo de falhar
     correcto: uma excepção por ficheiro seria uma lista negra permanente. */
  escreve(b.repo, 'README.md', 'Savings of 65–82% across the board.\n');
  const semExcepcao = v(corre(b).rel, 'numero-honesto');
  assert.ok(semExcepcao.total > 0,
    'a excepção não pode sobreviver à linha que a justificava');
  assert.equal(semExcepcao.excepcoes_declaradas.length, 0);
});

test('superficies-vivas não acusa packages/vscode-extension, que está vivo', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'packages/mooter-bridge/README.md',
    'The server needs the full repo present (it reuses packages/vscode-extension/src/host-extra.js).\n');

  const sv = v(corre(b).rel, 'superficies-vivas');
  assert.equal(sv.pontos, 0.5,
    `uma nota de dependência sobre um pacote que existe não é um anúncio. achados=${JSON.stringify(sv.achados)}`);
});

test('superficies-vivas MORDE quem anuncia a TUI parada', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'plugin/mooter/skills/x/SKILL.md', 'corre `moo-dashboard` para veres tudo\n');

  const sv = v(corre(b).rel, 'superficies-vivas');
  assert.equal(sv.pontos, 0);
  assert.equal(sv.achados[0].anuncia, 'moo-dashboard');
});

test('o relatório DECLARA as superfícies que não existem', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);

  const rel = corre(b).rel;
  assert.ok(Array.isArray(rel.superficies_ausentes));
  assert.ok(rel.superficies_ausentes.includes('packages/mooter-bridge/fleet-ui.html'),
    'uma superfície ausente era saltada em silêncio e pontuava como limpa');
});

test('moo-tokens-build ESCREVE quando corrido — o guarda de main não pode ser um no-op', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  const css = join(b.raiz, 'design', 'tokens', 'moo-ui.css');
  writeFileSync(css, '/* apagado pelo teste */\n');

  const out = execFileSync(process.execPath,
    [join(b.raiz, 'design', 'tools', 'moo-tokens-build.mjs')],
    { encoding: 'utf8' });

  assert.match(out, /moo-ui\.css\s+\d+ bytes/,
    'o comando publicado no README saía 0 sem escrever nada nem imprimir nada');
  assert.match(readFileSync(css, 'utf8'), /GERADO por tools\/moo-tokens-build\.mjs/);
});

test('--ci sai 1 abaixo do limiar e 0 acima', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/public/mooter-logo-legacy.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#4ec9b0"/></svg>');

  /* Um claim proibido ALÉM do logo legado.
     Esta linha foi acrescentada a 2026-08-27 porque o teste passou a falhar — e a
     razão foi o produto MELHORAR: quando `contraste` era 0,75/1,5, tirar os 1,5
     da marca chegava para descer abaixo de 8. Reconciliados os tokens com a
     produção, `contraste` passou a 1,5/1,5 e o mesmo cenário dá 8,64 — verde, e
     com razão. A fixture é que ficou fraca, não o portão.
     Fica escrito para que ninguém leia isto como "o teste foi afrouxado". */
  escreve(b.repo, 'landing/app/copy.tsx', 'export const c = "typically ~30% less on a mixed day";\n');

  const mau = corre(b, { ci: true });
  assert.equal(mau.code, 1, 'com um logo legado vivo E um claim proibido o CI tem de ficar vermelho');
  assert.equal(mau.rel.passa, false);
  assert.ok(mau.rel.indice_coerencia_visual < mau.rel.limiar,
    `${mau.rel.indice_coerencia_visual} devia estar abaixo do limiar ${mau.rel.limiar}`);

  /* O verde tem de ser alcançável, senão o vermelho não significa nada. */
  rmSync(join(b.repo, 'landing/public/mooter-logo-legacy.svg'));
  rmSync(join(b.repo, 'landing/app/copy.tsx'));
  const bom = corre(b, { ci: true });
  assert.equal(bom.code, 0, `esperava verde. índice=${bom.rel?.indice_coerencia_visual}`);
  assert.equal(bom.rel.passa, true);
});

test('numero-honesto MORDE "% smaller" — a palavra faltava no vocabulario', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* Visto na home RENDERIZADA, nao no relatorio: "One bill is 47% smaller" em
     corpo gigante, e o portao a dar-lhe passagem. A percentagem e computada
     (`Math.round((1 - allMoo/allVan) * 100)`), por isso nenhuma substring
     proibida aparece — e `smaller` nao estava na lista de palavras. */
  escreve(b.repo, 'landing/app/x.tsx',
    'One bill is <span>{pctSaved}% smaller</span>.\n');

  const num = v(corre(b).rel, 'numero-honesto');
  assert.ok(num.achados.some(a => a.claim === 'poupanca-computada'),
    `esperava apanhar "% smaller". achados=${JSON.stringify(num.achados)}`);
});

test('numero-honesto MORDE um claim PARTIDO EM DUAS LINHAS de JSX', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* `TwoTerminalDemo.tsx:342-343`: o numero numa linha, a palavra na seguinte,
     com 75 caracteres de `style={{…}}` pelo meio. E como JSX escreve sempre, e
     um matcher por linha nunca o veria. */
  escreve(b.repo, 'landing/app/y.tsx', [
    '<div>',
    "  <span style={{ fontSize: 40 }}>{pctSaved}%</span>",
    "  <span style={{ color: 'grey' }}>cheaper on this trace</span>",
    '</div>',
  ].join('\n'));

  const num = v(corre(b).rel, 'numero-honesto');
  assert.ok(num.achados.some(a => a.claim === 'poupanca-computada'),
    `um claim partido em duas linhas continua a ser um claim. achados=${JSON.stringify(num.achados)}`);
});

test('numero-honesto aponta a LINHA CERTA depois de tirar o markup', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* Uma tag JSX ocupa varias linhas. Ao branquea-la, substituir os `\n` por
     espacos mantinha o comprimento mas colapsava as quebras: o achado do
     TwoTerminalDemo saia na linha 142 em vez da 172, a apontar para
     `width: 7,`. Ficheiro certo e linha errada gasta o tempo de quem le. */
  escreve(b.repo, 'landing/app/z.tsx', [
    'export const A = () => (',
    '  <div',
    '    className="grande"',
    '    role="note"',
    '  >',
    '    <span>{pct}% smaller</span>',
    '  </div>',
    ');',
  ].join('\n'));

  const num = v(corre(b).rel, 'numero-honesto');
  const a = num.achados.find(x => x.claim === 'poupanca-computada');
  assert.ok(a, 'tem de apanhar');
  assert.equal(a.linha, 6, `a linha real e a 6. veio ${a.linha}`);
});

test('numero-honesto NAO acusa CSS nem uma comparacao de preco de tabela', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* Dois vizinhos inocentes que um padrao demasiado largo apanhava:
     · `color-mix(in srgb, var(--ok) 45%, transparent)` — o `%` e de uma cor;
     · `5x cheaper than Opus` — preco de tabela, e o `%` mais proximo estava
       noutra linha qualquer. Exigir SO espacos entre o numero e a palavra
       separa os dois casos sem precisar de lista de excepcoes. */
  escreve(b.repo, 'landing/app/w.tsx', [
    '<style>{`.on { border-color: color-mix(in srgb, var(--ok) 45%, transparent); }`}</style>',
    '<ModelCard cost="~$0.01" tooltip="5x cheaper than Opus with the same bar" />',
    '<p>90% of the capability</p>',
  ].join('\n'));

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.achados.filter(a => a.claim === 'poupanca-computada').length, 0,
    `nenhum destes e um claim de poupanca. achados=${JSON.stringify(num.achados)}`);
});

test('contraste DECLARA as cores de texto que nao esta a medir', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* A verificacao media so os pares escritos a mao em `contraste.pares` e depois
     imprimia "16 pares, todos >= 4.5:1" — que se le como cobertura. Nao era:
     `papel.warn` (2,50:1), `papel.faint` (2,70:1) e `papel.accent-2` (2,14:1)
     estavam abaixo de AA-GRANDE, os tres usados como `color:` em producao, e
     nenhum tinha par. Um `n/d` que ninguem ve e indistinguivel de um verde. */
  const c = v(corre(b).rel, 'contraste');
  assert.ok(Array.isArray(c.sem_par_declarado),
    'o relatorio tem de dizer o que NAO mediu');
  assert.deepEqual(c.sem_par_declarado, [],
    `toda a cor de primeiro plano tem de ter par. sem par: ${c.sem_par_declarado.join(', ')}`);
});

test('contraste MORDE uma cor de texto que perca o par', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* Tirar um par e a forma silenciosa de fazer um problema desaparecer do
     relatorio. Tem de aparecer na frase, nao so no JSON. */
  const jsonPath = join(b.raiz, 'design', 'tokens', 'moo-tokens.json');
  const T = JSON.parse(readFileSync(jsonPath, 'utf8'));
  T.contraste.pares = T.contraste.pares.filter(([fg]) => fg !== 'papel.warn');
  writeFileSync(jsonPath, JSON.stringify(T, null, 2));

  const c = v(corre(b).rel, 'contraste');
  assert.deepEqual(c.sem_par_declarado, ['papel.warn']);
  assert.match(c.porque, /SEM par/, 'a frase tem de o dizer, nao so o JSON');
});

test('gerar-nao-copiar MORDE uma copia INLINE desactualizada', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);

  /* Duas superficies nao podem importar (servidas por HTTP, empacotadas) e por
     isso trazem o `:root` para dentro. Enquanto foi copia manual — com um
     comentario a dizer "copia verbatim" — ficou velha NO MESMO DIA:
     `papel.faint` passou de #9A8F7E (2,70:1) a #726859 e as copias mantiveram o
     valor velho. O auditor apanhou-o no sitio mais ironico: o cartucho
     `MOOTER · COCKPIT · DES. 011`, o texto que identifica a folha, a 2,70:1. */
  const INI = '/* MOO:TOKENS:INICIO — GERADO por design/tools/moo-inline-sync.mjs. NÃO EDITAR. */';
  const FIM_M = '/* MOO:TOKENS:FIM */';
  const velho = `<style>\n${INI}\n:root {\n  --moo-papel-faint: #9A8F7E;\n}\n${FIM_M}\n</style>`;
  escreve(b.repo, 'tools/cockpit/moo-pilot-shell.html', velho);

  const g = v(corre(b).rel, 'gerar-nao-copiar');
  assert.equal(g.pontos, 0, `uma copia velha tem de zerar. porque=${g.porque}`);
  assert.ok(g.inline_desactualizadas.includes('tools/cockpit/moo-pilot-shell.html'));
  assert.match(g.porque, /inline/);
});

test('gerar-nao-copiar MORDE uma superficie que perdeu as marcas', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  /* Sem as marcas o bloco nao pode ser escrito — e voltamos a copia manual.
     Apagar as marcas nao pode ser a forma silenciosa de sair do controlo. */
  escreve(b.repo, 'tools/cockpit/moo-pilot-shell.html',
    '<style>:root { --moo-papel-faint: #726859; }</style>');

  const g = v(corre(b).rel, 'gerar-nao-copiar');
  assert.equal(g.pontos, 0);
  assert.ok(g.inline_sem_marcas.includes('tools/cockpit/moo-pilot-shell.html'));
});

test('numero-honesto: superficie PUBLICA suja continua a zerar', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* A separacao publico/produto NAO pode virar uma porta lateral: um claim na
     home continua a valer zero, exactamente como antes. */
  escreve(b.repo, 'landing/app/page.tsx', 'export const c = "typically ~30% less";\n');

  const n = v(corre(b).rel, 'numero-honesto');
  assert.equal(n.pontos, 0, 'a home suja zera');
  assert.equal(n.estado, 'falha');
});

test('numero-honesto: a shell autenticada vale METADE, nunca a nota cheia', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  escreve(b.repo, 'README.md', '# t\n');
  /* Ao separar publico de produto o indice saltou de 8,18 para 10,00. Um dez
     tirado no minuto em que se muda a regua nao e um dez. Quem muda a regua nao
     fica com o premio: a metade conquistada conta, a outra fica presa. */
  escreve(b.repo, 'landing/app/(app)/dashboard/page.tsx',
    'const x = `$${saved.toFixed(2)} saved`;\n');

  const n = v(corre(b).rel, 'numero-honesto');
  assert.equal(n.pontos, 1.0, 'metade, nao 2.0');
  assert.equal(n.estado, 'aviso');
  assert.ok(n.no_produto_autenticado > 0, 'e tem de ser CONTADO, nao escondido');
  assert.match(n.porque, /shell autenticada/);
});

test('numero-honesto: so a nota cheia quando NAO ha claims em lado nenhum', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);

  const n = v(corre(b).rel, 'numero-honesto');
  assert.equal(n.pontos, 2.0);
  assert.equal(n.no_produto_autenticado, 0);
});

// ── A ESCALA DE RAIOS ──────────────────────────────────────────────────────
//
// Até 2026-08-28 o `RAIO_OK` era um `Set` escrito à mão dentro deste portão —
// `[0,1,2,3,4,6,7,8,9,10,11,12,14,16,999]` — enquanto o token declarava
// `radius = {6,10,14,16,999}`. Uma terceira fonte de verdade no ficheiro cuja
// tese é que a fonte é o JSON. E a regex só via a sintaxe CSS: um objecto de
// estilo em JS escreve `borderRadius: 999`, sem traço e sem `px`, e passava
// invisível — foi assim que uma pílula sobreviveu a uma onda inteira com o
// índice a 9,09.
//
// Estes quatro testes plantam cada metade do defeito.

test('raio: um valor CSS fora da escala é apanhado', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/app/globals.css', ':root{color:#fff}\n.x{border-radius:13px}\n');
  const { rel } = corre(b);
  const lv = v(rel, 'linguagem');
  assert.equal(lv.pontos, 0, 'um raio de 13px passou pelo portão');
  assert.ok(JSON.stringify(lv).includes('raio fora da escala'));
});

test('MORDIDA · um raio em JSX (`borderRadius: N`) é apanhado — era invisível', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  // Sintaxe de objecto JS: sem traço, sem `px`. A regex de CSS nunca lhe tocava.
  escreve(b.repo, 'landing/app/globals.css', ':root{color:#fff}\n/* const s = { borderRadius: 13 } */\n');
  const { rel } = corre(b);
  assert.equal(v(rel, 'linguagem').pontos, 0, 'a sintaxe JSX voltou a ser invisível');
});

test('raio: um valor DA escala não é apanhado — nas duas sintaxes', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  // 2/4/6/8/10/14/16/999 são a escala; 0 é ausência de raio.
  escreve(b.repo, 'landing/app/globals.css',
    ':root{color:#fff}\n.a{border-radius:8px}\n.b{border-radius:999px}\n/* { borderRadius: 4 } */\n');
  const { rel } = corre(b);
  assert.equal(v(rel, 'linguagem').pontos, 1.0, 'o portão acusou um raio que está na escala');
});

test('MORDIDA · o portão SEGUE o token: tirar um degrau passa a acusar quem o usa', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/app/globals.css', ':root{color:#fff}\n.a{border-radius:8px}\n');
  assert.equal(v(corre(b).rel, 'linguagem').pontos, 1.0, 'com `panel: 8px` na escala, 8 passa');

  // Tira o degrau do TOKEN — sem tocar no portão.
  const tok = join(b.raiz, 'design', 'tokens', 'moo-tokens.json');
  const j = JSON.parse(readFileSync(tok, 'utf8'));
  delete j.radius.panel;
  writeFileSync(tok, JSON.stringify(j, null, 2) + '\n');

  assert.equal(v(corre(b).rel, 'linguagem').pontos, 0,
    'o RAIO_OK deixou de derivar do token — voltou a ser um Set paralelo');
});

// ── O ÂMBITO: os .tsx da landing ───────────────────────────────────────────
//
// Até 2026-08-28 a `linguagem-visual` varria 5 superfícies HTML/CSS mais
// `design/` — **10 ficheiros**. Os `.tsx` da landing nunca estiveram na lista, e
// não era só a regex que não via `borderRadius:`: os ficheiros nem eram abertos.
// Foi assim que uma pílula de raio 9999 sobreviveu a uma onda inteira com o
// índice a 9,09.
//
// O âmbito abriu depois de os 32 raios fora da escala terem sido corrigidos —
// a regra que este ficheiro exigia: a lista de sítios primeiro. Passou a varrer
// 123. Estes testes garantem que não volta a fechar.

test('MORDIDA · um raio fora da escala num .tsx da landing é apanhado', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/app/qualquer/page.tsx',
    'export default () => <div style={{ borderRadius: 13 }} />;\n');
  const lv = v(corre(b).rel, 'linguagem');
  assert.equal(lv.pontos, 0, 'o âmbito voltou a excluir os .tsx da landing');
  assert.ok(JSON.stringify(lv).includes('qualquer/page.tsx'), 'apanhou, mas não disse onde');
});

test('MORDIDA · e em landing/components também', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/components/Coisa.tsx',
    'export default () => <div style={{ borderRadius: 9999 }} />;\n');
  assert.equal(v(corre(b).rel, 'linguagem').pontos, 0,
    '`landing/components` ficou fora do âmbito — era lá que viviam Card e TerminalCard');
});

test('um ficheiro de TESTE continua fora — é onde a decisão se defende', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  // A mesma viola\u00e7\u00e3o, mas num `.test.tsx`: n\u00e3o pode contar.
  escreve(b.repo, 'landing/app/x/algo.test.tsx',
    'it("recusa raios fora da escala", () => expect(s).not.toContain("borderRadius: 13"));\n');
  assert.equal(v(corre(b).rel, 'linguagem').pontos, 1.0,
    'um teste que CITA a violação passou a contar como violação');
});

test('MORDIDA · a família de curvas segue o token, não um Set à mão', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  // `.2,.8,.2,1` é uma das quatro do token — e a forma com `0.` é a mesma curva.
  escreve(b.repo, 'landing/app/a/page.tsx',
    'export default () => <div style={{ transition: "all 140ms cubic-bezier(0.2, 0.8, 0.2, 1)" }} />;\n');
  assert.equal(v(corre(b).rel, 'linguagem').pontos, 1.0,
    'uma curva DA família foi acusada — a normalização do `0.` partiu-se');

  // Tira essa curva do TOKEN e a mesma linha passa a ser violação.
  const tok = join(b.raiz, 'design', 'tokens', 'moo-tokens.json');
  const j = JSON.parse(readFileSync(tok, 'utf8'));
  const limpa = (o) => {
    for (const [k, val] of Object.entries(o)) {
      if (typeof val === 'string' && val.includes('.2,.8,.2,1')) delete o[k];
      else if (val && typeof val === 'object') limpa(val);
    }
  };
  limpa(j.motion);
  writeFileSync(tok, JSON.stringify(j, null, 2) + '\n');

  assert.equal(v(corre(b).rel, 'linguagem').pontos, 0,
    'o EAS_OK deixou de derivar do token — voltou a ser um Set paralelo');
});

/* ─────────────────────────────────────────────────────────────────────────────
   `landing/public` — o âmbito que faltava, e porque tem de ter mordida própria

   Alargado a 2026-08-29. Até esse dia NENHUMA das listas do portão incluía
   `landing/public`: nem `SUPERFICIES_TEXTO` (número honesto, superfícies vivas),
   nem os alvos da linguagem visual, nem os do movimento. E ali vive o
   `brand-guide.html`, servido em `mooter.ai/brand-guide.html` — **HTTP 200**,
   tão público quanto este projecto tem.

   O que estava lá, medido no dia em que o âmbito abriu:
     · um espécime de tipografia a publicar `$6.29 saved`, uma cifra inventada
       exactamente da classe que a auditoria de 2026-08-23 matou em todo o lado;
     · uma spec da secção 03 a PRESCREVER à landing uma headline com `84%`,
       ou seja, a mandar fazer o contrário da decisão de 2026-08-24;
     · e uma terceira ocorrência que é legítima e ficou declarada — a lista
       «✗ Hero NÃO contém», onde citar o banner é vedá-lo, não publicá-lo.

   Os dois primeiros foram corrigidos ANTES de o âmbito abrir. Estes testes
   existem para que a pasta não possa voltar a sair da lista em silêncio, que é
   como os `.svg` sobreviveram invisíveis até 2026-08-27 e como o
   `moo-visual-audit.test.mjs` ficou fora do `test:design` até 2026-08-29. Um
   âmbito sem mordida é uma lista de boas intenções. */

test('MORDIDA · uma cifra poupada em `landing/public` é um claim PÚBLICO', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/public/brand-guide.html',
    '<!doctype html><p>$6.29 saved</p>\n');

  const num = v(corre(b).rel, 'numero-honesto');
  assert.equal(num.pontos, 0, 'um claim publicado em landing/public passou — a pasta saiu do âmbito');
  assert.ok(num.achados.some((a) => a.ficheiro.includes('landing/public')),
    `o achado devia apontar a landing/public: ${JSON.stringify(num.achados)}`);
});

test('MORDIDA · um raio fora da escala em `landing/public` é uma violação', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  // 13 não está na escala canónica (2/4/6/8/10/14/16/999).
  escreve(b.repo, 'landing/public/brand-guide.html',
    '<!doctype html><style>.c { border-radius: 13px; }</style>\n');

  const lng = v(corre(b).rel, 'linguagem');
  assert.equal(lng.pontos, 0, 'um raio fora da escala em landing/public passou — a pasta saiu do âmbito');
});

test('mas `landing/public` limpo não inventa achados', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  superficieLimpa(b.repo);
  escreve(b.repo, 'landing/public/brand-guide.html',
    '<!doctype html><style>.c { border-radius: 10px; }</style><p>a marca do Mooter</p>\n');

  const r = corre(b).rel;
  for (const id of ['numero-honesto', 'linguagem']) {
    const x = v(r, id);
    assert.notEqual(x.pontos, 0, `${id} acusou uma folha limpa: ${JSON.stringify(x.achados ?? x.porque)}`);
  }
});
