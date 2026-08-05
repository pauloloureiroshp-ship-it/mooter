'use strict';
/**
 * lp-veredicto.js — ler do snapshot GERADO o que o Live Preview concluiu.
 *
 * ⚠️ Lê o ficheiro, não a memória de quem o gerou. Um gerador a dar-se a si
 * próprio como aprovado não é prova — a única fonte que conta é o que ficou
 * escrito no HTML que vai para o painel.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const ALVO = path.join(REPO, 'dist', 'cockpit-snapshot.html');

try {
  const html = fs.readFileSync(ALVO, 'utf8');
  const m = html.match(/window\.__MOOTER_SNAPSHOT__ = (.+?);<\/script>/s);
  if (!m) throw new Error('o snapshot não tem o bloco __MOOTER_SNAPSHOT__');
  const pv = (JSON.parse(m[1]) || {}).preview || {};
  const a = pv.atribuicao || {};
  const e = pv.escolhida || null;
  console.log('');
  console.log('  pasta desta sessao : ' + (a.pasta_sessao || 'n/d — corre mooter_setup({folder})'));
  console.log('  como foi medido    : ' + (a.base || 'n/d') + (a.porque ? ' (' + a.porque + ')' : ''));
  console.log('  estado             : ' + (a.estado || 'n/d'));
  console.log('  candidatas         : ' + (Array.isArray(pv.candidatas) ? pv.candidatas.length : 'n/d')
    + '  · desta pasta: ' + (a.minhas != null ? a.minhas : 'n/d')
    + '  · de outra: ' + (a.de_outra_pasta != null ? a.de_outra_pasta : 'n/d')
    + '  · sem dono: ' + (a.sem_dono != null ? a.sem_dono : 'n/d'));
  console.log('  vai mostrar        : ' + (e ? e.url + '  (dono: ' + (e.dono && e.dono.pasta) + ')' : 'NADA'));
  console.log('  retrato PNG        : ' + (pv.retrato && pv.retrato.ok
    ? pv.retrato.bytes + ' bytes' : 'nao — ' + ((pv.retrato && pv.retrato.erro) || 'sem candidata para capturar')));
  console.log('');
  console.log('  ' + (pv.nota || ''));
  console.log('');
  const decl = pv.portas_declaradas || [];
  if (decl.length) {
    console.log('  portas que ESTE projecto declara:');
    for (const d of decl) console.log('    ' + d.porta + '   ' + d.onde + ' -> ' + d.script);
  } else if (pv.portas_declaradas_porque) {
    console.log('  portas declaradas: nenhuma — ' + pv.portas_declaradas_porque);
  }
  console.log('');
  if (a.estado === 'medida') console.log('  ==> PUBLICA. O painel vai mostrar a app desta pasta.');
  else if (a.estado === 'nenhuma_minha') console.log('  ==> ha servidores vivos, nenhum e desta pasta. Arranca o teu aqui.');
  else if (a.estado === 'nada_encontrado') console.log('  ==> nada em escuta. Arranca uma das portas declaradas acima.');
  else console.log('  ==> a sessao nao tem pasta ligada; o painel vai dizer que nao atribuiu');
} catch (erro) {
  console.log('\n  n/d — ' + ((erro && erro.message) || erro) + '\n  (o snapshot esta em: ' + ALVO + ')\n');
  process.exitCode = 1;
}
