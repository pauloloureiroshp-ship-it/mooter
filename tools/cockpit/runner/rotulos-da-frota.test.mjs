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

test('um device EM PAUSA nao e um device morto', () => {
  const r = rotuloDeDevice({
    running: false, via: 'disco',
    frescura: { estado: 'morto', idade_s: 900, motivo: 'sem sinal ha 900s' },
    pausa: { activa: true, razao: 'queue full' },
  });
  assert.match(r.texto, /holding · queue full/);
  assert.equal(r.classe, 'warn');
});

test('uma pausa OBSOLETA volta a contar como morte, e di-lo', () => {
  const r = rotuloDeDevice({
    running: false, via: 'disco',
    frescura: { estado: 'morto', idade_s: 300000 },
    pausa: { activa: false, obsoleta: true, idade_s: 300000 },
  });
  assert.match(r.texto, /^dead — was holding/);
  assert.equal(r.classe, 'dead');
});

test('morto sem pausa mostra o MOTIVO, nao a palavra "morto"', () => {
  const r = rotuloDeDevice({ via: 'remoto', frescura: { estado: 'morto', idade_s: 172800, motivo: 'sem sinal ha 172800s' } });
  assert.equal(r.texto, 'sem sinal ha 172800s');
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
