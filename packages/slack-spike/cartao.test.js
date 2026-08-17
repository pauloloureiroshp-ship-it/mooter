'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. Testes da APRESENTACAO.
 *
 * O cartao anterior funcionava e mentia por omissao: o Slack truncava-o com
 * «Mostrar mais» e escondia o custo e o hash — a prova. Estes testes guardam a
 * hierarquia, o formato do dinheiro, e o que NUNCA aparece.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const c = require('./cartao.js');
const { criarPublicador } = require('./publicar.js');
const { criarTransporte } = require('./transporte.js');
const gate = require('./gate.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HASH = 'ae0ab4486f8d8a0482f434b46b665795b14603d390f0fca8132fd9ae75805ef6';

const pendente = (extra) => Object.assign({
  tipo: 'pendente', job_id: 'job-msxato7q-cd23', wave: 'slack-spike',
  autor: { valor: 'slack:U0BGS8N8JFL', rotulo: 'autor' },
  motor: { valor: 'cc' },
  modelo: { valor: 'claude-haiku-4-5-20251001' },
  custo: { valor: 0.1372512, fonte: 'reportado pelo CLI', estimativa: false },
  diff_stat: { valor: null, porque: 'CORTADO no Dia 0: files_touched nunca preenchido' },
  hash_esperado: HASH, accoes: ['aprovar', 'recusar'], texto: 'aprova ou recusa este pedido',
}, extra || {});

const strings = (x, acc = []) => {
  if (typeof x === 'string') acc.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, acc));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, acc));
  return acc;
};
const tudo = (blocos) => strings(blocos).join('\n');
const bloco = (blocos, tipo) => blocos.find((b) => b.type === tipo);

// ── dinheiro ────────────────────────────────────────────────────────────────
test('dinheiro · 0.1372512 do ledger sai como $0,14 — ninguem le dinheiro com 7 decimais', () => {
  // `$` sozinho le-se REAIS em Sao Paulo, onde o dono le isto: 5x o valor.
  assert.equal(c.dinheiro({ valor: 0.1372512, fonte: 'reportado pelo CLI' }).texto, 'US$ 0,14');
  assert.equal(c.dinheiro({ valor: 1204.5, fonte: 'reportado pelo CLI' }).texto, 'US$ 1.204,50');
});

test('dinheiro · menos de um centimo NAO arredonda para $0,00 (leria-se como gratis)', () => {
  const f = 'reportado pelo CLI';
  assert.equal(c.dinheiro({ valor: 0.0001, fonte: f }).texto, 'menos de US$ 0,01');
  assert.equal(c.dinheiro({ valor: 0, fonte: f }).texto, 'US$ 0,00');
});

test('dinheiro · sem valor NUNCA sai um numero, sai n/d com a razao', () => {
  const d = c.dinheiro({ valor: null, porque: 'sem fonte no ledger' });
  assert.equal(d.texto, 'n/d');
  assert.match(d.sufixo, /sem fonte/);
});

test('dinheiro · uma estimativa vem ROTULADA como estimativa', () => {
  const d = c.dinheiro({ valor: 1.5, fonte: 'calculado a partir de tokens e tabela de precos' });
  assert.equal(d.texto, 'US$ 1,50');
  assert.match(d.sufixo, /^ESTIMATIVA/);
});

// ── identidade ──────────────────────────────────────────────────────────────
test('mencaoDeActor · o id opaco vira mencao que o Slack renderiza como o nome', () => {
  assert.equal(c.mencaoDeActor('slack:U0BGS8N8JFL'), '<@U0BGS8N8JFL>');
});

test('mencaoDeActor · um actor que nao vem do Slack fica texto simples (nao se inventa gente)', () => {
  assert.equal(c.mencaoDeActor('system'), 'system');
  assert.equal(c.mencaoDeActor(null), 'n/d');
});

test('modeloCurto · tira a data do fim do id do modelo', () => {
  assert.equal(c.modeloCurto({ valor: 'claude-haiku-4-5-20251001' }), 'claude-haiku-4-5');
  assert.equal(c.modeloCurto({ valor: null }), 'n/d');
});

test('hashCurto · 8 chars e um reticencias — 64 nao cabem num telemovel', () => {
  assert.equal(c.hashCurto(HASH), 'ae0ab4486f8d…');
  assert.equal(c.impressaoCompleta(HASH), HASH, 'os 64 chars completos sao a prova no cartao');
  assert.equal(c.hashCurto(null), 'n/d');
});

