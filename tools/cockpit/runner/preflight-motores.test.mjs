/**
 * preflight-motores.test.mjs
 *
 * O que estes testes defendem nao e a lista de motores: e a RECUSA de afirmar
 * o que nao se mediu. O pre-flight nasceu porque quatro de seis tarefas
 * morreram sem o painel dizer nada — e a tentacao obvia era substituir esse
 * silencio por um verde. Um verde de presenca e a mesma mentira, so que mais
 * confiante: medido na mesma bancada, `~/.gemini/settings.json` tem
 * `selectedAuthType` e o `gemini` recusa-se a correr.
 *
 * Nada aqui toca no disco real nem no ambiente real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..', '..');

const {
  preFlight, preFlightDe, MOTORES, ENV_NECESSARIO, CREDENCIAL,
} = await import('./preflight-motores.mjs');

const MAC = { plataforma: 'darwin', home: '/Users/alguem' };
const motorDe = (id) => MOTORES.find((m) => m.id === id);
/** Um disco onde existe exactamente o que se listar. */
const disco = (...ps) => { const s = new Set(ps); return (p) => s.has(p); };

test('`autenticado` e SEMPRE null — presenca nao e prova de sessao', () => {
  const r = preFlight({
    ...MAC,
    env: { PATH: '/usr/bin', HOME: '/Users/alguem', USER: 'alguem', MOONSHOT_API_KEY: 'k' },
    existsImpl: () => true,
    motorLocalVivo: true,
  });
  for (const m of r.motores) {
    assert.equal(m.autenticado, null, `${m.id} afirma autenticacao que ninguem provou`);
    assert.ok(m.autenticado_porque, `${m.id} diz n/d sem dizer porque`);
  }
});

test('o caso medido: `USER` em falta bloqueia o cc e NOMEIA a variavel', () => {
  const r = preFlightDe(motorDe('cc'), {
    ...MAC,
    env: { PATH: '/usr/bin', HOME: '/Users/alguem' },   // sem USER
    existsImpl: disco('/usr/bin/claude'),
  });
  assert.equal(r.estado, 'mau');
  assert.deepEqual(r.env_em_falta, ['USER']);
  assert.match(r.porque, /USER/);
  assert.match(r.resolver, /USER/);
  assert.match(r.resolver, /chaveiro|conta/i, 'o gesto nao explica porque e que o USER importa');
});

test('com `USER` presente o cc deixa de estar bloqueado — mas nao passa a verde', () => {
  const r = preFlightDe(motorDe('cc'), {
    ...MAC,
    env: { PATH: '/usr/bin', HOME: '/Users/alguem', USER: 'alguem' },
    existsImpl: disco('/usr/bin/claude'),
  });
  assert.equal(r.estado, 'n/d', 'um pre-flight que nao gasta tokens nao pode dar verde');
  assert.deepEqual(r.env_em_falta, []);
});

test('binario em lado nenhum: bloqueia e DIZ quantos sitios procurou', () => {
  const r = preFlightDe(motorDe('codex'), {
    ...MAC, env: { PATH: '/usr/bin', HOME: '/h' }, existsImpl: () => false,
  });
  assert.equal(r.encontrado, false);
  assert.equal(r.estado, 'mau');
  assert.match(r.porque, /caminhos habituais/);
  assert.ok(r.procurados > 5);
});

test('encontrado fora do PATH e usavel — e a fonte fica visivel', () => {
  const r = preFlightDe(motorDe('codex'), {
    ...MAC,
    env: { PATH: '/usr/bin:/bin', HOME: '/Users/alguem' },
    existsImpl: disco('/Users/alguem/.local/bin/codex', '/Users/alguem/.codex/auth.json'),
  });
  assert.equal(r.encontrado, true);
  assert.equal(r.fonte, 'fora-do-PATH');
  assert.equal(r.estado, 'n/d');
});

