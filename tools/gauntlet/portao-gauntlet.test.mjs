// portao-gauntlet.test.mjs
//
// A mordida central: o portão tem de REPROVAR uma declaração que salta perguntas
// e tem de distinguir «passou» de «passou carimbado». Um portão que só aprova é
// o mesmo tick-box que o documento diz que o estágio 1 degrada a ser.
//
//   node --test tools/gauntlet/portao-gauntlet.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  avaliar, extrairDeclaracao, lerGauntlet, normalizarClasse, exitDe,
  ESTADO, EXIT, CLASSES,
} from './portao-gauntlet.mjs';

// ── um gauntlet falso, para os testes não dependerem do documento real ──
const G18 = Array.from({ length: 18 }, (_, i) => `G${i + 1}`);
const fake = (over = {}) => ({ ok: true, ids: G18, tecto: 18, versao: 'v6', avisos: [], ...over });

const todas = (extra = '') =>
  `gauntlet: [alto risco] · ${G18.join(' ')} · G4 em codex · G3 mudou o plano${extra}`;

// ── o documento é a fonte, não este ficheiro ─────────────────────────────

test('lerGauntlet extrai as perguntas do MEO_GAUNTLET.md real', () => {
  // Se isto falhar, o portão está a validar contra uma lista que não é a do
  // documento — exactamente a segunda verdade que ele existe para não ter.
  const g = lerGauntlet();
  assert.equal(g.ok, true, g.porque);
  assert.ok(g.ids.length >= 18, `só ${g.ids.length} perguntas lidas: ${g.ids.join(', ')}`);
  assert.ok(g.ids.includes('G1') && g.ids.includes('G18'));
  assert.equal(g.versao, 'v6');
  assert.equal(g.tecto, 18);
});

test('o documento real não diverge de si próprio — tecto == nº de perguntas', () => {
  // Um tecto que não bate com a lista é o primeiro sinal de uma entrada feita
  // sem a saída correspondente (a regra entra-uma-sai-uma).
  const g = lerGauntlet();
  assert.deepEqual(g.avisos, [], `divergência no documento: ${g.avisos.join(' · ')}`);
  assert.equal(g.ids.length, g.tecto);
});

test('sem documento legível o portão sai n/d — nunca verde por omissão', () => {
  const v = avaliar(todas(), { docPath: path.join(os.tmpdir(), 'nao-existe-'.concat(Date.now(), '.md')) });
  assert.equal(v.estado, ESTADO.ND);
  assert.equal(exitDe(v), EXIT.ND);
});

test('o portão acompanha o documento: uma G19 nova passa a ser exigida', () => {
  // A prova de que a lista não está copiada aqui dentro. Se alguém acrescentar
  // uma pergunta ao doc, uma declaração antiga deixa de bastar.
  const g19 = fake({ ids: [...G18, 'G19'], tecto: 19 });
  const v = avaliar(todas(), { gauntlet: g19 });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.deepEqual(v.em_falta, ['G19']);
});

// ── presença e forma ─────────────────────────────────────────────────────

