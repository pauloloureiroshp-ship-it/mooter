// render_medir.test.js
//
// ═════════════════════════════════════════════════════════════════════════════
// O CRITÉRIO DE ACEITAÇÃO, E PORQUE FOI SUBSTITUÍDO
//
// O F3 pedia: «o rascunho B do round 1 sai **fail** com os 4 critérios certos».
// Não existe rascunho B, não existe round 1, não existe duelo registado — busca
// exaustiva a 2026-09-01, citada no cabeçalho do `render_medir.js`. O critério
// original é inverificável.
//
// Mas «rascunho» tem neste repo um significado MEDIDO, e é ele que devolve o
// critério: no commit 865de8bc o runner pontuava `body.thinking` — o rascunho —
// em vez de `body.response`. **0% → 83%.** Logo o critério substituto é literal e
// falsificável:
//
//     UM RASCUNHO TEM DE SAIR `falha`, E PELO CRITÉRIO CERTO.
//
// «Pelo critério certo» é a parte que interessa. Um teste que planta um defeito
// e vê `nao-conforme` não prova que foi ESSE critério a disparar — o veredicto
// podia vir de outro lado. Por isso cada asserção aqui é sobre `bloqueiam` conter
// EXACTAMENTE o id esperado, e os outros três NÃO estarem lá.
// (memória do dono: «o controlo legítimo pode estar errado como o instrumento e
// concordar com ele».)
//
//   node --test tools/verify/render_medir.test.js

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rm = require('./render_medir.js');
const { renderMedir, ESTADO, VEREDICTO, CRITERIOS, EXIT } = rm;

// ── helpers ──────────────────────────────────────────────────────────────

/** Um resultado que passa os quatro critérios. Base de todas as mutações. */
function bom(over = {}) {
  return {
    chave: 'trabalho-1', ronda: 1, rascunho: 'A',
    autor: { agente: 'moo-local', modelo: 'qwen2.5-coder:14b' },
    juiz: { agente: 'codex', modelo: 'gpt-5-codex' },
    resposta: { response: 'o defeito está em alvo.js:3', thinking: '', eval_count: 42, esgotado: false },
    enunciado: {
      texto: 'revê este excerto',
      ficheirosPermitidos: ['alvo.js'],
      janela: { file: 'alvo.js', startLine: 1, endLine: 10 },
    },
    ...over,
  };
}

/** `verifyEvidence` injectado: devolve o veredicto que o teste quiser. */
const verifyFixo = (verdict, extra = {}) => () => ({ verdict, signal: `sinal:${verdict}`, ...extra });

const doCriterio = (r, id) => r.criterios.find((c) => c.id === id);

/**
 * A asserção que impede um verde (ou vermelho) por acidente: o critério `id`
 * está no estado esperado E é o ÚNICO a bloquear.
 */
function soEsteBloqueia(r, id) {
  assert.deepEqual(r.bloqueiam, [id],
    `esperava só ${id} a bloquear; bloqueiam=${JSON.stringify(r.bloqueiam)}`);
  for (const outro of CRITERIOS.filter((c) => c !== id)) {
    assert.notEqual(doCriterio(r, outro).estado, ESTADO.FALHA,
      `${outro} não devia estar em falha`);
  }
}

// ── forma do recibo ──────────────────────────────────────────────────────

test('o recibo traz SEMPRE os 4 critérios, sempre pela mesma ordem', async () => {
  // Um recibo com três seria indistinguível de um com o quarto esquecido.
  const r = await renderMedir(bom(), { verifyImpl: verifyFixo('citacao-ok') });
  assert.deepEqual(r.criterios.map((c) => c.id), [...CRITERIOS]);
  assert.equal(r.forma_ok, true);
  assert.equal(r.criterios.length, 4);
});

test('o caminho feliz é conforme — sem isto, todos os testes de falha são vácuos', async () => {
  const r = await renderMedir(bom(), { verifyImpl: verifyFixo('citacao-ok') });
  assert.equal(r.veredicto, VEREDICTO.CONFORME, JSON.stringify(r.criterios, null, 2));
  assert.deepEqual(r.bloqueiam, []);
  assert.deepEqual(r.nao_medidos, []);
  assert.equal(rm.exitDe(r), EXIT.CONFORME);
});

// ── C1 · o critério de aceitação substituto ──────────────────────────────

