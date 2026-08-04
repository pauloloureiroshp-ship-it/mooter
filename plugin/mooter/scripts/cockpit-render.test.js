#!/usr/bin/env node
/**
 * O renderizador do Cockpit no Claude Code tem de dizer a mesma verdade que o
 * painel do Cowork. O teste que interessa é um só, e é o que justifica o produto:
 *
 *   um job com `state:"running"` cujo log não cresce NUNCA aparece como "working".
 *
 * Se este ficheiro ficar verde por acidente, o produto perdeu a sua única
 * promessa. Por isso cada caso monta ficheiros reais em disco e corre o script
 * como o utilizador o corre.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'cockpit-render.js');
let passou = 0, falhou = 0;
const t = (nome, cond, detalhe) => {
  if (cond) { passou++; console.log('  ✅ ' + nome); }
  else { falhou++; console.log('  ❌ ' + nome + (detalhe ? '\n     → ' + detalhe : '')); }
};

function montar(jobs, extra) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-'));
  fs.mkdirSync(path.join(raiz, 'jobs'), { recursive: true });
  for (const [id, meta, idadeLogS] of jobs) {
    const d = path.join(raiz, 'jobs', id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ job_id: id, ...meta }));
    if (idadeLogS != null) {
      const log = path.join(d, 'out.log');
      fs.writeFileSync(log, 'x');
      const quando = new Date(Date.now() - idadeLogS * 1000);
      fs.utimesSync(log, quando, quando);
    }
  }
  if (extra) for (const [rel, obj] of Object.entries(extra)) {
    const p = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj));
  }
  return raiz;
}
const correr = (raiz, json) =>
  execFileSync('node', [SCRIPT, '--raiz', raiz].concat(json ? ['--json'] : []), { encoding: 'utf8' });

console.log('\n▸ A REGRA · running não é working');
{
  const raiz = montar([
    ['vivo',   { state: 'running', agent: 'cc', dispatched_at: new Date().toISOString() }, 5],
    ['parado', { state: 'running', agent: 'cc', dispatched_at: new Date().toISOString() }, 3600],
    ['espera', { state: 'running', exit_code: 'agent-awaiting-approval', agent: 'cc', dispatched_at: new Date().toISOString() }, 10]
  ]);
  const r = JSON.parse(correr(raiz, true));
  const de = id => r.jobs.find(j => j.job_id === id).estado_real.k;
  t('log a crescer há 5 s → working', de('vivo') === 'working');
  t('log parado há 1 h → stalled, apesar de state:"running"', de('parado') === 'stalled',
    'deu "' + de('parado') + '" — esta é a promessa central do produto');
  t('exit_code agent-awaiting-approval → awaiting', de('espera') === 'awaiting');
  t('o resumo conta 1 a trabalhar, não 3', r.resumo.a_trabalhar === 1,
    'contou ' + r.resumo.a_trabalhar);
  t('e conta 2 presos', r.resumo.presos === 2);
  const txt = correr(raiz);
  /* ⚠️ G11 — o instrumento antes da medição. A primeira versão deste teste
     usava /parado[\s\S]{0,80}working/, que apanhava a linha do job "vivo" logo
     a seguir e dava vermelho com o código certo. Um teste que falha por si
     próprio ensina a ignorar testes. Agora lê-se a LINHA do job. */
  const linhaDe = id => txt.split('\n').find(l => l.includes('| ' + id + ' |')) || '';
  t('a linha do job parado diz stalled, não working',
    /stalled/.test(linhaDe('parado')) && !/working/.test(linhaDe('parado')),
    'linha: ' + linhaDe('parado'));
  t('a linha do job vivo continua a dizer working', /working/.test(linhaDe('vivo')));
  t('o texto diz PORQUE está parado', /out\.log não cresce há/.test(txt));
}

console.log('\n▸ um zero sem medição nunca se mostra como zero');
{
  const raiz = montar([
    ['com', { state: 'done', cost_usd: 0.5, agent: 'cc', dispatched_at: new Date().toISOString() }, 10],
    ['sem', { state: 'done', agent: 'codex', dispatched_at: new Date().toISOString() }, 10]
  ]);
  const r = JSON.parse(correr(raiz, true));
  t('a soma marca-se parcial', r.resumo.custo_usd.parcial === true);
  t('e declara quantos jobs ficaram sem medição', r.resumo.custo_usd.jobs_sem_medicao === 1);
  const txt = correr(raiz);
  t('o texto escreve "soma parcial", não um total limpo', /soma parcial/.test(txt));
  t('um modelo em falta aparece como ◌ n/d', /◌ n\/d/.test(txt));
}

console.log('\n▸ o objecto {valor,porque} não vira [object Object]');
{
  const raiz = montar([
    ['obj', { state: 'done', agent: 'moo', model: { valor: null, porque: 'stream mudo' }, dispatched_at: new Date().toISOString() }, 10]
  ]);
  const txt = correr(raiz);
  t('nada de [object Object] no output', !/object Object/.test(txt));
}

console.log('\n▸ fontes em falta são ditas, não engolidas');
{
  const raiz = montar([['x', { state: 'done', agent: 'cc', dispatched_at: new Date().toISOString() }, 10]]);
  const txt = correr(raiz);
  t('avisa que hardware/preferences não foram lidos', /fonte\(s\) não foram lidas/.test(txt));
  t('e diz que a falta pode ser de leitura, não de trabalho',
    /falha de leitura, não ausência de trabalho/.test(txt));
}

console.log('\n▸ sem jobs, distingue "não houve" de "não encontrei"');
{
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-vazio-'));
  const txt = correr(raiz);
  t('não conclui que não houve trabalho', /Confirma o caminho antes de/.test(txt),
    'um caminho errado e uma máquina parada produzem o mesmo vazio — e não são a mesma coisa');
}

console.log('\n▸ Attention vazio é o objectivo, e diz-se');
{
  const hoje = new Date().toISOString().slice(0, 10);
  const raiz = montar(
    [['x', { state: 'done', agent: 'cc', dispatched_at: new Date().toISOString() }, 10]],
    { ['board/' + hoje + '.json']: { metricas: {}, excepcoes: [] } });
  const txt = correr(raiz);
  t('com zero excepções, diz que vazio é o objectivo', /vazio aqui é o objectivo/.test(txt));
}

console.log('\n' + passou + ' passou · ' + falhou + ' falhou');
process.exit(falhou ? 1 : 0);
