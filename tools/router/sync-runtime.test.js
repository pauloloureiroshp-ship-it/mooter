// sync-runtime.test.js
//
// O teste que teria apanhado o defeito de 2026-08-31: um espelho que copia 343
// ficheiros, declara sucesso, e deixa uma pasta inteira para trás.
//
// A mordida central é `listarJs` ser RECURSIVO. Tudo o resto protege as regras
// que tornam o espelho auto-mantido (os `.json` derivados, não listados).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mod = require('./sync-runtime.js');
const { sync, listarJs, listarJson, ficheirosVersionados, JSON_SEMPRE } = mod;

function tmpRepo() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-syncrt-'));
  const src = path.join(raiz, 'src');
  const home = path.join(raiz, 'home');
  fs.mkdirSync(path.join(src, 'providers'), { recursive: true });
  fs.mkdirSync(path.join(src, 'node_modules', 'lixo'), { recursive: true });
  fs.mkdirSync(home, { recursive: true });

  fs.writeFileSync(path.join(src, 'classify.js'), '// raiz\nrequire("./gold-labels.json");\n');
  fs.writeFileSync(path.join(src, 'outro.js'), '// raiz 2\n');
  fs.writeFileSync(path.join(src, 'classify.test.js'), '// teste, não é runtime\n');
  fs.writeFileSync(path.join(src, 'providers', 'ollama-api.js'), '// SUBPASTA — o ficheiro que o glob perdia\n');
  fs.writeFileSync(path.join(src, 'providers', 'ollama-api.test.js'), '// teste em subpasta\n');
  fs.writeFileSync(path.join(src, 'node_modules', 'lixo', 'index.js'), '// nunca\n');

  fs.writeFileSync(path.join(src, 'gold-labels.json'), '{}');      // mencionado por classify.js
  fs.writeFileSync(path.join(src, 'version.json'), '{"version":"1.52.0"}'); // JSON_SEMPRE
  fs.writeFileSync(path.join(src, 'package.json'), '{}');          // ninguém o menciona
  fs.writeFileSync(path.join(src, 'tsconfig.json'), '{}');         // idem

  return { raiz, src, home, dst: path.join(home, '.claude', 'tools', 'router') };
}

const limpar = (r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch {} };

// ── a mordida ────────────────────────────────────────────────────────────

test('listarJs é RECURSIVO — a subpasta providers/ não pode ficar para trás', () => {
  const t = tmpRepo();
  try {
    const js = listarJs(t.src);
    assert.ok(js.includes(path.join('providers', 'ollama-api.js')),
      `providers/ollama-api.js em falta. Encontrados: ${js.join(', ')}`);
    assert.ok(js.includes('classify.js'));
  } finally { limpar(t.raiz); }
});

test('listarJs exclui testes (raiz E subpasta) e node_modules', () => {
  const t = tmpRepo();
  try {
    const js = listarJs(t.src);
    assert.ok(!js.some((f) => f.endsWith('.test.js')), `testes copiados: ${js.join(', ')}`);
    assert.ok(!js.some((f) => f.includes('node_modules')), 'node_modules copiado');
  } finally { limpar(t.raiz); }
});

test('sync copia a subpasta e cria-a no destino se não existir', () => {
  const t = tmpRepo();
  try {
    const r = sync({ src: t.src, home: t.home });
    const alvo = path.join(t.dst, 'providers', 'ollama-api.js');
    assert.ok(fs.existsSync(alvo), 'providers/ollama-api.js não aterrou no destino');
    assert.ok(r.copiados.includes(path.join('providers', 'ollama-api.js')));
  } finally { limpar(t.raiz); }
});

// ── os .json derivados, não listados ─────────────────────────────────────

test('listarJson apanha o que o código menciona e ignora o que ninguém menciona', () => {
  const t = tmpRepo();
  try {
    const json = listarJson(t.src, listarJs(t.src));
    assert.ok(json.includes('gold-labels.json'), 'gold-labels.json é requerido por classify.js');
    assert.ok(!json.includes('package.json'), 'package.json não é runtime');
    assert.ok(!json.includes('tsconfig.json'), 'tsconfig.json não é runtime');
  } finally { limpar(t.raiz); }
});

