import test from 'node:test';
import assert from 'node:assert/strict';

import { carregarCorpus, avaliar, soRegex, RAIZ } from './nucleo.mjs';
import { derivarGabarito } from './gabarito.mjs';

const corpus = carregarCorpus();

/** Texto que um candidato PERFEITO teria devolvido. */
function comoTexto(valor) {
  return typeof valor === 'object' && valor !== null ? JSON.stringify(valor) : String(valor);
}

test('a rubrica de dificuldade esta declarada e toda tarefa cai nela', () => {
  assert.ok(corpus.rubrica?.niveis, 'corpus sem rubrica');
  const niveis = Object.keys(corpus.rubrica.niveis);
  assert.ok(niveis.length >= 3, `rubrica com so ${niveis.length} niveis`);
  for (const t of corpus.tarefas) assert.ok(niveis.includes(t.dificuldade), `${t.id}: ${t.dificuldade} fora da rubrica`);
});

test('a rubrica cobre-se toda: nenhum nivel declarado fica sem tarefa', () => {
  const usados = new Set(corpus.tarefas.map((t) => t.dificuldade));
  for (const n of Object.keys(corpus.rubrica.niveis)) {
    assert.ok(usados.has(n), `nivel ${n} declarado mas sem nenhuma tarefa — rubrica decorativa`);
  }
});

test('todo gabarito se re-deriva da fonte declarada e passa a propria verificacao', () => {
  for (const t of corpus.tarefas) {
    const g = derivarGabarito(t, RAIZ);
    const r = avaliar(t.verificacao, comoTexto(g.valor));
    assert.equal(
      r.sucesso, true,
      `${t.id}: a resposta de referencia (${comoTexto(g.valor).slice(0, 40)}, de ${g.origem}) NAO passa a propria verificacao — ${r.motivo}`,
    );
  }
});

test('toda verificacao so-regex RECUSA os seus contra-exemplos', () => {
  const soRegexTarefas = corpus.tarefas.filter((t) => soRegex(t.verificacao));
  assert.ok(soRegexTarefas.length >= 1, 'nenhuma tarefa so-regex — este teste ficaria vazio sem se notar');
  for (const t of soRegexTarefas) {
    assert.ok(t.contra_exemplos?.length, `${t.id}: sem contra_exemplos`);
    for (const mau of t.contra_exemplos) {
      assert.notEqual(
        avaliar(t.verificacao, mau).sucesso, true,
        `${t.id}: a verificacao ACEITA a resposta errada "${mau}" — provar que a certa passa nao chega`,
      );
    }
  }
});

test('a entrada do gabarito esta presa ao prompt: mudar o enunciado quebra o teste', () => {
  for (const t of corpus.tarefas) {
    const f = t.gabarito_fonte;
    if (f.tipo !== 'computado') continue;
    const ancoras = f.entrada_no_prompt ?? (typeof f.entrada === 'string' ? [f.entrada] : null);
    assert.ok(ancoras, `${t.id}: entrada nao-string sem 'entrada_no_prompt' — nada prende o gabarito ao enunciado`);
    for (const a of ancoras) {
      assert.ok(t.prompt.includes(a), `${t.id}: o prompt nao contem a ancora "${a}" — o enunciado mudou e o gabarito nao`);
    }
  }
});

test('gabaritos vindos de ficheiro continuam a casar com o repo vivo, e o prompt cita a linha real', () => {
  const doRepo = corpus.tarefas.filter((t) => t.gabarito_fonte.tipo === 'ficheiro');
  assert.ok(doRepo.length >= 1, 'nenhuma tarefa ancorada no repo — o corpus deixa de apodrecer em voz alta');
  for (const t of doRepo) {
    const g = derivarGabarito(t, RAIZ);
    assert.ok(
      t.prompt.includes(g.linha.trim()),
      `${t.id}: o prompt nao contem a linha viva "${g.linha.trim()}" de ${t.gabarito_fonte.caminho}`,
    );
    assert.equal(String(g.valor), String(t.verificacao.esperado), `${t.id}: o repo mudou — gabarito apodreceu`);
  }
});

test('uma verificacao que nao aceita a propria resposta de referencia e apanhada', () => {
  const tarefaMa = {
    id: 'sintetica',
    verificacao: { tipo: 'resposta-exata', esperado: 'errado' },
    gabarito_fonte: { tipo: 'computado', fn: 'paraSnake', entrada: 'currentUserName' },
  };
  const g = derivarGabarito(tarefaMa, RAIZ);
  assert.equal(avaliar(tarefaMa.verificacao, comoTexto(g.valor)).sucesso, false);
});

test('categoria e tier nao estao confundidos no corpus pregado', () => {
  const tiersPorCat = new Map();
  const catsPorTier = new Map();
  for (const t of corpus.tarefas) {
    (tiersPorCat.get(t.categoria) ?? tiersPorCat.set(t.categoria, new Set()).get(t.categoria)).add(t.tier);
    (catsPorTier.get(t.tier) ?? catsPorTier.set(t.tier, new Set()).get(t.tier)).add(t.categoria);
  }
  assert.ok([...tiersPorCat.values()].some((s) => s.size >= 2), 'nenhuma categoria abrange >=2 tiers');
  assert.ok([...catsPorTier.values()].some((s) => s.size >= 2), 'nenhum tier contem >=2 categorias');
});
