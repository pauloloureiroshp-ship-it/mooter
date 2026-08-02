/**
 * estranho.test.js — o gate do utilizador nº 2, automatizado.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * Em 2026-07-28 o plano dizia: "GATE — uma pessoa que não és tu instala e corre
 * sem te perguntar nada". Não havia essa pessoa, e o gate ficou a ser uma
 * desculpa. Fez-se a simulação à mão em `/tmp` e encontrou, em minutos, três
 * coisas que nenhuma auditoria tinha apanhado:
 *
 *   1. `classify.js` não ia no bundle, `REPO` caía para a pasta de instalação e
 *      `classifyOrNull` fazia `catch { return null }`. Resultado para 100% dos
 *      estranhos: `mooter_work` devolvia `ok:true` com `routed:"default do CLI"`
 *      e NENHUM campo dizia que o router não tinha corrido.
 *   2. `mooter_check` devolvia `resumo:"🐮 feito"` com `failed:1` e
 *      `exit_code:1`. O corpo certo, o titular a mentir.
 *   3. Fallbacks com o nome das pastas do autor (`~/frugal`, `paulo-vault`).
 *
 * 90% desse gate humano é mecânico. Isto é esse mecanismo: extrai o bundle real,
 * arranca-o com `HOME` vazio — sem repo, sem vault, sem `~/.claude`, sem Ollama,
 * sem login — e percorre a jornada MCP inteira por stdio.
 *
 * O teste falha se algum dos três sintomas voltar. É a única prova que temos de
 * que o produto ainda funciona para quem não é o Paulo.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const HERE = __dirname;

/** Empacota o bundle a partir do repo e devolve o caminho do .mcpb. */
function empacotar(dir) {
  const out = path.join(dir, 'bundle.mcpb');
  const r = spawnSync(process.execPath, [path.join(HERE, 'pack-mcpb.mjs'), out], {
    cwd: HERE, encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, 'pack-mcpb.mjs falhou:\n' + (r.stderr || r.stdout));
  return out;
}

/** Extrai um ZIP "stored" (sem compressão) — é assim que o packer escreve. */
function extrair(zipPath, destino) {
  const buf = fs.readFileSync(zipPath);
  // End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, 'o .mcpb não tem End of Central Directory — não é um zip válido');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const nomes = [];
  for (let i = 0; i < total; i++) {
    assert.strictEqual(buf.readUInt32LE(p), 0x02014b50, 'central directory corrompido');
    const method = buf.readUInt16LE(p + 10);
    const tam = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28);
    const eLen = buf.readUInt16LE(p + 30);
    const cLen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nLen);
    assert.strictEqual(method, 0, 'o packer escreve stored; ' + nome + ' veio comprimido');
    const lhNameLen = buf.readUInt16LE(off + 26);
    const lhExtraLen = buf.readUInt16LE(off + 28);
    const inicio = off + 30 + lhNameLen + lhExtraLen;
    const alvo = path.join(destino, nome);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, buf.subarray(inicio, inicio + tam));
    nomes.push(nome);
    p += 46 + nLen + eLen + cLen;
  }
  return nomes;
}

/** Corre a jornada MCP por stdio num ambiente estéril e devolve as respostas. */
function jornada(instalacao, homeVazio, cwd, pedidos, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(instalacao, 'server', 'server-apps.js')], {
      cwd,
      // ⚠️ ambiente ESTÉRIL de propósito: nada de MOOTER_*, nada de HOME do autor.
      env: { PATH: process.env.PATH, HOME: homeVazio, USERPROFILE: homeVazio },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    const erros = [];
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => erros.push(String(d)));
    const send = (o) => { try { p.stdin.write(JSON.stringify(o) + '\n'); } catch { /* servidor morreu */ } };

    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: { roots: {} },
      clientInfo: { name: 'estranho', version: '1' },
    } });
    setTimeout(() => send({ jsonrpc: '2.0', method: 'notifications/initialized' }), 200);
    pedidos.forEach((req, i) => setTimeout(() => send(req), 600 + i * 700));

    setTimeout(() => {
      try { p.kill(); } catch { /* já morto */ }
      const porId = new Map();
      for (const linha of out.split('\n')) {
        if (!linha.trim()) continue;
        try { const j = JSON.parse(linha); if (j.id != null) porId.set(j.id, j); } catch { /* stdout não-JSON */ }
      }
      resolve({ porId, stderr: erros.join('') });
    }, timeoutMs);
  });
}

