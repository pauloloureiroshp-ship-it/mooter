/**
 * moo-visual-audit.test.mjs — o teste de mordida do auditor visual.
 *
 * Um auditor que nunca acusou nada é indistinguível de um `echo ok`. Este teste
 * planta, numa prancha sintética, um defeito de cada família que o auditor diz
 * medir — corte, overflow horizontal, contraste abaixo de AA, raio fora da
 * escala, easing fora da família, barra à esquerda, caixa arredondada — e exige
 * que ele os apanhe TODOS. Ao lado de cada defeito planta o controlo legítimo
 * correspondente (o degrau `card` do token, a curva da família, texto com
 * contraste bom) e exige
 * que esses NÃO apareçam: um portão que acusa tudo mente tanto como um que não
 * acusa nada.
 *
 * Porque isto existe: até 2026-08-27 o auditor nunca tinha corrido neste repo.
 * Estava ancorado a /home/claude/ e a /opt/pw-browsers/chromium — arrancava só
 * dentro da sandbox do canvas. Publicar os seus números sem primeiro provar que
 * ele morde seria publicar um número não verificado.
 *
 *   cd design/tools && npm install && node --test moo-visual-audit.test.mjs
 *
 * Sem playwright instalado o ficheiro salta-se a si próprio em vez de falhar —
 * a dependência vive só em design/tools/package.json, de propósito.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AUDITOR = join(AQUI, 'moo-visual-audit.mjs');
const TEM_PW = existsSync(join(AQUI, 'node_modules', 'playwright'));

/* ── O CONTROLO VEM DO TOKEN, NAO DA MEMORIA DE QUEM ESCREVEU O TESTE ───────
   Ate 2026-08-29 o controlo legitimo deste ficheiro era `border-radius: 12px`,
   com o comentario «raio 12 esta na escala». **Nunca esteve.** A escala canonica
   e 2/4/6/8/10/14/16/999 e recusa o 12 de proposito (ver `radius_nota`). O que
   fazia o teste passar era o auditor ter a SUA propria lista generosa, que
   incluia 12 — ou seja, o controlo e o instrumento estavam errados da mesma
   maneira, e concordavam. Dois numeros cravados a mao a validarem-se um ao
   outro e o modo mais silencioso de um teste nao testar nada.
   Agora o controlo sai do token. Se a escala mudar, o teste segue-a. */
const TOKENS = JSON.parse(readFileSync(join(AQUI, '..', 'tokens', 'moo-tokens.json'), 'utf8'));
const ESCALA = new Set(Object.values(TOKENS.radius).map(v => parseInt(v, 10)));
const RAIO_OK = parseInt(TOKENS.radius.card, 10);   // o degrau de cartao
const RAIO_MAU = 13;                                // afirmado fora da escala, nao assumido
const CURVA_OK = TOKENS.motion.entrada.curve;       // `.16,1,.3,1` — grafia do TOKEN, nao do browser

// Altura declarada da prancha. O conteúdo abaixo passa dela de propósito.
const H = 400;

