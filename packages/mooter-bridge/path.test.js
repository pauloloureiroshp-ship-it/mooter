'use strict';
/**
 * path.test.js — testes do CAMINHO OBSERVÁVEL, não das funções.
 *
 * A lição que custou a v1.3.2: 57 asserts verdes, 4 bugs bloqueantes em
 * produção, zero apanhados. A suite testava as peças — `cliModelFor` tinha 6
 * asserts a provar o fix — e nunca testava a PASSAGEM `toolWork → cliModelFor
 * → spawn`, que era exactamente onde o bug vivia. Pior: um dos asserts protegia
 * o back-compat, ou seja, certificava a porta de trás por onde o bug entrava.
 *
 * Cada teste aqui percorre o caminho que o utilizador percorre.
 * Corre: node path.test.js
 */

// ⚠️ Este ficheiro DESPACHA e ensina a correr-se a mao (o cabecalho acima),
// o que contorna o `--require` do `npm test`. Hoje o caminho nao chega a
// escrever no corpus de routing — mas «hoje nao chega» e precisamente o
// que muda em silencio. Carregado aqui; e idempotente. Guardado por
// `corpus-de-routing.test.js`.
require('./testes-nao-escrevem-no-corpus.cjs');

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

// ⚠️ A6 — TUDO ISTO TEM DE ACONTECER ANTES DOS `require`.
// `seamless.js` lê `MOOTER_REPO` no topo do módulo (`const REPO = …`). Definir a
// variável DEPOIS do require deixava o REPO a apontar para o repositório real do
// Paulo: em Windows, com 37 worktrees a sério, os testes escolhiam uma worktree
// real, escreviam no ledger real e falhavam com jobs que nada tinham a ver com
// eles ("posse: worktree já tem job ativo (job-ms0ik779-57b6)"). Uma suite que
// toca em produção não é uma suite — é um segundo utilizador.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-path-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(WT, { recursive: true });
try { require('child_process').execFileSync('git', ['-C', WT, 'init', '-q'], { stdio: 'ignore' }); } catch { /* */ }
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;
// ⚠️ HERMETICIDADE — apagar OLLAMA_HOST não isola nada: o código cai para
// `127.0.0.1:11434`, que na máquina do Paulo TEM um daemon a responder. O gate
// no Windows falhou por isto — T1/T7 e A4b/A5 assumiam "sem modelo local" e
// encontraram um. Apontar para uma porta morta é a única forma de a suite dar
// o mesmo resultado com e sem GPU.
process.env.OLLAMA_HOST = '127.0.0.1:1';

const seam = require('./seamless.js');
const plan = require('./plan.js');
const moo = require('./moo.js');

// prova de isolamento: se algum caminho apontar para fora do temp, parar já
for (const [k, v] of Object.entries(seam._paths || {})) {
  const val = typeof v === 'function' ? v() : v;
  if (typeof val === 'string' && !val.startsWith(HOME) && !val.startsWith(os.tmpdir())) {
    console.error('ABORTADO: ' + k + ' aponta para fora do sandbox: ' + val);
    process.exit(1);
  }
}

