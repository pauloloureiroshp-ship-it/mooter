/**
 * bin-resolver.test.mjs — a tabela que impede as DUAS copias de divergirem.
 *
 * O repo tem dois resolvedores de binario, e a duplicacao e deliberada:
 * `gh-bin.mjs` corre no F10 (ESM) e `packages/mooter-bridge/bin-resolver.js`
 * entra no bundle esbuild do conector (CJS), que nao arrasta codigo de fora do
 * pacote. Uma regra escrita duas vezes envelhece em silencio — a nao ser que
 * as duas sejam provadas contra a MESMA tabela. Precedente:
 * `tools/router/ollama-host.casos.json`.
 *
 * NENHUM teste toca no disco real: o `existsImpl` e injectado sempre. Um teste
 * que leia o disco desta bancada passa ou falha conforme a maquina — que e
 * exactamente a classe de teste que o guardrail desta onda proibe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..', '..');
const require = createRequire(import.meta.url);

const ghBin = await import('./gh-bin.mjs');
const bridge = require(path.join(REPO, 'packages', 'mooter-bridge', 'bin-resolver.js'));

const TABELA = JSON.parse(fs.readFileSync(path.join(AQUI, 'bin-resolver.casos.json'), 'utf8'));

const LADOS = {
  'gh-bin': ghBin.resolverBin,
  'bin-resolver': bridge.resolverBin,
};

for (const caso of TABELA.casos) {
  const aplica = caso.aplica_a.includes('ambos') ? Object.keys(LADOS) : caso.aplica_a;
  for (const lado of aplica) {
    test(`[${lado}] ${caso.nome}`, () => {
      const existentes = new Set(caso.existe);
      const r = LADOS[lado](caso.binario, {
        env: caso.env,
        home: caso.home,
        plataforma: caso.plataforma,
        existsImpl: (p) => existentes.has(p),
      });
      assert.equal(r.caminho, caso.espera.caminho);
      assert.equal(r.fonte, caso.espera.fonte);
    });
  }
}

test('a tabela cobre os dois lados — uma tabela so de um lado nao prova paridade nenhuma', () => {
  const ambos = TABELA.casos.filter((c) => c.aplica_a.includes('ambos'));
  assert.ok(ambos.length >= 5, `so ${ambos.length} casos partilhados — a paridade fica por provar`);
});

test('`nomesDe` e identico nos dois lados, plataforma a plataforma', () => {
  for (const plat of ['darwin', 'linux', 'win32']) {
    for (const b of ['gh', 'claude', 'codex']) {
      assert.deepEqual(
        bridge.nomesDe(b, plat), ghBin.nomesDe(b, plat),
        `nomesDe('${b}','${plat}') divergiu entre as duas copias`,
      );
    }
  }
});

test('`redigirCasa` e identico nos dois lados — o nome do dono nao pode escapar por uma so das portas', () => {
  const home = '/Users/alguem';
  const txt = 'spawn /Users/alguem/.local/node/bin/codex ENOENT';
  assert.equal(bridge.redigirCasa(txt, { home }), ghBin.redigirCasa(txt, { home }));
  assert.equal(bridge.redigirCasa(txt, { home }), 'spawn ~/.local/node/bin/codex ENOENT');
});

test('procurados diz QUANTOS sitios se procurou — uma falha sem isso nao e diagnostico', () => {
  for (const [lado, fn] of Object.entries(LADOS)) {
    const r = fn('claude', {
      env: { PATH: '/usr/bin:/bin' }, home: '/home/x', plataforma: 'linux', existsImpl: () => false,
    });
    assert.equal(r.caminho, null, lado);
    assert.ok(r.procurados.length >= 8, `[${lado}] so procurou em ${r.procurados.length} sitios`);
    assert.equal(r.path_do_processo, '/usr/bin:/bin', `[${lado}] a falha nao diz com que PATH correu`);
  }
});

test('um directorio ilegivel nao derruba a procura — continua no seguinte', () => {
  for (const [lado, fn] of Object.entries(LADOS)) {
    const r = fn('claude', {
      env: { PATH: '/proibido:/bom' }, home: '/home/x', plataforma: 'linux',
      existsImpl: (p) => {
        if (p.startsWith('/proibido')) throw new Error('EACCES');
        return p === '/bom/claude';
      },
    });
    assert.equal(r.caminho, '/bom/claude', lado);
  }
});

test('o conector resolve ANTES do spawn — e publica a fonte, nunca o caminho', () => {
  const seamless = fs.readFileSync(path.join(REPO, 'packages', 'mooter-bridge', 'seamless.js'), 'utf8');
  assert.match(seamless, /require\('\.\/bin-resolver\.js'\)/, 'o seamless nao importa o resolvedor');
  assert.match(seamless, /binResolver\.resolverBin\(cmd\.bin/, 'o seamless nao resolve antes do spawn');
  assert.match(seamless, /cmd\.bin_fonte = achado\.fonte/, 'a fonte nao viaja — o ambiente pobre fica invisivel');
  assert.doesNotMatch(seamless, /bin_caminho\s*=/, 'o caminho absoluto nao pode ir para o payload');
});