const PRANCHA = `<!doctype html><meta charset="utf-8"><title>mordida</title>
<style>
  body { margin:0; background:#ffffff; font-family:sans-serif; }

  /* DEFEITO · contraste — #999 sobre #fff dá ~2,85:1, abaixo do mínimo de 4,5 */
  .contraste-mau { color:#999999; background:#ffffff; font-size:14px; }
  /* CONTROLO · #111 sobre #fff dá ~18,9:1 — não pode aparecer na lista */
  .contraste-bom { color:#111111; background:#ffffff; font-size:14px; }

  /* DEFEITO · overflow horizontal */
  .larga { width:2400px; height:20px; background:#eeeeee; }

  /* DEFEITO · um raio que o token NAO declara */
  .raio-mau { border-radius:${RAIO_MAU}px; width:200px; height:80px; background:#dddddd; }
  /* CONTROLO · o degrau card da escala, lido do token */
  .raio-bom { border-radius:${RAIO_OK}px; width:200px; height:80px; background:#dddddd; }

  /* DEFEITO · easing fora da família declarada */
  .easing-mau { transition: opacity 300ms cubic-bezier(0.9, 0.1, 0.9, 0.1); width:50px; height:50px; background:#ccc; }
  /* CONTROLO · a primeira curva da família */
  .easing-bom { transition: opacity 300ms ${CURVA_OK}; width:50px; height:50px; background:#ccc; }

  /* DEFEITO · barra à esquerda (borda >= 3px + fundo + altura > 40) */
  .barra { border-left:4px solid #333333; background:#f2f2f2; height:60px; width:300px; }

  /* enche a prancha para lá da altura declarada — é isto que produz o corte */
  .alto { height:${H * 2}px; }
</style>
<div class="contraste-mau">contraste plantado abaixo de AA</div>
<div class="contraste-bom">contraste legitimo acima de AA</div>
<div class="larga"></div>
<div class="raio-mau">caixa com raio fora da escala</div>
<div class="raio-bom">caixa com raio dentro da escala</div>
<div class="easing-mau"></div>
<div class="easing-bom"></div>
<div class="barra">barra plantada</div>
<div class="alto"></div>`;

// Uma prancha limpa: nada plantado. Serve para provar que o auditor não acusa por acusar.
const LIMPA = `<!doctype html><meta charset="utf-8"><title>limpa</title>
<style>
  body { margin:0; background:#ffffff; font-family:sans-serif; }
  .ok { color:#111111; background:#ffffff; font-size:14px; border-radius:${RAIO_OK}px;
        width:200px; height:80px; transition: opacity 300ms ${CURVA_OK}; }
</style>
<div class="ok">texto legivel numa caixa legitima</div>`;

/* `correr` ganha um 3.º parâmetro: mapa `ficheiro -> temas[]` (e opcionalmente
   `{temas, temaND}`). As chamadas antigas não o passam, portanto os canvases
   sintéticos continuam SEM o campo — que é a forma de a retro-compatibilidade
   ser verificada pela suite em vez de prometida no comentário. */
function correr(pranchas, env = {}, temaPorFicheiro = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'moo-audit-'));
  for (const [nome, html] of Object.entries(pranchas)) writeFileSync(join(dir, nome), html);
  writeFileSync(join(dir, 'canvas.json'), JSON.stringify({
    artboards: Object.keys(pranchas).map((f) => {
      const t = temaPorFicheiro[f];
      const extra = Array.isArray(t) ? { temas: t } : (t ?? {});
      return { name: f.replace('.html',''), page: 'teste', file: f, w: 1200, h: H, ...extra };
    }),
  }));
  let saida = '', status = 0, err = '';
  try {
    saida = execFileSync(process.execPath, [AUDITOR, join(dir, 'canvas.json')],
      { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, ...env } });
  } catch (e) { status = e.status; saida = e.stdout ?? ''; err = String(e.stderr ?? ''); }
  let json = [];
  try { json = JSON.parse(readFileSync(join(dir, '.visual-audit.json'), 'utf8')); } catch { /* pode nao existir */ }
  rmSync(dir, { recursive: true, force: true });
  return { json, saida, status, err };
}

/* `find` devolve a PRIMEIRA linha que casa. Com uma linha por (prancha, tema),
   um `find` só pelo nome devolveria o claro e ficava verde sem nunca ter olhado
   para o escuro — que é o defeito que este trabalho existe para matar,
   reencarnado dentro do próprio teste. Este localizador recusa-se a escolher. */
function acha(json, prancha, tema = null) {
  const m = json.filter((x) => x.prancha === prancha && (tema === null || x.tema === tema));
  if (m.length > 1) throw new Error(
    `localizador ambíguo: "${prancha}" deu ${m.length} linhas (${m.map((x) => x.tema).join(', ')}) — nomeia o tema`);
  return m[0];
}

