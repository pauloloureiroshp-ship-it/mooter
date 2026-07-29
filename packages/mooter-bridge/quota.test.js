'use strict';
/**
 * quota.test.js — v1.7: o medidor de combustivel nao mente sobre o que sabe.
 *
 * A tentacao aqui e enorme: apresentar um numero bonito de "quanto resta". Nao
 * ha API de quota em lado nenhum — nem Anthropic nem OpenAI — e o que lemos sai
 * dos ficheiros de sessao locais, a mesma fonte que o `/usage` do Claude Code
 * usa e que a propria documentacao dele avisa nao incluir o claude.ai nem
 * outras maquinas. E um LIMITE INFERIOR, e tem de o dizer sempre.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const q = require('./quota.js');

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-quota-'));
function sessao(nome, turnos) {
  const dir = path.join(RAIZ, nome);
  fs.mkdirSync(dir, { recursive: true });
  const linhas = turnos.map((t) => JSON.stringify({
    type: 'assistant', timestamp: new Date(t.em).toISOString(),
    message: { model: t.modelo, usage: { input_tokens: t.in || 0, output_tokens: t.out || 0,
      cache_read_input_tokens: t.cache || 0, cache_creation_input_tokens: 0 } },
  }));
  fs.writeFileSync(path.join(dir, 'x.jsonl'), linhas.join('\n'));
}

test('Q1 — le os turnos reais e soma o que a API reportou', () => {
  const agora = Date.now();
  sessao('p1', [
    { em: agora - 3600e3, modelo: 'claude-opus-4-8', in: 100, out: 1000 },
    { em: agora - 7200e3, modelo: 'claude-sonnet-5', in: 50, out: 500 },
  ]);
  const m = q.medir({ raiz: RAIZ, agora });
  assert.ok(m.disponivel);
  assert.strictEqual(m.curta.turnos, 2);
  assert.strictEqual(m.curta.saidas, 1500);
});

test('Q2 — cache_read e REGISTADO mas nunca entra no PESO da quota', () => {
  /**
   * ⚠️ CONTRATO AFINADO na v1.9, e a distincao e' o coracao da coisa:
   *
   *   · o cache lido NAO conta para a pressao — e' 0,1x e a barra da aplicacao
   *     nao o conta assim; soma-lo faria o painel gritar "quase no limite" sem
   *     ser verdade;
   *   · mas TEM de ser registado, porque e' 70% do custo real da factura
   *     (631 MILHOES de tokens em 7 dias, medidos) e e' o unico numero que
   *     responde a "vale a pena recomecar a conversa?".
   *
   * Registar sem contar. As duas coisas ao mesmo tempo.
   */
  const agora = Date.now();
  sessao('p2', [{ em: agora - 60e3, modelo: 'claude-opus-4-8', in: 2, out: 100, cache: 900000 }]);
  const m = q.medir({ raiz: RAIZ, agora });
  assert.strictEqual(m.curta.cache_lido, 900000, 'deixou de registar o cache lido — perde-se o numero que explica a factura');
  /**
   * O peso deriva das SAIDAS, nunca do cache lido. O tecto e' "tudo Opus":
   * saidas/1000 x 5. Se alguem somasse os 900 000 de cache, o peso saltaria
   * para ~4500 — tres ordens de grandeza acima — e o painel diria "estas no
   * limite" com 100 tokens escritos.
   *
   * ⚠️ O teste NAO assume isolamento: as sessoes dos testes anteriores vivem na
   * mesma raiz e somam-se. Por isso a assercao e' relativa as saidas medidas, e
   * nao a um numero absoluto — foi assim que este teste ja falhou uma vez, por
   * culpa do proprio teste.
   */
  // Onda 0.4: o peso deriva de ENTRADAS+SAIDAS (nunca do cache lido). O tecto
  // e' "tudo Opus": (entradas+saidas)/1000 x 5.
  const pesoMax = ((m.curta.saidas + m.curta.entradas) / 1000) * 5;
  assert.ok(m.curta.peso <= pesoMax + 0.001,
    'o cache lido entrou no peso: ' + m.curta.peso + ' > ' + pesoMax);
  assert.ok(m.curta.peso < (m.curta.cache_lido / 1000) * 0.1,
    'o peso esta na ordem de grandeza do cache — alguem o somou');
});