test('version.json entra sempre — nenhum .js o nomeia, e já ficou preso em 0.11.0', () => {
  const t = tmpRepo();
  try {
    const conteudo = fs.readFileSync(path.join(t.src, 'classify.js'), 'utf8');
    assert.ok(!conteudo.includes('version.json'), 'pré-condição: nada o menciona');
    const json = listarJson(t.src, listarJs(t.src));
    assert.ok(json.includes('version.json'));
    assert.deepEqual(JSON_SEMPRE, ['version.json']);
  } finally { limpar(t.raiz); }
});

// ── --check ──────────────────────────────────────────────────────────────

test('--check acusa divergência e NÃO escreve', () => {
  const t = tmpRepo();
  try {
    const r = sync({ src: t.src, home: t.home, check: true });
    assert.ok(r.emFalta.length > 0, 'devia acusar tudo em falta');
    assert.equal(r.copiados.length, 0, 'check não pode copiar');
    assert.ok(!fs.existsSync(path.join(t.dst, 'classify.js')), 'check escreveu no destino');
  } finally { limpar(t.raiz); }
});

test('--check fica limpo depois de um sync — e volta a acusar se um ficheiro mudar', () => {
  const t = tmpRepo();
  try {
    sync({ src: t.src, home: t.home });
    assert.deepEqual(sync({ src: t.src, home: t.home, check: true }).emFalta, []);

    // é exactamente o cenário real: o repo avança, o runtime fica para trás
    fs.writeFileSync(path.join(t.src, 'providers', 'ollama-api.js'), '// versão nova\n');
    const depois = sync({ src: t.src, home: t.home, check: true });
    assert.ok(depois.emFalta.includes(path.join('providers', 'ollama-api.js')),
      'um ficheiro de SUBPASTA alterado tem de aparecer como divergente');
  } finally { limpar(t.raiz); }
});

test('sync é idempotente — segunda corrida não copia nada', () => {
  const t = tmpRepo();
  try {
    const a = sync({ src: t.src, home: t.home });
    assert.ok(a.copiados.length > 0);
    const b = sync({ src: t.src, home: t.home });
    assert.deepEqual(b.copiados, [], 'segunda corrida devia ser no-op');
  } finally { limpar(t.raiz); }
});

// ── paridade com o repo real ─────────────────────────────────────────────

test('no repo real, as subpastas são apanhadas e os testes não', () => {
  // Guarda contra o defeito concreto de 2026-08-31: o glob de um nível copiava
  // a raiz e deixava as subpastas para trás.
  //
  // Contagem medida nesse dia, para o limiar não ser um número escolhido a olho:
  // 345 `.js` no nível 1, dos quais **141 são testes** → 204 de runtime na raiz,
  // mais 17 nas subpastas (providers 5 · forecast 9 · hooks 3) = **221**.
  // (O «343» que andou nos relatórios desta sessão contava os testes — era a
  // métrica errada, e é por isso que o limiar se ancora nos 204 da raiz.)
  const js = listarJs(__dirname);
  const emProviders = js.filter((f) => f.startsWith('providers' + path.sep));
  assert.ok(emProviders.length >= 4, `só ${emProviders.length} ficheiros de providers/ — o glob de um nível está de volta`);
  assert.ok(emProviders.some((f) => f.endsWith('ollama-api.js')));
  assert.ok(!js.some((f) => f.endsWith('.test.js')));
  assert.ok(js.length > 200, `só ${js.length} .js de runtime — a varredura deixou de ver a raiz`);
  // e o total tem de ser estritamente maior do que só a raiz
  const naRaiz = js.filter((f) => !f.includes(path.sep)).length;
  assert.ok(js.length > naRaiz, `${js.length} total vs ${naRaiz} na raiz — nenhuma subpasta entrou`);
});

test('no repo real, os .json requeridos por código entram', () => {
  const js = listarJs(__dirname);
  const json = listarJson(__dirname, js);
  // `safety_seeds.json` é requerido por código e estava AUSENTE do runtime a 2026-08-31.
  assert.ok(json.includes('safety_seeds.json'), 'safety_seeds.json é requerido por código');
  assert.ok(json.includes('version.json'));
});

