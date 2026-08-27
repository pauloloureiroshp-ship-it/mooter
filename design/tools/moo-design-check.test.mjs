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

  const mau = corre(b, { ci: true });
  assert.equal(mau.code, 1, 'com uma variante legado viva o CI tem de ficar vermelho');
  assert.equal(mau.rel.passa, false);
  assert.ok(mau.rel.indice_coerencia_visual < mau.rel.limiar,
    `${mau.rel.indice_coerencia_visual} devia estar abaixo do limiar ${mau.rel.limiar}`);

  /* O verde tem de ser alcançável, senão o vermelho não significa nada. */
  rmSync(join(b.repo, 'landing/public/mooter-logo-legacy.svg'));
  const bom = corre(b, { ci: true });
  assert.equal(bom.code, 0, `esperava verde. índice=${bom.rel?.indice_coerencia_visual}`);
  assert.equal(bom.rel.passa, true);
});
