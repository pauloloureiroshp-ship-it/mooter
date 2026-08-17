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
  assert.equal(c.dinheiro({ valor: 0.1372512, fonte: 'reportado pelo CLI' }).texto, '$0,14');
});

test('dinheiro · menos de um centimo NAO arredonda para $0,00 (leria-se como gratis)', () => {
  assert.equal(c.dinheiro({ valor: 0.0001, fonte: 'x' }).texto, '< $0,01');
  assert.equal(c.dinheiro({ valor: 0, fonte: 'x' }).texto, '$0,00');
});

test('dinheiro · sem valor NUNCA sai um numero, sai n/d com a razao', () => {
  const d = c.dinheiro({ valor: null, porque: 'sem fonte no ledger' });
  assert.equal(d.texto, 'n/d');
  assert.match(d.sufixo, /sem fonte/);
});

test('dinheiro · uma estimativa vem ROTULADA como estimativa', () => {
  const d = c.dinheiro({ valor: 1.5, fonte: 'calculado a partir de tokens', estimativa: true });
  assert.equal(d.texto, '$1,50');
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
  assert.equal(c.hashCurto(HASH), 'ae0ab448…');
  assert.equal(c.hashCurto(null), 'n/d');
});

// ── a hierarquia do cartao ──────────────────────────────────────────────────
test('cartao · o CUSTO e o QUEM PEDIU estao em fields no topo, nao depois do corte', () => {
  const { blocos } = c.construir(pendente());
  const campos = blocos.find((b) => b.type === 'section' && b.fields);
  assert.ok(campos, 'devia haver um bloco de fields');
  const texto = tudo(campos.fields);
  assert.match(texto, /\$0,14/);
  assert.match(texto, /<@U0BGS8N8JFL>/);
  // e vem ANTES do bloco de accoes
  assert.ok(blocos.indexOf(campos) < blocos.findIndex((b) => b.type === 'actions'));
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
  assert.match(t, /ficheiros: n\/d/, 'mas o n/d fica, para o sistema nao parecer que esconde');
});

test('cartao · tem cabecalho e rodape de contexto, e o hash vive no rodape', () => {
  const { blocos } = c.construir(pendente());
  assert.ok(bloco(blocos, 'header'), 'sem header o cartao nao se distingue de uma mensagem');
  const ctx = blocos.filter((b) => b.type === 'context').pop();
  assert.ok(ctx);
  assert.match(ctx.elements[0].text, /ae0ab448…/);
  assert.match(ctx.elements[0].text, /job-msxato7q-cd23/);
});

test('cartao · o texto de topo e a NOTIFICACAO: curta, com custo, sem hash e sem conteudo', () => {
  const { texto } = c.construir(pendente());
  assert.match(texto, /\$0,14/);
  assert.ok(texto.length < 90, 'a notificacao do telemovel tem de ser curta: ' + texto.length);
  assert.ok(!texto.includes(HASH.slice(0, 8)), 'o hash nao serve para nada num push');
});

// ── os botoes ───────────────────────────────────────────────────────────────
test('botoes · APROVAR pede confirmacao (num telemovel um toque errado gasta dinheiro)', () => {
  const acc = bloco(c.construir(pendente()).blocos, 'actions');
  const aprovar = acc.elements.find((e) => e.action_id === c.ACCOES.aprovar);
  const recusar = acc.elements.find((e) => e.action_id === c.ACCOES.recusar);
  assert.ok(aprovar.confirm, 'aprovar sem confirmacao e um toque acidental pago');
  assert.match(aprovar.confirm.text.text, /\$0,14/, 'a confirmacao diz quanto custa');
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
  assert.match(t, /🧾 request=job-1/, 'a auditoria e a prova — tem de sair');
  assert.equal(bloco(blocos, 'actions'), undefined, 'um pedido decidido nao oferece botoes');
});

test('decisao · STALE mostra os DOIS hashes e diz que o pedido CONTINUA a espera', () => {
  const { blocos } = c.construir({ tipo: 'decisao', job_id: 'job-1', estado: 'STALE',
    hash_esperado: HASH, hash_actual: 'ffffffff' + HASH.slice(8) });
  const t = tudo(blocos);
  assert.match(t, /ae0ab448…/, 'falta o hash do cartao');
  assert.match(t, /ffffffff…/, 'falta o hash actual');
  assert.match(t, /continua/i, 'o utilizador tem de saber que nao perdeu o pedido');
});

// ── a porta de saida varre a ARVORE, nao so o texto ─────────────────────────
test('publicar · um nome de segredo dentro de um BLOCO e limpo (nao so no texto de topo)', () => {
  const pub = criarPublicador({ dryRun: true });
  // o `texto` e um campo permitido e vai para dentro de um bloco de decisao
  const r = pub.publicar({ tipo: 'decisao', job_id: 'j', estado: 'REJECTED',
    texto: 'falhou a ler segredo.env' });
  assert.equal(r.publicado, true);
  const t = tudo(r.blocos) + r.texto;
  assert.ok(!t.includes('segredo.env'), 'o nome do segredo saiu dentro de um bloco');
  assert.deepEqual(r.removidos, ['segredo.env']);
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
