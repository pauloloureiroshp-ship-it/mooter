#!/usr/bin/env node
/**
 * As regras adversariais do recibo — os três defeitos que o gauntlet apanhou.
 *
 * Este bloco é a única superfície onde o produto argumenta contra si próprio à
 * frente do utilizador. Uma regra defeituosa aqui não é um bug menor: é o
 * produto a pregar rigor com um instrumento avariado.
 *
 * Os três, todos confirmados no código em 2026-08-04:
 *   :164  numerador sobre TODOS os jobs, denominador só sobre terminais
 *   :182  fatia local contada por JOBS (denominador lisonjeiro: 51% vs 15%)
 *   :193  `null` (não medido) tratado como `0` (medido zero)
 *
 * Correr:  node recibo-contexto-regras.test.js
 */
'use strict';
const path = require('path');

let mod;
try { mod = require('./recibo-contexto.js'); }
catch (e) { console.error('não consegui carregar recibo-contexto.js: ' + e.message); process.exit(2); }

const perguntarRaw = mod.perguntasAdversariais || (mod.default && mod.default.perguntasAdversariais);
if (typeof perguntarRaw !== 'function') {
  console.error('perguntasAdversariais não está exportada — não testei nada, e não testar não é passar.');
  process.exit(2);
}

let passou = 0, falhou = 0;
const t = (nome, cond, detalhe) => {
  if (cond) { passou++; console.log('  ✅ ' + nome); }
  else { falhou++; console.log('  ❌ ' + nome + (detalhe ? '\n     → ' + detalhe : '')); }
};
/* ⚠️ G11 — o instrumento antes da medição. A primeira versão deste teste
   chamava perguntar(jobs) e recebia sempre vazio: a assinatura real é
   (recibo, opts) com os jobs dentro de opts. Sete vermelhos com o código
   CERTO. Um teste mal ligado acusa o inocente — e a seguir ensina a
   ignorar testes. */
const perguntar = (jobs) => perguntarRaw(null, { jobs: jobs });

console.log('\n▸ cobertura de custo · o numerador não pode sair do denominador');
{
  /* 2 terminais, ambos sem custo. E um job VIVO com custo — que não pode contar. */
  const qs = perguntar([
    { job_id: 'a', state: 'done' },
    { job_id: 'b', state: 'failed' },
    { job_id: 'vivo', state: 'running', cost_usd: 0.9 }
  ]);
  const q = qs.find(x => /régua é "custo por resposta certa"/.test(x.pergunta));
  t('a regra dispara com 0% de cobertura', !!q);
  if (q) {
    t('e diz 0%, não 50% inflado pelo job vivo', /medida: 0%/.test(q.facto), q.facto);
    t('nunca reporta cobertura acima de 100%',
      !/1[0-9][0-9]%|[2-9][0-9][0-9]%/.test(q.facto), q.facto);
  }
}

console.log('\n▸ fatia local · contar jobs lisonjeia, e o painel tem de o dizer');
{
  /* ⚠️ o limiar é `pct < 50`: com 50% exactos a regra CALA-SE, e o primeiro
     caso que escrevi dava exactamente 50 — vermelho com o código certo.
     1 local pequeno + 2 pagos grandes = 33% por jobs, 1% por tokens. */
  const qs = perguntar([
    { job_id: 'l', state: 'done', local: true, agent: 'moo', tokens_out: 900 },
    { job_id: 'p', state: 'done', agent: 'cc', tokens_out: 30000 },
    { job_id: 'p2', state: 'done', agent: 'cc', tokens_out: 40000 }
  ]);
  const q = qs.find(x => /diferencial declarado é a GPU/.test(x.pergunta));
  t('a regra dispara', !!q);
  if (q) {
    t('reporta a contagem por JOBS', /33% dos jobs/.test(q.facto), q.facto);
    t('E a fatia por TOKENS, que é a que interessa', /por TOKENS a fatia local é 1%/.test(q.facto), q.facto);
    t('a pergunta expõe a distância entre as duas',
      /mas só 1% dos tokens produzidos/.test(q.pergunta), q.pergunta);
    t('e o "porque importa" nomeia a lisonja',
      /lisonjeia/.test(q.porque_importa || ''), q.porque_importa);
  }
}
{
  /* jobs sem tokens medidos: o número por tokens é um PISO, e diz-se */
  const qs = perguntar([
    { job_id: 'l', state: 'done', local: true, agent: 'moo', tokens_out: 100 },
    { job_id: 'p', state: 'done', agent: 'cc', tokens_out: 9000 },
    { job_id: 'p2', state: 'done', agent: 'cc' }              // sem tokens_out
  ]);
  const q = qs.find(x => /diferencial declarado é a GPU/.test(x.pergunta));
  t('declara quantos jobs não têm tokens medidos', q && /sem tokens medidos/.test(q.facto),
    q && q.facto);
  t('e chama-lhe piso, não total', q && /é um piso/.test(q.facto), q && q.facto);
}

console.log('\n▸ zero medido ≠ não medido · a doutrina dentro da própria regra');
{
  const qs = perguntar([
    { job_id: 'zero', state: 'done', tokens_out: 0 },
    { job_id: 'nulo', state: 'done' }
  ]);
  const zero = qs.find(x => /MEDIDOS a zero/.test(x.pergunta));
  const nulo = qs.find(x => /sem NINGUÉM medir/.test(x.pergunta));
  t('o zero medido tem pergunta própria', !!zero);
  t('o não medido tem pergunta própria', !!nulo);
  t('são perguntas DIFERENTES', !!zero && !!nulo && zero.pergunta !== nulo.pergunta);
  if (zero) t('o zero medido só lista o job com zero', /zero/.test(zero.facto) && !/nulo/.test(zero.facto), zero.facto);
  if (nulo) t('o não medido só lista o job sem medição', /nulo/.test(nulo.facto) && !/zero/.test(nulo.facto), nulo.facto);
  if (nulo) t('e diz que não é o mesmo que zero',
    /não é o mesmo que terem produzido zero/.test(nulo.porque_importa || ''), nulo.porque_importa);
}

console.log('\n▸ silêncio é uma medição · nada disparado, nada dito');
{
  const qs = perguntar([
    { job_id: 'ok', state: 'done', local: true, agent: 'moo', cost_usd: 0.01, tokens_out: 500 }
  ]);
  const ruido = qs.filter(x => /custo por resposta certa|MEDIDOS a zero|sem NINGUÉM medir/.test(x.pergunta));
  t('com tudo medido e local, estas três regras calam-se', ruido.length === 0,
    'dispararam: ' + ruido.map(x => x.pergunta.slice(0, 40)).join(' · '));
}

console.log('\n' + passou + ' passou · ' + falhou + ' falhou');
process.exit(falhou ? 1 : 0);
