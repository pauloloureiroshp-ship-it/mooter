/**
 * update-canal.test.js — o canal, o manifesto assinado, a troca e o rollback.
 *
 * Corre sem rede, sem disco vivo e sem tocar no `~/.mooter` de ninguem: o
 * `MOOTER_HOME` aponta para um temporario, e o `fetch` e injectado. A suite do
 * `packages/cli` ja apagou o `~/.mooter` vivo de quem a correu — duas vezes,
 * 2026-08-05 e 2026-08-20 — e essa licao vale para toda a gente que escreve
 * testes que sabem onde e a casa.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { lerCanal, CANAL_OMISSAO, canalDoProfileEstaProibido } = require('./entitlement.js');
const { verificarManifesto, assinarManifesto, comparaVersao, forma } = require('./manifesto.js');
const { trocar, reverter, caminhos, confereSha } = require('./payload-troca.js');
const { correr, urlDoManifesto } = require('./update-core.js');

// ── uma chave de release so para os testes ────────────────────────────────
// Gerada aqui, em memoria, a cada corrida. NUNCA se commita uma chave: uma
// chave de teste commitada e uma chave que alguem acaba por pregar no cliente.
const par = crypto.generateKeyPairSync('ed25519');
const PUB_B64 = par.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

function manifestoBase(extra = {}) {
  return Object.assign(
    {
      version: '1.54.0',
      url: 'https://github.com/x/y/releases/download/v1.54.0/mooter-cli.tar.gz',
      sha256: 'a'.repeat(64),
      channel: 'beta',
      released: '2026-09-10T12:00:00Z',
    },
    extra,
  );
}

/**
 * Corre `fn` num temporario e limpa-o a seguir — TAMBEM quando `fn` e async.
 * A primeira versao deste ajudante tinha `try/finally` sincrono: com uma `fn`
 * async, o `finally` corria assim que a promessa era CRIADA e apagava a pasta
 * debaixo do teste que ainda estava a correr. Dois testes E2E morriam com
 * ENOENT num ficheiro que o proprio teste tinha acabado de escrever.
 */
function comTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-w1-'));
  const limpa = () => fs.rmSync(dir, { recursive: true, force: true });
  let r;
  try {
    r = fn(dir);
  } catch (e) {
    limpa();
    throw e;
  }
  if (r && typeof r.then === 'function') {
    return r.then(
      (v) => { limpa(); return v; },
      (e) => { limpa(); throw e; },
    );
  }
  limpa();
  return r;
}

// ── 1. o canal vem do entitlement, e so de la ─────────────────────────────

test('sem entitlement o canal e stable, e diz que e por omissao', () => {
  comTmp((dir) => {
    const r = lerCanal({ env: { MOOTER_HOME: dir } });
    assert.equal(r.canal, CANAL_OMISSAO);
    assert.equal(r.fonte, 'omissao');
  });
});

test('com entitlement o canal vem de la, e a fonte diz quem o escreveu', () => {
  comTmp((dir) => {
    fs.writeFileSync(path.join(dir, 'entitlement.json'), JSON.stringify({ channel: 'beta' }));
    const r = lerCanal({ env: { MOOTER_HOME: dir } });
    assert.equal(r.canal, 'beta');
    assert.equal(r.fonte, 'entitlement');
  });
});

test('um canal desconhecido NAO passa — ele entra num caminho de URL', () => {
  comTmp((dir) => {
    fs.writeFileSync(path.join(dir, 'entitlement.json'), JSON.stringify({ channel: '../../etc' }));
    const r = lerCanal({ env: { MOOTER_HOME: dir } });
    assert.equal(r.canal, CANAL_OMISSAO);
    assert.equal(r.fonte, 'recusado');
    assert.match(r.porque, /desconhecido/);
  });
});

test('entitlement ilegivel ou sem `channel` cai em stable, nunca rebenta', () => {
  comTmp((dir) => {
    const f = path.join(dir, 'entitlement.json');
    fs.writeFileSync(f, '{ nao e json');
    assert.equal(lerCanal({ env: { MOOTER_HOME: dir } }).fonte, 'recusado');
    fs.writeFileSync(f, JSON.stringify({ plano: 'pro' }));
    const r = lerCanal({ env: { MOOTER_HOME: dir } });
    assert.equal(r.canal, CANAL_OMISSAO);
    assert.match(r.porque, /channel/);
  });
});

test('o profile.json esta proibido como fonte de canal, e o erro diz porque', () => {
  assert.throws(canalDoProfileEstaProibido, /auto-declarado/);
});