test('o auditor recusa-se a inventar quando o canvas não existe', () => {
  let erro = null;
  try {
    execFileSync(process.execPath, [AUDITOR, join(tmpdir(), 'canvas-que-nao-existe.json')],
      { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  } catch (e) { erro = e; }
  assert.ok(erro, 'devia ter saído com erro, não com um relatório vazio');
  assert.equal(erro.status, 2);
  assert.match(String(erro.stderr), /canvas não encontrado/);
});

test('morde: apanha os sete defeitos plantados', { skip: !TEM_PW && 'playwright não instalado (cd design/tools && npm install)' }, () => {
  const { json } = correr({ 'mordida.html': PRANCHA });
  const r = json.find(x => x.prancha === 'mordida');
  assert.ok(r, 'a prancha plantada devia ter sido medida');

  // 1 · corte — a prancha declara 400px de altura e o conteúdo passa disso
  assert.ok(r.corte > 0, `corte devia ser > 0, foi ${r.corte}`);

  // 2 · overflow horizontal — o .larga tem 2400px num viewport de 1200
  assert.ok(r.overflowX > 0, `overflowX devia ser > 0, foi ${r.overflowX}`);

  // 3 · contraste — o #999 sobre #fff tem de aparecer
  const mau = r.contrasteNovo.find(c => c.txt.includes('contraste plantado'));
  assert.ok(mau, 'o texto com contraste plantado devia estar na lista');
  assert.ok(mau.r < 4.5, `o rácio medido devia ser < 4.5, foi ${mau.r}`);

  // 4 · raio fora da escala
  assert.ok(r.raiBad.includes(RAIO_MAU), `raiBad devia conter ${RAIO_MAU}, contém ${JSON.stringify(r.raiBad)}`);

  // 5 · easing fora da família
  assert.ok(r.easBad.some(e => e.includes('0.9')),
    `easBad devia conter a curva plantada, contém ${JSON.stringify(r.easBad)}`);

  // 6 · barra à esquerda
  assert.ok(r.barras >= 1, `barras devia ser >= 1, foi ${r.barras}`);

  // 7 · caixa arredondada (raio >= 8, > 60px de altura, > 120px de largura, com fundo)
  assert.ok(r.caixas >= 1, `caixas devia ser >= 1, foi ${r.caixas}`);
});

test('não acusa por acusar: os controlos legítimos ficam de fora', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json } = correr({ 'mordida.html': PRANCHA });
  const r = json.find(x => x.prancha === 'mordida');

  assert.ok(!r.contrasteNovo.some(c => c.txt.includes('contraste legitimo')),
    'o texto com contraste bom não pode aparecer na lista de falhas');
  assert.ok(!r.raiBad.includes(RAIO_OK), `o raio ${RAIO_OK} está na escala declarada e não pode ser acusado`);
  /* A curva de controlo entra na prancha com a grafia do TOKEN — `.16,1,.3,1` — e
     o browser devolve-a com zero à esquerda e espaços. Se a normalização não
     reconciliasse as duas, derivar do token trocava uma lista desactualizada por
     um alarme permanente, que é pior. Por isso a asserção é sobre a curva
     NORMALIZADA e não sobre a string: é a normalização que está a ser testada.
     (A prancha planta também uma curva má de propósito, portanto `easBad` não
     pode ser vazio — o que não pode é conter ESTA.) */
  const norm = (c) => String(c).trim().replace(/\s/g, '').replace(/(^|\(|,)0\./g, '$1.');
  assert.ok(!r.easBad.some((e) => norm(e) === norm(CURVA_OK)),
    `a curva da família (${CURVA_OK}) foi acusada: ${JSON.stringify(r.easBad)}`);
});

test('uma prancha limpa mede zero em todas as famílias', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json } = correr({ 'limpa.html': LIMPA });
  const r = json.find(x => x.prancha === 'limpa');
  assert.ok(r, 'a prancha limpa devia ter sido medida');
  assert.equal(r.overflowX, 0);
  assert.equal(r.contrasteNovo.length, 0, JSON.stringify(r.contrasteNovo));
  assert.deepEqual(r.easBad, []);
  assert.deepEqual(r.raiBad, []);
  assert.equal(r.barras, 0);
  assert.ok(r.corte <= 0, `uma prancha que cabe não tem corte, teve ${r.corte}`);
});