test('CRITÉRIO DE ACEITAÇÃO — um rascunho sai `falha`, e pelo critério certo', async () => {
  // Isto é o «rascunho B sai fail» do F3, reconstruído a partir do que é medido:
  // `response` vazio + `thinking` cheio é um modelo que gastou o orçamento a
  // pensar e nunca escreveu. Pontuá-lo dava 0% onde a resposta dava 83%.
  const rascunho = bom({
    rascunho: 'B',
    resposta: {
      response: '',
      thinking: 'Vou olhar para o ficheiro... talvez a linha 3... deixa ver...',
      eval_count: 700,
      esgotado: false,
    },
  });

  const r = await renderMedir(rascunho, { verifyImpl: verifyFixo('citacao-ok') });

  assert.equal(r.veredicto, VEREDICTO.NAO_CONFORME);
  soEsteBloqueia(r, 'resposta-nao-rascunho');
  assert.equal(doCriterio(r, 'resposta-nao-rascunho').medido, 0);
  assert.match(doCriterio(r, 'resposta-nao-rascunho').porque, /rascunho/i);
  assert.equal(rm.exitDe(r), EXIT.NAO_CONFORME);
});

test('C1 · uma resposta curta NÃO é um rascunho — o critério mede presença, não tamanho', async () => {
  // A distinção importa: o defeito do #450 não era «resposta curta», era
  // «resposta ausente com raciocínio presente». Confundi-los castigaria um
  // motor conciso.
  const r = await renderMedir(bom({
    resposta: { response: 'ok', thinking: '', eval_count: 2, esgotado: false },
  }), { verifyImpl: verifyFixo('citacao-ok') });
  assert.equal(doCriterio(r, 'resposta-nao-rascunho').estado, ESTADO.PASSA);
});

test('C1 · resposta E rascunho juntos: mede-se a resposta, e o recibo diz que ignorou o rascunho', async () => {
  const r = await renderMedir(bom({
    resposta: { response: 'achei em alvo.js:3', thinking: 'hmm, deixa ver', eval_count: 30, esgotado: false },
  }), { verifyImpl: verifyFixo('citacao-ok') });
  const c = doCriterio(r, 'resposta-nao-rascunho');
  assert.equal(c.estado, ESTADO.PASSA);
  assert.match(c.porque, /rascunho — ignorado/);
});

// ── C2 · a ronda correu ──────────────────────────────────────────────────

test('C2 · uma ronda que nunca chegou ao motor é `n/d`, NUNCA falha', async () => {
  // 209 de 275 `sem-citacao` (76%) eram isto. Castigar o motor por uma ronda
  // que não lhe foi entregue é a falácia que este critério existe para matar.
  const r = await renderMedir(bom({
    resposta: { response: '', thinking: '', eval_count: 0, esgotado: true },
  }), { verifyImpl: verifyFixo('citacao-ok') });

  const c = doCriterio(r, 'a-ronda-correu');
  assert.equal(c.estado, ESTADO.ND);
  assert.ok(!r.bloqueiam.includes('a-ronda-correu'), 'n/d não pode bloquear');
  assert.ok(r.nao_medidos.includes('a-ronda-correu'));
});

test('C2 · sem `eval_count` é n/d — ausência de prova não é prova de ausência', async () => {
  const r = await renderMedir(bom({
    resposta: { response: 'achei em alvo.js:3', thinking: '', esgotado: false },
  }), { verifyImpl: verifyFixo('citacao-ok') });
  assert.equal(doCriterio(r, 'a-ronda-correu').estado, ESTADO.ND);
});

// ── C3 · citação ancorada (composto) ─────────────────────────────────────

test('C3 · uma citação que a fonte desmente sai `falha`, e é a única a bloquear', async () => {
  const r = await renderMedir(bom(), { verifyImpl: verifyFixo('refutado') });
  assert.equal(r.veredicto, VEREDICTO.NAO_CONFORME);
  soEsteBloqueia(r, 'citacao-ancorada');
});

test('C3 · responder sem ancorar é `falha`, não `n/d` — houve resposta e ela não trouxe prova', async () => {
  const r = await renderMedir(bom(), { verifyImpl: verifyFixo('sem-citacao') });
  soEsteBloqueia(r, 'citacao-ancorada');
  assert.match(doCriterio(r, 'citacao-ancorada').porque, /não ancorou/);
});

test('C3 · «não encontrei nada» é n/d — um modelo honesto não pode ser castigado por o ser', async () => {
  const r = await renderMedir(bom(), { verifyImpl: verifyFixo('sem-achado') });
  const c = doCriterio(r, 'citacao-ancorada');
  assert.equal(c.estado, ESTADO.ND);
  assert.equal(r.veredicto, VEREDICTO.INDECISO);
  assert.deepEqual(r.bloqueiam, []);
});