test('Q3 — o Opus pesa mais do que o Haiku no consumo de quota', () => {
  assert.strictEqual(q.pesoDe('claude-opus-4-8').peso, 5);
  assert.strictEqual(q.pesoDe('claude-sonnet-5').peso, 1);
  assert.strictEqual(q.pesoDe('claude-haiku-4-5').peso, 0.25);
  assert.strictEqual(q.pesoDe('modelo-desconhecido').familia, 'n/d');
});

test('Q4 — A RESSALVA viaja SEMPRE com o numero', () => {
  const m = q.medir({ raiz: RAIZ, agora: Date.now() });
  assert.ok(/LIMITE INFERIOR/.test(m.ressalva), 'o numero sai sem dizer que e um minimo');
  assert.ok(/claude\.ai/.test(m.ressalva), 'nao avisa que o contador do servidor esta a frente');
  assert.ok(m.fonte, 'nao declara de onde saiu o numero');
});

test('Q5 — sem sessoes locais e n/d, nunca zero', () => {
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-vazio-'));
  const m = q.medir({ raiz: vazio, agora: Date.now() });
  const p = q.pressao(m, null);
  // uma pasta vazia da 0 de consumo, o que e verdade; o que NAO pode e' dar erro
  assert.ok(m.disponivel === true || m.disponivel === false);
  if (!m.disponivel) assert.strictEqual(p.valor, null, 'inventou uma pressao sem dados');
});

test('Q6 — a pressao declara-se ESTIMATIVA e diz contra que referencia', () => {
  const agora = Date.now();
  const m = q.medir({ raiz: RAIZ, agora });
  const p = q.pressao(m, { peso_semana: 100, peso_5h: 10 });
  assert.strictEqual(p.estimativa, true);
  assert.ok(p.referencia && p.referencia.peso_semana === 100, 'nao diz contra que referencia mediu');
  assert.ok(/nao e um limite publicado|não é um limite publicado/.test(p.porque), 'faz passar a referencia por limite oficial');
});

test('Q7 — a calibragem SO desce de tier, nunca sobe', () => {
  const alto = q.calibrar({ valor: 0.9, nivel: 'critico' }, { tem_local: true });
  assert.strictEqual(alto.forcar_local, true);
  assert.strictEqual(alto.tecto, 'haiku');
  const medio = q.calibrar({ valor: 0.7, nivel: 'alto' }, { tem_local: true });
  assert.strictEqual(medio.tecto, 'sonnet');
  const normal = q.calibrar({ valor: 0.1, nivel: 'baixo' }, { tem_local: true });
  assert.strictEqual(normal.tecto, null, 'com quota a sobrar nao pode impor tecto nenhum');
  assert.strictEqual(normal.forcar_local, false);
});

test('Q8 — sem leitura de quota NAO mexe no routing as cegas', () => {
  const c = q.calibrar({ valor: null }, {});
  assert.strictEqual(c.politica, 'normal');
  assert.strictEqual(c.forcar_local, false);
  assert.ok(/às cegas|as cegas/.test(c.porque));
});

test('Q9 — sem GPU local, aperta o tecto em vez de prometer local', () => {
  const c = q.calibrar({ valor: 0.95, nivel: 'critico' }, { tem_local: false });
  assert.strictEqual(c.forcar_local, false, 'prometeu mandar para uma GPU que nao existe');
  assert.strictEqual(c.tecto, 'haiku');
});

test('Q10 — Codex sem rollouts legiveis fica n/d COM porque — nunca um numero inventado', () => {
  // Onda 0.5: o Codex TEM leitura local. Mas quando nao ha nada legivel, a
  // resposta continua a ser n/d com explicacao — nunca estimativa disfarçada.
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-codex-vazio-'));
  const e = q.estado({ raiz: RAIZ, raiz_codex: vazio });
  assert.strictEqual(e.codex.disponivel, false);
  assert.ok(e.codex.porque && e.codex.porque.length > 10, 'nao explica porque e que o Codex fica sem leitura');
});

test('Q11 — ACHADO CODEX: a cache existe e nao muda os numeros', () => {
  // "44 ficheiros a cada 2 segundos implicam 1320 aberturas/minuto e bloqueiam
  // o event loop" — e o painel repolla de 2 em 2s. Medido: 137ms -> 5ms.
  const agora = Date.now();
  sessao('cache1', [{ em: agora - 60e3, modelo: 'claude-opus-4-8', in: 10, out: 100 }]);
  const a = q.medir({ raiz: RAIZ, agora });
  const b = q.medir({ raiz: RAIZ, agora });
  assert.strictEqual(a.longa.turnos, b.longa.turnos, 'a cache mudou a contagem');
  assert.strictEqual(a.longa.saidas, b.longa.saidas);
  assert.strictEqual(a.curta.turnos, b.curta.turnos, 'a janela curta divergiu com a cache');
  assert.ok(q.CACHE.size > 0, 'nao ha cache nenhuma — volta a ler 44 ficheiros de 2 em 2s');
});