// ── a hierarquia do cartao ──────────────────────────────────────────────────
test('cartao · o CUSTO e o QUEM PEDIU estao em fields no topo, nao depois do corte', () => {
  const { blocos } = c.construir(pendente());
  // o comportamento de `fields` em ecra estreito NAO esta documentado pelo Slack,
  // por isso o numero que DECIDE tem section propria de largura inteira
  const dinheiro = blocos.find((b) => b.type === 'section' && b.text && /US\$ 0,14/.test(b.text.text));
  assert.ok(dinheiro, 'o custo devia ter section propria');
  assert.ok(blocos.indexOf(dinheiro) < blocos.findIndex((b) => b.type === 'actions'));
  const campos = blocos.find((b) => b.fields);
  assert.ok(!/US\$/.test(tudo(campos.fields)), 'o custo nao pode viver em fields');
  assert.match(tudo(campos.fields), /<@U0BGS8N8JFL>/);
});

test('cartao · nenhum bloco de texto passa o limite que faz aparecer «Mostrar mais»', () => {
  const { blocos } = c.construir(pendente());
  for (const b of blocos) {
    const t = (b.text && b.text.text) || '';
    assert.ok(t.length <= c.LIMITE_SECTION,
      'bloco ' + b.type + ' com ' + t.length + ' chars — o Slack vai truncar a prova');
    for (const f of (b.fields || [])) {
      assert.ok(f.text.length <= c.LIMITE_SECTION, 'field longo demais: ' + f.text.length);
    }
  }
});

test('cartao · a justificacao interna do diff-stat NAO vai para o cartao', () => {
  const { blocos } = c.construir(pendente());
  const t = tudo(blocos);
  assert.ok(!t.includes('CORTADO no Dia 0'), 'a razao interna do corte vazou para a UI');
  assert.match(t, /ficheiros alterados: não declarados/,
    'mas diz-se que nao ha, para o sistema nao parecer que esconde');
});

test('cartao · tem cabecalho e rodape de contexto, e o hash vive no rodape', () => {
  const { blocos } = c.construir(pendente());
  assert.ok(bloco(blocos, 'header'), 'sem header o cartao nao se distingue de uma mensagem');
  const h = bloco(blocos, 'header');
  assert.equal(h.text.type, 'plain_text', 'o header do Slack nao aceita markdown');
  assert.match(h.text.text, /cd23/, 'o sufixo do job e o que distingue dois cartoes ao relance');
  const ctx = blocos.filter((b) => b.type === 'context').pop();
  assert.ok(ctx.elements.length >= 2, 'o rodape sao elements separados, nao uma string corrida');
  assert.match(tudo(blocos), /job-msxato7q-cd23/);
});

test('cartao · o texto de topo e a NOTIFICACAO: curta, com custo, sem hash e sem conteudo', () => {
  const { texto } = c.construir(pendente());
  assert.match(texto, /US\$ 0,14/);
  assert.ok(texto.length <= 100, 'a notificacao tem de ser curta: ' + texto.length);
  assert.ok(!texto.includes('\n'), 'o push e UMA linha');
  assert.ok(!texto.includes(HASH.slice(0, 8)), 'o hash nao serve para nada num push');
});

// ── os botoes ───────────────────────────────────────────────────────────────
test('botoes · APROVAR pede confirmacao (num telemovel um toque errado gasta dinheiro)', () => {
  const acc = bloco(c.construir(pendente()).blocos, 'actions');
  const aprovar = acc.elements.find((e) => e.action_id === c.ACCOES.aprovar);
  const recusar = acc.elements.find((e) => e.action_id === c.ACCOES.recusar);
  assert.ok(aprovar.confirm, 'aprovar sem confirmacao e um toque acidental pago');
  assert.match(aprovar.confirm.text.text, /US\$ 0,14/, 'a confirmacao diz quanto custa');
  assert.match(aprovar.confirm.text.text, /tecto de custo/, 'e que nao ha tecto para o que vem');
  assert.ok(!recusar.style, 'o recusar nao compete com o primario');
  assert.ok(!recusar.confirm, 'recusar por engano nao gasta nada — nao se poe atrito');
});