test('a excepção declarada tira do "novo" sem apagar a contagem', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  // A lista DECLARADO existe para não obrigar a mentir sobre valores de produção já
  // conhecidos. O risco é o oposto: declarar e desaparecer com o número. Este teste
  // exige que o declarado continue contado à parte.
  const { json } = correr({ 'mordida.html': PRANCHA });
  const r = json.find(x => x.prancha === 'mordida');
  assert.equal(r.contraste.length, r.contrasteNovo.length + r.contrasteDeclarado,
    'todo achado tem de estar em exactamente um dos dois lados');
});

test('a saída em JSON existe e é lista de pranchas', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json } = correr({ 'limpa.html': LIMPA });
  assert.ok(Array.isArray(json));
  assert.equal(json.length, 1);
  for (const k of ['prancha','ficheiro','corte','overflowX','contraste','base8','easings','raios','caixas','barras'])
    assert.ok(k in json[0], `falta a chave ${k} no relatório`);
});

/* ─────────────────────────────────────────────────────────────────────────────
   A ESCALA DERIVA MESMO? — as três mordidas que separam derivar de acertar

   A 2026-08-29 estas duas listas deixaram de ser escritas à mão neste ficheiro e
   passaram a sair de `design/tokens/moo-tokens.json`. Um diff que troca quinze
   números por um `Object.values(...)` parece obviamente certo e pode estar
   obviamente errado: basta a normalização falhar, ou o caminho resolver para
   outro sítio, e o auditor passa a acusar tudo — ou nada.

   A única prova é MUDAR A ESCALA e exigir que o veredicto mude com ela. Se estes
   testes passassem com a lista antiga cravada, não estariam a testar nada. */

test('a ESCALA vem do token: tirar um degrau torna-o uma violação', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const alvo = `<!doctype html><meta charset="utf-8"><title>escala</title>
<style>.c { border-radius:${RAIO_OK}px; width:200px; height:80px; background:#ddd; }</style>
<div class="c">caixa no degrau card</div>`;

  const comEscalaReal = correr({ 'escala.html': alvo }).json.find((x) => x.prancha === 'escala');
  assert.ok(!comEscalaReal.raiBad.includes(RAIO_OK),
    `${RAIO_OK} está na escala e foi acusado: ${JSON.stringify(comEscalaReal.raiBad)}`);

  // A MESMA prancha, contra uma escala a que se tirou exactamente esse degrau.
  const mutilado = JSON.parse(JSON.stringify(TOKENS));
  delete mutilado.radius.card;
  const semCard = join(mkdtempSync(join(tmpdir(), 'moo-tok-')), 'moo-tokens.json');
  writeFileSync(semCard, JSON.stringify(mutilado));

  const comEscalaMutilada = correr({ 'escala.html': alvo }, { MOO_TOKENS: semCard })
    .json.find((x) => x.prancha === 'escala');
  assert.ok(comEscalaMutilada.raiBad.includes(RAIO_OK),
    `tirei o degrau card do token e o auditor continuou a aceitar ${RAIO_OK} — ` +
    `a escala não está a derivar, está cravada algures: ${JSON.stringify(comEscalaMutilada.raiBad)}`);
});