// ── 2. o manifesto ────────────────────────────────────────────────────────

test('sem ancora nao ha update — falha FECHADA, nao aviso', () => {
  comTmp((dir) => {
    const m = assinarManifesto(manifestoBase(), par.privateKey);
    const r = verificarManifesto(m, {
      canalPedido: 'beta',
      caminho: path.join(dir, 'nao-existe.json'),
    });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'sem-ancora');
  });
});

test('assinatura valida + canal certo -> ok, e diz que ha versao nova', () => {
  const m = assinarManifesto(manifestoBase(), par.privateKey);
  const r = verificarManifesto(m, { canalPedido: 'beta', pubB64: PUB_B64, versaoInstalada: '1.53.1' });
  assert.equal(r.ok, true);
  assert.equal(r.codigo, 'nova');
  assert.equal(r.maisRecente, true);
});

test('MEXER EM QUALQUER CAMPO COBERTO INVALIDA a assinatura', () => {
  for (const campo of ['version', 'url', 'sha256', 'channel', 'released']) {
    const m = assinarManifesto(manifestoBase(), par.privateKey);
    // Um valor diferente mas ainda bem-formado: o teste tem de morrer na
    // assinatura, nao na validacao de forma.
    m[campo] =
      campo === 'sha256' ? 'b'.repeat(64)
      : campo === 'version' ? '9.9.9'
      : campo === 'url' ? 'https://mau.example/x.tar.gz'
      : campo === 'channel' ? 'stable'
      : '2020-01-01T00:00:00Z';
    const r = verificarManifesto(m, { canalPedido: m.channel, pubB64: PUB_B64 });
    assert.equal(r.ok, false, `${campo} alterado passou na assinatura`);
    assert.ok(
      ['assinatura-invalida', 'canal-trocado'].includes(r.codigo),
      `${campo}: codigo inesperado ${r.codigo}`,
    );
  }
});

test('assinado por OUTRA chave nao passa', () => {
  const outro = crypto.generateKeyPairSync('ed25519');
  const m = assinarManifesto(manifestoBase(), outro.privateKey);
  const r = verificarManifesto(m, { canalPedido: 'beta', pubB64: PUB_B64 });
  assert.equal(r.codigo, 'assinatura-invalida');
});

test('rebaixamento de canal: manifesto beta AUTENTICO servido a quem pediu stable', () => {
  // O atacante nao forja nada. So serve o ficheiro errado. Sem o `channel`
  // dentro da assinatura E comparado com o pedido, isto passava.
  const m = assinarManifesto(manifestoBase({ channel: 'beta' }), par.privateKey);
  const r = verificarManifesto(m, { canalPedido: 'stable', pubB64: PUB_B64 });
  assert.equal(r.codigo, 'canal-trocado');
});

test('manifesto sem assinatura, ou com algoritmo desconhecido, nao passa', () => {
  const cru = manifestoBase();
  assert.equal(verificarManifesto(cru, { canalPedido: 'beta', pubB64: PUB_B64 }).codigo, 'nao-assinado');
  const falso = Object.assign({}, cru, { sig: { alg: 'nenhum', mac: 'ab' } });
  assert.equal(verificarManifesto(falso, { canalPedido: 'beta', pubB64: PUB_B64 }).codigo, 'alg-desconhecido');
});

test('a forma e verificada antes da assinatura, e `http://` e recusado', () => {
  assert.match(forma(manifestoBase({ url: 'http://mooter.ai/x.tar.gz' })), /https/);
  assert.match(forma(manifestoBase({ sha256: 'curto' })), /sha256/);
  assert.match(forma(manifestoBase({ version: 'v1.54' })), /semver/);
  assert.equal(forma(manifestoBase()), null);
});

test('comparaVersao ordena semver e poe nao-semver por baixo', () => {
  assert.ok(comparaVersao('1.54.0', '1.53.1') > 0);
  assert.ok(comparaVersao('1.53.1', '1.53.1') === 0);
  assert.ok(comparaVersao('1.9.0', '1.10.0') < 0);
  assert.ok(comparaVersao('lixo', '1.0.0') < 0);
});

test('a mesma versao instalada devolve `ja-tens`, nao um update inutil', () => {
  const m = assinarManifesto(manifestoBase({ version: '1.53.1' }), par.privateKey);
  const r = verificarManifesto(m, { canalPedido: 'beta', pubB64: PUB_B64, versaoInstalada: '1.53.1' });
  assert.equal(r.ok, true);
  assert.equal(r.codigo, 'ja-tens');
  assert.equal(r.maisRecente, false);
});

// ── 3. troca atomica e rollback (estado B14) ──────────────────────────────