test('o kimi sem MOONSHOT_API_KEY e um FACTO, nao um n/d', () => {
  const r = preFlightDe(motorDe('kimi'), {
    ...MAC, env: { PATH: '/usr/bin', HOME: '/h' }, existsImpl: () => false,
  });
  assert.equal(r.credencial.tem, false);
  assert.equal(r.estado, 'mau');
  assert.match(r.porque, /MOONSHOT_API_KEY/);
});

test('o moo nao se mede por binario nenhum — mede-se por responder', () => {
  const vivo = preFlightDe(motorDe('moo'), { ...MAC, motorLocalVivo: true });
  assert.equal(vivo.estado, 'bom');
  const morto = preFlightDe(motorDe('moo'), { ...MAC, motorLocalVivo: false });
  assert.equal(morto.estado, 'mau');
  assert.match(morto.resolver, /ollama serve/);
  const naoPerguntou = preFlightDe(motorDe('moo'), { ...MAC, motorLocalVivo: null });
  assert.equal(naoPerguntou.estado, 'n/d', 'nao perguntar nao pode virar "esta em baixo"');
});

test('nenhum caminho absoluto escapa para o payload — ele traz o nome do dono', () => {
  const r = preFlight({
    ...MAC,
    env: { PATH: '/Users/alguem/.local/bin', HOME: '/Users/alguem', USER: 'alguem' },
    existsImpl: () => true,
    motorLocalVivo: true,
  });
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes('/Users/alguem'), 'o payload leva um caminho com o nome do utilizador');
});

test('o campo diz DE QUE AMBIENTE fala — o F10 nao e quem lanca os motores pagos', () => {
  const r = preFlightDe(motorDe('cc'), {
    ...MAC, env: { PATH: '/usr/bin', HOME: '/h', USER: 'x' }, existsImpl: () => true,
  });
  assert.match(r.env_fonte, /conector/i,
    'um env_em_falta vazio aqui seria lido como promessa sobre o processo que faz o spawn');
});

test('`bloqueados` conta so os `mau` — nunca promete que os outros arrancam', () => {
  const r = preFlight({
    ...MAC, env: { PATH: '/usr/bin', HOME: '/h', USER: 'x' }, existsImpl: () => false, motorLocalVivo: null,
  });
  assert.deepEqual(r.bloqueados.sort(), ['cc', 'codex', 'gemini', 'kimi']);
  assert.equal(r.total, 5);
  assert.match(r.porque, /n\/d/);
});

test('`ENV_NECESSARIO.cc` inclui USER, e e por medicao — nao por precaucao', () => {
  assert.ok(ENV_NECESSARIO.cc.includes('USER'));
  const fonte = fs.readFileSync(path.join(AQUI, 'preflight-motores.mjs'), 'utf8');
  assert.match(fonte, /env -i PATH=\$PATH HOME=\$HOME USER=\$USER/,
    'a medicao que justifica a regra tem de estar no ficheiro, senao o proximo apaga-a');
});

test('o conector propaga USER e LOGNAME aos filhos', () => {
  const seamless = fs.readFileSync(path.join(REPO, 'packages', 'mooter-bridge', 'seamless.js'), 'utf8');
  const lista = seamless.slice(seamless.indexOf('CHILD_ENV_BASE_KEYS'), seamless.indexOf('CHILD_ENV_AGENT_KEYS'));
  assert.match(lista, /'USER', 'LOGNAME'/, 'sem USER o `claude` filho volta a dizer "Not logged in"');
});

test('cada motor com credencial declarada sabe onde ela vive', () => {
  for (const m of MOTORES) {
    const c = CREDENCIAL[m.id];
    assert.ok(c, `${m.id} sem entrada em CREDENCIAL`);
    if (m.id === 'moo') continue;
    assert.ok(c.env || c.ficheiro || c.chaveiro, `${m.id} nao diz onde procurar a credencial`);
  }
});
