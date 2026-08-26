/**
 * rotulos-da-frota.test.mjs — o teste que o painel nunca teve.
 *
 * O caso central e o primeiro: o cenario EXACTO de 2026-08-24, em que o chip
 * dizia "1 min ago" e o ficheiro no disco tinha dois dias. Os dois estavam
 * certos; o que faltava era o painel dizer por que canal a idade chegou.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rotuloDeCanal, rotuloDeDevice, emIdade, avisoDaFrota, anotarFrota,
} from './rotulos-da-frota.mjs';

// ── o caso de 2026-08-24 ────────────────────────────────────────────────────

test('"1 min ago" vindo do REMOTO diz que veio do remoto', () => {
  // O que `readBeacons` devolve quando o `origin/<branch>` ganha ao disco.
  const d = {
    device: 'desktop-j26409q', self: false, running: true, via: 'remoto',
    frescura: { estado: 'vivo', idade_s: 62, motivo: null },
  };
  const r = rotuloDeDevice(d);
  assert.equal(r.texto, '1 min ago');
  assert.match(r.canal, /origin/,
    'sem isto, uma linha alimentada pelo origin/main e indistinguivel de uma lida do disco');
  assert.equal(r.sufixo, r.canal, 'o canal aparece SEM ser preciso passar o rato');
  assert.match(r.titulo, /idade 62s/);
});

test('a MESMA idade pelo disco tem um canal diferente — e e essa a diferenca toda', () => {
  const base = { device: 'x', self: false, running: true, frescura: { estado: 'vivo', idade_s: 62 } };
  const remoto = rotuloDeDevice({ ...base, via: 'remoto' });
  const disco = rotuloDeDevice({ ...base, via: 'disco' });
  assert.equal(remoto.texto, disco.texto, 'o texto do chip e o mesmo…');
  assert.notEqual(remoto.canal, disco.canal, '…e por isso o canal TEM de os distinguir');
  assert.match(disco.canal, /pull ~10 min/);
});

test('o ciclo esta no rotulo — "via vault" sozinho nao explicava nada', () => {
  assert.match(rotuloDeCanal('disco'), /~10 min/);
  assert.match(rotuloDeCanal('remoto'), /~2 min/);
});

test('esta maquina nao tem canal nenhum — le-se do proprio disco', () => {
  const r = rotuloDeDevice({ device: 'mac', self: true, running: true, via: 'disco',
    frescura: { estado: 'vivo', idade_s: 3 } });
  assert.match(r.canal, /esta maquina/);
  assert.equal(r.sufixo, null, 'o canal da propria maquina seria ruido em cada linha');
});

test('via ausente e "n/d", nunca um canal inventado', () => {
  assert.equal(rotuloDeCanal(undefined), 'canal n/d');
  assert.equal(rotuloDeCanal('outra-coisa'), 'canal n/d');
});

// ── os estados do chip ──────────────────────────────────────────────────────

test('vivo mas parado le-se "paused", nao uma idade', () => {
  const r = rotuloDeDevice({ running: false, via: 'disco', frescura: { estado: 'vivo', idade_s: 4 } });
  assert.equal(r.texto, 'paused');
  assert.equal(r.classe, 'warn');
});

/**
 * ⚠️ ESTES TRES TESTES MUDARAM A 2026-08-26, ao fundir o #396 com o `main`.
 *
 * O primeiro afirmava, com um beacon de 900 s, que `pausa.activa` bastava para
 * pintar `holding` a laranja. Isso e EXACTAMENTE o defeito que o #401 mediu e
 * fechou no mesmo dia em que este ficheiro nasceu: o PC aparecia laranja a dizer
 * `holding`, sem idade nenhuma, com o beacon a 3592 s.
 *
 * A razao esta no que `pausa.activa` quer dizer: e uma afirmacao SOBRE O INSTANTE
 * EM QUE O BEACON FOI ESCRITO. Com `DEAD_AFTER_S = 300`, um beacon de 900 s ja
 * esta morto — logo a frase que ele carrega e "ha 15 minutos este device estava
 * em pausa", e nao "este device esta em pausa". Nao chega o `pausa.obsoleta`:
 * esse mede a idade da PAUSA, nao a do BEACON, e um device que morreu com uma
 * pausa acabada de declarar tem a pausa fresca e o sinal morto.
 *
 * O nucleo do teste antigo continua verdadeiro e continua coberto — um device
 * em pausa com o beacon FRESCO nao pode pintar-se de morto. Passou a ser o caso
 * explicito abaixo, em vez de um efeito colateral do caso do beacon morto.
 */

test('pausa com beacon FRESCO: obedecer ao escalonador nao e estar avariado', () => {
  const r = rotuloDeDevice({
    running: false, via: 'disco',
    frescura: { estado: 'stale', idade_s: 90, motivo: 'sem sinal ha 90s' },
    pausa: { activa: true, razao: 'queue full' },
  });
  assert.match(r.texto, /holding · queue full/);
  assert.equal(r.classe, 'warn', 'um device obediente nao se pinta de morto');
});