test('configuração de projecto NUNCA entra, mesmo sendo mencionada pelo código', () => {
  // Este teste existe por um defeito meu, não herdado: a primeira versão usava só
  // «algum .js menciona o nome», e a primeira corrida do --check no repo real
  // arrastou package.json, tsconfig.json e .prettierrc.json — nomeados de
  // passagem em arbiter.js/classify.js/env.js. Um package.json em
  // ~/.claude/tools/router/ governa a resolução de módulos daquela árvore: com
  // "type":"module" partia todos os require() do runtime de uma vez.
  const js = listarJs(__dirname);
  const corpus = js.map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('');
  assert.ok(corpus.includes('package.json'), 'pré-condição: o código MENCIONA package.json');

  const json = listarJson(__dirname, js);
  for (const proibido of ['package.json', 'package-lock.json', 'tsconfig.json', '.prettierrc.json']) {
    assert.ok(!json.includes(proibido), `${proibido} não pode entrar no runtime`);
  }
});

test('JSON_NUNCA ganha a JSON_SEMPRE se alguém puser o mesmo nome nos dois', () => {
  // Sem ordem definida, uma colisão futura resolvia-se por acaso.
  const t = tmpRepo();
  try {
    fs.writeFileSync(path.join(t.src, 'classify.js'), 'require("./package.json");\n');
    const json = listarJson(t.src, listarJs(t.src));
    assert.ok(!json.includes('package.json'));
  } finally { limpar(t.raiz); }
});

// ── só o que o git distribui ─────────────────────────────────────────────
//
// Defeito meu, apanhado na primeira corrida a partir do checkout principal — um
// checkout DE TRABALHO, ao contrário do worktree limpo onde os testes acima
// correm. Sem o filtro, o espelho arrastava `coverage/lcov-report/*.js` e 12
// `.json` de estado local, entre eles o `router-tuning.json` que o backtest
// escreve DIRECTAMENTE no runtime: copiá-lo do repo por cima desfaz o tuning
// da máquina, em silêncio, no mesmo passo que imprime `✓ synced`.

test('estado local e artefactos NÃO são copiados — só o que está versionado', () => {
  const t = tmpRepo();
  try {
    fs.writeFileSync(path.join(t.src, 'router-tuning.json'), '{"local":true}');
    fs.writeFileSync(path.join(t.src, 'classify.js'),
      'require("./gold-labels.json");require("./router-tuning.json");\n');

    // o git diz que só estes é que se distribuem
    const versionados = new Set(['classify.js', 'gold-labels.json', 'version.json',
      path.join('providers', 'ollama-api.js')].map((p) => path.normalize(p)));

    const r = sync({ src: t.src, home: t.home, versionados });
    assert.ok(!fs.existsSync(path.join(t.dst, 'router-tuning.json')),
      'router-tuning.json é estado local — copiá-lo apaga o tuning do runtime');
    assert.ok(fs.existsSync(path.join(t.dst, 'gold-labels.json')), 'gold-labels.json é versionado');
    assert.ok(fs.existsSync(path.join(t.dst, 'providers', 'ollama-api.js')));
    assert.equal(r.total, 4);
  } finally { limpar(t.raiz); }
});

test('sem git (instalação por tarball) o filtro desliga em vez de copiar nada', () => {
  // Um filtro que falhasse fechado transformava «git ausente» em «runtime vazio».
  const t = tmpRepo();
  try {
    assert.equal(ficheirosVersionados(t.src), null, 'tmpdir não é repo git');
    const r = sync({ src: t.src, home: t.home });
    assert.ok(r.total > 0, 'sem git tem de copiar à mesma');
    assert.ok(fs.existsSync(path.join(t.dst, 'providers', 'ollama-api.js')));
  } finally { limpar(t.raiz); }
});

test('coverage/ nunca entra, mesmo que alguém o versione por engano', () => {
  const t = tmpRepo();
  try {
    fs.mkdirSync(path.join(t.src, 'coverage', 'lcov-report'), { recursive: true });
    fs.writeFileSync(path.join(t.src, 'coverage', 'lcov-report', 'prettify.js'), '// artefacto\n');
    const js = listarJs(t.src);
    assert.ok(!js.some((f) => f.includes('coverage')), `coverage entrou: ${js.join(', ')}`);
  } finally { limpar(t.raiz); }
});

test('no repo real, o filtro do git existe e exclui estado local', () => {
  const v = ficheirosVersionados(__dirname);
  assert.ok(v && v.size > 100, `git ls-files devolveu ${v ? v.size : 'null'} — o filtro não está a funcionar`);
  assert.ok(v.has('classify.js'), 'classify.js é versionado');
  for (const estado of ['router-tuning.json', 'quota-state.json', 'tuning-state.json', 'subscription-profile.json']) {
    assert.ok(!v.has(estado), `${estado} é estado local e não pode ser distribuído`);
  }
});