test('sem declaração, a wave não fecha', () => {
  const v = avaliar('fiz umas coisas e correu tudo bem', { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.match(v.porque, /gauntlet:/);
  assert.equal(exitDe(v), EXIT.FALHA);
});

test('`gauntlet:` vazio é ausência, não presença', () => {
  const v = avaliar('gauntlet:   ', { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
});

test('classe desconhecida reprova — a régua de disparo não tem quarta linha', () => {
  const v = avaliar('gauntlet: [médio] · G1 · G3 · G7', { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.match(v.porque, /classe não reconhecida/);
});

test('normalizarClasse aceita as variantes que um humano escreve', () => {
  for (const s of ['Alto Risco', 'alto-risco', 'ALTO RISCO', 'alto  risco']) {
    assert.equal(normalizarClasse(s), 'alto risco', s);
  }
  assert.equal(normalizarClasse('Trivial'), 'trivial');
  assert.equal(normalizarClasse('Rotina'), 'rotina');
  assert.equal(normalizarClasse('qualquer'), null);
});

// ── a régua de disparo, classe a classe ──────────────────────────────────

test('trivial não exige gauntlet — o documento diz «nenhum»', () => {
  const v = avaliar('gauntlet: [trivial]', { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.OK);
  assert.equal(exitDe(v), EXIT.OK);
});

test('rotina exige G1, G3 e G7 — e reprova se faltar UMA', () => {
  const ok = avaliar('gauntlet: [rotina] · G1 · G3 mudou o título · G7', { gauntlet: fake() });
  assert.equal(ok.estado, ESTADO.OK);

  const falta = avaliar('gauntlet: [rotina] · G1 · G3', { gauntlet: fake() });
  assert.equal(falta.estado, ESTADO.FALHA);
  assert.deepEqual(falta.em_falta, ['G7']);
  assert.deepEqual(CLASSES.rotina.exige, ['G1', 'G3', 'G7']);
});

test('MORDIDA · alto risco que salta uma pergunta reprova, e diz QUAL', () => {
  // O caso que este portão existe para apanhar: 17 de 18 é o mesmo que 0 de 18
  // para quem lê «gauntlet corrido».
  const dezassete = G18.filter((g) => g !== 'G11');
  const v = avaliar(`gauntlet: [alto risco] · ${dezassete.join(' ')} · G4 em codex · G2 mudou X`,
    { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.deepEqual(v.em_falta, ['G11']);
  assert.match(v.porque, /G11/);
});

test('alto risco com as 18 tratadas passa', () => {
  const v = avaliar(todas(), { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.OK, JSON.stringify(v, null, 2));
});

// ── não corridas: saltar é legítimo, saltar em silêncio não ──────────────

test('uma pergunta em `não corridos:` CONTA como tratada — se trouxer o porquê', () => {
  const dezassete = G18.filter((g) => g !== 'G6');
  const v = avaliar(
    `gauntlet: [alto risco] · ${dezassete.join(' ')} · G4 em kimi · G1 mudou a copy · não corridos: G6 (sem segunda máquina)`,
    { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.OK, JSON.stringify(v, null, 2));
});

test('`não corridos:` sem o porquê reprova — saltar em silêncio não passa', () => {
  const dezassete = G18.filter((g) => g !== 'G6');
  const v = avaliar(
    `gauntlet: [alto risco] · ${dezassete.join(' ')} · G4 em kimi · G1 mudou X · não corridos: G6`,
    { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.match(v.porque, /sem o porquê/);
});

// ── G4: o crítico ≠ autor ────────────────────────────────────────────────

test('alto risco sem `G4 em [motor]` reprova — sem o campo não há como saber', () => {
  const semG4 = G18.filter((g) => g !== 'G4');
  const v = avaliar(`gauntlet: [alto risco] · ${semG4.join(' ')} · G4 · G1 mudou X`, { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.deepEqual(v.em_falta, ['G4']);
});

test('CARIMBADO · G4 sem motor externo passa, mas NUNCA limpo', () => {
  // «Sem segundo motor disponível: o entregável não sai, ou sai carimbado
  // `não-verificado` — nunca sai limpo.» Um portão que colapsasse isto em `ok`
  // apagava exactamente a marca que o documento manda deixar.
  for (const m of ['não-verificado', 'nao-verificado', 'auto-DEGRADADO', 'nenhum']) {
    const v = avaliar(todas().replace('G4 em codex', `G4 em ${m}`), { gauntlet: fake() });
    assert.equal(v.estado, ESTADO.CARIMBADO, `${m} devia carimbar, deu ${v.estado}`);
    assert.equal(exitDe(v), EXIT.CARIMBADO);
    assert.notEqual(exitDe(v), EXIT.OK, 'carimbado não pode partilhar exit com limpo');
    assert.ok(v.notas.some((n) => /CARIMBADO|carimbado/.test(n)));
  }
});

test('carimbado tem exit PRÓPRIO — quem lê o número distingue-o de limpo', () => {
  assert.notEqual(EXIT.CARIMBADO, EXIT.OK);
  assert.notEqual(EXIT.CARIMBADO, EXIT.FALHA);
});

// ── anti-sycophancy ──────────────────────────────────────────────────────

test('alto risco onde NADA mudou passa, mas com nota — «gate que só aprova = não rodou»', () => {
  // Não bloqueia: não se pode PROVAR que um trabalho impecável é mentira. Mas o
  // masterprompt manda desconfiar da frase, e o AGENTS.md exige ≥1 objecção ou
  // a declaração do que se tentou refutar.
  const semMudou = `gauntlet: [alto risco] · ${G18.join(' ')} · G4 em codex`;
  const v = avaliar(semMudou, { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.OK);
  assert.ok(v.notas.some((n) => /só aprova|não rodou/.test(n)),
    `esperava nota anti-sycophancy; notas=${JSON.stringify(v.notas)}`);
});

test('...e não incomoda quem declarou o que mordeu', () => {
  const v = avaliar(todas(), { gauntlet: fake() });
  assert.ok(!v.notas.some((n) => /só aprova/.test(n)));
});

// ── parser ───────────────────────────────────────────────────────────────

test('extrairDeclaracao lê classe, perguntas, G4 e não-corridos', () => {
  const d = extrairDeclaracao('bla\ngauntlet: [alto risco] · G1 mudou a copy · G4 em gemini · não corridos: G6, G9 (sem GPU)\nbla');
  assert.equal(d.presente, true);
  assert.equal(d.classe, 'alto risco');
  assert.ok(d.mencionadas.includes('G1'));
  assert.equal(d.g4_motor, 'gemini');
  assert.deepEqual(d.nao_corridos, ['G6', 'G9']);
  assert.equal(d.justifica_nao_corridos, true);
  assert.equal(d.mudou, true);
});

test('o parser encontra a declaração no meio de um documento grande', () => {
  const doc = ['# Fecho', '', 'texto '.repeat(200), 'gauntlet: [trivial]', '', 'mais texto'].join('\n');
  assert.equal(extrairDeclaracao(doc).classe, 'trivial');
});

test('nunca lança, seja qual for a porcaria que receba', () => {
  for (const lixo of [null, undefined, 0, [], {}, 'gauntlet:', 'gauntlet: [', 'G4 em']) {
    assert.doesNotThrow(() => avaliar(lixo, { gauntlet: fake() }));
    assert.doesNotThrow(() => extrairDeclaracao(lixo));
  }
});

// ── render ───────────────────────────────────────────────────────────────

test('imprimir diz o estado, o porquê e o que falta', async () => {
  const { imprimir } = await import('./portao-gauntlet.mjs');
  const v = avaliar(`gauntlet: [alto risco] · ${G18.filter((g) => g !== 'G11').join(' ')} · G4 em codex`,
    { gauntlet: fake() });
  const txt = imprimir(v);
  assert.match(txt, /FALHA/);
  assert.match(txt, /G11/);
  assert.match(txt, /v6/);
});

test('imprimir explica que carimbado não é limpo', async () => {
  const { imprimir } = await import('./portao-gauntlet.mjs');
  const v = avaliar(todas().replace('G4 em codex', 'G4 em não-verificado'), { gauntlet: fake() });
  assert.match(imprimir(v), /carimbado ≠ limpo/);
});

// ── o portão contra o registo real ───────────────────────────────────────

test('REGISTO · nenhuma declaração real do repo passa hoje — e é o ponto', () => {
  // O documento diz que o estágio 1 «depende de obediência». Medido a
  // 2026-09-01: as declarações `gauntlet:` que existem no `_handoff/` são
  // instruções («corre o gauntlet»), não declarações de fecho no formato fixo.
  // Este teste não exige que passem — regista que o portão as distingue, que é
  // a diferença entre um grep e um portão.
  const g = lerGauntlet();
  const instrucao = 'gauntlet: MEO v6 + as 10 perguntas do mapa';
  const v = avaliar(instrucao, { gauntlet: g });
  assert.equal(v.estado, ESTADO.FALHA,
    'uma INSTRUÇÃO para correr o gauntlet não é uma DECLARAÇÃO de o ter corrido');
});

// ── o portão nasceu cego a 11 declarações reais ──────────────────────────
//
// Medido a 2026-09-01, no registo real (repo + vault): 16 linhas com o regex
// original (`^\s*gauntlet\s*:`), **27** tolerando prefixos markdown. Onze
// declarações genuínas eram invisíveis — escritas dentro de crases, porque o
// formato é apresentado assim no MEO_GAUNTLET.md e foi copiado com elas.
//
// O portão respondia «não há declarações» quando a resposta certa era «não sei
// ler as que há». É a G11 virada contra o instrumento. Apanhado por um motor
// diferente do autor — a G4 a funcionar.

test('MORDIDA · uma declaração dentro de crases É uma declaração', () => {
  const d = extrairDeclaracao('`gauntlet: [trivial]`');
  assert.equal(d.presente, true, 'o portão continua cego a crases');
  assert.equal(d.classe, 'trivial');
});

test('a crase de fecho não entra no corpo', () => {
  // Sem isto, `G4 em codex` lido de dentro de crases traria a crase no motor.
  const d = extrairDeclaracao('`gauntlet: [alto risco] · G4 em codex`');
  assert.equal(d.g4_motor, 'codex', `motor lido: ${JSON.stringify(d.g4_motor)}`);
});

test('bullets e citações também contam — é assim que as pessoas escrevem', () => {
  for (const prefixo of ['- ', '  - ', '> ', '* ', '  ']) {
    const d = extrairDeclaracao(`${prefixo}gauntlet: [rotina] · G1 · G3 · G7`);
    assert.equal(d.presente, true, `prefixo ${JSON.stringify(prefixo)} não reconhecido`);
    assert.equal(d.classe, 'rotina');
  }
});

test('as declarações reais do registo são agora vistas — as 4 que eu perdia', () => {
  // Amostras verbatim do registo, com as crases que lá estão.
  const reais = [
    '`gauntlet: alto-risco · wrapper de orquestração · G4 CORRIDO (job-x)`',
    '`gauntlet: auditoria pedida pelo dono · autor≠crítico por construção`',
    '`gauntlet: MODO CONSTRUÇÃO · 88/88 · mutação 6/6 vermelhas`',
  ];
  for (const l of reais) {
    assert.equal(extrairDeclaracao(l).presente, true, `não vê: ${l}`);
  }
  // «alto-risco» com hífen tem de normalizar para a classe da régua.
  assert.equal(extrairDeclaracao(reais[0]).classe, 'alto risco');
});

test('ver uma declaração não é aprová-la — as reais continuam a reprovar', () => {
  // O ponto: passar a VER não pode virar passar a ACEITAR. Estas três são
  // declarações a sério, mas nenhuma trata as 18 — reprovam pelo motivo certo.
  const v = avaliar('`gauntlet: alto-risco · wrapper de orquestração · G4 CORRIDO (job-x)`',
    { gauntlet: fake() });
  assert.equal(v.estado, ESTADO.FALHA);
  assert.ok(v.em_falta.length > 10, `em_falta=${v.em_falta.length}`);
});
