/**
 * mooter-vs-sem.test.mjs — o instrumento que produz os números públicos.
 *
 * PORQUE EXISTE, e porque só existe agora.
 *
 * O harness A/B correu a 2026-09-01, produziu os números que foram para uma
 * página pública e para uma release, e **não tinha teste nenhum**. Um portão
 * adversarial de pré-merge apanhou quatro defeitos nele — dois de método, dois
 * de honestidade — e as correcções baixaram todos os números anunciados:
 *
 *   84,3% → 81,7%   (10 amostras co-autoradas com o `classify.js` saíram)
 *   +36 pts → +12   (o adversário passou a receber as convenções do repo)
 *   «só o nosso é reprodutível» → retirado (a variância era a nossa
 *                                           `temperature: 0.2` por omissão)
 *
 * Nenhuma dessas correcções tem guarda. Como estão, qualquer uma pode ser
 * desfeita por acidente — e a peça pública volta a dizer 84,3% sem ninguém dar
 * por isso. É isso que este ficheiro impede.
 *
 * A REGRA DE DESENHO: cada teste ancora numa AFIRMAÇÃO PÚBLICA, não numa linha
 * de código. Se um teste não conseguir nomear o número que protege, não vale a
 * pena escrevê-lo — e um teste que passa por vacuidade (asserção sobre lista
 * vazia que ficou vazia por não ter lido nada) é pior do que não existir.
 *
 * HERMÉTICO: nenhum teste toca na rede. O braço do LLM recebe sempre um
 * `callImpl` falso; os braços determinísticos correm contra o `classify.js`
 * real, que é local, congelado e verificado por sha no CI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  holdout, bracoMooter, bracoSemRouter, bracoLlm,
  contabilizar, custoEquivalente, imprimir, correr, correrVarias, mcnemar,
} from './mooter-vs-sem.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const FONTE = fs.readFileSync(path.join(AQUI, 'mooter-vs-sem.mjs'), 'utf8');

/** Uma amostra sintética. `co` marca-a como co-autorada com o classificador. */
const am = (id, esperado, prompt, co = false) =>
  ({ id, expected_tier: esperado, prompt, coautorada: co });

/** Um juiz falso que devolve sempre o mesmo rótulo, e guarda como foi chamado. */
function juizFixo(tier, { tokensIn = 10, tokensOut = 2 } = {}) {
  const chamadas = [];
  const impl = async (prompt, opts) => {
    chamadas.push({ prompt, opts });
    return { text: tier, tokensIn, tokensOut };
  };
  impl.chamadas = chamadas;
  return impl;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1 · O CORTE LIMPO — a correcção que levou 84,3% a 81,7%
// ═══════════════════════════════════════════════════════════════════════════

test('holdout(): marca como co-autorada exactamente quem tem confidence_source de revisão', () => {
  const h = holdout();
  assert.ok(h.length > 0, 'holdout vazio não mediu nada');

  const v = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'router', 'validation-set.json'), 'utf8'));
  // A verdade vem da FONTE, não de um número cravado aqui. Um controlo escrito à
  // mão pode estar errado como o instrumento e concordar com ele.
  const esperadas = ['canonical', 'adversarial', 'historical']
    .flatMap((sec) => (v[sec] || []).map((a) => a.confidence_source || ''))
    .filter((c) => /^mooter_review/.test(c)).length;

  const marcadas = h.filter((a) => a.coautorada).length;
  assert.equal(marcadas, esperadas,
    'a marca tem de bater com o que o validation-set.json declara, não com um número cravado');
  assert.ok(marcadas > 0,
    'se isto der zero, ou o dataset mudou ou a marcação partiu — em qualquer dos casos, o ' +
    'número público de 81,7% deixou de ser reproduzível e alguém tem de olhar');
});

test('a marca sobrevive aos TRÊS braços — foi aqui que ela morreu uma vez', () => {
  // Defeito real, medido a 2026-09-01: `holdout()` marcava, mas os braços
  // construíam as suas `linhas` sem copiar o campo. Resultado: `precisao_limpa`
  // saía IGUAL a `precisao_total` e o corte limpo não existia — silenciosamente.
  const a = [am('x-01', 'T3', 'redesenha a arquitectura do vault', true),
             am('x-02', 'T0', 'muda a cor do botão', false)];

  for (const [nome, r] of [
    ['mooter', bracoMooter(a)],
    ['sem router', bracoSemRouter(a)],
  ]) {
    assert.deepEqual(r.linhas.map((l) => l.coautorada), [true, false],
      `o braço ${nome} perdeu a marca — o corte limpo deixa de existir e ninguém repara`);
  }
});

