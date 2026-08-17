'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { lerHost, dosJobs, fundir, texto, sessaoMaisRecente, ehMooter } = require('./trilha.js');
const { ACTOR_SYSTEM, PORQUE_DEFAULT, PORQUE_DECLARADO } = require('./actor.js');

/* Constrói linhas .jsonl como o Claude Code as escreve. */
function linhaAssistant(at, blocos) {
  return JSON.stringify({ type: 'assistant', timestamp: at, requestId: 'req-' + at,
    message: { model: 'claude-opus-5', content: blocos } });
}
const tu = (id, name, input) => ({ type: 'tool_use', id, name, input: input || {} });

/* ══════════════ 1 · o host ══════════════ */

test('lerHost: sem transcritos, diz o porquê e nomeia o caso Cowork', () => {
  const r = lerHost({ raizes: ['/nao/existe'], fs: { readdirSync() { throw new Error('ENOENT'); } } });
  assert.strictEqual(r.disponivel, false);
  assert.strictEqual(r.linhas.length, 0);
  assert.match(r.porque, /Cowork/,
    'uma sessão Cowork sem transcrito é o caso NORMAL — tem de estar escrito, não deduzido');
});

test('lerHost: N cópias do mesmo bloco contam UMA vez (o gotcha da Onda 0.1)', () => {
  /* O mesmo tool_use aparece em 3 linhas assistant. Contar por linha triplicava
     a trilha inteira — foi assim que a quota inflacionou antes. */
  const b = tu('toolu_A', 'Write', { file_path: 'C:\\x\\aplicar.js' });
  const conteudo = [
    linhaAssistant('2026-08-05T02:00:00Z', [b]),
    linhaAssistant('2026-08-05T02:00:00Z', [b]),
    linhaAssistant('2026-08-05T02:00:01Z', [b]),
  ].join('\n');
  const r = lerHost({ conteudo });
  assert.strictEqual(r.linhas.length, 1);
  assert.strictEqual(r.duplicados, 2);
  assert.match(r.porque, /2 copies dropped/);
});

test('lerHost: leitura/busca são filtradas — e CONTADAS, nunca em silêncio', () => {
  const conteudo = [
    linhaAssistant('2026-08-05T02:00:00Z', [tu('a', 'Read', {}), tu('b', 'Grep', {})]),
    linhaAssistant('2026-08-05T02:00:02Z', [tu('c', 'Bash', { command: 'node --test' })]),
  ].join('\n');
  const r = lerHost({ conteudo });
  assert.strictEqual(r.linhas.length, 1);
  assert.strictEqual(r.filtrados, 2, 'um corte silencioso lê-se como "não aconteceu mais nada"');
  assert.match(r.porque, /2 read\/search calls filtered out/);
});

test('lerHost: rótulos falam a língua do Cowork e o caminho vira basename', () => {
  const conteudo = [
    linhaAssistant('2026-08-05T02:00:00Z', [tu('a', 'Write', { file_path: 'C:\\Users\\p\\frugal\\tools\\retrato-rotas.js' })]),
    linhaAssistant('2026-08-05T02:00:01Z', [tu('b', 'Bash', { command: 'node --check x.js\nsegunda linha' })]),
    linhaAssistant('2026-08-05T02:00:02Z', [tu('c', 'Edit', { file_path: '/home/p/a/b.ts' })]),
  ].join('\n');
  const r = lerHost({ conteudo });
  assert.strictEqual(r.linhas[0].rotulo, 'Created retrato-rotas.js');
  assert.strictEqual(r.linhas[0].kind, 'ficheiro');
  assert.strictEqual(r.linhas[1].rotulo, 'Ran command');
  assert.strictEqual(r.linhas[1].sub, 'node --check x.js', 'só a primeira linha do comando');
  assert.strictEqual(r.linhas[2].rotulo, 'Edited b.ts');
});

test('lerHost: tool desconhecida aparece com o nome cru, não desaparece', () => {
  const conteudo = linhaAssistant('2026-08-05T02:00:00Z', [tu('a', 'FerramentaNova', {})]);
  const r = lerHost({ conteudo });
  assert.strictEqual(r.linhas.length, 1);
  assert.strictEqual(r.linhas[0].rotulo, 'FerramentaNova');
  assert.strictEqual(r.linhas[0].kind, 'outro');
});

