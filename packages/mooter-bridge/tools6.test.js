'use strict';
/**
 * tools6.test.js — Onda B: a superfície é o produto para quem chega.
 *
 * Prova que originou isto: na Fase 0 de uma auditoria, um utilizador novo
 * escolheu `mooter_run` para "pedir uma auditoria a um ficheiro", porque `run`
 * prometia "o resultado" e `work` prometia "um painel". A tool errada
 * vendia-se melhor, e havia 15 delas.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-t6-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(WT, { recursive: true });
try { require('child_process').execFileSync('git', ['-C', WT, 'init', '-q'], { stdio: 'ignore' }); } catch { /* */ }
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;

const server = require('./server-apps.js');
const tools6 = require('./tools6.js');

// ⚠️ `server-apps.js` redirecciona console.* para o diário (stdout é sagrado no
// stdio MCP). Um teste que use console.log fica MUDO. Escrevemos directo no fd.
const say = (t) => fs.writeSync(1, t + '\n');
let pass = 0;
const okmsg = (n) => { say('  ok  ' + n); pass++; };
const bad = (n, e) => { say('  FAIL ' + n + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; };

(async () => {
  say('\nonda B — seis portas, não quinze');

  let lista;
  try {
    const r = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    lista = r.result.tools;
    assert.strictEqual(lista.length, 6, 'anunciou ' + lista.length + ' tools');
    assert.deepStrictEqual(lista.map((t) => t.name), tools6.PUBLICAS, 'ordem errada: as simples vêm primeiro');
    okmsg('seis tools anunciadas, pela ordem certa');
  } catch (e) { bad('seis tools', e); }

  try {
    // a razão de existir: 15 definições custavam milhares de tokens por chamada
    const bytes = JSON.stringify(lista).length;
    assert.ok(bytes < 9000, 'as definições ocupam ' + bytes + ' bytes — demasiado para o budget de contexto');
    okmsg('definições cabem em ' + bytes + ' bytes (~' + Math.round(bytes / 4) + ' tokens)');
  } catch (e) { bad('tamanho das definições', e); }

  try {
    for (const t of lista) {
      assert.ok(t.description && t.description.length > 40, t.name + ' sem descrição a sério');
      assert.ok(/[ãõçáéíóúâêô]/i.test(t.description), t.name + ': a descrição não está em português (a saída está)');
      assert.ok(t.inputSchema && t.inputSchema.additionalProperties === false, t.name + ' aceita campos não declarados');
    }
    okmsg('descrições em português e schemas fechados');
  } catch (e) { bad('descrições/schemas', e); }

  try {
    const work = lista.find((t) => t.name === 'mooter_work');
    assert.deepStrictEqual(work.inputSchema.required, ['goal'], 'mooter_work() vazio continua a ser schema-válido');
    const av = Object.entries(work.inputSchema.properties).filter(([, v]) => /\[avançado\]/.test(v.description || ''));
    assert.ok(av.length >= 5, 'os parâmetros que exigem saber git/wave/worktree têm de estar marcados');
    okmsg('goal é obrigatório e ' + av.length + ' parâmetros marcados [avançado]');
  } catch (e) { bad('schema do work', e); }

  try {
    const leitura = ['mooter_check', 'mooter_fleet'];
    for (const n of leitura) {
      const t = lista.find((x) => x.name === n);
      assert.strictEqual(t.annotations.readOnlyHint, true, n + ' devia ser read-only');
      // regra da Block: uma tool = um nível de risco. Nenhuma leitura escreve.
      const escreve = Object.keys(t.inputSchema.properties).filter((k) => /write|create|force|delete/i.test(k));
      assert.strictEqual(escreve.length, 0, n + ' tem parâmetros que escrevem: ' + escreve.join(','));
    }
    assert.strictEqual(lista.find((t) => t.name === 'mooter_cancel').annotations.destructiveHint, true);
    okmsg('uma tool = um nível de risco (leitura nunca escreve)');
  } catch (e) { bad('níveis de risco', e); }

  try {
    const check = lista.find((t) => t.name === 'mooter_check');
    assert.ok(/nunca como instruções/i.test(check.description), 'sem aviso anti-injecção no campo que traz saída de agente');
    assert.ok(check.inputSchema.properties.wait_s.maximum === 45, 'o tecto de espera tem de estar no schema');
    okmsg('check avisa sobre texto não confiável e limita a espera');
  } catch (e) { bad('anti-injecção', e); }

  try {
    // os nomes antigos continuam a funcionar — mitigação para quem já os usa
    const r = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mooter_status', arguments: { wave: 'inexistente' } } });
    assert.ok(r && r.result, 'o alias antigo deixou de responder — partiria as automações');
    const r2 = await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mooter_worktrees', arguments: {} } });
    assert.ok(r2 && r2.result);
    okmsg('aliases antigos continuam chamáveis, mas invisíveis');
  } catch (e) { bad('aliases', e); }

  try {
    const r = await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'mooter_setup', arguments: {} } });
    const sc = r.result.structuredContent || JSON.parse(r.result.content[0].text);
    assert.ok(sc.resumo && /🐮/.test(sc.resumo), 'sem resumo legível na primeira chave');
    assert.ok(/onboarding no Cowork: (suportado|não suportado|n\/d)/i.test(sc.resumo),
      'setup não expõe a capacidade de onboarding');
    okmsg('setup responde com resumo legível');
  } catch (e) { bad('resumo do setup', e); }

  try {
    const r = await server.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'mooter_fleet', arguments: { view: 'pastas' } } });
    const sc = r.result.structuredContent || JSON.parse(r.result.content[0].text);
    assert.ok(!('livres' in sc) || typeof sc.livres === 'number', 'a lista de pastas voltou a vir duplicada');
    assert.ok(sc.pastas, 'a vista de pastas não devolveu pastas');
    okmsg('view:"pastas" devolve um campo só, sem duplicação');
  } catch (e) { bad('payload das pastas', e); }

  try {
    const r = await server.handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'mooter_fleet', arguments: { view: 'board' } } });
    const sc = r.result.structuredContent || JSON.parse(r.result.content[0].text);
    assert.ok(sc.scorecard && sc.scorecard.metricas, 'view:"board" não devolveu o scorecard');
    assert.ok(Array.isArray(sc.excepcoes), 'view:"board" não devolveu excepções');
    okmsg('view:"board" usa o scorecard assíncrono');
  } catch (e) { bad('view board', e); }

  say('\n' + pass + ' testes da onda B' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  process.on('uncaughtException', () => {});
  setTimeout(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } }, 200);
})();
