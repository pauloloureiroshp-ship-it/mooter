'use strict';
/**
 * corpus-de-routing.test.js — a suite nao pode escrever no corpus do dono.
 *
 * ── O QUE ISTO TRAVA (medido a 2026-09-03) ──────────────────────────────────
 *
 * O C1.3 pos `seamless.js` a chamar `decisions_v2.appendMeasured` sem
 * `logPath`, o que resolve para `~/.claude/tools/router/decisions_v2.jsonl`.
 * Dois testes desta pasta fazem despachos a serio contra motores de mentira,
 * por isso cada `npm test` punha DUAS linhas `tokens_fonte: 'medido'` — 10/5 do
 * stub do Ollama e 100/80 da fixture do `v12.test.js:288` — no corpus REAL.
 *
 * O corpus tinha 420 linhas e 4 «medidas»: dois pares identicos, um por corrida
 * da suite. Nenhuma vinha de um motor. A mudanca escrita para impedir numeros
 * nao medidos de entrarem no corpus era a unica coisa a por la numeros
 * inventados.
 *
 * A correccao vive em `testes-nao-escrevem-no-corpus.cjs`, carregado por
 * `--require`. Estes testes provam que ela esta LIGADA e que MORDE — um
 * ficheiro de isolamento que ninguem carrega e pior do que nenhum, porque
 * parece cobertura.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { execFileSync } = require('child_process');

const AQUI = __dirname;
const REPO = path.join(AQUI, '..', '..');
const ISOLAMENTO = 'testes-nao-escrevem-no-corpus.cjs';

/** Corre um node filho e devolve o `logPath()` que o `decisions_v2` resolveria. */
function logPathNumFilho({ comIsolamento }) {
  const dv2 = JSON.stringify(path.join(REPO, 'tools', 'router', 'decisions_v2.js'));
  // Pergunta-se ao PROPRIO `decisions_v2.js` onde e que ele escreveria. Copiar
  // a regra para aqui provaria a copia, e a copia nunca esta errada.
  const src = `${comIsolamento ? `require(${JSON.stringify(path.join(AQUI, ISOLAMENTO))});` : ''}
    console.log(require(${dv2}).logPath());`;
  // `env` limpo do que a corrida-mae ja redireccionou, senao o caso "sem
  // isolamento" herdava a correccao e passava sem provar nada.
  const env = { ...process.env };
  delete env.MOOTER_CLAUDE_DIR;
  delete env.FRUGAL_CLAUDE_DIR;
  delete env.MOOTER_DECISIONS_V2_LOG;
  return execFileSync(process.execPath, ['-e', src], { env, encoding: 'utf8' }).trim();
}

test('o isolamento esta LIGADO ao `npm test` — senao e um ficheiro decorativo', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(AQUI, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, new RegExp(`--require\\s+\\./${ISOLAMENTO.replace('.', '\\.')}`),
    `scripts.test e "${pkg.scripts.test}" — sem o --require, a suite volta a escrever no corpus do dono`);
  assert.match(pkg.scripts.test, /--test/, 'o script deixou de correr os testes');
});

/**
 * O BURACO QUE O `--require` NAO TAPA — e exactamente esse, nem mais nem menos.
 *
 * O preload cobre tudo o que passe pelo `npm test` (que e o que o CI corre e o
 * que qualquer pessoa corre). Fica de fora UM caminho: um humano a correr o
 * ficheiro a mao. E a unica forma de um humano aprender a faze-lo e o cabecalho
 * do proprio ficheiro lho ensinar — `v12.test.js:6` diz «Run: node v12.test.js»,
 * e esse ficheiro despacha e escreve no corpus (a fixture 100/80).
 *
 * Por isso a guarda e sobre a interseccao, e nao sobre «tudo o que despacha»:
 * dez ficheiros desta pasta chamam `toolWork` e nunca chegam a escrever (param
 * antes, ou sem `telemetry`), e exigir-lhes a linha seria ruido que ninguem
 * mantem. O que nao pode existir e um ficheiro que ENSINE a correr-se a mao E
 * despache. Apanhado pelo adversario (codex, 2026-09-03).
 */