test('C3 · sem enunciado não se mede — medir sem janela aceitaria sorte como prova', async () => {
  const r = await renderMedir(bom({ enunciado: null }), { verifyImpl: verifyFixo('citacao-ok') });
  const c = doCriterio(r, 'citacao-ancorada');
  assert.equal(c.estado, ESTADO.ND);
  assert.match(c.porque, /janela/);
});

test('C3 · o verificador é COMPOSTO, não reimplementado — recebe o que lhe é devido', async () => {
  // Se algum dia alguém reimplementar o parsing aqui dentro, este teste
  // continua verde e a segunda verdade nasce. Por isso assere-se o CONTRATO
  // da chamada: os quatro campos, com os valores da entrada.
  let visto = null;
  await renderMedir(bom(), {
    repoRoot: '/raiz/falsa',
    verifyImpl: (arg) => { visto = arg; return { verdict: 'citacao-ok' }; },
  });
  assert.equal(visto.repoRoot, '/raiz/falsa');
  assert.equal(visto.text, 'o defeito está em alvo.js:3');
  assert.deepEqual(visto.allowedFiles, ['alvo.js']);
  assert.deepEqual(visto.window, { file: 'alvo.js', startLine: 1, endLine: 10 });
});

test('C3 · um verificador que lança sai n/d, não verde — e o recibo diz porquê', async () => {
  const r = await renderMedir(bom(), {
    verifyImpl: () => { throw new Error('disco em chamas'); },
  });
  const c = doCriterio(r, 'citacao-ancorada');
  assert.equal(c.estado, ESTADO.ND);
  assert.match(c.porque, /disco em chamas/);
});

// ── C4 · o crítico não é o autor ─────────────────────────────────────────

test('C4 · o juiz ser o autor sai `falha` — auto-avaliação não é verificação', async () => {
  // 62 achados do P4 passaram TODOS com `citacao-ok`; 0 de 78 eram verdade.
  // Citar bem e mentir sobre a linha é um par que C1-C3 não apanham.
  const r = await renderMedir(bom({
    autor: { agente: 'moo-local', modelo: 'qwen2.5-coder:14b' },
    juiz: { agente: 'outro', modelo: 'qwen2.5-coder:14b' },
  }), { verifyImpl: verifyFixo('citacao-ok') });

  soEsteBloqueia(r, 'critico-nao-e-autor');
  assert.match(doCriterio(r, 'critico-nao-e-autor').porque, /mesmo modelo/);
});

test('C4 · o mesmo AGENTE também conta, mesmo com modelo diferente', async () => {
  const r = await renderMedir(bom({
    autor: { agente: 'claude-code', modelo: 'opus' },
    juiz: { agente: 'claude-code', modelo: 'sonnet' },
  }), { verifyImpl: verifyFixo('citacao-ok') });
  soEsteBloqueia(r, 'critico-nao-e-autor');
  assert.match(doCriterio(r, 'critico-nao-e-autor').porque, /mesmo agente/);
});

test('C4 · sem juiz é n/d — o recibo diz que não houve refutação em vez de fingir que houve', async () => {
  const r = await renderMedir(bom({ juiz: null }), { verifyImpl: verifyFixo('citacao-ok') });
  const c = doCriterio(r, 'critico-nao-e-autor');
  assert.equal(c.estado, ESTADO.ND);
  assert.equal(r.veredicto, VEREDICTO.INDECISO);
  assert.deepEqual(r.bloqueiam, []);
});

// ── conclusão: n/d ≠ falha, e uma falha ganha a um n/d ───────────────────

test('uma falha MEDIDA ganha a um n/d — não medir um critério não apaga outro que reprovou', async () => {
  const r = await renderMedir(bom({
    juiz: null,                                   // → n/d
    resposta: { response: '', thinking: 'só rascunho', eval_count: 700, esgotado: false }, // → falha
  }), { verifyImpl: verifyFixo('citacao-ok') });

  assert.equal(r.veredicto, VEREDICTO.NAO_CONFORME);
  assert.deepEqual(r.bloqueiam, ['resposta-nao-rascunho']);
  assert.deepEqual(r.nao_medidos, ['critico-nao-e-autor']);
});

test('só n/d nunca produz `nao-conforme` — não medir não é reprovar', async () => {
  const r = await renderMedir(bom({ juiz: null, enunciado: null }), {});
  assert.equal(r.veredicto, VEREDICTO.INDECISO);
  assert.deepEqual(r.bloqueiam, []);
  assert.equal(rm.exitDe(r), EXIT.INDECISO);
});