function montaPayload(dir, nome, conteudo) {
  const p = path.join(dir, nome);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'marca.txt'), conteudo);
  return p;
}

test('trocar move o actual para cli.prev e o candidato para cli', () => {
  comTmp((dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    montaPayload(dir, 'cli', 'velho');
    montaPayload(dir, 'cli.next', 'novo');
    const r = trocar(o);
    assert.equal(r.ok, true);
    const c = caminhos(o);
    assert.equal(fs.readFileSync(path.join(c.actual, 'marca.txt'), 'utf8'), 'novo');
    assert.equal(fs.readFileSync(path.join(c.anterior, 'marca.txt'), 'utf8'), 'velho');
  });
});

test('reverter volta ao anterior — e nao ATIRA FORA o que se descartou', () => {
  comTmp((dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    montaPayload(dir, 'cli', 'velho');
    montaPayload(dir, 'cli.next', 'novo');
    trocar(o);
    const r = reverter(o);
    assert.equal(r.ok, true);
    const c = caminhos(o);
    assert.equal(fs.readFileSync(path.join(c.actual, 'marca.txt'), 'utf8'), 'velho');
    // apagar e a unica operacao sem rollback: o descartado fica em cli.next
    assert.equal(fs.readFileSync(path.join(c.proximo, 'marca.txt'), 'utf8'), 'novo');
  });
});

test('sem cli.prev, reverter recusa e diz porque — nao finge que reverteu', () => {
  comTmp((dir) => {
    const r = reverter({ env: { MOOTER_HOME: dir } });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'sem-anterior');
  });
});

test('sha diferente PARA A TROCA ANTES de mexer no payload vivo', () => {
  comTmp((dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    montaPayload(dir, 'cli', 'velho');
    montaPayload(dir, 'cli.next', 'novo');
    const art = path.join(dir, 'baixado.tar.gz');
    fs.writeFileSync(art, 'conteudo que nao bate');
    const r = trocar(Object.assign({}, o, { sha256Esperado: 'c'.repeat(64), candidato: art }));
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'sha-diferente');
    // o vivo continua vivo e intacto
    assert.equal(fs.readFileSync(path.join(caminhos(o).actual, 'marca.txt'), 'utf8'), 'velho');
  });
});

test('confereSha aceita o hash certo', () => {
  comTmp((dir) => {
    const art = path.join(dir, 'a.bin');
    fs.writeFileSync(art, 'abc');
    const esperado = crypto.createHash('sha256').update('abc').digest('hex');
    assert.equal(confereSha(art, esperado).ok, true);
  });
});

test('uma troca falhada nao deixa a maquina SEM payload nenhum', () => {
  comTmp((dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    montaPayload(dir, 'cli', 'velho');
    montaPayload(dir, 'cli.next', 'novo');
    // segundo rename rebenta: e a janela em que `cli` nao existe
    let n = 0;
    const fsFalso = Object.assign(Object.create(fs), {
      renameSync: (a, b) => {
        n += 1;
        if (n === 2) throw new Error('disco cheio');
        return fs.renameSync(a, b);
      },
    });
    const r = trocar(Object.assign({}, o, { fsImpl: fsFalso }));
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'falha-a-trocar');
    assert.equal(fs.readFileSync(path.join(caminhos(o).actual, 'marca.txt'), 'utf8'), 'velho');
  });
});

// ── 4. fim-a-fim: release falso no canal beta ─────────────────────────────

function fetchFalso(manifesto, o = {}) {
  return async () => {
    if (o.rebenta) throw new Error('getaddrinfo ENOTFOUND');
    return { ok: o.status ? o.status < 400 : true, status: o.status || 200, json: async () => manifesto };
  };
}

test('E2E · release falso em beta -> --check ve a versao nova e NAO escreve', async () => {
  await comTmp(async (dir) => {
    fs.writeFileSync(path.join(dir, 'entitlement.json'), JSON.stringify({ channel: 'beta' }));
    const m = assinarManifesto(manifestoBase(), par.privateKey);
    const r = await correr({
      env: { MOOTER_HOME: dir },
      pubB64: PUB_B64,
      fetchImpl: fetchFalso(m),
      versaoInstalada: '1.53.1',
      aplicar: false,
    });
    assert.equal(r.ok, true);
    assert.equal(r.codigo, 'ha-nova');
    assert.equal(r.canal, 'beta');
    assert.equal(fs.existsSync(path.join(dir, 'cli.next')), false, '--check escreveu no disco');
  });
});