test('a FAMÍLIA vem do token: tirar uma curva torna-a uma violação', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const alvo = `<!doctype html><meta charset="utf-8"><title>curva</title>
<style>.c { width:50px; height:50px; background:#ccc; transition: opacity 300ms ${CURVA_OK}; }</style>
<div class="c"></div>`;

  const comFamiliaReal = correr({ 'curva.html': alvo }).json.find((x) => x.prancha === 'curva');
  assert.deepEqual(comFamiliaReal.easBad, [],
    `a curva da família foi acusada — falha de normalização: ${JSON.stringify(comFamiliaReal.easBad)}`);

  const mutilado = JSON.parse(JSON.stringify(TOKENS));
  mutilado.motion.entrada.curve = 'cubic-bezier(.1,.1,.1,.1)';
  const semEntrada = join(mkdtempSync(join(tmpdir(), 'moo-tok-')), 'moo-tokens.json');
  writeFileSync(semEntrada, JSON.stringify(mutilado));

  const comFamiliaMutilada = correr({ 'curva.html': alvo }, { MOO_TOKENS: semEntrada })
    .json.find((x) => x.prancha === 'curva');
  assert.ok(comFamiliaMutilada.easBad.length > 0,
    'troquei a curva de entrada no token e o auditor continuou a aceitar a antiga — a família não está a derivar');
});

test('o defeito plantado está mesmo fora da escala, e o controlo dentro', () => {
  // Guarda contra o silêncio: se alguém acrescentar o 13 à escala, a prancha de
  // mordida deixa de plantar um defeito e o teste principal passa a verde sem
  // medir nada. Foi assim que o `raio 12` sobreviveu como «controlo legítimo».
  assert.ok(!ESCALA.has(RAIO_MAU),
    `${RAIO_MAU} entrou na escala — escolhe outro valor para o defeito plantado`);
  assert.ok(ESCALA.has(RAIO_OK), `${RAIO_OK} saiu da escala — o controlo deixou de ser legítimo`);
});

/* ─────────────────────────────────────────────────────────────────────────────
   A excepção de contraste passou a ser por SUPERFÍCIE

   Eram cinco entradas a nomear pares de cores exactos, com a nota «correcção
   calculada, por aplicar». As correcções foram aplicadas — e as cinco entradas
   morreram sem ninguém dar por isso, porque uma excepção por VALOR deixa de
   coincidir no dia em que a cor muda. Verificado a 2026-08-29: apanhavam ZERO,
   e o relatório dizia «declarado 0» sem que isso significasse «nada declarado».

   Agora declara-se a folha, e só uma: o `fleet-ui.html` herda o fundo do editor
   que o embebe, portanto fora do host o auditor mede o preto do browser. Estes
   testes exigem que a excepção continue a CONTAR o que dispensou — uma excepção
   que faz o número desaparecer é a forma silenciosa de mentir. */

test('a folha sem fundo próprio é n/d — e o que foi dispensado fica CONTADO', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  // Texto que falha AA em qualquer fundo, na folha declarada.
  const mau = '<!doctype html><meta charset="utf-8"><title>fleet-ui</title>'
    + '<style>body{background:transparent}.t{color:#1f1e1b;font-size:14px}</style>'
    + '<p class="t">texto sem contraste nenhum</p>';

  const dir = mkdtempSync(join(tmpdir(), 'moo-sf-'));
  const alvo = join(dir, 'fleet-ui.html');
  writeFileSync(alvo, mau);
  writeFileSync(join(dir, 'canvas.json'), JSON.stringify({
    artboards: [{ name: 'fleet-ui', page: 'teste',
                  file: 'packages/mooter-bridge/fleet-ui.html', w: 1200, h: H }],
    base: dir,
  }));
  // O canvas aponta ao caminho DECLARADO; o ficheiro real vive na base.
  const destino = join(dir, 'packages', 'mooter-bridge');
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, 'fleet-ui.html'), mau);

  const saida = execFileSync(process.execPath, [AUDITOR, join(dir, 'canvas.json')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = JSON.parse(readFileSync(join(dir, '.visual-audit.json'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });

  const r = json.find((x) => x.prancha === 'fleet-ui');
  assert.ok(r, 'a prancha devia ter sido medida');
  assert.deepEqual(r.contrasteNovo, [], 'a folha declarada não pode produzir achados');
  assert.ok(r.contrasteDeclarado > 0,
    'o que foi dispensado tem de ficar CONTADO — senão a excepção apaga o número');
  assert.match(String(r.contrasteND), /transparent/,
    'a razão da dispensa tem de ir no relatório, não só no código');
});

test('MORDIDA · a MESMA folha, com outro caminho, volta a ser medida', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  // Sem esta metade, uma excepção larga demais (ex.: por nome de prancha) passava
  // por correcção — e o auditor deixava de medir folhas a mais, em silêncio.
  const { json } = correr({ 'outra.html':
    '<!doctype html><meta charset="utf-8"><title>outra</title>'
    + '<style>body{background:#ffffff}.t{color:#bbbbbb;font-size:14px}</style>'
    + '<p class="t">texto sem contraste nenhum</p>' });
  const r = json.find((x) => x.prancha === 'outra');
  assert.ok(r.contrasteNovo.length > 0,
    'uma folha NÃO declarada tem de continuar a ser medida');
  assert.equal(r.contrasteDeclarado, 0);
});