test('entrada inválida sai `indeciso`, nunca `nao-conforme` — o defeito é de quem chama', async () => {
  for (const mau of [null, {}, { resposta: {} }, { resposta: { response: 'x' } }]) {
    const r = await renderMedir(mau, {});
    assert.equal(r.veredicto, VEREDICTO.INDECISO, `entrada ${JSON.stringify(mau)}`);
    assert.equal(r.criterios.length, 4, 'mesmo inválida, o recibo traz os 4');
    assert.ok(r.entrada_porque, 'tem de dizer porquê');
  }
});

test('nunca lança, seja qual for a porcaria que receba', async () => {
  for (const lixo of [undefined, 0, 'texto', [], true, { autor: { agente: 'x' } }]) {
    await assert.doesNotReject(() => renderMedir(lixo, {}));
  }
});

// ── render: a metade que o dono lê ───────────────────────────────────────

test('imprimir mostra o que foi medido, o limiar e a prova — nunca um visto sem número', async () => {
  const r = await renderMedir(bom({
    resposta: { response: '', thinking: 'rascunho', eval_count: 700, esgotado: false },
  }), { verifyImpl: verifyFixo('citacao-ok') });
  const txt = rm.imprimir(r);

  assert.match(txt, /NAO-CONFORME/);
  assert.match(txt, /bloqueiam: resposta-nao-rascunho/);
  for (const id of CRITERIOS) assert.ok(txt.includes(id), `${id} tem de aparecer no ecrã`);
  assert.match(txt, /limiar:/, 'sem limiar, o número medido não se pode julgar');
});

test('imprimir explica que indeciso não é reprovado', async () => {
  const r = await renderMedir(bom({ juiz: null }), { verifyImpl: verifyFixo('citacao-ok') });
  assert.match(rm.imprimir(r), /indeciso ≠ reprovado/);
});

// ── integração real: o evidence-verifier a sério, sem injecção ───────────

test('INTEGRAÇÃO · sem injecção, compõe o evidence-verifier real e apanha uma citação fabricada', async () => {
  // O único teste que atravessa a fronteira CJS→ESM a sério. Se o `import()`
  // dinâmico partir (mudança de layout, ficheiro renomeado), este falha — e é
  // suposto: um C3 permanentemente `n/d` seria um critério desligado em silêncio.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-int-'));
  try {
    fs.writeFileSync(path.join(dir, 'alvo.js'), 'linha1\nlinha2\nlinha3\n');

    const fabricada = await renderMedir({
      chave: 'int', ronda: 1, rascunho: 'B',
      autor: { agente: 'moo', modelo: 'qwen' },
      juiz: { agente: 'codex', modelo: 'gpt-5' },
      resposta: { response: 'o defeito está em alvo.js:99999', thinking: '', eval_count: 12 },
      enunciado: { texto: 'x', ficheirosPermitidos: ['alvo.js'], janela: { file: 'alvo.js', startLine: 1, endLine: 3 } },
    }, { repoRoot: dir });

    const c = doCriterio(fabricada, 'citacao-ancorada');
    assert.notEqual(c.estado, ESTADO.ND,
      `o evidence-verifier real não foi carregado: ${c.porque}`);
    assert.equal(c.estado, ESTADO.FALHA, 'a linha 99999 não existe num ficheiro de 3 linhas');
    soEsteBloqueia(fabricada, 'citacao-ancorada');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }
});

test('INTEGRAÇÃO · uma citação verdadeira e dentro da janela passa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-int2-'));
  try {
    fs.writeFileSync(path.join(dir, 'alvo.js'), 'linha1\nlinha2\nlinha3\n');
    const r = await renderMedir({
      chave: 'int2', ronda: 1, rascunho: 'A',
      autor: { agente: 'moo', modelo: 'qwen' },
      juiz: { agente: 'codex', modelo: 'gpt-5' },
      resposta: { response: 'o defeito está em alvo.js:2', thinking: '', eval_count: 12 },
      enunciado: { texto: 'x', ficheirosPermitidos: ['alvo.js'], janela: { file: 'alvo.js', startLine: 1, endLine: 3 } },
    }, { repoRoot: dir });

    assert.equal(doCriterio(r, 'citacao-ancorada').estado, ESTADO.PASSA,
      JSON.stringify(doCriterio(r, 'citacao-ancorada'), null, 2));
    assert.equal(r.veredicto, VEREDICTO.CONFORME);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }
});