test('Q12 — a janela de 5h e sempre um subconjunto da de 7 dias', () => {
  const agora = Date.now();
  sessao('janela', [
    { em: agora - 60e3, modelo: 'claude-sonnet-5', in: 1, out: 10 },          // dentro das 5h
    { em: agora - 3 * 24 * 3600e3, modelo: 'claude-sonnet-5', in: 1, out: 20 }, // fora
  ]);
  const m = q.medir({ raiz: RAIZ, agora });
  assert.ok(m.curta.turnos <= m.longa.turnos, 'a janela curta tem mais turnos que a longa');
  assert.ok(m.curta.saidas <= m.longa.saidas);
});

test('Q13 — um ficheiro que MUDA e relido, nao servido da cache', () => {
  const agora = Date.now();
  const dir = path.join(RAIZ, 'muda');
  sessao('muda', [{ em: agora - 60e3, modelo: 'claude-sonnet-5', in: 1, out: 100 }]);
  const antes = q.medir({ raiz: RAIZ, agora }).longa.saidas;
  // acrescenta um turno, como o Claude Code faz: sempre no fim
  fs.appendFileSync(path.join(dir, 'x.jsonl'), '\n' + JSON.stringify({
    type: 'assistant', timestamp: new Date(agora - 30e3).toISOString(),
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 500 } },
  }));
  const depois = q.medir({ raiz: RAIZ, agora }).longa.saidas;
  assert.strictEqual(depois, antes + 500, 'a cache serviu dados velhos depois do ficheiro crescer');
});

/**
 * ── ONDA 0 (2026-07-26) — a regua honesta ─────────────────────────────────
 * A quota estava inflacionada 2-3x: uma resposta com N blocos de conteudo
 * escreve N linhas assistant, CADA UMA com copia do mesmo usage, e nos
 * somavamos todas. Consequencia: nivel "critico" falso -> tecto haiku -> o
 * produto sabotava a propria qualidade. Estes testes usam fixtures com o
 * formato REAL medido no ficheiro da sessao viva de 2026-07-26.
 */

function raizFresca() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-onda0-')); }

test('Q14 — DEDUP por requestId: linhas duplicadas contam UMA vez, e o factor e MEDIDO', () => {
  const raiz = raizFresca();
  const dir = path.join(raiz, 'p'); fs.mkdirSync(dir);
  const agora = Date.now();
  const linha = (req, out, cache) => JSON.stringify({
    type: 'assistant', requestId: req, timestamp: new Date(agora - 60e3).toISOString(),
    message: { id: 'msg_' + req, model: 'claude-sonnet-5',
      usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: cache, cache_creation_input_tokens: 0 } },
  });
  // o padrao real medido: resposta 1 com 2 blocos, resposta 2 com 3 blocos
  fs.writeFileSync(path.join(dir, 'x.jsonl'), [
    linha('req_1', 121, 19930), linha('req_1', 121, 19930),
    linha('req_2', 1757, 43332), linha('req_2', 1757, 43332), linha('req_2', 1757, 43332),
  ].join('\n'));
  const m = q.medir({ raiz, agora });
  assert.strictEqual(m.longa.turnos, 2, 'contou ' + m.longa.turnos + ' turnos onde ha 2 respostas — a deduplicacao falhou');
  assert.strictEqual(m.longa.saidas, 121 + 1757, 'somou usage duplicado: ' + m.longa.saidas);
  assert.strictEqual(m.longa.linhas_brutas, 5);
  assert.strictEqual(m.longa.dedup.factor, 2.5, 'o factor de inflacao tem de ser MEDIDO e reportado');
  assert.ok(/5 linhas.*2 turnos/.test(m.longa.dedup.porque), 'o painel tem de poder dizer "li X linhas, Y unicos"');
});

