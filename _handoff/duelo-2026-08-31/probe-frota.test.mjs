// probe-frota.test.mjs — os testes que mordem.
//
// Cada bloco aqui existe por causa de um defeito concreto, não por cobertura.
// A regra da casa (memória do dono, `guarda sem teste de mordida não é guarda`):
// um teste que só confirma o caminho feliz passa verde num probe partido.
//
//   node --test _handoff/duelo-2026-08-31/probe-frota.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sondar, retrato, rotas, despachavel,
  SONDAVEIS, SEM_SONDA, NAO_REFUTAM,
} from './probe-frota.mjs';

// ── helpers ──────────────────────────────────────────────────────────────────

const vivo  = (porque = 'pong') => ({ pong: true,  at: '2026-08-31T10:00:00Z', porque });
const morto = (porque = 'sem resposta') => ({ pong: false, at: '2026-08-31T10:00:00Z', porque });

/** quota-honesta devolve isto; aqui montamos à mão só o que o retrato lê. */
const q = (pct, fonte = 'cc-statusline-stdin') => ({
  quota_remaining_pct: pct,
  quota_fonte: pct == null ? null : fonte,
  quota_porque: pct == null ? 'sem fonte oficial — n/d' : `fonte ${fonte}`,
});

function montar({ health = {}, quota = {}, memoria = {}, cooldown = [] } = {}) {
  return retrato({ health, quota, memoria, cooldown });
}

// ── SONDA ────────────────────────────────────────────────────────────────────

test('sonda: adaptador que lança vira pong:false com a razão — não rebenta o probe', async () => {
  const health = await sondar({
    agoraIso: '2026-08-31T10:00:00Z',
    adaptadores: {
      ollama:   { isAvailable: async () => ({ available: true }) },
      codex:    { isAvailable: async () => { throw new Error('ENOENT codex.cmd'); } },
      deepseek: { isAvailable: async () => ({ available: false, reason: 'sem chave' }) },
      // openai propositadamente ausente
    },
  });

  assert.equal(health.ollama.pong, true);
  assert.equal(health.codex.pong, false);
  assert.match(health.codex.porque, /ENOENT/);
  assert.equal(health.deepseek.pong, false);
  assert.match(health.deepseek.porque, /sem chave/);
  assert.equal(health.openai.pong, false);
  assert.match(health.openai.porque, /adaptador ausente/);
});

test('sonda: cobre todo o roster sondável — um motor novo não pode nascer invisível', async () => {
  const health = await sondar({ agoraIso: 'x', adaptadores: {} });
  for (const m of SONDAVEIS) {
    assert.ok(Object.hasOwn(health, m.key), `${m.key} ausente do health`);
  }
});

// ── RETRATO ──────────────────────────────────────────────────────────────────

test('retrato: memória "ok" NÃO promove a vivo sem pong desta janela', () => {
  // A mordida: um registo ok de ontem não prova nada sobre agora. Se isto
  // falhar, o probe declara vivo um motor que ninguém sondou.
  const m = montar({ health: {}, memoria: { codex: 'ok' } });
  assert.equal(m.codex.saude, null, 'saúde devia ser n/d, não vivo');
  assert.equal(m.codex.degradado, false);
});

test('retrato: memória degradada marca cooldown com o porquê e o tempo', () => {
  const m = montar({
    health: { codex: vivo() },
    memoria: { codex: 'exhausted' },
    cooldown: [{ provider: 'codex', porque: 'quota atingida', restaMin: 42 }],
  });
  assert.equal(m.codex.degradado, true);
  assert.match(m.codex.degradado_porque, /exhausted/);
  assert.match(m.codex.degradado_porque, /42min/);
});

test('retrato: motor sem sonda fica n/d, nunca morto — ausência não é negação', () => {
  const m = montar({});
  for (const key of Object.keys(SEM_SONDA)) {
    if (key === 'claude') continue;
    assert.equal(m[key].saude, null, `${key} devia ser n/d`);
    assert.notEqual(m[key].saude, 'sem-resposta');
  }
  assert.equal(m.claude.saude, 'vivo', 'claude é este processo');
});

test('despachavel: n/d NÃO bloqueia, sem-resposta bloqueia, cooldown bloqueia', () => {
  const m = montar({
    health: { ollama: morto('tags error'), codex: vivo() },
    memoria: { codex: 'exhausted' },
    cooldown: [{ provider: 'codex', porque: 'quota', restaMin: 10 }],
  });
  assert.equal(despachavel(m.ollama).pode, false);
  assert.equal(despachavel(m.codex).pode, false, 'cooldown tem de bloquear');
  assert.equal(despachavel(m.gemini).pode, true, 'n/d não é avaria');
});

// ── LEITURA ──────────────────────────────────────────────────────────────────

test('leitura: ollama vivo ganha e NÃO declara fallback', () => {
  const r = rotas(montar({ health: { ollama: vivo() } }));
  assert.equal(r.leitura.motor, 'ollama');
  assert.equal(r.leitura.fallback_de, null);
  assert.equal(r.leitura.bloqueada, false);
});

test('leitura: ollama morto → cai para o seguinte E declara fallback_de (F1)', () => {
  // Este é o critério de aceitação da F1: matar um engine tem de produzir
  // `fallback_de` no recibo. Fallback silencioso é o defeito, não a feature.
  const r = rotas(montar({ health: { ollama: morto('ollama down'), deepseek: vivo() } }));
  assert.equal(r.leitura.motor, 'deepseek');
  assert.equal(r.leitura.fallback_de, 'ollama');
  assert.match(r.leitura.porque, /ollama down/);
});

