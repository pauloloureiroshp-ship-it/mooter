/**
 * queixas.test.mjs — as 14 queixas do dono, uma a uma, com critério mecânico.
 *
 * Este ficheiro existe para que "está resolvido" deixe de ser uma opinião. Cada
 * queixa vira um teste que lê o repo e falha quando a promessa não está no
 * código. As que ainda não têm implementação ficam `{ todo: true }` — aparecem
 * na saída como dívida declarada em vez de desaparecerem numa checklist em
 * prosa onde eu poderia escrever "parcialmente feito" e seguir em frente.
 *
 * Regra do brief: uma falha = reprovado. Um `todo` NÃO é uma passagem.
 */

import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

const SHELL = 'tools/cockpit/moo-pilot-shell.html';
const RUNNER = 'tools/cockpit/runner';

// ── 1 · lançar/abrir por device ──────────────────────────────────────────────
test('q01 · o painel abre por device, servido pelo endpoint local', () => {
  const server = read(`${RUNNER}/f10-server.mjs`);
  assert.match(server, /panelCandidates/, 'o endpoint tem de saber servir o painel');
  assert.match(server, /X-Moo-Panel-Source/, 'tem de declarar QUAL painel serviu');
  assert.ok(exists(SHELL), 'o shell canónico tem de existir no repo');
  assert.match(read(SHELL), /state\.device/, 'o painel tem de mostrar de que device fala');
});

