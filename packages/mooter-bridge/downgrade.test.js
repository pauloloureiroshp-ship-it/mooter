'use strict';
/**
 * downgrade.test.js — a cobertura que a onda-a3 apagou sem reparar.
 *
 * O QUE CORREU MAL, E PORQUE ESTE FICHEIRO EXISTE
 * Em `main` havia um teste (`path.test.js` T1) que exigia `r.downgraded` e
 * estava VERDE: chamava `toolWork` com `agent:'moo'` explícito, e o guard de
 * então era incondicional, portanto degradava. A onda-a3 mudou o guard para
 * `agent === 'moo' && !motorExplicito` — decisão deliberada do dono: uma
 * escolha EXPLÍCITA do chamador não pode ser trocada em silêncio. Isso partiu
 * o T1. Em vez de se restaurar a cobertura pelo caminho que continuava vivo
 * (o INFERIDO), a asserção foi removida com a justificação de que "sempre foi
 * inalcançável" — o que era falso, e mediu-se o mundo já depois de o mudar.
 * Resultado: o downgrade ficou sem uma única asserção em toda a suite,
 * enquanto continua a correr em produção a cada job T0 sem GPU.
 *
 * PORQUE É UM FICHEIRO SEPARADO
 * O harness do `path.test.js` aponta `MOOTER_REPO` para um temp sem
 * `tools/router/classify.js`, logo o router não carrega e nenhum tier é
 * inferido — o downgrade é inalcançável lá, e torná-lo alcançável mudaria o
 * mundo dos outros 11 testes desse ficheiro. Aqui o sandbox COPIA o
 * classificador real (que é FROZEN; copiar não lhe toca) para dentro do temp,
 * e por isso o tier é inferido de verdade.
 *
 * Corre: node --test downgrade.test.js
 */

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

// ⚠️ tudo isto ANTES dos require — `seamless.js` lê MOOTER_REPO no topo do módulo
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-downgrade-'));
const WT = path.join(HOME, 'repo');
fs.mkdirSync(path.join(WT, 'tools', 'router'), { recursive: true });
try { require('child_process').execFileSync('git', ['-C', WT, 'init', '-q'], { stdio: 'ignore' }); } catch { /* */ }

// O classificador REAL, copiado para o sandbox: é ele que faz o tier ser
// inferido, e é a inferência que distingue este caminho do explícito.
// `classify.js` é FROZEN (sha CI-enforced) — copiar não lhe toca.
// Precisa de dois vizinhos: `patterns.js` (require directo) e
// `tuning-state.defaults.json` (lido no topo do módulo, sem fallback se faltar).
const ROUTER_FONTE = path.resolve(__dirname, '..', '..', 'tools', 'router');
const ROUTER_DESTINO = path.join(WT, 'tools', 'router');
const PRECISA = ['classify.js', 'patterns.js', 'tuning-state.defaults.json'];
const TEM_CLASSIFY = PRECISA.every((f) => fs.existsSync(path.join(ROUTER_FONTE, f)));
if (TEM_CLASSIFY) {
  for (const f of PRECISA) fs.copyFileSync(path.join(ROUTER_FONTE, f), path.join(ROUTER_DESTINO, f));
}

process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = WT;
// porta morta: apagar a variável não isola nada — o código cai para
// 127.0.0.1:11434, que na máquina do dono TEM um daemon a responder.
process.env.OLLAMA_HOST = '127.0.0.1:1';

const seam = require('./seamless.js');

let spawned = [];
seam.setJobSpawner((cmd, cwd, out) => {
  spawned.push(cmd);
  const em = new EventEmitter();
  setImmediate(() => {
    out.write('{"type":"result","subtype":"success","result":"feito","total_cost_usd":0}\n');
    out.end();
    em.emit('spawn');
    setTimeout(() => em.emit('close', 0), 30);
  });
  em.stdout = { pipe() {} }; em.stderr = { pipe() {} }; em.kill = () => true;
  return em;
});

const livre = async () => {
  for (let i = 0; i < 400; i++) {
    let n = 0;
    try { n = (seam.activeJobsByWorktree(WT) || []).length; } catch { n = 0; }
    if (!n) return;
    await new Promise((s) => setTimeout(s, 25));
  }
};

// 'diz três cores' é T0 no classificador real (medido em 2026-08-16). Se algum
// dia deixar de ser, D0 falha primeiro e diz porquê — em vez de os testes
// seguintes passarem a medir outro caminho em silêncio.
const GOAL_T0 = 'diz três cores';

test('D0 · o sandbox tem router a sério e o goal é mesmo inferido T0', () => {
  assert.ok(TEM_CLASSIFY, 'não encontrei tools/router/classify.js para copiar — o sandbox não prova nada');
  const { classify } = require(path.join(WT, 'tools', 'router', 'classify.js'));
  assert.strictEqual(classify(GOAL_T0).tier, 'T0',
    'o goal deixou de ser T0: os testes deste ficheiro passariam a medir outro caminho');
});