test('leitura: todos mortos → BLOQUEADA, sem inventar motor', () => {
  const health = {};
  for (const m of SONDAVEIS) health[m.key] = morto();
  // claude é 'vivo' por construção e está na ORDEM_LEITURA, por isso para
  // provar o bloqueio é preciso degradá-lo também — o que só a memória faz.
  const r = rotas(montar({ health, memoria: { claude: 'exhausted' } }));
  assert.equal(r.leitura.bloqueada, true);
  assert.equal(r.leitura.motor, null);
});

// ── CÓDIGO + GIT ─────────────────────────────────────────────────────────────

test('codigo_git: é sempre claude-code, mesmo com a frota toda viva', () => {
  const health = {};
  for (const m of SONDAVEIS) health[m.key] = vivo();
  const r = rotas(montar({ health }));
  assert.equal(r.codigo_git.motor, 'claude-code');
  assert.equal(r.codigo_git.bloqueada, false);
});

// ── REFUTAÇÃO — a etapa onde um bug custa uma conclusão errada ────────────────

test('refutacao: NUNCA escolhe o autor', () => {
  // A mordida central. Se isto falhar, o sistema "refuta-se" a si próprio e
  // devolve concordância disfarçada de veredicto.
  const health = {};
  for (const m of SONDAVEIS) health[m.key] = vivo();
  const r = rotas(montar({ health }), { autor: 'codex' });
  assert.notEqual(r.refutacao.motor, 'codex');
  assert.ok(r.refutacao.motor, 'devia ter encontrado outro adversário');
});

test('refutacao: recusa quem a medição desqualificou (gpt-oss 2/13, moos locais)', () => {
  const health = {};
  for (const m of SONDAVEIS) health[m.key] = vivo();
  const r = rotas(montar({ health }), { autor: 'claude' });
  assert.notEqual(r.refutacao.motor, 'ollama');
  assert.ok(Object.hasOwn(NAO_REFUTAM, 'ollama'));
  assert.ok(Object.hasOwn(NAO_REFUTAM, 'gpt-oss:20b'));
});

test('refutacao: sem adversário elegível → "refutação pendente" e bloqueada', () => {
  const health = {};
  for (const m of SONDAVEIS) health[m.key] = morto();
  const r = rotas(montar({ health, memoria: { gemini: 'exhausted', kimi: 'exhausted' } }), { autor: 'claude' });
  assert.equal(r.refutacao.bloqueada, true);
  assert.equal(r.refutacao.motor, null);
  assert.match(r.refutacao.porque, /refutação pendente/i);
});

test('refutacao: lista os recusados com motivo — o recibo tem de poder explicar-se', () => {
  const health = {};
  for (const m of SONDAVEIS) health[m.key] = morto('offline');
  const r = rotas(montar({ health, memoria: { gemini: 'exhausted', kimi: 'exhausted' } }), { autor: 'claude' });
  assert.match(r.refutacao.porque, /codex/);
  assert.match(r.refutacao.porque, /offline|exhausted/);
});

// ── PESQUISA WEB — a regra do MP à letra, mas nunca em silêncio ───────────────

test('pesquisa_web: escolhe a quota mais folgada entre as MEDIDAS', () => {
  const health = { ollama: vivo(), codex: vivo(), openai: vivo() };
  const r = rotas(montar({ health, quota: { openai: q(80), ollama: q(20) } }));
  assert.equal(r.pesquisa_web.motor, 'openai');
  assert.match(r.pesquisa_web.porque, /80%/);
});

test('pesquisa_web: n/d é excluído — mas registado como excluido_por_nd, não como esgotado', () => {
  // A contradição declarada no cabeçalho do probe. A regra do MP aplica-se,
  // e o custo dela fica visível em vez de virar um silêncio.
  const health = { codex: vivo(), openai: vivo() };
  const r = rotas(montar({ health, quota: { openai: q(50), codex: q(null) } }));
  assert.equal(r.pesquisa_web.motor, 'openai');
  assert.ok(r.pesquisa_web.excluido_por_nd.some((s) => s.startsWith('codex')));
  assert.deepEqual(r.pesquisa_web.esgotado_medido, []);
});

test('pesquisa_web: TODOS n/d → BLOQUEADA, e não o mais barato por defeito', () => {
  // O caso degenerado que acontece HOJE: sem quota-live fresco, ninguém tem
  // número. Escolher ollama aqui porque é grátis seria o «viés do default
  // barato» — o erro que a memória do dono nomeia.
  const health = { ollama: vivo(), codex: vivo() };
  const r = rotas(montar({ health, quota: {} }));
  assert.equal(r.pesquisa_web.bloqueada, true);
  assert.equal(r.pesquisa_web.motor, null, 'não pode inventar vencedor');
  assert.match(r.pesquisa_web.porque, /n\/d/);
});

test('pesquisa_web: 0% medido é esgotamento MEDIDO, distinto de n/d', () => {
  const health = { openai: vivo() };
  const r = rotas(montar({ health, quota: { openai: q(0) } }));
  assert.equal(r.pesquisa_web.bloqueada, true);
  assert.ok(r.pesquisa_web.esgotado_medido.length > 0);
  assert.match(r.pesquisa_web.porque, /MEDIDO/);
});

test('pesquisa_web: motor em cooldown não conta, mesmo com quota alta', () => {
  const health = { openai: vivo(), codex: vivo() };
  const r = rotas(montar({
    health,
    quota: { openai: q(99), codex: q(10) },
    memoria: { openai: 'exhausted' },
    cooldown: [{ provider: 'openai', porque: 'limite semanal', restaMin: 300 }],
  }));
  assert.notEqual(r.pesquisa_web.motor, 'openai', 'cooldown tem de ganhar à quota');
  assert.equal(r.pesquisa_web.motor, 'codex');
});