test('pausa com beacon MORTO: a idade e a manchete, a pausa desce a contexto', () => {
  const r = rotuloDeDevice({
    running: false, via: 'disco',
    frescura: { estado: 'morto', idade_s: 900, motivo: 'sem sinal ha 900s' },
    pausa: { activa: true, razao: 'queue full' },
  });
  assert.match(r.texto, /^no signal for 15 min/, 'a idade primeiro, e a idade REAL');
  assert.match(r.texto, /was holding \(queue full\)/, 'o que fazia nao se apaga');
  assert.equal(r.classe, 'dead', 'um sinal morto nao pode pintar-se de laranja');
});

test('uma pausa OBSOLETA volta a contar como morte, e di-lo', () => {
  const r = rotuloDeDevice({
    running: false, via: 'disco',
    frescura: { estado: 'morto', idade_s: 300000 },
    pausa: { activa: false, obsoleta: true, idade_s: 300000 },
  });
  assert.equal(r.classe, 'dead');
  // O texto mudou de forma (a idade passou a manchete), mas a exigencia do teste
  // antigo mantem-se inteira: morreu EM PAUSA e o cartao tem de o dizer. Um
  // runner que morreu a espera de triagem pede outra coisa ao dono do que um que
  // morreu a trabalhar.
  assert.match(r.texto, /^no signal for/);
  assert.match(r.texto, /was holding/, 'morrer em pausa nao pode ler-se igual a morrer a trabalhar');
});

test('morto sem pausa mostra a IDADE legivel, nao a palavra "morto" nem segundos crus', () => {
  const r = rotuloDeDevice({ via: 'remoto', frescura: { estado: 'morto', idade_s: 172800, motivo: 'sem sinal ha 172800s' } });
  assert.equal(r.classe, 'dead');
  assert.doesNotMatch(r.texto, /morto/, 'a exigencia original: nunca a palavra crua');
  // E a segunda metade, que o teste antigo nao cobria: `sem sinal ha 172800s` era
  // o motivo cru do motor. 172800 segundos nao e uma coisa que se leia — o #401
  // exigiu "a idade REAL medida", e ler e parte de ser real.
  assert.equal(r.texto, 'no signal for 48 h');
  assert.doesNotMatch(r.texto, /172800/, 'segundos crus nao sao uma idade legivel');
});

test('morto SEM idade nenhuma cai no motivo — nunca inventa um numero', () => {
  const r = rotuloDeDevice({ via: 'remoto', frescura: { estado: 'morto', idade_s: null, motivo: 'no receipt' } });
  assert.equal(r.texto, 'no signal — no receipt');
  assert.equal(r.classe, 'dead');
});

test('stale e aviso, nao morte', () => {
  const r = rotuloDeDevice({ via: 'disco', frescura: { estado: 'stale', idade_s: 400, motivo: 'sem sinal ha 400s' } });
  assert.equal(r.classe, 'warn');
});

test('um device vazio nao rebenta o painel', () => {
  const r = rotuloDeDevice(undefined);
  assert.equal(r.texto, 'n/d');
  assert.equal(r.classe, 'dead');
  assert.equal(r.canal, 'canal n/d');
});

test('emIdade mantem exactamente o formato que o painel ja usava', () => {
  assert.equal(emIdade(45), '45s');
  assert.equal(emIdade(62), '1 min');
  assert.equal(emIdade(7200), '2 h');
  assert.equal(emIdade(null), 'n/a');
});

// ── o aviso do rodape ───────────────────────────────────────────────────────

test('o aviso diz o que aconteceu ao FETCH, nao so que ha um remoto', () => {
  const a = avisoDaFrota({ aviso: 'a frescura vale o que o fetch valer',
    remoto: { ref: 'origin/main', fetch: 'feito', porque: null } });
  assert.match(a, /fetch feito/);
  assert.match(a, /origin\/main/);
});

test('um fetch FALHADO nao pode ficar calado — seria frescura afirmada sem ser medida', () => {
  const a = avisoDaFrota({ aviso: 'x', remoto: { ref: 'origin/main', fetch: 'falhou: host unreachable' } });
  assert.match(a, /fetch falhou: host unreachable/);
});

test('sem remoto, o aviso di-lo em vez de o omitir', () => {
  assert.match(avisoDaFrota({ aviso: 'x' }), /sem remoto/);
});

// ── a anotacao ──────────────────────────────────────────────────────────────

test('anotarFrota acrescenta o rotulo sem mexer em mais nada', () => {
  const fleet = {
    frota: [{ device: 'a', via: 'remoto', running: true, frescura: { estado: 'vivo', idade_s: 62 } }],
    rejeitados: [], autenticacao: { prova_frota: false }, aviso: 'x',
    remoto: { ref: 'origin/main', fetch: 'feito' },
  };
  const out = anotarFrota(fleet);
  assert.equal(out.frota[0].device, 'a', 'os campos originais sobrevivem');
  assert.deepEqual(out.autenticacao, fleet.autenticacao);
  assert.equal(out.frota[0].rotulo.texto, '1 min ago');
  assert.match(out.aviso_completo, /fetch feito/);
});

test('anotarFrota nao rebenta com uma frota ausente', () => {
  assert.deepEqual(anotarFrota({}), {});
  assert.deepEqual(anotarFrota(null), {});
});