test('botoes · levam job_id, accao e hash — e mais nada', () => {
  const acc = bloco(c.construir(pendente()).blocos, 'actions');
  for (const e of acc.elements) {
    assert.deepEqual(Object.keys(JSON.parse(e.value)).sort(), ['a', 'h', 'j']);
  }
});

test('botoes · sem hash_esperado nao ha botoes (um botao sem CAS decide as cegas)', () => {
  const { blocos } = c.construir(pendente({ hash_esperado: null }));
  assert.equal(bloco(blocos, 'actions'), undefined);
  assert.equal(bloco(blocos, 'divider'), undefined, 'sem botoes o divider fica orfao');
});

// ── a decisao ───────────────────────────────────────────────────────────────
test('decisao · REJECTED tem rosto proprio, diz quem decidiu, e NAO tem botoes', () => {
  const { blocos } = c.construir({ tipo: 'decisao', job_id: 'job-1', estado: 'REJECTED',
    autor: { valor: 'slack:U0BGS8N8JFL' }, texto: 'recusado por quem decide',
    auditoria: 'request=job-1 · veredicto=recusar' });
  const t = tudo(blocos);
  assert.match(t, /❌/);
  assert.match(t, /Recusado/);
  assert.match(t, /<@U0BGS8N8JFL>/);
  assert.match(t, /🧾 registado no ledger: request=job-1/, 'a auditoria e a prova');
  assert.equal(bloco(blocos, 'actions'), undefined, 'um pedido decidido nao oferece botoes');
});

test('decisao · STALE mostra os DOIS hashes e diz que o pedido CONTINUA a espera', () => {
  const { blocos } = c.construir({ tipo: 'decisao', job_id: 'job-1', estado: 'STALE',
    hash_esperado: HASH, hash_actual: 'ffffffff' + HASH.slice(8) });
  const t = tudo(blocos);
  assert.match(t, /ae0ab4486f8d…/, 'falta a impressao do cartao');
  assert.match(t, /ffffffff6f8d…/, 'falta a impressao actual');
  assert.ok(!/US\$/.test(t), 'um STALE nao cobrou nada — nao se mostra dinheiro');
  assert.match(t, /continua/i, 'o utilizador tem de saber que nao perdeu o pedido');
});

// ── a porta de saida varre a ARVORE, nao so o texto ─────────────────────────
test('publicar · um nome de segredo dentro de um BLOCO e limpo (nao so no texto de topo)', () => {
  const pub = criarPublicador({ dryRun: true });
  // a `auditoria` E renderizada (no rodape da decisao) e e construida pelo adapter
  // a partir de campos do ledger — e por isso o vector real, nao um teste de laboratorio
  const r = pub.publicar({ tipo: 'decisao', job_id: 'j', estado: 'REJECTED',
    auditoria: 'request=j · veredicto=recusar · falhou a ler segredo.env' });
  assert.equal(r.publicado, true);
  const t = tudo(r.blocos) + r.texto;
  assert.ok(t.includes('request=j'), 'a auditoria tem de sair — e a prova');
  assert.ok(!t.includes('segredo.env'), 'o nome do segredo saiu dentro de um bloco');
  assert.deepEqual(r.removidos, ['segredo.env']);
});

test('publicar · um estado DESCONHECIDO nao fica sem explicacao (o texto do adapter sai)', () => {
  const pub = criarPublicador({ dryRun: true });
  const r = pub.publicar({ tipo: 'decisao', job_id: 'j', estado: 'LOCKED',
    texto: 'sem decisao: lock tomado por outro processo' });
  assert.equal(r.publicado, true);
  assert.match(tudo(r.blocos), /lock tomado por outro processo/);
});

test('publicar · devolve blocos E texto, e o texto continua a ser o fallback curto', () => {
  const pub = criarPublicador({ dryRun: true });
  const r = pub.publicar(pendente());
  assert.ok(Array.isArray(r.blocos) && r.blocos.length >= 3);
  assert.match(r.texto, /Aprovação pendente/);
});

test('publicar · a allowlist de campos continua a mandar (a UI nova nao a alargou)', () => {
  const pub = criarPublicador({ dryRun: true });
  const r = pub.publicar(Object.assign(pendente(), { goal: 'arruma os testes' }));
  assert.equal(r.publicado, false);
  assert.match(r.porque, /fora da allowlist/);
});

// ── chat.update: a decisao substitui o cartao no lugar ──────────────────────
function comSyncDestravado() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-cartao-'));
  const p = path.join(d, 'SYNC.md');
  fs.writeFileSync(p, '# SYNC\n\n' + gate.LINHA_DESTRAVE + '\n');
  return p;
}