/* ─────────────────────────────────────────────────────────────────────────────
   TEMA POR PRANCHA — as mordidas

   O auditor renderizava cada folha UMA vez, sem forçar tema, e o default do
   playwright é claro. Medido a 2026-08-29: forçar o escuro do cockpit à mão deu
   TRÊS defeitos que ninguém tinha visto, um deles o rótulo do botão primário a
   3,12:1. Metade da superfície do produto não era auditada — e o relatório não
   dizia que não era.

   Estes testes fixam as três coisas que podem correr mal a seguir:
     · medir o tema errado (a ORDEM: atributo depois do load, media query antes);
     · dizer «dois temas» tendo medido um (a PROVA);
     · deixar o tema vazar de uma prancha para a seguinte (o `pg` é partilhado). */

const SO_ATRIBUTO = `<!doctype html><meta charset="utf-8"><title>d</title>
<style>
  body{background:#ffffff}
  .t{color:#595959;font-size:14px}
  html[data-theme="dark"] body{background:#111111}
  html[data-theme="dark"] .t{color:#3a3a3a}
</style>
<p class="t">texto</p>
<script>
  /* Réplica do applyTheme() do cockpit.html: corre durante o PARSE e apaga o
     atributo. Um addInitScript é desfeito por isto — e o auditor mediria o claro
     escrevendo «escuro» no relatório. */
  delete document.documentElement.dataset.theme;
</script>`;

const SO_MEDIA = `<!doctype html><meta charset="utf-8"><title>m</title>
<style>
  body{background:#ffffff}
  .t{color:#595959;font-size:14px}
  @media (prefers-color-scheme: dark){ body{background:#111111} .t{color:#3a3a3a} }
</style>
<p class="t">texto</p>`;

const SEM_MECANISMO = `<!doctype html><meta charset="utf-8"><title>s</title>
<style>body{background:#ffffff}.t{color:#595959;font-size:14px}</style>
<p class="t">texto</p>`;

test('MORDIDA · um defeito SÓ no escuro é apanhado — via ATRIBUTO, contra um script que o apaga', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json, status } = correr({ 'd.html': SO_ATRIBUTO }, {}, { 'd.html': ['claro', 'escuro'] });
  assert.equal(status, 0);
  assert.equal(json.length, 2, 'duas declarações de tema têm de dar duas linhas');
  assert.equal(acha(json, 'd', 'claro').contrasteNovo.length, 0, 'o claro passa');
  assert.ok(acha(json, 'd', 'escuro').contrasteNovo.length > 0,
    'o defeito do escuro escapou — o atributo terá sido escrito ANTES do load e o script apagou-o');
});

test('MORDIDA · e via MEDIA QUERY — sem esta metade, metade das folhas ficava por medir', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json } = correr({ 'm.html': SO_MEDIA }, {}, { 'm.html': ['claro', 'escuro'] });
  assert.equal(acha(json, 'm', 'claro').contrasteNovo.length, 0);
  assert.ok(acha(json, 'm', 'escuro').contrasteNovo.length > 0,
    'o emulateMedia não está a correr ANTES do goto');
});

