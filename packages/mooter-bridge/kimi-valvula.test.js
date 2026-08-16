'use strict';

/**
 * A válvula tem sete vetos. Um teste por veto, mais os casos de fronteira —
 * porque uma decisão que muda para onde o dinheiro vai não pode ter um ramo
 * sem cobertura.
 *
 * ⚠️ Estes testes verificam a DECISÃO, isolada. Que ela chegue ao dispatch é
 * outra coisa, e está em `kimi-valvula-integrada.test.js`. A lição da frente
 * `contrato-sandbox`: testar o construtor da decisão e chamar-lhe cobertura do
 * enforcement foi o que deixou nove testes verdes com o contrato desligado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { valvulaKimi } = require('./kimi-valvula.js');

/** O caso em que a válvula ABRE. Cada teste parte daqui e estraga uma coisa. */
const ABRE = Object.freeze({
  ligada: true,
  motorExplicito: false,
  temChave: true,
  pressaoNivel: 'critico',
  tier: 'T2',
  escrita: false,
  categoria: 'outro',
  pedeLeitura: false,
  contextoInjectado: false,
});

test('V0 — o caso base abre, senão os outros testes não provam nada', () => {
  const r = valvulaKimi(ABRE);
  assert.equal(r.usar, true, 'o caso base tem de abrir: ' + r.porque);
  assert.match(r.porque, /critico/, 'o porquê nomeia a pressão que a abriu');
});

test('V0b — desligada por omissão: sem opt-in não abre, por muito crítica que a quota esteja', () => {
  // a quota não é isolável nos testes (quota.js lê os.homedir()), portanto ligar
  // isto por omissão faria suites de outras frentes mudar de resultado consoante
  // o consumo do dono nesse dia — a flakiness que a contrato-sandbox extinguiu
  const r = valvulaKimi({ ...ABRE, ligada: false });
  assert.equal(r.usar, false);
  assert.match(r.porque, /MOOTER_VALVULA_KIMI/, 'tem de dizer COMO se liga');
  assert.equal(valvulaKimi({ ...ABRE, ligada: undefined }).usar, false, 'ausente = desligada');
});

test('V1 — motor explícito fecha a válvula: a escolha do chamador é soberana', () => {
  const r = valvulaKimi({ ...ABRE, motorExplicito: true });
  assert.equal(r.usar, false);
  assert.match(r.porque, /escolhido por quem pediu/);
});

test('V2 — sem chave não se sugere um motor que não arranca', () => {
  const r = valvulaKimi({ ...ABRE, temChave: false });
  assert.equal(r.usar, false);
  assert.match(r.porque, /MOONSHOT_API_KEY/);
});

test('V3 — sem pressão de quota a válvula fica fechada', () => {
  // é o veto que impede trocar subscrição paga por USD reais sem razão
  for (const nivel of ['baixo', 'medio', 'desconhecido', undefined, '']) {
    const r = valvulaKimi({ ...ABRE, pressaoNivel: nivel });
    assert.equal(r.usar, false, 'abriu com pressão ' + JSON.stringify(nivel));
    assert.match(r.porque, /não está sob pressão/);
  }
});

test('V3b — abre em alto E em critico, e só nesses', () => {
  for (const nivel of ['alto', 'critico']) {
    assert.equal(valvulaKimi({ ...ABRE, pressaoNivel: nivel }).usar, true,
      'devia abrir em ' + nivel);
  }
});

test('V4 — T3 nunca é desviado por causa de quota', () => {
  const r = valvulaKimi({ ...ABRE, tier: 'T3' });
  assert.equal(r.usar, false);
  assert.match(r.porque, /alto risco/);
  // e os outros tiers continuam a poder abrir
  for (const t of ['T0', 'T1', 'T2']) {
    assert.equal(valvulaKimi({ ...ABRE, tier: t }).usar, true, 'fechou em ' + t);
  }
});

test('V5 — trabalho de escrita não vai para um motor sem ferramentas', () => {
  const r = valvulaKimi({ ...ABRE, escrita: true });
  assert.equal(r.usar, false);
  assert.match(r.porque, /escrever ficheiros/);
});

test('V6 — git_deploy e auditoria têm veto próprio', () => {
  for (const c of ['git_deploy', 'auditoria']) {
    const r = valvulaKimi({ ...ABRE, categoria: c });
    assert.equal(r.usar, false, 'não vetou ' + c);
    assert.match(r.porque, new RegExp(c));
  }
  assert.equal(valvulaKimi({ ...ABRE, categoria: 'outro' }).usar, true);
});

test('V7 — pede leitura sem contexto injectado: o contrato recusaria, logo não escolhemos', () => {
  const r = valvulaKimi({ ...ABRE, pedeLeitura: true, contextoInjectado: false });
  assert.equal(r.usar, false);
  assert.match(r.porque, /contrato de capacidade/);
});

test('V7b — pede leitura MAS o conector já injectou: pode ir', () => {
  const r = valvulaKimi({ ...ABRE, pedeLeitura: true, contextoInjectado: true });
  assert.equal(r.usar, true,
    'com o contexto injectado o kimi tem olhos, e travá-lo seria o falso positivo '
    + 'que o contrato de capacidade foi desenhado para não cometer');
});

test('V8 — a ordem dos vetos: devolve o PRIMEIRO motivo, não um qualquer', () => {
  // quem pediu explicitamente E não tem chave: a mensagem útil é a primeira,
  // porque a segunda seria um detalhe de configuração que não vem ao caso
  const r = valvulaKimi({ ...ABRE, motorExplicito: true, temChave: false, tier: 'T3' });
  assert.match(r.porque, /escolhido por quem pediu/,
    'a razão devolvida tem de ser a que o utilizador precisa de ler primeiro');
});

test('V9 — entrada vazia ou lixo fecha a válvula em vez de rebentar', () => {
  for (const entrada of [undefined, null, {}, { pressaoNivel: 'critico' }]) {
    const r = valvulaKimi(entrada);
    assert.equal(typeof r.usar, 'boolean', 'devolveu algo estranho para ' + JSON.stringify(entrada));
    assert.equal(r.usar, false, 'abriu com entrada incompleta: ' + JSON.stringify(entrada));
    assert.ok(r.porque && r.porque.length, 'fechou sem dizer porquê');
  }
});

test('V10 — o porquê é sempre uma frase legível, nunca um código', () => {
  const casos = [ABRE, { ...ABRE, motorExplicito: true }, { ...ABRE, tier: 'T3' },
    { ...ABRE, escrita: true }, { ...ABRE, temChave: false }];
  for (const c of casos) {
    const { porque } = valvulaKimi(c);
    assert.ok(porque.length > 20, 'razão curta demais para um recibo: ' + porque);
    assert.doesNotMatch(porque, /^[a-z_]+$/, 'devolveu um código em vez de uma frase');
  }
});