test('chat.update · a decisao ACTUALIZA o cartao em vez de publicar outra mensagem', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  await tr.enviar('Aprovação pendente', { tipo: 'pendente', job_id: 'job-7' }, [{ type: 'divider' }]);
  assert.equal(tr.enviados[0].metodo, 'chat.postMessage');

  await tr.enviar('Recusado', { tipo: 'decisao', job_id: 'job-7', estado: 'REJECTED' }, [{ type: 'divider' }]);
  assert.equal(tr.enviados[1].metodo, 'chat.update', 'a decisao devia substituir o cartao');
  assert.ok(tr.enviados[1].corpo.ts, 'um chat.update sem ts nao actualiza nada');
});

test('chat.update · sem cartao publicado, a decisao publica mensagem normal (nao se inventa ts)', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  await tr.enviar('Recusado', { tipo: 'decisao', job_id: 'job-orfao', estado: 'REJECTED' }, []);
  assert.equal(tr.enviados[0].metodo, 'chat.postMessage');
});

test('chat.update · decidido uma vez, o cartao deixa de ser actualizavel (nao se reescreve historia)', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  await tr.enviar('pendente', { tipo: 'pendente', job_id: 'job-7' }, []);
  await tr.enviar('decisao', { tipo: 'decisao', job_id: 'job-7', estado: 'REJECTED' }, []);
  await tr.enviar('outra', { tipo: 'decisao', job_id: 'job-7', estado: 'APPROVED' }, []);
  assert.deepEqual(tr.enviados.map((e) => e.metodo),
    ['chat.postMessage', 'chat.update', 'chat.postMessage']);
});

test('transporte · usa os blocos que a PORTA aprovou, nao uns que ele proprio invente', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  const meus = [{ type: 'section', text: { type: 'mrkdwn', text: 'exactamente isto' } }];
  await tr.enviar('fallback', { tipo: 'estado' }, meus);
  assert.deepEqual(tr.enviados[0].corpo.blocks, meus);
});

// ── o STALE nao pode consumir o cartao ─────────────────────────────────────
// Um STALE nao e decisao: o pedido CONTINUA a espera. Substituir o cartao por um
// aviso sem botoes deixava o pendente indecidivel — o utilizador perdia a unica
// forma de decidir sobre um pedido ainda vivo.
test('STALE · NAO actualiza o cartao no lugar (senao o pendente fica indecidivel)', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  await tr.enviar('pendente', { tipo: 'pendente', job_id: 'job-7' }, []);
  await tr.enviar('stale', { tipo: 'decisao', job_id: 'job-7', estado: 'STALE',
    hash_esperado: HASH, hash_actual: 'ffff' }, []);
  assert.deepEqual(tr.enviados.map((e) => e.metodo), ['chat.postMessage', 'chat.postMessage']);
  assert.ok(tr.cartoes.has('job-7'), 'o cartao tem de continuar vivo e clicavel apos um STALE');
});

test('STALE · e depois de um STALE uma decisao FINAL ainda actualiza o cartao', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  await tr.enviar('pendente', { tipo: 'pendente', job_id: 'job-7' }, []);
  await tr.enviar('stale', { tipo: 'decisao', job_id: 'job-7', estado: 'STALE' }, []);
  await tr.enviar('recusado', { tipo: 'decisao', job_id: 'job-7', estado: 'REJECTED' }, []);
  assert.equal(tr.enviados[2].metodo, 'chat.update');
});

test('ESTADOS_FINAIS · o STALE nao esta la, e os que fecham estao', () => {
  const { ESTADOS_FINAIS } = require('./transporte.js');
  assert.ok(!ESTADOS_FINAIS.includes('STALE'));
  assert.ok(ESTADOS_FINAIS.includes('APPROVED') && ESTADOS_FINAIS.includes('REJECTED'));
});

// ── barreira 4: prosa a entrar por uma folha nao validada ──────────────────
// A allowlist de campos e de profundidade 1: valida NOMES no topo, e as folhas
// (`fonte`, `porque`) sao texto livre do ledger. Uma frase inteira atravessava
// tudo o resto — nao e nome de segredo nem campo proibido, e apenas comprida.
test('barreira 4 · uma folha com prosa longa RECUSA o cartao (nao se trunca)', () => {
  const pub = criarPublicador({ dryRun: true });
  const r = pub.publicar(pendente({
    custo: { valor: null, porque: 'x'.repeat(400) },   // `porque` e renderizado no rodape
  }));
  assert.equal(r.publicado, false);
  assert.match(r.porque, /prosa a entrar/);
});