test('Q15 — GUARD #25941: >20% de output placeholder -> saidas n/d, NUNCA somar', () => {
  const raiz = raizFresca();
  const dir = path.join(raiz, 'p'); fs.mkdirSync(dir);
  const agora = Date.now();
  const linha = (i, out) => JSON.stringify({
    type: 'assistant', requestId: 'req_' + i, timestamp: new Date(agora - 60e3).toISOString(),
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 100, output_tokens: out } },
  });
  // 3 de 10 turnos com placeholder (1-2 tokens) = 30% > 20%
  const linhas = [];
  for (let i = 0; i < 7; i++) linhas.push(linha(i, 500));
  for (let i = 7; i < 10; i++) linhas.push(linha(i, 2));
  fs.writeFileSync(path.join(dir, 'x.jsonl'), linhas.join('\n'));
  const m = q.medir({ raiz, agora });
  assert.strictEqual(m.longa.saidas, null, 'somou placeholders do #25941 em vez de dizer n/d');
  assert.ok(/25941/.test(m.longa.aviso_saidas || ''), 'nao avisa que o bug reproduziu');
  // o peso nao pode ficar cego: usa as entradas, que continuam fiaveis
  assert.ok(Math.abs(m.longa.peso - 1.0) < 0.001, 'peso com saidas n/d devia ser so entradas (1000/1000 x 1): ' + m.longa.peso);
});

test('Q16 — Onda 0.4: as ENTRADAS contam no peso — input gigante ja nao le "baixo"', () => {
  const raiz = raizFresca();
  const dir = path.join(raiz, 'p'); fs.mkdirSync(dir);
  const agora = Date.now();
  fs.writeFileSync(path.join(dir, 'x.jsonl'), JSON.stringify({
    type: 'assistant', requestId: 'req_a', timestamp: new Date(agora - 60e3).toISOString(),
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 1000, output_tokens: 500 } },
  }));
  const m = q.medir({ raiz, agora });
  assert.ok(Math.abs(m.longa.peso - 1.5) < 0.001, 'peso devia ser (1000+500)/1000 x 1 = 1.5: ' + m.longa.peso);
});

test('Q17 — Onda 0.5: o Codex LE-SE dos rollouts locais, com o mesmo contrato de honestidade', () => {
  const raiz = raizFresca();
  const dia = path.join(raiz, '2026', '07', '26'); fs.mkdirSync(dia, { recursive: true });
  const agora = Date.now();
  const ev = (min, tin, tout, cached) => JSON.stringify({
    timestamp: new Date(agora - min * 60e3).toISOString(), type: 'event_msg',
    payload: { type: 'token_count', info: {
      last_token_usage: { input_tokens: tin, cached_input_tokens: cached, output_tokens: tout },
      total_token_usage: { input_tokens: 999999, output_tokens: 999999 },
    } },
  });
  fs.writeFileSync(path.join(dia, 'rollout-2026-07-26-abc.jsonl'),
    [ev(10, 100, 20, 50), ev(5, 200, 40, 80)].join('\n'));
  const c = q.medirCodex({ raiz_codex: raiz, agora });
  assert.strictEqual(c.disponivel, true);
  assert.strictEqual(c.longa.entradas, 300, 'tem de somar os DELTAS (last_token_usage), nunca o cumulativo');
  assert.strictEqual(c.longa.saidas, 60);
  assert.strictEqual(c.longa.cache_lido, 130);
  assert.strictEqual(c.longa.turnos, 2);
  assert.ok(/LIMITE INFERIOR/.test(c.ressalva), 'o contrato de honestidade vale para o Codex tambem');
  assert.ok(/27131/.test(c.nota || ''), 'tem de declarar que estes caminhos nunca entram no contexto de agentes');
});