let pass = 0;
const okmsg = (n) => { console.log('  ok  ' + n); pass++; };
const bad = (n, e) => { console.log('  FAIL ' + n + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; };

/** Spawner falso que regista o comando E escreve um stream à medida. */
function fakeSpawner(write) {
  const seen = [];
  seam.setJobSpawner((cmd, cwd, out) => {
    seen.push(cmd);
    const em = new EventEmitter();
    setImmediate(() => {
      if (write) write(out, cmd);
      out.end();
      em.emit('spawn');
      setTimeout(() => em.emit('close', 0), 40);
    });
    em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
    return em;
  });
  return seen;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ Esperar por TEMPO é a origem das falhas intermitentes que o gate no
 * Windows apanhou: `await wait(120)` chega numa máquina rápida e não chega
 * noutra, e o teste seguinte bate no guard de posse com
 * "worktree já tem job ativo". O guard está certo — a suite é que estava a
 * adivinhar. Esperamos pelo FACTO (a worktree ficar livre), com um tecto.
 */
async function livre(seamMod, worktree, maxMs) {
  const fim = Date.now() + (maxMs || 8000);
  for (;;) {
    let n = 0;
    try { n = (seamMod.activeJobsByWorktree(worktree) || []).length; } catch { n = 0; }
    if (!n) return true;
    if (Date.now() > fim) return false;
    await wait(25);
  }
}

(async () => {
  console.log('\ncaminho observável — os 4 bugs que a suite anterior não viu');

  // ── T1a · sem GPU o trabalho continua, a decisão é explicada, e o recibo
  //         nunca se contradiz; vocabulário nunca cruza vendors ─────────────
  //
  // ⚠️ CORRECÇÃO DE UMA AFIRMAÇÃO FALSA QUE ESTEVE AQUI (2026-08-16).
  // Este comentário chegou a dizer que a exigência de `r.downgraded` "esteve
  // vermelha meses" e "era inalcançável, não regressiva". As duas eram FALSAS,
  // e o erro merece ficar escrito porque a sua forma se repete: mediu-se o
  // mundo DEPOIS de o ter mudado.
  //   · em `main` este teste chamava-se T1, chamava `toolWork` com
  //     `agent:'moo'` EXPLÍCITO, e o guard de então era incondicional
  //     (`if (agent === 'moo')`) — degradava, e o teste estava VERDE.
  //   · o commit 6ce75e00 desta frente estreitou o guard para
  //     `&& !motorExplicito` (decisão deliberada: uma escolha do chamador não
  //     se troca em silêncio) e PARTIU-O. O próprio commit admite:
  //     "path.test.js REGREDIU com esta alteração. Não investiguei a causa."
  //   · só depois a chamada foi alterada (sem `agent`, outro goal), o que o
  //     tornou vermelho por uma SEGUNDA razão — a que se mediu e se tomou
  //     erradamente pela primeira.
  // O ramo de downgrade continua vivo em produção e passou a estar coberto por
  // `downgrade.test.js` (D1/D2/D3), que monta um sandbox com o classificador
  // real e por isso alcança o caminho inferido.
  //
  // O que este teste cobre AQUI é outra coisa, e continua a valer: neste
  // harness o `MOOTER_REPO` é um temp sem `tools/router/classify.js`, logo o
  // router não carrega e nenhum tier é inferido. É o contrato do caminho SEM
  // router.
  //
  // O que interessa provar é o contrato que o utilizador vê, e esse é
  // verificável com ou sem router: o trabalho continua, a decisão de NÃO usar
  // a GPU é explícita e explicada, o recibo não se contradiz, e o vocabulário
  // de um vendor nunca chega ao motor de outro.
  try {
    const seen = fakeSpawner((out) => {
      out.write('{"type":"result","subtype":"success","result":"feito","total_cost_usd":0}\n');
    });
    const r = await seam.toolWork({ goal: 'diz três cores', worktree: WT, prepare: false, wave: 'T1a' });

    // 1. sem GPU o trabalho não pára — quem não pediu `moo` não é castigado
    assert.ok(!r.error, 'work inferido recusou em vez de continuar: ' + JSON.stringify(r.reasons || r.error));

    // 2. a decisão de não ir para a GPU é EXPLÍCITA e EXPLICADA. Silêncio aqui
    //    é o bug: o utilizador tem de saber que a GPU não foi usada, e porquê.
    assert.ok(r.escolha_local, 'não houve decisão local-first registada no recibo');
    assert.strictEqual(r.escolha_local.local, false,
      'escolheu a GPU local com o Ollama numa porta morta');
    assert.ok(r.escolha_local.porque && String(r.escolha_local.porque).trim(),
      'a decisão de não usar a GPU saiu sem razão — "não deu" não é um recibo');

    // 3. COERÊNCIA DO RECIBO. Um `downgraded` a dizer "passei para o Claude
    //    Code" ao lado de `agent:'moo'` é o recibo a mentir sobre o que
    //    aconteceu. Não é hipotético: em 2026-08-16 uma tentativa de partilhar
    //    a sonda do Ollama entre o guard e o local-first produziu exactamente
    //    este par, e nenhum dos 1047 testes o apanhou — foi preciso revisão
    //    adversarial para o ver.
    if (r.downgraded) {
      assert.notStrictEqual(r.agent, 'moo',
        'o recibo diz que degradou para outro motor mas o agent ficou em moo: ' + r.downgraded);
    }

    // 3b. A guarda acima é uma REDE, e hoje não dispara. Isso fica provado
    //     aqui em vez de assumido: sem router não há tier inferido, logo não há
    //     ramo de downgrade a percorrer. Se alguém tornar o classify.js
    //     carregável neste sandbox, esta asserção cai — e é isso que se quer,
    //     porque nesse mundo o T1a passa a poder (e dever) exigir o downgrade
    //     a sério, em vez de o cobrir com uma condição que nunca corre.
    assert.strictEqual(r.router && r.router.disponivel, false,
      'o router passou a carregar neste harness: o ramo de downgrade deixou de ser '
      + 'inalcançável e o T1a tem de voltar a exigi-lo em vez de o proteger com um if');

    await wait(150);
    const cmd = seen[0];
    if (cmd && cmd.args) {
      const i = cmd.args.indexOf('--model');
      const m = i >= 0 ? String(cmd.args[i + 1]) : null;
      if (cmd.bin === 'claude') {
        assert.strictEqual(r.agent, 'cc', 'vocabulário Anthropic só pode chegar ao Claude Code');
      } else {
        assert.ok(!m || !/^(opus|sonnet|haiku)$/.test(m),
          'toolWork entregou "' + m + '" a um motor não-Anthropic — foi assim que o Ollama morreu em 0s');
      }
    }
    okmsg('T1a · sem GPU continua, explica a decisão e o recibo não se contradiz');
  } catch (e) { bad('T1a', e); }

  // ── T1b · moo EXPLÍCITO recusa com recuperação e evidência ──────────────
  try {
    fs.writeFileSync(path.join(WT, 't1-explicito.js'), 'function escolhaExplicita() { return 1; }\n');
    await livre(seam, WT);
    const r = await seam.toolWork({
      goal: 'lê o t1-explicito.js e resume-o',
      agent: 'moo', worktree: WT, prepare: false, wave: 'T1b',
    });
    assert.strictEqual(r.exit_code, 'no-local-model', 'moo explícito não preservou a recusa local');
    assert.strictEqual(r.agent, 'moo', 'moo explícito foi trocado por outro motor');
    assert.ok(Array.isArray(r.faz_assim) && /ollama serve/.test(r.faz_assim.join(' ')),
      'recusa sem passo para arrancar o Ollama');
    assert.ok(/ollama pull/.test(r.faz_assim.join(' ')), 'recusa sem passo para instalar um modelo');
    assert.ok(/agent:"cc"/.test(r.faz_assim.join(' ')), 'recusa sem opt-in explícito para motor pago');
    // ⚠️ Aqui exigia-se também /force:true/. Removido, e não por conveniência:
    // `force` nunca foi lido pelo despacho, e o próprio schema o documenta como
    // "[compat] accepted, but it never overrides the capability contract".
    // A asserção só provava que a string tinha sido escrita. Em vez dela, a
    // exigência que interessa: TODOS os passos oferecidos têm de ser accionáveis
    // — nenhum pode citar um parâmetro que o código ignora.
    for (const passo of r.faz_assim) {
      assert.ok(!/force\s*:\s*true/.test(passo),
        'a recusa oferece um passo que o código não implementa: ' + passo);
    }
    assert.deepStrictEqual(r.ficheiros_lidos, ['t1-explicito.js'], 'a recusa descartou a evidência já recolhida');
    assert.ok(r.contexto_chars > 0, 'a recusa descartou o tamanho do contexto injectado');
    okmsg('T1b · moo explícito sem Ollama recusa com recuperação e evidência');
  } catch (e) { bad('T1b', e); }

  // ── T2 · o embedder nunca é escolhido, mesmo residente ──────────────────
  try {
    const r = await moo.pickModel(null, '127.0.0.1:1', [{ model: 'nomic-embed-text:latest' }], { free_mb: 20000 });
    assert.notStrictEqual(r, 'nomic-embed-text:latest');
    okmsg('T2 · pickModel rejeita embedder residente');
  } catch (e) { bad('T2', e); }

  // ── T3 · resultado entregue SEM telemetria continua a ser `done` ────────
  // Este é o achado nº1 da auditoria: 1,8 KB de análise correcta marcados
  // `failed / empty-output` porque o parser não extraiu tokens.
  try {
    fakeSpawner((out) => {
      // texto real, mas SEM usage e SEM type:"result" reconhecível como tal
      out.write('{"type":"assistant","message":{"content":[{"type":"text","text":"A análise completa do ficheiro, com 3 achados."}]}}\n');
    });
    await livre(seam, WT);
    const d = await seam.toolDispatch({
      agent: 'cc', worktree: WT, wave: 'T3', step: 'S1',
      masterprompt: '⇄ ROUTING / teste\nanalisa o ficheiro',
    });
    assert.ok(d.job_id, JSON.stringify(d.reasons || d.error));
    await livre(seam, WT);
    await wait(60);
    const st = await seam.toolStatus({ job_id: d.job_id });
    assert.strictEqual(st.jobs[0].last, 'done',
      'trabalho entregue foi marcado ' + st.jobs[0].last + ' — o produto disse que falhou com o resultado à frente');
    const col = await seam.toolCollect({ job_id: d.job_id });
    assert.ok(String(col.result).includes('3 achados'), 'o resultado não chegou ao collect');
    okmsg('T3 · resultado sem telemetria = done (não empty-output)');
  } catch (e) { bad('T3', e); }

  // ── T3b · sem resultado NENHUM continua a ser failed ────────────────────
  try {
    fakeSpawner((out) => { out.write('{"type":"system","subtype":"init","model":"x"}\n'); });
    await livre(seam, WT);
    const d = await seam.toolDispatch({
      agent: 'cc', worktree: WT, wave: 'T3b', masterprompt: '⇄ ROUTING / teste\nfaz nada',
    });
    await livre(seam, WT);
    await wait(60);
    const st = await seam.toolStatus({ job_id: d.job_id });
    assert.strictEqual(st.jobs[0].last, 'failed', 'job que só emitiu init devia falhar');
    okmsg('T3b · só linha de init = failed');
  } catch (e) { bad('T3b', e); }

  // ── T4 · dois toolWork na mesma wave = duas etapas ──────────────────────
  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    await livre(seam, WT);
    await seam.toolWork({ goal: 'primeira tarefa da wave', worktree: WT, wave: 'T4', prepare: false });
    await livre(seam, WT);
    await seam.toolWork({ goal: 'segunda tarefa da wave', worktree: WT, wave: 'T4', prepare: false });
    await livre(seam, WT);
    await wait(60);
    const p = plan.summarize(plan.readPlan('T4'));
    assert.strictEqual(p.total, 2, 'o segundo work apagou a etapa do primeiro (total=' + p.total + ')');
    assert.ok(p.steps.some((s) => /primeira/.test(s.title)), 'a primeira etapa desapareceu do plano');
    okmsg('T4 · dois work na mesma wave = 2 etapas no plano');
  } catch (e) { bad('T4', e); }

  // ── T5 · await com custos desconhecidos devolve null, nunca 0 ───────────
  try {
    seam.ledgerAppend({ job_id: 'T5a', wave: 'T5', agent: 'codex', worktree: WT, event: 'dispatched' });
    seam.ledgerAppend({ job_id: 'T5a', wave: 'T5', agent: 'codex', worktree: WT, event: 'done', exit_code: 0 });
    const r = await seam.toolAwait({ wave: 'T5', timeout_s: 5 });
    assert.strictEqual(r.cost_usd, null, 'somou null e devolveu 0 — "0" é uma afirmação, "null" é uma abstenção');
    assert.strictEqual(r.cost_jobs_sem_medicao, 1);
    assert.ok(r.cost_note);
    okmsg('T5 · await sem custos medidos devolve null + nota');
  } catch (e) { bad('T5', e); }

  // ── T6 · status e fleet dão o MESMO tok_s para um job terminado ─────────
  try {
    const fleet = require('./fleet.js');
    fakeSpawner((out) => {
      out.write('{"type":"system","model":"m","session_id":"s"}\n');
      out.write('{"type":"result","result":"pronto","total_cost_usd":0.02,"usage":{"input_tokens":10,"output_tokens":300}}\n');
    });
    const d = await seam.toolDispatch({ agent: 'cc', worktree: WT, wave: 'T6', masterprompt: '⇄ ROUTING / teste\nfaz algo' });
    await wait(350);
    const st = await seam.toolStatus({ job_id: d.job_id });
    const snap = await fleet.toolFleet({ wave: 'T6', windowMinutes: 60 }, {});
    const jf = (snap.jobs || []).find((x) => x.job_id === d.job_id);
    const a = st.jobs[0].now ? st.jobs[0].now.tok_s : null;
    const b = jf ? jf.tok_s : null;
    assert.strictEqual(a, b, 'status disse ' + a + ' tok/s e fleet disse ' + b + ' para o mesmo facto imutável');
    okmsg('T6 · status e fleet concordam no tok/s (' + a + ')');
  } catch (e) { bad('T6', e); }

  // ── T7 · prepare que não corre EXPLICA-SE ──────────────────────────────
  try {
    const antes = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = '127.0.0.1:1';        // ninguém a ouvir
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    const r = await seam.toolWork({ goal: 'tarefa com preparação impossível', worktree: WT, wave: 'T7' });
    assert.ok(r.prepare_skipped, 'sem prepare_skipped. resposta: ' + JSON.stringify(r).slice(0,240));
    assert.ok(/Ollama|modelo local/.test(r.prepare_skipped));
    if (antes) process.env.OLLAMA_HOST = antes; else delete process.env.OLLAMA_HOST;
    okmsg('T7 · prepare impossível diz porquê: "' + r.prepare_skipped.slice(0, 48) + '…"');
  } catch (e) { bad('T7', e); }

  // ── T8 · a frase legível vive DENTRO do objecto ─────────────────────────
  try {
    fakeSpawner((out) => { out.write('{"type":"result","result":"ok","total_cost_usd":0.01}\n'); });
    await wait(250);   // o T7 acabou de despachar nesta worktree; o WIP guard é real
    const r = await seam.toolWork({ goal: 'ver se o resumo aparece', worktree: WT, wave: 'T8', prepare: false });
    assert.ok(r.resumo && /🐮/.test(r.resumo), 'sem resumo. resposta: ' + JSON.stringify(r).slice(0,240));
    assert.ok(Object.keys(r)[0] === 'resumo', 'o resumo tem de ser a PRIMEIRA chave');
    okmsg('T8 · resumo legível é a 1ª chave da resposta');
  } catch (e) { bad('T8', e); }


  // ── T9 · o prompt de arranque NUNCA tem quebras de linha ────────────────
  // Bug real de 2026-07-25: a v1.3.3 pôs o label numa linha própria e o cmd.exe
  // do Windows cortou o argumento aí. Três jobs receberam só o cabeçalho e
  // responderam a pedir o brief. Os testes não apanharam porque o spawner é
  // falso — por isso este teste olha para o COMANDO, não para a execução.
  try {
    const label = 'wave-x · S1 · uma frase\ncom newline\r\ne mais "aspas" e | pipes';
    const boot = seam.bootstrapPrompt('C:\\jobs\\x\\masterprompt.md', label);
    assert.ok(!/[\r\n]/.test(boot), 'o boot tem newline — a shell corta tudo a seguir');
    assert.ok(!/["`|&<>]/.test(boot), 'o boot tem metacaracteres de shell');
    assert.ok(boot.indexOf('masterprompt.md') > 0, 'o boot tem de apontar ao ficheiro');
    for (const ag of ['cc', 'codex', 'gemini']) {
      const cmd = seam.buildCommand(ag, 'C:\\jobs\\x', 'Read', null, label);
      for (const a of cmd.args) assert.ok(!/[\r\n]/.test(String(a)), ag + ' tem argumento multi-linha');
    }
    okmsg('T9 · boot e argumentos numa só linha (o bug que cortou 3 jobs)');
  } catch (e) { bad('T9', e); }

  console.log('\n' + pass + ' testes de caminho' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
  // streams dos jobs falsos ainda podem estar a fechar; limpar sem barulho
  process.on('uncaughtException', () => {});
  setTimeout(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } }, 250);
})();