test('barreira 4 · um cartao normal passa folgadamente (a barreira nao estorva)', () => {
  const pub = criarPublicador({ dryRun: true });
  assert.equal(pub.publicar(pendente()).publicado, true);
});

// ── copy: as tres ALTO das lentes de UX ────────────────────────────────────
test('copy · a CONSEQUENCIA de cada botao esta no cartao, antes do toque', () => {
  const t = tudo(c.construir(pendente()).blocos);
  assert.match(t, /Aprovar\* retoma o trabalho pago/, 'aprovar sem consequencia declarada');
  assert.match(t, /Recusar\* deixa-o parado/, 'recusar sem consequencia declarada');
  assert.match(t, /nada mais é cobrado/, 'recusar tem de se ler como recuperavel');
});

test('copy · a palavra «estado» NAO rotula o hash (tinha 3 sentidos no mesmo ecra)', () => {
  const t = tudo(c.construir(pendente()).blocos);
  assert.ok(!/estado `/.test(t), 'o hash nao se chama «estado»: colide com APPROVED/REJECTED');
  assert.match(t, /Impressão do pedido/, 'o hash precisa de um substantivo proprio');
});

test('copy · o STALE tambem chama impressao aos dois hashes', () => {
  const t = tudo(c.construir({ tipo: 'decisao', job_id: 'j', estado: 'STALE',
    hash_esperado: HASH, hash_actual: 'ffffffff' + HASH.slice(8) }).blocos);
  assert.match(t, /Impressão no cartão/);
  assert.match(t, /Impressão agora/);
});

// ── vocabulario FECHADO da procedencia do custo ────────────────────────────
// Esta guarda existia sem teste: uma mutacao que a desligava passava verde.
test('fonte · procedencia NAO reconhecida => o numero NAO sai', () => {
  const d = c.dinheiro({ valor: 9.99, fonte: 'vindo de sitio nenhum' });
  assert.equal(d.texto, 'n/d', 'um numero sem procedencia reconhecida e um numero sem procedencia');
  assert.match(d.sufixo, /procedência não reconhecida/);
});

test('fonte · o vocabulario e um mapa, e o valor CRU do ledger nunca se imprime', () => {
  assert.equal(c.fonteLegivel('reportado pelo CLI'),
    'valor informado pelo próprio motor · não verificado por nós');
  assert.equal(c.fonteLegivel('inferência local sem custo de API'),
    'execução local, sem custo de API');
  assert.match(c.fonteLegivel('calculado a partir de tokens e tabela de precos'), /^ESTIMATIVA/);
  assert.equal(c.fonteLegivel('qualquer outra coisa'), null);
  // e no cartao: a string crua do ledger nao aparece
  const t = tudo(c.construir(pendente()).blocos);
  assert.ok(!t.includes('reportado pelo CLI'), 'o valor cru do ledger nao se imprime');
});

test('fonte · sem procedencia reconhecida, o CARTAO mostra n/d e nao um numero', () => {
  const t = tudo(c.construir(pendente({
    custo: { valor: 12.5, fonte: 'inventada' } })).blocos);
  assert.ok(!t.includes('12,5') && !t.includes('12.5'), 'o numero saiu sem procedencia');
  assert.match(t, /n\/d/);
});

test('motor · o codigo do ledger vira algo que um estranho entende', () => {
  assert.equal(c.motorLegivel({ valor: 'cc' }), 'agente Claude Code');
  assert.equal(c.motorLegivel({ valor: 'moo' }), 'modelo local (a tua GPU)');
  // ⚠️ este teste AFIRMAVA o bug. Dizia «um motor desconhecido nao se inventa: sai
  // como esta» — e «sair como esta» era exactamente o vazamento: qualquer string no
  // campo `agent` do ledger ia inteira para o Slack. Fora do mapa e n/d.
  assert.equal(c.motorLegivel({ valor: 'vendor-novo' }), 'n/d');
  assert.equal(c.motorLegivel({ valor: 'PROSA ARBITRARIA DO LEDGER' }), 'n/d');
});

// ── o canario do critico externo (codex, 2026-08-17) ──────────────────────
// A claim central do spike — «conteudo do utilizador nunca sai» — foi REFUTADA
// com um canario curto numa folha permitida. As 4 barreiras validavam campos de
// topo, nomes de segredos e comprimento; nenhuma olhava para o VALOR de `modelo`.
test('canario · prosa no campo `modelo` NAO atravessa (era o vector do codex)', () => {
  const canario = 'CANARY-CONTENT-o-utilizador-pediu-para-ler-o-ficheiro-de-contas';
  const r = criarPublicador({ dryRun: true }).publicar(pendente({ modelo: { valor: canario } }));
  assert.equal(r.publicado, true, 'o cartao continua a sair — o que nao sai e a prosa');
  assert.ok(!JSON.stringify(r).includes('CANARY'), 'a claim de nao-egress volta a estar refutada');
});

test('canario · prosa no campo `motor` tambem nao', () => {
  const r = criarPublicador({ dryRun: true })
    .publicar(pendente({ motor: { valor: 'CANARY-MOTOR-prosa do ledger' } }));
  assert.ok(!/canary/i.test(JSON.stringify(r)));
});

test('gramatica · um id de modelo REAL continua a passar (a guarda nao estorva)', () => {
  for (const m of ['claude-haiku-4-5-20251001', 'gemma4:e4b', 'claude-opus-5', 'qwen2.5-coder:7b']) {
    assert.notEqual(c.modeloCurto({ valor: m }), 'n/d', 'bloqueou um modelo legitimo: ' + m);
  }
});

// ── A LIGACAO, nao as pecas ────────────────────────────────────────────────
// O bug que os outros 168 testes nao viam: `publicar()` construia o cartao e a raiz
// de composicao chamava `enviar(texto, p)` sem o 3o argumento. Os blocos morriam ali
// e o Slack recebia UMA LINHA. Nada falhava — so ficava pobre. Este teste liga o
// publicador ao transporte exactamente como o `correr.js` o faz.
test('composicao · o que chega ao Slack e o CARTAO, nao a linha de fallback', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  // A LIGACAO REAL, importada do correr.js — nao uma copia do padrao dela.
  // (A 1a versao deste teste replicava a ligacao, e por isso tambem nao apanhava
  //  o bug: repor o bug em correr.js deixava o teste verde.)
  const pub = require('./correr.js').ligarPublicadorAoTransporte(tr, () => {});
  pub.publicar(pendente());
  await new Promise((r) => setImmediate(r));

  const corpo = tr.enviados[0].corpo;
  const tipos = corpo.blocks.map((b) => b.type);
  assert.ok(tipos.includes('header'), 'chegou sem header: ' + tipos.join(','));
  assert.ok(tipos.includes('actions'), 'chegou sem botoes');
  assert.ok(tipos.includes('context'), 'chegou sem rodape');
  assert.ok(corpo.blocks.length >= 5,
    'so ' + corpo.blocks.length + ' bloco(s) — isto e o caminho de fallback, nao o cartao');
  const todo = tudo(corpo.blocks);
  assert.match(todo, /US\$ 0,14/, 'o custo nao chegou');
  assert.match(todo, /Impressão do pedido/, 'a impressao nao chegou');
  assert.match(todo, /retoma o trabalho pago/, 'a consequencia nao chegou');
});

test('composicao · a decisao tambem chega como cartao, e substitui no lugar', async () => {
  const tr = criarTransporte({ canal: 'C', syncPath: comSyncDestravado(), dryRun: true });
  const pub = require('./correr.js').ligarPublicadorAoTransporte(tr, () => {});
  pub.publicar(pendente());
  await new Promise((r) => setImmediate(r));
  pub.publicar({ tipo: 'decisao', job_id: 'job-msxato7q-cd23', estado: 'APPROVED',
    autor: { valor: 'slack:U0BGS8N8JFL' }, auditoria: 'request=job-msxato7q-cd23' });
  await new Promise((r) => setImmediate(r));

  assert.equal(tr.enviados[1].metodo, 'chat.update');
  const tipos = tr.enviados[1].corpo.blocks.map((b) => b.type);
  assert.ok(tipos.includes('header'), 'a decisao chegou sem cartao: ' + tipos.join(','));
  assert.ok(!tipos.includes('actions'), 'um pedido decidido nao oferece botoes');
});
