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
const seamless = require('./seamless.js');

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
    okmsg('definições cabem em ' + bytes + ' bytes (~' + Math.round(bytes / 4) + ' tokens)'
      + ' · folga: ' + (9000 - bytes) + ' bytes');
  } catch (e) { bad('tamanho das definições', e); }

  try {
    // O radar tem de estar ALCANÇÁVEL, não só existir no ficheiro. E tem de continuar a
    // declarar que não escreveu quando chega pela porta do MCP — é aí que o estranho o vê.
    const setup = lista.find((t) => t.name === 'mooter_setup');
    assert.ok(setup.inputSchema.properties.radar, 'o parâmetro `radar` não está no schema — a tool ficava inalcançável');
    const alvo = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-mcp-'));
    fs.writeFileSync(path.join(alvo, 'README.md'), '# alvo', 'utf8');
    const r = await server.handle({
      jsonrpc: '2.0', id: 81, method: 'tools/call',
      params: { name: 'mooter_setup', arguments: { radar: alvo } },
    });
    const sc = r.result.structuredContent || JSON.parse(r.result.content[0].text);
    assert.strictEqual(sc.ok, true, 'o radar não correu pela porta do MCP: ' + JSON.stringify(sc).slice(0, 200));
    assert.strictEqual(sc.escreveu, false, 'o radar tem de declarar que não escreveu');
    assert.strictEqual(sc.pontuacao.total_pilares, 6);
    assert.match(sc.resumo, /só leitura/, 'o texto visível tem de repetir a promessa');
    okmsg('radar alcançável por mooter_setup({radar}) e declara-se só-leitura');
  } catch (e) { bad('radar pelo MCP', e); }

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
    const seamStub = {
      async toolStatus() {
        return { jobs: [{ job_id: 'job-check', last: 'started', worktree: path.join(HOME, 'wt-check') }] };
      },
    };
    const fleetStub = {};
    const check = tools6.build(seamStub, fleetStub, {}).find((t) => t.name === 'mooter_check');
    const sc = await check.handler({ job_id: 'job-check' });
    assert.match(sc.resumo, / · em wt-check$/);
    okmsg('check nomeia a worktree usada no resumo');
  } catch (e) { bad('worktree no resumo do check', e); }

  try {
    seamless.ledgerAppend({
      job_id: 'job-check-real', wave: 'onda1-check', agent: 'cc',
      worktree: WT, event: 'started',
    });
    const response = await server.handle({
      jsonrpc: '2.0', id: 20, method: 'tools/call',
      params: { name: 'mooter_check', arguments: { job_id: 'job-check-real' } },
    });
    const structured = response.result.structuredContent;
    assert.match(structured.resumo, / · em repo$/);
    assert.match(response.result.content[0].text, / · em repo$/,
      'o texto visível perdeu a worktree que existe no structuredContent');
    seamless.ledgerAppend({
      job_id: 'job-check-real', wave: 'onda1-check', agent: 'cc',
      worktree: WT, event: 'failed', exit_code: 'fim-do-teste',
    });
    okmsg('check nomeia a worktree no texto visível do MCP');
  } catch (e) { bad('worktree no texto do check', e); }

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

  try {
    const r = await server.handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'mooter_fleet', arguments: { view: 'afericao' } } });
    const sc = r.result.structuredContent || JSON.parse(r.result.content[0].text);
    assert.strictEqual(sc.estado, 'n/d');
    assert.ok(sc.porque, 'view:"afericao" sem histórico não explica o n/d');
    okmsg('view:"afericao" sem histórico devolve n/d com porquê');
  } catch (e) { bad('view afericao', e); }

  try {
    // F0 item 4 — GATE: "um estranho num Mac limpo instala pelo site e vê o
    // diagnóstico verde." Aqui, sem GPU/Ollama/vault reais, a maioria das
    // linhas fica vermelha — a prova é a FORMA, não a cor.
    //
    // 6 → 9 linhas em 2026-08-02. O "6 linhas, sempre" era a trava certa para a forma e a
    // trava errada para o conteúdo: a auditoria de onboarding
    // (`_handoff/SUPERMASTER_MAC_MINI.md:100-111`) mostrou que dava para ter as 6 verdes e o
    // primeiro job falhar com "git not found". As 3 novas são os gaps 1, 4 e 5 dessa tabela.
    const ESPERADAS = ['GPU', 'Modelo local (Ollama)', 'Vault Obsidian', 'Router (classify.js)',
      'CLIs de agente', 'Live Preview', 'git / gh', 'Configuração', 'Identidade da instalação'];
    // Uma suite não escreve no $HOME de quem a corre (lição de 2026-07-25, a nota no vault real).
    const skipAntes = process.env.MOOTER_SKIP_INSTALL_ID;
    process.env.MOOTER_SKIP_INSTALL_ID = '1';
    const r = await server.handle({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'mooter_setup', arguments: { primeira_vez: true } },
    });
    if (skipAntes === undefined) delete process.env.MOOTER_SKIP_INSTALL_ID; else process.env.MOOTER_SKIP_INSTALL_ID = skipAntes;
    const sc = r.result.structuredContent || JSON.parse(r.result.content[0].text);
    assert.strictEqual(sc.diagnostico.length, ESPERADAS.length, 'o diagnóstico deixou de ter ' + ESPERADAS.length + ' linhas: ' + sc.diagnostico.length);
    for (const nome of ESPERADAS) {
      assert.ok(sc.diagnostico.some((l) => l.item === nome), 'falta a linha «' + nome + '» no diagnóstico');
    }
    for (const linha of sc.diagnostico) {
      assert.ok(typeof linha.item === 'string' && linha.item, 'linha sem nome: ' + JSON.stringify(linha));
      assert.strictEqual(typeof linha.ok, 'boolean', linha.item + ' não é verde/vermelho: ' + JSON.stringify(linha));
      // Uma linha vermelha sem conserto é o mesmo que silêncio para quem acabou de instalar.
      if (!linha.ok) assert.ok(linha.detalhe && String(linha.detalhe).trim(), linha.item + ' está vermelha e não diz porquê');
    }
    assert.strictEqual(sc.tudo_verde, sc.diagnostico.every((l) => l.ok), 'tudo_verde não bate com as linhas');
    assert.ok(/🟢|🔴/.test(sc.resumo), 'o resumo não mostra as bolinhas verde/vermelho');
    const preview = sc.diagnostico.find((l) => l.item === 'Live Preview');
    assert.strictEqual(preview.ok, true, 'preview.js é um módulo real do repo — devia estar sempre verde');

    // O first-run: veredicto accionável, não só cores.
    assert.strictEqual(typeof sc.pronto_para_trabalhar, 'boolean', 'falta o veredicto pronto_para_trabalhar');
    assert.strictEqual(typeof sc.bloqueios, 'number', 'falta a contagem de bloqueios');
    assert.ok(Array.isArray(sc.proximos_passos), 'falta proximos_passos');
    assert.ok(sc.proximos_passos.length <= 3, 'proximos_passos passou de 3: ' + sc.proximos_passos.length);
    for (const p of sc.proximos_passos) {
      assert.ok(p.o_que && p.prioridade, 'passo sem o_que/prioridade: ' + JSON.stringify(p));
      assert.ok(['bloqueia', 'degrada', 'regista', 'opcional'].includes(p.prioridade), 'prioridade desconhecida: ' + p.prioridade);
    }
    // pronto_para_trabalhar tem de bater com a contagem de bloqueios — não pode ser optimismo solto.
    assert.strictEqual(sc.pronto_para_trabalhar, sc.bloqueios === 0, 'pronto_para_trabalhar não bate com bloqueios');
    okmsg('primeira_vez devolve diagnóstico de ' + ESPERADAS.length + ' linhas + próximos passos accionáveis');
  } catch (e) { bad('diagnóstico primeira_vez', e); }

  try {
    /**
     * Regressão medida 2026-08-02 na simulação do estranho: com HOME estéril a linha do Ollama
     * saía «🔴 Modelo local (Ollama) — ok — null → null» e o passo correspondente vinha com
     * `comando: null`. Um vermelho mudo dentro do trabalho feito para acabar com vermelhos mudos.
     *
     * A trava é sobre TODOS os passos (não só os 3 mostrados) e sobre as linhas vermelhas: em
     * qualquer ambiente, ninguém sai sem saber o que fazer, e nenhum texto contém "null".
     */
    const diag = await tools6.diagnosticoPrimeiraVez();
    for (const p of diag.passos_todos) {
      assert.ok(p.comando && String(p.comando).trim() && p.comando !== 'null',
        'passo sem comando: ' + JSON.stringify(p));
      assert.ok(p.porque && String(p.porque).trim() && p.porque !== 'null',
        'passo sem porquê: ' + JSON.stringify(p));
    }
    for (const l of diag.linhas) {
      if (!l.ok) {
        assert.ok(l.detalhe && String(l.detalhe).trim(), 'linha vermelha muda: ' + l.item);
        assert.ok(!/\bnull\b/.test(String(l.detalhe)),
          'a linha «' + l.item + '» tem "null" no texto que o utilizador lê: ' + l.detalhe);
      }
    }
    okmsg('nenhuma linha vermelha nem passo sai sem conserto legível (' + diag.passos_todos.length + ' passo(s) verificados)');
  } catch (e) { bad('vermelhos mudos', e); }

  try {
    const tools6mod = tools6;
    const semNada = process.env.PATH;
    const semPathext = process.env.PATHEXT;
    process.env.PATH = '';
    delete process.env.PATHEXT;
    try {
      assert.strictEqual(tools6mod.cliNoPath('um-binario-que-nao-existe-de-certeza'), false);
    } finally {
      process.env.PATH = semNada;
      if (semPathext != null) process.env.PATHEXT = semPathext;
    }
    okmsg('cliNoPath devolve false para um binário ausente do PATH');
  } catch (e) { bad('cliNoPath', e); }

  say('\n' + pass + ' testes da onda B' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  process.on('uncaughtException', () => {});
  setTimeout(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } }, 200);
})();
