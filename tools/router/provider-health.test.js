// TESTES DE MORDIDA — a escada de fallback tem de saltar o que já se sabe morto.
//
// Cada teste PLANTA o defeito e exige que o portão o apanhe. O ficheiro que
// testam nasceu de quatro falhas reais numa sessão de 2026-08-28, e o teste mais
// importante daqui (`A ARMADILHA DO KIMI`) planta a string literal que causou o
// diagnóstico errado nesse dia.
//
// O último bloco não testa o módulo isoladamente: chama o
// `resolveFallbackChain` REAL de `router-execute.js` com o estado que este
// módulo produz. Sem isso, provava-se que o ficheiro se comporta bem consigo
// próprio e não que a escada passa a ver — que era exactamente o defeito
// original (uma escada correcta, alimentada por `{}` para sempre).

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const os       = require('node:os');
const path     = require('node:path');

const ph = require('./provider-health.js');
// `resolveFallbackChain` vive em `_internal` — e e de proposito que o teste o
// va buscar la em vez de o reimplementar: um duplo do comportamento provaria
// que este modulo concorda consigo proprio, nao que a escada real passa a ver.
const { resolveFallbackChain } = require('./router-execute.js')._internal;

/** HOME hermético por teste — o estado real do dono nunca entra aqui. */
function homeLimpo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'moo-ph-'));
}
function limpar(h) {
  try { fs.rmSync(h, { recursive: true, force: true }); } catch { /* best-effort */ }
}

const HORA = 60 * 60 * 1000;

// ── A taxonomia, contra as mensagens REAIS ──────────────────────────────────

test('MORDIDA · A ARMADILHA DO KIMI: "or Permission denied" não pode virar auth_failed', () => {
  // A mensagem literal que a API da Moonshot devolveu a 2026-08-28 para um id
  // de modelo extinto. Contém "Permission denied". Se `auth_failed` for testado
  // primeiro, um id errado é para sempre diagnosticado como problema de chave —
  // e foi isso que aconteceu, custando a sessão.
  const msg = 'Not found the model kimi-k2-0905-preview or Permission denied';
  assert.equal(ph.classificarFalha(msg), 'model_not_found');
  assert.notEqual(ph.classificarFalha(msg), 'auth_failed');
});

test('MORDIDA INVERSA · uma falha de auth a sério continua a ser auth_failed', () => {
  // Sem isto, «arranjar» a armadilha acima podia ter desligado a detecção de
  // autenticação por completo.
  assert.equal(ph.classificarFalha('invalid api key', { status: 401 }), 'auth_failed');
  assert.equal(ph.classificarFalha('unauthorized'), 'auth_failed');
});

test('as outras três falhas reais desta sessão classificam-se', () => {
  assert.equal(
    ph.classificarFalha("You've hit your weekly limit · resets 10pm (America/Sao_Paulo)"),
    'quota_exhausted');
  assert.equal(
    ph.classificarFalha('IneligibleTierError: your plan is not eligible'),
    'tier_ineligible');
  assert.equal(ph.classificarFalha('fetch failed: ECONNREFUSED'), 'network');
});

test('429 sem sinal de saldo é ritmo, não quota', () => {
  // A distinção importa porque as políticas de recuperação são de outra ordem
  // de grandeza: 1 minuto contra 1 hora.
  assert.equal(ph.classificarFalha('too many requests', { status: 429 }), 'rate_limited');
  assert.equal(ph.CAUSAS.rate_limited.recuperaEmMs, 60 * 1000);
  assert.equal(ph.CAUSAS.quota_exhausted.recuperaEmMs, HORA);
});

test('a hora de reposição é lida da mensagem quando lá está', () => {
  const agora = Date.parse('2026-08-28T13:00:00Z');
  const ms = ph.lerReposicao('resets 10pm', agora);
  assert.ok(ms > agora, 'a reposição tem de ficar no futuro');
  assert.equal(new Date(ms).getHours(), 22);
  // E `retry-after` em segundos.
  assert.equal(ph.lerReposicao('retry-after: 120', agora), agora + 120000);
  // Sem nada de fiável, null — para o chamador usar a política da causa.
  assert.equal(ph.lerReposicao('boom', agora), null);
});