test('estranho — o bundle traz o motor, arranca estéril e não mente', async (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-estranho-'));
  const homeVazio = path.join(raiz, 'home');
  const instalacao = path.join(raiz, 'install', 'mooter');
  const projecto = path.join(homeVazio, 'projecto');
  fs.mkdirSync(projecto, { recursive: true });
  fs.writeFileSync(path.join(projecto, 'app.js'), "console.log('oi')\n");
  spawnSync('git', ['init'], { cwd: projecto });

  const mcpb = empacotar(raiz);
  const nomes = extrair(mcpb, instalacao);

  // ── S1 · O MOTOR VAI NA CAIXA ────────────────────────────────────────────
  // Até à v1.26 o bundle tinha 37 ficheiros e nenhum era o classificador,
  // enquanto o manifest o vendia pelo nome. Um estranho instalava um cockpit
  // sem motor e o produto não lho dizia.
  /**
   * ⚠️ CAMINHO CORRIGIDO em 2026-07-31 (J-0 validação).
   *
   * Este assert procurava `tools/router/classify.js` e falhava — anunciando
   * «REGRESSÃO: classify.js não vai no bundle» enquanto o classify.js IA no
   * bundle. O teste que existe para apanhar mentiras estava ele próprio a
   * mentir, e a mensagem de erro trazia a prova: a lista de ficheiros incluía
   * `server/classify.js`.
   *
   * Quem está certo, verificado nas duas pontas antes de mexer:
   *   · `pack-mcpb.mjs:76` mapeia `../../tools/router/classify.js` →
   *     `server/classify.js`;
   *   · `seamless.js:71-72` diz por escrito «a cópia EMPACOTADA vive em
   *     server/classify.js, ao lado deste ficheiro», e `seamless.js:81`
   *     explica porquê: «REPO/tools/router/classify.js só existe quando há um
   *     ~/frugal clonado» — que é precisamente o que um estranho não tem.
   *
   * A garantia defendida não muda: o motor vai na caixa. Só o caminho estava
   * escrito à moda do repo, não à moda da instalação.
   */
  assert.ok(
    nomes.includes('server/classify.js'),
    'REGRESSÃO: classify.js não vai no bundle — o estranho fica sem router. Ficheiros: ' + nomes.join(', '),
  );

  // ── S2 · O UTILIZADOR CONSEGUE APONTAR O REPO ───────────────────────────
  // Sem `user_config`, MOOTER_REPO/VAULT/OLLAMA_HOST eram inatingíveis: não
  // havia sequer onde escrever a variável.
  const manifest = JSON.parse(fs.readFileSync(path.join(instalacao, 'manifest.json'), 'utf8'));
  assert.ok(manifest.user_config, 'REGRESSÃO: manifest sem user_config — o estranho não tem onde apontar o repo');

  // ── S3 · A MONTRA NÃO AFIRMA NÚMEROS QUE NÃO MEDIMOS ────────────────────
  const montra = String(manifest.long_description || '') + ' ' + String(manifest.description || '');
  assert.ok(
    !/<\s*50\s*ms/i.test(montra),
    'REGRESSÃO: o manifest volta a afirmar "<50ms". Ou se mede (classify_ms) ou não se diz.',
  );
  assert.ok(!/\bdora\b/i.test(montra), 'REGRESSÃO: o manifest afirma DoRA, que não existe no produto');

  // ── Jornada estéril ─────────────────────────────────────────────────────
  // S7/S8 juntam-se aqui de propósito: o diagnóstico e o radar são as duas
  // primeiras coisas que um estranho toca, e têm de correr no MESMO arranque
  // estéril que já provava o resto. Um segundo teste com outro HOME provaria
  // menos, não mais.
  const t0 = process.hrtime.bigint();
  const { porId } = await jornada(instalacao, homeVazio, projecto, [
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mooter_work', arguments: {
      goal: 'Explica o que faz o app.js', worktree: projecto, write: false, prepare: false,
    } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'mooter_setup', arguments: { primeira_vez: true } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'mooter_setup', arguments: { radar: projecto } } },
  ]);
  const jornadaMs = Number((process.hrtime.bigint() - t0) / 1000000n);

  // ── S4 · ARRANCA SEM npm install E EXPÕE AS 6 PORTAS ────────────────────
  const lista = porId.get(2);
  assert.ok(lista && lista.result, 'o servidor não respondeu a tools/list num ambiente estéril');
  const tools = (lista.result.tools || []).map((x) => x.name);
  assert.strictEqual(tools.length, 6, 'as 6 portas públicas mudaram sem aviso: ' + tools.join(', '));

  const work = porId.get(3);
  assert.ok(work && work.result, 'mooter_work não respondeu');
  const w = work.result.structuredContent || {};

  // ── S5 · O ROUTER NUNCA DEGRADA EM SILÊNCIO ─────────────────────────────
  // Este é o coração do teste. O produto diz `n/d` + `porque` em todo o lado
  // menos aqui — e aqui é o núcleo de valor.
  assert.ok(w.router, 'REGRESSÃO: mooter_work não devolve o estado do router');
  assert.ok(
    w.router.disponivel === true || w.router.disponivel === false || w.router.disponivel === null,
    'router.disponivel tem de ser true|false|null (n/d), nunca ausente',
  );
  assert.ok(w.router.porque, 'router sem `porque` — a doutrina do projecto obriga a razão');
  if (w.router.disponivel === true) {
    assert.ok(
      typeof w.router.classify_ms === 'number' && w.router.classify_ms >= 0,
      'router disponível tem de trazer classify_ms MEDIDO, não afirmado',
    );
  } else {
    assert.ok(
      /router/i.test(String(w.resumo || '')) || /sem router/i.test(String(w.resumo || '')),
      'REGRESSÃO: o router não correu e o resumo não o diz. Resumo: ' + w.resumo,
    );
  }

  // ── S6 · NENHUM CAMINHO EFECTIVO TEM O NOME DAS PASTAS DO AUTOR ─────────
  const usados = [w.worktree_usada, w.worktree_pedida, w.router && w.router.caminho].filter(Boolean).join(' ');
  assert.ok(
    !/paulo-vault|Paulo Loureiro/i.test(usados),
    'REGRESSÃO: um caminho do autor chegou ao output de um estranho: ' + usados,
  );

  // ── S7 · O DIAGNÓSTICO NÃO DÁ VERDE A UMA MÁQUINA QUE VAI FALHAR ────────
  // A auditoria de onboarding (`_handoff/SUPERMASTER_MAC_MINI.md:100-111`) mediu
  // o oposto: 6 verdes e o primeiro job a falhar com "git not found". Aqui o
  // veredicto que conta é `pronto_para_trabalhar`, e cada vermelho tem de
  // ensinar a consertar-se — um vermelho mudo é o mesmo que silêncio.
  const diag = porId.get(4);
  assert.ok(diag && diag.result, 'mooter_setup({primeira_vez}) não respondeu num ambiente estéril');
  const d = diag.result.structuredContent || {};
  assert.ok(Array.isArray(d.diagnostico) && d.diagnostico.length >= 9,
    'REGRESSÃO: o diagnóstico encolheu abaixo das 9 linhas — os gaps 1/4/5 voltaram a ser invisíveis');
  assert.strictEqual(typeof d.pronto_para_trabalhar, 'boolean',
    'REGRESSÃO: sem `pronto_para_trabalhar`, o estranho volta a ler cores em vez de um veredicto');
  for (const linha of d.diagnostico) {
    if (!linha.ok) assert.ok(linha.detalhe && String(linha.detalhe).trim(),
      'linha vermelha muda: ' + linha.item + ' — um vermelho sem conserto não ajuda ninguém');
  }
  for (const p of (d.proximos_passos || [])) {
    assert.ok(p.comando, 'próximo passo sem comando: ' + p.o_que);
  }
  // Numa máquina estéril há sempre algo a dizer. Zero passos = o diagnóstico
  // voltou a ser decorativo.
  assert.ok((d.proximos_passos || []).length > 0,
    'REGRESSÃO: ambiente estéril (sem Ollama, sem vault, sem repo) e nenhum próximo passo proposto');

  // ── S8 · O RADAR CORRE NO REPO DO ESTRANHO E NÃO LHE TOCA ───────────────
  // É o momento-aha: a primeira coisa que devolve algo sobre o trabalho DELE.
  const rad = porId.get(5);
  assert.ok(rad && rad.result, 'mooter_setup({radar}) não respondeu');
  const rr = rad.result.structuredContent || {};
  assert.strictEqual(rr.ok, true, 'o radar não correu no repo do estranho: ' + JSON.stringify(rr).slice(0, 200));
  assert.strictEqual(rr.escreveu, false, 'REGRESSÃO: o radar deixou de declarar que não escreve');
  assert.ok(rr.pilares && rr.pilares.length === 6, 'o radar tem de devolver os 6 pilares');
  assert.ok(!/paulo-vault|Paulo Loureiro/i.test(JSON.stringify(rr)),
    'REGRESSÃO: um caminho do autor apareceu no radar de um estranho');

  // ── S9 · O TEMPO ATÉ AO PRIMEIRO RESULTADO ─────────────────────────────
  // Não é o TTFW do humano (esse inclui download, formulário e restart do
  // Claude Desktop, e não se mede daqui). É o tecto mecânico: o que o produto
  // demora depois de instalado. Se ISTO estourar, o TTFW humano nunca cabe.
  assert.ok(jornadaMs < 10 * 60 * 1000,
    'a jornada estéril demorou ' + jornadaMs + ' ms — acima do tecto de 10 min do DoD de onboarding');
  t.diagnostic('jornada estéril (tools/list + work + diagnóstico + radar): ' + jornadaMs + ' ms');
  t.diagnostic('diagnóstico: ' + d.diagnostico.filter((l) => l.ok).length + '/' + d.diagnostico.length
    + ' verde · pronto_para_trabalhar=' + d.pronto_para_trabalhar
    + ' · passos=' + (d.proximos_passos || []).length);
  t.diagnostic('radar: ' + rr.pontuacao.presentes + '/' + rr.pontuacao.total_pilares + ' pilares');
  t.diagnostic('router: ' + JSON.stringify(w.router));
});

test('estranho — o titular nunca diz "feito" quando algo falhou', () => {
  // Regressão medida em 2026-07-28: um job com exit_code:1 e
  // "Not logged in · Please run /login" apareceu como "🐮 feito", com
  // done:0 / failed:1 logo por baixo. O corpo estava certo; a única linha que
  // um humano lê de certeza estava errada. Mesma família do "faltam 0 s".
  const seam = require('./seamless.js');
  const fonte = fs.readFileSync(path.join(HERE, 'seamless.js'), 'utf8');

  assert.ok(
    /resumoHonesto/.test(fonte),
    'REGRESSÃO: toolAwait voltou a não construir um resumo — o wrapper vai pôr "🐮 feito" por omissão',
  );
  assert.ok(typeof seam.estadoDoRouter === 'function', 'estadoDoRouter tem de ser exportado para o painel o poder mostrar');

  const semTentativa = seam.estadoDoRouter();
  assert.ok(
    semTentativa.disponivel === null || typeof semTentativa.disponivel === 'boolean',
    'estadoDoRouter tem de abster-se (null) antes de haver tentativa, nunca afirmar false',
  );
  assert.ok(semTentativa.porque, 'estadoDoRouter sem `porque`');
});