test('lerHost: linhas do host não inventam duração nem custo', () => {
  const r = lerHost({ conteudo: linhaAssistant('2026-08-05T02:00:00Z', [tu('a', 'Bash', { command: 'ls' })]) });
  assert.strictEqual(r.linhas[0].ms.valor, null);
  assert.strictEqual(r.linhas[0].usd.valor, null);
  assert.ok(r.linhas[0].ms.porque.length > 10, 'null sem porquê é um buraco, não uma medição');
});

test('ehMooter: apanha os dois prefixos e não apanha vizinhos parecidos', () => {
  assert.ok(ehMooter('mooter_work'));
  assert.ok(ehMooter('mcp__remote-devices__Mooter__mooter_check'));
  assert.ok(!ehMooter('xmooter_work'), 'prefixo colado não é o nosso');
  assert.ok(!ehMooter('mooter_work_extra_9'), 'só letras e underscore, e até ao fim');
  assert.ok(!ehMooter('Write'));
});

test('lerHost: tool do Mooter vira linha da casa, com rótulo humano', () => {
  const conteudo = linhaAssistant('2026-08-05T02:00:00Z',
    [tu('a', 'mcp__remote-devices__Mooter__mooter_check', { wave: 'lp-c1' })]);
  const r = lerHost({ conteudo });
  assert.strictEqual(r.linhas[0].kind, 'mooter');
  assert.strictEqual(r.linhas[0].rotulo, 'Check and collect');
  assert.strictEqual(r.linhas[0].sub, 'wave lp-c1');
});

test('sessaoMaisRecente: escolhe por mtime e diz de quantas escolheu', () => {
  const fake = {
    readdirSync(p, _o) {
      if (p.endsWith('projects')) return [{ name: 'proj', isDirectory: () => true, isFile: () => false }];
      return [{ name: 'a.jsonl', isFile: () => true, isDirectory: () => false },
              { name: 'b.jsonl', isFile: () => true, isDirectory: () => false }];
    },
    statSync(f) { return { mtimeMs: f.includes('b.jsonl') ? 200 : 100 }; },
  };
  const r = sessaoMaisRecente(['/r/projects'], fake, '/home');
  assert.match(r.ficheiro, /b\.jsonl$/);
  assert.match(r.porque, /2 sessions/);
});

/* ══════════════ 2 · o ledger ══════════════ */

const J = (o) => Object.assign({ job_id: 'j', agent: 'claude', state: 'done',
  dispatched_at: '2026-08-05T02:00:00Z', cost_usd: 0, duration_s: 1 }, o);

test('dosJobs: uma cadeia dá UMA linha, não uma por job', () => {
  const jobs = [
    J({ job_id: 'j1', agent: 'moo', cost_usd: 0, duration_s: 3 }),
    J({ job_id: 'j2', agent: 'kimi', prep_from: 'j1', cost_usd: 0.02, duration_s: 7 }),
  ];
  const r = dosJobs(jobs);
  assert.strictEqual(r.length, 1, 'o antepassado não ganha linha própria — senão a trilha infla');
  assert.deepStrictEqual(r[0].motores.map(m => m.id), ['moo', 'kimi'], 'mais antigo primeiro');
  assert.strictEqual(r[0].motores[0].local, true);
  assert.strictEqual(r[0].motores[1].local, false);
  assert.strictEqual(r[0].usd.valor, 0.02);
  assert.strictEqual(r[0].ms.valor, 10000);
});

test('A2 — dosJobs distingue actor default de declarado e degrada histórico para legacy', () => {
  const actor = { ...ACTOR_SYSTEM };
  const declarado = dosJobs([J({ job_id: 'declarado', actor, actor_porque: PORQUE_DECLARADO })])[0];
  const defaultActor = dosJobs([J({
    job_id: 'default', actor: ACTOR_SYSTEM, actor_porque: PORQUE_DEFAULT,
  })])[0];
  const historico = dosJobs([J({ job_id: 'historico', actor_porque: PORQUE_DECLARADO })])[0];
  assert.deepStrictEqual(declarado.actor, actor);
  assert.strictEqual(declarado.actor_porque, PORQUE_DECLARADO);
  assert.deepStrictEqual(defaultActor.actor, ACTOR_SYSTEM);
  assert.deepStrictEqual(defaultActor.actor, declarado.actor);
  assert.strictEqual(defaultActor.actor_porque, PORQUE_DEFAULT);
  assert.notStrictEqual(defaultActor.actor_porque, declarado.actor_porque);
  assert.deepStrictEqual(historico.actor, {
    type: 'system',
    id: 'legacy',
    origem: 'evento anterior à instrumentação de identidade (f-mu0)',
  });
  assert.strictEqual(historico.actor_porque, null);
});