// ── O ciclo de vida do registo ──────────────────────────────────────────────

test('MORDIDA · sem registo nenhum, um fornecedor NÃO aparece degradado', () => {
  // A decisão 2 do cabeçalho. Se o default fosse «morto», uma máquina fresca
  // não roteava para lado nenhum — um defeito muito pior do que a amnésia.
  const h = homeLimpo();
  try {
    assert.deepEqual(ph.estadoActual({ home: h }), {});
  } finally { limpar(h); }
});

test('MORDIDA · o estado DECAI — a memória não pode virar lápide', () => {
  const h = homeLimpo();
  try {
    const t0 = Date.parse('2026-08-28T10:00:00Z');
    ph.registar('codex_cli', 'fail', {
      home: h, agoraMs: t0,
      erro: new Error("You've hit your weekly limit"),
    });
    // Imediatamente a seguir: degradado.
    assert.equal(ph.estadoActual({ home: h, agoraMs: t0 + 1000 }).codex_cli, 'exhausted');
    // Uma hora e um minuto depois (a política de `quota_exhausted`): vivo outra vez,
    // sem ninguém ter corrido tarefa de limpeza nenhuma.
    const depois = ph.estadoActual({ home: h, agoraMs: t0 + HORA + 60000 });
    assert.equal(depois.codex_cli, 'ok', 'um fornecedor esgotado tem de voltar sozinho');
  } finally { limpar(h); }
});

test('MORDIDA · um sucesso limpa a degradação na hora', () => {
  const h = homeLimpo();
  try {
    const t0 = Date.parse('2026-08-28T10:00:00Z');
    ph.registar('ollama', 'fail', { home: h, agoraMs: t0, erro: new Error('ECONNREFUSED') });
    assert.equal(ph.estadoActual({ home: h, agoraMs: t0 + 1000 }).ollama, 'down');
    // Se respondeu, está vivo — o registo anterior deixou de descrever a realidade.
    ph.registar('ollama', 'ok', { home: h, agoraMs: t0 + 2000 });
    assert.equal(ph.estadoActual({ home: h, agoraMs: t0 + 3000 }).ollama, 'ok');
  } finally { limpar(h); }
});

test('o `empty_completion` pode ser declarado — não vem em mensagem nenhuma', () => {
  // O caso do kimi-k2.6: HTTP 200, `content: ""`, `reasoning_tokens: 1399`.
  // Não há erro para classificar; só o adaptador sabe que aquilo veio vazio.
  const h = homeLimpo();
  try {
    const t0 = Date.parse('2026-08-28T10:00:00Z');
    const r = ph.registar('kimi', 'fail', {
      home: h, agoraMs: t0, causa: 'empty_completion',
      detalhe: 'HTTP 200, content vazio, reasoning_tokens 1399, max_tokens 1400',
    });
    assert.equal(r.causa, 'empty_completion');
    assert.equal(ph.estadoActual({ home: h, agoraMs: t0 + 1000 }).kimi, 'degraded');
  } finally { limpar(h); }
});

test('nunca lança, mesmo com o ficheiro corrompido', () => {
  const h = homeLimpo();
  try {
    const p = ph.healthPath(h);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'isto nao e json {{{');
    assert.doesNotThrow(() => ph.estadoActual({ home: h }));
    assert.deepEqual(ph.estadoActual({ home: h }), {});
    // E consegue voltar a escrever por cima do lixo.
    assert.doesNotThrow(() => ph.registar('ollama', 'ok', { home: h }));
    assert.equal(ph.estadoActual({ home: h }).ollama, 'ok');
  } finally { limpar(h); }
});

test('o relatório diz o quê, porquê e até quando', () => {
  const h = homeLimpo();
  try {
    const t0 = Date.parse('2026-08-28T10:00:00Z');
    ph.registar('gemini', 'fail', { home: h, agoraMs: t0, erro: new Error('IneligibleTierError') });
    const [l] = ph.relatorio({ home: h, agoraMs: t0 + 1000 });
    assert.equal(l.provider, 'gemini');
    assert.equal(l.causa, 'tier_ineligible');
    assert.match(l.porque, /plano\/tier/);
    assert.ok(l.restaMin > 6 * 24 * 60, 'tier_ineligible dura dias, não minutos');
  } finally { limpar(h); }
});