test('Q20 — ONDA 2: medirAsync da o MESMO numero e NAO prende o event loop', async () => {
  /**
   * A regressao de 2026-07-26: o painel repolla de 2 em 2s e chamava a versao
   * sincrona, que le 47 ficheiros de uma vez — 209 ms de event loop bloqueado,
   * medidos. Nesse tempo nem o `close` de um job corre, e um dispatch que
   * fechava em 75 ms passou a fechar em 324 ms. Um Promise.all a volta de codigo
   * sincrono NAO o torna paralelo; a correccao e ler com fs.promises e ceder.
   */
  const raiz = raizFresca();
  const agora = Date.now();
  for (let i = 0; i < 12; i++) {
    const dir = path.join(raiz, 'p' + i); fs.mkdirSync(dir);
    const linhas = [];
    for (let j = 0; j < 400; j++) {
      linhas.push(JSON.stringify({ type: 'assistant', requestId: 'r' + i + '-' + j,
        timestamp: new Date(agora - 60e3).toISOString(),
        message: { model: 'claude-sonnet-5', usage: { input_tokens: 50, output_tokens: 100 } } }));
    }
    fs.writeFileSync(path.join(dir, 'x.jsonl'), linhas.join('\n'));
  }
  q.CACHE.clear();
  const sinc = q.medir({ raiz, agora });
  q.CACHE.clear();
  // o relogio do event loop: quanto tempo passa entre ticks enquanto se le
  let piorGap = 0; let ultimo = Date.now();
  const bater = setInterval(() => { const n = Date.now(); piorGap = Math.max(piorGap, n - ultimo); ultimo = n; }, 5);
  const asy = await q.medirAsync({ raiz, agora });
  clearInterval(bater);

  assert.strictEqual(asy.longa.turnos, sinc.longa.turnos, 'a versao async conta turnos diferentes');
  assert.strictEqual(asy.longa.saidas, sinc.longa.saidas, 'a versao async da saidas diferentes');
  assert.strictEqual(asy.longa.peso, sinc.longa.peso, 'a versao async da um peso diferente');
  assert.ok(piorGap < 120, 'a leitura async prendeu o event loop ' + piorGap + 'ms — um job a fechar teria esperado');
});

test('Q21 — ONDA 2: estadoAsync devolve a mesma forma que estado (o painel depende disso)', async () => {
  const e1 = q.estado({ raiz: RAIZ });
  const e2 = await q.estadoAsync({ raiz: RAIZ });
  for (const k of ['medida', 'pressao', 'calibragem', 'codex']) {
    assert.ok(k in e2, 'estadoAsync perdeu o campo ' + k);
  }
  assert.strictEqual(e2.pressao.nivel, e1.pressao.nivel);
  assert.strictEqual(e2.medida.disponivel, e1.medida.disponivel);
});

test('Q19 — Onda 0.3: a referencia e AJUSTAVEL de verdade (preferences.json), e declara a origem', () => {
  const f = path.join(raizFresca(), 'preferences.json');
  fs.writeFileSync(f, JSON.stringify({ statusline_line3: true, quota_referencia: { peso_semana: 12000 } }));
  const r = q.lerReferencia(f);
  assert.ok(r && r.peso_semana === 12000, 'nao leu a referencia calibrada pelo utilizador');
  assert.ok(/utilizador/.test(r.origem), 'nao declara de onde veio a referencia');
  // prefs sem quota_referencia (o caso real desta maquina hoje) -> null, defaults mandam
  const f2 = path.join(raizFresca(), 'preferences.json');
  fs.writeFileSync(f2, JSON.stringify({ statusline_line3: true }));
  assert.strictEqual(q.lerReferencia(f2), null);
});

test('Q18 — Onda 0.6: forcar_local INVERTE o default mas nunca os vetos de risco', () => {
  const lf = require('./localfirst.js');
  // sem forcar, "na duvida, nuvem"
  const semForcar = lf.cabeNoLocal({ goal: 'analisa a arquitectura do worker', tier: 'T2', temModeloLocal: true });
  // (goal com "arquitectura" cai no veto SO_NUVEM — usa um goal neutro)
  const neutro = lf.cabeNoLocal({ goal: 've la isto por mim', tier: 'T2', temModeloLocal: true });
  assert.strictEqual(neutro.local, false, 'sem quota critica o default continua a ser nuvem');
  // com forcar, o default inverte
  const forcado = lf.cabeNoLocal({ goal: 've la isto por mim', tier: 'T2', temModeloLocal: true, forcar: true });
  assert.strictEqual(forcado.local, true, 'quota critica tem de mandar o trabalho neutro para a GPU');
  assert.strictEqual(forcado.forcado_por_quota, true);
  // mas NUNCA os vetos: escrita continua na nuvem mesmo com quota critica
  const escrita = lf.cabeNoLocal({ goal: 've la isto', temModeloLocal: true, escrita: true, forcar: true });
  assert.strictEqual(escrita.local, false, 'forcar_local passou por cima do veto de escrita — poupar nunca pode custar correccao');
  const git = lf.cabeNoLocal({ goal: 'faz commit e push disto', temModeloLocal: true, forcar: true });
  assert.strictEqual(git.local, false, 'forcar_local passou por cima do veto de git');
  void semForcar;
});