test('a marca sobrevive ao braço do LLM', async () => {
  const a = [am('x-01', 'T3', 'faz deploy', true), am('x-02', 'T0', 'renomeia', false)];
  const r = await bracoLlm(a, { modelo: 'falso', callImpl: juizFixo('T3') });
  assert.deepEqual(r.linhas.map((l) => l.coautorada), [true, false]);
});

test('contabilizar(): a precisão limpa exclui as co-autoradas, e as duas são publicadas', () => {
  const linhas = [
    { id: 'a', esperado: 'T0', obtido: 'T0', ms: 1, coautorada: true },   // certa, suja
    { id: 'b', esperado: 'T0', obtido: 'T0', ms: 1, coautorada: true },   // certa, suja
    { id: 'c', esperado: 'T0', obtido: 'T0', ms: 1, coautorada: false },  // certa, limpa
    { id: 'd', esperado: 'T3', obtido: 'T0', ms: 1, coautorada: false },  // errada, limpa
  ];
  const c = contabilizar({ braco: 'x', linhas });

  assert.equal(c.precisao_total, 3 / 4, 'a nota com o gabarito sujo');
  assert.equal(c.precisao_limpa, 1 / 2, 'a nota que se publica');
  assert.equal(c.n_limpas, 2);
  assert.equal(c.n_coautoradas, 2);
  assert.equal(c.certas_coautoradas, 2,
    'quantas acertou nas contaminadas — é este número que denuncia o favorecimento');
  assert.ok(c.precisao_limpa < c.precisao_total,
    'neste caso construído a suja favorece, tal como favorecia na medição real (10/10)');
});

// ═══════════════════════════════════════════════════════════════════════════
// 1b · DERIVA ≠ PRECISÃO — a correcção que matou a «fraqueza historical 68%»
// ═══════════════════════════════════════════════════════════════════════════

test('holdout(): carrega o `trust` que o próprio dataset declara', () => {
  const h = holdout();
  const v = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'router', 'validation-set.json'), 'utf8'));

  // A verdade vem da fonte. O `_description` do ficheiro é explícito: canonical
  // e adversarial são ground truth; historical é «assumed-correct baseline for
  // drift detection» — rotulada pela saída do PRÓPRIO classificador.
  const esperado = {};
  for (const sec of ['canonical', 'adversarial', 'historical']) {
    for (const a of v[sec] || []) esperado[a.trust] = (esperado[a.trust] || 0) + 1;
  }
  const obtido = {};
  for (const a of h) obtido[a.trust] = (obtido[a.trust] || 0) + 1;
  assert.deepEqual(obtido, esperado, 'o trust tem de sobreviver do dataset até à amostra');
  assert.ok((obtido.ground_truth || 0) > 0 && (obtido.assumed_correct || 0) > 0,
    'se um dos dois desaparecer, a separação deixa de ter o que separar');
});

test('a precisão publicada NÃO inclui rótulos que o classificador escreveu', () => {
  // Foi assim que nasceu a «fraqueza historical 68%»: 25 amostras cujo
  // `expected_tier` É a saída do classify.js foram metidas na média com o
  // ground truth. Comparar o classificador consigo mesmo não mede precisão —
  // mede se ele mudou de ideias, que é útil e é outra coisa.
  const c = contabilizar({ braco: 'x', linhas: [
    { id: 'a', esperado: 'T0', obtido: 'T0', ms: 1, trust: 'ground_truth' },
    { id: 'b', esperado: 'T3', obtido: 'T0', ms: 1, trust: 'ground_truth' },
    // as três de deriva estão TODAS certas — se entrassem na média, subiam-na
    { id: 'c', esperado: 'T0', obtido: 'T0', ms: 1, trust: 'assumed_correct' },
    { id: 'd', esperado: 'T1', obtido: 'T1', ms: 1, trust: 'assumed_correct' },
    { id: 'e', esperado: 'T2', obtido: 'T2', ms: 1, trust: 'assumed_correct' },
  ] });

  assert.equal(c.n_ground_truth, 2, 'só as duas de ground truth contam para a precisão');
  assert.equal(c.precisao_ground_truth, 1 / 2);
  assert.notEqual(c.precisao_ground_truth, c.precisao_total,
    'construí este caso para que misturar mudasse o número — se forem iguais, não separou');
  assert.equal(c.deriva_n, 3);
  assert.equal(c.deriva_concordancia, 1, 'a deriva reporta-se à parte, e aqui é total');
});

