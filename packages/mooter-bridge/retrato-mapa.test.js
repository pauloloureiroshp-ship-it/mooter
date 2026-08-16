'use strict';
/** Prova do instrumento: um DOM conhecido, e o mapa tem de o descrever exactamente. */
const http = require('http');
const { retratoComMapa } = require('./retrato-mapa.js');

/** Tem de bater LETRA A LETRA com retrato-mapa.js:270 — ver retrato-mapa.contrato.test.js. */
const SEM_BROWSER = 'nenhum browser aceitou abrir a porta de depuração';

const PAGINA = `<!doctype html><html><head><title>prova do mapa</title>
<style>body{margin:0;font:16px sans-serif}h1{height:80px;margin:0}
button{display:block;width:200px;height:50px}img{width:120px;height:90px}</style></head><body>
<h1 data-insp-path="C:\\Users\\Paulo Loureiro\\frugal\\landing\\app\\page.tsx:12:4:h1">Got Moo</h1>
<button data-insp-path="C:\\Users\\Paulo Loureiro\\frugal\\landing\\app\\_components\\cta.tsx:31:6:button">Install in 30s</button>
<img data-insp-path="C:\\Users\\Paulo Loureiro\\frugal\\landing\\app\\logo.tsx:5:2:img" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="logo">
<span data-insp-path="C:\\Users\\Paulo Loureiro\\frugal\\landing\\app\\page.tsx:99:1:span" style="display:block;width:1px;height:1px">minusculo</span>
<a href="/setup">Setup</a> <a href="/onboarding">Onboarding</a> <a href="https://externo.com">Fora</a>
</body></html>`;

(async () => {
  const s = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGINA); });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const porta = s.address().port;
  let mau = 0;
  const check = (nome, cond, extra) => { console.log((cond ? '  ok   ' : '  FALHA ') + nome + (cond ? '' : '  ' + (extra||''))); if(!cond) mau++; };
  try {
    const r = await retratoComMapa('http://127.0.0.1:' + porta + '/', { espera_ms: 700 });
    if (!r.ok) {
      // Um runner sem browser não é uma regressão do extractor: é uma máquina
      // que não consegue correr esta prova. Falhar aí ensina toda a gente a
      // ignorar o vermelho; passar em silêncio esconde o dia em que ele quebra
      // mesmo. Por isso salta-se — alto, com a razão e os browsers tentados —
      // e SÓ neste caso. Qualquer outra falha continua a ser falha.
      if (r.porque === SEM_BROWSER) {
        console.log('  SKIP · ' + r.porque);
        console.log('  tentados: ' + JSON.stringify(r.tentados || []));
        console.log('  (define MOOTER_REQUIRE_BROWSER=1 para exigir que esta prova corra)');
        s.close();
        process.exit(process.env.MOOTER_REQUIRE_BROWSER === '1' ? 1 : 0);
      }
      console.log('  FALHA arranque: ' + r.porque);
      process.exit(1);
    }
    console.log('\nmapa de ' + r.zonas.length + ' zona(s) · ' + r.links.length + ' link(s) · PNG ' + r.bytes + ' bytes · ' + r.ms + ' ms\n');

    const h1 = r.zonas.find(z => z.tag === 'h1');
    check('M1 · o h1 traz o ficheiro e a linha do compilador', h1 && h1.linha === 12 && /page\.tsx$/.test(h1.ficheiro), JSON.stringify(h1));
    check('M2 · o caminho de Windows nao foi partido no "C:"', h1 && h1.ficheiro.startsWith('C:\\Users'), h1 && h1.ficheiro);
    check('M3 · o botao tem geometria util para desenhar a zona', (() => { const b = r.zonas.find(z=>z.tag==='button'); return b && b.w === 200 && b.h === 50; })());
    check('M4 · o texto do elemento viaja (o painel mostra no que carregaste)', h1 && h1.texto === 'Got Moo', h1 && h1.texto);
    check('M5 · elementos de 1px sao descartados: nao ha onde carregar', !r.zonas.some(z => z.texto === 'minusculo'));
    check('M6 · as menores primeiro — o botao ganha o clique a um contentor', r.zonas.length > 1 && r.zonas[0].area <= r.zonas[r.zonas.length-1].area);
    check('M7 · so links internos: o preview nao navega para fora', r.links.length === 2 && r.links.every(l => l.href.startsWith('/')), JSON.stringify(r.links.map(l=>l.href)));
    // ⚠️ nao afirmar a largura: uma imagem PARTIDA colapsa para o tamanho do alt, e
    // isso e' decisao do browser, nao do extractor. O teste anterior media o Chromium.
    const img = r.zonas.find(z => z.tag === 'img');
    check('M8 · a imagem tambem e seleccionavel, com o ficheiro dela', img && /logo\.tsx$/.test(img.ficheiro) && img.w > 0, JSON.stringify(img));
    check('M9 · o PNG veio mesmo', typeof r.data_url === 'string' && r.data_url.startsWith('data:image/png;base64,') && r.bytes > 1000);
    check('M10 · com zonas, porque fica null (nada a explicar)', r.porque === null, r.porque);

    const vazio = await retratoComMapa('http://127.0.0.1:' + porta + '/?x', { espera_ms: 300 });
    check('M11 · a mesma rota duas vezes da o mesmo numero de zonas (deterministico)', vazio.ok && vazio.zonas.length === r.zonas.length, vazio.zonas && vazio.zonas.length);
  } finally { s.close(); }
  console.log('\n' + (mau ? mau + ' FALHA(S)' : 'tudo verde') + '\n');
  process.exit(mau ? 1 : 0);
})();