// ── 2 · play por pilar ───────────────────────────────────────────────────────
test('q02 · o play por pilar mexe mesmo no loop, não é decoração', () => {
  assert.match(read(`${RUNNER}/f10-server.mjs`), /'\/focus'/, 'tem de haver endpoint /focus');
  const runner = read(`${RUNNER}/moo-runner.mjs`);
  // O foco passou a ser lido do caminho DO PROJECTO (B2), por isso a chamada
  // leva argumentos. A alegacao nao mudou — o loop tem de ler o foco a cada
  // volta — so o sitio de onde o le e que passou a depender do repo.
  assert.match(runner, /readFocus\(paths\.FOCUS, ids, logImpl\)/, 'o loop tem de LER o foco do projecto certo');
  // A alegação é "o foco vence quem escolhe por ele", e não uma grafia. Até
  // 2026-08-23 quem escolhia era o `nextPillar` e isto exigia `focus ||
  // nextPillar`; agora quem escolhe é o Fleet Commander, e o foco continua a
  // ganhar-lhe — só que num `if`, porque o comandante também pode dizer PAUSA e
  // um `||` não sabe exprimir isso. Fixar a grafia teria feito esta ligação
  // parecer uma regressão quando a regra ficou igual.
  assert.match(runner, /let pillar = focus;/, 'o foco entra primeiro');
  assert.match(runner, /if \(!pillar\) \{[\s\S]{0,400}?decidirRonda\(/,
    'quem escolhe só corre quando NÃO há foco — o botão do dono ganha ao escalonador');
  assert.match(read(SHELL), /control\('\/focus'/, 'o botão tem de chamar o endpoint');
});

// ── 3 · progresso e animações ────────────────────────────────────────────────
test('q03 · há progresso visível e movimento, com respeito por reduced-motion', () => {
  const shell = read(SHELL);
  assert.match(shell, /stroke-dashoffset/, 'o gauge tem de ser animável');
  assert.match(shell, /@keyframes pulse/, 'o estado vivo tem de pulsar');
  assert.match(shell, /prefers-reduced-motion/, 'quem desliga movimento tem de ser respeitado');
});

// ── 4 · cross-device em tempo real ───────────────────────────────────────────
test('q04 · a frota inteira visível em cada painel, cada device com a sua idade', () => {
  const shell = read(SHELL);
  assert.match(shell, /renderFleet/, 'o painel tem de desenhar a frota');
  assert.match(shell, /state\.frota/, 'e consumir o campo do payload');
  assert.match(shell, /d\.self/, 'tem de distinguir este device dos outros');

  const beacon = read(`${RUNNER}/fleet-beacon.mjs`);
  assert.match(beacon, /export function writeBeacon/, 'cada device tem de se anunciar');
  assert.match(beacon, /export function readBeacons/, 'e ler os outros');
  assert.match(beacon, /beaconFreshness/, 'com idade própria por device');

  // O ponto que separa isto de um mural decorativo: um device que parou de
  // sincronizar tem de escurecer, e a página tem de dizer que a frescura dos
  // outros vale o que o sync valer.
  assert.match(beacon, /vale o que o sync do vault valer/);
  assert.match(shell, /\.dev\.morto\{opacity/, 'device morto tem de ser visivelmente demovido');

  // E o 4090 tem de conseguir medir a sua GPU, senão aparece sempre a n/d.
  assert.match(read(`${RUNNER}/gpu-sampler.mjs`), /nvidia-smi/, 'sem amostrador NVIDIA não há 4090');
  assert.ok(exists('moo-runner.cmd'), 'o Windows precisa do seu shim');
});

test('q04b · nenhum device remoto é conduzido a partir daqui — só lido', () => {
  // A alternativa óbvia (endpoint a ouvir na LAN) seria um kill-switch remoto.
  // Os beacons são ficheiros: escrita local, leitura local, zero portas abertas.
  const beacon = read(`${RUNNER}/fleet-beacon.mjs`);
  assert.ok(!/fetch\(|http:|createServer/.test(beacon), 'beacons não falam pela rede');
  assert.match(read(`${RUNNER}/f10-server.mjs`), /HOST = '127\.0\.0\.1'/, 'o endpoint fica em loopback');
});

// ── 5 · GPU% durante o play ──────────────────────────────────────────────────
test('q05 · o GPU% vem do play real e não de um número decorativo', () => {
  assert.match(read(`${RUNNER}/gpu-sampler.mjs`), /IOAccelerator/, 'medido via ioreg');
  const shell = read(SHELL);
  assert.match(shell, /gpu\.util_pct/, 'o gauge tem de consumir a medição');
  // O painel passou a ingles: 'n/d' -> 'n/a'. A exigencia e a mesma e e a que
  // importa: sem amostra o gauge diz que NAO MEDIU, nunca 0%.
  assert.match(shell, /'n\/a'/, 'sem amostra tem de dar n/a, nunca 0%');
});

// ── 6 · look & feel profissional ─────────────────────────────────────────────
test('q06 · o painel é profissional: temas, responsivo, sem dependências externas', () => {
  const shell = read(SHELL);
  assert.match(shell, /prefers-color-scheme\s*:\s*dark/, 'tem de seguir o tema do sistema');
  assert.match(shell, /data-theme="dark"/, 'e a escolha explícita do utilizador');
  assert.match(shell, /@media \(max-width/, 'tem de ser responsivo');
  assert.ok(!/src="http|href="http|@import/.test(shell), 'nenhum recurso externo — abre offline');
});

// ── 7 · confiança: ▶ = trabalha sozinho, sem parar ───────────────────────────
test('q07 · o ▶ deixa mesmo a máquina a trabalhar sozinha e a prova está no ledger', () => {
  const runner = read(`${RUNNER}/moo-runner.mjs`);
  assert.match(runner, /for \(;;\)/, 'tem de ser um loop perpétuo');
  // A alegacao original era "cada volta deixa recibo". Foi essa que produziu
  // 1767 recibos consecutivos de um apagao de 11 horas: com o motor em baixo,
  // "cada volta" gravava uma linha de nada e o painel ficava verde-vivo. O B8
  // mudou-a de proposito, e a alegacao nova e mais forte, nao mais fraca: o que
  // vai para o ledger e decidido pelo DISJUNTOR, e um crash continua a deixar
  // rasto. O silencio durante um apagao esta coberto por smoke.test.mjs.
  assert.match(runner, /breaker\.observe\(receipt, nowIso\(\)\)/, 'o disjuntor e que decide o que entra no ledger');
  // A asercao lia a linha LITERAL `for (const r of recibos) appendReceiptImpl(...)`.
  // O residuo 5 do #366 poe o `appendReceipt` a lancar num recibo sem forma, e o
  // ciclo passou a apanhar essa excepcao — senao um recibo mau matava o loop.
  // A forma da linha mudou; o que este teste garante nao mudou: o que o disjuntor
  // decide e o que vai para o ledger DO PROJECTO.
  assert.match(runner, /for \(const r of recibos\)/, 'o disjuntor decide, e e isso que se grava');
  assert.match(runner, /appendReceiptImpl\(paths\.LEDGER, r\)/, 'e vai para o ledger DO PROJECTO, nao para um global');
  assert.match(runner, /recibo recusado pelo ledger/, 'e um recibo sem forma perde-se ALTO, sem derrubar o ciclo');
  assert.match(runner, /ronda rebentou/, 'até um crash deixa rasto — um buraco no ledger seria a mentira');
});

// ── 8 · a versao do conector nao se copia ────────────────────────────────────
test('q08 · a versão do conector é declarada no payload', () => {
  // A versão estava CRAVADA aqui como '1.48.0' enquanto o repo ia em 1.49.3 e a
  // máquina do dono tinha 1.33.0 instalada — o painel afirmava um número que
  // não correspondia a nenhum dos dois. Uma versão copiada para um segundo
  // ficheiro só tem um futuro possível, e era este.
  const state = read(`${RUNNER}/fleet-state.mjs`);
  assert.doesNotMatch(state, /connector = '\d+\.\d+\.\d+'/,
    'a versão não pode voltar a ser cravada à mão: lê-se do manifest');
  assert.match(read(`${RUNNER}/f10-server.mjs`), /connector: versaoDoConector\(/,
    'quem constrói o estado tem de a ler da fonte canónica');
  assert.match(read(SHELL), /state\.conector/, 'e visível no painel');
});

// ── 9 · modelos locais visíveis ──────────────────────────────────────────────
test('q09 · vê-se que modelos locais estão residentes e quanta VRAM ocupam', () => {
  assert.match(read(`${RUNNER}/f10-server.mjs`), /api\/ps/, 'lê os modelos residentes do Ollama');
  const shell = read(SHELL);
  assert.match(shell, /modelos_carregados/, 'o painel mostra-os');
  assert.match(shell, /no model resident/, 'e diz quando não há nenhum (a interface é inglesa: o público é global)');
});

// ── 10 · alinhamento projeto / vault ─────────────────────────────────────────
test('q10 · o alinhamento é medido: repo, sha do canon e vault', () => {
  const align = read(`${RUNNER}/alignment.mjs`);
  for (const campo of ['repo_branch', 'repo_clean', 'classify_sha', 'vault']) {
    assert.match(align, new RegExp(campo), `falta ${campo}`);
  }
  assert.match(align, /parseCanonSha/, 'o sha vem do canon, não de uma constante');
  assert.match(read(SHELL), /renderAlign/, 'e aparece no painel');
});

// ── 11 · % GPU (honesto, e não substituto de recibos) ────────────────────────
test('q11 · GPU% é utilização, e o painel não a confunde com valor entregue', () => {
  const shell = read(SHELL);
  // O painel passou a ingles (produto global). O contrato nao mudou de
  // exigencia, mudou de lingua: GPU% e utilizacao, e o valor entregue mede-se
  // em recibos por veredicto — nunca em percentagem de GPU nem em volume.
  assert.match(shell, /by verdict, never by volume/i, 'o valor entregue mede-se em recibos');
  assert.match(shell, /does <b>not<\/b> mean the finding is right/,
               'a legenda tem de desarmar a leitura errada de "cited"');
});

// ── 12 · features bem distribuídos ───────────────────────────────────────────
test('q12 · a lógica está distribuída por módulos testáveis, não num monólito', () => {
  const modulos = ['context-pack', 'evidence-verifier', 'runner-core', 'fleet-state',
                   'gpu-sampler', 'alignment', 'f10-server', 'moo-runner', 'fleet-beacon',
                   'autostart', 'launch'];
  for (const m of modulos) assert.ok(exists(`${RUNNER}/${m}.mjs`), `falta ${m}.mjs`);
  for (const shimPath of ['moo-runner.command', 'moo-runner.cmd']) {
    const shim = read(shimPath);
    assert.ok(shim.split('\n').length < 60, `${shimPath} tem de continuar um shim fino`);
    // Sem comentários: os shims EXPLICAM as garantias do código canónico, e
    // nomeá-las num comentário não é implementá-las.
    const code = shim
      .split('\n')
      .filter((l) => !/^\s*(#|REM\b|::)/i.test(l))
      .join('\n');
    assert.ok(!/verifyEvidence|assertLocalEngine|api\/generate/.test(code),
              `${shimPath} nao pode conter logica — ela vive no repo, com testes`);
  }
  assert.match(read('moo-runner.command'), /SHIM FINO/, 'e declará-lo');
});

// ── 13 · research de repos públicos ──────────────────────────────────────────
test('q13 · desenho confrontado com prática de cockpits/runners públicos', { todo: 'não feito — nenhuma pesquisa externa foi corrida nesta sessão' }, () => {
  assert.fail('sem evidência de research');
});

// ── 14 · deep-search da sessão ───────────────────────────────────────────────
test('q14 · o estado herdado foi confrontado com o disco, não assumido', () => {
  // A F0 refutou a premissa central (174 recibos = trabalho) lendo o ledger.
  // O que prova que a busca aconteceu é o verificador existir e o legado
  // aparecer contabilizado à parte, em vez de silenciosamente apagado.
  const state = read(`${RUNNER}/fleet-state.mjs`);
  assert.match(state, /sem_veredicto/, 'o legado tem de continuar contado, não escondido');
  assert.match(read(`${RUNNER}/fleet-state.test.mjs`), /174 recibos/, 'o caso herdado tem de estar fixado em teste');
});