// ── A GUARDA CONTRA A PRÓPRIA SUITE ────────────────────────────────────────
//
// Estes dois testes existem porque este módulo, na PRIMEIRA vez que correu
// ligado ao executor, corrompeu o estado real do dono: `router-execute.test.js`
// exercita o caminho de falha com wrappers que devolvem `null` de propósito, e
// cada `npm test` gravava essas falhas simuladas em
// `~/.mooter/provider-health.json`. A sessão seguinte acordava a achar que o
// Codex e o Ollama estavam degradados. Uma suite de testes a degradar os
// motores de produção.
//
// É a terceira ocorrência desta armadilha no repositório (ver a memória do dono,
// `npm test do CLI apagava o ~/.mooter`, 05/08 e 20/08).

test('MORDIDA · sob um corredor de testes, NÃO se toca no estado real', () => {
  // `node --test` põe NODE_TEST_CONTEXT, portanto estes testes JÁ correm com a
  // guarda activa — e é isso que se afirma aqui.
  assert.ok(ph.emTeste(), 'NODE_TEST_CONTEXT devia estar presente sob node --test');
  assert.equal(ph.podeTocar(), false, 'sem home explícito, em teste, é proibido');

  // E a prova a sério: escrever sem `home` não pode criar nem alterar nada.
  const real = ph.healthPath();
  const antes = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null;
  ph.registar('codex_cli', 'fail', { erro: new Error("You've hit your weekly limit") });
  const depois = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null;
  assert.equal(depois, antes, 'a suite escreveu no ~/.mooter real');

  // E ler também devolve vazio, para que um teste nunca herde o histórico do dono.
  assert.deepEqual(ph.estadoActual(), {});
});

test('MORDIDA INVERSA · com home explícito a escrita FUNCIONA, mesmo em teste', () => {
  // Sem isto, «arranjar» a poluição podia ter desligado a persistência por
  // completo — e o módulo inteiro deixaria de servir para alguma coisa.
  const h = homeLimpo();
  try {
    assert.equal(ph.podeTocar(h), true);
    ph.registar('codex_cli', 'fail', { home: h, erro: new Error('ECONNREFUSED') });
    assert.equal(ph.estadoActual({ home: h }).codex_cli, 'down');
    assert.ok(fs.existsSync(ph.healthPath(h)), 'o ficheiro hermético tem de ser escrito');
  } finally { limpar(h); }
});

// ── E A MORDIDA QUE INTERESSA: a escada REAL passa a ver ────────────────────

test('MORDIDA INTEGRADA · o resolveFallbackChain REAL salta o que este módulo marcou', () => {
  const h = homeLimpo();
  try {
    const t0 = Date.parse('2026-08-28T10:00:00Z');
    const classificacao = { tier: 'T1', suggested_providers: ['codex_cli', 'ollama'] };

    // Antes: nada registado → a escada mantém os dois.
    assert.deepEqual(
      resolveFallbackChain(classificacao, ph.estadoActual({ home: h, agoraMs: t0 })),
      ['codex_cli', 'ollama']);

    // Planta a falha real do Codex.
    ph.registar('codex_cli', 'fail', {
      home: h, agoraMs: t0, erro: new Error("You've hit your weekly limit"),
    });

    // Depois: a escada deixa de o oferecer. ESTE é o comportamento que não
    // existia — o estado chegava sempre `{}` e o codex era retentado para sempre.
    const chain = resolveFallbackChain(
      classificacao, ph.estadoActual({ home: h, agoraMs: t0 + 1000 }));
    assert.ok(!chain.includes('codex_cli'), 'a escada continuou a oferecer um motor esgotado');
    assert.deepEqual(chain, ['ollama']);

    // E quando a quota repõe, volta — sem intervenção.
    const depois = resolveFallbackChain(
      classificacao, ph.estadoActual({ home: h, agoraMs: t0 + HORA + 60000 }));
    assert.deepEqual(depois, ['codex_cli', 'ollama']);
  } finally { limpar(h); }
});
