/**
 * refutador.test.mjs — o portao da Onda 2b.
 *
 * O GATE do MP: **0 achados chegam a uma lane paga sem veredicto adversario
 * registado.** Tudo aqui existe para que essa frase nao passe por acidente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  VEREDICTO, CAMADA, LANES_PAGAS,
  provaDoAchado, acabaLimpa, refutarDeterminista, refutarAdversarial,
  guarda, podeDespachar, limparCache,
} from './refutador.mjs';

function repo(ficheiros) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refut-'));
  for (const [rel, texto] of Object.entries(ficheiros)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, texto);
  }
  limparCache();
  return dir;
}

const achado = (o) => ({ chave: 'k1', pilar: 'P4', janela: '1-70', ...o });

// ── a prova ─────────────────────────────────────────────────────────────────

test('le a linha PROOF, e devolve null quando nao ha', () => {
  assert.deepEqual(provaDoAchado('BROKEN: x PROOF: docs/a.md:42'), { ficheiro: 'docs/a.md', linha: 42 });
  assert.equal(provaDoAchado('BROKEN: sem prova nenhuma'), null);
  assert.equal(provaDoAchado(null), null);
});

test('acabaLimpa e conservador: no que nao sabe, nao julga', () => {
  assert.ok(acabaLimpa('uma frase completa.'));
  assert.ok(acabaLimpa('| celula de tabela |'));
  assert.ok(acabaLimpa('acaba numa palavra'));
  assert.equal(acabaLimpa(''), null, 'linha vazia nao refuta ninguem');
  assert.equal(acabaLimpa(null), null);
});

// ── CAMADA 1 · deterministica ───────────────────────────────────────────────

test('CAMADA 1 · linha que NAO EXISTE refuta qualquer afirmacao', () => {
  // 12 dos 62 achados do P4 caiam aqui — e a culpa era do `split('\n')` do pack
  // a inventar uma linha vazia no fim, nao do modelo.
  const r = repo({ 'docs/a.md': 'um\ndois\ntres\n' });
  const v = refutarDeterminista(
    achado({ ficheiro: 'docs/a.md', resultado_resumo: 'BROKEN: falta fechar PROOF: docs/a.md:4' }),
    { repoRoot: r },
  );
  assert.equal(v.veredicto, VEREDICTO.REFUTADO);
  assert.equal(v.camada, CAMADA.DETERMINISTA);
  assert.match(v.porque, /nao existe — o ficheiro tem 3 linhas/);
});

test('CAMADA 1 · "esta cortado" numa linha que acaba limpa e FALSO', () => {
  const r = repo({ 'docs/a.md': 'inicio\numa frase completa.\n' });
  const v = refutarDeterminista(
    achado({ ficheiro: 'docs/a.md', resultado_resumo: 'BROKEN: falta fechar o parentesis PROOF: docs/a.md:2' }),
    { repoRoot: r },
  );
  assert.equal(v.veredicto, VEREDICTO.REFUTADO);
  assert.match(v.porque, /afirma corte mas .* acaba em '\.'/);
});

test('CAMADA 1 · citacao FABRICADA e refutada — vale para todos os pilares', () => {
  // Uma prova bem-formada pode citar texto que nao esta la. E a unica maneira
  // de apanhar isso e ir ao ficheiro.
  const r = repo({ 'src/a.js': 'const a = 1;\nconst b = 2;\nconst c = 3;\n' });
  const v = refutarDeterminista(
    achado({
      pilar: 'P2', ficheiro: 'src/a.js',
      resultado_resumo: 'THEY DIVERGE: o codigo faz `const zzz = 999999;` PROOF: src/a.js:2',
    }),
    { repoRoot: r },
  );
  assert.equal(v.veredicto, VEREDICTO.REFUTADO);
  assert.match(v.porque, /nao aparece em src\/a\.js:2/);
});

test('CAMADA 1 · uma citacao que BATE nao e refutada', () => {
  const r = repo({ 'src/a.js': 'const a = 1;\nconst b = 2;\nconst c = 3;\n' });
  const v = refutarDeterminista(
    achado({ pilar: 'P2', ficheiro: 'src/a.js', resultado_resumo: 'diverge: `const b = 2;` PROOF: src/a.js:2' }),
    { repoRoot: r },
  );
  assert.equal(v.veredicto, VEREDICTO.INDECISO, 'a camada 1 nao aprova, so refuta ou passa adiante');
});

test('CAMADA 1 · sem PROOF legivel e INDECISO, nunca refutado por isso', () => {
  const r = repo({ 'docs/a.md': 'x\n' });
  const v = refutarDeterminista(achado({ ficheiro: 'docs/a.md', resultado_resumo: 'BROKEN: algo' }), { repoRoot: r });
  assert.equal(v.veredicto, VEREDICTO.INDECISO);
});

test('CAMADA 1 · ficheiro ilegivel nao vira refutacao', () => {
  const v = refutarDeterminista(
    achado({ ficheiro: 'nao/existe.md', resultado_resumo: 'BROKEN: x PROOF: nao/existe.md:1' }),
    { repoRoot: repo({}) },
  );
  assert.equal(v.veredicto, VEREDICTO.INDECISO, 'nao ler nao e prova de nada');
});

// ── CAMADA 2 · adversarial local, por reutilizacao ──────────────────────────

test('CAMADA 2 · sem revisor ligado devolve INDECISO e DIZ porque', () => {
  return refutarAdversarial(achado({ resultado_resumo: 'x' }), { reviewImpl: null }).then((v) => {
    assert.equal(v.veredicto, VEREDICTO.INDECISO);
    assert.match(v.porque, /sem revisor adversarial ligado/);
  });
});

test('CAMADA 2 · traduz o contrato de validation/adversarial', async () => {
  const refuta = async () => ({ verdict: 'refute', confidence: 0.8, rationale: 'a linha esta completa' });
  const confirma = async () => ({ verdict: 'confirm', confidence: 0.9, rationale: 'ok' });
  const incerto = async () => ({ verdict: 'uncertain', confidence: 0.5, rationale: '' });

  assert.equal((await refutarAdversarial(achado({}), { reviewImpl: refuta })).veredicto, VEREDICTO.REFUTADO);
  assert.equal((await refutarAdversarial(achado({}), { reviewImpl: confirma })).veredicto, VEREDICTO.SOBREVIVE);
  assert.equal((await refutarAdversarial(achado({}), { reviewImpl: incerto })).veredicto, VEREDICTO.INDECISO);
});

test('CAMADA 2 · um revisor que REBENTA nao vira aprovacao', async () => {
  const explode = async () => { throw new Error('ollama offline'); };
  const v = await refutarAdversarial(achado({}), { reviewImpl: explode });
  assert.equal(v.veredicto, VEREDICTO.INDECISO);
  assert.match(v.porque, /revisor falhou: ollama offline/);
});

// ── O PORTAO ────────────────────────────────────────────────────────────────

test('GATE · sem veredicto registado, a lane paga esta FECHADA', () => {
  for (const fonte of LANES_PAGAS) {
    assert.equal(podeDespachar(null, fonte).ok, false, `${fonte} tem de recusar sem registo`);
    assert.equal(podeDespachar({}, fonte).ok, false, `${fonte} tem de recusar registo sem veredicto`);
    assert.match(podeDespachar(null, fonte).porque, /fechada por omissao/);
  }
});

test('GATE · refutado NAO passa para lane paga', () => {
  const reg = { veredicto: VEREDICTO.REFUTADO, camada: CAMADA.DETERMINISTA, porque: 'a linha acaba em .' };
  for (const fonte of LANES_PAGAS) assert.equal(podeDespachar(reg, fonte).ok, false);
});

test('GATE · INDECISO tambem nao passa — fica no local, que custa zero', () => {
  const reg = { veredicto: VEREDICTO.INDECISO, camada: CAMADA.ADVERSARIAL, porque: 'incerto' };
  const r = podeDespachar(reg, 'subscription');
  assert.equal(r.ok, false);
  assert.match(r.porque, /fica no local/);
});

test('GATE · so o que SOBREVIVE passa', () => {
  const reg = { veredicto: VEREDICTO.SOBREVIVE, camada: CAMADA.ADVERSARIAL, porque: 'nao consegui refutar' };
  for (const fonte of LANES_PAGAS) assert.equal(podeDespachar(reg, fonte).ok, true);
});

test('GATE · lanes NAO pagas nao exigem veredicto (o portao e sobre custo)', () => {
  for (const fonte of ['local', 'haiku']) {
    const r = podeDespachar(null, fonte);
    assert.equal(r.ok, true);
    assert.match(r.porque, /nao e paga/);
  }
});

// ── o portao inteiro, ponta a ponta ─────────────────────────────────────────

test('guarda: camada 1 decide e a camada 2 NEM CHEGA A CORRER', async () => {
  const r = repo({ 'docs/a.md': 'uma frase completa.\n' });
  let chamou = false;
  const reg = await guarda(
    achado({ ficheiro: 'docs/a.md', resultado_resumo: 'BROKEN: falta fechar PROOF: docs/a.md:1' }),
    { repoRoot: r, reviewImpl: async () => { chamou = true; return { verdict: 'confirm' }; } },
  );
  assert.equal(reg.veredicto, VEREDICTO.REFUTADO);
  assert.equal(reg.camada, CAMADA.DETERMINISTA);
  assert.equal(chamou, false, 'gastar GPU no que ja se decidiu de graca e desperdicio');
  assert.equal(podeDespachar(reg, 'subscription').ok, false);
});

test('guarda: o que a camada 1 nao decide vai a camada 2', async () => {
  const r = repo({ 'src/a.js': 'const b = 2;\n' });
  const reg = await guarda(
    achado({ pilar: 'P2', ficheiro: 'src/a.js', resultado_resumo: 'diverge: `const b = 2;` PROOF: src/a.js:1' }),
    { repoRoot: r, reviewImpl: async () => ({ verdict: 'confirm', rationale: 'real' }) },
  );
  assert.equal(reg.veredicto, VEREDICTO.SOBREVIVE);
  assert.equal(reg.camada, CAMADA.ADVERSARIAL);
  assert.equal(podeDespachar(reg, 'subscription').ok, true);
});

test('guarda: dois "nao sei" nao se trocam um pelo outro — os dois motivos ficam', async () => {
  const r = repo({ 'src/a.js': 'const b = 2;\n' });
  const reg = await guarda(
    achado({ pilar: 'P2', ficheiro: 'src/a.js', resultado_resumo: 'diverge: `const b = 2;` PROOF: src/a.js:1' }),
    { repoRoot: r, reviewImpl: null },
  );
  assert.equal(reg.veredicto, VEREDICTO.INDECISO);
  assert.match(reg.porque, /camada adversarial/);
  assert.match(reg.porque, /sem revisor adversarial ligado/);
});

test('guarda: o registo E o recibo — leva chave, ficheiro, pilar e ts', async () => {
  const r = repo({ 'docs/a.md': 'x.\n' });
  const reg = await guarda(
    achado({ ficheiro: 'docs/a.md', resultado_resumo: 'BROKEN: y PROOF: docs/a.md:1' }),
    { repoRoot: r, agora: '2026-08-21T18:00:00Z' },
  );
  for (const c of ['chave', 'ficheiro', 'janela', 'pilar', 'veredicto', 'camada', 'porque', 'ts']) {
    assert.ok(c in reg, `o recibo tem de trazer '${c}'`);
  }
  assert.equal(reg.ts, '2026-08-21T18:00:00Z');
});

// ── critico ≠ autor (2026-08-21) ─────────────────────────────────────────────

test('DOUTRINA · o juiz RECUSA julgar quando e o mesmo modelo que o autor', async () => {
  // Medido: com critico == autor (qwen2.5-coder:14b nos dois lados), 3 lentes e
  // votacao, o juiz aceitou 1/4 afirmacoes VERDADEIRAS e rejeitou 2/2 falsas —
  // rejeita quase tudo, logo nao discrimina. N amostras do mesmo modelo
  // enviesado nao sao N opinioes independentes.
  let chamou = false;
  const v = await refutarAdversarial(
    achado({ modelo: 'qwen2.5-coder:14b' }),
    { reviewImpl: async () => { chamou = true; return { verdict: 'refute' }; }, modeloJuiz: 'qwen2.5-coder:14b' },
  );
  assert.equal(v.veredicto, VEREDICTO.INDECISO, 'um juiz que e o autor nao pode MATAR o achado');
  assert.match(v.porque, /critico == autor/);
  assert.equal(chamou, false, 'nem se gasta GPU a perguntar');
});

test('DOUTRINA · com modelo DIFERENTE o juiz corre normalmente', async () => {
  const v = await refutarAdversarial(
    achado({ modelo: 'qwen2.5-coder:14b' }),
    { reviewImpl: async () => ({ verdict: 'refute', rationale: 'x' }), modeloJuiz: 'gemma4:e4b' },
  );
  assert.equal(v.veredicto, VEREDICTO.REFUTADO);
});

test('DOUTRINA · sem modeloJuiz declarado nao se inventa uma coincidencia', async () => {
  const v = await refutarAdversarial(
    achado({ modelo: 'qwen2.5-coder:14b' }),
    { reviewImpl: async () => ({ verdict: 'confirm' }), modeloJuiz: null },
  );
  assert.equal(v.veredicto, VEREDICTO.SOBREVIVE, 'n/d nao e o mesmo que igual');
});

test('DOUTRINA · a recusa atravessa o portao inteiro', async () => {
  const r = repo({ 'src/a.js': 'const b = 2;\n' });
  const reg = await guarda(
    achado({ pilar: 'P2', ficheiro: 'src/a.js', modelo: 'qwen2.5-coder:14b',
      resultado_resumo: 'diverge: `const b = 2;` PROOF: src/a.js:1' }),
    { repoRoot: r, reviewImpl: async () => ({ verdict: 'confirm' }), modeloJuiz: 'qwen2.5-coder:14b' },
  );
  assert.equal(reg.veredicto, VEREDICTO.INDECISO);
  assert.equal(podeDespachar(reg, 'subscription').ok, false, 'e um indeciso nao paga lane paga');
});