test('a deriva declara quantas amostras guardam um PREVIEW em vez do prompt', () => {
  // `inject_context.js:1017` grava `prompt_preview: prompt.slice(0, 80)` — o
  // campo diz no nome que é um preview. Quem construiu a secção historical usou
  // esse campo como se fosse o prompt. Medido a 2026-09-01: nas truncadas o
  // Mooter faz 2/10; nas inteiras, 15/15. A «fraqueza» era isto.
  const c = contabilizar({ braco: 'x', linhas: [
    { id: 'a', esperado: 'T0', obtido: 'T0', ms: 1, trust: 'assumed_correct', preview_truncado: true },
    { id: 'b', esperado: 'T0', obtido: 'T0', ms: 1, trust: 'assumed_correct', preview_truncado: false },
  ] });
  assert.equal(c.deriva_com_preview_truncado, 1,
    'enquanto isto não for zero, a deriva mede-se contra um texto que não é o que produziu o rótulo');
});

test('nos dados reais, a truncagem explica a falha — e a marca vê-a', () => {
  const h = holdout();
  const hist = h.filter((a) => a.trust === 'assumed_correct');
  assert.ok(hist.length > 0, 'sem amostras de deriva este teste não mediu nada');

  const r = bracoMooter(hist);
  const grupo = (f) => { const L = r.linhas.filter(f); return { n: L.length, ok: L.filter((l) => l.obtido === l.esperado).length }; };
  const trunc = grupo((l) => l.preview_truncado);
  const inteiras = grupo((l) => !l.preview_truncado);

  assert.ok(trunc.n > 0 && inteiras.n > 0, 'preciso dos dois grupos para comparar');
  // A afirmação forte: a concordância nas inteiras é MUITO maior. Se um dia
  // deixar de ser, ou o dataset foi reparado (bom) ou o classificador
  // regrediu (mau) — e nos dois casos alguém tem de olhar.
  assert.ok(inteiras.ok / inteiras.n > trunc.ok / trunc.n,
    `concordância nas inteiras (${inteiras.ok}/${inteiras.n}) tinha de ser maior que nas ` +
    `truncadas (${trunc.ok}/${trunc.n}) — é o que sustenta dizer que a «fraqueza» é do dataset`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · O ADVERSÁRIO JOGADO A SÉRIO — as correcções +36→+12 e a variância
// ═══════════════════════════════════════════════════════════════════════════

test('o juiz é chamado a temperature 0 — a variância publicada era NOSSA', async () => {
  // O `callOllama` corre a 0.2 por omissão. Nós nunca a fixámos, e depois
  // publicámos um painel a dizer que o adversário mudava de opinião entre
  // corridas enquanto o Mooter não. A zero, ele é tão determinista como nós.
  const j = juizFixo('T2');
  await bracoLlm([am('x-01', 'T2', 'investiga o bug')], { modelo: 'falso', callImpl: j });

  assert.equal(j.chamadas.length, 1);
  assert.equal(j.chamadas[0].opts.temperature, 0,
    'sem isto o adversário volta a oscilar por configuração nossa, e a oscilação ' +
    'volta a ser publicada como propriedade dele');
});

test('o juiz recebe as convenções do repositório — escondê-las valia +24 pontos falsos', async () => {
  // ~9 dos 70 rótulos codificam convenções privadas deste repo. O prompt não
  // lhas dava, e nós publicávamos «+36 pontos» nas adversariais. Dadas por
  // escrito, o adversário sobe de 56,0% para 80,0% e a vantagem real é +12.
  const j = juizFixo('T3');
  await bracoLlm([am('x-01', 'T3', 'faz push para produção')], { modelo: 'falso', callImpl: j });

  const p = j.chamadas[0].prompt;

  // O bloco das CONVENÇÕES é isolado antes de se afirmar seja o que for sobre
  // ele. A 1.ª versão deste teste procurava as palavras no prompt INTEIRO e
  // passava por casar com a linha que define os tiers — «T3 = arquitectura,
  // multi-ficheiro, produção, segredos, CI, migrações». Apagar o bloco todo
  // deixava o teste verde. Foi o teste de mordida que o apanhou: 22 testes a
  // passar, e este estava a guardar nada.
  const i = p.indexOf('CONVENÇÕES');
  const j2 = p.indexOf('Tarefa:');
  assert.ok(i >= 0, 'o prompt do juiz perdeu o bloco de convenções por inteiro');
  assert.ok(j2 > i, 'o bloco de convenções tem de vir antes da tarefa');
  const bloco = p.slice(i, j2);

  for (const [conv, oque] of [
    [/deploy|push|merge|release|migra|segredo|\.env|\bCI\b/i, 'o piso de risco'],
    [/@opus|@haiku|@sonnet|nomear um modelo|usa o /i, 'o pin de modelo'],
    [/pensa bem|crítico|think hard|mais cuidado|melhor/i, 'o sinal de qualidade'],
    [/mais de 3 ficheiros|arquitectura/i, 'o critério de alcance'],
  ]) {
    assert.match(bloco, conv,
      `o bloco de convenções deixou de nomear ${oque} — estamos a examinar o ` +
      'adversário sobre matéria que não lhe demos, e a publicar que ele erra');
  }
});

test('o harness não polui a telemetria real do produto', async () => {
  // Sem `sessionId`, o `callOllama` escrevia 70 chamadas T0 no tracker real —
  // a MESMA telemetria de onde o produto tira os números que publica.
  const j = juizFixo('T1');
  await bracoLlm([am('x-01', 'T1', 'escreve a mensagem de commit')], { modelo: 'falso', callImpl: j });
  assert.equal(j.chamadas[0].opts.sessionId, 'ab-harness');
});

test('um juiz que não responde não é contado como tendo acertado nem errado', async () => {
  const mudo = async () => ({ text: 'não sei bem', tokensIn: 5, tokensOut: 3 });
  const r = await bracoLlm([am('x-01', 'T2', 'p')], { modelo: 'falso', callImpl: mudo });
  assert.equal(r.linhas[0].obtido, null, 'sem rótulo reconhecível é null, nunca um palpite');
  assert.match(r.linhas[0].erro, /sem rótulo/);

  const c = contabilizar(r);
  assert.equal(c.sem_resposta, 1);
  assert.equal(c.certas, 0, 'o silêncio não pode virar acerto');
  assert.equal(c.precisao_total, 0, 'sobre o total, calar-se conta como não ter acertado');
  assert.equal(c.precisao_respondidas, null, 'sobre as respondidas, não há denominador — n/d, não 0%');
});

test('uma chamada que rebenta vira erro medido, não um braço perdido', async () => {
  const rebenta = async () => { throw new Error('ollama em baixo'); };
  const r = await bracoLlm([am('x-01', 'T0', 'p'), am('x-02', 'T1', 'q')],
    { modelo: 'falso', callImpl: rebenta });
  assert.equal(r.linhas.length, 2, 'a varredura continua — uma falha não mata as restantes');
  assert.ok(r.linhas.every((l) => l.obtido === null && /ollama em baixo/.test(l.erro)));
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · O CONTROLO E A CONTABILIDADE
// ═══════════════════════════════════════════════════════════════════════════

test('o braço sem router não classifica nada — despacha sempre para o mesmo tier', () => {
  const a = [am('a', 'T0', 'renomeia'), am('b', 'T3', 'redesenha o vault')];
  const r = bracoSemRouter(a);
  assert.deepEqual(r.linhas.map((l) => l.obtido), ['T3', 'T3'],
    'se o controlo começar a acertar por classificar, deixou de ser controlo');
  assert.equal(r.rede, false);
  assert.equal(r.tokens_in + r.tokens_out, 0);
});

test('subestimar e sobrestimar são contados à parte — não é o mesmo erro', () => {
  // Mandar T3 para T0 arrisca a qualidade do trabalho. Mandar T0 para T3 só
  // gasta dinheiro. Somá-los apagava a única assimetria que interessa ao dono.
  const c = contabilizar({ braco: 'x', linhas: [
    { id: 'a', esperado: 'T3', obtido: 'T0', ms: 1 },  // subestimou
    { id: 'b', esperado: 'T0', obtido: 'T3', ms: 1 },  // sobrestimou
    { id: 'c', esperado: 'T0', obtido: 'T3', ms: 1 },  // sobrestimou
  ] });
  assert.equal(c.subestimou, 1);
  assert.equal(c.sobrestimou, 2);
});

test('o braço do Mooter não abre rede nenhuma e declara zero MEDIDO, não assumido', () => {
  const r = bracoMooter([am('a', 'T0', 'renomeia o ficheiro')]);
  assert.equal(r.rede, false);
  assert.equal(r.tokens_in, 0);
  assert.equal(r.tokens_out, 0);
  assert.ok(r.linhas[0].ms >= 0, 'a latência é medida, não inventada');
  assert.ok(['T0', 'T1', 'T2', 'T3'].includes(r.linhas[0].obtido),
    'o classify real tem de devolver um tier da escada');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · A PROVENIÊNCIA — a linha de um recibo que não pode estar errada
// ═══════════════════════════════════════════════════════════════════════════

test('a proveniência é DERIVADA do modo, não cravada', async () => {
  // Estava cravada «gold-labels.json (2026-06-08)» — ficheiro errado em
  // `--holdout`, e uma data que não existe em commit nenhum.
  const j = juizFixo('T3');
  const g = await correr({ n: 2, callImpl: j });
  const h = await correr({ n: 2, holdout: true, callImpl: j });

  assert.match(g.dataset, /gold-labels\.json/);
  assert.match(h.dataset, /validation-set\.json/);
  assert.notEqual(g.dataset, h.dataset,
    'dois datasets diferentes não podem ter a mesma linha de proveniência');
  assert.doesNotMatch(FONTE, /2026-06-08/,
    'a data inventada não pode voltar ao ficheiro');
});

test('a proveniência que o relatório imprime é a que o meta traz', async () => {
  const j = juizFixo('T3');
  const r = await correr({ n: 2, holdout: true, callImpl: j });
  const txt = imprimir(r.resultados, r);
  assert.ok(txt.includes(r.dataset),
    'o que se imprime tem de ser o que se mediu — senão o recibo mente no cabeçalho');
});

test('os preços vêm do SSOT e nunca são escritos aqui', () => {
  assert.match(FONTE, /tools['"\s,)\]]*.{0,4}router['"\s,)\]]*.{0,4}pricing\.js|pricing\.js/,
    'o harness tem de deferir ao SSOT de preços');
  // Uma segunda verdade de preços já custou uma sessão a este projecto.
  const literais = FONTE.match(/\b\d+\.\d{2,}\s*\/\s*1[_ ]?000[_ ]?000|\bper_mtok|\bprice[s]?\s*=\s*\{/gi) || [];
  assert.deepEqual(literais, [],
    'preço copiado para dentro do teste é a segunda verdade que o SSOT existe para evitar');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 · A MEDIANA — o número que a peça publicava sem recibo
// ═══════════════════════════════════════════════════════════════════════════

test('correrVarias(): a mediana é derivada das corridas, e a faixa vai ao lado', async () => {
  // A peça dizia «mediana de 6 corridas» e o repositório guardava UMA. Seis
  // números cuja única fonte é uma mensagem de commit não são auditáveis.
  const j = juizFixo('T3');
  const r = await correrVarias({ n: 3, holdout: true, callImpl: j }, 3);

  assert.equal(r.corridas, 3);
  assert.equal(r.detalhe.length, 3, 'as corridas individuais ficam no recibo, não só o resumo');
  for (const b of r.resumo) {
    assert.equal(b.precisao_limpa_por_corrida.length, 3,
      'cada valor da mediana tem de estar no ficheiro, um a um');
    assert.ok(b.precisao_limpa_mediana >= b.precisao_limpa_min);
    assert.ok(b.precisao_limpa_mediana <= b.precisao_limpa_max);
  }
});

test('correrVarias(): declara quando um braço deu o MESMO resultado em todas', async () => {
  // É esta bandeira que sustenta «idêntico nas 6». Com um juiz fixo, os três
  // braços são determinísticos por construção — e tem de dizer que sim.
  const r = await correrVarias({ n: 3, holdout: true, callImpl: juizFixo('T3') }, 2);
  assert.ok(r.resumo.every((b) => b.identico_em_todas === true),
    'com entradas idênticas e um juiz fixo, nenhum braço pode variar');
});

test('correrVarias(): um braço que VARIA não pode ser declarado idêntico', async () => {
  // O oposto do teste anterior — sem isto, `identico_em_todas` podia estar
  // cravado a `true` e os dois testes passavam na mesma.
  //
  // A 1.ª versão deste teste estava errada e o próprio teste apanhou-a: usava um
  // juiz que alternava T3/T0 a cada chamada, o que produz a MESMA sequência em
  // todas as corridas — oscila dentro da corrida, é idêntico entre corridas, e
  // `identico_em_todas: true` estava certo. Para medir variação ENTRE corridas,
  // o juiz tem de mudar de comportamento quando a corrida muda.
  const N = 4;
  let chamada = 0;
  const entreCorridas = async () => {
    const corrida = Math.floor(chamada++ / N);      // 0 na 1.ª, 1 na 2.ª
    return { text: corrida === 0 ? 'T3' : 'T0', tokensIn: 1, tokensOut: 1 };
  };
  const r = await correrVarias({ n: N, holdout: true, callImpl: entreCorridas }, 2);
  const llm = r.resumo.find((b) => /LLM/.test(b.braco));

  assert.equal(llm.identico_em_todas, false,
    'um juiz que responde diferente na 2.ª corrida TEM de ser reportado como não idêntico');
  assert.ok(llm.precisao_limpa_max > llm.precisao_limpa_min,
    'e a faixa tem de mostrar a variação, senão a bandeira sozinha não prova nada');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5b · A DIFERENÇA AGUENTA-SE? — o teste que faltava a todas as versões
// ═══════════════════════════════════════════════════════════════════════════

const par = (id, certo) => ({ id, esperado: 'T2', obtido: certo ? 'T2' : 'T0', ms: 1, trust: 'ground_truth' });

test('mcnemar(): conta só os discordantes — onde os dois concordam não há informação', () => {
  // 10 pares: em 8 os dois acertam, em 2 só o B acerta. Só os 2 contam.
  const A = [], B = [];
  for (let i = 0; i < 8; i++) { A.push(par('c' + i, true)); B.push(par('c' + i, true)); }
  for (let i = 0; i < 2; i++) { A.push(par('d' + i, false)); B.push(par('d' + i, true)); }
  const m = mcnemar(A, B);
  assert.equal(m.n_pares, 10);
  assert.equal(m.discordantes, 2, 'os 8 concordantes não podem inflacionar o n do teste');
  assert.equal(m.so_b, 2);
  assert.equal(m.so_a, 0);
});

test('mcnemar(): 2 discordantes a 0 NÃO chegam para afirmar diferença', () => {
  // Controlo derivado à mão, não copiado do instrumento: com n=2 e k=0, a
  // binomial bicaudal dá 2·(1/4) = 0,5. Muito acima de 0,05.
  const A = [par('d0', false), par('d1', false)];
  const B = [par('d0', true), par('d1', true)];
  const m = mcnemar(A, B);
  assert.equal(m.p, 0.5, 'p tem de ser exactamente 0,5 — derivado, não medido');
  assert.equal(m.significativo, false);
});

test('mcnemar(): 20 discordantes a 0 chegam — e por larga margem', () => {
  const A = [], B = [];
  for (let i = 0; i < 20; i++) { A.push(par('d' + i, false)); B.push(par('d' + i, true)); }
  const m = mcnemar(A, B);
  assert.ok(m.p < 0.0001, `p=${m.p} tinha de ser minúsculo com 20 a 0`);
  assert.equal(m.significativo, true);
});

test('mcnemar(): sem discordantes é n/d, NUNCA «não significativo»', () => {
  // Dois braços que acertam e erram exactamente nos mesmos sítios não dão
  // informação nenhuma. Chamar a isso «não significativo» seria afirmar que se
  // testou e não deu — quando não se testou nada.
  const A = [par('a', true), par('b', false)];
  const B = [par('a', true), par('b', false)];
  const m = mcnemar(A, B);
  assert.equal(m.discordantes, 0);
  assert.equal(m.significativo, null, 'sem discordantes não há veredicto a dar');
});

test('mcnemar(): é simétrico na magnitude e nomeia quem ganha', () => {
  const A = [par('x', true), par('y', false), par('z', false)];
  const B = [par('x', false), par('y', true), par('z', true)];
  const ab = mcnemar(A, B), ba = mcnemar(B, A);
  assert.equal(ab.p, ba.p, 'o p não depende da ordem dos argumentos');
  assert.equal(ab.so_a, ba.so_b, 'mas quem ganha cada discordante, sim');
  assert.equal(ab.so_b, 2);
});

test('nos dados reais: vs SEM ROUTER aguenta-se; vs router-por-LLM não', async () => {
  // A afirmação central desta sessão, ancorada no motor e não numa nota.
  // Se um dia isto mudar, ou o dataset cresceu (bom) ou algo regrediu (mau).
  const j = juizFixo('T3');
  const r = await correrVarias({ holdout: true, callImpl: j }, 1);
  assert.ok(Array.isArray(r.significancia) && r.significancia.length >= 1,
    'o resumo tem de trazer a significância, senão volta-se a publicar diferenças cruas');

  const semRouter = r.significancia.find((x) => /SEM ROUTER/i.test(x.contra));
  assert.ok(semRouter, 'preciso do braço de controlo para a comparação que interessa');
  assert.equal(semRouter.significativo, true,
    `Mooter vs sem router tinha de ser distinguível de ruído (p=${semRouter.p}) — ` +
    'é esta a alegação que o produto faz, e é a única que está provada');
  assert.ok(semRouter.so_b > semRouter.so_a,
    'e a diferença tem de ser A FAVOR do Mooter, não só grande');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6 · O CUSTO — «equivalente a preço de tabela», nunca «poupança»
// ═══════════════════════════════════════════════════════════════════════════

test('custoEquivalente(): o valor de nuvem é rotulado como equivalente, NUNCA como despesa', () => {
  const r = contabilizar({ braco: 'x', linhas: [
    { id: 'a', esperado: 'T0', obtido: 'T0', ms: 1, tokens_in: 1000, tokens_out: 100 },
  ] });
  const c = custoEquivalente({ ...r, tokens_in: 1000, tokens_out: 100 },
    { PRICES: { 'claude-opus-5': { input: 15, output: 75 } } });

  if (c.usd_se_nuvem != null) {
    assert.match(String(c.usd_se_nuvem_porque), /equivalente|tabela|NÃO é despesa/i,
      'um número de nuvem sem o rótulo vira, na primeira citação, uma poupança inventada');
  }
});

test('sem preços disponíveis, o custo é n/d — nunca zero', async () => {
  const c = custoEquivalente({ braco: 'x', linhas: [], tokens_in: 10, tokens_out: 5 },
    { PRICES: null });
  assert.notEqual(c.usd_se_nuvem, 0,
    'zero quer dizer «medi e deu zero»; ausência de preço quer dizer n/d — ' +
    'confundi-los é como o viés do default barato nasce');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7 · O FICHEIRO NÃO PODE VOLTAR A AFIRMAR O QUE A AUDITORIA DERRUBOU
// ═══════════════════════════════════════════════════════════════════════════

test('o harness não crava nenhum dos números que publica', () => {
  // Um número escrito no instrumento que o produz é um número que deixa de
  // depender da medição. Estes são exactamente os que foram para a release.
  // Ponto E vírgula: a 1.ª versão desta guarda só procurava `84.3` e deixou
  // passar `84,3%` numa docstring — que era exactamente o número que a auditoria
  // tinha derrubado, ainda escrito no ficheiro. Uma guarda que só cobre metade
  // da grafia é uma guarda que dá verde no caso que interessa.
  for (const n of ['84.3', '84,3', '81.7', '81,7', '71.7', '71,7',
                   '96.4', '96,4', '23182', '23 182']) {
    assert.ok(!FONTE.includes(n),
      `"${n}" está cravado no harness — o instrumento passou a afirmar em vez de medir`);
  }
});

test('o `--corridas` continua a existir no CLI', () => {
  assert.match(FONTE, /'--corridas'/,
    'sem esta bandeira a mediana volta a não ter recibo, que foi o bloqueio nº5 do portão');
});