test('nenhum teste ensina a correr-se a mao E despacha sem carregar o isolamento', () => {
  const ficheiros = fs.readdirSync(AQUI).filter((f) => /\.test\.(js|cjs|mjs)$/.test(f));
  assert.ok(ficheiros.length > 20, `so ${ficheiros.length} testes encontrados — a varredura nao esta a ver a pasta`);
  const descobertos = [];
  let comCabecalho = 0;
  for (const f of ficheiros) {
    const src = fs.readFileSync(path.join(AQUI, f), 'utf8');
    const cabecalho = src.slice(0, 1200);
    if (!new RegExp(`node\\s+(\\./)?${f.replace(/\./g, '\\.')}`).test(cabecalho)) continue;
    comCabecalho += 1;
    if (!/\b(toolWork|toolDispatch)\s*\(/.test(src)) continue;
    if (!src.includes(ISOLAMENTO)) descobertos.push(f);
  }
  assert.ok(comCabecalho >= 2,
    `so ${comCabecalho} ficheiro(s) com cabecalho de corrida directa — a deteccao partiu-se`);
  assert.deepEqual(descobertos, [],
    `ensinam a correr-se a mao, despacham, e nao carregam o isolamento: ${descobertos.join(', ')}`);
});

test('os dois que ESCREVEM no corpus carregam o isolamento — nomeados, porque sao medidos', () => {
  // Medido a 2026-09-03: uma suite completa produzia exactamente DUAS escritas,
  // destes dois ficheiros. Nao e uma lista de estilo — e a lista dos que a
  // medicao apanhou. Se aparecer um terceiro, a assercao de 420->420 do
  // cabecalho deste ficheiro cai primeiro.
  for (const f of ['v12.test.js', 'cadeia-nao-silenciosa.test.js']) {
    const src = fs.readFileSync(path.join(AQUI, f), 'utf8');
    assert.ok(src.includes(ISOLAMENTO), `${f} escreve no corpus e nao carrega o isolamento`);
  }
});

test('o CI corre o MESMO comando — um gate que nao carrega o isolamento nao o gateia', () => {
  // O passo do CI corria `node --test` cru (test.yml:355). Com o isolamento no
  // `npm test`, isso punha o merge a ser decidido por um comando diferente do
  // que qualquer pessoa corre a mao — e a regressao passava em verde.
  const wf = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'test.yml'), 'utf8');
  const i = wf.indexOf('Test mooter-bridge');
  assert.ok(i > 0, 'o passo `Test mooter-bridge` desapareceu do CI');
  const bloco = wf.slice(i, i + 220);
  assert.match(bloco, /run:\s*npm test/, `o passo do CI corre outra coisa:\n${bloco}`);

  // E NENHUM passo com `working-directory: packages/mooter-bridge` pode correr
  // `node --test` cru — senao a cobertura depende de qual passo apanha o teste
  // novo. O adversario apanhou o passo do `entrega.test.js` a faze-lo.
  const crus = [];
  const re = /working-directory:\s*packages\/mooter-bridge\s*\n(?:\s*#[^\n]*\n)*\s*run:\s*([^\n]+)/g;
  for (let m = re.exec(wf); m; m = re.exec(wf)) {
    if (/^node\s+--test/.test(m[1].trim())) crus.push(m[1].trim());
  }
  assert.deepEqual(crus, [],
    `passos do CI a correr \`node --test\` cru no bridge (sem isolamento): ${crus.join(' | ')}`);
});

test('o isolamento MORDE: sem ele o corpus e o do dono, com ele nao', () => {
  const sem = logPathNumFilho({ comIsolamento: false });
  const com = logPathNumFilho({ comIsolamento: true });

  assert.equal(sem, path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions_v2.jsonl'),
    'sem isolamento o alvo deixou de ser o corpus real — o teste perdeu a mordida');
  assert.notEqual(com, sem);
  assert.ok(!com.startsWith(path.join(os.homedir(), '.claude')),
    `com isolamento ainda escreve dentro de ~/.claude: ${com}`);
  assert.ok(com.startsWith(os.tmpdir()), `o alvo isolado devia estar em tmp: ${com}`);
});

test('quem quiser INSPECCIONAR o que foi escrito continua a mandar', () => {
  // `||=`, e nao atribuicao cega: um teste que leia o corpus escrito aponta
  // `MOOTER_CLAUDE_DIR` para o seu proprio temporario e o isolamento respeita.
  const meu = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-meu-'));
  const src = `process.env.MOOTER_CLAUDE_DIR = ${JSON.stringify(meu)};
    require(${JSON.stringify(path.join(AQUI, ISOLAMENTO))});
    console.log(process.env.MOOTER_CLAUDE_DIR);`;
  const out = execFileSync(process.execPath, ['-e', src], { encoding: 'utf8' }).trim();
  assert.equal(out, meu, 'o isolamento pisou uma escolha explicita');
  fs.rmSync(meu, { recursive: true, force: true });
});
