'use strict';
/**
 * dono.test.js — a prova de que a atribuição porta→pasta distingue os casos.
 *
 * ⚠️ CADA TESTE AQUI FALHA CONTRA A VERSÃO ANTERIOR DO CÓDIGO. Um teste que
 * passa em todo o lado não testa nada — foi a lição de 08-04 e não se repete.
 * Antes de acreditar num verde, apaga a função que ele cobre e confirma que
 * fica vermelho.
 *
 * O cenário que a suite antiga NUNCA cobria (achado do codex, 08-04): mais do
 * que um servidor vivo ao mesmo tempo. É por isso que todos os defeitos desta
 * família ficavam verdes enquanto o utilizador via a app errada.
 */

const assert = require('assert');
const d = require('./dono.js');

let passou = 0, falhou = 0;
function teste(nome, fn) {
  try { fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHA ' + nome + '\n       ' + e.message); }
}
async function testeAsync(nome, fn) {
  try { await fn(); passou++; console.log('  ok   ' + nome); }
  catch (e) { falhou++; console.log('  FALHA ' + nome + '\n       ' + e.message); }
}

const RAIZ = 'C:/Users/Paulo Loureiro';
const PASTAS = [RAIZ + '/frugal', RAIZ + '/frugal-site', RAIZ + '/frugal-lp-vis'];

console.log('\ndono.js — atribuição de porta a pasta\n');

/* ─────────────── a fronteira de caminho ─────────────── */

teste('D1 · frugal-site NÃO é considerado parte de frugal (o prefixo que engana)', () => {
  assert.strictEqual(d.contido(RAIZ + '/frugal-site/node_modules', RAIZ + '/frugal'), false,
    'startsWith cru atribuiria metade das 47 pastas à principal');
  assert.strictEqual(d.contido(RAIZ + '/frugal/packages/x.js', RAIZ + '/frugal'), true);
  assert.strictEqual(d.contido(RAIZ + '/frugal', RAIZ + '/frugal'), true, 'a própria pasta conta');
});

teste('D2 · vence a pasta MAIS LONGA quando duas encaixam', () => {
  const caminhos = [RAIZ + '/frugal-site/node_modules/.bin/vite'];
  assert.strictEqual(d.pastaDosCaminhos(caminhos, [RAIZ + '/frugal', RAIZ + '/frugal-site']),
    RAIZ + '/frugal-site');
});

teste('D3 · barras invertidas e maiúsculas não separam a mesma pasta', () => {
  assert.strictEqual(d.contido(RAIZ + '\\frugal\\x', RAIZ + '/frugal'), true,
    'a linha de comandos vem com \\ e a lista de worktrees com /');
  if (process.platform === 'win32') {
    assert.strictEqual(d.contido(RAIZ + '/FRUGAL/x', RAIZ + '/frugal'), true,
      'o sistema de ficheiros do Windows não distingue maiúsculas');
  } else {
    console.log('       (metade sensível a maiúsculas não corrida: só vale em win32, aqui é '
      + process.platform + ')');
  }
});

/* ─────────────── extrair caminhos da linha de comandos ─────────────── */

teste('D4 · apanha o caminho absoluto dentro de uma linha de comandos com aspas', () => {
  const linha = '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Paulo Loureiro\\frugal-site\\node_modules\\vite\\bin\\vite.js" --port 5173';
  const c = d.caminhosDaLinha(linha);
  assert.strictEqual(c.length, 2, 'o node.exe e o vite.js são dois caminhos: ' + JSON.stringify(c));
  assert.ok(c.some((x) => /frugal-site[\\/]node_modules[\\/]vite/.test(x)),
    'caminhos: ' + JSON.stringify(c));
  assert.strictEqual(d.pastaDosCaminhos(c, PASTAS), RAIZ + '/frugal-site',
    'e a pasta que ganha é a do vite, não a do Program Files');
});

teste('D5 · linha sem caminho absoluto nenhum não inventa pasta', () => {
  assert.strictEqual(d.pastaDosCaminhos(d.caminhosDaLinha('node server.js'), PASTAS), null);
  assert.strictEqual(d.pastaDosCaminhos(d.caminhosDaLinha(null), PASTAS), null);
});

/* ─────────────── o parser do netstat ─────────────── */

const NETSTAT_PT = [
  'Ligações activas',
  '',
  '  Proto  Endereço local         Endereço externo       Estado           PID',
  '  TCP    0.0.0.0:5173           0.0.0.0:0              À ESCUTA         4412',
  '  TCP    [::]:3000              [::]:0                 À ESCUTA         7788',
  '  TCP    127.0.0.1:52341        127.0.0.1:5173         ESTABELECIDA     9900',
].join('\r\n');

teste('D6 · o parser funciona num Windows em português (não procura "LISTENING")', () => {
  const m = d.pidsDoNetstat(NETSTAT_PT);
  assert.strictEqual(m.get(5173), 4412, 'listener IPv4 com estado traduzido');
  assert.strictEqual(m.get(3000), 7788, 'listener IPv6 com estado traduzido');
});

teste('D7 · uma ligação ESTABELECIDA não é um listener e não entra', () => {
  const m = d.pidsDoNetstat(NETSTAT_PT);
  assert.strictEqual(m.has(52341), false, 'a porta efémera do cliente não é um servidor');
});

/* ─────────────── a atribuição de ponta a ponta ─────────────── */

function execFalso(respostas) {
  return async (comando, args) => {
    if (/netstat/i.test(comando)) return { ok: true, erro: null, saida: respostas.netstat };
    if (/powershell/i.test(comando)) {
      if (respostas.psErro) return { ok: false, erro: respostas.psErro, saida: '' };
      return { ok: true, erro: null, saida: respostas.ps };
    }
    return { ok: false, erro: 'comando inesperado: ' + comando + ' ' + JSON.stringify(args), saida: '' };
  };
}

const PS_DUAS_PASTAS = JSON.stringify([
  { ProcessId: 4412, ParentProcessId: 1, Name: 'node.exe',
    CommandLine: 'node "C:\\Users\\Paulo Loureiro\\frugal\\node_modules\\vite\\bin\\vite.js"' },
  { ProcessId: 7788, ParentProcessId: 1, Name: 'node.exe',
    CommandLine: 'node "C:\\Users\\Paulo Loureiro\\frugal-site\\node_modules\\next\\dist\\bin\\next"' },
]);

(async () => {
  await testeAsync('D8 · DOIS servidores vivos, cada um atribuído à sua pasta', async () => {
    const r = await d.donosDasPortas([5173, 3000], {
      plataforma: 'win32', pastas: PASTAS,
      execImpl: execFalso({ netstat: NETSTAT_PT, ps: PS_DUAS_PASTAS }),
    });
    assert.strictEqual(r.porPorta.get(5173).pasta, RAIZ + '/frugal');
    assert.strictEqual(r.porPorta.get(3000).pasta, RAIZ + '/frugal-site');
    assert.strictEqual(r.porque, null, 'medição completa não tem motivo de falha');
  });

  await testeAsync('D9 · minha=true só para a pasta desta sessão; a irmã dá false, não null', async () => {
    const r = await d.donosDasPortas([5173, 3000], {
      plataforma: 'win32', pastas: PASTAS,
      execImpl: execFalso({ netstat: NETSTAT_PT, ps: PS_DUAS_PASTAS }),
    });
    assert.strictEqual(d.eMinha(r.porPorta.get(5173), RAIZ + '/frugal'), true);
    assert.strictEqual(d.eMinha(r.porPorta.get(3000), RAIZ + '/frugal'), false,
      'a app da pasta irmã tem de ser MEDIDA como não minha');
  });

  await testeAsync('D10 · sem pasta medida, minha é null — nunca false por omissão', async () => {
    const ps = JSON.stringify([{ ProcessId: 4412, ParentProcessId: 1, Name: 'node.exe', CommandLine: 'node server.js' }]);
    const r = await d.donosDasPortas([5173], {
      plataforma: 'win32', pastas: PASTAS, execImpl: execFalso({ netstat: NETSTAT_PT, ps }),
    });
    const dono = r.porPorta.get(5173);
    assert.strictEqual(dono.pasta, null);
    assert.strictEqual(d.eMinha(dono, RAIZ + '/frugal'), null, 'n/d nunca se lê como "não é tua"');
    assert.match(dono.porque, /linha de comandos/, 'e diz porque não soube: ' + dono.porque);
    assert.strictEqual(dono.pid, 4412, 'o PID foi medido mesmo sem pasta — não se apaga o que se sabe');
  });

  await testeAsync('D11 · sobe ao processo pai quando o filho não cita caminho', async () => {
    const ps = JSON.stringify([
      { ProcessId: 4412, ParentProcessId: 300, Name: 'node.exe', CommandLine: 'node' },
      { ProcessId: 300, ParentProcessId: 1, Name: 'cmd.exe',
        CommandLine: 'cmd /c "C:\\Users\\Paulo Loureiro\\frugal-lp-vis\\node_modules\\.bin\\vite"' },
    ]);
    const r = await d.donosDasPortas([5173], {
      plataforma: 'win32', pastas: PASTAS, execImpl: execFalso({ netstat: NETSTAT_PT, ps }),
    });
    const dono = r.porPorta.get(5173);
    assert.strictEqual(dono.pasta, RAIZ + '/frugal-lp-vis');
    assert.match(dono.base, /ascendente/, 'a proveniência tem de dizer que veio do pai: ' + dono.base);
  });

  await testeAsync('D12 · Win32_Process em baixo: o PID sobrevive e o motivo é explícito', async () => {
    const r = await d.donosDasPortas([5173], {
      plataforma: 'win32', pastas: PASTAS,
      execImpl: execFalso({ netstat: NETSTAT_PT, psErro: 'powershell não encontrado' }),
    });
    const dono = r.porPorta.get(5173);
    assert.strictEqual(dono.pid, 4412);
    assert.strictEqual(dono.pasta, null);
    assert.match(r.porque, /Win32_Process/);
    assert.strictEqual(r.base, 'netstat', 'a base declara o que se conseguiu medir, não o que se queria');
  });

  await testeAsync('D13 · fora do Windows recusa-se por escrito, não devolve zeros', async () => {
    const r = await d.donosDasPortas([5173], { plataforma: 'linux', pastas: PASTAS });
    assert.match(r.porque, /Windows/);
    assert.strictEqual(r.porPorta.get(5173).pasta, null);
    assert.strictEqual(r.porPorta.get(5173).porque, r.porque, 'o motivo desce até ao item');
  });

  await testeAsync('D14 · porta sem processo em escuta: motivo nomeia a porta', async () => {
    const r = await d.donosDasPortas([9999], {
      plataforma: 'win32', pastas: PASTAS, execImpl: execFalso({ netstat: NETSTAT_PT, ps: '[]' }),
    });
    assert.match(r.porPorta.get(9999).porque, /9999/);
  });

  console.log('\n' + passou + ' passou · ' + falhou + ' falhou\n');
  process.exit(falhou ? 1 : 0);
})();