test('dosJobs: custo parcial é declarado parcial, nunca somado como total', () => {
  const jobs = [
    J({ job_id: 'j1', agent: 'moo', cost_usd: 0 }),
    J({ job_id: 'j2', agent: 'codex', prep_from: 'j1', cost_usd: undefined }),
  ];
  const r = dosJobs(jobs);
  assert.match(r[0].usd.porque, /PARTIAL/);
});

test('dosJobs: um job vivo na cadeia torna a linha viva', () => {
  const jobs = [J({ job_id: 'j1', agent: 'moo', state: 'done' }),
                J({ job_id: 'j2', agent: 'kimi', state: 'running', handoff_from: 'j1' })];
  const r = dosJobs(jobs);
  assert.strictEqual(r[0].estado, 'vivo');
  assert.strictEqual(r[0].motores[1].estado, 'vivo');
  assert.strictEqual(r[0].motores[0].estado, 'terminado', 'um motor terminado nunca anima');
});

test('dosJobs: ciclo em prep_from não pendura o servidor', () => {
  const jobs = [J({ job_id: 'j1', agent: 'moo', prep_from: 'j2' }),
                J({ job_id: 'j2', agent: 'kimi', prep_from: 'j1' })];
  const r = dosJobs(jobs);
  assert.ok(Array.isArray(r), 'a guarda de ciclo tem de devolver, não iterar para sempre');
});

test('dosJobs: sem registos, diz que nenhum destino confirmou — não diz zero', () => {
  const r = dosJobs([J({ job_id: 'j1' })]);
  assert.deepStrictEqual(r[0].registos, []);
  assert.match(r[0].registos_porque, /no destination confirmed/);
});

test('dosJobs: motor fora da tabela não ganha local:false por omissão', () => {
  const r = dosJobs([J({ job_id: 'j1', agent: 'motor-novo' })]);
  assert.strictEqual(r[0].motores[0].local, null, 'null nunca se lê como false');
  assert.strictEqual(r[0].motores[0].label, 'motor-novo');
});

/* ══════════════ 3 · fundir ══════════════ */

test('fundir: ordena por tempo e conta os que não têm tempo', () => {
  const host = { disponivel: true, porque: 'ok', linhas: [
    { rotulo: 'B', at: 2000, motores: [], registos: [] },
    { rotulo: 'A', at: 1000, motores: [], registos: [] },
    { rotulo: 'X', at: null, motores: [], registos: [] },
  ] };
  const m = fundir(host, []);
  assert.deepStrictEqual(m.linhas.map(l => l.rotulo), ['A', 'B', 'X']);
  assert.strictEqual(m.resumo.sem_tempo, 1, 'sem instante não se inventa posição — conta-se');
});

test('fundir: o denominador da fatia local está escrito ao lado do valor', () => {
  const jobs = dosJobs([J({ job_id: 'j1', agent: 'moo' }), J({ job_id: 'j2', agent: 'claude' })]);
  const m = fundir({ disponivel: true, porque: 'ok', linhas: [] }, jobs);
  assert.strictEqual(m.resumo.na_gpu_local.valor, 1);
  assert.strictEqual(m.resumo.na_gpu_local.de, 2);
  assert.match(m.resumo.na_gpu_local.porque, /steps, not tokens/);
  assert.strictEqual(m.resumo.motores_locais, 1);
  assert.strictEqual(m.resumo.motores_subscricao, 1);
});

test('fundir: acima do tecto de vivos a corrente cala-se e diz porquê', () => {
  const linhas = [1, 2, 3, 4].map(i => ({ rotulo: 'L' + i, at: i, estado: 'vivo', motores: [], registos: [] }));
  const m = fundir({ disponivel: true, porque: 'ok', linhas }, []);
  assert.strictEqual(m.corrente.mostrar, false);
  assert.match(m.corrente.porque, /4 steps live at once/);
  assert.strictEqual(m.resumo.vivos, 4, 'a contagem é UMA — o aviso e a faixa leem daqui');
});

test('fundir: um só vivo aponta o índice certo da lista já ordenada', () => {
  const linhas = [
    { rotulo: 'A', at: 1, estado: 'terminado', motores: [], registos: [] },
    { rotulo: 'B', at: 3, estado: 'vivo', motores: [], registos: [] },
    { rotulo: 'C', at: 2, estado: 'terminado', motores: [], registos: [] },
  ];
  const m = fundir({ disponivel: true, porque: 'ok', linhas }, []);
  assert.strictEqual(m.corrente.mostrar, true);
  assert.strictEqual(m.linhas[m.corrente.indice].rotulo, 'B',
    'o índice refere-se à lista ORDENADA — foi assim que o Cockpit abriu o job errado');
});

