/**
 * moo-visual-audit.test.mjs — o teste de mordida do auditor visual.
 *
 * Um auditor que nunca acusou nada é indistinguível de um `echo ok`. Este teste
 * planta, numa prancha sintética, um defeito de cada família que o auditor diz
 * medir — corte, overflow horizontal, contraste abaixo de AA, raio fora da
 * escala, easing fora da família, barra à esquerda, caixa arredondada — e exige
 * que ele os apanhe TODOS. Ao lado de cada defeito planta o controlo legítimo
 * correspondente (raio 12, easing da família, texto com contraste bom) e exige
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
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const AUDITOR = join(AQUI, 'moo-visual-audit.mjs');
const TEM_PW = existsSync(join(AQUI, 'node_modules', 'playwright'));

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

  /* DEFEITO · raio 13 não está na escala declarada (…12,14,16,999) */
  .raio-mau { border-radius:13px; width:200px; height:80px; background:#dddddd; }
  /* CONTROLO · raio 12 está na escala */
  .raio-bom { border-radius:12px; width:200px; height:80px; background:#dddddd; }

  /* DEFEITO · easing fora da família declarada */
  .easing-mau { transition: opacity 300ms cubic-bezier(0.9, 0.1, 0.9, 0.1); width:50px; height:50px; background:#ccc; }
  /* CONTROLO · a primeira curva da família */
  .easing-bom { transition: opacity 300ms cubic-bezier(0.16, 1, 0.3, 1); width:50px; height:50px; background:#ccc; }

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
  .ok { color:#111111; background:#ffffff; font-size:14px; border-radius:12px;
        width:200px; height:80px; transition: opacity 300ms cubic-bezier(0.16, 1, 0.3, 1); }
</style>
<div class="ok">texto legivel numa caixa legitima</div>`;

function correr(pranchas) {
  const dir = mkdtempSync(join(tmpdir(), 'moo-audit-'));
  for (const [nome, html] of Object.entries(pranchas)) writeFileSync(join(dir, nome), html);
  writeFileSync(join(dir, 'canvas.json'), JSON.stringify({
    artboards: Object.keys(pranchas).map(f => ({
      name: f.replace('.html',''), page: 'teste', file: f, w: 1200, h: H,
    })),
  }));
  const saida = execFileSync(process.execPath, [AUDITOR, join(dir, 'canvas.json')],
    { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  const json = JSON.parse(readFileSync(join(dir, '.visual-audit.json'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  return { json, saida };
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
  assert.ok(r.raiBad.includes(13), `raiBad devia conter 13, contém ${JSON.stringify(r.raiBad)}`);

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
  assert.ok(!r.raiBad.includes(12), 'o raio 12 está na escala declarada e não pode ser acusado');
  assert.ok(!r.easBad.includes('cubic-bezier(0.16, 1, 0.3, 1)'),
    'a curva da família não pode ser acusada');
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