test('E2E · assinatura invalida -> nao troca nada (B14)', async () => {
  await comTmp(async (dir) => {
    fs.writeFileSync(path.join(dir, 'entitlement.json'), JSON.stringify({ channel: 'beta' }));
    const m = assinarManifesto(manifestoBase(), par.privateKey);
    m.version = '9.9.9'; // depois de assinado
    montaPayload(dir, 'cli', 'velho');
    const r = await correr({
      env: { MOOTER_HOME: dir },
      pubB64: PUB_B64,
      fetchImpl: fetchFalso(m),
      versaoInstalada: '1.53.1',
      aplicar: true,
      descarregarImpl: async () => {
        throw new Error('nunca deve chegar aqui');
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'assinatura-invalida');
    assert.equal(fs.readFileSync(path.join(dir, 'cli', 'marca.txt'), 'utf8'), 'velho');
  });
});

test('E2E · sem rede diz «sem rede», nao um stack trace (B2)', async () => {
  await comTmp(async (dir) => {
    const r = await correr({
      env: { MOOTER_HOME: dir },
      pubB64: PUB_B64,
      fetchImpl: fetchFalso(null, { rebenta: true }),
      versaoInstalada: '1.53.1',
    });
    assert.equal(r.codigo, 'sem-rede');
    assert.match(r.porque, /Sem rede/);
    assert.doesNotMatch(r.porque, /ENOTFOUND/);
  });
});

test('E2E · a origem a responder 404 nao e «sem rede»', async () => {
  await comTmp(async (dir) => {
    const r = await correr({
      env: { MOOTER_HOME: dir },
      pubB64: PUB_B64,
      fetchImpl: fetchFalso(null, { status: 404 }),
      versaoInstalada: '1.53.1',
    });
    assert.equal(r.codigo, 'origem-recusou');
  });
});

test('E2E · aplicar sem descarregador recusa em vez de trocar as cegas', async () => {
  await comTmp(async (dir) => {
    fs.writeFileSync(path.join(dir, 'entitlement.json'), JSON.stringify({ channel: 'beta' }));
    const m = assinarManifesto(manifestoBase(), par.privateKey);
    const r = await correr({
      env: { MOOTER_HOME: dir },
      pubB64: PUB_B64,
      fetchImpl: fetchFalso(m),
      versaoInstalada: '1.53.1',
      aplicar: true,
    });
    assert.equal(r.codigo, 'sem-descarregador');
  });
});

test('E2E · rollback forcado depois de uma troca boa devolve o payload velho', async () => {
  await comTmp(async (dir) => {
    fs.writeFileSync(path.join(dir, 'entitlement.json'), JSON.stringify({ channel: 'beta' }));
    montaPayload(dir, 'cli', 'v1.53.1');
    const art = path.join(dir, 'payload.tar.gz');
    fs.writeFileSync(art, 'artefacto');
    const sha = crypto.createHash('sha256').update('artefacto').digest('hex');
    const m = assinarManifesto(manifestoBase({ sha256: sha }), par.privateKey);
    const o = { env: { MOOTER_HOME: dir } };

    const r = await correr(
      Object.assign({}, o, {
        pubB64: PUB_B64,
        fetchImpl: fetchFalso(m),
        versaoInstalada: '1.53.1',
        aplicar: true,
        descarregarImpl: async (_url, destino) => {
          montaPayload(dir, path.basename(destino), 'v1.54.0');
          return art;
        },
      }),
    );
    assert.equal(r.ok, true, r.porque);
    assert.equal(r.codigo, 'actualizado');
    assert.equal(fs.readFileSync(path.join(dir, 'cli', 'marca.txt'), 'utf8'), 'v1.54.0');

    const back = reverter(o);
    assert.equal(back.ok, true);
    assert.equal(fs.readFileSync(path.join(dir, 'cli', 'marca.txt'), 'utf8'), 'v1.53.1');
  });
});

test('o URL do manifesto e o do canal, com o canal escapado', () => {
  assert.equal(urlDoManifesto('beta'), 'https://mooter.ai/release/beta/manifest.json');
  assert.equal(urlDoManifesto('friends-beta'), 'https://mooter.ai/release/friends-beta/manifest.json');
});

// ── 5. o cliente nao traz chave inventada ─────────────────────────────────

test('o repo NAO commita uma chave de release — a ancora tem de estar ausente', () => {
  const { FICHEIRO_ANCORA } = require('./manifesto.js');
  assert.equal(
    fs.existsSync(FICHEIRO_ANCORA),
    false,
    'release-pubkey.json existe no repo: uma chave de release commitada e uma chave que nao vale nada',
  );
});