test('fundir: custo parcial nunca se apresenta como total', () => {
  const linhas = [
    { rotulo: 'A', at: 1, usd: { valor: 0.01 }, motores: [], registos: [] },
    { rotulo: 'B', at: 2, usd: { valor: null }, motores: [], registos: [] },
  ];
  const m = fundir({ disponivel: true, porque: 'ok', linhas }, []);
  assert.strictEqual(m.resumo.custo.parcial, true);
  assert.match(m.resumo.custo.porque, /PARTIAL/);
});

/* ══════════════ 4 · texto (Claude Code) ══════════════ */

test('texto: sem host, o aviso aparece — não se finge trilha completa', () => {
  const m = fundir({ disponivel: false, porque: 'a Cowork session runs in the cloud', linhas: [] }, []);
  const s = texto(m, { projecto: 'frugal' });
  assert.match(s, /Host actions not visible/);
  assert.match(s, /cloud/);
});

test('texto: cada linha diz quem, quanto e o estado', () => {
  const jobs = dosJobs([
    J({ job_id: 'j1', agent: 'moo', cost_usd: 0, duration_s: 2 }),
    J({ job_id: 'j2', agent: 'kimi', prep_from: 'j1', state: 'running', cost_usd: 0, duration_s: 3 }),
  ]);
  const s = texto(fundir({ disponivel: true, porque: 'ok', linhas: [] }, jobs), { projecto: 'frugal' });
  assert.match(s, /moo → kimi\*/, 'o asterisco marca o vivo sem depender de cor nem de movimento');
  assert.match(s, /running/);
  assert.match(s, /2 engines \(1 on subscription · 1 local\)/);
  /* ⚠️ Uma trilha customer-facing não pode ter uma única palavra em PT-BR.
     Este é o teste que apanha a fuga — a saída do produto é internacional,
     a conversa com o dono é que é em português. */
  assert.ok(!/[À-ÿ]/.test(s.replace(/·/g, '')), 'nenhum acento na saída do produto: ' + s);
});

test('texto: zero medido escreve-se $0; ausente CALA-SE em vez de encher de travessões', () => {
  /* Contrato mudado a olhar para o output: uma linha do host não tem duração
     nem custo POR DESENHO, e três `—` seguidos liam-se como avaria. O porquê
     de cada ausência continua no modelo, para o painel; a linha só não o repete. */
  const linhas = [
    { rotulo: 'A', at: 1, kind: 'comando', usd: { valor: 0 }, ms: { valor: 1000 }, motores: [], registos: [], estado: 'terminado' },
    { rotulo: 'B', at: 2, kind: 'comando', usd: { valor: null }, ms: { valor: null }, motores: [], registos: [], estado: 'terminado' },
  ];
  const m = fundir({ disponivel: true, porque: 'ok', linhas }, []);
  const s = texto(m);
  assert.match(s, /\$0/, 'zero medido é o número mais importante deste produto — nunca se esconde');
  const linhaB = s.split('\n').filter(x => x.includes('B'))[0];
  assert.ok(!/—/.test(linhaB), 'ausente não vira travessão na linha');
  /* ⚠️ A asserção anterior lia o `porque` de uma linha que ESTE teste tinha
     escrito à mão — testava a fixture, não o código. O invariante real é sobre
     quem PRODUZ linhas: lerHost e dosJobs nunca devolvem null sem motivo. */
  const doHost = lerHost({ conteudo: JSON.stringify({ type: 'assistant', timestamp: '2026-08-05T02:00:00Z',
    message: { model: 'claude-opus-5', content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'ls' } }] } }) });
  assert.ok((doHost.linhas[0].usd.porque || '').length > 10, 'quem produz linhas explica cada null');
  assert.ok((doHost.linhas[0].ms.porque || '').length > 10);
});

test('texto: custo total de zero mostra-se $0, não $0.000', () => {
  const linhas = [{ rotulo: 'A', at: 1, kind: 'comando', usd: { valor: 0 }, motores: [], registos: [], estado: 'terminado' }];
  const s = texto(fundir({ disponivel: true, porque: 'ok', linhas }, []));
  assert.ok(!/\$0\.000/.test(s.split('\n')[0]), 'o cabeçalho fala a mesma língua das linhas');
});