test('MORDIDA · declarar dois temas numa folha que não muda vale exit 3', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json, status, err } = correr({ 's.html': SEM_MECANISMO }, {}, { 's.html': ['claro', 'escuro'] });
  assert.equal(status, 3, 'o relatório diria dois temas tendo medido um, e isso tem de chumbar');
  assert.match(err, /MESMA impressão/);
  assert.equal(json.length, 2, 'o JSON é escrito na mesma — a prova sobrevive ao veredicto');
  json.forEach((l) => assert.equal(l.temaAplicado, false));
});

test('«tema único» é PROVADO — e desmentido quando é mentira', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const bom = correr({ 's.html': SEM_MECANISMO }, {}, { 's.html': ['claro'] });
  assert.equal(bom.status, 0);
  assert.equal(acha(bom.json, 's').temaUnicoProvado, true);

  const mau = correr({ 'm.html': SO_MEDIA }, {}, { 'm.html': ['claro'] });
  assert.equal(mau.status, 3);
  assert.match(mau.err, /MUDA sob o modo oposto/);
  assert.equal(acha(mau.json, 'm').temaUnicoProvado, false);
});

test('MORDIDA · o tema não vaza de uma prancha para a seguinte', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  /* O `pg` é partilhado por todas as pranchas. Sem emulateMedia a correr SEMPRE,
     a folha a seguir a uma escura herdava o escuro em silêncio — o defeito mais
     fácil de introduzir e o mais difícil de ver. */
  const { json } = correr(
    { 'a.html': SO_MEDIA, 'b.html': SO_MEDIA },
    {},
    { 'a.html': ['escuro'], 'b.html': ['claro'] });
  const b = acha(json, 'b', 'claro');
  assert.match(b.impressao, /rgb\(255, 255, 255\)/, `a prancha B herdou o escuro da A: ${b.impressao}`);
});

test('`n/d` não toca no DOM — a retro-compatibilidade é verificável, não prometida', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const porJs = `<!doctype html><meta charset="utf-8"><title>j</title>
<style>body{background:#ffffff} html[data-theme="dark"] body{background:#111111}</style>
<p>texto</p><script>document.documentElement.dataset.theme='dark';</script>`;
  const { json } = correr({ 'j.html': porJs }, {}, { 'j.html': { temas: ['n/d'], temaND: 'razão declarada' } });
  const r = acha(json, 'j');
  assert.equal(r.tema, 'n/d');
  assert.equal(r.temaND, 'razão declarada');
  assert.equal(r.temaAplicado, null);
  assert.match(r.impressao, /rgb\(17, 17, 17\)/, 'o auditor mexeu no DOM de uma prancha n/d');
});

test('vocabulário fechado — e a recusa acontece ANTES do browser', () => {
  /* Sem `skip`: tem de funcionar numa máquina sem playwright, como a recusa do
     canvas em falta. Foi por não ser assim que aquele teste passou semanas a
     verde só nas máquinas com browser. */
  const mau = correr({ 'x.html': SEM_MECANISMO }, {}, { 'x.html': ['dark'] });
  assert.equal(mau.status, 2, '`dark` não é vocabulário — mediria o tema errado em silêncio');
  assert.match(mau.err, /temas.*inválido/);
  assert.match(mau.err, /x\.html/, 'a mensagem tem de nomear o ficheiro');

  const semRazao = correr({ 'x.html': SEM_MECANISMO }, {}, { 'x.html': ['n/d'] });
  assert.equal(semRazao.status, 2, '`n/d` sem `temaND` é uma exclusão silenciosa');
  assert.match(semRazao.err, /temaND/);
});

test('o localizador dos testes recusa-se a escolher entre temas', { skip: !TEM_PW && 'playwright não instalado' }, () => {
  const { json } = correr({ 'm.html': SO_MEDIA }, {}, { 'm.html': ['claro', 'escuro'] });
  assert.equal(json.length, 2);
  assert.throws(() => acha(json, 'm'), /ambíguo/,
    'um find pelo nome devolveria o claro e ficaria verde sem olhar para o escuro');
  assert.equal(acha(json, 'm', 'escuro').tema, 'escuro');
});