test('D1 · tier T0 INFERIDO sem GPU degrada para cc e DIZ que degradou', async () => {
  await livre();
  const r = await seam.toolWork({ goal: GOAL_T0, worktree: WT, prepare: false, wave: 'D1' });

  assert.ok(r.router && r.router.disponivel === true,
    'o router não carregou no sandbox — este teste não estaria a exercitar o caminho inferido');
  assert.ok(!r.error, 'recusou em vez de degradar: ' + JSON.stringify(r.reasons || r.error));
  // ESTA é a asserção que a onda-a3 apagou. É o contrato do comentário v1.3.3:
  // a porta única não se fecha porque um motor OPCIONAL está em baixo.
  assert.ok(r.downgraded,
    'degradou em silêncio — quem não escolheu o motor tem de saber que não foi para a GPU');
  assert.strictEqual(r.agent, 'cc', 'o T0 inferido sem GPU tem de acabar no Claude Code');
  assert.ok(/GPU local|modelo local/.test(r.downgraded),
    'a mensagem de downgrade não diz o que falhou: ' + r.downgraded);
  await livre();
});

test('D2 · agent:"moo" EXPLÍCITO não degrada — a escolha do chamador não se troca em silêncio', async () => {
  await livre();
  const r = await seam.toolWork({ goal: GOAL_T0, agent: 'moo', worktree: WT, prepare: false, wave: 'D2' });

  assert.ok(!r.downgraded,
    'trocou uma escolha explícita do chamador por outro motor: ' + r.downgraded);
  assert.strictEqual(r.agent, 'moo', 'moo explícito foi trocado por outro motor');
  assert.strictEqual(r.exit_code, 'no-local-model', 'a recusa explícita perdeu o exit_code');
  await livre();
});

test('D3 · o recibo nunca se contradiz: downgraded e agent:"moo" não coexistem', async () => {
  await livre();
  // os dois caminhos, um a seguir ao outro, comparados no mesmo teste
  const inferido = await seam.toolWork({ goal: GOAL_T0, worktree: WT, prepare: false, wave: 'D3a' });
  await livre();
  const explicito = await seam.toolWork({ goal: GOAL_T0, agent: 'moo', worktree: WT, prepare: false, wave: 'D3b' });
  await livre();

  for (const r of [inferido, explicito]) {
    if (r.downgraded) {
      assert.notStrictEqual(r.agent, 'moo',
        'o recibo diz que passou para outro motor e o agent ficou em moo: ' + r.downgraded);
    }
  }
  // e a distinção que a frente introduziu tem de ser visível no recibo
  assert.ok(inferido.downgraded && !explicito.downgraded,
    'inferido e explícito produzem o mesmo recibo — a distinção não chega ao utilizador');
});

test('D4 · a via de escape oferecida na recusa DESPACHA mesmo (segue-se o próprio conselho)', async () => {
  await livre();
  const recusa = await seam.toolWork({
    goal: 'lê o inexistente-neste-teste.js e resume-o',
    agent: 'moo', worktree: WT, prepare: false, wave: 'D4',
  });
  await livre();

  const passos = recusa.faz_assim || [];
  assert.ok(passos.length, 'a recusa não ofereceu saída nenhuma');

  // ⚠️ Um regex sobre o texto do passo prova que a string foi escrita, não que
  // a via funciona — foi assim que um `force:true` inerte sobreviveu a um teste
  // verde. Aqui SEGUE-SE o passo: extrai-se o agente que ele manda usar e
  // repete-se o MESMO goal com ele. Se não despachar, o recibo está a mentir.
  const passoCc = passos.find((p) => /agent:"cc"/.test(p));
  assert.ok(passoCc, 'a recusa não oferece a via que sabemos despachar: ' + JSON.stringify(passos));

  const seguido = await seam.toolWork({
    goal: 'lê o inexistente-neste-teste.js e resume-o',
    agent: 'cc', worktree: WT, prepare: false, wave: 'D4b',
  });
  assert.ok(seguido.job_id && !seguido.error && !seguido.erro,
    'segui o passo que a recusa ofereceu e continuei sem despachar: ' + JSON.stringify(seguido.erro || seguido.error));
  await livre();
});

test('D5 · nenhum passo oferecido cita um parâmetro que o despacho ignora', async () => {
  await livre();
  const recusas = [];
  recusas.push(await seam.toolWork({
    goal: 'lê o outro-inexistente.js e resume-o', agent: 'moo', worktree: WT, prepare: false, wave: 'D5a',
  }));
  await livre();
  recusas.push(await seam.toolWork({ goal: GOAL_T0, agent: 'moo', worktree: WT, prepare: false, wave: 'D5b' }));
  await livre();

  // Lista dos parâmetros que o despacho NÃO lê. `force` está aqui porque o
  // schema o aceita ([compat]) e nenhuma linha o consome: um passo que o cite
  // é um beco com placa de saída. Quem acrescentar outro parâmetro morto ao
  // conselho tem de o acrescentar também a esta lista — e nessa altura vai
  // perceber que o melhor é não o oferecer.
  const MORTOS = [/force\s*:\s*true/, /\bforce\s*:/];
  for (const r of recusas) {
    for (const passo of (r.faz_assim || [])) {
      for (const morto of MORTOS) {
        assert.ok(!morto.test(passo),
          'a recusa oferece um passo que o código não implementa: ' + passo);
      }
    }
  }
});

test.after(() => {
  setTimeout(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } }, 250);
});
