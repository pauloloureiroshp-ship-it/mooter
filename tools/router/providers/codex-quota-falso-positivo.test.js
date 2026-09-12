'use strict';

/**
 * O detector de quota lia a resposta E o eco do prompt.
 *
 * `codex exec` imprime um cabeçalho no stderr que inclui a linha `user` seguida
 * do prompt inteiro. `looksLikeQuotaExhaustion` varria esse blob, por isso
 * QUALQUER pedido que contivesse "quota", "rate limit", "usage limit", "5 hour"
 * ou "weekly limit" era descartado como quota esgotada — com saída 0, stdout
 * correcto e a resposta deitada fora.
 *
 * Medido a 2026-09-03 com dois despachos reais que diferem numa palavra:
 *   «Responde exactamente com a palavra: banana» → ok:true
 *   «Responde exactamente com a palavra: quota»  → no_output (quota_exhausted)
 *
 * Um router cujo assunto é governação de custo não conseguia ser interrogado
 * sobre governação de custo.
 *
 * A regra que fica: exaustão de quota é um ERRO, e o CLI reporta erros com
 * saída não-zero. Numa corrida bem sucedida não se infere exaustão do conteúdo.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const cp = require('node:child_process');

const PROVIDER = path.join(__dirname, 'codex-cli.js');

/** Carrega o provider com um spawnSync trocado. */
function comSpawn(fake, fn) {
  const real = cp.spawnSync;
  cp.spawnSync = fake;
  try { delete require.cache[require.resolve(PROVIDER)]; } catch { /* */ }
  try {
    return fn(require(PROVIDER));
  } finally {
    cp.spawnSync = real;
    try { delete require.cache[require.resolve(PROVIDER)]; } catch { /* */ }
  }
}

// O cabeçalho que o `codex exec` escreve mesmo, incluindo o eco do prompt.
function stderrComEco(prompt) {
  return [
    'OpenAI Codex v0.144.1',
    '--------',
    'workdir: C:\\Users\\alguem\\repo',
    'model: gpt-5.6-sol',
    'sandbox: read-only',
    '--------',
    'user',
    prompt,
    '',
  ].join('\n');
}

test('um prompt sobre quotas não é confundido com quota esgotada', () => {
  const prompt = 'Responde exactamente com a palavra: quota';
  const res = comSpawn(
    () => ({ status: 0, stdout: 'quota\n', stderr: stderrComEco(prompt), error: null, signal: null }),
    (mod) => {
      const diag = {};
      return { out: mod.callCodex(prompt, { diag, timeoutMs: 5000 }), diag };
    }
  );
  assert.ok(res.out, `saida 0 com stdout tem de devolver resposta, nao ${JSON.stringify(res.diag)}`);
  assert.equal(res.out.ok, true);
  assert.equal(res.out.text, 'quota');
});

test('as outras palavras-gatilho no eco do prompt também não derrubam a resposta', () => {
  for (const palavra of ['rate limit', 'usage limit', 'weekly limit', '5 hour']) {
    const prompt = `Explica o que é um ${palavra} num router de LLMs.`;
    const res = comSpawn(
      () => ({ status: 0, stdout: 'É um tecto.\n', stderr: stderrComEco(prompt), error: null, signal: null }),
      (mod) => mod.callCodex(prompt, { timeoutMs: 5000 })
    );
    assert.ok(res, `"${palavra}" no prompt não pode anular uma corrida bem sucedida`);
    assert.equal(res.text, 'É um tecto.');
  }
});

test('a exaustão a sério — saída não-zero — continua a ser detectada', () => {
  const res = comSpawn(
    () => ({ status: 1, stdout: '', stderr: "You've hit your usage limit. Try again later.", error: null, signal: null }),
    (mod) => {
      const diag = {};
      return { out: mod.callCodex('qualquer coisa', { diag, timeoutMs: 5000 }), diag };
    }
  );
  assert.equal(res.out, null, 'exaustão real tem de falhar');
  assert.equal(res.diag.reason, 'quota_exhausted', `razão errada: ${JSON.stringify(res.diag)}`);
});

test('uma saída não-zero sem sinal de quota não é rotulada como quota', () => {
  const res = comSpawn(
    () => ({ status: 2, stdout: '', stderr: 'some other failure', error: null, signal: null }),
    (mod) => {
      const diag = {};
      return { out: mod.callCodex('qualquer coisa', { diag, timeoutMs: 5000 }), diag };
    }
  );
  assert.equal(res.out, null);
  assert.notEqual(res.diag.reason, 'quota_exhausted', 'não inventar exaustão onde não há sinal');
});
